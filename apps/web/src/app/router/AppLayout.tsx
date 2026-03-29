import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "../../components/Header";
import { MobilePageShell } from "../../components/MobilePageShell";
import { useIsMobile } from "../../hooks/useIsMobile";

/**
 * App layout — pages with header (explorer, public profiles, etc.)
 * Sur mobile : remplace le Header desktop par MobilePageShell (top bar + bottom nav).
 */
export function AppLayout() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobilePageShell />;
  }

  return (
    <>
      <Header />
      <main className="page-main">
        <div className="page-main-content">
          <Suspense fallback={<div className="ks-page-loader">Chargement…</div>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </>
  );
}
