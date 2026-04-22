/**
 * AFRICA JOBS PROVIDER — Chantier J2
 *
 * Aggrège les signaux d'emploi Afrique depuis les sites locaux (emploi.cd,
 * brightermonday, jobartis, glassdoor, linkedin) via Gemini 2.5 Flash + Google
 * Search grounding. Plus robuste qu'un scraper HTML (résiste aux changements
 * de structure, multi-sources, respectueux des ToS).
 *
 * Pour chaque pays actif Kin-Sell et chaque service type clef, on demande à
 * Gemini d'estimer jobCount, avgSalaryUsd, tendance et topSkills à partir des
 * annonces publiques récentes (2024-2026).
 *
 * Persistés dans `ExternalJobSignalDaily` via `persistJobSignals()` (existant).
 */

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { AFRICAN_COUNTRIES, type NormalizedJobSignal, type ProviderResult } from "./types.js";

const SERVICE_QUERIES = [
  { serviceType: "DELIVERY", category: "Transport", label: "livreur / chauffeur" },
  { serviceType: "DEVELOPER", category: "Services", label: "développeur informatique" },
  { serviceType: "CONSTRUCTION", category: "Construction", label: "ouvrier / technicien BTP" },
  { serviceType: "SALES", category: "Services", label: "vendeur / commercial" },
  { serviceType: "MECHANIC", category: "Transport", label: "mécanicien / technicien automobile" },
  { serviceType: "HOSPITALITY", category: "Services", label: "restauration / hôtellerie" },
  { serviceType: "FINANCE", category: "Services", label: "comptable / finance" },
];

interface GeminiCountryResponse {
  countries?: Array<{
    countryCode?: string;
    city?: string;
    services?: Array<{
      serviceType?: string;
      jobCount?: number;
      avgSalaryUsd?: number;
      demandTrend?: "RISING" | "STABLE" | "DECLINING";
      topSkills?: string[];
      insight?: string;
    }>;
  }>;
}

