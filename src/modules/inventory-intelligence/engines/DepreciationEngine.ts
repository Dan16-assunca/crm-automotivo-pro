import type { Vehicle } from '@/types'
import type { VehicleCategory, DepreciationResult } from '../types/inventory.types'
import {
  BASE_RATES,
  DEPRECIATION_FACTORS,
  TYPICAL_MONTHLY_KM,
  LUXURY_BRANDS,
  ELECTRIC_BRANDS,
  HYBRID_KEYWORDS,
  PICKUP_KEYWORDS,
  SUV_KEYWORDS,
  PREMIUM_OPTIONALS_KEYWORDS,
  NEUTRAL_COLORS,
} from '../utils/depreciationCurves'

// ─── Category detection ───────────────────────────────────────────────────────

export function detectCategory(vehicle: Vehicle): VehicleCategory {
  const brand = vehicle.brand?.trim() ?? ''
  const model = (vehicle.model ?? '').toLowerCase()
  const version = (vehicle.version ?? '').toLowerCase()
  const combined = `${model} ${version}`

  if (LUXURY_BRANDS.has(brand)) return 'luxury'
  if (ELECTRIC_BRANDS.has(brand)) return 'electric_hybrid'
  if (HYBRID_KEYWORDS.some(k => combined.includes(k))) return 'electric_hybrid'
  if (PICKUP_KEYWORDS.some(k => combined.includes(k))) return 'pickup'
  if (SUV_KEYWORDS.some(k => combined.includes(k))) return 'suv_medium'

  // Fallback: price-based heuristic
  const price = vehicle.sale_price ?? vehicle.purchase_price ?? 0
  if (price >= 180_000) return 'luxury'
  if (price >= 90_000)  return 'suv_medium'
  return 'popular'
}

// ─── Factor detection ─────────────────────────────────────────────────────────

function hasPremiumOptionals(vehicle: Vehicle): boolean {
  const optionals = vehicle.optionals ?? []
  const desc = (vehicle.description ?? '').toLowerCase()
  return optionals.some(o =>
    PREMIUM_OPTIONALS_KEYWORDS.some(k => o.toLowerCase().includes(k))
  ) || PREMIUM_OPTIONALS_KEYWORDS.some(k => desc.includes(k))
}

function hasAtypicalColor(vehicle: Vehicle): boolean {
  if (!vehicle.color) return false
  return !NEUTRAL_COLORS.has(vehicle.color.toLowerCase().trim())
}

function hasHighMileage(vehicle: Vehicle, category: VehicleCategory): boolean {
  const km = vehicle.km
  if (!km || !vehicle.days_in_stock) return false
  const monthsInStock = vehicle.days_in_stock / 30
  if (monthsInStock < 1) return false
  // Compare vehicle's KM accumulation pace vs typical
  // We don't know how long the previous owner drove it, so use total KM / year model
  const currentYear = new Date().getFullYear()
  const vehicleAge = currentYear - (vehicle.year_model ?? currentYear)
  if (vehicleAge <= 0) return false
  const monthlyKm = km / (vehicleAge * 12)
  return monthlyKm > TYPICAL_MONTHLY_KM[category] * 1.3
}

// ─── Core depreciation calculation ───────────────────────────────────────────

/**
 * Calculate compound depreciation over N months.
 * Applies a higher rate for the first 6 months, lower after.
 */
function compoundDepreciation(
  basePrice: number,
  months: number,
  category: VehicleCategory,
  extraMonthlyRate: number
): number {
  const { rateFirst6m, rateAfter6m } = BASE_RATES[category]
  let value = basePrice
  for (let m = 1; m <= Math.ceil(months); m++) {
    const baseRate = m <= 6 ? rateFirst6m : rateAfter6m
    const rate = Math.min(baseRate + extraMonthlyRate, 0.05) // cap at 5%/month
    value *= (1 - rate)
  }
  return Math.max(value, basePrice * 0.3) // floor: vehicle never loses more than 70%
}

// ─── Main engine function ─────────────────────────────────────────────────────

export function calculateDepreciation(vehicle: Vehicle): DepreciationResult {
  const category = detectCategory(vehicle)
  const basePrice = vehicle.purchase_price ?? vehicle.sale_price ?? 0

  const daysInStock = vehicle.days_in_stock ?? 0
  const months = daysInStock / 30

  // Build extra rate from multipliers
  let extraRate = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasAccident = (vehicle as any).has_accident_history === true
  if (hasAccident)                        extraRate += DEPRECIATION_FACTORS.accidentHistory
  if (hasAtypicalColor(vehicle))          extraRate += DEPRECIATION_FACTORS.atypicalColor
  if (hasHighMileage(vehicle, category))  extraRate += DEPRECIATION_FACTORS.highMileage
  if (hasPremiumOptionals(vehicle))       extraRate += DEPRECIATION_FACTORS.premiumOptionals

  const { rateFirst6m, rateAfter6m } = BASE_RATES[category]
  const currentMonthBaseRate = months <= 6 ? rateFirst6m : rateAfter6m
  const effectiveMonthlyRate = Math.min(currentMonthBaseRate + extraRate, 0.05)

  const estimatedCurrentValue = basePrice > 0
    ? compoundDepreciation(basePrice, months, category, extraRate)
    : 0

  const accumulatedLossR$ = Math.max(0, basePrice - estimatedCurrentValue)

  // Monthly loss: what we're losing THIS month
  const monthlyLossR$ = estimatedCurrentValue * effectiveMonthlyRate

  // 30-day projection: 1 more month of depreciation from today
  const valueIn30d = estimatedCurrentValue * (1 - effectiveMonthlyRate)
  const projectedLoss30dR$ = estimatedCurrentValue - valueIn30d

  // Margin risk: how far the listed price is from estimated market value
  const listedPrice = vehicle.sale_price ?? 0
  const marginRisk = listedPrice > 0 && estimatedCurrentValue > 0
    ? ((listedPrice - estimatedCurrentValue) / estimatedCurrentValue) * 100
    : 0

  return {
    vehicleId: vehicle.id,
    category,
    basePrice,
    estimatedCurrentValue,
    accumulatedLossR$,
    monthlyLossR$,
    projectedLoss30dR$,
    marginRisk,
    effectiveMonthlyRate,
  }
}

// ─── Batch calculation ────────────────────────────────────────────────────────

export function calculateDepreciationBatch(
  vehicles: Vehicle[]
): Map<string, DepreciationResult> {
  const map = new Map<string, DepreciationResult>()
  for (const v of vehicles) {
    map.set(v.id, calculateDepreciation(v))
  }
  return map
}
