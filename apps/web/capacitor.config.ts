import type { CapacitorConfig } from '@capacitor/cli';

const liveServerUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.kinsell.app',
  appName: 'Kin-Sell',
  webDir: 'dist',

  // CAP_SERVER_URL est réservé aux usages debug/QA.
  // En production APK, l'app doit démarrer depuis webDir (dist) pour éviter la dépendance réseau.
  ...(liveServerUrl
    ? {
        server: {
          url: liveServerUrl,
          cleartext: false,
          androidScheme: 'https',
          iosScheme: 'https',
        },
      }
    : {}),

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
    // ── Route fetch/XHR through native HTTP layer (bypass WebView CORS & cookie restrictions) ──
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
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