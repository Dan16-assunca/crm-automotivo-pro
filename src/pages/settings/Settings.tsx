import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Save, Loader2, Lock, Eye, EyeOff,
  QrCode, LogOut, Plus, Trash2,
  Smartphone, CreditCard, Star, Zap, Building2,
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
  instance_token: string | null
  uazapi_id: string | null
  label: string | null
  phone_number: string | null
  status: string
  profile_pic_url: string | null
  connected_at: string | null
}

const WEBHOOK_URL = 'https://eakdywmuewvuzyqfpcpl.supabase.co/functions/v1/whatsapp-webhook'
const QR_TTL = 45

/** Tenta obter QR code até maxTries vezes com delayMs entre tentativas.
 *  UazapiGO precisa de alguns segundos após criar a instância para gerar o QR. */
async function pollForQr(
  token: string,
  maxTries = 6,
  delayMs = 2500,
): Promise<{ base64?: string; connected?: boolean; owner?: string; error?: string }> {
  for (let i = 0; i < maxTries; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, delayMs))
    const result = await evolutionApi.getQrCode(token)
    if (result.connected || result.base64) return result
  }
  return { error: 'QR não disponível. Verifique se o servidor UazapiGO está acessível e tente novamente.' }
}

// ─── Seção WhatsApp (self-contained) ─────────────────────────────────────────

