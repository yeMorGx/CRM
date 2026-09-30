import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/config";
import { toWhatsAppE164 } from "@/lib/whatsapp";

export const runtime = "nodejs";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function constantTimeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function messageBody(message: UnknownRecord) {
  const type = typeof message.type === "string" ? message.type : "unknown";
  const content = isRecord(message[type]) ? message[type] as UnknownRecord : {};
  switch (type) {
    case "text":
      return typeof content.body === "string" ? content.body : "[Mensagem de texto]";
    case "image": return "[Imagem recebida]";
    case "audio": return "[Áudio recebido]";
    case "video": return "[Vídeo recebido]";
    case "document": return typeof content.filename === "string" ? `[Documento: ${content.filename}]` : "[Documento recebido]";
    case "sticker": return "[Figurinha recebida]";
    case "location": return "[Localização recebida]";
    case "contacts": return "[Contato recebido]";
    case "button": return typeof content.text === "string" ? content.text : "[Resposta de botão]";
    case "interactive": {
      const button = isRecord(content.button_reply) ? content.button_reply : null;
      const list = isRecord(content.list_reply) ? content.list_reply : null;
      if (button && typeof button.title === "string") return button.title;
      if (list && typeof list.title === "string") return list.title;
      return "[Resposta interativa]";
    }
    default: return `[Mensagem ${type}]`;
  }
}

function eventTimestamp(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const milliseconds = Number(value) * 1000;
  if (!Number.isFinite(milliseconds)) return fallback;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function signedPayloadMatches(rawBody: string, suppliedSignature: string | null, appSecret: string) {
  if (!suppliedSignature || !/^sha256=[a-f0-9]{64}$/i.test(suppliedSignature)) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  return constantTimeStringEqual(expected.toLowerCase(), suppliedSignature.toLowerCase());
}

export async function GET(request: Request) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) return new Response("Webhook WhatsApp não configurado.", { status: 503 });
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && challenge && constantTimeStringEqual(token, verifyToken)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response("Verificação do webhook recusada.", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!appSecret || !serviceRoleKey || !isSupabaseConfigured) {
    return Response.json({ message: "Webhook WhatsApp não configurado." }, { status: 503 });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 1_000_000) return new Response("Payload muito grande.", { status: 413 });

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1_000_000) return new Response("Payload muito grande.", { status: 413 });
  if (!signedPayloadMatches(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new Response("Assinatura do webhook inválida.", { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return new Response("JSON inválido.", { status: 400 }); }
  if (!isRecord(payload) || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
    return Response.json({ received: true });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  async function findLeadId(phone: string) {
    for (let start = 0; start < 100_000; start += 1000) {
      const { data, error } = await admin.from("leads").select("id,phone").range(start, start + 999);
      if (error) throw error;
      const matchingLead = data?.find((lead) => toWhatsAppE164(lead.phone) === phone);
      if (matchingLead) return matchingLead.id as string;
      if (!data || data.length < 1000) return null;
    }
    return null;
  }

  try {
    for (const entry of payload.entry) {
      if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
      for (const change of entry.changes) {
        if (!isRecord(change) || !isRecord(change.value)) continue;
        const value = change.value;
        const metadata = isRecord(value.metadata) ? value.metadata : {};
        const configuredNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (configuredNumberId && metadata.phone_number_id !== configuredNumberId) continue;

        if (Array.isArray(value.statuses)) {
          for (const statusItem of value.statuses) {
            if (!isRecord(statusItem) || typeof statusItem.id !== "string" || typeof statusItem.status !== "string") continue;
            const nextStatus = statusItem.status;
            if (!new Set(["sent", "delivered", "read", "failed"]).has(nextStatus)) continue;
            const { data: existing, error: readError } = await admin.from("whatsapp_messages")
              .select("status")
              .eq("provider_message_id", statusItem.id)
              .maybeSingle();
            if (readError) throw readError;
            if (!existing || existing.status === "read" || existing.status === "failed") continue;
            if (existing.status === "delivered" && nextStatus === "sent") continue;
            if (existing.status === "delivered" && nextStatus === "failed") continue;
            if (existing.status === "accepted" && nextStatus === "sent") continue;
            const errorItem = Array.isArray(statusItem.errors) && isRecord(statusItem.errors[0]) ? statusItem.errors[0] : null;
            const { error } = await admin.from("whatsapp_messages").update({
              status: nextStatus,
              status_updated_at: eventTimestamp(statusItem.timestamp),
              error_code: errorItem && typeof errorItem.code === "number" ? String(errorItem.code) : null,
            }).eq("provider_message_id", statusItem.id);
            if (error) throw error;
          }
        }

        const isAppEcho = change.field === "smb_message_echoes";
        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const messageItem of messages) {
          if (!isRecord(messageItem) || typeof messageItem.id !== "string") continue;
          const rawPhone = isAppEcho ? messageItem.to : messageItem.from;
          if (typeof rawPhone !== "string") continue;
          const phoneE164 = toWhatsAppE164(rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`);
          if (!phoneE164) continue;
          const leadId = await findLeadId(phoneE164);
          if (!leadId) {
            console.warn("WhatsApp webhook message did not match a CRM lead.");
            continue;
          }
          const { error: conversationError } = await admin.from("whatsapp_conversations").upsert({
            lead_id: leadId,
            phone_e164: phoneE164,
          }, { onConflict: "lead_id", ignoreDuplicates: true });
          if (conversationError) throw conversationError;

          const messageTimestamp = eventTimestamp(messageItem.timestamp);
          const inboundBody = messageBody(messageItem);
          const optedOut = !isAppEcho && (
            /^\s*(?:stop|sair|parar|cancelar|remover|unsubscribe)\s*[.!]?\s*$/i.test(inboundBody) ||
            /\b(?:não quero mais (?:receber|mensagens)|pare de (?:me )?mandar(?: mensagens)?|remova meu número|não me (?:mande|envie) mais)\b/i.test(inboundBody)
          );
          if (optedOut) {
            const { error: optOutError } = await admin.from("whatsapp_conversations").update({
              opted_out_at: messageTimestamp,
              opt_out_source: "Solicitação de saída recebida pelo WhatsApp",
            }).eq("lead_id", leadId);
            if (optOutError) throw optOutError;
          }
          const { error: messageError } = await admin.from("whatsapp_messages").upsert({
            lead_id: leadId,
            provider_message_id: messageItem.id,
            direction: isAppEcho ? "outbound" : "inbound",
            message_type: typeof messageItem.type === "string" ? messageItem.type.slice(0, 40) : "unknown",
            body: inboundBody,
            status: isAppEcho ? "sent" : "received",
            created_at: messageTimestamp,
            status_updated_at: messageTimestamp,
          }, { onConflict: "provider_message_id", ignoreDuplicates: true });
          if (messageError) throw messageError;
        }
      }
    }
  } catch (error) {
    console.error("WhatsApp webhook processing failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ message: "Não foi possível processar a notificação." }, { status: 500 });
  }

  return Response.json({ received: true });
}
