import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Search, Car, ChevronRight, Check, Send, ImageIcon, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Vehicle } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Chamado com texto e URLs de fotos prontos para enviar */
  onSend: (message: string, photoUrls: string[]) => void
}

function formatPrice(v: number | null | undefined) {
  if (!v) return null
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function formatKm(v: number | null | undefined) {
  if (v == null) return null
  return v.toLocaleString('pt-BR') + ' km'
}

function buildVehicleMessage(v: Vehicle): string {
  const lines: string[] = []
  const title = [v.brand, v.model, v.version].filter(Boolean).join(' ')
  lines.push(`🚗 *${title}*`)
  const year = v.year_model
    ? `${v.year_fabrication ?? ''}/${v.year_model}`
    : v.year_fabrication?.toString() ?? ''
  if (year)           lines.push(`📅 Ano: ${year}`)
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

// ─── Tela de lista de veículos ────────────────────────────────────────────────

function VehicleList({
  vehicles, isLoading, search, onSearch, onSelect,
}: {
  vehicles: Vehicle[]
  isLoading: boolean
  search: string
  onSearch: (v: string) => void
  onSelect: (v: Vehicle) => void
}) {
  return (
    <>
      {/* Search */}
      <div style={{ padding: '0 16px 12px', position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: '#8696a0', pointerEvents: 'none' }} />
        <input
          type="text"
          placeholder="Buscar por marca, modelo, cor..."
          value={search}
          onChange={e => onSearch(e.target.value)}
          autoFocus
          style={{
            width: '100%', height: 40, paddingLeft: 38, paddingRight: 12,
            background: '#2a3942', border: '1px solid rgba(255,255,255,.06)',
            borderRadius: 20, color: '#e9edef', fontSize: 13,
            outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(37,211,102,.3)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)')}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 72, borderRadius: 10, background: 'rgba(255,255,255,.04)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))
          : vehicles.length === 0
          ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#8696a0' }}>
              <Car size={36} style={{ opacity: .25, marginBottom: 10 }} />
              <p style={{ fontSize: 13 }}>{search ? 'Nenhum veículo encontrado' : 'Nenhum veículo disponível'}</p>
            </div>
          ) : vehicles.map(v => {
            const title = [v.brand, v.model, v.version].filter(Boolean).join(' ')
            const year  = v.year_model ? `${v.year_fabrication}/${v.year_model}` : v.year_fabrication?.toString() ?? ''
            const thumb = v.photos?.[0] ?? null
            const photoCount = v.photos?.length ?? 0

            return (
              <button
                key={v.id}
                onClick={() => onSelect(v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10, width: '100%',
                  background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
                  cursor: 'pointer', textAlign: 'left', transition: 'all .12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,211,102,.3)'; e.currentTarget.style.background = 'rgba(37,211,102,.05)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'; e.currentTarget.style.background = 'rgba(255,255,255,.03)' }}
              >
                {/* Thumb */}
                <div style={{
                  width: 56, height: 56, borderRadius: 8, flexShrink: 0,
                  background: '#2a3942', overflow: 'hidden', position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {thumb
                    ? <img src={thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Car size={22} style={{ color: '#8696a0' }} />
                  }
                  {photoCount > 1 && (
                    <div style={{
                      position: 'absolute', bottom: 3, right: 3,
                      background: 'rgba(0,0,0,.7)', borderRadius: 4,
                      fontSize: 9, fontWeight: 700, color: '#fff',
                      padding: '1px 4px', display: 'flex', alignItems: 'center', gap: 2,
                    }}>
                      <ImageIcon size={8} /> {photoCount}
                    </div>
                  )}
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

                <ChevronRight size={16} style={{ color: '#555', flexShrink: 0 }} />
              </button>
            )
          })
        }
      </div>
    </>
  )
}

// ─── Tela de prévia / confirmação ─────────────────────────────────────────────

function VehiclePreview({
  vehicle,
  onBack,
  onSend,
}: {
  vehicle: Vehicle
  onBack: () => void
  onSend: (message: string, photoUrls: string[]) => void
}) {
  const photos = vehicle.photos ?? []
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(
    new Set(photos.map((_, i) => i)) // todas selecionadas por padrão
  )
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState(0)

  function togglePhoto(idx: number) {
    setSelectedPhotos(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  async function handleSend() {
    setSending(true)
    setSentCount(0)
    const message = buildVehicleMessage(vehicle)
    const photoUrls = photos.filter((_, i) => selectedPhotos.has(i))
    // Simula progresso visual enquanto o componente pai envia
    for (let i = 0; i <= photoUrls.length; i++) {
      setSentCount(i)
      if (i < photoUrls.length) await new Promise(r => setTimeout(r, 120))
    }
    onSend(message, photoUrls)
  }

  const message = buildVehicleMessage(vehicle)
  const selectedCount = selectedPhotos.size

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Card resumo */}
      <div style={{
        background: '#2a3942', borderRadius: 10, padding: '12px 14px',
        border: '1px solid rgba(37,211,102,.2)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Check size={14} style={{ color: '#25d366', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#e9edef', margin: 0 }}>
            {[vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(' ')}
          </p>
          <p style={{ fontSize: 11, color: '#8696a0', margin: '1px 0 0' }}>
            {vehicle.year_model ? `${vehicle.year_fabrication}/${vehicle.year_model}` : vehicle.year_fabrication}
            {vehicle.color ? ` · ${vehicle.color}` : ''}
          </p>
        </div>
        {vehicle.sale_price && (
          <span style={{ fontSize: 13, fontWeight: 800, color: '#25d366', flexShrink: 0 }}>
            {formatPrice(vehicle.sale_price)}
          </span>
        )}
      </div>

      {/* Prévia da mensagem */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#8696a0', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Mensagem de texto
        </p>
        <div style={{
          background: '#025c4c', borderRadius: '12px 12px 4px 12px',
          padding: '10px 14px', fontSize: 13, color: '#e9edef',
          lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        }}>
          {message}
        </div>
      </div>

      {/* Seletor de fotos */}
      {photos.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#8696a0', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Fotos ({selectedCount}/{photos.length} selecionadas)
            </p>
            <button
              onClick={() => setSelectedPhotos(selectedCount === photos.length ? new Set() : new Set(photos.map((_, i) => i)))}
              style={{ fontSize: 10, color: '#25d366', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            >
              {selectedCount === photos.length ? 'Desmarcar todas' : 'Selecionar todas'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {photos.map((url, i) => (
              <button
                key={i}
                onClick={() => togglePhoto(i)}
                style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 8,
                  overflow: 'hidden', border: 'none', padding: 0, cursor: 'pointer',
                  outline: selectedPhotos.has(i) ? '2px solid #25d366' : '2px solid transparent',
                  transition: 'outline .1s',
                }}
              >
                <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {/* Overlay escurecido se não selecionada */}
                {!selectedPhotos.has(i) && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
                )}
                {/* Check mark */}
                {selectedPhotos.has(i) && (
                  <div style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={11} style={{ color: '#000' }} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Barra de progresso enquanto envia */}
      {sending && (
        <div style={{ background: '#2a3942', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Loader2 size={13} style={{ color: '#25d366', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, color: '#e9edef', fontWeight: 600 }}>
              {sentCount === 0 ? 'Enviando mensagem…' : `Enviando foto ${sentCount} de ${selectedCount}…`}
            </span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: '#25d366', borderRadius: 2,
              width: `${((sentCount) / (selectedCount + 1)) * 100}%`,
              transition: 'width .3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Botão enviar */}
      <button
        onClick={handleSend}
        disabled={sending}
        style={{
          width: '100%', height: 52, borderRadius: 12,
          background: sending ? '#1a2f27' : '#25d366',
          color: sending ? '#8696a0' : '#111',
          border: 'none', fontSize: 15, fontWeight: 800,
          cursor: sending ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all .2s',
        }}
      >
        {sending ? (
          <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Enviando…</>
        ) : (
          <>
            <Send size={16} />
            {selectedCount > 0
              ? `Enviar mensagem + ${selectedCount} foto${selectedCount > 1 ? 's' : ''}`
              : 'Enviar apenas texto'}
          </>
        )}
      </button>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function VehiclePickerSheet({ open, onClose, onSend }: Props) {
  const { store } = useAuthStore()
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState<Vehicle | null>(null)

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles-picker', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vehicles')
        .select('id,brand,model,version,year_fabrication,year_model,color,fuel,transmission,km,sale_price,photos,description,status')
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
      [v.brand, v.model, v.version, v.color].some(f => f?.toLowerCase().includes(q))
    )
  }, [vehicles, search])

  function handleClose() {
    setSearch('')
    setSelected(null)
    onClose()
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
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 200 }}
          />

          {/* Sheet */}
          <motion.div
            key="vp-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              maxWidth: 640, margin: '0 auto',
              background: '#111b21',
              borderRadius: '20px 20px 0 0',
              border: '1px solid rgba(255,255,255,.08)',
              borderBottom: 'none',
              zIndex: 201,
              maxHeight: '90dvh',
              display: 'flex', flexDirection: 'column',
              paddingBottom: 'calc(16px + var(--safe-bottom, 0px))',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.15)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 14px' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#e9edef', margin: 0 }}>
                  {selected ? 'Prévia e fotos' : 'Selecionar veículo'}
                </h3>
                <p style={{ fontSize: 11, color: '#8696a0', margin: '2px 0 0' }}>
                  {selected
                    ? 'Selecione as fotos e confirme o envio'
                    : `${filtered.length} disponíve${filtered.length !== 1 ? 'is' : 'l'} no estoque`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {selected && (
                  <button
                    onClick={() => setSelected(null)}
                    style={{ fontSize: 11, padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#8696a0', cursor: 'pointer', fontFamily: 'var(--fn)' }}
                  >
                    ← Voltar
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

            {/* Conteúdo animado */}
            <AnimatePresence mode="wait">
              {!selected ? (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
                >
                  <VehicleList
                    vehicles={filtered}
                    isLoading={isLoading}
                    search={search}
                    onSearch={setSearch}
                    onSelect={v => setSelected(v)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
                >
                  <VehiclePreview
                    vehicle={selected}
                    onBack={() => setSelected(null)}
                    onSend={(msg, photos) => {
                      onSend(msg, photos)
                      handleClose()
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