async function callGeminiForAfricaJobs(): Promise<{
  data: GeminiCountryResponse | null;
  sources: string[];
  error?: string;
}> {
  if (!env.ENABLE_GEMINI) return { data: null, sources: [], error: "GEMINI_DISABLED" };
  if (!env.GEMINI_API_KEY) return { data: null, sources: [], error: "GEMINI_KEY_MISSING" };

  const countriesList = Object.entries(AFRICAN_COUNTRIES)
    .map(([iso, meta]) => `${iso} (${meta.name}, capitale ${meta.capital})`)
    .join("; ");

  const prompt = `Tu es un analyste du marché de l'emploi en Afrique.
Pour chaque pays ci-dessous, estime l'état du marché de l'emploi dans sa capitale pour chaque type de service donné.
Base-toi sur les annonces publiques récentes (2024-2026) des sites d'emploi locaux : emploi.cd, brightermonday.co.ke, brightermonday.co.ug, jobartis.com, linkedin.com, glassdoor, ministères du travail.

Pays : ${countriesList}
Types de service : ${SERVICE_QUERIES.map((s) => `${s.serviceType}=${s.label}`).join("; ")}

Retourne un JSON avec cette structure exacte :
{
  "countries": [
    {
      "countryCode": "<ISO2>",
      "city": "<capitale>",
      "services": [
        {
          "serviceType": "<DELIVERY|DEVELOPER|CONSTRUCTION|SALES|MECHANIC|HOSPITALITY|FINANCE>",
          "jobCount": <nombre estimé d'offres actives mensuelles>,
          "avgSalaryUsd": <salaire moyen mensuel en USD>,
          "demandTrend": "<RISING|STABLE|DECLINING>",
          "topSkills": ["<skill1>", "<skill2>", "<skill3>"],
          "insight": "<1 phrase factuelle>"
        }
      ]
    }
  ]
}
Priorité aux données locales. Sois factuel, si tu n'as pas d'info, mets jobCount=0 et confiance faible via avgSalaryUsd=null.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      return { data: null, sources: [], error: `HTTP ${response.status}` };
    }
    const body = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        groundingMetadata?: {
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
    };
    const allParts = body.candidates?.[0]?.content?.parts ?? [];
    const text = allParts.filter((p) => p.text).map((p) => p.text!).pop() ?? "";
    const sources = (body.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => c.web?.uri ?? c.web?.title ?? "")
      .filter(Boolean);
    try {
      return { data: JSON.parse(text) as GeminiCountryResponse, sources };
    } catch (err) {
      logger.warn({ err }, "[AfricaJobs] JSON parse failed");
      return { data: null, sources, error: "PARSE_ERROR" };
    }
  } catch (err) {
    return { data: null, sources: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchAfricaJobsSignals(
  date: Date,
): Promise<ProviderResult<NormalizedJobSignal>> {
  const signals: NormalizedJobSignal[] = [];
  const errors: string[] = [];
  const start = Date.now();

  const { data, sources, error } = await callGeminiForAfricaJobs();

  if (!data || !Array.isArray(data.countries)) {
    // Fallback : signaux inférés (faible confiance) pour ne pas casser le pipeline
    for (const [iso2, meta] of Object.entries(AFRICAN_COUNTRIES)) {
      for (const svc of SERVICE_QUERIES) {
        signals.push({
          date,
          countryCode: iso2,
          city: meta.capital,
          serviceType: svc.serviceType,
          category: svc.category,
          jobCount: 0,
          demandTrend: "STABLE",
          topSkills: [],
          confidence: 10,
          metadata: { inferred: true, reason: error ?? "NO_DATA" },
        });
      }
    }
    return {
      source: "AFRICA_JOBS",
      success: false,
      data: signals,
      errors: [error ?? "Gemini response unavailable"],
      latencyMs: Date.now() - start,
      recordCount: signals.length,
    };
  }

  const sourceUrl = sources.length > 0 ? sources[0]!.slice(0, 250) : "https://emploi.cd";

  for (const country of data.countries) {
    const iso = (country.countryCode ?? "").toUpperCase();
    if (!iso || !AFRICAN_COUNTRIES[iso]) continue;
    const meta = AFRICAN_COUNTRIES[iso];
    const city = country.city?.trim() || meta.capital;

    for (const svc of country.services ?? []) {
      const serviceType = (svc.serviceType ?? "").toUpperCase();
      const matched = SERVICE_QUERIES.find((s) => s.serviceType === serviceType);
      if (!matched) continue;

      const jobCount = Math.max(0, Math.round(svc.jobCount ?? 0));
      const avgSalaryUsd = typeof svc.avgSalaryUsd === "number" && svc.avgSalaryUsd > 0
        ? Math.round(svc.avgSalaryUsd)
        : undefined;
      const topSkills = Array.isArray(svc.topSkills)
        ? svc.topSkills.slice(0, 5).map((s) => String(s).slice(0, 40)).filter(Boolean)
        : [];

      signals.push({
        date,
        countryCode: iso,
        city,
        serviceType,
        category: matched.category,
        jobCount,
        avgSalaryUsd,
        demandTrend: svc.demandTrend === "RISING" || svc.demandTrend === "DECLINING"
          ? svc.demandTrend
          : "STABLE",
        topSkills,
        confidence: jobCount > 0 && avgSalaryUsd != null ? 65 : 40,
        sourceUrl,
        metadata: { provider: "AFRICA_JOBS_GEMINI", sources: sources.slice(0, 5), insight: svc.insight?.slice(0, 200) },
      });
    }
  }

  if (signals.length === 0) {
    errors.push("No valid country/service data parsed from Gemini response");
  }

  return {
    source: "AFRICA_JOBS",
    success: signals.length > 0,
    data: signals,
    errors,
    latencyMs: Date.now() - start,
    recordCount: signals.length,
  };
}
