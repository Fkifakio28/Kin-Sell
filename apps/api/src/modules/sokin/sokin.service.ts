import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { normalizeImageInputs } from "../../shared/utils/media-storage.js";

export const getMySoKinPosts = async (authorId: string) => {
  return prisma.soKinPost.findMany({
    where: { authorId, status: { not: "DELETED" } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
};

export const createSoKinPost = async (
  authorId: string,
  text: string,
  mediaUrls: string[] = [],
  location?: string,
  tags?: string[],
  hashtags?: string[]
) => {
  const normalizedMediaUrls = await normalizeImageInputs(mediaUrls, { folder: "sokin" });

  return prisma.soKinPost.create({
    data: {
      authorId,
      text,
      mediaUrls: normalizedMediaUrls ?? [],
      location: location || null,
      tags: tags || [],
      hashtags: hashtags || [],
    },
  });
};

export const toggleArchiveSoKinPost = async (
  authorId: string,
  postId: string
) => {
  const post = await prisma.soKinPost.findUnique({ where: { id: postId } });
  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Publication introuvable");
  }
  if (post.authorId !== authorId) {
    throw new HttpError(403, "Non autorisé");
  }
  const newStatus = post.status === "HIDDEN" ? "ACTIVE" : "HIDDEN";
  return prisma.soKinPost.update({
    where: { id: postId },
    data: { status: newStatus },
  });
};

export const deleteSoKinPost = async (authorId: string, postId: string) => {
  const post = await prisma.soKinPost.findUnique({ where: { id: postId } });
  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Publication introuvable");
  }
  if (post.authorId !== authorId) {
    throw new HttpError(403, "Non autorisé");
  }
  await prisma.soKinPost.update({
    where: { id: postId },
    data: { status: "DELETED" },
  });
};

export const getPublicFeed = async (limit = 20, viewerUserId?: string) => {
  const posts = await prisma.soKinPost.findMany({
    where: {
      status: "ACTIVE",
      author: {
        role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: {
        select: {
          id: true,
          profile: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
              city: true,
            },
          },
        },
      },
      reactions: {
        select: { type: true, userId: true },
      },
    },
  });

  return posts.map((post) => {
    const reactionCounts: Record<string, number> = {};
    let myReaction: string | null = null;
    for (const r of post.reactions) {
      reactionCounts[r.type] = (reactionCounts[r.type] ?? 0) + 1;
      if (viewerUserId && r.userId === viewerUserId) {
        myReaction = r.type;
      }
    }
    const { reactions: _r, ...rest } = post;
    return { ...rest, reactionCounts, myReaction };
  });
};

export const reactToPost = async (
  userId: string,
  postId: string,
  type: "LIKE" | "LOVE" | "HAHA" | "WOW" | "SAD" | "ANGRY"
) => {
  const post = await prisma.soKinPost.findUnique({ where: { id: postId }, select: { id: true, status: true, authorId: true } });
  if (!post || post.status === "DELETED") throw new HttpError(404, "Publication introuvable");

  await prisma.soKinReaction.upsert({
    where: { postId_userId: { postId, userId } },
    update: { type },
    create: { postId, userId, type },
  });

  // Update cached likes counter (total reactions)
  const total = await prisma.soKinReaction.count({ where: { postId } });
  await prisma.soKinPost.update({ where: { id: postId }, data: { likes: total } });

  return { ok: true, type, authorId: post.authorId };
};

export const unreactToPost = async (userId: string, postId: string) => {
  await prisma.soKinReaction.deleteMany({ where: { postId, userId } });
  const total = await prisma.soKinReaction.count({ where: { postId } });
  await prisma.soKinPost.update({ where: { id: postId }, data: { likes: total } });
  return { ok: true };
};

export const getPublicUsers = async (
  city?: string,
  search?: string,
  limit = 100
) => {
  return prisma.userProfile.findMany({
    where: {
      // Seuls les utilisateurs ayant un username public apparaissent dans l'annuaire
      username: { not: null },
      user: {
        accountStatus: "ACTIVE",
        // Exclure les admins et les comptes business des profils publics
        role: { notIn: ["ADMIN", "SUPER_ADMIN", "BUSINESS"] },
        // Seuls les comptes actifs ayant publié du contenu (pas de comptes test)
        OR: [
          { listings: { some: { status: "ACTIVE" } } },
          { sokinPosts: { some: {} } },
        ],
      },
      ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" as const } },
              { username: { contains: search, mode: "insensitive" as const } },
              { city: { contains: search, mode: "insensitive" as const } },
              { domain: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    take: limit,
    select: {
      userId: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      city: true,
      domain: true,
      qualification: true,
      verificationStatus: true,
    },
  });
};
