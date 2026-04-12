import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { sendPushToUser } from "../notifications/push.service.js";

export const getReviewsForUser = async (targetId: string, limit = 20, offset = 0) => {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const safeOffset = Math.max(0, offset);

  const [reviews, totalCount] = await Promise.all([
    prisma.userReview.findMany({
      where: { targetId },
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      skip: safeOffset,
      include: {
        author: {
          include: { profile: { select: { displayName: true, avatarUrl: true } } },
        },
      },
    }),
    prisma.userReview.count({ where: { targetId } }),
  ]);

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
      verified: r.verified,
      orderId: r.orderId,
      createdAt: r.createdAt,
    })),
    averageRating: Math.round(avg * 10) / 10,
    totalCount: reviews.length,
  };
};

/**
 * Créer un avis lié à une commande réelle (avis vérifié).
 * Conditions :
 *  - la commande doit être DELIVERED
 *  - l'auteur doit être buyer ou seller de la commande
 *  - la cible doit être l'autre partie
 *  - un seul avis par personne par commande
 */
export const createOrderReview = async (
  authorId: string,
  orderId: string,
  rating: number,
  text?: string,
) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, buyerUserId: true, sellerUserId: true },
  });

  if (!order) throw new HttpError(404, "Commande introuvable.");
  if (order.status !== "DELIVERED") throw new HttpError(400, "Vous ne pouvez laisser un avis que sur une commande livrée.");

  // Déterminer rôle de l'auteur et la cible
  let targetId: string;
  if (authorId === order.buyerUserId) {
    targetId = order.sellerUserId;
  } else if (authorId === order.sellerUserId) {
    targetId = order.buyerUserId;
  } else {
    throw new HttpError(403, "Vous ne faites pas partie de cette transaction.");
  }

  // Vérifier doublon
  const existing = await prisma.userReview.findUnique({
    where: { authorId_targetId_orderId: { authorId, targetId, orderId } },
  });
  if (existing) throw new HttpError(409, "Vous avez déjà laissé un avis pour cette commande.");

  const review = await prisma.userReview.create({
    data: {
      authorId,
      targetId,
      orderId,
      rating,
      text: text ?? null,
      verified: true,
    },
  });

  // Notifier la cible de l'avis
  const author = await prisma.userProfile.findUnique({ where: { userId: authorId }, select: { displayName: true } });
  const name = author?.displayName ?? "Un utilisateur";
  const stars = "⭐".repeat(Math.min(rating, 5));
  sendPushToUser(targetId, {
    title: "Kin-Sell • Avis ⭐",
    body: `${name} vous a donné ${rating}/5 ${stars}`,
    tag: `review-${review.id}`,
    data: { type: "order", reviewId: review.id, url: "/account" },
  }).catch(() => {});

  return review;
};

/**
 * Créer un avis libre (non lié à une commande — héritage du système existant).
 */
export const createReview = async (
  authorId: string,
  targetId: string,
  rating: number,
  text?: string,
) => {
  if (authorId === targetId) {
    throw new HttpError(400, "Vous ne pouvez pas vous évaluer vous-même.");
  }

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new HttpError(404, "Utilisateur cible introuvable.");

  // Avis libre : orderId = null
  const existing = await prisma.userReview.findFirst({
    where: { authorId, targetId, orderId: null },
  });

  if (existing) {
    // Mise à jour de l'avis libre existant
    return prisma.userReview.update({
      where: { id: existing.id },
      data: { rating, text: text ?? null },
    });
  }

  const review = await prisma.userReview.create({
    data: { authorId, targetId, rating, text: text ?? null, verified: false },
  });

  const authorProfile = await prisma.userProfile.findUnique({ where: { userId: authorId }, select: { displayName: true } });
  const name = authorProfile?.displayName ?? "Un utilisateur";
  sendPushToUser(targetId, {
    title: "Kin-Sell • Avis ⭐",
    body: `${name} vous a évalué ${rating}/5`,
    tag: `review-${review.id}`,
    data: { type: "order", reviewId: review.id, url: "/account" },
  }).catch(() => {});

  return review;
};

/**
 * Vérifie si l'utilisateur peut laisser un avis sur une commande.
 */
export const canReviewOrder = async (userId: string, orderId: string) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, buyerUserId: true, sellerUserId: true },
  });
  if (!order) return { canReview: false };
  if (order.status !== "DELIVERED") return { canReview: false };

  const isBuyer = userId === order.buyerUserId;
  const isSeller = userId === order.sellerUserId;
  if (!isBuyer && !isSeller) return { canReview: false };

  const targetId = isBuyer ? order.sellerUserId : order.buyerUserId;

  const existing = await prisma.userReview.findUnique({
    where: { authorId_targetId_orderId: { authorId: userId, targetId, orderId } },
  });

  return { canReview: !existing, alreadyReviewed: !!existing, targetId };
};

/**
 * Retourne les commandes DELIVERED de l'utilisateur qui n'ont pas encore d'avis.
 */
export const getPendingReviewOrders = async (userId: string) => {
  const deliveredOrders = await prisma.order.findMany({
    where: {
      status: "DELIVERED",
      OR: [{ buyerUserId: userId }, { sellerUserId: userId }],
    },
    orderBy: { deliveredAt: "desc" },
    take: 20,
    select: {
      id: true,
      buyerUserId: true,
      sellerUserId: true,
      totalUsdCents: true,
      deliveredAt: true,
      items: { select: { title: true }, take: 2 },
      buyer: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      seller: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true } } } },
    },
  });

  const results = [];
  for (const order of deliveredOrders) {
    const targetId = userId === order.buyerUserId ? order.sellerUserId : order.buyerUserId;
    const existing = await prisma.userReview.findFirst({
      where: { authorId: userId, orderId: order.id },
    });
    if (!existing) {
      const target = userId === order.buyerUserId ? order.seller : order.buyer;
      results.push({
        orderId: order.id,
        targetId,
        targetName: target.profile?.displayName ?? "Utilisateur",
        targetAvatar: target.profile?.avatarUrl ?? null,
        itemSummary: order.items.map((i) => i.title).join(", "),
        totalUsdCents: order.totalUsdCents,
        deliveredAt: order.deliveredAt,
      });
    }
  }

  return results;
};
