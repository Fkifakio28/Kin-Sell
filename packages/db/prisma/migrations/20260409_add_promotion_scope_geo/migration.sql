-- CreateEnum
CREATE TYPE "PromotionScope" AS ENUM ('LOCAL', 'NATIONAL', 'CROSS_BORDER');

-- AlterTable: Advertisement — ajout champs géographiques
ALTER TABLE "Advertisement" ADD COLUMN "promotionScope" "PromotionScope" NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "Advertisement" ADD COLUMN "baseCountry" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN "baseRegion" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN "baseCity" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN "targetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Advertisement" ADD COLUMN "targetRegions" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Advertisement" ADD COLUMN "pricingMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- AlterTable: Listing — ajout scope de boost
ALTER TABLE "Listing" ADD COLUMN "boostScope" "PromotionScope";
ALTER TABLE "Listing" ADD COLUMN "boostTargetCountries" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Advertisement_promotionScope_idx" ON "Advertisement"("promotionScope");
CREATE INDEX "Advertisement_baseCountry_idx" ON "Advertisement"("baseCountry");
CREATE INDEX "Advertisement_baseCity_idx" ON "Advertisement"("baseCity");
