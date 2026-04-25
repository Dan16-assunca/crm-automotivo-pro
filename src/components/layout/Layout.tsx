import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { BottomTabBar } from './BottomTabBar'
import { MobileTopbar } from './MobileTopbar'
import { ToastContainer } from '@/components/ui/Toast'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAuthStore } from '@/store/authStore'

// Páginas que precisam ser full-screen no mobile (sem padding lateral, sem scroll externo)
const FULLSCREEN_ROUTES = ['/whatsapp']

const LeadPanel = lazy(() => import('@/components/LeadPanel'))

// ─── Trial Banner ─────────────────────────────────────────────────────────────

function TrialBanner() {
  const { store } = useAuthStore()
  const navigate  = useNavigate()

  if (!store) return null

  const status      = store.status ?? 'trial'
  const trialEndsAt = store.trial_ends_at

  if (status === 'active') return null

  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null

  // Só mostra se estiver em trial com ≤ 7 dias, ou suspenso/cancelado
  if (status === 'trial' && (daysLeft === null || daysLeft > 7)) return null

  const isCritical  = status !== 'trial' || (daysLeft !== null && daysLeft <= 3)
  const bgColor     = isCritical ? 'rgba(239,68,68,.12)' : 'rgba(234,179,8,.1)'
  const borderColor = isCritical ? 'rgba(239,68,68,.35)'  : 'rgba(234,179,8,.3)'
  const textColor   = isCritical ? '#EF4444'              : '#EAB308'

  let message = ''
  if (status === 'suspended' || status === 'cancelled') {
    message = 'Conta suspensa — regularize o pagamento para continuar'
  } else if (daysLeft === 0) {
    message = 'Trial encerrado hoje — assine agora para não perder acesso'
  } else {
    message = `${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} de trial restantes`
  }

  return (
    <div style={{
      background: bgColor, borderBottom: `1px solid ${borderColor}`,
      padding: '7px 16px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 12, flexShrink: 0,
    }}>
      <span style={{ fontSize: 12, color: textColor, fontWeight: 600 }}>
        {message}
      </span>
      <button
        onClick={() => navigate('/settings')}
        style={{
          fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 6,
          background: textColor, color: isCritical ? '#fff' : '#000',
          border: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
        }}
      >
        Assinar agora
      </button>
    </div>
  )
}

function GlobalLeadPanel({ fullScreen }: { fullScreen: boolean }) {
  const { open, leadId, mode, initialData, closeLeadPanel } = useLeadPanelStore()
  if (!open) return null
  if (mode === 'view' && !leadId) return null

  return (
    <Suspense fallback={null}>
      <LeadPanel
        leadId={leadId ?? ''}
        onClose={closeLeadPanel}
        mode={mode}
        initialData={initialData}
        fullScreen={fullScreen}
      />
    </Suspense>
  )
}

function MobileLayout() {
  const location = useLocation()
  const isFullScreen = FULLSCREEN_ROUTES.some(r => location.pathname.startsWith(r))

  return (
    <div style={{
      display:    'flex',
      flexDirection: 'column',
      height:     '100dvh',
      background: 'var(--bg)',
      overflow:   'hidden',
    }}>
      <MobileTopbar />
      <TrialBanner />
      <main
        className="scroll-touch"
        style={{
          flex:          1,
          overflowY:     isFullScreen ? 'hidden' : 'auto',
          overflow:      isFullScreen ? 'hidden' : undefined,
          padding:       isFullScreen ? 0 : '12px 14px',
          // Full-screen: só reserva espaço do BottomTabBar (position:fixed)
          // Normal: reserva BottomTabBar + padding extra
          paddingBottom: isFullScreen
            ? 'calc(56px + var(--safe-bottom))'
            : 'calc(72px + var(--safe-bottom))',
          background:    'var(--bg)',
          display:       isFullScreen ? 'flex' : undefined,
          flexDirection: isFullScreen ? 'column' : undefined,
          minHeight:     0,
        }}
      >
        <Outlet />
      </main>
      <BottomTabBar />
      <ToastContainer />
      <GlobalLeadPanel fullScreen />
    </div>
  )
}

function DesktopLayout() {
  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      <Sidebar />
      <main style={{
        display: 'flex', flexDirection: 'column',
        flex: 1, minWidth: 0, overflow: 'hidden',
      }}>
        <Topbar />
        <TrialBanner />
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '14px 18px',
          background: 'var(--bg)',
        }}>
          <Outlet />
        </div>
      </main>
      <ToastContainer />
      <GlobalLeadPanel fullScreen={false} />
    </div>
  )
}

export function Layout() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileLayout /> : <DesktopLayout />
}
