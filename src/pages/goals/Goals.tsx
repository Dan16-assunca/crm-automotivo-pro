import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Target, Trophy, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/format'
import type { SalesGoal } from '@/types'

function GoalProgress({ goal }: { goal: SalesGoal }) {
  const unitsPct = goal.goal_units ? Math.min(100, Math.round((goal.achieved_units / goal.goal_units) * 100)) : 0
  const revPct = goal.goal_revenue ? Math.min(100, Math.round(((goal.achieved_revenue ?? 0) / goal.goal_revenue) * 100)) : 0

  return (
    <div className="bg-[#111] border border-[#222] rounded-xl p-5 hover:border-[#39FF14]/20 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-[#555] uppercase tracking-wider">
            {goal.salesperson ? 'Vendedor' : 'Loja'}
          </p>
          <h3 className="font-semibold text-white mt-0.5">
            {goal.salesperson?.full_name ?? 'Meta da Loja'}
          </h3>
          <p className="text-xs text-[#555]">
            {new Date(0, (goal.period_month ?? 1) - 1).toLocaleString('pt-BR', { month: 'long' })} {goal.period_year}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${unitsPct >= 100 ? 'bg-[#39FF14]/20 text-[#39FF14]' : 'bg-[#1A1A1A] text-[#A0A0A0]'}`}>
          {unitsPct >= 100 ? <Trophy size={20} /> : <Target size={20} />}
        </div>
      </div>

      {goal.goal_units && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[#A0A0A0]">Unidades</span>
            <span className="text-white font-medium">{goal.achieved_units} / {goal.goal_units}</span>
          </div>
          <div className="h-2.5 bg-[#1A1A1A] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${unitsPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: unitsPct >= 100 ? '#39FF14' : `linear-gradient(90deg, #39FF14, #2BCC0F)` }}
            />
          </div>
          <p className="text-right text-xs text-[#555] mt-1">{unitsPct}%</p>
        </div>
      )}

      {goal.goal_revenue && (
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[#A0A0A0]">Faturamento</span>
            <span className="text-white font-medium">{formatCurrency(goal.achieved_revenue ?? 0)}</span>
          </div>
          <div className="h-2.5 bg-[#1A1A1A] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${revPct}%` }}
              transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
              className="h-full rounded-full"
              style={{ background: revPct >= 100 ? '#39FF14' : `linear-gradient(90deg, #0A84FF, #0060CC)` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-[#555]">Meta: {formatCurrency(goal.goal_revenue)}</span>
            <span className="text-[#555]">{revPct}%</span>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Metas</h1>
          <p className="text-sm text-[#555]">
            {new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Button size="sm"><Target size={14} /> Definir Meta</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 bg-[#111] border border-[#222] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : goals?.length === 0 ? (
        <div className="text-center py-20 text-[#555]">
          <Target size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium text-[#333]">Nenhuma meta definida</p>
          <p className="text-sm mt-1">Defina metas para sua equipe este mês</p>
          <Button className="mt-4" size="sm"><Target size={14} /> Criar primeira meta</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals?.map((goal) => <GoalProgress key={goal.id} goal={goal} />)}
        </div>
      )}
    </div>
  )
}
