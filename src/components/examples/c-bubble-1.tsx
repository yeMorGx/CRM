"use client"

import { Fragment, useMemo, useState, type ReactNode, type RefObject } from "react"

import { CircleCheck, CircleX, Clock3, Users, X } from "lucide-react"
import Image from "next/image"
import { ChatAudioPlayer } from "@/components/chat-audio-player"
import { ChatImageLightbox } from "@/components/chat-image-lightbox"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type ChatMessage = {
  id: string
  content: string
  image_path: string | null
  image_url?: string | null
  message_type?: "text" | "audio"
  audio_path?: string | null
  audio_url?: string | null
  audio_duration_seconds?: number | null
  sender_id: string
  created_at: string
}

export type ChatProfile = {
  id: string
  full_name: string
  avatar_color: string
  profile_avatar_path: string | null
  last_seen_at: string | null
  avatar_url?: string | null
}

type ConversationThreadProps = {
  messages: ChatMessage[]
  userId: string | null
  profile: ChatProfile | null
  senderProfiles: Record<string, ChatProfile>
  onlineUserIds: string[]
  isLoading: boolean
  error: string
  onRetry: () => void
  headerAction?: ReactNode
  groupAvatarUrl?: string | null
  onGroupAvatarClick?: () => void
  feedRef?: RefObject<HTMLDivElement | null>
  onFeedScroll?: () => void
  onScrollToBottom?: () => void
  pendingCount?: number
  firstUnreadId?: string | null
  children: ReactNode
}

function localDay(value: string) {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function dayLabel(value: string) {
  const day = localDay(value)
  const today = localDay(new Date().toISOString())
  const difference = Math.round((today - day) / 86_400_000)
  if (difference === 0) return "Hoje"
  if (difference === 1) return "Ontem"
  if (difference > 1 && difference < 7) return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date(value))
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length > 1) return `${parts[0][0]}${parts.at(-1)?.[0]}`.toUpperCase()
  return parts[0]?.[0]?.toUpperCase() || "?"
}

