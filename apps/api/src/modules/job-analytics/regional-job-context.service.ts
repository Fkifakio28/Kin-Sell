/**
 * Regional Job Context Service — Kin-Sell Chantier J1
 *
 * Miroir de regional-market-context.service.ts (côté commerce) mais pour l'emploi.
 *
 * Utilise Google Gemini 2.5 Flash avec Google Search grounding pour fournir
 * un contexte régional temps réel du marché de l'emploi en Afrique.
 *
 * Fournit :
 *   - Fourchette salariale estimée par catégorie/ville/pays
 *   - Niveau de demande (LOW/MEDIUM/HIGH)
 *   - Tendance 7-30j (GROWING/STABLE/DECLINING)
 *   - Saturation (LOW/MEDIUM/HIGH)
 *   - Top compétences demandées (array)
 *   - Insight narratif (1-2 phrases)
 *   - Note cross-border (opportunités pays voisins)
 *
 * Gating 3 niveaux (minimise appels Gemini) :
 *   1. INTERNAL (interne rule-based) — si confiance ≥ 40
 *   2. CACHED_EXTERNAL — Redis 6h TTL
 *   3. EXTERNAL — Gemini API (seul si nécessaire)
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

export interface RegionalJobSignal {
  category: string;
  city: string;
  country: string;
  salaryRange: { minUsd: number; maxUsd: number } | null;
  demandLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  trend: "GROWING" | "STABLE" | "DECLINING" | "UNKNOWN";
  saturation: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  topSkills: string[];
  crossBorderOpportunity: string | null;
  insight: string;
  sources: string[];
}

export interface RegionalJobContext {
  signals: ScoredInsight<RegionalJobSignal>[];
  summary: string;
  generatedAt: string;
  region: string;
}

// ── Cache ──────────────────────────────────────────────────

const CACHE_TTL_SEC = 6 * 3600; // 6 hours
const CACHE_PREFIX = "ks:gemini:job:";

// Métriques gating in-memory (resettées au start process)
const metrics = {
  totalCalls: 0,
  cached: 0,
  geminiCalled: 0,
  geminiFailed: 0,
  fallback: 0,
  lastResetAt: new Date().toISOString(),
};

export function getRegionalJobContextMetrics() {
  return { ...metrics };
}

export function resetRegionalJobContextMetrics() {
  metrics.totalCalls = 0;
  metrics.cached = 0;
  metrics.geminiCalled = 0;
  metrics.geminiFailed = 0;
  metrics.fallback = 0;
  metrics.lastResetAt = new Date().toISOString();
}

async function getCached(key: string): Promise<RegionalJobContext | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get(`${CACHE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setCache(key: string, data: RegionalJobContext): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(`${CACHE_PREFIX}${key}`, JSON.stringify(data), "EX", CACHE_TTL_SEC);
  } catch {
    /* ignore */
  }
}

// ── Gemini API ─────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
}

async function callGemini(
  prompt: string,
): Promise<{ text: string; sources: string[]; success: boolean }> {
  if (!env.ENABLE_GEMINI) return { text: "", sources: [], success: false };
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return { text: "", sources: [], success: false };

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
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      logger.warn({ status: response.status }, "[Gemini-Job] API error");
      return { text: "", sources: [], success: false };
    }

    const data = (await response.json()) as GeminiResponse;
    const allParts = data.candidates?.[0]?.content?.parts ?? [];
    const text = allParts.filter((p) => p.text).map((p) => p.text!).pop() ?? "";
    const sources = (data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => c.web?.uri ?? c.web?.title ?? "")
      .filter(Boolean);

    return { text, sources, success: text.length > 10 };
  } catch (err) {
    logger.warn({ err }, "[Gemini-Job] Request failed");
    return { text: "", sources: [], success: false };
  }
}

// ── Public API ─────────────────────────────────────────────

/**
 * Récupère le contexte emploi régional pour une catégorie / ville / pays.
 * Utilise Gemini avec Google Search grounding + cache Redis 6h.
 */
