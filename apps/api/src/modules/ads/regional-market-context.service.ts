/**
 * Regional Market Context Service — Kin-Sell
 *
 * Uses Google Gemini API with grounding (Google Search) to fetch
 * real-time regional market intelligence for Kinshasa and DRC.
 *
 * Provides:
 *   - Regional price benchmarks for categories
 *   - Market trends and seasonal patterns
 *   - Competitor landscape signals
 *   - Supply/demand indicators
 *
 * All data is tagged with source attribution (EXTERNAL) and confidence scores.
 * Results are cached in Redis for 6 hours to minimize API calls.
 */

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { getRedis } from "../../shared/db/redis.js";
import {
  scoreExternal,
  scoreInferred,
  withScore,
  type ConfidenceScore,
  type ScoredInsight,
} from "../analytics/confidence-score.service.js";

// ── Types ──────────────────────────────────────────────────

export interface RegionalMarketSignal {
  category: string;
  city: string;
  country: string;
  priceRange: { minUsdCents: number; maxUsdCents: number } | null;
  demandLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  trend: "GROWING" | "STABLE" | "DECLINING" | "UNKNOWN";
  seasonalNote: string | null;
  competitorDensity: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  insight: string;
  sources: string[];
}

export interface RegionalContext {
  signals: ScoredInsight<RegionalMarketSignal>[];
  summary: string;
  generatedAt: string;
  region: string;
}

// ── Cache ──────────────────────────────────────────────────

const CACHE_TTL_SEC = 6 * 3600; // 6 hours
const CACHE_PREFIX = "ks:gemini:market:";

async function getCached(key: string): Promise<RegionalContext | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get(`${CACHE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function setCache(key: string, data: RegionalContext): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(`${CACHE_PREFIX}${key}`, JSON.stringify(data), "EX", CACHE_TTL_SEC);
  } catch { /* ignore */ }
}

// ── Gemini API ─────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    groundingMetadata?: {
      searchEntryPoint?: { renderedContent?: string };
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
}

async function callGemini(prompt: string): Promise<{ text: string; sources: string[]; success: boolean }> {
  if (!env.ENABLE_GEMINI) {
    return { text: "", sources: [], success: false };
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return { text: "", sources: [], success: false };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      logger.warn(`[Gemini] API error: ${response.status}`);
      return { text: "", sources: [], success: false };
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const sources = (data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
      .map(c => c.web?.title ?? c.web?.uri ?? "")
      .filter(Boolean);

    return { text, sources, success: text.length > 10 };
  } catch (err) {
    logger.warn({ err }, "[Gemini] Request failed");
    return { text: "", sources: [], success: false };
  }
}

// ── Public API ─────────────────────────────────────────────

/**
 * Get regional market context for a specific category and city.
 * Uses Gemini with Google Search grounding.
 */
export async function getRegionalMarketContext(
  category: string,
  city: string = "Kinshasa",
  country: string = "RDC",
): Promise<RegionalContext> {
  const cacheKey = `${country}:${city}:${category}`.toLowerCase().replace(/\s+/g, "-");
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const prompt = `Tu es un analyste de marché spécialisé en commerce en ${country}, ville de ${city}.
Analyse le marché actuel pour la catégorie "${category}" et retourne un JSON avec cette structure exacte :
{
  "priceRange": { "minUsd": <number|null>, "maxUsd": <number|null> },
  "demandLevel": "<LOW|MEDIUM|HIGH|UNKNOWN>",
  "trend": "<GROWING|STABLE|DECLINING|UNKNOWN>",
  "seasonalNote": "<string|null>",
  "competitorDensity": "<LOW|MEDIUM|HIGH|UNKNOWN>",
  "insight": "<1-2 phrases résumant le marché actuel pour cette catégorie à ${city}>"
}
Sois factuel et concis. Si tu n'as pas assez de données, utilise UNKNOWN.`;

  const { text, sources, success } = await callGemini(prompt);

  let signal: RegionalMarketSignal;
  let score: ConfidenceScore;

  if (success) {
    try {
      const parsed = JSON.parse(text);
      signal = {
        category,
        city,
        country,
        priceRange: parsed.priceRange?.minUsd != null
          ? { minUsdCents: Math.round(parsed.priceRange.minUsd * 100), maxUsdCents: Math.round((parsed.priceRange.maxUsd ?? parsed.priceRange.minUsd) * 100) }
          : null,
        demandLevel: parsed.demandLevel ?? "UNKNOWN",
        trend: parsed.trend ?? "UNKNOWN",
        seasonalNote: parsed.seasonalNote ?? null,
        competitorDensity: parsed.competitorDensity ?? "UNKNOWN",
        insight: parsed.insight ?? `Analyse marché ${category} à ${city}`,
        sources,
      };
      score = scoreExternal(true, 0, "Google Search via Gemini");
    } catch {
      signal = buildFallbackSignal(category, city, country);
      score = scoreInferred(`Réponse Gemini non parsable pour ${category}`, 0);
    }
  } else {
    signal = buildFallbackSignal(category, city, country);
    score = scoreInferred(`Données externes non disponibles pour ${category} à ${city}`, 0);
  }

  const result: RegionalContext = {
    signals: [withScore(signal, score)],
    summary: signal.insight,
    generatedAt: new Date().toISOString(),
    region: `${city}, ${country}`,
  };

  await setCache(cacheKey, result);
  return result;
}

