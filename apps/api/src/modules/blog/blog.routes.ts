import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../shared/db/prisma.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

const router = Router();

router.get(
  "/",
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
        content: post.content,
        excerpt: post.excerpt,
        coverImage: post.coverImage,
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        createdAt: post.createdAt.toISOString(),
        author: post.author.profile?.displayName ?? "Admin Kin-Sell",
      })),
    });
  }),
);

export default router;