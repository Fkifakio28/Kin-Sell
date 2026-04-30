/**
 * Accès freemium aux recommandations IA (cohérent entre sessions).
 *
 * Règles définies produit :
 *   - Reco index 0 → toujours gratuite
 *   - Reco index 1 → 15% de chance d'être gratuite (sinon floutée)
 *   - Reco index 2 → 5% de chance d'être gratuite (sinon floutée)
 *   - Reco index ≥ 3 → toujours floutée (forfait requis)
 *
 * Un forfait avec `hasAnalytics=true` débloque tout.
 *
 * La décision est déterministe : basée sur un hash stable
 * `userId + date du jour + index` (change au pire une fois par jour).
 */

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  // normalise 0..999
  return Math.abs(hash) % 1000;
}

/** seuils en ‰ pour correspondre à l'échelle 0..999 */
const FREE_THRESHOLDS_PERMILLE: Record<number, number> = {
  0: 1000, // 100% gratuit
  1: 150,  // 15% gratuit
  2: 50,   // 5% gratuit
};

export function isRecommendationFree(
  index: number,
  userId: string | null | undefined,
  hasFullAccess: boolean,
  dateStr?: string,
): boolean {
  if (hasFullAccess) return true;
  if (index < 0) return false;
  const threshold = FREE_THRESHOLDS_PERMILLE[index];
  if (threshold === undefined) return false; // index ≥ 3 → toujours payant
  if (threshold >= 1000) return true;
  if (!userId) return false;
  const day = dateStr ?? new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const score = stableHash(`${userId}::${day}::${index}`); // 0..999
  return score < threshold;
}
