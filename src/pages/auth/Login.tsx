import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Lock, Car, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { toast } from '@/components/ui/Toast'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
})

type FormData = z.infer<typeof schema>

export default function Login() {
  const navigate = useNavigate()
  const { user, setUser, setStore, setLoading } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSending, setForgotSending] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const handleForgotPassword = async () => {
    if (!forgotEmail) return
    setForgotSending(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: 'https://app.crmautomotivopro.com/reset-password',
      })
      if (error) throw error
      setForgotSent(true)
      toast.success('Email enviado!', 'Verifique sua caixa de entrada')
    } catch {
      toast.error('Erro ao enviar', 'Verifique o email e tente novamente')
    } finally {
      setForgotSending(false)
    }
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        toast.error('Erro ao entrar', error.message === 'Invalid login credentials'
          ? 'Email ou senha incorretos'
          : error.message
        )
        return
      }

      if (authData.user) {
        setLoading(true)
        const { data: profile } = await supabase
          .from('users')
          .select('*, stores(*)')
          .eq('id', authData.user.id)
          .single()

        if (profile) {
          setUser(profile as Parameters<typeof setUser>[0])
          if (profile.stores) setStore(profile.stores as Parameters<typeof setStore>[0])
          toast.success('Bem-vindo!', `Olá, ${profile.full_name?.split(' ')[0]}`)
          navigate('/dashboard', { replace: true })
        }
      }
    } catch {
      toast.error('Erro inesperado', 'Tente novamente em instantes')
    } finally {
      setIsSubmitting(false)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <div style={{
          width: 500, height: 500,
          background: 'rgba(61,247,16,.04)',
          borderRadius: '50%', filter: 'blur(100px)',
        }} />
      </div>

      {/* Floating particles */}
      {[...Array(18)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            x: [Math.random() * 80 - 40, Math.random() * 80 - 40],
            y: [Math.random() * 80 - 40, Math.random() * 80 - 40],
            opacity: [0.08, 0.3, 0.08],
          }}
          transition={{
            duration: 4 + Math.random() * 4,
            repeat: Infinity, repeatType: 'mirror',
            delay: Math.random() * 2,
          }}
          style={{
            position: 'absolute', width: 3, height: 3, borderRadius: '50%',
            background: 'var(--neon)', opacity: .15,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 10 }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 68, height: 68, borderRadius: 16,
              background: 'var(--ng)', border: '1px solid var(--nb)',
              marginBottom: 14,
              boxShadow: '0 0 30px rgba(61,247,16,.15)',
            }}
          >
            <Car size={30} style={{ color: 'var(--neon)' }} />
          </motion.div>
          <h1 style={{
            fontSize: 36, fontWeight: 800, color: 'var(--neon)',
            letterSpacing: '.12em', textShadow: '0 0 20px rgba(61,247,16,.4)',
            fontFamily: 'var(--fn)',
          }}>
            CRM AUTO
          </h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '.25em', textTransform: 'uppercase', marginTop: 4 }}>
            Professional
          </p>
        </div>

        {/* Form card */}
        <div style={{
          background: 'rgba(13,13,13,.92)', backdropFilter: 'blur(20px)',
          border: '1px solid var(--bs)', borderRadius: 14, padding: 28,
          boxShadow: '0 24px 48px rgba(0,0,0,.6)',
        }}>
          <AnimatePresence mode="wait">
            {isForgotPassword ? (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.22 }}
              >
                <button
                  type="button"
                  onClick={() => { setIsForgotPassword(false); setForgotSent(false); setForgotEmail('') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, color: 'var(--t3)', background: 'none', border: 'none',
                    cursor: 'pointer', marginBottom: 14, padding: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--t2)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
                >
                  <ArrowLeft size={11} /> Voltar ao login
                </button>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>Redefinir senha</h2>
                <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 20 }}>
                  Informe seu email e enviaremos um link para criar uma nova senha.
                </p>
                {forgotSent ? (
                  <div style={{
                    borderRadius: 8, background: 'var(--ng)', border: '1px solid var(--nb)',
                    padding: '14px 16px', fontSize: 12, color: 'var(--neon)', textAlign: 'center',
                  }}>
                    Email enviado para <strong>{forgotEmail}</strong>.<br />
                    Verifique sua caixa de entrada.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Input
                      label="Email"
                      type="email"
                      placeholder="seu@email.com"
                      icon={<Mail size={13} />}
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                    <Button variant="primary" size="lg" className="w-full" loading={forgotSending} onClick={handleForgotPassword}>
                      Enviar link de redefinição
                    </Button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.22 }}
              >
                <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>Entrar na plataforma</h2>
                <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 20 }}>Acesse com suas credenciais</p>

                <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Input
                    label="Email"
                    type="email"
                    placeholder="seu@email.com"
                    icon={<Mail size={13} />}
                    error={errors.email?.message}
                    {...register('email')}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{
                      fontSize: 10, fontWeight: 600, color: 'var(--t3)',
                      textTransform: 'uppercase', letterSpacing: '.07em',
                    }}>Senha</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }}>
                        <Lock size={13} />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        style={{
                          width: '100%', height: 34, paddingLeft: 32, paddingRight: 36,
                          background: 'var(--el)', border: `1px solid ${errors.password ? 'var(--red)' : 'var(--b)'}`,
                          borderRadius: 7, color: 'var(--t)', fontSize: 12,
                          outline: 'none', fontFamily: 'var(--fn)',
                          boxSizing: 'border-box',
                        }}
                        {...register('password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--t2)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
                      >
                        {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    {errors.password && <p style={{ fontSize: 10, color: 'var(--red)' }}>{errors.password.message}</p>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      style={{ fontSize: 11, color: 'var(--neon)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Esqueci minha senha
                    </button>
                  </div>

                  <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
                    {isSubmitting ? 'Entrando...' : 'Entrar'}
                  </Button>
                </form>

                <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--t3)', marginTop: 20 }}>
                  Problemas para acessar?{' '}
                  <span style={{ color: 'var(--neon)', cursor: 'pointer' }}>Fale com o suporte</span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--t3)', marginTop: 20, opacity: .5 }}>
          CRM Automotivo Pro v1.0 · {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  )
}
