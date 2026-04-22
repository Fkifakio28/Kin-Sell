/**
 * EXTERNAL INTELLIGENCE ORCHESTRATOR — Kin-Sell
 *
 * Orchestre l'ingestion de toutes les sources externes :
 *  - World Bank (GDP, inflation, FX)
 *  - FAOSTAT (prix alimentaires)
 *  - UN Comtrade (flux commerciaux)
 *  - UNCTAD (commodités)
 *  - Open-Meteo (météo/saisonnalité)
 *  - ECB (taux de change)
 *  - Jooble (emploi)
 *  - Adzuna (emploi)
 *  - Calendrier saisonnier (événements statiques)
 *
 * Persiste dans ExternalMarketSignalDaily, ExternalJobSignalDaily,
 * ExternalSeasonalSignalDaily + logs dans ExternalIngestionRun.
 */

import { prisma } from "../../shared/db/prisma.js";
import { CountryCode } from "../../shared/db/prisma-enums.js";
import { logger } from "../../shared/logger.js";
import type { NormalizedMarketSignal, NormalizedJobSignal, NormalizedSeasonalSignal, ProviderResult } from "./types.js";

import { fetchWorldBankSignals } from "./worldbank.provider.js";
import { fetchIlostatSignals } from "./ilostat.provider.js";
import { fetchFaostatSignals } from "./faostat.provider.js";
import { fetchComtradeSignals } from "./comtrade.provider.js";
import { fetchUnctadSignals } from "./unctad.provider.js";
import { fetchOpenMeteoSignals } from "./openmeteo.provider.js";
import { fetchEcbFxSignals } from "./ecbfx.provider.js";
import { fetchJoobleSignals } from "./jobs-jooble.provider.js";
import { fetchAdzunaSignals } from "./jobs-adzuna.provider.js";
import { fetchAfricaJobsSignals } from "./jobs-africa.provider.js";
import { fetchSeasonalCalendarSignals } from "./seasonal-calendar.provider.js";

// ── Types ──

interface IngestionResult {
  source: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  recordsFetched: number;
  recordsStored: number;
  errors: string[];
  latencyMs: number;
}

export interface FullIngestionReport {
  date: string;
  totalSources: number;
  successSources: number;
  partialSources: number;
  failedSources: number;
  totalRecordsFetched: number;
  totalRecordsStored: number;
  results: IngestionResult[];
  durationMs: number;
}

// ── Source registry ──

async function ensureSource(name: string, type: string, baseUrl: string): Promise<string> {
  const existing = await prisma.externalDataSource.findUnique({ where: { name } });
  if (existing) return existing.id;
  const created = await prisma.externalDataSource.create({
    data: { name, type, baseUrl, license: "OPEN", refreshCadence: "DAILY" },
  });
  return created.id;
}

// ── Persist signals ──

async function persistMarketSignals(signals: NormalizedMarketSignal[], sourceId: string): Promise<number> {
  let stored = 0;
  for (const s of signals) {
    try {
      await prisma.externalMarketSignalDaily.upsert({
        where: {
          date_countryCode_category_sourceId_signalType: {
            date: s.date,
            countryCode: s.countryCode as CountryCode,
            category: s.category,
            sourceId,
            signalType: s.signalType,
          },
        },
        create: {
          date: s.date,
          countryCode: s.countryCode as CountryCode,
          city: s.city,
          category: s.category,
          subcategory: s.subcategory,
          sourceId,
          signalType: s.signalType,
          value: s.value,
          unit: s.unit,
          previousValue: s.previousValue,
          deltaPercent: s.deltaPercent,
          confidence: s.confidence,
          sourceUrl: s.sourceUrl,
          metadata: s.metadata as any,
        },
        update: {
          value: s.value,
          previousValue: s.previousValue,
          deltaPercent: s.deltaPercent,
          confidence: s.confidence,
          observedAt: new Date(),
          metadata: s.metadata as any,
        },
      });
      stored++;
    } catch (err: unknown) {
      // Unique constraint or other — skip silently
    }
  }
  return stored;
}

