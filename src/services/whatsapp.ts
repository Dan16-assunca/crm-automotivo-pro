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

  connectInstance: async (instanceName: string) => {
    // Tenta reconectar instância existente primeiro
    const connectRes = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, { headers })
    if (connectRes.ok) {
      const data = await connectRes.json()
      // Normaliza para o mesmo formato de /instance/create
      if (data.base64) return { qrcode: { base64: data.base64 } }
      if (data.qrcode?.base64) return data
      return data
    }
    // Se não existir, cria nova instância
    const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ instanceName, qrcode: true }),
    })
    return createRes.json()
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
