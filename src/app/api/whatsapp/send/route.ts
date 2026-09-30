import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isWhatsAppWindowOpen, toWhatsAppE164 } from "@/lib/whatsapp";
import { getFirstContactTemplate } from "@/lib/whatsapp-first-contact";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/config";

export const runtime = "nodejs";

type Payload = {
  leadId?: unknown;
  mode?: unknown;
  body?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ message: "Origem da solicitação inválida." }, { status: 403 });
  }

  const supabase = await createClient();
  if (!supabase) return Response.json({ message: "O Supabase não está configurado." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return Response.json({ message: "Entre novamente para enviar mensagens." }, { status: 401 });

  let payload: Payload;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) throw new Error("invalid payload");
    payload = parsed as Payload;
  } catch {
    return Response.json({ message: "Os dados da mensagem são inválidos." }, { status: 400 });
  }

  if (typeof payload.leadId !== "string" || !payload.leadId) {
    return Response.json({ message: "Lead inválido." }, { status: 400 });
  }
  if (payload.mode !== "text" && payload.mode !== "first_contact") {
    return Response.json({ message: "Tipo de mensagem inválido." }, { status: 400 });
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiVersion || !/^v\d+\.\d+$/.test(apiVersion) || !phoneNumberId || !accessToken || !serviceRoleKey || !isSupabaseConfigured) {
    return Response.json({ message: "A API oficial do WhatsApp e a chave de servidor do Supabase ainda precisam ser configuradas na Vercel." }, { status: 503 });
  }

  const { data: lead, error: leadError } = await supabase.from("leads")
    .select("id,name,phone")
    .eq("id", payload.leadId)
    .maybeSingle();
  if (leadError) return Response.json({ message: "Não foi possível consultar este lead." }, { status: 500 });
  if (!lead) return Response.json({ message: "Lead não encontrado." }, { status: 404 });

  const phoneE164 = toWhatsAppE164(lead.phone);
  if (!phoneE164) {
    return Response.json({ message: "O telefone precisa ter DDD brasileiro válido ou código internacional com + antes do envio." }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await supabase.from("whatsapp_conversations")
    .select("phone_e164,last_inbound_at,opted_in_at,opt_in_source,opted_out_at")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (conversationError) return Response.json({ message: "A estrutura da conversa WhatsApp ainda não foi aplicada no Supabase." }, { status: 503 });
  if (conversation?.opted_out_at) {
    return Response.json({ message: "O lead pediu para não receber mensagens. Registre um novo consentimento antes de retomar o contato." }, { status: 403 });
  }

  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  let messageType = "text";
  let displayBody = body;
  let outgoing: Record<string, unknown>;

  if (payload.mode === "text") {
    if (!body || body.length > 4096) {
      return Response.json({ message: "Escreva uma mensagem de até 4.096 caracteres." }, { status: 400 });
    }
    if (conversation?.phone_e164 !== phoneE164 || !isWhatsAppWindowOpen(conversation?.last_inbound_at)) {
      return Response.json({ message: "A janela de 24 horas está fechada. Para iniciar ou retomar o contato, use um modelo aprovado pela Meta." }, { status: 400 });
    }
    outgoing = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneE164.slice(1),
      type: "text",
      text: { preview_url: false, body },
    };
  } else {
    const template = getFirstContactTemplate();
    if (!template) {
      return Response.json({ message: "A mensagem de primeiro contato ainda não está disponível." }, { status: 503 });
    }
    if (!conversation?.opted_in_at || !conversation.opt_in_source?.trim() || conversation.phone_e164 !== phoneE164) {
      return Response.json({ message: "Confirme a autorização do lead antes de iniciar a conversa." }, { status: 400 });
    }
    messageType = "template";
    displayBody = template.preview;
    outgoing = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneE164.slice(1),
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
      },
    };
  }

  const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: adminCheckError } = await admin.from("whatsapp_conversations").select("lead_id").limit(1);
  if (adminCheckError) {
    return Response.json({ message: "A chave de servidor do Supabase ou a migration do WhatsApp não está válida." }, { status: 503 });
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(outgoing),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return Response.json({ message: "Não foi possível conectar à API da Meta. Tente novamente em instantes." }, { status: 502 });
  }

  let providerPayload: unknown;
  try { providerPayload = await providerResponse.json(); } catch { providerPayload = null; }
  if (!providerResponse.ok || !isRecord(providerPayload)) {
    const providerError = isRecord(providerPayload) && isRecord(providerPayload.error)
      ? providerPayload.error.code
      : undefined;
    console.error("WhatsApp Cloud API rejected a message", providerError ?? providerResponse.status);
    return Response.json({ message: "A Meta recusou o envio. Confira o número, o modelo aprovado e as permissões da API." }, { status: 502 });
  }

  const messages = Array.isArray(providerPayload.messages) ? providerPayload.messages : [];
  const providerMessageId = isRecord(messages[0]) && typeof messages[0].id === "string" ? messages[0].id : null;
  if (!providerMessageId) {
    return Response.json({ message: "A Meta aceitou a solicitação, mas não retornou o identificador da mensagem." }, { status: 502 });
  }

  const { data: savedMessage, error: saveMessageError } = await admin.from("whatsapp_messages")
    .insert({
      lead_id: lead.id,
      provider_message_id: providerMessageId,
      direction: "outbound",
      message_type: messageType,
      body: displayBody,
      status: "accepted",
      sent_by: user.id,
    })
    .select("id,lead_id,provider_message_id,direction,message_type,body,status,sent_by,created_at,status_updated_at")
    .single();
  if (saveMessageError || !savedMessage) {
    console.error("WhatsApp message was accepted but could not be saved to the CRM", saveMessageError?.code ?? "unknown error");
    return Response.json({ message: "A Meta aceitou a mensagem, mas ela não pôde ser registrada no histórico. Não reenvie ainda; atualize a conversa para conferir." }, { status: 502 });
  }

  return Response.json({ message: "Mensagem aceita pela Meta.", item: savedMessage });
}
