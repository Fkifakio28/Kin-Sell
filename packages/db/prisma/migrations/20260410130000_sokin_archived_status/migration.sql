-- AlterEnum: add ARCHIVED to SoKinPostStatus
ALTER TYPE "SoKinPostStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
