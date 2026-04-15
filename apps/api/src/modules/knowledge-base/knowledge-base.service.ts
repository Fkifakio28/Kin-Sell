/**
 * KNOWLEDGE BASE SERVICE — Kin-Sell
 *
 * Service principal de la base de connaissances IA.
 * Gère :
 *  1. Données EXTERNES (~2GB) — catalogue produits africains, routes commerciales,
 *     insights business, patterns saisonniers
 *  2. Données INTERNES (~2GB) — agrégats des transactions, négociations, commandes
 *     et tendances observées sur la plateforme Kin-Sell
 *  3. FUSION des deux bases — blend intelligent pour fournir aux moteurs IA
 *     (IA Commande, IA Marchand, Kin-Sell Analytics) des insights de qualité supérieure
 */

import { prisma } from "../../shared/db/prisma.js";
import { CountryCode } from "../../shared/db/prisma-enums.js";
import { logger } from "../../shared/logger.js";

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

export interface KBPriceIntel {
  productName: string;
  category: string;
  subcategory: string;
  avgPriceUsdCents: number;
  minPriceUsdCents: number;
  maxPriceUsdCents: number;
  localCurrency: string;
  avgPriceLocal: number;
  margin: number;
  demandLevel: string;
  supplyLevel: string;
  volatility: string;
  seasonalMultiplier: number;
  confidence: number;
  source: "EXTERNAL" | "INTERNAL" | "BLENDED";
}

export interface KBTradeIntel {
  sourceCity: string;
  destCity: string;
  category: string;
  topProducts: string[];
  avgMarkupPercent: number;
  avgTransitDays: number;
  volumeLevel: string;
  tradeVolumeTrend: string;
  confidence: number;
}

export interface KBBusinessIntel {
  sector: string;
  businessType: string;
  avgMonthlyRevenue: number;
  avgMarginPercent: number;
  topSellingItems: string[];
  successFactors: string[];
  challengesList: string[];
  growthTrend: string;
  digitalAdoption: string;
  confidence: number;
}

export interface KBBlendedInsight {
  category: string;
  subcategory?: string;
  city?: string;
  countryCode: string;
  /** Prix référence externe */
  externalAvgPrice: number;
  /** Prix moyen observé en interne */
  internalAvgPrice: number | null;
  /** Prix recommandé (blend) */
  blendedPrice: number;
  /** Demande composite (0-100) */
  demandScore: number;
  /** Santé du marché (0-100) */
  marketHealthScore: number;
  /** Marge suggérée */
  suggestedMargin: number;
  /** Tendance de prix (UP, DOWN, STABLE) */
  priceTrend: string;
  /** Score de confiance total (0-100) */
  confidence: number;
  /** Facteur saisonnier actif */
  seasonalFactor: number;
  /** Ratio données internes vs externes */
  internalWeight: number;
}

// ══════════════════════════════════════════════════════════════
// REQUÊTES KNOWLEDGE BASE EXTERNE
// ══════════════════════════════════════════════════════════════

/** Obtenir les prix de référence d'un produit/catégorie dans un pays/ville */
export async function getExternalPriceIntel(
  category: string,
  countryCode: string,
  city?: string,
  subcategory?: string,
): Promise<KBPriceIntel[]> {
  const where: any = {
    category: { equals: category, mode: "insensitive" },
    countryCode: countryCode as CountryCode,
  };
  if (city) where.city = { equals: city, mode: "insensitive" };
  if (subcategory) where.subcategory = { equals: subcategory, mode: "insensitive" };

  const products = await prisma.marketProductCatalog.findMany({
    where,
    orderBy: { demandLevel: "desc" },
    take: 50,
  });

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12

  // Récupérer les facteurs saisonniers applicables
  const seasonalPatterns = await prisma.marketSeasonalPattern.findMany({
    where: {
      countryCode: countryCode as CountryCode,
      category: { equals: category, mode: "insensitive" },
    },
  });

  return products.map((p) => {
    const seasonal = seasonalPatterns.find((sp) => {
      if (sp.monthStart <= sp.monthEnd) {
        return currentMonth >= sp.monthStart && currentMonth <= sp.monthEnd;
      }
      // Période qui chevauche le nouvel an (ex: nov-jan)
      return currentMonth >= sp.monthStart || currentMonth <= sp.monthEnd;
    });

    return {
      productName: p.productName,
      category: p.category,
      subcategory: p.subcategory,
      avgPriceUsdCents: p.avgPriceUsdCents,
      minPriceUsdCents: p.minPriceUsdCents,
      maxPriceUsdCents: p.maxPriceUsdCents,
      localCurrency: p.localCurrency,
      avgPriceLocal: p.avgPriceLocal,
      margin: p.margin,
      demandLevel: p.demandLevel,
      supplyLevel: p.supplyLevel,
      volatility: p.volatility,
      seasonalMultiplier: seasonal ? seasonal.priceMultiplier : 1.0,
      confidence: p.confidence,
      source: "EXTERNAL" as const,
    };
  });
}

