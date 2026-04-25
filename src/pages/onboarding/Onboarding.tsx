import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Car, CheckCircle, MessageCircle, Users, Plus,
  ChevronRight, ArrowRight, Smartphone, QrCode,
  UserPlus, ExternalLink, X, DollarSign,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/Toast'

// ─── Steps ────────────────────────────────────────────────────────────────────

interface Step {
  id: string
  title: string
  subtitle: string
  icon: React.ElementType
  color: string
}

const STEPS: Step[] = [
  { id: 'welcome',       title: 'Bem-vindo ao CRM Auto!',       subtitle: 'Sua loja foi criada com sucesso', icon: Car,           color: '#3DF710' },
  { id: 'whatsapp',      title: 'Conecte o WhatsApp',            subtitle: 'Centralize todas as conversas',   icon: MessageCircle, color: '#25D366' },
  { id: 'team',          title: 'Convide sua equipe',            subtitle: 'Adicione vendedores e gerentes',  icon: Users,         color: '#6366F1' },
  { id: 'first-vehicle', title: 'Cadastre seu primeiro veículo', subtitle: 'Coloque o estoque no sistema',    icon: Car,           color: '#F59E0B' },
]

// ─── Sub-steps ────────────────────────────────────────────────────────────────

function StepWelcome({ storeName }: { storeName: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        style={{
          width: 80, height: 80, borderRadius: 20,
          background: 'var(--ng)', border: '1px solid var(--nb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 0 40px rgba(61,247,16,.2)',
        }}
      >
        <Car size={36} style={{ color: 'var(--neon)' }} />
      </motion.div>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)', marginBottom: 8 }}>
        {storeName} está no ar! 🎉
      </h2>
      <p style={{ fontSize: 14, color: 'var(--t3)', lineHeight: 1.7, maxWidth: 380, margin: '0 auto 32px' }}>
        Sua loja foi criada com sucesso. Vamos configurar os 3 pontos essenciais para você começar a vender agora.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', maxWidth: 340, margin: '0 auto' }}>
        {[
          { icon: MessageCircle, label: 'Conectar WhatsApp', color: '#25D366' },
          { icon: Users,         label: 'Convidar vendedores', color: '#6366F1' },
          { icon: Car,           label: 'Cadastrar primeiro veículo', color: '#F59E0B' },
        ].map((item, i) => {
          const Icon = item.icon
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
                borderRadius: 10, padding: '12px 16px',
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${item.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={15} style={{ color: item.color }} />
              </div>
              <span style={{ fontSize: 13, color: 'var(--t2)', fontWeight: 500 }}>{item.label}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function StepWhatsApp() {
  const navigate = useNavigate()
  return (
    <div>
      <div style={{
        background: 'rgba(37,211,102,.06)', border: '1px solid rgba(37,211,102,.2)',
        borderRadius: 12, padding: '20px 24px', marginBottom: 24,
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <Smartphone size={20} style={{ color: '#25D366', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 4 }}>Por que conectar agora?</p>
          <p style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.7, margin: 0 }}>
            Com o WhatsApp conectado, leads que te mandam mensagem <strong style={{ color: 'var(--t2)' }}>entram automaticamente no CRM</strong>. Sua equipe responde por aqui e tudo fica registrado.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
        {[
          { n: '1', icon: QrCode,      label: 'Clique no botão abaixo → Configurações' },
          { n: '2', icon: Smartphone,  label: 'Clique em "Adicionar número"' },
          { n: '3', icon: CheckCircle, label: 'Escaneie o QR Code com o celular' },
        ].map((step, i) => {
          const Icon = step.icon
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--neon)' }}>
                {step.n}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 8, padding: '11px 14px' }}>
                <Icon size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--t2)' }}>{step.label}</span>
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={() => navigate('/configuracoes')} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '12px 0', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700,
        background: 'rgba(37,211,102,.12)', border: '1px solid rgba(37,211,102,.3)', color: '#25D366',
        transition: 'all .15s',
      }}>
        <ExternalLink size={14} /> Ir para Configurações → WhatsApp
      </button>
    </div>
  )
}

function StepTeam() {
  const { user } = useAuthStore()
  const [email, setEmail]   = useState('')
  const [role, setRole]     = useState<'salesperson' | 'manager'>('salesperson')
  const [sending, setSending] = useState(false)
  const [sent, setSent]     = useState<string[]>([])

  const handleInvite = async () => {
    if (!email.trim() || !email.includes('@')) return
    setSending(true)
    try {
      const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL as string
      const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token ?? SUPA_ANON

      const res = await fetch(`${SUPA_URL}/functions/v1/invite-team-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_ANON,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role, inviter_name: user?.full_name ?? 'Admin' }),
      })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error ?? 'Erro ao convidar')
      setSent(prev => [...prev, email.trim()])
      setEmail('')
      toast.success('Convite enviado!', `${email} receberá o link de acesso`)
    } catch (err) {
      toast.error('Erro ao convidar', err instanceof Error ? err.message : 'Tente novamente')
    } finally {
      setSending(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', height: 36, padding: '0 12px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 13,
    outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 5 }}>
            Email do vendedor
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            placeholder="vendedor@minhaloja.com"
            style={inp}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 5 }}>
            Função
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['salesperson', 'manager'] as const).map(r => (
              <button key={r} onClick={() => setRole(r)} style={{
                flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: role === r ? 'var(--ng)' : 'var(--el)',
                border: `1px solid ${role === r ? 'var(--nb)' : 'var(--b)'}`,
                color: role === r ? 'var(--neon)' : 'var(--t3)',
                transition: 'all .15s',
              }}>
                {r === 'salesperson' ? 'Vendedor' : 'Gerente'}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleInvite} disabled={sending || !email.includes('@')} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          background: 'var(--ng)', border: '1px solid var(--nb)', color: 'var(--neon)',
          opacity: sending || !email.includes('@') ? .5 : 1, transition: 'opacity .15s',
        }}>
          <UserPlus size={14} />
          {sending ? 'Enviando...' : 'Enviar convite'}
        </button>
      </div>

      {sent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>Convites enviados:</p>
          {sent.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--neon)' }}>
              <CheckCircle size={12} /> {e}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 16, textAlign: 'center', opacity: .7 }}>
        Você pode convidar mais pessoas depois em Equipe
      </p>
    </div>
  )
}

function StepFirstVehicle({ onDone }: { onDone: () => void }) {
  const { store } = useAuthStore()
  const [form, setForm]     = useState({ brand: '', model: '', year: '', price: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone]     = useState(false)
  const [savedName, setSavedName] = useState('')

  const handleSave = async () => {
    if (!form.brand.trim() || !form.model.trim()) return
    setSaving(true)
    try {
      const priceNum = form.price ? parseFloat(form.price.replace(/\D/g, '')) : null
      const yearNum  = form.year  ? parseInt(form.year, 10) : null

      const { error } = await supabase.from('vehicles').insert({
        store_id:       store!.id,
        brand:          form.brand.trim(),
        model:          form.model.trim(),
        year_model:     yearNum,
        year_fabrication: yearNum,
        sale_price:     priceNum,
        status:         'available',
        condition:      'used',
        photos:         [],
        optionals:      [],
      })

      if (error) throw error
      const name = `${form.brand} ${form.model}`.trim()
      setSavedName(name)
      setDone(true)
      toast.success('Veículo cadastrado!', `${name} adicionado ao estoque`)
    } catch (err) {
      toast.error('Erro ao cadastrar', err instanceof Error ? err.message : 'Tente novamente')
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', height: 36, padding: '0 12px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 13,
    outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--t3)',
    textTransform: 'uppercase', letterSpacing: '.07em',
    display: 'block', marginBottom: 5,
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }}
        style={{ textAlign: 'center', padding: '24px 0' }}>
        <CheckCircle size={48} style={{ color: 'var(--neon)', margin: '0 auto 16px', display: 'block' }} />
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>Veículo cadastrado!</h3>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 24 }}>
          <strong style={{ color: 'var(--t)' }}>{savedName}</strong> já está no seu estoque.
          Adicione fotos e mais detalhes na página de Estoque.
        </p>
        <button onClick={onDone} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--neon)', color: '#000', fontWeight: 700,
          fontSize: 13, padding: '10px 24px', borderRadius: 8, cursor: 'pointer', border: 'none',
        }}>
          Ir para o Dashboard <ArrowRight size={15} />
        </button>
      </motion.div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={lbl}>Marca *</label>
          <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
            placeholder="Ex: Chevrolet" style={inp} />
        </div>
        <div>
          <label style={lbl}>Modelo *</label>
          <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
            placeholder="Ex: Onix" style={inp} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={lbl}>Ano</label>
          <input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
            placeholder="Ex: 2023" inputMode="numeric" style={inp} />
        </div>
        <div>
          <label style={lbl}>Preço de venda</label>
          <div style={{ position: 'relative' }}>
            <DollarSign size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
            <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              placeholder="Ex: 65000" inputMode="numeric"
              style={{ ...inp, paddingLeft: 26 }} />
          </div>
        </div>
      </div>
      <button onClick={handleSave} disabled={saving || !form.brand.trim() || !form.model.trim()} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '11px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
        background: 'var(--neon)', border: 'none', color: '#000',
        opacity: saving || !form.brand.trim() || !form.model.trim() ? .5 : 1, transition: 'opacity .15s',
        marginTop: 4,
      }}>
        <Plus size={15} />
        {saving ? 'Salvando...' : 'Adicionar ao estoque'}
      </button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate   = useNavigate()
  const { store }  = useAuthStore()
  const [step, setStep] = useState(0)

  const storeName = (store as (typeof store & { name?: string }) | null)?.name ?? 'sua loja'
  const current   = STEPS[step]
  const Icon      = current.icon
  const isLast    = step === STEPS.length - 1

  const goNext = () => {
    if (isLast) { navigate('/dashboard'); return }
    setStep(s => s + 1)
  }

  const skip = () => navigate('/dashboard')

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, position: 'relative', overflow: 'hidden',
    }}>
      {/* Glow */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 500, height: 500, background: `radial-gradient(ellipse, ${current.color}06 0%, transparent 70%)`, borderRadius: '50%', transition: 'background .5s' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 10 }}>

        {/* Skip */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={skip} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 12, color: 'var(--t3)', background: 'none', border: 'none',
            cursor: 'pointer', padding: 0,
          }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--t2)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
          >
            <X size={13} /> Pular configuração
          </button>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: i <= step ? current.color : 'rgba(255,255,255,.08)', transition: 'background .3s' }} />
          ))}
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--card)', backdropFilter: 'blur(20px)',
          border: '1px solid var(--bs)', borderRadius: 16, padding: 32,
          boxShadow: '0 24px 48px rgba(0,0,0,.3)',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: `${current.color}14`, border: `1px solid ${current.color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={20} style={{ color: current.color }} />
            </div>
            <div>
              <p style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                Passo {step + 1} de {STEPS.length}
              </p>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', margin: 0 }}>{current.title}</h2>
            </div>
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.22 }}
            >
              {step === 0 && <StepWelcome storeName={storeName} />}
              {step === 1 && <StepWhatsApp />}
              {step === 2 && <StepTeam />}
              {step === 3 && <StepFirstVehicle onDone={() => navigate('/dashboard')} />}
            </motion.div>
          </AnimatePresence>

          {/* Nav buttons (hidden on last step when vehicle form handles it) */}
          {!(step === STEPS.length - 1) && (
            <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  background: 'var(--el)', border: '1px solid var(--b)', color: 'var(--t3)', cursor: 'pointer',
                }}>
                  Voltar
                </button>
              )}
              <button onClick={goNext} style={{
                flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '11px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                background: step === 0 ? 'var(--neon)' : 'var(--ng)',
                border: step === 0 ? 'none' : '1px solid var(--nb)',
                color: step === 0 ? '#000' : 'var(--neon)',
                cursor: 'pointer',
              }}>
                {step === 0 ? 'Começar configuração' : step === STEPS.length - 2 ? 'Continuar' : 'Continuar'}
                <ChevronRight size={15} />
              </button>
            </div>
          )}

          {step === STEPS.length - 1 && (
            <button onClick={() => navigate('/dashboard')} style={{
              width: '100%', marginTop: 16, padding: '10px 0', borderRadius: 8,
              fontSize: 12, color: 'var(--t3)', background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'center',
            }}>
              Pular e ir para o dashboard
            </button>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--t3)', marginTop: 20, opacity: .5 }}>
          CRM Automotivo Pro · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
