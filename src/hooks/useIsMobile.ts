import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

/** True when viewport width ≤ 1024px. Cobre celulares e tablets em portrait.
 *  Reacts to resize + orientation changes. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 1024px)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}

/** True when running inside a native Capacitor shell (iOS/Android app). */
export function useIsNative(): boolean {
  return Capacitor.isNativePlatform()
}
