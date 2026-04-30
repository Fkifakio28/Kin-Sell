-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PLAN_DISCOUNT', 'ADDON_DISCOUNT', 'ADDON_FREE_GAIN', 'CPC', 'CPI', 'CPA');

-- CreateEnum
CREATE TYPE "CouponTargetScope" AS ENUM ('ALL_PLANS', 'USER_PLANS', 'BUSINESS_PLANS', 'ALL_ADDONS', 'SPECIFIC');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('APPLIED', 'REJECTED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'CONSUMED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "IncentiveSegment" AS ENUM ('STANDARD', 'TESTER');

-- CreateTable
CREATE TABLE "IncentiveCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "CouponKind" NOT NULL,
    "discountPercent" INTEGER,
    "targetScope" "CouponTargetScope" NOT NULL DEFAULT 'ALL_PLANS',
    "targetPlanCodes" TEXT[],
    "targetAddonCodes" TEXT[],
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "maxUsesPerUser" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'DRAFT',
    "segment" "IncentiveSegment" NOT NULL DEFAULT 'STANDARD',
    "issuedByEngine" BOOLEAN NOT NULL DEFAULT false,
    "issuedById" TEXT,
    "recipientUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveCouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "subscriptionId" TEXT,
    "originalAmountUsdCents" INTEGER NOT NULL,
    "discountAmountUsdCents" INTEGER NOT NULL,
    "finalAmountUsdCents" INTEGER NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'APPLIED',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncentiveCouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveQuotaCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "couponCount" INTEGER NOT NULL DEFAULT 0,
    "coupon100Count" INTEGER NOT NULL DEFAULT 0,
    "cpcCount" INTEGER NOT NULL DEFAULT 0,
    "cpiCount" INTEGER NOT NULL DEFAULT 0,
    "cpaCount" INTEGER NOT NULL DEFAULT 0,
    "discount80Count" INTEGER NOT NULL DEFAULT 0,
    "addonGainCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IncentiveQuotaCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthIncentiveGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CouponKind" NOT NULL,
    "discountPercent" INTEGER,
    "addonCode" TEXT,
    "status" "GrantStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthIncentiveGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthIncentiveEvent" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthIncentiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentivePolicy" (
    "id" TEXT NOT NULL,
    "segment" "IncentiveSegment" NOT NULL DEFAULT 'STANDARD',
    "allowedDiscounts" INTEGER[],
    "maxCouponsPerMonth" INTEGER NOT NULL DEFAULT 7,
    "maxGrowthGrantsPerMonth" INTEGER NOT NULL DEFAULT 15,
    "maxDiscount80PerMonth" INTEGER NOT NULL DEFAULT 3,
    "maxAddonGainPerMonth" INTEGER NOT NULL DEFAULT 1,
    "couponProbability" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "growthProbability" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "target100Ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "coupon100MaxDays" INTEGER NOT NULL DEFAULT 14,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentivePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveCoupon_code_key" ON "IncentiveCoupon"("code");
CREATE INDEX "IncentiveCoupon_code_idx" ON "IncentiveCoupon"("code");
CREATE INDEX "IncentiveCoupon_recipientUserId_status_expiresAt_idx" ON "IncentiveCoupon"("recipientUserId", "status", "expiresAt");
CREATE INDEX "IncentiveCoupon_kind_status_createdAt_idx" ON "IncentiveCoupon"("kind", "status", "createdAt");
CREATE INDEX "IncentiveCoupon_status_expiresAt_idx" ON "IncentiveCoupon"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "IncentiveCouponRedemption_couponId_idx" ON "IncentiveCouponRedemption"("couponId");
CREATE INDEX "IncentiveCouponRedemption_userId_createdAt_idx" ON "IncentiveCouponRedemption"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveQuotaCounter_userId_monthKey_key" ON "IncentiveQuotaCounter"("userId", "monthKey");
CREATE INDEX "IncentiveQuotaCounter_userId_monthKey_idx" ON "IncentiveQuotaCounter"("userId", "monthKey");

-- CreateIndex
CREATE INDEX "GrowthIncentiveGrant_userId_status_idx" ON "GrowthIncentiveGrant"("userId", "status");
CREATE INDEX "GrowthIncentiveGrant_kind_status_idx" ON "GrowthIncentiveGrant"("kind", "status");
CREATE INDEX "GrowthIncentiveGrant_expiresAt_idx" ON "GrowthIncentiveGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "GrowthIncentiveEvent_grantId_idx" ON "GrowthIncentiveEvent"("grantId");
CREATE INDEX "GrowthIncentiveEvent_userId_createdAt_idx" ON "GrowthIncentiveEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncentivePolicy_segment_key" ON "IncentivePolicy"("segment");

-- AddForeignKey
ALTER TABLE "IncentiveCoupon" ADD CONSTRAINT "IncentiveCoupon_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IncentiveCoupon" ADD CONSTRAINT "IncentiveCoupon_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveCouponRedemption" ADD CONSTRAINT "IncentiveCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "IncentiveCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncentiveCouponRedemption" ADD CONSTRAINT "IncentiveCouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveQuotaCounter" ADD CONSTRAINT "IncentiveQuotaCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthIncentiveGrant" ADD CONSTRAINT "GrowthIncentiveGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthIncentiveEvent" ADD CONSTRAINT "GrowthIncentiveEvent_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "GrowthIncentiveGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthIncentiveEvent" ADD CONSTRAINT "GrowthIncentiveEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default policies
INSERT INTO "IncentivePolicy" ("id", "segment", "allowedDiscounts", "maxCouponsPerMonth", "maxGrowthGrantsPerMonth", "maxDiscount80PerMonth", "maxAddonGainPerMonth", "couponProbability", "growthProbability", "target100Ratio", "coupon100MaxDays", "isActive", "createdAt", "updatedAt")
VALUES
  ('policy_standard', 'STANDARD', ARRAY[10, 30, 50, 70, 100], 7, 15, 3, 1, 0.10, 0.10, 0.15, 14, true, NOW(), NOW()),
  ('policy_tester', 'TESTER', ARRAY[20, 50, 80], 7, 15, 3, 1, 0.10, 0.10, 0.15, 14, true, NOW(), NOW());
