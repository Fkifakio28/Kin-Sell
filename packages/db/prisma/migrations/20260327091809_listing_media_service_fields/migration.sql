-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "serviceDurationMin" INTEGER,
ADD COLUMN     "serviceLocation" TEXT;