/**
 * Get market context for multiple categories at once.
 */
export async function getMultiCategoryContext(
  categories: string[],
  city: string = "Kinshasa",
  country: string = "RDC",
): Promise<RegionalContext> {
  const cacheKey = `${country}:${city}:multi:${categories.sort().join(",")}`.toLowerCase().replace(/\s+/g, "-");
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const prompt = `Tu es un analyste de marché spécialisé en commerce en ${country}, ville de ${city}.
Analyse le marché actuel pour ces catégories : ${categories.join(", ")}.
Retourne un JSON avec cette structure :
{
  "categories": [
    {
      "name": "<catégorie>",
      "demandLevel": "<LOW|MEDIUM|HIGH|UNKNOWN>",
      "trend": "<GROWING|STABLE|DECLINING|UNKNOWN>",
      "insight": "<1 phrase>"
    }
  ],
  "summary": "<résumé global 2-3 phrases du marché à ${city}>"
}
Sois factuel et concis.`;

  const { text, sources, success } = await callGemini(prompt);
  const signals: ScoredInsight<RegionalMarketSignal>[] = [];

  if (success) {
    try {
      const parsed = JSON.parse(text);
      for (const cat of (parsed.categories ?? [])) {
        signals.push(withScore(
          {
            category: cat.name,
            city,
            country,
            priceRange: null,
            demandLevel: cat.demandLevel ?? "UNKNOWN",
            trend: cat.trend ?? "UNKNOWN",
            seasonalNote: null,
            competitorDensity: "UNKNOWN",
            insight: cat.insight ?? "",
            sources,
          },
          scoreExternal(true, 0, "Google Search via Gemini"),
        ));
      }

      const result: RegionalContext = {
        signals,
        summary: parsed.summary ?? `Analyse marché ${city}`,
        generatedAt: new Date().toISOString(),
        region: `${city}, ${country}`,
      };
      await setCache(cacheKey, result);
      return result;
    } catch { /* fall through to fallback */ }
  }

  // Fallback
  for (const cat of categories) {
    signals.push(withScore(
      buildFallbackSignal(cat, city, country),
      scoreInferred(`Données non disponibles pour ${cat}`, 0),
    ));
  }

  return {
    signals,
    summary: `Données de marché non disponibles pour ${city}`,
    generatedAt: new Date().toISOString(),
    region: `${city}, ${country}`,
  };
}

// ── Helpers ────────────────────────────────────────────────

function buildFallbackSignal(category: string, city: string, country: string): RegionalMarketSignal {
  return {
    category,
    city,
    country,
    priceRange: null,
    demandLevel: "UNKNOWN",
    trend: "UNKNOWN",
    seasonalNote: null,
    competitorDensity: "UNKNOWN",
    insight: `Données de marché externe non disponibles pour "${category}" à ${city}`,
    sources: [],
  };
}
