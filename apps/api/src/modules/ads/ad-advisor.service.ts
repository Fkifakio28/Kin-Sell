/**
 * IA ADS — Advertising AI Engine (V2 Enhanced)
 *
 * 6 moteurs :
 * - Targeting Advisor  : audience, budget, durée, pages, timing optimal
 * - Performance Engine : CTR, ROI, recommandation boost/pause/stop
 * - Placement Engine   : sélection optimale des pages de diffusion
 * - Budget Optimizer   : calibrage budget selon objectif
 * - Auto-Optimizer     : pause/boost automatique basé sur performance
 * - Smart Campaign     : création automatique de campagnes pour top listings
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { getTrendingCategories } from "../../shared/market/market-shared.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AdTargetingAdvice {
  suggestedAudience: {
    categories: string[];
    cities: string[];
    priceRange: { min: number; max: number } | null;
  };
  suggestedBudget: {
    minUsdCents: number;
    recommendedUsdCents: number;
    maxUsdCents: number;
    rationale: string;
  };
  suggestedDuration: {
    days: number;
    rationale: string;
  };
  suggestedPages: string[];
  optimalTiming: {
    dayOfWeek: number;     // 0=Sunday, 1=Monday...
    dayLabel: string;
    insight: string;
  };
  estimatedImpressions: { min: number; max: number };
  tips: string[];
}

export interface AdPerformanceInsights {
  adId: string;
  title: string;
  impressions: number;
  clicks: number;
  ctr: number;                // %
  performance: "POOR" | "AVERAGE" | "GOOD" | "EXCELLENT";
  recommendation: "BOOST" | "PAUSE" | "STOP" | "CONTINUE" | "OPTIMIZE";
  budgetEfficiency: number;   // clicks per dollar spent
  daysRunning: number;
  suggestions: string[];
}

// ─────────────────────────────────────────────
// Targeting Advisor
// ─────────────────────────────────────────────

const PAGE_PROFILES: Record<string, { label: string; avgImpressionPerDay: number }> = {
  home:             { label: "Accueil",         avgImpressionPerDay: 800 },
  explorer:         { label: "Explorer",        avgImpressionPerDay: 650 },
  sokin:            { label: "SoKin Feed",      avgImpressionPerDay: 1200 },
  "sokin-market":   { label: "SoKin Market",    avgImpressionPerDay: 900 },
  "sokin-profiles": { label: "Profils SoKin",   avgImpressionPerDay: 400 },
};

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export async function getAdTargetingAdvice(
  userId: string,
  listingId?: string
): Promise<AdTargetingAdvice> {
  let suggestedCategories: string[] = [];
  let suggestedCities: string[] = [];
  let priceRange: { min: number; max: number } | null = null;

  if (listingId) {
    // Baser les suggestions sur l'annonce ciblée
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { category: true, city: true, priceUsdCents: true, type: true },
    });
    if (!listing) throw new HttpError(404, "Annonce introuvable");

    suggestedCategories = [listing.category];
    suggestedCities = [listing.city];
    priceRange = {
      min: Math.round(listing.priceUsdCents * 0.5),
      max: Math.round(listing.priceUsdCents * 2),
    };
  } else {
    // Baser sur les annonces actives du vendeur
    const myListings = await prisma.listing.findMany({
      where: { ownerUserId: userId, status: "ACTIVE" },
      select: { category: true, city: true, priceUsdCents: true },
      take: 20,
    });

    if (myListings.length > 0) {
      // Catégorie la plus fréquente
      const catCounts: Record<string, number> = {};
      const cityCounts: Record<string, number> = {};
      let totalPrice = 0;

      for (const l of myListings) {
        catCounts[l.category] = (catCounts[l.category] ?? 0) + 1;
        cityCounts[l.city] = (cityCounts[l.city] ?? 0) + 1;
        totalPrice += l.priceUsdCents;
      }

      suggestedCategories = Object.entries(catCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c]) => c);

      suggestedCities = Object.entries(cityCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([c]) => c);

      const avgPrice = Math.round(totalPrice / myListings.length);
      priceRange = { min: Math.round(avgPrice * 0.5), max: Math.round(avgPrice * 2) };
    }
  }

  // ── Trending categories (source unique — market-shared) ──
  const trendingCategories = await getTrendingCategories(5);

  // Merge trending avec suggested
  for (const cat of trendingCategories) {
    if (!suggestedCategories.includes(cat) && suggestedCategories.length < 5) {
      suggestedCategories.push(cat);
    }
  }

  // ── Budget recommendation ──
  const baseRecommendedUsdCents = 2000; // $20 par défaut
  const hasCapitalCity = suggestedCities.some((c) => ["Kinshasa", "Abidjan", "Dakar", "Casablanca", "Luanda", "Libreville", "Brazzaville", "Conakry"].includes(c));
  const budgetRationale = hasCapitalCity
    ? "Ville capitale détectée — marché dense, budget recommandé pour visibilité optimale."
    : "Budget standard pour votre zone géographique.";

  // ── Duration ──
  const suggestedDays = 7;

  // ── Page selection — basé sur type de listing ──
  let suggestedPages = ["sokin", "sokin-market"];
  if (listingId) {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { type: true },
    });
    if (listing?.type === "SERVICE") {
      suggestedPages = ["sokin-profiles", "sokin", "explorer"];
    } else {
      suggestedPages = ["sokin-market", "sokin", "home"];
    }
  }

  // ── Optimal timing — analyse heure/jour des commandes ──
  const recentOrders = await prisma.order.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    select: { createdAt: true },
    take: 500,
  });

  const dayCounts = new Array(7).fill(0);
  for (const o of recentOrders) {
    dayCounts[new Date(o.createdAt).getDay()]++;
  }
  const bestDay = dayCounts.indexOf(Math.max(...dayCounts));

  // ── Impressions estimées ──
  const dailyImpressions = suggestedPages
    .slice(0, 3)
    .reduce((s, p) => s + (PAGE_PROFILES[p]?.avgImpressionPerDay ?? 300), 0);

  const estimatedImpressions = {
    min: dailyImpressions * suggestedDays * 0.6,
    max: dailyImpressions * suggestedDays * 1.2,
  };

  const tips: string[] = [];
  if (hasCapitalCity) {
    tips.push("Ville principale détectée dans votre audience — grand bassin d'acheteurs, priorité haute.");
  }
  tips.push("Les pubs avec image attirent 3× plus de clics que le texte seul.");
  tips.push("Commencez par 7 jours pour mesurer l'impact avant d'investir davantage.");

  return {
    suggestedAudience: {
      categories: suggestedCategories,
      cities: suggestedCities,
      priceRange,
    },
    suggestedBudget: {
      minUsdCents: 1000,
      recommendedUsdCents: baseRecommendedUsdCents,
      maxUsdCents: 10000,
      rationale: budgetRationale,
    },
    suggestedDuration: {
      days: suggestedDays,
      rationale: "7 jours permettent de collecter suffisamment de données pour optimiser.",
    },
    suggestedPages,
    optimalTiming: {
      dayOfWeek: bestDay,
      dayLabel: DAYS[bestDay],
      insight: `Le ${DAYS[bestDay]} est le jour où les commandes sont les plus fréquentes sur la plateforme.`,
    },
    estimatedImpressions: {
      min: Math.round(estimatedImpressions.min),
      max: Math.round(estimatedImpressions.max),
    },
    tips,
  };
}

// ─────────────────────────────────────────────
// Performance Engine
// ─────────────────────────────────────────────

const CTR_BENCHMARKS = {
  POOR:      0.5,   // < 0.5%
  AVERAGE:   1.5,   // 0.5 - 1.5%
  GOOD:      4.0,   // 1.5 - 4%
  EXCELLENT: Infinity,
};

export async function getAdPerformanceInsights(
  adId: string,
  requesterId: string
): Promise<AdPerformanceInsights> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const ad = await db.advertisement.findUnique({
    where: { id: adId },
    select: {
      id: true,
      title: true,
      impressions: true,
      clicks: true,
      amountPaidCents: true,
      status: true,
      startDate: true,
      createdAt: true,
      userId: true,
      businessId: true,
    },
  });

  if (!ad) throw new HttpError(404, "Publicité introuvable");

  // Auth check: owner or admin
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { role: true },
  });
  const isOwner = ad.userId === requesterId;
  const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(requester?.role ?? "");
  if (!isOwner && !isAdmin) throw new HttpError(403, "Accès refusé");

  const impressions = ad.impressions ?? 0;
  const clicks = ad.clicks ?? 0;

  const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;

  let performance: AdPerformanceInsights["performance"];
  if (ctr < CTR_BENCHMARKS.POOR) performance = "POOR";
  else if (ctr < CTR_BENCHMARKS.AVERAGE) performance = "AVERAGE";
  else if (ctr < CTR_BENCHMARKS.GOOD) performance = "GOOD";
  else performance = "EXCELLENT";

  // Days running
  const startDate = ad.startDate ?? ad.createdAt;
  const daysRunning = Math.max(
    1,
    Math.floor((Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
  );

  // Budget efficiency (clicks per $)
  const amountPaidUsd = (ad.amountPaidCents ?? 0) / 100;
  const budgetEfficiency =
    amountPaidUsd > 0 ? Math.round((clicks / amountPaidUsd) * 10) / 10 : 0;

  // Recommendation
  let recommendation: AdPerformanceInsights["recommendation"];
  const suggestions: string[] = [];

  if (impressions === 0) {
    recommendation = "PAUSE";
    suggestions.push("La pub n'a pas encore été diffusée. Vérifiez les dates et pages cibles.");
  } else if (performance === "POOR" && daysRunning >= 3) {
    recommendation = "OPTIMIZE";
    suggestions.push("CTR très bas. Changez l'image ou le texte d'accroche.");
    suggestions.push("Essayez une page de diffusion différente (ex: sokin-market).");
    if (daysRunning >= 7) {
      recommendation = "STOP";
      suggestions.push("Cette pub n'est pas rentable après 7 jours. Arrêtez et recréez.");
    }
  } else if (performance === "AVERAGE") {
    recommendation = "OPTIMIZE";
    suggestions.push("Perf correcte mais améliorable. Testez un autre CTA ou image.");
  } else if (performance === "GOOD") {
    recommendation = "CONTINUE";
    suggestions.push("Bonne performance. Continuez et analysez après 14 jours.");
  } else if (performance === "EXCELLENT") {
    recommendation = "BOOST";
    suggestions.push("Excellente performance ! Augmentez le budget pour maximiser l'impact.");
  } else {
    recommendation = "CONTINUE";
  }

  if (impressions > 0 && clicks === 0 && daysRunning >= 2) {
    suggestions.push("Zéro clics malgré des impressions — le visuel n'est pas accrocheur.");
  }

  return {
    adId,
    title: ad.title,
    impressions,
    clicks,
    ctr,
    performance,
    recommendation,
    budgetEfficiency,
    daysRunning,
    suggestions,
  };
}

// ─────────────────────────────────────────────
// Auto-Optimizer — Moteur autonome
// ─────────────────────────────────────────────

export interface AdAutoOptResult {
  processed: number;
  paused: number;
  boosted: number;
  stopped: number;
  errors: number;
}

/**
 * Optimise automatiquement les campagnes actives.
 * - Pause les pubs sans CTR après 3 jours
 * - Booste (augmente priority) les pubs excellentes
 * - Stoppe les pubs non rentables après 7 jours
 * Appelé par le scheduler d'autonomie.
 */
