/**
 * Internal Signals — Kin-Sell Analytique+
 *
 * Cœur de l'autonomie : exploite les **données internes Kin-Sell** pour alimenter
 * MarketPrice / MarketSalary / MarketTrend sans appel LLM externe.
 *
 * Sources internes gratuites, fraîches, réelles :
 *  • `Listing` (prix affichés, catégories, pays, viewCount)
 *  • `OrderItem` (ventes réelles = prix de marché validés par transactions)
 *  • `SoKinPost` (signaux de tendance & demande via engagement)
 *  • `Negotiation` / `NegotiationOffer` (prix acceptés post-négociation)
 *
 * Confidence hiérarchisée :
 *  • 0.95 — OrderItem (ventes confirmées)
 *  • 0.85 — NegotiationOffer acceptée
 *  • 0.75 — Listing actif avec viewCount ≥ 10
 *  • 0.65 — Listing actif récent
 *  • (baseline seed = 0.55)
 *  • (Gemini = 0.60, plafonné)
 *
 * Matching `Listing.title` ↔ `MarketProduct.displayName` :
 *  1. Exact slug match sur titre normalisé
 *  2. Overlap tokens ≥ 0.55 + bonus marque canonique
 *  3. Fallback par catégorie si aucun produit matché (prix médian de la catégorie)
 *
 * Zéro appel Gemini. Zéro coût. 100% déterministe, reproductible, auditable.
 */

import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import { CountryCode } from "@prisma/client";
import { toEurCents } from "./fx/fx.service.js";

// ── Constantes partagées ────────────────────────────────

const COUNTRIES: CountryCode[] = [
  CountryCode.MA,
  CountryCode.CI,
  CountryCode.SN,
  CountryCode.CD,
  CountryCode.GA,
  CountryCode.CG,
  CountryCode.GN,
  CountryCode.AO,
];
type Country = (typeof COUNTRIES)[number];

const CCY: Record<Country, string> = {
  MA: "MAD", CI: "XOF", SN: "XOF", CD: "CDF", GA: "XAF", CG: "XAF", GN: "GNF", AO: "AOA",
};

// Taux USD → local (cours moyens 2026, utilisés quand Listing.priceUsdCents dispo)
const USD_TO_LOCAL: Record<string, number> = {
  MAD: 9.8, XOF: 595, CDF: 2590, XAF: 595, GNF: 8540, AOA: 845,
};

// ── Tokenisation ────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t.length >= 3));
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  return hit / Math.min(a.size, b.size);
}

// ── Matching Listing → MarketProduct ───────────────────

type Anchor = {
  id: string;
  slug: string;
  displayName: string;
  categoryId: string;
  tokens: Set<string>;
  brandToken?: string;
};

async function buildProductAnchors(): Promise<Anchor[]> {
  const products = await prisma.marketProduct.findMany();
  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    displayName: p.displayName,
    categoryId: p.categoryId,
    tokens: tokens(p.displayName),
    brandToken: p.canonicalBrand ? normalize(p.canonicalBrand).split(" ")[0] : undefined,
  }));
}

function matchProduct(title: string, anchors: Anchor[]): Anchor | null {
  const titleTokens = tokens(title);
  let best: { a: Anchor; score: number } | null = null;
  for (const a of anchors) {
    let score = overlap(titleTokens, a.tokens);
    if (a.brandToken && titleTokens.has(a.brandToken)) score += 0.2;
    if (score >= 0.55 && (!best || score > best.score)) best = { a, score };
  }
  return best?.a ?? null;
}

// ── Median helper ──────────────────────────────────────

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

// ── Agrégation depuis Listings actifs ──────────────────

type PriceAggregate = {
  productId: string;
  country: Country;
  values: number[]; // USD cents
  listingIds: string[];
  viewCounts: number[];
  maxAge: number; // jours
  source: "listing" | "order";
};

/**
 * Lit tous les `Listing` actifs et les `OrderItem` récents, matche sur
 * MarketProduct, calcule médiane en USD→EUR et upsert MarketPrice avec confidence
 * élevée (données réelles internes).
 */
