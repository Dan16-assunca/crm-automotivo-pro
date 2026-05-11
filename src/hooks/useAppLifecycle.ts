import { useEffect, useRef, useState, useCallback } from 'react'

// ── Auto-reload quando a aba volta do fundo ──────────────────────────────────
// Se a aba ficou oculta por mais de `thresholdMs`, recarrega ao voltar.
// Isso libera memória acumulada e mantém dados frescos.
export function useVisibilityRefresh(thresholdMs = 5 * 60 * 1000) {
  useEffect(() => {
    let hiddenAt: number | null = null

    const handler = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt > thresholdMs) {
          window.location.reload()
        }
        hiddenAt = null
      }
    }

    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [thresholdMs])
}

// ── Auto-logout por inatividade ──────────────────────────────────────────────
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const

export function useIdleLogout(
  onLogout: () => void,
  idleMs = 30 * 60 * 1000,  // 30 min → logout
  warnMs =  5 * 60 * 1000,  // aviso 5 min antes
) {
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const warningActiveRef = useRef(false)
  const logoutTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const onLogoutRef      = useRef(onLogout)
  useEffect(() => { onLogoutRef.current = onLogout }, [onLogout])

  const clearAll = useCallback(() => {
    if (logoutTimerRef.current)  clearTimeout(logoutTimerRef.current)
    if (warnTimerRef.current)    clearTimeout(warnTimerRef.current)
    if (countdownRef.current)    clearInterval(countdownRef.current)
  }, [])

  const arm = useCallback(() => {
    clearAll()

    warnTimerRef.current = setTimeout(() => {
      warningActiveRef.current = true
      setShowWarning(true)
      setSecondsLeft(Math.round(warnMs / 1000))
      countdownRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) clearInterval(countdownRef.current!)
          return Math.max(0, s - 1)
        })
      }, 1000)
    }, idleMs - warnMs)

    logoutTimerRef.current = setTimeout(() => onLogoutRef.current(), idleMs)
  }, [clearAll, idleMs, warnMs])

  // "Continuar usando" — cancela o aviso e reinicia os timers
  const keepAlive = useCallback(() => {
    warningActiveRef.current = false
    setShowWarning(false)
    setSecondsLeft(0)
    arm()
  }, [arm])

  useEffect(() => {
    arm()

    const onActivity = () => {
      // Não reinicia se o aviso de logout já está sendo exibido
      if (!warningActiveRef.current) arm()
    }

    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    return () => {
      clearAll()
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity))
    }
  }, [arm, clearAll])

  return { showWarning, secondsLeft, keepAlive }
}