function currentUserName(profile: ChatProfile | null) {
  return profile?.full_name.trim() || "Usuário"
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function lastSeenLabel(value: string | null, online: boolean) {
  if (online) return "Online agora"
  if (!value || Number.isNaN(new Date(value).getTime())) return "Último acesso indisponível"
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return "Visto há menos de um minuto"
  if (minutes < 60) return `Visto há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Visto há ${hours} h`
  return `Visto em ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))}`
}

export function ConversationThread({
  messages,
  userId,
  profile,
  senderProfiles,
  onlineUserIds,
  isLoading,
  error,
  onRetry,
  headerAction,
  groupAvatarUrl,
  onGroupAvatarClick,
  feedRef,
  onFeedScroll,
  onScrollToBottom,
  pendingCount = 0,
  firstUnreadId,
  children,
}: ConversationThreadProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null)
  const images = useMemo(() => messages.filter((message) => message.image_url && message.image_path).map((message) => ({ id: message.id, url: message.image_url!, path: message.image_path!, sender: senderProfiles[message.sender_id]?.full_name || "Equipe" })), [messages, senderProfiles])
  const unreadMarkerId = firstUnreadId && (messages.some((message) => message.id === firstUnreadId) ? firstUnreadId : messages.find((message) => message.sender_id !== userId)?.id)

  return (<>
    <Card className="workspace-chat-card">
      <CardHeader className="workspace-chat-header">
        <button type="button" className="workspace-chat-group-photo-button" onClick={onGroupAvatarClick} disabled={!onGroupAvatarClick} aria-label={onGroupAvatarClick ? "Trocar foto do grupo" : "Foto do grupo"} title={onGroupAvatarClick ? "Trocar foto do grupo" : undefined}>
          <Avatar size="sm" className="workspace-chat-team-avatar">
            <AvatarImage src={groupAvatarUrl ?? undefined} alt="" />
            <AvatarFallback className="workspace-chat-team-avatar-fallback"><Users size={18} /></AvatarFallback>
          </Avatar>
        </button>
        <div className="workspace-chat-heading-copy">
          <CardTitle>Conversas da equipe</CardTitle>
          <CardDescription>
            Canal único da equipe · {onlineUserIds.length} {onlineUserIds.length === 1 ? "pessoa" : "pessoas"} online
          </CardDescription>
        </div>
        {headerAction}
      </CardHeader>

      <div className="workspace-chat-feed-wrap">
      <CardContent ref={feedRef} onScroll={onFeedScroll} className="workspace-chat-feed" aria-live="polite" aria-relevant="additions">
        {error && (
          <div className="workspace-chat-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={onRetry}>Tentar novamente</button>
          </div>
        )}

        {isLoading ? (
          <div className="workspace-chat-empty" role="status">
            Carregando mensagens...
          </div>
        ) : messages.length ? (
          messages.map((message, index) => {
            const mine = message.sender_id === userId
            const senderProfile = mine ? profile : senderProfiles[message.sender_id]
            const sender = mine ? currentUserName(profile) : senderProfile?.full_name?.trim() || "Equipe"
            const time = formatTime(message.created_at)
            const online = onlineUserIds.includes(message.sender_id)
            const selected = selectedUserId === message.sender_id

            const showDay = index === 0 || localDay(messages[index - 1].created_at) !== localDay(message.created_at)
            return (<Fragment key={message.id}>
              {showDay && <div className="workspace-chat-date-separator"><span>{dayLabel(message.created_at)}</span></div>}
              {message.id === unreadMarkerId && <div className="workspace-chat-unread-separator"><span>Mensagens novas</span></div>}
              <div
                className={`workspace-chat-message ${mine ? "workspace-chat-message-mine" : ""}`}
              >
                <button className="workspace-chat-message-user-avatar" type="button" onClick={() => setSelectedUserId(selected ? null : message.sender_id)} aria-label={`Ver perfil de ${sender}`} aria-expanded={selected}>
                  <Avatar size="sm" className="workspace-chat-message-avatar">
                    <AvatarImage src={senderProfile?.avatar_url ?? undefined} alt="" />
                    <AvatarFallback
                      className="workspace-chat-message-avatar-fallback"
                      style={senderProfile?.avatar_color ? { backgroundColor: senderProfile.avatar_color, color: "#11130f" } : undefined}
                    >
                      {initials(sender)}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <div className="workspace-chat-message-body">
                  <button className="workspace-chat-sender" type="button" onClick={() => setSelectedUserId(selected ? null : message.sender_id)} aria-expanded={selected}>{sender}</button>
                  {selected && <aside className="workspace-chat-user-card" role="dialog" aria-label={`Perfil de ${sender}`}>
                    <button className="workspace-chat-user-card-close" type="button" onClick={() => setSelectedUserId(null)} aria-label="Fechar perfil"><X size={14} /></button>
                    <Avatar size="sm" className="workspace-chat-user-card-avatar">
                      <AvatarImage src={senderProfile?.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="workspace-chat-message-avatar-fallback" style={senderProfile?.avatar_color ? { backgroundColor: senderProfile.avatar_color, color: "#11130f" } : undefined}>{initials(sender)}</AvatarFallback>
                    </Avatar>
                    <strong>{sender}</strong>
                    <span className={`workspace-chat-user-presence ${online ? "is-online" : ""}`}>
                      {online ? <CircleCheck size={13} /> : <CircleX size={13} />}
                      {online ? "Online" : "Offline"}
                    </span>
                    <small><Clock3 size={12} />{lastSeenLabel(senderProfile?.last_seen_at ?? null, online)}</small>
                  </aside>}
                  <Bubble
                    align={mine ? "end" : "start"}
                    variant={mine ? "default" : "muted"}
                    className={`workspace-chat-bubble ${message.image_url && !message.content ? "workspace-chat-bubble-image-only" : ""}`}
                  >
                    <BubbleContent className="workspace-chat-bubble-content">
                      <span className="sr-only">{sender} disse: </span>
                      {message.image_url && <button className="workspace-chat-image-link" type="button" onClick={() => setSelectedImageId(message.id)} aria-label={`Abrir imagem enviada por ${sender}`}><Image src={message.image_url} alt={`Imagem enviada por ${sender}`} width={600} height={450} unoptimized /></button>}
                      {message.message_type === "audio" && message.audio_url && <ChatAudioPlayer id={message.id} src={message.audio_url} duration={message.audio_duration_seconds ?? 0} activeId={activeAudioId} onActivate={setActiveAudioId} />}
                      {message.message_type === "audio" && !message.audio_url && <span>Áudio indisponível</span>}
                      {message.content && <span>{message.content}</span>}
                    </BubbleContent>
                  </Bubble>
                  {time && (
                    <time className="workspace-chat-time" dateTime={message.created_at}>
                      {time}
                    </time>
                  )}
                </div>
              </div>
            </Fragment>)
          })
        ) : (
          <div className="workspace-chat-empty">
            <strong>A conversa começa aqui</strong>
            <span>Envie a primeira mensagem para a equipe.</span>
          </div>
        )}
      </CardContent>
      {pendingCount > 0 && <button className="workspace-chat-new-button" type="button" onClick={onScrollToBottom}>Nova mensagem ↓ {pendingCount > 1 ? `(${pendingCount})` : ""}</button>}
      </div>

      <CardFooter className="workspace-chat-composer">{children}</CardFooter>
    </Card>
    {selectedImageId && <ChatImageLightbox images={images} selectedId={selectedImageId} onClose={() => setSelectedImageId(null)} />}
  </>)
}
