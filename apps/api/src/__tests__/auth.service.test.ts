/**
 * Tests — auth.service (register, login, me, refresh, logout)
 *
 * Flux critiques : inscription, connexion, lockout brute-force, refresh token,
 * compte suspendu/en suppression.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma, mockLogger, mockRedis } = vi.hoisted(() => {
  const mockRedis = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  };

  return {
    mockPrisma: {
      user: { findUnique: vi.fn(), create: vi.fn() },
      userIdentity: { findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn() },
      userProfile: { findUnique: vi.fn() },
      userSession: {
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findUnique: vi.fn(),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
    } as any,
    mockLogger: {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    },
    mockRedis,
  };
});

// ── Module mocks ───────────────────────────────────────────

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({ logger: mockLogger }));
vi.mock("../shared/db/redis.js", () => ({ getRedis: () => mockRedis }));
vi.mock("../shared/email/mailer.js", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../modules/security/security.service.js", () => ({
  logSecurityEvent: vi.fn().mockResolvedValue(undefined),
  checkMultiAccount: vi.fn().mockResolvedValue({ suspicious: false, accountCount: 1 }),
  createFraudSignal: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-jwt-secret-32chars-minimum!!",
    JWT_EXPIRES_IN: "15m",
    REFRESH_TOKEN_SECRET: "test-refresh-secret-32chars-min!!",
    REFRESH_TOKEN_EXPIRES_IN: "7d",
    NODE_ENV: "test",
  },
}));

// ── Import after mocks ─────────────────────────────────────

import { register, login, me, refresh, logout } from "../modules/auth/auth.service.js";
import { hashPassword } from "../shared/auth/password.js";

// ── Setup ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.incr.mockResolvedValue(1);
});

// ════════════════════════════════════════════════════════════
// REGISTER
// ════════════════════════════════════════════════════════════

describe("register()", () => {
  const validInput = {
    email: "Test@Example.COM",
    password: "SecurePass123",
    displayName: "Test User",
  };

  it("crée un utilisateur et retourne les tokens", async () => {
    mockPrisma.userIdentity.findUnique.mockResolvedValue(null);
    mockPrisma.userProfile.findUnique.mockResolvedValue(null);

    const createdUser = {
      id: "user-new",
      email: "test@example.com",
      role: "USER",
      profile: { displayName: "Test User" },
    };

    // $transaction mock — simule la création
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({ id: "user-new" }),
          findUniqueOrThrow: vi.fn().mockResolvedValue(createdUser),
        },
        userIdentity: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    // Session mock
    mockPrisma.userSession.create.mockResolvedValue({
      id: "session-1",
      userId: "user-new",
    });
    mockPrisma.userSession.update.mockResolvedValue({});

    const result = await register(validInput);

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result).toHaveProperty("sessionId");
    expect(result.user.id).toBe("user-new");
    expect(result.user.role).toBe("USER");
  });

  it("normalise l'email (lowercase, trim)", async () => {
    mockPrisma.userIdentity.findUnique.mockResolvedValue(null);
    mockPrisma.userProfile.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({ id: "u2" }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "u2", email: "test@example.com", role: "USER",
            profile: { displayName: "Test" },
          }),
        },
        userIdentity: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });
    mockPrisma.userSession.create.mockResolvedValue({ id: "s2" });
    mockPrisma.userSession.update.mockResolvedValue({});

    await register({ ...validInput, email: "  Test@EXAMPLE.com  " });

    // L'email passé à findUnique doit être normalisé
    expect(mockPrisma.userIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider_providerSubject: expect.objectContaining({
            providerSubject: "test@example.com",
          }),
        }),
      }),
    );
  });

  it("rejette si l'email existe déjà (409)", async () => {
    mockPrisma.userIdentity.findUnique.mockResolvedValue({ id: "existing" });

    await expect(register(validInput)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("attribue le rôle BUSINESS si spécifié", async () => {
    mockPrisma.userIdentity.findUnique.mockResolvedValue(null);
    mockPrisma.userProfile.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          create: vi.fn().mockResolvedValue({ id: "u-biz" }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "u-biz", email: "biz@test.com", role: "BUSINESS",
            profile: { displayName: "Business" },
          }),
        },
        userIdentity: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });
    mockPrisma.userSession.create.mockResolvedValue({ id: "s-biz" });
    mockPrisma.userSession.update.mockResolvedValue({});

    const result = await register({ ...validInput, role: "BUSINESS" as any });
    expect(result.user.role).toBe("BUSINESS");
  });
});

// ════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════

describe("login()", () => {
  const validLogin = { email: "test@example.com", password: "SecurePass123" };

  it("connecte un utilisateur avec des credentials valides", async () => {
    const hash = await hashPassword("SecurePass123");
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      passwordHash: hash,
      role: "USER",
      accountStatus: "ACTIVE",
      profile: { displayName: "Test User" },
    });
    mockPrisma.userSession.create.mockResolvedValue({ id: "sess-1" });
    mockPrisma.userSession.update.mockResolvedValue({});

    const result = await login(validLogin);

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result.user.id).toBe("user-1");
  });

  it("rejette si l'utilisateur n'existe pas (401)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(login(validLogin)).rejects.toMatchObject({
      statusCode: 401,
      message: "Email ou mot de passe invalide",
    });
  });

  it("rejette si le mot de passe est incorrect (401)", async () => {
    const hash = await hashPassword("DifferentPassword");
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-2",
      email: "test@example.com",
      passwordHash: hash,
      role: "USER",
      accountStatus: "ACTIVE",
      profile: { displayName: "Test" },
    });

    await expect(login(validLogin)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejette un compte en suppression (403)", async () => {
    const hash = await hashPassword("SecurePass123");
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-del",
      email: "test@example.com",
      passwordHash: hash,
      role: "USER",
      accountStatus: "PENDING_DELETION",
      profile: { displayName: "Deleted" },
    });

    await expect(login(validLogin)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lockout après 5 tentatives échouées", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(5);

    await expect(login(validLogin)).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringContaining("Trop de tentatives"),
    });
  });

  it("bloque un compte verrouillé (429)", async () => {
    mockRedis.get.mockResolvedValue("1"); // lockout active

    await expect(login(validLogin)).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it("efface les tentatives après un login réussi", async () => {
    const hash = await hashPassword("SecurePass123");
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-ok",
      email: "test@example.com",
      passwordHash: hash,
      role: "USER",
      accountStatus: "ACTIVE",
      profile: { displayName: "OK" },
    });
    mockPrisma.userSession.create.mockResolvedValue({ id: "s-ok" });
    mockPrisma.userSession.update.mockResolvedValue({});

    await login(validLogin);

    expect(mockRedis.del).toHaveBeenCalledWith("login_attempts:test@example.com");
  });
});

// ════════════════════════════════════════════════════════════
// ME
// ════════════════════════════════════════════════════════════

describe("me()", () => {
  it("retourne les données utilisateur", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      role: "USER",
      accountStatus: "ACTIVE",
      suspensionReason: null,
      suspensionExpiresAt: null,
      profile: {
        displayName: "Test",
        avatarUrl: null,
        city: "Kinshasa",
        country: "CD",
        verificationStatus: "UNVERIFIED",
      },
    });

    const result = await me("user-1");

    expect(result.id).toBe("user-1");
    expect(result.email).toBe("test@example.com");
    expect(result.displayName).toBe("Test");
  });

  it("throw 404 si l'utilisateur n'existe pas", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(me("non-existent")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ════════════════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════════════════════

describe("logout()", () => {
  it("révoque la session", async () => {
    mockPrisma.userSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await logout("session-123");

    expect(result).toEqual({ success: true });
    expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "session-123" }),
      }),
    );
  });

  it("retourne success même sans sessionId", async () => {
    const result = await logout();
    expect(result).toEqual({ success: true });
  });
});
