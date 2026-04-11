import React from "react";
import ReactDOM from "react-dom/client";
import { App as CapacitorApp, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import App from "./App";
import { ThemeProvider } from "./app/providers/ThemeProvider";
import { AuthProvider } from "./app/providers/AuthProvider";
import { GlobalNotificationProvider } from "./app/providers/GlobalNotificationProvider";
import { LocaleCurrencyProvider } from "./app/providers/LocaleCurrencyProvider";
import { MarketPreferenceProvider } from "./app/providers/MarketPreferenceProvider";
import { SocketProvider } from "./app/providers/SocketProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import { registerServiceWorker } from "./utils/push-notifications";
import "./styles/index.css";

// ── Register Service Worker for push notifications (web only) ──
if ("serviceWorker" in navigator) {
  registerServiceWorker().catch(() => {});
}

// ── Native platform setup ──
if (Capacitor.isNativePlatform()) {
  // Deep-link handler: intercept OAuth callback
  CapacitorApp.addListener("appUrlOpen", async ({ url }: URLOpenListenerEvent) => {
    if (!url) return;

    // OAuth deep-link callback
    if (url.startsWith("com.kinsell.app://auth/callback")) {
      const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
      await Browser.close().catch(() => undefined);
      window.location.href = `/auth/callback${query}`;
      return;
    }

    // HTTPS deep-links (App Links) — navigate within the app
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "kin-sell.com") {
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
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <MarketPreferenceProvider>
          <LocaleCurrencyProvider>
            <AuthProvider>
              <SocketProvider>
                <GlobalNotificationProvider>
                  <App />
                </GlobalNotificationProvider>
              </SocketProvider>
            </AuthProvider>
          </LocaleCurrencyProvider>
        </MarketPreferenceProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

