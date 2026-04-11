import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, MessageSquare, Phone, Car, DollarSign, MapPin, User, Calendar,
  ChevronRight, Clock, Send, Zap, RefreshCw,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { evolutionApi } from '@/services/whatsapp'
import { toast } from '@/components/ui/Toast'
import { formatCurrency, timeAgo } from '@/utils/format'
import type { Lead, Activity, WhatsAppMessage, PipelineStage, User as TUser } from '@/types'

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  panel: {
    position: 'fixed' as const,
    width: 440,
    maxHeight: 'calc(100vh - 20px)',
    background: '#111',
    border: '1px solid #222',
    borderRadius: 12,
    boxShadow: '0 20px 60px rgba(0,0,0,.85)',
    display: 'flex',
    flexDirection: 'column' as const,
    zIndex: 1000,
    overflow: 'hidden',
    colorScheme: 'dark' as const,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: '#3df710',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    marginBottom: 8,
  },
  section: {
    padding: '12px 14px',
    borderBottom: '1px solid #1a1a1a',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  label: { fontSize: 10, color: '#505050', width: 100, flexShrink: 0 },
  value: { fontSize: 12, color: '#f5f5f5', flex: 1 },
  input: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    color: '#f5f5f5',
    width: '100%',
    outline: 'none',
  },
  select: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    padding: '4px 8px',
    fontSize: 12,
    color: '#f5f5f5',
    width: '100%',
    outline: 'none',
    colorScheme: 'dark',
  },
  btnGhost: {
    background: 'transparent',
    border: '1px solid #222',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 11,
    color: '#9a9a9a',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all .15s',
  },
  btnNeon: {
    background: '#3df710',
    border: 'none',
    borderRadius: 6,
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 700,
    color: '#000',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all .15s',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TEMP_COLOR: Record<string, string> = {
  hot: '#F43F5E', warm: '#F97316', cold: '#60A5FA',
}
const TEMP_LABEL: Record<string, string> = {
  hot: '🔥 Quente', warm: '⚡ Morno', cold: '❄ Frio',
}
const SOURCE_ICONS: Record<string, string> = {
  whatsapp: '💬', instagram: '📸', facebook: '👥', meta_ads: '📢',
  google_ads: '🔍', olx: '🛒', webmotors: '🚗', indicacao: '🤝',
  site: '🌐', telefone: '📞', presencial: '🏪', youtube: '▶️',
}
const PAYMENT_OPTIONS = [
  'Financiamento bancário', 'À vista PIX', 'Consórcio',
  'Troca pura', 'Troca + complemento', 'Leasing', 'FGTS',
]
const QUICK_TEMPLATES = [
  { icon: '👋', label: 'Boas-vindas', text: 'Olá! Tudo bem? Vi sua mensagem e já estou aqui para ajudá-lo(a)! Temos ótimas opções disponíveis. Como posso ajudar?' },
  { icon: '📸', label: 'Fotos', text: 'Olá! Vou te enviar as fotos e detalhes do veículo agora. Qualquer dúvida estou à disposição!' },
  { icon: '💰', label: 'Condições', text: 'Posso te apresentar as melhores condições de pagamento! Trabalhamos com financiamento, à vista e consórcio. Qual você prefere?' },
  { icon: '🗓', label: 'Visita', text: 'Que tal agendar uma visita para conhecer o veículo pessoalmente? Temos horários disponíveis hoje e amanhã!' },
  { icon: '✅', label: 'Follow-up', text: 'Oi! Quero saber se você ainda tem interesse no veículo. Posso tirar alguma dúvida?' },
  { icon: '📋', label: 'Proposta', text: 'Olá! Preparei uma proposta especial para você. Posso enviar os detalhes agora?' },
]

function avatarColor(name: string) {
  const colors = ['#3df710', '#0A84FF', '#FFD60A', '#FF9F0A', '#BF5AF2', '#32ADE6', '#FF3B30', '#30D158']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

function qualScore(lead: Lead) {
  const intentMap: Record<string, number> = { hot: 90, warm: 58, cold: 28 }
  const intent = intentMap[lead.temperature] ?? 50
  const bMax = lead.budget_max ?? 0
  const capacity = bMax > 400000 ? 88 : bMax > 150000 ? 72 : bMax > 60000 ? 55 : 35
  return { intent, capacity, urgency: Math.round(intent * 0.9) }
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: '#9a9a9a' }}>{label}</span>
        <span style={{ fontSize: 10, color: '#3df710', fontWeight: 700 }}>{value}%</span>
      </div>
      <div style={{ height: 3, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: '#3df710', borderRadius: 2, transition: 'width .6s ease' }} />
      </div>
    </div>
  )
}

