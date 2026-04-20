// Edge Function: whatsapp-webhook
// Recebe eventos da UazapiGO → armazena em whatsapp_messages → dispara Supabase Realtime
// Atualiza status da instância em whatsapp_instances quando a conexão muda.
// JWT desabilitado — UazapiGO chama sem token.
//
// Formato real do payload UazapiGO:
//   body.EventType    = "messages" | "connection" | "contacts" | ...
//   body.instanceName = nome da instância
//   body.message      = objeto da mensagem
//   body.chat         = objeto do chat/contato
//   body.owner        = número dono da instância

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Helpers para formato UazapiGO ──────────────────────────────────────────

/**
 * Normaliza EventType para string maiúscula padronizada.
 * UazapiGO: "messages" → "MESSAGES"
 * Evolution API (compat): "messages.upsert" → "MESSAGES_UPSERT"
 */
function normalizeEvent(event: string): string {
  return event.toUpperCase().replace(/\./g, '_')
}

/**
 * Extrai texto de uma mensagem no formato UazapiGO.
 * body.message.text  ← direto
 * body.message.content.text ← aninhado
 * body.message.content.caption ← mídia com legenda
 */
function extractTextUazapi(msg: Record<string, unknown>): string {
  if (msg.text && typeof msg.text === 'string' && msg.text !== '') return msg.text
  const content = msg.content as Record<string, unknown> | undefined
  if (content?.text && typeof content.text === 'string') return content.text as string
  if (content?.caption && typeof content.caption === 'string') return content.caption as string
  return ''
}

/**
 * Mapeia o campo `type` ou `messageType` do UazapiGO para tipo normalizado.
 * body.message.type = "media" para qualquer mídia (imagem, áudio, vídeo)
 * body.message.messageType = "ImageMessage" | "AudioMessage" | "VideoMessage" | "DocumentMessage" | "StickerMessage"
 * body.message.mediaType = "ptt" | "image" | "audio" | ...
 */
function normalizeType(t: string | undefined, messageType?: string, mediaType?: string): string {
  // Prioridade: messageType (mais específico) > mediaType > type
  for (const src of [messageType, mediaType, t]) {
    if (!src) continue
    const lower = src.toLowerCase()
    if (lower.includes('image') || lower === 'imagemessage') return 'image'
    if (lower.includes('audio') || lower === 'audiomessage' || lower === 'ptt') return 'audio'
    if (lower.includes('video') || lower === 'videomessage') return 'video'
    if (lower.includes('document') || lower === 'documentmessage') return 'document'
    if (lower.includes('sticker') || lower === 'stickermessage') return 'sticker'
    if (lower === 'text' || lower === 'extendedtextmessage') return 'text'
    if (lower === 'media') continue  // "media" é genérico, tenta próxima fonte
  }
  return t?.toLowerCase() ?? 'unknown'
}

/**
 * Extrai MIME type do payload UazapiGO.
 * body.message.content pode ter mimetype para mídias.
 */
function extractMime(msg: Record<string, unknown>): string | null {
  const content = msg.content as Record<string, unknown> | undefined
  return (content?.mimetype as string) ?? null
}

/**
 * Extrai URL de mídia do payload UazapiGO.
 * UazapiGO usa content.URL (maiúsculo) para a URL completa do CDN.
 */
function extractMediaUrl(msg: Record<string, unknown>): string | null {
  const content = msg.content as Record<string, unknown> | undefined
  if (!content) return null
  // UazapiGO usa "URL" maiúsculo para a URL completa do CDN WhatsApp
  const fullUrl = (content['URL'] as string) ?? (content['url'] as string)
  if (fullUrl && fullUrl.startsWith('http')) return fullUrl
  return null
}

/**
 * Extrai a mediaKey de criptografia do payload UazapiGO.
 * Necessária para descriptografar o arquivo .enc do CDN WhatsApp.
 */
function extractMediaKey(msg: Record<string, unknown>): string | null {
  const content = msg.content as Record<string, unknown> | undefined
  return (content?.mediaKey as string) ?? null
}

/**
 * Extrai duração em segundos para áudio/vídeo.
 */
function extractDuration(msg: Record<string, unknown>): number | null {
  const content = msg.content as Record<string, unknown> | undefined
  return (content?.seconds as number) ?? null
}

/**
 * Converte timestamp: UazapiGO envia em ms (13 dígitos), DB espera segundos (10 dígitos).
 */
