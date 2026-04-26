import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import '@/index.css'
import App from '@/App'
import { captureUtmsFromUrl } from '@/utils/utm'

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
