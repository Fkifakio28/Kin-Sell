/**
 * POST-PUBLISH ADVISOR — Conseiller IA post-publication
 *
 * Analyse l'article, la promotion ou le lot qui vient d'être publié
 * et génère des recommandations contextuelles multi-catégories :
 *
 *   BOOST       — boost visibilité court terme
 *   ADS_PACK    — pack publicité ciblée
 *   ADS_PREMIUM — pub premium (positions premium)
 *   PLAN        — forfait ou upgrade
 *   ANALYTICS   — Kin-Sell Analytique
 *   CONTENT_TIP — améliorer titre / prix / visuels / description
 *
 * Chaque recommandation explique POURQUOI elle est pertinente.
 * Différencie clairement : abonnement, boost, publicité, analytics.
 */

import { prisma } from "../../shared/db/prisma.js";
import { getMarketMedian, computePricePosition } from "../../shared/market/market-shared.js";
import {
  computeSellerProfile,
  type SellerProfile,
} from "./ai-ads-engine.service.js";
import { PLAN_CATALOG } from "../billing/billing.catalog.js";
import { OFFER_MAP, type OfferCode } from "./ads-knowledge-base.js";
import { getMarketContextForUser } from "../market-intel/context.js";

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

export type AdviceCategory =
  | "BOOST"
  | "ADS_PACK"
  | "ADS_PREMIUM"
  | "PLAN"
  | "ANALYTICS"
  | "MARKET_INTEL"
  | "CONTENT_TIP";

export interface PostPublishAdvice {
  category: AdviceCategory;
  priority: number;          // 1-10
  icon: string;              // emoji
  title: string;
  message: string;
  rationale: string;         // pourquoi cette recommandation a du sens
  ctaLabel: string;
  ctaTarget: string;         // route ou action
  ctaAction?: string;        // "BOOST" | "NAVIGATE" | "DISMISS"
  metric?: Record<string, number | string>;
}

export interface PostPublishReport {
  context: "SINGLE" | "PROMO" | "BULK";
  listingTitle?: string;
  qualityScore: number;      // 0-100
  qualitySignals: string[];  // résumé qualité
  advice: PostPublishAdvice[];
  sellerLifecycle: string;
}

export type PublishContext = {
  type: "SINGLE" | "PROMO" | "BULK";
  listingId?: string;
  listingIds?: string[];
  promoCount?: number;
};

// ═══════════════════════════════════════════════════════
// Main entry — analyse post-publication
// ═══════════════════════════════════════════════════════

export async function getPostPublishAdvice(
  userId: string,
  ctx: PublishContext
): Promise<PostPublishReport> {
  const profile = await computeSellerProfile(userId);
  const advice: PostPublishAdvice[] = [];
  const qualitySignals: string[] = [];
  let qualityScore = 50; // baseline

  // ── Analyse du listing publié ──
  let listing: {
    id: string;
    title: string;
    description: string | null;
    category: string;
    city: string;
    priceUsdCents: number;
    imageUrl: string | null;
    mediaUrls: unknown;
    type: string;
  } | null = null;

  if (ctx.type === "SINGLE" && ctx.listingId) {
    listing = await prisma.listing.findUnique({
      where: { id: ctx.listingId },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        city: true,
        priceUsdCents: true,
        imageUrl: true,
        mediaUrls: true,
        type: true,
      },
    });
  }

  // ── 1. QUALITÉ DU CONTENU (Content Tips) ──
  if (listing) {
    const contentAdvice = analyzeContentQuality(listing, qualitySignals);
    qualityScore = contentAdvice.score;
    advice.push(...contentAdvice.tips);
  } else if (ctx.type === "BULK") {
    qualityScore = 60;
    qualitySignals.push("Import en lot — vérifiez la qualité de chaque article");
  } else if (ctx.type === "PROMO") {
    qualityScore = 65;
    qualitySignals.push("Promotion publiée — les visuels et le prix sont clés");
  }

  // ── 2. BOOST ──
  if (profile) {
    const boostAdvice = buildBoostAdvice(profile, listing, ctx);
    if (boostAdvice) advice.push(boostAdvice);
  }

  // ── 3. ADS PACK ──
  if (profile) {
    const adsAdvice = buildAdsPackAdvice(profile, listing, ctx);
    if (adsAdvice) advice.push(adsAdvice);
  }

  // ── 4. ADS PREMIUM ──
  if (profile) {
    const premiumAdvice = buildAdsPremiumAdvice(profile, listing, ctx);
    if (premiumAdvice) advice.push(premiumAdvice);
  }

  // ── 5. PLAN / UPGRADE ──
  if (profile) {
    const planAdvice = buildPlanAdvice(profile);
    if (planAdvice) advice.push(planAdvice);
  }

  // ── 6. ANALYTICS ──
  if (profile) {
    const analyticsAdvice = buildAnalyticsAdvice(profile);
    if (analyticsAdvice) advice.push(analyticsAdvice);
  }

  // ── 7. PRIX MARCHÉ ──
  if (listing) {
    const marketAdvice = await buildMarketPriceAdvice(listing);
    if (marketAdvice) advice.push(marketAdvice);
  }

  // ── 8. MARKET INTEL (Analytique+) — tendance pays ──
  if (listing) {
    const miAdvice = await buildMarketIntelAdvice(userId, listing, profile);
    if (miAdvice) advice.push(miAdvice);
  }

  // Trier par priorité décroissante, max 5
  advice.sort((a, b) => b.priority - a.priority);
  const topAdvice = advice.slice(0, 5);

  return {
    context: ctx.type,
    listingTitle: listing?.title,
    qualityScore,
    qualitySignals,
    advice: topAdvice,
    sellerLifecycle: profile?.lifecycle ?? "NEW",
  };
}