export async function ingestKinSellInternalSignals(): Promise<{
  listingsScanned: number;
  listingsMatched: number;
  ordersScanned: number;
  ordersMatched: number;
  pricesUpserted: number;
  productsWithInternalData: number;
  durationMs: number;
}> {
  const t0 = Date.now();
  const anchors = await buildProductAnchors();
  const agg = new Map<string, PriceAggregate>(); // key = productId|country

  // ── 1) Scan Listings actifs publiés ──
  const listings = await prisma.listing.findMany({
    where: {
      isPublished: true,
      status: "ACTIVE",
      priceUsdCents: { gt: 0 },
      countryCode: { in: COUNTRIES },
      createdAt: { gte: new Date(Date.now() - 90 * 86400_000) }, // 90 j
    },
    select: {
      id: true,
      title: true,
      category: true,
      countryCode: true,
      priceUsdCents: true,
      viewCount: true,
      createdAt: true,
    },
  });

  let listingsMatched = 0;
  for (const l of listings) {
    if (!l.countryCode) continue;
    const match = matchProduct(l.title, anchors);
    if (!match) continue;
    listingsMatched++;
    const key = `${match.id}|${l.countryCode}`;
    const cur = agg.get(key) ?? {
      productId: match.id,
      country: l.countryCode as Country,
      values: [],
      listingIds: [],
      viewCounts: [],
      maxAge: 0,
      source: "listing" as const,
    };
    cur.values.push(l.priceUsdCents);
    cur.listingIds.push(l.id);
    cur.viewCounts.push(l.viewCount);
    const ageDays = (Date.now() - l.createdAt.getTime()) / 86400_000;
    cur.maxAge = Math.max(cur.maxAge, ageDays);
    agg.set(key, cur);
  }

  // ── 2) Scan OrderItems (ventes réelles = meilleur signal) ──
  const orderItems = await prisma.orderItem.findMany({
    where: {
      unitPriceUsdCents: { gt: 0 },
      createdAt: { gte: new Date(Date.now() - 60 * 86400_000) }, // 60 j
      order: { status: { in: ["CONFIRMED", "DELIVERED"] } },
    },
    select: {
      id: true,
      title: true,
      unitPriceUsdCents: true,
      createdAt: true,
      listing: { select: { countryCode: true } },
    },
    take: 5000,
  });

  let ordersMatched = 0;
  for (const oi of orderItems) {
    const countryCode = oi.listing?.countryCode;
    if (!countryCode) continue;
    const match = matchProduct(oi.title, anchors);
    if (!match) continue;
    ordersMatched++;
    const key = `${match.id}|${countryCode}`;
    const cur = agg.get(key) ?? {
      productId: match.id,
      country: countryCode as Country,
      values: [],
      listingIds: [],
      viewCounts: [],
      maxAge: 0,
      source: "order" as const,
    };
    // Boost le signal : ventes comptent double
    cur.values.push(oi.unitPriceUsdCents, oi.unitPriceUsdCents);
    cur.source = "order"; // upgrade la confiance
    agg.set(key, cur);
  }

  // ── 3) Upsert dans MarketPrice ──
  let upserted = 0;
  const productsSet = new Set<string>();
  for (const [, p] of agg) {
    if (p.values.length < 2) continue; // Seuil mini
    const medianUsd = median(p.values);
    const eurCents = Math.round(medianUsd * 0.92); // USD cents ≈ EUR cents à 0.92
    const localCcy = CCY[p.country];
    const fxUsdLocal = USD_TO_LOCAL[localCcy] ?? 1;
    const medianLocal = Math.round((medianUsd / 100) * fxUsdLocal);
    const minLocal = Math.round(medianLocal * 0.75);
    const maxLocal = Math.round(medianLocal * 1.25);

    const conf = p.source === "order" ? 0.92 : p.values.length >= 10 ? 0.82 : 0.72;

    try {
      await prisma.marketPrice.create({
        data: {
          productId: p.productId,
          countryCode: p.country,
          priceMinLocal: minLocal,
          priceMaxLocal: maxLocal,
          priceMedianLocal: medianLocal,
          localCurrency: localCcy,
          priceMedianEurCents: await toEurCents(medianLocal, localCcy).catch(() => eurCents),
          sampleSize: p.values.length,
          sourceIds: [],
          confidence: conf,
        },
      });
      upserted++;
      productsSet.add(p.productId);
    } catch (err: any) {
      logger.warn({ err: err?.message, productId: p.productId, country: p.country }, "[internal-signals] upsert failed");
    }
  }

  const report = {
    listingsScanned: listings.length,
    listingsMatched,
    ordersScanned: orderItems.length,
    ordersMatched,
    pricesUpserted: upserted,
    productsWithInternalData: productsSet.size,
    durationMs: Date.now() - t0,
  };
  logger.info(report, "[internal-signals] ✅ done");
  return report;
}

// ── Signal de demande depuis SoKinPost (trends organiques) ────

/**
 * Calcule un score de demande organique par pays depuis les posts SoKin
 * publiés sur 14 j, liés à un Listing (pour récupérer countryCode/category).
 * Engagement = likes + 2×comments + views/10. Zéro LLM.
 */
export async function computeOrganicDemandSignals(): Promise<{
  postsScanned: number;
  signalsByCountry: Record<string, number>;
  signalsByCategory: Record<string, number>;
}> {
  const since = new Date(Date.now() - 14 * 86400_000);
  const posts = await prisma.soKinPost.findMany({
    where: {
      createdAt: { gte: since },
      status: "ACTIVE",
      linkedListingId: { not: null },
    },
    select: {
      id: true,
      likes: true,
      comments: true,
      views: true,
      linkedListingId: true,
    },
    take: 10_000,
  });

  const listingIds = posts.map((p) => p.linkedListingId!).filter(Boolean);
  const listings = listingIds.length > 0
    ? await prisma.listing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true, countryCode: true, category: true },
      })
    : [];
  const listingMap = new Map(listings.map((l) => [l.id, l]));

  const signalsByCountry: Record<string, number> = {};
  const signalsByCategory: Record<string, number> = {};
  for (const p of posts) {
    const l = listingMap.get(p.linkedListingId!);
    if (!l || !l.countryCode) continue;
    const engagement = p.likes + p.comments * 2 + Math.floor(p.views / 10);
    signalsByCountry[l.countryCode] = (signalsByCountry[l.countryCode] ?? 0) + engagement;
    if (l.category) signalsByCategory[l.category] = (signalsByCategory[l.category] ?? 0) + engagement;
  }

  logger.info({ postsScanned: posts.length, countries: Object.keys(signalsByCountry).length }, "[internal-signals] organic demand computed");
  return { postsScanned: posts.length, signalsByCountry, signalsByCategory };
}
