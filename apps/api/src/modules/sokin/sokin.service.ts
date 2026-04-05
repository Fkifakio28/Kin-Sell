import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { normalizeImageInputs } from "../../shared/utils/media-storage.js";
import { resolveCountryTerms } from "../../shared/geo/country-aliases.js";

// Lightweight include: no reactions array (fetched separately via groupBy)
const publicPostInclude = {
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
};

// Heavy include kept for single-post fetches where N+1 doesn't matter
const publicPostIncludeFull = {
  ...publicPostInclude,
  reactions: {
    select: { type: true, userId: true },
  },
};

const mapPublicPost = (
  post: {
    reactions: Array<{ type: string; userId: string }>;
  } & Record<string, any>,
  viewerUserId?: string
) => {
  const reactionCounts: Record<string, number> = {};
  let myReaction: string | null = null;
  for (const reaction of post.reactions) {
    reactionCounts[reaction.type] = (reactionCounts[reaction.type] ?? 0) + 1;
    if (viewerUserId && reaction.userId === viewerUserId) {
      myReaction = reaction.type;
    }
  }
  const { reactions: _reactions, ...rest } = post;
  return { ...rest, reactionCounts, myReaction };
};

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
  hashtags?: string[],
  scheduledAt?: Date
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
      scheduledAt: scheduledAt || null,
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

export const getPublicFeed = async (limit = 20, viewerUserId?: string, city?: string, country?: string) => {
  const countryTerms = resolveCountryTerms(country);
  const andClauses: Record<string, unknown>[] = [];

  const cityClause = city
    ? {
        OR: [
          { location: { contains: city, mode: "insensitive" as const } },
          {
            author: {
              profile: {
                is: {
                  city: { contains: city, mode: "insensitive" as const },
                },
              },
            },
          },
        ],
      }
    : undefined;

  if (cityClause) {
    andClauses.push(cityClause);
  }

  const countryClause = countryTerms.length > 0
    ? {
        OR: [
          ...countryTerms.map((term) => ({ location: { contains: term, mode: "insensitive" as const } })),
          {
            author: {
              profile: {
                is: {
                  OR: countryTerms.map((term) => ({
                    country: { contains: term, mode: "insensitive" as const },
                  })),
                },
              },
            },
          },
        ],
      }
    : undefined;

  if (countryClause) {
    andClauses.push(countryClause);
  }

  // Build the geo-filter block, but always include the viewer's own posts
  const scheduleClause = { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] };
  const andFilters: Record<string, unknown>[] = [scheduleClause];

  if (andClauses.length > 0) {
    if (viewerUserId) {
      andFilters.push({ OR: [{ authorId: viewerUserId }, { AND: andClauses }] });
    } else {
      andFilters.push(...andClauses);
    }
  }

  const posts = await prisma.soKinPost.findMany({
    where: {
      status: "ACTIVE",
      AND: andFilters,
      author: {
        role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: publicPostInclude,
  });

  // Single grouped query for all reaction counts instead of loading all reactions per post
  const postIds = posts.map((p) => p.id);
  const [reactionGroups, viewerReactions] = await Promise.all([
    postIds.length > 0
      ? prisma.soKinReaction.groupBy({
          by: ["postId", "type"],
          where: { postId: { in: postIds } },
          _count: { id: true },
        })
      : Promise.resolve([]),
    viewerUserId && postIds.length > 0
      ? prisma.soKinReaction.findMany({
          where: { postId: { in: postIds }, userId: viewerUserId },
          select: { postId: true, type: true },
        })
      : Promise.resolve([]),
  ]);

  // Build lookup maps
  const countsByPost = new Map<string, Record<string, number>>();
  for (const g of reactionGroups) {
    const existing = countsByPost.get(g.postId) ?? {};
    existing[g.type] = g._count.id;
    countsByPost.set(g.postId, existing);
  }
  const viewerReactionMap = new Map(viewerReactions.map((r) => [r.postId, r.type]));

  return posts.map((post) => {
    const { ...rest } = post;
    return {
      ...rest,
      reactionCounts: countsByPost.get(post.id) ?? {},
      myReaction: viewerReactionMap.get(post.id) ?? null,
    };
  });
};

export const getPublicPostById = async (postId: string, viewerUserId?: string) => {
  const post = await prisma.soKinPost.findFirst({
    where: {
      id: postId,
      status: "ACTIVE",
      author: {
        role: { notIn: ["ADMIN", "SUPER_ADMIN"] },
      },
    },
    include: publicPostIncludeFull,
  });

  if (!post) {
    throw new HttpError(404, "Publication introuvable");
  }

  return mapPublicPost(post, viewerUserId);
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

export const sharePost = async (postId: string) => {
  const post = await prisma.soKinPost.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true, status: true },
  });
  if (!post || post.status === "DELETED") {
    throw new HttpError(404, "Publication introuvable");
  }

  const updated = await prisma.soKinPost.update({
    where: { id: postId },
    data: { shares: { increment: 1 } },
    select: { shares: true },
  });

  return { ok: true, shares: updated.shares, authorId: post.authorId };
};

export const getPublicUsers = async (
  city?: string,
  search?: string,
  limit = 100,
  country?: string
) => {
  const countryTerms = resolveCountryTerms(country);
  const andClauses: Record<string, unknown>[] = [];

  if (countryTerms.length > 0) {
    andClauses.push({
      OR: countryTerms.map((term) => ({
        country: { contains: term, mode: "insensitive" as const },
      })),
    });
  }

  if (search) {
    andClauses.push({
      OR: [
        { displayName: { contains: search, mode: "insensitive" as const } },
        { username: { contains: search, mode: "insensitive" as const } },
        { city: { contains: search, mode: "insensitive" as const } },
        { domain: { contains: search, mode: "insensitive" as const } },
      ],
    });
  }

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
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
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