function toSeconds(ts: number | undefined): number {
  if (!ts) return Math.floor(Date.now() / 1000)
  // Se > 1e12 está em ms, converte para s
  return ts > 1e12 ? Math.floor(ts / 1000) : ts
}

// ─── Helpers para formato Evolution API (compat) ─────────────────────────────

function extractContentEvolution(msg: Record<string, unknown>): string {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return ''
  return (
    (m.conversation as string) ||
    ((m.extendedTextMessage as Record<string, unknown>)?.text as string) ||
    ((m.imageMessage as Record<string, unknown>)?.caption as string) ||
    ((m.videoMessage as Record<string, unknown>)?.caption as string) ||
    ((m.documentMessage as Record<string, unknown>)?.title as string) ||
    ((m.documentMessage as Record<string, unknown>)?.fileName as string) ||
    ''
  )
}

function detectTypeEvolution(msg: Record<string, unknown>): string {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return 'unknown'
  if (m.conversation || m.extendedTextMessage) return 'text'
  if (m.imageMessage)                          return 'image'
  if (m.audioMessage || m.pttMessage)          return 'audio'
  if (m.videoMessage)                          return 'video'
  if (m.documentMessage)                       return 'document'
  if (m.stickerMessage)                        return 'sticker'
  return (msg.messageType as string) || 'unknown'
}

function detectMimeEvolution(msg: Record<string, unknown>): string | null {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return null
  for (const t of ['imageMessage', 'audioMessage', 'pttMessage', 'videoMessage', 'documentMessage', 'stickerMessage']) {
    if (m[t]) return ((m[t] as Record<string, unknown>).mimetype as string) ?? null
  }
  return null
}

function detectMediaUrlEvolution(msg: Record<string, unknown>): string | null {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return null
  for (const t of ['imageMessage', 'audioMessage', 'pttMessage', 'videoMessage', 'documentMessage', 'stickerMessage']) {
    const mediaMsg = m[t] as Record<string, unknown> | undefined
    if (mediaMsg) {
      return (mediaMsg.url as string) ?? (mediaMsg.directPath as string) ?? null
    }
  }
  return null
}

