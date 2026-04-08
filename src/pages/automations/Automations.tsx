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
  { day: 1, action: 'WhatsApp de boas-vindas', type: 'whatsapp' },
  { day: 2, action: 'Follow-up com portfólio', type: 'whatsapp' },
  { day: 3, action: 'Oferta específica', type: 'whatsapp' },
  { day: 5, action: 'Lembrete sem resposta', type: 'whatsapp' },
  { day: 7, action: 'Reduzir temperatura: Quente → Morno', type: 'system' },
  { day: 10, action: 'Template de reengajamento', type: 'whatsapp' },
  { day: 14, action: 'Alerta interno para vendedor', type: 'task' },
  { day: 21, action: 'Arquivar lead automaticamente', type: 'system' },
]

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Automações</h1>
          <p className="text-sm text-[#555]">Fluxos automáticos de follow-up</p>
        </div>
        <Button size="sm"><Plus size={14} /> Nova Automação</Button>
      </div>

      {/* 21-day flow preview */}
      <div className="bg-[#111] border border-[#222] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-[#39FF14]" />
          <h2 className="font-semibold text-white">Fluxo Padrão — 21 Dias</h2>
          <Badge variant="neon" dot>Recomendado</Badge>
        </div>
        <div className="relative">
          <div className="absolute left-[18px] top-0 bottom-0 w-px bg-[#222]" />
          <div className="space-y-3">
            {DEFAULT_AUTOMATIONS.map((item, i) => (
              <div key={i} className="flex items-start gap-4 relative">
                <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 z-10 ${
                  item.type === 'whatsapp' ? 'bg-[#39FF14]/10 border-[#39FF14]/40 text-[#39FF14]' :
                  item.type === 'system' ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' :
                  'bg-yellow-500/10 border-yellow-500/40 text-yellow-400'
                }`}>
                  {item.day}
                </div>
                <div className="flex-1 bg-[#1A1A1A] border border-[#222] rounded-lg p-3 ml-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-white">{item.action}</p>
                    <Badge variant={item.type === 'whatsapp' ? 'neon' : item.type === 'system' ? 'info' : 'warning'} className="text-[10px]">
                      {item.type === 'whatsapp' ? 'WhatsApp' : item.type === 'system' ? 'Sistema' : 'Tarefa'}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#555] mt-0.5">Dia {item.day} após criação do lead</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custom automations */}
      {automations && automations.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-white">Automações Personalizadas</h2>
          {automations.map((auto) => (
            <div key={auto.id} className="bg-[#111] border border-[#222] rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] flex items-center justify-center">
                <Bot size={18} className="text-[#39FF14]" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">{auto.name}</p>
                <p className="text-xs text-[#555]">
                  Gatilho: {TRIGGER_LABELS[auto.trigger_type] ?? auto.trigger_type}
                </p>
              </div>
              <Badge variant={auto.active ? 'neon' : 'default'} dot>
                {auto.active ? 'Ativo' : 'Pausado'}
              </Badge>
              <button className="text-[#555] hover:text-white p-1 rounded hover:bg-[#1A1A1A]">
                {auto.active ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
