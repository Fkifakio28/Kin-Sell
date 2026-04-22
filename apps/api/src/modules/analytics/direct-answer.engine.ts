/**
 * Direct Answer Engine — Chantier C Phase 5
 *
 * Moteur unifié "Réponses droit au but" (voir docs/KIN-SELL-ANALYTIQUE-V2-SPEC.md §4).
 *
 * Principe : une réponse analytique = 1 douleur + 1 action + 1 CTA.
 * Source unifiée SELL + JOB + HYBRID, scoring + dédup + prio, cap par tier.
 *
 * Pipeline :
 *   1. Collecter signaux (SELL via analytics-cta + JOB via job-advisor)
 *   2. Scorer : severity × urgency × userValue
 *   3. Dédup par pain (fuzzy)
 *   4. Pondérer avec intent Knowledge IA (WORK → priorise JOB, SELL → priorise SELL)
 *   5. Cap selon tier : FREE=1, MEDIUM=3, PREMIUM=10
 *
 * Exposé via GET /analytics/direct-answers (tous tiers).
 */

import { getUserTier, tierLimit, type FreemiumTier } from "../../shared/billing/freemium-tier.js";
import { enrichAnalyticsContext } from "./analytics-knowledge-bridge.js";
import { getJobDirectAnswers } from "../job-analytics/job-advisor.service.js";
import { evaluateAnalyticsCTAs } from "./analytics-cta.service.js";
import type { AnalyticsCTA } from "./analytics-cta.service.js";

// ─────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────

export type DirectAnswerSeverity = "INFO" | "WARN" | "CRITICAL";
export type DirectAnswerSource = "SELL" | "JOB" | "HYBRID";

export interface DirectAnswer {
  id: string;
  severity: DirectAnswerSeverity;
  pain: string;
  action: string;
  cta: { label: string; action: string; meta?: Record<string, unknown> };
  source: DirectAnswerSource;
  priority: number; // 0-100 (calculé)
}

export interface DirectAnswerReport {
  tier: FreemiumTier;
  answers: DirectAnswer[];
  totalCandidates: number; // avant cap
  cappedBy: "TIER" | "NONE";
}

// ─────────────────────────────────────────────
// Utils scoring
// ─────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<DirectAnswerSeverity, number> = {
  INFO: 20,
  WARN: 50,
  CRITICAL: 90,
};

function normalizePain(pain: string): string {
  return pain
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9% ]+/gi, "")
    .trim()
    .slice(0, 70);
}

function dedupByPain<T extends { pain: string; priority: number }>(list: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of list) {
    const key = normalizePain(item.pain);
    const existing = seen.get(key);
    if (!existing || item.priority > existing.priority) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

// ─────────────────────────────────────────────
// Mapping SELL (AnalyticsCTA → DirectAnswer)
// ─────────────────────────────────────────────

function mapCtaToDirectAnswer(cta: AnalyticsCTA, index: number): DirectAnswer {
  // AnalyticsCTA.priority est 1-10, on scale à 0-100
  const scaled = Math.min(100, cta.priority * 10);
  // severity : > 70 → CRITICAL, > 40 → WARN, sinon INFO
  const severity: DirectAnswerSeverity =
    scaled >= 70 ? "CRITICAL" : scaled >= 40 ? "WARN" : "INFO";
  return {
    id: `sell-${cta.trigger}-${index}`,
    severity,
    pain: cta.title,
    action: cta.subtitle || cta.message,
    cta: {
      label: cta.ctaLabel,
      action: "UPGRADE_PLAN",
      meta: { target: cta.ctaTarget, plan: cta.planName, trigger: cta.trigger },
    },
    source: "SELL",
    priority: scaled,
  };
}

// ─────────────────────────────────────────────
// Moteur principal
// ─────────────────────────────────────────────

export async function getDirectAnswers(userId: string): Promise<DirectAnswerReport> {
  const tier = await getUserTier(userId);
  const ctx = await enrichAnalyticsContext(userId);

  const candidates: DirectAnswer[] = [];

  // ─ Source SELL ─
  try {
    const sellReport = await evaluateAnalyticsCTAs(userId);
    sellReport.ctas.forEach((c, i) => candidates.push(mapCtaToDirectAnswer(c, i)));
  } catch {
    // non bloquant
  }

  // ─ Source JOB ─
  try {
    const jobAnswers = await getJobDirectAnswers(userId);
    for (const j of jobAnswers) {
      candidates.push({
        id: `job-${normalizePain(j.pain).slice(0, 20)}-${candidates.length}`,
        severity: j.severity,
        pain: j.pain,
        action: j.action,
        cta: j.cta,
        source: "JOB",
        priority: j.priority,
      });
    }
  } catch {
    // non bloquant
  }

  // ─ Pondération par intent Knowledge IA ─
  for (const a of candidates) {
    // Bonus severity
    a.priority += SEVERITY_WEIGHT[a.severity] / 10;
    // Si intent WORK et answer JOB → bonus
    if (ctx.hasWorkIntent && a.source === "JOB") a.priority += 10;
    if (ctx.hasSellIntent && a.source === "SELL") a.priority += 10;
    // HYBRID si intent couvre les deux → léger bonus HYBRID
    if (ctx.hasWorkIntent && ctx.hasSellIntent && a.source !== "HYBRID") {
      // downgrade marginal pour laisser place à des HYBRID
    }
    a.priority = Math.min(100, Math.round(a.priority));
  }

  // ─ Dédup + tri ─
  const deduped = dedupByPain(candidates).sort((a, b) => b.priority - a.priority);

  // ─ Cap tier ─
  const cap = tierLimit(tier, { free: 1, medium: 3, premium: 10 });
  const capped = deduped.slice(0, cap);

  return {
    tier,
    answers: capped,
    totalCandidates: deduped.length,
    cappedBy: capped.length < deduped.length ? "TIER" : "NONE",
  };
}

// Export utils pour tests
export const _internals = { normalizePain, dedupByPain, mapCtaToDirectAnswer, SEVERITY_WEIGHT };
