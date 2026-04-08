/**
 * POST-SALE ADVISOR — Conseiller IA post-vente
 *
 * Analyse la vente qui vient d'être confirmée et génère des
 * recommandations contextualisées selon le scénario :
 *
 *   PREMIÈRE VENTE      → félicitations + plan adapté + analytique
 *   VENTES RÉPÉTÉES     → boost catalogue + campagne pub
 *   MÊME CATÉGORIE      → spécialisation + boost similar
 *   VENTE APRÈS PROMO   → stratégie promo intelligente
 *   VENTE APRÈS BOOST   → ROI du boost + renouvellement
 *
 * Recommandations possibles :
 *   BOOST           — booster des articles similaires
 *   ADS_CAMPAIGN    — lancer/relancer une campagne pub
 *   PLAN            — forfait supérieur
 *   ANALYTICS       — Kin-Sell Analytique pour comprendre les succès
 *   STRATEGY        — stratégie promo/boost/prix
 *   REPLICATE       — répéter ce qui marche
 *
 * Chaque recommandation explique POURQUOI elle est pertinente.
 * Ton premium, utile, orienté résultats — pas générique.
 */

import { prisma } from "../../shared/db/prisma.js";
import {
  computeSellerProfile,
  type SellerProfile,
} from "./ai-ads-engine.service.js";
import { PLAN_CATALOG } from "../billing/billing.catalog.js";
import { OFFER_MAP, type OfferCode } from "./ads-knowledge-base.js";

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export type SaleAdviceCategory =
  | "BOOST"
  | "ADS_CAMPAIGN"
  | "PLAN"
  | "ANALYTICS"
  | "STRATEGY"
  | "REPLICATE";

export interface PostSaleAdvice {
  category: SaleAdviceCategory;
  priority: number;          // 1-10
  icon: string;
  title: string;
  message: string;
  rationale: string;
  ctaLabel: string;
  ctaTarget: string;
  ctaAction?: string;        // "BOOST" | "NAVIGATE"
  metric?: Record<string, number | string>;
}

export type SaleScenario =
  | "FIRST_SALE"
  | "REPEAT_SALE"
  | "CATEGORY_STREAK"
  | "SALE_AFTER_PROMO"
  | "SALE_AFTER_BOOST"
  | "HIGH_VALUE_SALE"
  | "STANDARD";

export interface PostSaleReport {
  scenario: SaleScenario;
  orderId: string;
  orderTotal: string;          // formatted
  itemTitle: string;
  itemCategory: string;
  saleNumber: number;          // nème vente totale
  congratsMessage: string;
  advice: PostSaleAdvice[];
  sellerLifecycle: string;
}

// ═══════════════════════════════════════════════════════
// Main entry
// ═══════════════════════════════════════════════════════

export async function getPostSaleAdvice(
  userId: string,
  orderId: string
): Promise<PostSaleReport> {
  const profile = await computeSellerProfile(userId);
  const advice: PostSaleAdvice[] = [];

  // ── Récupérer la commande et son contexte ──
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      totalUsdCents: true,
      createdAt: true,
      items: {
        select: {
          listingId: true,
          title: true,
          category: true,
          quantity: true,
          unitPriceUsdCents: true,
        },
      },
    },
  });

  if (!order) {
    return fallbackReport(orderId, profile);
  }

  const mainItem = order.items[0];
  const itemTitle = mainItem?.title ?? "Article vendu";
  const itemCategory = mainItem?.category ?? "Divers";
  const orderTotal = `${(order.totalUsdCents / 100).toFixed(2)}$`;

  // ── Analyser l'historique des ventes ──
  const saleCtx = await analyzeSaleContext(userId, order, profile);

  // ── Déterminer le scénario ──
  const scenario = determineSaleScenario(saleCtx);

  // ── Message de félicitations contextuel ──
  const congratsMessage = buildCongratsMessage(scenario, saleCtx, itemTitle, orderTotal);

  // ── Recommandations par scénario ──

  // 1. BOOST articles similaires
  const boostAdvice = buildBoostSimilarAdvice(profile, saleCtx, scenario);
  if (boostAdvice) advice.push(boostAdvice);

  // 2. Campagne publicitaire
  const adsAdvice = buildAdsCampaignAdvice(profile, saleCtx, scenario);
  if (adsAdvice) advice.push(adsAdvice);

  // 3. Forfait supérieur
  const planAdvice = buildPlanUpgradeAdvice(profile, saleCtx, scenario);
  if (planAdvice) advice.push(planAdvice);

  // 4. Kin-Sell Analytique
  const analyticsAdvice = buildAnalyticsAdvice(profile, saleCtx, scenario);
  if (analyticsAdvice) advice.push(analyticsAdvice);

  // 5. Stratégie de promotion
  const strategyAdvice = buildStrategyAdvice(profile, saleCtx, scenario);
  if (strategyAdvice) advice.push(strategyAdvice);

  // 6. Répéter ce qui marche
  const replicateAdvice = buildReplicateAdvice(profile, saleCtx, scenario);
  if (replicateAdvice) advice.push(replicateAdvice);

  // Trier par priorité et limiter à 4
  advice.sort((a, b) => b.priority - a.priority);

  return {
    scenario,
    orderId,
    orderTotal,
    itemTitle,
    itemCategory,
    saleNumber: saleCtx.totalSales,
    congratsMessage,
    advice: advice.slice(0, 4),
    sellerLifecycle: profile?.lifecycle ?? "NEW",
  };
}

