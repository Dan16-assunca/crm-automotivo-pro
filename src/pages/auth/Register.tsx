import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Mail, Lock, User, Building2, Eye, EyeOff, Car, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'

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

export default function Register() {
  const navigate = useNavigate()
  const { setUser, setStore, setLoading } = useAuthStore()
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setSubmitting(true)
    try {
      // 1. Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email:    data.email,
        password: data.password,
        options:  { data: { full_name: data.full_name } },
      })
      if (authError) {
        const msg = authError.message.includes('already registered')
          ? 'Este email já está cadastrado. Faça login.'
          : authError.message
        toast.error('Erro no cadastro', msg)
        return
      }

      // Confirmação de email habilitada no Supabase
      if (!authData.session) {
        setNeedsEmailConfirm(true)
        return
      }

      setLoading(true)
      const userId = authData.user!.id

      // 2. Criar loja
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .insert({ name: data.store_name, plan: 'pro', active: true, settings: {} })
        .select()
        .single()

      if (storeError) throw new Error('Erro ao criar loja: ' + storeError.message)

      // 3. Criar perfil de usuário como admin
      const { data: userProfile, error: userError } = await supabase
        .from('users')
        .insert({
          id:        userId,
          store_id:  store.id,
          full_name: data.full_name,
          email:     data.email,
          role:      'admin',
          active:    true,
        })
        .select('*, stores(*)')
        .single()

      if (userError) throw new Error('Erro ao criar perfil: ' + userError.message)

      // 4. Criar etapas padrão do pipeline
      await supabase.rpc('create_default_stages', { p_store_id: store.id })

      // 5. Atualizar estado global e redirecionar
      setUser(userProfile as Parameters<typeof setUser>[0])
      setStore(userProfile.stores as Parameters<typeof setStore>[0])
      toast.success('Conta criada!', `Bem-vindo, ${data.full_name.split(' ')[0]}!`)
      navigate('/dashboard', { replace: true })

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tente novamente'
      toast.error('Erro ao criar conta', msg)
    } finally {
      setSubmitting(false)
      setLoading(false)
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
              Clique no link para ativar sua conta e depois faça login normalmente.
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
        style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 10 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, duration: 0.4 }}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 14, background: 'var(--ng)', border: '1px solid var(--nb)', marginBottom: 12, boxShadow: '0 0 30px rgba(61,247,16,.15)' }}>
            <Car size={28} style={{ color: 'var(--neon)' }} />
          </motion.div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--neon)', letterSpacing: '.12em', textShadow: '0 0 20px rgba(61,247,16,.4)' }}>CRM AUTO</h1>
          <p style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '.25em', textTransform: 'uppercase', marginTop: 4 }}>Criar Nova Conta</p>
        </div>

        {/* Card */}
        <div style={{ background: 'rgba(13,13,13,.92)', backdropFilter: 'blur(20px)', border: '1px solid var(--bs)', borderRadius: 14, padding: 28, boxShadow: '0 24px 48px rgba(0,0,0,.6)' }}>
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

            {/* Email */}
            <div>
              <Input label="Email" type="email" placeholder="seu@email.com" icon={<Mail size={13} />}
                error={errors.email?.message} {...register('email')} />
            </div>

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

            <Button type="submit" variant="primary" size="lg" loading={submitting} style={{ marginTop: 4 }}>
              {submitting ? 'Criando conta...' : 'Criar conta grátis'}
            </Button>
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
