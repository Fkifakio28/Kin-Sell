/**
 * SO-KIN ANALYTICS SERVICE — Insights de publication So-Kin
 *
 * Moteur d'analytics dédié aux publications So-Kin.
 * Produit des insights actionnables pour aider les auteurs à :
 * - comprendre la performance de leurs posts
 * - identifier les meilleurs types/hashtags/heures
 * - comparer potentiel social vs business
 * - recevoir des suggestions d'amélioration concrètes
 *
 * Cohérent avec l'existant analytics (même structure tier, même patterns).
 * Données issues de : SoKinPost, SoKinEvent, SoKinReaction, SoKinComment, SoKinBookmark
 *
 * Routes exposées dans sokin-trends.routes.ts (même espace /sokin/trends/).
 */

import { prisma } from "../../shared/db/prisma.js";

// ═══════════════════════════════════════════════════════
// Types publics
// ═══════════════════════════════════════════════════════

/** Performance détaillée d'un post unique */
export interface PostPerformance {
  postId: string;
  postType: string;
  ageHours: number;
  // Métriques brutes
  views: number;
  likes: number;
  comments: number;
  shares: number;
  bookmarks: number;
  reactionTypes: number;
  replies: number;
  // Taux
  engagementRate: number;         // (likes+comments+shares+bookmarks) / views %
  commentDepthRate: number;       // replies / comments %
  saveRate: number;               // bookmarks / views %
  // Scores V1
  socialScore: number;
  businessScore: number;
  boostScore: number;
  // Événements tracking
  profileClicks: number;
  listingClicks: number;
  contactClicks: number;
  dmOpens: number;
  // Verdict
  verdict: "VIRAL" | "PERFORMANT" | "MOYEN" | "FAIBLE";
  tips: string[];
}

/** Performance par type de post */
export interface TypePerformance {
  postType: string;
  postCount: number;
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  avgEngagementRate: number;
  avgSocialScore: number;
  avgBusinessScore: number;
  trend: "UP" | "STABLE" | "DOWN";
}

/** Performance par ville */
export interface CityPerformance {
  city: string;
  postCount: number;
  totalViews: number;
  avgEngagementRate: number;
  avgSocialScore: number;
  topPostType: string | null;
}

/** Performance par hashtag */
export interface HashtagPerformance {
  hashtag: string;
  usageCount: number;
  avgViews: number;
  avgEngagement: number;
  trend: "HOT" | "STABLE" | "COLD";
}

/** Meilleurs moments de publication */
export interface TimingInsight {
  bestHour: number;
  bestDay: number;                // 0=dimanche, 1=lundi...
  hourBreakdown: { hour: number; avgEngagement: number }[];
  dayBreakdown: { day: number; avgEngagement: number }[];
}

/** Social vs Business comparaison */
export interface SocialVsBusinessInsight {
  avgSocialScore: number;
  avgBusinessScore: number;
  dominantProfile: "SOCIAL" | "BUSINESS" | "BALANCED";
  socialTopType: string | null;
  businessTopType: string | null;
  recommendation: string;
}

/** Vue d'ensemble auteur : "My So-Kin Analytics" */
export interface AuthorSoKinInsights {
  period: "7d" | "30d";
  summary: {
    totalPosts: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalBookmarks: number;
    avgEngagementRate: number;
    avgSocialScore: number;
    avgBusinessScore: number;
    avgBoostScore: number;
  };
  topPost: { id: string; type: string; views: number; socialScore: number } | null;
  typePerformance: TypePerformance[];
  cityPerformance: CityPerformance[];
  hashtagPerformance: HashtagPerformance[];
  timing: TimingInsight;
  socialVsBusiness: SocialVsBusinessInsight;
  recommendations: string[];
}

/** Tendances So-Kin globales (pas liées à un auteur) */
export interface SoKinTrendsInsight {
  period: "7d";
  topHashtags: HashtagPerformance[];
  topTypes: TypePerformance[];
  topCities: CityPerformance[];
  emergingHashtags: string[];
  hotPosts: { id: string; authorId: string; boostScore: number; socialScore: number }[];
}

// ═══════════════════════════════════════════════════════
// 1. Performance d'un post unique
// ═══════════════════════════════════════════════════════

