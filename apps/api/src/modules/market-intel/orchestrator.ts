/**
 * Market-Intel Orchestrator
 *
 * Exécute un cycle de crawl pour une ou plusieurs sources :
 *   1. Vérifie le kill-switch ENABLE_MARKET_INTEL
 *   2. Acquiert un mutex Redis par source (ks:market:crawl:{sourceId})
 *   3. Résout le fetcher via resolveFetcher()
 *   4. Met à jour MarketSource.{lastCrawledAt,lastStatus,lastError}
 *   5. Accumule les observations (prix, jobs, signaux) en mémoire,
 *      exposées via getLastBatch(). Pas de persistance MarketPrice/MarketSalary
 *      ici — c'est le rôle de l'aggrégateur (E7) qui calcule médianes + EUR.
 *
 * Note : la persistance brute est intentionnellement déportée pour éviter
 * de polluer la table MarketPrice avec des entrées non-appariées à un
 * produit canonique. E7 fera le matching + l'agrégation.
 */

import { env } from "../../config/env.js";
import { prisma } from "../../shared/db/prisma.js";
import { getRedis } from "../../shared/db/redis.js";
import { logger } from "../../shared/logger.js";
import { resolveFetcher } from "./fetchers/index.js";
import type { FetchResult, MarketSourceRow, PriceObservation, JobObservation } from "./fetchers/base.js";

const LOCK_PREFIX = "ks:market:crawl:";
const LOCK_TTL_SEC = 15 * 60; // 15 min max

export type CrawlReport = {
  sourceId: string;
  sourceName: string;
  parser: string;
  status: "OK" | "EMPTY" | "ERROR" | "SKIPPED" | "LOCKED";
  pricesCount: number;
  jobsCount: number;
  errors: string[];
  durationMs: number;
};

// Cache mémoire des observations récentes (par source) — servira E7
// Limité à 1000 sources × ~200 obs = ~200k. Purge au démarrage.
const observationsCache = new Map<string, { prices: PriceObservation[]; jobs: JobObservation[]; collectedAt: Date }>();

export function getLastBatch(sourceId: string) {
  return observationsCache.get(sourceId);
}

export function getAllObservations(): { prices: PriceObservation[]; jobs: JobObservation[] } {
  const prices: PriceObservation[] = [];
  const jobs: JobObservation[] = [];
  for (const batch of observationsCache.values()) {
    prices.push(...batch.prices);
    jobs.push(...batch.jobs);
  }
  return { prices, jobs };
}

export function clearObservations(): void {
  observationsCache.clear();
}

// ── Mutex ──
async function acquireLock(sourceId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // single instance fallback
  try {
    const key = `${LOCK_PREFIX}${sourceId}`;
    const res = await redis.set(key, process.pid.toString(), "EX", LOCK_TTL_SEC, "NX");
    return res === "OK";
  } catch {
    return true;
  }
}

async function releaseLock(sourceId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`${LOCK_PREFIX}${sourceId}`);
  } catch {
    /* ignore */
  }
}

