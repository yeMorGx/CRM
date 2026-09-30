"use client";

import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, LayoutGrid, List, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { useAppToast } from "@/components/app-toast-provider";
import { ProspectaSelect } from "@/components/ui/prospecta-select";
import { publishSharedNotification } from "@/lib/notifications";

type CalendarView = "month" | "week" | "day" | "agenda";
type EventColor = "lime" | "blue" | "amber" | "red";
type CalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  color: EventColor;
  notes: string | null;
};
type EventDraft = { id?: string; title: string; date: string; startTime: string; endTime: string; allDay: boolean; color: EventColor; notes: string };

const weekDays = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const viewLabels: Record<CalendarView, string> = { month: "Mês", week: "Semana", day: "Dia", agenda: "Agenda" };
const eventColumns = "id,title,start_at,end_at,all_day,color,notes";

function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function addDays(date: Date, count: number) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count); }
function startOfWeek(date: Date) { return addDays(startOfDay(date), -((date.getDay() + 6) % 7)); }
function dayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function dateFromKey(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function formatMonth(date: Date) { return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date); }
function formatFullDate(date: Date) { return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(date); }
function formatShortDate(date: Date) { return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(date); }
function formatTime(date: Date) { return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date); }
function dateAt(date: Date, time: string) { const [hours, minutes] = time.split(":").map(Number); return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes); }
function eventOnDay(event: CalendarEvent, day: Date) { const start = startOfDay(day).getTime(); const end = addDays(day, 1).getTime(); return new Date(event.start_at).getTime() < end && new Date(event.end_at).getTime() > start; }
function eventsForDay(events: CalendarEvent[], day: Date) { return events.filter((event) => eventOnDay(event, day)); }
function timeLabel(event: CalendarEvent) { return event.all_day ? "Dia inteiro" : `${formatTime(new Date(event.start_at))}–${formatTime(new Date(event.end_at))}`; }
function newDraft(date: Date): EventDraft { return { title: "", date: dayKey(date), startTime: "09:00", endTime: "10:00", allDay: false, color: "lime", notes: "" }; }
function draftFromEvent(event: CalendarEvent): EventDraft { const start = new Date(event.start_at); const end = new Date(event.end_at); return { id: event.id, title: event.title, date: dayKey(start), startTime: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`, endTime: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`, allDay: event.all_day, color: event.color, notes: event.notes ?? "" }; }

function visibleRange(date: Date, view: CalendarView) {
  if (view === "month") {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = startOfWeek(first);
    return { start, end: addDays(start, 42) };
  }
  if (view === "week") { const start = startOfWeek(date); return { start, end: addDays(start, 7) }; }
  if (view === "agenda") { const start = startOfDay(date); return { start, end: addDays(start, 30) }; }
  const start = startOfDay(date);
  return { start, end: addDays(start, 1) };
}

