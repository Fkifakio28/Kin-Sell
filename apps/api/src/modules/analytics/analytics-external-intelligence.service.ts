/**
 * Analytics External Intelligence Service — Kin-Sell
 *
 * Enriches internal analytics with external market intelligence
 * from Gemini (web grounding). Provides:
 *   - External category benchmarks
 *   - Regional demand indicators
 *   - Competitive landscape signals
 *   - Seasonal patterns
 *
 * All data is source-attributed with confidence scores.
 * Never presents external estimates as internal facts.
 *
 * Integration: Called by the analytics routes to enrich basic/deep insights.
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import {
  getRegionalMarketContext,
  getMultiCategoryContext,
  type RegionalContext,
} from "../ads/regional-market-context.service.js";
import {
  scoreInternal,
  scoreHybrid,
  scoreInferred,
  withScore,
  type ScoredInsight,
  type ConfidenceScore,
} from "./confidence-score.service.js";
import { getFusedIntelligence } from "../external-intel/external-intelligence-fusion.service.js";

// ── Types ──────────────────────────────────────────────────

export interface EnrichedCategoryInsight {
  category: string;
  internalCount: number;
  internalAvgPriceCents: number;
  externalDemand: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  externalTrend: "GROWING" | "STABLE" | "DECLINING" | "UNKNOWN";
  externalPriceRange: { minUsdCents: number; maxUsdCents: number } | null;
  seasonalNote: string | null;
  competitorDensity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  insight: string;
  fusedOpportunityScore?: number;
  fusedTriggers?: string[];
  fusedPricingAdjustment?: number;
}

export interface RegionalDemandInsight {
  city: string;
  country: string;
  topDemandCategories: Array<{ category: string; demandLevel: string }>;
  marketSummary: string;
  generatedAt: string;
}

export interface EnrichedAnalyticsReport {
  categories: ScoredInsight<EnrichedCategoryInsight>[];
  regionalDemand: ScoredInsight<RegionalDemandInsight> | null;
  overallConfidence: ConfidenceScore;
  enrichedAt: string;
}

// ── Internal Data ──────────────────────────────────────────

interface InternalCategoryData {
  category: string;
  count: number;
  avgPriceCents: number;
}

async function getInternalCategoryData(): Promise<InternalCategoryData[]> {
  try {
    const listings = await prisma.listing.findMany({
      where: { status: "ACTIVE", isPublished: true },
      select: { category: true, priceUsdCents: true },
    });

    const catMap = new Map<string, { count: number; totalPrice: number }>();
    for (const l of listings) {
      const cat = catMap.get(l.category) ?? { count: 0, totalPrice: 0 };
      cat.count++;
      cat.totalPrice += l.priceUsdCents;
      catMap.set(l.category, cat);
    }

    return [...catMap.entries()]
      .map(([category, data]) => ({
        category,
        count: data.count,
        avgPriceCents: data.count > 0 ? Math.round(data.totalPrice / data.count) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────

/**
 * Get enriched analytics for a seller, combining internal data
 * with external intelligence from Gemini.
 */
