/**
 * UNIFIED MIDNIGHT SCHEDULER — Kin-Sell
 *
 * Scheduler robuste unique qui s'exécute à 00:00 (configurable) :
 *  1. Lock distribué Redis pour éviter double exécution
 *  2. Catch-up si run manqué (downtime)
 *  3. Orchestre : ingestion externe + KB refresh + internal collection
 *  4. Logs structurés pino
 *
 * Remplace les schedulers KB individuels dans index.ts
 */

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { getRedis } from "../../shared/db/redis.js";
import { prisma } from "../../shared/db/prisma.js";
import { runFullExternalIngestion, type FullIngestionReport } from "./external-intel-orchestrator.service.js";
import { runNightlyKnowledgeBaseRefresh } from "../knowledge-base/knowledge-base.service.js";
import { refreshJobMarketSnapshots, type JobMarketSnapshotRefreshReport } from "../job-analytics/job-market-snapshot-refresh.service.js";

const LOCK_KEY = "ks:midnight-scheduler:lock";
const LAST_RUN_KEY = "ks:midnight-scheduler:last-run";
const LOCK_TTL_SEC = 3600; // 1 hour max lock
const DAY_MS = 24 * 60 * 60 * 1000;

let _schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let _intervalTimer: ReturnType<typeof setInterval> | null = null;

// ── Lock helpers ──

async function acquireLock(): Promise<boolean> {
  try {
    const redis = getRedis();
    if (!redis) return true; // No Redis = single instance, proceed
    const result = await redis.set(LOCK_KEY, process.pid.toString(), "EX", LOCK_TTL_SEC, "NX");
    return result === "OK";
  } catch {
    return true; // Redis error = assume single instance
  }
}

async function releaseLock(): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(LOCK_KEY);
  } catch { /* ignore */ }
}

async function getLastRunDate(): Promise<string | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    return await redis.get(LAST_RUN_KEY);
  } catch {
    return null;
  }
}

async function setLastRunDate(date: string): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(LAST_RUN_KEY, date, "EX", 7 * DAY_MS / 1000); // Auto-expire in 7 days
  } catch { /* ignore */ }
}

// ── Core execution ──

export interface MidnightRunReport {
  date: string;
  externalIngestion: FullIngestionReport | null;
  kbRefresh: { productsUpdated: number; statsRefreshed: number; dailyInsights: any; weeklyInsights: any } | null;
  jobSnapshotRefresh: JobMarketSnapshotRefreshReport | null;
  durationMs: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
  error?: string;
}

