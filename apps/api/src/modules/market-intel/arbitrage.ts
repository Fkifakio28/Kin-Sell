/**
 * Arbitrage — Kin-Sell Analytique+
 *
 * Détecte les opportunités d'arbitrage inter-pays :
 *   • produit rare + cher dans un pays (shortage) qui est abondant +
 *     moins cher dans un autre (surplus) → import/export
 *   • métier bien payé mais peu d'offres (shortage = besoin de main
 *     d'œuvre) vs peu payé et abondant (surplus = migration pro)
 *
 * Les "signaux" news (keywords pénurie / forte demande) ne sont pas
 * encore exploités ici (fait l'objet d'une E8.1 ultérieure) — on se
 * base exclusivement sur les prix/volumes observés, qui sont les
 * données les plus fiables.
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";

const COUNTRIES = ["MA", "CI", "SN", "CD", "GA", "CG", "GN", "AO"];
const WINDOW_DAYS = 14;
const TOP_N_PER_SCOPE = 100;
const PURGE_OLDER_THAN_DAYS = 30;

// ── Distances routières approximatives entre capitales (km) ───
// Utilisées pour pondérer la faisabilité logistique. Approximations
// doubles-routières (Google Maps, arrondies).

const CAPITAL_DISTANCE_KM: Record<string, Record<string, number>> = {
  MA: { CI: 4200, SN: 3100, CD: 6400, GA: 5300, CG: 5500, GN: 3600, AO: 7200 },
  CI: { MA: 4200, SN: 1700, CD: 3900, GA: 2400, CG: 2600, GN: 1300, AO: 4200 },
  SN: { MA: 3100, CI: 1700, CD: 5200, GA: 3900, CG: 4100, GN:  600, AO: 5600 },
  CD: { MA: 6400, CI: 3900, SN: 5200, GA: 2000, CG:  500, GN: 4500, AO: 2700 },
  GA: { MA: 5300, CI: 2400, SN: 3900, CD: 2000, CG:  700, GN: 3000, AO: 2500 },
  CG: { MA: 5500, CI: 2600, SN: 4100, CD:  500, GA:  700, GN: 3200, AO: 2200 },
  GN: { MA: 3600, CI: 1300, SN:  600, CD: 4500, GA: 3000, CG: 3200, AO: 4900 },
  AO: { MA: 7200, CI: 4200, SN: 5600, CD: 2700, GA: 2500, CG: 2200, GN: 4900 },
};

function distanceKm(a: string, b: string): number | null {
  return CAPITAL_DISTANCE_KM[a]?.[b] ?? null;
}

// ── Index offre/demande à partir des observations ────

/**
 * demandIndex : normalisé [0..1]. Plus haut = demande apparente haute
 *   (prix médian élevé + peu d'observations = pénurie)
 * supplyIndex : normalisé [0..1]. Plus haut = abondance
 *   (prix médian bas + sampleSize cumulée importante)
 */

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// ── Arbitrage produits ───────────────────────────────

type CountryAgg = {
  country: string;
  medianEur: number;
  samples: number;
  sources: Set<string>;
};

