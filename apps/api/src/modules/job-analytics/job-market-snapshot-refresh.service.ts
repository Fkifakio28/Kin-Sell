/**
 * Job Market Snapshot Refresh — Chantier J3
 *
 * Remplit / met à jour `JobMarketSnapshot` chaque nuit (après ingestion externe).
 *
 * Blend :
 *   - Signaux INTERNES : JobListing (ACTIVE) + JobApplication (30j glissants)
 *   - Signaux EXTERNES : ExternalJobSignalDaily (J2 Africa Jobs, Jooble, Adzuna, ILOSTAT)
 *
 * Règles :
 *   - Si un snapshot `(date, country, city, category)` existe avec `isManualOverride=true`,
 *     il NE sera PAS écrasé (les champs saisis par l'admin via J5 sont préservés).
 *   - Sinon, upsert avec les valeurs agrégées blendées.
 *
 * Exécuté après la phase 1 (external ingestion) dans le midnight-scheduler.
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import { JobListingStatus, type CountryCode } from "@prisma/client";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface JobMarketSnapshotRefreshReport {
  date: string;
  zonesProcessed: number;
  zonesCreated: number;
  zonesUpdated: number;
  zonesSkippedOverride: number;
  externalSignalsUsed: number;
  durationMs: number;
  errors: string[];
}

interface ZoneAggregate {
  country: string;
  countryCode: CountryCode | null;
  city: string | null;
  category: string;
  openJobs: number;
  applicants: number;
  avgSalaryUsdCents: number | null;
  medianSalaryUsdCents: number | null;
  topSkills: string[];
  trend7dPercent: number | null;
}

// ── Helpers ──

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function topSkillsFromCounts(counts: Map<string, number>, limit = 5): string[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([s]) => s);
}

// ── Internal aggregation ──

async function aggregateInternalZones(date: Date): Promise<Map<string, ZoneAggregate>> {
  const zones = new Map<string, ZoneAggregate>();

  // Offres actives groupées par (country, city, category)
  const grouped = await prisma.jobListing.groupBy({
    by: ["country", "countryCode", "city", "category"],
    where: { status: JobListingStatus.ACTIVE },
    _count: { _all: true },
    _sum: { applicationCount: true },
  });

  for (const g of grouped) {
    const key = `${g.country}|${g.city ?? ""}|${g.category}`;
    zones.set(key, {
      country: g.country,
      countryCode: g.countryCode,
      city: g.city,
      category: g.category,
      openJobs: g._count._all,
      applicants: g._sum.applicationCount ?? 0,
      avgSalaryUsdCents: null,
      medianSalaryUsdCents: null,
      topSkills: [],
      trend7dPercent: null,
    });
  }

  // Hydratation : salaires + topSkills + trend 7j (query ciblée par zone)
  for (const zone of zones.values()) {
    const listings = await prisma.jobListing.findMany({
      where: {
        status: JobListingStatus.ACTIVE,
        country: zone.country,
        city: zone.city ?? undefined,
        category: zone.category,
      },
      select: {
        salaryMinUsd: true,
        salaryMaxUsd: true,
        requiredSkills: true,
        createdAt: true,
      },
      take: 500,
    });

    const salaries: number[] = [];
    const skillCounts = new Map<string, number>();

    for (const l of listings) {
      const avg =
        l.salaryMinUsd != null && l.salaryMaxUsd != null
          ? (l.salaryMinUsd + l.salaryMaxUsd) / 2
          : (l.salaryMaxUsd ?? l.salaryMinUsd ?? null);
      if (avg != null && avg > 0) salaries.push(Math.round(avg * 100)); // USD → cents
      for (const s of l.requiredSkills) {
        skillCounts.set(s, (skillCounts.get(s) ?? 0) + 1);
      }
    }

    if (salaries.length > 0) {
      const sum = salaries.reduce((a, b) => a + b, 0);
      zone.avgSalaryUsdCents = Math.round(sum / salaries.length);
      zone.medianSalaryUsdCents = computeMedian(salaries);
    }
    zone.topSkills = topSkillsFromCounts(skillCounts);

    // Tendance 7j : (offres créées ces 7j) / (offres créées 7j précédents) − 1
    const sevenDaysAgo = new Date(date.getTime() - SEVEN_DAYS_MS);
    const fourteenDaysAgo = new Date(date.getTime() - 2 * SEVEN_DAYS_MS);
    const last7 = listings.filter((l) => l.createdAt >= sevenDaysAgo).length;
    const prev7 = listings.filter(
      (l) => l.createdAt >= fourteenDaysAgo && l.createdAt < sevenDaysAgo,
    ).length;
    if (prev7 > 0) {
      zone.trend7dPercent = Number(((last7 / prev7 - 1) * 100).toFixed(1));
    } else if (last7 > 0) {
      zone.trend7dPercent = 100;
    }
  }

  return zones;
}

// ── External blending ──

async function blendExternalSignals(
  zones: Map<string, ZoneAggregate>,
  date: Date,
): Promise<number> {
  const thirtyDaysAgo = new Date(date.getTime() - THIRTY_DAYS_MS);
  const externalRows = await prisma.externalJobSignalDaily.findMany({
    where: { date: { gte: thirtyDaysAgo } },
    orderBy: { date: "desc" },
  });

  let used = 0;
  for (const row of externalRows) {
    const cc = row.countryCode;
    const city = row.city ?? null;
    // On recherche une zone existante (on ne crée pas de zone purement externe pour l'instant —
    // les snapshots sans aucune offre interne seraient trompeurs)
    for (const [key, zone] of zones.entries()) {
      const matchCountry = zone.countryCode === cc || zone.country === cc;
      const matchCity = !city || !zone.city || zone.city === city;
      const matchCategory = zone.category === row.category;
      if (!matchCountry || !matchCity || !matchCategory) continue;

      // Pondération : externe enrichit salaire si interne absent, sinon moyenne pondérée 60/40
      if (row.avgSalaryUsd != null && row.avgSalaryUsd > 0) {
        const extCents = Math.round(row.avgSalaryUsd * 100);
        if (zone.avgSalaryUsdCents == null) {
          zone.avgSalaryUsdCents = extCents;
        } else {
          zone.avgSalaryUsdCents = Math.round(zone.avgSalaryUsdCents * 0.6 + extCents * 0.4);
        }
      }
      // Top skills : enrichir si interne vide
      if (zone.topSkills.length === 0 && row.topSkills.length > 0) {
        zone.topSkills = row.topSkills.slice(0, 5);
      }
      used++;
      zones.set(key, zone);
      break;
    }
  }
  return used;
}

// ── Main refresh ──

export async function refreshJobMarketSnapshots(
  date?: Date,
): Promise<JobMarketSnapshotRefreshReport> {
  const targetDate = date ?? new Date();
  const dayDate = new Date(
    targetDate.toISOString().split("T")[0] + "T00:00:00.000Z",
  );
  const startTime = Date.now();
  const errors: string[] = [];

  logger.info(
    `[JobMarketSnapshot] ══ Refresh for ${dayDate.toISOString().split("T")[0]} ══`,
  );

  let zones: Map<string, ZoneAggregate>;
  try {
    zones = await aggregateInternalZones(dayDate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[JobMarketSnapshot] Internal aggregation failed");
    errors.push(`Internal aggregation: ${msg}`);
    return {
      date: dayDate.toISOString().split("T")[0],
      zonesProcessed: 0,
      zonesCreated: 0,
      zonesUpdated: 0,
      zonesSkippedOverride: 0,
      externalSignalsUsed: 0,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  let externalSignalsUsed = 0;
  try {
    externalSignalsUsed = await blendExternalSignals(zones, dayDate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, "[JobMarketSnapshot] External blending failed");
    errors.push(`External blending: ${msg}`);
  }

  // Upsert (respecte les overrides manuels)
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const zone of zones.values()) {
    try {
      const saturationIndex = Number(
        (zone.applicants / Math.max(1, zone.openJobs)).toFixed(2),
      );

      const existing = await prisma.jobMarketSnapshot.findUnique({
        where: {
          snapshotDate_country_city_category: {
            snapshotDate: dayDate,
            country: zone.country,
            city: zone.city ?? "",
            category: zone.category,
          },
        },
        select: { id: true, isManualOverride: true },
      });

      if (existing?.isManualOverride) {
        skipped++;
        continue;
      }

      if (existing) {
        await prisma.jobMarketSnapshot.update({
          where: { id: existing.id },
          data: {
            countryCode: zone.countryCode,
            openJobs: zone.openJobs,
            applicants: zone.applicants,
            saturationIndex,
            avgSalaryUsdCents: zone.avgSalaryUsdCents,
            medianSalaryUsdCents: zone.medianSalaryUsdCents,
            topSkills: zone.topSkills,
            trend7dPercent: zone.trend7dPercent,
          },
        });
        updated++;
      } else {
        await prisma.jobMarketSnapshot.create({
          data: {
            snapshotDate: dayDate,
            country: zone.country,
            countryCode: zone.countryCode,
            city: zone.city,
            category: zone.category,
            openJobs: zone.openJobs,
            applicants: zone.applicants,
            saturationIndex,
            avgSalaryUsdCents: zone.avgSalaryUsdCents,
            medianSalaryUsdCents: zone.medianSalaryUsdCents,
            topSkills: zone.topSkills,
            trend7dPercent: zone.trend7dPercent,
          },
        });
        created++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Zone ${zone.country}/${zone.city}/${zone.category}: ${msg}`);
    }
  }

  const durationMs = Date.now() - startTime;
  logger.info(
    {
      date: dayDate.toISOString().split("T")[0],
      zones: zones.size,
      created,
      updated,
      skipped,
      externalSignalsUsed,
      durationSec: Math.round(durationMs / 1000),
    },
    `[JobMarketSnapshot] ══ Refresh complete ══`,
  );

  return {
    date: dayDate.toISOString().split("T")[0],
    zonesProcessed: zones.size,
    zonesCreated: created,
    zonesUpdated: updated,
    zonesSkippedOverride: skipped,
    externalSignalsUsed,
    durationMs,
    errors,
  };
}
