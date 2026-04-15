/**
 * UN COMTRADE PROVIDER — International trade flows
 * API: https://comtradedeveloper.un.org/apis
 * Licence: Open (UN)
 */

import { fetchWithRetry } from "./base-provider.js";
import { AFRICAN_COUNTRIES, normalizeCategory, type NormalizedMarketSignal, type ProviderResult } from "./types.js";

// HS codes for key African trade categories
const TRADE_SECTORS = [
  { hs: "09", name: "Coffee/Tea/Spices", category: "Alimentation" },
  { hs: "27", name: "Mineral fuels", category: "Transport" },
  { hs: "71", name: "Precious metals", category: "Services" },
  { hs: "85", name: "Electrical equipment", category: "Électronique" },
  { hs: "62", name: "Apparel/Clothing", category: "Vêtements" },
  { hs: "44", name: "Wood", category: "Construction" },
];

export async function fetchComtradeSignals(date: Date): Promise<ProviderResult<NormalizedMarketSignal>> {
  const signals: NormalizedMarketSignal[] = [];
  const errors: string[] = [];
  const start = Date.now();
  const year = date.getFullYear() - 1; // Comtrade has ~1 year lag

  for (const [iso2, meta] of Object.entries(AFRICAN_COUNTRIES)) {
    for (const sector of TRADE_SECTORS) {
      const url = `https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${meta.iso3}&period=${year}&cmdCode=${sector.hs}&flowCode=M,X&partnerCode=0`;
      const result = await fetchWithRetry<any>({ url, headers: { Accept: "application/json" } }, "COMTRADE");

      if (!result.data) {
        // Comtrade is often slow/unavailable — use inferred fallback
        signals.push({
          date,
          countryCode: iso2,
          category: sector.category,
          signalType: "TRADE_VOLUME",
          value: 50, // Neutral baseline
          unit: "INDEX",
          confidence: 30,
          metadata: { inferred: true, sector: sector.name, hsCode: sector.hs },
        });
        continue;
      }

      try {
        const records = Array.isArray(result.data?.data) ? result.data.data : [];
        for (const rec of records) {
          const tradeValue = Number(rec.primaryValue ?? rec.tradeValue ?? 0);
          if (tradeValue <= 0) continue;

          signals.push({
            date,
            countryCode: iso2,
            category: sector.category,
            signalType: "TRADE_VOLUME",
            value: tradeValue,
            unit: "USD_CENTS",
            confidence: 75,
            sourceUrl: url,
            metadata: { flow: rec.flowDesc, partner: rec.partnerDesc, year },
          });
        }
      } catch {
        errors.push(`Comtrade parse error for ${iso2}/${sector.hs}`);
      }
    }
  }

  return { source: "COMTRADE", success: signals.length > 0, data: signals, errors, latencyMs: Date.now() - start, recordCount: signals.length };
}