// ─── Handler principal ───────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const body = await req.json()

    // Log completo para diagnóstico
    console.log('[whatsapp-webhook] body:', JSON.stringify(body).slice(0, 1000))

    // ── Detecta formato: UazapiGO usa EventType, Evolution API usa event/type
    // UazapiGO: body.EventType = "messages" | "connection" | ...
    // Evolution API: body.event = "messages.upsert" | body.type = "MESSAGES_UPSERT"
    const rawEvent = (body.EventType as string | undefined)
      ?? (body.event as string | undefined)
      ?? (body.type as string | undefined)
      ?? ''
    const event = normalizeEvent(rawEvent)

    // Detecta se é formato UazapiGO (tem body.message e body.chat)
    const isUazapiFormat = !!(body.message && typeof body.message === 'object')

    // UazapiGO usa instanceName, Evolution API usa instance/instanceName/sender
    const instanceName: string = (
      (body.instanceName as string | undefined)
      ?? (body.instance_name as string | undefined)
      ?? (typeof body.instance === 'string' ? body.instance : undefined)
      ?? ((body.instance as Record<string, unknown>)?.name as string | undefined)
      ?? (body.sender as string | undefined)
      ?? ''
    )

    console.log('[whatsapp-webhook] event:', rawEvent, '| normalized:', event, '| instance:', instanceName || '(vazio)', '| uazapi:', isUazapiFormat)

    // ── DEBUG: salva raw body na tabela webhook_debug_log ─────────────────────
    try {
      await db.from('webhook_debug_log').insert({
        raw_body:       body,
        instance_found: instanceName || null,
        event_found:    rawEvent || null,
        status:         instanceName ? 'has_instance' : 'missing_instance',
      })
    } catch (dbgErr) {
      console.warn('[whatsapp-webhook] debug_log insert failed:', dbgErr)
    }

    if (!instanceName) return json({ ok: false, error: 'missing instance', body_keys: Object.keys(body) }, 400)

    // ── Busca store pela instância (tabela whatsapp_instances) ────────────────
    const { data: inst } = await db
      .from('whatsapp_instances')
      .select('id, store_id')
      .eq('instance_name', instanceName)
      .maybeSingle()

    const storeId    = inst?.store_id as string | undefined
    const instanceId = inst?.id as string | undefined

    // ── CONNECTION_UPDATE — mudança de status da conexão ─────────────────────
    // UazapiGO: EventType="connection", body.message.status ou body.message.connected
    // Evolution API: event="CONNECTION_UPDATE", body.data.state
    if ((event === 'CONNECTION' || event === 'CONNECTION_UPDATE') && instanceId) {
      const uMsg = isUazapiFormat ? (body.message as Record<string, unknown>) : null

      const state = uMsg
        // UazapiGO: message.connected=true/false ou message.state="open"/"close"
        ? (uMsg.connected === true ? 'open'
           : uMsg.connected === false ? 'close'
           : (uMsg.state as string) ?? '')
        // Evolution API
        : ((body.data?.state as string)
           ?? (body.data?.instance?.state as string)
           ?? (body.data?.connection as string)
           ?? '')

      if (state) {
        const update: Record<string, unknown> = {
          status: (state === 'open') ? 'connected' : 'disconnected',
        }
        if (state === 'open') {
          update.connected_at = new Date().toISOString()
          const owner = (uMsg?.owner as string)
            ?? (body.owner as string)
            ?? (body.data?.instance?.owner as string)
            ?? (body.data?.owner as string)
            ?? ''
          if (owner) {
            update.owner_jid    = owner.includes('@') ? owner : `${owner}@s.whatsapp.net`
            update.phone_number = owner.replace(/@.+$/, '')
          }
        }
        await db.from('whatsapp_instances').update(update).eq('id', instanceId)
      }
    }

    if (!storeId) return json({ ok: true, skipped: 'no_store' })

    // ── MESSAGES — nova mensagem (UazapiGO EventType="messages") ─────────────
    // ── MESSAGES_UPSERT — mesmo para Evolution API ────────────────────────────
    if (event === 'MESSAGES' || event === 'MESSAGES_UPSERT') {

      if (isUazapiFormat) {
        // ── Formato UazapiGO ──────────────────────────────────────────────────
        const msg   = body.message as Record<string, unknown>
        const chat  = (body.chat as Record<string, unknown>) ?? {}

        const remoteJid = (msg.chatid as string) ?? ''
        const fromMe    = (msg.fromMe as boolean) ?? false
        const messageId = (msg.messageid as string) ?? (msg.id as string) ?? ''

        if (!remoteJid) return json({ ok: true, skipped: 'no_remote_jid' })
        if (remoteJid.includes('@broadcast') || remoteJid.includes('status@')) return json({ ok: true, skipped: 'broadcast' })
        if (remoteJid.endsWith('@g.us')) return json({ ok: true, skipped: 'group' })

        // Deduplicação
        if (messageId) {
          const { count } = await db
            .from('whatsapp_messages')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', storeId)
            .eq('message_id', messageId)
          if ((count ?? 0) > 0) return json({ ok: true, skipped: 'duplicate' })
        }

        const contactPhone = remoteJid.replace(/@.+$/, '')
        const msgType      = normalizeType(
          msg.type as string,
          msg.messageType as string,
          msg.mediaType as string,
        )
        const content      = extractTextUazapi(msg)
        const ts           = toSeconds(msg.messageTimestamp as number)
        const pushName     = (chat.name as string) ?? (chat.wa_contactName as string) ?? (msg.senderName as string) ?? null

        const { error: insertErr } = await db.from('whatsapp_messages').insert({
          store_id:        storeId,
          instance_name:   instanceName,
          remote_jid:      remoteJid,
          message_id:      messageId || null,
          direction:       fromMe ? 'outbound' : 'inbound',
          type:            msgType,
          content:         content || null,
          status:          fromMe ? 'sent' : 'received',
          push_name:       pushName,
          contact_phone:   contactPhone || null,
          message_ts:      ts,
          media_mime_type: extractMime(msg),
          media_url:       extractMediaUrl(msg),
          media_key:       extractMediaKey(msg),
          key_id:          messageId || null,
          from_me:         fromMe,
        })

        if (insertErr) console.error('[whatsapp-webhook] insert error:', insertErr)

        // Auto-cria lead quando cliente envia mensagem
        if (!fromMe && contactPhone) {
          await upsertLeadFromWhatsApp(db, storeId, contactPhone, pushName ?? '')
        }

      } else {
        // ── Formato Evolution API (compat) ────────────────────────────────────
        const dataArr = Array.isArray(body.data) ? body.data : [body.data]

        for (const msg of dataArr as Record<string, unknown>[]) {
          if (!msg) continue
          const key = msg.key as Record<string, unknown> | undefined
          if (!key) continue

          const remoteJid = key.remoteJid as string
          const fromMe    = (key.fromMe as boolean) ?? false
          const messageId = key.id as string

          if (!remoteJid) continue
          if (remoteJid.includes('@broadcast') || remoteJid.includes('status@')) continue
          if (remoteJid.endsWith('@g.us')) continue

          if (messageId) {
            const { count } = await db
              .from('whatsapp_messages')
              .select('id', { count: 'exact', head: true })
              .eq('store_id', storeId)
              .eq('message_id', messageId)
            if ((count ?? 0) > 0) continue
          }

          const contactPhone = remoteJid.replace(/@.+$/, '')

          await db.from('whatsapp_messages').insert({
            store_id:        storeId,
            instance_name:   instanceName,
            remote_jid:      remoteJid,
            message_id:      messageId || null,
            direction:       fromMe ? 'outbound' : 'inbound',
            type:            detectTypeEvolution(msg),
            content:         extractContentEvolution(msg) || null,
            status:          fromMe ? 'sent' : 'received',
            push_name:       (msg.pushName as string) ?? null,
            contact_phone:   contactPhone || null,
            message_ts:      (msg.messageTimestamp as number) ?? Math.floor(Date.now() / 1000),
            media_mime_type: detectMimeEvolution(msg),
            media_url:       detectMediaUrlEvolution(msg),
            key_id:          messageId || null,
            from_me:         fromMe,
          })

          if (!fromMe && contactPhone) {
            await upsertLeadFromWhatsApp(db, storeId, contactPhone, msg.pushName as string ?? '')
          }
        }
      }
    }

    // ── MESSAGES_UPDATE — status de leitura/entrega ───────────────────────────
    if (event === 'MESSAGES_UPDATE') {
      const updArr = Array.isArray(body.data) ? body.data : [body.data]
      for (const upd of updArr as Record<string, unknown>[]) {
        const updKey = upd?.key as Record<string, unknown> | undefined
        const rawStatus = (upd?.update as Record<string, unknown>)?.status
        const status = mapStatus(rawStatus)
        if (!updKey?.id || !status) continue
        await db
          .from('whatsapp_messages')
          .update({ status })
          .eq('store_id', storeId)
          .eq('message_id', updKey.id as string)
      }
    }

    return json({ ok: true, event: rawEvent || 'unknown' })

  } catch (err) {
    console.error('[whatsapp-webhook]', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})

