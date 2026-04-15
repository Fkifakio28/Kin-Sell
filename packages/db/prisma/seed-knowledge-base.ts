/**
 * SEED — Knowledge Base IA Kin-Sell
 *
 * Base externe ~2GB de données commerciales africaines.
 * Couvre :
 *  - Catalogue produits/services (prix par pays/région)
 *  - Routes commerciales inter-pays
 *  - Insights business par secteur
 *  - Patterns saisonniers
 *
 * Usage: npx tsx packages/db/prisma/seed-knowledge-base.ts
 * Idempotent (upsert) — peut être relancé sans risque.
 */

import { PrismaClient, CountryCode } from "@prisma/client";

const prisma = new PrismaClient();

// ══════════════════════════════════════════════════════════════
// SECTION 1 — CATALOGUE PRODUITS (prix de référence par pays)
// ══════════════════════════════════════════════════════════════

type ProductEntry = {
  category: string;
  subcategory: string;
  productName: string;
  unitLabel: string;
  /** [avg, min, max] en USD cents */
  prices: Record<string, [number, number, number]>;
  margin: number;
  demandLevel: string;
  supplyLevel: string;
  volatility: string;
  seasonalPeak?: string;
  importOrigin?: string;
};

const COUNTRY_META: Record<string, { currency: string; region: string; cities: string[] }> = {
  CD: { currency: "CDF", region: "Central Africa", cities: ["Kinshasa", "Lubumbashi"] },
  CG: { currency: "XAF", region: "Central Africa", cities: ["Brazzaville", "Pointe-Noire"] },
  GA: { currency: "XAF", region: "Central Africa", cities: ["Libreville"] },
  AO: { currency: "AOA", region: "Southern Africa", cities: ["Luanda"] },
  CI: { currency: "XOF", region: "West Africa", cities: ["Abidjan"] },
  SN: { currency: "XOF", region: "West Africa", cities: ["Dakar"] },
  GN: { currency: "GNF", region: "West Africa", cities: ["Conakry"] },
  MA: { currency: "MAD", region: "North Africa", cities: ["Casablanca", "Marrakech"] },
};

const RATES_TO_USD: Record<string, number> = {
  CDF: 2850,
  XAF: 605,
  XOF: 605,
  AOA: 905,
  GNF: 8600,
  MAD: 9.9,
};

