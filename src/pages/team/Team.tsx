import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Check, Trash2, UserCog, Clock, MailCheck, ShieldAlert } from 'lucide-react'
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

// ─── Modal de convite ─────────────────────────────────────────────────────────
interface InviteModalProps {
  storeId: string
  invitedBy: string
  onClose: () => void
  onCreated: (invite: TeamInvite) => void
}
function InviteModal({ storeId, invitedBy, onClose, onCreated }: InviteModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'manager' | 'salesperson'>('salesperson')
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

  const handleSubmit = async () => {
    if (!email.trim() || !email.includes('@')) { toast.error('Email inválido'); return }

    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('team_invites')
        .insert({
          store_id:   storeId,
          email:      email.trim().toLowerCase(),
          full_name:  name.trim() || null,
          role,
          invited_by: invitedBy,
        })
        .select()
        .single()

      if (error) {
        toast.error('Erro ao criar convite', error.message)
        return
      }
      toast.success('Convite criado!', 'Compartilhe o link com o novo membro')
      onCreated(data as TeamInvite)
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
        borderRadius: 14, padding: 24, width: '100%', maxWidth: 420,
        boxShadow: '0 24px 48px rgba(0,0,0,.6)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>Convidar Membro</h2>
          <button onClick={onClose} style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Nome (opcional)</label>
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

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button variant="secondary" size="sm" onClick={onClose} style={{ flex: 1 }}>Cancelar</Button>
            <Button variant="primary" size="sm" loading={submitting} onClick={handleSubmit} style={{ flex: 1 }}>
              Gerar link de convite
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Card de convite pendente ─────────────────────────────────────────────────
function InviteCard({ invite, onDelete }: { invite: TeamInvite; onDelete: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/convite?token=${invite.token}`
  const isExpired = new Date(invite.expires_at) < new Date()

  const handleCopy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

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
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={handleCopy}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, background: copied ? 'var(--ng)' : 'var(--el)', border: `1px solid ${copied ? 'var(--nb)' : 'var(--b)'}`, color: copied ? 'var(--neon)' : 'var(--t2)', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all .15s' }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copiado!' : 'Copiar link'}
        </button>
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
  const [createdInvite, setCreatedInvite] = useState<TeamInvite | null>(null)

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

  const handleInviteCreated = (invite: TeamInvite) => {
    setShowInviteModal(false)
    setCreatedInvite(invite)
    queryClient.invalidateQueries({ queryKey: ['team-invites', store?.id] })
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
        {isAdmin && (
          <Button size="sm" onClick={() => setShowInviteModal(true)}>
            <Plus size={13} /> Convidar Membro
          </Button>
        )}
      </div>

      {/* Banner de link criado */}
      {createdInvite && (
        <InviteLinkBanner invite={createdInvite} onClose={() => setCreatedInvite(null)} />
      )}

      {/* Aviso para gerente (sem permissão de convidar) */}
      {isManager && !isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(234,179,8,.06)', border: '1px solid rgba(234,179,8,.2)', borderRadius: 8, fontSize: 12, color: 'var(--yel)' }}>
          <ShieldAlert size={14} />
          Você pode visualizar a equipe. Apenas o admin pode convidar ou alterar membros.
        </div>
      )}

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
              onChangeRole={(role) => changeRoleMutation.mutate({ memberId: member.id, role })}
              onToggleActive={(active) => toggleActiveMutation.mutate({ memberId: member.id, active })}
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
      {showInviteModal && store && user && (
        <InviteModal
          storeId={store.id}
          invitedBy={user.id}
          onClose={() => setShowInviteModal(false)}
          onCreated={handleInviteCreated}
        />
      )}
    </div>
  )
}

// ─── Card de membro ───────────────────────────────────────────────────────────
function MemberCard({
  member, isCurrentUser, canManage, onChangeRole, onToggleActive,
}: {
  member: User
  isCurrentUser: boolean
  canManage: boolean
  onChangeRole: (role: string) => void
  onToggleActive: (active: boolean) => void
}) {
  const [editRole, setEditRole] = useState(false)

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

// ─── Banner após criação de convite ──────────────────────────────────────────
function InviteLinkBanner({ invite, onClose }: { invite: TeamInvite; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/convite?token=${invite.token}`

  const handleCopy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      background: 'var(--ng)', border: '1px solid var(--nb)',
      borderRadius: 9, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--neon)', marginBottom: 4 }}>
            Convite criado! Compartilhe o link abaixo com {invite.full_name || invite.email}:
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{
              flex: 1, fontSize: 10, background: 'var(--el)', border: '1px solid var(--b)',
              borderRadius: 6, padding: '6px 10px', color: 'var(--t2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
            }}>{link}</code>
            <button onClick={handleCopy}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, background: copied ? 'var(--neon)' : 'var(--el)', border: `1px solid ${copied ? 'var(--neon)' : 'var(--b)'}`, color: copied ? '#000' : 'var(--t2)', cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0, transition: 'all .15s' }}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6 }}>
            O link expira em 7 dias. Você pode compartilhá-lo via WhatsApp ou email.
          </p>
        </div>
        <button onClick={onClose} style={{ color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
    </div>
  )
}
