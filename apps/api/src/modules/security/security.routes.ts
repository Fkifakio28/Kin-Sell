/**
 * Security Admin Routes — Kin-Sell
 *
 * Exposer le dashboard sécurité, événements, signaux de fraude,
 * restrictions, historique de confiance, sanctions manuelles.
 */

import { RestrictionType, SanctionLevel } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { Role } from "../../types/roles.js";
import { prisma } from "../../shared/db/prisma.js";
import * as securityService from "./security.service.js";
import * as trustScoreService from "./trust-score.service.js";

const router = Router();

// All security routes require ADMIN or SUPER_ADMIN
router.use(requireAuth, requireRoles(Role.ADMIN, Role.SUPER_ADMIN));

// ── Permission check (similar to admin.routes.ts) ──
async function checkPermission(req: AuthenticatedRequest, permission: string) {
  if (req.auth!.role === Role.SUPER_ADMIN) return;
  const profile = await prisma.adminProfile.findUnique({ where: { userId: req.auth!.userId } });
  if (!profile || !profile.permissions.includes(permission as any)) {
    throw new HttpError(403, `Permission requise: ${permission}`);
  }
}

// ════════════════════════════════════════════
// DASHBOARD SÉCURITÉ
// ════════════════════════════════════════════

router.get("/dashboard", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const data = await securityService.getSecurityDashboard();
  res.json(data);
}));

// ════════════════════════════════════════════
// ÉVÉNEMENTS DE SÉCURITÉ
// ════════════════════════════════════════════

const eventsQuerySchema = z.object({
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  eventType: z.string().optional(),
  userId: z.string().optional(),
  riskLevel: z.coerce.number().min(0).max(10).optional(),
});

router.get("/events", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const params = eventsQuerySchema.parse(req.query);
  const data = await securityService.getSecurityEvents(params);
  res.json(data);
}));

// ════════════════════════════════════════════
// SIGNAUX DE FRAUDE
// ════════════════════════════════════════════

const fraudQuerySchema = z.object({
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  resolved: z.enum(["true", "false"]).transform(v => v === "true").optional(),
});

router.get("/fraud-signals", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ANTI_FRAUD");
  const params = fraudQuerySchema.parse(req.query);
  const data = await securityService.getFraudSignals(params);
  res.json(data);
}));

router.patch("/fraud-signals/:id/resolve", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ANTI_FRAUD");
  const data = await securityService.resolveFraudSignal(req.params.id, req.auth!.userId);
  res.json(data);
}));

// ════════════════════════════════════════════
// RESTRICTIONS
// ════════════════════════════════════════════

const restrictionsQuerySchema = z.object({
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  isActive: z.enum(["true", "false"]).transform(v => v === "true").optional(),
});

router.get("/restrictions", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const params = restrictionsQuerySchema.parse(req.query);
  const data = await securityService.getAllRestrictions(params);
  res.json(data);
}));

const applyRestrictionSchema = z.object({
  userId: z.string().min(1),
  restrictionType: z.nativeEnum(RestrictionType),
  reason: z.string().min(1).max(500),
  sanctionLevel: z.nativeEnum(SanctionLevel).optional(),
  durationHours: z.number().min(1).max(8760).optional(),
});

router.post("/restrictions", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const params = applyRestrictionSchema.parse(req.body);
  const data = await securityService.applyRestriction({
    ...params,
    appliedBy: req.auth!.userId,
  });
  res.status(201).json(data);
}));

router.patch("/restrictions/:id/lift", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const data = await securityService.liftRestriction(req.params.id);
  res.json(data);
}));

// ════════════════════════════════════════════
// TRUST SCORE
// ════════════════════════════════════════════

router.get("/users/:userId/trust", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const history = await securityService.getUserTrustHistory(req.params.userId);
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { trustScore: true, trustLevel: true },
  });
  res.json({ current: user, history });
}));

const adjustTrustSchema = z.object({
  delta: z.number().min(-100).max(100),
  reason: z.string().min(1).max(500),
});

router.post("/users/:userId/trust/adjust", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const { delta, reason } = adjustTrustSchema.parse(req.body);
  const result = await trustScoreService.applyDelta(
    req.params.userId,
    delta,
    reason,
    `ADMIN:${req.auth!.userId}`,
  );
  res.json(result);
}));

router.post("/users/:userId/trust/recalculate", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const result = await trustScoreService.recalculate(req.params.userId);
  res.json(result);
}));

// ════════════════════════════════════════════
// SANCTIONS
// ════════════════════════════════════════════

const sanctionSchema = z.object({
  userId: z.string().min(1),
  level: z.nativeEnum(SanctionLevel),
  reason: z.string().min(1).max(500),
  durationHours: z.number().min(1).max(8760).optional(),
});

router.post("/sanctions", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const params = sanctionSchema.parse(req.body);
  await securityService.applySanction({
    ...params,
    appliedBy: req.auth!.userId,
  });
  res.json({ ok: true, level: params.level, userId: params.userId });
}));

// ════════════════════════════════════════════
// RESTRICTIONS D'UN UTILISATEUR
// ════════════════════════════════════════════

router.get("/users/:userId/restrictions", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SECURITY");
  const restrictions = await securityService.getUserActiveRestrictions(req.params.userId);
  res.json({ restrictions });
}));

export default router;
