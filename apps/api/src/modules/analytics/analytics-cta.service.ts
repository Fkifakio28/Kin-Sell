/**
 * ANALYTICS CTA ENGINE — Incitations intelligentes vers Kin-Sell Analytique
 *
 * Génère des CTA contextuels pour faire comprendre la valeur de
 * Kin-Sell Analytique : mieux décider, mieux vendre, mieux piloter.
 *
 * Déclencheurs :
 *   1. MULTI_LISTINGS        — plusieurs annonces actives (≥5)
 *   2. PROMO_ACTIVITY        — plusieurs promotions lancées
 *   3. SALES_HISTORY         — historique de ventes significatif (≥3)
 *   4. PRICE_HESITATION      — modifications de prix fréquentes
 *   5. GROWING_BUSINESS      — activité business croissante
 *   6. CATALOG_DIVERSITY     — forte diversité de catégories (≥3)
 *   7. IRREGULAR_RESULTS     — résultats de vente irréguliers
 *   8. OPTIMIZATION_INTENT   — signaux d'optimisation (boosts, promos, modifications)
 *
 * Valeur communiquée :
 *   - Tendances du marché
 *   - Prix optimal
 *   - Produits les plus performants
 *   - Catégories prometteuses
 *   - Lecture de la performance des promos
 *   - Aide à la décision
 *
 * Tiers :
 *   MEDIUM  — PRO_VENDOR (20$/mois) / BUSINESS (30$/mois)
 *     → Insights de base, position marché, trending, recommandations
 *   PREMIUM — SCALE (50$/mois)
 *     → Funnel conversion, audience, vélocité, prédictions, churn risk
 *
 * Anti-spam : max 2 CTA simultanés, 72h cooldown par trigger
 */

import { prisma } from "../../shared/db/prisma.js";
import {
  computeSellerProfile,
  type SellerProfile,
} from "../ads/ai-ads-engine.service.js";
import { OFFER_MAP } from "../ads/ads-knowledge-base.js";

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export type AnalyticsTrigger =
  | "MULTI_LISTINGS"
  | "PROMO_ACTIVITY"
  | "SALES_HISTORY"
  | "PRICE_HESITATION"
  | "GROWING_BUSINESS"
  | "PREMIUM_UPGRADE"
  | "CATALOG_DIVERSITY"
  | "IRREGULAR_RESULTS"
  | "OPTIMIZATION_INTENT";

export type AnalyticsTier = "MEDIUM" | "PREMIUM";

export interface AnalyticsCTA {
  trigger: AnalyticsTrigger;
  tier: AnalyticsTier;          // quel tier résout le problème
  priority: number;             // 1-10
  icon: string;
  title: string;
  subtitle: string;             // ce que l'utilisateur va apprendre
  message: string;              // pourquoi c'est utile + problème résolu
  whyNow: string;               // pourquoi c'est pertinent maintenant
  valuePills: string[];          // pilules de valeur concrètes (3 max)
  ctaLabel: string;
  ctaTarget: string;
  planName: string;              // nom du plan suggéré
  planPrice: string;             // prix affiché
  metric?: Record<string, number | string>;
}

export interface AnalyticsCTAReport {
  ctas: AnalyticsCTA[];
  hasAnalytics: boolean;
  currentTier: "NONE" | "MEDIUM" | "PREMIUM";
  suggestedUpgrade: AnalyticsTier | null;
}

// ═══════════════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════════════

interface AnalyticsContext {
  userId: string;
  profile: SellerProfile;
  isBusiness: boolean;
  currentTier: "NONE" | "MEDIUM" | "PREMIUM";
  // Catalogue
  totalActiveListings: number;
  distinctCategories: number;
  categoryBreakdown: Array<{ category: string; count: number }>;
  // Ventes
  totalSales: number;
  salesLast30d: number;
  salesLast7d: number;
  salesPrev30d: number;
  revenueLast30dCents: number;
  revenuePrev30dCents: number;
  // Promos
  activePromos: number;
  totalPromosEver: number;
  // Prix
  priceChangesLast30d: number;
  // Négociations
  negoLast30d: number;
  negoAcceptedLast30d: number;
  // Modifications
  listingUpdatesLast30d: number;
  boostedListings: number;
  // Régularité
  weeklySalesCounts: number[];   // 4 dernières semaines
}

