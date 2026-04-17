import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Send, Search, Phone, MoreVertical, Paperclip, Check, CheckCheck,
  Clock, MessageCircleOff, UserPlus, ExternalLink, User, ChevronDown,
  Mic, MicOff, Image as ImageIcon, FileText, Play, Pause, X, Download,
  Video, Smile, Reply, CornerUpLeft,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { evolutionApi, configureEvolutionApi } from '@/services/whatsapp'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toast'
import { timeAgo } from '@/utils/format'

// ─── tipos ────────────────────────────────────────────────────────────────────

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

function extractPhone(remoteJid: string, remoteJidAlt?: string): string {
  if (remoteJidAlt) return remoteJidAlt.replace('@s.whatsapp.net', '')
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
  if (m.stickerMessage) {
    return { mediaType: 'sticker', mimeType: 'image/webp' }
  }
  return {}
}

function extractReplyQuote(msg: Record<string, unknown>): EvoMessage['replyQuote'] | undefined {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return undefined
  // extendedTextMessage pode conter contextInfo com quotedMessage
  const ext = m.extendedTextMessage as Record<string, unknown> | undefined
  const ctx = ext?.contextInfo as Record<string, unknown> | undefined
  if (!ctx?.stanzaId) return undefined
  const quoted = ctx.quotedMessage as Record<string, unknown> | undefined
  const quotedContent =
    (quoted?.conversation as string) ||
    ((quoted?.extendedTextMessage as Record<string, unknown>)?.text as string) ||
    ''
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

/** Detecta URLs no texto e retorna array de partes para renderizar como links */
function renderLinks(text: string): (string | React.ReactElement)[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--neon)', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
      : part
  )
}

// ─── Avatar com fallback ──────────────────────────────────────────────────────

function Avatar({ src, name, size = 32 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (src && !err) {
    return (
      <img
        src={src} alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={() => setErr(true)}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--ng)', border: '1px solid var(--nb)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.35), fontWeight: 700, color: 'var(--neon)',
    }}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

// ─── Componente de imagem (busca base64 lazy) ─────────────────────────────────

function ImageMessage({
  keyId, fromMe, remoteJid, instanceName, caption, mimeType,
}: {
  keyId: string; fromMe: boolean; remoteJid: string
  instanceName: string; caption?: string; mimeType?: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    let cancelled = false
    evolutionApi.getMediaBase64(instanceName, { id: keyId, fromMe, remoteJid }).then(b64 => {
      if (cancelled || !b64) { if (!cancelled) setLoading(false); return }
      const mime = mimeType || 'image/jpeg'
      setSrc(b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [keyId, fromMe, remoteJid, instanceName, mimeType])

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
      <img
        src={src} alt="imagem"
        onClick={() => setLightbox(true)}
        style={{ maxWidth: 220, maxHeight: 220, borderRadius: 6, cursor: 'zoom-in', display: 'block' }}
      />
      {caption && <p style={{ fontSize: 11, color: 'var(--t)', marginTop: 4 }}>{caption}</p>}
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <button onClick={() => setLightbox(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: 6, display: 'flex' }}>
            <X size={18} />
          </button>
          <a href={src} download="imagem.jpg" onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 16, right: 58, background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: 6, display: 'flex' }}>
            <Download size={18} />
          </a>
          <img src={src} alt="imagem" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>
      )}
    </>
  )
}

// ─── Componente de vídeo (busca base64 lazy) ──────────────────────────────────

