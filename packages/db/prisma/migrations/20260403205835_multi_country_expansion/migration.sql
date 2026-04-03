-- Multi-Country Expansion: Guinée Conakry, Arabe, Listing fields, UserPreference fields

-- ══════════════════════════════════════════════
-- 1. CountryCode enum: GQ → GN (Guinée Équatoriale → Guinée Conakry)
-- ══════════════════════════════════════════════

-- Add GN to the enum
ALTER TYPE "CountryCode" ADD VALUE IF NOT EXISTS 'GN';

-- Update existing data from GQ to GN
UPDATE "MarketCountry" SET "code" = 'GN' WHERE "code" = 'GQ';
UPDATE "MarketCity" SET "countryCode" = 'GN' WHERE "countryCode" = 'GQ';
UPDATE "Listing" SET "countryCode" = 'GN' WHERE "countryCode" = 'GQ';
UPDATE "UserPreference" SET "countryCode" = 'GN' WHERE "countryCode" = 'GQ';

-- Note: PostgreSQL doesn't support DROP VALUE from enum directly.
-- GQ will remain in the enum but unused. This is safe.

-- ══════════════════════════════════════════════
-- 2. Language enum: add AR (Arabe)
-- ══════════════════════════════════════════════

ALTER TYPE "Language" ADD VALUE IF NOT EXISTS 'AR';

-- ══════════════════════════════════════════════
-- 3. ListingScope enum (new)
-- ══════════════════════════════════════════════

CREATE TYPE "ListingScope" AS ENUM ('LOCAL', 'NATIONAL', 'REGIONAL', 'INTERNATIONAL');

-- ══════════════════════════════════════════════
-- 4. Listing: add multi-country fields
-- ══════════════════════════════════════════════

ALTER TABLE "Listing" ADD COLUMN "country" TEXT;
ALTER TABLE "Listing" ADD COLUMN "countryCode" "CountryCode";
ALTER TABLE "Listing" ADD COLUMN "priceCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Listing" ADD COLUMN "priceOriginal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Listing" ADD COLUMN "scope" "ListingScope" NOT NULL DEFAULT 'NATIONAL';

-- Indexes for country-based queries
CREATE INDEX "Listing_country_idx" ON "Listing"("country");
CREATE INDEX "Listing_countryCode_idx" ON "Listing"("countryCode");
CREATE INDEX "Listing_countryCode_isPublished_createdAt_idx" ON "Listing"("countryCode", "isPublished", "createdAt");

-- ══════════════════════════════════════════════
-- 5. UserPreference: add countryCode + discoveryMode
-- ══════════════════════════════════════════════

ALTER TABLE "UserPreference" ADD COLUMN "countryCode" "CountryCode";
ALTER TABLE "UserPreference" ADD COLUMN "discoveryMode" TEXT NOT NULL DEFAULT 'local_first';
