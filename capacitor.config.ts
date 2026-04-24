import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.crmautomotivo.pro',
  appName: 'CRM Auto',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#000000',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      launchAutoHide: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000',
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
}

export default config
