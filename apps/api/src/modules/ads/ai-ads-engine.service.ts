/**
 * IA ADS ENGINE — Moteur de recommandation intelligent
 *
 * Comprend le système complet Kin-Sell :
 * - Abonnements (long terme) : FREE → BOOST → AUTO → PRO_VENDOR | STARTER → BUSINESS → SCALE
 * - Add-ons : IA_MERCHANT, IA_ORDER, BOOST_VISIBILITY, ADS_PACK, ADS_PREMIUM
 * - Boosts (court terme) : boost article unitaire, highlight boutique/profil
 * - Publicités (campagne) : bannière, carte, interstitiel — budget maîtrisé
 * - Activation : PayPal uniquement ou validation admin manuelle
 *
 * Exports :
 * - computeSellerProfile()  — score 0-100, lifecycle, budget estimé, état plan/addons
 * - generateSmartOffers()   — recommandations contextualisées et priorisées
 */

import { prisma } from "../../shared/db/prisma.js";
import { PLAN_CATALOG, ADDON_CATALOG } from "../billing/billing.catalog.js";
import { getMarketMedian, computePricePosition } from "../../shared/market/market-shared.js";
import { OFFER_MAP, type OfferCode } from "./ads-knowledge-base.js";

/** Helper: deep-link vers /forfaits depuis la knowledge base */
function offerCta(code: OfferCode, fallbackTab = "users"): string {
  return OFFER_MAP.get(code)?.ctaPath ?? `/forfaits?tab=${fallbackTab}`;
}

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export type SellerLifecycle = "NEW" | "GROWING" | "ESTABLISHED" | "POWER";
export type BudgetTier = "ZERO" | "LOW" | "MEDIUM" | "HIGH" | "PREMIUM";
export type OfferType = "SUBSCRIPTION" | "UPGRADE" | "ADDON" | "BOOST" | "AD_CAMPAIGN" | "TRIAL";

export interface SellerProfile {
  userId: string;
  score: number;                   // 0-100
  lifecycle: SellerLifecycle;
  budgetTier: BudgetTier;
  estimatedMonthlyBudgetCents: number;
  accountAgeDays: number;
  isBusiness: boolean;

  // État actuel
  currentPlan: { code: string; name: string; priceCents: number } | null;
  activeAddons: string[];
  hasBoostAddon: boolean;
  activeBoostedListings: number;
  totalListings: number;
  completedSales: number;
  revenueLastThirtyDays: number;   // USD cents
  negotiationCount: number;
  conversionRate: number;          // 0-100%
  avgOrderValueCents: number;

  // Historique IA
  previousRecommendations: number;
  acceptedRecommendations: number;
  engagementRate: number;          // 0-100%

  // Analyse
  topCategory: string | null;
  topCity: string | null;
  hasStagnantListings: boolean;
  stagnantCount: number;
}

export interface SmartOffer {
  type: OfferType;
  priority: number;                // 1-10
  title: string;
  message: string;
  triggerType: string;
  actionType: string;
  actionTarget: string;
  actionData: Record<string, unknown>;
  expiresInHours: number;
  engineKey: string;
}

// ═══════════════════════════════════════════════════════
// Plan upgrade paths — connaissance du catalogue
// ═══════════════════════════════════════════════════════

const USER_UPGRADE_PATH = ["FREE", "BOOST", "AUTO", "PRO_VENDOR"];
const BUSINESS_UPGRADE_PATH = ["STARTER", "BUSINESS", "SCALE"];

function getNextPlan(currentCode: string, isBusiness: boolean): { code: string; name: string; priceCents: number } | null {
  const path = isBusiness ? BUSINESS_UPGRADE_PATH : USER_UPGRADE_PATH;
  const idx = path.indexOf(currentCode);
  if (idx < 0 || idx >= path.length - 1) return null;
  const nextCode = path[idx + 1];
  const plan = PLAN_CATALOG.find((p) => p.code === nextCode);
  if (!plan) return null;
  return { code: plan.code, name: plan.name, priceCents: plan.monthlyPriceUsdCents };
}

