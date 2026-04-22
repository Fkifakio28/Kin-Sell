/**
 * Job Analytics Routes — Chantier C Phase 3
 *
 * Base path : /analytics/jobs/*
 * Toutes gardées par requireAuth, freemium appliqué dans la couche service.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  getJobDemandMap,
  getAlignmentScore,
  getJobMarketSnapshot,
  getMyApplicationsInsights,
  getPostingInsights,
} from "./job-analytics.service.js";
import { getJobDirectAnswers } from "./job-advisor.service.js";
import {
  getRegionalJobContext,
  getMultiCategoryJobContext,
  getRegionalJobContextMetrics,
  resetRegionalJobContextMetrics,
} from "./regional-job-context.service.js";
import { CountryCode } from "@prisma/client";

const router = Router();

const CountryCodeEnum = z.nativeEnum(CountryCode);

const DemandMapQuerySchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  countries: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((c) => c.trim()).filter(Boolean) : undefined))
    .pipe(z.array(CountryCodeEnum).max(10).optional()),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

router.get(
  "/demand-map",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = DemandMapQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, "Paramètres invalides.");
    const result = await getJobDemandMap(req.auth!.userId, parsed.data);
    res.json(result);
  }),
);

const AlignmentQuerySchema = z.object({
  jobId: z.string().min(1),
  candidateUserId: z.string().min(1).optional(),
});

router.get(
  "/alignment-score",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = AlignmentQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, "jobId requis.");
    const result = await getAlignmentScore(req.auth!.userId, parsed.data);
    res.json(result);
  }),
);

router.get(
  "/market-snapshot",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await getJobMarketSnapshot(req.auth!.userId);
    res.json(result);
  }),
);

router.get(
  "/my-applications-insights",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await getMyApplicationsInsights(req.auth!.userId);
    res.json(result);
  }),
);

const PostingInsightsQuerySchema = z.object({ jobId: z.string().min(1) });

router.get(
  "/posting-insights",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = PostingInsightsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, "jobId requis.");
    const result = await getPostingInsights(req.auth!.userId, parsed.data.jobId);
    res.json(result);
  }),
);

router.get(
  "/direct-answers",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await getJobDirectAnswers(req.auth!.userId);
    res.json({ answers: result });
  }),
);

// ── Chantier J1 — Regional Job Context (Gemini + Google Search) ──

const RegionalContextQuerySchema = z.object({
  category: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80),
});

router.get(
  "/regional-context",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = RegionalContextQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, "category, city, country requis.");
    const result = await getRegionalJobContext(
      parsed.data.category,
      parsed.data.city,
      parsed.data.country,
    );
    res.json(result);
  }),
);

const MultiRegionalContextSchema = z.object({
  categories: z
    .string()
    .min(1)
    .max(400)
    .transform((s) => s.split(",").map((c) => c.trim()).filter(Boolean))
    .pipe(z.array(z.string().min(1).max(80)).min(1).max(10)),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(1).max(80),
});

router.get(
  "/regional-context/multi",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = MultiRegionalContextSchema.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, "categories (csv), city, country requis.");
    const result = await getMultiCategoryJobContext(
      parsed.data.categories,
      parsed.data.city,
      parsed.data.country,
    );
    res.json(result);
  }),
);

router.get(
  "/regional-context/metrics",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    res.json(getRegionalJobContextMetrics());
  }),
);

router.post(
  "/regional-context/metrics/reset",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    resetRegionalJobContextMetrics();
    res.json({ ok: true });
  }),
);

export default router;
