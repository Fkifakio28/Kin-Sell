/**
 * Fetcher "afrimalin" — afrimalin.{ci,cd,bf,tg…}
 *
 * Annonces avec `.listing-card` / `.listings-cards__list-item`. Prix dans
 * `.listing-card__price`.
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

export const afrimalinFetcher: Fetcher = {
  parser: "afrimalin",

  async crawl(source: MarketSourceRow): Promise<FetchResult> {
    const result = emptyResult();
    const base = source.baseUrl.replace(/\/$/, "");
    const res = await httpGet(base);
    if (!res.ok) {
      result.ok = false;
      result.errors.push(`HTTP ${res.status}`);
      return result;
    }

    try {
      const $ = await loadCheerio(res.text);
      const collectedAt = new Date();
      const seen = new Set<string>();

      $(".listing-card, .listings-cards__list-item, article").each((_, el) => {
        const container = $(el);
        const title = container.find("h2, h3, .listing-card__title").first().text().trim();
        const priceText = container.find(".listing-card__price, [class*=price i]").first().text().trim();
        if (!title || !priceText) return;
        const parsed = parsePrice(priceText);
        if (!parsed) return;

        const href = container.find("a[href]").first().attr("href") ?? "";
        const absLink = href.startsWith("http") ? href : base + href;

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
    } catch (err: any) {
      result.ok = false;
      result.errors.push(`Parse error: ${err?.message ?? String(err)}`);
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
