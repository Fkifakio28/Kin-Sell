/**
 * SO-KIN SMART FEED SERVICE — Blocs secondaires intelligents
 *
 * Agrège les données de :
 * - SoKinPost + SoKinEvent (données brutes)
 * - sokin-scoring (scores social/business/boost)
 * - sokin-ads-advisor (opportunités boost via IA Ads)
 * - sokin-trends (tendances locales)
 * - sokin-analytics (performance par type/ville/hashtag)
 *
 * Produit 6 blocs secondaires pour le feed So-Kin :
 * 1. Tendances locales (hashtags + sujets qui montent)
 * 2. Hashtags chauds (classement + emerging)
 * 3. Idées de publication (basées sur ce qui performe)
 * 4. Opportunités de boost (via IA Ads)
 * 5. Formats qui performent (types de posts gagnants)
 * 6. Vue tendances combinée (tout en un pour le feed)
 *
 * Cache Redis : 10 min pour public, 5 min pour auth.
 * Toutes les données sont dérivées de vraies interactions.
 */

import { prisma } from "../../shared/db/prisma.js";
import { getRedis } from "../../shared/db/redis.js";
import { logger } from "../../shared/logger.js";
import {
  getTopBoostCandidates,
  getTopSocialPosts,
  getTopBusinessPosts,
} from "../sokin/sokin-scoring.service.js";
import { getAuthorTips } from "../ads/sokin-ads-advisor.service.js";

// ═══════════════════════════════════════════════════════
// Types publics
// ═══════════════════════════════════════════════════════

export interface HotHashtag {
  hashtag: string;
  posts7d: number;
  avgEngagement: number;
  velocity: "RISING" | "STEADY" | "NEW";
}

export interface TrendingTopic {
  topic: string;
  label: string;
  posts7d: number;
  engagement7d: number;
  momentum: "UP" | "STABLE" | "EMERGING";
}

export interface PublishIdea {
  id: string;
  type: "FORMAT" | "HASHTAG" | "TOPIC" | "TIMING" | "GEO";
  title: string;
  reason: string;
  actionLabel: string;
}

export interface BoostOpportunity {
  postId: string;
  authorId: string;
  boostScore: number;
  reason: string;
  actionLabel: string;
}

export interface WinningFormat {
  postType: string;
  label: string;
  posts7d: number;
  avgViews: number;
  avgEngagement: number;
  trend: "HOT" | "STABLE" | "COOL";
}

export interface SmartFeedBlocks {
  trendingTopics: TrendingTopic[];
  hotHashtags: HotHashtag[];
  publishIdeas: PublishIdea[];
  boostOpportunities: BoostOpportunity[];
  winningFormats: WinningFormat[];
  generatedAt: string;
}

export interface AuthorSmartSuggestions {
  publishIdeas: PublishIdea[];
  boostOpportunities: BoostOpportunity[];
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════
// Cache Redis
// ═══════════════════════════════════════════════════════

const CACHE_PREFIX = "sokin:smart:";
const PUBLIC_TTL = 600;   // 10 min
const AUTH_TTL = 300;     // 5 min

async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get(`${CACHE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setCache(key: string, data: unknown, ttl: number): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(`${CACHE_PREFIX}${key}`, JSON.stringify(data), "EX", ttl);
  } catch {
    // cache miss is not critical
  }
}

// ═══════════════════════════════════════════════════════
// 1. HASHTAGS CHAUDS
// ═══════════════════════════════════════════════════════

export async function getHotHashtags(city?: string, limit = 15): Promise<HotHashtag[]> {
  const cacheKey = `hashtags:${city ?? "all"}:${limit}`;
  const cached = await getFromCache<HotHashtag[]>(cacheKey);
  if (cached) return cached;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const prevSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = { status: "ACTIVE", createdAt: { gte: since } };
  if (city) (where as any).location = { contains: city, mode: "insensitive" };

  const prevWhere: Record<string, unknown> = { status: "ACTIVE", createdAt: { gte: prevSince, lt: since } };
  if (city) (prevWhere as any).location = { contains: city, mode: "insensitive" };

  const [posts, prevPosts] = await Promise.all([
    prisma.soKinPost.findMany({
      where: where as any,
      select: { hashtags: true, likes: true, comments: true, shares: true },
      take: 500,
    }),
    prisma.soKinPost.findMany({
      where: prevWhere as any,
      select: { hashtags: true },
      take: 500,
    }),
  ]);

  // Previous week set
  const prevSet = new Set<string>();
  for (const p of prevPosts) {
    for (const h of p.hashtags) {
      prevSet.add(h.toLowerCase().startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`);
    }
  }

  // This week aggregation
  const map = new Map<string, { count: number; engagement: number }>();
  for (const p of posts) {
    const eng = p.likes + p.comments + p.shares;
    for (const h of p.hashtags) {
      const norm = h.toLowerCase().startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`;
      const prev = map.get(norm) ?? { count: 0, engagement: 0 };
      prev.count++;
      prev.engagement += eng;
      map.set(norm, prev);
    }
  }

  // Previous week counts for velocity
  const prevCounts = new Map<string, number>();
  for (const p of prevPosts) {
    for (const h of p.hashtags) {
      const norm = h.toLowerCase().startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`;
      prevCounts.set(norm, (prevCounts.get(norm) ?? 0) + 1);
    }
  }

  const result: HotHashtag[] = Array.from(map.entries())
    .map(([hashtag, data]) => {
      const prevCount = prevCounts.get(hashtag) ?? 0;
      let velocity: HotHashtag["velocity"];
      if (!prevSet.has(hashtag)) velocity = "NEW";
      else if (data.count > prevCount * 1.5) velocity = "RISING";
      else velocity = "STEADY";

      return {
        hashtag,
        posts7d: data.count,
        avgEngagement: data.count > 0 ? Math.round(data.engagement / data.count) : 0,
        velocity,
      };
    })
    .sort((a, b) => b.posts7d - a.posts7d)
    .slice(0, limit);

  await setCache(cacheKey, result, PUBLIC_TTL);
  return result;
}