/** Obtenir les routes commerciales depuis/vers un pays */
export async function getTradeRoutes(
  countryCode: string,
  direction: "FROM" | "TO" | "BOTH" = "BOTH",
  category?: string,
): Promise<KBTradeIntel[]> {
  const where: any = {};
  if (direction === "FROM") where.sourceCountryCode = countryCode as CountryCode;
  else if (direction === "TO") where.destCountryCode = countryCode as CountryCode;
  else {
    where.OR = [
      { sourceCountryCode: countryCode as CountryCode },
      { destCountryCode: countryCode as CountryCode },
    ];
  }
  if (category) where.category = { equals: category, mode: "insensitive" };

  const routes = await prisma.marketTradeRoute.findMany({ where, orderBy: { volumeLevel: "desc" } });

  return routes.map((r) => ({
    sourceCity: r.sourceCity,
    destCity: r.destCity,
    category: r.category,
    topProducts: r.topProducts,
    avgMarkupPercent: r.avgMarkupPercent,
    avgTransitDays: r.avgTransitDays,
    volumeLevel: r.volumeLevel,
    tradeVolumeTrend: r.tradeVolumeTrend,
    confidence: r.confidence,
  }));
}

/** Obtenir les insights business pour un secteur dans une région */
export async function getBusinessInsights(
  countryCode: string,
  sector?: string,
): Promise<KBBusinessIntel[]> {
  const where: any = { countryCode: countryCode as CountryCode };
  if (sector) where.sector = { equals: sector, mode: "insensitive" };

  const insights = await prisma.marketBusinessInsight.findMany({
    where,
    orderBy: { growthTrend: "asc" },
  });

  return insights.map((i) => ({
    sector: i.sector,
    businessType: i.businessType,
    avgMonthlyRevenue: i.avgMonthlyRevenue,
    avgMarginPercent: i.avgMarginPercent,
    topSellingItems: i.topSellingItems,
    successFactors: i.successFactors,
    challengesList: i.challengesList,
    growthTrend: i.growthTrend,
    digitalAdoption: i.digitalAdoption,
    confidence: i.confidence,
  }));
}

// ══════════════════════════════════════════════════════════════
// COLLECTE DONNÉES INTERNES — Agrège les transactions Kin-Sell
// ══════════════════════════════════════════════════════════════

