// Evolution API service — suporta URL/key dinâmicos via store.settings
// Fallback para variáveis de ambiente quando não configurado no painel

let _baseUrl = import.meta.env.VITE_EVOLUTION_API_URL?.replace(/\/$/, '') ?? ''
let _apiKey  = import.meta.env.VITE_EVOLUTION_API_KEY ?? ''

/** Configura a Evolution API dinamicamente (chamado ao carregar o store) */
export function configureEvolutionApi(url: string, key: string) {
  if (url) _baseUrl = url.replace(/\/$/, '')
  if (key) _apiKey  = key
}

function base()    { return _baseUrl }
function headers() { return { 'Content-Type': 'application/json', apikey: _apiKey } }

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
    const res = await fetch(`${base()}/instance/fetchInstances`, { headers: headers() })
    return safeJson(res)
  },

  // Retorna 'open' | 'close' | 'connecting' | 'qr' | 'not_found'
  getConnectionState: async (instanceName: string): Promise<string> => {
    try {
      const res = await fetch(`${base()}/instance/connectionState/${instanceName}`, { headers: headers() })
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
  getQrCode: async (instanceName: string): Promise<{ base64?: string; connected?: boolean; error?: string }> => {
    try {
      const connectRes = await fetch(`${base()}/instance/connect/${instanceName}`, { headers: headers() })
      const data = await safeJson(connectRes)

      if (connectRes.ok) {
        if (!data) return { error: 'API não retornou JSON válido. Verifique os logs do browser.' }
        const state = (data?.instance as Record<string, string>)?.state
        if (state === 'open') return { connected: true }
        const raw = (data?.base64 ?? (data?.qrcode as Record<string, string>)?.base64 ?? '') as string
        if (raw) {
          const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw
          return { base64 }
        }
        return { error: 'QR não disponível. Clique em "Desconectar" e tente gerar novamente.' }
      }

      const createRes = await fetch(`${base()}/instance/create`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
      })
      const created = await safeJson(createRes)
      if (!createRes.ok || !created) {
        const errMsg = ((created?.response as Record<string, unknown>)?.message as string[] | undefined)?.join(' ') ?? ''
        return { error: errMsg || 'Falha ao criar instância. Verifique o nome e tente novamente.' }
      }
      const raw = ((created?.qrcode as Record<string, string>)?.base64 ?? (created?.base64 as string) ?? '')
      if (raw) {
        const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw
        return { base64 }
      }
      return { error: 'QR não disponível ainda, tente novamente em instantes' }
    } catch (err) {
      console.error('[whatsapp.ts] getQrCode error:', err)
      return { error: `Erro de rede: ${String(err)}` }
    }
  },

  getInstanceStatus: async (instanceName: string) => {
    const res = await fetch(`${base()}/instance/connectionState/${instanceName}`, { headers: headers() })
    return safeJson(res)
  },

  sendText: async (instance: string, number: string, text: string) => {
    const res = await fetch(`${base()}/message/sendText/${instance}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ number, text }),
    })
    return safeJson(res)
  },

  /** Envia texto citando uma mensagem anterior */
  sendTextWithQuote: async (
    instance: string,
    number: string,
    text: string,
    quoted: { keyId: string; fromMe: boolean; remoteJid: string; content?: string },
  ) => {
    const res = await fetch(`${base()}/message/sendText/${instance}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        number,
        text,
        quoted: {
          key: { id: quoted.keyId, fromMe: quoted.fromMe, remoteJid: quoted.remoteJid },
          ...(quoted.content ? { message: { conversation: quoted.content } } : {}),
        },
      }),
    })
    return safeJson(res)
  },

  /** Busca a foto de perfil de um contato pelo número */
  fetchProfilePicture: async (instance: string, number: string): Promise<string | null> => {
    try {
      const res = await fetch(`${base()}/chat/fetchProfilePictureUrl/${instance}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ number }),
      })
      if (!res.ok) return null
      const data = await safeJson(res)
      return (data?.profilePictureUrl as string) ?? null
    } catch {
      return null
    }
  },

  sendMedia: async (instance: string, number: string, mediaUrl: string, caption: string) => {
    const res = await fetch(`${base()}/message/sendMedia/${instance}`, {
      method: 'POST',
      headers: headers(),
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
    const res = await fetch(`${base()}/chat/findChats/${instance}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    })
    return safeJson(res)
  },

  findMessages: async (instance: string, remoteJid: string, limit = 50) => {
    const res = await fetch(`${base()}/chat/findMessages/${instance}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ where: { key: { remoteJid } }, limit }),
    })
    return safeJson(res)
  },

  disconnectInstance: async (instanceName: string) => {
    const res = await fetch(`${base()}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers: headers(),
    })
    return safeJson(res)
  },

  /** Marca todas as mensagens de um chat como lidas */
  markAsRead: async (instanceName: string, remoteJid: string): Promise<void> => {
    try {
      await fetch(`${base()}/chat/markMessageAsRead/${instanceName}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ readMessages: [{ remoteJid, fromMe: false, id: 'all' }] }),
      })
    } catch { /* noop */ }
  },

  /** Registra (ou atualiza) o webhook da instância */
  setWebhook: async (instanceName: string, webhookUrl: string): Promise<boolean> => {
    try {
      const res = await fetch(`${base()}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          webhook: {
            url: webhookUrl,
            webhook_by_events: true,
            webhook_base64: false,
            enabled: true,
            events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
          },
        }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  /** Busca conteúdo base64 de uma mensagem de mídia */
  getMediaBase64: async (
    instanceName: string,
    key: { id: string; fromMe: boolean; remoteJid: string },
  ): Promise<string | null> => {
    try {
      const res = await fetch(`${base()}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ key, convertToMp4: false }),
      })
      if (!res.ok) return null
      const data = await safeJson(res)
      return (data?.base64 as string) ?? null
    } catch {
      return null
    }
  },

  /** Envia mensagem de áudio (voz) em formato WhatsApp PTT */
  sendAudio: async (instanceName: string, number: string, audioBase64: string): Promise<boolean> => {
    try {
      const res = await fetch(`${base()}/message/sendWhatsAppAudio/${instanceName}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ number, audioMessage: { audio: audioBase64, encoding: true } }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  /** Envia imagem em base64 */
  sendImageBase64: async (instanceName: string, number: string, base64: string, caption = ''): Promise<boolean> => {
    try {
      const res = await fetch(`${base()}/message/sendMedia/${instanceName}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ number, mediatype: 'image', media: base64, caption }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  /** Retorna lista de nomes de instâncias cadastradas na Evolution API */
  getInstancesList: async (): Promise<string[]> => {
    try {
      const res = await fetch(`${base()}/instance/fetchInstances`, { headers: headers() })
      if (!res.ok) return []
      const text = await res.text()
      let data: unknown
      try { data = JSON.parse(text) } catch { return [] }
      if (!Array.isArray(data)) return []
      return data
        .map((i: unknown) => {
          const item = i as Record<string, unknown>
          const inst = item?.instance as Record<string, unknown> | undefined
          return (inst?.instanceName ?? item?.instanceName ?? '') as string
        })
        .filter(Boolean)
    } catch {
      return []
    }
  },
}
