/**
 * COMMERCIAL ADVISOR — Moteur de recommandations commerciales contextuelles
 *
 * Analyse le profil complet d'un utilisateur ou business et recommande
 * LE produit le plus pertinent parmi :
 *
 *   PLAN       — forfait (BOOST, AUTO, PRO_VENDOR, STARTER, BUSINESS, SCALE)
 *   ADDON      — add-on (IA_MERCHANT, IA_ORDER, BOOST_VISIBILITY)
 *   BOOST      — boost visibilité court terme
 *   ADS_PACK   — pack publicité (3/7/10 pubs)
 *   ADS_PREMIUM — pub premium (homepage, top résultats)
 *   ANALYTICS  — Kin-Sell Analytique (PRO_VENDOR ou BUSINESS+)
 *
 * Signaux analysés :
 *   rôle, activité récente, publications, promotions, messages,
 *   ventes, catégorie dominante, performance annonces, historique boosts/pubs,
 *   maturité commerciale, analytics tier, addons actifs.
 *
 * Chaque règle est une fonction pure (AdvisorContext → Recommendation | null)
 * triée par priorité, filtrable par anti-spam.
 *
 * Réutilisable par :
 *   - GET /analytics/ai/commercial-advice (endpoint temps réel)
 *   - IA Ads Engine (import direct)
 *   - Scheduler batch (slow cycle)
 */

import { prisma } from "../../shared/db/prisma.js";
import {
  computeSellerProfile,
  type SellerProfile,
  type SellerLifecycle,
} from "../ads/ai-ads-engine.service.js";
import { PLAN_CATALOG, ADDON_CATALOG } from "../billing/billing.catalog.js";
import { OFFER_MAP, type OfferCode } from "../ads/ads-knowledge-base.js";
import { clearSubscriptionCache, userHasIaAccess } from "../../shared/billing/subscription-guard.js";

// ═══════════════════════════════════════════════════════
// Types publics
// ═══════════════════════════════════════════════════════

export type ProductType =
  | "PLAN"
  | "ADDON"
  | "BOOST"
  | "ADS_PACK"
  | "ADS_PREMIUM"
  | "ANALYTICS";

export interface CommercialRecommendation {
  productType: ProductType;
  productCode: string;        // "AUTO", "IA_MERCHANT", "ADS_PACK_7", etc.
  priority: number;           // 1-10
  confidence: number;         // 0-100 (% de certitude que c'est pertinent)
  title: string;
  message: string;
  rationale: string;          // justification courte pour l'IA Ads
  ctaLabel: string;
  ctaTarget: string;
  pricing: string;            // "12$/mois", "5$ pour 3 pubs", etc.
  signals: string[];          // signaux ayant déclenché la recommandation
  metric: Record<string, number | string>;
}

// ═══════════════════════════════════════════════════════
// Contexte enrichi (superset de SellerProfile)
// ═══════════════════════════════════════════════════════

interface AdvisorContext {
  profile: SellerProfile;

  // Activité temporelle
  listingsLast7d: number;
  listingsLast30d: number;
  messagesLast7d: number;
  messagesLast30d: number;
  salesLast7d: number;
  salesLast30d: number;
  salesPrev30d: number;       // 30-60j pour comparaison croissance
  ordersLast30d: number;      // commandes reçues (pas forcément livrées)

  // Promotions
  activePromos: number;
  promoWithoutBoost: number;  // promos sans boost actif

  // Performance annonces
  stagnantCount: number;
  stagnantRatio: number;      // 0-1

  // Historique boosts / pubs
  boostsPast30d: number;
  adCampaignsPast30d: number;
  hasEverBoosted: boolean;
  hasEverRunAd: boolean;

  // Catégorie
  topCategory: { name: string; salesCount: number } | null;
  categoryCount: number;      // nb de catégories distinctes vendues

  // État plan / addons
  planCode: string;
  planIndex: number;          // position dans l'upgrade path (-1 si pas de plan)
  maxPlanIndex: number;
  isBusiness: boolean;
  hasIaMerchant: boolean;
  hasIaOrder: boolean;
  hasBoostAddon: boolean;
  hasAdsPack: boolean;
  hasAdsPremium: boolean;
  hasAnalytics: boolean;      // MEDIUM ou PREMIUM
  analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
}

// ═══════════════════════════════════════════════════════
// Construction du contexte
// ═══════════════════════════════════════════════════════

