-- ══════════════════════════════════════════════
-- Chantier B — Boost unifié + Wallet
-- 2026-04-22
-- ══════════════════════════════════════════════

-- Enums
CREATE TYPE "BoostTarget" AS ENUM ('LISTING', 'POST', 'PROFILE', 'SHOP');
CREATE TYPE "BoostStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELED', 'EXHAUSTED');
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT');

-- SoKinPost: ajout colonnes boost
ALTER TABLE "SoKinPost"
  ADD COLUMN "isBoosted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "boostExpiresAt" TIMESTAMP(3),
  ADD COLUMN "boostCampaignId" TEXT;

CREATE INDEX "SoKinPost_isBoosted_idx" ON "SoKinPost"("isBoosted");
CREATE INDEX "SoKinPost_boostCampaignId_idx" ON "SoKinPost"("boostCampaignId");

-- BoostCampaign
CREATE TABLE "BoostCampaign" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "target" "BoostTarget" NOT NULL,
  "targetId" TEXT NOT NULL,
  "scope" "PromotionScope" NOT NULL DEFAULT 'LOCAL',
  "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "budgetUsdCents" INTEGER NOT NULL,
  "budgetSpentUsdCents" INTEGER NOT NULL DEFAULT 0,
  "dailyCapUsdCents" INTEGER,
  "durationDays" INTEGER NOT NULL,
  "pricingMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "status" "BoostStatus" NOT NULL DEFAULT 'ACTIVE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "pausedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "lastPacingAt" TIMESTAMP(3),
  "estReachMin" INTEGER NOT NULL DEFAULT 0,
  "estReachMax" INTEGER NOT NULL DEFAULT 0,
  "estClicksMin" INTEGER NOT NULL DEFAULT 0,
  "estClicksMax" INTEGER NOT NULL DEFAULT 0,
  "totalImpressions" INTEGER NOT NULL DEFAULT 0,
  "totalClicks" INTEGER NOT NULL DEFAULT 0,
  "totalContacts" INTEGER NOT NULL DEFAULT 0,
  "totalDmOpens" INTEGER NOT NULL DEFAULT 0,
  "totalSalesAttributed" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BoostCampaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoostCampaign_userId_status_idx" ON "BoostCampaign"("userId", "status");
CREATE INDEX "BoostCampaign_target_targetId_idx" ON "BoostCampaign"("target", "targetId");
CREATE INDEX "BoostCampaign_status_expiresAt_idx" ON "BoostCampaign"("status", "expiresAt");
CREATE INDEX "BoostCampaign_scope_idx" ON "BoostCampaign"("scope");
CREATE INDEX "BoostCampaign_createdAt_idx" ON "BoostCampaign"("createdAt");
CREATE INDEX "BoostCampaign_expiresAt_idx" ON "BoostCampaign"("expiresAt");

ALTER TABLE "BoostCampaign"
  ADD CONSTRAINT "BoostCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BoostMetric
CREATE TABLE "BoostMetric" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "contacts" INTEGER NOT NULL DEFAULT 0,
  "dmOpens" INTEGER NOT NULL DEFAULT 0,
  "salesAttributed" INTEGER NOT NULL DEFAULT 0,
  "spendUsdCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BoostMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoostMetric_campaignId_date_key" ON "BoostMetric"("campaignId", "date");
CREATE INDEX "BoostMetric_date_idx" ON "BoostMetric"("date");
CREATE INDEX "BoostMetric_campaignId_date_idx" ON "BoostMetric"("campaignId", "date");

ALTER TABLE "BoostMetric"
  ADD CONSTRAINT "BoostMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BoostCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Wallet
CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "balanceUsdCents" INTEGER NOT NULL DEFAULT 0,
  "totalCreditCents" INTEGER NOT NULL DEFAULT 0,
  "totalDebitCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WalletTransaction
CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "WalletTransactionType" NOT NULL,
  "amountUsdCents" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "reference" TEXT,
  "campaignId" TEXT,
  "description" TEXT,
  "createdBy" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");
CREATE INDEX "WalletTransaction_campaignId_idx" ON "WalletTransaction"("campaignId");
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");

ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WalletTransaction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BoostCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
