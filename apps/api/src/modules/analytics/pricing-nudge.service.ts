/**
 * PRICING NUDGE ENGINE — Détection intelligente des moments d'orientation vers /forfaits
 *
 * Analyse les comportements utilisateur/business pour identifier les moments propices
 * à une incitation contextuelle vers les offres payantes.
 *
 * Déclencheurs métier :
 *  1. FREQ_PUBLISHER      — publications fréquentes (≥5 en 7j)
 *  2. PROMO_CREATOR       — création de promotions sans plan payant
 *  3. LOW_PERFORMANCE     — annonces actives avec faible engagement
 *  4. HIGH_MESSAGING      — volume élevé de messages (≥30 en 7j)
 *  5. SALES_MILESTONE     — paliers de ventes atteints (5, 15, 30, 50)
 *  6. CATEGORY_DOMINANCE  — ≥3 ventes dans la même catégorie
 *  7. GROWING_ACTIVITY    — activité commerciale en hausse vs mois précédent
 *  8. CATALOG_EXPANSION   — catalogue business qui grandit (≥10, 25, 50 articles)
 *  9. AUTOMATION_NEED     — beaucoup de messages/commandes → IA_ORDER/IA_MERCHANT
 * 10. ANALYTICS_NEED      — vendeur établi sans analytics premium
 *
 * Anti-spam :
 * - Max 1 nudge par triggerType / 48h
 * - Max 3 nudges actifs simultanément par utilisateur
 * - Cooldown global 12h si 1 nudge dismissé récemment
 * - Score de priorité 1-10, seuls les top nudges sont exposés
 *
 * Réutilisable par :
 * - GET /analytics/ai/pricing-nudges (frontend CTA)
 * - IA Ads Engine (enrichir les recommandations)
 * - Scheduler batch (slow cycle)
 */

import { prisma } from "../../shared/db/prisma.js";
import { computeSellerProfile, type SellerProfile } from "../ads/ai-ads-engine.service.js";
import { PLAN_CATALOG, ADDON_CATALOG } from "../billing/billing.catalog.js";

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export interface PricingNudge {
  triggerType: string;
  priority: number;        // 1-10 (10 = most urgent)
  title: string;
  message: string;
  ctaLabel: string;
  ctaTarget: string;       // "/forfaits", "/forfaits?plan=AUTO", etc.
  reason: string;           // justification interne
  metric?: Record<string, number | string>;
}

interface NudgeContext {
  userId: string;
  profile: SellerProfile;
  listingsLast7d: number;
  listingsLast30d: number;
  totalListings: number;
  messagesLast7d: number;
  salesLast7d: number;
  salesLast30d: number;
  salesPrev30d: number;
  topCategory: { category: string; count: number } | null;
  hasPromoListings: boolean;
  stagnantListings: number;
  currentPlanCode: string;
  isBusiness: boolean;
  hasIaMerchant: boolean;
  hasIaOrder: boolean;
  hasBoost: boolean;
  hasAnalytics: boolean; // MEDIUM or PREMIUM tier
}

// ═══════════════════════════════════════════════════════
// Anti-spam
// ═══════════════════════════════════════════════════════

const NUDGE_COOLDOWN_HOURS = 48;
const MAX_ACTIVE_NUDGES = 3;
const DISMISS_COOLDOWN_HOURS = 12;

