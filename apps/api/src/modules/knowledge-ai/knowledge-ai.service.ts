/**
 * KNOWLEDGE IA — IA complémentaire à Kin-Sell Analytique
 *
 * Objectif : détecter les besoins de l'utilisateur (ventes, achats, recrutement,
 * recherche de travail) et lui fournir les meilleurs conseils :
 *  - Pour vendre : où sa catégorie est la plus demandée (pays/ville)
 *  - Pour recruter : où la main-d'œuvre recherchée est la plus dense
 *  - Pour travailler : où sa compétence est la plus demandée
 *  - Pour acheter : où l'offre est la plus abondante / au meilleur prix
 *
 * Source de données : Listing (produits/services publiés) + Negotiation.
 * Réutilise `shared/market/market-shared.ts` quand pertinent.
 */

import { prisma } from "../../shared/db/prisma.js";
import type { CountryCode, KnowledgeGoal } from "@prisma/client";
import { getMarketContextForUser, formatSnapshotForPrompt, type MarketContextSnapshot } from "../market-intel/context.js";

// Pays où Kin-Sell est déployé (8) — aligné sur MARKET_COUNTRIES frontend
export const KNOWLEDGE_COUNTRIES: CountryCode[] = [
  "CD", "GA", "CG", "AO", "CI", "GN", "SN", "MA",
];

const DEMAND_WINDOW_DAYS = 30;

// ──────────────────────────────────────────────
// INTENT — CRUD préférences "Que recherchez-vous"
// ──────────────────────────────────────────────

export async function getIntent(userId: string) {
  const intent = await prisma.userKnowledgeIntent.findUnique({
    where: { userId },
  });
  return intent;
}

