/**
 * Seed — Données marché Kinshasa (Congo-Kinshasa)
 *
 * Usage: npx tsx packages/db/prisma/seed-kinshasa.ts
 */

import { PrismaClient, CountryCode } from "@prisma/client";

const prisma = new PrismaClient();

const CONGO_COUNTRY = {
  code: CountryCode.CD,
  nameEnglish: "Democratic Republic of the Congo",
  nameFrench: "République Démocratique du Congo",
  nameLocal: "Republiki ya Kongo ya Dimokalasi",
  currency: "CDF",
  currencyCode: "CDF",
  currencySymbol: "FC",
  timezone: "Africa/Kinshasa",
  dialCode: "+243",
  region: "Central Africa",
};

const KINSHASA_DATA = {
  city: "Kinshasa",
  country: "Congo-Kinshasa",
  countryCode: CountryCode.CD,
  currency: "CDF",
  timezone: "Africa/Kinshasa",
};

const CATEGORIES = [
  {
    category: "Alimentation",
    avgPriceUsdCents: 800,
    minPriceUsdCents: 200,
    maxPriceUsdCents: 5000,
    medianPriceUsdCents: 600,
    sampleSize: 150,
    demandScore: 95,
    supplyScore: 80,
    trendDirection: "UP",
    dataSource: "SEED",
  },
  {
    category: "Vêtements",
    avgPriceUsdCents: 1500,
    minPriceUsdCents: 300,
    maxPriceUsdCents: 12000,
    medianPriceUsdCents: 1200,
    sampleSize: 120,
    demandScore: 85,
    supplyScore: 70,
    trendDirection: "STABLE",
    dataSource: "SEED",
  },
  {
    category: "Électronique",
    avgPriceUsdCents: 15000,
    minPriceUsdCents: 1000,
    maxPriceUsdCents: 100000,
    medianPriceUsdCents: 10000,
    sampleSize: 80,
    demandScore: 90,
    supplyScore: 40,
    trendDirection: "UP",
    dataSource: "SEED",
  },
  {
    category: "Beauté & Soins",
    avgPriceUsdCents: 600,
    minPriceUsdCents: 100,
    maxPriceUsdCents: 5000,
    medianPriceUsdCents: 400,
    sampleSize: 100,
    demandScore: 75,
    supplyScore: 60,
    trendDirection: "UP",
    dataSource: "SEED",
  },
  {
    category: "Maison & Décoration",
    avgPriceUsdCents: 3000,
    minPriceUsdCents: 500,
    maxPriceUsdCents: 30000,
    medianPriceUsdCents: 2000,
    sampleSize: 60,
    demandScore: 55,
    supplyScore: 45,
    trendDirection: "STABLE",
    dataSource: "SEED",
  },
  {
    category: "Transport",
    avgPriceUsdCents: 500,
    minPriceUsdCents: 100,
    maxPriceUsdCents: 5000,
    medianPriceUsdCents: 300,
    sampleSize: 200,
    demandScore: 98,
    supplyScore: 60,
    trendDirection: "UP",
    dataSource: "SEED",
  },
  {
    category: "Services professionnels",
    avgPriceUsdCents: 2000,
    minPriceUsdCents: 500,
    maxPriceUsdCents: 20000,
    medianPriceUsdCents: 1500,
    sampleSize: 70,
    demandScore: 80,
    supplyScore: 35,
    trendDirection: "UP",
    dataSource: "SEED",
  },
  {
    category: "Restauration",
    avgPriceUsdCents: 400,
    minPriceUsdCents: 100,
    maxPriceUsdCents: 3000,
    medianPriceUsdCents: 300,
    sampleSize: 180,
    demandScore: 92,
    supplyScore: 75,
    trendDirection: "STABLE",
    dataSource: "SEED",
  },
  {
    category: "Éducation & Formation",
    avgPriceUsdCents: 5000,
    minPriceUsdCents: 500,
    maxPriceUsdCents: 50000,
    medianPriceUsdCents: 3000,
    sampleSize: 50,
    demandScore: 70,
    supplyScore: 30,
    trendDirection: "UP",
    dataSource: "SEED",
  },
  {
    category: "Santé",
    avgPriceUsdCents: 2500,
    minPriceUsdCents: 200,
    maxPriceUsdCents: 25000,
    medianPriceUsdCents: 1500,
    sampleSize: 40,
    demandScore: 88,
    supplyScore: 25,
    trendDirection: "UP",
    dataSource: "SEED",
  },
];

async function main() {
  console.log("🌍 Seed Kinshasa — Données marché...");

  // Upsert pays
  const country = await prisma.marketCountry.upsert({
    where: { code: CONGO_COUNTRY.code },
    create: CONGO_COUNTRY,
    update: { currency: CONGO_COUNTRY.currency, timezone: CONGO_COUNTRY.timezone },
  });
  console.log(`✅ Pays: ${country.nameFrench} (${country.id})`);

  // Upsert ville
  const city = await prisma.marketCity.upsert({
    where: { city_countryCode: { city: KINSHASA_DATA.city, countryCode: KINSHASA_DATA.countryCode } },
    create: { ...KINSHASA_DATA, marketCountryId: country.id },
    update: { currency: KINSHASA_DATA.currency, timezone: KINSHASA_DATA.timezone },
  });
  console.log(`✅ Ville: ${city.city} (${city.id})`);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const cat of CATEGORIES) {
    const existing = await prisma.marketStats.findFirst({
      where: { marketCityId: city.id, category: cat.category, periodStart: thirtyDaysAgo },
    });

    if (existing) {
      await prisma.marketStats.update({
        where: { id: existing.id },
        data: { ...cat, periodEnd: now },
      });
      console.log(`  🔄 ${cat.category} (mis à jour)`);
    } else {
      await prisma.marketStats.create({
        data: {
          marketCityId: city.id,
          ...cat,
          periodStart: thirtyDaysAgo,
          periodEnd: now,
        },
      });
      console.log(`  ✅ ${cat.category}`);
    }
  }

  console.log(`\n🎉 Seed terminé — ${CATEGORIES.length} catégories pour Kinshasa.`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
