import { NextResponse } from "next/server";

import { createAdminClient, isSameOriginMutation } from "@/lib/admin-users";
import { deleteCalendarEventSyncs, syncCalendarEvent, type CalendarEventRecord } from "@/lib/calendar-integrations";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const colors = new Set(["lime", "blue", "amber", "red"]);

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validTimezone(value: unknown) {
  if (typeof value !== "string" || value.length > 80) return "America/Sao_Paulo";
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return value; } catch { return "America/Sao_Paulo"; }
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: "Origem da solicitação não autorizada." }, { status: 403 });
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "A Agenda não está disponível agora." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Entre novamente para continuar." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_allowed").eq("id", user.id).maybeSingle();
  if (!profile?.is_allowed) return NextResponse.json({ error: "Sua conta não tem acesso ao CRM." }, { status: 403 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || typeof payload.action !== "string") return NextResponse.json({ error: "Dados do compromisso inválidos." }, { status: 400 });
  const admin = createAdminClient();

  if (payload.action === "delete") {
    if (typeof payload.id !== "string" || !uuidPattern.test(payload.id)) return NextResponse.json({ error: "Compromisso inválido." }, { status: 400 });
    const { data: event, error: readError } = await supabase.from("calendar_events").select("*").eq("id", payload.id).maybeSingle();
    if (readError || !event) return NextResponse.json({ error: "Não foi possível encontrar este compromisso." }, { status: 404 });
    const { error } = await supabase.from("calendar_events").delete().eq("id", payload.id);
    if (error) return NextResponse.json({ error: "Não foi possível excluir o compromisso." }, { status: 503 });
    const syncErrors = admin ? await deleteCalendarEventSyncs(admin, event as CalendarEventRecord) : [];
    return NextResponse.json({ ok: true, syncErrors });
  }

  const isMove = payload.action === "move";
  if (payload.action !== "save" && !isMove) return NextResponse.json({ error: "Ação de Agenda inválida." }, { status: 400 });
  const id = typeof payload.id === "string" ? payload.id : null;
  if (id && !uuidPattern.test(id)) return NextResponse.json({ error: "Compromisso inválido." }, { status: 400 });
  const timezone = validTimezone(payload.timezone);

  let values: Record<string, unknown>;
  if (isMove) {
    if (!id || !validTimestamp(payload.start_at) || !validTimestamp(payload.end_at) || Date.parse(payload.end_at) <= Date.parse(payload.start_at)) {
      return NextResponse.json({ error: "A nova data do compromisso é inválida." }, { status: 400 });
    }
    values = { start_at: payload.start_at, end_at: payload.end_at };
  } else {
    const input = payload.values;
    if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Preencha os dados do compromisso." }, { status: 400 });
    const draft = input as Record<string, unknown>;
    const title = typeof draft.title === "string" ? draft.title.trim() : "";
    if (!title || title.length > 160 || !validTimestamp(draft.start_at) || !validTimestamp(draft.end_at) || Date.parse(draft.end_at) <= Date.parse(draft.start_at) || typeof draft.all_day !== "boolean" || typeof draft.color !== "string" || !colors.has(draft.color) || (draft.notes !== null && typeof draft.notes !== "string")) {
      return NextResponse.json({ error: "Confira o título, horário e detalhes do compromisso." }, { status: 400 });
    }
    const notes = typeof draft.notes === "string" ? draft.notes.trim() : null;
    if (notes && notes.length > 4000) return NextResponse.json({ error: "As notas podem ter até 4.000 caracteres." }, { status: 400 });
    values = { title, start_at: draft.start_at, end_at: draft.end_at, all_day: draft.all_day, color: draft.color, notes: notes || null };
  }

  let event: CalendarEventRecord;
  if (id) {
    const { data: existing } = await supabase.from("calendar_events").select("created_by").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Não foi possível encontrar este compromisso." }, { status: 404 });
    const { data, error } = await supabase.from("calendar_events").update({ ...values, ...(!existing.created_by ? { created_by: user.id } : {}) }).eq("id", id).select("*").single();
    if (error || !data) return NextResponse.json({ error: "Não foi possível salvar o compromisso. Confira se a migração de sincronização foi aplicada." }, { status: 503 });
    event = data as CalendarEventRecord;
  } else {
    const { data, error } = await supabase.from("calendar_events").insert({ ...values, created_by: user.id }).select("*").single();
    if (error || !data) return NextResponse.json({ error: "Não foi possível salvar o compromisso. Confira sua conexão." }, { status: 503 });
    event = data as CalendarEventRecord;
  }

  const syncErrors = admin ? await syncCalendarEvent(admin, event, user.id, timezone) : [];
  return NextResponse.json({ event, syncErrors });
}
