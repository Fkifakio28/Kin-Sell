import { Navigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import { getDashboardPath } from "../../../shared/constants/roles";
import type { ReactNode } from "react";

/**
 * Protège les routes réservées aux visiteurs non connectés (login, register).
 * Redirige vers le dashboard si déjà authentifié.
 */
export function GuestGuard({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading, user } = useAuth();

  if (isLoading) return null;

  if (isLoggedIn && user) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return <>{children}</>;
}
