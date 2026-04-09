/**
 * Rate Limit Middleware — Kin-Sell
 *
 * Redis-backed sliding-window rate limiter per user or IP.
 * Falls back to in-memory store if Redis is unavailable.
 * Lightweight: no DB writes on hot paths; logged only on violation.
 */

import { NextFunction, Request, Response } from "express";
import type { AuthenticatedRequest } from "../auth/auth-middleware.js";
import { HttpError } from "../errors/http-error.js";
import { logSecurityEvent } from "../../modules/security/security.service.js";
import { getRedis } from "../db/redis.js";

/* ── In-memory fallback ── */
interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

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
  /** Bulk import: 2 per hour (max 100 listings via bulk per hour) */
  BULK_IMPORT: { windowMs: 3600_000, max: 2, label: "BULK_IMPORT" },
  /** SoKin posts: 10 per hour */
  SOKIN_POST: { windowMs: 3600_000, max: 10, label: "SOKIN_POST" },
  /** Negotiation offers: 10 per hour */
  NEGOTIATION: { windowMs: 3600_000, max: 10, label: "NEGOTIATION" },
  /** Login attempts: 5 per 15 minutes (per IP) */
  LOGIN: { windowMs: 900_000, max: 5, label: "LOGIN" },
  /** Register: 3 per hour (per IP) */
  REGISTER: { windowMs: 3600_000, max: 3, label: "REGISTER" },
  /** Ad tracking (impression/click): 60 per minute per IP */
  AD_TRACKING: { windowMs: 60_000, max: 60, label: "AD_TRACKING" },
} as const;

type RateLimitConfig = { windowMs: number; max: number; label: string };

/** Redis sliding-window check — returns current count */
async function redisRateCheck(key: string, windowMs: number): Promise<number> {
  const redis = getRedis();
  if (!redis) return -1; // fallback to memory

  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `rl:${key}`;

  // Atomic pipeline: remove old entries, add current, count, set TTL
  const results = await redis
    .multi()
    .zremrangebyscore(redisKey, 0, windowStart)
    .zadd(redisKey, now, `${now}-${Math.random().toString(36).slice(2, 8)}`)
    .zcard(redisKey)
    .pexpire(redisKey, windowMs)
    .exec();

  if (!results) return -1;
  // results[2] = [error, count] from zcard
  const count = results[2]?.[1] as number;
  return typeof count === "number" ? count : -1;
}

/**
 * Creates an Express middleware that enforces a rate limit.
 * Uses Redis when available, falls back to in-memory.
 */
export function rateLimit(config: RateLimitConfig) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const identifier = authReq.auth?.userId ?? req.ip ?? "unknown";
    const key = `${identifier}:${config.label}`;

    // Try Redis first
    const redisCount = await redisRateCheck(key, config.windowMs).catch(() => -1);

    if (redisCount >= 0) {
      // Redis path
      if (redisCount > config.max) {
        void logSecurityEvent({
          userId: authReq.auth?.userId,
          eventType: `RATE_LIMIT_${config.label}`,
          ipAddress: req.ip ?? undefined,
          userAgent: req.headers["user-agent"],
          riskLevel: 3,
          metadata: { count: redisCount, windowMs: config.windowMs, max: config.max, backend: "redis" },
        });
        throw new HttpError(429, `Trop de requêtes. Réessayez dans quelques instants.`);
      }
      next();
      return;
    }

    // In-memory fallback
    const now = Date.now();
    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);

    if (entry.timestamps.length >= config.max) {
      void logSecurityEvent({
        userId: authReq.auth?.userId,
        eventType: `RATE_LIMIT_${config.label}`,
        ipAddress: req.ip ?? undefined,
        userAgent: req.headers["user-agent"],
        riskLevel: 3,
        metadata: { count: entry.timestamps.length, windowMs: config.windowMs, max: config.max, backend: "memory" },
      });

      throw new HttpError(429, `Trop de requêtes. Réessayez dans quelques instants.`);
    }

    entry.timestamps.push(now);
    next();
  };
}
