import { Outlet } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { BottomTabBar } from './BottomTabBar'
import { MobileTopbar } from './MobileTopbar'
import { ToastContainer } from '@/components/ui/Toast'
import { useLeadPanelStore } from '@/store/leadPanelStore'
import { useIsMobile } from '@/hooks/useIsMobile'

const LeadPanel = lazy(() => import('@/components/LeadPanel'))

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
  return (
    <div style={{
      display:    'flex',
      flexDirection: 'column',
      height:     '100dvh',
      background: 'var(--bg)',
      overflow:   'hidden',
    }}>
      <MobileTopbar />
      <main
        className="scroll-touch"
        style={{
          flex:        1,
          overflowY:   'auto',
          padding:     '12px 14px',
          paddingBottom: 'calc(72px + var(--safe-bottom))',
          background:  'var(--bg)',
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