export async function getPostPerformance(postId: string, userId: string): Promise<PostPerformance | null> {
  const post = await prisma.soKinPost.findFirst({
    where: { id: postId, authorId: userId, status: "ACTIVE" },
    select: {
      id: true, postType: true, likes: true, comments: true, shares: true,
      createdAt: true, text: true, mediaUrls: true, hashtags: true,
    },
  });
  if (!post) return null;

  const views = ((post as any).views ?? 0) as number;
  const socialScore = ((post as any).socialScore ?? 0) as number;
  const businessScore = ((post as any).businessScore ?? 0) as number;
  const boostScore = ((post as any).boostScore ?? 0) as number;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [bookmarks, reactionTypes, replies, eventCounts] = await Promise.all([
    prisma.soKinBookmark.count({ where: { postId } }),
    prisma.soKinReaction.findMany({
      where: { postId },
      select: { type: true },
      distinct: ["type"],
    }),
    prisma.soKinComment.count({ where: { postId, parentCommentId: { not: null } } }),
    (prisma as any).soKinEvent.groupBy({
      by: ["event"],
      where: { postId, createdAt: { gte: since } },
      _count: { id: true },
    }) as Promise<{ event: string; _count: { id: number } }[]>,
  ]);

  const evMap: Record<string, number> = {};
  for (const g of eventCounts) evMap[g.event] = g._count.id;

  const totalEngagement = post.likes + post.comments + post.shares + bookmarks;
  const engagementRate = views > 0 ? Math.round((totalEngagement / views) * 100) : 0;
  const commentDepthRate = post.comments > 0 ? Math.round((replies / post.comments) * 100) : 0;
  const saveRate = views > 0 ? Math.round((bookmarks / views) * 100) : 0;
  const ageHours = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);

  // Verdict
  let verdict: PostPerformance["verdict"];
  if (socialScore >= 70 || (views >= 100 && engagementRate >= 15)) verdict = "VIRAL";
  else if (socialScore >= 40 || engagementRate >= 8) verdict = "PERFORMANT";
  else if (socialScore >= 20 || engagementRate >= 3) verdict = "MOYEN";
  else verdict = "FAIBLE";

  // Tips
  const tips: string[] = [];
  if (post.mediaUrls.length === 0) tips.push("Ajoutez des photos — les posts visuels ont 2× plus de vues.");
  if (post.hashtags.length < 2) tips.push("Utilisez 2-3 hashtags pour gagner en découvrabilité.");
  if (post.text.length < 50) tips.push("Un texte de 50+ caractères engage mieux les lecteurs.");
  if (commentDepthRate < 20 && post.comments >= 3) tips.push("Répondez aux commentaires pour stimuler la conversation.");
  if (engagementRate > 10 && boostScore >= 40) tips.push("Ce post performe bien — un boost amplifierait sa portée.");
  if (post.likes > 5 && bookmarks === 0) tips.push("Demandez à vos lecteurs de sauvegarder le post pour le retrouver.");

  return {
    postId, postType: post.postType, ageHours,
    views, likes: post.likes, comments: post.comments, shares: post.shares,
    bookmarks, reactionTypes: reactionTypes.length, replies,
    engagementRate, commentDepthRate, saveRate,
    socialScore, businessScore, boostScore,
    profileClicks: evMap["PROFILE_CLICK"] ?? 0,
    listingClicks: evMap["LISTING_CLICK"] ?? 0,
    contactClicks: evMap["CONTACT_CLICK"] ?? 0,
    dmOpens: evMap["DM_OPEN"] ?? 0,
    verdict, tips,
  };
}

// ═══════════════════════════════════════════════════════
// 2-10. Insights auteur complets
// ═══════════════════════════════════════════════════════

