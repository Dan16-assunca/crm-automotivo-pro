// ─── Vehicle category ──────────────────────────────────────────────────────────
export type VehicleCategory =
  | 'popular'
  | 'suv_medium'
  | 'pickup'
  | 'luxury'
  | 'electric_hybrid'

// ─── Alert levels ──────────────────────────────────────────────────────────────
export type AlertLevel = 'info' | 'attention' | 'warning' | 'critical' | 'emergency'

// ─── Depreciation result ───────────────────────────────────────────────────────
export interface DepreciationResult {
  vehicleId: string
  category: VehicleCategory
  /** Base price used for calculation (purchase_price or sale_price) */
  basePrice: number
  /** Estimated current market value after depreciation */
  estimatedCurrentValue: number
  /** R$ lost so far since stock entry */
  accumulatedLossR$: number
  /** R$ lost per month (current month rate) */
  monthlyLossR$: number
  /** R$ projected to lose in the next 30 days */
  projectedLoss30dR$: number
  /** % difference between listed sale_price and estimatedCurrentValue.
   *  Positive = overpriced vs market, negative = underpriced */
  marginRisk: number
  /** Effective monthly depreciation rate after all multipliers */
  effectiveMonthlyRate: number
}

// ─── Stock alert ───────────────────────────────────────────────────────────────
export interface StockAlert {
  vehicleId: string
  level: AlertLevel
  daysInStock: number
  depreciationLoss: number
  projectedLoss30d: number
  suggestedAction: string
  priceAdjustment?: number   // % discount suggested (positive = reduce price)
  whatsappTrigger: boolean
  color: string              // CSS color for UI
  label: string              // human-readable level label
}

// ─── Health score ──────────────────────────────────────────────────────────────
export interface HealthScoreResult {
  vehicleId: string
  total: number              // 0–100
  components: {
    daysScore: number        // 0–40
    priceScore: number       // 0–30
    completenessScore: number // 0–15
    interestScore: number    // 0–15
  }
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

// ─── Combined analysis per vehicle ────────────────────────────────────────────
export interface VehicleAnalysis {
  vehicleId: string
  depreciation: DepreciationResult
  alert: StockAlert
  health: HealthScoreResult
}

// ─── Patio summary ────────────────────────────────────────────────────────────
export interface PatioSummary {
  totalCapital: number
  totalDepreciationAccumulated: number
  projectedLoss30d: number
  avgHealthScore: number
  criticalCount: number
  emergencyCount: number
  vehiclesByLevel: Record<AlertLevel, number>
}
