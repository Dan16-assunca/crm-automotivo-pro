import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, Trash2, UserCog, Clock, MailCheck, MessageCircle, Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toast'
import type { User } from '@/types'

// ─── tipos ────────────────────────────────────────────────────────────────────
interface TeamInvite {
  id: string
  store_id: string
  email: string
  full_name: string | null
  role: string
  token: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', manager: 'Gerente', salesperson: 'Vendedor',
}
const ROLE_VARIANTS: Record<string, 'neon' | 'info' | 'default'> = {
  admin: 'neon', manager: 'info', salesperson: 'default',
}

// ─── Constantes da API ────────────────────────────────────────────────────────
const SUPA_URL  = (import.meta.env.VITE_SUPABASE_URL  as string | undefined) ?? 'https://eakdywmuewvuzyqfpcpl.supabase.co'
const SUPA_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVha2R5d211ZXd2dXp5cWZwY3BsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MjQ5MTgsImV4cCI6MjA5MDMwMDkxOH0.EeUINhQUomMKqhfkjGnkDpO3aO5NZ4Yqd15qof-mB20'

// ─── Modal de adicionar membro ────────────────────────────────────────────────
type AddMode = 'invite' | 'password'

interface InviteModalProps {
  onClose: () => void
  onSuccess: () => void
}
function InviteModal({ onClose, onSuccess }: InviteModalProps) {
  const [mode, setMode] = useState<AddMode>('password')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'manager' | 'salesperson'>('salesperson')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const inp: React.CSSProperties = {
    width: '100%', height: 34, padding: '0 11px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 12,
    outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--t3)',
    textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5,
  }

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  }

  const handleInvite = async () => {
    if (!email.trim() || !email.includes('@')) { toast.error('Email inválido'); return }
    setSubmitting(true)
    try {
      const session = await getSession()
      if (!session) { toast.error('Sessão expirada', 'Faça login novamente'); return }
      const res = await fetch(`${SUPA_URL}/functions/v1/invite-team-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPA_ANON },
        body: JSON.stringify({ email: email.trim().toLowerCase(), full_name: name.trim() || null, role }),
      })
      const result = await res.json()
      if (!res.ok || result.error) { toast.error('Erro ao enviar convite', result.error ?? 'Tente novamente'); return }
      toast.success('Convite enviado!', `Email de convite enviado para ${email.trim().toLowerCase()}`)
      onSuccess()
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateWithPassword = async () => {
    if (!name.trim())  { toast.error('Nome obrigatório'); return }
    if (!email.trim() || !email.includes('@')) { toast.error('Email inválido'); return }
    if (password.length < 6) { toast.error('Senha muito curta', 'Mínimo 6 caracteres'); return }
    if (password !== confirmPwd) { toast.error('As senhas não coincidem'); return }
    setSubmitting(true)
    try {
      const session = await getSession()
      if (!session) { toast.error('Sessão expirada', 'Faça login novamente'); return }
      const res = await fetch(`${SUPA_URL}/functions/v1/create-team-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPA_ANON },
        body: JSON.stringify({ email: email.trim().toLowerCase(), full_name: name.trim(), role, password }),
      })
      const result = await res.json()
      if (!res.ok || result.error) { toast.error('Erro ao criar conta', result.error ?? 'Tente novamente'); return }
      toast.success('Conta criada!', `${name.trim()} já pode fazer login com o email e senha definidos`)
      onSuccess()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--bs)',
        borderRadius: 14, padding: 24, width: '100%', maxWidth: 440,
        boxShadow: '0 24px 48px rgba(0,0,0,.6)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>Adicionar Vendedor</h2>
          <button onClick={onClose} style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, minHeight: 'unset' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--el)', borderRadius: 9, padding: 4 }}>
          {([
            { id: 'password' as AddMode, label: '🔐 Criar com senha', desc: 'Login imediato' },
            { id: 'invite'   as AddMode, label: '✉️ Convidar por email', desc: 'Link por email' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 6, cursor: 'pointer',
                background: mode === tab.id ? 'var(--card)' : 'transparent',
                border: mode === tab.id ? '1px solid var(--neon-card)' : '1px solid transparent',
                color: mode === tab.id ? 'var(--t)' : 'var(--t3)',
                fontSize: 11, fontWeight: mode === tab.id ? 700 : 500,
                transition: 'all .15s', textAlign: 'center', minHeight: 'unset',
              }}
            >
              {tab.label}
              <p style={{ fontSize: 9, color: mode === tab.id ? 'var(--neon)' : 'var(--t3)', margin: '2px 0 0', fontWeight: 400 }}>
                {tab.desc}
              </p>
            </button>
          ))}
        </div>

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'password' && (
            <div style={{
              background: 'var(--ng)', border: '1px solid var(--nb)',
              borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'var(--t2)',
              lineHeight: 1.5,
            }}>
              O vendedor receberá o email e senha para fazer login imediatamente — sem precisar confirmar por email.
            </div>
          )}

          <div>
            <label style={lbl}>Nome {mode === 'password' ? '*' : '(opcional)'}</label>
            <input type="text" placeholder="Ex: João Silva" value={name}
              onChange={e => setName(e.target.value)} style={inp}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
          </div>

          <div>
            <label style={lbl}>Email *</label>
            <input type="email" placeholder="email@exemplo.com" value={email}
              onChange={e => setEmail(e.target.value)} style={inp}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
          </div>

          <div>
            <label style={lbl}>Cargo</label>
            <select value={role} onChange={e => setRole(e.target.value as 'manager' | 'salesperson')}
              style={{ ...inp, cursor: 'pointer' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}>
              <option value="salesperson">Vendedor</option>
              <option value="manager">Gerente</option>
            </select>
          </div>

          {mode === 'password' && (
            <>
              <div>
                <label style={lbl}>Senha *</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ ...inp, paddingLeft: 28, paddingRight: 32 }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
                  />
                  <button
                    type="button" onClick={() => setShowPwd(v => !v)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', minHeight: 'unset', padding: 2 }}
                  >
                    {showPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
              <div>
                <label style={lbl}>Confirmar Senha *</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Repita a senha"
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    style={{ ...inp, paddingLeft: 28 }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
                  />
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button variant="secondary" size="sm" onClick={onClose} style={{ flex: 1 }}>Cancelar</Button>
            <Button
              variant="primary" size="sm" loading={submitting}
              onClick={mode === 'password' ? handleCreateWithPassword : handleInvite}
              style={{ flex: 2 }}
            >
              {mode === 'password' ? 'Criar conta' : 'Enviar convite'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Card de convite pendente ─────────────────────────────────────────────────
function InviteCard({ invite, onDelete }: { invite: TeamInvite; onDelete: (id: string) => void }) {
  const isExpired = new Date(invite.expires_at) < new Date()

  const expiresIn = () => {
    const diff = new Date(invite.expires_at).getTime() - Date.now()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    return days > 0 ? `Expira em ${days}d` : 'Expirado'
  }

  return (
    <div style={{
      background: 'var(--card)', border: `1px solid ${isExpired ? 'var(--red)' : 'var(--bs)'}`,
      borderRadius: 9, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 12, opacity: isExpired ? 0.6 : 1,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 9, flexShrink: 0,
        background: 'var(--el)', border: '1px solid var(--b)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MailCheck size={16} style={{ color: 'var(--t3)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {invite.full_name || invite.email}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <p style={{ fontSize: 10, color: 'var(--t3)' }}>{invite.email}</p>
          <Badge variant={ROLE_VARIANTS[invite.role] ?? 'default'} style={{ fontSize: 8 }}>{ROLE_LABELS[invite.role] ?? invite.role}</Badge>
          <span style={{ fontSize: 9, color: isExpired ? 'var(--red)' : 'var(--yel)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} /> {expiresIn()}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Check size={11} style={{ color: 'var(--neon)' }} /> Email enviado
        </span>
        <button onClick={() => onDelete(invite.id)}
          style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'transparent', border: '1px solid var(--b)', color: 'var(--t3)', cursor: 'pointer', transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b)'; e.currentTarget.style.color = 'var(--t3)' }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Team() {
  const { store, user } = useAuthStore()
  const { isAdmin, isManager } = usePermissions()
  const queryClient = useQueryClient()
  const [showInviteModal, setShowInviteModal] = useState(false)

  // Membros ativos
  const { data: members, isLoading: loadingMembers } = useQuery({
    queryKey: ['team', store?.id],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('*').eq('store_id', store!.id).order('role').order('full_name')
      return (data ?? []) as User[]
    },
    enabled: !!store?.id,
  })

  // Convites pendentes (não aceitos)
  const { data: invites, isLoading: loadingInvites } = useQuery({
    queryKey: ['team-invites', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_invites')
        .select('*')
        .eq('store_id', store!.id)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
      return (data ?? []) as TeamInvite[]
    },
    enabled: !!store?.id && isManager,
  })

  // Alterar role
  const changeRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await supabase.from('users').update({ role }).eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', store?.id] })
      toast.success('Cargo atualizado')
    },
    onError: () => toast.error('Erro ao alterar cargo'),
  })

  // Salvar whatsapp_number
  const saveWhatsappMutation = useMutation({
    mutationFn: async ({ memberId, whatsapp_number }: { memberId: string; whatsapp_number: string }) => {
      const { error } = await supabase.from('users').update({ whatsapp_number: whatsapp_number || null }).eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', store?.id] })
      toast.success('WhatsApp salvo')
    },
    onError: () => toast.error('Erro ao salvar WhatsApp'),
  })

  // Desativar membro
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ memberId, active }: { memberId: string; active: boolean }) => {
      const { error } = await supabase.from('users').update({ active }).eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', store?.id] })
      toast.success('Membro atualizado')
    },
    onError: () => toast.error('Erro ao atualizar membro'),
  })

  // Excluir convite
  const deleteInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from('team_invites').delete().eq('id', inviteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites', store?.id] })
      toast.success('Convite removido')
    },
  })

  const handleInviteSuccess = () => {
    setShowInviteModal(false)
    queryClient.invalidateQueries({ queryKey: ['team-invites', store?.id] })
    queryClient.invalidateQueries({ queryKey: ['team', store?.id] })
  }

  const pendingInvites = invites?.filter(i => new Date(i.expires_at) > new Date()) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Equipe</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
            {members?.length ?? 0} membro{(members?.length ?? 0) !== 1 ? 's' : ''}
            {pendingInvites.length > 0 && ` · ${pendingInvites.length} convite${pendingInvites.length > 1 ? 's' : ''} pendente${pendingInvites.length > 1 ? 's' : ''}`}
          </p>
        </div>
        {isManager && (
          <Button size="sm" onClick={() => setShowInviteModal(true)}>
            <Plus size={13} /> Convidar Membro
          </Button>
        )}
      </div>

      {/* Membros */}
      <div>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Membros Ativos</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {loadingMembers ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} style={{ height: 130, borderRadius: 9 }} />)
          ) : members?.map(member => (
            <MemberCard
              key={member.id}
              member={member}
              isCurrentUser={member.id === user?.id}
              canManage={isAdmin && member.id !== user?.id}
              canEditOwn={member.id === user?.id}
              onChangeRole={(role) => changeRoleMutation.mutate({ memberId: member.id, role })}
              onToggleActive={(active) => toggleActiveMutation.mutate({ memberId: member.id, active })}
              onSaveWhatsapp={async (memberId, whatsapp_number) =>
                saveWhatsappMutation.mutateAsync({ memberId, whatsapp_number })
              }
            />
          ))}
        </div>
      </div>

      {/* Convites pendentes */}
      {isManager && (
        <div>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
            Convites Pendentes {pendingInvites.length > 0 && `(${pendingInvites.length})`}
          </h2>
          {loadingInvites ? (
            <Skeleton style={{ height: 60, borderRadius: 9 }} />
          ) : pendingInvites.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--t3)' }}>Nenhum convite pendente.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingInvites.map(inv => (
                <InviteCard key={inv.id} invite={inv} onDelete={id => deleteInviteMutation.mutate(id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de convite */}
      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={handleInviteSuccess}
        />
      )}
    </div>
  )
}

