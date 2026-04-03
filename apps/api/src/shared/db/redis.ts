/**
 * Redis Client — Kin-Sell
 *
 * Singleton Redis connection for rate-limiting, caching, and session store.
 * Falls back gracefully to in-memory if Redis is unavailable.
 */

import RedisModule from "ioredis";
const Redis = (RedisModule as any).default || RedisModule;
import { env } from "../../config/env.js";
import { logger } from "../logger.js";

let redis: any = null;
let _ready = false;

function createRedisClient(): any {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
      if (times > 5) return null;
      return Math.min(times * 500, 3000);
    },
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  client.on("connect", () => {
    _ready = true;
    logger.info("[Redis] Connecté");
  });

  client.on("error", (err: Error) => {
    _ready = false;
    logger.warn({ err: err.message }, "[Redis] Erreur de connexion — fallback mémoire");
  });

  client.on("close", () => {
    _ready = false;
  });

  return client;
}

export function getRedis(): any {
  if (!redis) {
    redis = createRedisClient();
    redis.connect().catch(() => {});
  }
  return _ready ? redis : null;
}

export function isRedisReady(): boolean {
  return _ready;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
    _ready = false;
  }
}
