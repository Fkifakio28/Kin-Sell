/**
 * So-Kin Service (v4 - Publications sociales enrichies)
 * 
 * Fonctionnalités:
 * - Créer/lire/supprimer les publications
 * - Alimenter le fil public filtré par localisation
 * - Types de publication : SHOWCASE, DISCUSSION, QUESTION, SELLING, PROMO, SEARCH, UPDATE, REVIEW, TREND
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { sendPushToUser } from "../notifications/push.service.js";
import { applyBoostRanking, hydrateBoostCampaigns } from "../boost/ranking.service.js";

const isVideoMediaUrl = (value: string) => /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(value);
const isAudioMediaUrl = (value: string) => /\.(mp3)(\?.*)?$/i.test(value);

const normalizeMediaUrls = (mediaUrls: string[]): string[] =>
  mediaUrls
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

const validatePostMediaUrls = (mediaUrls: string[]) => {
  // UPDATE (11/04/2026): Texte seul autorisé (pas de check MEDIA_REQUIRED_TYPES)
  if (mediaUrls.length > 5) {
    throw new HttpError(400, "Maximum 5 médias par publication");
  }
  const videoCount = mediaUrls.filter((url) => isVideoMediaUrl(url)).length;
  const audioCount = mediaUrls.filter((url) => isAudioMediaUrl(url)).length;
  if (videoCount > 2) {
    throw new HttpError(400, "Maximum 2 vidéos par publication");
  }
  if (videoCount > 0 && audioCount > 0) {
    throw new HttpError(400, "Une publication ne peut pas contenir une vidéo et un audio en même temps");
  }
};

/** Vérifier qu'une publication contient au moins texte OU média */
const validatePostContent = (text: string, mediaUrls: string[], backgroundStyle?: string) => {
  // UPDATE (11/04/2026): Texte + background seul accepté (pas besoin de média)
  if (text.trim().length === 0 && mediaUrls.length === 0 && !backgroundStyle) {
    throw new HttpError(400, "Une publication doit contenir du texte, un média ou un fond personnalisé");
  }
};

// Résoudre les termes pays pour la recherche
function resolveCountryTerms(country?: string): string[] {
  if (!country) return [];
  if (country.trim().toUpperCase() === "GLOBAL") return [];
  const map: Record<string, string[]> = {
    "DRC": ["Congo", "Kinshasa", "RDC", "Katanga"],
    "CD": ["Congo", "Kinshasa", "RDC", "Katanga"],
  };
  return map[country] || [country];
}

/**
 * Récupère les publications de l'utilisateur avec filtre de statut
 */
