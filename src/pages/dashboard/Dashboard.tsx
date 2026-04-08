import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Users, TrendingUp, DollarSign, Flame,
  AlertCircle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { formatCurrency, timeAgo } from '@/utils/format'
import type { Lead } from '@/types'

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
      fontSize: 12,
      boxShadow: 'var(--shadow-lg)',
    }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? formatCurrency(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KPICardProps {
  title: string
  value: string | number
  change?: number
  icon: React.ReactNode
  loading?: boolean
  neon?: boolean
  delay?: number
}

function KPICard({ title, value, change, icon, loading, neon, delay = 0 }: KPICardProps) {
  if (loading) return <SkeletonCard />
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <Card kpi={neon} style={{ height: '100%' }}>
        <CardContent style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              {title}
            </p>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: neon ? 'var(--neon-muted)' : 'var(--bg-elevated)',
              color: neon ? 'var(--neon)' : 'var(--text-secondary)',
            }}>
              {icon}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <p className="font-display count-up" style={{
              fontSize: 42,
              lineHeight: 1,
              color: neon ? 'var(--text-neon)' : 'var(--text-primary)',
              letterSpacing: '0.02em',
            }}>
              {value}
            </p>
            {change !== undefined && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                fontSize: 12,
                marginBottom: 4,
                color: change >= 0 ? 'var(--neon)' : 'var(--status-error)',
              }}>
                {change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {Math.abs(change)}%
              </div>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>vs. mês anterior</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { store, user, isLoading: authLoading } = useAuthStore()

  const storeId = store?.id ?? ''

  // Debug: log auth state to browser console
  console.log('[Dashboard] auth state:', { authLoading, userId: user?.id, storeId })

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['dashboard-kpis', storeId],
    retry: 1,
    queryFn: async () => {
      if (!storeId) return null
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

      const [leadsToday, leadsMonth, wonLeads, hotLeads] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact' }).eq('store_id', storeId).gte('created_at', startOfDay),
        supabase.from('leads').select('id', { count: 'exact' }).eq('store_id', storeId).gte('created_at', startOfMonth),
        supabase.from('leads').select('won_value').eq('store_id', storeId).eq('status', 'won').gte('updated_at', startOfMonth),
        supabase.from('leads').select('id', { count: 'exact' }).eq('store_id', storeId).eq('temperature', 'hot').eq('status', 'active'),
      ])

      const totalRevenue = (wonLeads.data ?? []).reduce((sum, l) => sum + (l.won_value ?? 0), 0)
      const conversionRate = leadsMonth.count ? Math.round(((wonLeads.count ?? 0) / leadsMonth.count) * 100) : 0

      return {
        leadsToday: leadsToday.count ?? 0,
        leadsMonth: leadsMonth.count ?? 0,
        revenue: totalRevenue,
        hotLeads: hotLeads.count ?? 0,
        conversionRate,
      }
    },
    enabled: !!storeId,
  })

  const { data: leadsBySource } = useQuery({
    queryKey: ['leads-by-source', storeId],
    queryFn: async () => {
      if (!storeId) return []
      const { data } = await supabase.from('leads').select('source').eq('store_id', storeId).not('source', 'is', null)
      const counts: Record<string, number> = {}
      data?.forEach(l => { counts[l.source!] = (counts[l.source!] ?? 0) + 1 })
      return Object.entries(counts).map(([name, value]) => ({ name, value }))
    },
    enabled: !!storeId,
  })

  const { data: monthlyData } = useQuery({
    queryKey: ['monthly-evolution', storeId],
    queryFn: async () => {
      if (!storeId) return []
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date()
        d.setMonth(d.getMonth() - (5 - i))
        return { month: d.toLocaleString('pt-BR', { month: 'short' }), date: new Date(d) }
      })
      const results = await Promise.all(months.map(async (m) => {
        const start = new Date(m.date.getFullYear(), m.date.getMonth(), 1).toISOString()
        const end = new Date(m.date.getFullYear(), m.date.getMonth() + 1, 0).toISOString()
        const { count } = await supabase.from('leads').select('id', { count: 'exact' })
          .eq('store_id', storeId).gte('created_at', start).lte('created_at', end)
        return { name: m.month, leads: count ?? 0 }
      }))
      return results
    },
    enabled: !!storeId,
  })

  const { data: funnelData } = useQuery({
    queryKey: ['funnel-data', storeId],
    queryFn: async () => {
      if (!storeId) return []
      const { data: stages } = await supabase
        .from('pipeline_stages').select('id, name, position').eq('store_id', storeId)
        .eq('is_final', false).order('position')
      if (!stages) return []
      const counts = await Promise.all(stages.map(async (s) => {
        const { count } = await supabase.from('leads').select('id', { count: 'exact' })
          .eq('stage_id', s.id).eq('status', 'active')
        return { name: s.name, value: count ?? 0 }
      }))
      return counts.filter(c => c.value > 0)
    },
    enabled: !!storeId,
  })

  const { data: recentLeads, isLoading: leadsLoading } = useQuery({
    queryKey: ['recent-leads', storeId],
    queryFn: async () => {
      if (!storeId) return []
      const { data } = await supabase
        .from('leads').select('*, stage:pipeline_stages(name, color)')
        .eq('store_id', storeId).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(5)
      return (data ?? []) as Lead[]
    },
    enabled: !!storeId,
  })

  // If auth loaded but no store found — show a diagnostic message
  if (!authLoading && !storeId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12 }}>
        <AlertCircle size={36} style={{ color: 'var(--status-error)', opacity: 0.7 }} />
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Loja não encontrada</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 340 }}>
          Seu usuário não está vinculado a nenhuma loja. Verifique o console (F12) para mais detalhes.
          <br /><br />
          userId: <code style={{ color: 'var(--neon)', fontSize: 11 }}>{user?.id ?? 'não autenticado'}</code>
        </p>
      </div>
    )
  }

  const CHART_COLORS = ['#39FF14', '#0A84FF', '#FFD60A', '#FF9F0A', '#BF5AF2', '#32ADE6']
  const maxFunnel = Math.max(...(funnelData?.map(s => s.value) ?? [1]))

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {store?.name ?? 'Visão geral do negócio'}
        </p>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <KPICard title="Leads Hoje" value={kpis?.leadsToday ?? 0} icon={<Users size={17} />} loading={kpisLoading} change={12} neon delay={0} />
        <KPICard title="Leads no Mês" value={kpis?.leadsMonth ?? 0} icon={<TrendingUp size={17} />} loading={kpisLoading} change={8} delay={0.05} />
        <KPICard title="Faturamento" value={kpis ? formatCurrency(kpis.revenue) : 'R$ 0'} icon={<DollarSign size={17} />} loading={kpisLoading} change={-3} delay={0.1} />
        <KPICard title="Leads Quentes" value={kpis?.hotLeads ?? 0} icon={<Flame size={17} />} loading={kpisLoading} delay={0.15} />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Area Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Evolução de Leads</CardTitle>
            <Badge variant="neon" dot>Últimos 6 meses</Badge>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={monthlyData ?? []} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#39FF14" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#39FF14" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="leads"
                  name="Leads"
                  stroke="#39FF14"
                  strokeWidth={2}
                  fill="url(#leadGrad)"
                  dot={{ fill: '#39FF14', strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5, fill: '#39FF14', filter: 'drop-shadow(0 0 6px #39FF14)' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Donut Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Origem dos Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie
                  data={leadsBySource?.length ? leadsBySource : [{ name: 'Sem dados', value: 1 }]}
                  cx="50%"
                  cy="45%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {(leadsBySource?.length ? leadsBySource : [{ name: '', value: 1 }]).map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} opacity={leadsBySource?.length ? 1 : 0.2} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconSize={8}
                  iconType="circle"
                  formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recent Leads */}
        <Card>
          <CardHeader>
            <CardTitle>Leads Recentes</CardTitle>
            <a href="/leads" style={{ fontSize: 12, color: 'var(--text-neon)' }}>Ver todos →</a>
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...Array(4)].map((_, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Skeleton style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Skeleton style={{ height: 12, width: '70%' }} />
                      <Skeleton style={{ height: 10, width: '45%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : !recentLeads?.length ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <Users size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                <p style={{ fontSize: 13 }}>Nenhum lead ainda</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recentLeads.map((lead) => (
                  <div key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'var(--neon-muted)',
                      border: '1px solid var(--border-neon)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-neon)',
                      flexShrink: 0,
                    }}>
                      {lead.client_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.client_name}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.vehicle_interest ?? 'Sem interesse definido'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <Badge variant={lead.temperature as 'hot' | 'warm' | 'cold'} dot>
                        {lead.temperature === 'hot' ? 'Quente' : lead.temperature === 'warm' ? 'Morno' : 'Frio'}
                      </Badge>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(lead.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Funil de Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelData && funnelData.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {funnelData.map((stage, i) => {
                  const pct = maxFunnel > 0 ? (stage.value / maxFunnel) * 100 : 0
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{stage.name}</span>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{stage.value}</span>
                      </div>
                      <div style={{
                        height: 6,
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-full)',
                        overflow: 'hidden',
                      }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, delay: i * 0.08, ease: 'easeOut' }}
                          style={{
                            height: '100%',
                            borderRadius: 'var(--radius-full)',
                            background: `linear-gradient(90deg, var(--neon) 0%, var(--neon-dim) 100%)`,
                            boxShadow: pct > 50 ? 'var(--neon-glow-sm)' : 'none',
                            opacity: 1 - i * 0.07,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                <AlertCircle size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                <p style={{ fontSize: 13 }}>Configure o pipeline primeiro</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