// ═══════════════════════════════════════════════════════
// Analyseurs individuels
// ═══════════════════════════════════════════════════════

function analyzeContentQuality(
  listing: {
    title: string;
    description: string | null;
    imageUrl: string | null;
    mediaUrls: unknown;
    priceUsdCents: number;
  },
  signals: string[]
): { score: number; tips: PostPublishAdvice[] } {
  let score = 50;
  const tips: PostPublishAdvice[] = [];

  // Titre
  const titleLen = listing.title.trim().length;
  if (titleLen >= 20 && titleLen <= 80) {
    score += 15;
    signals.push("Titre de bonne longueur");
  } else if (titleLen < 10) {
    score -= 10;
    signals.push("Titre trop court");
    tips.push({
      category: "CONTENT_TIP",
      priority: 8,
      icon: "✏️",
      title: "Améliorez votre titre",
      message: `Votre titre fait seulement ${titleLen} caractères. Un bon titre descriptif (20-80 caractères) attire plus d'acheteurs.`,
      rationale: "Les articles avec des titres détaillés reçoivent en moyenne 3× plus de vues sur Kin-Sell.",
      ctaLabel: "Modifier l'article",
      ctaTarget: "/dashboard",
      ctaAction: "NAVIGATE",
    });
  } else if (titleLen > 80) {
    score -= 5;
    signals.push("Titre un peu long");
  } else {
    score += 5;
  }

  // Description
  const descLen = listing.description?.trim().length ?? 0;
  if (descLen >= 50) {
    score += 15;
    signals.push("Description détaillée");
  } else if (descLen < 10) {
    score -= 10;
    signals.push("Description absente ou très courte");
    tips.push({
      category: "CONTENT_TIP",
      priority: 7,
      icon: "📝",
      title: "Ajoutez une description",
      message: "Votre article n'a pas de description détaillée. Les acheteurs veulent des détails : état, taille, couleur, raison de la vente…",
      rationale: "Une description complète rassure l'acheteur et réduit les questions inutiles en messagerie.",
      ctaLabel: "Modifier l'article",
      ctaTarget: "/dashboard",
      ctaAction: "NAVIGATE",
    });
  } else {
    score += 5;
    signals.push("Description correcte");
  }

  // Médias
  const mediaArr = Array.isArray(listing.mediaUrls) ? listing.mediaUrls : [];
  const mediaCount = mediaArr.length + (listing.imageUrl ? 1 : 0);
  if (mediaCount >= 3) {
    score += 15;
    signals.push(`${mediaCount} photos — excellent`);
  } else if (mediaCount === 0) {
    score -= 15;
    signals.push("Aucune photo");
    tips.push({
      category: "CONTENT_TIP",
      priority: 9,
      icon: "📸",
      title: "Ajoutez des photos",
      message: "Votre article n'a aucune photo. Les annonces avec photos obtiennent 10× plus de clics.",
      rationale: "Les acheteurs ne négocient presque jamais sur un article sans visuel — ajoutez au moins 2-3 photos.",
      ctaLabel: "Ajouter des photos",
      ctaTarget: "/dashboard",
      ctaAction: "NAVIGATE",
    });
  } else {
    score += 5;
    signals.push(`${mediaCount} photo${mediaCount > 1 ? "s" : ""}`);
  }

  // Prix
  if (listing.priceUsdCents > 0) {
    score += 5;
    signals.push("Prix renseigné");
  } else {
    signals.push("Prix non renseigné");
  }

  return { score: Math.max(0, Math.min(100, score)), tips };
}

