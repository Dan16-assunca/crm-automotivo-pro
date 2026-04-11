import { Plug, CheckCircle2, Clock, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

const INTEGRATIONS = [
  { name: 'Evolution API', desc: 'WhatsApp Business via Evolution API', status: 'connected', icon: '💬', docs: 'https://doc.evolution-api.com' },
  { name: 'Meta Ads',      desc: 'Captura de leads pelo Facebook/Instagram Ads', status: 'pending', icon: '📘', docs: '#' },
  { name: 'Google Ads',    desc: 'Integração de campanhas e leads do Google', status: 'pending', icon: '🔍', docs: '#' },
  { name: 'OLX Autos',     desc: 'Importação automática de leads da OLX', status: 'pending', icon: '🚗', docs: '#' },
  { name: 'WebMotors',     desc: 'Sincronização de estoque e leads', status: 'pending', icon: '🔧', docs: '#' },
  { name: 'iCarros',       desc: 'Integração com portal iCarros', status: 'pending', icon: '🚘', docs: '#' },
]

export default function Integrations() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Integrações</h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Conecte o CRM com suas ferramentas de marketing e vendas</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {INTEGRATIONS.map(int => (
          <Card key={int.name} style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 9,
                  background: 'var(--el)', border: '1px solid var(--b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  {int.icon}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{int.name}</p>
                  <Badge variant={int.status === 'connected' ? 'success' : 'default'} dot style={{ marginTop: 2 }}>
                    {int.status === 'connected' ? 'Conectado' : 'Disponível'}
                  </Badge>
                </div>
              </div>
              {int.status === 'connected'
                ? <CheckCircle2 size={16} style={{ color: 'var(--grn)', flexShrink: 0 }} />
                : <Clock size={16} style={{ color: 'var(--t3)', flexShrink: 0 }} />
              }
            </div>
            <p style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.5, marginBottom: 12 }}>{int.desc}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {int.status === 'connected' ? (
                <button style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: 'transparent', border: '1px solid var(--b)', color: 'var(--t2)', cursor: 'pointer',
                }}>
                  Configurar
                </button>
              ) : (
                <button style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: 'var(--neon)', border: 'none', color: '#000', cursor: 'pointer',
                }}>
                  Conectar
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
