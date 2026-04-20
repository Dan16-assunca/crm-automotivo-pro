// Edge Function: whatsapp-media
// Descriptografa e retorna mídia WhatsApp recebida via webhook.
//
// WhatsApp criptografa mídia com AES-256-CBC usando chave derivada via HKDF-SHA256 da mediaKey.
// Esta função:
//   1. Recebe ?message_id=<id>
//   2. Busca media_url, media_key, type no banco
//   3. Baixa o .enc do CDN WhatsApp
//   4. Descriptografa
//   5. Retorna base64 com o mime type correto

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// Mapeamento de tipo para appInfo da chave WhatsApp
const APP_INFO: Record<string, string> = {
  image:    'WhatsApp Image Keys',
  audio:    'WhatsApp Audio Keys',
  video:    'WhatsApp Video Keys',
  document: 'WhatsApp Document Keys',
  sticker:  'WhatsApp Image Keys',
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * Descriptografa arquivo de mídia WhatsApp.
 * Algoritmo: HKDF-SHA256(mediaKey, salt=0x00*32, info=appInfo, length=112)
 * → iv = expanded[0:16], cipherKey = expanded[16:48]
 * → AES-256-CBC decrypt(encFile[0:-10], cipherKey, iv)
 */
async function decryptWhatsAppMedia(
  encryptedUrl: string,
  mediaKeyB64: string,
  mediaType: string,
): Promise<Uint8Array | null> {
  try {
    const appInfoStr = APP_INFO[mediaType] ?? APP_INFO['document']
    const appInfo    = new TextEncoder().encode(appInfoStr)
    const mediaKey   = base64ToBytes(mediaKeyB64)

    // HKDF expand
    const hkdfKey = await crypto.subtle.importKey('raw', mediaKey, 'HKDF', false, ['deriveBits'])
    const expanded = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: appInfo },
      hkdfKey,
      112 * 8,
    )

    const expandedBytes = new Uint8Array(expanded)
    const iv        = expandedBytes.slice(0, 16)
    const cipherKey = expandedBytes.slice(16, 48)

    // Baixa arquivo criptografado do CDN WhatsApp
    const encResp = await fetch(encryptedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    })
    if (!encResp.ok) {
      console.error('[whatsapp-media] CDN fetch failed:', encResp.status, encryptedUrl.slice(0, 80))
      return null
    }
    const encBytes = new Uint8Array(await encResp.arrayBuffer())

    // Remove últimos 10 bytes (HMAC-SHA256 parcial)
    const ciphertext = encBytes.slice(0, -10)

    // Descriptografa AES-256-CBC
    const aesKey    = await crypto.subtle.importKey('raw', cipherKey, { name: 'AES-CBC' }, false, ['decrypt'])
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ciphertext)

    return new Uint8Array(decrypted)
  } catch (err) {
    console.error('[whatsapp-media] decrypt error:', err)
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const url       = new URL(req.url)
    const messageId = url.searchParams.get('message_id')
    if (!messageId) return json({ error: 'message_id required' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!

    // Usa o JWT do usuário para validar store_id via RLS
    const authHeader = req.headers.get('Authorization') ?? ''
    const userToken  = authHeader.replace(/^Bearer\s+/i, '')

    // Cliente com contexto do usuário — RLS garante isolamento por store
    const userDb = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })

    // Busca dados da mensagem — RLS restringe ao store do usuário automaticamente
    const { data: msg, error: dbErr } = await userDb
      .from('whatsapp_messages')
      .select('media_url, media_key, media_mime_type, type')
      .eq('message_id', messageId)
      .maybeSingle()

    if (dbErr || !msg) return json({ error: 'message not found' }, 404)
    if (!msg.media_url) return json({ error: 'no media_url' }, 404)
    if (!msg.media_key) return json({ error: 'no media_key (mensagem antiga)' }, 404)

    const decrypted = await decryptWhatsAppMedia(msg.media_url, msg.media_key, msg.type ?? 'document')
    if (!decrypted) return json({ error: 'decrypt failed' }, 500)

    const mime   = (msg.media_mime_type as string) || 'application/octet-stream'
    const b64    = bytesToBase64(decrypted)

    return json({ base64: b64, mimeType: mime })

  } catch (err) {
    console.error('[whatsapp-media]', err)
    return json({ error: String(err) }, 500)
  }
})
