import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Columns3, Users, MessageCircle,
  Car, Target, Settings, LogOut,
  ChevronDown, ChevronLeft, ChevronRight,
  TrendingUp, Calculator, BarChart2, Zap, Plug,
} from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { supabase as sb } from '@/lib/supabase'

type NavItem = {
  to: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>
  label: string
  badgeKey?: string
  dot?: boolean
}
type NavGroup = { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/pipeline',   icon: Columns3,         label: 'Pipeline' },
      { to: '/leads',      icon: Users,             label: 'Leads', badgeKey: 'leads' },
    ],
  },
  {
    label: 'Comunicação',
    items: [
      { to: '/whatsapp', icon: MessageCircle, label: 'WhatsApp', dot: true },
    ],
  },
  {
    label: 'Vendas',
    items: [
      { to: '/estoque',      icon: Car,         label: 'Estoque' },
      { to: '/inteligencia', icon: TrendingUp,  label: 'Inteligência de Estoque' },
      { to: '/metas',        icon: Target,      label: 'Metas' },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      { to: '/calculadora',  icon: Calculator,  label: 'Calculadora de Negócio' },
      { to: '/analytics',    icon: BarChart2,   label: 'Analytics' },
      { to: '/automacoes',   icon: Zap,         label: 'Automações & Régua' },
      { to: '/integracoes',  icon: Plug,        label: 'Integrações' },
      { to: '/configuracoes',icon: Settings,    label: 'Configurações' },
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

  // Badge counts
  const { data: leadsCount } = useQuery({
    queryKey: ['sidebar-leads-count', store?.id],
    queryFn: async () => {
      if (!store?.id) return 0
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('store_id', store.id).eq('status', 'active').gte('created_at', since)
      return count ?? 0
    },
    enabled: !!store?.id,
    staleTime: 60000,
  })

  const handleLogout = () => {
    // Clear state and storage first — don't wait for network
    logout()
    localStorage.removeItem('crm-auth')
    Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k))
    sessionStorage.clear()
    // Fire signOut in background (best-effort server invalidation)
    sb.auth.signOut().catch(() => {})
    window.location.replace('/login')
  }

  const w = collapsed ? 58 : 230

  const aside: React.CSSProperties = {
    width: w, minWidth: w,
    background: 'var(--surf)',
    borderRight: '1px solid var(--bs)',
    display: 'flex', flexDirection: 'column',
    height: '100vh', flexShrink: 0,
    transition: 'width .22s ease, min-width .22s ease',
    overflow: 'hidden', position: 'relative', zIndex: 10,
  }

  const niStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center',
    gap: collapsed ? 0 : 8,
    justifyContent: collapsed ? 'center' : 'flex-start',
    padding: collapsed ? '7px 0' : '7px 9px',
    borderRadius: 6, cursor: 'pointer',
    fontSize: 12, fontWeight: 500,
    textDecoration: 'none', marginBottom: 1,
    position: 'relative',
    background: isActive ? 'var(--ng)' : 'transparent',
    color: isActive ? 'var(--neon)' : 'var(--t2)',
    borderLeft: isActive ? '2px solid var(--neon)' : '2px solid transparent',
    transition: 'all .15s',
  })

  const badges: Record<string, number> = {
    leads: leadsCount ?? 0,
  }

  return (
    <aside style={aside}>
      {/* ── Logo ── */}
      <div style={{
        padding: collapsed ? '16px 0' : '14px 14px 12px',
        borderBottom: '1px solid var(--bs)',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 9,
      }}>
        {/* Car icon */}
        <div style={{
          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
          background: 'var(--ng)', border: '1px solid var(--nb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--neon)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" />
            <rect x="7" y="14" width="10" height="6" rx="2" />
            <path d="m5 9 1.5-5h11L19 9" />
            <circle cx="7.5" cy="17.5" r="1.5" />
            <circle cx="16.5" cy="17.5" r="1.5" />
          </svg>
        </div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1 }}>
              <span style={{ fontFamily: 'var(--fn)', fontSize: 17, fontWeight: 800, letterSpacing: '.04em', color: 'var(--t)' }}>
                CRM<span style={{ color: 'var(--neon)' }}>AUTO</span>
              </span>
              <span style={{
                fontSize: 8, fontWeight: 700, color: '#000',
                background: 'var(--neon)', padding: '1px 4px', borderRadius: 3,
                letterSpacing: '.04em', lineHeight: 1.6,
              }}>PRO</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--t3)', letterSpacing: '.1em', marginTop: 2 }}>SEMINOVOS</div>
          </div>
        )}
      </div>

      {/* ── Store row ── */}
      {!collapsed && store && (
        <div style={{
          margin: '9px 10px 0',
          background: 'var(--el)', border: '1px solid var(--b)',
          borderRadius: 7, padding: '7px 9px', cursor: 'pointer',
          transition: 'border-color .15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--nb)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--b)')}
        >
          <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>
            Loja ativa
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 5, flexShrink: 0,
              background: 'var(--ng)', border: '1px solid var(--nb)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: 'var(--neon)',
            }}>
              {store.name?.slice(0, 2).toUpperCase() ?? 'CR'}
            </div>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {store.name}
            </span>
            <span style={{
              fontSize: 8, background: 'var(--ng)', color: 'var(--neon)',
              padding: '1px 5px', borderRadius: 10, fontWeight: 700, flexShrink: 0,
            }}>
              {store.plan?.toUpperCase() ?? 'PRO'}
            </span>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '10px 6px' : '10px 8px', overflowX: 'hidden' }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 12 }}>
            {!collapsed && (
              <div style={{
                fontSize: 9, fontWeight: 700, color: 'var(--t3)',
                textTransform: 'uppercase', letterSpacing: '.12em',
                padding: '0 9px 5px', marginTop: 2,
              }}>{group.label}</div>
            )}
            {collapsed && (
              <div style={{ width: '100%', height: 1, background: 'var(--bs)', margin: '0 0 6px' }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.items.map((item) => {
                const badgeCount = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    style={({ isActive }) => niStyle(isActive)}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      if (el.style.color !== 'var(--neon)') {
                        el.style.background = 'var(--el)'
                        el.style.color = 'var(--t)'
                      }
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      if (el.getAttribute('aria-current') !== 'page') {
                        el.style.background = 'transparent'
                        el.style.color = 'var(--t2)'
                      }
                    }}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          size={14}
                          strokeWidth={isActive ? 2.2 : 1.75}
                          style={{ color: isActive ? 'var(--neon)' : 'var(--t3)', flexShrink: 0, width: 18 }}
                        />
                        {!collapsed && (
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5 }}>
                            {item.label}
                          </span>
                        )}
                        {/* Badge */}
                        {badgeCount > 0 && !collapsed && (
                          <span style={{
                            background: '#F43F5E', color: '#fff',
                            fontSize: 9, fontWeight: 700,
                            padding: '1px 5px', borderRadius: 10, flexShrink: 0,
                          }}>{badgeCount}</span>
                        )}
                        {badgeCount > 0 && collapsed && (
                          <span style={{
                            position: 'absolute', top: 4, right: 4,
                            width: 7, height: 7, borderRadius: '50%',
                            background: '#F43F5E',
                          }} />
                        )}
                        {/* Dot indicator (WhatsApp) */}
                        {item.dot && badgeCount === 0 && !collapsed && (
                          <span style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: 'var(--neon)', flexShrink: 0,
                            animation: 'pulse-dot 2s ease-in-out infinite',
                          }} />
                        )}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom ── */}
      <div style={{ padding: '7px 8px', borderTop: '1px solid var(--bs)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={collapsed ? (isDark ? 'Modo claro' : 'Modo escuro') : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: collapsed ? '7px 0' : '7px 9px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 6, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--b)',
            fontSize: 11, fontWeight: 600, color: 'var(--t3)',
            width: '100%', transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--nb)'; e.currentTarget.style.color = 'var(--neon)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b)'; e.currentTarget.style.color = 'var(--t3)' }}
        >
          <div style={{
            width: 32, height: 18, borderRadius: 9, flexShrink: 0,
            background: isDark ? 'var(--b)' : 'var(--neon)',
            position: 'relative', transition: 'background .2s',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: isDark ? 2 : 14,
              width: 14, height: 14, borderRadius: '50%',
              background: '#fff', transition: 'left .2s',
            }} />
          </div>
          {!collapsed && <span>{isDark ? 'Modo Escuro' : 'Modo Claro'}</span>}
        </button>

        {/* User / store footer */}
        {user && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: collapsed ? '7px 0' : '7px 9px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 6, background: 'transparent', cursor: 'pointer',
                border: 'none', width: '100%', textAlign: 'left',
                transition: 'background .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--ng)', border: '1.5px solid var(--nb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: 'var(--neon)',
              }}>
                {(store?.name ?? user.full_name ?? 'SP').slice(0, 2).toUpperCase()}
              </div>
              {!collapsed && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {store?.name ?? user.full_name ?? 'Loja'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--t3)' }}>
                    Plano {store?.plan?.toUpperCase() ?? 'Pro'} · Ativo
                  </div>
                </div>
              )}
            </button>

            {showUserMenu && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
                width: 196, background: 'var(--card)', border: '1px solid var(--b)',
                borderRadius: 10, padding: 6, zIndex: 50,
                boxShadow: '0 8px 24px rgba(0,0,0,.5)',
              }}
                onMouseLeave={() => setShowUserMenu(false)}
              >
                {[
                  { label: '⚙️ Configurações', to: '/configuracoes' },
                  { label: '👤 Meu perfil',    to: '/configuracoes' },
                ].map(item => (
                  <div key={item.label}
                    onClick={() => { navigate(item.to); setShowUserMenu(false) }}
                    style={{
                      padding: '7px 10px', borderRadius: 6, fontSize: 12,
                      cursor: 'pointer', color: 'var(--t2)', transition: 'background .12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--el)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {item.label}
                  </div>
                ))}
                <div style={{ height: 1, background: 'var(--bs)', margin: '4px 0' }} />
                <div
                  onClick={handleLogout}
                  style={{
                    padding: '7px 10px', borderRadius: 6, fontSize: 12,
                    cursor: 'pointer', color: 'var(--red)', transition: 'background .12s',
                    display: 'flex', alignItems: 'center', gap: 7,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(244,63,94,.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <LogOut size={12} /> Sair da conta
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          style={{
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-end',
            gap: 4, padding: '4px 9px', borderRadius: 6, border: 'none',
            background: 'transparent', color: 'var(--t3)', cursor: 'pointer',
            fontSize: 11, width: '100%', transition: 'color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--t2)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
        >
          {collapsed
            ? <ChevronRight size={13} />
            : <><span>Recolher</span><ChevronLeft size={13} /></>
          }
        </button>
      </div>
    </aside>
  )
}
