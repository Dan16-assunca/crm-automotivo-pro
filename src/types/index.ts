export type UserRole = 'admin' | 'manager' | 'salesperson'
export type LeadStatus = 'active' | 'won' | 'lost' | 'archived'
export type LeadTemperature = 'hot' | 'warm' | 'cold'
export type LeadPriority = 'high' | 'medium' | 'low'
export type PaymentType = 'avista' | 'financiamento' | 'consorcio'
export type ActivityType = 'call' | 'whatsapp' | 'email' | 'visit' | 'note' | 'stage_change' | 'system'
export type VehicleStatus = 'available' | 'reserved' | 'sold' | 'maintenance'
export type VehicleCondition = 'new' | 'used' | 'demo'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface Store {
  id: string
  name: string
  cnpj?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  logo_url?: string
  brand?: string
  plan: 'free' | 'pro' | 'enterprise'
  active: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  store_id: string
  full_name: string
  email: string
  role: UserRole
  phone?: string
  avatar_url?: string
  whatsapp_number?: string
  active: boolean
  meta: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PipelineStage {
  id: string
  store_id: string
  name: string
  color: string
  icon?: string
  position: number
  is_final: boolean
  is_won: boolean
  created_at: string
}

export interface Lead {
  id: string
  store_id: string
  salesperson_id?: string
  stage_id: string
  client_name: string
  client_phone?: string
  client_email?: string
  client_cpf?: string
  client_city?: string
  client_state?: string
  vehicle_interest?: string
  vehicle_year_min?: number
  vehicle_year_max?: number
  budget_min?: number
  budget_max?: number
  payment_type?: PaymentType
  trade_in: boolean
  trade_in_vehicle?: string
  source?: string
  source_campaign?: string
  temperature: LeadTemperature
  priority: LeadPriority
  score: number
  status: LeadStatus
  lost_reason?: string
  won_value?: number
  won_vehicle_id?: string
  last_contact_at?: string
  next_followup_at?: string
  notes?: string
  tags: string[]
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
  // Relations
  salesperson?: User
  stage?: PipelineStage
}

export interface Activity {
  id: string
  lead_id: string
  store_id: string
  user_id: string
  type: ActivityType
  title?: string
  description?: string
  direction?: MessageDirection
  duration_seconds?: number
  whatsapp_message_id?: string
  whatsapp_status?: string
  scheduled_at?: string
  completed_at?: string
  metadata: Record<string, unknown>
  created_at: string
  user?: User
}

export interface Vehicle {
  id: string
  store_id: string
  brand: string
  model: string
  version?: string
  year_fabrication?: number
  year_model?: number
  color?: string
  plate?: string
  chassis?: string
  renavam?: string
  km?: number
  fuel?: string
  transmission?: string
  purchase_price?: number
  sale_price?: number
  promotional_price?: number
  fipe_price?: number
  status: VehicleStatus
  condition: VehicleCondition
  photos: string[]
  video_url?: string
  description?: string
  optionals: string[]
  source?: string
  purchase_date?: string
  days_in_stock?: number
  olx_ad_id?: string
  webmotors_ad_id?: string
  created_at: string
  updated_at: string
}

export interface SalesGoal {
  id: string
  store_id: string
  salesperson_id?: string
  period_type: 'monthly' | 'quarterly' | 'yearly'
  period_month?: number
  period_year: number
  goal_units?: number
  goal_revenue?: number
  achieved_units: number
  achieved_revenue: number
  created_at: string
  updated_at: string
  salesperson?: User
}

export interface WhatsAppMessage {
  id: string
  store_id: string
  lead_id?: string
  instance_name?: string
  remote_jid?: string
  message_id?: string
  direction: MessageDirection
  type: 'text' | 'image' | 'audio' | 'video' | 'document'
  content?: string
  media_url?: string
  status: MessageStatus
  read_at?: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  store_id: string
  type: 'followup_due' | 'new_lead' | 'message_received' | 'goal_achieved'
  title: string
  body: string
  action_url?: string
  read: boolean
  created_at: string
}

export interface Automation {
  id: string
  store_id: string
  name: string
  description?: string
  trigger_type: 'new_lead' | 'stage_change' | 'no_contact' | 'scheduled'
  trigger_config: Record<string, unknown>
  actions: AutomationAction[]
  active: boolean
  created_at: string
}

export interface AutomationAction {
  type: 'send_whatsapp' | 'send_email' | 'create_task' | 'change_stage' | 'change_temperature'
  delay_days?: number
  config: Record<string, unknown>
}

export interface DashboardKPIs {
  leads_today: number
  leads_week: number
  leads_month: number
  conversion_rate: number
  revenue_achieved: number
  revenue_goal: number
  avg_ticket: number
  avg_close_days: number
  hot_leads_pending: number
}
