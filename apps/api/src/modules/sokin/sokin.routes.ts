/**
 * So-Kin Routes (v4 - Publications sociales enrichies)
 * 
 * Routes:
 * - GET /posts - Feed public (publications localisées)
 * - GET /posts/:id - Détail d'une publication
 * - GET /posts/mine - Mes publications
 * - POST /posts - Créer une publication
 * - DELETE /posts/:id - Supprimer une publication
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
  archiveSoKinPost,
  getMyPostCounts,
  getPublicFeed,
  getPublicPostById,
  getPostComments,
  createPostComment,
} from "./sokin.service.js";
import {
  toggleReaction,
  toggleBookmark,
  getUserBookmarks,
  reportPost,
  getUserSocialState,
} from "./sokin-social.service.js";
import { emitToAll } from "../messaging/socket.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";

const isVideoMediaUrl = (value: string) => /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(value);

/** Types de publication qui exigent au moins 1 média */
const MEDIA_REQUIRED_TYPES = ["SHOWCASE", "SELLING", "PROMO"] as const;

const SOKIN_POST_TYPES = [
  "SHOWCASE", "DISCUSSION", "QUESTION", "SELLING",
  "PROMO", "SEARCH", "UPDATE", "REVIEW", "TREND",
] as const;

const createPostSchema = z.object({
  postType: z.enum(SOKIN_POST_TYPES).default("SHOWCASE"),
  subject: z.string().max(120).optional(),
  text: z.string().max(500).default(""),
  mediaUrls: z
    .array(z.string().trim().min(1).max(2000))
    .max(5, "Maximum 5 médias par publication")
    .default([])
    .refine((list) => list.filter((url) => isVideoMediaUrl(url)).length <= 2, {
      message: "Maximum 2 vidéos par publication",
    }),
  location: z.string().max(100).optional(),
  tags: z.array(z.string()).default([]).optional(),
  hashtags: z.array(z.string()).default([]).optional(),
  scheduledAt: z.string().datetime().optional(),
}).refine((data) => {
  // Règle 1 : les types visuels exigent au moins 1 média
  if ((MEDIA_REQUIRED_TYPES as readonly string[]).includes(data.postType) && data.mediaUrls.length < 1) {
    return false;
  }
  return true;
}, {
  message: "Ce type de publication nécessite au moins 1 média",
  path: ["mediaUrls"],
}).refine((data) => {
  // Règle 2 : une publication doit contenir au moins du texte OU au moins 1 média
  const hasText = data.text.trim().length > 0;
  const hasMedia = data.mediaUrls.length > 0;
  return hasText || hasMedia;
}, {
  message: "Une publication doit contenir du texte ou au moins 1 média",
  path: ["text"],
});

const createCommentSchema = z.object({
  content: z.string().trim().min(1).max(500),
  parentCommentId: z.string().optional(),
});

const router = Router();

/* ─── Routes publiques ─── */

/**
 * GET /posts/social-state
 * État social de l'utilisateur sur plusieurs posts (réactions + bookmarks).
 * Doit être déclaré AVANT /posts/:id pour ne pas être capté comme un :id.
 * Query: postIds=id1,id2,id3
 */
router.get(
  "/posts/social-state",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const raw = (req.query.postIds as string) || "";
    const postIds = raw.split(",").filter((id) => id.length > 0).slice(0, 50);
    const state = await getUserSocialState(req.auth!.userId, postIds);
    res.json({
      reactions: state.reactions,
      bookmarks: Array.from(state.bookmarks),
    });
  })
);

/**
 * GET /bookmarks
 * Liste des posts sauvegardés par l'utilisateur
 */
router.get(
  "/bookmarks",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const posts = await getUserBookmarks(req.auth!.userId, limit);
    res.json({ posts });
  })
);

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
    const rawTypes = req.query.types as string | undefined;
    const types = rawTypes ? rawTypes.split(',').filter((t) => t.length > 0).slice(0, 10) : undefined;

    const posts = await getPublicFeed(limit, undefined, city, country, offset, cursor, types);
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
 * Liste commentaires avec tri et réponses imbriquées
 */
router.get(
  "/posts/:id/comments",
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const sort = req.query.sort === "relevant" ? "relevant" : "recent";
    const comments = await getPostComments(req.params.id, limit, sort);
    res.json({ comments });
  })
);

/* ─── Routes authentifiées ─── */

/**
 * GET /posts/mine
 * Récupère les publications de l'utilisateur connecté
 * ?status=ACTIVE|HIDDEN|ARCHIVED|DELETED|all (défaut: tout sauf DELETED)
 */
router.get(
  "/posts/mine",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const validStatuses = ["ACTIVE", "HIDDEN", "ARCHIVED", "DELETED", "all"] as const;
    const rawStatus = req.query.status as string | undefined;
    const statusFilter = rawStatus && validStatuses.includes(rawStatus as any)
      ? (rawStatus as typeof validStatuses[number])
      : undefined;
    const posts = await getMySoKinPosts(req.auth!.userId, statusFilter);
    res.json({ posts });
  })
);

/**
 * GET /posts/counts
 * Compteurs par statut pour l'utilisateur connecté
 */
router.get(
  "/posts/counts",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const counts = await getMyPostCounts(req.auth!.userId);
    res.json({ counts });
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
    const { postType, subject, text, mediaUrls = [], location, scheduledAt, tags = [], hashtags = [] } = createPostSchema.parse(req.body);

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
      scheduledAt ? new Date(scheduledAt) : undefined,
      postType,
      subject
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
 * PATCH /posts/:id/archive
 * Archive/désarchive une publication
 */
router.patch(
  "/posts/:id/archive",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const post = await archiveSoKinPost(req.auth!.userId, req.params.id);
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

/* ─── Routes sociales (réactions, bookmarks, signalements) ─── */

const reactionSchema = z.object({
  type: z.enum(["LIKE", "LOVE", "HAHA", "WOW", "SAD", "ANGRY"]).default("LIKE"),
});

const reportSchema = z.object({
  reason: z.enum([
    "SPAM", "HARASSMENT", "HATE_SPEECH", "VIOLENCE",
    "NUDITY", "SCAM", "MISINFORMATION", "OTHER",
  ]),
  details: z.string().max(500).optional(),
});

/**
 * POST /posts/:id/react
 * Réagir à un post (toggle: même réaction → retire, autre → remplace)
 */
router.post(
  "/posts/:id/react",
  requireAuth,
  rateLimit(RateLimits.SOKIN_POST),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { type } = reactionSchema.parse(req.body);
    const result = await toggleReaction(req.auth!.userId, req.params.id, type);
    res.json(result);
  })
);

/**
 * POST /posts/:id/bookmark
 * Sauvegarder / retirer un post des favoris
 */
router.post(
  "/posts/:id/bookmark",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await toggleBookmark(req.auth!.userId, req.params.id);
    res.json(result);
  })
);

/**
 * POST /posts/:id/report
 * Signaler un post
 */
router.post(
  "/posts/:id/report",
  requireAuth,
  rateLimit(RateLimits.SOKIN_POST),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { reason, details } = reportSchema.parse(req.body);
    const report = await reportPost(req.auth!.userId, req.params.id, reason, details);
    res.status(201).json({ report });
  })
);

export default router;
