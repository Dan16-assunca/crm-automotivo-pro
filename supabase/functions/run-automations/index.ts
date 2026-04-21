// Edge Function: run-automations
// Executa automações pendentes para todos os leads de todas as lojas.
// Chamada por cron do Supabase a cada hora: 0 * * * *
// Também pode ser chamada manualmente via POST /functions/v1/run-automations

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const WHATSAPP_PROXY = Deno.env.get('VITE_EVOLUTION_API_URL') ?? ''

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AutomationAction {
  type: 'send_whatsapp' | 'change_temperature' | 'change_stage' | 'create_task' | 'archive_lead'
  delay_days?: number
  config: Record<string, unknown>
}

interface Automation {
  id: string
  store_id: string
  name: string
  trigger_type: string
  trigger_config: Record<string, unknown>
  actions: AutomationAction[]
  active: boolean
}

interface Lead {
  id: string
  store_id: string
  client_name: string
  client_phone: string | null
  vehicle_interest: string | null
  temperature: string | null
  status: string
  stage_id: string | null
  last_contact_at: string | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 9999
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

// Envia mensagem via UazapiGO (via proxy Vercel)
async function sendWhatsApp(
  instanceToken: string,
  phone: string,
  message: string,
): Promise<boolean> {
  if (!WHATSAPP_PROXY || !instanceToken || !phone) return false
  try {
    const res = await fetch(
      `${WHATSAPP_PROXY}/send/text?token=${encodeURIComponent(instanceToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone.replace(/\D/g, ''), text: message }),
      },
    )
    return res.ok
  } catch (e) {
    console.error('[run-automations] sendWhatsApp error:', e)
    return false
  }
}

// ─── Executor de ação ─────────────────────────────────────────────────────────

async function executeAction(
  action: AutomationAction,
  lead: Lead,
  storeVars: { loja: string; vendedor: string; instanceToken: string },
): Promise<{ ok: boolean; error?: string }> {
  const vars: Record<string, string> = {
    nome:     lead.client_name,
    telefone: lead.client_phone ?? '',
    veiculo:  lead.vehicle_interest ?? '',
    vendedor: storeVars.vendedor,
    loja:     storeVars.loja,
  }

  switch (action.type) {

    case 'send_whatsapp': {
      const message = interpolate((action.config.message as string) ?? '', vars)
      const phone   = lead.client_phone
      if (!phone) return { ok: false, error: 'Lead sem telefone' }
      const ok = await sendWhatsApp(storeVars.instanceToken, phone, message)
      if (!ok) return { ok: false, error: 'Falha no envio WhatsApp' }

      // Registra atividade no banco
      await supabase.from('activities').insert({
        lead_id:   lead.id,
        store_id:  lead.store_id,
        type:      'whatsapp',
        content:   `[Automação] ${message.slice(0, 120)}`,
        created_at: new Date().toISOString(),
      })
      return { ok: true }
    }

    case 'change_temperature': {
      const temp = action.config.temperature as string
      if (!['hot', 'warm', 'cold'].includes(temp)) return { ok: false, error: 'Temperatura inválida' }
      const { error } = await supabase.from('leads').update({ temperature: temp }).eq('id', lead.id)
      if (error) return { ok: false, error: error.message }
      await supabase.from('activities').insert({
        lead_id:  lead.id,
        store_id: lead.store_id,
        type:     'note',
        content:  `[Automação] Temperatura alterada para ${temp}`,
        created_at: new Date().toISOString(),
      })
      return { ok: true }
    }

    case 'change_stage': {
      const stageId = action.config.stage_id as string
      if (!stageId) return { ok: false, error: 'stage_id não definido' }
      const { error } = await supabase.from('leads').update({ stage_id: stageId }).eq('id', lead.id)
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    case 'create_task': {
      const title = interpolate((action.config.title as string) ?? 'Follow-up automático', vars)
      await supabase.from('activities').insert({
        lead_id:  lead.id,
        store_id: lead.store_id,
        type:     'task',
        content:  title,
        created_at: new Date().toISOString(),
      })
      return { ok: true }
    }

    case 'archive_lead': {
      const { error } = await supabase.from('leads').update({ status: 'archived' }).eq('id', lead.id)
      if (error) return { ok: false, error: error.message }
      await supabase.from('activities').insert({
        lead_id:  lead.id,
        store_id: lead.store_id,
        type:     'note',
        content:  '[Automação] Lead arquivado automaticamente por inatividade.',
        created_at: new Date().toISOString(),
      })
      return { ok: true }
    }

    default:
      return { ok: false, error: `Tipo de ação desconhecido: ${action.type}` }
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Aceita GET (cron) e POST (manual)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const results: Record<string, unknown>[] = []
  let totalExecuted = 0
  let totalFailed   = 0

  try {
    // 1. Busca todas as automações ativas
    const { data: automations, error: autoErr } = await supabase
      .from('automations')
      .select('*')
      .eq('active', true)

    if (autoErr) throw autoErr
    if (!automations?.length) {
      return new Response(JSON.stringify({ message: 'Nenhuma automação ativa', executed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Para cada automação, determina os leads elegíveis
    for (const auto of automations as Automation[]) {

      // 2a. Carrega dados da loja (nome + vendedor padrão + instância WA)
      const { data: storeData } = await supabase
        .from('stores')
        .select('name')
        .eq('id', auto.store_id)
        .single()

      const { data: instanceData } = await supabase
        .from('whatsapp_instances')
        .select('instance_token')
        .eq('store_id', auto.store_id)
        .eq('status', 'connected')
        .limit(1)
        .single()

      const { data: adminUser } = await supabase
        .from('users')
        .select('full_name')
        .eq('store_id', auto.store_id)
        .eq('role', 'admin')
        .limit(1)
        .single()

      const storeVars = {
        loja:          storeData?.name ?? 'Nossa loja',
        vendedor:      adminUser?.full_name ?? 'Vendedor',
        instanceToken: instanceData?.instance_token ?? '',
      }

      // 2b. Busca leads elegíveis de acordo com o trigger
      let leads: Lead[] = []

      if (auto.trigger_type === 'new_lead') {
        // Todos os leads ativos desta loja
        const { data } = await supabase
          .from('leads')
          .select('id, store_id, client_name, client_phone, vehicle_interest, temperature, status, stage_id, last_contact_at, created_at')
          .eq('store_id', auto.store_id)
          .eq('status', 'active')
        leads = (data ?? []) as Lead[]

      } else if (auto.trigger_type === 'no_contact') {
        const days = (auto.trigger_config.days as number) ?? 3
        const { data } = await supabase
          .from('leads')
          .select('id, store_id, client_name, client_phone, vehicle_interest, temperature, status, stage_id, last_contact_at, created_at')
          .eq('store_id', auto.store_id)
          .eq('status', 'active')
        leads = ((data ?? []) as Lead[]).filter(l => daysSince(l.last_contact_at) >= days)

      } else if (auto.trigger_type === 'stage_change') {
        const stageId = auto.trigger_config.stage_id as string | undefined
        const query = supabase
          .from('leads')
          .select('id, store_id, client_name, client_phone, vehicle_interest, temperature, status, stage_id, last_contact_at, created_at')
          .eq('store_id', auto.store_id)
          .eq('status', 'active')
        if (stageId) query.eq('stage_id', stageId)
        const { data } = await query
        leads = (data ?? []) as Lead[]
      }

      // 2c. Para cada lead + ação, verifica se já foi executada e se o delay foi atingido
      for (const lead of leads) {
        const triggerDate = new Date(lead.created_at) // base: data de criação do lead

        for (let actionIdx = 0; actionIdx < auto.actions.length; actionIdx++) {
          const action = auto.actions[actionIdx]
          const delayDays = action.delay_days ?? 0
          const scheduledAt = new Date(triggerDate.getTime() + delayDays * 86_400_000)

          // Ainda não chegou o dia
          if (scheduledAt > new Date()) continue

          // Verifica se já foi executada
          const { data: existing } = await supabase
            .from('automation_executions')
            .select('id')
            .eq('automation_id', auto.id)
            .eq('lead_id', lead.id)
            .eq('action_index', actionIdx)
            .maybeSingle()

          if (existing) continue // já executou

          // Executa!
          const result = await executeAction(action, lead, storeVars)

          // Registra execução
          await supabase.from('automation_executions').insert({
            automation_id: auto.id,
            lead_id:       lead.id,
            action_index:  actionIdx,
            status:        result.ok ? 'success' : 'failed',
            error_message: result.error ?? null,
          })

          if (result.ok) totalExecuted++
          else totalFailed++

          results.push({
            automation: auto.name,
            lead:       lead.client_name,
            action:     action.type,
            actionIdx,
            ok:         result.ok,
            error:      result.error,
          })
        }
      }
    }

    console.log(`[run-automations] Done. executed=${totalExecuted} failed=${totalFailed}`)
    return new Response(
      JSON.stringify({ executed: totalExecuted, failed: totalFailed, details: results }),
      { headers: { 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('[run-automations] Fatal error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
