import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Send, Search, Phone, MoreVertical, Paperclip, Check, CheckCheck,
  Clock, MessageCircleOff, UserPlus, ExternalLink, User, ChevronDown,
  Mic, MicOff, Image as ImageIcon, FileText, Play, Pause, X, Download,
  Video, Smile, Reply, CornerUpLeft, Settings,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { evolutionApi } from '@/services/whatsapp'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toast'

// ─── tipos ────────────────────────────────────────────────────────────────────

interface WaInstance {
  id: string
  instance_name: string
  instance_token: string | null
  phone_number: string | null
  label: string | null
  status: string
}

interface EvoChat {
  remoteJid: string
  phoneNumber: string
  pushName: string
  profilePicUrl?: string
  lastMessageContent?: string
  lastMessageTs?: number
  lastFromMe?: boolean
  unreadCount: number
  leadId?: string
  leadStage?: string
}

interface EvoMessage {
  id: string
  keyId: string
  fromMe: boolean
  content: string
  type: string
  timestamp: number
  status?: string
  pending?: boolean
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker'
  mimeType?: string
  fileName?: string
  duration?: number
  replyQuote?: { keyId: string; content: string; fromMe: boolean; remoteJid: string }
}

// ─── emojis comuns ────────────────────────────────────────────────────────────

const EMOJIS = [
  '😀','😂','😍','🤔','😊','😭','😅','🤣','😎','🥰',
  '😤','😡','🙄','😴','🤗','😬','🥺','😏','😇','🤩',
  '👍','👎','👏','🙏','✌️','🤞','💪','🫶','❤️','🔥',
  '🎉','💯','⭐','✅','❌','🚀','💡','📱','💬','📞',
  '🏠','🚗','💰','📅','⏰','🎯','🔑','📋','✏️','🗑️',
  '😃','😄','🙂','😌','😶','🤐','🤫','😒','🫤','😑',
]

// ─── helpers ──────────────────────────────────────────────────────────────────

function extractPhone(remoteJid: string): string {
  return remoteJid.replace(/@.+$/, '')
}

function extractContent(msg: Record<string, unknown>): string {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return ''
  return (
    (m.conversation as string) ||
    ((m.extendedTextMessage as Record<string, unknown>)?.text as string) ||
    ((m.imageMessage as Record<string, unknown>)?.caption as string) ||
    ((m.videoMessage as Record<string, unknown>)?.caption as string) ||
    ((m.documentMessage as Record<string, unknown>)?.title as string) ||
    ((m.documentMessage as Record<string, unknown>)?.fileName as string) ||
    ''
  )
}

function extractMedia(msg: Record<string, unknown>): Pick<EvoMessage, 'mediaType' | 'mimeType' | 'fileName' | 'duration'> {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return {}
  if (m.imageMessage) {
    const img = m.imageMessage as Record<string, unknown>
    return { mediaType: 'image', mimeType: img.mimetype as string }
  }
  if (m.audioMessage || m.pttMessage) {
    const aud = (m.audioMessage ?? m.pttMessage) as Record<string, unknown>
    return { mediaType: 'audio', mimeType: aud.mimetype as string, duration: aud.seconds as number }
  }
  if (m.videoMessage) {
    const vid = m.videoMessage as Record<string, unknown>
    return { mediaType: 'video', mimeType: vid.mimetype as string, duration: vid.seconds as number }
  }
  if (m.documentMessage) {
    const doc = m.documentMessage as Record<string, unknown>
    return { mediaType: 'document', mimeType: doc.mimetype as string, fileName: (doc.title ?? doc.fileName) as string }
  }
  if (m.stickerMessage) return { mediaType: 'sticker', mimeType: 'image/webp' }
  return {}
}

function extractReplyQuote(msg: Record<string, unknown>): EvoMessage['replyQuote'] | undefined {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return undefined
  const ext = m.extendedTextMessage as Record<string, unknown> | undefined
  const ctx = ext?.contextInfo as Record<string, unknown> | undefined
  if (!ctx?.stanzaId) return undefined
  const quoted = ctx.quotedMessage as Record<string, unknown> | undefined
  const quotedContent =
    (quoted?.conversation as string) ||
    ((quoted?.extendedTextMessage as Record<string, unknown>)?.text as string) || ''
  return {
    keyId: ctx.stanzaId as string,
    content: quotedContent,
    fromMe: (ctx.participant as string)?.includes('fromMe') ?? false,
    remoteJid: (ctx.remoteJid as string) ?? '',
  }
}

function fmtDuration(sec?: number) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

/** Formata timestamp para lista de conversas: HH:mm se hoje, Ontem, ou dd/mm */
function fmtConvTime(ts: number): string {
  const date = new Date(ts * 1000)
  const now = new Date()
  if (isSameDay(date, now))
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, yesterday)) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** Rótulo do separador de data no chat */
function dateSeparatorLabel(ts: number): string {
  const date = new Date(ts * 1000)
  const now = new Date()
  if (isSameDay(date, now)) return 'Hoje'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, yesterday)) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/** Detecta URLs no texto e retorna partes renderizáveis */
function renderLinks(text: string): (string | React.ReactElement)[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--neon)', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
      : part
  )
}

/** Resolve o melhor nome para um contato */
function resolveName(
  phone: string,
  pushName: string,
  contactsMap: Record<string, string>,
  leadsMap: Record<string, string>,
): string {
  // 1. Nome do lead cadastrado no CRM
  const leadName = leadsMap[phone] || Object.entries(leadsMap).find(([p]) => p.endsWith(phone.slice(-8)))?.[1]
  if (leadName) return leadName
  // 2. Nome do contato salvo no WhatsApp
  const contactName = contactsMap[phone]
  if (contactName) return contactName
  // 3. pushName da mensagem
  if (pushName?.trim()) return pushName.trim()
  // 4. Número formatado
  return phone ? `+${phone}` : 'Desconhecido'
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 32 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (src && !err) {
    return (
      <img src={src} alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={() => setErr(true)}
      />
    )
  }
  const initials = name
    .split(' ').slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || '?'
  const colors = ['#075e54','#128c7e','#25d366','#0a84ff','#bf5af2','#ff9f0a','#ff3b30','#32ade6']
  const bg = colors[name.charCodeAt(0) % colors.length]
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38), fontWeight: 700, color: '#fff',
    }}>
      {initials}
    </div>
  )
}

