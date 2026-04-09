/**
 * Internal Ad Copy Generator — Kin-Sell
 *
 * Uses Gemini to generate creative ad copy for internal
 * Kin-Sell promotional banners. Supports two modes:
 *   - AUTO: autonomous category-based generation
 *   - ADMIN: admin prompt-driven generation
 *
 * All outputs cached 24h per category+city+country+type.
 * Respects ENABLE_GEMINI flag and daily quota (MAX_AI_ADS_PER_DAY).
 */

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { getRedis } from "../../shared/db/redis.js";
import { scoreHybrid, scoreInternal, scoreExternal, type ConfidenceScore } from "../analytics/confidence-score.service.js";

// ── Types ──────────────────────────────────────────────────

export interface GeneratedAdCopy {
  title: string;
  description: string;
  ctaText: string;
  targetPage: string;
  category: string;
  tone: "PROMOTIONAL" | "INFORMATIVE" | "URGENT" | "SEASONAL";
  languageCode: "fr";
}

export interface AdCopyRequest {
  category: string;
  city: string;
  trendDirection?: "GROWING" | "STABLE" | "DECLINING" | "UNKNOWN";
  demandLevel?: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  listingsCount?: number;
  avgPriceUsdCents?: number;
  seasonalNote?: string;
}

export interface GeneratedAdResult {
  copy: GeneratedAdCopy;
  score: ConfidenceScore;
  generatedAt: string;
}

// ── Cache ──────────────────────────────────────────────────

const COPY_CACHE_TTL = 24 * 3600; // 24 hours
const COPY_CACHE_PREFIX = "ks:ads:copy-cache:";

