/**
 * Tests — boost.service.ts (caps par plan + estimate + validations).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    subscription: { findFirst: vi.fn() },
    boostCampaign: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    wallet: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    walletTransaction: { create: vi.fn(), updateMany: vi.fn() },
    listing: { findUnique: vi.fn(), update: vi.fn() },
    soKinPost: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    businessShop: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../modules/boost/wallet.service.js", () => ({
  ensureWallet: vi.fn().mockResolvedValue({ id: "w1", balanceUsdCents: 100000 }),
  debitWallet: vi.fn().mockResolvedValue({ id: "w1", balanceUsdCents: 99000 }),
  creditWallet: vi.fn(),
}));

import { estimateBoost, createCampaign } from "../modules/boost/boost.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────
// estimateBoost
// ─────────────────────────────────────────────────────

describe("estimateBoost()", () => {
  it("scopeMultiplier: LOCAL=1, NATIONAL=2.5, CROSS_BORDER=5", () => {
    const l = estimateBoost("LOCAL", 3, 500);
    const n = estimateBoost("NATIONAL", 3, 500);
    const c = estimateBoost("CROSS_BORDER", 3, 500);
    expect(l.scopeMultiplier).toBe(1);
    expect(n.scopeMultiplier).toBe(2.5);
    expect(c.scopeMultiplier).toBe(5);
  });

  it("reach croît avec budget", () => {
    const e1 = estimateBoost("LOCAL", 3, 500);
    const e2 = estimateBoost("LOCAL", 3, 2000);
    expect(e2.reach.max).toBeGreaterThan(e1.reach.max);
  });

  it("clicks.max < reach.max (CTR < 100%)", () => {
    const e = estimateBoost("LOCAL", 7, 1000);
    expect(e.clicks.max).toBeLessThan(e.reach.max);
  });
});

// ─────────────────────────────────────────────────────
// createCampaign — caps par plan
// ─────────────────────────────────────────────────────

describe("createCampaign() — plan caps", () => {
  it("plan FREE : rejette avec HttpError 403", async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "FREE" });
    mockPrisma.listing.findUnique.mockResolvedValue({ id: "l1", ownerUserId: "u1" });

    await expect(
      createCampaign({
        userId: "u1",
        target: "LISTING",
        targetId: "l1",
        scope: "LOCAL",
        budgetUsdCents: 500,
        durationDays: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("plan BOOST : rejette si >= 3 campagnes actives (429)", async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "BOOST" });
    mockPrisma.boostCampaign.count.mockResolvedValue(3);
    mockPrisma.listing.findUnique.mockResolvedValue({ id: "l1", ownerUserId: "u1" });

    await expect(
      createCampaign({
        userId: "u1",
        target: "LISTING",
        targetId: "l1",
        scope: "LOCAL",
        budgetUsdCents: 500,
        durationDays: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it("plan BOOST : rejette si budget journalier > dailyCap 10$ (400)", async () => {
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "BOOST" });
    mockPrisma.boostCampaign.count.mockResolvedValue(0);
    mockPrisma.listing.findUnique.mockResolvedValue({ id: "l1", ownerUserId: "u1" });

    // 5000 cents sur 1 jour = 50$/jour > 10$/jour cap
    await expect(
      createCampaign({
        userId: "u1",
        target: "LISTING",
        targetId: "l1",
        scope: "LOCAL",
        budgetUsdCents: 5000,
        durationDays: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("SUPER_ADMIN bypass les caps", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({ id: "l1", ownerUserId: "u1" });
    mockPrisma.boostCampaign.findFirst.mockResolvedValue(null);
    mockPrisma.boostCampaign.create.mockResolvedValue({ id: "camp1" });
    mockPrisma.boostCampaign.findUnique.mockResolvedValue({
      id: "camp1", target: "LISTING", targetId: "l1", expiresAt: new Date(Date.now() + 86400000),
    });
    mockPrisma.walletTransaction.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.listing.update.mockResolvedValue({});

    await expect(
      createCampaign({
        userId: "u1",
        userRole: "SUPER_ADMIN",
        target: "LISTING",
        targetId: "l1",
        scope: "LOCAL",
        budgetUsdCents: 5000,
        durationDays: 1,
      }),
    ).resolves.toBeDefined();
    // subscription.findFirst NE doit PAS avoir été appelé pour les caps
    expect(mockPrisma.subscription.findFirst).not.toHaveBeenCalled();
  });

  it("rejette budget < 100 cents (400)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({ id: "l1", ownerUserId: "u1" });
    await expect(
      createCampaign({
        userId: "u1",
        userRole: "SUPER_ADMIN",
        target: "LISTING",
        targetId: "l1",
        scope: "LOCAL",
        budgetUsdCents: 50,
        durationDays: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("CROSS_BORDER sans pays cible rejeté (400)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({ id: "l1", ownerUserId: "u1" });
    await expect(
      createCampaign({
        userId: "u1",
        userRole: "SUPER_ADMIN",
        target: "LISTING",
        targetId: "l1",
        scope: "CROSS_BORDER",
        budgetUsdCents: 500,
        durationDays: 3,
        targetCountries: [],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("unicité : rejette si campagne ACTIVE existe déjà (409)", async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({ id: "l1", ownerUserId: "u1" });
    mockPrisma.boostCampaign.findFirst.mockResolvedValue({ id: "existing" });

    await expect(
      createCampaign({
        userId: "u1",
        userRole: "SUPER_ADMIN",
        target: "LISTING",
        targetId: "l1",
        scope: "LOCAL",
        budgetUsdCents: 500,
        durationDays: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
