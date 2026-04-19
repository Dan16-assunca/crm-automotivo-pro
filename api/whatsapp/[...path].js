// Proxy server-side para a Uazapi (migração de Evolution API → Uazapi)
// O Admin Token NUNCA chega ao browser — fica seguro nas variáveis de ambiente do servidor.
// Em produção (Vercel): configure UAZAPI_BASE_URL e UAZAPI_ADMIN_TOKEN no dashboard.
// Em desenvolvimento: configure no .env (sem prefixo VITE_).

const UAZAPI_BASE_URL    = (process.env.UAZAPI_BASE_URL    ?? '').replace(/\/$/, '')
const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN  ?? ''

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin ?? '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, instancetoken')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (!UAZAPI_BASE_URL || !UAZAPI_ADMIN_TOKEN) {
    console.error('[uazapi-proxy] Variáveis de ambiente não configuradas:', {
      UAZAPI_BASE_URL:    UAZAPI_BASE_URL    ? 'ok' : 'FALTANDO',
      UAZAPI_ADMIN_TOKEN: UAZAPI_ADMIN_TOKEN ? 'ok' : 'FALTANDO',
    })
    res.status(500).json({
      error: 'Uazapi não configurada no servidor.',
      hint: 'Configure UAZAPI_BASE_URL e UAZAPI_ADMIN_TOKEN nas variáveis de ambiente do Vercel.',
    })
    return
  }

  const segments = req.query.path
  const path     = Array.isArray(segments) ? segments.join('/') : (segments ?? '')

  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue
    qs.set(key, String(value))
  }
  const qsStr    = qs.toString()
  const targetUrl = `${UAZAPI_BASE_URL}/${path}${qsStr ? `?${qsStr}` : ''}`

  const fetchHeaders = {
    'Content-Type': 'application/json',
    'admintoken':    UAZAPI_ADMIN_TOKEN,   // ← autenticação Uazapi (server-side only)
  }

  // Se o frontend passou instancetoken, repassa para a Uazapi
  const instanceToken = req.headers['instancetoken']
  if (instanceToken) fetchHeaders['instancetoken'] = instanceToken

  const fetchOptions = {
    method:  req.method ?? 'GET',
    headers: fetchHeaders,
  }

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    fetchOptions.body = JSON.stringify(req.body)
  }

  try {
    const response = await fetch(targetUrl, fetchOptions)
    const text     = await response.text()

    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (!response.ok) {
      console.error(`[uazapi-proxy] upstream ${response.status} ${path}:`, text.slice(0, 300))
    }

    res.status(response.status).json(data)
  } catch (err) {
    console.error('[uazapi-proxy] erro de rede:', err)
    res.status(502).json({ error: 'Uazapi inacessível', detail: String(err) })
  }
}