async function buildAnalyticsContext(
  userId: string,
  profile: SellerProfile
): Promise<AnalyticsContext> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [
    totalActiveListings,
    categoryGroup,
    totalSales,
    salesLast30d,
    salesLast7d,
    salesPrev30d,
    activePromos,
    totalPromosEver,
    priceChangesLast30d,
    negoLast30d,
    negoAcceptedLast30d,
    listingUpdatesLast30d,
    boostedListings,
    revenueRecent,
    revenuePrev,
  ] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE", isPublished: true } }),
    prisma.listing.groupBy({
      by: ["category"],
      where: { ownerUserId: userId, status: "ACTIVE" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED" } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d30 } } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d7 } } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d60, lt: d30 } } }),
    prisma.listing.count({ where: { ownerUserId: userId, promoActive: true } }),
    prisma.listing.count({ where: { ownerUserId: userId, promoPriceUsdCents: { not: null } } }),
    // Approximation : modifications de prix = changements Listing récents
    prisma.listing.count({
      where: { ownerUserId: userId, updatedAt: { gte: d30 }, status: "ACTIVE" },
    }),
    prisma.negotiation.count({
      where: { listing: { ownerUserId: userId }, createdAt: { gte: d30 } },
    }),
    prisma.negotiation.count({
      where: { listing: { ownerUserId: userId }, status: "ACCEPTED", createdAt: { gte: d30 } },
    }),
    prisma.listing.count({
      where: { ownerUserId: userId, updatedAt: { gte: d30 } },
    }),
    prisma.listing.count({
      where: { ownerUserId: userId, isBoosted: true, boostExpiresAt: { gt: now } },
    }),
    prisma.order.aggregate({
      where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d30 } },
      _sum: { totalUsdCents: true },
    }),
    prisma.order.aggregate({
      where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: d60, lt: d30 } },
      _sum: { totalUsdCents: true },
    }),
  ]);

  // Ventes par semaine (4 dernières semaines)
  const weeklySalesCounts: number[] = [];
  for (let w = 0; w < 4; w++) {
    const weekStart = new Date(now.getTime() - (w + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
    const count = await prisma.order.count({
      where: { sellerUserId: userId, status: "DELIVERED", createdAt: { gte: weekStart, lt: weekEnd } },
    });
    weeklySalesCounts.push(count);
  }

  const planCode = profile.currentPlan?.code ?? "FREE";
  let currentTier: "NONE" | "MEDIUM" | "PREMIUM" = "NONE";
  if (["PRO_VENDOR", "BUSINESS"].includes(planCode)) currentTier = "MEDIUM";
  if (planCode === "SCALE") currentTier = "PREMIUM";

  return {
    userId,
    profile,
    isBusiness: profile.isBusiness,
    currentTier,
    totalActiveListings,
    distinctCategories: categoryGroup.length,
    categoryBreakdown: categoryGroup.map((g) => ({ category: g.category, count: g._count.id })),
    totalSales,
    salesLast30d,
    salesLast7d,
    salesPrev30d,
    revenueLast30dCents: revenueRecent._sum.totalUsdCents ?? 0,
    revenuePrev30dCents: revenuePrev._sum.totalUsdCents ?? 0,
    activePromos,
    totalPromosEver,
    priceChangesLast30d,
    negoLast30d,
    negoAcceptedLast30d,
    listingUpdatesLast30d,
    boostedListings,
    weeklySalesCounts,
  };
}

// ═══════════════════════════════════════════════════════
// Plan suggestions
// ═══════════════════════════════════════════════════════

function suggestPlan(ctx: AnalyticsContext, tier: AnalyticsTier): { name: string; price: string; target: string } {
  if (tier === "PREMIUM") {
    const o = OFFER_MAP.get("SCALE")!;
    return { name: "SCALE", price: o.pricingLabel, target: o.ctaPath };
  }
  if (ctx.isBusiness) {
    const o = OFFER_MAP.get("BUSINESS")!;
    return { name: "BUSINESS", price: o.pricingLabel, target: o.ctaPath };
  }
  const o = OFFER_MAP.get("PRO_VENDOR")!;
  return { name: "PRO VENDEUR", price: o.pricingLabel, target: o.ctaPath };
}

// ═══════════════════════════════════════════════════════
// Détecteurs
// ═══════════════════════════════════════════════════════

function detectMultiListings(ctx: AnalyticsContext): AnalyticsCTA | null {
  if (ctx.currentTier !== "NONE") return null;
  if (ctx.totalActiveListings < 5) return null;

  const plan = suggestPlan(ctx, "MEDIUM");

  return {
    trigger: "MULTI_LISTINGS",
    tier: "MEDIUM",
    priority: 7,
    icon: "📊",
    title: ctx.isBusiness
      ? `${ctx.totalActiveListings} articles au catalogue — pilotez la performance`
      : `${ctx.totalActiveListings} annonces actives — voyez ce qui marche`,
    subtitle: ctx.isBusiness
      ? "Identifiez les articles rentables, les stocks à optimiser et les opportunités de croissance"
      : "Découvrez quels articles performent et lesquels freinent vos ventes",
    message: ctx.isBusiness
      ? `Avec ${ctx.totalActiveListings} articles, votre catalogue nécessite un pilotage data. Kin-Sell Analytique identifie les top performers, détecte les articles à rationaliser et optimise l'allocation de vos ressources marketing par produit.`
      : `Avec ${ctx.totalActiveListings} annonces, il devient difficile de savoir lesquelles marchent vraiment. Kin-Sell Analytique vous montre en un coup d'œil les articles qui vendent, ceux qui stagnent, et des conseils simples pour chaque annonce.`,
    whyNow: ctx.isBusiness
      ? `${ctx.totalActiveListings} références actives — sans tableau de bord, vous ne savez pas où concentrer vos efforts.`
      : `Vous gérez ${ctx.totalActiveListings} annonces simultanément — sans données, vous travaillez à l'aveugle.`,
    valuePills: ctx.isBusiness
      ? [
          "Performance par article et catégorie",
          "Optimisation du catalogue par rentabilité",
          "Recommandations stratégiques par produit",
        ]
      : [
          "Classement de vos articles par performance",
          "Détection automatique des annonces stagnantes",
          "Conseils personnalisés par article",
        ],
    ctaLabel: ctx.isBusiness ? "Piloter mon catalogue" : "Voir mes performances",
    ctaTarget: plan.target,
    planName: plan.name,
    planPrice: plan.price,
    metric: { activeListings: ctx.totalActiveListings },
  };
}

function detectPromoActivity(ctx: AnalyticsContext): AnalyticsCTA | null {
  if (ctx.currentTier !== "NONE") return null;
  if (ctx.totalPromosEver < 2) return null;

  const plan = suggestPlan(ctx, "MEDIUM");
  const hasActivePromos = ctx.activePromos > 0;

  return {
    trigger: "PROMO_ACTIVITY",
    tier: "MEDIUM",
    priority: hasActivePromos ? 8 : 6,
    icon: "🎯",
    title: hasActivePromos
      ? (ctx.isBusiness
        ? `${ctx.activePromos} campagne${ctx.activePromos > 1 ? "s" : ""} promo en cours — mesurez le ROI`
        : `${ctx.activePromos} promo${ctx.activePromos > 1 ? "s" : ""} en cours — est-ce que ça marche ?`)
      : (ctx.isBusiness
        ? "Mesurez l'impact réel de vos opérations promotionnelles"
        : "Vos promotions fonctionnent-elles vraiment ?"),
    subtitle: ctx.isBusiness
      ? "Analysez le ROI par campagne, identifiez les stratégies gagnantes et optimisez vos marges"
      : "Analysez le ROI de chaque promotion et identifiez ce qui fonctionne",
    message: hasActivePromos
      ? (ctx.isBusiness
        ? `${ctx.activePromos} campagne${ctx.activePromos > 1 ? "s" : ""} promotionnelle${ctx.activePromos > 1 ? "s" : ""} active${ctx.activePromos > 1 ? "s" : ""}. Sans Analytique, impossible de savoir si elles génèrent un retour positif ou cannibalisent vos marges. Kin-Sell Analytique mesure l'impact : ventes incrémentales, trafic généré, conversion par niveau de remise.`
        : `${ctx.activePromos} promo${ctx.activePromos > 1 ? "s" : ""} active${ctx.activePromos > 1 ? "s" : ""} en ce moment. Sans Analytique, impossible de savoir si elles génèrent des ventes supplémentaires. Kin-Sell Analytique mesure l'impact réel : ventes avant/après, trafic généré, conversion.`)
      : (ctx.isBusiness
        ? `${ctx.totalPromosEver} opérations promotionnelles lancées. Quelles remises ont généré le meilleur ROI ? Kin-Sell Analytique transforme vos intuitions en stratégie data-driven.`
        : `${ctx.totalPromosEver} promos lancées sur Kin-Sell. Quelles remises ont le mieux marché ? Kin-Sell Analytique transforme vos intuitions en certitudes.`),
    whyNow: hasActivePromos
      ? (ctx.isBusiness
        ? "Vos campagnes tournent — Analytique vous donne le ROI en temps réel pour ajuster votre stratégie."
        : "Vos promos tournent maintenant — Analytique vous dit en temps réel ce qui fonctionne.")
      : (ctx.isBusiness
        ? `${ctx.totalPromosEver} opérations sans mesure de performance — il est temps de piloter avec la data.`
        : `${ctx.totalPromosEver} promos déjà lancées sans mesure de résultat — il est temps de comprendre ce qui marche.`),
    valuePills: ctx.isBusiness
      ? [
          "ROI par campagne promotionnelle",
          "Niveau de remise optimal par segment",
          "Analyse incrémentale des ventes",
        ]
      : [
          "Performance de chaque promo (ventes, conversion)",
          "Niveau de remise optimal par catégorie",
          "Meilleurs jours pour lancer une promo",
        ],
    ctaLabel: ctx.isBusiness ? "Analyser mes campagnes" : "Mesurer mes promos",
    ctaTarget: plan.target,
    planName: plan.name,
    planPrice: plan.price,
    metric: { activePromos: ctx.activePromos, totalPromos: ctx.totalPromosEver },
  };
}

function detectSalesHistory(ctx: AnalyticsContext): AnalyticsCTA | null {
  if (ctx.currentTier !== "NONE") return null;
  if (ctx.totalSales < 3) return null;

  const plan = suggestPlan(ctx, "MEDIUM");
  const revenue = (ctx.revenueLast30dCents / 100).toFixed(0);

  return {
    trigger: "SALES_HISTORY",
    tier: "MEDIUM",
    priority: ctx.totalSales >= 10 ? 8 : 6,
    icon: "💰",
    title: ctx.isBusiness
      ? `${ctx.totalSales} ventes — exploitez vos données commerciales`
      : `${ctx.totalSales} ventes réalisées — comprenez vos succès`,
    subtitle: ctx.isBusiness
      ? "Décomposez votre chiffre d'affaires et identifiez les leviers de croissance"
      : "Identifiez ce qui fonctionne pour vendre plus et mieux",
    message: ctx.totalSales >= 10
      ? (ctx.isBusiness
        ? `${ctx.totalSales} ventes et ${revenue}$ de revenus ce mois. Votre boutique génère un vrai chiffre d'affaires — Kin-Sell Analytique décompose votre performance : articles les plus rentables, catégories à développer, positionnement prix optimal.`
        : `${ctx.totalSales} ventes et ${revenue}$ de revenus ce mois. Vous avez un vrai business sur Kin-Sell — mais savez-vous quels facteurs expliquent vos meilleures ventes ? Kin-Sell Analytique décompose votre succès : prix optimal, meilleur moment, catégories les plus rentables.`)
      : (ctx.isBusiness
        ? `Avec ${ctx.totalSales} ventes, vous avez suffisamment de données pour un pilotage efficace. Analytique identifie les articles qui convertissent, les créneaux porteurs et les opportunités d'optimisation.`
        : `Avec ${ctx.totalSales} ventes, vous avez suffisamment de données pour que l'Analytique soit utile. Comprenez quels articles convertissent, à quel prix, et quand vos acheteurs sont les plus actifs.`),
    whyNow: ctx.totalSales >= 10
      ? (ctx.isBusiness
        ? `${ctx.totalSales} ventes = assez de données pour des analyses fiables. Chaque jour sans pilotage data, vous manquez des optimisations.`
        : `${ctx.totalSales} ventes = assez de données pour des analyses fiables. Chaque jour sans Analytique, vous manquez des optimisations.`)
      : (ctx.isBusiness
        ? "Vos premières ventes constituent la base de données nécessaire au pilotage — exploitez-les maintenant."
        : "Vos premières ventes sont la fondation — Analytique vous montre comment en faire beaucoup plus."),
    valuePills: ctx.isBusiness
      ? [
          "Rentabilité par article et catégorie",
          "Positionnement prix vs marché",
          "Créneaux de vente optimaux",
        ]
      : [
          "Prix optimal par catégorie et zone",
          "Produits les plus performants",
          "Meilleurs créneaux de publication",
        ],
    ctaLabel: ctx.isBusiness
      ? (ctx.totalSales >= 10 ? "Piloter mon chiffre" : "Analyser mes ventes")
      : (ctx.totalSales >= 10 ? "Optimiser mes ventes" : "Comprendre mes ventes"),
    ctaTarget: plan.target,
    planName: plan.name,
    planPrice: plan.price,
    metric: { totalSales: ctx.totalSales, revenue30d: `${revenue}$` },
  };
}

function detectPriceHesitation(ctx: AnalyticsContext): AnalyticsCTA | null {
  if (ctx.currentTier !== "NONE") return null;
  // Beaucoup de modifications + négociations = hésitation sur les prix
  if (ctx.priceChangesLast30d < 5 && ctx.negoLast30d < 5) return null;

  const negoRate = ctx.negoLast30d > 0
    ? Math.round((ctx.negoAcceptedLast30d / ctx.negoLast30d) * 100)
    : 0;

  const plan = suggestPlan(ctx, "MEDIUM");

  return {
    trigger: "PRICE_HESITATION",
    tier: "MEDIUM",
    priority: 7,
    icon: "💡",
    title: ctx.isBusiness
      ? "Arrêtez de tester vos prix — calibrez-les avec la data"
      : "Arrêtez de deviner vos prix",
    subtitle: ctx.isBusiness
      ? "Positionnement prix optimal par catégorie, basé sur les données de marché réelles"
      : "Le prix optimal de chaque article, calculé par l'IA selon le marché réel",
    message: ctx.negoLast30d >= 5
      ? (ctx.isBusiness
        ? `${ctx.negoLast30d} négociations ce mois avec ${negoRate}% d'acceptation. Vos prix ne sont pas calibrés. Kin-Sell Analytique compare vos tarifs au marché réel : positionnement concurrentiel, élasticité prix et taux de conversion par tranche tarifaire.`
        : `${ctx.negoLast30d} négociations ce mois avec ${negoRate}% d'acceptation. Vos prix sont-ils trop hauts ? Trop bas ? Kin-Sell Analytique compare vos tarifs au marché réel de Kinshasa : prix moyen, médian, et position concurrentielle.`)
      : (ctx.isBusiness
        ? `${ctx.priceChangesLast30d} modifications d'articles ce mois — vous optimisez sans données. Kin-Sell Analytique fournit le positionnement prix optimal par catégorie et zone géographique.`
        : `${ctx.priceChangesLast30d} modifications d'annonces ce mois — vous cherchez le bon prix. Kin-Sell Analytique élimine les doutes : il vous donne le prix optimal basé sur les ventes réelles dans votre catégorie.`),
    whyNow: ctx.negoLast30d >= 5
      ? (ctx.isBusiness
        ? `${ctx.negoLast30d} négociations révèlent un problème de pricing — Analytique calibre vos tarifs automatiquement.`
        : `${ctx.negoLast30d} négociations montrent que vos prix ne sont pas calibrés — Analytique résout ça en un clic.`)
      : (ctx.isBusiness
        ? "Chaque ajustement de prix sans benchmark marché est un pari. Analytique vous donne le positionnement optimal."
        : "Chaque modification de prix sans données marché est un essai au hasard. Analytique vous donne la réponse."),
    valuePills: ctx.isBusiness
      ? [
          "Benchmark prix par catégorie et segment",
          "Positionnement concurrentiel en temps réel",
          "Élasticité prix et taux de conversion",
        ]
      : [
          "Prix moyen et médian par catégorie",
          "Votre position vs le marché",
          "Taux de conversion par niveau de prix",
        ],
    ctaLabel: ctx.isBusiness ? "Calibrer mes prix" : "Trouver le bon prix",
    ctaTarget: plan.target,
    planName: plan.name,
    planPrice: plan.price,
    metric: { negotiations: ctx.negoLast30d, acceptRate: `${negoRate}%`, priceChanges: ctx.priceChangesLast30d },
  };
}

function detectGrowingBusiness(ctx: AnalyticsContext): AnalyticsCTA | null {
  if (ctx.salesPrev30d === 0) return null;
  const growth = ((ctx.salesLast30d - ctx.salesPrev30d) / ctx.salesPrev30d) * 100;
  if (growth < 30) return null; // croissance < 30%

  const revenueGrowth = ctx.revenuePrev30dCents > 0
    ? Math.round(((ctx.revenueLast30dCents - ctx.revenuePrev30dCents) / ctx.revenuePrev30dCents) * 100)
    : 0;

  // Si déjà MEDIUM, proposer PREMIUM
  if (ctx.currentTier === "PREMIUM") return null;
  const tier: AnalyticsTier = ctx.currentTier === "MEDIUM" ? "PREMIUM" : "MEDIUM";
  const plan = suggestPlan(ctx, tier);

  return {
    trigger: "GROWING_BUSINESS",
    tier,
    priority: 9,
    icon: "🚀",
    title: ctx.isBusiness
      ? `+${Math.round(growth)}% de croissance — équipez votre boutique pour scaler`
      : `+${Math.round(growth)}% de ventes ce mois — accélérez votre croissance`,
    subtitle: tier === "PREMIUM"
      ? (ctx.isBusiness
        ? "Passez au cockpit complet : funnel de conversion, prédictions IA et pilotage stratégique"
        : "Passez aux prédictions IA : funnel de conversion, audience, et forecast")
      : (ctx.isBusiness
        ? "Identifiez les leviers de votre croissance pour l'industrialiser"
        : "Comprenez les leviers de votre croissance pour la maintenir"),
    message: tier === "PREMIUM"
      ? (ctx.isBusiness
        ? `Votre boutique explose : +${Math.round(growth)}% de ventes, +${revenueGrowth}% de revenus. Analytique Premium est le cockpit de pilotage dont vous avez besoin : funnel de conversion complet, segmentation audience, prédictions de croissance et score de risque de décélération.`
        : `Votre activité explose : +${Math.round(growth)}% de ventes, +${revenueGrowth}% de revenus. Avec Analytique Premium, vous accédez au funnel de conversion complet, à la segmentation audience, aux prédictions de croissance et au risk score de churn.`)
      : (ctx.isBusiness
        ? `+${Math.round(growth)}% de ventes vs le mois dernier ! Pour maintenir cette trajectoire, votre boutique a besoin de données : d'où viennent ces ventes ? Quels produits tirent ? Quels segments développer en priorité ?`
        : `+${Math.round(growth)}% de ventes vs le mois dernier ! Cette dynamique est fragile sans visibilité : d'où viennent ces ventes ? Quels produits tirent ? Kin-Sell Analytique transforme votre intuition en stratégie.`),
    whyNow: ctx.isBusiness
      ? `Votre croissance de +${Math.round(growth)}% est le meilleur moment pour investir dans le pilotage data — avant que la dynamique s'essouffle.`
      : `Votre croissance de +${Math.round(growth)}% est le meilleur moment pour investir dans la data — avant que la dynamique s'essouffle.`,
    valuePills: tier === "PREMIUM"
      ? (ctx.isBusiness
        ? ["Funnel de conversion par segment", "Prédictions de croissance IA", "Score de risque et alertes opérationnelles"]
        : ["Funnel de conversion complet", "Prédictions de croissance IA", "Score de risque de ralentissement"])
      : (ctx.isBusiness
        ? ["Tendances marché et benchmark concurrentiel", "Catégories et segments à développer", "Leviers de croissance identifiés"]
        : ["Tendances du marché en temps réel", "Catégories prometteuses à explorer", "Produits qui tirent votre croissance"]),
    ctaLabel: tier === "PREMIUM"
      ? (ctx.isBusiness ? "Piloter ma croissance" : "Passer à Analytique Premium")
      : (ctx.isBusiness ? "Industrialiser ma croissance" : "Accompagner ma croissance"),
    ctaTarget: plan.target,
    planName: plan.name,
    planPrice: plan.price,
    metric: { growth: `+${Math.round(growth)}%`, revenueGrowth: `+${revenueGrowth}%`, salesLast30d: ctx.salesLast30d },
  };
}

function detectCatalogDiversity(ctx: AnalyticsContext): AnalyticsCTA | null {
  if (ctx.currentTier !== "NONE") return null;
  if (ctx.distinctCategories < 3) return null;

  const plan = suggestPlan(ctx, "MEDIUM");
  const topCats = ctx.categoryBreakdown.slice(0, 3).map((c) => c.category).join(", ");

  return {
    trigger: "CATALOG_DIVERSITY",
    tier: "MEDIUM",
    priority: 7,
    icon: "🗂️",
    title: ctx.isBusiness
      ? `${ctx.distinctCategories} catégories — rationalisez votre mix produit`
      : `${ctx.distinctCategories} catégories différentes — trouvez votre niche`,
    subtitle: ctx.isBusiness
      ? "Identifiez les catégories rentables et optimisez l'allocation de vos ressources"
      : "Identifiez les catégories les plus rentables et concentrez vos efforts",
    message: ctx.isBusiness
      ? `Votre boutique couvre ${ctx.distinctCategories} catégories (${topCats}). Cette diversification peut être un atout ou une dispersion. Kin-Sell Analytique identifie les segments les plus porteurs sur le marché de Kinshasa et vous aide à prioriser l'allocation de vos ressources.`
      : `Vous vendez dans ${ctx.distinctCategories} catégories (${topCats}). C'est une force, mais aussi un risque de dispersion. Kin-Sell Analytique identifie les catégories les plus prometteuses à Kinshasa et vous aide à concentrer vos efforts là où la demande est la plus forte.`,
    whyNow: ctx.isBusiness
      ? `${ctx.distinctCategories} catégories = besoin de prioriser. Sans données, vous dispersez vos ressources dans des segments peu rentables.`
      : `${ctx.distinctCategories} catégories = besoin de prioriser. Sans données, vous dispersez vos ressources dans des marchés peu rentables.`,
    valuePills: ctx.isBusiness
      ? [
          "Rentabilité par catégorie et segment",
          "Benchmark concurrentiel par marché",
          "Tendances émergentes à saisir",
        ]
      : [
          "Catégories les plus demandées à Kinshasa",
          "Rentabilité par catégorie (revenus vs effort)",
          "Tendances émergentes à saisir",
        ],
    ctaLabel: ctx.isBusiness ? "Optimiser mon mix produit" : "Identifier mes catégories gagnantes",
    ctaTarget: plan.target,
    planName: plan.name,
    planPrice: plan.price,
    metric: { categories: ctx.distinctCategories, topCategories: topCats },
  };
}

function detectIrregularResults(ctx: AnalyticsContext): AnalyticsCTA | null {
  if (ctx.currentTier !== "NONE") return null;
  if (ctx.totalSales < 4) return null;

  // Calculer la variance des ventes hebdomadaires
  const weeks = ctx.weeklySalesCounts;
  const avg = weeks.reduce((s, v) => s + v, 0) / weeks.length;
  if (avg === 0) return null;
  const variance = weeks.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / weeks.length;
  const cv = Math.sqrt(variance) / avg; // coefficient de variation
  if (cv < 0.5) return null; // résultats assez réguliers

  const plan = suggestPlan(ctx, "MEDIUM");
  const min = Math.min(...weeks);
  const max = Math.max(...weeks);

  return {
    trigger: "IRREGULAR_RESULTS",
    tier: "MEDIUM",
    priority: 7,
    icon: "📉",
    title: ctx.isBusiness
      ? "Résultats irréguliers — stabilisez votre chiffre d'affaires"
      : "Vos ventes font le yo-yo — stabilisez avec la data",
    subtitle: ctx.isBusiness
      ? "Identifiez les facteurs de volatilité et construisez un chiffre d'affaires prévisible"
      : "Comprenez pourquoi certaines semaines sont bonnes et d'autres non",
    message: ctx.isBusiness
      ? `Vos ventes oscillent entre ${min} et ${max} par semaine. Cette volatilité est coûteuse en logistique et prévisionnel. Kin-Sell Analytique identifie les facteurs de variation et fournit des recommandations pour lisser votre activité commerciale.`
      : `Vos ventes oscillent entre ${min} et ${max} par semaine. Cette irrégularité a des causes identifiables : timing de publication, jours de la semaine, prix. Kin-Sell Analytique détecte les patterns et vous dit quand et comment publier pour lisser vos résultats.`,
    whyNow: ctx.isBusiness
      ? `${max - min} ventes d'écart entre votre meilleure et pire semaine — Analytique stabilise votre prévisionnel.`
      : `${max - min} ventes d'écart entre votre meilleure et pire semaine — Analytique identifie les causes et les solutions.`,
    valuePills: ctx.isBusiness
      ? [
          "Facteurs de volatilité identifiés",
          "Planification optimale des publications",
          "Alertes sur les indicateurs de performance",
        ]
      : [
          "Meilleurs jours et heures pour publier",
          "Facteurs qui expliquent les bonnes semaines",
          "Alertes quand vos indicateurs baissent",
        ],
    ctaLabel: ctx.isBusiness ? "Stabiliser mon CA" : "Stabiliser mes ventes",
    ctaTarget: plan.target,
    planName: plan.name,
    planPrice: plan.price,
    metric: { weeklyMin: min, weeklyMax: max, variability: `${Math.round(cv * 100)}%` },
  };
}

function detectOptimizationIntent(ctx: AnalyticsContext): AnalyticsCTA | null {
  if (ctx.currentTier !== "NONE") return null;
  // Signaux d'optimisation : a boosté + fait des promos + modifie ses annonces
  const signals = [
    ctx.boostedListings > 0,
    ctx.activePromos > 0,
    ctx.listingUpdatesLast30d >= 5,
    ctx.priceChangesLast30d >= 3,
  ].filter(Boolean).length;

  if (signals < 2) return null; // pas assez de signaux

  const plan = suggestPlan(ctx, "MEDIUM");

  const actions: string[] = [];
  if (ctx.boostedListings > 0) actions.push(`${ctx.boostedListings} article${ctx.boostedListings > 1 ? "s" : ""} boosté${ctx.boostedListings > 1 ? "s" : ""}`);
  if (ctx.activePromos > 0) actions.push(`${ctx.activePromos} promo${ctx.activePromos > 1 ? "s" : ""} active${ctx.activePromos > 1 ? "s" : ""}`);
  if (ctx.listingUpdatesLast30d >= 5) actions.push(`${ctx.listingUpdatesLast30d} modifications`);

  return {
    trigger: "OPTIMIZATION_INTENT",
    tier: "MEDIUM",
    priority: 8,
    icon: "⚙️",
    title: ctx.isBusiness
      ? "Vous optimisez sans mesure — passez au pilotage data"
      : "Vous optimisez à l'instinct — passez à la data",
    subtitle: ctx.isBusiness
      ? "Mesurez le ROI de chaque action et concentrez vos investissements"
      : "Transformez vos efforts en résultats mesurables",
    message: ctx.isBusiness
      ? `Votre boutique est active : ${actions.join(", ")}. Vous investissez dans l'optimisation, mais sans Analytique, chaque décision est un pari. Kin-Sell Analytique mesure le retour de chaque action : ROI par boost, conversion par campagne, impact de chaque ajustement.`
      : `Vous êtes actif : ${actions.join(", ")}. Vous essayez d'optimiser, et c'est très bien. Mais sans Analytique, chaque décision est un pari. Kin-Sell Analytique vous donne le retour sur chaque action : quel boost a généré des ventes, quelle promo a converti, quel prix est optimal.`,
    whyNow: ctx.isBusiness
      ? "Vous investissez déjà du temps et de l'argent dans l'optimisation — Analytique vous montre le ROI réel."
      : "Vous investissez déjà du temps et de l'argent pour optimiser — Analytique vous montre si ça fonctionne vraiment.",
    valuePills: ctx.isBusiness
      ? [
          "ROI par action marketing (boost, promo, pub)",
          "Attribution des ventes aux leviers activés",
          "Recommandations d'allocation budgétaire",
        ]
      : [
          "ROI de chaque boost et promo",
          "Impact réel de vos modifications",
          "Décisions guidées par la data, pas l'intuition",
        ],
    ctaLabel: ctx.isBusiness ? "Piloter mes investissements" : "Décider avec la data",
    ctaTarget: plan.target,
    planName: plan.name,
    planPrice: plan.price,
    metric: { boosted: ctx.boostedListings, promos: ctx.activePromos, updates: ctx.listingUpdatesLast30d },
  };
}

// ── PREMIUM upsell (pour ceux qui ont déjà MEDIUM) ──

function detectPremiumUpgrade(ctx: AnalyticsContext): AnalyticsCTA | null {
  if (ctx.currentTier !== "MEDIUM") return null;
  // Proposer PREMIUM si activité significative
  if (ctx.totalSales < 15 && ctx.salesLast30d < 5) return null;

  const plan = suggestPlan(ctx, "PREMIUM");
  const revenue = (ctx.revenueLast30dCents / 100).toFixed(0);

  return {
    trigger: "PREMIUM_UPGRADE",
    tier: "PREMIUM",
    priority: 6,
    icon: "🏆",
    title: ctx.isBusiness
      ? "Analytique Premium : le cockpit de votre boutique"
      : "Passez à Analytique Premium",
    subtitle: ctx.isBusiness
      ? "Funnel de conversion, prédictions IA, segmentation audience et pilotage stratégique"
      : "Funnel de conversion, prédictions IA, segmentation audience",
    message: ctx.isBusiness
      ? `Avec ${ctx.salesLast30d} ventes et ${revenue}$ ce mois, votre boutique est prête pour le pilotage avancé. Analytique Premium ajoute le funnel de conversion par segment, la segmentation audience, les prédictions de vélocité et le score de risque de décélération.`
      : `Avec ${ctx.salesLast30d} ventes et ${revenue}$ ce mois, vous êtes prêt pour le niveau supérieur. Analytique Premium ajoute le funnel de conversion (vues → négociations → ventes), la segmentation audience et les prédictions de croissance.`,
    whyNow: ctx.isBusiness
      ? `Votre volume de ${ctx.salesLast30d} ventes/mois justifie le cockpit de pilotage complet — l'investissement se rentabilise immédiatement.`
      : `Votre volume de ${ctx.salesLast30d} ventes/mois justifie des outils de pilotage avancés — l'investissement se rentabilise vite.`,
    valuePills: ctx.isBusiness
      ? [
          "Funnel de conversion par segment et catégorie",
          "Prédictions IA de croissance et vélocité",
          "Risque de churn, alertes opérationnelles",
        ]
      : [
          "Funnel de conversion : vues → ventes",
          "Prédictions IA de croissance",
          "Risque de churn et alertes",
        ],
    ctaLabel: ctx.isBusiness ? "Activer le cockpit Premium" : "Passer à Premium",
    ctaTarget: plan.target,
    planName: plan.name,
    planPrice: plan.price,
    metric: { salesLast30d: ctx.salesLast30d, revenue: `${revenue}$`, totalSales: ctx.totalSales },
  };
}

// ═══════════════════════════════════════════════════════
// Orchestrateur
// ═══════════════════════════════════════════════════════

const ALL_DETECTORS = [
  detectMultiListings,
  detectPromoActivity,
  detectSalesHistory,
  detectPriceHesitation,
  detectGrowingBusiness,
  detectCatalogDiversity,
  detectIrregularResults,
  detectOptimizationIntent,
  detectPremiumUpgrade,
];

// Anti-spam : 72h cooldown par trigger, 12h global si dismiss récent
const CTA_COOLDOWN_HOURS = 72;
const CTA_DISMISS_COOLDOWN_HOURS = 12;

async function canShowCTA(userId: string, trigger: string): Promise<boolean> {
  const since = new Date(Date.now() - CTA_COOLDOWN_HOURS * 60 * 60 * 1000);
  const existing = await prisma.aiRecommendation.count({
    where: { userId, triggerType: trigger, engineKey: "analytics-cta", createdAt: { gte: since } },
  });
  return existing === 0;
}

async function hasRecentDismiss(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - CTA_DISMISS_COOLDOWN_HOURS * 60 * 60 * 1000);
  const count = await prisma.aiRecommendation.count({
    where: { userId, engineKey: "analytics-cta", dismissed: true, createdAt: { gte: since } },
  });
  return count > 0;
}

