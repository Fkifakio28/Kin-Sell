import { Suspense, useState } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { CookieConsent } from "../../components/CookieConsent";
import { Footer } from "../../components/Footer";
import { shouldShowSplash, SplashScreen } from "../../components/SplashScreen";
import { SuspensionGuard } from "../providers/AuthProvider";
import { useIsMobile } from "../../hooks/useIsMobile";

/**
 * Root layout — wraps all pages with background shell + footer.
 */
export function RootLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const isNative = Capacitor.isNativePlatform();
  // Désactiver la vidéo de fond sur mobile/natif pour économiser batterie et CPU
  const disableBgVideo = isMobile || isNative;
  const hideFooter = isMobile
    || location.pathname === "/login"
    || location.pathname === "/register"
    || location.pathname === "/suspended";

  const [splashVisible, setSplashVisible] = useState(() => shouldShowSplash());

  function handleSplashDismiss() {
    setSplashVisible(false);
  }

  return (
    <div className="live-background-shell">
      <div className="live-background-media" aria-hidden="true">
        {!disableBgVideo && (
          <video autoPlay loop muted playsInline preload="none" poster="/assets/kin-sell/live-background-poster.webp">
            <source src="/assets/kin-sell/live-background.mp4" type="video/mp4" />
            <source src="/assets/kin-sell/live-background.gif" type="image/gif" />
          </video>
        )}
      </div>
      <div className="live-background-overlay" aria-hidden="true" />
      <div className="ks-theme-bubbles" aria-hidden="true">
        <span className="ks-bubble ks-bubble-1" />
        <span className="ks-bubble ks-bubble-2" />
        <span className="ks-bubble ks-bubble-3" />
        <span className="ks-bubble ks-bubble-4" />
        <span className="ks-bubble ks-bubble-5" />
      </div>
      <SuspensionGuard>
        <Suspense fallback={<div className="ks-page-loader">Chargement…</div>}>
          <Outlet />
        </Suspense>
      </SuspensionGuard>
      {hideFooter ? null : <Footer />}
      <ScrollRestoration />
      {splashVisible && <SplashScreen onDismiss={handleSplashDismiss} />}
      <CookieConsent />
    </div>
  );
}
