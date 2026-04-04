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
  toggleArchiveSoKinPost,
  deleteSoKinPost,
  getPublicFeed,
  getPublicPostById,
  getPublicUsers,
  reactToPost,
  unreactToPost,
  sharePost,
} from "./sokin.service.js";
import { sendPushToUser } from "../notifications/push.service.js";
import { prisma } from "../../shared/db/prisma.js";
import { emitToAll, isUserOnline } from "../messaging/socket.js";

const createPostSchema = z.object({
  text: z.string().min(1).max(500),
  mediaUrls: z.array(z.string()).max(4).optional(),
  location: z.string().max(100).optional(),
  tags: z.array(z.string()).max(10).optional(),
  hashtags: z.array(z.string()).max(20).optional(),
  scheduledAt: z.string().datetime().optional(),
});

const router = Router();

/* ── Routes publiques (pas d'authentification requise) ── */

router.get(
  "/posts",
  asyncHandler(async (req, res) => {
    const raw = req.query.limit;
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const country = typeof req.query.country === "string" ? req.query.country : undefined;
    const limit = Math.min(
      parseInt(typeof raw === "string" ? raw : "20", 10) || 20,
      50
    );
    // Optionnel : passer l'userId connecté pour savoir ses réactions
    const token = req.headers.authorization?.replace("Bearer ", "");
    let viewerUserId: string | undefined;
    if (token) {
      try {
        const { verifyAccessToken } = await import("../../shared/auth/jwt.js");
        const payload = verifyAccessToken(token);
        viewerUserId = payload.sub;
      } catch { /* token invalide, on ignore */ }
    }
    const posts = await getPublicFeed(limit, viewerUserId, city, country);
    res.json({ posts });
  })
);

router.get(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    let viewerUserId: string | undefined;
    if (token) {
      try {
        const { verifyAccessToken } = await import("../../shared/auth/jwt.js");
        const payload = verifyAccessToken(token);
        viewerUserId = payload.sub;
      } catch {
        // token invalide, on ignore
      }
    }
    const post = await getPublicPostById(req.params.id, viewerUserId);
    res.json({ post });
  })
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { city, search, country } = req.query as Record<string, string | undefined>;
    const raw = req.query.limit;
    const limit = Math.min(
      parseInt(typeof raw === "string" ? raw : "50", 10) || 50,
      100
    );
    const users = await getPublicUsers(city, search, limit, country);
    res.json({ users });
  })
);

/* ── Routes authentifiées ── */

router.get(
  "/posts/mine",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const posts = await getMySoKinPosts(req.auth!.userId);
    res.json({ posts });
  })
);

router.post(
  "/posts",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { text, mediaUrls = [], location, tags, hashtags, scheduledAt } = createPostSchema.parse(req.body);

    // ── ContentGuard: modération IA avant publication ──
    const { analyzePost } = await import("./content-guard.service.js");
    const guard = await analyzePost(text, hashtags ?? [], req.auth!.userId);
    if (guard.verdict === "BLOCK") {
      res.status(422).json({
        error: guard.warningMessage ?? "Publication refusée par le système de modération.",
        triggers: guard.triggers,
        score: guard.score,
      });
      return;
    }

    const post = await createSoKinPost(req.auth!.userId, text, mediaUrls, location, tags, hashtags, scheduledAt ? new Date(scheduledAt) : undefined);
    emitToAll("sokin:post-created", {
      type: "SOKIN_POST_CREATED",
      postId: post.id,
      authorId: post.authorId,
      createdAt: post.createdAt.toISOString(),
      sourceUserId: req.auth!.userId,
    });

    if (guard.verdict === "WARN") {
      res.status(201).json({ ...post, _contentWarning: guard.warningMessage });
    } else {
      res.status(201).json(post);
    }
  })
);

router.patch(
  "/posts/:id/archive",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const post = await toggleArchiveSoKinPost(req.auth!.userId, req.params.id);
    res.json(post);
  })
);

router.delete(
  "/posts/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await deleteSoKinPost(req.auth!.userId, req.params.id);
    res.json({ success: true });
  })
);

/* ── Réactions style Facebook ── */

const reactionSchema = z.object({
  type: z.enum(["LIKE", "LOVE", "HAHA", "WOW", "SAD", "ANGRY"]),
});

router.post(
  "/posts/:id/react",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { type } = reactionSchema.parse(req.body);
    const result = await reactToPost(req.auth!.userId, req.params.id, type);
    if (result.authorId && result.authorId !== req.auth!.userId && !isUserOnline(result.authorId)) {
      const actor = await prisma.userProfile.findUnique({
        where: { userId: req.auth!.userId },
        select: { displayName: true },
      });
      const label = actor?.displayName ?? "Quelqu'un";
      void sendPushToUser(result.authorId, {
        title: "❤️ Nouvelle réaction So-Kin",
        body: `${label} a réagi à votre publication.`,
        tag: `sokin-like-${req.params.id}`,
        data: { type: "like", postId: req.params.id },
      });
    }
    res.json(result);
  })
);

router.delete(
  "/posts/:id/react",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await unreactToPost(req.auth!.userId, req.params.id);
    res.json(result);
  })
);

router.post(
  "/posts/:id/share",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await sharePost(req.params.id);
    emitToAll("sokin:post-shared", {
      type: "SOKIN_POST_SHARED",
      postId: req.params.id,
      shares: result.shares,
      sourceUserId: req.auth!.userId,
      updatedAt: new Date().toISOString(),
    });

    if (result.authorId && result.authorId !== req.auth!.userId && !isUserOnline(result.authorId)) {
      const actor = await prisma.userProfile.findUnique({
        where: { userId: req.auth!.userId },
        select: { displayName: true },
      });
      const label = actor?.displayName ?? "Quelqu'un";
      void sendPushToUser(result.authorId, {
        title: "🔁 Nouveau partage So-Kin",
        body: `${label} a partagé votre publication.`,
        tag: `sokin-share-${req.params.id}`,
        data: { type: "sokin", postId: req.params.id },
      });
    }

    res.json(result);
  })
);

export default router;
