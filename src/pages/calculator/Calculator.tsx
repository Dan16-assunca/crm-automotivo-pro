import React, { useState, useMemo } from 'react'
import { RefreshCw, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency } from '@/utils/format'

// ─── Estilos ──────────────────────────────────────────────────────────────────

const S = {
  inp: {
    width: '100%', height: 36, padding: '0 11px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 13,
    outline: 'none', fontFamily: 'var(--fn)',
  } as React.CSSProperties,
  sel: {
    width: '100%', height: 36, padding: '0 11px',
    background: 'var(--el)', border: '1px solid var(--b)',
    borderRadius: 7, color: 'var(--t)', fontSize: 13,
    outline: 'none', fontFamily: 'var(--fn)', cursor: 'pointer',
  } as React.CSSProperties,
  lbl: {
    fontSize: 10, fontWeight: 600 as const, color: 'var(--t3)',
    textTransform: 'uppercase' as const, letterSpacing: '.06em',
    marginBottom: 5, display: 'block',
  } as React.CSSProperties,
  card: {
    background: 'var(--card)', border: '1px solid var(--bs)',
    borderRadius: 10, padding: '18px 20px',
  } as React.CSSProperties,
  row: {
    display: 'flex', justifyContent: 'space-between',
    padding: '6px 0', borderBottom: '1px solid var(--bs)',
    alignItems: 'center',
  } as React.CSSProperties,
}

function focus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--nb)'
}
function blur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = 'var(--b)'
}

function n(v: string) { return parseFloat(v.replace(',', '.')) || 0 }

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => null)
}

// ─── Tabela Price ─────────────────────────────────────────────────────────────
function tabelaPrice(pv: number, taxaMes: number, n: number) {
  if (pv <= 0 || taxaMes <= 0 || n <= 0) return 0
  const i = taxaMes / 100
  return pv * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
}

// ─── IPVA por UF ─────────────────────────────────────────────────────────────
const IPVA: Record<string, number> = {
  SP: 4.0, RJ: 4.0, MG: 4.0, RS: 3.0, PR: 3.5, SC: 2.0,
  BA: 3.5, GO: 3.75, PE: 3.0, CE: 3.0, DF: 3.5, ES: 2.5,
  AM: 3.0, PA: 2.5, MT: 3.0, MS: 3.5, SE: 3.5, PB: 2.0,
  MA: 2.0, PI: 2.5, AL: 2.5, RN: 3.0, TO: 2.5, AP: 2.0,
}

