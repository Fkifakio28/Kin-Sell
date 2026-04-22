/**
 * Boost Routes — Endpoints du système unifié.
 *
 * /boost/estimate            POST public auth — devis
 * /boost/campaigns           POST auth — crée campagne (débite wallet)
 * /boost/campaigns           GET  auth — liste mes campagnes
 * /boost/campaigns/:id       GET  auth — détail + KPI
 * /boost/campaigns/:id       DELETE auth — annule + refund prorata
 * /boost/campaigns/:id/pause POST auth
 * /boost/campaigns/:id/resume POST auth
 * /boost/wallet              GET  auth — solde
 * /boost/wallet/transactions GET  auth — historique
 * /boost/wallet/credit       POST admin — créditer un user (ajustement / recharge)
 * /boost/admin/kpi           GET  admin — KPI global boost
 */

import { Router } from "express";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logger.js";
import {
  createCampaign,
  cancelCampaign,
  pauseCampaign,
  resumeCampaign,
  listMyCampaigns,
  getCampaign,
  estimateBoost,
  getAdminBoostKpi,
} from "./boost.service.js";
import {
  getWalletSnapshot,
  creditWallet,
  listTransactions,
} from "./wallet.service.js";
import type { PromotionScope } from "../ads/ads-boost.service.js";
import { BoostTarget, BoostStatus } from "@prisma/client";

const router = Router();

const SCOPES: PromotionScope[] = ["LOCAL", "NATIONAL", "CROSS_BORDER"];
const TARGETS: BoostTarget[] = ["LISTING", "POST", "PROFILE", "SHOP"];

// ── Estimate (devis) ─────────────────────────────────────────────────────────
router.post("/estimate", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { scope, durationDays, budgetUsdCents } = req.body as {
    scope?: PromotionScope;
    durationDays?: number;
    budgetUsdCents?: number;
  };
  const s: PromotionScope = SCOPES.includes(scope as PromotionScope) ? (scope as PromotionScope) : "LOCAL";
  const d = Math.max(1, Math.min(Number(durationDays) || 7, 90));
  const b = Math.max(0, Number(budgetUsdCents) || 0);
  const est = estimateBoost(s, d, b);
  res.json({ estimate: est });
}));

// ── Créer campagne ───────────────────────────────────────────────────────────
router.post("/campaigns", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { target, targetId, scope, targetCountries, budgetUsdCents, durationDays, dailyCapUsdCents } = req.body as {
    target?: BoostTarget;
    targetId?: string;
    scope?: PromotionScope;
    targetCountries?: string[];
    budgetUsdCents?: number;
    durationDays?: number;
    dailyCapUsdCents?: number;
  };
  if (!target || !TARGETS.includes(target)) throw new HttpError(400, "target invalide");
  if (!targetId) throw new HttpError(400, "targetId requis");
  if (!budgetUsdCents || budgetUsdCents <= 0) throw new HttpError(400, "budgetUsdCents requis");
  if (!durationDays || durationDays <= 0) throw new HttpError(400, "durationDays requis");

  const s: PromotionScope = SCOPES.includes(scope as PromotionScope) ? (scope as PromotionScope) : "LOCAL";

  const campaign = await createCampaign({
    userId: req.auth!.userId,
    userRole: req.auth!.role,
    target,
    targetId,
    scope: s,
    targetCountries: Array.isArray(targetCountries) ? targetCountries : [],
    budgetUsdCents: Math.round(budgetUsdCents),
    durationDays: Math.round(durationDays),
    dailyCapUsdCents: dailyCapUsdCents ? Math.round(dailyCapUsdCents) : undefined,
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "BOOST_CAMPAIGN_CREATED",
      entityType: "BoostCampaign",
      entityId: campaign.id,
      metadata: {
        target,
        targetId,
        scope: s,
        budgetUsdCents: campaign.budgetUsdCents,
        durationDays: campaign.durationDays,
      },
    },
  }).catch((err) => logger.error(err, "[Boost] audit log failed"));

  res.status(201).json({ campaign });
}));

// ── Lister mes campagnes ─────────────────────────────────────────────────────
router.get("/campaigns", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const statusParam = req.query.status as string | undefined;
  const status = statusParam && (["ACTIVE", "PAUSED", "EXPIRED", "CANCELED", "EXHAUSTED"] as BoostStatus[]).includes(statusParam as BoostStatus)
    ? (statusParam as BoostStatus)
    : undefined;
  const campaigns = await listMyCampaigns(req.auth!.userId, status);
  res.json({ campaigns });
}));

// ── Détail + KPI ─────────────────────────────────────────────────────────────
router.get("/campaigns/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const campaign = await getCampaign(req.auth!.userId, req.params.id, req.auth!.role);
  res.json({ campaign });
}));

// ── Annuler ──────────────────────────────────────────────────────────────────
router.delete("/campaigns/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const result = await cancelCampaign(req.auth!.userId, req.params.id, req.auth!.role);
  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "BOOST_CAMPAIGN_CANCELED",
      entityType: "BoostCampaign",
      entityId: req.params.id,
      metadata: { refundedUsdCents: result.refundedUsdCents },
    },
  }).catch((err) => logger.error(err, "[Boost] audit log failed"));
  res.json(result);
}));

// ── Pause / Resume ───────────────────────────────────────────────────────────
router.post("/campaigns/:id/pause", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const r = await pauseCampaign(req.auth!.userId, req.params.id, req.auth!.role);
  res.json(r);
}));
router.post("/campaigns/:id/resume", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const r = await resumeCampaign(req.auth!.userId, req.params.id, req.auth!.role);
  res.json(r);
}));

// ── Wallet: solde + historique ───────────────────────────────────────────────
router.get("/wallet", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const wallet = await getWalletSnapshot(req.auth!.userId);
  res.json({ wallet });
}));

router.get("/wallet/transactions", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const cursor = (req.query.cursor as string) || undefined;
  const result = await listTransactions(req.auth!.userId, limit, cursor);
  res.json(result);
}));

// ── Wallet credit (admin uniquement) ─────────────────────────────────────────
router.post(
  "/wallet/credit",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN, Role.ADMIN),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { userId, amountUsdCents, description, reference } = req.body as {
      userId?: string;
      amountUsdCents?: number;
      description?: string;
      reference?: string;
    };
    if (!userId || !amountUsdCents || amountUsdCents <= 0) {
      throw new HttpError(400, "userId et amountUsdCents>0 requis");
    }
    const wallet = await creditWallet({
      userId,
      amountUsdCents: Math.round(amountUsdCents),
      type: "CREDIT",
      description: description ?? "Crédit admin",
      reference,
      createdBy: req.auth!.userId,
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.userId,
        action: "WALLET_CREDIT",
        entityType: "Wallet",
        entityId: wallet.id,
        metadata: { userId, amountUsdCents, reference },
      },
    }).catch((err) => logger.error(err, "[Boost] audit log failed"));
    res.json({ wallet });
  }),
);

// ── Admin KPI ────────────────────────────────────────────────────────────────
router.get(
  "/admin/kpi",
  requireAuth,
  requireRoles(Role.SUPER_ADMIN, Role.ADMIN),
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const kpi = await getAdminBoostKpi();
    res.json(kpi);
  }),
);

export default router;