/** Collecte quotidienne des données internes et stockage en insights agrégés */
export async function collectInternalDailyInsights(): Promise<{
  categoriesProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
}> {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  let recordsCreated = 0;
  let recordsUpdated = 0;

  // Agrégation des commandes complétées par catégorie/ville/pays
  const orderAggregates = await prisma.orderItem.groupBy({
    by: ["category"],
    where: {
      order: {
        status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] },
        createdAt: { gte: dayStart, lt: dayEnd },
      },
    },
    _count: { id: true },
    _sum: { unitPriceUsdCents: true },
    _avg: { unitPriceUsdCents: true },
    _min: { unitPriceUsdCents: true },
    _max: { unitPriceUsdCents: true },
  });

  // Agrégation des négociations
  const negoAggregates = await prisma.negotiation.groupBy({
    by: ["status"],
    where: {
      createdAt: { gte: dayStart, lt: dayEnd },
    },
    _count: { id: true },
  });

  const totalNegos = negoAggregates.reduce((sum, n) => sum + n._count.id, 0);
  const acceptedNegos = negoAggregates.find((n) => n.status === "ACCEPTED")?._count.id ?? 0;
  const negoAcceptRate = totalNegos > 0 ? (acceptedNegos / totalNegos) * 100 : 0;

  // Agrégation remises moyennes (négociations acceptées)
  const discountStats = await prisma.negotiation.aggregate({
    where: {
      status: "ACCEPTED",
      createdAt: { gte: dayStart, lt: dayEnd },
      finalPriceUsdCents: { not: null },
    },
    _avg: { originalPriceUsdCents: true, finalPriceUsdCents: true },
  });

  const avgDiscount =
    discountStats._avg.originalPriceUsdCents && discountStats._avg.finalPriceUsdCents
      ? ((discountStats._avg.originalPriceUsdCents - discountStats._avg.finalPriceUsdCents) /
          discountStats._avg.originalPriceUsdCents) * 100
      : 0;

  // Commandes annulées (taux retour)
  const canceledOrders = await prisma.order.count({
    where: { status: "CANCELED", createdAt: { gte: dayStart, lt: dayEnd } },
  });
  const totalOrders = await prisma.order.count({
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  });
  const returnRate = totalOrders > 0 ? (canceledOrders / totalOrders) * 100 : 0;

  // Transactions inter-pays
  const crossBorderOrders = await prisma.order.count({
    where: {
      createdAt: { gte: dayStart, lt: dayEnd },
      NOT: { deliveryCountry: null },
    },
  });
  const crossBorderPercent = totalOrders > 0 ? (crossBorderOrders / totalOrders) * 100 : 0;

  for (const agg of orderAggregates) {
    const category = agg.category || "Autre";
    const sampleSize = agg._count.id;
    const confidenceScore = Math.min(100, sampleSize * 5); // 20 transactions = 100% confiance
    const marketHealthScore = Math.min(100, Math.round(
      (sampleSize > 0 ? 30 : 0) +
      (negoAcceptRate > 50 ? 20 : negoAcceptRate > 25 ? 10 : 0) +
      (returnRate < 10 ? 25 : returnRate < 20 ? 15 : 5) +
      (avgDiscount < 30 ? 25 : avgDiscount < 50 ? 15 : 5)
    ));

    const sorted = await prisma.orderItem.findMany({
      where: {
        category,
        order: { createdAt: { gte: dayStart, lt: dayEnd } },
      },
      select: { unitPriceUsdCents: true },
      orderBy: { unitPriceUsdCents: "asc" },
    });
    const medianPrice = sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)].unitPriceUsdCents
      : 0;

    try {
      const existing = await prisma.internalTransactionInsight.findFirst({
        where: {
          periodType: "DAILY",
          periodStart: dayStart,
          countryCode: null,
          city: null,
          category,
        },
      });

      const data = {
        periodType: "DAILY" as const,
        periodStart: dayStart,
        periodEnd: dayEnd,
        category,
        totalOrders: sampleSize,
        totalRevenueCents: agg._sum.unitPriceUsdCents ?? 0,
        totalNegotiations: totalNegos,
        negoAcceptRate,
        avgDiscountPercent: avgDiscount,
        avgSellingPriceCents: Math.round(agg._avg.unitPriceUsdCents ?? 0),
        medianSellingPrice: medianPrice,
        minSellingPriceCents: agg._min.unitPriceUsdCents ?? 0,
        maxSellingPriceCents: agg._max.unitPriceUsdCents ?? 0,
        returnRate,
        crossBorderPercent,
        marketHealthScore,
        confidenceScore,
        sampleSize,
      };

      if (existing) {
        await prisma.internalTransactionInsight.update({ where: { id: existing.id }, data });
        recordsUpdated++;
      } else {
        await prisma.internalTransactionInsight.create({ data });
        recordsCreated++;
      }
    } catch (err) {
      logger.error(err, `[KB] Failed to upsert internal insight for ${category}`);
    }
  }

  return { categoriesProcessed: orderAggregates.length, recordsCreated, recordsUpdated };
}

