import React, { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Bot, Zap, Play, Pause, Trash2, Edit2, X,
  MessageSquare, Thermometer, GitBranch, CheckSquare,
  Archive, ChevronDown, ChevronUp, AlertCircle, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/components/ui/Toast'
import type { Automation, AutomationAction } from '@/types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const TRIGGERS = [
  { id: 'new_lead',      label: 'Novo Lead',           desc: 'Dispara quando um lead é criado',            icon: '🆕' },
  { id: 'no_contact',   label: 'Sem Contato',          desc: 'Dispara após X dias sem resposta do lead',   icon: '🔕' },
  { id: 'stage_change', label: 'Mudança de Etapa',     desc: 'Dispara quando o lead entra em uma etapa',   icon: '🔀' },
]

const ACTION_TYPES: { id: AutomationAction['type']; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'send_whatsapp',      label: 'Enviar WhatsApp',    icon: <MessageSquare size={14} />, color: '#25d366' },
  { id: 'change_temperature', label: 'Mudar Temperatura',  icon: <Thermometer size={14} />,  color: '#f97316' },
  { id: 'change_stage',       label: 'Mover de Etapa',     icon: <GitBranch size={14} />,    color: '#3b82f6' },
  { id: 'create_task',        label: 'Criar Tarefa',        icon: <CheckSquare size={14} />,  color: '#8b5cf6' },
  { id: 'archive_lead',       label: 'Arquivar Lead',       icon: <Archive size={14} />,      color: '#6b7280' },
]

const TEMP_OPTS = [
  { id: 'hot',  label: '🔥 Quente' },
  { id: 'warm', label: '⚡ Morno' },
  { id: 'cold', label: '❄️ Frio' },
]

const VARS = ['{{nome}}', '{{telefone}}', '{{veiculo}}', '{{vendedor}}', '{{loja}}']

const PRESET_21: { day: number; action: string; type: 'whatsapp' | 'system' | 'task'; actionObj: AutomationAction }[] = [
  { day: 1,  action: 'WhatsApp de boas-vindas',              type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 0,  config: { message: 'Olá {{nome}}! Bem-vindo(a) à {{loja}}. Temos ótimas opções para você! Como posso ajudar?' } } },
  { day: 2,  action: 'Follow-up com portfólio',              type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 1,  config: { message: 'Oi {{nome}}, tudo bem? Separei algumas opções que combinam com o que você busca. Posso enviar?' } } },
  { day: 3,  action: 'Oferta específica',                    type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 2,  config: { message: '{{nome}}, temos uma oferta especial hoje! Condições exclusivas de financiamento. Vamos conversar?' } } },
  { day: 5,  action: 'Lembrete sem resposta',                type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 4,  config: { message: 'Oi {{nome}}! Estou à disposição se tiver alguma dúvida. Nossa equipe está pronta para te ajudar 😊' } } },
  { day: 7,  action: 'Reduzir temperatura: Quente → Morno',  type: 'system',   actionObj: { type: 'change_temperature', delay_days: 6,  config: { temperature: 'warm' } } },
  { day: 10, action: 'Template de reengajamento',            type: 'whatsapp', actionObj: { type: 'send_whatsapp',      delay_days: 9,  config: { message: '{{nome}}, ainda está procurando um veículo? Posso te ajudar a encontrar a melhor opção dentro do seu orçamento.' } } },
  { day: 14, action: 'Criar tarefa interna para vendedor',   type: 'task',     actionObj: { type: 'create_task',        delay_days: 13, config: { title: 'Ligar para {{nome}} — lead frio há 14 dias' } } },
  { day: 21, action: 'Arquivar lead automaticamente',        type: 'system',   actionObj: { type: 'archive_lead',       delay_days: 20, config: {} } },
]

// ─── Estilos base ─────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', height: 34, padding: '0 10px',
  background: 'var(--el)', border: '1px solid var(--b)',
  borderRadius: 6, color: 'var(--t)', fontSize: 12,
  outline: 'none', fontFamily: 'var(--fn)',
}
const sel: React.CSSProperties = { ...inp, cursor: 'pointer' }
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--t3)',
  textTransform: 'uppercase', letterSpacing: '.06em',
  display: 'block', marginBottom: 4,
}

