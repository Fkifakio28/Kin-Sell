/**
 * MARKET ENRICHMENT SERVICE — Kin-Sell
 *
 * Stratégie à 3 niveaux pour minimiser les appels Gemini :
 *
 *   Niveau 1 — INTERNAL         : Rule-based pur (données Prisma)
 *              → Utilisé quand les données internes sont suffisantes
 *   Niveau 2 — CACHED_EXTERNAL  : Enrichissement Gemini déjà en cache Redis/mémoire
 *              → Réutilise un résultat précédent sans appel API
 *   Niveau 3 — EXTERNAL (Gemini): Appel API en dernier recours
 *              → Seulement si confiance interne faible / catégorie rare / ville rare
 *
 * Conditions d'appel Gemini (Niveau 3) :
 *   - Confiance interne < 40
 *   - Catégorie rare (< 3 annonces actives)
 *   - Ville rare (≠ Kinshasa et aucun historique local)
 *   - Historique insuffisant (< 3 négociations 30j)
 *   - Cas ambigu (scores internes contradictoires)
 *
 * Chaque décision est journalisée avec raison métier.
 *
 * Scores calculés :
 *   - marketHeatScore       : 0-100 — chaleur du marché (activité négo + demande)
 *   - priceFlexibilityScore : 0-100 — flexibilité des prix (historique remises)
 *   - regionalDemandScore   : 0-100 — demande régionale (interne + externe Gemini)
 *   - competitionPressureScore : 0-100 — pression concurrentielle
 */

import { prisma } from "../db/prisma.js";
import { getRedis } from "../db/redis.js";
import { getMarketDemand, getMarketMedian } from "./market-shared.js";
import { getRegionalMarketContext } from "../../modules/ads/regional-market-context.service.js";
import { logger } from "../logger.js";

// ── Types ──────────────────────────────────────────────────

export type EnrichmentSourceType = "INTERNAL" | "EXTERNAL" | "HYBRID" | "FALLBACK";

export interface MarketEnrichment {
  category: string;
  city: string;
  /** Chaleur du marché — activité négo + demande (0-100) */
  marketHeatScore: number;
  /** Flexibilité des prix — historique remises acceptées (0-100) */
  priceFlexibilityScore: number;
  /** Demande régionale — interne + externe Gemini (0-100) */
  regionalDemandScore: number;
  /** Pression concurrentielle — nb vendeurs/annonces (0-100) */
  competitionPressureScore: number;
  /** Score composite global (0-100) */
  compositeScore: number;
  /** Données brutes internes utilisées */
  internalData: {
    activeListings: number;
    activeSellers: number;
    avgDiscountPercent: number;
    negoVolumeRatio: number;
    medianPriceCents: number;
  };
  /** Données externes (Gemini) si disponibles */
  externalData: {
    demandLevel: string;
    trend: string;
    competitorDensity: string;
    insight: string;
  } | null;
  /** Source des données (INTERNAL / EXTERNAL / HYBRID / FALLBACK) */
  sourceType: EnrichmentSourceType;
  /** Score de confiance 0-100 — reflète la fiabilité des données */
  confidenceScore: number;
  /** Fraîcheur des données ("LIVE" | "CACHED" | "STALE") */
  dataFreshness: "LIVE" | "CACHED" | "STALE";
  /** Indique si un fallback a été utilisé */
  fallbackUsed: boolean;
  /** Horodatage */
  computedAt: string;
  /** @deprecated — utiliser sourceType à la place */
  source: "INTERNAL" | "HYBRID";
  /** Raison de la décision Gemini (appelé / évité / cache) */
  geminiDecision?: EnrichmentDecision;
}

// ── Enrichment Gating — Stratégie 3 niveaux ───────────────

export type EnrichmentTier = "INTERNAL" | "CACHED_EXTERNAL" | "EXTERNAL";

export interface EnrichmentDecision {
  /** Niveau retenu */
  tier: EnrichmentTier;
  /** Raison métier lisible */
  reason: string;
  /** Gemini a-t-il été appelé ? */
  geminiCalled: boolean;
  /** Gemini était-il disponible en cache ? */
  geminiCacheHit: boolean;
  /** Facteurs ayant influencé la décision */
  factors: {
    internalConfidence: number;      // 0-100
    activeListings: number;
    totalNegos30d: number;
    isRareCategory: boolean;
    isRareCity: boolean;
    isAmbiguous: boolean;
    hasHistoryGap: boolean;
  };
}

