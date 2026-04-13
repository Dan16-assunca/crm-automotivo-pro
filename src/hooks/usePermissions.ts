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
  const { user } = useAuthStore()
  const role = (user?.role ?? 'salesperson') as UserRole

  return {
    role,
    isAdmin:       role === 'admin',
    isManager:     role === 'admin' || role === 'manager',
    isSalesperson: role === 'salesperson',
    canAccess:     (...roles) => roles.includes(role),
  }
}
