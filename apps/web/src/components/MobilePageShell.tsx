/**
 * MobilePageShell — Layout mobile pour les pages intérieures.
 *
 * Rendu via AppLayout quand isMobile = true.
 * Fournit : top bar (← logo panier) + bottom nav 5 items + create menu.
 * Le footer global est supprimé via RootLayout (isMobile).
 */

import { Suspense, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../app/providers/AuthProvider";
import { getDashboardPath } from "../utils/role-routing";
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
        <button className="msh-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=sell&create=produit`)}>
          <span aria-hidden="true">🛍️</span>
          <span>Ajouter un produit</span>
        </button>
        <button className="msh-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=sell&create=service`)}>
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

function MobileTopBar() {
  const navigate = useNavigate();
  return (
    <header className="msh-topbar" role="banner">
      <button
        className="msh-topbar-back"
        onClick={() => navigate(-1)}
        aria-label="Retour"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
}: {
  createOpen: boolean;
  onToggleCreate: () => void;
}) {
  const { user } = useAuth();
  const dashPath = getDashboardPath(user?.role);
  return (
    <nav className="msh-bottom-nav" aria-label="Navigation principale">
      {/* Accueil */}
      <Link to="/" className="msh-bnav-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
        <span>Accueil</span>
      </Link>

      {/* Panier */}
      <Link to="/cart" className="msh-bnav-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        <span>Panier</span>
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

      {/* Notifications */}
      <button
        className="msh-bnav-item"
        onClick={() => {
          sessionStorage.setItem("ud-section", "notifications");
          window.location.href = dashPath;
        }}
        aria-label="Notifications"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span>Notifs</span>
      </button>

      {/* Compte */}
      <Link to={dashPath} className="msh-bnav-item">
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

  return (
    <>
      <MobileTopBar />
      <div className="msh-content">
        <Suspense fallback={<div className="ks-page-loader">Chargement…</div>}>
          <Outlet />
        </Suspense>
      </div>
      <div className="msh-bottom-spacer" aria-hidden="true" />
      <CreateMenu
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        isLoggedIn={isLoggedIn}
      />
      <MobileBottomNav
        createOpen={createOpen}
        onToggleCreate={() => setCreateOpen((p) => !p)}
      />
    </>
  );
}
