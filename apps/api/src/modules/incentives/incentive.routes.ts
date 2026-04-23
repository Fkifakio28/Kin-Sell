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
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
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
  rateLimit(RateLimits.COUPON_VALIDATE),
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

/* ── PUBLIC — preview coupon (calcul prix final) ── */

const previewSchema = z.object({
  code: z.string().min(3).max(30),
  originalAmountUsdCents: z.number().int().min(0),
  planCode: z.string().optional(),
  addonCode: z.string().optional(),
});

router.post(
  "/coupons/preview",
  requireAuth,
  rateLimit(RateLimits.COUPON_VALIDATE),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { code, originalAmountUsdCents, planCode, addonCode } = previewSchema.parse(request.body);
    const result = await incentiveService.previewCoupon(
      request.auth!.userId,
      code,
      originalAmountUsdCents,
      planCode,
      addonCode,
    );
    response.json(result);
  }),
);

/* ════════════════════════════════════════
   USER SELF-SERVICE — Mes avantages IA (D1)
   ════════════════════════════════════════ */

router.get(
  "/me/grants",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const grants = await incentiveService.listMyGrants(request.auth!.userId);
    response.json({ grants });
  }),
);

router.get(
  "/me/coupons",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const coupons = await incentiveService.listMyCoupons(request.auth!.userId);
    response.json({ coupons });
  }),
);

const convertParamsSchema = z.object({ id: z.string().min(1) });

router.post(
  "/me/grants/:id/convert",
  requireAuth,
  rateLimit(RateLimits.COUPON_VALIDATE),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { id } = convertParamsSchema.parse(request.params);
    try {
      const result = await incentiveService.convertGrantToCoupon(request.auth!.userId, id);
      response.status(201).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "CONVERSION_FAILED";
      const statusMap: Record<string, number> = {
        GRANT_NOT_FOUND: 404,
        GRANT_NOT_OWNED: 403,
        GRANT_NOT_ACTIVE: 409,
        GRANT_EXPIRED: 410,
        GRANT_NOT_CONVERTIBLE: 422,
        GRANT_ALREADY_CONSUMED: 409,
      };
      const knownCode = statusMap[message];
      if (!knownCode) {
        // Erreur inattendue (FK, DB, ...) → log + 500 pour que le front affiche un vrai message
        request.log?.error({ err, grantId: id, userId: request.auth?.userId }, "[Incentive] Unexpected grant conversion error");
        response.status(500).json({ error: "CONVERSION_FAILED", detail: message });
        return;
      }
      response.status(knownCode).json({ error: message });
    }
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
    try {
      const coupon = await incentiveService.createCoupon(request.auth!.userId, {
        ...input,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        expiresAt: new Date(input.expiresAt),
      });
      response.status(201).json(coupon);
    } catch (err) {
      const message = err instanceof Error ? err.message : "CREATE_FAILED";
      const map: Record<string, { status: number; msg: string }> = {
        EXPIRES_AT_IN_PAST: { status: 400, msg: "La date d'expiration doit être dans le futur." },
        RECIPIENT_USER_NOT_FOUND: { status: 404, msg: "L'utilisateur destinataire n'existe pas." },
        COUPON_100_MAX_DURATION_EXCEEDED: { status: 400, msg: "Un coupon -100% ne peut pas durer plus de 14 jours." },
      };
      if (message.startsWith("INVALID_PLAN_CODES:")) {
        const codes = message.split(":")[1];
        response.status(400).json({ error: "INVALID_PLAN_CODES", detail: `Codes de forfait invalides : ${codes}` });
        return;
      }
      const mapped = map[message];
      if (mapped) {
        response.status(mapped.status).json({ error: message, detail: mapped.msg });
        return;
      }
      request.log?.error({ err }, "[Incentive] Unexpected create coupon error");
      response.status(500).json({ error: "CREATE_FAILED", detail: message });
    }
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

/* ════════════════════════════════════════
   ADMIN — Delete coupon
   ════════════════════════════════════════ */

router.delete(
  "/admin/coupons/:id",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    await incentiveService.deleteCoupon(request.params.id);
    response.json({ deleted: true });
  }),
);

/* ════════════════════════════════════════
   ADMIN — Growth Grants
   ════════════════════════════════════════ */

const listGrantsSchema = z.object({
  userId: z.string().optional(),
  kind: z.enum(["CPC", "CPI", "CPA", "PLAN_DISCOUNT", "ADDON_DISCOUNT", "ADDON_FREE_GAIN"]).optional(),
  status: z.enum(["PENDING", "ACTIVE", "CONSUMED", "EXPIRED", "REVOKED"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get(
  "/admin/grants",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN, Role.ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const opts = listGrantsSchema.parse(request.query);
    const result = await incentiveService.listGrowthGrants(opts);
    response.json(result);
  }),
);

router.post(
  "/admin/grants/:id/revoke",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const grant = await incentiveService.revokeGrowthGrant(request.params.id);
    response.json(grant);
  }),
);

