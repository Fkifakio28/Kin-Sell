/**
 * Tests — analytics-knowledge-bridge.ts (Phase 4)
 *
 * Vérifie :
 *  - enrichAnalyticsContext : lecture intent + cache 60s
 *  - enrichKnowledgeWithAnalytics :
 *      * signal LOW_RESPONSE_RATE → ajoute boost "améliorer taux réponse"
 *      * intent WORK + catégorie + offres actives → boost "opportunités détectées"
 *      * recruteur applicationRate < 0.03 → boost "reformuler offre"
 *      * tri par priorité desc
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    userKnowledgeIntent: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn() },
    jobApplication: { findMany: vi.fn() },
    jobListing: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  enrichAnalyticsContext,
  enrichKnowledgeWithAnalytics,
  clearBridgeCache,
} from "../modules/analytics/analytics-knowledge-bridge.js";

beforeEach(() => {
  vi.clearAllMocks();
  clearBridgeCache();
});

// ─── enrichAnalyticsContext ───────────────────

describe("enrichAnalyticsContext()", () => {
  it("lit l'intent et expose les booléens has*Intent", async () => {
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue({
      goals: ["WORK", "SELL"],
      categories: ["IT"],
      keywords: [],
      countriesInterest: ["CD"],
    });
    const ctx = await enrichAnalyticsContext("u1");
    expect(ctx.hasWorkIntent).toBe(true);
    expect(ctx.hasSellIntent).toBe(true);
    expect(ctx.hasHireIntent).toBe(false);
    expect(ctx.hasBuyIntent).toBe(false);
    expect(ctx.categories).toEqual(["IT"]);
  });

  it("retourne un contexte vide si pas d'intent", async () => {
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue(null);
    const ctx = await enrichAnalyticsContext("u2");
    expect(ctx.goals).toEqual([]);
    expect(ctx.hasWorkIntent).toBe(false);
  });

  it("cache les résultats (2e appel ne refait pas la requête)", async () => {
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue({
      goals: ["WORK"], categories: [], keywords: [], countriesInterest: [],
    });
    await enrichAnalyticsContext("u3");
    await enrichAnalyticsContext("u3");
    expect(mockPrisma.userKnowledgeIntent.findUnique).toHaveBeenCalledTimes(1);
  });
});

// ─── enrichKnowledgeWithAnalytics ─────────────

describe("enrichKnowledgeWithAnalytics()", () => {
  const baseRecs = [
    {
      id: "r1",
      goal: "WORK" as any,
      title: "Base reco",
      message: "...",
      topZones: [],
    },
  ];

  it("ajoute boost LOW_RESPONSE_RATE si candidate a responseRate < 0.3", async () => {
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue({
      goals: ["WORK"], categories: ["IT"], keywords: [], countriesInterest: ["CD"],
    });
    // Pour getMyApplicationsInsights via subscription.findFirst → FREE tier
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "BUSINESS" });
    const now = new Date();
    mockPrisma.jobApplication.findMany.mockResolvedValue([
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
    ]);
    mockPrisma.jobListing.count.mockResolvedValue(2); // < 5 → pas de boost "opps"
    mockPrisma.jobListing.findMany.mockResolvedValue([]);

    const out = await enrichKnowledgeWithAnalytics("u1", baseRecs);
    const boosts = out.filter((r: any) => r.source === "ANALYTICS_JOB");
    expect(boosts.some((b: any) => b.id.includes("responserate"))).toBe(true);
  });

  it("ajoute boost opportunities si ≥5 offres actives sur catégorie intent", async () => {
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue({
      goals: ["WORK"], categories: ["IT"], keywords: [], countriesInterest: ["CD"],
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "SCALE" });
    mockPrisma.jobApplication.findMany.mockResolvedValue([]); // pas de frustration
    mockPrisma.jobListing.count.mockResolvedValue(12);
    mockPrisma.jobListing.findMany.mockResolvedValue([]);

    const out = await enrichKnowledgeWithAnalytics("u1", baseRecs);
    const opps = out.find((r: any) => r.id?.includes("work-opps"));
    expect(opps).toBeDefined();
    expect((opps as any).title).toContain("12 offres IT");
  });

  it("ajoute boost HIRE si recruiteur a applicationRate < 3%", async () => {
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue({
      goals: ["HIRE"], categories: [], keywords: [], countriesInterest: [],
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "BUSINESS" });
    mockPrisma.jobApplication.findMany.mockResolvedValue([]);
    mockPrisma.jobListing.count.mockResolvedValue(0);
    mockPrisma.jobListing.findMany.mockResolvedValue([
      { id: "j1", title: "Dev Senior", viewCount: 100, applicationCount: 1 },
    ]);

    const out = await enrichKnowledgeWithAnalytics("r1", []);
    const hireBoost = out.find((r: any) => r.id?.includes("hire-rate"));
    expect(hireBoost).toBeDefined();
    expect((hireBoost as any).goal).toBe("HIRE");
  });

  it("tri par priorité desc", async () => {
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue({
      goals: ["WORK"], categories: ["IT"], keywords: [], countriesInterest: ["CD"],
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "SCALE" });
    const now = new Date();
    mockPrisma.jobApplication.findMany.mockResolvedValue([
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
    ]);
    mockPrisma.jobListing.count.mockResolvedValue(10);
    mockPrisma.jobListing.findMany.mockResolvedValue([]);

    const out = await enrichKnowledgeWithAnalytics("u1", baseRecs);
    const prios = out.map((r: any) => "priority" in r ? r.priority : 50);
    const sorted = [...prios].sort((a, b) => b - a);
    expect(prios).toEqual(sorted);
  });

  it("ne throw pas si getMyApplicationsInsights échoue", async () => {
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue({
      goals: ["WORK"], categories: [], keywords: [], countriesInterest: [],
    });
    mockPrisma.subscription.findFirst.mockRejectedValue(new Error("DB down"));
    mockPrisma.jobListing.findMany.mockResolvedValue([]);
    const out = await enrichKnowledgeWithAnalytics("u1", baseRecs);
    expect(out.length).toBeGreaterThanOrEqual(1); // au moins la reco de base
  });
});
