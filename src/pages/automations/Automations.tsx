import React, { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Bot, Zap, Play, Pause, Trash2, Edit2, X,
  MessageSquare, Thermometer, GitBranch, CheckSquare,
  Archive, AlertCircle, Check, ArrowDown, Settings2,
  ChevronRight, Library,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/Toast'
import type { Automation, AutomationAction } from '@/types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const TRIGGERS = [
  { id: 'new_lead',      label: 'Novo Lead',        desc: 'Quando um lead é criado',             icon: '🆕', color: '#39FF14' },
  { id: 'no_contact',   label: 'Sem Contato',       desc: 'Após X dias sem resposta do lead',    icon: '🔕', color: '#f97316' },
  { id: 'stage_change', label: 'Mudança de Etapa',  desc: 'Quando o lead entra em uma etapa',   icon: '🔀', color: '#3b82f6' },
]

const ACTION_TYPES: { id: AutomationAction['type']; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { id: 'send_whatsapp',      label: 'Enviar WhatsApp',   icon: <MessageSquare size={14} />, color: '#25d366', bg: 'rgba(37,211,102,.12)' },
  { id: 'change_temperature', label: 'Mudar Temperatura', icon: <Thermometer size={14} />,  color: '#f97316', bg: 'rgba(249,115,22,.12)'  },
  { id: 'change_stage',       label: 'Mover de Etapa',    icon: <GitBranch size={14} />,    color: '#3b82f6', bg: 'rgba(59,130,246,.12)'  },
  { id: 'create_task',        label: 'Criar Tarefa',       icon: <CheckSquare size={14} />,  color: '#8b5cf6', bg: 'rgba(139,92,246,.12)'  },
  { id: 'archive_lead',       label: 'Arquivar Lead',      icon: <Archive size={14} />,      color: '#6b7280', bg: 'rgba(107,114,128,.12)' },
]

const TEMP_OPTS = [
  { id: 'hot',  label: '🔥 Quente', color: '#ef4444' },
  { id: 'warm', label: '⚡ Morno',  color: '#f97316' },
  { id: 'cold', label: '❄️ Frio',   color: '#3b82f6' },
]

const VARS = ['{{nome}}', '{{telefone}}', '{{veiculo}}', '{{vendedor}}', '{{loja}}']

// ─── Templates de automação prontos ──────────────────────────────────────────

interface AutomationTemplate {
  id: string
  name: string
  description: string
  emoji: string
  color: string
  trigger_type: 'new_lead' | 'no_contact' | 'stage_change'
  trigger_config: Record<string, unknown>
  actions: AutomationAction[]
  tags: string[]
}

const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'whatsapp_boas_vindas',
    name: 'Boas-vindas WhatsApp',
    description: 'Mensagem automática para leads que chegam pelo WhatsApp',
    emoji: '👋',
    color: '#25d366',
    trigger_type: 'new_lead',
    trigger_config: {},
    tags: ['WhatsApp', 'Novo lead'],
    actions: [
      { type: 'send_whatsapp', delay_days: 0, config: { message: 'Olá {{nome}}! Seja bem-vindo(a) à {{loja}} 🚗\n\nVi que você entrou em contato e quero te ajudar a encontrar o veículo ideal.\n\nQual seu interesse atual? Já tem algo em mente?' } },
      { type: 'send_whatsapp', delay_days: 1, config: { message: 'Oi {{nome}}! Tudo bem?\nGostaria de te mostrar algumas opções do nosso estoque que podem te interessar. Posso enviar?' } },
      { type: 'create_task',   delay_days: 2, config: { title: 'Ligar para {{nome}} — aguardando resposta' } },
    ],
  },
  {
    id: 'reengajamento_frio',
    name: 'Reengajamento — Lead Frio',
    description: 'Reativa leads que não respondem há mais de 7 dias',
    emoji: '🔄',
    color: '#f97316',
    trigger_type: 'no_contact',
    trigger_config: { days: 7 },
    tags: ['Reengajamento', 'Lead frio'],
    actions: [
      { type: 'send_whatsapp',      delay_days: 0,  config: { message: 'Oi {{nome}}! Percebi que faz um tempinho que não conversamos. Ainda está procurando um veículo? Estou aqui para ajudar 😊' } },
      { type: 'change_temperature', delay_days: 0,  config: { temperature: 'cold' } },
      { type: 'send_whatsapp',      delay_days: 3,  config: { message: '{{nome}}, entramos com algumas novidades no estoque esta semana. Posso te mostrar algo especial?' } },
      { type: 'create_task',        delay_days: 7,  config: { title: 'Decisão: arquivar ou insistir em {{nome}}' } },
      { type: 'archive_lead',       delay_days: 14, config: {} },
    ],
  },
  {
    id: 'pos_venda',
    name: 'Pós-venda & Indicação',
    description: 'Nurtura cliente após a compra e solicita indicações',
    emoji: '🏆',
    color: '#a78bfa',
    trigger_type: 'stage_change',
    trigger_config: {},
    tags: ['Pós-venda', 'Indicação'],
    actions: [
      { type: 'send_whatsapp', delay_days: 0,  config: { message: '{{nome}}, parabéns pela sua aquisição! 🎉 Ficamos muito felizes em ter ajudado. Qualquer dúvida sobre o veículo, estou à disposição!' } },
      { type: 'send_whatsapp', delay_days: 7,  config: { message: 'Oi {{nome}}, tudo certo com seu novo veículo? Espero que esteja aproveitando! Qualquer ajuda é só falar 😊' } },
      { type: 'send_whatsapp', delay_days: 30, config: { message: '{{nome}}, como está sendo a experiência com o veículo? Se conhecer alguém procurando um carro, minha indicação é sempre muito bem-vinda! Obrigado 🙏' } },
      { type: 'create_task',   delay_days: 90, config: { title: 'Contato de relacionamento com {{nome}} — 3 meses pós-venda' } },
    ],
  },
  {
    id: 'urgencia_oferta',
    name: 'Oferta por Tempo Limitado',
    description: 'Cria senso de urgência para leads que não fecharam',
    emoji: '⚡',
    color: '#ef4444',
    trigger_type: 'no_contact',
    trigger_config: { days: 5 },
    tags: ['Urgência', 'Conversão'],
    actions: [
      { type: 'send_whatsapp',      delay_days: 0, config: { message: '{{nome}}, tenho uma novidade importante para você! Estamos com uma condição especial de financiamento esta semana — parcelas reduzidas e entrada facilitada. Quer saber mais?' } },
      { type: 'change_temperature', delay_days: 0, config: { temperature: 'warm' } },
      { type: 'send_whatsapp',      delay_days: 2, config: { message: 'Oi {{nome}}! A promoção que te mencionei encerra em breve. O {{veiculo}} que você se interessou ainda está disponível. Posso reservar para você dar uma olhada?' } },
      { type: 'create_task',        delay_days: 3, config: { title: 'Ligar URGENTE para {{nome}} — proposta expirando' } },
    ],
  },
]

