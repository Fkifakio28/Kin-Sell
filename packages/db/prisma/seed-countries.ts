/**
 * Seed — Bootstrap MarketCountry + MarketCity pour tous les pays Kin-Sell
 *
 * Usage: npx tsx packages/db/prisma/seed-countries.ts
 *
 * Idempotent (upsert) — peut être relancé sans risque.
 */

import { PrismaClient, CountryCode } from "@prisma/client";

const prisma = new PrismaClient();

type CountryDef = {
  code: CountryCode;
  nameEnglish: string;
  nameFrench: string;
  nameLocal: string;
  currency: string;
  currencyCode: string;
  currencySymbol: string;
  timezone: string;
  dialCode: string;
  region: string;
  cities: CityDef[];
};

type CityDef = {
  city: string;
  currency: string;
  timezone: string;
  isActive: boolean;
};

const COUNTRIES: CountryDef[] = [
  {
    code: CountryCode.CD,
    nameEnglish: "Democratic Republic of the Congo",
    nameFrench: "République Démocratique du Congo",
    nameLocal: "Republiki ya Kongo ya Dimokalasi",
    currency: "CDF", currencyCode: "CDF", currencySymbol: "FC",
    timezone: "Africa/Kinshasa", dialCode: "+243", region: "Central Africa",
    cities: [
      { city: "Kinshasa", currency: "CDF", timezone: "Africa/Kinshasa", isActive: true },
      { city: "Lubumbashi", currency: "CDF", timezone: "Africa/Lubumbashi", isActive: true },
      { city: "Mbuji-Mayi", currency: "CDF", timezone: "Africa/Lubumbashi", isActive: false },
      { city: "Goma", currency: "CDF", timezone: "Africa/Lubumbashi", isActive: false },
    ],
  },
  {
    code: CountryCode.GA,
    nameEnglish: "Gabon",
    nameFrench: "Gabon",
    nameLocal: "Gabon",
    currency: "XAF", currencyCode: "XAF", currencySymbol: "FCFA",
    timezone: "Africa/Libreville", dialCode: "+241", region: "Central Africa",
    cities: [
      { city: "Libreville", currency: "XAF", timezone: "Africa/Libreville", isActive: true },
      { city: "Port-Gentil", currency: "XAF", timezone: "Africa/Libreville", isActive: false },
    ],
  },
  {
    code: CountryCode.CG,
    nameEnglish: "Republic of the Congo",
    nameFrench: "Congo-Brazzaville",
    nameLocal: "Kongo",
    currency: "XAF", currencyCode: "XAF", currencySymbol: "FCFA",
    timezone: "Africa/Brazzaville", dialCode: "+242", region: "Central Africa",
    cities: [
      { city: "Brazzaville", currency: "XAF", timezone: "Africa/Brazzaville", isActive: true },
      { city: "Pointe-Noire", currency: "XAF", timezone: "Africa/Brazzaville", isActive: false },
    ],
  },
  {
    code: CountryCode.AO,
    nameEnglish: "Angola",
    nameFrench: "Angola",
    nameLocal: "Angola",
    currency: "AOA", currencyCode: "AOA", currencySymbol: "Kz",
    timezone: "Africa/Luanda", dialCode: "+244", region: "Southern Africa",
    cities: [
      { city: "Luanda", currency: "AOA", timezone: "Africa/Luanda", isActive: true },
      { city: "Huambo", currency: "AOA", timezone: "Africa/Luanda", isActive: false },
    ],
  },
  {
    code: CountryCode.CI,
    nameEnglish: "Ivory Coast",
    nameFrench: "Côte d'Ivoire",
    nameLocal: "Côte d'Ivoire",
    currency: "XOF", currencyCode: "XOF", currencySymbol: "CFA",
    timezone: "Africa/Abidjan", dialCode: "+225", region: "West Africa",
    cities: [
      { city: "Abidjan", currency: "XOF", timezone: "Africa/Abidjan", isActive: true },
      { city: "Yamoussoukro", currency: "XOF", timezone: "Africa/Abidjan", isActive: false },
    ],
  },
  {
    code: CountryCode.GN,
    nameEnglish: "Guinea",
    nameFrench: "Guinée Conakry",
    nameLocal: "Guinée",
    currency: "GNF", currencyCode: "GNF", currencySymbol: "FG",
    timezone: "Africa/Conakry", dialCode: "+224", region: "West Africa",
    cities: [
      { city: "Conakry", currency: "GNF", timezone: "Africa/Conakry", isActive: true },
    ],
  },
  {
    code: CountryCode.SN,
    nameEnglish: "Senegal",
    nameFrench: "Sénégal",
    nameLocal: "Sénégal",
    currency: "XOF", currencyCode: "XOF", currencySymbol: "CFA",
    timezone: "Africa/Dakar", dialCode: "+221", region: "West Africa",
    cities: [
      { city: "Dakar", currency: "XOF", timezone: "Africa/Dakar", isActive: true },
      { city: "Thiès", currency: "XOF", timezone: "Africa/Dakar", isActive: false },
    ],
  },
  {
    code: CountryCode.MA,
    nameEnglish: "Morocco",
    nameFrench: "Maroc",
    nameLocal: "المغرب",
    currency: "MAD", currencyCode: "MAD", currencySymbol: "DH",
    timezone: "Africa/Casablanca", dialCode: "+212", region: "North Africa",
    cities: [
      { city: "Casablanca", currency: "MAD", timezone: "Africa/Casablanca", isActive: true },
      { city: "Rabat", currency: "MAD", timezone: "Africa/Casablanca", isActive: false },
      { city: "Marrakech", currency: "MAD", timezone: "Africa/Casablanca", isActive: false },
    ],
  },
];

