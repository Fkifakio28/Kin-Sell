/**
 * Market-Intel Scheduler
 *
 * Démarre 4 boucles indépendantes (via setInterval + staggering) qui
 * appellent runCrawlCycle(type, batchSize). Mutex Redis par source
 * géré par l'orchestrateur — compatible multi-instance PM2.
 *
 * Planning (paliers honnêtes, ajustables via env) :
 *   news      → toutes les 6h,    batch 30 sources
 *   marketplace/classifieds → 24h (batch 25, rotation sur ~20 sources/jour)
 *   jobs      → toutes les 48h,   batch 20
 *   stats     → toutes les 168h (hebdo),  batch 40
 *
 * Délai initial de 60s pour laisser l'API se stabiliser.
 * Le scheduler ne démarre PAS si ENABLE_MARKET_INTEL=false.
 */

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { runCrawlCycle } from "./orchestrator.js";
import { prisma } from "../../shared/db/prisma.js";
import { runAggregation } from "./aggregator.js";
import { computeTrends } from "./trends.js";
import { runArbitrage } from "./arbitrage.js";

type SchedEntry = {
  type: string;
  intervalMs: number;
  batchSize: number;
  timer?: ReturnType<typeof setInterval>;
};

const SCHEDULE: SchedEntry[] = [
  { type: "news",         intervalMs: 6 * 60 * 60 * 1000,  batchSize: 30 },
  { type: "marketplace",  intervalMs: 24 * 60 * 60 * 1000, batchSize: 25 },
  { type: "classifieds",  intervalMs: 24 * 60 * 60 * 1000, batchSize: 25 },
  { type: "jobs",         intervalMs: 48 * 60 * 60 * 1000, batchSize: 20 },
  { type: "stats",        intervalMs: 7 * 24 * 60 * 60 * 1000, batchSize: 40 },
];

let started = false;
let aggTimer: ReturnType<typeof setInterval> | undefined;

export async function startMarketIntelScheduler(): Promise<void> {
  if (started) {
    logger.warn("[market-intel] scheduler already started");
    return;
  }

  if (!env.ENABLE_MARKET_INTEL) {
    logger.info("[market-intel] scheduler disabled (ENABLE_MARKET_INTEL=false)");
    return;
  }

  // Sanity check: MarketSource seedé ?
  try {
    const sourceCount = await prisma.marketSource.count({ where: { active: true } });
    const jobCount = await prisma.marketJob.count();
    if (sourceCount === 0) {
      logger.warn(
        "[market-intel] MarketSource table empty — run `npx tsx prisma/seed-market-sources.ts` in packages/db. Scheduler started but will idle.",
      );
    }
    if (jobCount === 0) {
      logger.warn(
        "[market-intel] MarketJob table empty — run `npx tsx prisma/seed-market-intel.ts` in packages/db.",
      );
    }
    logger.info(
      { activeSources: sourceCount, jobs: jobCount },
      "[market-intel] scheduler starting",
    );
  } catch (err: any) {
    logger.error({ err: err?.message }, "[market-intel] bootstrap check failed — scheduler NOT started");
    return;
  }

  // Démarrage des boucles avec staggering (chaque type démarre avec 60s d'écart)
  SCHEDULE.forEach((entry, idx) => {
    const initialDelay = 60_000 + idx * 60_000;

    setTimeout(() => {
      void runCrawlCycle(entry.type, entry.batchSize).catch((err) =>
        logger.error({ err: err?.message, type: entry.type }, "[market-intel] initial cycle failed"),
      );
      entry.timer = setInterval(() => {
        void runCrawlCycle(entry.type, entry.batchSize).catch((err) =>
          logger.error({ err: err?.message, type: entry.type }, "[market-intel] cycle failed"),
        );
      }, entry.intervalMs);
      logger.info(
        { type: entry.type, intervalMs: entry.intervalMs, batchSize: entry.batchSize },
        "[market-intel] cycle scheduled",
      );
    }, initialDelay);
  });

  started = true;
  logger.info("[market-intel] scheduler started — 5 cycles armed (news, marketplace, classifieds, jobs, stats)");

  // Agrégation + trends : boucle séparée toutes les 24h (décalée de +90min
  // pour laisser les cycles marketplace/classifieds s'achever avant)
  const AGG_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const AGG_INITIAL_DELAY_MS = 90 * 60 * 1000;

  setTimeout(() => {
    void (async () => {
      try {
        const aggReport = await runAggregation();
        logger.info(aggReport, "[market-intel] aggregation cycle");
        const trendsReport = await computeTrends();
        logger.info(trendsReport, "[market-intel] trends cycle");
        const arbReport = await runArbitrage();
        logger.info(arbReport, "[market-intel] arbitrage cycle");
      } catch (err: any) {
        logger.error({ err: err?.message }, "[market-intel] agg/trends/arb initial cycle failed");
      }
    })();
    aggTimer = setInterval(() => {
      void (async () => {
        try {
          await runAggregation();
          await computeTrends();
          await runArbitrage();
        } catch (err: any) {
          logger.error({ err: err?.message }, "[market-intel] agg/trends/arb cycle failed");
        }
      })();
    }, AGG_INTERVAL_MS);
    logger.info({ intervalMs: AGG_INTERVAL_MS }, "[market-intel] aggregation cycle scheduled");
  }, AGG_INITIAL_DELAY_MS);
}

export function stopMarketIntelScheduler(): void {
  for (const entry of SCHEDULE) {
    if (entry.timer) {
      clearInterval(entry.timer);
      entry.timer = undefined;
    }
  if (aggTimer) {
    clearInterval(aggTimer);
    aggTimer = undefined;
  }
  }
  started = false;
  logger.info("[market-intel] scheduler stopped");
}

export function isMarketIntelSchedulerStarted(): boolean {
  return started;
}
