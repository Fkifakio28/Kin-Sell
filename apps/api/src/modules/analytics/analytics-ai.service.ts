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

import { CartStatus, SubscriptionStatus } from "../../shared/db/prisma-enums.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { getMarketMedian, computePricePosition, getTrendingCategories, PRICE_THRESHOLD_PERCENT } from "../../shared/market/market-shared.js";

// ─────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────

const PREMIUM_PLAN_CODES = new Set(["PRO_VENDOR", "BUSINESS", "SCALE"]);

async function hasPremiumAccess(userId: string): Promise<boolean> {
  // Résoudre le scope user/business pour trouver le bon abonnement
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, businesses: { select: { id: true }, take: 1 } },
  });
  if (!user) return false;

  const isBusinessScope = user.role === "BUSINESS";
  const businessId = isBusinessScope ? user.businesses[0]?.id : null;

  const subscription = await prisma.subscription.findFirst({
    where: {
      status: SubscriptionStatus.ACTIVE,
      ...(isBusinessScope && businessId ? { businessId } : { userId }),
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    select: { planCode: true },
  });
  if (!subscription) return false;
  return PREMIUM_PLAN_CODES.has(subscription.planCode.toUpperCase());
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
    listings: number;
    activeListings: number;
    negotiations: number;
    acceptedNegotiations: number;
    orders: number;
    revenueCents: number;
  };
  marketPosition: {
    avgPriceCents: number;
    medianCents: number;
    position: "BELOW_MARKET" | "ON_MARKET" | "ABOVE_MARKET";
    message: string;
  };
  trendingCategories: { category: string; count: number }[];
  bestPublicationHour: number;
  recommendations: string[];
  sokinSummary: {
    postCount: number;
    totalViews: number;
    avgSocialScore: number;
    avgBusinessScore: number;
    topPostId: string | null;
  } | null;
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

  // So-Kin social summary
  const sokinActivePosts = await prisma.soKinPost.findMany({
    where: { authorId: userId, status: "ACTIVE" },
    select: { id: true, views: true, socialScore: true, businessScore: true, boostScore: true } as any,
    orderBy: { createdAt: "desc" },
    take: 50,
  }) as any[];

  let sokinSummary: BasicInsights["sokinSummary"] = null;
  if (sokinActivePosts.length > 0) {
    const totalViews = sokinActivePosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
    const socialScores = sokinActivePosts.map((p: any) => p.socialScore ?? 0);
    const businessScores = sokinActivePosts.map((p: any) => p.businessScore ?? 0);
    const boostScores = sokinActivePosts.map((p: any) => p.boostScore ?? 0);
    const topPost = sokinActivePosts.sort((a: any, b: any) => (b.boostScore ?? 0) - (a.boostScore ?? 0))[0];
    sokinSummary = {
      postCount: sokinActivePosts.length,
      totalViews,
      avgSocialScore: Math.round(socialScores.reduce((a: number, b: number) => a + b, 0) / socialScores.length),
      avgBusinessScore: Math.round(businessScores.reduce((a: number, b: number) => a + b, 0) / businessScores.length),
      topPostId: topPost?.id ?? null,
    };
  }

  // ── Recommendations personnalisées (basées sur données réelles) ──
  const recommendations: string[] = [];
  const revenueDollars = ((orderAgg._sum.totalUsdCents ?? 0) / 100).toFixed(0);
  const negotiationRate = totalNegotiations > 0 ? Math.round((acceptedNegotiations / totalNegotiations) * 100) : 0;

  if (activeListings === 0) {
    recommendations.push("Vous n'avez aucune annonce active. Publiez votre première annonce pour commencer à vendre.");
  } else if (activeListings < 3) {
    recommendations.push(`Seulement ${activeListings} annonce${activeListings > 1 ? "s" : ""} active${activeListings > 1 ? "s" : ""}. Publiez au moins 5 annonces pour augmenter vos chances d'être trouvé.`);
  }

  if (mainCategory && positionStatus === "ABOVE_MARKET") {
    recommendations.push(`Vos prix en "${mainCategory}" sont ${Math.round(diffPercent)}% au-dessus du marché (médiane ${(marketMedianCents / 100).toFixed(0)}$). Baissez de ~${Math.round(diffPercent * 0.5)}% pour rester compétitif.`);
  }
  if (mainCategory && positionStatus === "BELOW_MARKET") {
    recommendations.push(`Vos prix en "${mainCategory}" sont ${Math.round(Math.abs(diffPercent))}% sous le marché (médiane ${(marketMedianCents / 100).toFixed(0)}$). Vous pouvez monter de ~${Math.round(Math.abs(diffPercent) * 0.5)}% sans perdre d'acheteurs.`);
  }
  if (totalNegotiations > 0 && negotiationRate < 30) {
    recommendations.push(`Taux d'acceptation négociation faible : ${negotiationRate}% (${acceptedNegotiations}/${totalNegotiations}). Activez l'IA Marchand pour optimiser vos contre-offres.`);
  } else if (totalNegotiations > 0 && negotiationRate >= 60) {
    recommendations.push(`Excellent taux de négociation : ${negotiationRate}% (${acceptedNegotiations}/${totalNegotiations}). Vos prix de vente sont bien calibrés.`);
  }

  if (orderAgg._count.id > 0) {
    recommendations.push(`${orderAgg._count.id} vente${orderAgg._count.id > 1 ? "s" : ""} ce mois pour ${revenueDollars}$. Publiez vers ${bestHourLabel} pour maximiser la visibilité.`);
  } else {
    recommendations.push(`Aucune vente ce mois. Publiez vers ${bestHourLabel} — c'est le créneau le plus actif sur la plateforme.`);
  }

  if (mainCategory && trendingCategories.includes(mainCategory)) {
    recommendations.push(`"${mainCategory}" est en tendance ! Publiez davantage dans cette catégorie pour capter le trafic.`);
  } else if (trendingCategories.length > 0 && activeListings > 0) {
    recommendations.push(`Tendances actuelles : ${trendingCategories.slice(0, 3).join(", ")}. Diversifiez si vous avez des produits dans ces catégories.`);
  }

  // So-Kin recommendations personnalisées
  if (sokinSummary) {
    if (sokinSummary.avgSocialScore >= 40 && sokinSummary.avgBusinessScore < 20) {
      recommendations.push(`Vos ${sokinSummary.postCount} posts So-Kin ont un bon engagement (score social ${sokinSummary.avgSocialScore}/100) mais un faible score business (${sokinSummary.avgBusinessScore}/100). Liez vos articles pour convertir.`);
    }
    if (sokinSummary.totalViews > 100 && sokinSummary.avgBusinessScore >= 30) {
      recommendations.push(`${sokinSummary.totalViews} vues So-Kin avec un score business de ${sokinSummary.avgBusinessScore}/100. Un boost pourrait multiplier vos ventes.`);
    }
  } else if (activeListings > 0) {
    recommendations.push("Publiez sur So-Kin pour gagner en visibilité locale — les vendeurs actifs y vendent 2× plus.");
  }

  return {
    tier: "MEDIUM",
    activitySummary: {
      listings: totalListings,
      activeListings,
      negotiations: totalNegotiations,
      acceptedNegotiations,
      orders: orderAgg._count.id,
      revenueCents: orderAgg._sum.totalUsdCents ?? 0,
    },
    marketPosition: {
      avgPriceCents: avgMyPrice,
      medianCents: marketMedianCents,
      position: positionStatus,
      message: positionMessage,
    },
    trendingCategories: trendingCategories.map(c => ({ category: c, count: 0 })),
    bestPublicationHour: bestHour,
    recommendations,
    sokinSummary,
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

  // ── Predictive Suggestions personnalisées ──
  const predictions: string[] = [];
  const totalRevenueDollars = ordersData.filter(o => o.status === "DELIVERED").reduce((s, o) => s + o.totalUsdCents, 0) / 100;

  if (cartAbandonmentRate > 60) {
    predictions.push(`Taux d'abandon panier de ${cartAbandonmentRate}% (${abandonedCarts}/${totalCarts} paniers). L'IA Commande peut relancer ces ${abandonedCarts} acheteurs automatiquement.`);
  } else if (cartAbandonmentRate > 30) {
    predictions.push(`Taux d'abandon panier de ${cartAbandonmentRate}% — acceptable mais peut être réduit avec des relances automatiques.`);
  }

  if (negoConversionRate < 20 && totalNegotiations > 3) {
    predictions.push(`Seulement ${negoConversionRate}% de vos ${totalNegotiations} négociations se convertissent en ventes. L'IA Marchand peut optimiser vos réponses et contre-offres.`);
  }

  if (buyerRetentionRate > 30) {
    predictions.push(`${buyerRetentionRate}% de vos acheteurs (${repeatBuyers}/${uniqueBuyers}) reviennent ! Fidélisez-les avec des coupons exclusifs via IA Messenger.`);
  } else if (uniqueBuyers > 5 && buyerRetentionRate < 10) {
    predictions.push(`Faible fidélisation : seulement ${buyerRetentionRate}% de retour (${repeatBuyers}/${uniqueBuyers} acheteurs). Des offres de suivi pourraient doubler ce taux.`);
  }

  if (categoryBreakdown[0]) {
    const topCat = categoryBreakdown[0];
    const topCatRevenue = (topCat.revenueCents / 100).toFixed(0);
    predictions.push(`"${topCat.category}" est votre meilleure catégorie (${topCat.count} ventes, ${topCatRevenue}$). Publiez plus dans cette catégorie pour maximiser vos revenus.`);
    if (categoryBreakdown[1]) {
      const secondCat = categoryBreakdown[1];
      predictions.push(`"${secondCat.category}" est votre 2e catégorie (${secondCat.count} ventes). Diversifier réduit votre dépendance à une seule catégorie.`);
    }
  }

  if (cityBreakdown[0] && cityBreakdown[0].percent > 60) {
    predictions.push(`${cityBreakdown[0].percent}% de vos ventes viennent de ${cityBreakdown[0].city}. Explorez d'autres villes via des campagnes ciblées.`);
  }

  if (velocityLabel === "SLOW") {
    predictions.push(`Votre activité ralentit (score vélocité: ${velocityScore}/100). Lancez une campagne publicitaire pour relancer la visibilité.`);
  } else if (velocityLabel === "ACCELERATING") {
    predictions.push(`Croissance en accélération (score: ${velocityScore}/100) ! C'est le moment d'investir dans un forfait supérieur pour maximiser cet élan.`);
  }

  if (totalRevenueDollars > 0) {
    const avgOrderValue = completedOrders > 0 ? Math.round(totalRevenueDollars / completedOrders) : 0;
    predictions.push(`Panier moyen: ${avgOrderValue}$. ${avgOrderValue < 20 ? "Proposez des lots ou bundles pour augmenter le panier moyen." : "Bon panier moyen — maintenez cette gamme de prix."}`);
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

  if (buyerRetentionRate > 25) strengthAreas.push(`Fidélisation acheteurs (${buyerRetentionRate}% reviennent)`);
  if (negoConversionRate > 40) strengthAreas.push(`Bon taux négociation (${negoConversionRate}%)`);
  if (categoryRank > 0 && categoryRank <= 5) strengthAreas.push(`Top ${categoryRank} vendeurs en "${mainCat}" (sur ${totalSellersInCategory})`);
  if (completedOrders >= 10) strengthAreas.push(`Volume de ventes solide (${completedOrders} ce mois)`);
  if (strengthAreas.length === 0) strengthAreas.push("Présence active sur la plateforme");

  if (activeListings < 3) improvementAreas.push(`Volume d'annonces (${activeListings} actives — visez 5+)`);
  if (cartAbandonmentRate > 50) improvementAreas.push(`Abandon panier élevé (${cartAbandonmentRate}%)`);
  if (negoConversionRate < 20 && totalNegotiations > 0) improvementAreas.push(`Conversion négociation (${negoConversionRate}% — activez IA Marchand)`);

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
