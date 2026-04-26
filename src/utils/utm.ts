/**
 * utm.ts — Captura e persistência de parâmetros UTM / click IDs
 *
 * Estratégia: first-touch attribution em sessionStorage.
 * - Na primeira visita com UTMs, salva no sessionStorage.
 * - Visitas subsequentes na mesma sessão NÃO sobrescrevem (first-touch).
 * - Ao criar um lead, lê os UTMs salvos e os injeta no formulário.
 * - Após salvar o lead, limpa o sessionStorage.
 */

const SESSION_KEY = 'crm_utm'

export interface UtmData {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  utm_ad_id?: string
  utm_adset_id?: string
  utm_campaign_id?: string
  fbclid?: string
  gclid?: string
  landing_page?: string
  referrer?: string
}

/** Lê os parâmetros UTM + click IDs da URL atual e salva no sessionStorage (first-touch). */
export function captureUtmsFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search)

    // Só captura se houver ao menos um parâmetro relevante na URL
    const hasUtm =
      params.has('utm_source') ||
      params.has('utm_medium') ||
      params.has('utm_campaign') ||
      params.has('fbclid') ||
      params.has('gclid')

    if (!hasUtm) return

    // First-touch: não sobrescreve se já existir dados nesta sessão
    if (sessionStorage.getItem(SESSION_KEY)) return

    const data: UtmData = {
      utm_source:      params.get('utm_source')      ?? undefined,
      utm_medium:      params.get('utm_medium')      ?? undefined,
      utm_campaign:    params.get('utm_campaign')    ?? undefined,
      utm_term:        params.get('utm_term')        ?? undefined,
      utm_content:     params.get('utm_content')     ?? undefined,
      utm_ad_id:       params.get('utm_ad_id')       ?? undefined,
      utm_adset_id:    params.get('utm_adset_id')    ?? undefined,
      utm_campaign_id: params.get('utm_campaign_id') ?? undefined,
      fbclid:          params.get('fbclid')           ?? undefined,
      gclid:           params.get('gclid')            ?? undefined,
      landing_page:    window.location.href,
      referrer:        document.referrer || undefined,
    }

    // Remove campos undefined para não poluir o storage
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    ) as UtmData

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(clean))
  } catch {
    // sessionStorage indisponível (modo privado extremo, etc.) — silencia
  }
}

/** Retorna os UTMs capturados nesta sessão, ou null se não houver nenhum. */
export function getStoredUtms(): UtmData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UtmData
  } catch {
    return null
  }
}

/** Limpa os UTMs do sessionStorage após o lead ser salvo. */
export function clearStoredUtms(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // silencia
  }
}

/**
 * Retorna apenas os campos UTM que devem ser persistidos na tabela leads.
 * Útil para spreads diretos no objeto de criação do lead.
 */
export function getLeadUtmFields(): Partial<UtmData> {
  return getStoredUtms() ?? {}
}