// ─── ImageMessage ─────────────────────────────────────────────────────────────

function ImageMessage({ keyId, fromMe, remoteJid, instanceToken, caption, mimeType }: {
  keyId: string; fromMe: boolean; remoteJid: string
  instanceToken: string; caption?: string; mimeType?: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    let cancelled = false
    evolutionApi.getMediaBase64(instanceToken, { id: keyId, fromMe, remoteJid }).then(b64 => {
      if (cancelled || !b64) { if (!cancelled) setLoading(false); return }
      const mime = mimeType || 'image/jpeg'
      setSrc(b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [keyId, fromMe, remoteJid, instanceToken, mimeType])

  if (loading) return (
    <div style={{ width: 200, height: 140, borderRadius: 6, background: 'var(--el)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 18, height: 18, border: '2px solid var(--neon)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </div>
  )
  if (!src) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
      <ImageIcon size={13} /> Imagem não disponível
    </div>
  )
  return (
    <>
      <img src={src} alt="imagem" onClick={() => setLightbox(true)}
        style={{ maxWidth: 240, maxHeight: 240, borderRadius: 6, cursor: 'zoom-in', display: 'block' }}
      />
      {caption && <p style={{ fontSize: 11, color: 'var(--t)', marginTop: 4 }}>{caption}</p>}
      {lightbox && (
        <div onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setLightbox(false)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: 6, display: 'flex' }}>
            <X size={18} />
          </button>
          <a href={src} download="imagem.jpg" onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 16, right: 58, background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: 6, display: 'flex' }}>
            <Download size={18} />
          </a>
          <img src={src} alt="imagem" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>
      )}
    </>
  )
}

// ─── VideoMessage ─────────────────────────────────────────────────────────────

