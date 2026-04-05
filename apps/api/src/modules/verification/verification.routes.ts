import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { prisma } from "../../shared/db/prisma.js";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import * as verificationService from "./verification.service.js";

const router = Router();

// ══════════════════════════════════════════════
// USER ENDPOINTS (authentifié)
// ══════════════════════════════════════════════

// POST /verification/request — Soumettre une demande de vérification
router.post(
  "/request",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { accountType, businessId } = z
      .object({
        accountType: z.enum(["USER", "BUSINESS"]),
        businessId: z.string().optional(),
      })
      .parse(req.body);

    if (accountType === "BUSINESS" && !businessId) {
      throw new HttpError(400, "businessId requis pour une vérification business.");
    }

    // Verify ownership of business
    if (accountType === "BUSINESS" && businessId) {
      const business = await prisma.businessAccount.findFirst({
        where: { id: businessId, ownerUserId: req.auth!.userId },
      });
      if (!business) throw new HttpError(403, "Vous n'êtes pas propriétaire de cette entreprise.");
    }

    const result = await verificationService.requestVerification(
      req.auth!.userId,
      accountType,
      businessId
    );
    res.json(result);
  })
);

// GET /verification/status — Mon statut de vérification
router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await verificationService.getMyVerificationStatus(req.auth!.userId);
    res.json(result);
  })
);

// GET /verification/credibility — Mon score de crédibilité IA
router.get(
  "/credibility",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await verificationService.getMyCredibilityScore(req.auth!.userId);
    res.json(result);
  })
);

// GET /verification/credibility/business/:businessId — Score crédibilité business
router.get(
  "/credibility/business/:businessId",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const business = await prisma.businessAccount.findFirst({
      where: { id: req.params.businessId, ownerUserId: req.auth!.userId },
    });
    if (!business) throw new HttpError(403, "Vous n'êtes pas propriétaire de cette entreprise.");

    const result = await verificationService.getBusinessCredibilityScore(req.params.businessId);
    res.json(result);
  })
);

// ══════════════════════════════════════════════
// ADMIN ENDPOINTS
// ══════════════════════════════════════════════

async function checkVerificationPermission(req: AuthenticatedRequest) {
  if (req.auth!.role === Role.SUPER_ADMIN) return;
  const profile = await prisma.adminProfile.findUnique({
    where: { userId: req.auth!.userId },
  });
  if (!profile || !profile.permissions.includes("VERIFICATION" as any)) {
    throw new HttpError(403, "Permission requise: VERIFICATION");
  }
}

// GET /verification/admin/requests — Liste des demandes (admin)
router.get(
  "/admin/requests",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await checkVerificationPermission(req);

    const { status, page, limit } = z
      .object({
        status: z.string().optional(),
        page: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().positive().max(100).optional(),
      })
      .parse(req.query);

    const result = await verificationService.getVerificationRequests({
      status: status as any,
      page,
      limit,
    });
    res.json(result);
  })
);

// GET /verification/admin/requests/:id — Détail d'une demande (admin)
router.get(
  "/admin/requests/:id",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await checkVerificationPermission(req);
    const result = await verificationService.getVerificationDetail(req.params.id);
    res.json(result);
  })
);

// PATCH /verification/admin/requests/:id/approve — Approuver
router.patch(
  "/admin/requests/:id/approve",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await checkVerificationPermission(req);
    const { note } = z.object({ note: z.string().optional() }).parse(req.body);
    const result = await verificationService.adminApproveVerification(req.params.id, req.auth!.userId, note);
    res.json(result);
  })
);

// PATCH /verification/admin/requests/:id/reject — Rejeter
router.patch(
  "/admin/requests/:id/reject",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await checkVerificationPermission(req);
    const { note } = z.object({ note: z.string().optional() }).parse(req.body);
    const result = await verificationService.adminRejectVerification(req.params.id, req.auth!.userId, note);
    res.json(result);
  })
);

// PATCH /verification/admin/requests/:id/revoke — Révoquer
router.patch(
  "/admin/requests/:id/revoke",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await checkVerificationPermission(req);
    const { note } = z.object({ note: z.string().optional() }).parse(req.body);
    const result = await verificationService.adminRevokeVerification(req.params.id, req.auth!.userId, note);
    res.json(result);
  })
);

// PATCH /verification/admin/requests/:id/lock-verified — Verrouiller comme vérifié
router.patch(
  "/admin/requests/:id/lock-verified",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await checkVerificationPermission(req);
    const { note } = z.object({ note: z.string().optional() }).parse(req.body);
    const result = await verificationService.adminLockVerified(req.params.id, req.auth!.userId, note);
    res.json(result);
  })
);

// PATCH /verification/admin/requests/:id/lock-revoked — Verrouiller comme révoqué
router.patch(
  "/admin/requests/:id/lock-revoked",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await checkVerificationPermission(req);
    const { note } = z.object({ note: z.string().optional() }).parse(req.body);
    const result = await verificationService.adminLockRevoked(req.params.id, req.auth!.userId, note);
    res.json(result);
  })
);

// PATCH /verification/admin/requests/:id/reactivate — Réactiver
router.patch(
  "/admin/requests/:id/reactivate",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await checkVerificationPermission(req);
    const { note } = z.object({ note: z.string().optional() }).parse(req.body);
    const result = await verificationService.adminReactivate(req.params.id, req.auth!.userId, note);
    res.json(result);
  })
);

// POST /verification/admin/ai-scan — Lancer un scan IA manuel (admin)
router.post(
  "/admin/ai-scan",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await checkVerificationPermission(req);
    const [checkResult, scanResult] = await Promise.all([
      verificationService.runAICredibilityCheck(),
      verificationService.scanAndCreateEligibleRequests(),
    ]);
    res.json({ check: checkResult, scan: scanResult });
  })
);

export default router;
