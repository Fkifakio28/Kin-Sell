/**
 * Fetcher générique "generic-price"
 *
 * Stratégie minimaliste : visite l'URL de base, extrait tout élément dont le
 * texte matche un motif de prix et un titre associé (h1/h2/h3/h4 ou lien
 * parent). Dédupé par (titre, prix).
 *
 * Utilisé comme fallback pour les marketplaces sans parser dédié. Précision
 * médiocre — à privilégier seulement pour enrichissement.
 */

import {
  emptyResult,
  httpGet,
  loadCheerio,
  parsePrice,
  type Fetcher,
  type FetchResult,
  type MarketSourceRow,
} from "./base.js";

const PRICE_SELECTORS = [
  "[class*=price i]",
  "[data-price]",
  "[itemprop=price]",
  ".price",
  ".product-price",
];

export const genericPriceFetcher: Fetcher = {
  parser: "generic-price",

  async crawl(source: MarketSourceRow): Promise<FetchResult> {
    const result = emptyResult();
    const res = await httpGet(source.baseUrl);
    if (!res.ok) {
      result.ok = false;
      result.errors.push(`HTTP ${res.status}`);
      return result;
    }

    try {
      const $ = await loadCheerio(res.text);
      const collectedAt = new Date();
      const seen = new Set<string>();

      for (const sel of PRICE_SELECTORS) {
        $(sel).each((_, el) => {
          const priceText = $(el).text().trim() || $(el).attr("data-price") || "";
          const parsed = parsePrice(priceText);
          if (!parsed) return;

          // Remonte au container pour trouver un titre
          const container = $(el).closest("article, .product, li, .card, [class*=item i]").first();
          const titleEl = container.find("h1, h2, h3, h4, a[title]").first();
          const title = (titleEl.attr("title") ?? titleEl.text().trim()) || "";
          if (!title || title.length < 3 || title.length > 200) return;

          const link = container.find("a[href]").first().attr("href") ?? source.baseUrl;
          const absLink = link.startsWith("http") ? link : source.baseUrl.replace(/\/$/, "") + link;

          const key = `${title.toLowerCase()}|${parsed.value}`;
          if (seen.has(key)) return;
          seen.add(key);

          result.prices.push({
            title,
            priceLocal: parsed.value,
            currency: parsed.currency ?? inferCurrency(source.countryCode),
            url: absLink,
            sourceId: source.id,
            collectedAt,
          });
        });
      }
    } catch (err: any) {
      result.ok = false;
      result.errors.push(`Parse error: ${err?.message ?? String(err)}`);
    }

    return result;
  },
};

function inferCurrency(countryCode: string): string {
  const map: Record<string, string> = {
    MA: "MAD",
    CI: "XOF",
    SN: "XOF",
    CD: "CDF",
    GA: "XAF",
    CG: "XAF",
    GN: "GNF",
    AO: "AOA",
  };
  return map[countryCode] ?? "EUR";
}
