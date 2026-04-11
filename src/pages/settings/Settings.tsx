import { useState, useEffect, useRef, useCallback } from 'react'
import { Wifi, WifiOff, QrCode, Save, RefreshCw, LogOut, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { evolutionApi } from '@/services/whatsapp'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'

type ConnectionStatus = 'unknown' | 'checking' | 'connected' | 'disconnected' | 'connecting'

const QR_TTL = 30

export default function Settings() {
  const { store, setStore } = useAuthStore()
  const [instanceName, setInstanceName] = useState(
    (store?.settings as Record<string, string>)?.whatsapp_instance ?? ''
  )

  const [status, setStatus] = useState<ConnectionStatus>('unknown')
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState(QR_TTL)
  const [isLoadingQr, setIsLoadingQr] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (qrTimerRef.current) { clearInterval(qrTimerRef.current); qrTimerRef.current = null }
  }, [])

  const registerWebhook = async (instance: string) => {
    try {
      await fetch(`${import.meta.env.VITE_EVOLUTION_API_URL}/webhook/set/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_EVOLUTION_API_KEY },
        body: JSON.stringify({
          webhook: {
            url: 'https://eakdywmuewvuzyqfpcpl.supabase.co/functions/v1/whatsapp-webhook',
            webhook_by_events: true,
            webhook_base64: false,
            enabled: true,
            events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
          },
        }),
      })
    } catch (err) {
      console.warn('[Settings] Failed to register webhook:', err)
    }
  }

  const onConnected = useCallback(() => {
    stopPolling()
    setQrBase64(null)
    setStatus('connected')
    toast.success('WhatsApp conectado!', 'Instância ativa e pronta para uso')
    if (instanceName.trim()) registerWebhook(instanceName.trim())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPolling, instanceName])

  const startPolling = useCallback((name: string) => {
    stopPolling()
    setQrSecondsLeft(QR_TTL)

    qrTimerRef.current = setInterval(() => {
      setQrSecondsLeft(prev => {
        if (prev <= 1) {
          stopPolling()
          setQrBase64(null)
          setStatus('disconnected')
          toast.info('QR Code expirou', 'Clique em "Gerar QR Code" novamente')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    pollRef.current = setInterval(async () => {
      const state = await evolutionApi.getConnectionState(name)
      if (state === 'open') onConnected()
    }, 4000)
  }, [stopPolling, onConnected])

  const checkStatus = useCallback(async (name: string) => {
    if (!name) { setStatus('unknown'); return }
    setStatus('checking')
    const state = await evolutionApi.getConnectionState(name)
    if (state === 'open') {
      setStatus('connected')
    } else if (state === 'not_found') {
      setStatus('unknown')
    } else {
      setStatus('disconnected')
    }
  }, [])

  useEffect(() => {
    checkStatus(instanceName)
    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGenerateQr = async () => {
    if (!instanceName.trim()) {
      toast.error('Nome da instância obrigatório', 'Preencha o campo acima antes de conectar')
      return
    }
    setIsLoadingQr(true)
    setQrBase64(null)
    stopPolling()
    try {
      const result = await evolutionApi.getQrCode(instanceName.trim())
      if (result.connected) { onConnected(); return }
      if (result.error) { toast.error('Erro ao gerar QR Code', result.error); setStatus('disconnected'); return }
      if (result.base64) {
        setQrBase64(result.base64)
        setStatus('connecting')
        startPolling(instanceName.trim())
        return
      }
      toast.error('QR não disponível', 'A API não retornou o QR Code. Tente novamente.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Erro de conexão', msg.slice(0, 120))
      setStatus('disconnected')
    } finally {
      setIsLoadingQr(false)
    }
  }

  const handleDisconnect = async () => {
    if (!instanceName) return
    stopPolling()
    setQrBase64(null)
    try {
      await evolutionApi.disconnectInstance(instanceName)
      setStatus('disconnected')
      toast.info('WhatsApp desconectado')
    } catch {
      toast.error('Erro ao desconectar')
    }
  }

  const saveSettings = async () => {
    if (!store) return
    const newSettings = { ...(store.settings as object), whatsapp_instance: instanceName }
    const { data, error } = await supabase
      .from('stores').update({ settings: newSettings }).eq('id', store.id).select().single()

    if (error) {
      toast.error('Erro ao salvar configurações')
    } else {
      setStore(data as Parameters<typeof setStore>[0])
      toast.success('Configurações salvas!')
      if (instanceName.trim()) await registerWebhook(instanceName.trim())
      checkStatus(instanceName)
    }
  }

  type StatusCfg = { label: string; color: string; icon: React.ReactNode }
  const statusConfig: StatusCfg = {
    unknown:      { label: 'Não configurado', color: 'var(--t3)',  icon: <WifiOff size={13} /> },
    checking:     { label: 'Verificando...',  color: 'var(--yel)', icon: <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> },
    connected:    { label: 'Conectado',       color: 'var(--neon)', icon: <CheckCircle2 size={13} /> },
    disconnected: { label: 'Desconectado',    color: 'var(--red)',  icon: <XCircle size={13} /> },
    connecting:   { label: 'Aguardando scan', color: 'var(--yel)', icon: <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> },
  }[status]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Configurações</h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Gerencie sua loja e integrações</p>
      </div>

      {/* Store info */}
      <Card>
        <CardHeader style={{ padding: '14px 16px 0' }}>
          <CardTitle>Dados da Loja</CardTitle>
        </CardHeader>
        <CardContent style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Nome da Loja" defaultValue={store?.name} />
            <Input label="CNPJ" defaultValue={store?.cnpj ?? ''} />
            <Input label="Telefone" defaultValue={store?.phone ?? ''} />
            <Input label="Email" defaultValue={store?.email ?? ''} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Input label="Cidade" defaultValue={store?.city ?? ''} />
            </div>
          </div>
          <div>
            <Button size="sm" onClick={saveSettings}>
              <Save size={13} /> Salvar Alterações
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp integration */}
      <Card>
        <CardHeader style={{ padding: '14px 16px 0' }}>
          <CardTitle>WhatsApp — Evolution API</CardTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: statusConfig.color }}>
            {statusConfig.icon}
            <span>{statusConfig.label}</span>
          </div>
        </CardHeader>
        <CardContent style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--t3)' }}>
            Conecte sua instância do Evolution API para envio e recebimento de mensagens via WhatsApp.
          </p>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Input
                label="Nome da Instância"
                placeholder="ex: loja_vendas_llz5"
                value={instanceName}
                onChange={e => {
                  setInstanceName(e.target.value)
                  setQrBase64(null)
                  stopPolling()
                  setStatus('unknown')
                }}
              />
            </div>
            <Button size="sm" variant="secondary" onClick={saveSettings}>
              <Save size={13} /> Salvar
            </Button>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {status !== 'connected' && (
              <Button
                size="sm"
                onClick={handleGenerateQr}
                loading={isLoadingQr}
                disabled={!instanceName.trim() || status === 'connecting'}
              >
                <QrCode size={13} />
                {status === 'connecting' ? 'Aguardando scan...' : 'Gerar QR Code'}
              </Button>
            )}
            {status === 'connected' && (
              <Button size="sm" variant="secondary" onClick={handleDisconnect}>
                <LogOut size={13} /> Desconectar
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => checkStatus(instanceName)}
              disabled={!instanceName.trim() || status === 'checking'}
            >
              <RefreshCw size={13} />
              Verificar status
            </Button>
          </div>

          {/* QR Code display */}
          {qrBase64 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              padding: 20, background: 'var(--ng)', border: '1px solid var(--nb)',
              borderRadius: 9,
            }}>
              <p style={{ fontSize: 11, color: 'var(--t2)', textAlign: 'center' }}>
                Abra o WhatsApp → Dispositivos vinculados → Vincular um dispositivo
              </p>
              <div style={{ padding: 10, background: '#fff', borderRadius: 10 }}>
                <img
                  src={`data:image/png;base64,${qrBase64}`}
                  alt="QR Code WhatsApp"
                  style={{ width: 200, height: 200, display: 'block' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: qrSecondsLeft > 10 ? 'var(--neon)' : 'var(--yel)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
                <p style={{ fontSize: 11, fontFamily: 'var(--fm)', color: qrSecondsLeft > 10 ? 'var(--neon)' : 'var(--yel)' }}>
                  Expira em {qrSecondsLeft}s
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={handleGenerateQr} loading={isLoadingQr}>
                <RefreshCw size={12} /> Novo QR Code
              </Button>
            </div>
          )}

          {/* Connected state */}
          {status === 'connected' && !qrBase64 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              background: 'var(--ng)', border: '1px solid var(--nb)', borderRadius: 8,
            }}>
              <Wifi size={18} style={{ color: 'var(--neon)', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--neon)' }}>WhatsApp conectado</p>
                <p style={{ fontSize: 11, color: 'var(--t3)' }}>
                  Instância <strong style={{ color: 'var(--t2)' }}>{instanceName}</strong> está ativa
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan info */}
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
    </div>
  )
}
