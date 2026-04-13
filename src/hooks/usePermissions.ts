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

const KNOWN_ROLES: UserRole[] = ['admin', 'manager', 'salesperson']

export function usePermissions(): Permissions {
  const { user, isLoading } = useAuthStore()
  // Normaliza roles desconhecidos (ex: 'owner') para 'admin'.
  // Durante o carregamento usa 'admin' para não filtrar a sidebar prematuramente.
  const rawRole = user?.role as string | undefined
  const role: UserRole = !user
    ? (isLoading ? 'admin' : 'salesperson')
    : KNOWN_ROLES.includes(rawRole as UserRole)
      ? (rawRole as UserRole)
      : 'admin'

  return {
    role,
    isAdmin:       role === 'admin',
    isManager:     role === 'admin' || role === 'manager',
    isSalesperson: role === 'salesperson',
    canAccess:     (...roles) => roles.includes(role),
  }
}
