import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

async function loadProfile(userId: string) {
  const { data: profile } = await supabase
    .from('users')
    .select('*, stores(*)')
    .eq('id', userId)
    .single()
  return profile
}

export function useAuth() {
  const { setUser, setStore, setLoading, logout } = useAuthStore()

  useEffect(() => {
    let mounted = true

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      try {
        if (session?.user) {
          const profile = await loadProfile(session.user.id)
          if (profile && mounted) {
            setUser(profile as Parameters<typeof setUser>[0])
            if (profile.stores) setStore(profile.stores as Parameters<typeof setStore>[0])
          }
        }
      } catch (e) {
        console.error('[useAuth] Failed to load profile:', e)
      } finally {
        if (mounted) setLoading(false)
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
            if (profile.stores) setStore(profile.stores as Parameters<typeof setStore>[0])
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
