-- CreateEnum
CREATE TYPE "SubscriptionScope" AS ENUM ('USER', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "AddonCode" AS ENUM ('IA_MERCHANT', 'IA_ORDER', 'BOOST_VISIBILITY', 'ADS_PACK', 'ADS_PREMIUM');

-- CreateEnum
CREATE TYPE "AddonStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "businessId" TEXT,
    "scope" "SubscriptionScope" NOT NULL,
    "planCode" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "priceUsdCents" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionAddon" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "addonCode" "AddonCode" NOT NULL,
    "status" "AddonStatus" NOT NULL DEFAULT 'ACTIVE',
    "priceUsdCents" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionAddon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_scope_status_idx" ON "Subscription"("scope", "status");

-- CreateIndex
CREATE INDEX "Subscription_userId_status_idx" ON "Subscription"("userId", "status");

-- CreateIndex
CREATE INDEX "Subscription_businessId_status_idx" ON "Subscription"("businessId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionAddon_subscriptionId_status_idx" ON "SubscriptionAddon"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionAddon_addonCode_status_idx" ON "SubscriptionAddon"("addonCode", "status");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionAddon" ADD CONSTRAINT "SubscriptionAddon_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
