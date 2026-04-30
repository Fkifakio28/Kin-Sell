export type MarketCountryCode = "GLOBAL" | "CD" | "GA" | "CG" | "AO" | "CI" | "GN" | "SN" | "MA";

export type MarketRegionCode = "global" | "central-africa" | "west-africa" | "north-africa" | "southern-africa";

export type MarketCurrencyCode = "CDF" | "USD" | "EUR" | "XAF" | "AOA" | "XOF" | "GNF" | "MAD";

export type MarketContentLanguage = "fr" | "en" | "ln" | "pt" | "ar";

export type MarketCountryConfig = {
  code: MarketCountryCode;
  name: string;
  region: MarketRegionCode;
  defaultCurrency: MarketCurrencyCode;
  defaultContentLanguage: MarketContentLanguage;
  defaultCity: string;
  defaultLat: number;
  defaultLng: number;
  timezone: string;
};

export const MARKET_COUNTRIES: MarketCountryConfig[] = [
  { code: "GLOBAL", name: "🌍 Global (Tous les pays)", region: "global", defaultCurrency: "USD", defaultContentLanguage: "fr", defaultCity: "Kinshasa", defaultLat: -4.325, defaultLng: 15.322, timezone: "Africa/Kinshasa" },
  { code: "CD", name: "RDC (Kinshasa)", region: "central-africa", defaultCurrency: "CDF", defaultContentLanguage: "fr", defaultCity: "Kinshasa", defaultLat: -4.325, defaultLng: 15.322, timezone: "Africa/Kinshasa" },
  { code: "GA", name: "Gabon", region: "central-africa", defaultCurrency: "XAF", defaultContentLanguage: "fr", defaultCity: "Libreville", defaultLat: 0.4162, defaultLng: 9.4673, timezone: "Africa/Libreville" },
  { code: "CG", name: "Congo-Brazzaville", region: "central-africa", defaultCurrency: "XAF", defaultContentLanguage: "fr", defaultCity: "Brazzaville", defaultLat: -4.2634, defaultLng: 15.2429, timezone: "Africa/Brazzaville" },
  { code: "AO", name: "Angola", region: "southern-africa", defaultCurrency: "AOA", defaultContentLanguage: "pt", defaultCity: "Luanda", defaultLat: -8.8390, defaultLng: 13.2894, timezone: "Africa/Luanda" },
  { code: "CI", name: "Côte d'Ivoire", region: "west-africa", defaultCurrency: "XOF", defaultContentLanguage: "fr", defaultCity: "Abidjan", defaultLat: 5.3600, defaultLng: -4.0083, timezone: "Africa/Abidjan" },
  { code: "GN", name: "Guinée Conakry", region: "west-africa", defaultCurrency: "GNF", defaultContentLanguage: "fr", defaultCity: "Conakry", defaultLat: 9.6412, defaultLng: -13.5784, timezone: "Africa/Conakry" },
  { code: "SN", name: "Sénégal", region: "west-africa", defaultCurrency: "XOF", defaultContentLanguage: "fr", defaultCity: "Dakar", defaultLat: 14.7167, defaultLng: -17.4677, timezone: "Africa/Dakar" },
  { code: "MA", name: "Maroc", region: "north-africa", defaultCurrency: "MAD", defaultContentLanguage: "ar", defaultCity: "Casablanca", defaultLat: 33.5731, defaultLng: -7.5898, timezone: "Africa/Casablanca" },
];

export const MARKET_COUNTRY_BY_CODE: Record<MarketCountryCode, MarketCountryConfig> = MARKET_COUNTRIES.reduce(
  (acc, country) => {
    acc[country.code] = country;
    return acc;
  },
  {} as Record<MarketCountryCode, MarketCountryConfig>
);

export function getMarketCountry(code: MarketCountryCode): MarketCountryConfig {
  return MARKET_COUNTRY_BY_CODE[code];
}