async function canNudge(userId: string, triggerType: string): Promise<boolean> {
  const since = new Date(Date.now() - NUDGE_COOLDOWN_HOURS * 60 * 60 * 1000);
  const existing = await prisma.aiRecommendation.count({
    where: { userId, triggerType, createdAt: { gte: since } },
  });
  if (existing > 0) return false;

  // Max nudges actifs simultanément
  const activeCount = await prisma.aiRecommendation.count({
    where: {
      userId,
      engineKey: "pricing-nudge",
      dismissed: false,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (activeCount >= MAX_ACTIVE_NUDGES) return false;

  // Cooldown global si dismiss récent
  const dismissSince = new Date(Date.now() - DISMISS_COOLDOWN_HOURS * 60 * 60 * 1000);
  const recentDismiss = await prisma.aiRecommendation.count({
    where: { userId, engineKey: "pricing-nudge", dismissed: true, createdAt: { gte: dismissSince } },
  });
  if (recentDismiss > 0) return false;

  return true;
}

// ═══════════════════════════════════════════════════════
// Context builder
// ═══════════════════════════════════════════════════════

async function buildNudgeContext(userId: string, profile: SellerProfile): Promise<NudgeContext> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    listingsLast7d,
    listingsLast30d,
    totalListings,
    messagesLast7d,
    salesLast7d,
    salesLast30d,
    salesPrev30d,
    promoCount,
    stagnantListings,
    categoryGroup,
  ] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: userId, createdAt: { gte: d7 } } }),
    prisma.listing.count({ where: { ownerUserId: userId, createdAt: { gte: d30 } } }),
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE" } }),
    prisma.message.count({ where: { senderId: userId, createdAt: { gte: d7 } } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d7 } } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d30 } } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d60, lt: d30 } } }),
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE", promoPriceUsdCents: { not: null } } }),
    prisma.listing.count({
      where: {
        ownerUserId: userId,
        status: "ACTIVE",
        createdAt: { lte: d7 },
        isBoosted: false,
      },
    }),
    prisma.orderItem.groupBy({
      by: ["category"],
      where: {
        order: { sellerUserId: userId, status: "DELIVERED" },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    }),
  ]);

  const topCat = categoryGroup.length > 0
    ? { category: categoryGroup[0].category, count: categoryGroup[0]._count.id }
    : null;

  const planCode = profile.currentPlan?.code ?? "FREE";
  const addons = profile.activeAddons;

  return {
    userId,
    profile,
    listingsLast7d,
    listingsLast30d,
    totalListings,
    messagesLast7d,
    salesLast7d,
    salesLast30d,
    salesPrev30d,
    topCategory: topCat,
    hasPromoListings: promoCount > 0,
    stagnantListings,
    currentPlanCode: planCode,
    isBusiness: profile.isBusiness,
    hasIaMerchant: addons.includes("IA_MERCHANT"),
    hasIaOrder: addons.includes("IA_ORDER"),
    hasBoost: profile.hasBoostAddon,
    hasAnalytics: ["PRO_VENDOR", "BUSINESS", "SCALE"].includes(planCode),
  };
}

// ═══════════════════════════════════════════════════════
// Détecteurs individuels
// ═══════════════════════════════════════════════════════

function detectFreqPublisher(ctx: NudgeContext): PricingNudge | null {
  if (ctx.listingsLast7d < 5) return null;
  if (ctx.hasBoost) return null; // déjà équipé pour la visibilité

  const suggestedPlan = ctx.isBusiness ? "STARTER" : "BOOST";
  return {
    triggerType: "PRICING_FREQ_PUBLISHER",
    priority: 6,
    title: "Boostez vos publications",
    message: `Vous avez publié ${ctx.listingsLast7d} annonces cette semaine ! Avec un forfait adapté, chaque article gagne en visibilité automatiquement.`,
    ctaLabel: "Voir les forfaits",
    ctaTarget: `/forfaits?highlight=${suggestedPlan}`,
    reason: `${ctx.listingsLast7d} publications en 7j sans boost addon`,
    metric: { listingsLast7d: ctx.listingsLast7d },
  };
}

function detectPromoCreator(ctx: NudgeContext): PricingNudge | null {
  if (!ctx.hasPromoListings) return null;
  if (ctx.currentPlanCode !== "FREE" && ctx.currentPlanCode !== "STARTER") return null;

  return {
    triggerType: "PRICING_PROMO_CREATOR",
    priority: 5,
    title: "Maximisez vos promotions",
    message: "Vos articles en promotion méritent plus de visibilité. Un forfait avec boost intégré multiplie l'impact de vos promos.",
    ctaLabel: "Découvrir les forfaits",
    ctaTarget: "/forfaits",
    reason: "Promotions actives sur plan gratuit/starter",
  };
}

