/**
 * MARKET SHARED — Source unique de vérité prix & demande
 *
 * Utilisé par : analytics-ai, negotiation-ai, ad-advisor, market-intelligence
 *
 * Constantes harmonisées :
 * - Seuil position prix  : ±15% de la médiane
 * - Fenêtre tendances     : 7 jours
 * - Fenêtre prix          : 30 jours
 * - DemandScore           : basé sur négociations / listings (pas listing count)
 */

import { prisma } from "../../shared/db/prisma.js";

// ── Constantes harmonisées ──

export const PRICE_THRESHOLD_PERCENT = 15;
export const TREND_WINDOW_DAYS = 7;
export const PRICE_WINDOW_DAYS = 30;

// ── Types ──

export interface MarketMedian {
  medianPriceCents: number;
  sampleSize: number;
  source: "MARKET_STATS" | "LIVE_LISTINGS";
}

export interface MarketDemand {
  demandScore: number; // 0-100
  demandLevel: "LOW" | "MEDIUM" | "HIGH";
  source: "MARKET_STATS" | "LIVE_NEGOTIATIONS";
}

export type PricePosition = "BELOW_MARKET" | "ON_MARKET" | "ABOVE_MARKET";

export interface PricePositionResult {
  position: PricePosition;
  diffPercent: number;
  message: string;
}

// ── Prix médian — source unique ──

/**
 * Retourne le prix médian pour une catégorie + ville (optionnel).
 * Priorité : MarketStats pré-calculé → fallback listings live.
 */
export async function getMarketMedian(category: string, city?: string): Promise<MarketMedian> {
  // 1. Tenter MarketStats
  if (city) {
    const marketCity = await prisma.marketCity.findFirst({
      where: { city: { equals: city, mode: "insensitive" } },
    });
    if (marketCity) {
      const stats = await prisma.marketStats.findFirst({
        where: { marketCityId: marketCity.id, category },
        orderBy: { periodEnd: "desc" },
      });
      if (stats) {
        return {
          medianPriceCents: stats.medianPriceUsdCents,
          sampleSize: stats.sampleSize,
          source: "MARKET_STATS",
        };
      }
    }
  }

  // 2. Fallback : listings live
  const where: any = { category, status: "ACTIVE", priceUsdCents: { gt: 0 } };
  if (city) where.city = { equals: city, mode: "insensitive" };

  const listings = await prisma.listing.findMany({
    where,
    select: { priceUsdCents: true },
    orderBy: { priceUsdCents: "asc" },
    take: 200,
  });

  if (listings.length === 0) {
    return { medianPriceCents: 0, sampleSize: 0, source: "LIVE_LISTINGS" };
  }

  const prices = listings.map((l) => l.priceUsdCents);
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 !== 0 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);

  return { medianPriceCents: median, sampleSize: prices.length, source: "LIVE_LISTINGS" };
}

// ── Demand Score — source unique ──

/**
 * Calcule le score de demande pour une catégorie.
 * Basé sur le ratio négociations / listings actifs sur 30j.
 */
export async function getMarketDemand(category: string): Promise<MarketDemand> {
  const thirtyDaysAgo = new Date(Date.now() - PRICE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [activeListings, totalNegos] = await Promise.all([
    prisma.listing.count({ where: { category, status: "ACTIVE" } }),
    prisma.negotiation.count({
      where: { listing: { category }, createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  let demandScore: number;
  if (activeListings === 0) {
    demandScore = totalNegos > 0 ? 100 : 0;
  } else {
    const ratio = totalNegos / activeListings;
    demandScore = Math.min(100, Math.round(ratio * 50));
  }

  const demandLevel: MarketDemand["demandLevel"] =
    demandScore >= 70 ? "HIGH" : demandScore >= 30 ? "MEDIUM" : "LOW";

  return { demandScore, demandLevel, source: "LIVE_NEGOTIATIONS" };
}

// ── Position prix — harmonisée ──

/**
 * Compare un prix donné à la médiane du marché.
 * Seuil unique : ±15%.
 */
export function computePricePosition(
  priceCents: number,
  medianCents: number
): PricePositionResult {
  if (medianCents === 0) {
    return { position: "ON_MARKET", diffPercent: 0, message: "Pas de données marché disponibles." };
  }

  const diff = priceCents - medianCents;
  const diffPercent = Math.round((diff / medianCents) * 100);

  if (diffPercent > PRICE_THRESHOLD_PERCENT) {
    return {
      position: "ABOVE_MARKET",
      diffPercent,
      message: `Prix ${diffPercent}% au-dessus du marché. Ajustez pour attirer plus d'acheteurs.`,
    };
  }
  if (diffPercent < -PRICE_THRESHOLD_PERCENT) {
    return {
      position: "BELOW_MARKET",
      diffPercent,
      message: `Prix ${Math.abs(diffPercent)}% sous le marché. Augmentez votre marge.`,
    };
  }
  return {
    position: "ON_MARKET",
    diffPercent,
    message: "Prix bien aligné avec le marché local. 👍",
  };
}

// ── Tendances catégorielles — source unique ──

/**
 * Retourne les catégories tendances (7 derniers jours).
 * Priorité : table SoKinTrend → fallback groupBy listings.
 */
export async function getTrendingCategories(limit = 5): Promise<string[]> {
  // 1. SoKinTrend (source principale si computée)
  const trends = await prisma.soKinTrend.findMany({
    where: { type: "CATEGORY", isActive: true },
    orderBy: { score: "desc" },
    take: limit,
    select: { title: true },
  });

  if (trends.length >= 2) {
    return trends.map((t) => t.title);
  }

  // 2. Fallback : groupBy listings
  const sevenDaysAgo = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const raw = await prisma.listing.groupBy({
    by: ["category"],
    where: { status: "ACTIVE", createdAt: { gte: sevenDaysAgo } },
    _count: { category: true },
    orderBy: { _count: { category: "desc" } },
    take: limit,
  });

  return raw.map((t) => t.category);
}