export function EventCalendarModule() {
  const supabase = useMemo(() => createClient(), []);
  const toast = useAppToast();
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<CalendarView>("month");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [revision, setRevision] = useState(0);
  const range = useMemo(() => visibleRange(anchor, view), [anchor, view]);

  const refresh = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { if (active) { setError("A agenda não está disponível agora."); setLoading(false); } return; }
      setLoading(true);
      const { data, error: loadError } = await supabase.from("calendar_events").select(eventColumns).lt("start_at", range.end.toISOString()).gt("end_at", range.start.toISOString()).order("start_at", { ascending: true });
      if (!active) return;
      if (loadError) { setError("Não foi possível carregar a agenda. Tente novamente."); toast("Não foi possível carregar a agenda.", "error"); setEvents([]); }
      else { setError(""); setEvents((data ?? []) as CalendarEvent[]); }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase, range, revision, toast]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("crm-calendar-events").on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, refresh).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, refresh]);

  useEffect(() => {
    if (!draft) return;
    function onEscape(event: KeyboardEvent) { if (event.key === "Escape") setDraft(null); }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [draft]);

  function movePeriod(direction: number) {
    setAnchor((current) => view === "month" ? new Date(current.getFullYear(), current.getMonth() + direction, 1) : addDays(current, direction * (view === "week" ? 7 : view === "agenda" ? 30 : 1)));
  }

  function selectView(nextView: CalendarView) { setView(nextView); }
  function showDay(day: Date) { setAnchor(day); setView("day"); }
  function openDay(day: Date) { setDraft(newDraft(day)); setFormError(""); }
  function openEvent(event: CalendarEvent) { setDraft(draftFromEvent(event)); setFormError(""); }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !supabase) return;
    const date = dateFromKey(draft.date);
    const start = draft.allDay ? startOfDay(date) : dateAt(date, draft.startTime);
    const end = draft.allDay ? addDays(date, 1) : dateAt(date, draft.endTime);
    if (!draft.title.trim()) { setFormError("Dê um nome ao evento."); return; }
    if (end <= start) { setFormError("O horário de término deve ser depois do início."); return; }
    setSaving(true); setFormError("");
    const values = { title: draft.title.trim(), start_at: start.toISOString(), end_at: end.toISOString(), all_day: draft.allDay, color: draft.color, notes: draft.notes.trim() || null };
    const result = draft.id ? await supabase.from("calendar_events").update(values).eq("id", draft.id).select(eventColumns).single() : await supabase.from("calendar_events").insert(values).select(eventColumns).single();
    setSaving(false);
    if (result.error || !result.data) { setFormError("Não foi possível salvar. Confira sua conexão e tente novamente."); toast("Não foi possível salvar o compromisso.", "error"); return; }
    void publishSharedNotification("event_scheduled", result.data.id).then((ok) => {
      if (!ok) toast("Compromisso salvo, mas o aviso não chegou à equipe.", "error");
    });
    setDraft(null); setAnchor(date); refresh();
  }

  async function deleteEvent() {
    if (!draft?.id || !supabase || !window.confirm("Excluir este evento da agenda?")) return;
    setSaving(true); setFormError("");
    const { error: deleteError } = await supabase.from("calendar_events").delete().eq("id", draft.id);
    setSaving(false);
    if (deleteError) { setFormError("Não foi possível excluir o evento."); toast("Não foi possível excluir o compromisso.", "error"); return; }
    setDraft(null); refresh();
  }

  async function moveEventToDay(eventId: string, day: Date) {
    const item = events.find((event) => event.id === eventId);
    if (!item || !supabase) return;
    const oldStart = new Date(item.start_at);
    const duration = new Date(item.end_at).getTime() - oldStart.getTime();
    const nextStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), oldStart.getHours(), oldStart.getMinutes());
    const nextEnd = new Date(nextStart.getTime() + duration);
    const { error: updateError } = await supabase.from("calendar_events").update({ start_at: nextStart.toISOString(), end_at: nextEnd.toISOString() }).eq("id", eventId);
    if (updateError) { setError("Não foi possível mover o evento."); toast("Não foi possível mover o compromisso.", "error"); }
    else {
      void publishSharedNotification("event_scheduled", eventId).then((ok) => {
        if (!ok) toast("Compromisso movido, mas o aviso não chegou à equipe.", "error");
      });
      refresh();
    }
  }

  const today = startOfDay(new Date());
  const periodTitle = view === "month" ? formatMonth(anchor) : view === "day" ? formatFullDate(anchor) : view === "week" ? `${formatShortDate(range.start)} — ${formatShortDate(addDays(range.end, -1))}` : `Próximos 30 dias · ${formatShortDate(range.start)}`;
  const upcoming = events.filter((event) => new Date(event.end_at) >= today).sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 4);

  return <div className="event-calendar-page">
    <div className="event-calendar-heading"><div><h1>Agenda</h1><p>Organize compromissos e acompanhe as próximas conversas em um só lugar.</p></div><button className="primary-button" onClick={() => openDay(anchor)}><Plus size={17} /> Novo evento</button></div>
    <div className="event-calendar-layout">
      <section className="event-calendar-panel" aria-label="Calendário de eventos">
        <div className="event-calendar-toolbar"><div className="event-calendar-period"><button className="calendar-today" onClick={() => setAnchor(startOfDay(new Date()))}>Hoje</button><div className="event-calendar-arrows"><button aria-label="Período anterior" onClick={() => movePeriod(-1)}><ChevronLeft size={17} /></button><button aria-label="Próximo período" onClick={() => movePeriod(1)}><ChevronRight size={17} /></button></div><h2 aria-live="polite">{periodTitle}</h2></div><div className="event-calendar-views" role="group" aria-label="Visualização do calendário">{(Object.keys(viewLabels) as CalendarView[]).map((option) => <button key={option} className={view === option ? "is-active" : ""} aria-pressed={view === option} onClick={() => selectView(option)}>{viewLabels[option]}</button>)}</div></div>
        {error && <div className="event-calendar-error" role="alert">{error}<button onClick={refresh}>Tentar novamente</button></div>}
        {loading ? <div className="event-calendar-loading" role="status">Carregando agenda...</div> : view === "month" ? <MonthView anchor={anchor} today={today} events={events} onAdd={openDay} onShowDay={showDay} onOpen={openEvent} onMove={moveEventToDay} /> : view === "agenda" ? <AgendaView start={range.start} events={events} onAdd={openDay} onOpen={openEvent} /> : <TimeView start={range.start} view={view} today={today} events={events} onAdd={openDay} onOpen={openEvent} />}
      </section>
      <aside className="event-calendar-aside"><div className="calendar-aside-header"><div><CalendarDays size={18} /><h2>Eventos neste período</h2></div><span>{upcoming.length}</span></div>{upcoming.length ? <div className="calendar-upcoming-list">{upcoming.map((event) => <button className="calendar-upcoming-item" key={event.id} onClick={() => openEvent(event)}><span className={`calendar-upcoming-mark color-${event.color}`} /><span><strong>{event.title}</strong><small>{formatShortDate(new Date(event.start_at))} · {timeLabel(event)}</small></span><ChevronRight size={15} /></button>)}</div> : <div className="calendar-aside-empty"><Clock3 size={21} /><strong>Nada agendado</strong><span>Os compromissos deste período aparecerão aqui.</span></div>}<div className="calendar-aside-note"><Check size={14} /> Visível apenas para usuários autorizados.</div></aside>
    </div>
    {draft && <div className="calendar-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}><form className="calendar-modal" onSubmit={saveEvent} role="dialog" aria-modal="true" aria-labelledby="calendar-modal-title"><div className="calendar-modal-header"><div><h2 id="calendar-modal-title">{draft.id ? "Editar evento" : "Novo evento"}</h2><p>Defina quando esta conversa vai acontecer.</p></div><button type="button" aria-label="Fechar" onClick={() => setDraft(null)}><X size={18} /></button></div><label>Nome do evento<input autoFocus required maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ex.: Reunião com cliente" /></label><div className="calendar-modal-fields"><label>Data<input type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label><label className="calendar-all-day"><input type="checkbox" checked={draft.allDay} onChange={(event) => setDraft({ ...draft, allDay: event.target.checked })} /> Dia inteiro</label></div>{!draft.allDay && <div className="calendar-modal-fields"><label>Início<input type="time" required value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label><label>Término<input type="time" required value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} /></label></div>}<ProspectaSelect label="Cor" value={draft.color} options={[{ value: "lime", label: "Verde", tone: "lime" }, { value: "blue", label: "Azul", tone: "blue" }, { value: "amber", label: "Âmbar", tone: "amber" }, { value: "red", label: "Vermelho", tone: "red" }]} onChange={(color) => setDraft({ ...draft, color: color as EventColor })} /><label>Notas <span>(opcional)</span><textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Detalhes para a equipe" /></label>{formError && <p className="calendar-form-error" role="alert">{formError}</p>}<div className="calendar-modal-actions">{draft.id && <button type="button" className="calendar-delete" onClick={deleteEvent} disabled={saving}><Trash2 size={15} /> Excluir</button>}<button type="button" className="secondary-button" onClick={() => setDraft(null)}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar evento"}</button></div></form></div>}
  </div>;
}

