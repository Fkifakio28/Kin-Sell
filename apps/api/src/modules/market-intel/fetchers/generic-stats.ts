/**
 * Fetcher générique "generic-stats"
 *
 * Les sites de statistiques officielles (HCP, INS, BCEAO, BEAC, BCC, BNA…)
 * ont des structures très hétérogènes. Ce fetcher se contente d'archiver
 * la page d'accueil (ou une page-index) et d'enregistrer un "ping" de
 * santé (lastCrawledAt/lastStatus) sans extraire de données.
 *
 * L'exploitation fine des stats (taux d'inflation, IPC) est pilotée par des
 * adapters dédiés ou par Gemini en dernier recours (E6).
 */

import { emptyResult, httpGet, type Fetcher, type FetchResult, type MarketSourceRow } from "./base.js";

export const genericStatsFetcher: Fetcher = {
  parser: "generic-stats",

  async crawl(source: MarketSourceRow): Promise<FetchResult> {
    const result = emptyResult();
    const res = await httpGet(source.baseUrl);
    if (!res.ok) {
      result.ok = false;
      result.errors.push(`HTTP ${res.status}`);
      return result;
    }
    // Simple ping — marque la source comme "reachable". Données extraites ailleurs.
    return result;
  },
};