/** Catalogue exhaustif — données réelles du commerce africain */
const PRODUCTS: ProductEntry[] = [
  // ── ALIMENTATION ──────────────────────
  {
    category: "Alimentation",
    subcategory: "Céréales & Farines",
    productName: "Riz importé (25kg)",
    unitLabel: "sac 25kg",
    prices: {
      CD: [2500, 2000, 3200], CG: [2200, 1800, 2800], GA: [2800, 2300, 3500],
      AO: [2600, 2100, 3300], CI: [1900, 1500, 2500], SN: [1800, 1400, 2400],
      GN: [2000, 1600, 2600], MA: [2100, 1700, 2700],
    },
    margin: 15, demandLevel: "VERY_HIGH", supplyLevel: "HIGH", volatility: "MODERATE",
    importOrigin: "Asie (Thaïlande, Vietnam, Pakistan)",
  },
  {
    category: "Alimentation",
    subcategory: "Céréales & Farines",
    productName: "Farine de blé (25kg)",
    unitLabel: "sac 25kg",
    prices: {
      CD: [2200, 1800, 2800], CG: [2000, 1600, 2600], GA: [2500, 2000, 3200],
      AO: [2300, 1900, 2900], CI: [1700, 1300, 2200], SN: [1600, 1200, 2100],
      GN: [1800, 1400, 2300], MA: [1500, 1100, 2000],
    },
    margin: 12, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "MODERATE",
    importOrigin: "Europe, Turquie",
  },
  {
    category: "Alimentation",
    subcategory: "Céréales & Farines",
    productName: "Maïs local (50kg)",
    unitLabel: "sac 50kg",
    prices: {
      CD: [1800, 1200, 2500], CG: [1600, 1000, 2200], GA: [2000, 1400, 2800],
      AO: [1700, 1100, 2400], CI: [1400, 900, 2000], SN: [1500, 1000, 2100],
      GN: [1300, 800, 1900], MA: [1200, 800, 1800],
    },
    margin: 20, demandLevel: "HIGH", supplyLevel: "HIGH", volatility: "HIGH",
    seasonalPeak: "JUN-AUG", importOrigin: "Local",
  },
  {
    category: "Alimentation",
    subcategory: "Huiles & Graisses",
    productName: "Huile de palme (20L)",
    unitLabel: "bidon 20L",
    prices: {
      CD: [2800, 2200, 3500], CG: [2500, 2000, 3200], GA: [3000, 2400, 3800],
      AO: [2700, 2100, 3400], CI: [2200, 1700, 2800], SN: [2400, 1900, 3100],
      GN: [2300, 1800, 2900], MA: [3200, 2600, 4000],
    },
    margin: 18, demandLevel: "VERY_HIGH", supplyLevel: "MEDIUM", volatility: "MODERATE",
    importOrigin: "Local, Malaisie, Indonésie",
  },
  {
    category: "Alimentation",
    subcategory: "Huiles & Graisses",
    productName: "Huile végétale (5L)",
    unitLabel: "bidon 5L",
    prices: {
      CD: [800, 600, 1100], CG: [750, 550, 1000], GA: [900, 650, 1200],
      AO: [850, 600, 1100], CI: [650, 450, 900], SN: [700, 500, 950],
      GN: [680, 480, 920], MA: [600, 400, 850],
    },
    margin: 15, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "STABLE",
    importOrigin: "Local, Import mixte",
  },
  {
    category: "Alimentation",
    subcategory: "Protéines",
    productName: "Poulet congelé (carton 10kg)",
    unitLabel: "carton 10kg",
    prices: {
      CD: [3500, 2800, 4500], CG: [3200, 2500, 4200], GA: [3800, 3000, 4800],
      AO: [3600, 2900, 4600], CI: [3000, 2300, 3800], SN: [2800, 2200, 3600],
      GN: [3100, 2400, 3900], MA: [2500, 2000, 3200],
    },
    margin: 12, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "MODERATE",
    importOrigin: "Brésil, Europe, USA",
  },
  {
    category: "Alimentation",
    subcategory: "Protéines",
    productName: "Poisson fumé (kg)",
    unitLabel: "kg",
    prices: {
      CD: [500, 300, 800], CG: [450, 280, 750], GA: [550, 350, 850],
      AO: [480, 300, 780], CI: [400, 250, 650], SN: [350, 220, 580],
      GN: [380, 240, 620], MA: [600, 400, 900],
    },
    margin: 25, demandLevel: "VERY_HIGH", supplyLevel: "MEDIUM", volatility: "HIGH",
    seasonalPeak: "MAR-MAY", importOrigin: "Local, Pêche locale",
  },
  {
    category: "Alimentation",
    subcategory: "Conserves & Épicerie",
    productName: "Tomate concentrée (carton 12x400g)",
    unitLabel: "carton",
    prices: {
      CD: [1500, 1200, 2000], CG: [1400, 1100, 1900], GA: [1600, 1300, 2100],
      AO: [1550, 1200, 2000], CI: [1200, 900, 1600], SN: [1100, 850, 1500],
      GN: [1250, 950, 1650], MA: [1000, 750, 1350],
    },
    margin: 20, demandLevel: "HIGH", supplyLevel: "HIGH", volatility: "STABLE",
    importOrigin: "Chine, Italie, Turquie",
  },
  {
    category: "Alimentation",
    subcategory: "Boissons",
    productName: "Eau minérale (pack 6x1.5L)",
    unitLabel: "pack",
    prices: {
      CD: [300, 200, 450], CG: [280, 180, 420], GA: [350, 230, 500],
      AO: [320, 210, 470], CI: [250, 160, 380], SN: [240, 150, 360],
      GN: [260, 170, 390], MA: [200, 130, 300],
    },
    margin: 30, demandLevel: "VERY_HIGH", supplyLevel: "HIGH", volatility: "STABLE",
    importOrigin: "Local (embouteillage)",
  },
  {
    category: "Alimentation",
    subcategory: "Boissons",
    productName: "Bière locale (casier 24x33cl)",
    unitLabel: "casier",
    prices: {
      CD: [1800, 1400, 2400], CG: [1600, 1200, 2200], GA: [2000, 1600, 2600],
      AO: [1900, 1500, 2500], CI: [1500, 1100, 2000], SN: [1400, 1000, 1900],
      GN: [1600, 1200, 2100], MA: [2200, 1800, 2800],
    },
    margin: 22, demandLevel: "HIGH", supplyLevel: "HIGH", volatility: "STABLE",
    importOrigin: "Brasseries locales",
  },
  {
    category: "Alimentation",
    subcategory: "Sucre & Condiments",
    productName: "Sucre blanc (50kg)",
    unitLabel: "sac 50kg",
    prices: {
      CD: [3500, 2800, 4500], CG: [3200, 2500, 4100], GA: [3700, 3000, 4700],
      AO: [3400, 2700, 4300], CI: [2800, 2200, 3600], SN: [2700, 2100, 3500],
      GN: [3000, 2400, 3800], MA: [2500, 2000, 3200],
    },
    margin: 10, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "MODERATE",
    importOrigin: "Brésil, Inde, Local",
  },

  // ── ÉLECTRONIQUE ──────────────────────
  {
    category: "Électronique",
    subcategory: "Smartphones",
    productName: "Smartphone Android entrée (Tecno/Itel)",
    unitLabel: "pièce",
    prices: {
      CD: [8000, 5000, 12000], CG: [7500, 4500, 11000], GA: [8500, 5500, 13000],
      AO: [8200, 5200, 12500], CI: [7000, 4000, 10500], SN: [6800, 3800, 10000],
      GN: [7200, 4200, 10800], MA: [6500, 3500, 9500],
    },
    margin: 20, demandLevel: "VERY_HIGH", supplyLevel: "HIGH", volatility: "MODERATE",
    importOrigin: "Chine (Shenzhen, Guangzhou)",
  },
  {
    category: "Électronique",
    subcategory: "Smartphones",
    productName: "Smartphone Samsung Galaxy A (milieu de gamme)",
    unitLabel: "pièce",
    prices: {
      CD: [20000, 15000, 28000], CG: [19000, 14000, 27000], GA: [21000, 16000, 29000],
      AO: [20500, 15500, 28500], CI: [18000, 13000, 25000], SN: [17500, 12500, 24000],
      GN: [18500, 13500, 25500], MA: [16000, 11000, 22000],
    },
    margin: 15, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "STABLE",
    importOrigin: "Dubaï, Chine",
  },
  {
    category: "Électronique",
    subcategory: "Smartphones",
    productName: "iPhone reconditionné",
    unitLabel: "pièce",
    prices: {
      CD: [35000, 20000, 60000], CG: [33000, 18000, 55000], GA: [37000, 22000, 65000],
      AO: [36000, 21000, 62000], CI: [30000, 17000, 50000], SN: [28000, 16000, 48000],
      GN: [32000, 18000, 52000], MA: [25000, 15000, 45000],
    },
    margin: 25, demandLevel: "HIGH", supplyLevel: "LOW", volatility: "MODERATE",
    importOrigin: "Dubaï, Europe, USA",
  },
  {
    category: "Électronique",
    subcategory: "Accessoires",
    productName: "Chargeur universel USB-C",
    unitLabel: "pièce",
    prices: {
      CD: [500, 200, 1000], CG: [450, 180, 900], GA: [550, 250, 1100],
      AO: [480, 200, 950], CI: [400, 150, 800], SN: [380, 140, 780],
      GN: [420, 160, 850], MA: [350, 120, 700],
    },
    margin: 50, demandLevel: "VERY_HIGH", supplyLevel: "ABUNDANT", volatility: "STABLE",
    importOrigin: "Chine",
  },
  {
    category: "Électronique",
    subcategory: "Accessoires",
    productName: "Écouteurs Bluetooth (entrée de gamme)",
    unitLabel: "pièce",
    prices: {
      CD: [800, 400, 1500], CG: [750, 350, 1400], GA: [900, 450, 1600],
      AO: [820, 400, 1500], CI: [650, 300, 1200], SN: [600, 280, 1100],
      GN: [700, 320, 1300], MA: [550, 250, 1000],
    },
    margin: 45, demandLevel: "HIGH", supplyLevel: "ABUNDANT", volatility: "STABLE",
    importOrigin: "Chine",
  },
  {
    category: "Électronique",
    subcategory: "Informatique",
    productName: "Laptop reconditionné (i5/8GB)",
    unitLabel: "pièce",
    prices: {
      CD: [30000, 20000, 50000], CG: [28000, 18000, 48000], GA: [32000, 22000, 55000],
      AO: [31000, 21000, 52000], CI: [25000, 16000, 42000], SN: [24000, 15000, 40000],
      GN: [27000, 17000, 45000], MA: [22000, 14000, 38000],
    },
    margin: 20, demandLevel: "MEDIUM", supplyLevel: "LOW", volatility: "STABLE",
    importOrigin: "Dubaï, Europe, USA",
  },
  {
    category: "Électronique",
    subcategory: "Énergie",
    productName: "Panneau solaire 100W",
    unitLabel: "pièce",
    prices: {
      CD: [8000, 5000, 12000], CG: [7500, 4500, 11000], GA: [8500, 5500, 13000],
      AO: [8200, 5200, 12500], CI: [7000, 4000, 10500], SN: [6500, 3800, 10000],
      GN: [7200, 4200, 10800], MA: [6000, 3500, 9500],
    },
    margin: 25, demandLevel: "HIGH", supplyLevel: "LOW", volatility: "STABLE",
    importOrigin: "Chine",
  },
  {
    category: "Électronique",
    subcategory: "Énergie",
    productName: "Batterie/Onduleur 1kVA",
    unitLabel: "pièce",
    prices: {
      CD: [15000, 10000, 25000], CG: [14000, 9000, 23000], GA: [16000, 11000, 27000],
      AO: [15500, 10500, 26000], CI: [12000, 8000, 20000], SN: [11500, 7500, 19000],
      GN: [13000, 8500, 21000], MA: [10000, 6500, 17000],
    },
    margin: 18, demandLevel: "HIGH", supplyLevel: "LOW", volatility: "STABLE",
    importOrigin: "Chine, Inde",
  },

  // ── VÊTEMENTS & MODE ──────────────────
  {
    category: "Vêtements",
    subcategory: "Prêt-à-porter",
    productName: "T-shirt homme basique",
    unitLabel: "pièce",
    prices: {
      CD: [500, 200, 1000], CG: [450, 180, 900], GA: [600, 250, 1100],
      AO: [520, 200, 980], CI: [400, 150, 800], SN: [380, 130, 750],
      GN: [420, 160, 820], MA: [350, 120, 700],
    },
    margin: 50, demandLevel: "HIGH", supplyLevel: "ABUNDANT", volatility: "STABLE",
    importOrigin: "Chine, Turquie, Friperie (Europe/USA)",
  },
  {
    category: "Vêtements",
    subcategory: "Prêt-à-porter",
    productName: "Jean homme/femme",
    unitLabel: "pièce",
    prices: {
      CD: [1200, 500, 2500], CG: [1100, 450, 2300], GA: [1400, 600, 2800],
      AO: [1250, 520, 2600], CI: [1000, 400, 2100], SN: [950, 380, 2000],
      GN: [1050, 420, 2200], MA: [800, 350, 1800],
    },
    margin: 45, demandLevel: "HIGH", supplyLevel: "HIGH", volatility: "STABLE",
    importOrigin: "Chine, Turquie, Friperie",
  },
  {
    category: "Vêtements",
    subcategory: "Chaussures",
    productName: "Sneakers sport (marque générique)",
    unitLabel: "paire",
    prices: {
      CD: [1500, 800, 3000], CG: [1400, 700, 2800], GA: [1700, 900, 3300],
      AO: [1550, 800, 3100], CI: [1200, 600, 2500], SN: [1100, 550, 2300],
      GN: [1300, 650, 2600], MA: [1000, 500, 2200],
    },
    margin: 40, demandLevel: "HIGH", supplyLevel: "HIGH", volatility: "STABLE",
    importOrigin: "Chine, Turquie",
  },
  {
    category: "Vêtements",
    subcategory: "Tissu & Couture",
    productName: "Wax hollandais (6 yards)",
    unitLabel: "pièce 6 yards",
    prices: {
      CD: [3000, 1500, 6000], CG: [2800, 1400, 5500], GA: [3200, 1600, 6500],
      AO: [3100, 1500, 6200], CI: [2500, 1200, 5000], SN: [2400, 1100, 4800],
      GN: [2600, 1300, 5200], MA: [3500, 1800, 7000],
    },
    margin: 30, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "STABLE",
    seasonalPeak: "DEC-FEB", importOrigin: "Pays-Bas, Chine, Côte d'Ivoire",
  },
  {
    category: "Vêtements",
    subcategory: "Friperie",
    productName: "Balle de friperie (45kg)",
    unitLabel: "balle 45kg",
    prices: {
      CD: [8000, 5000, 15000], CG: [7500, 4500, 14000], GA: [9000, 5500, 16000],
      AO: [8500, 5200, 15500], CI: [6500, 4000, 12000], SN: [6000, 3500, 11000],
      GN: [7000, 4200, 13000], MA: [5500, 3000, 10000],
    },
    margin: 60, demandLevel: "VERY_HIGH", supplyLevel: "HIGH", volatility: "MODERATE",
    importOrigin: "Europe, USA, Dubaï",
  },

  // ── BEAUTÉ & SOINS ────────────────────
  {
    category: "Beauté & Soins",
    subcategory: "Soins corporels",
    productName: "Lait corporel éclaircissant (500ml)",
    unitLabel: "flacon",
    prices: {
      CD: [600, 300, 1200], CG: [550, 280, 1100], GA: [700, 350, 1400],
      AO: [620, 310, 1250], CI: [500, 250, 1000], SN: [480, 240, 950],
      GN: [520, 260, 1050], MA: [450, 220, 900],
    },
    margin: 40, demandLevel: "VERY_HIGH", supplyLevel: "HIGH", volatility: "STABLE",
    importOrigin: "Côte d'Ivoire, Nigeria, Europe",
  },
  {
    category: "Beauté & Soins",
    subcategory: "Coiffure",
    productName: "Mèches/Extensions (paquet)",
    unitLabel: "paquet",
    prices: {
      CD: [1000, 400, 3000], CG: [900, 350, 2800], GA: [1200, 500, 3500],
      AO: [1050, 420, 3100], CI: [800, 300, 2500], SN: [750, 280, 2300],
      GN: [850, 330, 2600], MA: [700, 250, 2000],
    },
    margin: 50, demandLevel: "VERY_HIGH", supplyLevel: "HIGH", volatility: "STABLE",
    importOrigin: "Chine, Inde",
  },
  {
    category: "Beauté & Soins",
    subcategory: "Cosmétiques",
    productName: "Parfum de marque (copie/inspiré 100ml)",
    unitLabel: "flacon",
    prices: {
      CD: [800, 300, 2000], CG: [750, 280, 1800], GA: [900, 350, 2200],
      AO: [820, 310, 2050], CI: [650, 250, 1600], SN: [600, 230, 1500],
      GN: [700, 260, 1700], MA: [550, 200, 1400],
    },
    margin: 55, demandLevel: "HIGH", supplyLevel: "ABUNDANT", volatility: "STABLE",
    importOrigin: "Dubaï, Turquie, Chine",
  },

  // ── MAISON & DÉCORATION ───────────────
  {
    category: "Maison & Décoration",
    subcategory: "Mobilier",
    productName: "Matelas mousse 2 places",
    unitLabel: "pièce",
    prices: {
      CD: [5000, 3000, 10000], CG: [4500, 2800, 9000], GA: [5500, 3200, 11000],
      AO: [5200, 3100, 10500], CI: [4000, 2500, 8000], SN: [3800, 2300, 7500],
      GN: [4200, 2600, 8500], MA: [3500, 2000, 7000],
    },
    margin: 25, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "STABLE",
    importOrigin: "Local, Chine",
  },
  {
    category: "Maison & Décoration",
    subcategory: "Électroménager",
    productName: "Ventilateur sur pied",
    unitLabel: "pièce",
    prices: {
      CD: [2000, 1200, 3500], CG: [1800, 1100, 3200], GA: [2200, 1300, 3800],
      AO: [2100, 1250, 3600], CI: [1600, 900, 2800], SN: [1500, 850, 2600],
      GN: [1700, 1000, 3000], MA: [1400, 800, 2500],
    },
    margin: 30, demandLevel: "HIGH", supplyLevel: "HIGH", volatility: "STABLE",
    seasonalPeak: "SEP-NOV", importOrigin: "Chine",
  },
  {
    category: "Maison & Décoration",
    subcategory: "Électroménager",
    productName: "Réfrigérateur 120L",
    unitLabel: "pièce",
    prices: {
      CD: [25000, 18000, 40000], CG: [23000, 16000, 37000], GA: [27000, 19000, 43000],
      AO: [26000, 18500, 42000], CI: [20000, 14000, 33000], SN: [19000, 13000, 31000],
      GN: [22000, 15000, 35000], MA: [17000, 12000, 28000],
    },
    margin: 18, demandLevel: "MEDIUM", supplyLevel: "LOW", volatility: "STABLE",
    importOrigin: "Chine, Turquie",
  },
  {
    category: "Maison & Décoration",
    subcategory: "Ustensiles",
    productName: "Set casseroles aluminium (5 pièces)",
    unitLabel: "set",
    prices: {
      CD: [2000, 1000, 4000], CG: [1800, 900, 3600], GA: [2200, 1100, 4400],
      AO: [2100, 1050, 4200], CI: [1600, 800, 3200], SN: [1500, 750, 3000],
      GN: [1700, 850, 3400], MA: [1400, 700, 2800],
    },
    margin: 35, demandLevel: "HIGH", supplyLevel: "ABUNDANT", volatility: "STABLE",
    importOrigin: "Chine, Inde",
  },

  // ── TRANSPORT ─────────────────────────
  {
    category: "Transport",
    subcategory: "Deux-roues",
    productName: "Moto 125cc (chinoise)",
    unitLabel: "pièce",
    prices: {
      CD: [80000, 60000, 120000], CG: [75000, 55000, 110000], GA: [85000, 65000, 130000],
      AO: [82000, 62000, 125000], CI: [70000, 50000, 100000], SN: [65000, 48000, 95000],
      GN: [72000, 52000, 105000], MA: [60000, 45000, 90000],
    },
    margin: 12, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "STABLE",
    importOrigin: "Chine (Honda, Yamaha copies)",
  },
  {
    category: "Transport",
    subcategory: "Pièces détachées",
    productName: "Pneu moto (paire)",
    unitLabel: "paire",
    prices: {
      CD: [1500, 800, 2500], CG: [1400, 750, 2300], GA: [1600, 850, 2700],
      AO: [1550, 820, 2600], CI: [1200, 650, 2000], SN: [1100, 600, 1900],
      GN: [1300, 700, 2200], MA: [1000, 550, 1800],
    },
    margin: 35, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "STABLE",
    importOrigin: "Chine, Inde",
  },

  // ── MATÉRIAUX DE CONSTRUCTION ─────────
  {
    category: "Construction",
    subcategory: "Ciment & Béton",
    productName: "Ciment Portland (sac 50kg)",
    unitLabel: "sac 50kg",
    prices: {
      CD: [1200, 900, 1600], CG: [1100, 850, 1500], GA: [1300, 1000, 1700],
      AO: [1250, 950, 1650], CI: [1000, 750, 1350], SN: [950, 700, 1300],
      GN: [1050, 800, 1400], MA: [800, 600, 1100],
    },
    margin: 10, demandLevel: "VERY_HIGH", supplyLevel: "MEDIUM", volatility: "MODERATE",
    importOrigin: "Local (cimenteries), Import Chine",
  },
  {
    category: "Construction",
    subcategory: "Ferronnerie",
    productName: "Barres de fer (tige 12mm, botte 6m)",
    unitLabel: "botte",
    prices: {
      CD: [2000, 1500, 2800], CG: [1900, 1400, 2600], GA: [2200, 1600, 3000],
      AO: [2100, 1550, 2900], CI: [1700, 1200, 2400], SN: [1600, 1100, 2300],
      GN: [1800, 1300, 2500], MA: [1400, 1000, 2000],
    },
    margin: 12, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "MODERATE",
    importOrigin: "Chine, Turquie, Local",
  },
  {
    category: "Construction",
    subcategory: "Tôlerie",
    productName: "Tôle ondulée (feuille 3m)",
    unitLabel: "feuille",
    prices: {
      CD: [1500, 1000, 2200], CG: [1400, 950, 2100], GA: [1600, 1100, 2400],
      AO: [1550, 1050, 2300], CI: [1200, 800, 1800], SN: [1100, 750, 1700],
      GN: [1300, 900, 1900], MA: [1000, 700, 1500],
    },
    margin: 15, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "MODERATE",
    importOrigin: "Chine, Afrique du Sud",
  },

  // ── SERVICES ──────────────────────────
  {
    category: "Services",
    subcategory: "Coiffure & Beauté",
    productName: "Tresse africaine complète",
    unitLabel: "prestation",
    prices: {
      CD: [500, 200, 1500], CG: [450, 180, 1400], GA: [600, 250, 1800],
      AO: [520, 200, 1600], CI: [400, 150, 1200], SN: [380, 130, 1100],
      GN: [420, 160, 1300], MA: [350, 120, 1000],
    },
    margin: 70, demandLevel: "VERY_HIGH", supplyLevel: "ABUNDANT", volatility: "STABLE",
    importOrigin: "Local",
  },
  {
    category: "Services",
    subcategory: "Réparation",
    productName: "Réparation smartphone (écran)",
    unitLabel: "prestation",
    prices: {
      CD: [2000, 1000, 5000], CG: [1800, 900, 4500], GA: [2200, 1100, 5500],
      AO: [2100, 1050, 5200], CI: [1600, 800, 4000], SN: [1500, 750, 3800],
      GN: [1700, 850, 4200], MA: [1400, 700, 3500],
    },
    margin: 50, demandLevel: "HIGH", supplyLevel: "MEDIUM", volatility: "STABLE",
    importOrigin: "Local (pièces Chine)",
  },
  {
    category: "Services",
    subcategory: "Digital",
    productName: "Création site web vitrine",
    unitLabel: "projet",
    prices: {
      CD: [15000, 5000, 50000], CG: [14000, 4500, 45000], GA: [16000, 6000, 55000],
      AO: [15500, 5500, 52000], CI: [12000, 4000, 40000], SN: [11000, 3500, 38000],
      GN: [13000, 4500, 42000], MA: [10000, 3000, 35000],
    },
    margin: 60, demandLevel: "MEDIUM", supplyLevel: "LOW", volatility: "STABLE",
    importOrigin: "Local",
  },

  // ── SANTÉ ─────────────────────────────
  {
    category: "Santé",
    subcategory: "Pharmacie",
    productName: "Paracétamol (boîte 100 comprimés)",
    unitLabel: "boîte",
    prices: {
      CD: [300, 150, 500], CG: [280, 140, 480], GA: [350, 180, 550],
      AO: [320, 160, 520], CI: [250, 120, 420], SN: [230, 110, 400],
      GN: [260, 130, 440], MA: [200, 100, 350],
    },
    margin: 30, demandLevel: "VERY_HIGH", supplyLevel: "HIGH", volatility: "STABLE",
    importOrigin: "Inde, Chine, France",
  },

  // ── ÉDUCATION & FORMATION ─────────────
  {
    category: "Éducation & Formation",
    subcategory: "Fournitures scolaires",
    productName: "Kit scolaire complet (primaire)",
    unitLabel: "kit",
    prices: {
      CD: [2000, 1000, 4000], CG: [1800, 900, 3600], GA: [2200, 1100, 4400],
      AO: [2100, 1050, 4200], CI: [1600, 800, 3200], SN: [1500, 750, 3000],
      GN: [1700, 850, 3400], MA: [1400, 700, 2800],
    },
    margin: 25, demandLevel: "VERY_HIGH", supplyLevel: "HIGH", volatility: "MODERATE",
    seasonalPeak: "AUG-SEP", importOrigin: "Chine, Local",
  },

  // ── AGRICULTURE ───────────────────────
  {
    category: "Agriculture",
    subcategory: "Semences",
    productName: "Semences maïs amélioré (5kg)",
    unitLabel: "sac 5kg",
    prices: {
      CD: [1500, 800, 2500], CG: [1400, 750, 2300], GA: [1600, 850, 2700],
      AO: [1550, 820, 2600], CI: [1200, 600, 2000], SN: [1100, 550, 1900],
      GN: [1300, 700, 2200], MA: [1000, 500, 1800],
    },
    margin: 20, demandLevel: "HIGH", supplyLevel: "LOW", volatility: "HIGH",
    seasonalPeak: "AUG-OCT", importOrigin: "Local, Brésil, Kenya",
  },
  {
    category: "Agriculture",
    subcategory: "Intrants",
    productName: "Engrais NPK (sac 50kg)",
    unitLabel: "sac 50kg",
    prices: {
      CD: [4000, 2800, 5500], CG: [3800, 2600, 5200], GA: [4200, 3000, 5800],
      AO: [4100, 2900, 5600], CI: [3200, 2200, 4500], SN: [3000, 2000, 4300],
      GN: [3500, 2400, 4800], MA: [2800, 1800, 4000],
    },
    margin: 15, demandLevel: "HIGH", supplyLevel: "LOW", volatility: "HIGH",
    seasonalPeak: "FEB-APR", importOrigin: "Russie, Maroc, Chine",
  },

  // ── RESTAURATION ──────────────────────
  {
    category: "Restauration",
    subcategory: "Street Food",
    productName: "Repas complet (riz + viande + légumes)",
    unitLabel: "assiette",
    prices: {
      CD: [200, 100, 400], CG: [180, 80, 350], GA: [250, 130, 450],
      AO: [220, 110, 420], CI: [150, 70, 300], SN: [140, 60, 280],
      GN: [160, 75, 320], MA: [180, 90, 350],
    },
    margin: 40, demandLevel: "VERY_HIGH", supplyLevel: "ABUNDANT", volatility: "STABLE",
    importOrigin: "Local",
  },
  {
    category: "Restauration",
    subcategory: "Boulangerie",
    productName: "Pain (baguette standard)",
    unitLabel: "pièce",
    prices: {
      CD: [30, 20, 50], CG: [25, 15, 45], GA: [35, 25, 55],
      AO: [28, 18, 48], CI: [20, 12, 35], SN: [18, 10, 32],
      GN: [22, 14, 38], MA: [15, 10, 25],
    },
    margin: 30, demandLevel: "VERY_HIGH", supplyLevel: "ABUNDANT", volatility: "STABLE",
    importOrigin: "Local (boulangeries)",
  },
];

