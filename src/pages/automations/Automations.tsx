import { useQuery } from '@tanstack/react-query'
import { Plus, Bot, Zap, Play, Pause } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { Automation } from '@/types'

const TRIGGER_LABELS: Record<string, string> = {
  new_lead: 'Novo Lead',
  stage_change: 'Mudança de Estágio',
  no_contact: 'Sem Contato',
  scheduled: 'Agendado',
}

const DEFAULT_AUTOMATIONS = [
  { day: 1,  action: 'WhatsApp de boas-vindas',            type: 'whatsapp' },
  { day: 2,  action: 'Follow-up com portfólio',            type: 'whatsapp' },
  { day: 3,  action: 'Oferta específica',                  type: 'whatsapp' },
  { day: 5,  action: 'Lembrete sem resposta',              type: 'whatsapp' },
  { day: 7,  action: 'Reduzir temperatura: Quente → Morno', type: 'system' },
  { day: 10, action: 'Template de reengajamento',          type: 'whatsapp' },
  { day: 14, action: 'Alerta interno para vendedor',       type: 'task' },
  { day: 21, action: 'Arquivar lead automaticamente',      type: 'system' },
]

const nodeStyle = (type: string): React.CSSProperties => ({
  width: 36, height: 36, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 11, fontWeight: 700, flexShrink: 0, position: 'relative', zIndex: 1,
  background: type === 'whatsapp' ? 'var(--ng)' : type === 'system' ? 'rgba(59,130,246,.12)' : 'rgba(234,179,8,.12)',
  border: `2px solid ${type === 'whatsapp' ? 'var(--nb)' : type === 'system' ? 'rgba(59,130,246,.4)' : 'rgba(234,179,8,.4)'}`,
  color: type === 'whatsapp' ? 'var(--neon)' : type === 'system' ? 'var(--blu)' : 'var(--yel)',
})

export default function Automations() {
  const { store } = useAuthStore()

  const { data: automations } = useQuery({
    queryKey: ['automations', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('automations')
        .select('*')
        .eq('store_id', store!.id)
        .order('created_at')
      return (data ?? []) as Automation[]
    },
    enabled: !!store?.id,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Automações</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Fluxos automáticos de follow-up</p>
        </div>
        <Button size="sm"><Plus size={13} /> Nova Automação</Button>
      </div>

      {/* 21-day flow */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9, padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Zap size={14} style={{ color: 'var(--neon)' }} />
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Fluxo Padrão — 21 Dias</h2>
          <Badge variant="neon" dot>Recomendado</Badge>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 17, top: 0, bottom: 0,
            width: 1, background: 'var(--b)',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DEFAULT_AUTOMATIONS.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
                <div style={nodeStyle(item.type)}>{item.day}</div>
                <div style={{
                  flex: 1, background: 'var(--el)', border: '1px solid var(--b)',
                  borderRadius: 7, padding: '8px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <p style={{ fontSize: 12, color: 'var(--t)' }}>{item.action}</p>
                  <Badge variant={item.type === 'whatsapp' ? 'neon' : item.type === 'system' ? 'info' : 'warning'}>
                    {item.type === 'whatsapp' ? 'WhatsApp' : item.type === 'system' ? 'Sistema' : 'Tarefa'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custom automations */}
      {automations && automations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>Automações Personalizadas</h2>
          {automations.map((auto) => (
            <div key={auto.id} style={{
              background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9,
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 9,
                background: 'var(--ng)', border: '1px solid var(--nb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bot size={16} style={{ color: 'var(--neon)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{auto.name}</p>
                <p style={{ fontSize: 10, color: 'var(--t3)' }}>
                  Gatilho: {TRIGGER_LABELS[auto.trigger_type] ?? auto.trigger_type}
                </p>
              </div>
              <Badge variant={auto.active ? 'neon' : 'default'} dot>
                {auto.active ? 'Ativo' : 'Pausado'}
              </Badge>
              <button style={{
                color: 'var(--t3)', background: 'none', border: 'none',
                cursor: 'pointer', padding: 4, borderRadius: 5, display: 'flex',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--t)'; e.currentTarget.style.background = 'var(--el)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'none' }}
              >
                {auto.active ? <Pause size={14} /> : <Play size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
