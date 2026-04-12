/**
 * Tests — billing.catalog.ts & billing.service.ts
 *
 * Vérifie le catalogue de plans, la résolution de plans,
 * les flux d'abonnement et la gestion des add-ons.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma, mockLogger } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    subscriptionAddon: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    businessAccount: { findUnique: vi.fn(), update: vi.fn() },
    paymentOrder: { findMany: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({ logger: mockLogger }));
vi.mock("../shared/billing/subscription-guard.js", () => ({
  clearSubscriptionCache: vi.fn(),
}));
vi.mock("../shared/payment/paypal.provider.js", () => ({
  createOrder: vi.fn(),
  captureOrder: vi.fn(),
}));
vi.mock("../config/env.js", () => ({
  env: {
    BILLING_TRANSFER_ORDER_TTL_HOURS: 48,
    BILLING_TRANSFER_BENEFICIARY_IBAN: "TEST-IBAN",
    BILLING_TRANSFER_BENEFICIARY_BIC: "TEST-BIC",
    BILLING_TRANSFER_BENEFICIARY_RIB: "TEST-RIB",
  },
}));

// ── Import after mocks ─────────────────────────────────────

import { getPlanOrThrow, PLAN_CATALOG, ADDON_CATALOG } from "../modules/billing/billing.catalog.js";
import * as billingService from "../modules/billing/billing.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// PLAN CATALOG
// ════════════════════════════════════════════════════════════

describe("billing.catalog", () => {
  it("contient les plans USER obligatoires", () => {
    const userPlans = PLAN_CATALOG.filter((p) => p.scope === "USER");
    const codes = userPlans.map((p) => p.code);

    expect(codes).toContain("FREE");
    expect(codes).toContain("BOOST");
    expect(codes).toContain("AUTO");
    expect(codes).toContain("PRO_VENDOR");
  });

  it("contient les plans BUSINESS obligatoires", () => {
    const bizPlans = PLAN_CATALOG.filter((p) => p.scope === "BUSINESS");
    const codes = bizPlans.map((p) => p.code);

    expect(codes).toContain("STARTER");
    expect(codes).toContain("BUSINESS");
    expect(codes).toContain("SCALE");
  });

  it("plan FREE USER est à 0 centimes et inclut IA_MERCHANT", () => {
    const free = PLAN_CATALOG.find((p) => p.code === "FREE" && p.scope === "USER")!;
    expect(free.monthlyPriceUsdCents).toBe(0);
    expect(free.features).toContain("IA_MERCHANT");
  });

  it("plan AUTO inclut IA_ORDER et AUTO_REPLY", () => {
    const auto = PLAN_CATALOG.find((p) => p.code === "AUTO" && p.scope === "USER")!;
    expect(auto.features).toContain("IA_ORDER");
    expect(auto.features).toContain("AUTO_REPLY");
  });

  it("les prix sont cohérents (FREE < BOOST < AUTO < PRO_VENDOR)", () => {
    const free = PLAN_CATALOG.find((p) => p.code === "FREE" && p.scope === "USER")!;
    const boost = PLAN_CATALOG.find((p) => p.code === "BOOST" && p.scope === "USER")!;
    const auto = PLAN_CATALOG.find((p) => p.code === "AUTO" && p.scope === "USER")!;
    const pro = PLAN_CATALOG.find((p) => p.code === "PRO_VENDOR" && p.scope === "USER")!;

    expect(free.monthlyPriceUsdCents).toBeLessThan(boost.monthlyPriceUsdCents);
    expect(boost.monthlyPriceUsdCents).toBeLessThan(auto.monthlyPriceUsdCents);
    expect(auto.monthlyPriceUsdCents).toBeLessThan(pro.monthlyPriceUsdCents);
  });

  it("getPlanOrThrow retourne le bon plan", () => {
    const plan = getPlanOrThrow("BOOST", "USER");
    expect(plan.code).toBe("BOOST");
    expect(plan.scope).toBe("USER");
  });

  it("getPlanOrThrow throw pour un plan inexistant", () => {
    expect(() => getPlanOrThrow("NONEXISTENT", "USER")).toThrow("Plan invalide");
  });

  it("getPlanOrThrow throw pour un scope incorrect", () => {
    expect(() => getPlanOrThrow("STARTER", "USER")).toThrow("Plan invalide");
  });

  it("le catalogue d'add-ons contient les add-ons obligatoires", () => {
    const codes = ADDON_CATALOG.map((a) => a.code);
    expect(codes).toContain("IA_MERCHANT");
    expect(codes).toContain("IA_ORDER");
    expect(codes).toContain("BOOST_VISIBILITY");
  });
});

// ════════════════════════════════════════════════════════════
// getCatalog
// ════════════════════════════════════════════════════════════

describe("billingService.getCatalog()", () => {
  it("retourne les plans séparés par scope + addOns", () => {
    const catalog = billingService.getCatalog();

    expect(catalog.userPlans.length).toBeGreaterThanOrEqual(4);
    expect(catalog.businessPlans.length).toBeGreaterThanOrEqual(3);
    expect(catalog.addOns.length).toBeGreaterThanOrEqual(3);
    expect(catalog.userPlans.every((p: any) => p.scope === "USER")).toBe(true);
    expect(catalog.businessPlans.every((p: any) => p.scope === "BUSINESS")).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// getMyPlan
// ════════════════════════════════════════════════════════════

describe("billingService.getMyPlan()", () => {
  it("retourne plan FREE par défaut pour un user sans abonnement", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1", role: "USER", businesses: [],
    });
    mockPrisma.subscription.findFirst.mockResolvedValue(null);

    const plan = await billingService.getMyPlan("u1");

    expect(plan.planCode).toBe("FREE");
    expect(plan.scope).toBe("USER");
    expect(plan.priceUsdCents).toBe(0);
    expect(plan.features).toContain("IA_MERCHANT");
  });

  it("retourne le plan actif d'un user avec abonnement", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u2", role: "USER", businesses: [],
    });
    mockPrisma.subscription.findFirst.mockResolvedValue({
      id: "sub-1",
      planCode: "AUTO",
      status: "ACTIVE",
      billingCycle: "MONTHLY",
      startsAt: new Date(),
      endsAt: null,
      priceUsdCents: 1200,
      addons: [],
    });

    const plan = await billingService.getMyPlan("u2");

    expect(plan.planCode).toBe("AUTO");
    expect(plan.features).toContain("IA_ORDER");
    expect(plan.features).toContain("IA_MERCHANT"); // merged from FREE
  });

  it("throw 404 pour un utilisateur inexistant", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(billingService.getMyPlan("unknown")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throw 400 pour un BUSINESS sans businessAccount", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u3", role: "BUSINESS", businesses: [],
    });

    await expect(billingService.getMyPlan("u3")).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

// ════════════════════════════════════════════════════════════
// listMyPaymentOrders
// ════════════════════════════════════════════════════════════

describe("billingService.listMyPaymentOrders()", () => {
  it("retourne les commandes de paiement de l'utilisateur", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u4", role: "USER", businesses: [],
    });
    mockPrisma.paymentOrder.findMany.mockResolvedValue([
      {
        id: "po-1",
        planCode: "BOOST",
        amountUsdCents: 600,
        currency: "USD",
        status: "PENDING",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        transferReference: "KS-REF-1",
        depositorNote: null,
        proofUrl: null,
      },
    ]);

    const result = await billingService.listMyPaymentOrders("u4");
    expect(Array.isArray(result.orders)).toBe(true);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].planCode).toBe("BOOST");
  });
});
