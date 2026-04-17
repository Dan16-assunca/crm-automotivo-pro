// Evolution API — chamada sempre via proxy /api/evolution
// A API Key fica no servidor (Vercel env vars) — nunca exposta ao browser.
// Em desenvolvimento, o vite.config.ts proxia /api/evolution para a Evolution API real.

const BASE = (import.meta.env.VITE_EVOLUTION_API_URL ?? '/api/evolution').replace(/\/$/, '')

// Sem apikey aqui — o proxy server-side injeta automaticamente
const headers = { 'Content-Type': 'application/json' }

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    console.error('[whatsapp.ts] Resposta não é JSON:', res.url, res.status, text.slice(0, 200))
    return null
  }
}

// Nome de instância gerado automaticamente pelo sistema
// Formato: crm_<store_id_first8>_<timestamp_base36>
// Ex: crm_a1b2c3d4_x7k2mq — único, sem dados sensíveis, seguro como nome no Evolution API
export function generateInstanceName(storeId: string): string {
  const short = storeId.replace(/-/g, '').slice(0, 8)
  const ts    = Date.now().toString(36).slice(-6)
  return `crm_${short}_${ts}`
}

export const evolutionApi = {
  // ── Instâncias ──────────────────────────────────────────────────────────────

  getInstances: async () => {
    const res = await fetch(`${BASE}/instance/fetchInstances`, { headers })
    return safeJson(res)
  },

  createInstance: async (instanceName: string) => {
    const res = await fetch(`${BASE}/instance/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
    })
    return safeJson(res)
  },

  getConnectionState: async (instanceName: string): Promise<string> => {
    try {
      const res = await fetch(`${BASE}/instance/connectionState/${instanceName}`, { headers })
      if (res.status === 404) return 'not_found'
      if (!res.ok) return 'not_found'
      const data = await safeJson(res)
      if (!data) return 'not_found'
      return (data?.instance as Record<string, string>)?.state ?? (data?.state as string) ?? 'close'
    } catch {
      return 'not_found'
    }
  },

  // Retorna { base64 } se QR disponível, { connected: true, owner } se já conectado
  getQrCode: async (instanceName: string): Promise<{ base64?: string; connected?: boolean; owner?: string; error?: string }> => {
    try {
      const connectRes = await fetch(`${BASE}/instance/connect/${instanceName}`, { headers })
      const data = await safeJson(connectRes)

      if (connectRes.ok) {
        if (!data) return { error: 'API não retornou JSON válido.' }
        const state = (data?.instance as Record<string, string>)?.state
        if (state === 'open') {
          const owner = (data?.instance as Record<string, string>)?.owner ?? ''
          return { connected: true, owner }
        }
        const raw = (data?.base64 ?? (data?.qrcode as Record<string, string>)?.base64 ?? '') as string
        if (raw) {
          const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw
          return { base64 }
        }
        return { error: 'QR não disponível. Clique em "Desconectar" e tente novamente.' }
      }

      // Instância não existe — cria
      const created = await evolutionApi.createInstance(instanceName)
      if (!created) return { error: 'Falha ao criar instância.' }
      const raw = ((created?.qrcode as Record<string, string>)?.base64 ?? (created?.base64 as string) ?? '')
      if (raw) {
        const base64 = raw.startsWith('data:') ? raw.split(',')[1] : raw
        return { base64 }
      }
      return { error: 'QR não disponível ainda, tente em instantes.' }
    } catch (err) {
      return { error: `Erro de rede: ${String(err)}` }
    }
  },

  // Retorna phone number do owner após conexão
  getOwnerPhone: async (instanceName: string): Promise<string | null> => {
    try {
      const res = await fetch(`${BASE}/instance/connectionState/${instanceName}`, { headers })
      const data = await safeJson(res)
      const owner = (data?.instance as Record<string, string>)?.owner ?? ''
      return owner ? owner.replace(/@.+$/, '') : null
    } catch {
      return null
    }
  },

  disconnectInstance: async (instanceName: string) => {
    const res = await fetch(`${BASE}/instance/logout/${instanceName}`, { method: 'DELETE', headers })
    return safeJson(res)
  },

  deleteInstance: async (instanceName: string) => {
    const res = await fetch(`${BASE}/instance/delete/${instanceName}`, { method: 'DELETE', headers })
    return safeJson(res)
  },

  setWebhook: async (instanceName: string, webhookUrl: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/webhook/set/${instanceName}`, {
        method: 'POST',
        headers,
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

  getInstancesList: async (): Promise<string[]> => {
    try {
      const res = await fetch(`${BASE}/instance/fetchInstances`, { headers })
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

  // ── Chats e mensagens ────────────────────────────────────────────────────────

  /** Retorna mapa { número_sem_sufixo: nome } com todos os contatos da instância */
  findContacts: async (instance: string): Promise<Record<string, string>> => {
    try {
      const res = await fetch(`${BASE}/chat/findContacts/${instance}`, {
        method: 'POST', headers, body: JSON.stringify({ where: {} }),
      })
      if (!res.ok) return {}
      const data = await safeJson(res)
      const list = Array.isArray(data) ? data : ((data?.contacts as unknown[]) ?? [])
      const map: Record<string, string> = {}
      for (const c of list as Record<string, unknown>[]) {
        const jid  = ((c.id ?? c.remoteJid ?? '') as string).replace(/@.+$/, '')
        const name = ((c.pushName ?? c.name ?? c.notify ?? '') as string).trim()
        if (jid && name) map[jid] = name
      }
      return map
    } catch {
      return {}
    }
  },

  findChats: async (instance: string) => {
    const res = await fetch(`${BASE}/chat/findChats/${instance}`, {
      method: 'POST', headers, body: JSON.stringify({}),
    })
    return safeJson(res)
  },

  findMessages: async (instance: string, remoteJid: string, limit = 50) => {
    const res = await fetch(`${BASE}/chat/findMessages/${instance}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ where: { key: { remoteJid } }, limit }),
    })
    return safeJson(res)
  },

  fetchProfilePicture: async (instance: string, number: string): Promise<string | null> => {
    try {
      const res = await fetch(`${BASE}/chat/fetchProfilePictureUrl/${instance}`, {
        method: 'POST', headers, body: JSON.stringify({ number }),
      })
      if (!res.ok) return null
      const data = await safeJson(res)
      return (data?.profilePictureUrl as string) ?? null
    } catch {
      return null
    }
  },

  markAsRead: async (instanceName: string, remoteJid: string): Promise<void> => {
    try {
      await fetch(`${BASE}/chat/markMessageAsRead/${instanceName}`, {
        method: 'POST', headers,
        body: JSON.stringify({ readMessages: [{ remoteJid, fromMe: false, id: 'all' }] }),
      })
    } catch { /* noop */ }
  },

  // ── Envio ────────────────────────────────────────────────────────────────────

  sendText: async (instance: string, number: string, text: string) => {
    const res = await fetch(`${BASE}/message/sendText/${instance}`, {
      method: 'POST', headers,
      body: JSON.stringify({ number, text }),
    })
    return safeJson(res)
  },

  sendTextWithQuote: async (
    instance: string, number: string, text: string,
    quoted: { keyId: string; fromMe: boolean; remoteJid: string; content?: string },
  ) => {
    const res = await fetch(`${BASE}/message/sendText/${instance}`, {
      method: 'POST', headers,
      body: JSON.stringify({
        number, text,
        quoted: {
          key: { id: quoted.keyId, fromMe: quoted.fromMe, remoteJid: quoted.remoteJid },
          ...(quoted.content ? { message: { conversation: quoted.content } } : {}),
        },
      }),
    })
    return safeJson(res)
  },

  sendAudio: async (instanceName: string, number: string, audioBase64: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/message/sendWhatsAppAudio/${instanceName}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, audioMessage: { audio: audioBase64, encoding: true } }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  sendImageBase64: async (instanceName: string, number: string, base64: string, caption = ''): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/message/sendMedia/${instanceName}`, {
        method: 'POST', headers,
        body: JSON.stringify({ number, mediatype: 'image', media: base64, caption }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  sendTemplate: async (instance: string, number: string, template: string, variables: Record<string, string>) => {
    let text = template
    Object.entries(variables).forEach(([key, value]) => { text = text.replace(`{{${key}}}`, value) })
    return evolutionApi.sendText(instance, number, text)
  },

  // ── Mídia ────────────────────────────────────────────────────────────────────

  getMediaBase64: async (
    instanceName: string,
    key: { id: string; fromMe: boolean; remoteJid: string },
  ): Promise<string | null> => {
    try {
      const res = await fetch(`${BASE}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: 'POST', headers,
        body: JSON.stringify({ key, convertToMp4: false }),
      })
      if (!res.ok) return null
      const data = await safeJson(res)
      return (data?.base64 as string) ?? null
    } catch {
      return null
    }
  },
}
