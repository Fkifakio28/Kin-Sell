/**
 * Incentive Engine — API routes
 * Public: validate coupon
 * Admin: CRUD coupons, quotas dashboard, redemptions
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { Role } from "../../types/roles.js";
import * as incentiveService from "./incentive.service.js";

const router = Router();

/* ════════════════════════════════════════
   PUBLIC — validate coupon
   ════════════════════════════════════════ */

const validateSchema = z.object({
  code: z.string().min(3).max(30),
  planCode: z.string().optional(),
  addonCode: z.string().optional(),
});

router.post(
  "/coupons/validate",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { code, planCode, addonCode } = validateSchema.parse(request.body);
    const result = await incentiveService.validateCoupon(
      request.auth!.userId,
      code,
      planCode,
      addonCode,
    );
    response.json(result);
  }),
);

/* ════════════════════════════════════════
   ADMIN — CRUD coupons
   ════════════════════════════════════════ */

const createCouponSchema = z.object({
  kind: z.enum(["PLAN_DISCOUNT", "ADDON_DISCOUNT", "ADDON_FREE_GAIN", "CPC", "CPI", "CPA"]),
  discountPercent: z.number().int().min(0).max(100).optional(),
  targetScope: z.enum(["ALL_PLANS", "USER_PLANS", "BUSINESS_PLANS", "ALL_ADDONS", "SPECIFIC"]).optional(),
  targetPlanCodes: z.array(z.string()).optional(),
  targetAddonCodes: z.array(z.string()).optional(),
  maxUses: z.number().int().min(1).optional(),
  maxUsesPerUser: z.number().int().min(1).optional(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).optional(),
  segment: z.enum(["STANDARD", "TESTER"]).optional(),
  recipientUserId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

router.post(
  "/admin/coupons",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const input = createCouponSchema.parse(request.body);
    const coupon = await incentiveService.createCoupon(request.auth!.userId, {
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      expiresAt: new Date(input.expiresAt),
    });
    response.status(201).json(coupon);
  }),
);

const listCouponsSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "REVOKED"]).optional(),
  kind: z.enum(["PLAN_DISCOUNT", "ADDON_DISCOUNT", "ADDON_FREE_GAIN", "CPC", "CPI", "CPA"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get(
  "/admin/coupons",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN, Role.ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const opts = listCouponsSchema.parse(request.query);
    const result = await incentiveService.listCoupons(opts);
    response.json(result);
  }),
);

const updateCouponSchema = z.object({
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "EXPIRED", "REVOKED"]).optional(),
  expiresAt: z.string().datetime().optional(),
  maxUses: z.number().int().min(1).optional(),
  maxUsesPerUser: z.number().int().min(1).optional(),
});

router.patch(
  "/admin/coupons/:id",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const data = updateCouponSchema.parse(request.body);
    const coupon = await incentiveService.updateCoupon(request.params.id, {
      ...data,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });
    response.json(coupon);
  }),
);

router.post(
  "/admin/coupons/:id/revoke",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const coupon = await incentiveService.revokeCoupon(request.params.id);
    response.json(coupon);
  }),
);

const extendSchema = z.object({
  expiresAt: z.string().datetime(),
});

router.post(
  "/admin/coupons/:id/extend",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { expiresAt } = extendSchema.parse(request.body);
    const coupon = await incentiveService.extendCoupon(request.params.id, new Date(expiresAt));
    response.json(coupon);
  }),
);

const assignSchema = z.object({
  userId: z.string().min(1),
});

router.post(
  "/admin/coupons/:id/assign",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { userId } = assignSchema.parse(request.body);
    const coupon = await incentiveService.assignCouponToUser(request.params.id, userId);
    response.json(coupon);
  }),
);

/* ════════════════════════════════════════
   ADMIN — Redemptions
   ════════════════════════════════════════ */

const redemptionsSchema = z.object({
  couponId: z.string().optional(),
  userId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get(
  "/admin/redemptions",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN, Role.ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const opts = redemptionsSchema.parse(request.query);
    const result = await incentiveService.getRedemptions(opts);
    response.json(result);
  }),
);

/* ════════════════════════════════════════
   ADMIN — Quotas dashboard
   ════════════════════════════════════════ */

router.get(
  "/admin/quotas",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN, Role.ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const userId = typeof request.query.userId === "string" ? request.query.userId : undefined;
    const data = await incentiveService.getQuotaDashboard(userId);
    response.json(data);
  }),
);

export default router;
