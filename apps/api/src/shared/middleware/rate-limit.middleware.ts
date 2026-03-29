/**
 * Rate Limit Middleware — Kin-Sell
 *
 * In-memory sliding-window rate limiter per user or IP.
 * Lightweight: no DB writes on hot paths; logged only on violation.
 */

import { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth-middleware.js";
import { HttpError } from "../errors/http-error.js";
import { logSecurityEvent } from "../../modules/security/security.service.js";

/* ── Window entry ── */
interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

/* ── Cleanup old entries every 5 min ── */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => now - t < 3600_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 300_000);

/* ── Config presets ── */
export const RateLimits = {
  /** Messages: 20 per minute */
  MESSAGE: { windowMs: 60_000, max: 20, label: "MESSAGE" },
  /** Listing creation: 5 per hour */
  LISTING_CREATE: { windowMs: 3600_000, max: 5, label: "LISTING_CREATE" },
  /** Negotiation offers: 10 per hour */
  NEGOTIATION: { windowMs: 3600_000, max: 10, label: "NEGOTIATION" },
  /** Login attempts: 5 per 15 minutes (per IP) */
  LOGIN: { windowMs: 900_000, max: 5, label: "LOGIN" },
  /** Register: 3 per hour (per IP) */
  REGISTER: { windowMs: 3600_000, max: 3, label: "REGISTER" },
} as const;

type RateLimitConfig = { windowMs: number; max: number; label: string };

/**
 * Creates an Express middleware that enforces a rate limit.
 *
 * For authenticated routes, the key is `userId:label`.
 * For unauthenticated routes (login/register), the key is `ip:label`.
 */
export function rateLimit(config: RateLimitConfig) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    const identifier = authReq.auth?.userId ?? req.ip ?? "unknown";
    const key = `${identifier}:${config.label}`;

    const now = Date.now();
    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Keep only timestamps within the window
    entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);

    if (entry.timestamps.length >= config.max) {
      // Log the violation asynchronously (fire-and-forget)
      void logSecurityEvent({
        userId: authReq.auth?.userId,
        eventType: `RATE_LIMIT_${config.label}`,
        ipAddress: req.ip ?? undefined,
        userAgent: req.headers["user-agent"],
        riskLevel: 3,
        metadata: { count: entry.timestamps.length, windowMs: config.windowMs, max: config.max },
      });

      throw new HttpError(429, `Trop de requêtes. Réessayez dans quelques instants.`);
    }

    entry.timestamps.push(now);
    next();
  };
}
