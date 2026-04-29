import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target, Trophy, Plus, X, ChevronLeft, ChevronRight,
  Edit2, Trash2, TrendingUp, Users, Award, DollarSign,
  Package, Percent, CheckCircle2, Clock, AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toast'
import { formatCurrency } from '@/utils/format'
import type { SalesGoal, User } from '@/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function pct(achieved: number, goal: number) {
  if (!goal) return 0
  return Math.min(100, Math.round((achieved / goal) * 100))
}

function statusColor(p: number) {
  if (p >= 100) return 'var(--neon)'
  if (p >= 70)  return 'rgba(61,247,16,.65)'
  if (p >= 40)  return 'var(--t2)'
  return 'var(--t3)'
}

function statusLabel(p: number) {
  if (p >= 100) return 'Bateu a meta!'
  if (p >= 70)  return 'No caminho'
  if (p >= 40)  return 'Atenção'
  return 'Atrasado'
}

function daysLeft(month: number, year: number) {
  const today = new Date()
  const last = new Date(year, month, 0)
  if (today.getMonth() + 1 !== month || today.getFullYear() !== year) return null
  return Math.max(0, Math.ceil((last.getTime() - today.getTime()) / 86400000))
}

// ─── Modal de criação/edição ──────────────────────────────────────────────────

interface GoalModalProps {
  goal?: SalesGoal | null
  users: User[]
  month: number
  year: number
  onClose: () => void
}

