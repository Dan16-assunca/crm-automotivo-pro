import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { ToastContainer } from '@/components/ui/Toast'

export function Layout() {
  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: 'var(--bg-base)',
    }}>
      <Sidebar />
      <main style={{
        display: 'flex', flexDirection: 'column',
        flex: 1, minWidth: 0, overflow: 'hidden',
      }}>
        <Topbar />
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '20px 20px',
          background: 'var(--bg)',
        }}>
          <Outlet />
        </div>
      </main>
      <ToastContainer />
    </div>
  )
}
