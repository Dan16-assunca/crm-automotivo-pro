import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Save, Loader2, Lock, Eye, EyeOff,
  QrCode, LogOut, RefreshCw, Plus, Trash2,
  CheckCircle2, XCircle, Wifi, WifiOff, Smartphone,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { evolutionApi, generateInstanceName } from '@/services/whatsapp'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface WaInstance {
  id: string
  instance_name: string
  label: string | null
  phone_number: string | null
  status: string
  profile_pic_url: string | null
  connected_at: string | null
}

const WEBHOOK_URL = 'https://eakdywmuewvuzyqfpcpl.supabase.co/functions/v1/whatsapp-webhook'
const QR_TTL = 45

// ─── Seção WhatsApp (self-contained) ─────────────────────────────────────────

function WhatsAppSection() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const [adding, setAdding]         = useState(false)
  const [qrBase64, setQrBase64]     = useState<string | null>(null)
  const [qrSecs, setQrSecs]         = useState(QR_TTL)
  const [loadingQr, setLoadingQr]   = useState(false)
  const [syncing, setSyncing]       = useState(false)
  const [currentInst, setCurrentInst] = useState<string | null>(null)

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAll = useCallback(() => {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  useEffect(() => () => stopAll(), [stopAll])

  // Carrega instâncias do banco
  const { data: instances = [], isLoading, refetch } = useQuery<WaInstance[]>({
    queryKey: ['wa-instances-settings', store?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name, label, phone_number, status, profile_pic_url, connected_at')
        .eq('store_id', store!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!store?.id,
    refetchInterval: 8000,
  })

  // ── Auto-sync: detecta instâncias já conectadas no Evolution API mas não cadastradas no banco
  // Roda uma vez no mount. Essencial para quem conectou o WhatsApp antes deste sistema.
  useEffect(() => {
    if (!store?.id) return

    const sync = async () => {
      setSyncing(true)
      try {
        // 1. Busca todas as instâncias na Evolution API
        const apiNames = await evolutionApi.getInstancesList()
        if (!apiNames.length) { setSyncing(false); return }

        // 2. Compara com o que já está no banco
        const { data: dbRows } = await supabase
          .from('whatsapp_instances')
          .select('instance_name, status')
          .eq('store_id', store.id)
        const dbMap = Object.fromEntries((dbRows ?? []).map(r => [r.instance_name, r.status]))

        let anyNew = false

        for (const name of apiNames) {
          const state = await evolutionApi.getConnectionState(name)
          const isOpen = state === 'open'

          if (!dbMap[name]) {
            // Instância não existe no banco — insere (apenas se estiver conectada, evita poluir lista)
            if (!isOpen) continue
            const phone = await evolutionApi.getOwnerPhone(name)
            const pic   = phone ? await evolutionApi.fetchProfilePicture(name, phone) : null
            await supabase.from('whatsapp_instances').insert({
              store_id: store.id,
              instance_name: name,
              phone_number: phone,
              profile_pic_url: pic,
              status: 'connected',
              connected_at: new Date().toISOString(),
            })
            if (isOpen) await evolutionApi.setWebhook(name, WEBHOOK_URL)
            anyNew = true
          } else if (
            dbMap[name] !== 'connecting' &&  // ← nunca sobrescrever instância em setup de QR
            dbMap[name] !== (isOpen ? 'connected' : 'disconnected')
          ) {
            // Status divergente — corrige
            await supabase.from('whatsapp_instances')
              .update({ status: isOpen ? 'connected' : 'disconnected' })
              .eq('store_id', store.id)
              .eq('instance_name', name)
            if (isOpen) await evolutionApi.setWebhook(name, WEBHOOK_URL)
          } else if (isOpen && dbMap[name] === 'connected') {
            // Já está correto no banco — só garante o webhook
            await evolutionApi.setWebhook(name, WEBHOOK_URL)
          }
        }

        if (anyNew) {
          refetch()
          queryClient.invalidateQueries({ queryKey: ['whatsapp-instances-db'] })
        }
      } catch (err) {
        console.error('[WhatsAppSection] sync error:', err)
      } finally {
        setSyncing(false)
      }
    }

    sync()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id])

  // Supabase Realtime: atualiza quando o status muda (ex: QR scaneado)
  useEffect(() => {
    if (!store?.id) return
    const channel = supabase
      .channel('wa-instances-rt')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_instances', filter: `store_id=eq.${store.id}` },
        () => { refetch(); queryClient.invalidateQueries({ queryKey: ['whatsapp-instances-db'] }) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [store?.id, refetch, queryClient])

  const handleAddNumber = async () => {
    if (!store?.id) return
    setAdding(true)
    setQrBase64(null)
    setLoadingQr(true)
    stopAll()

    const name = generateInstanceName(store.id)
    setCurrentInst(name)

    // Cria registro no banco com status 'connecting'
    const { error: dbErr } = await supabase.from('whatsapp_instances').insert({
      store_id: store.id,
      instance_name: name,
      status: 'connecting',
    })
    if (dbErr) {
      toast.error('Erro ao criar instância', dbErr.message)
      setAdding(false)
      setLoadingQr(false)
      return
    }
    refetch()

    // Busca QR code
    const result = await evolutionApi.getQrCode(name)
    setLoadingQr(false)

    if (result.connected) {
      await handleConnected(name)
      return
    }
    if (result.error) {
      toast.error('Erro ao gerar QR Code', result.error)
      await supabase.from('whatsapp_instances').delete().eq('instance_name', name)
      refetch()
      setAdding(false)
      return
    }
    if (result.base64) {
      setQrBase64(result.base64)
      startQrCountdown(name)
    }
  }

  const startQrCountdown = (name: string) => {
    setQrSecs(QR_TTL)
    timerRef.current = setInterval(() => {
      setQrSecs(prev => {
        if (prev <= 1) {
          stopAll()
          setQrBase64(null)
          toast.info('QR Code expirou', 'Clique em "Adicionar número" novamente')
          supabase.from('whatsapp_instances').delete().eq('instance_name', name)
            .then(() => { refetch(); setAdding(false) })
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Polling para detectar quando o QR foi scaneado
    pollRef.current = setInterval(async () => {
      const state = await evolutionApi.getConnectionState(name)
      if (state === 'open') {
        stopAll()
        await handleConnected(name)
      }
    }, 3000)
  }

  const handleConnected = async (name: string) => {
    stopAll()
    setQrBase64(null)
    setAdding(false)

    // Busca telefone do owner
    const phone = await evolutionApi.getOwnerPhone(name)
    const pic   = phone ? await evolutionApi.fetchProfilePicture(name, phone) : null

    await supabase.from('whatsapp_instances').update({
      status: 'connected',
      phone_number: phone,
      profile_pic_url: pic,
      connected_at: new Date().toISOString(),
    }).eq('instance_name', name)

    // Registra webhook automaticamente
    await evolutionApi.setWebhook(name, WEBHOOK_URL)

    refetch()
    queryClient.invalidateQueries({ queryKey: ['wa-instances-whatsapp'] })
    toast.success('WhatsApp conectado!', phone ? `Número: +${phone}` : 'Instância ativa')
  }

  const handleDisconnect = async (inst: WaInstance) => {
    await evolutionApi.disconnectInstance(inst.instance_name)
    await supabase.from('whatsapp_instances').update({ status: 'disconnected', connected_at: null })
      .eq('id', inst.id)
    refetch()
    queryClient.invalidateQueries({ queryKey: ['wa-instances-whatsapp'] })
    toast.info('WhatsApp desconectado', inst.phone_number ?? inst.instance_name)
  }

  const handleRemove = async (inst: WaInstance) => {
    if (!confirm(`Remover o número ${inst.phone_number ?? inst.instance_name}?\nIsso desconectará o WhatsApp permanentemente.`)) return
    await evolutionApi.disconnectInstance(inst.instance_name).catch(() => {})
    await evolutionApi.deleteInstance(inst.instance_name).catch(() => {})
    await supabase.from('whatsapp_instances').delete().eq('id', inst.id)
    refetch()
    queryClient.invalidateQueries({ queryKey: ['wa-instances-whatsapp'] })
    toast.success('Número removido')
  }

  const handleReconnect = async (inst: WaInstance) => {
    setAdding(true)
    setQrBase64(null)
    setLoadingQr(true)
    stopAll()
    setCurrentInst(inst.instance_name)

    await supabase.from('whatsapp_instances').update({ status: 'connecting' }).eq('id', inst.id)
    refetch()

    const result = await evolutionApi.getQrCode(inst.instance_name)
    setLoadingQr(false)

    if (result.connected) { await handleConnected(inst.instance_name); return }
    if (result.error) {
      toast.error('Erro ao gerar QR Code', result.error)
      await supabase.from('whatsapp_instances').update({ status: 'disconnected' }).eq('id', inst.id)
      refetch()
      setAdding(false)
      return
    }
    if (result.base64) {
      setQrBase64(result.base64)
      startQrCountdown(inst.instance_name)
    }
  }

  const formatPhone = (p: string | null) => {
    if (!p) return null
    const d = p.replace(/\D/g, '')
    if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`
    if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`
    return `+${d}`
  }

  return (
    <Card>
      <CardHeader style={{ padding: '14px 16px 0' }}>
        <CardTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Smartphone size={16} style={{ color: 'var(--neon)' }} />
            WhatsApp
          </div>
        </CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge variant="neon" dot>{instances.filter(i => i.status === 'connected').length} conectado{instances.filter(i => i.status === 'connected').length !== 1 ? 's' : ''}</Badge>
          {syncing && (
            <span style={{ fontSize: 10, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> sincronizando...
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--t3)' }}>
          Conecte um ou mais números de WhatsApp. Cada número aparecerá automaticamente na aba de mensagens. Sem configurações técnicas necessárias.
        </p>

        {/* Lista de instâncias */}
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            <Loader2 size={18} style={{ color: 'var(--t3)', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : instances.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {instances.map(inst => {
              const isConnected = inst.status === 'connected'
              const isConnecting = inst.status === 'connecting'
              return (
                <div
                  key={inst.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8,
                    background: isConnected ? 'rgba(61,247,16,.05)' : 'var(--el)',
                    border: `1px solid ${isConnected ? 'rgba(61,247,16,.18)' : 'var(--bs)'}`,
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--ng)', border: '1px solid var(--nb)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  }}>
                    {inst.profile_pic_url
                      ? <img src={inst.profile_pic_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Smartphone size={16} style={{ color: 'var(--neon)' }} />
                    }
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>
                        {formatPhone(inst.phone_number) ?? inst.label ?? 'Aguardando conexão…'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 600,
                        color: isConnected ? 'var(--neon)' : isConnecting ? 'var(--yel)' : 'var(--t3)' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor',
                          animation: isConnecting ? 'pulse 1s ease-in-out infinite' : 'none' }} />
                        {isConnected ? 'Online' : isConnecting ? 'Conectando…' : 'Offline'}
                      </span>
                    </div>
                    {inst.label && (
                      <p style={{ fontSize: 10, color: 'var(--t3)' }}>{inst.label}</p>
                    )}
                    {inst.connected_at && (
                      <p style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--fm)' }}>
                        Conectado em {new Date(inst.connected_at).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {isConnected ? (
                      <button
                        onClick={() => handleDisconnect(inst)}
                        title="Desconectar"
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--bs)', background: 'transparent', color: 'var(--t3)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.color = 'var(--t3)' }}
                      >
                        <LogOut size={11} /> Desconectar
                      </button>
                    ) : !isConnecting && (
                      <button
                        onClick={() => handleReconnect(inst)}
                        title="Reconectar"
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--nb)', background: 'var(--ng)', color: 'var(--neon)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <QrCode size={11} /> Reconectar
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(inst)}
                      title="Remover"
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--bs)', background: 'transparent', color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.color = 'var(--t3)' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Flow de QR Code */}
        {adding && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
            padding: '20px 16px',
            background: 'var(--ng)', border: '1px solid var(--nb)', borderRadius: 10,
          }}>
            {loadingQr ? (
              <>
                <Loader2 size={28} style={{ color: 'var(--neon)', animation: 'spin 1s linear infinite' }} />
                <p style={{ fontSize: 12, color: 'var(--t2)' }}>Gerando QR Code…</p>
              </>
            ) : qrBase64 ? (
              <>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', textAlign: 'center' }}>
                  Escaneie o QR Code no WhatsApp
                </p>
                <p style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', marginTop: -8 }}>
                  WhatsApp → ⋮ Menu → Aparelhos conectados → Conectar aparelho
                </p>
                <div style={{ padding: 12, background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1px rgba(255,255,255,.05)' }}>
                  <img
                    src={`data:image/png;base64,${qrBase64}`}
                    alt="QR Code WhatsApp"
                    style={{ width: 200, height: 200, display: 'block' }}
                  />
                </div>
                {/* Timer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: qrSecs > 15 ? 'var(--neon)' : 'var(--yel)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <span style={{ fontSize: 11, fontFamily: 'var(--fm)', color: qrSecs > 15 ? 'var(--neon)' : 'var(--yel)' }}>
                    Expira em {qrSecs}s
                  </span>
                </div>
                <button
                  onClick={() => { stopAll(); setQrBase64(null); setAdding(false); if (currentInst) supabase.from('whatsapp_instances').delete().eq('instance_name', currentInst).then(() => refetch()) }}
                  style={{ fontSize: 11, color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Cancelar
                </button>
              </>
            ) : null}
          </div>
        )}

        {/* Botão adicionar */}
        {!adding && (
          <Button size="sm" onClick={handleAddNumber} style={{ alignSelf: 'flex-start' }}>
            <Plus size={13} /> Adicionar número
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Página principal de Configurações ───────────────────────────────────────

export default function Settings() {
  const { store, setStore } = useAuthStore()

  const saveStoreInfo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!store) return
    const fd = new FormData(e.currentTarget)
    const patch = {
      name:  (fd.get('name')  as string).trim(),
      cnpj:  (fd.get('cnpj')  as string).trim(),
      phone: (fd.get('phone') as string).trim(),
      email: (fd.get('email') as string).trim(),
      city:  (fd.get('city')  as string).trim(),
    }
    const { data, error } = await supabase.from('stores').update(patch).eq('id', store.id).select().single()
    if (error) { toast.error('Erro ao salvar', error.message); return }
    if (data) setStore(data as Parameters<typeof setStore>[0])
    toast.success('Dados da loja salvos!')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Configurações</h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Gerencie sua loja e integrações</p>
      </div>

      {/* Dados da loja */}
      <Card>
        <CardHeader style={{ padding: '14px 16px 0' }}>
          <CardTitle>Dados da Loja</CardTitle>
        </CardHeader>
        <CardContent style={{ padding: '14px 16px 16px' }}>
          <form onSubmit={saveStoreInfo} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Nome da Loja" name="name" defaultValue={store?.name} />
              <Input label="CNPJ" name="cnpj" defaultValue={store?.cnpj ?? ''} />
              <Input label="Telefone" name="phone" defaultValue={store?.phone ?? ''} />
              <Input label="Email" name="email" defaultValue={store?.email ?? ''} />
              <div style={{ gridColumn: '1 / -1' }}>
                <Input label="Cidade" name="city" defaultValue={store?.city ?? ''} />
              </div>
            </div>
            <div>
              <Button size="sm" type="submit">
                <Save size={13} /> Salvar Alterações
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <WhatsAppSection />

      {/* Plano */}
      <Card neon>
        <CardHeader style={{ padding: '14px 16px 0' }}>
          <CardTitle>Plano Atual</CardTitle>
          <Badge variant="neon" dot>Pro</Badge>
        </CardHeader>
        <CardContent style={{ padding: '10px 16px 16px' }}>
          <p style={{ fontSize: 12, color: 'var(--t2)' }}>
            Você está no plano <strong style={{ color: 'var(--neon)' }}>Pro</strong> com acesso a todos os recursos da plataforma.
          </p>
        </CardContent>
      </Card>

      {/* Segurança */}
      <PasswordCard />
    </div>
  )
}

// ─── Card de troca de senha ───────────────────────────────────────────────────

function PasswordCard() {
  const [newPwd, setNewPwd]         = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [show, setShow]             = useState(false)
  const [saving, setSaving]         = useState(false)

  const inp: React.CSSProperties = {
    width: '100%', height: 34, paddingLeft: 32, paddingRight: 36,
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 12,
    outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--t3)',
    textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5,
  }

  const handleSave = async () => {
    if (newPwd.length < 6) { toast.error('Senha muito curta', 'Mínimo 6 caracteres'); return }
    if (newPwd !== confirmPwd) { toast.error('As senhas não coincidem'); return }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd })
      if (error) throw error
      setNewPwd(''); setConfirmPwd('')
      toast.success('Senha alterada com sucesso!')
    } catch (err) {
      toast.error('Erro ao alterar senha', err instanceof Error ? err.message : 'Tente novamente')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px 0' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Segurança</p>
      </div>
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 12, color: 'var(--t3)' }}>Altere sua senha de acesso à plataforma.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Nova Senha</label>
            <div style={{ position: 'relative' }}>
              <Lock size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
              <input type={show ? 'text' : 'password'} placeholder="••••••••" value={newPwd}
                onChange={e => setNewPwd(e.target.value)} style={inp}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
              <button type="button" onClick={() => setShow(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                {show ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </div>
          <div>
            <label style={lbl}>Confirmar Nova Senha</label>
            <div style={{ position: 'relative' }}>
              <Lock size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
              <input type={show ? 'text' : 'password'} placeholder="••••••••" value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)} style={{ ...inp, paddingRight: 11 }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
            </div>
          </div>
        </div>
        <div>
          <button onClick={handleSave} disabled={saving || !newPwd || !confirmPwd}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              background: 'var(--neon)', color: '#000', border: 'none',
              cursor: saving || !newPwd || !confirmPwd ? 'not-allowed' : 'pointer',
              opacity: saving || !newPwd || !confirmPwd ? 0.5 : 1, transition: 'opacity .15s',
            }}
          >
            {saving
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Salvando...</>
              : <><Lock size={13} /> Alterar Senha</>}
          </button>
        </div>
      </div>
    </div>
  )
}
