import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useUIStore } from '@/store/uiStore'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { ToastContainer } from '@/components/ui/Toast'

// Lazy pages
const Login = lazy(() => import('@/pages/auth/Login'))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'))
const Dashboard = lazy(() => import('@/pages/dashboard/Dashboard'))
const Pipeline = lazy(() => import('@/pages/pipeline/Pipeline'))
const Leads = lazy(() => import('@/pages/leads/Leads'))
const Inventory = lazy(() => import('@/pages/inventory/Inventory'))
const WhatsApp = lazy(() => import('@/pages/whatsapp/WhatsApp'))
const Reports = lazy(() => import('@/pages/reports/Reports'))
const Goals = lazy(() => import('@/pages/goals/Goals'))
const Clients = lazy(() => import('@/pages/clients/Clients'))
const Team = lazy(() => import('@/pages/team/Team'))
const Automations = lazy(() => import('@/pages/automations/Automations'))
const Settings = lazy(() => import('@/pages/settings/Settings'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 min
      retry: 1,
    },
  },
})

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-[#39FF14] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AppInner() {
  useAuth()
  const { theme } = useUIStore()

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
  }, [theme])

  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="leads" element={<Leads />} />
            <Route path="clientes" element={<Clients />} />
            <Route path="estoque" element={<Inventory />} />
            <Route path="whatsapp" element={<WhatsApp />} />
            <Route path="relatorios" element={<Reports />} />
            <Route path="metas" element={<Goals />} />
            <Route path="automacoes" element={<Automations />} />
            <Route path="equipe" element={<Team />} />
            <Route path="configuracoes" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <ToastContainer />
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
