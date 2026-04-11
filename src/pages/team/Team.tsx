import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Equipe</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{members?.length ?? 0} membros</p>
        </div>
        <Button size="sm"><Plus size={13} /> Adicionar Membro</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Skeleton key={i} style={{ height: 140, borderRadius: 9 }} />
          ))
        ) : members?.map((member) => (
          <div
            key={member.id}
            style={{
              background: 'var(--card)', border: '1px solid var(--bs)',
              borderRadius: 9, padding: '16px 18px',
              transition: 'border-color .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bs)')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--ng)', border: '1px solid var(--nb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: 'var(--neon)', flexShrink: 0,
              }}>
                {member.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{member.full_name}</p>
                <Badge variant={ROLE_VARIANTS[member.role] ?? 'default'} style={{ marginTop: 2 }}>
                  {ROLE_LABELS[member.role] ?? member.role}
                </Badge>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--t3)' }}>
              <p>{member.email}</p>
              {member.phone && <p>{member.phone}</p>}
              {member.whatsapp_number && <p>WhatsApp: {member.whatsapp_number}</p>}
            </div>
            <div style={{ marginTop: 10 }}>
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
