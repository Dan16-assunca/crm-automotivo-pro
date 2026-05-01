// Serviço de consulta à API pública da FIPE (parallelum.com.br)
// Sem necessidade de chave de API. CORS habilitado para uso direto no browser.
//
// Hierarquia: Marca → Modelo → Ano → Preço

const BASE = 'https://parallelum.com.br/fipe/api/v2'

export interface FipeBrand {
  codigo: string
  nome: string
}

export interface FipeModel {
  codigo: number
  nome: string
}

export interface FipeYear {
  codigo: string  // ex: "2023-1"
  nome: string    // ex: "2023 Gasolina"
}

export interface FipePrice {
  valor: string         // ex: "R$ 485.000,00"
  marca: string
  modelo: string
  anoModelo: number
  combustivel: string
  codigoFipe: string
  mesReferencia: string
  siglaCombustivel: string
}

// ─── Normalização para comparação fuzzy ───────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.startsWith(nb) || nb.startsWith(na)) return 0.9
  if (na.includes(nb) || nb.includes(na)) return 0.7
  // Verifica palavras em comum
  const wordsA = na.split(/\s+/)
  const wordsB = nb.split(/\s+/)
  const common = wordsA.filter(w => wordsB.some(wb => wb.startsWith(w) || w.startsWith(wb)))
  if (common.length > 0) return 0.5 + (0.1 * common.length)
  return 0
}

// ─── Busca de Marca ───────────────────────────────────────────────────────────

let _brandsCache: FipeBrand[] | null = null

export async function getFipeBrands(): Promise<FipeBrand[]> {
  if (_brandsCache) return _brandsCache
  try {
    const res = await fetch(`${BASE}/carros/marcas`)
    if (!res.ok) return []
    _brandsCache = await res.json()
    return _brandsCache!
  } catch {
    return []
  }
}

export async function findFipeBrand(brandName: string): Promise<FipeBrand | null> {
  const brands = await getFipeBrands()
  if (!brands.length) return null

  const scored = brands
    .map(b => ({ brand: b, score: similarity(brandName, b.nome) }))
    .filter(x => x.score > 0.4)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.brand ?? null
}

// ─── Busca de Modelo ──────────────────────────────────────────────────────────

export async function findFipeModel(
  brandCode: string,
  modelName: string,
): Promise<FipeModel | null> {
  try {
    const res = await fetch(`${BASE}/carros/marcas/${brandCode}/modelos`)
    if (!res.ok) return null
    const data: { modelos: FipeModel[] } = await res.json()

    const scored = data.modelos
      .map(m => ({ model: m, score: similarity(modelName, m.nome) }))
      .filter(x => x.score > 0.4)
      .sort((a, b) => b.score - a.score)

    return scored[0]?.model ?? null
  } catch {
    return null
  }
}

// ─── Anos disponíveis ─────────────────────────────────────────────────────────

export async function getFipeYears(
  brandCode: string,
  modelCode: number,
): Promise<FipeYear[]> {
  try {
    const res = await fetch(`${BASE}/carros/marcas/${brandCode}/modelos/${modelCode}/anos`)
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

// ─── Preço por ano ────────────────────────────────────────────────────────────

export async function getFipePrice(
  brandCode: string,
  modelCode: number,
  yearCode: string,
): Promise<FipePrice | null> {
  try {
    const res = await fetch(`${BASE}/carros/marcas/${brandCode}/modelos/${modelCode}/anos/${yearCode}`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ─── Valor numérico do preço FIPE ─────────────────────────────────────────────
// "R$ 485.000,00" → 485000

export function parseFipeValue(valor: string): number | null {
  try {
    const digits = valor.replace(/[^\d,]/g, '').replace(',', '.')
    const n = parseFloat(digits)
    return isNaN(n) ? null : Math.round(n)
  } catch {
    return null
  }
}

// ─── Lookup completo ──────────────────────────────────────────────────────────

export interface FipeLookupResult {
  brand: FipeBrand | null
  model: FipeModel | null
  years: FipeYear[]
  brandCode: string | null
  modelCode: number | null
}

export async function lookupFipe(
  brandName: string,
  modelName: string,
): Promise<FipeLookupResult> {
  const brand = await findFipeBrand(brandName)
  if (!brand) {
    return { brand: null, model: null, years: [], brandCode: null, modelCode: null }
  }

  const model = await findFipeModel(brand.codigo, modelName)
  if (!model) {
    return { brand, model: null, years: [], brandCode: brand.codigo, modelCode: null }
  }

  const years = await getFipeYears(brand.codigo, model.codigo)
  return {
    brand,
    model,
    years,
    brandCode: brand.codigo,
    modelCode: model.codigo,
  }
}
