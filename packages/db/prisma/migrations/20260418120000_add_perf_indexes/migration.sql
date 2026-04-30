-- CreateIndex
CREATE INDEX IF NOT EXISTS "Listing_category_isPublished_createdAt_idx" ON "Listing"("category", "isPublished", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SoKinPost_authorId_status_createdAt_idx" ON "SoKinPost"("authorId", "status", "createdAt");
