"use client";

import {NotificationPreferences} from "./notification-preferences";
import {PersonAvatar,usePeople} from "./people-provider";
import { Bell, CalendarClock, CheckCheck, CircleCheck, ListChecks, MessageCircle, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppToast } from "@/components/app-toast-provider";
import { createClient } from "@/lib/supabase/client";

type SharedNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
};
type InboxMessage = { id: string; content: string; sender_id: string; created_at: string; message_type: string; image_path: string | null };
type InboxItem =
  | ({ kind: "shared" } & SharedNotification)
  | ({ kind: "message"; read_at: null; title: string; body: string; type: "message" } & InboxMessage);


function shortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(date);
}

function iconFor(type: string) {
  if (type.startsWith("lead_")) return TrendingUp;
  if (type.startsWith("task_")) return ListChecks;
  if (type.startsWith("event_")) return CalendarClock;
  if (type === "message") return MessageCircle;
  return CircleCheck;
}

export function NotificationsMenu({ userId, onOpenChat }: { userId: string | null; onOpenChat: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useAppToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const people=usePeople();const peopleRef=useRef(people);const seen=useRef(new Set<string>());
  useEffect(()=>{peopleRef.current=people;},[people]);
  const messageToast=useCallback((message:{id:string;sender_id:string;message_type?:string;content?:string;image_path?:string|null})=>{if(message.sender_id===userId||seen.current.has(message.id))return;seen.current.add(message.id);if(seen.current.size>1000)seen.current.delete(seen.current.values().next().value!);const actor=peopleRef.current[message.sender_id];const body=message.message_type==="audio"?"Enviou um áudio.":message.image_path&&!message.content?"Enviou uma imagem.":message.content?.slice(0,160)||"Nova mensagem no bate-papo.";toast(body,"info",{actor:actor||null,action:{label:"Ler",run:onOpenChat}});},[userId,toast,onOpenChat]);
  const [loading, setLoading] = useState(Boolean(supabase && userId));
  const [error, setError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const unreadCount = items.reduce((count, item) => count + (item.read_at ? 0 : 1), 0);

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    const [notificationResult, messageResult] = await Promise.all([
      supabase.from("notifications")
        .select("id,type,title,body,actor_id,entity_type,entity_id,created_at,read_at")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase.from("unread_messages")
        .select("id,content,sender_id,created_at,message_type,image_path")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    const notifications = (notificationResult.data ?? []) as SharedNotification[];
    const messages = (messageResult.data ?? []) as InboxMessage[];
    const mixed: InboxItem[] = [
      ...notifications.map((item) => ({ ...item, kind: "shared" as const })),
      ...messages.map((message) => ({
        ...message,
        kind: "message" as const,
        type: "message" as const,
        title: "Mensagem da equipe",
        body: message.message_type === "audio" ? "Áudio" : message.image_path && !message.content ? "Imagem" : message.content,
        read_at: null,
      })),
    ];
    mixed.sort((first, second) => second.created_at.localeCompare(first.created_at));
    setItems(mixed.slice(0, 35));

    const missingTable = notificationResult.error?.code === "42P01" || notificationResult.error?.code === "PGRST205";
    setError(notificationResult.error && !missingTable ? "Não foi possível carregar os avisos compartilhados." : "");
    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const loadTimer = window.setTimeout(() => void load(), 0);
    const channel = supabase.channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, (payload) => {
        const notification = payload.new as SharedNotification;
        if(notification.actor_id!==userId)toast(`${notification.title}: ${notification.body}`, "info",{actor:notification.actor_id?peopleRef.current[notification.actor_id]||null:null});
        void load();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const message = payload.new as InboxMessage;
        messageToast(message);
        void load();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads", filter: `user_id=eq.${userId}` }, () => void load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, () => void load())
      .subscribe();
    return () => { window.clearTimeout(loadTimer); void supabase.removeChannel(channel); };
  }, [supabase, userId, load, toast,messageToast]);

  useEffect(()=>{if(!("serviceWorker" in navigator))return;const receive=(event:MessageEvent)=>{if(event.data?.type==="PROSPECTA_OPEN_CHAT")onOpenChat();if(event.data?.type==="PROSPECTA_PUSH"){const payload=event.data.data;if(payload?.id&&payload?.senderId){messageToast({id:payload.id,sender_id:payload.senderId});void load();}}};navigator.serviceWorker.addEventListener("message",receive);return()=>navigator.serviceWorker.removeEventListener("message",receive);},[onOpenChat,messageToast,load]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key === "Escape") setOpen(false);
      if (event instanceof MouseEvent && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", dismiss);
    window.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      window.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  async function markRead(targets: InboxItem[] = items.filter((item) => !item.read_at)) {
    if (!supabase || !userId || !targets.length) return true;
    const sharedIds = targets.filter((item) => item.kind === "shared").map((item) => item.id);
    const messageIds = targets.filter((item) => item.kind === "message").map((item) => item.id);
    const writes = [];
    if (sharedIds.length) writes.push(supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", userId).in("id", sharedIds));
    if (messageIds.length) writes.push(supabase.from("message_reads").insert(messageIds.map((message_id) => ({ message_id, user_id: userId }))));
    const results = await Promise.all(writes);
    const failed = results.some((result) => result.error && result.error.code !== "23505");
    if (failed) {
      setError("Não foi possível atualizar os avisos. Tente novamente.");
      toast("Não foi possível atualizar as notificações.", "error");
      return false;
    }
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => targets.some((target) => target.id === item.id) ? { ...item, read_at: now } : item) as InboxItem[]);
    setError("");
    return true;
  }

  async function openItem(item: InboxItem) {
    if (!item.read_at && !await markRead([item])) return;
    setOpen(false);
    if (item.kind === "message") onOpenChat();
  }

  return (
    <div className="notifications-menu" ref={menuRef}>
      <button
        className="icon-button notification-button"
        type="button"
        aria-label={unreadCount ? `Notificações, ${unreadCount} não lidas` : "Notificações"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={19} />
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && (
        <section className="notifications-popover" role="dialog" aria-label="Notificações">
          <header className="notifications-heading">
            <div><h2>Notificações</h2><span>{unreadCount ? `${unreadCount} não lidas` : "Tudo em dia"}</span></div>
            {unreadCount > 0 && <button type="button" className="notifications-read-all" onClick={() => void markRead()}><CheckCheck size={14} />Marcar como lidas</button>}
          </header>
          {error && <p className="notifications-error" role="alert">{error}</p>}
          <div className="notifications-list">
            {loading ? <p className="notifications-empty" role="status">Carregando…</p> : items.length ? items.map((item) => {
              const Icon = iconFor(item.type);
              const actorName = item.kind === "message" ? people[item.sender_id]?.name || "Equipe" : item.title;
              const actor=people[item.kind==="message"?item.sender_id:item.actor_id||""];
              const body = item.kind === "message" ? item.body : item.body;
              return (
                <button className={`notification-item ${item.read_at ? "is-read" : ""}`} type="button" key={`${item.kind}-${item.id}`} onClick={() => void openItem(item)}>
                  {actor?<PersonAvatar person={actor} size={34}/>:<span className="notification-message-icon"><Icon size={15} /></span>}
                  <span className="notification-message-copy"><strong>{actorName}</strong><span>{body}</span><time dateTime={item.created_at}>{shortTime(item.created_at)}</time></span>
                  {!item.read_at && <span className="notification-unread-dot" aria-label="Não lida" />}
                </button>
              );
            }) : <p className="notifications-empty">Nenhuma atividade nova por enquanto.</p>}
          </div><NotificationPreferences/>
        </section>
      )}
    </div>
  );
}
