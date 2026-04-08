import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, UserCheck, Phone, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency, timeAgo } from '@/utils/format'
import type { Lead } from '@/types'

export default function Clients() {
  const { store } = useAuthStore()
  const [search, setSearch] = useState('')

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients', store?.id, search],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*')
        .eq('store_id', store!.id)
        .eq('status', 'won')
        .order('updated_at', { ascending: false })

      if (search) query = query.or(`client_name.ilike.%${search}%,client_phone.ilike.%${search}%`)

      const { data } = await query.limit(100)
      return (data ?? []) as Lead[]
    },
    enabled: !!store?.id,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Clientes</h1>
        <p className="text-sm text-[#555]">{clients?.length ?? 0} clientes ativos</p>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#1A1A1A] border border-[#222] text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-[#39FF14]"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(6)].map((_, i) => <div key={i} className="h-36 bg-[#111] border border-[#222] rounded-xl animate-pulse" />)
        ) : clients?.map((client) => (
          <div key={client.id} className="bg-[#111] border border-[#222] rounded-xl p-4 hover:border-[#39FF14]/20 transition-all cursor-pointer">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center text-sm font-bold text-[#39FF14] shrink-0">
                {client.client_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{client.client_name}</p>
                <Badge variant="success" dot className="text-[10px] mt-0.5">Cliente</Badge>
              </div>
            </div>
            <div className="space-y-1.5">
              {client.client_phone && (
                <p className="text-xs text-[#A0A0A0] flex items-center gap-1.5">
                  <Phone size={11} className="text-[#555]" /> {client.client_phone}
                </p>
              )}
              {client.client_email && (
                <p className="text-xs text-[#A0A0A0] flex items-center gap-1.5 truncate">
                  <Mail size={11} className="text-[#555]" /> {client.client_email}
                </p>
              )}
              {client.won_value && (
                <p className="text-xs text-[#39FF14] font-medium">{formatCurrency(client.won_value)}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {!isLoading && clients?.length === 0 && (
        <div className="text-center py-20 text-[#555]">
          <UserCheck size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium text-[#333]">Nenhum cliente ainda</p>
          <p className="text-sm">Clientes aparecem quando leads são marcados como ganhos</p>
        </div>
      )}
    </div>
  )
}
