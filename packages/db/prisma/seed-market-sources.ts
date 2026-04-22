/**
 * Seed Kin-Sell Analytique+ — Sources
 *
 * Charge les catalogues JSON par pays (apps/api/src/modules/market-intel/sources/{CC}.json)
 * et upsert dans la table MarketSource (clé unique [baseUrl, countryCode]).
 *
 * Usage :
 *   cd packages/db
 *   npx tsx prisma/seed-market-sources.ts
 *
 * Idempotent.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const prisma = new PrismaClient();

type SourceEntry = {
  name: string;
  baseUrl: string;
  type: string;
  parser: string;
  language: string;
  trusted: boolean;
  verified?: boolean;
};

type CountryFile = {
  country: string;
  currency: string;
  languages: string[];
  sources: SourceEntry[];
};

const SOURCES_DIR = resolve(__dirname, "../../../apps/api/src/modules/market-intel/sources");

async function main() {
  const files = readdirSync(SOURCES_DIR).filter((f) => f.endsWith(".json"));
  console.log(`[seed-market-sources] Scanning ${SOURCES_DIR}`);
  console.log(`[seed-market-sources] Found ${files.length} country files: ${files.join(", ")}`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const file of files) {
    const full = join(SOURCES_DIR, file);
    const data: CountryFile = JSON.parse(readFileSync(full, "utf-8"));

    if (!data.country || !Array.isArray(data.sources)) {
      console.warn(`[seed-market-sources] Skipping malformed file: ${file}`);
      continue;
    }

    let created = 0;
    let updated = 0;

    for (const src of data.sources) {
      // Garde : on ne charge que les sources explicitement vérifiées
      if (src.verified === false) {
        totalSkipped++;
        continue;
      }

      const before = await prisma.marketSource.findUnique({
        where: { baseUrl_countryCode: { baseUrl: src.baseUrl, countryCode: data.country } },
      });

      await prisma.marketSource.upsert({
        where: { baseUrl_countryCode: { baseUrl: src.baseUrl, countryCode: data.country } },
        create: {
          name: src.name,
          baseUrl: src.baseUrl,
          type: src.type,
          countryCode: data.country,
          parser: src.parser,
          language: src.language ?? "fr",
          trusted: src.trusted ?? false,
          active: true,
        },
        update: {
          name: src.name,
          type: src.type,
          parser: src.parser,
          language: src.language ?? "fr",
          trusted: src.trusted ?? false,
        },
      });

      if (before) updated++;
      else created++;
    }

    console.log(`  ${data.country}: ${data.sources.length} sources | +${created} new, ~${updated} updated`);
    totalCreated += created;
    totalUpdated += updated;
  }

  console.log(
    `[seed-market-sources] Done. Created: ${totalCreated}, Updated: ${totalUpdated}, Skipped(unverified): ${totalSkipped}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
