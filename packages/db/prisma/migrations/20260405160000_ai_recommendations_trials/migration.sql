-- CreateTable AiRecommendation
CREATE TABLE IF NOT EXISTS "AiRecommendation" (
    "id" TEXT NOT NULL,
    "engineKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'USER',
    "triggerType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "actionTarget" TEXT,
    "actionData" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "displayedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable AiTrial
CREATE TABLE IF NOT EXISTS "AiTrial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'USER',
    "planCode" TEXT NOT NULL,
    "sourceEngine" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTrial_pkey" PRIMARY KEY ("id")
);

-- Indexes AiRecommendation
CREATE INDEX IF NOT EXISTS "AiRecommendation_userId_dismissed_createdAt_idx" ON "AiRecommendation"("userId", "dismissed", "createdAt");
CREATE INDEX IF NOT EXISTS "AiRecommendation_businessId_dismissed_createdAt_idx" ON "AiRecommendation"("businessId", "dismissed", "createdAt");
CREATE INDEX IF NOT EXISTS "AiRecommendation_engineKey_triggerType_idx" ON "AiRecommendation"("engineKey", "triggerType");
CREATE INDEX IF NOT EXISTS "AiRecommendation_userId_triggerType_idx" ON "AiRecommendation"("userId", "triggerType");
CREATE INDEX IF NOT EXISTS "AiRecommendation_expiresAt_idx" ON "AiRecommendation"("expiresAt");

-- Indexes AiTrial
CREATE INDEX IF NOT EXISTS "AiTrial_userId_status_idx" ON "AiTrial"("userId", "status");
CREATE INDEX IF NOT EXISTS "AiTrial_businessId_status_idx" ON "AiTrial"("businessId", "status");
CREATE INDEX IF NOT EXISTS "AiTrial_status_endsAt_idx" ON "AiTrial"("status", "endsAt");
CREATE INDEX IF NOT EXISTS "AiTrial_sourceEngine_idx" ON "AiTrial"("sourceEngine");

-- Foreign Keys
ALTER TABLE "AiRecommendation" DROP CONSTRAINT IF EXISTS "AiRecommendation_userId_fkey";
ALTER TABLE "AiRecommendation" ADD CONSTRAINT "AiRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiRecommendation" DROP CONSTRAINT IF EXISTS "AiRecommendation_businessId_fkey";
ALTER TABLE "AiRecommendation" ADD CONSTRAINT "AiRecommendation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiTrial" DROP CONSTRAINT IF EXISTS "AiTrial_userId_fkey";
ALTER TABLE "AiTrial" ADD CONSTRAINT "AiTrial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiTrial" DROP CONSTRAINT IF EXISTS "AiTrial_businessId_fkey";
ALTER TABLE "AiTrial" ADD CONSTRAINT "AiTrial_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