/**
 * Évalue tous les déclencheurs pour un utilisateur et retourne
 * les CTA analytics les plus pertinents (max 2).
 * Anti-spam : 72h cooldown par trigger, 12h cooldown global après dismiss.
 */
export async function evaluateAnalyticsCTAs(userId: string): Promise<AnalyticsCTAReport> {
  const profile = await computeSellerProfile(userId);
  if (!profile) {
    return { ctas: [], hasAnalytics: false, currentTier: "NONE", suggestedUpgrade: null };
  }

  // Cooldown global si dismiss récent
  if (await hasRecentDismiss(userId)) {
    return { ctas: [], hasAnalytics: false, currentTier: "NONE", suggestedUpgrade: null };
  }

  const ctx = await buildAnalyticsContext(userId, profile);

  const ctas: AnalyticsCTA[] = [];
  for (const detect of ALL_DETECTORS) {
    const cta = detect(ctx);
    if (cta) ctas.push(cta);
  }

  // Trier par priorité
  ctas.sort((a, b) => b.priority - a.priority);

  // Anti-spam : filtrer les triggers en cooldown (max 2 résultats)
  const filtered: AnalyticsCTA[] = [];
  for (const cta of ctas) {
    if (filtered.length >= 2) break;
    if (await canShowCTA(userId, cta.trigger)) {
      filtered.push(cta);
    }
  }

  const suggestedUpgrade: AnalyticsTier | null =
    ctx.currentTier === "NONE" ? "MEDIUM"
    : ctx.currentTier === "MEDIUM" && filtered.some((c) => c.tier === "PREMIUM") ? "PREMIUM"
    : null;

  return {
    ctas: filtered,
    hasAnalytics: ctx.currentTier !== "NONE",
    currentTier: ctx.currentTier,
    suggestedUpgrade,
  };
}
