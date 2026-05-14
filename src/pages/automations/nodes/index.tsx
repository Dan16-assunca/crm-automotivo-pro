import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { FlowNodeData, FlowNodeType } from '../flow-types'
import { TRIGGER_TYPES, NODE_COLORS } from '../flow-types'

type Props = NodeProps & { data: FlowNodeData; type: FlowNodeType; selected: boolean }

export function TriggerNode({ data, selected }: Props) {
  const t = TRIGGER_TYPES.find(t => t.id === (data.triggerType as string)) ?? TRIGGER_TYPES[6]
  const sub = data.triggerType === 'lead_inactive'
    ? `Após ${data.inactiveDays ?? 7} dias sem atividade`
    : `Segmento: ${(data.segmentFilter as string) || 'Todos'} · ${(data.sendTime as string) || '09:00'}`
  return (
    <BaseNode selected={selected} accentColor={t.color} icon={t.icon}
      typeLabel="Gatilho" title={t.label} subtitle={sub} hasInput={false} />
  )
}

export function WhatsappNode({ data, selected }: Props) {
  const msg = (data.message as string) || ''
  const preview = msg.length > 50 ? msg.slice(0, 50) + '…' : msg || 'Clique para editar mensagem'
  return (
    <BaseNode selected={selected} accentColor={NODE_COLORS.whatsapp} icon="💬"
      typeLabel="WhatsApp" title="Enviar mensagem" subtitle={preview} />
  )
}

export function DelayNode({ data, selected }: Props) {
  const unit: Record<string, string> = { hours: 'hora(s)', days: 'dia(s)', weeks: 'semana(s)' }
  const label = `Aguardar ${data.amount ?? '?'} ${unit[(data.unit as string)] ?? 'dia(s)'}`
  const sub = data.sendAt ? `Retoma às ${data.sendAt}` : 'Configure o horário'
  return (
    <BaseNode selected={selected} accentColor={NODE_COLORS.delay} icon="⏱️"
      typeLabel="Atraso" title={label} subtitle={sub} />
  )
}

export function ConditionNode({ data, selected }: Props) {
  const labels: Record<string, string> = {
    replied: 'Respondeu a mensagem?',
    segment: `Segmento é ${data.value}?`,
    tag: `Tem tag "${data.value}"?`,
    field: `${data.field} ${data.operator} ${data.value}`,
  }
  return (
    <BaseNode selected={selected} accentColor={NODE_COLORS.condition} icon="🔀"
      typeLabel="Condição" title="Verificar condição"
      subtitle={labels[(data.conditionType as string)] || 'Configure a condição'}
      hasYesNo />
  )
}

export function SegmentNode({ data, selected }: Props) {
  const colors: Record<string, string> = { A: '#22c55e', B: '#eab308', C: '#f87171' }
  const seg = (data.segment as string) || '?'
  return (
    <BaseNode selected={selected} accentColor={colors[seg] ?? NODE_COLORS.segment} icon="🏷️"
      typeLabel="Segmento" title={`Classificar como ${seg}`}
      subtitle={(data.reason as string) || 'Atribuir segmento Girard'} />
  )
}

export function TaskNode({ data, selected }: Props) {
  return (
    <BaseNode selected={selected} accentColor={NODE_COLORS.task} icon="✅"
      typeLabel="Tarefa" title={(data.title as string) || 'Nova tarefa'}
      subtitle={`Vence em ${data.dueDays ?? 1} dia(s)`} />
  )
}

export function PipelineNode({ data, selected }: Props) {
  return (
    <BaseNode selected={selected} accentColor={NODE_COLORS.pipeline} icon="📋"
      typeLabel="Pipeline" title="Mover de etapa"
      subtitle={(data.targetStageName as string) || 'Selecionar etapa'} />
  )
}

export function ReferralNode({ data, selected }: Props) {
  const msg = (data.message as string) || ''
  return (
    <BaseNode selected={selected} accentColor={NODE_COLORS.referral} icon="🤝"
      typeLabel="Indicação" title="Pedir indicação"
      subtitle={msg.slice(0, 50) || 'Configure a mensagem'} />
  )
}

export function EndNode({ data, selected }: Props) {
  return (
    <BaseNode selected={selected} accentColor={NODE_COLORS.end} icon="🏁"
      typeLabel="Fim" title="Fim do fluxo"
      subtitle={(data.reason as string) || 'Fluxo encerrado'}
      hasOutput={false} />
  )
}
