import { useState, useMemo } from 'react'
import {
  Calculator as CalcIcon, RefreshCw, Copy, Plus, X,
  ChevronDown, ChevronUp, Clock, Info,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { formatCurrency } from '@/utils/format'

// ─── estilos base ─────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', height: 34, padding: '0 11px',
  background: 'var(--el)', border: '1px solid var(--b)',
  borderRadius: 7, color: 'var(--t)', fontSize: 12,
  outline: 'none', fontFamily: 'var(--fn)',
}

const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--t3)',
  textTransform: 'uppercase', letterSpacing: '.06em',
  marginBottom: 4, display: 'block',
}

function focusStyle(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--nb)'
}
function blurStyle(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--b)'
}

// ─── constantes ───────────────────────────────────────────────────────────────

// Taxas de financiamento simuladas por prazo (% ao mês)
const FINANCING_RATES: Record<string, number> = {
  '12': 1.29, '24': 1.39, '36': 1.49, '48': 1.59, '60': 1.69, '72': 1.79,
}

// IPVA por UF (% sobre valor venal)
const IPVA_BY_UF: Record<string, number> = {
  SP: 4.0, RJ: 4.0, MG: 4.0, RS: 3.0, PR: 3.5, SC: 2.0,
  BA: 3.5, GO: 3.75, PE: 3.0, CE: 3.0, DF: 3.5,
  AM: 3.0, PA: 2.5, MT: 3.0, MS: 3.5, ES: 2.0,
  SE: 3.5, PB: 2.0, MA: 2.0, PI: 2.5, AL: 2.5,
  RN: 3.0, TO: 2.0, AP: 2.0, RR: 2.0, AC: 2.0, RO: 2.0,
}

// ─── tipos ───────────────────────────────────────────────────────────────────

interface ScenarioState {
  salePrice: string
  purchasePrice: string
  financingPct: string
  financingMonths: string
  commissionPct: string
  expenses: string
  // Taxas
  withIPVA: boolean
  uf: string
  withDetran: boolean
  detranValue: string
  withGarantia: boolean
  garantiaValue: string
  withRevision: boolean
  revisionValue: string
  // Consórcio/financiamento
  paymentType: 'cash' | 'financing' | 'consortium'
  entrada: string
}

function emptyScenario(): ScenarioState {
  return {
    salePrice: '', purchasePrice: '', financingPct: '2.5', financingMonths: '48',
    commissionPct: '1.5', expenses: '',
    withIPVA: false, uf: 'SP', withDetran: false, detranValue: '750',
    withGarantia: false, garantiaValue: '1500', withRevision: false, revisionValue: '800',
    paymentType: 'cash', entrada: '',
  }
}

// ─── cálculo ──────────────────────────────────────────────────────────────────

interface CalcResult {
  sale: number; purchase: number; grossMargin: number
  financing: number; commission: number; expenses: number
  ipva: number; detran: number; garantia: number; revision: number
  totalDeductions: number; netMargin: number; marginPct: number
  // Para financiamento
  parcelaEstimada: number; totalPago: number; cef: number
}

function calculate(s: ScenarioState): CalcResult {
  const sale     = parseFloat(s.salePrice)   || 0
  const purchase = parseFloat(s.purchasePrice) || 0
  const exp      = parseFloat(s.expenses)    || 0
  const entrada  = parseFloat(s.entrada)     || 0

  const commission = (sale * parseFloat(s.commissionPct || '0')) / 100
  const grossMargin = sale - purchase

  // Financiamento: custo para loja (% da venda) ou custo real da operação
  let financing = 0
  let parcelaEstimada = 0
  let totalPago = 0
  let cef = 0

  if (s.paymentType === 'financing') {
    const taxa = FINANCING_RATES[s.financingMonths] ?? 1.49
    const valorFinanciado = sale - entrada
    const n = parseInt(s.financingMonths) || 48
    // Tabela Price
    if (valorFinanciado > 0) {
      const r = taxa / 100
      parcelaEstimada = valorFinanciado * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
      totalPago = parcelaEstimada * n + entrada
      cef = totalPago - sale  // custo efetivo do financiamento
      financing = cef
    }
    // Custo de mesa (comissão do banco para loja, se houver): simplificado como % do valor
    const platPct = parseFloat(s.financingPct) || 0
    financing += (valorFinanciado * platPct) / 100
  } else if (s.paymentType === 'consortium') {
    financing = (sale * parseFloat(s.financingPct || '0')) / 100
  } else {
    // À vista: apenas custo de plataforma
    financing = (sale * (parseFloat(s.financingPct) > 5 ? 0 : parseFloat(s.financingPct))) / 100
  }

  // Taxas
  const ipva     = s.withIPVA    ? (sale * (IPVA_BY_UF[s.uf] ?? 4.0)) / 100 : 0
  const detran   = s.withDetran  ? parseFloat(s.detranValue)   || 0 : 0
  const garantia = s.withGarantia ? parseFloat(s.garantiaValue) || 0 : 0
  const revision = s.withRevision ? parseFloat(s.revisionValue) || 0 : 0

  const totalDeductions = financing + commission + exp + ipva + detran + garantia + revision
  const netMargin = grossMargin - totalDeductions
  const marginPct = sale > 0 ? (netMargin / sale) * 100 : 0

  return { sale, purchase, grossMargin, financing, commission, expenses: exp, ipva, detran, garantia, revision, totalDeductions, netMargin, marginPct, parcelaEstimada, totalPago, cef }
}

