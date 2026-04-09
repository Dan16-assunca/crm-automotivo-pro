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

const QR_TTL = 30 // segundos antes de expirar

export default function Settings() {
  const { store, setStore } = useAuthStore()
  const [instanceName, setInstanceName] = useState(
    (store?.settings as Record<string, string>)?.whatsapp_instance ?? ''
  )

  // WhatsApp connection state
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

  const onConnected = useCallback(() => {
    stopPolling()
    setQrBase64(null)
    setStatus('connected')
    toast.success('WhatsApp conectado!', 'Instância ativa e pronta para uso')
    // Garante que o webhook está registrado ao conectar
    if (instanceName.trim()) registerWebhook(instanceName.trim())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPolling, instanceName])

  // Polling: verifica a cada 4s se o QR foi escaneado
  const startPolling = useCallback((name: string) => {
    stopPolling()
    setQrSecondsLeft(QR_TTL)

    // Countdown do QR
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

    // Poll de status
    pollRef.current = setInterval(async () => {
      const state = await evolutionApi.getConnectionState(name)
      if (state === 'open') onConnected()
    }, 4000)
  }, [stopPolling, onConnected])

  // Verifica status ao montar ou ao mudar instância
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

  // Gera QR Code
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
      if (result.connected) {
        onConnected()
        return
      }
      if (result.error) {
        toast.error('Erro ao gerar QR Code', result.error)
        setStatus('disconnected')
        return
      }
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
      console.error('[Settings] handleGenerateQr error:', err)
    } finally {
      setIsLoadingQr(false)
    }
  }

  // Desconecta
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

  // Registra webhook na Evolution API
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

  // Salva configurações
  const saveSettings = async () => {
    if (!store) return
    const newSettings = {
      ...(store.settings as object),
      whatsapp_instance: instanceName,
    }
    const { data, error } = await supabase
      .from('stores')
      .update({ settings: newSettings })
      .eq('id', store.id)
      .select()
      .single()

    if (error) {
      toast.error('Erro ao salvar configurações')
    } else {
      setStore(data as Parameters<typeof setStore>[0])
      toast.success('Configurações salvas!')
      if (instanceName.trim()) await registerWebhook(instanceName.trim())
      checkStatus(instanceName)
    }
  }

  const statusConfig = {
    unknown:      { label: 'Não configurado', color: 'text-[#555]',     icon: <WifiOff size={14} /> },
    checking:     { label: 'Verificando...',  color: 'text-yellow-400',  icon: <Loader2 size={14} className="animate-spin" /> },
    connected:    { label: 'Conectado',       color: 'text-[#39FF14]',   icon: <CheckCircle2 size={14} /> },
    disconnected: { label: 'Desconectado',    color: 'text-red-400',     icon: <XCircle size={14} /> },
    connecting:   { label: 'Aguardando scan', color: 'text-yellow-400',  icon: <Loader2 size={14} className="animate-spin" /> },
  }[status]

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-[#555]">Gerencie sua loja e integrações</p>
      </div>

      {/* Store info */}
      <Card>
        <CardHeader>
          <CardTitle>Dados da Loja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome da Loja" defaultValue={store?.name} />
            <Input label="CNPJ" defaultValue={store?.cnpj ?? ''} />
            <Input label="Telefone" defaultValue={store?.phone ?? ''} />
            <Input label="Email" defaultValue={store?.email ?? ''} />
            <Input label="Cidade" defaultValue={store?.city ?? ''} className="col-span-2" />
          </div>
          <Button size="sm" onClick={saveSettings}>
            <Save size={14} /> Salvar Alterações
          </Button>
        </CardContent>
      </Card>

      {/* WhatsApp integration */}
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp — Evolution API</CardTitle>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${statusConfig.color}`}>
            {statusConfig.icon}
            <span>{statusConfig.label}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[#555]">
            Conecte sua instância do Evolution API para envio e recebimento de mensagens via WhatsApp.
          </p>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                label="Nome da Instância"
                placeholder="ex: loja_vendas_llz5"
                value={instanceName}
                onChange={(e) => {
                  setInstanceName(e.target.value)
                  setQrBase64(null)
                  stopPolling()
                  setStatus('unknown')
                }}
              />
            </div>
            <Button size="sm" variant="secondary" onClick={saveSettings} className="mb-[1px]">
              <Save size={14} /> Salvar
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            {status !== 'connected' && (
              <Button
                size="sm"
                onClick={handleGenerateQr}
                loading={isLoadingQr}
                disabled={!instanceName.trim() || status === 'connecting'}
              >
                <QrCode size={14} />
                {status === 'connecting' ? 'Aguardando scan...' : 'Gerar QR Code'}
              </Button>
            )}
            {status === 'connected' && (
              <Button size="sm" variant="secondary" onClick={handleDisconnect}>
                <LogOut size={14} /> Desconectar
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => checkStatus(instanceName)}
              disabled={!instanceName.trim() || status === 'checking'}
            >
              <RefreshCw size={14} className={status === 'checking' ? 'animate-spin' : ''} />
              Verificar status
            </Button>
          </div>

          {/* QR Code display */}
          {qrBase64 && (
            <div className="flex flex-col items-center gap-3 p-6 bg-[#111] border border-[#39FF14]/20 rounded-xl">
              <p className="text-xs text-[#A0A0A0] text-center">
                Abra o WhatsApp → Dispositivos vinculados → Vincular um dispositivo
              </p>
              <div className="p-3 bg-white rounded-xl">
                <img
                  src={`data:image/png;base64,${qrBase64}`}
                  alt="QR Code WhatsApp"
                  className="w-52 h-52 block"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${qrSecondsLeft > 10 ? 'bg-[#39FF14] animate-pulse' : 'bg-yellow-400 animate-pulse'}`} />
                <p className={`text-xs font-mono ${qrSecondsLeft > 10 ? 'text-[#39FF14]' : 'text-yellow-400'}`}>
                  Expira em {qrSecondsLeft}s
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={handleGenerateQr} loading={isLoadingQr}>
                <RefreshCw size={13} /> Novo QR Code
              </Button>
            </div>
          )}

          {/* Connected state */}
          {status === 'connected' && !qrBase64 && (
            <div className="flex items-center gap-3 p-4 bg-[#39FF14]/5 border border-[#39FF14]/20 rounded-xl">
              <Wifi size={20} className="text-[#39FF14] shrink-0" />
              <div>
                <p className="text-sm font-medium text-[#39FF14]">WhatsApp conectado</p>
                <p className="text-xs text-[#555]">Instância <strong className="text-[#A0A0A0]">{instanceName}</strong> está ativa</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan info */}
      <Card neon>
        <CardHeader>
          <CardTitle>Plano Atual</CardTitle>
          <Badge variant="neon" dot>Pro</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#A0A0A0]">
            Você está no plano <strong className="text-[#39FF14]">Pro</strong> com acesso a todos os recursos da plataforma.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
