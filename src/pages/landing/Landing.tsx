import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Car, BarChart3, MessageCircle, Zap, Users, Target,
  CheckCircle, ChevronDown, ChevronRight, ArrowRight,
  Shield, Clock, TrendingUp, Star, Menu, X,
  Kanban, Bell, Globe,
} from 'lucide-react'

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN as string | undefined) ?? 'crmautomotivopro.com'

// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Kanban,
    color: '#3DF710',
    title: 'Pipeline Visual',
    desc: 'Arraste leads entre etapas com um Kanban intuitivo. Veja exatamente onde cada negócio está no funil de vendas.',
  },
  {
    icon: MessageCircle,
    color: '#3DF710',
    title: 'WhatsApp Integrado',
    desc: 'Gerencie todas as conversas da equipe em um só lugar. Nunca perca um cliente por falta de resposta.',
  },
  {
    icon: Zap,
    color: '#F59E0B',
    title: 'Automações',
    desc: 'Crie fluxos automáticos de follow-up. O CRM trabalha mesmo quando sua equipe está dormindo.',
  },
  {
    icon: BarChart3,
    color: '#6366F1',
    title: 'Relatórios em Tempo Real',
    desc: 'Dashboards completos com métricas de vendas, conversão e performance por vendedor.',
  },
  {
    icon: Users,
    color: '#EC4899',
    title: 'Gestão de Equipe',
    desc: 'Controle de acesso por função. Admins, gerentes e vendedores com permissões específicas.',
  },
  {
    icon: Target,
    color: '#3DF710',
    title: 'Metas e Comissões',
    desc: 'Defina metas individuais e acompanhe o progresso da equipe em tempo real.',
  },
]

const PLANS = [
  {
    name: 'Starter',
    price: 'R$ 197',
    period: '/mês',
    desc: 'Para concessionárias que estão começando',
    color: '#3DF710',
    highlight: false,
    features: [
      'Até 3 vendedores',
      '500 leads/mês',
      'Pipeline Kanban',
      'WhatsApp integrado',
      'Relatórios básicos',
      'Suporte por email',
    ],
  },
  {
    name: 'Pro',
    price: 'R$ 397',
    period: '/mês',
    desc: 'Para equipes que querem escalar',
    color: '#3DF710',
    highlight: true,
    features: [
      'Até 10 vendedores',
      'Leads ilimitados',
      'Tudo do Starter',
      'Automações avançadas',
      'Relatórios completos',
      'Metas e comissões',
      'Suporte prioritário',
    ],
  },
  {
    name: 'Enterprise',
    price: 'Sob consulta',
    period: '',
    desc: 'Para grupos e múltiplas lojas',
    color: '#6366F1',
    highlight: false,
    features: [
      'Vendedores ilimitados',
      'Múltiplas lojas',
      'Tudo do Pro',
      'API personalizada',
      'Onboarding dedicado',
      'Gerente de conta',
      'SLA garantido',
    ],
  },
]

const FAQS = [
  {
    q: 'Preciso de cartão de crédito para testar?',
    a: 'Não. O trial de 14 dias é 100% gratuito e sem necessidade de cartão. Você só paga se quiser continuar.',
  },
  {
    q: 'Como funciona o WhatsApp integrado?',
    a: 'Você conecta seu número comercial via QR Code. Todas as conversas são gerenciadas dentro do CRM, organizadas por lead.',
  },
  {
    q: 'Minha equipe precisa de treinamento?',
    a: 'A interface foi projetada para ser intuitiva. A maioria das equipes está operando em menos de 1 hora. Temos vídeos de treinamento e suporte.',
  },
  {
    q: 'Posso migrar meus dados do atual sistema?',
    a: 'Sim. Oferecemos importação via planilha Excel/CSV. Para migrações complexas, nosso time de suporte auxilia gratuitamente.',
  },
  {
    q: 'O sistema funciona no celular?',
    a: 'Sim. O CRM é um PWA — pode ser instalado como app no Android e iPhone, com experiência nativa e funcionamento offline.',
  },
]

