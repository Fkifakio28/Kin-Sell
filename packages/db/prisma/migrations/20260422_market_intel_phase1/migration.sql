-- CreateTable: MarketProduct
CREATE TABLE "MarketProduct" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "canonicalBrand" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MarketPrice
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "city" TEXT,
    "priceMinLocal" INTEGER NOT NULL,
    "priceMaxLocal" INTEGER NOT NULL,
    "priceMedianLocal" INTEGER NOT NULL,
    "localCurrency" TEXT NOT NULL,
    "priceMedianEurCents" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 1,
    "sourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MarketJob
CREATE TABLE "MarketJob" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "parentCategoryId" TEXT NOT NULL,
    "seniorityLevel" TEXT NOT NULL DEFAULT 'mid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MarketSalary
CREATE TABLE "MarketSalary" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "city" TEXT,
    "salaryMinLocal" INTEGER NOT NULL,
    "salaryMaxLocal" INTEGER NOT NULL,
    "salaryMedianLocal" INTEGER NOT NULL,
    "localCurrency" TEXT NOT NULL,
    "salaryMedianEurCents" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'month',
    "sampleSize" INTEGER NOT NULL DEFAULT 1,
    "sourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,

    CONSTRAINT "MarketSalary_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MarketSource
CREATE TABLE "MarketSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "parser" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCrawledAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MarketTrend
CREATE TABLE "MarketTrend" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "productId" TEXT,
    "jobId" TEXT,
    "countryCode" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "deltaPct" DOUBLE PRECISION,
    "season" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketTrend_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ArbitrageOpportunity
CREATE TABLE "ArbitrageOpportunity" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "shortageCountry" TEXT NOT NULL,
    "surplusCountry" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "demandIndex" DOUBLE PRECISION NOT NULL,
    "supplyIndex" DOUBLE PRECISION NOT NULL,
    "priceDeltaEurCents" INTEGER,
    "distanceKm" INTEGER,
    "rationale" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArbitrageOpportunity_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "MarketProduct_slug_key" ON "MarketProduct"("slug");
CREATE UNIQUE INDEX "MarketJob_slug_key" ON "MarketJob"("slug");
CREATE UNIQUE INDEX "MarketSource_baseUrl_countryCode_key" ON "MarketSource"("baseUrl", "countryCode");

-- Indexes: MarketProduct
CREATE INDEX "MarketProduct_categoryId_idx" ON "MarketProduct"("categoryId");
CREATE INDEX "MarketProduct_canonicalBrand_idx" ON "MarketProduct"("canonicalBrand");

-- Indexes: MarketPrice
CREATE INDEX "MarketPrice_countryCode_productId_idx" ON "MarketPrice"("countryCode", "productId");
CREATE INDEX "MarketPrice_productId_collectedAt_idx" ON "MarketPrice"("productId", "collectedAt");
CREATE INDEX "MarketPrice_collectedAt_idx" ON "MarketPrice"("collectedAt");

-- Indexes: MarketJob
CREATE INDEX "MarketJob_parentCategoryId_idx" ON "MarketJob"("parentCategoryId");

-- Indexes: MarketSalary
CREATE INDEX "MarketSalary_countryCode_jobId_idx" ON "MarketSalary"("countryCode", "jobId");
CREATE INDEX "MarketSalary_jobId_collectedAt_idx" ON "MarketSalary"("jobId", "collectedAt");

-- Indexes: MarketSource
CREATE INDEX "MarketSource_countryCode_type_idx" ON "MarketSource"("countryCode", "type");
CREATE INDEX "MarketSource_active_lastCrawledAt_idx" ON "MarketSource"("active", "lastCrawledAt");

-- Indexes: MarketTrend
CREATE INDEX "MarketTrend_countryCode_scope_period_rank_idx" ON "MarketTrend"("countryCode", "scope", "period", "rank");
CREATE INDEX "MarketTrend_computedAt_idx" ON "MarketTrend"("computedAt");
CREATE INDEX "MarketTrend_productId_idx" ON "MarketTrend"("productId");
CREATE INDEX "MarketTrend_jobId_idx" ON "MarketTrend"("jobId");

-- Indexes: ArbitrageOpportunity
CREATE INDEX "ArbitrageOpportunity_shortageCountry_score_idx" ON "ArbitrageOpportunity"("shortageCountry", "score");
CREATE INDEX "ArbitrageOpportunity_surplusCountry_score_idx" ON "ArbitrageOpportunity"("surplusCountry", "score");
CREATE INDEX "ArbitrageOpportunity_scope_active_idx" ON "ArbitrageOpportunity"("scope", "active");
CREATE INDEX "ArbitrageOpportunity_computedAt_idx" ON "ArbitrageOpportunity"("computedAt");

-- Foreign keys
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "MarketProduct"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketSalary" ADD CONSTRAINT "MarketSalary_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "MarketJob"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketTrend" ADD CONSTRAINT "MarketTrend_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "MarketProduct"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketTrend" ADD CONSTRAINT "MarketTrend_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "MarketJob"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
node.exe : Error: P1000
Au caractère Ligne:1 : 1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (Error: P1000:String) [], RemoteEx 
   ception
    + FullyQualifiedErrorId : NativeCommandError
 

Authentication failed against database server at `localhost`, the provided 
database credentials for `(not available)` are not valid.

Please make sure to provide valid database credentials for the database server 
at `localhost`.

