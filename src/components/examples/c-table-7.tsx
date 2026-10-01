"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, ExternalLink, Star } from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/reui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Lead, LeadStatus } from "@/lib/crm-types";
import { stages } from "@/lib/crm-types";
import { toWhatsAppE164 } from "@/lib/whatsapp";

type LeadsTableProps = {
  leads: Lead[];
  loading?: boolean;
  error?: boolean;
  onSelect: (lead: Lead) => void;
  onStageChange: (id: string, status: LeadStatus) => Promise<void>;
  onFavoriteChange: (id: string, favorite: boolean) => Promise<void>;
  onNotice: (message: string) => void;
};

function webUrl(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function LeadAvatar({ lead }: { lead: Lead }) {
  const [failed, setFailed] = useState(false);
  const initials = lead.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR");
  return <span className="inline-grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[var(--crm-lime-soft)] text-[11px] font-semibold text-[var(--crm-lime)]">
    {lead.foto_ref && !failed ? <img src={`/api/lead-photo?ref=${encodeURIComponent(lead.foto_ref)}`} alt="" loading="lazy" width={40} height={40} className="size-10 object-cover" onError={() => setFailed(true)} /> : initials || "—"}
  </span>;
}

function OpportunityBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-[var(--crm-faint)]">—</span>;
  const level = score >= 80 ? "Alta" : score >= 50 ? "Média" : "Baixa";
  const color = score >= 80 ? "text-[var(--crm-lime)]" : score >= 50 ? "text-[var(--warning)]" : "text-[var(--crm-muted)]";
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[var(--crm-text)]"><span className={`size-1.5 rounded-full bg-current ${color}`} /><strong>{level} · {score}</strong></span>;
}

function QuickContacts({ lead, onNotice }: { lead: Lead; onNotice: (message: string) => void }) {
  const phone = lead.phone?.trim();
  const whatsapp = toWhatsAppE164(phone);
  const site = webUrl(lead.website);
  const instagram = webUrl(lead.instagram?.startsWith("@") ? `https://www.instagram.com/${lead.instagram.slice(1)}` : lead.instagram);
  const maps = webUrl(lead.maps_url) ?? (lead.place_id || lead.address ? new URL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lead.name, lead.address].filter(Boolean).join(" "))}${lead.place_id ? `&query_place_id=${encodeURIComponent(lead.place_id)}` : ""}`) : null);
  const pill = "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-[var(--crm-line-strong)] px-2.5 text-[10px] font-medium text-[var(--crm-muted)] transition-colors duration-150 hover:border-[var(--crm-lime)] hover:text-[var(--crm-lime)] focus-visible:outline-2 focus-visible:outline-[var(--crm-lime)]";
  return <div className="flex items-center gap-1.5 whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
    {phone && <button type="button" className={pill} onClick={async () => { try { await navigator.clipboard.writeText(phone); onNotice("Telefone copiado."); } catch { onNotice("Não foi possível copiar o telefone."); } }}><Copy size={11} />Copiar</button>}
    {whatsapp && <a className={`${pill} text-[var(--crm-lime)]`} href={`https://wa.me/${whatsapp.slice(1)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
    {site && <a className={pill} href={site.href} target="_blank" rel="noopener noreferrer">Site</a>}
    {instagram && instagram.hostname.endsWith("instagram.com") && <a className={pill} href={instagram.href} target="_blank" rel="noopener noreferrer">Instagram</a>}
    {maps && <a className={pill} href={maps.href} target="_blank" rel="noopener noreferrer">Maps</a>}
  </div>;
}

function StageSelect({ lead, onStageChange }: { lead: Lead; onStageChange: LeadsTableProps["onStageChange"] }) {
  const [busy, setBusy] = useState(false);
  return <select aria-label={`Estágio de ${lead.name}`} value={lead.status} disabled={busy} onClick={(event) => event.stopPropagation()} onChange={async (event) => { setBusy(true); try { await onStageChange(lead.id, event.target.value as LeadStatus); } finally { setBusy(false); } }} className="h-8 max-w-36 rounded-lg border border-[var(--crm-line-strong)] bg-[var(--crm-surface-soft)] px-2 text-[10px] text-[var(--crm-text)] outline-none transition-colors duration-150 hover:border-[var(--crm-lime)] focus-visible:border-[var(--crm-lime)]">
    {stages.map((stage) => <option key={stage.slug} value={stage.slug}>{stage.name}</option>)}
  </select>;
}

