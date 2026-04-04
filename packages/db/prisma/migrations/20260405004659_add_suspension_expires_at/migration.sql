-- Add suspensionExpiresAt to User
ALTER TABLE "User" ADD COLUMN "suspensionExpiresAt" TIMESTAMP(3);