// ─── 1. CALCULADORA DE MARGEM ─────────────────────────────────────────────────
function CalcMargem() {
  const [venda, setVenda]     = useState('')
  const [compra, setCompra]   = useState('')
  const [comissao, setComis]  = useState('1.5')
  const [finan, setFinan]     = useState('2.5')
  const [detran, setDetran]   = useState('750')
  const [extras, setExtras]   = useState('')
  const [showDetran, setSD]   = useState(false)

  const V = n(venda), C = n(compra), COM = n(comissao), FIN = n(finan), DET = showDetran ? n(detran) : 0, EXT = n(extras)
  const margBruta  = V - C
  const custoFin   = V * FIN / 100
  const custoComis = V * COM / 100
  const totalDesc  = custoFin + custoComis + DET + EXT
  const lucro      = margBruta - totalDesc
  const margPct    = V > 0 ? (lucro / V) * 100 : 0
  const bom        = lucro > 0

  const resultado = `=== Resultado da Venda ===\nPreço de Venda: ${formatCurrency(V)}\nCusto do Veículo: ${formatCurrency(C)}\nMargem Bruta: ${formatCurrency(margBruta)}\nFinanciamento: -${formatCurrency(custoFin)}\nComissão: -${formatCurrency(custoComis)}\nDETRAN: -${formatCurrency(DET)}\nExtras: -${formatCurrency(EXT)}\nLucro Líquido: ${formatCurrency(lucro)}\nMargem: ${margPct.toFixed(1)}%`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
      {/* Inputs */}
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', borderBottom: '1px solid var(--bs)', paddingBottom: 8 }}>
          Dados da Operação
        </p>
        {[
          { lbl: 'Preço de Venda (R$)', val: venda, set: setVenda, ph: '120000' },
          { lbl: 'Custo do Veículo (R$)', val: compra, set: setCompra, ph: '100000' },
        ].map(f => (
          <div key={f.lbl}>
            <label style={S.lbl}>{f.lbl}</label>
            <input style={S.inp} type="number" placeholder={f.ph} value={f.val}
              onChange={e => f.set(e.target.value)} onFocus={focus} onBlur={blur} />
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={S.lbl}>Financiamento / Plataforma (%)</label>
            <input style={S.inp} type="number" step="0.1" value={finan}
              onChange={e => setFinan(e.target.value)} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <label style={S.lbl}>Comissão do Vendedor (%)</label>
            <input style={S.inp} type="number" step="0.1" value={comissao}
              onChange={e => setComis(e.target.value)} onFocus={focus} onBlur={blur} />
          </div>
        </div>
        <div>
          <label style={S.lbl}>Despesas Extras — Mecânica, Fotos, etc. (R$)</label>
          <input style={S.inp} type="number" placeholder="800" value={extras}
            onChange={e => setExtras(e.target.value)} onFocus={focus} onBlur={blur} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="det" checked={showDetran} onChange={e => setSD(e.target.checked)} />
            <label htmlFor="det" style={{ fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}>Incluir DETRAN / Transferência</label>
          </div>
          {showDetran && (
            <input style={{ ...S.inp, marginTop: 8 }} type="number" placeholder="750" value={detran}
              onChange={e => setDetran(e.target.value)} onFocus={focus} onBlur={blur} />
          )}
        </div>
      </div>

      {/* Resultado */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ ...S.lbl, margin: 0 }}>Detalhamento</p>
            {V > 0 && (
              <button onClick={() => copyText(resultado)} title="Copiar"
                style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--bs)', borderRadius: 5, padding: '4px 8px', cursor: 'pointer', color: 'var(--t3)', fontSize: 10 }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--neon)'; e.currentTarget.style.borderColor = 'var(--nb)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.borderColor = 'var(--bs)' }}>
                <Copy size={10} /> Copiar
              </button>
            )}
          </div>
          {[
            { l: 'Preço de Venda',              v: formatCurrency(V),         c: 'var(--t)' },
            { l: 'Custo do Veículo',             v: `−${formatCurrency(C)}`,  c: 'var(--t2)' },
            { l: 'Margem Bruta',                 v: formatCurrency(margBruta), c: margBruta > 0 ? 'var(--neon)' : 'var(--red)' },
            { l: `Financiamento (${finan}%)`,    v: `−${formatCurrency(custoFin)}`, c: 'var(--blu)' },
            { l: `Comissão (${comissao}%)`,      v: `−${formatCurrency(custoComis)}`, c: 'var(--yel)' },
            ...(DET > 0 ? [{ l: 'DETRAN / Transferência', v: `−${formatCurrency(DET)}`, c: '#f97316' }] : []),
            ...(EXT > 0 ? [{ l: 'Despesas Extras', v: `−${formatCurrency(EXT)}`, c: '#f97316' }] : []),
          ].map(r => (
            <div key={r.l} style={S.row}>
              <span style={{ fontSize: 12, color: 'var(--t3)' }}>{r.l}</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--fm)', color: r.c, fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
        </div>

        {/* Lucro */}
        <div style={{ ...S.card, borderColor: bom ? 'rgba(61,247,16,.25)' : 'rgba(239,68,68,.25)', background: bom ? 'rgba(61,247,16,.03)' : 'rgba(239,68,68,.03)' }}>
          <p style={S.lbl}>Lucro Líquido</p>
          <p style={{ fontSize: 34, fontWeight: 800, color: bom ? 'var(--neon)' : 'var(--red)', fontFamily: 'var(--fn)', margin: '4px 0' }}>
            {formatCurrency(lucro)}
          </p>
          <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              Margem: <b style={{ color: margPct > 5 ? 'var(--neon)' : margPct > 0 ? 'var(--yel)' : 'var(--red)' }}>{margPct.toFixed(1)}%</b>
            </span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              Comissão: <b style={{ color: 'var(--yel)' }}>{formatCurrency(custoComis)}</b>
            </span>
          </div>
          {/* Barra de margem */}
          <div style={{ marginTop: 12, height: 6, background: 'var(--el)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, Math.abs(margPct) * 5)}%`, background: bom ? 'var(--neon)' : 'var(--red)', borderRadius: 99, transition: 'width .4s' }} />
          </div>
          <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
            {margPct >= 10 ? '✅ Margem saudável' : margPct >= 5 ? '⚠️ Margem apertada' : margPct > 0 ? '🔴 Margem abaixo do ideal' : '❌ Operação no prejuízo'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── 2. CALCULADORA DE FINANCIAMENTO ─────────────────────────────────────────
const BANCOS = [
  { nome: 'Banco do Brasil',  taxas: { 12: 1.19, 24: 1.29, 36: 1.39, 48: 1.49, 60: 1.59, 72: 1.69 } },
  { nome: 'Santander',        taxas: { 12: 1.29, 24: 1.39, 36: 1.49, 48: 1.59, 60: 1.69, 72: 1.79 } },
  { nome: 'Bradesco',         taxas: { 12: 1.25, 24: 1.35, 36: 1.45, 48: 1.55, 60: 1.65, 72: 1.75 } },
  { nome: 'Itaú',             taxas: { 12: 1.22, 24: 1.32, 36: 1.42, 48: 1.52, 60: 1.62, 72: 1.72 } },
  { nome: 'Caixa Econômica',  taxas: { 12: 1.15, 24: 1.25, 36: 1.35, 48: 1.45, 60: 1.55, 72: 1.65 } },
  { nome: 'BV Financeira',    taxas: { 12: 1.35, 24: 1.45, 36: 1.55, 48: 1.65, 60: 1.75, 72: 1.85 } },
]
const PRAZOS = [12, 24, 36, 48, 60, 72]

function CalcFinanciamento() {
  const [valor, setValor]     = useState('')
  const [entrada, setEntrada] = useState('')
  const [banco, setBanco]     = useState('0')
  const [prazo, setPrazo]     = useState('48')
  const [showAll, setShowAll] = useState(false)

  const V = n(valor), E = n(entrada)
  const financiado = Math.max(0, V - E)
  const entradaPct = V > 0 ? (E / V) * 100 : 0
  const bInfo = BANCOS[parseInt(banco) || 0]
  const pr = parseInt(prazo) as keyof typeof bInfo.taxas
  const taxa = bInfo.taxas[pr] ?? 1.49
  const parcela = tabelaPrice(financiado, taxa, pr)
  const totalPago = parcela * pr + E
  const jurosTotal = totalPago - V
  const cet = V > 0 ? (Math.pow(totalPago / V, 1 / (pr / 12)) - 1) * 100 : 0

  // Tabela comparativa de bancos
  const comparativo = BANCOS.map(b => {
    const t = b.taxas[pr] ?? 1.49
    const p = tabelaPrice(financiado, t, pr)
    return { nome: b.nome, taxa: t, parcela: p, total: p * pr + E }
  }).sort((a, b) => a.parcela - b.parcela)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
        {/* Inputs */}
        <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', borderBottom: '1px solid var(--bs)', paddingBottom: 8 }}>Dados do Financiamento</p>
          <div>
            <label style={S.lbl}>Valor do Veículo (R$)</label>
            <input style={S.inp} type="number" placeholder="80000" value={valor} onChange={e => setValor(e.target.value)} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <label style={S.lbl}>Entrada (R$)</label>
            <input style={S.inp} type="number" placeholder="20000" value={entrada} onChange={e => setEntrada(e.target.value)} onFocus={focus} onBlur={blur} />
            {V > 0 && <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>{entradaPct.toFixed(1)}% do valor do veículo</p>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.lbl}>Banco / Financeira</label>
              <select style={S.sel} value={banco} onChange={e => setBanco(e.target.value)} onFocus={focus} onBlur={blur}>
                {BANCOS.map((b, i) => <option key={b.nome} value={i}>{b.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={S.lbl}>Prazo (meses)</label>
              <select style={S.sel} value={prazo} onChange={e => setPrazo(e.target.value)} onFocus={focus} onBlur={blur}>
                {PRAZOS.map(p => <option key={p} value={p}>{p}x</option>)}
              </select>
            </div>
          </div>
          <div style={{ background: 'var(--el)', borderRadius: 8, padding: '12px', fontSize: 11, color: 'var(--t3)' }}>
            Taxa: <b style={{ color: 'var(--blu)' }}>{taxa.toFixed(2)}% a.m.</b> · {bInfo.nome}
          </div>
        </div>

        {/* Resultado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...S.card, borderColor: 'rgba(59,130,246,.25)' }}>
            <p style={S.lbl}>Parcela Mensal (Tabela Price)</p>
            <p style={{ fontSize: 38, fontWeight: 800, color: 'var(--blu)', fontFamily: 'var(--fn)', margin: '4px 0' }}>
              {formatCurrency(parcela)}
            </p>
            <p style={{ fontSize: 11, color: 'var(--t3)' }}>{pr}x de {formatCurrency(parcela)}</p>
          </div>
          <div style={S.card}>
            {[
              { l: 'Valor do veículo',      v: formatCurrency(V),          c: 'var(--t)' },
              { l: 'Entrada',               v: formatCurrency(E),          c: 'var(--t2)' },
              { l: 'Valor financiado',       v: formatCurrency(financiado), c: 'var(--t)' },
              { l: 'Taxa mensal',            v: `${taxa.toFixed(2)}% a.m.`, c: 'var(--blu)' },
              { l: 'Total pago',             v: formatCurrency(totalPago),  c: 'var(--yel)' },
              { l: 'Juros totais',           v: formatCurrency(jurosTotal), c: 'var(--red)' },
              { l: 'CET anual estimado',     v: `${cet.toFixed(1)}% a.a.`,  c: 'var(--red)' },
            ].map(r => (
              <div key={r.l} style={S.row}>
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>{r.l}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--fm)', color: r.c, fontWeight: 600 }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparativo bancos */}
      {financiado > 0 && (
        <div style={S.card}>
          <button onClick={() => setShowAll(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t)', fontSize: 12, fontWeight: 700, padding: 0 }}>
            Comparativo entre Bancos ({pr}x)
            {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showAll && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
              <thead>
                <tr>
                  {['Banco', 'Taxa a.m.', 'Parcela', 'Total Pago', 'Juros'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--bs)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparativo.map((b, i) => (
                  <tr key={b.nome} style={{ background: b.nome === bInfo.nome ? 'rgba(59,130,246,.06)' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
                    onMouseLeave={e => (e.currentTarget.style.background = b.nome === bInfo.nome ? 'rgba(59,130,246,.06)' : 'transparent')}>
                    <td style={{ padding: '8px 8px', fontSize: 11, color: b.nome === bInfo.nome ? 'var(--blu)' : 'var(--t)', fontWeight: b.nome === bInfo.nome ? 700 : 400 }}>
                      {i === 0 ? '🏆 ' : ''}{b.nome}
                    </td>
                    <td style={{ padding: '8px 8px', fontSize: 11, color: 'var(--t2)', fontFamily: 'var(--fm)' }}>{b.taxa.toFixed(2)}%</td>
                    <td style={{ padding: '8px 8px', fontSize: 11, color: i === 0 ? 'var(--neon)' : 'var(--t)', fontFamily: 'var(--fm)', fontWeight: i === 0 ? 700 : 400 }}>{formatCurrency(b.parcela)}</td>
                    <td style={{ padding: '8px 8px', fontSize: 11, color: 'var(--t2)', fontFamily: 'var(--fm)' }}>{formatCurrency(b.total)}</td>
                    <td style={{ padding: '8px 8px', fontSize: 11, color: 'var(--red)', fontFamily: 'var(--fm)' }}>{formatCurrency(b.total - V)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 3. CALCULADORA DE IPVA + TRANSFERÊNCIA ───────────────────────────────────
function CalcIPVA() {
  const [valor, setValor] = useState('')
  const [uf, setUf]       = useState('SP')
  const [ano, setAno]     = useState(new Date().getFullYear().toString())
  const [semi, setSemi]   = useState(false)

  const V = n(valor)
  const anoAtual = new Date().getFullYear()
  const idadeAnos = anoAtual - (parseInt(ano) || anoAtual)

  // Fator de depreciação p/ valor venal (simplificado FIPE)
  const depreciacao = Math.max(0, 1 - idadeAnos * 0.08)
  const valorVenal = V * depreciacao
  const aliquota = IPVA[uf] ?? 4.0
  const ipvaAnual = valorVenal * aliquota / 100
  const ipvaSemestral = ipvaAnual / 2
  const detran = 750 // estimativa média
  const garantia = idadeAnos > 5 ? 0 : 1500
  const totalBurocracia = ipvaAnual + detran + (semi ? ipvaSemestral : 0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', borderBottom: '1px solid var(--bs)', paddingBottom: 8 }}>Dados do Veículo</p>
        <div>
          <label style={S.lbl}>Valor do Veículo (R$)</label>
          <input style={S.inp} type="number" placeholder="80000" value={valor} onChange={e => setValor(e.target.value)} onFocus={focus} onBlur={blur} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={S.lbl}>Ano do Veículo</label>
            <input style={S.inp} type="number" placeholder={anoAtual.toString()} value={ano} onChange={e => setAno(e.target.value)} onFocus={focus} onBlur={blur} />
          </div>
          <div>
            <label style={S.lbl}>Estado (UF)</label>
            <select style={S.sel} value={uf} onChange={e => setUf(e.target.value)} onFocus={focus} onBlur={blur}>
              {Object.entries(IPVA).map(([u, t]) => <option key={u} value={u}>{u} — {t}%</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="semi" checked={semi} onChange={e => setSemi(e.target.checked)} />
          <label htmlFor="semi" style={{ fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}>Incluir parcelamento semestral do IPVA</label>
        </div>
        <div style={{ background: 'var(--el)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--t3)' }}>
          <b>Como calcular:</b> O IPVA incide sobre o valor venal (FIPE), não o preço de venda. Veículos mais antigos têm valor venal menor e pagam menos IPVA.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={S.card}>
          <p style={S.lbl}>IPVA Estimado — {uf}</p>
          <p style={{ fontSize: 34, fontWeight: 800, color: 'var(--yel)', fontFamily: 'var(--fn)', margin: '4px 0' }}>
            {formatCurrency(ipvaAnual)}
          </p>
          <p style={{ fontSize: 11, color: 'var(--t3)' }}>por ano · {aliquota}% sobre valor venal</p>
        </div>
        <div style={S.card}>
          {[
            { l: 'Valor do veículo (venda)', v: formatCurrency(V),                    c: 'var(--t)' },
            { l: `Valor venal estimado (${idadeAnos}${idadeAnos === 1 ? ' ano' : ' anos'} de uso)`, v: formatCurrency(valorVenal), c: 'var(--t2)' },
            { l: `Alíquota IPVA (${uf})`,   v: `${aliquota}%`,                        c: 'var(--t)' },
            { l: 'IPVA anual',               v: formatCurrency(ipvaAnual),             c: 'var(--yel)' },
            { l: 'IPVA 1ª parcela (jan)',     v: formatCurrency(ipvaSemestral),         c: 'var(--t2)' },
            { l: 'DETRAN / Transferência',   v: `~${formatCurrency(detran)}`,          c: '#f97316' },
            { l: 'Garantia estendida (est.)',v: idadeAnos > 5 ? 'Não recomendado' : `~${formatCurrency(garantia)}`, c: '#f97316' },
          ].map(r => (
            <div key={r.l} style={S.row}>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{r.l}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fm)', color: r.c, fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 7, padding: '10px 12px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--yel)', marginBottom: 3 }}>
              💰 Custo 1º ano para o comprador:
            </p>
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--yel)', fontFamily: 'var(--fn)' }}>
              {formatCurrency(ipvaAnual + detran)}
            </p>
            <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>IPVA + DETRAN/Transferência</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 4. CUSTO TOTAL DE PROPRIEDADE (TCO) ─────────────────────────────────────
function CalcTCO() {
  const [valor,      setValor]      = useState('')
  const [entrada,    setEntrada]    = useState('')
  const [anos,       setAnos]       = useState('3')
  const [kmAno,      setKmAno]      = useState('20000')
  const [combKm,     setCombKm]     = useState('10')
  const [precoComb,  setPrecoComb]  = useState('6.50')
  const [seguro,     setSeguro]     = useState('3500')
  const [manutAnual, setManut]      = useState('2400')
  const [uf,         setUf]         = useState('SP')

  const V = n(valor), E = n(entrada), A = parseInt(anos) || 3
  const km = n(kmAno), cpk = n(combKm), pc = n(precoComb)
  const seg = n(seguro), man = n(manutAnual)

  const financiado = Math.max(0, V - E)
  const parcela = tabelaPrice(financiado, 1.49, 48)
  const totalFinan = parcela * 48 + E
  const juros = totalFinan - V

  // Depreciação em A anos (~15% ao ano nos primeiros anos)
  const depAnual = 0.13
  const valorFinal = V * Math.pow(1 - depAnual, A)
  const depreciacaoTotal = V - valorFinal

  const ipvaAnual = (V * (IPVA[uf] ?? 4.0)) / 100
  const combustivelAnual = (km / cpk) * pc
  const custoTotalAnual = ipvaAnual + seg + man + combustivelAnual
  const custoTotalPeriodo = custoTotalAnual * A + depreciacaoTotal + (financiado > 0 ? juros : 0)
  const custoPorKm = km > 0 ? custoTotalAnual / km : 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', borderBottom: '1px solid var(--bs)', paddingBottom: 8 }}>Custo Total de Propriedade (TCO)</p>
        <p style={{ fontSize: 11, color: 'var(--t3)' }}>Mostre ao cliente o custo real de possuir o veículo</p>
        {[
          { l: 'Valor do Veículo (R$)',    v: valor, s: setValor, ph: '80000' },
          { l: 'Entrada (R$)',             v: entrada, s: setEntrada, ph: '20000' },
          { l: 'KM rodados por ano',       v: kmAno, s: setKmAno, ph: '20000' },
          { l: 'Consumo médio (km/l)',     v: combKm, s: setCombKm, ph: '10' },
          { l: 'Preço combustível (R$/l)', v: precoComb, s: setPrecoComb, ph: '6.50' },
          { l: 'Seguro anual (R$)',        v: seguro, s: setSeguro, ph: '3500' },
          { l: 'Manutenção/revisão anual', v: manutAnual, s: setManut, ph: '2400' },
        ].map(f => (
          <div key={f.l}>
            <label style={S.lbl}>{f.l}</label>
            <input style={S.inp} type="number" step="0.01" placeholder={f.ph} value={f.v} onChange={e => f.s(e.target.value)} onFocus={focus} onBlur={blur} />
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={S.lbl}>Estado (IPVA)</label>
            <select style={S.sel} value={uf} onChange={e => setUf(e.target.value)} onFocus={focus} onBlur={blur}>
              {Object.keys(IPVA).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Período de análise</label>
            <select style={S.sel} value={anos} onChange={e => setAnos(e.target.value)} onFocus={focus} onBlur={blur}>
              {[1,2,3,4,5].map(a => <option key={a} value={a}>{a} {a === 1 ? 'ano' : 'anos'}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ ...S.card, borderColor: 'rgba(139,92,246,.25)' }}>
          <p style={S.lbl}>Custo total em {A} {A === 1 ? 'ano' : 'anos'}</p>
          <p style={{ fontSize: 34, fontWeight: 800, color: '#8b5cf6', fontFamily: 'var(--fn)', margin: '4px 0' }}>
            {formatCurrency(custoTotalPeriodo)}
          </p>
          <p style={{ fontSize: 11, color: 'var(--t3)' }}>
            {formatCurrency(custoPorKm)}/km · {formatCurrency(custoTotalAnual)}/ano em custos fixos
          </p>
        </div>
        <div style={S.card}>
          {[
            { l: `IPVA anual (${uf})`,          v: formatCurrency(ipvaAnual),         c: 'var(--yel)' },
            { l: 'Seguro anual',                v: formatCurrency(seg),               c: 'var(--yel)' },
            { l: 'Manutenção/revisão anual',    v: formatCurrency(man),               c: '#f97316' },
            { l: `Combustível (${kmAno} km/ano)`, v: formatCurrency(combustivelAnual), c: '#f97316' },
            { l: `Depreciação em ${A} anos`,    v: `−${formatCurrency(depreciacaoTotal)}`, c: 'var(--red)' },
            { l: 'Valor residual estimado',     v: formatCurrency(valorFinal),         c: 'var(--neon)' },
            ...(financiado > 0 ? [{ l: 'Juros do financiamento', v: formatCurrency(juros), c: 'var(--red)' }] : []),
          ].map(r => (
            <div key={r.l} style={S.row}>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{r.l}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fm)', color: r.c, fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(139,92,246,.08)', border: '1px solid rgba(139,92,246,.2)', borderRadius: 8, padding: '12px 14px', fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
          <b style={{ color: '#8b5cf6' }}>💡 Use para negociar:</b> Mostre ao cliente que o veículo mais barato pode ter custo total maior devido a consumo, seguro e manutenção mais altos.
        </div>
      </div>
    </div>
  )
}

// ─── 5. CALCULADORA DE TROCA (TRADE-IN) ──────────────────────────────────────
function CalcTradeIn() {
  const [valorNovo,   setNovo]    = useState('')
  const [valorTroca,  setTroca]   = useState('')
  const [divida,      setDivida]  = useState('')
  const [desconto,    setDesc]    = useState('')
  const [financiar,   setFinan]   = useState(false)
  const [prazo,       setPrazo]   = useState('48')

  const VN = n(valorNovo), VT = n(valorTroca), DV = n(divida), DC = n(desconto)
  const valorLiquidoTroca = Math.max(0, VT - DV)
  const valorDescontado = VN - DC
  const aDinheiro = Math.max(0, valorDescontado - valorLiquidoTroca)
  const parcela = financiar ? tabelaPrice(aDinheiro, 1.49, parseInt(prazo) || 48) : 0
  const economiaTroca = VN - aDinheiro - DC
  const pctTradeIn = VN > 0 ? (valorLiquidoTroca / VN) * 100 : 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', borderBottom: '1px solid var(--bs)', paddingBottom: 8 }}>Calculadora de Troca (Trade-In)</p>
        <div>
          <label style={S.lbl}>Valor do Veículo Novo (R$)</label>
          <input style={S.inp} type="number" placeholder="120000" value={valorNovo} onChange={e => setNovo(e.target.value)} onFocus={focus} onBlur={blur} />
        </div>
        <div>
          <label style={S.lbl}>Avaliação do Veículo na Troca (R$)</label>
          <input style={S.inp} type="number" placeholder="40000" value={valorTroca} onChange={e => setTroca(e.target.value)} onFocus={focus} onBlur={blur} />
          {VT > 0 && <p style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>{pctTradeIn.toFixed(1)}% do veículo novo</p>}
        </div>
        <div>
          <label style={S.lbl}>Dívida Restante do Veículo na Troca (R$)</label>
          <input style={S.inp} type="number" placeholder="0" value={divida} onChange={e => setDivida(e.target.value)} onFocus={focus} onBlur={blur} />
        </div>
        <div>
          <label style={S.lbl}>Desconto Concedido (R$)</label>
          <input style={S.inp} type="number" placeholder="2000" value={desconto} onChange={e => setDesc(e.target.value)} onFocus={focus} onBlur={blur} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="fin2" checked={financiar} onChange={e => setFinan(e.target.checked)} />
            <label htmlFor="fin2" style={{ fontSize: 12, color: 'var(--t2)', cursor: 'pointer' }}>Financiar o restante</label>
          </div>
          {financiar && (
            <select style={{ ...S.sel, marginTop: 8 }} value={prazo} onChange={e => setPrazo(e.target.value)} onFocus={focus} onBlur={blur}>
              {PRAZOS.map(p => <option key={p} value={p}>{p}x · taxa 1.49% a.m.</option>)}
            </select>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ ...S.card, borderColor: 'rgba(16,185,129,.25)' }}>
          <p style={S.lbl}>A pagar em dinheiro / financiamento</p>
          <p style={{ fontSize: 34, fontWeight: 800, color: '#10b981', fontFamily: 'var(--fn)', margin: '4px 0' }}>
            {formatCurrency(aDinheiro)}
          </p>
          {financiar && <p style={{ fontSize: 13, color: 'var(--blu)' }}>{prazo}x de {formatCurrency(parcela)}</p>}
        </div>
        <div style={S.card}>
          {[
            { l: 'Veículo novo',              v: formatCurrency(VN),               c: 'var(--t)' },
            { l: 'Desconto',                  v: DC > 0 ? `−${formatCurrency(DC)}` : '—', c: 'var(--neon)' },
            { l: 'Valor do veículo na troca', v: formatCurrency(VT),               c: 'var(--t2)' },
            { l: 'Dívida do veículo trocado', v: DV > 0 ? `−${formatCurrency(DV)}` : '—', c: 'var(--red)' },
            { l: 'Valor líquido da troca',    v: formatCurrency(valorLiquidoTroca), c: '#10b981' },
            { l: 'A pagar',                   v: formatCurrency(aDinheiro),         c: 'var(--blu)' },
          ].map(r => (
            <div key={r.l} style={S.row}>
              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{r.l}</span>
              <span style={{ fontSize: 11, fontFamily: 'var(--fm)', color: r.c, fontWeight: 600 }}>{r.v}</span>
            </div>
          ))}
          {economiaTroca > 0 && (
            <div style={{ marginTop: 10, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 7, padding: '10px 12px' }}>
              <p style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>
                🎯 O cliente economiza {formatCurrency(economiaTroca)} em relação a comprar sem troca
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'margem',      label: '💰 Margem',       desc: 'Lucro da operação' },
  { id: 'financ',      label: '🏦 Financiamento', desc: 'Parcelas Tabela Price' },
  { id: 'ipva',        label: '📋 IPVA + Taxas',  desc: 'Custo para o comprador' },
  { id: 'tco',         label: '📊 Custo Total',   desc: 'TCO em X anos' },
  { id: 'tradein',     label: '🔄 Troca',          desc: 'Cálculo de trade-in' },
]

export default function Calculator() {
  const [tab, setTab] = useState('margem')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Calculadora de Negócio</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
            {TABS.find(t => t.id === tab)?.desc ?? 'Ferramentas de cálculo para lojistas'}
          </p>
        </div>
        <button onClick={() => { /* reset é por aba */ }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px solid var(--bs)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', color: 'var(--t3)', fontSize: 12 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bs)' }}>
          <RefreshCw size={12} /> Limpar
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: tab === t.id ? 'var(--card)' : 'var(--el)',
              border: tab === t.id ? '1px solid var(--nb)' : '1px solid var(--bs)',
              color: tab === t.id ? 'var(--neon)' : 'var(--t3)',
              cursor: 'pointer', transition: 'all .15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === 'margem'  && <CalcMargem />}
      {tab === 'financ'  && <CalcFinanciamento />}
      {tab === 'ipva'    && <CalcIPVA />}
      {tab === 'tco'     && <CalcTCO />}
      {tab === 'tradein' && <CalcTradeIn />}
    </div>
  )
}
