import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'

export interface Permissions {
  role: UserRole
  /** true para admin */
  isAdmin: boolean
  /** true para admin OU manager */
  isManager: boolean
  /** true somente para salesperson */
  isSalesperson: boolean
  /** Retorna true se o role atual está na lista fornecida */
  canAccess: (...roles: UserRole[]) => boolean
}

export function usePermissions(): Permissions {
  const { user, isLoading } = useAuthStore()
  // Durante o carregamento inicial, usa 'admin' para não filtrar a sidebar prematuramente.
  // Quando o perfil carregar, o role real do DB substitui.
  const role = (user?.role ?? (isLoading ? 'admin' : 'salesperson')) as UserRole

  return {
    role,
    isAdmin:       role === 'admin',
    isManager:     role === 'admin' || role === 'manager',
    isSalesperson: role === 'salesperson',
    canAccess:     (...roles) => roles.includes(role),
  }
}