/** Collecte hebdomadaire — agrège les insights quotidiens en résumés hebdo */
export async function collectInternalWeeklyInsights(): Promise<{
  categoriesProcessed: number;
  recordsCreated: number;
}> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(now);
  weekEnd.setHours(0, 0, 0, 0);

  let recordsCreated = 0;

  // Agrège les daily insights de la semaine
  const dailyInsights = await prisma.internalTransactionInsight.findMany({
    where: {
      periodType: "DAILY",
      periodStart: { gte: weekStart, lt: weekEnd },
    },
  });

  // Grouper par catégorie
  const grouped: Record<string, typeof dailyInsights> = {};
  for (const d of dailyInsights) {
    if (!grouped[d.category]) grouped[d.category] = [];
    grouped[d.category].push(d);
  }

  for (const [category, entries] of Object.entries(grouped)) {
    if (entries.length === 0) continue;

    const totalOrders = entries.reduce((s, e) => s + e.totalOrders, 0);
    const totalRevenue = entries.reduce((s, e) => s + e.totalRevenueCents, 0);
    const avgPrice = totalOrders > 0
      ? Math.round(entries.reduce((s, e) => s + e.avgSellingPriceCents * e.totalOrders, 0) / totalOrders)
      : 0;
    const avgNegoRate = entries.length > 0
      ? entries.reduce((s, e) => s + e.negoAcceptRate, 0) / entries.length
      : 0;
    const avgDiscount = entries.length > 0
      ? entries.reduce((s, e) => s + e.avgDiscountPercent, 0) / entries.length
      : 0;
    const avgHealth = entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + e.marketHealthScore, 0) / entries.length)
      : 50;
    const allPrices = entries.map((e) => e.medianSellingPrice).sort((a, b) => a - b);
    const medianPrice = allPrices[Math.floor(allPrices.length / 2)] ?? 0;

    try {
      await prisma.internalTransactionInsight.create({
        data: {
          periodType: "WEEKLY",
          periodStart: weekStart,
          periodEnd: weekEnd,
          category,
          totalOrders,
          totalRevenueCents: totalRevenue,
          avgSellingPriceCents: avgPrice,
          medianSellingPrice: medianPrice,
          minSellingPriceCents: Math.min(...entries.map((e) => e.minSellingPriceCents)),
          maxSellingPriceCents: Math.max(...entries.map((e) => e.maxSellingPriceCents)),
          negoAcceptRate: avgNegoRate,
          avgDiscountPercent: avgDiscount,
          returnRate: entries.reduce((s, e) => s + e.returnRate, 0) / entries.length,
          crossBorderPercent: entries.reduce((s, e) => s + e.crossBorderPercent, 0) / entries.length,
          marketHealthScore: avgHealth,
          confidenceScore: Math.min(100, totalOrders * 2),
          sampleSize: totalOrders,
        },
      });
      recordsCreated++;
    } catch {
      // Ignorer les duplicats (unique constraint)
    }
  }

  return { categoriesProcessed: Object.keys(grouped).length, recordsCreated };
}

// ══════════════════════════════════════════════════════════════
// FUSION / BLEND — Mélange intelligent des deux bases
// ══════════════════════════════════════════════════════════════

/**
 * Produit un insight blendé pour une catégorie/ville/pays.
 * Pondère les données internes vs externes selon la confiance et le volume.
 */
