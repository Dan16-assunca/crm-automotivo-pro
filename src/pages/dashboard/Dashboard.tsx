import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, TrendingUp, DollarSign, Flame, AlertCircle,
  ArrowUpRight, ArrowDownRight, MessageSquare, Edit2,
  LayoutDashboard, Eye, EyeOff, X as XIcon, Check, Bell,
  Plus, GripVertical, Trash2, Settings2, Activity, ChevronRight,
} from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency, timeAgo, computeDaysInStock } from '@/utils/format'
import type { Lead } from '@/types'
import {
  type DashWidget, type WidgetData, type WidgetType,
  resolveWidget, getWidgetLabel, loadWidgets, saveWidgets,
  WIDGET_CATALOG, CATEGORY_LABELS, DEFAULT_WIDGETS,
} from './widgetSystem'

// ─── Period filter ─────────────────────────────────────────────────────────────
type Period = '7d' | '30d' | '90d' | 'month' | 'year' | 'all'

function getPeriodDates(period: Period): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  if (period === '7d')    from.setDate(to.getDate() - 7)
  else if (period === '30d')   from.setDate(to.getDate() - 30)
  else if (period === '90d')   from.setDate(to.getDate() - 90)
  else if (period === 'month') from.setDate(1)
  else if (period === 'year')  { from.setMonth(0); from.setDate(1) }
  else                         from.setFullYear(2000)
  return { from: from.toISOString(), to: to.toISOString() }
}

// ─── Color options for custom widget ──────────────────────────────────────────
const CUSTOM_COLORS = [
  { label: 'Verde',    rgb: '61,247,16',   value: 'var(--neon)' },
  { label: 'Azul',     rgb: '59,130,246',  value: 'var(--blu)'  },
  { label: 'Roxo',     rgb: '168,85,247',  value: 'var(--pur)'  },
  { label: 'Laranja',  rgb: '249,115,22',  value: 'var(--ora)'  },
  { label: 'Vermelho', rgb: '244,63,94',   value: 'var(--red)'  },
  { label: 'Amarelo',  rgb: '234,179,8',   value: 'var(--yel)'  },
  { label: 'Teal',     rgb: '20,184,166',  value: 'var(--teal)' },
  { label: 'Rosa',     rgb: '236,72,153',  value: 'var(--pink)' },
]

// ─── Sortable widget row (inside editor) ──────────────────────────────────────
function SortableWidgetItem({
  widget, onRemove,
}: { widget: DashWidget; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: widget.id })
  const entry = WIDGET_CATALOG.find(c => c.type === widget.type)
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform), transition,
        opacity: isDragging ? 0.4 : 1,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 10px', borderRadius: 8,
        background: 'var(--el)', border: '1px solid var(--bs)',
        cursor: 'default',
      }}
    >
      <div
        {...attributes} {...listeners}
        style={{ cursor: 'grab', color: 'var(--t3)', flexShrink: 0, display: 'flex', minHeight: 'unset' }}
      >
        <GripVertical size={14} />
      </div>
      <span style={{ fontSize: 15, flexShrink: 0 }}>{entry?.emoji ?? '⚙️'}</span>
      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {getWidgetLabel(widget)}
      </span>
      <button
        onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', padding: 4, flexShrink: 0, minHeight: 'unset', borderRadius: 4 }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ─── Widget Editor Panel ───────────────────────────────────────────────────────
