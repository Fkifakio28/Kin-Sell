/**
 * IA COMMANDE — Order AI Engine (V2 Enhanced)
 *
 * 6 moteurs :
 * - Checkout Advisor    : bundle suggestions, discount triggers, urgency signals
 * - Abandonment Engine  : détection panier abandonné, relance intelligente
 * - Auto-Validation     : décision d'auto-validation pour commandes simples
 * - Delivery Intelligence : estimation livraison, instructions optimisées
 * - Batch Recovery      : récupération automatique des paniers abandonnés
 * - Order Anomaly       : détection d'anomalies dans les commandes
 */

import { CartStatus } from "../../shared/db/prisma-enums.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  getMarketEnrichment,
  computeAdaptiveThresholds,
} from "../../shared/market/market-enrichment.service.js";
import {
  checkIaAccessOrLog,
  clearSubscriptionCache,
} from "../../shared/billing/subscription-guard.js";
import { sendPushToUser } from "../notifications/push.service.js";
import { getBlendedInsight, getTradeRoutes } from "../knowledge-base/knowledge-base.service.js";
import { getFusedIntelligence } from "../external-intel/external-intelligence-fusion.service.js";

// ─────────────────────────────────────────────
// Checkout Advisor
// ─────────────────────────────────────────────

export interface CheckoutAdvice {
  cartId: string;
  bundleSuggestions: Array<{
    listingId: string;
    title: string;
    priceUsdCents: number;
    reason: string;
  }>;
  discountTrigger: {
    available: boolean;
    thresholdUsdCents: number;      // montant à atteindre pour déclencher
    currentTotalUsdCents: number;
    savingsPercent: number;
    message: string | null;
  };
  urgencySignals: Array<{
    listingId: string;
    title: string;
    signal: "LOW_STOCK" | "PRICE_INCREASE" | "HIGH_DEMAND";
    message: string;
  }>;
  paymentOptimization: string;
  estimatedDeliveryHours: { min: number; max: number } | null;
}

export async function getCheckoutAdvice(
  cartId: string,
  userId: string
): Promise<CheckoutAdvice> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
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
              ownerUserId: true,
            },
          },
        },
      },
    },
  });

  if (!cart) throw new HttpError(404, "Panier introuvable");
  if (cart.buyerUserId !== userId) throw new HttpError(403, "Accès refusé");
  if (cart.items.length === 0) throw new HttpError(400, "Panier vide");

  const currentTotalUsdCents = cart.items.reduce(
    (s, i) => s + i.unitPriceUsdCents * i.quantity,
    0
  );

  const categories = [...new Set(cart.items.map((i) => i.listing?.category ?? "").filter(Boolean))];
  const cities = [...new Set(cart.items.map((i) => i.listing?.city ?? "").filter(Boolean))];

  // ── Bundle suggestions (produits complémentaires) ──
  const bundleSuggestions: CheckoutAdvice["bundleSuggestions"] = [];
  if (categories.length > 0) {
    const related = await prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        category: { in: categories },
        id: { notIn: cart.items.map((i) => i.listingId!).filter(Boolean) as string[] },
        city: cities.length > 0 ? { in: cities } : undefined,
        priceUsdCents: { gt: 0, lte: Math.round(currentTotalUsdCents * 0.3) }, // max 30% du panier
      },
      select: { id: true, title: true, priceUsdCents: true, category: true },
      take: 3,
      orderBy: { priceUsdCents: "asc" },
    });

    for (const r of related) {
      bundleSuggestions.push({
        listingId: r.id,
        title: r.title,
        priceUsdCents: r.priceUsdCents,
        reason: `Complète votre achat dans "${r.category}"`,
      });
    }
  }

  // ── Discount trigger ──
  const discountThreshold = currentTotalUsdCents < 5000
    ? 5000
    : currentTotalUsdCents < 10000
    ? 10000
    : 20000; // seuils : $50, $100, $200

  const savingsPercent = discountThreshold <= 5000 ? 5 : discountThreshold <= 10000 ? 8 : 10;

  const discountTrigger: CheckoutAdvice["discountTrigger"] = {
    available: currentTotalUsdCents >= discountThreshold * 0.8,
    thresholdUsdCents: discountThreshold,
    currentTotalUsdCents,
    savingsPercent,
    message:
      currentTotalUsdCents < discountThreshold
        ? `Ajoutez ${((discountThreshold - currentTotalUsdCents) / 100).toFixed(2)}$ de plus pour économiser ${savingsPercent}%`
        : `Vous êtes éligible à une remise de ${savingsPercent}% !`,
  };

  // ── Urgency signals ──
  const urgencySignals: CheckoutAdvice["urgencySignals"] = [];
  for (const item of cart.items) {
    const l = item.listing;
    if (!l) continue;
    if (l.stockQuantity !== null && l.stockQuantity <= 2) {
      urgencySignals.push({
        listingId: l.id,
        title: l.title,
        signal: "LOW_STOCK",
        message: `Plus que ${l.stockQuantity} en stock — commandez vite !`,
      });
    }
    // High demand : annonce avec beaucoup de négos actives
    const activeNegoCount = await prisma.negotiation.count({
      where: { listingId: l.id, status: "PENDING" },
    });
    if (activeNegoCount >= 3) {
      urgencySignals.push({
        listingId: l.id,
        title: l.title,
        signal: "HIGH_DEMAND",
        message: `${activeNegoCount} acheteurs s'intéressent à cet article en ce moment`,
      });
    }
  }

  // ── Payment optimization ──
  const paymentOptimization =
    currentTotalUsdCents >= 10000
      ? "Pour les achats > $100, un virement bancaire peut vous éviter les frais PayPal."
      : "PayPal est recommandé pour ce montant — rapide et sécurisé.";

  // ── Delivery estimate (basé sur ville commune + KB trade routes) ──
  const sameCityItems = cart.items.filter(
    (i) => i.listing?.city?.toLowerCase() === cities[0]?.toLowerCase()
  );
  let estimatedDeliveryHours: { min: number; max: number } | null;
  if (sameCityItems.length === cart.items.length) {
    estimatedDeliveryHours = { min: 2, max: 24 }; // même ville
  } else {
    estimatedDeliveryHours = { min: 24, max: 72 };
    // Enrichir avec les routes commerciales KB si inter-villes
    try {
      const tradeRoutes = await getTradeRoutes("CD", "BOTH");
      const relevantRoute = tradeRoutes.find(
        (r) =>
          cities.some((c) => c.toLowerCase() === r.sourceCity.toLowerCase()) ||
          cities.some((c) => c.toLowerCase() === r.destCity.toLowerCase()),
      );
      if (relevantRoute) {
        estimatedDeliveryHours = {
          min: Math.max(2, relevantRoute.avgTransitDays * 12),
          max: relevantRoute.avgTransitDays * 24 + 24,
        };
      }
    } catch { /* KB non critique */ }
  }

  // ── KB-enriched payment optimization ──
  let paymentOptimizationKb = paymentOptimization;
  try {
    if (categories.length > 0) {
      const blended = await getBlendedInsight(categories[0], "CD", cities[0]);
      if (blended && blended.seasonalFactor > 1.15) {
        paymentOptimizationKb += ` 📅 Période de forte demande — pour garantir vos articles, commandez rapidement.`;
      }
    }
  } catch { /* KB non critique */ }

  // ── External Intelligence enrichment (best-effort) ──
  let externalInsight: string | null = null;
  try {
    if (categories.length > 0) {
      const fused = await getFusedIntelligence(categories[0], "CD", cities[0]);
      if (fused.confidence > 25) {
        // Ajouter urgence si triggers saisonniers actifs
        const seasonalTriggers = fused.activeTriggers.filter((t) =>
          ["SEASONAL_SCHOOL_PEAK", "RELIGIOUS_EVENT_SPIKE", "TOURISM_WINDOW_PROMO"].includes(t.trigger),
        );
        if (seasonalTriggers.length > 0 && cart.items[0]?.listing) {
          urgencySignals.push({
            listingId: cart.items[0].listing.id,
            title: cart.items[0].listing.title,
            signal: "HIGH_DEMAND",
            message: `🌍 ${seasonalTriggers[0].explanation}`,
          });
        }
        // Ajuster livraison si weather trigger
        const weatherTrigger = fused.activeTriggers.find((t) => t.trigger === "RAINY_SEASON_SERVICE_SURGE");
        if (weatherTrigger && estimatedDeliveryHours) {
          estimatedDeliveryHours.max = Math.round(estimatedDeliveryHours.max * 1.3);
          paymentOptimizationKb += " ⛈️ Saison des pluies — délais livraison possiblement allongés.";
        }
        // Currency shock warning
        const fxTrigger = fused.activeTriggers.find((t) => t.trigger === "CURRENCY_SHOCK_REPRICING");
        if (fxTrigger) {
          paymentOptimizationKb += ` 💱 ${fxTrigger.explanation}`;
        }
        externalInsight = fused.explanation;
      }
    }
  } catch { /* external intel non critique */ }

  return {
    cartId,
    bundleSuggestions,
    discountTrigger,
    urgencySignals,
    paymentOptimization: paymentOptimizationKb,
    estimatedDeliveryHours,
  };
}