// ═══════════════════════════════════════════════════════
// Contexte de vente
// ═══════════════════════════════════════════════════════

interface SaleContext {
  totalSales: number;
  salesLast30d: number;
  salesLast7d: number;
  totalRevenueCents: number;
  revenueLast30dCents: number;
  isFirstSale: boolean;
  categorySales: number;       // ventes dans la même catégorie
  categoryName: string;
  similarActiveListings: number;
  wasBoosted: boolean;         // cet article était-il boosté ?
  wasPromo: boolean;           // cet article avait-il une promo ?
  avgOrderValueCents: number;
  orderValueCents: number;
  isHighValue: boolean;        // au-dessus de la moyenne
  recentBoostCount: number;    // boosts dans les 30 derniers jours
  recentAdCount: number;       // campagnes pub récentes
  topCategory: string | null;
  isBusiness: boolean;
}

async function analyzeSaleContext(
  userId: string,
  order: {
    id: string;
    totalUsdCents: number;
    items: Array<{ listingId: string | null; category: string; title: string }>;
  },
  profile: SellerProfile | null
): Promise<SaleContext> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const category = order.items[0]?.category ?? "";

  // Ventes totales et récentes
  const [totalSales, salesLast30d, salesLast7d] = await Promise.all([
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED" } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: thirtyDaysAgo } } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: sevenDaysAgo } } }),
  ]);

  // Revenus
  const revenueOrders = await prisma.order.findMany({
    where: { sellerUserId: userId, status: "DELIVERED" },
    select: { totalUsdCents: true, createdAt: true },
  });
  const totalRevenueCents = revenueOrders.reduce((s, o) => s + (o.totalUsdCents ?? 0), 0);
  const revenueLast30dCents = revenueOrders
    .filter((o) => o.createdAt >= thirtyDaysAgo)
    .reduce((s, o) => s + (o.totalUsdCents ?? 0), 0);
  const avgOrderValueCents = totalSales > 0 ? Math.round(totalRevenueCents / totalSales) : 0;

  // Ventes dans la même catégorie
  const categoryOrders = await prisma.order.count({
    where: {
      sellerUserId: userId,
      status: "DELIVERED",
      items: { some: { category } },
    },
  });

  // Articles similaires encore actifs
  const similarActiveListings = await prisma.listing.count({
    where: {
      ownerUserId: userId,
      category,
      status: "ACTIVE",
      isPublished: true,
    },
  });

  // L'article vendu était-il boosté ou en promo ?
  const listingId = order.items[0]?.listingId;
  let wasBoosted = false;
  let wasPromo = false;

  if (listingId) {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        isBoosted: true,
        promoActive: true,
      },
    });
    if (listing) {
      wasBoosted = listing.isBoosted;
      wasPromo = listing.promoActive;
    }
  }

  // Boosts et pubs récents
  const recentBoostCount = await prisma.listing.count({
    where: {
      ownerUserId: userId,
      isBoosted: true,
      boostExpiresAt: { gt: new Date() },
    },
  });

  // Catégorie dominante
  const catStats = await prisma.listing.groupBy({
    by: ["category"],
    where: { ownerUserId: userId, status: "ACTIVE" },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });

  return {
    totalSales,
    salesLast30d,
    salesLast7d,
    totalRevenueCents,
    revenueLast30dCents,
    isFirstSale: totalSales <= 1,
    categorySales: categoryOrders,
    categoryName: category,
    similarActiveListings,
    wasBoosted,
    wasPromo,
    avgOrderValueCents,
    orderValueCents: order.totalUsdCents,
    isHighValue: order.totalUsdCents > avgOrderValueCents * 1.5,
    recentBoostCount,
    recentAdCount: 0, // simplifié
    topCategory: catStats[0]?.category ?? null,
    isBusiness: profile?.isBusiness ?? false,
  };
}

