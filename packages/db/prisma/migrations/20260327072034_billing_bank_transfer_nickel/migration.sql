-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER_NICKEL');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'USER_CONFIRMED', 'VALIDATED', 'CANCELED', 'EXPIRED');

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "businessId" TEXT,
    "targetScope" "SubscriptionScope" NOT NULL,
    "planCode" TEXT NOT NULL,
    "amountUsdCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER_NICKEL',
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "transferReference" TEXT NOT NULL,
    "beneficiaryIban" TEXT NOT NULL,
    "beneficiaryBic" TEXT NOT NULL,
    "beneficiaryRib" TEXT,
    "depositorNote" TEXT,
    "proofUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_transferReference_key" ON "PaymentOrder"("transferReference");

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_status_idx" ON "PaymentOrder"("userId", "status");

-- CreateIndex
CREATE INDEX "PaymentOrder_businessId_status_idx" ON "PaymentOrder"("businessId", "status");

-- CreateIndex
CREATE INDEX "PaymentOrder_targetScope_status_idx" ON "PaymentOrder"("targetScope", "status");

-- CreateIndex
CREATE INDEX "PaymentOrder_expiresAt_idx" ON "PaymentOrder"("expiresAt");

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "BusinessAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
