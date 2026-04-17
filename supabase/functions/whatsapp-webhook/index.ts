// Edge Function: whatsapp-webhook
// Recebe eventos da Evolution API → armazena em whatsapp_messages → dispara Supabase Realtime
// Registrado automaticamente quando a instância conecta em Settings.tsx

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractContent(msg: Record<string, unknown>): string {
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

function detectType(msg: Record<string, unknown>): string {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return 'unknown'
  if (m.conversation || m.extendedTextMessage) return 'text'
  if (m.imageMessage)    return 'image'
  if (m.audioMessage || m.pttMessage) return 'audio'
  if (m.videoMessage)    return 'video'
  if (m.documentMessage) return 'document'
  if (m.stickerMessage)  return 'sticker'
  return (msg.messageType as string) || 'unknown'
}

function detectMime(msg: Record<string, unknown>): string | null {
  const m = msg?.message as Record<string, unknown> | undefined
  if (!m) return null
  for (const t of ['imageMessage', 'audioMessage', 'pttMessage', 'videoMessage', 'documentMessage', 'stickerMessage']) {
    if (m[t]) return ((m[t] as Record<string, unknown>).mimetype as string) ?? null
  }
  return null
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

    const body           = await req.json()
    const event          = body.event as string | undefined
    const instanceName   = body.instance as string | undefined

    if (!instanceName) return json({ ok: false, error: 'missing instance' }, 400)

    // ── Encontra a loja pelo nome da instância ────────────────────────────────
    const { data: stores } = await db
      .from('stores')
      .select('id')
      .eq('settings->>whatsapp_instance', instanceName)
      .limit(1)

    const storeId = stores?.[0]?.id as string | undefined
    if (!storeId) {
      // Instância não registrada em nenhuma loja — OK, apenas ignora
      return json({ ok: true, skipped: 'no_store' })
    }

    // ── MESSAGES_UPSERT — nova mensagem recebida ou enviada ───────────────────
    if (event === 'MESSAGES_UPSERT') {
      const dataArr = Array.isArray(body.data) ? body.data : [body.data]

      for (const msg of dataArr as Record<string, unknown>[]) {
        if (!msg) continue
        const key      = msg.key as Record<string, unknown> | undefined
        if (!key) continue

        const remoteJid = key.remoteJid as string
        const fromMe    = (key.fromMe as boolean) ?? false
        const messageId = key.id as string

        // Filtra status/broadcast
        if (!remoteJid) continue
        if (remoteJid.includes('@broadcast') || remoteJid.includes('status@')) continue

        const content   = extractContent(msg)
        const type      = detectType(msg)
        const mimeType  = detectMime(msg)
        const pushName  = (msg.pushName as string) ?? null
        const timestamp = (msg.messageTimestamp as number) ?? Math.floor(Date.now() / 1000)

        // Verifica se já existe (deduplicação)
        if (messageId) {
          const { count } = await db
            .from('whatsapp_messages')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', storeId)
            .eq('message_id', messageId)

          if ((count ?? 0) > 0) continue
        }

        await db.from('whatsapp_messages').insert({
          store_id:        storeId,
          instance_name:   instanceName,
          remote_jid:      remoteJid,
          message_id:      messageId || null,
          direction:       fromMe ? 'outbound' : 'inbound',
          type,
          content:         content || null,
          status:          fromMe ? 'sent' : 'received',
          push_name:       pushName,
          message_ts:      timestamp,
          media_mime_type: mimeType,
          key_id:          messageId || null,
          from_me:         fromMe,
        })
      }
    }

    // ── MESSAGES_UPDATE — atualização de status (lido, entregue, etc.) ────────
    if (event === 'MESSAGES_UPDATE') {
      const updArr = Array.isArray(body.data) ? body.data : [body.data]

      for (const upd of updArr as Record<string, unknown>[]) {
        const updKey = upd?.key as Record<string, unknown> | undefined
        const status = (upd?.update as Record<string, unknown>)?.status as string | undefined
        if (!updKey?.id || !status) continue

        await db
          .from('whatsapp_messages')
          .update({ status })
          .eq('store_id', storeId)
          .eq('message_id', updKey.id as string)
      }
    }

    return json({ ok: true, event: event ?? 'unknown' })

  } catch (err) {
    console.error('[whatsapp-webhook]', err)
    return json({ ok: false, error: String(err) }, 500)
  }
})
