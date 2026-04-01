/**
 * IA KIN-SELL ANALYTIQUE — Analytics AI Engine
 *
 * Deux paliers :
 *
 * 🟢 PALIER 1 — MEDIUM (tous les utilisateurs)
 *   - Résumé activité, position marché, catégories tendances, meilleures heures,
 *     recommandations simples
 *
 * 🔴 PALIER 2 — PREMIUM (abonnement actif requis)
 *   - Analyse funnel complète, segmentation audience, vélocité, prédictions,
 *     déclencheurs automatiques inter-IA
 *
 * Tout rule-based. Données Prisma temps réel.
 */

import { CartStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { getMarketMedian, computePricePosition, getTrendingCategories, PRICE_THRESHOLD_PERCENT } from "../../shared/market/market-shared.js";

// ─────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────

async function hasPremiumAccess(userId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      endsAt: { gt: new Date() },
    },
    select: { planCode: true },
  });
  if (!subscription) return false;
  const code = subscription.planCode.toUpperCase();
  return code.includes("PRO") || code.includes("PREMIUM") || code.includes("BUSINESS");
}

function hourBucket(date: Date): number {
  return date.getHours();
}

// ─────────────────────────────────────────────
// PALIER 1 — Basic Insights
// ─────────────────────────────────────────────

export interface BasicInsights {
  tier: "MEDIUM";
  activitySummary: {
    totalListings: number;
    activeListings: number;
    totalNegotiations: number;
    acceptedNegotiations: number;
    totalOrders: number;
    totalRevenueCents: number;
  };
  marketPosition: {
    avgPriceCents: number;
    marketMedianCents: number;
    status: "BELOW_MARKET" | "ON_MARKET" | "ABOVE_MARKET";
    message: string;
  };
  trendingCategories: string[];
  bestPublicationHour: {
    hour: number;
    label: string;
    insight: string;
  };
  simpleRecommendations: string[];
}

