/**
 * SEASONAL CALENDAR PROVIDER — Religious events, school, harvest, tourism
 * Source: Static calendar enriched with date math (Hijri, etc.)
 * Licence: Internal — no API needed
 */

import { AFRICAN_COUNTRIES, type NormalizedSeasonalSignal, type ProviderResult } from "./types.js";

// ── Calendrier saisonnier Afrique (statique, enrichi chaque année) ──

interface SeasonalEvent {
  name: string;
  signalType: "RELIGIOUS_EVENT" | "SCHOOL_CALENDAR" | "HARVEST" | "TOURISM" | "CURRENCY";
  monthStart: number;
  monthEnd: number;
  countries: string[] | "ALL";
  impactCategories: string[];
  severity: number;
  priceImpact: number;
  demandImpact: number;
}

// Approximate Ramadan dates (shifts ~11 days/year, 2026: ~Feb 18 - Mar 19)
const EVENTS_2026: SeasonalEvent[] = [
  // ── Événements religieux ──
  {
    name: "Ramadan",
    signalType: "RELIGIOUS_EVENT",
    monthStart: 2, monthEnd: 3,
    countries: ["CD", "CG", "SN", "GN", "MA", "CI", "GA"],
    impactCategories: ["Alimentation", "Vêtements", "Beauté"],
    severity: 80, priceImpact: 25, demandImpact: 40,
  },
  {
    name: "Aïd el-Fitr",
    signalType: "RELIGIOUS_EVENT",
    monthStart: 3, monthEnd: 3,
    countries: ["CD", "CG", "SN", "GN", "MA", "CI", "GA"],
    impactCategories: ["Vêtements", "Beauté", "Alimentation", "Électronique"],
    severity: 85, priceImpact: 20, demandImpact: 50,
  },
  {
    name: "Aïd el-Adha",
    signalType: "RELIGIOUS_EVENT",
    monthStart: 5, monthEnd: 6,
    countries: ["CD", "SN", "GN", "MA", "CI"],
    impactCategories: ["Alimentation", "Vêtements"],
    severity: 70, priceImpact: 20, demandImpact: 35,
  },
  {
    name: "Pâques",
    signalType: "RELIGIOUS_EVENT",
    monthStart: 4, monthEnd: 4,
    countries: ["CD", "CG", "GA", "AO", "CI"],
    impactCategories: ["Alimentation", "Vêtements", "Beauté"],
    severity: 60, priceImpact: 10, demandImpact: 25,
  },
  {
    name: "Noël & Nouvel An",
    signalType: "RELIGIOUS_EVENT",
    monthStart: 12, monthEnd: 1,
    countries: "ALL",
    impactCategories: ["Alimentation", "Vêtements", "Électronique", "Beauté", "Maison"],
    severity: 90, priceImpact: 30, demandImpact: 60,
  },

  // ── Rentrées scolaires ──
  {
    name: "Rentrée scolaire (Afrique centrale)",
    signalType: "SCHOOL_CALENDAR",
    monthStart: 9, monthEnd: 10,
    countries: ["CD", "CG", "GA"],
    impactCategories: ["Éducation", "Vêtements", "Transport"],
    severity: 75, priceImpact: 15, demandImpact: 45,
  },
  {
    name: "Rentrée scolaire (Afrique de l'Ouest)",
    signalType: "SCHOOL_CALENDAR",
    monthStart: 10, monthEnd: 10,
    countries: ["CI", "SN", "GN"],
    impactCategories: ["Éducation", "Vêtements", "Transport"],
    severity: 75, priceImpact: 15, demandImpact: 45,
  },
  {
    name: "Rentrée scolaire (Maroc)",
    signalType: "SCHOOL_CALENDAR",
    monthStart: 9, monthEnd: 9,
    countries: ["MA"],
    impactCategories: ["Éducation", "Vêtements", "Transport", "Électronique"],
    severity: 70, priceImpact: 12, demandImpact: 40,
  },
  {
    name: "Rentrée scolaire (Angola)",
    signalType: "SCHOOL_CALENDAR",
    monthStart: 2, monthEnd: 3,
    countries: ["AO"],
    impactCategories: ["Éducation", "Vêtements", "Transport"],
    severity: 70, priceImpact: 12, demandImpact: 40,
  },

  // ── Saisons agricoles ──
  {
    name: "Récolte saison A (Afrique centrale)",
    signalType: "HARVEST",
    monthStart: 1, monthEnd: 2,
    countries: ["CD", "CG"],
    impactCategories: ["Agriculture", "Alimentation", "Transport"],
    severity: 60, priceImpact: -15, demandImpact: 20,
  },
  {
    name: "Récolte saison B (Afrique centrale)",
    signalType: "HARVEST",
    monthStart: 7, monthEnd: 8,
    countries: ["CD", "CG"],
    impactCategories: ["Agriculture", "Alimentation", "Transport"],
    severity: 55, priceImpact: -10, demandImpact: 15,
  },
  {
    name: "Récolte principale (Afrique de l'Ouest)",
    signalType: "HARVEST",
    monthStart: 10, monthEnd: 12,
    countries: ["CI", "SN", "GN"],
    impactCategories: ["Agriculture", "Alimentation"],
    severity: 65, priceImpact: -20, demandImpact: 25,
  },

  // ── Tourisme ──
  {
    name: "Haute saison touristique (Maroc)",
    signalType: "TOURISM",
    monthStart: 6, monthEnd: 9,
    countries: ["MA"],
    impactCategories: ["Restauration", "Transport", "Services", "Beauté"],
    severity: 70, priceImpact: 20, demandImpact: 40,
  },
  {
    name: "Tourisme saison sèche (Gabon)",
    signalType: "TOURISM",
    monthStart: 6, monthEnd: 9,
    countries: ["GA"],
    impactCategories: ["Restauration", "Transport", "Services"],
    severity: 50, priceImpact: 10, demandImpact: 20,
  },
  {
    name: "Tourisme Angola (Carnaval Luanda)",
    signalType: "TOURISM",
    monthStart: 2, monthEnd: 2,
    countries: ["AO"],
    impactCategories: ["Restauration", "Vêtements", "Beauté", "Transport"],
    severity: 55, priceImpact: 15, demandImpact: 30,
  },
];

