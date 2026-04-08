/**
 * Analytics Routes — IA Analytique (Palier 1 + 2) + Orchestrateur
 */

import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { getBasicInsights, getDeepInsights } from "./analytics-ai.service.js";
import { runDiagnostic } from "./ai-orchestrator.service.js";
import * as aiMemory from "./ai-memory.service.js";
import * as aiTrigger from "./ai-trigger.service.js";
import * as pricingNudge from "./pricing-nudge.service.js";
import * as commercialAdvisor from "./commercial-advisor.service.js";
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

// ══════════════════════════════════════════════
// AI RECOMMENDATIONS — Smart suggestions
// ══════════════════════════════════════════════

/**
 * GET /analytics/ai/seller-profile
 * Profil IA du vendeur : score, lifecycle, budget, addons, historique
 */
router.get(
  "/ai/seller-profile",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const profile = await aiTrigger.getSellerProfile(req.auth!.userId);
    if (!profile) throw new HttpError(404, "Profil introuvable");
    res.json(profile);
  })
);

/**
 * GET /analytics/ai/recommendations
 * Récupère les recommandations actives pour l'utilisateur connecté
 */
router.get(
  "/ai/recommendations",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const recs = await aiTrigger.getActiveRecommendations(req.auth!.userId);
    res.json(recs);
  })
);

/**
 * POST /analytics/ai/recommendations/:id/dismiss
 * Fermer une recommandation
 */
router.post(
  "/ai/recommendations/:id/dismiss",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await aiTrigger.dismissRecommendation(req.auth!.userId, req.params.id);
    res.json({ ok: true });
  })
);

/**
 * POST /analytics/ai/recommendations/:id/click
 * L'utilisateur a cliqué sur la recommandation
 */
router.post(
  "/ai/recommendations/:id/click",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await aiTrigger.clickRecommendation(req.auth!.userId, req.params.id);
    res.json({ ok: true });
  })
);

/**
 * POST /analytics/ai/recommendations/:id/accept
 * L'utilisateur accepte la recommandation
 */
router.post(
  "/ai/recommendations/:id/accept",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await aiTrigger.acceptRecommendation(req.auth!.userId, req.params.id);
    res.json({ ok: true });
  })
);

// ══════════════════════════════════════════════
// AI TRIALS — Périodes d'essai
// ══════════════════════════════════════════════

/**
 * GET /analytics/ai/trials
 * Mes essais IA (proposés, actifs, expirés)
 */
router.get(
  "/ai/trials",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const trials = await aiTrigger.getMyTrials(req.auth!.userId);
    res.json(trials);
  })
);

/**
 * POST /analytics/ai/trials/:id/activate
 * Demander l'activation d'un essai (passe en PENDING, nécessite validation admin)
 */
router.post(
  "/ai/trials/:id/activate",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await aiTrigger.requestTrialActivation(req.auth!.userId, req.params.id);
    if (!result) throw new HttpError(404, "Essai introuvable ou déjà activé.");
    res.json(result);
  })
);

/**
 * POST /analytics/ai/trials/:id/decline
 * Refuser un essai
 */
router.post(
  "/ai/trials/:id/decline",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await aiTrigger.declineTrial(req.auth!.userId, req.params.id);
    res.json({ ok: true });
  })
);

// ─────────────────────────────────────────────
// PRICING NUDGES — CTA intelligents vers /forfaits
// ─────────────────────────────────────────────

/**
 * GET /analytics/ai/pricing-nudges
 * Évalue en temps réel les nudges pertinents pour l'utilisateur connecté
 */
router.get(
  "/ai/pricing-nudges",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const nudges = await pricingNudge.evaluateNudges(req.auth!.userId);
    res.json(nudges);
  })
);

// ─────────────────────────────────────────────
// COMMERCIAL ADVISOR — recommandations produit contextuelles
// ─────────────────────────────────────────────

/**
 * GET /analytics/ai/commercial-advice
 * Recommandations commerciales contextuelles (plan, addon, boost, pub, analytics)
 */
router.get(
  "/ai/commercial-advice",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const advice = await commercialAdvisor.getCommercialAdvice(req.auth!.userId);
    res.json(advice);
  })
);

export default router;
