"use client";

import {AppSelect} from "@/components/app-select";

import {
  BookOpenText,
  ChevronDown,
  ChevronRight,
  Clock3,
  GripVertical,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Target,
  X,
} from "lucide-react";
import Image from "next/image";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { type Lead, type LeadStatus, stages } from "@/lib/crm-types";
import { LeadSearchModule } from "@/components/lead-search";
import { MessagesWidget } from "@/components/collaboration";
import { EventCalendarModule } from "@/components/event-calendar";
import { CalendarIntegrationsModule } from "@/components/calendar-integrations";
import { LeadsTable } from "@/components/examples/c-table-7";
import { PriceCalculator } from "@/components/price-calculator";
import { ProfilePage, type Profile } from "@/components/profile-page";
import { NotificationsMenu } from "@/components/notifications-menu";
import { PresenceTracker } from "@/components/presence-tracker";
import { useAppToast } from "@/components/app-toast-provider";
import { publishSharedNotification } from "@/lib/notifications";
import { fetchLeads } from "@/lib/leads-data";
import { UserManagement } from "@/components/user-management";
import { MessageLibrary } from "@/components/message-library";
import './commercial.css';
import { CommercialDashboard, CrmFiltersBar } from './commercial-dashboard';
import {disconnectPush} from "@/lib/push-client";
import {PeopleProvider} from './people-provider';
import {AddLeadDialog} from './add-lead-dialog';
import {DeleteLeadDialog} from './delete-lead-dialog';
import {ActionsButton} from './item-actions';
import {LeadActionsProvider,LeadContextMenu,LeadActionsButton,type LeadIntent} from './lead-actions';
import { LeadWorkspace } from './lead-workspace';
import { CrmTasks } from './crm-tasks';
import { CrmAudit } from './crm-audit';
import { useCrmWorkspace } from './use-crm-workspace';
import { matchesLead, type CrmFilters } from '@/lib/crm-insights';
import { WhatsAppPage } from "@/components/whatsapp-page";
import { CanvasWorkspace } from "@/components/canvas-workspace";
import { CommercialDocuments } from "@/components/contracts-library";
import { PlansWorkspace } from "@/components/plans-workspace";

type View = "calculator" | "analytics" | "audit" | "documents" | "canvas" | "plans" | "company" | "overview" | "leads" | "pipeline" | "prospecting" | "messages" | "whatsapp" | "tasks" | "calendar" | "settings" | "profile" | "users";

type NavGroup = { id: string; label: string; icon: typeof LayoutDashboard; items: { label: string; view: View; adminOnly?: boolean }[] };
const navGroups: NavGroup[] = [
  { id: "commercial", label: "Comercial", icon: Target, items: [{ label: "Pipeline", view: "pipeline" }, { label: "Encontrar leads", view: "prospecting" }, { label: "Calculadora", view: "calculator" }, { label: "Analytics", view: "analytics" }] },
  { id: "communication", label: "Comunicação", icon: MessageCircle, items: [{ label: "WhatsApp", view: "whatsapp" }, { label: "Mensagens prontas", view: "messages" }] },
  { id: "work", label: "Trabalho", icon: BookOpenText, items: [{ label: "Tarefas", view: "tasks" }, { label: "Agenda", view: "calendar" }, { label: "Canvas", view: "canvas" }, { label: "Documentos", view: "documents" }] },
  { id: "management", label: "Gestão", icon: Settings, items: [{ label: "Integrações", view: "settings" }, { label: "Auditoria", view: "audit" }, { label: "Planos", view: "plans", adminOnly: true }, { label: "Empresa", view: "company", adminOnly: true }, { label: "Usuários", view: "users", adminOnly: true }] },
];
function matchesNavView(current: View, destination: View) {
  return current === destination || (destination === "pipeline" && current === "leads");
}

const defaultAccentColor = "#8ee343";

function normalizeAccentColor(color?: string | null) {
  return color && /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : defaultAccentColor;
}

function colorChannels(color: string) {
  return color.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16)) ?? [142, 227, 67];
}

