/**
 * Boost Service — Système unifié de campagnes boost.
 *
 * Remplace l'ancien système /ads/boost + /ads/highlight :
 * - Campagnes polymorphes (LISTING, POST, PROFILE, SHOP)
 * - Budget réel débité du Wallet
 * - Caps par plan anti-abus
 * - Refund prorata à l'annulation
 * - Expiration automatique (scheduler)
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logger.js";
import { debitWallet, creditWallet, ensureWallet } from "./wallet.service.js";
import { SCOPE_PRICING_MULTIPLIER } from "../ads/ads-boost.service.js";
import type { PromotionScope } from "../ads/ads-boost.service.js";
import { Role } from "../../types/roles.js";
import { BoostTarget, BoostStatus } from "@prisma/client";

// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────

/**
 * Tarification de base: 1000 cents ($10) par jour pour scope LOCAL.
 * Multiplié par SCOPE_PRICING_MULTIPLIER pour NATIONAL/CROSS_BORDER.
 */
const BASE_DAILY_RATE_USD_CENTS = 1000;

/** Prix minimum d'une campagne: 1$ */
const MIN_BUDGET_USD_CENTS = 100;
/** Prix maximum d'une campagne: 500$ */
const MAX_BUDGET_USD_CENTS = 50000;
/** Durée max: 90 jours */
const MAX_DURATION_DAYS = 90;

interface PlanCaps {
  maxActiveCampaigns: number;
  dailyBudgetCapCents: number;
}

/**
 * Caps par plan pour éviter l'abus.
 * SUPER_ADMIN est bypassé en amont (dans la route).
 */
const PLAN_CAPS: Record<string, PlanCaps> = {
  FREE: { maxActiveCampaigns: 0, dailyBudgetCapCents: 0 },
  STARTER: { maxActiveCampaigns: 0, dailyBudgetCapCents: 0 },
  BOOST: { maxActiveCampaigns: 3, dailyBudgetCapCents: 1000 },
  AUTO: { maxActiveCampaigns: 3, dailyBudgetCapCents: 1000 },
  PRO_VENDOR: { maxActiveCampaigns: 10, dailyBudgetCapCents: 5000 },
  BUSINESS: { maxActiveCampaigns: 10, dailyBudgetCapCents: 5000 },
  SCALE: { maxActiveCampaigns: 50, dailyBudgetCapCents: 50000 },
};

const DEFAULT_CAPS: PlanCaps = { maxActiveCampaigns: 0, dailyBudgetCapCents: 0 };

async function getUserPlanCode(userId: string): Promise<string> {
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { userId },
        { business: { ownerUserId: userId } },
      ],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: { createdAt: "desc" },
    select: { planCode: true },
  });
  return (subscription?.planCode ?? "FREE").toUpperCase();
}

async function getPlanCaps(userId: string): Promise<{ planCode: string; caps: PlanCaps }> {
  const planCode = await getUserPlanCode(userId);
  const caps = PLAN_CAPS[planCode] ?? DEFAULT_CAPS;
  return { planCode, caps };
}

// ─────────────────────────────────────────────
// Pricing & estimations
// ─────────────────────────────────────────────

export interface BoostEstimate {
  requiredBudgetUsdCents: number;
  scopeMultiplier: number;
  reach: { min: number; max: number };
  clicks: { min: number; max: number };
}

export function estimateBoost(
  scope: PromotionScope,
  durationDays: number,
  budgetUsdCents: number,
): BoostEstimate {
  const multiplier = SCOPE_PRICING_MULTIPLIER[scope] ?? 1.0;
  const requiredBudget = Math.round(BASE_DAILY_RATE_USD_CENTS * multiplier * durationDays);
  // Rough estimation: $1 ≈ 100 impressions LOCAL, ajusté par ratio budget/requis
  const ratio = requiredBudget > 0 ? budgetUsdCents / requiredBudget : 1;
  const baseReach = Math.round((budgetUsdCents / 100) * 100);
  const reachMin = Math.round(baseReach * 0.8 * Math.max(0.5, ratio));
  const reachMax = Math.round(baseReach * 2.5 * Math.max(0.5, ratio));
  return {
    requiredBudgetUsdCents: requiredBudget,
    scopeMultiplier: multiplier,
    reach: { min: reachMin, max: reachMax },
    clicks: { min: Math.round(reachMin / 25), max: Math.round(reachMax / 15) },
  };
}

