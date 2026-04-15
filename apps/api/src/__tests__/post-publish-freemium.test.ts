/**
 * Tests — post-publish-freemium.service.ts
 *
 * 5 scénarios :
 *   1. 1er produit free → 1 conseil visible
 *   2. 2e produit free → 0 visible (LOCKED)
 *   3. 1er service free → 1 conseil visible
 *   4. Compte full-access → tout visible
 *   5. Idempotence de consumeFreeCredit
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn() },
    aiFreemiumUsage: { findMany: vi.fn(), upsert: vi.fn() },
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../modules/billing/billing.catalog.js", () => ({
  PLAN_CATALOG: {},
}));

// ── Import after mocks ─────────────────────────────────────

import {
  resolveFreemiumState,
  consumeFreeCredit,
  applyFreemiumGating,
} from "../modules/ads/post-publish-freemium.service.js";
import type { PostPublishReport } from "../modules/ads/post-publish-advisor.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers ─────────────────────────────────────────────────

function fakeUser(role = "USER") {
  return { role, businesses: role === "BUSINESS" ? [{ id: "biz-1" }] : [] };
}

function fakeReport(adviceCount = 3): PostPublishReport {
  return {
    overallScore: 72,
    advice: Array.from({ length: adviceCount }, (_, i) => ({
      id: `adv-${i}`,
      title: `Conseil ${i + 1}`,
      message: `Description complète du conseil numéro ${i + 1} pour améliorer votre annonce`,
      priority: adviceCount - i,
      category: "pricing" as const,
      rationale: "Raison détaillée",
      emoji: "💡",
    })),
  } as PostPublishReport;
}

const singleCtx = { type: "SINGLE" as const, totalPublished: 1, label: "" };

// ════════════════════════════════════════════════════════════
// resolveFreemiumState
// ════════════════════════════════════════════════════════════

describe("resolveFreemiumState()", () => {
  it("1er produit publié → mode PREVIEW (1 conseil visible)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fakeUser());
    mockPrisma.subscription.findFirst.mockResolvedValue(null); // FREE plan
    mockPrisma.aiFreemiumUsage.findMany.mockResolvedValue([]); // aucun usage

    const state = await resolveFreemiumState("user-1", singleCtx, "PRODUCT");

    expect(state.mode).toBe("PREVIEW");
    expect(state.usedProductFree).toBe(false);
    expect(state.planCode).toBe("FREE");

    // Appliquer le gating
    const report = fakeReport(3);
    const gated = applyFreemiumGating(report, state.mode, state.usedProductFree, state.usedServiceFree, "PRODUCT", state.planCode);

    expect(gated.freemium.mode).toBe("PREVIEW");
    expect(gated.freemium.visibleAdviceCount).toBe(1);
    expect(gated.freemium.blurredAdviceCount).toBe(2);
    expect(gated.advice.filter((a) => !a.isLocked)).toHaveLength(1);
    expect(gated.advice.filter((a) => a.isLocked)).toHaveLength(2);
  });

  it("2e produit publié → mode LOCKED (0 visible)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fakeUser());
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.aiFreemiumUsage.findMany.mockResolvedValue([
      { listingType: "PRODUCT" }, // déjà consommé
    ]);

    const state = await resolveFreemiumState("user-1", singleCtx, "PRODUCT");

    expect(state.mode).toBe("LOCKED");
    expect(state.usedProductFree).toBe(true);

    const report = fakeReport(3);
    const gated = applyFreemiumGating(report, state.mode, state.usedProductFree, state.usedServiceFree, "PRODUCT", state.planCode);

    expect(gated.freemium.mode).toBe("LOCKED");
    expect(gated.freemium.visibleAdviceCount).toBe(0);
    expect(gated.freemium.blurredAdviceCount).toBe(3);
    expect(gated.advice.every((a) => a.isLocked)).toBe(true);
  });

  it("1er service publié → mode PREVIEW (1 conseil visible)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fakeUser());
    mockPrisma.subscription.findFirst.mockResolvedValue(null);
    mockPrisma.aiFreemiumUsage.findMany.mockResolvedValue([
      { listingType: "PRODUCT" }, // produit déjà utilisé, service non
    ]);

    const state = await resolveFreemiumState("user-1", singleCtx, "SERVICE");

    expect(state.mode).toBe("PREVIEW");
    expect(state.usedProductFree).toBe(true);
    expect(state.usedServiceFree).toBe(false);

    const report = fakeReport(4);
    const gated = applyFreemiumGating(report, state.mode, state.usedProductFree, state.usedServiceFree, "SERVICE", state.planCode);

    expect(gated.freemium.visibleAdviceCount).toBe(1);
    expect(gated.advice.filter((a) => !a.isLocked)).toHaveLength(1);
  });

  it("compte AUTO (full-access) → mode FULL, tout visible", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fakeUser());
    mockPrisma.subscription.findFirst.mockResolvedValue({ planCode: "AUTO" });
    mockPrisma.aiFreemiumUsage.findMany.mockResolvedValue([]);

    const state = await resolveFreemiumState("user-1", singleCtx, "PRODUCT");

    expect(state.mode).toBe("FULL");
    expect(state.planCode).toBe("AUTO");

    const report = fakeReport(5);
    const gated = applyFreemiumGating(report, state.mode, state.usedProductFree, state.usedServiceFree, "PRODUCT", state.planCode);

    expect(gated.freemium.mode).toBe("FULL");
    expect(gated.freemium.visibleAdviceCount).toBe(5);
    expect(gated.freemium.blurredAdviceCount).toBe(0);
    expect(gated.advice.every((a) => !a.isLocked)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// consumeFreeCredit
// ════════════════════════════════════════════════════════════

describe("consumeFreeCredit()", () => {
  it("upsert idempotent — 2 appels successifs ne créent qu'un seul enregistrement", async () => {
    mockPrisma.aiFreemiumUsage.upsert.mockResolvedValue({});

    await consumeFreeCredit("user-1", "PRODUCT", "listing-1");
    await consumeFreeCredit("user-1", "PRODUCT", "listing-2");

    expect(mockPrisma.aiFreemiumUsage.upsert).toHaveBeenCalledTimes(2);

    // Les deux appels utilisent le même unique key
    const calls = mockPrisma.aiFreemiumUsage.upsert.mock.calls;
    expect(calls[0][0].where.userId_feature_listingType).toEqual({
      userId: "user-1",
      feature: "POST_PUBLISH_ADVISOR",
      listingType: "PRODUCT",
    });
    expect(calls[1][0].where.userId_feature_listingType).toEqual({
      userId: "user-1",
      feature: "POST_PUBLISH_ADVISOR",
      listingType: "PRODUCT",
    });

    // update vide = no-op si déjà existant
    expect(calls[0][0].update).toEqual({});
    expect(calls[1][0].update).toEqual({});
  });
});
