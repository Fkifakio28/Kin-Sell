/**
 * Tests — auth-middleware.ts (requireAuth, requireRoles)
 *
 * Vérifie l'extraction du token, la validation JWT,
 * la vérification de session et de compte.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    user: { findUnique: vi.fn() },
    userSession: { findUnique: vi.fn() },
  },
}));

vi.mock("../shared/db/prisma.js", () => ({ prisma: mockPrisma }));
vi.mock("../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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

import { requireAuth, requireRoles } from "../shared/auth/auth-middleware.js";
import { signAccessToken } from "../shared/auth/session.js";
import { HttpError } from "../shared/errors/http-error.js";

// ── Helpers ────────────────────────────────────────────────

function mockReq(overrides: Record<string, any> = {}): any {
  return {
    header: vi.fn((name: string) => overrides.headers?.[name.toLowerCase()]),
    cookies: overrides.cookies ?? {},
    path: overrides.path ?? "/test",
    ...overrides,
  };
}

function mockRes(): any {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({
    accountStatus: "ACTIVE",
    role: "USER",
  });
  mockPrisma.userSession.findUnique.mockResolvedValue({
    status: "ACTIVE",
  });
});

// ════════════════════════════════════════════════════════════
// requireAuth
// ════════════════════════════════════════════════════════════

describe("requireAuth", () => {
  it("passe avec un Bearer token valide", async () => {
    const token = signAccessToken({ sub: "user-1", role: "USER", sid: "sess-1" });
    const req = mockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const next = vi.fn();

    requireAuth(req, mockRes(), next);

    // wait for async _verifyAccountAndSession
    await vi.waitFor(() => {
      expect(next).toHaveBeenCalled();
    });

    expect(req.auth).toBeDefined();
    expect(req.auth.userId).toBe("user-1");
    expect(req.auth.role).toBe("USER");
  });

  it("passe avec un token dans un cookie httpOnly", async () => {
    const token = signAccessToken({ sub: "user-2", role: "BUSINESS", sid: "sess-2" });
    const req = mockReq({ cookies: { kin_access: token } });
    const next = vi.fn();

    requireAuth(req, mockRes(), next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalled();
    });

    expect(req.auth.userId).toBe("user-2");
  });

  it("rejette sans token (401)", () => {
    const req = mockReq({});
    const next = vi.fn();

    requireAuth(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });

  it("rejette avec un token invalide (401)", () => {
    const req = mockReq({
      headers: { authorization: "Bearer invalid-token-here" },
    });
    const next = vi.fn();

    requireAuth(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  it("rejette un compte suspendu (403)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      accountStatus: "SUSPENDED",
      role: "USER",
    });

    const token = signAccessToken({ sub: "user-suspended", role: "USER", sid: "sess-s" });
    const req = mockReq({
      headers: { authorization: `Bearer ${token}` },
      path: "/listings",
    });
    const next = vi.fn();

    requireAuth(req, mockRes(), next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalled();
    });

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(403);
  });

  it("permet /me même si suspendu", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      accountStatus: "SUSPENDED",
      role: "USER",
    });

    const token = signAccessToken({ sub: "user-s2", role: "USER", sid: "sess-s2" });
    const req = mockReq({
      headers: { authorization: `Bearer ${token}` },
      path: "/me",
    });
    const next = vi.fn();

    requireAuth(req, mockRes(), next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalled();
    });

    // next appelé sans erreur
    const arg = next.mock.calls[0][0];
    expect(arg).toBeUndefined();
  });

  it("rejette une session révoquée (401)", async () => {
    mockPrisma.userSession.findUnique.mockResolvedValue({
      status: "REVOKED",
    });

    const token = signAccessToken({ sub: "user-rev", role: "USER", sid: "sess-rev" });
    const req = mockReq({
      headers: { authorization: `Bearer ${token}` },
    });
    const next = vi.fn();

    requireAuth(req, mockRes(), next);

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalled();
    });

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// requireRoles
// ════════════════════════════════════════════════════════════

describe("requireRoles", () => {
  it("passe si le rôle correspond", () => {
    const middleware = requireRoles("ADMIN" as any, "SUPER_ADMIN" as any);
    const req = mockReq({ auth: { userId: "u1", role: "ADMIN" } });
    const next = vi.fn();

    middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it("rejette si le rôle ne correspond pas (403)", () => {
    const middleware = requireRoles("ADMIN" as any);
    const req = mockReq({ auth: { userId: "u2", role: "USER" } });
    const next = vi.fn();

    expect(() => middleware(req, mockRes(), next)).toThrow(HttpError);
  });

  it("rejette sans auth (401)", () => {
    const middleware = requireRoles("USER" as any);
    const req = mockReq({});
    const next = vi.fn();

    expect(() => middleware(req, mockRes(), next)).toThrow(HttpError);
  });
});
