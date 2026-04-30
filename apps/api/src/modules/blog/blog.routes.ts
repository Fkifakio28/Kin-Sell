import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../shared/db/prisma.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { scrapeGuard } from "../../shared/middleware/scrape-guard.middleware.js";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";

const router = Router();

const BLOG_REACTION_ENTITY = "BLOG_POST_REACTION";
const BLOG_SHARE_ENTITY = "BLOG_POST_SHARE";

type BlogReactionAction = "BLOG_REACT_LIKE" | "BLOG_REACT_DISLIKE" | "BLOG_REACT_CLEAR";

async function getBlogReactionStats(postIds: string[], viewerId?: string) {
  if (postIds.length === 0) {
    return {
      likesByPost: {} as Record<string, number>,
      dislikesByPost: {} as Record<string, number>,
      sharesByPost: {} as Record<string, number>,
      viewerReactionByPost: {} as Record<string, "like" | "dislike" | null>,
    };
  }

  const [reactionLogs, shareLogs] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        entityType: BLOG_REACTION_ENTITY,
        entityId: { in: postIds },
        action: { in: ["BLOG_REACT_LIKE", "BLOG_REACT_DISLIKE", "BLOG_REACT_CLEAR"] },
      },
      select: { entityId: true, actorUserId: true, action: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.auditLog.findMany({
      where: {
        entityType: BLOG_SHARE_ENTITY,
        entityId: { in: postIds },
        action: "BLOG_SHARE",
      },
      select: { entityId: true },
    }),
  ]);

  const latestByActorAndPost = new Map<string, BlogReactionAction>();
  for (const row of reactionLogs) {
    if (!row.entityId || !row.actorUserId) continue;
    latestByActorAndPost.set(`${row.entityId}:${row.actorUserId}`, row.action as BlogReactionAction);
  }

  const likesByPost: Record<string, number> = {};
  const dislikesByPost: Record<string, number> = {};
  const sharesByPost: Record<string, number> = {};
  const viewerReactionByPost: Record<string, "like" | "dislike" | null> = {};

  for (const postId of postIds) {
    likesByPost[postId] = 0;
    dislikesByPost[postId] = 0;
    sharesByPost[postId] = 0;
    viewerReactionByPost[postId] = null;
  }

  for (const [key, action] of latestByActorAndPost.entries()) {
    const [postId, actorId] = key.split(":");
    if (action === "BLOG_REACT_LIKE") likesByPost[postId] = (likesByPost[postId] ?? 0) + 1;
    if (action === "BLOG_REACT_DISLIKE") dislikesByPost[postId] = (dislikesByPost[postId] ?? 0) + 1;
    if (viewerId && actorId === viewerId) {
      viewerReactionByPost[postId] = action === "BLOG_REACT_LIKE" ? "like" : action === "BLOG_REACT_DISLIKE" ? "dislike" : null;
    }
  }

  for (const row of shareLogs) {
    if (!row.entityId) continue;
    sharesByPost[row.entityId] = (sharesByPost[row.entityId] ?? 0) + 1;
  }

  return { likesByPost, dislikesByPost, sharesByPost, viewerReactionByPost };
}

router.get(
  "/",
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_FEED),
  asyncHandler(async (req, res) => {
    const params = z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(req.query);

    const page = params.page ?? 1;
    const limit = params.limit ?? 6;
    const skip = (page - 1) * limit;

    const [total, posts] = await Promise.all([
      prisma.blogPost.count({ where: { status: "PUBLISHED" } }),
      prisma.blogPost.findMany({
        where: { status: "PUBLISHED" },
        include: {
          author: {
            include: {
              profile: true,
            },
          },
        },
        orderBy: [
          { publishedAt: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: limit,
      }),
    ]);

    const postIds = posts.map((post) => post.id);
    const { likesByPost, dislikesByPost, sharesByPost } = await getBlogReactionStats(postIds);

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      posts: posts.map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        content: post.content,
        excerpt: post.excerpt,
        coverImage: post.coverImage,
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
        gifUrl: post.gifUrl,
        category: post.category,
        tags: post.tags,
        views: post.views,
        likes: likesByPost[post.id] ?? 0,
        dislikes: dislikesByPost[post.id] ?? 0,
        shares: sharesByPost[post.id] ?? 0,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        createdAt: post.createdAt.toISOString(),
        author: post.author.profile?.displayName ?? "Admin Kin-Sell",
      })),
    });
  }),
);

// Get single post by slug + increment views
router.get(
  "/:slug",
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_FEED),
  asyncHandler(async (req, res) => {
    const post = await prisma.blogPost.findFirst({
      where: { slug: req.params.slug, status: "PUBLISHED" },
      include: { author: { include: { profile: true } } },
    });
    if (!post) { res.status(404).json({ error: "Article introuvable" }); return; }

    // Increment views in background
    prisma.blogPost.update({ where: { id: post.id }, data: { views: { increment: 1 } } }).catch(() => {});

    const { likesByPost, dislikesByPost, sharesByPost } = await getBlogReactionStats([post.id]);

    res.json({
      id: post.id,
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt,
      coverImage: post.coverImage,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
      gifUrl: post.gifUrl,
      category: post.category,
      tags: post.tags,
      language: post.language,
      views: post.views,
      likes: likesByPost[post.id] ?? 0,
      dislikes: dislikesByPost[post.id] ?? 0,
      shares: sharesByPost[post.id] ?? 0,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      author: post.author.profile?.displayName ?? "Admin Kin-Sell",
    });
  }),
);

router.post(
  "/reactions/my",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = z.object({ postIds: z.array(z.string().min(1)).min(1).max(40) }).parse(req.body ?? {});
    const postIds = parsed.postIds.map((id) => id.trim()).filter(Boolean);
    const { viewerReactionByPost } = await getBlogReactionStats(postIds, req.auth!.userId);
    res.json({ reactions: viewerReactionByPost });
  }),
);

router.post(
  "/:slug/react",
  requireAuth,
  rateLimit(RateLimits.SOKIN_POST),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = z.object({ reaction: z.enum(["like", "dislike", "clear"]) }).parse(req.body);
    const post = await prisma.blogPost.findFirst({
      where: { slug: req.params.slug, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!post) {
      res.status(404).json({ error: "Article introuvable" });
      return;
    }

    const action: BlogReactionAction =
      body.reaction === "like"
        ? "BLOG_REACT_LIKE"
        : body.reaction === "dislike"
          ? "BLOG_REACT_DISLIKE"
          : "BLOG_REACT_CLEAR";

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth!.userId,
        action,
        entityType: BLOG_REACTION_ENTITY,
        entityId: post.id,
      },
    });

    const { likesByPost, dislikesByPost, viewerReactionByPost } = await getBlogReactionStats([post.id], req.auth!.userId);
    res.json({
      likes: likesByPost[post.id] ?? 0,
      dislikes: dislikesByPost[post.id] ?? 0,
      myReaction: viewerReactionByPost[post.id] ?? null,
    });
  }),
);

router.post(
  "/:slug/share",
  rateLimit(RateLimits.PUBLIC_FEED),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const post = await prisma.blogPost.findFirst({
      where: { slug: req.params.slug, status: "PUBLISHED" },
      select: { id: true },
    });
    if (!post) {
      res.status(404).json({ error: "Article introuvable" });
      return;
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: req.auth?.userId,
        action: "BLOG_SHARE",
        entityType: BLOG_SHARE_ENTITY,
        entityId: post.id,
      },
    });

    const { sharesByPost } = await getBlogReactionStats([post.id]);
    res.json({ shares: sharesByPost[post.id] ?? 0 });
  }),
);

export default router;