// ── Métriques simples (en mémoire, reset au restart) ──────

export interface EnrichmentMetrics {
  totalCalls: number;
  internalOnly: number;
  cachedExternal: number;
  geminiCalled: number;
  geminiFailed: number;
  geminiBlocked: number;
  avgInternalConfidence: number;
  lastResetAt: string;
}

const _metrics: EnrichmentMetrics = {
  totalCalls: 0,
  internalOnly: 0,
  cachedExternal: 0,
  geminiCalled: 0,
  geminiFailed: 0,
  geminiBlocked: 0,
  avgInternalConfidence: 0,
  lastResetAt: new Date().toISOString(),
};

let _confidenceSum = 0;

/** Retourne les métriques d'enrichissement courantes */
export function getEnrichmentMetrics(): EnrichmentMetrics {
  return { ..._metrics };
}

/** Reset les métriques (appelable par admin) */
export function resetEnrichmentMetrics(): void {
  _metrics.totalCalls = 0;
  _metrics.internalOnly = 0;
  _metrics.cachedExternal = 0;
  _metrics.geminiCalled = 0;
  _metrics.geminiFailed = 0;
  _metrics.geminiBlocked = 0;
  _metrics.avgInternalConfidence = 0;
  _confidenceSum = 0;
  _metrics.lastResetAt = new Date().toISOString();
}

function trackMetric(tier: EnrichmentTier, geminiFailed: boolean, confidence: number): void {
  _metrics.totalCalls++;
  _confidenceSum += confidence;
  _metrics.avgInternalConfidence = Math.round(_confidenceSum / _metrics.totalCalls);
  if (tier === "INTERNAL") _metrics.internalOnly++;
  else if (tier === "CACHED_EXTERNAL") _metrics.cachedExternal++;
  else if (tier === "EXTERNAL") {
    _metrics.geminiCalled++;
    if (geminiFailed) _metrics.geminiFailed++;
  }
}

// ── Gemini-specific cache (pour le Niveau 2) ──────────────
// Permet de vérifier si du contenu Gemini existe en cache
// SANS déclencher un appel API

const GEMINI_CACHE_PREFIX = "ks:gemini:market:";

async function hasGeminiCache(category: string, city: string, country: string = "rdc"): Promise<boolean> {
  const cacheKey = `${country}:${city}:${category}`.toLowerCase().replace(/\s+/g, "-");
  try {
    const redis = getRedis();
    if (redis) {
      const exists = await redis.exists(`${GEMINI_CACHE_PREFIX}${cacheKey}`);
      return exists === 1;
    }
  } catch { /* ignore */ }
  return false;
}

// ── Seuils de la stratégie 3 niveaux ──────────────────────

/** Confiance interne minimale pour éviter Gemini */
const CONFIDENCE_THRESHOLD = 40;
/** Nombre minimal d'annonces pour considérer la catégorie comme connue */
const MIN_LISTINGS_KNOWN = 3;
/** Nombre minimal de négociations 30j pour considérer l'historique suffisant */
const MIN_NEGOS_SUFFICIENT = 3;
/** Ville principale — les autres sont considérées "rares" */
const PRIMARY_CITY = "kinshasa";

/**
 * Détermine si l'enrichissement externe (Gemini) est nécessaire.
 *
 * Retourne la décision avec la raison métier.
 * L'appelant utilise cette décision pour choisir le niveau d'enrichissement.
 *
 * Cas où Gemini est AUTORISÉ :
 *   - Confiance interne faible (< 40)
 *   - Catégorie rare (< 3 annonces actives)
 *   - Ville rare (≠ Kinshasa)
 *   - Historique insuffisant (< 3 négociations 30j)
 *   - Cas ambigu (heat > 50 mais demande < 20 ou inverse)
 *
 * Cas où Gemini est BLOQUÉ :
 *   - Confiance interne >= 40 ET catégorie connue ET ville connue ET historique suffisant
 *   - env.ENABLE_GEMINI === false
 *   - Pas de clé API Gemini
 */
