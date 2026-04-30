import React from "react";
import ReactDOM from "react-dom/client";
import { App as CapacitorApp, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
// @ts-ignore — native-only module, types may not exist on server
import { StatusBar, Style } from "@capacitor/status-bar";
import App from "./App";
import { ThemeProvider } from "./app/providers/ThemeProvider";
import { AuthProvider } from "./app/providers/AuthProvider";
import { AccountPreferencesSync } from "./app/providers/AccountPreferencesSync";
import { GlobalNotificationProvider } from "./app/providers/GlobalNotificationProvider";
import { LocaleCurrencyProvider } from "./app/providers/LocaleCurrencyProvider";
import { MarketPreferenceProvider } from "./app/providers/MarketPreferenceProvider";
import { SocketProvider } from "./app/providers/SocketProvider";
import { DataSaverProvider } from "./app/providers/DataSaverProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import { NativePermissionsGate } from "./features/onboarding/NativePermissionsGate";
import { registerServiceWorker } from "./utils/push-notifications";
import { initializeIAP } from "./utils/iap";
import "./styles/index.css";

// ── Register Service Worker for push notifications (web only) ──
// Déféré après le chargement initial pour ne pas saturer la bande passante sur 2G/3G
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    setTimeout(() => registerServiceWorker().catch(() => {}), 3000);
  }, { once: true });
}

// ── Native platform setup ──
if (Capacitor.isNativePlatform()) {
  // Status bar: ne pas chevaucher le contenu web
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  StatusBar.setBackgroundColor({ color: "#120B2B" }).catch(() => {});
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});

  // Marquer le body pour neutraliser env(safe-area-inset-top) redondant avec overlay:false
  if (Capacitor.getPlatform() === "android") {
    document.body.classList.add("capacitor-android");
  }

  // Deep-link handler: intercept OAuth callback
  // Guard against duplicate deep-links from the redirect page
  let _authCallbackHandled = false;

  CapacitorApp.addListener("appUrlOpen", async ({ url }: URLOpenListenerEvent) => {
    if (!url) return;

    // OAuth deep-link callback (custom scheme)
    if (url.startsWith("com.kinsell.app://auth/callback")) {
      if (_authCallbackHandled) return; // ignore duplicate deep-links
      _authCallbackHandled = true;
      const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
      await Browser.close().catch(() => undefined);
      window.location.href = `/auth/callback${query}`;
      return;
    }

    // HTTPS deep-links (App Links) — navigate within the app
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "kin-sell.com") {
        // Close in-app browser if this is an auth callback
        if (parsed.pathname.startsWith("/auth/")) {
          if (_authCallbackHandled) return; // ignore duplicate
          _authCallbackHandled = true;
          await Browser.close().catch(() => undefined);
        }
        window.location.href = parsed.pathname + parsed.search + parsed.hash;
      }
    } catch {
      // Ignore malformed URLs
    }
  });

  // Handle back button on Android
  CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
    }
  });

  // Initialize In-App Purchases (iOS only)
  initializeIAP().catch(() => {});
}

// ── Détection téléphone : verrouiller la vue mobile ──
(function lockPhoneView() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua);
  const touchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const smallScreen = Math.min(window.screen.width, window.screen.height) <= 820;
  if (mobileUA && touchScreen && smallScreen) {
    document.documentElement.classList.add("is-phone");
  }
})();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <DataSaverProvider>
          <MarketPreferenceProvider>
            <LocaleCurrencyProvider>
              <AuthProvider>
                <AccountPreferencesSync />
                <SocketProvider>
                  <GlobalNotificationProvider>
                    <NativePermissionsGate>
                      <App />
                    </NativePermissionsGate>
                  </GlobalNotificationProvider>
                </SocketProvider>
              </AuthProvider>
            </LocaleCurrencyProvider>
          </MarketPreferenceProvider>
        </DataSaverProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

