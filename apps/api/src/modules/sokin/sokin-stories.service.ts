import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

const STORY_DURATION_MS = 24 * 60 * 60 * 1000; // 24 heures

export const createStory = async (
  authorId: string,
  data: {
    mediaUrl?: string;
    mediaType?: "IMAGE" | "VIDEO" | "TEXT";
    caption?: string;
    bgColor?: string;
    scheduledAt?: string;
  }
) => {
  const effectiveStart = data.scheduledAt ? new Date(data.scheduledAt) : new Date();
  const expiresAt = new Date(effectiveStart.getTime() + STORY_DURATION_MS);
  return prisma.soKinStory.create({
    data: {
      authorId,
      mediaUrl: data.mediaUrl ?? null,
      mediaType: data.mediaType ?? "IMAGE",
      caption: data.caption ?? null,
      bgColor: data.bgColor ?? null,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      expiresAt,
    },
    include: {
      author: {
        select: {
          id: true,
          profile: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });
};

export const getFeedStories = async (viewerUserId?: string) => {
  const now = new Date();
  const stories = await prisma.soKinStory.findMany({
    where: {
      expiresAt: { gt: now },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      author: {
        accountStatus: "ACTIVE",
        role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      author: {
        select: {
          id: true,
          profile: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
      viewers: viewerUserId ? { where: { userId: viewerUserId }, select: { userId: true } } : false,
    },
  });

  return stories.map((s) => ({
    id: s.id,
    authorId: s.authorId,
    author: s.author,
    mediaUrl: s.mediaUrl,
    mediaType: s.mediaType,
    caption: s.caption,
    bgColor: s.bgColor,
    viewCount: s.viewCount,
    expiresAt: s.expiresAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    viewedByMe: viewerUserId ? (s.viewers as { userId: string }[]).some((v) => v.userId === viewerUserId) : false,
  }));
};

export const viewStory = async (storyId: string, viewerId: string) => {
  const story = await prisma.soKinStory.findUnique({
    where: { id: storyId },
    select: { id: true, expiresAt: true, authorId: true },
  });
  if (!story || story.expiresAt < new Date()) throw new HttpError(404, "Story introuvable ou expirée");
  if (story.authorId === viewerId) return { ok: true }; // L'auteur ne compte pas

  await prisma.soKinStoryView.upsert({
    where: { storyId_userId: { storyId, userId: viewerId } },
    update: {},
    create: { storyId, userId: viewerId },
  });

  // Increment view counter
  await prisma.soKinStory.update({
    where: { id: storyId },
    data: { viewCount: { increment: 1 } },
  });

  return { ok: true };
};

export const deleteStory = async (storyId: string, userId: string) => {
  const story = await prisma.soKinStory.findUnique({ where: { id: storyId } });
  if (!story) throw new HttpError(404, "Story introuvable");
  if (story.authorId !== userId) throw new HttpError(403, "Non autorisé");
  await prisma.soKinStory.delete({ where: { id: storyId } });
  return { ok: true };
};

/** Nettoyage: supprime les stories expirées (à appeler via cron ou middleware) */
export const pruneExpiredStories = async () => {
  const result = await prisma.soKinStory.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
};