async function arbitrateProducts(now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86400_000);

  const products = await prisma.marketProduct.findMany();
  let inserted = 0;

  for (const product of products) {
    const rows = await prisma.marketPrice.findMany({
      where: { productId: product.id, collectedAt: { gte: windowStart } },
      select: { countryCode: true, priceMedianEurCents: true, sampleSize: true, sourceIds: true },
    });
    if (rows.length < 2) continue;

    // Agrégation par pays
    const aggMap = new Map<string, CountryAgg>();
    for (const row of rows) {
      const a = aggMap.get(row.countryCode) ?? {
        country: row.countryCode,
        medianEur: 0,
        samples: 0,
        sources: new Set<string>(),
      };
      a.medianEur = a.medianEur === 0 ? row.priceMedianEurCents : Math.round((a.medianEur + row.priceMedianEurCents) / 2);
      a.samples += row.sampleSize;
      for (const s of row.sourceIds) a.sources.add(s);
      aggMap.set(row.countryCode, a);
    }
    const aggs = [...aggMap.values()];
    if (aggs.length < 2) continue;

    // Bornes pour normaliser
    const prices = aggs.map((a) => a.medianEur);
    const samplesArr = aggs.map((a) => a.samples);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const minS = Math.min(...samplesArr);
    const maxS = Math.max(...samplesArr);

    // Le pays le plus cher + le moins observé = shortage
    // Le pays le moins cher + le plus observé = surplus
    let shortage: (CountryAgg & { demandIndex: number }) | null = null;
    let surplus: (CountryAgg & { supplyIndex: number }) | null = null;

    for (const a of aggs) {
      const priceNorm = normalize(a.medianEur, minP, maxP); // 0=min, 1=max
      const volumeNorm = normalize(a.samples, minS, maxS);
      const demand = priceNorm * 0.7 + (1 - volumeNorm) * 0.3;
      const supply = (1 - priceNorm) * 0.6 + volumeNorm * 0.4;
      if (!shortage || demand > shortage.demandIndex) shortage = { ...a, demandIndex: demand };
      if (!surplus || supply > surplus.supplyIndex) surplus = { ...a, supplyIndex: supply };
    }
    if (!shortage || !surplus || shortage.country === surplus.country) continue;

    const priceDeltaEurCents = shortage.medianEur - surplus.medianEur;
    if (priceDeltaEurCents <= 0) continue; // pas d'arbitrage si shortage pas plus cher

    const distance = distanceKm(shortage.country, surplus.country);
    // Score = attractivité économique pondérée par distance inverse
    const deltaRatio = priceDeltaEurCents / Math.max(1, surplus.medianEur);
    const distanceFactor = distance ? Math.max(0.3, 1 - distance / 10000) : 0.5;
    const score = Math.min(1, (shortage.demandIndex * 0.4 + surplus.supplyIndex * 0.4 + deltaRatio * 0.2) * distanceFactor);
    if (score < 0.35) continue; // seuil de pertinence

    const rationale =
      `${product.displayName} — ${shortage.country} (médiane ${(shortage.medianEur / 100).toFixed(2)} €, ${shortage.samples} obs.) ` +
      `est ${priceDeltaEurCents > 0 ? "plus cher" : "moins cher"} que ${surplus.country} ` +
      `(${(surplus.medianEur / 100).toFixed(2)} €, ${surplus.samples} obs.). ` +
      `Écart ${(priceDeltaEurCents / 100).toFixed(2)} € ≈ ${(deltaRatio * 100).toFixed(0)}%. ` +
      (distance ? `Distance ~${distance} km.` : "Distance non calculée.");

    try {
      await prisma.arbitrageOpportunity.create({
        data: {
          scope: "product",
          entityId: product.id,
          entityLabel: product.displayName,
          shortageCountry: shortage.country,
          surplusCountry: surplus.country,
          score,
          demandIndex: shortage.demandIndex,
          supplyIndex: surplus.supplyIndex,
          priceDeltaEurCents,
          distanceKm: distance ?? undefined,
          rationale,
          active: true,
        },
      });
      inserted++;
    } catch (err: any) {
      logger.warn({ err: err?.message, productId: product.id }, "[arbitrage] product insert failed");
    }
  }

  return inserted;
}

// ── Arbitrage métiers ────────────────────────────────

