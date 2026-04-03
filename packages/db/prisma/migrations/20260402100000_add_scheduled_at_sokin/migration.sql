-- AlterTable: add scheduledAt to SoKinPost
ALTER TABLE "SoKinPost" ADD COLUMN "scheduledAt" TIMESTAMP(3);

-- AlterTable: add scheduledAt to SoKinStory
ALTER TABLE "SoKinStory" ADD COLUMN "scheduledAt" TIMESTAMP(3);