function detectLowPerformance(ctx: NudgeContext): PricingNudge | null {
  if (ctx.totalListings < 3) return null;
  if (ctx.stagnantListings < 3) return null;
  const stagnantRatio = ctx.stagnantListings / ctx.totalListings;
  if (stagnantRatio < 0.5) return null;

  return {
    triggerType: "PRICING_LOW_PERFORMANCE",
    priority: 7,
    title: "Relancez vos annonces",
    message: `${ctx.stagnantListings} de vos ${ctx.totalListings} annonces n'ont reçu aucune interaction depuis 7 jours. Le boost visibilité peut relancer votre activité.`,
    ctaLabel: "Booster mes annonces",
    ctaTarget: `/forfaits?highlight=${ctx.isBusiness ? "BUSINESS" : "BOOST"}`,
    reason: `${Math.round(stagnantRatio * 100)}% d'annonces stagnantes`,
    metric: { stagnant: ctx.stagnantListings, total: ctx.totalListings },
  };
}

function detectHighMessaging(ctx: NudgeContext): PricingNudge | null {
  if (ctx.messagesLast7d < 30) return null;
  if (ctx.hasIaMerchant) return null;

  return {
    triggerType: "PRICING_HIGH_MESSAGING",
    priority: 6,
    title: "Automatisez vos réponses",
    message: `${ctx.messagesLast7d} messages envoyés cette semaine ! L'IA Marchand peut négocier et répondre automatiquement à votre place.`,
    ctaLabel: "Activer IA Marchand",
    ctaTarget: "/forfaits?addon=IA_MERCHANT",
    reason: `${ctx.messagesLast7d} messages/7j sans IA Marchand`,
    metric: { messagesLast7d: ctx.messagesLast7d },
  };
}

function detectSalesMilestone(ctx: NudgeContext): PricingNudge | null {
  const sales = ctx.profile.completedSales;
  const milestones = [5, 15, 30, 50, 100];
  const reached = milestones.filter((m) => sales >= m);
  if (reached.length === 0) return null;

  const milestone = reached[reached.length - 1];
  // Recommander upgrade selon le palier
  let suggestedPlan: string;
  if (ctx.isBusiness) {
    suggestedPlan = sales >= 30 ? "SCALE" : sales >= 15 ? "BUSINESS" : "STARTER";
  } else {
    suggestedPlan = sales >= 30 ? "PRO_VENDOR" : sales >= 15 ? "AUTO" : "BOOST";
  }

  // Ne pas nudge si déjà sur un plan >= suggestion
  const planHierarchy = ctx.isBusiness
    ? ["STARTER", "BUSINESS", "SCALE"]
    : ["FREE", "BOOST", "AUTO", "PRO_VENDOR"];
  const currentIdx = planHierarchy.indexOf(ctx.currentPlanCode);
  const suggestedIdx = planHierarchy.indexOf(suggestedPlan);
  if (currentIdx >= suggestedIdx) return null;

  return {
    triggerType: "PRICING_SALES_MILESTONE",
    priority: 8,
    title: `${milestone} ventes atteintes !`,
    message: `Félicitations pour vos ${milestone} ventes ! Passez au forfait supérieur pour débloquer l'automatisation et l'analytics avancé.`,
    ctaLabel: "Évoluer maintenant",
    ctaTarget: `/forfaits?highlight=${suggestedPlan}`,
    reason: `Milestone ${milestone} ventes, plan actuel ${ctx.currentPlanCode}`,
    metric: { totalSales: sales, milestone },
  };
}

function detectCategoryDominance(ctx: NudgeContext): PricingNudge | null {
  if (!ctx.topCategory || ctx.topCategory.count < 3) return null;
  if (ctx.hasAnalytics) return null;

  return {
    triggerType: "PRICING_CATEGORY_DOMINANCE",
    priority: 7,
    title: `Expert ${ctx.topCategory.category}`,
    message: `Vous dominez la catégorie "${ctx.topCategory.category}" avec ${ctx.topCategory.count} ventes. L'analytics avancé vous donnera des insights marché exclusifs.`,
    ctaLabel: "Débloquer l'analytics",
    ctaTarget: `/forfaits?highlight=${ctx.isBusiness ? "BUSINESS" : "PRO_VENDOR"}`,
    reason: `${ctx.topCategory.count} ventes dans ${ctx.topCategory.category} sans analytics`,
    metric: { category: ctx.topCategory.category, count: ctx.topCategory.count },
  };
}

