import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Car, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)

  // Supabase popula a sessão a partir do hash da URL automaticamente
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    // Verifica se já tem sessão ativa (token já processado)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('Senha muito curta', 'Mínimo de 6 caracteres')
      return
    }
    if (password !== confirm) {
      toast.error('Senhas não coincidem', 'Verifique e tente novamente')
      return
    }
    setIsSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      toast.success('Senha redefinida!', 'Você já pode entrar com a nova senha')
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } catch {
      toast.error('Erro ao redefinir', 'O link pode ter expirado. Solicite um novo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] bg-[#39FF14]/3 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/30 mb-4">
            <Car size={36} className="text-[#39FF14]" />
          </div>
          <h1
            className="text-5xl text-[#39FF14] neon-text-glow tracking-widest"
            style={{ fontFamily: 'Bebas Neue, sans-serif' }}
          >
            CRM AUTO
          </h1>
          <p className="text-[#555] text-sm tracking-[0.3em] uppercase mt-1">Professional</p>
        </div>

        <div className="glass rounded-2xl p-8 shadow-2xl">
          {done ? (
            <div className="text-center space-y-4">
              <CheckCircle size={48} className="text-[#39FF14] mx-auto" />
              <h2 className="text-xl font-semibold text-white">Senha redefinida!</h2>
              <p className="text-sm text-[#555]">Redirecionando para o login...</p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-1">Nova senha</h2>
              <p className="text-sm text-[#555] mb-6">
                {ready ? 'Crie uma nova senha para sua conta.' : 'Processando link de redefinição...'}
              </p>

              {ready && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[#A0A0A0] uppercase tracking-wider">Nova Senha</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]">
                        <Lock size={14} />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-10 rounded-lg bg-[#1A1A1A] border border-[#222] text-white placeholder:text-[#555] pl-10 pr-10 text-sm transition-all duration-200 focus:outline-none focus:border-[#39FF14] focus:shadow-[0_0_0_3px_rgba(57,255,20,0.1)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#A0A0A0]"
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[#A0A0A0] uppercase tracking-wider">Confirmar Senha</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]">
                        <Lock size={14} />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full h-10 rounded-lg bg-[#1A1A1A] border border-[#222] text-white placeholder:text-[#555] pl-10 pr-10 text-sm transition-all duration-200 focus:outline-none focus:border-[#39FF14] focus:shadow-[0_0_0_3px_rgba(57,255,20,0.1)]"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full mt-2"
                    loading={isSubmitting}
                  >
                    Redefinir senha
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