function buildBoostAdvice(
  profile: SellerProfile,
  listing: { title: string; category: string; city: string } | null,
  ctx: PublishContext
): PostPublishAdvice | null {
  const { hasBoostAddon, totalListings, stagnantCount, lifecycle } = profile;

  if (ctx.type === "BULK" && (ctx.promoCount ?? 0) >= 5) {
    return {
      category: "BOOST",
      priority: 7,
      icon: "🚀",
      title: "Mettez en avant tout votre lot",
      message: `Vous venez de publier ${ctx.promoCount} articles d'un coup ! Une mise en avant de votre ${profile.isBusiness ? "boutique" : "profil"} les rendra tous plus visibles.`,
      rationale: `Avec ${totalListings} articles actifs, la mise en avant multiplie la visibilité globale par 3 à 5×.`,
      ctaLabel: hasBoostAddon ? "Activer la mise en avant" : "Souscrire au Boost",
      ctaTarget: hasBoostAddon ? "/dashboard" : OFFER_MAP.get("BOOST_VISIBILITY")!.ctaPath,
      ctaAction: hasBoostAddon ? "BOOST" : "NAVIGATE",
      metric: { articles: ctx.promoCount ?? 0, totalListings },
    };
  }

  if (ctx.type === "SINGLE" && listing) {
    const message = hasBoostAddon
      ? `Boostez « ${listing.title} » pour apparaître en tête des résultats à ${listing.city}. Le boost est inclus dans votre add-on.`
      : `Boostez « ${listing.title} » pour gagner en visibilité. L'add-on Boost Visibilité vous permet de mettre en avant vos articles.`;

    return {
      category: "BOOST",
      priority: hasBoostAddon ? 6 : 5,
      icon: "🚀",
      title: "Booster cet article",
      message,
      rationale: stagnantCount > 0
        ? `${stagnantCount} de vos articles stagnent — un boost aide à redémarrer la visibilité.`
        : "Les articles boostés obtiennent 2 à 5× plus de vues dans les résultats de recherche.",
      ctaLabel: hasBoostAddon ? "Booster maintenant" : "Souscrire au Boost",
      ctaTarget: hasBoostAddon ? "/dashboard" : OFFER_MAP.get("BOOST_VISIBILITY")!.ctaPath,
      ctaAction: hasBoostAddon ? "BOOST" : "NAVIGATE",
      metric: { stagnant: stagnantCount },
    };
  }

  if (ctx.type === "PROMO") {
    return {
      category: "BOOST",
      priority: 6,
      icon: "🚀",
      title: "Boostez votre promotion",
      message: "Votre promotion vient d'être publiée ! Un boost la fera apparaître en priorité aux acheteurs qui recherchent des promos.",
      rationale: "Les promotions boostées convertissent 2× mieux car elles combinent prix réduit et visibilité accrue.",
      ctaLabel: hasBoostAddon ? "Booster la promo" : "Souscrire au Boost",
      ctaTarget: hasBoostAddon ? "/dashboard" : OFFER_MAP.get("BOOST_VISIBILITY")!.ctaPath,
      ctaAction: hasBoostAddon ? "BOOST" : "NAVIGATE",
    };
  }

  return null;
}