export async function getAuthorSoKinInsights(
  userId: string,
  period: "7d" | "30d" = "7d",
): Promise<AuthorSoKinInsights> {
  const days = period === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Fetch all author active posts in period
  const posts = await prisma.soKinPost.findMany({
    where: { authorId: userId, status: "ACTIVE", createdAt: { gte: since } },
    select: {
      id: true, postType: true, likes: true, comments: true, shares: true,
      hashtags: true, location: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  }) as any[];

  // Bookmark counts for these posts
  const postIds = posts.map((p: any) => p.id);
  const bookmarkCounts = postIds.length > 0
    ? await prisma.soKinBookmark.groupBy({
        by: ["postId"],
        where: { postId: { in: postIds } },
        _count: { id: true },
      })
    : [];
  const bookmarkMap = new Map(bookmarkCounts.map(b => [b.postId, b._count.id]));

  // Event aggregates per post
  const eventAgg: { postId: string; event: string; _count: { id: number } }[] = postIds.length > 0
    ? await (prisma as any).soKinEvent.groupBy({
        by: ["postId", "event"],
        where: { postId: { in: postIds }, createdAt: { gte: since } },
        _count: { id: true },
      })
    : [];
  const eventMap = new Map<string, Record<string, number>>();
  for (const e of eventAgg) {
    if (!eventMap.has(e.postId)) eventMap.set(e.postId, {});
    eventMap.get(e.postId)![e.event] = e._count.id;
  }

  // ── Summary ──
  let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
  let totalBookmarks = 0, totalSocial = 0, totalBusiness = 0, totalBoost = 0;

  for (const p of posts) {
    const v = p.views ?? 0;
    const bk = bookmarkMap.get(p.id) ?? 0;
    totalViews += v;
    totalLikes += p.likes;
    totalComments += p.comments;
    totalShares += p.shares;
    totalBookmarks += bk;
    totalSocial += p.socialScore ?? 0;
    totalBusiness += p.businessScore ?? 0;
    totalBoost += p.boostScore ?? 0;
  }

  const n = posts.length || 1;
  const totalEng = totalLikes + totalComments + totalShares + totalBookmarks;
  const avgEngRate = totalViews > 0 ? Math.round((totalEng / totalViews) * 100) : 0;

  // ── Top post ──
  const topPost = posts.length > 0
    ? posts.sort((a: any, b: any) => (b.boostScore ?? 0) - (a.boostScore ?? 0))[0]
    : null;

  // ── Type performance (#3) ──
  const typeMap = new Map<string, any[]>();
  for (const p of posts) {
    if (!typeMap.has(p.postType)) typeMap.set(p.postType, []);
    typeMap.get(p.postType)!.push(p);
  }

  const typePerformance: TypePerformance[] = Array.from(typeMap.entries()).map(([type, typePosts]) => {
    const count = typePosts.length;
    const avgV = Math.round(typePosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0) / count);
    const avgL = Math.round(typePosts.reduce((s: number, p: any) => s + p.likes, 0) / count);
    const avgC = Math.round(typePosts.reduce((s: number, p: any) => s + p.comments, 0) / count);
    const totV = typePosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
    const totE = typePosts.reduce((s: number, p: any) => s + p.likes + p.comments + p.shares, 0);
    const avgEng = totV > 0 ? Math.round((totE / totV) * 100) : 0;
    const avgSS = Math.round(typePosts.reduce((s: number, p: any) => s + (p.socialScore ?? 0), 0) / count);
    const avgBS = Math.round(typePosts.reduce((s: number, p: any) => s + (p.businessScore ?? 0), 0) / count);
    return {
      postType: type, postCount: count, avgViews: avgV, avgLikes: avgL,
      avgComments: avgC, avgEngagementRate: avgEng,
      avgSocialScore: avgSS, avgBusinessScore: avgBS,
      trend: count >= 3 && avgEng >= 8 ? "UP" as const : avgEng >= 3 ? "STABLE" as const : "DOWN" as const,
    };
  }).sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);

  // ── City performance (#4) ──
  const cityMap = new Map<string, any[]>();
  for (const p of posts) {
    const city = p.location || "Non spécifié";
    if (!cityMap.has(city)) cityMap.set(city, []);
    cityMap.get(city)!.push(p);
  }

  const cityPerformance: CityPerformance[] = Array.from(cityMap.entries()).map(([city, cityPosts]) => {
    const count = cityPosts.length;
    const totV = cityPosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
    const totE = cityPosts.reduce((s: number, p: any) => s + p.likes + p.comments + p.shares, 0);
    const avgEng = totV > 0 ? Math.round((totE / totV) * 100) : 0;
    const avgSS = Math.round(cityPosts.reduce((s: number, p: any) => s + (p.socialScore ?? 0), 0) / count);
    const typeCounts: Record<string, number> = {};
    for (const p of cityPosts) typeCounts[p.postType] = (typeCounts[p.postType] ?? 0) + 1;
    const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { city, postCount: count, totalViews: totV, avgEngagementRate: avgEng, avgSocialScore: avgSS, topPostType: topType };
  }).sort((a, b) => b.totalViews - a.totalViews);

  // ── Hashtag performance (#5) ──
  const hashMap = new Map<string, { uses: number; views: number; engagement: number }>();
  for (const p of posts) {
    for (const h of (p.hashtags as string[])) {
      const norm = h.toLowerCase().startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`;
      const prev = hashMap.get(norm) ?? { uses: 0, views: 0, engagement: 0 };
      prev.uses++;
      prev.views += p.views ?? 0;
      prev.engagement += p.likes + p.comments + p.shares;
      hashMap.set(norm, prev);
    }
  }

  const hashtagPerformance: HashtagPerformance[] = Array.from(hashMap.entries())
    .map(([hashtag, data]) => ({
      hashtag,
      usageCount: data.uses,
      avgViews: Math.round(data.views / data.uses),
      avgEngagement: Math.round(data.engagement / data.uses),
      trend: data.uses >= 3 && data.engagement / data.uses >= 5 ? "HOT" as const
        : data.engagement / data.uses >= 2 ? "STABLE" as const : "COLD" as const,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 15);

  // ── Timing (#6) ──
  const hourBuckets = new Array(24).fill(0).map(() => ({ total: 0, count: 0 }));
  const dayBuckets = new Array(7).fill(0).map(() => ({ total: 0, count: 0 }));

  for (const p of posts) {
    const d = new Date(p.createdAt);
    const eng = p.likes + p.comments + p.shares;
    const h = d.getHours();
    const day = d.getDay();
    hourBuckets[h].total += eng;
    hourBuckets[h].count++;
    dayBuckets[day].total += eng;
    dayBuckets[day].count++;
  }

  const hourBreakdown = hourBuckets.map((b, i) => ({
    hour: i,
    avgEngagement: b.count > 0 ? Math.round(b.total / b.count) : 0,
  }));
  const dayBreakdown = dayBuckets.map((b, i) => ({
    day: i,
    avgEngagement: b.count > 0 ? Math.round(b.total / b.count) : 0,
  }));

  const bestHour = hourBreakdown.reduce((best, h) => h.avgEngagement > best.avgEngagement ? h : best, hourBreakdown[0]);
  const bestDay = dayBreakdown.reduce((best, d) => d.avgEngagement > best.avgEngagement ? d : best, dayBreakdown[0]);

  const timing: TimingInsight = {
    bestHour: bestHour.hour,
    bestDay: bestDay.day,
    hourBreakdown,
    dayBreakdown,
  };

  // ── Social vs Business (#7, #8) ──
  const avgSocial = Math.round(totalSocial / n);
  const avgBusiness = Math.round(totalBusiness / n);

  let dominantProfile: SocialVsBusinessInsight["dominantProfile"];
  if (avgSocial > avgBusiness * 1.5) dominantProfile = "SOCIAL";
  else if (avgBusiness > avgSocial * 1.5) dominantProfile = "BUSINESS";
  else dominantProfile = "BALANCED";

  // Best type per dimension
  const socialTopType = typePerformance.sort((a, b) => b.avgSocialScore - a.avgSocialScore)[0]?.postType ?? null;
  const businessTopType = typePerformance.sort((a, b) => b.avgBusinessScore - a.avgBusinessScore)[0]?.postType ?? null;

  let socialVsRecommendation: string;
  if (dominantProfile === "SOCIAL") {
    socialVsRecommendation = "Vos posts génèrent beaucoup d'engagement social. Reliez vos articles pour convertir cette visibilité en ventes.";
  } else if (dominantProfile === "BUSINESS") {
    socialVsRecommendation = "Vos posts ont un fort potentiel business. Ajoutez du contenu social (questions, discussions) pour diversifier votre audience.";
  } else {
    socialVsRecommendation = "Bon équilibre social/business. Continuez à mixer les types de posts pour couvrir les deux dimensions.";
  }

  const socialVsBusiness: SocialVsBusinessInsight = {
    avgSocialScore: avgSocial,
    avgBusinessScore: avgBusiness,
    dominantProfile,
    socialTopType,
    businessTopType,
    recommendation: socialVsRecommendation,
  };

  // ── Recommendations (#9, #10) ──
  const recommendations: string[] = [];

  if (posts.length === 0) {
    recommendations.push("Publiez votre premier post So-Kin pour commencer à gagner en visibilité locale.");
  } else {
    // Timing
    const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
    const hourLabel = bestHour.hour >= 18 ? `${bestHour.hour}h (soir)` : bestHour.hour >= 12 ? `${bestHour.hour}h (après-midi)` : `${bestHour.hour}h (matin)`;
    recommendations.push(`Publiez le ${DAY_NAMES[bestDay.day]} vers ${hourLabel} pour maximiser l'engagement.`);

    // Type
    if (typePerformance.length > 0 && typePerformance[0].avgEngagementRate >= 5) {
      recommendations.push(`Vos posts "${typePerformance[0].postType}" performent le mieux — publiez-en davantage.`);
    }

    // Hashtags
    const hotHash = hashtagPerformance.filter(h => h.trend === "HOT");
    if (hotHash.length > 0) {
      recommendations.push(`Le hashtag ${hotHash[0].hashtag} est en feu — réutilisez-le dans vos prochains posts.`);
    }

    // Engagement
    if (avgEngRate < 3 && posts.length >= 3) {
      recommendations.push("Votre taux d'engagement est faible. Posez des questions ou partagez des avis pour stimuler les interactions.");
    }
    if (avgEngRate >= 10) {
      recommendations.push("Excellent engagement ! Un boost sur vos meilleurs posts pourrait multiplier votre audience.");
    }

    // Visual
    const noMedia = posts.filter((p: any) => p.mediaUrls?.length === 0).length;
    if (noMedia > posts.length * 0.5) {
      recommendations.push("Plus de la moitié de vos posts n'ont pas de média. Ajoutez des photos pour doubler vos vues.");
    }

    // City
    if (cityPerformance.length > 1) {
      const topCity = cityPerformance[0];
      recommendations.push(`Votre meilleure audience est à "${topCity.city}" — ciblez d'abord cette zone.`);
    }
  }

  return {
    period,
    summary: {
      totalPosts: posts.length,
      totalViews, totalLikes, totalComments, totalShares, totalBookmarks,
      avgEngagementRate: avgEngRate,
      avgSocialScore: avgSocial,
      avgBusinessScore: avgBusiness,
      avgBoostScore: Math.round(totalBoost / n),
    },
    topPost: topPost ? {
      id: topPost.id,
      type: topPost.postType,
      views: topPost.views ?? 0,
      socialScore: topPost.socialScore ?? 0,
    } : null,
    typePerformance,
    cityPerformance,
    hashtagPerformance,
    timing,
    socialVsBusiness,
    recommendations,
  };
}