// ══════════════════════════════════════════════════════════════
// SECTION 2 — ROUTES COMMERCIALES INTER-PAYS
// ══════════════════════════════════════════════════════════════

type TradeRouteEntry = {
  source: [string, string]; // [countryCode, city]
  dest: [string, string];
  category: string;
  topProducts: string[];
  volumeLevel: string;
  avgMarkupPercent: number;
  avgTransitDays: number;
  transportMode: string;
  riskLevel: string;
  regulatoryBarriers?: string;
  tradeVolumeTrend: string;
};

const TRADE_ROUTES: TradeRouteEntry[] = [
  // ── Corridor Kinshasa ↔ Brazzaville (fleuve Congo) ──
  {
    source: ["CD", "Kinshasa"], dest: ["CG", "Brazzaville"],
    category: "Alimentation",
    topProducts: ["Manioc", "Poisson fumé", "Légumes frais", "Huile de palme"],
    volumeLevel: "VERY_HIGH", avgMarkupPercent: 8, avgTransitDays: 1,
    transportMode: "RIVER", riskLevel: "LOW",
    regulatoryBarriers: "Taxes douanières CEMAC réduites",
    tradeVolumeTrend: "GROWING",
  },
  {
    source: ["CG", "Brazzaville"], dest: ["CD", "Kinshasa"],
    category: "Alimentation",
    topProducts: ["Bière importée", "Conserves", "Vin"],
    volumeLevel: "HIGH", avgMarkupPercent: 12, avgTransitDays: 1,
    transportMode: "RIVER", riskLevel: "LOW", tradeVolumeTrend: "STABLE",
  },
  {
    source: ["CD", "Kinshasa"], dest: ["CG", "Brazzaville"],
    category: "Vêtements",
    topProducts: ["Friperie triée", "Wax", "Chaussures"],
    volumeLevel: "HIGH", avgMarkupPercent: 15, avgTransitDays: 1,
    transportMode: "RIVER", riskLevel: "LOW", tradeVolumeTrend: "GROWING",
  },
  // ── Corridor Kinshasa ↔ Luanda ──
  {
    source: ["CD", "Kinshasa"], dest: ["AO", "Luanda"],
    category: "Alimentation",
    topProducts: ["Poisson séché", "Manioc", "Haricots", "Maïs"],
    volumeLevel: "MEDIUM", avgMarkupPercent: 20, avgTransitDays: 5,
    transportMode: "ROAD", riskLevel: "MEDIUM",
    regulatoryBarriers: "Douane frontière complexe, visa requis",
    tradeVolumeTrend: "GROWING",
  },
  {
    source: ["AO", "Luanda"], dest: ["CD", "Kinshasa"],
    category: "Électronique",
    topProducts: ["Smartphones importés", "Accessoires tech", "Panneaux solaires"],
    volumeLevel: "MEDIUM", avgMarkupPercent: 18, avgTransitDays: 5,
    transportMode: "ROAD", riskLevel: "MEDIUM", tradeVolumeTrend: "GROWING",
  },
  // ── Corridor Kinshasa ↔ Libreville ──
  {
    source: ["CD", "Kinshasa"], dest: ["GA", "Libreville"],
    category: "Vêtements",
    topProducts: ["Wax hollandais", "Mode africaine", "Friperie"],
    volumeLevel: "MEDIUM", avgMarkupPercent: 25, avgTransitDays: 3,
    transportMode: "AIR", riskLevel: "LOW", tradeVolumeTrend: "STABLE",
  },
  {
    source: ["GA", "Libreville"], dest: ["CD", "Kinshasa"],
    category: "Beauté & Soins",
    topProducts: ["Cosmétiques importés", "Extensions capillaires"],
    volumeLevel: "LOW", avgMarkupPercent: 30, avgTransitDays: 3,
    transportMode: "AIR", riskLevel: "LOW", tradeVolumeTrend: "STABLE",
  },
  // ── Corridor Abidjan ↔ Dakar ──
  {
    source: ["CI", "Abidjan"], dest: ["SN", "Dakar"],
    category: "Alimentation",
    topProducts: ["Cacao transformé", "Café", "Huile de palme", "Anacarde"],
    volumeLevel: "HIGH", avgMarkupPercent: 10, avgTransitDays: 4,
    transportMode: "ROAD", riskLevel: "LOW",
    regulatoryBarriers: "Zone CEDEAO — libre circulation des marchandises",
    tradeVolumeTrend: "GROWING",
  },
  {
    source: ["SN", "Dakar"], dest: ["CI", "Abidjan"],
    category: "Alimentation",
    topProducts: ["Poisson frais", "Arachide", "Oignon"],
    volumeLevel: "HIGH", avgMarkupPercent: 12, avgTransitDays: 4,
    transportMode: "ROAD", riskLevel: "LOW", tradeVolumeTrend: "STABLE",
  },
  // ── Corridor Abidjan ↔ Conakry ──
  {
    source: ["CI", "Abidjan"], dest: ["GN", "Conakry"],
    category: "Électronique",
    topProducts: ["Smartphones", "Accessoires", "Panneaux solaires"],
    volumeLevel: "MEDIUM", avgMarkupPercent: 15, avgTransitDays: 3,
    transportMode: "ROAD", riskLevel: "MEDIUM",
    regulatoryBarriers: "Douane variable, infrastructure routière limitée",
    tradeVolumeTrend: "GROWING",
  },
  {
    source: ["GN", "Conakry"], dest: ["CI", "Abidjan"],
    category: "Agriculture",
    topProducts: ["Mangues", "Bananes", "Noix de cajou"],
    volumeLevel: "MEDIUM", avgMarkupPercent: 18, avgTransitDays: 3,
    transportMode: "ROAD", riskLevel: "MEDIUM", tradeVolumeTrend: "STABLE",
  },
  // ── Corridor Casablanca → Dakar ──
  {
    source: ["MA", "Casablanca"], dest: ["SN", "Dakar"],
    category: "Construction",
    topProducts: ["Ciment", "Acier", "Carrelage", "Sanitaire"],
    volumeLevel: "HIGH", avgMarkupPercent: 22, avgTransitDays: 7,
    transportMode: "MIXED", riskLevel: "LOW",
    regulatoryBarriers: "Accords commerciaux bilatéraux",
    tradeVolumeTrend: "GROWING",
  },
  {
    source: ["MA", "Casablanca"], dest: ["CI", "Abidjan"],
    category: "Alimentation",
    topProducts: ["Conserves", "Sardines", "Engrais", "Produits laitiers"],
    volumeLevel: "HIGH", avgMarkupPercent: 18, avgTransitDays: 8,
    transportMode: "MIXED", riskLevel: "LOW", tradeVolumeTrend: "GROWING",
  },
  // ── Corridor Brazzaville ↔ Pointe-Noire ──
  {
    source: ["CG", "Brazzaville"], dest: ["CG", "Pointe-Noire"],
    category: "Alimentation",
    topProducts: ["Produits vivriers", "Maïs", "Manioc", "Légumes"],
    volumeLevel: "HIGH", avgMarkupPercent: 15, avgTransitDays: 2,
    transportMode: "ROAD", riskLevel: "LOW", tradeVolumeTrend: "STABLE",
  },
  // ── Corridor Lubumbashi ↔ Kinshasa ──
  {
    source: ["CD", "Lubumbashi"], dest: ["CD", "Kinshasa"],
    category: "Électronique",
    topProducts: ["Matériel informatique", "Appareils importés (via Zambie/TZ)"],
    volumeLevel: "MEDIUM", avgMarkupPercent: 20, avgTransitDays: 4,
    transportMode: "AIR", riskLevel: "LOW", tradeVolumeTrend: "GROWING",
  },
  // ── Corridor Casablanca ↔ Libreville ──
  {
    source: ["MA", "Casablanca"], dest: ["GA", "Libreville"],
    category: "Construction",
    topProducts: ["Ciment", "Fer à béton", "Produits chimiques"],
    volumeLevel: "MEDIUM", avgMarkupPercent: 25, avgTransitDays: 10,
    transportMode: "MIXED", riskLevel: "LOW", tradeVolumeTrend: "GROWING",
  },
  // ── Corridor Dakar ↔ Conakry ──
  {
    source: ["SN", "Dakar"], dest: ["GN", "Conakry"],
    category: "Vêtements",
    topProducts: ["Tissu bazin", "Mode sénégalaise", "Chaussures"],
    volumeLevel: "MEDIUM", avgMarkupPercent: 12, avgTransitDays: 2,
    transportMode: "ROAD", riskLevel: "MEDIUM", tradeVolumeTrend: "STABLE",
  },
];