function WhatsAppSection() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()
  const [adding, setAdding]         = useState(false)
  const [showLabelForm, setShowLabelForm] = useState(false)
  const [pendingLabel, setPendingLabel]   = useState('')
  const [editingLabel, setEditingLabel]   = useState<string | null>(null) // inst.id sendo editado
  const [editLabelVal, setEditLabelVal]   = useState('')
  const [savingLabel, setSavingLabel]     = useState(false)
  const [qrBase64, setQrBase64]     = useState<string | null>(null)
  const [qrSecs, setQrSecs]         = useState(QR_TTL)
  const [loadingQr, setLoadingQr]   = useState(false)
  const [syncing, setSyncing]       = useState(false)
  const [currentInst, setCurrentInst] = useState<string | null>(null)
  const [currentToken, setCurrentToken] = useState<string | null>(null)

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
        .select('id, instance_name, instance_token, uazapi_id, label, phone_number, status, profile_pic_url, connected_at')
        .eq('store_id', store!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!store?.id,
    refetchInterval: 8000,
  })

  // ── Auto-sync: detecta instâncias já conectadas na UazapiGO mas não cadastradas no banco
  useEffect(() => {
    if (!store?.id) return

    const sync = async () => {
      setSyncing(true)
      try {
        // 1. Busca todas as instâncias na UazapiGO (admin)
        const apiInstances = await evolutionApi.getInstances()
        if (!apiInstances.length) { setSyncing(false); return }

        // 2. Compara com o banco
        const { data: dbRows } = await supabase
          .from('whatsapp_instances')
          .select('instance_name, instance_token, status')
          .eq('store_id', store.id)
        const dbMap = Object.fromEntries((dbRows ?? []).map(r => [r.instance_name, r]))

        let anyNew = false

        for (const inst of apiInstances) {
          if (!inst.token) continue
          const state  = await evolutionApi.getConnectionState(inst.token)
          const isOpen = state === 'open'

          if (!dbMap[inst.name]) {
            if (!isOpen) continue
            const phone = await evolutionApi.getOwnerPhone(inst.token)
            const pic   = phone ? await evolutionApi.fetchProfilePicture(inst.token, phone) : null
            await supabase.from('whatsapp_instances').insert({
              store_id: store.id,
              instance_name: inst.name,
              instance_token: inst.token,
              uazapi_id: inst.id,
              phone_number: phone,
              profile_pic_url: pic,
              status: 'connected',
              connected_at: new Date().toISOString(),
            })
            if (isOpen) await evolutionApi.setWebhook(inst.token, WEBHOOK_URL)
            anyNew = true
          } else {
            const dbRow = dbMap[inst.name]
            if (dbRow.status === 'connecting') continue
            if (dbRow.status !== (isOpen ? 'connected' : 'disconnected')) {
              await supabase.from('whatsapp_instances')
                .update({ status: isOpen ? 'connected' : 'disconnected', instance_token: inst.token })
                .eq('store_id', store.id).eq('instance_name', inst.name)
              if (isOpen) await evolutionApi.setWebhook(inst.token, WEBHOOK_URL)
            } else if (isOpen) {
              await evolutionApi.setWebhook(inst.token, WEBHOOK_URL)
            }
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

  const handleSaveLabel = async (inst: WaInstance) => {
    if (!editLabelVal.trim()) return
    setSavingLabel(true)
    try {
      await supabase.from('whatsapp_instances').update({ label: editLabelVal.trim() }).eq('id', inst.id)
      refetch()
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances-db'] })
      setEditingLabel(null)
    } finally {
      setSavingLabel(false)
    }
  }

  const handleAddNumber = async (label: string) => {
    if (!store?.id) return
    setShowLabelForm(false)
    setAdding(true)
    setQrBase64(null)
    setLoadingQr(true)
    stopAll()

    let instanceName: string
    let token: string
    let uazapiId: string

    const name = generateInstanceName(store.id)
    setCurrentInst(name)

    // 1. Tenta criar nova instância na UazapiGO
    const created = await evolutionApi.createInstance(name)

    if (!created) {
      toast.error('Erro ao criar instância', 'Não foi possível conectar à UazapiGO.')
      setAdding(false)
      setLoadingQr(false)
      return
    }

    if ('limitReached' in created) {
      // Limite de instâncias atingido — tenta adotar uma instância órfã do servidor
      // (não cadastrada no banco deste estabelecimento)
      const apiInsts = await evolutionApi.getInstances()
      const { data: dbRows } = await supabase
        .from('whatsapp_instances')
        .select('instance_name')
        .eq('store_id', store.id)
      const dbNames = new Set((dbRows ?? []).map(r => r.instance_name))

      const orphan = apiInsts.find(i => i.token && !dbNames.has(i.name))
      if (!orphan) {
        toast.error(
          'Limite de instâncias atingido',
          'Remova uma instância existente antes de adicionar um novo número.',
        )
        setAdding(false)
        setLoadingQr(false)
        return
      }

      // Adota a instância órfã
      token      = orphan.token
      uazapiId   = orphan.id
      instanceName = orphan.name
      setCurrentInst(instanceName)
    } else {
      token        = created.token
      uazapiId     = created.id
      instanceName = name
    }

    setCurrentToken(token)

    // 2. Salva no banco com o token (upsert por instance_name — unique constraint global)
    const { error: dbErr } = await supabase.from('whatsapp_instances').upsert(
      {
        store_id: store.id,
        instance_name: instanceName,
        instance_token: token,
        uazapi_id: uazapiId,
        status: 'connecting',
        ...(label.trim() ? { label: label.trim() } : {}),
      },
      { onConflict: 'instance_name' },
    )
    if (dbErr) {
      toast.error('Erro ao salvar instância', dbErr.message)
      setAdding(false)
      setLoadingQr(false)
      return
    }
    refetch()

    // 3. Aciona conexão e obtém QR code (retry: UazapiGO precisa de alguns segundos)
    const result = await pollForQr(token)
    setLoadingQr(false)

    if (result.connected) {
      await handleConnected(instanceName, token)
      return
    }
    if (result.error) {
      toast.error('Erro ao gerar QR Code', result.error)
      await supabase.from('whatsapp_instances').delete().eq('instance_name', instanceName)
      refetch()
      setAdding(false)
      return
    }
    if (result.base64) {
      setQrBase64(result.base64)
      startQrCountdown(instanceName, token)
    }
  }

  const startQrCountdown = (name: string, token: string) => {
    // Para qualquer intervalo anterior antes de criar novos
    stopAll()
    setQrSecs(QR_TTL)

    // Polling rápido: verifica conexão a cada 2s
    pollRef.current = setInterval(async () => {
      const state = await evolutionApi.getConnectionState(token)
      if (state === 'open') {
        stopAll()
        await handleConnected(name, token)
      }
    }, 2000)

    // Countdown visual
    timerRef.current = setInterval(() => {
      setQrSecs(prev => {
        if (prev > 1) return prev - 1

        // Timer zerou — verifica conexão ANTES de renovar QR
        clearInterval(timerRef.current!)
        timerRef.current = null

        evolutionApi.getConnectionState(token).then(async state => {
          if (state === 'open') {
            // Já conectou antes do timer expirar — apenas confirma
            stopAll()
            await handleConnected(name, token)
            return
          }
          // Genuinamente desconectado: renova o QR sem resetar a instância
          setQrBase64(null)
          setLoadingQr(true)
          const result = await evolutionApi.getQrCode(token)
          setLoadingQr(false)
          if (result.connected) {
            stopAll()
            await handleConnected(name, token)
          } else if (result.base64) {
            setQrBase64(result.base64)
            startQrCountdown(name, token)
          } else {
            stopAll()
            toast.info('QR Code expirou', 'Clique em "Adicionar número" novamente')
            supabase.from('whatsapp_instances').delete().eq('instance_name', name)
              .then(() => { refetch(); setAdding(false) })
          }
        })

        return 0
      })
    }, 1000)
  }

  const handleConnected = async (name: string, token: string) => {
    stopAll()
    setQrBase64(null)
    setAdding(false)

    const phone = await evolutionApi.getOwnerPhone(token)
    const pic   = phone ? await evolutionApi.fetchProfilePicture(token, phone) : null

    await supabase.from('whatsapp_instances').update({
      status: 'connected',
      phone_number: phone,
      profile_pic_url: pic,
      connected_at: new Date().toISOString(),
    }).eq('instance_name', name)

    await evolutionApi.setWebhook(token, WEBHOOK_URL)

    refetch()
    queryClient.invalidateQueries({ queryKey: ['wa-instances-whatsapp'] })
    queryClient.invalidateQueries({ queryKey: ['whatsapp-instances-db'] })
    toast.success('WhatsApp conectado!', phone ? `Número: +${phone}` : 'Instância ativa')
  }

  const handleDisconnect = async (inst: WaInstance) => {
    if (inst.instance_token) await evolutionApi.disconnectInstance(inst.instance_token)
    await supabase.from('whatsapp_instances').update({ status: 'disconnected', connected_at: null })
      .eq('id', inst.id)
    refetch()
    queryClient.invalidateQueries({ queryKey: ['whatsapp-instances-db'] })
    toast.info('WhatsApp desconectado', inst.phone_number ?? inst.instance_name)
  }

  const handleRemove = async (inst: WaInstance) => {
    if (!confirm(`Remover o número ${inst.phone_number ?? inst.instance_name}?\nIsso desconectará o WhatsApp permanentemente.`)) return
    if (inst.instance_token) {
      await evolutionApi.disconnectInstance(inst.instance_token).catch(() => {})
      await evolutionApi.deleteInstance(inst.instance_token).catch(() => {})
    }
    await supabase.from('whatsapp_instances').delete().eq('id', inst.id)
    refetch()
    queryClient.invalidateQueries({ queryKey: ['whatsapp-instances-db'] })
    toast.success('Número removido')
  }

  const handleReconnect = async (inst: WaInstance) => {
    setAdding(true)
    setQrBase64(null)
    setLoadingQr(true)
    stopAll()
    setCurrentInst(inst.instance_name)

    // Se não tem token, recria a instância na UazapiGO
    let token = inst.instance_token
    if (!token) {
      const created = await evolutionApi.createInstance(inst.instance_name)
      if (!created || 'limitReached' in created) {
        toast.error('Erro ao reconectar', !created
          ? 'Não foi possível criar instância na UazapiGO.'
          : 'Limite de instâncias atingido. Remova uma instância antes de reconectar.')
        setAdding(false)
        setLoadingQr(false)
        return
      }
      token = created.token
      await supabase.from('whatsapp_instances').update({
        instance_token: token,
        uazapi_id: created.id,
        status: 'connecting',
      }).eq('id', inst.id)
    } else {
      await supabase.from('whatsapp_instances').update({ status: 'connecting' }).eq('id', inst.id)
    }

    setCurrentToken(token)
    refetch()

    const result = await pollForQr(token)
    setLoadingQr(false)

    if (result.connected) { await handleConnected(inst.instance_name, token); return }
    if (result.error) {
      toast.error('Erro ao gerar QR Code', result.error)
      await supabase.from('whatsapp_instances').update({ status: 'disconnected' }).eq('id', inst.id)
      refetch()
      setAdding(false)
      return
    }
    if (result.base64) {
      setQrBase64(result.base64)
      startQrCountdown(inst.instance_name, token)
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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

                    {/* Label editável inline */}
                    {editingLabel === inst.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                        <input
                          autoFocus
                          type="text"
                          value={editLabelVal}
                          onChange={e => setEditLabelVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveLabel(inst)
                            if (e.key === 'Escape') setEditingLabel(null)
                          }}
                          style={{
                            height: 26, padding: '0 8px',
                            background: 'var(--el)', border: '1px solid var(--nb)',
                            borderRadius: 5, color: 'var(--t)', fontSize: 11,
                            outline: 'none', fontFamily: 'var(--fn)', width: 140,
                          }}
                        />
                        <button
                          onClick={() => handleSaveLabel(inst)}
                          disabled={savingLabel}
                          style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: 'var(--neon)', color: '#000', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                        >
                          {savingLabel ? '…' : 'OK'}
                        </button>
                        <button
                          onClick={() => setEditingLabel(null)}
                          style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid var(--bs)', background: 'transparent', color: 'var(--t3)', fontSize: 10, cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingLabel(inst.id); setEditLabelVal(inst.label ?? '') }}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4, marginTop: 2,
                        }}
                        title="Clique para editar o nome"
                      >
                        <p style={{ fontSize: 10, color: inst.label ? 'var(--t3)' : 'var(--t3)', fontStyle: inst.label ? 'normal' : 'italic' }}>
                          {inst.label ?? 'Sem nome — clique para adicionar'}
                        </p>
                        <span style={{ fontSize: 9, color: 'var(--nb)', opacity: 0.7 }}>✏️</span>
                      </button>
                    )}

                    {inst.connected_at && (
                      <p style={{ fontSize: 9, color: 'var(--t3)', fontFamily: 'var(--fm)', marginTop: 2 }}>
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

        {/* Form de label antes do QR */}
        {showLabelForm && !adding && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            padding: '16px', background: 'var(--ng)',
            border: '1px solid var(--nb)', borderRadius: 10,
          }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>
                Identificar este número
              </p>
              <p style={{ fontSize: 11, color: 'var(--t3)' }}>
                Dê um nome para identificar a quem pertence este WhatsApp (ex: "João Silva", "Vendas")
              </p>
            </div>
            <input
              type="text"
              autoFocus
              placeholder="Ex: João Silva ou Suporte"
              value={pendingLabel}
              onChange={e => setPendingLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddNumber(pendingLabel) }}
              style={{
                width: '100%', height: 36, padding: '0 11px',
                background: 'var(--el)', border: '1px solid var(--nb)',
                borderRadius: 7, color: 'var(--t)', fontSize: 13,
                outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => { setShowLabelForm(false); setPendingLabel('') }} style={{ flex: 1 }}>
                Cancelar
              </Button>
              <Button size="sm" variant="primary" onClick={() => handleAddNumber(pendingLabel)} style={{ flex: 1 }}>
                <QrCode size={13} /> Gerar QR Code
              </Button>
            </div>
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
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', textAlign: 'center' }}>
                  Escaneie o QR Code no WhatsApp
                </p>

                {/* Instrução passo a passo */}
                <div style={{
                  background: 'rgba(61,247,16,.06)', border: '1px solid rgba(61,247,16,.15)',
                  borderRadius: 8, padding: '10px 14px', width: '100%', maxWidth: 320,
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--neon)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ⚠️ Abra o WhatsApp — NÃO use a câmera do celular
                  </p>
                  <ol style={{ fontSize: 11, color: 'var(--t2)', paddingLeft: 16, margin: 0, lineHeight: 1.8 }}>
                    <li>Abra o <strong>WhatsApp</strong> no celular</li>
                    <li>Toque nos 3 pontos <strong>⋮</strong> (Android) ou <strong>Configurações</strong> (iPhone)</li>
                    <li>Toque em <strong>Aparelhos conectados</strong></li>
                    <li>Toque em <strong>Conectar aparelho</strong></li>
                    <li>Aponte a câmera para este QR Code</li>
                  </ol>
                </div>

                <div style={{ padding: 12, background: '#fff', borderRadius: 12, boxShadow: '0 0 0 1px rgba(255,255,255,.05)' }}>
                  <img
                    src={`data:image/png;base64,${qrBase64}`}
                    alt="QR Code WhatsApp"
                    style={{ width: 220, height: 220, display: 'block' }}
                  />
                </div>

                {/* Timer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: qrSecs > 15 ? 'var(--neon)' : 'var(--yel)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <span style={{ fontSize: 11, fontFamily: 'var(--fm)', color: qrSecs > 15 ? 'var(--neon)' : 'var(--yel)' }}>
                    {qrSecs > 0 ? `Expira em ${qrSecs}s` : 'Renovando QR Code…'}
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
        {!adding && !showLabelForm && (
          <Button size="sm" onClick={() => { setPendingLabel(''); setShowLabelForm(true) }} style={{ alignSelf: 'flex-start' }}>
            <Plus size={13} /> Adicionar número
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Seção de Billing ─────────────────────────────────────────────────────────

const PLANS = [
  {
    id: 'starter',
    label: 'Starter',
    price: 'R$ 197/mês',
    icon: Zap,
    color: '#3B82F6',
    features: ['1 usuário', '500 leads/mês', 'WhatsApp integrado', 'Automações básicas'],
  },
  {
    id: 'pro',
    label: 'Pro',
    price: 'R$ 397/mês',
    icon: Star,
    color: '#3DF710',
    features: ['5 usuários', 'Leads ilimitados', 'Multi-WhatsApp', 'Automações avançadas', 'Relatórios completos'],
    recommended: true,
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    price: 'R$ 797/mês',
    icon: Building2,
    color: '#F97316',
    features: ['Usuários ilimitados', 'Multi-lojas', 'API exclusiva', 'Suporte prioritário', 'Onboarding dedicado'],
  },
] as const

function BillingSection() {
  const { store } = useAuthStore()
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const { data: sessionData } = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession()
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
  const session = sessionData?.session

  const plan        = store?.plan ?? 'free'
  const status      = store?.status ?? 'trial'
  const trialEndsAt = store?.trial_ends_at ?? null

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null

  const isActive = status === 'active'
  const isTrial  = status === 'trial'
  const isSuspended = status === 'suspended' || status === 'cancelled'

  async function handleUpgrade(planId: string) {
    if (!session?.access_token) { toast.error('Sessão expirada', 'Faça login novamente'); return }
    setUpgrading(planId)
    try {
      const res = await fetch(
        'https://eakdywmuewvuzyqfpcpl.supabase.co/functions/v1/stripe-checkout',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ plan: planId }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar sessão de pagamento')
      window.location.href = data.url
    } catch (err) {
      toast.error('Erro ao abrir checkout', err instanceof Error ? err.message : 'Tente novamente')
    } finally {
      setUpgrading(null)
    }
  }

  return (
    <Card>
      <CardHeader style={{ padding: '14px 16px 0' }}>
        <CardTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={16} style={{ color: 'var(--neon)' }} />
            Plano e Faturamento
          </div>
        </CardTitle>
        <Badge variant={isActive ? 'neon' : isTrial ? 'warning' : 'danger'} dot>
          {isActive ? plan.charAt(0).toUpperCase() + plan.slice(1) : isTrial ? 'Trial' : 'Suspenso'}
        </Badge>
      </CardHeader>

      <CardContent style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Status atual */}
        {isTrial && trialDaysLeft !== null && (
          <div style={{
            background: trialDaysLeft <= 3 ? 'rgba(239,68,68,.08)' : 'rgba(61,247,16,.06)',
            border: `1px solid ${trialDaysLeft <= 3 ? 'rgba(239,68,68,.25)' : 'rgba(61,247,16,.2)'}`,
            borderRadius: 10, padding: '12px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: trialDaysLeft <= 3 ? '#EF4444' : 'var(--neon)', margin: 0 }}>
                {trialDaysLeft > 0
                  ? `${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia' : 'dias'} restantes no trial`
                  : 'Trial encerrado'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--t3)', margin: '3px 0 0' }}>
                Assine agora para continuar usando sem interrupções
              </p>
            </div>
          </div>
        )}

        {isSuspended && (
          <div style={{
            background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
            borderRadius: 10, padding: '12px 14px',
          }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', margin: 0 }}>Conta suspensa</p>
            <p style={{ fontSize: 11, color: 'var(--t3)', margin: '3px 0 0' }}>
              Regularize o pagamento para reativar sua conta.
            </p>
          </div>
        )}

        {isActive && (
          <p style={{ fontSize: 12, color: 'var(--t2)', margin: 0 }}>
            Você está no plano <strong style={{ color: 'var(--neon)' }}>
              {plan.charAt(0).toUpperCase() + plan.slice(1)}
            </strong> com acesso total à plataforma.
          </p>
        )}

        {/* Cards de planos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PLANS.map(p => {
            const Icon    = p.icon
            const current = plan === p.id && isActive
            const loading = upgrading === p.id
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 10,
                background: current ? `${p.color}0d` : 'var(--el)',
                border: `1px solid ${current ? p.color + '40' : 'var(--bs)'}`,
                position: 'relative',
              }}>
                {p.recommended && !current && (
                  <div style={{
                    position: 'absolute', top: -1, right: 12,
                    background: 'var(--neon)', color: '#000',
                    fontSize: 9, fontWeight: 800, padding: '2px 8px',
                    borderRadius: '0 0 6px 6px', letterSpacing: '.05em', textTransform: 'uppercase',
                  }}>Recomendado</div>
                )}
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: `${p.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} style={{ color: p.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>{p.label}</span>
                    <span style={{ fontSize: 12, color: p.color, fontWeight: 600 }}>{p.price}</span>
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--t3)', margin: '2px 0 0', lineHeight: 1.4 }}>
                    {p.features.join(' · ')}
                  </p>
                </div>
                {current ? (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: p.color,
                    background: `${p.color}1a`, padding: '4px 10px',
                    borderRadius: 20, flexShrink: 0,
                  }}>Ativo</span>
                ) : (
                  <button
                    onClick={() => handleUpgrade(p.id)}
                    disabled={loading || upgrading !== null}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '6px 14px',
                      borderRadius: 8, border: `1px solid ${p.color}60`,
                      background: 'transparent', color: p.color,
                      cursor: loading || upgrading !== null ? 'not-allowed' : 'pointer',
                      opacity: upgrading !== null && !loading ? 0.5 : 1,
                      flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                      transition: 'all .15s',
                    }}
                  >
                    {loading
                      ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Abrindo...</>
                      : (isTrial || isSuspended ? 'Assinar' : 'Mudar')}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 10, color: 'var(--t3)', textAlign: 'center' }}>
          Pagamento seguro via Stripe · Cancele a qualquer momento
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Página principal de Configurações ───────────────────────────────────────

export default function Settings() {
  const { store, setStore } = useAuthStore()
  const [savingStore, setSavingStore] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(store?.logo_url ?? null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !store) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagem muito grande', 'Máximo 2MB.'); return }
    const reader = new FileReader()
    reader.onloadend = () => setLogoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const saveStoreInfo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!store) return
    setSavingStore(true)
    try {
      const fd = new FormData(e.currentTarget)
      let logo_url = store.logo_url ?? null

      // Upload logo se selecionou novo arquivo
      const logoFile = logoInputRef.current?.files?.[0]
      if (logoFile) {
        const ext  = logoFile.name.split('.').pop() ?? 'png'
        const path = `logos/${store.id}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('whatsapp-media')
          .upload(path, logoFile, { upsert: true, contentType: logoFile.type })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path)
          logo_url = urlData.publicUrl
        }
      }

      const patch = {
        name:     (fd.get('name')    as string).trim(),
        cnpj:     (fd.get('cnpj')    as string).trim(),
        phone:    (fd.get('phone')   as string).trim(),
        email:    (fd.get('email')   as string).trim(),
        address:  (fd.get('address') as string).trim(),
        city:     (fd.get('city')    as string).trim(),
        state:    (fd.get('state')   as string).trim(),
        logo_url,
      }
      const { data, error } = await supabase.from('stores').update(patch).eq('id', store.id).select().single()
      if (error) { toast.error('Erro ao salvar', error.message); return }
      if (data) setStore(data as Parameters<typeof setStore>[0])
      toast.success('Dados da loja salvos!')
    } finally {
      setSavingStore(false)
    }
  }

  const BR_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

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

            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                onClick={() => logoInputRef.current?.click()}
                style={{
                  width: 64, height: 64, borderRadius: 10, flexShrink: 0,
                  background: 'var(--el)', border: '2px dashed var(--b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden', position: 'relative',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--b)')}>
                {logoPreview
                  ? <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 22 }}>🏪</span>}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', marginBottom: 3 }}>Logo da loja</p>
                <p style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 6 }}>PNG ou JPG, máximo 2MB. Aparece no sistema e nos relatórios.</p>
                <button type="button" onClick={() => logoInputRef.current?.click()}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--b)', background: 'var(--el)', color: 'var(--t2)', cursor: 'pointer' }}>
                  Escolher imagem
                </button>
                <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Nome da Loja" name="name" defaultValue={store?.name} />
              <Input label="CNPJ" name="cnpj" defaultValue={store?.cnpj ?? ''} placeholder="00.000.000/0001-00" />
              <Input label="Telefone" name="phone" defaultValue={store?.phone ?? ''} placeholder="(11) 99999-9999" />
              <Input label="Email" name="email" defaultValue={store?.email ?? ''} placeholder="contato@loja.com" />
              <div style={{ gridColumn: '1 / -1' }}>
                <Input label="Endereço (rua e número)" name="address" defaultValue={store?.address ?? ''} placeholder="Av. Paulista, 1234" />
              </div>
              <Input label="Cidade" name="city" defaultValue={store?.city ?? ''} placeholder="São Paulo" />
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 4 }}>Estado</label>
                <select name="state" defaultValue={store?.state ?? 'SP'}
                  style={{ width: '100%', height: 36, padding: '0 10px', background: 'var(--el)', border: '1px solid var(--b)', borderRadius: 7, color: 'var(--t)', fontSize: 13, outline: 'none', fontFamily: 'var(--fn)', cursor: 'pointer' }}>
                  {BR_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <Button size="sm" type="submit" disabled={savingStore}>
                {savingStore ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
                {savingStore ? 'Salvando…' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <WhatsAppSection />

      {/* Plano / Billing */}
      <BillingSection />

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
