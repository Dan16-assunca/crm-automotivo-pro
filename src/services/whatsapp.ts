// Chama a Evolution API diretamente — CORS está configurado no servidor
// Access-Control-Allow-Origin: https://app.crmautomotivopro.com
const BASE = import.meta.env.VITE_EVOLUTION_API_URL?.replace(/\/$/, '') ?? ''
const API_KEY = import.meta.env.VITE_EVOLUTION_API_KEY ?? ''

const headers = {
  'Content-Type': 'application/json',
  apikey: API_KEY,
}

/** Parseia uma Response de forma segura. Retorna null se não for JSON válido. */
async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    console.error('[whatsapp.ts] Response is not JSON:', res.url, res.status, text.slice(0, 200))
    return null
  }
}

export const evolutionApi = {
  getInstances: async () => {
    const res = await fetch(`${BASE}/instance/fetchInstances`, { headers })
    return safeJson(res)
  },

  // Retorna 'open' | 'close' | 'connecting' | 'qr' | 'not_found'
  getConnectionState: async (instanceName: string): Promise<string> => {
    try {
      const res = await fetch(`${BASE}/instance/connectionState/${instanceName}`, { headers })
      if (res.status === 404) return 'not_found'
      if (!res.ok) return 'not_found'
      const data = await safeJson(res)
      if (!data) return 'not_found'
      const state = (data?.instance as Record<string, string>)?.state ?? (data?.state as string) ?? 'close'
      return state
    } catch {
      return 'not_found'
    }
  },

  // Retorna { base64 } se QR disponível, { connected: true } se já conectado
  // Cria a instância automaticamente se não existir
  getQrCode: async (instanceName: string): Promise<{ base64?: string; connected?: boolean; error?: string }> => {
    try {
      // 1. Tenta conectar instância existente
      const connectRes = await fetch(`${BASE}/instance/connect/${instanceName}`, { headers })
      const data = await safeJson(connectRes)

      if (!data) {
        return { error: 'API não retornou JSON válido. Verifique os logs do browser.' }
      }

      if (connectRes.ok) {
        const state = (data?.instance as Record<string, string>)?.state
        if (state === 'open') return { connected: true }

        // QR disponível — strip do prefixo data URI se presente
        const raw = (data?.base64 ?? (data?.qrcode as Record<string, string>)?.base64 ?? '') as string
        if (raw) {
          const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw
          return { base64 }
        }
      }

      // 2. Instância não existe → cria
      const errMsg = ((data?.response as Record<string, unknown>)?.message as string[])?.join(' ') ?? ''
      const notFound = connectRes.status === 404 || errMsg.includes('does not exist')

      if (notFound || !connectRes.ok) {
        const createRes = await fetch(`${BASE}/instance/create`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
        })
        const created = await safeJson(createRes)
        if (!createRes.ok || !created) return { error: 'Falha ao criar instância' }

        const raw = ((created?.qrcode as Record<string, string>)?.base64 ?? '') as string
        if (raw) {
          const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw
          return { base64 }
        }
        return { error: 'QR não disponível ainda, tente novamente em instantes' }
      }

      return { error: 'Resposta inesperada da API' }
    } catch (err) {
      console.error('[whatsapp.ts] getQrCode error:', err)
      return { error: `Erro de rede: ${String(err)}` }
    }
  },

  getInstanceStatus: async (instanceName: string) => {
    const res = await fetch(`${BASE}/instance/connectionState/${instanceName}`, { headers })
    return safeJson(res)
  },

  sendText: async (instance: string, number: string, text: string) => {
    const res = await fetch(`${BASE}/message/sendText/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number, text }),
    })
    return safeJson(res)
  },

  sendMedia: async (instance: string, number: string, mediaUrl: string, caption: string) => {
    const res = await fetch(`${BASE}/message/sendMedia/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number, mediaUrl, caption }),
    })
    return safeJson(res)
  },

  sendTemplate: async (instance: string, number: string, template: string, variables: Record<string, string>) => {
    let text = template
    Object.entries(variables).forEach(([key, value]) => {
      text = text.replace(`{{${key}}}`, value)
    })
    return evolutionApi.sendText(instance, number, text)
  },

  findChats: async (instance: string) => {
    const res = await fetch(`${BASE}/chat/findChats/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    })
    return safeJson(res)
  },

  findMessages: async (instance: string, remoteJid: string, limit = 50) => {
    const res = await fetch(`${BASE}/chat/findMessages/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        where: { key: { remoteJid } },
        limit,
      }),
    })
    return safeJson(res)
  },

  disconnectInstance: async (instanceName: string) => {
    const res = await fetch(`${BASE}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers,
    })
    return safeJson(res)
  },
}
