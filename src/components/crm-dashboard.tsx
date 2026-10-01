"use client";

import {
  ArrowRight,
  BarChart3,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Filter,
  GripVertical,
  LayoutDashboard,
  List,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Target,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";

import { createClient } from "@/lib/supabase/client";
import { type Lead, type LeadStatus, stages } from "@/lib/crm-types";
import { LeadSearchModule } from "@/components/lead-search";
import { CollaborationModule, MessagesWidget } from "@/components/collaboration";
import { EventCalendarModule } from "@/components/event-calendar";
import { LeadsTable } from "@/components/examples/c-table-7";
import { ProfilePage, type Profile } from "@/components/profile-page";
import { GradientWaveText } from "@/components/gradient-wave-text";
import { NotificationsMenu } from "@/components/notifications-menu";
import { PresenceTracker } from "@/components/presence-tracker";
import { useAppToast } from "@/components/app-toast-provider";
import { publishSharedNotification } from "@/lib/notifications";
import { fetchLeads } from "@/lib/leads-data";
import { UserManagement } from "@/components/user-management";
import { MessageLibrary } from "@/components/message-library";
import { WhatsAppPage } from "@/components/whatsapp-page";
import { WhatsAppMark } from "@/components/whatsapp-mark";

type View = "overview" | "leads" | "pipeline" | "prospecting" | "messages" | "whatsapp" | "tasks" | "calendar" | "profile" | "users";

const navItems: Array<{ label: string; view: View; icon: typeof LayoutDashboard }> = [
  { label: "Visão geral", view: "overview", icon: LayoutDashboard },
  { label: "Leads", view: "leads", icon: Users },
  { label: "Pipeline", view: "pipeline", icon: Target },
  { label: "Encontrar leads", view: "prospecting", icon: Search },
  { label: "Mensagens prontas", view: "messages", icon: BookOpenText },
  { label: "WhatsApp", view: "whatsapp", icon: MessageCircle },
  { label: "Tarefas", view: "tasks", icon: Check },
  { label: "Agenda", view: "calendar", icon: CalendarDays },
];

const dashboardWaveColors = ["#b2f276", "#d5f3c1", "#eff7e9", "#a8e77b", "#79c944", "#b2f276"];

const numberFormatter = new Intl.NumberFormat("pt-BR");

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function statusLabel(status: LeadStatus) {
  return stages.find((stage) => stage.slug === status)?.name ?? status;
}

export function CrmDashboard({ userEmail, profile, isAdmin = false }: { userEmail?: string; profile: Profile | null; isAdmin?: boolean }) {
  const [view, setView] = useState<View>("overview");
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStatus | "all">("all");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState(false);
  const [leadSort, setLeadSort] = useState<"score" | "reviews" | "rating" | "recent">("score");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [todayLabel] = useState(() => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()));
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
    return () => { active = false; };
  }, [supabase, toast]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return leads.filter((lead) => {
      const matchesSearch = !normalizedSearch || [lead.name, lead.email, lead.address, lead.phone, lead.website, lead.notes, lead.cidade, lead.uf, lead.instagram, lead.maps_url, lead.source, statusLabel(lead.status), lead.score, lead.nota_google, lead.total_avaliacoes, lead.created_at, lead.updated_at, lead.favorito ? "favorito" : null].filter((value) => value != null).some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalizedSearch));
      return matchesSearch && (stageFilter === "all" || lead.status === stageFilter);
    });
  }, [leads, search, stageFilter]);

  const sortedLeads = useMemo(() => [...filteredLeads].sort((a, b) => {
    const value = (lead: Lead) => leadSort === "score" ? lead.score : leadSort === "reviews" ? lead.total_avaliacoes : leadSort === "rating" ? lead.nota_google : new Date(lead.updated_at ?? lead.created_at ?? 0).getTime();
    const first = value(a) ?? -1;
    const second = value(b) ?? -1;
    return second - first || new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime();
  }), [filteredLeads, leadSort]);

  const metrics = useMemo(() => {
    const closed = leads.filter((lead) => lead.status === "fechado").length;
    return {
      total: leads.length,
      open: leads.filter((lead) => lead.status !== "fechado" && lead.status !== "descartado").length,
      qualified: leads.filter((lead) => lead.status === "qualificado").length,
      closed,
      conversion: leads.length ? Math.round((closed / leads.length) * 100) : 0,
    };
  }, [leads]);

  function changeView(nextView: View) {
    setView(nextView);
    setSelectedLead(null);
    setMobileMenuOpen(false);
    if (nextView === "pipeline" || nextView === "overview") setStageFilter("all");
  }

  async function moveLead(leadId: string, status: LeadStatus) {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead || lead.status === status) return;
    if (!supabase) { toast("Supabase não configurado.", "error"); return; }
    const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
    if (error) { toast("Não foi possível atualizar esse lead.", "error"); return; }
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
    if (!supabase) setNotice("Lead adicionado com sucesso.");
  }

  function handleImported(importedLeads: Lead[]) {
    setLeads((current) => [...importedLeads, ...current]);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/login");
  }

  const displayName = currentProfile?.full_name?.trim() || userEmail?.split("@")[0] || "Usuário";
  const firstName = displayName.split(/\s+/)[0];
  return (
    <div className="crm-shell">
      <aside className={`sidebar sidebar-rail ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <Image className="brand-logo" src="/prospecta-logo.svg" alt="Prospecta" width={46} height={19} />
          <div className="brand-copy"><p className="brand-name">prospecta</p><p className="brand-subtitle">CRM de prospecção</p></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          <p className="nav-caption">CRM</p>
          {[...navItems, ...(isAdmin ? [{ label: "Usuários", view: "users" as const, icon: UserRoundCog }] : [])].map((item) => {
            const Icon = item.icon;
            const active = view === item.view;
            return <button key={item.view} title={item.label} aria-label={item.label} className={`nav-item ${active ? "nav-item-active" : ""}`} onClick={() => changeView(item.view)}>{item.view === "whatsapp" ? <WhatsAppMark size={18} /> : <Icon size={18} strokeWidth={active ? 2.3 : 1.8} />}<span>{item.label}</span></button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" title="Configurações" aria-label="Configurações" onClick={() => setNotice("Configurações em breve.")}><Settings size={18} /><span>Configurações</span></button>
          <button className="nav-item" title="Ajuda" aria-label="Ajuda" onClick={() => setNotice("Central de ajuda em breve.")}><CircleHelp size={18} /><span>Ajuda</span></button>
          <button className={`profile-row ${view === "profile" ? "profile-row-active" : ""}`} title="Meu perfil" aria-label="Meu perfil" onClick={() => changeView("profile")}><div className="profile-avatar" style={currentProfile?.avatar_color ? { backgroundColor: currentProfile.avatar_color } : undefined}>{currentProfile?.avatar_url ? <Image src={currentProfile.avatar_url} alt="" width={34} height={34} unoptimized /> : initials(displayName)}</div><div className="profile-copy"><strong>{displayName}</strong><span>{userEmail}</span></div></button>
          <button className="nav-item sidebar-signout" title="Sair da conta" aria-label="Sair da conta" onClick={signOut}><LogOut size={18} /><span>Sair</span></button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><button className="icon-button desktop-panel-button" aria-label="Alternar painel"><PanelLeft size={19} /></button><div className="breadcrumb"><span>Prospecta</span><ArrowRight size={14} /><strong>{view === "profile" ? "Meu perfil" : view === "users" ? "Usuários" : view === "pipeline" ? "Pipeline" : view === "leads" ? "Leads" : view === "prospecting" ? "Encontrar leads" : view === "messages" ? "Mensagens prontas" : view === "whatsapp" ? "WhatsApp" : view === "tasks" ? "Tarefas" : view === "calendar" ? "Agenda" : "Visão geral"}</strong></div></div>
          <div className="topbar-actions">{!["profile", "users", "messages", "whatsapp"].includes(view) && <button className="dashboard-period" type="button" title="Período atual"><Clock3 size={14} /> Todos os registros <ChevronDown size={14} /></button>}<NotificationsMenu userId={currentProfile?.id ?? null} onOpenChat={() => setIsChatOpen(true)} /></div>
        </header>
        <div className="page-wrap">
          {view === "profile" ? (
            <ProfilePage profile={currentProfile} email={userEmail} onSaved={setCurrentProfile} onSignOut={signOut} />
          ) : view === "users" && isAdmin ? (
            <UserManagement currentUserId={currentProfile?.id ?? ""} />
          ) : view === "prospecting" ? (
            <LeadSearchModule onImported={handleImported} onNotice={setNotice} />
          ) : view === "messages" ? (
            <MessageLibrary userId={currentProfile?.id ?? null} onOpenWhatsApp={() => changeView("whatsapp")} />
          ) : view === "whatsapp" ? (
            <WhatsAppPage leads={leads} supabase={supabase} onOpenLibrary={() => changeView("messages")} onOpenLeads={() => changeView("leads")} onOpenLead={setSelectedLead} />
          ) : view === "tasks" ? (
            <CollaborationModule />
          ) : view === "calendar" ? (
            <EventCalendarModule />
          ) : view === "overview" ? (
            <DashboardOverview firstName={firstName} todayLabel={todayLabel} leads={leads} metrics={metrics} onAdd={() => setIsAddOpen(true)} onSelect={setSelectedLead} />
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
                    <button className="secondary-button filter-button" onClick={() => setStageFilter(stageFilter === "all" ? "novo" : "all")}><Filter size={15} />{stageFilter === "all" ? "Filtrar" : statusLabel(stageFilter)}</button>
                    {view === "leads" && <label><span className="sr-only">Ordenar leads</span><select value={leadSort} onChange={(event) => setLeadSort(event.target.value as typeof leadSort)} aria-label="Ordenar leads" className="h-9 rounded-lg border border-[var(--crm-line-strong)] bg-[var(--crm-surface-raised)] px-2 text-[10px] text-[var(--crm-text)] outline-none transition-colors duration-150 hover:border-[var(--crm-lime)] focus-visible:border-[var(--crm-lime)]"><option value="score">Ordenar: oportunidade</option><option value="reviews">Ordenar: avaliações</option><option value="rating">Ordenar: nota Google</option><option value="recent">Ordenar: mais recentes</option></select></label>}
                  </div>
                </div>
                <div className="toolbar">
                  <div className="search-field">
                    <Search size={17} />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nos dados do lead" aria-label="Buscar por nome, telefone, endereço, site ou observação" />
                    {search && <button onClick={() => setSearch("")} aria-label="Limpar busca"><X size={14} /></button>}
                  </div>
                  <span className="toolbar-hint">{view === "pipeline" ? "Arraste os cards para atualizar o estágio" : "Clique em um lead para ver os detalhes"}</span>
                </div>
                <PipelineBoard key={view === "leads" ? `${leadSort}:${stageFilter}:${search}` : "pipeline"} leads={view === "leads" ? sortedLeads : filteredLeads} loading={leadsLoading} error={leadsError} onMove={moveLead} onFavoriteChange={toggleFavorite} onNotice={setNotice} onSelect={setSelectedLead} onAdd={() => setIsAddOpen(true)} showList={view === "leads"} />
              </section>
            </>
          )}
        </div>
      </main>

      {selectedLead && <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />}
      {isAddOpen && <AddLeadModal onClose={() => setIsAddOpen(false)} onSubmit={addLead} />}
      <PresenceTracker userId={currentProfile?.id ?? null} onOnlineChange={setOnlineUserIds} />
      <MessagesWidget profile={currentProfile} onlineUserIds={onlineUserIds} isOpen={isChatOpen} onOpenChange={setIsChatOpen} />
      {notice && <div className="toast"><Check size={16} />{notice}</div>}
      {mobileMenuOpen && <button className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu" />}
    </div>
  );
}

function DashboardOverview({ firstName, todayLabel, leads, metrics, onAdd, onSelect }: { firstName: string; todayLabel: string; leads: Lead[]; metrics: { total: number; open: number; qualified: number; closed: number; conversion: number }; onAdd: () => void; onSelect: (lead: Lead) => void }) {
  const reducedMotion = useReducedMotion();
  const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greeting = localHour < 12 ? "Bom dia" : localHour < 18 ? "Boa tarde" : "Boa noite";
  const stageCounts = stages.map((stage) => ({ ...stage, count: leads.filter((lead) => lead.status === stage.slug).length }));
  const maxStageCount = Math.max(1, ...stageCounts.map((stage) => stage.count));
  const pipelineHealth = metrics.total ? Math.round(((metrics.qualified + metrics.closed) / metrics.total) * 100) : 0;
  const recentLeads = leads.slice(0, 5);

  return <div className="dashboard-overview">
    <section className="dashboard-hero">
      <div className="dashboard-welcome">
        <p className="dashboard-kicker">{todayLabel}</p>
        <h1 className="dashboard-welcome-name" aria-label={`${greeting}, ${firstName}`}>
          <span>{greeting},</span>
          <span className="dashboard-gradient-wave-wrap" aria-hidden="true">
            <GradientWaveText className="dashboard-gradient-wave" align="left" speed={0.9} delay={0.08} paused={Boolean(reducedMotion)} customColors={dashboardWaveColors}>{firstName}</GradientWaveText>
          </span>
        </h1>
        <p>Uma visão clara do que está acontecendo com seus leads.</p>
      </div>
      <button className="primary-button dashboard-add-button" onClick={onAdd}><Plus size={17} /> Adicionar lead</button>
    </section>

    <section className="dashboard-kpi-grid" aria-label="Resumo do pipeline">
      <DashboardKpi label="Leads no pipeline" value={metrics.total} detail="registros atuais" icon={Users} tone="lime" />
      <DashboardKpi label="Em aberto" value={metrics.open} detail="aguardando avanço" icon={Target} tone="neutral" />
      <DashboardKpi label="Em negociação" value={metrics.qualified} detail="em acompanhamento" icon={Check} tone="lime" />
      <DashboardKpi label="Conversão" value={`${metrics.conversion}%`} detail="leads fechados" icon={BarChart3} tone="red" />
    </section>

    <div className="dashboard-main-grid">
      <section className="dashboard-card dashboard-pipeline-card">
        <div className="dashboard-card-header"><div><p className="dashboard-card-eyebrow">Visão do pipeline</p><h2>Leads por estágio</h2><p>Distribuição real dos seus registros atuais.</p></div><span className="dashboard-data-badge">{metrics.total} total</span></div>
        {leads.length ? <div className="pipeline-bars">{stageCounts.map((stage) => <div className="pipeline-bar-row" key={stage.slug}><div className="pipeline-bar-label"><span className="pipeline-dot" style={{ backgroundColor: stage.color }} /><span>{stage.name}</span><strong>{stage.count}</strong></div><div className="pipeline-track"><span style={{ width: `${Math.max(stage.count ? 8 : 0, (stage.count / maxStageCount) * 100)}%`, backgroundColor: stage.color }} /></div></div>)}</div> : <DashboardEmpty icon={BarChart3} title="Seu pipeline ainda está vazio" description="Adicione um lead para acompanhar a evolução por estágio." actionLabel="Adicionar primeiro lead" onAction={onAdd} />}
        <div className="dashboard-card-footer"><span><span className="legend-dot legend-dot-lime" /> Dados do Supabase</span><span>Atualizado agora</span></div>
      </section>

      <aside className="dashboard-side-stack">
        <section className="dashboard-card dashboard-health-card"><div className="dashboard-card-header compact"><div><p className="dashboard-card-eyebrow">Indicador</p><h2>Saúde do pipeline</h2></div><div className="health-ring" style={{ "--health": `${pipelineHealth}%` } as CSSProperties}><span>{pipelineHealth}</span></div></div><p className="dashboard-health-copy">Percentual de leads em negociação ou fechados.</p><div className="health-progress"><span style={{ width: `${pipelineHealth}%` }} /></div></section>
        <section className="dashboard-card dashboard-activity-card"><div className="dashboard-card-header compact"><div><p className="dashboard-card-eyebrow">Atualizações</p><h2>Atividade recente</h2></div><span className="dashboard-subtle-count">{recentLeads.length} itens</span></div>{recentLeads.length ? <div className="dashboard-activity-list">{recentLeads.map((lead) => <button className="dashboard-activity-item" key={lead.id} onClick={() => onSelect(lead)}><span className="dashboard-activity-avatar">{initials(lead.name)}</span><span className="dashboard-activity-copy"><strong>{lead.name}</strong><span>{statusLabel(lead.status)} · {lead.source}</span></span><span className="dashboard-activity-date">{lead.updated_at ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(lead.updated_at)) : "agora"}</span></button>)}</div> : <div className="dashboard-activity-empty"><Clock3 size={18} /><span>As atualizações aparecerão aqui quando você cadastrar leads.</span></div>}</section>
      </aside>
    </div>

    <section className="dashboard-secondary-grid" aria-label="Indicadores adicionais"><DashboardStat label="Leads fechados" value={metrics.closed} note="resultado atual" /><DashboardStat label="Sem contato" value={leads.filter((lead) => lead.status === "novo").length} note="próximo passo sugerido" /><DashboardStat label="Qualificados" value={metrics.qualified} note="oportunidades prontas" /><DashboardStat label="Conversão" value={`${metrics.conversion}%`} note="fechados / total" /><DashboardStat label="Saúde" value={`${pipelineHealth}%`} note="pipeline ativo" accent /></section>

    <section className="dashboard-card dashboard-latest-card"><div className="dashboard-card-header"><div><p className="dashboard-card-eyebrow">Registros</p><h2>Leads recentes</h2><p>Os últimos registros adicionados ou atualizados.</p></div><span className="dashboard-inline-action">{leads.length ? "Dados atuais" : "Sem registros"}</span></div>{recentLeads.length ? <div className="dashboard-lead-grid">{recentLeads.map((lead) => <button className="dashboard-lead-card" key={lead.id} onClick={() => onSelect(lead)}><div className="dashboard-lead-card-top"><span className={`status-chip status-${lead.status}`}>{statusLabel(lead.status)}</span><ArrowRight size={15} /></div><strong>{lead.name}</strong><span>{lead.address || "Localização não informada"}</span><small>{lead.phone || "Telefone não informado"}</small></button>)}</div> : <DashboardEmpty icon={Users} title="Nenhum lead cadastrado" description="Comece adicionando um registro manualmente ou encontre leads na busca." actionLabel="Adicionar lead" onAction={onAdd} />}</section>

    <div className="dashboard-bottom-grid"><section className="dashboard-card dashboard-tasks-card"><div className="dashboard-card-header compact"><div><p className="dashboard-card-eyebrow">Organização</p><h2>Próximas tarefas</h2></div><span className="dashboard-subtle-count">Em breve</span></div><div className="dashboard-feature-empty"><Check size={20} /><div><strong>Nenhuma tarefa pendente</strong><span>Use a área de Tarefas para registrar os próximos passos do time.</span></div></div></section><section className="dashboard-card dashboard-sources-card"><div className="dashboard-card-header compact"><div><p className="dashboard-card-eyebrow">Distribuição</p><h2>Estágios ativos</h2></div><Target size={18} /></div><div className="dashboard-stage-list">{stageCounts.map((stage) => <div key={stage.slug}><span><i className="pipeline-dot" style={{ backgroundColor: stage.color }} />{stage.name}</span><strong>{stage.count}</strong></div>)}</div></section></div>
  </div>;
}

function DashboardKpi({ label, value, detail, icon: Icon, tone }: { label: string; value: string | number; detail: string; icon: typeof Users; tone: "lime" | "neutral" | "red" }) {
  return <article className={`dashboard-kpi-card dashboard-kpi-${tone}`}><div className="dashboard-kpi-top"><span>{label}</span><span className="dashboard-kpi-icon"><Icon size={16} /></span></div><strong>{typeof value === "number" ? numberFormatter.format(value) : value}</strong><span>{detail}</span><div className="dashboard-kpi-line" /></article>;
}

function DashboardStat({ label, value, note, accent = false }: { label: string; value: string | number; note: string; accent?: boolean }) {
  return <article className={`dashboard-stat ${accent ? "dashboard-stat-accent" : ""}`}><span>{label}</span><strong>{typeof value === "number" ? numberFormatter.format(value) : value}</strong><small>{note}</small></article>;
}

function DashboardEmpty({ icon: Icon, title, description, actionLabel, onAction }: { icon: typeof Users; title: string; description: string; actionLabel: string; onAction: () => void }) {
  return <div className="dashboard-empty"><span className="dashboard-empty-icon"><Icon size={18} /></span><strong>{title}</strong><p>{description}</p><button className="secondary-button" onClick={onAction}><Plus size={14} /> {actionLabel}</button></div>;
}

function PipelineBoard({ leads, loading, error, onMove, onFavoriteChange, onNotice, onSelect, onAdd, showList }: { leads: Lead[]; loading: boolean; error: boolean; onMove: (id: string, status: LeadStatus) => Promise<void>; onFavoriteChange: (id: string, favorite: boolean) => Promise<void>; onNotice: (message: string) => void; onSelect: (lead: Lead) => void; onAdd: () => void; showList: boolean }) {
  if (showList) return <LeadsTable leads={leads} loading={loading} error={error} onSelect={onSelect} onStageChange={onMove} onFavoriteChange={onFavoriteChange} onNotice={onNotice} />;
  return <div className="kanban-grid">{stages.map((stage) => { const stageLeads = leads.filter((lead) => lead.status === stage.slug); return <div className="kanban-column" key={stage.slug} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("leadId"); if (id) onMove(id, stage.slug); }}><div className="kanban-column-header"><div><span className="stage-dot" style={{ backgroundColor: stage.color }} /><h3>{stage.name}</h3><span className="column-count">{stageLeads.length}</span></div><button aria-label={`Opções de ${stage.name}`}><MoreHorizontal size={17} /></button></div><div className="kanban-cards">{stageLeads.map((lead) => <LeadCard key={lead.id} lead={lead} onSelect={onSelect} />)}{stageLeads.length === 0 && <div className="empty-column">Solte um lead aqui</div>}</div><button className="add-card-button" onClick={onAdd}><Plus size={15} /> Adicionar lead</button></div>; })}</div>;
}

function LeadCard({ lead, onSelect }: { lead: Lead; onSelect: (lead: Lead) => void }) {
  return <article className="lead-card" draggable onDragStart={(event) => event.dataTransfer.setData("leadId", lead.id)} onClick={() => onSelect(lead)}><div className="lead-card-top"><span className="lead-source">{lead.source}</span><GripVertical className="drag-handle" size={16} /></div><h4>{lead.name}</h4><p>{lead.address}</p><div className="lead-card-footer"><span className="lead-avatar small">{initials(lead.name)}</span><span>{lead.phone}</span><button onClick={(event) => { event.stopPropagation(); onSelect(lead); }} aria-label={`Abrir ${lead.name}`}><ArrowRight size={15} /></button></div></article>;
}

function AddLeadModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (formData: FormData) => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="modal-card" action={onSubmit}>
        <div className="modal-header">
          <div><p className="eyebrow">Novo registro</p><h2>Adicionar lead</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <label>Nome da empresa<input name="name" placeholder="Ex.: Restaurante Maré" autoFocus required /></label>
        <label>E-mail<input name="email" type="email" autoComplete="email" placeholder="contato@empresa.com.br" /></label>
        <label>Telefone<input name="phone" placeholder="(13) 99999-0000" /></label>
        <label>Endereço<input name="address" placeholder="Bairro, cidade — UF" /></label>
        <label>Site<input name="website" placeholder="https://empresa.com.br" type="url" /></label>
        <label>Observações<textarea name="notes" placeholder="Informações importantes sobre este lead..." rows={3} /></label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" type="submit"><Plus size={16} /> Criar lead</button>
        </div>
      </form>
    </div>
  );
}

function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const createdLabel = lead.created_at && !Number.isNaN(new Date(lead.created_at).getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lead.created_at))
    : null;
  const updatedLabel = lead.updated_at && !Number.isNaN(new Date(lead.updated_at).getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lead.updated_at))
    : null;

  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="lead-drawer lead-details-drawer" role="dialog" aria-modal="true" aria-labelledby="lead-details-title">
      <div className="drawer-header"><div><span className={`status-chip status-${lead.status}`}>{statusLabel(lead.status)}</span><h2 id="lead-details-title">{lead.name}</h2><p>Informações do lead</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar detalhes" autoFocus><X size={19} /></button></div>
      <div className="drawer-section">
        <p className="drawer-label">Contato</p>
        <div className="contact-item"><span>Telefone</span><strong>{lead.phone || "Não informado"}</strong></div>
        <div className="contact-item"><span>E-mail</span><strong>{lead.email || "Não informado"}</strong></div>
        <div className="contact-item"><span>Website</span><strong>{lead.website || "Não informado"}</strong></div>
      </div>
      <div className="drawer-section">
        <p className="drawer-label">Empresa</p>
        <div className="contact-item"><span>Endereço</span><strong>{lead.address || "Não informado"}</strong></div>
        <div className="contact-item"><span>Cidade / UF</span><strong>{[lead.cidade, lead.uf].filter(Boolean).join(" - ") || "Não informado"}</strong></div>
        <div className="contact-item"><span>Instagram</span><strong>{lead.instagram || "Não informado"}</strong></div>
        <div className="contact-item"><span>Oportunidade</span><strong>{lead.score ?? "—"}</strong></div>
        <div className="contact-item"><span>Google</span><strong>{lead.nota_google == null ? "—" : `${lead.nota_google.toLocaleString("pt-BR")} · ${lead.total_avaliacoes?.toLocaleString("pt-BR") ?? "—"} avaliações`}</strong></div>
        <div className="contact-item"><span>Origem</span><strong>{lead.source}</strong></div>
        {createdLabel && <div className="contact-item"><span>Cadastrado em</span><strong>{createdLabel}</strong></div>}
        {updatedLabel && <div className="contact-item"><span>Atualizado em</span><strong>{updatedLabel}</strong></div>}
      </div>
      {lead.notes && <div className="drawer-section"><p className="drawer-label">Observações</p><p className="lead-details-notes">{lead.notes}</p></div>}
    </aside>
  </div>;
}