function buildAdsPackAdvice(
  profile: SellerProfile,
  listing: { title: string; category: string } | null,
  ctx: PublishContext
): PostPublishAdvice | null {
  const { lifecycle, budgetTier, activeAddons, completedSales, isBusiness } = profile;

  // Pas pertinent pour les tout nouveaux vendeurs
  if (lifecycle === "NEW" && budgetTier === "ZERO") return null;

  // Déjà un pack actif → skip
  if (activeAddons.includes("ADS_PACK")) return null;

  const categoryInfo = listing ? ` dans ${listing.category}` : "";

  if (ctx.type === "SINGLE" && lifecycle !== "NEW") {
    return {
      category: "ADS_PACK",
      priority: 5,
      icon: "📢",
      title: "Pack Publicité ciblée",
      message: `Diffusez votre annonce${categoryInfo} sur toute la marketplace. Le pack pub affiche vos articles comme annonces sponsorisées auprès d'acheteurs ciblés.`,
      rationale: `Avec ${completedSales} vente${completedSales > 1 ? "s" : ""} récente${completedSales > 1 ? "s" : ""}, une campagne pub peut accélérer vos résultats. C'est différent du boost : la pub atteint de nouveaux acheteurs au-delà de la recherche.`,
      ctaLabel: "Voir les packs pub",
      ctaTarget: OFFER_MAP.get("ADS_PACK")!.ctaPath,
      ctaAction: "NAVIGATE",
      pricing: OFFER_MAP.get("ADS_PACK")!.pricingLabel,
      metric: { sales: completedSales },
    } as PostPublishAdvice;
  }

  if (ctx.type === "BULK" || ctx.type === "PROMO") {
    return {
      category: "ADS_PACK",
      priority: 5,
      icon: "📢",
      title: "Campagne publicitaire",
      message: `${isBusiness ? "Faites connaître votre boutique" : "Faites connaître vos articles"} avec une campagne pub ciblée. Vos annonces apparaîtront comme contenu sponsorisé sur Explorer, So-Kin et l'accueil.`,
      rationale: "La publicité est un investissement différent du boost : elle s'affiche comme une annonce dédiée, visible même par ceux qui ne cherchent pas activement.",
      ctaLabel: "Créer une campagne",
      ctaTarget: OFFER_MAP.get("ADS_PACK")!.ctaPath,
      ctaAction: "NAVIGATE",
    };
  }

  return null;
}

function buildAdsPremiumAdvice(
  profile: SellerProfile,
  listing: { title: string } | null,
  ctx: PublishContext
): PostPublishAdvice | null {
  const { lifecycle, budgetTier, completedSales, revenueLastThirtyDays } = profile;

  // premium ads seulement pour vendeurs établis avec du budget
  if (lifecycle === "NEW" || lifecycle === "GROWING") return null;
  if (budgetTier === "ZERO" || budgetTier === "LOW") return null;
  if (revenueLastThirtyDays < 5000) return null; // min 50$ revenu/mois

  return {
    category: "ADS_PREMIUM",
    priority: 4,
    icon: "👑",
    title: "Pub Premium — position exclusive",
    message: "Réservez une position premium sur la page d'accueil et en tête des résultats. Votre annonce est la seule visible dans cet emplacement pendant toute la durée.",
    rationale: `Votre revenu de ${(revenueLastThirtyDays / 100).toFixed(0)}$/mois et vos ${completedSales} ventes justifient un investissement premium pour maximiser la croissance.`,
    ctaLabel: "Découvrir Ads Premium",
    ctaTarget: OFFER_MAP.get("ADS_PREMIUM")!.ctaPath,
    ctaAction: "NAVIGATE",
    metric: { revenue: `${(revenueLastThirtyDays / 100).toFixed(0)}$` },
  };
}

