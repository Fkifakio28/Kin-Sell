/**
 * SO-KIN TRENDS — IA d'analyse des tendances sociales
 *
 * Analyse les posts/listings pour alimenter:
 * - "Tendances" (trending hashtags, topics, catégories, produits)
 * - "Personnes que vous pourriez connaître" (SoKinSuggestion)
 */

import { prisma } from "../../shared/db/prisma.js";
import { SoKinTrendType } from "@prisma/client";

// ── Tendances ──

export async function getActiveTrends(city?: string, type?: SoKinTrendType) {
  const where: any = { isActive: true };
  if (city) where.city = { equals: city, mode: "insensitive" };
  if (type) where.type = type;
  return prisma.soKinTrend.findMany({
    where,
    orderBy: { score: "desc" },
    take: 20,
  });
}

export async function computeTrendsFromPosts() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Marquer les anciens comme inactifs
  await prisma.soKinTrend.updateMany({
    where: { periodEnd: { lt: sevenDaysAgo } },
    data: { isActive: false },
  });

  // Compter les listings par catégorie (derniers 7j)
  const recentListings = await prisma.listing.findMany({
    where: { createdAt: { gte: sevenDaysAgo }, status: "ACTIVE" },
    select: { id: true, category: true, city: true, title: true },
  });

  // Tendance par catégorie
  const catCounts: Record<string, { count: number; city: string; ids: string[] }> = {};
  for (const l of recentListings) {
    const key = `${l.category}::${l.city ?? "global"}`;
    if (!catCounts[key]) catCounts[key] = { count: 0, city: l.city ?? "", ids: [] };
    catCounts[key].count++;
    catCounts[key].ids.push(l.id);
  }

  const results = [];
  for (const [key, data] of Object.entries(catCounts)) {
    if (data.count < 2) continue;
    const [category, city] = key.split("::");
    const trend = await prisma.soKinTrend.create({
      data: {
        type: SoKinTrendType.CATEGORY,
        title: category,
        description: `${data.count} publications récentes dans "${category}" à ${city || "global"}.`,
        score: Math.min(100, data.count * 8),
        city: city || null,
        hashtags: [],
        relatedPostIds: data.ids.slice(0, 10),
        isActive: true,
        periodStart: sevenDaysAgo,
        periodEnd: now,
      },
    });
    results.push(trend);
  }

  // Tendance par titre (mots-clés fréquents dans les titres)
  const wordCounts: Record<string, { count: number; ids: string[] }> = {};
  for (const l of recentListings) {
    const words = l.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      if (!wordCounts[word]) wordCounts[word] = { count: 0, ids: [] };
      wordCounts[word].count++;
      wordCounts[word].ids.push(l.id);
    }
  }

  for (const [word, data] of Object.entries(wordCounts)) {
    if (data.count < 3) continue;
    const trend = await prisma.soKinTrend.create({
      data: {
        type: SoKinTrendType.TOPIC,
        title: word,
        description: `Mot-clé "${word}" mentionné ${data.count} fois dans les titres.`,
        score: Math.min(100, data.count * 10),
        hashtags: [word],
        relatedPostIds: data.ids.slice(0, 10),
        isActive: true,
        periodStart: sevenDaysAgo,
        periodEnd: now,
      },
    });
    results.push(trend);
  }

  return results;
}

// ── Suggestions de personnes ──

export async function getSuggestionsForUser(userId: string) {
  return prisma.soKinSuggestion.findMany({
    where: { userId, dismissed: false, connected: false },
    include: {
      suggestedUser: {
        select: { id: true, profile: { select: { displayName: true, avatarUrl: true, city: true } } },
      },
    },
    orderBy: { score: "desc" },
    take: 10,
  });
}

export async function computeSuggestionsForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, profile: { select: { city: true } } },
  });
  if (!user) return [];

  // 1. Utilisateurs de la même ville (pas déjà suggérés ou connectés)
  const existingSuggestions = await prisma.soKinSuggestion.findMany({
    where: { userId },
    select: { suggestedUserId: true },
  });
  const excludeIds = new Set(existingSuggestions.map((s) => s.suggestedUserId));
  excludeIds.add(userId);

  const userCity = user.profile?.city;
  const sameCity = userCity
    ? await prisma.user.findMany({
        where: { profile: { city: { equals: userCity, mode: "insensitive" } }, id: { notIn: [...excludeIds] } },
        take: 20,
        select: { id: true },
      })
    : [];

  // 2. Utilisateurs matchés via contacts importés
  const matchedContacts = await prisma.userContact.findMany({
    where: { userId, matchedUserId: { not: null } },
    select: { matchedUserId: true },
  });

  const suggestions = [];

  for (const u of sameCity) {
    suggestions.push(
      prisma.soKinSuggestion.create({
        data: { userId, suggestedUserId: u.id, reason: "SAME_CITY", score: 50 },
      })
    );
  }

  for (const c of matchedContacts) {
    if (c.matchedUserId && !excludeIds.has(c.matchedUserId)) {
      suggestions.push(
        prisma.soKinSuggestion.create({
          data: { userId, suggestedUserId: c.matchedUserId, reason: "CONTACT_MATCH", score: 80 },
        })
      );
      excludeIds.add(c.matchedUserId);
    }
  }

  return Promise.all(suggestions);
}

export async function dismissSuggestion(userId: string, suggestionId: string) {
  return prisma.soKinSuggestion.update({
    where: { id: suggestionId, userId },
    data: { dismissed: true },
  });
}
