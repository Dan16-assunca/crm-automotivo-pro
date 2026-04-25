// Edge Function: inventory-digest
// Gera digest diário do estoque e envia via WhatsApp para o gerente da loja.
// Cron: 0 9 * * * (todo dia às 9h)
// Também pode ser chamada via POST para uma loja específica.
//
// POST /functions/v1/inventory-digest
// Body (opcional): { store_id: string }

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

interface Vehicle {
  id: string
  brand: string
  model: string
  version: string | null
  year_model: number | null
  sale_price: number | null
  promotional_price: number | null
  days_in_stock: number | null
  condition: string
  status: string
}

interface Lead {
  id: string
  client_name: string
  vehicle_interest: string | null
  budget_max: number | null
  temperature: string
}

async function sendWhatsAppMessage(
  instanceToken: string,
  phone: string,
  message: string,
  baseUrl: string,
): Promise<void> {
  await fetch(`${baseUrl}/message/sendText/${instanceToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: instanceToken },
    body: JSON.stringify({ number: phone, text: message }),
  })
}

async function processStore(storeId: string): Promise<{ sent: boolean; message?: string }> {
  // 1. Busca dados da loja incluindo instância WhatsApp e gerente
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, owner_id, whatsapp_instance_id')
    .eq('id', storeId)
    .single()

  if (!store) return { sent: false }

  // 2. Busca configuração WhatsApp da loja
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('instance_token, base_url, status')
    .eq('id', store.whatsapp_instance_id)
    .eq('status', 'connected')
    .single()

  if (!instance) return { sent: false }

  // 3. Busca telefone do dono
  const { data: owner } = await supabase
    .from('users')
    .select('phone, full_name')
    .eq('id', store.owner_id)
    .single()

  if (!owner?.phone) return { sent: false }

  // 4. Veículos em estoque
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, brand, model, version, year_model, sale_price, promotional_price, days_in_stock, condition, status')
    .eq('store_id', storeId)
    .eq('status', 'available')
    .order('days_in_stock', { ascending: false })
    .limit(50)

  const allVehicles = (vehicles ?? []) as Vehicle[]
  const totalVehicles = allVehicles.length
  const critical = allVehicles.filter(v => (v.days_in_stock ?? 0) >= 60)
  const warning  = allVehicles.filter(v => (v.days_in_stock ?? 0) >= 30 && (v.days_in_stock ?? 0) < 60)
  const avgDays  = totalVehicles > 0
    ? Math.round(allVehicles.reduce((s, v) => s + (v.days_in_stock ?? 0), 0) / totalVehicles)
    : 0

  // 5. Leads ativos
  const { data: leadsData } = await supabase
    .from('leads')
    .select('id, client_name, vehicle_interest, budget_max, temperature')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .in('temperature', ['hot', 'warm'])
    .order('temperature')
    .limit(30)

  const hotLeads = (leadsData ?? []) as Lead[]

  // 6. Monta texto base do digest
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })

  let digestText = `📊 *Digest do Estoque — ${store.name}*\n📅 ${today}\n\n`

  digestText += `🚗 *Visão Geral*\n`
  digestText += `• Total disponível: *${totalVehicles}* veículos\n`
  digestText += `• Tempo médio no estoque: *${avgDays} dias*\n`
  if (critical.length > 0) {
    digestText += `• ⚠️ Parados 60+ dias: *${critical.length}* veículos\n`
  }
  if (warning.length > 0) {
    digestText += `• 🟡 Parados 30-59 dias: *${warning.length}* veículos\n`
  }
  digestText += '\n'

  // Veículos críticos (top 5)
  if (critical.length > 0) {
    digestText += `🔴 *Veículos Críticos (60+ dias)*\n`
    critical.slice(0, 5).forEach(v => {
      const price = v.promotional_price ?? v.sale_price
      const priceStr = price ? `R$ ${price.toLocaleString('pt-BR')}` : 'sem preço'
      digestText += `• ${v.brand} ${v.model} ${v.year_model ?? ''} — *${v.days_in_stock} dias* — ${priceStr}\n`
    })
    if (critical.length > 5) digestText += `  _...e mais ${critical.length - 5} veículos_\n`
    digestText += '\n'
  }

  // Leads quentes
  const hotOnly = hotLeads.filter(l => l.temperature === 'hot')
  if (hotOnly.length > 0) {
    digestText += `🔥 *Leads Quentes (${hotOnly.length})*\n`
    hotOnly.slice(0, 5).forEach(l => {
      const budget = l.budget_max ? ` | R$ ${l.budget_max.toLocaleString('pt-BR')}` : ''
      digestText += `• ${l.client_name}${l.vehicle_interest ? ' — ' + l.vehicle_interest : ''}${budget}\n`
    })
    digestText += '\n'
  }

  // 7. IA: sugestão de ação do dia
  if (ANTHROPIC_API_KEY && totalVehicles > 0) {
    try {
      const vehicleSummary = allVehicles.slice(0, 10).map(v =>
        `${v.brand} ${v.model} ${v.year_model ?? ''} | ${v.days_in_stock ?? 0}d | R$ ${(v.promotional_price ?? v.sale_price ?? 0).toLocaleString('pt-BR')}`
      ).join('\n')

      const leadSummary = hotLeads.slice(0, 5).map(l =>
        `${l.client_name} | ${l.vehicle_interest ?? '—'} | R$ ${l.budget_max?.toLocaleString('pt-BR') ?? '—'}`
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
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Você é consultor de vendas automotivas. Analise o estoque e os leads e dê UMA sugestão de ação prioritária para hoje. Máximo 2 frases.

Estoque (top 10 por tempo):
${vehicleSummary}

Leads quentes:
${leadSummary || 'Nenhum'}

Responda em JSON: {"action":"sugestão aqui"}`,
          }],
        }),
      })
      const data = await res.json() as { content?: Array<{ text: string }> }
      const text = data?.content?.[0]?.text ?? '{}'
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const ai = JSON.parse(match[0]) as { action?: string }
        if (ai.action) {
          digestText += `🤖 *IA — Foco do Dia*\n${ai.action}\n\n`
        }
      }
    } catch (e) {
      console.error('[inventory-digest] AI error:', e)
    }
  }

  digestText += `_Gerado automaticamente pelo CRM Automotivo Pro_ 🚀`

  // 8. Envia via WhatsApp
  await sendWhatsAppMessage(
    instance.instance_token as string,
    owner.phone as string,
    digestText,
    instance.base_url as string,
  )

  return { sent: true, message: digestText }
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
      // Cron: processa todas as lojas ativas com WhatsApp conectado
      const { data: stores } = await supabase
        .from('stores')
        .select('id')
        .in('status', ['active', 'trial'])
      storeIds = (stores ?? []).map((s: { id: string }) => s.id)
    }

    let sent = 0
    for (const storeId of storeIds) {
      const result = await processStore(storeId)
      if (result.sent) sent++
    }

    return json({ processed: storeIds.length, sent })
  } catch (err) {
    console.error('[inventory-digest]', err)
    return json({ error: 'Erro interno' }, 500)
  }
})
