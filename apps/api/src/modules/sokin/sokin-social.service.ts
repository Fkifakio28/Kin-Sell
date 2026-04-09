/**
 * So-Kin Social Service — Interactions sociales
 *
 * Fonctionnalités:
 * - Réactions (like, love, etc.)
 * - Bookmarks (sauvegardes)
 * - Signalements
 * - État social d'un post pour un utilisateur
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { SoKinReactionType, SoKinReportReason } from "@prisma/client";

// ═══════════════════════════════════════════
// REACTIONS
// ═══════════════════════════════════════════

const VALID_REACTIONS = ["LIKE", "LOVE", "HAHA", "WOW", "SAD", "ANGRY"] as const;

/**
 * Réagir à un post (toggle: si même réaction → supprime, sinon → remplace)
 */
export const toggleReaction = async (
  userId: string,
  postId: string,
  type: SoKinReactionType
) => {
  if (!VALID_REACTIONS.includes(type as any)) {
    throw new HttpError(400, "Type de réaction invalide");
  }

  const post = await prisma.soKinPost.findUnique({
    where: { id: postId },
    select: { id: true, status: true },
  });
  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Publication introuvable");
  }

  const existing = await prisma.soKinReaction.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    if (existing.type === type) {
      // Même réaction → retirer
      await prisma.soKinReaction.delete({
        where: { id: existing.id },
      });
      await prisma.soKinPost.update({
        where: { id: postId },
        data: { likes: { decrement: 1 } },
      });
      return { action: "removed", reaction: null };
    } else {
      // Autre réaction → remplacer
      const updated = await prisma.soKinReaction.update({
        where: { id: existing.id },
        data: { type },
      });
      return { action: "changed", reaction: updated };
    }
  } else {
    // Nouvelle réaction
    const created = await prisma.soKinReaction.create({
      data: { postId, userId, type },
    });
    await prisma.soKinPost.update({
      where: { id: postId },
      data: { likes: { increment: 1 } },
    });
    return { action: "added", reaction: created };
  }
};

/**
 * Récupère la réaction d'un utilisateur sur un post
 */
export const getUserReaction = async (userId: string, postId: string) => {
  const reaction = await prisma.soKinReaction.findUnique({
    where: { postId_userId: { postId, userId } },
  });
  return reaction?.type ?? null;
};

/**
 * Récupère les compteurs de réactions d'un post
 */
export const getReactionCounts = async (postId: string) => {
  const reactions = await prisma.soKinReaction.groupBy({
    by: ["type"],
    where: { postId },
    _count: { type: true },
  });
  const counts: Record<string, number> = {};
  for (const r of reactions) {
    counts[r.type] = r._count.type;
  }
  return counts;
};

// ═══════════════════════════════════════════
// BOOKMARKS
// ═══════════════════════════════════════════

/**
 * Toggle bookmark (sauvegarder / retirer des favoris)
 */
export const toggleBookmark = async (userId: string, postId: string) => {
  const post = await prisma.soKinPost.findUnique({
    where: { id: postId },
    select: { id: true, status: true },
  });
  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Publication introuvable");
  }

  const existing = await prisma.soKinBookmark.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    await prisma.soKinBookmark.delete({ where: { id: existing.id } });
    return { saved: false };
  } else {
    await prisma.soKinBookmark.create({
      data: { postId, userId },
    });
    return { saved: true };
  }
};

/**
 * Liste les posts sauvegardés par un utilisateur
 */
export const getUserBookmarks = async (userId: string, limit = 50) => {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const bookmarks = await prisma.soKinBookmark.findMany({
    where: { userId },
    include: {
      post: {
        include: {
          author: { include: { profile: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
  return bookmarks
    .filter((b: any) => b.post && b.post.status !== "DELETED")
    .map((b: any) => b.post);
};

// ═══════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════

const VALID_REASONS = [
  "SPAM", "HARASSMENT", "HATE_SPEECH", "VIOLENCE",
  "NUDITY", "SCAM", "MISINFORMATION", "OTHER",
] as const;

/**
 * Signaler un post
 */
export const reportPost = async (
  userId: string,
  postId: string,
  reason: SoKinReportReason,
  details?: string
) => {
  if (!VALID_REASONS.includes(reason as any)) {
    throw new HttpError(400, "Motif de signalement invalide");
  }

  const post = await prisma.soKinPost.findUnique({
    where: { id: postId },
    select: { id: true, status: true, authorId: true },
  });
  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Publication introuvable");
  }
  if (post.authorId === userId) {
    throw new HttpError(400, "Vous ne pouvez pas signaler votre propre publication");
  }

  // Vérifier si déjà signalé
  const existing = await prisma.soKinReport.findUnique({
    where: { postId_userId: { postId, userId } },
  });
  if (existing) {
    throw new HttpError(409, "Vous avez déjà signalé cette publication");
  }

  const report = await prisma.soKinReport.create({
    data: {
      postId,
      userId,
      reason,
      details: details?.slice(0, 500) || null,
    },
  });

  return report;
};

// ═══════════════════════════════════════════
// SOCIAL STATE (état agrégé pour le feed)
// ═══════════════════════════════════════════

/**
 * Récupère l'état social d'un utilisateur sur plusieurs posts
 * (réactions + bookmarks) pour enrichir le feed
 */
export const getUserSocialState = async (
  userId: string,
  postIds: string[]
) => {
  if (postIds.length === 0) return { reactions: {}, bookmarks: new Set<string>() };

  const [reactions, bookmarks] = await Promise.all([
    prisma.soKinReaction.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true, type: true },
    }),
    prisma.soKinBookmark.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
    }),
  ]);

  const reactionMap: Record<string, string> = {};
  for (const r of reactions) {
    reactionMap[r.postId] = r.type;
  }

  const bookmarkSet = new Set<string>(bookmarks.map((b: any) => b.postId));

  return { reactions: reactionMap, bookmarks: bookmarkSet };
};