// ─── Painel de entrada ────────────────────────────────────────────────────────

function ScenarioInput({ state, onChange, label }: {
  state: ScenarioState
  onChange: (s: ScenarioState) => void
  label: string
}) {
  const [showTaxes, setShowTaxes] = useState(false)
  const set = (k: keyof ScenarioState, v: string | boolean) => onChange({ ...state, [k]: v })

  return (
    <Card style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--bs)', paddingBottom: 8 }}>
        {label}
      </p>

      {/* Valores principais */}
      <div>
        <label style={lbl}>Preço de Venda (R$)</label>
        <input style={inp} type="number" placeholder="Ex: 120.000" value={state.salePrice}
          onChange={e => set('salePrice', e.target.value)} onFocus={focusStyle} onBlur={blurStyle} />
      </div>
      <div>
        <label style={lbl}>Preço de Compra / Custo (R$)</label>
        <input style={inp} type="number" placeholder="Ex: 100.000" value={state.purchasePrice}
          onChange={e => set('purchasePrice', e.target.value)} onFocus={focusStyle} onBlur={blurStyle} />
      </div>

      {/* Forma de pagamento */}
      <div>
        <label style={lbl}>Forma de pagamento</label>
        <select style={{ ...inp, cursor: 'pointer' }} value={state.paymentType}
          onChange={e => set('paymentType', e.target.value as ScenarioState['paymentType'])}
          onFocus={focusStyle} onBlur={blurStyle}>
          <option value="cash">À Vista</option>
          <option value="financing">Financiamento bancário</option>
          <option value="consortium">Consórcio</option>
        </select>
      </div>

      {state.paymentType === 'financing' && (
        <div style={{ background: 'var(--el)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={lbl}>Entrada (R$)</label>
            <input style={inp} type="number" placeholder="0" value={state.entrada}
              onChange={e => set('entrada', e.target.value)} onFocus={focusStyle} onBlur={blurStyle} />
          </div>
          <div>
            <label style={lbl}>Prazo (meses)</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={state.financingMonths}
              onChange={e => set('financingMonths', e.target.value)} onFocus={focusStyle} onBlur={blurStyle}>
              {Object.keys(FINANCING_RATES).map(m => (
                <option key={m} value={m}>{m}x · {FINANCING_RATES[m]}% a.m.</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>% Custo plataforma / F&I (%)</label>
            <input style={inp} type="number" step="0.1" value={state.financingPct}
              onChange={e => set('financingPct', e.target.value)} onFocus={focusStyle} onBlur={blurStyle} />
          </div>
        </div>
      )}

      {(state.paymentType === 'cash' || state.paymentType === 'consortium') && (
        <div>
          <label style={lbl}>{state.paymentType === 'consortium' ? 'Taxa de Administração Consórcio (%)' : 'Taxa de plataforma (%)'}</label>
          <input style={inp} type="number" step="0.1" value={state.financingPct}
            onChange={e => set('financingPct', e.target.value)} onFocus={focusStyle} onBlur={blurStyle} />
        </div>
      )}

      <div>
        <label style={lbl}>Comissão do Vendedor (%)</label>
        <input style={inp} type="number" step="0.1" value={state.commissionPct}
          onChange={e => set('commissionPct', e.target.value)} onFocus={focusStyle} onBlur={blurStyle} />
      </div>
      <div>
        <label style={lbl}>Despesas Extras (R$)</label>
        <input style={inp} type="number" placeholder="Ex: 800" value={state.expenses}
          onChange={e => set('expenses', e.target.value)} onFocus={focusStyle} onBlur={blurStyle} />
      </div>

      {/* Taxas brasileiras */}
      <div>
        <button onClick={() => setShowTaxes(v => !v)}
          style={{ background: 'none', border: '1px solid var(--bs)', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', color: 'var(--t3)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, width: '100%' }}>
          <Info size={12} /> Taxas e Obrigações
          {showTaxes ? <ChevronUp size={12} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={12} style={{ marginLeft: 'auto' }} />}
        </button>
        {showTaxes && (
          <div style={{ background: 'var(--el)', borderRadius: 8, padding: '12px', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* IPVA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={state.withIPVA} onChange={e => set('withIPVA', e.target.checked)} id="ipva" />
              <label htmlFor="ipva" style={{ fontSize: 11, color: 'var(--t2)', cursor: 'pointer', flex: 1 }}>IPVA</label>
              {state.withIPVA && (
                <select value={state.uf} onChange={e => set('uf', e.target.value)}
                  style={{ ...inp, width: 80, height: 28 }} onFocus={focusStyle} onBlur={blurStyle}>
                  {Object.keys(IPVA_BY_UF).map(uf => <option key={uf} value={uf}>{uf} {IPVA_BY_UF[uf]}%</option>)}
                </select>
              )}
            </div>
            {/* DETRAN */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={state.withDetran} onChange={e => set('withDetran', e.target.checked)} id="detran" />
              <label htmlFor="detran" style={{ fontSize: 11, color: 'var(--t2)', cursor: 'pointer', flex: 1 }}>DETRAN / Transferência</label>
              {state.withDetran && (
                <input type="number" value={state.detranValue} onChange={e => set('detranValue', e.target.value)}
                  style={{ ...inp, width: 90, height: 28 }} onFocus={focusStyle} onBlur={blurStyle} />
              )}
            </div>
            {/* Garantia */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={state.withGarantia} onChange={e => set('withGarantia', e.target.checked)} id="gar" />
              <label htmlFor="gar" style={{ fontSize: 11, color: 'var(--t2)', cursor: 'pointer', flex: 1 }}>Garantia estendida</label>
              {state.withGarantia && (
                <input type="number" value={state.garantiaValue} onChange={e => set('garantiaValue', e.target.value)}
                  style={{ ...inp, width: 90, height: 28 }} onFocus={focusStyle} onBlur={blurStyle} />
              )}
            </div>
            {/* Revisão */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={state.withRevision} onChange={e => set('withRevision', e.target.checked)} id="rev" />
              <label htmlFor="rev" style={{ fontSize: 11, color: 'var(--t2)', cursor: 'pointer', flex: 1 }}>Revisão / Preparação</label>
              {state.withRevision && (
                <input type="number" value={state.revisionValue} onChange={e => set('revisionValue', e.target.value)}
                  style={{ ...inp, width: 90, height: 28 }} onFocus={focusStyle} onBlur={blurStyle} />
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Painel de resultado ──────────────────────────────────────────────────────

function ResultPanel({ result, state, label }: { result: CalcResult; state: ScenarioState; label: string }) {
  const rows = [
    { l: 'Preço de Venda',           v: formatCurrency(result.sale),           c: 'var(--t)' },
    { l: 'Custo de Compra',          v: `−${formatCurrency(result.purchase)}`, c: 'var(--t2)' },
    { l: 'Margem Bruta',             v: formatCurrency(result.grossMargin),    c: result.grossMargin >= 0 ? 'var(--neon)' : 'var(--red)' },
    ...(result.financing > 0   ? [{ l: 'Financiamento / Plataforma', v: `−${formatCurrency(result.financing)}`, c: 'var(--blu)' }] : []),
    ...(result.commission > 0  ? [{ l: `Comissão (${state.commissionPct}%)`,   v: `−${formatCurrency(result.commission)}`,  c: 'var(--yel)' }] : []),
    ...(result.expenses > 0    ? [{ l: 'Despesas Extras',          v: `−${formatCurrency(result.expenses)}`,   c: 'var(--ora)' }] : []),
    ...(result.ipva > 0        ? [{ l: `IPVA (${state.uf})`,       v: `−${formatCurrency(result.ipva)}`,       c: 'var(--red)' }] : []),
    ...(result.detran > 0      ? [{ l: 'DETRAN / Transferência',   v: `−${formatCurrency(result.detran)}`,     c: 'var(--red)' }] : []),
    ...(result.garantia > 0    ? [{ l: 'Garantia Estendida',       v: `−${formatCurrency(result.garantia)}`,   c: 'var(--ora)' }] : []),
    ...(result.revision > 0    ? [{ l: 'Revisão / Preparação',     v: `−${formatCurrency(result.revision)}`,   c: 'var(--ora)' }] : []),
  ]

  const copyText = () => {
    const lines = [
      `=== Simulação de Venda ===`,
      `Preço de Venda: ${formatCurrency(result.sale)}`,
      `Custo de Compra: ${formatCurrency(result.purchase)}`,
      `Margem Bruta: ${formatCurrency(result.grossMargin)}`,
      `Total de Deduções: ${formatCurrency(result.totalDeductions)}`,
      `Lucro Líquido: ${formatCurrency(result.netMargin)}`,
      `Margem Líquida: ${result.marginPct.toFixed(1)}%`,
      ...(result.parcelaEstimada > 0 ? [`Parcela Estimada: ${formatCurrency(result.parcelaEstimada)}/mês`] : []),
    ].join('\n')
    navigator.clipboard.writeText(lines).then(() => toast.success('Copiado!', 'Resultado copiado para a área de transferência'))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Card style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ ...lbl, margin: 0 }}>{label} · Resultado</p>
          <button onClick={copyText} title="Copiar resultado"
            style={{ background: 'none', border: '1px solid var(--bs)', borderRadius: 5, padding: '3px 7px', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)'; e.currentTarget.style.color = 'var(--neon)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)'; e.currentTarget.style.color = 'var(--t3)' }}>
            <Copy size={10} /> Copiar
          </button>
        </div>
        {rows.map(r => (
          <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--bs)' }}>
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{r.l}</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--fm)', color: r.c, fontWeight: 600 }}>{r.v}</span>
          </div>
        ))}
      </Card>

      {/* Lucro líquido */}
      <Card kpi={result.netMargin > 0} accent={result.netMargin > 0 ? 'var(--neon)' : 'var(--red)'}
        style={{ padding: '14px 16px' }}>
        <p style={lbl}>Lucro Líquido</p>
        <p style={{ fontSize: 28, fontWeight: 800, color: result.netMargin > 0 ? 'var(--neon)' : 'var(--red)', fontFamily: 'var(--fn)' }}>
          {formatCurrency(result.netMargin)}
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>
            Margem: <b style={{ color: result.marginPct > 5 ? 'var(--neon)' : result.marginPct > 0 ? 'var(--yel)' : 'var(--red)' }}>{result.marginPct.toFixed(1)}%</b>
          </span>
          {result.commission > 0 && (
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>
              Comissão: <b style={{ color: 'var(--yel)' }}>{formatCurrency(result.commission)}</b>
            </span>
          )}
        </div>
      </Card>

      {/* Simulação de parcelas (financiamento) */}
      {result.parcelaEstimada > 0 && (
        <Card style={{ padding: '14px 16px' }}>
          <p style={{ ...lbl, marginBottom: 8, color: 'var(--blu)' }}>Simulação de Financiamento</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { l: 'Valor financiado', v: formatCurrency(result.sale - (parseFloat(state.entrada) || 0)) },
              { l: 'Parcela estimada', v: `${formatCurrency(result.parcelaEstimada)}/mês`, bold: true },
              { l: 'Total a pagar', v: formatCurrency(result.totalPago) },
              { l: 'Custo efetivo (juros)', v: formatCurrency(result.cef) },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{r.l}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--fm)', color: r.bold ? 'var(--blu)' : 'var(--t2)', fontWeight: r.bold ? 700 : 400 }}>{r.v}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Histórico local ──────────────────────────────────────────────────────────

interface HistoryEntry {
  id: number; label: string; result: CalcResult; date: string
}

function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('calc-history') ?? '[]') } catch { return [] }
  })

  const save = (label: string, result: CalcResult) => {
    const entry: HistoryEntry = { id: Date.now(), label, result, date: new Date().toLocaleString('pt-BR') }
    const next = [entry, ...history].slice(0, 10)
    setHistory(next)
    localStorage.setItem('calc-history', JSON.stringify(next))
    toast.success('Cálculo salvo!', '')
  }

  const remove = (id: number) => {
    const next = history.filter(h => h.id !== id)
    setHistory(next); localStorage.setItem('calc-history', JSON.stringify(next))
  }

  return { history, save, remove }
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Calculator() {
  const [scenarioA, setScenarioA] = useState<ScenarioState>(emptyScenario())
  const [scenarioB, setScenarioB] = useState<ScenarioState | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const { history, save, remove } = useHistory()

  const resultA = useMemo(() => calculate(scenarioA), [scenarioA])
  const resultB = useMemo(() => scenarioB ? calculate(scenarioB) : null, [scenarioB])

  const reset = () => { setScenarioA(emptyScenario()); setScenarioB(null) }

  // Diferença entre cenários
  const diff = resultB ? {
    netMargin: resultB.netMargin - resultA.netMargin,
    marginPct: resultB.marginPct - resultA.marginPct,
  } : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Calculadora de Negócio</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
            Simule margem, financiamento, taxas e comissão por venda
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!scenarioB && (
            <Button size="sm" variant="secondary" onClick={() => setScenarioB(emptyScenario())}>
              <Plus size={13} /> Comparar Cenários
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setShowHistory(v => !v)}>
            <Clock size={13} /> Histórico {history.length > 0 && `(${history.length})`}
          </Button>
          <Button size="sm" variant="secondary" onClick={reset}>
            <RefreshCw size={13} /> Limpar
          </Button>
        </div>
      </div>

      {/* Histórico */}
      {showHistory && (
        <Card style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 10 }}>Histórico de Simulações</p>
          {history.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', padding: '16px 0' }}>
              Nenhuma simulação salva ainda
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: 'var(--el)', borderRadius: 7 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label}</p>
                    <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 1 }}>{h.date}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: h.result.netMargin > 0 ? 'var(--neon)' : 'var(--red)' }}>
                      {formatCurrency(h.result.netMargin)}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--t3)' }}>{h.result.marginPct.toFixed(1)}%</p>
                  </div>
                  <button onClick={() => remove(h.id)} title="Remover"
                    style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 4 }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Comparativo de cenários */}
      {diff && resultB && (
        <div style={{ background: Math.abs(diff.netMargin) < 1 ? 'var(--el)' : diff.netMargin > 0 ? 'rgba(61,247,16,.05)' : 'rgba(239,68,68,.05)', border: `1px solid ${diff.netMargin > 0 ? 'rgba(61,247,16,.2)' : 'rgba(239,68,68,.2)'}`, borderRadius: 9, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 20 }}>{diff.netMargin > 0 ? '📈' : diff.netMargin < 0 ? '📉' : '⚖️'}</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)' }}>
              Cenário B é {diff.netMargin > 0 ? 'melhor' : diff.netMargin < 0 ? 'pior' : 'igual'} que A
            </p>
            <p style={{ fontSize: 11, color: 'var(--t3)' }}>
              Diferença de lucro: <b style={{ color: diff.netMargin > 0 ? 'var(--neon)' : 'var(--red)' }}>
                {diff.netMargin > 0 ? '+' : ''}{formatCurrency(diff.netMargin)}
              </b> · Margem: <b>{diff.marginPct > 0 ? '+' : ''}{diff.marginPct.toFixed(1)}%</b>
            </p>
          </div>
        </div>
      )}

      {/* Grid de cenários */}
      <div style={{ display: 'grid', gridTemplateColumns: scenarioB ? '1fr 1fr 1fr 1fr' : '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <ScenarioInput state={scenarioA} onChange={setScenarioA} label={scenarioB ? 'Cenário A' : 'Dados da Venda'} />
        <ResultPanel result={resultA} state={scenarioA} label={scenarioB ? 'A' : ''} />

        {scenarioB && resultB && (
          <>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
                <button onClick={() => setScenarioB(null)} title="Remover Cenário B"
                  style={{ background: 'none', border: '1px solid var(--bs)', borderRadius: 5, padding: '2px 5px', cursor: 'pointer', color: 'var(--t3)' }}>
                  <X size={12} />
                </button>
              </div>
              <ScenarioInput state={scenarioB} onChange={setScenarioB} label="Cenário B" />
            </div>
            <ResultPanel result={resultB} state={scenarioB} label="B" />
          </>
        )}
      </div>

      {/* Salvar no histórico */}
      {resultA.sale > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button size="sm" onClick={() => {
            const label = `Venda ${formatCurrency(resultA.sale)} · Lucro ${formatCurrency(resultA.netMargin)}`
            save(label, resultA)
          }}>
            Salvar simulação
          </Button>
        </div>
      )}
    </div>
  )
}
