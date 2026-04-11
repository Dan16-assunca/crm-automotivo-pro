import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

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

  const tooltipStyle = {
    contentStyle: { background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 7 },
    labelStyle: { color: 'var(--t)' },
    itemStyle: { color: 'var(--t2)' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Relatórios</h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Analytics e performance do funil</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card>
          <CardHeader style={{ padding: '14px 16px 0' }}>
            <CardTitle>Motivos de Perda</CardTitle>
            <Badge variant="danger">Leads perdidos</Badge>
          </CardHeader>
          <CardContent style={{ padding: '8px 16px 14px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={lostReasons ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--t2)', fontSize: 10 }} axisLine={false} tickLine={false} width={110} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="value" fill="var(--red)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader style={{ padding: '14px 16px 0' }}>
            <CardTitle>Performance por Origem</CardTitle>
          </CardHeader>
          <CardContent style={{ padding: '8px 16px 14px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sourcePerformance ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--b)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--t3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="total" fill="var(--blu)" radius={[4,4,0,0]} name="Total" />
                <Bar dataKey="won"   fill="var(--neon)" radius={[4,4,0,0]} name="Ganhos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Conversion table */}
      <Card>
        <CardHeader style={{ padding: '14px 16px 0' }}>
          <CardTitle>Taxa de Conversão por Origem</CardTitle>
        </CardHeader>
        <CardContent style={{ padding: '0 0 4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Origem', 'Total de Leads', 'Ganhos', 'Taxa de Conversão'].map(h => (
                  <th key={h} style={{
                    padding: '8px 16px', textAlign: 'left',
                    fontSize: 10, fontWeight: 600, color: 'var(--t3)',
                    textTransform: 'uppercase', letterSpacing: '.06em',
                    borderBottom: '1px solid var(--b)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sourcePerformance ?? []).map((row, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: '1px solid var(--bs)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '9px 16px', fontSize: 12, color: 'var(--t)', fontWeight: 600 }}>{row.name}</td>
                  <td style={{ padding: '9px 16px', fontSize: 12, color: 'var(--t2)' }}>{row.total}</td>
                  <td style={{ padding: '9px 16px', fontSize: 12, color: 'var(--neon)' }}>{row.won}</td>
                  <td style={{ padding: '9px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: 'var(--el)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--neon)', borderRadius: 99, width: `${row.rate}%` }} />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--neon)', minWidth: 28 }}>{row.rate}%</span>
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
