import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
} from 'recharts'
import { AlertTriangle, TrendingDown, Clock, DollarSign, Package, Zap, Activity, TrendingUp, X as XIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { formatCurrency, computeDaysInStock } from '@/utils/format'
import type { Vehicle } from '@/types'
// ── Intelligence engines ──────────────────────────────────────────────────────
import { calculateDepreciationBatch } from '@/modules/inventory-intelligence/engines/DepreciationEngine'
import { generateAlertBatch, getVehiclesNeedingAction } from '@/modules/inventory-intelligence/engines/AlertEngine'
import { calculateHealthScoreBatch, calculatePatioHealthScore } from '@/modules/inventory-intelligence/engines/HealthScoreEngine'
import { ALERT_COLORS, ALERT_BG_COLORS, ALERT_LABELS } from '@/modules/inventory-intelligence/utils/alertThresholds'
import type { AlertLevel } from '@/modules/inventory-intelligence/types/inventory.types'

const COLORS = ['var(--neon)', 'var(--blu)', 'var(--yel)', 'var(--pur)', 'var(--ora)', 'var(--red)']

const tip: React.CSSProperties = {
  background: 'var(--el)', border: '1px solid var(--b)',
  borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'var(--t)',
}

function KPICard({ label, value, sub, color = 'var(--neon)', icon }: {
  label: string; value: string; sub?: string; color?: string; icon: React.ReactNode
}) {
  return (
    <Card style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</p>
        <div style={{ color, opacity: .7 }}>{icon}</div>
      </div>
      <p style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, fontFamily: 'var(--fm)' }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>{sub}</p>}
    </Card>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={tip}>
      {label && <p style={{ marginBottom: 4, color: 'var(--t2)' }}>{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? 'var(--neon)' }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? formatCurrency(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function InventoryIntelligence() {
  const { store } = useAuthStore()
  const storeId = store?.id ?? ''

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles-intelligence', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(v => ({
        ...v,
        days_in_stock: computeDaysInStock(v.purchase_date),
      })) as Vehicle[]
    },
    enabled: !!storeId,
  })

  const available = useMemo(() => vehicles.filter(v => v.status === 'available'), [vehicles])
  const stalled = useMemo(() => available.filter(v => (v.days_in_stock ?? 0) > 60), [available])
  const warning = useMemo(() => available.filter(v => { const d = v.days_in_stock ?? 0; return d > 30 && d <= 60 }), [available])

  const totalValue = useMemo(() => available.reduce((s, v) => s + (v.sale_price ?? 0), 0), [available])
  const avgDays = useMemo(() => {
    if (!available.length) return 0
    return Math.round(available.reduce((s, v) => s + (v.days_in_stock ?? 0), 0) / available.length)
  }, [available])
  const avgMargin = useMemo(() => {
    const withPrices = available.filter(v => v.sale_price && v.purchase_price)
    if (!withPrices.length) return 0
    const avg = withPrices.reduce((s, v) => s + ((v.sale_price! - v.purchase_price!) / v.sale_price!) * 100, 0) / withPrices.length
    return Math.round(avg * 10) / 10
  }, [available])

  // Days distribution
  const daysBuckets = useMemo(() => {
    const b = [
      { label: '0–15d', count: 0 },
      { label: '16–30d', count: 0 },
      { label: '31–60d', count: 0 },
      { label: '61–90d', count: 0 },
      { label: '+90d', count: 0 },
    ]
    available.forEach(v => {
      const d = v.days_in_stock ?? 0
      if (d <= 15) b[0].count++
      else if (d <= 30) b[1].count++
      else if (d <= 60) b[2].count++
      else if (d <= 90) b[3].count++
      else b[4].count++
    })
    return b
  }, [available])

  // By brand (donut)
  const byBrand = useMemo(() => {
    const map: Record<string, number> = {}
    available.forEach(v => { map[v.brand] = (map[v.brand] ?? 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6)
  }, [available])

  // By category value
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {}
    available.forEach(v => { map[v.brand] = (map[v.brand] ?? 0) + (v.sale_price ?? 0) })
    return Object.entries(map).map(([brand, value]) => ({ brand, value })).sort((a, b) => b.value - a.value).slice(0, 6)
  }, [available])

  // Margin by brand
  const marginByBrand = useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {}
    available.filter(v => v.sale_price && v.purchase_price).forEach(v => {
      const m = ((v.sale_price! - v.purchase_price!) / v.sale_price!) * 100
      if (!map[v.brand]) map[v.brand] = { sum: 0, count: 0 }
      map[v.brand].sum += m
      map[v.brand].count++
    })
    return Object.entries(map).map(([brand, { sum, count }]) => ({
      brand, margin: Math.round((sum / count) * 10) / 10,
    })).sort((a, b) => b.margin - a.margin).slice(0, 6)
  }, [available])

  // Capital imobilizado (cumulative, sorted by days desc)
  const capitalCurve = useMemo(() => {
    const sorted = [...available].sort((a, b) => (b.days_in_stock ?? 0) - (a.days_in_stock ?? 0))
    let acc = 0
    return sorted.slice(0, 15).map(v => {
      acc += v.purchase_price ?? v.sale_price ?? 0
      return { name: `${v.brand} ${v.model}`.slice(0, 14), dias: v.days_in_stock ?? 0, acc }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available])

  // ── Intelligence engines ──────────────────────────────────────────────────
  const depreciationMap = useMemo(() => calculateDepreciationBatch(available), [available])
  const alertMap        = useMemo(() => generateAlertBatch(available, depreciationMap), [available, depreciationMap])
  const healthMap       = useMemo(() => calculateHealthScoreBatch(available, depreciationMap), [available, depreciationMap])

  const patioHealthScore = useMemo(() => calculatePatioHealthScore(available, healthMap), [available, healthMap])
  const vehiclesNeedingAction = useMemo(() => getVehiclesNeedingAction(available, alertMap), [available, alertMap])

  const totalDepreciation = useMemo(() =>
    [...depreciationMap.values()].reduce((s, d) => s + d.accumulatedLossR$, 0),
  [depreciationMap])

  const projectedLoss30d = useMemo(() =>
    [...depreciationMap.values()].reduce((s, d) => s + d.projectedLoss30dR$, 0),
  [depreciationMap])

  const criticalCount = useMemo(() =>
    [...alertMap.values()].filter(a => a.level === 'critical' || a.level === 'emergency').length,
  [alertMap])

  const healthColor = patioHealthScore >= 70 ? 'var(--neon)' : patioHealthScore >= 45 ? 'var(--yel)' : 'var(--red)'

  // ── Selected vehicle state (for panel) ───────────────────────────────────
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const selectedVehicle     = useMemo(() => available.find(v => v.id === selectedVehicleId) ?? null, [available, selectedVehicleId])
  const selectedDepreciation = selectedVehicleId ? depreciationMap.get(selectedVehicleId) : undefined
  const selectedAlert        = selectedVehicleId ? alertMap.get(selectedVehicleId) : undefined
  const selectedHealth       = selectedVehicleId ? healthMap.get(selectedVehicleId) : undefined

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{ height: 80, background: 'var(--card)', borderRadius: 9, opacity: .4 }} />
      ))}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Inteligência de Estoque</h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Análise de giro, margem e capital imobilizado</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        <KPICard label="Veículos disponíveis" value={String(available.length)} sub="no estoque" color="var(--neon)" icon={<Package size={16} />} />
        <KPICard label="Capital imobilizado" value={formatCurrency(totalValue)} sub="valor de venda" color="var(--blu)" icon={<DollarSign size={16} />} />
        <KPICard label="Giro médio" value={`${avgDays}d`} sub="dias no estoque" color={avgDays > 45 ? 'var(--red)' : avgDays > 25 ? 'var(--yel)' : 'var(--neon)'} icon={<Clock size={16} />} />
        <KPICard label="Parados +60d" value={String(stalled.length)} sub={`${Math.round((stalled.length / (available.length || 1)) * 100)}% do estoque`} color={stalled.length > 0 ? 'var(--red)' : 'var(--neon)'} icon={<AlertTriangle size={16} />} />
        <KPICard label="Margem média" value={`${avgMargin}%`} sub="sobre preço de venda" color="var(--grn)" icon={<TrendingDown size={16} />} />
      </div>

      {/* Alerts */}
      {stalled.length > 0 && (
        <div style={{ background: 'rgba(244,63,94,.06)', border: '1px solid rgba(244,63,94,.25)', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AlertTriangle size={15} style={{ color: 'var(--red)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>
              {stalled.length} veículo{stalled.length > 1 ? 's' : ''} parado{stalled.length > 1 ? 's' : ''} há mais de 60 dias
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stalled.slice(0, 5).map(v => (
              <div key={v.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'rgba(244,63,94,.05)', borderRadius: 7, padding: '8px 12px',
                border: '1px solid rgba(244,63,94,.15)',
              }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>{v.brand} {v.model}</span>
                  {v.version && <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 6 }}>{v.version}</span>}
                </div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--neon)', fontWeight: 700 }}>{formatCurrency(v.sale_price ?? 0)}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: 'rgba(244,63,94,.15)', color: 'var(--red)',
                  }}>{v.days_in_stock}d</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {warning.length > 0 && (
        <div style={{ background: 'rgba(234,179,8,.05)', border: '1px solid rgba(234,179,8,.2)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Clock size={14} style={{ color: 'var(--yel)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--yel)' }}>
              {warning.length} veículo{warning.length > 1 ? 's' : ''} em atenção (31–60 dias)
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {warning.map(v => (
              <span key={v.id} style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(234,179,8,.1)', border: '1px solid rgba(234,179,8,.2)', color: 'var(--yel)',
              }}>
                {v.brand} {v.model} · {v.days_in_stock}d
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Charts row 1: days histogram + brand donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Distribuição por Tempo em Estoque</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={daysBuckets} barSize={32}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <CartesianGrid stroke="var(--bs)" strokeDasharray="3 3" vertical={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Veículos" radius={[4, 4, 0, 0]}>
                {daysBuckets.map((_, i) => (
                  <Cell key={i} fill={i >= 3 ? 'var(--red)' : i === 2 ? 'var(--yel)' : 'var(--neon)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Composição por Marca</p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={byBrand} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
                  {byBrand.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {byBrand.map((b, i) => (
                <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--t2)', flex: 1 }}>{b.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)' }}>{b.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Charts row 2: category value + margin + capital curve */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Card style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Valor em Estoque por Marca</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byCategory} layout="vertical" barSize={14}>
              <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--t3)' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${Math.round(v / 1000)}k`} />
              <YAxis type="category" dataKey="brand" tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} width={68} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Valor" fill="var(--blu)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Margem Média por Marca (%)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={marginByBrand} layout="vertical" barSize={14}>
              <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--t3)' }} axisLine={false} tickLine={false} unit="%" />
              <YAxis type="category" dataKey="brand" tick={{ fontSize: 10, fill: 'var(--t2)' }} axisLine={false} tickLine={false} width={68} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="margin" name="Margem" fill="var(--grn)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Curva de Capital Imobilizado</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={capitalCurve}>
              <defs>
                <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ora)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--ora)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="dias" tick={{ fontSize: 9, fill: 'var(--t3)' }} axisLine={false} tickLine={false} unit="d" />
              <YAxis tick={{ fontSize: 9, fill: 'var(--t3)' }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area dataKey="acc" name="Acumulado" stroke="var(--ora)" fill="url(#capGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Analysis table */}
      <Card style={{ padding: '16px 18px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Análise Detalhada — Disponíveis</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--b)' }}>
                {['Veículo', 'Ano', 'KM', 'Compra', 'Venda', 'Margem', 'Dias', 'Status'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {available.slice(0, 20).map(v => {
                const margin = v.sale_price && v.purchase_price
                  ? Math.round(((v.sale_price - v.purchase_price) / v.sale_price) * 100 * 10) / 10
                  : null
                const days = v.days_in_stock ?? 0
                const daysColor = days > 60 ? 'var(--red)' : days > 30 ? 'var(--yel)' : 'var(--neon)'
                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--bs)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '7px 10px', color: 'var(--t)', fontWeight: 600 }}>{v.brand} {v.model}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--t2)' }}>{v.year_model}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--t2)', fontFamily: 'var(--fm)' }}>{v.km?.toLocaleString('pt-BR')}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--t2)', fontFamily: 'var(--fm)' }}>{v.purchase_price ? formatCurrency(v.purchase_price) : '—'}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--neon)', fontFamily: 'var(--fm)', fontWeight: 700 }}>{formatCurrency(v.sale_price ?? 0)}</td>
                    <td style={{ padding: '7px 10px', color: margin !== null ? (margin > 15 ? 'var(--grn)' : margin > 5 ? 'var(--yel)' : 'var(--red)') : 'var(--t3)', fontWeight: 700 }}>
                      {margin !== null ? `${margin}%` : '—'}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: days > 60 ? 'rgba(244,63,94,.12)' : days > 30 ? 'rgba(234,179,8,.12)' : 'rgba(61,247,16,.1)',
                        color: daysColor,
                      }}>{days}d</span>
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                        background: v.status === 'available' ? 'rgba(61,247,16,.1)' : v.status === 'reserved' ? 'rgba(234,179,8,.12)' : 'rgba(100,100,100,.15)',
                        color: v.status === 'available' ? 'var(--neon)' : v.status === 'reserved' ? 'var(--yel)' : 'var(--t3)',
                      }}>
                        {v.status === 'available' ? 'Disponível' : v.status === 'reserved' ? 'Reservado' : v.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {available.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--t3)', fontSize: 12 }}>
              Nenhum veículo disponível no estoque
            </div>
          )}
        </div>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ── INTELLIGENCE ENGINE SECTIONS ────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {/* ── Engine KPIs ───────────────────────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
          Inteligência Preditiva
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <KPICard label="Depreciação acumulada" value={formatCurrency(totalDepreciation)} sub="perda total no estoque" color="var(--red)" icon={<TrendingDown size={16} />} />
          <KPICard label="Previsão próximos 30d" value={formatCurrency(projectedLoss30d)} sub="perda estimada/mês" color="var(--ora)" icon={<TrendingUp size={16} />} />
          <KPICard label="Score saúde do pátio" value={`${patioHealthScore}/100`} sub={patioHealthScore >= 70 ? 'pátio saudável' : patioHealthScore >= 45 ? 'atenção necessária' : 'situação crítica'} color={healthColor} icon={<Activity size={16} />} />
          <KPICard label="Zona crítica" value={String(criticalCount)} sub="veículos críticos/emergência" color={criticalCount > 0 ? 'var(--red)' : 'var(--neon)'} icon={<Zap size={16} />} />
        </div>
      </div>

      {/* ── Heatmap do pátio ─────────────────────────────────────────────── */}
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)' }}>Mapa de Calor do Pátio</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(['info', 'attention', 'warning', 'critical', 'emergency'] as AlertLevel[]).map(level => (
              <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: ALERT_COLORS[level] }} />
                <span style={{ fontSize: 9, color: 'var(--t3)' }}>{ALERT_LABELS[level]}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {available.map(v => {
            const alert = alertMap.get(v.id)
            const health = healthMap.get(v.id)
            const dep = depreciationMap.get(v.id)
            if (!alert) return null
            const isSelected = selectedVehicleId === v.id
            return (
              <div
                key={v.id}
                onClick={() => setSelectedVehicleId(isSelected ? null : v.id)}
                style={{
                  background: isSelected ? ALERT_BG_COLORS[alert.level] : 'var(--el)',
                  border: `1.5px solid ${isSelected ? alert.color : ALERT_BG_COLORS[alert.level]}`,
                  borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                  transition: 'all .15s', position: 'relative', overflow: 'hidden',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = alert.color }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = ALERT_BG_COLORS[alert.level] }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: alert.color, borderRadius: '8px 8px 0 0' }} />
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.brand} {v.model}
                </p>
                <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1 }}>{v.year_model} · {v.km?.toLocaleString('pt-BR')} km</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: ALERT_BG_COLORS[alert.level], color: alert.color }}>
                    {alert.daysInStock}d
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: health ? (health.total >= 65 ? 'var(--neon)' : health.total >= 40 ? 'var(--yel)' : 'var(--red)') : 'var(--t3)' }}>
                    ♥ {health?.total ?? '—'}
                  </span>
                </div>
                {dep && dep.accumulatedLossR$ > 100 && (
                  <p style={{ fontSize: 9, color: 'var(--red)', marginTop: 3 }}>
                    -{formatCurrency(dep.accumulatedLossR$)}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        {available.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '24px 0' }}>Nenhum veículo disponível</p>
        )}
      </Card>

      {/* ── Vehicle detail panel ─────────────────────────────────────────── */}
      {selectedVehicle && selectedAlert && selectedDepreciation && selectedHealth && (
        <Card style={{ padding: '18px 20px', border: `1px solid ${selectedAlert.color}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>
                  {selectedVehicle.brand} {selectedVehicle.model} {selectedVehicle.version}
                </h3>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: ALERT_BG_COLORS[selectedAlert.level], color: selectedAlert.color }}>
                  {selectedAlert.label.toUpperCase()}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {selectedVehicle.year_model} · {selectedVehicle.km?.toLocaleString('pt-BR')} km · {selectedVehicle.color} · {selectedVehicle.fuel}
              </p>
            </div>
            <button onClick={() => setSelectedVehicleId(null)} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4 }}>
              <XIcon size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Preço de compra',    value: formatCurrency(selectedDepreciation.basePrice),             color: 'var(--t)' },
              { label: 'Valor est. mercado', value: formatCurrency(selectedDepreciation.estimatedCurrentValue), color: 'var(--blu)' },
              { label: 'Perda acumulada',    value: formatCurrency(selectedDepreciation.accumulatedLossR$),     color: 'var(--red)' },
              { label: 'Perda próx. 30d',    value: formatCurrency(selectedDepreciation.projectedLoss30dR$),    color: 'var(--ora)' },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--el)', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{item.label}</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: item.color, fontFamily: 'var(--fm)' }}>{item.value}</p>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              Score de saúde — {selectedHealth.total}/100 (Nota {selectedHealth.grade})
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { label: 'Dias em estoque',    score: selectedHealth.components.daysScore,          max: 40 },
                { label: 'Alinhamento preço',  score: selectedHealth.components.priceScore,         max: 30 },
                { label: 'Completude anúncio', score: selectedHealth.components.completenessScore,  max: 15 },
                { label: 'Nível de interesse', score: selectedHealth.components.interestScore,      max: 15 },
              ].map(c => {
                const pct = (c.score / c.max) * 100
                const barColor = pct >= 70 ? 'var(--neon)' : pct >= 40 ? 'var(--yel)' : 'var(--red)'
                return (
                  <div key={c.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: 'var(--t3)' }}>{c.label}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: barColor }}>{c.score}/{c.max}</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--b)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width .4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ background: ALERT_BG_COLORS[selectedAlert.level], border: `1px solid ${selectedAlert.color}40`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Zap size={13} style={{ color: selectedAlert.color, flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: selectedAlert.color, marginBottom: 2 }}>Ação recomendada</p>
              <p style={{ fontSize: 12, color: 'var(--t)' }}>{selectedAlert.suggestedAction}</p>
              {selectedAlert.priceAdjustment && (
                <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
                  Sugestão: reduzir preço em ~{selectedAlert.priceAdjustment}%
                  {' '}(de {formatCurrency(selectedVehicle.sale_price ?? 0)} para{' '}
                  {formatCurrency((selectedVehicle.sale_price ?? 0) * (1 - selectedAlert.priceAdjustment / 100))})
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── Action table ─────────────────────────────────────────────────── */}
      {vehiclesNeedingAction.length > 0 && (
        <Card style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>
            Ações Pendentes — {vehiclesNeedingAction.length} veículo{vehiclesNeedingAction.length > 1 ? 's' : ''} prioritário{vehiclesNeedingAction.length > 1 ? 's' : ''}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--b)' }}>
                  {['Nível', 'Veículo', 'Dias', 'Perda acum.', 'Risco preço', 'Score', 'Ação sugerida'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehiclesNeedingAction.map(v => {
                  const alert  = alertMap.get(v.id)!
                  const dep    = depreciationMap.get(v.id)!
                  const health = healthMap.get(v.id)!
                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--bs)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => setSelectedVehicleId(v.id === selectedVehicleId ? null : v.id)}
                    >
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: ALERT_BG_COLORS[alert.level], color: alert.color }}>
                          {alert.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--t)', fontWeight: 600 }}>
                        {v.brand} {v.model} <span style={{ fontSize: 9, color: 'var(--t3)', marginLeft: 4 }}>{v.year_model}</span>
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: 'var(--fm)', color: alert.color, fontWeight: 700 }}>{alert.daysInStock}d</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'var(--fm)', color: 'var(--red)' }}>{formatCurrency(dep.accumulatedLossR$)}</td>
                      <td style={{ padding: '8px 10px', color: dep.marginRisk > 10 ? 'var(--red)' : dep.marginRisk > 0 ? 'var(--yel)' : 'var(--neon)', fontWeight: 700 }}>
                        {dep.marginRisk > 0 ? `+${dep.marginRisk.toFixed(1)}%` : `${dep.marginRisk.toFixed(1)}%`}
                      </td>
                      <td style={{ padding: '8px 10px', color: health.total >= 65 ? 'var(--neon)' : health.total >= 40 ? 'var(--yel)' : 'var(--red)', fontWeight: 700 }}>
                        {health.total} ({health.grade})
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--t2)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {alert.suggestedAction}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
