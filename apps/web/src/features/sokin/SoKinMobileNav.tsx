/**
 * SoKinMobileNav — Bottom nav légère pour les sous-pages So-Kin
 * (Dashboard, Bookmarks, etc.)
 *
 * Reprend les 4 destinations essentielles de l'app pour éviter
 * que l'utilisateur soit bloqué dans un cul-de-sac de navigation.
 */

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { getDashboardPath } from '../../utils/role-routing';

export function SoKinMobileNav({ hidden = false }: { hidden?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();
  const dashPath = getDashboardPath(user?.role);
  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav
      className={`sk-sub-bnav${hidden ? ' sk-sub-bnav--hidden' : ''}`}
      aria-label="Navigation rapide"
    >
      <Link to="/" className={`sk-sub-bnav-item${location.pathname === '/' ? ' sk-sub-bnav-item--active' : ''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
        <span>Accueil</span>
      </Link>

      <Link to="/sokin" className={`sk-sub-bnav-item${isActive('/sokin') && location.pathname === '/sokin' ? ' sk-sub-bnav-item--active' : ''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span>So-Kin</span>
      </Link>

      <Link to="/messaging" className={`sk-sub-bnav-item${isActive('/messaging') ? ' sk-sub-bnav-item--active' : ''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Messages</span>
      </Link>

      <Link to={dashPath} className={`sk-sub-bnav-item${isActive(dashPath) ? ' sk-sub-bnav-item--active' : ''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
        <span>Compte</span>
      </Link>
    </nav>
  );
}
