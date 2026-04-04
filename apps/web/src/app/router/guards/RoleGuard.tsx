import { Navigate } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";
import { getDashboardPath, type AppRole } from "../../../shared/constants/roles";
import type { ReactNode } from "react";

/**
 * Protège les routes réservées à un (ou plusieurs) rôle(s) spécifique(s).
 * Redirige vers le dashboard du rôle réel si le rôle ne correspond pas.
 */
export function RoleGuard({
  allowed,
  children,
}: {
  allowed: AppRole | AppRole[];
  children: ReactNode;
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const roles = Array.isArray(allowed) ? allowed : [allowed];
  if (!roles.includes(user.role as AppRole)) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return <>{children}</>;
}
