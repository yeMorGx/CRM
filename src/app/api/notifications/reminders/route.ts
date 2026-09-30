import { NextResponse } from "next/server";

import { createAdminClient, isSameOriginMutation } from "@/lib/admin-users";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });

  const session = await createSessionClient();
  if (!session) return NextResponse.json({ error: "O banco ainda não está configurado." }, { status: 503 });
  const { data: auth, error: authError } = await session.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Entre novamente para continuar." }, { status: 401 });
  const { data: access } = await session.from("profiles").select("is_allowed").eq("id", auth.user.id).maybeSingle();
  if (!access?.is_allowed) return NextResponse.json({ error: "Sua conta não tem acesso ao CRM." }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Os lembretes não estão configurados no servidor." }, { status: 503 });

  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: events, error: eventsError } = await admin.from("calendar_events")
    .select("id,title,start_at")
    .gt("start_at", now.toISOString())
    .lte("start_at", horizon.toISOString());
  if (eventsError) return NextResponse.json({ error: "Não foi possível consultar os próximos compromissos." }, { status: 503 });
  if (!events?.length) return NextResponse.json({ ok: true, reminders: 0 });

  const { data: recipients, error: recipientError } = await admin.from("chat_profiles").select("id").eq("is_active", true);
  if (recipientError || !recipients?.length) return NextResponse.json({ error: "Não foi possível localizar a equipe autorizada." }, { status: 503 });

  const rows = events.flatMap((event) => {
    const when = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(event.start_at));
    return recipients.map(({ id }) => ({
      recipient_id: id,
      actor_id: null,
      type: "event_reminder",
      title: "Compromisso chegando",
      body: `${event.title} está marcado para ${when}.`,
      entity_type: "calendar_event",
      entity_id: event.id,
      dedupe_key: `event-reminder:${event.id}:${event.start_at}`,
    }));
  });
  const { error: saveError } = await admin.from("notifications").upsert(rows, {
    onConflict: "recipient_id,dedupe_key",
    ignoreDuplicates: true,
  });
  if (saveError) {
    console.error("Calendar reminders could not be saved", saveError.code ?? "unknown error");
    return NextResponse.json({ error: "Não foi possível salvar os lembretes." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, reminders: rows.length });
}
