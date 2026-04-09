-- CreateEnum: SoKinPostType (9 types de publication)
CREATE TYPE "SoKinPostType" AS ENUM ('SHOWCASE', 'DISCUSSION', 'QUESTION', 'SELLING', 'PROMO', 'SEARCH', 'UPDATE', 'REVIEW', 'TREND');

-- AlterTable: add postType + subject to SoKinPost
ALTER TABLE "SoKinPost" ADD COLUMN "postType" "SoKinPostType" NOT NULL DEFAULT 'SHOWCASE';
ALTER TABLE "SoKinPost" ADD COLUMN "subject" TEXT;

-- CreateIndex: index on postType for feed filtering
CREATE INDEX "SoKinPost_postType_idx" ON "SoKinPost"("postType");
