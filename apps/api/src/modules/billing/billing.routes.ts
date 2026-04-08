import { AddonCode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { Role } from "../../types/roles.js";
import * as billingService from "./billing.service.js";
import * as momoService from "../mobile-money/mobile-money.service.js";
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

const confirmDepositSchema = z.object({
  orderId: z.string().min(8),
  depositorNote: z.string().max(240).optional(),
  proofUrl: z.string().url().optional()
});

const activateOrderSchema = z.object({
  orderId: z.string().min(8)
});

const momoCheckoutSchema = z.object({
  planCode: z.string().min(2).max(40),
  billingCycle: z.enum(["MONTHLY", "ONE_TIME"]).default("MONTHLY"),
  provider: z.enum(["ORANGE_MONEY", "MPESA"]),
  phoneNumber: z.string().regex(/^243\d{9}$/, "Format: 243XXXXXXXXX"),
  amountCDF: z.number().int().min(100, "Montant minimum: 100 CDF")
});

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
    response.json(data);
  })
);

router.post(
  "/checkout/bank-transfer",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = checkoutSchema.parse(request.body);
    const data = await billingService.createBankTransferOrder(request.auth!.userId, payload);
    response.status(201).json(data);
  })
);

router.post(
  "/checkout/mobile-money",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = momoCheckoutSchema.parse(request.body);

    // Créer d'abord le PaymentOrder dans le billing
    const order = await billingService.createBankTransferOrder(request.auth!.userId, {
      planCode: payload.planCode,
      billingCycle: payload.billingCycle,
    });

    // Initier le paiement Mobile Money relié à ce PaymentOrder
    const momoResult = await momoService.initiatePayment(request.auth!.userId, {
      provider: payload.provider,
      phoneNumber: payload.phoneNumber,
      amountCDF: payload.amountCDF,
      purpose: "SUBSCRIPTION",
      targetId: order.orderId,
    });

    response.status(201).json({
      paymentOrder: order,
      mobileMoney: momoResult,
    });
  })
);

router.get(
  "/payment-orders",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = await billingService.listMyPaymentOrders(request.auth!.userId);
    response.json(data);
  })
);

router.post(
  "/payment-orders/confirm-deposit",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = confirmDepositSchema.parse(request.body);
    const data = await billingService.confirmDepositSent(request.auth!.userId, payload);
    response.json(data);
  })
);

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
// Voir admin.routes.ts pour l'endpoint admin.

export default router;
