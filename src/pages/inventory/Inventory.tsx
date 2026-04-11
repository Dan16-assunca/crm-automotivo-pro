import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Grid, List, Car, Clock, Edit, X, AlertTriangle, ImagePlus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency } from '@/utils/format'
import { toast } from '@/components/ui/Toast'
import type { Vehicle } from '@/types'

// ─── Vehicle Form Modal ────────────────────────────────────────────────────────
const FUEL_OPTIONS = ['Flex', 'Gasolina', 'Álcool', 'Diesel', 'Elétrico', 'Híbrido', 'GNV']
const TRANSMISSION_OPTIONS = ['Automático', 'Manual', 'CVT', 'Automatizado']
const CONDITION_OPTIONS = [{ v: 'used', l: 'Usado' }, { v: 'new', l: 'Novo' }, { v: 'demo', l: 'Demonstração' }]

const inpS: React.CSSProperties = {
  width: '100%', height: 34, padding: '0 10px',
  background: 'var(--el)', border: '1px solid var(--b)',
  borderRadius: 7, color: 'var(--t)', fontSize: 12,
  outline: 'none', fontFamily: 'var(--fn)',
}
const lblS: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--t3)',
  textTransform: 'uppercase', letterSpacing: '.06em',
  display: 'block', marginBottom: 4,
}

