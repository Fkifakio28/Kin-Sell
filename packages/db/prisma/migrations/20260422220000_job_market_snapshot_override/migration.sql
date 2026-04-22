-- Chantier J3 : Enrichissement JobMarketSnapshot pour override manuel + refresh nightly
ALTER TABLE "JobMarketSnapshot"
  ADD COLUMN IF NOT EXISTS "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "overriddenBy" TEXT,
  ADD COLUMN IF NOT EXISTS "overriddenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sourceNotes" TEXT;

CREATE INDEX IF NOT EXISTS "JobMarketSnapshot_isManualOverride_idx" ON "JobMarketSnapshot"("isManualOverride");
