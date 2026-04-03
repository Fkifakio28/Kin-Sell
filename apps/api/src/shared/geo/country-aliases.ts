/**
 * Country Aliases — Source unique pour la résolution de noms de pays.
 *
 * Utilisé par : explorer, listings, sokin, et tout module filtrant par pays.
 * Un seul import : import { resolveCountryTerms, COUNTRY_ALIASES, ... } from "../../shared/geo/country-aliases.js";
 */

import type { CountryCode } from "@prisma/client";

export const COUNTRY_ALIASES: Record<string, string[]> = {
  CD: ["CD", "RDC", "RD Congo", "DRC", "Democratic Republic of the Congo", "Congo-Kinshasa"],
  GA: ["GA", "Gabon"],
  CG: ["CG", "Congo", "Congo-Brazzaville", "Republic of the Congo"],
  AO: ["AO", "Angola"],
  CI: ["CI", "Cote d'Ivoire", "Cote d Ivoire", "Ivory Coast", "Côte d'Ivoire"],
  GN: ["GN", "Guinee", "Guinée", "Guinee Conakry", "Guinée Conakry", "Guinea"],
  SN: ["SN", "Senegal", "Sénégal"],
  MA: ["MA", "Maroc", "Morocco"],
};

/** Codes pays valides */
export const VALID_COUNTRY_CODES = Object.keys(COUNTRY_ALIASES) as CountryCode[];

/**
 * Résout un terme pays (code ISO, nom français/anglais) vers la liste d'aliases.
 * Retourne les termes à utiliser dans une requête `contains` insensible à la casse.
 */
export function resolveCountryTerms(country?: string): string[] {
  if (!country) return [];
  const normalized = country.trim().toUpperCase();
  const aliases = COUNTRY_ALIASES[normalized] ?? [country.trim()];
  return aliases.filter((term) => term.trim().length > 0);
}

/**
 * Résout un terme pays vers le code ISO CountryCode.
 * Retourne undefined si non trouvé.
 */
export function resolveCountryCode(country?: string): CountryCode | undefined {
  if (!country) return undefined;
  const normalized = country.trim().toUpperCase();

  // Direct match on code
  if (COUNTRY_ALIASES[normalized]) {
    return normalized as CountryCode;
  }

  // Search in aliases
  const normalizedLower = country.trim().toLowerCase();
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === normalizedLower)) {
      return code as CountryCode;
    }
  }

  return undefined;
}

/** Régions géographiques */
export const COUNTRY_REGIONS: Record<string, CountryCode[]> = {
  "central-africa": ["CD", "GA", "CG"] as CountryCode[],
  "west-africa": ["CI", "GN", "SN"] as CountryCode[],
  "north-africa": ["MA"] as CountryCode[],
  "southern-africa": ["AO"] as CountryCode[],
};

/**
 * Retourne les pays de la même région que le code donné.
 */
export function getSameRegionCountries(code: CountryCode): CountryCode[] {
  for (const countries of Object.values(COUNTRY_REGIONS)) {
    if (countries.includes(code)) {
      return countries;
    }
  }
  return [code];
}
