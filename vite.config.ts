import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ mode }) => {
  // Carrega todas as vars de ambiente (inclusive sem prefixo VITE_) para uso no config
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          navigateFallback: null,
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'navigate-cache',
                networkTimeoutSeconds: 5,
              },
            },
          ],
        },
        includeAssets: ['favicon.svg', 'icon-source.svg', 'icons/*.png'],
        manifest: {
          name: 'CRM Automotivo Pro',
          short_name: 'CRM Auto',
          description: 'O CRM mais completo para concessionárias premium',
          theme_color: '#0A0A0A',
          background_color: '#0A0A0A',
          display: 'fullscreen',
          orientation: 'portrait',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'es2015',   // compatibilidade com WebView do Android
    },
    server: {
      host: true,          // necessário para `npx cap run android --livereload`
      port: 5173,
      // Proxy de desenvolvimento: /api/whatsapp → Uazapi
      // Em produção, o Vercel usa o serverless function em api/whatsapp/[...path].js
      proxy: {
        '/api/whatsapp': {
          target: env.UAZAPI_BASE_URL || 'https://api.uazapi.dev',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/whatsapp/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const token = env.UAZAPI_ADMIN_TOKEN || ''
              if (token) proxyReq.setHeader('admintoken', token)
            })
          },
        },
        // Legado: redireciona /api/evolution para Uazapi também (compatibilidade durante transição)
        '/api/evolution': {
          target: env.UAZAPI_BASE_URL || 'https://api.uazapi.dev',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/evolution/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const token = env.UAZAPI_ADMIN_TOKEN || ''
              if (token) proxyReq.setHeader('admintoken', token)
            })
          },
        },
      },
    },
  }
})
