// Serviço WhatsApp — UazapiGO (servidor próprio)
// ─────────────────────────────────────────────────────────────────────────────
// Autenticação em dois níveis:
//   • Admin (criar/listar instâncias): header `admintoken` → injetado pelo proxy server-side
//   • Por instância (mensagens, status, QR): query param `?token=<instanceToken>`
//
// O proxy em api/whatsapp/[...path].js já injeta o admintoken no header e repassa
// todos os query params ao servidor UazapiGO — nenhum segredo chega ao browser.

const BASE = (import.meta.env.VITE_EVOLUTION_API_URL ?? '/api/whatsapp').replace(/\/$/, '')

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

/** Converte instanceToken em query string: ?token=<token> */
const tqs = (token: string) => `token=${encodeURIComponent(token)}`

// ─── Utilitários de telefone ──────────────────────────────────────────────────

/** Formata número para envio: remove não-dígitos, adiciona 55 se necessário */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 11) return `55${digits}`
  return digits
}

/** Extrai número limpo do remoteJid (ex: "5511999887766@s.whatsapp.net" → "5511999887766") */
export function extractPhone(remoteJid: string): string {
  return remoteJid.replace(/@.+$/, '')
}

/** Verifica se é um JID de grupo */
export function isGroup(remoteJid: string): boolean {
  return remoteJid.endsWith('@g.us')
}

// ─── Nome de instância ────────────────────────────────────────────────────────

// Formato: crm_<store_id_first8>_<timestamp_base36>
export function generateInstanceName(storeId: string): string {
  const short = storeId.replace(/-/g, '').slice(0, 8)
  const ts    = Date.now().toString(36).slice(-6)
  return `crm_${short}_${ts}`
}

// ─── API principal ────────────────────────────────────────────────────────────

