import { useRef, useEffect, useState } from 'react'
import { Bell, Search, X, Clock, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import type { Lead } from '@/types'

function BellDropdown({ onClose }: { onClose: () => void }) {
  const { store } = useAuthStore()
  const { openLeadPanel } = useLeadPanelStore()
  const ref = useRef<HTMLDivElement>(null)

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(23, 59, 59, 999)

  const { data: followUps, isLoading } = useQuery({
    queryKey: ['followups', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, client_name, client_phone, next_followup_at, stage_id')
        .eq('store_id', store!.id)
        .not('next_followup_at', 'is', null)
        .lte('next_followup_at', tomorrow.toISOString())
        .order('next_followup_at', { ascending: true })
        .limit(20)
      return (data ?? []) as Lead[]
    },
    enabled: !!store?.id,
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const now = new Date()

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return `Hoje ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const isOverdue = (iso: string) => new Date(iso) < now

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0,
      width: 300, background: 'var(--surf)', border: '1px solid var(--bs)',
      borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,.6)',
      zIndex: 2000, overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--bs)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>Follow-ups pendentes</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 2 }}>
          <X size={12} />
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--t3)', fontSize: 11 }}>
          Carregando...
        </div>
      ) : !followUps?.length ? (
        <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--t3)', fontSize: 11 }}>
          <Clock size={20} style={{ margin: '0 auto 8px', opacity: 0.3, display: 'block' }} />
          Nenhum follow-up pendente
        </div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--bs) transparent' }}>
          {followUps.map(lead => (
            <button
              key={lead.id}
              onClick={() => { openLeadPanel(lead.id); onClose() }}
              style={{
                width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--bs)',
                padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                gap: 10, textAlign: 'left', transition: 'background .1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: isOverdue(lead.next_followup_at!) ? '#ff453a20' : 'var(--ng)',
                border: `1.5px solid ${isOverdue(lead.next_followup_at!) ? '#ff453a' : 'var(--nb)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
                color: isOverdue(lead.next_followup_at!) ? '#ff453a' : 'var(--neon)',
              }}>
                {lead.client_name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.client_name}
                </p>
                <p style={{ fontSize: 10, color: isOverdue(lead.next_followup_at!) ? '#ff453a' : 'var(--t3)', marginTop: 1 }}>
                  <Clock size={9} style={{ display: 'inline', marginRight: 3 }} />
                  {formatTime(lead.next_followup_at!)}
                </p>
              </div>
              <ChevronRight size={12} style={{ color: 'var(--t3)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Topbar() {
  const { user } = useAuthStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [bellOpen, setBellOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { store } = useAuthStore()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(23, 59, 59, 999)

  const { data: followUpCount } = useQuery({
    queryKey: ['followups-count', store?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', store!.id)
        .not('next_followup_at', 'is', null)
        .lte('next_followup_at', tomorrow.toISOString())
      return count ?? 0
    },
    enabled: !!store?.id,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') { setSearchOpen(false); setSearchValue(''); setBellOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <header style={{
      height: 50, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 16px',
      background: 'var(--surf)', borderBottom: '1px solid var(--bs)',
      flexShrink: 0, gap: 9,
    }}>

      {/* Search */}
      <div style={{ flex: 1, maxWidth: 360, position: 'relative' }}>
        <Search size={12} style={{
          position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--t3)', pointerEvents: 'none',
        }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar leads, veículos..."
          value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setSearchOpen(false)}
          style={{
            width: '100%', height: 32, paddingLeft: 28, paddingRight: searchValue ? 26 : 46,
            background: 'var(--card)', border: `1px solid ${searchOpen ? 'var(--nb)' : 'var(--b)'}`,
            borderRadius: 6, color: 'var(--t)', fontSize: 12,
            outline: 'none', fontFamily: 'var(--fn)',
            transition: 'border-color .15s',
          }}
        />
        {searchValue ? (
          <button
            onClick={() => setSearchValue('')}
            style={{
              position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 2,
            }}
          ><X size={11} /></button>
        ) : (
          <kbd style={{
            position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
            background: 'var(--el)', border: '1px solid var(--b)',
            color: 'var(--t3)', fontSize: 9, padding: '1px 5px', borderRadius: 4,
            fontFamily: 'var(--fm)', pointerEvents: 'none',
          }}>⌘K</kbd>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Notification bell */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setBellOpen(v => !v)}
            style={{
              width: 30, height: 30, borderRadius: 6, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: bellOpen ? 'var(--ng)' : 'transparent',
              border: `1px solid ${bellOpen ? 'var(--nb)' : 'var(--b)'}`,
              color: bellOpen ? 'var(--neon)' : 'var(--t3)', cursor: 'pointer',
              position: 'relative', transition: 'all .15s',
            }}
            onMouseEnter={e => { if (!bellOpen) { e.currentTarget.style.borderColor = 'var(--nb)'; e.currentTarget.style.color = 'var(--t)' } }}
            onMouseLeave={e => { if (!bellOpen) { e.currentTarget.style.borderColor = 'var(--b)'; e.currentTarget.style.color = 'var(--t3)' } }}
          >
            <Bell size={14} strokeWidth={1.75} />
            {(followUpCount ?? 0) > 0 && (
              <span style={{
                position: 'absolute', top: 5, right: 5,
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--red)', border: '1.5px solid var(--surf)',
              }} />
            )}
          </button>
          {bellOpen && <BellDropdown onClose={() => setBellOpen(false)} />}
        </div>

        <div style={{ width: 1, height: 18, background: 'var(--b)', margin: '0 2px' }} />

        {/* User avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'var(--ng)', border: '1.5px solid var(--nb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: 'var(--neon)',
          }}>
            {user?.full_name?.slice(0, 2).toUpperCase() ?? 'AD'}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', lineHeight: 1.2 }}>
              {user?.full_name?.split(' ')[0] ?? 'Administrador'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'capitalize', marginTop: 1 }}>
              {user?.role ?? 'Admin'}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
