const EVOLUTION_API_URL = import.meta.env.VITE_EVOLUTION_API_URL as string
const EVOLUTION_API_KEY = import.meta.env.VITE_EVOLUTION_API_KEY as string

const headers = {
  'Content-Type': 'application/json',
  apikey: EVOLUTION_API_KEY,
}

export const evolutionApi = {
  getInstances: async () => {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, { headers })
    return res.json()
  },

  // Retorna 'open' | 'close' | 'connecting' | 'qr' | 'not_found'
  getConnectionState: async (instanceName: string): Promise<string> => {
    try {
      const res = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, { headers })
      if (res.status === 404) return 'not_found'
      if (!res.ok) return 'not_found'
      const data = await res.json()
      return data?.instance?.state ?? data?.state ?? 'close'
    } catch {
      return 'not_found'
    }
  },

  // Retorna { base64: string } se QR disponível, { connected: true } se já conectado
  // Cria a instância automaticamente se não existir
  getQrCode: async (instanceName: string): Promise<{ base64?: string; connected?: boolean; error?: string }> => {
    // 1. Tenta conectar instância existente
    const connectRes = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, { headers })
    if (connectRes.ok) {
      const data = await connectRes.json()
      // Já conectado
      if (data?.instance?.state === 'open') return { connected: true }
      // QR disponível — strip do prefixo data URI se existir
      const raw: string = data?.base64 ?? data?.qrcode?.base64 ?? ''
      if (raw) {
        const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw
        return { base64 }
      }
    }
    // 2. Se 404, instância não existe → cria
    if (connectRes.status === 404 || !connectRes.ok) {
      const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      })
      if (!createRes.ok) return { error: 'Falha ao criar instância' }
      const created = await createRes.json()
      const raw: string = created?.qrcode?.base64 ?? ''
      if (raw) {
        const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw
        return { base64 }
      }
      // Instância criada mas QR ainda não disponível — tenta buscar em seguida
      return { error: 'QR não disponível ainda, tente novamente em instantes' }
    }
    return { error: 'Resposta inesperada da API' }
  },

  getInstanceStatus: async (instanceName: string) => {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, { headers })
    return res.json()
  },

  sendText: async (instance: string, number: string, text: string) => {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number, text }),
    })
    return res.json()
  },

  sendMedia: async (instance: string, number: string, mediaUrl: string, caption: string) => {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number, mediaUrl, caption }),
    })
    return res.json()
  },

  sendTemplate: async (instance: string, number: string, template: string, variables: Record<string, string>) => {
    let text = template
    Object.entries(variables).forEach(([key, value]) => {
      text = text.replace(`{{${key}}}`, value)
    })
    return evolutionApi.sendText(instance, number, text)
  },

  findChats: async (instance: string) => {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findChats/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    return res.json()
  },

  findMessages: async (instance: string, remoteJid: string, limit = 1) => {
    const res = await fetch(`${EVOLUTION_API_URL}/chat/findMessages/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        where: { key: { remoteJid } },
        limit,
      }),
    })
    return res.json()
  },

  disconnectInstance: async (instanceName: string) => {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers,
    })
    return res.json()
  },
}
