/**
 * SO-KIN AUTHOR INSIGHTS — API produit mobile-first
 *
 * Couche propre orientée produit au-dessus du moteur analytics So-Kin.
 * Chaque champ JSON est pensé pour un bloc UI mobile :
 * - label lisible directement affichable
 * - valeurs simples (pas 50 métriques)
 * - suggestion unique et actionnable
 *
 * Split gratuit / premium :
 * - FREE  : portée, engagement, commentaires, reposts, saves, potentiel, suggestion
 * - PREMIUM : + intérêt local, clics listing, clics DM, timing optimal, hashtags hot
 *
 * Ne casse rien — consomme le moteur sokin-analytics.service.ts existant.
 */

import { prisma } from "../../shared/db/prisma.js";
import { SubscriptionStatus } from "@prisma/client";

// ═══════════════════════════════════════════════════════
// TYPES — Contrat API
// ═══════════════════════════════════════════════════════

/** Suggestion actionnable unique */
export interface PostSuggestion {
  type: "BOOST" | "REPUBLISH" | "IMPROVE_TEXT" | "ADD_MEDIA" | "LINK_LISTING";
  message: string;
  actionLabel: string;
}

/** Insight d'un post unique — gratuit */
export interface PostInsightCard {
  postId: string;
  postType: string;
  publishedAt: string;
  reach:       { views: number; label: string };
  engagement:  { likes: number; comments: number; shares: number; rate: number; label: string };
  comments:    { total: number; replies: number; label: string };
  reposts:     { total: number; label: string };
  saves:       { total: number; label: string };
  potential:   { score: number; level: "ÉLEVÉ" | "BON" | "MOYEN" | "FAIBLE"; label: string };
  suggestion:  PostSuggestion;
  // Premium fields — null si non abonné
  localInterest: { city: string; viewsFromCity: number; label: string } | null;
  clicks:        { listings: number; profiles: number; contacts: number; label: string } | null;
  dmOpens:       { total: number; label: string } | null;
}

/** Dashboard auteur — gratuit */
export interface AuthorDashboard {
  period: "7d" | "30d";
  overview: {
    posts: number;
    views: number;
    engagementRate: number;
    avgPotential: number;
    label: string;
  };
  topPost: { id: string; type: string; views: number; label: string } | null;
  suggestion: PostSuggestion;
  // Premium — null si non abonné
  premium: AuthorDashboardPremium | null;
}

/** Bloc premium du dashboard auteur */
export interface AuthorDashboardPremium {
  bestTiming: { day: string; hour: string; label: string };
  hotHashtags: { hashtag: string; avgEngagement: number }[];
  topCity: { city: string; views: number; label: string } | null;
  socialVsBusiness: { social: number; business: number; profile: string; label: string };
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const PREMIUM_PLAN_CODES = new Set(["PRO_VENDOR", "BUSINESS", "SCALE"]);

async function isPremiumUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, businesses: { select: { id: true }, take: 1 } },
  });
  if (!user) return false;

  const isBusinessScope = user.role === "BUSINESS";
  const businessId = isBusinessScope ? user.businesses[0]?.id : null;

  const sub = await prisma.subscription.findFirst({
    where: {
      status: SubscriptionStatus.ACTIVE,
      ...(isBusinessScope && businessId ? { businessId } : { userId }),
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
    },
    select: { planCode: true },
  });
  return !!sub && PREMIUM_PLAN_CODES.has(sub.planCode.toUpperCase());
}

function formatHour(h: number): string {
  if (h >= 18) return `${h}h (soir)`;
  if (h >= 12) return `${h}h (après-midi)`;
  return `${h}h (matin)`;
}