function InlineEdit({ value, onSave, placeholder, type = 'text' }: {
  value: string; onSave: (v: string) => void; placeholder?: string; type?: string
}) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  if (!editing) return (
    <span
      onClick={() => setEditing(true)}
      style={{ color: v ? '#f5f5f5' : '#505050', cursor: 'pointer', fontSize: 12, borderBottom: '1px dashed #333' }}
    >
      {v || placeholder || '—'}
    </span>
  )
  return (
    <input
      autoFocus
      type={type}
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { onSave(v); setEditing(false) }}
      onKeyDown={e => { if (e.key === 'Enter') { onSave(v); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
      style={{ ...S.input, padding: '2px 6px', width: 'auto', minWidth: 80, maxWidth: 180 }}
    />
  )
}

// ─── Create Mode Form ──────────────────────────────────────────────────────────
function CreateForm({ initialData, onClose }: { initialData: Partial<Lead>; onClose: () => void }) {
  const { store, user } = useAuthStore()
  const { openLeadPanel } = useLeadPanelStore()
  const queryClient = useQueryClient()
  const storeId = store?.id ?? ''

  const [name, setName] = useState(initialData.client_name ?? '')
  const [phone, setPhone] = useState(initialData.client_phone ?? '')
  const [email, setEmail] = useState(initialData.client_email ?? '')
  const [source, setSource] = useState(initialData.source ?? 'whatsapp')
  const [temperature, setTemperature] = useState<Lead['temperature']>(initialData.temperature ?? 'cold')
  const [vehicle, setVehicle] = useState(initialData.vehicle_interest ?? '')

  const { data: stages } = useQuery<PipelineStage[]>({
    queryKey: ['pipeline-stages', storeId],
    queryFn: async () => {
      const { data } = await supabase.from('pipeline_stages').select('*').eq('store_id', storeId).order('position')
      return (data ?? []) as PipelineStage[]
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  })

  const createMut = useMutation({
    mutationFn: async () => {
      const firstStage = stages?.find(s => !s.is_final) ?? stages?.[0]
      if (!firstStage) throw new Error('Nenhuma etapa configurada')
      const { data, error } = await supabase.from('leads').insert({
        store_id: storeId,
        salesperson_id: user?.id,
        stage_id: initialData.stage_id ?? firstStage.id,
        client_name: name,
        client_phone: phone || null,
        client_email: email || null,
        source: source || null,
        temperature,
        vehicle_interest: vehicle || null,
        status: 'active',
      }).select('id').single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (id) => {
      toast.success('Lead criado!', 'Adicionado ao pipeline')
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads-list'] })
      openLeadPanel(id)
    },
    onError: () => toast.error('Erro ao criar lead'),
  })

  const inpStyle: React.CSSProperties = { ...S.input, marginBottom: 8 }
  const lbl: React.CSSProperties = { fontSize: 10, color: '#505050', display: 'block', marginBottom: 3 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#f5f5f5' }}>Novo Lead</p>
          <p style={{ fontSize: 10, color: '#505050', marginTop: 2 }}>Preencha os dados do contato</p>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#505050', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
          <X size={14} />
        </button>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        <label style={lbl}>Nome *</label>
        <input style={inpStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />

        <label style={lbl}>Telefone / WhatsApp</label>
        <input style={inpStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-9999" />

        <label style={lbl}>Email</label>
        <input style={inpStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />

        <label style={lbl}>Veículo de interesse</label>
        <input style={inpStyle} value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="Honda Civic 2023..." />

        <label style={lbl}>Origem</label>
        <select style={{ ...S.select, marginBottom: 8 }} value={source} onChange={e => setSource(e.target.value)}>
          {Object.entries(SOURCE_ICONS).map(([k, icon]) => (
            <option key={k} value={k}>{icon} {k.charAt(0).toUpperCase() + k.slice(1)}</option>
          ))}
        </select>

        <label style={lbl}>Temperatura</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {(['hot', 'warm', 'cold'] as const).map(t => (
            <button key={t} type="button"
              onClick={() => setTemperature(t)}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, cursor: 'pointer',
                border: `1px solid ${temperature === t ? TEMP_COLOR[t] : '#222'}`,
                background: temperature === t ? TEMP_COLOR[t] + '20' : 'transparent',
                color: temperature === t ? TEMP_COLOR[t] : '#505050',
              }}>
              {TEMP_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #1a1a1a', display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={{ ...S.btnGhost, flex: 1, justifyContent: 'center' }}>Cancelar</button>
        <button
          onClick={() => createMut.mutate()}
          disabled={!name.trim() || createMut.isPending}
          style={{ ...S.btnNeon, flex: 1, justifyContent: 'center', opacity: !name.trim() ? 0.5 : 1 }}
        >
          {createMut.isPending ? 'Criando...' : 'Salvar Lead'}
        </button>
      </div>
    </div>
  )
}

// ─── LeadPanel ─────────────────────────────────────────────────────────────────
interface LeadPanelProps {
  leadId: string
  onClose: () => void
  initialPosition?: { top: number; right: number }
  mode?: 'view' | 'create'
  initialData?: Partial<Lead> | null
}

export default function LeadPanel({ leadId, onClose, initialPosition, mode = 'view', initialData }: LeadPanelProps) {
  const { store, user } = useAuthStore()
  const queryClient = useQueryClient()
  const instanceName = (store?.settings as Record<string, string>)?.whatsapp_instance ?? ''
  const storeId = store?.id ?? ''

  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: initialPosition?.top ?? 60, right: initialPosition?.right ?? 20 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, top: 0, right: 0 })

  const [tab, setTab] = useState<'info' | 'chat'>('info')
  const [chatMsg, setChatMsg] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead-detail', leadId],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('*').eq('id', leadId).single()
      return data as Lead
    },
    enabled: !!leadId && mode === 'view',
    staleTime: 2 * 60 * 1000,
  })

  const { data: stages } = useQuery({
    queryKey: ['pipeline-stages', storeId],
    queryFn: async () => {
      const { data } = await supabase.from('pipeline_stages').select('*').eq('store_id', storeId).order('position')
      return (data ?? []) as PipelineStage[]
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: team } = useQuery({
    queryKey: ['team', storeId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, full_name').eq('store_id', storeId).eq('active', true)
      return (data ?? []) as Pick<TUser, 'id' | 'full_name'>[]
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: activities } = useQuery({
    queryKey: ['activities', leadId],
    queryFn: async () => {
      const { data } = await supabase.from('activities')
        .select('*, user:users(full_name)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(20)
      return (data ?? []) as Activity[]
    },
    enabled: !!leadId && mode === 'view',
  })

  const { data: messages, refetch: refetchMsgs, isFetching: loadingMsgs } = useQuery({
    queryKey: ['wa-messages', leadId, instanceName],
    queryFn: async () => {
      const phone = lead?.client_phone?.replace(/\D/g, '') ?? ''

      // Try Evolution API first — returns full history (inbound + outbound)
      if (phone && instanceName) {
        try {
          const remoteJid = `${phone}@s.whatsapp.net`
          const apiResult = await evolutionApi.findMessages(instanceName, remoteJid, 100)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const records: any[] = (apiResult as any)?.messages?.records
            ?? (Array.isArray(apiResult) ? apiResult : [])

          if (records.length > 0) {
            return records
              .map((r): WhatsAppMessage => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const msg = r.message as Record<string, any> ?? {}
                const content: string =
                  msg.conversation
                  ?? msg.extendedTextMessage?.text
                  ?? msg.imageMessage?.caption
                  ?? msg.videoMessage?.caption
                  ?? msg.audioMessage ? '[Áudio]'
                  : msg.documentMessage?.fileName ?? '[Mídia]'
                return {
                  id: r.key?.id ?? r.id ?? String(Math.random()),
                  store_id: storeId,
                  lead_id: leadId ?? undefined,
                  instance_name: instanceName,
                  remote_jid: r.key?.remoteJid ?? remoteJid,
                  direction: r.key?.fromMe ? 'outbound' : 'inbound',
                  type: 'text',
                  content,
                  status: 'delivered',
                  created_at: r.messageTimestamp
                    ? new Date(r.messageTimestamp * 1000).toISOString()
                    : new Date().toISOString(),
                }
              })
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          }
        } catch (e) {
          console.warn('[LeadPanel] Evolution API findMessages failed, falling back to DB', e)
        }
      }

      // Fallback: DB messages only
      const { data } = await supabase.from('whatsapp_messages')
        .select('*')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: true })
        .limit(100)
      return (data ?? []) as WhatsAppMessage[]
    },
    enabled: !!leadId && tab === 'chat' && mode === 'view' && !!lead,
    staleTime: 15_000,
    refetchInterval: tab === 'chat' ? 20_000 : false, // poll every 20s while chat is open
  })

  // ── Update lead ────────────────────────────────────────────────────────────
  const updateLead = useMutation({
    mutationFn: async (fields: Partial<Lead>) => {
      const { error } = await supabase.from('leads')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', leadId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-detail', leadId] })
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads', storeId] })
      queryClient.invalidateQueries({ queryKey: ['leads-list', storeId] })
    },
    onError: () => toast.error('Erro ao salvar'),
  })

  const save = useCallback((fields: Partial<Lead>) => {
    updateLead.mutate(fields)
    toast.success('Salvo')
  }, [updateLead])

  // ── Move stage ─────────────────────────────────────────────────────────────
  const moveStage = useCallback((stageId: string) => {
    const newStage = stages?.find(s => s.id === stageId)
    const prevStageName = stages?.find(s => s.id === lead?.stage_id)?.name ?? '—'

    updateLead.mutate({ stage_id: stageId })

    // Record activity
    if (lead && newStage) {
      supabase.from('activities').insert({
        lead_id: leadId,
        store_id: storeId,
        user_id: user?.id,
        type: 'stage_change',
        title: 'Etapa alterada',
        description: `"${prevStageName}" → "${newStage.name}"`,
        completed_at: new Date().toISOString(),
      }).then(() => queryClient.invalidateQueries({ queryKey: ['activities', leadId] }))
    }

    toast.success('Etapa atualizada!', newStage?.name)
  }, [stages, lead, leadId, storeId, user?.id, updateLead, queryClient])

  // ── Send WhatsApp (optimistic) ────────────────────────────────────────────
  const sendMsg = useMutation({
    onMutate: async (text: string) => {
      // Cancel in-flight refetches so they don't overwrite optimistic state
      await queryClient.cancelQueries({ queryKey: ['wa-messages', leadId, instanceName] })
      const previous = queryClient.getQueryData<WhatsAppMessage[]>(['wa-messages', leadId, instanceName])

      const tempMsg: WhatsAppMessage = {
        id: `opt-${Date.now()}`,
        store_id: storeId,
        lead_id: leadId ?? undefined,
        instance_name: instanceName ?? undefined,
        remote_jid: `${lead?.client_phone?.replace(/\D/g, '')}@s.whatsapp.net`,
        direction: 'outbound',
        type: 'text',
        content: text,
        status: 'sent',
        created_at: new Date().toISOString(),
      }

      queryClient.setQueryData<WhatsAppMessage[]>(
        ['wa-messages', leadId, instanceName],
        old => [...(old ?? []), tempMsg],
      )
      setChatMsg('')
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      return { previous }
    },
    mutationFn: async (text: string) => {
      const phone = lead?.client_phone ?? ''
      if (!phone) throw new Error('Lead sem telefone')
      if (!instanceName) throw new Error('Instância WhatsApp não configurada')
      await evolutionApi.sendText(instanceName, phone, text)
      await supabase.from('whatsapp_messages').insert({
        store_id: storeId,
        lead_id: leadId,
        instance_name: instanceName,
        remote_jid: `${phone.replace(/\D/g, '')}@s.whatsapp.net`,
        direction: 'outbound',
        type: 'text',
        content: text,
        status: 'sent',
      })
    },
    onSuccess: () => {
      setTimeout(() => refetchMsgs(), 600)
    },
    onError: (e, text, context) => {
      // Rollback optimistic update
      if (context?.previous) {
        queryClient.setQueryData(['wa-messages', leadId, instanceName], context.previous)
      }
      setChatMsg(text)
      toast.error('Erro ao enviar', (e as Error).message)
    },
  })

  const handleSend = () => {
    const t = chatMsg.trim()
    if (!t) return
    sendMsg.mutate(t)
  }

  const saveSchedule = () => {
    if (!scheduleDate) return
    updateLead.mutate({ next_followup_at: new Date(scheduleDate).toISOString() })
    toast.success('Agendamento salvo!')
    setShowSchedule(false)
    setScheduleDate('')
  }

  // ── Drag (mouse) ───────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return
    e.preventDefault()
    dragStart.current = { x: e.clientX, y: e.clientY, top: pos.top, right: pos.right }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      const panelW = panelRef.current?.offsetWidth ?? 370
      const panelH = panelRef.current?.offsetHeight ?? 500
      const newTop = Math.max(0, Math.min(window.innerHeight - panelH, dragStart.current.top + dy))
      const newRight = Math.max(0, Math.min(window.innerWidth - panelW, dragStart.current.right - dx))
      setPos({ top: newTop, right: newRight })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  // ── Drag (touch) ───────────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return
    const t = e.touches[0]
    dragStart.current = { x: t.clientX, y: t.clientY, top: pos.top, right: pos.right }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0]
      const dx = t.clientX - dragStart.current.x
      const dy = t.clientY - dragStart.current.y
      const panelW = panelRef.current?.offsetWidth ?? 370
      const panelH = panelRef.current?.offsetHeight ?? 500
      const newTop = Math.max(0, Math.min(window.innerHeight - panelH, dragStart.current.top + dy))
      const newRight = Math.max(0, Math.min(window.innerWidth - panelW, dragStart.current.right - dx))
      setPos({ top: newTop, right: newRight })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
    return () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp) }
  }, [dragging])

  // ── Chat scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'chat') setTimeout(() => chatEndRef.current?.scrollIntoView(), 200)
  }, [tab, messages])

  // ── Create mode ───────────────────────────────────────────────────────────
  if (mode === 'create') {
    return (
      <div
        ref={panelRef}
        style={{ ...S.panel, top: pos.top, right: pos.right, left: 'auto' }}
      >
        <CreateForm initialData={initialData ?? {}} onClose={onClose} />
      </div>
    )
  }

  if (isLoading || !lead) return null

  const color = avatarColor(lead.client_name)
  const tempColor = TEMP_COLOR[lead.temperature] ?? '#9a9a9a'
  const { intent, capacity, urgency } = qualScore(lead)
  const currentStage = stages?.find(s => s.id === lead.stage_id)
  const nextStage = stages?.find(s => s.position === (currentStage?.position ?? 0) + 1 && !s.is_final)
  const daysInPipeline = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000)

  return (
    <div
      ref={panelRef}
      style={{ ...S.panel, top: pos.top, right: pos.right, left: 'auto', cursor: dragging ? 'grabbing' : 'auto' }}
    >
      {/* ── Header (drag handle) ───────────────────────────────────────────── */}
      <div
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid #1a1a1a',
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Avatar */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: color + '22',
            border: `2px solid ${color}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 13, fontWeight: 700, color, flexShrink: 0,
          }}>
            {lead.client_name.slice(0, 2).toUpperCase()}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#f5f5f5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lead.client_name}
            </p>
            <p style={{ fontSize: 10, color: '#505050', marginTop: 1 }}>
              {currentStage?.name ?? '—'} · {lead.source ?? '—'}
            </p>
            <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: tempColor + '20', color: tempColor, fontWeight: 700 }}>
                {TEMP_LABEL[lead.temperature]}
              </span>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: '#3df71015', color: '#3df710', fontWeight: 700 }}>
                ★ {Math.round((intent + capacity) / 2)}/100
              </span>
              {lead.payment_type && (
                <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: '#0A84FF20', color: '#0A84FF', fontWeight: 700 }}>
                  {lead.payment_type === 'financiamento' ? 'Financ.' : lead.payment_type === 'avista' ? 'À Vista' : 'Consórcio'}
                </span>
              )}
            </div>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#505050', cursor: 'pointer', padding: 4, borderRadius: 4, flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f5f5f5'; e.currentTarget.style.background = '#1a1a1a' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#505050'; e.currentTarget.style.background = 'transparent' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>
          {(['info', 'chat'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all .15s',
                background: tab === t ? '#3df710' : '#1a1a1a',
                color: tab === t ? '#000' : '#9a9a9a',
              }}
            >
              {t === 'info' ? '📋 Info' : '💬 Chat'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      {tab === 'info' ? (
        <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#222 transparent' }}>

          {/* Origem & Entrada */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Origem &amp; Entrada</p>
            <div style={{ ...S.row, marginBottom: 8 }}>
              <span style={S.label}>Canal</span>
              <select
                value={lead.source ?? ''}
                onChange={e => save({ source: e.target.value })}
                style={{ ...S.select, flex: 1 }}
              >
                <option value="">Selecionar</option>
                {Object.entries(SOURCE_ICONS).map(([k, icon]) => (
                  <option key={k} value={k}>{icon} {k.charAt(0).toUpperCase() + k.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 7, padding: '6px 8px' }}>
                <p style={{ fontSize: 9, color: '#505050', marginBottom: 2 }}>Data entrada</p>
                <p style={{ fontSize: 11, color: '#f5f5f5', fontWeight: 600 }}>
                  {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 7, padding: '6px 8px' }}>
                <p style={{ fontSize: 9, color: '#505050', marginBottom: 2 }}>Dias no pipeline</p>
                <p style={{ fontSize: 11, color: daysInPipeline > 7 ? '#F97316' : '#3df710', fontWeight: 600 }}>
                  {daysInPipeline}d {daysInPipeline > 7 ? '⚠️' : '✓'}
                </p>
              </div>
            </div>
          </div>

          {/* Qualificação */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Qualificação</p>
            <Bar label="Intenção de compra" value={intent} />
            <Bar label="Capacidade financeira" value={capacity} />
            <Bar label="Urgência" value={urgency} />
          </div>

          {/* Veículo & Negócio */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Veículo &amp; Negócio</p>
            <div style={S.row}>
              <Car size={11} style={{ color: '#505050', flexShrink: 0 }} />
              <span style={S.label}>Veículo</span>
              <InlineEdit
                value={lead.vehicle_interest ?? ''}
                placeholder="Ex: Honda Civic 2023"
                onSave={v => save({ vehicle_interest: v })}
              />
            </div>
            <div style={S.row}>
              <DollarSign size={11} style={{ color: '#505050', flexShrink: 0 }} />
              <span style={S.label}>Orçamento</span>
              <InlineEdit
                value={lead.budget_max ? String(lead.budget_max) : ''}
                placeholder="R$ 0"
                type="number"
                onSave={v => save({ budget_max: parseFloat(v) || undefined })}
              />
            </div>
            <div style={S.row}>
              <span style={S.label}>Pagamento</span>
              <select
                value={lead.payment_type ?? ''}
                onChange={e => save({ payment_type: e.target.value as Lead['payment_type'] })}
                style={{ ...S.select, flex: 1 }}
              >
                <option value="">Selecionar</option>
                {PAYMENT_OPTIONS.map(p => <option key={p} value={p.toLowerCase().split(' ')[0]}>{p}</option>)}
              </select>
            </div>
            {lead.trade_in && (
              <div style={S.row}>
                <RefreshCw size={11} style={{ color: '#505050', flexShrink: 0 }} />
                <span style={S.label}>Veículo troca</span>
                <InlineEdit
                  value={lead.trade_in_vehicle ?? ''}
                  placeholder="Ex: Gol 2018"
                  onSave={v => save({ trade_in_vehicle: v })}
                />
              </div>
            )}
          </div>

          {/* Dados do comprador */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Dados do Comprador</p>
            {[
              { icon: <Phone size={10} />, label: 'Telefone', field: 'client_phone' as keyof Lead },
              { icon: <User size={10} />, label: 'E-mail', field: 'client_email' as keyof Lead },
              { icon: <MapPin size={10} />, label: 'Cidade', field: 'client_city' as keyof Lead },
            ].map(({ icon, label, field }) => (
              <div key={field} style={{ ...S.row, marginBottom: 6 }}>
                <span style={{ color: '#505050', flexShrink: 0 }}>{icon}</span>
                <span style={S.label}>{label}</span>
                <InlineEdit
                  value={(lead[field] as string) ?? ''}
                  placeholder="—"
                  onSave={v => save({ [field]: v })}
                />
              </div>
            ))}
            <div style={S.row}>
              <User size={10} style={{ color: '#505050', flexShrink: 0 }} />
              <span style={S.label}>Vendedor</span>
              <select
                value={lead.salesperson_id ?? ''}
                onChange={e => save({ salesperson_id: e.target.value })}
                style={{ ...S.select, flex: 1 }}
              >
                <option value="">Sem atribuição</option>
                {team?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div style={S.row}>
              <TrendingUp size={10} style={{ color: '#505050', flexShrink: 0 }} />
              <span style={S.label}>Temperatura</span>
              <select
                value={lead.temperature}
                onChange={e => save({ temperature: e.target.value as Lead['temperature'] })}
                style={{ ...S.select, flex: 1 }}
              >
                <option value="hot">🔥 Quente</option>
                <option value="warm">⚡ Morno</option>
                <option value="cold">❄ Frio</option>
              </select>
            </div>
          </div>

          {/* Avançar etapa */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Etapas do Pipeline</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {stages?.map(s => (
                <button
                  key={s.id}
                  onClick={() => moveStage(s.id)}
                  style={{
                    padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${s.id === lead.stage_id ? s.color : '#222'}`,
                    background: s.id === lead.stage_id ? s.color + '25' : 'transparent',
                    color: s.id === lead.stage_id ? s.color : '#505050',
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { if (s.id !== lead.stage_id) { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.color = s.color } }}
                  onMouseLeave={e => { if (s.id !== lead.stage_id) { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#505050' } }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {/* Atividades */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Histórico de Atividades</p>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              {[
                { icon: '📞', label: 'Ligação', type: 'call' },
                { icon: '🚗', label: 'Visita', type: 'visit' },
                { icon: '💰', label: 'Proposta', type: 'proposal' },
                { icon: '📝', label: 'Nota', type: 'note' },
              ].map(({ icon, label, type }) => (
                <button
                  key={type}
                  onClick={async () => {
                    await supabase.from('activities').insert({
                      lead_id: leadId, store_id: storeId, user_id: user?.id,
                      type, title: label, completed_at: new Date().toISOString(),
                    })
                    queryClient.invalidateQueries({ queryKey: ['activities', leadId] })
                    toast.success(`${label} registrada`)
                  }}
                  style={{ ...S.btnGhost, fontSize: 10 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#3df710'; e.currentTarget.style.color = '#3df710' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#9a9a9a' }}
                >
                  {icon} {label}
                </button>
              ))}
            </div>

            {/* Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activities?.length === 0 && (
                <p style={{ fontSize: 11, color: '#505050', textAlign: 'center', padding: '8px 0' }}>Nenhuma atividade registrada</p>
              )}
              {activities?.slice(0, 8).map(a => (
                <div key={a.id} style={{
                  display: 'flex', gap: 8, padding: '7px 9px',
                  background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 7,
                }}>
                  <div style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>
                    {a.type === 'call' ? '📞' : (a.type as string) === 'whatsapp_message' ? '💬' : a.type === 'visit' ? '🚗' : a.type === 'note' ? '📝' : a.type === 'stage_change' ? '⚡' : '📋'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, color: '#f5f5f5', fontWeight: 600 }}>{a.title ?? a.type}</p>
                    {a.description && (
                      <p style={{ fontSize: 10, color: '#9a9a9a', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.description}
                      </p>
                    )}
                    <p style={{ fontSize: 9, color: '#505050', marginTop: 2 }}>{timeAgo(a.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Observações */}
          <div style={{ ...S.section, borderBottom: 'none' }}>
            <p style={S.sectionTitle}>Observações</p>
            <textarea
              defaultValue={lead.notes ?? ''}
              placeholder="Adicione observações sobre este lead..."
              onBlur={e => save({ notes: e.target.value })}
              style={{
                ...S.input,
                resize: 'vertical',
                minHeight: 72,
                padding: '8px',
                lineHeight: 1.5,
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
      ) : (
        /* ── Chat ──────────────────────────────────────────────────────────── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4, scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a transparent' }}>
            {loadingMsgs && !messages?.length && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#505050', fontSize: 12 }}>
                <RefreshCw size={18} style={{ margin: '0 auto 8px', opacity: 0.4, display: 'block', animation: 'spin 1s linear infinite' }} />
                Carregando mensagens...
              </div>
            )}
            {!loadingMsgs && !messages?.length && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#505050', fontSize: 12 }}>
                <MessageSquare size={28} style={{ margin: '0 auto 10px', opacity: 0.2, display: 'block' }} />
                Nenhuma mensagem ainda
                <p style={{ fontSize: 10, marginTop: 4, color: '#383838' }}>Use os atalhos abaixo para iniciar</p>
              </div>
            )}
            {messages?.map((m, idx) => {
              // Date separator
              const msgDate = new Date(m.created_at)
              const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at) : null
              const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString()
              const isOptimistic = m.id.startsWith('opt-')

              return (
                <div key={m.id}>
                  {showDateSep && (
                    <div style={{ textAlign: 'center', margin: '8px 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 1, background: '#1e1e1e' }} />
                      <span style={{ fontSize: 9, color: '#404040', padding: '2px 8px', background: '#141414', borderRadius: 10 }}>
                        {msgDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: msgDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}
                      </span>
                      <div style={{ flex: 1, height: 1, background: '#1e1e1e' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                    <div style={{
                      maxWidth: '82%', padding: '8px 11px', borderRadius: m.direction === 'outbound' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: m.direction === 'outbound' ? '#1c3d1c' : '#1e1e1e',
                      border: `1px solid ${m.direction === 'outbound' ? '#2d5c2d' : '#2a2a2a'}`,
                      opacity: isOptimistic ? 0.75 : 1,
                      transition: 'opacity .3s',
                    }}>
                      <p style={{ fontSize: 13, color: '#f0f0f0', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', margin: 0 }}>{m.content}</p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                        <span style={{ fontSize: 9, color: '#484848' }}>
                          {msgDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {m.direction === 'outbound' && (
                          <span style={{ fontSize: 10, color: isOptimistic ? '#484848' : '#3df710' }}>
                            {isOptimistic ? '🕐' : '✓✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Quick templates */}
          <div style={{ padding: '6px 10px', borderTop: '1px solid #1a1a1a', display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {QUICK_TEMPLATES.map(t => (
              <button
                key={t.label}
                onClick={() => sendMsg.mutate(t.text)}
                style={{ ...S.btnGhost, flexShrink: 0, fontSize: 10, padding: '3px 8px' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#3df710'; e.currentTarget.style.color = '#3df710' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#9a9a9a' }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid #1a1a1a', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <textarea
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Digite uma mensagem... (Enter para enviar)"
              rows={2}
              style={{ ...S.input, flex: 1, resize: 'none', padding: '7px 10px', lineHeight: 1.4, fontFamily: 'inherit', fontSize: 12 }}
              disabled={sendMsg.isPending}
            />
            <button
              onClick={handleSend}
              disabled={!chatMsg.trim() || sendMsg.isPending}
              style={{
                ...S.btnNeon,
                opacity: (!chatMsg.trim() || sendMsg.isPending) ? 0.5 : 1,
                padding: '8px 12px', flexShrink: 0,
              }}
            >
              {sendMsg.isPending ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={12} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Schedule picker ───────────────────────────────────────────────── */}
      {showSchedule && (
        <div style={{
          padding: '8px 12px', borderTop: '1px solid #1a1a1a',
          background: '#0d0d0d', display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <input
            type="datetime-local"
            value={scheduleDate}
            onChange={e => setScheduleDate(e.target.value)}
            style={{
              flex: 1, height: 30, background: '#1a1a1a', border: '1px solid #333',
              borderRadius: 6, color: 'var(--t)', fontSize: 11, padding: '0 8px',
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button
            onClick={saveSchedule}
            disabled={!scheduleDate}
            style={{ ...S.btnNeon, padding: '4px 10px', fontSize: 11, opacity: scheduleDate ? 1 : 0.5 }}
          >
            Salvar
          </button>
          <button
            onClick={() => setShowSchedule(false)}
            style={{ ...S.btnGhost, padding: '4px 8px', fontSize: 11 }}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 5, padding: '8px 12px',
        borderTop: '1px solid #1a1a1a', flexShrink: 0, background: '#0d0d0d',
      }}>
        <button
          onClick={() => setTab('chat')}
          style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', fontSize: 11 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#25D366'; e.currentTarget.style.color = '#25D366' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#9a9a9a' }}
        >
          <MessageSquare size={12} /> WhatsApp
        </button>
        <button
          onClick={() => {
            const existing = lead.next_followup_at
            if (existing) setScheduleDate(existing.slice(0, 16))
            setShowSchedule(v => !v)
          }}
          style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', fontSize: 11 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#3df710'; e.currentTarget.style.color = '#3df710' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#222'; e.currentTarget.style.color = '#9a9a9a' }}
        >
          <Calendar size={12} /> {lead.next_followup_at ? 'Reagendar' : 'Agendar'}
        </button>
        {nextStage ? (
          <button
            onClick={() => moveStage(nextStage.id)}
            style={{ ...S.btnNeon, flex: 1, justifyContent: 'center', fontSize: 11 }}
          >
            <ChevronRight size={12} /> Avançar
          </button>
        ) : (
          <button
            onClick={() => toast.info('Lead já está na etapa final')}
            style={{ ...S.btnGhost, flex: 1, justifyContent: 'center', fontSize: 11, opacity: .5 }}
          >
            <Zap size={12} /> Final
          </button>
        )}
      </div>
    </div>
  )
}
