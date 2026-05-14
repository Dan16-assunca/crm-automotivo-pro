import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, Target, Award, Flame, Zap, Clock,
  AlertTriangle, CheckCircle, Users, ChevronRight,
  DollarSign, Activity, BarChart3,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Lead, PipelineStage } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000
    ? `R$ ${(v / 1_000).toFixed(0)}k`
    : `R$ ${v.toFixed(0)}`

const pct = (v: number) => `${Math.round(v * 100)}%`

const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

const DEFAULT_TICKET = 45_000

// ─── Scoring ─────────────────────────────────────────────────────────────────

function calcScore(lead: Lead, stageIdx: number, maxIdx: number): number {
  let s = 0

  // Temperature (0-35)
  s += lead.temperature === 'hot' ? 35 : lead.temperature === 'warm' ? 20 : 5

  // Stage progress (0-25)
  s += maxIdx > 0 ? Math.round((stageIdx / maxIdx) * 25) : 0

  // Budget defined (0-15)
  if (lead.budget_max && lead.budget_max >= 100_000) s += 15
  else if (lead.budget_max || lead.budget_min) s += 10

  // Contact completeness (0-10)
  if (lead.client_phone) s += 5
  if (lead.client_email) s += 3
  if (lead.vehicle_interest) s += 2

  // Recency (0-15)
  const d = daysSince(lead.created_at)
  s += d < 3 ? 15 : d < 7 ? 10 : d < 30 ? 5 : 0

  return Math.min(100, s)
}

// Win probability per stage position (0-indexed, linear scale)
const WIN_PROB: Record<number, number> = {
  0: 0.06, 1: 0.15, 2: 0.30, 3: 0.50, 4: 0.70, 5: 0.85, 6: 0.92,
}
function stageProbability(stage: PipelineStage, maxPosition: number): number {
  if (stage.is_won) return 1
  if (stage.is_final) return 0
  const idx = Math.min(stage.position, 6)
  return WIN_PROB[idx] ?? 0.92
}

function leadValue(lead: Lead): number {
  if (lead.won_value) return lead.won_value
  if (lead.budget_max) return lead.budget_max
  if (lead.budget_min) return lead.budget_min
  return DEFAULT_TICKET
}

// ─── Score badge ─────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#eab308' : '#f87171'
  return (
    <div style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}>
      <svg width={42} height={42} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={21} cy={21} r={17} fill="none" stroke="var(--el)" strokeWidth={3} />
        <circle cx={21} cy={21} r={17} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={`${(score / 100) * 2 * Math.PI * 17} ${2 * Math.PI * 17}`}
          strokeLinecap="round" />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color, fontFamily: 'var(--fm)' }}>
        {score}
      </span>
    </div>
  )
}

// ─── Temperature chip ────────────────────────────────────────────────────────

function TempChip({ temp }: { temp: string }) {
  const map: Record<string, { icon: string; color: string; label: string }> = {
    hot:  { icon: '🔥', color: '#f97316', label: 'Quente' },
    warm: { icon: '⚡', color: '#eab308', label: 'Morno' },
    cold: { icon: '❄️', color: '#60a5fa', label: 'Frio' },
  }
  const m = map[temp] ?? map.cold
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, color: m.color, background: `${m.color}18`, border: `1px solid ${m.color}30` }}>
      {m.icon} {m.label}
    </span>
  )
}

// ─── Stage probability bar ────────────────────────────────────────────────────

