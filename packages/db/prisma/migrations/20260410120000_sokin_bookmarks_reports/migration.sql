-- CreateEnum
CREATE TYPE "SoKinReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'HATE_SPEECH', 'VIOLENCE', 'NUDITY', 'SCAM', 'MISINFORMATION', 'OTHER');

-- CreateTable
CREATE TABLE "SoKinBookmark" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoKinBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoKinReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "SoKinReportReason" NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoKinReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoKinBookmark_postId_userId_key" ON "SoKinBookmark"("postId", "userId");

-- CreateIndex
CREATE INDEX "SoKinBookmark_userId_createdAt_idx" ON "SoKinBookmark"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SoKinBookmark_postId_idx" ON "SoKinBookmark"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "SoKinReport_postId_userId_key" ON "SoKinReport"("postId", "userId");

-- CreateIndex
CREATE INDEX "SoKinReport_status_idx" ON "SoKinReport"("status");

-- CreateIndex
CREATE INDEX "SoKinReport_postId_idx" ON "SoKinReport"("postId");

-- CreateIndex
CREATE INDEX "SoKinReport_userId_idx" ON "SoKinReport"("userId");

-- AddForeignKey
ALTER TABLE "SoKinBookmark" ADD CONSTRAINT "SoKinBookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SoKinPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoKinBookmark" ADD CONSTRAINT "SoKinBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoKinReport" ADD CONSTRAINT "SoKinReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SoKinPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoKinReport" ADD CONSTRAINT "SoKinReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
