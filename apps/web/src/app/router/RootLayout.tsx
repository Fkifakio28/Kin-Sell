import { Suspense, useState } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { BackgroundMusic } from "../../components/BackgroundMusic";
import { Footer } from "../../components/Footer";
import { shouldShowSplash, SplashScreen } from "../../components/SplashScreen";
import { SuspensionGuard } from "../providers/AuthProvider";
import { InstallBanner } from "../../components/InstallBanner";
import { useIsMobile } from "../../hooks/useIsMobile";

/**
 * Root layout — wraps all pages with background shell + footer.
 */
export function RootLayout() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const hideFooter = isMobile
    || location.pathname === "/login"
    || location.pathname === "/register"
    || location.pathname === "/suspended";

  const [splashVisible, setSplashVisible] = useState(() => shouldShowSplash());
  // Si le splash n'est pas affiché (déjà vu), on démarre la musique dès le montage.
  // BackgroundMusic gère lui-même le blocage autoplay du navigateur.
  const [musicPlaying, setMusicPlaying] = useState(() => !shouldShowSplash());

  function handleSplashDismiss() {
    setSplashVisible(false);
    setMusicPlaying(true);
  }

  return (
    <div className="live-background-shell">
      <div className="live-background-media" aria-hidden="true">
        <video autoPlay loop muted playsInline preload="none">
          <source src="/assets/kin-sell/live-background.mp4" type="video/mp4" />
          <source src="/assets/kin-sell/live-background.gif" type="image/gif" />
        </video>
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
      <BackgroundMusic playing={musicPlaying} />
      <InstallBanner />
    </div>
  );
}