function MonthView({ anchor, today, events, onAdd, onShowDay, onOpen, onMove }: { anchor: Date; today: Date; events: CalendarEvent[]; onAdd: (date: Date) => void; onShowDay: (date: Date) => void; onOpen: (event: CalendarEvent) => void; onMove: (id: string, date: Date) => void }) {
  const first = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const days = Array.from({ length: 42 }, (_, index) => addDays(first, index));
  return <div className="calendar-month"><div className="calendar-month-weekdays">{weekDays.map((label) => <span key={label}>{label}</span>)}</div><div className="calendar-month-grid">{days.map((day) => { const dayEvents = eventsForDay(events, day); const inMonth = day.getMonth() === anchor.getMonth(); return <div className={`calendar-month-cell ${inMonth ? "" : "is-outside"}`} key={dayKey(day)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("calendar-event-id"); if (id) void onMove(id, day); }}><button className={`calendar-day-number ${dayKey(day) === dayKey(today) ? "is-today" : ""}`} onClick={() => onShowDay(day)} aria-label={`Ver agenda de ${formatFullDate(day)}`}>{day.getDate()}</button><div className="calendar-month-events">{dayEvents.slice(0, 3).map((event) => <button key={event.id} draggable onDragStart={(dragEvent) => dragEvent.dataTransfer.setData("calendar-event-id", event.id)} onClick={() => onOpen(event)} className={`calendar-event-chip color-${event.color}`} title={`${event.title} · ${timeLabel(event)}`}><span>{!event.all_day && `${formatTime(new Date(event.start_at))} `}{event.title}</span></button>)}{dayEvents.length > 3 && <button className="calendar-more" onClick={() => onShowDay(day)}>+{dayEvents.length - 3} mais</button>}</div><button className="calendar-cell-add" onClick={() => onAdd(day)} aria-label={`Novo evento em ${formatFullDate(day)}`}><Plus size={13} /></button></div>; })}</div></div>;
}

