import { useMemo, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, TrendingDown, Clock, DollarSign, Zap,
  Activity, TrendingUp, X as XIcon, CheckCircle, Bell,
  ChevronDown, ChevronRight, ArrowUp, ArrowDown, Target,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatCurrency, computeDaysInStock } from '@/utils/format'
import type { Vehicle } from '@/types'
import { calculateDepreciationBatch } from '@/modules/inventory-intelligence/engines/DepreciationEngine'
import { generateAlertBatch, getVehiclesNeedingAction } from '@/modules/inventory-intelligence/engines/AlertEngine'
import { calculateHealthScoreBatch, calculatePatioHealthScore } from '@/modules/inventory-intelligence/engines/HealthScoreEngine'
import { ALERT_COLORS, ALERT_BG_COLORS, ALERT_LABELS } from '@/modules/inventory-intelligence/utils/alertThresholds'
import type { AlertLevel } from '@/modules/inventory-intelligence/types/inventory.types'

// ─── Design tokens ────────────────────────────────────────────────────────────
const N = '#39ff14'          // neon green — cor principal
const W = '#ffffff'          // branco puro — texto principal
const W7 = 'rgba(255,255,255,.70)'  // branco 70% — texto secundário
const W4 = 'rgba(255,255,255,.40)'  // branco 40% — labels, subtítulos
const W1 = 'rgba(255,255,255,.07)'  // branco 7%  — backgrounds sutis
const BG = '#0d0d0d'
const CARD_BG  = 'rgba(255,255,255,.04)'
const CARD_BDR = 'rgba(255,255,255,.10)'
const NEON_DIM = 'rgba(57,255,20,.12)'
const NEON_BDR = 'rgba(57,255,20,.35)'

// Semânticas — só para alertas reais
const RED    = '#ef4444'
const YELLOW = '#eab308'
const ORANGE = '#f97316'
const PURPLE = '#8b5cf6'

const BRAND_COLORS = [N,'#3b82f6','#8b5cf6','#06b6d4','#f97316','#ec4899','#22c55e','#eab308']
const PATIO_META_GIRO = 18

// ─── Pure calc functions ──────────────────────────────────────────────────────

function calcLucro(vehicles: Vehicle[]): number {
  return vehicles.reduce((s, v) => v.sale_price && v.purchase_price ? s + (v.sale_price - v.purchase_price) : s, 0)
}
function calcAvgMargin(vehicles: Vehicle[]): number {
  const w = vehicles.filter(v => v.sale_price && v.purchase_price)
  if (!w.length) return 0
  return w.reduce((s, v) => s + ((v.sale_price! - v.purchase_price!) / v.sale_price!) * 100, 0) / w.length
}
function calcAvgDays(vehicles: Vehicle[]): number {
  if (!vehicles.length) return 0
  return Math.round(vehicles.reduce((s, v) => s + (v.days_in_stock ?? 0), 0) / vehicles.length)
}
function calcMarginTrend(vehicles: Vehicle[]): { pct: number; up: boolean } | null {
  const now = new Date()
  const f = (offset: number) => vehicles.filter(v => {
    const d = new Date(v.created_at)
    const ref = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear() && v.sale_price && v.purchase_price
  })
  const [cur, prev] = [calcAvgMargin(f(0)), calcAvgMargin(f(-1))]
  if (!f(0).length || !f(-1).length || prev === 0) return null
  const delta = cur - prev
  return { pct: Math.abs(Math.round(delta * 10) / 10), up: delta >= 0 }
}
function calcFipeVs(v: Vehicle): { pct: number; aboveFipe: boolean } | null {
  if (!v.fipe_price || !v.sale_price) return null
  const ratio = v.sale_price / v.fipe_price
  if (ratio > 5 || ratio < 0.2) return null
  const pct = ((v.sale_price - v.fipe_price) / v.fipe_price) * 100
  return { pct: Math.round(Math.abs(pct) * 10) / 10, aboveFipe: pct > 0 }
}
function calcPerdaDia(v: Vehicle): number {
  return v.purchase_price ? (v.purchase_price * 0.005) / 30 : 0
}
function calcHealthScore(available: Vehicle[]): number {
  if (!available.length) return 100
  const pct30d  = available.filter(v => (v.days_in_stock ?? 0) <= 30).length / available.length
  const margin  = calcAvgMargin(available)
  const parados = available.filter(v => (v.days_in_stock ?? 0) > 60).length
  return Math.min(100,
    Math.round(pct30d * 40) +
    Math.min(30, Math.round((margin / 15) * 30)) +
    (parados === 0 ? 30 : Math.max(0, 30 - parados * 5))
  )
}
function buildBrandCards(available: Vehicle[]) {
  const map: Record<string, { margin: number[]; days: number[]; value: number; count: number }> = {}
  available.forEach(v => {
    if (!map[v.brand]) map[v.brand] = { margin: [], days: [], value: 0, count: 0 }
    if (v.sale_price && v.purchase_price)
      map[v.brand].margin.push(((v.sale_price - v.purchase_price) / v.sale_price) * 100)
    map[v.brand].days.push(v.days_in_stock ?? 0)
    map[v.brand].value += v.sale_price ?? 0
    map[v.brand].count++
  })
  return Object.entries(map).map(([brand, d], i) => ({
    brand,
    margin: d.margin.length ? Math.round((d.margin.reduce((a, b) => a + b, 0) / d.margin.length) * 10) / 10 : null,
    avgDays: Math.round(d.days.reduce((a, b) => a + b, 0) / d.days.length),
    value: d.value,
    count: d.count,
    color: BRAND_COLORS[i % BRAND_COLORS.length],
  })).sort((a, b) => b.count - a.count)
}
function buildUrgencyRanking(available: Vehicle[]) {
  return [...available]
    .filter(v => v.purchase_price)
    .map(v => ({ ...v, perdaDia: calcPerdaDia(v), urgencia: (v.days_in_stock ?? 0) * calcPerdaDia(v), fipe: calcFipeVs(v) }))
    .sort((a, b) => b.urgencia - a.urgencia)
    .slice(0, 20)
}
function buildSmartAlerts(available: Vehicle[]): Array<{ msg: string; severity: 'red' | 'yellow' | 'purple' }> {
  const alerts: Array<{ msg: string; severity: 'red' | 'yellow' | 'purple' }> = []
  available.forEach(v => {
    const dias = v.days_in_stock ?? 0
    const fipe = calcFipeVs(v)
    if (dias > 60) alerts.push({ msg: `${v.brand} ${v.model} parado há ${dias} dias. Situação crítica — ação imediata.`, severity: 'red' })
    else if (dias > 30) alerts.push({ msg: `${v.brand} ${v.model} está há ${dias} dias. Considere reduzir R$ ${Math.round(calcPerdaDia(v) * 15).toLocaleString('pt-BR')}.`, severity: 'yellow' })
    if (fipe?.aboveFipe && fipe.pct > 0.5) alerts.push({ msg: `${v.brand} ${v.model} está ${fipe.pct.toFixed(1)}% acima da FIPE. Pode dificultar a venda.`, severity: 'yellow' })
  })
  const suvKw = ['compass','creta','hr-v','renegade','tucson','corolla cross','kicks','tracker','pulse']
  if (!available.some(v => suvKw.some(k => v.model?.toLowerCase().includes(k))) && available.length > 0)
    alerts.push({ msg: 'Sem SUVs disponíveis. Categoria com alta procura neste período.', severity: 'purple' })
  if (!available.some(v => ['byd','tesla','volvo'].includes(v.brand.toLowerCase())) && available.length > 0)
    alerts.push({ msg: 'Nenhum elétrico/híbrido no estoque. Segmento em crescimento acelerado.', severity: 'purple' })
  return alerts.slice(0, 6)
}

