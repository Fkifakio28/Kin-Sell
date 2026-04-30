/**
 * Analytics ↔ Knowledge IA Bridge — Chantier C Phase 4
 *
 * Couplage bi-directionnel entre Kin-Sell Analytique et Knowledge IA.
 *
 * ── Flux descendant (Knowledge → Analytics) ──
 * L'intent (goals/categories/countriesInterest) enrichit les paramètres
 * des services analytics :
 *   - enrichAnalyticsContext(userId) → AnalyticsContext (filtre auto)
 *
 * ── Flux ascendant (Analytics → Knowledge) ──
 * Les signaux des insights analytiques alimentent les recommandations
 * Knowledge IA :
 *   - enrichKnowledgeWithAnalytics(userId, recs) → Recommendation[]
 *     (ajoute warnings/boosts contextuels basés sur insights JOB+SELL)
 *
 * Cache 60s in-memory pour éviter les round-trips en rafale.
 */

import { prisma } from "../../shared/db/prisma.js";
import type { CountryCode, KnowledgeGoal } from "@prisma/client";
import { getMyApplicationsInsights } from "../job-analytics/job-analytics.service.js";
import { JobListingStatus } from "@prisma/client";
import type { Recommendation } from "../knowledge-ai/knowledge-ai.service.js";

// ─── Types publics ────────────────────────────

export interface AnalyticsContext {
  userId: string;
  goals: KnowledgeGoal[];
  categories: string[];
  keywords: string[];
  countriesInterest: CountryCode[];
  hasWorkIntent: boolean;
  hasHireIntent: boolean;
  hasSellIntent: boolean;
  hasBuyIntent: boolean;
}

// ─── Cache 60s ────────────────────────────────

const CACHE_TTL_MS = 60_000;
const _contextCache = new Map<string, { value: AnalyticsContext; expiry: number }>();

function getCached(userId: string): AnalyticsContext | null {
  const e = _contextCache.get(userId);
  if (!e) return null;
  if (Date.now() > e.expiry) {
    _contextCache.delete(userId);
    return null;
  }
  return e.value;
}

function setCached(userId: string, value: AnalyticsContext): void {
  _contextCache.set(userId, { value, expiry: Date.now() + CACHE_TTL_MS });
}

export function clearBridgeCache(userId?: string): void {
  if (userId) _contextCache.delete(userId);
  else _contextCache.clear();
}

// ─── Flux descendant ──────────────────────────

/**
 * Construit le contexte analytique enrichi par l'intent Knowledge IA.
 * Utilisé par les services analytics pour filtrer automatiquement
 * selon les préférences de l'utilisateur.
 */
export async function enrichAnalyticsContext(userId: string): Promise<AnalyticsContext> {
  const cached = getCached(userId);
  if (cached) return cached;

  const intent = await prisma.userKnowledgeIntent.findUnique({
    where: { userId },
    select: {
      goals: true,
      categories: true,
      keywords: true,
      countriesInterest: true,
    },
  });

  const goals = (intent?.goals ?? []) as KnowledgeGoal[];
  const ctx: AnalyticsContext = {
    userId,
    goals,
    categories: intent?.categories ?? [],
    keywords: intent?.keywords ?? [],
    countriesInterest: (intent?.countriesInterest ?? []) as CountryCode[],
    hasWorkIntent: goals.some((g) => String(g) === "WORK"),
    hasHireIntent: goals.some((g) => String(g) === "HIRE"),
    hasSellIntent: goals.some((g) => String(g) === "SELL"),
    hasBuyIntent: goals.some((g) => String(g) === "BUY"),
  };

  setCached(userId, ctx);
  return ctx;
}

// ─── Flux ascendant ───────────────────────────

export interface KnowledgeBoost {
  id: string;
  goal: KnowledgeGoal;
  title: string;
  message: string;
  source: "ANALYTICS_JOB" | "ANALYTICS_SELL";
  priority: number;
  cta?: { label: string; action: string; meta?: Record<string, unknown> };
}

/**
 * Enrichit une liste de recommandations Knowledge IA avec des signaux
 * issus des analytics (emploi + vente).
 *
 * - Si responseRate candidatures < 0.3 → ajoute un boost "améliorer profil"
 * - Si un secteur WORK a > X offres → ajoute un boost "opportunités détectées"
 * - Si un recruteur a applicationRate < 0.1 → ajoute un boost "reformuler offre"
 */
export async function enrichKnowledgeWithAnalytics(
  userId: string,
  recommendations: Recommendation[],
): Promise<(Recommendation | KnowledgeBoost)[]> {
  const out: (Recommendation | KnowledgeBoost)[] = [...recommendations];
  const ctx = await enrichAnalyticsContext(userId);

  // 1) Candidat — taux de réponse bas
  if (ctx.hasWorkIntent) {
    try {
      const appsInsights = await getMyApplicationsInsights(userId);
      if (appsInsights.totalApplications >= 3 && appsInsights.frustrationSignal === "LOW_RESPONSE_RATE") {
        out.push({
          id: `kb-work-responserate-${userId}`,
          goal: "WORK" as KnowledgeGoal,
          title: "Améliorez votre taux de réponse",
          message: `${Math.round((1 - appsInsights.responseRate) * 100)}% de vos candidatures restent sans réponse. Complétez vos qualifications.`,
          source: "ANALYTICS_JOB",
          priority: 80,
          cta: { label: "Compléter mon profil", action: "EDIT_PROFILE" },
        });
      }
    } catch {
      // silencieux — ne bloque pas les recos principales
    }
  }

  // 2) Candidat — opportunités détectées
  if (ctx.hasWorkIntent && ctx.categories.length > 0) {
    const cat = ctx.categories[0];
    const count = await prisma.jobListing.count({
      where: {
        status: JobListingStatus.ACTIVE,
        category: cat,
        ...(ctx.countriesInterest.length ? { countryCode: { in: ctx.countriesInterest } } : {}),
      },
    });
    if (count >= 5) {
      out.push({
        id: `kb-work-opps-${userId}`,
        goal: "WORK" as KnowledgeGoal,
        title: `${count} offres ${cat} détectées`,
        message: `Votre intent correspond à ${count} offres actives. Voyez les plus alignées.`,
        source: "ANALYTICS_JOB",
        priority: 65,
        cta: { label: "Voir les offres", action: "OPEN_JOBS", meta: { category: cat } },
      });
    }
  }

  // 3) Recruteur — taux candidature bas
  if (ctx.hasHireIntent) {
    const jobs = await prisma.jobListing.findMany({
      where: { recruiterUserId: userId, status: JobListingStatus.ACTIVE },
      select: { id: true, title: true, viewCount: true, applicationCount: true },
      take: 5,
    });
    for (const j of jobs) {
      if (j.viewCount >= 50 && j.applicationCount / j.viewCount < 0.03) {
        out.push({
          id: `kb-hire-rate-${j.id}`,
          goal: "HIRE" as KnowledgeGoal,
          title: `Offre "${j.title}" : conversion faible`,
          message: `Moins de 3% des visiteurs postulent. Reformulez le titre ou les critères.`,
          source: "ANALYTICS_JOB",
          priority: 70,
          cta: { label: "Éditer l'offre", action: "EDIT_JOB", meta: { jobId: j.id } },
        });
        break; // un seul signal recruteur à la fois
      }
    }
  }

  // Tri stable : priorité desc pour les KnowledgeBoost, recos d'origine inchangées devant si même score
  return out.sort((a, b) => {
    const pa = "priority" in a ? a.priority : 50;
    const pb = "priority" in b ? b.priority : 50;
    return pb - pa;
  });
}
