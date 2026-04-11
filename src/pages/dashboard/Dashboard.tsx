import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, TrendingUp, DollarSign, Flame, AlertCircle,
  ArrowUpRight, ArrowDownRight, MessageSquare, Edit2,
  LayoutDashboard, Eye, EyeOff, X as XIcon, Check,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency, timeAgo } from '@/utils/format'
import type { Lead } from '@/types'

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

// ─── Tooltip ───────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--el)', border: '1px solid var(--b)',
      borderRadius: 7, padding: '8px 12px', fontSize: 11,
    }}>
      <p style={{ color: 'var(--t3)', marginBottom: 4 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? formatCurrency(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

// ─── Stat row item ─────────────────────────────────────────────────────────────
function StatRow({ label, value, color = 'var(--t)' }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bs)' }}>
      <span style={{ fontSize: 12, color: 'var(--t2)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--fm)', color }}>{value}</span>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
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

  // ── Secondary KPIs ──
  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis', storeId, from, to],
    queryFn: async () => {
      const [allLeads, wonLeads] = await Promise.all([
        supabase.from('leads').select('id, source, won_value', { count: 'exact' })
          .eq('store_id', storeId).gte('created_at', from).lte('created_at', to),
        supabase.from('leads').select('won_value')
          .eq('store_id', storeId).eq('status', 'won')
          .gte('updated_at', from).lte('updated_at', to),
      ])
      const totalLeads  = allLeads.count ?? 0
      const wonCount    = wonLeads.data?.length ?? 0
      const revenue     = (wonLeads.data ?? []).reduce((s, l) => s + (l.won_value ?? 0), 0)
      const convRate    = totalLeads > 0 ? (wonCount / totalLeads) * 100 : 0
      const avgTicket   = wonCount > 0 ? revenue / wonCount : 0
      return { totalLeads, wonCount, revenue, convRate, avgTicket }
    },
    enabled: !!storeId,
  })

  // ── Monthly evolution (6 months) — single query, aggregate in JS ──
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

  // ── Leads per day (last 14 days) — single query, aggregate in JS ──
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
      const { data } = await supabase.from('vehicles').select('brand, days_in_stock').eq('store_id', storeId)
      const grouped: Record<string, number[]> = {}
      data?.forEach(v => {
        if (!grouped[v.brand]) grouped[v.brand] = []
        grouped[v.brand].push(v.days_in_stock ?? 0)
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

  // ── Vendor ranking — 3 queries total instead of N×2 ──
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

  // ── Funnel bars from stage leads ──
  const funnelBarData = useMemo(() => {
    if (!stages || !funnelCounts) return []
    return stages.filter(s => !s.is_final).map(s => ({
      name: s.name.length > 8 ? s.name.slice(0, 8) + '.' : s.name,
      value: funnelCounts[s.id] ?? 0,
    }))
  }, [stages, funnelCounts])

  const pills: { label: string; val: Period }[] = [
    { label: 'Este mês', val: 'month' }, { label: '7 dias', val: '7d' },
    { label: '30 dias',  val: '30d' },  { label: '90 dias', val: '90d' },
    { label: 'Este ano', val: 'year' },  { label: 'Tudo',    val: 'all' },
  ]

  const CHART_COLORS = ['#3DF710', '#0A84FF', '#FFD60A', '#FF9F0A', '#BF5AF2', '#FF3B30']

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Header + period filter ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Dashboard</h1>
          <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{store?.name}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {pills.map(p => (
            <button key={p.val} onClick={() => { setPeriod(p.val); setCustomFrom(''); setCustomTo('') }}
              style={{
                padding: '4px 11px', fontSize: 11, borderRadius: 20, cursor: 'pointer',
                border: '1px solid ' + (period === p.val && !customFrom ? 'var(--nb)' : 'var(--b)'),
                background: period === p.val && !customFrom ? 'var(--ng)' : 'transparent',
                color: period === p.val && !customFrom ? 'var(--neon)' : 'var(--t2)',
                transition: 'all .12s',
              }}>
              {p.label}
            </button>
          ))}
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            style={{ height: 28, padding: '0 8px', fontSize: 11, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 6, color: 'var(--t)', outline: 'none' }} />
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>→</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            style={{ height: 28, padding: '0 8px', fontSize: 11, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 6, color: 'var(--t)', outline: 'none' }} />
          <button
            onClick={() => setEditMode(v => !v)}
            style={{
              height: 28, padding: '0 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              border: `1px solid ${editMode ? 'var(--neon)' : 'var(--b)'}`,
              background: editMode ? 'var(--ng)' : 'var(--el)',
              color: editMode ? 'var(--neon)' : 'var(--t2)',
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
            { id: 'funil', label: 'Funil Comercial' },
            { id: 'kpis', label: 'KPIs' },
            { id: 'charts1', label: 'Faturamento / Funil' },
            { id: 'charts2', label: 'Leads / Origem / Estoque' },
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

      {/* ── BLOCO 1: Funil Comercial ── */}
      {vis('funil') && <div>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
          Funil Comercial
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {funnelLoading || !stages ? [...Array(5)].map((_, i) => (
            <Skeleton key={i} style={{ height: 90, borderRadius: 9 }} />
          )) : stages.filter(s => !s.is_final).map((stage, i) => {
            const count = funnelCounts?.[stage.id] ?? 0
            const prevCount = i > 0 && stages ? (funnelCounts?.[stages.filter(s => !s.is_final)[i-1]?.id] ?? 0) : 0
            const convPct = i > 0 && prevCount > 0 ? Math.round((count / prevCount) * 100) : null
            return (
              <motion.div key={stage.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <div style={{
                  background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9,
                  padding: '14px 16px', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '9px 9px 0 0',
                    background: stage.color || 'var(--neon)',
                  }} />
                  <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {String(i + 1).padStart(2, '0')} {stage.name}
                  </p>
                  <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--t)', lineHeight: 1.2, marginTop: 6, fontFamily: 'var(--fn)' }}>
                    {count}
                  </p>
                  {convPct !== null && (
                    <p style={{ fontSize: 10, color: 'var(--neon)', marginTop: 2 }}>
                      conv. {stages.filter(s=>!s.is_final)[i-1]?.name.toLowerCase()}: {convPct}%
                    </p>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>}

      {/* ── BLOCO 2: KPIs secundários ── */}
      {vis('kpis') && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {kpisLoading ? [...Array(5)].map((_, i) => <Skeleton key={i} style={{ height: 80, borderRadius: 9 }} />) : [
          { title: 'Conversão Geral', value: `${(kpis?.convRate ?? 0).toFixed(1)}%`, color: 'var(--neon)', sub: 'este período' },
          { title: 'Ticket Médio',    value: kpis ? formatCurrency(kpis.avgTicket) : '—', color: 'var(--t)', sub: 'por venda' },
          { title: 'Faturamento',     value: kpis ? formatCurrency(kpis.revenue) : '—',   color: 'var(--t)', sub: 'receita total' },
          { title: 'CPL',             value: kpis ? formatCurrency(kpis.totalLeads > 0 ? (kpis.revenue * 0.03) / kpis.totalLeads : 0) : '—', color: 'var(--t)', sub: 'custo por lead' },
          { title: 'Meta do Mês',     value: '—', color: 'var(--yel)', sub: 'atingido', action: true },
        ].map((k) => (
          <div key={k.title} style={{
            background: 'var(--card)', border: '1px solid var(--bs)',
            borderRadius: 9, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{k.title}</p>
              {k.action && (
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neon)', fontSize: 9 }}>
                  EDITAR
                </button>
              )}
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, color: k.color, marginTop: 6, fontFamily: 'var(--fn)', lineHeight: 1 }}>
              {k.value}
            </p>
            <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>{k.sub}</p>
          </div>
        ))}
      </div>}

      {/* ── BLOCO 3: Gráficos linha 1 ── */}
      {vis('charts1') && <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12 }}>
        <Card>
          <CardHeader style={{ padding: '12px 16px 0' }}>
            <div>
              <CardTitle>Faturamento vs Lucro</CardTitle>
              <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2 }}>
                {new Date().getFullYear()} · MENSAL
              </p>
            </div>
            <Badge variant="neon" dot>Atualizado</Badge>
          </CardHeader>
          <CardContent style={{ padding: '8px 8px 12px' }}>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={monthlyData ?? []} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={7} iconType="circle"
                  formatter={v => <span style={{ color: 'var(--t2)', fontSize: 10 }}>{v}</span>} />
                <Bar dataKey="faturamento" name="Faturamento" fill="rgba(61,247,16,.3)" radius={[3,3,0,0]} />
                <Bar dataKey="lucro"       name="Lucro"       fill="rgba(61,247,16,.85)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ padding: '12px 16px 0' }}>
            <CardTitle>Funil de Conversão</CardTitle>
            <span style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase' }}>Este mês</span>
          </CardHeader>
          <CardContent style={{ padding: '8px 8px 12px' }}>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={funnelBarData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--t3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--t2)', fontSize: 9 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Leads" fill="var(--neon)" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>}

      {/* ── BLOCO 4: Gráficos linha 2 ── */}
      {vis('charts2') && <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12 }}>
        <Card>
          <CardHeader style={{ padding: '12px 16px 0' }}>
            <CardTitle>Leads por dia</CardTitle>
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>Últimos 14 dias</span>
          </CardHeader>
          <CardContent style={{ padding: '8px 8px 12px' }}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={leadsPerDay ?? []} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
                <defs>
                  <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--neon)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--neon)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--t3)', fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fill: 'var(--t3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="leads" name="Leads" stroke="var(--neon)" strokeWidth={2}
                  fill="url(#lg)" strokeDasharray="4 2"
                  dot={{ fill: 'var(--neon)', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: 'var(--neon)' }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ padding: '12px 16px 0' }}>
            <CardTitle>Origem dos leads</CardTitle>
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>Mês atual</span>
          </CardHeader>
          <CardContent style={{ padding: '4px 8px 12px' }}>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={sourceData?.length ? sourceData : [{ name: 'Sem dados', value: 1 }]}
                  cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3} dataKey="value">
                  {(sourceData?.length ? sourceData : [{ name: '', value: 1 }]).map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} opacity={sourceData?.length ? 1 : 0.15} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={7} iconType="circle"
                  formatter={v => <span style={{ color: 'var(--t2)', fontSize: 9 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ padding: '12px 16px 0' }}>
            <CardTitle>Estoque x Giro</CardTitle>
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>Dias médios</span>
          </CardHeader>
          <CardContent style={{ padding: '8px 8px 12px' }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stockGiro ?? []} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--t3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--t3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="avg" name="Dias" radius={[3,3,0,0]}>
                  {(stockGiro ?? []).map((entry, idx) => (
                    <Cell key={idx} fill={entry.avg > 60 ? 'var(--red)' : entry.avg > 30 ? 'var(--yel)' : 'var(--neon)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>}

      {/* ── BLOCO 5: Follow-ups + Ranking + Financeiro ── */}
      {vis('bottom') && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {/* Follow-ups */}
        <Card>
          <CardHeader style={{ padding: '12px 16px 0' }}>
            <CardTitle>Follow-ups urgentes</CardTitle>
            {followUps?.filter(f => f.overdue).length
              ? <Badge variant="danger" dot>{followUps.filter(f => f.overdue).length} atrasados</Badge>
              : null
            }
          </CardHeader>
          <CardContent style={{ padding: '8px 16px 14px' }}>
            {!followUps?.length ? (
              <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>Nenhum follow-up pendente</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {followUps.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--ng)', border: '1px solid var(--nb)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: 'var(--neon)',
                    }}>
                      {f.client_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.client_name}
                      </p>
                      <p style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.vehicle_interest ?? '—'}
                      </p>
                    </div>
                    <Badge variant={f.overdue ? 'danger' : f.isToday ? 'warning' : 'default'} style={{ flexShrink: 0, fontSize: 9 }}>
                      {f.overdue ? 'ATRASADO' : f.isToday ? 'HOJE' : timeAgo(f.next_followup_at!)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ranking */}
        <Card>
          <CardHeader style={{ padding: '12px 16px 0' }}>
            <CardTitle>Ranking vendedores</CardTitle>
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>Mês atual</span>
          </CardHeader>
          <CardContent style={{ padding: '8px 16px 14px' }}>
            {!vendorRanking?.length ? (
              <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '20px 0' }}>Sem dados</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {vendorRanking.map((v, i) => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? 'var(--neon)' : 'var(--t3)', width: 16, flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: i === 0 ? 'var(--ng)' : 'var(--el)',
                      border: `1px solid ${i === 0 ? 'var(--nb)' : 'var(--b)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: i === 0 ? 'var(--neon)' : 'var(--t2)',
                    }}>
                      {v.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.name.split(' ')[0]}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--fm)', color: 'var(--t2)', flexShrink: 0 }}>
                      {v.won} / {v.goal || '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financial metrics */}
        <Card>
          <CardHeader style={{ padding: '12px 16px 0' }}>
            <CardTitle>Métricas financeiras</CardTitle>
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>Mês atual</span>
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
  )
}
