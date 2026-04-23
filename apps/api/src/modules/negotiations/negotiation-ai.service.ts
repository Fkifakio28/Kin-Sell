/**
 * IA MARCHAND — Negotiation AI Engine (V2 Enhanced)
 *
 * 6 moteurs coordonnés :
 * - Pricing Engine       : prix suggéré acheteur basé sur historique marché
 * - Strategy Engine      : chance de succès (%) et stratégie par étape
 * - Seller Advisor       : impact marge, probabilité conversion, recommandation
 * - Intent Engine        : profil acheteur, historique, risque manipulation
 * - Auto-Respond Engine  : réponse automatique batch aux négociations en attente
 * - Dynamic Rules Engine : ajustement dynamique des règles selon le marché
 *
 * Tout rule-based, sans LLM. Données réelles Prisma.
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { getMarketDemand } from "../../shared/market/market-shared.js";
import {
  getMarketEnrichment,
  computeAdaptiveThresholds,
  type MarketEnrichment,
} from "../../shared/market/market-enrichment.service.js";
import {
  checkIaAccessOrLog,
  clearSubscriptionCache,
} from "../../shared/billing/subscription-guard.js";
import { sendPushToUser } from "../notifications/push.service.js";
import { getExternalPriceIntel, getBlendedInsight } from "../knowledge-base/knowledge-base.service.js";
import { getFusedIntelligence } from "../external-intel/external-intelligence-fusion.service.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface BuyerNegotiationHint {
  listingId: string;
  listingTitle: string;
  originalPriceUsdCents: number;
  suggestedOfferUsdCents: number;
  minRealisticOfferUsdCents: number;
  successRate: number;          // 0-100
  marketContext: "COMPETITIVE" | "FLEXIBLE" | "FIXED";
  messageSuggestion: string;
  insight: string;
  sampleSize: number;
  /** Enrichissement marché (si disponible) */
  enrichment: {
    marketHeatScore: number;
    priceFlexibilityScore: number;
    regionalDemandScore: number;
    competitionPressureScore: number;
    confidenceScore: number;
    sourceType: string;
    externalInsight: string | null;
  } | null;
}

export interface SellerNegotiationAdvice {
  negotiationId: string;
  recommendation: "ACCEPT" | "COUNTER" | "REFUSE";
  counterSuggestionUsdCents: number | null;
  conversionProbability: number;  // 0-100
  marginImpact: {
    originalPriceUsdCents: number;
    proposedPriceUsdCents: number;
    discountPercent: number;
  };
  buyerProfile: {
    trustLevel: "LOW" | "MEDIUM" | "HIGH";
    previousPurchases: number;
    isRepeatBuyer: boolean;
  };
  insight: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  /** Posture de négociation calculée */
  posture: NegotiationPosture | null;
  /** Enrichissement marché (si disponible) */
  enrichment: {
    marketHeatScore: number;
    competitionPressureScore: number;
    adaptiveCounterPercent: number;
    confidenceScore: number;
    sourceType: string;
    externalInsight: string | null;
  } | null;
}

export interface AutoNegotiationRules {
  enabled: boolean;
  minFloorPercent: number;   // Min price floor as % of original (ex: 70 = can't go below 70%)
  maxAutoDiscountPercent: number; // Max discount IA will auto-accept (ex: 20 = accept up to 20% off)
  preferredCounterPercent: number; // Default counter proposal % of original (ex: 90)
  prioritizeSpeed: boolean;  // If true: accepts faster even at lower margin
  stockUrgencyBoost: boolean; // Auto-lower floor if stock > 10
}

// ─────────────────────────────────────────────
// Negotiation Posture Engine
// ─────────────────────────────────────────────

export type NegotiationPosture = "FIRM" | "BALANCED" | "FLEXIBLE" | "LIQUIDATION";

export interface PostureAnalysis {
  posture: NegotiationPosture;
  reasoning: string;
  factors: {
    demandLevel: "LOW" | "MEDIUM" | "HIGH";
    stockPressure: "NONE" | "LOW" | "MEDIUM" | "HIGH";
    sellerAcceptanceRate: number; // 0-100
    competitionLevel: "LOW" | "MEDIUM" | "HIGH";
    avgDaysOnMarket: number;
    sellerFlexibility: number; // 0-100
  };
}

/**
 * Calcule la posture de négociation pour un listing/vendeur/contexte.
 * FIRM → article rare + forte demande
 * BALANCED → conditions normales
 * FLEXIBLE → compétition forte, vendeur ouvert
 * LIQUIDATION → stock qui traîne, besoin de vendre
 */
