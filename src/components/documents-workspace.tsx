"use client";

import {AppSelect} from "@/components/app-select";

import {ItemContextMenu,ActionsButton,type ItemAction} from "./item-actions";
import { Button } from "@heroui/react";
import dynamic from "next/dynamic";
import { FileText, Plus, Upload, Search, X, Download, ArrowLeft, PanelRight, Check, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClientDocument } from "@/lib/document-types";
import "./documents.css";

const Editor = dynamic(() => import("./document-editor"), { ssr: false, loading: () => <p role="status">Carregando editor...</p> });
const PdfPreview = dynamic(() => import("./document-pdf-preview"), { ssr: false, loading: () => <div className="document-preview-message" role="status">Carregando prévia...</div> });
type Client = { id: string; name: string };
const bucket = "client-documents";

export function DocumentsWorkspace() {
  const [client] = useState(createClient);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(Boolean(client));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(client ? "" : "Configure o Supabase para abrir seus documentos.");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<ClientDocument | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const [docs, leads] = await Promise.all([client.from("client_documents").select("*").order("updated_at", { ascending: false }), client.from("leads").select("id,name").order("name")]);
      if (docs.error) throw docs.error;
      if (leads.error) throw leads.error;
      const rows = docs.data as ClientDocument[];
      setDocuments(rows); setClients(leads.data);
      const previews = await Promise.all(rows.filter(doc => doc.storage_path).map(async doc => {
        const result = await client.storage.from(bucket).createSignedUrl(doc.storage_path!, 3600);
        return [doc.id, result.data?.signedUrl ?? ""] as const;
      }));
      setUrls(Object.fromEntries(previews)); setError("");
    } catch { setError("Não foi possível carregar os documentos. Confira sua conexão e a configuração do banco."); }
    finally { setLoading(false); }
  }, [client]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) void load(); }); return () => { active = false; }; }, [load]);
  useEffect(() => { const refresh = () => { void load(); }; window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, [load]);

  async function create(file?: File) {
    if (!client || busy) return;
    setBusy(true); setError("");
    let uploadedPath: string | null = null;
    try {
      const auth = await client.auth.getUser();
      if (auth.error || !auth.data.user) throw Error("Entre novamente para criar um documento.");
      const id = crypto.randomUUID();
      let markdown = "";
      let kind: "note" | "file" = "note";
      let mime: string | null = null;
      if (file) {
        if (file.size > 20 * 1024 * 1024) throw Error("Escolha um arquivo com até 20 MB.");
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext === "md" || ext === "txt") markdown = await file.text();
        else {
          if (ext !== "pdf" && ext !== "docx") throw Error("Envie PDF, Word (.docx), Markdown ou texto.");
          kind = "file";
          mime = ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          if (ext === "pdf" && !new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()).startsWith("%PDF-")) throw Error("O arquivo não é um PDF válido.");
          uploadedPath = `${auth.data.user.id}/${id}/document.${ext}`;
          const uploaded = await client.storage.from(bucket).upload(uploadedPath, file, { contentType: mime, upsert: false });
          if (uploaded.error) { uploadedPath = null; throw Error("Não foi possível enviar o arquivo. Tente novamente."); }
        }
      }
      const result = await client.from("client_documents").insert({ id, owner_id: auth.data.user.id, title: file?.name ?? "Sem título", kind, markdown, storage_path: uploadedPath, mime_type: mime, file_size: kind === "file" ? file?.size : null }).select("*").single();
      if (result.error) throw Error("Não foi possível criar o documento. Confira se a migration de documentos foi aplicada.");
      await load(); setSelected(result.data as ClientDocument);
    } catch (cause) {
      if (uploadedPath) await client.storage.from(bucket).remove([uploadedPath]);
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o documento.");
    } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  const visible = documents.filter(doc => (filter === "all" || (filter === "contracts" ? doc.is_contract : doc.kind === "note")) && `${doc.title} ${clients.find(item => item.id === doc.lead_id)?.name ?? ""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  return <section className="documents-workspace">
    <header className="documents-heading"><div><h1>Documentos</h1><p>Notas, propostas e contratos junto de cada cliente.</p></div><div className="documents-actions"><Button className="secondary-button" isDisabled={busy} onPress={() => input.current?.click()}><Upload size={16} /> Enviar arquivo</Button><Button className="primary-button" isDisabled={busy} onPress={() => void create()}><Plus size={16} /> Criar documento</Button></div></header>
    <input ref={input} type="file" hidden accept=".pdf,.docx,.md,.txt" onChange={event => { const file = event.target.files?.[0]; if (file) void create(file); }} />
    <div className="documents-toolbar"><div className="documents-filters" role="group" aria-label="Filtrar documentos">{[["all", "Todos"], ["notes", "Documentos"], ["contracts", "Contratos"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><label className="documents-search"><Search size={16} /><input aria-label="Buscar documento ou cliente" placeholder="Buscar documento ou cliente" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    {error && <div className="documents-error" role="alert">{error} <button onClick={() => void load()}>Tentar novamente</button></div>}
    {busy && <p role="status">Preparando documento...</p>}
    {loading ? <p role="status">Carregando documentos...</p> : visible.length ? <div className="documents-grid">{visible.map(doc => {const actions:ItemAction[]=[{label:'Abrir documento',icon:<FileText size={15}/>,run:()=>setSelected(doc)},{label:'Copiar título',run:()=>{void navigator.clipboard.writeText(doc.title).catch(()=>setError('Não foi possível copiar o título.'));}},...(urls[doc.id]?[{label:'Abrir arquivo original',icon:<Download size={15}/>,run:()=>{window.open(urls[doc.id],'_blank','noopener,noreferrer');}}]:[])];return <ItemContextMenu key={doc.id} actions={actions} label={`Ações de ${doc.title}`} trigger={<div className="document-card-shell"><button className="document-card" aria-label={`Abrir documento ${doc.title}`} key={doc.id} onClick={() => setSelected(doc)}>
      <DocumentCardPreview document={doc} url={urls[doc.id]} />
      <div className="document-card-info"><strong>{doc.title}</strong><span>{clients.find(item => item.id === doc.lead_id)?.name ?? "Sem cliente vinculado"}</span><div><small>{doc.is_contract ? doc.signed_on ? "Assinatura informada" : "Aguardando assinatura" : doc.kind === "note" ? "Documento" : "Arquivo"}</small><time>{new Date(doc.updated_at).toLocaleDateString("pt-BR")}</time></div></div>
    </button><ActionsButton label={`Ações de ${doc.title}`} actions={actions}/></div>}/>;})}</div> : <div className="documents-empty"><FileText size={34} /><h2>{query || filter !== "all" ? "Nenhum documento encontrado" : "Seu primeiro documento começa aqui"}</h2><p>{query || filter !== "all" ? "Ajuste a busca ou o filtro." : "Crie uma nota ou envie um PDF para organizar seus arquivos por cliente."}</p></div>}
    {selected && client && <DocumentDetail key={selected.id} document={selected} clients={clients} client={client} onClose={() => setSelected(null)} onSaved={doc => { setSelected(doc); setDocuments(rows => [doc, ...rows.filter(row => row.id !== doc.id)]); }} />}
  </section>;
}

export function DocumentCardPreview({ document: doc, url }: { document: ClientDocument; url?: string }) {
  return <div className="document-paper"><div className="document-preview-sheet">
    {doc.kind === "note" ? <div className="document-paper-text"><strong className="document-preview-title">{doc.title}</strong>{doc.markdown ? <ReactMarkdown components={{ a: ({ children }) => <span>{children}</span>, img: () => null }}>{doc.markdown.slice(0, 4000)}</ReactMarkdown> : <p className="document-preview-blank">Documento em branco</p>}</div> : doc.mime_type === "application/pdf" ? url ? <PdfPreview key={url} url={url} title={doc.title} thumbnail /> : <div className="document-preview-message"><FileText size={28} /><span>Prévia de PDF indisponível</span></div> : <div className="document-file-placeholder"><FileText size={32} /><strong>{doc.title}</strong><span>Documento Word</span></div>}
  </div><span className="document-preview-format">{doc.kind === "note" ? "Documento" : doc.mime_type === "application/pdf" ? "PDF" : "Word"}</span></div>;
}

export function DocumentDetail({ document: doc, clients, client, onClose, onSaved }: { document: ClientDocument; clients: Client[]; client: NonNullable<ReturnType<typeof createClient>>; onClose: () => void; onSaved: (doc: ClientDocument) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(doc.title);
  const [markdown, setMarkdown] = useState(doc.markdown);
  const [leadId, setLeadId] = useState(doc.lead_id ?? "");
  const [contract, setContract] = useState(doc.is_contract);
  const [signedOn, setSignedOn] = useState(doc.signed_on ?? "");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(false);
  const dirty = title !== doc.title || markdown !== doc.markdown || leadId !== (doc.lead_id ?? "") || contract !== doc.is_contract || signedOn !== (doc.signed_on ?? "");
  const close = () => { if (!saving && (!dirty || window.confirm("Sair sem salvar as alterações?"))) onClose(); };
  useEffect(() => { dialog.current?.showModal(); const overflow = window.document.body.style.overflow; window.document.body.style.overflow = "hidden"; return () => { window.document.body.style.overflow = overflow; }; }, []);
  useEffect(() => { if (!doc.storage_path) return; let active = true; void client.storage.from(bucket).createSignedUrl(doc.storage_path, 3600).then(result => { if (!active) return; if (result.error) setError("Não foi possível abrir o arquivo."); else setUrl(result.data.signedUrl); }); return () => { active = false; }; }, [client, doc.storage_path]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  async function save() {
    if (!title.trim()) { setError("Dê um título ao documento."); return; }
    setSaving(true); setError("");
    try {
      const result = await client.from("client_documents").update({ title: title.trim(), markdown, lead_id: leadId || null, is_contract: contract, signed_on: contract && signedOn ? signedOn : null }).eq("id", doc.id).eq("updated_at", doc.updated_at).select("*").single();
      if (result.error) throw result.error;
      setTitle(current => current === title ? title.trim() : current);
      onSaved(result.data as ClientDocument);
    } catch { setError("Não foi possível salvar. O documento pode ter mudado em outra aba. Seu texto continua neste editor; copie-o antes de recarregar."); }
    finally { setSaving(false); }
  }
  function exportMarkdown() { const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" }); const objectUrl = URL.createObjectURL(blob); const anchor = window.document.createElement("a"); anchor.href = objectUrl; anchor.download = `${title.replace(/[\\/:*?"<>|]/g, "-") || "documento"}.md`; anchor.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); }
  return <dialog ref={dialog} className="document-detail" aria-label="Editar documento" onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (!saving) void save(); } }}>
    <header className="document-detail-header"><div className="document-detail-breadcrumb"><button onClick={close}><ArrowLeft size={16} /><span>Documentos</span></button><ChevronRight size={14} /><span>{title || "Sem título"}</span></div><div className="document-detail-actions"><span className="document-save-status" role="status">{saving ? "Salvando..." : dirty ? "Alterações não salvas" : <><Check size={14} /> Salvo</>}</span><button className="document-details-toggle" aria-label="Detalhes do documento" aria-expanded={details} aria-controls="document-properties-panel" onClick={() => setDetails(!details)}><PanelRight size={16} /><span>Detalhes</span></button>{doc.kind === "note" ? <button className="document-export-button" title="Exportar Markdown" aria-label="Exportar Markdown" onClick={exportMarkdown}><Download size={16} /></button> : url ? <a className="document-export-button" title="Abrir arquivo original" aria-label="Abrir arquivo original" href={url} target="_blank" rel="noreferrer"><Download size={16} /></a> : null}<Button className="primary-button" isDisabled={saving || !dirty} onPress={() => void save()}>Salvar</Button></div></header>
    <div className="document-detail-layout">
      <main className="document-detail-main"><div className="document-title-area"><div className="document-context"><span>{contract ? "Contrato" : doc.kind === "note" ? "Documento" : "Arquivo"}</span><button onClick={() => setDetails(true)}>{clients.find(item => item.id === leadId)?.name ?? "Vincular cliente"}<ChevronRight size={12} /></button></div><input className="document-title" aria-label="Título do documento" autoFocus value={title} placeholder="Sem título" maxLength={200} onChange={event => setTitle(event.target.value)} />{contract && <p className="document-signature-summary">{signedOn ? `Assinatura informada em ${new Date(`${signedOn}T12:00:00`).toLocaleDateString("pt-BR")}` : "Aguardando assinatura"}</p>}</div>
        {error && <div className="documents-error document-detail-error" role="alert">{error}</div>}
        {doc.kind === "note" ? <Editor value={markdown} onChange={setMarkdown} /> : doc.mime_type === "application/pdf" && url ? <div className="document-file-reader"><PdfPreview key={url} url={url} title={doc.title} /></div> : <div className="documents-empty"><FileText size={40} /><p>{url ? "Este formato está disponível para download." : "Carregando arquivo..."}</p>{url && <a className="secondary-button" href={url} target="_blank" rel="noreferrer">Abrir arquivo original</a>}</div>}
      </main>
      {details && <aside className="document-properties-panel" id="document-properties-panel" aria-label="Detalhes do documento"><div className="document-properties-heading"><h2>Detalhes</h2><button aria-label="Fechar detalhes" onClick={() => setDetails(false)}><X size={16} /></button></div><div className="document-properties"><label>Cliente<AppSelect value={leadId} onChange={event => setLeadId(event.target.value)}><option value="">Sem cliente vinculado</option>{clients.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</AppSelect></label><label className="document-contract-toggle"><input type="checkbox" checked={contract} onChange={event => { setContract(event.target.checked); if (!event.target.checked) setSignedOn(""); }} /> É um contrato</label>{contract && <label>Data da assinatura<input type="date" value={signedOn} onChange={event => setSignedOn(event.target.value)} /><span className="document-property-help">Informação manual. Não verifica assinatura eletrônica.</span></label>}<dl><dt>Criado em</dt><dd>{new Date(doc.created_at).toLocaleDateString("pt-BR")}</dd><dt>Último salvamento</dt><dd>{new Date(doc.updated_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</dd>{doc.file_size && <><dt>Tamanho</dt><dd>{(doc.file_size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB</dd></>}</dl></div></aside>}
    </div>
  </dialog>;
}
