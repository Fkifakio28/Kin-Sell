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
import { getPostPublishAdvice, type PublishContext } from "../ads/post-publish-advisor.service.js";
import { resolveFreemiumState, consumeFreeCredit, applyFreemiumGating } from "../ads/post-publish-freemium.service.js";
import { getPostSaleAdvice } from "../ads/post-sale-advisor.service.js";
import { evaluateAnalyticsCTAs } from "./analytics-cta.service.js";
import { getEnrichedAnalytics, getCategoryDemandAnalysis } from "./analytics-external-intelligence.service.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { requireIa, requirePremiumSubscription } from "../../shared/billing/subscription-guard.js";

const router = Router();

// Middleware PREMIUM — délègue au guard centralisé (gère user + business scope)
const requirePremium = requirePremiumSubscription;

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
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requirePremium(req, res, next); }),
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
 * 🔐 Requiert IA_MERCHANT
 */
router.get(
  "/ai/seller-profile",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireIa("IA_MERCHANT")(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const profile = await aiTrigger.getSellerProfile(req.auth!.userId);
    if (!profile) throw new HttpError(404, "Profil introuvable");
    res.json(profile);
  })
);

/**
 * GET /analytics/ai/recommendations
 * Récupère les recommandations actives pour l'utilisateur connecté
 * Filtre par plan d'abonnement — les recommandations UPGRADE_PLAN sont
 * adaptées au plan actuel de l'utilisateur.
 * 🔐 Requiert IA_MERCHANT
 */
router.get(
  "/ai/recommendations",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireIa("IA_MERCHANT")(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const recs = await aiTrigger.getActiveRecommendations(req.auth!.userId);
    // Filtrer les recommandations selon le plan de l'utilisateur
    const sub = await prisma.subscription.findFirst({
      where: { userId: req.auth!.userId, status: "ACTIVE" },
      select: { planCode: true },
    });
    const userPlan = sub?.planCode ?? "FREE";
    const filtered = recs.filter((r) => {
      // Si la reco demande un plan spécifique (ex: UPGRADE_PLAN vers AUTO),
      // ne la montrer que si l'utilisateur n'a pas déjà ce plan ou un supérieur
      if (r.actionType === "UPGRADE_PLAN" && r.actionData) {
        try {
          const meta = typeof r.actionData === "string" ? JSON.parse(r.actionData) : r.actionData;
          if (meta.targetPlan && meta.targetPlan === userPlan) return false;
        } catch {}
      }
      return true;
    });
    res.json(filtered);
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
 * 🔐 Requiert IA_MERCHANT
 */
router.get(
  "/ai/pricing-nudges",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireIa("IA_MERCHANT")(req, res, next); }),
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
 * 🔐 Requiert IA_MERCHANT
 */
router.get(
  "/ai/commercial-advice",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireIa("IA_MERCHANT")(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const advice = await commercialAdvisor.getCommercialAdvice(req.auth!.userId);
    res.json(advice);
  })
);

// ─────────────────────────────────────────────
// POST-PUBLISH ADVISOR — conseiller IA après publication
// ─────────────────────────────────────────────

/**
 * GET /analytics/ai/post-publish-advice?type=SINGLE|PROMO|BULK&listingId=X&promoCount=N
 * Analyse post-publication : qualité, boost, pub, forfait, analytics, tips contenu
 * � Ouvert à tous (freemium gating intégré — 1 conseil gratuit par type)
 */
router.get(
  "/ai/post-publish-advice",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const type = (req.query.type as string) || "SINGLE";
    if (!["SINGLE", "PROMO", "BULK"].includes(type)) {
      throw new HttpError(400, "type must be SINGLE, PROMO, or BULK");
    }
    const ctx: PublishContext = {
      type: type as PublishContext["type"],
      listingId: req.query.listingId as string | undefined,
      promoCount: req.query.promoCount ? Number(req.query.promoCount) : undefined,
    };

    // Résoudre le type du listing pour le gating
    let listingType: string | null = null;
    if (ctx.listingId) {
      const listing = await prisma.listing.findUnique({
        where: { id: ctx.listingId },
        select: { type: true },
      });
      listingType = listing?.type ?? null;
    }

    const userId = req.auth!.userId;
    const report = await getPostPublishAdvice(userId, ctx);
    const freemiumState = await resolveFreemiumState(userId, ctx, listingType);

    // Consommer le crédit gratuit si PREVIEW mode (1er usage)
    if (freemiumState.mode === "PREVIEW" && listingType && ctx.listingId) {
      await consumeFreeCredit(userId, listingType, ctx.listingId);
      // Mettre à jour l'état après consommation
      if (listingType === "SERVICE") freemiumState.usedServiceFree = true;
      else freemiumState.usedProductFree = true;
    }

    const gatedReport = applyFreemiumGating(
      report,
      freemiumState.mode,
      freemiumState.usedProductFree,
      freemiumState.usedServiceFree,
      listingType,
      freemiumState.planCode
    );

    res.json(gatedReport);
  })
);

// ─────────────────────────────────────────────
// POST-SALE ADVISOR — conseiller IA après une vente réussie
// ─────────────────────────────────────────────

/**
 * GET /analytics/ai/post-sale-advice?orderId=X
 * Recommandations contextuelles après vente confirmée
 * � Gratuit pour tous les vendeurs (outil d'upsell)
 */
router.get(
  "/ai/post-sale-advice",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const orderId = req.query.orderId as string;
    if (!orderId) throw new HttpError(400, "orderId est requis");
    const report = await getPostSaleAdvice(req.auth!.userId, orderId);
    res.json(report);
  })
);

// ─────────────────────────────────────────────
// ANALYTICS CTA — incitations intelligentes vers Kin-Sell Analytique
// ─────────────────────────────────────────────

/**
 * GET /analytics/ai/analytics-cta
 * CTA contextuels pour pousser vers Kin-Sell Analytique
 * 🔐 Requiert IA_MERCHANT
 */
router.get(
  "/ai/analytics-cta",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireIa("IA_MERCHANT")(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const report = await evaluateAnalyticsCTAs(req.auth!.userId);
    res.json(report);
  })
);

// ══════════════════════════════════════════════
// ENRICHED ANALYTICS — Internal + External Intelligence
// ══════════════════════════════════════════════

/**
 * GET /analytics/ai/enriched
 * 🧠 Enriched analytics combining internal data + Gemini external intelligence
 * 🔴 Palier 2 PREMIUM requis
 */
router.get(
  "/ai/enriched",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requirePremium(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const city = (req.query.city as string) || "Kinshasa";
    const report = await getEnrichedAnalytics(req.auth!.userId, city);
    res.json(report);
  })
);

/**
 * GET /analytics/ai/category-demand
 * 📊 Demand analysis for a specific category (internal + external)
 * 🔴 Palier 2 PREMIUM requis
 */
router.get(
  "/ai/category-demand",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requirePremium(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const category = req.query.category as string;
    const city = (req.query.city as string) || "Kinshasa";
    if (!category) { res.status(400).json({ error: "category requis" }); return; }
    const analysis = await getCategoryDemandAnalysis(category, city);
    res.json(analysis);
  })
);

export default router;
