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
  updateSoKinPost,
  getMyPostCounts,
  getPublicFeed,
  getPublicPostById,
  getPostComments,
  createPostComment,
  repostSoKinPost,
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
import { trackEvents, VALID_EVENTS, getAuthorTrackingStats, type SoKinEventType } from "./sokin-tracking.service.js";
import { scorePost, scoreAndPersist, batchRecalculate, getTopBoostCandidates, getTopSocialPosts, getTopBusinessPosts } from "./sokin-scoring.service.js";
import { analyzePost, getAuthorTips, getAdminOpportunities, dismissTip, acceptTip, batchAnalyze } from "../ads/sokin-ads-advisor.service.js";
import { requireSoKinAnalytics, requireSoKinAds, requireSoKinAdmin } from "./sokin-gating.service.js";

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
 * GET /posts/mine
 * Récupère les publications de l'utilisateur connecté
 * Doit être déclaré AVANT /posts/:id pour ne pas être capté comme un :id.
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
 * Compteurs par statut pour l'utilisateur connecté.
 * Doit être déclaré AVANT /posts/:id pour ne pas être capté comme un :id.
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

/* ─── Édition de publication ─── */

const updatePostSchema = z.object({
  postType: z.enum(SOKIN_POST_TYPES).optional(),
  subject: z.string().max(120).nullable().optional(),
  text: z.string().max(500).optional(),
  mediaUrls: z
    .array(z.string().trim().min(1).max(2000))
    .max(5, "Maximum 5 médias par publication")
    .refine((list) => list.filter((url) => isVideoMediaUrl(url)).length <= 2, {
      message: "Maximum 2 vidéos par publication",
    })
    .optional(),
  location: z.string().max(100).nullable().optional(),
  tags: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
});

/**
 * PATCH /posts/:id
 * Modifier une publication existante (auteur uniquement, ACTIVE/HIDDEN)
 */
router.patch(
  "/posts/:id",
  requireAuth,
  rateLimit(RateLimits.SOKIN_POST),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = updatePostSchema.parse(req.body);

    // ContentGuard si le texte change
    if (data.text !== undefined) {
      const { analyzePost } = await import("./content-guard.service.js");
      const guard = await analyzePost(data.text, [], req.auth!.userId);
      if (guard.verdict === "BLOCK") {
        res.status(422).json({
          error: guard.warningMessage ?? "Modification refusée par le système de modération.",
          triggers: guard.triggers,
          score: guard.score,
        });
        return;
      }
    }

    const post = await updateSoKinPost(req.auth!.userId, req.params.id, data);

    emitToAll("sokin:post-updated", {
      type: "SOKIN_POST_UPDATED",
      postId: post.id,
      authorId: post.authorId,
      updatedAt: new Date().toISOString(),
      sourceUserId: req.auth!.userId,
    });

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

const repostSchema = z.object({
  comment: z.string().max(300).optional(),
});

/**
 * POST /posts/:id/repost
 * Reposter une publication (avec commentaire optionnel)
 */
router.post(
  "/posts/:id/repost",
  requireAuth,
  rateLimit(RateLimits.SOKIN_POST),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { comment } = repostSchema.parse(req.body);
    const repost = await repostSoKinPost(req.auth!.userId, req.params.id, comment);

    emitToAll("sokin:post-created", {
      type: "SOKIN_REPOST_CREATED",
      postId: repost.id,
      originalPostId: req.params.id,
      authorId: repost.authorId,
      createdAt: repost.createdAt.toISOString(),
      sourceUserId: req.auth!.userId,
    });

    res.status(201).json(repost);
  })
);

/* ─── Tracking analytique ─── */

const trackSchema = z.object({
  events: z.array(z.object({
    event: z.enum(VALID_EVENTS as unknown as [string, ...string[]]),
    postId: z.string().min(1).max(50),
    authorId: z.string().min(1).max(50),
    postType: z.string().max(20).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    source: z.string().max(30).optional(),
    meta: z.record(z.unknown()).optional(),
  })).min(1).max(30),
});

/**
 * POST /track
 * Batch tracking d'événements So-Kin (fire-and-forget, rate-limité)
 * Accepte les visiteurs non connectés (vues anonymes)
 */
router.post(
  "/track",
  rateLimit(RateLimits.AD_TRACKING),
  asyncHandler(async (req, res) => {
    const { events } = trackSchema.parse(req.body);
    const viewerId = (req as any).auth?.userId ?? null;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";

    const enriched = events.map((ev) => ({
      ...ev,
      event: ev.event as SoKinEventType,
      viewerId,
      postType: ev.postType ?? null,
      city: ev.city ?? null,
      country: ev.country ?? null,
      source: ev.source ?? null,
      meta: ev.meta ?? null,
    }));

    // Fire-and-forget : ne pas bloquer la réponse
    trackEvents(enriched, ip).catch(() => {});

    res.json({ ok: true });
  })
);

