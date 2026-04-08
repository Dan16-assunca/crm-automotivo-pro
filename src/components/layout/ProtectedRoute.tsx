import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, setLoading } = useAuthStore()

  // Safety net: if loading takes more than 8 seconds, force it off
  useEffect(() => {
    if (!isLoading) return
    const timer = setTimeout(() => setLoading(false), 8000)
    return () => clearTimeout(timer)
  }, [isLoading, setLoading])

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{
          width: 44,
          height: 44,
          border: '2px solid var(--border-strong)',
          borderTopColor: 'var(--neon)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
