import { useState } from 'react'
import { Calculator as CalcIcon, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/utils/format'

const inp: React.CSSProperties = {
  width: '100%', height: 34, padding: '0 11px',
  background: 'var(--el)', border: '1px solid var(--b)',
  borderRadius: 7, color: 'var(--t)', fontSize: 12,
  outline: 'none', fontFamily: 'var(--fn)',
}

const label: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--t3)',
  textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4,
  display: 'block',
}

export default function Calculator() {
  const [salePrice, setSalePrice]       = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [financingPct, setFinancingPct]  = useState('20')
  const [commissionPct, setCommissionPct] = useState('1.5')
  const [expenses, setExpenses]          = useState('')

  const sale    = parseFloat(salePrice.replace(/\D/g, '')) || 0
  const purchase = parseFloat(purchasePrice.replace(/\D/g, '')) || 0
  const fin     = (sale * parseFloat(financingPct)) / 100
  const comm    = (sale * parseFloat(commissionPct)) / 100
  const exp     = parseFloat(expenses.replace(/\D/g, '')) || 0
  const grossMargin = sale - purchase
  const netMargin   = grossMargin - fin - comm - exp
  const marginPct   = sale > 0 ? (netMargin / sale) * 100 : 0

  const reset = () => {
    setSalePrice(''); setPurchasePrice(''); setFinancingPct('20')
    setCommissionPct('1.5'); setExpenses('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 660 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Calculadora de Negócio</h1>
          <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Simule margem, financiamento e comissão por venda</p>
        </div>
        <Button size="sm" variant="secondary" onClick={reset}><RefreshCw size={13} /> Limpar</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Inputs */}
        <Card style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Dados da Venda
          </p>

          <div>
            <label style={label}>Preço de Venda (R$)</label>
            <input style={inp} type="number" placeholder="Ex: 120000" value={salePrice}
              onChange={e => setSalePrice(e.target.value)}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
          </div>
          <div>
            <label style={label}>Preço de Compra (R$)</label>
            <input style={inp} type="number" placeholder="Ex: 100000" value={purchasePrice}
              onChange={e => setPurchasePrice(e.target.value)}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
          </div>
          <div>
            <label style={label}>Custo de Financiamento (%)</label>
            <input style={inp} type="number" step="0.1" value={financingPct}
              onChange={e => setFinancingPct(e.target.value)}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
          </div>
          <div>
            <label style={label}>Comissão do Vendedor (%)</label>
            <input style={inp} type="number" step="0.1" value={commissionPct}
              onChange={e => setCommissionPct(e.target.value)}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
          </div>
          <div>
            <label style={label}>Despesas Extras (R$)</label>
            <input style={inp} type="number" placeholder="Ex: 800" value={expenses}
              onChange={e => setExpenses(e.target.value)}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--b)')} />
          </div>
        </Card>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Card style={{ padding: '16px 18px' }}>
            <p style={{ ...label, marginBottom: 8 }}>Resultado</p>
            {[
              { l: 'Preço de Venda',     v: formatCurrency(sale),       c: 'var(--t)' },
              { l: 'Preço de Compra',    v: formatCurrency(purchase),   c: 'var(--t2)' },
              { l: 'Margem Bruta',       v: formatCurrency(grossMargin), c: grossMargin >= 0 ? 'var(--neon)' : 'var(--red)' },
              { l: `Financiamento (${financingPct}%)`, v: `−${formatCurrency(fin)}`, c: 'var(--red)' },
              { l: `Comissão (${commissionPct}%)`,     v: `−${formatCurrency(comm)}`, c: 'var(--yel)' },
              { l: 'Despesas Extras',    v: `−${formatCurrency(exp)}`,  c: 'var(--ora)' },
            ].map(r => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--bs)' }}>
                <span style={{ fontSize: 12, color: 'var(--t3)' }}>{r.l}</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--fm)', color: r.c, fontWeight: 600 }}>{r.v}</span>
              </div>
            ))}
          </Card>

          <Card kpi={netMargin > 0} accent={netMargin > 0 ? 'var(--neon)' : 'var(--red)'} style={{ padding: '16px 18px' }}>
            <p style={label}>Lucro Líquido</p>
            <p style={{ fontSize: 30, fontWeight: 800, color: netMargin > 0 ? 'var(--neon)' : 'var(--red)', fontFamily: 'var(--fn)' }}>
              {formatCurrency(netMargin)}
            </p>
            <p style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
              Margem: <span style={{ color: marginPct > 0 ? 'var(--neon)' : 'var(--red)', fontWeight: 700 }}>
                {marginPct.toFixed(1)}%
              </span>
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
