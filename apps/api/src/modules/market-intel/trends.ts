/**
 * Trends — Kin-Sell Analytique+
 *
 * Calcule le top 50 produits et top 50 métiers par pays à partir
 * des tables MarketPrice / MarketSalary alimentées par l'aggregator.
 *
 * Score composite :
 *  - volume d'observations (sampleSize cumulée sur la fenêtre)
 *  - diversité des sources (nb sourceIds uniques)
 *  - Δ% prix/salaire 14 j → signal de tension
 *  - bonus saisonnier selon le mois courant
 *
 * Persiste dans MarketTrend (scope=product|job, period="weekly")
 * en remplaçant le top de la semaine courante.
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";

const COUNTRIES = ["MA", "CI", "SN", "CD", "GA", "CG", "GN", "AO"];
const TOP_N = 50;
const WINDOW_DAYS = 14;
const PREVIOUS_WINDOW_DAYS = 14;

// ── Saisonnalité heuristique (mois 1-12) ──────────────

function currentSeason(date: Date, country: string): string | null {
  const month = date.getUTCMonth() + 1;

  // Ramadan — approximation mobile : 2026 = mi-février → mi-mars
  // Pour simplifier on tague FEB/MAR pour les pays à majorité musulmane
  const muslimMajority = ["MA", "SN", "GN", "CI"];
  if (muslimMajority.includes(country) && (month === 2 || month === 3)) return "ramadan";

  // Rentrée scolaire : septembre (tous les pays FR+Angola)
  if (month === 9) return "back-to-school";

  // Noël : décembre
  if (month === 12) return "christmas";

  // Saison des pluies / sèche — Afrique centrale
  const equatorial = ["CD", "CG", "GA", "GN"];
  if (equatorial.includes(country)) {
    if ([4, 5, 10, 11].includes(month)) return "rainy-season";
    if ([6, 7, 8].includes(month)) return "dry-season";
  }
  // Sahel
  const sahel = ["SN", "CI", "MA"];
  if (sahel.includes(country) && [6, 7, 8, 9].includes(month)) return "rainy-season";

  return null;
}

// ── Score ──────────────────────────────────────────────

function scoreEntry(p: {
  sampleSize: number;
  sourceCount: number;
  deltaPct: number;
  seasonBonus: number;
}): number {
  // Normalisations souples
  const volume = Math.log10(p.sampleSize + 1); // 0..~2
  const diversity = Math.log10(p.sourceCount + 1);
  const tension = Math.abs(p.deltaPct) / 10; // 10% → +1 point
  return volume * 1 + diversity * 0.7 + tension * 1.2 + p.seasonBonus;
}

// ── Trends produits ────────────────────────────────────

async function computeProductTrends(country: string, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86400_000);
  const prevStart = new Date(windowStart.getTime() - PREVIOUS_WINDOW_DAYS * 86400_000);

  // Tous les MarketPrice × ce pays sur les 14 derniers jours
  const recent = await prisma.marketPrice.findMany({
    where: { countryCode: country, collectedAt: { gte: windowStart } },
    select: { productId: true, priceMedianEurCents: true, sampleSize: true, sourceIds: true, collectedAt: true },
  });
  const previous = await prisma.marketPrice.findMany({
    where: { countryCode: country, collectedAt: { gte: prevStart, lt: windowStart } },
    select: { productId: true, priceMedianEurCents: true },
  });

  // Agrégation par produit
  type Agg = { productId: string; samples: number; sources: Set<string>; medians: number[]; prevMedians: number[] };
  const aggMap = new Map<string, Agg>();

  for (const row of recent) {
    const a = aggMap.get(row.productId) ?? { productId: row.productId, samples: 0, sources: new Set<string>(), medians: [], prevMedians: [] };
    a.samples += row.sampleSize;
    for (const s of row.sourceIds) a.sources.add(s);
    a.medians.push(row.priceMedianEurCents);
    aggMap.set(row.productId, a);
  }
  for (const row of previous) {
    const a = aggMap.get(row.productId);
    if (a) a.prevMedians.push(row.priceMedianEurCents);
  }

  const season = currentSeason(now, country);
  const seasonKeywordsByCategory: Record<string, string[]> = {
    "back-to-school": ["books", "it", "phone"],
    ramadan: ["food", "clothes"],
    christmas: ["electronics", "games", "gifts", "beauty"],
    "rainy-season": ["diy", "appliances"],
    "dry-season": ["appliances", "electronics"],
  };

  // On charge les catégories des produits pour le bonus saisonnier
  const productIds = [...aggMap.keys()];
  const products = productIds.length
    ? await prisma.marketProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } })
    : [];
  const catOf = new Map(products.map((p) => [p.id, p.categoryId]));

  // Scores
  const scored = [...aggMap.values()].map((a) => {
    const median = a.medians.length ? a.medians.reduce((s, x) => s + x, 0) / a.medians.length : 0;
    const prevMedian = a.prevMedians.length ? a.prevMedians.reduce((s, x) => s + x, 0) / a.prevMedians.length : 0;
    const deltaPct = prevMedian > 0 ? ((median - prevMedian) / prevMedian) * 100 : 0;

    const cat = catOf.get(a.productId);
    const boosted = season && cat && seasonKeywordsByCategory[season]?.includes(cat);
    const seasonBonus = boosted ? 1.5 : 0;

    return {
      productId: a.productId,
      score: scoreEntry({ sampleSize: a.samples, sourceCount: a.sources.size, deltaPct, seasonBonus }),
      deltaPct,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_N);

  // Purge ancien top "weekly" de ce pays pour les produits
  await prisma.marketTrend.deleteMany({ where: { countryCode: country, scope: "product", period: "weekly" } });

  let inserted = 0;
  for (let i = 0; i < top.length; i++) {
    const e = top[i];
    try {
      await prisma.marketTrend.create({
        data: {
          scope: "product",
          productId: e.productId,
          countryCode: country,
          period: "weekly",
          rank: i + 1,
          score: e.score,
          deltaPct: e.deltaPct,
          season,
        },
      });
      inserted++;
    } catch (err: any) {
      logger.warn({ err: err?.message, country, productId: e.productId }, "[trends] product insert failed");
    }
  }
  return inserted;
}

// ── Trends métiers ─────────────────────────────────────

async function computeJobTrends(country: string, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86400_000);
  const prevStart = new Date(windowStart.getTime() - PREVIOUS_WINDOW_DAYS * 86400_000);

  const recent = await prisma.marketSalary.findMany({
    where: { countryCode: country, collectedAt: { gte: windowStart } },
    select: { jobId: true, salaryMedianEurCents: true, sampleSize: true, sourceIds: true },
  });
  const previous = await prisma.marketSalary.findMany({
    where: { countryCode: country, collectedAt: { gte: prevStart, lt: windowStart } },
    select: { jobId: true, salaryMedianEurCents: true },
  });

  type Agg = { jobId: string; samples: number; sources: Set<string>; medians: number[]; prevMedians: number[] };
  const aggMap = new Map<string, Agg>();

  for (const row of recent) {
    const a = aggMap.get(row.jobId) ?? { jobId: row.jobId, samples: 0, sources: new Set<string>(), medians: [], prevMedians: [] };
    a.samples += row.sampleSize;
    for (const s of row.sourceIds) a.sources.add(s);
    a.medians.push(row.salaryMedianEurCents);
    aggMap.set(row.jobId, a);
  }
  for (const row of previous) {
    const a = aggMap.get(row.jobId);
    if (a) a.prevMedians.push(row.salaryMedianEurCents);
  }

  const season = currentSeason(now, country);

  const scored = [...aggMap.values()].map((a) => {
    const median = a.medians.length ? a.medians.reduce((s, x) => s + x, 0) / a.medians.length : 0;
    const prevMedian = a.prevMedians.length ? a.prevMedians.reduce((s, x) => s + x, 0) / a.prevMedians.length : 0;
    const deltaPct = prevMedian > 0 ? ((median - prevMedian) / prevMedian) * 100 : 0;
    return {
      jobId: a.jobId,
      score: scoreEntry({ sampleSize: a.samples, sourceCount: a.sources.size, deltaPct, seasonBonus: 0 }),
      deltaPct,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_N);

  await prisma.marketTrend.deleteMany({ where: { countryCode: country, scope: "job", period: "weekly" } });

  let inserted = 0;
  for (let i = 0; i < top.length; i++) {
    const e = top[i];
    try {
      await prisma.marketTrend.create({
        data: {
          scope: "job",
          jobId: e.jobId,
          countryCode: country,
          period: "weekly",
          rank: i + 1,
          score: e.score,
          deltaPct: e.deltaPct,
          season,
        },
      });
      inserted++;
    } catch (err: any) {
      logger.warn({ err: err?.message, country, jobId: e.jobId }, "[trends] job insert failed");
    }
  }
  return inserted;
}

// ── Entrée publique ────────────────────────────────────

export type TrendsReport = {
  productTrendsByCountry: Record<string, number>;
  jobTrendsByCountry: Record<string, number>;
  durationMs: number;
};

export async function computeTrends(): Promise<TrendsReport> {
  const started = Date.now();
  const now = new Date();
  const productTrendsByCountry: Record<string, number> = {};
  const jobTrendsByCountry: Record<string, number> = {};

  for (const country of COUNTRIES) {
    productTrendsByCountry[country] = await computeProductTrends(country, now);
    jobTrendsByCountry[country] = await computeJobTrends(country, now);
  }

  const report: TrendsReport = { productTrendsByCountry, jobTrendsByCountry, durationMs: Date.now() - started };
  logger.info(report, "[market-intel.trends] computed");
  return report;
}
