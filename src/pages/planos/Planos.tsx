import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Zap, Crown, Building2, AlertCircle, Clock, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/Toast'

// ─── Planos ───────────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    icon: Zap,
    color: '#3DF710',
    price: 197,
    period: '/mês',
    description: 'Para revendas que estão começando',
    features: [
      'Até 3 usuários (vendedores)',
      'Até 500 leads ativos',
      'Pipeline Kanban completo',
      'WhatsApp integrado (1 número)',
      'Automações de follow-up',
      'Estoque ilimitado de veículos',
      'Dashboard e relatórios básicos',
      'Suporte via chat',
    ],
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: Crown,
    color: '#a78bfa',
    price: 397,
    period: '/mês',
    description: 'Para revendas em crescimento',
    recommended: true,
    features: [
      'Usuários ilimitados',
      'Leads ilimitados',
      'Múltiplos números de WhatsApp',
      'IA — mensagens personalizadas',
      'IA — matching Lead × Veículo',
      'Alertas inteligentes de estoque',
      'Digest diário para o gestor',
      'Relatórios avançados',
      'Integrações OLX / WebMotors',
      'Suporte prioritário',
    ],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    icon: Building2,
    color: '#fb923c',
    price: null,
    period: '',
    description: 'Para grupos e redes de concessionárias',
    features: [
      'Tudo do Pro',
      'Multi-lojas em um painel',
      'API dedicada',
      'Customizações sob medida',
      'SLA garantido',
      'Gerente de conta dedicado',
      'Treinamento da equipe',
    ],
    highlight: false,
  },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

