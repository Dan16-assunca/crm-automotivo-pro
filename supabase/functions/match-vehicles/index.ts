// Edge Function: match-vehicles
// Recebe um lead_id e retorna os veículos do estoque mais compatíveis com o perfil do lead.
// Usa filtro SQL por orçamento + IA (Claude Haiku) para ranking e justificativa.
//
// POST /functions/v1/match-vehicles
// Body: { lead_id: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { lead_id } = await req.json() as { lead_id: string }
    if (!lead_id) return json({ error: 'lead_id obrigatório' }, 400)

    // ── 1. Busca dados do lead ─────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, store_id, client_name, vehicle_interest, budget_min, budget_max, temperature, source, notes, created_at')
      .eq('id', lead_id)
      .single()

    if (leadErr || !lead) return json({ error: 'Lead não encontrado' }, 404)

    const budgetMin = (lead.budget_min as number | null) ?? 0
    const budgetMax = (lead.budget_max as number | null) ?? 999_999_999

    // Se não tem orçamento definido, usa janela ampla baseada no interesse
    const priceMin = budgetMin * 0.80
    const priceMax = budgetMax > 0 ? budgetMax * 1.20 : 999_999_999

    // ── 2. Filtra veículos compatíveis por orçamento ───────────────────────
    let query = supabase
      .from('vehicles')
      .select('id, brand, model, version, year_model, sale_price, promotional_price, condition, km, fuel, transmission, color, photos, description, days_in_stock')
      .eq('store_id', lead.store_id as string)
      .eq('status', 'available')
      .order('days_in_stock', { ascending: false }) // prioriza veículos mais antigos

    if (priceMax < 999_999_999) {
      query = query.lte('sale_price', priceMax)
    }
    if (priceMin > 0) {
      query = query.gte('sale_price', priceMin)
    }

    const { data: vehicles, error: vErr } = await query.limit(20)

    if (vErr) return json({ error: 'Erro ao buscar veículos' }, 500)
    if (!vehicles || vehicles.length === 0) {
      return json({ matches: [], message: 'Nenhum veículo disponível no orçamento do lead.' })
    }

    // ── 3. Formata candidatos para o Claude ───────────────────────────────
    const candidates = vehicles.map((v, i) => {
      const price = (v.promotional_price as number | null) ?? (v.sale_price as number | null)
      const priceStr = price ? `R$ ${price.toLocaleString('pt-BR')}` : 'Sob consulta'
      const kmStr = (v.km as number | null) ? `${(v.km as number).toLocaleString('pt-BR')} km` : '—'
      return `${i + 1}. ${v.brand} ${v.model}${v.version ? ' ' + v.version : ''} ${v.year_model ?? ''} | ${priceStr} | ${kmStr} | ${v.fuel ?? '—'} | ${v.condition === 'new' ? 'Novo' : 'Usado'}${(v.days_in_stock as number) > 30 ? ' | ⚠️ ' + v.days_in_stock + ' dias no estoque' : ''}`
    }).join('\n')

    const budget = budgetMax > 0
      ? `R$ ${budgetMin.toLocaleString('pt-BR')} a R$ ${budgetMax.toLocaleString('pt-BR')}`
      : 'não informado'

    // ── 4. Chama Claude Haiku para ranking ────────────────────────────────
    let aiRanking: { index: number; score: number; reason: string }[] = []

    if (ANTHROPIC_API_KEY) {
      const prompt = `Você é um assistente especializado em vendas de veículos seminovos no Brasil.

Lead: ${lead.client_name}
Interesse declarado: ${lead.vehicle_interest ?? 'não informado'}
Orçamento: ${budget}
Temperatura: ${lead.temperature ?? 'morno'}
Canal de origem: ${lead.source ?? 'não informado'}
Observações: ${lead.notes ?? '—'}

Veículos disponíveis no estoque:
${candidates}

Tarefa: Classifique os 5 veículos MAIS compatíveis com este lead. Para cada um:
- Dê uma pontuação de 0 a 100
- Escreva UMA frase curta de justificativa (máximo 12 palavras)

Responda SOMENTE em JSON válido, sem texto extra:
[{"index":1,"score":92,"reason":"SUV familiar no orçamento ideal com baixa km"},...]`

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
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
          }),
        })
        const data = await res.json() as { content?: Array<{ text: string }> }
        const text = data?.content?.[0]?.text ?? '[]'
        // Extrai JSON da resposta (Claude pode adicionar texto extra)
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          aiRanking = JSON.parse(jsonMatch[0]) as typeof aiRanking
        }
      } catch (e) {
        console.error('[match-vehicles] AI error:', e)
        // Fallback: retorna os primeiros 5 sem AI scoring
      }
    }

    // ── 5. Monta resultado final ───────────────────────────────────────────
    let matches
    if (aiRanking.length > 0) {
      matches = aiRanking
        .filter(r => r.index >= 1 && r.index <= vehicles.length)
        .map(r => ({
          vehicle: vehicles[r.index - 1],
          score: r.score,
          reason: r.reason,
        }))
        .sort((a, b) => b.score - a.score)
    } else {
      // Sem AI: retorna os 5 primeiros com score decrescente simples
      matches = vehicles.slice(0, 5).map((v, i) => ({
        vehicle: v,
        score: 90 - i * 10,
        reason: 'Compatível com orçamento e preferência',
      }))
    }

    return json({ matches })
  } catch (err) {
    console.error('[match-vehicles]', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
