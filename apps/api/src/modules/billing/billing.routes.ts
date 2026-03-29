import { AddonCode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import * as billingService from "./billing.service.js";

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

router.post(
  "/subscription/simulate-change",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = changeSubscriptionSchema.parse(request.body);
    const data = await billingService.simulateChangeSubscription(request.auth!.userId, payload);
    response.json(data);
  })
);

router.post(
  "/addons/simulate",
  requireAuth,
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

router.post(
  "/payment-orders/activate",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = activateOrderSchema.parse(request.body);
    const data = await billingService.activatePlanFromValidatedOrder(request.auth!.userId, payload);
    response.json(data);
  })
);

export default router;
