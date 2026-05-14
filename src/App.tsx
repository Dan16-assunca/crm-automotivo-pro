import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import * as Sentry from '@sentry/react'
import { useAuth } from '@/hooks/useAuth'
import { useUIStore } from '@/store/uiStore'
import { Layout } from '@/components/layout/Layout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { ToastContainer } from '@/components/ui/Toast'
import { isOnTenantSubdomain } from '@/hooks/useTenant'

// Lazy pages
const Landing = lazy(() => import('@/pages/landing/Landing'))
const Login = lazy(() => import('@/pages/auth/Login'))
const Register = lazy(() => import('@/pages/auth/Register'))
const Onboarding = lazy(() => import('@/pages/onboarding/Onboarding'))
const InviteAccept = lazy(() => import('@/pages/auth/InviteAccept'))
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
const FlowBuilderPage = lazy(() => import('@/pages/automations/FlowBuilderPage'))
const Settings = lazy(() => import('@/pages/settings/Settings'))
const Calculator = lazy(() => import('@/pages/calculator/Calculator'))
const Integrations = lazy(() => import('@/pages/integrations/Integrations'))
const Analytics = lazy(() => import('@/pages/analytics/Analytics'))
const Instagram = lazy(() => import('@/pages/instagram/Instagram'))
const Planos = lazy(() => import('@/pages/planos/Planos'))
const Privacy = lazy(() => import('@/pages/landing/Privacy'))
const Terms = lazy(() => import('@/pages/landing/Terms'))

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
          <Route path="/registro" element={<Register />} />
          <Route path="/convite" element={<InviteAccept />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/privacidade" element={<Privacy />} />
          <Route path="/termos" element={<Terms />} />

          {/* Landing page — exibida no domínio raiz (não em subdomínios de tenant) */}
          {!isOnTenantSubdomain() && (
            <Route path="/" element={<Landing />} />
          )}

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
            <Route path="automacoes/:flowId" element={<FlowBuilderPage />} />
            <Route path="equipe" element={
              <ProtectedRoute roles={['admin', 'manager']}><Team /></ProtectedRoute>
            } />
            <Route path="configuracoes" element={
              <ProtectedRoute roles={['admin']}><Settings /></ProtectedRoute>
            } />
            <Route path="calculadora" element={<Calculator />} />
            <Route path="integracoes" element={<Integrations />} />
            <Route path="onboarding" element={<Onboarding />} />
            <Route path="planos" element={<Planos />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
      <ToastContainer />
    </BrowserRouter>
  )
}

function SentryFallback({ error }: { error: unknown }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24, fontFamily: 'var(--fn)', background: 'var(--bg)', gap: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', margin: 0 }}>Algo deu errado</h1>
      <p style={{ fontSize: 14, color: 'var(--t3)', maxWidth: 360, lineHeight: 1.7, margin: 0 }}>
        Ocorreu um erro inesperado. Nossa equipe já foi notificada. Tente recarregar a página.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ background: 'var(--neon)', color: '#000', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
      >
        Recarregar página
      </button>
      {import.meta.env.DEV && error instanceof Error && (
        <pre style={{ fontSize: 11, color: 'rgba(255,100,100,.8)', background: 'rgba(255,0,0,.05)', border: '1px solid rgba(255,0,0,.15)', borderRadius: 8, padding: 16, maxWidth: 600, overflow: 'auto', textAlign: 'left' }}>
          {error.message}
        </pre>
      )}
    </div>
  )
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={SentryFallback} showDialog={false}>
      <QueryClientProvider client={queryClient}>
        <AppInner />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  )
}
