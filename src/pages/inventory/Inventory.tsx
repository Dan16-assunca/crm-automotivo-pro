import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Grid, List, Car, Clock, Edit, X,
  ChevronLeft, ChevronRight, Camera, Trash2, Save, ImageIcon, TrendingUp,
  Sparkles, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency, computeDaysInStock } from '@/utils/format'
import { toast } from '@/components/ui/Toast'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useVehicleCamera } from '@/hooks/useVehicleCamera'
import { useVehicleAIScan } from '@/hooks/useVehicleAIScan'
import type { Vehicle } from '@/types'

// ─── Image helpers ────────────────────────────────────────────────────────────

/**
 * Compresses an image File using canvas before upload.
 * Resizes to maxWidth preserving aspect ratio, JPEG quality 0.82.
 */
async function compressImage(file: File, maxWidth = 1280, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxWidth / img.width)
      const w = Math.round(img.width  * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', quality)
    }
    img.onerror = reject
    img.src = url
  })
}

/**
 * Returns a Supabase Storage thumbnail URL (via image transform API).
 * Falls back to original URL if it's not a Supabase storage URL.
 */
function thumbUrl(url: string, width = 400): string {
  if (!url.includes('/storage/v1/object/public/')) return url
  return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/') + `?width=${width}&quality=75`
}

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

// ─── Helpers de número no formato BR ─────────────────────────────────────────
// Aceita "58500", "58.500", "58,500" → 58500
function parseBRInt(s: string): number | null {
  if (!s || !s.trim()) return null
  const clean = s.replace(/\./g, '').replace(',', '.')
  const n = parseInt(clean, 10)
  return isNaN(n) ? null : n
}
function parseBRFloat(s: string): number | null {
  if (!s || !s.trim()) return null
  const clean = s.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? null : n
}

// ─── AI field highlight helpers ───────────────────────────────────────────────

/** Estilo de input com destaque neon quando preenchido pela IA */
function aiInpS(ai: boolean): React.CSSProperties {
  return {
    width: '100%', height: 38, padding: '0 10px',
    background: ai ? 'rgba(57,255,20,.07)' : 'var(--el)',
    border: ai ? '1px solid rgba(57,255,20,.55)' : '1px solid var(--b)',
    borderRadius: 8, color: 'var(--t)', fontSize: 13,
    outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box' as const,
    transition: 'border-color .2s, background .2s',
  }
}

