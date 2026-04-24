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
    const collectedAt = new Date();
    const seen = new Set<string>();

    // Pagination : on visite jusqu'à 5 pages si elles répondent. On arrête
    // dès qu'une page ne retourne aucune nouvelle annonce (signe de fin).
    let pagesFetched = 0;
    for (let page = 1; page <= 5; page++) {
      const url = page === 1 ? base : `${base}?page=${page}`;
      const res = await httpGet(url);
      if (!res.ok) {
        if (page === 1) {
          result.ok = false;
          result.errors.push(`HTTP ${res.status}`);
          return result;
        }
        break;
      }

      try {
        const $ = await loadCheerio(res.text);
        const beforeCount = result.prices.length;

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

        pagesFetched++;
        // Page sans nouveau contenu → fin de pagination.
        if (result.prices.length === beforeCount) break;
      } catch (err: any) {
        result.errors.push(`Parse page ${page}: ${err?.message ?? String(err)}`);
        break;
      }
    }

    if (pagesFetched === 0) result.ok = false;
    return result;
  },
};

function inferCurrency(cc: string): string {
  const map: Record<string, string> = {
    MA: "MAD", CI: "XOF", SN: "XOF", CD: "CDF", GA: "XAF", CG: "XAF", GN: "GNF", AO: "AOA",
  };
  return map[cc] ?? "EUR";
}