// ═══════════════════════════════════════════════════════
// Tendances So-Kin globales
// ═══════════════════════════════════════════════════════

export async function getSoKinTrendsInsight(city?: string): Promise<SoKinTrendsInsight> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const prevSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    status: "ACTIVE",
    createdAt: { gte: since },
  };
  if (city) (where as any).location = { contains: city, mode: "insensitive" };

  const posts = await prisma.soKinPost.findMany({
    where: where as any,
    select: {
      id: true, postType: true, likes: true, comments: true, shares: true,
      hashtags: true, location: true, authorId: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  }) as any[];

  // Previous week hashtags for emerging detection
  const prevWhere: Record<string, unknown> = {
    status: "ACTIVE",
    createdAt: { gte: prevSince, lt: since },
  };
  if (city) (prevWhere as any).location = { contains: city, mode: "insensitive" };

  const prevPosts = await prisma.soKinPost.findMany({
    where: prevWhere as any,
    select: { hashtags: true },
    take: 500,
  });
  const prevHashSet = new Set<string>();
  for (const p of prevPosts) {
    for (const h of (p.hashtags as string[])) {
      prevHashSet.add(h.toLowerCase().startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`);
    }
  }

  // ── Hashtags ──
  const hashMap = new Map<string, { uses: number; views: number; engagement: number }>();
  for (const p of posts) {
    for (const h of (p.hashtags as string[])) {
      const norm = h.toLowerCase().startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`;
      const prev = hashMap.get(norm) ?? { uses: 0, views: 0, engagement: 0 };
      prev.uses++;
      prev.views += p.views ?? 0;
      prev.engagement += p.likes + p.comments + p.shares;
      hashMap.set(norm, prev);
    }
  }

  const topHashtags: HashtagPerformance[] = Array.from(hashMap.entries())
    .map(([hashtag, data]) => ({
      hashtag,
      usageCount: data.uses,
      avgViews: data.uses > 0 ? Math.round(data.views / data.uses) : 0,
      avgEngagement: data.uses > 0 ? Math.round(data.engagement / data.uses) : 0,
      trend: data.uses >= 5 && data.engagement / data.uses >= 5 ? "HOT" as const
        : data.engagement / data.uses >= 2 ? "STABLE" as const : "COLD" as const,
    }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 15);

  // Emerging = this week but NOT last week, with >= 3 uses
  const emergingHashtags = Array.from(hashMap.entries())
    .filter(([h, d]) => !prevHashSet.has(h) && d.uses >= 3)
    .sort((a, b) => b[1].uses - a[1].uses)
    .slice(0, 5)
    .map(([h]) => h);

  // ── Types ──
  const typeMap = new Map<string, any[]>();
  for (const p of posts) {
    if (!typeMap.has(p.postType)) typeMap.set(p.postType, []);
    typeMap.get(p.postType)!.push(p);
  }

  const topTypes: TypePerformance[] = Array.from(typeMap.entries()).map(([type, typePosts]) => {
    const count = typePosts.length;
    const totV = typePosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
    const totE = typePosts.reduce((s: number, p: any) => s + p.likes + p.comments + p.shares, 0);
    return {
      postType: type, postCount: count,
      avgViews: Math.round(totV / count),
      avgLikes: Math.round(typePosts.reduce((s: number, p: any) => s + p.likes, 0) / count),
      avgComments: Math.round(typePosts.reduce((s: number, p: any) => s + p.comments, 0) / count),
      avgEngagementRate: totV > 0 ? Math.round((totE / totV) * 100) : 0,
      avgSocialScore: Math.round(typePosts.reduce((s: number, p: any) => s + (p.socialScore ?? 0), 0) / count),
      avgBusinessScore: Math.round(typePosts.reduce((s: number, p: any) => s + (p.businessScore ?? 0), 0) / count),
      trend: count >= 5 ? "UP" as const : count >= 2 ? "STABLE" as const : "DOWN" as const,
    };
  }).sort((a, b) => b.postCount - a.postCount);

  // ── Cities ──
  const cityMap = new Map<string, any[]>();
  for (const p of posts) {
    const loc = p.location || "Non spécifié";
    if (!cityMap.has(loc)) cityMap.set(loc, []);
    cityMap.get(loc)!.push(p);
  }

  const topCities: CityPerformance[] = Array.from(cityMap.entries())
    .map(([loc, cityPosts]) => {
      const count = cityPosts.length;
      const totV = cityPosts.reduce((s: number, p: any) => s + (p.views ?? 0), 0);
      const totE = cityPosts.reduce((s: number, p: any) => s + p.likes + p.comments + p.shares, 0);
      const typeCounts: Record<string, number> = {};
      for (const p of cityPosts) typeCounts[p.postType] = (typeCounts[p.postType] ?? 0) + 1;
      const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        city: loc, postCount: count, totalViews: totV,
        avgEngagementRate: totV > 0 ? Math.round((totE / totV) * 100) : 0,
        avgSocialScore: Math.round(cityPosts.reduce((s: number, p: any) => s + (p.socialScore ?? 0), 0) / count),
        topPostType: topType,
      };
    })
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 10);

  // ── Hot posts (top boost) ──
  const hotPosts = posts
    .filter((p: any) => (p.boostScore ?? 0) >= 40)
    .sort((a: any, b: any) => (b.boostScore ?? 0) - (a.boostScore ?? 0))
    .slice(0, 10)
    .map((p: any) => ({
      id: p.id,
      authorId: p.authorId,
      boostScore: p.boostScore ?? 0,
      socialScore: p.socialScore ?? 0,
    }));

  return {
    period: "7d",
    topHashtags,
    topTypes,
    topCities,
    emergingHashtags,
    hotPosts,
  };
}
