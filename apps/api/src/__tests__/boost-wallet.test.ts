/**
 * Tests — boost wallet service (wallet.service.ts)
 *
 * Couvre : debit atomique, credit, refund, insufficient funds (402).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    wallet: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    walletTransaction: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  debitWallet,
  creditWallet,
  ensureWallet,
  getWalletSnapshot,
} from "../modules/boost/wallet.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────
// ensureWallet
// ─────────────────────────────────────────────────────

describe("ensureWallet()", () => {
  it("retourne le wallet existant", async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 500,
      totalCreditCents: 500, totalDebitCents: 0, currency: "USD",
    });
    const r = await ensureWallet("u1");
    expect(r.balanceUsdCents).toBe(500);
    expect(mockPrisma.wallet.create).not.toHaveBeenCalled();
  });

  it("crée un wallet si absent", async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue(null);
    mockPrisma.wallet.create.mockResolvedValue({
      id: "w2", userId: "u2", balanceUsdCents: 0,
      totalCreditCents: 0, totalDebitCents: 0, currency: "USD",
    });
    const r = await ensureWallet("u2");
    expect(r.balanceUsdCents).toBe(0);
    expect(mockPrisma.wallet.create).toHaveBeenCalledWith({ data: { userId: "u2" } });
  });
});

// ─────────────────────────────────────────────────────
// debitWallet
// ─────────────────────────────────────────────────────

describe("debitWallet()", () => {
  it("débite avec succès si solde suffisant", async () => {
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 1000,
    });
    mockPrisma.wallet.update.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 700,
      totalCreditCents: 1000, totalDebitCents: 300, currency: "USD",
    });
    mockPrisma.walletTransaction.create.mockResolvedValue({ id: "tx1" });

    const r = await debitWallet({ userId: "u1", amountUsdCents: 300, campaignId: "c1" });
    expect(r.balanceUsdCents).toBe(700);
    expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "DEBIT",
          amountUsdCents: -300,
          balanceAfter: 700,
          campaignId: "c1",
        }),
      }),
    );
  });

  it("lance HttpError 402 si solde insuffisant", async () => {
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 100,
    });

    await expect(debitWallet({ userId: "u1", amountUsdCents: 500 })).rejects.toMatchObject({
      statusCode: 402,
    });
    expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
  });

  it("rejette montant <= 0", async () => {
    await expect(debitWallet({ userId: "u1", amountUsdCents: 0 })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(debitWallet({ userId: "u1", amountUsdCents: -50 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("utilise $transaction pour atomicité", async () => {
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 1000,
    });
    mockPrisma.wallet.update.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 900,
      totalCreditCents: 1000, totalDebitCents: 100, currency: "USD",
    });
    await debitWallet({ userId: "u1", amountUsdCents: 100 });
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────
// creditWallet
// ─────────────────────────────────────────────────────

describe("creditWallet()", () => {
  it("crédite et crée une WalletTransaction type=CREDIT", async () => {
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 200,
    });
    mockPrisma.wallet.update.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 700,
      totalCreditCents: 700, totalDebitCents: 0, currency: "USD",
    });
    mockPrisma.walletTransaction.create.mockResolvedValue({ id: "tx2" });

    const r = await creditWallet({
      userId: "u1",
      amountUsdCents: 500,
      description: "Test credit",
    });
    expect(r.balanceUsdCents).toBe(700);
    expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "CREDIT",
          amountUsdCents: 500,
          balanceAfter: 700,
        }),
      }),
    );
  });

  it("accepte type=REFUND", async () => {
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 100,
    });
    mockPrisma.wallet.update.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 350,
      totalCreditCents: 350, totalDebitCents: 0, currency: "USD",
    });
    await creditWallet({
      userId: "u1",
      amountUsdCents: 250,
      type: "REFUND",
      campaignId: "c99",
    });
    expect(mockPrisma.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "REFUND", campaignId: "c99" }),
      }),
    );
  });

  it("rejette montant <= 0", async () => {
    await expect(creditWallet({ userId: "u1", amountUsdCents: 0 })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

// ─────────────────────────────────────────────────────
// getWalletSnapshot
// ─────────────────────────────────────────────────────

describe("getWalletSnapshot()", () => {
  it("retourne un snapshot avec toutes les infos", async () => {
    mockPrisma.wallet.findUnique.mockResolvedValue({
      id: "w1", userId: "u1", balanceUsdCents: 1234,
      totalCreditCents: 2000, totalDebitCents: 766, currency: "USD",
    });
    const s = await getWalletSnapshot("u1");
    expect(s).toEqual({
      id: "w1",
      userId: "u1",
      balanceUsdCents: 1234,
      totalCreditCents: 2000,
      totalDebitCents: 766,
      currency: "USD",
    });
  });
});