// ═══════════════════════════════════════════════════════
// 2. TENDANCES LOCALES (sujets qui montent)
// ═══════════════════════════════════════════════════════

export async function getTrendingTopics(city?: string, limit = 8): Promise<TrendingTopic[]> {
  const cacheKey = `topics:${city ?? "all"}:${limit}`;
  const cached = await getFromCache<TrendingTopic[]>(cacheKey);
  if (cached) return cached;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const prevSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = { status: "ACTIVE", createdAt: { gte: since } };
  if (city) (where as any).location = { contains: city, mode: "insensitive" };

  const prevWhere: Record<string, unknown> = { status: "ACTIVE", createdAt: { gte: prevSince, lt: since } };
  if (city) (prevWhere as any).location = { contains: city, mode: "insensitive" };

  const [posts, prevPosts] = await Promise.all([
    prisma.soKinPost.findMany({
      where: where as any,
      select: { postType: true, likes: true, comments: true, shares: true },
      take: 500,
    }),
    prisma.soKinPost.findMany({
      where: prevWhere as any,
      select: { postType: true },
      take: 500,
    }),
  ]);

  const TYPE_LABELS: Record<string, string> = {
    SHOWCASE: "Vitrine de produits",
    DISCUSSION: "Discussion communautaire",
    QUESTION: "Questions & avis",
    SELLING: "Vente directe",
    PROMO: "Promotions",
    SEARCH: "Recherche de produits",
    UPDATE: "Actualités",
    REVIEW: "Avis & témoignages",
    TREND: "Tendances",
  };

  // Current week
  const typeMap = new Map<string, { count: number; engagement: number }>();
  for (const p of posts) {
    const prev = typeMap.get(p.postType) ?? { count: 0, engagement: 0 };
    prev.count++;
    prev.engagement += p.likes + p.comments + p.shares;
    typeMap.set(p.postType, prev);
  }

  // Previous week
  const prevTypeMap = new Map<string, number>();
  for (const p of prevPosts) {
    prevTypeMap.set(p.postType, (prevTypeMap.get(p.postType) ?? 0) + 1);
  }

  const result: TrendingTopic[] = Array.from(typeMap.entries())
    .map(([topic, data]) => {
      const prevCount = prevTypeMap.get(topic) ?? 0;
      let momentum: TrendingTopic["momentum"];
      if (prevCount === 0 && data.count >= 3) momentum = "EMERGING";
      else if (data.count > prevCount * 1.3) momentum = "UP";
      else momentum = "STABLE";

      return {
        topic,
        label: TYPE_LABELS[topic] ?? topic,
        posts7d: data.count,
        engagement7d: data.engagement,
        momentum,
      };
    })
    .sort((a, b) => b.engagement7d - a.engagement7d)
    .slice(0, limit);

  await setCache(cacheKey, result, PUBLIC_TTL);
  return result;
}

