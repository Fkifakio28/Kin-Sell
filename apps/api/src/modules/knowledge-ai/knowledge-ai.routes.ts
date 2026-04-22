import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { prisma } from "../../shared/db/prisma.js";
import { SubscriptionStatus } from "../../shared/db/prisma-enums.js";
import type { KnowledgeGoal, CountryCode } from "@prisma/client";
import {
  getIntent,
  upsertIntent,
  deleteIntent,
  getDemandMap,
  getWorkforceMap,
  getRecommendations,
  KNOWLEDGE_COUNTRIES,
} from "./knowledge-ai.service.js";

const router = Router();

// Gating — même règle que Kin-Sell Analytique (analyticsTier !== "NONE")
const ANALYTICS_PLAN_CODES = new Set(["PRO_VENDOR", "BUSINESS", "SCALE"]);

async function hasKnowledgeAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, businesses: { select: { id: true }, take: 1 } },
  });
  if (!user) return false;

  const isBusinessScope = user.role === "BUSINESS";
  const businessId = isBusinessScope ? user.businesses[0]?.id : null;

  const subscription = await prisma.subscription.findFirst({
    where: {
      status: SubscriptionStatus.ACTIVE,
      ...(isBusinessScope && businessId ? { businessId } : { userId }),
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    select: { planCode: true },
  });
  if (!subscription) return false;
  return ANALYTICS_PLAN_CODES.has(subscription.planCode.toUpperCase());
}

async function requireKnowledgeAccess(req: AuthenticatedRequest, _res: Response, next: any) {
  const ok = await hasKnowledgeAccess(req.auth!.userId);
  if (!ok) {
    throw new HttpError(
      403,
      "Knowledge IA nécessite un abonnement incluant Kin-Sell Analytique (PRO VENDEUR, BUSINESS ou SCALE).",
    );
  }
  next();
}

// ──────────────────────────────────────────────
// INTENT — libre d'accès (config utilisateur)
// ──────────────────────────────────────────────

const KnowledgeGoalEnum = z.enum(["SELL", "BUY", "HIRE", "WORK"]);
const CountryCodeEnum = z.enum(["CD", "GA", "CG", "AO", "CI", "GN", "SN", "MA"]);

const intentSchema = z.object({
  goals: z.array(KnowledgeGoalEnum).max(4).optional(),
  categories: z.array(z.string().min(1).max(80)).max(20).optional(),
  keywords: z.array(z.string().min(1).max(60)).max(30).optional(),
  countriesInterest: z.array(CountryCodeEnum).max(8).optional(),
  notes: z.string().max(500).nullable().optional(),
});

// GET /knowledge-ai/intent — récupère l'intent de l'utilisateur
router.get(
  "/intent",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const intent = await getIntent(req.auth!.userId);
    res.json({ intent });
  }),
);

// PUT /knowledge-ai/intent — crée ou met à jour l'intent
router.put(
  "/intent",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = intentSchema.parse(req.body);
    const intent = await upsertIntent(req.auth!.userId, {
      goals: parsed.goals as KnowledgeGoal[] | undefined,
      categories: parsed.categories,
      keywords: parsed.keywords,
      countriesInterest: parsed.countriesInterest as CountryCode[] | undefined,
      notes: parsed.notes ?? null,
    });
    res.json({ intent });
  }),
);

// DELETE /knowledge-ai/intent — supprime l'intent
router.delete(
  "/intent",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await deleteIntent(req.auth!.userId);
    res.json({ ok: true });
  }),
);

// GET /knowledge-ai/countries — liste publique des pays Kin-Sell
router.get(
  "/countries",
  asyncHandler(async (_req, res: Response) => {
    res.json({ countries: KNOWLEDGE_COUNTRIES });
  }),
);

// GET /knowledge-ai/access — indique si l'utilisateur a accès aux recommandations
router.get(
  "/access",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const hasAccess = await hasKnowledgeAccess(req.auth!.userId);
    res.json({ hasAccess });
  }),
);

// ──────────────────────────────────────────────
// RECOMMANDATIONS / MAPS — abonnement requis
// ──────────────────────────────────────────────

// GET /knowledge-ai/recommendations — conseils personnalisés
router.get(
  "/recommendations",
  requireAuth,
  asyncHandler(requireKnowledgeAccess),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const recommendations = await getRecommendations(req.auth!.userId);
    res.json({ recommendations });
  }),
);

const demandQuerySchema = z.object({
  category: z.string().min(1).max(80).optional(),
  keywords: z.string().optional(), // csv
  countries: z.string().optional(), // csv
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

// GET /knowledge-ai/demand-map?category=...&countries=CD,SN
router.get(
  "/demand-map",
  requireAuth,
  asyncHandler(requireKnowledgeAccess),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = demandQuerySchema.parse(req.query);
    const countries = q.countries
      ? (q.countries.split(",").map((c) => c.trim().toUpperCase()).filter((c) => KNOWLEDGE_COUNTRIES.includes(c as CountryCode)) as CountryCode[])
      : undefined;
    const keywords = q.keywords ? q.keywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined;
    const zones = await getDemandMap({ category: q.category, keywords, countries, limit: q.limit });
    res.json({ zones });
  }),
);

// GET /knowledge-ai/workforce-map?skill=...
router.get(
  "/workforce-map",
  requireAuth,
  asyncHandler(requireKnowledgeAccess),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const q = demandQuerySchema.parse(req.query);
    const countries = q.countries
      ? (q.countries.split(",").map((c) => c.trim().toUpperCase()).filter((c) => KNOWLEDGE_COUNTRIES.includes(c as CountryCode)) as CountryCode[])
      : undefined;
    const keywords = q.keywords ? q.keywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined;
    const zones = await getWorkforceMap({ skill: q.category, keywords, countries, limit: q.limit });
    res.json({ zones });
  }),
);

export default router;
