import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { getSlugFromHost, redirectToTenant } from '@/hooks/useTenant'
import type { UserRole } from '@/types'

interface ProtectedRouteProps {
  children: React.ReactNode
  /** Se fornecido, apenas usuários com esses roles podem acessar.
   *  Usuários sem permissão são redirecionados para /dashboard. */
  roles?: UserRole[]
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, isLoading, setLoading } = useAuthStore()

  // Safety net: se loading demorar mais de 8s, força off
  useEffect(() => {
    if (!isLoading) return
    const timer = setTimeout(() => setLoading(false), 8000)
    return () => clearTimeout(timer)
  }, [isLoading, setLoading])

  // Se o usuário está autenticado mas no subdomínio errado, redireciona para o correto.
  // Isso garante isolamento total: cada cliente só acessa o CRM da sua própria loja.
  const storeSlug = (useAuthStore.getState().store as unknown as { slug?: string } | null)?.slug
  const currentSlug = getSlugFromHost()
  if (!isLoading && user && storeSlug && currentSlug && storeSlug !== currentSlug) {
    redirectToTenant(storeSlug, '/dashboard')
    return null
  }

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100dvh', background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          width: 44, height: 44,
          border: '2px solid var(--b)', borderTopColor: 'var(--neon)',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: 'var(--t3)', fontSize: 12 }}>Carregando...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Não autenticado → login
  if (!user) return <Navigate to="/login" replace />

  // Normaliza roles desconhecidos (ex: 'owner') para 'admin'
  const KNOWN_ROLES: UserRole[] = ['admin', 'manager', 'salesperson']
  const effectiveRole: UserRole = KNOWN_ROLES.includes(user.role as UserRole)
    ? (user.role as UserRole)
    : 'admin'

  // Autenticado mas sem o role necessário → dashboard
  if (roles && !roles.includes(effectiveRole)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
