import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Columns3, Users, MessageCircle, Car,
  Target, BarChart2, Users2, Zap, Settings, LogOut,
  ChevronRight, ChevronDown, ChevronLeft,
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'

const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/pipeline',  icon: Columns3,        label: 'Pipeline' },
      { to: '/leads',     icon: Users,            label: 'Leads' },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { to: '/whatsapp',   icon: MessageCircle, label: 'WhatsApp', dot: true },
      { to: '/estoque',    icon: Car,           label: 'Estoque' },
      { to: '/metas',      icon: Target,        label: 'Metas' },
      { to: '/relatorios', icon: BarChart2,      label: 'Relatórios' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/equipe',        icon: Users2,   label: 'Equipe' },
      { to: '/automacoes',    icon: Zap,      label: 'Automações' },
      { to: '/configuracoes', icon: Settings, label: 'Configurações' },
    ],
  },
]

export function Sidebar() {
  const { theme, toggleTheme, sidebarCollapsed, toggleSidebar } = useUIStore()
  const { store, user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const isDark = theme === 'dark'
  const collapsed = sidebarCollapsed

  const handleLogout = async () => {
    await supabase.auth.signOut()
    logout()
    navigate('/login')
  }

  const w = collapsed ? 60 : 220

  return (
    <aside style={{
      width: w, minWidth: w,
      background: 'var(--bg2)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', flexShrink: 0,
      transition: 'width 0.25s ease, min-width 0.25s ease',
      overflow: 'hidden', position: 'relative', zIndex: 10,
    }}>

      {/* ── Logo ── */}
      <div style={{
        padding: collapsed ? '18px 14px 14px' : '18px 18px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: 'var(--neon-dim)', border: '1px solid var(--neon-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16,
        }}>🚗</div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 18, letterSpacing: 1, lineHeight: 1.1, color: 'var(--text)' }}>
              CRM <span style={{ color: 'var(--neon)' }}>Auto</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text4)', letterSpacing: 1, marginTop: 1 }}>AUTOMOTIVO PRO</div>
          </div>
        )}
      </div>

      {/* ── Store switcher ── */}
      {!collapsed && store && (
        <div style={{
          margin: '10px 10px 0',
          background: 'var(--bg3)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
          transition: 'border-color .15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--neon-border)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <div style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Loja ativa
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
              {store.name}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                fontSize: 9, background: 'var(--neon-dim)', color: 'var(--neon)',
                padding: '2px 6px', borderRadius: 10, fontWeight: 700,
              }}>
                {store.plan?.toUpperCase() ?? 'PRO'}
              </span>
              <ChevronDown size={12} style={{ color: 'var(--text4)' }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', paddingTop: 12 }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 18 }}>
            {!collapsed && (
              <div style={{
                fontSize: 9, color: 'var(--text4)', textTransform: 'uppercase',
                letterSpacing: '1.5px', padding: '0 8px 6px', fontWeight: 700,
              }}>
                {group.label}
              </div>
            )}
            {collapsed && (
              <div style={{ width: '100%', height: 1, background: 'var(--border)', margin: '0 0 6px' }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center',
                    gap: collapsed ? 0 : 9,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    padding: collapsed ? '8px' : '8px 10px',
                    borderRadius: 7, cursor: 'pointer',
                    fontSize: 12, fontWeight: 500,
                    textDecoration: 'none', marginBottom: 1,
                    position: 'relative',
                    background: isActive ? 'var(--neon-dim)' : 'transparent',
                    color: isActive ? 'var(--neon)' : 'var(--text3)',
                    border: isActive ? '1px solid var(--neon-border)' : '1px solid transparent',
                    transition: 'all .15s',
                  })}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    if (!el.className.includes('active')) {
                      el.style.background = 'var(--bg3)'
                      el.style.color = 'var(--text2)'
                    }
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    if (!el.style.borderColor.includes('neon')) {
                      el.style.background = 'transparent'
                      el.style.color = 'var(--text3)'
                    }
                  }}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        size={15}
                        strokeWidth={isActive ? 2 : 1.75}
                        style={{ color: isActive ? 'var(--neon)' : 'inherit', flexShrink: 0 }}
                      />
                      {!collapsed && (
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.label}
                        </span>
                      )}
                      {item.dot && !collapsed && (
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: 'var(--neon)', flexShrink: 0,
                          animation: 'pulse-dot 2s ease-in-out infinite',
                        }} />
                      )}
                      {item.dot && collapsed && (
                        <span style={{
                          position: 'absolute', top: 6, right: 6,
                          width: 5, height: 5, borderRadius: '50%',
                          background: 'var(--neon)',
                        }} />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom ── */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: collapsed ? '7px 8px' : '7px 10px',
            borderRadius: 8, cursor: 'pointer',
            background: 'var(--bg3)', border: '1px solid var(--border)',
            transition: 'all .15s', fontSize: 11, fontWeight: 600,
            color: 'var(--text3)', justifyContent: collapsed ? 'center' : 'flex-start',
            width: '100%',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--neon-border)'; e.currentTarget.style.color = 'var(--neon)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)' }}
          title={collapsed ? (isDark ? 'Modo claro' : 'Modo escuro') : undefined}
        >
          {/* Track */}
          <div style={{
            width: 32, height: 18, borderRadius: 9, flexShrink: 0,
            background: isDark ? 'var(--border2)' : 'var(--neon)',
            position: 'relative', transition: 'background .2s',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: isDark ? 2 : 14,
              width: 14, height: 14, borderRadius: '50%',
              background: '#fff', transition: 'left .2s',
              boxShadow: '0 1px 3px #0003',
            }} />
          </div>
          {!collapsed && <span>{isDark ? 'Modo Escuro' : 'Modo Claro'}</span>}
        </button>

        {/* User card */}
        {user && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: collapsed ? '8px' : '8px 10px',
                borderRadius: 8, background: 'var(--bg3)', cursor: 'pointer',
                border: 'none', width: '100%', textAlign: 'left',
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'background .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg4)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg3)')}
            >
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: 'var(--neon-dim)', border: '1px solid var(--neon-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--neon)',
              }}>
                {user.full_name?.slice(0, 2).toUpperCase() ?? 'AD'}
              </div>
              {!collapsed && (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user.full_name?.split(' ')[0] ?? 'Usuário'}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text4)', textTransform: 'capitalize' }}>
                      {user.role ?? 'admin'}
                    </div>
                  </div>
                  <Settings size={12} style={{ color: 'var(--text4)', flexShrink: 0 }} />
                </>
              )}
            </button>

            {/* User menu */}
            {showUserMenu && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
                width: 200, background: 'var(--bg2)', border: '1px solid var(--border2)',
                borderRadius: 10, padding: 8, zIndex: 50,
              }}
                onMouseLeave={() => setShowUserMenu(false)}
              >
                {[
                  { label: '⚙️ Configurações', to: '/configuracoes' },
                  { label: '👤 Meu perfil', to: '/configuracoes' },
                ].map(item => (
                  <div key={item.label}
                    onClick={() => { navigate(item.to); setShowUserMenu(false) }}
                    style={{
                      padding: '8px 10px', borderRadius: 6, fontSize: 12,
                      cursor: 'pointer', color: 'var(--text2)', transition: 'background .15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg3)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {item.label}
                  </div>
                ))}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <div
                  onClick={handleLogout}
                  style={{
                    padding: '8px 10px', borderRadius: 6, fontSize: 12,
                    cursor: 'pointer', color: 'var(--red)', transition: 'background .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,68,68,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <LogOut size={12} style={{ display: 'inline', marginRight: 7, verticalAlign: 'middle' }} />
                  Sair da conta
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-end',
            gap: 4, padding: '5px 10px', borderRadius: 7, border: 'none',
            background: 'transparent', color: 'var(--text4)', cursor: 'pointer',
            fontSize: 11, width: '100%', transition: 'color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text2)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text4)')}
        >
          {collapsed
            ? <ChevronRight size={14} />
            : <><span>Recolher</span><ChevronLeft size={14} /></>
          }
        </button>
      </div>
    </aside>
  )
}
