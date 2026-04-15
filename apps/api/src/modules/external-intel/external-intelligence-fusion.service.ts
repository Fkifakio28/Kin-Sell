/**
 * EXTERNAL INTELLIGENCE FUSION SERVICE — Kin-Sell
 *
 * Fusionne signaux internes Kin-Sell + commerce externes + emploi + saisonnier
 * en un score d'opportunité unique (0-100) avec forecasts et triggers.
 *
 * Formule pondérée :
 *  - 40% signaux internes Kin-Sell (transactions, négociations, listings)
 *  - 30% signaux commerce externes (prix, volumes, FX)
 *  - 20% signaux emploi externes (jobs, demande freelance)
 *  - 10% saison/météo/événements
 */

import { prisma } from "../../shared/db/prisma.js";
import { CountryCode } from "../../shared/db/prisma-enums.js";
import type { DetectedTrigger, FusedIntelligence } from "./types.js";
import { AFRICAN_COUNTRIES } from "./types.js";

// ── Internal signal scoring ──

async function computeInternalScore(category: string, countryCode: string, city?: string): Promise<{
  score: number; confidence: number; trend: string; avgPrice: number; volume: number;
  chatSignalScore: number;
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600_000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);

  // Recent internal insights
  const insights = await prisma.internalTransactionInsight.findMany({
    where: {
      category: { equals: category, mode: "insensitive" },
      ...(countryCode ? { countryCode: countryCode as CountryCode } : {}),
      ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
      periodStart: { gte: thirtyDaysAgo },
      periodType: "DAILY",
    },
    orderBy: { periodStart: "desc" },
    take: 30,
  });

  if (insights.length === 0) {
    return { score: 30, confidence: 10, trend: "UNKNOWN", avgPrice: 0, volume: 0, chatSignalScore: 0 };
  }

  const totalVolume = insights.reduce((s, i) => s + i.totalOrders, 0);
  const avgHealth = insights.reduce((s, i) => s + i.marketHealthScore, 0) / insights.length;
  const avgPrice = Math.round(insights.reduce((s, i) => s + i.avgSellingPriceCents, 0) / insights.length);

  // Trend: compare last 7d vs previous 23d
  const recent = insights.filter((i) => i.periodStart >= sevenDaysAgo);
  const older = insights.filter((i) => i.periodStart < sevenDaysAgo);
  const recentAvg = recent.length > 0 ? recent.reduce((s, i) => s + i.totalOrders, 0) / recent.length : 0;
  const olderAvg = older.length > 0 ? older.reduce((s, i) => s + i.totalOrders, 0) / older.length : 0;

  let trend = "STABLE";
  if (olderAvg > 0) {
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    if (change > 15) trend = "RISING";
    else if (change < -15) trend = "DECLINING";
  }

  // Chat signal: count recent messages mentioning this category
  let chatSignalScore = 0;
  try {
    const recentMessages = await prisma.message.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        content: { contains: category, mode: "insensitive" },
      },
    });
    chatSignalScore = Math.min(100, recentMessages * 5);
  } catch { /* messages table might not have good index */ }

  const score = Math.min(100, Math.round(
    avgHealth * 0.4 +
    Math.min(100, totalVolume * 2) * 0.3 +
    (trend === "RISING" ? 80 : trend === "DECLINING" ? 20 : 50) * 0.2 +
    chatSignalScore * 0.1,
  ));

  return { score, confidence: Math.min(100, totalVolume * 3), trend, avgPrice, volume: totalVolume, chatSignalScore };
}

// ── External market signal scoring ──

async function computeExternalMarketScore(category: string, countryCode: string): Promise<{
  score: number; confidence: number; priceIndex: number; fxDelta: number; tradeVolume: number;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);

  const signals = await prisma.externalMarketSignalDaily.findMany({
    where: {
      category: { equals: category, mode: "insensitive" },
      countryCode: countryCode as CountryCode,
      date: { gte: sevenDaysAgo },
    },
    orderBy: { date: "desc" },
  });

  if (signals.length === 0) {
    return { score: 50, confidence: 0, priceIndex: 100, fxDelta: 0, tradeVolume: 0 };
  }

  const priceSignals = signals.filter((s) => s.signalType === "PRICE_INDEX" || s.signalType === "FOOD_PRICE");
  const fxSignals = signals.filter((s) => s.signalType === "FX_RATE");
  const tradeSignals = signals.filter((s) => s.signalType === "TRADE_VOLUME");

  const priceIndex = priceSignals.length > 0
    ? priceSignals.reduce((s, p) => s + p.value, 0) / priceSignals.length
    : 100;

  const fxDelta = fxSignals.length > 0 && fxSignals[0].deltaPercent !== null
    ? fxSignals[0].deltaPercent
    : 0;

  const tradeVolume = tradeSignals.length > 0
    ? tradeSignals.reduce((s, t) => s + t.value, 0) / tradeSignals.length
    : 0;

  const avgConfidence = Math.round(signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length);

  // Score: stable prices + growing trade + stable FX = good opportunity
  const score = Math.min(100, Math.round(
    (priceIndex < 110 ? 60 : priceIndex < 130 ? 40 : 20) * 0.4 +
    (tradeVolume > 0 ? Math.min(80, tradeVolume / 100) : 40) * 0.3 +
    (Math.abs(fxDelta) < 5 ? 70 : Math.abs(fxDelta) < 15 ? 40 : 15) * 0.3,
  ));

  return { score, confidence: avgConfidence, priceIndex, fxDelta, tradeVolume };
}

