import { Suspense, useEffect, useState } from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router-dom";
import { CookieConsent } from "../../components/CookieConsent";
import { Footer } from "../../components/Footer";
import { shouldShowSplash, SplashScreen } from "../../components/SplashScreen";
import { SuspensionGuard } from "../providers/AuthProvider";
import { CallProvider } from "../providers/CallProvider";
import { useIsMobile } from "../../hooks/useIsMobile";

/** Loader avec message connexion lente après 5s */
function PageLoader() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="ks-page-loader">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <span style={{
          width: 28, height: 28,
          border: "3px solid rgba(111,88,255,0.2)", borderTopColor: "#6f58ff",
          borderRadius: "50%", animation: "spin .8s linear infinite", display: "inline-block"
        }} />
        <span>Chargement…</span>
        {slow && (
          <span style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", textAlign: "center", maxWidth: 260 }}>
            Connexion lente détectée — veuillez patienter
          </span>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

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

  useEffect(() => {
    const root = document.documentElement;
    const applyVisibilityState = () => {
      if (document.visibilityState === "hidden") {
        root.classList.add("ks-page-hidden");
      } else {
        root.classList.remove("ks-page-hidden");
      }
    };
    applyVisibilityState();
    document.addEventListener("visibilitychange", applyVisibilityState);
    return () => {
      document.removeEventListener("visibilitychange", applyVisibilityState);
      root.classList.remove("ks-page-hidden");
    };
  }, []);

  function handleSplashDismiss() {
    setSplashVisible(false);
  }

  return (
    <div className="live-background-shell">
      {/* Vidéo de fond supprimée — les fichiers n'existent pas et causent des 404.
          Le gradient CSS dans .live-background-overlay est suffisant. */}
      <div className="live-background-overlay" aria-hidden="true" />
      <div className="ks-theme-bubbles" aria-hidden="true">
        <span className="ks-bubble ks-bubble-1" />
        <span className="ks-bubble ks-bubble-2" />
        <span className="ks-bubble ks-bubble-3" />
        <span className="ks-bubble ks-bubble-4" />
        <span className="ks-bubble ks-bubble-5" />
      </div>
      <SuspensionGuard>
        <CallProvider>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </CallProvider>
      </SuspensionGuard>
      {hideFooter ? null : <Footer />}
      <ScrollRestoration />
      {splashVisible && <SplashScreen onDismiss={handleSplashDismiss} />}
      <CookieConsent />
    </div>
  );
}
