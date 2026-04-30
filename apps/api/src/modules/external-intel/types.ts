/**
 * EXTERNAL INTELLIGENCE — Types & Interfaces
 * Kin-Sell
 */

// ── Signal types normalisés vers taxonomie Kin-Sell ──

export interface NormalizedMarketSignal {
  date: Date;
  countryCode: string;
  city?: string;
  category: string;
  subcategory?: string;
  signalType: "PRICE_INDEX" | "TRADE_VOLUME" | "FOOD_PRICE" | "FX_RATE" | "COMMODITY";
  value: number;
  unit: string;
  previousValue?: number;
  deltaPercent?: number;
  confidence: number;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedJobSignal {
  date: Date;
  countryCode: string;
  city?: string;
  serviceType: string;
  category: string;
  jobCount: number;
  avgSalaryLocal?: number;
  avgSalaryUsd?: number;
  demandTrend: "RISING" | "STABLE" | "DECLINING";
  topSkills: string[];
  confidence: number;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedSeasonalSignal {
  date: Date;
  countryCode: string;
  city?: string;
  signalType: "WEATHER" | "RELIGIOUS_EVENT" | "SCHOOL_CALENDAR" | "HARVEST" | "TOURISM" | "CURRENCY";
  eventName?: string;
  impactCategory?: string;
  severity: number;
  priceImpact: number;
  demandImpact: number;
  confidence: number;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderResult<T> {
  source: string;
  success: boolean;
  data: T[];
  errors: string[];
  latencyMs: number;
  recordCount: number;
}

// ── Trigger types pour les scénarios IA ──

export type ExternalTrigger =
  | "SEASONAL_SCHOOL_PEAK"
  | "RELIGIOUS_EVENT_SPIKE"
  | "RAINY_SEASON_SERVICE_SURGE"
  | "HARVEST_SUPPLY_GLUT"
  | "CROSS_BORDER_ROUTE_OPPORTUNITY"
  | "JOB_SKILL_DEMAND_SPIKE"
  | "CURRENCY_SHOCK_REPRICING"
  | "TOURISM_WINDOW_PROMO"
  | "WEEKEND_CITY_MICROPEAK"
  | "INTERNAL_CHAT_SIGNAL_BREAKOUT";

export interface DetectedTrigger {
  trigger: ExternalTrigger;
  confidence: number;
  countryCode: string;
  city?: string;
  category?: string;
  severity: number; // 0-100
  explanation: string;
  recommendedAction: string;
  dataPoints: Record<string, unknown>;
}

// ── Fusion output ──

export interface FusedIntelligence {
  opportunityScore: number; // 0-100
  demandForecast7d: "RISING" | "STABLE" | "DECLINING";
  demandForecast30d: "RISING" | "STABLE" | "DECLINING";
  recommendedCountries: string[];
  recommendedCities: string[];
  recommendedPublishWindows: string[];
  pricingAdjustmentPercent: number;
  activeTriggers: DetectedTrigger[];
  explanation: string;
  sourceAttribution: string[];
  confidence: number;
  computedAt: string;
}

// ── Country mappings ──

export const AFRICAN_COUNTRIES: Record<string, { iso3: string; iso2: string; name: string; currency: string; capital: string; timezone: string }> = {
  CD: { iso3: "COD", iso2: "CD", name: "RD Congo", currency: "CDF", capital: "Kinshasa", timezone: "Africa/Kinshasa" },
  CG: { iso3: "COG", iso2: "CG", name: "Congo-Brazzaville", currency: "XAF", capital: "Brazzaville", timezone: "Africa/Brazzaville" },
  GA: { iso3: "GAB", iso2: "GA", name: "Gabon", currency: "XAF", capital: "Libreville", timezone: "Africa/Libreville" },
  AO: { iso3: "AGO", iso2: "AO", name: "Angola", currency: "AOA", capital: "Luanda", timezone: "Africa/Luanda" },
  CI: { iso3: "CIV", iso2: "CI", name: "Côte d'Ivoire", currency: "XOF", capital: "Abidjan", timezone: "Africa/Abidjan" },
  SN: { iso3: "SEN", iso2: "SN", name: "Sénégal", currency: "XOF", capital: "Dakar", timezone: "Africa/Dakar" },
  GN: { iso3: "GIN", iso2: "GN", name: "Guinée", currency: "GNF", capital: "Conakry", timezone: "Africa/Conakry" },
  MA: { iso3: "MAR", iso2: "MA", name: "Maroc", currency: "MAD", capital: "Casablanca", timezone: "Africa/Casablanca" },
};

/** Map catégorie libre → taxonomie Kin-Sell */
export function normalizeCategory(raw: string): string {
  const lower = raw.toLowerCase().trim();
  const map: Record<string, string> = {
    "food": "Alimentation", "agriculture": "Agriculture", "agri": "Agriculture",
    "electronics": "Électronique", "clothing": "Vêtements", "textile": "Vêtements",
    "beauty": "Beauté", "health": "Santé", "education": "Éducation",
    "transport": "Transport", "construction": "Construction", "services": "Services",
    "restaurant": "Restauration", "furniture": "Maison", "household": "Maison",
    "vehicles": "Transport", "commodities": "Agriculture",
    "cereals": "Alimentation", "oils": "Alimentation", "dairy": "Alimentation",
    "meat": "Alimentation", "sugar": "Alimentation", "fish": "Alimentation",
    "metal": "Construction", "energy": "Services", "fuel": "Transport",
  };
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }
  return raw;
}

/** Coordonnées GPS des capitales africaines pour Open-Meteo */
export const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  "Kinshasa": { lat: -4.325, lon: 15.322 },
  "Brazzaville": { lat: -4.269, lon: 15.271 },
  "Libreville": { lat: 0.390, lon: 9.454 },
  "Luanda": { lat: -8.839, lon: 13.234 },
  "Abidjan": { lat: 5.345, lon: -4.024 },
  "Dakar": { lat: 14.693, lon: -17.444 },
  "Conakry": { lat: 9.538, lon: -13.677 },
  "Casablanca": { lat: 33.573, lon: -7.589 },
};