function buildPlanAdvice(profile: SellerProfile): PostPublishAdvice | null {
  const { currentPlan, lifecycle, isBusiness, completedSales, totalListings, revenueLastThirtyDays } = profile;

  // Déjà au plan max → pas de suggestion
  const maxPlan = isBusiness ? "SCALE" : "PRO_VENDOR";
  if (currentPlan?.code === maxPlan) return null;

  // FREE / pas de plan → suggérer un premier forfait
  if (!currentPlan || currentPlan.code === "FREE") {
    let suggestedCode: string;
    let reason: string;

    if (isBusiness) {
      suggestedCode = "STARTER";
      reason = "Le forfait Starter donne une boutique professionnelle avec vitrine en ligne.";
    } else if (totalListings >= 5 || completedSales >= 3) {
      suggestedCode = "BOOST";
      reason = `Avec ${totalListings} articles et ${completedSales} ventes, le forfait Boost améliore votre visibilité.`;
    } else {
      // Trop tôt pour pousser un forfait
      return null;
    }

    const plan = PLAN_CATALOG.find((p) => p.code === suggestedCode);
    if (!plan) return null;

    return {
      category: "PLAN",
      priority: 6,
      icon: "📦",
      title: `Passez au forfait ${plan.name}`,
      message: `${reason} Paiement sécurisé via PayPal (${(plan.monthlyPriceUsdCents / 100).toFixed(0)}$/mois).`,
      rationale: "Un forfait est un engagement mensuel qui débloque des fonctionnalités permanentes — c'est différent d'un boost ou d'une pub ponctuelle.",
      ctaLabel: "Voir les forfaits",
      ctaTarget: OFFER_MAP.get(suggestedCode as OfferCode)?.ctaPath ?? "/forfaits",
      ctaAction: "NAVIGATE",
      metric: { price: `${(plan.monthlyPriceUsdCents / 100).toFixed(0)}$/mois` },
    };
  }

  // Upgrade suggestion
  if (lifecycle === "ESTABLISHED" || lifecycle === "POWER") {
    const upgradePath = isBusiness
      ? ["STARTER", "BUSINESS", "SCALE"]
      : ["FREE", "BOOST", "AUTO", "PRO_VENDOR"];
    const idx = upgradePath.indexOf(currentPlan.code);
    if (idx < 0 || idx >= upgradePath.length - 1) return null;
    const nextCode = upgradePath[idx + 1];
    const nextPlan = PLAN_CATALOG.find((p) => p.code === nextCode);
    if (!nextPlan) return null;

    // Seulement si le revenu justifie l'upgrade
    if (revenueLastThirtyDays < currentPlan.priceCents * 3) return null;

    return {
      category: "PLAN",
      priority: 5,
      icon: "⬆️",
      title: `Passer à ${nextPlan.name}`,
      message: `Votre revenu mensuel (${(revenueLastThirtyDays / 100).toFixed(0)}$) montre que votre activité est prête pour le niveau supérieur. ${nextPlan.name} débloque plus d'outils.`,
      rationale: "L'upgrade vous donne accès à des fonctionnalités avancées qui accompagnent votre croissance — c'est un investissement à long terme.",
      ctaLabel: "Comparer les forfaits",
      ctaTarget: OFFER_MAP.get(nextCode as OfferCode)?.ctaPath ?? "/forfaits",
      ctaAction: "NAVIGATE",
      metric: { currentRevenue: `${(revenueLastThirtyDays / 100).toFixed(0)}$`, nextPrice: `${(nextPlan.monthlyPriceUsdCents / 100).toFixed(0)}$/mois` },
    };
  }

  return null;
}

function buildAnalyticsAdvice(profile: SellerProfile): PostPublishAdvice | null {
  const { lifecycle, currentPlan, completedSales, totalListings } = profile;

  // Analytics disponible pour PRO_VENDOR, BUSINESS et SCALE
  const analyticsCodes = ["PRO_VENDOR", "BUSINESS", "SCALE"];
  if (currentPlan && analyticsCodes.includes(currentPlan.code)) return null; // déjà accès

  // Ne proposer que si le vendeur a de l'activité
  if (completedSales < 3 || totalListings < 3) return null;

  return {
    category: "ANALYTICS",
    priority: lifecycle === "ESTABLISHED" ? 5 : 3,
    icon: "📊",
    title: "Kin-Sell Analytique",
    message: `Vous avez ${completedSales} ventes et ${totalListings} articles. Avec Kin-Sell Analytique, suivez vos performances : tendances, diagnostics IA et prédictions personnalisées.`,
    rationale: "L'Analytics est différent du boost et de la pub : c'est un outil d'analyse qui vous aide à prendre de meilleures décisions de vente.",
    ctaLabel: "Découvrir Analytique",
    ctaTarget: OFFER_MAP.get("ANALYTICS_MEDIUM")!.ctaPath,
    ctaAction: "NAVIGATE",
    metric: { sales: completedSales, listings: totalListings },
  };
}