function TimeView({ start, view, today, events, onAdd, onOpen }: { start: Date; view: "week" | "day"; today: Date; events: CalendarEvent[]; onAdd: (date: Date) => void; onOpen: (event: CalendarEvent) => void }) {
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => addDays(start, index));
  return <div className={`calendar-time-view ${view === "day" ? "calendar-single-day" : ""}`}><div className="calendar-time-header">{days.map((day) => <button key={dayKey(day)} onClick={() => onAdd(day)} className={dayKey(day) === dayKey(today) ? "is-today" : ""}><span>{new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(day)}</span><strong>{day.getDate()}</strong></button>)}</div><div className="calendar-time-columns">{days.map((day) => { const dayEvents = eventsForDay(events, day); return <div className="calendar-time-column" key={dayKey(day)}><button className="calendar-time-add" onClick={() => onAdd(day)}><Plus size={13} /> Agendar</button>{dayEvents.map((event) => <button key={event.id} className={`calendar-time-event color-${event.color}`} onClick={() => onOpen(event)}><span>{timeLabel(event)}</span><strong>{event.title}</strong>{event.notes && <small>{event.notes}</small>}</button>)}{!dayEvents.length && <div className="calendar-time-empty">Sem eventos</div>}</div>; })}</div></div>;
}

function AgendaView({ start, events, onAdd, onOpen }: { start: Date; events: CalendarEvent[]; onAdd: (date: Date) => void; onOpen: (event: CalendarEvent) => void }) {
  const days = Array.from({ length: 30 }, (_, index) => addDays(start, index)).filter((day) => eventsForDay(events, day).length);
  if (!days.length) return <div className="calendar-agenda-empty"><List size={23} /><strong>Nenhum evento nos próximos 30 dias</strong><p>Escolha uma data para começar a organizar sua agenda.</p><button className="secondary-button" onClick={() => onAdd(start)}><Plus size={15} /> Criar evento</button></div>;
  return <div className="calendar-agenda">{days.map((day) => <div className="calendar-agenda-group" key={dayKey(day)}><div className="calendar-agenda-date"><LayoutGrid size={15} /><strong>{formatFullDate(day)}</strong><button onClick={() => onAdd(day)} aria-label={`Adicionar evento em ${formatFullDate(day)}`}><Plus size={16} /></button></div>{eventsForDay(events, day).map((event) => <button className="calendar-agenda-event" key={event.id} onClick={() => onOpen(event)}><span className={`calendar-agenda-dot color-${event.color}`} /><span className="calendar-agenda-time">{timeLabel(event)}</span><strong>{event.title}</strong><ChevronRight size={15} /></button>)}</div>)}</div>;
}
