import type { Node, Edge } from '@xyflow/react'

export type FlowNodeType =
  | 'trigger'
  | 'whatsapp'
  | 'delay'
  | 'condition'
  | 'segment'
  | 'task'
  | 'pipeline'
  | 'referral'
  | 'end'

export interface TriggerData {
  triggerType: string
  segmentFilter: 'ALL' | 'A' | 'B' | 'C'
  sendTime: string
  sendDays: number[]
  inactiveDays?: number
}

export interface WhatsappData {
  message: string
  sendTime: string
  sendDays: number[]
}

export interface DelayData {
  amount: number
  unit: 'hours' | 'days' | 'weeks'
  sendAt: string
  skipWeekends: boolean
}

export interface ConditionData {
  conditionType: 'replied' | 'segment' | 'tag' | 'field'
  field?: string
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt'
  value: string
  labelYes: string
  labelNo: string
}

export interface SegmentData {
  segment: 'A' | 'B' | 'C'
  reason?: string
}

export interface TaskData {
  title: string
  description?: string
  dueDays: number
  assignTo: 'owner' | 'responsible'
}

export interface PipelineData {
  targetStageId: string
  targetStageName: string
}

export interface ReferralData {
  message: string
  rewardDescription?: string
}

export interface EndData {
  reason?: string
}

export type FlowNodeData = Record<string, unknown>

export type FlowNode = Node<FlowNodeData, FlowNodeType>
export type FlowEdge = Edge

export interface AutomationFlow {
  id: string
  store_id: string
  name: string
  description?: string
  trigger_type: string
  is_active: boolean
  nodes: FlowNode[]
  edges: FlowEdge[]
  viewport: { x: number; y: number; zoom: number }
  run_count: number
  last_run_at?: string
  created_at: string
  updated_at: string
}

export const TRIGGER_TYPES = [
  { id: 'lead_created',       label: 'Novo lead criado',        icon: '🆕', color: '#7C3AED' },
  { id: 'deal_won',           label: 'Venda fechada',            icon: '🏆', color: '#059669' },
  { id: 'deal_lost',          label: 'Lead perdido',             icon: '❌', color: '#DC2626' },
  { id: 'lead_inactive',      label: 'Lead inativo (X dias)',    icon: '😴', color: '#D97706' },
  { id: 'birthday',           label: 'Aniversário do cliente',   icon: '🎂', color: '#DB2777' },
  { id: 'vehicle_anniversary',label: 'Aniversário da compra',    icon: '🚗', color: '#2563EB' },
  { id: 'manual',             label: 'Disparo manual',           icon: '▶️', color: '#6B7280' },
]

export const TEMPLATE_VARS = [
  { key: '{{nome}}',              label: 'Nome do lead' },
  { key: '{{veiculo}}',           label: 'Veículo de interesse' },
  { key: '{{loja}}',              label: 'Nome da loja' },
  { key: '{{vendedor}}',          label: 'Nome do vendedor' },
  { key: '{{link_indicacao}}',    label: 'Link de indicação único' },
  { key: '{{dias_sem_resposta}}', label: 'Dias sem resposta' },
] as const

export const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export const NODE_COLORS: Record<string, string> = {
  trigger:   '#7C3AED',
  whatsapp:  '#059669',
  delay:     '#6B7280',
  condition: '#D97706',
  segment:   '#2563EB',
  task:      '#0891B2',
  pipeline:  '#7C3AED',
  referral:  '#DB2777',
  end:       '#DC2626',
}