export async function computeNegotiationPosture(
  listingId: string,
  sellerUserId: string,
  category: string,
  city: string,
  stockQuantity: number | null,
  enrichment: MarketEnrichment | null,
): Promise<PostureAnalysis> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // ── Mémoire vendeur ──
  const [sellerAccepted, sellerTotal, listing] = await Promise.all([
    prisma.negotiation.count({
      where: { sellerUserId, status: "ACCEPTED", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.negotiation.count({
      where: { sellerUserId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.listing.findUnique({
      where: { id: listingId },
      select: { createdAt: true },
    }),
  ]);

  const sellerAcceptanceRate = sellerTotal > 0 ? Math.round((sellerAccepted / sellerTotal) * 100) : 50;

  // Ancienneté de l'annonce (jours sur le marché)
  const avgDaysOnMarket = listing
    ? Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // ── Facteurs d'enrichissement ──
  const heat = enrichment?.marketHeatScore ?? 40;
  const competition = enrichment?.competitionPressureScore ?? 30;
  const demand = enrichment?.regionalDemandScore ?? 40;

  const demandLevel: "LOW" | "MEDIUM" | "HIGH" =
    demand >= 65 ? "HIGH" : demand >= 35 ? "MEDIUM" : "LOW";
  const competitionLevel: "LOW" | "MEDIUM" | "HIGH" =
    competition >= 65 ? "HIGH" : competition >= 35 ? "MEDIUM" : "LOW";

  // Pression stock
  let stockPressure: "NONE" | "LOW" | "MEDIUM" | "HIGH" = "NONE";
  if (stockQuantity !== null) {
    if (stockQuantity <= 1) stockPressure = "NONE"; // pas de pression car très rare
    else if (stockQuantity <= 3) stockPressure = "LOW";
    else if (stockQuantity <= 10) stockPressure = "MEDIUM";
    else stockPressure = "HIGH";
  }

  // Flexibilité vendeur (basée sur acceptance rate + enrichissement)
  const sellerFlexibility = Math.min(100, Math.round(
    sellerAcceptanceRate * 0.6 + (enrichment?.priceFlexibilityScore ?? 40) * 0.4,
  ));

  // ── Calcul de la posture ──
  let score = 50; // base neutre

  // Demande forte → FIRM
  if (demandLevel === "HIGH") score += 20;
  else if (demandLevel === "LOW") score -= 15;

  // Stock élevé qui traîne → FLEXIBLE/LIQUIDATION
  if (stockPressure === "HIGH" && avgDaysOnMarket > 14) score -= 25;
  else if (stockPressure === "HIGH") score -= 10;
  else if (stockPressure === "NONE" && stockQuantity !== null && stockQuantity <= 1) score += 15;

  // Vieux listing → plus flexible
  if (avgDaysOnMarket > 30) score -= 15;
  else if (avgDaysOnMarket > 14) score -= 5;

  // Compétition forte → plus flexible
  if (competitionLevel === "HIGH") score -= 10;
  else if (competitionLevel === "LOW") score += 10;

  // Vendeur ferme ou flexible
  if (sellerAcceptanceRate < 30) score += 10;
  else if (sellerAcceptanceRate > 70) score -= 10;

  // Marché chaud → FIRM
  if (heat > 70) score += 10;
  else if (heat < 30) score -= 10;

  let posture: NegotiationPosture;
  let reasoning: string;

  if (score >= 70) {
    posture = "FIRM";
    reasoning = "Article en forte demande avec peu de concurrence — position ferme justifiée.";
  } else if (score >= 45) {
    posture = "BALANCED";
    reasoning = "Conditions de marché normales — négociation équilibrée recommandée.";
  } else if (score >= 20) {
    posture = "FLEXIBLE";
    reasoning = "Compétition élevée ou article lent — flexibilité accrue pour convertir.";
  } else {
    posture = "LIQUIDATION";
    reasoning = "Stock dormant ou marché saturé — accepter les offres raisonnables pour écouler.";
  }

  return {
    posture,
    reasoning,
    factors: {
      demandLevel,
      stockPressure,
      sellerAcceptanceRate,
      competitionLevel,
      avgDaysOnMarket,
      sellerFlexibility,
    },
  };
}

// ─────────────────────────────────────────────
// Mémoire comportementale vendeur
// ─────────────────────────────────────────────

export interface SellerMemory {
  acceptanceRate: number;          // 0-100 — taux d'acceptation 30j
  avgResponseTimeHours: number;    // temps moyen de réponse
  preferredDiscountRange: { min: number; max: number }; // plage de remise acceptée habituellement
  totalNegotiations30d: number;
  totalAccepted30d: number;
  conversionSpeed: "FAST" | "MEDIUM" | "SLOW";
  flexibleCategories: string[];    // catégories où il est le plus flexible
}

export async function getSellerMemory(sellerUserId: string): Promise<SellerMemory> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [accepted, total, allNegos] = await Promise.all([
    prisma.negotiation.findMany({
      where: { sellerUserId, status: "ACCEPTED", createdAt: { gte: thirtyDaysAgo } },
      select: {
        originalPriceUsdCents: true,
        finalPriceUsdCents: true,
        createdAt: true,
        resolvedAt: true,
        listing: { select: { category: true } },
      },
      take: 200,
    }),
    prisma.negotiation.count({
      where: { sellerUserId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.negotiation.findMany({
      where: {
        sellerUserId,
        status: { in: ["ACCEPTED", "REFUSED", "COUNTERED"] },
        resolvedAt: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true, resolvedAt: true },
      take: 200,
    }),
  ]);

  const acceptanceRate = total > 0 ? Math.round((accepted.length / total) * 100) : 50;

  // Temps de réponse moyen
  const responseTimes = allNegos
    .filter((n) => n.resolvedAt)
    .map((n) => (new Date(n.resolvedAt!).getTime() - new Date(n.createdAt).getTime()) / (1000 * 60 * 60));
  const avgResponseTimeHours = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length * 10) / 10
    : 24;

  // Plage de remise acceptée
  const discounts = accepted
    .filter((n) => n.finalPriceUsdCents && n.finalPriceUsdCents > 0)
    .map((n) => Math.round(((n.originalPriceUsdCents - n.finalPriceUsdCents!) / n.originalPriceUsdCents) * 100));
  const sortedDiscounts = discounts.sort((a, b) => a - b);
  const minDiscount = sortedDiscounts[0] ?? 5;
  const maxDiscount = sortedDiscounts[sortedDiscounts.length - 1] ?? 20;

  // Vitesse de conversion
  const conversionSpeed: SellerMemory["conversionSpeed"] =
    avgResponseTimeHours < 4 ? "FAST" : avgResponseTimeHours < 24 ? "MEDIUM" : "SLOW";

  // Catégories les plus flexibles
  const categoryDiscounts = new Map<string, number[]>();
  for (const a of accepted) {
    if (!a.listing?.category || !a.finalPriceUsdCents) continue;
    const d = Math.round(((a.originalPriceUsdCents - a.finalPriceUsdCents) / a.originalPriceUsdCents) * 100);
    const arr = categoryDiscounts.get(a.listing.category) ?? [];
    arr.push(d);
    categoryDiscounts.set(a.listing.category, arr);
  }
  const flexibleCategories = [...categoryDiscounts.entries()]
    .map(([cat, ds]) => ({ cat, avgD: ds.reduce((a, b) => a + b, 0) / ds.length }))
    .sort((a, b) => b.avgD - a.avgD)
    .slice(0, 3)
    .map((c) => c.cat);

  return {
    acceptanceRate,
    avgResponseTimeHours,
    preferredDiscountRange: { min: minDiscount, max: maxDiscount },
    totalNegotiations30d: total,
    totalAccepted30d: accepted.length,
    conversionSpeed,
    flexibleCategories,
  };
}

// ─────────────────────────────────────────────
// Mémoire comportementale acheteur
// ─────────────────────────────────────────────

export interface BuyerMemory {
  seriousnessScore: number;        // 0-100
  totalPurchases: number;
  abandonmentRate: number;         // 0-100
  avgCounterBehavior: "ACCEPTS_FIRST" | "NEGOTIATES_HARD" | "BALANCED";
  priceSensitivity: "LOW" | "MEDIUM" | "HIGH";
  repeatBuyerRate: number;         // 0-100
}

export async function getBuyerMemory(buyerUserId: string): Promise<BuyerMemory> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const [purchases, allNegos, acceptedNegos, abandonedCarts] = await Promise.all([
    prisma.order.count({
      where: { buyerUserId, status: { in: ["DELIVERED", "CONFIRMED", "SHIPPED"] } },
    }),
    prisma.negotiation.count({
      where: { buyerUserId, createdAt: { gte: sixtyDaysAgo } },
    }),
    prisma.negotiation.findMany({
      where: { buyerUserId, status: "ACCEPTED", createdAt: { gte: sixtyDaysAgo } },
      select: { originalPriceUsdCents: true, finalPriceUsdCents: true, offers: { select: { id: true } } },
      take: 100,
    }),
    prisma.cart.count({
      where: { buyerUserId, status: "ABANDONED" },
    }),
  ]);

  const totalCarts = abandonedCarts + purchases;
  const abandonmentRate = totalCarts > 0 ? Math.round((abandonedCarts / totalCarts) * 100) : 0;

  // Behaviour sur les contre-offres
  const avgOffersPerNego = acceptedNegos.length > 0
    ? acceptedNegos.reduce((s, n) => s + n.offers.length, 0) / acceptedNegos.length
    : 1;
  const avgCounterBehavior: BuyerMemory["avgCounterBehavior"] =
    avgOffersPerNego <= 1.2 ? "ACCEPTS_FIRST" : avgOffersPerNego <= 3 ? "BALANCED" : "NEGOTIATES_HARD";

  // Sensibilité prix
  const avgDiscounts = acceptedNegos
    .filter((n) => n.finalPriceUsdCents && n.finalPriceUsdCents > 0)
    .map((n) => ((n.originalPriceUsdCents - n.finalPriceUsdCents!) / n.originalPriceUsdCents) * 100);
  const avgDiscount = avgDiscounts.length > 0
    ? avgDiscounts.reduce((a, b) => a + b, 0) / avgDiscounts.length
    : 10;
  const priceSensitivity: BuyerMemory["priceSensitivity"] =
    avgDiscount >= 20 ? "HIGH" : avgDiscount >= 10 ? "MEDIUM" : "LOW";

  // Sérieux = achats complétés vs total interactions
  const seriousnessScore = Math.min(100, Math.round(
    (purchases > 0 ? 40 : 0) +
    (abandonmentRate < 30 ? 20 : abandonmentRate < 60 ? 10 : 0) +
    (allNegos > 0 ? Math.min(20, purchases / allNegos * 40) : 10) +
    Math.min(20, purchases * 4),
  ));

  // Taux client fidèle (achats avec le même vendeur)
  const repeatBuyers = await prisma.order.groupBy({
    by: ["sellerUserId"],
    where: { buyerUserId, status: { in: ["DELIVERED", "CONFIRMED"] } },
    _count: true,
  });
  const repeatCount = repeatBuyers.filter((r) => r._count > 1).length;
  const repeatBuyerRate = repeatBuyers.length > 0
    ? Math.round((repeatCount / repeatBuyers.length) * 100)
    : 0;

  return {
    seriousnessScore,
    totalPurchases: purchases,
    abandonmentRate,
    avgCounterBehavior,
    priceSensitivity,
    repeatBuyerRate,
  };
}

// ─────────────────────────────────────────────
// Pricing Engine — Analyse historique marché
// ─────────────────────────────────────────────

async function fetchMarketStats(listingId: string, category: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [sameListingAll, sameListingAccepted, sameCategoryAccepted] = await Promise.all([
    // Toutes les négo pour cette annonce
    prisma.negotiation.count({ where: { listingId } }),

    // Négos acceptées pour cette annonce
    prisma.negotiation.findMany({
      where: { listingId, status: "ACCEPTED" },
      select: { originalPriceUsdCents: true, finalPriceUsdCents: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    }),

    // Négos acceptées pour même catégorie (30j)
    prisma.negotiation.findMany({
      where: {
        status: "ACCEPTED",
        createdAt: { gte: thirtyDaysAgo },
        listing: { category },
      },
      select: { originalPriceUsdCents: true, finalPriceUsdCents: true },
      take: 150,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { totalNegoCount: sameListingAll, sameListingAccepted, sameCategoryAccepted };
}

function computeSuccessRate(accepted: number, total: number): number {
  if (total === 0) return 50; // unknown → neutral
  return Math.round((accepted / total) * 100);
}

function computeAverageDiscountPercent(
  pool: Array<{ originalPriceUsdCents: number; finalPriceUsdCents: number | null }>
): number {
  const valid = pool.filter((n) => n.finalPriceUsdCents && n.finalPriceUsdCents > 0);
  if (valid.length === 0) return 15; // default 15% discount
  const discounts = valid.map(
    (n) => ((n.originalPriceUsdCents - n.finalPriceUsdCents!) / n.originalPriceUsdCents) * 100
  );
  return Math.round(discounts.reduce((s, d) => s + d, 0) / discounts.length);
}

// ─────────────────────────────────────────────
// Buyer Hint — Conseil pré-négociation acheteur
// ─────────────────────────────────────────────

export async function getBuyerNegotiationHint(
  listingId: string,
  proposedPriceUsdCents: number
): Promise<BuyerNegotiationHint> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      priceUsdCents: true,
      category: true,
      city: true,
      isNegotiable: true,
      status: true,
      stockQuantity: true,
    },
  });

  if (!listing) throw new HttpError(404, "Annonce introuvable");
  if (!listing.isNegotiable) throw new HttpError(400, "Cette annonce n'est pas négociable");
  if (listing.status !== "ACTIVE") throw new HttpError(400, "Cette annonce n'est plus disponible");

  const { totalNegoCount, sameListingAccepted, sameCategoryAccepted } =
    await fetchMarketStats(listingId, listing.category);

  // Préférence : données annonce > catégorie
  const pool =
    sameListingAccepted.length >= 5 ? sameListingAccepted : sameCategoryAccepted;
  const avgDiscountPercent = computeAverageDiscountPercent(pool);

  const successRate = computeSuccessRate(
    sameListingAccepted.length,
    totalNegoCount
  );

  // ── Enrichissement marché (best-effort) ──
  let enrichmentData: BuyerNegotiationHint["enrichment"] = null;
  let adaptiveFloor = 70; // défaut : 70%
  let adaptiveMaxDiscount = 25; // défaut : cap 25%
  try {
    const enrichment = await getMarketEnrichment(listing.category, listing.city ?? "Kinshasa");
    const thresholds = computeAdaptiveThresholds(enrichment);
    adaptiveFloor = 70 + thresholds.floorAdjustPercent;
    adaptiveMaxDiscount = 25 + thresholds.discountAdjustPercent;
    enrichmentData = {
      marketHeatScore: enrichment.marketHeatScore,
      priceFlexibilityScore: enrichment.priceFlexibilityScore,
      regionalDemandScore: enrichment.regionalDemandScore,
      competitionPressureScore: enrichment.competitionPressureScore,
      confidenceScore: enrichment.confidenceScore,
      sourceType: enrichment.sourceType,
      externalInsight: enrichment.externalData?.insight ?? null,
    };
  } catch { /* enrichment non critique */ }

  // ── Knowledge Base enrichissement (best-effort) ──
  try {
    const blended = await getBlendedInsight(listing.category, "CD", listing.city ?? undefined);
    if (blended && blended.confidence > 40) {
      // Ajuster les seuils avec les données KB
      const kbPriceRatio = listing.priceUsdCents > 0
        ? blended.blendedPrice / listing.priceUsdCents
        : 1;
      // Si le prix KB est nettement inférieur, l'acheteur peut être plus agressif
      if (kbPriceRatio < 0.85) {
        adaptiveMaxDiscount = Math.min(40, adaptiveMaxDiscount + 5);
        adaptiveFloor = Math.max(55, adaptiveFloor - 5);
      }
      // Si le prix KB est supérieur, le vendeur est déjà compétitif
      if (kbPriceRatio > 1.1) {
        adaptiveMaxDiscount = Math.max(10, adaptiveMaxDiscount - 5);
        adaptiveFloor = Math.min(85, adaptiveFloor + 5);
      }
      // Enrichir l'insight avec le facteur saisonnier
      if (blended.seasonalFactor > 1.1 && enrichmentData) {
        enrichmentData.externalInsight =
          (enrichmentData.externalInsight ?? "") +
          ` 📅 Période de forte demande saisonnière (×${blended.seasonalFactor.toFixed(1)}).`;
      }
    }
  } catch { /* KB non critique */ }

  // ── External Intelligence fusion (best-effort) ──
  try {
    const fused = await getFusedIntelligence(listing.category, "CD", listing.city ?? undefined);
    if (fused.confidence > 30) {
      // Ajuster seuils selon score d'opportunité
      if (fused.opportunityScore > 70) {
        // Marché chaud = vendeur en position de force
        adaptiveMaxDiscount = Math.max(10, adaptiveMaxDiscount - 3);
        adaptiveFloor = Math.min(85, adaptiveFloor + 3);
      } else if (fused.opportunityScore < 30) {
        // Marché froid = acheteur peut négocier plus
        adaptiveMaxDiscount = Math.min(35, adaptiveMaxDiscount + 3);
        adaptiveFloor = Math.max(60, adaptiveFloor - 3);
      }
      // Ajuster selon pricingAdjustment
      if (fused.pricingAdjustmentPercent > 5) {
        adaptiveFloor = Math.min(90, adaptiveFloor + 2);
      } else if (fused.pricingAdjustmentPercent < -5) {
        adaptiveFloor = Math.max(55, adaptiveFloor - 2);
      }
      // Enrichir insight avec triggers actifs
      if (fused.activeTriggers.length > 0 && enrichmentData) {
        const triggerSummary = fused.activeTriggers.map((t) => t.explanation).join(" | ");
        enrichmentData.externalInsight =
          (enrichmentData.externalInsight ?? "") + ` 🌍 ${triggerSummary}`;
      }
    }
  } catch { /* external intel non critique */ }

  const originalPrice = listing.priceUsdCents;
  const suggestedDiscount = Math.min(avgDiscountPercent, adaptiveMaxDiscount);
  const suggestedOfferUsdCents = Math.round(originalPrice * (1 - suggestedDiscount / 100));
  const minRealisticOfferUsdCents = Math.round(originalPrice * (adaptiveFloor / 100));

  // Contexte marché
  let marketContext: BuyerNegotiationHint["marketContext"];
  if (pool.length === 0 || totalNegoCount === 0) {
    marketContext = "FIXED";
  } else if (avgDiscountPercent >= 15) {
    marketContext = "FLEXIBLE";
  } else {
    marketContext = "COMPETITIVE";
  }

  // Message suggéré — adapté au contexte marché
  // Si l'acheteur n'a pas encore saisi de prix, on utilise le prix suggéré par l'IA
  // pour éviter l'affichage "0.00$" dans le message.
  const effectivePriceForMessage =
    proposedPriceUsdCents > 0 ? proposedPriceUsdCents : suggestedOfferUsdCents;
  const discount = Math.round(
    ((originalPrice - effectivePriceForMessage) / originalPrice) * 100
  );
  let messageSuggestion: string;
  const isHotMarket = enrichmentData && enrichmentData.marketHeatScore > 60;
  const isFlexible = enrichmentData && enrichmentData.priceFlexibilityScore > 50;

  if (discount <= 5) {
    messageSuggestion = isHotMarket
      ? `Bonjour, cet article m'intéresse beaucoup. Je propose ${(effectivePriceForMessage / 100).toFixed(2)}$ — prêt à finaliser immédiatement.`
      : `Bonjour, je suis très intéressé par cet article. Seriez-vous d'accord pour ${(effectivePriceForMessage / 100).toFixed(2)}$ ? Je suis prêt à conclure rapidement.`;
  } else if (discount <= 15) {
    messageSuggestion = isFlexible
      ? `Bonjour, les prix dans cette catégorie semblent flexibles. Je propose ${(effectivePriceForMessage / 100).toFixed(2)}$ — c'est un prix juste pour les deux parties.`
      : `Bonjour, je vous propose ${(effectivePriceForMessage / 100).toFixed(2)}$ pour cet article. Votre prix est raisonnable mais j'ai quelques contraintes budgétaires.`;
  } else {
    messageSuggestion = isHotMarket
      ? `Bonjour, malgré la forte demande, je propose ${(effectivePriceForMessage / 100).toFixed(2)}$. Acheteur sérieux, paiement rapide garanti.`
      : `Bonjour, je vous propose ${(effectivePriceForMessage / 100).toFixed(2)}$. Je suis sérieux et disponible pour conclure rapidement si vous acceptez.`;
  }

  // Insight contextuel — enrichi avec données marché
  let insight: string;
  if (successRate >= 70) {
    insight = `✅ Ce vendeur accepte souvent les offres — bonne chance de succès.`;
  } else if (successRate >= 40) {
    insight = `⚡ Négociation possible mais compétitive. Proposez un bon premier prix.`;
  } else if (pool.length === 0) {
    insight = `ℹ️ Pas d'historique pour cette annonce. Restez respectueux du prix affiché.`;
  } else {
    insight = `🔒 Peu de négociations acceptées ici. Une offre proche du prix affiché a plus de chances.`;
  }
  // Ajouter contexte marché externe si disponible
  if (enrichmentData?.externalInsight) {
    insight += ` 📊 ${enrichmentData.externalInsight}`;
  }

  return {
    listingId,
    listingTitle: listing.title,
    originalPriceUsdCents: originalPrice,
    suggestedOfferUsdCents,
    minRealisticOfferUsdCents,
    successRate,
    marketContext,
    messageSuggestion,
    insight,
    sampleSize: pool.length,
    enrichment: enrichmentData,
  };
}

// ─────────────────────────────────────────────
// Seller Advisor — Conseil vendeur sur offre reçue
// ─────────────────────────────────────────────

export async function getSellerNegotiationAdvice(
  negotiationId: string,
  sellerUserId: string
): Promise<SellerNegotiationAdvice> {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          priceUsdCents: true,
          category: true,
          city: true,
          stockQuantity: true,
          isNegotiable: true,
        },
      },
      offers: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { priceUsdCents: true, fromUserId: true },
      },
      buyer: {
        select: {
          id: true,
          createdAt: true,
          trustScore: true,
          _count: {
            select: { buyerOrders: true, buyerNegotiations: true },
          },
        },
      },
    },
  });

  if (!negotiation) throw new HttpError(404, "Négociation introuvable");
  if (negotiation.sellerUserId !== sellerUserId) {
    throw new HttpError(403, "Accès refusé");
  }
  if (negotiation.status !== "PENDING") {
    throw new HttpError(400, "Cette négociation n'est plus en attente");
  }

  const originalPrice = negotiation.listing.priceUsdCents;
  const latestOffer = negotiation.offers[0];
  const proposedPrice = latestOffer?.priceUsdCents ?? negotiation.originalPriceUsdCents;

  const discountPercent = Math.round(
    ((originalPrice - proposedPrice) / originalPrice) * 100
  );

  // ── Buyer profile ──
  const buyer = negotiation.buyer;
  const accountAgeDays = buyer
    ? Math.floor((Date.now() - new Date(buyer.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const totalPurchases = buyer?._count?.buyerOrders ?? 0;
  const trustScore = buyer?.trustScore ?? 50;

  let trustLevel: "LOW" | "MEDIUM" | "HIGH";
  if (trustScore >= 70 && totalPurchases >= 3) trustLevel = "HIGH";
  else if (trustScore >= 40 || totalPurchases >= 1) trustLevel = "MEDIUM";
  else trustLevel = "LOW";

  // ── Check historical buyer → seller orders ──
  const previousBuyerToSellerOrders = await prisma.order.count({
    where: {
      buyerUserId: negotiation.buyerUserId,
      sellerUserId,
      status: "DELIVERED",
    },
  });

  // ── Stock urgency ──
  const stock = negotiation.listing.stockQuantity;
  let urgency: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (stock !== null && stock <= 2) urgency = "HIGH";
  else if (stock !== null && stock <= 5) urgency = "MEDIUM";

  // ── Conversion probability ──
  // Base: trust + previousPurchases + discount size
  let conversionProb = 50;
  if (trustLevel === "HIGH") conversionProb += 20;
  if (trustLevel === "LOW") conversionProb -= 15;
  if (previousBuyerToSellerOrders >= 1) conversionProb += 15;
  if (accountAgeDays >= 30) conversionProb += 5;
  if (discountPercent <= 10) conversionProb += 10; // small discount → easy to accept
  if (discountPercent >= 30) conversionProb -= 20; // big discount → risky

  // ── Enrichissement marché (best-effort) ──
  let sellerEnrichment: SellerNegotiationAdvice["enrichment"] = null;
  let counterHighPercent = 92; // défaut : counter à -8%
  let counterLowPercent = 85;  // défaut : counter à -15%
  let enrichmentRaw: MarketEnrichment | null = null;
  try {
    enrichmentRaw = await getMarketEnrichment(
      negotiation.listing.category,
      negotiation.listing.city ?? "Kinshasa",
    );
    const thresholds = computeAdaptiveThresholds(enrichmentRaw);
    counterHighPercent = thresholds.adaptiveCounterPercent;
    counterLowPercent = Math.max(75, counterHighPercent - 8);
    // Marché chaud → conversion plus probable
    if (enrichmentRaw.marketHeatScore > 60) conversionProb += 5;
    // Compétition forte → accepter plus facilement
    if (enrichmentRaw.competitionPressureScore > 70) conversionProb += 5;
    sellerEnrichment = {
      marketHeatScore: enrichmentRaw.marketHeatScore,
      competitionPressureScore: enrichmentRaw.competitionPressureScore,
      adaptiveCounterPercent: counterHighPercent,
      confidenceScore: enrichmentRaw.confidenceScore,
      sourceType: enrichmentRaw.sourceType,
      externalInsight: enrichmentRaw.externalData?.insight ?? null,
    };
  } catch { /* enrichment non critique */ }

  // ── Posture de négociation ──
  let posture: NegotiationPosture | null = null;
  try {
    const postureResult = await computeNegotiationPosture(
      negotiation.listing.id,
      sellerUserId,
      negotiation.listing.category,
      negotiation.listing.city ?? "Kinshasa",
      negotiation.listing.stockQuantity,
      enrichmentRaw,
    );
    posture = postureResult.posture;

    // La posture influence la décision
    if (posture === "LIQUIDATION") {
      counterHighPercent = Math.max(75, counterHighPercent - 5);
      counterLowPercent = Math.max(70, counterLowPercent - 5);
      conversionProb += 10;
    } else if (posture === "FIRM") {
      counterHighPercent = Math.min(97, counterHighPercent + 3);
      conversionProb -= 5;
    }
  } catch { /* posture non critique */ }

  conversionProb = Math.min(95, Math.max(10, conversionProb));

  // ── Recommendation — seuils adaptatifs ──
  let recommendation: SellerNegotiationAdvice["recommendation"];
  let counterSuggestionUsdCents: number | null = null;
  let insight: string;

  if (discountPercent <= 10 && trustLevel !== "LOW") {
    recommendation = "ACCEPT";
    insight = `✅ Faible remise (${discountPercent}%) + acheteur fiable. Accepter maintenant maximise la conversion.`;
  } else if (discountPercent <= 20) {
    recommendation = "COUNTER";
    counterSuggestionUsdCents = Math.round(originalPrice * (counterHighPercent / 100));
    insight = `⚡ Remise modérée (${discountPercent}%). Proposez ${(counterSuggestionUsdCents / 100).toFixed(2)}$ comme compromis (${100 - counterHighPercent}% de remise).`;
  } else if (discountPercent <= 30 && trustLevel === "HIGH") {
    recommendation = "COUNTER";
    counterSuggestionUsdCents = Math.round(originalPrice * (counterLowPercent / 100));
    insight = `🤝 Acheteur de confiance mais remise élevée (${discountPercent}%). Contre-proposez ${(counterSuggestionUsdCents / 100).toFixed(2)}$.`;
  } else if (urgency === "HIGH") {
    // Stock bas → accepter même à prix plus bas
    recommendation = "ACCEPT";
    insight = `📦 Stock critique (${stock} restants). Accepter maintenant évite de garder le stock.`;
  } else {
    recommendation = "REFUSE";
    insight = `🚫 Remise trop élevée (${discountPercent}%) avec acheteur peu fiable. Refuser protège votre marge.`;
  }
  // Ajouter contexte marché externe
  if (sellerEnrichment?.externalInsight) {
    insight += ` 📊 ${sellerEnrichment.externalInsight}`;
  }

  return {
    negotiationId,
    recommendation,
    counterSuggestionUsdCents,
    conversionProbability: conversionProb,
    marginImpact: {
      originalPriceUsdCents: originalPrice,
      proposedPriceUsdCents: proposedPrice,
      discountPercent,
    },
    buyerProfile: {
      trustLevel,
      previousPurchases: totalPurchases,
      isRepeatBuyer: previousBuyerToSellerOrders >= 1,
    },
    insight,
    urgency,
    posture,
    enrichment: sellerEnrichment,
  };
}

// ─────────────────────────────────────────────
// Auto-Negotiation — Réponse automatique IA vendeur
// ─────────────────────────────────────────────

export async function autoRespondToNegotiation(
  negotiationId: string,
  sellerUserId: string,
  rules: AutoNegotiationRules
): Promise<{ action: "ACCEPT" | "COUNTER" | "REFUSE"; counterPriceUsdCents?: number; reason: string }> {
  if (!rules.enabled) {
    return { action: "REFUSE", reason: "Auto-négociation désactivée" };
  }

  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    include: {
      listing: { select: { priceUsdCents: true, stockQuantity: true } },
      offers: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!negotiation || negotiation.sellerUserId !== sellerUserId) {
    throw new HttpError(404, "Négociation introuvable");
  }

  const originalPrice = negotiation.listing.priceUsdCents;
  const proposedPrice = negotiation.offers[0]?.priceUsdCents ?? negotiation.originalPriceUsdCents;
  const proposedPercent = (proposedPrice / originalPrice) * 100;
  const floorPercent = rules.minFloorPercent;
  const autoAcceptThreshold = 100 - rules.maxAutoDiscountPercent; // ex: 80%

  if (proposedPercent >= autoAcceptThreshold) {
    return {
      action: "ACCEPT",
      reason: `Prix acceptable (${Math.round(100 - proposedPercent)}% de remise ≤ seuil auto ${rules.maxAutoDiscountPercent}%)`,
    };
  }

  if (proposedPercent >= floorPercent) {
    const counterPrice = Math.round(
      originalPrice * (rules.preferredCounterPercent / 100)
    );
    return {
      action: "COUNTER",
      counterPriceUsdCents: counterPrice,
      reason: `Contre-proposition IA à ${rules.preferredCounterPercent}% du prix original`,
    };
  }

  return {
    action: "REFUSE",
    reason: `Prix proposé (${Math.round(proposedPercent)}%) inférieur au plancher (${floorPercent}%)`,
  };
}

// ─────────────────────────────────────────────
// Batch Auto-Negotiate — Moteur autonome
// ─────────────────────────────────────────────

export interface BatchAutoResult {
  processed: number;
  accepted: number;
  countered: number;
  refused: number;
  errors: number;
}

/**
 * Traite automatiquement toutes les négociations en attente
 * dont le vendeur a activé l'auto-négociation via AiAgent config.
 * Appelé par le scheduler d'autonomie.
 */
export async function runBatchAutoNegotiation(): Promise<BatchAutoResult> {
  const result: BatchAutoResult = { processed: 0, accepted: 0, countered: 0, refused: 0, errors: 0 };

  // Récupérer les négociations PENDING de plus de 2h (laisser le temps au vendeur de répondre manuellement)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const pendingNegos = await prisma.negotiation.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: twoHoursAgo },
      expiresAt: { gt: new Date() },
    },
    include: {
      listing: { select: { priceUsdCents: true, stockQuantity: true, category: true, isNegotiable: true } },
      offers: { orderBy: { createdAt: "desc" }, take: 1 },
      seller: { select: { id: true, trustScore: true } },
      buyer: { select: { id: true, trustScore: true, _count: { select: { buyerOrders: true } } } },
    },
    take: 100,
  });

  // Récupérer la config IA Marchand
  const agentConfig = await prisma.aiAgent.findFirst({
    where: { name: "IA_MARCHAND", enabled: true },
  });
  if (!agentConfig) return result;

  const config = (agentConfig.config ?? {}) as Record<string, unknown>;
  const autoEnabled = config.autoNegotiationEnabled !== false;
  if (!autoEnabled) return result;

  // Réinitialiser le cache abonnements pour ce cycle batch
  clearSubscriptionCache();

  // Règles par défaut (si pas de config vendeur spécifique)
  const defaultRules: AutoNegotiationRules = {
    enabled: true,
    minFloorPercent: (config.minFloorPercent as number) ?? 70,
    maxAutoDiscountPercent: (config.maxAutoDiscountPercent as number) ?? 20,
    preferredCounterPercent: (config.preferredCounterPercent as number) ?? 90,
    prioritizeSpeed: (config.prioritizeSpeed as boolean) ?? false,
    stockUrgencyBoost: true,
  };

  // Pré-charger l'enrichissement par catégorie (cache Redis, une seule requête par catégorie)
  const enrichmentCache = new Map<string, Awaited<ReturnType<typeof getMarketEnrichment>>>();

  for (const nego of pendingNegos) {
    if (!nego.listing.isNegotiable) continue;

    // ── Vérifier que le vendeur a accès IA_MERCHANT_AUTO (plan payant ou addon) ──
    if (!(await checkIaAccessOrLog(nego.sellerUserId, "IA_MERCHANT_AUTO", "runBatchAutoNegotiation"))) continue;

    try {
      // Ajustement dynamique des règles selon le contexte
      const dynamicRules = { ...defaultRules };

      // ── Enrichissement marché adaptatif ──
      let catEnrichment = enrichmentCache.get(nego.listing.category);
      if (!catEnrichment) {
        try {
          catEnrichment = await getMarketEnrichment(nego.listing.category);
          enrichmentCache.set(nego.listing.category, catEnrichment);
        } catch { /* pas critique */ }
      }
      if (catEnrichment) {
        const thresholds = computeAdaptiveThresholds(catEnrichment);
        dynamicRules.minFloorPercent = Math.max(55, dynamicRules.minFloorPercent + thresholds.floorAdjustPercent);
        dynamicRules.maxAutoDiscountPercent = Math.min(35, dynamicRules.maxAutoDiscountPercent + thresholds.discountAdjustPercent);
        dynamicRules.preferredCounterPercent = thresholds.adaptiveCounterPercent;
      }

      // Si stock bas → accepter plus facilement
      if (dynamicRules.stockUrgencyBoost && nego.listing.stockQuantity !== null && nego.listing.stockQuantity <= 3) {
        dynamicRules.maxAutoDiscountPercent = Math.min(35, dynamicRules.maxAutoDiscountPercent + 10);
        dynamicRules.minFloorPercent = Math.max(55, dynamicRules.minFloorPercent - 10);
      }

      // Acheteur fiable → accepter plus facilement
      const buyerTrust = nego.buyer.trustScore ?? 50;
      const buyerOrders = nego.buyer._count.buyerOrders;
      if (buyerTrust >= 70 && buyerOrders >= 3) {
        dynamicRules.maxAutoDiscountPercent = Math.min(30, dynamicRules.maxAutoDiscountPercent + 5);
      }

      // ── Posture de négociation → influence les seuils ──
      try {
        const postureResult = await computeNegotiationPosture(
          nego.listingId,
          nego.sellerUserId,
          nego.listing.category,
          "Kinshasa",
          nego.listing.stockQuantity,
          catEnrichment ?? null,
        );
        if (postureResult.posture === "LIQUIDATION") {
          dynamicRules.maxAutoDiscountPercent = Math.min(40, dynamicRules.maxAutoDiscountPercent + 10);
          dynamicRules.minFloorPercent = Math.max(50, dynamicRules.minFloorPercent - 10);
        } else if (postureResult.posture === "FLEXIBLE") {
          dynamicRules.maxAutoDiscountPercent = Math.min(35, dynamicRules.maxAutoDiscountPercent + 5);
        } else if (postureResult.posture === "FIRM") {
          dynamicRules.maxAutoDiscountPercent = Math.max(10, dynamicRules.maxAutoDiscountPercent - 5);
          dynamicRules.preferredCounterPercent = Math.min(97, dynamicRules.preferredCounterPercent + 3);
        }
      } catch { /* posture non critique */ }

      // Catégorie compétitive → contre-proposer plutôt que refuser (fallback si pas d'enrichissement)
      if (!catEnrichment) {
        const competitorsCount = await prisma.listing.count({
          where: { category: nego.listing.category, status: "ACTIVE" },
        });
        if (competitorsCount > 20) {
          dynamicRules.preferredCounterPercent = Math.max(80, dynamicRules.preferredCounterPercent - 5);
        }
      }

      const decision = await autoRespondToNegotiation(nego.id, nego.sellerUserId, dynamicRules);
      result.processed++;

      // Appliquer la décision
      if (decision.action === "ACCEPT") {
        const finalPrice = nego.offers[0]?.priceUsdCents ?? nego.originalPriceUsdCents;
        await prisma.negotiation.update({
          where: { id: nego.id },
          data: { status: "ACCEPTED", finalPriceUsdCents: finalPrice, resolvedAt: new Date() },
        });
        result.accepted++;
      } else if (decision.action === "COUNTER" && decision.counterPriceUsdCents) {
        await prisma.negotiationOffer.create({
          data: {
            negotiationId: nego.id,
            fromUserId: nego.sellerUserId,
            priceUsdCents: decision.counterPriceUsdCents,
            message: `[IA Marchand] Contre-proposition automatique`,
          },
        });
        await prisma.negotiation.update({
          where: { id: nego.id },
          data: { status: "COUNTERED" },
        });
        result.countered++;
      } else {
        await prisma.negotiation.update({
          where: { id: nego.id },
          data: { status: "REFUSED", resolvedAt: new Date() },
        });
        result.refused++;
      }

      // Log autonome
      await prisma.aiAutonomyLog.create({
        data: {
          agentName: "IA_MARCHAND",
          actionType: "AUTO_NEGOTIATE",
          targetId: nego.id,
          targetUserId: nego.sellerUserId,
          decision: decision.action,
          reasoning: decision.reason,
          success: true,
          metadata: {
            counterPrice: decision.counterPriceUsdCents,
            buyerTrust,
            stockQty: nego.listing.stockQuantity,
            enrichmentTier: catEnrichment?.geminiDecision?.tier ?? "NONE",
            enrichmentReason: catEnrichment?.geminiDecision?.reason ?? null,
            enrichmentSource: catEnrichment?.sourceType ?? "NONE",
          },
        },
      });

      // ── Notification push vendeur ──
      const offerPrice = nego.offers[0]?.priceUsdCents ?? 0;
      const originalPrice = nego.listing.priceUsdCents;
      const pctOffer = originalPrice > 0 ? Math.round((offerPrice / originalPrice) * 100) : 0;
      if (decision.action === "ACCEPT") {
        void sendPushToUser(nego.sellerUserId, {
          title: "🤝 Marchandage accepté automatiquement",
          body: `L'IA a accepté une offre à ${pctOffer}% du prix. La commande peut suivre.`,
          tag: `ia-nego-${nego.id}`,
          data: { type: "IA_NEGOTIATE", negotiationId: nego.id, action: "ACCEPT" },
        }).catch(() => {});
      } else if (decision.action === "COUNTER") {
        const counterAmt = decision.counterPriceUsdCents ? (decision.counterPriceUsdCents / 100).toFixed(2) : "?";
        void sendPushToUser(nego.sellerUserId, {
          title: "💬 Contre-proposition IA envoyée",
          body: `L'IA a proposé ${counterAmt}$ à l'acheteur. Vous pouvez intervenir si besoin.`,
          tag: `ia-nego-${nego.id}`,
          data: { type: "IA_NEGOTIATE", negotiationId: nego.id, action: "COUNTER" },
        }).catch(() => {});
      } else {
        void sendPushToUser(nego.sellerUserId, {
          title: "❌ Offre refusée automatiquement",
          body: `L'offre à ${pctOffer}% du prix a été refusée par l'IA (en dessous du seuil).`,
          tag: `ia-nego-${nego.id}`,
          data: { type: "IA_NEGOTIATE", negotiationId: nego.id, action: "REFUSE" },
        }).catch(() => {});
      }
    } catch {
      result.errors++;
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Dynamic Market Intelligence
// ─────────────────────────────────────────────

export interface MarketIntelligence {
  category: string;
  avgDiscountAccepted: number;
  totalActiveListings: number;
  totalActiveSellers: number;
  demandSignal: "LOW" | "MEDIUM" | "HIGH";
  recommendedFloor: number;
  competitionLevel: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * Analyse l'intelligence marché pour une catégorie donnée.
 * Utilisé pour ajuster dynamiquement les règles de négociation.
 */
export async function getCategoryMarketIntelligence(category: string): Promise<MarketIntelligence> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeListings,
    sellers,
    acceptedNegos,
    totalNegos,
  ] = await Promise.all([
    prisma.listing.count({ where: { category, status: "ACTIVE" } }),
    prisma.listing.groupBy({
      by: ["ownerUserId"],
      where: { category, status: "ACTIVE" },
    }),
    prisma.negotiation.findMany({
      where: { listing: { category }, status: "ACCEPTED", createdAt: { gte: thirtyDaysAgo } },
      select: { originalPriceUsdCents: true, finalPriceUsdCents: true },
      take: 200,
    }),
    prisma.negotiation.count({
      where: { listing: { category }, createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const avgDiscount = acceptedNegos.length > 0
    ? Math.round(
        acceptedNegos
          .filter((n) => n.finalPriceUsdCents)
          .reduce((s, n) => s + ((n.originalPriceUsdCents - n.finalPriceUsdCents!) / n.originalPriceUsdCents) * 100, 0) /
        Math.max(1, acceptedNegos.filter((n) => n.finalPriceUsdCents).length),
      )
    : 15;

  const competitionLevel: MarketIntelligence["competitionLevel"] =
    sellers.length >= 20 ? "HIGH" : sellers.length >= 8 ? "MEDIUM" : "LOW";

  // DemandSignal unifié via market-shared (ratio négociations/listings)
  const demandData = await getMarketDemand(category);
  const demandSignal = demandData.demandLevel;

  const recommendedFloor = demandSignal === "HIGH" ? 85 : demandSignal === "MEDIUM" ? 75 : 65;

  return {
    category,
    avgDiscountAccepted: avgDiscount,
    totalActiveListings: activeListings,
    totalActiveSellers: sellers.length,
    demandSignal,
    recommendedFloor,
    competitionLevel,
  };
}
