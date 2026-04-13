import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, User, Car, Eye, EyeOff, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'

interface InviteData {
  id: string
  store_id: string
  email: string
  full_name: string | null
  role: string
  token: string
  stores: { name: string } | null
}

export default function InviteAccept() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { setUser, setStore, setLoading } = useAuthStore()
  const token = params.get('token') ?? ''

  const [invite, setInvite] = useState<InviteData | null>(null)
  const [loading, setLoadingState] = useState(true)
  const [invalid, setInvalid] = useState(false)

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setInvalid(true); setLoadingState(false); return }

    supabase
      .from('team_invites')
      .select('*, stores(name)')
      .eq('token', token)
      .is('accepted_at', null)
      .gte('expires_at', new Date().toISOString())
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setInvalid(true) }
        else { setInvite(data as InviteData); setFullName(data.full_name ?? '') }
        setLoadingState(false)
      })
  }, [token])

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador', manager: 'Gerente', salesperson: 'Vendedor',
  }

  const handleAccept = async () => {
    if (!invite) return
    if (!fullName.trim()) { toast.error('Nome obrigatório'); return }
    if (password.length < 6) { toast.error('Senha muito curta', 'Mínimo 6 caracteres'); return }
    if (password !== confirm) { toast.error('As senhas não coincidem'); return }

    setSubmitting(true)
    try {
      // 1. Criar conta no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: { data: { full_name: fullName } },
      })

      if (authError) {
        const msg = authError.message.includes('already registered')
          ? 'Este email já possui uma conta. Faça login normalmente.'
          : authError.message
        toast.error('Erro no cadastro', msg)
        return
      }

      if (!authData.session) {
        toast.error('Confirme seu email', 'Verifique sua caixa de entrada para ativar a conta.')
        return
      }

      setLoading(true)
      const userId = authData.user!.id

      // 2. Criar perfil do usuário vinculado à loja do convite
      const { data: userProfile, error: userError } = await supabase
        .from('users')
        .insert({
          id:        userId,
          store_id:  invite.store_id,
          full_name: fullName.trim(),
          email:     invite.email,
          role:      invite.role,
          active:    true,
        })
        .select('*, stores(*)')
        .single()

      if (userError) throw new Error('Erro ao criar perfil: ' + userError.message)

      // 3. Marcar convite como aceito
      await supabase
        .from('team_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('token', token)

      // 4. Atualizar estado global
      setUser(userProfile as Parameters<typeof setUser>[0])
      setStore(userProfile.stores as Parameters<typeof setStore>[0])

      toast.success('Bem-vindo!', `Conta criada com sucesso. Olá, ${fullName.split(' ')[0]}!`)
      navigate('/dashboard', { replace: true })

    } catch (err) {
      toast.error('Erro', err instanceof Error ? err.message : 'Tente novamente')
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
          <p style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '.25em', textTransform: 'uppercase', marginTop: 4 }}>Convite de Equipe</p>
        </div>

        <div style={{ background: 'rgba(13,13,13,.92)', backdropFilter: 'blur(20px)', border: '1px solid var(--bs)', borderRadius: 14, padding: 28, boxShadow: '0 24px 48px rgba(0,0,0,.6)' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <div style={{ width: 24, height: 24, border: '2px solid var(--neon)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : invalid ? (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <XCircle size={44} style={{ color: 'var(--red)', margin: '0 auto' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>Convite inválido</h2>
              <p style={{ fontSize: 12, color: 'var(--t3)' }}>
                Este link de convite não existe, já foi usado ou expirou.
              </p>
              <Link to="/login" style={{ fontSize: 12, color: 'var(--neon)', textDecoration: 'none', marginTop: 8 }}>
                Ir para o login
              </Link>
            </div>
          ) : invite ? (
            <>
              {/* Invite info banner */}
              <div style={{ background: 'var(--ng)', border: '1px solid var(--nb)', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
                <p style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Você foi convidado para</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--neon)' }}>{invite.stores?.name ?? 'Loja'}</p>
                <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                  Cargo: <span style={{ color: 'var(--t2)', fontWeight: 600 }}>{ROLE_LABELS[invite.role] ?? invite.role}</span>
                  {' · '}Email: <span style={{ color: 'var(--t2)' }}>{invite.email}</span>
                </p>
              </div>

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

                {/* Confirmar senha */}
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

                <Button variant="primary" size="lg" loading={submitting} onClick={handleAccept} style={{ marginTop: 4 }}>
                  {submitting ? 'Criando conta...' : 'Aceitar convite e entrar'}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </motion.div>
    </div>
  )
}
