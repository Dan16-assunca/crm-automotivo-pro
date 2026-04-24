import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import type { Store } from '@/types'

async function loadProfile(userId: string) {
  const { data: profile } = await supabase
    .from('users')
    .select('*, stores(*)')
    .eq('id', userId)
    .single()
  return profile
}

/**
 * Aplica o store vindo do DB no Zustand fazendo MERGE, nunca replace.
 * Preserva whatsapp_instance do Zustand se for diferente do que o DB retornou —
 * isso protege contra o caso em que useAuth dispara (TOKEN_REFRESHED, troca de aba)
 * após o usuário conectar uma instância nova mas antes de o DB receber o update.
 */
function applyStore(
  incoming: Store | null | undefined,
  setStore: (s: Store | null) => void
) {
  if (!incoming) return
  const currentInstance = (useAuthStore.getState().store?.settings as Record<string, string>)?.whatsapp_instance ?? ''
  const incomingInstance = (incoming.settings as Record<string, string>)?.whatsapp_instance ?? ''

  if (currentInstance && currentInstance !== incomingInstance) {
    // Zustand tem instância mais recente que o banco — preserva
    setStore({
      ...incoming,
      settings: { ...(incoming.settings as object), whatsapp_instance: currentInstance },
    } as Store)
  } else {
    setStore(incoming as Store)
  }
}

export function useAuth() {
  const { setUser, setStore, setLoading, logout } = useAuthStore()

  useEffect(() => {
    let mounted = true

    // Se há tokens no hash da URL (ex: redirecionamento pós-cadastro), o Supabase
    // processa esses tokens via detectSessionInUrl e dispara onAuthStateChange(SIGNED_IN).
    // Nesse caso, não chamamos logout() no getSession() — esperamos o evento chegar.
    const hashHasTokens = window.location.hash.includes('access_token=')

    // Get initial session — always re-fetches profile from DB to ensure fresh role/store data
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      try {
        if (session?.user) {
          const profile = await loadProfile(session.user.id)
          if (profile && mounted) {
            setUser(profile as Parameters<typeof setUser>[0])
            if (profile.stores) applyStore(profile.stores as Store, setStore)
          } else if (mounted) {
            // Profile query returned nothing — clear stale cache to avoid wrong role
            logout()
          }
        } else if (!hashHasTokens) {
          // No valid session and no hash tokens incoming — clear stale cache
          logout()
        }
        // If hashHasTokens and no session yet: stay loading, onAuthStateChange(SIGNED_IN) will arrive
      } catch (e) {
        console.error('[useAuth] Failed to load profile:', e)
      } finally {
        // Don't clear loading if we're still waiting for hash token processing
        if (mounted && !hashHasTokens) setLoading(false)
      }
    }).catch((e) => {
      console.error('[useAuth] getSession error:', e)
      if (mounted) setLoading(false)
    })

    // Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT' || !session) {
        logout()
        setLoading(false)
        return
      }

      if (session?.user) {
        try {
          const profile = await loadProfile(session.user.id)
          if (profile && mounted) {
            setUser(profile as Parameters<typeof setUser>[0])
            if (profile.stores) applyStore(profile.stores as Store, setStore)
          }
        } catch (e) {
          console.error('[useAuth] onAuthStateChange profile error:', e)
        } finally {
          if (mounted) setLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [setUser, setStore, setLoading, logout])
}
