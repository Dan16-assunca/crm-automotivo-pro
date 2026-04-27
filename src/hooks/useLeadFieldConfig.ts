// Hook that reads the lead field configuration from stores.settings.lead_fields
// and exposes a typed config object used by the create/edit forms.

import { useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CustomFieldType = 'text' | 'number' | 'date' | 'select'

export interface CustomField {
  id: string
  label: string
  type: CustomFieldType
  placeholder?: string
  options?: string[]   // only for 'select' type (comma-separated values)
  required?: boolean
}

export interface LeadFieldConfig {
  /** Label for the main "interest" field (default: "Interesse no produto") */
  interest_label: string
  show_vehicle:       boolean
  show_budget:        boolean
  show_payment_type:  boolean
  show_trade_in:      boolean
  show_city:          boolean
  show_cpf:           boolean
  custom_fields: CustomField[]
}

export const DEFAULT_LEAD_FIELD_CONFIG: LeadFieldConfig = {
  interest_label:    'Interesse no produto',
  show_vehicle:      true,
  show_budget:       true,
  show_payment_type: true,
  show_trade_in:     true,
  show_city:         false,
  show_cpf:          false,
  custom_fields:     [],
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLeadFieldConfig(): LeadFieldConfig {
  const { store } = useAuthStore()
  return useMemo(() => {
    const raw = (store?.settings as Record<string, unknown> | undefined)?.lead_fields
    if (!raw || typeof raw !== 'object') return DEFAULT_LEAD_FIELD_CONFIG
    return { ...DEFAULT_LEAD_FIELD_CONFIG, ...(raw as Partial<LeadFieldConfig>) }
  }, [store])
}
