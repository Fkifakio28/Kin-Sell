export type MarketCountryCode = "CD" | "GA" | "CG" | "AO" | "CI" | "GN" | "SN" | "MA";

export type MarketRegionCode = "central-africa" | "west-africa" | "north-africa" | "southern-africa";

export type MarketCurrencyCode = "CDF" | "USD" | "EUR" | "XAF" | "AOA" | "XOF" | "GNF" | "MAD";

export type MarketContentLanguage = "fr" | "en" | "ln" | "pt" | "ar";

export type MarketCountryConfig = {
  code: MarketCountryCode;
  name: string;
  region: MarketRegionCode;
  defaultCurrency: MarketCurrencyCode;
  defaultContentLanguage: MarketContentLanguage;
  defaultCity: string;
  timezone: string;
};

export const MARKET_COUNTRIES: MarketCountryConfig[] = [
  { code: "CD", name: "RDC (Kinshasa)", region: "central-africa", defaultCurrency: "CDF", defaultContentLanguage: "fr", defaultCity: "Kinshasa", timezone: "Africa/Kinshasa" },
  { code: "GA", name: "Gabon", region: "central-africa", defaultCurrency: "XAF", defaultContentLanguage: "fr", defaultCity: "Libreville", timezone: "Africa/Libreville" },
  { code: "CG", name: "Congo-Brazzaville", region: "central-africa", defaultCurrency: "XAF", defaultContentLanguage: "fr", defaultCity: "Brazzaville", timezone: "Africa/Brazzaville" },
  { code: "AO", name: "Angola", region: "southern-africa", defaultCurrency: "AOA", defaultContentLanguage: "pt", defaultCity: "Luanda", timezone: "Africa/Luanda" },
  { code: "CI", name: "C\u00f4te d'Ivoire", region: "west-africa", defaultCurrency: "XOF", defaultContentLanguage: "fr", defaultCity: "Abidjan", timezone: "Africa/Abidjan" },
  { code: "GN", name: "Guin\u00e9e Conakry", region: "west-africa", defaultCurrency: "GNF", defaultContentLanguage: "fr", defaultCity: "Conakry", timezone: "Africa/Conakry" },
  { code: "SN", name: "S\u00e9n\u00e9gal", region: "west-africa", defaultCurrency: "XOF", defaultContentLanguage: "fr", defaultCity: "Dakar", timezone: "Africa/Dakar" },
  { code: "MA", name: "Maroc", region: "north-africa", defaultCurrency: "MAD", defaultContentLanguage: "ar", defaultCity: "Casablanca", timezone: "Africa/Casablanca" },
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
