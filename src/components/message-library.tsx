"use client";

import { BookOpenText, Pencil, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { CopyButton } from "@/components/copy-button";
import { ProspectaSelect } from "@/components/ui/prospecta-select";
import { useAppToast } from "@/components/app-toast-provider";
import { createClient } from "@/lib/supabase/client";

type Stage = "primeiro_contato" | "respondeu" | "sem_resposta" | "proposta" | "encerramento";
type Message = { id: string; title: string; stage: Stage; scenario: string; body: string; created_by?: string };
type SavedMessage = Message & { created_by: string; created_at: string };

const stages: Array<{ id: Stage; label: string; description: string }> = [
  { id: "primeiro_contato", label: "Primeiro contato", description: "Abra a conversa com respeito ao tempo da pessoa." },
  { id: "respondeu", label: "Cliente respondeu", description: "Continue a conversa de acordo com o interesse demonstrado." },
  { id: "sem_resposta", label: "Sem resposta", description: "Faça um retorno breve e saiba quando parar." },
  { id: "proposta", label: "Proposta", description: "Confirme o que foi combinado e tire dúvidas." },
  { id: "encerramento", label: "Encerrar ou retomar", description: "Deixe a porta aberta sem insistir." },
];

const starters: Message[] = [
  { id: "inicio-leve", stage: "primeiro_contato", scenario: "Para iniciar", title: "Uma pergunta rápida", body: "Oi, tudo bem? Sou [seu nome], da [sua empresa]. Encontrei o contato de vocês e queria saber se posso te fazer uma pergunta rápida sobre [assunto]." },
  { id: "inicio-contato", stage: "primeiro_contato", scenario: "Se não souber com quem falar", title: "Pessoa responsável", body: "Oi! Você é a pessoa certa para conversar sobre [assunto] aí na empresa? Se não for, me diz com quem posso falar?" },
  { id: "respondeu-sim", stage: "respondeu", scenario: "Se aceitou conversar", title: "Entender a necessidade", body: "Que bom! Antes de te mandar qualquer coisa, me conta como vocês lidam hoje com [assunto]?" },
  { id: "respondeu-detalhes", stage: "respondeu", scenario: "Se pediu mais detalhes", title: "Explicar sem presumir", body: "Claro. Posso te explicar de um jeito simples. Qual parte de [assunto] faz mais diferença para vocês hoje?" },
  { id: "respondeu-preco", stage: "respondeu", scenario: "Se perguntou o preço", title: "Pedir o contexto certo", body: "Te passo os valores, sim. Preciso entender [informação que muda o preço] para não te dar um número errado. Pode me contar esse ponto?" },
  { id: "respondeu-nao-agora", stage: "respondeu", scenario: "Se não for o momento", title: "Respeitar o tempo", body: "Entendi. Posso voltar a falar com você em outro momento, ou prefere que eu encerre o contato por aqui?" },
  { id: "sem-resposta-primeiro", stage: "sem_resposta", scenario: "Primeiro retorno", title: "Retomar com leveza", body: "Oi! Conseguiu ver minha mensagem? Se não fizer sentido conversar agora, pode me falar sem problema." },
  { id: "sem-resposta-final", stage: "sem_resposta", scenario: "Última tentativa", title: "Não insistir", body: "Oi, passando uma última vez para não ficar te incomodando. Se quiser retomar esse assunto, me chama por aqui." },
  { id: "proposta-reuniao", stage: "proposta", scenario: "Depois da conversa", title: "Confirmar o combinado", body: "Obrigado por conversar comigo hoje. Vou organizar o que combinamos e te mandar os próximos passos. Se eu tiver entendido algo errado, pode me corrigir." },
  { id: "proposta-retorno", stage: "proposta", scenario: "Depois de enviar a proposta", title: "Tirar dúvidas", body: "Oi! Conseguiu olhar a proposta? Se algum ponto não estiver claro ou não encaixar no que você precisa, me fala que ajustamos juntos." },
  { id: "proposta-aceita", stage: "proposta", scenario: "Se aceitou a proposta", title: "Próximos passos", body: "Que bom que fez sentido. Obrigado pela confiança! Vou confirmar com você os próximos passos e prazos antes de começarmos." },
  { id: "encerrar-nao", stage: "encerramento", scenario: "Se não quiser avançar", title: "Agradecer e encerrar", body: "Tudo bem, obrigado por considerar. Vou encerrar por aqui para não insistir. Se quiser conversar de novo no futuro, estou à disposição." },
  { id: "encerrar-retomar", stage: "encerramento", scenario: "Se autorizou um retorno", title: "Retomar depois", body: "Oi! Faz um tempo que a gente conversou sobre [assunto]. Isso ainda está no radar de vocês? Se não estiver, tudo bem também." },
];

const blankDraft = { title: "", stage: "primeiro_contato" as Stage, scenario: "", body: "" };

export function MessageLibrary({ userId, onOpenWhatsApp }: { userId: string | null; onOpenWhatsApp: () => void }) {
  const [selectedStage, setSelectedStage] = useState<Stage>("primeiro_contato");
  const [search, setSearch] = useState("");
  const [custom, setCustom] = useState<SavedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [isSaving, setIsSaving] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const toast = useAppToast();

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        if (active) { setLoadError("O CRM não está conectado ao Supabase."); setIsLoading(false); }
        return;
      }
      const { data, error } = await supabase.from("outreach_messages")
        .select("id,title,stage,scenario,body,created_by,created_at")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) setLoadError("Não foi possível carregar as mensagens da equipe. Tente novamente.");
      else { setCustom((data ?? []) as SavedMessage[]); setLoadError(""); }
      setIsLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase, reload]);

  useEffect(() => {
    if (!editorOpen) return;
    titleInput.current?.focus();
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape" && !isSaving) setEditorOpen(false); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editorOpen, isSaving]);

  const allMessages = useMemo(() => [...starters, ...custom], [custom]);
  const visible = allMessages.filter((message) => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return message.stage === selectedStage && (!query || `${message.title} ${message.scenario} ${message.body}`.toLocaleLowerCase("pt-BR").includes(query));
  });
  const stage = stages.find((item) => item.id === selectedStage)!;

  function openNew() {
    setDraft({ ...blankDraft, stage: selectedStage });
    setEditingId(null);
    setEditorOpen(true);
  }

  function openEdit(message: SavedMessage) {
    setDraft({ title: message.title, stage: message.stage, scenario: message.scenario, body: message.body });
    setEditingId(message.id);
    setEditorOpen(true);
  }

  async function saveMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !userId) { toast("Sua sessão expirou. Entre novamente para salvar.", "error"); return; }
    const payload = { title: draft.title.trim(), stage: draft.stage, scenario: draft.scenario.trim(), body: draft.body.trim() };
    if (payload.title.length < 3 || payload.scenario.length < 3 || payload.body.length < 10) return;
    setIsSaving(true);
    const query = editingId
      ? supabase.from("outreach_messages").update(payload).eq("id", editingId).eq("created_by", userId)
      : supabase.from("outreach_messages").insert({ ...payload, created_by: userId });
    const { data, error } = await query.select("id,title,stage,scenario,body,created_by,created_at").single();
    setIsSaving(false);
    if (error || !data) { toast("Não foi possível salvar a mensagem. Tente novamente.", "error"); return; }
    const saved = data as SavedMessage;
    setCustom((current) => editingId ? current.map((item) => item.id === editingId ? saved : item) : [saved, ...current]);
    setSelectedStage(saved.stage);
    setEditorOpen(false);
    toast(editingId ? "Mensagem atualizada." : "Mensagem criada para a equipe.", "success");
  }

  return <div className="message-library">
    <header className="message-library-header">
      <div><h1>Mensagens prontas</h1><p>Escolha o momento da conversa, ajuste o texto e copie quando fizer sentido.</p></div>
      <div className="message-library-header-actions"><button className="secondary-button" type="button" onClick={onOpenWhatsApp}>Abrir WhatsApp</button><button className="primary-button" type="button" onClick={openNew} disabled={Boolean(loadError) || isLoading}><Plus size={16} /> Nova mensagem</button></div>
    </header>

    <div className="message-flow" role="group" aria-label="Etapa da conversa">
      {stages.map((item, index) => <button key={item.id} type="button" className={selectedStage === item.id ? "is-active" : ""} onClick={() => { setSelectedStage(item.id); setSearch(""); }} aria-pressed={selectedStage === item.id}>
        <span>{String(index + 1).padStart(2, "0")}</span><strong>{item.label}</strong><small>{allMessages.filter((message) => message.stage === item.id).length}</small>
      </button>)}
    </div>

    <section className="message-stage" aria-labelledby="message-stage-title">
      <div className="message-stage-heading"><div><h2 id="message-stage-title">{stage.label}</h2><p>{stage.description}</p></div><label className="message-library-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nesta etapa" aria-label="Buscar mensagem nesta etapa" /></label></div>
      {isLoading && <p className="message-library-state" role="status">Carregando mensagens da equipe...</p>}
      {loadError && <div className="message-library-state is-error" role="alert"><span>{loadError} As mensagens iniciais continuam disponíveis.</span><button className="secondary-button" type="button" onClick={() => { setIsLoading(true); setReload((count) => count + 1); }}>Tentar novamente</button></div>}
      <div className="message-card-grid">
        {visible.map((message) => <article className="message-card" key={message.id}>
          <div className="message-card-top"><span className="message-scenario">{message.scenario}</span>{message.created_by && <span className="message-custom-tag">Da equipe</span>}</div>
          <h3>{message.title}</h3>
          <p>{message.body}</p>
          <div className="message-card-footer"><span>{message.body.includes("[") ? "Revise os campos entre colchetes" : "Revise antes de enviar"}</span><div>{message.created_by === userId && <button type="button" className="message-edit-button" onClick={() => openEdit(message as SavedMessage)} aria-label={`Editar ${message.title}`}><Pencil size={15} /></button>}<CopyButton value={message.body} onCopied={() => toast("Mensagem copiada. Revise o texto antes de enviar.", "success")} onCopyError={() => toast("Não foi possível copiar. Permita o acesso à área de transferência e tente novamente.", "error")} /></div></div>
        </article>)}
      </div>
      {!visible.length && <div className="message-library-empty"><BookOpenText size={24} /><strong>Nenhuma mensagem nesta busca</strong><p>Troque o termo ou escreva uma mensagem para esta etapa.</p><button className="secondary-button" type="button" onClick={openNew} disabled={Boolean(loadError) || isLoading}>Criar mensagem</button></div>}
    </section>
    <p className="message-library-footnote">Copiar não envia a mensagem. Para iniciar uma conversa pela API fora da janela de atendimento, use um modelo aprovado na Meta.</p>

    {editorOpen && <div className="message-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setEditorOpen(false); }}>
      <section className="message-editor" role="dialog" aria-modal="true" aria-labelledby="message-editor-title">
        <header><div><h2 id="message-editor-title">{editingId ? "Editar mensagem" : "Nova mensagem"}</h2><p>Escreva como você falaria com o cliente.</p></div><button className="icon-button" type="button" onClick={() => setEditorOpen(false)} disabled={isSaving} aria-label="Fechar editor"><X size={18} /></button></header>
        <form onSubmit={saveMessage}>
          <label>Título<input ref={titleInput} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} minLength={3} maxLength={100} placeholder="Ex.: Cliente pediu mais detalhes" required /></label>
          <div className="message-editor-row"><ProspectaSelect label="Etapa" value={draft.stage} options={stages.map((item) => ({ value: item.id, label: item.label }))} onChange={(stage) => setDraft((current) => ({ ...current, stage: stage as Stage }))} /><label>Quando usar<input value={draft.scenario} onChange={(event) => setDraft((current) => ({ ...current, scenario: event.target.value }))} minLength={3} maxLength={100} placeholder="Ex.: Se respondeu com interesse" required /></label></div>
          <label>Texto da mensagem<textarea value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} minLength={10} maxLength={4000} rows={7} placeholder="Escreva a mensagem que a equipe poderá copiar..." required /></label>
          <p>Use [colchetes] para partes que precisam ser personalizadas antes do envio.</p>
          <footer><button className="secondary-button" type="button" onClick={() => setEditorOpen(false)} disabled={isSaving}>Cancelar</button><button className="primary-button" type="submit" disabled={isSaving}>{isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar mensagem"}</button></footer>
        </form>
      </section>
    </div>}
  </div>;
}