async function executeMidnightRun(date?: Date): Promise<MidnightRunReport> {
  const targetDate = date ?? new Date();
  const dateStr = targetDate.toISOString().split("T")[0];
  const startTime = Date.now();

  logger.info(`[MidnightScheduler] ═══ Starting midnight run for ${dateStr} ═══`);

  let externalResult: FullIngestionReport | null = null;
  let kbResult: any = null;
  let jobSnapshotResult: JobMarketSnapshotRefreshReport | null = null;
  let errors: string[] = [];

  // Phase 1: External intelligence ingestion
  try {
    logger.info("[MidnightScheduler] Phase 1/3: External intelligence ingestion...");
    externalResult = await runFullExternalIngestion(targetDate);
    logger.info({
      sources: `${externalResult.successSources}/${externalResult.totalSources}`,
      records: externalResult.totalRecordsStored,
    }, "[MidnightScheduler] Phase 1 complete");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`External ingestion: ${msg}`);
    logger.error(err, "[MidnightScheduler] Phase 1 FAILED");
  }

  // Phase 2: Knowledge Base refresh (internal collection + external blend)
  try {
    logger.info("[MidnightScheduler] Phase 2/3: Knowledge Base refresh...");
    kbResult = await runNightlyKnowledgeBaseRefresh();
    logger.info("[MidnightScheduler] Phase 2 complete");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`KB refresh: ${msg}`);
    logger.error(err, "[MidnightScheduler] Phase 2 FAILED");
  }

  // Phase 3: Job Market Snapshot refresh (blend interne + externe, respecte overrides)
  try {
    logger.info("[MidnightScheduler] Phase 3/3: Job Market Snapshot refresh...");
    jobSnapshotResult = await refreshJobMarketSnapshots(targetDate);
    logger.info({
      created: jobSnapshotResult.zonesCreated,
      updated: jobSnapshotResult.zonesUpdated,
      skippedOverride: jobSnapshotResult.zonesSkippedOverride,
      externalSignalsUsed: jobSnapshotResult.externalSignalsUsed,
    }, "[MidnightScheduler] Phase 3 complete");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Job snapshot refresh: ${msg}`);
    logger.error(err, "[MidnightScheduler] Phase 3 FAILED");
  }

  // Phase 4: Session hygiene — auto-revoke ACTIVE sessions inactives > 30 jours.
  // Évite l'accumulation de sessions orphelines qui augmentent la surface d'attaque.
  try {
    logger.info("[MidnightScheduler] Phase 4: Session hygiene...");
    const staleThreshold = new Date(Date.now() - 30 * DAY_MS);
    const revoked = await prisma.userSession.updateMany({
      where: {
        status: "ACTIVE",
        OR: [
          { lastSeenAt: { lt: staleThreshold } },
          { lastSeenAt: null, createdAt: { lt: staleThreshold } } as any
        ]
      },
      data: { status: "EXPIRED", revokedAt: new Date() }
    });
    logger.info({ revokedCount: revoked.count }, "[MidnightScheduler] Phase 4 complete (stale sessions revoked)");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Session hygiene: ${msg}`);
    logger.error(err, "[MidnightScheduler] Phase 4 FAILED");
  }

  const durationMs = Date.now() - startTime;
  const status = errors.length === 0 ? "SUCCESS" : errors.length < 2 ? "PARTIAL" : "FAILED";

  // Mark run date
  await setLastRunDate(dateStr);

  logger.info({
    date: dateStr,
    status,
    durationSec: Math.round(durationMs / 1000),
    errors: errors.length,
  }, `[MidnightScheduler] ═══ Run complete: ${status} (${Math.round(durationMs / 1000)}s) ═══`);

  // Alert on consecutive failures
  if (status === "FAILED") {
    const recentRuns = await prisma.externalIngestionRun.findMany({
      where: { status: "FAILED" },
      orderBy: { startedAt: "desc" },
      take: 2,
    });
    if (recentRuns.length >= 2) {
      logger.error("[MidnightScheduler] ALERT: 2+ consecutive failed runs detected!");
    }
  }

  return {
    date: dateStr,
    externalIngestion: externalResult,
    kbRefresh: kbResult,
    jobSnapshotRefresh: jobSnapshotResult,
    durationMs,
    status,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

// ── Scheduling ──

function getNextMidnight(): Date {
  const [hours, minutes] = env.MARKET_REFRESH_TIME.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

async function checkAndCatchUp(): Promise<void> {
  const lastRun = await getLastRunDate();
  const today = new Date().toISOString().split("T")[0];

  if (lastRun === today) {
    logger.info("[MidnightScheduler] Today's run already completed, skipping catch-up");
    return;
  }

  if (lastRun) {
    const lastDate = new Date(lastRun);
    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / DAY_MS);
    if (daysSince > 1) {
      logger.warn({ lastRun, daysMissed: daysSince - 1 }, "[MidnightScheduler] Missed runs detected — catching up for today");
    }
  } else {
    logger.info("[MidnightScheduler] No previous run found — executing initial catch-up");
  }

  // Only catch up for today (not historical), to avoid overloading APIs
  const locked = await acquireLock();
  if (!locked) {
    logger.info("[MidnightScheduler] Another instance is running catch-up, skipping");
    return;
  }

  try {
    await executeMidnightRun(new Date());
  } finally {
    await releaseLock();
  }
}

export function startMidnightScheduler(): void {
  const nextRun = getNextMidnight();
  const delay = nextRun.getTime() - Date.now();

  logger.info({
    scheduledTime: env.MARKET_REFRESH_TIME,
    nextRun: nextRun.toISOString(),
    delayHours: Math.round(delay / 3600_000 * 10) / 10,
  }, "[MidnightScheduler] Scheduler initialized");

  // Check for missed runs on startup (after 30s to let everything boot)
  setTimeout(() => {
    void checkAndCatchUp().catch((err) => {
      logger.error(err, "[MidnightScheduler] Catch-up failed");
    });
  }, 30_000);

  // Schedule next midnight run
  _schedulerTimer = setTimeout(() => {
    void runScheduledMidnight();
    // Then repeat every 24h
    _intervalTimer = setInterval(() => {
      void runScheduledMidnight();
    }, DAY_MS);
  }, delay);
}

async function runScheduledMidnight(): Promise<void> {
  const locked = await acquireLock();
  if (!locked) {
    logger.info("[MidnightScheduler] Lock held by another instance, skipping");
    return;
  }

  try {
    await executeMidnightRun();
  } finally {
    await releaseLock();
  }
}

export function stopMidnightScheduler(): void {
  if (_schedulerTimer) { clearTimeout(_schedulerTimer); _schedulerTimer = null; }
  if (_intervalTimer) { clearInterval(_intervalTimer); _intervalTimer = null; }
  logger.info("[MidnightScheduler] Stopped");
}

/** Exécution manuelle (admin) */
export async function triggerManualMidnightRun(): Promise<MidnightRunReport> {
  const locked = await acquireLock();
  if (!locked) {
    return { date: new Date().toISOString().split("T")[0], externalIngestion: null, kbRefresh: null, jobSnapshotRefresh: null, durationMs: 0, status: "SKIPPED", error: "Another run is in progress" };
  }
  try {
    return await executeMidnightRun();
  } finally {
    await releaseLock();
  }
}
