"use client";

import { AlertCircle, Check, CheckCheck, Clock3, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CommandBar } from "@/components/whatsapp-command-bar";
import type { Lead } from "@/lib/crm-types";
import { createClient } from "@/lib/supabase/client";
import { isWhatsAppWindowOpen, toWhatsAppE164 } from "@/lib/whatsapp";

type Conversation = { lead_id: string; phone_e164: string; last_inbound_at: string | null; opted_in_at: string | null; opt_in_source: string | null; opted_out_at: string | null };
type WhatsAppMessage = {
  id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string;
  status: string;
  created_at: string;
};

function sendFailure(status: number, message?: string) {
  return status >= 500
    ? "O envio está indisponível no momento. Tente novamente mais tarde."
    : message || "Não foi possível enviar a mensagem.";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function MessageStatus({ status }: { status: string }) {
  if (status === "failed") return <AlertCircle size={13} aria-label="Falha no envio" />;
  if (status === "read" || status === "delivered") return <CheckCheck size={13} aria-label={status === "read" ? "Lida" : "Entregue"} />;
  if (status === "sent" || status === "accepted") return <Check size={13} aria-label="Enviada" />;
  if (status === "sending") return <Clock3 size={13} aria-label="Enviando" />;
  return null;
}

export function WhatsAppConversation({ lead, supabase }: {
  lead: Lead;
  supabase: ReturnType<typeof createClient>;
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [sendReady, setSendReady] = useState<boolean | null>(null);
  const [firstContactReady, setFirstContactReady] = useState(false);
  const [firstContactPreview, setFirstContactPreview] = useState<string | null>(null);
  const [firstContactOpen, setFirstContactOpen] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [consentSource, setConsentSource] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [notice, setNotice] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const phoneE164 = useMemo(() => toWhatsAppE164(lead.phone), [lead.phone]);
  const windowOpen = conversation?.phone_e164 === phoneE164 && isWhatsAppWindowOpen(conversation?.last_inbound_at);
  const optedOut = Boolean(conversation?.opted_out_at);
  const hasConsent = Boolean(conversation?.opted_in_at && conversation.phone_e164 === phoneE164);
  const canReply = Boolean(phoneE164 && windowOpen && !optedOut && sendReady && !loadError);

  useEffect(() => {
    let active = true;
    let loading = false;

    async function loadConversation() {
      if (!supabase || loading) {
        if (!supabase && active) {
          setLoadError("Não foi possível carregar esta conversa agora.");
          setIsLoading(false);
        }
        return;
      }
      loading = true;
      const [conversationResult, messageResult] = await Promise.all([
        supabase.from("whatsapp_conversations").select("lead_id,phone_e164,last_inbound_at,opted_in_at,opt_in_source,opted_out_at").eq("lead_id", lead.id).maybeSingle(),
        supabase.from("whatsapp_messages").select("id,direction,message_type,body,status,created_at").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(100),
      ]);
      if (active) {
        if (conversationResult.error || messageResult.error) {
          setLoadError("Não foi possível carregar esta conversa. Tente atualizar a página.");
        } else {
          setConversation((conversationResult.data ?? null) as Conversation | null);
          setMessages(((messageResult.data ?? []) as WhatsAppMessage[]).reverse());
          setLoadError("");
        }
        setIsLoading(false);
      }
      loading = false;
    }

    async function loadAvailability() {
      try {
        const response = await fetch("/api/whatsapp/status", { cache: "no-store" });
        if (!response.ok) {
          if (active) setSendReady(false);
          return;
        }
        const result = await response.json() as { sendReady: boolean; firstContactReady?: boolean; firstContactPreview?: string | null };
        if (active) {
          setSendReady(result.sendReady);
          setFirstContactReady(Boolean(result.firstContactReady));
          setFirstContactPreview(result.firstContactPreview ?? null);
        }
      } catch {
        if (active) setSendReady(false);
      }
    }

    void loadConversation();
    void loadAvailability();
    const refreshTimer = window.setInterval(() => {
      void loadConversation();
      void loadAvailability();
    }, 15_000);
    const channel = supabase?.channel(`whatsapp-lead-${lead.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages", filter: `lead_id=eq.${lead.id}` }, () => { void loadConversation(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations", filter: `lead_id=eq.${lead.id}` }, () => { void loadConversation(); })
      .subscribe();

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [lead.id, supabase]);

  useEffect(() => { lastMessageRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  async function sendMessage() {
    if (!canReply || isSending || !messageBody.trim()) return;
    setSendError("");
    setNotice("");
    setIsSending(true);
    try {
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, mode: "text", body: messageBody.trim() }),
      });
      const result = await response.json() as { message?: string; item?: WhatsAppMessage };
      if (!response.ok) {
        setSendError(sendFailure(response.status, result.message));
      } else {
        setMessageBody("");
        if (result.item) setMessages((current) => [...current.filter((item) => item.id !== result.item?.id), result.item!]);
        setNotice("Mensagem enviada.");
      }
    } catch {
      setSendError("Não foi possível enviar a mensagem. Tente novamente.");
    } finally {
      setIsSending(false);
    }
  }

  async function startConversation() {
    if (!firstContactReady || !firstContactPreview || !phoneE164 || optedOut || windowOpen || isSending || isLoading || loadError) return;
    setSendError("");
    setNotice("");
    setIsSending(true);
    try {
      if (!hasConsent) {
        if (!consentConfirmed || !consentSource.trim()) {
          setSendError("Confirme a autorização do contato e informe onde ela foi concedida.");
          return;
        }
        const consentResponse = await fetch("/api/whatsapp/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: lead.id, confirmed: true, source: consentSource.trim() }),
        });
        const consentResult = await consentResponse.json() as { message?: string; item?: Conversation };
        if (!consentResponse.ok || !consentResult.item) {
          setSendError(sendFailure(consentResponse.status, consentResult.message));
          return;
        }
        setConversation(consentResult.item);
      }

      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, mode: "first_contact" }),
      });
      const result = await response.json() as { message?: string; item?: WhatsAppMessage };
      if (!response.ok) {
        setSendError(sendFailure(response.status, result.message));
        return;
      }
      if (result.item) setMessages((current) => [...current.filter((item) => item.id !== result.item?.id), result.item!]);
      setFirstContactOpen(false);
      setNotice("Mensagem de abertura enviada.");
    } catch {
      setSendError("Não foi possível iniciar a conversa. Tente novamente.");
    } finally {
      setIsSending(false);
    }
  }

  const unavailableReason = optedOut
    ? "Este contato não deseja receber mensagens."
    : !phoneE164
      ? "Adicione um telefone válido ao lead para conversar."
      : !windowOpen
        ? firstContactReady
          ? "Você pode iniciar a conversa. Após a resposta do contato, a escrita livre fica disponível por 24 horas."
          : "A mensagem de abertura ainda não está disponível. Você poderá escrever livremente após uma resposta do contato."
        : sendReady === false
          ? "O envio está indisponível no momento. Tente novamente mais tarde."
          : sendReady === null
            ? "Preparando conversa…"
          : "";

  return <section className="wa-chat" aria-label={`Conversa com ${lead.name}`}>
    <div className="wa-chat-history" role="log" aria-label={`Mensagens com ${lead.name}`} aria-live="polite">
      {isLoading ? <div className="wa-chat-state">Carregando conversa…</div> : loadError ? <div className="wa-chat-state wa-chat-state-error" role="alert"><AlertCircle size={19} /><span>{loadError}</span></div> : messages.length ? messages.map((item) => <article className={`wa-chat-message ${item.direction === "outbound" ? "is-outbound" : "is-inbound"}`} key={item.id}>
        <p>{item.body}</p>
        <footer><time dateTime={item.created_at}>{formatTime(item.created_at)}</time>{item.direction === "outbound" && <MessageStatus status={item.status} />}</footer>
      </article>) : <div className="wa-chat-state"><MessageCircle size={24} /><strong>Nenhuma mensagem ainda</strong><span>As mensagens trocadas com {lead.name} aparecerão aqui.</span></div>}
      <div ref={lastMessageRef} />
    </div>
    <div className="wa-chat-bottom">
      {unavailableReason && <p className="wa-chat-context" role="status">{unavailableReason}</p>}
      {!windowOpen && !optedOut && phoneE164 && !isLoading && !loadError && <div className="wa-first-contact">
        <button className="wa-first-contact-trigger" type="button" disabled={!firstContactReady || !sendReady || isSending} aria-expanded={firstContactOpen} onClick={() => { setFirstContactOpen((open) => !open); setSendError(""); }}>
          {messages.length ? "Retomar conversa" : "Iniciar conversa"}
        </button>
        {firstContactOpen && firstContactPreview && <div className="wa-first-contact-panel">
          <p className="wa-first-contact-label">Mensagem que será enviada</p>
          <p className="wa-first-contact-preview">{firstContactPreview}</p>
          {!hasConsent && <div className="wa-first-contact-consent">
            <label><input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} /> Confirmo que este contato autorizou receber mensagens pelo WhatsApp.</label>
            <label htmlFor="wa-consent-source">Onde essa autorização foi concedida?</label>
            <input id="wa-consent-source" value={consentSource} onChange={(event) => setConsentSource(event.target.value)} maxLength={200} placeholder="Ex.: formulário de contato, data e contexto" />
          </div>}
          <div className="wa-first-contact-actions"><button type="button" className="secondary-button" onClick={() => setFirstContactOpen(false)}>Cancelar</button><button type="button" className="primary-button" disabled={isSending || (!hasConsent && (!consentConfirmed || !consentSource.trim()))} onClick={() => void startConversation()}>{isSending ? "Enviando…" : "Confirmar e enviar"}</button></div>
        </div>}
      </div>}
      {sendError && <p className="wa-chat-feedback is-error" role="alert">{sendError}</p>}
      {notice && <p className="wa-chat-feedback" role="status">{notice}</p>}
      <CommandBar
        disabled={!canReply || isLoading || isSending}
        onChange={(value) => { setMessageBody(value); setSendError(""); setNotice(""); }}
        onSubmit={() => void sendMessage()}
        placeholder={windowOpen ? "Escreva uma mensagem" : "Aguardando mensagem do contato"}
        sending={isSending}
        value={messageBody}
      />
    </div>
  </section>;
}
