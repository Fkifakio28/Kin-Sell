/**
 * Job Analytics Routes — Chantier C Phase 3
 *
 * Base path : /analytics/jobs/*
 * Toutes gardées par requireAuth, freemium appliqué dans la couche service.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
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

export default router;