function VideoMessage({ keyId, fromMe, remoteJid, instanceToken, caption, mimeType, duration }: {
  keyId: string; fromMe: boolean; remoteJid: string
  instanceToken: string; caption?: string; mimeType?: string; duration?: number
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  const loadVideo = () => {
    if (loaded || loading) return
    setLoading(true)
    evolutionApi.getMediaBase64(instanceToken, { id: keyId, fromMe, remoteJid }).then(b64 => {
      if (!b64) { setLoading(false); return }
      const mime = mimeType || 'video/mp4'
      setSrc(b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`)
      setLoading(false); setLoaded(true)
    })
  }

  return (
    <>
      <div onClick={() => { loadVideo(); if (loaded && src) setLightbox(true) }}
        style={{ width: 220, height: 140, borderRadius: 6, overflow: 'hidden', background: 'var(--el)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
        {!loaded && !loading && (
          <>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.15)', border: '2px solid rgba(255,255,255,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={20} style={{ color: '#fff', marginLeft: 2 }} />
              </div>
              {duration && <span style={{ fontSize: 10, color: 'rgba(255,255,255,.8)', fontFamily: 'var(--fm)' }}>{fmtDuration(duration)}</span>}
            </div>
            <Video size={28} style={{ color: 'var(--t3)' }} />
          </>
        )}
        {loading && <div style={{ width: 22, height: 22, border: '2px solid var(--neon)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />}
        {loaded && src && <video src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      {caption && <p style={{ fontSize: 11, color: 'var(--t)', marginTop: 4 }}>{caption}</p>}
      {lightbox && src && (
        <div onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setLightbox(false)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: 6, display: 'flex' }}>
            <X size={18} />
          </button>
          <video src={src} controls autoPlay onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      )}
    </>
  )
}

// ─── DocumentMessage ──────────────────────────────────────────────────────────

function DocumentMessage({ keyId, fromMe, remoteJid, instanceToken, fileName, mimeType }: {
  keyId: string; fromMe: boolean; remoteJid: string
  instanceToken: string; fileName?: string; mimeType?: string
}) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const b64 = await evolutionApi.getMediaBase64(instanceToken, { id: keyId, fromMe, remoteJid })
      if (!b64) { toast.error('Arquivo não disponível'); return }
      const mime = mimeType || 'application/octet-stream'
      const dataUrl = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`
      const a = document.createElement('a')
      a.href = dataUrl; a.download = fileName || 'documento'; a.click()
    } catch { toast.error('Erro ao baixar arquivo') }
    finally { setDownloading(false) }
  }

  const ext = fileName?.split('.').pop()?.toUpperCase() ?? 'DOC'
  return (
    <div onClick={handleDownload}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', background: 'rgba(255,255,255,.04)', border: '1px solid var(--bs)', minWidth: 160, maxWidth: 240 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}>
      <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <FileText size={14} style={{ color: 'var(--neon)' }} />
        <span style={{ fontSize: 7, color: 'var(--neon)', fontWeight: 700 }}>{ext}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName || 'Documento'}</p>
        <p style={{ fontSize: 9, color: 'var(--t3)' }}>Toque para baixar</p>
      </div>
      <div style={{ flexShrink: 0 }}>
        {downloading
          ? <div style={{ width: 14, height: 14, border: '2px solid var(--neon)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
          : <Download size={14} style={{ color: 'var(--t3)' }} />}
      </div>
    </div>
  )
}

// ─── AudioMessage ─────────────────────────────────────────────────────────────

function AudioMessage({ keyId, fromMe, remoteJid, instanceToken, duration, mimeType }: {
  keyId: string; fromMe: boolean; remoteJid: string
  instanceToken: string; duration?: number; mimeType?: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(duration ?? 0)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    let cancelled = false
    evolutionApi.getMediaBase64(instanceToken, { id: keyId, fromMe, remoteJid }).then(b64 => {
      if (cancelled || !b64) { if (!cancelled) setLoading(false); return }
      const mime = mimeType?.includes('ogg') ? 'audio/ogg' : mimeType?.includes('mp4') ? 'audio/mp4' : 'audio/ogg; codecs=opus'
      setSrc(b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [keyId, fromMe, remoteJid, instanceToken, mimeType])

  const togglePlay = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) } else { a.play(); setPlaying(true) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', minWidth: 180 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--el)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 12, height: 12, border: '2px solid var(--t3)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--t3)' }}>Carregando…</span>
    </div>
  )
  if (!src) return <span style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>🎵 Áudio {duration ? `(${fmtDuration(duration)})` : ''}</span>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
      <audio ref={audioRef} src={src}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0) }}
        onTimeUpdate={() => {
          const a = audioRef.current
          if (!a || !a.duration) return
          setCurrentTime(a.currentTime)
          setProgress((a.currentTime / a.duration) * 100)
        }}
        onLoadedMetadata={() => {
          const a = audioRef.current
          if (a && a.duration && isFinite(a.duration)) setAudioDuration(Math.round(a.duration))
        }}
      />
      <button onClick={togglePlay}
        style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'var(--neon)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ height: 3, background: 'var(--bs)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            const a = audioRef.current
            if (a && a.duration) a.currentTime = pct * a.duration
          }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--neon)', borderRadius: 2, transition: 'width .1s linear' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>{fmtDuration(Math.round(currentTime))}</span>
          <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>{fmtDuration(audioDuration)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, instanceToken, remoteJid, onReply }: {
  msg: EvoMessage; instanceToken: string; remoteJid: string
  onReply?: (msg: EvoMessage) => void
}) {
  const [hovered, setHovered] = useState(false)
  const time = new Date(msg.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const StatusIcon = () => {
    if (!msg.fromMe) return null
    if (msg.pending) return <Clock size={11} style={{ color: 'var(--t3)' }} />
    if (msg.status === 'READ') return <CheckCheck size={11} style={{ color: '#53bdeb' }} />
    if (msg.status === 'DELIVERY_ACK' || msg.status === 'PLAYED') return <CheckCheck size={11} style={{ color: 'var(--t3)' }} />
    return <Check size={11} style={{ color: 'var(--t3)' }} />
  }

  const renderContent = () => {
    if (msg.mediaType === 'image' || msg.mediaType === 'sticker') {
      return <ImageMessage keyId={msg.keyId} fromMe={msg.fromMe} remoteJid={remoteJid}
        instanceToken={instanceToken} caption={msg.content || undefined} mimeType={msg.mimeType} />
    }
    if (msg.mediaType === 'audio') {
      return <AudioMessage keyId={msg.keyId} fromMe={msg.fromMe} remoteJid={remoteJid}
        instanceToken={instanceToken} duration={msg.duration} mimeType={msg.mimeType} />
    }
    if (msg.mediaType === 'video') {
      return <VideoMessage keyId={msg.keyId} fromMe={msg.fromMe} remoteJid={remoteJid}
        instanceToken={instanceToken} caption={msg.content || undefined} mimeType={msg.mimeType} duration={msg.duration} />
    }
    if (msg.mediaType === 'document') {
      return <DocumentMessage keyId={msg.keyId} fromMe={msg.fromMe} remoteJid={remoteJid}
        instanceToken={instanceToken} fileName={msg.fileName} mimeType={msg.mimeType} />
    }
    if (msg.content) {
      return <p style={{ color: 'var(--t)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.4 }}>
        {renderLinks(msg.content)}
      </p>
    }
    return <p style={{ color: 'var(--t3)', fontStyle: 'italic', fontSize: 11 }}>{msg.type}</p>
  }

  return (
    <div style={{ display: 'flex', justifyContent: msg.fromMe ? 'flex-end' : 'flex-start', marginBottom: 2, position: 'relative', paddingLeft: msg.fromMe ? 40 : 0, paddingRight: msg.fromMe ? 0 : 40 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      {hovered && onReply && (
        <button onClick={() => onReply(msg)} title="Responder"
          style={{
            position: 'absolute', top: 4,
            ...(msg.fromMe ? { left: 4 } : { right: 4 }),
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--el)', border: '1px solid var(--bs)',
            color: 'var(--t3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
          }}>
          <Reply size={12} />
        </button>
      )}

      <div style={{
        maxWidth: (msg.mediaType === 'image' || msg.mediaType === 'sticker' || msg.mediaType === 'video') ? 260 : '75%',
        padding: msg.mediaType ? '5px 5px 4px' : '6px 9px 4px',
        borderRadius: 8,
        opacity: msg.pending ? .65 : 1,
        ...(msg.fromMe
          ? { background: '#005c4b', borderTopRightRadius: 2 }
          : { background: '#1f2c34', borderTopLeftRadius: 2 })
      }}>
        {msg.replyQuote && (
          <div style={{ borderLeft: '3px solid var(--neon)', marginBottom: 5, background: 'rgba(0,0,0,.2)', borderRadius: '0 5px 5px 0', padding: '4px 8px' }}>
            <p style={{ fontSize: 10, color: 'var(--neon)', fontWeight: 600, marginBottom: 2 }}>
              <CornerUpLeft size={9} style={{ display: 'inline', marginRight: 3 }} />
              {msg.replyQuote.fromMe ? 'Você' : 'Contato'}
            </p>
            <p style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
              {msg.replyQuote.content || '📎 Mídia'}
            </p>
          </div>
        )}

        {renderContent()}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', fontFamily: 'var(--fm)' }}>{time}</span>
          <StatusIcon />
        </div>
      </div>
    </div>
  )
}

// ─── EmojiPicker ─────────────────────────────────────────────────────────────

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute', bottom: '100%', left: 0, zIndex: 100, marginBottom: 6,
      background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10,
      padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,.45)',
      display: 'grid', gridTemplateColumns: 'repeat(10, 28px)', gap: 2, width: 304,
    }}>
      {EMOJIS.map(e => (
        <button key={e} onClick={() => { onSelect(e); onClose() }}
          style={{ width: 28, height: 28, fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e2 => (e2.currentTarget.style.background = 'var(--ng)')}
          onMouseLeave={e2 => (e2.currentTarget.style.background = 'none')}>
          {e}
        </button>
      ))}
    </div>
  )
}

