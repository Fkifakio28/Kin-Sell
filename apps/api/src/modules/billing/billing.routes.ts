import { AddonCode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { Role } from "../../types/roles.js";
import * as billingService from "./billing.service.js";
import * as appleIap from "./apple-iap.service.js";
import { prisma } from "../../shared/db/prisma.js";
import express from "express";

const changeSubscriptionSchema = z.object({
  planCode: z.string().min(2).max(40),
  billingCycle: z.enum(["MONTHLY", "ONE_TIME"]).default("MONTHLY")
});

const changeAddonSchema = z.object({
  addonCode: z.nativeEnum(AddonCode),
  action: z.enum(["ENABLE", "DISABLE"]),
  monthlyPriceUsdCents: z.number().int().nonnegative().optional()
});

const checkoutSchema = z.object({
  planCode: z.string().min(2).max(40),
  billingCycle: z.enum(["MONTHLY", "ONE_TIME"]).default("MONTHLY")
});

// Schemas bank/momo/confirm supprimés — PayPal uniquement

const router = Router();

router.get(
  "/catalog",
  asyncHandler(async (_request, response) => {
    response.json(billingService.getCatalog());
  })
);

router.get(
  "/my-plan",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await billingService.getMyPlan(request.auth!.userId);
    response.json(data);
  })
);

// SÉCURITÉ : activation manuelle de forfait réservée aux super admins uniquement
router.post(
  "/subscription/simulate-change",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = changeSubscriptionSchema.parse(request.body);
    const data = await billingService.simulateChangeSubscription(request.auth!.userId, payload);

    await prisma.auditLog.create({
      data: {
        actorUserId: request.auth!.userId,
        action: "BILLING_SIMULATE_PLAN_CHANGE",
        entityType: "Subscription",
        entityId: request.auth!.userId,
        metadata: { planCode: payload.planCode, billingCycle: payload.billingCycle },
      },
    });

    response.json(data);
  })
);

// SÉCURITÉ : activation manuelle d'add-on réservée aux super admins uniquement
router.post(
  "/addons/simulate",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = changeAddonSchema.parse(request.body);
    const data = await billingService.simulateAddonChange(request.auth!.userId, payload);

    await prisma.auditLog.create({
      data: {
        actorUserId: request.auth!.userId,
        action: "BILLING_SIMULATE_ADDON",
        entityType: "SubscriptionAddon",
        entityId: request.auth!.userId,
        metadata: { addonCode: payload.addonCode, actionType: payload.action },
      },
    });

    response.json(data);
  })
);

// Routes bank-transfer et mobile-money supprimées — PayPal uniquement

router.get(
  "/payment-orders",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await billingService.listMyPaymentOrders(request.auth!.userId);
    response.json(data);
  })
);

// Route confirm-deposit supprimée — plus de virement bancaire

const paypalCheckoutSchema = z.object({
  planCode: z.string().min(2).max(40),
  billingCycle: z.enum(["MONTHLY", "ONE_TIME"]).default("MONTHLY"),
});

router.post(
  "/checkout/paypal",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = paypalCheckoutSchema.parse(request.body);
    const data = await billingService.createPaypalCheckout(request.auth!.userId, payload);
    response.status(201).json(data);
  })
);

// PayPal capture — user returns from PayPal, frontend calls this to finalize payment
const paypalCaptureSchema = z.object({
  orderId: z.string().min(8),
});

router.post(
  "/paypal/capture",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = paypalCaptureSchema.parse(request.body);
    const data = await billingService.capturePaypalPayment(request.auth!.userId, payload);
    response.json(data);
  })
);

// PayPal IPN (legacy fallback) — kept for safety
router.post(
  "/paypal/ipn",
  express.urlencoded({ extended: false }),
  asyncHandler(async (_request, response) => {
    // Legacy IPN — no longer primary flow since we use REST capture
    response.status(200).json({ received: true });
  })
);

// SUPPRIMÉ : /payment-orders/activate n'est plus accessible aux utilisateurs.
// L'activation se fait UNIQUEMENT via :
//   1. PayPal capture automatique (/paypal/capture)
//   2. Validation admin (/admin/billing/validate-order)
//   3. Apple IAP verification (/apple/verify)
// Voir admin.routes.ts pour l'endpoint admin.

// ── Apple In-App Purchase ──────────────────────────────────────────────────
// Returns Apple product ID mapping so the iOS app knows which product to request
router.get("/apple/products", (_req, res) => {
  res.json(appleIap.getAppleProductIds());
});

// Verify Apple receipt/transaction and activate subscription
router.post(
  "/apple/verify",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const payload = z.object({
      receiptData: z.string().optional(),
      transactionJws: z.string().optional(),
      productId: z.string().optional(),
    }).refine(d => d.receiptData || d.transactionJws, {
      message: "receiptData ou transactionJws requis",
    }).parse(req.body);

    const result = await appleIap.verifyAndActivateApplePurchase(req.auth!.userId, payload);
    res.json(result);
  })
);

export default router;
