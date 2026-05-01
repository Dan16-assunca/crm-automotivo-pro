// Edge Function: vehicle-ai-scan
// Recebe a URL de uma foto de veículo, busca a imagem, converte para base64
// e chama o Claude claude-haiku-4-5 com visão para identificar marca, modelo, cor, ano, etc.
//
// POST / → body { photo_url: string }
// Response: { ok: true, data: AIScanResult } | { ok: false, error: string }

import { corsHeaders } from '../_shared/cors.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const PROMPT = `Você é especialista em identificação de veículos automotivos. Analise esta foto e retorne SOMENTE um JSON válido com os campos abaixo. Se não conseguir identificar um campo com segurança, use null.

Exemplo de resposta:
{
  "brand": "BMW",
  "model": "X5",
  "version": "xDrive40i M Sport",
  "color": "Preto",
  "year_min": 2022,
  "year_max": 2024,
  "fuel": "Gasolina",
  "transmission": "Automático",
  "condition": "used",
  "body_type": "SUV",
  "confidence": 0.92,
  "plate": null,
  "notes": "Rodas esportivas M, teto panorâmico visível"
}

Regras de preenchimento:
- brand: marca em português (ex: "BMW", "Volkswagen", "Toyota", "Chevrolet")
- model: modelo exato conforme comercializado no Brasil (ex: "X5", "Corolla", "Compass", "Onix")
- version: versão/trim se identificável (ex: "M Sport", "EXL", "Titanium", "LTZ") ou null
- color: cor principal em português (ex: "Preto", "Branco", "Prata", "Cinza", "Azul")
- year_min e year_max: faixa de ano estimada da geração identificada (entre 1980 e 2025)
- fuel: exatamente um de: "Flex", "Gasolina", "Diesel", "Elétrico", "Híbrido", "GNV" — ou null
- transmission: exatamente um de: "Automático", "Manual", "CVT", "Automatizado" — ou null
- condition: "new" se aparência de zero km/lacrado, "used" para seminovos e usados
- body_type: tipo de carroceria (ex: "SUV", "Sedan", "Hatch", "Picape", "Minivan")
- confidence: número de 0.0 a 1.0 representando sua confiança na identificação geral
- plate: placa brasileira se visível e legível (ex: "ABC1D23"), null se não visível
- notes: observação relevante sobre o veículo em no máximo 1 frase (ex: "Para-choque traseiro com dano leve")

Responda APENAS com o JSON, sem texto adicional antes ou depois.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!ANTHROPIC_API_KEY) {
    return json({ ok: false, error: 'ANTHROPIC_API_KEY não configurada' }, 500)
  }

  let body: { photo_url?: string }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400)
  }

  const { photo_url } = body
  if (!photo_url) return json({ ok: false, error: 'photo_url obrigatório' }, 400)

  // ── 1. Busca imagem e converte para base64 ────────────────────────────────
  let imageBase64: string
  let mediaType: string

  try {
    const imgRes = await fetch(photo_url)
    if (!imgRes.ok) {
      return json({ ok: false, error: `Não foi possível buscar a imagem (HTTP ${imgRes.status})` }, 400)
    }
    const ct = imgRes.headers.get('content-type') ?? 'image/jpeg'
    mediaType = ct.split(';')[0].trim()
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
      mediaType = 'image/jpeg'
    }
    const buffer = await imgRes.arrayBuffer()
    // Converte ArrayBuffer → base64
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    imageBase64 = btoa(binary)
  } catch (e) {
    console.error('[vehicle-ai-scan] erro ao buscar imagem:', e)
    return json({ ok: false, error: 'Erro ao processar imagem' }, 500)
  }

  // ── 2. Chama Claude claude-haiku-4-5 com visão ────────────────────────────────────
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
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: PROMPT,
            },
          ],
        }],
      }),
    })

    const apiData = await res.json() as {
      content?: Array<{ text: string }>
      error?: { message: string }
    }

    if (!res.ok) {
      console.error('[vehicle-ai-scan] Claude API error:', apiData)
      return json({
        ok: false,
        error: 'Erro na API de IA: ' + (apiData.error?.message ?? 'desconhecido'),
      }, 500)
    }

    const text = apiData?.content?.[0]?.text ?? '{}'
    console.log('[vehicle-ai-scan] Claude raw response:', text.slice(0, 300))

    // Extrai JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[vehicle-ai-scan] Nenhum JSON na resposta:', text)
      return json({ ok: false, error: 'IA não retornou dados estruturados' }, 500)
    }

    const result = JSON.parse(jsonMatch[0])
    console.log(`[vehicle-ai-scan] Identificado: ${result.brand ?? '?'} ${result.model ?? '?'} conf=${result.confidence ?? 0}`)

    return json({ ok: true, data: result })
  } catch (e) {
    console.error('[vehicle-ai-scan] erro interno:', e)
    return json({ ok: false, error: 'Erro interno na análise' }, 500)
  }
})
