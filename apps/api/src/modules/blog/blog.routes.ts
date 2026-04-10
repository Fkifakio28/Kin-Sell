import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../shared/db/prisma.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { scrapeGuard } from "../../shared/middleware/scrape-guard.middleware.js";

const router = Router();

router.get(
  "/",
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_FEED),
  asyncHandler(async (req, res) => {
    const params = z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(20).optional(),
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
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      author: post.author.profile?.displayName ?? "Admin Kin-Sell",
    });
  }),
);

export default router;