export async function upsertIntent(
  userId: string,
  payload: {
    goals?: KnowledgeGoal[];
    categories?: string[];
    keywords?: string[];
    countriesInterest?: CountryCode[];
    notes?: string | null;
  }
) {
  const data = {
    goals: payload.goals ?? [],
    categories: (payload.categories ?? []).slice(0, 20).map((s) => s.trim()).filter(Boolean),
    keywords: (payload.keywords ?? []).slice(0, 30).map((s) => s.trim()).filter(Boolean),
    countriesInterest: payload.countriesInterest ?? [],
    notes: payload.notes ?? null,
  };

  return prisma.userKnowledgeIntent.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

export async function deleteIntent(userId: string) {
  await prisma.userKnowledgeIntent.deleteMany({ where: { userId } });
  return { ok: true };
}

// ──────────────────────────────────────────────
// DEMAND MAP — où la catégorie est la plus demandée
// ──────────────────────────────────────────────

export interface DemandZone {
  countryCode: CountryCode | null;
  city: string | null;
  listingsCount: number;
  negotiationsCount: number;
  viewsCount: number;
  demandScore: number;
  level: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * Retourne les zones (pays + ville) où la catégorie ciblée est la + demandée.
 * Score = négociations (poids 3) + vues (poids 0.1) normalisé.
 */
export async function getDemandMap(options: {
  category?: string;
  keywords?: string[];
  countries?: CountryCode[];
  limit?: number;
}): Promise<DemandZone[]> {
  const { category, keywords, countries, limit = 10 } = options;
  const since = new Date(Date.now() - DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const where: any = { status: "ACTIVE" };
  if (category) where.category = category;
  if (countries && countries.length > 0) where.countryCode = { in: countries };
  if (keywords && keywords.length > 0) {
    where.OR = keywords.map((k) => ({
      OR: [
        { title: { contains: k, mode: "insensitive" } },
        { description: { contains: k, mode: "insensitive" } },
      ],
    }));
  }

  const listings = await prisma.listing.findMany({
    where,
    select: {
      id: true,
      countryCode: true,
      city: true,
      viewCount: true,
    },
    take: 5000,
  });

  if (listings.length === 0) return [];

  // Agrégat par (countryCode, city)
  type Bucket = { listings: number; views: number; ids: string[] };
  const buckets = new Map<string, Bucket & { countryCode: CountryCode | null; city: string | null }>();

  for (const l of listings) {
    const key = `${l.countryCode ?? "?"}::${(l.city ?? "").toLowerCase()}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.listings += 1;
      bucket.views += l.viewCount ?? 0;
      bucket.ids.push(l.id);
    } else {
      buckets.set(key, {
        countryCode: l.countryCode,
        city: l.city,
        listings: 1,
        views: l.viewCount ?? 0,
        ids: [l.id],
      });
    }
  }

  // Comptage négociations par listing (en batch)
  const allIds = Array.from(buckets.values()).flatMap((b) => b.ids);
  const negoCounts = await prisma.negotiation.groupBy({
    by: ["listingId"],
    where: { listingId: { in: allIds }, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const negoByListing = new Map(negoCounts.map((n) => [n.listingId, n._count._all]));

  const zones: DemandZone[] = Array.from(buckets.values()).map((b) => {
    const negos = b.ids.reduce((sum, id) => sum + (negoByListing.get(id) ?? 0), 0);
    const raw = negos * 3 + b.views * 0.1;
    const score = Math.min(100, Math.round(raw));
    const level: DemandZone["level"] = score >= 60 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
    return {
      countryCode: b.countryCode,
      city: b.city,
      listingsCount: b.listings,
      negotiationsCount: negos,
      viewsCount: b.views,
      demandScore: score,
      level,
    };
  });

  return zones.sort((a, b) => b.demandScore - a.demandScore).slice(0, limit);
}

// ──────────────────────────────────────────────
// WORKFORCE MAP — où la main-d'œuvre est dense
// ──────────────────────────────────────────────

export interface WorkforceZone {
  countryCode: CountryCode | null;
  city: string | null;
  providersCount: number;   // nombre de services offerts sur cette zone
  demandScore: number;       // intérêt (négociations + vues)
  level: "LOW" | "MEDIUM" | "HIGH";
}

export async function getWorkforceMap(options: {
  skill?: string;
  keywords?: string[];
  countries?: CountryCode[];
  limit?: number;
}): Promise<WorkforceZone[]> {
  const { skill, keywords, countries, limit = 10 } = options;

  const where: any = { status: "ACTIVE", type: "SERVICE" };
  if (skill) where.category = skill;
  if (countries && countries.length > 0) where.countryCode = { in: countries };
  if (keywords && keywords.length > 0) {
    where.OR = keywords.map((k) => ({
      OR: [
        { title: { contains: k, mode: "insensitive" } },
        { description: { contains: k, mode: "insensitive" } },
      ],
    }));
  }

  const services = await prisma.listing.findMany({
    where,
    select: {
      id: true,
      countryCode: true,
      city: true,
      viewCount: true,
    },
    take: 5000,
  });

  if (services.length === 0) return [];

  type B = {
    countryCode: CountryCode | null;
    city: string | null;
    providers: number;
    views: number;
    ids: string[];
  };
  const buckets = new Map<string, B>();
  for (const s of services) {
    const key = `${s.countryCode ?? "?"}::${(s.city ?? "").toLowerCase()}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.providers += 1;
      bucket.views += s.viewCount ?? 0;
      bucket.ids.push(s.id);
    } else {
      buckets.set(key, {
        countryCode: s.countryCode,
        city: s.city,
        providers: 1,
        views: s.viewCount ?? 0,
        ids: [s.id],
      });
    }
  }

  const since = new Date(Date.now() - DEMAND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const allIds = Array.from(buckets.values()).flatMap((b) => b.ids);
  const negoCounts = await prisma.negotiation.groupBy({
    by: ["listingId"],
    where: { listingId: { in: allIds }, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const negoByListing = new Map(negoCounts.map((n) => [n.listingId, n._count._all]));

  const zones: WorkforceZone[] = Array.from(buckets.values()).map((b) => {
    const negos = b.ids.reduce((sum, id) => sum + (negoByListing.get(id) ?? 0), 0);
    const raw = negos * 2 + b.views * 0.1;
    const score = Math.min(100, Math.round(raw));
    const level: WorkforceZone["level"] = score >= 60 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW";
    return {
      countryCode: b.countryCode,
      city: b.city,
      providersCount: b.providers,
      demandScore: score,
      level,
    };
  });

  return zones.sort((a, b) => b.providersCount - a.providersCount).slice(0, limit);
}

// ──────────────────────────────────────────────
// RECOMMANDATIONS — synthèse personnalisée
// ──────────────────────────────────────────────

export interface Recommendation {
  id: string;
  goal: KnowledgeGoal;
  title: string;
  message: string;
  topZones: Array<{ countryCode: CountryCode | null; city: string | null; score: number; level: string }>;
  category?: string;
  keywords?: string[];
  /** Contexte marché externe (Kin-Sell Analytique+) injecté depuis context.ts */
  marketContext?: {
    country: string;
    summary: string;
    snapshot: MarketContextSnapshot;
  };
}

export async function getRecommendations(userId: string): Promise<Recommendation[]> {
  const intent = await getIntent(userId);
  if (!intent) return [];

  const recos: Recommendation[] = [];
  const countries = intent.countriesInterest.length > 0 ? intent.countriesInterest : KNOWLEDGE_COUNTRIES;

  for (const category of intent.categories.length > 0 ? intent.categories : [undefined]) {
    for (const goal of intent.goals) {
      if (goal === "SELL" || goal === "BUY") {
        const zones = await getDemandMap({
          category,
          keywords: intent.keywords,
          countries,
          limit: 5,
        });
        if (zones.length === 0) continue;
        recos.push({
          id: `${goal}-${category ?? "ANY"}-${recos.length}`,
          goal,
          title: goal === "SELL"
            ? `Où vendre ${category ?? "vos produits"} ?`
            : `Où acheter ${category ?? "au meilleur endroit"} ?`,
          message: goal === "SELL"
            ? `Voici les zones où ${category ?? "votre catégorie"} est la plus demandée sur Kin-Sell (30 derniers jours).`
            : `Voici les zones les plus actives pour ${category ?? "votre recherche"} sur Kin-Sell.`,
          topZones: zones.map((z) => ({
            countryCode: z.countryCode,
            city: z.city,
            score: z.demandScore,
            level: z.level,
          })),
          category,
          keywords: intent.keywords,
        });
      }
      if (goal === "HIRE" || goal === "WORK") {
        const zones = await getWorkforceMap({
          skill: category,
          keywords: intent.keywords,
          countries,
          limit: 5,
        });
        if (zones.length === 0) continue;
        recos.push({
          id: `${goal}-${category ?? "ANY"}-${recos.length}`,
          goal,
          title: goal === "HIRE"
            ? `Où trouver ${category ?? "la main-d'œuvre"} ?`
            : `Où votre compétence ${category ?? ""} est-elle la plus recherchée ?`,
          message: goal === "HIRE"
            ? `Voici les zones où le plus de prestataires proposent ${category ?? "ce service"}.`
            : `Voici les zones avec le plus de demande active pour ${category ?? "vos compétences"}.`,
          topZones: zones.map((z) => ({
            countryCode: z.countryCode,
            city: z.city,
            score: z.demandScore,
            level: z.level,
          })),
          category,
          keywords: intent.keywords,
        });
      }
    }
  }

  // ── Enrichissement Analytique+ (contexte marché externe) ──
  // Pour chaque reco, on ajoute le snapshot marché du pays le plus pertinent
  // (1ère topZone). Silencieux en cas d'échec — non bloquant.
  await Promise.all(
    recos.map(async (r) => {
      const topCountry = r.topZones[0]?.countryCode ?? countries[0] ?? null;
      if (!topCountry) return;
      try {
        const snap = await getMarketContextForUser({
          country: topCountry,
          categoryId: r.category,
          includeArbitrage: r.goal === "SELL" || r.goal === "BUY",
        });
        if (!snap.productInsight && snap.topTrends.length === 0 && snap.arbitrageHints.length === 0) return;
        r.marketContext = {
          country: topCountry,
          summary: formatSnapshotForPrompt(snap),
          snapshot: snap,
        };
      } catch {
        // Analytique+ indisponible : reco reste valide sans contexte externe
      }
    }),
  );

  return recos;
}