// ── External job signal scoring ──

async function computeExternalJobScore(category: string, countryCode: string): Promise<{
  score: number; confidence: number; totalJobs: number; topServices: string[];
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);

  const signals = await prisma.externalJobSignalDaily.findMany({
    where: {
      category: { equals: category, mode: "insensitive" },
      countryCode: countryCode as CountryCode,
      date: { gte: sevenDaysAgo },
    },
    orderBy: { jobCount: "desc" },
  });

  if (signals.length === 0) {
    return { score: 40, confidence: 0, totalJobs: 0, topServices: [] };
  }

  const totalJobs = signals.reduce((s, j) => s + j.jobCount, 0);
  const avgConfidence = Math.round(signals.reduce((s, j) => s + j.confidence, 0) / signals.length);
  const risingCount = signals.filter((j) => j.demandTrend === "RISING").length;

  const score = Math.min(100, Math.round(
    Math.min(80, totalJobs * 0.5) * 0.5 +
    (risingCount > signals.length / 2 ? 80 : 50) * 0.3 +
    avgConfidence * 0.2,
  ));

  const topServices = [...new Set(signals.slice(0, 5).map((j) => j.serviceType))];

  return { score, confidence: avgConfidence, totalJobs, topServices };
}

// ── Seasonal signal scoring ──

async function computeSeasonalScore(category: string, countryCode: string): Promise<{
  score: number; confidence: number; priceImpact: number; demandImpact: number;
  activeEvents: string[];
}> {
  const today = new Date();
  const dateStr = today.toISOString().split("T")[0];

  const signals = await prisma.externalSeasonalSignalDaily.findMany({
    where: {
      countryCode: countryCode as CountryCode,
      date: { gte: new Date(dateStr + "T00:00:00.000Z"), lte: new Date(dateStr + "T23:59:59.999Z") },
      OR: [
        { impactCategory: { contains: category, mode: "insensitive" } },
        { impactCategory: null },
      ],
    },
  });

  if (signals.length === 0) {
    return { score: 50, confidence: 20, priceImpact: 0, demandImpact: 0, activeEvents: [] };
  }

  const avgSeverity = signals.reduce((s, sig) => s + sig.severity, 0) / signals.length;
  const avgPriceImpact = signals.reduce((s, sig) => s + sig.priceImpact, 0) / signals.length;
  const avgDemandImpact = signals.reduce((s, sig) => s + sig.demandImpact, 0) / signals.length;
  const avgConfidence = Math.round(signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length);
  const activeEvents = signals.filter((s) => s.eventName).map((s) => s.eventName!).filter((v, i, a) => a.indexOf(v) === i);

  // High demand impact + moderate price impact = opportunity
  const score = Math.min(100, Math.round(
    avgSeverity * 0.3 +
    (avgDemandImpact > 0 ? Math.min(80, avgDemandImpact * 2) : 30) * 0.4 +
    avgConfidence * 0.3,
  ));

  return { score, confidence: avgConfidence, priceImpact: avgPriceImpact, demandImpact: avgDemandImpact, activeEvents };
}

// ── Trigger detection ──