export async function getRegionalJobContext(
  category: string,
  city: string,
  country: string,
): Promise<RegionalJobContext> {
  metrics.totalCalls++;
  const normCat = category.trim();
  const normCity = city.trim();
  const normCountry = country.trim();
  const cacheKey = `${normCountry}:${normCity}:${normCat}`.toLowerCase().replace(/\s+/g, "-");

  const cached = await getCached(cacheKey);
  if (cached) {
    metrics.cached++;
    return cached;
  }

  metrics.geminiCalled++;

  const prompt = `Tu es un analyste spécialiste du marché de l'emploi en Afrique, focalisé sur ${normCountry}, ville de ${normCity}.
Analyse le marché de l'emploi actuel pour la catégorie "${normCat}" dans cette ville et retourne un JSON avec cette structure exacte :
{
  "salaryRange": { "minUsd": <number|null>, "maxUsd": <number|null> },
  "demandLevel": "<LOW|MEDIUM|HIGH|UNKNOWN>",
  "trend": "<GROWING|STABLE|DECLINING|UNKNOWN>",
  "saturation": "<LOW|MEDIUM|HIGH|UNKNOWN>",
  "topSkills": ["<skill1>", "<skill2>", "<skill3>"],
  "crossBorderOpportunity": "<string|null — mention brève si pays voisin offre meilleures opportunités>",
  "insight": "<1-2 phrases factuelles résumant le marché de l'emploi ${normCat} à ${normCity}, ${normCountry}>"
}
Cherche des sources récentes (2024-2026), priorise les sites locaux : emploi.cd, brightermonday.com, jobartis.com, linkedin.com, glassdoor, ministères du travail locaux.
Sois factuel, cite les montants en USD. Si tu n'as pas assez de données, mets UNKNOWN pour les enums et null pour les nombres.`;

  const { text, sources, success } = await callGemini(prompt);

  let signal: RegionalJobSignal;
  let score: ConfidenceScore;

  if (success) {
    try {
      const parsed = JSON.parse(text);
      signal = {
        category: normCat,
        city: normCity,
        country: normCountry,
        salaryRange:
          parsed.salaryRange?.minUsd != null
            ? {
                minUsd: Math.round(parsed.salaryRange.minUsd),
                maxUsd: Math.round(parsed.salaryRange.maxUsd ?? parsed.salaryRange.minUsd),
              }
            : null,
        demandLevel: ["LOW", "MEDIUM", "HIGH"].includes(parsed.demandLevel)
          ? parsed.demandLevel
          : "UNKNOWN",
        trend: ["GROWING", "STABLE", "DECLINING"].includes(parsed.trend)
          ? parsed.trend
          : "UNKNOWN",
        saturation: ["LOW", "MEDIUM", "HIGH"].includes(parsed.saturation)
          ? parsed.saturation
          : "UNKNOWN",
        topSkills: Array.isArray(parsed.topSkills)
          ? parsed.topSkills.slice(0, 8).map((s: unknown) => String(s).slice(0, 40)).filter(Boolean)
          : [],
        crossBorderOpportunity:
          typeof parsed.crossBorderOpportunity === "string" && parsed.crossBorderOpportunity.length > 0
            ? parsed.crossBorderOpportunity.slice(0, 200)
            : null,
        insight:
          typeof parsed.insight === "string" && parsed.insight.length > 0
            ? parsed.insight.slice(0, 400)
            : `Contexte emploi ${normCat} à ${normCity}`,
        sources,
      };
      score = scoreExternal(true, 0, "Google Search via Gemini");
    } catch (err) {
      logger.warn({ err, category: normCat, city: normCity }, "[Gemini-Job] JSON parse failed");
      metrics.geminiFailed++;
      signal = buildFallbackSignal(normCat, normCity, normCountry);
      score = scoreInferred(`Réponse Gemini non parsable`, 0);
    }
  } else {
    metrics.geminiFailed++;
    metrics.fallback++;
    signal = buildFallbackSignal(normCat, normCity, normCountry);
    score = scoreInferred(`Données externes emploi non disponibles`, 0);
  }

  const result: RegionalJobContext = {
    signals: [withScore(signal, score)],
    summary: signal.insight,
    generatedAt: new Date().toISOString(),
    region: `${normCity}, ${normCountry}`,
  };

  await setCache(cacheKey, result);
  return result;
}

/**
 * Contexte multi-catégories en un seul appel Gemini (économie de tokens).
 */
