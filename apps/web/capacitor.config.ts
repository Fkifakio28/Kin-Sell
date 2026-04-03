import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kinsell.app',
  appName: 'Kin-Sell',
  webDir: 'dist',

  // ── Charge l'app depuis le serveur live (cookies, CORS, API fonctionnent) ──
  server: {
    url: 'https://kin-sell.com',
    cleartext: false,
    // Garde les liens internes dans la WebView, ouvre les externes en navigateur
    androidScheme: 'https',
  },

  android: {
    allowMixedContent: false,
    // Gestion des URL externes dans le navigateur système
    appendUserAgent: 'KinSellApp',
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#120B2B',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    Browser: {
      // Les liens OAuth s'ouvrent dans le navigateur système
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;