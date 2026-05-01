// Hook que orquestra o escaneamento de veículos por IA:
// 1. Chama a Edge Function vehicle-ai-scan com a URL da foto
// 2. Busca dados FIPE (marca, modelo, anos, preço) automaticamente
// 3. Expõe estado de progresso para a UI

import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { lookupFipe, getFipePrice, parseFipeValue } from '@/services/fipe'
import type { FipeYear } from '@/services/fipe'

export interface AIScanResult {
  brand: string | null
  model: string | null
  version: string | null
  color: string | null
  year_min: number | null
  year_max: number | null
  fuel: string | null
  transmission: string | null
  condition: string | null
  body_type: string | null
  confidence: number
  plate: string | null
  notes: string | null
}

export interface FipeMatch {
  brandCode: string
  modelCode: number
  years: FipeYear[]  // anos disponíveis no FIPE
}

export type ScanStatus =
  | 'idle'
  | 'scanning'   // chamando Claude Vision
  | 'fipe'       // buscando dados na tabela FIPE
  | 'done'
  | 'error'

export interface UseVehicleAIScanReturn {
  scan: (photoUrl: string) => Promise<void>
  reset: () => void
  status: ScanStatus
  scanResult: AIScanResult | null
  fipeMatch: FipeMatch | null
  error: string | null
  /** Chama FIPE para um ano específico e retorna o preço em número */
  fetchFipePrice: (yearCode: string) => Promise<number | null>
}

export function useVehicleAIScan(): UseVehicleAIScanReturn {
  const [status, setStatus]         = useState<ScanStatus>('idle')
  const [scanResult, setScanResult] = useState<AIScanResult | null>(null)
  const [fipeMatch, setFipeMatch]   = useState<FipeMatch | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const scan = useCallback(async (photoUrl: string) => {
    setStatus('scanning')
    setError(null)
    setScanResult(null)
    setFipeMatch(null)

    try {
      // ── 1. Claude Vision ───────────────────────────────────────────────────
      const { data, error: fnError } = await supabase.functions.invoke('vehicle-ai-scan', {
        body: { photo_url: photoUrl },
      })

      if (fnError) throw new Error(fnError.message)
      if (!data?.ok) throw new Error(data?.error ?? 'Falha na análise')

      const result: AIScanResult = data.data
      setScanResult(result)

      // ── 2. FIPE lookup (só se confiança ≥ 55% e temos marca + modelo) ──────
      if (result.brand && result.model && (result.confidence ?? 0) >= 0.55) {
        setStatus('fipe')
        const fipe = await lookupFipe(result.brand, result.model)
        if (fipe.brandCode && fipe.modelCode && fipe.years.length > 0) {
          setFipeMatch({
            brandCode: fipe.brandCode,
            modelCode: fipe.modelCode,
            years: fipe.years,
          })
        }
      }

      setStatus('done')
    } catch (e) {
      const msg = (e as Error).message ?? 'Erro desconhecido'
      console.error('[useVehicleAIScan]', msg)
      setError(msg)
      setStatus('error')
    }
  }, [])

  const fetchFipePrice = useCallback(async (yearCode: string): Promise<number | null> => {
    if (!fipeMatch) return null
    try {
      const price = await getFipePrice(fipeMatch.brandCode, fipeMatch.modelCode, yearCode)
      return price ? parseFipeValue(price.valor) : null
    } catch {
      return null
    }
  }, [fipeMatch])

  const reset = useCallback(() => {
    setStatus('idle')
    setScanResult(null)
    setFipeMatch(null)
    setError(null)
  }, [])

  return { scan, reset, status, scanResult, fipeMatch, error, fetchFipePrice }
}
