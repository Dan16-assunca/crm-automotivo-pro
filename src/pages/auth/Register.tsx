import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import {
  Mail, Lock, User, Building2, Eye, EyeOff, Car, CheckCircle,
  Check, X, Loader2, Globe,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'
import { redirectToTenant, isOnTenantSubdomain } from '@/hooks/useTenant'

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN as string | undefined) ?? 'crmautomotivopro.com'
const RESERVED_SLUGS = new Set(['app', 'www', 'api', 'admin', 'mail', 'smtp', 'ftp', 'blog', 'docs', 'status', 'suporte', 'billing', 'demo'])

const schema = z.object({
  full_name:  z.string().min(2, 'Nome obrigatório'),
  store_name: z.string().min(2, 'Nome da loja obrigatório'),
  email:      z.string().email('Email inválido'),
  password:   z.string().min(6, 'Mínimo 6 caracteres'),
  confirm:    z.string(),
}).refine(d => d.password === d.confirm, {
  message: 'As senhas não coincidem',
  path: ['confirm'],
})

type FormData = z.infer<typeof schema>

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
}

export default function Register() {
  const navigate = useNavigate()
  const { user, store } = useAuthStore()

  // Se já logado, redireciona para o dashboard da loja
  useEffect(() => {
    if (user) {
      const slug = (store as (typeof store & { slug?: string | null }) | null)?.slug
      if (slug && !isOnTenantSubdomain()) {
        redirectToTenant(slug, '/dashboard')
      } else {
        navigate('/dashboard', { replace: true })
      }
    }
  }, [user, store, navigate])

  const [showPwd, setShowPwd]             = useState(false)
  const [submitting, setSubmitting]       = useState(false)
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false)
  const [slug, setSlug]                   = useState('')
  const [slugStatus, setSlugStatus]       = useState<'idle' | 'checking' | 'available' | 'taken' | 'reserved'>('idle')
  const debounceRef                       = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const storeName = watch('store_name')

  // Auto-gera slug quando o nome da loja muda (se o usuário ainda não editou manualmente)
  const [slugEdited, setSlugEdited] = useState(false)
  useEffect(() => {
    if (!slugEdited && storeName) {
      const auto = generateSlug(storeName)
      setSlug(auto)
    }
  }, [storeName, slugEdited])

  // Debounce do check de disponibilidade
  useEffect(() => {
    if (!slug) { setSlugStatus('idle'); return }
    if (slug.length < 3) { setSlugStatus('idle'); return }
    if (RESERVED_SLUGS.has(slug)) { setSlugStatus('reserved'); return }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSlugStatus('checking')

    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await supabase.rpc('is_slug_available', { p_slug: slug })
        setSlugStatus(data ? 'available' : 'taken')
      } catch {
        setSlugStatus('idle')
      }
    }, 500)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [slug])

  const onSubmit = async (data: FormData) => {
    if (slugStatus !== 'available') {
      toast.error('Endereço inválido', 'Escolha um endereço disponível para sua loja')
      return
    }
    setSubmitting(true)
    try {
      const SUPA_URL  = (import.meta.env.VITE_SUPABASE_URL  as string) ?? 'https://eakdywmuewvuzyqfpcpl.supabase.co'
      const SUPA_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? ''
      const fnUrl = `${SUPA_URL}/functions/v1/create-store-and-user`

      // Timeout de 30s para evitar loading eterno caso o servidor demore
      const controller = new AbortController()
      const timeoutId  = setTimeout(() => controller.abort(), 30_000)

      let res: Response
      try {
        res = await fetch(fnUrl, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPA_ANON,
            'Authorization': `Bearer ${SUPA_ANON}`,
          },
          body: JSON.stringify({
            full_name:  data.full_name,
            store_name: data.store_name,
            slug,
            email:      data.email,
            password:   data.password,
          }),
          signal: controller.signal,
        })
      } catch (fetchErr) {
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          toast.error('Tempo esgotado', 'O servidor demorou para responder. Tente novamente.')
        } else {
          toast.error('Erro de conexão', fetchErr instanceof Error ? fetchErr.message : 'Verifique sua conexão e tente novamente')
        }
        return
      } finally {
        clearTimeout(timeoutId)
      }

      const result = await res.json()

      if (!res.ok || result.error) {
        const msg = (result.error ?? '') as string
        if (msg.toLowerCase().includes('cadastrado')) {
          toast.error('Email já cadastrado', 'Este email já possui uma conta. Clique em "Fazer login".')
          navigate('/login')
        } else {
          toast.error('Erro no cadastro', msg || 'Tente novamente')
        }
        return
      }

      if (!result.session) {
        setNeedsEmailConfirm(true)
        return
      }

      toast.success('Conta criada!', `Bem-vindo, ${data.full_name.split(' ')[0]}! Redirecionando…`)

      // ── Transferência de sessão entre subdomínios ─────────────────────────
      // NÃO usar supabase.auth.setSession() aqui: o storageKey é isolado por
      // hostname (sb-app-...-auth), então a sessão não seria encontrada no
      // subdomínio do tenant (sb-{slug}-...-auth).
      // Solução: passar os tokens no hash da URL — o cliente Supabase do tenant
      // detecta automaticamente (detectSessionInUrl: true) e salva sob o key certo.
      const finalSlug = (result.slug ?? slug) as string
      const { access_token, refresh_token } = result.session as { access_token: string; refresh_token: string }
      const hash = `access_token=${access_token}&refresh_token=${refresh_token}&token_type=bearer&type=signup`

      const hostname = window.location.hostname
      const isLocal  = hostname === 'localhost' || hostname === '127.0.0.1'

      setTimeout(() => {
        if (isLocal) {
          const url = new URL(window.location.href)
          url.searchParams.set('tenant', finalSlug)
          url.pathname = '/onboarding'
          url.hash     = hash
          window.location.href = url.toString()
        } else {
          window.location.href = `https://${finalSlug}.${ROOT_DOMAIN}/onboarding#${hash}`
        }
      }, 800)

    } catch (err) {
      toast.error('Erro ao criar conta', err instanceof Error ? err.message : 'Tente novamente')
    } finally {
      setSubmitting(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', height: 34, paddingLeft: 32,
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 12,
    outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--t3)',
    textTransform: 'uppercase', letterSpacing: '.07em', display: 'block', marginBottom: 5,
  }

  if (needsEmailConfirm) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ background: 'rgba(13,13,13,.92)', border: '1px solid var(--bs)', borderRadius: 14, padding: 32 }}>
            <CheckCircle size={48} style={{ color: 'var(--neon)', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>Verifique seu email</h2>
            <p style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.7 }}>
              Enviamos um link de confirmação para seu email.<br />
              Após confirmar, acesse sua loja em:<br />
              <strong style={{ color: 'var(--neon)' }}>{slug}.{ROOT_DOMAIN}</strong>
            </p>
            <Link to="/login" style={{ display: 'inline-block', marginTop: 20, fontSize: 12, color: 'var(--neon)' }}>
              Ir para o login
            </Link>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 500, height: 500, background: 'rgba(61,247,16,.04)', borderRadius: '50%', filter: 'blur(100px)' }} />
      </div>

      {/* Particles */}
      {[...Array(14)].map((_, i) => (
        <motion.div key={i}
          animate={{ x: [Math.random() * 80 - 40, Math.random() * 80 - 40], y: [Math.random() * 80 - 40, Math.random() * 80 - 40], opacity: [0.08, 0.28, 0.08] }}
          transition={{ duration: 4 + Math.random() * 4, repeat: Infinity, repeatType: 'mirror', delay: Math.random() * 2 }}
          style={{ position: 'absolute', width: 3, height: 3, borderRadius: '50%', background: 'var(--neon)', opacity: .15, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
        />
      ))}

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 10 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, duration: 0.4 }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 14, background: 'var(--ng)', border: '1px solid var(--nb)', marginBottom: 12, boxShadow: '0 0 30px rgba(61,247,16,.15)' }}>
            <Car size={28} style={{ color: 'var(--neon)' }} />
          </motion.div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--neon)', letterSpacing: '.12em', textShadow: '0 0 20px rgba(61,247,16,.4)' }}>CRM AUTO</h1>
          <p style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '.25em', textTransform: 'uppercase', marginTop: 4 }}>Criar Nova Conta · 14 dias grátis</p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--card)', backdropFilter: 'blur(20px)', border: '1px solid var(--bs)', borderRadius: 14, padding: 28, boxShadow: '0 24px 48px rgba(0,0,0,.3)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>Cadastro da loja</h2>
          <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 20 }}>Crie sua conta e comece a vender mais</p>

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>

            {/* Nome completo */}
            <div>
              <label style={lbl}>Nome Completo</label>
              <div style={{ position: 'relative' }}>
                <User size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                <input {...register('full_name')} placeholder="Seu nome" style={inp}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
              </div>
              {errors.full_name && <p style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>{errors.full_name.message}</p>}
            </div>

            {/* Nome da loja */}
            <div>
              <label style={lbl}>Nome da Loja</label>
              <div style={{ position: 'relative' }}>
                <Building2 size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                <input {...register('store_name')} placeholder="Ex: Auto Premium SP" style={inp}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
              </div>
              {errors.store_name && <p style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>{errors.store_name.message}</p>}
            </div>

            {/* Endereço da loja (slug) */}
            <div>
              <label style={lbl}>Endereço da sua loja</label>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: 'var(--el)', border: `1px solid ${
                  slugStatus === 'available' ? 'var(--neon)' :
                  slugStatus === 'taken' || slugStatus === 'reserved' ? 'var(--red)' : 'var(--b)'
                }`,
                borderRadius: 7, overflow: 'hidden', height: 34, transition: 'border-color .15s',
              }}>
                <Globe size={12} style={{ marginLeft: 10, color: 'var(--t3)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={slug}
                  onChange={e => { setSlug(generateSlug(e.target.value)); setSlugEdited(true) }}
                  placeholder="minha-loja"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--t)', fontSize: 12, fontFamily: 'var(--fn)',
                    paddingLeft: 8, height: '100%',
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--t3)', paddingRight: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  .{ROOT_DOMAIN}
                </span>
                <div style={{ width: 20, marginRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {slugStatus === 'checking' && <Loader2 size={12} style={{ color: 'var(--t3)', animation: 'spin 1s linear infinite' }} />}
                  {slugStatus === 'available' && <Check size={12} style={{ color: 'var(--neon)' }} />}
                  {(slugStatus === 'taken' || slugStatus === 'reserved') && <X size={12} style={{ color: 'var(--red)' }} />}
                </div>
              </div>
              <p style={{
                fontSize: 10, marginTop: 4,
                color: slugStatus === 'available' ? 'var(--neon)' :
                  slugStatus === 'taken' ? 'var(--red)' :
                  slugStatus === 'reserved' ? 'var(--red)' : 'var(--t3)',
              }}>
                {slugStatus === 'available' && `✓ ${slug}.${ROOT_DOMAIN} está disponível!`}
                {slugStatus === 'taken'     && `✗ Este endereço já está em uso`}
                {slugStatus === 'reserved'  && `✗ Este endereço é reservado pelo sistema`}
                {slugStatus === 'idle' && slug.length > 0 && slug.length < 3 && 'Mínimo 3 caracteres'}
                {slugStatus === 'idle' && slug.length === 0 && 'Será o endereço exclusivo da sua loja'}
              </p>
            </div>

            {/* Email */}
            <Input label="Email" type="email" placeholder="dono@minha-loja.com.br" icon={<Mail size={13} />}
              error={errors.email?.message} {...register('email')} />

            {/* Senha */}
            <div>
              <label style={lbl}>Senha</label>
              <div style={{ position: 'relative' }}>
                <Lock size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                <input {...register('password')} type={showPwd ? 'text' : 'password'} placeholder="••••••••"
                  style={{ ...inp, paddingRight: 36 }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                  {showPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              {errors.password && <p style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>{errors.password.message}</p>}
            </div>

            {/* Confirmar senha */}
            <div>
              <label style={lbl}>Confirmar Senha</label>
              <div style={{ position: 'relative' }}>
                <Lock size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                <input {...register('confirm')} type={showPwd ? 'text' : 'password'} placeholder="••••••••"
                  style={inp}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
              </div>
              {errors.confirm && <p style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>{errors.confirm.message}</p>}
            </div>

            {/* Preview do endereço */}
            {slug && slugStatus === 'available' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                style={{
                  background: 'var(--ng)', border: '1px solid var(--nb)',
                  borderRadius: 8, padding: '10px 14px',
                }}>
                <p style={{ fontSize: 11, color: 'var(--t3)', margin: 0 }}>Sua loja ficará acessível em:</p>
                <p style={{ fontSize: 13, color: 'var(--neon)', fontWeight: 600, margin: '3px 0 0' }}>
                  {slug}.{ROOT_DOMAIN}
                </p>
              </motion.div>
            )}

            <Button type="submit" variant="primary" size="lg"
              loading={submitting}
              disabled={slugStatus !== 'available' || submitting}
              style={{ marginTop: 4 }}>
              {submitting ? 'Criando conta...' : 'Criar conta grátis →'}
            </Button>

            <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--t3)', lineHeight: 1.6 }}>
              14 dias grátis, sem cartão de crédito.<br />
              Ao criar, você concorda com os{' '}
              <Link to="/termos" style={{ color: 'var(--neon)', textDecoration: 'none' }}>Termos de Uso</Link>
              {' '}e a{' '}
              <Link to="/privacidade" style={{ color: 'var(--neon)', textDecoration: 'none' }}>Política de Privacidade</Link>.
            </p>
          </form>

          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--t3)', marginTop: 18 }}>
            Já tem conta?{' '}
            <Link to="/login" style={{ color: 'var(--neon)', textDecoration: 'none', fontWeight: 600 }}>
              Fazer login
            </Link>
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--t3)', marginTop: 16, opacity: .5 }}>
          CRM Automotivo Pro · {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  )
}
