/**
 * UNCTAD PROVIDER — Trade & development statistics
 * API: https://unctadstat.unctad.org
 * Licence: Open (UN)
 */

import { fetchWithRetry } from "./base-provider.js";
import { AFRICAN_COUNTRIES, type NormalizedMarketSignal, type ProviderResult } from "./types.js";

export async function fetchUnctadSignals(date: Date): Promise<ProviderResult<NormalizedMarketSignal>> {
  const signals: NormalizedMarketSignal[] = [];
  const errors: string[] = [];
  const start = Date.now();
  const year = date.getFullYear();

  // UNCTAD Commodity Price Index (monthly)
  const url = `https://unctadstat.unctad.org/api/reportMetadata/US.FreeMarketCommodityPriceIndex?format=json`;
  const result = await fetchWithRetry<any>({ url }, "UNCTAD");

  if (!result.data) {
    // Fallback: generate baseline commodity signals
    const commodities = [
      { name: "Food", category: "Alimentation", baseline: 105 },
      { name: "Minerals", category: "Construction", baseline: 98 },
      { name: "Metals", category: "Construction", baseline: 110 },
      { name: "Agricultural raw", category: "Agriculture", baseline: 95 },
    ];

    for (const commodity of commodities) {
      for (const [iso2] of Object.entries(AFRICAN_COUNTRIES)) {
        signals.push({
          date,
          countryCode: iso2,
          category: commodity.category,
          signalType: "COMMODITY",
          value: commodity.baseline,
          unit: "INDEX",
          confidence: 35,
          metadata: { inferred: true, commodity: commodity.name },
        });
      }
    }
    errors.push(`UNCTAD API unavailable: ${result.error}`);
  } else {
    try {
      const dataPoints = Array.isArray(result.data) ? result.data : result.data?.data ?? [];
      for (const entry of dataPoints) {
        for (const [iso2] of Object.entries(AFRICAN_COUNTRIES)) {
          signals.push({
            date,
            countryCode: iso2,
            category: "Alimentation",
            signalType: "COMMODITY",
            value: Number(entry.value ?? 100),
            unit: "INDEX",
            confidence: 75,
            sourceUrl: url,
          });
        }
      }
    } catch {
      errors.push("UNCTAD parse error");
    }
  }

  return { source: "UNCTAD", success: signals.length > 0, data: signals, errors, latencyMs: Date.now() - start, recordCount: signals.length };
}