function LeadRow({ lead, onSelect, onStageChange, onFavoriteChange, onNotice }: LeadsTableProps & { lead: Lead }) {
  const site = webUrl(lead.website);
  const location = [lead.cidade, lead.uf].filter(Boolean).join(" - ");
  return <TableRow className="lead-table-row" tabIndex={0} aria-label={`Abrir detalhes de ${lead.name}`} onClick={() => onSelect(lead)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(lead); } }}>
    <TableCell><button type="button" aria-label={lead.favorito ? `Remover ${lead.name} dos favoritos` : `Favoritar ${lead.name}`} aria-pressed={Boolean(lead.favorito)} onClick={(event) => { event.stopPropagation(); void onFavoriteChange(lead.id, !lead.favorito); }} className="text-[var(--crm-faint)] transition-colors duration-150 hover:text-[var(--crm-lime)] focus-visible:outline-2 focus-visible:outline-[var(--crm-lime)]"><Star size={16} fill={lead.favorito ? "currentColor" : "none"} className={lead.favorito ? "text-[var(--crm-lime)]" : ""} /></button></TableCell>
    <TableCell><div className="flex min-w-0 items-center gap-2.5"><LeadAvatar lead={lead} /><div className="min-w-0"><strong className="block truncate text-[11px] font-semibold text-[var(--crm-text)]" title={lead.name}>{lead.name}</strong><span className="block truncate text-[10px] text-[var(--crm-muted)]">{location || "—"}</span>{lead.foto_ref && lead.foto_atribuicao?.length ? <span className="block truncate text-[8px] text-[var(--crm-faint)]">Foto: {lead.foto_atribuicao.map((author, index) => { const url = webUrl(author.uri); return <span key={index}>{index > 0 ? ", " : ""}{url ? <a href={url.href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="hover:underline">{author.displayName}</a> : author.displayName}</span>; })}</span> : null}</div></div></TableCell>
    <TableCell><OpportunityBadge score={lead.score} /></TableCell>
    <TableCell>{lead.nota_google == null ? "—" : <span className="whitespace-nowrap"><strong className="text-[var(--crm-text)]">★ {lead.nota_google.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong><span className="ml-1.5 text-[var(--crm-muted)]">{lead.total_avaliacoes == null ? "—" : `${lead.total_avaliacoes.toLocaleString("pt-BR")} aval.`}</span></span>}</TableCell>
    <TableCell>{site ? <a href={site.href} target="_blank" rel="noopener noreferrer" title={site.href} onClick={(event) => event.stopPropagation()} className="block max-w-28 truncate text-[var(--crm-lime)] hover:underline">{site.hostname.replace(/^www\./, "")}</a> : <Badge variant="warning-light" radius="full" size="sm" className="border-[var(--warning)]/20 bg-[var(--warning)]/10 text-[var(--warning)]">Sem site próprio</Badge>}</TableCell>
    <TableCell><QuickContacts lead={lead} onNotice={onNotice} /></TableCell>
    <TableCell><StageSelect lead={lead} onStageChange={onStageChange} /></TableCell>
    <TableCell><button type="button" onClick={(event) => { event.stopPropagation(); onSelect(lead); }} className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--crm-line-strong)] px-2.5 text-[10px] font-medium text-[var(--crm-text)] transition-colors duration-150 hover:border-[var(--crm-lime)] hover:text-[var(--crm-lime)] focus-visible:outline-2 focus-visible:outline-[var(--crm-lime)]">Detalhes <ExternalLink size={10} /></button></TableCell>
  </TableRow>;
}

export function LeadsTable({ leads, loading = false, error = false, onSelect, onStageChange, onFavoriteChange, onNotice }: LeadsTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = leads.length > 100;
  const virtualizer = useVirtualizer({ count: leads.length, getScrollElement: () => scrollRef.current, estimateSize: () => 61, overscan: 8, enabled: virtual });
  const items = virtual ? virtualizer.getVirtualItems() : [];
  const visible = virtual ? items.map((item) => leads[item.index]) : leads;
  const top = virtual && items.length ? items[0].start : 0;
  const bottom = virtual && items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const rowProps = { leads, onSelect, onStageChange, onFavoriteChange, onNotice };
  return <div ref={scrollRef} className="lead-table-wrap max-h-[min(68vh,640px)] overflow-y-auto [scrollbar-color:var(--crm-faint)_transparent] [scrollbar-width:thin]">
    <Table className="leads-table !min-w-[1320px]">
      <colgroup><col className="w-9" /><col className="w-[225px]" /><col className="w-[105px]" /><col className="w-[145px]" /><col className="w-[135px]" /><col className="w-[385px]" /><col className="w-[145px]" /><col className="w-[95px]" /></colgroup>
      <TableHeader><TableRow>{["", "Lead", "Oportunidade", "Google", "Site", "Contatos rápidos", "Estágio", "Ações"].map((label, index) => <TableHead key={index}>{label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>
        {loading ? Array.from({ length: 6 }, (_, index) => <TableRow key={index} aria-hidden="true">{Array.from({ length: 8 }, (_, cell) => <TableCell key={cell}><span className="block h-4 motion-safe:animate-pulse rounded bg-[var(--crm-line-strong)]" /></TableCell>)}</TableRow>) : leads.length ? <>
          {top > 0 && <TableRow aria-hidden="true"><TableCell colSpan={8} style={{ height: top, padding: 0 }} /></TableRow>}
          {visible.map((lead) => <LeadRow key={lead.id} lead={lead} {...rowProps} />)}
          {bottom > 0 && <TableRow aria-hidden="true"><TableCell colSpan={8} style={{ height: bottom, padding: 0 }} /></TableRow>}
        </> : <TableRow><TableCell colSpan={8} className="lead-table-empty"><strong>{error ? "Não foi possível carregar os leads" : "Nenhum lead encontrado"}</strong><span>{error ? "Tente atualizar a página." : "Adicione um lead ou ajuste a busca e o filtro."}</span></TableCell></TableRow>}
      </TableBody>
    </Table>
  </div>;
}