function pickSuggestion(post: {
  text: string;
  mediaUrls: string[];
  hashtags: string[];
  likes: number;
  comments: number;
  views: number;
  boostScore: number;
  engagementRate: number;
  hasLinkedListing: boolean;
  ageHours: number;
}): PostSuggestion {
  // Priorité : le plus impactant d'abord

  // 1. Pas de média → ajouter
  if (post.mediaUrls.length === 0) {
    return {
      type: "ADD_MEDIA",
      message: "Les posts avec photo obtiennent 2× plus de vues. Ajoutez une image.",
      actionLabel: "Ajouter un média",
    };
  }

  // 2. Texte court → améliorer
  if (post.text.length < 40) {
    return {
      type: "IMPROVE_TEXT",
      message: "Un texte plus détaillé engage mieux. Décrivez votre offre ou posez une question.",
      actionLabel: "Modifier le texte",
    };
  }

  // 3. Bon engagement mais pas lié à un article → lier
  if (post.engagementRate >= 5 && !post.hasLinkedListing) {
    return {
      type: "LINK_LISTING",
      message: "Ce post attire l'attention. Liez un article pour convertir les vues en ventes.",
      actionLabel: "Lier un article",
    };
  }

  // 4. Fort potentiel → booster
  if (post.boostScore >= 40 && post.views >= 10) {
    return {
      type: "BOOST",
      message: "Ce post a un fort potentiel. Un boost augmenterait sa portée.",
      actionLabel: "Booster ce post",
    };
  }

  // 5. Post ancien avec bon engagement → republier
  if (post.ageHours > 72 && post.engagementRate >= 5) {
    return {
      type: "REPUBLISH",
      message: "Ce post a bien marché. Republiez un contenu similaire pour toucher de nouveaux lecteurs.",
      actionLabel: "Créer un nouveau post",
    };
  }

  // Fallback
  if (post.hashtags.length < 2) {
    return {
      type: "IMPROVE_TEXT",
      message: "Ajoutez 2-3 hashtags pour être découvert par plus de monde.",
      actionLabel: "Modifier le post",
    };
  }

  return {
    type: "BOOST",
    message: "Boostez ce post pour augmenter sa visibilité.",
    actionLabel: "Booster ce post",
  };
}

// ═══════════════════════════════════════════════════════
// 1. POST INSIGHT CARD
// ═══════════════════════════════════════════════════════

export async function getPostInsightCard(postId: string, userId: string): Promise<PostInsightCard | null> {
  const post = await prisma.soKinPost.findFirst({
    where: { id: postId, authorId: userId, status: "ACTIVE" },
    select: {
      id: true, postType: true, likes: true, comments: true, shares: true,
      createdAt: true, text: true, mediaUrls: true, hashtags: true,
      linkedListingId: true, location: true,
    },
  });
  if (!post) return null;

  const views = ((post as any).views ?? 0) as number;
  const socialScore = ((post as any).socialScore ?? 0) as number;
  const businessScore = ((post as any).businessScore ?? 0) as number;
  const boostScore = ((post as any).boostScore ?? 0) as number;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [bookmarkCount, replyCount, eventCounts, premium] = await Promise.all([
    prisma.soKinBookmark.count({ where: { postId } }),
    prisma.soKinComment.count({ where: { postId, parentCommentId: { not: null } } }),
    (prisma as any).soKinEvent.groupBy({
      by: ["event"],
      where: { postId, createdAt: { gte: since } },
      _count: { id: true },
    }) as Promise<{ event: string; _count: { id: number } }[]>,
    isPremiumUser(userId),
  ]);

  const evMap: Record<string, number> = {};
  for (const g of eventCounts) evMap[g.event] = g._count.id;

  const totalEng = post.likes + post.comments + post.shares + bookmarkCount;
  const engagementRate = views > 0 ? Math.round((totalEng / views) * 100) : 0;
  const ageHours = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);

  // Potential level
  let level: PostInsightCard["potential"]["level"];
  if (boostScore >= 70) level = "ÉLEVÉ";
  else if (boostScore >= 45) level = "BON";
  else if (boostScore >= 20) level = "MOYEN";
  else level = "FAIBLE";

  // Suggestion
  const suggestion = pickSuggestion({
    text: post.text,
    mediaUrls: post.mediaUrls,
    hashtags: post.hashtags,
    likes: post.likes,
    comments: post.comments,
    views,
    boostScore,
    engagementRate,
    hasLinkedListing: !!post.linkedListingId,
    ageHours,
  });

  // City views (premium) — on utilise l'index [city, event, createdAt]
  let localInterest: PostInsightCard["localInterest"] = null;
  let clicks: PostInsightCard["clicks"] = null;
  let dmOpens: PostInsightCard["dmOpens"] = null;

  if (premium) {
    // Intérêt local
    if (post.location) {
      const cityViews = await (prisma as any).soKinEvent.count({
        where: { postId, event: "VIEW", city: post.location },
      });
      localInterest = {
        city: post.location,
        viewsFromCity: cityViews,
        label: `${cityViews} vue${cityViews > 1 ? "s" : ""} depuis ${post.location}`,
      };
    }

    // Clics
    const totalClicks = (evMap["LISTING_CLICK"] ?? 0) + (evMap["PROFILE_CLICK"] ?? 0) + (evMap["CONTACT_CLICK"] ?? 0);
    clicks = {
      listings: evMap["LISTING_CLICK"] ?? 0,
      profiles: evMap["PROFILE_CLICK"] ?? 0,
      contacts: evMap["CONTACT_CLICK"] ?? 0,
      label: `${totalClicks} clic${totalClicks > 1 ? "s" : ""} vers vos contenus`,
    };

    // DM
    const dm = evMap["DM_OPEN"] ?? 0;
    dmOpens = {
      total: dm,
      label: `${dm} conversation${dm > 1 ? "s" : ""} ouverte${dm > 1 ? "s" : ""}`,
    };
  }

  return {
    postId,
    postType: post.postType,
    publishedAt: post.createdAt.toISOString(),
    reach: {
      views,
      label: `${views} vue${views > 1 ? "s" : ""}`,
    },
    engagement: {
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      rate: engagementRate,
      label: `${engagementRate}% d'engagement`,
    },
    comments: {
      total: post.comments,
      replies: replyCount,
      label: `${post.comments} commentaire${post.comments > 1 ? "s" : ""}`,
    },
    reposts: {
      total: post.shares,
      label: `${post.shares} partage${post.shares > 1 ? "s" : ""}`,
    },
    saves: {
      total: bookmarkCount,
      label: `${bookmarkCount} sauvegarde${bookmarkCount > 1 ? "s" : ""}`,
    },
    potential: {
      score: boostScore,
      level,
      label: `Score ${boostScore}/100`,
    },
    suggestion,
    localInterest,
    clicks,
    dmOpens,
  };
}