function GoalModal({ goal, users, month, year, onClose }: GoalModalProps) {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const isEdit = !!goal

  const [salespersonId, setSalespersonId] = useState(goal?.salesperson_id ?? '')
  const [periodMonth, setPeriodMonth]     = useState(goal?.period_month ?? month)
  const [periodYear, setPeriodYear]       = useState(goal?.period_year ?? year)
  const [goalUnits, setGoalUnits]         = useState(goal?.goal_units?.toString() ?? '')
  const [goalRevenue, setGoalRevenue]     = useState(goal?.goal_revenue?.toString() ?? '')
  const [commissionPct, setCommissionPct] = useState('1.5')

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        store_id: store!.id,
        salesperson_id: salespersonId || null,
        period_type: 'monthly' as const,
        period_month: periodMonth,
        period_year: periodYear,
        goal_units: goalUnits ? parseInt(goalUnits) : null,
        goal_revenue: goalRevenue ? parseFloat(goalRevenue) : null,
        achieved_units: goal?.achieved_units ?? 0,
        achieved_revenue: goal?.achieved_revenue ?? 0,
      }
      if (isEdit) {
        const { error } = await supabase.from('sales_goals').update(payload).eq('id', goal!.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('sales_goals').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-goals'] })
      toast.success(isEdit ? 'Meta atualizada!' : 'Meta criada!', '')
      onClose()
    },
    onError: (e: Error) => toast.error('Erro ao salvar meta', e.message),
  })

  const inp: React.CSSProperties = {
    width: '100%', height: 36, padding: '0 11px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 12,
    outline: 'none', fontFamily: 'var(--fn)',
  }
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--t3)',
    textTransform: 'uppercase', letterSpacing: '.06em',
    display: 'block', marginBottom: 5,
  }

  // Previsão de comissão
  const revGoal = parseFloat(goalRevenue) || 0
  const commPreview = revGoal * parseFloat(commissionPct || '0') / 100

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div
        initial={{ opacity: 0, scale: .96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: .96 }}
        transition={{ duration: .15 }}
        style={{
          background: 'var(--card)', border: '1px solid var(--bs)',
          borderRadius: 12, padding: '22px 24px', width: 460,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>
              {isEdit ? 'Editar Meta' : 'Nova Meta'}
            </h2>
            <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
              {isEdit ? 'Ajuste os valores da meta existente' : 'Defina metas de unidades e faturamento'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Vendedor */}
          <div>
            <label style={lbl}>Vendedor</label>
            <select value={salespersonId} onChange={e => setSalespersonId(e.target.value)}
              style={{ ...inp, cursor: 'pointer' }}>
              <option value="">Meta da Loja (geral)</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>

          {/* Período */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Mês</label>
              <select value={periodMonth} onChange={e => setPeriodMonth(parseInt(e.target.value))}
                style={{ ...inp, cursor: 'pointer' }}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Ano</label>
              <input type="number" style={inp} value={periodYear}
                onChange={e => setPeriodYear(parseInt(e.target.value) || year)}
                min={2024} max={2030} />
            </div>
          </div>

          {/* Metas */}
          <div style={{ background: 'var(--el)', borderRadius: 8, padding: '14px 16px' }}>
            <p style={{ ...lbl, marginBottom: 12 }}>Metas do Período</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}><Package size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />Unidades</label>
                <input type="number" style={inp} placeholder="Ex: 8" value={goalUnits}
                  onChange={e => setGoalUnits(e.target.value)} min={1} />
              </div>
              <div>
                <label style={lbl}><DollarSign size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />Faturamento (R$)</label>
                <input type="number" style={inp} placeholder="Ex: 800000" value={goalRevenue}
                  onChange={e => setGoalRevenue(e.target.value)} min={0} />
              </div>
            </div>
          </div>

          {/* Comissão */}
          <div style={{ background: 'var(--el)', borderRadius: 8, padding: '14px 16px' }}>
            <p style={{ ...lbl, marginBottom: 12 }}>Comissão do Vendedor</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}><Percent size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />% sobre faturamento</label>
                <input type="number" step="0.1" style={inp} value={commissionPct}
                  onChange={e => setCommissionPct(e.target.value)} min={0} max={20} />
              </div>
              <div>
                <label style={lbl}>Comissão prevista</label>
                <div style={{ height: 36, display: 'flex', alignItems: 'center', paddingLeft: 11 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--neon)' }}>
                    {formatCurrency(commPreview)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar meta'}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Card de meta ─────────────────────────────────────────────────────────────

function GoalCard({
  goal, wonLeads, onEdit, onDelete,
}: {
  goal: SalesGoal
  wonLeads: { salesperson_id: string | null; sale_value: number | null }[]
  onEdit: () => void
  onDelete: () => void
}) {
  // Calcula achievements a partir dos leads ganhos reais
  const myWon = wonLeads.filter(l => l.salesperson_id === (goal.salesperson_id ?? null))
  const achievedUnits = myWon.length > 0 ? myWon.length : goal.achieved_units
  const achievedRevenue = myWon.length > 0
    ? myWon.reduce((s, l) => s + (l.sale_value ?? 0), 0)
    : (goal.achieved_revenue ?? 0)

  const unitsPct = pct(achievedUnits, goal.goal_units ?? 0)
  const revPct   = pct(achievedRevenue, goal.goal_revenue ?? 0)
  const mainPct  = goal.goal_units ? unitsPct : revPct
  const days     = daysLeft(goal.period_month ?? 1, goal.period_year)

  const remainUnits = Math.max(0, (goal.goal_units ?? 0) - achievedUnits)
  const remainRev   = Math.max(0, (goal.goal_revenue ?? 0) - achievedRevenue)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--card)', border: '1px solid var(--bs)',
        borderRadius: 10, padding: '16px 18px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {goal.salesperson_id ? 'Vendedor' : 'Meta da Loja'}
          </p>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(goal.salesperson as any)?.full_name ?? 'Loja'}
          </h3>
          <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
            {MONTHS[(goal.period_month ?? 1) - 1]} {goal.period_year}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={onEdit} title="Editar"
            style={{ background: 'none', border: '1px solid var(--bs)', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', color: 'var(--t3)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)'; e.currentTarget.style.color = 'var(--neon)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.color = 'var(--t3)' }}>
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete} title="Remover"
            style={{ background: 'none', border: '1px solid var(--bs)', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', color: 'var(--t3)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.color = 'var(--t3)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600,
          background: `${statusColor(mainPct)}20`, color: statusColor(mainPct),
          border: `1px solid ${statusColor(mainPct)}40`,
        }}>
          {mainPct >= 100 ? <Trophy size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} /> : null}
          {statusLabel(mainPct)}
        </span>
        {days !== null && (
          <span style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={10} />
            {days === 0 ? 'Último dia!' : `${days} dias restantes`}
          </span>
        )}
      </div>

      {/* Barras de progresso */}
      {goal.goal_units != null && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
            <span style={{ color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Package size={11} /> Unidades
            </span>
            <span style={{ color: 'var(--t)', fontWeight: 600 }}>{achievedUnits} / {goal.goal_units}</span>
          </div>
          <div style={{ height: 7, background: 'var(--el)', borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${unitsPct}%` }} transition={{ duration: 0.9, ease: 'easeOut' }}
              style={{ height: '100%', borderRadius: 99, background: statusColor(unitsPct),
                boxShadow: unitsPct >= 100 ? `0 0 8px ${statusColor(unitsPct)}` : 'none' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>
            <span>{unitsPct}% concluído</span>
            {remainUnits > 0 && <span style={{ color: 'var(--t2)' }}>{remainUnits} un. restantes</span>}
          </div>
        </div>
      )}

      {goal.goal_revenue != null && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
            <span style={{ color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <DollarSign size={11} /> Faturamento
            </span>
            <span style={{ color: 'var(--t)', fontWeight: 600 }}>{formatCurrency(achievedRevenue)}</span>
          </div>
          <div style={{ height: 7, background: 'var(--el)', borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${revPct}%` }} transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
              style={{ height: '100%', borderRadius: 99, background: statusColor(revPct) }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>
            <span>Meta: {formatCurrency(goal.goal_revenue)}</span>
            {remainRev > 0 && <span style={{ color: 'var(--t2)' }}>Faltam {formatCurrency(remainRev)}</span>}
          </div>
        </div>
      )}

      {/* Projeção de comissão */}
      {goal.goal_revenue != null && achievedRevenue > 0 && (
        <div style={{ background: 'var(--el)', borderRadius: 7, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--t3)' }}>Comissão estimada (1,5%)</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--neon)' }}>
            {formatCurrency(achievedRevenue * 0.015)}
          </span>
        </div>
      )}
    </motion.div>
  )
}

