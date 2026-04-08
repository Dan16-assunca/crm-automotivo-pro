import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Store } from '@/types'

interface AuthState {
  user: User | null
  store: Store | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setStore: (store: Store | null) => void
  setLoading: (loading: boolean) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      store: null,
      isLoading: true,
      setUser: (user) => set({ user }),
      setStore: (store) => set({ store }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null, store: null }),
    }),
    {
      name: 'crm-auth',
      partialize: (state) => ({ user: state.user, store: state.store }),
    }
  )
)
