/**
 * Tests — verification.service.ts
 *
 * Demandes de vérification, validation, statut.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    verificationRequest: {
      findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(),
      create: vi.fn(), update: vi.fn(), count: vi.fn(),
    },
    verificationHistory: { create: vi.fn() },
    userProfile: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    businessAccount: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    order: { count: vi.fn() },
    userReview: { aggregate: vi.fn(), count: vi.fn() },
    negotiation: { aggregate: vi.fn() },
    report: { count: vi.fn() },
    fraudSignal: { count: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Import after mocks ─────────────────────────────────────

import * as verificationService from "../modules/verification/verification.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// requestVerification
// ════════════════════════════════════════════════════════════

describe("requestVerification()", () => {
  it("crée une demande USER", async () => {
    mockPrisma.verificationRequest.findFirst.mockResolvedValue(null);
    mockPrisma.verificationRequest.create.mockResolvedValue({
      id: "vr-1", userId: "u1", accountType: "USER", status: "PENDING",
    });
    mockPrisma.verificationHistory.create.mockResolvedValue({});

    const result = await verificationService.requestVerification("u1", "USER");
    expect(result.status).toBe("PENDING");
    expect(result.accountType).toBe("USER");
  });

  it("rejette si une demande active existe déjà", async () => {
    mockPrisma.verificationRequest.findFirst.mockResolvedValue({
      id: "existing", status: "PENDING",
    });

    await expect(
      verificationService.requestVerification("u1", "USER"),
    ).rejects.toThrow();
  });
});

// ════════════════════════════════════════════════════════════
// getMyVerificationStatus
// ════════════════════════════════════════════════════════════

describe("getMyVerificationStatus()", () => {
  it("retourne le statut de vérification", async () => {
    mockPrisma.userProfile.findUnique.mockResolvedValue({
      verificationStatus: "UNVERIFIED",
    });
    mockPrisma.businessAccount.findMany.mockResolvedValue([]);
    mockPrisma.verificationRequest.findFirst.mockResolvedValue(null);

    const result = await verificationService.getMyVerificationStatus("u1");
    expect(result.userStatus).toBe("UNVERIFIED");
  });
});

// ════════════════════════════════════════════════════════════
// admin actions
// ════════════════════════════════════════════════════════════

describe("adminApproveVerification()", () => {
  it("approuve une demande PENDING", async () => {
    mockPrisma.verificationRequest.findUnique.mockResolvedValue({
      id: "vr-1", userId: "u1", status: "PENDING",
      businessId: null, adminLocked: false,
    });
    mockPrisma.verificationRequest.update.mockResolvedValue({
      id: "vr-1", status: "VERIFIED",
    });
    mockPrisma.verificationHistory.create.mockResolvedValue({});
    mockPrisma.userProfile.updateMany.mockResolvedValue({ count: 1 });

    const result = await verificationService.adminApproveVerification("vr-1", "admin-1");
    expect(result.status).toBe("VERIFIED");
  });
});
