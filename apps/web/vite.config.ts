import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { compression } from "vite-plugin-compression2";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "generateSW" = Workbox génère le SW automatiquement
      strategies: "generateSW",
      registerType: "autoUpdate",
      injectRegister: "auto",

      // ── Manifest (Android + Chrome Desktop install) ──
      manifest: {
        name: "Kin-Sell — Le marché de Kinshasa",
        short_name: "Kin-Sell",
        description: "Achetez, vendez et découvrez les meilleures affaires de Kinshasa sur Kin-Sell.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#120b2b",
        theme_color: "#6f58ff",
        lang: "fr",
        icons: [
          { src: "/assets/kin-sell/pwa-72.png",  sizes: "72x72",   type: "image/png", purpose: "any" },
          { src: "/assets/kin-sell/pwa-96.png",  sizes: "96x96",   type: "image/png", purpose: "any" },
          { src: "/assets/kin-sell/pwa-128.png", sizes: "128x128", type: "image/png", purpose: "any" },
          { src: "/assets/kin-sell/pwa-144.png", sizes: "144x144", type: "image/png", purpose: "any" },
          { src: "/assets/kin-sell/pwa-152.png", sizes: "152x152", type: "image/png", purpose: "any" },
          { src: "/assets/kin-sell/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/assets/kin-sell/pwa-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
          { src: "/assets/kin-sell/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
        shortcuts: [
          {
            name: "Explorer",
            short_name: "Explorer",
            url: "/explorer",
            icons: [{ src: "/assets/kin-sell/pwa-96.png", sizes: "96x96", type: "image/png" }],
          },
          {
            name: "Mon compte",
            short_name: "Compte",
            url: "/account",
            icons: [{ src: "/assets/kin-sell/pwa-96.png", sizes: "96x96", type: "image/png" }],
          },
        ],
        categories: ["shopping", "business", "lifestyle"],
      },

      // ── Workbox — stratégies de cache ──
      workbox: {
        // ── Assets statiques : cache-first (long terme) ──
        runtimeCaching: [
          {
            // Fonts Google si jamais utilisées à l'avenir
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Images (Cloudinary / CDN / assets locaux)
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache",
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // API calls (/api/* AND absolute URLs like http://api.kin-sell.com/*)
            // Network-first : données fraîches, fallback cache si hors-ligne
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api") ||
              url.hostname === "api.kin-sell.com",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // JS/CSS chunks : PAS de runtime caching ici.
          // Le précache Workbox (globPatterns ci-dessous) gère déjà les assets
          // hashés avec versioning correct. Un StaleWhileRevalidate ici
          // causerait des 404 → ErrorBoundary après chaque rebuild.
          {
            // Woff2 / polices locales — CacheFirst (immuables après build)
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],

        // Précache tous les chunks build (PAS html : servi sans cache par le serveur)
        globPatterns: ["**/*.{js,css,ico,svg,woff2}"],

        // Nettoyer les anciens caches lors d'une mise à jour du SW
        cleanupOutdatedCaches: true,

        // Évite de mettre en cache les gros fichiers vidéo background
        globIgnores: [
          "**/live-background.*",
          "**/sw-push.js",
          "**/*.png",
          "**/*.jpg",
          "**/*.jpeg",
          "**/*.webp",
          "**/*.gif",
        ],

        // Claim immédiatement le client dès activation
        clientsClaim: true,
        skipWaiting: true,

        // Taille max d'un fichier précaché : 3 MB (évite de stocker de grosses images)
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,

        // Naviguer offline → servir index.html (SPA fallback)
        // La route /offline est ensuite rendue par React et affiche la page déconnectée
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/sw-push\.js/, /^\/assets\//],

        // Push notifications
        importScripts: ["/sw-push.js"],
      },

      devOptions: {
        // Activer le SW en mode dev pour tester sans build
        enabled: false,
        type: "module",
      },
    }),

    // ── Compression des assets au build (gzip + brotli) ──
    // Le serveur doit servir les .gz / .br selon Accept-Encoding
    compression({
      algorithm: "gzip",
      threshold: 1024,         // Compresser seulement les fichiers > 1 Ko
      deleteOriginalFile: false,
    }),
    compression({
      algorithm: "brotliCompress",
      threshold: 1024,
      deleteOriginalFile: false,
    }),
  ],

  build: {
    target: "esnext",
    minify: "esbuild",
    cssMinify: true,
    // Avertir si un chunk dépasse 500 Ko (avant gzip)
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Libs React isolées dans un chunk stable pour cache navigateur long
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Socket.io chargée séparément (lourde, rarement modifiée)
          "vendor-socket": ["socket.io-client"],
        },
      },
    },
  },

  // Pre-warm les fichiers d'entrée en dev pour accélérer le premier affichage
  server: {
    // Proxy dev → élimine les erreurs CORS et "Failed to fetch" en local
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/app/providers/AuthProvider.tsx",
        "./src/components/Header.tsx",
      ],
    },
  },
});
