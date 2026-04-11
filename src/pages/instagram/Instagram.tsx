import { Instagram as InstagramIcon, MessageCircle } from 'lucide-react'

export default function Instagram() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)' }}>Instagram DM</h1>
        <p style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Gerencie mensagens diretas do Instagram</p>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '80px 0', gap: 16, textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <InstagramIcon size={28} style={{ color: 'var(--pur)' }} />
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>
            Instagram DM em breve
          </p>
          <p style={{ fontSize: 12, color: 'var(--t3)', maxWidth: 320 }}>
            A integração com Instagram Direct Messages estará disponível em breve.
            Configure sua integração em <a href="/integracoes" style={{ color: 'var(--neon)' }}>Integrações</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
