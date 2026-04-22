/**
 * Job Advisor Service — Chantier C Phase 3 + Chantier J4
 *
 * Génère des DirectAnswer (voir spec §4) à partir des insights emploi.
 * Couplé à Knowledge IA via intent (goals/categories/countriesInterest).
 *
 * Chantier J4 ajoute 7 règles d'enrichissement basées sur JobMarketSnapshot :
 *   R1 SKILL_GAP              — compétences manquantes vs topSkills marché
 *   R2 MARKET_OVERSATURATED   — saturation élevée → diversifier
 *   R3 LOW_CITY_DEMAND        — offres rares en ville → villes voisines
 *   R4 TRENDING_CATEGORY      — trend7d ≥ +20 % → postuler vite
 *   R5 SALARY_MISMATCH        — attentes > marché → réaligner
 *   R6 CROSS_BORDER_OPPORTUNITY — autre pays africain moins saturé
 *   R7 CERTIFICATION_BOOST    — cert ROI reconnue absente
 */

import { prisma } from "../../shared/db/prisma.js";
import { getUserTier, tierLimit } from "../../shared/billing/freemium-tier.js";
import { getMyApplicationsInsights } from "./job-analytics.service.js";
import { QualificationLevel, type CountryCode } from "@prisma/client";

export interface DirectAnswer {
  severity: "INFO" | "WARN" | "CRITICAL";
  pain: string;
  action: string;
  cta: { label: string; action: string; meta?: Record<string, unknown> };
  source: "SELL" | "JOB" | "HYBRID";
  priority: number; // 0-100
  rule?: string; // identifiant règle (SKILL_GAP, etc.) — J4
}

