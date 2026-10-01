"use client";

import { Check, Clock3, ImagePlus, MessageCircle, Mic, Paperclip, Send, Users, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";

import { createClient } from "@/lib/supabase/client";
import { ConversationThread, type ChatMessage, type ChatProfile } from "@/components/examples/c-bubble-1";
import type { Profile } from "@/components/profile-page";
import { useAppToast } from "@/components/app-toast-provider";
import { publishSharedNotification } from "@/lib/notifications";
import { chatSoundForMessage, playSound, preloadChatSounds, resumeChatSounds } from "@/lib/chat-sounds";

type Task = { id: string; title: string; done: boolean; lead_id?: string | null; created_at?: string };

export function CollaborationModule() {
  const supabase = useMemo(() => createClient(), []);
  return <TasksModule supabase={supabase} />;
}

export function MessagesWidget({ profile, onlineUserIds, isOpen, onOpenChange }: {
  profile: Profile | null;
  onlineUserIds: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const openRef = useRef(isOpen);
  const userIdRef = useRef<string | null>(null);
  const heardMessageIds = useRef(new Set<string>());
  const [incomingMessage, setIncomingMessage] = useState<ChatMessage | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [openUnreadId, setOpenUnreadId] = useState<string | null>(null);
  const atBottomRef = useRef(false);
  const markingRef = useRef(false);
  const initialTitle = useRef<string | null>(null);

  useLayoutEffect(() => { openRef.current = isOpen; }, [isOpen]);

  const receiveMessage = useCallback((message: ChatMessage, forwardToPanel = true) => {
    if (heardMessageIds.current.has(message.id)) return;
    heardMessageIds.current.add(message.id);
    if (heardMessageIds.current.size > 1000) {
      const oldest = heardMessageIds.current.values().next().value;
      if (oldest) heardMessageIds.current.delete(oldest);
    }
    const sound = chatSoundForMessage(message.sender_id, userIdRef.current, openRef.current);
    if (sound) void playSound(sound);
    if (message.sender_id !== userIdRef.current && userIdRef.current) {
      if (!openRef.current || document.visibilityState !== "visible" || !atBottomRef.current) {
        setUnreadCount((count) => count + 1);
        setFirstUnreadId((id) => id ?? message.id);
      }
    }
    if (forwardToPanel) setIncomingMessage(message);
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!supabase || !userIdRef.current) return;
    const { data, count } = await supabase.from("unread_messages").select("id,created_at", { count: "exact" }).order("created_at", { ascending: true }).limit(1);
    if (count !== null) setUnreadCount(count);
    setFirstUnreadId(data?.[0]?.id ?? null);
    if (openRef.current && data?.[0]?.id) setOpenUnreadId((id) => id ?? data[0].id);
  }, [supabase]);

  const markRead = useCallback(async () => {
    if (!supabase || !userIdRef.current || !openRef.current || !atBottomRef.current || document.visibilityState !== "visible" || markingRef.current) return;
    markingRef.current = true;
    try {
      const userId = userIdRef.current;
      let processed = false;
      let newestReadAt: string | null = null;
      for (let page = 0; page < 100; page++) {
        const { data, error } = await supabase.from("unread_messages").select("id,created_at").order("created_at", { ascending: true }).limit(500);
        if (error || !data?.length) break;
        if (!openRef.current || !atBottomRef.current || document.visibilityState !== "visible") break;
        const { error: receiptError } = await supabase.from("message_reads").upsert(data.map((item) => ({ user_id: userId, message_id: item.id })), { onConflict: "user_id,message_id", ignoreDuplicates: true });
        if (receiptError) break;
        processed = true;
        newestReadAt = data.at(-1)?.created_at ?? newestReadAt;
        if (data.length < 500) break;
      }
      if (processed && newestReadAt && openRef.current && atBottomRef.current && document.visibilityState === "visible") {
        const { data: cursor } = await supabase.from("chat_reads").select("last_read_at").eq("user_id", userId).maybeSingle();
        const lastReadAt = cursor?.last_read_at && cursor.last_read_at > newestReadAt ? cursor.last_read_at : newestReadAt;
        await supabase.from("chat_reads").upsert({ user_id: userId, last_read_at: lastReadAt, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      }
      await refreshUnread();
    } finally { markingRef.current = false; }
  }, [supabase, refreshUnread]);

  const handleReadPosition = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
    if (atBottom) void markRead();
  }, [markRead]);

  useEffect(() => {
    if (initialTitle.current === null) initialTitle.current = document.title;
    document.title = unreadCount ? `(${unreadCount}) ${initialTitle.current}` : initialTitle.current;
    return () => { if (initialTitle.current) document.title = initialTitle.current; };
  }, [unreadCount]);

  useEffect(() => {
    void preloadChatSounds();
    const unlock = () => {
      void resumeChatSounds();
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    const resumeOnVisibility = () => { void resumeChatSounds(); };
    document.addEventListener("visibilitychange", resumeOnVisibility);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      document.removeEventListener("visibilitychange", resumeOnVisibility);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    let reconnectTimer: number | undefined;
    let retryCount = 0;
    let channel: ReturnType<typeof client.channel> | null = null;

    function subscribe() {
      if (!active) return;
      const next = client.channel("crm-messages")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          if (active) { receiveMessage(payload.new as ChatMessage); if (openRef.current && atBottomRef.current && document.visibilityState === "visible") window.setTimeout(() => void markRead(), 100); }
        });
      channel = next;
      next.subscribe((status) => {
        if (!active || channel !== next) return;
        if (status === "SUBSCRIBED") { retryCount = 0; return; }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          channel = null;
          void client.removeChannel(next);
          reconnectTimer = window.setTimeout(subscribe, Math.min(1000 * 2 ** retryCount++, 10000));
        }
      });
    }

    function reconnectNow() {
      if (!active || channel || !userIdRef.current) return;
      window.clearTimeout(reconnectTimer);
      void refreshUnread();
      subscribe();
    }

    void client.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      userIdRef.current = data.user.id;
      void refreshUnread();
      subscribe();
    });
    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", reconnectNow);
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", reconnectNow);
      if (channel) void client.removeChannel(channel);
      userIdRef.current = null;
    };
  }, [supabase, receiveMessage, refreshUnread, markRead]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("crm-chat-read-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reads" }, () => void refreshUnread())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reads" }, () => void refreshUnread()).subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") { void refreshUnread(); void markRead(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); void supabase.removeChannel(channel); };
  }, [supabase, refreshUnread, markRead]);

  useEffect(() => { if (!isOpen) atBottomRef.current = false; }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (wasOpen.current && !isOpen) toggleRef.current?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  return (
    <div className="chat-widget" data-open={isOpen}>
      {isOpen && (
        <section className="chat-widget-panel" aria-label="Conversas da equipe">
          <MessagesModule
            supabase={supabase}
            profile={profile}
            onlineUserIds={onlineUserIds}
            incomingMessage={incomingMessage}
            onSent={(message) => receiveMessage(message, false)}
            unreadCount={unreadCount}
            firstUnreadId={openUnreadId ?? firstUnreadId}
            onReadPosition={handleReadPosition}
            onClose={() => onOpenChange(false)}
          />
        </section>
      )}
      <button
        className="chat-widget-toggle"
        type="button"
        aria-label={isOpen ? "Fechar conversas" : "Abrir conversas"}
        aria-expanded={isOpen}
        aria-controls={isOpen ? "workspace-conversation" : undefined}
        ref={toggleRef}
        onClick={() => { if (!isOpen) setOpenUnreadId(firstUnreadId); else setOpenUnreadId(null); onOpenChange(!isOpen); }}
      >
        {isOpen ? <X size={21} /> : <MessageCircle size={21} />}
        {!isOpen && unreadCount > 0 && <span className="chat-widget-unread" aria-label={`${unreadCount} mensagens não lidas`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
        <span className="sr-only">{isOpen ? "Fechar conversas" : "Abrir conversas"}</span>
      </button>
    </div>
  );
}

function TasksModule({ supabase }: { supabase: ReturnType<typeof createClient> }) {
  const toast = useAppToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) return;
      const { data } = await supabase.from("tasks").select("id,title,done,lead_id,created_at").is("lead_id", null).order("created_at", { ascending: false });
      if (active && data) setTasks(data as Task[]);
    }
    void load();
    if (!supabase) return () => { active = false; };
    const channel = supabase.channel("crm-tasks").on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => void load()).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [supabase]);

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    if (supabase) {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setIsSaving(false); return; }
      const { data, error } = await supabase.from("tasks").insert({ title: title.trim(), created_by: auth.user.id, assigned_to: auth.user.id }).select("id,title,done,lead_id,created_at").single();
      if (error || !data) toast("Não foi possível adicionar a tarefa. Tente novamente.", "error");
      else {
        setTasks((current) => [data as Task, ...current]);
        void publishSharedNotification("task_created", data.id).then((ok) => {
          if (!ok) toast("Tarefa salva, mas o aviso não chegou à equipe.", "error");
        });
      }
    } else {
      setIsSaving(false);
      return;
    }
    setTitle(""); setIsSaving(false);
  }

  async function toggleTask(task: Task) {
    if (!supabase || task.id.startsWith("task-")) return;
    const { error } = await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
    if (error) { toast("Não foi possível atualizar a tarefa.", "error"); return; }
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !task.done } : item));
    if (!task.done) void publishSharedNotification("task_completed", task.id).then((ok) => {
      if (!ok) toast("Tarefa concluída, mas o aviso não chegou à equipe.", "error");
    });
  }

  const pending = tasks.filter((task) => !task.done).length;
  return <div className="collab-page"><div className="page-heading"><div><p className="eyebrow">Trabalho em conjunto</p><h1>Tarefas compartilhadas</h1><p className="heading-description">Tudo que precisa acontecer para a próxima conversa não ficar para depois.</p></div><div className="collab-online"><span className="online-dot" /><span>{supabase ? "Sincronização ativa" : "Configure o Supabase"}</span></div></div><section className="collab-layout"><div className="collab-card task-card"><div className="collab-card-header"><div><h2>Minha lista</h2><p>{pending} pendentes · sincroniza em tempo real</p></div><Clock3 size={18} /></div><form className="task-form" onSubmit={addTask}><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Adicionar uma tarefa..." disabled={!supabase} /><button className="primary-button" disabled={isSaving || !supabase} aria-label="Adicionar tarefa"><Send size={15} /></button></form><div className="task-list">{tasks.map((task) => <button key={task.id} className={`task-row ${task.done ? "task-done" : ""}`} onClick={() => toggleTask(task)}><span className="task-check">{task.done && <Check size={13} />}</span><span>{task.title}</span></button>)}{!tasks.length && <div className="empty-state"><Check size={25} /><strong>Nenhuma tarefa ainda</strong><span>{supabase ? "Adicione o próximo passo da prospecção." : "Configure o Supabase para salvar tarefas reais."}</span></div>}</div></div><div className="collab-card focus-card"><div className="collab-card-header"><div><h2>Ritmo da equipe</h2><p>Uma visão rápida da colaboração</p></div><Users size={18} /></div><div className="focus-stat"><strong>{tasks.length - pending}</strong><span>concluídas</span></div><div className="focus-progress"><span style={{ width: `${tasks.length ? ((tasks.length - pending) / tasks.length) * 100 : 0}%` }} /></div><p className="focus-note">Marquem cada próximo passo assim que ele acontecer. O pipeline fica mais leve quando a tarefa certa está visível.</p></div></section></div>;
}

