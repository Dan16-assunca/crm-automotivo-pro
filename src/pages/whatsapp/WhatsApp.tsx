import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Send, Search, Phone, MoreVertical, Paperclip, Smile, Check, CheckCheck, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { evolutionApi } from '@/services/whatsapp'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toast'
import { timeAgo, formatDateTime } from '@/utils/format'
import type { WhatsAppMessage } from '@/types'

interface EvoChat {
  remoteJid: string
  pushName: string
  profilePicUrl?: string
  lastMessageContent?: string
  lastMessageTs?: number
  unreadCount: number
}

function MessageBubble({ msg }: { msg: WhatsAppMessage }) {
  const isOutbound = msg.direction === 'outbound'

  const StatusIcon = () => {
    if (!isOutbound) return null
    if (msg.status === 'read') return <CheckCheck size={12} className="text-[#39FF14]" />
    if (msg.status === 'delivered') return <CheckCheck size={12} className="text-[#555]" />
    if (msg.status === 'sent') return <Check size={12} className="text-[#555]" />
    return <Clock size={12} className="text-[#555]" />
  }

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
        isOutbound
          ? 'bg-[#39FF14]/15 border border-[#39FF14]/20 rounded-tr-sm'
          : 'bg-[#1A1A1A] border border-[#222] rounded-tl-sm'
      }`}>
        <p className="text-sm text-white break-words">{msg.content}</p>
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px] text-[#555]">{formatDateTime(msg.created_at)}</span>
          <StatusIcon />
        </div>
      </div>
    </div>
  )
}

export default function WhatsApp() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const [selectedChat, setSelectedChat] = useState<EvoChat | null>(null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const instanceName = (store?.settings as Record<string, string>)?.whatsapp_instance ?? ''

  // Conversations list via Evolution API (workaround: pushName vazio no v2.3.7)
  const { data: conversations, isLoading } = useQuery({
    queryKey: ['whatsapp-conversations', instanceName],
    queryFn: async () => {
      if (!instanceName) return []

      // 1. Buscar todos os chats
      const chats = await evolutionApi.findChats(instanceName)
      if (!Array.isArray(chats)) return []

      // 2. Para cada chat individual, buscar última mensagem para obter pushName
      const evoChats: EvoChat[] = await Promise.all(
        chats
          .filter((c: Record<string, unknown>) =>
            typeof c.id === 'string' && c.id.endsWith('@s.whatsapp.net')
          )
          .map(async (chat: Record<string, unknown>) => {
            const remoteJid = chat.id as string
            let pushName = ((chat.pushName || chat.name || '') as string).trim()
            let lastMessageContent = ''
            let lastMessageTs: number | undefined

            try {
              const msgsRes = await evolutionApi.findMessages(instanceName, remoteJid, 1)
              const records: Record<string, unknown>[] =
                msgsRes?.messages?.records ?? msgsRes?.records ?? []
              const lastMsg = records[0] as Record<string, unknown> | undefined
              if (lastMsg) {
                if (!pushName) pushName = (lastMsg.pushName as string | undefined) ?? ''
                const msgContent = lastMsg.message as Record<string, unknown> | undefined
                lastMessageContent =
                  (msgContent?.conversation as string) ||
                  ((msgContent?.extendedTextMessage as Record<string, unknown>)?.text as string) ||
                  ((msgContent?.imageMessage as Record<string, unknown>)?.caption as string) ||
                  ''
                lastMessageTs = lastMsg.messageTimestamp as number | undefined
              }
            } catch {
              // ignora erros por chat individual
            }

            // Não bloqueia — conta não-lidas do Supabase
            const { count: unread } = await supabase
              .from('whatsapp_messages')
              .select('id', { count: 'exact' })
              .eq('store_id', store!.id)
              .eq('remote_jid', remoteJid)
              .eq('direction', 'inbound')
              .is('read_at', null)

            return {
              remoteJid,
              pushName: pushName || remoteJid.replace('@s.whatsapp.net', ''),
              profilePicUrl: (chat.profilePicUrl as string | undefined) || undefined,
              lastMessageContent,
              lastMessageTs,
              unreadCount: unread ?? 0,
            }
          })
      )

      return evoChats.sort((a, b) => (b.lastMessageTs ?? 0) - (a.lastMessageTs ?? 0))
    },
    enabled: !!instanceName,
    refetchInterval: 10000,
  })

  // Messages for selected chat
  const { data: messages } = useQuery({
    queryKey: ['whatsapp-messages', selectedChat?.remoteJid],
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('store_id', store!.id)
        .eq('remote_jid', selectedChat!.remoteJid)
        .order('created_at', { ascending: true })
      return (data ?? []) as WhatsAppMessage[]
    },
    enabled: !!selectedChat?.remoteJid,
    refetchInterval: 5000,
  })

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send message
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedChat?.remoteJid) throw new Error('Nenhum chat selecionado')
      if (!instanceName) throw new Error('WhatsApp não configurado')

      const phoneNumber = selectedChat.remoteJid.replace('@s.whatsapp.net', '')

      // Send via Evolution API
      await evolutionApi.sendText(instanceName, phoneNumber, text)

      // Save to DB
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', selectedChat?.remoteJid] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] })
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
    c.remoteJid.includes(search)
  )

  return (
    <div className="flex h-[calc(100vh-7rem)] rounded-xl overflow-hidden border border-[#222] bg-[#0D0D0D]">
      {/* Sidebar - conversations */}
      <div className="w-80 shrink-0 border-r border-[#222] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[#222]">
          <h2 className="font-semibold text-white mb-3">WhatsApp</h2>
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

        {/* Conversation list */}
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
          ) : (
            filteredConvs?.map((chat) => (
              <button
                key={chat.remoteJid}
                onClick={() => setSelectedChat(chat)}
                className={`w-full flex items-center gap-3 p-4 hover:bg-[#111] transition-colors border-b border-[#1A1A1A] text-left ${
                  selectedChat?.remoteJid === chat.remoteJid ? 'bg-[#111] border-l-2 border-l-[#39FF14]' : ''
                }`}
              >
                {chat.profilePicUrl ? (
                  <img
                    src={chat.profilePicUrl}
                    alt={chat.pushName}
                    className="w-10 h-10 rounded-full object-cover shrink-0"
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
                      {chat.lastMessageContent || chat.remoteJid.replace('@s.whatsapp.net', '')}
                    </p>
                    {chat.unreadCount > 0 && (
                      <span className="bg-[#39FF14] text-black text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 ml-1">
                        {chat.unreadCount}
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
        <div className="flex-1 flex flex-col">
          {/* Chat header */}
          <div className="h-16 px-4 border-b border-[#222] flex items-center justify-between bg-[#111]">
            <div className="flex items-center gap-3">
              {selectedChat.profilePicUrl ? (
                <img
                  src={selectedChat.profilePicUrl}
                  alt={selectedChat.pushName}
                  className="w-9 h-9 rounded-full object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center text-sm font-bold text-[#39FF14]">
                  {selectedChat.pushName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-white">{selectedChat.pushName}</p>
                <p className="text-xs text-[#555]">{selectedChat.remoteJid.replace('@s.whatsapp.net', '')}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon"><Phone size={15} /></Button>
              <Button variant="ghost" size="icon"><MoreVertical size={15} /></Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {messages?.length === 0 && (
              <div className="flex items-center justify-center h-full text-[#555] text-sm">
                Nenhuma mensagem ainda. Inicie a conversa!
              </div>
            )}
            {messages?.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-[#222] bg-[#111]">
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
              <Button
                onClick={handleSend}
                loading={sendMutation.isPending}
                disabled={!message.trim()}
                size="icon"
                className="rounded-xl"
              >
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