// ─── Health Gauge (SVG) ───────────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const R = 80, cx = 110, cy = 100
  const pct   = Math.min(score / 100, 1)
  const angle = Math.PI - pct * Math.PI
  const x1 = cx + R * Math.cos(Math.PI)
  const y1 = cy + R * Math.sin(Math.PI)
  const x2 = cx + R * Math.cos(0)
  const y2 = cy + R * Math.sin(0)
  const vx = cx + R * Math.cos(angle)
  const vy = cy + R * Math.sin(angle)
  const color = score >= 80 ? N : score >= 60 ? YELLOW : RED
  const label = score >= 80 ? 'Estoque Saudável' : score >= 60 ? 'Atenção Necessária' : 'Ação Urgente'
  const gid = `gauge-grad-${score}`

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={220} height={130} viewBox="0 0 220 130" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={score >= 80 ? N : score >= 60 ? YELLOW : RED} stopOpacity={0.4} />
            <stop offset="100%" stopColor={score >= 80 ? N : score >= 60 ? YELLOW : RED} stopOpacity={1} />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* Track background */}
        <path d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`}
          fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={16} strokeLinecap="round" />
        {/* Colored arc */}
        <path d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${vx} ${vy}`}
          fill="none" stroke={`url(#${gid})`} strokeWidth={16} strokeLinecap="round"
          filter="url(#glow)" style={{ transition: 'all .7s cubic-bezier(.4,0,.2,1)' }} />
        {/* Glow dot at end */}
        <circle cx={vx} cy={vy} r={8} fill={color} filter="url(#glow)" />
        <circle cx={vx} cy={vy} r={4} fill={W} />
        {/* Score big */}
        <text x={cx} y={cy - 12} textAnchor="middle" fill={color} fontSize={42} fontWeight={900} fontFamily="monospace" filter="url(#glow)">{score}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill={W4} fontSize={12} fontWeight={600}>/100</text>
        {/* Min/Max labels */}
        <text x={x1 - 6} y={y1 + 16} textAnchor="middle" fill={W4} fontSize={10}>0</text>
        <text x={x2 + 6} y={y2 + 16} textAnchor="middle" fill={W4} fontSize={10}>100</text>
      </svg>
      <p style={{ fontSize: 14, fontWeight: 800, color, marginTop: -4, letterSpacing: '.02em' }}>{label}</p>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color = N, iconColor, icon, pulse = false, accent = false, compact = false }: {
  label: string; value: string; sub?: string; color?: string; iconColor?: string; icon: React.ReactNode; pulse?: boolean; accent?: boolean; compact?: boolean
}) {
  const ic = iconColor ?? color
  return (
    <div style={{
      background: NEON_DIM,
      borderRadius: 12,
      border: pulse ? `1px solid ${RED}` : `1px solid ${NEON_BDR}`,
      padding: compact ? '12px 14px' : '16px 18px',
      animation: pulse ? 'pulse-border 2s infinite' : 'none',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${N}, transparent)` }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: compact ? 6 : 10 }}>
        <p style={{ fontSize: compact ? 9 : 10, fontWeight: 700, color: W4, textTransform: 'uppercase', letterSpacing: '.07em', lineHeight: 1.3 }}>{label}</p>
        <div style={{ color: ic, flexShrink: 0, marginLeft: 4 }}>{icon}</div>
      </div>
      <p style={{
        fontSize: compact ? 18 : 26,
        fontWeight: 900, color, lineHeight: 1,
        fontFamily: 'var(--fm)', letterSpacing: '-.01em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</p>
      {sub && <p style={{ fontSize: compact ? 10 : 11, color: W4, marginTop: compact ? 4 : 6, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</p>}
    </div>
  )
}

// ─── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ fontSize: 14, fontWeight: 800, color: W, letterSpacing: '.01em', margin: 0 }}>{children}</h2>
      {sub && <p style={{ fontSize: 11, color: W4, marginTop: 3, fontWeight: 400 }}>{sub}</p>}
    </div>
  )
}

// ─── Panel card wrapper ────────────────────────────────────────────────────────

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BDR}`,
      borderRadius: 14, padding: '20px 22px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─── Patio Semaphore ──────────────────────────────────────────────────────────

const SEMAFORO = [
  { label: '0–15d',  min: 0,  max: 15,       color: N,      bg: NEON_DIM,                    bdr: NEON_BDR },
  { label: '16–30d', min: 16, max: 30,        color: YELLOW, bg: 'rgba(234,179,8,.10)',        bdr: 'rgba(234,179,8,.35)' },
  { label: '31–60d', min: 31, max: 60,        color: ORANGE, bg: 'rgba(249,115,22,.10)',       bdr: 'rgba(249,115,22,.35)' },
  { label: '+60d',   min: 61, max: Infinity,  color: RED,    bg: 'rgba(239,68,68,.10)',        bdr: 'rgba(239,68,68,.35)' },
]

function PatioSemaphore({ available, onFilter, activeFilter, mob = false }: {
  available: Vehicle[]; onFilter: (b: string | null) => void; activeFilter: string | null; mob?: boolean
}) {
  const bands = SEMAFORO.map(s => {
    const vs = available.filter(v => { const d = v.days_in_stock ?? 0; return d >= s.min && d <= s.max })
    return { ...s, vehicles: vs, valor: vs.reduce((a, v) => a + (v.purchase_price ?? v.sale_price ?? 0), 0) }
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10 }}>
      {bands.map(b => {
        const isActive = activeFilter === b.label
        return (
          <div key={b.label} onClick={() => onFilter(isActive ? null : b.label)}
            style={{
              background: isActive ? b.bg : W1,
              border: `1.5px solid ${isActive ? b.color : CARD_BDR}`,
              borderTop: `3px solid ${b.color}`,
              borderRadius: 12, padding: '14px 16px',
              cursor: 'pointer', transition: 'all .18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = b.color; e.currentTarget.style.background = b.bg }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = CARD_BDR; e.currentTarget.style.background = W1 } }}
          >
            <p style={{ fontSize: 12, fontWeight: 800, color: b.color, marginBottom: 8, letterSpacing: '.02em' }}>{b.label}</p>
            <p style={{ fontSize: 36, fontWeight: 900, color: W, fontFamily: 'var(--fm)', lineHeight: 1 }}>{b.vehicles.length}</p>
            <p style={{ fontSize: 11, color: W4, marginTop: 4, fontWeight: 600 }}>veículo{b.vehicles.length !== 1 ? 's' : ''}</p>
            {b.valor > 0 && (
              <p style={{ fontSize: 11, fontWeight: 700, color: b.color, marginTop: 8 }}>{formatCurrency(b.valor)}</p>
            )}
            {b.vehicles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                {b.vehicles.slice(0, 5).map(v => (
                  <span key={v.id} title={`${v.brand} ${v.model}`}
                    style={{ fontSize: 10, fontWeight: 800, padding: '3px 6px', borderRadius: 6, background: `${b.color}20`, color: b.color, letterSpacing: '.04em' }}>
                    {`${v.brand[0]}${v.model[0]}`.toUpperCase()}
                  </span>
                ))}
                {b.vehicles.length > 5 && <span style={{ fontSize: 10, color: W4, alignSelf: 'center' }}>+{b.vehicles.length - 5}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Brand performance cards ──────────────────────────────────────────────────

type BrandCard = ReturnType<typeof buildBrandCards>[number]

function BrandCards({ brands, avgMarginRef }: { brands: BrandCard[]; avgMarginRef: number }) {
  if (!brands.length) return null
  return (
    <Panel>
      <SectionTitle sub="Margem, giro e valor em estoque por marca">Desempenho por Marca</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {brands.map(b => {
          const marginColor = b.margin === null ? W4 : b.margin >= 15 ? N : b.margin >= 8 ? YELLOW : RED
          const giroColor   = b.avgDays <= PATIO_META_GIRO ? N : b.avgDays <= 30 ? YELLOW : RED
          const marginPct   = b.margin !== null ? Math.min(100, (b.margin / 20) * 100) : 0
          const giroPct     = Math.max(0, 100 - Math.min(100, (b.avgDays / 60) * 100))
          return (
            <div key={b.brand} style={{ background: W1, border: `1px solid ${CARD_BDR}`, borderTop: `3px solid ${b.color}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontSize: 15, fontWeight: 900, color: W }}>{b.brand}</p>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: `${b.color}18`, color: b.color }}>
                  {b.count} veíc.
                </span>
              </div>

              {/* Margem */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: W4, fontWeight: 600 }}>Margem média</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: marginColor }}>
                    {b.margin !== null ? `${b.margin}%` : '—'}
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${marginPct}%`, background: marginColor, borderRadius: 6, boxShadow: marginColor === N ? `0 0 8px ${N}60` : 'none', transition: 'width .5s' }} />
                </div>
              </div>

              {/* Giro */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: W4, fontWeight: 600 }}>Giro médio</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: giroColor }}>{b.avgDays}d</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${giroPct}%`, background: giroColor, borderRadius: 6, boxShadow: giroColor === N ? `0 0 8px ${N}60` : 'none', transition: 'width .5s' }} />
                </div>
                <p style={{ fontSize: 10, color: W4, marginTop: 4 }}>meta: {PATIO_META_GIRO}d</p>
              </div>

              {/* Valor */}
              <div style={{ borderTop: `1px solid ${CARD_BDR}`, paddingTop: 10 }}>
                <p style={{ fontSize: 10, color: W4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 2 }}>Valor em estoque</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: W, fontFamily: 'var(--fm)' }}>{formatCurrency(b.value)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

// ─── Offer Modal ──────────────────────────────────────────────────────────────

function OfferModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const [price, setPrice] = useState(String(vehicle.sale_price ?? ''))
  const [msg, setMsg] = useState(`Olá! Temos uma oferta especial para o ${vehicle.brand} ${vehicle.model} ${vehicle.year_model}. Novo preço: R$ ${vehicle.sale_price?.toLocaleString('pt-BR')}. Tem interesse?`)

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    background: 'rgba(255,255,255,.06)', border: `1px solid ${CARD_BDR}`,
    color: W, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div style={{ background: '#111', border: `1px solid ${CARD_BDR}`, borderRadius: 16, padding: '24px 28px', maxWidth: 480, width: '100%', boxShadow: '0 24px 60px rgba(0,0,0,.6)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: W }}>Criar Oferta</p>
            <p style={{ fontSize: 12, color: W4, marginTop: 2 }}>{vehicle.brand} {vehicle.model} {vehicle.year_model}</p>
          </div>
          <button onClick={onClose} style={{ background: W1, border: `1px solid ${CARD_BDR}`, borderRadius: 8, color: W4, cursor: 'pointer', padding: '6px 8px', display: 'flex' }}><XIcon size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: W4, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 6 }}>Novo preço (R$)</label>
            <input value={price} onChange={e => setPrice(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: W4, textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 6 }}>Mensagem WhatsApp</label>
            <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onClose}
              style={{ flex: 1, padding: '10px', borderRadius: 9, border: `1px solid ${CARD_BDR}`, background: 'transparent', color: W4, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
              Cancelar
            </button>
            <button style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', background: '#25D366', color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
              Notificar via WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── FIPE badge ───────────────────────────────────────────────────────────────

function FipeBadge({ fipe }: { fipe: { pct: number; aboveFipe: boolean } | null }) {
  if (!fipe) return <span style={{ color: W4, fontSize: 11 }}>—</span>
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
      background: fipe.aboveFipe ? 'rgba(239,68,68,.15)' : 'rgba(57,255,20,.12)',
      color: fipe.aboveFipe ? RED : N, border: `1px solid ${fipe.aboveFipe ? 'rgba(239,68,68,.3)' : NEON_BDR}`,
    }}>
      {fipe.aboveFipe ? '+' : '-'}{fipe.pct.toFixed(1)}%
    </span>
  )
}

// ─── Days badge ───────────────────────────────────────────────────────────────

function DaysBadge({ days }: { days: number }) {
  const color = days > 60 ? RED : days > 30 ? ORANGE : days > 15 ? YELLOW : N
  return (
    <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20, background: `${color}18`, color, border: `1px solid ${color}40` }}>
      {days}d
    </span>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function InventoryIntelligence() {
  const { store } = useAuthStore()
  const storeId = store?.id ?? ''
  const mob = useIsMobile()

  const [patioFilter, setPatioFilter]         = useState<string | null>(null)
  const [expandedRow, setExpandedRow]         = useState<string | null>(null)
  const [dismissedAlerts, setDismissedAlerts] = useState<number[]>([])
  const [offerVehicle, setOfferVehicle]       = useState<Vehicle | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles-intelligence', storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicles').select('*').eq('store_id', storeId).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(v => ({ ...v, days_in_stock: computeDaysInStock(v.purchase_date) })) as Vehicle[]
    },
    enabled: !!storeId,
  })

  const available = useMemo(() => vehicles.filter(v => v.status === 'available'), [vehicles])
  const stalled   = useMemo(() => available.filter(v => (v.days_in_stock ?? 0) > 60), [available])

  const totalValue  = useMemo(() => available.reduce((s, v) => s + (v.sale_price ?? 0), 0), [available])
  const avgDays     = useMemo(() => calcAvgDays(available), [available])
  const avgMargin   = useMemo(() => Math.round(calcAvgMargin(available) * 10) / 10, [available])
  const lucro       = useMemo(() => calcLucro(available), [available])
  const trend       = useMemo(() => calcMarginTrend(vehicles), [vehicles])
  const healthScore = useMemo(() => calcHealthScore(available), [available])
  const brandCards  = useMemo(() => buildBrandCards(available), [available])
  const urgency     = useMemo(() => buildUrgencyRanking(available), [available])
  const alerts      = useMemo(() => buildSmartAlerts(available), [available])

  const depMap    = useMemo(() => calculateDepreciationBatch(available), [available])
  const alertMap  = useMemo(() => generateAlertBatch(available, depMap), [available, depMap])
  const healthMap = useMemo(() => calculateHealthScoreBatch(available, depMap), [available, depMap])
  const patioHP   = useMemo(() => calculatePatioHealthScore(available, healthMap), [available, healthMap])
  const needAction = useMemo(() => getVehiclesNeedingAction(available, alertMap), [available, alertMap])

  const selVehicle = useMemo(() => available.find(v => v.id === selectedVehicleId) ?? null, [available, selectedVehicleId])
  const selDep     = selectedVehicleId ? depMap.get(selectedVehicleId) : undefined
  const selAlert   = selectedVehicleId ? alertMap.get(selectedVehicleId) : undefined
  const selHealth  = selectedVehicleId ? healthMap.get(selectedVehicleId) : undefined

  const tableVehicles = useMemo(() => {
    const base = [...available].sort((a, b) => (b.days_in_stock ?? 0) - (a.days_in_stock ?? 0))
    const band = SEMAFORO.find(s => s.label === patioFilter)
    if (!band) return base
    return base.filter(v => { const d = v.days_in_stock ?? 0; return d >= band.min && d <= band.max })
  }, [available, patioFilter])

  const healthColor = healthScore >= 80 ? N : healthScore >= 60 ? YELLOW : RED
  const critCount   = [...alertMap.values()].filter(a => a.level === 'critical' || a.level === 'emergency').length

  if (isLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[...Array(5)].map((_, i) => <div key={i} style={{ height: 70, background: CARD_BG, borderRadius: 12, opacity: .5 }} />)}
    </div>
  )

  /* ────────────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, color: W }}>
      <style>{`
        @keyframes pulse-border {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.4); }
          50%      { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
        @keyframes neon-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(57,255,20,.3); }
          50%      { box-shadow: 0 0 0 8px rgba(57,255,20,0); }
        }
      `}</style>

      {/* ── Critical banner ─────────────────────────────────────────────── */}
      {healthScore < 60 && (
        <div style={{ background: 'rgba(239,68,68,.08)', border: `1px solid rgba(239,68,68,.4)`, borderLeft: `4px solid ${RED}`, borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
          <AlertTriangle size={18} style={{ color: RED, flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: RED }}>Saúde do estoque crítica — Score {healthScore}/100</p>
            <p style={{ fontSize: 12, color: W7, marginTop: 3 }}>Há veículos parados há muito tempo e/ou margens abaixo da meta. Veja o Ranking de Urgência.</p>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: W, letterSpacing: '-.01em', margin: 0 }}>Inteligência de Estoque</h1>
          <p style={{ fontSize: 12, color: W4, marginTop: 4 }}>Painel de decisão — giro · margem · capital · urgência</p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: `${healthColor}12`, border: `1px solid ${healthColor}50`,
          borderRadius: 10, padding: '8px 14px',
        }}>
          <Activity size={14} style={{ color: healthColor }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: healthColor }}>Score {healthScore}/100</span>
        </div>
      </div>

      {/* ── Smart Alerts ────────────────────────────────────────────────── */}
      {alerts.filter((_, i) => !dismissedAlerts.includes(i)).length > 0 && (
        <Panel style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Bell size={13} style={{ color: N }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: W, textTransform: 'uppercase', letterSpacing: '.09em' }}>Alertas Inteligentes</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map((a, i) => {
              if (dismissedAlerts.includes(i)) return null
              const bc = a.severity === 'red' ? RED : a.severity === 'yellow' ? YELLOW : PURPLE
              return (
                <div key={i} style={{ background: `${bc}08`, border: `1px solid ${bc}25`, borderLeft: `3px solid ${bc}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <p style={{ fontSize: 12, color: W7, fontWeight: 500 }}>{a.msg}</p>
                  <button onClick={() => setDismissedAlerts(p => [...p, i])}
                    style={{ background: 'none', border: 'none', color: W4, cursor: 'pointer', flexShrink: 0, padding: 4, display: 'flex' }}>
                    <XIcon size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* ── 6 KPIs ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)', gap: 10 }}>
        <KPICard label="Capital imobilizado" icon={<DollarSign size={mob ? 14 : 16} />}
          value={formatCurrency(totalValue)} sub="valor de venda" color={W} accent compact={mob} />

        <KPICard label="Giro médio" icon={<Clock size={mob ? 14 : 16} />}
          value={`${avgDays}d`}
          sub={`meta ${PATIO_META_GIRO}d ${avgDays > PATIO_META_GIRO ? '⚠ acima' : '✓ dentro'}`}
          color={W}
          iconColor={avgDays > PATIO_META_GIRO ? RED : N}
          pulse={avgDays > PATIO_META_GIRO}
          accent compact={mob} />

        <KPICard label="Parados +60d" icon={stalled.length > 0 ? <AlertTriangle size={mob ? 14 : 16} /> : <CheckCircle size={mob ? 14 : 16} />}
          value={String(stalled.length)}
          sub={stalled.length === 0 ? 'nenhum parado ✓' : `${Math.round((stalled.length / (available.length || 1)) * 100)}% do estoque`}
          color={W}
          iconColor={stalled.length > 0 ? RED : N}
          pulse={stalled.length > 0}
          accent compact={mob} />

        <KPICard label="Margem média" icon={<TrendingDown size={mob ? 14 : 16} />}
          value={`${avgMargin}%`} sub={`meta 15% ${avgMargin >= 15 ? '✓' : '▼'}`}
          color={W}
          iconColor={avgMargin >= 15 ? N : avgMargin >= 8 ? YELLOW : RED}
          accent compact={mob} />

        <KPICard label="Lucro potencial" icon={<Zap size={mob ? 14 : 16} />}
          value={formatCurrency(lucro)} sub="a realizar" color={N} accent compact={mob} />

        <KPICard label="Tendência margem"
          icon={trend ? (trend.up ? <ArrowUp size={mob ? 14 : 16} /> : <ArrowDown size={mob ? 14 : 16} />) : <Activity size={mob ? 14 : 16} />}
          value={trend ? `${trend.up ? '+' : '-'}${trend.pct}%` : '—'}
          sub={trend ? (trend.up ? 'vs mês anterior ↑' : 'vs mês anterior ↓') : 'sem dados anteriores'}
          color={W}
          iconColor={trend ? (trend.up ? N : RED) : W4}
          accent compact={mob} />
      </div>

      {/* ── Ranking de Urgência ──────────────────────────────────────────── */}
      {urgency.length > 0 && (
        <Panel>
          <SectionTitle sub="Ordenado por custo acumulado — maior perda diária × tempo no estoque">Ranking de Urgência de Venda</SectionTitle>

          {mob ? (
            /* ── Mobile: cards empilhados ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {urgency.map((v, idx) => (
                <div key={v.id} style={{ background: W1, borderRadius: 12, border: `1px solid ${CARD_BDR}`, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: W4 }}>#{idx + 1}</span>
                        <p style={{ fontSize: 14, fontWeight: 800, color: W }}>{v.brand} {v.model}</p>
                      </div>
                      {v.version && <p style={{ fontSize: 11, color: W4 }}>{v.version} · {v.year_model}</p>}
                    </div>
                    <DaysBadge days={v.days_in_stock ?? 0} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div style={{ background: CARD_BG, borderRadius: 8, padding: '8px 10px' }}>
                      <p style={{ fontSize: 10, color: W4, marginBottom: 3 }}>Preço atual</p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: N, fontFamily: 'var(--fm)' }}>{formatCurrency(v.sale_price ?? 0)}</p>
                    </div>
                    <div style={{ background: CARD_BG, borderRadius: 8, padding: '8px 10px' }}>
                      <p style={{ fontSize: 10, color: W4, marginBottom: 3 }}>Perda est./dia</p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: RED, fontFamily: 'var(--fm)' }}>-{formatCurrency(v.perdaDia)}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <FipeBadge fipe={v.fipe} />
                    <button onClick={() => setOfferVehicle(v)}
                      style={{ fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: `1px solid ${NEON_BDR}`, background: NEON_DIM, color: N, cursor: 'pointer' }}>
                      Criar oferta
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── Desktop: tabela ── */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${CARD_BDR}` }}>
                    {['#','Veículo','Dias','Perda est./dia','Preço atual','vs FIPE','Ação'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: W4, textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {urgency.map((v, idx) => (
                    <tr key={v.id} style={{ borderBottom: `1px solid ${W1}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = W1)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 12px', color: W4, fontWeight: 800, fontSize: 13 }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <p style={{ fontWeight: 700, color: W, fontSize: 13 }}>{v.brand} {v.model}</p>
                        {v.version && <p style={{ fontSize: 10, color: W4, marginTop: 1 }}>{v.version} · {v.year_model}</p>}
                      </td>
                      <td style={{ padding: '10px 12px' }}><DaysBadge days={v.days_in_stock ?? 0} /></td>
                      <td style={{ padding: '10px 12px', color: RED, fontWeight: 700, fontFamily: 'var(--fm)' }}>
                        -{formatCurrency(v.perdaDia)}/d
                      </td>
                      <td style={{ padding: '10px 12px', color: N, fontFamily: 'var(--fm)', fontWeight: 800 }}>
                        {formatCurrency(v.sale_price ?? 0)}
                      </td>
                      <td style={{ padding: '10px 12px' }}><FipeBadge fipe={v.fipe} /></td>
                      <td style={{ padding: '10px 12px' }}>
                        <button onClick={() => setOfferVehicle(v)}
                          style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, border: `1px solid ${NEON_BDR}`, background: NEON_DIM, color: N, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = `${N}25` }}
                          onMouseLeave={e => { e.currentTarget.style.background = NEON_DIM }}>
                          Criar oferta
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* ── Análise Detalhada ─────────────────────────────────────────────── */}
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: W, margin: 0 }}>Análise Detalhada</h2>
            <p style={{ fontSize: 11, color: W4, marginTop: 3 }}>
              {patioFilter ? `Filtro: ${patioFilter} — ` : ''}{tableVehicles.length} veículo{tableVehicles.length !== 1 ? 's' : ''}
            </p>
          </div>
          {patioFilter && (
            <button onClick={() => setPatioFilter(null)}
              style={{ marginLeft: 'auto', fontSize: 11, color: W4, background: W1, border: `1px solid ${CARD_BDR}`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
              × Limpar filtro
            </button>
          )}
        </div>
        {mob ? (
          /* ── Mobile: cards expansíveis ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tableVehicles.length === 0 && (
              <p style={{ textAlign: 'center', padding: '28px 0', color: W4, fontSize: 13 }}>
                {patioFilter ? `Nenhum veículo na faixa ${patioFilter}` : 'Nenhum veículo disponível'}
              </p>
            )}
            {tableVehicles.map(v => {
              const margin   = v.sale_price && v.purchase_price ? Math.round(((v.sale_price - v.purchase_price) / v.sale_price) * 100 * 10) / 10 : null
              const dias     = v.days_in_stock ?? 0
              const perdaDia = calcPerdaDia(v)
              const fipe     = calcFipeVs(v)
              const isExp    = expandedRow === v.id
              const mc       = margin !== null ? (margin >= 15 ? N : margin >= 8 ? YELLOW : RED) : W4
              return (
                <div key={v.id} style={{ background: W1, borderRadius: 12, border: `1px solid ${isExp ? NEON_BDR : CARD_BDR}`, overflow: 'hidden', transition: 'border-color .15s' }}>
                  {/* Row header */}
                  <div onClick={() => setExpandedRow(isExp ? null : v.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: W, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.brand} {v.model}</p>
                      {v.version && <p style={{ fontSize: 11, color: W4, marginTop: 2 }}>{v.version} · {v.year_model}</p>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
                      <DaysBadge days={dias} />
                      <span style={{ color: W4 }}>{isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                    </div>
                  </div>
                  {/* Resumo sempre visível */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, borderTop: `1px solid ${CARD_BDR}` }}>
                    {[
                      { l: 'Venda', v: formatCurrency(v.sale_price ?? 0), c: N },
                      { l: 'Margem', v: margin !== null ? `${margin}%` : '—', c: mc },
                      { l: 'Perda/dia', v: perdaDia > 0 ? `-${formatCurrency(perdaDia)}` : '—', c: perdaDia > 0 ? RED : W4 },
                    ].map(item => (
                      <div key={item.l} style={{ padding: '10px 14px', background: CARD_BG }}>
                        <p style={{ fontSize: 10, color: W4, marginBottom: 3 }}>{item.l}</p>
                        <p style={{ fontSize: 13, fontWeight: 800, color: item.c, fontFamily: 'var(--fm)' }}>{item.v}</p>
                      </div>
                    ))}
                  </div>
                  {/* Expansão */}
                  {isExp && (
                    <div style={{ padding: '14px 16px', borderTop: `1px solid ${CARD_BDR}`, background: `${N}04` }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        {[['Ano', String(v.year_model ?? '—')],['KM', v.km?.toLocaleString('pt-BR') ?? '—'],['Compra', v.purchase_price ? formatCurrency(v.purchase_price) : '—'],['Cor', v.color ?? '—'],['Combustível', v.fuel ?? '—'],['Câmbio', v.transmission ?? '—']].map(([k, val]) => (
                          <p key={k} style={{ fontSize: 12, color: W7 }}><span style={{ color: W4 }}>{k}: </span>{val}</p>
                        ))}
                      </div>
                      {(v.fipe_price || perdaDia > 0 || margin !== null) && (
                        <div style={{ background: W1, borderRadius: 10, padding: '10px 14px', border: `1px solid ${CARD_BDR}`, marginBottom: 12 }}>
                          {v.fipe_price && <p style={{ fontSize: 12, color: W7, marginBottom: 3 }}>FIPE: <strong style={{ color: W }}>{formatCurrency(v.fipe_price)}</strong> <FipeBadge fipe={fipe} /></p>}
                          {perdaDia > 0 && <p style={{ fontSize: 12, color: W7, marginBottom: 3 }}>Perda acum.: <strong style={{ color: RED }}>{formatCurrency(perdaDia * dias)}</strong></p>}
                          {margin !== null && <p style={{ fontSize: 12, color: W7 }}>Margem bruta: <strong style={{ color: mc }}>{margin}%</strong></p>}
                        </div>
                      )}
                      <button onClick={() => setOfferVehicle(v)}
                        style={{ width: '100%', fontSize: 13, fontWeight: 800, padding: '12px', borderRadius: 9, border: `1px solid ${NEON_BDR}`, background: NEON_DIM, color: N, cursor: 'pointer' }}>
                        Criar ação de venda
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* ── Desktop: tabela ── */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${CARD_BDR}` }}>
                  {['','Veículo','Ano','KM','Compra','Venda','Margem','Perda/dia','vs FIPE','Dias'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, color: W4, textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableVehicles.map(v => {
                  const margin = v.sale_price && v.purchase_price
                    ? Math.round(((v.sale_price - v.purchase_price) / v.sale_price) * 100 * 10) / 10 : null
                  const dias    = v.days_in_stock ?? 0
                  const perdaDia = calcPerdaDia(v)
                  const fipe    = calcFipeVs(v)
                  const isExp   = expandedRow === v.id
                  return (
                    <>
                      <tr key={v.id} style={{ borderBottom: `1px solid ${W1}`, cursor: 'pointer', transition: 'background .12s' }}
                        onClick={() => setExpandedRow(isExp ? null : v.id)}
                        onMouseEnter={e => (e.currentTarget.style.background = W1)}
                        onMouseLeave={e => (e.currentTarget.style.background = isExp ? `${N}05` : 'transparent')}
                      >
                        <td style={{ padding: '10px 12px', color: W4 }}>
                          {isExp ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <p style={{ fontWeight: 700, color: W }}>{v.brand} {v.model}</p>
                          {v.version && <p style={{ fontSize: 10, color: W4, marginTop: 1 }}>{v.version}</p>}
                        </td>
                        <td style={{ padding: '10px 12px', color: W7 }}>{v.year_model ?? '—'}</td>
                        <td style={{ padding: '10px 12px', color: W7, fontFamily: 'var(--fm)' }}>{v.km?.toLocaleString('pt-BR') ?? '—'}</td>
                        <td style={{ padding: '10px 12px', color: W7, fontFamily: 'var(--fm)' }}>{v.purchase_price ? formatCurrency(v.purchase_price) : '—'}</td>
                        <td style={{ padding: '10px 12px', color: N, fontFamily: 'var(--fm)', fontWeight: 800 }}>{formatCurrency(v.sale_price ?? 0)}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 800, color: margin !== null ? (margin >= 15 ? N : margin >= 8 ? YELLOW : RED) : W4 }}>
                          {margin !== null ? `${margin}%` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: perdaDia > 0 ? RED : W4, fontFamily: 'var(--fm)', fontWeight: 600 }}>
                          {perdaDia > 0 ? `-${formatCurrency(perdaDia)}` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}><FipeBadge fipe={fipe} /></td>
                        <td style={{ padding: '10px 12px' }}><DaysBadge days={dias} /></td>
                      </tr>
                      {isExp && (
                        <tr key={`${v.id}-exp`} style={{ borderBottom: `1px solid ${CARD_BDR}` }}>
                          <td colSpan={10} style={{ padding: '0 12px 16px 36px', background: `${N}04` }}>
                            <div style={{ display: 'flex', gap: 12, paddingTop: 12 }}>
                              <div style={{ flex: 1, background: W1, borderRadius: 10, padding: '12px 16px', border: `1px solid ${CARD_BDR}` }}>
                                <p style={{ fontSize: 10, fontWeight: 800, color: W4, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Informações</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                  {[['Cor', v.color],['Combustível', v.fuel],['Câmbio', v.transmission],['Placa', v.plate]].map(([k, val]) => (
                                    <p key={k} style={{ fontSize: 12, color: W7 }}><span style={{ color: W4 }}>{k}: </span>{val ?? '—'}</p>
                                  ))}
                                </div>
                              </div>
                              <div style={{ flex: 1, background: W1, borderRadius: 10, padding: '12px 16px', border: `1px solid ${CARD_BDR}` }}>
                                <p style={{ fontSize: 10, fontWeight: 800, color: W4, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Análise Financeira</p>
                                {v.fipe_price && <p style={{ fontSize: 12, color: W7, marginBottom: 4 }}>FIPE: <strong style={{ color: W }}>{formatCurrency(v.fipe_price)}</strong></p>}
                                {perdaDia > 0 && <p style={{ fontSize: 12, color: W7, marginBottom: 4 }}>Perda acum. est.: <strong style={{ color: RED }}>{formatCurrency(perdaDia * (v.days_in_stock ?? 0))}</strong></p>}
                                {margin !== null && <p style={{ fontSize: 12, color: W7 }}>Margem bruta: <strong style={{ color: margin >= 15 ? N : YELLOW }}>{margin}%</strong></p>}
                              </div>
                              <button onClick={() => setOfferVehicle(v)}
                                style={{ alignSelf: 'center', fontSize: 12, fontWeight: 800, padding: '10px 16px', borderRadius: 9, border: `1px solid ${NEON_BDR}`, background: NEON_DIM, color: N, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
              <div style={{ textAlign: 'center', padding: '36px 0', color: W4, fontSize: 13 }}>
                {patioFilter ? `Nenhum veículo na faixa ${patioFilter}` : 'Nenhum veículo disponível'}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* ── Semáforo de Pátio ────────────────────────────────────────────── */}
      <Panel>
        <SectionTitle sub="Clique em uma faixa para filtrar a tabela de análise acima">Semáforo de Pátio</SectionTitle>
        <PatioSemaphore available={available} onFilter={setPatioFilter} activeFilter={patioFilter} mob={mob} />
        {patioFilter && (
          <button onClick={() => setPatioFilter(null)}
            style={{ marginTop: 12, fontSize: 11, color: W4, background: W1, border: `1px solid ${CARD_BDR}`, borderRadius: 7, padding: '5px 12px', cursor: 'pointer', fontWeight: 600 }}>
            × Limpar filtro
          </button>
        )}
      </Panel>

      {/* ── Saúde do Estoque + Desempenho por Marca ─────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : 'auto 1fr', gap: 14, alignItems: 'start' }}>
        {/* Saúde — coluna compacta à esquerda */}
        <Panel style={{ background: `linear-gradient(135deg, rgba(57,255,20,.06) 0%, rgba(255,255,255,.03) 60%)`, border: `1px solid ${NEON_BDR}`, minWidth: mob ? 'unset' : 280 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: W4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>Saúde do Estoque</p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <HealthGauge score={healthScore} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            {[
              { label: 'Veíc. abaixo de 30d', pts: Math.min(40, Math.round((available.filter(v => (v.days_in_stock ?? 0) <= 30).length / (available.length || 1)) * 40)), max: 40, desc: `${available.filter(v => (v.days_in_stock ?? 0) <= 30).length}/${available.length}` },
              { label: 'Margem vs meta 15%',  pts: Math.min(30, Math.round((avgMargin / 15) * 30)), max: 30, desc: `${avgMargin}% atual` },
              { label: 'Sem parados +60d',    pts: stalled.length === 0 ? 30 : Math.max(0, 30 - stalled.length * 5), max: 30, desc: stalled.length === 0 ? 'Nenhum ✓' : `${stalled.length} parado${stalled.length > 1 ? 's' : ''}` },
            ].map(c => {
              const pct = (c.pts / c.max) * 100
              const bc  = pct >= 70 ? N : pct >= 40 ? YELLOW : RED
              return (
                <div key={c.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: W }}>{c.label}</p>
                      <p style={{ fontSize: 10, color: W4 }}>{c.desc}</p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 900, color: bc, fontFamily: 'var(--fm)', flexShrink: 0, marginLeft: 10 }}>{c.pts}<span style={{ fontSize: 10, color: W4 }}>/{c.max}</span></span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: bc, borderRadius: 6, boxShadow: bc === N ? `0 0 8px ${N}60` : 'none' }} />
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 12, marginTop: 2, flexWrap: 'wrap' }}>
              {[{ c: N, l: '≥80 Saudável' }, { c: YELLOW, l: '60–79 Atenção' }, { c: RED, l: '<60 Crítico' }].map(({ c, l }) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: c === N ? `0 0 5px ${N}` : 'none' }} />
                  <span style={{ fontSize: 10, color: W4, fontWeight: 600 }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        {/* Desempenho por marca — coluna direita */}
        {brandCards.length > 0 && <BrandCards brands={brandCards} avgMarginRef={avgMargin} />}
      </div>

      {/* ── Inteligência Preditiva (engines) ────────────────────────────── */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 800, color: W4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={12} style={{ color: N }} /> Inteligência Preditiva
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10 }}>
          <KPICard label="Depreciação acumulada"
            value={formatCurrency([...depMap.values()].reduce((s, d) => s + d.accumulatedLossR$, 0))}
            sub="perda total no estoque" color={W7} icon={<TrendingDown size={16} />} compact={mob} />
          <KPICard label="Previsão próximos 30d"
            value={formatCurrency([...depMap.values()].reduce((s, d) => s + d.projectedLoss30dR$, 0))}
            sub="perda estimada/mês" color={YELLOW} icon={<TrendingUp size={16} />} compact={mob} />
          <KPICard label="Score pátio"
            value={`${patioHP}/100`}
            sub={patioHP >= 70 ? 'pátio saudável ✓' : patioHP >= 45 ? 'atenção necessária' : 'situação crítica'}
            color={patioHP >= 70 ? N : patioHP >= 45 ? YELLOW : RED}
            icon={<Activity size={16} />} accent={patioHP >= 70} compact={mob} />
          <KPICard label="Zona crítica"
            value={String(critCount)}
            sub="veículos críticos/emergência"
            color={critCount > 0 ? RED : N}
            icon={<Target size={16} />} pulse={critCount > 0} compact={mob} />
        </div>
      </div>

      {/* ── Heatmap do pátio ─────────────────────────────────────────────── */}
      <Panel>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <SectionTitle>Mapa de Calor do Pátio</SectionTitle>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(['info','attention','warning','critical','emergency'] as AlertLevel[]).map(level => (
              <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: ALERT_COLORS[level] }} />
                <span style={{ fontSize: 10, color: W4, fontWeight: 600 }}>{ALERT_LABELS[level]}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {available.map(v => {
            const alert  = alertMap.get(v.id)
            const health = healthMap.get(v.id)
            const dep    = depMap.get(v.id)
            if (!alert) return null
            const isSel = selectedVehicleId === v.id
            return (
              <div key={v.id} onClick={() => setSelectedVehicleId(isSel ? null : v.id)}
                style={{ background: isSel ? ALERT_BG_COLORS[alert.level] : W1, border: `1.5px solid ${isSel ? alert.color : CARD_BDR}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', transition: 'all .15s', position: 'relative', overflow: 'hidden' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = alert.color; e.currentTarget.style.background = ALERT_BG_COLORS[alert.level] }}
                onMouseLeave={e => { if (!isSel) { e.currentTarget.style.borderColor = CARD_BDR; e.currentTarget.style.background = W1 } }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: alert.color, borderRadius: '10px 10px 0 0' }} />
                <p style={{ fontSize: 12, fontWeight: 800, color: W, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.brand} {v.model}</p>
                <p style={{ fontSize: 10, color: W4, marginTop: 2 }}>{v.year_model} · {v.km?.toLocaleString('pt-BR')} km</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 10, background: ALERT_BG_COLORS[alert.level], color: alert.color }}>{alert.daysInStock}d</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: health ? (health.total >= 65 ? N : health.total >= 40 ? YELLOW : RED) : W4 }}>♥ {health?.total ?? '—'}</span>
                </div>
                {dep && dep.accumulatedLossR$ > 100 && (
                  <p style={{ fontSize: 10, color: RED, marginTop: 5, fontWeight: 600 }}>-{formatCurrency(dep.accumulatedLossR$)}</p>
                )}
              </div>
            )
          })}
        </div>
        {available.length === 0 && <p style={{ fontSize: 13, color: W4, textAlign: 'center', padding: '28px 0' }}>Nenhum veículo disponível</p>}
      </Panel>

      {/* ── Vehicle detail panel ─────────────────────────────────────────── */}
      {selVehicle && selAlert && selDep && selHealth && (
        <Panel style={{ border: `1px solid ${selAlert.color}50` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: W }}>{selVehicle.brand} {selVehicle.model} {selVehicle.version}</h3>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10, background: ALERT_BG_COLORS[selAlert.level], color: selAlert.color }}>{selAlert.label.toUpperCase()}</span>
              </div>
              <p style={{ fontSize: 12, color: W4, marginTop: 3 }}>{selVehicle.year_model} · {selVehicle.km?.toLocaleString('pt-BR')} km · {selVehicle.color} · {selVehicle.fuel}</p>
            </div>
            <button onClick={() => setSelectedVehicleId(null)} style={{ background: W1, border: `1px solid ${CARD_BDR}`, borderRadius: 8, color: W4, cursor: 'pointer', padding: '6px 8px', display: 'flex' }}><XIcon size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
            {[
              { label: 'Preço de compra',    value: formatCurrency(selDep.basePrice),             color: W },
              { label: 'Valor est. mercado', value: formatCurrency(selDep.estimatedCurrentValue), color: W },
              { label: 'Perda acumulada',    value: formatCurrency(selDep.accumulatedLossR$),     color: RED },
              { label: 'Perda próx. 30d',    value: formatCurrency(selDep.projectedLoss30dR$),    color: YELLOW },
            ].map(item => (
              <div key={item.label} style={{ background: W1, borderRadius: 10, padding: '12px 14px', border: `1px solid ${CARD_BDR}` }}>
                <p style={{ fontSize: 10, color: W4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{item.label}</p>
                <p style={{ fontSize: 17, fontWeight: 900, color: item.color, fontFamily: 'var(--fm)' }}>{item.value}</p>
              </div>
            ))}
          </div>
          <div style={{ background: ALERT_BG_COLORS[selAlert.level], border: `1px solid ${selAlert.color}40`, borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 12 }}>
            <Zap size={14} style={{ color: selAlert.color, flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: selAlert.color, marginBottom: 4 }}>Ação recomendada</p>
              <p style={{ fontSize: 13, color: W }}>{selAlert.suggestedAction}</p>
              {selAlert.priceAdjustment && (
                <p style={{ fontSize: 11, color: W4, marginTop: 6 }}>
                  Reduzir ~{selAlert.priceAdjustment}% — de {formatCurrency(selVehicle.sale_price ?? 0)} para {formatCurrency((selVehicle.sale_price ?? 0) * (1 - selAlert.priceAdjustment / 100))}
                </p>
              )}
            </div>
          </div>
        </Panel>
      )}

      {offerVehicle && <OfferModal vehicle={offerVehicle} onClose={() => setOfferVehicle(null)} />}
    </div>
  )
}