function MessagesModule({ supabase, profile, onlineUserIds, incomingMessage, onSent, unreadCount, firstUnreadId, onReadPosition, onClose }: {
  supabase: ReturnType<typeof createClient>;
  profile: Profile | null;
  onlineUserIds: string[];
  incomingMessage: ChatMessage | null;
  onSent: (message: ChatMessage) => void;
  unreadCount: number;
  firstUnreadId: string | null;
  onReadPosition: (atBottom: boolean) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, ChatProfile>>({});
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(supabase));
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(supabase ? "" : "Configure o Supabase para carregar as mensagens do workspace.");
  const [reloadKey, setReloadKey] = useState(0);
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [canEditGroup, setCanEditGroup] = useState(false);
  const [groupFile, setGroupFile] = useState<File | null>(null);
  const [groupPreview, setGroupPreview] = useState<string | null>(null);
  const [groupZoom, setGroupZoom] = useState(1);
  const [groupSaving, setGroupSaving] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordError, setRecordError] = useState("");
  const composerRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const initializedScroll = useRef(false);
  const previousLastId = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingLimitRef = useRef<number | null>(null);
  const cancelRecordingRef = useRef(false);
  const toast = useAppToast();

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  useEffect(() => () => { if (groupPreview) URL.revokeObjectURL(groupPreview); }, [groupPreview]);
  useEffect(() => () => {
    cancelRecordingRef.current = true;
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    if (recordingLimitRef.current) window.clearTimeout(recordingLimitRef.current);
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const scrollToBottom = useCallback(() => {
    const feed = feedRef.current;
    if (!feed) return;
    feed.scrollTop = feed.scrollHeight;
    if (!atBottomRef.current) { atBottomRef.current = true; setIsNearBottom(true); onReadPosition(true); }
    else if (!initializedScroll.current) onReadPosition(true);
  }, [onReadPosition]);

  useEffect(() => {
    if (isLoading) return;
    const feed = feedRef.current;
    if (!feed) return;
    const lastId = messages.at(-1)?.id ?? null;
    const isNew = previousLastId.current !== lastId;
    previousLastId.current = lastId;
    if (!initializedScroll.current || (isNew && atBottomRef.current)) {
      requestAnimationFrame(() => { scrollToBottom(); initializedScroll.current = true; });
    }
  }, [isLoading, messages, scrollToBottom]);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || isLoading) return;
    const observer = new ResizeObserver(() => { if (atBottomRef.current) scrollToBottom(); });
    observer.observe(feed);
    for (const child of feed.children) observer.observe(child);
    return () => observer.disconnect();
  }, [isLoading, messages, scrollToBottom]);

  function handleFeedScroll() {
    const feed = feedRef.current;
    if (!feed) return;
    const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 56;
    if (atBottom !== atBottomRef.current) { atBottomRef.current = atBottom; setIsNearBottom(atBottom); onReadPosition(atBottom); }
  }

  async function saveGroupPhoto() {
    if (!supabase || !groupFile || !canEditGroup) return;
    setGroupSaving(true);
    try {
      const bitmap = await createImageBitmap(groupFile);
      const side = Math.min(bitmap.width, bitmap.height) / groupZoom;
      const canvas = document.createElement("canvas");
      canvas.width = 512; canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas");
      context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
      if (!blob) throw new Error("crop");
      const path = `group/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage.from("chat-group").upload(path, blob, { contentType: "image/webp", upsert: false });
      if (uploadError) throw uploadError;
      const { error: settingsError } = await supabase.from("chat_settings").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("id", "team");
      if (settingsError) { await supabase.storage.from("chat-group").remove([path]); throw settingsError; }
      const { data: signed } = await supabase.storage.from("chat-group").createSignedUrl(path, 60 * 60 * 24);
      setGroupAvatarUrl(signed?.signedUrl ?? null);
      setGroupFile(null); setGroupPreview(null); setGroupZoom(1);
      toast("Foto do grupo atualizada.");
    } catch { toast("Não foi possível atualizar a foto do grupo.", "error"); }
    finally { setGroupSaving(false); }
  }

  function chooseGroupPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      toast("Escolha uma imagem JPG, PNG ou WebP de até 8 MB.", "error"); return;
    }
    setGroupFile(file); setGroupPreview(URL.createObjectURL(file)); setGroupZoom(1);
  }

  async function sendAudio(blob: Blob, duration: number, mimeType: string) {
    if (!supabase || !userId) return;
    setIsSending(true);
    const contentType = mimeType.split(";")[0];
    const extension = contentType === "audio/mp4" ? "m4a" : contentType === "audio/ogg" ? "ogg" : "webm";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("chat-audio").upload(path, blob, { contentType, upsert: false });
    if (uploadError) { setRecordError("Não foi possível enviar o áudio. Tente novamente."); setIsSending(false); return; }
    const { data, error: sendError } = await supabase.from("messages").insert({ sender_id: userId, content: "", message_type: "audio", audio_path: path, audio_duration_seconds: Math.min(300, Math.max(1, Math.ceil(duration))) }).select("id,content,image_path,message_type,audio_path,audio_duration_seconds,sender_id,created_at").single();
    if (sendError || !data) {
      await supabase.storage.from("chat-audio").remove([path]);
      setRecordError("Não foi possível salvar o áudio. Tente novamente."); setIsSending(false); return;
    }
    onSent(data as ChatMessage);
    const [hydrated] = await hydrateMessages(supabase, [data as ChatMessage]);
    setMessages((current) => mergeMessages(current, [hydrated]));
    setIsSending(false);
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setRecordError("Este navegador não permite gravar áudio."); return; }
    setRecordError("");
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { setRecordError("Formato de áudio não compatível com este navegador."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelRecordingRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const duration = (Date.now() - recordingStartedRef.current) / 1000;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        if (!cancelRecordingRef.current && chunksRef.current.length) void sendAudio(new Blob(chunksRef.current, { type: mimeType }), duration, mimeType);
        chunksRef.current = [];
      };
      recorder.start(1000);
      recordingStartedRef.current = Date.now();
      setRecordingSeconds(0); setRecording(true);
      recordingTimerRef.current = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - recordingStartedRef.current) / 1000)), 250);
      recordingLimitRef.current = window.setTimeout(() => stopRecording(false), 300_000);
    } catch (error) { setRecordError(error instanceof DOMException && error.name === "NotAllowedError" ? "Microfone bloqueado. Autorize o acesso nas configurações do navegador." : "Não foi possível iniciar o microfone. Confira o dispositivo e tente novamente."); }
  }

  function stopRecording(cancel: boolean) {
    cancelRecordingRef.current = cancel;
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    if (recordingLimitRef.current) window.clearTimeout(recordingLimitRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  useEffect(() => {
    composerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!supabase || !incomingMessage) return;
    let active = true;
    void hydrateMessages(supabase, [incomingMessage]).then((hydrated) => {
      if (active) setMessages((current) => mergeMessages(current, hydrated));
    });
    return () => { active = false; };
  }, [supabase, incomingMessage]);

  useEffect(() => {
    let active = true;
    if (!supabase) return;

    const client = supabase;
    async function loadChatProfiles() {
      const { data, error: profilesError } = await client
        .from("chat_profiles")
        .select("id,full_name,avatar_color,profile_avatar_path,last_seen_at");
      if (!active || profilesError || !data) return;

      const profiles = await Promise.all((data as Omit<ChatProfile, "avatar_url">[]).map(async (chatProfile) => {
        const { data: signedAvatar } = chatProfile.profile_avatar_path
          ? await client.storage.from("avatars").createSignedUrl(chatProfile.profile_avatar_path, 60 * 60)
          : { data: null };
        return { ...chatProfile, avatar_url: signedAvatar?.signedUrl ?? null };
      }));
      if (active) setSenderProfiles(Object.fromEntries(profiles.map((chatProfile) => [chatProfile.id, chatProfile])));
    }

    async function load() {
      setIsLoading(true);
      const [{ data, error: messageError }, { data: auth, error: authError }] = await Promise.all([
        client.from("messages").select("id,content,image_path,message_type,audio_path,audio_duration_seconds,sender_id,created_at").order("created_at", { ascending: false }).limit(100),
        client.auth.getUser(),
      ]);
      if (!active) return;

      if (messageError) {
        setError("Não foi possível carregar as mensagens. Confira sua conexão e tente novamente.");
      } else if (data) {
        const hydrated = await hydrateMessages(client, [...data].reverse() as ChatMessage[]);
        if (!active) return;
        setMessages((current) => mergeMessages(current, hydrated));
        setError("");
      }

      if (authError || !auth.user) {
        setError("Não foi possível identificar sua sessão. Entre novamente para usar o chat.");
      } else {
        setUserId(auth.user.id);
        setCanEditGroup(auth.user.app_metadata?.crm_role === "admin");
      }

      setIsLoading(false);
      void loadChatProfiles();
    }

    void load();
    async function loadGroup() {
      const { data } = await client.from("chat_settings").select("avatar_path").eq("id", "team").maybeSingle();
      if (!active) return;
      if (!data?.avatar_path) { setGroupAvatarUrl(null); return; }
      const { data: signed } = await client.storage.from("chat-group").createSignedUrl(data.avatar_path, 60 * 60 * 24);
      if (active) setGroupAvatarUrl(signed?.signedUrl ?? null);
    }
    void loadGroup();
    const profilesChannel = client.channel("crm-chat-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_profiles" }, () => void loadChatProfiles())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_settings" }, () => void loadGroup())
      .subscribe();

    return () => {
      active = false;
      void client.removeChannel(profilesChannel);
    };
  }, [supabase, reloadKey]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() && !imageFile) return;
    if (!supabase || !userId) return;

    setIsSending(true);
    setError("");
    let uploadedPath: string | null = null;
    if (imageFile) {
      const extension = imageFile.type === "image/jpeg" ? "jpg" : imageFile.type === "image/png" ? "png" : "webp";
      uploadedPath = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(uploadedPath, imageFile, {
        cacheControl: "3600",
        contentType: imageFile.type,
        upsert: false,
      });
      if (uploadError) {
        setError("Não foi possível enviar a imagem. Confira a configuração do armazenamento do chat e tente novamente.");
        toast("Falha ao enviar a imagem do chat.", "error");
        setIsSending(false);
        return;
      }
    }

    const { data, error: sendError } = await supabase.from("messages")
      .insert({ content: content.trim(), image_path: uploadedPath, sender_id: userId })
      .select("id,content,image_path,message_type,audio_path,audio_duration_seconds,sender_id,created_at")
      .single();
    if (sendError || !data) {
      if (uploadedPath) await supabase.storage.from("chat-attachments").remove([uploadedPath]);
      setError("Não foi possível enviar. Confira sua conexão e tente novamente.");
      toast("Não foi possível enviar a mensagem.", "error");
      setIsSending(false);
      return;
    }

    onSent(data as ChatMessage);
    const [hydrated] = await hydrateMessages(supabase, [data as ChatMessage]);
    setMessages((current) => mergeMessages(current, [hydrated]));
    setContent("");
    setImageFile(null);
    setImagePreview(null);
    setIsSending(false);
  }

  function chooseMessageImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast("Escolha uma imagem JPG, PNG ou WebP.", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast("A imagem precisa ter no máximo 8 MB.", "error");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  const currentUserProfile: ChatProfile | null = profile
    ? senderProfiles[profile.id] ?? { id: profile.id, full_name: profile.full_name, avatar_color: profile.avatar_color, profile_avatar_path: profile.avatar_path, last_seen_at: null, avatar_url: profile.avatar_url ?? null }
    : null;

  return (
    <div className="workspace-chat-widget-content" id="workspace-conversation">
      <input
        ref={imageInputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Anexar uma imagem à mensagem"
        onChange={chooseMessageImage}
      />
      <input ref={groupInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar foto do grupo" onChange={chooseGroupPhoto} />
      <ConversationThread
        messages={messages}
        userId={userId}
        profile={currentUserProfile}
        senderProfiles={senderProfiles}
        onlineUserIds={onlineUserIds}
        isLoading={isLoading}
        error={error}
        onRetry={() => setReloadKey((current) => current + 1)}
        groupAvatarUrl={groupAvatarUrl}
        onGroupAvatarClick={canEditGroup ? () => groupInputRef.current?.click() : undefined}
        feedRef={feedRef}
        onFeedScroll={handleFeedScroll}
        onScrollToBottom={scrollToBottom}
        pendingCount={!isNearBottom ? unreadCount : 0}
        firstUnreadId={firstUnreadId}
        headerAction={(
          <>
            <button className="workspace-chat-close" type="button" onClick={onClose} aria-label="Fechar conversas"><X size={17} /></button>
          </>
        )}
      >
        {groupPreview && <div className="workspace-chat-group-editor" role="dialog" aria-label="Ajustar foto do grupo">
          <div className="workspace-chat-group-crop"><Image src={groupPreview} alt="Prévia da foto do grupo" width={220} height={220} unoptimized style={{ transform: `scale(${groupZoom})` }} /></div>
          <label>Zoom <input type="range" min="1" max="3" step="0.1" value={groupZoom} onChange={(event) => setGroupZoom(Number(event.target.value))} /></label>
          <div><button type="button" onClick={() => { setGroupFile(null); setGroupPreview(null); }}>Cancelar</button><button type="button" onClick={() => void saveGroupPhoto()} disabled={groupSaving}>{groupSaving ? "Salvando..." : "Salvar foto"}</button></div>
        </div>}
        {recording ? <div className="workspace-chat-recording" role="status"><Mic size={16} /><span>Gravando {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")} / 5:00</span><button type="button" onClick={() => stopRecording(true)}>Cancelar</button><button type="button" onClick={() => stopRecording(false)}>Enviar</button></div> :
        <form className="workspace-chat-form" onSubmit={sendMessage}>
          <button className="workspace-chat-attach" type="button" onClick={() => imageInputRef.current?.click()} disabled={!supabase || !userId || isSending} aria-label="Anexar imagem" title="Anexar imagem"><Paperclip size={17} /></button>
          <input
            ref={composerRef}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Escreva uma mensagem..."
            aria-label="Escrever uma mensagem para a equipe"
            disabled={!supabase || !userId || isSending}
          />
          {content.trim() || imageFile ? <button
            className="primary-button"
            type="submit"
            aria-label="Enviar mensagem"
            disabled={!supabase || !userId || (!content.trim() && !imageFile) || isSending}
          >
            <Send size={16} />
            <span>{isSending ? "Enviando..." : "Enviar"}</span>
          </button> : <button className="primary-button" type="button" onClick={() => void startRecording()} disabled={!supabase || !userId || isSending} aria-label="Gravar mensagem de áudio" title="Gravar áudio"><Mic size={17} /><span>Áudio</span></button>}
        </form>}
        {recordError && <p className="workspace-chat-record-error" role="alert">{recordError}</p>}
        {imagePreview && <div className="workspace-chat-image-preview"><ImagePlus size={15} /><span>{imageFile?.name}</span><button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} aria-label="Remover imagem anexada"><X size={14} /></button><Image src={imagePreview} alt="Prévia da imagem que será enviada" width={220} height={165} unoptimized /></div>}
      </ConversationThread>
    </div>
  );
}

async function hydrateMessages(client: NonNullable<ReturnType<typeof createClient>>, messages: ChatMessage[]) {
  return Promise.all(messages.map(async (message) => {
    const [image, audio] = await Promise.all([
      message.image_path ? client.storage.from("chat-attachments").createSignedUrl(message.image_path, 60 * 60 * 24) : Promise.resolve({ data: null }),
      message.audio_path ? client.storage.from("chat-audio").createSignedUrl(message.audio_path, 60 * 60 * 24) : Promise.resolve({ data: null }),
    ]);
    return { ...message, image_url: image.data?.signedUrl ?? null, audio_url: audio.data?.signedUrl ?? null };
  }));
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const uniqueMessages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) uniqueMessages.set(message.id, message);
  return [...uniqueMessages.values()].sort((first, second) => first.created_at.localeCompare(second.created_at));
}
