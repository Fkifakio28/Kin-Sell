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
  getPublicUsers,
} from "./sokin.service.js";

const createPostSchema = z.object({
  text: z.string().min(1).max(500),
  mediaUrls: z.array(z.string()).max(4).optional(),
  location: z.string().max(100).optional(),
  tags: z.array(z.string()).max(10).optional(),
  hashtags: z.array(z.string()).max(20).optional(),
});

const router = Router();

/* ── Routes publiques (pas d'authentification requise) ── */

router.get(
  "/posts",
  asyncHandler(async (req, res) => {
    const raw = req.query.limit;
    const limit = Math.min(
      parseInt(typeof raw === "string" ? raw : "20", 10) || 20,
      50
    );
    const posts = await getPublicFeed(limit);
    res.json({ posts });
  })
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { city, search } = req.query as Record<string, string | undefined>;
    const raw = req.query.limit;
    const limit = Math.min(
      parseInt(typeof raw === "string" ? raw : "50", 10) || 50,
      100
    );
    const users = await getPublicUsers(city, search, limit);
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
    const { text, mediaUrls = [], location, tags, hashtags } = createPostSchema.parse(req.body);

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

    const post = await createSoKinPost(req.auth!.userId, text, mediaUrls, location, tags, hashtags);

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

export default router;