// ─── DateSeparator ────────────────────────────────────────────────────────────

function DateSeparator({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '10px 0 6px' }}>
      <span style={{
        fontSize: 11, color: 'var(--t3)', background: 'var(--el)',
        border: '1px solid var(--bs)', borderRadius: 12,
        padding: '3px 10px', fontWeight: 500,
      }}>
        {label}
      </span>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function WhatsApp() {
  const { store, user } = useAuthStore()
  const navigate = useNavigate()
  const { openLeadPanel, openLeadPanelCreate } = useLeadPanelStore()
  const queryClient = useQueryClient()

  const [selectedChat, setSelectedChat] = useState<EvoChat | null>(null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [showInstanceMenu, setShowInstanceMenu] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSecs, setRecordingSecs] = useState(0)
  const [replyTo, setReplyTo] = useState<EvoMessage | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)

  const messagesEndRef    = useRef<HTMLDivElement>(null)
  const bulkUpsertedRef   = useRef<Record<string, boolean>>({})
  const sendingRef        = useRef(false)
  const fileInputRef      = useRef<HTMLInputElement>(null)
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const audioChunksRef    = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef          = useRef<HTMLInputElement>(null)

  // ── instâncias conectadas ────────────────────────────────────────────────
  const { data: instances, refetch: refetchInstances } = useQuery({
    queryKey: ['whatsapp-instances-db', store?.id],
    queryFn: async (): Promise<WaInstance[]> => {
      if (!store?.id) return []
      // Primeiro: tenta banco (instâncias já sincronizadas)
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, instance_token, phone_number, label, status')
        .eq('store_id', store.id)
        .eq('status', 'connected')
      if ((data ?? []).length > 0) return data as WaInstance[]

      // Fallback: se banco vazio, retorna lista vazia (UazapiGO requer token)
      return []
    },
    enabled: !!store?.id,
    staleTime: 15000,
    refetchOnWindowFocus: true,
  })

  const [selectedInstance, setSelectedInstance] = useState('')

  useEffect(() => {
    if (instances?.length && !selectedInstance)
      setSelectedInstance(instances[0].instance_name)
    if (instances && selectedInstance && !instances.some(i => i.instance_name === selectedInstance)) {
      setSelectedInstance(instances[0]?.instance_name ?? '')
      setSelectedChat(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances])

  // Realtime status de instância
  useEffect(() => {
    if (!store?.id) return
    const ch = supabase.channel(`wa-inst-st-${store.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_instances', filter: `store_id=eq.${store.id}` },
        () => refetchInstances())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id])

  const instanceList = instances ?? []
  const instanceName  = selectedInstance
  const instanceToken = instanceList.find(i => i.instance_name === selectedInstance)?.instance_token ?? ''

  const handleSelectInstance = (name: string) => {
    setSelectedInstance(name)
    setSelectedChat(null)
    setShowInstanceMenu(false)
    queryClient.removeQueries({ queryKey: ['whatsapp-conversations', name] })
  }

  useEffect(() => {
    if (!showInstanceMenu) return
    const handler = () => setShowInstanceMenu(false)
    document.addEventListener('click', handler, { capture: true, once: true })
    return () => document.removeEventListener('click', handler, { capture: true })
  }, [showInstanceMenu])

  // ── contatos do WhatsApp (para resolver nomes) ───────────────────────────
  const { data: contactsMap = {} } = useQuery({
    queryKey: ['whatsapp-contacts', instanceName],
    queryFn: () => evolutionApi.findContacts(instanceToken),
    enabled: !!instanceToken,
    staleTime: 120_000,
  })

  // ── leads do banco (para resolver nomes com mais precisão) ───────────────
  const { data: leadsMap = {} } = useQuery({
    queryKey: ['leads-phone-map', store?.id],
    queryFn: async () => {
      if (!store?.id) return {}
      const { data } = await supabase
        .from('leads')
        .select('client_phone, client_name')
        .eq('store_id', store.id)
        .not('client_phone', 'is', null)
      const map: Record<string, string> = {}
      for (const l of data ?? []) {
        if (l.client_phone && l.client_name) {
          const phone = l.client_phone.replace(/\D/g, '')
          map[phone] = l.client_name
        }
      }
      return map
    },
    enabled: !!store?.id,
    staleTime: 30_000,
  })

  // ── lista de conversas ────────────────────────────────────────────────────
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['whatsapp-conversations', instanceName],
    queryFn: async () => {
      if (!instanceToken) return []
      const chats = await evolutionApi.findChats(instanceToken)
      if (!Array.isArray(chats)) return []

      const mapped = chats
        .filter((c: Record<string, unknown>) => {
          const jid = c.remoteJid as string
          return jid && !jid.endsWith('@g.us') && !jid.includes('@broadcast') && !jid.includes('status')
        })
        .map((chat: Record<string, unknown>): EvoChat => {
          const lastMsg    = chat.lastMessage as Record<string, unknown> | undefined
          const key        = lastMsg?.key as Record<string, unknown> | undefined
          const fromMe     = key?.fromMe as boolean | undefined
          const remoteJid  = chat.remoteJid as string
          const phone      = extractPhone(remoteJid)
          const rawPush    = ((chat.pushName ?? lastMsg?.pushName ?? '') as string).trim()
          const displayName = resolveName(phone, rawPush, contactsMap, leadsMap)

          return {
            remoteJid,
            phoneNumber: phone,
            pushName: displayName,
            profilePicUrl: chat.profilePicUrl as string | undefined,
            lastMessageContent: extractContent(lastMsg ?? {}),
            lastMessageTs: lastMsg?.messageTimestamp as number | undefined,
            lastFromMe: fromMe,
            unreadCount: (chat.unreadCount as number) ?? 0,
          }
        })
        .sort((a, b) => (b.lastMessageTs ?? 0) - (a.lastMessageTs ?? 0))

      // Busca fotos dos primeiros 15 sem foto
      const withoutPic = mapped.filter(c => !c.profilePicUrl).slice(0, 15)
      if (withoutPic.length > 0) {
        const results = await Promise.allSettled(
          withoutPic.map(c => evolutionApi.fetchProfilePicture(instanceToken, c.phoneNumber))
        )
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value) withoutPic[i].profilePicUrl = r.value
        })
      }
      return mapped
    },
    enabled: !!instanceToken,
    staleTime: 8000,
    refetchInterval: 15000,
  })

  // ── auto-criar leads a partir das conversas ───────────────────────────────
  useEffect(() => {
    if (!conversations?.length || !store?.id || !user?.id) return
    if (bulkUpsertedRef.current[instanceName]) return
    bulkUpsertedRef.current[instanceName] = true
    const run = async () => {
      const { data: firstStage } = await supabase.from('pipeline_stages').select('id, name').eq('store_id', store.id).eq('position', 1).single()
      if (!firstStage) return
      const { data: existing } = await supabase.from('leads').select('client_phone').eq('store_id', store.id)
      const existingPhones = new Set((existing ?? []).map(l => (l.client_phone ?? '').replace(/\D/g, '')))
      const toInsert = conversations
        .filter(c => c.phoneNumber.length >= 8)
        .filter(c => !Array.from(existingPhones).some(p => p.endsWith(c.phoneNumber.slice(-8))))
        .map(c => ({
          store_id: store.id, salesperson_id: user.id, stage_id: firstStage.id,
          client_name: c.pushName, client_phone: c.phoneNumber, source: 'whatsapp', status: 'active',
        }))
      if (!toInsert.length) return
      await supabase.from('leads').insert(toInsert)
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-phone-map'] })
    }
    run().catch(console.error)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, store?.id, user?.id])

  // ── upsert de lead ao abrir conversa ─────────────────────────────────────
  const upsertLeadMutation = useMutation({
    mutationFn: async (chat: EvoChat) => {
      if (!store?.id || !user?.id) return null
      const last8 = chat.phoneNumber.slice(-8)
      const { data: existing } = await supabase.from('leads').select('id, stage_id, pipeline_stages(name)')
        .eq('store_id', store.id).ilike('client_phone', `%${last8}`).maybeSingle()
      if (existing) return { leadId: existing.id, leadStage: (existing.pipeline_stages as unknown as { name: string } | null)?.name, isNew: false }
      const { data: firstStage } = await supabase.from('pipeline_stages').select('id, name').eq('store_id', store.id).eq('position', 1).single()
      if (!firstStage) return null
      const { data: newLead, error } = await supabase.from('leads').insert({
        store_id: store.id, salesperson_id: user.id, stage_id: firstStage.id,
        client_name: chat.pushName, client_phone: chat.phoneNumber, source: 'whatsapp', status: 'active',
      }).select('id').single()
      if (error) throw error
      return { leadId: newLead.id, leadStage: firstStage.name, isNew: true }
    },
    onSuccess: (result, chat) => {
      if (!result) return
      setSelectedChat(prev => prev?.remoteJid === chat.remoteJid ? { ...prev, leadId: result.leadId, leadStage: result.leadStage } : prev)
      if (result.isNew) {
        toast.success(`Lead criado: ${chat.pushName}`, `Adicionado em "${result.leadStage}"`)
        queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] })
        queryClient.invalidateQueries({ queryKey: ['leads'] })
      }
    },
  })

  const handleSelectChat = useCallback((chat: EvoChat) => {
    // Atualiza o nome do chat com as informações mais recentes antes de selecionar
    const updatedChat = {
      ...chat,
      pushName: resolveName(chat.phoneNumber, chat.pushName, contactsMap, leadsMap),
    }
    setSelectedChat(updatedChat)
    setShowInstanceMenu(false)
    setReplyTo(null)
    upsertLeadMutation.mutate(updatedChat)
    if (chat.unreadCount > 0 && instanceToken)
      evolutionApi.markAsRead(instanceToken, chat.remoteJid).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, user?.id, instanceToken, contactsMap, leadsMap])

  // ── mensagens ─────────────────────────────────────────────────────────────
  const messagesQueryKey = ['whatsapp-messages', instanceName, selectedChat?.remoteJid]

  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: async () => {
      const res = await evolutionApi.findMessages(instanceToken, selectedChat!.remoteJid, 60) as Record<string, unknown> | null
      const msgs = res?.messages as Record<string, unknown> | undefined
      const records: Record<string, unknown>[] = (msgs?.records ?? res?.records ?? []) as Record<string, unknown>[]
      return records.map((msg): EvoMessage => {
        const key = msg.key as Record<string, unknown>
        const updates = (msg.MessageUpdate as Record<string, unknown>[] | undefined) ?? []
        const lastUpdate = updates[updates.length - 1]
        const media = extractMedia(msg)
        const replyQuote = extractReplyQuote(msg)
        return {
          id: msg.id as string,
          keyId: (key?.id as string) ?? (msg.id as string),
          fromMe: (key?.fromMe as boolean) ?? false,
          content: extractContent(msg),
          type: (msg.messageType as string) ?? 'unknown',
          timestamp: (msg.messageTimestamp as number) ?? 0,
          status: (lastUpdate?.status as string) ?? (msg.status as string),
          replyQuote,
          ...media,
        }
      }).sort((a, b) => a.timestamp - b.timestamp)
    },
    enabled: !!selectedChat?.remoteJid && !!instanceToken,
    refetchInterval: sendingRef.current ? false : 5000,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Supabase Realtime — novas mensagens ───────────────────────────────────
  useEffect(() => {
    if (!store?.id || !instanceToken) return
    const jid = selectedChat?.remoteJid

    const channel = supabase.channel(`wa-rt-${store.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `store_id=eq.${store.id}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const rowJid = row.remote_jid as string

          if (jid && (rowJid === jid || rowJid === jid.replace('@s.whatsapp.net', '') + '@s.whatsapp.net')) {
            setTimeout(() => queryClient.invalidateQueries({ queryKey: messagesQueryKey }), 400)
          }
          queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', instanceName] })

          if ((!jid || rowJid !== jid) && row.direction === 'inbound') {
            const senderPhone = (rowJid as string)?.replace(/@.+$/, '')
            const senderName = (row.push_name as string) || contactsMap[senderPhone] || leadsMap[senderPhone] || `+${senderPhone}`
            toast.info('💬 Nova mensagem', senderName)
          }
        })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, instanceToken, selectedChat?.remoteJid])

  // ── envio de texto ────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedChat) throw new Error('Nenhum chat selecionado')
      if (!instanceToken) throw new Error('Conecte um número em Configurações.')
      if (replyTo) {
        await evolutionApi.sendTextWithQuote(instanceToken, selectedChat.phoneNumber, text, {
          keyId: replyTo.keyId, fromMe: replyTo.fromMe,
          remoteJid: selectedChat.remoteJid, content: replyTo.content,
        })
      } else {
        await evolutionApi.sendText(instanceToken, selectedChat.phoneNumber, text)
      }
      await supabase.from('whatsapp_messages').insert({
        store_id: store!.id, instance_name: instanceName,
        remote_jid: selectedChat.remoteJid, direction: 'outbound',
        type: 'text', content: text, status: 'sent', from_me: true,
      })
    },
    onMutate: async (text) => {
      sendingRef.current = true
      await queryClient.cancelQueries({ queryKey: messagesQueryKey })
      const previous = queryClient.getQueryData<EvoMessage[]>(messagesQueryKey)
      const optimistic: EvoMessage = {
        id: `pending-${Date.now()}`, keyId: `pending-${Date.now()}`,
        fromMe: true, content: text, type: 'conversation',
        timestamp: Math.floor(Date.now() / 1000), pending: true,
        replyQuote: replyTo ? { keyId: replyTo.keyId, content: replyTo.content, fromMe: replyTo.fromMe, remoteJid: selectedChat?.remoteJid ?? '' } : undefined,
      }
      queryClient.setQueryData<EvoMessage[]>(messagesQueryKey, old => [...(old ?? []), optimistic])
      setMessage(''); setReplyTo(null)
      return { previous }
    },
    onSuccess: () => {
      setTimeout(async () => {
        const before = queryClient.getQueryData<EvoMessage[]>(messagesQueryKey) ?? []
        const pending = before.filter(m => m.pending)
        await queryClient.refetchQueries({ queryKey: messagesQueryKey })
        if (pending.length > 0) {
          const after = queryClient.getQueryData<EvoMessage[]>(messagesQueryKey) ?? []
          const stillMissing = pending.filter(p => !after.some(m => m.id === p.id))
          if (stillMissing.length > 0) queryClient.setQueryData<EvoMessage[]>(messagesQueryKey, [...after, ...stillMissing])
        }
        sendingRef.current = false
      }, 3000)
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', instanceName] })
    },
    onError: (err: Error, _text, context) => {
      sendingRef.current = false
      if (context?.previous) queryClient.setQueryData(messagesQueryKey, context.previous)
      setMessage(_text)
      toast.error('Erro ao enviar', err.message)
    },
  })

  const handleSend = () => {
    if (!message.trim() || sendMutation.isPending) return
    sendMutation.mutate(message.trim())
  }

  // ── envio de imagem ───────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedChat || !instanceToken) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1]
      if (!base64) return
      if (file.type.startsWith('image/')) {
        const ok = await evolutionApi.sendImageBase64(instanceToken, selectedChat.phoneNumber, base64)
        if (ok) { setTimeout(() => queryClient.invalidateQueries({ queryKey: messagesQueryKey }), 2000) }
        else toast.error('Erro ao enviar imagem')
      } else {
        toast.info('Tipo não suportado', 'Apenas imagens por enquanto.')
      }
    }
    reader.readAsDataURL(file)
  }

  // ── gravação de áudio ─────────────────────────────────────────────────────
  const startRecording = async () => {
    if (!selectedChat || !instanceToken) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg' })
        const reader = new FileReader()
        reader.onloadend = async () => {
          const b64 = (reader.result as string).split(',')[1]
          if (!b64) return
          const ok = await evolutionApi.sendAudio(instanceToken, selectedChat.phoneNumber, b64)
          if (ok) setTimeout(() => queryClient.invalidateQueries({ queryKey: messagesQueryKey }), 3000)
          else toast.error('Erro ao enviar áudio')
        }
        reader.readAsDataURL(blob)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true); setRecordingSecs(0)
      recordingTimerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000)
    } catch { toast.error('Microfone indisponível', 'Permita acesso ao microfone.') }
  }

  const stopRecording = (cancel = false) => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
    setIsRecording(false); setRecordingSecs(0)
    if (cancel) {
      mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
      mediaRecorderRef.current = null; audioChunksRef.current = []
    } else {
      mediaRecorderRef.current?.stop()
    }
  }

  useEffect(() => () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop())
  }, [])

  // ── nome e dados da instância selecionada ────────────────────────────────
  const curInstance = instanceList.find(i => i.instance_name === instanceName)
  const instanceLabel = curInstance?.phone_number ? `+${curInstance.phone_number}` : curInstance?.label ?? instanceName

  const filteredConvs = conversations?.filter(c =>
    c.pushName.toLowerCase().includes(search.toLowerCase()) || c.phoneNumber.includes(search)
  )

  // ── separadores de data no chat ───────────────────────────────────────────
  const messagesWithSeparators = (() => {
    if (!messages) return []
    const items: ({ type: 'separator'; label: string } | { type: 'message'; msg: EvoMessage })[] = []
    let lastLabel = ''
    for (const msg of messages) {
      const label = dateSeparatorLabel(msg.timestamp)
      if (label !== lastLabel) { items.push({ type: 'separator', label }); lastLabel = label }
      items.push({ type: 'message', msg })
    }
    return items
  })()

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', height: 'calc(100vh - 78px)',
      borderRadius: 9, overflow: 'hidden',
      border: '1px solid var(--bs)', background: 'var(--card)',
    }}>

      {/* ── Lista de conversas ── */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--bs)', display: 'flex', flexDirection: 'column', background: '#111b21' }}>

        {/* Header */}
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>WhatsApp</span>
            <button onClick={() => navigate('/configuracoes')} title="Configurações"
              style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
              <Settings size={16} />
            </button>
          </div>

          {/* Seletor de instância */}
          {instanceList.length > 0 ? (
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <button onClick={() => setShowInstanceMenu(v => !v)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
                  color: 'var(--t)', fontSize: 12, fontWeight: 500, fontFamily: 'var(--fn)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#25d366', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {instanceLabel || 'Selecionar número'}
                  </span>
                </div>
                {instanceList.length > 1 && (
                  <ChevronDown size={13} style={{ flexShrink: 0, marginLeft: 4, transform: showInstanceMenu ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                )}
              </button>

              {showInstanceMenu && instanceList.length > 1 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 3,
                  background: '#1f2c34', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,.5)', overflow: 'hidden',
                }}>
                  {instanceList.map(inst => {
                    const label = inst.phone_number ? `+${inst.phone_number}` : inst.label ?? inst.instance_name
                    const isActive = inst.instance_name === instanceName
                    return (
                      <button key={inst.instance_name} onClick={() => handleSelectInstance(inst.instance_name)}
                        style={{
                          width: '100%', padding: '9px 12px', textAlign: 'left',
                          background: isActive ? 'rgba(37,211,102,.1)' : 'transparent',
                          border: 'none', borderBottom: '1px solid rgba(255,255,255,.05)',
                          color: isActive ? '#25d366' : 'var(--t2)',
                          fontSize: 12, fontWeight: isActive ? 600 : 400,
                          cursor: 'pointer', fontFamily: 'var(--fn)',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#25d366', flexShrink: 0 }} />
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 7, background: 'rgba(255,200,0,.06)', border: '1px solid rgba(255,200,0,.15)', marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>⚠️</span>
              <p style={{ fontSize: 10, color: '#ffd60a' }}>
                Nenhum número conectado.{' '}
                <button onClick={() => navigate('/configuracoes')} style={{ background: 'none', border: 'none', color: '#ffd60a', cursor: 'pointer', fontSize: 10, textDecoration: 'underline', padding: 0 }}>
                  Configurar
                </button>
              </p>
            </div>
          )}

          {/* Busca */}
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
            <input type="text" placeholder="Pesquisar ou começar conversa" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', height: 32, paddingLeft: 30, paddingRight: 9,
                background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.05)',
                borderRadius: 8, color: 'var(--t)', fontSize: 12, outline: 'none', fontFamily: 'var(--fn)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(37,211,102,.3)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.05)')}
            />
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                  <Skeleton style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton style={{ height: 11, borderRadius: 4, width: '70%' }} />
                    <Skeleton style={{ height: 9, borderRadius: 4, width: '50%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : !filteredConvs?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70%', gap: 10, color: 'var(--t3)', padding: 24, textAlign: 'center' }}>
              <MessageCircleOff size={32} style={{ opacity: .4 }} />
              <p style={{ fontSize: 13, color: 'var(--t2)' }}>{instanceName ? 'Nenhuma conversa' : 'Conecte um número primeiro'}</p>
              {!instanceName && <p style={{ fontSize: 11, color: 'var(--t3)' }}>Vá em Configurações → WhatsApp</p>}
            </div>
          ) : (
            filteredConvs.map(chat => {
              const isActive = selectedChat?.remoteJid === chat.remoteJid
              return (
                <button key={chat.remoteJid} onClick={() => handleSelectChat(chat)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', textAlign: 'left',
                    background: isActive ? '#2a3942' : 'transparent',
                    cursor: 'pointer', border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,.04)',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#202c33' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                  <Avatar src={chat.profilePicUrl} name={chat.pushName} size={46} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#e9edef', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {chat.pushName}
                      </span>
                      {chat.lastMessageTs && (
                        <span style={{ fontSize: 11, color: chat.unreadCount > 0 ? '#25d366' : '#8696a0', flexShrink: 0, fontFamily: 'var(--fm)' }}>
                          {fmtConvTime(chat.lastMessageTs)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <p style={{ fontSize: 12, color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {chat.lastFromMe && <span style={{ color: '#25d366', opacity: .8 }}>✓ </span>}
                        {chat.lastMessageContent || `+${chat.phoneNumber}`}
                      </p>
                      {chat.unreadCount > 0 && (
                        <span style={{
                          background: '#25d366', color: '#111b21', fontSize: 11, fontWeight: 700,
                          minWidth: 20, height: 20, borderRadius: 10, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                        }}>
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Área de chat ── */}
      {selectedChat ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0b141a' }}>

          {/* Header */}
          <div style={{
            height: 56, padding: '0 14px', borderBottom: '1px solid rgba(255,255,255,.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#202c33', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar src={selectedChat.profilePicUrl} name={selectedChat.pushName} size={38} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#e9edef' }}>{selectedChat.pushName}</span>
                  {selectedChat.leadId && (
                    <button onClick={() => navigate('/pipeline')}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#25d366', opacity: .8, background: 'none', border: 'none', cursor: 'pointer' }}>
                      <ExternalLink size={9} /> {selectedChat.leadStage}
                    </button>
                  )}
                  {upsertLeadMutation.isPending && (
                    <span style={{ fontSize: 9, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <UserPlus size={9} /> criando lead...
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: '#8696a0', fontFamily: 'var(--fm)' }}>
                  +{selectedChat.phoneNumber}
                  {instanceList.length > 1 && <span style={{ marginLeft: 6, opacity: .7 }}>· via {instanceLabel}</span>}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => {
                if (selectedChat.leadId) openLeadPanel(selectedChat.leadId)
                else openLeadPanelCreate({ client_name: selectedChat.pushName, client_phone: selectedChat.phoneNumber, source: 'whatsapp' })
              }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#aebac1',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#25d366'; e.currentTarget.style.color = '#25d366' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = '#aebac1' }}>
                <User size={11} /> Lead
              </button>
              <Button variant="ghost" size="icon-sm"><Phone size={14} /></Button>
              <Button variant="ghost" size="icon-sm"><MoreVertical size={14} /></Button>
            </div>
          </div>

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 4px', display: 'flex', flexDirection: 'column' }}>
            {loadingMsgs && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
                <div style={{ width: 24, height: 24, border: '2px solid #25d366', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
              </div>
            )}
            {!loadingMsgs && !messages?.length && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'column', gap: 8, color: '#8696a0', paddingTop: 40 }}>
                <span style={{ fontSize: 32 }}>💬</span>
                <p style={{ fontSize: 13 }}>Nenhuma mensagem ainda.</p>
                <p style={{ fontSize: 11, opacity: .6 }}>Envie a primeira mensagem!</p>
              </div>
            )}
            {messagesWithSeparators.map((item, idx) =>
              item.type === 'separator'
                ? <DateSeparator key={`sep-${idx}`} label={item.label} />
                : <MessageBubble key={item.msg.id}
                    msg={item.msg} instanceToken={instanceToken}
                    remoteJid={selectedChat.remoteJid} onReply={setReplyTo} />
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '6px 10px 8px', background: '#202c33', borderTop: '1px solid rgba(255,255,255,.06)', flexShrink: 0 }}>

            {/* Preview de resposta */}
            {replyTo && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                padding: '5px 10px', borderRadius: 8,
                background: 'rgba(37,211,102,.06)', border: '1px solid rgba(37,211,102,.15)',
                borderLeft: '3px solid #25d366',
              }}>
                <CornerUpLeft size={12} style={{ color: '#25d366', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 10, color: '#25d366', fontWeight: 600 }}>
                    {replyTo.fromMe ? 'Você' : selectedChat.pushName}
                  </p>
                  <p style={{ fontSize: 11, color: '#8696a0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {replyTo.content || '📎 Mídia'}
                  </p>
                </div>
                <button onClick={() => setReplyTo(null)}
                  style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Barra de gravação */}
            {isRecording && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,60,60,.08)', border: '1px solid rgba(255,60,60,.2)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff3c3c', animation: 'pulse 1s ease-in-out infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--t2)', flex: 1 }}>Gravando… {fmtDuration(recordingSecs)}</span>
                <button onClick={() => stopRecording(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8696a0', display: 'flex' }}>
                  <X size={14} />
                </button>
                <button onClick={() => stopRecording(false)}
                  style={{ padding: '3px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#25d366', color: '#111', fontSize: 11, fontWeight: 700 }}>
                  Enviar
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
              {showEmoji && (
                <EmojiPicker
                  onSelect={e => { setMessage(prev => prev + e); inputRef.current?.focus() }}
                  onClose={() => setShowEmoji(false)}
                />
              )}

              <button onClick={() => setShowEmoji(v => !v)} title="Emojis"
                style={{ color: showEmoji ? '#25d366' : '#8696a0', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#e9edef')}
                onMouseLeave={e => (e.currentTarget.style.color = showEmoji ? '#25d366' : '#8696a0')}>
                <Smile size={20} />
              </button>

              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              <button onClick={() => fileInputRef.current?.click()} title="Enviar imagem"
                style={{ color: '#8696a0', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#e9edef')}
                onMouseLeave={e => (e.currentTarget.style.color = '#8696a0')}>
                <Paperclip size={20} />
              </button>

              <input ref={inputRef} type="text"
                placeholder={isRecording ? 'Gravando áudio…' : 'Digite uma mensagem'}
                value={message} disabled={isRecording}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                style={{
                  flex: 1, height: 40, padding: '0 14px',
                  background: '#2a3942', border: '1px solid rgba(255,255,255,.06)',
                  borderRadius: 24, color: '#e9edef', fontSize: 13, outline: 'none', fontFamily: 'var(--fn)',
                  opacity: isRecording ? .5 : 1,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(37,211,102,.25)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)')}
              />

              {message.trim() ? (
                <button onClick={handleSend} disabled={sendMutation.isPending}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                    background: '#25d366', color: '#111', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', opacity: sendMutation.isPending ? .6 : 1,
                  }}>
                  {sendMutation.isPending
                    ? <div style={{ width: 14, height: 14, border: '2px solid #111', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                    : <Send size={16} />}
                </button>
              ) : (
                <button onClick={isRecording ? () => stopRecording(false) : startRecording}
                  title={isRecording ? 'Enviar áudio' : 'Gravar áudio'}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: 'none',
                    background: isRecording ? '#25d366' : '#2a3942',
                    color: isRecording ? '#111' : '#8696a0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                  {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b141a', flexDirection: 'column', gap: 16 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: '#202c33', border: '1px solid rgba(255,255,255,.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Phone size={32} style={{ color: '#8696a0' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#e9edef', marginBottom: 6 }}>Selecione uma conversa</p>
            <p style={{ fontSize: 12, color: '#8696a0' }}>Leads são criados automaticamente ao abrir</p>
          </div>
          {instanceList.length === 0 && (
            <button onClick={() => navigate('/configuracoes')}
              style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, background: '#25d366', color: '#111', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              Conectar WhatsApp
            </button>
          )}
        </div>
      )}
    </div>
  )
}
