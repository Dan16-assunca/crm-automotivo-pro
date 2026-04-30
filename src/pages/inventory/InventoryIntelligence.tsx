import { useMemo, useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  AlertTriangle, TrendingDown, Clock, DollarSign, Zap,
  Activity, TrendingUp, X as XIcon, CheckCircle, Bell,
  ChevronDown, ChevronRight, ArrowUp, ArrowDown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { formatCurrency, computeDaysInStock } from '@/utils/format'
import type { Vehicle } from '@/types'
import { calculateDepreciationBatch } from '@/modules/inventory-intelligence/engines/DepreciationEngine'
import { generateAlertBatch, getVehiclesNeedingAction } from '@/modules/inventory-intelligence/engines/AlertEngine'
import { calculateHealthScoreBatch, calculatePatioHealthScore } from '@/modules/inventory-intelligence/engines/HealthScoreEngine'
import { ALERT_COLORS, ALERT_BG_COLORS, ALERT_LABELS } from '@/modules/inventory-intelligence/utils/alertThresholds'
import type { AlertLevel } from '@/modules/inventory-intelligence/types/inventory.types'

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  neon:   '#39ff14',
  green:  '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red:    '#ef4444',
  purple: '#8b5cf6',
  t:      'var(--t)',
  t2:     'var(--t2)',
  t3:     'var(--t3)',
}

const BRAND_COLORS = ['#39ff14','#22c55e','#3b82f6','#8b5cf6','#f97316','#eab308','#ec4899','#06b6d4']
const PATIO_META_GIRO = 18   // dias — meta padrão configurável

// ─── Pure calc functions ──────────────────────────────────────────────────────

function calcLucro(vehicles: Vehicle[]): number {
  return vehicles.reduce((s, v) => {
    if (v.sale_price && v.purchase_price) return s + (v.sale_price - v.purchase_price)
    return s
  }, 0)
}

function calcAvgMargin(vehicles: Vehicle[]): number {
  const with2 = vehicles.filter(v => v.sale_price && v.purchase_price)
  if (!with2.length) return 0
  return with2.reduce((s, v) => s + ((v.sale_price! - v.purchase_price!) / v.sale_price!) * 100, 0) / with2.length
}

function calcAvgDays(vehicles: Vehicle[]): number {
  if (!vehicles.length) return 0
  return Math.round(vehicles.reduce((s, v) => s + (v.days_in_stock ?? 0), 0) / vehicles.length)
}