export async function getBlendedInsight(
  category: string,
  countryCode: string,
  city?: string,
): Promise<KBBlendedInsight | null> {
  // ── Données externes ──
  const externalProducts = await getExternalPriceIntel(category, countryCode, city);
  if (externalProducts.length === 0) return null;

  const extAvg = Math.round(
    externalProducts.reduce((s, p) => s + p.avgPriceUsdCents, 0) / externalProducts.length
  );
  const extConfidence = Math.round(
    externalProducts.reduce((s, p) => s + p.confidence, 0) / externalProducts.length
  );
  const extDemand = demandToScore(externalProducts[0].demandLevel);
  const extMargin = externalProducts.reduce((s, p) => s + p.margin, 0) / externalProducts.length;
  const seasonalFactor = externalProducts[0].seasonalMultiplier;

  // ── Données internes (30 derniers jours) ──
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const internalInsights = await prisma.internalTransactionInsight.findMany({
    where: {
      category: { equals: category, mode: "insensitive" },
      ...(countryCode ? { countryCode: countryCode as CountryCode } : {}),
      ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
      periodStart: { gte: thirtyDaysAgo },
      periodType: { in: ["DAILY", "WEEKLY"] },
    },
    orderBy: { periodStart: "desc" },
    take: 30,
  });

  const hasInternalData = internalInsights.length > 0;
  const intAvg = hasInternalData
    ? Math.round(internalInsights.reduce((s, i) => s + i.avgSellingPriceCents, 0) / internalInsights.length)
    : null;
  const intConfidence = hasInternalData
    ? Math.round(internalInsights.reduce((s, i) => s + i.confidenceScore, 0) / internalInsights.length)
    : 0;
  const intHealth = hasInternalData
    ? Math.round(internalInsights.reduce((s, i) => s + i.marketHealthScore, 0) / internalInsights.length)
    : 50;
  const intSampleSize = hasInternalData
    ? internalInsights.reduce((s, i) => s + i.sampleSize, 0)
    : 0;

  // ── Pondération interne vs externe ──
  // Plus on a de données internes, plus on les pondère
  let internalWeight: number;
  if (!hasInternalData || intSampleSize < 5) {
    internalWeight = 0; // Pas encore assez de données internes → externe uniquement
  } else if (intSampleSize < 20) {
    internalWeight = 0.2; // Début d'enrichissement interne
  } else if (intSampleSize < 50) {
    internalWeight = 0.4; // Bon volume → 40% interne
  } else if (intSampleSize < 200) {
    internalWeight = 0.6; // Volume significatif → interne dominant
  } else {
    internalWeight = 0.75; // Très haut volume → majoritairement interne
  }

  // Prix blendé
  const blendedPrice = intAvg !== null
    ? Math.round(intAvg * internalWeight + extAvg * (1 - internalWeight))
    : extAvg;

  // Demande composite
  const extDemandScore = extDemand;
  const intDemandScore = hasInternalData
    ? Math.min(100, Math.round(intSampleSize * 2))
    : extDemandScore;
  const demandScore = Math.round(
    intDemandScore * internalWeight + extDemandScore * (1 - internalWeight)
  );

  // Confiance composite
  const confidence = Math.round(
    intConfidence * internalWeight + extConfidence * (1 - internalWeight)
  );

  // Tendance de prix
  let priceTrend = "STABLE";
  if (hasInternalData && internalInsights.length >= 7) {
    const recentAvg = internalInsights.slice(0, 3).reduce((s, i) => s + i.avgSellingPriceCents, 0) / 3;
    const olderAvg = internalInsights.slice(-3).reduce((s, i) => s + i.avgSellingPriceCents, 0) / 3;
    if (olderAvg > 0) {
      const change = ((recentAvg - olderAvg) / olderAvg) * 100;
      if (change > 5) priceTrend = "UP";
      else if (change < -5) priceTrend = "DOWN";
    }
  }

  return {
    category,
    city: city ?? undefined,
    countryCode,
    externalAvgPrice: extAvg,
    internalAvgPrice: intAvg,
    blendedPrice,
    demandScore,
    marketHealthScore: intHealth,
    suggestedMargin: extMargin,
    priceTrend,
    confidence,
    seasonalFactor,
    internalWeight,
  };
}

// ══════════════════════════════════════════════════════════════
// REFRESH EXTERNE — Mise à jour automatique des données
// ══════════════════════════════════════════════════════════════

/**
 * Rafraîchit la base externe en recalculant les stats marché
 * à partir des listings réels de la plateforme + données existantes.
 * Appelé chaque nuit à minuit par le scheduler.
 */
