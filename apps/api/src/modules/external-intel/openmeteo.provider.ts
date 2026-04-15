/**
 * OPEN-METEO PROVIDER — Weather & seasonal data
 * API: https://open-meteo.com/en/docs
 * Licence: Open (CC BY 4.0)
 */

import { env } from "../../config/env.js";
import { fetchWithRetry } from "./base-provider.js";
import { AFRICAN_COUNTRIES, CITY_COORDS, type NormalizedSeasonalSignal, type ProviderResult } from "./types.js";

// Impact mappings: weather conditions → commerce impact
function getWeatherImpact(temp: number, rain: number, city: string): {
  severity: number;
  priceImpact: number;
  demandImpact: number;
  eventName: string;
  impactCategories: string[];
} {
  // Heavy rain → delivery disruption, construction pause, umbrella/waterproof demand
  if (rain > 30) {
    return {
      severity: 70,
      priceImpact: 15,
      demandImpact: 40,
      eventName: "Fortes pluies",
      impactCategories: ["Transport", "Construction", "Maison", "Vêtements"],
    };
  }
  if (rain > 10) {
    return {
      severity: 40,
      priceImpact: 5,
      demandImpact: 15,
      eventName: "Saison des pluies",
      impactCategories: ["Transport", "Construction", "Services"],
    };
  }
  // Extreme heat → drinks, AC, shadow products
  if (temp > 35) {
    return {
      severity: 50,
      priceImpact: 10,
      demandImpact: 25,
      eventName: "Vague de chaleur",
      impactCategories: ["Alimentation", "Électronique", "Santé"],
    };
  }
  // Dry season → agriculture, construction boom
  if (rain < 2 && temp > 25) {
    return {
      severity: 30,
      priceImpact: -5,
      demandImpact: 10,
      eventName: "Saison sèche",
      impactCategories: ["Construction", "Agriculture", "Services"],
    };
  }
  return { severity: 10, priceImpact: 0, demandImpact: 0, eventName: "Conditions normales", impactCategories: [] };
}

export async function fetchOpenMeteoSignals(date: Date): Promise<ProviderResult<NormalizedSeasonalSignal>> {
  const signals: NormalizedSeasonalSignal[] = [];
  const errors: string[] = [];
  const start = Date.now();
  const dateStr = date.toISOString().split("T")[0];

  for (const [iso2, meta] of Object.entries(AFRICAN_COUNTRIES)) {
    const coords = CITY_COORDS[meta.capital];
    if (!coords) continue;

    const url = `${env.OPEN_METEO_API_URL}/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;
    const result = await fetchWithRetry<any>({ url }, "OPEN_METEO");

    if (!result.data) {
      errors.push(`OpenMeteo ${iso2}: ${result.error}`);
      continue;
    }

    try {
      const daily = result.data.daily;
      if (!daily) continue;

      const tempMax = daily.temperature_2m_max?.[0] ?? 28;
      const tempMin = daily.temperature_2m_min?.[0] ?? 20;
      const rain = daily.precipitation_sum?.[0] ?? 0;
      const avgTemp = (tempMax + tempMin) / 2;

      const impact = getWeatherImpact(avgTemp, rain, meta.capital);

      // Main weather signal
      signals.push({
        date,
        countryCode: iso2,
        city: meta.capital,
        signalType: "WEATHER",
        eventName: impact.eventName,
        severity: impact.severity,
        priceImpact: impact.priceImpact,
        demandImpact: impact.demandImpact,
        confidence: 90,
        sourceUrl: url,
        metadata: { tempMax, tempMin, avgTemp, rain, unit: "°C/mm" },
      });

      // Generate per-impacted-category signals
      for (const cat of impact.impactCategories) {
        signals.push({
          date,
          countryCode: iso2,
          city: meta.capital,
          signalType: "WEATHER",
          eventName: impact.eventName,
          impactCategory: cat,
          severity: impact.severity,
          priceImpact: impact.priceImpact,
          demandImpact: impact.demandImpact,
          confidence: 85,
          sourceUrl: url,
          metadata: { tempMax, rain },
        });
      }
    } catch {
      errors.push(`OpenMeteo parse error for ${iso2}`);
    }
  }

  return { source: "OPEN_METEO", success: errors.length < 4, data: signals, errors, latencyMs: Date.now() - start, recordCount: signals.length };
}
