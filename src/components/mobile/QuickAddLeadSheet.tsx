import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, User, Phone, Car, Mail, DollarSign, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/Toast'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { getLeadUtmFields, clearStoredUtms } from '@/utils/utm'

interface Props {
  open: boolean
  onClose: () => void
}

const TEMP_OPTIONS = [
  { value: 'hot',  label: '🔥 Quente', color: '#F43F5E' },
  { value: 'warm', label: '⚡ Morno',  color: '#F97316' },
  { value: 'cold', label: '❄️ Frio',   color: '#3B82F6' },
] as const

const SOURCE_OPTIONS = [
  { value: 'presencial',  label: 'Presencial (pátio)' },
  { value: 'whatsapp',    label: 'WhatsApp'            },
  { value: 'instagram',   label: 'Instagram'           },
  { value: 'indicacao',   label: 'Indicação'           },
  { value: 'google_ads',  label: 'Google Ads'          },
  { value: 'meta_ads',    label: 'Meta Ads'            },
  { value: 'site',        label: 'Site'                },
  { value: 'outros',      label: 'Outros'              },
]

export function QuickAddLeadSheet({ open, onClose }: Props) {
  const { user } = useAuthStore()
  const { openLeadPanel } = useLeadPanelStore()

  const [name,        setName]        = useState('')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [temperature, setTemperature] = useState<'hot'|'warm'|'cold'>('warm')
  const [vehicle,     setVehicle]     = useState('')
  const [budget,      setBudget]      = useState('')
  const [source,      setSource]      = useState('presencial')
  const [notes,       setNotes]       = useState('')
  const [expanded,    setExpanded]    = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [bottomOffset, setBottomOffset] = useState(0)

  const nameRef = useRef<HTMLInputElement>(null)

  // Keyboard avoidance no Capacitor
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const show = Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => setBottomOffset(keyboardHeight))
    const hide = Keyboard.addListener('keyboardWillHide', () => setBottomOffset(0))
    return () => {
      show.then(h => h.remove())
      hide.then(h => h.remove())
    }
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 300)
    } else {
      setName(''); setPhone(''); setEmail(''); setVehicle('')
      setBudget(''); setNotes(''); setSource('presencial')
      setTemperature('warm'); setExpanded(false)
    }
  }, [open])

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Nome obrigatório', 'Informe o nome do cliente')
      return
    }
    if (!user?.store_id) {
      toast.error('Sessão expirada', 'Faça login novamente')
      return
    }

    setSubmitting(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    try {
      // Busca o primeiro stage do pipeline
      const { data: stages, error: stagesErr } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('store_id', user.store_id)
        .order('position', { ascending: true })
        .limit(1)
        .abortSignal(controller.signal)

      if (stagesErr) throw stagesErr

      const budgetNum = budget ? parseFloat(budget.replace(/\D/g, '')) || null : null

      const utmFields = getLeadUtmFields()

      const { data: lead, error } = await supabase
        .from('leads')
        .insert({
          store_id:         user.store_id,
          salesperson_id:   user.id,
          client_name:      name.trim(),
          client_phone:     phone.trim() || null,
          client_email:     email.trim() || null,
          vehicle_interest: vehicle.trim() || null,
          budget:           budgetNum,
          temperature,
          status:           'active',
          source,
          notes:            notes.trim() || null,
          stage_id:         stages?.[0]?.id ?? null,
          ...utmFields,
        })
        .select()
        .single()

      if (error) throw error

      clearStoredUtms()
      toast.success('Lead cadastrado!', name.trim())
      onClose()
      if (lead) setTimeout(() => openLeadPanel(lead.id), 400)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error('Tempo esgotado', 'Verifique sua conexão e tente novamente')
      } else {
        console.error('[QuickAddLead]', err)
        toast.error('Erro ao cadastrar', err instanceof Error ? err.message : 'Tente novamente')
      }
    } finally {
      clearTimeout(timeout)
      setSubmitting(false)
    }
  }

  function formatPhone(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11)
    if (d.length <= 2) return d
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  }

  function formatBudget(v: string) {
    const digits = v.replace(/\D/g, '')
    if (!digits) return ''
    const num = parseInt(digits, 10)
    return num.toLocaleString('pt-BR')
  }

  const field: React.CSSProperties = {
    width: '100%', height: 50, background: 'var(--el)',
    border: '1px solid var(--b)', borderRadius: 12,
    color: 'var(--t)', fontSize: 16, paddingLeft: 44, paddingRight: 12,
    boxSizing: 'border-box', fontFamily: 'var(--fn)', outline: 'none',
  }

  const icon: React.CSSProperties = {
    position: 'absolute', left: 14, top: '50%',
    transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none',
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 150 }}
          />

          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: bottomOffset > 0 ? -bottomOffset : 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'var(--surf)', borderRadius: '24px 24px 0 0',
              border: '1px solid var(--bs)', borderBottom: 'none',
              zIndex: 151, paddingBottom: `calc(24px + var(--safe-bottom))`,
              maxHeight: '92dvh', overflowY: 'auto',
            }}
          >
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 2px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--b)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 20px' }}>
              <div>
                <h3 style={{ fontSize: 19, fontWeight: 800, color: 'var(--t)', margin: 0 }}>Novo Lead</h3>
                <p style={{ fontSize: 12, color: 'var(--t3)', margin: '3px 0 0' }}>Cadastro rápido no pátio</p>
              </div>
              <button onClick={onClose} style={{
                width: 36, height: 36, borderRadius: '50%', background: 'var(--el)',
                border: '1px solid var(--b)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)',
              }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Nome */}
              <div style={{ position: 'relative' }}>
                <User size={16} style={icon} />
                <input ref={nameRef} type="text" placeholder="Nome do cliente *"
                  value={name} onChange={e => setName(e.target.value)} style={field} />
              </div>

              {/* Telefone */}
              <div style={{ position: 'relative' }}>
                <Phone size={16} style={icon} />
                <input type="tel" inputMode="numeric" placeholder="WhatsApp (11) 99999-9999"
                  value={phone} onChange={e => setPhone(formatPhone(e.target.value))} style={field} />
              </div>

              {/* Temperatura */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                  Temperatura do lead
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {TEMP_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setTemperature(opt.value)} style={{
                      flex: 1, height: 46, borderRadius: 12, cursor: 'pointer',
                      border: temperature === opt.value ? `2px solid ${opt.color}` : '1px solid var(--b)',
                      background: temperature === opt.value ? `${opt.color}20` : 'var(--el)',
                      color: temperature === opt.value ? opt.color : 'var(--t3)',
                      fontSize: 13, fontWeight: 700, transition: 'all .15s',
                    }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Veículo de interesse */}
              <div style={{ position: 'relative' }}>
                <Car size={16} style={icon} />
                <input type="text" placeholder="Veículo de interesse (ex: HB20 2023)"
                  value={vehicle} onChange={e => setVehicle(e.target.value)} style={field} />
              </div>

              {/* Toggle mais detalhes */}
              <button onClick={() => setExpanded(!expanded)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 10,
                color: 'var(--t3)', fontSize: 13, cursor: 'pointer', height: 42,
              }}>
                {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                {expanded ? 'Menos detalhes' : 'Mais detalhes'}
              </button>

              {/* Campos extras */}
              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 4 }}>

                      {/* Email */}
                      <div style={{ position: 'relative' }}>
                        <Mail size={16} style={icon} />
                        <input type="email" inputMode="email" placeholder="Email do cliente"
                          value={email} onChange={e => setEmail(e.target.value)} style={field} />
                      </div>

                      {/* Orçamento */}
                      <div style={{ position: 'relative' }}>
                        <DollarSign size={16} style={icon} />
                        <input type="text" inputMode="numeric" placeholder="Orçamento disponível (R$)"
                          value={budget} onChange={e => setBudget(formatBudget(e.target.value))} style={field} />
                      </div>

                      {/* Origem */}
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                          Origem do lead
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {SOURCE_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => setSource(opt.value)} style={{
                              padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                              border: source === opt.value ? '2px solid var(--neon)' : '1px solid var(--b)',
                              background: source === opt.value ? 'var(--ng)' : 'var(--el)',
                              color: source === opt.value ? 'var(--neon)' : 'var(--t3)',
                              transition: 'all .12s',
                            }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Observações */}
                      <div style={{ position: 'relative' }}>
                        <FileText size={16} style={{ ...icon, top: 16, transform: 'none' }} />
                        <textarea
                          placeholder="Observações sobre o cliente..."
                          value={notes} onChange={e => setNotes(e.target.value)}
                          rows={3}
                          style={{
                            ...field, height: 'auto', paddingTop: 12, paddingBottom: 12,
                            resize: 'none', lineHeight: 1.5,
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Botão */}
            <div style={{ padding: '16px 20px 0' }}>
              <button
                onClick={handleSubmit}
                disabled={submitting || !name.trim()}
                style={{
                  width: '100%', height: 56, borderRadius: 14,
                  background: submitting || !name.trim() ? 'var(--el2)' : 'var(--neon)',
                  border: 'none',
                  color: submitting || !name.trim() ? 'var(--t3)' : '#000',
                  fontSize: 16, fontWeight: 800, cursor: submitting || !name.trim() ? 'not-allowed' : 'pointer',
                  letterSpacing: '.02em',
                  boxShadow: submitting || !name.trim() ? 'none' : '0 0 24px rgba(61,247,16,.35)',
                  transition: 'all .2s',
                }}
              >
                {submitting ? 'Cadastrando...' : '+ Criar Lead'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