const PRESET_21: { day: number; label: string; type: 'whatsapp' | 'system' | 'task'; actionObj: AutomationAction }[] = [
  { day: 0,  label: 'Boas-vindas',                    type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 0,  config: { message: 'Olá {{nome}}! Bem-vindo(a) à {{loja}}. Temos ótimas opções para você! Como posso ajudar?' } } },
  { day: 1,  label: 'Follow-up com portfólio',        type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 1,  config: { message: 'Oi {{nome}}, tudo bem? Separei algumas opções que combinam com o que você busca. Posso enviar?' } } },
  { day: 2,  label: 'Oferta especial',                type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 2,  config: { message: '{{nome}}, temos uma oferta especial hoje! Condições exclusivas de financiamento. Vamos conversar?' } } },
  { day: 4,  label: 'Lembrete sem resposta',          type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 4,  config: { message: 'Oi {{nome}}! Estou à disposição se tiver alguma dúvida 😊' } } },
  { day: 6,  label: 'Temperatura → Morno',            type: 'system',   actionObj: { type: 'change_temperature', delay_days: 6,  config: { temperature: 'warm' } } },
  { day: 9,  label: 'Reengajamento',                  type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 9,  config: { message: '{{nome}}, ainda está procurando um veículo? Posso te ajudar a encontrar a melhor opção dentro do seu orçamento.' } } },
  { day: 13, label: 'Tarefa: ligar para o lead',      type: 'task',     actionObj: { type: 'create_task',        delay_days: 13, config: { title: 'Ligar para {{nome}} — lead frio há 14 dias' } } },
  { day: 20, label: 'Arquivar automaticamente',       type: 'system',   actionObj: { type: 'archive_lead',       delay_days: 20, config: {} } },
]

// ─── Node de fluxo visual ─────────────────────────────────────────────────────

function FlowConnector() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flexShrink: 0 }}>
      <div style={{ width: 1, height: 12, background: 'var(--bs)' }} />
      <ArrowDown size={10} style={{ color: 'var(--t3)' }} />
      <div style={{ width: 1, height: 12, background: 'var(--bs)' }} />
    </div>
  )
}