async function persistJobSignals(signals: NormalizedJobSignal[], sourceId: string): Promise<number> {
  let stored = 0;
  for (const s of signals) {
    try {
      await prisma.externalJobSignalDaily.upsert({
        where: {
          date_countryCode_serviceType_sourceId: {
            date: s.date,
            countryCode: s.countryCode as CountryCode,
            serviceType: s.serviceType,
            sourceId,
          },
        },
        create: {
          date: s.date,
          countryCode: s.countryCode as CountryCode,
          city: s.city,
          serviceType: s.serviceType,
          category: s.category,
          sourceId,
          jobCount: s.jobCount,
          avgSalaryLocal: s.avgSalaryLocal,
          avgSalaryUsd: s.avgSalaryUsd,
          demandTrend: s.demandTrend,
          topSkills: s.topSkills,
          confidence: s.confidence,
          sourceUrl: s.sourceUrl,
          metadata: s.metadata as any,
        },
        update: {
          jobCount: s.jobCount,
          avgSalaryLocal: s.avgSalaryLocal,
          avgSalaryUsd: s.avgSalaryUsd,
          demandTrend: s.demandTrend,
          topSkills: s.topSkills,
          confidence: s.confidence,
          observedAt: new Date(),
          metadata: s.metadata as any,
        },
      });
      stored++;
    } catch { /* skip */ }
  }
  return stored;
}

async function persistSeasonalSignals(signals: NormalizedSeasonalSignal[], sourceId: string): Promise<number> {
  let stored = 0;
  for (const s of signals) {
    try {
      await prisma.externalSeasonalSignalDaily.upsert({
        where: {
          date_countryCode_signalType_sourceId: {
            date: s.date,
            countryCode: s.countryCode as CountryCode,
            signalType: s.signalType,
            sourceId,
          },
        },
        create: {
          date: s.date,
          countryCode: s.countryCode as CountryCode,
          city: s.city,
          signalType: s.signalType,
          eventName: s.eventName,
          impactCategory: s.impactCategory,
          severity: s.severity,
          priceImpact: s.priceImpact,
          demandImpact: s.demandImpact,
          sourceId,
          confidence: s.confidence,
          sourceUrl: s.sourceUrl,
          metadata: s.metadata as any,
        },
        update: {
          severity: s.severity,
          priceImpact: s.priceImpact,
          demandImpact: s.demandImpact,
          confidence: s.confidence,
          observedAt: new Date(),
          metadata: s.metadata as any,
        },
      });
      stored++;
    } catch { /* skip */ }
  }
  return stored;
}

// ── Run single provider ──

async function runProvider<T>(
  name: string,
  type: string,
  baseUrl: string,
  fetchFn: (date: Date) => Promise<ProviderResult<T>>,
  persistFn: (signals: T[], sourceId: string) => Promise<number>,
  date: Date,
): Promise<IngestionResult> {
  const sourceId = await ensureSource(name, type, baseUrl);
  const runStart = Date.now();

  // Create ingestion run log
  const run = await prisma.externalIngestionRun.create({
    data: { sourceId, runDate: date, status: "RUNNING" },
  });

  try {
    const result = await fetchFn(date);
    const stored = await persistFn(result.data as T[], sourceId);

    const status = !result.success ? "FAILED" : result.errors.length > 0 ? "PARTIAL" : "SUCCESS";
    const latency = Date.now() - runStart;

    await prisma.externalIngestionRun.update({
      where: { id: run.id },
      data: {
        status,
        recordsFetched: result.recordCount,
        recordsStored: stored,
        errors: result.errors.length,
        errorDetails: result.errors.length > 0 ? result.errors.slice(0, 10).join("; ") : null,
        latencyMs: latency,
        completedAt: new Date(),
      },
    });

    // Update source stats
    await prisma.externalDataSource.update({
      where: { id: sourceId },
      data: {
        lastSuccessAt: status !== "FAILED" ? new Date() : undefined,
        lastErrorAt: status === "FAILED" ? new Date() : undefined,
        lastError: status === "FAILED" ? result.errors[0] : null,
        avgLatencyMs: latency,
        totalCalls: { increment: 1 },
        totalErrors: status === "FAILED" ? { increment: 1 } : undefined,
      },
    });

    return { source: name, status, recordsFetched: result.recordCount, recordsStored: stored, errors: result.errors, latencyMs: latency };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const latency = Date.now() - runStart;

    await prisma.externalIngestionRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorDetails: msg.slice(0, 500), latencyMs: latency, completedAt: new Date() },
    }).catch(() => {});

    await prisma.externalDataSource.update({
      where: { id: sourceId },
      data: { lastErrorAt: new Date(), lastError: msg.slice(0, 200), totalCalls: { increment: 1 }, totalErrors: { increment: 1 } },
    }).catch(() => {});

    return { source: name, status: "FAILED", recordsFetched: 0, recordsStored: 0, errors: [msg], latencyMs: latency };
  }
}

// ── Main orchestration ──

