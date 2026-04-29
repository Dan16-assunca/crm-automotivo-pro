// ─── Widget System — CRM Automotivo Pro ──────────────────────────────────────
// Defines all available KPI widget types, their catalog metadata,
// and the function that resolves a widget's live value from dashboard data.

import { formatCurrency } from '@/utils/format'

// ── Types ─────────────────────────────────────────────────────────────────────

export type WidgetType =
  | 'conversion_rate'
  | 'revenue'
  | 'avg_ticket'
  | 'total_leads'
  | 'won_count'
  | 'lost_count'
  | 'active_leads'
  | 'cpl'
  | 'hot_leads'
  | 'warm_leads'
  | 'cold_leads'
  | 'overdue_followups'
  | 'todays_followups'
  | 'alerts_count'
  | 'custom'

export interface DashWidget {
  id: string          // unique instance id
  type: WidgetType
  label?: string      // override display label
  // custom type fields:
  customValue?: string
  customUnit?: string
  customColor?: string
  customSub?: string
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  type: WidgetType
  label: string
  desc: string
  emoji: string
  category: 'vendas' | 'leads' | 'operacional' | 'personalizado'
}

export const WIDGET_CATALOG: CatalogEntry[] = [
  // Vendas
  { type: 'conversion_rate', label: 'Taxa de Conversão', desc: 'Leads ganhos ÷ total de leads', emoji: '📈', category: 'vendas' },
  { type: 'revenue',         label: 'Faturamento',       desc: 'Receita total de vendas ganhas', emoji: '💰', category: 'vendas' },
  { type: 'avg_ticket',      label: 'Ticket Médio',      desc: 'Valor médio por venda fechada', emoji: '🎫', category: 'vendas' },
  { type: 'won_count',       label: 'Fechamentos',       desc: 'Leads ganhos no período', emoji: '✅', category: 'vendas' },
  { type: 'cpl',             label: 'CPL',               desc: 'Custo estimado por lead gerado', emoji: '🧮', category: 'vendas' },
  // Leads
  { type: 'total_leads',     label: 'Total de Leads',    desc: 'Todos os leads no período', emoji: '👥', category: 'leads' },
  { type: 'active_leads',    label: 'Leads Ativos',      desc: 'Leads em andamento agora', emoji: '🔄', category: 'leads' },
  { type: 'lost_count',      label: 'Leads Perdidos',    desc: 'Leads marcados como perdidos', emoji: '❌', category: 'leads' },
  { type: 'hot_leads',       label: 'Leads Quentes',     desc: 'Temperatura = quente (compra iminente)', emoji: '🔥', category: 'leads' },
  { type: 'warm_leads',      label: 'Leads Mornos',      desc: 'Temperatura = morno (interesse moderado)', emoji: '🌡️', category: 'leads' },
  { type: 'cold_leads',      label: 'Leads Frios',       desc: 'Temperatura = frio (interesse baixo)', emoji: '🧊', category: 'leads' },
  // Operacional
  { type: 'overdue_followups', label: 'Follow-ups Atrasados', desc: 'Follow-ups com data vencida', emoji: '⏰', category: 'operacional' },
  { type: 'todays_followups',  label: 'Follow-ups Hoje',      desc: 'Follow-ups agendados para hoje', emoji: '📅', category: 'operacional' },
  { type: 'alerts_count',      label: 'Alertas IA',           desc: 'Alertas de leads ativos gerados pela IA', emoji: '🔔', category: 'operacional' },
  // Custom
  { type: 'custom', label: 'Métrica Personalizada', desc: 'Defina seu próprio indicador manualmente', emoji: '⚙️', category: 'personalizado' },
]

