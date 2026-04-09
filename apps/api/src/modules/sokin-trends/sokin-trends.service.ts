/**
 * So-Kin Trends Service — Tendances locales, profils suggérés, insights posts
 *
 * Données calculées en temps réel depuis les publications actives So-Kin.
 * Pas d'IA externe — pur rule-based sur les données Prisma.
 */

import { prisma } from "../../shared/db/prisma.js";

// ── Tendances locales ──

export interface TrendingTopic {
  tag: string;
  count: number;
  label: string;
  trend: "up" | "stable" | "new";
}

export interface TrendingHashtag {
  hashtag: string;
  count: number;
}

/**
 * Extraire les tendances locales : hashtags les plus utilisés + sujets populaires
 * Fenêtre : 7 derniers jours, filtrés par ville si fournie.
 */
export async function getTrending(city?: string, limit = 10) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    status: "ACTIVE",
    createdAt: { gte: since },
  };
  if (city) {
    where.location = { contains: city, mode: "insensitive" };
  }

  // Récupérer les posts récents avec hashtags
  const posts = await prisma.soKinPost.findMany({
    where: where as any,
    select: {
      hashtags: true,
      postType: true,
      likes: true,
      comments: true,
      shares: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Compter les hashtags
  const hashtagMap = new Map<string, number>();
  for (const post of posts) {
    for (const h of post.hashtags) {
      const normalized = h.toLowerCase().startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`;
      hashtagMap.set(normalized, (hashtagMap.get(normalized) ?? 0) + 1);
    }
  }

  const hashtags: TrendingHashtag[] = Array.from(hashtagMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([hashtag, count]) => ({ hashtag, count }));

  // Compter les types de posts comme "sujets"
  const typeMap = new Map<string, number>();
  for (const post of posts) {
    typeMap.set(post.postType, (typeMap.get(post.postType) ?? 0) + 1);
  }

  const TYPE_LABELS: Record<string, string> = {
    SHOWCASE: "Vitrine",
    DISCUSSION: "Discussion",
    QUESTION: "Question",
    SELLING: "Commerce",
    PROMO: "Promotions",
    SEARCH: "Recherche",
    UPDATE: "Actualité",
    REVIEW: "Avis",
    TREND: "Tendance",
  };

  const topics: TrendingTopic[] = Array.from(typeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({
      tag,
      count,
      label: TYPE_LABELS[tag] ?? tag,
      trend: count >= 10 ? "up" : count >= 3 ? "stable" : "new",
    }));

  return { topics, hashtags };
}

// ── Profils suggérés ──

export interface SuggestedProfile {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  postCount: number;
}

/**
 * Profils les plus actifs de la semaine écoulée dans la ville donnée.
 */
export async function getSuggestedProfiles(city?: string, limit = 5) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    status: "ACTIVE",
    createdAt: { gte: since },
  };
  if (city) {
    where.location = { contains: city, mode: "insensitive" };
  }

  // Compter les posts par auteur
  const grouped = await prisma.soKinPost.groupBy({
    by: ["authorId"],
    where: where as any,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit + 5, // marge pour dédup
  });

  if (grouped.length === 0) return { profiles: [] };

  const authorIds = grouped.map((g) => g.authorId);
  const users = await prisma.user.findMany({
    where: { id: { in: authorIds } },
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
  });

  const userMap = new Map(users.map((u) => [u.id, u]));
  const countMap = new Map(grouped.map((g) => [g.authorId, g._count.id]));

  const profiles: SuggestedProfile[] = users
    .filter((u) => u.profile)
    .slice(0, limit)
    .map((u) => ({
      userId: u.id,
      username: u.profile!.username,
      displayName: u.profile!.displayName ?? "Utilisateur",
      avatarUrl: u.profile!.avatarUrl,
      city: u.profile!.city,
      postCount: countMap.get(u.id) ?? 0,
    }));

  return { profiles };
}

// ── Post Insight (auteur only) ──

export interface PostInsight {
  postId: string;
  views: number;
  engagementRate: number;
  potentialScore: number;
  boostSuggested: boolean;
  tip: string | null;
}

/**
 * Insights basiques pour un post (vues simulées via likes+comments+shares, score de potentiel).
 * En production, les vues viendront d'un compteur dédié. Pour l'instant, estimation rule-based.
 */
export async function getPostInsight(postId: string, userId: string): Promise<PostInsight> {
  const post = await prisma.soKinPost.findFirst({
    where: { id: postId, authorId: userId, status: "ACTIVE" },
    select: {
      id: true,
      likes: true,
      comments: true,
      shares: true,
      // views: awaiting prisma generate (accessed via 'as any')
      mediaUrls: true,
      hashtags: true,
      text: true,
      postType: true,
      createdAt: true,
    },
  });

  if (!post) {
    return {
      postId,
      views: 0,
      engagementRate: 0,
      potentialScore: 0,
      boostSuggested: false,
      tip: null,
    };
  }

  // Vues réelles (champ views) avec fallback estimation
  const engagement = post.likes + post.comments + post.shares;
  const realViews = (post as any).views ?? 0;
  const estimatedViews = realViews > 0 ? realViews : Math.max(engagement * 8, 10);
  const engagementRate = estimatedViews > 0 ? Math.round((engagement / estimatedViews) * 100) : 0;

  // Score de potentiel (0-100)
  let potentialScore = 20; // base
  if (post.mediaUrls.length > 0) potentialScore += 20;
  if (post.hashtags.length >= 2) potentialScore += 15;
  if (post.text.length > 50) potentialScore += 10;
  if (engagement >= 5) potentialScore += 15;
  if (engagement >= 20) potentialScore += 10;
  if (["SELLING", "PROMO", "SHOWCASE"].includes(post.postType)) potentialScore += 10;
  potentialScore = Math.min(potentialScore, 100);

  // Suggestion de boost
  const boostSuggested = potentialScore >= 60 && engagement >= 3;

  // Tip contextuel
  let tip: string | null = null;
  if (post.mediaUrls.length === 0) tip = "Ajoutez des photos pour +40% d'engagement";
  else if (post.hashtags.length < 2) tip = "Ajoutez des hashtags pour plus de visibilité";
  else if (post.text.length < 30) tip = "Un texte plus détaillé attire plus de lecteurs";
  else if (boostSuggested) tip = "Ce post a du potentiel — un boost pourrait tripler sa portée";

  return {
    postId: post.id,
    views: estimatedViews,
    engagementRate,
    potentialScore,
    boostSuggested,
    tip,
  };
}