// ═══════════════════════════════════════════════════════
// 3. FORMATS QUI PERFORMENT
// ═══════════════════════════════════════════════════════

export async function getWinningFormats(city?: string, limit = 6): Promise<WinningFormat[]> {
  const cacheKey = `formats:${city ?? "all"}:${limit}`;
  const cached = await getFromCache<WinningFormat[]>(cacheKey);
  if (cached) return cached;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = { status: "ACTIVE", createdAt: { gte: since } };
  if (city) (where as any).location = { contains: city, mode: "insensitive" };

  const posts = await prisma.soKinPost.findMany({
    where: where as any,
    select: { postType: true, likes: true, comments: true, shares: true },
    take: 500,
  }) as any[];

  const TYPE_LABELS: Record<string, string> = {
    SHOWCASE: "Vitrine",
    DISCUSSION: "Discussion",
    QUESTION: "Question",
    SELLING: "Vente",
    PROMO: "Promo",
    SEARCH: "Recherche",
    UPDATE: "Actu",
    REVIEW: "Avis",
    TREND: "Tendance",
  };

  const typeMap = new Map<string, { count: number; views: number; engagement: number }>();
  for (const p of posts) {
    const prev = typeMap.get(p.postType) ?? { count: 0, views: 0, engagement: 0 };
    prev.count++;
    prev.views += p.views ?? 0;
    prev.engagement += p.likes + p.comments + p.shares;
    typeMap.set(p.postType, prev);
  }

  const result: WinningFormat[] = Array.from(typeMap.entries())
    .map(([postType, data]) => {
      const avgEng = data.count > 0 ? Math.round(data.engagement / data.count) : 0;
      return {
        postType,
        label: TYPE_LABELS[postType] ?? postType,
        posts7d: data.count,
        avgViews: data.count > 0 ? Math.round(data.views / data.count) : 0,
        avgEngagement: avgEng,
        trend: avgEng >= 8 ? "HOT" as const : avgEng >= 3 ? "STABLE" as const : "COOL" as const,
      };
    })
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, limit);

  await setCache(cacheKey, result, PUBLIC_TTL);
  return result;
}

// ═══════════════════════════════════════════════════════
// 4. IDÉES DE PUBLICATION (pour auteurs connectés)
// ═══════════════════════════════════════════════════════

