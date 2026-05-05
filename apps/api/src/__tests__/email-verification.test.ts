/**
 * Tests — account.service.ts → requestEmailVerification & confirmEmailVerification
 *
 * Couvre les garde-fous SMTP + invalidation des anciens codes + succès/échec.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const sha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma, mockMailer } = vi.hoisted(() => ({
  mockPrisma: {
    verificationCode: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    user: { update: vi.fn(), findUnique: vi.fn() },
    userIdentity: { upsert: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
  mockMailer: {
    isMailConfigured: vi.fn(),
    sendOtpEmail: vi.fn(),
  },
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/email/mailer.js", () => ({
  isMailConfigured: mockMailer.isMailConfigured,
  sendOtpEmail: mockMailer.sendOtpEmail,
}));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Import after mocks ─────────────────────────────────────

import * as accountService from "../modules/account/account.service.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.verificationCode.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.verificationCode.delete.mockResolvedValue({});
});

// ════════════════════════════════════════════════════════════
// requestEmailVerification — garde-fous
// ════════════════════════════════════════════════════════════

describe("requestEmailVerification()", () => {
  it("renvoie 503 si SMTP n'est pas configuré", async () => {
    mockMailer.isMailConfigured.mockReturnValue(false);

    await expect(
      accountService.requestEmailVerification("user-1", "test@kin-sell.com"),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(mockPrisma.verificationCode.create).not.toHaveBeenCalled();
    expect(mockMailer.sendOtpEmail).not.toHaveBeenCalled();
  });

  it("renvoie 503 et supprime le code si l'envoi email échoue", async () => {
    mockMailer.isMailConfigured.mockReturnValue(true);
    mockMailer.sendOtpEmail.mockResolvedValue(false);
    mockPrisma.verificationCode.create.mockResolvedValue({
      id: "vc-1",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      accountService.requestEmailVerification("user-1", "test@kin-sell.com"),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(mockPrisma.verificationCode.delete).toHaveBeenCalledWith({
      where: { id: "vc-1" },
    });
  });

  it("réussit, invalide les anciens codes et retourne verificationId", async () => {
    mockMailer.isMailConfigured.mockReturnValue(true);
    mockMailer.sendOtpEmail.mockResolvedValue(true);
    mockPrisma.verificationCode.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.verificationCode.create.mockResolvedValue({
      id: "vc-2",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await accountService.requestEmailVerification(
      "user-1",
      "Test@Kin-Sell.com",
    );

    expect(mockPrisma.verificationCode.updateMany).toHaveBeenCalledTimes(1);
    const updateArgs = mockPrisma.verificationCode.updateMany.mock.calls[0][0];
    expect(updateArgs.where).toMatchObject({
      userId: "user-1",
      provider: "EMAIL",
      purpose: "VERIFY_EMAIL",
      consumedAt: null,
    });
    expect(updateArgs.data.consumedAt).toBeInstanceOf(Date);

    expect(mockPrisma.verificationCode.create).toHaveBeenCalledTimes(1);
    expect(mockMailer.sendOtpEmail).toHaveBeenCalledTimes(1);
    expect(result.verificationId).toBe("vc-2");
  });
});

// ════════════════════════════════════════════════════════════
// confirmEmailVerification — comportements clés
// ════════════════════════════════════════════════════════════

describe("confirmEmailVerification()", () => {
  it("incrémente attempts si le code est incorrect", async () => {
    mockPrisma.verificationCode.findUnique.mockResolvedValue({
      id: "vc-1",
      userId: "user-1",
      provider: "EMAIL",
      purpose: "VERIFY_EMAIL",
      destination: "test@kin-sell.com",
      codeHash: "hash-different",
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    await expect(
      accountService.confirmEmailVerification("user-1", "vc-1", "999999"),
    ).rejects.toMatchObject({ statusCode: 401 });

    expect(mockPrisma.verificationCode.update).toHaveBeenCalledWith({
      where: { id: "vc-1" },
      data: { attempts: { increment: 1 } },
    });
  });

  it("rejette si la verification appartient à un autre user", async () => {
    mockPrisma.verificationCode.findUnique.mockResolvedValue({
      id: "vc-1",
      userId: "other-user",
      provider: "EMAIL",
      purpose: "VERIFY_EMAIL",
      destination: "test@kin-sell.com",
      codeHash: "x",
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    await expect(
      accountService.confirmEmailVerification("user-1", "vc-1", "123456"),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejette si trop de tentatives", async () => {
    mockPrisma.verificationCode.findUnique.mockResolvedValue({
      id: "vc-1",
      userId: "user-1",
      provider: "EMAIL",
      purpose: "VERIFY_EMAIL",
      destination: "test@kin-sell.com",
      codeHash: "x",
      attempts: 5,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });

    await expect(
      accountService.confirmEmailVerification("user-1", "vc-1", "123456"),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it("vérifie l'email avec le code correct (success path)", async () => {
    const code = "424242";
    mockPrisma.verificationCode.findUnique.mockResolvedValue({
      id: "vc-1",
      userId: "user-1",
      provider: "EMAIL",
      purpose: "VERIFY_EMAIL",
      destination: "test@kin-sell.com",
      codeHash: sha256(code),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    mockPrisma.verificationCode.update.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.userIdentity.upsert.mockResolvedValue({});

    const result = await accountService.confirmEmailVerification(
      "user-1",
      "vc-1",
      code,
    );

    // 1. verificationCode.update appelé avec consumedAt
    expect(mockPrisma.verificationCode.update).toHaveBeenCalledTimes(1);
    const vcUpdateArgs = mockPrisma.verificationCode.update.mock.calls[0][0];
    expect(vcUpdateArgs.where).toEqual({ id: "vc-1" });
    expect(vcUpdateArgs.data.consumedAt).toBeInstanceOf(Date);

    // 2. user.update met email + emailVerified: true
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        email: "test@kin-sell.com",
        emailVerified: true,
      },
    });

    // 3. userIdentity.upsert avec provider EMAIL et isVerified: true
    expect(mockPrisma.userIdentity.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockPrisma.userIdentity.upsert.mock.calls[0][0];
    expect(upsertArgs.where.provider_providerSubject).toEqual({
      provider: "EMAIL",
      providerSubject: "test@kin-sell.com",
    });
    expect(upsertArgs.create).toMatchObject({
      userId: "user-1",
      provider: "EMAIL",
      providerSubject: "test@kin-sell.com",
      isVerified: true,
    });
    expect(upsertArgs.update).toMatchObject({
      isVerified: true,
    });

    // 4. retour { success: true }
    expect(result).toEqual({ success: true });
  });
});