function WidgetEditorPanel({
  widgets, onSave, onClose,
}: { widgets: DashWidget[]; onSave: (w: DashWidget[]) => void; onClose: () => void }) {
  const [local, setLocal] = useState<DashWidget[]>(widgets)
  const [customLabel, setCustomLabel]     = useState('')
  const [customValue, setCustomValue]     = useState('')
  const [customSub,   setCustomSub]       = useState('')
  const [customColor, setCustomColor]     = useState('var(--pur)')
  const [showCustomForm, setShowCustomForm] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setLocal(items => {
        const oldIdx = items.findIndex(i => i.id === active.id)
        const newIdx = items.findIndex(i => i.id === over.id)
        return arrayMove(items, oldIdx, newIdx)
      })
    }
  }

  const addWidget = (type: WidgetType) => {
    if (local.some(w => w.type === type)) return
    setLocal(prev => [...prev, { id: `w${Date.now()}`, type }])
  }

  const addCustom = () => {
    if (!customLabel.trim() || !customValue.trim()) return
    setLocal(prev => [...prev, {
      id: `w${Date.now()}`, type: 'custom',
      label: customLabel, customValue, customSub, customColor,
    }])
    setCustomLabel(''); setCustomValue(''); setCustomSub('')
    setShowCustomForm(false)
  }

  const removeWidget = (id: string) => setLocal(prev => prev.filter(w => w.id !== id))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(3px)' }}
      />
      {/* Panel */}
      <motion.div
        initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }}
        transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 380,
          background: 'var(--card)', borderLeft: '1px solid var(--b)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '-8px 0 32px rgba(0,0,0,.5)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px', borderBottom: '1px solid var(--bs)', flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>Editar Métricas</p>
            <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              Arraste para reordenar · clique para adicionar
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 4, minHeight: 'unset' }}
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Active widgets */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
              Métricas ativas ({local.length})
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={local.map(w => w.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {local.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>
                      Nenhuma métrica selecionada
                    </p>
                  ) : local.map(w => (
                    <SortableWidgetItem key={w.id} widget={w} onRemove={() => removeWidget(w.id)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Catalog */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
              Adicionar métricas
            </p>
            {Object.entries(CATEGORY_LABELS).map(([cat, catLabel]) => {
              const catEntries = WIDGET_CATALOG.filter(c => c.category === cat && c.type !== 'custom')
              if (!catEntries.length) return null
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {catLabel}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {catEntries.map(entry => {
                      const isAdded = local.some(w => w.type === entry.type)
                      return (
                        <button
                          key={entry.type}
                          onClick={() => addWidget(entry.type)}
                          disabled={isAdded}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 7,
                            cursor: isAdded ? 'default' : 'pointer',
                            background: isAdded ? 'var(--el)' : 'var(--surf)',
                            border: `1px solid ${isAdded ? 'var(--neon-card)' : 'var(--bs)'}`,
                            opacity: isAdded ? 0.6 : 1,
                            transition: 'all .12s', textAlign: 'left', width: '100%',
                            minHeight: 'unset',
                          }}
                        >
                          <span style={{ fontSize: 16, flexShrink: 0 }}>{entry.emoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', lineHeight: 1.2 }}>{entry.label}</p>
                            <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.desc}</p>
                          </div>
                          {isAdded
                            ? <Check size={13} style={{ color: 'var(--neon)', flexShrink: 0 }} />
                            : <Plus  size={13} style={{ color: 'var(--t3)',  flexShrink: 0 }} />
                          }
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Custom metric */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Personalizado
              </p>
              {!showCustomForm ? (
                <button
                  onClick={() => setShowCustomForm(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                    background: 'var(--surf)', border: '1px dashed var(--b)',
                    transition: 'all .12s', minHeight: 'unset',
                  }}
                >
                  <span style={{ fontSize: 16 }}>⚙️</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>Métrica Personalizada</p>
                    <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>Defina seu próprio indicador</p>
                  </div>
                  <Plus size={13} style={{ color: 'var(--t3)' }} />
                </button>
              ) : (
                <div style={{ background: 'var(--surf)', border: '1px solid var(--b)', borderRadius: 8, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    placeholder="Nome (ex: CAC)"
                    value={customLabel}
                    onChange={e => setCustomLabel(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: 12, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 6, color: 'var(--t)', outline: 'none' }}
                  />
                  <input
                    placeholder="Valor (ex: R$ 230 ou 4,5%)"
                    value={customValue}
                    onChange={e => setCustomValue(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: 12, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 6, color: 'var(--t)', outline: 'none' }}
                  />
                  <input
                    placeholder="Subtítulo (ex: custo por aquisição)"
                    value={customSub}
                    onChange={e => setCustomSub(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: 12, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 6, color: 'var(--t)', outline: 'none' }}
                  />
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 6 }}>Cor do valor</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {CUSTOM_COLORS.map(c => (
                        <button
                          key={c.value} onClick={() => setCustomColor(c.value)} title={c.label}
                          style={{
                            width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                            background: `rgb(${c.rgb})`,
                            border: customColor === c.value ? '2.5px solid var(--t)' : '2px solid transparent',
                            minHeight: 'unset', flexShrink: 0,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <button
                      onClick={() => setShowCustomForm(false)}
                      style={{ flex: 1, padding: '7px 0', fontSize: 12, borderRadius: 6, cursor: 'pointer', background: 'transparent', border: '1px solid var(--b)', color: 'var(--t2)', minHeight: 'unset' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={addCustom}
                      disabled={!customLabel.trim() || !customValue.trim()}
                      style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer', background: 'var(--ng)', border: '1px solid var(--nb)', color: 'var(--neon)', minHeight: 'unset', opacity: (!customLabel.trim() || !customValue.trim()) ? 0.4 : 1 }}
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--bs)', flexShrink: 0, display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '9px 0', fontSize: 13, borderRadius: 7, cursor: 'pointer', background: 'transparent', border: '1px solid var(--b)', color: 'var(--t2)', minHeight: 'unset' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => { onSave(local); onClose() }}
            style={{ flex: 2, padding: '9px 0', fontSize: 13, fontWeight: 700, borderRadius: 7, cursor: 'pointer', background: 'var(--neon)', border: 'none', color: '#000', minHeight: 'unset' }}
          >
            Salvar alterações
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surf)', border: '1px solid var(--b)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: 'var(--shadow-md)',
    }}>
      <p style={{ color: 'var(--t2)', marginBottom: 6, fontWeight: 600, fontSize: 11 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color, fontWeight: 700, fontSize: 12 }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? formatCurrency(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

// ─── Stat row item ─────────────────────────────────────────────────────────────
function StatRow({ label, value, color = 'var(--t)' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--bs)' }}>
      <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--fm)', color }}>{value}</span>
    </div>
  )
}

// ─── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      {Icon && <Icon size={12} style={{ color: 'var(--t2)' }} />}
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {children}
      </p>
    </div>
  )
}

// ─── Greeting helper ──────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { openLeadPanel } = useLeadPanelStore()
  const { store, user, isLoading: authLoading } = useAuthStore()
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const storeId = store?.id ?? ''

  const [editMode, setEditMode] = useState(false)
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('dashboard-hidden')
      return new Set(saved ? JSON.parse(saved) as string[] : [])
    } catch { return new Set<string>() }
  })
  const toggleSection = useCallback((id: string) => {
    setHiddenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      localStorage.setItem('dashboard-hidden', JSON.stringify([...next]))
      return next
    })
  }, [])
  const vis = (id: string) => !hiddenSections.has(id)

  // ── Widget state ──
  const [widgets, setWidgets] = useState<DashWidget[]>(DEFAULT_WIDGETS)
  const [showWidgetEditor, setShowWidgetEditor] = useState(false)

  useEffect(() => {
    if (storeId) setWidgets(loadWidgets(storeId))
  }, [storeId])

  const saveAndSetWidgets = useCallback((newWidgets: DashWidget[]) => {
    setWidgets(newWidgets)
    if (storeId) saveWidgets(storeId, newWidgets)
  }, [storeId])

  const { from, to } = useMemo(() => {
    if (customFrom && customTo) return { from: new Date(customFrom).toISOString(), to: new Date(customTo + 'T23:59:59').toISOString() }
    return getPeriodDates(period)
  }, [period, customFrom, customTo])

  // ── Pipeline stages ──
  const { data: stages } = useQuery({
    queryKey: ['pipeline-stages', storeId],
    queryFn: async () => {
      const { data } = await supabase.from('pipeline_stages').select('*').eq('store_id', storeId).order('position')
      return data ?? []
    },
    enabled: !!storeId,
  })

  // ── Funnel KPIs: single query, aggregate by stage in JS ──
  const { data: funnelCounts, isLoading: funnelLoading } = useQuery({
    queryKey: ['funnel-kpis', storeId, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('stage_id')
        .eq('store_id', storeId).gte('created_at', from).lte('created_at', to)
      const results: Record<string, number> = {}
      data?.forEach(l => { results[l.stage_id] = (results[l.stage_id] ?? 0) + 1 })
      return results
    },
    enabled: !!storeId,
  })

  // ── KPIs (extended with status + temperature) ──
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis', storeId, from, to],
    queryFn: async () => {
      const [allLeads, wonLeads] = await Promise.all([
        supabase.from('leads').select('id, won_value, status, temperature', { count: 'exact' })
          .eq('store_id', storeId).gte('created_at', from).lte('created_at', to),
        supabase.from('leads').select('won_value')
          .eq('store_id', storeId).eq('status', 'won')
          .gte('updated_at', from).lte('updated_at', to),
      ])
      const totalLeads  = allLeads.count ?? 0
      const leadsData   = allLeads.data ?? []
      const wonCount    = wonLeads.data?.length ?? 0
      const revenue     = (wonLeads.data ?? []).reduce((s, l) => s + (l.won_value ?? 0), 0)
      const convRate    = totalLeads > 0 ? (wonCount / totalLeads) * 100 : 0
      const avgTicket   = wonCount > 0 ? revenue / wonCount : 0
      const lostCount   = leadsData.filter(l => l.status === 'lost').length
      const activeCount = leadsData.filter(l => l.status === 'active').length
      const hotCount    = leadsData.filter(l => l.temperature === 'hot').length
      const warmCount   = leadsData.filter(l => l.temperature === 'warm').length
      const coldCount   = leadsData.filter(l => l.temperature === 'cold').length
      return { totalLeads, wonCount, revenue, convRate, avgTicket, lostCount, activeCount, hotCount, warmCount, coldCount }
    },
    enabled: !!storeId,
  })

  // ── Monthly evolution (6 months) ──
  const { data: monthlyData } = useQuery({
    queryKey: ['monthly-evolution', storeId],
    queryFn: async () => {
      const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6); cutoff.setDate(1)
      const { data } = await supabase.from('leads')
        .select('created_at, status, won_value, updated_at')
        .eq('store_id', storeId).gte('created_at', cutoff.toISOString())
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i))
        return { label: d.toLocaleString('pt-BR', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() }
      })
      return months.map(m => {
        const mLeads = data?.filter(l => {
          const d = new Date(l.created_at)
          return d.getFullYear() === m.year && d.getMonth() === m.month
        }) ?? []
        const wonInMonth = data?.filter(l => {
          if (l.status !== 'won') return false
          const d = new Date(l.updated_at)
          return d.getFullYear() === m.year && d.getMonth() === m.month
        }) ?? []
        const faturamento = wonInMonth.reduce((s, l) => s + (l.won_value ?? 0), 0)
        return { name: m.label, leads: mLeads.length, faturamento, lucro: faturamento * 0.12 }
      })
    },
    enabled: !!storeId,
  })

  // ── Leads per day (last 14 days) ──
  const { data: leadsPerDay } = useQuery({
    queryKey: ['leads-per-day', storeId],
    queryFn: async () => {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 13); cutoff.setHours(0, 0, 0, 0)
      const { data } = await supabase.from('leads').select('created_at')
        .eq('store_id', storeId).gte('created_at', cutoff.toISOString())
      const days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (13 - i)); d.setHours(0, 0, 0, 0)
        const key = d.toDateString()
        const count = data?.filter(l => new Date(l.created_at).toDateString() === key).length ?? 0
        return { name: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), leads: count }
      })
      return days
    },
    enabled: !!storeId,
  })

  // ── Source breakdown ──
  const { data: sourceData } = useQuery({
    queryKey: ['source-breakdown', storeId, from, to],
    queryFn: async () => {
      const { data } = await supabase.from('leads').select('source').eq('store_id', storeId)
        .gte('created_at', from).lte('created_at', to).not('source', 'is', null)
      const counts: Record<string, number> = {}
      data?.forEach(l => { counts[l.source!] = (counts[l.source!] ?? 0) + 1 })
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    },
    enabled: !!storeId,
  })

  // ── Stock by brand avg days ──
  const { data: stockGiro } = useQuery({
    queryKey: ['stock-giro', storeId],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('brand, purchase_date').eq('store_id', storeId)
      const grouped: Record<string, number[]> = {}
      data?.forEach(v => {
        if (!grouped[v.brand]) grouped[v.brand] = []
        grouped[v.brand].push(computeDaysInStock(v.purchase_date))
      })
      return Object.entries(grouped).map(([brand, days]) => ({
        name: brand,
        avg: Math.round(days.reduce((s, d) => s + d, 0) / days.length),
      })).slice(0, 6)
    },
    enabled: !!storeId,
  })

  // ── Follow-ups urgentes ──
  const { data: followUps } = useQuery({
    queryKey: ['followups-urgent', storeId],
    queryFn: async () => {
      const now = new Date()
      const { data } = await supabase.from('leads').select('id, client_name, vehicle_interest, next_followup_at, created_at')
        .eq('store_id', storeId).eq('status', 'active')
        .not('next_followup_at', 'is', null)
        .order('next_followup_at', { ascending: true }).limit(5)
      return (data ?? []).map(l => ({
        ...l,
        overdue: l.next_followup_at ? new Date(l.next_followup_at) < now : false,
        isToday: l.next_followup_at ? new Date(l.next_followup_at).toDateString() === now.toDateString() : false,
      }))
    },
    enabled: !!storeId,
  })

  // ── Vendor ranking ──
  const { data: vendorRanking } = useQuery({
    queryKey: ['vendor-ranking', storeId, from, to],
    queryFn: async () => {
      const [{ data: teamData }, { data: wonLeads }, { data: goals }] = await Promise.all([
        supabase.from('users').select('id, full_name').eq('store_id', storeId),
        supabase.from('leads').select('salesperson_id')
          .eq('store_id', storeId).eq('status', 'won')
          .gte('updated_at', from).lte('updated_at', to),
        supabase.from('sales_goals').select('salesperson_id, goal_units').eq('store_id', storeId),
      ])
      if (!teamData?.length) return []
      return teamData.map(v => ({
        id: v.id,
        name: v.full_name,
        initials: v.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase(),
        won: wonLeads?.filter(l => l.salesperson_id === v.id).length ?? 0,
        goal: goals?.find(g => g.salesperson_id === v.id)?.goal_units ?? 0,
      })).sort((a, b) => b.won - a.won)
    },
    enabled: !!storeId,
  })

  // ── Lead alerts ──
  const { data: leadAlerts } = useQuery({
    queryKey: ['lead-alerts', storeId],
    queryFn: async () => {
      const { data } = await supabase.from('lead_alerts')
        .select('id, lead_id, type, title, message, severity, expires_at, leads(client_name)')
        .eq('store_id', storeId)
        .gt('expires_at', new Date().toISOString())
        .order('severity', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(8)
      return (data ?? []) as unknown as Array<{
        id: string; lead_id: string; type: string; title: string; message: string;
        severity: string; expires_at: string; leads: { client_name: string } | null
      }>
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })

  // ── Financial metrics ──
  const { data: finMetrics } = useQuery({
    queryKey: ['fin-metrics', storeId],
    queryFn: async () => {
      const { data } = await supabase.from('stores').select('settings').eq('id', storeId).single()
      const settings = (data?.settings as Record<string, number>) ?? {}
      return {
        marginPct:  settings.gross_margin_pct  ?? 0,
        fixedCost:  settings.monthly_fixed_cost ?? 0,
        breakeven:  settings.breakeven_units    ?? 0,
      }
    },
    enabled: !!storeId,
  })

  // ── Revenue Engine summary ──
  const { data: revLeads } = useQuery({
    queryKey: ['dash-rev-leads', storeId],
    enabled: !!storeId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, temperature, stage_id, budget_min, budget_max, won_value, score, client_name, vehicle_interest, created_at')
        .eq('store_id', storeId)
        .eq('status', 'active')
      return data ?? []
    },
  })

  const revSummary = useMemo(() => {
    const WIN_PROB: Record<number, number> = { 0: 0.06, 1: 0.15, 2: 0.30, 3: 0.50, 4: 0.70, 5: 0.85, 6: 0.92 }
    const DEFAULT_TICKET = 45_000
    const fmtR = (v: number) => v >= 1_000_000 ? `R$ ${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `R$ ${(v / 1_000).toFixed(0)}k` : `R$ ${v.toFixed(0)}`
    if (!revLeads || !stages) return { expected: 0, totalPipeline: 0, hot: 0, warm: 0, cold: 0, topLeads: [], fmtR }
    let expected = 0, totalPipeline = 0, hot = 0, warm = 0, cold = 0
    const enriched = revLeads.map(l => {
      const stage = stages.find(s => s.id === l.stage_id)
      if (!stage || stage.is_final) return { ...l, expectedValue: 0, prob: 0 }
      const prob = WIN_PROB[Math.min(stage.position, 6)] ?? 0.92
      const val = l.budget_max ?? l.budget_min ?? l.won_value ?? DEFAULT_TICKET
      expected += prob * val
      totalPipeline += val
      if (l.temperature === 'hot') hot++
      else if (l.temperature === 'warm') warm++
      else cold++
      return { ...l, expectedValue: prob * val, prob }
    })
    const topLeads = enriched
      .filter(l => l.expectedValue > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 3)
    return { expected, totalPipeline, hot, warm, cold, topLeads, fmtR }
  }, [revLeads, stages])

  // ── Derived data ──
  const funnelBarData = useMemo(() => {
    if (!stages || !funnelCounts) return []
    return stages.filter(s => !s.is_final).map(s => ({
      name: s.name.length > 8 ? s.name.slice(0, 8) + '.' : s.name,
      value: funnelCounts[s.id] ?? 0,
    }))
  }, [stages, funnelCounts])

  const widgetData: WidgetData = useMemo(() => ({
    totalLeads:  kpis?.totalLeads  ?? 0,
    wonCount:    kpis?.wonCount    ?? 0,
    lostCount:   kpis?.lostCount   ?? 0,
    activeCount: kpis?.activeCount ?? 0,
    hotCount:    kpis?.hotCount    ?? 0,
    warmCount:   kpis?.warmCount   ?? 0,
    coldCount:   kpis?.coldCount   ?? 0,
    revenue:     kpis?.revenue     ?? 0,
    convRate:    kpis?.convRate    ?? 0,
    avgTicket:   kpis?.avgTicket   ?? 0,
    overdueFollowups: followUps?.filter(f => f.overdue).length  ?? 0,
    todaysFollowups:  followUps?.filter(f => f.isToday).length  ?? 0,
    alertsCount: leadAlerts?.length ?? 0,
  }), [kpis, followUps, leadAlerts])

  const pills: { label: string; val: Period }[] = [
    { label: 'Este mês', val: 'month' }, { label: '7 dias', val: '7d' },
    { label: '30 dias',  val: '30d' },  { label: '90 dias', val: '90d' },
    { label: 'Este ano', val: 'year' },  { label: 'Tudo',    val: 'all' },
  ]

  const CHART_COLORS = [
    '#3DF710',
    'rgba(61,247,16,.70)',
    'rgba(255,255,255,.75)',
    'rgba(61,247,16,.42)',
    'rgba(255,255,255,.45)',
    'rgba(61,247,16,.22)',
    'rgba(255,255,255,.25)',
    'rgba(61,247,16,.12)',
  ]

  if (!authLoading && !storeId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
        <AlertCircle size={32} style={{ color: 'var(--red)', opacity: 0.7 }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>Loja não encontrada</p>
        <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', maxWidth: 340 }}>
          userId: <code style={{ color: 'var(--neon)', fontSize: 11 }}>{user?.id ?? 'não autenticado'}</code>
        </p>
      </div>
    )
  }

  // ── Mobile Dashboard ──────────────────────────────────────────────────────────
  if (isMobile) {
    const overdueCount = followUps?.filter(f => f.overdue).length ?? 0

    return (
      <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 19, fontWeight: 800, color: 'var(--t)', letterSpacing: '-.02em', lineHeight: 1.2 }}>
              {getGreeting()}, {user?.full_name?.split(' ')[0] ?? 'vendedor'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {store?.name}
            </p>
          </div>
          <button
            onClick={() => setShowWidgetEditor(true)}
            style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--el)', border: '1px solid var(--b)', cursor: 'pointer',
              color: 'var(--t2)', minHeight: 'unset', marginLeft: 10,
            }}
          >
            <Settings2 size={17} />
          </button>
        </div>

        {/* ── Período ── */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {pills.map(p => {
            const active = period === p.val && !customFrom
            return (
              <button key={p.val} onClick={() => { setPeriod(p.val); setCustomFrom(''); setCustomTo('') }}
                style={{
                  flexShrink: 0, height: 32, padding: '0 14px', fontSize: 12, fontWeight: active ? 700 : 500,
                  borderRadius: 16, cursor: 'pointer', border: 'none',
                  background: active ? 'var(--neon)' : 'var(--el)',
                  color: active ? '#000' : 'var(--t3)',
                  transition: 'all .15s',
                }}>
                {p.label}
              </button>
            )
          })}
        </div>

        {/* ── KPI hero ── */}
        {kpisLoading ? (
          <Skeleton style={{ height: 96, borderRadius: 16 }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              background: 'var(--ng)', border: '1px solid var(--nb)',
              borderRadius: 18, padding: '18px 20px',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
            }}>
              <div style={{ borderRight: '1px solid var(--nb)', paddingRight: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: '.08em', opacity: .7 }}>Faturamento</p>
                <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--neon)', marginTop: 4, lineHeight: 1, letterSpacing: '-.02em' }}>
                  {kpis ? formatCurrency(kpis.revenue) : '—'}
                </p>
              </div>
              <div style={{ paddingLeft: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Conversão</p>
                <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--t)', marginTop: 4, lineHeight: 1, letterSpacing: '-.02em' }}>
                  {(kpis?.convRate ?? 0).toFixed(1)}%
                </p>
              </div>
            </div>
            {/* Revenue Engine card — mobile */}
            <div
              onClick={() => navigate('/receita')}
              style={{
                background: 'var(--card)', border: '1px solid var(--nb)', borderRadius: 14,
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer',
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Activity size={14} style={{ color: 'var(--neon)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 1 }}>Receita Esperada · Girard Engine</p>
                <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--neon)', fontFamily: 'var(--fm)', lineHeight: 1 }}>
                  {revSummary.fmtR(revSummary.expected)}
                </p>
                <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2 }}>
                  🔥 {revSummary.hot} quentes · ⚡ {revSummary.warm} mornos · de {revSummary.fmtR(revSummary.totalPipeline)} em carteira
                </p>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--neon)', flexShrink: 0 }} />
            </div>
          </div>
        )}

        {/* ── KPI widget cards (personalizáveis) ── */}
        {kpisLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[...Array(widgets.length || 4)].map((_, i) => <Skeleton key={i} style={{ height: 80, borderRadius: 14 }} />)}
          </div>
        ) : widgets.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {widgets.map(widget => {
              const resolved = resolveWidget(widget, widgetData)
              const label = getWidgetLabel(widget)
              return (
                <div key={widget.id} style={{
                  background: 'var(--card)', border: '1px solid var(--neon-card)',
                  borderRadius: 14, padding: '14px', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: resolved.color, opacity: 0.7 }} />
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: resolved.color, marginTop: 6, lineHeight: 1, letterSpacing: '-.02em' }}>
                    {resolved.value}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>{resolved.sub}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Alertas de Leads ── */}
        {leadAlerts && leadAlerts.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--neon-card)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px 10px', borderBottom: '1px solid var(--bs)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bell size={13} style={{ color: 'var(--neon)' }} />
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Alertas IA
                </p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#000', background: 'var(--neon)', padding: '3px 8px', borderRadius: 20 }}>
                {leadAlerts.length}
              </span>
            </div>
            {leadAlerts.slice(0, 5).map((alert, idx) => {
              const severityColor = alert.severity === 'critical' ? 'var(--neon)'
                : alert.severity === 'warning' ? 'rgba(61,247,16,.72)'
                : alert.severity === 'attention' ? 'rgba(61,247,16,.5)'
                : 'rgba(61,247,16,.38)'
              return (
                <div
                  key={alert.id}
                  onClick={() => alert.lead_id ? openLeadPanel(alert.lead_id) : navigate('/pipeline')}
                  style={{
                    padding: '10px 14px',
                    borderBottom: idx < Math.min(leadAlerts.length, 5) - 1 ? '1px solid var(--bs)' : 'none',
                    borderLeft: `3px solid ${severityColor}`,
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: severityColor }}>{alert.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3, lineHeight: 1.3 }}>{alert.message}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Follow-ups urgentes ── */}
        {followUps && followUps.length > 0 && (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--neon-card)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px 10px',
              borderBottom: '1px solid var(--bs)',
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Follow-ups
              </p>
              {overdueCount > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800, color: '#000',
                  background: 'var(--neon)', padding: '3px 8px', borderRadius: 20,
                }}>
                  {overdueCount} atrasado{overdueCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {followUps.slice(0, 5).map((f, idx) => (
              <div
                key={f.id}
                onClick={() => openLeadPanel(f.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px',
                  borderBottom: idx < Math.min(followUps.length, 5) - 1 ? '1px solid var(--bs)' : 'none',
                  background: f.overdue ? 'rgba(61,247,16,.03)' : 'transparent',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--ng)',
                  border: `1px solid ${f.overdue ? 'var(--neon)' : 'var(--nb)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: 'var(--neon)',
                }}>
                  {f.client_name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.client_name}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {f.vehicle_interest ?? 'Sem veículo'}
                  </p>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, flexShrink: 0, padding: '4px 10px', borderRadius: 20,
                  background: f.overdue ? 'var(--ng)' : f.isToday ? 'var(--ng)' : 'var(--el)',
                  color: f.overdue ? 'var(--neon)' : f.isToday ? 'var(--neon)' : 'var(--t3)',
                  minHeight: 'unset',
                }}>
                  {f.overdue ? 'ATRASADO' : f.isToday ? 'HOJE' : timeAgo(f.next_followup_at!)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Funil Comercial ── */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
            Funil Comercial
          </p>
          {(() => {
            const nonFinal = stages?.filter(s => !s.is_final) ?? []
            return (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
                {funnelLoading || !stages ? [...Array(5)].map((_, i) => (
                  <Skeleton key={i} style={{ height: 90, width: 110, flexShrink: 0, borderRadius: 14 }} />
                )) : nonFinal.map((stage, i) => {
                  const count = funnelCounts?.[stage.id] ?? 0
                  const prevCount = i > 0 ? (funnelCounts?.[nonFinal[i-1]?.id] ?? 0) : 0
                  const convPct = i > 0 && prevCount > 0 ? Math.round((count / prevCount) * 100) : null
                  return (
                    <div
                      key={stage.id}
                      onClick={() => navigate('/pipeline')}
                      style={{
                        flexShrink: 0, width: 110,
                        background: 'var(--card)', border: '1px solid var(--neon-card)', borderRadius: 14,
                        padding: '12px 14px', position: 'relative', overflow: 'hidden',
                        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--neon)' }} />
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stage.name}
                      </p>
                      <p style={{ fontSize: 30, fontWeight: 900, color: 'var(--t)', lineHeight: 1.15, marginTop: 4, letterSpacing: '-.02em' }}>
                        {count}
                      </p>
                      {convPct !== null && (
                        <p style={{ fontSize: 10, color: 'var(--neon)', marginTop: 2, fontWeight: 600 }}>{convPct}% conv.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

        {/* ── Leads por dia ── */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--neon-card)', borderRadius: 16, padding: '14px 4px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px 10px' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Leads por dia</p>
            <span style={{ fontSize: 11, color: 'var(--t2)' }}>14 dias</span>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={leadsPerDay ?? []} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="lgm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--neon)" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="var(--neon)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bs)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--t2)', fontSize: 10 }} axisLine={false} tickLine={false} interval={3} />
              <YAxis tick={{ fill: 'var(--t2)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="leads" name="Leads" stroke="var(--neon)" strokeWidth={2.5}
                fill="url(#lgm)" dot={{ fill: 'var(--neon)', r: 2.5, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── Ranking vendedores ── */}
        {!!vendorRanking?.length && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--neon-card)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--bs)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>Ranking de vendedores</p>
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>Mês atual</span>
            </div>
            {vendorRanking.map((v, i) => (
              <div key={v.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                borderBottom: i < vendorRanking.length - 1 ? '1px solid var(--bs)' : 'none',
                background: i === 0 ? 'var(--ng)' : 'transparent',
              }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: i === 0 ? 'var(--neon)' : 'var(--t3)', width: 20, flexShrink: 0, textAlign: 'center' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                </span>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: i === 0 ? 'rgba(61,247,16,.2)' : 'var(--el)',
                  border: `1px solid ${i === 0 ? 'var(--nb)' : 'var(--b)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: i === 0 ? 'var(--neon)' : 'var(--t2)',
                }}>
                  {v.initials}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{v.name.split(' ')[0]}</p>
                </div>
                <span style={{ fontSize: 13, fontFamily: 'var(--fm)', color: i === 0 ? 'var(--neon)' : 'var(--t2)', fontWeight: 700 }}>
                  {v.won}<span style={{ color: 'var(--t3)', fontWeight: 400 }}>/{v.goal || '—'}</span>
                </span>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Widget editor (mobile) */}
      {showWidgetEditor && (
        <WidgetEditorPanel
          widgets={widgets}
          onSave={saveAndSetWidgets}
          onClose={() => setShowWidgetEditor(false)}
        />
      )}
      </>
    )
  }

  // ── Desktop Dashboard ─────────────────────────────────────────────────────────
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Header + period filter ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Dashboard</h1>
            <p style={{ fontSize: 12, color: 'var(--t2)', marginTop: 1 }}>{store?.name}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {pills.map(p => {
              const active = period === p.val && !customFrom
              return (
                <button key={p.val} onClick={() => { setPeriod(p.val); setCustomFrom(''); setCustomTo('') }}
                  style={{
                    padding: '5px 13px', fontSize: 12, fontWeight: active ? 700 : 500,
                    borderRadius: 20, cursor: 'pointer',
                    border: '1px solid ' + (active ? 'var(--nb)' : 'var(--b)'),
                    background: active ? 'var(--ng)' : 'transparent',
                    color: active ? 'var(--neon)' : 'var(--t2)',
                    transition: 'all .12s',
                  }}>
                  {p.label}
                </button>
              )
            })}
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ height: 30, padding: '0 8px', fontSize: 12, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 6, color: 'var(--t)', outline: 'none' }} />
            <span style={{ color: 'var(--t2)', fontSize: 13 }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ height: 30, padding: '0 8px', fontSize: 12, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 6, color: 'var(--t)', outline: 'none' }} />
            <button
              onClick={() => setEditMode(v => !v)}
              style={{
                height: 30, padding: '0 13px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                border: `1px solid ${editMode ? 'var(--neon)' : 'var(--b)'}`,
                background: editMode ? 'var(--ng)' : 'var(--el)',
                color: editMode ? 'var(--neon)' : 'var(--t)',
                transition: 'all .15s',
              }}
            >
              <LayoutDashboard size={12} />
              {editMode ? 'Concluir' : 'Personalizar'}
            </button>
          </div>
        </div>

        {/* ── Edit mode panel ── */}
        {editMode && (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--nb)',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--neon)', marginRight: 4 }}>
              Seções visíveis:
            </span>
            {[
              { id: 'funil',   label: 'Funil Comercial' },
              { id: 'kpis',   label: 'Métricas KPI' },
              { id: 'charts1', label: 'Faturamento / Funil' },
              { id: 'charts2', label: 'Leads / Origem / Estoque' },
              { id: 'alerts', label: 'Alertas de Leads' },
              { id: 'bottom', label: 'Follow-ups / Ranking / Financeiro' },
            ].map(s => {
              const visible = vis(s.id)
              return (
                <button key={s.id} onClick={() => toggleSection(s.id)} style={{
                  height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                  border: `1px solid ${visible ? 'var(--neon)' : 'var(--b)'}`,
                  background: visible ? 'var(--ng)' : 'transparent',
                  color: visible ? 'var(--neon)' : 'var(--t3)',
                  transition: 'all .12s',
                }}>
                  {visible ? <Eye size={11} /> : <EyeOff size={11} />}
                  {s.label}
                </button>
              )
            })}
            <button onClick={() => {
              setHiddenSections(new Set())
              localStorage.removeItem('dashboard-hidden')
            }} style={{
              height: 28, padding: '0 10px', borderRadius: 6, fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              border: '1px solid var(--b)', background: 'transparent', color: 'var(--t3)',
              marginLeft: 'auto',
            }}>
              <Check size={11} /> Mostrar tudo
            </button>
          </div>
        )}

        {/* ── Motor de Receita Banner ── */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--nb)',
          borderRadius: 12, padding: '16px 20px',
          boxShadow: '0 0 40px rgba(61,247,16,.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={13} style={{ color: 'var(--neon)' }} />
              </div>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                Motor de Receita · Girard Engine
              </p>
            </div>
            <button
              onClick={() => navigate('/receita')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--neon)', background: 'var(--ng)', border: '1px solid var(--nb)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}
            >
              Ver detalhes <ChevronRight size={12} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 10, alignItems: 'stretch' }}>
            {/* Receita esperada */}
            <div style={{ background: 'var(--ng)', border: '1px solid var(--nb)', borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Receita Esperada</p>
              <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--neon)', fontFamily: 'var(--fm)', lineHeight: 1 }}>
                {revSummary.fmtR(revSummary.expected)}
              </p>
              <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4 }}>de {revSummary.fmtR(revSummary.totalPipeline)} em carteira</p>
            </div>

            {/* Temperatura */}
            <div style={{ background: 'var(--el)', border: '1px solid var(--bs)', borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Temperatura</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  { label: '🔥 Quentes', count: revSummary.hot,  color: '#22c55e' },
                  { label: '⚡ Mornos',  count: revSummary.warm, color: '#eab308' },
                  { label: '❄️ Frios',   count: revSummary.cold, color: '#94a3b8' },
                ].map(t => (
                  <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)' }}>{t.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: t.color, fontFamily: 'var(--fm)' }}>{t.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top 3 Leads */}
            {revSummary.topLeads.slice(0, 3).map((l, i) => {
              const stage = stages?.find(s => s.id === l.stage_id)
              const tempColor = l.temperature === 'hot' ? '#22c55e' : l.temperature === 'warm' ? '#eab308' : '#94a3b8'
              return (
                <div key={l.id} style={{ background: 'var(--el)', border: `1px solid ${i === 0 ? 'var(--nb)' : 'var(--bs)'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }}
                  onClick={() => navigate('/leads')}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = i === 0 ? 'var(--nb)' : 'var(--bs)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--neon)', fontFamily: 'var(--fm)' }}>#{i + 1}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: tempColor, background: `${tempColor}18`, padding: '1px 5px', borderRadius: 6 }}>
                      {l.temperature === 'hot' ? '🔥' : l.temperature === 'warm' ? '⚡' : '❄️'}
                    </span>
                    {l.score > 0 && <span style={{ fontSize: 9, color: 'var(--t3)', marginLeft: 'auto' }}>Score {l.score}</span>}
                  </div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {l.client_name}
                  </p>
                  <p style={{ fontSize: 9, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.vehicle_interest ?? stage?.name ?? '—'}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--neon)', fontFamily: 'var(--fm)', marginTop: 4 }}>
                    {revSummary.fmtR(l.expectedValue)}
                  </p>
                </div>
              )
            })}

            {/* Fill empty slots if < 3 top leads */}
            {Array.from({ length: Math.max(0, 3 - revSummary.topLeads.length) }).map((_, i) => (
              <div key={`empty-${i}`} style={{ background: 'var(--el)', border: '1px dashed var(--b)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>Sem leads</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── BLOCO 1: Funil Comercial ── */}
        {vis('funil') && <div>
          <SectionLabel>Funil Comercial</SectionLabel>
          {(() => {
            const nonFinal = stages?.filter(s => !s.is_final) ?? []
            const cols = funnelLoading || !stages ? 5 : nonFinal.length || 1
            return (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
                {funnelLoading || !stages ? [...Array(5)].map((_, i) => (
                  <Skeleton key={i} style={{ height: 90, borderRadius: 9 }} />
                )) : nonFinal.map((stage, i) => {
                  const count = funnelCounts?.[stage.id] ?? 0
                  const prevCount = i > 0 ? (funnelCounts?.[nonFinal[i-1]?.id] ?? 0) : 0
                  const convPct = i > 0 && prevCount > 0 ? Math.round((count / prevCount) * 100) : null
                  const stageColor = 'var(--neon)'
                  return (
                    <motion.div key={stage.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                      <div style={{
                        background: 'var(--card)', border: '1px solid var(--neon-card)', borderRadius: 10,
                        padding: '14px 16px', position: 'relative', overflow: 'hidden', minWidth: 0,
                      }}>
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '10px 10px 0 0',
                          background: stageColor,
                        }} />
                        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {stage.name}
                        </p>
                        <p style={{ fontSize: 34, fontWeight: 900, color: 'var(--t)', lineHeight: 1.15, marginTop: 6, letterSpacing: '-.03em' }}>
                          {count}
                        </p>
                        {convPct !== null && (
                          <p style={{ fontSize: 11, color: 'var(--neon)', marginTop: 3, fontWeight: 600 }}>
                            {convPct}% conv.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )
          })()}
        </div>}

        {/* ── BLOCO 2: KPI Widgets (dinâmico) ── */}
        {vis('kpis') && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <SectionLabel icon={TrendingUp}>Métricas do Negócio</SectionLabel>
              <button
                onClick={() => setShowWidgetEditor(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 26, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid var(--b)',
                  background: 'var(--el)', color: 'var(--t2)', transition: 'all .12s',
                  minHeight: 'unset',
                }}
              >
                <Settings2 size={11} /> Editar métricas
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
              {kpisLoading
                ? [...Array(widgets.length || 6)].map((_, i) => (
                    <Skeleton key={i} style={{ height: 88, borderRadius: 10 }} />
                  ))
                : widgets.map((widget, i) => {
                    const resolved = resolveWidget(widget, widgetData)
                    const label = getWidgetLabel(widget)
                    return (
                      <motion.div key={widget.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                        <div style={{
                          background: 'var(--card)', border: '1px solid var(--neon-card)',
                          borderRadius: 10, padding: '14px 16px',
                          position: 'relative', overflow: 'hidden',
                        }}>
                          {/* Top accent line */}
                          <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '10px 10px 0 0',
                            background: resolved.color, opacity: 0.7,
                          }} />
                          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.06em', lineHeight: 1.3 }}>
                            {label}
                          </p>
                          <p style={{ fontSize: 22, fontWeight: 800, color: resolved.color, lineHeight: 1, letterSpacing: '-.02em', marginTop: 7 }} className="count-up">
                            {resolved.value}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>{resolved.sub}</p>
                        </div>
                      </motion.div>
                    )
                  })
              }
            </div>
          </div>
        )}

        {/* ── BLOCO 3: Gráficos linha 1 ── */}
        {vis('charts1') && <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12 }}>
          <Card glow>
            <CardHeader style={{ padding: '14px 16px 0' }}>
              <div>
                <CardTitle>Faturamento vs Lucro</CardTitle>
                <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                  {new Date().getFullYear()} · mensal
                </p>
              </div>
              <Badge variant="neon" dot>Atualizado</Badge>
            </CardHeader>
            <CardContent style={{ padding: '8px 8px 12px' }}>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={monthlyData ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bs)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} iconType="circle"
                    formatter={v => <span style={{ color: 'var(--t2)', fontSize: 11 }}>{v}</span>} />
                  <Bar dataKey="faturamento" name="Faturamento" fill="rgba(61,247,16,.45)" radius={[4,4,0,0]} />
                  <Bar dataKey="lucro"       name="Lucro"       fill="#3DF710" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card glow>
            <CardHeader style={{ padding: '14px 16px 0' }}>
              <CardTitle>Funil de Conversão</CardTitle>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Este mês</span>
            </CardHeader>
            <CardContent style={{ padding: '8px 8px 12px' }}>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={funnelBarData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bs)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--t)', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} width={68} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" name="Leads" fill="var(--neon)" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>}

        {/* ── BLOCO 4: Gráficos linha 2 ── */}
        {vis('charts2') && <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12 }}>
          <Card glow>
            <CardHeader style={{ padding: '14px 16px 0' }}>
              <CardTitle>Leads por dia</CardTitle>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Últimos 14 dias</span>
            </CardHeader>
            <CardContent style={{ padding: '8px 8px 12px' }}>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={leadsPerDay ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--neon)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--neon)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bs)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke="var(--neon)" strokeWidth={2.5}
                    fill="url(#lg)"
                    dot={{ fill: 'var(--neon)', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: 'var(--neon)' }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card glow>
            <CardHeader style={{ padding: '14px 16px 0' }}>
              <CardTitle>Origem dos leads</CardTitle>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Mês atual</span>
            </CardHeader>
            <CardContent style={{ padding: '4px 8px 12px' }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sourceData?.length ? sourceData : [{ name: 'Sem dados', value: 1 }]}
                    cx="50%" cy="42%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                    {(sourceData?.length ? sourceData : [{ name: '', value: 1 }]).map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} opacity={sourceData?.length ? 1 : 0.15} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} iconType="circle"
                    formatter={v => <span style={{ color: 'var(--t2)', fontSize: 11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card glow>
            <CardHeader style={{ padding: '14px 16px 0' }}>
              <CardTitle>Estoque × Giro</CardTitle>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Dias médios em estoque</span>
            </CardHeader>
            <CardContent style={{ padding: '8px 8px 12px' }}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stockGiro ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bs)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--t2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avg" name="Dias" radius={[4,4,0,0]}>
                    {(stockGiro ?? []).map((entry, idx) => (
                      <Cell key={idx} fill={entry.avg > 60 ? 'rgba(61,247,16,.35)' : entry.avg > 30 ? 'rgba(61,247,16,.62)' : '#3DF710'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>}

        {/* ── BLOCO 5: Alertas de Leads ── */}
        {vis('alerts') && leadAlerts && leadAlerts.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <Bell size={12} style={{ color: 'var(--t2)' }} />
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                Alertas de Leads
              </p>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#000', background: 'var(--neon)', padding: '2px 8px', borderRadius: 10 }}>
                {leadAlerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {leadAlerts.map(alert => {
                const severityColor = alert.severity === 'critical' ? 'var(--neon)'
                  : alert.severity === 'warning' ? 'rgba(61,247,16,.72)'
                  : alert.severity === 'attention' ? 'rgba(61,247,16,.5)'
                  : 'rgba(61,247,16,.38)'
                return (
                  <div
                    key={alert.id}
                    onClick={() => alert.lead_id ? openLeadPanel(alert.lead_id) : navigate('/pipeline')}
                    style={{
                      background: 'var(--card)', border: `1px solid ${severityColor}30`,
                      borderLeft: `3px solid ${severityColor}`,
                      borderRadius: 9, padding: '10px 12px',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--el)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: severityColor, lineHeight: 1.3 }}>{alert.title}</p>
                      <span style={{
                        fontSize: 8, fontWeight: 700, flexShrink: 0,
                        padding: '2px 6px', borderRadius: 6,
                        background: `${severityColor}18`, color: severityColor, textTransform: 'uppercase',
                      }}>
                        {alert.severity}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4, lineHeight: 1.4 }}>{alert.message}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── BLOCO 6: Follow-ups + Ranking + Financeiro ── */}
        {vis('bottom') && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {/* Follow-ups */}
          <Card glow>
            <CardHeader style={{ padding: '14px 16px 0' }}>
              <CardTitle>Follow-ups urgentes</CardTitle>
              {followUps?.filter(f => f.overdue).length
                ? <Badge variant="neon" dot>{followUps.filter(f => f.overdue).length} atrasados</Badge>
                : null
              }
            </CardHeader>
            <CardContent style={{ padding: '8px 16px 14px' }}>
              {!followUps?.length ? (
                <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>Nenhum follow-up pendente</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {followUps.map(f => (
                    <div
                      key={f.id}
                      onClick={() => openLeadPanel(f.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 7, padding: '3px 4px', marginInline: -4 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--el)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--ng)',
                        border: `1px solid ${f.overdue ? 'var(--neon)' : 'var(--nb)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: 'var(--neon)',
                      }}>
                        {f.client_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.client_name}
                        </p>
                        <p style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.vehicle_interest ?? '—'}
                        </p>
                      </div>
                      <Badge variant={f.overdue || f.isToday ? 'neon' : 'default'} style={{ flexShrink: 0, fontSize: 10 }}>
                        {f.overdue ? 'ATRASADO' : f.isToday ? 'HOJE' : timeAgo(f.next_followup_at!)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ranking */}
          <Card glow>
            <CardHeader style={{ padding: '14px 16px 0' }}>
              <CardTitle>Ranking vendedores</CardTitle>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Mês atual</span>
            </CardHeader>
            <CardContent style={{ padding: '8px 16px 14px' }}>
              {!vendorRanking?.length ? (
                <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>Sem dados</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {vendorRanking.map((v, i) => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? 'var(--neon)' : 'var(--t3)', width: 20, flexShrink: 0, textAlign: 'center' }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                      </span>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: i === 0 ? 'var(--ng)' : 'var(--el)',
                        border: `1px solid ${i === 0 ? 'var(--nb)' : 'var(--b)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: i === 0 ? 'var(--neon)' : 'var(--t2)',
                      }}>
                        {v.initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.name.split(' ')[0]}
                        </p>
                      </div>
                      <span style={{ fontSize: 12, fontFamily: 'var(--fm)', color: i === 0 ? 'var(--neon)' : 'var(--t)', flexShrink: 0, fontWeight: 700 }}>
                        {v.won}<span style={{ color: 'var(--t3)', fontWeight: 400 }}>/{v.goal || '—'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial metrics */}
          <Card glow>
            <CardHeader style={{ padding: '14px 16px 0' }}>
              <CardTitle>Métricas financeiras</CardTitle>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>Mês atual</span>
            </CardHeader>
            <CardContent style={{ padding: '8px 16px 14px' }}>
              <StatRow label="Margem bruta"
                value={finMetrics?.marginPct ? `${finMetrics.marginPct}%` : `${((kpis?.revenue ?? 0) > 0 ? 12.0 : 0).toFixed(1)}%`}
                color="var(--neon)" />
              <StatRow label="Custo fixo mensal"
                value={finMetrics?.fixedCost ? formatCurrency(finMetrics.fixedCost) : '—'} />
              <StatRow label="Ponto de equilíbrio"
                value={finMetrics?.breakeven ? `${finMetrics.breakeven} vendas` : '—'} />
              <StatRow label="Leads no período" value={String(kpis?.totalLeads ?? 0)} />
              <StatRow label="Fechamentos" value={String(kpis?.wonCount ?? 0)} color="var(--neon)" />
            </CardContent>
          </Card>
        </div>}
      </div>

      {/* ── Widget Editor Panel ── */}
      {showWidgetEditor && (
        <WidgetEditorPanel
          widgets={widgets}
          onSave={saveAndSetWidgets}
          onClose={() => setShowWidgetEditor(false)}
        />
      )}
    </>
  )
}
