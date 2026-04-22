/**
 * Job Advisor Service — Chantier C Phase 3
 *
 * Génère des DirectAnswer (voir spec §4) à partir des insights emploi.
 * Couplé à Knowledge IA via intent (goals/categories/countriesInterest).
 */

import { prisma } from "../../shared/db/prisma.js";
import { getUserTier, tierLimit } from "../../shared/billing/freemium-tier.js";
import { getMyApplicationsInsights } from "./job-analytics.service.js";

export interface DirectAnswer {
  severity: "INFO" | "WARN" | "CRITICAL";
  pain: string;
  action: string;
  cta: { label: string; action: string; meta?: Record<string, unknown> };
  source: "SELL" | "JOB" | "HYBRID";
  priority: number; // 0-100
}

export async function getJobDirectAnswers(userId: string): Promise<DirectAnswer[]> {
  const tier = await getUserTier(userId);
  const answers: DirectAnswer[] = [];

  const insights = await getMyApplicationsInsights(userId);

  // Signal 1 : low response rate
  if (insights.frustrationSignal === "LOW_RESPONSE_RATE") {
    answers.push({
      severity: "WARN",
      pain: `${Math.round((1 - insights.responseRate) * 100)}% de vos candidatures restent sans réponse.`,
      action: "Complétez vos certifications manquantes pour améliorer votre alignement.",
      cta: { label: "Compléter mon profil", action: "EDIT_PROFILE" },
      source: "JOB",
      priority: 80,
    });
  }

  // Signal 2 : stale
  if (insights.frustrationSignal === "STALE") {
    answers.push({
      severity: "INFO",
      pain: "Aucune candidature récente — votre profil risque de perdre en visibilité.",
      action: "Postulez à 3 nouvelles offres cette semaine.",
      cta: { label: "Explorer les offres", action: "OPEN_JOBS" },
      source: "JOB",
      priority: 60,
    });
  }

  // Signal 3 : low alignment
  if (insights.frustrationSignal === "LOW_ALIGNMENT") {
    answers.push({
      severity: "WARN",
      pain: "Vos candidatures récentes ont un alignement faible (<0.4).",
      action: "Ciblez des offres plus proches de votre expérience.",
      cta: { label: "Voir les offres matchées", action: "OPEN_JOBS", meta: { filter: "high_match" } },
      source: "JOB",
      priority: 70,
    });
  }

  // Signal 4 : opportunités dans l'intent Knowledge IA
  const intent = await prisma.userKnowledgeIntent.findUnique({
    where: { userId },
    select: { categories: true, countriesInterest: true, goals: true },
  });
  if (intent && intent.goals.some((g) => String(g) === "WORK")) {
    const cat = intent.categories[0];
    if (cat) {
      const count = await prisma.jobListing.count({
        where: {
          status: "ACTIVE",
          category: cat,
          ...(intent.countriesInterest.length ? { countryCode: { in: intent.countriesInterest } } : {}),
        },
      });
      if (count > 0) {
        const visible = tier === "FREE" ? Math.min(3, count) : count;
        answers.push({
          severity: "INFO",
          pain: `${count} offres ${cat} correspondent à votre intent.`,
          action: tier === "FREE"
            ? `Vous en voyez ${visible} sur ${count} (FREE).`
            : "Consultez les meilleures dès maintenant.",
          cta: tier === "FREE"
            ? { label: "Débloquer toutes les offres", action: "UPGRADE_PLAN", meta: { reason: "jobs_intent_cap" } }
            : { label: "Voir les offres", action: "OPEN_JOBS", meta: { category: cat } },
          source: "JOB",
          priority: 50,
        });
      }
    }
  }

  // Dédup par pain, tri priorité
  const seen = new Set<string>();
  const dedup = answers.filter((a) => {
    const k = a.pain.slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => b.priority - a.priority);

  const limit = tierLimit(tier, { free: 1, medium: 3, premium: 10 });
  return dedup.slice(0, limit);
}
