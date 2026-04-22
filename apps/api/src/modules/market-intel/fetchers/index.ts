/**
 * Registry des fetchers market-intel.
 *
 * Mapping parser (string) → Fetcher. Si un parser spécifique n'est pas
 * implémenté, fallback vers le générique correspondant au `type` de source.
 */

import type { Fetcher, MarketSourceRow } from "./base.js";
import { newsRssFetcher } from "./news-rss.js";
import { genericPriceFetcher } from "./generic-price.js";
import { genericJobsFetcher } from "./generic-jobs.js";
import { genericStatsFetcher } from "./generic-stats.js";
import { jumiaFetcher } from "./jumia.js";
import { coinafriqueFetcher } from "./coinafrique.js";
import { afrimalinFetcher } from "./afrimalin.js";
import { linkedinJobsFetcher } from "./linkedin-jobs.js";

const REGISTRY: Record<string, Fetcher> = {
  "news-rss": newsRssFetcher,
  "generic-price": genericPriceFetcher,
  "generic-jobs": genericJobsFetcher,
  "generic-stats": genericStatsFetcher,
  jumia: jumiaFetcher,
  coinafrique: coinafriqueFetcher,
  afrimalin: afrimalinFetcher,
  "linkedin-jobs": linkedinJobsFetcher,
};

/**
 * Résout le fetcher pour une source donnée. Les parsers non-listés sont
 * mappés vers le générique selon leur `type` :
 *  - marketplace, classifieds → generic-price
 *  - news → news-rss
 *  - jobs → generic-jobs
 *  - stats → generic-stats
 */
export function resolveFetcher(source: MarketSourceRow): Fetcher {
  const direct = REGISTRY[source.parser];
  if (direct) return direct;

  switch (source.type) {
    case "marketplace":
    case "classifieds":
      return genericPriceFetcher;
    case "news":
      return newsRssFetcher;
    case "jobs":
      return genericJobsFetcher;
    case "stats":
      return genericStatsFetcher;
    default:
      return genericPriceFetcher;
  }
}

export const registeredParsers = Object.keys(REGISTRY);
