/**
 * So-Kin Trends Routes — Tendances locales, profils suggérés, insights posts
 *
 * Endpoints publics (avec auth optionnel pour insights) :
 * - GET /sokin/trends          — Tendances locales (hashtags + sujets)
 * - GET /sokin/trends/profiles — Profils suggérés
 * - GET /sokin/trends/post-insight/:id — Insights d'un post (auteur only)
 */

import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { getTrending, getSuggestedProfiles, getPostInsight } from "./sokin-trends.service.js";
import { HttpError } from "../../shared/errors/http-error.js";

const router = Router();

/**
 * GET /sokin/trends
 * Tendances locales : sujets populaires + hashtags chauds
 * Public (pas de auth requis)
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const city = (req.query.city as string) || undefined;
    const limit = Math.min(Number(req.query.limit) || 10, 20);
    const data = await getTrending(city, limit);
    res.json(data);
  })
);

/**
 * GET /sokin/trends/profiles
 * Profils suggérés (les plus actifs dans la ville)
 * Public
 */
router.get(
  "/profiles",
  asyncHandler(async (req, res) => {
    const city = (req.query.city as string) || undefined;
    const limit = Math.min(Number(req.query.limit) || 5, 10);
    const data = await getSuggestedProfiles(city, limit);
    res.json(data);
  })
);

/**
 * GET /sokin/trends/post-insight/:id
 * Insights d'un post — réservé à l'auteur du post
 */
router.get(
  "/post-insight/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const postId = req.params.id;
    if (!postId) throw new HttpError(400, "postId requis");
    const insight = await getPostInsight(postId, req.auth!.userId);
    res.json(insight);
  })
);

export default router;