// ─── ActionRow ────────────────────────────────────────────────────────────────

function ActionRow({
  action, index, stages, onChange, onRemove,
}: {
  action: AutomationAction
  index: number
  stages: { id: string; name: string }[]
  onChange: (updated: AutomationAction) => void
  onRemove: () => void
}) {
  const meta = ACTION_TYPES.find(a => a.id === action.type)

  const insertVar = (v: string) => {
    const msg = ((action.config.message as string) ?? '') + v
    onChange({ ...action, config: { ...action.config, message: msg } })
  }

  return (
    <div style={{
      background: 'var(--el)', border: '1px solid var(--b)',
      borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Step number */}
        <span style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          background: 'var(--ng)', border: '1px solid var(--nb)',
          fontSize: 10, fontWeight: 700, color: 'var(--neon)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{index + 1}</span>

        {/* Delay */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap' }}>Dia</span>
          <input
            type="number" min={0} max={365}
            value={action.delay_days ?? 0}
            onChange={e => onChange({ ...action, delay_days: Math.max(0, parseInt(e.target.value) || 0) })}
            style={{ ...inp, width: 52, textAlign: 'center', height: 28 }}
          />
        </div>

        {/* Action type */}
        <select
          value={action.type}
          onChange={e => onChange({ type: e.target.value as AutomationAction['type'], delay_days: action.delay_days, config: {} })}
          style={{ ...sel, flex: 1, height: 28 }}
        >
          {ACTION_TYPES.map(a => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>

        {/* Color dot */}
        {meta && (
          <span style={{ color: meta.color, display: 'flex', flexShrink: 0 }}>{meta.icon}</span>
        )}

        {/* Remove */}
        <button onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 2, flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}>
          <X size={13} />
        </button>
      </div>

      {/* Config section */}
      {action.type === 'send_whatsapp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <textarea
            placeholder="Digite a mensagem... Use {{nome}}, {{veiculo}}, {{loja}}"
            value={(action.config.message as string) ?? ''}
            onChange={e => onChange({ ...action, config: { ...action.config, message: e.target.value } })}
            rows={3}
            style={{
              width: '100%', padding: '7px 10px', resize: 'vertical',
              background: 'var(--card)', border: '1px solid var(--b)',
              borderRadius: 6, color: 'var(--t)', fontSize: 12,
              outline: 'none', fontFamily: 'var(--fn)', lineHeight: 1.5,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {VARS.map(v => (
              <button key={v} onClick={() => insertVar(v)}
                style={{
                  padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: 'var(--ng)', border: '1px solid var(--nb)',
                  color: 'var(--neon)', cursor: 'pointer',
                }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {action.type === 'change_temperature' && (
        <div style={{ display: 'flex', gap: 6 }}>
          {TEMP_OPTS.map(t => (
            <button key={t.id} onClick={() => onChange({ ...action, config: { temperature: t.id } })}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: action.config.temperature === t.id ? 'var(--ng)' : 'var(--card)',
                border: action.config.temperature === t.id ? '1px solid var(--nb)' : '1px solid var(--b)',
                color: action.config.temperature === t.id ? 'var(--neon)' : 'var(--t3)',
                cursor: 'pointer',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {action.type === 'change_stage' && (
        <select
          value={(action.config.stage_id as string) ?? ''}
          onChange={e => onChange({ ...action, config: { stage_id: e.target.value } })}
          style={{ ...sel, height: 28 }}
        >
          <option value="">Selecione a etapa...</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}

      {action.type === 'create_task' && (
        <input
          type="text"
          placeholder="Título da tarefa (ex: Ligar para {{nome}})"
          value={(action.config.title as string) ?? ''}
          onChange={e => onChange({ ...action, config: { title: e.target.value } })}
          style={{ ...inp, height: 28 }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
        />
      )}

      {action.type === 'archive_lead' && (
        <p style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
          O lead será movido para o arquivo automaticamente.
        </p>
      )}
    </div>
  )
}

// ─── AutomationModal ──────────────────────────────────────────────────────────

function AutomationModal({
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
  const [name, setName]               = useState(initial?.name ?? '')
  const [desc, setDesc]               = useState(initial?.description ?? '')
  const [trigger, setTrigger]         = useState<string>(initial?.trigger_type ?? 'new_lead')
  const [trigCfg, setTrigCfg]         = useState<Record<string, unknown>>(initial?.trigger_config ?? {})
  const [actions, setActions]         = useState<AutomationAction[]>(
    initial?.actions?.length ? initial.actions : [{ type: 'send_whatsapp', delay_days: 0, config: {} }]
  )

  const addAction = () => setActions(prev => [...prev, { type: 'send_whatsapp', delay_days: (prev[prev.length - 1]?.delay_days ?? 0) + 1, config: {} }])

  const updateAction = (i: number, updated: AutomationAction) =>
    setActions(prev => prev.map((a, idx) => idx === i ? updated : a))

  const removeAction = (i: number) =>
    setActions(prev => prev.filter((_, idx) => idx !== i))

  const handleSave = () => {
    if (!name.trim()) { toast.error('Preencha o nome da automação'); return }
    if (!actions.length) { toast.error('Adicione pelo menos uma ação'); return }
    onSave({ name: name.trim(), description: desc.trim() || undefined, trigger_type: trigger as Automation['trigger_type'], trigger_config: trigCfg, actions })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />

      <div style={{
        position: 'relative', zIndex: 1,
        background: 'var(--card)', border: '1px solid var(--bs)',
        borderRadius: 12, width: '100%', maxWidth: 620,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bs)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ng)', border: '1px solid var(--nb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={15} style={{ color: 'var(--neon)' }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>{initial ? 'Editar Automação' : 'Nova Automação'}</p>
              <p style={{ fontSize: 10, color: 'var(--t3)' }}>Configure gatilho e ações</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Nome */}
          <div>
            <label style={lbl}>Nome da automação</label>
            <input type="text" placeholder="Ex: Follow-up Novo Lead" value={name}
              onChange={e => setName(e.target.value)}
              style={inp}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')}
            />
          </div>

          {/* Gatilho */}
          <div>
            <label style={lbl}>Gatilho — quando disparar?</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {TRIGGERS.map(t => (
                <button key={t.id} onClick={() => { setTrigger(t.id); setTrigCfg({}) }}
                  style={{
                    padding: '10px 8px', borderRadius: 8, border: '1px solid',
                    borderColor: trigger === t.id ? 'var(--nb)' : 'var(--b)',
                    background: trigger === t.id ? 'var(--ng)' : 'var(--el)',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{t.icon}</div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: trigger === t.id ? 'var(--neon)' : 'var(--t)', marginBottom: 2 }}>{t.label}</p>
                  <p style={{ fontSize: 9, color: 'var(--t3)', lineHeight: 1.4 }}>{t.desc}</p>
                </button>
              ))}
            </div>

            {/* Trigger config */}
            {trigger === 'no_contact' && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>Após</span>
                <input type="number" min={1} max={365}
                  value={(trigCfg.days as number) ?? 3}
                  onChange={e => setTrigCfg({ days: parseInt(e.target.value) || 3 })}
                  style={{ ...inp, width: 60, textAlign: 'center', height: 30 }}
                />
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>dias sem contato</span>
              </div>
            )}
            {trigger === 'stage_change' && (
              <div style={{ marginTop: 8 }}>
                <select value={(trigCfg.stage_id as string) ?? ''}
                  onChange={e => setTrigCfg({ stage_id: e.target.value })}
                  style={{ ...sel, height: 30 }}>
                  <option value="">Qualquer etapa</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Ações */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Ações — o que fazer?</label>
              <button onClick={addAction}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                  borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: 'var(--ng)', border: '1px solid var(--nb)', color: 'var(--neon)',
                }}>
                <Plus size={11} /> Adicionar ação
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {actions.map((action, i) => (
                <ActionRow
                  key={i}
                  action={action}
                  index={i}
                  stages={stages}
                  onChange={updated => updateAction(i, updated)}
                  onRemove={() => removeAction(i)}
                />
              ))}
              {!actions.length && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
                  Nenhuma ação adicionada. Clique em "+ Adicionar ação".
                </div>
              )}
            </div>
          </div>

          {/* Tip */}
          <div style={{ background: 'rgba(139,92,246,.06)', border: '1px solid rgba(139,92,246,.15)', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <AlertCircle size={13} style={{ color: '#8b5cf6', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
              O campo <b style={{ color: 'var(--t2)' }}>Dia</b> indica quantos dias após o gatilho a ação será executada.
              Use <b style={{ color: 'var(--neon)' }}>{'{{nome}}'}</b>, <b style={{ color: 'var(--neon)' }}>{'{{veiculo}}'}</b> e <b style={{ color: 'var(--neon)' }}>{'{{loja}}'}</b> nas mensagens para personalização automática.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bs)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'var(--el)', border: '1px solid var(--b)', color: 'var(--t2)' }}>
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
  )
}

// ─── AutomationCard ───────────────────────────────────────────────────────────

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
  const trigger = TRIGGERS.find(t => t.id === automation.trigger_type)

  const stageNameFor = (id: string) => stages.find(s => s.id === id)?.name ?? id

  const actionSummary = (a: AutomationAction) => {
    if (a.type === 'send_whatsapp')      return `Enviar WhatsApp (Dia ${a.delay_days})`
    if (a.type === 'change_temperature') return `Temperatura → ${a.config.temperature}`
    if (a.type === 'change_stage')       return `Mover → ${stageNameFor(a.config.stage_id as string)}`
    if (a.type === 'create_task')        return `Criar tarefa: ${(a.config.title as string)?.slice(0, 30)}`
    if (a.type === 'archive_lead')       return `Arquivar lead (Dia ${a.delay_days})`
    return a.type
  }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10,
      overflow: 'hidden', transition: 'border-color .15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--bs)')}>

      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Icon */}
        <div style={{
          width: 38, height: 38, borderRadius: 9, flexShrink: 0,
          background: automation.active ? 'var(--ng)' : 'var(--el)',
          border: `1px solid ${automation.active ? 'var(--nb)' : 'var(--b)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={16} style={{ color: automation.active ? 'var(--neon)' : 'var(--t3)' }} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {automation.name}
            </p>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
              background: automation.active ? 'rgba(37,211,102,.1)' : 'var(--el)',
              color: automation.active ? '#25d366' : 'var(--t3)',
              border: `1px solid ${automation.active ? 'rgba(37,211,102,.25)' : 'var(--b)'}`,
              textTransform: 'uppercase', letterSpacing: '.05em', flexShrink: 0,
            }}>
              {automation.active ? 'Ativo' : 'Pausado'}
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--t3)' }}>
            {trigger?.icon} {trigger?.label} · {automation.actions.length} {automation.actions.length === 1 ? 'ação' : 'ações'}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button onClick={() => setExpanded(v => !v)} title="Ver ações"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 5, borderRadius: 5 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)'; e.currentTarget.style.color = 'var(--t)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button onClick={onToggle} title={automation.active ? 'Pausar' : 'Ativar'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: automation.active ? '#25d366' : 'var(--t3)', display: 'flex', padding: 5, borderRadius: 5 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
            {automation.active ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={onEdit} title="Editar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 5, borderRadius: 5 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--el)'; e.currentTarget.style.color = 'var(--t)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)' }}>
            <Edit2 size={13} />
          </button>
          <button onClick={onDelete} title="Excluir"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', padding: 5, borderRadius: 5 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244,63,94,.08)'; e.currentTarget.style.color = 'var(--red)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t3)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded actions */}
      {expanded && (
        <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--bs)', paddingTop: 10 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 11, top: 0, bottom: 0, width: 1, background: 'var(--b)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {automation.actions.map((a, i) => {
                const meta = ACTION_TYPES.find(at => at.id === a.type)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, zIndex: 1,
                      background: 'var(--el)', border: '1px solid var(--b)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: meta?.color ?? 'var(--t3)',
                    }}>
                      {a.delay_days ?? 0}
                    </div>
                    <div style={{
                      flex: 1, padding: '5px 10px', background: 'var(--el)', borderRadius: 6,
                      border: '1px solid var(--b)', fontSize: 11, color: 'var(--t2)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ color: meta?.color }}>{meta?.icon}</span>
                      {actionSummary(a)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Automations() {
  const { store } = useAuthStore()
  const queryClient = useQueryClient()

  const [showModal, setShowModal]         = useState(false)
  const [editTarget, setEditTarget]       = useState<Automation | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [activatingPreset, setActivatingPreset] = useState(false)

  // ── Etapas do pipeline ───────────────────────────────────────────────────
  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages-simple', store?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('id, name')
        .eq('store_id', store!.id)
        .order('position')
      return (data ?? []) as { id: string; name: string }[]
    },
    enabled: !!store?.id,
  })

  // ── Automações ───────────────────────────────────────────────────────────
  const { data: automations = [], isLoading } = useQuery({
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

  const hasPreset = automations.some(a => a.name === 'Fluxo 21 Dias — Padrão')

  // ── Mutações ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Automation>) => {
      const { error } = await supabase.from('automations').insert({
        store_id: store!.id,
        name: data.name,
        description: data.description,
        trigger_type: data.trigger_type,
        trigger_config: data.trigger_config ?? {},
        actions: data.actions ?? [],
        active: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', store?.id] })
      setShowModal(false)
      toast.success('Automação criada com sucesso!')
    },
    onError: () => toast.error('Erro ao criar automação'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Automation> }) => {
      const { error } = await supabase.from('automations').update({
        name: data.name,
        description: data.description,
        trigger_type: data.trigger_type,
        trigger_config: data.trigger_config ?? {},
        actions: data.actions ?? [],
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', store?.id] })
      setShowModal(false)
      setEditTarget(null)
      toast.success('Automação atualizada!')
    },
    onError: () => toast.error('Erro ao atualizar automação'),
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('automations').update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automations', store?.id] }),
    onError: () => toast.error('Erro ao alterar status'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations', store?.id] })
      setDeleteConfirm(null)
      toast.success('Automação excluída')
    },
    onError: () => toast.error('Erro ao excluir'),
  })

  const activatePreset = useCallback(async () => {
    if (!store?.id) return
    setActivatingPreset(true)
    try {
      const { error } = await supabase.from('automations').insert({
        store_id: store.id,
        name: 'Fluxo 21 Dias — Padrão',
        description: 'Fluxo recomendado de follow-up para novos leads durante 21 dias',
        trigger_type: 'new_lead',
        trigger_config: {},
        actions: PRESET_21.map(p => p.actionObj),
        active: true,
      })
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ['automations', store.id] })
      toast.success('Fluxo 21 Dias ativado!', 'Os leads novos receberão follow-up automático.')
    } catch {
      toast.error('Erro ao ativar o fluxo')
    } finally {
      setActivatingPreset(false)
    }
  }, [store?.id, queryClient])

  const handleSave = (data: Partial<Automation>) => {
    if (editTarget) updateMutation.mutate({ id: editTarget.id, data })
    else createMutation.mutate(data)
  }

  const openEdit = (auto: Automation) => {
    setEditTarget(auto)
    setShowModal(true)
  }

  const openCreate = () => {
    setEditTarget(null)
    setShowModal(true)
  }

  // Stats
  const totalActive    = automations.filter(a => a.active).length
  const totalPaused    = automations.filter(a => !a.active).length
  const totalActions   = automations.reduce((s, a) => s + a.actions.length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Automações</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Fluxos automáticos de follow-up e nutrição de leads</p>
        </div>
        <button onClick={openCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            background: 'var(--neon)', border: 'none', color: '#000',
          }}>
          <Plus size={13} /> Nova Automação
        </button>
      </div>

      {/* Stats */}
      {automations.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            { label: 'Automações Ativas',  value: totalActive,  color: '#25d366' },
            { label: 'Pausadas',           value: totalPaused,  color: 'var(--yel)' },
            { label: 'Total de Ações',     value: totalActions, color: 'var(--blu)' },
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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={15} style={{ color: 'var(--neon)', flexShrink: 0 }} />
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Fluxo Recomendado — 21 Dias</h2>
                <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>Follow-up completo para novos leads. Ative com um clique.</p>
              </div>
            </div>
            <button onClick={activatePreset} disabled={activatingPreset}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'var(--neon)', border: 'none', color: '#000', cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0, opacity: activatingPreset ? .6 : 1,
              }}>
              {activatingPreset ? 'Ativando…' : '⚡ Ativar Fluxo'}
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 14, top: 8, bottom: 8, width: 1, background: 'var(--b)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PRESET_21.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0, zIndex: 1,
                    background: item.type === 'whatsapp' ? 'var(--ng)' : item.type === 'system' ? 'rgba(59,130,246,.12)' : 'rgba(234,179,8,.12)',
                    border: `1px solid ${item.type === 'whatsapp' ? 'var(--nb)' : item.type === 'system' ? 'rgba(59,130,246,.4)' : 'rgba(234,179,8,.4)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700,
                    color: item.type === 'whatsapp' ? 'var(--neon)' : item.type === 'system' ? 'var(--blu)' : 'var(--yel)',
                  }}>
                    {item.day}
                  </div>
                  <div style={{
                    flex: 1, background: 'var(--el)', border: '1px solid var(--b)',
                    borderRadius: 7, padding: '6px 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <p style={{ fontSize: 12, color: 'var(--t)' }}>{item.action}</p>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 10,
                      background: item.type === 'whatsapp' ? 'var(--ng)' : item.type === 'system' ? 'rgba(59,130,246,.1)' : 'rgba(234,179,8,.1)',
                      color: item.type === 'whatsapp' ? 'var(--neon)' : item.type === 'system' ? 'var(--blu)' : 'var(--yel)',
                      border: `1px solid ${item.type === 'whatsapp' ? 'var(--nb)' : item.type === 'system' ? 'rgba(59,130,246,.3)' : 'rgba(234,179,8,.3)'}`,
                      textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0,
                    }}>
                      {item.type === 'whatsapp' ? 'WhatsApp' : item.type === 'system' ? 'Sistema' : 'Tarefa'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Automações existentes */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ height: 70, background: 'var(--card)', border: '1px solid var(--bs)', borderRadius: 10, opacity: .4 }} />
          ))}
        </div>
      ) : automations.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Suas Automações ({automations.length})
          </h2>
          {automations.map(auto => (
            <AutomationCard
              key={auto.id}
              automation={auto}
              stages={stages}
              onEdit={() => openEdit(auto)}
              onDelete={() => setDeleteConfirm(auto.id)}
              onToggle={() => toggleMutation.mutate({ id: auto.id, active: !auto.active })}
            />
          ))}
        </div>
      ) : !hasPreset && (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--t3)' }}>
          <Bot size={36} style={{ margin: '0 auto 10px', opacity: .15 }} />
          <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>Nenhuma automação criada</p>
          <p style={{ fontSize: 11 }}>Ative o Fluxo 21 Dias acima ou crie uma personalizada.</p>
        </div>
      )}

      {/* Modal criar/editar */}
      {showModal && (
        <AutomationModal
          initial={editTarget}
          stages={stages}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
          onSave={handleSave}
        />
      )}

      {/* Confirmação de exclusão */}
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
            <p style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16, lineHeight: 1.5 }}>
              Esta ação não pode ser desfeita. A automação será removida permanentemente.
            </p>
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