function tintColor(color: string, amount: number) {
  return `#${colorChannels(color).map((channel) => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function accentHoverColor(color: string) {
  return color === defaultAccentColor ? "#b2f276" : tintColor(color, 0.24);
}


function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function statusLabel(status: LeadStatus) {
  return stages.find((stage) => stage.slug === status)?.name ?? status;
}

export function CrmDashboard({ userEmail, profile, isAdmin = false, initialView, integrationReturn }: { userEmail?: string; profile: Profile | null; isAdmin?: boolean; initialView?: View; integrationReturn?: { status: "connected" | "error"; provider?: string } | null }) {
  const [view, setView] = useState<View>(initialView ?? "overview");
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openNavGroups, setOpenNavGroups] = useState<string[]>(() => navGroups.filter((group) => group.items.some((item) => matchesNavView(initialView ?? "overview", item.view))).map((group) => group.id));
  const [taskTab, setTaskTab] = useState("pending");
  const [commercialFilter, setCommercialFilter] = useState<CrmFilters>({});
  const [desiredStage, setDesiredStage] = useState<LeadStatus | null>(null);
  const workspace = useCrmWorkspace();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStatus | "all">("all");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState(false);
  const [leadSort, setLeadSort] = useState<"score" | "reviews" | "rating" | "recent">("score");
  const [leadToDelete,setLeadToDelete]=useState<Lead|null>(null);
  const [leadIntent,setLeadIntent]=useState<LeadIntent>('details');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const openChat=useCallback(()=>setIsChatOpen(true),[]);
  useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active&&new URLSearchParams(window.location.search).get("chat")==="open")openChat();});window.addEventListener("prospecta:open-chat",openChat);return()=>{active=false;window.removeEventListener("prospecta:open-chat",openChat);};},[openChat]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [todayLabel] = useState(() => {
    const label = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
    return `${label.charAt(0).toLocaleUpperCase("pt-BR")}${label.slice(1)}`;
  });
  const supabase = useMemo(() => createClient(), []);
  const toast = useAppToast();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    async function loadLeads() {
      if (!supabase) { if (active) setLeadsLoading(false); return; }
      try {
        const data = await fetchLeads(supabase);
        if (active) setLeads(data);
      } catch {
        if (active) { setLeadsError(true); toast("Não foi possível carregar os leads.", "error"); }
      } finally {
        if (active) setLeadsLoading(false);
      }
    }
    void loadLeads();
    const refreshLeads = () => void loadLeads();
    window.addEventListener("crm:changed", refreshLeads);
    return () => { active = false; window.removeEventListener("crm:changed", refreshLeads); };
  }, [supabase, toast]);


  useEffect(() => {
    if (!integrationReturn) return;
    const providerNames: Record<string, string> = { google: "Google Calendar", microsoft: "Outlook Calendar", notion: "Notion" };
    const providerName = providerNames[integrationReturn.provider ?? ""];
    if (integrationReturn.status === "connected" && providerName) toast(`${providerName} conectado.`, "success");
    else toast("Não foi possível concluir a conexão. Confira as configurações do provedor e tente novamente.", "error");
    router.replace("/", { scroll: false });
  }, [integrationReturn, router, toast]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return leads.map(lead => ({ ...lead, ...workspace.data?.leads.find(item => item.id === lead.id) })).filter((lead) => {
      const matchesSearch = !normalizedSearch || [lead.name, lead.email, lead.address, lead.phone, lead.website, lead.notes, lead.cidade, lead.uf, lead.instagram, lead.maps_url, lead.source, statusLabel(lead.status), lead.score, lead.nota_google, lead.total_avaliacoes, lead.created_at, lead.updated_at, lead.favorito ? "favorito" : null].filter((value) => value != null).some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalizedSearch));
      return matchesSearch && matchesLead(lead, commercialFilter) && (stageFilter === "all" || lead.status === stageFilter);
    });
  }, [leads, search, stageFilter, commercialFilter, workspace.data]);

  const sortedLeads = useMemo(() => [...filteredLeads].sort((a, b) => {
    const value = (lead: Lead) => leadSort === "score" ? lead.score : leadSort === "reviews" ? lead.total_avaliacoes : leadSort === "rating" ? lead.nota_google : new Date(lead.updated_at ?? lead.created_at ?? 0).getTime();
    const first = value(a) ?? -1;
    const second = value(b) ?? -1;
    return second - first || new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime();
  }), [filteredLeads, leadSort]);

  function changeView(nextView: View) {
    if (nextView === "documents" && initialView !== "documents") { router.push("/documents"); return; }
    if (nextView === "canvas" && initialView !== "canvas") { router.push("/canvas"); return; }
    if (nextView === "plans" && initialView !== "plans") { router.push("/planos"); return; }
    if (nextView === "company" && initialView !== "company") { router.push("/configuracoes/empresa"); return; }
    setView(nextView);
    const activeGroup = navGroups.find((group) => group.items.some((item) => matchesNavView(nextView, item.view)));
    if (activeGroup) setOpenNavGroups((current) => current.includes(activeGroup.id) ? current : [...current, activeGroup.id]);
    setSelectedLead(null);
    setDesiredStage(null);
    setMobileMenuOpen(false);
    if (nextView === "pipeline" || nextView === "overview") setStageFilter("all");
  }

  async function moveLead(leadId: string, status: LeadStatus) {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead || lead.status === status) return;
    if (["fechado", "perdido", "descartado"].includes(status)) { setDesiredStage(status); setSelectedLead(lead); return; }
    if (!supabase) { toast("Supabase não configurado.", "error"); return; }
    const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
    if (error) { toast("Não foi possível atualizar esse lead.", "error"); return; }
    window.dispatchEvent(new Event("crm:changed"));
    setLeads((current) => current.map((item) => item.id === leadId ? { ...item, status } : item));
    setSelectedLead((current) => current?.id === leadId ? { ...current, status } : current);
    void publishSharedNotification("lead_stage_changed", leadId).then((ok) => {
      if (!ok) toast("Lead atualizado, mas o aviso não chegou à equipe.", "error");
    });
  }

  async function toggleFavorite(leadId: string, favorito: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from("leads").update({ favorito }).eq("id", leadId);
    if (error) { toast("Não foi possível salvar o favorito. Confira a migração do banco.", "error"); return; }
    setLeads((current) => current.map((lead) => lead.id === leadId ? { ...lead, favorito } : lead));
    setSelectedLead((current) => current?.id === leadId ? { ...current, favorito } : current);
  }

  async function addLead(formData: FormData) {
    const newLead = {
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim().toLowerCase() || null,
      phone: String(formData.get("phone") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim(),
      website: String(formData.get("website") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      source: "manual",
      status: "novo" as LeadStatus,
    };
    if (!newLead.name) return;
    if (supabase) {
      const { data, error } = await supabase.from("leads").insert(newLead).select("*").single();
      if (error || !data) { toast("Não foi possível criar o lead. Confira sua conexão.", "error"); return; }
      setLeads((current) => [data as Lead, ...current]);
      void publishSharedNotification("lead_created", data.id).then((ok) => {
        if (!ok) toast("Lead cadastrado, mas o aviso não chegou à equipe.", "error");
      });
    }
    setIsAddOpen(false);
    if (!supabase) toast("Lead adicionado com sucesso.","success");
  }

  function handleImported(importedLeads: Lead[]) {
    setLeads((current) => [...importedLeads, ...current]);
  }

  async function signOut() {
    if (!supabase) return;
    await disconnectPush().catch(()=>undefined);
    await supabase.auth.signOut();
    router.push("/login");
  }

  const displayName = currentProfile?.full_name?.trim() || userEmail?.split("@")[0] || "Usuário";
  const firstName = displayName.split(/\s+/)[0];
  const accentColor = normalizeAccentColor(currentProfile?.avatar_color);
  const [accentRed, accentGreen, accentBlue] = colorChannels(accentColor);
  const crmThemeStyle = {
    "--crm-accent": accentColor,
    "--crm-accent-rgb": `${accentRed}, ${accentGreen}, ${accentBlue}`,
    "--crm-accent-hover": accentHoverColor(accentColor),
  } as CSSProperties;
  const toastActor=useMemo(()=>currentProfile?{id:currentProfile.id,name:currentProfile.full_name||"Você",avatar:currentProfile.avatar_url,color:currentProfile.avatar_color}:null,[currentProfile]);
  return (
    <PeopleProvider current={toastActor}><LeadActionsProvider open={(lead,intent)=>{if(intent==="delete"){setLeadToDelete(lead);return;}setLeadIntent(intent);setDesiredStage(null);setSelectedLead(lead);}} favorite={toggleFavorite} notice={message=>toast(message,"info")}><div className="crm-shell" style={crmThemeStyle}>
      <aside className={`sidebar sidebar-rail ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <Image className="brand-logo" src="/prospecta-logo.svg" alt="Prospecta" width={46} height={19} />
          <div className="brand-copy"><p className="brand-name">prospecta</p><p className="brand-subtitle">CRM de prospecção</p></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          <button type="button" title="Visão geral" aria-label="Visão geral" aria-current={view === "overview" ? "page" : undefined} className={`nav-item ${view === "overview" ? "nav-item-active" : ""}`} onClick={() => changeView("overview")}><LayoutDashboard size={18} /><span>Visão geral</span></button>
          {navGroups.map((group) => {
            const Icon = group.icon;
            const items = group.items.filter((item) => !item.adminOnly || isAdmin);
            const active = items.some((item) => matchesNavView(view, item.view));
            const expanded = openNavGroups.includes(group.id);
            return <div className={`sidebar-category ${active ? "sidebar-category-current" : ""}`} data-expanded={expanded} key={group.id}>
              <button type="button" title={group.label} aria-label={group.label} aria-expanded={expanded} aria-controls={`nav-${group.id}`} className="nav-item sidebar-category-trigger" onClick={() => setOpenNavGroups((current) => expanded ? current.filter((id) => id !== group.id) : [...current, group.id])}>
                <Icon size={18} /><span>{group.label}</span><ChevronDown size={14} className={`sidebar-category-chevron ${expanded ? "is-expanded" : ""}`} />
              </button>
              <div id={`nav-${group.id}`} className="sidebar-tree-reveal" aria-hidden={!expanded} inert={!expanded}><div className="sidebar-tree-clip"><ul className="sidebar-tree">
                {items.map((item, index) => {
                  const selected = matchesNavView(view, item.view);
                  return <li key={item.view} style={{ "--nav-index": index } as CSSProperties}><button type="button" aria-current={selected ? "page" : undefined} className={`sidebar-tree-link ${selected ? "is-current" : ""}`} onClick={() => changeView(item.view)}>{item.label}</button></li>;
                })}
              </ul></div></div>
            </div>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className={`profile-row ${view === "profile" ? "profile-row-active" : ""}`} title="Meu perfil" aria-label="Meu perfil" onClick={() => changeView("profile")}><div className="profile-avatar" style={currentProfile?.avatar_color ? { backgroundColor: currentProfile.avatar_color } : undefined}>{currentProfile?.avatar_url ? <Image src={currentProfile.avatar_url} alt="" width={34} height={34} unoptimized /> : initials(displayName)}</div><div className="profile-copy"><strong>{displayName}</strong><span>{userEmail}</span></div></button>
          <button className="nav-item sidebar-signout" title="Sair da conta" aria-label="Sair da conta" onClick={signOut}><LogOut size={18} /><span>Sair</span></button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><button className="icon-button desktop-panel-button" aria-label="Alternar painel"><PanelLeft size={19} /></button><div className="breadcrumb"><span>Prospecta</span><ChevronRight size={14} /><strong>{view === "analytics" ? "Analytics" : view === "audit" ? "Auditoria" : view === "documents" ? "Documentos" : view === "canvas" ? "Canvas" : view === "plans" ? "Planos" : view === "company" ? "Empresa" : view === "profile" ? "Meu perfil" : view === "users" ? "Usuários" : view === "pipeline" ? "Pipeline" : view === "leads" ? "Leads" : view === "prospecting" ? "Encontrar leads" : view === "messages" ? "Mensagens prontas" : view === "whatsapp" ? "WhatsApp" : view === "tasks" ? "Tarefas" : view === "calendar" ? "Agenda" : view === "settings" ? "Configurações" : "Visão geral"}</strong></div></div>
          <div className="topbar-actions">{!["overview", "analytics", "audit", "profile", "users", "messages", "whatsapp", "settings", "plans", "company", "calculator"].includes(view) && <button className="dashboard-period" type="button" title="Período atual"><Clock3 size={14} /> Todos os registros <ChevronDown size={14} /></button>}<NotificationsMenu userId={currentProfile?.id ?? null} onOpenChat={openChat} /></div>
        </header>
        <div className="page-wrap">
          {view === "documents" ? (
            <CommercialDocuments onSelect={setSelectedLead} />
          ) : view === "canvas" ? (
            <CanvasWorkspace />
          ) : (view === "plans" || view === "company") && isAdmin ? (
            <PlansWorkspace initialTab={view === "company" ? "company" : "plans"} />
          ) : view === "profile" ? (
            <ProfilePage profile={currentProfile} email={userEmail} onSaved={setCurrentProfile} onSignOut={signOut} />
          ) : view === "users" && isAdmin ? (
            <UserManagement currentUserId={currentProfile?.id ?? ""} />
          ) : view === "calculator" ? (
            <PriceCalculator />
          ) : view === "prospecting" ? (
            <LeadSearchModule onImported={handleImported} onNotice={message=>toast(message,"info")} />
          ) : view === "messages" ? (
            <MessageLibrary userId={currentProfile?.id ?? null} onOpenWhatsApp={() => changeView("whatsapp")} />
          ) : view === "whatsapp" ? (
            <WhatsAppPage leads={leads} supabase={supabase} onOpenLibrary={() => changeView("messages")} onOpenLeads={() => changeView("leads")} onOpenLead={setSelectedLead} />
          ) : view === "tasks" ? (
            <CrmTasks initialTab={taskTab} onSelect={setSelectedLead} />
          ) : view === "calendar" ? (
            <EventCalendarModule />
          ) : view === "settings" ? (
            <CalendarIntegrationsModule />
          ) : view === "audit" ? (<CrmAudit onSelect={setSelectedLead} />
          ) : view === "overview" || view === "analytics" ? (
            <CommercialDashboard accent={accentColor} firstName={firstName} todayLabel={todayLabel} analytics={view === "analytics"} onTasks={(filter) => { setTaskTab(filter || "pending"); changeView("tasks"); }} onFilter={(filters) => { changeView("leads"); setCommercialFilter(filters); setStageFilter("all"); }} onAdd={() => setIsAddOpen(true)} onSelect={setSelectedLead} />
          ) : (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">{todayLabel}</p><h1>Seu pipeline</h1><p className="heading-description">Acompanhe cada oportunidade até o próximo passo.</p></div>
                <button className="primary-button" onClick={() => setIsAddOpen(true)}><Plus size={17} /> Adicionar lead</button>
              </div>
              <section className="content-card">
                  <div className="content-card-header">
                  <div><h2>{view === "pipeline" ? "Pipeline de vendas" : "Leads recentes"}</h2><p>{filteredLeads.length} oportunidades encontradas</p></div>
                  <div className="view-actions flex-wrap">
                    <div className="segmented-control" role="group" aria-label="Visualização">
                      <button className={view === "pipeline" ? "segment-active" : ""} onClick={() => changeView("pipeline")}><LayoutDashboard size={15} /> Kanban</button>
                      <button className={view !== "pipeline" ? "segment-active" : ""} onClick={() => changeView("leads")}><List size={15} /> Lista</button>
                    </div>
                    
                    {view === "leads" && <label><span className="sr-only">Ordenar leads</span><AppSelect value={leadSort} onChange={(event) => setLeadSort(event.target.value as typeof leadSort)} aria-label="Ordenar leads" className="h-9 rounded-lg border border-[var(--crm-line-strong)] bg-[var(--crm-surface-raised)] px-2 text-[10px] text-[var(--crm-text)] outline-none transition-colors duration-150 hover:border-[var(--crm-accent)] focus-visible:border-[var(--crm-accent)]"><option value="score">Ordenar: oportunidade</option><option value="reviews">Ordenar: avaliações</option><option value="rating">Ordenar: nota Google</option><option value="recent">Ordenar: mais recentes</option></AppSelect></label>}
                  </div>
                </div>
                {workspace.data && <CrmFiltersBar data={workspace.data} value={commercialFilter} onChange={setCommercialFilter} period={false} />}
                <div className="toolbar">
                  <div className="search-field">
                    <Search size={17} />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nos dados do lead" aria-label="Buscar por nome, telefone, endereço, site ou observação" />
                    {search && <button onClick={() => setSearch("")} aria-label="Limpar busca"><X size={14} /></button>}
                  </div>
                  <span className="toolbar-hint">{view === "pipeline" ? "Arraste os cards para atualizar o estágio" : "Clique em um lead para ver os detalhes"}</span>
                </div>
                <PipelineBoard key={view === "leads" ? `${leadSort}:${stageFilter}:${search}` : "pipeline"} leads={view === "leads" ? sortedLeads : filteredLeads} loading={leadsLoading} error={leadsError} onMove={moveLead} onFavoriteChange={toggleFavorite} onNotice={message=>toast(message,"info")} onSelect={setSelectedLead} onAdd={() => setIsAddOpen(true)} showList={view === "leads"} />
              </section>
            </>
          )}
        </div>
      </main>

      {selectedLead && <LeadWorkspace key={selectedLead.id} lead={selectedLead} desiredStage={desiredStage} initialIntent={leadIntent} onDeleteRequest={()=>{setLeadToDelete(selectedLead);setSelectedLead(null);setLeadIntent("details");}} onSaved={(updated) => { setLeads(current => current.map(l => l.id === updated.id ? updated : l)); setSelectedLead(updated); setDesiredStage(null); }} onClose={() => { setSelectedLead(null); setDesiredStage(null); setLeadIntent("details"); }} />}
      {leadToDelete&&<DeleteLeadDialog lead={leadToDelete} onClose={()=>setLeadToDelete(null)} onDeleted={id=>{setLeads(current=>current.filter(l=>l.id!==id));setLeadToDelete(null);toast("Lead apagado.","success");}}/>}
      {isAddOpen && <AddLeadDialog onClose={() => setIsAddOpen(false)} onSubmit={addLead} />}
      <PresenceTracker userId={currentProfile?.id ?? null} onOnlineChange={setOnlineUserIds} />
      <MessagesWidget profile={currentProfile} onlineUserIds={onlineUserIds} isOpen={isChatOpen} onOpenChange={setIsChatOpen} />
      {mobileMenuOpen && <button className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu" />}
    </div></LeadActionsProvider></PeopleProvider>
  );
}

function PipelineBoard({ leads, loading, error, onMove, onFavoriteChange, onNotice, onSelect, onAdd, showList }: { leads: Lead[]; loading: boolean; error: boolean; onMove: (id: string, status: LeadStatus) => Promise<void>; onFavoriteChange: (id: string, favorite: boolean) => Promise<void>; onNotice: (message: string) => void; onSelect: (lead: Lead) => void; onAdd: () => void; showList: boolean }) {
  const panRef = useRef<{ id: number; x: number; left: number } | null>(null);
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest(".lead-card, button, a, input, select, textarea, [role='menu']")) return;
    panRef.current = { id: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("is-panning");
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan) event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x);
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    panRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.classList.remove("is-panning");
  };
  if (showList) return <LeadsTable leads={leads} loading={loading} error={error} onSelect={onSelect} onStageChange={onMove} onFavoriteChange={onFavoriteChange} onNotice={onNotice} />;
  return <div className="kanban-grid" onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>{stages.map((stage) => { const stageLeads = leads.filter((lead) => lead.status === stage.slug); return <div className="kanban-column" key={stage.slug} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("leadId"); if (id) onMove(id, stage.slug); }}><div className="kanban-column-header"><div><span className="stage-dot" style={{ backgroundColor: stage.color }} /><h3>{stage.name}</h3><span className="column-count">{stageLeads.length}</span></div><ActionsButton label={`Opções de ${stage.name}`} actions={[{label:"Adicionar lead",run:onAdd},{label:"Copiar nomes desta etapa",disabled:!stageLeads.length,run:()=>{void navigator.clipboard.writeText(stageLeads.map(l=>l.name).join("\n")).then(()=>onNotice("Nomes copiados."),()=>onNotice("Não foi possível copiar."));}}]}/></div><div className="kanban-cards">{stageLeads.map((lead) => <LeadCard key={lead.id} lead={lead} onSelect={onSelect} />)}{stageLeads.length === 0 && <div className="empty-column">Solte um lead aqui</div>}</div><button className="add-card-button" onClick={onAdd}><Plus size={15} /> Adicionar lead</button></div>; })}</div>;
}

