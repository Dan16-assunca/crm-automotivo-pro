// Edge Function: landing-lead
// Recebe submissões de formulários de landing pages e cria leads no CRM.
// Captura automaticamente parâmetros UTM para rastreamento de origem.
//
// POST / → body { store_id, name, phone?, email?, utm_source?, utm_medium?,
//                 utm_campaign?, utm_term?, utm_content?, fbclid?, gclid?,
//                 landing_page?, vehicle_interest?, budget_max?, notes?, ... }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const UAZAPI_BASE_URL  = (Deno.env.get('UAZAPI_BASE_URL') ?? '').replace(/\/$/, '')
const UAZAPI_ADMIN_TOKEN = Deno.env.get('UAZAPI_ADMIN_TOKEN') ?? ''

// ─── CORS ────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// ─── WhatsApp boas-vindas ────────────────────────────────────────────────────

async function sendWelcomeWhatsApp(
  instanceToken: string,
  phone: string,
  name: string,
  storeName: string,
): Promise<void> {
  if (!UAZAPI_BASE_URL || !instanceToken || !phone) return
  const message = `Olá ${name}! 👋 Recebemos seu contato pela ${storeName}. Em breve um de nossos consultores vai entrar em contato. 🚗`
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
    console.error('[landing-lead] sendWelcomeWhatsApp error:', e)
  }
}

// ─── Handler principal ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405)
  }

  let body: Record<string, string | undefined>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  // ── Campos obrigatórios ──────────────────────────────────────────────────────
  const storeId = body.store_id
  const name    = (body.name ?? body.client_name ?? '').trim()

  if (!storeId) return json({ ok: false, error: 'store_id obrigatório' }, 400)
  if (!name)    return json({ ok: false, error: 'name obrigatório' }, 400)

  // ── Busca store para validar + pegar nome ────────────────────────────────────
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, name')
    .eq('id', storeId)
    .maybeSingle()

  if (storeErr || !store) {
    return json({ ok: false, error: 'store_id inválido' }, 400)
  }

  // ── Primeiro estágio do pipeline ─────────────────────────────────────────────
  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('store_id', storeId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  const stageId = body.stage_id ?? firstStage?.id ?? null

  // ── Monta o lead ─────────────────────────────────────────────────────────────
  const phone   = body.phone   ?? body.client_phone   ?? null
  const email   = body.email   ?? body.client_email   ?? null
  const city    = body.city    ?? body.client_city    ?? null
  const vehicle = body.vehicle ?? body.vehicle_interest ?? null
  const notes   = body.notes   ?? body.message ?? body.mensagem ?? null

  const budgetRaw = body.budget ?? body.budget_max ?? null
  const budgetMax = budgetRaw ? (parseFloat(String(budgetRaw).replace(/\D/g, '')) || null) : null

  // UTMs
  const utmSource   = body.utm_source   ?? 'landing_page'
  const utmMedium   = body.utm_medium   ?? null
  const utmCampaign = body.utm_campaign ?? null
  const utmTerm     = body.utm_term     ?? null
  const utmContent  = body.utm_content  ?? null
  const fbclid      = body.fbclid       ?? null
  const gclid       = body.gclid        ?? null
  const landingPage = body.landing_page ?? (req.headers.get('referer') ?? null)

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .insert({
      store_id:         storeId,
      stage_id:         stageId,
      client_name:      name,
      client_phone:     phone,
      client_email:     email,
      client_city:      city,
      vehicle_interest: vehicle,
      budget_max:       budgetMax,
      source:           utmSource === 'google' ? 'google_ads'
                        : utmSource === 'facebook' ? 'meta_ads'
                        : 'landing_page',
      temperature:      body.temperature ?? 'warm',
      priority:         body.priority ?? 'medium',
      status:           'active',
      notes:            notes,
      tags:             ['landing_page'],
      // UTM & attribution
      utm_source:       utmSource,
      utm_medium:       utmMedium,
      utm_campaign:     utmCampaign,
      utm_term:         utmTerm,
      utm_content:      utmContent,
      fbclid:           fbclid,
      gclid:            gclid,
      landing_page:     landingPage,
      referrer:         req.headers.get('referer') ?? null,
    })
    .select('id')
    .single()

  if (leadErr) {
    console.error('[landing-lead] Erro ao criar lead:', leadErr)
    return json({ ok: false, error: 'Erro ao salvar lead: ' + leadErr.message }, 500)
  }

  console.log(`[landing-lead] Lead criado: id=${lead.id} store=${storeId} name="${name}" utm_source=${utmSource} campaign=${utmCampaign}`)

  // ── Registra atividade ───────────────────────────────────────────────────────
  await supabase.from('activities').insert({
    lead_id:     lead.id,
    store_id:    storeId,
    type:        'system',
    title:       'Lead recebido via Landing Page',
    description: `Origem: ${utmSource}${utmCampaign ? ` · Campanha: ${utmCampaign}` : ''}${landingPage ? ` · Página: ${landingPage}` : ''}`,
    metadata:    { utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, utm_term: utmTerm, utm_content: utmContent, fbclid, gclid, landing_page: landingPage },
    created_at:  new Date().toISOString(),
  })

  // ── WhatsApp boas-vindas ─────────────────────────────────────────────────────
  if (phone) {
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('instance_token')
      .eq('store_id', storeId)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle()

    if (instance?.instance_token) {
      await sendWelcomeWhatsApp(instance.instance_token, phone, name.split(' ')[0], store.name)
    }
  }

  return json({ ok: true, lead_id: lead.id })
})
