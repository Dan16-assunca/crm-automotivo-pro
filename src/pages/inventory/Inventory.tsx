import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Grid, List, Car, Clock, Edit, X,
  ChevronLeft, ChevronRight, Camera, Trash2, Save,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency } from '@/utils/format'
import { toast } from '@/components/ui/Toast'
import type { Vehicle } from '@/types'

// ─── Form constants ───────────────────────────────────────────────────────────
const FUEL_OPTIONS = ['Flex', 'Gasolina', 'Álcool', 'Diesel', 'Elétrico', 'Híbrido', 'GNV']
const TRANSMISSION_OPTIONS = ['Automático', 'Manual', 'CVT', 'Automatizado']
const STATUS_FORM = [
  { v: 'available', l: 'Disponível' },
  { v: 'reserved',  l: 'Reservado'  },
  { v: 'sold',      l: 'Vendido'    },
]

const inpS: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 10px',
  background: 'var(--el)', border: '1px solid var(--b)',
  borderRadius: 8, color: 'var(--t)', fontSize: 13,
  outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
}
const lblS: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--t3)',
  textTransform: 'uppercase', letterSpacing: '.07em',
  display: 'block', marginBottom: 5,
}

// ─── Vehicle Form Modal ───────────────────────────────────────────────────────
function VehicleFormModal({ vehicle, onClose }: { vehicle?: Vehicle | null; onClose: () => void }) {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const isEdit = !!vehicle
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Photos
  const [photos, setPhotos]       = useState<string[]>(vehicle?.photos ?? [])
  const [photoIdx, setPhotoIdx]   = useState(0)
  const [uploading, setUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Form
  const [form, setForm] = useState({
    brand:             vehicle?.brand ?? '',
    model:             vehicle?.model ?? '',
    version:           vehicle?.version ?? '',
    year_fabrication:  vehicle?.year_fabrication?.toString() ?? '',
    year_model:        vehicle?.year_model?.toString() ?? '',
    color:             vehicle?.color ?? '',
    plate:             vehicle?.plate ?? '',
    km:                vehicle?.km?.toString() ?? '',
    fuel:              vehicle?.fuel ?? 'Flex',
    transmission:      vehicle?.transmission ?? 'Automático',
    status:            vehicle?.status ?? 'available',
    purchase_price:    vehicle?.purchase_price?.toString() ?? '',
    sale_price:        vehicle?.sale_price?.toString() ?? '',
    fipe_price:        vehicle?.fipe_price?.toString() ?? '',
    purchase_date:     vehicle?.purchase_date?.slice(0, 10) ?? '',
    description:       vehicle?.description ?? '',
  })
  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Lucro calculado
  const lucro = form.sale_price && form.purchase_price
    ? parseFloat(form.sale_price) - parseFloat(form.purchase_price)
    : null
  const lucroPct = lucro !== null && form.sale_price
    ? ((lucro / parseFloat(form.sale_price)) * 100).toFixed(1)
    : null

  // Photo helpers
  const clampIdx = (arr: string[], i: number) => Math.min(Math.max(i, 0), arr.length - 1)

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 10 - photos.length)
    if (!arr.length) return
    setUploading(true)
    const newUrls: string[] = []
    for (const file of arr) {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${store!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('vehicle-photos').upload(path, file, { upsert: false })
      if (error) { toast.error('Erro ao enviar foto', error.message); continue }
      const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path)
      newUrls.push(data.publicUrl)
    }
    setPhotos(p => {
      const updated = [...p, ...newUrls]
      setPhotoIdx(clampIdx(updated, updated.length - 1))
      return updated
    })
    setUploading(false)
  }

  const removePhoto = (idx: number) => {
    setPhotos(p => {
      const updated = p.filter((_, i) => i !== idx)
      setPhotoIdx(clampIdx(updated, idx > 0 ? idx - 1 : 0))
      return updated
    })
  }

  // Keyboard for lightbox
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     setLightboxOpen(false)
      if (e.key === 'ArrowRight') setPhotoIdx(i => (i + 1) % photos.length)
      if (e.key === 'ArrowLeft')  setPhotoIdx(i => (i - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, photos.length])

  // Save mutation
  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        store_id:        store!.id,
        brand:           form.brand,
        model:           form.model,
        version:         form.version || null,
        year_fabrication: form.year_fabrication ? parseInt(form.year_fabrication) : null,
        year_model:      form.year_model ? parseInt(form.year_model) : null,
        color:           form.color || null,
        plate:           form.plate || null,
        km:              form.km ? parseInt(form.km) : null,
        fuel:            form.fuel,
        transmission:    form.transmission,
        condition:       'used' as Vehicle['condition'],
        status:          form.status as Vehicle['status'],
        purchase_price:  form.purchase_price ? parseFloat(form.purchase_price) : null,
        sale_price:      form.sale_price ? parseFloat(form.sale_price) : null,
        promotional_price: null,
        fipe_price:      form.fipe_price ? parseFloat(form.fipe_price) : null,
        purchase_date:   form.purchase_date || null,
        description:     form.description || null,
        photos,
        optionals:       vehicle?.optionals ?? [],
        updated_at:      new Date().toISOString(),
      }
      if (isEdit) {
        const { error } = await supabase.from('vehicles').update(payload).eq('id', vehicle!.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vehicles').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      toast.success(isEdit ? 'Veículo atualizado!' : 'Veículo cadastrado!')
      onClose()
    },
    onError: (e) => toast.error('Erro ao salvar', (e as Error).message),
  })

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={onClose}
      >
        {/* Lightbox */}
        {lightboxOpen && photos.length > 0 && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.97)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setLightboxOpen(false)}
          >
            <button onClick={() => setLightboxOpen(false)} style={{ position: 'absolute', top: 18, right: 20, background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '6px 8px', display: 'flex' }}><X size={18} /></button>
            <p style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: 'rgba(255,255,255,.45)' }}>{photoIdx + 1} / {photos.length}</p>
            {photos.length > 1 && <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i - 1 + photos.length) % photos.length) }} style={{ position: 'absolute', left: 16, background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', padding: '14px 10px', display: 'flex', backdropFilter: 'blur(4px)' }}><ChevronLeft size={24} /></button>}
            <img src={photos[photoIdx]} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: '88vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 10 }} />
            {photos.length > 1 && <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i + 1) % photos.length) }} style={{ position: 'absolute', right: 16, background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', padding: '14px 10px', display: 'flex', backdropFilter: 'blur(4px)' }}><ChevronRight size={24} /></button>}
            {photos.length > 1 && (
              <div style={{ position: 'absolute', bottom: 18, display: 'flex', gap: 6 }}>
                {photos.map((url, i) => (
                  <img key={i} src={url} alt="" onClick={e => { e.stopPropagation(); setPhotoIdx(i) }}
                    style={{ width: 52, height: 40, objectFit: 'cover', borderRadius: 5, cursor: 'pointer', flexShrink: 0, border: `2px solid ${i === photoIdx ? 'var(--neon)' : 'rgba(255,255,255,.2)'}`, opacity: i === photoIdx ? 1 : 0.5, transition: 'all .15s' }} />
                ))}
              </div>
            )}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          style={{ width: '100%', maxWidth: 660, background: 'var(--surf)', border: '1px solid var(--b)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.7)', display: 'flex', flexDirection: 'column', maxHeight: '94vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--t)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{isEdit ? 'Editar Veículo' : 'Cadastrar Veículo'}</p>
              <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>{isEdit ? `${vehicle.brand} ${vehicle.model}` : 'Preencha os dados do veículo'}</p>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
          </div>

          {/* ── Photo Carousel (top, outside scroll) ────────────────────── */}
          <div style={{ position: 'relative', height: 220, background: 'var(--el)', flexShrink: 0, overflow: 'hidden' }}>
            {photos.length > 0 ? (
              <>
                <img
                  src={photos[photoIdx]}
                  alt=""
                  onClick={() => setLightboxOpen(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }}
                />
                {/* Hint */}
                <div style={{ position: 'absolute', bottom: 10, left: 12, background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: 'rgba(255,255,255,.8)', backdropFilter: 'blur(4px)', pointerEvents: 'none' }}>
                  🔍 Clique para ampliar
                </div>
                {/* Photo count */}
                <div style={{ position: 'absolute', top: 10, right: 12, background: 'rgba(0,0,0,.55)', borderRadius: 6, padding: '3px 8px', fontSize: 10, color: '#fff', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Camera size={10} /> {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
                </div>
                {/* Arrows */}
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)}
                      style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.55)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '10px 8px', display: 'flex', backdropFilter: 'blur(4px)' }}
                    ><ChevronLeft size={18} /></button>
                    <button
                      onClick={() => setPhotoIdx(i => (i + 1) % photos.length)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.55)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '10px 8px', display: 'flex', backdropFilter: 'blur(4px)' }}
                    ><ChevronRight size={18} /></button>
                    {/* Dots */}
                    <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
                      {photos.map((_, i) => (
                        <div key={i} onClick={() => setPhotoIdx(i)}
                          style={{ width: i === photoIdx ? 18 : 6, height: 6, borderRadius: 3, background: i === photoIdx ? 'var(--neon)' : 'rgba(255,255,255,.5)', cursor: 'pointer', transition: 'all .2s' }} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--t3)' }}>
                <Car size={44} style={{ opacity: .2 }} />
                <p style={{ fontSize: 12 }}>Nenhuma foto adicionada</p>
              </div>
            )}
          </div>

          {/* Adicionar fotos bar */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || photos.length >= 10}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, border: '1px solid var(--b)', background: 'var(--el)', color: 'var(--t2)', fontSize: 12, cursor: 'pointer', opacity: (uploading || photos.length >= 10) ? 0.5 : 1, fontWeight: 600 }}
            >
              <Camera size={12} />
              {uploading ? 'Enviando...' : 'Adicionar fotos'}
            </button>
            {photos.length >= 10 && <span style={{ fontSize: 10, color: 'var(--t3)' }}>Limite de 10 fotos atingido</span>}
            <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }} />
          </div>

          {/* ── Scrollable form body ─────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Row: Marca | Modelo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Marca</label>
                <input style={inpS} value={form.brand} onChange={e => f('brand', e.target.value)} placeholder="BMW, Jeep..." />
              </div>
              <div>
                <label style={lblS}>Modelo</label>
                <input style={inpS} value={form.model} onChange={e => f('model', e.target.value)} placeholder="Civic, Compass..." />
              </div>
            </div>

            {/* Row: Versão | Cor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Versão</label>
                <input style={inpS} value={form.version} onChange={e => f('version', e.target.value)} placeholder="M Sport, EXL..." />
              </div>
              <div>
                <label style={lblS}>Cor</label>
                <input style={inpS} value={form.color} onChange={e => f('color', e.target.value)} placeholder="Preto Safira" />
              </div>
            </div>

            {/* Row: Ano Fab. | Ano Modelo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Ano Fab.</label>
                <input style={inpS} type="number" value={form.year_fabrication} onChange={e => f('year_fabrication', e.target.value)} placeholder="2022" />
              </div>
              <div>
                <label style={lblS}>Ano Modelo</label>
                <input style={inpS} type="number" value={form.year_model} onChange={e => f('year_model', e.target.value)} placeholder="2023" />
              </div>
            </div>

            {/* Row: Quilometragem | Combustível */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Quilometragem</label>
                <input style={inpS} type="number" value={form.km} onChange={e => f('km', e.target.value)} placeholder="45.000" />
              </div>
              <div>
                <label style={lblS}>Combustível</label>
                <select style={{ ...inpS, appearance: 'none' as const }} value={form.fuel} onChange={e => f('fuel', e.target.value)}>
                  {FUEL_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Row: Placa | Câmbio */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Placa</label>
                <input style={inpS} value={form.plate} onChange={e => f('plate', e.target.value)} placeholder="ABC-1234" />
              </div>
              <div>
                <label style={lblS}>Câmbio</label>
                <select style={{ ...inpS, appearance: 'none' as const }} value={form.transmission} onChange={e => f('transmission', e.target.value)}>
                  {TRANSMISSION_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Row: Preço Compra | Preço Venda */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Preço de Compra (R$)</label>
                <input style={inpS} type="number" value={form.purchase_price} onChange={e => f('purchase_price', e.target.value)} placeholder="368000" />
              </div>
              <div>
                <label style={lblS}>Preço de Venda (R$)</label>
                <input style={inpS} type="number" value={form.sale_price} onChange={e => f('sale_price', e.target.value)} placeholder="420000" />
              </div>
            </div>

            {/* Row: FIPE | Lucro Estimado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Tabela FIPE (R$)</label>
                <input style={inpS} type="number" value={form.fipe_price} onChange={e => f('fipe_price', e.target.value)} placeholder="398000" />
              </div>
              <div>
                <label style={lblS}>Lucro Estimado</label>
                <div style={{
                  ...inpS, display: 'flex', alignItems: 'center',
                  background: lucro !== null && lucro > 0 ? 'rgba(61,247,16,.08)' : lucro !== null && lucro < 0 ? 'rgba(244,63,94,.08)' : 'var(--el)',
                  border: `1px solid ${lucro !== null && lucro > 0 ? 'rgba(61,247,16,.3)' : lucro !== null && lucro < 0 ? 'rgba(244,63,94,.3)' : 'var(--b)'}`,
                  color: lucro !== null && lucro > 0 ? 'var(--neon)' : lucro !== null && lucro < 0 ? 'var(--red)' : 'var(--t3)',
                  fontWeight: 700, fontSize: 14, fontFamily: 'var(--fm)',
                }}>
                  {lucro !== null ? `${formatCurrency(lucro)} (${lucroPct}%)` : '—'}
                </div>
              </div>
            </div>

            {/* Row: Data Entrada | Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Data de Entrada</label>
                <input style={{ ...inpS, colorScheme: 'dark' }} type="date" value={form.purchase_date} onChange={e => f('purchase_date', e.target.value)} />
              </div>
              <div>
                <label style={lblS}>Status</label>
                <select style={{ ...inpS, appearance: 'none' as const }} value={form.status} onChange={e => f('status', e.target.value)}>
                  {STATUS_FORM.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            </div>

            {/* Opcionais / Observações */}
            <div>
              <label style={lblS}>Opcionais / Observações</label>
              <textarea
                value={form.description}
                onChange={e => f('description', e.target.value)}
                placeholder="Teto solar, bancos em couro, IPVA 2025 pago..."
                rows={3}
                style={{ ...inpS, height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.55, fontFamily: 'var(--fn)' }}
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => { e.preventDefault(); setIsDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragOver ? 'var(--neon)' : 'var(--b)'}`,
                borderRadius: 10, padding: '22px 16px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                background: isDragOver ? 'rgba(61,247,16,.04)' : 'transparent',
                transition: 'all .15s',
              }}
            >
              <Camera size={22} style={{ color: isDragOver ? 'var(--neon)' : 'var(--t3)' }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', margin: 0 }}>Clique ou arraste fotos aqui</p>
              <p style={{ fontSize: 10, color: 'var(--t3)', margin: 0 }}>JPG, PNG, WEBP · até 10 fotos · do computador ou celular</p>
            </div>

            {/* Thumbnail strip */}
            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {photos.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: 90, height: 68, borderRadius: 8, overflow: 'hidden', border: `2px solid ${i === photoIdx ? 'var(--neon)' : 'var(--b)'}`, cursor: 'pointer', flexShrink: 0, transition: 'border-color .15s' }}
                    onClick={() => setPhotoIdx(i)}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button type="button"
                      onClick={e => { e.stopPropagation(); removePhoto(i) }}
                      style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,.7)', border: 'none', borderRadius: 5, color: '#fff', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                      <X size={10} />
                    </button>
                    {i === 0 && <span style={{ position: 'absolute', bottom: 3, left: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--neon)', color: '#000' }}>CAPA</span>}
                  </div>
                ))}
                {/* Add slot */}
                {photos.length < 10 && (
                  <div onClick={() => fileInputRef.current?.click()}
                    style={{ width: 90, height: 68, borderRadius: 8, border: '2px dashed var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--t3)', background: 'var(--el)', flexShrink: 0 }}>
                    <Plus size={20} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--b)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--b)', background: 'transparent', color: 'var(--t2)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              Cancelar
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={!form.brand || !form.model || mut.isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: (!form.brand || !form.model || mut.isPending) ? 0.5 : 1 }}
            >
              <Save size={13} />
              {mut.isPending ? 'Salvando...' : isEdit ? 'Salvar veículo' : 'Cadastrar veículo'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Vehicle Card ─────────────────────────────────────────────────────────────
function VehicleCard({ vehicle, onEdit }: { vehicle: Vehicle; onEdit: () => void }) {
  const [photoIdx, setPhotoIdx]   = useState(0)
  const [showArrows, setShowArrows] = useState(false)
  const photos = vehicle.photos ?? []
  const days   = vehicle.days_in_stock ?? 0
  const daysColor = days > 60 ? 'var(--red)' : days > 30 ? 'var(--yel)' : 'var(--neon)'

  const statusLabel = vehicle.status === 'available' ? 'Disponível'
    : vehicle.status === 'reserved' ? 'Reservado'
    : vehicle.status === 'sold'     ? 'Vendido'
    : 'Manutenção'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, overflow: 'hidden', transition: 'border-color .15s, box-shadow .15s', cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.25)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {/* Photo carousel */}
      <div
        style={{ position: 'relative', height: 170, background: 'var(--el)', overflow: 'hidden' }}
        onMouseEnter={() => setShowArrows(true)}
        onMouseLeave={() => setShowArrows(false)}
      >
        {photos.length > 0 ? (
          <>
            <img src={photos[photoIdx]} alt={`${vehicle.brand} ${vehicle.model}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .3s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            />
            {photos.length > 1 && showArrows && (
              <>
                <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i - 1 + photos.length) % photos.length) }}
                  style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '6px 5px', display: 'flex', backdropFilter: 'blur(4px)' }}>
                  <ChevronLeft size={14} />
                </button>
                <button onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i + 1) % photos.length) }}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '6px 5px', display: 'flex', backdropFilter: 'blur(4px)' }}>
                  <ChevronRight size={14} />
                </button>
              </>
            )}
            {photos.length > 1 && (
              <div style={{ position: 'absolute', bottom: 7, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
                {photos.map((_, i) => (
                  <div key={i} style={{ width: i === photoIdx ? 14 : 5, height: 5, borderRadius: 3, background: i === photoIdx ? '#fff' : 'rgba(255,255,255,.45)', transition: 'all .2s' }} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Car size={44} style={{ color: 'var(--b)', opacity: .4 }} />
          </div>
        )}

        {/* Status badge */}
        <div style={{ position: 'absolute', top: 8, left: 8 }}>
          <Badge variant={vehicle.status === 'available' ? 'neon' : vehicle.status === 'reserved' ? 'warning' : 'default'}>
            {statusLabel}
          </Badge>
        </div>

        {/* Edit overlay */}
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', opacity: 0, transition: 'opacity .15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
        >
          <Button size="sm" variant="secondary" onClick={e => { e.stopPropagation(); onEdit() }}>
            <Edit size={12} /> Editar
          </Button>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 1 }}>{vehicle.brand}</p>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', lineHeight: 1.25, marginBottom: 1 }}>{vehicle.model}</h3>
        {vehicle.version && <p style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 7 }}>{vehicle.version}</p>}
        <p style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--t2)', marginBottom: 10 }}>
          {vehicle.year_model} · {vehicle.km?.toLocaleString('pt-BR')} km · {vehicle.fuel}
        </p>
        {vehicle.promotional_price ? (
          <>
            <p style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--t3)', textDecoration: 'line-through' }}>{formatCurrency(vehicle.sale_price ?? 0)}</p>
            <p style={{ fontFamily: 'var(--fm)', fontSize: 22, fontWeight: 800, color: 'var(--neon)', lineHeight: 1 }}>{formatCurrency(vehicle.promotional_price)}</p>
          </>
        ) : (
          <p style={{ fontFamily: 'var(--fm)', fontSize: 22, fontWeight: 800, color: 'var(--neon)', lineHeight: 1 }}>{formatCurrency(vehicle.sale_price ?? 0)}</p>
        )}
        {vehicle.fipe_price && (
          <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2, marginBottom: 10 }}>FIPE {formatCurrency(vehicle.fipe_price)}</p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: vehicle.fipe_price ? 0 : 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: days > 60 ? 'rgba(244,63,94,.12)' : days > 30 ? 'rgba(234,179,8,.12)' : 'rgba(61,247,16,.1)', color: daysColor, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} /> {days}d no estoque
          </span>
          {vehicle.purchase_date && (
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>
              Entrada: {new Date(vehicle.purchase_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Status filter buttons ────────────────────────────────────────────────────
const FILTER_TABS = [
  { v: '',           l: 'Todos'       },
  { v: 'available',  l: 'Disponíveis' },
  { v: 'reserved',   l: 'Reservados'  },
  { v: 'sold',       l: 'Vendidos'    },
]

const BRANDS_LIST = [
  'BMW', 'Mercedes-Benz', 'Audi', 'Porsche', 'Land Rover',
  'Volvo', 'Toyota', 'Honda', 'Jeep', 'Hyundai', 'Chevrolet', 'Outros',
]

const selStyle: React.CSSProperties = {
  height: 34, padding: '0 28px 0 9px',
  background: 'var(--el)', border: '1px solid var(--b)',
  borderRadius: 7, color: 'var(--t)', fontSize: 12,
  outline: 'none', fontFamily: 'var(--fn)', cursor: 'pointer',
  appearance: 'none',
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Inventory() {
  const { store } = useAuthStore()
  const [view, setView]           = useState<'grid' | 'list'>('grid')
  const [search, setSearch]       = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterStatus, setFilterStatus]       = useState('')
  const [filterBrand,  setFilterBrand]        = useState('')
  const [showAddModal, setShowAddModal]       = useState(false)
  const [editingVehicle, setEditingVehicle]   = useState<Vehicle | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles', store?.id, debouncedSearch, filterBrand, filterStatus],
    queryFn: async () => {
      let query = supabase
        .from('vehicles')
        .select('*')
        .eq('store_id', store!.id)
        .order('created_at', { ascending: false })
      if (debouncedSearch) query = query.or(`brand.ilike.%${debouncedSearch}%,model.ilike.%${debouncedSearch}%,plate.ilike.%${debouncedSearch}%`)
      if (filterBrand)  query = query.eq('brand', filterBrand)
      if (filterStatus) query = query.eq('status', filterStatus)
      const { data } = await query
      return (data ?? []) as Vehicle[]
    },
    enabled: !!store?.id,
  })

  const total     = vehicles?.length ?? 0
  const available = vehicles?.filter(v => v.status === 'available').length ?? 0
  const reserved  = vehicles?.filter(v => v.status === 'reserved').length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Estoque</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>({total} veículo{total !== 1 ? 's' : ''})</p>
        </div>
        <Button size="sm" onClick={() => setShowAddModal(true)}><Plus size={13} /> Cadastrar</Button>
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Buscar por marca, modelo, placa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: 34, paddingLeft: 28, paddingRight: 10, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 7, color: 'var(--t)', fontSize: 12, outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
          />
        </div>

        {/* Status pill tabs */}
        <div style={{ display: 'flex', background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 8, padding: 3, gap: 2 }}>
          {FILTER_TABS.map(tab => (
            <button
              key={tab.v}
              onClick={() => setFilterStatus(tab.v)}
              style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .12s',
                background: filterStatus === tab.v ? 'var(--neon)' : 'transparent',
                color:      filterStatus === tab.v ? '#000' : 'var(--t3)',
              }}
            >{tab.l}</button>
          ))}
        </div>

        {/* Brand filter */}
        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={selStyle}>
          <option value="">Todas as marcas</option>
          {BRANDS_LIST.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 7, padding: 3 }}>
          {(['grid', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 5, border: 'none', background: view === v ? 'var(--ng)' : 'transparent', color: view === v ? 'var(--neon)' : 'var(--t3)', cursor: 'pointer', transition: 'all .12s' }}>
              {v === 'grid' ? <Grid size={13} /> : <List size={13} />}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { l: 'Total',       v: total,     c: 'var(--t)'   },
          { l: 'Disponíveis', v: available, c: 'var(--neon)' },
          { l: 'Reservados',  v: reserved,  c: 'var(--yel)' },
        ].map(s => (
          <div key={s.l} style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: s.c, fontFamily: 'var(--fm)' }}>{s.v}</span>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{s.l}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(230px, 1fr))' : '1fr', gap: 12 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ borderRadius: 10, overflow: 'hidden', background: 'var(--card)', border: '1px solid var(--bs)' }}>
              <Skeleton style={{ height: 170, borderRadius: 0 }} />
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton style={{ height: 10, width: '60%' }} />
                <Skeleton style={{ height: 14, width: '80%' }} />
                <Skeleton style={{ height: 9, width: '45%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (vehicles?.length ?? 0) === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--t3)' }}>
          <Car size={48} style={{ margin: '0 auto 14px', opacity: .15 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)' }}>Nenhum veículo encontrado</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Cadastre seu primeiro veículo no estoque</p>
          <Button style={{ marginTop: 16 }} size="sm" onClick={() => setShowAddModal(true)}><Plus size={13} /> Cadastrar agora</Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(230px, 1fr))' : '1fr', gap: 12 }}>
          {vehicles?.map(v => (
            <VehicleCard key={v.id} vehicle={v} onEdit={() => setEditingVehicle(v)} />
          ))}
        </div>
      )}

      {showAddModal   && <VehicleFormModal onClose={() => setShowAddModal(false)} />}
      {editingVehicle && <VehicleFormModal vehicle={editingVehicle} onClose={() => setEditingVehicle(null)} />}
    </div>
  )
}