export async function shouldUseExternalEnrichment(
  internalData: {
    activeListings: number;
    totalNegos: number;
    demandScore: number;
    activeSellers: number;
  },
  category: string,
  city: string,
): Promise<EnrichmentDecision> {
  const isRareCategory = internalData.activeListings < MIN_LISTINGS_KNOWN;
  const isRareCity = city.toLowerCase() !== PRIMARY_CITY;
  const hasHistoryGap = internalData.totalNegos < MIN_NEGOS_SUFFICIENT;

  // Confiance interne brute : basée sur volume de données
  const internalConfidence = Math.min(100, Math.round(
    internalData.totalNegos * 2 + internalData.activeListings * 3 + internalData.activeSellers * 5,
  ));

  // Détection d'ambiguïté : scores contradictoires
  //   → heat élevé mais demande basse (ou inverse) indique des données incohérentes
  const heatProxy = Math.min(100, internalData.totalNegos * 2);
  const isAmbiguous = (heatProxy > 50 && internalData.demandScore < 20) ||
                      (heatProxy < 20 && internalData.demandScore > 50);

  const factors = {
    internalConfidence,
    activeListings: internalData.activeListings,
    totalNegos30d: internalData.totalNegos,
    isRareCategory,
    isRareCity,
    isAmbiguous,
    hasHistoryGap,
  };

  // ── Décision ──

  // Si données internes solides et pas de cas rare → INTERNAL suffit
  if (internalConfidence >= CONFIDENCE_THRESHOLD && !isRareCategory && !isRareCity && !hasHistoryGap && !isAmbiguous) {
    return {
      tier: "INTERNAL",
      reason: `Données internes suffisantes (confiance=${internalConfidence}, listings=${internalData.activeListings}, negos=${internalData.totalNegos})`,
      geminiCalled: false,
      geminiCacheHit: false,
      factors,
    };
  }

  // Vérifier si un résultat Gemini est déjà en cache
  const hasCachedGemini = await hasGeminiCache(category, city);
  if (hasCachedGemini) {
    return {
      tier: "CACHED_EXTERNAL",
      reason: `Cache Gemini disponible — réutilisation sans appel API (confiance interne=${internalConfidence})`,
      geminiCalled: false,
      geminiCacheHit: true,
      factors,
    };
  }

  // Construire la raison spécifique
  const reasons: string[] = [];
  if (internalConfidence < CONFIDENCE_THRESHOLD) reasons.push(`confiance faible (${internalConfidence})`);
  if (isRareCategory) reasons.push(`catégorie rare (${internalData.activeListings} annonces)`);
  if (isRareCity) reasons.push(`ville hors Kinshasa (${city})`);
  if (hasHistoryGap) reasons.push(`historique insuffisant (${internalData.totalNegos} négos)`);
  if (isAmbiguous) reasons.push(`données contradictoires (heat~${heatProxy} vs demand~${internalData.demandScore})`);

  return {
    tier: "EXTERNAL",
    reason: `Gemini nécessaire — ${reasons.join(", ")}`,
    geminiCalled: true,
    geminiCacheHit: false,
    factors,
  };
}

// ── Cache (Redis + in-memory fallback) ─────────────────────

const ENRICHMENT_CACHE_PREFIX = "ks:enrichment:";
// TTL dynamique : marché chaud 1h, normal 6h, lent 12h (déterminé à la mise en cache)
const TTL_HOT = 3600;      // 1h
const TTL_NORMAL = 21600;  // 6h
const TTL_SLOW = 43200;    // 12h

/** Fallback mémoire locale si Redis est indisponible */
const memoryCache = new Map<string, { data: MarketEnrichment; expiresAt: number }>();
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000; // 30min

function chooseTtl(compositeScore: number): number {
  if (compositeScore >= 60) return TTL_HOT;
  if (compositeScore >= 30) return TTL_NORMAL;
  return TTL_SLOW;
}

async function getCached(key: string): Promise<{ data: MarketEnrichment; fromMemory: boolean } | null> {
  // 1. Essayer Redis
  try {
    const redis = getRedis();
    if (redis) {
      const raw = await redis.get(`${ENRICHMENT_CACHE_PREFIX}${key}`);
      if (raw) return { data: JSON.parse(raw), fromMemory: false };
    }
  } catch { /* Redis indisponible, fallback mémoire */ }

  // 2. Fallback mémoire locale
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    return { data: mem.data, fromMemory: true };
  }
  if (mem) memoryCache.delete(key);
  return null;
}