export async function getMultiCategoryJobContext(
  categories: string[],
  city: string,
  country: string,
): Promise<RegionalJobContext> {
  metrics.totalCalls++;
  const normCategories = categories.map((c) => c.trim()).filter(Boolean).slice(0, 10);
  if (normCategories.length === 0) {
    return {
      signals: [],
      summary: "Aucune catégorie fournie.",
      generatedAt: new Date().toISOString(),
      region: `${city}, ${country}`,
    };
  }
  const cacheKey = `${country}:${city}:multi:${normCategories.slice().sort().join(",")}`
    .toLowerCase()
    .replace(/\s+/g, "-");

  const cached = await getCached(cacheKey);
  if (cached) {
    metrics.cached++;
    return cached;
  }

  metrics.geminiCalled++;

  const prompt = `Tu es un analyste spécialiste du marché de l'emploi en Afrique, focalisé sur ${country}, ville de ${city}.
Analyse le marché de l'emploi pour ces catégories : ${normCategories.join(", ")}.
Retourne un JSON avec cette structure :
{
  "categories": [
    {
      "name": "<catégorie>",
      "demandLevel": "<LOW|MEDIUM|HIGH|UNKNOWN>",
      "trend": "<GROWING|STABLE|DECLINING|UNKNOWN>",
      "saturation": "<LOW|MEDIUM|HIGH|UNKNOWN>",
      "avgSalaryUsd": <number|null>,
      "topSkills": ["<skill1>", "<skill2>"],
      "insight": "<1 phrase factuelle>"
    }
  ],
  "summary": "<résumé global 2-3 phrases du marché de l'emploi à ${city}, ${country}, avec pistes cross-border si pertinentes>"
}
Priorise les sources locales (emploi.cd, brightermonday, jobartis, linkedin). Sois factuel, 2024-2026.`;

  const { text, sources, success } = await callGemini(prompt);
  const signals: ScoredInsight<RegionalJobSignal>[] = [];

  if (success) {
    try {
      const parsed = JSON.parse(text);
      for (const cat of parsed.categories ?? []) {
        const avg = typeof cat.avgSalaryUsd === "number" ? cat.avgSalaryUsd : null;
        signals.push(
          withScore(
            {
              category: String(cat.name ?? "").slice(0, 80),
              city,
              country,
              salaryRange: avg != null ? { minUsd: Math.round(avg * 0.7), maxUsd: Math.round(avg * 1.3) } : null,
              demandLevel: ["LOW", "MEDIUM", "HIGH"].includes(cat.demandLevel) ? cat.demandLevel : "UNKNOWN",
              trend: ["GROWING", "STABLE", "DECLINING"].includes(cat.trend) ? cat.trend : "UNKNOWN",
              saturation: ["LOW", "MEDIUM", "HIGH"].includes(cat.saturation) ? cat.saturation : "UNKNOWN",
              topSkills: Array.isArray(cat.topSkills)
                ? cat.topSkills.slice(0, 6).map((s: unknown) => String(s).slice(0, 40)).filter(Boolean)
                : [],
              crossBorderOpportunity: null,
              insight: typeof cat.insight === "string" ? cat.insight.slice(0, 300) : "",
              sources,
            },
            scoreExternal(true, 0, "Google Search via Gemini"),
          ),
        );
      }

      const result: RegionalJobContext = {
        signals,
        summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 600) : `Analyse emploi ${city}`,
        generatedAt: new Date().toISOString(),
        region: `${city}, ${country}`,
      };
      await setCache(cacheKey, result);
      return result;
    } catch (err) {
      logger.warn({ err }, "[Gemini-Job] Multi-category JSON parse failed");
      metrics.geminiFailed++;
      /* fall through */
    }
  } else {
    metrics.geminiFailed++;
    metrics.fallback++;
  }

  for (const cat of normCategories) {
    signals.push(
      withScore(
        buildFallbackSignal(cat, city, country),
        scoreInferred(`Données externes emploi non disponibles pour ${cat}`, 0),
      ),
    );
  }

  return {
    signals,
    summary: `Données emploi externes non disponibles pour ${city}, ${country}`,
    generatedAt: new Date().toISOString(),
    region: `${city}, ${country}`,
  };
}

// ── Helpers ────────────────────────────────────────────────

function buildFallbackSignal(category: string, city: string, country: string): RegionalJobSignal {
  return {
    category,
    city,
    country,
    salaryRange: null,
    demandLevel: "UNKNOWN",
    trend: "UNKNOWN",
    saturation: "UNKNOWN",
    topSkills: [],
    crossBorderOpportunity: null,
    insight: `Données de marché emploi externe non disponibles pour "${category}" à ${city}, ${country}`,
    sources: [],
  };
}
