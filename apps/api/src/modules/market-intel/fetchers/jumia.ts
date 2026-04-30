/**
 * Fetcher "jumia" — Jumia.{ma,ci,sn,cd,co.ao}
 *
 * Jumia a une structure relativement stable : articles de produits dans
 * `.prd` avec `.name` + `.prc`. Paginé via `?page=N`.
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

const CATEGORY_PATHS = [
  "/phones-tablets/",
  "/electronics/",
  "/computing/",
  "/home-office/",
  "/supermarket/",
  "/health-beauty/",
];

export const jumiaFetcher: Fetcher = {
  parser: "jumia",

  async crawl(source: MarketSourceRow): Promise<FetchResult> {
    const result = emptyResult();
    const base = source.baseUrl.replace(/\/$/, "");
    const collectedAt = new Date();
    const seen = new Set<string>();

    for (const path of CATEGORY_PATHS) {
      const url = `${base}${path}`;
      const res = await httpGet(url);
      if (!res.ok) {
        result.errors.push(`HTTP ${res.status} on ${path}`);
        continue;
      }
      try {
        const $ = await loadCheerio(res.text);
        $("article.prd, div.prd").each((_, el) => {
          const container = $(el);
          const title = container.find(".name").first().text().trim();
          const priceText = container.find(".prc").first().text().trim();
          if (!title || !priceText) return;

          const parsed = parsePrice(priceText);
          if (!parsed) return;

          const href = container.find("a.core, a[href]").first().attr("href") ?? "";
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
        result.errors.push(`Parse ${path}: ${err?.message ?? String(err)}`);
      }
    }

    if (result.prices.length === 0 && result.errors.length > 0) {
      result.ok = false;
    }
    return result;
  },
};

function inferCurrency(countryCode: string): string {
  const map: Record<string, string> = {
    MA: "MAD", CI: "XOF", SN: "XOF", CD: "CDF", GA: "XAF", CG: "XAF", GN: "GNF", AO: "AOA",
  };
  return map[countryCode] ?? "EUR";
}