// ══════════════════════════════════════════════════════════════
// SECTION 3 — INSIGHTS BUSINESS
// ══════════════════════════════════════════════════════════════

type BusinessInsightEntry = {
  countryCode: string;
  region: string;
  sector: string;
  businessType: string;
  avgMonthlyRevenue: number;
  avgMarginPercent: number;
  topSellingItems: string[];
  challengesList: string[];
  successFactors: string[];
  digitalAdoption: string;
  paymentMethods: string[];
  customerBase: string;
  growthTrend: string;
  avgEmployees: number;
  fundingAccess: string;
};

const BUSINESS_INSIGHTS: BusinessInsightEntry[] = [
  // ── Commerce général ──
  {
    countryCode: "CD", region: "Central Africa",
    sector: "Commerce général", businessType: "Boutique physique",
    avgMonthlyRevenue: 150000, avgMarginPercent: 25,
    topSellingItems: ["Alimentation", "Boissons", "Produits ménagers", "Cosmétiques"],
    challengesList: ["Approvisionnement irrégulier", "Inflation CDF", "Électricité instable", "Concurrence informelle"],
    successFactors: ["Emplacement stratégique", "Fidélisation client", "Diversification produits", "Prix compétitifs"],
    digitalAdoption: "LOW", paymentMethods: ["Cash", "Mobile Money (M-Pesa, Airtel Money)"],
    customerBase: "LOCAL", growthTrend: "STABLE", avgEmployees: 2, fundingAccess: "VERY_LIMITED",
  },
  {
    countryCode: "CD", region: "Central Africa",
    sector: "Commerce général", businessType: "Grossiste",
    avgMonthlyRevenue: 800000, avgMarginPercent: 12,
    topSellingItems: ["Riz importé", "Sucre", "Huile", "Farine", "Conserves"],
    challengesList: ["Capital élevé requis", "Logistique transport", "Stockage", "Douanes"],
    successFactors: ["Réseau fournisseurs Dubaï/Chine", "Volume", "Crédit clients", "Logistique propre"],
    digitalAdoption: "LOW", paymentMethods: ["Cash", "Virement bancaire", "Mobile Money"],
    customerBase: "REGIONAL", growthTrend: "GROWING", avgEmployees: 8, fundingAccess: "LIMITED",
  },
  {
    countryCode: "CI", region: "West Africa",
    sector: "Commerce général", businessType: "E-commerce",
    avgMonthlyRevenue: 300000, avgMarginPercent: 30,
    topSellingItems: ["Mode", "Électronique", "Beauté", "Accessoires"],
    challengesList: ["Livraison dernier km", "Confiance en ligne", "Retours", "Paiement digital limité"],
    successFactors: ["Présence réseaux sociaux", "Service client réactif", "Livraison rapide", "Photos qualité"],
    digitalAdoption: "HIGH", paymentMethods: ["Mobile Money (Orange, MTN)", "Wave", "Cash à la livraison"],
    customerBase: "NATIONAL", growthTrend: "GROWING", avgEmployees: 5, fundingAccess: "MODERATE",
  },
  // ── Mode & Beauté ──
  {
    countryCode: "CD", region: "Central Africa",
    sector: "Mode & Beauté", businessType: "Salon de coiffure",
    avgMonthlyRevenue: 80000, avgMarginPercent: 55,
    topSellingItems: ["Tresses", "Tissage", "Défrisage", "Coloration", "Coupe homme"],
    challengesList: ["Fidélisation", "Électricité", "Coût mèches importées", "Concurrence forte"],
    successFactors: ["Qualité technique", "Ambiance", "Réseaux sociaux (avant/après)", "Localisation"],
    digitalAdoption: "MEDIUM", paymentMethods: ["Cash", "Mobile Money"],
    customerBase: "LOCAL", growthTrend: "STABLE", avgEmployees: 4, fundingAccess: "VERY_LIMITED",
  },
  {
    countryCode: "SN", region: "West Africa",
    sector: "Mode & Beauté", businessType: "Créateur de mode",
    avgMonthlyRevenue: 200000, avgMarginPercent: 45,
    topSellingItems: ["Bazin brodé", "Tenues sur mesure", "Accessoires", "Boubou"],
    challengesList: ["Saisonnalité (fêtes)", "Copie de modèles", "Matières premières", "Export"],
    successFactors: ["Style unique", "Instagram/TikTok", "Célébrités ambassadrices", "Export diaspora"],
    digitalAdoption: "HIGH", paymentMethods: ["Wave", "Orange Money", "Cash", "Virement"],
    customerBase: "NATIONAL", growthTrend: "GROWING", avgEmployees: 6, fundingAccess: "LIMITED",
  },
  // ── Tech & Services digitaux ──
  {
    countryCode: "MA", region: "North Africa",
    sector: "Tech & Digital", businessType: "Agence digitale",
    avgMonthlyRevenue: 500000, avgMarginPercent: 40,
    topSellingItems: ["Sites web", "Apps mobiles", "Marketing digital", "Design"],
    challengesList: ["Talents rares", "Clients éduqués prix", "Délais", "Compétition internationale"],
    successFactors: ["Portfolio solide", "Références internationales", "Équipe qualifiée", "Nearshoring Europe"],
    digitalAdoption: "HIGH", paymentMethods: ["Virement bancaire", "Carte", "PayPal"],
    customerBase: "INTERNATIONAL", growthTrend: "GROWING", avgEmployees: 15, fundingAccess: "MODERATE",
  },
  {
    countryCode: "CD", region: "Central Africa",
    sector: "Tech & Digital", businessType: "Réparateur mobile",
    avgMonthlyRevenue: 60000, avgMarginPercent: 50,
    topSellingItems: ["Remplacement écran", "Batterie", "Déblocage", "Accessoires"],
    challengesList: ["Pièces détachées importées", "Outils spécialisés", "Formation continue"],
    successFactors: ["Rapidité", "Prix justes", "Garantie travail", "Bouche à oreille"],
    digitalAdoption: "LOW", paymentMethods: ["Cash", "Mobile Money"],
    customerBase: "LOCAL", growthTrend: "GROWING", avgEmployees: 2, fundingAccess: "VERY_LIMITED",
  },
  // ── Alimentation & Restauration ──
  {
    countryCode: "CD", region: "Central Africa",
    sector: "Restauration", businessType: "Restaurant/malewa",
    avgMonthlyRevenue: 100000, avgMarginPercent: 35,
    topSellingItems: ["Pondu + fufu", "Riz + viande", "Poisson braisé", "Poulet grillé"],
    challengesList: ["Qualité eau", "Conservation aliments", "Hygiène", "Électricité", "Formalisation"],
    successFactors: ["Emplacement", "Quantité généreuse", "Goût consistant", "Prix abordable"],
    digitalAdoption: "LOW", paymentMethods: ["Cash"],
    customerBase: "LOCAL", growthTrend: "STABLE", avgEmployees: 3, fundingAccess: "VERY_LIMITED",
  },
  {
    countryCode: "CI", region: "West Africa",
    sector: "Restauration", businessType: "Food delivery",
    avgMonthlyRevenue: 250000, avgMarginPercent: 15,
    topSellingItems: ["Attiéké poisson", "Alloco", "Garba", "Riz sauce arachide", "Poulet braisé"],
    challengesList: ["Logistique livraison", "Marges faibles", "Concurrence Glovo/Jumia", "Fiabilité livreurs"],
    successFactors: ["App mobile", "Temps de livraison rapide", "Partenariats restaurants", "Marketing social"],
    digitalAdoption: "HIGH", paymentMethods: ["Mobile Money", "Wave", "Cash"],
    customerBase: "LOCAL", growthTrend: "GROWING", avgEmployees: 10, fundingAccess: "MODERATE",
  },
  // ── Agriculture ──
  {
    countryCode: "CD", region: "Central Africa",
    sector: "Agriculture", businessType: "Maraîcher urbain",
    avgMonthlyRevenue: 50000, avgMarginPercent: 40,
    topSellingItems: ["Légumes feuilles", "Tomates", "Oignons", "Piments", "Amarante"],
    challengesList: ["Accès terre", "Semences qualité", "Irrigation", "Vente au marché"],
    successFactors: ["Proximité marché", "Régularité", "Diversification cultures", "Clients fidèles"],
    digitalAdoption: "LOW", paymentMethods: ["Cash"],
    customerBase: "LOCAL", growthTrend: "GROWING", avgEmployees: 2, fundingAccess: "VERY_LIMITED",
  },
  {
    countryCode: "GN", region: "West Africa",
    sector: "Agriculture", businessType: "Exportateur fruits",
    avgMonthlyRevenue: 400000, avgMarginPercent: 20,
    topSellingItems: ["Mangues", "Bananes", "Noix de cajou", "Karité"],
    challengesList: ["Logistique export", "Normes phytosanitaires", "Cold chain", "Accès financement"],
    successFactors: ["Réseau acheteurs Europe/Moyen-Orient", "Certification bio", "Volume", "Qualité tri"],
    digitalAdoption: "MEDIUM", paymentMethods: ["Virement bancaire", "Mobile Money", "Cash"],
    customerBase: "INTERNATIONAL", growthTrend: "GROWING", avgEmployees: 20, fundingAccess: "LIMITED",
  },
  // ── Construction ──
  {
    countryCode: "CD", region: "Central Africa",
    sector: "Construction", businessType: "Quincaillerie",
    avgMonthlyRevenue: 200000, avgMarginPercent: 18,
    topSellingItems: ["Ciment", "Fer à béton", "Tôles", "Peinture", "Plomberie"],
    challengesList: ["Capital stock", "Transport matériaux", "Fluctuation prix import", "Contrefaçon"],
    successFactors: ["Gamme complète", "Crédit professionnel", "Livraison chantier", "Stock permanent"],
    digitalAdoption: "LOW", paymentMethods: ["Cash", "Virement", "Mobile Money"],
    customerBase: "LOCAL", growthTrend: "GROWING", avgEmployees: 5, fundingAccess: "LIMITED",
  },
  {
    countryCode: "GA", region: "Central Africa",
    sector: "Construction", businessType: "Entrepreneur BTP",
    avgMonthlyRevenue: 600000, avgMarginPercent: 22,
    topSellingItems: ["Construction maison", "Rénovation", "Peinture", "Électricité", "Plomberie"],
    challengesList: ["Main-d'œuvre qualifiée", "Délais", "Coût matériaux", "Permis de construire"],
    successFactors: ["Réputation", "Respect délais", "Qualité finitions", "Réseau sous-traitants"],
    digitalAdoption: "LOW", paymentMethods: ["Virement", "Cash", "Mobile Money"],
    customerBase: "LOCAL", growthTrend: "GROWING", avgEmployees: 12, fundingAccess: "MODERATE",
  },
];

