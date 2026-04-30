import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Car, Columns3, MessageCircle, TrendingUp } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useAuthStore } from '@/store/authStore'

const TABS = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Início'      },
  { to: '/leads',        icon: Users,           label: 'Leads'       },
  { to: '/estoque',      icon: Car,             label: 'Estoque'     },
  { to: '/inteligencia', icon: TrendingUp,      label: 'Intel. Est.', roles: ['admin','manager'] as string[] },
  { to: '/pipeline',     icon: Columns3,        label: 'Pipeline'    },
  { to: '/whatsapp',     icon: MessageCircle,   label: 'Chat'        },
]

async function hapticTap() {
  if (Capacitor.isNativePlatform()) {
    await Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  }
}

export function BottomTabBar() {
  const location = useLocation()
  const { user } = useAuthStore()
  if (!user) return null

  const visibleTabs = TABS.filter(t => !t.roles || t.roles.includes(user.role ?? ''))

  return (
    <nav
      style={{
        position:        'fixed',
        bottom:          0,
        left:            0,
        right:           0,
        height:          `calc(56px + var(--safe-bottom))`,
        paddingBottom:   'var(--safe-bottom)',
        background:      'rgba(8,8,8,0.92)',
        backdropFilter:  'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop:       '1px solid var(--bs)',
        display:         'flex',
        zIndex:          100,
      }}
    >
      {visibleTabs.map(({ to, icon: Icon, label }) => {
        const isActive = location.pathname === to ||
          (to !== '/dashboard' && location.pathname.startsWith(to))

        return (
          <NavLink
            key={to}
            to={to}
            onClick={hapticTap}
            style={{
              flex:           1,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            3,
              textDecoration: 'none',
              color:          isActive ? 'var(--neon)' : 'var(--t3)',
              paddingTop:     4,
              position:       'relative',
              transition:     'color 0.15s',
            }}
          >
            {/* Indicador ativo acima do ícone */}
            {isActive && (
              <span style={{
                position:     'absolute',
                top:          0,
                left:         '50%',
                transform:    'translateX(-50%)',
                width:        24,
                height:       2,
                borderRadius: 2,
                background:   'var(--neon)',
                boxShadow:    '0 0 6px var(--neon)',
              }} />
            )}
            <Icon
              size={22}
              style={{
                filter: isActive ? 'drop-shadow(0 0 4px var(--neon))' : 'none',
              }}
            />
            <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 500, letterSpacing: '.04em' }}>
              {label}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}