// ═══════════════════════════════════════════════════════
// 2. AUTHOR DASHBOARD
// ═══════════════════════════════════════════════════════

export async function getAuthorDashboard(
  userId: string,
  period: "7d" | "30d" = "7d",
): Promise<AuthorDashboard> {
  const days = period === "30d" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [posts, premium] = await Promise.all([
    prisma.soKinPost.findMany({
      where: { authorId: userId, status: "ACTIVE", createdAt: { gte: since } },
      select: {
        id: true, postType: true, likes: true, comments: true, shares: true,
        hashtags: true, location: true, createdAt: true,
        text: true, mediaUrls: true, linkedListingId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }) as Promise<any[]>,
    isPremiumUser(userId),
  ]);

  // Bookmarks batch
  const postIds = posts.map((p: any) => p.id);
  const bookmarkCounts = postIds.length > 0
    ? await prisma.soKinBookmark.groupBy({
        by: ["postId"],
        where: { postId: { in: postIds } },
        _count: { id: true },
      })
    : [];
  const bkMap = new Map(bookmarkCounts.map(b => [b.postId, b._count.id]));

  // Aggregates
  let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
  let totalBookmarks = 0, totalBoost = 0;

  for (const p of posts) {
    totalViews += p.views ?? 0;
    totalLikes += p.likes;
    totalComments += p.comments;
    totalShares += p.shares;
    totalBookmarks += bkMap.get(p.id) ?? 0;
    totalBoost += p.boostScore ?? 0;
  }

  const n = posts.length || 1;
  const totalEng = totalLikes + totalComments + totalShares + totalBookmarks;
  const engRate = totalViews > 0 ? Math.round((totalEng / totalViews) * 100) : 0;
  const avgPotential = Math.round(totalBoost / n);

  // Top post
  const sorted = [...posts].sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0));
  const top = sorted[0] ?? null;

  // Global suggestion
  let globalSuggestion: PostSuggestion;
  if (posts.length === 0) {
    globalSuggestion = {
      type: "IMPROVE_TEXT",
      message: "Publiez votre premier post So-Kin pour gagner en visibilité locale.",
      actionLabel: "Créer un post",
    };
  } else {
    const noMedia = posts.filter((p: any) => p.mediaUrls?.length === 0).length;
    const noListing = posts.filter((p: any) => !p.linkedListingId).length;

    if (noMedia > posts.length * 0.5) {
      globalSuggestion = {
        type: "ADD_MEDIA",
        message: "La majorité de vos posts n'ont pas de photo. Ajoutez des visuels pour doubler vos vues.",
        actionLabel: "Ajouter des médias",
      };
    } else if (engRate < 3 && posts.length >= 3) {
      globalSuggestion = {
        type: "IMPROVE_TEXT",
        message: "Votre engagement est faible. Posez des questions ou partagez des avis.",
        actionLabel: "Améliorer vos posts",
      };
    } else if (noListing > posts.length * 0.7 && engRate >= 5) {
      globalSuggestion = {
        type: "LINK_LISTING",
        message: "Vos posts engagent bien. Liez vos articles pour convertir les vues en ventes.",
        actionLabel: "Lier un article",
      };
    } else if (avgPotential >= 40) {
      globalSuggestion = {
        type: "BOOST",
        message: "Votre contenu a un bon potentiel. Boostez vos meilleurs posts.",
        actionLabel: "Booster un post",
      };
    } else {
      globalSuggestion = {
        type: "REPUBLISH",
        message: "Continuez à publier régulièrement pour augmenter votre visibilité.",
        actionLabel: "Créer un post",
      };
    }
  }

  // ── Premium bloc ──
  let premiumBloc: AuthorDashboardPremium | null = null;

  if (premium && posts.length > 0) {
    // Timing
    const hourBuckets = new Array(24).fill(0).map(() => ({ total: 0, count: 0 }));
    const dayBuckets = new Array(7).fill(0).map(() => ({ total: 0, count: 0 }));
    for (const p of posts) {
      const d = new Date(p.createdAt);
      const eng = p.likes + p.comments + p.shares;
      hourBuckets[d.getHours()].total += eng;
      hourBuckets[d.getHours()].count++;
      dayBuckets[d.getDay()].total += eng;
      dayBuckets[d.getDay()].count++;
    }
    const bestHour = hourBuckets
      .map((b, i) => ({ h: i, avg: b.count > 0 ? b.total / b.count : 0 }))
      .reduce((best, cur) => cur.avg > best.avg ? cur : best);
    const bestDay = dayBuckets
      .map((b, i) => ({ d: i, avg: b.count > 0 ? b.total / b.count : 0 }))
      .reduce((best, cur) => cur.avg > best.avg ? cur : best);

    // Hashtags hot
    const hashMap = new Map<string, { uses: number; engagement: number }>();
    for (const p of posts) {
      for (const h of (p.hashtags as string[])) {
        const norm = h.toLowerCase().startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`;
        const prev = hashMap.get(norm) ?? { uses: 0, engagement: 0 };
        prev.uses++;
        prev.engagement += p.likes + p.comments + p.shares;
        hashMap.set(norm, prev);
      }
    }
    const hotHashtags = Array.from(hashMap.entries())
      .map(([tag, d]) => ({ hashtag: tag, avgEngagement: d.uses > 0 ? Math.round(d.engagement / d.uses) : 0 }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 5);

    // Top city
    const cityMap = new Map<string, number>();
    for (const p of posts) {
      if (p.location) {
        cityMap.set(p.location, (cityMap.get(p.location) ?? 0) + (p.views ?? 0));
      }
    }
    const topCityEntry = Array.from(cityMap.entries()).sort((a, b) => b[1] - a[1])[0];

    // Social vs Business
    const avgSocial = Math.round(posts.reduce((s: number, p: any) => s + (p.socialScore ?? 0), 0) / n);
    const avgBiz = Math.round(posts.reduce((s: number, p: any) => s + (p.businessScore ?? 0), 0) / n);
    let profile: string;
    if (avgSocial > avgBiz * 1.5) profile = "Social";
    else if (avgBiz > avgSocial * 1.5) profile = "Business";
    else profile = "Équilibré";

    premiumBloc = {
      bestTiming: {
        day: DAY_NAMES[bestDay.d],
        hour: formatHour(bestHour.h),
        label: `Publiez le ${DAY_NAMES[bestDay.d]} vers ${formatHour(bestHour.h)}`,
      },
      hotHashtags,
      topCity: topCityEntry ? {
        city: topCityEntry[0],
        views: topCityEntry[1],
        label: `${topCityEntry[1]} vues depuis ${topCityEntry[0]}`,
      } : null,
      socialVsBusiness: {
        social: avgSocial,
        business: avgBiz,
        profile,
        label: `Profil ${profile} (social ${avgSocial} / business ${avgBiz})`,
      },
    };
  }

  return {
    period,
    overview: {
      posts: posts.length,
      views: totalViews,
      engagementRate: engRate,
      avgPotential,
      label: `${posts.length} post${posts.length > 1 ? "s" : ""} · ${totalViews} vues · ${engRate}% engagement`,
    },
    topPost: top ? {
      id: top.id,
      type: top.postType,
      views: top.views ?? 0,
      label: `Meilleur post : ${top.views ?? 0} vues (${top.postType})`,
    } : null,
    suggestion: globalSuggestion,
    premium: premiumBloc,
  };
}
