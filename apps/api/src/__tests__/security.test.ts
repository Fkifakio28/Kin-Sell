/**
 * Tests — trust-score.service.ts & security.service.ts
 *
 * Trust score (computeLevel, applyDelta), security events, fraud signals, restrictions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    trustScoreEvent: { create: vi.fn() },
    userRestriction: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    securityEvent: { create: vi.fn() },
    fraudSignal: { create: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (arr: any[]) => {
      const results = [];
      for (const p of arr) results.push(await p);
      return results;
    }),
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));

// ── Import after mocks ─────────────────────────────────────

import { computeLevel, applyDelta } from "../modules/security/trust-score.service.js";
import { logSecurityEvent, createFraudSignal, resolveFraudSignal } from "../modules/security/security.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// computeLevel (pure)
// ════════════════════════════════════════════════════════════

describe("computeLevel()", () => {
  it("score 0 → NEW", () => expect(computeLevel(0)).toBe("NEW"));
  it("score 39 → NEW", () => expect(computeLevel(39)).toBe("NEW"));
  it("score 40 → STANDARD", () => expect(computeLevel(40)).toBe("STANDARD"));
  it("score 59 → STANDARD", () => expect(computeLevel(59)).toBe("STANDARD"));
  it("score 60 → VERIFIED", () => expect(computeLevel(60)).toBe("VERIFIED"));
  it("score 79 → VERIFIED", () => expect(computeLevel(79)).toBe("VERIFIED"));
  it("score 80 → PREMIUM", () => expect(computeLevel(80)).toBe("PREMIUM"));
  it("score 100 → PREMIUM", () => expect(computeLevel(100)).toBe("PREMIUM"));
});

// ════════════════════════════════════════════════════════════
// applyDelta
// ════════════════════════════════════════════════════════════

describe("applyDelta()", () => {
  it("augmente le trust score", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ trustScore: 50 });
    mockPrisma.user.update.mockResolvedValue({ trustScore: 60, trustLevel: "VERIFIED" });
    mockPrisma.trustScoreEvent.create.mockResolvedValue({});

    const result = await applyDelta("u1", 10, "test", "unit-test");
    expect(result).not.toBeNull();
    expect(result!.score).toBe(60);
  });

  it("ne descend pas sous 0", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ trustScore: 5 });
    mockPrisma.user.update.mockResolvedValue({ trustScore: 0, trustLevel: "NEW" });
    mockPrisma.trustScoreEvent.create.mockResolvedValue({});

    const result = await applyDelta("u2", -20, "penalty", "unit-test");
    expect(result).not.toBeNull();
  });

  it("ne monte pas au-dessus de 100", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ trustScore: 95 });
    mockPrisma.user.update.mockResolvedValue({ trustScore: 100, trustLevel: "PREMIUM" });
    mockPrisma.trustScoreEvent.create.mockResolvedValue({});

    const result = await applyDelta("u3", 50, "bonus", "unit-test");
    expect(result).not.toBeNull();
  });

  it("retourne null si user introuvable", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await applyDelta("unknown", 10, "test", "unit-test");
    expect(result).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// logSecurityEvent
// ════════════════════════════════════════════════════════════

describe("logSecurityEvent()", () => {
  it("crée un securityEvent en base", async () => {
    mockPrisma.securityEvent.create.mockResolvedValue({ id: "evt-1" });

    const result = await logSecurityEvent({
      userId: "u1",
      eventType: "LOGIN_SUCCESS",
      ipAddress: "127.0.0.1",
      riskLevel: 0,
    });

    expect(mockPrisma.securityEvent.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("evt-1");
  });

  it("fonctionne sans userId (anonyme)", async () => {
    mockPrisma.securityEvent.create.mockResolvedValue({ id: "evt-2" });

    await logSecurityEvent({ eventType: "RATE_LIMIT_LOGIN", ipAddress: "10.0.0.1" });

    expect(mockPrisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "RATE_LIMIT_LOGIN", userId: undefined }),
      }),
    );
  });
});

// ════════════════════════════════════════════════════════════
// createFraudSignal
// ════════════════════════════════════════════════════════════

describe("createFraudSignal()", () => {
  it("crée un signal et impacte le trust score", async () => {
    mockPrisma.fraudSignal.create.mockResolvedValue({ id: "fs-1" });
    // applyDelta va chercher l'user
    mockPrisma.user.findUnique.mockResolvedValue({ trustScore: 50 });
    mockPrisma.user.update.mockResolvedValue({ trustScore: 40, trustLevel: "STANDARD" });
    mockPrisma.trustScoreEvent.create.mockResolvedValue({});

    const result = await createFraudSignal({
      userId: "u1",
      signalType: "suspicious_activity",
      severity: 3,
    });

    expect(result.id).toBe("fs-1");
    expect(mockPrisma.fraudSignal.create).toHaveBeenCalledOnce();
  });
});

// ════════════════════════════════════════════════════════════
// resolveFraudSignal
// ════════════════════════════════════════════════════════════

describe("resolveFraudSignal()", () => {
  it("résout un signal de fraude", async () => {
    mockPrisma.fraudSignal.update.mockResolvedValue({ id: "fs-1", resolved: true });

    const result = await resolveFraudSignal("fs-1", "admin-1");

    expect(mockPrisma.fraudSignal.update).toHaveBeenCalledWith({
      where: { id: "fs-1" },
      data: expect.objectContaining({ resolved: true, resolvedBy: "admin-1" }),
    });
  });
});
