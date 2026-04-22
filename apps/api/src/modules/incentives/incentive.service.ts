/**
 * Incentive Engine — coupon validation, generation, quotas, redemption,
 * growth grants CPC/CPI/CPA, policy enforcement
 */
import { prisma } from "../../shared/db/prisma.js";
import { randomBytes } from "crypto";
import { logger } from "../../shared/logger.js";
import { sendGrantConvertedToCouponMessage } from "../ads/ia-messenger-promo.service.js";
import type {
  CouponKind,
  CouponStatus,
  CouponTargetScope,
  GrantStatus,
  IncentivePolicy,
  IncentiveSegment,
  RedemptionStatus,
  Prisma,
} from "@prisma/client";

/* ─── Helpers ─── */

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function generateCode(prefix = "KS"): string {
  return `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/* ─── Distribution pondérée des discounts (Chantier D2) ───
 * Défaut : privilégie les petites remises (grande base) et rend rares les grosses.
 * Somme des poids : 148.5 → probabilités approchées :
 *   5%:26.9% · 10%:20.2% · 20%:16.8% · 30%:13.5% · 40%:8.1%
 *   50%:5.4% · 60%:3.7% · 70%:3.4% · 80%:1.3% · 100%:0.7%
 */
export const DEFAULT_DISCOUNT_WEIGHTS: Record<number, number> = {
  100: 1,
  80: 2,
  70: 5,
  60: 5.5,
  50: 8,
  40: 12,
  30: 20,
  20: 25,
  10: 30,
  5: 40,
};

function parseDiscountWeights(raw: unknown): Record<number, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([k, v]) => [Number(k), Number(v)] as const)
    .filter(([k, v]) => Number.isFinite(k) && Number.isFinite(v) && v > 0);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}

/**
 * Tire un discount percent dans `allowed` selon pondération (si fournie),
 * sinon tirage uniforme. Exposé pour tests.
 */
export function weightedPickDiscount(
  allowed: number[],
  weights: Record<number, number> | null = null,
): number {
  if (allowed.length === 0) throw new Error("weightedPickDiscount: empty allowed");
  if (allowed.length === 1) return allowed[0];

  const activeWeights = weights ?? DEFAULT_DISCOUNT_WEIGHTS;
  const candidates = allowed
    .map((d) => ({ d, w: activeWeights[d] ?? 0 }))
    .filter((x) => x.w > 0);

  // Aucun poids défini pour ces valeurs → fallback uniforme
  if (candidates.length === 0) {
    return allowed[Math.floor(Math.random() * allowed.length)];
  }

  const total = candidates.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const { d, w } of candidates) {
    r -= w;
    if (r <= 0) return d;
  }
  return candidates[candidates.length - 1].d;
}

/** Calculate discount amount from a percentage. */
function calcDiscount(originalAmountCents: number, discountPercent: number) {
  const discount = Math.round(originalAmountCents * (discountPercent / 100));
  return { discount, final: Math.max(0, originalAmountCents - discount) };
}

/* ─── Quota helpers ─── */

async function getOrCreateQuota(userId: string) {
  const mk = monthKey();
  return prisma.incentiveQuotaCounter.upsert({
    where: { userId_monthKey: { userId, monthKey: mk } },
    update: {},
    create: { userId, monthKey: mk },
  });
}

/* ─── Policy with in-memory cache (5 min TTL) ─── */
const _policyCache = new Map<string, { data: IncentivePolicy; ts: number }>();
const POLICY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getPolicy(segment: IncentiveSegment = "STANDARD") {
  const cached = _policyCache.get(segment);
  if (cached && Date.now() - cached.ts < POLICY_CACHE_TTL) return cached.data;

  const policy = await prisma.incentivePolicy.findUnique({
    where: { segment },
  });
  if (!policy) throw new Error(`No IncentivePolicy for segment ${segment}`);
  _policyCache.set(segment, { data: policy, ts: Date.now() });
  return policy;
}

/** Invalidate policy cache (call after admin updates). */
export function invalidatePolicyCache(segment?: IncentiveSegment) {
  if (segment) _policyCache.delete(segment);
  else _policyCache.clear();
}

/* ─── Validate a coupon code ─── */

export interface CouponPreview {
  couponId: string;
  code: string;
  kind: CouponKind;
  discountPercent: number | null;
  targetScope: CouponTargetScope;
  valid: boolean;
  reason?: string;
  expiresAt?: Date;
}

export async function validateCoupon(
  userId: string,
  code: string,
  planCode?: string,
  addonCode?: string,
): Promise<CouponPreview> {
  const coupon = await prisma.incentiveCoupon.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { redemptions: { where: { userId } } },
  });

  const base: Omit<CouponPreview, "valid" | "reason"> = {
    couponId: coupon?.id ?? "",
    code: code.trim().toUpperCase(),
    kind: coupon?.kind ?? "PLAN_DISCOUNT",
    discountPercent: coupon?.discountPercent ?? null,
    targetScope: coupon?.targetScope ?? "ALL_PLANS",
    expiresAt: coupon?.expiresAt ?? undefined,
  };

  if (!coupon) return { ...base, valid: false, reason: "INVALID_OR_EXPIRED" };
  if (coupon.status !== "ACTIVE") return { ...base, valid: false, reason: "INVALID_OR_EXPIRED" };

  const now = new Date();
  if (now < coupon.startsAt) return { ...base, valid: false, reason: "NOT_YET_ACTIVE" };
  if (now > coupon.expiresAt) return { ...base, valid: false, reason: "EXPIRED" };

  if (coupon.usedCount >= coupon.maxUses)
    return { ...base, valid: false, reason: "MAX_USES_REACHED" };

  const userRedemptions = coupon.redemptions.filter(
    (r) => r.status === "APPLIED",
  ).length;
  if (userRedemptions >= coupon.maxUsesPerUser)
    return { ...base, valid: false, reason: "MAX_USES_PER_USER" };

  if (coupon.recipientUserId && coupon.recipientUserId !== userId)
    return { ...base, valid: false, reason: "NOT_RECIPIENT" };

  // Scope checks
  if (coupon.targetScope === "SPECIFIC") {
    if (planCode && coupon.targetPlanCodes.length > 0 && !coupon.targetPlanCodes.includes(planCode))
      return { ...base, valid: false, reason: "PLAN_NOT_ELIGIBLE" };
    if (addonCode && coupon.targetAddonCodes.length > 0 && !coupon.targetAddonCodes.includes(addonCode))
      return { ...base, valid: false, reason: "ADDON_NOT_ELIGIBLE" };
  }

  // Monthly quota check
  const quota = await getOrCreateQuota(userId);
  const policy = await getPolicy(coupon.segment);
  if (quota.couponCount >= policy.maxCouponsPerMonth)
    return { ...base, valid: false, reason: "MONTHLY_QUOTA_REACHED" };

  return { ...base, valid: true };
}

/* ─── Preview coupon (calcul prix final sans rédemption) ─── */

export interface CouponPreviewResult extends CouponPreview {
  originalAmountUsdCents: number;
  discountAmountUsdCents: number;
  finalAmountUsdCents: number;
  expiresAt?: Date;
}

export async function previewCoupon(
  userId: string,
  code: string,
  originalAmountUsdCents: number,
  planCode?: string,
  addonCode?: string,
): Promise<CouponPreviewResult> {
  const validation = await validateCoupon(userId, code, planCode, addonCode);
  const discountPercent = validation.discountPercent ?? 0;
  const { discount: discountAmountUsdCents, final: finalAmountUsdCents } = validation.valid
    ? calcDiscount(originalAmountUsdCents, discountPercent)
    : { discount: 0, final: originalAmountUsdCents };

  return {
    ...validation,
    originalAmountUsdCents,
    discountAmountUsdCents,
    finalAmountUsdCents,
  };
}

/* ─── Redeem a coupon ─── */

export async function redeemCoupon(
  userId: string,
  code: string,
  originalAmountUsdCents: number,
  paymentOrderId?: string,
  subscriptionId?: string,
): Promise<{
  redemptionId: string;
  discountAmountUsdCents: number;
  finalAmountUsdCents: number;
}> {
  const preview = await validateCoupon(userId, code);
  if (!preview.valid) throw new Error(preview.reason ?? "INVALID_COUPON");

  const discountPercent = preview.discountPercent ?? 0;
  const { discount: discountAmountUsdCents, final: finalAmountUsdCents } = calcDiscount(originalAmountUsdCents, discountPercent);

  // Transactional: create redemption + update coupon + update quota
  const result = await prisma.$transaction(async (tx) => {
    // Full re-validation inside transaction to prevent TOCTOU races
    const coupon = await tx.incentiveCoupon.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { redemptions: { where: { userId, status: "APPLIED" } } },
    });
    if (!coupon || coupon.status !== "ACTIVE") throw new Error("COUPON_NO_LONGER_VALID");
    if (new Date() > coupon.expiresAt) throw new Error("EXPIRED");
    if (coupon.recipientUserId && coupon.recipientUserId !== userId) throw new Error("NOT_RECIPIENT");
    if (coupon.redemptions.length >= coupon.maxUsesPerUser) throw new Error("MAX_USES_PER_USER");

    // Atomic usedCount guard — prevents double-redemption under concurrency
    const updated = await tx.incentiveCoupon.updateMany({
      where: { id: coupon.id, usedCount: { lt: coupon.maxUses } },
      data: { usedCount: { increment: 1 } },
    });
    if (updated.count === 0) throw new Error("COUPON_NO_LONGER_VALID");

    const redemption = await tx.incentiveCouponRedemption.create({
      data: {
        couponId: coupon.id,
        userId,
        paymentOrderId,
        subscriptionId,
        originalAmountUsdCents,
        discountAmountUsdCents,
        finalAmountUsdCents,
        status: "APPLIED",
      },
    });

    // Update monthly quota
    const mk = monthKey();
    await tx.incentiveQuotaCounter.upsert({
      where: { userId_monthKey: { userId, monthKey: mk } },
      update: {
        couponCount: { increment: 1 },
        ...(discountPercent === 100 ? { coupon100Count: { increment: 1 } } : {}),
        ...(discountPercent === 80 ? { discount80Count: { increment: 1 } } : {}),
      },
      create: {
        userId,
        monthKey: mk,
        couponCount: 1,
        coupon100Count: discountPercent === 100 ? 1 : 0,
        discount80Count: discountPercent === 80 ? 1 : 0,
      },
    });

    return redemption;
  });

  return {
    redemptionId: result.id,
    discountAmountUsdCents,
    finalAmountUsdCents,
  };
}

/* ─── Apply coupon inside an existing Prisma transaction ─── */

export async function applyCouponToOrderTx(
  tx: Prisma.TransactionClient,
  userId: string,
  code: string,
  originalAmountUsdCents: number,
  paymentOrderId?: string,
  subscriptionId?: string,
): Promise<{
  redemptionId: string;
  discountPercent: number;
  discountAmountUsdCents: number;
  finalAmountUsdCents: number;
  couponCode: string;
}> {
  const normalized = code.trim().toUpperCase();
  const coupon = await tx.incentiveCoupon.findUnique({
    where: { code: normalized },
    include: { redemptions: { where: { userId, status: "APPLIED" } } },
  });

  if (!coupon || coupon.status !== "ACTIVE") throw new Error("COUPON_NO_LONGER_VALID");
  if (new Date() > coupon.expiresAt) throw new Error("EXPIRED");
  if (coupon.redemptions.length >= coupon.maxUsesPerUser) throw new Error("MAX_USES_PER_USER");
  if (coupon.recipientUserId && coupon.recipientUserId !== userId) throw new Error("NOT_RECIPIENT");

  // Atomic usedCount guard — prevents double-redemption under concurrency
  const usedUpdate = await tx.incentiveCoupon.updateMany({
    where: { id: coupon.id, usedCount: { lt: coupon.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  if (usedUpdate.count === 0) throw new Error("MAX_USES_REACHED");

  const discountPercent = coupon.discountPercent ?? 0;
  const { discount: discountAmountUsdCents, final: finalAmountUsdCents } = calcDiscount(originalAmountUsdCents, discountPercent);

  const redemption = await tx.incentiveCouponRedemption.create({
    data: {
      couponId: coupon.id,
      userId,
      paymentOrderId,
      subscriptionId,
      originalAmountUsdCents,
      discountAmountUsdCents,
      finalAmountUsdCents,
      status: "APPLIED",
    },
  });

  const mk = monthKey();
  await tx.incentiveQuotaCounter.upsert({
    where: { userId_monthKey: { userId, monthKey: mk } },
    update: {
      couponCount: { increment: 1 },
      ...(discountPercent === 100 ? { coupon100Count: { increment: 1 } } : {}),
      ...(discountPercent === 80 ? { discount80Count: { increment: 1 } } : {}),
    },
    create: {
      userId, monthKey: mk, couponCount: 1,
      coupon100Count: discountPercent === 100 ? 1 : 0,
      discount80Count: discountPercent === 80 ? 1 : 0,
    },
  });

  return {
    redemptionId: redemption.id,
    discountPercent,
    discountAmountUsdCents,
    finalAmountUsdCents,
    couponCode: normalized,
  };
}

/* ─── Create coupon (admin) ─── */

export interface CreateCouponInput {
  kind: CouponKind;
  discountPercent?: number;
  targetScope?: CouponTargetScope;
  targetPlanCodes?: string[];
  targetAddonCodes?: string[];
  maxUses?: number;
  maxUsesPerUser?: number;
  startsAt?: Date;
  expiresAt: Date;
  status?: CouponStatus;
  segment?: IncentiveSegment;
  recipientUserId?: string;
  metadata?: Record<string, unknown>;
}

export async function createCoupon(
  issuedById: string,
  input: CreateCouponInput,
) {
  const code = generateCode();

  // Reject expiresAt in the past
  if (input.expiresAt.getTime() <= Date.now()) {
    throw new Error("EXPIRES_AT_IN_PAST");
  }

  // 100% discount max 14 days enforcement
  if (input.discountPercent === 100) {
    const policy = await getPolicy(input.segment ?? "STANDARD");
    const maxMs = policy.coupon100MaxDays * 24 * 60 * 60 * 1000;
    const start = input.startsAt ?? new Date();
    if (input.expiresAt.getTime() - start.getTime() > maxMs) {
      throw new Error("COUPON_100_MAX_DURATION_EXCEEDED");
    }
  }

  return prisma.incentiveCoupon.create({
    data: {
      code,
      kind: input.kind,
      discountPercent: input.discountPercent,
      targetScope: input.targetScope ?? "ALL_PLANS",
      targetPlanCodes: input.targetPlanCodes ?? [],
      targetAddonCodes: input.targetAddonCodes ?? [],
      maxUses: input.maxUses ?? 1,
      maxUsesPerUser: input.maxUsesPerUser ?? 1,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      status: input.status ?? "ACTIVE",
      segment: input.segment ?? "STANDARD",
      issuedById,
      recipientUserId: input.recipientUserId,
      metadata: input.metadata as any,
    },
  });
}

/* ─── Admin: list coupons ─── */

export async function listCoupons(opts: {
  status?: CouponStatus;
  kind?: CouponKind;
  page?: number;
  limit?: number;
}) {
  const take = Math.min(opts.limit ?? 50, 100);
  const skip = ((opts.page ?? 1) - 1) * take;

  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.kind) where.kind = opts.kind;

  const [coupons, total] = await Promise.all([
    prisma.incentiveCoupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        recipient: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        _count: { select: { redemptions: true } },
      },
    }),
    prisma.incentiveCoupon.count({ where }),
  ]);

  return { coupons, total, page: (opts.page ?? 1), pageCount: Math.ceil(total / take) };
}

/* ─── Admin: update coupon ─── */

export async function updateCoupon(
  couponId: string,
  data: {
    status?: CouponStatus;
    expiresAt?: Date;
    maxUses?: number;
    maxUsesPerUser?: number;
  },
) {
  return prisma.incentiveCoupon.update({
    where: { id: couponId },
    data,
  });
}

/* ─── Admin: revoke coupon ─── */

export async function revokeCoupon(couponId: string) {
  return prisma.incentiveCoupon.update({
    where: { id: couponId },
    data: { status: "REVOKED" },
  });
}

/* ─── Admin: extend coupon ─── */

export async function extendCoupon(couponId: string, newExpiresAt: Date) {
  return prisma.incentiveCoupon.update({
    where: { id: couponId },
    data: { expiresAt: newExpiresAt },
  });
}

/* ─── Admin: send coupon to user ─── */

export async function assignCouponToUser(couponId: string, userId: string) {
  return prisma.incentiveCoupon.update({
    where: { id: couponId },
    data: { recipientUserId: userId },
  });
}

/* ─── Admin: get redemption history ─── */

export async function getRedemptions(opts: {
  couponId?: string;
  userId?: string;
  page?: number;
  limit?: number;
}) {
  const take = Math.min(opts.limit ?? 50, 100);
  const skip = ((opts.page ?? 1) - 1) * take;

  const where: Record<string, unknown> = {};
  if (opts.couponId) where.couponId = opts.couponId;
  if (opts.userId) where.userId = opts.userId;

  const [redemptions, total] = await Promise.all([
    prisma.incentiveCouponRedemption.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        coupon: { select: { code: true, kind: true, discountPercent: true } },
        user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
      },
    }),
    prisma.incentiveCouponRedemption.count({ where }),
  ]);

  return { redemptions, total, page: (opts.page ?? 1), pageCount: Math.ceil(total / take) };
}

/* ─── Admin: monthly quotas dashboard ─── */

export async function getQuotaDashboard(userId?: string) {
  const mk = monthKey();
  const where: Record<string, unknown> = { monthKey: mk };
  if (userId) where.userId = userId;

  const counters = await prisma.incentiveQuotaCounter.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
    },
    orderBy: { couponCount: "desc" },
    take: 50,
  });

  return counters;
}

/* ─── Policy engine: auto-select incentive for a user ─── */

export async function selectIncentiveForUser(
  userId: string,
  context: { segment?: IncentiveSegment } = {},
) {
  const segment = context.segment ?? "STANDARD";
  const policy = await getPolicy(segment);
  const quota = await getOrCreateQuota(userId);

  // Global pause check
  if (!policy.isActive) return null;

  // Check coupon eligibility (1/10 chance)
  const couponRoll = Math.random();
  if (couponRoll > policy.couponProbability) return null;

  // Check monthly quota
  if (quota.couponCount >= policy.maxCouponsPerMonth) return null;

  // Select discount percent (pondération Chantier D2)
  const allowed = policy.allowedDiscounts.filter((d) => {
    if (d === 100 && quota.coupon100Count > 0) return false; // limit 100% frequency
    if (d === 80 && quota.discount80Count >= policy.maxDiscount80PerMonth) return false;
    return true;
  });
  if (allowed.length === 0) return null;

  const weights = parseDiscountWeights(policy.discountWeights);
  const discountPercent = weightedPickDiscount(allowed, weights);

  // Generate a targeted coupon for this user
  const expiresAt = new Date();
  if (discountPercent === 100) {
    expiresAt.setDate(expiresAt.getDate() + policy.coupon100MaxDays);
  } else {
    expiresAt.setDate(expiresAt.getDate() + 30);
  }

  try {
    const coupon = await createCoupon("system", {
      kind: "PLAN_DISCOUNT",
      discountPercent,
      expiresAt,
      segment,
      recipientUserId: userId,
      status: "ACTIVE",
      metadata: { autoGenerated: true, engine: "incentive-v1" },
    });

    return {
      couponCode: coupon.code,
      discountPercent,
      expiresAt: coupon.expiresAt,
      kind: coupon.kind,
    };
  } catch (err) {
    logger.warn({ err, userId, discountPercent }, "[Incentive] Failed to create auto-coupon");
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
   Growth Grants Engine — CPC / CPI / CPA
   ═══════════════════════════════════════════════════════════════ */

/* ─── Emit a growth grant (CPC/CPI/CPA) for a user ─── */

export async function emitGrowthGrant(
  userId: string,
  kind: "CPC" | "CPI" | "CPA",
  context: {
    segment?: IncentiveSegment;
    addonCode?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<{
  grantId: string;
  kind: string;
  discountPercent: number | null;
  addonCode: string | null;
  expiresAt: Date;
} | null> {
  const segment = context.segment ?? "STANDARD";
  const policy = await getPolicy(segment);
  const quota = await getOrCreateQuota(userId);

  // Global pause check
  if (!policy.isActive) return null;

  // Gate probabiliste 1/10
  if (Math.random() > policy.growthProbability) return null;

  // Quota globale CPC+CPI+CPA max 15/mois
  const totalGrants = quota.cpcCount + quota.cpiCount + quota.cpaCount;
  if (totalGrants >= policy.maxGrowthGrantsPerMonth) return null;

  // Déterminer le type de gain
  let discountPercent: number | null = null;
  let addonCode: string | null = context.addonCode ?? null;
  let grantKind: CouponKind = kind;

  // Segment TESTER : possibilité ADDON_FREE_GAIN (max 1/mois)
  if (segment === "TESTER" && quota.addonGainCount < policy.maxAddonGainPerMonth && Math.random() < 0.15) {
    grantKind = "ADDON_FREE_GAIN";
    addonCode = addonCode ?? "IA_MERCHANT";
    discountPercent = 100;
  } else {
    // Sélection discount avec contrainte max 3 à 80% — pondération Chantier D2
    const allowed = policy.allowedDiscounts.filter((d) => {
      if (d === 80 && quota.discount80Count >= policy.maxDiscount80PerMonth) return false;
      return true;
    });
    if (allowed.length === 0) return null;
    const weights = parseDiscountWeights(policy.discountWeights);
    discountPercent = weightedPickDiscount(allowed, weights);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (discountPercent === 100 ? policy.coupon100MaxDays : 30));

  // Créer le grant + update quota en transaction
  const grant = await prisma.$transaction(async (tx) => {
    const g = await tx.growthIncentiveGrant.create({
      data: {
        userId,
        kind: grantKind,
        discountPercent,
        addonCode,
        status: "ACTIVE",
        expiresAt,
        metadata: {
          segment,
          engine: "growth-v1",
          ...context.metadata,
        },
      },
    });

    // Log l'événement de création
    await tx.growthIncentiveEvent.create({
      data: {
        grantId: g.id,
        userId,
        eventType: "grant_created",
        metadata: { kind: grantKind, discountPercent, addonCode },
      },
    });

    // Update quota
    const quotaField = kind === "CPC" ? "cpcCount" : kind === "CPI" ? "cpiCount" : "cpaCount";
    const mk = monthKey();
    await tx.incentiveQuotaCounter.upsert({
      where: { userId_monthKey: { userId, monthKey: mk } },
      update: {
        [quotaField]: { increment: 1 },
        ...(discountPercent === 80 ? { discount80Count: { increment: 1 } } : {}),
        ...(grantKind === "ADDON_FREE_GAIN" ? { addonGainCount: { increment: 1 } } : {}),
      },
      create: {
        userId, monthKey: mk,
        [quotaField]: 1,
        discount80Count: discountPercent === 80 ? 1 : 0,
        addonGainCount: grantKind === "ADDON_FREE_GAIN" ? 1 : 0,
      },
    });

    return g;
  });

  logger.info({ userId, grantId: grant.id, kind: grantKind, discountPercent }, "[Incentive] Growth grant emitted");

  return {
    grantId: grant.id,
    kind: grantKind,
    discountPercent,
    addonCode,
    expiresAt: grant.expiresAt,
  };
}

/* ─── Record a growth event (click, install, action) ─── */

export async function recordGrowthEvent(
  grantId: string,
  userId: string,
  eventType: "click" | "install" | "action" | "conversion",
  metadata?: Record<string, unknown>,
) {
  const grant = await prisma.growthIncentiveGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.userId !== userId) throw new Error("GRANT_NOT_FOUND");
  if (grant.status !== "ACTIVE") throw new Error("GRANT_NOT_ACTIVE");

  const event = await prisma.growthIncentiveEvent.create({
    data: { grantId, userId, eventType, metadata: (metadata ?? {}) as Prisma.InputJsonValue },
  });

  // Sur conversion → transactionnel : consommer le grant + générer un coupon
  if (eventType === "conversion") {
    await prisma.$transaction(async (tx) => {
      // Re-check status inside tx to prevent double-conversion race
      const freshGrant = await tx.growthIncentiveGrant.findUnique({ where: { id: grantId } });
      if (!freshGrant || freshGrant.status !== "ACTIVE") throw new Error("GRANT_ALREADY_CONSUMED");

      await tx.growthIncentiveGrant.update({
        where: { id: grantId },
        data: { status: "CONSUMED" },
      });

      // Créer un coupon de récompense associé au grant
      if (freshGrant.discountPercent) {
        const expiresAt = freshGrant.expiresAt > new Date() ? freshGrant.expiresAt : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const coupon = await tx.incentiveCoupon.create({
          data: {
            code: generateCode(),
            kind: freshGrant.kind as CouponKind,
            discountPercent: freshGrant.discountPercent,
            expiresAt,
            recipientUserId: userId,
            status: "ACTIVE",
            segment: "STANDARD",
            issuedById: "system",
            metadata: { fromGrant: grantId, engine: "growth-v1" },
          },
        });
        logger.info({ grantId, couponCode: coupon.code }, "[Incentive] Grant converted → coupon created");

        // Notify user via IA Messager (outside tx, best-effort)
        try {
          await sendGrantConvertedToCouponMessage(userId, grantId, coupon.code, freshGrant.discountPercent, coupon.expiresAt);
        } catch (err) {
          logger.warn({ err, grantId, userId }, "[Incentive] Failed to notify grant conversion");
        }
      }
    });
  }

  return event;
}

/* ─── Record a growth event with idempotency key ─── */

export async function recordGrowthEventIdempotent(
  grantId: string,
  userId: string,
  eventType: "click" | "install" | "action" | "conversion",
  idempotencyKey: string,
  metadata?: Record<string, unknown>,
) {
  // Check idempotency: no duplicate for same key
  const existing = await prisma.growthIncentiveEvent.findFirst({
    where: {
      grantId,
      userId,
      metadata: { path: ["idempotencyKey"], equals: idempotencyKey },
    },
  });
  if (existing) return { event: existing, duplicate: true };

  const event = await recordGrowthEvent(grantId, userId, eventType, {
    ...metadata,
    idempotencyKey,
  });
  return { event, duplicate: false };
}

/* ─── List growth grants (admin) ─── */

export async function listGrowthGrants(opts: {
  userId?: string;
  kind?: CouponKind;
  status?: GrantStatus;
  page?: number;
  limit?: number;
}) {
  const take = Math.min(opts.limit ?? 50, 100);
  const skip = ((opts.page ?? 1) - 1) * take;

  const where: Record<string, unknown> = {};
  if (opts.userId) where.userId = opts.userId;
  if (opts.kind) where.kind = opts.kind;
  if (opts.status) where.status = opts.status;

  const [grants, total] = await Promise.all([
    prisma.growthIncentiveGrant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        _count: { select: { events: true } },
      },
    }),
    prisma.growthIncentiveGrant.count({ where }),
  ]);

  return { grants, total, page: opts.page ?? 1, pageCount: Math.ceil(total / take) };
}

/* ─── Revoke a growth grant ─── */

export async function revokeGrowthGrant(grantId: string) {
  return prisma.growthIncentiveGrant.update({
    where: { id: grantId },
    data: { status: "REVOKED" },
  });
}

/* ═══════════════════════════════════════════════════════════════
   USER SELF-SERVICE — Mes avantages IA (Chantier D Phase D1)
   ═══════════════════════════════════════════════════════════════ */

export interface MyGrantSummary {
  grantId: string;
  kind: string;
  discountPercent: number | null;
  addonCode: string | null;
  status: GrantStatus;
  expiresAt: Date;
  createdAt: Date;
  convertible: boolean;
}

export interface MyCouponSummary {
  couponId: string;
  code: string;
  kind: CouponKind;
  discountPercent: number | null;
  status: CouponStatus;
  expiresAt: Date;
  usedCount: number;
  maxUses: number;
  maxUsesPerUser: number;
  createdAt: Date;
  fromGrantId: string | null;
}

/** Liste les grants d'un utilisateur (self). */
export async function listMyGrants(userId: string): Promise<MyGrantSummary[]> {
  const grants = await prisma.growthIncentiveGrant.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const now = new Date();
  return grants.map((g) => ({
    grantId: g.id,
    kind: g.kind,
    discountPercent: g.discountPercent,
    addonCode: g.addonCode,
    status: g.status,
    expiresAt: g.expiresAt,
    createdAt: g.createdAt,
    convertible: g.status === "ACTIVE" && g.expiresAt > now && g.discountPercent != null,
  }));
}

/** Liste les coupons d'un utilisateur (self). */
export async function listMyCoupons(userId: string): Promise<MyCouponSummary[]> {
  const coupons = await prisma.incentiveCoupon.findMany({
    where: { recipientUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return coupons.map((c) => ({
    couponId: c.id,
    code: c.code,
    kind: c.kind,
    discountPercent: c.discountPercent,
    status: c.status,
    expiresAt: c.expiresAt,
    usedCount: c.usedCount,
    maxUses: c.maxUses,
    maxUsesPerUser: c.maxUsesPerUser,
    createdAt: c.createdAt,
    fromGrantId: (c.metadata as Record<string, unknown> | null)?.fromGrant as string | undefined ?? null,
  }));
}

/**
 * Convertit un grant ACTIVE en coupon pour l'utilisateur qui le détient.
 * - Auth : grant.userId doit correspondre à userId
 * - Idempotence : un grant déjà CONSUMED/EXPIRED/REVOKED → erreur claire
 * - Race safe : transactionnel avec re-check status
 * - Effet : grant.status = CONSUMED, coupon ACTIVE créé, notification envoyée
 */
export async function convertGrantToCoupon(
  userId: string,
  grantId: string,
): Promise<{
  grantId: string;
  couponCode: string;
  discountPercent: number;
  expiresAt: Date;
}> {
  const grant = await prisma.growthIncentiveGrant.findUnique({ where: { id: grantId } });
  if (!grant) throw new Error("GRANT_NOT_FOUND");
  if (grant.userId !== userId) throw new Error("GRANT_NOT_OWNED");
  if (grant.status !== "ACTIVE") throw new Error("GRANT_NOT_ACTIVE");
  if (grant.expiresAt <= new Date()) throw new Error("GRANT_EXPIRED");
  if (grant.discountPercent == null) throw new Error("GRANT_NOT_CONVERTIBLE");

  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.growthIncentiveGrant.findUnique({ where: { id: grantId } });
    if (!fresh || fresh.status !== "ACTIVE") throw new Error("GRANT_ALREADY_CONSUMED");

    await tx.growthIncentiveGrant.update({
      where: { id: grantId },
      data: { status: "CONSUMED" },
    });

    // Expiry coupon = max(grant.expiresAt, +14 days)
    const expiresAt = fresh.expiresAt > new Date()
      ? fresh.expiresAt
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const coupon = await tx.incentiveCoupon.create({
      data: {
        code: generateCode(),
        kind: fresh.kind,
        discountPercent: fresh.discountPercent,
        expiresAt,
        recipientUserId: userId,
        status: "ACTIVE",
        segment: "STANDARD",
        issuedById: "user-self-convert",
        metadata: { fromGrant: grantId, engine: "growth-v1", selfConvert: true },
      },
    });

    await tx.growthIncentiveEvent.create({
      data: {
        grantId,
        userId,
        eventType: "conversion",
        metadata: { selfConvert: true, couponCode: coupon.code },
      },
    });

    return { couponCode: coupon.code, discountPercent: fresh.discountPercent!, expiresAt };
  });

  logger.info({ userId, grantId, couponCode: result.couponCode }, "[Incentive] User self-converted grant → coupon");

  // Notify via IA Messager (best-effort, outside tx)
  try {
    await sendGrantConvertedToCouponMessage(userId, grantId, result.couponCode, result.discountPercent, result.expiresAt);
  } catch (err) {
    logger.warn({ err, userId, grantId }, "[Incentive] Failed to notify self-conversion");
  }

  return { grantId, ...result };
}

/* ─── Delete coupon (hard delete) ─── */

export async function deleteCoupon(couponId: string) {
  // Vérifier qu'il n'y a pas de rédemptions actives
  const redemptions = await prisma.incentiveCouponRedemption.count({
    where: { couponId, status: "APPLIED" },
  });
  if (redemptions > 0) throw new Error("CANNOT_DELETE_COUPON_WITH_REDEMPTIONS");

  await prisma.incentiveCouponRedemption.deleteMany({ where: { couponId } });
  return prisma.incentiveCoupon.delete({ where: { id: couponId } });
}

/* ═══════════════════════════════════════════════════════════════
   Jobs — Expiration + Rééquilibrage 15% coupons 100%
   ═══════════════════════════════════════════════════════════════ */

/* ─── Expire stale coupons and grants ─── */

export async function runExpirationJob(): Promise<{ expiredCoupons: number; expiredGrants: number }> {
  const now = new Date();

  const expiredCoupons = await prisma.incentiveCoupon.updateMany({
    where: { status: "ACTIVE", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  const expiredGrants = await prisma.growthIncentiveGrant.updateMany({
    where: { status: { in: ["PENDING", "ACTIVE"] }, expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  if (expiredCoupons.count > 0 || expiredGrants.count > 0) {
    logger.info({ expiredCoupons: expiredCoupons.count, expiredGrants: expiredGrants.count }, "[Incentive] Expiration job completed");
  }

  return { expiredCoupons: expiredCoupons.count, expiredGrants: expiredGrants.count };
}

/* ─── Rééquilibrage : garantir >= 15% de distributions sont 100% ce mois ─── */

export async function runRebalance100Job(): Promise<{ generated: number }> {
  const mk = monthKey();
  const policy = await getPolicy("STANDARD");

  // Compter total distributions et 100% ce mois
  const totals = await prisma.incentiveQuotaCounter.aggregate({
    where: { monthKey: mk },
    _sum: { couponCount: true, coupon100Count: true },
  });

  const totalCoupons = totals._sum.couponCount ?? 0;
  const total100 = totals._sum.coupon100Count ?? 0;

  if (totalCoupons === 0) return { generated: 0 };

  const currentRatio = total100 / totalCoupons;
  if (currentRatio >= policy.target100Ratio) return { generated: 0 };

  // Calculer combien de 100% manquent
  const target100Count = Math.ceil(totalCoupons * policy.target100Ratio);
  const deficit = target100Count - total100;
  if (deficit <= 0) return { generated: 0 };

  // Trouver des users éligibles (quota pas pleine, pas déjà trop de 100%)
  const eligibleQuotas = await prisma.incentiveQuotaCounter.findMany({
    where: {
      monthKey: mk,
      couponCount: { lt: policy.maxCouponsPerMonth },
      coupon100Count: { equals: 0 },
    },
    select: { userId: true },
    take: deficit * 2,
  });

  let generated = 0;
  for (const q of eligibleQuotas) {
    if (generated >= deficit) break;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + policy.coupon100MaxDays);

    try {
      await createCoupon("system", {
        kind: "PLAN_DISCOUNT",
        discountPercent: 100,
        expiresAt,
        recipientUserId: q.userId,
        metadata: { autoGenerated: true, engine: "rebalance-100-v1", monthKey: mk },
      });
      generated++;
    } catch {
      // quota/policy error — skip
    }
  }

  if (generated > 0) {
    logger.info({ deficit, generated, currentRatio, targetRatio: policy.target100Ratio }, "[Incentive] Rebalance 100% job completed");
  }

  return { generated };
}

/* ═══════════════════════════════════════════════════════════════
   Super-admin policy controls
   ═══════════════════════════════════════════════════════════════ */

/* ─── Get current policy ─── */

export async function getPolicies() {
  return prisma.incentivePolicy.findMany();
}

/* ─── Update policy ─── */

export async function updatePolicy(
  segment: IncentiveSegment,
  adminUserId: string,
  data: {
    couponProbability?: number;
    growthProbability?: number;
    maxCouponsPerMonth?: number;
    maxGrowthGrantsPerMonth?: number;
    maxDiscount80PerMonth?: number;
    maxAddonGainPerMonth?: number;
    coupon100MaxDays?: number;
    target100Ratio?: number;
    allowedDiscounts?: number[];
    globalPause?: boolean;
  },
) {
  const before = await getPolicy(segment);

  const updated = await prisma.incentivePolicy.update({
    where: { segment },
    data: {
      ...(data.couponProbability !== undefined ? { couponProbability: data.couponProbability } : {}),
      ...(data.growthProbability !== undefined ? { growthProbability: data.growthProbability } : {}),
      ...(data.maxCouponsPerMonth !== undefined ? { maxCouponsPerMonth: data.maxCouponsPerMonth } : {}),
      ...(data.maxGrowthGrantsPerMonth !== undefined ? { maxGrowthGrantsPerMonth: data.maxGrowthGrantsPerMonth } : {}),
      ...(data.maxDiscount80PerMonth !== undefined ? { maxDiscount80PerMonth: data.maxDiscount80PerMonth } : {}),
      ...(data.maxAddonGainPerMonth !== undefined ? { maxAddonGainPerMonth: data.maxAddonGainPerMonth } : {}),
      ...(data.coupon100MaxDays !== undefined ? { coupon100MaxDays: data.coupon100MaxDays } : {}),
      ...(data.target100Ratio !== undefined ? { target100Ratio: data.target100Ratio } : {}),
      ...(data.allowedDiscounts !== undefined ? { allowedDiscounts: data.allowedDiscounts } : {}),
      ...(data.globalPause !== undefined ? { isActive: !data.globalPause } : {}),
    },
  });

  // Audit log
  await prisma.aiAutonomyLog.create({
    data: {
      agentName: "SUPER_ADMIN",
      actionType: "POLICY_UPDATE",
      targetUserId: adminUserId,
      decision: `Policy ${segment} updated`,
      reasoning: JSON.stringify({ before: { couponProbability: before.couponProbability, growthProbability: before.growthProbability, isActive: before.isActive }, after: data }),
      success: true,
    },
  });

  logger.info({ segment, adminUserId, data }, "[Incentive] Policy updated by admin");
  invalidatePolicyCache(segment);
  return updated;
}

/* ─── Global pause toggle ─── */

export async function setGlobalPause(adminUserId: string, paused: boolean) {
  const segments: IncentiveSegment[] = ["STANDARD", "TESTER"];
  for (const segment of segments) {
    await prisma.incentivePolicy.update({
      where: { segment },
      data: { isActive: !paused },
    });
  }
  await prisma.aiAutonomyLog.create({
    data: {
      agentName: "SUPER_ADMIN",
      actionType: "GLOBAL_PAUSE",
      targetUserId: adminUserId,
      decision: paused ? "Incentives globally paused" : "Incentives globally resumed",
      reasoning: JSON.stringify({ paused }),
      success: true,
    },
  });
  invalidatePolicyCache(); // Clear all segments
  return { paused };
}

/* ─── Override quota for a specific user ─── */

export async function overrideUserQuota(
  adminUserId: string,
  userId: string,
  overrides: {
    couponCount?: number;
    cpcCount?: number;
    cpiCount?: number;
    cpaCount?: number;
    discount80Count?: number;
    addonGainCount?: number;
    coupon100Count?: number;
  },
) {
  const mk = monthKey();
  const updated = await prisma.incentiveQuotaCounter.upsert({
    where: { userId_monthKey: { userId, monthKey: mk } },
    update: overrides,
    create: { userId, monthKey: mk, ...overrides },
  });

  await prisma.aiAutonomyLog.create({
    data: {
      agentName: "SUPER_ADMIN",
      actionType: "QUOTA_OVERRIDE",
      targetUserId: userId,
      decision: `Quota override by ${adminUserId}`,
      reasoning: JSON.stringify(overrides),
      success: true,
    },
  });

  logger.info({ adminUserId, userId, overrides }, "[Incentive] Quota overridden by admin");
  return updated;
}

/* ─── Force emit grant for a user ─── */

export async function forceEmitGrant(
  adminUserId: string,
  userId: string,
  kind: "CPC" | "CPI" | "CPA",
  discountPercent: number,
  expiresInDays: number = 30,
) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const grant = await prisma.$transaction(async (tx) => {
    const g = await tx.growthIncentiveGrant.create({
      data: {
        userId,
        kind,
        discountPercent,
        status: "ACTIVE",
        expiresAt,
        metadata: { forcedBy: adminUserId, engine: "admin-force" },
      },
    });
    await tx.growthIncentiveEvent.create({
      data: {
        grantId: g.id,
        userId,
        eventType: "grant_created",
        metadata: { kind, discountPercent, forcedBy: adminUserId },
      },
    });
    return g;
  });

  await prisma.aiAutonomyLog.create({
    data: {
      agentName: "SUPER_ADMIN",
      actionType: "FORCE_GRANT",
      targetUserId: userId,
      decision: `Force grant ${kind} -${discountPercent}% by ${adminUserId}`,
      reasoning: JSON.stringify({ grantId: grant.id, kind, discountPercent, expiresInDays }),
      success: true,
    },
  });

  return grant;
}

/* ─── Admin audit log ─── */

export async function getAdminAuditLog(opts: { page?: number; limit?: number }) {
  const take = Math.min(opts.limit ?? 50, 100);
  const skip = ((opts.page ?? 1) - 1) * take;

  const [logs, total] = await Promise.all([
    prisma.aiAutonomyLog.findMany({
      where: { agentName: "SUPER_ADMIN" },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.aiAutonomyLog.count({ where: { agentName: "SUPER_ADMIN" } }),
  ]);

  return { logs, total, page: opts.page ?? 1, pageCount: Math.ceil(total / take) };
}

/* ═══════════════════════════════════════════════════════════════
   Diagnostic — Explainability (V2-P8)
   ═══════════════════════════════════════════════════════════════ */

export async function diagnosticUser(userId: string) {
  const mk = monthKey();
  const quota = await getOrCreateQuota(userId);

  // Get both policies
  const standardPolicy = await getPolicy("STANDARD");
  const testerPolicy = await getPolicy("TESTER");

  // Recent coupons
  const recentCoupons = await prisma.incentiveCoupon.findMany({
    where: { recipientUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { code: true, kind: true, discountPercent: true, status: true, expiresAt: true, createdAt: true },
  });

  // Recent grants
  const recentGrants = await prisma.growthIncentiveGrant.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, kind: true, discountPercent: true, status: true, expiresAt: true, createdAt: true },
  });

  // Recent events
  const recentEvents = await prisma.growthIncentiveEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, grantId: true, eventType: true, metadata: true, createdAt: true },
  });

  // Recent redemptions
  const recentRedemptions = await prisma.incentiveCouponRedemption.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { coupon: { select: { code: true, discountPercent: true } } },
  });

  // Decision trace
  const totalGrants = quota.cpcCount + quota.cpiCount + quota.cpaCount;
  const decisionTrace = {
    coupon: {
      eligible: quota.couponCount < standardPolicy.maxCouponsPerMonth,
      currentCount: quota.couponCount,
      maxAllowed: standardPolicy.maxCouponsPerMonth,
      policyActive: standardPolicy.isActive,
      probability: standardPolicy.couponProbability,
      reason: !standardPolicy.isActive
        ? "POLICY_PAUSED"
        : quota.couponCount >= standardPolicy.maxCouponsPerMonth
          ? "MONTHLY_QUOTA_REACHED"
          : "ELIGIBLE_PENDING_RANDOM",
    },
    growth: {
      eligible: totalGrants < standardPolicy.maxGrowthGrantsPerMonth,
      currentTotal: totalGrants,
      cpc: quota.cpcCount,
      cpi: quota.cpiCount,
      cpa: quota.cpaCount,
      maxAllowed: standardPolicy.maxGrowthGrantsPerMonth,
      policyActive: standardPolicy.isActive,
      probability: standardPolicy.growthProbability,
      discount80Remaining: standardPolicy.maxDiscount80PerMonth - quota.discount80Count,
      addonGainRemaining: standardPolicy.maxAddonGainPerMonth - quota.addonGainCount,
      reason: !standardPolicy.isActive
        ? "POLICY_PAUSED"
        : totalGrants >= standardPolicy.maxGrowthGrantsPerMonth
          ? "MONTHLY_QUOTA_REACHED"
          : "ELIGIBLE_PENDING_RANDOM",
    },
  };

  return {
    userId,
    monthKey: mk,
    quota,
    policies: { standard: standardPolicy, tester: testerPolicy },
    decisionTrace,
    recentCoupons,
    recentGrants,
    recentEvents,
    recentRedemptions,
  };
}

/* ═══════════════════════════════════════════════════════════════
   Stats / KPIs (V2-P11)
   ═══════════════════════════════════════════════════════════════ */

export async function getIncentiveStats() {
  const mk = monthKey();
  const now = new Date();

  const [
    totalCoupons,
    activeCoupons,
    totalRedemptions,
    totalGrants,
    activeGrants,
    consumedGrants,
    monthlyQuotas,
  ] = await Promise.all([
    prisma.incentiveCoupon.count(),
    prisma.incentiveCoupon.count({ where: { status: "ACTIVE" } }),
    prisma.incentiveCouponRedemption.count({ where: { status: "APPLIED" } }),
    prisma.growthIncentiveGrant.count(),
    prisma.growthIncentiveGrant.count({ where: { status: "ACTIVE" } }),
    prisma.growthIncentiveGrant.count({ where: { status: "CONSUMED" } }),
    prisma.incentiveQuotaCounter.aggregate({
      where: { monthKey: mk },
      _sum: {
        couponCount: true,
        coupon100Count: true,
        cpcCount: true,
        cpiCount: true,
        cpaCount: true,
        discount80Count: true,
        addonGainCount: true,
      },
      _count: true,
    }),
  ]);

  const sums = monthlyQuotas._sum;
  const totalMonthCoupons = sums.couponCount ?? 0;
  const total100 = sums.coupon100Count ?? 0;
  const ratio100 = totalMonthCoupons > 0 ? total100 / totalMonthCoupons : 0;

  // Conversion rate: consumed / total grants
  const conversionRate = totalGrants > 0 ? consumedGrants / totalGrants : 0;

  return {
    overview: {
      totalCoupons,
      activeCoupons,
      totalRedemptions,
      totalGrants,
      activeGrants,
      consumedGrants,
      conversionRate: Math.round(conversionRate * 10000) / 100,
    },
    monthly: {
      monthKey: mk,
      uniqueUsers: monthlyQuotas._count,
      couponsDistributed: totalMonthCoupons,
      coupons100Distributed: total100,
      ratio100Percent: Math.round(ratio100 * 10000) / 100,
      cpcGrants: sums.cpcCount ?? 0,
      cpiGrants: sums.cpiCount ?? 0,
      cpaGrants: sums.cpaCount ?? 0,
      discount80Used: sums.discount80Count ?? 0,
      addonGainsUsed: sums.addonGainCount ?? 0,
    },
  };
}