// ─────────────────────────────────────────────
// Création de campagne
// ─────────────────────────────────────────────

export interface CreateCampaignInput {
  userId: string;
  userRole?: string;
  target: BoostTarget;
  targetId: string;
  scope?: PromotionScope;
  targetCountries?: string[];
  budgetUsdCents: number;
  durationDays: number;
  dailyCapUsdCents?: number;
}

/** Vérifie que l'utilisateur est propriétaire/autorisé sur la cible. */
async function assertTargetOwnership(userId: string, target: BoostTarget, targetId: string): Promise<void> {
  switch (target) {
    case "LISTING": {
      const listing = await prisma.listing.findUnique({
        where: { id: targetId },
        select: { ownerUserId: true },
      });
      if (!listing) throw new HttpError(404, "Article introuvable");
      if (listing.ownerUserId !== userId) throw new HttpError(403, "Article non autorisé");
      return;
    }
    case "POST": {
      const post = await prisma.soKinPost.findUnique({
        where: { id: targetId },
        select: { authorId: true },
      });
      if (!post) throw new HttpError(404, "Post So-Kin introuvable");
      if (post.authorId !== userId) throw new HttpError(403, "Post non autorisé");
      return;
    }
    case "PROFILE": {
      if (targetId !== userId) throw new HttpError(403, "Profil non autorisé");
      return;
    }
    case "SHOP": {
      const shop = await prisma.businessShop.findUnique({
        where: { id: targetId },
        select: { business: { select: { ownerUserId: true } } },
      });
      if (!shop) throw new HttpError(404, "Boutique introuvable");
      if (shop.business.ownerUserId !== userId) throw new HttpError(403, "Boutique non autorisée");
      return;
    }
  }
}

