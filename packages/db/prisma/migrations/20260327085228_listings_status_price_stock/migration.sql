-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'DELETED');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "priceUsdCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "stockQuantity" INTEGER;

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");