function detectGrowingActivity(ctx: NudgeContext): PricingNudge | null {
  if (ctx.salesPrev30d === 0) return null; // pas de base de comparaison
  const growth = ((ctx.salesLast30d - ctx.salesPrev30d) / ctx.salesPrev30d) * 100;
  if (growth < 50) return null; // croissance < 50% → pas assez significatif

  const planHierarchy = ctx.isBusiness
    ? ["STARTER", "BUSINESS", "SCALE"]
    : ["FREE", "BOOST", "AUTO", "PRO_VENDOR"];
  const currentIdx = planHierarchy.indexOf(ctx.currentPlanCode);
  if (currentIdx >= planHierarchy.length - 1) return null; // déjà au max

  const nextPlan = planHierarchy[currentIdx + 1] ?? planHierarchy[planHierarchy.length - 1];

  return {
    triggerType: "PRICING_GROWING_ACTIVITY",
    priority: 8,
    title: "Votre activité explose !",
    message: `+${Math.round(growth)}% de ventes ce mois ! C'est le moment d'investir dans un forfait supérieur pour accompagner votre croissance.`,
    ctaLabel: "Accompagner ma croissance",
    ctaTarget: `/forfaits?highlight=${nextPlan}`,
    reason: `Croissance ${Math.round(growth)}%, plan ${ctx.currentPlanCode} → ${nextPlan}`,
    metric: { growth: Math.round(growth), salesLast30d: ctx.salesLast30d, salesPrev30d: ctx.salesPrev30d },
  };
}

function detectCatalogExpansion(ctx: NudgeContext): PricingNudge | null {
  if (!ctx.isBusiness) return null;
  const thresholds = [50, 25, 10];
  const reached = thresholds.find((t) => ctx.totalListings >= t);
  if (!reached) return null;

  if (ctx.currentPlanCode === "SCALE") return null;
  const suggestedPlan = reached >= 25 ? "SCALE" : "BUSINESS";

  const planHierarchy = ["STARTER", "BUSINESS", "SCALE"];
  const currentIdx = planHierarchy.indexOf(ctx.currentPlanCode);
  const suggestedIdx = planHierarchy.indexOf(suggestedPlan);
  if (currentIdx >= suggestedIdx) return null;

  return {
    triggerType: "PRICING_CATALOG_EXPANSION",
    priority: 7,
    title: `${ctx.totalListings} articles au catalogue`,
    message: `Votre catalogue grandit ! Avec ${ctx.totalListings} articles, le forfait ${suggestedPlan} optimise la gestion et la visibilité de tout votre inventaire.`,
    ctaLabel: "Gérer mon catalogue pro",
    ctaTarget: `/forfaits?highlight=${suggestedPlan}`,
    reason: `${ctx.totalListings} articles, business plan ${ctx.currentPlanCode}`,
    metric: { totalListings: ctx.totalListings, threshold: reached },
  };
}

function detectAutomationNeed(ctx: NudgeContext): PricingNudge | null {
  if (ctx.hasIaOrder) return null;
  // Besoin d'automatisation : beaucoup de commandes OU beaucoup de messages
  const needsAutomation = ctx.salesLast7d >= 5 || (ctx.messagesLast7d >= 20 && ctx.salesLast7d >= 2);
  if (!needsAutomation) return null;

  return {
    triggerType: "PRICING_AUTOMATION_NEED",
    priority: 7,
    title: "Gagnez du temps avec l'IA",
    message: `Avec ${ctx.salesLast7d} ventes et ${ctx.messagesLast7d} messages cette semaine, l'IA Commande automatise le suivi, les confirmations et les relances.`,
    ctaLabel: "Activer l'automatisation",
    ctaTarget: `/forfaits?addon=IA_ORDER`,
    reason: `${ctx.salesLast7d} ventes + ${ctx.messagesLast7d} messages/7j sans IA_ORDER`,
    metric: { salesLast7d: ctx.salesLast7d, messagesLast7d: ctx.messagesLast7d },
  };
}

