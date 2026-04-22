/**
 * Freemium Tier Resolver
 *
 * Mappe plan utilisateur → tier analytique unifié (FREE | MEDIUM | PREMIUM)
 * Utilisé par les endpoints Kin-Sell Analytique 2.0 pour calibrer
 * le niveau de détail / frustration.
 *
 * Règles (voir docs/KIN-SELL-ANALYTIQUE-V2-SPEC.md §3) :
 *  - FREE, STARTER           → FREE
 *  - BOOST, AUTO, PRO_VENDOR,
 *    BUSINESS                → MEDIUM
 *  - SCALE                   → PREMIUM
 */

import { prisma } from "../db/prisma.js";
import { SubscriptionStatus } from "../db/prisma-enums.js";

export type FreemiumTier = "FREE" | "MEDIUM" | "PREMIUM";

const PREMIUM_PLANS = new Set(["SCALE"]);
const MEDIUM_PLANS = new Set(["BOOST", "AUTO", "PRO_VENDOR", "BUSINESS"]);

export function planCodeToTier(planCode: string | null | undefined): FreemiumTier {
  if (!planCode) return "FREE";
  const code = planCode.toUpperCase();
  if (PREMIUM_PLANS.has(code)) return "PREMIUM";
  if (MEDIUM_PLANS.has(code)) return "MEDIUM";
  return "FREE";
}

export async function getUserTier(userId: string): Promise<FreemiumTier> {
  const now = new Date();
  const sub = await prisma.subscription.findFirst({
    where: {
      status: SubscriptionStatus.ACTIVE,
      OR: [{ userId }, { business: { ownerUserId: userId } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: { createdAt: "desc" },
    select: { planCode: true },
  });
  return planCodeToTier(sub?.planCode);
}

/** Limite numérique standard pour listes/preview selon tier. */
export function tierLimit(tier: FreemiumTier, opts: { free: number; medium: number; premium: number }): number {
  if (tier === "PREMIUM") return opts.premium;
  if (tier === "MEDIUM") return opts.medium;
  return opts.free;
}
