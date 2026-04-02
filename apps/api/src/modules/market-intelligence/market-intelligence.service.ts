/**
 * MARKET INTELLIGENCE — IA enrichissement marché local
 *
 * Base de données enrichie par ville/pays.
 * Kinshasa (Congo-Kinshasa) est la ville initiale.
 * Extensible à d'autres villes/pays.
 */

import { prisma } from "../../shared/db/prisma.js";
import { computePricePosition, getMarketDemand, PRICE_THRESHOLD_PERCENT } from "../../shared/market/market-shared.js";
import { CountryCode } from "@prisma/client";

// ── Types ──

export interface MarketPriceInfo {
  category: string;
  city: string;
  country: string;
  avgPriceUsdCents: number;
  minPriceUsdCents: number;
  maxPriceUsdCents: number;
  medianPriceUsdCents: number;
  sampleSize: number;
  trendDirection: string;
  demandScore: number;
  updatedAt: Date;
}

export interface PriceRecommendation {
  suggestedPriceUsdCents: number;
  marketAvgUsdCents: number;
  position: "BELOW_MARKET" | "ON_MARKET" | "ABOVE_MARKET";
  advice: string;
  demandLevel: "LOW" | "MEDIUM" | "HIGH";
}

// ── Villes ──

export async function getCities(countryCode?: string) {
  const where: any = {};
  if (countryCode) where.countryCode = countryCode;
  return prisma.marketCity.findMany({ where, orderBy: { city: "asc" } });
}

export async function getOrCreateCity(
  cityName: string,
  country: string,
  countryCode: string,
  currency = "CDF"
) {
  const normalizedCountryCode = (countryCode ?? "").toUpperCase();
  const safeCountryCode = (Object.values(CountryCode) as string[]).includes(normalizedCountryCode)
    ? (normalizedCountryCode as CountryCode)
    : CountryCode.CD;

  const existing = await prisma.marketCity.findFirst({
    where: { city: { equals: cityName, mode: "insensitive" }, countryCode: safeCountryCode },
  });
  if (existing) return existing;
  return prisma.marketCity.create({
    data: {
      city: cityName.trim(),
      country,
      countryCode: safeCountryCode,
      currency,
      marketCountry: { connect: { code: safeCountryCode } },
    },
  });
}

// ── Stats marché ──

export async function getMarketStats(cityId: string, category?: string): Promise<MarketPriceInfo[]> {
  const where: any = { marketCityId: cityId };
  if (category) where.category = category;

  const stats = await prisma.marketStats.findMany({
    where,
    include: { marketCity: true },
    orderBy: { demandScore: "desc" },
  });

  return stats.map((s) => ({
    category: s.category,
    city: s.marketCity.city,
    country: s.marketCity.country,
    avgPriceUsdCents: s.avgPriceUsdCents,
    minPriceUsdCents: s.minPriceUsdCents,
    maxPriceUsdCents: s.maxPriceUsdCents,
    medianPriceUsdCents: s.medianPriceUsdCents,
    sampleSize: s.sampleSize,
    trendDirection: s.trendDirection,
    demandScore: s.demandScore,
    updatedAt: s.updatedAt,
  }));
}

export async function upsertMarketStats(data: {
  marketCityId: string;
  category: string;
  avgPriceUsdCents: number;
  minPriceUsdCents: number;
  maxPriceUsdCents: number;
  medianPriceUsdCents: number;
  sampleSize: number;
  trendDirection: string;
  demandScore: number;
  dataSource: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  const existing = await prisma.marketStats.findFirst({
    where: { marketCityId: data.marketCityId, category: data.category, periodStart: data.periodStart },
  });
  if (existing) {
    return prisma.marketStats.update({ where: { id: existing.id }, data });
  }
  return prisma.marketStats.create({ data });
}

// ── Recommandation de prix ──

export async function getPriceRecommendation(
  category: string,
  cityName: string,
  sellerPriceUsdCents: number
): Promise<PriceRecommendation> {
  const city = await prisma.marketCity.findFirst({
    where: { city: { equals: cityName, mode: "insensitive" } },
  });

  if (!city) {
    return {
      suggestedPriceUsdCents: sellerPriceUsdCents,
      marketAvgUsdCents: 0,
      position: "ON_MARKET",
      advice: "Aucune donnée marché disponible pour cette ville.",
      demandLevel: "MEDIUM",
    };
  }

  const stats = await prisma.marketStats.findFirst({
    where: { marketCityId: city.id, category },
    orderBy: { periodEnd: "desc" },
  });

  if (!stats) {
    return {
      suggestedPriceUsdCents: sellerPriceUsdCents,
      marketAvgUsdCents: 0,
      position: "ON_MARKET",
      advice: "Pas encore de données marché pour cette catégorie à " + city.city + ".",
      demandLevel: "MEDIUM",
    };
  }

  const avg = stats.avgPriceUsdCents;
  const median = stats.medianPriceUsdCents;
  const pricePos = computePricePosition(sellerPriceUsdCents, median);

  const demandData = await getMarketDemand(category);

  return {
    suggestedPriceUsdCents: Math.round(avg * (demandData.demandLevel === "HIGH" ? 1.05 : demandData.demandLevel === "LOW" ? 0.9 : 1.0)),
    marketAvgUsdCents: avg,
    position: pricePos.position,
    advice: pricePos.message.replace("marché local", `marché à ${city.city}`),
    demandLevel: demandData.demandLevel,
  };
}

// ── Auto-enrichissement depuis listings réels ──

export async function refreshMarketStatsFromListings(cityName: string) {
  const city = await prisma.marketCity.findFirst({
    where: { city: { equals: cityName, mode: "insensitive" } },
  });
  if (!city) return [];

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const listings = await prisma.listing.findMany({
    where: {
      city: { equals: city.city, mode: "insensitive" },
      status: "ACTIVE",
      createdAt: { gte: thirtyDaysAgo },
    },
    select: { category: true, priceUsdCents: true },
  });

  const grouped: Record<string, number[]> = {};
  for (const l of listings) {
    if (!grouped[l.category]) grouped[l.category] = [];
    grouped[l.category].push(l.priceUsdCents);
  }

  const results = [];
  for (const [category, prices] of Object.entries(grouped)) {
    if (prices.length < 2) continue;
    prices.sort((a, b) => a - b);
    const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    // DemandScore basé sur le ratio négociations/listings (source unique market-shared)
    const demandData = await getMarketDemand(category);
    const result = await upsertMarketStats({
      marketCityId: city.id,
      category,
      avgPriceUsdCents: avg,
      minPriceUsdCents: prices[0],
      maxPriceUsdCents: prices[prices.length - 1],
      medianPriceUsdCents: prices[Math.floor(prices.length / 2)],
      sampleSize: prices.length,
      trendDirection: "STABLE",
      demandScore: demandData.demandScore,
      dataSource: "PLATFORM",
      periodStart: thirtyDaysAgo,
      periodEnd: now,
    });
    results.push(result);
  }
  return results;
}