async function buildAdvisorContext(
  userId: string,
  profile: SellerProfile
): Promise<AdvisorContext> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000);
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);

  const [
    listingsLast7d,
    listingsLast30d,
    messagesLast7d,
    messagesLast30d,
    salesLast7d,
    salesLast30d,
    salesPrev30d,
    ordersLast30d,
    activePromos,
    promoWithoutBoost,
    boostsPast30d,
    adCampaignsPast30d,
    hasEverBoosted,
    hasEverRunAd,
    categoryStats,
  ] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: userId, createdAt: { gte: d7 } } }),
    prisma.listing.count({ where: { ownerUserId: userId, createdAt: { gte: d30 } } }),
    prisma.message.count({ where: { senderId: userId, createdAt: { gte: d7 } } }),
    prisma.message.count({ where: { senderId: userId, createdAt: { gte: d30 } } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d7 } } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d30 } } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d60, lt: d30 } } }),
    prisma.order.count({ where: { sellerUserId: userId, createdAt: { gte: d30 } } }),
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE", promoPriceUsdCents: { not: null } } }),
    prisma.listing.count({
      where: { ownerUserId: userId, status: "ACTIVE", promoPriceUsdCents: { not: null }, isBoosted: false },
    }),
    prisma.listing.count({
      where: { ownerUserId: userId, isBoosted: true, boostExpiresAt: { gte: d30 } },
    }),
    prisma.aiAdCampaign.count({ where: { userId, createdAt: { gte: d30 } } }).catch(() => 0),
    prisma.listing.count({ where: { ownerUserId: userId, isBoosted: true } }).then((c) => c > 0),
    prisma.aiAdCampaign.count({ where: { userId } }).then((c) => c > 0).catch(() => false),
    prisma.orderItem.groupBy({
      by: ["category"],
      where: { order: { sellerUserId: userId, status: "DELIVERED" } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  const topCat = categoryStats.length > 0
    ? { name: categoryStats[0].category, salesCount: categoryStats[0]._count.id }
    : null;

  const planCode = profile.currentPlan?.code ?? (profile.isBusiness ? "STARTER" : "FREE");
  const upgradePath = profile.isBusiness
    ? ["STARTER", "BUSINESS", "SCALE"]
    : ["FREE", "BOOST", "AUTO", "PRO_VENDOR"];
  const planIdx = upgradePath.indexOf(planCode);

  // Analytics tier
  const planDef = PLAN_CATALOG.find((p) => p.code === planCode);
  const analyticsTier = (planDef?.analyticsTier ?? "NONE") as "NONE" | "MEDIUM" | "PREMIUM";

  const stagnant = profile.stagnantCount;
  const total = profile.totalListings;

  return {
    profile,
    listingsLast7d,
    listingsLast30d,
    messagesLast7d,
    messagesLast30d,
    salesLast7d,
    salesLast30d,
    salesPrev30d,
    ordersLast30d,
    activePromos,
    promoWithoutBoost,
    stagnantCount: stagnant,
    stagnantRatio: total > 0 ? stagnant / total : 0,
    boostsPast30d,
    adCampaignsPast30d,
    hasEverBoosted,
    hasEverRunAd,
    topCategory: topCat,
    categoryCount: categoryStats.length,
    planCode,
    planIndex: planIdx,
    maxPlanIndex: upgradePath.length - 1,
    isBusiness: profile.isBusiness,
    hasIaMerchant: profile.activeAddons.includes("IA_MERCHANT"),
    hasIaOrder: profile.activeAddons.includes("IA_ORDER"),
    hasBoostAddon: profile.hasBoostAddon,
    hasAdsPack: profile.activeAddons.includes("ADS_PACK"),
    hasAdsPremium: profile.activeAddons.includes("ADS_PREMIUM"),
    hasAnalytics: analyticsTier !== "NONE",
    analyticsTier,
  };
}

// ═══════════════════════════════════════════════════════
// Règles de recommandation — fonctions pures
// Chaque règle reçoit le contexte et retourne null ou une recommandation.
// ═══════════════════════════════════════════════════════

type AdvisorRule = (ctx: AdvisorContext) => CommercialRecommendation | null;

// ── PLAN : user actif peu visible → BOOST ────────────────────────────

const ruleUserNeedsBoost: AdvisorRule = (ctx) => {
  if (ctx.isBusiness) return null;
  if (ctx.planCode !== "FREE") return null;
  if (ctx.profile.totalListings < 5) return null;
  if (ctx.stagnantRatio < 0.4) return null;
  if (ctx.stagnantCount < 2) return null;

  const signals: string[] = [];
  if (ctx.listingsLast7d >= 3) signals.push(`${ctx.listingsLast7d} publications/7j`);
  if (ctx.stagnantRatio >= 0.5) signals.push(`${Math.round(ctx.stagnantRatio * 100)}% annonces stagnantes`);
  if (ctx.profile.completedSales >= 1) signals.push(`${ctx.profile.completedSales} ventes récentes`);
  if (signals.length === 0) signals.push("activité régulière sans visibilité");

  return {
    productType: "PLAN",
    productCode: "BOOST",
    priority: 7,
    confidence: Math.min(90, 50 + ctx.stagnantCount * 5 + ctx.listingsLast7d * 3),
    title: "Boostez votre visibilité",
    message: `Vous publiez régulièrement mais ${ctx.stagnantCount} de vos annonces manquent de visibilité. Le forfait BOOST (${OFFER_MAP.get("BOOST")!.pricingLabel}) met en avant votre profil et vos articles automatiquement.`,
    rationale: `User FREE avec ${ctx.stagnantCount} annonces stagnantes sur ${ctx.profile.totalListings} — bon candidat BOOST`,
    ctaLabel: "Passer à BOOST",
    ctaTarget: OFFER_MAP.get("BOOST")!.ctaPath,
    pricing: OFFER_MAP.get("BOOST")!.pricingLabel,
    signals,
    metric: { stagnant: ctx.stagnantCount, total: ctx.profile.totalListings, ratio: Math.round(ctx.stagnantRatio * 100) },
  };
};

// ── PLAN : user messages élevés → AUTO ───────────────────────────────

const ruleUserNeedsAuto: AdvisorRule = (ctx) => {
  if (ctx.isBusiness) return null;
  if (ctx.planIndex >= 2) return null; // déjà AUTO ou PRO_VENDOR
  if (ctx.messagesLast7d < 25 && ctx.salesLast7d < 3) return null;

  const signals: string[] = [];
  if (ctx.messagesLast7d >= 25) signals.push(`${ctx.messagesLast7d} messages/7j`);
  if (ctx.salesLast7d >= 3) signals.push(`${ctx.salesLast7d} ventes/7j`);
  if (ctx.ordersLast30d >= 10) signals.push(`${ctx.ordersLast30d} commandes/30j`);

  return {
    productType: "PLAN",
    productCode: "AUTO",
    priority: 8,
    confidence: Math.min(95, 45 + ctx.messagesLast7d + ctx.salesLast7d * 5),
    title: "Automatisez vos ventes",
    message: `Avec ${ctx.messagesLast7d} messages et ${ctx.salesLast7d} ventes cette semaine, vous passez beaucoup de temps en gestion manuelle. Le forfait AUTO (${OFFER_MAP.get("AUTO")!.pricingLabel}) automatise les réponses, le suivi commandes et les relances.`,
    rationale: `User avec fort volume messages/ventes, besoin d'automation — candidat AUTO`,
    ctaLabel: "Passer à AUTO",
    ctaTarget: OFFER_MAP.get("AUTO")!.ctaPath,
    pricing: OFFER_MAP.get("AUTO")!.pricingLabel,
    signals,
    metric: { messagesLast7d: ctx.messagesLast7d, salesLast7d: ctx.salesLast7d },
  };
};

// ── PLAN : vendeur sérieux → PRO VENDEUR ─────────────────────────────

const ruleUserNeedsProVendor: AdvisorRule = (ctx) => {
  if (ctx.isBusiness) return null;
  if (ctx.planIndex >= 3) return null; // déjà PRO_VENDOR
  if (ctx.profile.lifecycle !== "ESTABLISHED" && ctx.profile.lifecycle !== "POWER") return null;
  if (ctx.salesLast30d < 8) return null;

  const signals: string[] = [
    `${ctx.salesLast30d} ventes/30j`,
    `lifecycle: ${ctx.profile.lifecycle}`,
  ];
  if (ctx.profile.revenueLastThirtyDays >= 5000)
    signals.push(`${(ctx.profile.revenueLastThirtyDays / 100).toFixed(0)}$ revenus/30j`);
  if (!ctx.hasAnalytics) signals.push("pas d'analytics avancé");

  return {
    productType: "PLAN",
    productCode: "PRO_VENDOR",
    priority: 9,
    confidence: Math.min(95, 55 + ctx.salesLast30d * 2 + (ctx.profile.lifecycle === "POWER" ? 15 : 0)),
    title: "Passez Pro Vendeur",
    message: `${ctx.salesLast30d} ventes ce mois et un profil ${ctx.profile.lifecycle.toLowerCase()} — vous êtes un vendeur sérieux. Le forfait PRO VENDEUR (${OFFER_MAP.get("PRO_VENDOR")!.pricingLabel}) débloque l'analytics marché, l'automatisation complète et des outils d'analyse pour dominer votre catégorie.`,
    rationale: `Vendeur ${ctx.profile.lifecycle} avec ${ctx.salesLast30d} ventes/30j, revenu ${(ctx.profile.revenueLastThirtyDays / 100).toFixed(0)}$ — PRO_VENDOR optimal`,
    ctaLabel: "Devenir Pro Vendeur",
    ctaTarget: OFFER_MAP.get("PRO_VENDOR")!.ctaPath,
    pricing: OFFER_MAP.get("PRO_VENDOR")!.pricingLabel,
    signals,
    metric: { salesLast30d: ctx.salesLast30d, revenue: ctx.profile.revenueLastThirtyDays, lifecycle: ctx.profile.lifecycle },
  };
};

// ── PLAN : business en croissance → BUSINESS ─────────────────────────

const ruleBusinessNeedsBusiness: AdvisorRule = (ctx) => {
  if (!ctx.isBusiness) return null;
  if (ctx.planIndex >= 1) return null; // déjà BUSINESS ou SCALE
  const growth = ctx.salesPrev30d > 0
    ? ((ctx.salesLast30d - ctx.salesPrev30d) / ctx.salesPrev30d) * 100
    : (ctx.salesLast30d > 0 ? 100 : 0);
  if (ctx.salesLast30d < 5 && growth < 30) return null;

  const signals: string[] = [`${ctx.salesLast30d} ventes/30j`];
  if (growth > 0) signals.push(`+${Math.round(growth)}% croissance`);
  if (ctx.profile.totalListings >= 10) signals.push(`${ctx.profile.totalListings} articles`);

  return {
    productType: "PLAN",
    productCode: "BUSINESS",
    priority: 8,
    confidence: Math.min(95, 50 + ctx.salesLast30d * 3 + Math.min(20, growth / 5)),
    title: "Passez au forfait Business",
    message: `Votre boutique affiche ${ctx.salesLast30d} ventes ce mois${growth > 0 ? ` (+${Math.round(growth)}%)` : ""}. Le forfait BUSINESS (${OFFER_MAP.get("BUSINESS")!.pricingLabel}) inclut l'IA marchand, l'analytics marché et une visibilité renforcée pour accélérer.`,
    rationale: `Business STARTER en croissance (${Math.round(growth)}%), ${ctx.salesLast30d} ventes — upgrade BUSINESS`,
    ctaLabel: "Passer à Business",
    ctaTarget: OFFER_MAP.get("BUSINESS")!.ctaPath,
    pricing: OFFER_MAP.get("BUSINESS")!.pricingLabel,
    signals,
    metric: { salesLast30d: ctx.salesLast30d, growth: Math.round(growth), listings: ctx.profile.totalListings },
  };
};

// ── PLAN : business avancé → SCALE ───────────────────────────────────

const ruleBusinessNeedsScale: AdvisorRule = (ctx) => {
  if (!ctx.isBusiness) return null;
  if (ctx.planIndex >= 2) return null; // déjà SCALE
  if (ctx.profile.lifecycle !== "ESTABLISHED" && ctx.profile.lifecycle !== "POWER") return null;
  if (ctx.salesLast30d < 15 && ctx.profile.totalListings < 25) return null;

  const signals: string[] = [
    `lifecycle: ${ctx.profile.lifecycle}`,
    `${ctx.salesLast30d} ventes/30j`,
    `${ctx.profile.totalListings} articles`,
  ];
  if (ctx.profile.revenueLastThirtyDays >= 10000)
    signals.push(`${(ctx.profile.revenueLastThirtyDays / 100).toFixed(0)}$ revenus/30j`);

  return {
    productType: "PLAN",
    productCode: "SCALE",
    priority: 9,
    confidence: Math.min(95, 55 + ctx.salesLast30d + ctx.profile.totalListings),
    title: "Passez à SCALE",
    message: `Avec ${ctx.profile.totalListings} articles et ${ctx.salesLast30d} ventes ce mois, votre activité mérite le forfait SCALE (${OFFER_MAP.get("SCALE")!.pricingLabel}). L'analytics premium, l'IA commande et les outils d'automatisation complète libèrent votre temps pour vous concentrer sur la croissance.`,
    rationale: `Business ${ctx.profile.lifecycle} avec catalogue conséquent — SCALE recommandé`,
    ctaLabel: "Passer à SCALE",
    ctaTarget: OFFER_MAP.get("SCALE")!.ctaPath,
    pricing: OFFER_MAP.get("SCALE")!.pricingLabel,
    signals,
    metric: { salesLast30d: ctx.salesLast30d, listings: ctx.profile.totalListings, lifecycle: ctx.profile.lifecycle },
  };
};

// ── ADDON : IA Marchand ──────────────────────────────────────────────

const ruleNeedsIaMerchant: AdvisorRule = (ctx) => {
  if (ctx.hasIaMerchant) return null;
  if (ctx.profile.negotiationCount < 5) return null;
  if (ctx.profile.conversionRate >= 60) return null; // déjà bon, pas besoin

  const signals: string[] = [
    `${ctx.profile.negotiationCount} négociations/30j`,
    `${ctx.profile.conversionRate}% conversion`,
  ];
  if (ctx.messagesLast7d >= 15) signals.push(`${ctx.messagesLast7d} messages/7j`);

  return {
    productType: "ADDON",
    productCode: "IA_MERCHANT",
    priority: 6,
    confidence: Math.min(90, 40 + ctx.profile.negotiationCount * 2 + (60 - ctx.profile.conversionRate)),
    title: ctx.isBusiness
      ? "IA Marchand : optimisez votre taux de conversion"
      : "IA Marchand : vendez plus facilement",
    message: ctx.isBusiness
      ? `${ctx.profile.negotiationCount} négociations avec ${ctx.profile.conversionRate}% de conversion — l'IA Marchand ajuste automatiquement vos contre-offres et optimise chaque échange pour maximiser le volume de ventes converti.`
      : `${ctx.profile.negotiationCount} négociations avec ${ctx.profile.conversionRate}% de conversion — l'IA Marchand vous aide à trouver le bon prix et répondre plus vite pour ne rater aucune vente.`,
    rationale: `Négociations fréquentes (${ctx.profile.negotiationCount}) mais conversion faible (${ctx.profile.conversionRate}%) — IA_MERCHANT utile`,
    ctaLabel: ctx.isBusiness ? "Optimiser mes conversions" : "Activer IA Marchand",
    ctaTarget: OFFER_MAP.get("IA_MERCHANT")!.ctaPath,
    pricing: OFFER_MAP.get("IA_MERCHANT")!.pricingLabel,
    signals,
    metric: { negotiations: ctx.profile.negotiationCount, conversion: ctx.profile.conversionRate },
  };
};

// ── ADDON : IA Commande ──────────────────────────────────────────────

const ruleNeedsIaOrder: AdvisorRule = (ctx) => {
  if (ctx.hasIaOrder) return null;
  if (ctx.ordersLast30d < 8 && ctx.messagesLast30d < 50) return null;

  const signals: string[] = [];
  if (ctx.ordersLast30d >= 8) signals.push(`${ctx.ordersLast30d} commandes/30j`);
  if (ctx.messagesLast30d >= 50) signals.push(`${ctx.messagesLast30d} messages/30j`);
  if (ctx.salesLast7d >= 3) signals.push(`${ctx.salesLast7d} ventes/7j`);

  return {
    productType: "ADDON",
    productCode: "IA_ORDER",
    priority: 7,
    confidence: Math.min(95, 40 + ctx.ordersLast30d * 2 + Math.min(30, ctx.messagesLast30d / 3)),
    title: ctx.isBusiness
      ? "IA Commande : industrialisez votre fulfillment"
      : "IA Commande : vendez sans stress",
    message: ctx.isBusiness
      ? `${ctx.ordersLast30d} commandes et ${ctx.messagesLast30d} messages ce mois — l'IA Commande automatise tout le cycle de commande pour libérer votre équipe et traiter plus de volume.`
      : `${ctx.ordersLast30d} commandes et ${ctx.messagesLast30d} messages ce mois — plus besoin de relancer manuellement. L'IA Commande confirme, suit et relance pour vous.`,
    rationale: `Volume élevé commandes/messages → automation nécessaire — IA_ORDER`,
    ctaLabel: ctx.isBusiness ? "Automatiser les opérations" : "Activer IA Commande",
    ctaTarget: OFFER_MAP.get("IA_ORDER")!.ctaPath,
    pricing: OFFER_MAP.get("IA_ORDER")!.pricingLabel,
    signals,
    metric: { ordersLast30d: ctx.ordersLast30d, messagesLast30d: ctx.messagesLast30d },
  };
};

// ── BOOST : annonces promo peu visibles ──────────────────────────────

const rulePromoNeedsBoost: AdvisorRule = (ctx) => {
  if (ctx.promoWithoutBoost < 2) return null;
  // Si l'user a déjà l'addon boost, proposer l'action de boost (→ dashboard)
  // Si l'user n'a PAS l'addon et est FREE, proposer l'addon BOOST_VISIBILITY
  // Si l'user a un plan >= BOOST, le boost est inclus → proposer l'action
  if (!ctx.hasBoostAddon && ctx.planIndex < 1) {
    // Proposer l'addon BOOST_VISIBILITY
    const signals = [
      `${ctx.promoWithoutBoost} promos sans boost`,
      `${ctx.activePromos} promos actives`,
    ];
    return {
      productType: "ADDON",
      productCode: "BOOST_VISIBILITY",
      priority: 6,
      confidence: Math.min(85, 50 + ctx.promoWithoutBoost * 10),
      title: ctx.isBusiness
        ? "Amplifiez vos promotions avec le Boost"
        : "Vos promos méritent plus de visibilité",
      message: ctx.isBusiness
        ? `${ctx.promoWithoutBoost} promos actives sans boost — l'add-on Boost Visibilité multiplie leur portée par 2 à 5×.`
        : `${ctx.promoWithoutBoost} de vos promos ne sont pas boostées. L'add-on Boost Visibilité (${OFFER_MAP.get("BOOST_VISIBILITY")!.pricingLabel}) les met en avant auprès des acheteurs.`,
      rationale: `Promos sans addon boost — proposer BOOST_VISIBILITY`,
      ctaLabel: ctx.isBusiness ? "Souscrire au Boost" : "Activer le Boost",
      ctaTarget: OFFER_MAP.get("BOOST_VISIBILITY")!.ctaPath,
      pricing: OFFER_MAP.get("BOOST_VISIBILITY")!.pricingLabel,
      signals,
      metric: { promoWithoutBoost: ctx.promoWithoutBoost, activePromos: ctx.activePromos },
    };
  }

  // A déjà l'addon ou un plan avec boost → proposer l'action
  const signals = [
    `${ctx.promoWithoutBoost} promos sans boost`,
    `${ctx.activePromos} promos actives`,
  ];

  return {
    productType: "BOOST",
    productCode: "BOOST_VISIBILITY",
    priority: 6,
    confidence: Math.min(85, 50 + ctx.promoWithoutBoost * 10),
    title: ctx.isBusiness
      ? "Maximisez le ROI de vos campagnes promo"
      : "Boostez vos promotions",
    message: ctx.isBusiness
      ? `${ctx.promoWithoutBoost} promos actives sans boost — amplifiez leur portée pour maximiser le retour sur vos opérations commerciales.`
      : `${ctx.promoWithoutBoost} de vos articles en promotion n'ont pas de boost actif. Un boost multiplie la visibilité de vos promos par 2 à 5×.`,
    rationale: `Promos actives sans boost — visibilité perdue`,
    ctaLabel: ctx.isBusiness ? "Amplifier mes campagnes" : "Booster mes promos",
    ctaTarget: "/dashboard",
    pricing: "Inclus dans votre add-on",
    signals,
    metric: { promoWithoutBoost: ctx.promoWithoutBoost, activePromos: ctx.activePromos },
  };
};

// ── BOOST ADDON : annonces stagnantes sans addon ─────────────────────

const ruleNeedsBoostAddon: AdvisorRule = (ctx) => {
  if (ctx.hasBoostAddon) return null;
  if (ctx.stagnantCount < 3) return null;
  if (ctx.profile.totalListings < 5) return null;

  const signals = [
    `${ctx.stagnantCount} annonces stagnantes`,
    `${Math.round(ctx.stagnantRatio * 100)}% du catalogue`,
  ];
  if (!ctx.hasEverBoosted) signals.push("jamais boosté");

  return {
    productType: "ADDON",
    productCode: "BOOST_VISIBILITY",
    priority: 7,
    confidence: Math.min(90, 45 + ctx.stagnantCount * 5 + (ctx.hasEverBoosted ? 0 : 10)),
    title: ctx.isBusiness
      ? "Relancez le trafic de votre catalogue"
      : "Remettez vos annonces en avant",
    message: ctx.isBusiness
      ? `${ctx.stagnantCount} articles sur ${ctx.profile.totalListings} stagnent sans interaction. Le Boost Visibilité maintient le flux de prospects sur votre boutique.`
      : `${ctx.stagnantCount} de vos ${ctx.profile.totalListings} annonces n'ont reçu aucune interaction depuis 7 jours. Le Boost Visibilité les relance auprès des acheteurs actifs.`,
    rationale: `${Math.round(ctx.stagnantRatio * 100)}% d'annonces stagnantes sans boost addon — BOOST_VISIBILITY recommandé`,
    ctaLabel: ctx.isBusiness ? "Relancer mon catalogue" : "Débloquer le boost",
    ctaTarget: OFFER_MAP.get("BOOST_VISIBILITY")!.ctaPath,
    pricing: "1$/24h · 5$/7j",
    signals,
    metric: { stagnant: ctx.stagnantCount, total: ctx.profile.totalListings, ratio: Math.round(ctx.stagnantRatio * 100) },
  };
};

// ── ADS_PACK : vendeur établi sans pub ───────────────────────────────

const ruleNeedsAdsPack: AdvisorRule = (ctx) => {
  if (ctx.hasAdsPack) return null;
  if (ctx.profile.lifecycle === "NEW") return null;
  if (ctx.profile.budgetTier === "ZERO") return null;
  if (ctx.adCampaignsPast30d > 0) return null; // déjà actif en pub
  if (ctx.salesLast30d < 3) return null;

  const signals = [
    `${ctx.salesLast30d} ventes/30j sans campagne pub`,
    `lifecycle ${ctx.profile.lifecycle}`,
  ];
  if (ctx.topCategory) signals.push(`catégorie dominante: ${ctx.topCategory.name}`);

  return {
    productType: "ADS_PACK",
    productCode: ctx.salesLast30d >= 10 ? "ADS_PACK_10" : ctx.salesLast30d >= 5 ? "ADS_PACK_7" : "ADS_PACK_3",
    priority: 5,
    confidence: Math.min(85, 40 + ctx.salesLast30d * 3),
    title: ctx.isBusiness
      ? "Étendez votre couverture marketplace"
      : "Touchez plus d'acheteurs",
    message: ctx.isBusiness
      ? `${ctx.salesLast30d} ventes/mois sans campagne publicitaire. Un Pack Pub amplifie la présence de votre boutique${ctx.topCategory ? ` (${ctx.topCategory.name})` : ""} et génère du trafic qualifié vers votre catalogue.`
      : `Vous réalisez ${ctx.salesLast30d} ventes/mois sans publicité. Un Pack Pub diffuse vos articles${ctx.topCategory ? ` (${ctx.topCategory.name})` : ""} auprès des acheteurs qui cherchent.`,
    rationale: `Vendeur établi avec ventes mais aucune pub — potentiel pub inexploité`,
    ctaLabel: ctx.isBusiness ? "Lancer une campagne" : "Voir les packs pub",
    ctaTarget: OFFER_MAP.get("ADS_PACK")!.ctaPath,
    pricing: "à partir de 5$ (3 pubs)",
    signals,
    metric: { salesLast30d: ctx.salesLast30d, adCampaigns: ctx.adCampaignsPast30d },
  };
};

// ── ADS_PREMIUM : power seller / big business ────────────────────────

const ruleNeedsAdsPremium: AdvisorRule = (ctx) => {
  if (ctx.hasAdsPremium) return null;
  if (ctx.profile.lifecycle !== "POWER" && ctx.profile.lifecycle !== "ESTABLISHED") return null;
  if (ctx.profile.budgetTier === "ZERO" || ctx.profile.budgetTier === "LOW") return null;
  if (ctx.salesLast30d < 15) return null;

  const signals = [
    `${ctx.salesLast30d} ventes/30j`,
    `budget tier: ${ctx.profile.budgetTier}`,
    `${(ctx.profile.revenueLastThirtyDays / 100).toFixed(0)}$ revenus/30j`,
  ];

  return {
    productType: "ADS_PREMIUM",
    productCode: "ADS_PREMIUM",
    priority: 6,
    confidence: Math.min(90, 50 + ctx.salesLast30d + (ctx.profile.budgetTier === "PREMIUM" ? 15 : 0)),
    title: ctx.isBusiness
      ? "Pub Premium : dominez la marketplace"
      : "Publicité Premium — Homepage",
    message: ctx.isBusiness
      ? `Avec ${(ctx.profile.revenueLastThirtyDays / 100).toFixed(0)}$ de revenus ce mois, placez votre boutique en homepage et en tête des résultats pour capter le maximum de trafic qualifié et maximiser votre part de marché.`
      : `Avec ${(ctx.profile.revenueLastThirtyDays / 100).toFixed(0)}$ de revenus ce mois, la Pub Premium place vos articles en homepage et en tête des résultats pour toucher un maximum d'acheteurs.`,
    rationale: `Power/Established seller avec budget ${ctx.profile.budgetTier} — ADS_PREMIUM rentable`,
    ctaLabel: ctx.isBusiness ? "Dominer la marketplace" : "Pub Premium",
    ctaTarget: OFFER_MAP.get("ADS_PREMIUM")!.ctaPath,
    pricing: "25$",
    signals,
    metric: { salesLast30d: ctx.salesLast30d, revenue: ctx.profile.revenueLastThirtyDays, budget: ctx.profile.budgetTier },
  };
};

// ── ANALYTICS : vendeur avec historique utile ────────────────────────

const ruleNeedsAnalytics: AdvisorRule = (ctx) => {
  if (ctx.hasAnalytics) return null;
  if (ctx.profile.lifecycle === "NEW") return null;
  if (ctx.profile.completedSales < 5) return null;

  const signals = [
    `${ctx.profile.completedSales} ventes totales`,
    `lifecycle: ${ctx.profile.lifecycle}`,
  ];
  if (ctx.topCategory) signals.push(`expert ${ctx.topCategory.name} (${ctx.topCategory.salesCount} ventes)`);
  if (ctx.categoryCount >= 3) signals.push(`${ctx.categoryCount} catégories actives`);
  if (ctx.profile.conversionRate > 0) signals.push(`${ctx.profile.conversionRate}% conversion`);

  // Recommander le plan qui donne analytics
  const targetPlan = ctx.isBusiness ? "BUSINESS" : "PRO_VENDOR";
  const targetPrice = ctx.isBusiness ? "30$/mois" : "20$/mois";

  return {
    productType: "ANALYTICS",
    productCode: `ANALYTICS_VIA_${targetPlan}`,
    priority: 7,
    confidence: Math.min(90, 40 + ctx.profile.completedSales * 2 + (ctx.topCategory ? ctx.topCategory.salesCount * 3 : 0)),
    title: ctx.isBusiness
      ? "Kin-Sell Analytique : pilotez avec la data"
      : "Kin-Sell Analytique : vendez mieux",
    message: ctx.isBusiness
      ? `Avec ${ctx.profile.completedSales} ventes${ctx.topCategory ? ` et une expertise en ${ctx.topCategory.name}` : ""}, l'Analytique révèle tendances marché, opportunités de croissance et leviers d'optimisation pour piloter votre stratégie commerciale.`
      : `Avec ${ctx.profile.completedSales} ventes${ctx.topCategory ? ` et une expertise en ${ctx.topCategory.name}` : ""}, l'Analytique vous montre les prix du marché, les tendances de votre zone et des conseils personnalisés pour vendre mieux.`,
    rationale: `Vendeur ${ctx.profile.lifecycle} avec historique suffisant pour tirer profit d'analytics — ${targetPlan}`,
    ctaLabel: ctx.isBusiness ? "Activer le pilotage data" : "Activer l'Analytique",
    ctaTarget: OFFER_MAP.get(targetPlan as OfferCode)?.ctaPath ?? `/forfaits?highlight=${targetPlan}`,
    pricing: targetPrice,
    signals,
    metric: { sales: ctx.profile.completedSales, category: ctx.topCategory?.name ?? "diverse", lifecycle: ctx.profile.lifecycle },
  };
};

// ── PLAN : catégorie dominante → spécialisation ──────────────────────

const ruleCategorySpecialist: AdvisorRule = (ctx) => {
  if (!ctx.topCategory || ctx.topCategory.salesCount < 5) return null;
  if (ctx.hasAnalytics) return null; // déjà équipé pour analyser
  if (ctx.planIndex >= (ctx.isBusiness ? 2 : 3)) return null;

  const signals = [
    `${ctx.topCategory.salesCount} ventes en ${ctx.topCategory.name}`,
    `${ctx.categoryCount} catégories actives`,
  ];

  const targetPlan = ctx.isBusiness ? "SCALE" : "PRO_VENDOR";
  const price = ctx.isBusiness ? "50$/mois" : "20$/mois";

  return {
    productType: "PLAN",
    productCode: targetPlan,
    priority: 7,
    confidence: Math.min(90, 45 + ctx.topCategory.salesCount * 3),
    title: ctx.isBusiness
      ? `Leader ${ctx.topCategory.name} — consolidez votre position`
      : `Expert ${ctx.topCategory.name} — vendez encore mieux`,
    message: ctx.isBusiness
      ? `${ctx.topCategory.salesCount} ventes en "${ctx.topCategory.name}". L'Analytics Premium donne les insights concurrentiels, les tendances catégorielles et les recommandations stratégiques pour protéger et étendre votre position dominante.`
      : `Vous dominez "${ctx.topCategory.name}" avec ${ctx.topCategory.salesCount} ventes. Un forfait supérieur vous donne les outils analytics pour comprendre votre marché, optimiser vos prix et garder votre avance.`,
    rationale: `Dominance catégorie ${ctx.topCategory.name} (${ctx.topCategory.salesCount} ventes) — analytics premium utile`,
    ctaLabel: ctx.isBusiness ? `Piloter ${ctx.topCategory.name}` : `Passer à ${targetPlan}`,
    ctaTarget: OFFER_MAP.get(targetPlan as OfferCode)?.ctaPath ?? `/forfaits?highlight=${targetPlan}`,
    pricing: price,
    signals,
    metric: { category: ctx.topCategory.name, salesInCategory: ctx.topCategory.salesCount },
  };
};

// ═══════════════════════════════════════════════════════
// Registre des règles (ordonnées par importance stratégique)
// ═══════════════════════════════════════════════════════

const RULES: AdvisorRule[] = [
  // Plans (haute priorité) — un seul plan sera retenu
  ruleUserNeedsProVendor,
  ruleBusinessNeedsScale,
  ruleBusinessNeedsBusiness,
  ruleUserNeedsAuto,
  ruleUserNeedsBoost,

  // Analytics (complémentaire)
  ruleNeedsAnalytics,
  ruleCategorySpecialist,

  // Addons
  ruleNeedsIaOrder,
  ruleNeedsIaMerchant,
  ruleNeedsBoostAddon,

  // Publicité
  ruleNeedsAdsPremium,
  ruleNeedsAdsPack,

  // Boost immédiat
  rulePromoNeedsBoost,
];

// ═══════════════════════════════════════════════════════
// Anti-spam
// ═══════════════════════════════════════════════════════

const ADVICE_COOLDOWN_HOURS = 24;
const MAX_ACTIVE_ADVICE = 3;

async function canAdvise(userId: string, productCode: string): Promise<boolean> {
  const since = new Date(Date.now() - ADVICE_COOLDOWN_HOURS * 60 * 60 * 1000);
  const existing = await prisma.aiRecommendation.count({
    where: {
      userId,
      engineKey: "commercial-advisor",
      actionData: { path: ["productCode"], equals: productCode },
      createdAt: { gte: since },
    },
  });
  return existing === 0;
}

// ═══════════════════════════════════════════════════════
// API publique
// ═══════════════════════════════════════════════════════

/**
 * Évalue toutes les règles pour un utilisateur et retourne les recommandations
 * les plus pertinentes, triées par score (priority × confidence).
 *
 * Utilisé par :
 * - GET /analytics/ai/commercial-advice (temps réel)
 * - IA Ads Engine (import) pour enrichir les offres
 */
export async function getCommercialAdvice(userId: string): Promise<CommercialRecommendation[]> {
  const profile = await computeSellerProfile(userId);
  if (!profile) return [];

  const ctx = await buildAdvisorContext(userId, profile);
  const results: CommercialRecommendation[] = [];
  const seenProductTypes = new Set<ProductType>();

  for (const rule of RULES) {
    const rec = rule(ctx);
    if (!rec) continue;

    // Dédupliquer : 1 seul PLAN, 1 seul ANALYTICS, multi ADDON ok
    if (rec.productType === "PLAN" && seenProductTypes.has("PLAN")) continue;
    if (rec.productType === "ANALYTICS" && seenProductTypes.has("ANALYTICS")) continue;

    // Anti-spam
    if (!(await canAdvise(userId, rec.productCode))) continue;

    results.push(rec);
    seenProductTypes.add(rec.productType);

    if (results.length >= MAX_ACTIVE_ADVICE) break;
  }

  // Trier par score composite (priority * confidence)
  results.sort((a, b) => b.priority * b.confidence - a.priority * a.confidence);

  return results;
}

/**
 * Persiste les recommandations en tant qu'AiRecommendation.
 * Appelé par le scheduler batch.
 */
export async function persistCommercialAdvice(userId: string): Promise<number> {
  const advice = await getCommercialAdvice(userId);
  let created = 0;

  for (const rec of advice) {
    const profile = await computeSellerProfile(userId);
    const accountType = profile?.isBusiness ? "BUSINESS" : "USER";
    const businessId = profile?.isBusiness
      ? (await prisma.businessAccount.findFirst({ where: { ownerUserId: userId }, select: { id: true } }))?.id
      : undefined;

    await prisma.aiRecommendation.create({
      data: {
        engineKey: "commercial-advisor",
        userId,
        businessId: businessId ?? undefined,
        accountType,
        triggerType: `COMMERCIAL_${rec.productType}`,
        title: rec.title,
        message: rec.message,
        actionType: `RECOMMEND_${rec.productType}`,
        actionTarget: rec.ctaTarget,
        actionData: {
          productType: rec.productType,
          productCode: rec.productCode,
          ctaLabel: rec.ctaLabel,
          pricing: rec.pricing,
          rationale: rec.rationale,
          signals: rec.signals,
          confidence: rec.confidence,
          metric: rec.metric,
        } as any,
        priority: rec.priority,
        expiresAt: new Date(Date.now() + 96 * 60 * 60 * 1000), // 96h
      },
    });
    created++;
  }

  return created;
}

/**
 * Batch : évalue les recommandations pour les vendeurs actifs (top 100).
 * Appelé par le scheduler slow cycle (1h).
 */
export async function runBatchCommercialAdvice(): Promise<{ processed: number; created: number }> {
  clearSubscriptionCache();

  const recentSellers = await prisma.listing.groupBy({
    by: ["ownerUserId"],
    where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 100,
  });

  let totalCreated = 0;
  for (const seller of recentSellers) {
    try {
      const hasAccess = await userHasIaAccess(seller.ownerUserId, "IA_MERCHANT");
      if (!hasAccess) continue;
      totalCreated += await persistCommercialAdvice(seller.ownerUserId);
    } catch {
      // skip individual failures
    }
  }

  return { processed: recentSellers.length, created: totalCreated };
}
