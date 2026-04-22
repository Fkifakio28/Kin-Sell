/**
 * Fetcher "coinafrique" — coinafrique.com/{country-slug}
 *
 * Site de petites annonces sur 14+ pays africains. Chaque annonce a
 * `.card-general__body` avec `.ad__card-description` (titre) et
 * `.ad__card-price` (prix).
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

const CATEGORIES = ["voitures", "motos", "telephones", "ordinateurs", "electronique", "meubles", "immobilier"];

export const coinafriqueFetcher: Fetcher = {
  parser: "coinafrique",

  async crawl(source: MarketSourceRow): Promise<FetchResult> {
    const result = emptyResult();
    const base = source.baseUrl.replace(/\/$/, "");
    const collectedAt = new Date();
    const seen = new Set<string>();

    for (const cat of CATEGORIES) {
      const url = `${base}/categorie/${cat}`;
      const res = await httpGet(url);
      if (!res.ok) {
        result.errors.push(`HTTP ${res.status} on ${cat}`);
        continue;
      }
      try {
        const $ = await loadCheerio(res.text);
        $(".card-general, .card").each((_, el) => {
          const container = $(el);
          const title =
            container.find(".ad__card-description, h2, h3").first().text().trim() ||
            container.find("a[title]").first().attr("title") ||
            "";
          const priceText = container.find(".ad__card-price, [class*=price i]").first().text().trim();
          if (!title || !priceText) return;

          const parsed = parsePrice(priceText);
          if (!parsed) return;

          const href = container.find("a[href]").first().attr("href") ?? "";
          const absLink = href.startsWith("http") ? href : base + href;
          const city = container.find(".card-general__bottom--description, [class*=location i]").first().text().trim() || undefined;

          const key = `${title.toLowerCase()}|${parsed.value}`;
          if (seen.has(key)) return;
          seen.add(key);

          result.prices.push({
            title,
            priceLocal: parsed.value,
            currency: parsed.currency ?? inferCurrency(source.countryCode),
            url: absLink,
            city,
            sourceId: source.id,
            collectedAt,
          });
        });
      } catch (err: any) {
        result.errors.push(`Parse ${cat}: ${err?.message ?? String(err)}`);
      }
    }
    return result;
  },
};

function inferCurrency(cc: string): string {
  const map: Record<string, string> = {
    MA: "MAD", CI: "XOF", SN: "XOF", CD: "CDF", GA: "XAF", CG: "XAF", GN: "GNF", AO: "AOA",
  };
  return map[cc] ?? "EUR";
}
