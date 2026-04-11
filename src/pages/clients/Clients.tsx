import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, UserCheck, Phone, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency } from '@/utils/format'
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Clientes</h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{clients?.length ?? 0} clientes ativos</p>
      </div>

      <div style={{ position: 'relative', maxWidth: 320 }}>
        <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', height: 32, paddingLeft: 28, paddingRight: 10,
            background: 'var(--el)', border: '1px solid var(--b)',
            borderRadius: 6, color: 'var(--t)', fontSize: 12,
            outline: 'none', fontFamily: 'var(--fn)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {isLoading ? (
          [...Array(6)].map((_, i) => <Skeleton key={i} style={{ height: 130, borderRadius: 9 }} />)
        ) : clients?.map((client) => (
          <div
            key={client.id}
            style={{
              background: 'var(--card)', border: '1px solid var(--bs)',
              borderRadius: 9, padding: '14px 16px', cursor: 'pointer',
              transition: 'border-color .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bs)')}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                background: 'var(--ng)', border: '1px solid var(--nb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--neon)',
              }}>
                {client.client_name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {client.client_name}
                </p>
                <Badge variant="success" dot style={{ marginTop: 3 }}>Cliente</Badge>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {client.client_phone && (
                <p style={{ fontSize: 11, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Phone size={10} style={{ color: 'var(--t3)', flexShrink: 0 }} /> {client.client_phone}
                </p>
              )}
              {client.client_email && (
                <p style={{ fontSize: 11, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Mail size={10} style={{ color: 'var(--t3)', flexShrink: 0 }} /> {client.client_email}
                </p>
              )}
              {client.won_value && (
                <p style={{ fontSize: 12, color: 'var(--neon)', fontWeight: 600 }}>{formatCurrency(client.won_value)}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {!isLoading && clients?.length === 0 && (
        <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--t3)' }}>
          <UserCheck size={44} style={{ margin: '0 auto 12px', opacity: .15 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>Nenhum cliente ainda</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Clientes aparecem quando leads são marcados como ganhos</p>
        </div>
      )}
    </div>
  )
}
