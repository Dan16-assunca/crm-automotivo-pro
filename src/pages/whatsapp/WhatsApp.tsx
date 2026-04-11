import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Send, Search, Phone, MoreVertical, Paperclip, Smile, Check, CheckCheck, Clock, MessageCircleOff, UserPlus, ExternalLink, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { evolutionApi } from '@/services/whatsapp'
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
  leadId?: string        // preenchido após upsert
  leadStage?: string     // nome da etapa no pipeline
}

interface EvoMessage {
  id: string
  fromMe: boolean
  content: string
  type: string
  timestamp: number
  status?: string
  pending?: boolean
}

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
    (msg.messageType as string) || ''
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

// ─── Bolha de mensagem ────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: EvoMessage }) {
  const time = new Date(msg.timestamp * 1000)
    .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const StatusIcon = () => {
    if (!msg.fromMe) return null
    if (msg.pending) return <Clock size={11} style={{ color: 'var(--t3)' }} />
    if (msg.status === 'READ') return <CheckCheck size={11} style={{ color: 'var(--neon)' }} />
    if (msg.status === 'DELIVERY_ACK' || msg.status === 'PLAYED') return <CheckCheck size={11} style={{ color: 'var(--t3)' }} />
    return <Check size={11} style={{ color: 'var(--t3)' }} />
  }

  return (
    <div style={{ display: 'flex', justifyContent: msg.fromMe ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
      <div style={{
        maxWidth: '70%', padding: '7px 10px', borderRadius: 9,
        fontSize: 11, lineHeight: 1.5,
        opacity: msg.pending ? .6 : 1,
        ...(msg.fromMe
          ? { background: 'rgba(61,247,16,.1)', border: '1px solid rgba(61,247,16,.18)', borderTopRightRadius: 3 }
          : { background: 'var(--el)', border: '1px solid var(--bs)', borderTopLeftRadius: 3 })
      }}>
        {msg.content
          ? <p style={{ color: 'var(--t)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.content}</p>
          : <p style={{ color: 'var(--t3)', fontStyle: 'italic' }}>{msg.type}</p>
        }
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 3 }}>
          <span style={{ fontSize: 8, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>{time}</span>
          <StatusIcon />
        </div>
      </div>
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const bulkUpsertedRef = useRef(false) // evita rodar múltiplas vezes
  const sendingRef = useRef(false) // pausa refetchInterval durante envio

  const instanceName = (store?.settings as Record<string, string>)?.whatsapp_instance ?? ''

  // ── upsert de lead ao abrir conversa ──────────────────────────────────────

  const upsertLeadMutation = useMutation({
    mutationFn: async (chat: EvoChat) => {
      if (!store?.id || !user?.id) return null

      // Busca lead com os últimos 8 dígitos do número (tolerante a DDI)
      const last8 = chat.phoneNumber.slice(-8)
      const { data: existing } = await supabase
        .from('leads')
        .select('id, stage_id, pipeline_stages(name)')
        .eq('store_id', store.id)
        .ilike('client_phone', `%${last8}`)
        .maybeSingle()

      if (existing) {
        return {
          leadId: existing.id,
          leadStage: (existing.pipeline_stages as unknown as { name: string } | null)?.name,
          isNew: false,
        }
      }

      // Busca primeira etapa do pipeline
      const { data: firstStage } = await supabase
        .from('pipeline_stages')
        .select('id, name')
        .eq('store_id', store.id)
        .eq('position', 1)
        .single()

      if (!firstStage) return null

      const { data: newLead, error } = await supabase
        .from('leads')
        .insert({
          store_id: store.id,
          salesperson_id: user.id,
          stage_id: firstStage.id,
          client_name: chat.pushName,
          client_phone: chat.phoneNumber,
          source: 'whatsapp',
          status: 'new',
        })
        .select('id')
        .single()

      if (error) throw error

      return { leadId: newLead.id, leadStage: firstStage.name, isNew: true }
    },
    onSuccess: (result, chat) => {
      if (!result) return
      // Atualiza o chat selecionado com o leadId
      setSelectedChat(prev =>
        prev?.remoteJid === chat.remoteJid
          ? { ...prev, leadId: result.leadId, leadStage: result.leadStage }
          : prev
      )
      if (result.isNew) {
        toast.success(
          `Lead criado: ${chat.pushName}`,
          `Adicionado em "${result.leadStage}" no Pipeline`
        )
        queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] })
        queryClient.invalidateQueries({ queryKey: ['leads'] })
      }
    },
  })

  const handleSelectChat = useCallback((chat: EvoChat) => {
    setSelectedChat(chat)
    upsertLeadMutation.mutate(chat)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id, user?.id])

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
          const remoteJid = chat.remoteJid as string
          const remoteJidAlt = key?.remoteJidAlt as string | undefined
          const pushName = ((chat.pushName as string) || '').trim() ||
            ((lastMsg?.pushName as string) || '').trim() ||
            extractPhone(remoteJid, remoteJidAlt)

          return {
            remoteJid,
            phoneNumber: extractPhone(remoteJid, remoteJidAlt),
            pushName,
            profilePicUrl: chat.profilePicUrl as string | undefined,
            lastMessageContent: extractContent(lastMsg ?? {}),
            lastMessageTs: lastMsg?.messageTimestamp as number | undefined,
            lastFromMe: key?.fromMe as boolean | undefined,
            unreadCount: (chat.unreadCount as number) ?? 0,
          }
        })
        .sort((a, b) => (b.lastMessageTs ?? 0) - (a.lastMessageTs ?? 0))

      // Batch-fetch profile pics for contacts without one (max 20 at a time)
      const withoutPic = mapped.filter(c => !c.profilePicUrl).slice(0, 20)
      if (withoutPic.length > 0) {
        const results = await Promise.allSettled(
          withoutPic.map(c => evolutionApi.fetchProfilePicture(instanceName, c.phoneNumber))
        )
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value) {
            withoutPic[i].profilePicUrl = r.value
          }
        })
      }

      return mapped
    },
    enabled: !!instanceName,
    refetchInterval: 8000,
  })

  // ── auto-criar leads para todos os contatos ao carregar ──────────────────

  useEffect(() => {
    if (!conversations?.length || !store?.id || !user?.id) return
    if (bulkUpsertedRef.current) return
    bulkUpsertedRef.current = true

    const run = async () => {
      // Busca o primeiro estágio do pipeline uma vez
      const { data: firstStage } = await supabase
        .from('pipeline_stages')
        .select('id, name')
        .eq('store_id', store.id)
        .eq('position', 1)
        .single()

      if (!firstStage) return

      // Busca todos os leads existentes com source=whatsapp para evitar duplicatas
      const { data: existing } = await supabase
        .from('leads')
        .select('client_phone')
        .eq('store_id', store.id)

      const existingPhones = new Set((existing ?? []).map(l => l.client_phone ?? ''))

      // Filtra contatos que ainda não são leads
      const toInsert = conversations
        .filter(c => c.phoneNumber.length >= 8)
        .filter(c => {
          const last8 = c.phoneNumber.slice(-8)
          return !Array.from(existingPhones).some(p => p.includes(last8))
        })
        .map(c => ({
          store_id: store.id,
          salesperson_id: user.id,
          stage_id: firstStage.id,
          client_name: c.pushName,
          client_phone: c.phoneNumber,
          source: 'whatsapp',
          status: 'active',
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

  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: ['whatsapp-messages', instanceName, selectedChat?.remoteJid],
    queryFn: async () => {
      const res = await evolutionApi.findMessages(instanceName, selectedChat!.remoteJid, 50) as Record<string, unknown> | null
      const msgs = res?.messages as Record<string, unknown> | undefined
      const records: Record<string, unknown>[] = (msgs?.records ?? res?.records ?? []) as Record<string, unknown>[]
      return records
        .map((msg): EvoMessage => {
          const key = msg.key as Record<string, unknown>
          const updates = (msg.MessageUpdate as Record<string, unknown>[] | undefined) ?? []
          const lastUpdate = updates[updates.length - 1]
          return {
            id: msg.id as string,
            fromMe: (key?.fromMe as boolean) ?? false,
            content: extractContent(msg),
            type: (msg.messageType as string) ?? 'unknown',
            timestamp: (msg.messageTimestamp as number) ?? 0,
            status: (lastUpdate?.status as string) ?? (msg.status as string),
          }
        })
        .sort((a, b) => a.timestamp - b.timestamp)
    },
    enabled: !!selectedChat?.remoteJid && !!instanceName,
    refetchInterval: sendingRef.current ? false : 5000,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── envio com atualização otimista ────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedChat) throw new Error('Nenhum chat selecionado')
      if (!instanceName) throw new Error('WhatsApp não configurado. Vá em Configurações.')
      await evolutionApi.sendText(instanceName, selectedChat.phoneNumber, text)
      // Salva no Supabase para histórico / integração
      await supabase.from('whatsapp_messages').insert({
        store_id: store!.id,
        instance_name: instanceName,
        remote_jid: selectedChat.remoteJid,
        direction: 'outbound',
        type: 'text',
        content: text,
        status: 'sent',
      })
    },
    onMutate: async (text) => {
      sendingRef.current = true
      const qKey = ['whatsapp-messages', instanceName, selectedChat?.remoteJid]
      await queryClient.cancelQueries({ queryKey: qKey })
      const previous = queryClient.getQueryData<EvoMessage[]>(qKey)
      const optimistic: EvoMessage = {
        id: `pending-${Date.now()}`,
        fromMe: true,
        content: text,
        type: 'conversation',
        timestamp: Math.floor(Date.now() / 1000),
        pending: true,
      }
      queryClient.setQueryData<EvoMessage[]>(qKey, old => [...(old ?? []), optimistic])
      setMessage('')
      return { previous }
    },
    onSuccess: () => {
      const qKey = ['whatsapp-messages', instanceName, selectedChat?.remoteJid]
      // Aguarda 3s para a Evolution API indexar a mensagem antes de refazer fetch
      setTimeout(async () => {
        const before = queryClient.getQueryData<EvoMessage[]>(qKey) ?? []
        const pending = before.filter(m => m.pending)
        await queryClient.refetchQueries({ queryKey: qKey })
        // Se o refetch não trouxe as mensagens pendentes de volta, reinsere-as
        if (pending.length > 0) {
          const after = queryClient.getQueryData<EvoMessage[]>(qKey) ?? []
          const stillMissing = pending.filter(p => !after.some(m => m.id === p.id))
          if (stillMissing.length > 0) {
            queryClient.setQueryData<EvoMessage[]>(qKey, [...after, ...stillMissing])
          }
        }
        sendingRef.current = false
      }, 3000)
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', instanceName] })
    },
    onError: (err: Error, _text, context) => {
      sendingRef.current = false
      const qKey = ['whatsapp-messages', instanceName, selectedChat?.remoteJid]
      if (context?.previous) queryClient.setQueryData(qKey, context.previous)
      setMessage(_text) // restaura o texto no input
      toast.error('Erro ao enviar', err.message)
    },
  })

  const handleSend = () => {
    if (!message.trim() || sendMutation.isPending) return
    sendMutation.mutate(message.trim())
  }

  const filteredConvs = conversations?.filter(c =>
    c.pushName.toLowerCase().includes(search.toLowerCase()) ||
    c.phoneNumber.includes(search)
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
        {/* Search header */}
        <div style={{ padding: '11px 12px', borderBottom: '1px solid var(--bs)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 9 }}>WhatsApp</div>
          {!instanceName && (
            <p style={{ fontSize: 10, color: 'var(--yel)', marginBottom: 7 }}>⚠ Configure a instância em Configurações</p>
          )}
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
            <input type="text" placeholder="Buscar conversa..." value={search}
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
            </div>
          ) : (
            filteredConvs.map(chat => {
              const isActive = selectedChat?.remoteJid === chat.remoteJid
              return (
                <button key={chat.remoteJid} onClick={() => handleSelectChat(chat)}
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
                <p style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>+{selectedChat.phoneNumber}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Ver Lead button */}
              <button
                onClick={() => {
                  if (selectedChat.leadId) {
                    openLeadPanel(selectedChat.leadId)
                  } else {
                    openLeadPanelCreate({
                      client_name: selectedChat.pushName,
                      client_phone: selectedChat.phoneNumber,
                      source: 'whatsapp',
                    })
                  }
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
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            {messages?.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>

          {/* Input de envio */}
          <div style={{ padding: '8px 12px', background: 'var(--surf)', borderTop: '1px solid var(--bs)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <button style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--t2)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
              ><Paperclip size={16} /></button>
              <button style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--t2)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
              ><Smile size={16} /></button>
              <input type="text" placeholder="Digite uma mensagem..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                style={{
                  flex: 1, height: 34, padding: '0 10px',
                  background: 'var(--el)', border: '1px solid var(--b)',
                  borderRadius: 7, color: 'var(--t)', fontSize: 11, outline: 'none', fontFamily: 'var(--fn)',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || sendMutation.isPending}
                style={{
                  width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                  background: 'var(--neon)', color: '#000', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: message.trim() ? 'pointer' : 'not-allowed', opacity: message.trim() ? 1 : .4,
                }}
              >
                {sendMutation.isPending
                  ? <div style={{ width: 14, height: 14, border: '2px solid #000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                  : <Send size={14} />
                }
              </button>
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
