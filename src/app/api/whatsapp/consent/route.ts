import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/config";
import { toWhatsAppE164 } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ message: "Origem da solicitação inválida." }, { status: 403 });
  }

  const supabase = await createClient();
  if (!supabase) return Response.json({ message: "O Supabase não está configurado." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ message: "Entre novamente para registrar a autorização." }, { status: 401 });

  let payload: unknown;
  try { payload = await request.json(); } catch { return Response.json({ message: "Dados de autorização inválidos." }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return Response.json({ message: "Dados de autorização inválidos." }, { status: 400 });
  }
  const input = payload as Record<string, unknown>;
  if (input.confirmed !== true || typeof input.leadId !== "string" || !input.leadId || typeof input.source !== "string") {
    return Response.json({ message: "Confirme a autorização e informe onde/quando ela foi concedida." }, { status: 400 });
  }
  const source = input.source.trim();
  if (!source || source.length > 200) {
    return Response.json({ message: "A origem da autorização deve ter entre 1 e 200 caracteres." }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase.from("leads")
    .select("id,phone")
    .eq("id", input.leadId)
    .maybeSingle();
  if (leadError) return Response.json({ message: "Não foi possível consultar este lead." }, { status: 500 });
  if (!lead) return Response.json({ message: "Lead não encontrado." }, { status: 404 });
  const phoneE164 = toWhatsAppE164(lead.phone);
  if (!phoneE164) return Response.json({ message: "Corrija o telefone do lead antes de registrar a autorização." }, { status: 400 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || !isSupabaseConfigured) {
    return Response.json({ message: "Configure a chave de servidor do Supabase na Vercel antes de registrar autorizações." }, { status: 503 });
  }
  const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: currentConversation, error: readError } = await admin.from("whatsapp_conversations")
    .select("last_inbound_at")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (readError) {
    return Response.json({ message: "Não foi possível consultar a conversa. Confira se a migration foi aplicada." }, { status: 503 });
  }
  const { data: savedConversation, error } = await admin.from("whatsapp_conversations").upsert({
    lead_id: lead.id,
    phone_e164: phoneE164,
    last_inbound_at: currentConversation?.last_inbound_at ?? null,
    opted_in_at: new Date().toISOString(),
    opt_in_source: source,
    opted_in_by: user.id,
    opted_out_at: null,
    opt_out_source: null,
  }, { onConflict: "lead_id" })
    .select("lead_id,phone_e164,last_inbound_at,opted_in_at,opt_in_source,opted_out_at")
    .single();
  if (error || !savedConversation) {
    console.error("WhatsApp opt-in could not be saved", error?.code ?? "unknown error");
    return Response.json({ message: "Não foi possível salvar a autorização. Confira se a migration foi aplicada." }, { status: 503 });
  }

  return Response.json({ message: "Autorização registrada. Use-a somente se o lead realmente consentiu.", item: savedConversation });
}
