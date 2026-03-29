/**
 * Retourne le chemin du dashboard privé en fonction du rôle utilisateur.
 * Utilisé partout où un lien /account était autrefois codé en dur.
 */
export function getDashboardPath(role: string | undefined | null): string {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "/admin/dashboard";
  if (role === "BUSINESS") return "/business/dashboard";
  return "/account";
}