// ─── Card de membro ───────────────────────────────────────────────────────────
function MemberCard({
  member, isCurrentUser, canManage, canEditOwn, onChangeRole, onToggleActive, onSaveWhatsapp,
}: {
  member: User
  isCurrentUser: boolean
  canManage: boolean
  canEditOwn: boolean
  onChangeRole: (role: string) => void
  onToggleActive: (active: boolean) => void
  onSaveWhatsapp: (memberId: string, number: string) => Promise<void>
}) {
  const [editRole, setEditRole] = useState(false)
  const [editWa, setEditWa] = useState(false)
  const [waVal, setWaVal] = useState(member.whatsapp_number ?? '')
  const [savingWa, setSavingWa] = useState(false)

  const handleSaveWa = async () => {
    setSavingWa(true)
    try {
      await onSaveWhatsapp(member.id, waVal.trim())
      setEditWa(false)
    } finally {
      setSavingWa(false)
    }
  }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9,
      padding: '16px 18px', transition: 'border-color .15s',
      opacity: member.active ? 1 : 0.5,
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bs)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: 'var(--ng)', border: '1px solid var(--nb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, color: 'var(--neon)',
        }}>
          {member.full_name.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.full_name}</p>
            {isCurrentUser && <span style={{ fontSize: 9, color: 'var(--neon)', background: 'var(--ng)', border: '1px solid var(--nb)', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>Você</span>}
          </div>
          {editRole && canManage ? (
            <select
              defaultValue={member.role}
              onChange={e => { onChangeRole(e.target.value); setEditRole(false) }}
              onBlur={() => setEditRole(false)}
              autoFocus
              style={{ fontSize: 10, color: 'var(--t)', background: 'var(--el)', border: '1px solid var(--nb)', borderRadius: 5, padding: '2px 6px', outline: 'none', marginTop: 3 }}
            >
              <option value="salesperson">Vendedor</option>
              <option value="manager">Gerente</option>
              <option value="admin">Admin</option>
            </select>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
              <Badge variant={ROLE_VARIANTS[member.role] ?? 'default'}>
                {ROLE_LABELS[member.role] ?? member.role}
              </Badge>
              {canManage && (
                <button onClick={() => setEditRole(true)}
                  style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                  title="Alterar cargo">
                  <UserCog size={11} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>
        <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.email}</p>
        {member.phone && <p>{member.phone}</p>}

        {/* WhatsApp pessoal */}
        {editWa ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <input
              autoFocus
              type="text"
              placeholder="5511999999999"
              value={waVal}
              onChange={e => setWaVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveWa()
                if (e.key === 'Escape') setEditWa(false)
              }}
              style={{
                flex: 1, height: 26, padding: '0 7px',
                background: 'var(--el)', border: '1px solid var(--nb)',
                borderRadius: 5, color: 'var(--t)', fontSize: 10,
                outline: 'none', fontFamily: 'var(--fn)', minWidth: 0,
              }}
            />
            <button
              onClick={handleSaveWa}
              disabled={savingWa}
              style={{ padding: '3px 7px', borderRadius: 5, border: 'none', background: 'var(--neon)', color: '#000', fontSize: 9, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
            >
              {savingWa ? '…' : 'OK'}
            </button>
            <button
              onClick={() => setEditWa(false)}
              style={{ padding: '3px 5px', borderRadius: 5, border: '1px solid var(--bs)', background: 'transparent', color: 'var(--t3)', fontSize: 9, cursor: 'pointer', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => (canManage || canEditOwn) ? setEditWa(true) : undefined}
            style={{
              background: 'none', border: 'none', padding: 0,
              cursor: (canManage || canEditOwn) ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 4, marginTop: 1,
              textAlign: 'left',
            }}
            title={(canManage || canEditOwn) ? 'Clique para editar o WhatsApp' : undefined}
          >
            <MessageCircle size={10} style={{ color: member.whatsapp_number ? '#25d366' : 'var(--t3)', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: member.whatsapp_number ? 'var(--t2)' : 'var(--t3)', fontStyle: member.whatsapp_number ? 'normal' : 'italic' }}>
              {member.whatsapp_number
                ? `+${member.whatsapp_number.replace(/\D/g, '')}`
                : (canManage || canEditOwn) ? 'Adicionar WhatsApp' : 'Sem WhatsApp'}
            </span>
            {(canManage || canEditOwn) && <span style={{ fontSize: 8, color: 'var(--nb)', opacity: 0.6 }}>✏️</span>}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Badge variant={member.active ? 'success' : 'default'} dot>
          {member.active ? 'Ativo' : 'Inativo'}
        </Badge>
        {canManage && !isCurrentUser && (
          <button
            onClick={() => onToggleActive(!member.active)}
            style={{ fontSize: 10, color: member.active ? 'var(--red)' : 'var(--neon)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {member.active ? 'Desativar' : 'Reativar'}
          </button>
        )}
      </div>
    </div>
  )
}

