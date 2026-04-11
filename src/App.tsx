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
const InventoryIntelligence = lazy(() => import('@/pages/inventory/InventoryIntelligence'))
const WhatsApp = lazy(() => import('@/pages/whatsapp/WhatsApp'))
const Reports = lazy(() => import('@/pages/reports/Reports'))
const Goals = lazy(() => import('@/pages/goals/Goals'))
const Clients = lazy(() => import('@/pages/clients/Clients'))
const Team = lazy(() => import('@/pages/team/Team'))
const Automations = lazy(() => import('@/pages/automations/Automations'))
const Settings = lazy(() => import('@/pages/settings/Settings'))
const Calculator = lazy(() => import('@/pages/calculator/Calculator'))
const Integrations = lazy(() => import('@/pages/integrations/Integrations'))
const Analytics = lazy(() => import('@/pages/analytics/Analytics'))
const Instagram = lazy(() => import('@/pages/instagram/Instagram'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 min — não rebusca dados que não mudaram
      gcTime:    1000 * 60 * 10,  // 10 min — mantém no cache mesmo sem observers
      retry: 1,
      refetchOnWindowFocus: false, // não rebusca ao trocar de aba
      refetchOnMount: false,       // usa cache se staleTime não expirou
    },
  },
})

function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--neon)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
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
            <Route path="inteligencia" element={<InventoryIntelligence />} />
            <Route path="whatsapp" element={<WhatsApp />} />
            <Route path="instagram" element={<Instagram />} />
            <Route path="relatorios" element={<Reports />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="metas" element={<Goals />} />
            <Route path="automacoes" element={<Automations />} />
            <Route path="equipe" element={<Team />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="calculadora" element={<Calculator />} />
            <Route path="integracoes" element={<Integrations />} />
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
