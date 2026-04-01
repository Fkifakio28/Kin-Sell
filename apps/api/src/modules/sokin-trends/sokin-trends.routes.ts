import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import {
  getActiveTrends,
  computeTrendsFromPosts,
  getSuggestionsForUser,
  computeSuggestionsForUser,
  dismissSuggestion,
} from "./sokin-trends.service.js";
import { SoKinTrendType } from "@prisma/client";

const router = Router();

// GET /sokin-trends?city=Kinshasa&type=HASHTAG
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const city = req.query.city as string | undefined;
    const type = req.query.type as SoKinTrendType | undefined;
    const trends = await getActiveTrends(city, type);
    res.json(trends);
  })
);

// POST /sokin-trends/compute  — relance le calcul des tendances
router.post(
  "/compute",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const trends = await computeTrendsFromPosts();
    res.json({ computed: trends.length, trends });
  })
);

// GET /sokin-trends/suggestions
router.get(
  "/suggestions",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const suggestions = await getSuggestionsForUser(userId);
    res.json(suggestions);
  })
);

// POST /sokin-trends/suggestions/compute
router.post(
  "/suggestions/compute",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const suggestions = await computeSuggestionsForUser(userId);
    res.json({ computed: suggestions.length, suggestions });
  })
);

// POST /sokin-trends/suggestions/:id/dismiss
router.post(
  "/suggestions/:id/dismiss",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const result = await dismissSuggestion(userId, req.params.id);
    res.json(result);
  })
);

export default router;
