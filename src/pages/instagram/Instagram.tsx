import { Instagram as InstagramIcon, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Instagram() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Instagram DM</h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Gerencie mensagens diretas do Instagram</p>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '60px 24px', gap: 20, textAlign: 'center',
        background: 'var(--ng)', border: '1px solid var(--nb)', borderRadius: 14,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'var(--ng)', border: '1px solid var(--nb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <InstagramIcon size={28} style={{ color: 'var(--neon)' }} />
        </div>

        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>
            Instagram DM — Em desenvolvimento
          </p>
          <p style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 380, lineHeight: 1.7 }}>
            A integração com Instagram Direct Messages está no roadmap. Quando disponível, você poderá gerenciar DMs do Instagram diretamente no CRM, assim como já faz com o WhatsApp.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', marginTop: 8 }}>
          <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>
            Por enquanto, capture leads do Instagram via:
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: '8px 16px', fontSize: 12, color: 'var(--t3)' }}>
              📢 Meta Lead Ads (Instagram)
            </div>
            <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8, padding: '8px 16px', fontSize: 12, color: 'var(--t3)' }}>
              💬 WhatsApp Business
            </div>
          </div>
          <Link to="/integracoes" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 8, fontSize: 13, fontWeight: 600,
            color: 'var(--neon)', textDecoration: 'none',
          }}>
            Ver integrações disponíveis <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}