// ─── Seuils J4 ───
const SATURATION_HIGH_THRESHOLD = 3; // ≥3 candidats par poste = saturé
const LOW_CITY_DEMAND_THRESHOLD = 5; // <5 offres ouvertes
const TRENDING_THRESHOLD_PCT = 20;
const SALARY_MISMATCH_RATIO = 1.3;
const CERT_KEYWORDS = [
  "aws",
  "azure",
  "gcp",
  "pmp",
  "scrum",
  "cisco",
  "comptia",
  "iso",
  "six sigma",
  "cfa",
  "cpa",
  "prince2",
  "itil",
  "google",
  "microsoft",
];

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

  // ═════════════════════════════════════════════════════
  // Chantier J4 — 7 règles enrichies JobMarketSnapshot
  // ═════════════════════════════════════════════════════
  try {
    const enriched = await computeEnrichedRules(userId, intent);
    answers.push(...enriched);
  } catch {
    // Enrichissement best-effort : jamais bloquant
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

// ═════════════════════════════════════════════════════
// Helpers Chantier J4
// ═════════════════════════════════════════════════════

async function computeEnrichedRules(
  userId: string,
  intent: { categories: string[]; countriesInterest: CountryCode[] } | null,
): Promise<DirectAnswer[]> {
  const out: DirectAnswer[] = [];

  const [profile, qualifications, experiences, lastApp] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { userId },
      select: { city: true, countryCode: true },
    }),
    prisma.userQualification.findMany({
      where: { userId },
      select: { label: true, level: true, fieldOfStudy: true },
    }),
    prisma.userExperience.findMany({
      where: { userId },
      select: { category: true, skills: true },
    }),
    prisma.jobApplication.findFirst({
      where: { candidateUserId: userId },
      orderBy: { createdAt: "desc" },
      select: { expectedSalaryUsd: true, jobListing: { select: { category: true, countryCode: true, city: true } } },
    }),
  ]);

  const userCategory =
    intent?.categories[0] ??
    experiences[0]?.category ??
    lastApp?.jobListing.category ??
    null;
  const userCountryCode =
    profile?.countryCode ??
    intent?.countriesInterest[0] ??
    lastApp?.jobListing.countryCode ??
    null;
  const userCity = profile?.city ?? lastApp?.jobListing.city ?? null;

  if (!userCategory || !userCountryCode) return out;

  // Snapshot le plus récent (≤ 7j) pour cette zone
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const snapshot = await prisma.jobMarketSnapshot.findFirst({
    where: {
      category: userCategory,
      countryCode: userCountryCode,
      city: userCity ?? undefined,
      snapshotDate: { gte: sevenDaysAgo },
    },
    orderBy: { snapshotDate: "desc" },
  });

  const userSkills = new Set<string>(
    experiences.flatMap((e) => e.skills.map((s) => s.toLowerCase())),
  );
  const userHasCert = qualifications.some(
    (q) => q.level === QualificationLevel.CERTIFICATION,
  );

  // ── R1 SKILL_GAP ──
  if (snapshot && snapshot.topSkills.length > 0) {
    const missing = snapshot.topSkills.filter(
      (s) => !userSkills.has(s.toLowerCase()),
    );
    if (missing.length >= 3) {
      out.push({
        severity: "WARN",
        pain: `${missing.length} compétences clés du marché ${userCategory} manquent à votre profil.`,
        action: `Priorisez : ${missing.slice(0, 3).join(", ")}.`,
        cta: {
          label: "Ajouter ces compétences",
          action: "EDIT_PROFILE",
          meta: { section: "skills", suggest: missing.slice(0, 5) },
        },
        source: "JOB",
        priority: 78,
        rule: "SKILL_GAP",
      });
    }
  }

  // ── R2 MARKET_OVERSATURATED ──
  if (snapshot && snapshot.saturationIndex >= SATURATION_HIGH_THRESHOLD) {
    out.push({
      severity: "WARN",
      pain: `Marché ${userCategory} saturé : ${Math.round(snapshot.saturationIndex)} candidats par poste${userCity ? ` à ${userCity}` : ""}.`,
      action: "Diversifiez vers des catégories adjacentes ou élargissez la zone géographique.",
      cta: {
        label: "Explorer d'autres catégories",
        action: "OPEN_JOBS",
        meta: { filter: "adjacent_categories" },
      },
      source: "JOB",
      priority: 72,
      rule: "MARKET_OVERSATURATED",
    });
  }

  // ── R3 LOW_CITY_DEMAND ──
  if (userCity && snapshot && snapshot.openJobs < LOW_CITY_DEMAND_THRESHOLD) {
    const nearby = await prisma.jobMarketSnapshot.findMany({
      where: {
        category: userCategory,
        countryCode: userCountryCode,
        city: { not: userCity },
        snapshotDate: { gte: sevenDaysAgo },
        openJobs: { gte: LOW_CITY_DEMAND_THRESHOLD },
      },
      orderBy: { openJobs: "desc" },
      take: 3,
      select: { city: true, openJobs: true },
    });
    if (nearby.length > 0) {
      out.push({
        severity: "INFO",
        pain: `Peu d'offres ${userCategory} à ${userCity} (${snapshot.openJobs} seulement).`,
        action: `Villes plus porteuses : ${nearby.map((n) => `${n.city} (${n.openJobs})`).join(", ")}.`,
        cta: {
          label: "Voir offres multi-villes",
          action: "OPEN_JOBS",
          meta: { cities: nearby.map((n) => n.city) },
        },
        source: "JOB",
        priority: 55,
        rule: "LOW_CITY_DEMAND",
      });
    }
  }

  // ── R4 TRENDING_CATEGORY ──
  if (
    snapshot &&
    snapshot.trend7dPercent != null &&
    snapshot.trend7dPercent >= TRENDING_THRESHOLD_PCT
  ) {
    out.push({
      severity: "INFO",
      pain: `Catégorie ${userCategory} en forte croissance : +${snapshot.trend7dPercent}% cette semaine.`,
      action: "Postulez maintenant — fenêtre d'opportunité.",
      cta: {
        label: "Voir les offres en tendance",
        action: "OPEN_JOBS",
        meta: { category: userCategory, trend: "hot" },
      },
      source: "JOB",
      priority: 68,
      rule: "TRENDING_CATEGORY",
    });
  }

  // ── R5 SALARY_MISMATCH ──
  if (
    snapshot?.avgSalaryUsdCents &&
    lastApp?.expectedSalaryUsd &&
    lastApp.expectedSalaryUsd > 0
  ) {
    const marketUsd = snapshot.avgSalaryUsdCents / 100;
    if (lastApp.expectedSalaryUsd > marketUsd * SALARY_MISMATCH_RATIO) {
      out.push({
        severity: "WARN",
        pain: `Votre attente salariale ($${lastApp.expectedSalaryUsd}) dépasse la moyenne marché ($${Math.round(marketUsd)}).`,
        action: `Recalibrez autour de $${Math.round(marketUsd)}–$${Math.round(marketUsd * 1.15)} pour augmenter votre taux de réponse.`,
        cta: { label: "Ajuster mes prétentions", action: "EDIT_PROFILE", meta: { section: "salary" } },
        source: "JOB",
        priority: 65,
        rule: "SALARY_MISMATCH",
      });
    }
  }

  // ── R6 CROSS_BORDER_OPPORTUNITY ──
  if (snapshot && snapshot.saturationIndex >= SATURATION_HIGH_THRESHOLD) {
    const crossBorder = await prisma.jobMarketSnapshot.findMany({
      where: {
        category: userCategory,
        countryCode: { not: userCountryCode },
        snapshotDate: { gte: sevenDaysAgo },
        saturationIndex: { lt: SATURATION_HIGH_THRESHOLD },
        openJobs: { gte: LOW_CITY_DEMAND_THRESHOLD },
      },
      orderBy: [{ openJobs: "desc" }, { saturationIndex: "asc" }],
      take: 2,
      select: { countryCode: true, country: true, openJobs: true, saturationIndex: true },
    });
    if (crossBorder.length > 0) {
      const list = crossBorder
        .map((c) => `${c.country} (${c.openJobs} offres, saturation ${c.saturationIndex.toFixed(1)})`)
        .join(" · ");
      out.push({
        severity: "INFO",
        pain: `Autres pays africains moins saturés en ${userCategory}.`,
        action: `À explorer : ${list}.`,
        cta: {
          label: "Explorer l'international",
          action: "OPEN_JOBS",
          meta: { countries: crossBorder.map((c) => c.countryCode) },
        },
        source: "JOB",
        priority: 58,
        rule: "CROSS_BORDER_OPPORTUNITY",
      });
    }
  }

  // ── R7 CERTIFICATION_BOOST ──
  if (snapshot && snapshot.topSkills.length > 0 && !userHasCert) {
    const certSkill = snapshot.topSkills.find((s) =>
      CERT_KEYWORDS.some((k) => s.toLowerCase().includes(k)),
    );
    if (certSkill) {
      out.push({
        severity: "INFO",
        pain: `La certification "${certSkill}" est valorisée sur le marché ${userCategory}.`,
        action: "Obtenez-la pour booster votre alignement de +15 à +25 %.",
        cta: {
          label: "Voir les formations",
          action: "OPEN_TRAININGS",
          meta: { skill: certSkill },
        },
        source: "JOB",
        priority: 62,
        rule: "CERTIFICATION_BOOST",
      });
    }
  }

  return out;
}