// ═══════════════════════════════════════════════════════
// Scénario
// ═══════════════════════════════════════════════════════

function determineSaleScenario(ctx: SaleContext): SaleScenario {
  if (ctx.isFirstSale) return "FIRST_SALE";
  if (ctx.wasBoosted) return "SALE_AFTER_BOOST";
  if (ctx.wasPromo) return "SALE_AFTER_PROMO";
  if (ctx.isHighValue) return "HIGH_VALUE_SALE";
  if (ctx.categorySales >= 3 && ctx.categoryName === ctx.topCategory) return "CATEGORY_STREAK";
  if (ctx.salesLast7d >= 3) return "REPEAT_SALE";
  return "STANDARD";
}

// ═══════════════════════════════════════════════════════
// Messages de félicitations
// ═══════════════════════════════════════════════════════

function buildCongratsMessage(
  scenario: SaleScenario,
  ctx: SaleContext,
  itemTitle: string,
  orderTotal: string
): string {
  switch (scenario) {
    case "FIRST_SALE":
      return `🎉 Félicitations pour votre toute première vente sur Kin-Sell ! « ${itemTitle} » vendu à ${orderTotal}. C'est le début d'une belle aventure — voici comment accélérer.`;
    case "REPEAT_SALE":
      return `🔥 ${ctx.salesLast7d} ventes cette semaine ! « ${itemTitle} » vendu à ${orderTotal}. Votre activité prend de l'élan — voici comment capitaliser.`;
    case "CATEGORY_STREAK":
      return `⭐ ${ctx.categorySales} ventes en ${ctx.categoryName} ! « ${itemTitle} » vendu à ${orderTotal}. Vous devenez un expert de cette catégorie.`;
    case "SALE_AFTER_PROMO":
      return `📣 Votre promotion a fonctionné ! « ${itemTitle} » vendu à ${orderTotal}. Voici comment optimiser vos prochaines promos.`;
    case "SALE_AFTER_BOOST":
      return `🚀 Le boost a porté ses fruits ! « ${itemTitle} » vendu à ${orderTotal}. L'investissement en visibilité a payé.`;
    case "HIGH_VALUE_SALE":
      return `💎 Belle vente de ${orderTotal} pour « ${itemTitle} » ! C'est au-dessus de votre moyenne — voici comment viser encore plus haut.`;
    default:
      return `✅ Vente confirmée ! « ${itemTitle} » vendu à ${orderTotal}. Vente n°${ctx.totalSales} — voici comment aller plus loin.`;
  }
}

// ═══════════════════════════════════════════════════════
// Builders de recommandations
// ═══════════════════════════════════════════════════════

