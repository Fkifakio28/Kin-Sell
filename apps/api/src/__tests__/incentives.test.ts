/**
 * Tests — Incentive Engine (coupons, grants, jobs)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockPrisma, createMockLogger } from "./helpers.js";

// ── Mocks (must be before import) ──
const mockPrisma = createMockPrisma();
const mockLogger = createMockLogger();

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({ logger: mockLogger }));
vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return { ...actual, randomBytes: vi.fn(() => Buffer.from("aabbccdd", "hex")) };
});

// ── Import after mocks ──
const mod = await import("../modules/incentives/incentive.service.js");
const validateCoupon = mod.validateCoupon;
const previewCoupon = mod.previewCoupon;
const deleteCoupon = mod.deleteCoupon;
const runExpirationJob = mod.runExpirationJob;
const selectIncentiveForUser = mod.selectIncentiveForUser;
const emitGrowthGrant = mod.emitGrowthGrant;
const recordGrowthEvent = mod.recordGrowthEvent;
const recordGrowthEventIdempotent = mod.recordGrowthEventIdempotent;
const runRebalance100Job = mod.runRebalance100Job;
const diagnosticUser = mod.diagnosticUser;
const getIncentiveStats = mod.getIncentiveStats;
const listMyGrants = mod.listMyGrants;
const listMyCoupons = mod.listMyCoupons;
const convertGrantToCoupon = mod.convertGrantToCoupon;

// ── Helpers ──
const NOW = new Date("2026-04-15T12:00:00Z");

function makeCoupon(overrides: Record<string, unknown> = {}) {
  return {
    id: "coupon-1",
    code: "TEST-CODE",
    kind: "PLAN_DISCOUNT",
    discountPercent: 20,
    targetScope: "ALL_PLANS",
    targetPlanCodes: [],
    targetAddonCodes: [],
    maxUses: 10,
    usedCount: 0,
    maxUsesPerUser: 1,
    status: "ACTIVE",
    segment: "STANDARD",
    startsAt: new Date("2026-01-01"),
    expiresAt: new Date("2026-12-31"),
    recipientUserId: null,
    redemptions: [],
    ...overrides,
  };
}

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    segment: "STANDARD",
    couponProbability: 0.1,
    maxCouponsPerMonth: 7,
    maxDiscount80PerMonth: 3,
    coupon100MaxDays: 14,
    allowedDiscounts: [10, 15, 20, 30, 50, 80, 100],
    growthProbability: 0.1,
    maxGrowthGrantsPerMonth: 15,
    maxAddonGainPerMonth: 1,
    isActive: true,
    target100Ratio: 0.15,
    ...overrides,
  };
}

function makeQuota(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    monthKey: "2026-04",
    couponCount: 0,
    coupon100Count: 0,
    cpcCount: 0,
    cpiCount: 0,
    cpaCount: 0,
    discount80Count: 0,
    addonGainCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
});

// ══════════════════════════════════════════════
// validateCoupon
// ══════════════════════════════════════════════

describe("validateCoupon", () => {
  it("retourne INVALID_CODE si coupon introuvable", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(null);

    const result = await validateCoupon("user-1", "FAKE");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_OR_EXPIRED");
  });

  it("retourne COUPON_INACTIVE si coupon non actif", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(
      makeCoupon({ status: "REVOKED" }),
    );

    const result = await validateCoupon("user-1", "TEST-CODE");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("INVALID_OR_EXPIRED");
  });

  it("retourne EXPIRED si coupon expiré", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(
      makeCoupon({ expiresAt: new Date("2025-01-01") }),
    );

    const result = await validateCoupon("user-1", "TEST-CODE");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("EXPIRED");
  });

  it("retourne MAX_USES_REACHED si uses épuisés", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(
      makeCoupon({ usedCount: 10, maxUses: 10 }),
    );

    const result = await validateCoupon("user-1", "TEST-CODE");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("MAX_USES_REACHED");
  });

  it("retourne MAX_USES_PER_USER si user a déjà utilisé", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(
      makeCoupon({ redemptions: [{ userId: "user-1", status: "APPLIED" }] }),
    );

    const result = await validateCoupon("user-1", "TEST-CODE");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("MAX_USES_PER_USER");
  });

  it("retourne NOT_RECIPIENT si coupon ciblé pour un autre user", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(
      makeCoupon({ recipientUserId: "other-user" }),
    );

    const result = await validateCoupon("user-1", "TEST-CODE");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("NOT_RECIPIENT");
  });

  it("retourne valid=true pour un coupon valide", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(makeCoupon());
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(makeQuota());
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy());

    const result = await validateCoupon("user-1", "TEST-CODE");
    expect(result.valid).toBe(true);
    expect(result.discountPercent).toBe(20);
  });

  it("retourne MONTHLY_QUOTA_REACHED si quota atteint", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(makeCoupon());
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(
      makeQuota({ couponCount: 7 }),
    );
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy());

    const result = await validateCoupon("user-1", "TEST-CODE");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("MONTHLY_QUOTA_REACHED");
  });
});

// ══════════════════════════════════════════════
// previewCoupon
// ══════════════════════════════════════════════

describe("previewCoupon", () => {
  it("calcule le prix final avec réduction", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(makeCoupon({ discountPercent: 30 }));
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(makeQuota());
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy());

    const result = await previewCoupon("user-1", "TEST-CODE", 2000); // 20.00$
    expect(result.valid).toBe(true);
    expect(result.originalAmountUsdCents).toBe(2000);
    expect(result.discountAmountUsdCents).toBe(600); // 30% of 2000
    expect(result.finalAmountUsdCents).toBe(1400);
  });

  it("retourne 0 discount si coupon invalide", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(null);

    const result = await previewCoupon("user-1", "FAKE", 2000);
    expect(result.valid).toBe(false);
    expect(result.discountAmountUsdCents).toBe(0);
    expect(result.finalAmountUsdCents).toBe(2000);
  });

  it("gère 100% de réduction", async () => {
    mockPrisma.incentiveCoupon.findUnique.mockResolvedValue(makeCoupon({ discountPercent: 100 }));
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(makeQuota());
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy());

    const result = await previewCoupon("user-1", "TEST-CODE", 1200);
    expect(result.finalAmountUsdCents).toBe(0);
    expect(result.discountAmountUsdCents).toBe(1200);
  });
});

// ══════════════════════════════════════════════
// deleteCoupon
// ══════════════════════════════════════════════

describe("deleteCoupon", () => {
  it("refuse si coupon a des rédemptions actives", async () => {
    mockPrisma.incentiveCouponRedemption.count.mockResolvedValue(3);

    await expect(deleteCoupon("coupon-1")).rejects.toThrow("CANNOT_DELETE_COUPON_WITH_REDEMPTIONS");
  });

  it("supprime si aucune rédemption active", async () => {
    mockPrisma.incentiveCouponRedemption.count.mockResolvedValue(0);
    mockPrisma.incentiveCouponRedemption.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.incentiveCoupon.delete.mockResolvedValue({ id: "coupon-1" });

    const result = await deleteCoupon("coupon-1");
    expect(result.id).toBe("coupon-1");
    expect(mockPrisma.incentiveCouponRedemption.deleteMany).toHaveBeenCalledWith({ where: { couponId: "coupon-1" } });
  });
});

// ══════════════════════════════════════════════
// runExpirationJob
// ══════════════════════════════════════════════

describe("runExpirationJob", () => {
  it("expire coupons et grants périmés", async () => {
    mockPrisma.incentiveCoupon.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.growthIncentiveGrant.updateMany.mockResolvedValue({ count: 2 });

    const result = await runExpirationJob();
    expect(result.expiredCoupons).toBe(3);
    expect(result.expiredGrants).toBe(2);

    // Vérifie les filtres
    expect(mockPrisma.incentiveCoupon.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          expiresAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
        data: { status: "EXPIRED" },
      }),
    );
  });
});

// ══════════════════════════════════════════════
// selectIncentiveForUser
// ══════════════════════════════════════════════

describe("selectIncentiveForUser", () => {
  it("retourne null si policy inactive (global pause)", async () => {
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy({ isActive: false }));
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(makeQuota());

    const result = await selectIncentiveForUser("user-1");
    expect(result).toBeNull();
  });

  it("retourne null si quota coupons atteinte", async () => {
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy({ couponProbability: 1 }));
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(makeQuota({ couponCount: 7 }));

    const result = await selectIncentiveForUser("user-1");
    expect(result).toBeNull();
  });

  it("génère un coupon si gate passe (probability=1)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05); // < 1 → passe gate
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy({ couponProbability: 1 }));
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(makeQuota());
    mockPrisma.incentiveCoupon.create.mockResolvedValue({
      id: "new-coupon",
      code: "KS-AABBCCDD",
      expiresAt: new Date("2026-05-15"),
      kind: "PLAN_DISCOUNT",
    });

    const result = await selectIncentiveForUser("user-1");
    expect(result).not.toBeNull();
    expect(result!.couponCode).toBe("KS-AABBCCDD");
    vi.spyOn(Math, "random").mockRestore();
  });
});

// ══════════════════════════════════════════════
// emitGrowthGrant
// ══════════════════════════════════════════════

describe("emitGrowthGrant", () => {
  it("retourne null si policy inactive", async () => {
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy({ isActive: false }));
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(makeQuota());

    const result = await emitGrowthGrant("user-1", "CPC");
    expect(result).toBeNull();
  });

  it("retourne null si quota grants atteinte", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy({ growthProbability: 1 }));
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(
      makeQuota({ cpcCount: 5, cpiCount: 5, cpaCount: 5 }), // total 15 = max
    );

    const result = await emitGrowthGrant("user-1", "CPC");
    expect(result).toBeNull();
    vi.spyOn(Math, "random").mockRestore();
  });

  it("émet un grant si conditions remplies (probability=1)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy({ growthProbability: 1 }));
    mockPrisma.incentiveQuotaCounter.upsert.mockResolvedValue(makeQuota());

    const mockGrant = { id: "grant-1", kind: "CPC", discountPercent: 30, expiresAt: new Date("2026-05-15") };
    mockPrisma.growthIncentiveGrant.create.mockResolvedValue(mockGrant);
    mockPrisma.growthIncentiveEvent.create.mockResolvedValue({ id: "event-1" });

    // Override $transaction to pass mockPrisma as tx (instead of a new proxy)
    mockPrisma._$transactionOverride = vi.fn(async (fn: any) => fn(mockPrisma));

    const result = await emitGrowthGrant("user-1", "CPC");
    expect(result).not.toBeNull();
    expect(result!.grantId).toBe("grant-1");
    expect(result!.kind).toBe("CPC");

    // Cleanup
    delete mockPrisma._$transactionOverride;
    vi.spyOn(Math, "random").mockRestore();
  });
});

// ══════════════════════════════════════════════
// recordGrowthEvent
// ══════════════════════════════════════════════

describe("recordGrowthEvent", () => {
  it("rejette si grant introuvable", async () => {
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue(null);
    await expect(recordGrowthEvent("grant-1", "user-1", "click")).rejects.toThrow("GRANT_NOT_FOUND");
  });

  it("rejette si grant non actif", async () => {
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue({
      id: "grant-1", userId: "user-1", status: "CONSUMED", kind: "CPC", discountPercent: 30,
      expiresAt: new Date("2026-06-01"),
    });
    await expect(recordGrowthEvent("grant-1", "user-1", "click")).rejects.toThrow("GRANT_NOT_ACTIVE");
  });

  it("rejette si userId ne correspond pas au grant", async () => {
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue({
      id: "grant-1", userId: "other-user", status: "ACTIVE", kind: "CPC",
    });
    await expect(recordGrowthEvent("grant-1", "user-1", "click")).rejects.toThrow("GRANT_NOT_FOUND");
  });

  it("enregistre un event click", async () => {
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue({
      id: "grant-1", userId: "user-1", status: "ACTIVE", kind: "CPC", discountPercent: 20,
      expiresAt: new Date("2026-06-01"),
    });
    mockPrisma.growthIncentiveEvent.create.mockResolvedValue({ id: "event-1", eventType: "click" });

    const result = await recordGrowthEvent("grant-1", "user-1", "click");
    expect(result.eventType).toBe("click");
  });

  it("consomme le grant sur conversion et crée un coupon", async () => {
    const grantData = {
      id: "grant-1", userId: "user-1", status: "ACTIVE", kind: "CPC", discountPercent: 30,
      expiresAt: new Date("2026-06-01"),
    };
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue(grantData);
    mockPrisma.growthIncentiveEvent.create.mockResolvedValue({ id: "event-1", eventType: "conversion" });
    mockPrisma.growthIncentiveGrant.update.mockResolvedValue({ id: "grant-1", status: "CONSUMED" });
    mockPrisma.incentiveCoupon.create.mockResolvedValue({
      id: "coupon-new", code: "KS-AABBCCDD", expiresAt: new Date("2026-06-01"),
    });
    // Override $transaction to pass through the same mock models
    (mockPrisma as any)._$transactionOverride = vi.fn(async (fn: any) => fn(mockPrisma));
    // Mock the dynamic import for messenger
    vi.doMock("../modules/ads/ia-messenger-promo.service.js", () => ({
      sendGrantConvertedToCouponMessage: vi.fn().mockResolvedValue(true),
    }));

    const result = await recordGrowthEvent("grant-1", "user-1", "conversion");
    expect(result.eventType).toBe("conversion");
    expect(mockPrisma.growthIncentiveGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "grant-1" }, data: { status: "CONSUMED" } }),
    );
    expect(mockPrisma.incentiveCoupon.create).toHaveBeenCalled();
    // Cleanup transaction override
    delete (mockPrisma as any)._$transactionOverride;
  });
});

// ══════════════════════════════════════════════
// recordGrowthEventIdempotent
// ══════════════════════════════════════════════

describe("recordGrowthEventIdempotent", () => {
  it("retourne duplicate=true si idempotency key existe", async () => {
    mockPrisma.growthIncentiveEvent.findFirst.mockResolvedValue({ id: "existing-event" });

    const result = await recordGrowthEventIdempotent("grant-1", "user-1", "click", "idem-key-123");
    expect(result.duplicate).toBe(true);
  });

  it("crée l'event si idempotency key n'existe pas", async () => {
    mockPrisma.growthIncentiveEvent.findFirst.mockResolvedValue(null);
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue({
      id: "grant-1", userId: "user-1", status: "ACTIVE", kind: "CPC", discountPercent: 20,
      expiresAt: new Date("2026-06-01"),
    });
    mockPrisma.growthIncentiveEvent.create.mockResolvedValue({ id: "new-event", eventType: "click" });

    const result = await recordGrowthEventIdempotent("grant-1", "user-1", "click", "idem-key-456");
    expect(result.duplicate).toBe(false);
    expect(result.event.eventType).toBe("click");
  });
});

// ══════════════════════════════════════════════
// runRebalance100Job
// ══════════════════════════════════════════════

describe("runRebalance100Job", () => {
  it("retourne generated=0 si aucun coupon distribué ce mois", async () => {
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy());
    mockPrisma.incentiveQuotaCounter.aggregate.mockResolvedValue({
      _sum: { couponCount: 0, coupon100Count: 0 },
    });

    const result = await runRebalance100Job();
    expect(result.generated).toBe(0);
  });

  it("retourne generated=0 si ratio 100% déjà atteint", async () => {
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy());
    mockPrisma.incentiveQuotaCounter.aggregate.mockResolvedValue({
      _sum: { couponCount: 100, coupon100Count: 20 }, // 20% > 15%
    });

    const result = await runRebalance100Job();
    expect(result.generated).toBe(0);
  });

  it("génère des coupons 100% si ratio insuffisant", async () => {
    mockPrisma.incentivePolicy.findUnique.mockResolvedValue(makePolicy());
    mockPrisma.incentiveQuotaCounter.aggregate.mockResolvedValue({
      _sum: { couponCount: 100, coupon100Count: 5 }, // 5% < 15%
    });
    mockPrisma.incentiveQuotaCounter.findMany.mockResolvedValue([
      { userId: "user-a" },
      { userId: "user-b" },
      { userId: "user-c" },
    ]);
    mockPrisma.incentiveCoupon.create.mockResolvedValue({ id: "c-1", code: "KS-AABBCCDD" });

    const result = await runRebalance100Job();
    expect(result.generated).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════
// getIncentiveStats
// ══════════════════════════════════════════════

describe("getIncentiveStats", () => {
  it("retourne les stats agrégées", async () => {
    mockPrisma.incentiveCoupon.count.mockResolvedValueOnce(50).mockResolvedValueOnce(20);
    mockPrisma.incentiveCouponRedemption.count.mockResolvedValue(15);
    mockPrisma.growthIncentiveGrant.count.mockResolvedValueOnce(100).mockResolvedValueOnce(40).mockResolvedValueOnce(10);
    mockPrisma.incentiveQuotaCounter.aggregate.mockResolvedValue({
      _sum: { couponCount: 30, coupon100Count: 5, cpcCount: 10, cpiCount: 3, cpaCount: 2, discount80Count: 4, addonGainCount: 1 },
      _count: 15,
    });

    const result = await getIncentiveStats();
    expect(result.overview.totalCoupons).toBe(50);
    expect(result.overview.activeCoupons).toBe(20);
    expect(result.overview.totalRedemptions).toBe(15);
    expect(result.monthly.couponsDistributed).toBe(30);
    expect(result.monthly.ratio100Percent).toBeCloseTo(16.67, 0);
  });
});

// ══════════════════════════════════════════════
// User self-service — Mes avantages IA (D1)
// ══════════════════════════════════════════════

describe("listMyGrants", () => {
  it("retourne les grants avec flag convertible", async () => {
    mockPrisma.growthIncentiveGrant.findMany.mockResolvedValue([
      { id: "g1", kind: "CPC", discountPercent: 30, addonCode: null, status: "ACTIVE", expiresAt: new Date("2026-06-01"), createdAt: NOW, metadata: {} },
      { id: "g2", kind: "CPC", discountPercent: 50, addonCode: null, status: "CONSUMED", expiresAt: new Date("2026-06-01"), createdAt: NOW, metadata: {} },
      { id: "g3", kind: "CPC", discountPercent: 20, addonCode: null, status: "ACTIVE", expiresAt: new Date("2025-01-01"), createdAt: NOW, metadata: {} },
    ]);
    const result = await listMyGrants("user-1");
    expect(result).toHaveLength(3);
    expect(result[0].convertible).toBe(true);
    expect(result[1].convertible).toBe(false); // CONSUMED
    expect(result[2].convertible).toBe(false); // expired
  });

  it("filtre par userId", async () => {
    mockPrisma.growthIncentiveGrant.findMany.mockResolvedValue([]);
    await listMyGrants("user-X");
    expect(mockPrisma.growthIncentiveGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-X" } }),
    );
  });
});

describe("listMyCoupons", () => {
  it("retourne les coupons avec fromGrantId extrait du metadata", async () => {
    mockPrisma.incentiveCoupon.findMany.mockResolvedValue([
      { id: "c1", code: "KS-AAA", kind: "PLAN_DISCOUNT", discountPercent: 30, status: "ACTIVE", expiresAt: new Date("2026-06-01"), usedCount: 0, maxUses: 1, maxUsesPerUser: 1, createdAt: NOW, metadata: { fromGrant: "g1" } },
      { id: "c2", code: "KS-BBB", kind: "PLAN_DISCOUNT", discountPercent: 20, status: "ACTIVE", expiresAt: new Date("2026-06-01"), usedCount: 0, maxUses: 1, maxUsesPerUser: 1, createdAt: NOW, metadata: null },
    ]);
    const result = await listMyCoupons("user-1");
    expect(result[0].fromGrantId).toBe("g1");
    expect(result[1].fromGrantId).toBeNull();
  });

  it("filtre par recipientUserId", async () => {
    mockPrisma.incentiveCoupon.findMany.mockResolvedValue([]);
    await listMyCoupons("user-Z");
    expect(mockPrisma.incentiveCoupon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientUserId: "user-Z" } }),
    );
  });
});

describe("convertGrantToCoupon", () => {
  it("rejette GRANT_NOT_FOUND", async () => {
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue(null);
    await expect(convertGrantToCoupon("user-1", "g1")).rejects.toThrow("GRANT_NOT_FOUND");
  });

  it("rejette GRANT_NOT_OWNED si userId != grant.userId", async () => {
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue({
      id: "g1", userId: "other", status: "ACTIVE", discountPercent: 30, expiresAt: new Date("2026-06-01"), kind: "CPC",
    });
    await expect(convertGrantToCoupon("user-1", "g1")).rejects.toThrow("GRANT_NOT_OWNED");
  });

  it("rejette GRANT_NOT_ACTIVE", async () => {
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue({
      id: "g1", userId: "user-1", status: "CONSUMED", discountPercent: 30, expiresAt: new Date("2026-06-01"), kind: "CPC",
    });
    await expect(convertGrantToCoupon("user-1", "g1")).rejects.toThrow("GRANT_NOT_ACTIVE");
  });

  it("rejette GRANT_EXPIRED", async () => {
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue({
      id: "g1", userId: "user-1", status: "ACTIVE", discountPercent: 30, expiresAt: new Date("2025-01-01"), kind: "CPC",
    });
    await expect(convertGrantToCoupon("user-1", "g1")).rejects.toThrow("GRANT_EXPIRED");
  });

  it("rejette GRANT_NOT_CONVERTIBLE si discountPercent null", async () => {
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue({
      id: "g1", userId: "user-1", status: "ACTIVE", discountPercent: null, expiresAt: new Date("2026-06-01"), kind: "ADDON",
    });
    await expect(convertGrantToCoupon("user-1", "g1")).rejects.toThrow("GRANT_NOT_CONVERTIBLE");
  });

  it("consomme le grant et crée un coupon", async () => {
    const grantData = {
      id: "g1", userId: "user-1", status: "ACTIVE", discountPercent: 30, kind: "CPC",
      expiresAt: new Date("2026-06-01"),
    };
    mockPrisma.growthIncentiveGrant.findUnique.mockResolvedValue(grantData);
    mockPrisma.growthIncentiveGrant.update.mockResolvedValue({ id: "g1", status: "CONSUMED" });
    mockPrisma.incentiveCoupon.create.mockResolvedValue({
      id: "c-new", code: "KS-AABBCCDD", expiresAt: new Date("2026-06-01"),
    });
    mockPrisma.growthIncentiveEvent.create.mockResolvedValue({ id: "ev-1" });
    (mockPrisma as any)._$transactionOverride = vi.fn(async (fn: any) => fn(mockPrisma));

    const result = await convertGrantToCoupon("user-1", "g1");
    expect(result.grantId).toBe("g1");
    expect(result.couponCode).toBe("KS-AABBCCDD");
    expect(result.discountPercent).toBe(30);
    expect(mockPrisma.growthIncentiveGrant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "g1" }, data: { status: "CONSUMED" } }),
    );
    expect(mockPrisma.incentiveCoupon.create).toHaveBeenCalled();

    delete (mockPrisma as any)._$transactionOverride;
  });

  it("rejette GRANT_ALREADY_CONSUMED si race (fresh status != ACTIVE)", async () => {
    const grantData = {
      id: "g1", userId: "user-1", status: "ACTIVE", discountPercent: 30, kind: "CPC",
      expiresAt: new Date("2026-06-01"),
    };
    // 1er findUnique (hors tx) → ACTIVE ; 2e findUnique (dans tx) → CONSUMED (race)
    mockPrisma.growthIncentiveGrant.findUnique
      .mockResolvedValueOnce(grantData)
      .mockResolvedValueOnce({ ...grantData, status: "CONSUMED" });
    (mockPrisma as any)._$transactionOverride = vi.fn(async (fn: any) => fn(mockPrisma));

    await expect(convertGrantToCoupon("user-1", "g1")).rejects.toThrow("GRANT_ALREADY_CONSUMED");

    delete (mockPrisma as any)._$transactionOverride;
  });
});
