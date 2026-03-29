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

import { CartStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

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

  // ── Delivery estimate (basé sur ville commune) ──
  const sameCityItems = cart.items.filter(
    (i) => i.listing?.city?.toLowerCase() === cities[0]?.toLowerCase()
  );
  const estimatedDeliveryHours =
    sameCityItems.length === cart.items.length
      ? { min: 2, max: 24 }  // même ville
      : { min: 24, max: 72 };

  return {
    cartId,
    bundleSuggestions,
    discountTrigger,
    urgencySignals,
    paymentOptimization,
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

  // ── Trust check ──
  const buyerTrust = order.buyer.trustScore ?? 50;
  if (buyerTrust >= 70) {
    reasoning.push(`Acheteur fiable (score ${buyerTrust}/100)`);
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

  // ── Order amount ──
  const totalAmount = order.totalUsdCents;
  if (totalAmount > 20000) {
    blockers.push(`Montant élevé (${(totalAmount / 100).toFixed(2)}$) — validation humaine requise`);
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

  // Commandes PENDING de plus de 30 minutes
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const pendingOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: thirtyMinutesAgo },
    },
    select: { id: true },
    take: 50,
  });

  for (const order of pendingOrders) {
    try {
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
