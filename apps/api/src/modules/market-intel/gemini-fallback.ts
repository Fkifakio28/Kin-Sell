/**
 * Gemini Fallback — Kin-Sell Analytique+
 *
 * Dernier recours (règle utilisateur : "gemini doit être le dernier recourt").
 *
 * Conditions d'appel strictes — le caller DOIT vérifier en amont :
 *   1. ENABLE_MARKET_INTEL === true
 *   2. GEMINI_API_KEY présent, ENABLE_GEMINI === true
 *   3. Pas d'observation fiable après un cycle complet de crawl pour ce
 *      (produit|métier) × pays — OU une source a 3+ échecs consécutifs.
 *
 * Quota journalier : MAX_GEMINI_MARKET_CALLS_PER_DAY (défaut 50)
 *   - Compteur Redis `ks:market:gemini:count:{YYYY-MM-DD}` (TTL 48h)
 *   - Si Redis indispo → compteur mémoire process (best-effort)
 *
 * Une seule tentative par appel (pas de re-prompt). Réponse validée via
 * Zod : rejet si format invalide.
 *
 * Chaque appel audité : pays, scope (prices/jobs), quota restant, succès.
 */

import { z } from "zod";
import { env } from "../../config/env.js";
import { getRedis } from "../../shared/db/redis.js";
import { logger } from "../../shared/logger.js";

// ── Zod Schemas ──────────────────────────────────────────

const PriceEstimateSchema = z.object({
  productLabel: z.string().min(2).max(150),
  priceMinLocal: z.number().int().nonnegative(),
  priceMaxLocal: z.number().int().nonnegative(),
  priceMedianLocal: z.number().int().nonnegative(),
  localCurrency: z.string().min(2).max(6),
  sampleSize: z.number().int().nonnegative().default(1),
  confidence: z.number().min(0).max(1),
  sourceUrls: z.array(z.string()).max(10).default([]),
});

const SalaryEstimateSchema = z.object({
  jobLabel: z.string().min(2).max(150),
  salaryMinLocal: z.number().int().nonnegative(),
  salaryMaxLocal: z.number().int().nonnegative(),
  salaryMedianLocal: z.number().int().nonnegative(),
  localCurrency: z.string().min(2).max(6),
  unit: z.enum(["month", "day", "hour", "year"]).default("month"),
  sampleSize: z.number().int().nonnegative().default(1),
  confidence: z.number().min(0).max(1),
  sourceUrls: z.array(z.string()).max(10).default([]),
});

export const PriceResponseSchema = z.object({
  estimates: z.array(PriceEstimateSchema).max(25),
});
export const SalaryResponseSchema = z.object({
  estimates: z.array(SalaryEstimateSchema).max(25),
});

export type PriceEstimate = z.infer<typeof PriceEstimateSchema>;
export type SalaryEstimate = z.infer<typeof SalaryEstimateSchema>;

// ── Quota ────────────────────────────────────────────────

const todayKey = () => `ks:market:gemini:count:${new Date().toISOString().slice(0, 10)}`;
let memoryQuota = { date: "", count: 0 };

export async function getQuotaUsed(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.get(todayKey());
      return v ? Number.parseInt(v, 10) || 0 : 0;
    } catch {
      /* fallthrough */
    }
  }
  const today = todayKey();
  if (memoryQuota.date !== today) memoryQuota = { date: today, count: 0 };
  return memoryQuota.count;
}

async function incrementQuota(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      const v = await redis.incr(todayKey());
      if (v === 1) await redis.expire(todayKey(), 48 * 3600);
      return v;
    } catch {
      /* fallthrough */
    }
  }
  const today = todayKey();
  if (memoryQuota.date !== today) memoryQuota = { date: today, count: 0 };
  memoryQuota.count += 1;
  return memoryQuota.count;
}

async function quotaAvailable(): Promise<{ ok: boolean; used: number; cap: number }> {
  const used = await getQuotaUsed();
  const cap = env.MAX_GEMINI_MARKET_CALLS_PER_DAY;
  return { ok: used < cap, used, cap };
}

// ── Gemini HTTP call (copie stricte du pattern existant) ─

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
};

async function callGemini(prompt: string): Promise<{ text: string; sources: string[] } | null> {
  if (!env.ENABLE_GEMINI || !env.GEMINI_API_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "[market-intel.gemini] HTTP error");
      return null;
    }
    const data = (await res.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p) => p.text).map((p) => p.text!).pop() ?? "";
    const sources = (data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => c.web?.uri ?? "")
      .filter(Boolean);
    return { text, sources };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[market-intel.gemini] request failed");
    return null;
  }
}

// ── Public API ──────────────────────────────────────────

export type GeminiFallbackOptions = {
  reason: string; // "no-source-coverage" | "crawl-failures" | etc.
  countryCode: string;
  language?: "fr" | "pt";
};

/**
 * Demande à Gemini une estimation de prix pour un ensemble de produits
 * dans un pays donné. Renvoie `null` si quota dépassé, kill-switch, ou
 * réponse malformée.
 */
