import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { scrapeGuard } from "../../shared/middleware/scrape-guard.middleware.js";
import * as reviewsService from "./reviews.service.js";

const createReviewSchema = z.object({
  targetId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(500).optional(),
});

const createOrderReviewSchema = z.object({
  orderId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(500).optional(),
});

const router = Router();

// GET /reviews/pending — commandes livrées sans avis (auth requise)
router.get(
  "/pending",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await reviewsService.getPendingReviewOrders(req.auth!.userId);
    res.json(result);
  })
);

// GET /reviews/check/:orderId — vérifier si on peut laisser un avis (auth requise)
router.get(
  "/check/:orderId",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await reviewsService.canReviewOrder(req.auth!.userId, req.params.orderId);
    res.json(result);
  })
);

// GET /reviews/:userId — avis publics d'un utilisateur
router.get(
  "/:userId",
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_SEARCH),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const result = await reviewsService.getReviewsForUser(req.params.userId, limit, offset);
    res.json(result);
  })
);

// POST /reviews/order — créer un avis vérifié lié à une commande (auth requise)
router.post(
  "/order",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createOrderReviewSchema.parse(req.body);
    const review = await reviewsService.createOrderReview(
      req.auth!.userId,
      body.orderId,
      body.rating,
      body.text,
    );
    res.status(201).json(review);
  })
);

// POST /reviews — créer / mettre à jour un avis libre (auth requise)
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createReviewSchema.parse(req.body);
    const review = await reviewsService.createReview(
      req.auth!.userId,
      body.targetId,
      body.rating,
      body.text,
    );
    res.status(201).json(review);
  })
);

export default router;