// ─── Ranking ──────────────────────────────────────────────────────────────────

function Ranking({ goals, wonLeads }: {
  goals: SalesGoal[]
  wonLeads: { salesperson_id: string | null; sale_value: number | null }[]
}) {
  const ranked = goals
    .filter(g => g.salesperson_id)
    .map(g => {
      const myWon = wonLeads.filter(l => l.salesperson_id === g.salesperson_id)
      const units = myWon.length > 0 ? myWon.length : g.achieved_units
      const revenue = myWon.length > 0 ? myWon.reduce((s, l) => s + (l.sale_value ?? 0), 0) : (g.achieved_revenue ?? 0)
      const p = g.goal_units ? pct(units, g.goal_units) : pct(revenue, g.goal_revenue ?? 0)
      return { goal: g, units, revenue, p }
    })
    .sort((a, b) => b.p - a.p)

  if (!ranked.length) return null

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Award size={15} color="var(--neon)" />
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Ranking do Mês</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ranked.map(({ goal, units, revenue, p }, i) => (
          <div key={goal.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '9px 12px', borderRadius: 8,
            background: i === 0 ? 'rgba(61,247,16,.04)' : 'var(--el)',
            border: i === 0 ? '1px solid rgba(61,247,16,.12)' : '1px solid transparent',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{medals[i] ?? `#${i + 1}`}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(goal.salesperson as any)?.full_name ?? 'Vendedor'}
              </p>
              <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>
                {units} un. · {formatCurrency(revenue)}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: statusColor(p) }}>{p}%</p>
              <p style={{ fontSize: 9, color: 'var(--t3)' }}>da meta</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Goals() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()

  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [viewYear, setViewYear]   = useState(now.getFullYear())
  const [modal, setModal]         = useState<{ open: boolean; goal?: SalesGoal | null }>({ open: false })

  const navMonth = (dir: number) => {
    let m = viewMonth + dir
    let y = viewYear
    if (m > 12) { m = 1; y++ }
    if (m < 1)  { m = 12; y-- }
    setViewMonth(m); setViewYear(y)
  }

  // Usuários da loja (para dropdown)
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['store-users', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, email, role, active')
        .eq('store_id', store!.id)
        .eq('active', true)
        .order('full_name')
      return (data ?? []) as User[]
    },
    enabled: !!store?.id,
  })

  // Metas do período
  const { data: goals = [], isLoading } = useQuery<SalesGoal[]>({
    queryKey: ['sales-goals', store?.id, viewMonth, viewYear],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_goals')
        .select('*, salesperson:users(full_name, email)')
        .eq('store_id', store!.id)
        .eq('period_month', viewMonth)
        .eq('period_year', viewYear)
        .order('created_at', { ascending: true })
      return (data ?? []) as SalesGoal[]
    },
    enabled: !!store?.id,
  })

  // Leads ganhos no período para calcular achievements reais
  const { data: wonLeads = [] } = useQuery({
    queryKey: ['won-leads-month', store?.id, viewMonth, viewYear],
    queryFn: async () => {
      const from = new Date(viewYear, viewMonth - 1, 1).toISOString()
      const to   = new Date(viewYear, viewMonth, 1).toISOString()
      const { data } = await supabase
        .from('leads')
        .select('salesperson_id, sale_value')
        .eq('store_id', store!.id)
        .eq('status', 'won')
        .gte('updated_at', from)
        .lt('updated_at', to)
      return (data ?? []) as { salesperson_id: string | null; sale_value: number | null }[]
    },
    enabled: !!store?.id,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sales_goals').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-goals'] })
      toast.success('Meta removida', '')
    },
    onError: (e: Error) => toast.error('Erro ao remover', e.message),
  })

  const handleDelete = (goal: SalesGoal) => {
    const name = (goal.salesperson as any)?.full_name ?? 'loja'
    if (!confirm(`Remover a meta de ${name} para ${MONTHS[viewMonth - 1]}?`)) return
    deleteMutation.mutate(goal.id)
  }

  // KPIs do mês
  const kpis = useMemo(() => {
    const totalUnits    = wonLeads.length
    const totalRevenue  = wonLeads.reduce((s, l) => s + (l.sale_value ?? 0), 0)
    const goalUnits     = goals.reduce((s, g) => s + (g.goal_units ?? 0), 0)
    const goalRevenue   = goals.reduce((s, g) => s + (g.goal_revenue ?? 0), 0)
    const topGoal       = [...goals].sort((a, b) => {
      const aWon = wonLeads.filter(l => l.salesperson_id === a.salesperson_id).length
      const bWon = wonLeads.filter(l => l.salesperson_id === b.salesperson_id).length
      return pct(bWon, b.goal_units ?? 0) - pct(aWon, a.goal_units ?? 0)
    })[0]
    const topName = (topGoal?.salesperson as any)?.full_name ?? '—'
    const days = daysLeft(viewMonth, viewYear)
    const isCurrentMonth = viewMonth === now.getMonth() + 1 && viewYear === now.getFullYear()
    return { totalUnits, totalRevenue, goalUnits, goalRevenue, topName, days, isCurrentMonth }
  }, [goals, wonLeads, viewMonth, viewYear])

  const isCurrentMonth = viewMonth === now.getMonth() + 1 && viewYear === now.getFullYear()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Metas</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Acompanhe o desempenho da equipe por período</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Navegação de mês */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--el)', borderRadius: 8, padding: '4px 6px', border: '1px solid var(--bs)' }}>
            <button onClick={() => navMonth(-1)}
              style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', minWidth: 100, textAlign: 'center' }}>
              {MONTHS[viewMonth - 1]} {viewYear}
            </span>
            <button onClick={() => navMonth(1)}
              style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
              <ChevronRight size={14} />
            </button>
          </div>
          <Button size="sm" onClick={() => setModal({ open: true, goal: null })}>
            <Plus size={13} /> Definir Meta
          </Button>
        </div>
      </div>

      {/* KPI bar */}
      {goals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            {
              icon: <Package size={14} />,
              label: 'Unidades vendidas',
              value: `${kpis.totalUnits} / ${kpis.goalUnits || '—'}`,
              sub: kpis.goalUnits ? `${pct(kpis.totalUnits, kpis.goalUnits)}% da meta` : 'Sem meta de unidades',
              color: statusColor(pct(kpis.totalUnits, kpis.goalUnits)),
            },
            {
              icon: <DollarSign size={14} />,
              label: 'Faturamento',
              value: formatCurrency(kpis.totalRevenue),
              sub: kpis.goalRevenue ? `Meta: ${formatCurrency(kpis.goalRevenue)}` : 'Sem meta de faturamento',
              color: statusColor(pct(kpis.totalRevenue, kpis.goalRevenue)),
            },
            {
              icon: <Award size={14} />,
              label: 'Melhor vendedor',
              value: kpis.topName,
              sub: 'Maior % de meta',
              color: 'var(--neon)',
            },
            {
              icon: <Clock size={14} />,
              label: isCurrentMonth ? 'Dias restantes' : 'Período',
              value: kpis.days !== null ? `${kpis.days} dias` : MONTHS[viewMonth - 1],
              sub: isCurrentMonth ? 'Para fechar o mês' : `${viewYear}`,
              color: kpis.days !== null && kpis.days <= 5 ? 'var(--t2)' : 'var(--t2)',
            },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ color: k.color }}>{k.icon}</span>
                <span style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k.label}</span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: k.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.value}</p>
              <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Conteúdo principal */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {[...Array(3)].map((_, i) => <Skeleton key={i} style={{ height: 220, borderRadius: 10 }} />)}
        </div>
      ) : goals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--t3)' }}>
          <Target size={44} style={{ margin: '0 auto 12px', opacity: .15 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>Nenhuma meta em {MONTHS[viewMonth - 1]}</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Defina metas individuais ou para toda a loja</p>
          <Button style={{ marginTop: 14 }} size="sm" onClick={() => setModal({ open: true, goal: null })}>
            <Plus size={13} /> Criar primeira meta
          </Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, alignItems: 'start' }}>
          {goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              wonLeads={wonLeads}
              onEdit={() => setModal({ open: true, goal })}
              onDelete={() => handleDelete(goal)}
            />
          ))}
          {/* Ranking ao lado */}
          {goals.filter(g => g.salesperson_id).length >= 2 && (
            <Ranking goals={goals} wonLeads={wonLeads} />
          )}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modal.open && (
          <GoalModal
            goal={modal.goal}
            users={users}
            month={viewMonth}
            year={viewYear}
            onClose={() => setModal({ open: false })}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