const STATS = [
  { value: '2.400+', label: 'Leads gerenciados' },
  { value: '97%', label: 'Uptime garantido' },
  { value: '14 dias', label: 'Trial grátis' },
  { value: '< 1h', label: 'Para configurar' },
]

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      onClick={() => setOpen(v => !v)}
      style={{
        borderBottom: '1px solid rgba(255,255,255,.06)',
        padding: '18px 0',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>{q}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} style={{ color: 'var(--t3)', flexShrink: 0 }} />
        </motion.div>
      </div>
      {open && (
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.7, marginTop: 10, marginBottom: 0 }}
        >
          {a}
        </motion.p>
      )}
    </div>
  )
}

// ─── Landing ──────────────────────────────────────────────────────────────────

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false)

  const s = {
    section: {
      padding: '80px 24px',
      maxWidth: 1100,
      margin: '0 auto',
    } as React.CSSProperties,
    badge: {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(61,247,16,.08)', border: '1px solid rgba(61,247,16,.2)',
      borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 600,
      color: 'var(--neon)', letterSpacing: '.08em', textTransform: 'uppercase',
      marginBottom: 20,
    } as React.CSSProperties,
    h2: {
      fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800,
      color: 'var(--t)', lineHeight: 1.2, marginBottom: 14,
    } as React.CSSProperties,
    sub: {
      fontSize: 16, color: 'var(--t3)', lineHeight: 1.7, maxWidth: 560,
    } as React.CSSProperties,
    card: {
      background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)',
      borderRadius: 14, padding: 28,
    } as React.CSSProperties,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--fn)', overflowX: 'hidden' }}>

      {/* ── Navbar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(10,10,10,.85)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,.04)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={16} style={{ color: 'var(--neon)' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--neon)', letterSpacing: '.1em' }}>CRM AUTO</span>
          </div>

          {/* Desktop nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="hidden-mobile">
            {['Funcionalidades', 'Preços', 'FAQ'].map(label => (
              <a
                key={label}
                href={`#${label.toLowerCase()}`}
                style={{ fontSize: 13, color: 'var(--t3)', textDecoration: 'none', transition: 'color .15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--t)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
              >
                {label}
              </a>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link to="/login" style={{
              fontSize: 13, color: 'var(--t3)', textDecoration: 'none', padding: '6px 14px',
              borderRadius: 7, transition: 'color .15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--t)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
            >
              Entrar
            </Link>
            <Link to="/registro" style={{
              fontSize: 13, fontWeight: 600, color: '#000', background: 'var(--neon)',
              padding: '7px 16px', borderRadius: 7, textDecoration: 'none',
              boxShadow: '0 0 16px rgba(61,247,16,.3)',
            }}>
              Começar grátis
            </Link>
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{ display: 'none', background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4 }}
              className="show-mobile"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div style={{ padding: '16px 24px 20px', borderTop: '1px solid rgba(255,255,255,.04)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {['Funcionalidades', 'Preços', 'FAQ'].map(label => (
              <a key={label} href={`#${label.toLowerCase()}`} onClick={() => setMenuOpen(false)}
                style={{ fontSize: 14, color: 'var(--t3)', textDecoration: 'none' }}>
                {label}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Glows */}
        <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 400, background: 'radial-gradient(ellipse, rgba(61,247,16,.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Particles */}
        {[...Array(12)].map((_, i) => (
          <motion.div key={i}
            animate={{ x: [Math.random()*60-30, Math.random()*60-30], y: [Math.random()*60-30, Math.random()*60-30], opacity: [0.06, 0.22, 0.06] }}
            transition={{ duration: 5 + Math.random()*4, repeat: Infinity, repeatType: 'mirror', delay: Math.random()*3 }}
            style={{ position: 'absolute', width: 3, height: 3, borderRadius: '50%', background: 'var(--neon)', left: `${Math.random()*100}%`, top: `${Math.random()*100}%`, pointerEvents: 'none' }}
          />
        ))}

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto' }}>
          <div style={s.badge}>
            <Star size={10} /> 14 dias grátis · Sem cartão
          </div>

          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 68px)', fontWeight: 900,
            lineHeight: 1.1, color: 'var(--t)', marginBottom: 20,
            letterSpacing: '-.02em',
          }}>
            O CRM feito para{' '}
            <span style={{ color: 'var(--neon)', textShadow: '0 0 30px rgba(61,247,16,.4)' }}>
              concessionárias
            </span>{' '}
            premium
          </h1>

          <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: 'var(--t3)', lineHeight: 1.7, marginBottom: 36, maxWidth: 580, margin: '0 auto 36px' }}>
            Pipeline visual, WhatsApp integrado e automações que trabalham enquanto sua equipe descansa. Tudo em um subdomínio exclusivo da sua loja.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/registro" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'var(--neon)', color: '#000', fontWeight: 700,
              fontSize: 15, padding: '13px 28px', borderRadius: 10,
              textDecoration: 'none', boxShadow: '0 0 30px rgba(61,247,16,.35)',
              transition: 'transform .15s, box-shadow .15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(61,247,16,.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(61,247,16,.35)' }}
            >
              Criar minha loja grátis <ArrowRight size={16} />
            </Link>
            <a href="#funcionalidades" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              border: '1px solid rgba(255,255,255,.1)', color: 'var(--t)',
              fontSize: 15, padding: '13px 28px', borderRadius: 10,
              textDecoration: 'none', background: 'rgba(255,255,255,.03)',
            }}>
              Ver funcionalidades
            </a>
          </div>

          {/* URL preview */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            style={{ marginTop: 28, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 8, padding: '8px 16px' }}>
            <Globe size={13} style={{ color: 'var(--t3)' }} />
            <span style={{ fontSize: 13, color: 'var(--t3)' }}>
              Sua loja em: <span style={{ color: 'var(--neon)', fontWeight: 600 }}>minha-loja.{ROOT_DOMAIN}</span>
            </span>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stats ── */}
      <section style={{ padding: '0 24px 70px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,.04)', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.06)' }}>
          {STATS.map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} viewport={{ once: true }}
              style={{ padding: '28px 20px', textAlign: 'center', background: 'rgba(10,10,10,.9)' }}>
              <div style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 900, color: 'var(--neon)', marginBottom: 6 }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Funcionalidades ── */}
      <section id="funcionalidades" style={{ ...s.section, paddingTop: 60 }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={s.badge}><Zap size={10} /> Funcionalidades</div>
          <h2 style={s.h2}>Tudo que sua equipe precisa</h2>
          <p style={{ ...s.sub, margin: '0 auto' }}>
            Desenvolvido especificamente para o mercado automotivo brasileiro. Sem funcionalidades genéricas que não se aplicam ao seu negócio.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} viewport={{ once: true }}
                style={{ ...s.card, transition: 'border-color .2s, transform .2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(61,247,16,.2)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,.06)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)' }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${f.color}14`, border: `1px solid ${f.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Icon size={18} style={{ color: f.color }} />
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section style={{ padding: '60px 24px', background: 'rgba(255,255,255,.01)', borderTop: '1px solid rgba(255,255,255,.04)', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={s.badge}><Clock size={10} /> Simples assim</div>
          <h2 style={s.h2}>Pronto em menos de 1 hora</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 48, textAlign: 'left' }}>
            {[
              { n: '01', title: 'Crie sua conta', desc: 'Preencha nome, email e escolha o endereço exclusivo da sua loja. Pronto em 2 minutos.' },
              { n: '02', title: 'Conecte o WhatsApp', desc: 'Escaneie o QR Code com o celular. Todos os chats da equipe centralizados em um lugar.' },
              { n: '03', title: 'Comece a vender', desc: 'Cadastre seus leads, crie automações e acompanhe o pipeline em tempo real.' },
            ].map((step, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
                style={s.card}>
                <div style={{ fontSize: 32, fontWeight: 900, color: 'rgba(61,247,16,.15)', marginBottom: 12, lineHeight: 1 }}>{step.n}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>{step.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--t3)', lineHeight: 1.65, margin: 0 }}>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Preços ── */}
      <section id="preços" style={s.section}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={s.badge}><TrendingUp size={10} /> Planos</div>
          <h2 style={s.h2}>Planos para todos os tamanhos</h2>
          <p style={{ ...s.sub, margin: '0 auto' }}>Comece com 14 dias grátis. Cancele quando quiser, sem multa.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20, maxWidth: 960, margin: '0 auto' }}>
          {PLANS.map((plan, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}
              style={{
                ...s.card,
                position: 'relative', overflow: 'hidden',
                borderColor: plan.highlight ? 'rgba(61,247,16,.35)' : 'rgba(255,255,255,.06)',
                boxShadow: plan.highlight ? '0 0 40px rgba(61,247,16,.08)' : 'none',
              }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: 14, right: 14, background: 'var(--neon)', color: '#000', fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 20, letterSpacing: '.08em' }}>
                  MAIS POPULAR
                </div>
              )}
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--t)', marginBottom: 4 }}>{plan.name}</h3>
              <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 20 }}>{plan.desc}</p>
              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: plan.highlight ? 'var(--neon)' : 'var(--t)' }}>{plan.price}</span>
                <span style={{ fontSize: 13, color: 'var(--t3)' }}>{plan.period}</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plan.features.map((f, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
                    <CheckCircle size={13} style={{ color: plan.highlight ? 'var(--neon)' : 'var(--t3)', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to={plan.name === 'Enterprise' ? '#faq' : '/registro'} style={{
                display: 'block', textAlign: 'center', padding: '11px 0', borderRadius: 8,
                fontSize: 13, fontWeight: 700, textDecoration: 'none',
                background: plan.highlight ? 'var(--neon)' : 'rgba(255,255,255,.04)',
                color: plan.highlight ? '#000' : 'var(--t)',
                border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,.08)',
                transition: 'opacity .15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {plan.name === 'Enterprise' ? 'Falar com vendas' : 'Começar grátis →'}
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: '60px 24px', background: 'rgba(255,255,255,.01)', borderTop: '1px solid rgba(255,255,255,.04)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={s.badge}><Bell size={10} /> Dúvidas</div>
            <h2 style={s.h2}>Perguntas frequentes</h2>
          </div>
          <div>
            {FAQS.map((faq, i) => <FaqItem key={i} q={faq.q} a={faq.a} />)}
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 0 30px rgba(61,247,16,.15)' }}>
            <Car size={28} style={{ color: 'var(--neon)' }} />
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, color: 'var(--t)', marginBottom: 14 }}>
            Pronto para vender mais?
          </h2>
          <p style={{ fontSize: 16, color: 'var(--t3)', lineHeight: 1.7, marginBottom: 36 }}>
            Junte-se às concessionárias que já usam o CRM Automotivo Pro. 14 dias grátis, configuração em menos de 1 hora.
          </p>
          <Link to="/registro" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--neon)', color: '#000', fontWeight: 700,
            fontSize: 16, padding: '15px 32px', borderRadius: 10,
            textDecoration: 'none', boxShadow: '0 0 40px rgba(61,247,16,.35)',
          }}>
            Criar minha loja agora <ChevronRight size={18} />
          </Link>
          <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 16, opacity: .7 }}>
            Sem cartão de crédito · Cancele quando quiser
          </p>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,.04)', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Car size={16} style={{ color: 'var(--neon)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--neon)', letterSpacing: '.1em' }}>CRM AUTO</span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {['Termos de Uso', 'Privacidade', 'Suporte'].map(label => (
              <a key={label} href="#" style={{ fontSize: 12, color: 'var(--t3)', textDecoration: 'none' }}>{label}</a>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t3)' }}>
            <Shield size={12} />
            Dados protegidos com SSL + RLS
          </div>
        </div>
      </footer>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 600px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: flex !important; }
        }
        @media (max-width: 700px) {
          [style*="repeat(4, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
          [style*="repeat(3, 1fr)"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
