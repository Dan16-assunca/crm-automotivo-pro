import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users, Download, Phone, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { QuickAddLeadSheet } from '@/components/mobile/QuickAddLeadSheet'
import { useIsMobile } from '@/hooks/useIsMobile'
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
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [filterTemp, setFilterTemp] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

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

  // ── MOBILE VIEW ─────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Search + filtros chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
            <input
              type="search"
              placeholder="Buscar nome, telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', height: 44, paddingLeft: 34, paddingRight: 12,
                background: 'var(--el)', border: '1px solid var(--b)',
                borderRadius: 10, color: 'var(--t)', fontSize: 16,
                outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
              }}
            />
          </div>
          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            {[
              { val: '', label: 'Todos' },
              { val: 'hot', label: '🔥 Quente' },
              { val: 'warm', label: '⚡ Morno' },
              { val: 'cold', label: '❄️ Frio' },
            ].map(chip => (
              <button
                key={chip.val}
                onClick={() => setFilterTemp(chip.val)}
                style={{
                  flexShrink:   0,
                  height:       32,
                  padding:      '0 14px',
                  borderRadius: 20,
                  border:       filterTemp === chip.val ? '1.5px solid var(--neon)' : '1px solid var(--b)',
                  background:   filterTemp === chip.val ? 'var(--ng)' : 'var(--el)',
                  color:        filterTemp === chip.val ? 'var(--neon)' : 'var(--t2)',
                  fontSize:     12,
                  fontWeight:   filterTemp === chip.val ? 700 : 500,
                  cursor:       'pointer',
                  whiteSpace:   'nowrap',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--t3)' }}>{leads?.length ?? 0} leads</p>
        </div>

        {/* Card list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading
            ? [...Array(6)].map((_, i) => (
                <div key={i} style={{ height: 72, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bs)' }}>
                  <Skeleton style={{ height: '100%', borderRadius: 12 }} />
                </div>
              ))
            : leads?.map(lead => {
                const tc = TEMP_CONFIG[lead.temperature]
                const initials = lead.client_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
                return (
                  <div
                    key={lead.id}
                    onClick={() => openLeadPanel(lead.id)}
                    style={{
                      display:       'flex',
                      alignItems:    'center',
                      gap:           12,
                      padding:       '12px 14px',
                      background:    'var(--card)',
                      border:        '1px solid var(--bs)',
                      borderRadius:  12,
                      cursor:        'pointer',
                      minHeight:     72,
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width:          44, height: 44, borderRadius: '50%', flexShrink: 0,
                      background:     tc?.bg ?? 'var(--el)',
                      border:         `2px solid ${tc?.color ?? 'var(--b)'}`,
                      display:        'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize:       13, fontWeight: 800, color: tc?.color ?? 'var(--t2)',
                    }}>
                      {initials}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.client_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {lead.client_phone && (
                          <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>
                            {lead.client_phone}
                          </span>
                        )}
                        {lead.vehicle_interest && (
                          <span style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            · {lead.vehicle_interest}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {tc && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                            background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
                          }}>
                            {tc.label}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: 'var(--t3)' }}>
                          {lead.last_contact_at ? timeAgo(lead.last_contact_at) : timeAgo(lead.created_at)}
                        </span>
                      </div>
                    </div>

                    <ChevronRight size={16} style={{ color: 'var(--t3)', flexShrink: 0 }} />
                  </div>
                )
              })
          }

          {!isLoading && leads?.length === 0 && (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--t3)' }}>
              <Users size={40} style={{ margin: '0 auto 12px', opacity: .15 }} />
              <p style={{ fontSize: 13 }}>Nenhum lead encontrado</p>
              <button
                onClick={() => setSheetOpen(true)}
                style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, background: 'var(--neon)', border: 'none', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Cadastrar primeiro lead
              </button>
            </div>
          )}
        </div>

        {/* FAB "+" */}
        <button
          onClick={() => setSheetOpen(true)}
          style={{
            position:     'fixed',
            bottom:       'calc(72px + var(--safe-bottom) + 16px)',
            right:        20,
            width:        52,
            height:       52,
            borderRadius: '50%',
            background:   'var(--neon)',
            border:       'none',
            boxShadow:    '0 4px 20px rgba(61,247,16,.4)',
            cursor:       'pointer',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            zIndex:       50,
          }}
        >
          <Plus size={22} style={{ color: '#000' }} />
        </button>

        <QuickAddLeadSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </div>
    )
  }

  // ── DESKTOP VIEW ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Leads</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{leads?.length ?? 0} leads encontrados</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              if (!leads?.length) return
              const csv = ['Nome,Telefone,Email,Temperatura,Origem,Etapa']
                .concat((leads ?? []).map((l: Lead) =>
                  [l.client_name, l.client_phone ?? '', l.client_email ?? '', l.temperature ?? '', l.source ?? '', ''].join(',')
                )).join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click()
              URL.revokeObjectURL(url)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
              background: 'var(--el)', border: '1px solid var(--bs)', borderRadius: 7,
              color: 'var(--t2)', fontSize: 12, cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)'; e.currentTarget.style.color = 'var(--neon)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.color = 'var(--t2)' }}>
            <Download size={12} /> Exportar
          </button>
          <Button size="sm" onClick={() => navigate('/pipeline?new=1')}>
            <Plus size={13} /> Novo Lead
          </Button>
        </div>
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
                  <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--t)', fontFamily: 'var(--fm)', fontWeight: 500 }}>
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