async function setCache(key: string, data: MarketEnrichment): Promise<void> {
  const ttl = chooseTtl(data.compositeScore);

  // 1. Toujours sauvegarder en mémoire locale (filet de sécurité)
  memoryCache.set(key, { data, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS });

  // 2. Essayer Redis
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(`${ENRICHMENT_CACHE_PREFIX}${key}`, JSON.stringify(data), "EX", ttl);
  } catch { /* ignore, fallback mémoire ok */ }
}

// ── Calcul interne ─────────────────────────────────────────

async function computeInternalScores(category: string, city: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    activeListings,
    sellers,
    acceptedNegos,
    totalNegos,
    demandData,
    medianData,
  ] = await Promise.all([
    prisma.listing.count({
      where: { category, status: "ACTIVE", city: { equals: city, mode: "insensitive" } },
    }),
    prisma.listing.groupBy({
      by: ["ownerUserId"],
      where: { category, status: "ACTIVE", city: { equals: city, mode: "insensitive" } },
    }),
    prisma.negotiation.findMany({
      where: {
        listing: { category, city: { equals: city, mode: "insensitive" } },
        status: "ACCEPTED",
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { originalPriceUsdCents: true, finalPriceUsdCents: true },
      take: 200,
    }),
    prisma.negotiation.count({
      where: {
        listing: { category, city: { equals: city, mode: "insensitive" } },
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    getMarketDemand(category),
    getMarketMedian(category, city),
  ]);

  // Avg discount
  const validNegos = acceptedNegos.filter((n) => n.finalPriceUsdCents && n.finalPriceUsdCents > 0);
  const avgDiscountPercent = validNegos.length > 0
    ? Math.round(
        validNegos.reduce(
          (s, n) => s + ((n.originalPriceUsdCents - n.finalPriceUsdCents!) / n.originalPriceUsdCents) * 100,
          0,
        ) / validNegos.length,
      )
    : 15;

  // Négo volume ratio (négos per listing)
  const negoVolumeRatio = activeListings > 0 ? totalNegos / activeListings : 0;

  return {
    activeListings,
    activeSellers: sellers.length,
    avgDiscountPercent,
    negoVolumeRatio,
    totalNegos,
    demandScore: demandData.demandScore,
    demandLevel: demandData.demandLevel,
    medianPriceCents: medianData.medianPriceCents,
    sampleSize: medianData.sampleSize,
  };
}

// ── Score computation ──────────────────────────────────────

function computeMarketHeatScore(negoVolume: number, totalNegos: number, demandScore: number): number {
  // Pondération : 40% volume négo, 30% total négo, 30% demande
  const volumeScore = Math.min(100, negoVolume * 25); // 4 négo/listing = 100
  const negoScore = Math.min(100, totalNegos * 2);     // 50 négo = 100
  const score = Math.round(volumeScore * 0.4 + negoScore * 0.3 + demandScore * 0.3);
  return Math.min(100, Math.max(0, score));
}

function computePriceFlexibilityScore(avgDiscount: number, acceptedCount: number): number {
  // Plus le discount moyen est élevé et les acceptations fréquentes → plus flexible
  const discountScore = Math.min(100, avgDiscount * 4); // 25% discount = 100
  const volumeBonus = Math.min(20, acceptedCount); // bonus max 20 pour le volume
  const score = Math.round(discountScore * 0.8 + volumeBonus);
  return Math.min(100, Math.max(0, score));
}

function computeCompetitionPressureScore(
  listings: number,
  sellers: number,
  externalDensity: string | null,
): number {
  // Interne : nombre d'annonces et de vendeurs
  const listingScore = Math.min(100, listings * 3); // 33+ annonces = 100
  const sellerScore = Math.min(100, sellers * 5);   // 20+ vendeurs = 100
  let internalScore = Math.round((listingScore + sellerScore) / 2);

  // Bonus externe Gemini
  if (externalDensity === "HIGH") internalScore = Math.min(100, internalScore + 15);
  else if (externalDensity === "MEDIUM") internalScore = Math.min(100, internalScore + 5);

  return Math.min(100, Math.max(0, internalScore));
}

function computeRegionalDemandScore(
  internalDemandScore: number,
  externalDemand: string | null,
  externalTrend: string | null,
): number {
  let score = internalDemandScore;

  // Ajustement externe
  if (externalDemand === "HIGH") score = Math.min(100, score + 15);
  else if (externalDemand === "MEDIUM") score = Math.min(100, score + 5);
  else if (externalDemand === "LOW") score = Math.max(0, score - 10);

  // Tendance
  if (externalTrend === "GROWING") score = Math.min(100, score + 10);
  else if (externalTrend === "DECLINING") score = Math.max(0, score - 10);

  return Math.min(100, Math.max(0, score));
}

// ── Public API ─────────────────────────────────────────────

/**
 * Retourne l'enrichissement marché pour une catégorie + ville.
 *
 * Stratégie 3 niveaux :
 *   1. INTERNAL         — données Prisma suffisantes → pas d'appel Gemini
 *   2. CACHED_EXTERNAL  — résultat Gemini déjà en cache Redis → réutilisation
 *   3. EXTERNAL         — appel Gemini en dernier recours (cas rares / confiance faible)
 *
 * Résultat mis en cache Redis avec TTL dynamique.
 */
export async function getMarketEnrichment(
  category: string,
  city: string = "Kinshasa",
): Promise<MarketEnrichment> {
  const cacheKey = `${city}:${category}`.toLowerCase().replace(/\s+/g, "-");
  const cached = await getCached(cacheKey);
  if (cached) {
    const data = { ...cached.data };
    data.dataFreshness = cached.fromMemory ? "STALE" : "CACHED";
    return data;
  }

  // ── Niveau 1 : Données internes (toujours calculées) ──
  const internal = await computeInternalScores(category, city);

  // ── Décision : faut-il appeler Gemini ? ──
  const decision = await shouldUseExternalEnrichment(
    {
      activeListings: internal.activeListings,
      totalNegos: internal.totalNegos,
      demandScore: internal.demandScore,
      activeSellers: internal.activeSellers,
    },
    category,
    city,
  );

  // ── Niveau 2 & 3 : Enrichissement externe (si nécessaire) ──
  let externalData: MarketEnrichment["externalData"] = null;
  let geminiFailed = false;

  if (decision.tier === "CACHED_EXTERNAL" || decision.tier === "EXTERNAL") {
    try {
      const ctx = await getRegionalMarketContext(category, city);
      const signal = ctx.signals[0]?.data;
      if (signal && signal.demandLevel !== "UNKNOWN") {
        externalData = {
          demandLevel: signal.demandLevel,
          trend: signal.trend,
          competitorDensity: signal.competitorDensity,
          insight: signal.insight,
        };
      }
    } catch (err) {
      logger.warn({ err }, `[Enrichment] Gemini indisponible pour ${category}/${city}`);
      geminiFailed = true;
    }
  }

  // ── Log métier de la décision ──
  const wasGeminiActuallyCalled = decision.tier === "EXTERNAL" && !geminiFailed;
  logger.info(
    {
      tier: decision.tier,
      reason: decision.reason,
      geminiCalled: decision.tier === "EXTERNAL",
      geminiCacheHit: decision.tier === "CACHED_EXTERNAL",
      geminiFailed,
      category,
      city,
      internalConfidence: decision.factors.internalConfidence,
      activeListings: internal.activeListings,
      totalNegos: internal.totalNegos,
    },
    `[Enrichment] ${decision.tier} — ${category}/${city} — ${decision.reason}`,
  );

  // ── Métriques ──
  trackMetric(decision.tier, geminiFailed, decision.factors.internalConfidence);
  if (decision.tier === "INTERNAL") _metrics.geminiBlocked++;

  // ── Calcul des scores ──
  const marketHeatScore = computeMarketHeatScore(
    internal.negoVolumeRatio,
    internal.totalNegos,
    internal.demandScore,
  );

  const priceFlexibilityScore = computePriceFlexibilityScore(
    internal.avgDiscountPercent,
    internal.totalNegos,
  );

  const competitionPressureScore = computeCompetitionPressureScore(
    internal.activeListings,
    internal.activeSellers,
    externalData?.competitorDensity ?? null,
  );

  const regionalDemandScore = computeRegionalDemandScore(
    internal.demandScore,
    externalData?.demandLevel ?? null,
    externalData?.trend ?? null,
  );

  const compositeScore = Math.round(
    marketHeatScore * 0.3 +
    priceFlexibilityScore * 0.2 +
    regionalDemandScore * 0.3 +
    competitionPressureScore * 0.2,
  );

  // ── SourceType + Confidence ──
  let sourceType: EnrichmentSourceType;
  let confidenceScore: number;
  const fallbackUsed = geminiFailed || (decision.tier !== "INTERNAL" && !externalData);

  if (externalData) {
    sourceType = "HYBRID";
    const internalStrength = Math.min(100, internal.totalNegos * 2 + internal.activeListings * 3);
    confidenceScore = Math.min(95, Math.round(internalStrength * 0.5 + 50));
  } else if (geminiFailed) {
    sourceType = "FALLBACK";
    const internalStrength = Math.min(100, internal.totalNegos * 2 + internal.activeListings * 3);
    confidenceScore = Math.round(Math.max(20, internalStrength * 0.6));
  } else {
    sourceType = "INTERNAL";
    const internalStrength = Math.min(100, internal.totalNegos * 2 + internal.activeListings * 3);
    confidenceScore = Math.round(Math.max(25, internalStrength * 0.7));
  }

  const enrichment: MarketEnrichment = {
    category,
    city,
    marketHeatScore,
    priceFlexibilityScore,
    regionalDemandScore,
    competitionPressureScore,
    compositeScore,
    internalData: {
      activeListings: internal.activeListings,
      activeSellers: internal.activeSellers,
      avgDiscountPercent: internal.avgDiscountPercent,
      negoVolumeRatio: internal.negoVolumeRatio,
      medianPriceCents: internal.medianPriceCents,
    },
    externalData,
    sourceType,
    confidenceScore,
    dataFreshness: "LIVE",
    fallbackUsed,
    source: externalData ? "HYBRID" : "INTERNAL",
    computedAt: new Date().toISOString(),
    geminiDecision: decision,
  };

  await setCache(cacheKey, enrichment);
  return enrichment;
}

/**
 * Adaptateur : calcule un ajustement de seuil basé sur les scores d'enrichissement.
 * Retourne des modificateurs que les moteurs IA utilisent.
 */
export function computeAdaptiveThresholds(enrichment: MarketEnrichment) {
  const { marketHeatScore, priceFlexibilityScore, competitionPressureScore, regionalDemandScore } = enrichment;

  // Plancher prix adaptatif : marché chaud + demande forte → plancher plus haut
  const floorAdjust = regionalDemandScore > 70 ? 5 : regionalDemandScore < 30 ? -5 : 0;

  // Discount max adaptatif : marché flexible + compétition forte → plus de marge
  const discountAdjust = priceFlexibilityScore > 60
    ? Math.round((priceFlexibilityScore - 60) / 10)
    : competitionPressureScore > 70 ? 3 : 0;

  // Contre-proposition adaptative : chaleur marché influence le %
  // Marché chaud → contre-offre plus haute; marché froid → plus agressive
  const counterPercent = marketHeatScore > 70
    ? 93
    : marketHeatScore > 50
      ? 90
      : marketHeatScore > 30
        ? 87
        : 85;

  // Seuil confiance auto-validation (commandes)
  const trustThreshold = competitionPressureScore > 70 ? 60 : 70;

  // Seuil montant auto-validation
  const amountThresholdCents = regionalDemandScore > 70
    ? 30000  // $300 en zone forte demande
    : 20000; // $200 par défaut

  return {
    /** Ajustement plancher prix en % (+ = plancher plus haut) */
    floorAdjustPercent: floorAdjust,
    /** Ajustement discount max en % (+ = plus de marge discount) */
    discountAdjustPercent: discountAdjust,
    /** % contre-proposition adaptatif */
    adaptiveCounterPercent: counterPercent,
    /** Seuil trust adaptatif pour auto-validation */
    adaptiveTrustThreshold: trustThreshold,
    /** Seuil montant (cents) pour auto-validation */
    adaptiveAmountThresholdCents: amountThresholdCents,
  };
}
