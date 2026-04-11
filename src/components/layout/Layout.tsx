import { Outlet } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ToastContainer } from '@/components/ui/Toast'
import { useLeadPanelStore } from '@/store/leadPanelStore'

const LeadPanel = lazy(() => import('@/components/LeadPanel'))

function GlobalLeadPanel() {
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
      />
    </Suspense>
  )
}

export function Layout() {
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
      <GlobalLeadPanel />
    </div>
  )
}
