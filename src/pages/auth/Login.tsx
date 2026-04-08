import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { Mail, Lock, Car, Eye, EyeOff } from 'lucide-react'
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

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

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
        // Fetch user profile
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
    <div className="min-h-screen bg-[#0A0A0A] grid-pattern flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] bg-[#39FF14]/3 rounded-full blur-[120px]" />
      </div>

      {/* Floating particles */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-[#39FF14]/20"
          animate={{
            x: [Math.random() * 100 - 50, Math.random() * 100 - 50],
            y: [Math.random() * 100 - 50, Math.random() * 100 - 50],
            opacity: [0.1, 0.4, 0.1],
          }}
          transition={{
            duration: 4 + Math.random() * 4,
            repeat: Infinity,
            repeatType: 'mirror',
            delay: Math.random() * 2,
          }}
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/30 mb-4 neon-glow"
          >
            <Car size={36} className="text-[#39FF14]" />
          </motion.div>
          <h1
            className="text-5xl text-[#39FF14] neon-text-glow tracking-widest"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            CRM AUTO
          </h1>
          <p className="text-[#555] text-sm tracking-[0.3em] uppercase mt-1">Professional</p>
        </div>

        {/* Form card */}
        <div className="glass rounded-2xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-1">Entrar na plataforma</h2>
          <p className="text-sm text-[#555] mb-6">Acesse com suas credenciais</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="seu@email.com"
              icon={<Mail size={14} />}
              error={errors.email?.message}
              {...register('email')}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#A0A0A0] uppercase tracking-wider">Senha</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]">
                  <Lock size={14} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full h-10 rounded-lg bg-[#1A1A1A] border border-[#222] text-white placeholder:text-[#555] pl-10 pr-10 text-sm transition-all duration-200 focus:outline-none focus:border-[#39FF14] focus:shadow-[0_0_0_3px_rgba(57,255,20,0.1)]"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#A0A0A0]"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <div className="flex justify-end">
              <button type="button" className="text-xs text-[#39FF14] hover:underline">
                Esqueci minha senha
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              loading={isSubmitting}
            >
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <p className="text-center text-xs text-[#555] mt-6">
            Problemas para acessar?{' '}
            <span className="text-[#39FF14] cursor-pointer hover:underline">Fale com o suporte</span>
          </p>
        </div>

        <p className="text-center text-xs text-[#333] mt-6">
          CRM Automotivo Pro v1.0 · {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  )
}