export async function getEnrichedAnalytics(
  userId: string,
  city: string = "Kinshasa",
  country: string = "RDC",
): Promise<EnrichedAnalyticsReport> {
  const internalData = await getInternalCategoryData();

  if (internalData.length === 0) {
    return {
      categories: [],
      regionalDemand: null,
      overallConfidence: scoreInferred("Aucune donnée interne disponible", 0),
      enrichedAt: new Date().toISOString(),
    };
  }

  // Get top categories for enrichment
  const topCategories = internalData.slice(0, 6);
  const categoryNames = topCategories.map(c => c.category);

  // Fetch regional context from Gemini
  let regionalContext: RegionalContext | null = null;
  try {
    regionalContext = await getMultiCategoryContext(categoryNames, city, country);
  } catch (err) {
    logger.warn({ err }, "[ExternalIntel] Gemini multi-category failed");
  }

  // Build enriched insights per category
  const enrichedCategories: ScoredInsight<EnrichedCategoryInsight>[] = [];

  for (const cat of topCategories) {
    const externalSignal = regionalContext?.signals.find(
      s => s.data.category.toLowerCase() === cat.category.toLowerCase(),
    );

    const internalScore = scoreInternal(cat.count, cat.category);
    const externalScore = externalSignal?.score ?? scoreInferred(`Pas de données externes pour ${cat.category}`, 0);
    const hybridScore = scoreHybrid(internalScore, externalScore);

    const enriched: EnrichedCategoryInsight = {
      category: cat.category,
      internalCount: cat.count,
      internalAvgPriceCents: cat.avgPriceCents,
      externalDemand: externalSignal?.data.demandLevel ?? "UNKNOWN",
      externalTrend: externalSignal?.data.trend ?? "UNKNOWN",
      externalPriceRange: externalSignal?.data.priceRange ?? null,
      seasonalNote: externalSignal?.data.seasonalNote ?? null,
      competitorDensity: externalSignal?.data.competitorDensity ?? "UNKNOWN",
      insight: externalSignal?.data.insight ?? `${cat.count} annonces dans ${cat.category}`,
    };

    // Enrich with fusion intelligence (best-effort)
    try {
      const fused = await getFusedIntelligence(cat.category, "CD", city);
      if (fused.confidence > 20) {
        enriched.fusedOpportunityScore = fused.opportunityScore;
        enriched.fusedTriggers = fused.activeTriggers.map((t) => t.trigger);
        enriched.fusedPricingAdjustment = fused.pricingAdjustmentPercent;
      }
    } catch { /* fusion non critique */ }

    enrichedCategories.push(withScore(enriched, hybridScore));
  }

  // Build regional demand insight
  let regionalDemand: ScoredInsight<RegionalDemandInsight> | null = null;
  if (regionalContext && regionalContext.signals.length > 0) {
    const topDemand = regionalContext.signals
      .filter(s => s.data.demandLevel !== "UNKNOWN")
      .map(s => ({ category: s.data.category, demandLevel: s.data.demandLevel }))
      .sort((a, b) => {
        const order = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
        return (order[b.demandLevel as keyof typeof order] ?? 0) - (order[a.demandLevel as keyof typeof order] ?? 0);
      });

    regionalDemand = withScore(
      {
        city,
        country,
        topDemandCategories: topDemand,
        marketSummary: regionalContext.summary,
        generatedAt: regionalContext.generatedAt,
      },
      regionalContext.signals[0]?.score ?? scoreInferred("Contexte régional", 0),
    );
  }

  // Overall confidence
  const totalInternal = internalData.reduce((sum, c) => sum + c.count, 0);
  const overallInternal = scoreInternal(totalInternal, "global");
  const overallExternal = regionalContext
    ? regionalContext.signals[0]?.score ?? scoreInferred("Gemini partiel", 0)
    : scoreInferred("Pas de données externes", 0);

  return {
    categories: enrichedCategories,
    regionalDemand,
    overallConfidence: scoreHybrid(overallInternal, overallExternal),
    enrichedAt: new Date().toISOString(),
  };
}

/**
 * Get demand analysis for a specific category in a city.
 */
export async function getCategoryDemandAnalysis(
  category: string,
  city: string = "Kinshasa",
): Promise<ScoredInsight<EnrichedCategoryInsight>> {
  // Internal data
  const listings = await prisma.listing.findMany({
    where: { status: "ACTIVE", isPublished: true, category },
    select: { priceUsdCents: true },
  });

  const internalCount = listings.length;
  const avgPriceCents = internalCount > 0
    ? Math.round(listings.reduce((s, l) => s + l.priceUsdCents, 0) / internalCount)
    : 0;

  // External data
  let externalContext: RegionalContext | null = null;
  try {
    externalContext = await getRegionalMarketContext(category, city);
  } catch { /* ignore */ }

  const signal = externalContext?.signals[0]?.data;
  const internalScore = scoreInternal(internalCount, category);
  const externalScore = externalContext?.signals[0]?.score ?? scoreInferred("Pas de données externes", 0);

  const enriched: EnrichedCategoryInsight = {
    category,
    internalCount,
    internalAvgPriceCents: avgPriceCents,
    externalDemand: signal?.demandLevel ?? "UNKNOWN",
    externalTrend: signal?.trend ?? "UNKNOWN",
    externalPriceRange: signal?.priceRange ?? null,
    seasonalNote: signal?.seasonalNote ?? null,
    competitorDensity: signal?.competitorDensity ?? "UNKNOWN",
    insight: signal?.insight ?? `${internalCount} annonces "${category}" à ${city}`,
  };

  // Enrich with fusion intelligence (best-effort)
  try {
    const fused = await getFusedIntelligence(category, "CD", city);
    if (fused.confidence > 20) {
      enriched.fusedOpportunityScore = fused.opportunityScore;
      enriched.fusedTriggers = fused.activeTriggers.map((t) => t.trigger);
      enriched.fusedPricingAdjustment = fused.pricingAdjustmentPercent;
    }
  } catch { /* fusion non critique */ }

  return withScore(enriched, scoreHybrid(internalScore, externalScore));
}