async function buildMarketPriceAdvice(
  listing: { title: string; category: string; city: string; priceUsdCents: number }
): Promise<PostPublishAdvice | null> {
  if (!listing.priceUsdCents) return null;

  try {
    const marketData = await getMarketMedian(listing.category, listing.city);
    if (!marketData || marketData.medianPriceCents <= 0 || marketData.sampleSize < 3) return null;

    const result = computePricePosition(listing.priceUsdCents, marketData.medianPriceCents);
    const medianStr = (marketData.medianPriceCents / 100).toFixed(2);
    const priceStr = (listing.priceUsdCents / 100).toFixed(2);

    if (result.position === "ABOVE_MARKET" && result.diffPercent > 30) {
      return {
        category: "CONTENT_TIP",
        priority: 7,
        icon: "💰",
        title: "Prix au-dessus du marché",
        message: `Votre prix (${priceStr}$) est ${result.diffPercent}% au-dessus du prix médian (${medianStr}$) pour ${listing.category} à ${listing.city}.`,
        rationale: "Un prix élevé peut ralentir les ventes. Si votre article a des caractéristiques premium, mentionnez-les dans la description pour justifier le prix.",
        ctaLabel: "Ajuster le prix",
        ctaTarget: "/dashboard",
        ctaAction: "NAVIGATE",
        metric: { medianPrice: `${medianStr}$`, yourPrice: `${priceStr}$`, deviation: `+${result.diffPercent}%` },
      };
    }

    if (result.position === "BELOW_MARKET" && result.diffPercent > 40) {
      return {
        category: "CONTENT_TIP",
        priority: 4,
        icon: "💡",
        title: "Prix compétitif",
        message: `Votre prix (${priceStr}$) est bien en dessous du marché (médiane ${medianStr}$). Vous pourriez potentiellement augmenter votre prix tout en restant attractif.`,
        rationale: "Un prix trop bas peut aussi donner l'impression de mauvaise qualité. Trouvez l'équilibre entre compétitivité et rentabilité.",
        ctaLabel: "Revoir le prix",
        ctaTarget: "/dashboard",
        ctaAction: "NAVIGATE",
        metric: { medianPrice: `${medianStr}$`, yourPrice: `${priceStr}$`, deviation: `-${result.diffPercent}%` },
      };
    }

    if (result.position === "ON_MARKET") {
      // Positive signal, no action needed — include as quality signal only
      return null;
    }
  } catch {
    // market data unavailable
  }

  return null;
}

/**
 * Construit un conseil Market-Intel : informe le vendeur du rang de son
 * produit dans les tendances pays et de la saisonnalité active.
 * Silencieux si aucune donnée — évite de polluer la sortie.
 */
async function buildMarketIntelAdvice(
  userId: string,
  listing: { title: string; category: string; city: string; priceUsdCents: number },
  profile: SellerProfile | null,
): Promise<PostPublishAdvice | null> {
  try {
    // Récup pays du user
    const profileRow = await prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { country: true } } },
    });
    const country = profileRow?.profile?.country ?? null;
    if (!country) return null;

    const includeArbitrage = profile?.currentPlan?.code === "SCALE";
    const snap = await getMarketContextForUser({
      country,
      categoryId: listing.category,
      includeArbitrage,
    });

    if (!snap.productInsight && snap.topTrends.length === 0) return null;

    // Cas 1 : produit trouvé dans les tendances
    const insight = snap.productInsight;
    if (insight?.trendRank) {
      const dir = (insight.trendDeltaPct ?? 0) >= 0 ? "en hausse" : "en baisse";
      const season = insight.trendSeason ? ` — saison: ${insight.trendSeason}` : "";
      return {
        category: "MARKET_INTEL",
        priority: 6,
        icon: "📈",
        title: `Votre produit est #${insight.trendRank} en tendance (${country})`,
        message: `${insight.displayName} est actuellement #${insight.trendRank} des produits tendance en ${country}, ${dir} de ${Math.abs(insight.trendDeltaPct ?? 0).toFixed(1)}% sur 14 jours${season}. Prix médian observé: ${insight.priceMedianLocal} ${insight.localCurrency}.`,
        rationale: "Profitez du momentum : boostez cet article pour capter la demande.",
        ctaLabel: "Voir Intelligence marché",
        ctaTarget: "/market-intel",
        ctaAction: "NAVIGATE",
        metric: { rank: insight.trendRank, deltaPct: insight.trendDeltaPct ?? 0 },
      };
    }

    // Cas 2 : top tendances du pays (sans match précis)
    if (snap.topTrends.length > 0) {
      const top = snap.topTrends.slice(0, 3).map((t) => `#${t.rank} ${t.name}`).join(", ");
      return {
        category: "MARKET_INTEL",
        priority: 4,
        icon: "🌍",
        title: `Tendances ${country} cette semaine`,
        message: `Les produits qui montent en ${country}: ${top}. Pensez à diversifier votre catalogue.`,
        rationale: "Les tendances pays sont mises à jour toutes les 24h par Kin-Sell Analytique+.",
        ctaLabel: "Explorer les tendances",
        ctaTarget: "/market-intel",
        ctaAction: "NAVIGATE",
      };
    }

    return null;
  } catch {
    return null;
  }
}
