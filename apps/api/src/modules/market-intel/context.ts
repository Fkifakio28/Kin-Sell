/**
 * Market-Intel Context — Helper pour nourrir les IA Knowledge (IA-Ads, IA-Messager,
 * IA-Merchant, post-publish-advisor, pricing-nudge).
 *
 * Principe : les IA existantes produisent déjà des réponses ciblées par user.
 * Ce module leur fournit un "snapshot" marché pertinent pour enrichir leurs
 * prompts / règles :
 *   - prix médian du produit dans le pays du user
 *   - tendance du produit (rank, deltaPct, saisonnalité)
 *   - top arbitrage si le user est sur un scale (SCALE uniquement)
 *   - salaire médian du métier si user est candidat/business
 *
 * Volontairement léger : une seule requête par appel, pas de jointures lourdes.
 */

import { prisma } from "../../shared/db/prisma.js";

type CountryCode = "MA" | "CI" | "SN" | "CD" | "GA" | "CG" | "GN" | "AO";

const SUPPORTED_COUNTRIES = new Set(["MA", "CI", "SN", "CD", "GA", "CG", "GN", "AO"]);

export type MarketContextSnapshot = {
  country: CountryCode | null;
  productInsight: {
    productSlug: string;
    displayName: string;
    priceMedianLocal: number;
    priceMedianEurCents: number;
    localCurrency: string;
    sampleSize: number;
    confidence: number;
    trendRank: number | null;
    trendDeltaPct: number | null;
    trendSeason: string | null;
  } | null;
  topTrends: Array<{
    rank: number;
    name: string;
    deltaPct: number | null;
    season: string | null;
  }>;
  arbitrageHints: Array<{
    entityLabel: string;
    shortageCountry: string;
    surplusCountry: string;
    score: number;
    rationale: string;
  }>;
};

/**
 * Renvoie un snapshot marché pour un user. Les paramètres :
 *   - country : ISO2 du pays du user (si null, pas de données)
 *   - productSlug / categoryId : pour cibler un produit / une catégorie
 *   - includeArbitrage : true seulement pour les tiers SCALE
 */
export async function getMarketContextForUser(opts: {
  country: string | null | undefined;
  productSlug?: string;
  categoryId?: string;
  includeArbitrage?: boolean;
}): Promise<MarketContextSnapshot> {
  const country = opts.country && SUPPORTED_COUNTRIES.has(opts.country)
    ? (opts.country as CountryCode)
    : null;

  const snapshot: MarketContextSnapshot = {
    country,
    productInsight: null,
    topTrends: [],
    arbitrageHints: [],
  };
  if (!country) return snapshot;

  // ── Product insight ──
  if (opts.productSlug || opts.categoryId) {
    const price = await prisma.marketPrice.findFirst({
      where: {
        countryCode: country,
        product: {
          ...(opts.productSlug ? { slug: opts.productSlug } : {}),
          ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
        },
      },
      orderBy: { collectedAt: "desc" },
      include: { product: { select: { slug: true, displayName: true } } },
    });
    if (price) {
      const trend = await prisma.marketTrend.findFirst({
        where: { countryCode: country, scope: "product", productId: price.productId },
        orderBy: { rank: "asc" },
      });
      snapshot.productInsight = {
        productSlug: price.product.slug,
        displayName: price.product.displayName,
        priceMedianLocal: price.priceMedianLocal,
        priceMedianEurCents: price.priceMedianEurCents,
        localCurrency: price.localCurrency,
        sampleSize: price.sampleSize,
        confidence: price.confidence,
        trendRank: trend?.rank ?? null,
        trendDeltaPct: trend?.deltaPct ?? null,
        trendSeason: trend?.season ?? null,
      };
    }
  }

  // ── Top trends ──
  const trends = await prisma.marketTrend.findMany({
    where: { countryCode: country, scope: "product", period: "weekly" },
    orderBy: { rank: "asc" },
    take: 5,
    include: { product: { select: { displayName: true } } },
  });
  snapshot.topTrends = trends.map((t) => ({
    rank: t.rank,
    name: t.product?.displayName ?? "—",
    deltaPct: t.deltaPct,
    season: t.season,
  }));

  // ── Arbitrage (SCALE uniquement) ──
  if (opts.includeArbitrage) {
    const arb = await prisma.arbitrageOpportunity.findMany({
      where: {
        active: true,
        OR: [{ shortageCountry: country }, { surplusCountry: country }],
      },
      orderBy: { score: "desc" },
      take: 3,
    });
    snapshot.arbitrageHints = arb.map((a) => ({
      entityLabel: a.entityLabel,
      shortageCountry: a.shortageCountry,
      surplusCountry: a.surplusCountry,
      score: a.score,
      rationale: a.rationale,
    }));
  }

  return snapshot;
}

/**
 * Sérialise un snapshot en texte court injectable dans un prompt LLM
 * ou dans une règle de recommandation textuelle.
 */
export function formatSnapshotForPrompt(s: MarketContextSnapshot): string {
  if (!s.country) return "";
  const parts: string[] = [];
  if (s.productInsight) {
    const p = s.productInsight;
    parts.push(
      `Prix médian ${p.displayName} en ${s.country}: ${p.priceMedianLocal} ${p.localCurrency} (~${(p.priceMedianEurCents / 100).toFixed(0)}€, ${p.sampleSize} obs, confiance ${(p.confidence * 100).toFixed(0)}%).`,
    );
    if (p.trendRank) {
      const dir = (p.trendDeltaPct ?? 0) >= 0 ? "↑" : "↓";
      parts.push(
        `Tendance #${p.trendRank}, ${dir}${Math.abs(p.trendDeltaPct ?? 0).toFixed(1)}% sur 14j${p.trendSeason ? ` (saison: ${p.trendSeason})` : ""}.`,
      );
    }
  }
  if (s.topTrends.length > 0) {
    parts.push(
      `Top tendances ${s.country}: ${s.topTrends.slice(0, 3).map((t) => `#${t.rank} ${t.name}`).join(", ")}.`,
    );
  }
  if (s.arbitrageHints.length > 0) {
    const a = s.arbitrageHints[0];
    parts.push(
      `Opportunité arbitrage: ${a.entityLabel} — ${a.shortageCountry} (pénurie) ← ${a.surplusCountry} (abondance), score ${(a.score * 100).toFixed(0)}.`,
    );
  }
  return parts.join(" ");
}