function getPlanByCode(code: string) {
  return PLAN_CATALOG.find((p) => p.code === code) ?? null;
}

function planIndex(code: string, isBusiness: boolean): number {
  const path = isBusiness ? BUSINESS_UPGRADE_PATH : USER_UPGRADE_PATH;
  return path.indexOf(code);
}

// ═══════════════════════════════════════════════════════
// Seller Scoring — évalue le niveau du vendeur
// ═══════════════════════════════════════════════════════

export async function computeSellerProfile(userId: string): Promise<SellerProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      profile: { select: { city: true, country: true } },
    },
  });
  if (!user) return null;

  const isBusiness = user.role === "BUSINESS";
  const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));

  // Business account
  const business = isBusiness
    ? await prisma.businessAccount.findFirst({
      where: { ownerUserId: userId },
      select: { id: true, subscriptionStatus: true },
    })
    : null;

  // Subscription active
  const subscription = await prisma.subscription.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { userId },
        ...(business ? [{ businessId: business.id }] : []),
      ],
    },
    select: { planCode: true, priceUsdCents: true, addons: { where: { status: "ACTIVE" }, select: { addonCode: true } } },
  });

  const currentPlan: SellerProfile["currentPlan"] = subscription
    ? { code: subscription.planCode, name: getPlanByCode(subscription.planCode)?.name ?? subscription.planCode, priceCents: subscription.priceUsdCents }
    : null;
  const activeAddons = subscription?.addons.map((a) => a.addonCode) ?? [];
  const hasBoostAddon = activeAddons.includes("BOOST_VISIBILITY");

  // Listings
  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalListings, activeBoostedListings] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE" } }),
    prisma.listing.count({ where: { ownerUserId: userId, isBoosted: true, boostExpiresAt: { gt: now } } }),
  ]);

  // Ventes et revenus (30 derniers jours)
  const recentOrders = await prisma.order.findMany({
    where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: thirtyDaysAgo } },
    select: { totalUsdCents: true },
  });
  const completedSales = recentOrders.length;
  const revenueLastThirtyDays = recentOrders.reduce((s, o) => s + (o.totalUsdCents ?? 0), 0);
  const avgOrderValueCents = completedSales > 0 ? Math.round(revenueLastThirtyDays / completedSales) : 0;

  // Ventes totales (tout historique)
  const totalSales = await prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED" } });

  // Négociations et conversion
  const [negoTotal, negoConverted] = await Promise.all([
    prisma.negotiation.count({ where: { listing: { ownerUserId: userId }, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.negotiation.count({ where: { listing: { ownerUserId: userId }, status: "ACCEPTED", createdAt: { gte: thirtyDaysAgo } } }),
  ]);
  const conversionRate = negoTotal > 0 ? Math.round((negoConverted / negoTotal) * 100) : 0;

  // Articles stagnants (7+ jours, < 2 négos)
  const oldListings = await prisma.listing.findMany({
    where: { ownerUserId: userId, status: "ACTIVE", createdAt: { lte: sevenDaysAgo } },
    select: { id: true, _count: { select: { negotiations: true } } },
    take: 50,
  });
  const stagnant = oldListings.filter((l) => l._count.negotiations < 2);

  // Top catégorie / ville
  const listingStats = await prisma.listing.findMany({
    where: { ownerUserId: userId, status: "ACTIVE" },
    select: { category: true, city: true },
    take: 50,
  });
  const catCounts: Record<string, number> = {};
  const cityCounts: Record<string, number> = {};
  for (const l of listingStats) {
    catCounts[l.category] = (catCounts[l.category] ?? 0) + 1;
    cityCounts[l.city] = (cityCounts[l.city] ?? 0) + 1;
  }
  const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Historique recommandations IA
  const [previousRecommendations, acceptedRecommendations] = await Promise.all([
    prisma.aiRecommendation.count({ where: { userId } }),
    prisma.aiRecommendation.count({ where: { userId, accepted: true } }),
  ]);
  const engagementRate = previousRecommendations > 0
    ? Math.round((acceptedRecommendations / previousRecommendations) * 100)
    : 0;

  // ── SCORING ──
  let score = 0;

  // Listings actifs (0-15)
  if (totalListings >= 10) score += 15;
  else if (totalListings >= 5) score += 12;
  else if (totalListings >= 3) score += 8;
  else if (totalListings >= 1) score += 4;

  // Ventes totales (0-25)
  if (totalSales >= 20) score += 25;
  else if (totalSales >= 10) score += 20;
  else if (totalSales >= 5) score += 15;
  else if (totalSales >= 1) score += 8;

  // Ancienneté (0-10)
  if (accountAgeDays >= 90) score += 10;
  else if (accountAgeDays >= 30) score += 7;
  else if (accountAgeDays >= 7) score += 4;
  else score += 1;

  // Abonnement payant (0-15)
  if (currentPlan) {
    const idx = planIndex(currentPlan.code, isBusiness);
    const path = isBusiness ? BUSINESS_UPGRADE_PATH : USER_UPGRADE_PATH;
    if (idx >= 0) score += Math.min(15, 5 + idx * 4);
  }

  // Add-ons actifs (0-10)
  score += Math.min(10, activeAddons.length * 4);

  // Engagement IA (0-10)
  if (engagementRate >= 50) score += 10;
  else if (engagementRate >= 20) score += 5;
  else if (previousRecommendations > 0) score += 2;

  // Conversion négociations (0-10)
  if (conversionRate >= 60) score += 10;
  else if (conversionRate >= 30) score += 6;
  else if (conversionRate >= 10) score += 3;

  // Boosts déjà utilisés (0-5)
  if (activeBoostedListings >= 5) score += 5;
  else if (activeBoostedListings >= 1) score += 3;

  score = Math.min(100, score);

  // ── LIFECYCLE ──
  let lifecycle: SellerLifecycle;
  if (score >= 75) lifecycle = "POWER";
  else if (score >= 50) lifecycle = "ESTABLISHED";
  else if (score >= 20) lifecycle = "GROWING";
  else lifecycle = "NEW";

  // ── BUDGET ──
  let budgetTier: BudgetTier;
  let estimatedMonthlyBudgetCents: number;

  // Budget estimé : basé sur le revenu mensuel et le plan actuel
  const monthlyRevenue = revenueLastThirtyDays;
  const planCost = currentPlan?.priceCents ?? 0;

  if (monthlyRevenue >= 50000 || planCost >= 5000) {
    budgetTier = "PREMIUM";
    estimatedMonthlyBudgetCents = 10000; // $100
  } else if (monthlyRevenue >= 20000 || planCost >= 3000) {
    budgetTier = "HIGH";
    estimatedMonthlyBudgetCents = 5000; // $50
  } else if (monthlyRevenue >= 5000 || planCost >= 1000) {
    budgetTier = "MEDIUM";
    estimatedMonthlyBudgetCents = 1500; // $15
  } else if (monthlyRevenue >= 1000 || planCost > 0) {
    budgetTier = "LOW";
    estimatedMonthlyBudgetCents = 500; // $5
  } else {
    budgetTier = "ZERO";
    estimatedMonthlyBudgetCents = 0;
  }

  return {
    userId,
    score,
    lifecycle,
    budgetTier,
    estimatedMonthlyBudgetCents,
    accountAgeDays,
    isBusiness,
    currentPlan,
    activeAddons,
    hasBoostAddon,
    activeBoostedListings,
    totalListings,
    completedSales,
    revenueLastThirtyDays,
    negotiationCount: negoTotal,
    conversionRate,
    avgOrderValueCents,
    previousRecommendations,
    acceptedRecommendations,
    engagementRate,
    topCategory,
    topCity,
    hasStagnantListings: stagnant.length > 0,
    stagnantCount: stagnant.length,
  };
}

// ═══════════════════════════════════════════════════════
// Smart Offer Generation — recommande la bonne offre
// ═══════════════════════════════════════════════════════

type EventContext = {
  event: "LISTING_PUBLISHED" | "SALE_COMPLETED" | "SHOP_CREATED" | "STAGNATION_CHECK" | "PERIODIC";
  listingId?: string;
  listingTitle?: string;
  listingCategory?: string;
};

/**
 * Génère des recommandations intelligentes basées sur le profil vendeur
 * et l'événement déclencheur. Comprend les différences entre :
 * - Abonnement (engagement long terme, accès features)
 * - Boost (coup de pouce court terme, visibilité immédiate)
 * - Publicité (campagne ciblée avec budget maîtrisé)
 * - Add-on (extension de fonctionnalité)
 * - Upgrade (montée en gamme)
 *
 * Toute activation passe par PayPal ou validation admin.
 */
export async function generateSmartOffers(
  profile: SellerProfile,
  ctx: EventContext
): Promise<SmartOffer[]> {
  const offers: SmartOffer[] = [];
  const { lifecycle, budgetTier, currentPlan, isBusiness } = profile;

  // ── 1. TRIAL / PREMIER ABONNEMENT ──
  // Pour les vendeurs sans plan payant
  if (!currentPlan || currentPlan.code === "FREE" || currentPlan.code === "STARTER") {
    const trialOffer = buildSubscriptionOffer(profile);
    if (trialOffer) offers.push(trialOffer);
  }

  // ── 2. UPGRADE ──
  // Pour les vendeurs qui ont déjà un plan mais qui grandissent
  if (currentPlan && lifecycle !== "NEW") {
    const upgradeOffer = buildUpgradeOffer(profile);
    if (upgradeOffer) offers.push(upgradeOffer);
  }

  // ── 3. ADD-ON ──
  // Suggérer des add-ons pertinents que l'utilisateur n'a pas encore
  const addonOffers = buildAddonOffers(profile);
  offers.push(...addonOffers);

  // ── 4. BOOST (court terme) ──
  // Seulement si le vendeur a l'add-on ou peut l'obtenir
  if (ctx.event === "LISTING_PUBLISHED" || ctx.event === "STAGNATION_CHECK") {
    const boostOffer = await buildBoostOffer(profile, ctx);
    if (boostOffer) offers.push(boostOffer);
  }

  // ── 5. CAMPAGNE PUB ──
  // Pour les vendeurs établis avec du budget
  if (lifecycle !== "NEW" && budgetTier !== "ZERO") {
    const adOffer = await buildAdCampaignOffer(profile, ctx);
    if (adOffer) offers.push(adOffer);
  }

  // Tri par priorité décroissante + limite
  return offers
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3); // max 3 offres par cycle
}

// ═══════════════════════════════════════════════════════
// Builders — chaque type d'offre
// ═══════════════════════════════════════════════════════

function buildSubscriptionOffer(profile: SellerProfile): SmartOffer | null {
  const { lifecycle, budgetTier, isBusiness, completedSales, totalListings } = profile;

  // Pas de plan ou plan gratuit → proposer un abonnement adapté
  let suggestedPlanCode: string;
  let rationale: string;

  if (isBusiness) {
    if (lifecycle === "NEW" || lifecycle === "GROWING") {
      suggestedPlanCode = "STARTER";
      rationale = "Le forfait Starter donne une boutique professionnelle et de la visibilité de base.";
    } else {
      suggestedPlanCode = "BUSINESS";
      rationale = "Votre activité grandit — le forfait Business inclut l'IA marchand et des analyses de marché.";
    }
  } else {
    if (budgetTier === "ZERO" && completedSales < 3) {
      // Trop tôt pour un abonnement payant → essai gratuit
      return {
        type: "TRIAL",
        priority: 8,
        title: "🎁 Essayez gratuitement pendant 15 jours",
        message: `Vous avez ${totalListings} article${totalListings > 1 ? "s" : ""} actif${totalListings > 1 ? "s" : ""}. `
          + "Testez les outils Pro sans frais : visibilité boostée, analyses marché, et recommandations prix. "
          + "Aucun paiement requis pour l'essai.",
        triggerType: "TRIAL_SUGGEST",
        actionType: "ACTIVATE_TRIAL",
        actionTarget: offerCta("BOOST"),
        actionData: {
          suggestedPlan: "BOOST",
          reason: "Début d'activité — essai gratuit recommandé",
          paymentNote: "L'essai est gratuit. Après 15 jours, l'abonnement nécessite un paiement via PayPal.",
        },
        expiresInHours: 168,
        engineKey: "ads",
      };
    }

    if (lifecycle === "NEW" || budgetTier === "LOW") {
      suggestedPlanCode = "BOOST";
      rationale = "Le forfait Boost (6$/mois) améliore votre visibilité et permet de booster vos articles.";
    } else if (lifecycle === "GROWING") {
      suggestedPlanCode = "AUTO";
      rationale = "Le forfait Auto (12$/mois) ajoute la vente automatique et les réponses IA — idéal pour gagner du temps.";
    } else {
      suggestedPlanCode = "PRO_VENDOR";
      rationale = "Le forfait Pro Vendeur (20$/mois) débloque les analyses de marché et l'automatisation complète.";
    }
  }

  const plan = getPlanByCode(suggestedPlanCode);
  if (!plan) return null;

  return {
    type: "SUBSCRIPTION",
    priority: lifecycle === "GROWING" ? 8 : 7,
    title: `📦 Passez au forfait ${plan.name}`,
    message: `${rationale} `
      + `Avec ${completedSales} vente${completedSales > 1 ? "s" : ""} et ${totalListings} article${totalListings > 1 ? "s" : ""}, `
      + `c'est le moment d'investir dans votre croissance. `
      + `Paiement sécurisé via PayPal (${(plan.monthlyPriceUsdCents / 100).toFixed(0)}$/mois).`,
    triggerType: "SUBSCRIPTION_SUGGEST",
    actionType: "SUBSCRIBE",
    actionTarget: offerCta(suggestedPlanCode as OfferCode, isBusiness ? "business" : "users"),
    actionData: {
      suggestedPlan: suggestedPlanCode,
      priceCents: plan.monthlyPriceUsdCents,
      features: plan.features.slice(0, 3),
      paymentMethod: "PayPal uniquement",
    },
    expiresInHours: 336, // 14 jours
    engineKey: "ads",
  };
}

function buildUpgradeOffer(profile: SellerProfile): SmartOffer | null {
  const { currentPlan, isBusiness, lifecycle, completedSales, revenueLastThirtyDays, budgetTier } = profile;
  if (!currentPlan) return null;

  const nextPlan = getNextPlan(currentPlan.code, isBusiness);
  if (!nextPlan) return null; // déjà au max

  // Conditions pour recommander un upgrade
  const shouldUpgrade =
    (lifecycle === "ESTABLISHED" || lifecycle === "POWER") ||
    (completedSales >= 10) ||
    (revenueLastThirtyDays >= currentPlan.priceCents * 5); // revenu 5× le coût du plan

  if (!shouldUpgrade) return null;

  // Vérifier que le budget permet l'upgrade
  if (budgetTier === "ZERO" || budgetTier === "LOW") {
    if (nextPlan.priceCents > 1500) return null; // ne pas proposer un plan cher à un petit budget
  }

  const monthlyCostDiff = nextPlan.priceCents - currentPlan.priceCents;
  const roi = revenueLastThirtyDays > 0
    ? `Votre revenu mensuel (${(revenueLastThirtyDays / 100).toFixed(0)}$) dépasse largement le coût supplémentaire de ${(monthlyCostDiff / 100).toFixed(0)}$/mois.`
    : `L'investissement de ${(monthlyCostDiff / 100).toFixed(0)}$/mois en plus vous débloque des outils puissants.`;

  return {
    type: "UPGRADE",
    priority: 7,
    title: `⬆️ Passer à ${nextPlan.name}`,
    message: `Votre plan ${currentPlan.name} vous a bien servi. ${roi} `
      + `Le forfait ${nextPlan.name} (${(nextPlan.priceCents / 100).toFixed(0)}$/mois) `
      + `vous donne accès à plus d'outils pour accélérer. Paiement via PayPal.`,
    triggerType: "UPGRADE_SUGGEST",
    actionType: "UPGRADE_PLAN",
    actionTarget: offerCta(nextPlan.code as OfferCode, isBusiness ? "business" : "users"),
    actionData: {
      currentPlan: currentPlan.code,
      suggestedPlan: nextPlan.code,
      monthlyDiffCents: monthlyCostDiff,
      paymentMethod: "PayPal uniquement",
    },
    expiresInHours: 336,
    engineKey: "ads",
  };
}

function buildAddonOffers(profile: SellerProfile): SmartOffer[] {
  const { activeAddons, lifecycle, budgetTier, completedSales, totalListings, hasStagnantListings, isBusiness, negotiationCount, conversionRate } = profile;
  const offers: SmartOffer[] = [];

  if (budgetTier === "ZERO" && lifecycle === "NEW") return []; // trop tôt

  // ── IA Marchand (3$/mois) — aide à la négociation ──
  if (!activeAddons.includes("IA_MERCHANT") && negotiationCount >= 3 && conversionRate < 40) {
    offers.push({
      type: "ADDON",
      priority: 6,
      title: "🤖 Ajoutez l'IA Marchand",
      message: `Vous avez ${negotiationCount} négociations avec un taux de conversion de ${conversionRate}%. `
        + "L'IA Marchand vous aide à négocier : suggestion de prix, contre-offres automatiques. "
        + "Seulement 3$/mois via PayPal.",
      triggerType: "ADDON_SUGGEST",
      actionType: "ADD_ADDON",
      actionTarget: offerCta("IA_MERCHANT"),
      actionData: {
        addonCode: "IA_MERCHANT",
        priceCents: 300,
        reason: "conversion_negotiation",
        paymentMethod: "PayPal uniquement",
      },
      expiresInHours: 168,
      engineKey: "ads",
    });
  }

  // ── IA Commande (7$/mois) — vente automatique ──
  if (!activeAddons.includes("IA_ORDER") && completedSales >= 5) {
    offers.push({
      type: "ADDON",
      priority: lifecycle === "ESTABLISHED" ? 7 : 5,
      title: "⚡ Automatisez vos ventes",
      message: `${completedSales} ventes ce mois ! L'IA Commande gère vos commandes, `
        + "réponses automatiques et suivi livraison. Vous vendez pendant que l'IA travaille. "
        + "7$/mois via PayPal.",
      triggerType: "ADDON_SUGGEST",
      actionType: "ADD_ADDON",
      actionTarget: offerCta("IA_ORDER"),
      actionData: {
        addonCode: "IA_ORDER",
        priceCents: 700,
        reason: "sales_volume",
        paymentMethod: "PayPal uniquement",
      },
      expiresInHours: 168,
      engineKey: "ads",
    });
  }

  // ── Boost Visibilité — requis pour booster des articles ──
  if (!activeAddons.includes("BOOST_VISIBILITY") && totalListings >= 3 && hasStagnantListings) {
    offers.push({
      type: "ADDON",
      priority: 6,
      title: "🚀 Débloquez le Boost Visibilité",
      message: "Certains de vos articles manquent de visibilité. L'add-on Boost Visibilité "
        + "vous permet de mettre en avant vos articles et votre profil/boutique. "
        + "À partir de 1$/jour via PayPal.",
      triggerType: "ADDON_SUGGEST",
      actionType: "ADD_ADDON",
      actionTarget: offerCta("BOOST_VISIBILITY"),
      actionData: {
        addonCode: "BOOST_VISIBILITY",
        priceLabel: "1$/24h · 5$/7j · 15$/30j",
        reason: "stagnant_listings",
        paymentMethod: "PayPal uniquement",
      },
      expiresInHours: 168,
      engineKey: "ads",
    });
  }

  // ── Pack Pub — pour campagnes ciblées ──
  if (!activeAddons.includes("ADS_PACK") && lifecycle !== "NEW" && budgetTier !== "ZERO") {
    // Ne proposer que si l'utilisateur n'a pas de campagne active récente
    offers.push({
      type: "ADDON",
      priority: 5,
      title: "📢 Pack Publicité",
      message: "Diffusez vos annonces sur toute la marketplace avec un budget maîtrisé. "
        + `${isBusiness ? "Idéal pour votre boutique" : "Idéal pour vos articles"}. `
        + "À partir de 5$ pour 3 pubs via PayPal.",
      triggerType: "ADDON_SUGGEST",
      actionType: "ADD_ADDON",
      actionTarget: offerCta("ADS_PACK"),
      actionData: {
        addonCode: "ADS_PACK",
        priceLabel: "3 pubs 5$ · 7 pubs 10$ · 10 pubs 15$",
        reason: "growth_opportunity",
        paymentMethod: "PayPal uniquement",
      },
      expiresInHours: 336,
      engineKey: "ads",
    });
  }

  return offers;
}

async function buildBoostOffer(
  profile: SellerProfile,
  ctx: EventContext
): Promise<SmartOffer | null> {
  const { hasBoostAddon, lifecycle, budgetTier, activeBoostedListings, stagnantCount, totalListings } = profile;

  // Si l'utilisateur n'a pas l'add-on Boost, ne pas proposer de boost direct
  // → l'add-on sera proposé par buildAddonOffers
  if (!hasBoostAddon) return null;

  // Boost article spécifique (après publication)
  if (ctx.event === "LISTING_PUBLISHED" && ctx.listingId) {
    // Analyser le marché pour justifier le boost
    let marketInfo = "";
    if (ctx.listingCategory) {
      try {
        const median = await getMarketMedian(ctx.listingCategory, profile.topCity ?? "");
        if (median && median.sampleSize >= 5) {
          marketInfo = ` Il y a ${median.sampleSize} annonces concurrentes dans cette catégorie.`;
        }
      } catch { /* pas de data marché */ }
    }

    // Adapter la durée au budget
    let suggestedDays = 7;
    if (budgetTier === "LOW") suggestedDays = 3;
    else if (budgetTier === "PREMIUM") suggestedDays = 14;

    return {
      type: "BOOST",
      priority: 6,
      title: "🔥 Booster votre article",
      message: `Votre article « ${ctx.listingTitle ?? "nouveau"} » est en ligne !${marketInfo} `
        + `Un boost de ${suggestedDays} jours augmente la visibilité de 2 à 5×. `
        + "Vous avez l'add-on Boost Visibilité actif — lancez le boost directement.",
      triggerType: "BOOST_SUGGEST",
      actionType: "BOOST_ARTICLE",
      actionTarget: ctx.listingId,
      actionData: {
        listingId: ctx.listingId,
        suggestedDays,
        isAddonActive: true,
        costNote: "Inclus dans votre add-on Boost Visibilité",
      },
      expiresInHours: 72,
      engineKey: "ads",
    };
  }

  // Boost stagnation
  if (ctx.event === "STAGNATION_CHECK" && stagnantCount > 0) {
    const suggestedDays = budgetTier === "LOW" ? 3 : 7;
    return {
      type: "BOOST",
      priority: 7,
      title: `📊 ${stagnantCount} article${stagnantCount > 1 ? "s" : ""} en perte de vitesse`,
      message: `${stagnantCount} de vos ${totalListings} articles n'ont reçu presque aucune attention depuis 7 jours. `
        + `Un boost de ${suggestedDays} jours peut relancer la visibilité. `
        + `Vous avez ${activeBoostedListings} article${activeBoostedListings > 1 ? "s" : ""} déjà boosté${activeBoostedListings > 1 ? "s" : ""}.`,
      triggerType: "STAGNATION",
      actionType: "BOOST_ARTICLE",
      actionTarget: "/dashboard",
      actionData: {
        stagnantCount,
        suggestedDays,
        isAddonActive: true,
      },
      expiresInHours: 168,
      engineKey: "ads",
    };
  }

  return null;
}

async function buildAdCampaignOffer(
  profile: SellerProfile,
  ctx: EventContext
): Promise<SmartOffer | null> {
  const { lifecycle, budgetTier, estimatedMonthlyBudgetCents, isBusiness, completedSales, topCategory, topCity, totalListings } = profile;

  // Pas de campagne pour les débutants sans budget
  if (lifecycle === "NEW" || budgetTier === "ZERO") return null;

  // Calibrer le budget de la campagne selon le profil
  let campaignBudgetCents: number;
  let campaignDays: number;
  let campaignType: string;

  if (budgetTier === "PREMIUM") {
    campaignBudgetCents = 5000; // $50
    campaignDays = 14;
    campaignType = "premium";
  } else if (budgetTier === "HIGH") {
    campaignBudgetCents = 2500; // $25
    campaignDays = 10;
    campaignType = "standard";
  } else if (budgetTier === "MEDIUM") {
    campaignBudgetCents = 1000; // $10
    campaignDays = 7;
    campaignType = "basic";
  } else {
    campaignBudgetCents = 500; // $5
    campaignDays = 7;
    campaignType = "mini";
  }

  // Ne pas dépasser le budget estimé
  campaignBudgetCents = Math.min(campaignBudgetCents, estimatedMonthlyBudgetCents);
  if (campaignBudgetCents < 500) return null; // minimum 5$

  // Pages de diffusion
  const suggestedPages = isBusiness
    ? ["sokin-market", "sokin", "home"]
    : ["sokin", "explorer", "home"];

  // Timing optimal
  const dayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const bestDay = await findBestDay();

  const targeting = topCategory
    ? `ciblée sur ${topCategory}${topCity ? ` à ${topCity}` : ""}`
    : "sur la marketplace";

  return {
    type: "AD_CAMPAIGN",
    priority: lifecycle === "POWER" ? 7 : 5,
    title: "📣 Lancez une campagne publicitaire",
    message: `${isBusiness ? "Votre boutique" : "Vos articles"} mérite${isBusiness ? "" : "nt"} plus de visibilité ! `
      + `Campagne ${campaignType} ${targeting} : `
      + `${(campaignBudgetCents / 100).toFixed(0)}$ pour ${campaignDays} jours. `
      + `${completedSales} ventes récentes montrent un bon potentiel. `
      + `Meilleur jour pour lancer : ${dayNames[bestDay]}. Paiement via PayPal.`,
    triggerType: "AD_CAMPAIGN_SUGGEST",
    actionType: "CREATE_AD",
    actionTarget: isBusiness ? "/dashboard/ads" : "/forfaits",
    actionData: {
      campaignType,
      budgetCents: campaignBudgetCents,
      durationDays: campaignDays,
      suggestedPages,
      targetCategory: topCategory,
      targetCity: topCity,
      bestDayOfWeek: bestDay,
      paymentMethod: "PayPal uniquement",
    },
    expiresInHours: 336,
    engineKey: "ads",
  };
}

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

async function findBestDay(): Promise<number> {
  const recentOrders = await prisma.order.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    select: { createdAt: true },
    take: 300,
  });
  const dayCounts = new Array(7).fill(0);
  for (const o of recentOrders) {
    dayCounts[new Date(o.createdAt).getDay()]++;
  }
  return dayCounts.indexOf(Math.max(...dayCounts));
}
