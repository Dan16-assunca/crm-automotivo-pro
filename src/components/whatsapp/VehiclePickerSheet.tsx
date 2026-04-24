import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Search, Car, ChevronRight, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Vehicle } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Chamado com a mensagem formatada pronta para enviar */
  onSend: (message: string) => void
}

function formatPrice(v: number | null | undefined) {
  if (!v) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function formatKm(v: number | null | undefined) {
  if (v == null) return null
  return v.toLocaleString('pt-BR') + ' km'
}

/** Monta a ficha do veículo em formato WhatsApp */
function buildVehicleMessage(v: Vehicle): string {
  const lines: string[] = []

  const title = [v.brand, v.model, v.version].filter(Boolean).join(' ')
  lines.push(`🚗 *${title}*`)

  const year = v.year_model
    ? `${v.year_fabrication ?? ''}/${v.year_model}`
    : v.year_fabrication?.toString() ?? ''
  if (year) lines.push(`📅 Ano: ${year}`)
  if (v.color)        lines.push(`🎨 Cor: ${v.color}`)
  if (v.fuel)         lines.push(`⛽ Combustível: ${v.fuel}`)
  if (v.transmission) lines.push(`⚙️ Câmbio: ${v.transmission}`)
  if (v.km != null)   lines.push(`📍 KM: ${formatKm(v.km)}`)

  if (v.sale_price) {
    lines.push(``)
    lines.push(`💰 *${formatPrice(v.sale_price)}*`)
  }

  if (v.description?.trim()) {
    lines.push(``)
    lines.push(v.description.trim())
  }

  lines.push(``)
  lines.push(`Ficou interessado? Me chame para mais detalhes! 😊`)

  return lines.join('\n')
}

export function VehiclePickerSheet({ open, onClose, onSend }: Props) {
  const { store } = useAuthStore()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Vehicle | null>(null)
  const [preview, setPreview] = useState(false)

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles-picker', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('id,brand,model,version,year_fabrication,year_model,color,fuel,transmission,km,sale_price,purchase_price,photos,description,status,condition')
        .eq('store_id', store!.id)
        .eq('status', 'available')
        .order('created_at', { ascending: false })
      return (data ?? []) as Vehicle[]
    },
    enabled: !!store?.id && open,
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return vehicles
    const q = search.toLowerCase()
    return vehicles.filter(v =>
      [v.brand, v.model, v.version, v.color, v.plate].some(f => f?.toLowerCase().includes(q))
    )
  }, [vehicles, search])

  function handleSelect(v: Vehicle) {
    setSelected(v)
    setPreview(true)
  }

  function handleSend() {
    if (!selected) return
    onSend(buildVehicleMessage(selected))
    handleClose()
  }

  function handleClose() {
    setSearch('')
    setSelected(null)
    setPreview(false)
    onClose()
  }

  const cardStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 10,
    background: 'var(--el)', border: '1px solid var(--bs)',
    cursor: 'pointer', transition: 'all .12s',
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="vp-bd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 200 }}
          />

          {/* Sheet */}
          <motion.div
            key="vp-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              maxWidth: 620, margin: '0 auto',
              background: '#111b21',
              borderRadius: '20px 20px 0 0',
              border: '1px solid rgba(255,255,255,.08)',
              borderBottom: 'none',
              zIndex: 201,
              maxHeight: '85dvh',
              display: 'flex', flexDirection: 'column',
              paddingBottom: 'calc(16px + var(--safe-bottom, 0px))',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.15)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 12px' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#e9edef', margin: 0 }}>
                  {preview ? 'Prévia da ficha' : 'Selecionar veículo'}
                </h3>
                <p style={{ fontSize: 11, color: '#8696a0', margin: '2px 0 0' }}>
                  {preview ? 'Revise e envie para o cliente' : `${filtered.length} disponíveis no estoque`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {preview && (
                  <button
                    onClick={() => setPreview(false)}
                    style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#8696a0', cursor: 'pointer' }}
                  >
                    Voltar
                  </button>
                )}
                <button onClick={handleClose} style={{
                  width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.08)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8696a0',
                }}>
                  <X size={15} />
                </button>
              </div>
            </div>

            {!preview ? (
              <>
                {/* Search */}
                <div style={{ padding: '0 16px 12px', position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: '#8696a0', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Buscar por marca, modelo, cor..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%', height: 38, paddingLeft: 38, paddingRight: 12,
                      background: '#2a3942', border: '1px solid rgba(255,255,255,.06)',
                      borderRadius: 20, color: '#e9edef', fontSize: 13,
                      outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(37,211,102,.3)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)')}
                  />
                </div>

                {/* List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} style={{ height: 72, borderRadius: 10, background: 'rgba(255,255,255,.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))
                  ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#8696a0' }}>
                      <Car size={32} style={{ opacity: .3, marginBottom: 8 }} />
                      <p style={{ fontSize: 13 }}>{search ? 'Nenhum veículo encontrado' : 'Nenhum veículo disponível'}</p>
                    </div>
                  ) : filtered.map(v => {
                    const title = [v.brand, v.model, v.version].filter(Boolean).join(' ')
                    const year  = v.year_model ? `${v.year_fabrication}/${v.year_model}` : v.year_fabrication?.toString() ?? ''
                    const thumb = v.photos?.[0] ?? null

                    return (
                      <button
                        key={v.id}
                        onClick={() => handleSelect(v)}
                        style={{ ...cardStyle, textAlign: 'left', width: '100%' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,211,102,.3)'; e.currentTarget.style.background = 'rgba(37,211,102,.05)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.background = 'var(--el)' }}
                      >
                        {/* Thumb */}
                        <div style={{
                          width: 52, height: 52, borderRadius: 8, flexShrink: 0,
                          background: '#2a3942', overflow: 'hidden',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {thumb
                            ? <img src={thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <Car size={20} style={{ color: '#8696a0' }} />
                          }
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#e9edef', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title}
                          </p>
                          <p style={{ fontSize: 11, color: '#8696a0', margin: '2px 0 0' }}>
                            {[year, v.color, formatKm(v.km)].filter(Boolean).join(' · ')}
                          </p>
                          {v.sale_price && (
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#25d366', margin: '3px 0 0' }}>
                              {formatPrice(v.sale_price)}
                            </p>
                          )}
                        </div>

                        <ChevronRight size={16} style={{ color: '#8696a0', flexShrink: 0 }} />
                      </button>
                    )
                  })}
                </div>
              </>
            ) : selected && (
              /* Preview da mensagem */
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Card do veículo selecionado */}
                <div style={{
                  background: '#2a3942', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid rgba(37,211,102,.2)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <Check size={14} style={{ color: '#25d366', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#e9edef', margin: 0 }}>
                      {[selected.brand, selected.model, selected.version].filter(Boolean).join(' ')}
                    </p>
                    <p style={{ fontSize: 11, color: '#8696a0', margin: '1px 0 0' }}>
                      {selected.year_model ? `${selected.year_fabrication}/${selected.year_model}` : selected.year_fabrication}
                      {selected.color ? ` · ${selected.color}` : ''}
                    </p>
                  </div>
                  {selected.sale_price && (
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#25d366' }}>
                      {formatPrice(selected.sale_price)}
                    </span>
                  )}
                </div>

                {/* Prévia da mensagem */}
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#8696a0', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    Mensagem que será enviada
                  </p>
                  <div style={{
                    background: '#025c4c', borderRadius: '12px 12px 4px 12px',
                    padding: '10px 14px', fontSize: 13, color: '#e9edef',
                    lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    boxShadow: '0 1px 2px rgba(0,0,0,.3)',
                  }}>
                    {buildVehicleMessage(selected)}
                  </div>
                </div>

                {/* Foto do veículo se tiver */}
                {selected.photos && selected.photos.length > 0 && (
                  <div style={{ background: '#2a3942', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(255,255,255,.06)' }}>
                    <p style={{ fontSize: 11, color: '#8696a0', margin: '0 0 8px' }}>
                      📸 Este veículo tem {selected.photos.length} foto{selected.photos.length > 1 ? 's' : ''} — a ficha de texto será enviada agora. Você pode enviar as fotos separadamente pelo botão de anexo.
                    </p>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                      {selected.photos.slice(0, 4).map((url, i) => (
                        <img key={i} src={url} style={{ width: 64, height: 64, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Botão de envio */}
                <button
                  onClick={handleSend}
                  style={{
                    width: '100%', height: 50, borderRadius: 12,
                    background: '#25d366', color: '#111',
                    border: 'none', fontSize: 15, fontWeight: 800,
                    cursor: 'pointer', letterSpacing: '.02em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  Enviar ficha para o cliente
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