export async function createCampaign(input: CreateCampaignInput) {
  const scope: PromotionScope = input.scope ?? "LOCAL";
  const durationDays = Math.max(1, Math.min(input.durationDays || 7, MAX_DURATION_DAYS));
  const budget = Math.round(input.budgetUsdCents);
  const targetCountries = scope === "CROSS_BORDER" ? (input.targetCountries ?? []) : [];

  if (budget < MIN_BUDGET_USD_CENTS) {
    throw new HttpError(400, `Budget minimum: ${MIN_BUDGET_USD_CENTS / 100}$`);
  }
  if (budget > MAX_BUDGET_USD_CENTS) {
    throw new HttpError(400, `Budget maximum: ${MAX_BUDGET_USD_CENTS / 100}$`);
  }
  if (scope === "CROSS_BORDER" && targetCountries.length === 0) {
    throw new HttpError(400, "Le boost inter-pays nécessite au moins un pays cible");
  }

  await assertTargetOwnership(input.userId, input.target, input.targetId);

  const isSuperAdmin = input.userRole === Role.SUPER_ADMIN;

  // Caps par plan (bypass SUPER_ADMIN)
  if (!isSuperAdmin) {
    const { planCode, caps } = await getPlanCaps(input.userId);
    if (caps.maxActiveCampaigns === 0) {
      throw new HttpError(403, `Le plan ${planCode} n'autorise pas les campagnes boost. Souscrivez un plan supérieur.`);
    }
    const activeCount = await prisma.boostCampaign.count({
      where: { userId: input.userId, status: "ACTIVE" },
    });
    if (activeCount >= caps.maxActiveCampaigns) {
      throw new HttpError(429, `Limite atteinte: ${caps.maxActiveCampaigns} campagnes actives maximum pour le plan ${planCode}`);
    }
    if (caps.dailyBudgetCapCents > 0) {
      const effectiveDailyBudget = Math.ceil(budget / durationDays);
      if (effectiveDailyBudget > caps.dailyBudgetCapCents) {
        throw new HttpError(
          400,
          `Budget journalier (${effectiveDailyBudget / 100}$) dépasse le cap du plan ${planCode} (${caps.dailyBudgetCapCents / 100}$/jour)`,
        );
      }
    }
  }

  // Unicité: pas deux campagnes ACTIVE sur la même cible
  const existingActive = await prisma.boostCampaign.findFirst({
    where: { target: input.target, targetId: input.targetId, status: "ACTIVE" },
    select: { id: true },
  });
  if (existingActive) {
    throw new HttpError(409, "Une campagne est déjà active sur cette cible. Annulez-la avant d'en créer une nouvelle.");
  }

  const estimate = estimateBoost(scope, durationDays, budget);
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // Ensure wallet + débit atomique
  await ensureWallet(input.userId);
  await debitWallet({
    userId: input.userId,
    amountUsdCents: budget,
    description: `Boost ${input.target} ${input.targetId} (${scope}, ${durationDays}j)`,
  });

  const multiplier = SCOPE_PRICING_MULTIPLIER[scope] ?? 1.0;

  try {
    const campaign = await prisma.boostCampaign.create({
      data: {
        userId: input.userId,
        target: input.target,
        targetId: input.targetId,
        scope,
        targetCountries,
        budgetUsdCents: budget,
        budgetSpentUsdCents: 0,
        dailyCapUsdCents: input.dailyCapUsdCents ?? null,
        durationDays,
        pricingMultiplier: multiplier,
        status: "ACTIVE",
        startsAt,
        expiresAt,
        estReachMin: estimate.reach.min,
        estReachMax: estimate.reach.max,
        estClicksMin: estimate.clicks.min,
        estClicksMax: estimate.clicks.max,
      },
    });

    // Rattacher la transaction de débit à la campagne
    await prisma.walletTransaction.updateMany({
      where: {
        userId: input.userId,
        campaignId: null,
        type: "DEBIT",
        amountUsdCents: -budget,
      },
      data: { campaignId: campaign.id },
    });

    await syncTargetBoostState(campaign.id);

    logger.info(
      { userId: input.userId, campaignId: campaign.id, target: input.target, targetId: input.targetId, scope, budget, durationDays },
      "[Boost] Campagne créée",
    );

    return campaign;
  } catch (err) {
    // Rollback débit si échec post-débit
    logger.error(err, "[Boost] Échec création campagne, refund du débit");
    await creditWallet({
      userId: input.userId,
      amountUsdCents: budget,
      type: "REFUND",
      description: "Refund: échec création campagne",
    }).catch((refundErr) => {
      logger.error(refundErr, "[Boost] Refund de sécurité échoué — escalation manuelle requise");
    });
    throw err;
  }
}

// ─────────────────────────────────────────────
// Annulation / Pause / Reprise
// ─────────────────────────────────────────────

/**
 * Annule une campagne, rembourse prorata du budget non dépensé.
 */
