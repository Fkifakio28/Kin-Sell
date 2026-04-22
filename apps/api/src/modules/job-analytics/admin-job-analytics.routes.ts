/**
 * Admin Job Analytics Routes — Chantier J5
 *
 * Montées sous /admin/analytics/jobs/*
 * - GET    /snapshots                — liste filtrée des JobMarketSnapshot (paginée)
 * - POST   /snapshots                — override manuel (upsert, isManualOverride=true)
 * - DELETE /snapshots/:id            — retirer override (revient au recalcul auto)
 * - POST   /refresh                  — déclenche refreshJobMarketSnapshots (manuel)
 * - GET    /ingestion-runs           — derniers runs ExternalIngestionRun (focus JOB)
 * - GET    /gemini-metrics           — métriques Gemini regional-job-context
 * - POST   /gemini-metrics/reset     — reset compteurs Gemini
 */

import { Router } from "express";
import { z } from "zod";
import { type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { prisma } from "../../shared/db/prisma.js";
import { CountryCode } from "@prisma/client";
import { refreshJobMarketSnapshots } from "./job-market-snapshot-refresh.service.js";
import {
  getRegionalJobContextMetrics,
  resetRegionalJobContextMetrics,
} from "./regional-job-context.service.js";

const router = Router();

// ── Zod schemas ──
const CountryCodeEnum = z.nativeEnum(CountryCode);

const ListSnapshotsQuery = z.object({
  country: z.string().trim().optional(),
  countryCode: CountryCodeEnum.optional(),
  city: z.string().trim().optional(),
  category: z.string().trim().optional(),
  onlyOverride: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const UpsertSnapshotBody = z.object({
  snapshotDate: z
    .string()
    .datetime()
    .optional()
    .transform((s) => (s ? new Date(s) : new Date(new Date().toISOString().split("T")[0] + "T00:00:00.000Z"))),
  country: z.string().trim().min(1).max(80),
  countryCode: CountryCodeEnum.nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  category: z.string().trim().min(1).max(80),
  openJobs: z.number().int().min(0),
  applicants: z.number().int().min(0),
  avgSalaryUsdCents: z.number().int().min(0).nullable().optional(),
  medianSalaryUsdCents: z.number().int().min(0).nullable().optional(),
  topSkills: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  trend7dPercent: z.number().min(-100).max(1000).nullable().optional(),
  sourceNotes: z.string().trim().max(1000).nullable().optional(),
});

// ════════════════════════════════════════════
// GET /snapshots
// ════════════════════════════════════════════

router.get(
  "/snapshots",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = ListSnapshotsQuery.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, "Paramètres invalides.");
    const { country, countryCode, city, category, onlyOverride, limit, offset } = parsed.data;

    const where: any = {};
    if (country) where.country = country;
    if (countryCode) where.countryCode = countryCode;
    if (city) where.city = city;
    if (category) where.category = category;
    if (onlyOverride) where.isManualOverride = true;

    const [items, total] = await Promise.all([
      prisma.jobMarketSnapshot.findMany({
        where,
        orderBy: [{ snapshotDate: "desc" }, { country: "asc" }, { category: "asc" }],
        skip: offset,
        take: limit,
      }),
      prisma.jobMarketSnapshot.count({ where }),
    ]);

    res.json({ items, total, limit, offset });
  }),
);

// ════════════════════════════════════════════
// POST /snapshots — override manuel (upsert)
// ════════════════════════════════════════════

router.post(
  "/snapshots",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = UpsertSnapshotBody.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Corps invalide.");
    const adminId = req.auth!.userId;
    const b = parsed.data;

    const dayDate = new Date(b.snapshotDate.toISOString().split("T")[0] + "T00:00:00.000Z");
    const saturationIndex = Number((b.applicants / Math.max(1, b.openJobs)).toFixed(2));

    const data = {
      snapshotDate: dayDate,
      country: b.country,
      countryCode: b.countryCode ?? null,
      city: b.city ?? null,
      category: b.category,
      openJobs: b.openJobs,
      applicants: b.applicants,
      saturationIndex,
      avgSalaryUsdCents: b.avgSalaryUsdCents ?? null,
      medianSalaryUsdCents: b.medianSalaryUsdCents ?? null,
      topSkills: b.topSkills,
      trend7dPercent: b.trend7dPercent ?? null,
      isManualOverride: true,
      overriddenBy: adminId,
      overriddenAt: new Date(),
      sourceNotes: b.sourceNotes ?? null,
    };

    const existing = await prisma.jobMarketSnapshot.findUnique({
      where: {
        snapshotDate_country_city_category: {
          snapshotDate: dayDate,
          country: b.country,
          city: b.city ?? "",
          category: b.category,
        },
      },
      select: { id: true },
    });

    const snapshot = existing
      ? await prisma.jobMarketSnapshot.update({ where: { id: existing.id }, data })
      : await prisma.jobMarketSnapshot.create({ data });

    res.status(existing ? 200 : 201).json({ snapshot });
  }),
);

// ════════════════════════════════════════════
// DELETE /snapshots/:id — retirer override (clear les 3 champs override)
// ════════════════════════════════════════════

const ClearOverrideQuery = z.object({
  mode: z.enum(["unflag", "delete"]).default("unflag"),
});

router.delete(
  "/snapshots/:id",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const id = req.params.id;
    const { mode } = ClearOverrideQuery.parse(req.query);
    const existing = await prisma.jobMarketSnapshot.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Snapshot introuvable.");

    if (mode === "delete") {
      await prisma.jobMarketSnapshot.delete({ where: { id } });
      res.status(204).end();
      return;
    }

    const updated = await prisma.jobMarketSnapshot.update({
      where: { id },
      data: {
        isManualOverride: false,
        overriddenBy: null,
        overriddenAt: null,
        sourceNotes: null,
      },
    });
    res.json({ snapshot: updated });
  }),
);

// ════════════════════════════════════════════
// POST /refresh — déclenche manuellement le recalcul (skip overrides)
// ════════════════════════════════════════════

router.post(
  "/refresh",
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const report = await refreshJobMarketSnapshots();
    res.json(report);
  }),
);

// ════════════════════════════════════════════
// GET /ingestion-runs — derniers runs focus JOB
// ════════════════════════════════════════════

router.get(
  "/ingestion-runs",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const runs = await prisma.externalIngestionRun.findMany({
      where: { source: { type: "JOB" } },
      orderBy: { runDate: "desc" },
      take: limit,
      include: { source: { select: { name: true, type: true } } },
    });
    res.json({ runs });
  }),
);

// ════════════════════════════════════════════
// GET /gemini-metrics + reset
// ════════════════════════════════════════════

router.get(
  "/gemini-metrics",
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    res.json(getRegionalJobContextMetrics());
  }),
);

router.post(
  "/gemini-metrics/reset",
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    resetRegionalJobContextMetrics();
    res.json({ ok: true });
  }),
);

export default router;
