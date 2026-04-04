/**
 * Platform Configuration — Source unique pour la configuration multi-pays Kin-Sell.
 *
 * Utilisé par tous les modules backend pour résoudre :
 *  - pays actifs
 *  - devises actives
 *  - langues actives
 *  - villes par défaut
 *  - régions + fallback
 *
 * Les valeurs sont statiques et en mémoire (pas de requête DB).
 * Pour un configurateur admin dynamique futur, ces valeurs pourront être
 * chargées depuis MarketCountry au démarrage.
 */

import type { CountryCode as PrismaCountryCode } from "@prisma/client";

// ── Types ───────────────────────────────────────────────────────────

export type CountryCode = PrismaCountryCode;

export type RegionCode = "central-africa" | "west-africa" | "north-africa" | "southern-africa";

export type CurrencyCode = "CDF" | "USD" | "EUR" | "XAF" | "AOA" | "XOF" | "GNF" | "MAD";

export type ContentLanguage = "fr" | "en" | "ln" | "pt" | "ar";

export type CountryConfig = {
  code: CountryCode;
  name: string;
  region: RegionCode;
  currency: CurrencyCode;
  language: ContentLanguage;
  defaultCity: string;
  timezone: string;
  active: boolean;
};

// ── Configuration pays ──────────────────────────────────────────────

export const PLATFORM_COUNTRIES: CountryConfig[] = [
  { code: "CD", name: "RDC (Kinshasa)",    region: "central-africa",  currency: "CDF", language: "fr", defaultCity: "Kinshasa",     timezone: "Africa/Kinshasa",     active: true },
  { code: "GA", name: "Gabon",             region: "central-africa",  currency: "XAF", language: "fr", defaultCity: "Libreville",   timezone: "Africa/Libreville",   active: true },
  { code: "CG", name: "Congo-Brazzaville", region: "central-africa",  currency: "XAF", language: "fr", defaultCity: "Brazzaville",  timezone: "Africa/Brazzaville",  active: true },
  { code: "AO", name: "Angola",            region: "southern-africa", currency: "AOA", language: "pt", defaultCity: "Luanda",       timezone: "Africa/Luanda",       active: true },
  { code: "CI", name: "Côte d'Ivoire",     region: "west-africa",     currency: "XOF", language: "fr", defaultCity: "Abidjan",      timezone: "Africa/Abidjan",      active: true },
  { code: "GN", name: "Guinée Conakry",    region: "west-africa",     currency: "GNF", language: "fr", defaultCity: "Conakry",      timezone: "Africa/Conakry",      active: true },
  { code: "SN", name: "Sénégal",           region: "west-africa",     currency: "XOF", language: "fr", defaultCity: "Dakar",        timezone: "Africa/Dakar",        active: true },
  { code: "MA", name: "Maroc",             region: "north-africa",    currency: "MAD", language: "ar", defaultCity: "Casablanca",   timezone: "Africa/Casablanca",   active: true },
];

// ── Lookups ─────────────────────────────────────────────────────────

const _byCode = new Map<string, CountryConfig>(PLATFORM_COUNTRIES.map((c) => [c.code, c]));

/** Retourne la config d'un pays par code ISO. */
export function getCountryConfig(code: CountryCode | string): CountryConfig | undefined {
  return _byCode.get(code.toUpperCase());
}

/** Retourne la config d'un pays, ou celle de CD (fallback platform). */
export function getCountryConfigOrDefault(code?: CountryCode | string | null): CountryConfig {
  if (code) {
    const cfg = _byCode.get(code.toUpperCase());
    if (cfg) return cfg;
  }
  return _byCode.get("CD")!;
}

/** Tous les pays actifs. */
export function getActiveCountries(): CountryConfig[] {
  return PLATFORM_COUNTRIES.filter((c) => c.active);
}

/** Tous les codes pays actifs. */
export function getActiveCountryCodes(): CountryCode[] {
  return getActiveCountries().map((c) => c.code);
}

// ── Devises ─────────────────────────────────────────────────────────

/** Toutes les devises uniques des pays actifs + USD + EUR. */
export function getActiveCurrencies(): CurrencyCode[] {
  const set = new Set<CurrencyCode>(["USD", "EUR"]);
  for (const c of getActiveCountries()) set.add(c.currency);
  return [...set];
}

/** Devise par défaut pour un pays donné. */
export function getDefaultCurrency(countryCode?: CountryCode | string | null): CurrencyCode {
  return getCountryConfigOrDefault(countryCode).currency;
}

// ── Villes ──────────────────────────────────────────────────────────

/** Ville par défaut pour un pays donné (remplace tout hardcoded "Kinshasa"). */
export function getDefaultCity(countryCode?: CountryCode | string | null): string {
  return getCountryConfigOrDefault(countryCode).defaultCity;
}

// ── Régions ─────────────────────────────────────────────────────────

const _regionCountries = new Map<RegionCode, CountryConfig[]>();
for (const c of PLATFORM_COUNTRIES) {
  const list = _regionCountries.get(c.region) ?? [];
  list.push(c);
  _regionCountries.set(c.region, list);
}

/** Pays de la même région. */
export function getSameRegionCodes(code: CountryCode | string): CountryCode[] {
  const cfg = getCountryConfig(code);
  if (!cfg) return [code as CountryCode];
  return (_regionCountries.get(cfg.region) ?? [cfg]).map((c) => c.code);
}

/** Toutes les régions avec leurs pays. */
export function getRegions(): Map<RegionCode, CountryConfig[]> {
  return _regionCountries;
}

// ── Langues ─────────────────────────────────────────────────────────

export function getActiveLanguages(): ContentLanguage[] {
  const set = new Set<ContentLanguage>(["fr", "en"]);
  for (const c of getActiveCountries()) set.add(c.language);
  return [...set];
}

export function getDefaultLanguage(countryCode?: CountryCode | string | null): ContentLanguage {
  return getCountryConfigOrDefault(countryCode).language;
}
