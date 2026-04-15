/**
 * BASE PROVIDER — Abstract provider with retry, timeout, backoff
 * Kin-Sell External Intelligence
 */

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";

const TIMEOUT = () => env.EXTERNAL_INTEL_TIMEOUT_MS;
const MAX_RETRIES = () => env.EXTERNAL_INTEL_RETRY_COUNT;

export interface FetchOptions {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Fetch with retry + exponential backoff + timeout.
 * Returns parsed JSON or null on all retries exhausted.
 */
export async function fetchWithRetry<T = unknown>(
  opts: FetchOptions,
  sourceName: string,
): Promise<{ data: T | null; latencyMs: number; error?: string }> {
  const timeout = opts.timeout ?? TIMEOUT();
  const maxRetries = MAX_RETRIES();
  const start = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(opts.url, {
        headers: opts.headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = (await response.json()) as T;
      return { data, latencyMs: Date.now() - start };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === maxRetries) {
        logger.warn({ source: sourceName, attempt, error: msg }, `[ExternalIntel] ${sourceName} failed after ${maxRetries + 1} attempts`);
        return { data: null, latencyMs: Date.now() - start, error: msg };
      }
      // Exponential backoff: 1s, 2s, 4s
      const backoff = Math.min(1000 * Math.pow(2, attempt), 8000);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  return { data: null, latencyMs: Date.now() - start, error: "Exhausted retries" };
}
