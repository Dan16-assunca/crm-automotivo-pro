import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { timeAgo } from '@/utils/format'
import type { Lead } from '@/types'

const TEMP_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  hot:  { label: '🔥 Quente', color: 'var(--red)',  bg: 'rgba(244,63,94,.1)',  border: 'rgba(244,63,94,.2)' },
  warm: { label: '⚡ Morno',  color: 'var(--ora)',  bg: 'rgba(249,115,22,.1)', border: 'rgba(249,115,22,.2)' },
  cold: { label: '❄️ Frio',   color: 'var(--blu)',  bg: 'rgba(59,130,246,.1)', border: 'rgba(59,130,246,.2)' },
}

export default function Leads() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const { openLeadPanel } = useLeadPanelStore()
  const [search, setSearch] = useState('')
  const [filterTemp, setFilterTemp] = useState('')
  const [filterSource, setFilterSource] = useState('')

  useEffect(() => {
    if (!store?.id) return
    const channel = supabase
      .channel(`leads-list-${store.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `store_id=eq.${store.id}` },
        () => { queryClient.invalidateQueries({ queryKey: ['leads-list', store.id] }) }
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

  const selStyle = {
    height: 32, padding: '0 28px 0 9px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 6, color: 'var(--t)', fontSize: 12, outline: 'none',
    fontFamily: 'var(--fn)', cursor: 'pointer',
    appearance: 'none' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Leads</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{leads?.length ?? 0} leads encontrados</p>
        </div>
        <Button size="sm"><Plus size={13} /> Novo Lead</Button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou email..."
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
        <select value={filterTemp} onChange={e => setFilterTemp(e.target.value)} style={selStyle}>
          <option value="">Temperatura</option>
          <option value="hot">🔥 Quente</option>
          <option value="warm">⚡ Morno</option>
          <option value="cold">❄️ Frio</option>
        </select>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={selStyle}>
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
      <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Nome', 'Telefone', 'Interesse', 'Temperatura', 'Origem', 'Estágio', 'Último Contato'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px', textAlign: 'left',
                  fontSize: 10, fontWeight: 600, color: 'var(--t2)',
                  textTransform: 'uppercase', letterSpacing: '.06em',
                  background: 'var(--el)', borderBottom: '1px solid var(--b)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(8)].map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--bs)' }}>
                  {[...Array(7)].map((_, j) => (
                    <td key={j} style={{ padding: '8px 12px' }}>
                      <Skeleton style={{ height: 12, borderRadius: 4 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : leads?.map(lead => {
              const tc = TEMP_CONFIG[lead.temperature]
              return (
                <tr
                  key={lead.id}
                  onClick={() => openLeadPanel(lead.id)}
                  style={{
                    borderBottom: '1px solid var(--bs)', cursor: 'pointer',
                    background: 'transparent',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                        background: 'var(--ng)', border: '1px solid var(--nb)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700, color: 'var(--neon)',
                      }}>
                        {lead.client_name.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>{lead.client_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>
                    {lead.client_phone ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--t2)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.vehicle_interest ?? '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {tc && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                        background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
                        textTransform: 'uppercase', letterSpacing: '.04em',
                      }}>
                        {tc.label}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--t2)' }}>{lead.source ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {lead.stage && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                        background: 'var(--el)', color: 'var(--t2)', border: '1px solid var(--b)',
                      }}>
                        {(lead.stage as { name: string }).name}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>
                    {lead.last_contact_at ? timeAgo(lead.last_contact_at) : timeAgo(lead.created_at)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!isLoading && leads?.length === 0 && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--t3)' }}>
            <Users size={36} style={{ margin: '0 auto 10px', opacity: .18 }} />
            <p style={{ fontSize: 12 }}>Nenhum lead encontrado</p>
          </div>
        )}
      </div>

    </div>
  )
}
