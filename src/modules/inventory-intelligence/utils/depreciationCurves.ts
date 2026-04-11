import type { VehicleCategory } from '../types/inventory.types'

// ─── Base monthly depreciation rates ──────────────────────────────────────────
// rateFirst6m: months 1–6
// rateAfter6m: months 7+
export const BASE_RATES: Record<VehicleCategory, { rateFirst6m: number; rateAfter6m: number }> = {
  popular:          { rateFirst6m: 0.012, rateAfter6m: 0.008 },
  suv_medium:       { rateFirst6m: 0.010, rateAfter6m: 0.007 },
  pickup:           { rateFirst6m: 0.007, rateAfter6m: 0.005 },
  luxury:           { rateFirst6m: 0.015, rateAfter6m: 0.010 },
  electric_hybrid:  { rateFirst6m: 0.013, rateAfter6m: 0.009 },
}

// ─── Multiplier factors (added to monthly rate) ────────────────────────────────
export const DEPRECIATION_FACTORS = {
  /** KM above typical monthly average for the category (+% per month) */
  highMileage:       0.003,
  /** Vehicle has accident history */
  accidentHistory:   0.005,
  /** Atypical color (not silver/white/black/gray) */
  atypicalColor:     0.002,
  /** Desirable optionals protect value (subtracted) */
  premiumOptionals: -0.001,
} as const

// ─── Typical monthly mileage by category (km/month) ───────────────────────────
export const TYPICAL_MONTHLY_KM: Record<VehicleCategory, number> = {
  popular:         1200,
  suv_medium:      1000,
  pickup:          1500,
  luxury:          800,
  electric_hybrid: 900,
}

// ─── Luxury brands (detected by brand name) ───────────────────────────────────
export const LUXURY_BRANDS = new Set([
  'BMW', 'Mercedes-Benz', 'Mercedes', 'Audi', 'Porsche', 'Volvo',
  'Land Rover', 'Jaguar', 'Lexus', 'Alfa Romeo', 'Maserati',
  'Ferrari', 'Lamborghini', 'Bentley', 'Rolls-Royce', 'Infiniti',
])

// ─── Electric/Hybrid brands and model keywords ────────────────────────────────
export const ELECTRIC_BRANDS = new Set(['BYD', 'Tesla', 'Rivian', 'Lucid'])
export const HYBRID_KEYWORDS = ['hybrid', 'híbrido', 'hev', 'phev', 'plug-in', 'e-tron', 'prius']

// ─── Pickup model keywords ────────────────────────────────────────────────────
export const PICKUP_KEYWORDS = [
  'hilux', 'ranger', 's10', 'l200', 'amarok', 'oroch',
  'saveiro', 'colorado', 'frontier', 'triton', 'toro',
]

// ─── SUV model keywords ───────────────────────────────────────────────────────
export const SUV_KEYWORDS = [
  'tracker', 'compass', 'creta', 'hr-v', 'hrv', 't-cross', 'tcross',
  'duster', 'kicks', 'renegade', 'tiguan', 'tucson', 'santa fe',
  'sportage', 'ecosport', 'territory', 'pulse', 'fastback', 'nivus',
  'taos', 'yaris cross', 'corolla cross', 'cx-3', 'cx-5', 'cx-30',
  'escape', 'edge', 'explorer', 'expedition', 'tahoe', 'suburban',
]

// ─── Premium optionals that protect value ─────────────────────────────────────
export const PREMIUM_OPTIONALS_KEYWORDS = [
  'teto solar', 'sunroof', 'couro', 'leather', 'multimídia', 'multimedia',
  'câmera 360', 'piloto automático', 'adaptive cruise', 'head up',
  'bancos aquecidos', 'heated seats', 'ar digital', 'digital climate',
]

// ─── Neutral colors (do NOT add atypical color penalty) ───────────────────────
export const NEUTRAL_COLORS = new Set([
  'branco', 'prata', 'preto', 'cinza', 'grafite',
  'white', 'silver', 'black', 'gray', 'grey',
])
