import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

export const getReviewsForUser = async (targetId: string) => {
  const reviews = await prisma.userReview.findMany({
    where: { targetId },
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        include: { profile: { select: { displayName: true, avatarUrl: true } } },
      },
    },
  });

  const avg =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return {
    reviews: reviews.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      authorName: r.author.profile?.displayName ?? "Utilisateur",
      authorAvatar: r.author.profile?.avatarUrl ?? null,
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt,
    })),
    averageRating: Math.round(avg * 10) / 10,
    totalCount: reviews.length,
  };
};

export const createReview = async (
  authorId: string,
  targetId: string,
  rating: number,
  text?: string
) => {
  if (authorId === targetId) {
    throw new HttpError(400, "Vous ne pouvez pas vous évaluer vous-même.");
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) {
    throw new HttpError(404, "Utilisateur cible introuvable.");
  }

  const review = await prisma.userReview.upsert({
    where: { authorId_targetId: { authorId, targetId } },
    create: { authorId, targetId, rating, text: text ?? null },
    update: { rating, text: text ?? null },
  });

  return review;
};