export async function runAutoAdOptimization(): Promise<AdAutoOptResult> {
  const result: AdAutoOptResult = { processed: 0, paused: 0, boosted: 0, stopped: 0, errors: 0 };

  const agentConfig = await prisma.aiAgent.findFirst({
    where: { name: "IA_ADS", enabled: true },
  });
  if (!agentConfig) return result;

  const config = (agentConfig.config ?? {}) as Record<string, unknown>;
  if (config.autoOptimizationEnabled === false) return result;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  let activeAds: Array<{
    id: string;
    title: string;
    impressions: number;
    clicks: number;
    status: string;
    priority: number;
    startDate: Date | null;
    createdAt: Date;
    userId: string | null;
  }>;

  try {
    activeAds = await db.advertisement.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        title: true,
        impressions: true,
        clicks: true,
        status: true,
        priority: true,
        startDate: true,
        createdAt: true,
        userId: true,
      },
      take: 200,
    });
  } catch {
    return result;
  }

  for (const ad of activeAds) {
    try {
      const impressions = ad.impressions ?? 0;
      const clicks = ad.clicks ?? 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const startDate = ad.startDate ?? ad.createdAt;
      const daysRunning = Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)));

      let action: string | null = null;
      let reasoning = "";

      // Pub sans impressions après 2 jours → PAUSE
      if (impressions === 0 && daysRunning >= 2) {
        action = "PAUSE";
        reasoning = `0 impressions après ${daysRunning} jours — diffusion peut-être mal configurée`;
        await db.advertisement.update({ where: { id: ad.id }, data: { status: "INACTIVE" } });
        result.paused++;
      }
      // CTR < 0.3% après 3 jours avec impressions → problème créatif
      else if (ctr < 0.3 && daysRunning >= 3 && impressions >= 100) {
        action = "PAUSE";
        reasoning = `CTR trop bas (${ctr.toFixed(2)}%) avec ${impressions} impressions — le visuel n'est pas accrocheur`;
        await db.advertisement.update({ where: { id: ad.id }, data: { status: "INACTIVE" } });
        result.paused++;
      }
      // CTR < 0.5% après 7 jours → STOP
      else if (ctr < 0.5 && daysRunning >= 7 && impressions >= 500) {
        action = "STOP";
        reasoning = `CTR ${ctr.toFixed(2)}% après ${daysRunning} jours — pub non rentable`;
        await db.advertisement.update({ where: { id: ad.id }, data: { status: "INACTIVE" } });
        result.stopped++;
      }
      // CTR > 3% et bonnes impressions → BOOST (augmenter priority)
      else if (ctr > 3 && impressions >= 50 && ad.priority < 10) {
        action = "BOOST";
        reasoning = `Excellent CTR (${ctr.toFixed(2)}%) — boost de priorité pour maximiser l'impact`;
        await db.advertisement.update({
          where: { id: ad.id },
          data: { priority: Math.min(10, ad.priority + 2) },
        });
        result.boosted++;
      }

      if (action) {
        result.processed++;
        await prisma.aiAutonomyLog.create({
          data: {
            agentName: "IA_ADS",
            actionType: "AUTO_AD_OPTIMIZE",
            targetId: ad.id,
            targetUserId: ad.userId,
            decision: action,
            reasoning,
            success: true,
            metadata: { ctr: Math.round(ctr * 100) / 100, impressions, clicks, daysRunning },
          },
        });
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Smart Campaign Suggestions
// ─────────────────────────────────────────────

export interface SmartCampaignSuggestion {
  listingId: string;
  listingTitle: string;
  reason: string;
  suggestedBudgetCents: number;
  suggestedDays: number;
  suggestedPages: string[];
  expectedImpressions: { min: number; max: number };
  priority: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * Identifie les annonces qui bénéficieraient le plus d'une campagne publicitaire.
 * Basé sur : vues élevées + pas de vente, catégorie tendance, stock élevé.
 */
export async function getSmartCampaignSuggestions(userId: string): Promise<SmartCampaignSuggestion[]> {
  const suggestions: SmartCampaignSuggestion[] = [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Annonces actives du vendeur sans campagne pub active
  const listings = await prisma.listing.findMany({
    where: { ownerUserId: userId, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      category: true,
      city: true,
      priceUsdCents: true,
      stockQuantity: true,
      type: true,
      createdAt: true,
    },
    take: 20,
  });

  // Compter les négociations et commandes par annonce
  for (const listing of listings) {
    const [negoCount, orderCount] = await Promise.all([
      prisma.negotiation.count({
        where: { listingId: listing.id, createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.orderItem.count({
        where: { listingId: listing.id, order: { createdAt: { gte: thirtyDaysAgo } } },
      }),
    ]);

    let reason: string | null = null;
    let priority: SmartCampaignSuggestion["priority"] = "LOW";

    // Beaucoup de négos mais pas de vente → besoin de visibilité ciblée
    if (negoCount >= 3 && orderCount === 0) {
      reason = `${negoCount} négociations sans vente — une campagne ciblée peut convertir`;
      priority = "HIGH";
    }
    // Stock élevé, peu de négos → besoin de visibilité
    else if (listing.stockQuantity !== null && listing.stockQuantity >= 10 && negoCount < 2) {
      reason = `Stock élevé (${listing.stockQuantity}) mais peu d'intérêt — boostez la visibilité`;
      priority = "MEDIUM";
    }
    // Annonce récente (< 7j) → boost de lancement
    else if (Date.now() - listing.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000 && negoCount === 0) {
      reason = "Nouvelle annonce — un boost de lancement maximise les premiers jours";
      priority = "MEDIUM";
    }

    if (reason) {
      const suggestedPages = listing.type === "SERVICE"
        ? ["sokin-profiles", "sokin"]
        : ["sokin-market", "sokin", "home"];

      suggestions.push({
        listingId: listing.id,
        listingTitle: listing.title,
        reason,
        suggestedBudgetCents: priority === "HIGH" ? 3000 : 1500,
        suggestedDays: priority === "HIGH" ? 10 : 7,
        suggestedPages,
        expectedImpressions: {
          min: priority === "HIGH" ? 3000 : 1500,
          max: priority === "HIGH" ? 8000 : 4000,
        },
        priority,
      });
    }
  }

  return suggestions.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return order[a.priority] - order[b.priority];
  });
}
