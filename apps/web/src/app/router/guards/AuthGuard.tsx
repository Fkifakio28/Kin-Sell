import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import type { ReactNode } from "react";

/**
 * Protège les routes réservées aux utilisateurs connectés.
 * Redirige vers /login si non authentifié.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
