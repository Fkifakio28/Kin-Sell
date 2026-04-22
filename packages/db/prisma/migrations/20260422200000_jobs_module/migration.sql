-- ══════════════════════════════════════════════
-- Chantier C Phase 2 — Modèles emploi
-- 2026-04-22
-- Migration additive (aucune DROP), compatible prod
-- ══════════════════════════════════════════════

-- ─── Enums ────────────────────────────────────
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERNSHIP', 'TEMPORARY');
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');
CREATE TYPE "JobListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'CLOSED', 'EXPIRED');
CREATE TYPE "JobApplicationStatus" AS ENUM ('PENDING', 'SEEN', 'SHORTLISTED', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "QualificationLevel" AS ENUM ('NONE', 'PRIMARY', 'SECONDARY', 'VOCATIONAL', 'BACHELOR', 'MASTER', 'DOCTORATE', 'CERTIFICATION');

-- ─── JobListing ───────────────────────────────
CREATE TABLE "JobListing" (
  "id" TEXT NOT NULL,
  "recruiterUserId" TEXT NOT NULL,
  "businessId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "subCategory" TEXT,
  "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "workMode" "WorkMode" NOT NULL DEFAULT 'ONSITE',
  "country" TEXT NOT NULL,
  "countryCode" "CountryCode",
  "city" TEXT NOT NULL,
  "region" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "requiredQualifs" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "minExperienceYrs" INTEGER NOT NULL DEFAULT 0,
  "salaryMinUsd" INTEGER,
  "salaryMaxUsd" INTEGER,
  "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
  "salaryPeriod" TEXT NOT NULL DEFAULT 'MONTH',
  "openings" INTEGER NOT NULL DEFAULT 1,
  "status" "JobListingStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "applicationCount" INTEGER NOT NULL DEFAULT 0,
  "isBoosted" BOOLEAN NOT NULL DEFAULT false,
  "boostExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobListing_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JobListing"
  ADD CONSTRAINT "JobListing_recruiterUserId_fkey"
  FOREIGN KEY ("recruiterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "JobListing_recruiterUserId_idx" ON "JobListing"("recruiterUserId");
CREATE INDEX "JobListing_businessId_idx" ON "JobListing"("businessId");
CREATE INDEX "JobListing_status_idx" ON "JobListing"("status");
CREATE INDEX "JobListing_country_idx" ON "JobListing"("country");
CREATE INDEX "JobListing_countryCode_idx" ON "JobListing"("countryCode");
CREATE INDEX "JobListing_city_idx" ON "JobListing"("city");
CREATE INDEX "JobListing_category_idx" ON "JobListing"("category");
CREATE INDEX "JobListing_createdAt_idx" ON "JobListing"("createdAt");
CREATE INDEX "JobListing_countryCode_status_createdAt_idx" ON "JobListing"("countryCode", "status", "createdAt");
CREATE INDEX "JobListing_city_status_createdAt_idx" ON "JobListing"("city", "status", "createdAt");
CREATE INDEX "JobListing_category_status_createdAt_idx" ON "JobListing"("category", "status", "createdAt");

-- ─── JobApplication ───────────────────────────
CREATE TABLE "JobApplication" (
  "id" TEXT NOT NULL,
  "jobListingId" TEXT NOT NULL,
  "candidateUserId" TEXT NOT NULL,
  "status" "JobApplicationStatus" NOT NULL DEFAULT 'PENDING',
  "coverLetter" TEXT,
  "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "alignmentScore" DOUBLE PRECISION,
  "expectedSalaryUsd" INTEGER,
  "recruiterNotes" TEXT,
  "firstSeenAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JobApplication"
  ADD CONSTRAINT "JobApplication_jobListingId_fkey"
  FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobApplication"
  ADD CONSTRAINT "JobApplication_candidateUserId_fkey"
  FOREIGN KEY ("candidateUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "JobApplication_jobListingId_candidateUserId_key" ON "JobApplication"("jobListingId", "candidateUserId");
CREATE INDEX "JobApplication_candidateUserId_status_idx" ON "JobApplication"("candidateUserId", "status");
CREATE INDEX "JobApplication_jobListingId_status_idx" ON "JobApplication"("jobListingId", "status");
CREATE INDEX "JobApplication_createdAt_idx" ON "JobApplication"("createdAt");

-- ─── UserQualification ────────────────────────
CREATE TABLE "UserQualification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "level" "QualificationLevel" NOT NULL DEFAULT 'NONE',
  "institution" TEXT,
  "fieldOfStudy" TEXT,
  "countryCode" "CountryCode",
  "obtainedYear" INTEGER,
  "expiresAt" TIMESTAMP(3),
  "attachmentUrl" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserQualification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserQualification"
  ADD CONSTRAINT "UserQualification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "UserQualification_userId_idx" ON "UserQualification"("userId");
CREATE INDEX "UserQualification_level_idx" ON "UserQualification"("level");

-- ─── UserExperience ───────────────────────────
CREATE TABLE "UserExperience" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "company" TEXT,
  "category" TEXT,
  "countryCode" "CountryCode",
  "city" TEXT,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "description" TEXT,
  "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserExperience_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "UserExperience"
  ADD CONSTRAINT "UserExperience_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "UserExperience_userId_idx" ON "UserExperience"("userId");
CREATE INDEX "UserExperience_category_idx" ON "UserExperience"("category");

-- ─── JobMarketSnapshot ────────────────────────
CREATE TABLE "JobMarketSnapshot" (
  "id" TEXT NOT NULL,
  "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "country" TEXT NOT NULL,
  "countryCode" "CountryCode",
  "city" TEXT,
  "category" TEXT NOT NULL,
  "openJobs" INTEGER NOT NULL DEFAULT 0,
  "applicants" INTEGER NOT NULL DEFAULT 0,
  "saturationIndex" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "avgSalaryUsdCents" INTEGER,
  "medianSalaryUsdCents" INTEGER,
  "topSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "trend7dPercent" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobMarketSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobMarketSnapshot_snapshotDate_country_city_category_key"
  ON "JobMarketSnapshot"("snapshotDate", "country", "city", "category");
CREATE INDEX "JobMarketSnapshot_country_category_idx" ON "JobMarketSnapshot"("country", "category");
CREATE INDEX "JobMarketSnapshot_countryCode_category_idx" ON "JobMarketSnapshot"("countryCode", "category");
CREATE INDEX "JobMarketSnapshot_snapshotDate_idx" ON "JobMarketSnapshot"("snapshotDate");
