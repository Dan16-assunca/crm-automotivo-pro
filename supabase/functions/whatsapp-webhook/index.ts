// Edge Function: whatsapp-webhook
// Recebe eventos da Uazapi (compatível Evolution API) → armazena em whatsapp_messages → dispara Supabase Realtime
// Atualiza status da instância em whatsapp_instances quando a conexão muda.
// JWT desabilitado — Uazapi chama sem token.
//
// Migrado: Evolution API → Uazapi
// Uazapi usa event names com letras minúsculas e ponto: "messages.upsert", "connection.update"
// Evolution API usava maiúsculas com underscore: "MESSAGES_UPSERT", "CONNECTION_UPDATE"
// Este handler aceita AMBOS os formatos para compatibilidade durante transição.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normaliza event name: "messages.upsert" ou "MESSAGES_UPSERT" → "MESSAGES_UPSERT" */
function normalizeEvent(event: string): string {
  return event.toUpperCase().replace(/\./g, '_')
}

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
  if (m.imageMessage)                          return 'image'
  if (m.audioMessage || m.pttMessage)          return 'audio'
  if (m.videoMessage)                          return 'video'
  if (m.documentMessage)                       return 'document'
  if (m.stickerMessage)                        return 'sticker'
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

/**
 * Extrai URL de mídia do payload da mensagem.
 * Uazapi inclui a URL diretamente no webhook — não precisa buscar via API separada.
 */
function detectMediaUrl(msg: Record<string, unknown>): string | null {
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

    // Log completo para diagnóstico (remover após debug)
    console.log('[whatsapp-webhook] body:', JSON.stringify(body).slice(0, 800))

    const rawEvent = (body.event as string | undefined)
      ?? (body.type as string | undefined)
      ?? ''
    const event = normalizeEvent(rawEvent)

    // UazapiGO pode enviar o nome da instância em vários campos
    const instanceName: string = (
      (typeof body.instance === 'string' ? body.instance : undefined)
      ?? (body.instanceName as string | undefined)
      ?? (body.instance_name as string | undefined)
      ?? ((body.instance as Record<string, unknown>)?.name as string | undefined)
      ?? (body.sender as string | undefined)
      ?? ''
    )

    console.log('[whatsapp-webhook] event:', rawEvent, '| instance:', instanceName || '(vazio)')

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
    if (event === 'CONNECTION_UPDATE' && instanceId) {
      // Uazapi: body.data.state ou body.data.instance.state
      const state = (body.data?.state as string)
        ?? (body.data?.instance?.state as string)
        ?? (body.data?.connection as string)  // formato alternativo
      if (state) {
        const update: Record<string, unknown> = {
          status: (state === 'open') ? 'connected' : 'disconnected',
        }
        if (state === 'open') {
          update.connected_at = new Date().toISOString()
          const owner = (body.data?.instance?.owner as string)
            ?? (body.data?.owner as string)
            ?? ''
          if (owner) {
            update.owner_jid    = owner
            update.phone_number = owner.replace(/@.+$/, '')
          }
        }
        await db.from('whatsapp_instances').update(update).eq('id', instanceId)
      }
    }

    if (!storeId) return json({ ok: true, skipped: 'no_store' })

    // ── MESSAGES_UPSERT — nova mensagem recebida ou enviada ───────────────────
    if (event === 'MESSAGES_UPSERT') {
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
        // Ignora grupos
        if (remoteJid.endsWith('@g.us')) continue

        // Deduplicação
        if (messageId) {
          const { count } = await db
            .from('whatsapp_messages')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', storeId)
            .eq('message_id', messageId)
          if ((count ?? 0) > 0) continue
        }

        // Extrai telefone limpo (sem @s.whatsapp.net)
        const contactPhone = remoteJid.replace(/@.+$/, '')

        await db.from('whatsapp_messages').insert({
          store_id:        storeId,
          instance_name:   instanceName,
          remote_jid:      remoteJid,
          message_id:      messageId || null,
          direction:       fromMe ? 'outbound' : 'inbound',
          type:            detectType(msg),
          content:         extractContent(msg) || null,
          status:          fromMe ? 'sent' : 'received',
          push_name:       (msg.pushName as string) ?? null,
          contact_phone:   contactPhone || null,
          message_ts:      (msg.messageTimestamp as number) ?? Math.floor(Date.now() / 1000),
          media_mime_type: detectMime(msg),
          media_url:       detectMediaUrl(msg),
          key_id:          messageId || null,
          from_me:         fromMe,
        })

        // Auto-cria/atualiza lead quando cliente envia mensagem
        if (!fromMe && contactPhone) {
          await upsertLeadFromWhatsApp(db, storeId, contactPhone, msg.pushName as string ?? '')
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

    // ── CONTACTS_UPDATE — nome/foto do contato atualizado ────────────────────
    if (event === 'CONTACTS_UPDATE') {
      // Apenas logamos — a atualização de contatos é feita via findContacts no frontend
      console.log(`[whatsapp-webhook] CONTACTS_UPDATE para ${instanceName}`)
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
    // Verifica se já existe lead com esse telefone (últimos 8 dígitos para tolerar DDI)
    const last8 = phone.slice(-8)
    const { data: existing } = await db
      .from('leads')
      .select('id, client_phone')
      .eq('store_id', storeId)
      .ilike('client_phone', `%${last8}`)
      .limit(1)

    if (existing && existing.length > 0) return  // lead já existe

    // Busca primeiro estágio do pipeline
    const { data: firstStage } = await db
      .from('pipeline_stages')
      .select('id')
      .eq('store_id', storeId)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    if (!firstStage?.id) return  // sem pipeline configurado

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
    // Não é fatal — lead pode ser criado manualmente
    console.warn('[whatsapp-webhook] upsertLead warning:', err)
  }
}

// ─── Mapeamento de status de mensagem ────────────────────────────────────────

function mapStatus(status: number | string | unknown): string | null {
  const map: Record<string | number, string> = {
    // Numérico (Uazapi/Baileys)
    0: 'error',
    1: 'pending',
    2: 'sent',
    3: 'delivered',
    4: 'read',
    5: 'read',  // PLAYED (áudio ouvido)
    // String
    'ERROR':         'error',
    'PENDING':       'pending',
    'SERVER_ACK':    'sent',
    'DELIVERY_ACK':  'delivered',
    'READ':          'read',
    'PLAYED':        'read',
  }
  return (status !== null && status !== undefined) ? (map[status as string | number] ?? null) : null
}