export async function cancelCampaign(userId: string, campaignId: string, userRole?: string) {
  const campaign = await prisma.boostCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new HttpError(404, "Campagne introuvable");

  const isSuperAdmin = userRole === Role.SUPER_ADMIN;
  if (!isSuperAdmin && campaign.userId !== userId) {
    throw new HttpError(403, "Campagne non autorisée");
  }
  if (campaign.status !== "ACTIVE" && campaign.status !== "PAUSED") {
    throw new HttpError(400, "Campagne déjà terminée");
  }

  const refundCents = Math.max(0, campaign.budgetUsdCents - campaign.budgetSpentUsdCents);

  await prisma.boostCampaign.update({
    where: { id: campaign.id },
    data: { status: "CANCELED", canceledAt: new Date() },
  });

  if (refundCents > 0) {
    await creditWallet({
      userId: campaign.userId,
      amountUsdCents: refundCents,
      type: "REFUND",
      campaignId: campaign.id,
      description: "Refund prorata annulation campagne",
    });
  }

  await syncTargetBoostState(campaign.id, /*forceClear*/ true);

  logger.info({ campaignId, refundCents, actorUserId: userId }, "[Boost] Campagne annulée");
  return { campaignId, refundedUsdCents: refundCents };
}

export async function pauseCampaign(userId: string, campaignId: string, userRole?: string) {
  const campaign = await prisma.boostCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new HttpError(404, "Campagne introuvable");
  if (userRole !== Role.SUPER_ADMIN && campaign.userId !== userId) {
    throw new HttpError(403, "Campagne non autorisée");
  }
  if (campaign.status !== "ACTIVE") throw new HttpError(400, "Campagne non active");

  await prisma.boostCampaign.update({
    where: { id: campaign.id },
    data: { status: "PAUSED", pausedAt: new Date() },
  });
  await syncTargetBoostState(campaign.id, true);
  return { campaignId, status: "PAUSED" as const };
}

export async function resumeCampaign(userId: string, campaignId: string, userRole?: string) {
  const campaign = await prisma.boostCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new HttpError(404, "Campagne introuvable");
  if (userRole !== Role.SUPER_ADMIN && campaign.userId !== userId) {
    throw new HttpError(403, "Campagne non autorisée");
  }
  if (campaign.status !== "PAUSED") throw new HttpError(400, "Campagne non pausée");
  if (campaign.expiresAt <= new Date()) throw new HttpError(400, "Campagne expirée");

  await prisma.boostCampaign.update({
    where: { id: campaign.id },
    data: { status: "ACTIVE", pausedAt: null },
  });
  await syncTargetBoostState(campaign.id);
  return { campaignId, status: "ACTIVE" as const };
}

// ─────────────────────────────────────────────
// Listing / Détail
// ─────────────────────────────────────────────