async function arbitrateJobs(now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86400_000);
  const jobs = await prisma.marketJob.findMany();
  let inserted = 0;

  for (const job of jobs) {
    const rows = await prisma.marketSalary.findMany({
      where: { jobId: job.id, collectedAt: { gte: windowStart } },
      select: { countryCode: true, salaryMedianEurCents: true, sampleSize: true, sourceIds: true },
    });
    if (rows.length < 2) continue;

    const aggMap = new Map<string, CountryAgg>();
    for (const row of rows) {
      const a = aggMap.get(row.countryCode) ?? {
        country: row.countryCode,
        medianEur: 0,
        samples: 0,
        sources: new Set<string>(),
      };
      a.medianEur = a.medianEur === 0 ? row.salaryMedianEurCents : Math.round((a.medianEur + row.salaryMedianEurCents) / 2);
      a.samples += row.sampleSize;
      for (const s of row.sourceIds) a.sources.add(s);
      aggMap.set(row.countryCode, a);
    }
    const aggs = [...aggMap.values()];
    if (aggs.length < 2) continue;

    const salaries = aggs.map((a) => a.medianEur);
    const samplesArr = aggs.map((a) => a.samples);
    const minS = Math.min(...salaries);
    const maxS = Math.max(...salaries);
    const minN = Math.min(...samplesArr);
    const maxN = Math.max(...samplesArr);

    // Pour un JOB : shortage = salaire élevé + peu d'offres (besoin de main d'œuvre)
    //               surplus = salaire bas + offres abondantes (main d'œuvre dispo)
    let shortage: (CountryAgg & { demandIndex: number }) | null = null;
    let surplus: (CountryAgg & { supplyIndex: number }) | null = null;

    for (const a of aggs) {
      const salNorm = normalize(a.medianEur, minS, maxS);
      const volNorm = normalize(a.samples, minN, maxN);
      const demand = salNorm * 0.7 + (1 - volNorm) * 0.3;
      const supply = (1 - salNorm) * 0.5 + volNorm * 0.5;
      if (!shortage || demand > shortage.demandIndex) shortage = { ...a, demandIndex: demand };
      if (!surplus || supply > surplus.supplyIndex) surplus = { ...a, supplyIndex: supply };
    }
    if (!shortage || !surplus || shortage.country === surplus.country) continue;

    const priceDeltaEurCents = shortage.medianEur - surplus.medianEur;
    if (priceDeltaEurCents <= 0) continue;

    const distance = distanceKm(shortage.country, surplus.country);
    const deltaRatio = priceDeltaEurCents / Math.max(1, surplus.medianEur);
    const distanceFactor = distance ? Math.max(0.4, 1 - distance / 12000) : 0.6;
    const score = Math.min(1, (shortage.demandIndex * 0.4 + surplus.supplyIndex * 0.4 + deltaRatio * 0.2) * distanceFactor);
    if (score < 0.35) continue;

    const rationale =
      `${job.displayName} — ${shortage.country} paie ${(shortage.medianEur / 100).toFixed(2)} €/mois ` +
      `avec ${shortage.samples} offres, contre ${(surplus.medianEur / 100).toFixed(2)} €/mois et ${surplus.samples} offres au ${surplus.country}. ` +
      `Écart salarial ${(priceDeltaEurCents / 100).toFixed(2)} € (${(deltaRatio * 100).toFixed(0)}%). ` +
      (distance ? `Distance ~${distance} km.` : "Distance non calculée.");

    try {
      await prisma.arbitrageOpportunity.create({
        data: {
          scope: "job",
          entityId: job.id,
          entityLabel: job.displayName,
          shortageCountry: shortage.country,
          surplusCountry: surplus.country,
          score,
          demandIndex: shortage.demandIndex,
          supplyIndex: surplus.supplyIndex,
          priceDeltaEurCents,
          distanceKm: distance ?? undefined,
          rationale,
          active: true,
        },
      });
      inserted++;
    } catch (err: any) {
      logger.warn({ err: err?.message, jobId: job.id }, "[arbitrage] job insert failed");
    }
  }

  return inserted;
}

// ── Purge + top-N ────────────────────────────────────

async function pruneOld(now: Date) {
  const cutoff = new Date(now.getTime() - PURGE_OLDER_THAN_DAYS * 86400_000);
  const { count } = await prisma.arbitrageOpportunity.deleteMany({ where: { computedAt: { lt: cutoff } } });
  if (count > 0) logger.info({ purged: count }, "[arbitrage] pruned old opportunities");
}

async function keepTopN(scope: "product" | "job") {
  // On garde les TOP_N_PER_SCOPE meilleurs par score, on désactive les autres
  const all = await prisma.arbitrageOpportunity.findMany({
    where: { scope, active: true },
    orderBy: { score: "desc" },
    select: { id: true },
  });
  if (all.length <= TOP_N_PER_SCOPE) return;
  const toDeactivate = all.slice(TOP_N_PER_SCOPE).map((r) => r.id);
  await prisma.arbitrageOpportunity.updateMany({
    where: { id: { in: toDeactivate } },
    data: { active: false },
  });
}

// ── Entrée publique ──────────────────────────────────

export type ArbitrageReport = {
  productOpportunities: number;
  jobOpportunities: number;
  durationMs: number;
};

export async function runArbitrage(): Promise<ArbitrageReport> {
  const started = Date.now();
  const now = new Date();

  await pruneOld(now);
  const productOpportunities = await arbitrateProducts(now);
  const jobOpportunities = await arbitrateJobs(now);
  await keepTopN("product");
  await keepTopN("job");

  const report: ArbitrageReport = {
    productOpportunities,
    jobOpportunities,
    durationMs: Date.now() - started,
  };
  logger.info(report, "[market-intel.arbitrage] done");
  return report;
}