export async function fetchSeasonalCalendarSignals(date: Date): Promise<ProviderResult<NormalizedSeasonalSignal>> {
  const signals: NormalizedSeasonalSignal[] = [];
  const month = date.getMonth() + 1; // 1-12
  const start = Date.now();

  for (const event of EVENTS_2026) {
    // Check if current month falls within event range
    const inRange = event.monthStart <= event.monthEnd
      ? month >= event.monthStart && month <= event.monthEnd
      : month >= event.monthStart || month <= event.monthEnd; // Wraps around year

    if (!inRange) continue;

    const targetCountries = event.countries === "ALL"
      ? Object.keys(AFRICAN_COUNTRIES)
      : event.countries;

    for (const iso2 of targetCountries) {
      const meta = AFRICAN_COUNTRIES[iso2];
      if (!meta) continue;

      signals.push({
        date,
        countryCode: iso2,
        city: meta.capital,
        signalType: event.signalType,
        eventName: event.name,
        impactCategory: event.impactCategories.join(","),
        severity: event.severity,
        priceImpact: event.priceImpact,
        demandImpact: event.demandImpact,
        confidence: 90, // High confidence for known calendar events
        metadata: {
          impactCategories: event.impactCategories,
          monthRange: `${event.monthStart}-${event.monthEnd}`,
        },
      });
    }
  }

  return { source: "SEASONAL_CALENDAR", success: true, data: signals, errors: [], latencyMs: Date.now() - start, recordCount: signals.length };
}