export async function refreshExternalKnowledgeBase(): Promise<{
  productsUpdated: number;
  statsRefreshed: number;
}> {
  const log = await prisma.knowledgeBaseRefreshLog.create({
    data: {
      refreshType: "EXTERNAL_INCREMENTAL",
      sourceType: "PLATFORM",
      status: "RUNNING",
    },
  });

  const startTime = Date.now();
  let productsUpdated = 0;
  let statsRefreshed = 0;

  try {
    // 1. Rafraîchir les stats marché (MarketStats) depuis les listings actifs
    const cities = await prisma.marketCity.findMany({ where: { isActive: true } });
    for (const city of cities) {
      try {
        const { refreshMarketStatsFromListings } = await import(
          "../market-intelligence/market-intelligence.service.js"
        );
        const results = await refreshMarketStatsFromListings(city.city);
        statsRefreshed += results.length;
      } catch (err) {
        logger.error(err, `[KB] Failed to refresh stats for ${city.city}`);
      }
    }

    // 2. Mettre à jour le catalogue produits avec les prix réels observés
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const listingPrices = await prisma.listing.groupBy({
      by: ["category", "city", "countryCode"],
      where: {
        status: "ACTIVE",
        createdAt: { gte: thirtyDaysAgo },
        countryCode: { not: null },
      },
      _avg: { priceUsdCents: true },
      _min: { priceUsdCents: true },
      _max: { priceUsdCents: true },
      _count: { id: true },
    });

    for (const group of listingPrices) {
      if (!group.countryCode || group._count.id < 3) continue;

      // Mettre à jour les produits du catalogue correspondants avec les données observées
      const catalogProducts = await prisma.marketProductCatalog.findMany({
        where: {
          countryCode: group.countryCode as CountryCode,
          category: { equals: group.category, mode: "insensitive" },
          ...(group.city ? { city: { equals: group.city, mode: "insensitive" } } : {}),
        },
      });

      for (const product of catalogProducts) {
        // Blend : 70% données observées + 30% données seed (pour ne pas perdre le calibrage initial)
        const observedAvg = group._avg.priceUsdCents ?? product.avgPriceUsdCents;
        const blendedAvg = Math.round(observedAvg * 0.7 + product.avgPriceUsdCents * 0.3);

        await prisma.marketProductCatalog.update({
          where: { id: product.id },
          data: {
            avgPriceUsdCents: blendedAvg,
            minPriceUsdCents: Math.min(group._min.priceUsdCents ?? product.minPriceUsdCents, product.minPriceUsdCents),
            maxPriceUsdCents: Math.max(group._max.priceUsdCents ?? product.maxPriceUsdCents, product.maxPriceUsdCents),
            dataSource: "PLATFORM",
            confidence: Math.min(95, product.confidence + Math.floor(group._count.id / 2)),
          },
        });
        productsUpdated++;
      }
    }

    await prisma.knowledgeBaseRefreshLog.update({
      where: { id: log.id },
      data: {
        status: "SUCCESS",
        recordsProcessed: statsRefreshed + productsUpdated,
        recordsUpdated: productsUpdated,
        durationMs: Date.now() - startTime,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    logger.error(err, "[KB] External refresh failed");
    await prisma.knowledgeBaseRefreshLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errors: 1, durationMs: Date.now() - startTime, completedAt: new Date() },
    });
  }

  return { productsUpdated, statsRefreshed };
}

/**
 * Rafraîchissement complet nocturne — orchestrateur principal.
 * Appelé par le cron à minuit.
 */
