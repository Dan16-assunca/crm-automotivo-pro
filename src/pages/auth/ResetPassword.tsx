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

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) { toast.error('Senha muito curta', 'Mínimo de 6 caracteres'); return }
    if (password !== confirm) { toast.error('Senhas não coincidem', 'Verifique e tente novamente'); return }
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

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 34, paddingLeft: 32, paddingRight: 36,
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 12,
    outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, position: 'relative',
    }}>
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

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 10 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 14,
            background: 'var(--ng)', border: '1px solid var(--nb)',
            marginBottom: 12, boxShadow: '0 0 24px rgba(61,247,16,.15)',
          }}>
            <Car size={28} style={{ color: 'var(--neon)' }} />
          </div>
          <h1 style={{
            fontSize: 32, fontWeight: 800, color: 'var(--neon)',
            letterSpacing: '.12em', textShadow: '0 0 20px rgba(61,247,16,.4)',
          }}>CRM AUTO</h1>
          <p style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '.25em', textTransform: 'uppercase', marginTop: 4 }}>
            Professional
          </p>
        </div>

        <div style={{
          background: 'rgba(13,13,13,.92)', backdropFilter: 'blur(20px)',
          border: '1px solid var(--bs)', borderRadius: 14, padding: 24,
          boxShadow: '0 24px 48px rgba(0,0,0,.6)',
        }}>
          {done ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <CheckCircle size={44} style={{ color: 'var(--neon)', margin: '0 auto' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>Senha redefinida!</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)' }}>Redirecionando para o login...</p>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>Nova senha</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 18 }}>
                {ready ? 'Crie uma nova senha para sua conta.' : 'Processando link de redefinição...'}
              </p>

              {ready && (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Nova Senha</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }}>
                        <Lock size={12} />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                      >
                        {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Confirmar Senha</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }}>
                        <Lock size={12} />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        style={inputStyle}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
                      />
                    </div>
                  </div>

                  <Button type="submit" variant="primary" size="lg" className="w-full" loading={isSubmitting}>
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
