/**
 * Vitest global setup — Kin-Sell API
 *
 * Mocks globaux partagés par tous les tests :
 * - Prisma (base de données)
 * - Redis
 * - Logger
 * - Mailer
 * - Environment variables
 */

import { vi, beforeEach } from "vitest";

// ── Suppress console noise during tests ──
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

// ── Reset all mocks between tests ──
beforeEach(() => {
  vi.clearAllMocks();
});
