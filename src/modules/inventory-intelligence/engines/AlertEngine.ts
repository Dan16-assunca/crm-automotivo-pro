import type { Vehicle } from '@/types'
import type { StockAlert } from '../types/inventory.types'
import type { DepreciationResult } from '../types/inventory.types'
import {
  getAlertLevelForDays,
  SUGGESTED_ACTIONS,
  SUGGESTED_PRICE_ADJUSTMENT,
  ALERT_COLORS,
  ALERT_LABELS,
  WHATSAPP_TRIGGER_LEVELS,
} from '../utils/alertThresholds'

// ─── Single vehicle alert ─────────────────────────────────────────────────────

export function generateAlert(
  vehicle: Vehicle,
  depreciation: DepreciationResult
): StockAlert {
  const daysInStock = vehicle.days_in_stock ?? 0
  const level = getAlertLevelForDays(daysInStock)

  return {
    vehicleId: vehicle.id,
    level,
    daysInStock,
    depreciationLoss: depreciation.accumulatedLossR$,
    projectedLoss30d: depreciation.projectedLoss30dR$,
    suggestedAction: SUGGESTED_ACTIONS[level],
    priceAdjustment: SUGGESTED_PRICE_ADJUSTMENT[level],
    whatsappTrigger: WHATSAPP_TRIGGER_LEVELS.includes(level),
    color: ALERT_COLORS[level],
    label: ALERT_LABELS[level],
  }
}

// ─── Batch alert generation ───────────────────────────────────────────────────

export function generateAlertBatch(
  vehicles: Vehicle[],
  depreciationMap: Map<string, DepreciationResult>
): Map<string, StockAlert> {
  const map = new Map<string, StockAlert>()
  for (const v of vehicles) {
    const dep = depreciationMap.get(v.id)
    if (!dep) continue
    map.set(v.id, generateAlert(v, dep))
  }
  return map
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

export function getVehiclesNeedingAction(
  vehicles: Vehicle[],
  alertMap: Map<string, StockAlert>
): Vehicle[] {
  return vehicles
    .filter(v => {
      const level = alertMap.get(v.id)?.level
      return level === 'warning' || level === 'critical' || level === 'emergency'
    })
    .sort((a, b) => {
      const order = { emergency: 0, critical: 1, warning: 2, attention: 3, info: 4 }
      const levelA = alertMap.get(a.id)?.level ?? 'info'
      const levelB = alertMap.get(b.id)?.level ?? 'info'
      return order[levelA] - order[levelB]
    })
}
