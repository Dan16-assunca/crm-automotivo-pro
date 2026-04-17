// Proxy server-side para a Evolution API
// A API Key NUNCA chega ao browser — fica segura nas variáveis de ambiente do servidor.
// Em produção (Vercel): configure EVOLUTION_API_URL e EVOLUTION_API_KEY no dashboard.
// Em desenvolvimento: configure no .env (sem prefixo VITE_).

const EVOLUTION_API_URL = (process.env.EVOLUTION_API_URL ?? '').replace(/\/$/, '')
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? ''

export default async function handler(req, res) {
  // CORS — permite apenas a origem do próprio app
  const origin = req.headers.origin ?? '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    console.error('[evolution-proxy] Variáveis de ambiente não configuradas:', {
      EVOLUTION_API_URL: EVOLUTION_API_URL ? 'ok' : 'FALTANDO',
      EVOLUTION_API_KEY: EVOLUTION_API_KEY ? 'ok' : 'FALTANDO',
    })
    res.status(500).json({
      error: 'Evolution API não configurada no servidor.',
      hint: 'Configure EVOLUTION_API_URL e EVOLUTION_API_KEY nas variáveis de ambiente do Vercel.',
    })
    return
  }

  const segments = req.query.path
  const path = Array.isArray(segments) ? segments.join('/') : (segments ?? '')

  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue
    qs.set(key, String(value))
  }
  const qsStr = qs.toString()
  const targetUrl = `${EVOLUTION_API_URL}/${path}${qsStr ? `?${qsStr}` : ''}`

  const fetchOptions = {
    method: req.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_API_KEY,   // ← injetada server-side, nunca exposta ao browser
    },
  }

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    fetchOptions.body = JSON.stringify(req.body)
  }

  try {
    const response = await fetch(targetUrl, fetchOptions)
    const text = await response.text()

    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (!response.ok) {
      console.error(`[evolution-proxy] upstream ${response.status}:`, text.slice(0, 300))
    }

    res.status(response.status).json(data)
  } catch (err) {
    console.error('[evolution-proxy] erro de rede:', err)
    res.status(502).json({ error: 'Evolution API inacessível', detail: String(err) })
  }
}
