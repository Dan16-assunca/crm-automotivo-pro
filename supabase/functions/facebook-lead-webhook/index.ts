// Edge Function: facebook-lead-webhook
// Recebe eventos de Lead Ads do Facebook e cria leads no CRM.
//
// GET  → verificação do webhook pelo Facebook (hub.challenge)
// POST → evento leadgen: busca dados do lead na Graph API → cria lead no banco

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const FB_APP_SECRET   = Deno.env.get('FB_APP_SECRET')   ?? ''
const GRAPH_API_VER   = Deno.env.get('FB_GRAPH_VERSION') ?? 'v19.0'
const UAZAPI_BASE_URL = (Deno.env.get('UAZAPI_BASE_URL') ?? '').replace(/\/$/, '')
const UAZAPI_ADMIN_TOKEN = Deno.env.get('UAZAPI_ADMIN_TOKEN') ?? ''

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FbFieldData  { name: string; values: string[] }
interface FbLeadDetail {
  id: string
  created_time: string
  field_data: FbFieldData[]
  ad_id?: string
  adset_id?: string
  campaign_id?: string
  form_id?: string
}

interface FbChangeValue {
  leadgen_id:  string
  page_id:     string
  ad_id?:      string
  adset_id?:   string
  campaign_id?: string
  form_id?:    string
  created_time?: number
}

interface FbWebhookBody {
  object: string
  entry: Array<{
    id: string
    time: number
    changes: Array<{ field: string; value: FbChangeValue }>
  }>
}

// ─── HMAC-SHA256 ──────────────────────────────────────────────────────────────

async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature || !FB_APP_SECRET) return !FB_APP_SECRET // sem chave → aceita (dev)
  const expected = signature.replace(/^sha256=/, '')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(FB_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex === expected
}

// ─── Busca detalhes do lead na Graph API ──────────────────────────────────────

async function fetchLeadDetail(leadgenId: string, pageAccessToken: string): Promise<FbLeadDetail | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VER}/${leadgenId}?fields=id,created_time,field_data,ad_id,adset_id,campaign_id,form_id&access_token=${pageAccessToken}`,
    )
    if (!res.ok) {
      console.error('[fb-webhook] Graph API error:', res.status, await res.text())
      return null
    }
    return await res.json() as FbLeadDetail
  } catch (e) {
    console.error('[fb-webhook] fetchLeadDetail error:', e)
    return null
  }
}

// ─── Parseia field_data em objeto simples ─────────────────────────────────────

function parseFields(fieldData: FbFieldData[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const f of fieldData ?? []) {
    map[f.name.toLowerCase().replace(/\s+/g, '_')] = f.values?.[0] ?? ''
  }
  return map
}

// ─── Envia WhatsApp de boas-vindas para o lead ────────────────────────────────

async function sendWelcomeWhatsApp(
  instanceToken: string,
  phone: string,
  name: string,
  storeName: string,
): Promise<void> {
  if (!UAZAPI_BASE_URL || !instanceToken || !phone) return
  const message = `Olá ${name}! 👋 Recebemos seu interesse pela ${storeName}. Em breve um de nossos consultores vai entrar em contato. 🚗`
  try {
    await fetch(`${UAZAPI_BASE_URL}/message/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'admintoken': UAZAPI_ADMIN_TOKEN,
        'instancetoken': instanceToken,
      },
      body: JSON.stringify({ number: phone.replace(/\D/g, ''), text: message }),
    })
  } catch (e) {
    console.error('[fb-webhook] sendWelcomeWhatsApp error:', e)
  }
}

// ─── Processa um único evento leadgen ────────────────────────────────────────

