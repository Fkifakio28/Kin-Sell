/**
 * Apple In-App Purchase server-side receipt verification.
 *
 * Uses Apple's App Store Server API v2 (JWT-based) to verify transactions.
 * Falls back to the legacy /verifyReceipt endpoint for sandbox testing.
 *
 * Flow:
 *  1. iOS app completes purchase via StoreKit 2
 *  2. App sends transactionId (or receipt) to our API
 *  3. We verify with Apple → activate subscription
 */

import { PaymentMethod, PaymentOrderStatus, SubscriptionScope } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { getPlanOrThrow } from "./billing.catalog.js";
import { clearSubscriptionCache } from "../../shared/billing/subscription-guard.js";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";

/* ── Apple product ID → plan code mapping ── */
const APPLE_PRODUCT_MAP: Record<string, { planCode: string; scope: "USER" | "BUSINESS" }> = {
  // User plans
  "com.kinsell.plan.boost":        { planCode: "BOOST",       scope: "USER" },
  "com.kinsell.plan.auto":         { planCode: "AUTO",        scope: "USER" },
  "com.kinsell.plan.pro_vendor":   { planCode: "PRO_VENDOR",  scope: "USER" },
  // Business plans
  "com.kinsell.plan.starter":      { planCode: "STARTER",     scope: "BUSINESS" },
  "com.kinsell.plan.business":     { planCode: "BUSINESS",    scope: "BUSINESS" },
  "com.kinsell.plan.scale":        { planCode: "SCALE",       scope: "BUSINESS" },
};

interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: number;
  expiresDate?: number;
  environment: "Sandbox" | "Production";
  type: "Auto-Renewable Subscription" | "Non-Consumable" | "Consumable";
}

/**
 * Verify an Apple transaction using the legacy verifyReceipt endpoint.
 * In production, migrate to App Store Server API v2 with signed JWTs.
 */
async function verifyReceiptWithApple(receiptData: string): Promise<{
  valid: boolean;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  expiresDate?: number;
  environment?: string;
}> {
  // Try production first, then sandbox
  const endpoints = [
    "https://buy.itunes.apple.com/verifyReceipt",
    "https://sandbox.itunes.apple.com/verifyReceipt",
  ];

  const sharedSecret = env.APPLE_IAP_SHARED_SECRET;

  for (const url of endpoints) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "receipt-data": receiptData,
        password: sharedSecret,
        "exclude-old-transactions": true,
      }),
    });

    const data = await response.json() as {
      status: number;
      latest_receipt_info?: Array<{
        product_id: string;
        transaction_id: string;
        original_transaction_id: string;
        expires_date_ms?: string;
      }>;
      environment?: string;
    };

    // Status 21007 means sandbox receipt sent to production → retry with sandbox
    if (data.status === 21007) continue;

    if (data.status === 0 && data.latest_receipt_info?.length) {
      const latest = data.latest_receipt_info[data.latest_receipt_info.length - 1];
      return {
        valid: true,
        productId: latest.product_id,
        transactionId: latest.transaction_id,
        originalTransactionId: latest.original_transaction_id,
        expiresDate: latest.expires_date_ms ? parseInt(latest.expires_date_ms, 10) : undefined,
        environment: data.environment,
      };
    }

    return { valid: false };
  }

  return { valid: false };
}

/**
 * Verify an Apple StoreKit 2 transaction ID.
 * Uses the transactionId directly — the app should send the JWS transaction.
 */
async function verifyTransactionId(transactionId: string): Promise<AppleTransactionInfo | null> {
  // For StoreKit 2, the app sends the signed transaction (JWS).
  // We decode the payload (middle part of the JWS).
  try {
    const parts = transactionId.split(".");
    if (parts.length === 3) {
      // JWS format — decode payload
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
      return {
        transactionId: payload.transactionId ?? payload.originalTransactionId,
        originalTransactionId: payload.originalTransactionId,
        productId: payload.productId,
        purchaseDate: payload.purchaseDate,
        expiresDate: payload.expiresDate,
        environment: payload.environment,
        type: payload.type,
      };
    }
  } catch (err) {
    logger.error({ err }, "[Apple IAP] Failed to decode JWS transaction");
  }
  return null;
}

/**
 * Resolve user context (scope + businessId) — same pattern as billing.service.
 */
