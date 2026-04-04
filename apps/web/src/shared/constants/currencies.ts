/**
 * Taux de conversion par défaut USD → autres devises.
 * Source unique — interdiction de hardcoder "2850" ailleurs.
 */
export const DEFAULT_CURRENCY_RATES: Record<string, number> = {
  CDF: 2850,
  EUR: 0.92,
  XAF: 605,
  AOA: 905,
  XOF: 605,
  GNF: 8600,
  MAD: 9.9,
};

export const USD_TO_CDF_RATE = DEFAULT_CURRENCY_RATES.CDF;

/** Convertit un montant en centimes USD vers CDF entier. */
export function usdCentsToCdf(usdCents: number): number {
  return Math.round((usdCents / 100) * USD_TO_CDF_RATE);
}

/** Formate un montant CDF en notation lisible (K / M). */
export function formatCdfCompact(cdf: number): string {
  if (cdf >= 1_000_000) return `${(cdf / 1_000_000).toFixed(1)} M CDF`;
  return `${Math.round(cdf / 1_000)} K CDF`;
}
