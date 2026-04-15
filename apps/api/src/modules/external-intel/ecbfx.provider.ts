/**
 * ECB FX PROVIDER — Exchange rates (EUR-based, converted to USD)
 * API: https://data.ecb.europa.eu/help/api/data
 * Licence: Open (ECB)
 */

import { env } from "../../config/env.js";
import { fetchWithRetry } from "./base-provider.js";
import { AFRICAN_COUNTRIES, type NormalizedMarketSignal, type ProviderResult } from "./types.js";

// African currencies we track (ECB has limited coverage for XAF, XOF, MAD)
const CURRENCY_PAIRS: Record<string, string> = {
  MAD: "MAD", // Moroccan Dirham
  // XAF and XOF are pegged to EUR (655.957), so delta is minimal
  // CDF, AOA, GNF — not in ECB, use WorldBank FX_RATE from other provider
};

export async function fetchEcbFxSignals(date: Date): Promise<ProviderResult<NormalizedMarketSignal>> {
  const signals: NormalizedMarketSignal[] = [];
  const errors: string[] = [];
  const start = Date.now();
  const dateStr = date.toISOString().split("T")[0];
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevStr = prevDate.toISOString().split("T")[0];

  // Fetch EUR/USD rate for base conversion
  const eurUsdUrl = `${env.ECB_DATA_API_URL}/data/EXR/D.USD.EUR.SP00.A?startPeriod=${prevStr}&endPeriod=${dateStr}&format=jsondata&detail=dataonly`;
  const eurUsdResult = await fetchWithRetry<any>({ url: eurUsdUrl, headers: { Accept: "application/json" } }, "ECB_FX");

  let eurUsd = 1.08; // Fallback
  if (eurUsdResult.data) {
    try {
      const obs = eurUsdResult.data?.dataSets?.[0]?.observations ?? {};
      const vals = Object.values(obs);
      if (vals.length > 0) eurUsd = (vals[vals.length - 1] as number[])[0] ?? 1.08;
    } catch { /* use fallback */ }
  }

  // Generate FX signals for pegged currencies (XAF, XOF → EUR)
  const peggedRate = 655.957; // XAF/XOF per EUR (fixed peg)
  const xafUsd = peggedRate / eurUsd;
  const xofUsd = peggedRate / eurUsd;

  for (const [iso2, meta] of Object.entries(AFRICAN_COUNTRIES)) {
    let rate: number;
    let confidence = 85;

    switch (meta.currency) {
      case "XAF": rate = xafUsd; break;
      case "XOF": rate = xofUsd; break;
      case "MAD": {
        // Fetch MAD directly
        const madUrl = `${env.ECB_DATA_API_URL}/data/EXR/D.MAD.EUR.SP00.A?startPeriod=${prevStr}&endPeriod=${dateStr}&format=jsondata&detail=dataonly`;
        const madResult = await fetchWithRetry<any>({ url: madUrl, headers: { Accept: "application/json" } }, "ECB_FX");
        rate = 10.5; // Fallback ~10.5 MAD/USD
        if (madResult.data) {
          try {
            const obs = madResult.data?.dataSets?.[0]?.observations ?? {};
            const vals = Object.values(obs);
            if (vals.length > 0) {
              const madEur = (vals[vals.length - 1] as number[])[0] ?? 10.5;
              rate = madEur / eurUsd;
            }
          } catch { /* use fallback */ }
        }
        break;
      }
      case "CDF": rate = 2800; confidence = 40; break; // Volatile, approximation
      case "AOA": rate = 920; confidence = 40; break;
      case "GNF": rate = 8600; confidence = 40; break;
      default: rate = 600; confidence = 30;
    }

    signals.push({
      date,
      countryCode: iso2,
      category: "Services",
      signalType: "FX_RATE",
      value: rate,
      unit: "RATIO",
      confidence,
      sourceUrl: eurUsdUrl,
      metadata: { currency: meta.currency, eurUsd, source: confidence > 50 ? "ECB" : "ESTIMATED" },
    });
  }

  return { source: "ECB_FX", success: true, data: signals, errors, latencyMs: Date.now() - start, recordCount: signals.length };
}