// ─────────────────────────────────────────────
// Abandonment Engine
// ─────────────────────────────────────────────

export interface AbandonmentRiskReport {
  userId: string;
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH";
  cartId: string | null;
  cartTotalUsdCents: number;
  inactiveSinceHours: number;
  itemCount: number;
  recoveryMessage: string | null;
  suggestedAction: "NONE" | "SEND_REMINDER" | "OFFER_DISCOUNT" | "URGENT_ALERT";
}

export async function detectAbandonmentRisk(userId: string): Promise<AbandonmentRiskReport> {
  type CartWithItems = Prisma.CartGetPayload<{ include: { items: true } }>;
  const activeCart: CartWithItems | null = await prisma.cart.findFirst({
    where: { buyerUserId: userId, status: CartStatus.OPEN },
    include: { items: { select: { id: true, unitPriceUsdCents: true, quantity: true } } },
    orderBy: { updatedAt: "desc" },
  }) as CartWithItems | null;

  if (!activeCart || activeCart.items.length === 0) {
    return {
      userId,
      riskLevel: "NONE",
      cartId: null,
      cartTotalUsdCents: 0,
      inactiveSinceHours: 0,
      itemCount: 0,
      recoveryMessage: null,
      suggestedAction: "NONE",
    };
  }

  const inactiveSinceMs = Date.now() - new Date(activeCart.updatedAt).getTime();
  const inactiveSinceHours = Math.floor(inactiveSinceMs / (1000 * 60 * 60));
  const cartTotal = activeCart.items.reduce(
    (s, i) => s + i.unitPriceUsdCents * i.quantity,
    0
  );
  const itemCount = activeCart.items.length;

  let riskLevel: AbandonmentRiskReport["riskLevel"];
  let suggestedAction: AbandonmentRiskReport["suggestedAction"];
  let recoveryMessage: string | null = null;

  if (inactiveSinceHours < 1) {
    riskLevel = "NONE";
    suggestedAction = "NONE";
  } else if (inactiveSinceHours < 6) {
    riskLevel = "LOW";
    suggestedAction = "NONE";
  } else if (inactiveSinceHours < 24) {
    riskLevel = "MEDIUM";
    suggestedAction = "SEND_REMINDER";
    recoveryMessage = `Vous avez ${itemCount} article${itemCount > 1 ? "s" : ""} dans votre panier. Ils vous attendent !`;
  } else if (inactiveSinceHours < 72) {
    riskLevel = "HIGH";
    suggestedAction = "OFFER_DISCOUNT";
    recoveryMessage = `Votre panier de ${(cartTotal / 100).toFixed(2)}$ est toujours disponible. Finalisez votre commande maintenant.`;
  } else {
    riskLevel = "HIGH";
    suggestedAction = "URGENT_ALERT";
    recoveryMessage = `⚠️ Certains articles de votre panier pourraient ne plus être disponibles. Commandez vite !`;
  }

  return {
    userId,
    riskLevel,
    cartId: activeCart.id,
    cartTotalUsdCents: cartTotal,
    inactiveSinceHours,
    itemCount,
    recoveryMessage,
    suggestedAction,
  };
}

