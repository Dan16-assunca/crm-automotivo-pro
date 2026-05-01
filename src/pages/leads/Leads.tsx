import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Users, Download, ChevronRight, Columns3, Check, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { useLeadFieldConfig } from '@/hooks/useLeadFieldConfig'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { QuickAddLeadSheet } from '@/components/mobile/QuickAddLeadSheet'
import { useIsMobile } from '@/hooks/useIsMobile'
import { formatCurrency, timeAgo } from '@/utils/format'
import type { Lead } from '@/types'

// ─── Temperatura ──────────────────────────────────────────────────────────────
const TEMP_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  hot:  { label: '🔥 Quente', color: 'var(--neon)',         bg: 'rgba(61,247,16,.08)',  border: 'rgba(61,247,16,.2)'  },
  warm: { label: '⚡ Morno',  color: 'rgba(61,247,16,.65)', bg: 'rgba(61,247,16,.06)', border: 'rgba(61,247,16,.15)' },
  cold: { label: '❄️ Frio',   color: 'var(--t2)',           bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.1)' },
}

// ─── Definição de colunas fixas ────────────────────────────────────────────────
interface ColDef {
  key: string
  label: string
  always?: boolean
  render: (lead: Lead) => React.ReactNode
  headerStyle?: React.CSSProperties
  cellStyle?: React.CSSProperties
}

const FIXED_COLS: ColDef[] = [
  {
    key: 'name', label: 'Nome', always: true,
    render: (lead) => (
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
    ),
  },
  {
    key: 'phone', label: 'Telefone',
    render: (lead) => <span style={{ fontSize: 11, color: 'var(--t)', fontFamily: 'var(--fm)', fontWeight: 500 }}>{lead.client_phone ?? '—'}</span>,
  },
  {
    key: 'email', label: 'Email',
    cellStyle: { maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    render: (lead) => <span style={{ fontSize: 11, color: 'var(--t2)' }}>{lead.client_email ?? '—'}</span>,
  },
  {
    key: 'interest', label: 'Interesse',
    cellStyle: { maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    render: (lead) => <span style={{ fontSize: 11, color: 'var(--t2)' }}>{lead.vehicle_interest ?? '—'}</span>,
  },
  {
    key: 'budget', label: 'Orçamento',
    render: (lead) => (
      <span style={{ fontSize: 11, color: 'var(--t2)', fontFamily: 'var(--fm)' }}>
        {lead.budget_max ? formatCurrency(lead.budget_max) : lead.budget_min ? `≥ ${formatCurrency(lead.budget_min)}` : '—'}
      </span>
    ),
  },
  {
    key: 'temperature', label: 'Temperatura',
    render: (lead) => {
      const tc = TEMP_CONFIG[lead.temperature]
      return tc ? (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
          background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
          textTransform: 'uppercase', letterSpacing: '.04em',
        }}>
          {tc.label}
        </span>
      ) : <span>—</span>
    },
  },
  {
    key: 'source', label: 'Origem',
    render: (lead) => <span style={{ fontSize: 11, color: 'var(--t2)' }}>{lead.source ?? '—'}</span>,
  },
  {
    key: 'stage', label: 'Estágio',
    render: (lead) => lead.stage ? (
      <span style={{
        fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
        background: 'var(--el)', color: 'var(--t2)', border: '1px solid var(--b)',
      }}>
        {(lead.stage as { name: string }).name}
      </span>
    ) : <span style={{ fontSize: 11, color: 'var(--t3)' }}>—</span>,
  },
  {
    key: 'city', label: 'Cidade',
    render: (lead) => <span style={{ fontSize: 11, color: 'var(--t2)' }}>{lead.client_city ?? '—'}</span>,
  },
  {
    key: 'cpf', label: 'CPF',
    render: (lead) => <span style={{ fontSize: 11, color: 'var(--t2)', fontFamily: 'var(--fm)' }}>{lead.client_cpf ?? '—'}</span>,
  },
  {
    key: 'salesperson', label: 'Vendedor',
    render: (lead) => (
      <span style={{ fontSize: 11, color: 'var(--t2)' }}>
        {(lead as Lead & { salesperson?: { full_name: string } }).salesperson?.full_name ?? '—'}
      </span>
    ),
  },
  {
    key: 'last_contact', label: 'Último Contato',
    render: (lead) => (
      <span style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>
        {lead.last_contact_at ? timeAgo(lead.last_contact_at) : timeAgo(lead.created_at)}
      </span>
    ),
  },
]

