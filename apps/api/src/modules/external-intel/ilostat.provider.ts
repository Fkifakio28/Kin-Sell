/**
 * ILOSTAT PROVIDER — Employment & labour market (SDMX JSON)
 * API: https://ilostat.ilo.org/resources/sdmx-tools/
 * Licence: Open
 */

import { z } from "zod";
import { fetchWithRetry } from "./base-provider.js";
import { AFRICAN_COUNTRIES, type NormalizedJobSignal, type ProviderResult } from "./types.js";

const ILOSTAT_BASE = "https://www.ilo.org/sdmx/rest/data/ILO,DF_EMP_TEMP_SEX_AGE_NB";

const SERVICE_MAP: Record<string, string> = {
  "Total": "GENERAL",
  "Agriculture": "FARMER",
  "Industry": "CONSTRUCTION_WORKER",
  "Services": "SERVICE_PROVIDER",
};

export async function fetchIlostatSignals(date: Date): Promise<ProviderResult<NormalizedJobSignal>> {
  const signals: NormalizedJobSignal[] = [];
  const errors: string[] = [];
  const start = Date.now();
  const year = date.getFullYear();

  for (const [iso2, meta] of Object.entries(AFRICAN_COUNTRIES)) {
    const url = `${ILOSTAT_BASE}/${meta.iso3}..SEX_T.AGE_YTHADULT_YGE15?startPeriod=${year - 1}&endPeriod=${year}&format=jsondata&detail=dataonly`;
    const result = await fetchWithRetry<any>({ url, headers: { Accept: "application/json" } }, "ILOSTAT");

    if (!result.data) {
      errors.push(`ILO ${iso2}: ${result.error}`);
      continue;
    }

    try {
      const dataSets = result.data?.dataSets;
      if (!Array.isArray(dataSets) || dataSets.length === 0) continue;

      const observations = dataSets[0]?.observations ?? {};
      for (const [key, values] of Object.entries(observations)) {
        const val = Array.isArray(values) ? (values as number[])[0] : null;
        if (val === null || val === undefined) continue;

        signals.push({
          date,
          countryCode: iso2,
          city: meta.capital,
          serviceType: "GENERAL",
          category: "Services",
          jobCount: Math.round(val),
          demandTrend: "STABLE",
          topSkills: [],
          confidence: 70,
          sourceUrl: url,
        });
      }
    } catch {
      errors.push(`ILO parse error for ${iso2}`);
    }
  }

  return { source: "ILOSTAT", success: errors.length < 4, data: signals, errors, latencyMs: Date.now() - start, recordCount: signals.length };
}
