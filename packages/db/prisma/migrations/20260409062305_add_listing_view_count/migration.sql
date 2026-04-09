-- AlterTable: Add viewCount to Listing
ALTER TABLE "Listing" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
