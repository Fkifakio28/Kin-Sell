/**
 * Analytics Routes — IA Analytique (Palier 1 + 2) + Orchestrateur
 */

import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { getBasicInsights, getDeepInsights } from "./analytics-ai.service.js";
import { runDiagnostic } from "./ai-orchestrator.service.js";
import * as aiMemory from "./ai-memory.service.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

const router = Router();

// Middleware PREMIUM — vérifie l'abonnement actif PRO/PREMIUM/BUSINESS
async function requirePremium(req: AuthenticatedRequest, _res: any, next: any) {
  const userId = req.auth!.userId;
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE", endsAt: { gt: new Date() } },
    select: { planCode: true },
  });
  if (!subscription) throw new HttpError(403, "Abonnement Premium requis pour accéder à cette fonctionnalité.");
  const code = subscription.planCode.toUpperCase();
  if (!code.includes("PRO") && !code.includes("PREMIUM") && !code.includes("BUSINESS")) {
    throw new HttpError(403, "Abonnement Premium requis pour accéder à cette fonctionnalité.");
  }
  next();
}

/**
 * GET /analytics/ai/basic
 * 🟢 Palier 1 — Insights de base (tous les utilisateurs connectés)
 */
router.get(
  "/ai/basic",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const insights = await getBasicInsights(req.auth!.userId);
    res.json(insights);
  })
);

/**
 * GET /analytics/ai/deep
 * 🔴 Palier 2 — Insights profonds (abonnés Premium/Pro)
 */
router.get(
  "/ai/deep",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const insights = await getDeepInsights(req.auth!.userId);
    res.json(insights);
  })
);

/**
 * GET /analytics/ai/diagnostic
 * 🧠 Orchestrateur — Diagnostic complet + plan d'action
 * 🔴 Palier 2 PREMIUM requis
 */
router.get(
  "/ai/diagnostic",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requirePremium(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const report = await runDiagnostic(req.auth!.userId);
    res.json(report);
  })
);

/**
 * GET /analytics/ai/memory
 * 🧠 Rapport mémoire enrichi (anomalies + tendances + prédictions)
 * 🔴 Palier 2 PREMIUM requis
 */
router.get(
  "/ai/memory",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requirePremium(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const report = await aiMemory.getMemoryEnhancedReport(req.auth!.userId);
    res.json(report);
  })
);

/**
 * GET /analytics/ai/anomalies
 * 🚨 Détection d'anomalies pour l'utilisateur connecté
 * 🔴 Palier 2 PREMIUM requis
 */
router.get(
  "/ai/anomalies",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requirePremium(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const anomalies = await aiMemory.detectAnomalies(req.auth!.userId);
    res.json(anomalies);
  })
);

/**
 * GET /analytics/ai/trends
 * 📈 Analyse de tendances pour l'utilisateur connecté
 * 🔴 Palier 2 PREMIUM requis
 */
router.get(
  "/ai/trends",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requirePremium(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const trends = await aiMemory.analyzeTrends(req.auth!.userId);
    res.json(trends);
  })
);

export default router;