/** Wrapper de campo com badge ✨ quando preenchido pela IA */
function AiField({ label, ai, children }: { label: string; ai: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        fontSize: 10, fontWeight: 600, color: ai ? 'var(--neon)' : 'var(--t3)',
        textTransform: 'uppercase' as const, letterSpacing: '.07em',
        display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5,
        transition: 'color .2s',
      }}>
        {label}
        {ai && <span style={{ fontSize: 9, background: 'rgba(57,255,20,.15)', color: 'var(--neon)', padding: '1px 5px', borderRadius: 4, fontWeight: 700, letterSpacing: '.05em' }}>✨ IA</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Brazilian currency input (R$ 58.498) ─────────────────────────────────────
function BRPriceInput({ value, onChange, placeholder, style }: {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [focused, setFocused] = useState(false)
  const digits = value.replace(/\D/g, '')
  const displayValue = focused
    ? digits
    : digits ? 'R$ ' + parseInt(digits, 10).toLocaleString('pt-BR') : ''
  return (
    <input
      style={style}
      type="text"
      inputMode="numeric"
      value={displayValue}
      placeholder={placeholder}
      onFocus={e => { setFocused(true); e.target.select() }}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
    />
  )
}

// ─── Brazilian number input (45.000) ──────────────────────────────────────────
function BRNumberInput({ value, onChange, placeholder, style }: {
  value: string
  onChange: (raw: string) => void
  placeholder?: string
  style?: React.CSSProperties
}) {
  const [focused, setFocused] = useState(false)
  const digits = value.replace(/\D/g, '')
  const displayValue = focused
    ? digits
    : digits ? parseInt(digits, 10).toLocaleString('pt-BR') : ''
  return (
    <input
      style={style}
      type="text"
      inputMode="numeric"
      value={displayValue}
      placeholder={placeholder}
      onFocus={e => { setFocused(true); e.target.select() }}
      onBlur={() => setFocused(false)}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
    />
  )
}

// ─── Vehicle Form Modal ───────────────────────────────────────────────────────
function VehicleFormModal({ vehicle, onClose }: { vehicle?: Vehicle | null; onClose: () => void }) {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const isEdit = !!vehicle
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isMobileForm = useIsMobile()
  const { takePhoto, pickFromGallery, isNative } = useVehicleCamera()
  const { scan, reset: resetScan, status: scanStatus, scanResult, fipeMatch, error: scanError, fetchFipePrice } = useVehicleAIScan()

  // Photos
  const [photos, setPhotos]       = useState<string[]>(vehicle?.photos ?? [])
  const [photoIdx, setPhotoIdx]   = useState(0)
  const [uploading, setUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // AI Scan state
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())
  const [showScanCard, setShowScanCard]     = useState(false)
  const [selectedYearCode, setSelectedYearCode] = useState<string>('')
  const [fetchingFipePrice, setFetchingFipePrice] = useState(false)

  // Form
  const [form, setForm] = useState({
    brand:             vehicle?.brand ?? '',
    model:             vehicle?.model ?? '',
    version:           vehicle?.version ?? '',
    year_fabrication:  vehicle?.year_fabrication?.toString() ?? '',
    year_model:        vehicle?.year_model?.toString() ?? '',
    color:             vehicle?.color ?? '',
    plate:             vehicle?.plate ?? '',
    km:                vehicle?.km != null ? Math.round(vehicle.km).toString() : '',
    fuel:              vehicle?.fuel ?? 'Flex',
    transmission:      vehicle?.transmission ?? 'Automático',
    status:            vehicle?.status ?? 'available',
    purchase_price:    vehicle?.purchase_price != null ? Math.round(vehicle.purchase_price).toString() : '',
    sale_price:        vehicle?.sale_price != null ? Math.round(vehicle.sale_price).toString() : '',
    fipe_price:        vehicle?.fipe_price != null ? Math.round(vehicle.fipe_price).toString() : '',
    purchase_date:     vehicle?.purchase_date?.slice(0, 10) ?? '',
    description:       vehicle?.description ?? '',
  })
  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Lucro calculado
  const saleNum = parseBRFloat(form.sale_price)
  const purchaseNum = parseBRFloat(form.purchase_price)
  const lucro = saleNum !== null && purchaseNum !== null ? saleNum - purchaseNum : null
  const lucroPct = lucro !== null && saleNum ? ((lucro / saleNum) * 100).toFixed(1) : null

  // Photo helpers
  const clampIdx = (arr: string[], i: number) => Math.min(Math.max(i, 0), arr.length - 1)

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 10 - photos.length)
    if (!arr.length) return
    setUploading(true)
    try {
      // Compress + upload all in parallel
      const results = await Promise.all(arr.map(async file => {
        const compressed = await compressImage(file)
        const path = `${store!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const { error } = await supabase.storage.from('vehicle-photos').upload(path, compressed, { contentType: 'image/jpeg', upsert: false })
        if (error) { toast.error('Erro ao enviar foto', error.message); return null }
        const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path)
        return data.publicUrl
      }))
      const newUrls = results.filter(Boolean) as string[]
      setPhotos(p => {
        const updated = [...p, ...newUrls]
        setPhotoIdx(clampIdx(updated, updated.length - 1))
        // Primeira foto num formulário de criação → oferecer escaneamento
        if (p.length === 0 && newUrls.length > 0 && !isEdit) {
          setShowScanCard(true)
        }
        return updated
      })
    } catch (e) {
      toast.error('Erro ao enviar foto', (e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  // ── IA: aplica resultado do escaneamento no formulário ────────────────────
  const applyAIScan = useCallback(() => {
    if (!scanResult) return
    const filled = new Set<string>()
    const apply = (k: keyof typeof form, v: string | null | undefined) => {
      if (v) { setForm(p => ({ ...p, [k]: v })); filled.add(k) }
    }
    apply('brand',        scanResult.brand)
    apply('model',        scanResult.model)
    apply('version',      scanResult.version)
    apply('color',        scanResult.color)
    apply('fuel',         scanResult.fuel)
    apply('transmission', scanResult.transmission)
    if (scanResult.plate) apply('plate', scanResult.plate)
    setAiFilledFields(filled)
    setShowScanCard(false)
  }, [scanResult])

  // ── FIPE: busca preço ao selecionar ano ───────────────────────────────────
  const handleYearCodeChange = useCallback(async (yearCode: string) => {
    setSelectedYearCode(yearCode)
    // Extrai ano numérico do código FIPE (ex: "2023-1" → "2023")
    const yearNum = yearCode.split('-')[0]
    if (yearNum) {
      setForm(p => ({ ...p, year_fabrication: yearNum, year_model: yearNum }))
      setAiFilledFields(prev => new Set([...prev, 'year_fabrication', 'year_model']))
    }
    // Busca preço FIPE
    setFetchingFipePrice(true)
    try {
      const price = await fetchFipePrice(yearCode)
      if (price) {
        setForm(p => ({ ...p, fipe_price: Math.round(price).toString() }))
        setAiFilledFields(prev => new Set([...prev, 'fipe_price']))
      }
    } finally {
      setFetchingFipePrice(false)
    }
  }, [fetchFipePrice])

  // Captura via Capacitor Camera (nativo) ou galeria
  const uploadBlob = async (blob: Blob) => {
    const path = `${store!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
    const compressed = blob.type === 'image/jpeg' && blob.size < 300_000 ? blob : await compressImage(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
    const { error } = await supabase.storage.from('vehicle-photos').upload(path, compressed, { contentType: 'image/jpeg', upsert: false })
    if (error) { toast.error('Erro ao enviar foto', error.message); return null }
    const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path)
    return data.publicUrl
  }

  const handleCameraCapture = async () => {
    if (photos.length >= 10) return
    const photo = isNative ? await takePhoto() : await pickFromGallery()
    if (!photo) return
    setUploading(true)
    try {
      const url = await uploadBlob(photo.blob)
      if (url) {
        setPhotos(p => {
          const updated = [...p, url]
          setPhotoIdx(updated.length - 1)
          if (p.length === 0 && !isEdit) setShowScanCard(true)
          return updated
        })
      }
    } catch (e) {
      toast.error('Erro ao enviar foto', (e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const handleGalleryPick = async () => {
    if (photos.length >= 10) return
    const photo = await pickFromGallery()
    if (!photo) return
    setUploading(true)
    try {
      const url = await uploadBlob(photo.blob)
      if (url) {
        setPhotos(p => {
          const updated = [...p, url]
          setPhotoIdx(updated.length - 1)
          if (p.length === 0 && !isEdit) setShowScanCard(true)
          return updated
        })
      }
    } catch (e) {
      toast.error('Erro ao enviar foto', (e as Error).message)
    } finally {
      setUploading(false)
    }
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
        year_fabrication: parseBRInt(form.year_fabrication),
        year_model:      parseBRInt(form.year_model),
        color:           form.color || null,
        plate:           form.plate || null,
        km:              parseBRInt(form.km),
        fuel:            form.fuel,
        transmission:    form.transmission,
        condition:       'used' as Vehicle['condition'],
        status:          form.status as Vehicle['status'],
        purchase_price:  parseBRFloat(form.purchase_price),
        sale_price:      parseBRFloat(form.sale_price),
        promotional_price: null,
        fipe_price:      parseBRFloat(form.fipe_price),
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
      setSaveError(null)
      toast.success(isEdit ? 'Veículo atualizado!' : 'Veículo cadastrado!')
      onClose()
    },
    onError: (e) => {
      const msg = (e as { message?: string })?.message ?? String(e)
      console.error('[VehicleForm] Erro ao salvar:', e)
      setSaveError(msg)
      toast.error('Erro ao salvar veículo', msg)
    },
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

          {/* Adicionar fotos bar — câmera nativa no mobile */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {isMobileForm ? (
              <>
                {/* Tirar foto (câmera nativa no app, fallback web) */}
                <button
                  type="button"
                  onClick={handleCameraCapture}
                  disabled={uploading || photos.length >= 10}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1.5px solid var(--neon)', background: 'var(--ng)', color: 'var(--neon)', fontSize: 12, cursor: 'pointer', opacity: (uploading || photos.length >= 10) ? 0.4 : 1, fontWeight: 700, flex: 1, justifyContent: 'center' }}
                >
                  <Camera size={14} />
                  {uploading ? 'Enviando...' : isNative ? 'Tirar Foto' : 'Câmera'}
                </button>
                {/* Galeria */}
                <button
                  type="button"
                  onClick={handleGalleryPick}
                  disabled={uploading || photos.length >= 10}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--b)', background: 'var(--el)', color: 'var(--t2)', fontSize: 12, cursor: 'pointer', opacity: (uploading || photos.length >= 10) ? 0.4 : 1, fontWeight: 600, flex: 1, justifyContent: 'center' }}
                >
                  <ImageIcon size={14} />
                  Galeria
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || photos.length >= 10}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, border: '1px solid var(--b)', background: 'var(--el)', color: 'var(--t2)', fontSize: 12, cursor: 'pointer', opacity: (uploading || photos.length >= 10) ? 0.5 : 1, fontWeight: 600 }}
                >
                  <Camera size={12} />
                  {uploading ? 'Enviando...' : 'Adicionar fotos'}
                </button>
                <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }} />
              </>
            )}
            {photos.length >= 10 && <span style={{ fontSize: 10, color: 'var(--t3)' }}>Limite de 10 fotos</span>}
          </div>

          {/* ── Card de escaneamento IA ──────────────────────────────────── */}
          <AnimatePresence>
            {(showScanCard || scanStatus === 'scanning' || scanStatus === 'fipe' || scanStatus === 'done' || scanStatus === 'error') && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden', flexShrink: 0 }}
              >
                <div style={{
                  margin: '0 0 0 0',
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--b)',
                  background: 'rgba(57,255,20,.04)',
                }}>
                  {/* Prompt inicial */}
                  {showScanCard && scanStatus === 'idle' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Sparkles size={16} style={{ color: 'var(--neon)', flexShrink: 0 }} />
                      <p style={{ fontSize: 12, color: 'var(--t2)', flex: 1 }}>
                        Deseja preencher os campos automaticamente com IA?
                      </p>
                      <button
                        type="button"
                        onClick={() => { scan(photos[0]); setShowScanCard(false) }}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid var(--neon)', background: 'var(--ng)', color: 'var(--neon)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        ✨ Escanear
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowScanCard(false)}
                        style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 12 }}
                      >
                        Pular
                      </button>
                    </div>
                  )}

                  {/* Analisando / buscando FIPE */}
                  {(scanStatus === 'scanning' || scanStatus === 'fipe') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Loader2 size={15} style={{ color: 'var(--neon)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--neon)', margin: 0 }}>
                          {scanStatus === 'scanning' ? 'Identificando veículo...' : 'Consultando tabela FIPE...'}
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--t3)', margin: '1px 0 0' }}>
                          {scanStatus === 'scanning' ? 'Claude Vision está analisando a foto' : 'Buscando anos e preço de referência'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Resultado */}
                  {scanStatus === 'done' && scanResult && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                        <CheckCircle size={15} style={{ color: 'var(--neon)', flexShrink: 0, marginTop: 1 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--neon)', margin: 0 }}>
                            {scanResult.brand} {scanResult.model}
                            {scanResult.version ? ` · ${scanResult.version}` : ''}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--t3)', margin: '2px 0 0' }}>
                            {[
                              scanResult.color,
                              scanResult.year_min && scanResult.year_max
                                ? (scanResult.year_min === scanResult.year_max
                                    ? `${scanResult.year_min}`
                                    : `${scanResult.year_min}–${scanResult.year_max}`)
                                : null,
                              scanResult.fuel,
                              scanResult.transmission,
                            ].filter(Boolean).join(' · ')}
                            {' '}· <span style={{ color: scanResult.confidence >= 0.8 ? 'var(--neon)' : '#eab308' }}>
                              {Math.round(scanResult.confidence * 100)}% confiança
                            </span>
                          </p>
                          {scanResult.notes && (
                            <p style={{ fontSize: 10, color: 'var(--t3)', margin: '3px 0 0', fontStyle: 'italic' }}>
                              {scanResult.notes}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={applyAIScan}
                            style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid var(--neon)', background: 'var(--ng)', color: 'var(--neon)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            Aplicar
                          </button>
                          <button
                            type="button"
                            onClick={() => { resetScan(); setShowScanCard(false) }}
                            style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 11 }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                      {/* Seletor de ano FIPE */}
                      {fipeMatch && fipeMatch.years.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 8, border: '1px solid rgba(57,255,20,.15)' }}>
                          <span style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>Ano FIPE:</span>
                          <select
                            value={selectedYearCode}
                            onChange={e => handleYearCodeChange(e.target.value)}
                            style={{ flex: 1, height: 30, padding: '0 8px', background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 6, color: 'var(--t)', fontSize: 12, outline: 'none' }}
                          >
                            <option value="">Selecione o ano...</option>
                            {fipeMatch.years.map(y => (
                              <option key={y.codigo} value={y.codigo}>{y.nome}</option>
                            ))}
                          </select>
                          {fetchingFipePrice && <Loader2 size={13} style={{ color: 'var(--neon)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Erro */}
                  {scanStatus === 'error' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
                      <p style={{ fontSize: 12, color: 'var(--t2)', flex: 1 }}>
                        {scanError ?? 'Não foi possível identificar o veículo'}
                      </p>
                      <button
                        type="button"
                        onClick={() => { resetScan(); setShowScanCard(false) }}
                        style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 11 }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Scrollable form body ─────────────────────────────────────── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Row: Marca | Modelo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AiField label="Marca" ai={aiFilledFields.has('brand')}>
                <input style={aiInpS(aiFilledFields.has('brand'))} value={form.brand}
                  onChange={e => { f('brand', e.target.value); setAiFilledFields(p => { const n = new Set(p); n.delete('brand'); return n }) }}
                  placeholder="BMW, Jeep..." />
              </AiField>
              <AiField label="Modelo" ai={aiFilledFields.has('model')}>
                <input style={aiInpS(aiFilledFields.has('model'))} value={form.model}
                  onChange={e => { f('model', e.target.value); setAiFilledFields(p => { const n = new Set(p); n.delete('model'); return n }) }}
                  placeholder="Civic, Compass..." />
              </AiField>
            </div>

            {/* Row: Versão | Cor */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AiField label="Versão" ai={aiFilledFields.has('version')}>
                <input style={aiInpS(aiFilledFields.has('version'))} value={form.version}
                  onChange={e => { f('version', e.target.value); setAiFilledFields(p => { const n = new Set(p); n.delete('version'); return n }) }}
                  placeholder="M Sport, EXL..." />
              </AiField>
              <AiField label="Cor" ai={aiFilledFields.has('color')}>
                <input style={aiInpS(aiFilledFields.has('color'))} value={form.color}
                  onChange={e => { f('color', e.target.value); setAiFilledFields(p => { const n = new Set(p); n.delete('color'); return n }) }}
                  placeholder="Preto Safira" />
              </AiField>
            </div>

            {/* Row: Ano Fab. | Ano Modelo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AiField label="Ano Fab." ai={aiFilledFields.has('year_fabrication')}>
                <input style={aiInpS(aiFilledFields.has('year_fabrication'))} type="text" inputMode="numeric"
                  value={form.year_fabrication}
                  onChange={e => { f('year_fabrication', e.target.value.replace(/\D/g, '')); setAiFilledFields(p => { const n = new Set(p); n.delete('year_fabrication'); return n }) }}
                  placeholder="2022" maxLength={4} />
              </AiField>
              <AiField label="Ano Modelo" ai={aiFilledFields.has('year_model')}>
                <input style={aiInpS(aiFilledFields.has('year_model'))} type="text" inputMode="numeric"
                  value={form.year_model}
                  onChange={e => { f('year_model', e.target.value.replace(/\D/g, '')); setAiFilledFields(p => { const n = new Set(p); n.delete('year_model'); return n }) }}
                  placeholder="2023" maxLength={4} />
              </AiField>
            </div>

            {/* Row: Quilometragem | Combustível */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Quilometragem</label>
                <BRNumberInput style={inpS} value={form.km} onChange={v => f('km', v)} placeholder="45.000" />
              </div>
              <AiField label="Combustível" ai={aiFilledFields.has('fuel')}>
                <select style={{ ...aiInpS(aiFilledFields.has('fuel')), appearance: 'none' as const }}
                  value={form.fuel}
                  onChange={e => { f('fuel', e.target.value); setAiFilledFields(p => { const n = new Set(p); n.delete('fuel'); return n }) }}>
                  {FUEL_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </AiField>
            </div>

            {/* Row: Placa | Câmbio */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AiField label="Placa" ai={aiFilledFields.has('plate')}>
                <input style={aiInpS(aiFilledFields.has('plate'))} value={form.plate}
                  onChange={e => { f('plate', e.target.value); setAiFilledFields(p => { const n = new Set(p); n.delete('plate'); return n }) }}
                  placeholder="ABC-1234" />
              </AiField>
              <AiField label="Câmbio" ai={aiFilledFields.has('transmission')}>
                <select style={{ ...aiInpS(aiFilledFields.has('transmission')), appearance: 'none' as const }}
                  value={form.transmission}
                  onChange={e => { f('transmission', e.target.value); setAiFilledFields(p => { const n = new Set(p); n.delete('transmission'); return n }) }}>
                  {TRANSMISSION_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </AiField>
            </div>

            {/* Row: Preço Compra | Preço Venda */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblS}>Preço de Compra</label>
                <BRPriceInput style={inpS} value={form.purchase_price} onChange={v => f('purchase_price', v)} placeholder="R$ 368.000" />
              </div>
              <div>
                <label style={lblS}>Preço de Venda</label>
                <BRPriceInput style={inpS} value={form.sale_price} onChange={v => f('sale_price', v)} placeholder="R$ 420.000" />
              </div>
            </div>

            {/* Row: FIPE | Lucro Estimado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AiField label="Tabela FIPE" ai={aiFilledFields.has('fipe_price')}>
                <BRPriceInput style={aiInpS(aiFilledFields.has('fipe_price'))} value={form.fipe_price}
                  onChange={v => { f('fipe_price', v); setAiFilledFields(p => { const n = new Set(p); n.delete('fipe_price'); return n }) }}
                  placeholder="R$ 398.000" />
              </AiField>
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
          <div style={{ borderTop: '1px solid var(--b)', flexShrink: 0 }}>
            {/* Erro inline */}
            {saveError && (
              <div style={{ padding: '10px 20px', background: 'rgba(239,68,68,.08)', borderBottom: '1px solid rgba(239,68,68,.25)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: '#ef4444', fontSize: 13, flexShrink: 0 }}>✕</span>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 2 }}>Erro ao salvar</p>
                  <p style={{ fontSize: 11, color: 'var(--t2)' }}>{saveError}</p>
                </div>
              </div>
            )}
            {/* Aviso campos obrigatórios */}
            {(!form.brand || !form.model) && (
              <div style={{ padding: '6px 20px', background: 'rgba(234,179,8,.06)' }}>
                <p style={{ fontSize: 11, color: '#eab308' }}>
                  {!form.brand && !form.model ? '⚠ Preencha Marca e Modelo para salvar'
                    : !form.brand ? '⚠ Preencha a Marca para salvar'
                    : '⚠ Preencha o Modelo para salvar'}
                </p>
              </div>
            )}
            <div style={{ padding: '12px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--b)', background: 'transparent', color: 'var(--t2)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
              <button
                onClick={() => { setSaveError(null); mut.mutate() }}
                disabled={!form.brand || !form.model || mut.isPending || uploading}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 22px', borderRadius: 8, border: 'none', background: 'var(--neon)', color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: (!form.brand || !form.model || mut.isPending || uploading) ? 0.5 : 1 }}
              >
                <Save size={13} />
                {uploading ? 'Enviando fotos...' : mut.isPending ? 'Salvando...' : isEdit ? 'Salvar veículo' : 'Cadastrar veículo'}
              </button>
            </div>
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
      onClick={onEdit}
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
              loading="lazy"
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
  const isMobile = useIsMobile()
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
        .limit(500)
      if (debouncedSearch) query = query.or(`brand.ilike.%${debouncedSearch}%,model.ilike.%${debouncedSearch}%,plate.ilike.%${debouncedSearch}%`)
      if (filterBrand)  query = query.eq('brand', filterBrand)
      if (filterStatus) query = query.eq('status', filterStatus)
      const { data } = await query
      return (data ?? []).map(v => ({
        ...v,
        days_in_stock: computeDaysInStock(v.purchase_date),
      })) as Vehicle[]
    },
    enabled: !!store?.id,
  })

  const total     = vehicles?.length ?? 0
  const available = vehicles?.filter(v => v.status === 'available').length ?? 0
  const reserved  = vehicles?.filter(v => v.status === 'reserved').length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14 }}>

      {/* Header — simplificado no mobile (botão "+" está na MobileTopbar) */}
      {!isMobile && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Estoque</h1>
            <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>({total} veículo{total !== 1 ? 's' : ''})</p>
          </div>
          <Button size="sm" onClick={() => setShowAddModal(true)}><Plus size={13} /> Cadastrar</Button>
        </div>
      )}

      {isMobile && (
        <>
          <p style={{ fontSize: 11, color: 'var(--t3)' }}>{total} veículo{total !== 1 ? 's' : ''}</p>
          {/* Banner de acesso rápido à Inteligência de Estoque */}
          <Link to="/inteligencia" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(57,255,20,.08)', border: '1px solid rgba(57,255,20,.30)',
              borderRadius: 12, padding: '12px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(57,255,20,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <TrendingUp size={17} style={{ color: '#39ff14' }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#fff', margin: 0 }}>Inteligência de Estoque</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>Ranking · margem · urgência · saúde</p>
                </div>
              </div>
              <ChevronRight size={16} style={{ color: '#39ff14', flexShrink: 0 }} />
            </div>
          </Link>
        </>
      )}

      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'nowrap' : 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? 0 : 200 }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
          <input
            type="search"
            placeholder={isMobile ? 'Buscar...' : 'Buscar por marca, modelo, placa...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: isMobile ? 44 : 34, paddingLeft: 28, paddingRight: 10, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: isMobile ? 10 : 7, color: 'var(--t)', fontSize: 16, outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box' }}
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

        {/* Brand filter — oculto no mobile (espaço limitado) */}
        {!isMobile && (
          <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={selStyle}>
            <option value="">Todas as marcas</option>
            {BRANDS_LIST.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}

        {/* View toggle — oculto no mobile (sempre grid) */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 2, background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 7, padding: 3 }}>
            {(['grid', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 5, border: 'none', background: view === v ? 'var(--ng)' : 'transparent', color: view === v ? 'var(--neon)' : 'var(--t3)', cursor: 'pointer', transition: 'all .12s' }}>
                {v === 'grid' ? <Grid size={13} /> : <List size={13} />}
              </button>
            ))}
          </div>
        )}
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

      {/* Grid — 2 colunas no mobile, auto-fill no desktop */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : (view === 'grid' ? 'repeat(auto-fill, minmax(230px, 1fr))' : '1fr'), gap: isMobile ? 8 : 12 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ borderRadius: 10, overflow: 'hidden', background: 'var(--card)', border: '1px solid var(--bs)' }}>
              <Skeleton style={{ height: isMobile ? 120 : 170, borderRadius: 0 }} />
              <div style={{ padding: isMobile ? 8 : 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : (view === 'grid' ? 'repeat(auto-fill, minmax(230px, 1fr))' : '1fr'), gap: isMobile ? 8 : 12 }}>
          {vehicles?.map(v => (
            <VehicleCard key={v.id} vehicle={v} onEdit={() => setEditingVehicle(v)} />
          ))}
        </div>
      )}

      {/* FAB Cadastrar — mobile only */}
      {isMobile && (
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            position:     'fixed',
            bottom:       'calc(72px + var(--safe-bottom) + 16px)',
            right:        20,
            height:       48,
            padding:      '0 20px',
            borderRadius: 24,
            background:   'var(--neon)',
            border:       'none',
            boxShadow:    '0 4px 20px rgba(61,247,16,.4)',
            cursor:       'pointer',
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            zIndex:       50,
            fontSize:     13,
            fontWeight:   800,
            color:        '#000',
          }}
        >
          <Camera size={16} style={{ color: '#000' }} />
          Cadastrar veículo
        </button>
      )}

      {showAddModal   && <VehicleFormModal onClose={() => setShowAddModal(false)} />}
      {editingVehicle && <VehicleFormModal vehicle={editingVehicle} onClose={() => setEditingVehicle(null)} />}
    </div>
  )
}