/* ════════════════════════════════════════
   ADMIN — Manual jobs trigger
   ════════════════════════════════════════ */

router.post(
  "/admin/jobs/expire",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (_request: AuthenticatedRequest, response) => {
    const result = await incentiveService.runExpirationJob();
    response.json(result);
  }),
);

router.post(
  "/admin/jobs/rebalance-100",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (_request: AuthenticatedRequest, response) => {
    const result = await incentiveService.runRebalance100Job();
    response.json(result);
  }),
);

/* ════════════════════════════════════════
   PUBLIC — Growth grant events (CPC/CPI/CPA pipeline)
   ════════════════════════════════════════ */

const grantEventSchema = z.object({
  eventType: z.enum(["click", "install", "action", "conversion"]),
  idempotencyKey: z.string().min(8).max(128),
  metadata: z.record(z.unknown()).optional(),
});

router.post(
  "/grants/:id/events",
  requireAuth,
  rateLimit(RateLimits.GRANT_EVENT),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { eventType, idempotencyKey, metadata } = grantEventSchema.parse(request.body);
    const result = await incentiveService.recordGrowthEventIdempotent(
      request.params.id,
      request.auth!.userId,
      eventType,
      idempotencyKey,
      metadata,
    );
    response.status(201).json(result);
  }),
);

/* ════════════════════════════════════════
   ADMIN — Policy management
   ════════════════════════════════════════ */

router.get(
  "/admin/policies",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (_request: AuthenticatedRequest, response) => {
    const policies = await incentiveService.getPolicies();
    response.json(policies);
  }),
);

const updatePolicySchema = z.object({
  couponProbability: z.number().min(0).max(1).optional(),
  growthProbability: z.number().min(0).max(1).optional(),
  maxCouponsPerMonth: z.number().int().min(0).optional(),
  maxGrowthGrantsPerMonth: z.number().int().min(0).optional(),
  maxDiscount80PerMonth: z.number().int().min(0).optional(),
  maxAddonGainPerMonth: z.number().int().min(0).optional(),
  coupon100MaxDays: z.number().int().min(1).max(30).optional(),
  target100Ratio: z.number().min(0).max(1).optional(),
  allowedDiscounts: z.array(z.number().int().min(0).max(100)).optional(),
  globalPause: z.boolean().optional(),
});

router.patch(
  "/admin/policies/:segment",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const segment = request.params.segment as "STANDARD" | "TESTER";
    if (!["STANDARD", "TESTER"].includes(segment)) {
      response.status(400).json({ error: "Invalid segment" });
      return;
    }
    const data = updatePolicySchema.parse(request.body);
    const policy = await incentiveService.updatePolicy(segment, request.auth!.userId, data);
    response.json(policy);
  }),
);

router.post(
  "/admin/global-pause",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { paused } = z.object({ paused: z.boolean() }).parse(request.body);
    const result = await incentiveService.setGlobalPause(request.auth!.userId, paused);
    response.json(result);
  }),
);

const overrideQuotaSchema = z.object({
  userId: z.string().min(1),
  couponCount: z.number().int().min(0).optional(),
  cpcCount: z.number().int().min(0).optional(),
  cpiCount: z.number().int().min(0).optional(),
  cpaCount: z.number().int().min(0).optional(),
  discount80Count: z.number().int().min(0).optional(),
  addonGainCount: z.number().int().min(0).optional(),
  coupon100Count: z.number().int().min(0).optional(),
});

router.post(
  "/admin/quota-override",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { userId, ...overrides } = overrideQuotaSchema.parse(request.body);
    const result = await incentiveService.overrideUserQuota(request.auth!.userId, userId, overrides);
    response.json(result);
  }),
);

const forceGrantSchema = z.object({
  userId: z.string().min(1),
  kind: z.enum(["CPC", "CPI", "CPA"]),
  discountPercent: z.number().int().min(0).max(100),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

router.post(
  "/admin/force-grant",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { userId, kind, discountPercent, expiresInDays } = forceGrantSchema.parse(request.body);
    const grant = await incentiveService.forceEmitGrant(
      request.auth!.userId,
      userId,
      kind,
      discountPercent,
      expiresInDays,
    );
    response.status(201).json(grant);
  }),
);

router.get(
  "/admin/audit-log",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const opts = z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(request.query);
    const result = await incentiveService.getAdminAuditLog(opts);
    response.json(result);
  }),
);

/* ════════════════════════════════════════
   ADMIN — Diagnostic (decision trace)
   ════════════════════════════════════════ */

router.get(
  "/admin/diagnostic/:userId",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN, Role.ADMIN),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await incentiveService.diagnosticUser(request.params.userId);
    response.json(result);
  }),
);

/* ════════════════════════════════════════
   ADMIN — Stats / KPIs
   ════════════════════════════════════════ */

router.get(
  "/admin/stats",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN, Role.ADMIN),
  asyncHandler(async (_request: AuthenticatedRequest, response) => {
    const result = await incentiveService.getIncentiveStats();
    response.json(result);
  }),
);

export default router;
