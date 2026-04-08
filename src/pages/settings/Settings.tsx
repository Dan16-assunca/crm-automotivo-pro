import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Settings as SettingsIcon, Wifi, WifiOff, QrCode, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { evolutionApi } from '@/services/whatsapp'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { toast } from '@/components/ui/Toast'

export default function Settings() {
  const { store, setStore } = useAuthStore()
  const [instanceName, setInstanceName] = useState(
    (store?.settings as Record<string, string>)?.whatsapp_instance ?? ''
  )
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const connectWhatsApp = async () => {
    if (!instanceName) return
    setConnecting(true)
    try {
      const result = await evolutionApi.connectInstance(instanceName)
      if (result.qrcode?.base64) {
        setQrCode(result.qrcode.base64)
        toast.info('QR Code gerado', 'Escaneie com seu WhatsApp')
      } else {
        toast.success('WhatsApp conectado!')
      }
    } catch {
      toast.error('Erro ao conectar WhatsApp')
    } finally {
      setConnecting(false)
    }
  }

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
    }
  }

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
          <Badge variant="info">Integração</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[#555]">
            Conecte sua instância do Evolution API para envio e recebimento de mensagens via WhatsApp.
          </p>
          <Input
            label="Nome da Instância"
            placeholder="ex: loja-bmw-sp"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={connectWhatsApp}
              loading={connecting}
            >
              <QrCode size={14} /> Conectar / Ver QR Code
            </Button>
            <Button size="sm" onClick={saveSettings}>
              <Save size={14} /> Salvar
            </Button>
          </div>

          {qrCode && (
            <div className="mt-4 p-4 bg-white rounded-xl inline-block">
              <img src={`data:image/png;base64,${qrCode}`} alt="QR Code WhatsApp" className="w-48 h-48" />
              <p className="text-xs text-[#555] text-center mt-2">Escaneie com o WhatsApp</p>
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
