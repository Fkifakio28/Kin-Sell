/**
 * FX Service — Taux de change pour Kin-Sell Analytique+
 *
 * Source primaire : Frankfurter.app (ECB, gratuit, sans clé, fiable)
 *   https://api.frankfurter.app/latest?from=EUR&to=MAD,XOF,XAF
 *
 * Devises supportées nativement par Frankfurter : MAD, XOF, XAF
 * Devises non-listées (CDF, GNF, AOA) : on utilise les taux de la table
 * CurrencyRate (Prisma) comme source secondaire (mise à jour via worker existant).
 *
 * Cache Redis 24h — clé `ks:market:fx:EUR:{CUR}`.
 * Fallback mémoire si Redis indispo.
 *
 * API :
 *   const rate = await getEurRate("MAD");      // EUR → MAD, ex: 10.8
 *   const cents = await toEurCents(5000, "MAD"); // 5000 MAD → EUR cents
 */

import { env } from "../../../config/env.js";
import { getRedis } from "../../../shared/db/redis.js";
import { logger } from "../../../shared/logger.js";
import { getCurrencyRate } from "../../../shared/market/currency.service.js";

const CACHE_TTL_SECONDS = 24 * 60 * 60;
const MEMORY_FALLBACK_TTL_MS = CACHE_TTL_SECONDS * 1000;

const FRANKFURTER_SUPPORTED = new Set(["EUR", "USD", "MAD", "XOF", "XAF", "GBP"]);

/** Fallback approximatif au 2026-04-22 (aligné sur currency.service.ts) */
const FALLBACK_EUR_RATES: Record<string, number> = {
  MAD: 10.85,
  XOF: 655.957, // parité fixe CFA
  XAF: 655.957, // parité fixe CFA
  CDF: 2950,
  GNF: 9350,
  AOA: 985,
  EUR: 1,
  USD: 1.08,
};

type Cached = { rate: number; fetchedAt: number };
const memoryCache = new Map<string, Cached>();

function memKey(to: string): string {
  return `ks:market:fx:EUR:${to.toUpperCase()}`;
}

async function fetchFrankfurter(to: string): Promise<number | null> {
  const url = `${env.FRANKFURTER_API_URL}/latest?from=EUR&to=${encodeURIComponent(to)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.MARKET_INTEL_FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: { "User-Agent": env.MARKET_INTEL_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      logger.warn({ status: res.status, to }, "[fx] Frankfurter non-OK");
      return null;
    }
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json?.rates?.[to.toUpperCase()];
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch (err: any) {
    logger.warn({ err: err?.message, to }, "[fx] Frankfurter fetch error");
    return null;
  }
}

async function getFromCurrencyTable(to: string): Promise<number | null> {
  try {
    // EUR → to = (EUR→USD) * (USD→to)
    const eurUsd = await getCurrencyRate("EUR", "USD");
    const usdTo = await getCurrencyRate("USD", to);
    if (eurUsd > 0 && usdTo > 0) return eurUsd * usdTo;
    return null;
  } catch {
    return null;
  }
}

/**
 * Retourne le taux EUR → `to`. Source (dans l'ordre) :
 *  1) Cache Redis 24h
 *  2) Frankfurter.app (si devise supportée)
 *  3) Table CurrencyRate via currency.service
 *  4) Fallback hardcodé
 */
export async function getEurRate(to: string): Promise<number> {
  const toUp = to.toUpperCase();
  if (toUp === "EUR") return 1;

  const key = memKey(toUp);
  const redis = getRedis();

  // 1) Redis
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        const rate = Number.parseFloat(cached);
        if (Number.isFinite(rate) && rate > 0) return rate;
      }
    } catch {
      /* fallthrough */
    }
  } else {
    // 1b) mémoire
    const mem = memoryCache.get(key);
    if (mem && Date.now() - mem.fetchedAt < MEMORY_FALLBACK_TTL_MS) return mem.rate;
  }

  // 2) Frankfurter
  let rate: number | null = null;
  if (FRANKFURTER_SUPPORTED.has(toUp)) {
    rate = await fetchFrankfurter(toUp);
  }

  // 3) Table CurrencyRate (pour CDF, GNF, AOA notamment)
  if (rate === null) {
    rate = await getFromCurrencyTable(toUp);
  }

  // 4) Fallback hardcodé
  if (rate === null) {
    rate = FALLBACK_EUR_RATES[toUp] ?? null;
    if (rate === null) {
      logger.error({ to }, "[fx] Aucun taux disponible, renvoi 1.0");
      return 1;
    }
  }

  // Cache
  if (redis) {
    try {
      await redis.set(key, String(rate), "EX", CACHE_TTL_SECONDS);
    } catch {
      /* ignore */
    }
  } else {
    memoryCache.set(key, { rate, fetchedAt: Date.now() });
  }

  return rate;
}

/**
 * Convertit `amountLocal` (dans la devise `currency`) en EUR cents (INT).
 * Ex: toEurCents(5000, "MAD") → ~46100 (= 4.61 EUR × 100)
 */
export async function toEurCents(amountLocal: number, currency: string): Promise<number> {
  if (!Number.isFinite(amountLocal) || amountLocal <= 0) return 0;
  const eurRate = await getEurRate(currency); // EUR → currency
  if (!Number.isFinite(eurRate) || eurRate <= 0) return 0;
  const eur = amountLocal / eurRate;
  return Math.round(eur * 100);
}
