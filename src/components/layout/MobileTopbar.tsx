import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Car, Bell, Plus } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { QuickAddLeadSheet } from '@/components/mobile/QuickAddLeadSheet'

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/pipeline':     'Pipeline',
  '/leads':        'Leads',
  '/whatsapp':     'WhatsApp',
  '/estoque':      'Estoque',
  '/clientes':     'Clientes',
  '/relatorios':   'Relatórios',
  '/analytics':    'Analytics',
  '/metas':        'Metas',
  '/automacoes':   'Automações',
  '/equipe':       'Equipe',
  '/configuracoes':'Configurações',
  '/calculadora':  'Calculadora',
  '/integracoes':  'Integrações',
}

function getTitle(pathname: string): string {
  for (const [key, val] of Object.entries(ROUTE_TITLES)) {
    if (pathname === key || pathname.startsWith(key + '/')) return val
  }
  return 'CRM Auto'
}

export function MobileTopbar() {
  const location  = useLocation()
  const { user }  = useAuthStore()
  const [sheetOpen, setSheetOpen] = useState(false)

  const title = getTitle(location.pathname)

  return (
    <>
      <header style={{
        height:          `calc(44px + var(--safe-top))`,
        paddingTop:      'var(--safe-top)',
        background:      'rgba(8,8,8,0.92)',
        backdropFilter:  'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom:    '1px solid var(--bs)',
        display:         'flex',
        alignItems:      'flex-end',
        justifyContent:  'space-between',
        paddingLeft:     16,
        paddingRight:    16,
        paddingBottom:   8,
        position:        'sticky',
        top:             0,
        zIndex:          50,
        flexShrink:      0,
      }}>
        {/* Logo mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width:        30,
            height:       30,
            borderRadius: 8,
            background:   'var(--ng)',
            border:       '1px solid var(--nb)',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
          }}>
            <Car size={16} style={{ color: 'var(--neon)' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>
            {title}
          </span>
        </div>

        {/* Ações direita */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Botão "+" cadastro rápido */}
          <button
            onClick={() => setSheetOpen(true)}
            style={{
              width:        34,
              height:       34,
              borderRadius: '50%',
              background:   'var(--neon)',
              border:       'none',
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              boxShadow:    '0 0 12px rgba(61,247,16,.4)',
            }}
          >
            <Plus size={18} style={{ color: '#000' }} />
          </button>

          {/* Avatar */}
          <div style={{
            width:        32,
            height:       32,
            borderRadius: '50%',
            background:   'var(--el2)',
            border:       '1px solid var(--b)',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            fontSize:     12,
            fontWeight:   700,
            color:        'var(--t2)',
          }}>
            {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
        </div>
      </header>

      <QuickAddLeadSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
