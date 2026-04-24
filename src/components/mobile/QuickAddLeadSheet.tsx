import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ChevronDown, ChevronUp, User, Phone, Car } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/Toast'
import { useLeadPanelStore } from '@/store/leadPanelStore'

interface Props {
  open: boolean
  onClose: () => void
}

const TEMP_OPTIONS = [
  { value: 'hot',  label: 'Quente', color: '#F43F5E' },
  { value: 'warm', label: 'Morno',  color: '#F97316' },
  { value: 'cold', label: 'Frio',   color: '#3B82F6' },
] as const

export function QuickAddLeadSheet({ open, onClose }: Props) {
  const { user, store } = useAuthStore()
  const { openLeadPanel } = useLeadPanelStore()

  const [name,        setName]        = useState('')
  const [phone,       setPhone]       = useState('')
  const [temperature, setTemperature] = useState<'hot'|'warm'|'cold'>('warm')
  const [vehicle,     setVehicle]     = useState('')
  const [expanded,    setExpanded]    = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [bottomOffset, setBottomOffset] = useState(0)

  const nameRef = useRef<HTMLInputElement>(null)

  // Keyboard avoidance no Capacitor
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const show = Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
      setBottomOffset(keyboardHeight)
    })
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      setBottomOffset(0)
    })
    return () => {
      show.then(h => h.remove())
      hide.then(h => h.remove())
    }
  }, [])

  // Auto-focus no nome ao abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 300)
    } else {
      // Reset ao fechar
      setName('')
      setPhone('')
      setVehicle('')
      setTemperature('warm')
      setExpanded(false)
    }
  }, [open])

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Nome obrigatório', 'Informe o nome do cliente')
      return
    }
    if (!user?.store_id) return

    setSubmitting(true)
    try {
      // Busca o primeiro stage do pipeline desta loja
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('store_id', user.store_id)
        .order('position', { ascending: true })
        .limit(1)

      const { data: lead, error } = await supabase
        .from('leads')
        .insert({
          store_id:         user.store_id,
          user_id:          user.id,
          client_name:      name.trim(),
          client_phone:     phone.trim() || null,
          vehicle_interest: vehicle.trim() || null,
          temperature,
          status:           'active',
          source:           'presencial',
          stage_id:         stages?.[0]?.id ?? null,
          created_at:       new Date().toISOString(),
        })
        .select()
        .single()

      if (error) throw error

      toast.success('Lead cadastrado!', name.trim())
      onClose()
      // Abre o painel do lead criado para o vendedor continuar
      if (lead) setTimeout(() => openLeadPanel(lead.id), 400)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao cadastrar', 'Tente novamente')
    } finally {
      setSubmitting(false)
    }
  }

  // Formata telefone brasileiro enquanto digita
  function formatPhone(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 2) return digits
    if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
  }

  const fieldStyle = {
    width:        '100%',
    height:       48,
    background:   'var(--el)',
    border:       '1px solid var(--b)',
    borderRadius: 10,
    color:        'var(--t)',
    fontSize:     16,
    paddingLeft:  40,
    paddingRight: 12,
    boxSizing:    'border-box' as const,
    fontFamily:   'var(--fn)',
    outline:      'none',
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position:   'fixed',
              inset:      0,
              background: 'rgba(0,0,0,.6)',
              zIndex:     150,
            }}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: bottomOffset > 0 ? -bottomOffset : 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            style={{
              position:     'fixed',
              bottom:       0,
              left:         0,
              right:        0,
              background:   'var(--surf)',
              borderRadius: '20px 20px 0 0',
              border:       '1px solid var(--bs)',
              borderBottom: 'none',
              zIndex:       151,
              paddingBottom: `calc(20px + var(--safe-bottom))`,
              maxHeight:    '90dvh',
              overflowY:    'auto',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--b)' }} />
            </div>

            {/* Header */}
            <div style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              padding:        '8px 20px 16px',
            }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: 0 }}>
                  Novo Lead
                </h3>
                <p style={{ fontSize: 12, color: 'var(--t3)', margin: '2px 0 0' }}>
                  Cadastro rápido no pátio
                </p>
              </div>
              <button
                onClick={onClose}
                style={{
                  width:        32,
                  height:       32,
                  borderRadius: '50%',
                  background:   'var(--el)',
                  border:       '1px solid var(--b)',
                  cursor:       'pointer',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  color:        'var(--t3)',
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Campos principais */}
            <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Nome */}
              <div style={{ position: 'relative' }}>
                <User size={15} style={{
                  position: 'absolute', left: 12, top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none',
                }} />
                <input
                  ref={nameRef}
                  type="text"
                  placeholder="Nome do cliente *"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={fieldStyle}
                />
              </div>

              {/* Telefone */}
              <div style={{ position: 'relative' }}>
                <Phone size={15} style={{
                  position: 'absolute', left: 12, top: '50%',
                  transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none',
                }} />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="WhatsApp (11) 99999-9999"
                  value={phone}
                  onChange={e => setPhone(formatPhone(e.target.value))}
                  style={fieldStyle}
                />
              </div>

              {/* Temperatura */}
              <div>
                <p style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Temperatura do lead
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {TEMP_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setTemperature(opt.value)}
                      style={{
                        flex:         1,
                        height:       44,
                        borderRadius: 10,
                        border:       temperature === opt.value
                          ? `2px solid ${opt.color}`
                          : '1px solid var(--b)',
                        background:   temperature === opt.value
                          ? `${opt.color}18`
                          : 'var(--el)',
                        color:        temperature === opt.value ? opt.color : 'var(--t3)',
                        fontSize:     13,
                        fontWeight:   700,
                        cursor:       'pointer',
                        transition:   'all .15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggle mais detalhes */}
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            6,
                  background:     'none',
                  border:         'none',
                  color:          'var(--t3)',
                  fontSize:       12,
                  cursor:         'pointer',
                  paddingTop:     4,
                }}
              >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {expanded ? 'Menos detalhes' : 'Mais detalhes (veículo, observações)'}
              </button>

              {/* Campos extras (expansível) */}
              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 4 }}>
                      <div style={{ position: 'relative' }}>
                        <Car size={15} style={{
                          position: 'absolute', left: 12, top: '50%',
                          transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none',
                        }} />
                        <input
                          type="text"
                          placeholder="Veículo de interesse"
                          value={vehicle}
                          onChange={e => setVehicle(e.target.value)}
                          style={fieldStyle}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Botão enviar */}
            <div style={{ padding: '16px 20px 0' }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || !name.trim()}
                style={{
                  width:        '100%',
                  height:       52,
                  borderRadius: 12,
                  background:   submitting || !name.trim() ? 'var(--el2)' : 'var(--neon)',
                  border:       'none',
                  color:        submitting || !name.trim() ? 'var(--t3)' : '#000',
                  fontSize:     15,
                  fontWeight:   800,
                  cursor:       submitting || !name.trim() ? 'not-allowed' : 'pointer',
                  letterSpacing: '.03em',
                  boxShadow:    submitting || !name.trim() ? 'none' : '0 0 20px rgba(61,247,16,.3)',
                  transition:   'all .2s',
                }}
              >
                {submitting ? 'Cadastrando...' : 'Criar Lead'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
