/**
 * Tests — account.service.ts → requestPhoneOtp
 *
 * Couvre les garde-fous SMS provider + invalidation des anciens codes + envoi SMS.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma, mockSms, mockEnv } = vi.hoisted(() => ({
  mockPrisma: {
    verificationCode: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    user: { update: vi.fn(), findUnique: vi.fn() },
    userIdentity: { upsert: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  } as any,
  mockSms: {
    isSmsConfigured: vi.fn(),
    sendOtpSms: vi.fn(),
  },
  mockEnv: {
    NODE_ENV: "production",
    OTP_TTL_SECONDS: 300,
    OTP_MAX_ATTEMPTS: 5,
    OTP_RESEND_COOLDOWN_SECONDS: 60,
    JWT_SECRET: "x".repeat(32),
  },
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/sms/sms-sender.js", () => ({
  isSmsConfigured: mockSms.isSmsConfigured,
  sendOtpSms: mockSms.sendOtpSms,
}));
vi.mock("../shared/email/mailer.js", () => ({
  isMailConfigured: vi.fn(() => true),
  sendOtpEmail: vi.fn(),
}));
vi.mock("../config/env.js", () => ({ env: mockEnv }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Import after mocks ─────────────────────────────────────

import * as accountService from "../modules/account/account.service.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.verificationCode.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.verificationCode.delete.mockResolvedValue({});
  mockEnv.NODE_ENV = "production";
});

// Numéro unique par test pour contourner le cooldown en mémoire (Map module-level)
let phoneCounter = 100;
const nextPhone = () => `+243800000${phoneCounter++}`;

// ════════════════════════════════════════════════════════════
// requestPhoneOtp — garde-fous provider SMS
// ════════════════════════════════════════════════════════════

describe("requestPhoneOtp()", () => {
  it("renvoie 503 en production si aucun provider SMS n'est configuré", async () => {
    mockEnv.NODE_ENV = "production";
    mockSms.isSmsConfigured.mockReturnValue(false);

    await expect(
      accountService.requestPhoneOtp({ phone: nextPhone(), purpose: "SIGN_IN" as any }),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(mockPrisma.verificationCode.create).not.toHaveBeenCalled();
    expect(mockSms.sendOtpSms).not.toHaveBeenCalled();
  });

  it("ne consomme pas le cooldown quand aucun provider SMS n'est configuré (deux 503 d'affilée, pas de 429)", async () => {
    mockEnv.NODE_ENV = "production";
    mockSms.isSmsConfigured.mockReturnValue(false);

    const phone = nextPhone();

    await expect(
      accountService.requestPhoneOtp({ phone, purpose: "SIGN_IN" as any }),
    ).rejects.toMatchObject({ statusCode: 503 });

    // Second appel immédiat avec le même numéro → toujours 503, jamais 429.
    await expect(
      accountService.requestPhoneOtp({ phone, purpose: "SIGN_IN" as any }),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(mockPrisma.verificationCode.create).not.toHaveBeenCalled();
  });

  it("libère le cooldown si sendOtpSms échoue (un nouvel essai n'est pas bloqué par 429)", async () => {
    mockEnv.NODE_ENV = "production";
    mockSms.isSmsConfigured.mockReturnValue(true);
    mockSms.sendOtpSms.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mockPrisma.verificationCode.create
      .mockResolvedValueOnce({ id: "vc-1", expiresAt: new Date(Date.now() + 60_000) })
      .mockResolvedValueOnce({ id: "vc-2", expiresAt: new Date(Date.now() + 60_000) });

    const phone = nextPhone();

    await expect(
      accountService.requestPhoneOtp({ phone, purpose: "SIGN_IN" as any }),
    ).rejects.toMatchObject({ statusCode: 503 });

    // Le second essai doit pouvoir aller jusqu'au bout (cooldown libéré après l'échec).
    const result = await accountService.requestPhoneOtp({
      phone,
      purpose: "SIGN_IN" as any,
    });
    expect(result.verificationId).toBe("vc-2");
  });

  it("autorise le flow en development sans provider et expose previewCode", async () => {
    mockEnv.NODE_ENV = "development";
    mockSms.isSmsConfigured.mockReturnValue(false);
    mockPrisma.verificationCode.create.mockResolvedValue({
      id: "vc-dev-1",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await accountService.requestPhoneOtp({
      phone: nextPhone(),
      purpose: "SIGN_IN" as any,
    });

    expect(result.verificationId).toBe("vc-dev-1");
    expect(typeof result.previewCode).toBe("string");
    expect(result.previewCode).toMatch(/^\d{6}$/);
    expect(mockSms.sendOtpSms).not.toHaveBeenCalled();
  });

  it("supprime le code et renvoie 503 si sendOtpSms échoue", async () => {
    mockSms.isSmsConfigured.mockReturnValue(true);
    mockSms.sendOtpSms.mockResolvedValue(false);
    mockPrisma.verificationCode.create.mockResolvedValue({
      id: "vc-fail-1",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      accountService.requestPhoneOtp({ phone: nextPhone(), purpose: "SIGN_IN" as any }),
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(mockPrisma.verificationCode.delete).toHaveBeenCalledWith({
      where: { id: "vc-fail-1" },
    });
  });

  it("succès : crée le code, envoie le SMS, ne fuite pas previewCode en production", async () => {
    mockEnv.NODE_ENV = "production";
    mockSms.isSmsConfigured.mockReturnValue(true);
    mockSms.sendOtpSms.mockResolvedValue(true);
    mockPrisma.verificationCode.create.mockResolvedValue({
      id: "vc-ok-1",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await accountService.requestPhoneOtp({
      phone: nextPhone(),
      purpose: "SIGN_IN" as any,
    });

    expect(mockPrisma.verificationCode.create).toHaveBeenCalledTimes(1);
    expect(mockSms.sendOtpSms).toHaveBeenCalledTimes(1);
    expect(result.verificationId).toBe("vc-ok-1");
    expect(result.previewCode).toBeUndefined();
  });

  it("invalide les anciens codes PHONE actifs avant de créer un nouveau", async () => {
    mockSms.isSmsConfigured.mockReturnValue(true);
    mockSms.sendOtpSms.mockResolvedValue(true);
    mockPrisma.verificationCode.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.verificationCode.create.mockResolvedValue({
      id: "vc-new-1",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const phone = nextPhone();
    await accountService.requestPhoneOtp({ phone, purpose: "SIGN_IN" as any });

    expect(mockPrisma.verificationCode.updateMany).toHaveBeenCalledTimes(1);
    const updateArgs = mockPrisma.verificationCode.updateMany.mock.calls[0][0];
    expect(updateArgs.where).toMatchObject({
      provider: "PHONE",
      purpose: "SIGN_IN",
      consumedAt: null,
    });
    expect(updateArgs.where.destination).toBeTruthy();
    expect(updateArgs.data.consumedAt).toBeInstanceOf(Date);
  });
});
