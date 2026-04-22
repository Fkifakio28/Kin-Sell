/**
 * Market-Intel routes
 *
 *   GET /market/products   — prix médian par (produit × pays)  — MARKET_INTEL_BASIC
 *   GET /market/salaries   — salaires par (métier × pays)       — MARKET_INTEL_BASIC
 *   GET /market/trends     — top 50 produits/métiers par pays   — MARKET_INTEL_PREMIUM
 *   GET /market/arbitrage  — opportunités d'arbitrage           — ARBITRAGE_ENGINE
 *   GET /market/coverage   — santé des sources + quota Gemini   — admin uniquement
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { prisma } from "../../shared/db/prisma.js";
import { requireMarketIntel } from "./gating.js";
import { getGeminiQuotaStatus } from "./gemini-fallback.js";

const router = Router();

const COUNTRY_CODES = ["MA", "CI", "SN", "CD", "GA", "CG", "GN", "AO"] as const;
const CountrySchema = z.enum(COUNTRY_CODES);

const CACHE_SECONDS = 300;
const setCache = (res: any) => res.setHeader("Cache-Control", `private, max-age=${CACHE_SECONDS}`);

// ── /market/products ─────────────────────────────────

const ProductsQuery = z.object({
  country: CountrySchema,
  categoryId: z.string().optional(),
  productSlug: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  "/products",
  requireAuth,
  requireMarketIntel("MARKET_INTEL_BASIC"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = ProductsQuery.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Paramètres invalides");
    const { country, categoryId, productSlug, limit } = parsed.data;

    const rows = await prisma.marketPrice.findMany({
      where: {
        countryCode: country,
        product: {
          ...(categoryId ? { categoryId } : {}),
          ...(productSlug ? { slug: productSlug } : {}),
        },
      },
      orderBy: { collectedAt: "desc" },
      take: limit,
      include: { product: { select: { slug: true, displayName: true, categoryId: true, canonicalBrand: true } } },
    });

    setCache(res);
    res.json({
      country,
      count: rows.length,
      items: rows.map((r) => ({
        productSlug: r.product.slug,
        productName: r.product.displayName,
        categoryId: r.product.categoryId,
        brand: r.product.canonicalBrand,
        priceMinLocal: r.priceMinLocal,
        priceMaxLocal: r.priceMaxLocal,
        priceMedianLocal: r.priceMedianLocal,
        localCurrency: r.localCurrency,
        priceMedianEurCents: r.priceMedianEurCents,
        sampleSize: r.sampleSize,
        confidence: r.confidence,
        collectedAt: r.collectedAt,
      })),
    });
  }),
);

// ── /market/salaries ─────────────────────────────────

const SalariesQuery = z.object({
  country: CountrySchema,
  parentCategoryId: z.string().optional(),
  jobSlug: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  "/salaries",
  requireAuth,
  requireMarketIntel("MARKET_INTEL_BASIC"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = SalariesQuery.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Paramètres invalides");
    const { country, parentCategoryId, jobSlug, limit } = parsed.data;

    const rows = await prisma.marketSalary.findMany({
      where: {
        countryCode: country,
        job: {
          ...(parentCategoryId ? { parentCategoryId } : {}),
          ...(jobSlug ? { slug: jobSlug } : {}),
        },
      },
      orderBy: { collectedAt: "desc" },
      take: limit,
      include: { job: { select: { slug: true, displayName: true, parentCategoryId: true, seniorityLevel: true } } },
    });

    setCache(res);
    res.json({
      country,
      count: rows.length,
      items: rows.map((r) => ({
        jobSlug: r.job.slug,
        jobName: r.job.displayName,
        parentCategoryId: r.job.parentCategoryId,
        seniorityLevel: r.job.seniorityLevel,
        salaryMinLocal: r.salaryMinLocal,
        salaryMaxLocal: r.salaryMaxLocal,
        salaryMedianLocal: r.salaryMedianLocal,
        localCurrency: r.localCurrency,
        salaryMedianEurCents: r.salaryMedianEurCents,
        unit: r.unit,
        sampleSize: r.sampleSize,
        confidence: r.confidence,
        collectedAt: r.collectedAt,
      })),
    });
  }),
);

// ── /market/trends ───────────────────────────────────

const TrendsQuery = z.object({
  country: CountrySchema,
  scope: z.enum(["product", "job"]).default("product"),
  period: z.enum(["weekly", "monthly"]).default("weekly"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get(
  "/trends",
  requireAuth,
  requireMarketIntel("MARKET_INTEL_PREMIUM"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = TrendsQuery.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Paramètres invalides");
    const { country, scope, period, limit } = parsed.data;

    const rows = await prisma.marketTrend.findMany({
      where: { countryCode: country, scope, period },
      orderBy: { rank: "asc" },
      take: limit,
      include: {
        product: { select: { slug: true, displayName: true, categoryId: true } },
        job: { select: { slug: true, displayName: true, parentCategoryId: true } },
      },
    });

    setCache(res);
    res.json({
      country,
      scope,
      period,
      count: rows.length,
      items: rows.map((r) => ({
        rank: r.rank,
        score: r.score,
        deltaPct: r.deltaPct,
        season: r.season,
        computedAt: r.computedAt,
        product: r.product,
        job: r.job,
      })),
    });
  }),
);

// ── /market/arbitrage ────────────────────────────────

const ArbitrageQuery = z.object({
  scope: z.enum(["product", "job"]).optional(),
  shortageCountry: CountrySchema.optional(),
  surplusCountry: CountrySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get(
  "/arbitrage",
  requireAuth,
  requireMarketIntel("ARBITRAGE_ENGINE"),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = ArbitrageQuery.safeParse(req.query);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Paramètres invalides");
    const { scope, shortageCountry, surplusCountry, limit } = parsed.data;

    const rows = await prisma.arbitrageOpportunity.findMany({
      where: {
        active: true,
        ...(scope ? { scope } : {}),
        ...(shortageCountry ? { shortageCountry } : {}),
        ...(surplusCountry ? { surplusCountry } : {}),
      },
      orderBy: { score: "desc" },
      take: limit,
    });

    setCache(res);
    res.json({
      count: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        scope: r.scope,
        entityLabel: r.entityLabel,
        shortageCountry: r.shortageCountry,
        surplusCountry: r.surplusCountry,
        score: r.score,
        demandIndex: r.demandIndex,
        supplyIndex: r.supplyIndex,
        priceDeltaEurCents: r.priceDeltaEurCents,
        distanceKm: r.distanceKm,
        rationale: r.rationale,
        computedAt: r.computedAt,
      })),
    });
  }),
);

// ── /market/coverage (admin) ─────────────────────────

router.get(
  "/coverage",
  requireAuth,
  requireRoles(Role.ADMIN, Role.SUPER_ADMIN),
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const sourcesByCountry = await prisma.marketSource.groupBy({
      by: ["countryCode", "type"],
      _count: true,
      where: { active: true },
    });
    const recentCrawls = await prisma.marketSource.findMany({
      where: { active: true, lastCrawledAt: { not: null } },
      orderBy: { lastCrawledAt: "desc" },
      take: 20,
      select: { name: true, countryCode: true, type: true, lastCrawledAt: true, lastStatus: true, lastError: true },
    });
    const [productCount, jobCount, priceCount, salaryCount, trendCount, arbCount] = await Promise.all([
      prisma.marketProduct.count(),
      prisma.marketJob.count(),
      prisma.marketPrice.count(),
      prisma.marketSalary.count(),
      prisma.marketTrend.count(),
      prisma.arbitrageOpportunity.count({ where: { active: true } }),
    ]);
    const geminiQuota = await getGeminiQuotaStatus();

    res.json({
      sourcesByCountry,
      recentCrawls,
      totals: { productCount, jobCount, priceCount, salaryCount, trendCount, arbCount },
      geminiQuota,
    });
  }),
);

export default router;
