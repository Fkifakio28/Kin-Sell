/**
 * Tests — job-analytics.service.ts
 *
 * Couvre :
 *  - formule alignment-score (§7 spec)
 *  - freemium gating (FREE, MEDIUM, PREMIUM)
 *  - demand-map aggregation + masquage FREE
 *  - my-applications-insights signals frustration
 *  - posting-insights quality distribution
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    subscription: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    userKnowledgeIntent: { findUnique: vi.fn() },
    jobListing: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    jobApplication: {
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
  getJobDemandMap,
  getAlignmentScore,
  getMyApplicationsInsights,
  getPostingInsights,
  getJobMarketSnapshot,
} from "../modules/job-analytics/job-analytics.service.js";

// Helper : simule un tier via subscription.findFirst
function setTier(planCode: string | null) {
  mockPrisma.subscription.findFirst.mockResolvedValue(
    planCode ? { planCode } : null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────
// Alignment Score — formule §7
// ─────────────────────────────────────────────────────

describe("getAlignmentScore()", () => {
  const baseJob = {
    id: "j1",
    recruiterUserId: "r1",
    title: "Dev",
    category: "IT",
    city: "Kinshasa",
    countryCode: "CD",
    requiredSkills: ["react", "node"],
    requiredQualifs: ["bachelor info"],
    minExperienceYrs: 3,
    salaryMaxUsd: 1000,
  };

  it("score 1.0 si match parfait (PREMIUM voit breakdown complet)", async () => {
    setTier("SCALE");
    mockPrisma.jobListing.findUnique.mockResolvedValue(baseJob);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      profile: { city: "Kinshasa", countryCode: "CD" },
      qualifications: [{ label: "Bachelor Info" }],
      experiences: [
        {
          category: "IT",
          startDate: new Date(Date.now() - 5 * 365 * 24 * 3600 * 1000),
          endDate: null,
          skills: ["React", "Node"],
        },
      ],
    });

    const r = await getAlignmentScore("u1", { jobId: "j1" });
    expect(r.scoreGlobal).toBeGreaterThanOrEqual(0.95);
    expect(r.verdict).toBe("Candidature fortement recommandée");
    expect(r.breakdown).toBeDefined();
    expect(r.breakdown!.geo).toBe(1);
    expect(r.tier).toBe("PREMIUM");
  });

  it("FREE : masque breakdown, expose verdict + 1 strength + CTA", async () => {
    setTier(null);
    mockPrisma.jobListing.findUnique.mockResolvedValue(baseJob);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      profile: { city: "Kinshasa", countryCode: "CD" },
      qualifications: [{ label: "Bachelor Info" }],
      experiences: [
        {
          category: "IT",
          startDate: new Date(Date.now() - 5 * 365 * 24 * 3600 * 1000),
          endDate: null,
          skills: ["React", "Node"],
        },
      ],
    });

    const r = await getAlignmentScore("u1", { jobId: "j1" });
    expect(r.tier).toBe("FREE");
    expect(r.breakdown).toBeUndefined();
    expect(r.strengths.length).toBeLessThanOrEqual(1);
    expect(r.gaps).toEqual([]);
    expect(r.verdict).toBeDefined();
    expect(r.cta).toBeDefined();
  });

  it("geo = 0.6 si même pays mais ville différente", async () => {
    setTier("SCALE");
    mockPrisma.jobListing.findUnique.mockResolvedValue(baseJob);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      profile: { city: "Lubumbashi", countryCode: "CD" },
      qualifications: [],
      experiences: [],
    });

    const r = await getAlignmentScore("u1", { jobId: "j1" });
    expect(r.breakdown!.geo).toBe(0.6);
  });

  it("403 si recruteur passe candidateUserId sur job non-owned", async () => {
    setTier("SCALE");
    mockPrisma.jobListing.findUnique.mockResolvedValue(baseJob);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "c1",
      profile: null,
      qualifications: [],
      experiences: [],
    });
    await expect(
      getAlignmentScore("other_recruiter", { jobId: "j1", candidateUserId: "c1" }),
    ).rejects.toThrow(/refus/i);
  });

  it("404 si offre inconnue", async () => {
    setTier("SCALE");
    mockPrisma.jobListing.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1", profile: null, qualifications: [], experiences: [],
    });
    await expect(getAlignmentScore("u1", { jobId: "nope" })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────
// Demand Map — freemium gating
// ─────────────────────────────────────────────────────

describe("getJobDemandMap()", () => {
  const zones = [
    { country: "RDC", countryCode: "CD", city: "Kinshasa", category: "IT",
      _count: { _all: 50 }, _avg: { salaryMinUsd: 400, salaryMaxUsd: 800 },
      _sum: { applicationCount: 120, viewCount: 500 } },
    { country: "RDC", countryCode: "CD", city: "Lubumbashi", category: "IT",
      _count: { _all: 20 }, _avg: { salaryMinUsd: 300, salaryMaxUsd: 600 },
      _sum: { applicationCount: 40, viewCount: 200 } },
    { country: "Gabon", countryCode: "GA", city: "Libreville", category: "IT",
      _count: { _all: 15 }, _avg: { salaryMinUsd: 500, salaryMaxUsd: 900 },
      _sum: { applicationCount: 30, viewCount: 100 } },
    { country: "RDC", countryCode: "CD", city: "Goma", category: "IT",
      _count: { _all: 10 }, _avg: { salaryMinUsd: 350, salaryMaxUsd: 700 },
      _sum: { applicationCount: 25, viewCount: 80 } },
  ];

  it("FREE : 3 zones max, chiffres masqués (locked=true)", async () => {
    setTier(null);
    mockPrisma.jobListing.groupBy.mockResolvedValue(zones);
    const r = await getJobDemandMap("u1", { limit: 20 });
    expect(r.tier).toBe("FREE");
    expect(r.zones.length).toBe(3);
    expect(r.zones[0]!.openJobs).toBe(-1);
    expect(r.zones[0]!.applicants).toBe(-1);
    expect(r.zones[0]!.avgSalaryUsd).toBeNull();
    expect(r.zones[0]!.locked).toBe(true);
  });

  it("MEDIUM : 10 zones max, chiffres visibles, topSkills vides", async () => {
    setTier("BUSINESS");
    mockPrisma.jobListing.groupBy.mockResolvedValue(zones);
    const r = await getJobDemandMap("u1", { limit: 20 });
    expect(r.tier).toBe("MEDIUM");
    expect(r.zones.length).toBe(zones.length);
    expect(r.zones[0]!.openJobs).toBe(50);
    expect(r.zones[0]!.locked).toBeUndefined();
    expect(r.zones[0]!.topSkills).toEqual([]);
  });

  it("PREMIUM : hydrate topSkills", async () => {
    setTier("SCALE");
    mockPrisma.jobListing.groupBy.mockResolvedValue(zones.slice(0, 1));
    mockPrisma.jobListing.findMany.mockResolvedValue([
      { requiredSkills: ["React", "Node"] },
      { requiredSkills: ["React", "SQL"] },
    ]);
    const r = await getJobDemandMap("u1", {});
    expect(r.tier).toBe("PREMIUM");
    expect(r.zones[0]!.topSkills).toContain("React");
  });

  it("scope = CROSS_BORDER si zones dans ≥ 2 pays", async () => {
    setTier("BUSINESS");
    mockPrisma.jobListing.groupBy.mockResolvedValue(zones);
    const r = await getJobDemandMap("u1", { limit: 20 });
    expect(r.scope).toBe("CROSS_BORDER");
  });
});

// ─────────────────────────────────────────────────────
// My Applications Insights — signals frustration
// ─────────────────────────────────────────────────────

describe("getMyApplicationsInsights()", () => {
  it("LOW_RESPONSE_RATE si responseRate < 0.3 et ≥ 3 applications", async () => {
    setTier("BUSINESS");
    const now = new Date();
    mockPrisma.jobApplication.findMany.mockResolvedValue([
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.6, jobListing: { category: "IT" } },
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.5, jobListing: { category: "IT" } },
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.7, jobListing: { category: "IT" } },
      { status: "PENDING", createdAt: now, firstSeenAt: null, respondedAt: null, alignmentScore: 0.4, jobListing: { category: "IT" } },
    ]);
    const r = await getMyApplicationsInsights("u1");
    expect(r.totalApplications).toBe(4);
    expect(r.responseRate).toBe(0);
    expect(r.frustrationSignal).toBe("LOW_RESPONSE_RATE");
  });

  it("FREE : responseRate=0 et bestAlignmentCategory=null même si données existent", async () => {
    setTier(null);
    const now = new Date();
    mockPrisma.jobApplication.findMany.mockResolvedValue([
      { status: "SEEN", createdAt: now, firstSeenAt: now, respondedAt: now, alignmentScore: 0.8, jobListing: { category: "IT" } },
    ]);
    const r = await getMyApplicationsInsights("u1");
    expect(r.tier).toBe("FREE");
    expect(r.responseRate).toBe(0);
    expect(r.bestAlignmentCategory).toBeNull();
  });

  it("PREMIUM : bestAlignmentCategory retournée", async () => {
    setTier("SCALE");
    const now = new Date();
    mockPrisma.jobApplication.findMany.mockResolvedValue([
      { status: "ACCEPTED", createdAt: now, firstSeenAt: now, respondedAt: now, alignmentScore: 0.9, jobListing: { category: "IT" } },
      { status: "REJECTED", createdAt: now, firstSeenAt: now, respondedAt: now, alignmentScore: 0.3, jobListing: { category: "Marketing" } },
    ]);
    const r = await getMyApplicationsInsights("u1");
    expect(r.bestAlignmentCategory).toBe("IT");
  });
});

// ─────────────────────────────────────────────────────
// Posting Insights
// ─────────────────────────────────────────────────────

describe("getPostingInsights()", () => {
  it("403 si user ≠ recruiter", async () => {
    setTier("BUSINESS");
    mockPrisma.jobListing.findUnique.mockResolvedValue({
      id: "j1", title: "Dev", recruiterUserId: "other", viewCount: 100, applicationCount: 5,
    });
    mockPrisma.jobApplication.findMany.mockResolvedValue([]);
    await expect(getPostingInsights("u1", "j1")).rejects.toThrow();
  });

  it("distribution qualité (weak/fair/strong) + recommandation si peu de vues", async () => {
    setTier("BUSINESS");
    mockPrisma.jobListing.findUnique.mockResolvedValue({
      id: "j1", title: "Dev", recruiterUserId: "u1", viewCount: 10, applicationCount: 3,
    });
    mockPrisma.jobApplication.findMany.mockResolvedValue([
      { alignmentScore: 0.2 },
      { alignmentScore: 0.5 },
      { alignmentScore: 0.8 },
    ]);
    const r = await getPostingInsights("u1", "j1");
    expect(r.qualityDistribution).toEqual({ weak: 1, fair: 1, strong: 1 });
    expect(r.recommendations).toContain("Boostez la visibilité : moins de 20 vues.");
  });

  it("FREE : qualityDistribution vide + avgAlignment null", async () => {
    setTier(null);
    mockPrisma.jobListing.findUnique.mockResolvedValue({
      id: "j1", title: "Dev", recruiterUserId: "u1", viewCount: 100, applicationCount: 10,
    });
    mockPrisma.jobApplication.findMany.mockResolvedValue([
      { alignmentScore: 0.8 }, { alignmentScore: 0.5 },
    ]);
    const r = await getPostingInsights("u1", "j1");
    expect(r.qualityDistribution).toEqual({ weak: 0, fair: 0, strong: 0 });
    expect(r.avgAlignment).toBeNull();
  });
});

// ─────────────────────────────────────────────────────
// Market Snapshot
// ─────────────────────────────────────────────────────

describe("getJobMarketSnapshot()", () => {
  it("asRecruiter null si l'user n'a pas d'offre active", async () => {
    setTier("BUSINESS");
    mockPrisma.user.findUnique.mockResolvedValue({
      role: "USER", profile: { city: "Kinshasa", countryCode: "CD" },
    });
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue(null);
    mockPrisma.jobListing.count
      .mockResolvedValueOnce(42)  // openJobsForMe
      .mockResolvedValueOnce(0);  // activeJobs (recruteur)
    mockPrisma.jobApplication.findMany.mockResolvedValue([]);
    mockPrisma.jobListing.groupBy.mockResolvedValue([
      { category: "IT", _count: { _all: 42 } },
    ]);
    const r = await getJobMarketSnapshot("u1");
    expect(r.asRecruiter).toBeNull();
    expect(r.asCandidate.openJobsForMe).toBe(42);
  });

  it("FREE : openJobsForMe capé à 3", async () => {
    setTier(null);
    mockPrisma.user.findUnique.mockResolvedValue({
      role: "USER", profile: { city: "Kinshasa", countryCode: "CD" },
    });
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue(null);
    mockPrisma.jobListing.count
      .mockResolvedValueOnce(42)
      .mockResolvedValueOnce(0);
    mockPrisma.jobApplication.findMany.mockResolvedValue([]);
    mockPrisma.jobListing.groupBy.mockResolvedValue([]);
    const r = await getJobMarketSnapshot("u1");
    expect(r.asCandidate.openJobsForMe).toBe(3);
    expect(r.asCandidate.avgAlignmentScore).toBeNull();
  });

  it("asRecruiter présent avec saturation LOW/MEDIUM/HIGH", async () => {
    setTier("BUSINESS");
    mockPrisma.user.findUnique.mockResolvedValue({
      role: "BUSINESS", profile: null,
    });
    mockPrisma.userKnowledgeIntent.findUnique.mockResolvedValue(null);
    mockPrisma.jobListing.count
      .mockResolvedValueOnce(0)   // openJobsForMe
      .mockResolvedValueOnce(2);  // activeJobs
    mockPrisma.jobApplication.findMany.mockResolvedValue([]);
    mockPrisma.jobApplication.count.mockResolvedValue(40);
    mockPrisma.jobListing.groupBy.mockResolvedValue([]);
    const r = await getJobMarketSnapshot("u1");
    expect(r.asRecruiter).not.toBeNull();
    expect(r.asRecruiter!.activeJobs).toBe(2);
    expect(r.asRecruiter!.avgApplicationsPerJob).toBe(20);
    expect(r.asRecruiter!.poolSaturation).toBe("HIGH");
  });
});
