import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

const COLORS = ['#39FF14', '#0A84FF', '#FFD60A', '#FF9F0A', '#BF5AF2', '#FF3B30']

export default function Reports() {
  const { store } = useAuthStore()

  const { data: lostReasons } = useQuery({
    queryKey: ['lost-reasons', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('lost_reason')
        .eq('store_id', store!.id)
        .eq('status', 'lost')
        .not('lost_reason', 'is', null)

      const counts: Record<string, number> = {}
      data?.forEach(l => { counts[l.lost_reason!] = (counts[l.lost_reason!] ?? 0) + 1 })
      return Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    },
    enabled: !!store?.id,
  })

  const { data: sourcePerformance } = useQuery({
    queryKey: ['source-performance', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('source, status')
        .eq('store_id', store!.id)
        .not('source', 'is', null)

      const bySource: Record<string, { total: number; won: number }> = {}
      data?.forEach(l => {
        if (!bySource[l.source!]) bySource[l.source!] = { total: 0, won: 0 }
        bySource[l.source!].total++
        if (l.status === 'won') bySource[l.source!].won++
      })

      return Object.entries(bySource).map(([name, { total, won }]) => ({
        name,
        total,
        won,
        rate: total > 0 ? Math.round((won / total) * 100) : 0,
      }))
    },
    enabled: !!store?.id,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Relatórios</h1>
        <p className="text-sm text-[#555]">Analytics e performance do funil</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Motivos de Perda</CardTitle>
            <Badge variant="danger">Leads perdidos</Badge>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={lostReasons ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#555', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#A0A0A0', fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 8 }} labelStyle={{ color: '#fff' }} />
                <Bar dataKey="value" fill="#FF3B30" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance por Origem</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sourcePerformance ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="name" tick={{ fill: '#555', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#555', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #222', borderRadius: 8 }} />
                <Bar dataKey="total" fill="#0A84FF" radius={[4,4,0,0]} name="Total" />
                <Bar dataKey="won" fill="#39FF14" radius={[4,4,0,0]} name="Ganhos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Source conversion table */}
      <Card>
        <CardHeader>
          <CardTitle>Taxa de Conversão por Origem</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#222]">
                {['Origem', 'Total de Leads', 'Ganhos', 'Taxa de Conversão'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs text-[#555] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sourcePerformance ?? []).map((row, i) => (
                <tr key={i} className="border-b border-[#1A1A1A] hover:bg-[#39FF14]/3">
                  <td className="px-4 py-3 text-sm text-white font-medium">{row.name}</td>
                  <td className="px-4 py-3 text-sm text-[#A0A0A0]">{row.total}</td>
                  <td className="px-4 py-3 text-sm text-[#39FF14]">{row.won}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden">
                        <div className="h-full bg-[#39FF14] rounded-full" style={{ width: `${row.rate}%` }} />
                      </div>
                      <span className="text-xs text-[#39FF14] w-8">{row.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