export async function getPublishIdeas(userId: string, city?: string): Promise<PublishIdea[]> {
  const cacheKey = `ideas:${userId}:${city ?? "all"}`;
  const cached = await getFromCache<PublishIdea[]>(cacheKey);
  if (cached) return cached;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Données parallèles : posts auteur + tendances globales + formats gagnants
  const [authorPosts, hotHashtags, winningFormats] = await Promise.all([
    prisma.soKinPost.findMany({
      where: { authorId: userId, status: "ACTIVE", createdAt: { gte: since } },
      select: { postType: true, hashtags: true, likes: true, comments: true, shares: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    getHotHashtags(city, 10),
    getWinningFormats(city, 5),
  ]);

  const ideas: PublishIdea[] = [];
  let idCounter = 1;

  // ── Idée 1 : Format que l'auteur n'utilise pas encore
  const authorTypes = new Set(authorPosts.map(p => p.postType as string));
  const missedFormat = winningFormats.find(f => !authorTypes.has(f.postType) && f.trend === "HOT");
  if (missedFormat) {
    ideas.push({
      id: String(idCounter++),
      type: "FORMAT",
      title: `Essayez le format "${missedFormat.label}"`,
      reason: `${missedFormat.posts7d} posts cette semaine avec ${missedFormat.avgEngagement} d'engagement moyen.`,
      actionLabel: "Créer un post",
    });
  }

  // ── Idée 2 : Hashtag tendance non utilisé par l'auteur
  const authorHashtags = new Set<string>();
  for (const p of authorPosts) {
    for (const h of p.hashtags) {
      authorHashtags.add(h.toLowerCase().startsWith("#") ? h.toLowerCase() : `#${h.toLowerCase()}`);
    }
  }
  const risingHash = hotHashtags.find(h => (h.velocity === "RISING" || h.velocity === "NEW") && !authorHashtags.has(h.hashtag));
  if (risingHash) {
    ideas.push({
      id: String(idCounter++),
      type: "HASHTAG",
      title: `Utilisez ${risingHash.hashtag}`,
      reason: `Ce hashtag ${risingHash.velocity === "NEW" ? "émerge" : "monte"} avec ${risingHash.posts7d} posts et ${risingHash.avgEngagement} d'engagement moyen.`,
      actionLabel: "Créer un post",
    });
  }

  // ── Idée 3 : Meilleur créneau horaire
  if (authorPosts.length >= 3) {
    const hourBuckets = new Array(24).fill(0).map(() => ({ total: 0, count: 0 }));
    for (const p of authorPosts) {
      const eng = p.likes + p.comments + p.shares;
      const h = new Date(p.createdAt).getHours();
      hourBuckets[h].total += eng;
      hourBuckets[h].count++;
    }
    const bestHour = hourBuckets
      .map((b, i) => ({ h: i, avg: b.count > 0 ? b.total / b.count : 0 }))
      .reduce((best, cur) => cur.avg > best.avg ? cur : best);

    if (bestHour.avg > 0) {
      const hourLabel = bestHour.h >= 18 ? `${bestHour.h}h (soir)` : bestHour.h >= 12 ? `${bestHour.h}h (après-midi)` : `${bestHour.h}h (matin)`;
      ideas.push({
        id: String(idCounter++),
        type: "TIMING",
        title: `Publiez vers ${hourLabel}`,
        reason: `Vos posts publiés à cette heure ont le meilleur engagement (${Math.round(bestHour.avg)} en moyenne).`,
        actionLabel: "Planifier un post",
      });
    }
  }

  // ── Idée 4 : Sujet populaire dans la ville
  if (city) {
    const cityPosts = await prisma.soKinPost.findMany({
      where: {
        status: "ACTIVE",
        createdAt: { gte: since },
        location: { contains: city, mode: "insensitive" },
      },
      select: { postType: true, likes: true, comments: true, shares: true },
      take: 200,
    });
    const cityTypeMap = new Map<string, number>();
    for (const p of cityPosts) {
      cityTypeMap.set(p.postType, (cityTypeMap.get(p.postType) ?? 0) + p.likes + p.comments + p.shares);
    }
    const topCityTopic = Array.from(cityTypeMap.entries())
      .filter(([t]) => !authorTypes.has(t as string))
      .sort((a, b) => b[1] - a[1])[0];

    if (topCityTopic) {
      ideas.push({
        id: String(idCounter++),
        type: "GEO",
        title: `"${topCityTopic[0]}" marche bien à ${city}`,
        reason: `Ce type de contenu génère le plus d'engagement local cette semaine.`,
        actionLabel: "Créer un post",
      });
    }
  }

  // ── Idée 5 : Republier un format gagnant
  if (authorPosts.length > 0) {
    const bestType = authorPosts
      .reduce((acc, p) => {
        const eng = p.likes + p.comments + p.shares;
        if (!acc.type || eng > acc.maxEng) return { type: p.postType, maxEng: eng };
        return acc;
      }, { type: "" as string, maxEng: 0 });

    if (bestType.type && bestType.maxEng >= 3) {
      ideas.push({
        id: String(idCounter++),
        type: "TOPIC",
        title: `Réutilisez le format "${bestType.type}"`,
        reason: `C'est votre meilleur format cette semaine (${bestType.maxEng} interactions sur votre meilleur post).`,
        actionLabel: "Créer un post similaire",
      });
    }
  }

  const result = ideas.slice(0, 5);
  await setCache(cacheKey, result, AUTH_TTL);
  return result;
}

// ═══════════════════════════════════════════════════════
// 5. OPPORTUNITÉS DE BOOST (via IA Ads)
// ═══════════════════════════════════════════════════════

export async function getBoostOpportunities(userId: string, limit = 5): Promise<BoostOpportunity[]> {
  const cacheKey = `boost:${userId}:${limit}`;
  const cached = await getFromCache<BoostOpportunity[]>(cacheKey);
  if (cached) return cached;

  // Source 1 : tips IA Ads déjà persitées
  const tips = await getAuthorTips(userId, limit);
  const fromTips: BoostOpportunity[] = tips
    .filter((t: any) => t.actionType === "BOOST_POST" || t.triggerType?.includes("BOOST"))
    .slice(0, 3)
    .map((t: any) => ({
      postId: (t.actionData as any)?.postId ?? t.actionTarget ?? "",
      authorId: userId,
      boostScore: (t.actionData as any)?.boostScore ?? 0,
      reason: t.message,
      actionLabel: "Booster ce post",
    }));

  // Source 2 : top boost posts de l'auteur (scoring direct)
  const boostCandidates = await getTopBoostCandidates(limit, undefined);
  const fromScoring: BoostOpportunity[] = boostCandidates
    .filter((c: any) => c.authorId === userId)
    .slice(0, limit - fromTips.length)
    .map((c: any) => ({
      postId: c.id,
      authorId: userId,
      boostScore: c.boostScore ?? 0,
      reason: `Score de potentiel : ${c.boostScore ?? 0}/100. Ce post peut toucher plus de monde.`,
      actionLabel: "Booster ce post",
    }));

  // Dédoublonner par postId
  const seen = new Set<string>();
  const result: BoostOpportunity[] = [];
  for (const opp of [...fromTips, ...fromScoring]) {
    if (opp.postId && !seen.has(opp.postId)) {
      seen.add(opp.postId);
      result.push(opp);
    }
  }

  const final = result.slice(0, limit);
  await setCache(cacheKey, final, AUTH_TTL);
  return final;
}

// ═══════════════════════════════════════════════════════
// 6. VUE COMBINÉE — Smart feed blocks (public)
// ═══════════════════════════════════════════════════════

export async function getSmartFeedBlocks(city?: string): Promise<SmartFeedBlocks> {
  const cacheKey = `feed:${city ?? "all"}`;
  const cached = await getFromCache<SmartFeedBlocks>(cacheKey);
  if (cached) return cached;

  const [trendingTopics, hotHashtags, winningFormats] = await Promise.all([
    getTrendingTopics(city, 6),
    getHotHashtags(city, 10),
    getWinningFormats(city, 5),
  ]);

  // Top boost posts globaux (pas lié à un user)
  const topBoost = await getTopBoostCandidates(5, city);
  const boostOpportunities: BoostOpportunity[] = topBoost.map((p: any) => ({
    postId: p.id,
    authorId: p.authorId,
    boostScore: p.boostScore ?? 0,
    reason: `Score de potentiel ${p.boostScore ?? 0}/100`,
    actionLabel: "Voir le post",
  }));

  // Idées génériques (pas liées à un user)
  const publishIdeas: PublishIdea[] = [];
  let idC = 1;

  const hotFormat = winningFormats.find(f => f.trend === "HOT");
  if (hotFormat) {
    publishIdeas.push({
      id: String(idC++),
      type: "FORMAT",
      title: `Le format "${hotFormat.label}" cartonne`,
      reason: `${hotFormat.posts7d} posts avec ${hotFormat.avgEngagement} d'engagement moyen cette semaine.`,
      actionLabel: "Créer un post",
    });
  }

  const risingHash = hotHashtags.find(h => h.velocity === "RISING" || h.velocity === "NEW");
  if (risingHash) {
    publishIdeas.push({
      id: String(idC++),
      type: "HASHTAG",
      title: `${risingHash.hashtag} ${risingHash.velocity === "NEW" ? "émerge" : "monte en flèche"}`,
      reason: `${risingHash.posts7d} posts cette semaine.`,
      actionLabel: "Utiliser ce hashtag",
    });
  }

  const emergingTopic = trendingTopics.find(t => t.momentum === "EMERGING" || t.momentum === "UP");
  if (emergingTopic) {
    publishIdeas.push({
      id: String(idC++),
      type: "TOPIC",
      title: `"${emergingTopic.label}" est en tendance`,
      reason: `${emergingTopic.engagement7d} interactions cette semaine.`,
      actionLabel: "Publier sur ce sujet",
    });
  }

  const result: SmartFeedBlocks = {
    trendingTopics,
    hotHashtags,
    publishIdeas,
    boostOpportunities,
    winningFormats,
    generatedAt: new Date().toISOString(),
  };

  await setCache(cacheKey, result, PUBLIC_TTL);
  return result;
}

// ═══════════════════════════════════════════════════════
// 7. VUE AUTEUR — Suggestions personnalisées
// ═══════════════════════════════════════════════════════

export async function getAuthorSmartSuggestions(userId: string, city?: string): Promise<AuthorSmartSuggestions> {
  const cacheKey = `author:${userId}:${city ?? "all"}`;
  const cached = await getFromCache<AuthorSmartSuggestions>(cacheKey);
  if (cached) return cached;

  const [publishIdeas, boostOpportunities] = await Promise.all([
    getPublishIdeas(userId, city),
    getBoostOpportunities(userId, 5),
  ]);

  const result: AuthorSmartSuggestions = {
    publishIdeas,
    boostOpportunities,
    generatedAt: new Date().toISOString(),
  };

  await setCache(cacheKey, result, AUTH_TTL);
  return result;
}
