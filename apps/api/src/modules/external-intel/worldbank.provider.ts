/**
 * WORLD BANK PROVIDER — GDP, inflation, trade indicators
 * API: https://api.worldbank.org/v2
 * Licence: Open (CC BY 4.0)
 */

import { z } from "zod";
import { env } from "../../config/env.js";
import { fetchWithRetry } from "./base-provider.js";
import { AFRICAN_COUNTRIES, normalizeCategory, type NormalizedMarketSignal, type ProviderResult } from "./types.js";

const WB_INDICATORS = [
  { id: "FP.CPI.TOTL.ZG", signalType: "PRICE_INDEX" as const, unit: "PERCENT", category: "Alimentation" },
  { id: "NE.TRD.GNFS.ZS", signalType: "TRADE_VOLUME" as const, unit: "PERCENT", category: "Services" },
  { id: "PA.NUS.FCRF", signalType: "FX_RATE" as const, unit: "RATIO", category: "Services" },
] as const;

const responseSchema = z.array(z.unknown()).length(2).transform((arr) => arr[1]);
const indicatorSchema = z.object({
  country: z.object({ id: z.string(), value: z.string() }),
  date: z.string(),
  value: z.number().nullable(),
  indicator: z.object({ id: z.string(), value: z.string() }),
});

export async function fetchWorldBankSignals(date: Date): Promise<ProviderResult<NormalizedMarketSignal>> {
  const year = date.getFullYear();
  const signals: NormalizedMarketSignal[] = [];
  const errors: string[] = [];
  const start = Date.now();

  for (const [iso2, meta] of Object.entries(AFRICAN_COUNTRIES)) {
    for (const indicator of WB_INDICATORS) {
      const url = `${env.WORLDBANK_API_URL}/country/${meta.iso3}/indicator/${indicator.id}?date=${year - 1}:${year}&format=json&per_page=2`;
      const result = await fetchWithRetry<unknown[]>({ url }, "WORLDBANK");

      if (!result.data) {
        errors.push(`WB ${indicator.id} for ${iso2}: ${result.error}`);
        continue;
      }

      try {
        const parsed = responseSchema.safeParse(result.data);
        if (!parsed.success) continue;

        const entries = z.array(indicatorSchema).safeParse(parsed.data);
        if (!entries.success) continue;

        for (const entry of entries.data) {
          if (entry.value === null) continue;
          const prev = entries.data.find((e) => e.date !== entry.date);
          signals.push({
            date,
            countryCode: iso2,
            category: indicator.category,
            signalType: indicator.signalType,
            value: entry.value,
            unit: indicator.unit,
            previousValue: prev?.value ?? undefined,
            deltaPercent: prev?.value ? ((entry.value - prev.value) / Math.abs(prev.value)) * 100 : undefined,
            confidence: 85,
            sourceUrl: url,
          });
        }
      } catch {
        errors.push(`WB parse error for ${iso2}/${indicator.id}`);
      }
    }
  }

  return { source: "WORLDBANK", success: errors.length < signals.length, data: signals, errors, latencyMs: Date.now() - start, recordCount: signals.length };
}
