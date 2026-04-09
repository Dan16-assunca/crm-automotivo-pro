import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Search, Phone, MoreVertical, Paperclip, Smile, Check, CheckCheck, Clock, MessageCircleOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { evolutionApi } from '@/services/whatsapp'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toast'
import { timeAgo } from '@/utils/format'

// ---------- tipos locais ----------

interface EvoChat {
  remoteJid: string      // JID completo (@s.whatsapp.net ou @lid)
  phoneNumber: string    // número limpo para envio
  pushName: string
  profilePicUrl?: string
  lastMessageContent?: string
  lastMessageTs?: number
  lastFromMe?: boolean
  unreadCount: number
}

interface EvoMessage {
  id: string
  fromMe: boolean
  content: string
  type: string
  timestamp: number
  status?: string
}

// ---------- helpers ----------

/** Extrai número de telefone de qualquer formato de JID */
function extractPhone(remoteJid: string, remoteJidAlt?: string): string {
  if (remoteJidAlt) return remoteJidAlt.replace('@s.whatsapp.net', '')
  return remoteJid.replace(/@.+$/, '')
}

/** Extrai texto legível de qualquer tipo de mensagem */
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

// ---------- componentes ----------

function MessageBubble({ msg }: { msg: EvoMessage }) {
  const time = new Date(msg.timestamp * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const StatusIcon = () => {
    if (!msg.fromMe) return null
    if (msg.status === 'READ') return <CheckCheck size={12} className="text-[#39FF14]" />
    if (msg.status === 'DELIVERY_ACK' || msg.status === 'PLAYED') return <CheckCheck size={12} className="text-[#555]" />
    if (msg.status === 'SERVER_ACK') return <Check size={12} className="text-[#555]" />
    return <Clock size={12} className="text-[#555]" />
  }

  return (
    <div className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
        msg.fromMe
          ? 'bg-[#39FF14]/15 border border-[#39FF14]/20 rounded-tr-sm'
          : 'bg-[#1A1A1A] border border-[#222] rounded-tl-sm'
      }`}>
        {msg.content ? (
          <p className="text-sm text-white break-words">{msg.content}</p>
        ) : (
          <p className="text-sm text-[#555] italic">{msg.type}</p>
        )}
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px] text-[#555]">{time}</span>
          <StatusIcon />
        </div>
      </div>
    </div>
  )
}

// ---------- página principal ----------

export default function WhatsApp() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const [selectedChat, setSelectedChat] = useState<EvoChat | null>(null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const instanceName = (store?.settings as Record<string, string>)?.whatsapp_instance ?? ''

  // ---- lista de conversas ----
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['whatsapp-conversations', instanceName],
    queryFn: async () => {
      if (!instanceName) return []

      const chats = await evolutionApi.findChats(instanceName)
      if (!Array.isArray(chats)) return []

      const result: EvoChat[] = chats
        // Excluir grupos (@g.us) e broadcasts — incluir @s.whatsapp.net e @lid
        .filter((c: Record<string, unknown>) => {
          const jid = c.remoteJid as string
          return jid && !jid.endsWith('@g.us') && !jid.includes('@broadcast') && !jid.includes('status')
        })
        .map((chat: Record<string, unknown>) => {
          const lastMsg = chat.lastMessage as Record<string, unknown> | undefined
          const key = lastMsg?.key as Record<string, unknown> | undefined
          const remoteJid = chat.remoteJid as string
          const remoteJidAlt = key?.remoteJidAlt as string | undefined

          const pushName = ((chat.pushName as string | undefined) || '').trim() ||
            ((lastMsg?.pushName as string | undefined) || '').trim() ||
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

      return result
    },
    enabled: !!instanceName,
    refetchInterval: 8000,
  })

  // ---- mensagens do chat selecionado (via Evolution API) ----
  const { data: messages, isLoading: loadingMsgs } = useQuery({
    queryKey: ['whatsapp-messages', instanceName, selectedChat?.remoteJid],
    queryFn: async () => {
      const res = await evolutionApi.findMessages(instanceName, selectedChat!.remoteJid, 50)
      const records: Record<string, unknown>[] =
        res?.messages?.records ?? res?.records ?? []

      return records
        .map((msg): EvoMessage => {
          const key = msg.key as Record<string, unknown>
          const updates = (msg.MessageUpdate as Record<string, unknown>[] | undefined) ?? []
          const lastUpdate = updates[updates.length - 1]
          return {
            id: msg.id as string,
            fromMe: key?.fromMe as boolean ?? false,
            content: extractContent(msg),
            type: msg.messageType as string ?? 'unknown',
            timestamp: msg.messageTimestamp as number ?? 0,
            status: (lastUpdate?.status as string) ?? (msg.status as string),
          }
        })
        .sort((a, b) => a.timestamp - b.timestamp) // crescente para exibição
    },
    enabled: !!selectedChat?.remoteJid && !!instanceName,
    refetchInterval: 5000,
  })

  // Scroll para o fim ao carregar/atualizar mensagens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ---- envio de mensagem ----
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedChat) throw new Error('Nenhum chat selecionado')
      if (!instanceName) throw new Error('WhatsApp não configurado. Vá em Configurações.')

      // Evolution API recebe o número sem @
      await evolutionApi.sendText(instanceName, selectedChat.phoneNumber, text)

      // Salva no Supabase para histórico
      await supabase.from('whatsapp_messages').insert({
        store_id: store!.id,
        instance_name: instanceName,
        remote_jid: selectedChat.remoteJid,
        direction: 'outbound',
        type: 'text',
        content: text,
        status: 'sent',
      }).throwOnError()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', instanceName, selectedChat?.remoteJid] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations', instanceName] })
      setMessage('')
    },
    onError: (err: Error) => toast.error('Erro ao enviar', err.message),
  })

  const handleSend = () => {
    if (!message.trim()) return
    sendMutation.mutate(message.trim())
  }

  const filteredConvs = conversations?.filter(c =>
    c.pushName.toLowerCase().includes(search.toLowerCase()) ||
    c.phoneNumber.includes(search)
  )

  // ---- render ----
  return (
    <div className="flex h-[calc(100vh-7rem)] rounded-xl overflow-hidden border border-[#222] bg-[#0D0D0D]">

      {/* Sidebar */}
      <div className="w-80 shrink-0 border-r border-[#222] flex flex-col">
        <div className="p-4 border-b border-[#222]">
          <h2 className="font-semibold text-white mb-3">WhatsApp</h2>
          {!instanceName && (
            <p className="text-xs text-yellow-400 mb-2">⚠ Configure a instância em Configurações</p>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
            <input
              type="text"
              placeholder="Buscar conversa..."
              value={search}
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
              <button
                key={chat.remoteJid}
                onClick={() => setSelectedChat(chat)}
                className={`w-full flex items-center gap-3 p-4 hover:bg-[#111] transition-colors border-b border-[#1A1A1A] text-left ${
                  selectedChat?.remoteJid === chat.remoteJid ? 'bg-[#111] border-l-2 border-l-[#39FF14]' : ''
                }`}
              >
                {chat.profilePicUrl ? (
                  <img src={chat.profilePicUrl} alt={chat.pushName}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center text-sm font-bold text-[#39FF14] shrink-0">
                    {chat.pushName.slice(0, 2).toUpperCase()}
                  </div>
                )}
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

      {/* Chat area */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="h-16 px-4 border-b border-[#222] flex items-center justify-between bg-[#111] shrink-0">
            <div className="flex items-center gap-3">
              {selectedChat.profilePicUrl ? (
                <img src={selectedChat.profilePicUrl} alt={selectedChat.pushName}
                  className="w-9 h-9 rounded-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center text-sm font-bold text-[#39FF14]">
                  {selectedChat.pushName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-white">{selectedChat.pushName}</p>
                <p className="text-xs text-[#555]">+{selectedChat.phoneNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
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
            {!loadingMsgs && messages?.length === 0 && (
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
              <input
                type="text"
                placeholder="Digite uma mensagem..."
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
          </div>
        </div>
      )}
    </div>
  )
}
