import type { Vehicle } from '@/types'
import type { HealthScoreResult } from '../types/inventory.types'
import type { DepreciationResult } from '../types/inventory.types'
import { HEALTH_GRADE_THRESHOLDS } from '../utils/alertThresholds'

// ─── Score components ──────────────────────────────────────────────────────────

/** Days in stock component — 40 pts max */
function scoreDays(days: number): number {
  if (days <= 30)  return 40
  if (days <= 60)  return 30
  if (days <= 90)  return 15
  if (days <= 120) return 5
  return 0
}

/** Price alignment component — 30 pts max
 *  Uses marginRisk from depreciation: how overpriced vs estimated market value.
 *  0% overpriced = 30pts. Each 5% overpriced = -5pts. Underpriced = 30pts. */
function scorePriceAlignment(marginRisk: number): number {
  if (marginRisk <= 0)  return 30   // underpriced or aligned — great
  if (marginRisk <= 5)  return 25
  if (marginRisk <= 10) return 18
  if (marginRisk <= 20) return 10
  if (marginRisk <= 35) return 4
  return 0
}

/** Ad completeness component — 15 pts max */
function scoreCompleteness(vehicle: Vehicle): number {
  let pts = 0
  if ((vehicle.photos?.length ?? 0) >= 5) pts += 5
  else if ((vehicle.photos?.length ?? 0) >= 1) pts += 2
  if (vehicle.video_url)   pts += 4
  if (vehicle.description && vehicle.description.length > 50) pts += 3
  if (vehicle.km)          pts += 1
  if (vehicle.color)       pts += 1
  if (vehicle.version)     pts += 1
  return Math.min(pts, 15)
}

/** Interest / demand component — 15 pts max
 *  We don't have views/leads metrics in Vehicle type yet,
 *  so we approximate from fipe_price alignment and condition. */
function scoreInterest(vehicle: Vehicle, depreciationResult: DepreciationResult): number {
  let pts = 7 // base score

  // If fipe_price is set and sale_price is within 10% above fipe: demand is likely good
  if (vehicle.fipe_price && vehicle.sale_price) {
    const fipeDiff = ((vehicle.sale_price - vehicle.fipe_price) / vehicle.fipe_price) * 100
    if (fipeDiff <= 10)  pts += 5
    else if (fipeDiff <= 20) pts += 2
  }

  // New/demo condition attracts more interest
  if (vehicle.condition === 'new' || vehicle.condition === 'demo') pts += 3
  else if (vehicle.condition === 'used' && (vehicle.km ?? 0) < 30000) pts += 2

  // Promotional price set = seller is actively promoting
  if (vehicle.promotional_price && vehicle.promotional_price < (vehicle.sale_price ?? 0)) pts += 2

  // Penalise if overpriced by >15%
  if (depreciationResult.marginRisk > 15) pts -= 4

  return Math.max(0, Math.min(pts, 15))
}

// ─── Grade lookup ──────────────────────────────────────────────────────────────

function getGrade(total: number): HealthScoreResult['grade'] {
  if (total >= HEALTH_GRADE_THRESHOLDS.A) return 'A'
  if (total >= HEALTH_GRADE_THRESHOLDS.B) return 'B'
  if (total >= HEALTH_GRADE_THRESHOLDS.C) return 'C'
  if (total >= HEALTH_GRADE_THRESHOLDS.D) return 'D'
  return 'F'
}

// ─── Main engine function ─────────────────────────────────────────────────────

export function calculateHealthScore(
  vehicle: Vehicle,
  depreciation: DepreciationResult
): HealthScoreResult {
  const daysScore         = scoreDays(vehicle.days_in_stock ?? 0)
  const priceScore        = scorePriceAlignment(depreciation.marginRisk)
  const completenessScore = scoreCompleteness(vehicle)
  const interestScore     = scoreInterest(vehicle, depreciation)
  const total             = daysScore + priceScore + completenessScore + interestScore

  return {
    vehicleId: vehicle.id,
    total,
    components: { daysScore, priceScore, completenessScore, interestScore },
    grade: getGrade(total),
  }
}

// ─── Batch ────────────────────────────────────────────────────────────────────

export function calculateHealthScoreBatch(
  vehicles: Vehicle[],
  depreciationMap: Map<string, DepreciationResult>
): Map<string, HealthScoreResult> {
  const map = new Map<string, HealthScoreResult>()
  for (const v of vehicles) {
    const dep = depreciationMap.get(v.id)
    if (!dep) continue
    map.set(v.id, calculateHealthScore(v, dep))
  }
  return map
}

// ─── Weighted average health for entire patio ────────────────────────────────

export function calculatePatioHealthScore(
  vehicles: Vehicle[],
  healthMap: Map<string, HealthScoreResult>
): number {
  if (!vehicles.length) return 0
  let weightedSum = 0
  let totalWeight = 0
  for (const v of vehicles) {
    const score = healthMap.get(v.id)?.total ?? 0
    const weight = v.sale_price ?? 1
    weightedSum += score * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0
}