function detectTriggers(
  internal: Awaited<ReturnType<typeof computeInternalScore>>,
  market: Awaited<ReturnType<typeof computeExternalMarketScore>>,
  jobs: Awaited<ReturnType<typeof computeExternalJobScore>>,
  seasonal: Awaited<ReturnType<typeof computeSeasonalScore>>,
  category: string,
  countryCode: string,
  city?: string,
): DetectedTrigger[] {
  const triggers: DetectedTrigger[] = [];

  // SEASONAL_SCHOOL_PEAK
  if (seasonal.activeEvents.some((e) => e.toLowerCase().includes("scolaire") || e.toLowerCase().includes("rentrée"))) {
    triggers.push({
      trigger: "SEASONAL_SCHOOL_PEAK",
      confidence: seasonal.confidence,
      countryCode, city, category,
      severity: 75,
      explanation: `Rentrée scolaire détectée — forte demande ${category}`,
      recommendedAction: "Augmenter stock fournitures/uniformes, booster annonces éducation",
      dataPoints: { events: seasonal.activeEvents, demandImpact: seasonal.demandImpact },
    });
  }

  // RELIGIOUS_EVENT_SPIKE
  if (seasonal.activeEvents.some((e) => ["ramadan", "aïd", "pâques", "noël"].some((r) => e.toLowerCase().includes(r)))) {
    triggers.push({
      trigger: "RELIGIOUS_EVENT_SPIKE",
      confidence: seasonal.confidence,
      countryCode, city, category,
      severity: 80,
      explanation: `Événement religieux actif: ${seasonal.activeEvents.join(", ")}`,
      recommendedAction: "Adapter prix alimentaire/textile, campagnes promotion ciblées",
      dataPoints: { events: seasonal.activeEvents, priceImpact: seasonal.priceImpact, demandImpact: seasonal.demandImpact },
    });
  }

  // RAINY_SEASON_SERVICE_SURGE
  if (seasonal.activeEvents.some((e) => e.toLowerCase().includes("pluie") || e.toLowerCase().includes("fortes"))) {
    triggers.push({
      trigger: "RAINY_SEASON_SERVICE_SURGE",
      confidence: seasonal.confidence,
      countryCode, city, category,
      severity: 60,
      explanation: "Saison des pluies — demande accrue en services (toiture, plomberie, livraison)",
      recommendedAction: "Booster offres services urbains, adapter tarifs livraison",
      dataPoints: { events: seasonal.activeEvents },
    });
  }

  // HARVEST_SUPPLY_GLUT
  if (seasonal.activeEvents.some((e) => e.toLowerCase().includes("récolte")) && seasonal.priceImpact < -5) {
    triggers.push({
      trigger: "HARVEST_SUPPLY_GLUT",
      confidence: seasonal.confidence,
      countryCode, city, category: "Agriculture",
      severity: 55,
      explanation: "Période de récolte — surplus offre, prix en baisse",
      recommendedAction: "Baisser marges produits agricoles, accélérer volume, promotions bulk",
      dataPoints: { priceImpact: seasonal.priceImpact },
    });
  }

  // CROSS_BORDER_ROUTE_OPPORTUNITY
  if (market.tradeVolume > 0 && internal.volume > 5) {
    // Check if neighbor countries have different demand levels
    triggers.push({
      trigger: "CROSS_BORDER_ROUTE_OPPORTUNITY",
      confidence: Math.min(market.confidence, internal.confidence),
      countryCode, city, category,
      severity: 50,
      explanation: `Flux commerciaux détectés pour ${category} — opportunité cross-border`,
      recommendedAction: "Proposer livraison inter-pays, adapter devise et prix",
      dataPoints: { tradeVolume: market.tradeVolume },
    });
  }

  // JOB_SKILL_DEMAND_SPIKE
  if (jobs.totalJobs > 50 && jobs.score > 60) {
    triggers.push({
      trigger: "JOB_SKILL_DEMAND_SPIKE",
      confidence: jobs.confidence,
      countryCode, city, category,
      severity: 65,
      explanation: `Forte demande emploi détectée: ${jobs.topServices.join(", ")}`,
      recommendedAction: "Créer offres services freelance, booster profils métiers demandés",
      dataPoints: { totalJobs: jobs.totalJobs, topServices: jobs.topServices },
    });
  }

  // CURRENCY_SHOCK_REPRICING
  if (Math.abs(market.fxDelta) > 10) {
    triggers.push({
      trigger: "CURRENCY_SHOCK_REPRICING",
      confidence: market.confidence,
      countryCode, city, category,
      severity: Math.min(90, Math.round(Math.abs(market.fxDelta) * 3)),
      explanation: `Choc devise détecté: ${market.fxDelta > 0 ? "dévaluation" : "appréciation"} de ${Math.abs(market.fxDelta).toFixed(1)}%`,
      recommendedAction: "Ajuster prix en devise locale, alerter vendeurs, geler promotions",
      dataPoints: { fxDelta: market.fxDelta },
    });
  }

  // TOURISM_WINDOW_PROMO
  if (seasonal.activeEvents.some((e) => e.toLowerCase().includes("touris"))) {
    triggers.push({
      trigger: "TOURISM_WINDOW_PROMO",
      confidence: seasonal.confidence,
      countryCode, city, category,
      severity: 55,
      explanation: "Fenêtre touristique active — demande accrue restauration/transport/artisanat",
      recommendedAction: "Booster annonces restauration/mobilité, étiquetage bilingue",
      dataPoints: { events: seasonal.activeEvents },
    });
  }

  // WEEKEND_CITY_MICROPEAK — day-of-week based
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 5 || dayOfWeek === 6) { // Friday or Saturday
    triggers.push({
      trigger: "WEEKEND_CITY_MICROPEAK",
      confidence: 70,
      countryCode, city, category,
      severity: 40,
      explanation: "Pic weekend détecté — activité commerce accentuée",
      recommendedAction: "Programmer publications et ADS ce weekend, offres flash",
      dataPoints: { dayOfWeek },
    });
  }

  // INTERNAL_CHAT_SIGNAL_BREAKOUT
  if (internal.chatSignalScore > 40) {
    triggers.push({
      trigger: "INTERNAL_CHAT_SIGNAL_BREAKOUT",
      confidence: Math.min(80, internal.chatSignalScore),
      countryCode, city, category,
      severity: internal.chatSignalScore,
      explanation: `Hausse de conversations internes mentionnant "${category}" (score: ${internal.chatSignalScore})`,
      recommendedAction: "Créer offres ciblées dans cette catégorie, notifier vendeurs",
      dataPoints: { chatSignalScore: internal.chatSignalScore },
    });
  }

  return triggers;
}

