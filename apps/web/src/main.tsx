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
import "./styles/index.css";

if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener("appUrlOpen", async ({ url }: URLOpenListenerEvent) => {
    if (!url || !url.startsWith("com.kinsell.app://auth/callback")) return;
    const query = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    await Browser.close().catch(() => undefined);
    window.location.href = `/auth/callback${query}`;
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <MarketPreferenceProvider>
        <LocaleCurrencyProvider>
          <AuthProvider>
            <GlobalNotificationProvider>
              <App />
            </GlobalNotificationProvider>
          </AuthProvider>
        </LocaleCurrencyProvider>
      </MarketPreferenceProvider>
    </ThemeProvider>
  </React.StrictMode>
);