function ProbBar({ prob }: { prob: number }) {
  const color = prob >= 0.7 ? '#22c55e' : prob >= 0.4 ? '#eab308' : '#94a3b8'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--el)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${prob * 100}%`, background: color, borderRadius: 4, transition: 'width .6s ease' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{Math.round(prob * 100)}%</span>
    </div>
  )
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, color, highlight }: {
  icon: React.ReactNode; label: string; value: string; sub?: string
  color?: string; highlight?: boolean
}) {
  const c = color ?? 'var(--neon)'
  return (
    <div style={{
      background: 'var(--card)', border: `1px solid ${highlight ? c + '50' : 'var(--bs)'}`,
      borderRadius: 12, padding: '16px 18px',
      boxShadow: highlight ? `0 0 24px ${c}18` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${c}18`, border: `1px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c }}>
          {icon}
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{label}</span>
      </div>
      <p style={{ fontSize: 26, fontWeight: 900, color: c, fontFamily: 'var(--fm)', lineHeight: 1, marginBottom: 4 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.4 }}>{sub}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RevenueEngine() {
  const { store } = useAuthStore()

  const { data: stages = [] } = useQuery<PipelineStage[]>({
    queryKey: ['pipeline-stages', store?.id],
    enabled: !!store?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('pipeline_stages').select('*').eq('store_id', store!.id).order('position')
      return (data ?? []) as PipelineStage[]
    },
  })

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ['leads-revenue', store?.id],
    enabled: !!store?.id,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select(`*, stage:pipeline_stages(id,name,color,position,is_final,is_won)`)
        .eq('store_id', store!.id)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
      return (data ?? []) as Lead[]
    },
  })

  const derived = useMemo(() => {
    const activeStages = stages.filter(s => !s.is_final)
    const maxPos = activeStages.length > 0 ? Math.max(...activeStages.map(s => s.position)) : 0

    // Enrich leads with computed score + probability
    type RichLead = Lead & { computedScore: number; prob: number; expectedValue: number }

    const activeLeads = leads.filter(l => l.status === 'active')
    const wonLeads    = leads.filter(l => l.status === 'won')
    const lostLeads   = leads.filter(l => l.status === 'lost')

    const enriched: RichLead[] = activeLeads.map(l => {
      const stage = stages.find(s => s.id === l.stage_id)
      const stageIdx = stage ? stage.position : 0
      const prob = stage ? stageProbability(stage, maxPos) : 0.06
      const computedScore = calcScore(l, stageIdx, maxPos)
      const val = leadValue(l)
      return { ...l, computedScore, prob, expectedValue: prob * val }
    })

    // Total weighted pipeline
    const totalExpected = enriched.reduce((s, l) => s + l.expectedValue, 0)
    const totalPipelineValue = enriched.reduce((s, l) => s + leadValue(l), 0)

    // Won stats
    const totalWon = wonLeads.length
    const totalClosed = totalWon + lostLeads.length
    const winRate = totalClosed > 0 ? totalWon / totalClosed : 0
    const avgTicket = wonLeads.length > 0
      ? wonLeads.reduce((s, l) => s + (l.won_value ?? DEFAULT_TICKET), 0) / wonLeads.length
      : DEFAULT_TICKET

    // This month won revenue
    const thisMonth = new Date()
    thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0)
    const wonThisMonth = wonLeads.filter(l => new Date(l.updated_at ?? l.created_at) >= thisMonth)
    const revenueThisMonth = wonThisMonth.reduce((s, l) => s + (l.won_value ?? 0), 0)

    // Per-stage funnel
    const stageStats = stages
      .filter(s => !s.is_final)
      .sort((a, b) => a.position - b.position)
      .map(stage => {
        const stageLeads = enriched.filter(l => l.stage_id === stage.id)
        const prob = stageProbability(stage, maxPos)
        const totalValue = stageLeads.reduce((s, l) => s + leadValue(l), 0)
        const weighted = stageLeads.reduce((s, l) => s + l.expectedValue, 0)
        return { stage, count: stageLeads.length, prob, totalValue, weighted, leads: stageLeads }
      })

    // Won stage
    const wonStage = stages.find(s => s.is_won)
    const wonStageLeads = wonStage ? leads.filter(l => l.stage_id === wonStage.id && l.status === 'active') : []

    // Top leads by score
    const topLeads = [...enriched]
      .sort((a, b) => b.computedScore - a.computedScore)
      .slice(0, 12)

    // By source
    const sourceMap: Record<string, { count: number; won: number }> = {}
    leads.forEach(l => {
      const src = l.source || 'Direto'
      if (!sourceMap[src]) sourceMap[src] = { count: 0, won: 0 }
      sourceMap[src].count++
      if (l.status === 'won') sourceMap[src].won++
    })
    const bySource = Object.entries(sourceMap)
      .map(([src, d]) => ({ src, ...d, rate: d.count > 0 ? d.won / d.count : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    // Avg days in pipeline (active leads)
    const avgDays = activeLeads.length > 0
      ? activeLeads.reduce((s, l) => s + daysSince(l.created_at), 0) / activeLeads.length
      : 0

    // Score distribution
    const hot    = enriched.filter(l => l.computedScore >= 70).length
    const medium = enriched.filter(l => l.computedScore >= 40 && l.computedScore < 70).length
    const cold   = enriched.filter(l => l.computedScore < 40).length

    return {
      totalExpected, totalPipelineValue, winRate, avgTicket,
      revenueThisMonth, stageStats, topLeads, bySource,
      avgDays, hot, medium, cold,
      activeCount: activeLeads.length, wonCount: totalWon,
      wonStageLeads: wonStageLeads.length,
    }
  }, [leads, stages])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ height: 80, background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 12, opacity: .3, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={16} style={{ color: 'var(--neon)' }} />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--t)' }}>Motor de Receita</h1>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--neon)', background: 'var(--ng)', border: '1px solid var(--nb)', padding: '2px 8px', borderRadius: 20, letterSpacing: '.08em' }}>
            GIRARD ENGINE
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--t3)' }}>Receita esperada com base na probabilidade de fechamento por etapa do funil.</p>
      </div>

      {/* Métricas principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <MetricCard
          icon={<TrendingUp size={15} />}
          label="Receita Esperada"
          value={fmt(derived.totalExpected)}
          sub={`de ${fmt(derived.totalPipelineValue)} em carteira`}
          highlight
        />
        <MetricCard
          icon={<DollarSign size={15} />}
          label="Ganho no Mês"
          value={fmt(derived.revenueThisMonth)}
          sub={`${derived.wonCount} vendas fechadas`}
          color="#22c55e"
        />
        <MetricCard
          icon={<Target size={15} />}
          label="Taxa de Conversão"
          value={pct(derived.winRate)}
          sub="ganhos ÷ (ganhos + perdidos)"
          color="#a78bfa"
        />
        <MetricCard
          icon={<Award size={15} />}
          label="Ticket Médio"
          value={fmt(derived.avgTicket)}
          sub="média dos negócios fechados"
          color="#f59e0b"
        />
      </div>

      {/* Score distribuição */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 12, padding: '14px 18px' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
          Distribuição de Score — {derived.activeCount} leads ativos
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: '🔥 Quentes',  count: derived.hot,    color: '#22c55e', desc: 'Score ≥ 70' },
            { label: '⚡ Médios',   count: derived.medium, color: '#eab308', desc: 'Score 40–69' },
            { label: '❄️ Frios',    count: derived.cold,   color: '#94a3b8', desc: 'Score < 40' },
          ].map(b => (
            <div key={b.label} style={{ textAlign: 'center', background: 'var(--el)', borderRadius: 8, padding: '12px 8px', border: `1px solid ${b.color}30` }}>
              <p style={{ fontSize: 28, fontWeight: 900, color: b.color, fontFamily: 'var(--fm)', lineHeight: 1 }}>{b.count}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: b.color, marginTop: 4 }}>{b.label}</p>
              <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2 }}>{b.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ flex: derived.hot, height: 6, background: '#22c55e', borderRadius: derived.medium === 0 && derived.cold === 0 ? 4 : '4px 0 0 4px', minWidth: 4 }} />
          <div style={{ flex: derived.medium, height: 6, background: '#eab308', minWidth: 4 }} />
          <div style={{ flex: Math.max(derived.cold, 1), height: 6, background: '#94a3b8', borderRadius: derived.hot === 0 && derived.medium === 0 ? 4 : '0 4px 4px 0', minWidth: 4 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--t3)' }}>Média: {derived.activeCount > 0 ? Math.round(derived.topLeads.reduce((s, l) => s + l.computedScore, 0) / Math.max(derived.topLeads.length, 1)) : 0} pts</span>
          <span style={{ fontSize: 9, color: 'var(--t3)' }}>{Math.round(derived.avgDays)} dias médios em carteira</span>
        </div>
      </div>

      {/* Funil de conversão */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--bs)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={14} style={{ color: 'var(--neon)' }} />
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>Funil de Conversão com Probabilidades</p>
        </div>
        <div>
          {derived.stageStats.length === 0 ? (
            <p style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--t3)' }}>Configure etapas no Pipeline para ver o funil.</p>
          ) : (
            derived.stageStats.map((ss, i) => (
              <div key={ss.stage.id} style={{
                padding: '12px 18px', borderBottom: i < derived.stageStats.length - 1 ? '1px solid var(--bs)' : 'none',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                {/* Stage dot + name */}
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: ss.stage.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ss.stage.name}
                    </span>
                  </div>
                  <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 2, paddingLeft: 14 }}>
                    {ss.count} lead{ss.count !== 1 ? 's' : ''} · {fmt(ss.totalValue)}
                  </p>
                </div>

                {/* Probability bar */}
                <div style={{ flex: 1 }}>
                  <ProbBar prob={ss.prob} />
                </div>

                {/* Weighted value */}
                <div style={{ width: 90, textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--neon)', fontFamily: 'var(--fm)' }}>{fmt(ss.weighted)}</p>
                  <p style={{ fontSize: 9, color: 'var(--t3)' }}>esperado</p>
                </div>

                {/* Count badge */}
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0, fontFamily: 'var(--fm)',
                  background: ss.count > 0 ? `${ss.stage.color}18` : 'var(--el)',
                  border: `1px solid ${ss.count > 0 ? ss.stage.color + '40' : 'var(--b)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: ss.count > 0 ? ss.stage.color : 'var(--t3)',
                }}>
                  {ss.count}
                </div>
              </div>
            ))
          )}
        </div>
        {derived.stageStats.length > 0 && (
          <div style={{ padding: '10px 18px', background: 'var(--el)', borderTop: '1px solid var(--bs)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>Receita total ponderada</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--neon)', fontFamily: 'var(--fm)' }}>{fmt(derived.totalExpected)}</span>
          </div>
        )}
      </div>

      {/* Top leads por score */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--bs)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flame size={14} style={{ color: 'var(--neon)' }} />
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>Leads com Maior Probabilidade de Fechar</p>
          </div>
          <span style={{ fontSize: 10, color: 'var(--t3)' }}>Top {derived.topLeads.length}</span>
        </div>
        {derived.topLeads.length === 0 ? (
          <p style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--t3)' }}>Nenhum lead ativo no funil.</p>
        ) : (
          <div>
            {derived.topLeads.map((lead, i) => {
              const stage = stages.find(s => s.id === lead.stage_id)
              const val = leadValue(lead)
              const d = daysSince(lead.created_at)
              return (
                <div key={lead.id} style={{
                  padding: '11px 18px', borderBottom: i < derived.topLeads.length - 1 ? '1px solid var(--bs)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Rank */}
                  <span style={{ width: 18, fontSize: 10, fontWeight: 800, color: i < 3 ? 'var(--neon)' : 'var(--t3)', fontFamily: 'var(--fm)', flexShrink: 0 }}>
                    #{i + 1}
                  </span>

                  {/* Score ring */}
                  <ScoreBadge score={lead.computedScore} />

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.client_name}
                      </p>
                      <TempChip temp={lead.temperature} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {stage && (
                        <span style={{ fontSize: 9, color: stage.color, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: stage.color, display: 'inline-block' }} />
                          {stage.name}
                        </span>
                      )}
                      {lead.vehicle_interest && (
                        <span style={{ fontSize: 9, color: 'var(--t3)' }}>· {lead.vehicle_interest.slice(0, 25)}</span>
                      )}
                      {d > 0 && (
                        <span style={{ fontSize: 9, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Clock size={9} /> {d}d
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Value + probability */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--neon)', fontFamily: 'var(--fm)' }}>
                      {fmt(lead.expectedValue)}
                    </p>
                    <p style={{ fontSize: 9, color: 'var(--t3)' }}>{pct(lead.prob)} prob.</p>
                  </div>

                  <ChevronRight size={12} style={{ color: 'var(--t3)', flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Por fonte */}
      {derived.bySource.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--bs)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={14} style={{ color: 'var(--neon)' }} />
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>Fontes de Leads — Conversão</p>
          </div>
          <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {derived.bySource.map(s => (
              <div key={s.src} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t)', width: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.src}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--el)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    width: `${s.rate * 100}%`,
                    background: s.rate >= 0.3 ? 'var(--neon)' : s.rate >= 0.15 ? '#eab308' : '#94a3b8',
                    transition: 'width .6s ease',
                    minWidth: s.rate > 0 ? 4 : 0,
                  }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t2)', width: 32, textAlign: 'right' }}>{Math.round(s.rate * 100)}%</span>
                <span style={{ fontSize: 10, color: 'var(--t3)', width: 60, textAlign: 'right' }}>{s.count} leads</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alertas estratégicos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {derived.cold > derived.hot * 2 && (
          <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(251,191,36,.06)', border: '1px solid rgba(251,191,36,.25)', borderRadius: 10 }}>
            <AlertTriangle size={14} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 2 }}>Funil com muitos leads frios</p>
              <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>
                {derived.cold} leads com score baixo. Ative uma automação de reengajamento ou marque os perdidos para limpar o funil.
              </p>
            </div>
          </div>
        )}
        {derived.winRate > 0 && derived.winRate < 0.1 && (
          <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(248,113,113,.06)', border: '1px solid rgba(248,113,113,.25)', borderRadius: 10 }}>
            <AlertTriangle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#f87171', marginBottom: 2 }}>Taxa de conversão crítica — {pct(derived.winRate)}</p>
              <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>
                Girard fechava 1 em 5 leads. Revise o processo de qualificação e ative automações de follow-up para os leads mornos.
              </p>
            </div>
          </div>
        )}
        {derived.winRate >= 0.25 && (
          <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 10 }}>
            <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 2 }}>Conversão no nível Girard 🏆 — {pct(derived.winRate)}</p>
              <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5 }}>
                Excelente! Mantenha o ritmo de follow-up e expanda o programa de indicações para crescer sem depender só de novos leads.
              </p>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'var(--ng)', border: '1px solid var(--nb)', borderRadius: 10 }}>
          <Zap size={14} style={{ color: 'var(--neon)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
              <b style={{ color: 'var(--t2)' }}>Como o score é calculado:</b> temperatura (35pts) + avanço no funil (25pts) + orçamento definido (15pts) + dados de contato (10pts) + recência do lead (15pts).
              A receita esperada multiplica o valor estimado do negócio pela probabilidade de ganho em cada etapa.
            </p>
          </div>
        </div>
      </div>

    </div>
  )
}
