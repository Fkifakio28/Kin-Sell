-- IA Studio Ads + IA Ads system
-- Tables: AiAdCreative, AiAdCampaign, AiAdPlacement, AiAdPerformance

CREATE TABLE "AiAdCreative" (
    "id"              TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "adType"          TEXT NOT NULL,
    "audienceType"    TEXT NOT NULL,
    "sourceEngine"    TEXT NOT NULL DEFAULT 'studio-ads',
    "generatedBy"     TEXT NOT NULL DEFAULT 'SYSTEM',
    "contentText"     TEXT NOT NULL,
    "subtitle"        TEXT,
    "mediaType"       TEXT NOT NULL DEFAULT 'TEXT',
    "mediaUrl"        TEXT,
    "ctaLabel"        TEXT NOT NULL DEFAULT 'Découvrir',
    "ctaTarget"       TEXT NOT NULL DEFAULT '/pricing',
    "tone"            TEXT NOT NULL DEFAULT 'premium',
    "tags"            TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status"          TEXT NOT NULL DEFAULT 'DRAFT',
    "targetPlanCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCategory"  TEXT,
    "variantGroup"    TEXT,
    "variantLabel"    TEXT,
    "userId"          TEXT,
    "businessId"      TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiAdCreative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiAdCampaign" (
    "id"                  TEXT NOT NULL,
    "creativeId"          TEXT NOT NULL,
    "campaignName"        TEXT NOT NULL,
    "objective"           TEXT NOT NULL,
    "audienceRole"        TEXT NOT NULL DEFAULT 'ALL',
    "audienceConditions"  JSONB,
    "active"              BOOLEAN NOT NULL DEFAULT false,
    "startsAt"            TIMESTAMP(3),
    "endsAt"              TIMESTAMP(3),
    "frequencyCap"        INTEGER NOT NULL DEFAULT 3,
    "priority"            INTEGER NOT NULL DEFAULT 0,
    "budgetType"          TEXT NOT NULL DEFAULT 'INTERNAL',
    "userId"              TEXT,
    "businessId"          TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiAdCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiAdPlacement" (
    "id"            TEXT NOT NULL,
    "campaignId"    TEXT NOT NULL,
    "pageKey"       TEXT NOT NULL,
    "componentKey"  TEXT NOT NULL,
    "priority"      INTEGER NOT NULL DEFAULT 0,
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiAdPlacement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiAdPerformance" (
    "id"                      TEXT NOT NULL,
    "campaignId"              TEXT NOT NULL,
    "date"                    DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impressions"             INTEGER NOT NULL DEFAULT 0,
    "clicks"                  INTEGER NOT NULL DEFAULT 0,
    "dismissals"              INTEGER NOT NULL DEFAULT 0,
    "conversions"             INTEGER NOT NULL DEFAULT 0,
    "subscriptionsGenerated"  INTEGER NOT NULL DEFAULT 0,
    "trialsActivated"         INTEGER NOT NULL DEFAULT 0,
    "revenue"                 INTEGER NOT NULL DEFAULT 0,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiAdPerformance_pkey" PRIMARY KEY ("id")
);

-- Indexes: AiAdCreative
CREATE INDEX "AiAdCreative_status_idx" ON "AiAdCreative"("status");
CREATE INDEX "AiAdCreative_adType_idx" ON "AiAdCreative"("adType");
CREATE INDEX "AiAdCreative_audienceType_idx" ON "AiAdCreative"("audienceType");
CREATE INDEX "AiAdCreative_sourceEngine_idx" ON "AiAdCreative"("sourceEngine");
CREATE INDEX "AiAdCreative_userId_idx" ON "AiAdCreative"("userId");
CREATE INDEX "AiAdCreative_variantGroup_idx" ON "AiAdCreative"("variantGroup");

-- Indexes: AiAdCampaign
CREATE INDEX "AiAdCampaign_active_startsAt_endsAt_idx" ON "AiAdCampaign"("active", "startsAt", "endsAt");
CREATE INDEX "AiAdCampaign_objective_idx" ON "AiAdCampaign"("objective");
CREATE INDEX "AiAdCampaign_audienceRole_idx" ON "AiAdCampaign"("audienceRole");
CREATE INDEX "AiAdCampaign_creativeId_idx" ON "AiAdCampaign"("creativeId");
CREATE INDEX "AiAdCampaign_priority_idx" ON "AiAdCampaign"("priority");

-- Indexes: AiAdPlacement
CREATE UNIQUE INDEX "AiAdPlacement_campaignId_pageKey_componentKey_key" ON "AiAdPlacement"("campaignId", "pageKey", "componentKey");
CREATE INDEX "AiAdPlacement_pageKey_active_idx" ON "AiAdPlacement"("pageKey", "active");
CREATE INDEX "AiAdPlacement_componentKey_idx" ON "AiAdPlacement"("componentKey");

-- Indexes: AiAdPerformance
CREATE UNIQUE INDEX "AiAdPerformance_campaignId_date_key" ON "AiAdPerformance"("campaignId", "date");
CREATE INDEX "AiAdPerformance_date_idx" ON "AiAdPerformance"("date");

-- Foreign keys
ALTER TABLE "AiAdCreative" ADD CONSTRAINT "AiAdCreative_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiAdCreative" ADD CONSTRAINT "AiAdCreative_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiAdCampaign" ADD CONSTRAINT "AiAdCampaign_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "AiAdCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiAdCampaign" ADD CONSTRAINT "AiAdCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiAdCampaign" ADD CONSTRAINT "AiAdCampaign_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "BusinessAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiAdPlacement" ADD CONSTRAINT "AiAdPlacement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AiAdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiAdPerformance" ADD CONSTRAINT "AiAdPerformance_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AiAdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
