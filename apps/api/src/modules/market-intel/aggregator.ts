/**
 * Aggregator — Kin-Sell Analytique+
 *
 * Post-processing des observations brutes du scheduler :
 *   1. Charge `MarketProduct` + `MarketJob` (ancres canoniques)
 *   2. Matche chaque observation à une ancre par heuristique (brand + tokens)
 *   3. Calcule min/max/médiane en devise locale + conversion EUR cents
 *   4. Upsert dans `MarketPrice` / `MarketSalary` (clé logique =
 *      productId+countryCode pour le jour, on remplace la ligne du jour)
 *   5. Repère les (product|job) × pays sans données et appelle Gemini
 *      en fallback (1 appel par pays × type, quota respecté par E6)
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import { toEurCents } from "./fx/fx.service.js";
import { getAllObservations, clearObservations } from "./orchestrator.js";
import type { PriceObservation, JobObservation } from "./fetchers/base.js";
import { estimatePrices, estimateSalaries } from "./gemini-fallback.js";

// ── Constantes ──────────────────────────────────────────

const COUNTRIES = ["MA", "CI", "SN", "CD", "GA", "CG", "GN", "AO"];

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  MA: "MAD", CI: "XOF", SN: "XOF", CD: "CDF", GA: "XAF", CG: "XAF", GN: "GNF", AO: "AOA",
};

// Zones monétaires où "EUR" dans un scrape est TRÈS probablement une erreur
// (le site affiche le prix en devise locale mais notre parser a pris la
// conversion affichée en euros à côté). Dans ce cas on force la devise
// locale pour l'observation afin d'éviter un prix ridicule type "Corolla 50 €".
const NON_EUR_COUNTRIES = new Set(["MA", "CI", "SN", "CD", "GA", "CG", "GN", "AO", "CM", "TD"]);

// Bornes de sanité par devise locale (prix d'article) — rejet hors bornes.
// Tout produit réel à moins du min ou plus du max est considéré aberrant.
const PRICE_BOUNDS_LOCAL: Record<string, { min: number; max: number }> = {
  EUR: { min: 1, max: 500_000 },          // 1 € à 500 k€
  MAD: { min: 5, max: 5_000_000 },        // ~0.5 € à ~500 k€
  XOF: { min: 500, max: 300_000_000 },    // ~0.75 € à ~500 k€
  XAF: { min: 500, max: 300_000_000 },
  CDF: { min: 2_000, max: 1_500_000_000 },// ~0.7 € à ~500 k€
  GNF: { min: 5_000, max: 4_000_000_000 },
  AOA: { min: 500, max: 500_000_000 },
  USD: { min: 1, max: 500_000 },
};

// Bornes de sanité salaires mensuels locaux.
const SALARY_BOUNDS_LOCAL: Record<string, { min: number; max: number }> = {
  EUR: { min: 100, max: 50_000 },
  MAD: { min: 1_000, max: 500_000 },
  XOF: { min: 50_000, max: 30_000_000 },
  XAF: { min: 50_000, max: 30_000_000 },
  CDF: { min: 200_000, max: 150_000_000 },
  GNF: { min: 500_000, max: 400_000_000 },
  AOA: { min: 50_000, max: 50_000_000 },
  USD: { min: 100, max: 50_000 },
};

function normalizeCurrencyForCountry(currency: string | undefined, country: string): string {
  const cur = (currency ?? "").toUpperCase();
  // Si scrape ne donne pas de devise, utiliser celle du pays.
  if (!cur) return CURRENCY_BY_COUNTRY[country] ?? "EUR";
  // Override anti-affichage-EUR-trompeur hors zone euro.
  if (cur === "EUR" && NON_EUR_COUNTRIES.has(country)) {
    return CURRENCY_BY_COUNTRY[country] ?? "EUR";
  }
  return cur;
}

function isPriceInRange(value: number, currency: string): boolean {
  const b = PRICE_BOUNDS_LOCAL[currency.toUpperCase()];
  if (!b) return value > 0; // devise inconnue → on accepte juste > 0
  return value >= b.min && value <= b.max;
}

function isSalaryInRange(value: number, currency: string): boolean {
  const b = SALARY_BOUNDS_LOCAL[currency.toUpperCase()];
  if (!b) return value > 0;
  return value >= b.min && value <= b.max;
}

// ── Tokenisation / matching ────────────────────────────

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.min(a.size, b.size);
}

type Anchor<T> = { entity: T; tokens: Set<string>; brandToken?: string };

function bestMatch<T>(title: string, anchors: Anchor<T>[]): T | null {
  const titleTokens = tokens(title);
  let best: { entity: T; score: number } | null = null;

  for (const a of anchors) {
    let score = overlap(titleTokens, a.tokens);
    if (a.brandToken && titleTokens.has(a.brandToken)) score += 0.2;
    if (score >= 0.5 && (!best || score > best.score)) {
      best = { entity: a.entity, score };
    }
  }
  return best?.entity ?? null;
}

// ── Agrégation statistique ────────────────────────────

function computeStats(values: number[]): { min: number; max: number; median: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  return { min: sorted[0], max: sorted[n - 1], median };
}

// ── Aggregator — prix ─────────────────────────────────

type PriceGroup = {
  productId: string;
  countryCode: string;
  currency: string;
  values: number[];
  sourceIds: Set<string>;
};

async function aggregatePrices(observations: PriceObservation[]): Promise<{
  upserted: number;
  matched: number;
  unmatched: number;
  coverage: Record<string, Set<string>>; // productId → pays couverts
}> {
  const products = await prisma.marketProduct.findMany();
  const productAnchors: Anchor<(typeof products)[number]>[] = products.map((p) => ({
    entity: p,
    tokens: tokens(`${p.displayName} ${p.canonicalBrand ?? ""} ${p.slug.replace(/-/g, " ")}`),
    brandToken: p.canonicalBrand ? p.canonicalBrand.toLowerCase() : undefined,
  }));

  // Groupe les observations (productId × countryCode)
  const groups = new Map<string, PriceGroup>();
  const coverage: Record<string, Set<string>> = {};
  let matched = 0;
  let unmatched = 0;

  // Retrouver le countryCode via la source (join)
  const sourceIds = [...new Set(observations.map((o) => o.sourceId))];
  const sources = sourceIds.length
    ? await prisma.marketSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, countryCode: true } })
    : [];
  const sourceCountry = new Map(sources.map((s) => [s.id, s.countryCode]));

  for (const obs of observations) {
    // On ignore les "signaux" (news-rss) — gérés par trends.ts
    if (obs.currency === "SIGNAL" || obs.priceLocal <= 0) continue;

    const country = sourceCountry.get(obs.sourceId);
    if (!country) continue;

    // Normalise la devise : anti "EUR" trompeur en zone locale + fallback pays.
    const normalizedCurrency = normalizeCurrencyForCountry(obs.currency, country);

    // Rejet des prix aberrants (outliers qui cassent la médiane).
    if (!isPriceInRange(obs.priceLocal, normalizedCurrency)) {
      continue;
    }

    const product = bestMatch(obs.title, productAnchors);
    if (!product) {
      unmatched++;
      continue;
    }
    matched++;

    const key = `${product.id}|${country}`;
    const group = groups.get(key) ?? {
      productId: product.id,
      countryCode: country,
      currency: normalizedCurrency,
      values: [],
      sourceIds: new Set(),
    };
    group.values.push(obs.priceLocal);
    group.sourceIds.add(obs.sourceId);
    groups.set(key, group);

    (coverage[product.id] ??= new Set()).add(country);
  }

  let upserted = 0;
  for (const group of groups.values()) {
    if (group.values.length === 0) continue;
    const stats = computeStats(group.values);
    const eurCents = await toEurCents(stats.median, group.currency);

    try {
      await prisma.marketPrice.create({
        data: {
          productId: group.productId,
          countryCode: group.countryCode,
          priceMinLocal: stats.min,
          priceMaxLocal: stats.max,
          priceMedianLocal: stats.median,
          localCurrency: group.currency,
          priceMedianEurCents: eurCents,
          sampleSize: group.values.length,
          sourceIds: [...group.sourceIds],
          confidence: Math.min(1, 0.4 + group.values.length * 0.05),
        },
      });
      upserted++;
    } catch (err: any) {
      logger.warn({ err: err?.message, productId: group.productId, country: group.countryCode }, "[agg] price insert failed");
    }
  }

  return { upserted, matched, unmatched, coverage };
}

// ── Aggregator — jobs ─────────────────────────────────

type JobGroup = {
  jobId: string;
  countryCode: string;
  currency: string;
  values: number[];
  sourceIds: Set<string>;
};

async function aggregateJobs(observations: JobObservation[]): Promise<{
  upserted: number;
  matched: number;
  unmatched: number;
  coverage: Record<string, Set<string>>;
}> {
  const jobs = await prisma.marketJob.findMany();
  const anchors: Anchor<(typeof jobs)[number]>[] = jobs.map((j) => ({
    entity: j,
    tokens: tokens(`${j.displayName} ${j.slug.replace(/-/g, " ")}`),
  }));

  const groups = new Map<string, JobGroup>();
  const coverage: Record<string, Set<string>> = {};
  let matched = 0;
  let unmatched = 0;

  const sourceIds = [...new Set(observations.map((o) => o.sourceId))];
  const sources = sourceIds.length
    ? await prisma.marketSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, countryCode: true } })
    : [];
  const sourceCountry = new Map(sources.map((s) => [s.id, s.countryCode]));

  for (const obs of observations) {
    const country = sourceCountry.get(obs.sourceId);
    if (!country) continue;
    const job = bestMatch(obs.title, anchors);
    if (!job) {
      unmatched++;
      continue;
    }
    matched++;

    // Certaines offres n'ont pas de salaire → on compte quand même comme "couverture"
    (coverage[job.id] ??= new Set()).add(country);
    const sal = obs.salaryMinLocal ?? obs.salaryMaxLocal;
    if (!sal || sal <= 0) continue;

    const normalizedCurrency = normalizeCurrencyForCountry(obs.currency, country);

    // Rejet salaires hors bornes (annonces "volontariat 0 €" ou PDG cheaté).
    const minVal = obs.salaryMinLocal ?? sal;
    if (!isSalaryInRange(minVal, normalizedCurrency)) continue;
    if (obs.salaryMaxLocal && !isSalaryInRange(obs.salaryMaxLocal, normalizedCurrency)) continue;

    const key = `${job.id}|${country}`;
    const group = groups.get(key) ?? {
      jobId: job.id,
      countryCode: country,
      currency: normalizedCurrency,
      values: [],
      sourceIds: new Set(),
    };
    group.values.push(minVal);
    if (obs.salaryMaxLocal && obs.salaryMaxLocal !== obs.salaryMinLocal) group.values.push(obs.salaryMaxLocal);
    group.sourceIds.add(obs.sourceId);
    groups.set(key, group);
  }

  let upserted = 0;
  for (const group of groups.values()) {
    if (group.values.length === 0) continue;
    const stats = computeStats(group.values);
    const eurCents = await toEurCents(stats.median, group.currency);
    try {
      await prisma.marketSalary.create({
        data: {
          jobId: group.jobId,
          countryCode: group.countryCode,
          salaryMinLocal: stats.min,
          salaryMaxLocal: stats.max,
          salaryMedianLocal: stats.median,
          localCurrency: group.currency,
          salaryMedianEurCents: eurCents,
          unit: "month",
          sampleSize: group.values.length,
          sourceIds: [...group.sourceIds],
          confidence: Math.min(1, 0.4 + group.values.length * 0.05),
        },
      });
      upserted++;
    } catch (err: any) {
      logger.warn({ err: err?.message, jobId: group.jobId, country: group.countryCode }, "[agg] salary insert failed");
    }
  }

  return { upserted, matched, unmatched, coverage };
}

// ── Gemini fallback pour les trous ─────────────────────

async function fillPriceGaps(coverage: Record<string, Set<string>>): Promise<{ geminiCalls: number; estimatesAdded: number }> {
  const allProducts = await prisma.marketProduct.findMany();
  let geminiCalls = 0;
  let estimatesAdded = 0;

  // Donnu00e9es internes/baseline récentes (30 j) avec confidence >= 0.60 = couverture suffisante
  const since = new Date(Date.now() - 30 * 86400_000);
  const covered = await prisma.marketPrice.findMany({
    where: { collectedAt: { gte: since }, confidence: { gte: 0.60 } },
    select: { productId: true, countryCode: true },
  });
  const internalCov: Record<string, Set<string>> = {};
  for (const c of covered) {
    (internalCov[c.productId] ??= new Set()).add(c.countryCode);
  }

  for (const country of COUNTRIES) {
    const missing: typeof allProducts = allProducts.filter(
      (p) => !coverage[p.id]?.has(country) && !internalCov[p.id]?.has(country),
    );
    if (missing.length === 0) continue;
    if (missing.length < 10) continue; // Seuil durçç: Gemini uniquement si u2265 10 vrais trous par pays

    const labels = missing.slice(0, 20).map((p) => p.displayName);
    const result = await estimatePrices(labels, {
      reason: `coverage-gap-${missing.length}-products`,
      countryCode: country,
      language: country === "AO" ? "pt" : "fr",
    });
    geminiCalls++;
    if (!result) continue;

    for (const est of result.estimates) {
      const match = missing.find(
        (p) =>
          p.displayName.toLowerCase() === est.productLabel.toLowerCase() ||
          tokens(p.displayName).has(est.productLabel.toLowerCase().split(" ")[0]),
      );
      if (!match) continue;

      // Validation anti-hallucination Gemini : prix dans bornes locales.
      const estCurrency = normalizeCurrencyForCountry(est.localCurrency, country);
      if (!isPriceInRange(est.priceMedianLocal, estCurrency)) {
        logger.warn({ country, product: est.productLabel, median: est.priceMedianLocal, currency: estCurrency }, "[agg.gemini] price estimate out of range — rejected");
        continue;
      }

      const eurCents = await toEurCents(est.priceMedianLocal, estCurrency);
      try {
        await prisma.marketPrice.create({
          data: {
            productId: match.id,
            countryCode: country,
            priceMinLocal: est.priceMinLocal,
            priceMaxLocal: est.priceMaxLocal,
            priceMedianLocal: est.priceMedianLocal,
            localCurrency: estCurrency,
            priceMedianEurCents: eurCents,
            sampleSize: est.sampleSize ?? 1,
            sourceIds: [],
            confidence: Math.min(est.confidence, 0.6), // plafond: données Gemini < crawl
          },
        });
        estimatesAdded++;
      } catch (err: any) {
        logger.warn({ err: err?.message, productId: match.id, country }, "[agg.gemini] price insert failed");
      }
    }
  }

  return { geminiCalls, estimatesAdded };
}

async function fillSalaryGaps(coverage: Record<string, Set<string>>): Promise<{ geminiCalls: number; estimatesAdded: number }> {
  const allJobs = await prisma.marketJob.findMany();
  let geminiCalls = 0;

  const since = new Date(Date.now() - 30 * 86400_000);
  const covered = await prisma.marketSalary.findMany({
    where: { collectedAt: { gte: since }, confidence: { gte: 0.60 } },
    select: { jobId: true, countryCode: true },
  });
  const internalCov: Record<string, Set<string>> = {};
  for (const c of covered) {
    (internalCov[c.jobId] ??= new Set()).add(c.countryCode);
  }
  let estimatesAdded = 0;

  for (const country of COUNTRIES) {
    const missing = allJobs.filter((j) => !coverage[j.id]?.has(country) && !internalCov[j.id]?.has(country));
    if (missing.length < 10) continue; // Durcç: Gemini seulement si ≥ 10 vrais trous par pays

    const labels = missing.slice(0, 20).map((j) => j.displayName);
    const result = await estimateSalaries(labels, {
      reason: `coverage-gap-${missing.length}-jobs`,
      countryCode: country,
      language: country === "AO" ? "pt" : "fr",
    });
    geminiCalls++;
    if (!result) continue;

    for (const est of result.estimates) {
      const match = missing.find(
        (j) => j.displayName.toLowerCase() === est.jobLabel.toLowerCase(),
      );
      if (!match) continue;

      // Validation anti-hallucination Gemini : salaire dans bornes locales.
      const estCurrency = normalizeCurrencyForCountry(est.localCurrency, country);
      if (!isSalaryInRange(est.salaryMedianLocal, estCurrency)) {
        logger.warn({ country, job: est.jobLabel, median: est.salaryMedianLocal, currency: estCurrency }, "[agg.gemini] salary estimate out of range — rejected");
        continue;
      }

      const eurCents = await toEurCents(est.salaryMedianLocal, estCurrency);
      try {
        await prisma.marketSalary.create({
          data: {
            jobId: match.id,
            countryCode: country,
            salaryMinLocal: est.salaryMinLocal,
            salaryMaxLocal: est.salaryMaxLocal,
            salaryMedianLocal: est.salaryMedianLocal,
            localCurrency: estCurrency,
            salaryMedianEurCents: eurCents,
            unit: est.unit ?? "month",
            sampleSize: est.sampleSize ?? 1,
            sourceIds: [],
            confidence: Math.min(est.confidence, 0.6),
          },
        });
        estimatesAdded++;
      } catch (err: any) {
        logger.warn({ err: err?.message, jobId: match.id, country }, "[agg.gemini] salary insert failed");
      }
    }
  }

  return { geminiCalls, estimatesAdded };
}

// ── Entrée publique ────────────────────────────────────

export type AggregationReport = {
  pricesUpserted: number;
  salariesUpserted: number;
  pricesMatched: number;
  pricesUnmatched: number;
  jobsMatched: number;
  jobsUnmatched: number;
  geminiCalls: number;
  geminiEstimatesAdded: number;
  durationMs: number;
};

export async function runAggregation(opts?: { skipGemini?: boolean }): Promise<AggregationReport> {
  const startedAt = Date.now();
  const { prices, jobs } = getAllObservations();

  logger.info({ prices: prices.length, jobs: jobs.length }, "[market-intel.agg] starting aggregation");

  const priceRes = await aggregatePrices(prices);
  const jobRes = await aggregateJobs(jobs);

  let geminiCalls = 0;
  let geminiAdded = 0;
  if (!opts?.skipGemini) {
    const priceFill = await fillPriceGaps(priceRes.coverage);
    const jobFill = await fillSalaryGaps(jobRes.coverage);
    geminiCalls = priceFill.geminiCalls + jobFill.geminiCalls;
    geminiAdded = priceFill.estimatesAdded + jobFill.estimatesAdded;
  }

  // Purge les observations traitées (fenêtre glissante : on garde ~24h)
  clearObservations();

  const report: AggregationReport = {
    pricesUpserted: priceRes.upserted,
    salariesUpserted: jobRes.upserted,
    pricesMatched: priceRes.matched,
    pricesUnmatched: priceRes.unmatched,
    jobsMatched: jobRes.matched,
    jobsUnmatched: jobRes.unmatched,
    geminiCalls,
    geminiEstimatesAdded: geminiAdded,
    durationMs: Date.now() - startedAt,
  };
  logger.info(report, "[market-intel.agg] done");
  return report;
}
