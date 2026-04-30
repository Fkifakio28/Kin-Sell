/**
 * Tests — mobile-money.service.ts
 *
 * Initiation de paiement, validations, providers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma, mockOrange, mockMpesa } = vi.hoisted(() => ({
  mockPrisma: {
    mobileMoneyPayment: {
      create: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
    },
  } as any,
  mockOrange: {
    initiatePayment: vi.fn(),
    checkPaymentStatus: vi.fn(),
  },
  mockMpesa: {
    initiateC2BPayment: vi.fn(),
    checkTransactionStatus: vi.fn(),
  },
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/payment/orange-money.provider.js", () => mockOrange);
vi.mock("../shared/payment/mpesa.provider.js", () => mockMpesa);

// ── Import after mocks ─────────────────────────────────────

import { initiatePayment, checkStatus } from "../modules/mobile-money/mobile-money.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// initiatePayment
// ════════════════════════════════════════════════════════════

describe("initiatePayment()", () => {
  it("rejette un montant <= 0 (400)", async () => {
    await expect(
      initiatePayment("u1", {
        provider: "ORANGE_MONEY",
        phoneNumber: "+243812345678",
        amountCDF: 0,
        purpose: "ORDER",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("initie un paiement Orange Money", async () => {
    mockPrisma.mobileMoneyPayment.create.mockResolvedValue({
      id: "momo-1",
      status: "INITIATED",
    });
    mockOrange.initiatePayment.mockResolvedValue({
      payToken: "tok-123",
      paymentUrl: "https://orange.cd/pay/tok-123",
    });
    mockPrisma.mobileMoneyPayment.update.mockResolvedValue({});

    const result = await initiatePayment("u1", {
      provider: "ORANGE_MONEY",
      phoneNumber: "+243812345678",
      amountCDF: 5000,
      purpose: "ORDER",
    });

    expect(result.provider).toBe("ORANGE_MONEY");
    expect(result.status).toBe("PENDING");
    expect(result.payToken).toBe("tok-123");
    expect(result.redirectUrl).toContain("tok-123");
  });

  it("initie un paiement M-Pesa", async () => {
    mockPrisma.mobileMoneyPayment.create.mockResolvedValue({ id: "momo-2", status: "INITIATED" });
    mockMpesa.initiateC2BPayment.mockResolvedValue({
      conversationID: "conv-1",
      transactionID: "tx-1",
      thirdPartyConversationID: "3p-conv-1",
    });
    mockPrisma.mobileMoneyPayment.update.mockResolvedValue({});

    const result = await initiatePayment("u1", {
      provider: "MPESA",
      phoneNumber: "+243812345678",
      amountCDF: 3000,
      purpose: "ORDER",
    });

    expect(result.provider).toBe("MPESA");
    expect(result.status).toBe("PENDING");
    expect(result.transactionID).toBe("tx-1");
  });

  it("enregistre FAILED si le provider échoue", async () => {
    mockPrisma.mobileMoneyPayment.create.mockResolvedValue({ id: "momo-3" });
    mockOrange.initiatePayment.mockRejectedValue(new Error("Provider down"));
    mockPrisma.mobileMoneyPayment.update.mockResolvedValue({});

    await expect(
      initiatePayment("u1", {
        provider: "ORANGE_MONEY",
        phoneNumber: "+243812345678",
        amountCDF: 1000,
        purpose: "ORDER",
      }),
    ).rejects.toThrow("Provider down");

    expect(mockPrisma.mobileMoneyPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });
});

// ════════════════════════════════════════════════════════════
// checkStatus
// ════════════════════════════════════════════════════════════

describe("checkStatus()", () => {
  it("rejette un paiement inexistant (404)", async () => {
    mockPrisma.mobileMoneyPayment.findUnique.mockResolvedValue(null);
    await expect(checkStatus("u1", "nonexistent")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejette un accès non autorisé (403)", async () => {
    mockPrisma.mobileMoneyPayment.findUnique.mockResolvedValue({
      id: "momo-1", userId: "u2", status: "PENDING", provider: "ORANGE_MONEY",
    });
    await expect(checkStatus("u1", "momo-1")).rejects.toMatchObject({ statusCode: 403 });
  });
});
