import type { AlertLevel } from '../types/inventory.types'

// ─── Days-in-stock thresholds ─────────────────────────────────────────────────
export const ALERT_THRESHOLDS: Record<AlertLevel, { minDays: number; maxDays: number }> = {
  info:       { minDays: 0,   maxDays: 30  },
  attention:  { minDays: 31,  maxDays: 60  },
  warning:    { minDays: 61,  maxDays: 90  },
  critical:   { minDays: 91,  maxDays: 120 },
  emergency:  { minDays: 121, maxDays: Infinity },
}

// ─── Suggested price adjustment by level ─────────────────────────────────────
export const SUGGESTED_PRICE_ADJUSTMENT: Partial<Record<AlertLevel, number>> = {
  warning:   4,   // reduce ~4%
  critical:  10,  // reduce ~10%
  emergency: 15,  // reduce ~15%
}

// ─── Suggested actions by level ───────────────────────────────────────────────
export const SUGGESTED_ACTIONS: Record<AlertLevel, string> = {
  info:       'Veículo novo em estoque — acompanhar normalmente',
  attention:  'Iniciar ações de marketing digital e boost em redes sociais',
  warning:    'Revisar preço (-3% a -5%) e ativar leads frios no CRM',
  critical:   'Desconto agressivo (-8% a -12%) e disparar WhatsApp para lista VIP',
  emergency:  'Avaliar consignação ou leilão — notificar gerência imediatamente',
}

// ─── Alert colors (CSS variables) ────────────────────────────────────────────
export const ALERT_COLORS: Record<AlertLevel, string> = {
  info:       'var(--neon)',
  attention:  '#0A84FF',
  warning:    'var(--yel)',
  critical:   '#FF9F0A',
  emergency:  'var(--red)',
}

// ─── Alert background colors (for heatmap) ───────────────────────────────────
export const ALERT_BG_COLORS: Record<AlertLevel, string> = {
  info:       'rgba(61,247,16,.12)',
  attention:  'rgba(10,132,255,.12)',
  warning:    'rgba(234,179,8,.12)',
  critical:   'rgba(255,159,10,.12)',
  emergency:  'rgba(244,63,94,.15)',
}

// ─── Alert labels ──────────────────────────────────────────────────────────────
export const ALERT_LABELS: Record<AlertLevel, string> = {
  info:       'Novo',
  attention:  'Atenção',
  warning:    'Alerta',
  critical:   'Crítico',
  emergency:  'Emergência',
}

// ─── WhatsApp trigger threshold ───────────────────────────────────────────────
export const WHATSAPP_TRIGGER_LEVELS: AlertLevel[] = ['critical', 'emergency']

// ─── Health score thresholds ──────────────────────────────────────────────────
export const HEALTH_GRADE_THRESHOLDS = {
  A: 80,
  B: 65,
  C: 45,
  D: 25,
  // < 25 = F
}

export function getAlertLevelForDays(days: number): AlertLevel {
  if (days <= 30)  return 'info'
  if (days <= 60)  return 'attention'
  if (days <= 90)  return 'warning'
  if (days <= 120) return 'critical'
  return 'emergency'
}
