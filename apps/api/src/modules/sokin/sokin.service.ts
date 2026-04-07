/**
 * So-Kin Service (Refonte v3 - Annonces uniquement)
 * 
 * Fonctionnalités:
 * - Créer/lire/supprimer les annonces
 * - Alimenter le fil public filtré par localisation
 * - No reactions, no shares, no user profiles
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

const isVideoMediaUrl = (value: string) => /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(value);

const normalizeMediaUrls = (mediaUrls: string[]): string[] =>
  mediaUrls
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

const validatePostMediaUrls = (mediaUrls: string[]) => {
  if (mediaUrls.length < 1) {
    throw new HttpError(400, "Une annonce doit contenir au moins 1 média");
  }
  if (mediaUrls.length > 5) {
    throw new HttpError(400, "Maximum 5 médias par annonce");
  }
  const videoCount = mediaUrls.filter((url) => isVideoMediaUrl(url)).length;
  if (videoCount > 2) {
    throw new HttpError(400, "Maximum 2 vidéos par annonce");
  }
};

// Résoudre les termes pays pour la recherche
function resolveCountryTerms(country?: string): string[] {
  if (!country) return [];
  const map: Record<string, string[]> = {
    "DRC": ["Congo", "Kinshasa", "RDC", "Katanga"],
    "CD": ["Congo", "Kinshasa", "RDC", "Katanga"],
  };
  return map[country] || [country];
}

/**
 * Récupère les annonces de l'utilisateur
 */
export const getMySoKinPosts = async (authorId: string) => {
  return prisma.soKinPost.findMany({
    where: {
      authorId,
      status: { not: "DELETED" },
    },
    include: {
      author: {
        include: {
          profile: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
};

/**
 * Crée une nouvelle annonce
 */
export const createSoKinPost = async (
  authorId: string,
  text: string,
  mediaUrls: string[] = [],
  location?: string,
  tags?: string[],
  hashtags?: string[],
  scheduledAt?: Date
) => {
  const normalizedMediaUrls = normalizeMediaUrls(mediaUrls);
  validatePostMediaUrls(normalizedMediaUrls);

  const post = await prisma.soKinPost.create({
    data: {
      authorId,
      text,
      mediaUrls: normalizedMediaUrls,
      location,
      tags: tags || [],
      hashtags: hashtags || [],
      scheduledAt,
      status: "ACTIVE",
      visibility: "PUBLIC",
    },
    include: {
      author: {
        include: {
          profile: true,
        },
      },
    },
  });
  return post;
};

/**
 * Supprime une annonce
 */
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

/**
 * Récupère le fil public des annonces (filtré par localisation)
 */
export const getPublicFeed = async (
  limit = 20,
  viewerUserId?: string,
  city?: string,
  country?: string,
  offset = 0,
  cursor?: string
) => {
  const countryTerms = resolveCountryTerms(country);
  const andClauses: Record<string, unknown>[] = [
    { status: "ACTIVE" },
    {
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } },
      ],
    },
  ];

  // Filtre par ville
  if (city) {
    andClauses.push({
      OR: [
        { location: { contains: city, mode: "insensitive" as const } },
        {
          author: {
            profile: {
              city: { contains: city, mode: "insensitive" as const },
            },
          },
        },
      ],
    });
  }

  // Filtre par pays
  if (countryTerms.length > 0) {
    andClauses.push({
      OR: [
        ...countryTerms.map((term) => ({
          location: { contains: term, mode: "insensitive" as const },
        })),
        {
          author: {
            profile: {
              OR: countryTerms.map((term) => ({
                country: { contains: term, mode: "insensitive" as const },
              })),
            },
          },
        },
      ],
    });
  }

  const baseQuery = {
    where: { AND: andClauses },
    include: {
      author: {
        include: {
          profile: true,
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
    take: limit,
  };

  const posts = cursor
    ? await prisma.soKinPost.findMany({
        ...baseQuery,
        cursor: { id: cursor },
        skip: 1,
      })
    : await prisma.soKinPost.findMany({
        ...baseQuery,
        skip: Math.max(offset, 0),
      });

  return posts;
};

/**
 * Récupère une annonce par ID
 */
export const getPublicPostById = async (postId: string, viewerUserId?: string) => {
  const post = await prisma.soKinPost.findUnique({
    where: { id: postId },
    include: {
      author: {
        include: {
          profile: true,
        },
      },
    },
  });

  if (!post || post.status === "DELETED") {
    return null;
  }
  if (post.status !== "ACTIVE") {
    return null;
  }

  return post;
};

/**
 * Liste les commentaires d'une annonce (plus récents en premier)
 */
export const getPostComments = async (postId: string, limit = 50) => {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return (prisma as any).soKinComment.findMany({
    where: { postId },
    include: {
      author: {
        include: {
          profile: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });
};

/**
 * Crée un commentaire (ou réponse à commentaire) sur une annonce
 */
export const createPostComment = async (
  userId: string,
  postId: string,
  content: string,
  parentCommentId?: string
) => {
  const post = await prisma.soKinPost.findUnique({
    where: { id: postId },
    select: { id: true, status: true },
  });

  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Annonce introuvable");
  }

  if (parentCommentId) {
    const parent = await (prisma as any).soKinComment.findUnique({
      where: { id: parentCommentId },
      select: { id: true, postId: true },
    });
    if (!parent || parent.postId !== postId) {
      throw new HttpError(400, "Commentaire parent invalide");
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const comment = await (tx as any).soKinComment.create({
      data: {
        postId,
        authorId: userId,
        content,
        parentCommentId,
      },
      include: {
        author: {
          include: {
            profile: true,
          },
        },
      },
    });

    await tx.soKinPost.update({
      where: { id: postId },
      data: { comments: { increment: 1 } },
    });

    return comment;
  });

  return created;
};
