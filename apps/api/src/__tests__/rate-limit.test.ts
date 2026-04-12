/**
 * Tests — rate-limit.middleware.ts
 *
 * Teste le rate limiter en mode in-memory (sans Redis).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────

vi.hoisted(() => {});

vi.mock("../shared/db/redis.js", () => ({
  getRedis: vi.fn(() => null), // force in-memory fallback
}));
vi.mock("../modules/security/security.service.js", () => ({
  logSecurityEvent: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────

import { rateLimit, RateLimits } from "../shared/middleware/rate-limit.middleware.js";
import type { Request, Response, NextFunction } from "express";

function createMockReq(ip: string = "127.0.0.1", userId?: string): Request {
  const req = {
    ip,
    headers: { "user-agent": "test-agent" },
  } as any;
  if (userId) {
    req.auth = { userId };
  }
  return req;
}

function createMockRes(): Response {
  return {} as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// Rate Limit Configuration
// ════════════════════════════════════════════════════════════

describe("RateLimits presets", () => {
  it("MESSAGE: 20/min", () => {
    expect(RateLimits.MESSAGE.max).toBe(20);
    expect(RateLimits.MESSAGE.windowMs).toBe(60_000);
  });

  it("LOGIN: 5/15min", () => {
    expect(RateLimits.LOGIN.max).toBe(5);
    expect(RateLimits.LOGIN.windowMs).toBe(900_000);
  });

  it("REGISTER: 3/h", () => {
    expect(RateLimits.REGISTER.max).toBe(3);
    expect(RateLimits.REGISTER.windowMs).toBe(3600_000);
  });

  it("LISTING_CREATE: 5/h", () => {
    expect(RateLimits.LISTING_CREATE.max).toBe(5);
    expect(RateLimits.LISTING_CREATE.windowMs).toBe(3600_000);
  });
});

// ════════════════════════════════════════════════════════════
// Middleware behavior (in-memory fallback)
// ════════════════════════════════════════════════════════════

describe("rateLimit() middleware (in-memory)", () => {
  it("laisse passer les requêtes sous la limite", async () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 3, label: "TEST_PASS" });
    const req = createMockReq("10.0.0.1");
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(next).not.toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429 }));
  });

  it("bloque après dépassement de la limite (429)", async () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 2, label: "TEST_BLOCK" });
    const req = createMockReq("10.0.0.2");
    const res = createMockRes();
    const next = vi.fn();

    // 2 requêtes → OK
    await middleware(req, res, next);
    await middleware(req, res, next);

    // 3ème → 429
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(3);
    const lastCall = next.mock.calls[2][0];
    expect(lastCall).toBeDefined();
    expect(lastCall.statusCode).toBe(429);
  });

  it("utilise userId|ip comme identifiant si authentifié", async () => {
    const middleware = rateLimit({ windowMs: 60_000, max: 2, label: "TEST_AUTH" });
    const reqAuth = createMockReq("10.0.0.3", "user-1");
    const reqAnon = createMockReq("10.0.0.3");
    const res = createMockRes();
    const next = vi.fn();

    // Utilisateur authentifié — sa propre fenêtre
    await middleware(reqAuth, res, next);
    await middleware(reqAuth, res, next);

    // Même IP, pas authentifié — fenêtre distincte → passe
    await middleware(reqAnon, res, next);

    // Les 3 appels doivent passer (2 fenêtres séparées)
    expect(next).toHaveBeenCalledTimes(3);
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(next.mock.calls[2][0]).toBeUndefined();
  });
});
