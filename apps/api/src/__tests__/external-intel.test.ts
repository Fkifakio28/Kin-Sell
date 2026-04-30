/**
 * Tests — External Intelligence Module
 *
 * Tests du service de fusion, détection de triggers et fonctions API.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma, mockRedis } = vi.hoisted(() => ({
  mockPrisma: {
    internalTransactionInsight: { findMany: vi.fn() },
    externalMarketSignalDaily: { findMany: vi.fn() },
    externalJobSignalDaily: { findMany: vi.fn() },
    externalSeasonalSignalDaily: { findMany: vi.fn() },
    externalDataSource: { findMany: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    externalIngestionRun: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    message: { count: vi.fn() },
  } as any,
  mockRedis: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/db/redis.js", () => ({ getRedis: () => mockRedis }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config/env.js", () => ({
  env: {
    EXTERNAL_INTEL_TIMEOUT_MS: 5000,
    EXTERNAL_INTEL_RETRY_COUNT: 1,
    MARKET_REFRESH_TIME: "00:00",
    MARKET_REFRESH_TZ: "Africa/Kinshasa",
    WORLDBANK_API_URL: "https://api.worldbank.org/v2",
    FAOSTAT_API_URL: "https://www.fao.org/faostat/api/v1",
    OPEN_METEO_API_URL: "https://api.open-meteo.com/v1",
    ECB_DATA_API_URL: "https://data-api.ecb.europa.eu",
    JOOBLE_API_KEY: "",
    ADZUNA_APP_ID: "",
    ADZUNA_API_KEY: "",
  },
}));
vi.mock("../modules/knowledge-base/knowledge-base.service.js", () => ({
  getBlendedInsight: vi.fn().mockResolvedValue(null),
  runNightlyKnowledgeBaseRefresh: vi.fn().mockResolvedValue({ collected: 0, refreshed: 0 }),
}));

// ── Import after mocks ─────────────────────────────────────

import {
  getFusedIntelligence,
  getJobsDemand,
  getSeasonalCalendar,
} from "../modules/external-intel/external-intelligence-fusion.service.js";
import { AFRICAN_COUNTRIES } from "../modules/external-intel/types.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.internalTransactionInsight.findMany.mockResolvedValue([]);
  mockPrisma.externalMarketSignalDaily.findMany.mockResolvedValue([]);
  mockPrisma.externalJobSignalDaily.findMany.mockResolvedValue([]);
  mockPrisma.externalSeasonalSignalDaily.findMany.mockResolvedValue([]);
  mockPrisma.message.count.mockResolvedValue(0);
});

// ════════════════════════════════════════════════════════════
// getFusedIntelligence
// ════════════════════════════════════════════════════════════

describe("getFusedIntelligence()", () => {
  it("retourne un score par défaut quand aucune donnée", async () => {
    const result = await getFusedIntelligence("Électronique", "CD");

    expect(result).toBeDefined();
    expect(result.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(result.opportunityScore).toBeLessThanOrEqual(100);
    expect(result.demandForecast7d).toMatch(/^(RISING|STABLE|DECLINING)$/);
    expect(result.demandForecast30d).toMatch(/^(RISING|STABLE|DECLINING)$/);
    expect(result.recommendedCountries).toBeInstanceOf(Array);
    expect(result.recommendedCities).toBeInstanceOf(Array);
    expect(result.activeTriggers).toBeInstanceOf(Array);
    expect(result.computedAt).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it("détecte WEEKEND_CITY_MICROPEAK le vendredi/samedi", async () => {
    // Mock Date to be Friday
    const friday = new Date("2026-04-17T12:00:00Z"); // This is a Friday
    vi.setSystemTime(friday);

    const result = await getFusedIntelligence("Mode", "CD", "Kinshasa");

    const weekendTrigger = result.activeTriggers.find((t) => t.trigger === "WEEKEND_CITY_MICROPEAK");
    if (friday.getDay() === 5 || friday.getDay() === 6) {
      expect(weekendTrigger).toBeDefined();
    }

    vi.useRealTimers();
  });

  it("détecte RELIGIOUS_EVENT_SPIKE quand event religieux actif", async () => {
    mockPrisma.externalSeasonalSignalDaily.findMany.mockResolvedValue([
      {
        id: "1",
        signalType: "RELIGIOUS_EVENT",
        eventName: "Ramadan",
        impactCategory: "Alimentation",
        severity: 80,
        priceImpact: 15,
        demandImpact: 30,
        confidence: 90,
        sourceId: "s1",
        sourceUrl: null,
        date: new Date(),
        countryCode: "CD",
        city: null,
        observedAt: new Date(),
        metadata: null,
        createdAt: new Date(),
      },
    ]);

    const result = await getFusedIntelligence("Alimentation", "CD");

    const religiousTrigger = result.activeTriggers.find((t) => t.trigger === "RELIGIOUS_EVENT_SPIKE");
    expect(religiousTrigger).toBeDefined();
    expect(religiousTrigger!.confidence).toBe(90);
  });

  it("détecte CURRENCY_SHOCK_REPRICING quand fxDelta > 10%", async () => {
    mockPrisma.externalMarketSignalDaily.findMany.mockResolvedValue([
      {
        id: "1",
        signalType: "FX_RATE",
        category: "Général",
        value: 2500,
        unit: "CDF_PER_USD",
        deltaPercent: 15,
        previousValue: 2100,
        confidence: 80,
        sourceId: "s1",
        sourceUrl: null,
        date: new Date(),
        countryCode: "CD",
        city: null,
        subcategory: null,
        observedAt: new Date(),
        metadata: null,
        createdAt: new Date(),
      },
    ]);

    const result = await getFusedIntelligence("Électronique", "CD");

    const fxTrigger = result.activeTriggers.find((t) => t.trigger === "CURRENCY_SHOCK_REPRICING");
    expect(fxTrigger).toBeDefined();
    expect(fxTrigger!.severity).toBeGreaterThan(30);
  });

  it("calcule un score plus élevé avec signaux internes positifs", async () => {
    mockPrisma.internalTransactionInsight.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        periodType: "DAILY",
        periodStart: new Date(Date.now() - i * 86400000),
        periodEnd: new Date(Date.now() - i * 86400000 + 86400000),
        countryCode: "CD",
        city: "Kinshasa",
        category: "Électronique",
        subcategory: null,
        totalOrders: 5,
        totalRevenueCents: 50000,
        totalNegotiations: 3,
        negoAcceptRate: 0.6,
        avgDiscountPercent: 10,
        avgSellingPriceCents: 10000,
        medianSellingPrice: 9500,
        minSellingPriceCents: 5000,
        maxSellingPriceCents: 15000,
        avgTimeToSaleHours: 48,
        returnRate: 0.02,
        repeatBuyerRate: 0.3,
        crossBorderPercent: 0.1,
        marketHealthScore: 70,
        confidenceScore: 80,
        sampleSize: 50,
        metadata: null,
        createdAt: new Date(),
      })),
    );

    const result = await getFusedIntelligence("Électronique", "CD", "Kinshasa");

    // Internal score should boost overall
    expect(result.opportunityScore).toBeGreaterThanOrEqual(30);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("inclut source attribution correcte", async () => {
    mockPrisma.internalTransactionInsight.findMany.mockResolvedValue([
      { totalOrders: 1, marketHealthScore: 50, avgSellingPriceCents: 5000, periodStart: new Date() },
    ]);

    const result = await getFusedIntelligence("Mode", "CD");

    expect(result.sourceAttribution).toContain("Kin-Sell interne");
  });
});

// ════════════════════════════════════════════════════════════
// getJobsDemand
// ════════════════════════════════════════════════════════════

describe("getJobsDemand()", () => {
  it("retourne un résumé vide sans données", async () => {
    const result = await getJobsDemand("CD");

    expect(result.signals).toEqual([]);
    expect(result.summary).toContain("Aucune donnée");
  });

  it("agrège les signaux par serviceType", async () => {
    mockPrisma.externalJobSignalDaily.findMany.mockResolvedValue([
      {
        id: "1", serviceType: "PLUMBER", category: "Services", jobCount: 10,
        avgSalaryUsd: 200, demandTrend: "RISING", confidence: 60,
        date: new Date(), countryCode: "CD", city: null, sourceId: "s1",
        topSkills: [], sourceUrl: null, avgSalaryLocal: null,
        observedAt: new Date(), metadata: null, createdAt: new Date(),
      },
      {
        id: "2", serviceType: "PLUMBER", category: "Services", jobCount: 15,
        avgSalaryUsd: 220, demandTrend: "RISING", confidence: 65,
        date: new Date(), countryCode: "CD", city: null, sourceId: "s2",
        topSkills: [], sourceUrl: null, avgSalaryLocal: null,
        observedAt: new Date(), metadata: null, createdAt: new Date(),
      },
      {
        id: "3", serviceType: "ELECTRICIAN", category: "Services", jobCount: 8,
        avgSalaryUsd: 180, demandTrend: "STABLE", confidence: 55,
        date: new Date(), countryCode: "CD", city: null, sourceId: "s1",
        topSkills: [], sourceUrl: null, avgSalaryLocal: null,
        observedAt: new Date(), metadata: null, createdAt: new Date(),
      },
    ]);

    const result = await getJobsDemand("CD");

    expect(result.signals.length).toBe(2);
    expect(result.signals[0].serviceType).toBe("PLUMBER");
    expect(result.signals[0].jobCount).toBe(25);
    expect(result.summary).toContain("PLUMBER");
  });
});

// ════════════════════════════════════════════════════════════
// getSeasonalCalendar
// ════════════════════════════════════════════════════════════

describe("getSeasonalCalendar()", () => {
  it("retourne un calendrier vide sans données", async () => {
    const result = await getSeasonalCalendar("CD");

    expect(result.events).toEqual([]);
    expect(result.activeNow).toEqual([]);
  });

  it("retourne les événements actifs", async () => {
    const today = new Date();
    mockPrisma.externalSeasonalSignalDaily.findMany.mockResolvedValue([
      {
        id: "1", signalType: "RELIGIOUS_EVENT", eventName: "Ramadan",
        severity: 80, priceImpact: 10, demandImpact: 25,
        impactCategory: "Alimentation", confidence: 90,
        date: today, countryCode: "CD", city: null, sourceId: "s1",
        sourceUrl: null, observedAt: today, metadata: null, createdAt: today,
      },
    ]);

    const result = await getSeasonalCalendar("CD");

    expect(result.events.length).toBe(1);
    expect(result.activeNow).toContain("Ramadan");
  });
});

// ════════════════════════════════════════════════════════════
// AFRICAN_COUNTRIES
// ════════════════════════════════════════════════════════════

describe("AFRICAN_COUNTRIES mapping", () => {
  it("contient les 8 pays", () => {
    expect(Object.keys(AFRICAN_COUNTRIES)).toHaveLength(8);
    expect(AFRICAN_COUNTRIES).toHaveProperty("CD");
    expect(AFRICAN_COUNTRIES).toHaveProperty("CG");
    expect(AFRICAN_COUNTRIES).toHaveProperty("CI");
    expect(AFRICAN_COUNTRIES).toHaveProperty("SN");
    expect(AFRICAN_COUNTRIES).toHaveProperty("MA");
  });

  it("chaque pays a les champs requis", () => {
    for (const [code, meta] of Object.entries(AFRICAN_COUNTRIES)) {
      expect(meta).toHaveProperty("iso3");
      expect(meta).toHaveProperty("currency");
      expect(meta).toHaveProperty("capital");
      expect(meta).toHaveProperty("timezone");
      expect(meta.iso2).toBe(code);
    }
  });
});