function VideoMessage({
  keyId, fromMe, remoteJid, instanceName, caption, mimeType, duration,
}: {
  keyId: string; fromMe: boolean; remoteJid: string
  instanceName: string; caption?: string; mimeType?: string; duration?: number
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const loadVideo = () => {
    if (loaded || loading) return
    setLoading(true)
    evolutionApi.getMediaBase64(instanceName, { id: keyId, fromMe, remoteJid }).then(b64 => {
      if (!b64) { setLoading(false); return }
      const mime = mimeType || 'video/mp4'
      setSrc(b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`)
      setLoading(false)
      setLoaded(true)
    })
  }

  return (
    <>
      <div
        onClick={() => { loadVideo(); if (loaded && src) setLightbox(true) }}
        style={{
          width: 220, height: 140, borderRadius: 6, overflow: 'hidden',
          background: 'var(--el)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative', flexShrink: 0,
        }}
      >
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
        {loading && (
          <div style={{ width: 22, height: 22, border: '2px solid var(--neon)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        )}
        {loaded && src && (
          <video src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
      {caption && <p style={{ fontSize: 11, color: 'var(--t)', marginTop: 4 }}>{caption}</p>}
      {lightbox && src && (
        <div
          onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <button onClick={() => setLightbox(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: 6, display: 'flex' }}>
            <X size={18} />
          </button>
          <video
            src={src} controls autoPlay
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }}
          />
        </div>
      )}
    </>
  )
}

// ─── Componente de documento (download) ──────────────────────────────────────

function DocumentMessage({
  keyId, fromMe, remoteJid, instanceName, fileName, mimeType,
}: {
  keyId: string; fromMe: boolean; remoteJid: string
  instanceName: string; fileName?: string; mimeType?: string
}) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const b64 = await evolutionApi.getMediaBase64(instanceName, { id: keyId, fromMe, remoteJid })
      if (!b64) { toast.error('Arquivo não disponível', 'Tente novamente em instantes'); return }
      const mime = mimeType || 'application/octet-stream'
      const dataUrl = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = fileName || 'documento'
      a.click()
    } catch {
      toast.error('Erro ao baixar arquivo')
    } finally {
      setDownloading(false)
    }
  }

  const ext = fileName?.split('.').pop()?.toUpperCase() ?? 'DOC'

  return (
    <div
      onClick={handleDownload}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
        background: 'rgba(255,255,255,.04)', border: '1px solid var(--bs)',
        minWidth: 160, maxWidth: 240,
        transition: 'background .12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.08)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')}
    >
      <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <FileText size={14} style={{ color: 'var(--neon)' }} />
        <span style={{ fontSize: 7, color: 'var(--neon)', fontWeight: 700 }}>{ext}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName || 'Documento'}
        </p>
        <p style={{ fontSize: 9, color: 'var(--t3)' }}>Toque para baixar</p>
      </div>
      <div style={{ flexShrink: 0 }}>
        {downloading
          ? <div style={{ width: 14, height: 14, border: '2px solid var(--neon)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
          : <Download size={14} style={{ color: 'var(--t3)' }} />
        }
      </div>
    </div>
  )
}

// ─── Componente de áudio ──────────────────────────────────────────────────────

function AudioMessage({
  keyId, fromMe, remoteJid, instanceName, duration, mimeType,
}: {
  keyId: string; fromMe: boolean; remoteJid: string
  instanceName: string; duration?: number; mimeType?: string
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
    evolutionApi.getMediaBase64(instanceName, { id: keyId, fromMe, remoteJid }).then(b64 => {
      if (cancelled || !b64) { if (!cancelled) setLoading(false); return }
      const mime = mimeType?.includes('ogg') ? 'audio/ogg' : mimeType?.includes('mp4') ? 'audio/mp4' : 'audio/ogg; codecs=opus'
      setSrc(b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [keyId, fromMe, remoteJid, instanceName, mimeType])

  const togglePlay = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) }
    else { a.play(); setPlaying(true) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', minWidth: 180 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--el)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 12, height: 12, border: '2px solid var(--t3)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--t3)' }}>Carregando áudio…</span>
    </div>
  )
  if (!src) return (
    <span style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
      🎵 Áudio {duration ? `(${fmtDuration(duration)})` : ''}
    </span>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
      <audio
        ref={audioRef} src={src}
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
      <button
        onClick={togglePlay}
        style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'var(--neon)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div style={{ flex: 1 }}>
        <div
          style={{ height: 3, background: 'var(--bs)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect()
            const pct = (e.clientX - rect.left) / rect.width
            const a = audioRef.current
            if (a && a.duration) a.currentTime = pct * a.duration
          }}
        >
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

// ─── Bolha de mensagem ────────────────────────────────────────────────────────

function MessageBubble({
  msg, instanceName, remoteJid, onReply,
}: {
  msg: EvoMessage; instanceName: string; remoteJid: string
  onReply?: (msg: EvoMessage) => void
}) {
  const [hovered, setHovered] = useState(false)
  const time = new Date(msg.timestamp * 1000)
    .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const StatusIcon = () => {
    if (!msg.fromMe) return null
    if (msg.pending) return <Clock size={11} style={{ color: 'var(--t3)' }} />
    if (msg.status === 'READ') return <CheckCheck size={11} style={{ color: 'var(--neon)' }} />
    if (msg.status === 'DELIVERY_ACK' || msg.status === 'PLAYED') return <CheckCheck size={11} style={{ color: 'var(--t3)' }} />
    return <Check size={11} style={{ color: 'var(--t3)' }} />
  }

  const renderContent = () => {
    if (msg.mediaType === 'image' || msg.mediaType === 'sticker') {
      return (
        <ImageMessage
          keyId={msg.keyId} fromMe={msg.fromMe} remoteJid={remoteJid}
          instanceName={instanceName} caption={msg.content || undefined} mimeType={msg.mimeType}
        />
      )
    }
    if (msg.mediaType === 'audio') {
      return (
        <AudioMessage
          keyId={msg.keyId} fromMe={msg.fromMe} remoteJid={remoteJid}
          instanceName={instanceName} duration={msg.duration} mimeType={msg.mimeType}
        />
      )
    }
    if (msg.mediaType === 'video') {
      return (
        <VideoMessage
          keyId={msg.keyId} fromMe={msg.fromMe} remoteJid={remoteJid}
          instanceName={instanceName} caption={msg.content || undefined}
          mimeType={msg.mimeType} duration={msg.duration}
        />
      )
    }
    if (msg.mediaType === 'document') {
      return (
        <DocumentMessage
          keyId={msg.keyId} fromMe={msg.fromMe} remoteJid={remoteJid}
          instanceName={instanceName} fileName={msg.fileName} mimeType={msg.mimeType}
        />
      )
    }
    if (msg.content) {
      return (
        <p style={{ color: 'var(--t)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontSize: 11 }}>
          {renderLinks(msg.content)}
        </p>
      )
    }
    return <p style={{ color: 'var(--t3)', fontStyle: 'italic', fontSize: 11 }}>{msg.type}</p>
  }

  return (
    <div
      style={{ display: 'flex', justifyContent: msg.fromMe ? 'flex-end' : 'flex-start', marginBottom: 6, position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Botão de responder (aparece no hover) */}
      {hovered && onReply && (
        <button
          onClick={() => onReply(msg)}
          title="Responder"
          style={{
            position: 'absolute', top: 0,
            ...(msg.fromMe ? { left: -28 } : { right: -28 }),
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--el)', border: '1px solid var(--bs)',
            color: 'var(--t3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <Reply size={11} />
        </button>
      )}

      <div style={{
        maxWidth: (msg.mediaType === 'image' || msg.mediaType === 'sticker' || msg.mediaType === 'video') ? 250 : '72%',
        padding: '7px 10px', borderRadius: 9,
        opacity: msg.pending ? .6 : 1,
        ...(msg.fromMe
          ? { background: 'rgba(61,247,16,.1)', border: '1px solid rgba(61,247,16,.18)', borderTopRightRadius: 3 }
          : { background: 'var(--el)', border: '1px solid var(--bs)', borderTopLeftRadius: 3 })
      }}>
        {/* Citação (reply) */}
        {msg.replyQuote && (
          <div style={{
            borderLeft: '3px solid var(--neon)', paddingLeft: 8, marginBottom: 6,
            background: 'rgba(255,255,255,.04)', borderRadius: '0 5px 5px 0', padding: '4px 8px',
          }}>
            <p style={{ fontSize: 9, color: 'var(--neon)', fontWeight: 600, marginBottom: 2 }}>
              <CornerUpLeft size={9} style={{ display: 'inline', marginRight: 3 }} />
              {msg.replyQuote.fromMe ? 'Você' : 'Contato'}
            </p>
            <p style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {msg.replyQuote.content || '📎 Mídia'}
            </p>
          </div>
        )}

        {renderContent()}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 3 }}>
          <span style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>{time}</span>
          <StatusIcon />
        </div>
      </div>
    </div>
  )
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', bottom: '100%', left: 0, zIndex: 100, marginBottom: 6,
        background: 'var(--card)', border: '1px solid var(--bs)',
        borderRadius: 10, padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,.45)',
        display: 'grid', gridTemplateColumns: 'repeat(10, 28px)', gap: 2,
        width: 304,
      }}
    >
      {EMOJIS.map(e => (
        <button
          key={e}
          onClick={() => { onSelect(e); onClose() }}
          style={{
            width: 28, height: 28, fontSize: 16, background: 'none', border: 'none',
            cursor: 'pointer', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .1s',
          }}
          onMouseEnter={e2 => (e2.currentTarget.style.background = 'var(--ng)')}
          onMouseLeave={e2 => (e2.currentTarget.style.background = 'none')}
        >
          {e}
        </button>
      ))}
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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const bulkUpsertedRef = useRef<Record<string, boolean>>({})
  const sendingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cfg = store?.settings as Record<string, string> | undefined
  const defaultInstance = cfg?.whatsapp_instance ?? ''

  // Aplica config da Evolution API ao carregar
  useEffect(() => {
    const url = cfg?.evolution_api_url
    const key = cfg?.evolution_api_key
    if (url && key) configureEvolutionApi(url, key)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id])

  // ── lista de instâncias ───────────────────────────────────────────────────
  const { data: instances, refetch: refetchInstances } = useQuery({
    queryKey: ['whatsapp-instances', store?.id],
    queryFn: () => evolutionApi.getInstancesList(),
    enabled: !!store?.id,
    staleTime: 20000,
    refetchOnWindowFocus: true,
  })

  const [selectedInstance, setSelectedInstance] = useState<string>(defaultInstance)

  useEffect(() => {
    if (defaultInstance) { setSelectedInstance(defaultInstance); setSelectedChat(null) }
  }, [defaultInstance])

  const instanceList = instances?.length
    ? [...new Set([...instances, defaultInstance].filter(Boolean))]
    : defaultInstance ? [defaultInstance] : []

  const instanceName = selectedInstance || defaultInstance

  const handleSelectInstance = (inst: string) => {
    setSelectedInstance(inst)
    setSelectedChat(null)
    setShowInstanceMenu(false)
    queryClient.removeQueries({ queryKey: ['whatsapp-conversations', inst] })
  }

  // ── upsert de lead ao abrir conversa ──────────────────────────────────────

  const upsertLeadMutation = useMutation({
    mutationFn: async (chat: EvoChat) => {
      if (!store?.id || !user?.id) return null
      const last8 = chat.phoneNumber.slice(-8)
      const { data: existing } = await supabase
        .from('leads').select('id, stage_id, pipeline_stages(name)')
        .eq('store_id', store.id).ilike('client_phone', `%${last8}`).maybeSingle()
      if (existing) {
        return {
          leadId: existing.id,
          leadStage: (existing.pipeline_stages as unknown as { name: string } | null)?.name,
          isNew: false,
        }
      }
      const { data: firstStage } = await supabase
        .from('pipeline_stages').select('id, name')
        .eq('store_id', store.id).eq('position', 1).single()
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
      setSelectedChat(prev =>
        prev?.remoteJid === chat.remoteJid ? { ...prev, leadId: result.leadId, leadStage: result.leadStage } : prev
      )
      if (result.isNew) {
        toast.success(`Lead criado: ${chat.pushName}`, `Adicionado em "${result.leadStage}" no Pipeline`)
        queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] })
        queryClient.invalidateQueries({ queryKey: ['leads'] })
      }
    },
  })

  const handleSelectChat = useCallback((chat: EvoChat) => {
    setSelectedChat(chat)
    setShowInstanceMenu(false)
    setReplyTo(null)
    upsertLeadMutation.mutate(chat)
    // Marca como lido se houver mensagens não lidas
    if (chat.unreadCount > 0 && instanceName) {
      evolutionApi.markAsRead(instanceName, chat.remoteJid).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, user?.id, instanceName])

  useEffect(() => {
    if (!showInstanceMenu) return
    const handler = () => setShowInstanceMenu(false)
    document.addEventListener('click', handler, { capture: true, once: true })
    return () => document.removeEventListener('click', handler, { capture: true })
  }, [showInstanceMenu])

  // ── lista de conversas ────────────────────────────────────────────────────

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['whatsapp-conversations', instanceName],
    queryFn: async () => {
      if (!instanceName) return []
      const chats = await evolutionApi.findChats(instanceName)
      if (!Array.isArray(chats)) return []

      const mapped = chats
        .filter((c: Record<string, unknown>) => {
          const jid = c.remoteJid as string
          return jid && !jid.endsWith('@g.us') && !jid.includes('@broadcast') && !jid.includes('status')
        })
        .map((chat: Record<string, unknown>): EvoChat => {
          const lastMsg = chat.lastMessage as Record<string, unknown> | undefined
          const key = lastMsg?.key as Record<string, unknown> | undefined
          const fromMe = key?.fromMe as boolean | undefined
          const remoteJid = chat.remoteJid as string
          const remoteJidAlt = key?.remoteJidAlt as string | undefined
          const pushName = ((chat.pushName as string) || '').trim() ||
            (!fromMe ? ((lastMsg?.pushName as string) || '').trim() : '') ||
            extractPhone(remoteJid, remoteJidAlt)

          return {
            remoteJid,
            phoneNumber: extractPhone(remoteJid, remoteJidAlt),
            pushName,
            profilePicUrl: chat.profilePicUrl as string | undefined,
            lastMessageContent: extractContent(lastMsg ?? {}),
            lastMessageTs: lastMsg?.messageTimestamp as number | undefined,
            lastFromMe: fromMe,
            unreadCount: (chat.unreadCount as number) ?? 0,
          }
        })
        .sort((a, b) => (b.lastMessageTs ?? 0) - (a.lastMessageTs ?? 0))

      // Busca fotos dos primeiros 10 sem foto
      const withoutPic = mapped.filter(c => !c.profilePicUrl).slice(0, 10)
      if (withoutPic.length > 0) {
        const results = await Promise.allSettled(
          withoutPic.map(c => evolutionApi.fetchProfilePicture(instanceName, c.phoneNumber))
        )
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value) withoutPic[i].profilePicUrl = r.value
        })
      }
      return mapped
    },
    enabled: !!instanceName,
    staleTime: 5000,
    refetchInterval: 12000,
  })

  // ── auto-criar leads ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!conversations?.length || !store?.id || !user?.id) return
    if (bulkUpsertedRef.current[instanceName]) return
    bulkUpsertedRef.current[instanceName] = true

    const run = async () => {
      const { data: firstStage } = await supabase
        .from('pipeline_stages').select('id, name').eq('store_id', store.id).eq('position', 1).single()
      if (!firstStage) return
      const { data: existing } = await supabase.from('leads').select('client_phone').eq('store_id', store.id)
      const existingPhones = new Set((existing ?? []).map(l => l.client_phone ?? ''))
      const toInsert = conversations
        .filter(c => c.phoneNumber.length >= 8)
        .filter(c => !Array.from(existingPhones).some(p => p.includes(c.phoneNumber.slice(-8))))
        .map(c => ({
          store_id: store.id, salesperson_id: user.id, stage_id: firstStage.id,
          client_name: c.pushName, client_phone: c.phoneNumber, source: 'whatsapp', status: 'active',
        }))
      if (!toInsert.length) return
      await supabase.from('leads').insert(toInsert)
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    }
    run().catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, store?.id, user?.id])

  // ── mensagens do chat selecionado ─────────────────────────────────────────

  const messagesQueryKey = ['whatsapp-messages', instanceName, selectedChat?.remoteJid]

  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: async () => {
      const res = await evolutionApi.findMessages(instanceName, selectedChat!.remoteJid, 50) as Record<string, unknown> | null
      const msgs = res?.messages as Record<string, unknown> | undefined
      const records: Record<string, unknown>[] = (msgs?.records ?? res?.records ?? []) as Record<string, unknown>[]
      return records
        .map((msg): EvoMessage => {
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
        })
        .sort((a, b) => a.timestamp - b.timestamp)
    },
    enabled: !!selectedChat?.remoteJid && !!instanceName,
    refetchInterval: sendingRef.current ? false : 3000,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Supabase Realtime — mensagens em tempo real ───────────────────────────

  useEffect(() => {
    if (!store?.id || !instanceName) return
    const jid = selectedChat?.remoteJid

    const channel = supabase
      .channel(`wa-rt-store-${store.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `store_id=eq.${store.id}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const rowJid = row.remote_jid as string

          if (jid && (rowJid === jid || rowJid === jid.replace('@s.whatsapp.net', '') + '@s.whatsapp.net')) {
            // Mensagem da conversa aberta: recarrega após pequeno delay
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: messagesQueryKey })
            }, 400)
          }

          // Sempre atualiza a lista de conversas
          queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', instanceName] })

          // Notifica mensagem recebida de outra conversa
          if (!jid || (rowJid !== jid)) {
            const isInbound = row.direction === 'inbound'
            if (isInbound) {
              const senderName = (row.push_name as string) || (rowJid as string)?.replace(/@.+$/, '')
              toast.info(`💬 Nova mensagem`, senderName ? `De: ${senderName}` : 'WhatsApp')
            }
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, instanceName, selectedChat?.remoteJid])

  // ── envio de texto ────────────────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedChat) throw new Error('Nenhum chat selecionado')
      if (!instanceName) throw new Error('WhatsApp não configurado. Vá em Configurações.')
      if (replyTo) {
        await evolutionApi.sendTextWithQuote(instanceName, selectedChat.phoneNumber, text, {
          keyId: replyTo.keyId,
          fromMe: replyTo.fromMe,
          remoteJid: selectedChat.remoteJid,
          content: replyTo.content,
        })
      } else {
        await evolutionApi.sendText(instanceName, selectedChat.phoneNumber, text)
      }
      await supabase.from('whatsapp_messages').insert({
        store_id: store!.id,
        instance_name: instanceName,
        remote_jid: selectedChat.remoteJid,
        direction: 'outbound',
        type: 'text',
        content: text,
        status: 'sent',
        from_me: true,
      })
    },
    onMutate: async (text) => {
      sendingRef.current = true
      await queryClient.cancelQueries({ queryKey: messagesQueryKey })
      const previous = queryClient.getQueryData<EvoMessage[]>(messagesQueryKey)
      const optimistic: EvoMessage = {
        id: `pending-${Date.now()}`,
        keyId: `pending-${Date.now()}`,
        fromMe: true, content: text, type: 'conversation',
        timestamp: Math.floor(Date.now() / 1000), pending: true,
        replyQuote: replyTo ? { keyId: replyTo.keyId, content: replyTo.content, fromMe: replyTo.fromMe, remoteJid: selectedChat?.remoteJid ?? '' } : undefined,
      }
      queryClient.setQueryData<EvoMessage[]>(messagesQueryKey, old => [...(old ?? []), optimistic])
      setMessage('')
      setReplyTo(null)
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
    if (!file || !selectedChat || !instanceName) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onloadend = async () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1]
      if (!base64) return
      if (file.type.startsWith('image/')) {
        const ok = await evolutionApi.sendImageBase64(instanceName, selectedChat.phoneNumber, base64)
        if (ok) {
          setTimeout(() => queryClient.invalidateQueries({ queryKey: messagesQueryKey }), 2000)
          queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', instanceName] })
        } else {
          toast.error('Erro ao enviar imagem', 'Verifique o tamanho do arquivo e tente novamente.')
        }
      } else {
        toast.info('Tipo não suportado', 'Por enquanto apenas imagens podem ser enviadas.')
      }
    }
    reader.readAsDataURL(file)
  }

  // ── gravação de áudio ─────────────────────────────────────────────────────

  const startRecording = async () => {
    if (!selectedChat || !instanceName) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/ogg;codecs=opus'
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
          const ok = await evolutionApi.sendAudio(instanceName, selectedChat.phoneNumber, b64)
          if (ok) {
            setTimeout(() => queryClient.invalidateQueries({ queryKey: messagesQueryKey }), 3000)
            queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', instanceName] })
          } else {
            toast.error('Erro ao enviar áudio', 'Tente novamente.')
          }
        }
        reader.readAsDataURL(blob)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingSecs(0)
      recordingTimerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000)
    } catch {
      toast.error('Microfone não disponível', 'Permita acesso ao microfone nas configurações do browser.')
    }
  }

  const stopRecording = (cancel = false) => {
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
    setIsRecording(false)
    setRecordingSecs(0)
    if (cancel) {
      mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
      mediaRecorderRef.current = null
      audioChunksRef.current = []
    } else {
      mediaRecorderRef.current?.stop()
    }
  }

  useEffect(() => () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    mediaRecorderRef.current?.stream?.getTracks().forEach(t => t.stop())
  }, [])

  const filteredConvs = conversations?.filter(c =>
    c.pushName.toLowerCase().includes(search.toLowerCase()) || c.phoneNumber.includes(search)
  )

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', height: 'calc(100vh - 78px)',
      borderRadius: 9, overflow: 'hidden',
      border: '1px solid var(--bs)', background: 'var(--card)',
    }}>

      {/* ── Lista de conversas ── */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--bs)', display: 'flex', flexDirection: 'column', background: 'var(--surf)' }}>
        <div style={{ padding: '11px 12px', borderBottom: '1px solid var(--bs)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>WhatsApp</div>

          {/* Seletor de instância */}
          {(defaultInstance || instanceList.length > 0) ? (
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setShowInstanceMenu(v => !v)}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 9px', borderRadius: 6, cursor: 'pointer',
                    background: 'var(--ng)', border: '1px solid var(--nb)',
                    color: 'var(--neon)', fontSize: 11, fontWeight: 600, fontFamily: 'var(--fn)',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📱 {instanceName || 'Selecionar número'}
                  </span>
                  <ChevronDown size={12} style={{ flexShrink: 0, marginLeft: 4, transform: showInstanceMenu ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                </button>
                <button
                  onClick={() => refetchInstances()}
                  title="Atualizar lista de instâncias"
                  style={{
                    width: 28, height: 28, borderRadius: 6, border: '1px solid var(--nb)',
                    background: 'var(--ng)', color: 'var(--neon)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>
              </div>

              {showInstanceMenu && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 3,
                  background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,.4)', overflow: 'hidden',
                }}>
                  {instanceList.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--t3)' }}>Nenhuma instância encontrada</div>
                  ) : instanceList.map(inst => (
                    <button
                      key={inst}
                      onClick={() => handleSelectInstance(inst)}
                      style={{
                        width: '100%', padding: '8px 11px', textAlign: 'left',
                        background: inst === instanceName ? 'var(--ng)' : 'transparent',
                        border: 'none', borderBottom: '1px solid var(--bs)',
                        color: inst === instanceName ? 'var(--neon)' : 'var(--t2)',
                        fontSize: 11, fontWeight: inst === instanceName ? 600 : 400,
                        cursor: 'pointer', fontFamily: 'var(--fn)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                      onMouseEnter={e => { if (inst !== instanceName) e.currentTarget.style.background = 'var(--el)' }}
                      onMouseLeave={e => { if (inst !== instanceName) e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: inst === instanceName ? 'var(--neon)' : 'var(--t3)' }} />
                      {inst}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 10, color: 'var(--yel)', marginBottom: 7 }}>⚠ Configure a instância em Configurações</p>
          )}

          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
            <input
              type="text" placeholder="Buscar conversa..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', height: 30, paddingLeft: 26, paddingRight: 9,
                background: 'var(--card)', border: '1px solid var(--b)',
                borderRadius: 6, color: 'var(--t)', fontSize: 11, outline: 'none', fontFamily: 'var(--fn)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
            />
          </div>
        </div>

        {/* Conv list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Skeleton style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Skeleton style={{ height: 10, borderRadius: 4 }} />
                    <Skeleton style={{ height: 8, width: '60%', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          ) : !filteredConvs?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--t3)', padding: 20, textAlign: 'center' }}>
              <MessageCircleOff size={28} />
              <p style={{ fontSize: 11 }}>{instanceName ? 'Nenhuma conversa encontrada' : 'Configure a instância primeiro'}</p>
              {!instanceName && (
                <p style={{ fontSize: 10, color: 'var(--yel)' }}>
                  Vá em Configurações → WhatsApp e insira a URL da API, a API Key e o nome da instância.
                </p>
              )}
            </div>
          ) : (
            filteredConvs.map(chat => {
              const isActive = selectedChat?.remoteJid === chat.remoteJid
              return (
                <button
                  key={chat.remoteJid}
                  onClick={() => handleSelectChat(chat)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', textAlign: 'left',
                    background: isActive ? 'var(--ng)' : 'transparent',
                    cursor: 'pointer', border: 'none', borderBottom: '1px solid var(--bs)',
                    borderLeft: isActive ? '2px solid var(--neon)' : '2px solid transparent',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--ng)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                >
                  <Avatar src={chat.profilePicUrl} name={chat.pushName} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.pushName}</span>
                      {chat.lastMessageTs && (
                        <span style={{ fontSize: 9, color: 'var(--t3)', flexShrink: 0, fontFamily: 'var(--fm)' }}>
                          {timeAgo(new Date(chat.lastMessageTs * 1000).toISOString())}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginTop: 2 }}>
                      <p style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {chat.lastFromMe && <span style={{ color: 'var(--neon)', opacity: .6 }}>Você: </span>}
                        {chat.lastMessageContent || chat.phoneNumber}
                      </p>
                      {chat.unreadCount > 0 && (
                        <span style={{
                          background: 'var(--neon)', color: '#000', fontSize: 9, fontWeight: 700,
                          width: 18, height: 18, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Header */}
          <div style={{
            height: 52, padding: '0 14px', borderBottom: '1px solid var(--bs)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surf)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar src={selectedChat.profilePicUrl} name={selectedChat.pushName} size={30} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>{selectedChat.pushName}</span>
                  {selectedChat.leadId && (
                    <button
                      onClick={() => navigate('/pipeline')}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--neon)', opacity: .7, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      <ExternalLink size={9} /> {selectedChat.leadStage}
                    </button>
                  )}
                  {upsertLeadMutation.isPending && (
                    <span style={{ fontSize: 9, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <UserPlus size={9} /> criando lead...
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>
                  +{selectedChat.phoneNumber}
                  {instanceList.length > 1 && <span style={{ marginLeft: 6, opacity: .6 }}>· via {instanceName}</span>}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => {
                  if (selectedChat.leadId) openLeadPanel(selectedChat.leadId)
                  else openLeadPanelCreate({ client_name: selectedChat.pushName, client_phone: selectedChat.phoneNumber, source: 'whatsapp' })
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  border: '1px solid var(--b)', background: 'transparent', color: 'var(--t2)',
                  cursor: 'pointer', transition: 'all .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)'; e.currentTarget.style.color = 'var(--neon)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b)'; e.currentTarget.style.color = 'var(--t2)' }}
              >
                <User size={10} /> Ver Lead
              </button>
              <Button variant="ghost" size="icon-sm"><Phone size={14} /></Button>
              <Button variant="ghost" size="icon-sm"><MoreVertical size={14} /></Button>
            </div>
          </div>

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loadingMsgs && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                <div style={{ width: 22, height: 22, border: '2px solid var(--neon)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
              </div>
            )}
            {!loadingMsgs && !messages?.length && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--t3)', fontSize: 11 }}>
                Nenhuma mensagem ainda. Inicie a conversa!
              </div>
            )}
            {messages?.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                instanceName={instanceName}
                remoteJid={selectedChat.remoteJid}
                onReply={setReplyTo}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input de envio */}
          <div style={{ padding: '8px 12px', background: 'var(--surf)', borderTop: '1px solid var(--bs)', flexShrink: 0 }}>

            {/* Preview de resposta */}
            {replyTo && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                padding: '5px 10px', borderRadius: 6,
                background: 'rgba(61,247,16,.06)', border: '1px solid rgba(61,247,16,.15)',
                borderLeft: '3px solid var(--neon)',
              }}>
                <CornerUpLeft size={12} style={{ color: 'var(--neon)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 9, color: 'var(--neon)', fontWeight: 600 }}>
                    {replyTo.fromMe ? 'Você' : selectedChat.pushName}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {replyTo.content || '📎 Mídia'}
                  </p>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Barra de gravação */}
            {isRecording && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
                padding: '6px 10px', borderRadius: 7,
                background: 'rgba(255,60,60,.08)', border: '1px solid rgba(255,60,60,.2)',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff3c3c', animation: 'pulse 1s ease-in-out infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'var(--t2)', flex: 1 }}>Gravando… {fmtDuration(recordingSecs)}</span>
                <button onClick={() => stopRecording(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center' }} title="Cancelar">
                  <X size={14} />
                </button>
                <button onClick={() => stopRecording(false)} style={{ padding: '3px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', background: 'var(--neon)', color: '#000', fontSize: 10, fontWeight: 700 }}>
                  Enviar
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 7, position: 'relative' }}>
              {/* Emoji picker */}
              {showEmoji && (
                <EmojiPicker
                  onSelect={e => {
                    setMessage(prev => prev + e)
                    inputRef.current?.focus()
                  }}
                  onClose={() => setShowEmoji(false)}
                />
              )}

              {/* Botão emoji */}
              <button
                onClick={() => setShowEmoji(v => !v)}
                title="Emojis"
                style={{ color: showEmoji ? 'var(--neon)' : 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--t2)')}
                onMouseLeave={e => (e.currentTarget.style.color = showEmoji ? 'var(--neon)' : 'var(--t3)')}
              >
                <Smile size={16} />
              </button>

              {/* Anexo de imagem */}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Enviar imagem"
                style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--t2)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
              >
                <Paperclip size={16} />
              </button>

              <input
                ref={inputRef}
                type="text"
                placeholder={isRecording ? 'Gravando áudio…' : 'Digite uma mensagem...'}
                value={message}
                disabled={isRecording}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                style={{
                  flex: 1, height: 34, padding: '0 10px',
                  background: 'var(--el)', border: '1px solid var(--b)',
                  borderRadius: 7, color: 'var(--t)', fontSize: 11, outline: 'none', fontFamily: 'var(--fn)',
                  opacity: isRecording ? .5 : 1,
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
              />

              {/* Botão enviar ou microfone */}
              {message.trim() ? (
                <button
                  onClick={handleSend}
                  disabled={sendMutation.isPending}
                  style={{
                    width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                    background: 'var(--neon)', color: '#000', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', opacity: sendMutation.isPending ? .5 : 1,
                  }}
                >
                  {sendMutation.isPending
                    ? <div style={{ width: 14, height: 14, border: '2px solid #000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                    : <Send size={14} />
                  }
                </button>
              ) : (
                <button
                  onClick={isRecording ? () => stopRecording(false) : startRecording}
                  title={isRecording ? 'Enviar áudio' : 'Gravar áudio'}
                  style={{
                    width: 32, height: 32, borderRadius: 6, flexShrink: 0, border: 'none',
                    background: isRecording ? 'var(--neon)' : 'var(--el)',
                    color: isRecording ? '#000' : 'var(--t2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                >
                  {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
          <div style={{ textAlign: 'center', color: 'var(--t3)' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12,
              background: 'var(--el)', border: '1px solid var(--b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}>
              <Phone size={24} style={{ color: 'var(--t3)' }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--t2)' }}>Selecione uma conversa</p>
            <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>Leads são criados automaticamente</p>
          </div>
        </div>
      )}
    </div>
  )
}