export async function runFullExternalIngestion(date?: Date): Promise<FullIngestionReport> {
  const targetDate = date ?? new Date();
  // Normalize to start of day UTC
  const dayDate = new Date(targetDate.toISOString().split("T")[0] + "T00:00:00.000Z");
  const startTime = Date.now();

  logger.info(`[ExternalIntel] Starting full ingestion for ${dayDate.toISOString().split("T")[0]}`);

  const results: IngestionResult[] = [];

  // Market signals (sequential to respect rate limits)
  results.push(await runProvider("WORLDBANK", "MARKET", "https://api.worldbank.org/v2", fetchWorldBankSignals, persistMarketSignals, dayDate));
  results.push(await runProvider("FAOSTAT", "MARKET", "https://www.fao.org/faostat/api/v1", fetchFaostatSignals, persistMarketSignals, dayDate));
  results.push(await runProvider("COMTRADE", "MARKET", "https://comtradeapi.un.org", fetchComtradeSignals, persistMarketSignals, dayDate));
  results.push(await runProvider("UNCTAD", "MARKET", "https://unctadstat.unctad.org", fetchUnctadSignals, persistMarketSignals, dayDate));
  results.push(await runProvider("ECB_FX", "FX", "https://data.ecb.europa.eu", fetchEcbFxSignals, persistMarketSignals, dayDate));

  // Weather & seasonal
  results.push(await runProvider("OPEN_METEO", "WEATHER", "https://api.open-meteo.com", fetchOpenMeteoSignals, persistSeasonalSignals, dayDate));
  results.push(await runProvider("SEASONAL_CALENDAR", "SEASONAL", "internal://calendar", fetchSeasonalCalendarSignals, persistSeasonalSignals, dayDate));

  // Job signals
  results.push(await runProvider("ILOSTAT", "JOB", "https://www.ilo.org/sdmx", fetchIlostatSignals, persistJobSignals, dayDate));
  results.push(await runProvider("JOOBLE", "JOB", "https://jooble.org/api", fetchJoobleSignals, persistJobSignals, dayDate));
  results.push(await runProvider("ADZUNA", "JOB", "https://api.adzuna.com", fetchAdzunaSignals, persistJobSignals, dayDate));
  results.push(await runProvider("AFRICA_JOBS", "JOB", "gemini://africa-jobs", fetchAfricaJobsSignals, persistJobSignals, dayDate));

  const durationMs = Date.now() - startTime;
  const successSources = results.filter((r) => r.status === "SUCCESS").length;
  const partialSources = results.filter((r) => r.status === "PARTIAL").length;
  const failedSources = results.filter((r) => r.status === "FAILED").length;

  const report: FullIngestionReport = {
    date: dayDate.toISOString().split("T")[0],
    totalSources: results.length,
    successSources,
    partialSources,
    failedSources,
    totalRecordsFetched: results.reduce((s, r) => s + r.recordsFetched, 0),
    totalRecordsStored: results.reduce((s, r) => s + r.recordsStored, 0),
    results,
    durationMs,
  };

  logger.info({
    date: report.date,
    sources: `${successSources}/${results.length} OK`,
    records: `${report.totalRecordsStored} stored`,
    duration: `${Math.round(durationMs / 1000)}s`,
  }, `[ExternalIntel] Ingestion complete`);

  // Alert if too many failures
  if (failedSources > results.length / 2) {
    logger.warn({ failedSources, totalSources: results.length }, `[ExternalIntel] ALERT: ${failedSources}/${results.length} sources failed`);
  }

  return report;
}

// ── Health check ──

export async function getExternalIntelHealth(): Promise<{
  sources: Array<{ name: string; type: string; isActive: boolean; lastSuccess: string | null; lastError: string | null; avgLatencyMs: number; totalCalls: number; errorRate: number }>;
  lastIngestionDate: string | null;
  staleSources: string[];
}> {
  const sources = await prisma.externalDataSource.findMany({ orderBy: { name: "asc" } });
  const lastRun = await prisma.externalIngestionRun.findFirst({ orderBy: { runDate: "desc" } });
  const oneDayAgo = new Date(Date.now() - 24 * 3600_000);

  return {
    sources: sources.map((s) => ({
      name: s.name,
      type: s.type,
      isActive: s.isActive,
      lastSuccess: s.lastSuccessAt?.toISOString() ?? null,
      lastError: s.lastError,
      avgLatencyMs: s.avgLatencyMs,
      totalCalls: s.totalCalls,
      errorRate: s.totalCalls > 0 ? Math.round((s.totalErrors / s.totalCalls) * 100) : 0,
    })),
    lastIngestionDate: lastRun?.runDate?.toISOString().split("T")[0] ?? null,
    staleSources: sources
      .filter((s) => s.isActive && (!s.lastSuccessAt || s.lastSuccessAt < oneDayAgo))
      .map((s) => s.name),
  };
}
