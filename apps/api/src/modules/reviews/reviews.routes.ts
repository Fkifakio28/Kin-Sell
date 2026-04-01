import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import * as reviewsService from "./reviews.service.js";

const createReviewSchema = z.object({
  targetId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(500).optional(),
});

const router = Router();

// GET /reviews/:userId — avis publics d'un utilisateur
router.get(
  "/:userId",
  asyncHandler(async (req, res) => {
    const result = await reviewsService.getReviewsForUser(req.params.userId);
    res.json(result);
  })
);

// POST /reviews — créer / mettre à jour un avis (auth requise)
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createReviewSchema.parse(req.body);
    const review = await reviewsService.createReview(
      req.auth!.userId,
      body.targetId,
      body.rating,
      body.text
    );
    res.status(201).json(review);
  })
);

export default router;
