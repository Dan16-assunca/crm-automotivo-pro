// Edge Function: fb-oauth
// Handles Facebook OAuth flow for Lead Ads integration.
//
// GET  ?action=start&store_id=X      → redirect to Facebook OAuth
// GET  ?action=callback&code=X&state=X → exchange code, fetch pages, upsert integration
// POST ?action=select_page           → body {store_id, page_id, page_name, page_access_token}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const FB_APP_ID    = Deno.env.get('FB_APP_ID')    ?? ''
const FB_APP_SECRET = Deno.env.get('FB_APP_SECRET') ?? ''
const APP_URL      = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
const GRAPH_API_VER = 'v19.0'

const CALLBACK_URL = 'https://eakdywmuewvuzyqfpcpl.supabase.co/functions/v1/fb-oauth?action=callback'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateVerifyToken(): string {
  return `crm-fb-${randomHex(6)}`
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } })
}

// ─── Get first pipeline stage for store ──────────────────────────────────────

async function getFirstStageId(storeId: string): Promise<string | null> {
  const { data } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('store_id', storeId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

// ─── Subscribe page to App webhook ───────────────────────────────────────────

async function subscribePageToWebhook(pageId: string, pageAccessToken: string): Promise<void> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VER}/${pageId}/subscribed_apps`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `subscribed_fields=leadgen&access_token=${encodeURIComponent(pageAccessToken)}`,
      },
    )
    if (!res.ok) {
      console.error('[fb-oauth] subscribePageToWebhook error:', res.status, await res.text())
    } else {
      console.log(`[fb-oauth] Page ${pageId} subscribed to webhook`)
    }
  } catch (e) {
    console.error('[fb-oauth] subscribePageToWebhook exception:', e)
  }
}

// ─── Upsert integration for a single page ────────────────────────────────────

async function connectPage(
  storeId: string,
  pageId: string,
  pageName: string,
  pageAccessToken: string,
): Promise<void> {
  const defaultStageId = await getFirstStageId(storeId)
  const verifyToken    = generateVerifyToken()

  const { error } = await supabase
    .from('facebook_integrations')
    .upsert(
      {
        store_id:            storeId,
        page_id:             pageId,
        page_name:           pageName || null,
        page_access_token:   pageAccessToken,
        verify_token:        verifyToken,
        default_stage_id:    defaultStageId,
        default_temperature: 'hot',
        active:              true,
      },
      { onConflict: 'store_id,page_id' },
    )

  if (error) {
    console.error('[fb-oauth] upsert error:', error)
    throw new Error('Falha ao salvar integração: ' + error.message)
  }

  await subscribePageToWebhook(pageId, pageAccessToken)
}

// ─── Popup response helpers ───────────────────────────────────────────────────

function popupHtml(script: string): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Conectando...</title></head>` +
    `<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;">` +
    `<p style="color:#3df710;font-family:sans-serif;font-size:14px;">Processando...</p>` +
    `<script>${script}<\/script></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

function popupDone(ok: boolean, error?: string): Response {
  const msg = JSON.stringify({ type: 'fb-oauth-done', ok, error: error ?? null })
  return popupHtml(`try{window.opener&&window.opener.postMessage(${msg},'*')}catch(e){}window.close();`)
}

function popupPages(pages: unknown[], storeId: string): Response {
  const msg = JSON.stringify({ type: 'fb-oauth-pages', pages, storeId })
  return popupHtml(`try{window.opener&&window.opener.postMessage(${msg},'*')}catch(e){}window.close();`)
}

// ─── action=start ─────────────────────────────────────────────────────────────

function handleStart(storeId: string): Response {
  if (!storeId) return new Response('Missing store_id', { status: 400 })
  if (!FB_APP_ID) return new Response('FB_APP_ID not configured', { status: 500 })

  // leads_retrieval requires App Review — use only pages permissions for now
  const scope = 'pages_show_list,pages_manage_metadata,pages_read_engagement'
  const fbUrl =
    `https://www.facebook.com/dialog/oauth` +
    `?client_id=${encodeURIComponent(FB_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
    `&state=${encodeURIComponent(storeId)}` +
    `&scope=${encodeURIComponent(scope)}`

  return redirect(fbUrl)
}

// ─── action=callback ──────────────────────────────────────────────────────────

async function handleCallback(code: string, storeId: string): Promise<Response> {
  if (!code || !storeId) return popupDone(false, 'Parâmetros inválidos')

  try {
    // 1. Exchange code for short-lived user access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VER}/oauth/access_token` +
      `?client_id=${encodeURIComponent(FB_APP_ID)}` +
      `&client_secret=${encodeURIComponent(FB_APP_SECRET)}` +
      `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
      `&code=${encodeURIComponent(code)}`,
    )
    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('[fb-oauth] token exchange error:', errText)
      return popupDone(false, 'Erro ao trocar código por token')
    }
    const tokenData = await tokenRes.json() as { access_token?: string; error?: unknown }
    if (!tokenData.access_token) {
      console.error('[fb-oauth] no access_token in response:', tokenData)
      return popupDone(false, 'Token não retornado')
    }

    // 2. Exchange for long-lived token
    const llRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VER}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(FB_APP_ID)}` +
      `&client_secret=${encodeURIComponent(FB_APP_SECRET)}` +
      `&fb_exchange_token=${encodeURIComponent(tokenData.access_token)}`,
    )
    const llData = llRes.ok
      ? await llRes.json() as { access_token?: string }
      : { access_token: undefined }
    const longLivedToken = llData.access_token ?? tokenData.access_token

    // 3. Fetch user's pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VER}/me/accounts` +
      `?fields=id,name,access_token` +
      `&access_token=${encodeURIComponent(longLivedToken)}`,
    )
    if (!pagesRes.ok) {
      console.error('[fb-oauth] pages fetch error:', await pagesRes.text())
      return popupDone(false, 'Erro ao buscar páginas do Facebook')
    }
    const pagesData = await pagesRes.json() as { data?: Array<{ id: string; name: string; access_token: string }> }
    const pages = pagesData.data ?? []

    if (pages.length === 0) {
      return popupDone(false, 'Nenhuma página do Facebook encontrada. Certifique-se de ser administrador de uma Página.')
    }

    if (pages.length === 1) {
      const page = pages[0]
      await connectPage(storeId, page.id, page.name, page.access_token)
      return popupDone(true)
    }

    // Multiple pages → send list to opener for picker
    return popupPages(pages, storeId)

  } catch (e) {
    console.error('[fb-oauth] handleCallback error:', e)
    return popupDone(false, 'Erro interno')
  }
}

// ─── action=select_page (POST) ────────────────────────────────────────────────

async function handleSelectPage(req: Request): Promise<Response> {
  let body: { store_id?: string; page_id?: string; page_name?: string; page_access_token?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400)
  }

  const { store_id, page_id, page_name, page_access_token } = body
  if (!store_id || !page_id || !page_access_token) {
    return json({ ok: false, error: 'Missing required fields' }, 400)
  }

  try {
    await connectPage(store_id, page_id, page_name ?? '', page_access_token)
    return json({ ok: true })
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500)
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url    = new URL(req.url)
  const action = url.searchParams.get('action')

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (req.method === 'GET') {
    if (action === 'start') {
      const storeId = url.searchParams.get('store_id') ?? ''
      return handleStart(storeId)
    }

    if (action === 'callback') {
      const code    = url.searchParams.get('code')    ?? ''
      const storeId = url.searchParams.get('state')   ?? ''
      return handleCallback(code, storeId)
    }

    return new Response('Not found', { status: 404 })
  }

  if (req.method === 'POST') {
    if (action === 'select_page') {
      return handleSelectPage(req)
    }
    return new Response('Not found', { status: 404 })
  }

  return new Response('Method not allowed', { status: 405 })
})