// ─── Auto-criação de lead quando cliente envia primeira mensagem ─────────────

async function upsertLeadFromWhatsApp(
  // deno-lint-ignore no-explicit-any
  db: any,
  storeId: string,
  phone: string,
  pushName: string,
) {
  try {
    const last8 = phone.slice(-8)
    const { data: existing } = await db
      .from('leads')
      .select('id, client_phone')
      .eq('store_id', storeId)
      .ilike('client_phone', `%${last8}`)
      .limit(1)

    if (existing && existing.length > 0) return

    const { data: firstStage } = await db
      .from('pipeline_stages')
      .select('id')
      .eq('store_id', storeId)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (!firstStage?.id) return

    const clientName = pushName?.trim() || `WhatsApp ${phone}`

    await db.from('leads').insert({
      store_id:     storeId,
      stage_id:     firstStage.id,
      client_name:  clientName,
      client_phone: phone,
      source:       'whatsapp',
      temperature:  'warm',
      status:       'active',
    })
  } catch (err) {
    console.warn('[whatsapp-webhook] upsertLead warning:', err)
  }
}

// ─── Mapeamento de status de mensagem ────────────────────────────────────────

function mapStatus(status: number | string | unknown): string | null {
  const map: Record<string | number, string> = {
    0: 'error',
    1: 'pending',
    2: 'sent',
    3: 'delivered',
    4: 'read',
    5: 'read',
    'ERROR':         'error',
    'PENDING':       'pending',
    'SERVER_ACK':    'sent',
    'DELIVERY_ACK':  'delivered',
    'READ':          'read',
    'PLAYED':        'read',
  }
  return (status !== null && status !== undefined) ? (map[status as string | number] ?? null) : null
}
