import { Suspense, lazy } from "react";
import { useIsMobile } from "../../hooks/useIsMobile";

const HomePage = lazy(() =>
  import("./HomePage").then((m) => ({ default: m.HomePage }))
);
const HomePageMobile = lazy(() =>
  import("./HomePageMobile").then((m) => ({ default: m.HomePageMobile }))
);

/**
 * HomeEntry — Sélecteur de page d'accueil selon la plateforme.
 * - Mobile (≤ 768px) → HomePageMobile (expérience app-native)
 * - Desktop (> 768px) → HomePage (expérience complète)
 * La page HomePage n'est PAS supprimée.
 */
export function HomeEntry() {
  const isMobile = useIsMobile();
  return (
    <Suspense fallback={<div className="ks-page-loader">Chargement…</div>}>
      {isMobile ? <HomePageMobile /> : <HomePage />}
    </Suspense>
  );
}
