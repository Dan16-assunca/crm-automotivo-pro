// Edge Function: google-lead-webhook
// Recebe leads do Google Ads Lead Form Assets.
//
// GET  → Google verifica que a URL retorna 200 (sem desafio)
// POST → payload com dados do lead + google_key para identificar a loja
//
// Documentação: https://support.google.com/google-ads/answer/12395217

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const UAZAPI_BASE_URL     = (Deno.env.get('UAZAPI_BASE_URL') ?? '').replace(/\/$/, '')
const UAZAPI_ADMIN_TOKEN  = Deno.env.get('UAZAPI_ADMIN_TOKEN') ?? ''
const ANTHROPIC_API_KEY   = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

// ─── Tipos Google Lead Form payload ──────────────────────────────────────────

interface GoogleColumnData {
  column_id: string   // ex: FULL_NAME, EMAIL, PHONE_NUMBER, CITY, POSTAL_CODE
  string_value?: string
}

interface GoogleLeadPayload {
  google_key:     string   // chave de autenticação configurada no Google Ads
  user_column_data: GoogleColumnData[]
  campaign_id?:   string
  campaign_name?: string
  adgroup_id?:    string
  adgroup_name?:  string
  creative_id?:   string
  gcl_id?:        string   // Google Click ID
  is_test?:       boolean
  adformat?:      string
  api_version?:   string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseColumns(data: GoogleColumnData[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of data ?? []) {
    map[col.column_id.toLowerCase()] = col.string_value ?? ''
  }
  return map
}

function formatPhone(raw: string | undefined): string | null {
  if (!raw) return null
  return raw.replace(/[^\d+]/g, '') || null
}

// ─── WhatsApp de boas-vindas ──────────────────────────────────────────────────

async function sendWelcomeWhatsApp(
  instanceToken: string,
  phone: string,
  firstName: string,
  storeName: string,
): Promise<void> {
  if (!UAZAPI_BASE_URL || !instanceToken) return
  const text = `Olá ${firstName}! 👋 Recebemos seu interesse pela ${storeName}. Um consultor entrará em contato em breve. 🚗`
  try {
    await fetch(`${UAZAPI_BASE_URL}/message/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'admintoken': UAZAPI_ADMIN_TOKEN,
        'instancetoken': instanceToken,
      },
      body: JSON.stringify({ number: phone.replace(/\D/g, ''), text }),
    })
  } catch (e) {
    console.error('[google-webhook] sendWelcomeWhatsApp error:', e)
  }
}

// ─── IA: personaliza mensagem de boas-vindas ──────────────────────────────────

async function personalizeWelcome(
  firstName: string,
  vehicle: string | null,
  storeName: string,
): Promise<string> {
  if (!ANTHROPIC_API_KEY || !vehicle) {
    return `Olá ${firstName}! 👋 Recebemos seu interesse pela ${storeName}. Em breve um consultor entrará em contato. 🚗`
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: `Escreva uma mensagem WhatsApp de boas-vindas curta (máx 2 frases) para ${firstName}, que demonstrou interesse em ${vehicle} pela ${storeName}. Seja caloroso e profissional. Responda APENAS com o texto da mensagem.`,
        }],
      }),
    })
    const data = await res.json() as { content?: Array<{ text: string }> }
    const text = data?.content?.[0]?.text?.trim()
    if (text && text.length > 10) return text
  } catch (e) {
    console.error('[google-webhook] AI welcome error:', e)
  }
  return `Olá ${firstName}! 👋 Recebemos seu interesse em ${vehicle} pela ${storeName}. Em breve um consultor entrará em contato. 🚗`
}

// ─── Processa o lead ──────────────────────────────────────────────────────────

async function processLead(payload: GoogleLeadPayload): Promise<void> {
  const { google_key, user_column_data, campaign_id, campaign_name, adgroup_id, adgroup_name, creative_id, gcl_id, is_test } = payload

  // Ignora leads de teste
  if (is_test) {
    console.log('[google-webhook] Lead de teste ignorado')
    return
  }

  // 1. Encontra a integração pelo google_key
  const { data: config } = await supabase
    .from('google_integrations')
    .select(`id, store_id, default_stage_id, default_salesperson_id, default_temperature, active, stores(name)`)
    .eq('google_key', google_key)
    .eq('active', true)
    .maybeSingle()

  if (!config) {
    console.warn(`[google-webhook] Nenhuma integração ativa para google_key=${google_key}`)
    return
  }

  const storeId   = config.store_id
  const storeName = (config.stores as { name: string } | null)?.name ?? 'Nossa loja'

  // 2. Parseia campos do formulário
  const fields = parseColumns(user_column_data)

  const clientName  = fields.full_name    ?? fields.nome_completo ?? fields.name ?? 'Lead Google Ads'
  const clientPhone = formatPhone(fields.phone_number ?? fields.telefone ?? fields.phone)
  const clientEmail = fields.email ?? fields.work_email ?? null
  const city        = fields.city  ?? fields.cidade ?? null
  const postalCode  = fields.postal_code ?? fields.cep ?? null
  const company     = fields.company_name ?? null
  const jobTitle    = fields.job_title ?? null
  const vehicle     = fields.veiculo ?? fields.carro ?? fields.interesse ?? fields.vehicle ?? null
  const budget      = fields.orcamento ?? fields.budget ?? null
  const notes       = fields.mensagem  ?? fields.message ?? fields.observacao ?? null

  // 3. Tenta encontrar campanha cadastrada pelo campaign_id
  let utmCampaign: string | null = null
  let utmContent:  string | null = null

  if (campaign_id) {
    const { data: adCamp } = await supabase
      .from('ad_campaigns')
      .select('utm_campaign, utm_content')
      .eq('store_id', storeId)
      .eq('campaign_id', campaign_id)
      .maybeSingle()

    utmCampaign = adCamp?.utm_campaign ?? campaign_name ?? null
    utmContent  = adCamp?.utm_content  ?? adgroup_name  ?? null
  } else {
    utmCampaign = campaign_name ?? null
    utmContent  = adgroup_name  ?? null
  }

  // 4. Stage padrão
  let stageId = config.default_stage_id
  if (!stageId) {
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('store_id', storeId)
      .order('position', { ascending: true })
      .limit(1)
      .single()
    stageId = stage?.id ?? null
  }

  // 5. Cria o lead
  const budgetNum = budget ? parseFloat(budget.replace(/\D/g, '')) || null : null

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      store_id:         storeId,
      salesperson_id:   config.default_salesperson_id ?? null,
      stage_id:         stageId,
      client_name:      clientName,
      client_phone:     clientPhone,
      client_email:     clientEmail,
      client_city:      city,
      vehicle_interest: vehicle,
      budget_max:       budgetNum,
      source:           'google_ads',
      temperature:      config.default_temperature ?? 'hot',
      priority:         'high',
      status:           'active',
      notes:            [notes, company && `Empresa: ${company}`, jobTitle && `Cargo: ${jobTitle}`, postalCode && `CEP: ${postalCode}`].filter(Boolean).join('\n') || null,
      tags:             ['google_lead_form'],
      // UTM & attribution
      utm_source:       'google',
      utm_medium:       'cpc',
      utm_campaign:     utmCampaign,
      utm_content:      utmContent,
      utm_ad_id:        creative_id ?? null,
      utm_adset_id:     adgroup_id  ?? null,
      utm_campaign_id:  campaign_id ?? null,
      gclid:            gcl_id      ?? null,
      referrer:         `google_lead_form:${campaign_id ?? 'unknown'}`,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[google-webhook] Erro ao criar lead:', error)
    return
  }

  console.log(`[google-webhook] Lead criado: id=${lead.id} store=${storeId} name="${clientName}"`)

  // 6. Atividade
  await supabase.from('activities').insert({
    lead_id:     lead.id,
    store_id:    storeId,
    user_id:     config.default_salesperson_id ?? storeId,
    type:        'system',
    title:       'Lead recebido via Google Ads Lead Form',
    description: `Campanha: ${campaign_name ?? campaign_id ?? '—'} · Grupo: ${adgroup_name ?? adgroup_id ?? '—'} · Creative: ${creative_id ?? '—'}`,
    metadata:    { campaign_id, campaign_name, adgroup_id, adgroup_name, creative_id, gcl_id, raw_fields: fields },
    created_at:  new Date().toISOString(),
  })

  // 7. WhatsApp de boas-vindas
  if (clientPhone) {
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('instance_token')
      .eq('store_id', storeId)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle()

    if (instance?.instance_token) {
      const firstName = clientName.split(' ')[0]
      const message   = await personalizeWelcome(firstName, vehicle, storeName)
      await sendWelcomeWhatsApp(instance.instance_token, clientPhone, firstName, storeName)
      void message // used inside personalizeWelcome
    }
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // GET: Google verifica que a URL está acessível — basta retornar 200
  if (req.method === 'GET') {
    return new Response('OK', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let payload: GoogleLeadPayload
  try {
    payload = await req.json() as GoogleLeadPayload
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!payload.google_key) {
    return new Response('Missing google_key', { status: 400 })
  }

  // Google exige resposta em < 10s. Retorna 200 imediatamente e processa em background.
  const task = processLead(payload)
  await Promise.race([task, new Promise(r => setTimeout(r, 8_000))])

  return new Response('OK', { status: 200 })
})
