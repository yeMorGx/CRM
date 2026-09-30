import { NextResponse } from "next/server";

import { createAdminClient, isSameOriginMutation } from "@/lib/admin-users";
import { createClient as createSessionClient } from "@/lib/supabase/server";

const stageNames: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  qualificado: "Qualificado",
  fechado: "Fechado",
};

type EventType = "lead_created" | "lead_stage_changed" | "task_created" | "task_completed" | "event_scheduled";

function validEventType(value: unknown): value is EventType {
  return value === "lead_created" || value === "lead_stage_changed" || value === "task_created" || value === "task_completed" || value === "event_scheduled";
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });

  const session = await createSessionClient();
  if (!session) return NextResponse.json({ error: "O banco ainda não está configurado." }, { status: 503 });
  const { data: auth, error: authError } = await session.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Entre novamente para continuar." }, { status: 401 });
  const { data: access } = await session.from("profiles").select("is_allowed").eq("id", auth.user.id).maybeSingle();
  if (!access?.is_allowed) return NextResponse.json({ error: "Sua conta não tem acesso ao CRM." }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "O serviço de notificações não está configurado no servidor." }, { status: 503 });

  const payload = await request.json().catch(() => null) as { type?: unknown; entityId?: unknown } | null;
  if (!validEventType(payload?.type) || typeof payload.entityId !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.entityId)) {
    return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  }

  const { data: actorProfile } = await admin.from("chat_profiles").select("full_name").eq("id", auth.user.id).maybeSingle();
  const actor = actorProfile?.full_name?.trim() || auth.user.email?.split("@")[0] || "Alguém da equipe";
  const type = payload.type;
  const entityId = payload.entityId;
  let entityType: "lead" | "task" | "calendar_event";
  let title: string;
  let body: string;
  let dedupeKey: string;

  if (type === "lead_created") {
    const { data: lead, error } = await admin.from("leads").select("id,name,source").eq("id", entityId).maybeSingle();
    if (error || !lead || lead.source !== "manual") return NextResponse.json({ error: "Não foi possível confirmar o cadastro do lead." }, { status: 409 });
    entityType = "lead";
    title = `${actor} adicionou um lead`;
    body = lead.name;
    dedupeKey = `lead-created:${lead.id}`;
  } else if (type === "lead_stage_changed") {
    const { data: lead, error } = await admin.from("leads").select("id,name,status,updated_at").eq("id", entityId).maybeSingle();
    if (error || !lead || !stageNames[lead.status]) return NextResponse.json({ error: "Não foi possível confirmar a atualização do lead." }, { status: 409 });
    entityType = "lead";
    title = `${actor} atualizou um lead`;
    body = `${lead.name} agora está em ${stageNames[lead.status]}.`;
    dedupeKey = `lead-stage:${lead.id}:${lead.status}:${lead.updated_at}`;
  } else if (type === "task_created" || type === "task_completed") {
    const { data: task, error } = await admin.from("tasks").select("id,title,done,created_by").eq("id", entityId).maybeSingle();
    if (error || !task || (type === "task_created" && task.created_by !== auth.user.id) || (type === "task_completed" && !task.done)) {
      return NextResponse.json({ error: "Não foi possível confirmar a atualização da tarefa." }, { status: 409 });
    }
    entityType = "task";
    title = type === "task_completed" ? `${actor} concluiu uma tarefa` : `${actor} adicionou uma tarefa`;
    body = task.title;
    dedupeKey = type === "task_completed" ? `task-completed:${task.id}` : `task-created:${task.id}`;
  } else {
    const { data: event, error } = await admin.from("calendar_events").select("id,title,start_at,updated_at").eq("id", entityId).maybeSingle();
    if (error || !event) return NextResponse.json({ error: "Não foi possível confirmar o compromisso." }, { status: 409 });
    entityType = "calendar_event";
    title = `${actor} agendou um compromisso`;
    body = `${event.title} · ${dateTime(event.start_at)}.`;
    dedupeKey = `event-scheduled:${event.id}:${event.updated_at}`;
  }

  const { data: recipients, error: recipientError } = await admin.from("chat_profiles").select("id").eq("is_active", true);
  if (recipientError || !recipients?.length) return NextResponse.json({ error: "Não foi possível localizar a equipe autorizada." }, { status: 503 });

  const rows = recipients.map(({ id }) => ({
    recipient_id: id,
    actor_id: auth.user.id,
    type,
    title,
    body,
    entity_type: entityType,
    entity_id: entityId,
    dedupe_key: dedupeKey,
  }));
  const { error: saveError } = await admin.from("notifications").upsert(rows, {
    onConflict: "recipient_id,dedupe_key",
    ignoreDuplicates: true,
  });
  if (saveError) {
    console.error("Shared notifications could not be saved", saveError.code ?? "unknown error");
    return NextResponse.json({ error: "Não foi possível salvar o aviso compartilhado." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
