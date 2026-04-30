-- CreateEnum
CREATE TYPE "KnowledgeGoal" AS ENUM ('SELL', 'BUY', 'HIRE', 'WORK');

-- CreateTable
CREATE TABLE "UserKnowledgeIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goals" "KnowledgeGoal"[] DEFAULT ARRAY[]::"KnowledgeGoal"[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "countriesInterest" "CountryCode"[] DEFAULT ARRAY[]::"CountryCode"[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKnowledgeIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserKnowledgeIntent_userId_key" ON "UserKnowledgeIntent"("userId");

-- CreateIndex
CREATE INDEX "UserKnowledgeIntent_userId_idx" ON "UserKnowledgeIntent"("userId");

-- AddForeignKey
ALTER TABLE "UserKnowledgeIntent" ADD CONSTRAINT "UserKnowledgeIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