function calcMarginTrend(vehicles: Vehicle[]): { pct: number; up: boolean } | null {
  const now = new Date()
  const thisMonth = vehicles.filter(v => {
    const d = new Date(v.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && v.sale_price && v.purchase_price
  })
  const lastMonth = vehicles.filter(v => {
    const d = new Date(v.created_at)
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear() && v.sale_price && v.purchase_price
  })
  if (!thisMonth.length || !lastMonth.length) return null
  const cur  = calcAvgMargin(thisMonth)
  const prev = calcAvgMargin(lastMonth)
  if (prev === 0) return null
  const delta = cur - prev
  return { pct: Math.abs(Math.round(delta * 10) / 10), up: delta >= 0 }
}

function calcFipeVs(v: Vehicle): { pct: number; aboveFipe: boolean } | null {
  if (!v.fipe_price || !v.sale_price) return null
  // Sanity check: FIPE deve estar entre 20% e 500% do preço de venda
  // (evita dados digitados errados, ex: 120 em vez de 120000)
  const ratio = v.sale_price / v.fipe_price
  if (ratio > 5 || ratio < 0.2) return null
  const pct = ((v.sale_price - v.fipe_price) / v.fipe_price) * 100
  return { pct: Math.round(Math.abs(pct) * 10) / 10, aboveFipe: pct > 0 }
}

function calcPerdaDia(v: Vehicle): number {
  if (!v.purchase_price) return 0
  return (v.purchase_price * 0.005) / 30   // 0.5%/mês ÷ 30 dias
}

function calcHealthScore(available: Vehicle[]): number {
  if (!available.length) return 100
  const pct30d = available.filter(v => (v.days_in_stock ?? 0) <= 30).length / available.length
  const pts30d = Math.round(pct30d * 40)
  const margin = calcAvgMargin(available)
  const metaMargin = 15
  const ptsMargin = Math.min(30, Math.round((margin / metaMargin) * 30))
  const parados60 = available.filter(v => (v.days_in_stock ?? 0) > 60).length
  const pts60 = parados60 === 0 ? 30 : Math.max(0, 30 - parados60 * 5)
  return Math.min(100, pts30d + ptsMargin + pts60)
}

function buildBubbleData(available: Vehicle[]) {
  const map: Record<string, { margin: number[]; days: number[]; count: number }> = {}
  available.filter(v => v.sale_price && v.purchase_price).forEach(v => {
    const m = ((v.sale_price! - v.purchase_price!) / v.sale_price!) * 100
    if (!map[v.brand]) map[v.brand] = { margin: [], days: [], count: 0 }
    map[v.brand].margin.push(m)
    map[v.brand].days.push(v.days_in_stock ?? 0)
    map[v.brand].count++
  })
  return Object.entries(map).map(([brand, d], i) => ({
    brand,
    x: Math.round((d.margin.reduce((a, b) => a + b, 0) / d.margin.length) * 10) / 10,
    y: Math.round(d.days.reduce((a, b) => a + b, 0) / d.days.length),
    z: d.count,
    color: BRAND_COLORS[i % BRAND_COLORS.length],
  }))
}

function buildUrgencyRanking(available: Vehicle[]) {
  return [...available]
    .filter(v => v.purchase_price)
    .map(v => {
      const dias = v.days_in_stock ?? 0
      const perdaDia = calcPerdaDia(v)
      const urgencia = dias * perdaDia
      const fipe = calcFipeVs(v)
      return { ...v, perdaDia, urgencia, fipe }
    })
    .sort((a, b) => b.urgencia - a.urgencia)
    .slice(0, 20)
}

function buildSmartAlerts(available: Vehicle[]): Array<{ msg: string; severity: 'red' | 'yellow' | 'purple' }> {
  const alerts: Array<{ msg: string; severity: 'red' | 'yellow' | 'purple' }> = []
  available.forEach(v => {
    const dias = v.days_in_stock ?? 0
    const fipe = calcFipeVs(v)
    if (dias > 30 && dias <= 60) {
      alerts.push({ msg: `${v.brand} ${v.model} está há ${dias} dias sem proposta. Considere reduzir R$ ${Math.round(calcPerdaDia(v) * 15).toLocaleString('pt-BR')}.`, severity: 'yellow' })
    }
    if (dias > 60) {
      alerts.push({ msg: `${v.brand} ${v.model} parado há ${dias} dias. Situação crítica — ação imediata.`, severity: 'red' })
    }
    if (fipe && fipe.aboveFipe && fipe.pct > 0.5) {
      alerts.push({ msg: `${v.brand} ${v.model} está ${fipe.pct.toFixed(1)}% acima da FIPE. Pode dificultar a venda.`, severity: 'yellow' })
    }
  })
  const brands = [...new Set(available.map(v => v.brand.toLowerCase()))]
  const suvKeywords = ['compass', 'creta', 'hr-v', 'renegade', 'tucson', 'corolla cross', 'kicks', 'tracker', 'pulse']
  const hasSuv = available.some(v => suvKeywords.some(k => v.model?.toLowerCase().includes(k)))
  if (!hasSuv && available.length > 0) {
    alerts.push({ msg: 'Você não tem SUVs disponíveis. Categoria com alta procura neste período.', severity: 'purple' })
  }
  if (!brands.some(b => ['byd', 'tesla', 'volvo'].includes(b)) && available.length > 0) {
    alerts.push({ msg: 'Nenhum elétrico/híbrido no estoque. Segmento em crescimento acelerado.', severity: 'purple' })
  }
  return alerts.slice(0, 6)
}

// ─── Gauge SVG semicircular ───────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const radius = 72
  const cx = 100
  const cy = 90
  const startAngle = Math.PI
  const endAngle   = 0
  const pct = Math.min(score / 100, 1)
  const angle = Math.PI - pct * Math.PI

  const bgX1 = cx + radius * Math.cos(startAngle)
  const bgY1 = cy + radius * Math.sin(startAngle)
  const bgX2 = cx + radius * Math.cos(endAngle)
  const bgY2 = cy + radius * Math.sin(endAngle)

  const valX = cx + radius * Math.cos(angle)
  const valY = cy + radius * Math.sin(angle)

  const color = score >= 80 ? C.green : score >= 60 ? C.yellow : C.red
  const label = score >= 80 ? 'Estoque saudável' : score >= 60 ? 'Atenção necessária' : 'Ação urgente'

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={200} height={110} viewBox="0 0 200 110">
        {/* Track */}
        <path
          d={`M ${bgX1} ${bgY1} A ${radius} ${radius} 0 0 1 ${bgX2} ${bgY2}`}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={14} strokeLinecap="round"
        />
        {/* Colored fill */}
        <path
          d={`M ${bgX1} ${bgY1} A ${radius} ${radius} 0 0 1 ${valX} ${valY}`}
          fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
          style={{ transition: 'all .6s' }}
        />
        {/* Needle dot */}
        <circle cx={valX} cy={valY} r={5} fill={color} />
        {/* Score text */}
        <text x={cx} y={cy - 8} textAnchor="middle" fill={color} fontSize={28} fontWeight={800} fontFamily="monospace">{score}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="rgba(255,255,255,.4)" fontSize={10}>/100</text>
      </svg>
      <p style={{ fontSize: 12, fontWeight: 700, color, marginTop: -8 }}>{label}</p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        {[{ c: C.green, l: '80–100 Saudável' }, { c: C.yellow, l: '60–79 Atenção' }, { c: C.red, l: '0–59 Crítico' }].map(({ c, l }) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
            <span style={{ fontSize: 9, color: C.t3 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color = C.neon, icon, pulse = false }: {
  label: string; value: string; sub?: string; color?: string; icon: React.ReactNode; pulse?: boolean
}) {
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 10,
      border: pulse ? `1px solid ${C.red}` : '1px solid var(--bs)',
      padding: '14px 16px',
      animation: pulse ? 'pulse-border 2s infinite' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</p>
        <div style={{ color, opacity: .75 }}>{icon}</div>
      </div>
      <p style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1, fontFamily: 'var(--fm)' }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

// ─── Patio Semaphore ──────────────────────────────────────────────────────────

const SEMAFORO = [
  { label: '0–15d',  min: 0,  max: 15, color: C.green,  bg: 'rgba(34,197,94,.10)'  },
  { label: '16–30d', min: 16, max: 30, color: C.yellow, bg: 'rgba(234,179,8,.10)'  },
  { label: '31–60d', min: 31, max: 60, color: C.orange, bg: 'rgba(249,115,22,.10)' },
  { label: '+60d',   min: 61, max: Infinity, color: C.red, bg: 'rgba(239,68,68,.10)' },
]

function PatioSemaphore({ available, onFilter, activeFilter }: {
  available: Vehicle[];
  onFilter: (band: string | null) => void;
  activeFilter: string | null;
}) {
  const bands = SEMAFORO.map(s => {
    const vs = available.filter(v => {
      const d = v.days_in_stock ?? 0
      return d >= s.min && d <= s.max
    })
    const valor = vs.reduce((acc, v) => acc + (v.purchase_price ?? v.sale_price ?? 0), 0)
    return { ...s, vehicles: vs, valor }
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {bands.map(b => {
        const isActive = activeFilter === b.label
        return (
          <div
            key={b.label}
            onClick={() => onFilter(isActive ? null : b.label)}
            style={{
              background: isActive ? b.bg : 'var(--el)',
              border: `1.5px solid ${isActive ? b.color : 'rgba(255,255,255,0.06)'}`,
              borderTop: `3px solid ${b.color}`,
              borderRadius: 10, padding: '12px 14px',
              cursor: 'pointer', transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = b.color }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, color: b.color, marginBottom: 4 }}>{b.label}</p>
            <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--t)', fontFamily: 'var(--fm)', lineHeight: 1 }}>{b.vehicles.length}</p>
            <p style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>veíc.</p>
            {b.valor > 0 && (
              <p style={{ fontSize: 10, fontWeight: 700, color: b.color, marginTop: 6 }}>{formatCurrency(b.valor)}</p>
            )}
            {b.vehicles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 8 }}>
                {b.vehicles.slice(0, 6).map(v => (
                  <span key={v.id} style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 5,
                    background: `${b.color}20`, color: b.color,
                  }} title={`${v.brand} ${v.model}`}>
                    {`${v.brand[0]}${v.model[0]}`.toUpperCase()}
                  </span>
                ))}
                {b.vehicles.length > 6 && <span style={{ fontSize: 9, color: C.t3 }}>+{b.vehicles.length - 6}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Bubble tooltip ───────────────────────────────────────────────────────────

function BubbleTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div style={{ background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
      <p style={{ fontWeight: 700, color: d.color, marginBottom: 4 }}>{d.brand}</p>
      <p style={{ color: C.t2 }}>{d.z} veículo{d.z > 1 ? 's' : ''}</p>
      <p style={{ color: C.t2 }}>Margem: <strong style={{ color: C.t }}>{d.x.toFixed(1)}%</strong></p>
      <p style={{ color: C.t2 }}>Giro: <strong style={{ color: C.t }}>{d.y}d</strong></p>
    </div>
  )
}

// ─── Offer Modal ──────────────────────────────────────────────────────────────

function OfferModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [price, setPrice] = useState(String(vehicle.sale_price ?? ''))
  const [msg, setMsg] = useState(`Olá! Temos uma oferta especial para o ${vehicle.brand} ${vehicle.model} ${vehicle.year_model}. Preço atualizado: R$ ${vehicle.sale_price?.toLocaleString('pt-BR')}. Tem interesse?`)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: 'var(--bg)', border: '1px solid var(--b)', borderRadius: 12, padding: '20px 24px', maxWidth: 460, width: '100%' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>Criar Oferta — {vehicle.brand} {vehicle.model}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer' }}><XIcon size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>Novo preço (R$)</label>
            <input value={price} onChange={e => setPrice(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>Mensagem WhatsApp</label>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, background: 'var(--bg3)', border: '1px solid var(--b)', color: 'var(--t)', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '9px', borderRadius: 7, border: '1px solid var(--b)', background: 'transparent', color: C.t2, fontSize: 12, cursor: 'pointer' }}>
              Cancelar
            </button>
            <button
              style={{ flex: 1, padding: '9px', borderRadius: 7, border: 'none', background: '#25D366', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Notificar leads via WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InventoryIntelligence() {
  const { store } = useAuthStore()
  const storeId = store?.id ?? ''
  const [patioFilter, setPatioFilter] = useState<string | null>(null)
  const [expandedRow, setExpandedRow]   = useState<string | null>(null)
  const [dismissedAlerts, setDismissedAlerts] = useState<number[]>([])
  const [offerVehicle, setOfferVehicle] = useState<Vehicle | null>(null)

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
  const stalled   = useMemo(() => available.filter(v => (v.days_in_stock ?? 0) > 60), [available])

  // KPI values
  const totalValue     = useMemo(() => available.reduce((s, v) => s + (v.sale_price ?? 0), 0), [available])
  const avgDays        = useMemo(() => calcAvgDays(available), [available])
  const avgMargin      = useMemo(() => Math.round(calcAvgMargin(available) * 10) / 10, [available])
  const lucro          = useMemo(() => calcLucro(available), [available])
  const marginTrend    = useMemo(() => calcMarginTrend(vehicles), [vehicles])
  const healthScore    = useMemo(() => calcHealthScore(available), [available])
  const bubbleData     = useMemo(() => buildBubbleData(available), [available])
  const urgencyList    = useMemo(() => buildUrgencyRanking(available), [available])
  const smartAlerts    = useMemo(() => buildSmartAlerts(available), [available])

  // Existing engines
  const depreciationMap       = useMemo(() => calculateDepreciationBatch(available), [available])
  const alertMap              = useMemo(() => generateAlertBatch(available, depreciationMap), [available, depreciationMap])
  const healthMap             = useMemo(() => calculateHealthScoreBatch(available, depreciationMap), [available, depreciationMap])
  const patioHealthScore      = useMemo(() => calculatePatioHealthScore(available, healthMap), [available, healthMap])
  const vehiclesNeedingAction = useMemo(() => getVehiclesNeedingAction(available, alertMap), [available, alertMap])
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const selectedVehicle      = useMemo(() => available.find(v => v.id === selectedVehicleId) ?? null, [available, selectedVehicleId])
  const selectedDepreciation = selectedVehicleId ? depreciationMap.get(selectedVehicleId) : undefined
  const selectedAlert        = selectedVehicleId ? alertMap.get(selectedVehicleId) : undefined
  const selectedHealth       = selectedVehicleId ? healthMap.get(selectedVehicleId) : undefined

  // Filtered table
  const tableVehicles = useMemo(() => {
    const base = [...available].sort((a, b) => (b.days_in_stock ?? 0) - (a.days_in_stock ?? 0))
    if (!patioFilter) return base
    const band = SEMAFORO.find(s => s.label === patioFilter)
    if (!band) return base
    return base.filter(v => {
      const d = v.days_in_stock ?? 0
      return d >= band.min && d <= band.max
    })
  }, [available, patioFilter])

  const healthColor = healthScore >= 80 ? C.green : healthScore >= 60 ? C.yellow : C.red

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[...Array(4)].map((_, i) => <div key={i} style={{ height: 80, background: 'var(--card)', borderRadius: 9, opacity: .4 }} />)}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* CSS keyframes */}
      <style>{`
        @keyframes pulse-border {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.35); }
          50%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
      `}</style>

      {/* ─── Critical banner ───────────────────────────────────────────── */}
      {healthScore < 60 && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.red }}>Saúde do estoque crítica — Score {healthScore}/100</p>
            <p style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>Há veículos parados há muito tempo e/ou margens abaixo da meta. Veja o Ranking de Urgência abaixo.</p>
          </div>
        </div>
      )}

      {/* ─── Header ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Inteligência de Estoque</h1>
          <p style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>Painel de decisão — giro · margem · capital · urgência</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: `${healthColor}12`, border: `1px solid ${healthColor}40`, borderRadius: 8, padding: '6px 12px' }}>
          <Activity size={13} style={{ color: healthColor }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: healthColor }}>Score {healthScore}/100</span>
        </div>
      </div>

      {/* ─── Smart Alerts ──────────────────────────────────────────────── */}
      {smartAlerts.filter((_, i) => !dismissedAlerts.includes(i)).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Bell size={11} /> Alertas Inteligentes
          </p>
          {smartAlerts.map((a, i) => {
            if (dismissedAlerts.includes(i)) return null
            const borderCol = a.severity === 'red' ? C.red : a.severity === 'yellow' ? C.yellow : C.purple
            return (
              <div key={i} style={{
                background: `${borderCol}08`, border: '1px solid rgba(255,255,255,.06)',
                borderLeft: `3px solid ${borderCol}`, borderRadius: 8,
                padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <p style={{ fontSize: 12, color: 'var(--t)' }}>{a.msg}</p>
                <button onClick={() => setDismissedAlerts(p => [...p, i])}
                  style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', flexShrink: 0, padding: 2 }}>
                  <XIcon size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── KPIs (6 cards) ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>

        {/* Capital imobilizado */}
        <KPICard
          label="Capital imobilizado" icon={<DollarSign size={16} />}
          value={formatCurrency(totalValue)} sub="valor de venda"
          color="var(--t)"
        />

        {/* Giro médio vs meta */}
        <KPICard
          label="Giro médio" icon={<Clock size={16} />}
          value={`${avgDays}d`}
          sub={`meta ${PATIO_META_GIRO}d${avgDays > PATIO_META_GIRO ? ' ⚠️ acima' : ' ✅ dentro'}`}
          color={avgDays > PATIO_META_GIRO ? C.red : C.green}
        />

        {/* Parados +60d */}
        <KPICard
          label="Parados +60d" icon={stalled.length > 0 ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          value={String(stalled.length)}
          sub={stalled.length === 0 ? 'nenhum parado' : `${Math.round((stalled.length / (available.length || 1)) * 100)}% do estoque`}
          color={stalled.length > 0 ? C.red : C.green}
          pulse={stalled.length > 0}
        />

        {/* Margem média */}
        <KPICard
          label="Margem média" icon={<TrendingDown size={16} />}
          value={`${avgMargin}%`} sub="sobre preço de venda"
          color={avgMargin >= 15 ? C.green : avgMargin >= 8 ? C.yellow : C.red}
        />

        {/* Lucro potencial */}
        <KPICard
          label="Lucro potencial" icon={<Zap size={16} />}
          value={formatCurrency(lucro)} sub="a realizar"
          color={C.neon}
        />

        {/* Tendência de margem */}
        <KPICard
          label="Tendência margem"
          icon={marginTrend
            ? (marginTrend.up ? <ArrowUp size={16} /> : <ArrowDown size={16} />)
            : <Activity size={16} />}
          value={marginTrend ? `${marginTrend.up ? '+' : '-'}${marginTrend.pct}%` : '—'}
          sub={marginTrend ? (marginTrend.up ? 'vs mês anterior ↑' : 'vs mês anterior ↓') : 'sem dados mês anterior'}
          color={marginTrend ? (marginTrend.up ? C.green : C.red) : C.t3}
        />
      </div>

      {/* ─── Semáforo de Pátio + Health Gauge ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
        <Card style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>Semáforo de Pátio</p>
          <p style={{ fontSize: 10, color: C.t3, marginBottom: 14 }}>Clique em uma faixa para filtrar a tabela abaixo</p>
          <PatioSemaphore available={available} onFilter={setPatioFilter} activeFilter={patioFilter} />
          {patioFilter && (
            <button onClick={() => setPatioFilter(null)}
              style={{ marginTop: 10, fontSize: 10, color: C.t3, background: 'none', border: '1px solid var(--b)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
              × Limpar filtro
            </button>
          )}
        </Card>

        <Card style={{ padding: '16px 18px', minWidth: 220 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 12, textAlign: 'center' }}>Saúde do Estoque</p>
          <HealthGauge score={healthScore} />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: 'Veíc. < 30d', pts: Math.min(40, Math.round((available.filter(v => (v.days_in_stock ?? 0) <= 30).length / (available.length || 1)) * 40)), max: 40 },
              { label: 'Margem vs meta', pts: Math.min(30, Math.round((avgMargin / 15) * 30)), max: 30 },
              { label: 'Sem parados +60d', pts: stalled.length === 0 ? 30 : Math.max(0, 30 - stalled.length * 5), max: 30 },
            ].map(c => {
              const pct = (c.pts / c.max) * 100
              const bc  = pct >= 70 ? C.green : pct >= 40 ? C.yellow : C.red
              return (
                <div key={c.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 9, color: C.t3 }}>{c.label}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: bc }}>{c.pts}/{c.max}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--b)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: bc, borderRadius: 4 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* ─── Bubble chart ──────────────────────────────────────────────── */}
      {bubbleData.length > 0 && (
        <Card style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Desempenho por Marca</p>
          <p style={{ fontSize: 10, color: C.t3, marginBottom: 12 }}>
            Eixo X = margem média · Eixo Y = giro médio (dias) · Tamanho = quantidade de veículos
          </p>
          <div style={{ position: 'relative' }}>
            {/* Quadrant highlights */}
            <div style={{ position: 'absolute', top: 0, right: '50%', bottom: '50%', left: 0, background: 'rgba(239,68,68,.04)', zIndex: 0, borderRadius: '8px 0 0 0' }} />
            <div style={{ position: 'absolute', top: '50%', right: 0, bottom: 0, left: '50%', background: 'rgba(34,197,94,.04)', zIndex: 0, borderRadius: '0 0 8px 0' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ top: 16, right: 20, bottom: 20, left: 10 }}>
                  <XAxis
                    dataKey="x" name="Margem" unit="%" type="number"
                    tick={{ fontSize: 9, fill: C.t3 }} axisLine={false} tickLine={false}
                    label={{ value: 'Margem %', position: 'insideBottomRight', offset: -4, fontSize: 9, fill: C.t3 }}
                  />
                  <YAxis
                    dataKey="y" name="Giro" unit="d" type="number"
                    tick={{ fontSize: 9, fill: C.t3 }} axisLine={false} tickLine={false}
                    label={{ value: 'Giro (dias)', angle: -90, position: 'insideLeft', fontSize: 9, fill: C.t3 }}
                  />
                  <ZAxis dataKey="z" range={[80, 500]} />
                  <ReferenceLine x={avgMargin} stroke="rgba(255,255,255,.08)" strokeDasharray="4 4" />
                  <ReferenceLine y={PATIO_META_GIRO} stroke="rgba(255,255,255,.08)" strokeDasharray="4 4" />
                  <RTooltip content={<BubbleTooltip />} cursor={false} />
                  {bubbleData.map(d => (
                    <Scatter key={d.brand} name={d.brand} data={[d]} fill={d.color} opacity={0.85} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {bubbleData.map(d => (
              <div key={d.brand} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                <span style={{ fontSize: 10, color: C.t2 }}>{d.brand}</span>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 9, color: C.t3, display: 'flex', gap: 10 }}>
              <span style={{ color: `${C.green}99` }}>↘ Quadrante ideal (↑ margem + ↓ giro)</span>
              <span style={{ color: `${C.red}99` }}>↖ Quadrante crítico (↓ margem + ↑ giro)</span>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Ranking de Urgência ───────────────────────────────────────── */}
      {urgencyList.length > 0 && (
        <Card style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Ranking de Urgência de Venda</p>
          <p style={{ fontSize: 10, color: C.t3, marginBottom: 14 }}>Ordenado por custo diário × tempo no estoque</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--b)' }}>
                  {['#', 'Veículo', 'Dias', 'Perda est./dia', 'Preço atual', 'vs FIPE', 'Ação'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {urgencyList.map((v, idx) => {
                  const dias = v.days_in_stock ?? 0
                  const daysColor = dias > 60 ? C.red : dias > 30 ? C.orange : dias > 15 ? C.yellow : C.green
                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--bs)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '8px 10px', color: C.t3, fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--t)', fontWeight: 600 }}>
                        {v.brand} {v.model}
                        {v.version && <span style={{ fontSize: 9, color: C.t3, marginLeft: 4 }}>{v.version}</span>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${daysColor}18`, color: daysColor }}>
                          {dias}d
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: C.red, fontWeight: 700, fontFamily: 'var(--fm)' }}>
                        -{formatCurrency(v.perdaDia)}/d
                      </td>
                      <td style={{ padding: '8px 10px', color: C.neon, fontFamily: 'var(--fm)', fontWeight: 700 }}>
                        {formatCurrency(v.sale_price ?? 0)}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {v.fipe ? (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                            background: v.fipe.aboveFipe ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)',
                            color: v.fipe.aboveFipe ? C.red : C.green,
                          }}>
                            {v.fipe.aboveFipe ? '+' : '-'}{v.fipe.pct.toFixed(1)}%
                          </span>
                        ) : <span style={{ color: C.t3 }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <button
                          onClick={() => setOfferVehicle(v)}
                          style={{
                            fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                            border: `1px solid ${C.neon}60`, background: `${C.neon}10`,
                            color: C.neon, cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>
                          Criar oferta
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ─── Análise Detalhada (filtrada + expandível) ─────────────────── */}
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)' }}>
            Análise Detalhada — {patioFilter ? `Filtro: ${patioFilter}` : 'Todos disponíveis'}
          </p>
          <span style={{ fontSize: 10, color: C.t3 }}>({tableVehicles.length} veículos)</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--b)' }}>
                {['', 'Veículo', 'Ano', 'KM', 'Compra', 'Venda', 'Margem', 'Perda/dia', 'vs FIPE', 'Dias'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableVehicles.map(v => {
                const margin = v.sale_price && v.purchase_price
                  ? Math.round(((v.sale_price - v.purchase_price) / v.sale_price) * 100 * 10) / 10
                  : null
                const dias = v.days_in_stock ?? 0
                const daysColor = dias > 60 ? C.red : dias > 30 ? C.orange : dias > 15 ? C.yellow : C.green
                const perdaDia = calcPerdaDia(v)
                const fipe = calcFipeVs(v)
                const isExpanded = expandedRow === v.id
                return (
                  <>
                    <tr key={v.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--bs)', cursor: 'pointer' }}
                      onClick={() => setExpandedRow(isExpanded ? null : v.id)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
                      onMouseLeave={e => (e.currentTarget.style.background = isExpanded ? 'rgba(61,247,16,.03)' : 'transparent')}
                    >
                      <td style={{ padding: '7px 10px', color: C.t3 }}>
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </td>
                      <td style={{ padding: '7px 10px', color: 'var(--t)', fontWeight: 600 }}>{v.brand} {v.model}</td>
                      <td style={{ padding: '7px 10px', color: C.t2 }}>{v.year_model}</td>
                      <td style={{ padding: '7px 10px', color: C.t2, fontFamily: 'var(--fm)' }}>{v.km?.toLocaleString('pt-BR')}</td>
                      <td style={{ padding: '7px 10px', color: C.t2, fontFamily: 'var(--fm)' }}>{v.purchase_price ? formatCurrency(v.purchase_price) : '—'}</td>
                      <td style={{ padding: '7px 10px', color: C.neon, fontFamily: 'var(--fm)', fontWeight: 700 }}>{formatCurrency(v.sale_price ?? 0)}</td>
                      <td style={{ padding: '7px 10px', fontWeight: 700, color: margin !== null ? (margin > 15 ? C.green : margin > 5 ? C.yellow : C.red) : C.t3 }}>
                        {margin !== null ? `${margin}%` : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', color: perdaDia > 0 ? C.red : C.t3, fontFamily: 'var(--fm)' }}>
                        {perdaDia > 0 ? `-${formatCurrency(perdaDia)}` : '—'}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        {fipe ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: fipe.aboveFipe ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)', color: fipe.aboveFipe ? C.red : C.green }}>
                            {fipe.aboveFipe ? '+' : '-'}{fipe.pct.toFixed(1)}%
                          </span>
                        ) : <span style={{ color: C.t3 }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: `${daysColor}18`, color: daysColor }}>{dias}d</span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${v.id}-expanded`} style={{ borderBottom: '1px solid var(--bs)' }}>
                        <td colSpan={10} style={{ padding: '0 10px 12px 28px', background: 'rgba(61,247,16,.02)' }}>
                          <div style={{ display: 'flex', gap: 12, paddingTop: 10 }}>
                            <div style={{ flex: 1, background: 'var(--el)', borderRadius: 8, padding: '10px 14px' }}>
                              <p style={{ fontSize: 9, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Informações</p>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                                {[
                                  ['Cor', v.color ?? '—'],
                                  ['Combustível', v.fuel ?? '—'],
                                  ['Câmbio', v.transmission ?? '—'],
                                  ['Placa', v.plate ?? '—'],
                                ].map(([k, val]) => (
                                  <p key={k} style={{ fontSize: 11, color: C.t2 }}><span style={{ color: C.t3 }}>{k}: </span>{val}</p>
                                ))}
                              </div>
                            </div>
                            <div style={{ flex: 1, background: 'var(--el)', borderRadius: 8, padding: '10px 14px' }}>
                              <p style={{ fontSize: 9, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Análise Financeira</p>
                              {v.fipe_price && (
                                <p style={{ fontSize: 11, color: C.t2, marginBottom: 3 }}>FIPE: <span style={{ color: 'var(--t)', fontWeight: 700 }}>{formatCurrency(v.fipe_price)}</span></p>
                              )}
                              {perdaDia > 0 && (
                                <p style={{ fontSize: 11, color: C.t2, marginBottom: 3 }}>Perda acum. est.: <span style={{ color: C.red, fontWeight: 700 }}>{formatCurrency(perdaDia * dias)}</span></p>
                              )}
                              {margin !== null && (
                                <p style={{ fontSize: 11, color: C.t2 }}>Margem bruta: <span style={{ color: margin > 15 ? C.green : C.yellow, fontWeight: 700 }}>{margin}%</span></p>
                              )}
                            </div>
                            <button
                              onClick={() => setOfferVehicle(v)}
                              style={{ alignSelf: 'center', fontSize: 11, fontWeight: 700, padding: '8px 14px', borderRadius: 7, border: `1px solid ${C.neon}50`, background: `${C.neon}10`, color: C.neon, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              Criar ação de venda
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          {tableVehicles.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: C.t3, fontSize: 12 }}>
              {patioFilter ? `Nenhum veículo na faixa ${patioFilter}` : 'Nenhum veículo disponível'}
            </div>
          )}
        </div>
      </Card>

      {/* ─── Inteligência preditiva (engines) ─────────────────────────── */}
      <div>
        <p style={{ fontSize: 9, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>
          Inteligência Preditiva
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <KPICard label="Depreciação acumulada"
            value={formatCurrency([...depreciationMap.values()].reduce((s, d) => s + d.accumulatedLossR$, 0))}
            sub="perda total no estoque" color={C.t2} icon={<TrendingDown size={16} />} />
          <KPICard label="Previsão próximos 30d"
            value={formatCurrency([...depreciationMap.values()].reduce((s, d) => s + d.projectedLoss30dR$, 0))}
            sub="perda estimada/mês" color={C.yellow} icon={<TrendingUp size={16} />} />
          <KPICard label="Score pátio (engine)"
            value={`${patioHealthScore}/100`}
            sub={patioHealthScore >= 70 ? 'pátio saudável' : patioHealthScore >= 45 ? 'atenção necessária' : 'situação crítica'}
            color={patioHealthScore >= 70 ? C.green : patioHealthScore >= 45 ? C.yellow : C.red}
            icon={<Activity size={16} />} />
          <KPICard label="Zona crítica"
            value={String([...alertMap.values()].filter(a => a.level === 'critical' || a.level === 'emergency').length)}
            sub="veículos críticos/emergência"
            color={[...alertMap.values()].filter(a => a.level === 'critical' || a.level === 'emergency').length > 0 ? C.red : C.green}
            icon={<Zap size={16} />} />
        </div>
      </div>

      {/* ─── Heatmap do pátio (preservado) ────────────────────────────── */}
      <Card style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)' }}>Mapa de Calor do Pátio</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(['info', 'attention', 'warning', 'critical', 'emergency'] as AlertLevel[]).map(level => (
              <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: ALERT_COLORS[level] }} />
                <span style={{ fontSize: 9, color: C.t3 }}>{ALERT_LABELS[level]}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {available.map(v => {
            const alert  = alertMap.get(v.id)
            const health = healthMap.get(v.id)
            const dep    = depreciationMap.get(v.id)
            if (!alert) return null
            const isSel = selectedVehicleId === v.id
            return (
              <div key={v.id} onClick={() => setSelectedVehicleId(isSel ? null : v.id)}
                style={{ background: isSel ? ALERT_BG_COLORS[alert.level] : 'var(--el)', border: `1.5px solid ${isSel ? alert.color : ALERT_BG_COLORS[alert.level]}`, borderRadius: 8, padding: '8px 10px', cursor: 'pointer', transition: 'all .15s', position: 'relative', overflow: 'hidden' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = alert.color }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = ALERT_BG_COLORS[alert.level] }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, background: alert.color, borderRadius: '8px 8px 0 0' }} />
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.brand} {v.model}</p>
                <p style={{ fontSize: 9, color: C.t3, marginTop: 1 }}>{v.year_model} · {v.km?.toLocaleString('pt-BR')} km</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: ALERT_BG_COLORS[alert.level], color: alert.color }}>{alert.daysInStock}d</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: health ? (health.total >= 65 ? C.green : health.total >= 40 ? C.yellow : C.red) : C.t3 }}>♥ {health?.total ?? '—'}</span>
                </div>
                {dep && dep.accumulatedLossR$ > 100 && <p style={{ fontSize: 9, color: C.red, marginTop: 3 }}>-{formatCurrency(dep.accumulatedLossR$)}</p>}
              </div>
            )
          })}
        </div>
        {available.length === 0 && <p style={{ fontSize: 12, color: C.t3, textAlign: 'center', padding: '24px 0' }}>Nenhum veículo disponível</p>}
      </Card>

      {/* ─── Vehicle detail panel ──────────────────────────────────────── */}
      {selectedVehicle && selectedAlert && selectedDepreciation && selectedHealth && (
        <Card style={{ padding: '18px 20px', border: `1px solid ${selectedAlert.color}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>{selectedVehicle.brand} {selectedVehicle.model} {selectedVehicle.version}</h3>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: ALERT_BG_COLORS[selectedAlert.level], color: selectedAlert.color }}>{selectedAlert.label.toUpperCase()}</span>
              </div>
              <p style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{selectedVehicle.year_model} · {selectedVehicle.km?.toLocaleString('pt-BR')} km · {selectedVehicle.color} · {selectedVehicle.fuel}</p>
            </div>
            <button onClick={() => setSelectedVehicleId(null)} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', padding: 4 }}><XIcon size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Preço de compra',    value: formatCurrency(selectedDepreciation.basePrice),             color: 'var(--t)' },
              { label: 'Valor est. mercado', value: formatCurrency(selectedDepreciation.estimatedCurrentValue), color: 'var(--t)' },
              { label: 'Perda acumulada',    value: formatCurrency(selectedDepreciation.accumulatedLossR$),     color: C.red },
              { label: 'Perda próx. 30d',    value: formatCurrency(selectedDepreciation.projectedLoss30dR$),    color: C.yellow },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--el)', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ fontSize: 9, color: C.t3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{item.label}</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: item.color, fontFamily: 'var(--fm)' }}>{item.value}</p>
              </div>
            ))}
          </div>
          <div style={{ background: ALERT_BG_COLORS[selectedAlert.level], border: `1px solid ${selectedAlert.color}40`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Zap size={13} style={{ color: selectedAlert.color, flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: selectedAlert.color, marginBottom: 2 }}>Ação recomendada</p>
              <p style={{ fontSize: 12, color: 'var(--t)' }}>{selectedAlert.suggestedAction}</p>
              {selectedAlert.priceAdjustment && (
                <p style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
                  Sugestão: reduzir ~{selectedAlert.priceAdjustment}% (de {formatCurrency(selectedVehicle.sale_price ?? 0)} para {formatCurrency((selectedVehicle.sale_price ?? 0) * (1 - selectedAlert.priceAdjustment / 100))})
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ─── Offer modal ───────────────────────────────────────────────── */}
      {offerVehicle && <OfferModal vehicle={offerVehicle} onClose={() => setOfferVehicle(null)} />}
    </div>
  )
}