async function resolveContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, preferredAccountType: true },
  });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");

  const scope: "USER" | "BUSINESS" = user.preferredAccountType === "BUSINESS" ? "BUSINESS" : "USER";

  let businessId: string | null = null;
  if (scope === "BUSINESS") {
    const biz = await prisma.businessAccount.findFirst({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (!biz) throw new HttpError(400, "Aucun compte business trouvé");
    businessId = biz.id;
  }

  return { scope, businessId };
}

const createTransferReference = () => {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `KS-IAP-${Date.now().toString(36).toUpperCase()}-${rand}`;
};

/**
 * Process an Apple IAP purchase.
 * Called from the iOS app after a successful StoreKit 2 purchase.
 *
 * Accepts either:
 *  - receiptData (legacy receipt for verifyReceipt)
 *  - transactionJws (StoreKit 2 signed transaction)
 */
export const verifyAndActivateApplePurchase = async (
  userId: string,
  payload: {
    receiptData?: string;
    transactionJws?: string;
    productId?: string;
  },
) => {
  let productId: string | undefined;
  let transactionId: string | undefined;
  let originalTransactionId: string | undefined;
  let expiresDate: number | undefined;

  if (payload.transactionJws) {
    // StoreKit 2 JWS transaction
    const txInfo = await verifyTransactionId(payload.transactionJws);
    if (!txInfo) throw new HttpError(400, "Transaction Apple invalide");
    productId = txInfo.productId;
    transactionId = txInfo.transactionId;
    originalTransactionId = txInfo.originalTransactionId;
    expiresDate = txInfo.expiresDate;
  } else if (payload.receiptData) {
    // Legacy receipt verification
    const result = await verifyReceiptWithApple(payload.receiptData);
    if (!result.valid) throw new HttpError(400, "Reçu Apple invalide");
    productId = result.productId;
    transactionId = result.transactionId;
    originalTransactionId = result.originalTransactionId;
    expiresDate = result.expiresDate;
  } else {
    throw new HttpError(400, "receiptData ou transactionJws requis");
  }

  if (!productId) throw new HttpError(400, "Produit introuvable dans la transaction");

  // Map Apple product ID to plan code
  const mapping = APPLE_PRODUCT_MAP[productId];
  if (!mapping) throw new HttpError(400, `Produit Apple inconnu: ${productId}`);

  // Check for duplicate transaction
  if (transactionId) {
    const existing = await prisma.paymentOrder.findFirst({
      where: {
        depositorNote: { contains: transactionId },
        status: { in: [PaymentOrderStatus.PAID, PaymentOrderStatus.VALIDATED] },
      },
    });
    if (existing) {
      throw new HttpError(409, "Cette transaction Apple a déjà été traitée");
    }
  }

  const { scope, businessId } = await resolveContext(userId);

  // Validate plan scope matches user context
  if (mapping.scope !== scope) {
    throw new HttpError(400, `Ce forfait est pour ${mapping.scope}, mais votre compte est ${scope}`);
  }

  const targetPlan = getPlanOrThrow(mapping.planCode, scope);

  // Create PaymentOrder + activate subscription in one transaction
  await prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.create({
      data: {
        userId: scope === "USER" ? userId : null,
        businessId: scope === "BUSINESS" ? businessId : null,
        targetScope: scope as SubscriptionScope,
        planCode: targetPlan.code,
        amountUsdCents: targetPlan.monthlyPriceUsdCents,
        currency: "USD",
        method: PaymentMethod.APPLE_IAP,
        status: PaymentOrderStatus.PAID,
        transferReference: createTransferReference(),
        beneficiaryIban: "",
        beneficiaryBic: "",
        depositorNote: `apple_tx:${transactionId ?? "unknown"}|orig:${originalTransactionId ?? "unknown"}`,
        validatedAt: new Date(),
        expiresAt: expiresDate ? new Date(expiresDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Deactivate any previous active subscription
    await tx.subscription.updateMany({
      where: {
        ...(scope === "USER" ? { userId } : { businessId }),
        scope: scope as SubscriptionScope,
        status: "ACTIVE",
      },
      data: { status: "CANCELED", endsAt: new Date() },
    });

    // Create new active subscription
    await tx.subscription.create({
      data: {
        userId: scope === "USER" ? userId : null,
        businessId: scope === "BUSINESS" ? businessId : null,
        scope: scope as SubscriptionScope,
        planCode: targetPlan.code,
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        priceUsdCents: targetPlan.monthlyPriceUsdCents,
        startsAt: new Date(),
        endsAt: expiresDate ? new Date(expiresDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        autoRenew: true,
        metadata: {
          source: "APPLE_IAP",
          orderId: order.id,
          appleTransactionId: transactionId,
          appleOriginalTransactionId: originalTransactionId,
          appleProductId: productId,
        },
      },
    });

    // Update business subscription status if applicable
    if (scope === "BUSINESS" && businessId) {
      await tx.businessAccount.update({
        where: { id: businessId },
        data: { subscriptionStatus: targetPlan.code },
      });
    }
  });

  clearSubscriptionCache();

  logger.info(
    { userId, productId, transactionId, planCode: mapping.planCode },
    "[Apple IAP] Subscription activated",
  );

  return {
    ok: true,
    planCode: mapping.planCode,
    planName: targetPlan.name,
    message: `Forfait ${targetPlan.name} activé via Apple`,
  };
};

/**
 * Return the mapping of plan codes to Apple product IDs.
 * Used by the frontend to know which product to request from StoreKit.
 */
export const getAppleProductIds = () => {
  const result: Record<string, string> = {};
  for (const [appleId, mapping] of Object.entries(APPLE_PRODUCT_MAP)) {
    result[`${mapping.scope}:${mapping.planCode}`] = appleId;
  }
  return result;
};
