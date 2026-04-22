/**
 * Tests — direct-answer.engine.ts (Phase 5)
 *
 * Couvre :
 *  - normalizePain (fuzzy match)
 *  - dedupByPain (conserve max priority)
 *  - mapCtaToDirectAnswer (severity scaling 1-10 → 0-100)
 *  - getDirectAnswers : fusion SELL+JOB, pondération intent, cap par tier
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockEvaluateAnalyticsCTAs } = vi.hoisted(() => ({
  mockPrisma: {
    subscription: { findFirst: vi.fn() },
    userKnowledgeIntent: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    jobApplication: { findMany: vi.fn(), count: vi.fn() },
    jobListing: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  } as any,
  mockEvaluateAnalyticsCTAs: vi.fn(),
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock evaluateAnalyticsCTAs (SELL source)
vi.mock("../modules/analytics/analytics-cta.service.js", () => ({
  evaluateAnalyticsCTAs: mockEvaluateAnalyticsCTAs,
}));

import {
  getDirectAnswers,
  _internals,
} from "../modules/analytics/direct-answer.engine.js";
import { clearBridgeCache } from "../modules/analytics/analytics-knowledge-bridge.js";

beforeEach(() => {
  vi.clearAllMocks();
  clearBridgeCache();
});

// ─── Utils internes ───────────────────────────

describe("_internals.normalizePain()", () => {
  it("normalise casse + accents + ponctuation", () => {
    expect(_internals.normalizePain("Votre Taux de Réponse est BAS !!!"))
      .toBe("votre taux de reponse est bas");
  });
  it("tronque à 70 chars", () => {
    const long = "a".repeat(100);
    expect(_internals.normalizePain(long).length).toBeLessThanOrEqual(70);
  });
});

describe("_internals.dedupByPain()", () => {
  it("conserve l'answer avec max priority si pains similaires", () => {
    const out = _internals.dedupByPain([
      { pain: "Taux de réponse faible", priority: 50 } as any,
      { pain: "Taux de reponse faible", priority: 80 } as any,
      { pain: "Autre douleur", priority: 30 } as any,
    ]);
    expect(out.length).toBe(2);
    const kept = out.find((o: any) => o.pain.includes("Taux"));
    expect(kept?.priority).toBe(80);
  });
});

describe("_internals.mapCtaToDirectAnswer()", () => {
  const baseCta = {
    trigger: "MULTI_LISTINGS",
    tier: "MEDIUM",
    priority: 5,
    icon: "🚀",
    title: "Boostez vos annonces",
    subtitle: "Comprenez vos données",
    message: "...",
    whyNow: "...",
    valuePills: [],
    ctaLabel: "Découvrir",
    ctaTarget: "/analytics",
    planName: "PRO VENDEUR",
    planPrice: "20$/mois",
  };

  it("priority 1→10 INFO, 4→40 WARN, 8→80 CRITICAL", () => {
    expect(_internals.mapCtaToDirectAnswer({ ...baseCta, priority: 1 } as any, 0).severity).toBe("INFO");
    expect(_internals.mapCtaToDirectAnswer({ ...baseCta, priority: 4 } as any, 0).severity).toBe("WARN");
    expect(_internals.mapCtaToDirectAnswer({ ...baseCta, priority: 8 } as any, 0).severity).toBe("CRITICAL");
  });

  it("cta action = UPGRADE_PLAN avec meta.target", () => {
    const da = _internals.mapCtaToDirectAnswer(baseCta as any, 0);
    expect(da.cta.action).toBe("UPGRADE_PLAN");
    expect(da.cta.meta?.target).toBe("/analytics");
    expect(da.source).toBe("SELL");
  });
});

// ─── Pipeline complet ─────────────────────────

describe("getDirectAnswers()", () => {
  it("FREE : cap à 1 answer, totalCandidates préservé", async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue(null); // FREE
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue(null);
    mockEvaluateAnalyticsCTAs.mockResolvedValue({
      ctas: [
        { trigger: "MULTI_LISTINGS", tier: "MEDIUM", priority: 8, icon: "", title: "CTA1", subtitle: "", message: "", whyNow: "", valuePills: [], ctaLabel: "Voir", ctaTarget: "/a", planName: "P", planPrice: "" },
        { trigger: "SALES_HISTORY", tier: "MEDIUM", priority: 6, icon: "", title: "CTA2", subtitle: "", message: "", whyNow: "", valuePills: [], ctaLabel: "Voir", ctaTarget: "/b", planName: "P", planPrice: "" },
      ],
      hasAnalytics: false, currentTier: "NONE", suggestedUpgrade: "MEDIUM",
    });
    mockPrisma.jobApplication.findMany.mockResolvedValue([]);
    mockPrisma.jobListing.count.mockResolvedValue(0);

    const r = await getDirectAnswers("u1");
    expect(r.tier).toBe("FREE");
    expect(r.answers.length).toBe(1);
    expect(r.totalCandidates).toBeGreaterThanOrEqual(2);
    expect(r.cappedBy).toBe("TIER");
  });

  it("MEDIUM : cap 3, trié par priorité desc", async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "BUSINESS" });
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue(null);
    mockEvaluateAnalyticsCTAs.mockResolvedValue({
      ctas: [
        { trigger: "MULTI_LISTINGS", tier: "MEDIUM", priority: 3, icon: "", title: "Low", subtitle: "", message: "", whyNow: "", valuePills: [], ctaLabel: "x", ctaTarget: "", planName: "", planPrice: "" },
        { trigger: "SALES_HISTORY", tier: "MEDIUM", priority: 9, icon: "", title: "High", subtitle: "", message: "", whyNow: "", valuePills: [], ctaLabel: "x", ctaTarget: "", planName: "", planPrice: "" },
        { trigger: "GROWING_BUSINESS", tier: "MEDIUM", priority: 6, icon: "", title: "Mid", subtitle: "", message: "", whyNow: "", valuePills: [], ctaLabel: "x", ctaTarget: "", planName: "", planPrice: "" },
        { trigger: "PROMO_ACTIVITY", tier: "MEDIUM", priority: 5, icon: "", title: "Mid2", subtitle: "", message: "", whyNow: "", valuePills: [], ctaLabel: "x", ctaTarget: "", planName: "", planPrice: "" },
      ],
      hasAnalytics: false, currentTier: "NONE", suggestedUpgrade: "MEDIUM",
    });
    mockPrisma.jobApplication.findMany.mockResolvedValue([]);
    mockPrisma.jobListing.count.mockResolvedValue(0);

    const r = await getDirectAnswers("u1");
    expect(r.tier).toBe("MEDIUM");
    expect(r.answers.length).toBe(3);
    const prios = r.answers.map((a) => a.priority);
    expect(prios).toEqual([...prios].sort((a, b) => b - a));
    expect(r.answers[0]!.pain).toBe("High");
  });

  it("Intent WORK boost +10 les answers JOB", async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "SCALE" });
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue({
      goals: ["WORK"], categories: ["IT"], keywords: [], countriesInterest: ["CD"],
    });
    // SELL priority 6 → scaled 60 + severity WARN bonus 5 = ~65
    mockEvaluateAnalyticsCTAs.mockResolvedValue({
      ctas: [{ trigger: "MULTI_LISTINGS", tier: "MEDIUM", priority: 6, icon: "", title: "Sell X", subtitle: "", message: "", whyNow: "", valuePills: [], ctaLabel: "x", ctaTarget: "", planName: "", planPrice: "" }],
      hasAnalytics: false, currentTier: "NONE", suggestedUpgrade: "MEDIUM",
    });
    // JOB : 3 apps PENDING → LOW_RESPONSE_RATE priority 80 + severity WARN 5 + intent WORK +10 = 95
    const now = new Date();
    mockPrisma.jobApplication.findMany.mockResolvedValue([
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
    ]);
    mockPrisma.jobListing.count.mockResolvedValue(0);

    const r = await getDirectAnswers("u1");
    const top = r.answers[0];
    expect(top?.source).toBe("JOB");
    expect(top?.priority).toBeGreaterThanOrEqual(85);
  });

  it("Pas d'explosion si les deux sources échouent", async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "BUSINESS" });
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue(null);
    mockEvaluateAnalyticsCTAs.mockRejectedValue(new Error("SELL down"));
    mockPrisma.jobApplication.findMany.mockRejectedValue(new Error("JOB down"));
    mockPrisma.jobListing.count.mockResolvedValue(0);

    const r = await getDirectAnswers("u1");
    expect(r.answers).toEqual([]);
    expect(r.totalCandidates).toBe(0);
  });
});
