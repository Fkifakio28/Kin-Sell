import { Suspense, lazy } from "react";
import { Navigate } from "react-router-dom";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useAuth } from "../../app/providers/AuthProvider";

const HomePage = lazy(() =>
  import("./HomePage").then((m) => ({ default: m.HomePage }))
);
const HomePageMobile = lazy(() =>
  import("./HomePageMobile").then((m) => ({ default: m.HomePageMobile }))
);

/**
 * HomeEntry — Sélecteur de page d'accueil selon la plateforme.
 * - Redirige vers /login si l'utilisateur n'est pas connecté.
 * - Mobile (≤ 768px) → HomePageMobile (expérience app-native)
 * - Desktop (> 768px) → HomePage (expérience complète)
 */
export function HomeEntry() {
  const isMobile = useIsMobile();
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) return <div className="ks-page-loader">Chargement…</div>;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <Suspense fallback={<div className="ks-page-loader">Chargement…</div>}>
      {isMobile ? <HomePageMobile /> : <HomePage />}
    </Suspense>
  );
}