export async function runNightlyKnowledgeBaseRefresh(): Promise<void> {
  const startTime = Date.now();
  logger.info("[KB] ═══ Démarrage refresh nocturne Knowledge Base ═══");

  try {
    // Étape 1 — Collecte données internes du jour
    logger.info("[KB] Étape 1/3 — Collecte insights internes quotidiens...");
    const internalDaily = await collectInternalDailyInsights();
    logger.info(`[KB]   → ${internalDaily.categoriesProcessed} catégories, ${internalDaily.recordsCreated} créés, ${internalDaily.recordsUpdated} mis à jour`);

    // Étape 2 — Collecte hebdomadaire (si dimanche)
    const now = new Date();
    if (now.getDay() === 0) {
      logger.info("[KB] Étape 2/3 — Collecte insights internes hebdomadaires (dimanche)...");
      const internalWeekly = await collectInternalWeeklyInsights();
      logger.info(`[KB]  → ${internalWeekly.categoriesProcessed} catégories, ${internalWeekly.recordsCreated} créés`);
    } else {
      logger.info("[KB] Étape 2/3 — Collecte hebdo ignorée (pas dimanche)");
    }

    // Étape 3 — Rafraîchissement base externe
    logger.info("[KB] Étape 3/3 — Refresh base externe depuis listings actifs...");
    const externalRefresh = await refreshExternalKnowledgeBase();
    logger.info(`[KB]   → ${externalRefresh.productsUpdated} produits mis à jour, ${externalRefresh.statsRefreshed} stats rafraîchies`);

    // Journal final
    const elapsed = Date.now() - startTime;
    logger.info(`[KB] ═══ Refresh nocturne terminé en ${(elapsed / 1000).toFixed(1)}s ═══`);

    // Log de merge
    await prisma.knowledgeBaseRefreshLog.create({
      data: {
        refreshType: "MERGE_BLEND",
        sourceType: "MERGE",
        status: "SUCCESS",
        recordsProcessed: internalDaily.recordsCreated + internalDaily.recordsUpdated + externalRefresh.productsUpdated,
        recordsCreated: internalDaily.recordsCreated,
        recordsUpdated: internalDaily.recordsUpdated + externalRefresh.productsUpdated,
        durationMs: elapsed,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    logger.error(err, "[KB] Nightly refresh FAILED");
  }
}

// ══════════════════════════════════════════════════════════════
// PURGE LANCEMENT — Supprime les données test, garde la KB externe
// ══════════════════════════════════════════════════════════════

/**
 * Purge complète des données de test pour le lancement officiel.
 * Conserve :
 *  - Super Admin
 *  - Knowledge Base externe (MarketProductCatalog, TradeRoutes, BusinessInsights, SeasonalPatterns)
 *  - Agents IA (AiAgent)
 *  - Configuration pays/villes (MarketCountry, MarketCity)
 *  - Paramètres site (SiteSetting)
 *
 * Supprime :
 *  - Tous les utilisateurs (sauf SUPER_ADMIN)
 *  - Tous les listings, commandes, négociations
 *  - Tous les historiques de transactions internes
 *  - Publications So-Kin, stories, tendances
 *  - Messages, notifications
 *  - Abonnements, paiements
 *  - Avis, signalements
 *  - Données de vérification
 *  - Logs d'autonomie IA, snapshots mémoire
 */
export async function purgeLaunchData(): Promise<{
  usersDeleted: number;
  tablesCleared: string[];
}> {
  logger.warn("[KB] ⚠️  PURGE LANCEMENT — Suppression de toutes les données test...");

  // Ordre de suppression respectant les FK cascades
  const tablesToClear: Array<{ name: string; fn: () => Promise<any> }> = [
    { name: "SoKinEvent", fn: () => prisma.soKinEvent.deleteMany() },
    { name: "SoKinStory", fn: () => prisma.soKinStory.deleteMany() },
    { name: "SoKinTrend", fn: () => prisma.soKinTrend.deleteMany() },
    { name: "AiAutonomyLog", fn: () => prisma.aiAutonomyLog.deleteMany() },
    { name: "AiMemorySnapshot", fn: () => prisma.aiMemorySnapshot.deleteMany() },
    { name: "AiRecommendation", fn: () => prisma.aiRecommendation.deleteMany() },
    { name: "AiTrial", fn: () => prisma.aiTrial.deleteMany() },
    { name: "AiAdCreative", fn: () => prisma.aiAdCreative.deleteMany() },
    { name: "AiAdCampaign", fn: () => prisma.aiAdCampaign.deleteMany() },
    { name: "NegotiationOffer", fn: () => prisma.negotiationOffer.deleteMany() },
    { name: "Negotiation", fn: () => prisma.negotiation.deleteMany() },
    { name: "NegotiationBundle", fn: () => prisma.negotiationBundle.deleteMany() },
    { name: "OrderItem", fn: () => prisma.orderItem.deleteMany() },
    { name: "Order", fn: () => prisma.order.deleteMany() },
    { name: "PromotionItem", fn: () => prisma.promotionItem.deleteMany() },
    { name: "Promotion", fn: () => prisma.promotion.deleteMany() },
    { name: "MobileMoneyPayment", fn: () => prisma.mobileMoneyPayment.deleteMany() },
    { name: "PaymentOrder", fn: () => prisma.paymentOrder.deleteMany() },
    { name: "SubscriptionAddon", fn: () => prisma.subscriptionAddon.deleteMany() },
    { name: "Subscription", fn: () => prisma.subscription.deleteMany() },
    { name: "TrustScoreEvent", fn: () => prisma.trustScoreEvent.deleteMany() },
    { name: "FraudSignal", fn: () => prisma.fraudSignal.deleteMany() },
    { name: "SecurityEvent", fn: () => prisma.securityEvent.deleteMany() },
    { name: "VerificationHistory", fn: () => prisma.verificationHistory.deleteMany() },
    { name: "VerificationRequest", fn: () => prisma.verificationRequest.deleteMany() },
    { name: "Listing", fn: () => prisma.listing.deleteMany() },
    { name: "Vitrine", fn: () => prisma.vitrine.deleteMany() },
    // Insights internes — reset pour repartir de zéro
    { name: "InternalTransactionInsight", fn: () => prisma.internalTransactionInsight.deleteMany() },
    // MarketStats — sera recréé par le refresh depuis les listings réels
    { name: "MarketStats", fn: () => prisma.marketStats.deleteMany() },
    { name: "KnowledgeBaseRefreshLog", fn: () => prisma.knowledgeBaseRefreshLog.deleteMany() },
  ];

  const clearedTables: string[] = [];
  for (const table of tablesToClear) {
    try {
      await table.fn();
      clearedTables.push(table.name);
      logger.info(`[KB]   🗑️  ${table.name} vidée`);
    } catch (err) {
      logger.error(err, `[KB]   ⚠️  Erreur purge ${table.name}`);
    }
  }

  // Supprimer les utilisateurs non-SuperAdmin
  const deleted = await prisma.user.deleteMany({
    where: { role: { not: "SUPER_ADMIN" } },
  });

  logger.info(`[KB] ✅ Purge terminée — ${deleted.count} utilisateurs supprimés, ${clearedTables.length} tables vidées`);
  logger.info("[KB] 📦 Données conservées : Knowledge Base externe, Agents IA, Config pays/villes, Super Admin");

  return { usersDeleted: deleted.count, tablesCleared: clearedTables };
}

// ══════════════════════════════════════════════════════════════
// STATISTIQUES KB — Pour le dashboard admin
// ══════════════════════════════════════════════════════════════

export async function getKnowledgeBaseStats() {
  const [products, routes, insights, seasonal, internal, refreshLogs] = await Promise.all([
    prisma.marketProductCatalog.count(),
    prisma.marketTradeRoute.count(),
    prisma.marketBusinessInsight.count(),
    prisma.marketSeasonalPattern.count(),
    prisma.internalTransactionInsight.count(),
    prisma.knowledgeBaseRefreshLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    external: {
      products,
      tradeRoutes: routes,
      businessInsights: insights,
      seasonalPatterns: seasonal,
      totalRecords: products + routes + insights + seasonal,
    },
    internal: {
      transactionInsights: internal,
    },
    lastRefreshes: refreshLogs,
  };
}

// ── Helpers ──

function demandToScore(level: string): number {
  switch (level) {
    case "VERY_HIGH": return 90;
    case "HIGH": return 70;
    case "MEDIUM": return 50;
    case "LOW": return 30;
    default: return 50;
  }
}
