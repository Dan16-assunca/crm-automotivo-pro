import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Target, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency } from '@/utils/format'
import type { SalesGoal } from '@/types'

function GoalProgress({ goal }: { goal: SalesGoal }) {
  const unitsPct = goal.goal_units ? Math.min(100, Math.round((goal.achieved_units / goal.goal_units) * 100)) : 0
  const revPct = goal.goal_revenue ? Math.min(100, Math.round(((goal.achieved_revenue ?? 0) / goal.goal_revenue) * 100)) : 0

  return (
    <div
      style={{
        background: 'var(--card)', border: '1px solid var(--bs)',
        borderRadius: 9, padding: '16px 18px', transition: 'border-color .15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bs)')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {goal.salesperson ? 'Vendedor' : 'Loja'}
          </p>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginTop: 2 }}>
            {(goal.salesperson as any)?.full_name ?? 'Meta da Loja'}
          </h3>
          <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>
            {new Date(0, (goal.period_month ?? 1) - 1).toLocaleString('pt-BR', { month: 'long' })} {goal.period_year}
          </p>
        </div>
        <div style={{
          width: 38, height: 38, borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: unitsPct >= 100 ? 'var(--ng)' : 'var(--el)',
          border: `1px solid ${unitsPct >= 100 ? 'var(--nb)' : 'var(--b)'}`,
          color: unitsPct >= 100 ? 'var(--neon)' : 'var(--t2)',
        }}>
          {unitsPct >= 100 ? <Trophy size={18} /> : <Target size={18} />}
        </div>
      </div>

      {goal.goal_units && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
            <span style={{ color: 'var(--t2)' }}>Unidades</span>
            <span style={{ color: 'var(--t)', fontWeight: 600 }}>{goal.achieved_units} / {goal.goal_units}</span>
          </div>
          <div style={{ height: 6, background: 'var(--el)', borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${unitsPct}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              style={{
                height: '100%', borderRadius: 99,
                background: unitsPct >= 100 ? 'var(--neon)' : 'linear-gradient(90deg, var(--neon), rgba(61,247,16,.5))',
                boxShadow: unitsPct >= 100 ? '0 0 8px var(--neon)' : 'none',
              }}
            />
          </div>
          <p style={{ textAlign: 'right', fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>{unitsPct}%</p>
        </div>
      )}

      {goal.goal_revenue && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
            <span style={{ color: 'var(--t2)' }}>Faturamento</span>
            <span style={{ color: 'var(--t)', fontWeight: 600 }}>{formatCurrency(goal.achieved_revenue ?? 0)}</span>
          </div>
          <div style={{ height: 6, background: 'var(--el)', borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${revPct}%` }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 }}
              style={{
                height: '100%', borderRadius: 99,
                background: revPct >= 100 ? 'var(--neon)' : 'linear-gradient(90deg, var(--blu), rgba(59,130,246,.5))',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 3 }}>
            <span style={{ color: 'var(--t3)' }}>Meta: {formatCurrency(goal.goal_revenue)}</span>
            <span style={{ color: 'var(--t3)' }}>{revPct}%</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Goals() {
  const { store } = useAuthStore()
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  const { data: goals, isLoading } = useQuery({
    queryKey: ['sales-goals', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales_goals')
        .select('*, salesperson:users(full_name)')
        .eq('store_id', store!.id)
        .eq('period_month', currentMonth)
        .eq('period_year', currentYear)
      return (data ?? []) as SalesGoal[]
    },
    enabled: !!store?.id,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Metas</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
            {new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Button size="sm"><Target size={13} /> Definir Meta</Button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {[...Array(3)].map((_, i) => <Skeleton key={i} style={{ height: 180, borderRadius: 9 }} />)}
        </div>
      ) : goals?.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--t3)' }}>
          <Target size={44} style={{ margin: '0 auto 12px', opacity: .15 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>Nenhuma meta definida</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Defina metas para sua equipe este mês</p>
          <Button style={{ marginTop: 14 }} size="sm"><Target size={13} /> Criar primeira meta</Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {goals?.map((goal) => <GoalProgress key={goal.id} goal={goal} />)}
        </div>
      )}
    </div>
  )
}