function buildBoostSimilarAdvice(
  profile: SellerProfile | null,
  ctx: SaleContext,
  scenario: SaleScenario
): PostSaleAdvice | null {
  if (!profile || ctx.similarActiveListings === 0) return null;

  const hasBoost = profile.hasBoostAddon;

  if (scenario === "CATEGORY_STREAK" || scenario === "SALE_AFTER_BOOST") {
    return {
      category: "BOOST",
      priority: scenario === "SALE_AFTER_BOOST" ? 9 : 8,
      icon: "🚀",
      title: ctx.similarActiveListings > 1
        ? `Booster vos ${ctx.similarActiveListings} articles en ${ctx.categoryName}`
        : "Booster votre article similaire",
      message: scenario === "SALE_AFTER_BOOST"
        ? `Le boost a directement contribué à cette vente. Vous avez ${ctx.similarActiveListings} autre${ctx.similarActiveListings > 1 ? "s" : ""} article${ctx.similarActiveListings > 1 ? "s" : ""} en ${ctx.categoryName} qui ${ctx.similarActiveListings > 1 ? "peuvent" : "peut"} bénéficier du même traitement.`
        : `${ctx.categorySales} ventes prouvent que ${ctx.categoryName} fonctionne pour vous. Boostez vos ${ctx.similarActiveListings} articles restants pour accélérer.`,
      rationale: scenario === "SALE_AFTER_BOOST"
        ? "Le retour sur investissement du boost est prouvé par cette vente. Reproduisez la même stratégie."
        : "Les acheteurs qui cherchent dans cette catégorie trouveront vos articles en priorité grâce au boost.",
      ctaLabel: hasBoost ? "Booster maintenant" : "Découvrir le Boost",
      ctaTarget: hasBoost ? "/dashboard" : OFFER_MAP.get("BOOST_VISIBILITY")!.ctaPath,
      ctaAction: hasBoost ? "BOOST" : "NAVIGATE",
      metric: { similarArticles: ctx.similarActiveListings, categorySales: ctx.categorySales },
    };
  }

  if (ctx.similarActiveListings >= 2) {
    return {
      category: "BOOST",
      priority: 6,
      icon: "🚀",
      title: `${ctx.similarActiveListings} articles similaires à booster`,
      message: `Vous avez vendu en ${ctx.categoryName}. ${ctx.similarActiveListings} de vos articles actifs sont dans la même catégorie — un boost les mettrait devant les acheteurs intéressés.`,
      rationale: "Cette vente prouve la demande pour cette catégorie. Augmenter la visibilité de vos articles similaires multiplie vos chances.",
      ctaLabel: hasBoost ? "Booster" : "Découvrir le Boost",
      ctaTarget: hasBoost ? "/dashboard" : OFFER_MAP.get("BOOST_VISIBILITY")!.ctaPath,
      ctaAction: hasBoost ? "BOOST" : "NAVIGATE",
      metric: { similarArticles: ctx.similarActiveListings },
    };
  }

  return null;
}

function buildAdsCampaignAdvice(
  profile: SellerProfile | null,
  ctx: SaleContext,
  scenario: SaleScenario
): PostSaleAdvice | null {
  if (!profile) return null;
  const { lifecycle, budgetTier } = profile;

  // Pas de pub suggérée pour les tout nouveaux
  if (lifecycle === "NEW" && scenario !== "FIRST_SALE") return null;
  if (budgetTier === "ZERO" && ctx.totalSales < 3) return null;

  if (scenario === "REPEAT_SALE" && ctx.salesLast7d >= 3) {
    return {
      category: "ADS_CAMPAIGN",
      priority: 7,
      icon: "📢",
      title: "Lancez une campagne ciblée",
      message: `${ctx.salesLast7d} ventes cette semaine ! Le moment est idéal pour une campagne pub. Vos articles apparaîtront comme annonces sponsorisées auprès d'acheteurs ciblés sur toute la marketplace.`,
      rationale: `Votre rythme de ${ctx.salesLast7d} ventes/semaine montre une demande forte. Une campagne pub amplifie cette dynamique en touchant de nouveaux acheteurs.`,
      ctaLabel: "Créer une campagne",
      ctaTarget: OFFER_MAP.get("ADS_PACK")!.ctaPath,
      ctaAction: "NAVIGATE",
      metric: { salesThisWeek: ctx.salesLast7d, revenue7d: `${(ctx.revenueLast30dCents / 100).toFixed(0)}$` },
    };
  }

  if (scenario === "HIGH_VALUE_SALE") {
    return {
      category: "ADS_CAMPAIGN",
      priority: 6,
      icon: "📢",
      title: "Campagne premium pour vos articles haut de gamme",
      message: `Cette vente à ${(ctx.orderValueCents / 100).toFixed(2)}$ est ${Math.round(((ctx.orderValueCents - ctx.avgOrderValueCents) / ctx.avgOrderValueCents) * 100)}% au-dessus de votre moyenne. Visez ce segment avec une campagne pub ciblée.`,
      rationale: "Les articles haut de gamme convertissent mieux avec de la pub ciblée — les acheteurs qui ont le budget vous trouvent directement.",
      ctaLabel: "Voir les options pub",
      ctaTarget: OFFER_MAP.get("ADS_PACK")!.ctaPath,
      ctaAction: "NAVIGATE",
      metric: { orderValue: `${(ctx.orderValueCents / 100).toFixed(2)}$`, avg: `${(ctx.avgOrderValueCents / 100).toFixed(2)}$` },
    };
  }

  if (ctx.salesLast30d >= 5 && ctx.recentAdCount === 0) {
    return {
      category: "ADS_CAMPAIGN",
      priority: 5,
      icon: "📢",
      title: "Votre première campagne pub",
      message: `${ctx.salesLast30d} ventes ce mois sans aucune pub ! Imaginez les résultats avec une campagne ciblée. Le pack pub démarre à 5$ pour 3 annonces.`,
      rationale: "Vous vendez bien organiquement. La pub ne remplace pas ça — elle amplifie en touchant des acheteurs que la recherche seule ne peut atteindre.",
      ctaLabel: "Découvrir les packs pub",
      ctaTarget: OFFER_MAP.get("ADS_PACK")!.ctaPath,
      ctaAction: "NAVIGATE",
      metric: { salesNoAds: ctx.salesLast30d },
    };
  }

  return null;
}