/** Taux de change initiaux (approximatifs). L'admin peut les ajuster via le dashboard. */
const INITIAL_RATES: Array<{ from: string; to: string; rate: number }> = [
  { from: "USD", to: "CDF", rate: 2850 },
  { from: "USD", to: "EUR", rate: 0.92 },
  { from: "USD", to: "XAF", rate: 605 },
  { from: "USD", to: "AOA", rate: 905 },
  { from: "USD", to: "XOF", rate: 605 },
  { from: "USD", to: "GNF", rate: 8600 },
  { from: "USD", to: "MAD", rate: 9.9 },
];

async function main() {
  console.log("🌍 Seed multi-pays — Bootstrap MarketCountry + MarketCity + CurrencyRate...\n");

  for (const def of COUNTRIES) {
    const country = await prisma.marketCountry.upsert({
      where: { code: def.code },
      create: {
        code: def.code,
        nameEnglish: def.nameEnglish,
        nameFrench: def.nameFrench,
        nameLocal: def.nameLocal,
        currency: def.currency,
        currencyCode: def.currencyCode,
        currencySymbol: def.currencySymbol,
        timezone: def.timezone,
        dialCode: def.dialCode,
        region: def.region,
      },
      update: {
        nameFrench: def.nameFrench,
        currency: def.currency,
        timezone: def.timezone,
      },
    });
    console.log(`  ✅ Pays: ${def.nameFrench} (${def.code})`);

    for (const cityDef of def.cities) {
      await prisma.marketCity.upsert({
        where: { city_countryCode: { city: cityDef.city, countryCode: def.code } },
        create: {
          city: cityDef.city,
          country: def.nameFrench,
          countryCode: def.code,
          currency: cityDef.currency,
          timezone: cityDef.timezone,
          isActive: cityDef.isActive,
          marketCountryId: country.id,
        },
        update: {
          currency: cityDef.currency,
          isActive: cityDef.isActive,
        },
      });
      console.log(`     ${cityDef.isActive ? "🟢" : "⚪"} ${cityDef.city}`);
    }
  }

  console.log("\n💱 Taux de change initiaux...");
  for (const rate of INITIAL_RATES) {
    await prisma.currencyRate.upsert({
      where: { fromCurrency_toCurrency: { fromCurrency: rate.from, toCurrency: rate.to } },
      create: { fromCurrency: rate.from, toCurrency: rate.to, rate: rate.rate, isManual: false },
      update: {},  // Ne pas écraser les taux modifiés manuellement
    });
    console.log(`  ${rate.from} → ${rate.to}: ${rate.rate}`);
  }

  console.log("\n✅ Seed multi-pays terminé.");
}

main()
  .catch((err) => {
    console.error("❌ Erreur seed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