export const evolutionApi = {

  // ── Admin: Instâncias ────────────────────────────────────────────────────────
  // Essas chamadas usam `admintoken` header (injetado pelo proxy).

  /**
   * Cria uma instância na UazapiGO.
   * Retorna { token, id } — o token é usado em todas as chamadas subsequentes.
   */
  createInstance: async (instanceName: string): Promise<{ token: string; id: string } | null> => {
    try {
      const res = await fetch(`${BASE}/instance/create`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: instanceName }),
      })
      const data = await safeJson(res)
      if (!data) return null
      const instance = (data.instance ?? data) as Record<string, string>
      const token = (instance.token ?? data.token) as string
      const id    = (instance.id    ?? data.id)    as string
      if (!token) { console.error('[whatsapp.ts] createInstance sem token:', data); return null }
      return { token, id }
    } catch (err) {
      console.error('[whatsapp.ts] createInstance error:', err)
      return null
    }
  },

  /**
   * Lista todas as instâncias do servidor (admin).
   * Retorna array de { name, token, id, status }.
   */
  getInstances: async (): Promise<Array<{ name: string; token: string; id: string; status: string }>> => {
    try {
      const res = await fetch(`${BASE}/instance/all`, { headers })
      if (!res.ok) return []
      const data = await safeJson(res)
      if (!Array.isArray(data)) return []
      return data.map((i: unknown) => {
        const item = i as Record<string, unknown>
        return {
          name:   (item.name   ?? item.instanceName ?? '') as string,
          token:  (item.token  ?? '') as string,
          id:     (item.id     ?? '') as string,
          status: (item.status ?? 'disconnected') as string,
        }
      })
    } catch {
      return []
    }
  },

  /** Compat: retorna apenas os nomes (usado em código legado de sync) */
  getInstancesList: async (): Promise<string[]> => {
    const list = await evolutionApi.getInstances()
    return list.map(i => i.name).filter(Boolean)
  },

  // ── Por instância: todas usam ?token=<instanceToken> ─────────────────────────

  /**
   * Verifica o estado da conexão.
   * Retorna 'open' quando conectado, 'connecting', 'disconnected', 'not_found', etc.
   */
  getConnectionState: async (instanceToken: string): Promise<string> => {
    try {
      const res = await fetch(`${BASE}/instance/status?${tqs(instanceToken)}`, { headers })
      if (!res.ok) return 'not_found'
      const data = await safeJson(res)
      if (!data) return 'not_found'
      const status = (data.instance as Record<string, string>)?.status
                  ?? (data.status as string)
                  ?? 'close'
      return status
    } catch {
      return 'not_found'
    }
  },

  /**
   * Obtém o número de telefone do owner da instância conectada.
   */
  getOwnerPhone: async (instanceToken: string): Promise<string | null> => {
    try {
      const res = await fetch(`${BASE}/instance/status?${tqs(instanceToken)}`, { headers })
      const data = await safeJson(res)
      const inst = data?.instance as Record<string, string> | undefined
      const owner = inst?.owner ?? (data?.jid as string) ?? ''
      return owner ? owner.replace(/@.+$/, '') : null
    } catch {
      return null
    }
  },

  /**
   * Aciona a conexão e retorna QR code (ou indica que já está conectado).
   * Retorna { base64 } se QR disponível, { connected: true, owner } se já conectado.
   */
  getQrCode: async (instanceToken: string): Promise<{ base64?: string; connected?: boolean; owner?: string; error?: string }> => {
    try {
      const res = await fetch(`${BASE}/instance/connect?${tqs(instanceToken)}`, {
        method: 'POST',
        headers,
      })
      const data = await safeJson(res)
      if (!data) return { error: 'API não retornou resposta.' }

      // Já conectado
      const connected = data.connected as boolean
      if (connected) {
        const owner = (data.jid as string)
                   ?? (data.instance as Record<string, string>)?.owner
                   ?? ''
        return { connected: true, owner }
      }

      // QR disponível em instance.qrcode (string "data:image/png;base64,...")
      const inst   = data.instance as Record<string, string> | undefined
      const qrcode = inst?.qrcode ?? (data.qrcode as string) ?? ''
      if (qrcode) {
        const base64 = qrcode.startsWith('data:') ? qrcode.split(',')[1] : qrcode
        return { base64 }
      }

      return { error: 'QR não disponível ainda, tente em instantes.' }
    } catch (err) {
      return { error: `Erro de rede: ${String(err)}` }
    }
  },

  /** Desconecta (logout) a instância. UazapiGO usa GET para logout. */
  disconnectInstance: async (instanceToken: string): Promise<void> => {
    try {
      await fetch(`${BASE}/instance/logout?${tqs(instanceToken)}`, { method: 'GET', headers })
    } catch { /* noop */ }
  },

  /** Deleta a instância do servidor. UazapiGO usa GET para delete. */
  deleteInstance: async (instanceToken: string): Promise<void> => {
    try {
      await fetch(`${BASE}/instance/delete?${tqs(instanceToken)}`, { method: 'GET', headers })
    } catch { /* noop */ }
  },

  /** Configura o webhook da instância. */
  setWebhook: async (instanceToken: string, webhookUrl: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/webhook?${tqs(instanceToken)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: webhookUrl, enabled: true }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  // ── Contatos e Chats ─────────────────────────────────────────────────────────

  /** Retorna mapa { número: nome } com todos os contatos da instância */
  findContacts: async (instanceToken: string): Promise<Record<string, string>> => {
    try {
      const res = await fetch(`${BASE}/contacts?${tqs(instanceToken)}`, { headers })
      if (!res.ok) return {}
      const data = await safeJson(res)
      const list = Array.isArray(data) ? data : ((data?.contacts as unknown[]) ?? [])
      const map: Record<string, string> = {}
      for (const c of list as Record<string, unknown>[]) {
        const jid  = ((c.id ?? c.remoteJid ?? c.jid ?? '') as string).replace(/@.+$/, '')
        const name = ((c.pushName ?? c.name ?? c.notify ?? '') as string).trim()
        if (jid && name) map[jid] = name
      }
      return map
    } catch {
      return {}
    }
  },

  /** Retorna a lista de chats da instância. */
  findChats: async (instanceToken: string): Promise<Record<string, unknown>[] | null> => {
    try {
      const res = await fetch(`${BASE}/chats?${tqs(instanceToken)}`, { headers })
      const data = await safeJson(res)
      if (Array.isArray(data)) return data as Record<string, unknown>[]
      return (data?.chats as Record<string, unknown>[] | null) ?? null
    } catch {
      return null
    }
  },

  /** Retorna mensagens de um chat. */
  findMessages: async (instanceToken: string, remoteJid: string, limit = 50): Promise<Record<string, unknown> | null> => {
    try {
      const jidEncoded = encodeURIComponent(remoteJid)
      const res = await fetch(
        `${BASE}/messages?${tqs(instanceToken)}&jid=${jidEncoded}&limit=${limit}`,
        { headers },
      )
      return safeJson(res)
    } catch {
      return null
    }
  },

  /** Busca URL da foto de perfil de um contato. */
  fetchProfilePicture: async (instanceToken: string, number: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `${BASE}/contacts/photo?${tqs(instanceToken)}&number=${encodeURIComponent(number)}`,
        { headers },
      )
      if (!res.ok) return null
      const data = await safeJson(res)
      return (data?.url as string) ?? (data?.profilePictureUrl as string) ?? null
    } catch {
      return null
    }
  },

  /** Marca mensagens de um chat como lidas. UazapiGO usa GET para /messages/read. */
  markAsRead: async (instanceToken: string, remoteJid: string): Promise<void> => {
    try {
      await fetch(
        `${BASE}/messages/read?${tqs(instanceToken)}&jid=${encodeURIComponent(remoteJid)}`,
        { method: 'GET', headers },
      )
    } catch { /* noop */ }
  },

  // ── Envio de mensagens ───────────────────────────────────────────────────────

  // UazapiGO usa /send/* em vez de /messages/* para envio
  sendText: async (instanceToken: string, number: string, text: string): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch(`${BASE}/send/text?${tqs(instanceToken)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ number, text }),
      })
      return safeJson(res)
    } catch {
      return null
    }
  },

  sendTextWithQuote: async (
    instanceToken: string,
    number: string,
    text: string,
    quoted: { keyId: string; fromMe: boolean; remoteJid: string; content?: string },
  ): Promise<Record<string, unknown> | null> => {
    try {
      const res = await fetch(`${BASE}/send/text?${tqs(instanceToken)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          number, text,
          quoted: {
            key: { id: quoted.keyId, fromMe: quoted.fromMe, remoteJid: quoted.remoteJid },
            ...(quoted.content ? { message: { conversation: quoted.content } } : {}),
          },
        }),
      })
      return safeJson(res)
    } catch {
      return null
    }
  },

  sendAudio: async (instanceToken: string, number: string, audioBase64: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/send/media?${tqs(instanceToken)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ number, type: 'audio', base64: audioBase64, encoding: true }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  sendImageBase64: async (instanceToken: string, number: string, base64: string, caption = ''): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/send/media?${tqs(instanceToken)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ number, type: 'image', base64, caption }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  sendMediaUrl: async (
    instanceToken: string,
    number: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
    caption = '',
  ): Promise<boolean> => {
    try {
      const res = await fetch(`${BASE}/send/media?${tqs(instanceToken)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ number, type: mediaType, url: mediaUrl, caption }),
      })
      return res.ok
    } catch {
      return false
    }
  },

  sendTemplate: async (instanceToken: string, number: string, template: string, variables: Record<string, string>): Promise<Record<string, unknown> | null> => {
    let text = template
    Object.entries(variables).forEach(([key, value]) => { text = text.replace(`{{${key}}}`, value) })
    return evolutionApi.sendText(instanceToken, number, text)
  },

  // ── Mídia ────────────────────────────────────────────────────────────────────

  getMediaBase64: async (
    instanceToken: string,
    key: { id: string; fromMe: boolean; remoteJid: string },
  ): Promise<string | null> => {
    try {
      // UazapiGO usa GET para /media/download com o id da mensagem como query param
      const res = await fetch(
        `${BASE}/media/download?${tqs(instanceToken)}&id=${encodeURIComponent(key.id)}`,
        { method: 'GET', headers },
      )
      if (!res.ok) return null
      const data = await safeJson(res)
      return (data?.base64 as string) ?? null
    } catch {
      return null
    }
  },
}