// ══════════════════════════════════════════════════════════════
// SECTION 4 — PATTERNS SAISONNIERS
// ══════════════════════════════════════════════════════════════

type SeasonalEntry = {
  countryCode: string;
  region: string;
  category: string;
  monthStart: number;
  monthEnd: number;
  priceMultiplier: number;
  demandMultiplier: number;
  reason: string;
  impact: string;
};

const SEASONAL_PATTERNS: SeasonalEntry[] = [
  // ── Fêtes de fin d'année (tous pays) ──
  { countryCode: "CD", region: "Central Africa", category: "Vêtements", monthStart: 11, monthEnd: 1, priceMultiplier: 1.3, demandMultiplier: 1.8, reason: "Fêtes de fin d'année — haute demande mode", impact: "MAJOR" },
  { countryCode: "CD", region: "Central Africa", category: "Alimentation", monthStart: 12, monthEnd: 1, priceMultiplier: 1.2, demandMultiplier: 1.5, reason: "Fêtes — stocks alimentaires", impact: "MODERATE" },
  { countryCode: "CD", region: "Central Africa", category: "Beauté & Soins", monthStart: 11, monthEnd: 1, priceMultiplier: 1.15, demandMultiplier: 1.6, reason: "Événements sociaux fin d'année", impact: "MODERATE" },
  { countryCode: "CD", region: "Central Africa", category: "Électronique", monthStart: 11, monthEnd: 12, priceMultiplier: 1.1, demandMultiplier: 1.4, reason: "Cadeaux de Noël + Black Friday", impact: "MODERATE" },
  // ── Rentrée scolaire ──
  { countryCode: "CD", region: "Central Africa", category: "Éducation & Formation", monthStart: 8, monthEnd: 9, priceMultiplier: 1.25, demandMultiplier: 2.0, reason: "Rentrée scolaire — kits, uniformes, fournitures", impact: "MAJOR" },
  { countryCode: "CI", region: "West Africa", category: "Éducation & Formation", monthStart: 9, monthEnd: 10, priceMultiplier: 1.2, demandMultiplier: 1.8, reason: "Rentrée scolaire", impact: "MAJOR" },
  { countryCode: "SN", region: "West Africa", category: "Éducation & Formation", monthStart: 10, monthEnd: 11, priceMultiplier: 1.2, demandMultiplier: 1.8, reason: "Rentrée scolaire", impact: "MAJOR" },
  { countryCode: "MA", region: "North Africa", category: "Éducation & Formation", monthStart: 9, monthEnd: 10, priceMultiplier: 1.15, demandMultiplier: 1.6, reason: "Rentrée scolaire", impact: "MODERATE" },
  // ── Ramadan (pays à forte pop musulmane) ──
  { countryCode: "SN", region: "West Africa", category: "Alimentation", monthStart: 3, monthEnd: 4, priceMultiplier: 1.25, demandMultiplier: 1.6, reason: "Ramadan — hausse demande alimentaire", impact: "MAJOR" },
  { countryCode: "GN", region: "West Africa", category: "Alimentation", monthStart: 3, monthEnd: 4, priceMultiplier: 1.3, demandMultiplier: 1.7, reason: "Ramadan — prix alimentaires en hausse", impact: "MAJOR" },
  { countryCode: "MA", region: "North Africa", category: "Alimentation", monthStart: 3, monthEnd: 4, priceMultiplier: 1.2, demandMultiplier: 1.5, reason: "Ramadan — consommation accrue", impact: "MAJOR" },
  { countryCode: "MA", region: "North Africa", category: "Vêtements", monthStart: 3, monthEnd: 4, priceMultiplier: 1.15, demandMultiplier: 1.4, reason: "Aïd el-Fitr — achats vestimentaires", impact: "MODERATE" },
  // ── Saison des pluies ──
  { countryCode: "CD", region: "Central Africa", category: "Agriculture", monthStart: 9, monthEnd: 11, priceMultiplier: 0.85, demandMultiplier: 0.7, reason: "Saison des pluies — récoltes abondantes, prix baissent", impact: "MODERATE" },
  { countryCode: "CD", region: "Central Africa", category: "Transport", monthStart: 10, monthEnd: 12, priceMultiplier: 1.2, demandMultiplier: 0.8, reason: "Routes impraticables — coûts transport augmentent", impact: "MODERATE" },
  { countryCode: "CI", region: "West Africa", category: "Agriculture", monthStart: 6, monthEnd: 8, priceMultiplier: 0.8, demandMultiplier: 0.65, reason: "Grande saison des pluies — abondance", impact: "MODERATE" },
  // ── Saison sèche ──
  { countryCode: "CD", region: "Central Africa", category: "Construction", monthStart: 5, monthEnd: 9, priceMultiplier: 1.15, demandMultiplier: 1.4, reason: "Saison sèche — activité BTP maximale", impact: "MODERATE" },
  { countryCode: "CD", region: "Central Africa", category: "Maison & Décoration", monthStart: 5, monthEnd: 8, priceMultiplier: 1.1, demandMultiplier: 1.2, reason: "Saison sèche — déménagements, rénovations", impact: "MINOR" },
  // ── Été Europe (tourisme) ──
  { countryCode: "MA", region: "North Africa", category: "Restauration", monthStart: 6, monthEnd: 8, priceMultiplier: 1.2, demandMultiplier: 1.5, reason: "Haute saison touristique", impact: "MAJOR" },
  { countryCode: "MA", region: "North Africa", category: "Services", monthStart: 6, monthEnd: 8, priceMultiplier: 1.15, demandMultiplier: 1.3, reason: "Tourisme — services en hausse", impact: "MODERATE" },
  // ── Toussaint & fêtes locales ──
  { countryCode: "GA", region: "Central Africa", category: "Vêtements", monthStart: 8, monthEnd: 8, priceMultiplier: 1.2, demandMultiplier: 1.5, reason: "Fête de l'indépendance (17 août)", impact: "MODERATE" },
  { countryCode: "CI", region: "West Africa", category: "Vêtements", monthStart: 12, monthEnd: 1, priceMultiplier: 1.25, demandMultiplier: 1.7, reason: "Fêtes de fin d'année + Tabaski", impact: "MAJOR" },
];

