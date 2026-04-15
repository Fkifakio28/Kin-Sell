/**
 * Routes Mobile Money — Orange Money + M-Pesa
 *
 * POST   /mobile-money/initiate           → Initier un paiement
 * GET    /mobile-money/status/:paymentId  → Vérifier le statut
 * GET    /mobile-money/my-payments        → Historique utilisateur
 * POST   /mobile-money/webhook/orange     → Callback Orange Money
 * POST   /mobile-money/webhook/mpesa      → Callback M-Pesa
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import * as momoService from "./mobile-money.service.js";

const initiateSchema = z.object({
  provider: z.enum(["ORANGE_MONEY", "MPESA"]),
  phoneNumber: z
    .string()
    .regex(/^243\d{9}$/, "Le numéro doit être au format 243XXXXXXXXX (RDC)"),
  amountCDF: z.number().int().min(100, "Montant minimum: 100 CDF"),
  // SÉCURITÉ : seuls les paiements de commandes (ORDER) sont autorisés via Mobile Money.
  // Les abonnements (SUBSCRIPTION) et publicités (AD_PAYMENT) passent obligatoirement par PayPal.
  purpose: z.enum(["ORDER"]),
  targetId: z.string().optional(),
});

const pagingSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
});

const router = Router();

// ─── Routes authentifiées ───────────────────────────────

/**
 * Initier un paiement Mobile Money.
 */
router.post(
  "/initiate",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = initiateSchema.parse(request.body);
    const result = await momoService.initiatePayment(request.auth!.userId, payload);
    response.status(201).json(result);
  })
);

/**
 * Vérifier le statut d'un paiement (polling côté client).
 */
router.get(
  "/status/:paymentId",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await momoService.checkStatus(
      request.auth!.userId,
      request.params.paymentId
    );
    response.json(result);
  })
);

/**
 * Historique des paiements Mobile Money de l'utilisateur.
 */
router.get(
  "/my-payments",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { page, limit } = pagingSchema.parse(request.query);
    const result = await momoService.listUserPayments(request.auth!.userId, page, limit);
    response.json(result);
  })
);

// ─── Webhooks (pas d'auth utilisateur — vérifiés par token + confirmation serveur) ──

/**
 * Callback Orange Money.
 * Sécurité: token webhook vérifié + statut confirmé côté API Orange.
 */
router.post(
  "/webhook/orange",
  asyncHandler(async (request, response) => {
    momoService.verifyWebhookToken(request);
    const result = await momoService.handleOrangeWebhook(request.body);
    response.json(result);
  })
);

/**
 * Callback M-Pesa.
 * Sécurité: token webhook vérifié + statut confirmé côté API M-Pesa.
 */
router.post(
  "/webhook/mpesa",
  asyncHandler(async (request, response) => {
    momoService.verifyWebhookToken(request);
    const result = await momoService.handleMpesaWebhook(request.body);
    response.json(result);
  })
);

export default router;
