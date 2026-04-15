import { Navigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import type { ReactNode } from "react";

/**
 * Protège les routes réservées aux visiteurs non connectés (login, register).
 * Redirige vers le dashboard si déjà authentifié.
 */
export function GuestGuard({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading, user } = useAuth();

  if (isLoading) return null;

  if (isLoggedIn && user) {
    const role = user.role;
    if (role === "ADMIN" || role === "SUPER_ADMIN") return <Navigate to="/admin/dashboard" replace />;
    if (role === "BUSINESS") return <Navigate to="/business/dashboard" replace />;
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