function buildPlanUpgradeAdvice(
  profile: SellerProfile | null,
  ctx: SaleContext,
  scenario: SaleScenario
): PostSaleAdvice | null {
  if (!profile) return null;
  const { currentPlan, isBusiness, lifecycle } = profile;

  const maxPlan = isBusiness ? "SCALE" : "PRO_VENDOR";
  if (currentPlan?.code === maxPlan) return null;

  // Première vente sans plan → début de parcours
  if (scenario === "FIRST_SALE" && (!currentPlan || currentPlan.code === "FREE")) {
    const suggested = isBusiness ? "STARTER" : "BOOST";
    const plan = PLAN_CATALOG.find((p) => p.code === suggested);
    if (!plan) return null;

    return {
      category: "PLAN",
      priority: 7,
      icon: "📦",
      title: `Passez au ${plan.name} pour accélérer`,
      message: `Première vente réussie ! Le forfait ${plan.name} (${(plan.monthlyPriceUsdCents / 100).toFixed(0)}$/mois) vous donne les outils pour en faire beaucoup d'autres : visibilité boostée, analyses, et plus.`,
      rationale: "Un forfait est un investissement qui se rentabilise vite : avec les bons outils, les vendeurs Kin-Sell multiplient leurs ventes par 3 en moyenne.",
      ctaLabel: "Voir les forfaits",
      ctaTarget: OFFER_MAP.get(suggested as OfferCode)?.ctaPath ?? "/forfaits",
      ctaAction: "NAVIGATE",
      metric: { price: `${(plan.monthlyPriceUsdCents / 100).toFixed(0)}$/mois` },
    };
  }

  // Ventes répétées ou croissance → upgrade justifié
  if ((scenario === "REPEAT_SALE" || scenario === "CATEGORY_STREAK") &&
      (lifecycle === "ESTABLISHED" || lifecycle === "POWER") && currentPlan) {
    const upgradePath = isBusiness
      ? ["STARTER", "BUSINESS", "SCALE"]
      : ["FREE", "BOOST", "AUTO", "PRO_VENDOR"];
    const idx = upgradePath.indexOf(currentPlan.code);
    if (idx < 0 || idx >= upgradePath.length - 1) return null;
    const nextCode = upgradePath[idx + 1];
    const nextPlan = PLAN_CATALOG.find((p) => p.code === nextCode);
    if (!nextPlan) return null;

    // Vérifier que le revenu justifie
    if (ctx.revenueLast30dCents < currentPlan.priceCents * 3) return null;

    return {
      category: "PLAN",
      priority: 6,
      icon: "⬆️",
      title: `Passer à ${nextPlan.name}`,
      message: `${ctx.salesLast30d} ventes et ${(ctx.revenueLast30dCents / 100).toFixed(0)}$ de revenus ce mois. Votre plan ${currentPlan.name} vous a bien servi — ${nextPlan.name} débloque des outils plus puissants pour cette croissance.`,
      rationale: `Votre revenu mensuel (${(ctx.revenueLast30dCents / 100).toFixed(0)}$) dépasse largement le coût du plan. L'upgrade est un investissement rentable.`,
      ctaLabel: "Comparer les forfaits",
      ctaTarget: OFFER_MAP.get(nextCode as OfferCode)?.ctaPath ?? "/forfaits",
      ctaAction: "NAVIGATE",
      metric: { revenue: `${(ctx.revenueLast30dCents / 100).toFixed(0)}$`, sales: ctx.salesLast30d },
    };
  }

  return null;
}

