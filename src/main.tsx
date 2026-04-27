import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import * as Sentry from '@sentry/react'
import '@/index.css'
import App from '@/App'
import { captureUtmsFromUrl } from '@/utils/utm'

// ─── Sentry — monitoramento de erros em produção ─────────────────────────────
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
if (SENTRY_DSN && import.meta.env.PROD) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: 'production',
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    // Mostra o dialog de feedback ao usuário em erros não tratados
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Performance monitoring — 10% das transações em prod
    tracesSampleRate: 0.1,
    // Session replay apenas em erros
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    // Ignora erros de rede e ResizeObserver (ruído comum)
    ignoreErrors: [
      'ResizeObserver loop',
      'Load failed',
      'NetworkError',
      'Failed to fetch',
      'AbortError',
    ],
    beforeSend(event) {
      // Não envia erros em localhost
      if (window.location.hostname === 'localhost') return null
      return event
    },
  })
}

// Captura UTMs/click IDs da URL assim que o app carrega (first-touch attribution)
captureUtmsFromUrl()

// Inicialização nativa (só roda dentro do app Capacitor)
async function initNative() {
  if (!Capacitor.isNativePlatform()) return

  // Status bar escura para combinar com o tema dark do app
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  await StatusBar.setBackgroundColor({ color: '#000000' }).catch(() => {})

  // Esconde a splash screen após o React montar
  // (launchAutoHide: false em capacitor.config.ts para controlar manualmente)
  setTimeout(() => SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {}), 600)
}

// When the SW activates via skipWaiting + clientsClaim, controllerchange fires.
// Reload so the page runs the new JS bundle.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

initNative()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
