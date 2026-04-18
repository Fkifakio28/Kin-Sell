import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { compression } from "vite-plugin-compression2";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

/** Injecte un timestamp de build dans sw.js (remplace __BUILD_TS__) */
function swVersionPlugin(): Plugin {
  return {
    name: "sw-build-version",
    writeBundle() {
      const swPath = resolve(__dirname, "dist/sw.js");
      try {
        const content = readFileSync(swPath, "utf-8");
        writeFileSync(swPath, content.replace(/__BUILD_TS__/g, String(Date.now())));
      } catch {
        // sw.js absent du build — pas bloquant
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),

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

    // Versionner sw.js avec un timestamp de build
    swVersionPlugin(),
  ],

  build: {
    target: "esnext",
    minify: "esbuild",
    cssMinify: true,
    // Avertir si un chunk dépasse 500 Ko (avant gzip)
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Hash-versioned filenames for cache busting
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/chunk-[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? "";
          if (/\.(png|jpe?g|gif|svg|webp|avif|ico)$/i.test(name)) {
            return "assets/images/[name]-[hash][extname]";
          }
          if (/\.(woff2?|ttf|eot)$/i.test(name)) {
            return "assets/fonts/[name]-[hash][extname]";
          }
          if (name.endsWith(".css")) {
            return "assets/css/[name]-[hash][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
        manualChunks: {
          // Libs React isolées dans un chunk stable pour cache navigateur long
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Socket.io chargée séparément (lourde, rarement modifiée)
          "vendor-socket": ["socket.io-client"],
          // HLS.js pour le streaming vidéo spécialisé (chunk isolé)
          "vendor-hls": ["hls.js"],
          // Leaflet pour les cartes OSM (lourd, uniquement Explorer/Map)
          "vendor-leaflet": ["leaflet"],
          // QR code libs (scan + génération) — chargées uniquement sur pages dédiées
          "vendor-qr": ["html5-qrcode", "qrcode"],
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
        "./src/app/providers/SocketProvider.tsx",
        "./src/app/providers/GlobalNotificationProvider.tsx",
        "./src/components/Header.tsx",
        "./src/components/Footer.tsx",
        "./src/features/home/HomePage.tsx",
        "./src/features/explorer/ExplorerPage.tsx",
        "./src/features/sokin/SoKinPage.tsx",
        "./src/features/auth/LoginPage.tsx",
      ],
    },
  },
});