function buildAnalyticsAdvice(
  profile: SellerProfile | null,
  ctx: SaleContext,
  scenario: SaleScenario
): PostSaleAdvice | null {
  if (!profile) return null;

  // Déjà accès analytics
  const analyticsCodes = ["PRO_VENDOR", "BUSINESS", "SCALE"];
  if (profile.currentPlan && analyticsCodes.includes(profile.currentPlan.code)) return null;

  // Seulement proposer si au moins 3 ventes
  if (ctx.totalSales < 3) return null;

  if (scenario === "CATEGORY_STREAK") {
    return {
      category: "ANALYTICS",
      priority: 7,
      icon: "📊",
      title: "Analysez votre succès en " + ctx.categoryName,
      message: `${ctx.categorySales} ventes en ${ctx.categoryName} — qu'est-ce qui fonctionne ? Kin-Sell Analytique vous montre les facteurs de succès : meilleur prix, meilleur moment, meilleures photos.`,
      rationale: "Comprendre pourquoi ça marche permet de reproduire le succès. L'Analytics décompose chaque vente en facteurs exploitables.",
      ctaLabel: "Découvrir Analytique",
      ctaTarget: OFFER_MAP.get("ANALYTICS_MEDIUM")!.ctaPath,
      ctaAction: "NAVIGATE",
      metric: { categorySales: ctx.categorySales, category: ctx.categoryName },
    };
  }

  if (scenario === "REPEAT_SALE" || scenario === "HIGH_VALUE_SALE") {
    return {
      category: "ANALYTICS",
      priority: 5,
      icon: "📊",
      title: "Comprenez vos facteurs de succès",
      message: `${ctx.totalSales} ventes au total, ${(ctx.totalRevenueCents / 100).toFixed(0)}$ de revenus. Avec Kin-Sell Analytique, identifiez les tendances, les meilleurs horaires de publication et les prix optimaux pour votre marché.`,
      rationale: "Les vendeurs qui utilisent Analytique optimisent leur prix et contexte de publication — résultat : +40% de conversion en moyenne.",
      ctaLabel: "Voir Analytique",
      ctaTarget: OFFER_MAP.get("ANALYTICS_MEDIUM")!.ctaPath,
      ctaAction: "NAVIGATE",
      metric: { totalSales: ctx.totalSales, revenue: `${(ctx.totalRevenueCents / 100).toFixed(0)}$` },
    };
  }

  return null;
}

