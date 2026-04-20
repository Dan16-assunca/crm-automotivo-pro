import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  Legend,
} from 'recharts'
import {
  TrendingUp, Users, DollarSign, Target, Download,
  ChevronDown, BarChart2, Filter,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency } from '@/utils/format'

// ─── helpers ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const COLORS = ['#3df710','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#10b981']

const STAGE_LABELS: Record<string, string> = {
  novo: 'Novo Lead', contato: 'Contato', visita: 'Visita', proposta: 'Proposta', fechamento: 'Fechamento',
}

function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const tt = {
  contentStyle: { background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 7, fontSize: 11 },
  labelStyle: { color: 'var(--t)', fontWeight: 600 },
  itemStyle: { color: 'var(--t2)' },
}

// ─── Período ──────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: 'Este mês',      value: '1m'  },
  { label: '3 meses',       value: '3m'  },
  { label: '6 meses',       value: '6m'  },
  { label: '12 meses',      value: '12m' },
  { label: 'Este ano',      value: 'ytd' },
]

function getPeriodRange(p: string): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString()
  if (p === '1m') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    return { from, to }
  }
  if (p === '3m')  return { from: new Date(now.setMonth(new Date().getMonth() - 3)).toISOString(), to }
  if (p === '6m')  return { from: new Date(now.setMonth(new Date().getMonth() - 6)).toISOString(), to }
  if (p === '12m') return { from: new Date(now.setMonth(new Date().getMonth() - 12)).toISOString(), to }
  if (p === 'ytd') return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to }
  return { from: new Date(now.setMonth(new Date().getMonth() - 1)).toISOString(), to }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Reports() {
  const { store } = useAuthStore()
  const [period, setPeriod] = useState('3m')
  const [showPeriodMenu, setShowPeriodMenu] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview'|'salespeople'|'sources'|'funnel'>('overview')

  const { from, to } = useMemo(() => getPeriodRange(period), [period])

  // ── Todos os leads do período ────────────────────────────────────────────────
  const { data: leads = [] } = useQuery({
    queryKey: ['analytics-leads', store?.id, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, status, source, stage_id, lost_reason, sale_value, salesperson_id, created_at, updated_at, temperature')
        .eq('store_id', store!.id)
        .gte('created_at', from)
        .lte('created_at', to)
      return data ?? []
    },
    enabled: !!store?.id,
  })

  // ── Vendedores ───────────────────────────────────────────────────────────────
  const { data: salespeople = [] } = useQuery({
    queryKey: ['analytics-users', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('store_id', store!.id)
        .eq('active', true)
      return data ?? []
    },
    enabled: !!store?.id,
  })

  // ── Estágios ─────────────────────────────────────────────────────────────────
  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('id, name, position, is_won, is_final')
        .eq('store_id', store!.id)
        .order('position')
      return data ?? []
    },
    enabled: !!store?.id,
  })

  // ── Dados calculados ─────────────────────────────────────────────────────────

  // Série temporal: leads por mês
  const monthSeries = useMemo(() => {
    const buckets: Record<string, { month: string; leads: number; won: number; revenue: number }> = {}
    leads.forEach(l => {
      const d = new Date(l.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!buckets[key]) buckets[key] = { month: MONTHS_SHORT[d.getMonth()], leads: 0, won: 0, revenue: 0 }
      buckets[key].leads++
      if (l.status === 'won') { buckets[key].won++; buckets[key].revenue += l.sale_value ?? 0 }
    })
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
  }, [leads])

  // KPIs
  const kpis = useMemo(() => {
    const total = leads.length
    const won   = leads.filter(l => l.status === 'won').length
    const lost  = leads.filter(l => l.status === 'lost').length
    const revenue = leads.filter(l => l.status === 'won').reduce((s, l) => s + (l.sale_value ?? 0), 0)
    const convRate = total > 0 ? ((won / total) * 100).toFixed(1) : '0'
    const avgTicket = won > 0 ? revenue / won : 0
    return { total, won, lost, revenue, convRate, avgTicket }
  }, [leads])

  // Performance por vendedor
  const salespersonStats = useMemo(() => {
    const map: Record<string, { name: string; total: number; won: number; revenue: number; active: number }> = {}
    salespeople.forEach(s => { map[s.id] = { name: s.full_name, total: 0, won: 0, revenue: 0, active: 0 } })
    leads.forEach(l => {
      const sid = l.salesperson_id ?? 'none'
      if (!map[sid]) map[sid] = { name: 'Sem vendedor', total: 0, won: 0, revenue: 0, active: 0 }
      map[sid].total++
      if (l.status === 'won') { map[sid].won++; map[sid].revenue += l.sale_value ?? 0 }
      if (l.status === 'active') map[sid].active++
    })
    return Object.values(map)
      .filter(v => v.total > 0)
      .map(v => ({ ...v, convRate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0 }))
      .sort((a, b) => b.won - a.won)
  }, [leads, salespeople])

  // Performance por origem
  const sourceStats = useMemo(() => {
    const map: Record<string, { source: string; total: number; won: number }> = {}
    leads.forEach(l => {
      const s = l.source ?? 'Desconhecida'
      if (!map[s]) map[s] = { source: s, total: 0, won: 0 }
      map[s].total++
      if (l.status === 'won') map[s].won++
    })
    return Object.values(map)
      .map(v => ({ ...v, rate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [leads])

  // Funil por estágio
  const funnelData = useMemo(() => {
    const stageCount: Record<string, number> = {}
    leads.forEach(l => { stageCount[l.stage_id] = (stageCount[l.stage_id] ?? 0) + 1 })
    return stages.map(s => ({
      name: s.name,
      value: stageCount[s.id] ?? 0,
      fill: s.is_won ? '#3df710' : COLORS[s.position % COLORS.length],
    }))
  }, [leads, stages])

  // Motivos de perda
  const lostReasons = useMemo(() => {
    const map: Record<string, number> = {}
    leads.filter(l => l.status === 'lost' && l.lost_reason).forEach(l => {
      map[l.lost_reason!] = (map[l.lost_reason!] ?? 0) + 1
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
  }, [leads])

  // ── UI ───────────────────────────────────────────────────────────────────────

  const tabs = [
    { id: 'overview' as const,    label: 'Visão Geral' },
    { id: 'salespeople' as const, label: 'Vendedores' },
    { id: 'sources' as const,     label: 'Origens' },
    { id: 'funnel' as const,      label: 'Funil' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Analytics</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Performance completa do funil de vendas</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Seletor de período */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowPeriodMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                background: 'var(--el)', border: '1px solid var(--bs)', borderRadius: 7,
                color: 'var(--t)', fontSize: 12, cursor: 'pointer',
              }}>
              <Filter size={12} />
              {PERIODS.find(p => p.value === period)?.label ?? 'Período'}
              <ChevronDown size={12} />
            </button>
            {showPeriodMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, zIndex: 50, marginTop: 4,
                background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,.4)', overflow: 'hidden', minWidth: 140,
              }}>
                {PERIODS.map(p => (
                  <button key={p.value} onClick={() => { setPeriod(p.value); setShowPeriodMenu(false) }}
                    style={{
                      display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
                      background: period === p.value ? 'rgba(61,247,16,.08)' : 'transparent',
                      border: 'none', color: period === p.value ? 'var(--neon)' : 'var(--t2)',
                      fontSize: 12, cursor: 'pointer',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Export */}
          <button
            onClick={() => exportCSV(leads.map(l => ({
              Status: l.status, Origem: l.source ?? '', Vendedor: salespeople.find(s => s.id === l.salesperson_id)?.full_name ?? '',
              Temperatura: l.temperature ?? '', Valor: l.sale_value ?? 0, Criado: l.created_at,
            })), `relatorio-${period}-${new Date().toISOString().slice(0,10)}.csv`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: 'var(--el)', border: '1px solid var(--bs)', borderRadius: 7,
              color: 'var(--t2)', fontSize: 12, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)'; e.currentTarget.style.color = 'var(--neon)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.color = 'var(--t2)' }}>
            <Download size={12} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {[
          { icon: <Users size={14} />,     label: 'Total de Leads',     value: kpis.total,                        sub: 'no período',                color: 'var(--blu)' },
          { icon: <Target size={14} />,    label: 'Ganhos',             value: kpis.won,                          sub: `${kpis.convRate}% conversão`,color: 'var(--neon)' },
          { icon: <TrendingUp size={14} />,label: 'Taxa de Conversão',  value: `${kpis.convRate}%`,              sub: `${kpis.lost} perdidos`,      color: kpis.convRate >= '15' ? 'var(--neon)' : 'var(--yel)' },
          { icon: <DollarSign size={14} />,label: 'Faturamento',        value: formatCurrency(kpis.revenue),      sub: 'vendas fechadas',            color: 'var(--neon)' },
          { icon: <BarChart2 size={14} />, label: 'Ticket Médio',       value: formatCurrency(kpis.avgTicket),    sub: 'por venda',                  color: 'var(--t2)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <span style={{ color: k.color }}>{k.icon}</span>
              <span style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k.label}</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, color: k.color }}>{k.value}</p>
            <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, background: 'var(--el)', borderRadius: 8, padding: 3, width: 'fit-content', border: '1px solid var(--bs)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: activeTab === t.id ? 'var(--card)' : 'transparent',
              border: activeTab === t.id ? '1px solid var(--bs)' : '1px solid transparent',
              color: activeTab === t.id ? 'var(--t)' : 'var(--t3)', cursor: 'pointer',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Visão Geral ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Série temporal */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, padding: '16px 18px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Leads e Vendas por Mês</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthSeries} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip {...tt} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--t3)' }} />
                <Bar dataKey="leads" fill="var(--blu)" radius={[4,4,0,0]} name="Total Leads" opacity={0.7} />
                <Bar dataKey="won"   fill="var(--neon)" radius={[4,4,0,0]} name="Ganhos" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Faturamento */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, padding: '16px 18px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Faturamento por Mês</p>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={monthSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip {...tt} formatter={(v: number) => [formatCurrency(v), 'Faturamento']} />
                  <Line type="monotone" dataKey="revenue" stroke="var(--neon)" strokeWidth={2} dot={{ fill: 'var(--neon)', r: 3 }} name="Faturamento" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Motivos de perda */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, padding: '16px 18px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Motivos de Perda</p>
              {lostReasons.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={lostReasons} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'var(--t2)', fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip {...tt} />
                    <Bar dataKey="value" fill="var(--red)" radius={[0, 4, 4, 0]} name="Leads perdidos" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ fontSize: 12, color: 'var(--t3)', padding: '40px 0', textAlign: 'center' }}>Nenhum lead perdido no período</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Vendedores ── */}
      {activeTab === 'salespeople' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Gráfico comparativo */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, padding: '16px 18px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Performance por Vendedor</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salespersonStats} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip {...tt} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--t3)' }} />
                <Bar dataKey="total" fill="var(--blu)" radius={[4,4,0,0]} name="Total" opacity={0.7} />
                <Bar dataKey="won"   fill="var(--neon)" radius={[4,4,0,0]} name="Ganhos" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela detalhada */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--el)' }}>
                  {['Vendedor','Leads','Ganhos','Conversão','Faturamento','Ticket Médio'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salespersonStats.map((s, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--bs)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: COLORS[i % COLORS.length] + '20', color: COLORS[i % COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                          {s.name.charAt(0).toUpperCase()}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>{s.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{s.total}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--neon)', fontWeight: 600 }}>{s.won}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 5, background: 'var(--el)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: s.convRate >= 20 ? 'var(--neon)' : s.convRate >= 10 ? 'var(--yel)' : 'var(--red)', borderRadius: 99, width: `${s.convRate}%` }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: s.convRate >= 20 ? 'var(--neon)' : s.convRate >= 10 ? 'var(--yel)' : 'var(--red)' }}>{s.convRate}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'var(--fm)', color: 'var(--t)' }}>{formatCurrency(s.revenue)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'var(--fm)', color: 'var(--t2)' }}>{formatCurrency(s.won > 0 ? s.revenue / s.won : 0)}</td>
                  </tr>
                ))}
                {salespersonStats.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>Sem dados no período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Origens ── */}
      {activeTab === 'sources' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, padding: '16px 18px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Volume por Origem</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={sourceStats} dataKey="total" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={({ source, percent }) => `${source} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {sourceStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...tt} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, padding: '16px 18px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Conversão por Origem</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sourceStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" vertical={false} />
                  <XAxis dataKey="source" tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip {...tt} formatter={(v: number) => [`${v}%`, 'Taxa de conversão']} />
                  <Bar dataKey="rate" fill="var(--neon)" radius={[4,4,0,0]} name="Conversão %" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Tabela */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--el)' }}>
                  {['Origem','Total de Leads','Ganhos','Taxa de Conversão'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sourceStats.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--bs)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>{row.source}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>{row.total}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--neon)', fontWeight: 600 }}>{row.won}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: 'var(--el)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: 'var(--neon)', borderRadius: 99, width: `${row.rate}%` }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--neon)', minWidth: 32 }}>{row.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Funil ── */}
      {activeTab === 'funnel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, padding: '16px 18px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>Distribuição por Etapa do Funil</p>
            <p style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 14 }}>Leads criados no período · Total: {kpis.total}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {funnelData.map((stage, i) => {
                const widthPct = kpis.total > 0 ? Math.max(5, (stage.value / kpis.total) * 100) : 0
                const prevPct = i > 0 && funnelData[i - 1].value > 0
                  ? Math.round((stage.value / funnelData[i - 1].value) * 100) : null
                return (
                  <div key={stage.name}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--t2)', minWidth: 110 }}>{stage.name}</span>
                      <div style={{ flex: 1, height: 28, background: 'var(--el)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${widthPct}%`, background: stage.fill, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 10, transition: 'width .5s ease' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#000', whiteSpace: 'nowrap' }}>
                            {stage.value > 0 ? stage.value : ''}
                          </span>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t)', minWidth: 30, textAlign: 'right' }}>{stage.value}</span>
                      {prevPct !== null && (
                        <span style={{ fontSize: 10, color: prevPct >= 50 ? 'var(--neon)' : 'var(--yel)', minWidth: 50 }}>
                          ↓ {prevPct}%
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Taxa de conversão geral */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'Lead → Proposta', value: stages.length >= 4 ? Math.round((funnelData.find(f => f.name?.toLowerCase().includes('proposta'))?.value ?? 0) / Math.max(1, kpis.total) * 100) : 0 },
              { label: 'Proposta → Fechamento', value: kpis.won > 0 && (funnelData.find(f => f.name?.toLowerCase().includes('proposta'))?.value ?? 0) > 0 ? Math.round(kpis.won / (funnelData.find(f => f.name?.toLowerCase().includes('proposta'))?.value ?? 1) * 100) : 0 },
              { label: 'Lead → Venda', value: parseFloat(kpis.convRate) },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9, padding: '14px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{m.label}</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: m.value >= 20 ? 'var(--neon)' : m.value >= 10 ? 'var(--yel)' : 'var(--red)' }}>{m.value}%</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
