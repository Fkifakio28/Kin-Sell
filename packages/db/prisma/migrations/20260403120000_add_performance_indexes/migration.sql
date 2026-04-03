-- Performance indexes for frequent queries

-- Listing: feed queries (city + isPublished + createdAt)
CREATE INDEX "Listing_createdAt_idx" ON "Listing"("createdAt");
CREATE INDEX "Listing_city_isPublished_createdAt_idx" ON "Listing"("city", "isPublished", "createdAt");

-- Order: admin dashboard (status + createdAt)
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- Subscription: renewal cronjob (userId/businessId + status + endsAt)
CREATE INDEX "Subscription_userId_status_endsAt_idx" ON "Subscription"("userId", "status", "endsAt");
CREATE INDEX "Subscription_businessId_status_endsAt_idx" ON "Subscription"("businessId", "status", "endsAt");

-- SoKinPost: feed queries (status + createdAt)
CREATE INDEX "SoKinPost_status_createdAt_idx" ON "SoKinPost"("status", "createdAt");