// ── Crawl d'une source unique ──
export async function crawlSource(sourceId: string): Promise<CrawlReport> {
  const startedAt = Date.now();

  if (!env.ENABLE_MARKET_INTEL) {
    return {
      sourceId,
      sourceName: "-",
      parser: "-",
      status: "SKIPPED",
      pricesCount: 0,
      jobsCount: 0,
      errors: ["ENABLE_MARKET_INTEL=false"],
      durationMs: 0,
    };
  }

  const source = await prisma.marketSource.findUnique({ where: { id: sourceId } });
  if (!source || !source.active) {
    return {
      sourceId,
      sourceName: source?.name ?? "?",
      parser: source?.parser ?? "?",
      status: "SKIPPED",
      pricesCount: 0,
      jobsCount: 0,
      errors: [source ? "inactive" : "not found"],
      durationMs: Date.now() - startedAt,
    };
  }

  const locked = await acquireLock(sourceId);
  if (!locked) {
    return {
      sourceId,
      sourceName: source.name,
      parser: source.parser,
      status: "LOCKED",
      pricesCount: 0,
      jobsCount: 0,
      errors: ["another worker holds the lock"],
      durationMs: Date.now() - startedAt,
    };
  }

  const row: MarketSourceRow = {
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    type: source.type,
    countryCode: source.countryCode,
    parser: source.parser,
    language: source.language,
    trusted: source.trusted,
  };

  let result: FetchResult | null = null;
  let status: CrawlReport["status"] = "OK";
  const errors: string[] = [];

  try {
    const fetcher = resolveFetcher(row);
    result = await fetcher.crawl(row);
    if (!result.ok) {
      status = "ERROR";
      errors.push(...result.errors.slice(0, 5));
    } else if (result.prices.length === 0 && result.jobs.length === 0) {
      status = "EMPTY";
    }
  } catch (err: any) {
    status = "ERROR";
    errors.push(err?.message ?? String(err));
    logger.error({ err: err?.message, sourceId, source: source.name }, "[market-intel] crawl threw");
  } finally {
    await releaseLock(sourceId);
  }

  // Persist observations en cache mémoire
  if (result) {
    observationsCache.set(sourceId, {
      prices: result.prices,
      jobs: result.jobs,
      collectedAt: new Date(),
    });
  }

  // Mise à jour MarketSource
  try {
    await prisma.marketSource.update({
      where: { id: sourceId },
      data: {
        lastCrawledAt: new Date(),
        lastStatus: status,
        lastError: errors.length > 0 ? errors.join(" | ").slice(0, 500) : null,
      },
    });
  } catch (err: any) {
    logger.warn({ err: err?.message, sourceId }, "[market-intel] failed to update source status");
  }

  return {
    sourceId,
    sourceName: source.name,
    parser: source.parser,
    status,
    pricesCount: result?.prices.length ?? 0,
    jobsCount: result?.jobs.length ?? 0,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

// ── Sélection des sources à crawler ──

export async function pickDueSources(type: string, limit: number): Promise<{ id: string }[]> {
  return prisma.marketSource.findMany({
    where: { type, active: true },
    select: { id: true },
    orderBy: [{ lastCrawledAt: { sort: "asc", nulls: "first" } }],
    take: limit,
  });
}

// ── Exécute un cycle batch ──

export type CycleReport = {
  type: string;
  processed: number;
  ok: number;
  errors: number;
  empty: number;
  locked: number;
  totalPrices: number;
  totalJobs: number;
  durationMs: number;
};

export async function runCrawlCycle(type: string, limit: number): Promise<CycleReport> {
  const startedAt = Date.now();
  const report: CycleReport = {
    type,
    processed: 0,
    ok: 0,
    errors: 0,
    empty: 0,
    locked: 0,
    totalPrices: 0,
    totalJobs: 0,
    durationMs: 0,
  };

  if (!env.ENABLE_MARKET_INTEL) {
    logger.info({ type }, "[market-intel] cycle skipped (kill-switch)");
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  const sources = await pickDueSources(type, limit);
  logger.info({ type, count: sources.length }, "[market-intel] cycle starting");

  for (const { id } of sources) {
    const res = await crawlSource(id);
    report.processed++;
    report.totalPrices += res.pricesCount;
    report.totalJobs += res.jobsCount;
    if (res.status === "OK") report.ok++;
    else if (res.status === "EMPTY") report.empty++;
    else if (res.status === "LOCKED") report.locked++;
    else if (res.status === "ERROR") report.errors++;
  }

  report.durationMs = Date.now() - startedAt;
  logger.info(
    {
      type,
      processed: report.processed,
      ok: report.ok,
      empty: report.empty,
      errors: report.errors,
      prices: report.totalPrices,
      jobs: report.totalJobs,
      durationMs: report.durationMs,
    },
    "[market-intel] cycle done",
  );
  return report;
}
