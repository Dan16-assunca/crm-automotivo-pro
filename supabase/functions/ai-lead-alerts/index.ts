// Edge Function: ai-lead-alerts
// Analisa leads ativos de todas as lojas e gera alertas inteligentes.
// Cron: 0 8 * * * (todo dia às 8h)
// Também pode ser chamada via POST para uma loja específica.
//
// POST /functions/v1/ai-lead-alerts
// Body (opcional): { store_id: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 9999
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface LeadAlert {
  store_id: string
  lead_id: string
  type: string
  title: string
  message: string
  severity: 'info' | 'attention' | 'warning' | 'critical'
  expires_at: string
}

async function generateAlertsForStore(storeId: string): Promise<number> {
  // Busca leads ativos com informações necessárias
  const { data: leads } = await supabase
    .from('leads')
    .select('id, client_name, temperature, budget_max, vehicle_interest, last_contact_at, created_at, stage_id, source, notes')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .limit(100)

  if (!leads || leads.length === 0) return 0

  const alerts: LeadAlert[] = []
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h

  for (const lead of leads) {
    const daysSinceContact = daysSince(lead.last_contact_at as string | null)
    const daysInPipeline   = daysSince(lead.created_at as string)
    const budget           = (lead.budget_max as number | null) ?? 0
    const temp             = lead.temperature as string

    // ── Regras determinísticas (sem IA, custo zero) ──────────────────────

    // Lead quente sem contato há 3+ dias
    if (temp === 'hot' && daysSinceContact >= 3) {
      alerts.push({
        store_id: storeId,
        lead_id: lead.id as string,
        type: 'hot_cooling',
        title: 'Lead quente esfriando',
        message: `${lead.client_name} está quente mas sem contato há ${daysSinceContact} dias`,
        severity: daysSinceContact >= 5 ? 'critical' : 'warning',
        expires_at: expiresAt,
      })
    }

    // Alto orçamento sem follow-up em 48h
    if (budget >= 80_000 && daysSinceContact >= 2 && temp !== 'cold') {
      alerts.push({
        store_id: storeId,
        lead_id: lead.id as string,
        type: 'high_budget_idle',
        title: 'Alto orçamento sem contato',
        message: `${lead.client_name} — orçamento R$ ${budget.toLocaleString('pt-BR')} sem follow-up por ${daysSinceContact} dias`,
        severity: 'warning',
        expires_at: expiresAt,
      })
    }

    // Lead novo (< 2 dias) ainda sem contato
    if (daysInPipeline <= 2 && daysSinceContact >= 1 && temp !== 'cold') {
      alerts.push({
        store_id: storeId,
        lead_id: lead.id as string,
        type: 'new_no_contact',
        title: 'Lead novo sem resposta',
        message: `${lead.client_name} entrou há ${daysInPipeline === 0 ? 'hoje' : daysInPipeline + ' dia(s)'} e ainda não foi contatado`,
        severity: 'attention',
        expires_at: expiresAt,
      })
    }

    // Lead há mais de 21 dias no pipeline sem fechar
    if (daysInPipeline >= 21 && temp !== 'cold') {
      alerts.push({
        store_id: storeId,
        lead_id: lead.id as string,
        type: 'stalled',
        title: 'Lead parado no pipeline',
        message: `${lead.client_name} está há ${daysInPipeline} dias sem fechar — considere reengajar ou arquivar`,
        severity: 'info',
        expires_at: expiresAt,
      })
    }
  }

  // ── IA: detecta padrão de conversão ideal (apenas se ANTHROPIC disponível) ──
  if (ANTHROPIC_API_KEY && leads.length >= 5) {
    try {
      const leadsSummary = leads.slice(0, 20).map(l =>
        `- ${l.client_name} | ${l.temperature} | ${daysSince(l.last_contact_at as string | null)}d sem contato | ${l.vehicle_interest ?? '—'} | R$ ${(l.budget_max as number | null)?.toLocaleString('pt-BR') ?? '—'}`
      ).join('\n')

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Analise estes leads de uma concessionária e identifique o lead com MAIOR probabilidade de fechar esta semana. Seja objetivo.

Leads:
${leadsSummary}

Responda em JSON: {"lead_name":"Nome","reason":"motivo em 10 palavras max"}`,
          }],
        }),
      })
      const data = await res.json() as { content?: Array<{ text: string }> }
      const text = data?.content?.[0]?.text ?? '{}'
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const aiResult = JSON.parse(jsonMatch[0]) as { lead_name?: string; reason?: string }
        const hotLead = leads.find(l => l.client_name === aiResult.lead_name)
        if (hotLead && aiResult.reason) {
          alerts.push({
            store_id: storeId,
            lead_id: hotLead.id as string,
            type: 'ai_close_opportunity',
            title: '🤖 IA: Maior chance de fechar',
            message: `${hotLead.client_name} — ${aiResult.reason}`,
            severity: 'attention',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
        }
      }
    } catch (e) {
      console.error('[ai-lead-alerts] AI error:', e)
    }
  }

  if (alerts.length === 0) return 0

  // Remove alertas expirados da loja antes de inserir novos
  await supabase.from('lead_alerts')
    .delete()
    .eq('store_id', storeId)
    .lt('expires_at', new Date().toISOString())

  // Insere novos alertas (ignora duplicatas pelo índice único)
  const { error } = await supabase
    .from('lead_alerts')
    .upsert(alerts, { onConflict: 'store_id,lead_id,type', ignoreDuplicates: false })

  if (error) console.error('[ai-lead-alerts] upsert error:', error)

  return alerts.length
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    let storeIds: string[] = []

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as { store_id?: string }
      if (body.store_id) {
        storeIds = [body.store_id]
      }
    }

    if (storeIds.length === 0) {
      // Cron: processa todas as lojas ativas
      const { data: stores } = await supabase
        .from('stores')
        .select('id')
        .in('status', ['active', 'trial'])
      storeIds = (stores ?? []).map((s: { id: string }) => s.id)
    }

    let totalAlerts = 0
    for (const storeId of storeIds) {
      totalAlerts += await generateAlertsForStore(storeId)
    }

    return json({ processed: storeIds.length, alerts_created: totalAlerts })
  } catch (err) {
    console.error('[ai-lead-alerts]', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
