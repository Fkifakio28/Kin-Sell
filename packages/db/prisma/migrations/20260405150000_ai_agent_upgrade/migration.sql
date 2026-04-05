-- AlterTable: AiAgent upgrade for AI Management module
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "icon" TEXT NOT NULL DEFAULT '🤖';
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "version" TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);
ALTER TABLE "AiAgent" ADD COLUMN IF NOT EXISTS "lastError" TEXT;

-- Set slug = id for existing agents where slug is null
UPDATE "AiAgent" SET "slug" = "id" WHERE "slug" IS NULL;

-- Set status from enabled
UPDATE "AiAgent" SET "status" = 'INACTIVE' WHERE "enabled" = false AND "status" = 'ACTIVE';

-- Make slug NOT NULL + UNIQUE
ALTER TABLE "AiAgent" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "AiAgent_slug_key" ON "AiAgent"("slug");

-- Indexes
CREATE INDEX IF NOT EXISTS "AiAgent_status_idx" ON "AiAgent"("status");
CREATE INDEX IF NOT EXISTS "AiAgent_domain_idx" ON "AiAgent"("domain");
CREATE INDEX IF NOT EXISTS "AiAgent_type_idx" ON "AiAgent"("type");