export async function listMyCampaigns(userId: string, status?: BoostStatus) {
  return prisma.boostCampaign.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getCampaign(userId: string, campaignId: string, userRole?: string) {
  const campaign = await prisma.boostCampaign.findUnique({
    where: { id: campaignId },
    include: {
      metrics: { orderBy: { date: "desc" }, take: 30 },
    },
  });
  if (!campaign) throw new HttpError(404, "Campagne introuvable");
  if (userRole !== Role.SUPER_ADMIN && campaign.userId !== userId) {
    throw new HttpError(403, "Campagne non autorisée");
  }
  return campaign;
}

// ─────────────────────────────────────────────
// Sync état boost sur la cible (Listing / SoKinPost)
// ─────────────────────────────────────────────

/**
 * Met à jour le flag isBoosted de la cible en fonction de l'état de la campagne.
 * Si forceClear=true, désactive même si la campagne semble encore active.
 */
async function syncTargetBoostState(campaignId: string, forceClear = false) {
  const campaign = await prisma.boostCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

  const shouldBeBoosted = !forceClear && campaign.status === "ACTIVE" && campaign.expiresAt > new Date();

  if (campaign.target === "LISTING") {
    await prisma.listing.update({
      where: { id: campaign.targetId },
      data: {
        isBoosted: shouldBeBoosted,
        boostExpiresAt: shouldBeBoosted ? campaign.expiresAt : null,
        boostScope: shouldBeBoosted ? campaign.scope : null,
        boostTargetCountries: shouldBeBoosted ? campaign.targetCountries : [],
      },
    }).catch((err) => logger.error(err, "[Boost] sync Listing failed"));
  } else if (campaign.target === "POST") {
    await prisma.soKinPost.update({
      where: { id: campaign.targetId },
      data: {
        isBoosted: shouldBeBoosted,
        boostExpiresAt: shouldBeBoosted ? campaign.expiresAt : null,
        boostCampaignId: shouldBeBoosted ? campaign.id : null,
        sponsored: shouldBeBoosted,
      },
    }).catch((err) => logger.error(err, "[Boost] sync SoKinPost failed"));
  } else if (campaign.target === "SHOP") {
    // Boost tous les listings liés à la shop
    await prisma.listing.updateMany({
      where: { businessId: campaign.targetId },
      data: {
        isBoosted: shouldBeBoosted,
        boostExpiresAt: shouldBeBoosted ? campaign.expiresAt : null,
        boostScope: shouldBeBoosted ? campaign.scope : null,
        boostTargetCountries: shouldBeBoosted ? campaign.targetCountries : [],
      },
    }).catch((err) => logger.error(err, "[Boost] sync Shop listings failed"));
  }
  // PROFILE: pas de champ DB à sync — le ranking utilisera directement la campagne active
}

// ─────────────────────────────────────────────
// Expiration (cron)
// ─────────────────────────────────────────────

export async function expireBoostCampaigns(): Promise<number> {
  const now = new Date();
  const expiring = await prisma.boostCampaign.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    select: { id: true, target: true, targetId: true, userId: true },
  });
  if (expiring.length === 0) return 0;

  await prisma.boostCampaign.updateMany({
    where: { id: { in: expiring.map((c) => c.id) } },
    data: { status: "EXPIRED" },
  });

  for (const c of expiring) {
    await syncTargetBoostState(c.id, true);
  }

  logger.info({ count: expiring.length }, "[Boost] Campagnes expirées");
  return expiring.length;
}

// ─────────────────────────────────────────────
// Admin KPI
// ─────────────────────────────────────────────

export async function getAdminBoostKpi() {
  const now = new Date();
  const [
    active,
    expiredToday,
    totalSpendCentsAgg,
    totalImpressions,
    totalClicks,
    topAdvertisers,
  ] = await Promise.all([
    prisma.boostCampaign.count({ where: { status: "ACTIVE", expiresAt: { gt: now } } }),
    prisma.boostCampaign.count({
      where: {
        status: "EXPIRED",
        updatedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.boostCampaign.aggregate({
      _sum: { budgetSpentUsdCents: true, budgetUsdCents: true, totalImpressions: true, totalClicks: true },
    }),
    prisma.boostCampaign.aggregate({ _sum: { totalImpressions: true } }),
    prisma.boostCampaign.aggregate({ _sum: { totalClicks: true } }),
    prisma.boostCampaign.groupBy({
      by: ["userId"],
      _sum: { budgetSpentUsdCents: true, totalImpressions: true, totalClicks: true },
      orderBy: { _sum: { budgetSpentUsdCents: "desc" } },
      take: 10,
    }),
  ]);

  const impressions = totalImpressions._sum.totalImpressions ?? 0;
  const clicks = totalClicks._sum.totalClicks ?? 0;
  const ctr = impressions > 0 ? clicks / impressions : 0;

  return {
    activeCampaigns: active,
    expiredLast24h: expiredToday,
    totalBudgetCents: totalSpendCentsAgg._sum.budgetUsdCents ?? 0,
    totalSpentCents: totalSpendCentsAgg._sum.budgetSpentUsdCents ?? 0,
    totalImpressions: impressions,
    totalClicks: clicks,
    ctr,
    topAdvertisers: topAdvertisers.map((t) => ({
      userId: t.userId,
      spentCents: t._sum.budgetSpentUsdCents ?? 0,
      impressions: t._sum.totalImpressions ?? 0,
      clicks: t._sum.totalClicks ?? 0,
    })),
  };
}

export { syncTargetBoostState };
