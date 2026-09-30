"use client";

import { Check, Clock3, ImagePlus, MessageCircle, Paperclip, Send, Users, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";

import { createClient } from "@/lib/supabase/client";
import { ConversationThread, type ChatMessage, type ChatProfile } from "@/components/examples/c-bubble-1";
import type { Profile } from "@/components/profile-page";
import { useAppToast } from "@/components/app-toast-provider";
import { publishSharedNotification } from "@/lib/notifications";

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
        onClick={() => onOpenChange(!isOpen)}
      >
        {isOpen ? <X size={21} /> : <MessageCircle size={21} />}
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

function MessagesModule({ supabase, profile, onlineUserIds, onClose }: {
  supabase: ReturnType<typeof createClient>;
  profile: Profile | null;
  onlineUserIds: string[];
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
  const composerRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const toast = useAppToast();

  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

  useEffect(() => {
    composerRef.current?.focus();
  }, []);

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
        client.from("messages").select("id,content,image_path,sender_id,created_at").order("created_at", { ascending: false }).limit(100),
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
      }

      setIsLoading(false);
      void loadChatProfiles();
    }

    void load();
    const channel = client.channel("crm-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (active) void hydrateMessages(client, [payload.new as ChatMessage]).then((hydrated) => {
          if (active) setMessages((current) => mergeMessages(current, hydrated));
        });
      })
      .subscribe();
    const profilesChannel = client.channel("crm-chat-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_profiles" }, () => void loadChatProfiles())
      .subscribe();

    return () => {
      active = false;
      void client.removeChannel(channel);
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
      .select("id,content,image_path,sender_id,created_at")
      .single();
    if (sendError || !data) {
      if (uploadedPath) await supabase.storage.from("chat-attachments").remove([uploadedPath]);
      setError("Não foi possível enviar. Confira sua conexão e tente novamente.");
      toast("Não foi possível enviar a mensagem.", "error");
      setIsSending(false);
      return;
    }

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
      <ConversationThread
        messages={messages}
        userId={userId}
        profile={currentUserProfile}
        senderProfiles={senderProfiles}
        onlineUserIds={onlineUserIds}
        isLoading={isLoading}
        error={error}
        onRetry={() => setReloadKey((current) => current + 1)}
        headerAction={(
          <>
            <button className="workspace-chat-close" type="button" onClick={onClose} aria-label="Fechar conversas"><X size={17} /></button>
          </>
        )}
      >
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
          <button
            className="primary-button"
            type="submit"
            aria-label="Enviar mensagem"
            disabled={!supabase || !userId || (!content.trim() && !imageFile) || isSending}
          >
            <Send size={16} />
            <span>{isSending ? "Enviando..." : "Enviar"}</span>
          </button>
        </form>
        {imagePreview && <div className="workspace-chat-image-preview"><ImagePlus size={15} /><span>{imageFile?.name}</span><button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} aria-label="Remover imagem anexada"><X size={14} /></button><Image src={imagePreview} alt="Prévia da imagem que será enviada" width={220} height={165} unoptimized /></div>}
      </ConversationThread>
    </div>
  );
}

async function hydrateMessages(client: NonNullable<ReturnType<typeof createClient>>, messages: ChatMessage[]) {
  return Promise.all(messages.map(async (message) => {
    if (!message.image_path) return { ...message, image_url: null };
    const { data, error } = await client.storage.from("chat-attachments").createSignedUrl(message.image_path, 60 * 60 * 24);
    if (error) return { ...message, image_url: null };
    return { ...message, image_url: data.signedUrl };
  }));
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const uniqueMessages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) uniqueMessages.set(message.id, message);
  return [...uniqueMessages.values()].sort((first, second) => first.created_at.localeCompare(second.created_at));
}
