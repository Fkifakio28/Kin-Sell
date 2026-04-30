-- CreateTable
CREATE TABLE "MarketDataGap" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "countryCode" "CountryCode",
    "country" TEXT NOT NULL,
    "city" TEXT,
    "scopeResolved" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketDataGap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketDataGap_category_countryCode_city_key" ON "MarketDataGap"("category", "countryCode", "city");

-- CreateIndex
CREATE INDEX "MarketDataGap_requestCount_idx" ON "MarketDataGap"("requestCount");

-- CreateIndex
CREATE INDEX "MarketDataGap_lastSeenAt_idx" ON "MarketDataGap"("lastSeenAt");

-- CreateIndex
CREATE INDEX "MarketDataGap_resolvedAt_idx" ON "MarketDataGap"("resolvedAt");