export async function estimatePrices(
  productLabels: string[],
  opts: GeminiFallbackOptions,
): Promise<{ estimates: PriceEstimate[]; sources: string[] } | null> {
  if (!env.ENABLE_MARKET_INTEL) return null;
  if (!env.ENABLE_GEMINI || !env.GEMINI_API_KEY) return null;
  if (productLabels.length === 0) return { estimates: [], sources: [] };

  const quota = await quotaAvailable();
  if (!quota.ok) {
    logger.warn({ used: quota.used, cap: quota.cap }, "[market-intel.gemini] quota exhausted");
    return null;
  }

  const lang = opts.language === "pt" ? "Portuguese" : "French";
  const prompt = `Tu es un analyste de marché pour ${opts.countryCode}. Raison de l'appel : ${opts.reason}.
Estime les prix actuels (en ${new Date().getFullYear()}) pour les produits suivants vendus en ${opts.countryCode}.
Renvoie UNIQUEMENT un JSON valide (pas de markdown, pas de texte additionnel) avec cette structure stricte :
{
  "estimates": [
    {
      "productLabel": "<nom du produit>",
      "priceMinLocal": <int>,
      "priceMaxLocal": <int>,
      "priceMedianLocal": <int>,
      "localCurrency": "<code ISO devise locale ex MAD, XOF, XAF, CDF, GNF, AOA>",
      "sampleSize": <int, nb d'annonces observées, défaut 1>,
      "confidence": <float 0-1>,
      "sourceUrls": [<url1>, <url2>]
    }
  ]
}
Produits : ${productLabels.slice(0, 20).map((p) => `"${p}"`).join(", ")}.
Langue des labels: ${lang}. Sois factuel, utilise des sources vérifiables (Jumia, Avito, Coinafrique,
Mubawab, etc.). Si tu n'as pas de données pour un produit, omets-le plutôt que d'inventer.`;

  const call = await callGemini(prompt);
  const usedAfter = await incrementQuota();
  logger.info(
    { country: opts.countryCode, reason: opts.reason, scope: "prices", count: productLabels.length, quotaUsed: usedAfter, cap: quota.cap },
    "[market-intel.gemini] price estimate call",
  );

  if (!call) return null;

  try {
    const rawJson = extractJson(call.text);
    if (!rawJson) return null;
    const parsed = PriceResponseSchema.safeParse(JSON.parse(rawJson));
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues.slice(0, 3) }, "[market-intel.gemini] price schema invalid");
      return null;
    }
    return { estimates: parsed.data.estimates, sources: call.sources };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[market-intel.gemini] price parse failed");
    return null;
  }
}

/**
 * Variante pour les salaires. Même contrat / quota.
 */
export async function estimateSalaries(
  jobLabels: string[],
  opts: GeminiFallbackOptions,
): Promise<{ estimates: SalaryEstimate[]; sources: string[] } | null> {
  if (!env.ENABLE_MARKET_INTEL) return null;
  if (!env.ENABLE_GEMINI || !env.GEMINI_API_KEY) return null;
  if (jobLabels.length === 0) return { estimates: [], sources: [] };

  const quota = await quotaAvailable();
  if (!quota.ok) {
    logger.warn({ used: quota.used, cap: quota.cap }, "[market-intel.gemini] quota exhausted");
    return null;
  }

  const lang = opts.language === "pt" ? "Portuguese" : "French";
  const prompt = `Tu es un analyste du marché de l'emploi pour ${opts.countryCode}. Raison de l'appel : ${opts.reason}.
Estime les salaires mensuels nets actuels (${new Date().getFullYear()}) pour les métiers suivants en ${opts.countryCode}.
Renvoie UNIQUEMENT un JSON valide :
{
  "estimates": [
    {
      "jobLabel": "<intitulé métier>",
      "salaryMinLocal": <int>,
      "salaryMaxLocal": <int>,
      "salaryMedianLocal": <int>,
      "localCurrency": "<code ISO ex MAD, XOF, CDF>",
      "unit": "month",
      "sampleSize": <int>,
      "confidence": <float 0-1>,
      "sourceUrls": [<url1>]
    }
  ]
}
Métiers : ${jobLabels.slice(0, 20).map((p) => `"${p}"`).join(", ")}.
Langue des labels: ${lang}. Utilise des sources vérifiables (LinkedIn, Emploi.ma, ReKrute, Senjob, etc.).
Omets les métiers pour lesquels tu n'as pas de données — n'invente pas.`;

  const call = await callGemini(prompt);
  const usedAfter = await incrementQuota();
  logger.info(
    { country: opts.countryCode, reason: opts.reason, scope: "salaries", count: jobLabels.length, quotaUsed: usedAfter, cap: quota.cap },
    "[market-intel.gemini] salary estimate call",
  );

  if (!call) return null;

  try {
    const rawJson = extractJson(call.text);
    if (!rawJson) return null;
    const parsed = SalaryResponseSchema.safeParse(JSON.parse(rawJson));
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues.slice(0, 3) }, "[market-intel.gemini] salary schema invalid");
      return null;
    }
    return { estimates: parsed.data.estimates, sources: call.sources };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[market-intel.gemini] salary parse failed");
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Extrait un bloc JSON depuis un texte qui pourrait contenir des
 * wrappers markdown (Gemini ne respecte pas toujours responseMimeType).
 */
function extractJson(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  // Strip ```json ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) return fence[1].trim();
  // Trouve la première {..} balance
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return null;
}

// ── Audit helpers (exposés pour admin) ──────────────────

export async function getGeminiQuotaStatus(): Promise<{
  used: number;
  cap: number;
  remaining: number;
  resetAt: string;
}> {
  const used = await getQuotaUsed();
  const cap = env.MAX_GEMINI_MARKET_CALLS_PER_DAY;
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  return {
    used,
    cap,
    remaining: Math.max(0, cap - used),
    resetAt: tomorrow.toISOString(),
  };
}
