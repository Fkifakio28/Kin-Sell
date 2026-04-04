/**
 * Rôles utilisateur — source unique.
 */
export type AppRole = "USER" | "BUSINESS" | "ADMIN" | "SUPER_ADMIN";

export function isAdmin(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function isBusiness(role: string | undefined | null): boolean {
  return role === "BUSINESS";
}

export function isSuperAdmin(role: string | undefined | null): boolean {
  return role === "SUPER_ADMIN";
}

/**
 * Retourne le chemin du dashboard privé en fonction du rôle utilisateur.
 */
export function getDashboardPath(role: string | undefined | null): string {
  if (isAdmin(role)) return "/admin/dashboard";
  if (isBusiness(role)) return "/business/dashboard";
  return "/account";
}

/** Chemins dashboard — utilisé par MobilePageShell pour détecter le contexte. */
export const DASHBOARD_PATHS = ["/account", "/business/dashboard", "/admin/dashboard"] as const;
