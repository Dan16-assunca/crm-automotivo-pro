import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Car, Plus,
  LayoutDashboard, BarChart2, Target, Settings,
  Users, Link2, Calculator, LogOut, ChevronDown, X,
  Zap,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { QuickAddLeadSheet } from '@/components/mobile/QuickAddLeadSheet'
import { supabase } from '@/lib/supabase'

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

// ── Menu items ─────────────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { label: 'Dashboard',       icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Analytics',       icon: BarChart2,        path: '/analytics' },
  { label: 'Metas',           icon: Target,           path: '/metas' },
  { label: 'Automações',      icon: Zap,              path: '/automacoes' },
  { label: 'Equipe',          icon: Users,            path: '/equipe' },
  { label: 'Integrações',     icon: Link2,            path: '/integracoes' },
  { label: 'Calculadora',     icon: Calculator,       path: '/calculadora' },
  { label: 'Configurações',   icon: Settings,         path: '/configuracoes' },
]

export function MobileTopbar() {
  const location   = useLocation()
  const navigate   = useNavigate()
  const { user, store, logout } = useAuthStore()

  const [sheetOpen,   setSheetOpen]   = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const title = getTitle(location.pathname)

  // Fecha ao clicar fora
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleLogout = () => {
    logout()
    localStorage.removeItem('crm-auth')
    Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k))
    sessionStorage.clear()
    supabase.auth.signOut().catch(() => {})
    window.location.replace('/login')
  }

  const handleNavigate = (path: string) => {
    setMenuOpen(false)
    navigate(path)
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  return (
    <>
      <header style={{
        height:               `calc(44px + var(--safe-top))`,
        paddingTop:           'var(--safe-top)',
        background:           'rgba(8,8,8,0.92)',
        backdropFilter:       'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom:         '1px solid var(--bs)',
        display:              'flex',
        alignItems:           'flex-end',
        justifyContent:       'space-between',
        paddingLeft:          16,
        paddingRight:         16,
        paddingBottom:        8,
        position:             'sticky',
        top:                  0,
        zIndex:               50,
        flexShrink:           0,
      }}>
        {/* Logo + título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--ng)', border: '1px solid var(--nb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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
              width: 34, height: 34, borderRadius: '50%',
              background: 'var(--neon)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 12px rgba(61,247,16,.4)',
            }}
          >
            <Plus size={18} style={{ color: '#000' }} />
          </button>

          {/* Avatar — abre o menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: menuOpen ? 'var(--ng)' : 'var(--el2)',
                border: menuOpen ? '1px solid var(--nb)' : '1px solid var(--b)',
                borderRadius: 20, padding: '3px 6px 3px 3px',
                cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--ng)', border: '1px solid var(--nb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: 'var(--neon)',
              }}>
                {initials}
              </div>
              <ChevronDown
                size={12}
                style={{
                  color: 'var(--t2)',
                  transform: menuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform .2s',
                }}
              />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                width: 230, background: 'var(--surf)',
                border: '1px solid var(--bs)', borderRadius: 14,
                boxShadow: '0 16px 48px rgba(0,0,0,.6)',
                overflow: 'hidden', zIndex: 200,
                animation: 'fadeSlideDown .15s ease',
              }}>

                {/* Cabeçalho do menu — info do usuário */}
                <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--bs)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>
                        {user?.full_name ?? 'Usuário'}
                      </p>
                      <p style={{
                        fontSize: 10, color: 'var(--t3)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150,
                      }}>
                        {store?.name ?? user?.email ?? ''}
                      </p>
                    </div>
                    <button
                      onClick={() => setMenuOpen(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--t3)' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Itens de navegação */}
                <div style={{ padding: '6px 0' }}>
                  {MENU_ITEMS.map(item => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
                    return (
                      <button
                        key={item.path}
                        onClick={() => handleNavigate(item.path)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 16px', background: isActive ? 'var(--ng)' : 'transparent',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                          borderLeft: isActive ? '2px solid var(--neon)' : '2px solid transparent',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--el)' }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                      >
                        <Icon size={15} style={{ color: isActive ? 'var(--neon)' : 'var(--t3)', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: isActive ? 'var(--neon)' : 'var(--t)', fontWeight: isActive ? 600 : 400 }}>
                          {item.label}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Separador + Sair */}
                <div style={{ borderTop: '1px solid var(--bs)', padding: '6px 0 8px' }}>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 16px', background: 'transparent', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <LogOut size={15} style={{ color: '#f87171', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#f87171' }}>Sair da conta</span>
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>
      </header>

      <style>{`
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <QuickAddLeadSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