// ─────────────────────────────────────────────
// Auto-Validation Engine
// ─────────────────────────────────────────────

export interface AutoValidationDecision {
  orderId: string;
  canAutoValidate: boolean;
  trustScore: number;
  validationCode: string | null;
  reasoning: string[];
  blockers: string[];
  /** Seuils adaptatifs utilisés (si enrichissement disponible) */
  adaptiveThresholds: {
    trustThreshold: number;
    amountThresholdCents: number;
    source: "ADAPTIVE" | "DEFAULT";
  } | null;
}

export async function getOrderAutoValidationDecision(
  orderId: string
): Promise<AutoValidationDecision> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: {
        select: {
          id: true,
          trustScore: true,
          createdAt: true,
          _count: { select: { buyerOrders: true } },
        },
      },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPriceUsdCents: true,
          listing: {
            select: {
              id: true,
              type: true,
              stockQuantity: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!order) throw new HttpError(404, "Commande introuvable");

  const reasoning: string[] = [];
  const blockers: string[] = [];

  // ── Enrichissement marché pour seuils adaptatifs ──
  let trustThreshold = 70;
  let amountThresholdCents = 20000;
  let thresholdSource: "ADAPTIVE" | "DEFAULT" = "DEFAULT";
  try {
    const categories = order.items
      .map((i) => i.listing?.type ?? "")
      .filter(Boolean);
    if (categories.length > 0) {
      const enrichment = await getMarketEnrichment(categories[0]);
      const adaptive = computeAdaptiveThresholds(enrichment);
      trustThreshold = adaptive.adaptiveTrustThreshold;
      amountThresholdCents = adaptive.adaptiveAmountThresholdCents;
      thresholdSource = "ADAPTIVE";
    }
  } catch { /* seuils par défaut */ }

  // ── Trust check (seuil adaptatif) ──
  const buyerTrust = order.buyer.trustScore ?? 50;
  if (buyerTrust >= trustThreshold) {
    reasoning.push(`Acheteur fiable (score ${buyerTrust}/100, seuil ${trustThreshold})`);
  } else if (buyerTrust < 40) {
    blockers.push(`Score de confiance faible (${buyerTrust}/100)`);
  }

  // ── Buyer history ──
  const totalOrders = order.buyer._count.buyerOrders;
  if (totalOrders >= 5) {
    reasoning.push(`Acheteur expérimenté (${totalOrders} commandes)`);
  } else if (totalOrders === 0) {
    blockers.push("Premier achat — validation manuelle recommandée");
  }

  // ── Account age ──
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(order.buyer.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (accountAgeDays < 7) {
    blockers.push("Compte créé il y a moins de 7 jours");
  } else {
    reasoning.push(`Compte établi (${accountAgeDays} jours d'ancienneté)`);
  }

  // ── Order amount (seuil adaptatif) ──
  const totalAmount = order.totalUsdCents;
  if (totalAmount > amountThresholdCents) {
    blockers.push(`Montant élevé (${(totalAmount / 100).toFixed(2)}$, seuil ${(amountThresholdCents / 100).toFixed(2)}$) — validation humaine requise`);
  } else {
    reasoning.push(`Montant modéré (${(totalAmount / 100).toFixed(2)}$)`);
  }

  // ── Stock check ──
  for (const item of order.items) {
    if (!item.listing) {
      blockers.push("Annonce supprimée dans la commande");
      continue;
    }
    if (item.listing.status !== "ACTIVE") {
      blockers.push(`Article "${item.listing.id}" n'est plus actif`);
    }
    if (
      item.listing.stockQuantity !== null &&
      item.listing.stockQuantity < item.quantity
    ) {
      blockers.push(`Stock insuffisant pour l'article ${item.listing.id}`);
    }
  }

  const canAutoValidate = blockers.length === 0;
  const trustScore = Math.min(100, buyerTrust + (totalOrders >= 3 ? 10 : 0));

  return {
    orderId,
    canAutoValidate,
    trustScore,
    validationCode: canAutoValidate ? order.validationCode : null,
    reasoning,
    blockers,
    adaptiveThresholds: {
      trustThreshold,
      amountThresholdCents,
      source: thresholdSource,
    },
  };
}

// ─────────────────────────────────────────────
// Batch Cart Recovery — Moteur autonome
// ─────────────────────────────────────────────

export interface CartRecoveryResult {
  processed: number;
  reminders: number;
  discounts: number;
  urgentAlerts: number;
  errors: number;
}

/**
 * Traite automatiquement les paniers abandonnés.
 * Génère des notifications de relance avec des stratégies adaptées.
 * Appelé par le scheduler d'autonomie.
 */
export async function runBatchCartRecovery(): Promise<CartRecoveryResult> {
  const result: CartRecoveryResult = { processed: 0, reminders: 0, discounts: 0, urgentAlerts: 0, errors: 0 };

  // Récupérer la config IA Commande
  const agentConfig = await prisma.aiAgent.findFirst({
    where: { name: "IA_COMMANDE", enabled: true },
  });
  if (!agentConfig) return result;

  const config = (agentConfig.config ?? {}) as Record<string, unknown>;
  if (config.autoRecoveryEnabled === false) return result;

  // Réinitialiser le cache abonnements pour ce cycle batch
  clearSubscriptionCache();

  // Paniers ouverts depuis plus de 6h avec des articles
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const abandonedCarts = await prisma.cart.findMany({
    where: {
      status: "OPEN",
      updatedAt: { lt: sixHoursAgo, gt: seventyTwoHoursAgo },
      items: { some: {} }, // Au moins 1 article
    },
    include: {
      buyer: { select: { id: true, trustScore: true, email: true } },
      items: {
        include: {
          listing: { select: { id: true, title: true, stockQuantity: true, ownerUserId: true, priceUsdCents: true } },
        },
      },
    },
    take: 200,
  });

  for (const cart of abandonedCarts) {
    try {
      // ── Vérifier qu'au moins un vendeur dans le panier a IA_ORDER ──
      const sellerIds = [...new Set(cart.items.map((i) => i.listing?.ownerUserId).filter(Boolean))] as string[];
      let anySellerHasAccess = false;
      for (const sid of sellerIds) {
        if (await checkIaAccessOrLog(sid, "IA_ORDER", "runBatchCartRecovery")) { anySellerHasAccess = true; break; }
      }
      if (!anySellerHasAccess) continue;

      const inactiveSinceMs = Date.now() - new Date(cart.updatedAt).getTime();
      const inactiveSinceHours = Math.floor(inactiveSinceMs / (1000 * 60 * 60));
      const cartTotal = cart.items.reduce((s, i) => s + i.unitPriceUsdCents * i.quantity, 0);
      const itemCount = cart.items.length;

      // Vérifier qu'on n'a pas déjà relancé ce panier récemment
      const recentLog = await prisma.aiAutonomyLog.findFirst({
        where: {
          agentName: "IA_COMMANDE",
          actionType: "AUTO_CART_RECOVERY",
          targetId: cart.id,
          createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (recentLog) continue;

      let action: string;
      let reasoning: string;

      // Stratégie de récupération basée sur le contexte
      if (inactiveSinceHours < 12) {
        action = "SEND_REMINDER";
        reasoning = `Panier de ${itemCount} article(s) inactif depuis ${inactiveSinceHours}h — rappel simple`;
        result.reminders++;
      } else if (inactiveSinceHours < 48) {
        // Vérifier si des articles sont en stock bas
        const lowStockItems = cart.items.filter(
          (i) => i.listing && i.listing.stockQuantity !== null && i.listing.stockQuantity <= 3,
        );
        if (lowStockItems.length > 0) {
          action = "URGENT_ALERT";
          reasoning = `${lowStockItems.length} article(s) en stock bas — alerte urgence`;
          result.urgentAlerts++;
        } else {
          action = "OFFER_DISCOUNT";
          reasoning = `Panier inactif ${inactiveSinceHours}h, total ${(cartTotal / 100).toFixed(2)}$ — offre remise 5%`;
          result.discounts++;
        }
      } else {
        action = "URGENT_ALERT";
        reasoning = `Panier abandonné depuis ${inactiveSinceHours}h — dernière chance`;
        result.urgentAlerts++;
      }

      // Log autonome
      await prisma.aiAutonomyLog.create({
        data: {
          agentName: "IA_COMMANDE",
          actionType: "AUTO_CART_RECOVERY",
          targetId: cart.id,
          targetUserId: cart.buyerUserId,
          decision: action,
          reasoning,
          success: true,
          metadata: {
            cartTotal,
            itemCount,
            inactiveSinceHours,
          },
        },
      });

      // ── Notification buyer : rappel panier ──
      const cartMsg = action === "URGENT_ALERT"
        ? "Des articles de votre panier sont en quantité limitée ! Finalisez avant rupture."
        : action === "OFFER_DISCOUNT"
          ? `Votre panier de ${(cartTotal / 100).toFixed(2)}$ vous attend. Finalisez maintenant !`
          : `Vous avez ${itemCount} article(s) dans votre panier. Finalisez votre achat.`;
      void sendPushToUser(cart.buyerUserId, {
        title: action === "URGENT_ALERT" ? "🔥 Stock limité dans votre panier" : "🛒 Votre panier vous attend",
        body: cartMsg,
        tag: `ia-cart-${cart.id}`,
        data: { type: "IA_CART_RECOVERY", cartId: cart.id },
      }).catch(() => {});

      result.processed++;
    } catch {
      result.errors++;
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// Order Auto-Validation Batch
// ─────────────────────────────────────────────

export interface AutoValidationResult {
  processed: number;
  validated: number;
  flagged: number;
  errors: number;
}

/**
 * Auto-valide les commandes PENDING éligibles (buyer fiable, montant raisonnable).
 * Appelé par le scheduler d'autonomie.
 */
export async function runBatchOrderAutoValidation(): Promise<AutoValidationResult> {
  const result: AutoValidationResult = { processed: 0, validated: 0, flagged: 0, errors: 0 };

  const agentConfig = await prisma.aiAgent.findFirst({
    where: { name: "IA_COMMANDE", enabled: true },
  });
  if (!agentConfig) return result;

  const config = (agentConfig.config ?? {}) as Record<string, unknown>;
  if (config.autoValidationEnabled === false) return result;

  // Réinitialiser le cache abonnements pour ce cycle batch
  clearSubscriptionCache();

  // Commandes PENDING de plus de 30 minutes
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const pendingOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: thirtyMinutesAgo },
    },
    select: { id: true, sellerUserId: true },
    take: 50,
  });

  for (const order of pendingOrders) {
    try {
      // ── Vérifier que le vendeur a accès IA_ORDER ──
      if (!(await checkIaAccessOrLog(order.sellerUserId, "IA_ORDER", "runBatchOrderAutoValidation"))) continue;

      const decision = await getOrderAutoValidationDecision(order.id);
      result.processed++;

      if (decision.canAutoValidate) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
        result.validated++;

        await prisma.aiAutonomyLog.create({
          data: {
            agentName: "IA_COMMANDE",
            actionType: "AUTO_VALIDATE_ORDER",
            targetId: order.id,
            decision: "VALIDATED",
            reasoning: decision.reasoning.join("; "),
            success: true,
          },
        });

        // ── Notification vendeur : commande auto-validée ──
        void sendPushToUser(order.sellerUserId, {
          title: "✅ Commande auto-validée",
          body: "L'IA a confirmé une commande. Préparez l'article pour l'expédition.",
          tag: `ia-order-${order.id}`,
          data: { type: "IA_ORDER_VALIDATED", orderId: order.id },
        }).catch(() => {});
      } else {
        result.flagged++;
        await prisma.aiAutonomyLog.create({
          data: {
            agentName: "IA_COMMANDE",
            actionType: "AUTO_VALIDATE_ORDER",
            targetId: order.id,
            decision: "FLAGGED",
            reasoning: decision.blockers.join("; "),
            success: true,
            metadata: { blockers: decision.blockers },
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
// Order Anomaly Detection — Moteur réel
// ─────────────────────────────────────────────

export interface OrderAnomaly {
  orderId: string;
  anomalies: Array<{
    type: "PRICE_SPIKE" | "QUANTITY_UNUSUAL" | "BUYER_PATTERN" | "VELOCITY" | "ADDRESS_MISMATCH";
    severity: "LOW" | "MEDIUM" | "HIGH";
    description: string;
    /** Score de risque de cette anomalie individuelle */
    riskContribution: number;
  }>;
  riskScore: number; // 0-100
  recommendation: "ALLOW" | "REVIEW" | "BLOCK";
  /** Raisons détaillées pour le niveau de recommandation */
  reasoning: string[];
}

/**
 * Détecte les anomalies dans une commande.
 * Analyse prix, quantités, pattern acheteur, vélocité.
 *
 * Calibration prudente :
 * - BLOCK réservé aux cas forts (riskScore ≥ 75)
 * - REVIEW pour cas ambigus (riskScore ≥ 30)
 * - ALLOW par défaut — ne pas bloquer les transactions légitimes
 */
export async function detectOrderAnomalies(orderId: string): Promise<OrderAnomaly> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      buyer: {
        select: {
          id: true,
          trustScore: true,
          createdAt: true,
          _count: { select: { buyerOrders: true } },
        },
      },
      items: {
        select: {
          quantity: true,
          unitPriceUsdCents: true,
          listing: {
            select: {
              id: true,
              priceUsdCents: true,
              category: true,
              stockQuantity: true,
              city: true,
            },
          },
        },
      },
    },
  });

  if (!order) throw new HttpError(404, "Commande introuvable");

  const anomalies: OrderAnomaly["anomalies"] = [];
  const reasoning: string[] = [];
  let riskScore = 0;

  // ── 1. Price spike — prix item vs prix annonce ──
  for (const item of order.items) {
    if (!item.listing) continue;
    const priceDiff = Math.abs(item.unitPriceUsdCents - item.listing.priceUsdCents);
    const diffPercent = (priceDiff / item.listing.priceUsdCents) * 100;
    if (diffPercent > 50) {
      const contribution = 25;
      anomalies.push({
        type: "PRICE_SPIKE",
        severity: "HIGH",
        description: `Prix unitaire (${(item.unitPriceUsdCents / 100).toFixed(2)}$) diffère de ${Math.round(diffPercent)}% du prix annonce (${(item.listing.priceUsdCents / 100).toFixed(2)}$)`,
        riskContribution: contribution,
      });
      riskScore += contribution;
      reasoning.push(`Écart de prix majeur (${Math.round(diffPercent)}%) détecté`);
    } else if (diffPercent > 30) {
      const contribution = 10;
      anomalies.push({
        type: "PRICE_SPIKE",
        severity: "MEDIUM",
        description: `Prix unitaire (${(item.unitPriceUsdCents / 100).toFixed(2)}$) diffère de ${Math.round(diffPercent)}% du prix annonce (${(item.listing.priceUsdCents / 100).toFixed(2)}$)`,
        riskContribution: contribution,
      });
      riskScore += contribution;
      reasoning.push(`Écart de prix modéré (${Math.round(diffPercent)}%)`);
    }
  }

  // ── 2. Quantity unusual — quantité anormalement élevée ──
  for (const item of order.items) {
    if (item.quantity > 50) {
      const contribution = 20;
      anomalies.push({
        type: "QUANTITY_UNUSUAL",
        severity: "HIGH",
        description: `Quantité très inhabituelle (${item.quantity} unités)`,
        riskContribution: contribution,
      });
      riskScore += contribution;
      reasoning.push(`Quantité massive (${item.quantity})`);
    } else if (item.quantity > 20) {
      const contribution = 8;
      anomalies.push({
        type: "QUANTITY_UNUSUAL",
        severity: "MEDIUM",
        description: `Quantité inhabituelle (${item.quantity} unités)`,
        riskContribution: contribution,
      });
      riskScore += contribution;
      reasoning.push(`Quantité élevée (${item.quantity})`);
    }
    // Stock dépassé → toujours signaler
    if (item.listing?.stockQuantity !== null && item.listing?.stockQuantity !== undefined && item.quantity > item.listing.stockQuantity) {
      const contribution = 20;
      anomalies.push({
        type: "QUANTITY_UNUSUAL",
        severity: "HIGH",
        description: `Quantité (${item.quantity}) dépasse le stock disponible (${item.listing.stockQuantity})`,
        riskContribution: contribution,
      });
      riskScore += contribution;
      reasoning.push(`Quantité > stock disponible`);
    }
  }

  // ── 3. Buyer pattern — nouveau compte + grosse commande ──
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(order.buyer.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const totalOrders = order.buyer._count.buyerOrders;
  const buyerTrustScore = order.buyer.trustScore ?? 50;

  if (accountAgeDays < 2 && order.totalUsdCents > 15000) {
    const contribution = 25;
    anomalies.push({
      type: "BUYER_PATTERN",
      severity: "HIGH",
      description: `Compte de ${accountAgeDays} jour(s) avec commande de ${(order.totalUsdCents / 100).toFixed(2)}$`,
      riskContribution: contribution,
    });
    riskScore += contribution;
    reasoning.push(`Compte très récent (${accountAgeDays}j) + gros montant`);
  } else if (totalOrders === 0 && order.totalUsdCents > 10000) {
    const contribution = 12;
    anomalies.push({
      type: "BUYER_PATTERN",
      severity: "MEDIUM",
      description: `Premier achat — montant élevé (${(order.totalUsdCents / 100).toFixed(2)}$)`,
      riskContribution: contribution,
    });
    riskScore += contribution;
    reasoning.push(`Premier achat avec montant > 100$`);
  }

  if (buyerTrustScore < 20) {
    const contribution = 12;
    anomalies.push({
      type: "BUYER_PATTERN",
      severity: "MEDIUM",
      description: `Score de confiance très bas (${buyerTrustScore}/100)`,
      riskContribution: contribution,
    });
    riskScore += contribution;
    reasoning.push(`Trust score critique (${buyerTrustScore})`);
  }

  // ── 4. Velocity — commandes trop rapprochées ──
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentOrderCount = await prisma.order.count({
    where: {
      buyerUserId: order.buyerUserId,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recentOrderCount > 5) {
    const contribution = 20;
    anomalies.push({
      type: "VELOCITY",
      severity: "HIGH",
      description: `${recentOrderCount} commandes dans la dernière heure`,
      riskContribution: contribution,
    });
    riskScore += contribution;
    reasoning.push(`Vélocité anormale (${recentOrderCount} commandes/h)`);
  } else if (recentOrderCount > 3) {
    const contribution = 8;
    anomalies.push({
      type: "VELOCITY",
      severity: "MEDIUM",
      description: `${recentOrderCount} commandes dans la dernière heure`,
      riskContribution: contribution,
    });
    riskScore += contribution;
    reasoning.push(`Vélocité élevée (${recentOrderCount} commandes/h)`);
  }

  riskScore = Math.min(100, riskScore);

  // ── Recommandation calibrée — prudence : privilégier REVIEW sur BLOCK ──
  let recommendation: OrderAnomaly["recommendation"];
  if (riskScore >= 75) {
    recommendation = "BLOCK";
    reasoning.push(`Score de risque critique (${riskScore}/100) → blocage recommandé`);
  } else if (riskScore >= 30) {
    recommendation = "REVIEW";
    reasoning.push(`Score de risque modéré (${riskScore}/100) → vérification manuelle`);
  } else {
    recommendation = "ALLOW";
    if (anomalies.length > 0) {
      reasoning.push(`Anomalies mineures détectées mais risque acceptable (${riskScore}/100)`);
    } else {
      reasoning.push(`Aucune anomalie détectée`);
    }
  }

  return { orderId, anomalies, riskScore, recommendation, reasoning };
}

// ─────────────────────────────────────────────
// Post-Order Tracking — Suivi post-commande
// ─────────────────────────────────────────────

export interface PostOrderTrackingResult {
  processed: number;
  confirmationReminders: number;
  deliveryChecks: number;
  reviewRequests: number;
  complementarySuggestions: number;
  errors: number;
}

/**
 * Suivi post-commande automatique. Génère des actions de suivi :
 * - Rappel de confirmation (vendeur) si commande CONFIRMED > 24h sans expédition
 * - Check livraison (acheteur) si commande SHIPPED > 48h
 * - Demande d'avis (acheteur) si commande DELIVERED > 3 jours sans review
 * - Suggestion complémentaire (acheteur) si commande DELIVERED > 7 jours
 *
 * Anti-spam : cooldown strict, max actions par commande, arrêt si litige/annulation.
 */
export async function runBatchPostOrderTracking(): Promise<PostOrderTrackingResult> {
  const result: PostOrderTrackingResult = {
    processed: 0,
    confirmationReminders: 0,
    deliveryChecks: 0,
    reviewRequests: 0,
    complementarySuggestions: 0,
    errors: 0,
  };

  const agentConfig = await prisma.aiAgent.findFirst({
    where: { name: "IA_COMMANDE", enabled: true },
  });
  if (!agentConfig) return result;

  const config = (agentConfig.config ?? {}) as Record<string, unknown>;
  if (config.postOrderTrackingEnabled === false) return result;

  // ── Anti-spam config ──
  const MAX_ACTIONS_PER_ORDER = 6;      // max 6 actions IA total par commande
  const COOLDOWN_REMINDER_H = 48;       // 48h entre rappels de confirmation
  const COOLDOWN_DELIVERY_H = 72;       // 72h entre checks livraison
  const COOLDOWN_REVIEW_DAYS = 7;       // 7j entre demandes d'avis
  const MAX_REVIEW_REQUESTS = 2;        // max 2 demandes d'avis
  const MAX_COMPLEMENTARY = 1;          // max 1 suggestion complémentaire

  // Réinitialiser le cache abonnements pour ce cycle batch
  clearSubscriptionCache();

  const now = Date.now();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const cooldownReminderAgo = new Date(now - COOLDOWN_REMINDER_H * 60 * 60 * 1000);
  const cooldownDeliveryAgo = new Date(now - COOLDOWN_DELIVERY_H * 60 * 60 * 1000);
  const cooldownReviewAgo = new Date(now - COOLDOWN_REVIEW_DAYS * 24 * 60 * 60 * 1000);

  /** Vérifie le nombre total d'actions IA sur une commande — anti-spam global */
  async function hasReachedMaxActions(orderId: string): Promise<boolean> {
    const total = await prisma.aiAutonomyLog.count({
      where: {
        agentName: "IA_COMMANDE",
        targetId: orderId,
        actionType: { startsWith: "POST_ORDER_" },
      },
    });
    return total >= MAX_ACTIONS_PER_ORDER;
  }

  // ── 0. Auto-progression CONFIRMED → PROCESSING (vendeurs autonomes, commandes > 2h) ──
  try {
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
    const staleConfirmedForProcessing = await prisma.order.findMany({
      where: {
        status: "CONFIRMED",
        confirmedAt: { lt: twoHoursAgo },
      },
      select: { id: true, sellerUserId: true, totalUsdCents: true },
      take: 50,
    });

    for (const order of staleConfirmedForProcessing) {
      if (!(await checkIaAccessOrLog(order.sellerUserId, "IA_ORDER", "autoProgressToProcessing"))) continue;
      if (await hasReachedMaxActions(order.id)) continue;

      // Vérifier qu'on n'a pas déjà fait cette transition
      const alreadyProgressed = await prisma.aiAutonomyLog.findFirst({
        where: {
          agentName: "IA_COMMANDE",
          actionType: "AUTO_PROGRESS_PROCESSING",
          targetId: order.id,
        },
      });
      if (alreadyProgressed) continue;

      await prisma.order.update({
        where: { id: order.id },
        data: { status: "PROCESSING" },
      });

      await prisma.aiAutonomyLog.create({
        data: {
          agentName: "IA_COMMANDE",
          actionType: "AUTO_PROGRESS_PROCESSING",
          targetId: order.id,
          targetUserId: order.sellerUserId,
          decision: "PROCESSING",
          reasoning: `Commande confirmée > 2h — passage auto en préparation (${(order.totalUsdCents / 100).toFixed(2)}$)`,
          success: true,
        },
      });

      // ── Notification vendeur : commande en préparation ──
      void sendPushToUser(order.sellerUserId, {
        title: "📦 Commande passée en préparation",
        body: `L'IA a lancé la préparation d'une commande de ${(order.totalUsdCents / 100).toFixed(2)}$. Expédiez quand c'est prêt.`,
        tag: `ia-order-processing-${order.id}`,
        data: { type: "IA_ORDER_PROCESSING", orderId: order.id },
      }).catch(() => {});

      result.confirmationReminders++;
      result.processed++;
    }
  } catch { result.errors++; }

  // ── 1. Rappel confirmation vendeur (CONFIRMED > 24h) ──
  try {
    const staleConfirmed = await prisma.order.findMany({
      where: {
        status: "CONFIRMED",
        confirmedAt: { lt: twentyFourHoursAgo },
      },
      select: { id: true, sellerUserId: true, totalUsdCents: true },
      take: 50,
    });

    for (const order of staleConfirmed) {
      // Vérifier que le vendeur a IA_ORDER
      if (!(await checkIaAccessOrLog(order.sellerUserId, "IA_ORDER", "postOrderConfirmationReminder"))) continue;

      // Anti-spam : max actions globales
      if (await hasReachedMaxActions(order.id)) continue;

      const recentLog = await prisma.aiAutonomyLog.findFirst({
        where: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_CONFIRMATION_REMINDER",
          targetId: order.id,
          createdAt: { gt: cooldownReminderAgo }, // cooldown 48h au lieu de 24h
        },
      });
      if (recentLog) continue;

      await prisma.aiAutonomyLog.create({
        data: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_CONFIRMATION_REMINDER",
          targetId: order.id,
          targetUserId: order.sellerUserId,
          decision: "REMIND",
          reasoning: `Commande de ${(order.totalUsdCents / 100).toFixed(2)}$ confirmée > 24h sans expédition`,
          success: true,
        },
      });

      // ── Notification vendeur : rappel expédition ──
      void sendPushToUser(order.sellerUserId, {
        title: "⏰ Rappel : commande en attente d'expédition",
        body: `Une commande de ${(order.totalUsdCents / 100).toFixed(2)}$ attend votre expédition depuis plus de 24h.`,
        tag: `ia-order-remind-${order.id}`,
        data: { type: "IA_ORDER_REMIND", orderId: order.id },
      }).catch(() => {});

      result.confirmationReminders++;
      result.processed++;
    }
  } catch { result.errors++; }

  // ── 1b. Auto-progression PROCESSING → SHIPPED pour commandes de services uniquement (> 6h) ──
  try {
    const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000);
    const staleProcessing = await prisma.order.findMany({
      where: {
        status: "PROCESSING",
        updatedAt: { lt: sixHoursAgo },
      },
      select: {
        id: true,
        sellerUserId: true,
        totalUsdCents: true,
        items: { select: { listing: { select: { type: true } } } },
      },
      take: 50,
    });

    for (const order of staleProcessing) {
      // Seulement si TOUS les articles sont des services (pas de produit physique)
      const allServices = order.items.length > 0 && order.items.every(
        (item) => item.listing?.type === "SERVICE"
      );
      if (!allServices) continue;

      if (!(await checkIaAccessOrLog(order.sellerUserId, "IA_ORDER", "autoProgressToShipped"))) continue;
      if (await hasReachedMaxActions(order.id)) continue;

      const alreadyShipped = await prisma.aiAutonomyLog.findFirst({
        where: {
          agentName: "IA_COMMANDE",
          actionType: "AUTO_PROGRESS_SHIPPED",
          targetId: order.id,
        },
      });
      if (alreadyShipped) continue;

      await prisma.order.update({
        where: { id: order.id },
        data: { status: "SHIPPED" },
      });

      await prisma.aiAutonomyLog.create({
        data: {
          agentName: "IA_COMMANDE",
          actionType: "AUTO_PROGRESS_SHIPPED",
          targetId: order.id,
          targetUserId: order.sellerUserId,
          decision: "SHIPPED",
          reasoning: `Commande service en préparation > 6h — passage auto en livré (${(order.totalUsdCents / 100).toFixed(2)}$)`,
          success: true,
        },
      });

      // ── Notification vendeur + buyer : service marqué livré ──
      void sendPushToUser(order.sellerUserId, {
        title: "🚀 Service marqué comme livré",
        body: `L'IA a marqué un service (${(order.totalUsdCents / 100).toFixed(2)}$) comme livré. L'acheteur doit confirmer avec le code.`,
        tag: `ia-order-shipped-${order.id}`,
        data: { type: "IA_ORDER_SHIPPED", orderId: order.id },
      }).catch(() => {});

      result.deliveryChecks++;
      result.processed++;
    }
  } catch { result.errors++; }

  // ── 2. Check livraison (SHIPPED > 48h) ──
  try {
    const staleShipped = await prisma.order.findMany({
      where: {
        status: "SHIPPED",
        updatedAt: { lt: fortyEightHoursAgo },
      },
      select: { id: true, buyerUserId: true, sellerUserId: true },
      take: 50,
    });

    for (const order of staleShipped) {
      // Vérifier que le vendeur a IA_ORDER
      if (!(await checkIaAccessOrLog(order.sellerUserId, "IA_ORDER", "postOrderDeliveryCheck"))) continue;

      // Anti-spam : max actions globales
      if (await hasReachedMaxActions(order.id)) continue;

      const recentLog = await prisma.aiAutonomyLog.findFirst({
        where: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_DELIVERY_CHECK",
          targetId: order.id,
          createdAt: { gt: cooldownDeliveryAgo }, // cooldown 72h
        },
      });
      if (recentLog) continue;

      await prisma.aiAutonomyLog.create({
        data: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_DELIVERY_CHECK",
          targetId: order.id,
          targetUserId: order.buyerUserId,
          decision: "CHECK_DELIVERY",
          reasoning: "Commande expédiée > 48h — vérification livraison",
          success: true,
        },
      });

      // ── Notification buyer : avez-vous reçu la commande ? ──
      void sendPushToUser(order.buyerUserId, {
        title: "📬 Avez-vous reçu votre commande ?",
        body: "Votre commande a été expédiée il y a plus de 48h. Confirmez la réception avec votre code.",
        tag: `ia-delivery-check-${order.id}`,
        data: { type: "IA_DELIVERY_CHECK", orderId: order.id },
      }).catch(() => {});

      result.deliveryChecks++;
      result.processed++;
    }
  } catch { result.errors++; }

  // ── 3. Demande d'avis (DELIVERED > 3 jours sans review) ──
  try {
    const deliveredNoReview = await prisma.order.findMany({
      where: {
        status: "DELIVERED",
        updatedAt: { lt: threeDaysAgo, gt: thirtyDaysAgo },
      },
      select: {
        id: true,
        buyerUserId: true,
        sellerUserId: true,
      },
      take: 50,
    });

    for (const order of deliveredNoReview) {
      // Vérifier que le vendeur a IA_ORDER
      if (!(await checkIaAccessOrLog(order.sellerUserId, "IA_ORDER", "postOrderReviewRequest"))) continue;

      // Anti-spam : max actions globales
      if (await hasReachedMaxActions(order.id)) continue;

      // Vérifier si un avis existe déjà pour cette commande
      const existingReview = await prisma.userReview.findFirst({
        where: {
          authorId: order.buyerUserId,
          targetId: order.sellerUserId,
          orderId: order.id,
        },
      });
      if (existingReview) continue;

      // Anti-spam : max 2 demandes d'avis par commande
      const reviewRequestCount = await prisma.aiAutonomyLog.count({
        where: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_REVIEW_REQUEST",
          targetId: order.id,
        },
      });
      if (reviewRequestCount >= MAX_REVIEW_REQUESTS) continue;

      // Cooldown 7 jours entre demandes
      const recentLog = await prisma.aiAutonomyLog.findFirst({
        where: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_REVIEW_REQUEST",
          targetId: order.id,
          createdAt: { gt: cooldownReviewAgo },
        },
      });
      if (recentLog) continue;

      await prisma.aiAutonomyLog.create({
        data: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_REVIEW_REQUEST",
          targetId: order.id,
          targetUserId: order.buyerUserId,
          decision: "REQUEST_REVIEW",
          reasoning: `Commande livrée > 3 jours — demande d'avis (${reviewRequestCount + 1}/${MAX_REVIEW_REQUESTS})`,
          success: true,
        },
      });

      // ── Notification buyer : laissez un avis ──
      void sendPushToUser(order.buyerUserId, {
        title: "⭐ Laissez un avis sur votre achat",
        body: "Votre avis aide la communauté Kin-Sell. Prenez 30 secondes pour noter votre vendeur.",
        tag: `ia-review-${order.id}`,
        data: { type: "IA_REVIEW_REQUEST", orderId: order.id },
      }).catch(() => {});

      result.reviewRequests++;
      result.processed++;
    }
  } catch { result.errors++; }

  // ── 4. Suggestion complémentaire (DELIVERED > 7 jours) ──
  try {
    const deliveredOld = await prisma.order.findMany({
      where: {
        status: "DELIVERED",
        updatedAt: { lt: sevenDaysAgo, gt: thirtyDaysAgo },
      },
      select: {
        id: true,
        buyerUserId: true,
        sellerUserId: true,
        items: {
          select: { listing: { select: { category: true, city: true } } },
          take: 3,
        },
      },
      take: 30,
    });

    for (const order of deliveredOld) {
      // Vérifier que le vendeur a IA_ORDER
      if (!(await checkIaAccessOrLog(order.sellerUserId, "IA_ORDER", "postOrderComplementary"))) continue;

      // Anti-spam : max actions globales
      if (await hasReachedMaxActions(order.id)) continue;

      // Anti-spam : max 1 suggestion complémentaire par commande
      const compCount = await prisma.aiAutonomyLog.count({
        where: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_COMPLEMENTARY",
          targetId: order.id,
        },
      });
      if (compCount >= MAX_COMPLEMENTARY) continue;

      const recentLog = await prisma.aiAutonomyLog.findFirst({
        where: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_COMPLEMENTARY",
          targetId: order.id,
          createdAt: { gt: sevenDaysAgo },
        },
      });
      if (recentLog) continue;

      const categories = [...new Set(order.items.map((i) => i.listing?.category).filter(Boolean))] as string[];
      if (categories.length === 0) continue;

      const hasRelated = await prisma.listing.count({
        where: {
          category: { in: categories },
          status: "ACTIVE",
        },
      });
      if (hasRelated < 2) continue;

      await prisma.aiAutonomyLog.create({
        data: {
          agentName: "IA_COMMANDE",
          actionType: "POST_ORDER_COMPLEMENTARY",
          targetId: order.id,
          targetUserId: order.buyerUserId,
          decision: "SUGGEST_COMPLEMENTARY",
          reasoning: `Commande livrée > 7 jours — ${hasRelated} articles similaires dans ${categories.join(", ")}`,
          success: true,
          metadata: { categories: categories as string[], relatedCount: hasRelated },
        },
      });
      result.complementarySuggestions++;
      result.processed++;
    }
  } catch { result.errors++; }

  return result;
}
