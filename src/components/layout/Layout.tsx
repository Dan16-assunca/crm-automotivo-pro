import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { BottomTabBar } from './BottomTabBar'
import { MobileTopbar } from './MobileTopbar'
import { ToastContainer } from '@/components/ui/Toast'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAuthStore } from '@/store/authStore'
import { useVisibilityRefresh, useIdleLogout } from '@/hooks/useAppLifecycle'
import { supabase } from '@/lib/supabase'

const FULLSCREEN_ROUTES = ['/whatsapp']

const LeadPanel = lazy(() => import('@/components/LeadPanel'))

// ─── Trial Banner ─────────────────────────────────────────────────────────────
// Banner de cobrança desativado — acesso 100% gratuito por enquanto
function TrialBanner() { return null }

// ─── Idle Warning Modal ────────────────────────────────────────────────────────
function IdleWarningModal({ secondsLeft, onKeepAlive }: { secondsLeft: number; onKeepAlive: () => void }) {
  const pct = Math.min(100, (secondsLeft / 300) * 100)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'var(--surf)', border: '1px solid var(--bs)',
        borderRadius: 16, padding: '32px 28px', maxWidth: 360, width: '100%',
        boxShadow: '0 24px 80px rgba(0,0,0,.6)', textAlign: 'center',
      }}>
        {/* Countdown ring */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
          background: `conic-gradient(var(--neon) ${pct * 3.6}deg, var(--el) 0deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--surf)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: 'var(--neon)',
            fontFamily: 'var(--fm)',
          }}>
            {secondsLeft}
          </div>
        </div>

        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>
          Sessão prestes a expirar
        </p>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 24, lineHeight: 1.5 }}>
          Você ficou inativo por um tempo.<br />
          Será desconectado em <strong style={{ color: 'var(--neon)' }}>{secondsLeft}s</strong> por segurança.
        </p>

        <button
          onClick={onKeepAlive}
          style={{
            width: '100%', height: 44, borderRadius: 10,
            background: 'var(--neon)', border: 'none',
            color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Continuar usando
        </button>
      </div>
    </div>
  )
}

// ─── App Lifecycle (refresh + idle logout) ────────────────────────────────────
function AppLifecycle() {
  const { logout } = useAuthStore()

  const handleLogout = useCallback(() => {
    logout()
    localStorage.removeItem('crm-auth')
    Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k))
    sessionStorage.clear()
    supabase.auth.signOut().catch(() => {})
    window.location.replace('/login')
  }, [logout])

  // Recarrega a página se ficou em background por mais de 5 min
  useVisibilityRefresh(5 * 60 * 1000)

  // Desloga após 30 min de inatividade (avisa 5 min antes)
  const { showWarning, secondsLeft, keepAlive } = useIdleLogout(handleLogout, 30 * 60 * 1000, 5 * 60 * 1000)

  if (!showWarning) return null
  return <IdleWarningModal secondsLeft={secondsLeft} onKeepAlive={keepAlive} />
}

// ─── Lead Panel ───────────────────────────────────────────────────────────────
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

// ─── Layouts ──────────────────────────────────────────────────────────────────
function MobileLayout() {
  const location = useLocation()
  const isFullScreen = FULLSCREEN_ROUTES.some(r => location.pathname.startsWith(r))

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100dvh', background: 'var(--bg)',
    }}>
      <MobileTopbar />
      <TrialBanner />
      <main
        className="scroll-touch"
        style={{
          flex: 1, minHeight: 0,
          overflowY: isFullScreen ? 'hidden' : 'auto',
          overflowX: 'hidden',
          padding: isFullScreen ? 0 : '12px 14px',
          paddingBottom: isFullScreen
            ? 'calc(56px + var(--safe-bottom))'
            : 'calc(72px + var(--safe-bottom))',
          background: 'var(--bg)',
          display: isFullScreen ? 'flex' : 'block',
          flexDirection: isFullScreen ? 'column' : undefined,
        }}
      >
        <Outlet />
      </main>
      <BottomTabBar />
      <ToastContainer />
      <GlobalLeadPanel fullScreen />
      <AppLifecycle />
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', background: 'var(--bg)' }}>
          <Outlet />
        </div>
      </main>
      <ToastContainer />
      <GlobalLeadPanel fullScreen={false} />
      <AppLifecycle />
    </div>
  )
}

export function Layout() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileLayout /> : <DesktopLayout />
}