function TriggerNode({ trigger, config, onClick }: {
  trigger: typeof TRIGGERS[0]
  config: Record<string, unknown>
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)', border: `1px solid ${trigger.color}44`,
        borderLeft: `3px solid ${trigger.color}`,
        borderRadius: 10, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: `0 0 16px ${trigger.color}18`,
        transition: 'box-shadow .15s',
      }}
      onMouseEnter={e => onClick && (e.currentTarget.style.boxShadow = `0 0 24px ${trigger.color}30`)}
      onMouseLeave={e => onClick && (e.currentTarget.style.boxShadow = `0 0 16px ${trigger.color}18`)}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: `${trigger.color}18`, border: `1px solid ${trigger.color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
      }}>
        {trigger.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: trigger.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>
          GATILHO
        </p>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>{trigger.label}</p>
        <p style={{ fontSize: 10, color: 'var(--t3)' }}>
          {trigger.id === 'no_contact' ? `Após ${(config.days as number) ?? 3} dias sem contato` : trigger.desc}
        </p>
      </div>
      {onClick && <Settings2 size={13} style={{ color: 'var(--t3)', flexShrink: 0 }} />}
    </div>
  )
}

function ActionNode({ action, index, stages, isSelected, onClick, onRemove }: {
  action: AutomationAction
  index: number
  stages: { id: string; name: string }[]
  isSelected?: boolean
  onClick?: () => void
  onRemove?: () => void
}) {
  const meta = ACTION_TYPES.find(a => a.id === action.type)!

  const summary = () => {
    if (action.type === 'send_whatsapp')      return (action.config.message as string)?.slice(0, 50) + '…' || 'Mensagem não configurada'
    if (action.type === 'change_temperature') return `Temperatura → ${TEMP_OPTS.find(t => t.id === action.config.temperature)?.label ?? action.config.temperature}`
    if (action.type === 'change_stage')       return `Mover → ${stages.find(s => s.id === action.config.stage_id)?.name ?? 'Etapa não selecionada'}`
    if (action.type === 'create_task')        return (action.config.title as string) || 'Título não definido'
    if (action.type === 'archive_lead')       return 'Lead será arquivado'
    return ''
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--card)', borderRadius: 10,
        border: `1px solid ${isSelected ? meta.color + '80' : 'var(--bs)'}`,
        borderLeft: `3px solid ${meta.color}`,
        padding: '10px 14px', cursor: onClick ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: isSelected ? `0 0 20px ${meta.color}25` : 'none',
        transition: 'box-shadow .15s, border-color .15s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = meta.color + '44' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--bs)' }}
    >
      {/* Day badge */}
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: meta.bg, border: `1px solid ${meta.color}44`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
      }}>
        <span style={{ color: meta.color, display: 'flex' }}>{meta.icon}</span>
        <span style={{ fontSize: 8, color: meta.color, fontWeight: 700, fontFamily: 'var(--fm)' }}>D{action.delay_days ?? 0}</span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: meta.color, marginBottom: 2 }}>{meta.label}</p>
        <p style={{ fontSize: 10, color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary()}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {onClick && <ChevronRight size={12} style={{ color: 'var(--t3)' }} />}
        {onRemove && (
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 2 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Painel de configuração de nó ─────────────────────────────────────────────

function NodeConfigPanel({ action, index, stages, onChange, onClose }: {
  action: AutomationAction
  index: number
  stages: { id: string; name: string }[]
  onChange: (updated: AutomationAction) => void
  onClose: () => void
}) {
  const meta = ACTION_TYPES.find(a => a.id === action.type)!
  const inp: React.CSSProperties = {
    width: '100%', height: 34, padding: '0 10px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 6, color: 'var(--t)', fontSize: 12,
    outline: 'none', fontFamily: 'var(--fn)', boxSizing: 'border-box',
  }

  const insertVar = (v: string) => {
    const msg = ((action.config.message as string) ?? '') + v
    onChange({ ...action, config: { ...action.config, message: msg } })
  }

  return (
    <div style={{
      width: 280, flexShrink: 0,
      background: 'var(--card)', borderLeft: '1px solid var(--bs)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid var(--bs)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: meta.color }}>{meta.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>Configurar Ação {index + 1}</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex' }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Tipo de ação */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
            Tipo de Ação
          </label>
          <select
            value={action.type}
            onChange={e => onChange({ type: e.target.value as AutomationAction['type'], delay_days: action.delay_days, config: {} })}
            style={{ ...inp, cursor: 'pointer' }}
          >
            {ACTION_TYPES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>

        {/* Delay */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
            Executar no Dia
          </label>
          <input
            type="number" min={0} max={365}
            value={action.delay_days ?? 0}
            onChange={e => onChange({ ...action, delay_days: Math.max(0, parseInt(e.target.value) || 0) })}
            style={{ ...inp, width: 80 }}
          />
          <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4 }}>Dias após o gatilho ser disparado</p>
        </div>

        {/* Config por tipo */}
        {action.type === 'send_whatsapp' && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
              Mensagem
            </label>
            <textarea
              placeholder="Digite a mensagem..."
              value={(action.config.message as string) ?? ''}
              onChange={e => onChange({ ...action, config: { ...action.config, message: e.target.value } })}
              rows={5}
              style={{
                width: '100%', padding: '8px 10px', resize: 'vertical',
                background: 'var(--el)', border: '1px solid var(--b)',
                borderRadius: 6, color: 'var(--t)', fontSize: 12,
                outline: 'none', fontFamily: 'var(--fn)', lineHeight: 1.5,
                boxSizing: 'border-box',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
            />
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
              {VARS.map(v => (
                <button key={v} onClick={() => insertVar(v)}
                  style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                    background: 'var(--ng)', border: '1px solid var(--nb)',
                    color: 'var(--neon)', cursor: 'pointer',
                  }}>
                  {v}
                </button>
              ))}
            </div>
            {/* AI personalize toggle */}
            <button
              onClick={() => onChange({ ...action, config: { ...action.config, ai_personalize: !action.config.ai_personalize } })}
              style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                border: `1px solid ${action.config.ai_personalize ? 'rgba(139,92,246,.5)' : 'var(--b)'}`,
                background: action.config.ai_personalize ? 'rgba(139,92,246,.1)' : 'transparent',
                color: (action.config.ai_personalize ? '#BF5AF2' : 'var(--t3)') as string,
                transition: 'all .15s',
              }}
            >
              <Bot size={12} />
              🤖 Personalizar com IA
              <span style={{ marginLeft: 'auto', fontSize: 9, opacity: .7 }}>
                {!!action.config.ai_personalize ? 'ATIVO' : 'INATIVO'}
              </span>
            </button>
            {!!action.config.ai_personalize && (
              <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4, lineHeight: 1.4, opacity: .7 }}>
                Claude Haiku irá reescrever esta mensagem para cada lead com base no perfil individual antes do envio.
              </p>
            )}
          </div>
        )}

        {action.type === 'change_temperature' && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
              Nova Temperatura
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {TEMP_OPTS.map(t => (
                <button key={t.id} onClick={() => onChange({ ...action, config: { temperature: t.id } })}
                  style={{
                    padding: '8px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                    background: action.config.temperature === t.id ? `${t.color}18` : 'var(--el)',
                    border: `1px solid ${action.config.temperature === t.id ? t.color + '60' : 'var(--b)'}`,
                    color: action.config.temperature === t.id ? t.color : 'var(--t3)',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {action.type === 'change_stage' && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
              Mover para a Etapa
            </label>
            <select
              value={(action.config.stage_id as string) ?? ''}
              onChange={e => onChange({ ...action, config: { stage_id: e.target.value } })}
              style={{ ...inp, cursor: 'pointer' }}
            >
              <option value="">Selecione a etapa...</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {action.type === 'create_task' && (
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>
              Título da Tarefa
            </label>
            <input
              type="text"
              placeholder="Ex: Ligar para {{nome}}"
              value={(action.config.title as string) ?? ''}
              onChange={e => onChange({ ...action, config: { title: e.target.value } })}
              style={inp}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
            />
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
              {VARS.map(v => (
                <button key={v} onClick={() => onChange({ ...action, config: { title: ((action.config.title as string) ?? '') + v } })}
                  style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                    background: 'var(--ng)', border: '1px solid var(--nb)',
                    color: 'var(--neon)', cursor: 'pointer',
                  }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        {action.type === 'archive_lead' && (
          <div style={{ background: 'rgba(107,114,128,.08)', border: '1px solid rgba(107,114,128,.2)', borderRadius: 8, padding: '10px 12px' }}>
            <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
              O lead será movido para o arquivo automaticamente. Nenhuma configuração necessária.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Editor visual (modal n8n-like) ──────────────────────────────────────────

function FlowEditor({
  initial,
  stages,
  onClose,
  onSave,
}: {
  initial?: Automation | null
  stages: { id: string; name: string }[]
  onClose: () => void
  onSave: (data: Partial<Automation>) => void
}) {
  const [name, setName]       = useState(initial?.name ?? '')
  const [trigger, setTrigger] = useState<string>(initial?.trigger_type ?? 'new_lead')
  const [trigCfg, setTrigCfg] = useState<Record<string, unknown>>(initial?.trigger_config ?? {})
  const [actions, setActions] = useState<AutomationAction[]>(
    initial?.actions?.length ? initial.actions : [{ type: 'send_whatsapp', delay_days: 0, config: {} }]
  )
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [showTriggerCfg, setShowTriggerCfg] = useState(false)

  const triggerMeta = TRIGGERS.find(t => t.id === trigger)!

  const addAction = () => {
    const last = actions[actions.length - 1]
    const newAction: AutomationAction = { type: 'send_whatsapp', delay_days: (last?.delay_days ?? 0) + 1, config: {} }
    setActions(prev => [...prev, newAction])
    setSelectedNode(actions.length)
  }

  const updateAction = (i: number, updated: AutomationAction) =>
    setActions(prev => prev.map((a, idx) => idx === i ? updated : a))

  const removeAction = (i: number) => {
    setActions(prev => prev.filter((_, idx) => idx !== i))
    if (selectedNode === i) setSelectedNode(null)
    else if (selectedNode !== null && selectedNode > i) setSelectedNode(selectedNode - 1)
  }

  const handleSave = () => {
    if (!name.trim()) { toast.error('Preencha o nome da automação'); return }
    if (!actions.length) { toast.error('Adicione pelo menos uma ação'); return }
    onSave({
      name: name.trim(),
      trigger_type: trigger as Automation['trigger_type'],
      trigger_config: trigCfg,
      actions,
    })
  }

  const inp: React.CSSProperties = {
    height: 36, padding: '0 11px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 13,
    outline: 'none', fontFamily: 'var(--fn)',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'stretch' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }} onClick={onClose} />

      {/* Editor principal */}
      <div style={{
        position: 'relative', zIndex: 1,
        margin: 'auto',
        width: '100%', maxWidth: selectedNode !== null || showTriggerCfg ? 900 : 620,
        maxHeight: '92vh',
        background: 'var(--card)', border: '1px solid var(--bs)',
        borderRadius: 14, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 32px 80px rgba(0,0,0,.6)',
        transition: 'max-width .2s ease',
      }}>

        {/* Top bar */}
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--bs)',
          display: 'flex', alignItems: 'center', gap: 12, background: 'var(--el)',
        }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={14} style={{ color: 'var(--neon)' }} />
          </div>
          <input
            type="text"
            placeholder="Nome da automação…"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ ...inp, flex: 1, fontSize: 14, fontWeight: 600, background: 'transparent', border: '1px solid transparent', paddingLeft: 0 }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body — canvas + config panel */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Canvas */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '20px 24px',
            // Fundo estilo n8n com pontos
            backgroundImage: 'radial-gradient(circle, var(--bs) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          }}>
            {/* Gatilho */}
            <TriggerNode
              trigger={triggerMeta}
              config={trigCfg}
              onClick={() => { setShowTriggerCfg(v => !v); setSelectedNode(null) }}
            />

            {/* Configuração do gatilho (inline) */}
            {showTriggerCfg && (
              <>
                <FlowConnector />
                <div style={{
                  background: 'var(--card)', border: `1px solid ${triggerMeta.color}44`,
                  borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                    Tipo de Gatilho
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {TRIGGERS.map(t => (
                      <button key={t.id} onClick={() => { setTrigger(t.id); setTrigCfg({}) }}
                        style={{
                          padding: '8px 6px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                          background: trigger === t.id ? `${t.color}18` : 'var(--el)',
                          border: `1px solid ${trigger === t.id ? t.color + '60' : 'var(--b)'}`,
                        }}>
                        <div style={{ fontSize: 16, marginBottom: 3 }}>{t.icon}</div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: trigger === t.id ? t.color : 'var(--t)', marginBottom: 1 }}>{t.label}</p>
                        <p style={{ fontSize: 8, color: 'var(--t3)', lineHeight: 1.4 }}>{t.desc}</p>
                      </button>
                    ))}
                  </div>
                  {trigger === 'no_contact' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--t2)' }}>Após</span>
                      <input type="number" min={1} max={365} value={(trigCfg.days as number) ?? 3}
                        onChange={e => setTrigCfg({ days: parseInt(e.target.value) || 3 })}
                        style={{ ...inp, width: 60, textAlign: 'center', height: 30 }} />
                      <span style={{ fontSize: 12, color: 'var(--t2)' }}>dias sem contato</span>
                    </div>
                  )}
                  {trigger === 'stage_change' && (
                    <select value={(trigCfg.stage_id as string) ?? ''}
                      onChange={e => setTrigCfg({ stage_id: e.target.value })}
                      style={{ ...inp, cursor: 'pointer', width: '100%' }}>
                      <option value="">Qualquer etapa</option>
                      {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                </div>
              </>
            )}

            {/* Nós de ação */}
            {actions.map((action, i) => (
              <React.Fragment key={i}>
                <FlowConnector />
                <ActionNode
                  action={action}
                  index={i}
                  stages={stages}
                  isSelected={selectedNode === i}
                  onClick={() => { setSelectedNode(selectedNode === i ? null : i); setShowTriggerCfg(false) }}
                  onRemove={() => removeAction(i)}
                />
              </React.Fragment>
            ))}

            {/* Adicionar ação */}
            <FlowConnector />
            <button onClick={addAction}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'var(--ng)', border: '1px dashed var(--nb)', color: 'var(--neon)',
                transition: 'background .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(57,255,20,.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--ng)')}
            >
              <Plus size={14} /> Adicionar ação
            </button>
          </div>

          {/* Painel de config do nó selecionado */}
          {selectedNode !== null && actions[selectedNode] && (
            <NodeConfigPanel
              action={actions[selectedNode]}
              index={selectedNode}
              stages={stages}
              onChange={updated => updateAction(selectedNode, updated)}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--bs)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--el)',
        }}>
          <p style={{ fontSize: 11, color: 'var(--t3)' }}>
            {actions.length} {actions.length === 1 ? 'ação' : 'ações'} configuradas
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
              style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--b)', color: 'var(--t2)' }}>
              Cancelar
            </button>
            <button onClick={handleSave}
              style={{
                padding: '7px 18px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'var(--neon)', border: 'none', color: '#000',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <Check size={13} /> Salvar Automação
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AutomationCard (lista) ───────────────────────────────────────────────────

function AutomationCard({
  automation, stages, onEdit, onDelete, onToggle,
}: {
  automation: Automation
  stages: { id: string; name: string }[]
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const trigger = TRIGGERS.find(t => t.id === automation.trigger_type)!

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10,
      overflow: 'hidden', transition: 'border-color .15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bs)')}>

      {/* Header do card */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0, fontSize: 18,
          background: automation.active ? 'var(--ng)' : 'var(--el)',
          border: `1px solid ${automation.active ? 'var(--nb)' : 'var(--b)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {trigger.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {automation.name}
            </p>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, flexShrink: 0,
              background: automation.active ? 'rgba(37,211,102,.1)' : 'var(--el)',
              color: automation.active ? '#25d366' : 'var(--t3)',
              border: `1px solid ${automation.active ? 'rgba(37,211,102,.25)' : 'var(--b)'}`,
              textTransform: 'uppercase', letterSpacing: '.05em',
            }}>
              {automation.active ? 'ATIVO' : 'PAUSADO'}
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--t3)' }}>
            {trigger.label} · {automation.actions.length} {automation.actions.length === 1 ? 'ação' : 'ações'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button onClick={() => setExpanded(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 6, borderRadius: 6 }}
            title="Ver fluxo"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
            <Bot size={13} />
          </button>
          <button onClick={onToggle}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: automation.active ? '#25d366' : 'var(--t3)', display: 'flex', padding: 6, borderRadius: 6 }}
            title={automation.active ? 'Pausar' : 'Ativar'}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
            {automation.active ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button onClick={onEdit}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 6, borderRadius: 6 }}
            title="Editar"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)'; e.currentTarget.style.color = 'var(--t)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)' }}>
            <Edit2 size={12} />
          </button>
          <button onClick={onDelete}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 6, borderRadius: 6 }}
            title="Excluir"
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244,63,94,.08)'; e.currentTarget.style.color = 'var(--red)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Fluxo expandido — estilo n8n horizontal */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--bs)', padding: '14px 16px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 'max-content' }}>
            {/* Trigger */}
            <div style={{
              background: `${trigger.color}12`, border: `1px solid ${trigger.color}40`,
              borderLeft: `3px solid ${trigger.color}`,
              borderRadius: 8, padding: '7px 12px', minWidth: 110,
            }}>
              <p style={{ fontSize: 9, color: trigger.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>GATILHO</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--t)', marginTop: 1 }}>{trigger.label}</p>
            </div>

            {/* Ações */}
            {automation.actions.map((a, i) => {
              const meta = ACTION_TYPES.find(at => at.id === a.type)!
              return (
                <React.Fragment key={i}>
                  {/* Conector */}
                  <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 12, height: 1, background: 'var(--bs)' }} />
                    <ChevronRight size={10} style={{ color: 'var(--t3)' }} />
                    <div style={{ width: 8, height: 1, background: 'var(--bs)' }} />
                  </div>
                  {/* Nó */}
                  <div style={{
                    background: meta.bg, border: `1px solid ${meta.color}40`,
                    borderLeft: `3px solid ${meta.color}`,
                    borderRadius: 8, padding: '7px 12px', minWidth: 110, flexShrink: 0,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <span style={{ color: meta.color, display: 'flex' }}>{meta.icon}</span>
                      <span style={{ fontSize: 8, color: meta.color, fontWeight: 700, fontFamily: 'var(--fm)', background: `${meta.color}20`, padding: '1px 4px', borderRadius: 3 }}>
                        DIA {a.delay_days ?? 0}
                      </span>
                    </div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: meta.color }}>{meta.label}</p>
                    {a.type === 'send_whatsapp' && (
                      <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                        {(a.config.message as string)?.slice(0, 30) ?? ''}…
                      </p>
                    )}
                    {a.type === 'change_temperature' && (
                      <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1 }}>
                        → {TEMP_OPTS.find(t => t.id === a.config.temperature)?.label ?? (a.config.temperature as string)}
                      </p>
                    )}
                    {a.type === 'change_stage' && (
                      <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        → {stages.find(s => s.id === a.config.stage_id)?.name ?? '—'}
                      </p>
                    )}
                    {a.type === 'create_task' && (
                      <p style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(a.config.title as string)?.slice(0, 25) ?? ''}
                      </p>
                    )}
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal de templates ───────────────────────────────────────────────────────

