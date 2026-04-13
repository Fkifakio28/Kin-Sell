/**
 * MobilePageShell — Layout mobile pour les pages intérieures.
 *
 * Rendu via AppLayout quand isMobile = true.
 * Fournit : top bar (← logo panier) + bottom nav 5 items + create menu.
 * Le footer global est supprimé via RootLayout (isMobile).
 */

import { Suspense, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/providers/AuthProvider";
import { useScrollDirection } from "../hooks/useScrollDirection";
import { getDashboardPath, DASHBOARD_PATHS } from "../shared/constants/roles";
import "./mobile-shell.css";

// ─────────────────────────────────────────────────────────────
// Create Menu (bottom sheet)
// ─────────────────────────────────────────────────────────────

function CreateMenu({
  open,
  onClose,
  isLoggedIn,
}: {
  open: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!open) return null;

  const go = (path: string) => {
    onClose();
    void navigate(isLoggedIn ? path : "/login");
  };

  return (
    <>
      <div className="msh-overlay" onClick={onClose} aria-hidden="true" />
      <div className="msh-create-menu" role="dialog" aria-label="Créer du contenu">
        <div className="msh-create-handle" aria-hidden="true" />
        <p className="msh-create-title">Publier ou ajouter</p>
        <button className="msh-create-item" onClick={() => go("/sokin")}>
          <span aria-hidden="true">📢</span>
          <span>Publier sur SoKin</span>
        </button>
        <button className="msh-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=articles&action=publish`)}>
          <span aria-hidden="true">🛍️</span>
          <span>Ajouter un produit</span>
        </button>
        <button className="msh-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=articles&action=publish`)}>
          <span aria-hidden="true">🔧</span>
          <span>Ajouter un service</span>
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Top Bar
// ─────────────────────────────────────────────────────────────

function MobileTopBar({ hidden }: { hidden: boolean }) {
  const navigate = useNavigate();
  return (
    <header className={`msh-topbar${hidden ? ' msh-topbar--hidden' : ''}`} role="banner">
      <button
        className="msh-topbar-back"
        onClick={() => navigate(-1)}
        aria-label="Retour"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
      </button>

      <Link to="/" className="msh-topbar-logo" aria-label="Kin-Sell — Accueil">
        <img
          src="/assets/kin-sell/logo.png"
          alt="Kin-Sell"
          className="msh-topbar-logo-img"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <span className="msh-topbar-logo-text">Kin-Sell</span>
      </Link>

      <Link to="/cart" className="msh-topbar-cart" aria-label="Panier">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      </Link>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom Nav
// ─────────────────────────────────────────────────────────────

function MobileBottomNav({
  createOpen,
  onToggleCreate,
  hidden,
}: {
  createOpen: boolean;
  onToggleCreate: () => void;
  hidden: boolean;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const dashPath = getDashboardPath(user?.role);
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  return (
    <nav className={`msh-bottom-nav${hidden ? ' msh-bottom-nav--hidden' : ''}`} aria-label="Navigation principale">
      {/* Accueil */}
      <Link to="/" className={`msh-bnav-item${isActive('/') && location.pathname === '/' ? ' msh-bnav-item--active' : ''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
        <span>Accueil</span>
      </Link>

      {/* Explorer */}
      <Link to="/explorer" className={`msh-bnav-item${isActive('/explorer') ? ' msh-bnav-item--active' : ''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>Explorer</span>
      </Link>

      {/* FAB + */}
      <button
        className={`msh-bnav-fab${createOpen ? " msh-bnav-fab--open" : ""}`}
        onClick={onToggleCreate}
        aria-label="Créer"
        aria-expanded={createOpen}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Messagerie */}
      <Link to="/messaging" className={`msh-bnav-item${isActive('/messaging') ? ' msh-bnav-item--active' : ''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Messages</span>
      </Link>

      {/* Compte */}
      <Link to={dashPath} className={`msh-bnav-item${isActive(dashPath) ? ' msh-bnav-item--active' : ''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>Compte</span>
      </Link>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// Shell principal
// ─────────────────────────────────────────────────────────────

export function MobilePageShell() {
  const { isLoggedIn } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const { pathname } = useLocation();
  const scrollDir = useScrollDirection();
  const isDashboard = DASHBOARD_PATHS.some((p) => pathname.startsWith(p));
  const isMessaging = pathname.startsWith('/messaging');
  const hideBar = scrollDir === 'down' && !createOpen;

  return (
    <div className="msh-shell">
      {!isDashboard && <MobileTopBar hidden={hideBar} />}
      <div className={`msh-content${isMessaging ? ' msh-content--messaging' : ''}`}>
        <Suspense fallback={<div className="ks-page-loader">Chargement…</div>}>
          <Outlet />
        </Suspense>
      </div>
      {!isDashboard && (
        <>
          <div className="msh-bottom-spacer" aria-hidden="true" />
          <CreateMenu
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            isLoggedIn={isLoggedIn}
          />
          <MobileBottomNav
            createOpen={createOpen}
            onToggleCreate={() => setCreateOpen((p) => !p)}
            hidden={hideBar}
          />
        </>
      )}
    </div>
  );
}
