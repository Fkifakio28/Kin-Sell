-- AlterTable
ALTER TABLE "UserPreference"
  ADD COLUMN "localeManual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "marketScope" TEXT NOT NULL DEFAULT 'KIN_SELL';
