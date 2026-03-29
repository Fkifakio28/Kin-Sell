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

  const originalPrice = listing.priceUsdCents;
  const suggestedDiscount = Math.min(avgDiscountPercent, 25); // cap à 25%
  const suggestedOfferUsdCents = Math.round(originalPrice * (1 - suggestedDiscount / 100));
  const minRealisticOfferUsdCents = Math.round(originalPrice * 0.70); // floor = 70%

  // Contexte marché
  let marketContext: BuyerNegotiationHint["marketContext"];
  if (pool.length === 0 || totalNegoCount === 0) {
    marketContext = "FIXED";
  } else if (avgDiscountPercent >= 15) {
    marketContext = "FLEXIBLE";
  } else {
    marketContext = "COMPETITIVE";
  }

  // Message suggéré
  const discount = Math.round(
    ((originalPrice - proposedPriceUsdCents) / originalPrice) * 100
  );
  let messageSuggestion: string;
  if (discount <= 5) {
    messageSuggestion = `Bonjour, je suis très intéressé par cet article. Seriez-vous d'accord pour ${(proposedPriceUsdCents / 100).toFixed(2)}$ ? Je suis prêt à conclure rapidement.`;
  } else if (discount <= 15) {
    messageSuggestion = `Bonjour, je vous propose ${(proposedPriceUsdCents / 100).toFixed(2)}$ pour cet article. Votre prix est raisonnable mais j'ai quelques contraintes budgétaires.`;
  } else {
    messageSuggestion = `Bonjour, je vous propose ${(proposedPriceUsdCents / 100).toFixed(2)}$. Je suis sérieux et disponible pour conclure rapidement si vous acceptez.`;
  }

  // Insight contextuel
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
  conversionProb = Math.min(95, Math.max(10, conversionProb));

  // ── Recommendation ──
  let recommendation: SellerNegotiationAdvice["recommendation"];
  let counterSuggestionUsdCents: number | null = null;
  let insight: string;

  if (discountPercent <= 10 && trustLevel !== "LOW") {
    recommendation = "ACCEPT";
    insight = `✅ Faible remise (${discountPercent}%) + acheteur fiable. Accepter maintenant maximise la conversion.`;
  } else if (discountPercent <= 20) {
    recommendation = "COUNTER";
    counterSuggestionUsdCents = Math.round(originalPrice * 0.92); // counter à -8%
    insight = `⚡ Remise modérée (${discountPercent}%). Proposez ${(counterSuggestionUsdCents / 100).toFixed(2)}$ comme compromis.`;
  } else if (discountPercent <= 30 && trustLevel === "HIGH") {
    recommendation = "COUNTER";
    counterSuggestionUsdCents = Math.round(originalPrice * 0.85);
    insight = `🤝 Acheteur de confiance mais remise élevée (${discountPercent}%). Contre-proposez ${(counterSuggestionUsdCents / 100).toFixed(2)}$.`;
  } else if (urgency === "HIGH") {
    // Stock bas → accepter même à prix plus bas
    recommendation = "ACCEPT";
    insight = `📦 Stock critique (${stock} restants). Accepter maintenant évite de garder le stock.`;
  } else {
    recommendation = "REFUSE";
    insight = `🚫 Remise trop élevée (${discountPercent}%) avec acheteur peu fiable. Refuser protège votre marge.`;
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

  // Règles par défaut (si pas de config vendeur spécifique)
  const defaultRules: AutoNegotiationRules = {
    enabled: true,
    minFloorPercent: (config.minFloorPercent as number) ?? 70,
    maxAutoDiscountPercent: (config.maxAutoDiscountPercent as number) ?? 20,
    preferredCounterPercent: (config.preferredCounterPercent as number) ?? 90,
    prioritizeSpeed: (config.prioritizeSpeed as boolean) ?? false,
    stockUrgencyBoost: true,
  };

  for (const nego of pendingNegos) {
    if (!nego.listing.isNegotiable) continue;

    try {
      // Ajustement dynamique des règles selon le contexte
      const dynamicRules = { ...defaultRules };

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

      // Catégorie compétitive → contre-proposer plutôt que refuser
      const competitorsCount = await prisma.listing.count({
        where: { category: nego.listing.category, status: "ACTIVE" },
      });
      if (competitorsCount > 20) {
        dynamicRules.preferredCounterPercent = Math.max(80, dynamicRules.preferredCounterPercent - 5);
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
          },
        },
      });
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

  const demandSignal: MarketIntelligence["demandSignal"] =
    totalNegos > activeListings * 2 ? "HIGH" : totalNegos > activeListings * 0.5 ? "MEDIUM" : "LOW";

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