function LeadCard({ lead, onSelect }: { lead: Lead; onSelect: (lead: Lead) => void }) {
  return <LeadContextMenu lead={lead} trigger={<article className="lead-card" tabIndex={0} onKeyDown={e=>{if(e.target===e.currentTarget&&e.key==="Enter")onSelect(lead);}} draggable onDragStart={(event) => event.dataTransfer.setData("leadId", lead.id)} onClick={() => onSelect(lead)}><div className="lead-card-top"><span className="lead-source">{lead.source}</span><div className="crm-card-controls"><GripVertical className="drag-handle" size={16} /><LeadActionsButton lead={lead}/></div></div><h4>{lead.name}</h4><p>{lead.segment || lead.address}</p>{lead.estimated_value != null && <p className="crm-card-value">{new Intl.NumberFormat("pt-BR", { style:"currency",currency:"BRL" }).format(lead.estimated_value)}</p>}{lead.next_action_at && <p>Próximo passo: {new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short"}).format(new Date(lead.next_action_at))}</p>}{lead.plan_name && <small>{lead.plan_name} · {lead.contract_status || "Sem contrato"}</small>}<div className="lead-card-footer"><span className="lead-avatar small">{initials(lead.name)}</span><span>{lead.phone}</span></div></article>}/>;
}