function TemplatesModal({ onClose, onImport }: {
  onClose: () => void
  onImport: (tpl: AutomationTemplate) => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surf)', border: '1px solid var(--bs)', borderRadius: 14,
        width: '100%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 48px rgba(0,0,0,.5)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--bs)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', margin: 0 }}>Templates de Automação</h2>
            <p style={{ fontSize: 11, color: 'var(--t3)', margin: '3px 0 0' }}>Importe um template pronto e personalize depois</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {AUTOMATION_TEMPLATES.map(tpl => (
            <div key={tpl.id} style={{
              background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10,
              padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14,
              cursor: 'pointer', transition: 'border-color .15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = tpl.color + '60')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bs)')}
              onClick={() => onImport(tpl)}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0, fontSize: 20,
                background: tpl.color + '18', border: `1px solid ${tpl.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {tpl.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', margin: 0 }}>{tpl.name}</p>
                  <span style={{ fontSize: 8, fontWeight: 700, color: tpl.color, background: tpl.color + '18', padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '.07em' }}>
                    {tpl.actions.length} ações
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--t3)', margin: '0 0 8px' }}>{tpl.description}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {tpl.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 9, color: 'var(--t3)', background: 'var(--el)', border: '1px solid var(--b)', padding: '2px 7px', borderRadius: 10 }}>
                      {tag}
                    </span>
                  ))}
                  <span style={{ fontSize: 9, color: 'var(--t3)' }}>
                    · Gatilho: {tpl.trigger_type === 'new_lead' ? 'Novo Lead' : tpl.trigger_type === 'no_contact' ? `Sem contato ${(tpl.trigger_config.days as number) ?? 7}d` : 'Mudança de etapa'}
                  </span>
                </div>
              </div>
              <button style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                background: tpl.color + '18', border: `1px solid ${tpl.color}40`, color: tpl.color, cursor: 'pointer',
              }}>
                Importar
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Automations() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()

  const [showEditor, setShowEditor]       = useState(false)
  const [editTarget, setEditTarget]       = useState<Automation | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [activatingPreset, setActivatingPreset] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages-simple', store?.id],
    queryFn: async () => {
      const { data } = await supabase.from('pipeline_stages').select('id, name').eq('store_id', store!.id).order('position')
      return (data ?? []) as { id: string; name: string }[]
    },
    enabled: !!store?.id,
  })

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['automations', store?.id],
    queryFn: async () => {
      const { data } = await supabase.from('automations').select('*').eq('store_id', store!.id).order('created_at')
      return (data ?? []) as Automation[]
    },
    enabled: !!store?.id,
  })

  const hasPreset = automations.some(a => a.name === 'Fluxo 21 Dias — Padrão')

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Automation>) => {
      const { error } = await supabase.from('automations').insert({
        store_id: store!.id, name: data.name, description: data.description,
        trigger_type: data.trigger_type, trigger_config: data.trigger_config ?? {},
        actions: data.actions ?? [], active: true,
      })
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['automations', store?.id] }); setShowEditor(false); toast.success('Automação criada!') },
    onError: () => toast.error('Erro ao criar automação'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Automation> }) => {
      const { error } = await supabase.from('automations').update({
        name: data.name, trigger_type: data.trigger_type,
        trigger_config: data.trigger_config ?? {}, actions: data.actions ?? [],
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['automations', store?.id] }); setShowEditor(false); setEditTarget(null); toast.success('Automação atualizada!') },
    onError: () => toast.error('Erro ao atualizar'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('automations').update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations', store?.id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['automations', store?.id] }); setDeleteConfirm(null); toast.success('Automação excluída') },
  })

  const activatePreset = useCallback(async () => {
    if (!store?.id) return
    setActivatingPreset(true)
    try {
      const { error } = await supabase.from('automations').insert({
        store_id: store.id, name: 'Fluxo 21 Dias — Padrão',
        description: 'Fluxo recomendado de follow-up para novos leads durante 21 dias',
        trigger_type: 'new_lead', trigger_config: {},
        actions: PRESET_21.map(p => p.actionObj), active: true,
      })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['automations', store.id] })
      toast.success('Fluxo 21 Dias ativado!', 'Os novos leads receberão follow-up automático.')
    } catch { toast.error('Erro ao ativar o fluxo') }
    finally { setActivatingPreset(false) }
  }, [store?.id, queryClient])

  const handleSave = (data: Partial<Automation>) => {
    if (editTarget) updateMutation.mutate({ id: editTarget.id, data })
    else createMutation.mutate(data)
  }

  const importTemplate = useCallback((tpl: AutomationTemplate) => {
    setShowTemplates(false)
    createMutation.mutate({
      name: tpl.name,
      description: tpl.description,
      trigger_type: tpl.trigger_type,
      trigger_config: tpl.trigger_config,
      actions: tpl.actions,
    })
  }, [createMutation])

  const totalActive  = automations.filter(a => a.active).length
  const totalPaused  = automations.filter(a => !a.active).length
  const totalActions = automations.reduce((s, a) => s + a.actions.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Automações & Régua</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Fluxos visuais de follow-up e nutrição de leads</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowTemplates(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'var(--el)', border: '1px solid var(--b)', color: 'var(--t2)',
            }}>
            <Library size={13} /> Templates
          </button>
          <button onClick={() => { setEditTarget(null); setShowEditor(true) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: 'var(--neon)', border: 'none', color: '#000',
            }}>
            <Plus size={13} /> Nova Automação
          </button>
        </div>
      </div>

      {/* Stats */}
      {automations.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: 'Automações Ativas', value: totalActive,  color: '#25d366' },
            { label: 'Pausadas',          value: totalPaused,  color: 'var(--yel)' },
            { label: 'Total de Ações',    value: totalActions, color: 'var(--blu)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 9, padding: '12px 14px' }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--fm)' }}>{s.value}</p>
              <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Preset 21 dias */}
      {!hasPreset && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={14} style={{ color: 'var(--neon)', flexShrink: 0 }} />
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Fluxo Recomendado — 21 Dias</h2>
                <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>Follow-up completo para novos leads. Ative com um clique.</p>
              </div>
            </div>
            <button onClick={activatePreset} disabled={activatingPreset}
              style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'var(--neon)', border: 'none', color: '#000', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, opacity: activatingPreset ? .6 : 1 }}>
              {activatingPreset ? 'Ativando…' : '⚡ Ativar Fluxo'}
            </button>
          </div>

          {/* Preview horizontal do preset */}
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content', gap: 0 }}>
              <div style={{
                background: 'rgba(57,255,20,.08)', border: '1px solid rgba(57,255,20,.25)',
                borderLeft: '3px solid #39FF14', borderRadius: 8, padding: '7px 12px', minWidth: 110,
              }}>
                <p style={{ fontSize: 9, color: '#39FF14', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>GATILHO</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--t)' }}>Novo Lead</p>
              </div>
              {PRESET_21.map((item, i) => {
                const color = item.type === 'whatsapp' ? '#25d366' : item.type === 'task' ? '#8b5cf6' : '#3b82f6'
                const bg    = item.type === 'whatsapp' ? 'rgba(37,211,102,.1)' : item.type === 'task' ? 'rgba(139,92,246,.1)' : 'rgba(59,130,246,.1)'
                const icon  = item.type === 'whatsapp' ? '💬' : item.type === 'task' ? '✅' : '⚙️'
                return (
                  <React.Fragment key={i}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: 12, height: 1, background: 'var(--bs)' }} />
                      <ChevronRight size={9} style={{ color: 'var(--t3)' }} />
                      <div style={{ width: 8, height: 1, background: 'var(--bs)' }} />
                    </div>
                    <div style={{
                      background: bg, border: `1px solid ${color}40`,
                      borderLeft: `3px solid ${color}`,
                      borderRadius: 8, padding: '7px 12px', minWidth: 110, flexShrink: 0,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                        <span style={{ fontSize: 10 }}>{icon}</span>
                        <span style={{ fontSize: 8, color, fontWeight: 700, fontFamily: 'var(--fm)', background: `${color}20`, padding: '1px 4px', borderRadius: 3 }}>DIA {item.day}</span>
                      </div>
                      <p style={{ fontSize: 9, fontWeight: 600, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>
                        {item.label}
                      </p>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {[
              { color: '#25d366', label: '5 WhatsApp' },
              { color: '#8b5cf6', label: '1 Tarefa' },
              { color: '#3b82f6', label: '2 Sistema' },
            ].map(b => (
              <span key={b.label} style={{ fontSize: 10, color: b.color, background: `${b.color}12`, border: `1px solid ${b.color}30`, padding: '2px 8px', borderRadius: 10 }}>
                {b.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lista de automações */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ height: 66, background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, opacity: .4 }} />
          ))}
        </div>
      ) : automations.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Suas Automações ({automations.length})
            </h2>
            <p style={{ fontSize: 10, color: 'var(--t3)' }}>Clique no ícone <Bot size={10} style={{ display: 'inline' }} /> para ver o fluxo</p>
          </div>
          {automations.map(auto => (
            <AutomationCard
              key={auto.id}
              automation={auto}
              stages={stages}
              onEdit={() => { setEditTarget(auto); setShowEditor(true) }}
              onDelete={() => setDeleteConfirm(auto.id)}
              onToggle={() => toggleMutation.mutate({ id: auto.id, active: !auto.active })}
            />
          ))}
        </div>
      ) : !hasPreset ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--t3)' }}>
          <Bot size={36} style={{ margin: '0 auto 10px', opacity: .15 }} />
          <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>Nenhuma automação criada</p>
          <p style={{ fontSize: 11 }}>Ative o Fluxo 21 Dias acima ou crie uma personalizada.</p>
        </div>
      ) : null}

      {/* Info sobre execução */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.15)', borderRadius: 8 }}>
        <AlertCircle size={13} style={{ color: '#8b5cf6', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
          As automações são executadas automaticamente <b style={{ color: 'var(--t2)' }}>a cada hora</b> pelo servidor.
          Cada ação é executada <b style={{ color: 'var(--t2)' }}>uma única vez por lead</b>.
          O campo <b style={{ color: 'var(--t2)' }}>Dia</b> indica quantos dias após o gatilho a ação será disparada.
        </p>
      </div>

      {/* Modal de templates */}
      {showTemplates && (
        <TemplatesModal onClose={() => setShowTemplates(false)} onImport={importTemplate} />
      )}

      {/* Editor visual */}
      {showEditor && (
        <FlowEditor
          initial={editTarget}
          stages={stages}
          onClose={() => { setShowEditor(false); setEditTarget(null) }}
          onSave={handleSave}
        />
      )}

      {/* Confirm delete */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDeleteConfirm(null)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
          <div style={{
            position: 'relative', zIndex: 1,
            background: 'var(--card)', border: '1px solid var(--bs)',
            borderRadius: 10, padding: '20px 24px', width: 320,
            boxShadow: '0 16px 48px rgba(0,0,0,.4)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(244,63,94,.1)', border: '1px solid rgba(244,63,94,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={15} style={{ color: 'var(--red)' }} />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>Excluir automação?</p>
            </div>
            <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.5 }}>Esta ação não pode ser desfeita.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--b)', background: 'var(--el)', color: 'var(--t2)', fontSize: 12, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--red)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: deleteMutation.isPending ? .6 : 1 }}>
                {deleteMutation.isPending ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
