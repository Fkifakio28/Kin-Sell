import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kinsell.app',
  appName: 'Kin-Sell',
  webDir: 'dist',

  // ── Charge l'app depuis le serveur live (cookies, CORS, API fonctionnent) ──
  server: {
    url: 'https://kin-sell.com',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
  },

  android: {
    allowMixedContent: false,
    appendUserAgent: 'KinSellApp',
  },

  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: true,
    scrollEnabled: true,
    appendUserAgent: 'KinSellApp',
    // Le schéma custom pour deep-links OAuth
    scheme: 'kinsell',
  },

  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#120B2B',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
      iosSpinnerStyle: 'large',
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