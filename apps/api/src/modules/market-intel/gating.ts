/**
 * Market-Intel gating — vérifie qu'un user a accès à une feature
 * de Kin-Sell Analytique+ via son plan actif.
 *
 * Features :
 *   MARKET_INTEL_BASIC    → PRO_VENDOR (user) | BUSINESS/SCALE (business)
 *   MARKET_INTEL_PREMIUM  → PRO_VENDOR (user) | SCALE (business)
 *   ARBITRAGE_ENGINE      → SCALE (business) uniquement
 *
 * Réutilise la table PLAN_CATALOG pour la source de vérité.
 */

import type { AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { prisma } from "../../shared/db/prisma.js";
import { SubscriptionStatus } from "../../shared/db/prisma-enums.js";
import { PLAN_CATALOG } from "../billing/billing.catalog.js";

export type MarketIntelFeature = "MARKET_INTEL_BASIC" | "MARKET_INTEL_PREMIUM" | "ARBITRAGE_ENGINE";

async function userHasMarketFeature(userId: string, feature: MarketIntelFeature): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, businesses: { select: { id: true }, take: 1 } },
  });
  if (!user) return false;

  const isBusiness = user.role === "BUSINESS";
  const businessId = isBusiness ? user.businesses[0]?.id : null;

  const sub = await prisma.subscription.findFirst({
    where: {
      status: SubscriptionStatus.ACTIVE,
      ...(isBusiness && businessId ? { businessId } : { userId }),
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: { planCode: true },
  });
  if (!sub) return false;

  const scope: "USER" | "BUSINESS" = isBusiness ? "BUSINESS" : "USER";
  const plan = PLAN_CATALOG.find((p) => p.code === sub.planCode && p.scope === scope);
  if (!plan) return false;

  return plan.features.includes(feature);
}

export function requireMarketIntel(feature: MarketIntelFeature) {
  return async (req: AuthenticatedRequest, _res: any, next: any) => {
    const userId = req.auth?.userId;
    if (!userId) throw new HttpError(401, "Authentification requise.");
    const ok = await userHasMarketFeature(userId, feature);
    if (!ok) {
      const hint =
        feature === "ARBITRAGE_ENGINE"
          ? "Abonnement SCALE requis pour le moteur d'arbitrage."
          : feature === "MARKET_INTEL_PREMIUM"
            ? "Abonnement PRO VENDEUR ou SCALE requis pour les tendances marché."
            : "Abonnement PRO VENDEUR / BUSINESS / SCALE requis pour l'intelligence marché.";
      throw new HttpError(403, hint);
    }
    next();
  };
}
