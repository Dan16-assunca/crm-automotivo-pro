/**
 * ChatWindow — painel de chat WhatsApp embutido (ex: aba no detalhe do lead)
 *
 * Diferente da tela /whatsapp (caixa de entrada completa), este componente é compacto
 * e pode ser montado dentro de um drawer, modal ou painel lateral.
 *
 * Usa:
 * - supabase Realtime para mensagens em tempo real
 * - evolutionApi para envio de texto, mídia e busca de foto do contato
 * - Supabase Storage para upload de arquivos (bucket "media")
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send, Paperclip, Play, Pause, Download, X, ImageIcon,
  FileText, Mic, MicOff, Phone,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { evolutionApi, formatPhone } from '@/services/whatsapp'
import { toast } from '@/components/ui/Toast'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DbMessage {
  id: string
  message_id: string | null
  remote_jid: string
  from_me: boolean
  direction: 'inbound' | 'outbound'
  type: string
  content: string | null
  media_url: string | null
  media_mime_type: string | null
  status: string
  push_name: string | null
  message_ts: number
}

interface ChatWindowProps {
  leadId: string
  leadName: string
  leadPhone: string
  instanceName: string
  storeId: string
  /** Altura do container (default: 100%) */
  height?: string | number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function dateSeparatorLabel(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  if (isSameDay(d, now)) return 'Hoje'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(d, yesterday)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── Avatar inline ────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (src && !err) {
    return (
      <img src={src} alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={() => setErr(true)}
      />
    )
  }
  const colors = ['#075e54', '#128c7e', '#25d366', '#0a84ff', '#bf5af2', '#ff9f0a', '#ff3b30', '#32ade6']
  const bg = colors[(name.charCodeAt(0) || 0) % colors.length]
  const initials = name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
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

// ─── Status tick ──────────────────────────────────────────────────────────────

function StatusTick({ status }: { status: string }) {
  if (status === 'pending')   return <span style={{ color: '#8696a0', fontSize: 11 }}>🕐</span>
  if (status === 'sent')      return <span style={{ color: '#8696a0', fontSize: 11 }}>✓</span>
  if (status === 'delivered') return <span style={{ color: '#8696a0', fontSize: 11 }}>✓✓</span>
  if (status === 'read')      return <span style={{ color: '#53bdeb', fontSize: 11 }}>✓✓</span>
  if (status === 'error')     return <span style={{ color: '#ff453a', fontSize: 11 }}>!</span>
  return null
}

// ─── Bolha de imagem ──────────────────────────────────────────────────────────

function ImageBubble({ url, caption }: { url: string; caption?: string | null }) {
  const [lightbox, setLightbox] = useState(false)
  return (
    <>
      <img
        src={url} alt="imagem"
        onClick={() => setLightbox(true)}
        style={{ maxWidth: 220, maxHeight: 200, borderRadius: 6, cursor: 'zoom-in', display: 'block' }}
      />
      {caption && <p style={{ fontSize: 11, color: '#d1d7db', marginTop: 4 }}>{caption}</p>}
      {lightbox && (
        <div onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setLightbox(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: 6, display: 'flex' }}>
            <X size={18} />
          </button>
          <a href={url} download="imagem.jpg" onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 16, right: 58, background: 'rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', borderRadius: 6, padding: 6, display: 'flex' }}>
            <Download size={18} />
          </a>
          <img src={url} alt="imagem" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>
      )}
    </>
  )
}

// ─── Bolha de áudio ───────────────────────────────────────────────────────────

function AudioBubble({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const toggle = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
      <button onClick={toggle}
        style={{ width: 34, height: 34, borderRadius: '50%', background: '#00a884', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {playing ? <Pause size={14} color="#fff" /> : <Play size={14} color="#fff" style={{ marginLeft: 2 }} />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ height: 3, background: '#3d4a50', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: '#00a884', transition: 'width .1s' }} />
        </div>
        <p style={{ fontSize: 10, color: '#8696a0', marginTop: 3 }}>Áudio</p>
      </div>
      <audio
        ref={audioRef}
        src={url}
        onEnded={() => { setPlaying(false); setProgress(0) }}
        onTimeUpdate={() => {
          if (audioRef.current && audioRef.current.duration) {
            setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100)
          }
        }}
      />
    </div>
  )
}