/**
 * GET /tracking/stats
 * Stats de tracking résumées pour l'auteur connecté (7 derniers jours)
 */
router.get(
  "/tracking/stats",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const stats = await getAuthorTrackingStats(req.auth!.userId);
    res.json({ stats });
  })
);

// ═══════ Scoring So-Kin ═══════

/**
 * GET /scoring/post/:id
 * Calcule et retourne les 3 scores + breakdown pour un post.
 * PREMIUM ANALYTICS — Accessible à l'auteur du post.
 */
router.get(
  "/scoring/post/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireSoKinAnalytics(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const scored = await scorePost(req.params.id);
    if (!scored) {
      res.status(404).json({ error: "Post non trouvé" });
      return;
    }
    res.json({ scoring: scored });
  })
);

/**
 * POST /scoring/recalculate/:id
 * Force le recalcul et la persistance des scores pour un post.
 * PREMIUM ANALYTICS — Accessible à l'auteur ou admin.
 */
router.post(
  "/scoring/recalculate/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireSoKinAnalytics(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const scored = await scoreAndPersist(req.params.id);
    if (!scored) {
      res.status(404).json({ error: "Post non trouvé" });
      return;
    }
    res.json({ scoring: scored });
  })
);

/**
 * GET /scoring/top
 * Top posts par score (social, business ou boost).
 * Query: type=social|business|boost, limit=20, city=...
 */
router.get(
  "/scoring/top",
  asyncHandler(async (req, res) => {
    const type = (req.query.type as string) || "boost";
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const city = (req.query.city as string)?.slice(0, 100);

    let posts;
    if (type === "social") posts = await getTopSocialPosts(limit, city);
    else if (type === "business") posts = await getTopBusinessPosts(limit, city);
    else posts = await getTopBoostCandidates(limit, city);

    res.json({ posts, type });
  })
);

/**
 * POST /scoring/batch
 * Déclenche un recalcul batch (admin / cron).
 * ADMIN ONLY
 */
router.post(
  "/scoring/batch",
  requireAuth,
  requireSoKinAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
    const result = await batchRecalculate(limit);
    res.json({ result });
  })
);

// ═══════ IA Ads Advisor So-Kin ═══════

/**
 * GET /advisor/post/:id
 * Analyse un post et retourne les tips IA Ads (sans persister).
 * PREMIUM ADS
 */
router.get(
  "/advisor/post/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireSoKinAds(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const tips = await analyzePost(req.params.id);
    res.json({ tips });
  })
);

/**
 * GET /advisor/tips
 * Recommandations IA Ads pour l'auteur connecté.
 * PREMIUM ADS
 */
router.get(
  "/advisor/tips",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res, next) => { await requireSoKinAds(req, res, next); }),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 30);
    const tips = await getAuthorTips(req.auth!.userId, limit);
    res.json({ tips });
  })
);

/**
 * GET /advisor/opportunities
 * Opportunités admin : posts à fort potentiel détectés.
 * ADMIN ONLY
 */
router.get(
  "/advisor/opportunities",
  requireAuth,
  requireSoKinAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const opportunities = await getAdminOpportunities(limit);
    res.json({ opportunities });
  })
);

/**
 * POST /advisor/tips/:id/dismiss
 * L'utilisateur masque un tip.
 */
router.post(
  "/advisor/tips/:id/dismiss",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ok = await dismissTip(req.params.id, req.auth!.userId);
    if (!ok) { res.status(404).json({ error: "Tip non trouvé" }); return; }
    res.json({ ok: true });
  })
);

/**
 * POST /advisor/tips/:id/accept
 * L'utilisateur a agi sur un tip.
 */
router.post(
  "/advisor/tips/:id/accept",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ok = await acceptTip(req.params.id, req.auth!.userId);
    if (!ok) { res.status(404).json({ error: "Tip non trouvé" }); return; }
    res.json({ ok: true });
  })
);

/**
 * POST /advisor/batch
 * Déclenche un batch d'analyse IA Ads sur les top posts.
 * ADMIN ONLY
 */
router.post(
  "/advisor/batch",
  requireAuth,
  requireSoKinAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 50);
    const city = (req.query.city as string)?.slice(0, 100);
    const result = await batchAnalyze(limit, city);
    res.json({ result });
  })
);

export default router;