function StatusBanner({ status, daysLeft }: { status: string; daysLeft: number | null }) {
  if (status === 'active') return null

  let bg = '', border = '', icon = <Clock size={16} />, text = ''

  if (status === 'trial') {
    bg = 'rgba(251,146,60,.08)'; border = 'rgba(251,146,60,.3)'
    text = daysLeft === 0
      ? 'Seu trial encerrou hoje. Assine um plano para continuar.'
      : `Seu trial encerra em ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}. Assine agora para não perder o acesso.`
    icon = <Clock size={16} style={{ color: '#fb923c' }} />
  } else {
    bg = 'rgba(239,68,68,.08)'; border = 'rgba(239,68,68,.3)'
    icon = <XCircle size={16} style={{ color: '#ef4444' }} />
    text = status === 'cancelled'
      ? 'Sua assinatura foi cancelada. Reative para continuar usando o CRM.'
      : 'Sua conta está suspensa por falta de pagamento. Regularize para retomar o acesso.'
  }

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 10, padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 32,
    }}>
      {icon}
      <p style={{ fontSize: 13, color: 'var(--t)', margin: 0 }}>{text}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Planos() {
  const { store, setStore } = useAuthStore()
  const [loading, setLoading] = useState<string | null>(null)
  const [searchParams] = useSearchParams()

  // Lê resultado do checkout Stripe
  useEffect(() => {
    const result = searchParams.get('checkout')
    if (result === 'success') {
      toast.success('Assinatura ativada!', 'Bem-vindo ao CRM Automotivo Pro')
      // Atualiza store no cache local
      supabase.from('stores').select('*').eq('id', store?.id ?? '').single()
        .then(({ data }) => { if (data) setStore(data) })
    } else if (result === 'cancelled') {
      toast.info('Pagamento cancelado', 'Você pode assinar quando quiser')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const status   = store?.status ?? 'trial'
  const trialEnd = store?.trial_ends_at ? new Date(store.trial_ends_at) : null
  const daysLeft = trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000))
    : null

  const currentPlan = store?.plan ?? 'free'

  const handleCheckout = async (planId: string) => {
    if (planId === 'enterprise') {
      window.open('mailto:contato@crmautomotivopro.com?subject=Plano Enterprise', '_blank')
      return
    }
    setLoading(planId)
    try {
      const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL as string
      const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token ?? SUPA_ANON

      const res = await fetch(`${SUPA_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_ANON,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: planId }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Erro ao criar sessão de pagamento')
      window.location.href = data.url
    } catch (err) {
      toast.error('Erro no checkout', err instanceof Error ? err.message : 'Tente novamente')
      setLoading(null)
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 0' }}>

      <StatusBanner status={status} daysLeft={daysLeft} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 700, color: 'var(--neon)', letterSpacing: '.1em',
          textTransform: 'uppercase', marginBottom: 12,
          background: 'var(--ng)', border: '1px solid var(--nb)',
          padding: '4px 12px', borderRadius: 20,
        }}>
          <Zap size={11} /> Planos e Preços
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--t)', margin: '0 0 10px' }}>
          Escolha o plano ideal para sua loja
        </h1>
        <p style={{ fontSize: 14, color: 'var(--t3)', margin: 0 }}>
          Todos os planos incluem 14 dias grátis · Cancele quando quiser
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {PLANS.map((plan, i) => {
          const Icon = plan.icon
          const isCurrent = currentPlan === plan.id
          const isLoading_ = loading === plan.id
          const isLocked = status !== 'active' && status !== 'trial'

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              style={{
                background:   plan.highlight ? `linear-gradient(135deg, rgba(167,139,250,.08) 0%, var(--card) 100%)` : 'var(--card)',
                border:       plan.highlight ? `1px solid rgba(167,139,250,.35)` : '1px solid var(--bs)',
                borderRadius: 14,
                padding:      '24px',
                position:     'relative',
                display:      'flex',
                flexDirection: 'column',
                gap:          20,
                boxShadow:    plan.highlight ? '0 0 40px rgba(167,139,250,.1)' : 'none',
              }}
            >
              {/* Badge recomendado */}
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                  background: plan.color, color: '#000',
                  fontSize: 10, fontWeight: 800, letterSpacing: '.08em',
                  padding: '3px 12px', borderRadius: 20, textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>
                  Mais popular
                </div>
              )}

              {/* Header do card */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: `${plan.color}18`, border: `1px solid ${plan.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={17} style={{ color: plan.color }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', margin: 0 }}>{plan.name}</p>
                    {isCurrent && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: plan.color, letterSpacing: '.07em', textTransform: 'uppercase' }}>
                        Plano atual
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>{plan.description}</p>
              </div>

              {/* Preço */}
              <div>
                {plan.price !== null ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--t)', lineHeight: 1 }}>
                      {fmt(plan.price)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--t3)' }}>{plan.period}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t)' }}>
                    Sob consulta
                  </div>
                )}
                {plan.price !== null && (
                  <p style={{ fontSize: 11, color: 'var(--t3)', margin: '4px 0 0' }}>
                    {fmt(Math.round(plan.price / 30))}/dia · sem fidelidade
                  </p>
                )}
              </div>

              {/* Features */}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {plan.features.map((f, fi) => (
                  <li key={fi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--t2)' }}>
                    <Check size={13} style={{ color: plan.color, flexShrink: 0, marginTop: 1 }} />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Botão */}
              <button
                onClick={() => handleCheckout(plan.id)}
                disabled={isLoading_ || (isCurrent && status === 'active')}
                style={{
                  width: '100%', height: 44, borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: plan.highlight ? 'none' : `1px solid ${plan.color}40`,
                  background: plan.highlight ? plan.color : `${plan.color}14`,
                  color:      plan.highlight ? '#000' : plan.color,
                  opacity:    (isCurrent && status === 'active') ? .5 : 1,
                  transition: 'all .15s',
                  display:    'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {isLoading_ ? (
                  <div style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
                ) : isCurrent && status === 'active' ? (
                  'Plano ativo'
                ) : plan.id === 'enterprise' ? (
                  'Falar com vendas'
                ) : (
                  'Assinar agora'
                )}
              </button>
            </motion.div>
          )
        })}
      </div>

      {/* Garantia */}
      <div style={{ textAlign: 'center', marginTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <AlertCircle size={14} style={{ color: 'var(--t3)' }} />
        <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>
          Pagamento seguro via Stripe · Cancele a qualquer momento sem multa · NF emitida automaticamente
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