// ─── Bolha de mensagem ────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: DbMessage }) {
  const isMe = msg.from_me || msg.direction === 'outbound'
  const sentBg     = '#005c4b'
  const receiveBg  = '#1f2c34'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
      <div style={{
        maxWidth: '75%', padding: '7px 10px', borderRadius: isMe ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
        background: isMe ? sentBg : receiveBg, boxShadow: '0 1px 2px rgba(0,0,0,.25)',
        marginLeft: isMe ? 48 : 0, marginRight: isMe ? 0 : 48,
      }}>
        {/* Imagem */}
        {msg.type === 'image' && msg.media_url && (
          <ImageBubble url={msg.media_url} caption={msg.content} />
        )}
        {/* Vídeo */}
        {msg.type === 'video' && msg.media_url && (
          <video src={msg.media_url} controls style={{ maxWidth: 220, maxHeight: 180, borderRadius: 6, display: 'block' }} />
        )}
        {/* Áudio */}
        {(msg.type === 'audio' || msg.type === 'ptt') && msg.media_url && (
          <AudioBubble url={msg.media_url} />
        )}
        {/* Documento */}
        {msg.type === 'document' && msg.media_url && (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#00a884', textDecoration: 'none' }}>
            <div style={{ width: 34, height: 34, background: '#2a3942', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <FileText size={16} color="#8696a0" />
            </div>
            <span style={{ fontSize: 12, color: '#00a884' }}>{msg.content || 'Documento'}</span>
          </a>
        )}
        {/* Sticker */}
        {msg.type === 'sticker' && msg.media_url && (
          <img src={msg.media_url} alt="sticker" style={{ width: 100, height: 100 }} />
        )}
        {/* Texto ou caption */}
        {(msg.type === 'text' || (!msg.media_url && msg.content)) && msg.content && (
          <p style={{ fontSize: 13, color: '#e9edef', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
            {msg.content}
          </p>
        )}
        {/* Mensagem sem conteúdo visível */}
        {!msg.content && !msg.media_url && (
          <p style={{ fontSize: 12, color: '#8696a0', margin: 0, fontStyle: 'italic' }}>
            {msg.type !== 'text' ? `[${msg.type}]` : '…'}
          </p>
        )}

        {/* Hora + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, color: '#8696a0' }}>{fmtTime(msg.message_ts)}</span>
          {isMe && <StatusTick status={msg.status} />}
        </div>
      </div>
    </div>
  )
}

// ─── ChatWindow principal ─────────────────────────────────────────────────────

export function ChatWindow({ leadId, leadName, leadPhone, instanceName, storeId, height = '100%' }: ChatWindowProps) {
  const [messages, setMessages]     = useState<DbMessage[]>([])
  const [inputText, setInputText]   = useState('')
  const [sending, setSending]       = useState(false)
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null)
  const [uploading, setUploading]   = useState(false)
  const [recording, setRecording]   = useState(false)
  const bottomRef                    = useRef<HTMLDivElement>(null)
  const fileInputRef                 = useRef<HTMLInputElement>(null)
  const mediaRecorderRef             = useRef<MediaRecorder | null>(null)
  const chunksRef                    = useRef<Blob[]>([])

  const remoteJid = `${formatPhone(leadPhone)}@s.whatsapp.net`

  // Carrega mensagens iniciais + foto do contato
  useEffect(() => {
    loadMessages()
    loadAvatar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadPhone, instanceName])

  // Realtime: novas mensagens
  useEffect(() => {
    const channel = supabase
      .channel(`chatwindow:${remoteJid}:${storeId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const msg = payload.new as DbMessage
        if (msg.remote_jid !== remoteJid) return
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `store_id=eq.${storeId}`,
      }, (payload) => {
        const msg = payload.new as DbMessage
        if (msg.remote_jid !== remoteJid) return
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: msg.status } : m))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteJid, storeId])

  // Scroll automático
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('id, message_id, remote_jid, from_me, direction, type, content, media_url, media_mime_type, status, push_name, message_ts')
      .eq('store_id', storeId)
      .eq('remote_jid', remoteJid)
      .order('message_ts', { ascending: true })
      .limit(60)
    if (data) setMessages(data as DbMessage[])
  }

  async function loadAvatar() {
    if (!instanceName) return
    const url = await evolutionApi.fetchProfilePicture(instanceName, formatPhone(leadPhone))
    if (url) setAvatarUrl(url)
  }

  const handleSendText = useCallback(async () => {
    if (!inputText.trim() || sending || !instanceName) return
    const text = inputText.trim()
    setInputText('')
    setSending(true)

    // Otimista: adiciona na UI imediatamente
    const tempId = `temp_${Date.now()}`
    const tempMsg: DbMessage = {
      id: tempId, message_id: tempId, remote_jid: remoteJid,
      from_me: true, direction: 'outbound', type: 'text',
      content: text, media_url: null, media_mime_type: null,
      status: 'pending', push_name: null,
      message_ts: Math.floor(Date.now() / 1000),
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      await evolutionApi.sendText(instanceName, formatPhone(leadPhone), text)
    } catch {
      toast.error('Erro ao enviar mensagem', 'Verifique a conexão WhatsApp')
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'error' } : m))
    } finally {
      setSending(false)
    }
  }, [inputText, sending, instanceName, leadPhone, remoteJid])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText() }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !instanceName) return
    setUploading(true)

    try {
      // Upload para Supabase Storage (bucket "media")
      const ext  = file.name.split('.').pop() ?? 'bin'
      const path = `whatsapp/${storeId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('media').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)

      const type = file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'audio'
        : 'document'

      const ok = await evolutionApi.sendMediaUrl(instanceName, formatPhone(leadPhone), publicUrl, type as 'image' | 'video' | 'audio' | 'document', '')
      if (!ok) throw new Error('Falha ao enviar mídia')
    } catch (err) {
      toast.error('Erro no envio', err instanceof Error ? err.message : 'Tente novamente')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/ogg; codecs=opus' })
        const reader = new FileReader()
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1]
          if (instanceName) {
            const ok = await evolutionApi.sendAudio(instanceName, formatPhone(leadPhone), base64)
            if (!ok) toast.error('Erro ao enviar áudio', 'Tente novamente')
          }
        }
        reader.readAsDataURL(blob)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
    } catch {
      toast.error('Microfone bloqueado', 'Permita o acesso ao microfone no navegador')
    }
  }

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
    setRecording(false)
  }

  // Agrupa mensagens com separadores de data
  const itemsWithSeparators = (() => {
    const items: ({ type: 'sep'; label: string } | { type: 'msg'; msg: DbMessage })[] = []
    let lastLabel = ''
    for (const msg of messages) {
      const label = dateSeparatorLabel(msg.message_ts)
      if (label !== lastLabel) { items.push({ type: 'sep', label }); lastLabel = label }
      items.push({ type: 'msg', msg })
    }
    return items
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, background: '#0b141a', overflow: 'hidden' }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        background: '#202c33', borderBottom: '1px solid #2a3942', flexShrink: 0,
      }}>
        <Avatar src={avatarUrl} name={leadName} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#e9edef', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {leadName}
          </p>
          <p style={{ fontSize: 11, color: '#8696a0', margin: 0 }}>{leadPhone}</p>
        </div>
        <button style={{ color: '#8696a0', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 6, borderRadius: 6 }}
          title="Ligar (em breve)">
          <Phone size={16} />
        </button>
      </div>

      {/* ── Mensagens ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column' }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 12, color: '#8696a0', textAlign: 'center' }}>Nenhuma mensagem ainda.<br />Inicie a conversa abaixo.</p>
          </div>
        )}

        {itemsWithSeparators.map((item, i) =>
          item.type === 'sep' ? (
            <div key={`sep-${i}`} style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
              <span style={{ fontSize: 11, color: '#8696a0', background: '#182229', padding: '3px 12px', borderRadius: 10 }}>
                {item.label}
              </span>
            </div>
          ) : (
            <MessageBubble key={item.msg.id} msg={item.msg} />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div style={{ padding: '8px 10px', background: '#202c33', display: 'flex', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
          style={{ display: 'none' }}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Anexar arquivo"
          style={{ color: uploading ? '#4a5568' : '#8696a0', background: 'none', border: 'none', cursor: uploading ? 'default' : 'pointer', padding: 6, display: 'flex', flexShrink: 0, borderRadius: 6 }}>
          {uploading ? (
            <div style={{ width: 18, height: 18, border: '2px solid #8696a0', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
          ) : (
            <Paperclip size={18} />
          )}
        </button>

        <div style={{ flex: 1, background: '#2a3942', borderRadius: 20, padding: '6px 14px', display: 'flex', alignItems: 'center' }}>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={instanceName ? 'Digite uma mensagem' : 'WhatsApp não conectado…'}
            disabled={!instanceName}
            rows={1}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: '#e9edef', fontSize: 13, resize: 'none', maxHeight: 100,
              fontFamily: 'inherit', lineHeight: 1.5,
            }}
          />
        </div>

        {inputText.trim() ? (
          <button
            onClick={handleSendText}
            disabled={sending || !instanceName}
            style={{
              width: 38, height: 38, borderRadius: '50%', background: sending || !instanceName ? '#3d4a50' : '#00a884',
              border: 'none', cursor: sending || !instanceName ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .15s',
            }}>
            <Send size={16} color="#fff" />
          </button>
        ) : (
          <button
            onMouseDown={handleStartRecording}
            onMouseUp={handleStopRecording}
            onTouchStart={handleStartRecording}
            onTouchEnd={handleStopRecording}
            title="Segure para gravar áudio"
            style={{
              width: 38, height: 38, borderRadius: '50%',
              background: recording ? '#ff453a' : '#00a884',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background .15s',
            }}>
            {recording ? <MicOff size={16} color="#fff" /> : <Mic size={16} color="#fff" />}
          </button>
        )}
      </div>
    </div>
  )
}
