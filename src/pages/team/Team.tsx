import { useQuery } from '@tanstack/react-query'
import { Plus, Building2, Shield, UserCog } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { User } from '@/types'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Gerente', salesperson: 'Vendedor',
}
const ROLE_VARIANTS: Record<string, 'neon' | 'info' | 'default'> = {
  admin: 'neon', manager: 'info', salesperson: 'default',
}

export default function Team() {
  const { store } = useAuthStore()

  const { data: members, isLoading } = useQuery({
    queryKey: ['team', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('store_id', store!.id)
        .order('role')
      return (data ?? []) as User[]
    },
    enabled: !!store?.id,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Equipe</h1>
          <p className="text-sm text-[#555]">{members?.length ?? 0} membros</p>
        </div>
        <Button size="sm"><Plus size={14} /> Adicionar Membro</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => <div key={i} className="h-40 bg-[#111] border border-[#222] rounded-xl animate-pulse" />)
        ) : members?.map((member) => (
          <div key={member.id} className="bg-[#111] border border-[#222] rounded-xl p-5 hover:border-[#39FF14]/20 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center text-lg font-bold text-[#39FF14]">
                {member.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-white">{member.full_name}</p>
                <Badge variant={ROLE_VARIANTS[member.role] ?? 'default'} className="mt-0.5 text-[10px]">
                  {ROLE_LABELS[member.role] ?? member.role}
                </Badge>
              </div>
            </div>
            <div className="space-y-1 text-xs text-[#555]">
              <p>{member.email}</p>
              {member.phone && <p>{member.phone}</p>}
              {member.whatsapp_number && <p>WhatsApp: {member.whatsapp_number}</p>}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Badge variant={member.active ? 'success' : 'default'} dot>
                {member.active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