// ── Main fusion function ──

export async function getFusedIntelligence(
  category: string,
  countryCode: string,
  city?: string,
): Promise<FusedIntelligence> {
  const [internal, market, jobs, seasonal] = await Promise.all([
    computeInternalScore(category, countryCode, city),
    computeExternalMarketScore(category, countryCode),
    computeExternalJobScore(category, countryCode),
    computeSeasonalScore(category, countryCode),
  ]);

  // Pondération: 40% interne, 30% commerce, 20% emploi, 10% saisonnier
  const opportunityScore = Math.round(
    internal.score * 0.40 +
    market.score * 0.30 +
    jobs.score * 0.20 +
    seasonal.score * 0.10,
  );

  // Demand forecasts
  const demandForecast7d = internal.trend === "RISING" || seasonal.demandImpact > 20
    ? "RISING" as const
    : internal.trend === "DECLINING" && seasonal.demandImpact < -10
      ? "DECLINING" as const
      : "STABLE" as const;

  const demandForecast30d = market.score > 60 && jobs.score > 50
    ? "RISING" as const
    : market.score < 30 || market.fxDelta > 15
      ? "DECLINING" as const
      : "STABLE" as const;

  // Recommended countries (by opportunity)
  const countryScores: Array<{ code: string; score: number }> = [];
  for (const code of Object.keys(AFRICAN_COUNTRIES)) {
    if (code === countryCode) {
      countryScores.push({ code, score: opportunityScore });
    } else {
      // Quick score for other countries based on available data
      const otherMarket = await computeExternalMarketScore(category, code);
      countryScores.push({ code, score: otherMarket.score });
    }
  }
  countryScores.sort((a, b) => b.score - a.score);
  const recommendedCountries = countryScores.slice(0, 3).map((c) => c.code);

  // Recommended cities
  const meta = AFRICAN_COUNTRIES[countryCode];
  const recommendedCities = meta ? [meta.capital] : [];
  if (city && !recommendedCities.includes(city)) recommendedCities.push(city);

  // Publish windows
  const publishWindows: string[] = [];
  if (seasonal.demandImpact > 15) publishWindows.push("MAINTENANT — pic saisonnier actif");
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek <= 3) publishWindows.push("Publier avant vendredi pour capter le pic weekend");
  if (publishWindows.length === 0) publishWindows.push("Publication standard recommandée");

  // Pricing adjustment
  let pricingAdjustment = 0;
  if (seasonal.priceImpact !== 0) pricingAdjustment += seasonal.priceImpact * 0.3;
  if (market.fxDelta > 5) pricingAdjustment += market.fxDelta * 0.2;
  if (internal.trend === "RISING") pricingAdjustment += 5;
  if (internal.trend === "DECLINING") pricingAdjustment -= 5;
  pricingAdjustment = Math.round(Math.max(-25, Math.min(30, pricingAdjustment)) * 10) / 10;

  // Triggers
  const activeTriggers = detectTriggers(internal, market, jobs, seasonal, category, countryCode, city);

  // Confidence composite
  const confidence = Math.round(
    internal.confidence * 0.40 +
    market.confidence * 0.30 +
    jobs.confidence * 0.20 +
    seasonal.confidence * 0.10,
  );

  // Source attribution
  const sources: string[] = [];
  if (internal.confidence > 0) sources.push("Kin-Sell interne");
  if (market.confidence > 0) sources.push("World Bank", "FAOSTAT", "UN Comtrade", "ECB FX");
  if (jobs.confidence > 0) sources.push("ILO", "Jooble", "Adzuna");
  if (seasonal.confidence > 0) sources.push("Open-Meteo", "Calendrier saisonnier");

  // Explanation
  const parts: string[] = [];
  parts.push(`Score opportunité: ${opportunityScore}/100`);
  if (activeTriggers.length > 0) parts.push(`Triggers actifs: ${activeTriggers.map((t) => t.trigger).join(", ")}`);
  if (pricingAdjustment !== 0) parts.push(`Ajustement prix suggéré: ${pricingAdjustment > 0 ? "+" : ""}${pricingAdjustment}%`);
  if (seasonal.activeEvents.length > 0) parts.push(`Événements: ${seasonal.activeEvents.join(", ")}`);

  return {
    opportunityScore,
    demandForecast7d,
    demandForecast30d,
    recommendedCountries,
    recommendedCities,
    recommendedPublishWindows: publishWindows,
    pricingAdjustmentPercent: pricingAdjustment,
    activeTriggers,
    explanation: parts.join(". "),
    sourceAttribution: sources,
    confidence,
    computedAt: new Date().toISOString(),
  };
}