export const CATEGORY_LABELS: Record<string, string> = {
  vendas: 'Vendas & Receita',
  leads: 'Leads & Pipeline',
  operacional: 'Operacional',
  personalizado: 'Personalizado',
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_WIDGETS: DashWidget[] = [
  { id: 'w1', type: 'conversion_rate' },
  { id: 'w2', type: 'revenue' },
  { id: 'w3', type: 'avg_ticket' },
  { id: 'w4', type: 'total_leads' },
  { id: 'w5', type: 'won_count' },
  { id: 'w6', type: 'active_leads' },
]

// ── Data contract for resolver ─────────────────────────────────────────────────

export interface WidgetData {
  totalLeads:  number
  wonCount:    number
  lostCount:   number
  activeCount: number
  hotCount:    number
  warmCount:   number
  coldCount:   number
  revenue:     number
  convRate:    number
  avgTicket:   number
  overdueFollowups: number
  todaysFollowups:  number
  alertsCount: number
}

export interface ResolvedWidget {
  value: string
  sub:   string
  color: string
}

// ── Resolver ──────────────────────────────────────────────────────────────────

export function resolveWidget(widget: DashWidget, data: WidgetData): ResolvedWidget {
  switch (widget.type) {
    case 'conversion_rate':
      return { value: `${data.convRate.toFixed(1)}%`, sub: 'neste período', color: 'var(--neon)' }
    case 'revenue':
      return { value: formatCurrency(data.revenue), sub: 'receita total', color: 'var(--t)' }
    case 'avg_ticket':
      return { value: data.avgTicket > 0 ? formatCurrency(data.avgTicket) : '—', sub: 'por venda', color: 'var(--t)' }
    case 'total_leads':
      return { value: String(data.totalLeads), sub: 'neste período', color: 'var(--t)' }
    case 'won_count':
      return { value: String(data.wonCount), sub: 'fechamentos', color: 'var(--neon)' }
    case 'lost_count':
      return { value: String(data.lostCount), sub: 'perdidos', color: 'var(--t2)' }
    case 'active_leads':
      return { value: String(data.activeCount), sub: 'em andamento', color: 'var(--neon)' }
    case 'cpl':
      return {
        value: data.totalLeads > 0 ? formatCurrency((data.revenue * 0.03) / data.totalLeads) : '—',
        sub: 'custo por lead', color: 'var(--t)',
      }
    case 'hot_leads':
      return { value: String(data.hotCount), sub: 'leads quentes', color: 'var(--neon)' }
    case 'warm_leads':
      return { value: String(data.warmCount), sub: 'leads mornos', color: 'var(--t)' }
    case 'cold_leads':
      return { value: String(data.coldCount), sub: 'leads frios', color: 'var(--t2)' }
    case 'overdue_followups':
      return { value: String(data.overdueFollowups), sub: 'atrasados', color: data.overdueFollowups > 0 ? 'var(--neon)' : 'var(--t)' }
    case 'todays_followups':
      return { value: String(data.todaysFollowups), sub: 'agendados hoje', color: 'var(--neon)' }
    case 'alerts_count':
      return { value: String(data.alertsCount), sub: 'alertas ativos', color: data.alertsCount > 0 ? 'var(--neon)' : 'var(--t)' }
    case 'custom':
      return {
        value: widget.customValue ?? '—',
        sub: widget.customSub ?? 'métrica personalizada',
        color: widget.customColor ?? 'var(--neon)',
      }
    default:
      return { value: '—', sub: '', color: 'var(--t)' }
  }
}

// ── Widget label ──────────────────────────────────────────────────────────────

export function getWidgetLabel(widget: DashWidget): string {
  if (widget.label) return widget.label
  return WIDGET_CATALOG.find(c => c.type === widget.type)?.label ?? 'Métrica'
}

// ── localStorage persistence ───────────────────────────────────────────────────

export function loadWidgets(storeId: string): DashWidget[] {
  try {
    const raw = localStorage.getItem(`dash-widgets-${storeId}`)
    if (raw) {
      const parsed = JSON.parse(raw) as DashWidget[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return DEFAULT_WIDGETS
}

export function saveWidgets(storeId: string, widgets: DashWidget[]): void {
  try {
    localStorage.setItem(`dash-widgets-${storeId}`, JSON.stringify(widgets))
  } catch {}
}
