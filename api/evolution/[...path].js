const EVOLUTION_API_URL = (process.env.VITE_EVOLUTION_API_URL ?? '').replace(/\/$/, '')
const EVOLUTION_API_KEY = process.env.VITE_EVOLUTION_API_KEY ?? ''

export default async function handler(req, res) {
  const segments = req.query.path
  const path = Array.isArray(segments) ? segments.join('/') : (segments ?? '')

  // Repassa query strings (exceto o param 'path' interno do Vercel)
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue
    qs.set(key, String(value))
  }
  const qsStr = qs.toString()
  const targetUrl = `${EVOLUTION_API_URL}/${path}${qsStr ? `?${qsStr}` : ''}`

  const fetchHeaders = {
    'Content-Type': 'application/json',
    apikey: EVOLUTION_API_KEY,
  }

  const fetchOptions = {
    method: req.method ?? 'GET',
    headers: fetchHeaders,
  }

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    fetchOptions.body = JSON.stringify(req.body)
  }

  try {
    const response = await fetch(targetUrl, fetchOptions)
    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(response.status).json(data)
  } catch (err) {
    res.status(502).json({ error: 'Evolution API unreachable', detail: String(err) })
  }
}