function buildStrategyAdvice(
  profile: SellerProfile | null,
  ctx: SaleContext,
  scenario: SaleScenario
): PostSaleAdvice | null {
  if (!profile) return null;

  if (scenario === "SALE_AFTER_PROMO") {
    return {
      category: "STRATEGY",
      priority: 8,
      icon: "🎯",
      title: "Optimisez votre stratégie promo",
      message: "Votre promotion a généré cette vente ! Pour maximiser l'impact : combinez promo + boost pour 3× plus de visibilité, ciblez les week-ends pour +60% de trafic, et gardez vos remises entre 10-25% pour préserver la marge.",
      rationale: "Les promotions boostées convertissent 2× mieux que les promos seules. L'ajout d'un boost pendant la durée de la promo maximise le retour.",
      ctaLabel: "Créer une promo + boost",
      ctaTarget: "/dashboard",
      ctaAction: "NAVIGATE",
      metric: { wasPromo: "Oui", recommendation: "Promo + Boost" },
    };
  }

  if (scenario === "SALE_AFTER_BOOST") {
    const roi = ctx.orderValueCents > 0 ? `ROI positif : vente de ${(ctx.orderValueCents / 100).toFixed(2)}$` : "";
    return {
      category: "STRATEGY",
      priority: 7,
      icon: "🎯",
      title: "Le boost a fait ses preuves",
      message: `${roi}. Stratégie recommandée : maintenez le boost actif 7 jours minimum, boostez en début de semaine pour capter le pic de trafic, et combinez avec une légère réduction pour accélérer la conversion.`,
      rationale: "Les articles boostés pendant 7+ jours ont un taux de conversion 3× supérieur aux boosts courts. La régularité paie.",
      ctaLabel: "Renouveler le boost",
      ctaTarget: profile.hasBoostAddon ? "/dashboard" : OFFER_MAP.get("BOOST_VISIBILITY")!.ctaPath,
      ctaAction: profile.hasBoostAddon ? "BOOST" : "NAVIGATE",
    };
  }

  return null;
}

function buildReplicateAdvice(
  profile: SellerProfile | null,
  ctx: SaleContext,
  scenario: SaleScenario
): PostSaleAdvice | null {
  if (!profile) return null;

  if (scenario === "FIRST_SALE") {
    return {
      category: "REPLICATE",
      priority: 8,
      icon: "🔄",
      title: "Répétez le succès",
      message: `Première vente en ${ctx.categoryName} ! Pour continuer : publiez 3-5 articles similaires dans la même catégorie, gardez un prix compétitif, ajoutez des photos de qualité. Les vendeurs qui publient régulièrement vendent 4× plus.`,
      rationale: "La première vente valide votre positionnement. Répliquer la même approche (même catégorie, même style de prix) dans les 48h maximise la dynamique.",
      ctaLabel: "Publier un article",
      ctaTarget: "/dashboard",
      ctaAction: "NAVIGATE",
      metric: { category: ctx.categoryName, tip: "3-5 articles similaires" },
    };
  }

  if (scenario === "CATEGORY_STREAK") {
    return {
      category: "REPLICATE",
      priority: 6,
      icon: "🔄",
      title: `Devenez LA référence en ${ctx.categoryName}`,
      message: `${ctx.categorySales} ventes prouvent votre expertise en ${ctx.categoryName}. Avec ${ctx.similarActiveListings} articles actifs, renforcez votre catalogue : les vendeurs spécialisés convertissent 2× mieux que les généralistes.`,
      rationale: `La spécialisation dans ${ctx.categoryName} vous donne un avantage compétitif. Les acheteurs font confiance aux vendeurs experts d'une catégorie.`,
      ctaLabel: "Gérer mon catalogue",
      ctaTarget: "/dashboard",
      ctaAction: "NAVIGATE",
      metric: { categorySales: ctx.categorySales, activeListings: ctx.similarActiveListings },
    };
  }

  if (ctx.salesLast7d >= 2) {
    return {
      category: "REPLICATE",
      priority: 5,
      icon: "🔄",
      title: "Gardez le rythme",
      message: `${ctx.salesLast7d} ventes cette semaine — vous êtes en forme ! Continuez à publier régulièrement, répondez vite aux messages (les vendeurs réactifs convertissent +50%), et gardez vos prix compétitifs.`,
      rationale: "La régularité de publication et la réactivité sont les deux facteurs clés de succès mesurés sur Kin-Sell.",
      ctaLabel: "Publier un article",
      ctaTarget: "/dashboard",
      ctaAction: "NAVIGATE",
      metric: { salesThisWeek: ctx.salesLast7d },
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════
// Fallback
// ═══════════════════════════════════════════════════════

function fallbackReport(orderId: string, profile: SellerProfile | null): PostSaleReport {
  return {
    scenario: "STANDARD",
    orderId,
    orderTotal: "—",
    itemTitle: "Article vendu",
    itemCategory: "Divers",
    saleNumber: profile?.completedSales ?? 0,
    congratsMessage: "✅ Vente confirmée ! Voici quelques conseils pour continuer sur votre lancée.",
    advice: [],
    sellerLifecycle: profile?.lifecycle ?? "NEW",
  };
}
