import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Filter, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency, timeAgo } from '@/utils/format'
import type { Lead } from '@/types'

const TEMP_VARIANTS: Record<string, 'hot' | 'warm' | 'cold'> = {
  hot: 'hot', warm: 'warm', cold: 'cold',
}
const TEMP_LABELS: Record<string, string> = {
  hot: '🔥 Quente', warm: '☀️ Morno', cold: '❄️ Frio',
}

export default function Leads() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterTemp, setFilterTemp] = useState('')
  const [filterSource, setFilterSource] = useState('')

  // ── Realtime: atualiza lista de leads automaticamente
  useEffect(() => {
    if (!store?.id) return
    const channel = supabase
      .channel(`leads-list-${store.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `store_id=eq.${store.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['leads-list', store.id] })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [store?.id, queryClient])

  const { data: leads, isLoading } = useQuery({
    queryKey: ['leads-list', store?.id, search, filterTemp, filterSource],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*, stage:pipeline_stages(name, color), salesperson:users(full_name)')
        .eq('store_id', store!.id)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })

      if (search) query = query.or(`client_name.ilike.%${search}%,client_phone.ilike.%${search}%,client_email.ilike.%${search}%`)
      if (filterTemp) query = query.eq('temperature', filterTemp)
      if (filterSource) query = query.eq('source', filterSource)

      const { data } = await query.limit(100)
      return (data ?? []) as Lead[]
    },
    enabled: !!store?.id,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Leads</h1>
          <p className="text-sm text-[#555]">{leads?.length ?? 0} leads encontrados</p>
        </div>
        <Button size="sm"><Plus size={14} /> Novo Lead</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#1A1A1A] border border-[#222] text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-[#39FF14]"
          />
        </div>
        <select
          value={filterTemp}
          onChange={(e) => setFilterTemp(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#1A1A1A] border border-[#222] text-sm text-white focus:outline-none"
        >
          <option value="">Temperatura</option>
          <option value="hot">🔥 Quente</option>
          <option value="warm">☀️ Morno</option>
          <option value="cold">❄️ Frio</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#1A1A1A] border border-[#222] text-sm text-white focus:outline-none"
        >
          <option value="">Origem</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="olx">OLX</option>
          <option value="webmotors">WebMotors</option>
          <option value="indicacao">Indicação</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#222]">
              {['Nome', 'Telefone', 'Interesse', 'Temperatura', 'Origem', 'Estágio', 'Último Contato'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs text-[#555] uppercase tracking-wider font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-[#1A1A1A]">
                  {[...Array(7)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-3 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : leads?.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-[#1A1A1A] hover:bg-[#39FF14]/3 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#1A1A1A] border border-[#222] flex items-center justify-center text-[10px] font-bold text-[#39FF14]">
                      {lead.client_name.slice(0,2).toUpperCase()}
                    </div>
                    <span className="text-sm text-white font-medium">{lead.client_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-[#A0A0A0]">{lead.client_phone ?? '—'}</td>
                <td className="px-4 py-3 text-sm text-[#A0A0A0] max-w-[160px] truncate">{lead.vehicle_interest ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={TEMP_VARIANTS[lead.temperature] ?? 'default'} dot>
                    {TEMP_LABELS[lead.temperature] ?? lead.temperature}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-[#A0A0A0]">{lead.source ?? '—'}</td>
                <td className="px-4 py-3">
                  {lead.stage && (
                    <Badge variant="default">
                      {(lead.stage as { name: string }).name}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[#555]">
                  {lead.last_contact_at ? timeAgo(lead.last_contact_at) : timeAgo(lead.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && leads?.length === 0 && (
          <div className="py-16 text-center text-[#555]">
            <Users size={40} className="mx-auto mb-3 opacity-20" />
            <p>Nenhum lead encontrado</p>
          </div>
        )}
      </div>
    </div>
  )
}
