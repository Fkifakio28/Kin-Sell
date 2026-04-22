/**
 * Job Analytics Service — Chantier C Phase 3
 *
 * Endpoints couverts (voir docs/KIN-SELL-ANALYTIQUE-V2-SPEC.md §2) :
 *  - getJobDemandMap        → demand-map
 *  - getAlignmentScore      → alignment-score (formule §7)
 *  - getJobMarketSnapshot   → market-snapshot
 *  - getMyApplicationsInsights → my-applications-insights
 *  - getPostingInsights     → posting-insights
 *
 * Toutes les fonctions respectent la matrice freemium §3.
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { getUserTier, tierLimit, type FreemiumTier } from "../../shared/billing/freemium-tier.js";
import { enrichAnalyticsContext } from "../analytics/analytics-knowledge-bridge.js";
import {
  JobListingStatus,
  JobApplicationStatus,
  type CountryCode,
  type QualificationLevel,
} from "@prisma/client";

// ─────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────

export interface DemandZone {
  country: string;
  countryCode: CountryCode | null;
  city: string;
  category: string;
  openJobs: number;
  applicants: number;
  saturationIndex: number; // applicants / max(1, openJobs)
  avgSalaryUsd: number | null;
  topSkills: string[];
  trend7d: string | null; // ex: "+12%" | "-4%"
  locked?: boolean;
}

export interface DemandMapResult {
  updatedAt: string;
  scope: "NATIONAL" | "CROSS_BORDER";
  tier: FreemiumTier;
  zones: DemandZone[];
  hiddenCount: number;
}

export interface AlignmentBreakdown {
  qualifications: number;
  experience: number;
  skills: number;
  geo: number;
  salary: number;
}

export interface AlignmentResult {
  jobId: string;
  candidateUserId: string;
  scoreGlobal: number;
  breakdown?: AlignmentBreakdown;
  strengths: string[];
  gaps: string[];
  verdict: string;
  cta: { label: string; action: string; meta?: Record<string, unknown> };
  tier: FreemiumTier;
}

export interface MyApplicationsInsights {
  totalApplications: number;
  byStatus: Record<JobApplicationStatus, number>;
  responseRate: number;
  avgResponseDelayHours: number | null;
  bestAlignmentCategory: string | null;
  frustrationSignal: "NONE" | "LOW_RESPONSE_RATE" | "STALE" | "LOW_ALIGNMENT";
  tier: FreemiumTier;
}

export interface PostingInsights {
  jobId: string;
  title: string;
  views: number;
  applications: number;
  applicationRate: number;
  qualityDistribution: { weak: number; fair: number; strong: number }; // alignment buckets
  avgAlignment: number | null;
  recommendations: string[];
  tier: FreemiumTier;
}

export interface MarketSnapshot {
  tier: FreemiumTier;
  asCandidate: {
    openJobsForMe: number;
    avgAlignmentScore: number | null;
    hotCategories: { category: string; jobs: number; alignment: number | null }[];
  };
  asRecruiter: {
    activeJobs: number;
    candidatePool: number;
    avgApplicationsPerJob: number;
    poolSaturation: "LOW" | "MEDIUM" | "HIGH";
  } | null;
}

// ─────────────────────────────────────────────
// 1) Demand Map
// ─────────────────────────────────────────────

export async function getJobDemandMap(
  userId: string,
  query: { category?: string; countries?: CountryCode[]; limit?: number },
): Promise<DemandMapResult> {
  const tier = await getUserTier(userId);
  const hardLimit = Math.min(50, Math.max(1, query.limit ?? 20));

  // Flux descendant : si la requête n'a pas de filtre explicite,
  // on utilise l'intent Knowledge IA pour cibler automatiquement.
  const ctx = await enrichAnalyticsContext(userId);
  const effectiveCategory = query.category ?? ctx.categories[0];
  const effectiveCountries = query.countries?.length
    ? query.countries
    : (ctx.countriesInterest.length ? ctx.countriesInterest : undefined);

  const whereBase: any = { status: JobListingStatus.ACTIVE };
  if (effectiveCategory) whereBase.category = effectiveCategory;
  if (effectiveCountries?.length) whereBase.countryCode = { in: effectiveCountries };

  // Agrégation par (countryCode, city, category)
  const grouped = await prisma.jobListing.groupBy({
    by: ["countryCode", "country", "city", "category"],
    where: whereBase,
    _count: { _all: true },
    _avg: { salaryMinUsd: true, salaryMaxUsd: true },
    _sum: { applicationCount: true, viewCount: true },
    orderBy: { _count: { id: "desc" } },
    take: hardLimit * 2, // on filtrera après
  });

  const zones: DemandZone[] = grouped.slice(0, hardLimit).map((g) => {
    const openJobs = g._count._all;
    const applicants = g._sum.applicationCount ?? 0;
    const avgMin = g._avg.salaryMinUsd ?? null;
    const avgMax = g._avg.salaryMaxUsd ?? null;
    const avgSalary = avgMin != null && avgMax != null ? Math.round((avgMin + avgMax) / 2) : (avgMax ?? avgMin);
    return {
      country: g.country,
      countryCode: g.countryCode,
      city: g.city,
      category: g.category,
      openJobs,
      applicants,
      saturationIndex: Number((applicants / Math.max(1, openJobs)).toFixed(2)),
      avgSalaryUsd: avgSalary,
      topSkills: [], // hydraté côté PREMIUM uniquement
      trend7d: null,
    };
  });

  // Freemium gating
  const visibleCount = tierLimit(tier, { free: 3, medium: 10, premium: zones.length });
  const visible = zones.slice(0, visibleCount);

  // Masquer chiffres-clés pour FREE (pattern A : preview partiel)
  if (tier === "FREE") {
    for (const z of visible) {
      z.openJobs = -1;
      z.applicants = -1;
      z.avgSalaryUsd = null;
      z.locked = true;
    }
  } else if (tier === "MEDIUM") {
    // Hydratation topSkills seulement PREMIUM
    for (const z of visible) z.topSkills = [];
  } else {
    // PREMIUM → top skills
    await hydrateTopSkills(visible);
  }

  const scope: "NATIONAL" | "CROSS_BORDER" =
    new Set(visible.map((z) => z.countryCode).filter(Boolean)).size > 1 ? "CROSS_BORDER" : "NATIONAL";

  return {
    updatedAt: new Date().toISOString(),
    scope,
    tier,
    zones: visible,
    hiddenCount: Math.max(0, zones.length - visibleCount),
  };
}

async function hydrateTopSkills(zones: DemandZone[]): Promise<void> {
  for (const z of zones) {
    const rows = await prisma.jobListing.findMany({
      where: {
        status: JobListingStatus.ACTIVE,
        countryCode: z.countryCode ?? undefined,
        city: z.city,
        category: z.category,
      },
      select: { requiredSkills: true },
      take: 100,
    });
    const freq = new Map<string, number>();
    for (const r of rows) for (const s of r.requiredSkills) freq.set(s, (freq.get(s) ?? 0) + 1);
    z.topSkills = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s]) => s);
  }
}

// ─────────────────────────────────────────────
// 2) Alignment Score (formule §7)
// ─────────────────────────────────────────────

const QUAL_LEVEL_RANK: Record<QualificationLevel, number> = {
  NONE: 0,
  PRIMARY: 1,
  SECONDARY: 2,
  VOCATIONAL: 3,
  CERTIFICATION: 3,
  BACHELOR: 4,
  MASTER: 5,
  DOCTORATE: 6,
};

export async function getAlignmentScore(
  viewerUserId: string,
  params: { jobId: string; candidateUserId?: string },
): Promise<AlignmentResult> {
  const tier = await getUserTier(viewerUserId);
  const candidateId = params.candidateUserId ?? viewerUserId;

  const [job, candidate] = await Promise.all([
    prisma.jobListing.findUnique({ where: { id: params.jobId } }),
    prisma.user.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        profile: { select: { city: true, countryCode: true } },
        qualifications: true,
        experiences: true,
      },
    }),
  ]);

  if (!job) throw new HttpError(404, "Offre introuvable.");
  if (!candidate) throw new HttpError(404, "Candidat introuvable.");

  // Si recruteur demande candidateUserId, il doit être l'owner de l'offre
  if (params.candidateUserId && job.recruiterUserId !== viewerUserId) {
    throw new HttpError(403, "Accès refusé à ce scoring.");
  }

  // ─ qualifications ─
  const candQualLabels = new Set(candidate.qualifications.map((q) => q.label.toLowerCase()));
  const reqQuals = job.requiredQualifs.map((s) => s.toLowerCase());
  const qualsMatched = reqQuals.length === 0
    ? 1
    : reqQuals.filter((r) => candQualLabels.has(r)).length / reqQuals.length;

  // ─ experience ─
  const candYears = sumExperienceYears(candidate.experiences);
  const reqYears = job.minExperienceYrs;
  const domainMatch = reqYears === 0
    ? 1
    : candidate.experiences.some((e) => (e.category ?? "").toLowerCase() === job.category.toLowerCase())
      ? 1
      : 0.5;
  const experienceScore = Math.min(1, candYears / Math.max(1, reqYears)) * domainMatch;

  // ─ skills ─
  const candSkills = new Set(candidate.experiences.flatMap((e) => e.skills.map((s) => s.toLowerCase())));
  const reqSkills = job.requiredSkills.map((s) => s.toLowerCase());
  const skillsScore = reqSkills.length === 0
    ? 1
    : reqSkills.filter((r) => candSkills.has(r)).length / reqSkills.length;

  // ─ geo ─
  const candCity = candidate.profile?.city ?? null;
  const candCountry = candidate.profile?.countryCode ?? null;
  let geoScore = 0.2;
  if (candCity && candCity.toLowerCase() === job.city.toLowerCase()) geoScore = 1;
  else if (candCountry && candCountry === job.countryCode) geoScore = 0.6;

  // ─ salary ─
  let salaryScore = 1;
  if (job.salaryMaxUsd && job.salaryMaxUsd > 0) {
    // On considère le salaire max offert comme référence ; à défaut de fourchette candidate, on neutralise
    salaryScore = 1;
  }

  const scoreGlobal = Number(
    (
      qualsMatched * 0.35 +
      experienceScore * 0.25 +
      skillsScore * 0.20 +
      geoScore * 0.10 +
      salaryScore * 0.10
    ).toFixed(2),
  );

  const breakdown: AlignmentBreakdown = {
    qualifications: Number(qualsMatched.toFixed(2)),
    experience: Number(experienceScore.toFixed(2)),
    skills: Number(skillsScore.toFixed(2)),
    geo: Number(geoScore.toFixed(2)),
    salary: Number(salaryScore.toFixed(2)),
  };

  const strengths: string[] = [];
  const gaps: string[] = [];
  if (breakdown.geo >= 1) strengths.push("Même ville que l'offre");
  else if (breakdown.geo >= 0.6) strengths.push("Même pays");
  else gaps.push("Localisation éloignée");
  if (breakdown.qualifications >= 0.8) strengths.push("Qualifications alignées");
  else if (breakdown.qualifications < 0.5) gaps.push(`Manque ${reqQuals.filter((r) => !candQualLabels.has(r)).slice(0, 2).join(", ")}`);
  if (breakdown.experience < 0.5 && reqYears > 0) gaps.push(`Manque ${Math.max(0, reqYears - Math.round(candYears))} an(s) d'expérience`);
  if (breakdown.skills < 0.5 && reqSkills.length > 0) gaps.push(`Skills manquants: ${reqSkills.filter((r) => !candSkills.has(r)).slice(0, 3).join(", ")}`);

  const verdict =
    scoreGlobal >= 0.75 ? "Candidature fortement recommandée"
    : scoreGlobal >= 0.50 ? "Candidature envisageable"
    : scoreGlobal >= 0.30 ? "Profil partiel — compléter avant de postuler"
    : "Incompatible — voir ces alternatives";

  // Freemium shaping
  let outBreakdown: AlignmentBreakdown | undefined;
  let outStrengths = strengths;
  let outGaps = gaps;
  if (tier === "FREE") {
    outBreakdown = undefined;
    outStrengths = strengths.slice(0, 1);
    outGaps = [];
  } else if (tier === "MEDIUM") {
    outBreakdown = { ...breakdown, salary: 0, skills: 0 } as AlignmentBreakdown;
    outGaps = gaps.slice(0, 1);
  } else {
    outBreakdown = breakdown;
  }

  return {
    jobId: job.id,
    candidateUserId: candidateId,
    scoreGlobal,
    breakdown: outBreakdown,
    strengths: outStrengths,
    gaps: outGaps,
    verdict,
    cta: scoreGlobal >= 0.5
      ? { label: "Postuler maintenant", action: "APPLY_JOB", meta: { jobId: job.id } }
      : { label: "Compléter mon profil", action: "EDIT_PROFILE" },
    tier,
  };
}

function sumExperienceYears(
  experiences: { startDate: Date; endDate: Date | null }[],
): number {
  const now = Date.now();
  let total = 0;
  for (const e of experiences) {
    const start = e.startDate.getTime();
    const end = (e.endDate ?? new Date()).getTime();
    total += Math.max(0, (end - start) / (365 * 24 * 3600 * 1000));
  }
  return total;
}

// ─────────────────────────────────────────────
// 3) Market Snapshot
// ─────────────────────────────────────────────

export async function getJobMarketSnapshot(userId: string): Promise<MarketSnapshot> {
  const tier = await getUserTier(userId);

  const [user, intent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, profile: { select: { city: true, countryCode: true } } },
    }),
    prisma.userKnowledgeIntent.findUnique({
      where: { userId },
      select: { categories: true, countriesInterest: true, goals: true },
    }),
  ]);

  const targetCountries = (intent?.countriesInterest?.length ? intent.countriesInterest : (user?.profile?.countryCode ? [user.profile.countryCode] : []));
  const targetCategories = intent?.categories ?? [];

  // ── asCandidate ──
  const openJobsWhere: any = { status: JobListingStatus.ACTIVE };
  if (targetCountries.length) openJobsWhere.countryCode = { in: targetCountries };
  if (targetCategories.length) openJobsWhere.category = { in: targetCategories };

  const openJobsForMe = await prisma.jobListing.count({ where: openJobsWhere });

  // Alignment moyen sur les candidatures existantes
  const myApps = await prisma.jobApplication.findMany({
    where: { candidateUserId: userId, alignmentScore: { not: null } },
    select: { alignmentScore: true, jobListing: { select: { category: true } } },
  });
  const avgAlignment = myApps.length
    ? Number((myApps.reduce((s, a) => s + (a.alignmentScore ?? 0), 0) / myApps.length).toFixed(2))
    : null;

  const hotCategoriesRaw = await prisma.jobListing.groupBy({
    by: ["category"],
    where: openJobsWhere,
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: tierLimit(tier, { free: 1, medium: 3, premium: 8 }),
  });
  const hotCategories = hotCategoriesRaw.map((c) => ({
    category: c.category,
    jobs: c._count._all,
    alignment: avgAlignment,
  }));

  // ── asRecruiter (si l'user possède au moins 1 JobListing) ──
  const activeJobs = await prisma.jobListing.count({
    where: { recruiterUserId: userId, status: JobListingStatus.ACTIVE },
  });

  let asRecruiter: MarketSnapshot["asRecruiter"] = null;
  if (activeJobs > 0) {
    const apps = await prisma.jobApplication.count({
      where: { jobListing: { recruiterUserId: userId } },
    });
    const avgPerJob = activeJobs > 0 ? Number((apps / activeJobs).toFixed(1)) : 0;
    const saturation: "LOW" | "MEDIUM" | "HIGH" = avgPerJob < 3 ? "LOW" : avgPerJob < 15 ? "MEDIUM" : "HIGH";
    asRecruiter = {
      activeJobs,
      candidatePool: apps,
      avgApplicationsPerJob: avgPerJob,
      poolSaturation: saturation,
    };
  }

  return {
    tier,
    asCandidate: {
      openJobsForMe: tier === "FREE" ? Math.min(openJobsForMe, 3) : openJobsForMe,
      avgAlignmentScore: tier === "FREE" ? null : avgAlignment,
      hotCategories,
    },
    asRecruiter,
  };
}

// ─────────────────────────────────────────────
// 4) My Applications Insights
// ─────────────────────────────────────────────

export async function getMyApplicationsInsights(userId: string): Promise<MyApplicationsInsights> {
  const tier = await getUserTier(userId);
  const apps = await prisma.jobApplication.findMany({
    where: { candidateUserId: userId },
    select: {
      status: true,
      createdAt: true,
      firstSeenAt: true,
      respondedAt: true,
      alignmentScore: true,
      jobListing: { select: { category: true } },
    },
  });

  const byStatus = Object.fromEntries(
    Object.values(JobApplicationStatus).map((s) => [s, 0]),
  ) as Record<JobApplicationStatus, number>;
  for (const a of apps) byStatus[a.status]++;

  const responded = apps.filter((a) => a.respondedAt || a.status !== JobApplicationStatus.PENDING);
  const responseRate = apps.length ? Number((responded.length / apps.length).toFixed(2)) : 0;

  const delays: number[] = [];
  for (const a of apps) {
    if (a.respondedAt) {
      delays.push((a.respondedAt.getTime() - a.createdAt.getTime()) / (3600 * 1000));
    }
  }
  const avgResponseDelayHours = delays.length
    ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length)
    : null;

  // best alignment category
  const catScores = new Map<string, { total: number; count: number }>();
  for (const a of apps) {
    if (a.alignmentScore == null || !a.jobListing?.category) continue;
    const cur = catScores.get(a.jobListing.category) ?? { total: 0, count: 0 };
    cur.total += a.alignmentScore;
    cur.count += 1;
    catScores.set(a.jobListing.category, cur);
  }
  let bestAlignmentCategory: string | null = null;
  let bestAvg = 0;
  for (const [cat, { total, count }] of catScores) {
    const avg = total / count;
    if (avg > bestAvg) { bestAvg = avg; bestAlignmentCategory = cat; }
  }

  // frustration signal
  let frustrationSignal: MyApplicationsInsights["frustrationSignal"] = "NONE";
  if (apps.length >= 3 && responseRate < 0.3) frustrationSignal = "LOW_RESPONSE_RATE";
  else if (apps.length >= 3 && bestAvg > 0 && bestAvg < 0.4) frustrationSignal = "LOW_ALIGNMENT";
  else if (apps.length > 0 && apps.every((a) => Date.now() - a.createdAt.getTime() > 14 * 24 * 3600 * 1000)) frustrationSignal = "STALE";

  return {
    totalApplications: apps.length,
    byStatus,
    responseRate: tier === "FREE" ? 0 : responseRate,
    avgResponseDelayHours: tier === "FREE" ? null : avgResponseDelayHours,
    bestAlignmentCategory: tier === "PREMIUM" ? bestAlignmentCategory : null,
    frustrationSignal,
    tier,
  };
}

// ─────────────────────────────────────────────
// 5) Posting Insights (recruteur)
// ─────────────────────────────────────────────

export async function getPostingInsights(userId: string, jobId: string): Promise<PostingInsights> {
  const tier = await getUserTier(userId);
  const job = await prisma.jobListing.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      recruiterUserId: true,
      viewCount: true,
      applicationCount: true,
    },
  });
  if (!job) throw new HttpError(404, "Offre introuvable.");
  if (job.recruiterUserId !== userId) throw new HttpError(403, "Accès refusé.");

  const apps = await prisma.jobApplication.findMany({
    where: { jobListingId: jobId },
    select: { alignmentScore: true },
  });

  const scored = apps.filter((a) => a.alignmentScore != null) as { alignmentScore: number }[];
  const avgAlignment = scored.length
    ? Number((scored.reduce((s, a) => s + a.alignmentScore, 0) / scored.length).toFixed(2))
    : null;

  const weak = scored.filter((a) => a.alignmentScore < 0.4).length;
  const fair = scored.filter((a) => a.alignmentScore >= 0.4 && a.alignmentScore < 0.7).length;
  const strong = scored.filter((a) => a.alignmentScore >= 0.7).length;

  const applicationRate = job.viewCount > 0
    ? Number((job.applicationCount / job.viewCount).toFixed(3))
    : 0;

  const recommendations: string[] = [];
  if (job.viewCount < 20) recommendations.push("Boostez la visibilité : moins de 20 vues.");
  if (applicationRate < 0.03 && job.viewCount >= 50) recommendations.push("Reformulez l'offre : <3% de conversion vues→candidatures.");
  if (avgAlignment != null && avgAlignment < 0.4) recommendations.push("Précisez les critères requis pour mieux filtrer.");

  return {
    jobId: job.id,
    title: job.title,
    views: job.viewCount,
    applications: job.applicationCount,
    applicationRate,
    qualityDistribution: tier === "FREE" ? { weak: 0, fair: 0, strong: 0 } : { weak, fair, strong },
    avgAlignment: tier === "FREE" ? null : avgAlignment,
    recommendations: tier === "FREE" ? recommendations.slice(0, 1) : recommendations,
    tier,
  };
}