async function getCachedCopy(key: string): Promise<GeneratedAdResult | null> {
  try {
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get(`${COPY_CACHE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function setCachedCopy(key: string, data: GeneratedAdResult): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.set(`${COPY_CACHE_PREFIX}${key}`, JSON.stringify(data), "EX", COPY_CACHE_TTL);
  } catch { /* ignore */ }
}

// ── Daily Quota ────────────────────────────────────────────

const DAILY_COUNT_PREFIX = "ks:ads:ai-gen-today:";

export async function getDailyAiGenCount(): Promise<number> {
  try {
    const redis = getRedis();
    if (!redis) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const val = await redis.get(`${DAILY_COUNT_PREFIX}${today}`);
    return val ? parseInt(val, 10) : 0;
  } catch { return 0; }
}

export async function incrementDailyAiGenCount(): Promise<number> {
  try {
    const redis = getRedis();
    if (!redis) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const key = `${DAILY_COUNT_PREFIX}${today}`;
    const newVal = await redis.incr(key);
    if (newVal === 1) await redis.expire(key, 86400);
    return newVal;
  } catch { return 0; }
}

export async function isAiQuotaAvailable(): Promise<boolean> {
  const count = await getDailyAiGenCount();
  return count < env.MAX_AI_ADS_PER_DAY;
}

// ── Mutex (single generation at a time) ────────────────────

const GEN_LOCK_KEY = "ks:ads:gen-lock";
const GEN_LOCK_TTL = 300; // 5 min max

export async function acquireGenLock(): Promise<boolean> {
  try {
    const redis = getRedis();
    if (!redis) return true; // no redis = allow (dev mode)
    const result = await redis.set(GEN_LOCK_KEY, Date.now().toString(), "EX", GEN_LOCK_TTL, "NX");
    return result === "OK";
  } catch { return true; }
}

export async function releaseGenLock(): Promise<void> {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(GEN_LOCK_KEY);
  } catch { /* ignore */ }
}

// ── Gemini API ─────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

async function callGeminiForCopy(prompt: string): Promise<{ text: string; success: boolean }> {
  if (!env.ENABLE_GEMINI) {
    return { text: "", success: false };
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return { text: "", success: false };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 600,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(25_000),
      },
    );

    if (!response.ok) {
      logger.warn(`[Gemini-Copy] API error: ${response.status}`);
      return { text: "", success: false };
    }

    const data = (await response.json()) as GeminiResponse;
    // Get last text part (Gemini 2.5 may put thinking in earlier parts)
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter(p => p.text).map(p => p.text!).pop() ?? "";
    return { text, success: text.length > 10 };
  } catch (err) {
    logger.warn({ err }, "[Gemini-Copy] Request failed");
    return { text: "", success: false };
  }
}

// ── Public API ─────────────────────────────────────────────

/**
 * Generate a single promotional ad copy for an internal Kin-Sell banner.
 * Uses Gemini exclusively. Cached 24h per category+city.
 */
export async function generateAdCopy(request: AdCopyRequest): Promise<GeneratedAdResult> {
  const { category, city, trendDirection, demandLevel, listingsCount, avgPriceUsdCents, seasonalNote } = request;

  // Check cache first
  const cacheKey = `${city}:${category}:auto`.toLowerCase().replace(/\s+/g, "-");
  const cached = await getCachedCopy(cacheKey);
  if (cached) {
    logger.info({ category, city }, "[Gemini-Copy] Cache hit — skipping API call");
    return cached;
  }

  const contextParts: string[] = [
    `Catégorie: ${category}`,
    `Ville: ${city}`,
  ];
  if (trendDirection && trendDirection !== "UNKNOWN") contextParts.push(`Tendance: ${trendDirection}`);
  if (demandLevel && demandLevel !== "UNKNOWN") contextParts.push(`Demande: ${demandLevel}`);
  if (listingsCount) contextParts.push(`${listingsCount} annonces disponibles`);
  if (avgPriceUsdCents) contextParts.push(`Prix moyen: ${(avgPriceUsdCents / 100).toFixed(0)} USD`);
  if (seasonalNote) contextParts.push(`Note saisonnière: ${seasonalNote}`);

  const prompt = `Tu es le rédacteur publicitaire interne de Kin-Sell, une marketplace premium basée à Kinshasa, RD Congo.
Tu génères des bannières promotionnelles INTERNES pour mettre en avant des catégories de produits/services sur la plateforme.
Tes textes sont en français, concis, accrocheurs, orientés conversion et adaptés au marché congolais.
Style : premium, moderne, mobile-first. CTA clair et direct.
Tu ne mens jamais sur les prix ou la disponibilité.

Contexte :
${contextParts.join("\n")}

Retourne UNIQUEMENT un JSON valide avec cette structure :
{
  "title": "<max 60 caractères, accrocheur>",
  "description": "<max 120 caractères, informatif>",
  "ctaText": "<max 20 caractères, call-to-action>",
  "targetPage": "<explorer|sokin|home>",
  "tone": "<PROMOTIONAL|INFORMATIVE|URGENT|SEASONAL>"
}`;

  const internalScore = scoreInternal(listingsCount ?? 0, category);

  // Check quota before calling Gemini
  const quotaOk = await isAiQuotaAvailable();
  if (!quotaOk) {
    logger.info("[Gemini-Copy] Daily AI limit reached — using fallback");
    return {
      copy: buildFallbackCopy(category, city, listingsCount ?? 0),
      score: internalScore,
      generatedAt: new Date().toISOString(),
    };
  }

  const { text, success } = await callGeminiForCopy(prompt);
  const externalScore = scoreExternal(success, 0, "Gemini 2.5 Flash");

  if (success) {
    try {
      const parsed = JSON.parse(text);
      const result: GeneratedAdResult = {
        copy: {
          title: String(parsed.title ?? "").slice(0, 60),
          description: String(parsed.description ?? "").slice(0, 120),
          ctaText: String(parsed.ctaText ?? "Découvrir").slice(0, 20),
          targetPage: ["explorer", "sokin", "home"].includes(parsed.targetPage) ? parsed.targetPage : "explorer",
          category,
          tone: ["PROMOTIONAL", "INFORMATIVE", "URGENT", "SEASONAL"].includes(parsed.tone) ? parsed.tone : "PROMOTIONAL",
          languageCode: "fr",
        },
        score: scoreHybrid(internalScore, externalScore),
        generatedAt: new Date().toISOString(),
      };

      await incrementDailyAiGenCount();
      await setCachedCopy(cacheKey, result);
      logger.info({ category, city }, "[Gemini-Copy] Ad copy generated successfully");
      return result;
    } catch { /* fall through to fallback */ }
  }

  // Fallback: generate deterministic internal copy
  logger.info({ category, city }, "[Gemini-Copy] Fallback used");
  return {
    copy: buildFallbackCopy(category, city, listingsCount ?? 0),
    score: internalScore,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate ad copy from admin free-text prompt.
 * Respects daily quota and mutex lock.
 */
export async function generateAdCopyFromPrompt(prompt: string): Promise<GeneratedAdResult> {
  // Check quota
  const quotaOk = await isAiQuotaAvailable();
  if (!quotaOk) {
    logger.warn("[Gemini-Copy] Admin generation blocked — daily AI limit reached");
    return {
      copy: buildFallbackCopy("Général", "Kinshasa", 0),
      score: scoreInternal(0, "admin-prompt"),
      generatedAt: new Date().toISOString(),
    };
  }

  const fullPrompt = `Tu es le rédacteur publicitaire interne de Kin-Sell, une marketplace premium basée à Kinshasa, RD Congo.
Style : premium, moderne, glassmorphism, mobile-first. Branding Kin-Sell (violet/bleu, propre).
CTA clair et orienté conversion. Textes en français, concis, accrocheurs.

Voici la demande de l'administrateur :
"${prompt}"

Retourne UNIQUEMENT un JSON valide avec cette structure :
{
  "title": "<max 60 caractères, accrocheur>",
  "description": "<max 120 caractères, informatif>",
  "ctaText": "<max 20 caractères, call-to-action>",
  "targetPage": "<explorer|sokin|home>",
  "category": "<catégorie détectée ou 'Général'>",
  "tone": "<PROMOTIONAL|INFORMATIVE|URGENT|SEASONAL>"
}`;

  const { text, success } = await callGeminiForCopy(fullPrompt);

  if (success) {
    try {
      const parsed = JSON.parse(text);
      const result: GeneratedAdResult = {
        copy: {
          title: String(parsed.title ?? "").slice(0, 60),
          description: String(parsed.description ?? "").slice(0, 120),
          ctaText: String(parsed.ctaText ?? "Découvrir").slice(0, 20),
          targetPage: ["explorer", "sokin", "home"].includes(parsed.targetPage) ? parsed.targetPage : "explorer",
          category: String(parsed.category ?? "Général").slice(0, 50),
          tone: ["PROMOTIONAL", "INFORMATIVE", "URGENT", "SEASONAL"].includes(parsed.tone) ? parsed.tone : "PROMOTIONAL",
          languageCode: "fr",
        },
        score: scoreExternal(true, 0, "Gemini 2.5 Flash"),
        generatedAt: new Date().toISOString(),
      };

      await incrementDailyAiGenCount();
      logger.info("[Gemini-Copy] Admin ad copy generated successfully");
      return result;
    } catch { /* fall through */ }
  }

  logger.warn("[Gemini-Copy] Admin generation failed — fallback used");
  return {
    copy: buildFallbackCopy("Général", "Kinshasa", 0),
    score: scoreInternal(0, "admin-prompt"),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate multiple ad copies for a batch of categories.
 * Sequentially processes each category to respect rate limits.
 */
export async function generateBatchAdCopies(
  categories: Array<{ category: string; listingsCount: number; avgPriceUsdCents?: number }>,
  city: string = "Kinshasa",
): Promise<GeneratedAdResult[]> {
  const results: GeneratedAdResult[] = [];
  // Process sequentially — one at a time
  for (const cat of categories.slice(0, 6)) {
    // Stop if quota exhausted
    const quotaOk = await isAiQuotaAvailable();
    if (!quotaOk) {
      logger.info("[Gemini-Copy] Batch stopped — daily AI limit reached");
      // Fill remaining with fallback
      results.push({
        copy: buildFallbackCopy(cat.category, city, cat.listingsCount),
        score: scoreInternal(cat.listingsCount, cat.category),
        generatedAt: new Date().toISOString(),
      });
      continue;
    }

    const result = await generateAdCopy({
      category: cat.category,
      city,
      listingsCount: cat.listingsCount,
      avgPriceUsdCents: cat.avgPriceUsdCents,
    });
    results.push(result);
  }
  return results;
}

// ── Fallback ───────────────────────────────────────────────

const FALLBACK_TEMPLATES: Array<{ title: (c: string) => string; desc: (c: string, n: number, city: string) => string; cta: string; tone: GeneratedAdCopy["tone"] }> = [
  {
    title: (c) => `${c} sur Kin-Sell`,
    desc: (c, n, city) => n > 0 ? `${n} annonces ${c.toLowerCase()} vous attendent à ${city}` : `Découvrez nos ${c.toLowerCase()} à ${city}`,
    cta: "Explorer",
    tone: "PROMOTIONAL",
  },
  {
    title: (c) => `Trouvez votre ${c.toLowerCase()} idéal`,
    desc: (_c, _n, city) => `Les meilleurs prix de ${city}, négociables en direct`,
    cta: "Voir les offres",
    tone: "INFORMATIVE",
  },
  {
    title: (c) => `${c} — Nouveautés !`,
    desc: (c, _n, city) => `Nouvelles annonces ${c.toLowerCase()} à ${city}`,
    cta: "Découvrir",
    tone: "PROMOTIONAL",
  },
];

function buildFallbackCopy(category: string, city: string, listingsCount: number): GeneratedAdCopy {
  const template = FALLBACK_TEMPLATES[Math.floor(Math.random() * FALLBACK_TEMPLATES.length)];
  return {
    title: template.title(category).slice(0, 60),
    description: template.desc(category, listingsCount, city).slice(0, 120),
    ctaText: template.cta,
    targetPage: "explorer",
    category,
    tone: template.tone,
    languageCode: "fr",
  };
}