async function processLeadgen(value: FbChangeValue): Promise<void> {
  const { leadgen_id, page_id, ad_id, adset_id, campaign_id } = value

  // 1. Encontra a integração pelo page_id
  const { data: fbConfig, error: cfgErr } = await supabase
    .from('facebook_integrations')
    .select(`
      id, store_id, page_access_token, default_stage_id,
      default_salesperson_id, default_temperature, active,
      stores(name)
    `)
    .eq('page_id', page_id)
    .eq('active', true)
    .maybeSingle()

  if (cfgErr || !fbConfig) {
    console.warn(`[fb-webhook] Nenhuma integração ativa para page_id=${page_id}`)
    return
  }

  const storeId   = fbConfig.store_id
  const storeName = (fbConfig.stores as { name: string } | null)?.name ?? 'Nossa loja'

  // 2. Busca os dados do lead na Graph API
  const detail = await fetchLeadDetail(leadgen_id, fbConfig.page_access_token)
  if (!detail) {
    console.error(`[fb-webhook] Não foi possível buscar leadgen_id=${leadgen_id}`)
    return
  }

  const fields = parseFields(detail.field_data)
  const adCampaignId = campaign_id ?? detail.campaign_id
  const adAdsetId    = adset_id    ?? detail.adset_id
  const adAdId       = ad_id       ?? detail.ad_id

  // 3. Tenta encontrar campanha cadastrada pelo campaign_id para pegar UTMs
  let utmSource    = 'facebook'
  let utmMedium    = 'lead_ads'
  let utmCampaign: string | null = null
  let utmContent:  string | null = null

  if (adCampaignId) {
    const { data: adCamp } = await supabase
      .from('ad_campaigns')
      .select('utm_source, utm_medium, utm_campaign, utm_content')
      .eq('store_id', storeId)
      .eq('campaign_id', adCampaignId)
      .maybeSingle()

    if (adCamp) {
      utmSource   = adCamp.utm_source   ?? utmSource
      utmMedium   = adCamp.utm_medium   ?? utmMedium
      utmCampaign = adCamp.utm_campaign ?? null
      utmContent  = adCamp.utm_content  ?? null
    }
  }

  // 4. Usa stage padrão da integração ou o primeiro do pipeline
  let stageId = fbConfig.default_stage_id
  if (!stageId) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('store_id', storeId)
      .order('position', { ascending: true })
      .limit(1)
      .single()
    stageId = firstStage?.id ?? null
  }

  // 5. Monta nome e telefone
  const clientName  = fields.full_name ?? fields.nome_completo ?? fields.name ?? fields.nome ?? 'Lead Facebook'
  const clientPhone = fields.phone_number ?? fields.telefone ?? fields.phone ?? fields.whatsapp ?? null
  const clientEmail = fields.email ?? null
  const vehicle     = fields.veiculo ?? fields.carro ?? fields.interesse ?? null
  const budget      = fields.orcamento ?? fields.budget ?? null
  const city        = fields.cidade ?? fields.city ?? null
  const notes       = fields.mensagem ?? fields.message ?? fields.observacao ?? null

  // 6. Cria o lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .insert({
      store_id:         storeId,
      salesperson_id:   fbConfig.default_salesperson_id ?? null,
      stage_id:         stageId,
      client_name:      clientName,
      client_phone:     clientPhone,
      client_email:     clientEmail,
      client_city:      city,
      vehicle_interest: vehicle,
      budget_max:       budget ? parseFloat(budget.replace(/\D/g, '')) || null : null,
      source:           'meta_ads',
      temperature:      fbConfig.default_temperature ?? 'hot',
      priority:         'high',
      status:           'active',
      notes:            notes,
      tags:             ['facebook_lead_ads'],
      // UTM & attribution
      utm_source:       utmSource,
      utm_medium:       utmMedium,
      utm_campaign:     utmCampaign,
      utm_content:      utmContent,
      utm_ad_id:        adAdId ?? null,
      utm_adset_id:     adAdsetId ?? null,
      utm_campaign_id:  adCampaignId ?? null,
      referrer:         `facebook_leadgen:${leadgen_id}`,
    })
    .select('id')
    .single()

  if (leadErr) {
    console.error('[fb-webhook] Erro ao criar lead:', leadErr)
    return
  }

  console.log(`[fb-webhook] Lead criado: id=${lead.id} store=${storeId} name="${clientName}"`)

  // 7. Registra atividade
  await supabase.from('activities').insert({
    lead_id:     lead.id,
    store_id:    storeId,
    user_id:     fbConfig.default_salesperson_id ?? storeId, // fallback
    type:        'system',
    title:       'Lead recebido via Facebook Lead Ads',
    description: `Formulário preenchido no Facebook. Ad ID: ${adAdId ?? '—'} · Adset: ${adAdsetId ?? '—'} · Campaign: ${adCampaignId ?? '—'}`,
    metadata:    { leadgen_id, ad_id: adAdId, adset_id: adAdsetId, campaign_id: adCampaignId, raw_fields: fields },
    created_at:  new Date().toISOString(),
  })

  // 8. Envia WhatsApp de boas-vindas ao lead (se tiver telefone e instância conectada)
  if (clientPhone) {
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('instance_token')
      .eq('store_id', storeId)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle()

    if (instance?.instance_token) {
      await sendWelcomeWhatsApp(instance.instance_token, clientPhone, clientName.split(' ')[0], storeName)
    }
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // ── GET: verificação do webhook ──────────────────────────────────────────────
  if (req.method === 'GET') {
    const url       = new URL(req.url)
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token && challenge) {
      // Verifica se o verify_token existe em alguma integração ativa
      const { data } = await supabase
        .from('facebook_integrations')
        .select('id')
        .eq('verify_token', token)
        .eq('active', true)
        .maybeSingle()

      if (data) {
        console.log(`[fb-webhook] Webhook verificado com sucesso (token=${token})`)
        return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
      }
    }

    return new Response('Forbidden', { status: 403 })
  }

  // ── POST: evento de lead ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const rawBody = await req.text()

    // Verifica assinatura HMAC-SHA256
    const signature = req.headers.get('x-hub-signature-256')
    const valid = await verifySignature(rawBody, signature)
    if (!valid) {
      console.error('[fb-webhook] Assinatura inválida!')
      return new Response('Invalid signature', { status: 401 })
    }

    let body: FbWebhookBody
    try {
      body = JSON.parse(rawBody)
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    // Facebook espera 200 em < 20s — processamos de forma assíncrona
    if (body.object !== 'page') {
      return new Response('OK', { status: 200 })
    }

    // Processa cada evento em background (não bloqueia o 200)
    const tasks: Promise<void>[] = []
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === 'leadgen') {
          tasks.push(processLeadgen(change.value))
        }
      }
    }

    // Aguarda todas (ainda dentro do tempo limite de 20s)
    await Promise.allSettled(tasks)

    return new Response('OK', { status: 200 })
  }

  return new Response('Method not allowed', { status: 405 })
})