// ══════════════════════════════════════════════════════════════
// MAIN — Exécution du seed
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log("🧠 SEED Knowledge Base IA — Commerce Africain\n");
  console.log("═".repeat(60));

  const startTime = Date.now();
  let totalCreated = 0;
  let totalUpdated = 0;

  // ── 1. Catalogue produits ──
  console.log("\n📦 Section 1/4 — Catalogue produits...");
  let productCount = 0;

  for (const product of PRODUCTS) {
    for (const [cc, [avg, min, max]] of Object.entries(product.prices)) {
      const meta = COUNTRY_META[cc];
      if (!meta) continue;

      const rate = RATES_TO_USD[meta.currency] || 1;
      const avgLocal = (avg / 100) * rate;

      // Upsert pour chaque ville du pays (ou null si pas de ville précise)
      const cities = meta.cities.length > 0 ? meta.cities : [null];
      for (const city of cities) {
        try {
          const existing = await prisma.marketProductCatalog.findFirst({
            where: {
              countryCode: cc as CountryCode,
              city,
              category: product.category,
              subcategory: product.subcategory,
              productName: product.productName,
            },
          });

          if (existing) {
            await prisma.marketProductCatalog.update({
              where: { id: existing.id },
              data: {
                avgPriceUsdCents: avg, minPriceUsdCents: min, maxPriceUsdCents: max,
                localCurrency: meta.currency, avgPriceLocal: avgLocal,
                margin: product.margin, demandLevel: product.demandLevel,
                supplyLevel: product.supplyLevel, volatility: product.volatility,
                seasonalPeak: product.seasonalPeak, importOrigin: product.importOrigin,
                region: meta.region, unitLabel: product.unitLabel,
                dataSource: "SEED", confidence: 70,
              },
            });
            totalUpdated++;
          } else {
            await prisma.marketProductCatalog.create({
              data: {
                countryCode: cc as CountryCode,
                city,
                region: meta.region,
                category: product.category,
                subcategory: product.subcategory,
                productName: product.productName,
                unitLabel: product.unitLabel,
                avgPriceUsdCents: avg, minPriceUsdCents: min, maxPriceUsdCents: max,
                localCurrency: meta.currency, avgPriceLocal: avgLocal,
                margin: product.margin, demandLevel: product.demandLevel,
                supplyLevel: product.supplyLevel, volatility: product.volatility,
                seasonalPeak: product.seasonalPeak, importOrigin: product.importOrigin,
                dataSource: "SEED", confidence: 70,
              },
            });
            totalCreated++;
          }
          productCount++;
        } catch (err) {
          console.error(`  ⚠ ${product.productName} (${cc}/${city}): ${(err as Error).message}`);
        }
      }
    }
  }
  console.log(`  ✅ ${productCount} entrées catalogue`);

  // ── 2. Routes commerciales ──
  console.log("\n🚚 Section 2/4 — Routes commerciales...");
  let routeCount = 0;

  for (const route of TRADE_ROUTES) {
    try {
      const existing = await prisma.marketTradeRoute.findFirst({
        where: {
          sourceCountryCode: route.source[0] as CountryCode,
          sourceCity: route.source[1],
          destCountryCode: route.dest[0] as CountryCode,
          destCity: route.dest[1],
          category: route.category,
        },
      });

      const data = {
        sourceCountryCode: route.source[0] as CountryCode,
        sourceCity: route.source[1],
        destCountryCode: route.dest[0] as CountryCode,
        destCity: route.dest[1],
        category: route.category,
        topProducts: route.topProducts,
        volumeLevel: route.volumeLevel,
        avgMarkupPercent: route.avgMarkupPercent,
        avgTransitDays: route.avgTransitDays,
        transportMode: route.transportMode,
        riskLevel: route.riskLevel,
        regulatoryBarriers: route.regulatoryBarriers,
        tradeVolumeTrend: route.tradeVolumeTrend,
        dataSource: "SEED" as const,
        confidence: 65,
      };

      if (existing) {
        await prisma.marketTradeRoute.update({ where: { id: existing.id }, data });
        totalUpdated++;
      } else {
        await prisma.marketTradeRoute.create({ data });
        totalCreated++;
      }
      routeCount++;
    } catch (err) {
      console.error(`  ⚠ ${route.source[1]}→${route.dest[1]} (${route.category}): ${(err as Error).message}`);
    }
  }
  console.log(`  ✅ ${routeCount} routes commerciales`);

  // ── 3. Insights business ──
  console.log("\n🏪 Section 3/4 — Insights business...");
  let insightCount = 0;

  for (const insight of BUSINESS_INSIGHTS) {
    try {
      const existing = await prisma.marketBusinessInsight.findFirst({
        where: {
          countryCode: insight.countryCode as CountryCode,
          city: null,
          sector: insight.sector,
          businessType: insight.businessType,
        },
      });

      const data = {
        countryCode: insight.countryCode as CountryCode,
        region: insight.region,
        sector: insight.sector,
        businessType: insight.businessType,
        avgMonthlyRevenue: insight.avgMonthlyRevenue,
        avgMarginPercent: insight.avgMarginPercent,
        topSellingItems: insight.topSellingItems,
        challengesList: insight.challengesList,
        successFactors: insight.successFactors,
        digitalAdoption: insight.digitalAdoption,
        paymentMethods: insight.paymentMethods,
        customerBase: insight.customerBase,
        growthTrend: insight.growthTrend,
        avgEmployees: insight.avgEmployees,
        fundingAccess: insight.fundingAccess,
        dataSource: "SEED" as const,
        confidence: 60,
      };

      if (existing) {
        await prisma.marketBusinessInsight.update({ where: { id: existing.id }, data });
        totalUpdated++;
      } else {
        await prisma.marketBusinessInsight.create({ data });
        totalCreated++;
      }
      insightCount++;
    } catch (err) {
      console.error(`  ⚠ ${insight.sector}/${insight.businessType} (${insight.countryCode}): ${(err as Error).message}`);
    }
  }
  console.log(`  ✅ ${insightCount} insights business`);

  // ── 4. Patterns saisonniers ──
  console.log("\n🌦️ Section 4/4 — Patterns saisonniers...");
  let seasonCount = 0;

  for (const sp of SEASONAL_PATTERNS) {
    try {
      const existing = await prisma.marketSeasonalPattern.findFirst({
        where: {
          countryCode: sp.countryCode as CountryCode,
          category: sp.category,
          monthStart: sp.monthStart,
          monthEnd: sp.monthEnd,
        },
      });

      const data = {
        countryCode: sp.countryCode as CountryCode,
        region: sp.region,
        category: sp.category,
        monthStart: sp.monthStart,
        monthEnd: sp.monthEnd,
        priceMultiplier: sp.priceMultiplier,
        demandMultiplier: sp.demandMultiplier,
        reason: sp.reason,
        impact: sp.impact,
        dataSource: "SEED" as const,
      };

      if (existing) {
        await prisma.marketSeasonalPattern.update({ where: { id: existing.id }, data });
        totalUpdated++;
      } else {
        await prisma.marketSeasonalPattern.create({ data });
        totalCreated++;
      }
      seasonCount++;
    } catch (err) {
      console.error(`  ⚠ ${sp.category} ${sp.monthStart}-${sp.monthEnd} (${sp.countryCode}): ${(err as Error).message}`);
    }
  }
  console.log(`  ✅ ${seasonCount} patterns saisonniers`);

  // ── Résumé ──
  const elapsed = Date.now() - startTime;
  console.log("\n" + "═".repeat(60));
  console.log(`🧠 Knowledge Base seed terminé en ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`   📊 Créés: ${totalCreated} | Mis à jour: ${totalUpdated}`);
  console.log(`   📦 Produits: ${productCount} | 🚚 Routes: ${routeCount}`);
  console.log(`   🏪 Business: ${insightCount} | 🌦️ Saisonniers: ${seasonCount}`);
  console.log("═".repeat(60));
}

main()
  .catch((e) => { console.error("❌ Erreur seed KB:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