const DEFAULT_COLS = ['name', 'phone', 'interest', 'temperature', 'source', 'stage', 'last_contact']

// ─── Leads ────────────────────────────────────────────────────────────────────
export default function Leads() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const { openLeadPanel } = useLeadPanelStore()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const fieldConfig = useLeadFieldConfig()

  const [search, setSearch]           = useState('')
  const [filterTemp, setFilterTemp]   = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [sheetOpen, setSheetOpen]     = useState(false)
  const [showColPicker, setShowColPicker] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)

  // ── Seleção e exclusão ───────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setConfirmDelete(false)
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setConfirmDelete(false)
    if (!leads?.length) return
    setSelectedIds(prev =>
      prev.size === leads.length ? new Set() : new Set(leads.map(l => l.id))
    )
  }

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('leads').update({ status: 'archived' }).in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      setSelectedIds(new Set())
      setConfirmDelete(false)
      queryClient.invalidateQueries({ queryKey: ['leads-list', store?.id] })
    },
  })

  // ── Colunas visíveis (persistido por store no localStorage) ─────────────────
  const storageKey = `leads_cols_${store?.id ?? 'default'}`
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : DEFAULT_COLS
    } catch { return DEFAULT_COLS }
  })

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(visibleCols)) } catch {}
  }, [visibleCols, storageKey])

  // Fecha o picker ao clicar fora
  useEffect(() => {
    if (!showColPicker) return
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setShowColPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColPicker])

  // ── Colunas de campos personalizados ────────────────────────────────────────
  const customCols: ColDef[] = useMemo(() =>
    fieldConfig.custom_fields.map(cf => ({
      key: `cf_${cf.id}`,
      label: cf.label,
      cellStyle: { maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      render: (lead: Lead) => {
        const val = (lead.custom_fields as Record<string, string> | null)?.[cf.id]
        return <span style={{ fontSize: 11, color: 'var(--t2)' }}>{val || '—'}</span>
      },
    })),
  [fieldConfig.custom_fields])

  // Todas as colunas disponíveis
  const allCols = useMemo(() => [...FIXED_COLS, ...customCols], [customCols])

  // Colunas efetivamente renderizadas (na ordem de visibleCols)
  const activeCols = useMemo(() =>
    visibleCols
      .map(key => allCols.find(c => c.key === key))
      .filter(Boolean) as ColDef[],
  [visibleCols, allCols])

  const toggleCol = (key: string) => {
    setVisibleCols(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    )
  }

  // ── Realtime ────────────────────────────────────────────────────────────────
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

  // ── Query ────────────────────────────────────────────────────────────────────
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
      const { data } = await query.limit(200)
      return (data ?? []) as Lead[]
    },
    enabled: !!store?.id,
  })

  const selStyle: React.CSSProperties = {
    height: 32, padding: '0 28px 0 9px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 6, color: 'var(--t)', fontSize: 12, outline: 'none',
    fontFamily: 'var(--fn)', cursor: 'pointer', appearance: 'none',
  }

  // ── MOBILE ───────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
            <input
              type="search" placeholder="Buscar nome, telefone..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: 44, paddingLeft: 34, paddingRight: 12, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 10, color: 'var(--t)', fontSize: 16, outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            {[{ val: '', label: 'Todos' }, { val: 'hot', label: '🔥 Quente' }, { val: 'warm', label: '⚡ Morno' }, { val: 'cold', label: '❄️ Frio' }].map(chip => (
              <button key={chip.val} onClick={() => setFilterTemp(chip.val)} style={{ flexShrink: 0, height: 32, padding: '0 14px', borderRadius: 20, border: filterTemp === chip.val ? '1.5px solid var(--neon)' : '1px solid var(--b)', background: filterTemp === chip.val ? 'var(--ng)' : 'var(--el)', color: filterTemp === chip.val ? 'var(--neon)' : 'var(--t2)', fontSize: 12, fontWeight: filterTemp === chip.val ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {chip.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--t3)' }}>{leads?.length ?? 0} leads</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading
            ? [...Array(6)].map((_, i) => <div key={i} style={{ height: 72, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bs)' }}><Skeleton style={{ height: '100%', borderRadius: 12 }} /></div>)
            : leads?.map(lead => {
                const tc = TEMP_CONFIG[lead.temperature]
                const initials = lead.client_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
                return (
                  <div key={lead.id} onClick={() => openLeadPanel(lead.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 12, cursor: 'pointer', minHeight: 72 }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: tc?.bg ?? 'var(--el)', border: `2px solid ${tc?.color ?? 'var(--b)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: tc?.color ?? 'var(--t2)' }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.client_name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {lead.client_phone && <span style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>{lead.client_phone}</span>}
                        {lead.vehicle_interest && <span style={{ fontSize: 11, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {lead.vehicle_interest}</span>}
                      </div>
                      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {tc && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: tc.bg, color: tc.color, border: `1px solid ${tc.border}` }}>{tc.label}</span>}
                        <span style={{ fontSize: 10, color: 'var(--t3)' }}>{lead.last_contact_at ? timeAgo(lead.last_contact_at) : timeAgo(lead.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--t3)', flexShrink: 0 }} />
                  </div>
                )
              })}
          {!isLoading && leads?.length === 0 && (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--t3)' }}>
              <Users size={40} style={{ margin: '0 auto 12px', opacity: .15 }} />
              <p style={{ fontSize: 13 }}>Nenhum lead encontrado</p>
              <button onClick={() => setSheetOpen(true)} style={{ marginTop: 16, padding: '10px 24px', borderRadius: 10, background: 'var(--neon)', border: 'none', color: '#000', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cadastrar primeiro lead</button>
            </div>
          )}
        </div>

        <button onClick={() => setSheetOpen(true)} style={{ position: 'fixed', bottom: 'calc(72px + var(--safe-bottom) + 16px)', right: 20, width: 52, height: 52, borderRadius: '50%', background: 'var(--neon)', border: 'none', boxShadow: '0 4px 20px rgba(61,247,16,.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <Plus size={22} style={{ color: '#000' }} />
        </button>
        <QuickAddLeadSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </div>
    )
  }

  // ── DESKTOP ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Leads</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{leads?.length ?? 0} leads encontrados</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

          {/* ── Botão Excluir selecionados ── */}
          {selectedIds.size > 0 && (
            confirmDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--t2)' }}>
                  Excluir {selectedIds.size} lead{selectedIds.size > 1 ? 's' : ''}?
                </span>
                <button
                  onClick={() => deleteMutation.mutate([...selectedIds])}
                  disabled={deleteMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.4)', borderRadius: 7, color: '#f87171', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Confirmar'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ padding: '6px 10px', background: 'var(--el)', border: '1px solid var(--bs)', borderRadius: 7, color: 'var(--t2)', fontSize: 12, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 7, color: '#f87171', fontSize: 12, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.15)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,.08)' }}
              >
                <Trash2 size={12} /> Excluir {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
              </button>
            )
          )}

          {/* ── Botão Exportar ── */}
          <button
            onClick={() => {
              if (!leads?.length) return
              const headers = activeCols.map(c => c.label)
              const rows = (leads ?? []).map(lead =>
                activeCols.map(col => {
                  const el = col.render(lead)
                  if (typeof el === 'string') return el
                  // Extrai texto simples para campos comuns
                  if (col.key === 'name') return lead.client_name
                  if (col.key === 'phone') return lead.client_phone ?? ''
                  if (col.key === 'email') return lead.client_email ?? ''
                  if (col.key === 'interest') return lead.vehicle_interest ?? ''
                  if (col.key === 'temperature') return lead.temperature ?? ''
                  if (col.key === 'source') return lead.source ?? ''
                  if (col.key === 'city') return lead.client_city ?? ''
                  if (col.key === 'budget') return lead.budget_max?.toString() ?? lead.budget_min?.toString() ?? ''
                  if (col.key.startsWith('cf_')) {
                    const cfId = col.key.replace('cf_', '')
                    return (lead.custom_fields as Record<string, string> | null)?.[cfId] ?? ''
                  }
                  return ''
                })
              )
              const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
              const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click()
              URL.revokeObjectURL(url)
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'var(--el)', border: '1px solid var(--bs)', borderRadius: 7, color: 'var(--t2)', fontSize: 12, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)'; e.currentTarget.style.color = 'var(--neon)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.color = 'var(--t2)' }}
          >
            <Download size={12} /> Exportar
          </button>

          {/* ── Botão Colunas ── */}
          <div style={{ position: 'relative' }} ref={colPickerRef}>
            <button
              onClick={() => setShowColPicker(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                background: showColPicker ? 'var(--ng)' : 'var(--el)',
                border: showColPicker ? '1px solid var(--nb)' : '1px solid var(--bs)',
                borderRadius: 7,
                color: showColPicker ? 'var(--neon)' : 'var(--t2)',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              <Columns3 size={13} /> Colunas
              {visibleCols.length !== DEFAULT_COLS.length && (
                <span style={{ background: 'var(--neon)', color: '#000', fontSize: 9, fontWeight: 700, borderRadius: 10, padding: '1px 5px', marginLeft: 2 }}>
                  {visibleCols.length}
                </span>
              )}
            </button>

            {/* Dropdown picker */}
            {showColPicker && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
                background: 'var(--surf)', border: '1px solid var(--bs)',
                borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,.5)',
                width: 260, padding: '12px 0',
              }}>
                {/* Campos padrão */}
                <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '0 14px 6px' }}>
                  Campos padrão
                </p>
                {FIXED_COLS.map(col => (
                  <button
                    key={col.key}
                    onClick={() => !col.always && toggleCol(col.key)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 14px', background: 'transparent', border: 'none',
                      cursor: col.always ? 'default' : 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => { if (!col.always) e.currentTarget.style.background = 'var(--el)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: `1.5px solid ${visibleCols.includes(col.key) ? 'var(--neon)' : 'var(--b)'}`,
                      background: visibleCols.includes(col.key) ? 'var(--neon)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {visibleCols.includes(col.key) && <Check size={10} style={{ color: '#000' }} strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: 12, color: col.always ? 'var(--t3)' : 'var(--t)', flex: 1 }}>{col.label}</span>
                    {col.always && <span style={{ fontSize: 9, color: 'var(--t3)' }}>fixo</span>}
                  </button>
                ))}

                {/* Campos personalizados */}
                {customCols.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'var(--bs)', margin: '8px 0' }} />
                    <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '0 14px 6px' }}>
                      Campos personalizados
                    </p>
                    {customCols.map(col => (
                      <button
                        key={col.key}
                        onClick={() => toggleCol(col.key)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          border: `1.5px solid ${visibleCols.includes(col.key) ? 'var(--neon)' : 'var(--b)'}`,
                          background: visibleCols.includes(col.key) ? 'var(--neon)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {visibleCols.includes(col.key) && <Check size={10} style={{ color: '#000' }} strokeWidth={3} />}
                        </div>
                        <span style={{
                          fontSize: 12, color: 'var(--t)', flex: 1,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }} title={col.label}>{col.label}</span>
                      </button>
                    ))}
                  </>
                )}

                {/* Restaurar padrão */}
                <div style={{ height: 1, background: 'var(--bs)', margin: '8px 0' }} />
                <div style={{ padding: '4px 14px 2px' }}>
                  <button
                    onClick={() => setVisibleCols(DEFAULT_COLS)}
                    style={{ fontSize: 11, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Restaurar padrão
                  </button>
                </div>
              </div>
            )}
          </div>

          <Button size="sm" onClick={() => navigate('/pipeline?new=1')}>
            <Plus size={13} /> Novo Lead
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
          <input type="text" placeholder="Buscar por nome, telefone ou email..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 32, paddingLeft: 28, paddingRight: 10, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 6, color: 'var(--t)', fontSize: 12, outline: 'none', fontFamily: 'var(--fn)' }}
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

      {/* Tabela dinâmica */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: activeCols.length * 120 }}>
            <thead>
              <tr>
                {/* Checkbox "selecionar todos" */}
                <th style={{ padding: '8px 10px', width: 36, background: 'var(--el)', borderBottom: '1px solid var(--b)' }}>
                  <div
                    onClick={toggleSelectAll}
                    style={{
                      width: 16, height: 16, borderRadius: 4, cursor: 'pointer',
                      border: `1.5px solid ${leads?.length && selectedIds.size === leads.length ? 'var(--neon)' : 'var(--b)'}`,
                      background: leads?.length && selectedIds.size === leads.length ? 'var(--neon)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {leads?.length && selectedIds.size === leads.length
                      ? <Check size={10} style={{ color: '#000' }} strokeWidth={3} />
                      : selectedIds.size > 0
                        ? <div style={{ width: 8, height: 2, background: 'var(--t2)', borderRadius: 1 }} />
                        : null
                    }
                  </div>
                </th>
                {activeCols.map(col => (
                  <th key={col.key} style={{
                    padding: '8px 12px', textAlign: 'left',
                    fontSize: 10, fontWeight: 600, color: 'var(--t2)',
                    textTransform: 'uppercase', letterSpacing: '.06em',
                    background: 'var(--el)', borderBottom: '1px solid var(--b)',
                    whiteSpace: 'nowrap', maxWidth: 180,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    ...col.headerStyle,
                  }} title={col.label}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [...Array(8)].map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--bs)' }}>
                      <td style={{ padding: '8px 10px' }}><Skeleton style={{ width: 16, height: 16, borderRadius: 4 }} /></td>
                      {activeCols.map((_, j) => (
                        <td key={j} style={{ padding: '8px 12px' }}><Skeleton style={{ height: 12, borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                : leads?.map(lead => {
                    const isSelected = selectedIds.has(lead.id)
                    return (
                      <tr
                        key={lead.id}
                        onClick={() => openLeadPanel(lead.id)}
                        style={{
                          borderBottom: '1px solid var(--bs)', cursor: 'pointer',
                          background: isSelected ? 'rgba(57,255,20,.04)' : 'transparent',
                          transition: 'background .12s',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--el)' }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                      >
                        {/* Checkbox da linha */}
                        <td style={{ padding: '8px 10px', width: 36 }} onClick={e => toggleSelect(lead.id, e)}>
                          <div style={{
                            width: 16, height: 16, borderRadius: 4,
                            border: `1.5px solid ${isSelected ? 'var(--neon)' : 'var(--b)'}`,
                            background: isSelected ? 'var(--neon)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, cursor: 'pointer',
                          }}>
                            {isSelected && <Check size={10} style={{ color: '#000' }} strokeWidth={3} />}
                          </div>
                        </td>
                        {activeCols.map(col => (
                          <td key={col.key} style={{ padding: '8px 12px', ...col.cellStyle }}>
                            {col.render(lead)}
                          </td>
                        ))}
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>

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
