"use client";

import { Search, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { WhatsAppConversation } from "@/components/whatsapp-conversation";
import { WhatsAppMark } from "@/components/whatsapp-mark";
import type { Lead } from "@/lib/crm-types";
import { createClient } from "@/lib/supabase/client";

export function WhatsAppPage({ leads, supabase, onOpenLibrary, onOpenLeads, onOpenLead }: {
  leads: Lead[];
  supabase: ReturnType<typeof createClient>;
  onOpenLibrary: () => void;
  onOpenLeads: () => void;
  onOpenLead: (lead: Lead) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const contacts = useMemo(() => leads.filter((lead) => Boolean(lead.phone?.trim())), [leads]);
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const visibleContacts = contacts.filter((lead) => !query || `${lead.name} ${lead.phone}`.toLocaleLowerCase("pt-BR").includes(query));
  const selected = visibleContacts.find((lead) => lead.id === selectedId) ?? visibleContacts[0];

  return <div className="whatsapp-page">
    <header className="whatsapp-page-header"><div><h1>WhatsApp</h1><p>Suas conversas com os leads, em um só lugar.</p></div><button className="secondary-button" type="button" onClick={onOpenLibrary}>Mensagens prontas</button></header>
    {!contacts.length ? <div className="whatsapp-page-empty"><Users size={23} /><h2>Nenhum lead com telefone</h2><p>Adicione um telefone a um lead para começar a acompanhar a conversa por aqui.</p><button className="primary-button" type="button" onClick={onOpenLeads}>Ver leads</button></div> : <div className="whatsapp-page-layout">
      <aside className="whatsapp-contacts" aria-label="Leads para conversar">
        <div className="whatsapp-contacts-heading"><WhatsAppMark size={19} /><strong>Conversas</strong><span>{contacts.length}</span></div>
        <label className="whatsapp-contacts-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar lead" aria-label="Buscar lead para conversar" /></label>
        <div className="whatsapp-contacts-list">{visibleContacts.map((lead) => <button key={lead.id} type="button" className={selected?.id === lead.id ? "is-active" : ""} onClick={() => setSelectedId(lead.id)} aria-current={selected?.id === lead.id ? "true" : undefined}><span className="whatsapp-contact-avatar">{lead.name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span><span><strong>{lead.name}</strong><small>{lead.phone}</small></span></button>)}{!visibleContacts.length && <p>Nenhum lead encontrado para essa busca.</p>}</div>
      </aside>
      {selected ? <div className="whatsapp-conversation-pane"><div className="whatsapp-conversation-toolbar"><div className="whatsapp-conversation-identity"><span className="whatsapp-contact-avatar">{selected.name.slice(0, 1).toLocaleUpperCase("pt-BR")}</span><span><strong>{selected.name}</strong><small>{selected.phone}</small></span></div><button type="button" onClick={() => onOpenLead(selected)}>Ver lead</button></div><WhatsAppConversation key={selected.id} lead={selected} supabase={supabase} /></div> : <div className="whatsapp-conversation-pane"><div className="wa-chat-state">Nenhum contato corresponde à busca.</div></div>}
    </div>}
  </div>;
}
