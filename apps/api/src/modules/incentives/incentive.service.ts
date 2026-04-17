/**
 * Incentive Engine — coupon validation, generation, quotas, redemption
 */
import { prisma } from "../../shared/db/prisma.js";
import { randomBytes } from "crypto";
import type {
  CouponKind,
  CouponStatus,
  CouponTargetScope,
  IncentiveSegment,
  RedemptionStatus,
} from "@prisma/client";

/* ─── Helpers ─── */

function monthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function generateCode(prefix = "KS"): string {
  return `${prefix}-${randomBytes(4).toString("hex").toUpperCase()}`;
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

async function getPolicy(segment: IncentiveSegment = "STANDARD") {
  const policy = await prisma.incentivePolicy.findUnique({
    where: { segment },
  });
  if (!policy) throw new Error(`No IncentivePolicy for segment ${segment}`);
  return policy;
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
  };

  if (!coupon) return { ...base, valid: false, reason: "INVALID_CODE" };
  if (coupon.status !== "ACTIVE") return { ...base, valid: false, reason: "COUPON_INACTIVE" };

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
  const discountAmountUsdCents = Math.round(
    originalAmountUsdCents * (discountPercent / 100),
  );
  const finalAmountUsdCents = Math.max(
    0,
    originalAmountUsdCents - discountAmountUsdCents,
  );

  // Transactional: create redemption + update coupon + update quota
  const result = await prisma.$transaction(async (tx) => {
    // Double check inside transaction
    const coupon = await tx.incentiveCoupon.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!coupon || coupon.status !== "ACTIVE" || coupon.usedCount >= coupon.maxUses) {
      throw new Error("COUPON_NO_LONGER_VALID");
    }

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

    await tx.incentiveCoupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
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

  // Check coupon eligibility (1/10 chance)
  const couponRoll = Math.random();
  if (couponRoll > policy.couponProbability) return null;

  // Check monthly quota
  if (quota.couponCount >= policy.maxCouponsPerMonth) return null;

  // Select discount percent
  const allowed = policy.allowedDiscounts.filter((d) => {
    if (d === 100 && quota.coupon100Count > 0) return false; // limit 100% frequency
    if (d === 80 && quota.discount80Count >= policy.maxDiscount80PerMonth) return false;
    return true;
  });
  if (allowed.length === 0) return null;

  const discountPercent = allowed[Math.floor(Math.random() * allowed.length)];

  // Generate a targeted coupon for this user
  const expiresAt = new Date();
  if (discountPercent === 100) {
    expiresAt.setDate(expiresAt.getDate() + policy.coupon100MaxDays);
  } else {
    expiresAt.setDate(expiresAt.getDate() + 30);
  }

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
}
