/**
 * So-Kin Routes (Refonte v3 - Annonces uniquement)
 * 
 * Routes simplifiées:
 * - GET /posts - Feed public (annonces localisées)
 * - GET /posts/:id - Détail d'une annonce
 * - GET /posts/mine - Mes annonces
 * - POST /posts - Créer une annonce
 * - DELETE /posts/:id - Supprimer une annonce
 */

import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import {
  createSoKinPost,
  getMySoKinPosts,
  deleteSoKinPost,
  toggleSoKinPost,
  getPublicFeed,
  getPublicPostById,
  getPostComments,
  createPostComment,
} from "./sokin.service.js";
import { emitToAll } from "../messaging/socket.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";

const isVideoMediaUrl = (value: string) => /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(value);

const createPostSchema = z.object({
  text: z.string().min(1).max(500),
  mediaUrls: z
    .array(z.string().trim().min(1).max(2000))
    .min(1, "Une annonce doit contenir au moins 1 média")
    .max(5, "Maximum 5 médias par annonce")
    .refine((list) => list.filter((url) => isVideoMediaUrl(url)).length <= 2, {
      message: "Maximum 2 vidéos par annonce",
    }),
  location: z.string().max(100).optional(),
  tags: z.array(z.string()).default([]).optional(),
  hashtags: z.array(z.string()).default([]).optional(),
  scheduledAt: z.string().datetime().optional(),
});

const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(500),
  parentCommentId: z.string().optional(),
});

const router = Router();

/* ─── Routes publiques ─── */

/**
 * GET /posts
 * Récupère le fil public d'annonces
 * Params: limit, offset, city, country, cursor
 */
router.get(
  "/posts",
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const cursor = (req.query.cursor as string | undefined)?.slice(0, 191);
    const city = (req.query.city as string)?.slice(0, 100);
    const country = (req.query.country as string)?.slice(0, 100);

    const posts = await getPublicFeed(limit, undefined, city, country, offset, cursor);
    res.json({ posts });
  })
);

/**
 * GET /posts/:id
 * Récupère une annonce spécifique
 */
router.get(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const post = await getPublicPostById(req.params.id);
    if (!post) {
      res.status(404).json({ error: "Annonce non trouvée" });
      return;
    }
    res.json({ post });
  })
);

/**
 * GET /posts/:id/comments
 * Liste commentaires (plus récents en premier)
 */
router.get(
  "/posts/:id/comments",
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const comments = await getPostComments(req.params.id, limit);
    res.json({ comments });
  })
);

/* ─── Routes authentifiées ─── */

/**
 * GET /posts/mine
 * Récupère les annonces de l'utilisateur connecté
 */
router.get(
  "/posts/mine",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const posts = await getMySoKinPosts(req.auth!.userId);
    res.json({ posts });
  })
);

/**
 * POST /posts
 * Crée une nouvelle annonce
 */
router.post(
  "/posts",
  requireAuth,
  rateLimit(RateLimits.SOKIN_POST),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { text, mediaUrls = [], location, scheduledAt, tags = [], hashtags = [] } = createPostSchema.parse(req.body);

    // ContentGuard: modération IA avant publication
    const { analyzePost } = await import("./content-guard.service.js");
    const guard = await analyzePost(text, [], req.auth!.userId);
    if (guard.verdict === "BLOCK") {
      res.status(422).json({
        error: guard.warningMessage ?? "Publication refusée par le système de modération.",
        triggers: guard.triggers,
        score: guard.score,
      });
      return;
    }

    const post = await createSoKinPost(
      req.auth!.userId,
      text,
      mediaUrls,
      location,
      tags,
      hashtags,
      scheduledAt ? new Date(scheduledAt) : undefined
    );

    emitToAll("sokin:post-created", {
      type: "SOKIN_POST_CREATED",
      postId: post.id,
      authorId: post.authorId,
      createdAt: post.createdAt.toISOString(),
      sourceUserId: req.auth!.userId,
    });

    res.status(201).json(post);
  })
);

/**
 * POST /posts/:id/comments
 * Créer un commentaire/réponse
 */
router.post(
  "/posts/:id/comments",
  requireAuth,
  rateLimit(RateLimits.SOKIN_POST),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = createCommentSchema.parse(req.body);
    const comment = await createPostComment(
      req.auth!.userId,
      req.params.id,
      parsed.content,
      parsed.parentCommentId
    );
    res.status(201).json({ comment });
  })
);

/**
 * PATCH /posts/:id/toggle
 * Bascule le statut d'une annonce entre ACTIVE et HIDDEN
 */
router.patch(
  "/posts/:id/toggle",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const post = await toggleSoKinPost(req.auth!.userId, req.params.id);
    res.json({ post });
  })
);

/**
 * DELETE /posts/:id
 * Supprime une annonce
 */
router.delete(
  "/posts/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await deleteSoKinPost(req.auth!.userId, req.params.id);
    res.json({ success: true });
  })
);

export default router;
