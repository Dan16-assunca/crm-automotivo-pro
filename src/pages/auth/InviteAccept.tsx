import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, User, Car, Eye, EyeOff, XCircle, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'

type PageState = 'loading' | 'set-password' | 'invalid' | 'done'

export default function InviteAccept() {
  const navigate = useNavigate()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [fullName, setFullName]   = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // When Supabase sends the invite email, the magic link redirects here.
  // The Supabase client automatically picks up the access_token from the URL hash
  // and fires onAuthStateChange. We just need to wait for a valid session.
  useEffect(() => {
    const check = async () => {
      // Give Supabase a tick to process the URL hash tokens
      await new Promise(r => setTimeout(r, 500))

      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        setPageState('invalid')
        return
      }

      // Pre-fill name from user_metadata if the admin set it during invite
      const metaName = session.user.user_metadata?.full_name as string | undefined
      if (metaName) setFullName(metaName)

      setPageState('set-password')
    }

    check()
  }, [])

  const handleSubmit = async () => {
    if (!fullName.trim()) { toast.error('Nome obrigatório'); return }
    if (password.length < 6) { toast.error('Senha muito curta', 'Mínimo 6 caracteres'); return }
    if (password !== confirm) { toast.error('As senhas não coincidem'); return }

    setSubmitting(true)
    try {
      // 1. Set password and update display name in Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName.trim() },
      })
      if (updateErr) throw new Error(updateErr.message)

      // 2. Update full_name in the users table (Edge Function may have used a placeholder)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('users')
          .update({ full_name: fullName.trim() })
          .eq('id', user.id)

        // 3. Mark invite as accepted (best-effort, non-critical)
        await supabase
          .from('team_invites')
          .update({ accepted_at: new Date().toISOString() })
          .eq('email', user.email!)
          .is('accepted_at', null)
      }

      setPageState('done')
      toast.success('Conta ativada!', `Bem-vindo, ${fullName.split(' ')[0]}!`)

      setTimeout(() => navigate('/dashboard', { replace: true }), 1500)

    } catch (err) {
      toast.error('Erro', err instanceof Error ? err.message : 'Tente novamente')
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

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: 500, height: 500, background: 'rgba(61,247,16,.04)', borderRadius: '50%', filter: 'blur(100px)' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 10 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 14, background: 'var(--ng)', border: '1px solid var(--nb)', marginBottom: 12, boxShadow: '0 0 30px rgba(61,247,16,.15)' }}>
            <Car size={28} style={{ color: 'var(--neon)' }} />
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--neon)', letterSpacing: '.12em', textShadow: '0 0 20px rgba(61,247,16,.4)' }}>CRM AUTO</h1>
          <p style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '.25em', textTransform: 'uppercase', marginTop: 4 }}>Ativar Conta</p>
        </div>

        <div style={{ background: 'rgba(13,13,13,.92)', backdropFilter: 'blur(20px)', border: '1px solid var(--bs)', borderRadius: 14, padding: 28, boxShadow: '0 24px 48px rgba(0,0,0,.6)' }}>

          {pageState === 'loading' && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <div style={{ width: 24, height: 24, border: '2px solid var(--neon)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {pageState === 'invalid' && (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <XCircle size={44} style={{ color: 'var(--red)', margin: '0 auto' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>Link inválido ou expirado</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)' }}>
                Este link de convite não é mais válido. Peça ao administrador que envie um novo convite.
              </p>
              <Link to="/login" style={{ fontSize: 12, color: 'var(--neon)', textDecoration: 'none', marginTop: 8 }}>
                Ir para o login
              </Link>
            </div>
          )}

          {pageState === 'done' && (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <CheckCircle size={44} style={{ color: 'var(--neon)', margin: '0 auto' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>Conta ativada!</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)' }}>Redirecionando para o painel...</p>
            </div>
          )}

          {pageState === 'set-password' && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>Bem-vindo à equipe!</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 20 }}>
                Confirme seu nome e crie uma senha para acessar o sistema.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {/* Nome */}
                <div>
                  <label style={lbl}>Seu Nome</label>
                  <div style={{ position: 'relative' }}>
                    <User size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                    <input type="text" placeholder="Seu nome completo" value={fullName}
                      onChange={e => setFullName(e.target.value)} style={inp}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
                  </div>
                </div>

                {/* Senha */}
                <div>
                  <label style={lbl}>Criar Senha</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                    <input type={showPwd ? 'text' : 'password'} placeholder="••••••••" value={password}
                      onChange={e => setPassword(e.target.value)} style={{ ...inp, paddingRight: 36 }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                      {showPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                </div>

                {/* Confirmar */}
                <div>
                  <label style={lbl}>Confirmar Senha</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                    <input type={showPwd ? 'text' : 'password'} placeholder="••••••••" value={confirm}
                      onChange={e => setConfirm(e.target.value)} style={inp}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
                  </div>
                </div>

                <Button variant="primary" size="lg" loading={submitting} onClick={handleSubmit} style={{ marginTop: 4 }}>
                  {submitting ? 'Ativando conta...' : 'Ativar conta e entrar'}
                </Button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