export const getMySoKinPosts = async (
  authorId: string,
  statusFilter?: "ACTIVE" | "HIDDEN" | "ARCHIVED" | "DELETED" | "all"
) => {
  const statusWhere =
    statusFilter === "all"
      ? {}
      : statusFilter === "DELETED"
        ? { status: "DELETED" as const }
        : statusFilter
          ? { status: statusFilter as any }
          : { status: { not: "DELETED" as const } };

  return prisma.soKinPost.findMany({
    where: {
      authorId,
      ...statusWhere,
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
 * Crée une nouvelle publication
 */
export const createSoKinPost = async (
  authorId: string,
  text: string,
  mediaUrls: string[] = [],
  location?: string,
  tags?: string[],
  hashtags?: string[],
  scheduledAt?: Date,
  postType: string = "SHOWCASE",
  subject?: string,
  backgroundStyle?: string
) => {
  const normalizedMediaUrls = normalizeMediaUrls(mediaUrls);
  validatePostContent(text, normalizedMediaUrls, backgroundStyle);
  validatePostMediaUrls(normalizedMediaUrls);

  const post = await prisma.soKinPost.create({
    data: {
      authorId,
      postType: postType as any,
      subject: subject || null,
      text,
      mediaUrls: normalizedMediaUrls,
      location,
      tags: tags || [],
      hashtags: hashtags || [],
      scheduledAt,
      backgroundStyle: backgroundStyle || null,
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
 * Bascule le statut d'une annonce entre ACTIVE et HIDDEN
 */
export const toggleSoKinPost = async (authorId: string, postId: string) => {
  const post = await prisma.soKinPost.findUnique({ where: { id: postId } });
  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Publication introuvable");
  }
  if (post.authorId !== authorId) {
    throw new HttpError(403, "Non autorisé");
  }
  const newStatus = post.status === "ACTIVE" ? "HIDDEN" : "ACTIVE";
  const updated = await prisma.soKinPost.update({
    where: { id: postId },
    data: { status: newStatus },
    include: { author: { include: { profile: true } } },
  });
  return updated;
};

/**
 * Archive une publication (ARCHIVED = masquée + classée)
 */
export const archiveSoKinPost = async (authorId: string, postId: string) => {
  const post = await prisma.soKinPost.findUnique({ where: { id: postId } });
  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Publication introuvable");
  }
  if (post.authorId !== authorId) {
    throw new HttpError(403, "Non autorisé");
  }
  const newStatus = post.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
  const updated = await prisma.soKinPost.update({
    where: { id: postId },
    data: { status: newStatus },
    include: { author: { include: { profile: true } } },
  });
  return updated;
};

/**
 * Compteurs par statut pour l'utilisateur
 */
export const getMyPostCounts = async (authorId: string) => {
  const [groups, bookmarkCount] = await Promise.all([
    prisma.soKinPost.groupBy({
      by: ["status"],
      where: { authorId },
      _count: { status: true },
    }),
    prisma.soKinBookmark.count({ where: { userId: authorId } }),
  ]);
  const counts: Record<string, number> = {
    ACTIVE: 0,
    HIDDEN: 0,
    ARCHIVED: 0,
    DELETED: 0,
    BOOKMARKS: bookmarkCount,
  };
  for (const g of groups) {
    counts[g.status] = g._count.status;
  }
  return counts;
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
  cursor?: string,
  types?: string[]
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

  // Filtre par types de post
  if (types && types.length > 0) {
    andClauses.push({ postType: { in: types } });
  }

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
      repostOf: {
        include: {
          author: { include: { profile: true } },
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

  // ── Ranking boost-aware (Phase 4) ─────────────────────────────────────
  // Respecte: visibility scope (LOCAL/NATIONAL/CROSS_BORDER), cap densité 25%, fairness
  const campaignMap = await hydrateBoostCampaigns(
    posts
      .filter((p) => (p as any).isBoosted && (!p.boostExpiresAt || p.boostExpiresAt > new Date()))
      .map((p) => ({ id: p.id, isBoosted: true })),
    "POST",
  );
  const rankable = posts.map((p) => ({
    id: p.id,
    sellerId: p.authorId,
    isBoosted: Boolean((p as any).isBoosted) && (!p.boostExpiresAt || p.boostExpiresAt > new Date()),
    boostCampaignId: (p as any).boostCampaignId ?? null,
    boostScope: campaignMap.get(p.id)?.scope ?? null,
    boostTargetCountries: campaignMap.get(p.id)?.targetCountries ?? [],
    boostBudgetSpent: campaignMap.get(p.id)?.budgetSpentUsdCents ?? 0,
    boostBudgetTotal: campaignMap.get(p.id)?.budgetUsdCents ?? 0,
    itemCity: (p as any).author?.profile?.city ?? null,
    itemCountry: (p as any).author?.profile?.country ?? null,
    createdAt: p.createdAt,
    _original: p,
  }));
  const ranked = applyBoostRanking(rankable, {
    viewerCity: city,
    viewerCountry: country,
  });
  return ranked.map((r: any) => r._original);
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
      repostOf: {
        include: {
          author: { include: { profile: true } },
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
 * Liste les commentaires d'une annonce avec réponses imbriquées
 * @param sort  'recent' (défaut) | 'relevant' (nombre de réponses décroissant)
 */
export const getPostComments = async (
  postId: string,
  limit = 50,
  sort: "recent" | "relevant" = "recent"
) => {
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const authorInclude = { include: { profile: true } };

  // Récupérer les commentaires racines (sans parent)
  const roots = await prisma.soKinComment.findMany({
    where: { postId, parentCommentId: null },
    include: {
      author: authorInclude,
      replies: {
        include: { author: authorInclude },
        orderBy: { createdAt: "asc" as const },
        take: 5, // max 5 réponses imbriquées affichées
      },
      _count: { select: { replies: true } },
    },
    orderBy:
      sort === "relevant"
        ? [{ replies: { _count: "desc" as const } }, { createdAt: "desc" as const }]
        : { createdAt: "desc" as const },
    take: safeLimit,
  });

  return roots;
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
    select: { id: true, status: true, authorId: true },
  });

  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Annonce introuvable");
  }

  if (parentCommentId) {
    const parent = await prisma.soKinComment.findUnique({
      where: { id: parentCommentId },
      select: { id: true, postId: true, authorId: true },
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

  // Notifications push
  const commenterProfile = await prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } });
  const commenterName = commenterProfile?.displayName ?? "Quelqu'un";

  if (parentCommentId) {
    // Réponse à un commentaire → notifier l'auteur du commentaire parent
    const parent = await prisma.soKinComment.findUnique({ where: { id: parentCommentId }, select: { authorId: true } });
    if (parent && parent.authorId !== userId) {
      sendPushToUser(parent.authorId, {
        title: "Kin-Sell • So-Kin",
        body: `${commenterName} a répondu à votre commentaire 💬`,
        tag: `comment-reply-${parentCommentId}`,
        data: { type: "publication", postId, url: "/sokin" },
      }).catch(() => {});
    }
  }

  // Notifier l'auteur du post (sauf auto-commentaire)
  if (post.authorId !== userId) {
    sendPushToUser(post.authorId, {
      title: "Kin-Sell • So-Kin",
      body: `${commenterName} a commenté votre publication 💬`,
      tag: `comment-${postId}`,
      data: { type: "publication", postId, url: "/sokin" },
    }).catch(() => {});
  }

  return created;
};

/**
 * Met à jour une publication existante (édition in-place)
 * Seul l'auteur peut modifier. Seules les publications ACTIVE ou HIDDEN sont éditables.
 */
export const updateSoKinPost = async (
  authorId: string,
  postId: string,
  data: {
    text?: string;
    subject?: string | null;
    postType?: string;
    mediaUrls?: string[];
    location?: string | null;
    tags?: string[];
    hashtags?: string[];
    backgroundStyle?: string | null;
  }
) => {
  const post = await prisma.soKinPost.findUnique({ where: { id: postId } });

  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Publication introuvable");
  }
  if (post.authorId !== authorId) {
    throw new HttpError(403, "Non autorisé");
  }
  if (post.status !== "ACTIVE" && post.status !== "HIDDEN") {
    throw new HttpError(400, "Seules les publications actives ou masquées peuvent être modifiées");
  }
  if (post.repostOfId) {
    throw new HttpError(400, "Un repost ne peut pas être modifié");
  }

  // Construire le payload de mise à jour
  const updatePayload: Record<string, unknown> = {};

  if (data.text !== undefined) updatePayload.text = data.text;
  if (data.subject !== undefined) updatePayload.subject = data.subject;
  if (data.postType !== undefined) updatePayload.postType = data.postType as any;
  if (data.location !== undefined) updatePayload.location = data.location;
  if (data.tags !== undefined) updatePayload.tags = data.tags;
  if (data.hashtags !== undefined) updatePayload.hashtags = data.hashtags;
  if (data.backgroundStyle !== undefined) updatePayload.backgroundStyle = data.backgroundStyle;

  if (data.mediaUrls !== undefined) {
    const normalized = normalizeMediaUrls(data.mediaUrls);
    validatePostMediaUrls(normalized);
    updatePayload.mediaUrls = normalized;
  }

  // Valider contenu final (texte OU média)
  const finalText = data.text !== undefined ? data.text : post.text;
  const finalMedia = data.mediaUrls !== undefined
    ? normalizeMediaUrls(data.mediaUrls)
    : (post.mediaUrls as string[]);
  const finalBackgroundStyle = data.backgroundStyle !== undefined ? data.backgroundStyle : post.backgroundStyle;
  validatePostContent(finalText, finalMedia, finalBackgroundStyle ?? undefined);

  const updated = await prisma.soKinPost.update({
    where: { id: postId },
    data: { ...updatePayload, updatedAt: new Date() },
    include: {
      author: { include: { profile: true } },
    },
  });

  return updated;
};

/**
 * Reposte une publication existante.
 * Crée un nouveau post lié à l'original via repostOfId
 * et incrémente le compteur shares de l'original.
 *
 * ⚠️ Aplatit la chaîne : si on reposte un repost, le nouveau post
 * pointe directement sur la publication d'origine (pas sur le repost
 * intermédiaire). De ce fait l'auteur mentionné est toujours l'auteur
 * original, quelle que soit la profondeur de la chaîne.
 */
export const repostSoKinPost = async (
  userId: string,
  originalPostId: string,
  comment?: string
) => {
  const target = await prisma.soKinPost.findUnique({
    where: { id: originalPostId },
    select: { id: true, status: true, authorId: true, repostOfId: true },
  });

  if (!target || target.status !== "ACTIVE") {
    throw new HttpError(404, "Publication introuvable");
  }

  // Aplatir la chaîne : si la cible est un repost, remonter à la source
  let rootId = target.id;
  let rootAuthorId = target.authorId;
  if (target.repostOfId) {
    const root = await prisma.soKinPost.findUnique({
      where: { id: target.repostOfId },
      select: { id: true, status: true, authorId: true },
    });
    if (!root || root.status !== "ACTIVE") {
      throw new HttpError(404, "Publication d'origine introuvable");
    }
    rootId = root.id;
    rootAuthorId = root.authorId;
  }

  // Empêcher de reposter son propre post (même via un intermédiaire)
  if (rootAuthorId === userId) {
    throw new HttpError(400, "Vous ne pouvez pas reposter votre propre publication");
  }

  // Empêcher de reposter deux fois la même source
  const existing = await prisma.soKinPost.findFirst({
    where: { authorId: userId, repostOfId: rootId, status: { not: "DELETED" } },
  });
  if (existing) {
    throw new HttpError(409, "Vous avez déjà reposté cette publication");
  }

  const repost = await prisma.$transaction(async (tx) => {
    const newPost = await tx.soKinPost.create({
      data: {
        authorId: userId,
        postType: "SHOWCASE",
        text: comment?.trim() || "",
        mediaUrls: [],
        tags: [],
        hashtags: [],
        status: "ACTIVE",
        visibility: "PUBLIC",
        repostOfId: rootId,
      },
      include: {
        author: { include: { profile: true } },
        repostOf: {
          include: { author: { include: { profile: true } } },
        },
      },
    });

    // Incrémenter le compteur shares sur la publication d'origine
    await tx.soKinPost.update({
      where: { id: rootId },
      data: { shares: { increment: 1 } },
    });

    return newPost;
  });

  return repost;
};