export async function getBasicInsights(userId: string): Promise<BasicInsights> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalListings,
    activeListings,
    myListingsCats,
    totalNegotiations,
    acceptedNegotiations,
    orderAgg,
    peakOrders,
  ] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: userId } }),
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE" } }),
    prisma.listing.findMany({
      where: { ownerUserId: userId, status: "ACTIVE" },
      select: { priceUsdCents: true, category: true },
    }),
    prisma.negotiation.count({ where: { sellerUserId: userId } }),
    prisma.negotiation.count({ where: { sellerUserId: userId, status: "ACCEPTED" } }),
    prisma.order.aggregate({
      where: { sellerUserId: userId, status: "DELIVERED" },
      _count: { id: true },
      _sum: { totalUsdCents: true },
    }),
    // Commandes par heure pour calculer best hour
    prisma.order.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
      take: 1000,
    }),
  ]);

  // Catégories tendances via source unique (market-shared → SoKinTrend / fallback listings)
  const trendingCategories = await getTrendingCategories(5);

  // Market position
  const avgMyPrice =
    myListingsCats.length > 0
      ? Math.round(
          myListingsCats.reduce((s, l) => s + l.priceUsdCents, 0) / myListingsCats.length
        )
      : 0;

  const topCategory = myListingsCats.length > 0
    ? myListingsCats.reduce(
        (acc, l) => {
          acc[l.category] = (acc[l.category] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    : {};
  const mainCategory = Object.entries(topCategory).sort((a, b) => b[1] - a[1])[0]?.[0];

  // ── Position marché via source unique (market-shared) ──
  let marketMedianCents = avgMyPrice;
  if (mainCategory) {
    const median = await getMarketMedian(mainCategory);
    if (median.medianPriceCents > 0) marketMedianCents = median.medianPriceCents;
  }

  const pricePos = computePricePosition(avgMyPrice, marketMedianCents);
  const positionStatus = pricePos.position;
  const positionMessage = pricePos.message;
  const diffPercent = pricePos.diffPercent;

  // Best publication hour
  const hourCounts = new Array(24).fill(0);
  for (const order of peakOrders) {
    hourCounts[hourBucket(new Date(order.createdAt))]++;
  }
  const bestHour = hourCounts.indexOf(Math.max(...hourCounts));
  const bestHourLabel =
    bestHour < 12
      ? `${bestHour}h (matin)`
      : bestHour < 18
      ? `${bestHour}h (après-midi)`
      : `${bestHour}h (soir)`;

  // Simple recommendations
  const recommendations: string[] = [];
  if (activeListings === 0) {
    recommendations.push("Publiez votre première annonce pour commencer à vendre.");
  }
  if (positionStatus === "ABOVE_MARKET") {
    recommendations.push(`Baissez vos prix de ~${Math.round(diffPercent * 0.5)}% pour rester compétitif.`);
  }
  if (positionStatus === "BELOW_MARKET") {
    recommendations.push(`Vous pouvez monter vos prix de ~${Math.round(Math.abs(diffPercent) * 0.5)}% sans perdre d'acheteurs.`);
  }
  if (totalNegotiations > 0 && acceptedNegotiations / totalNegotiations < 0.3) {
    recommendations.push("Votre taux d'acceptation en négociation est faible. Activez l'IA Marchand pour optimiser.");
  }
  recommendations.push(`Publiez vers ${bestHourLabel} pour maximiser la visibilité.`);

  return {
    tier: "MEDIUM",
    activitySummary: {
      totalListings,
      activeListings,
      totalNegotiations,
      acceptedNegotiations,
      totalOrders: orderAgg._count.id,
      totalRevenueCents: orderAgg._sum.totalUsdCents ?? 0,
    },
    marketPosition: {
      avgPriceCents: avgMyPrice,
      marketMedianCents,
      status: positionStatus,
      message: positionMessage,
    },
    trendingCategories,
    bestPublicationHour: {
      hour: bestHour,
      label: bestHourLabel,
      insight: `Les commandes sur Kin-Sell sont les plus fréquentes vers ${bestHourLabel}.`,
    },
    simpleRecommendations: recommendations,
  };
}

// ─────────────────────────────────────────────
// PALIER 2 — Deep & Predictive Insights (PREMIUM)
// ─────────────────────────────────────────────

export interface DeepInsights {
  tier: "PREMIUM";
  funnelAnalysis: {
    activeListings: number;
    totalNegotiations: number;
    negotiationConversionRate: number;  // nego → order %
    cartAbandonment: number;            // carts ACTIVE / total carts %
    ordersCompleted: number;
    overallConversionRate: number;      // active listings → orders %
  };
  audienceSegmentation: {
    cityBreakdown: Array<{ city: string; count: number; percent: number }>;
    categoryBreakdown: Array<{ category: string; count: number; revenueCents: number }>;
    buyerRetentionRate: number; // % buyers who bought more than once
  };
  velocityScore: {
    label: "SLOW" | "NORMAL" | "FAST" | "ACCELERATING";
    score: number;
    insight: string;
  };
  predictiveSuggestions: string[];
  automationTriggers: Array<{
    agent: string;
    action: string;
    priority: "LOW" | "MEDIUM" | "HIGH";
  }>;
  competitorContext: {
    categoryRank: number;         // position estimée parmi vendeurs même catégorie
    totalSellersInCategory: number;
    strengthAreas: string[];
    improvementAreas: string[];
  };
}

export async function getDeepInsights(userId: string): Promise<DeepInsights> {
  const isPremium = await hasPremiumAccess(userId);
  if (!isPremium) {
    throw new HttpError(403, "Cette fonctionnalité nécessite un abonnement Premium ou Pro.");
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [
    activeListings,
    negoData,
    ordersData,
    orderItemsData,
    cartData,
    prevNegoCount,
  ] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE" } }),

    // Négociations
    prisma.negotiation.findMany({
      where: { sellerUserId: userId, createdAt: { gte: thirtyDaysAgo } },
      select: { status: true, buyerUserId: true },
    }),

    // Commandes
    prisma.order.findMany({
      where: { sellerUserId: userId, createdAt: { gte: thirtyDaysAgo } },
      select: {
        id: true,
        totalUsdCents: true,
        status: true,
        buyerUserId: true,
        createdAt: true,
        items: { select: { category: true, city: true, lineTotalUsdCents: true } },
      },
    }),

    // OrderItems pour breakdown
    prisma.orderItem.findMany({
      where: {
        order: {
          sellerUserId: userId,
          status: "DELIVERED",
          createdAt: { gte: thirtyDaysAgo },
        },
      },
      select: { category: true, city: true, lineTotalUsdCents: true },
    }),

    // Paniers
    prisma.cart.findMany({
      where: {
        items: { some: { listing: { ownerUserId: userId } } },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { status: true },
    }),

    // Négos période précédente (vélocité)
    prisma.negotiation.count({
      where: { sellerUserId: userId, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
    }),
  ]);

  // ── Funnel ──
  const totalNegotiations = negoData.length;
  const negoLeadingToOrder = ordersData.filter(
    (o) => o.items.length > 0
  ).length;
  const negoConversionRate =
    totalNegotiations > 0
      ? Math.round((negoLeadingToOrder / totalNegotiations) * 100)
      : 0;

  const totalCarts = cartData.length;
  const abandonedCarts = cartData.filter((c) => c.status === CartStatus.OPEN).length;
  const cartAbandonmentRate =
    totalCarts > 0 ? Math.round((abandonedCarts / totalCarts) * 100) : 0;

  const completedOrders = ordersData.filter((o) => o.status === "DELIVERED").length;
  const overallConversionRate =
    activeListings > 0 ? Math.round((completedOrders / activeListings) * 100) : 0;

  // ── Audience Segmentation ──
  const cityCount: Record<string, number> = {};
  const catStats: Record<string, { count: number; revenue: number }> = {};

  for (const item of orderItemsData) {
    if (item.city) cityCount[item.city] = (cityCount[item.city] ?? 0) + 1;
    if (!catStats[item.category]) catStats[item.category] = { count: 0, revenue: 0 };
    catStats[item.category].count++;
    catStats[item.category].revenue += item.lineTotalUsdCents;
  }

  const totalItems = orderItemsData.length || 1;
  const cityBreakdown = Object.entries(cityCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([city, count]) => ({
      city,
      count,
      percent: Math.round((count / totalItems) * 100),
    }));

  const categoryBreakdown = Object.entries(catStats)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([category, stats]) => ({
      category,
      count: stats.count,
      revenueCents: stats.revenue,
    }));

  // Buyer retention
  const buyerIds = ordersData.map((o) => o.buyerUserId);
  const buyerCounts: Record<string, number> = {};
  for (const id of buyerIds) buyerCounts[id] = (buyerCounts[id] ?? 0) + 1;
  const repeatBuyers = Object.values(buyerCounts).filter((c) => c > 1).length;
  const uniqueBuyers = Object.keys(buyerCounts).length;
  const buyerRetentionRate =
    uniqueBuyers > 0 ? Math.round((repeatBuyers / uniqueBuyers) * 100) : 0;

  // ── Velocity Score ──
  const currentPeriodCount = totalNegotiations;
  let velocityLabel: DeepInsights["velocityScore"]["label"];
  let velocityScore: number;
  let velocityInsight: string;

  if (prevNegoCount === 0 && currentPeriodCount === 0) {
    velocityLabel = "SLOW";
    velocityScore = 10;
    velocityInsight = "Peu d'activité ces 60 derniers jours. Publiez de nouvelles annonces.";
  } else if (prevNegoCount === 0) {
    velocityLabel = "ACCELERATING";
    velocityScore = 85;
    velocityInsight = "Excellente croissance ! Votre activité décolle.";
  } else {
    const ratio = currentPeriodCount / prevNegoCount;
    if (ratio >= 1.5) {
      velocityLabel = "ACCELERATING";
      velocityScore = Math.min(100, Math.round(ratio * 50));
      velocityInsight = `Croissance de ${Math.round((ratio - 1) * 100)}% vs période précédente.`;
    } else if (ratio >= 0.8) {
      velocityLabel = "NORMAL";
      velocityScore = 60;
      velocityInsight = "Activité stable. Maintenez vos efforts pour progresser.";
    } else if (ratio >= 0.5) {
      velocityLabel = "SLOW";
      velocityScore = 30;
      velocityInsight = `Ralentissement de ${Math.round((1 - ratio) * 100)}% vs période précédente.`;
    } else {
      velocityLabel = "SLOW";
      velocityScore = 15;
      velocityInsight = "Forte baisse d'activité. Action requise.";
    }
  }

  // ── Predictive Suggestions ──
  const predictions: string[] = [];
  if (cartAbandonmentRate > 60) {
    predictions.push("Taux d'abandon panier élevé. L'IA Commande peut relancer ces acheteurs automatiquement.");
  }
  if (negoConversionRate < 20) {
    predictions.push("Peu de négociations se convertissent en ventes. Activez l'IA Marchand pour optimiser vos réponses.");
  }
  if (buyerRetentionRate > 30) {
    predictions.push(`${buyerRetentionRate}% de vos acheteurs reviennent — fidélisez-les avec des offres exclusives.`);
  }
  if (categoryBreakdown[0]) {
    predictions.push(`"${categoryBreakdown[0].category}" génère le plus de revenus. Publiez plus dans cette catégorie.`);
  }
  if (velocityLabel === "SLOW") {
    predictions.push("Lancez une campagne publicitaire pour relancer la visibilité. L'IA Ads peut vous guider.");
  }

  // ── Automation Triggers ──
  const automationTriggers: DeepInsights["automationTriggers"] = [];
  if (cartAbandonmentRate > 50) {
    automationTriggers.push({ agent: "IA Commande", action: "Relance paniers abandonnés", priority: "HIGH" });
  }
  if (negoConversionRate < 25) {
    automationTriggers.push({ agent: "IA Marchand", action: "Auto-réponse aux négociations", priority: "MEDIUM" });
  }
  if (velocityLabel === "SLOW" || velocityLabel === "NORMAL") {
    automationTriggers.push({ agent: "IA Ads", action: "Lancer une campagne boost", priority: "MEDIUM" });
  }
  if (activeListings > 0) {
    automationTriggers.push({ agent: "IA ListingQuality", action: "Auditer la qualité des annonces", priority: "LOW" });
  }

  // ── Competitor Context ──
  const mainCat = categoryBreakdown[0]?.category;
  let categoryRank = 0;
  let totalSellersInCategory = 0;

  if (mainCat) {
    const sellers = await prisma.listing.groupBy({
      by: ["ownerUserId"],
      where: { category: mainCat, status: "ACTIVE" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 100,
    });
    totalSellersInCategory = sellers.length;
    const myRank = sellers.findIndex((s) => s.ownerUserId === userId);
    categoryRank = myRank >= 0 ? myRank + 1 : totalSellersInCategory + 1;
  }

  const strengthAreas: string[] = [];
  const improvementAreas: string[] = [];

  if (buyerRetentionRate > 25) strengthAreas.push("Fidélisation acheteurs");
  if (negoConversionRate > 40) strengthAreas.push("Bon taux de conversion négociation");
  if (categoryRank > 0 && categoryRank <= 5) strengthAreas.push(`Top ${categoryRank} vendeurs en "${mainCat}"`);
  if (strengthAreas.length === 0) strengthAreas.push("Présence active sur la plateforme");

  if (activeListings < 3) improvementAreas.push("Augmenter le volume d'annonces actives");
  if (cartAbandonmentRate > 50) improvementAreas.push("Réduire l'abandon panier");
  if (negoConversionRate < 20) improvementAreas.push("Améliorer le taux de conversion négociation");

  return {
    tier: "PREMIUM",
    funnelAnalysis: {
      activeListings,
      totalNegotiations,
      negotiationConversionRate: negoConversionRate,
      cartAbandonment: cartAbandonmentRate,
      ordersCompleted: completedOrders,
      overallConversionRate,
    },
    audienceSegmentation: {
      cityBreakdown,
      categoryBreakdown,
      buyerRetentionRate,
    },
    velocityScore: {
      label: velocityLabel,
      score: velocityScore,
      insight: velocityInsight,
    },
    predictiveSuggestions: predictions,
    automationTriggers,
    competitorContext: {
      categoryRank,
      totalSellersInCategory,
      strengthAreas,
      improvementAreas,
    },
  };
}
