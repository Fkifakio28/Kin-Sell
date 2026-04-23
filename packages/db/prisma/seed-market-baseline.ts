/**
 * Seed baseline Market Intel — remplit MarketPrice + MarketSalary pour les 8 pays
 * à partir d'estimations EUR raisonnables, ajustées par ratio cost-of-living.
 *
 * Ce n'est PAS un substitut au crawl réel — mais ça permet d'avoir une UI
 * pleine dès le départ. Le crawler/Gemini enrichira/corrigera ensuite.
 *
 * Usage: npx tsx packages/db/prisma/seed-market-baseline.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// EUR → devise locale (cours moyens 2026, à titre indicatif)
const FX: Record<string, number> = {
  MAD: 10.8, XOF: 655, CDF: 2850, XAF: 655, GNF: 9400, AOA: 930,
};
const CCY: Record<string, string> = {
  MA: 'MAD', CI: 'XOF', SN: 'XOF', CD: 'CDF', GA: 'XAF', CG: 'XAF', GN: 'GNF', AO: 'AOA',
};
// Ratio pouvoir d'achat (base 1 = moyenne). Maroc le plus cher, Guinée le moins cher.
const COL: Record<string, number> = {
  MA: 1.10, CI: 1.00, SN: 0.95, GA: 1.15, CG: 1.05, CD: 0.85, GN: 0.75, AO: 1.00,
};
const COUNTRIES = Object.keys(CCY);

// Prix EUR baseline par slug (medianTarget). Fourchette ±25%.
const PRICE_EUR_BY_SLUG: Record<string, number> = {
  'smartphone-samsung-a16': 180, 'smartphone-samsung-a54': 350, 'smartphone-iphone-13': 750,
  'smartphone-tecno-spark-20': 130, 'smartphone-infinix-hot-40': 140, 'smartphone-xiaomi-redmi-13': 160,
  'laptop-hp-15': 550, 'laptop-dell-latitude': 700, 'laptop-macbook-air-m2': 1350, 'imprimante-hp-laserjet': 220,
  'tv-samsung-55-4k': 650, 'tv-lg-43-4k': 450, 'panneau-solaire-100w': 90, 'batterie-oraimo-powerstation': 75,
  'frigo-samsung-300l': 520, 'frigo-lg-250l': 430, 'machine-laver-lg-7kg': 480, 'climatiseur-lg-12000btu': 620,
  'cuisiniere-gaz-4feux': 240, 'ventilateur-brasseur': 55,
  'riz-parfume-25kg': 35, 'huile-tournesol-5l': 12, 'farine-ble-50kg': 38, 'sucre-blanc-50kg': 48, 'lait-poudre-2-5kg': 18,
  'paracetamol-1g-boite': 4, 'tensiometre-auto': 35,
  'jean-homme-denim': 22, 'robe-pagne-afro': 35, 'sneakers-nike-airforce': 95,
  'creme-nivea-hommes': 6, 'parfum-axe-deo': 4,
  'couches-pampers-maxi': 16, 'biberon-avent-260ml': 12,
  'canape-3-places': 380, 'matelas-140x190': 180, 'table-salle-manger-6': 260,
  'ballon-foot-adidas': 25, 'velo-vtt-26': 180,
};

// Salaire EUR mensuel baseline par slug
const SALARY_EUR_BY_SLUG: Record<string, number> = {
  'driver-taxi': 220, 'driver-vtc': 280, 'driver-truck': 350, 'driver-motorcycle': 160,
  'daycare-home': 180, 'daycare-center': 200, 'teacher-primary': 280, 'teacher-secondary': 380,
  'teacher-private-tutor': 150, 'teacher-language': 320,
  'nurse-registered': 420, 'nurse-assistant': 240, 'nurse-home-care': 380,
  'beauty-hairdresser': 230, 'beauty-makeup-artist': 380, 'tailor-traditional': 200, 'tailor-fashion': 320,
  'events-dj': 280, 'delivery-motorbike': 180, 'gardening-residential': 160,
  'accounting-junior': 380, 'accounting-senior': 850,
};

// Fallback par catégorie si slug non listé
const CAT_FALLBACK_PRICE: Record<string, number> = {
  phone: 200, it: 500, electronics: 300, appliances: 400, food: 25, pharmacy: 15,
  clothes: 30, beauty: 8, baby: 14, furniture: 250, sports: 40,
};

function round(n: number): number { return Math.round(n); }
function variance(median: number, pct = 0.25): [number, number, number] {
  const min = round(median * (1 - pct));
  const max = round(median * (1 + pct));
  return [min, median, max];
}

async function main() {
  const products = await prisma.marketProduct.findMany();
  const jobs = await prisma.marketJob.findMany();

  console.log(`[baseline] ${products.length} products × ${COUNTRIES.length} countries = ${products.length * COUNTRIES.length} prices`);
  console.log(`[baseline] ${jobs.length} jobs × ${COUNTRIES.length} countries = ${jobs.length * COUNTRIES.length} salaries`);

  let prices = 0, salaries = 0;

  // ── Prices ──
  for (const p of products) {
    const baseEur = PRICE_EUR_BY_SLUG[p.slug] ?? CAT_FALLBACK_PRICE[p.categoryId] ?? 50;
    for (const c of COUNTRIES) {
      const ccy = CCY[c]; const fx = FX[ccy]; const col = COL[c];
      const medianEur = baseEur * col;
      const medianLocal = round(medianEur * fx);
      const [minL, medL, maxL] = variance(medianLocal);
      try {
        await prisma.marketPrice.create({
          data: {
            productId: p.id,
            countryCode: c,
            priceMinLocal: minL,
            priceMaxLocal: maxL,
            priceMedianLocal: medL,
            localCurrency: ccy,
            priceMedianEurCents: round(medianEur * 100),
            sampleSize: 6,
            sourceIds: [],
            confidence: 0.55, // baseline statique
          },
        });
        prices++;
      } catch (e: any) {
        console.warn(`  price fail ${p.slug}/${c}:`, e.message);
      }
    }
  }

  // ── Salaries ──
  for (const j of jobs) {
    const baseEur = SALARY_EUR_BY_SLUG[j.slug] ?? 280;
    for (const c of COUNTRIES) {
      const ccy = CCY[c]; const fx = FX[ccy]; const col = COL[c];
      const sMed = round(baseEur * col * fx);
      const [minL, medL, maxL] = variance(sMed, 0.30);
      try {
        await prisma.marketSalary.create({
          data: {
            jobId: j.id,
            countryCode: c,
            salaryMinLocal: minL,
            salaryMaxLocal: maxL,
            salaryMedianLocal: medL,
            localCurrency: ccy,
            salaryMedianEurCents: round(baseEur * col * 100),
            unit: 'month',
            sampleSize: 5,
            sourceIds: [],
            confidence: 0.55,
          },
        });
        salaries++;
      } catch (e: any) {
        console.warn(`  salary fail ${j.slug}/${c}:`, e.message);
      }
    }
  }

  console.log(`[baseline] ✅ ${prices} prices + ${salaries} salaries inserted`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