// ── Jobs demand API ──

export async function getJobsDemand(countryCode: string, serviceType?: string): Promise<{
  signals: Array<{ serviceType: string; jobCount: number; demandTrend: string; avgSalaryUsd?: number; confidence: number }>;
  summary: string;
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);

  const where: any = {
    countryCode: countryCode as CountryCode,
    date: { gte: sevenDaysAgo },
  };
  if (serviceType) where.serviceType = { equals: serviceType, mode: "insensitive" };

  const signals = await prisma.externalJobSignalDaily.findMany({
    where,
    orderBy: { jobCount: "desc" },
    take: 20,
  });

  const grouped: Record<string, typeof signals> = {};
  for (const s of signals) {
    if (!grouped[s.serviceType]) grouped[s.serviceType] = [];
    grouped[s.serviceType].push(s);
  }

  const result = Object.entries(grouped).map(([type, entries]) => ({
    serviceType: type,
    jobCount: entries.reduce((s, e) => s + e.jobCount, 0),
    demandTrend: entries.filter((e) => e.demandTrend === "RISING").length > entries.length / 2 ? "RISING" : "STABLE",
    avgSalaryUsd: entries.filter((e) => e.avgSalaryUsd !== null).length > 0
      ? Math.round(entries.reduce((s, e) => s + (e.avgSalaryUsd ?? 0), 0) / entries.filter((e) => e.avgSalaryUsd !== null).length)
      : undefined,
    confidence: Math.round(entries.reduce((s, e) => s + e.confidence, 0) / entries.length),
  }));

  return {
    signals: result.sort((a, b) => b.jobCount - a.jobCount),
    summary: result.length > 0
      ? `Top demande emploi ${countryCode}: ${result.slice(0, 3).map((r) => `${r.serviceType} (${r.jobCount})`).join(", ")}`
      : `Aucune donnée emploi disponible pour ${countryCode}`,
  };
}

// ── Seasonal calendar API ──

export async function getSeasonalCalendar(countryCode: string): Promise<{
  events: Array<{ signalType: string; eventName: string | null; severity: number; priceImpact: number; demandImpact: number; impactCategory: string | null; confidence: number }>;
  activeNow: string[];
}> {
  const today = new Date();
  const weekFromNow = new Date(Date.now() + 7 * 24 * 3600_000);

  const signals = await prisma.externalSeasonalSignalDaily.findMany({
    where: {
      countryCode: countryCode as CountryCode,
      date: { gte: today, lte: weekFromNow },
    },
    orderBy: { severity: "desc" },
  });

  const events = signals.map((s) => ({
    signalType: s.signalType,
    eventName: s.eventName,
    severity: s.severity,
    priceImpact: s.priceImpact,
    demandImpact: s.demandImpact,
    impactCategory: s.impactCategory,
    confidence: s.confidence,
  }));

  const activeNow = [...new Set(signals.filter((s) => s.eventName).map((s) => s.eventName!))];

  return { events, activeNow };
}
