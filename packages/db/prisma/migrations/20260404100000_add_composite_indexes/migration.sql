-- CreateIndex
CREATE INDEX "Negotiation_buyerUserId_status_expiresAt_idx" ON "Negotiation"("buyerUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Negotiation_sellerUserId_status_expiresAt_idx" ON "Negotiation"("sellerUserId", "status", "expiresAt");

-- DropIndex (replace single-column senderId index with composite)
DROP INDEX IF EXISTS "Message_senderId_idx";

-- CreateIndex
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId", "createdAt");
