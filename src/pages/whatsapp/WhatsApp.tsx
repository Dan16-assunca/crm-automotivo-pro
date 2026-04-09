import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Send, Search, Phone, MoreVertical, Paperclip, Smile, Check, CheckCheck, Clock, MessageCircleOff, UserPlus, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
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

function Avatar({ src, name, size = 10 }: { src?: string; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  const cls = `w-${size} h-${size} rounded-full shrink-0`
  if (src && !err) {
    return (
      <img
        src={src} alt={name}
        className={`${cls} object-cover`}
        onError={() => setErr(true)}
      />
    )
  }
  return (
    <div className={`${cls} bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center text-sm font-bold text-[#39FF14]`}>
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
    if (msg.pending) return <Clock size={12} className="text-[#555]" />
    if (msg.status === 'READ') return <CheckCheck size={12} className="text-[#39FF14]" />
    if (msg.status === 'DELIVERY_ACK' || msg.status === 'PLAYED') return <CheckCheck size={12} className="text-[#555]" />
    if (msg.status === 'SERVER_ACK') return <Check size={12} className="text-[#555]" />
    return <Check size={12} className="text-[#555]" />
  }

  return (
    <div className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
        msg.fromMe
          ? `bg-[#39FF14]/15 border border-[#39FF14]/20 rounded-tr-sm ${msg.pending ? 'opacity-60' : ''}`
          : 'bg-[#1A1A1A] border border-[#222] rounded-tl-sm'
      }`}>
        {msg.content
          ? <p className="text-sm text-white break-words whitespace-pre-wrap">{msg.content}</p>
          : <p className="text-sm text-[#555] italic">{msg.type}</p>
        }
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px] text-[#555]">{time}</span>
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
  const queryClient = useQueryClient()
  const [selectedChat, setSelectedChat] = useState<EvoChat | null>(null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const bulkUpsertedRef = useRef(false) // evita rodar múltiplas vezes

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

      return chats
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
      const res = await evolutionApi.findMessages(instanceName, selectedChat!.remoteJid, 50)
      const records: Record<string, unknown>[] = res?.messages?.records ?? res?.records ?? []
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
    refetchInterval: 5000,
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
      // Pequeno delay para a Evolution API indexar a mensagem enviada
      setTimeout(() => queryClient.invalidateQueries({ queryKey: qKey }), 1500)
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', instanceName] })
    },
    onError: (err: Error, _text, context) => {
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
    <div className="flex h-[calc(100vh-7rem)] rounded-xl overflow-hidden border border-[#222] bg-[#0D0D0D]">

      {/* ── Sidebar ── */}
      <div className="w-80 shrink-0 border-r border-[#222] flex flex-col">
        <div className="p-4 border-b border-[#222]">
          <h2 className="font-semibold text-white mb-3">WhatsApp</h2>
          {!instanceName && (
            <p className="text-xs text-yellow-400 mb-2">⚠ Configure a instância em Configurações</p>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
            <input type="text" placeholder="Buscar conversa..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#1A1A1A] border border-[#222] text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-[#39FF14]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : !filteredConvs?.length ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-[#555] p-6">
              <MessageCircleOff size={32} />
              <p className="text-sm text-center">
                {instanceName ? 'Nenhuma conversa encontrada' : 'Configure a instância primeiro'}
              </p>
            </div>
          ) : (
            filteredConvs.map((chat) => (
              <button key={chat.remoteJid} onClick={() => handleSelectChat(chat)}
                className={`w-full flex items-center gap-3 p-4 hover:bg-[#111] transition-colors border-b border-[#1A1A1A] text-left ${
                  selectedChat?.remoteJid === chat.remoteJid ? 'bg-[#111] border-l-2 border-l-[#39FF14]' : ''
                }`}
              >
                <Avatar src={chat.profilePicUrl} name={chat.pushName} size={10} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white truncate">{chat.pushName}</p>
                    {chat.lastMessageTs && (
                      <span className="text-[10px] text-[#555] shrink-0 ml-1">
                        {timeAgo(new Date(chat.lastMessageTs * 1000).toISOString())}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-[#555] truncate">
                      {chat.lastFromMe && <span className="text-[#39FF14]/60">Você: </span>}
                      {chat.lastMessageContent || chat.phoneNumber}
                    </p>
                    {chat.unreadCount > 0 && (
                      <span className="bg-[#39FF14] text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 ml-1">
                        {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Área do chat ── */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="h-16 px-4 border-b border-[#222] flex items-center justify-between bg-[#111] shrink-0">
            <div className="flex items-center gap-3">
              <Avatar src={selectedChat.profilePicUrl} name={selectedChat.pushName} size={9} />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{selectedChat.pushName}</p>
                  {selectedChat.leadId && (
                    <button
                      onClick={() => navigate('/pipeline')}
                      className="flex items-center gap-1 text-[10px] text-[#39FF14]/70 hover:text-[#39FF14] transition-colors"
                      title="Ver no Pipeline"
                    >
                      <ExternalLink size={10} /> {selectedChat.leadStage}
                    </button>
                  )}
                  {upsertLeadMutation.isPending && (
                    <span className="text-[10px] text-[#555] flex items-center gap-1">
                      <UserPlus size={10} /> criando lead...
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#555]">+{selectedChat.phoneNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {selectedChat.leadId && (
                <Button variant="ghost" size="sm" onClick={() => navigate('/pipeline')}
                  className="text-xs text-[#39FF14]/60 hover:text-[#39FF14]">
                  <ExternalLink size={12} /> Pipeline
                </Button>
              )}
              <Button variant="ghost" size="icon"><Phone size={15} /></Button>
              <Button variant="ghost" size="icon"><MoreVertical size={15} /></Button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {loadingMsgs && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-[#39FF14] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!loadingMsgs && !messages?.length && (
              <div className="flex items-center justify-center h-full text-[#555] text-sm">
                Nenhuma mensagem ainda. Inicie a conversa!
              </div>
            )}
            {messages?.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-[#222] bg-[#111] shrink-0">
            <div className="flex items-center gap-2">
              <button className="text-[#555] hover:text-[#A0A0A0] p-2"><Paperclip size={18} /></button>
              <button className="text-[#555] hover:text-[#A0A0A0] p-2"><Smile size={18} /></button>
              <input type="text" placeholder="Digite uma mensagem..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                className="flex-1 h-10 px-4 rounded-xl bg-[#1A1A1A] border border-[#222] text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-[#39FF14]"
              />
              <Button onClick={handleSend} loading={sendMutation.isPending}
                disabled={!message.trim()} size="icon" className="rounded-xl">
                <Send size={16} />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#333]">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1A1A1A] border border-[#222] flex items-center justify-center mx-auto mb-4">
              <Phone size={28} className="text-[#333]" />
            </div>
            <p className="text-sm">Selecione uma conversa</p>
            <p className="text-xs text-[#555] mt-1">Leads são criados automaticamente</p>
          </div>
        </div>
      )}
    </div>
  )
}