function VehicleFormModal({ vehicle, onClose }: { vehicle?: Vehicle | null; onClose: () => void }) {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const isEdit = !!vehicle
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Photos state ──────────────────────────────────────────────────────────
  const [photos, setPhotos]     = useState<string[]>(vehicle?.photos ?? [])
  const [uploading, setUploading] = useState(false)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const handlePhotoUpload = async (files: FileList) => {
    setUploading(true)
    const newUrls: string[] = []
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${store!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('vehicle-photos').upload(path, file, { upsert: false })
      if (!error) {
        const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path)
        newUrls.push(data.publicUrl)
      }
    }
    setPhotos(p => [...p, ...newUrls])
    setUploading(false)
  }

  const removePhoto = (idx: number) => setPhotos(p => p.filter((_, i) => i !== idx))

  const moveLightbox = (dir: 1 | -1) =>
    setLightboxIdx(i => i === null ? null : (i + dir + photos.length) % photos.length)

  const [form, setForm] = useState({
    brand: vehicle?.brand ?? '',
    model: vehicle?.model ?? '',
    version: vehicle?.version ?? '',
    year_fabrication: vehicle?.year_fabrication?.toString() ?? '',
    year_model: vehicle?.year_model?.toString() ?? '',
    color: vehicle?.color ?? '',
    plate: vehicle?.plate ?? '',
    km: vehicle?.km?.toString() ?? '',
    fuel: vehicle?.fuel ?? 'Flex',
    transmission: vehicle?.transmission ?? 'Automático',
    condition: vehicle?.condition ?? 'used',
    purchase_price: vehicle?.purchase_price?.toString() ?? '',
    sale_price: vehicle?.sale_price?.toString() ?? '',
    promotional_price: vehicle?.promotional_price?.toString() ?? '',
    fipe_price: vehicle?.fipe_price?.toString() ?? '',
    purchase_date: vehicle?.purchase_date?.slice(0, 10) ?? '',
    description: vehicle?.description ?? '',
  })

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        store_id: store!.id,
        brand: form.brand,
        model: form.model,
        version: form.version || null,
        year_fabrication: form.year_fabrication ? parseInt(form.year_fabrication) : null,
        year_model: form.year_model ? parseInt(form.year_model) : null,
        color: form.color || null,
        plate: form.plate || null,
        km: form.km ? parseInt(form.km) : null,
        fuel: form.fuel,
        transmission: form.transmission,
        condition: form.condition as Vehicle['condition'],
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        sale_price: form.sale_price ? parseFloat(form.sale_price) : null,
        promotional_price: form.promotional_price ? parseFloat(form.promotional_price) : null,
        fipe_price: form.fipe_price ? parseFloat(form.fipe_price) : null,
        purchase_date: form.purchase_date || null,
        description: form.description || null,
        status: vehicle?.status ?? 'available',
        photos,
        optionals: vehicle?.optionals ?? [],
        updated_at: new Date().toISOString(),
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

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (lightboxIdx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null)
      if (e.key === 'ArrowRight') moveLightbox(1)
      if (e.key === 'ArrowLeft')  moveLightbox(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIdx, photos.length])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={onClose}
      >
        {/* ── Lightbox ─────────────────────────────────────────────────── */}
        {lightboxIdx !== null && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.96)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setLightboxIdx(null)}
          >
            {/* Close */}
            <button
              onClick={() => setLightboxIdx(null)}
              style={{ position: 'absolute', top: 18, right: 20, background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '6px 8px', display: 'flex' }}
            ><X size={18} /></button>

            {/* Counter */}
            <p style={{ position: 'absolute', top: 22, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: 'rgba(255,255,255,.5)', userSelect: 'none' }}>
              {lightboxIdx + 1} / {photos.length}
            </p>

            {/* Prev */}
            {photos.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); moveLightbox(-1) }}
                style={{ position: 'absolute', left: 16, background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', padding: '12px 10px', display: 'flex', backdropFilter: 'blur(6px)' }}
              ><ChevronLeft size={22} /></button>
            )}

            {/* Image */}
            <img
              src={photos[lightboxIdx]}
              alt=""
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '88vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 0 60px rgba(0,0,0,.8)', userSelect: 'none' }}
            />

            {/* Next */}
            {photos.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); moveLightbox(1) }}
                style={{ position: 'absolute', right: 16, background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', padding: '12px 10px', display: 'flex', backdropFilter: 'blur(6px)' }}
              ><ChevronRight size={22} /></button>
            )}

            {/* Thumbnails strip */}
            {photos.length > 1 && (
              <div style={{ position: 'absolute', bottom: 18, display: 'flex', gap: 6, maxWidth: '80vw', overflowX: 'auto', padding: '0 4px' }}>
                {photos.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    onClick={e => { e.stopPropagation(); setLightboxIdx(i) }}
                    style={{
                      width: 52, height: 40, objectFit: 'cover', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                      border: `2px solid ${i === lightboxIdx ? 'var(--neon)' : 'rgba(255,255,255,.2)'}`,
                      opacity: i === lightboxIdx ? 1 : 0.55,
                      transition: 'all .15s',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          style={{ width: '100%', maxWidth: 700, background: 'var(--surf)', border: '1px solid var(--b)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.7)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>{isEdit ? 'Editar Veículo' : 'Cadastrar Veículo'}</p>
              <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{isEdit ? `${vehicle.brand} ${vehicle.model}` : 'Preencha os dados do veículo'}</p>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
          </div>

          {/* Form */}
          <div style={{ padding: '16px 20px', maxHeight: '65vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Row 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Marca *</label>
                <input style={inpS} value={form.brand} onChange={e => f('brand', e.target.value)} placeholder="Honda" />
              </div>
              <div>
                <label style={lblS}>Modelo *</label>
                <input style={inpS} value={form.model} onChange={e => f('model', e.target.value)} placeholder="Civic" />
              </div>
              <div>
                <label style={lblS}>Versão</label>
                <input style={inpS} value={form.version} onChange={e => f('version', e.target.value)} placeholder="EXL" />
              </div>
            </div>

            {/* Row 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Ano Fab.</label>
                <input style={inpS} type="number" value={form.year_fabrication} onChange={e => f('year_fabrication', e.target.value)} placeholder="2022" />
              </div>
              <div>
                <label style={lblS}>Ano Mod.</label>
                <input style={inpS} type="number" value={form.year_model} onChange={e => f('year_model', e.target.value)} placeholder="2023" />
              </div>
              <div>
                <label style={lblS}>KM</label>
                <input style={inpS} type="number" value={form.km} onChange={e => f('km', e.target.value)} placeholder="45000" />
              </div>
              <div>
                <label style={lblS}>Cor</label>
                <input style={inpS} value={form.color} onChange={e => f('color', e.target.value)} placeholder="Prata" />
              </div>
            </div>

            {/* Row 3 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Combustível</label>
                <select style={{ ...inpS, appearance: 'none' as const }} value={form.fuel} onChange={e => f('fuel', e.target.value)}>
                  {FUEL_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lblS}>Câmbio</label>
                <select style={{ ...inpS, appearance: 'none' as const }} value={form.transmission} onChange={e => f('transmission', e.target.value)}>
                  {TRANSMISSION_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lblS}>Condição</label>
                <select style={{ ...inpS, appearance: 'none' as const }} value={form.condition} onChange={e => f('condition', e.target.value)}>
                  {CONDITION_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            </div>

            {/* Row 4 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Placa</label>
                <input style={inpS} value={form.plate} onChange={e => f('plate', e.target.value)} placeholder="ABC-1234" />
              </div>
              <div>
                <label style={lblS}>Data de entrada</label>
                <input style={{ ...inpS, colorScheme: 'dark' }} type="date" value={form.purchase_date} onChange={e => f('purchase_date', e.target.value)} />
              </div>
            </div>

            {/* Prices */}
            <div style={{ padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 9 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--neon)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Preços</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lblS}>Compra (R$)</label>
                  <input style={inpS} type="number" value={form.purchase_price} onChange={e => f('purchase_price', e.target.value)} placeholder="80000" />
                </div>
                <div>
                  <label style={lblS}>Venda (R$)</label>
                  <input style={inpS} type="number" value={form.sale_price} onChange={e => f('sale_price', e.target.value)} placeholder="95000" />
                </div>
                <div>
                  <label style={lblS}>Promoção (R$)</label>
                  <input style={inpS} type="number" value={form.promotional_price} onChange={e => f('promotional_price', e.target.value)} placeholder="92000" />
                </div>
                <div>
                  <label style={lblS}>FIPE (R$)</label>
                  <input style={inpS} type="number" value={form.fipe_price} onChange={e => f('fipe_price', e.target.value)} placeholder="90000" />
                </div>
              </div>
            </div>

            {/* Photos */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={lblS}>Fotos do veículo{photos.length > 0 ? ` (${photos.length})` : ''}</label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--b)', background: 'var(--el)', color: 'var(--t2)', fontSize: 11, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}
                >
                  <ImagePlus size={12} />
                  {uploading ? 'Enviando...' : 'Adicionar fotos'}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.length) handlePhotoUpload(e.target.files); e.target.value = '' }}
              />

              {photos.length > 0 ? (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                  {photos.map((url, i) => (
                    <div
                      key={i}
                      style={{ position: 'relative', flexShrink: 0, width: 100, height: 75, borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--b)', cursor: 'zoom-in' }}
                      onClick={() => setLightboxIdx(i)}
                    >
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .2s' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.06)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                      />
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); removePhoto(i) }}
                        style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,.65)', border: 'none', borderRadius: 5, color: '#fff', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center' }}
                      ><Trash2 size={10} /></button>
                      {i === 0 && (
                        <span style={{ position: 'absolute', bottom: 3, left: 3, fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'var(--neon)', color: '#000' }}>CAPA</span>
                      )}
                    </div>
                  ))}
                  {/* Add more slot */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{ flexShrink: 0, width: 100, height: 75, borderRadius: 8, border: '1.5px dashed var(--b)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', color: 'var(--t3)' }}
                  >
                    <ImagePlus size={16} />
                    <span style={{ fontSize: 9 }}>Adicionar</span>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{ border: '1.5px dashed var(--b)', borderRadius: 8, height: 75, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: 'var(--t3)', fontSize: 12, transition: 'border-color .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--neon)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--b)')}
                >
                  <ImagePlus size={16} />
                  Clique para adicionar fotos
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label style={lblS}>Descrição / Observações</label>
              <textarea
                value={form.description}
                onChange={e => f('description', e.target.value)}
                placeholder="Detalhes do veículo, opcionais, histórico..."
                rows={3}
                style={{ ...inpS, height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.5, fontFamily: 'var(--fn)' }}
              />
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--b)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--b)', background: 'transparent', color: 'var(--t2)', fontSize: 12, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={!form.brand || !form.model || mut.isPending}
              style={{
                padding: '8px 22px', borderRadius: 7, border: 'none',
                background: 'var(--neon)', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                opacity: (!form.brand || !form.model || mut.isPending) ? 0.6 : 1,
              }}
            >
              {mut.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Cadastrar veículo'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function VehicleCard({ vehicle, onEdit }: { vehicle: Vehicle; onEdit: () => void }) {
  const days = vehicle.days_in_stock ?? 0
  const daysColor = days > 60 ? 'var(--red)' : days > 30 ? 'var(--yel)' : 'var(--neon)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--card)', border: '1px solid var(--bs)',
        borderRadius: 9, overflow: 'hidden',
        transition: 'border-color .15s',
        cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bs)')}
    >
      {/* Photo */}
      <div style={{ position: 'relative', height: 160, background: 'var(--el)', overflow: 'hidden' }}>
        {vehicle.photos?.[0] ? (
          <img
            src={vehicle.photos[0]}
            alt={`${vehicle.brand} ${vehicle.model}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Car size={44} style={{ color: 'var(--b)', opacity: .5 }} />
          </div>
        )}
        {/* Status badge */}
        <div style={{ position: 'absolute', top: 8, left: 8 }}>
          <Badge
            variant={vehicle.status === 'available' ? 'neon' : vehicle.status === 'reserved' ? 'warning' : 'default'}
          >
            {vehicle.status === 'available' ? 'Disponível' :
             vehicle.status === 'reserved' ? 'Reservado' :
             vehicle.status === 'sold' ? 'Vendido' : 'Manutenção'}
          </Badge>
        </div>
        {days > 30 && (
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <Badge variant={days > 60 ? 'danger' : 'warning'}>
              <AlertTriangle size={9} /> {days}d
            </Badge>
          </div>
        )}
        {/* Hover overlay */}
        <div
          className="hover-overlay"
          style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)',
            opacity: 0, transition: 'opacity .15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
        >
          <Button size="sm" variant="secondary" onClick={onEdit}><Edit size={13} /> Editar</Button>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        {/* Brand */}
        <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>
          {vehicle.brand}
        </p>
        {/* Model + version */}
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', lineHeight: 1.25, marginBottom: 1 }}>{vehicle.model}</h3>
        {vehicle.version && (
          <p style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>{vehicle.version}</p>
        )}

        {/* Specs in mono */}
        <p style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--t2)', letterSpacing: '.02em', marginBottom: 10 }}>
          {vehicle.year_model} · {vehicle.km?.toLocaleString('pt-BR')} km · {vehicle.fuel}
          {vehicle.color ? ` · ${vehicle.color}` : ''}
        </p>

        {/* Price */}
        <div style={{ marginBottom: 8 }}>
          {vehicle.promotional_price ? (
            <>
              <p style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--t3)', textDecoration: 'line-through' }}>{formatCurrency(vehicle.sale_price ?? 0)}</p>
              <p style={{ fontFamily: 'var(--fm)', fontSize: 22, fontWeight: 800, color: 'var(--neon)', lineHeight: 1 }}>{formatCurrency(vehicle.promotional_price)}</p>
            </>
          ) : (
            <p style={{ fontFamily: 'var(--fm)', fontSize: 22, fontWeight: 800, color: 'var(--neon)', lineHeight: 1 }}>{formatCurrency(vehicle.sale_price ?? 0)}</p>
          )}
          {vehicle.fipe_price && (
            <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>FIPE {formatCurrency(vehicle.fipe_price)}</p>
          )}
        </div>

        {/* Footer: days badge + entry date */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            background: days > 60 ? 'rgba(244,63,94,.12)' : days > 30 ? 'rgba(234,179,8,.12)' : 'rgba(61,247,16,.1)',
            color: daysColor, display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <Clock size={9} /> {days}d estoque
          </span>
          {vehicle.purchase_date && (
            <span style={{ fontSize: 9, color: 'var(--t3)' }}>
              Entrada: {new Date(vehicle.purchase_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

const BRANDS = ['BMW', 'Porsche', 'Mercedes-Benz', 'Audi', 'Land Rover', 'Volvo', 'Outros']
const STATUS_OPTS = [
  { value: '', label: 'Todos' },
  { value: 'available', label: 'Disponível' },
  { value: 'reserved', label: 'Reservado' },
  { value: 'sold', label: 'Vendido' },
]

const selStyle: React.CSSProperties = {
  height: 32, padding: '0 28px 0 9px',
  background: 'var(--el)', border: '1px solid var(--b)',
  borderRadius: 6, color: 'var(--t)', fontSize: 12,
  outline: 'none', fontFamily: 'var(--fn)', cursor: 'pointer',
  appearance: 'none',
}

export default function Inventory() {
  const { store } = useAuthStore()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
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
      if (filterBrand) query = query.eq('brand', filterBrand)
      if (filterStatus) query = query.eq('status', filterStatus)

      const { data } = await query
      return (data ?? []) as Vehicle[]
    },
    enabled: !!store?.id,
  })

  const stats = {
    total: vehicles?.length ?? 0,
    available: vehicles?.filter(v => v.status === 'available').length ?? 0,
    reserved: vehicles?.filter(v => v.status === 'reserved').length ?? 0,
    avgDays: vehicles?.length
      ? Math.round((vehicles.reduce((s, v) => s + (v.days_in_stock ?? 0), 0)) / vehicles.length)
      : 0,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Estoque</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{stats.total} veículos cadastrados</p>
        </div>
        <Button size="sm" onClick={() => setShowAddModal(true)}><Plus size={13} /> Cadastrar Veículo</Button>
      </div>

      {/* Stats mini-cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'Total',             value: stats.total,                   color: 'var(--t)' },
          { label: 'Disponíveis',       value: stats.available,               color: 'var(--neon)' },
          { label: 'Reservados',        value: stats.reserved,                color: 'var(--yel)' },
          { label: 'Média no estoque',  value: `${stats.avgDays}d`,           color: stats.avgDays > 30 ? 'var(--red)' : 'var(--t2)' },
        ].map((s) => (
          <Card key={s.label} style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</p>
            <p style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: s.color }}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Buscar por marca, modelo, placa..."
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
        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={selStyle}>
          <option value="">Todas as marcas</option>
          {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {/* View toggle */}
        <div style={{
          display: 'flex', gap: 2,
          background: 'var(--el)', border: '1px solid var(--b)',
          borderRadius: 6, padding: 3,
        }}>
          {(['grid', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: 4, border: 'none',
                background: view === v ? 'var(--ng)' : 'transparent',
                color: view === v ? 'var(--neon)' : 'var(--t3)',
                cursor: 'pointer', transition: 'all .12s',
              }}
            >
              {v === 'grid' ? <Grid size={13} /> : <List size={13} />}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicle grid */}
      {isLoading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(220px, 1fr))' : '1fr',
          gap: 12,
        }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ borderRadius: 9, overflow: 'hidden', background: 'var(--card)', border: '1px solid var(--bs)' }}>
              <Skeleton style={{ height: 160, borderRadius: 0 }} />
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Skeleton style={{ height: 11, width: '70%' }} />
                <Skeleton style={{ height: 9, width: '45%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : vehicles?.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '56px 0', color: 'var(--t3)' }}>
          <Car size={44} style={{ margin: '0 auto 12px', opacity: .15 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>Nenhum veículo encontrado</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Cadastre seu primeiro veículo no estoque</p>
          <Button style={{ marginTop: 14 }} size="sm" onClick={() => setShowAddModal(true)}><Plus size={13} /> Cadastrar agora</Button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(220px, 1fr))' : '1fr',
          gap: 12,
        }}>
          {vehicles?.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} onEdit={() => setEditingVehicle(vehicle)} />
          ))}
        </div>
      )}

      {showAddModal && (
        <VehicleFormModal onClose={() => setShowAddModal(false)} />
      )}
      {editingVehicle && (
        <VehicleFormModal vehicle={editingVehicle} onClose={() => setEditingVehicle(null)} />
      )}
    </div>
  )
}