function detectAnalyticsNeed(ctx: NudgeContext): PricingNudge | null {
  if (ctx.hasAnalytics) return null;
  if (ctx.profile.lifecycle === "NEW") return null; // trop tôt
  if (ctx.profile.completedSales < 5) return null;

  return {
    triggerType: "PRICING_ANALYTICS_NEED",
    priority: 6,
    title: "Comprenez votre marché",
    message: `Avec ${ctx.profile.completedSales} ventes réalisées, l'analytics avancé vous révèle les tendances, les prix du marché et les opportunités dans votre zone.`,
    ctaLabel: "Activer l'analytics",
    ctaTarget: `/forfaits?highlight=${ctx.isBusiness ? "BUSINESS" : "PRO_VENDOR"}`,
    reason: `${ctx.profile.completedSales} ventes, lifecycle ${ctx.profile.lifecycle}, sans analytics`,
    metric: { sales: ctx.profile.completedSales, lifecycle: ctx.profile.lifecycle },
  };
}

// ═══════════════════════════════════════════════════════
// Orchestrateur
// ═══════════════════════════════════════════════════════

const ALL_DETECTORS = [
  detectFreqPublisher,
  detectPromoCreator,
  detectLowPerformance,
  detectHighMessaging,
  detectSalesMilestone,
  detectCategoryDominance,
  detectGrowingActivity,
  detectCatalogExpansion,
  detectAutomationNeed,
  detectAnalyticsNeed,
];

/**
 * Évalue tous les déclencheurs pour un utilisateur et retourne les nudges
 * les plus pertinents, triés par priorité.
 * Ne persiste rien — utilisé pour le endpoint GET temps réel.
 */
export async function evaluateNudges(userId: string): Promise<PricingNudge[]> {
  const profile = await computeSellerProfile(userId);
  if (!profile) return [];

  const ctx = await buildNudgeContext(userId, profile);
  const nudges: PricingNudge[] = [];

  for (const detect of ALL_DETECTORS) {
    const nudge = detect(ctx);
    if (!nudge) continue;
    // Anti-spam check
    if (!(await canNudge(userId, nudge.triggerType))) continue;
    nudges.push(nudge);
  }

  // Trier par priorité décroissante, limiter à MAX_ACTIVE_NUDGES
  nudges.sort((a, b) => b.priority - a.priority);
  return nudges.slice(0, MAX_ACTIVE_NUDGES);
}

/**
 * Évalue et persiste les nudges en tant qu'AiRecommendation.
 * Appelé par le scheduler batch (slow cycle, 1h).
 */
export async function persistNudges(userId: string): Promise<number> {
  const nudges = await evaluateNudges(userId);
  let created = 0;

  for (const nudge of nudges) {
    const profile = await computeSellerProfile(userId);
    const accountType = profile?.isBusiness ? "BUSINESS" : "USER";
    const businessId = profile?.isBusiness
      ? (await prisma.businessAccount.findFirst({ where: { ownerUserId: userId }, select: { id: true } }))?.id
      : undefined;

    await prisma.aiRecommendation.create({
      data: {
        engineKey: "pricing-nudge",
        userId,
        businessId: businessId ?? undefined,
        accountType,
        triggerType: nudge.triggerType,
        title: nudge.title,
        message: nudge.message,
        actionType: "NAVIGATE_PRICING",
        actionTarget: nudge.ctaTarget,
        actionData: {
          ctaLabel: nudge.ctaLabel,
          reason: nudge.reason,
          metric: nudge.metric ?? {},
        } as any,
        priority: nudge.priority,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72h
      },
    });
    created++;
  }

  return created;
}

/**
 * Batch : évalue les nudges pour les vendeurs actifs récents.
 * Appelé par le scheduler slow cycle (1h).
 */
export async function runBatchPricingNudges(): Promise<{ processed: number; nudgesCreated: number }> {
  const recentSellers = await prisma.listing.groupBy({
    by: ["ownerUserId"],
    where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 100,
  });

  let totalCreated = 0;
  for (const seller of recentSellers) {
    try {
      const n = await persistNudges(seller.ownerUserId);
      totalCreated += n;
    } catch {
      // skip individual failures
    }
  }

  return { processed: recentSellers.length, nudgesCreated: totalCreated };
}
