/**
 * Currency Service — Conversion de devises centralisée pour Kin-Sell.
 *
 * Lit les taux depuis la table CurrencyRate (Prisma).
 * Cache mémoire avec TTL de 1h pour éviter des requêtes DB à chaque conversion.
 * Fallback hardcodé si aucun taux en base.
 *
 * Devise de référence interne : USD
 * Tous les prix stockés en priceUsdCents, conversion à l'affichage.
 */

import { prisma } from "../db/prisma.js";
import { getActiveCurrencies } from "../../config/platform.js";

/** Taux de fallback (approximatifs, utilisés si la DB est vide) */
const FALLBACK_RATES: Record<string, number> = {
  "USD:CDF": 2850,
  "USD:EUR": 0.92,
  "USD:XAF": 605,
  "USD:AOA": 905,
  "USD:XOF": 605,
  "USD:GNF": 8600,
  "USD:MAD": 9.9,
  "CDF:USD": 1 / 2850,
  "EUR:USD": 1 / 0.92,
  "XAF:USD": 1 / 605,
  "AOA:USD": 1 / 905,
  "XOF:USD": 1 / 605,
  "GNF:USD": 1 / 8600,
  "MAD:USD": 1 / 9.9,
};

/** Cache en mémoire */
let _ratesCache: Map<string, number> = new Map();
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

/**
 * Charge tous les taux depuis la table CurrencyRate.
 */
async function loadRatesFromDb(): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  try {
    const dbRates = await prisma.currencyRate.findMany();
    for (const r of dbRates) {
      rates.set(`${r.fromCurrency}:${r.toCurrency}`, r.rate);
    }
  } catch (err) {
    console.warn("[CurrencyService] Erreur chargement taux DB, utilisation fallback:", err);
  }
  return rates;
}

/**
 * Retourne le cache des taux, le rafraîchit si expiré.
 */
async function getRatesCache(): Promise<Map<string, number>> {
  const now = Date.now();
  if (now - _cacheTimestamp > CACHE_TTL_MS || _ratesCache.size === 0) {
    _ratesCache = await loadRatesFromDb();
    _cacheTimestamp = now;
  }
  return _ratesCache;
}

/**
 * Cherche un taux de conversion entre deux devises.
 *
 * 1. Cherche la paire directe (ex: USD:MAD)
 * 2. Si pas trouvé, cherche via USD comme pivot (ex: CDF:MAD = CDF→USD * USD→MAD)
 * 3. Fallback hardcodé si rien en base
 */
export async function getCurrencyRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const cache = await getRatesCache();
  const key = `${from}:${to}`;

  // Paire directe en cache DB
  const direct = cache.get(key);
  if (direct !== undefined) return direct;

  // Paire inverse
  const inverse = cache.get(`${to}:${from}`);
  if (inverse !== undefined && inverse !== 0) return 1 / inverse;

  // Via pivot USD
  if (from !== "USD" && to !== "USD") {
    const fromToUsd = cache.get(`${from}:USD`) ?? (cache.has(`USD:${from}`) ? 1 / cache.get(`USD:${from}`)! : undefined);
    const usdToTo = cache.get(`USD:${to}`) ?? (cache.has(`${to}:USD`) ? 1 / cache.get(`${to}:USD`)! : undefined);
    if (fromToUsd !== undefined && usdToTo !== undefined) {
      return fromToUsd * usdToTo;
    }
  }

  // Fallback hardcodé
  const fallback = FALLBACK_RATES[key];
  if (fallback !== undefined) return fallback;

  // Fallback inverse
  const fallbackInv = FALLBACK_RATES[`${to}:${from}`];
  if (fallbackInv !== undefined && fallbackInv !== 0) return 1 / fallbackInv;

  // Fallback via pivot USD
  if (from !== "USD" && to !== "USD") {
    const fbFromUsd = FALLBACK_RATES[`${from}:USD`] ?? (FALLBACK_RATES[`USD:${from}`] ? 1 / FALLBACK_RATES[`USD:${from}`] : undefined);
    const fbUsdToTo = FALLBACK_RATES[`USD:${to}`] ?? (FALLBACK_RATES[`${to}:USD`] ? 1 / FALLBACK_RATES[`${to}:USD`] : undefined);
    if (fbFromUsd !== undefined && fbUsdToTo !== undefined) {
      return fbFromUsd * fbUsdToTo;
    }
  }

  console.warn(`[CurrencyService] Aucun taux trouvé pour ${key}, retourne 1`);
  return 1;
}

/**
 * Convertit un montant en centimes d'une devise à une autre.
 */
export async function convertAmount(amountCents: number, from: string, to: string): Promise<number> {
  if (from === to) return amountCents;
  const rate = await getCurrencyRate(from, to);
  return Math.round(amountCents * rate);
}

/**
 * Retourne tous les taux depuis USD vers les devises supportées.
 * Utilisé par l'endpoint GET /market/rates.
 */
export async function getAllRatesFromUsd(): Promise<Record<string, number>> {
  const targets = getActiveCurrencies().filter((c) => c !== "USD");
  const result: Record<string, number> = { USD: 1 };

  for (const to of targets) {
    result[to] = await getCurrencyRate("USD", to);
  }

  return result;
}

/**
 * Force le rafraîchissement du cache (après un update admin).
 */
export function invalidateCurrencyCache(): void {
  _cacheTimestamp = 0;
  _ratesCache.clear();
}
