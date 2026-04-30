/**
 * Fetcher générique "generic-jobs"
 *
 * Parcourt la page d'accueil d'un site d'annonces emploi, extrait titre +
 * fourchette salariale si présente. Dédupé par titre+URL.
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

const JOB_SELECTORS = [
  "[class*=job i]",
  "[class*=offre i]",
  "[class*=vacancy i]",
  "article.job",
  ".job-card",
  ".job-item",
];

export const genericJobsFetcher: Fetcher = {
  parser: "generic-jobs",

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

      for (const sel of JOB_SELECTORS) {
        $(sel).each((_, el) => {
          const container = $(el);
          const titleEl = container.find("h1, h2, h3, h4, a[title]").first();
          const title = (titleEl.attr("title") ?? titleEl.text().trim()) || "";
          if (!title || title.length < 5 || title.length > 200) return;

          const link = container.find("a[href]").first().attr("href") ?? source.baseUrl;
          const absLink = link.startsWith("http") ? link : source.baseUrl.replace(/\/$/, "") + link;

          const key = `${title.toLowerCase()}|${absLink}`;
          if (seen.has(key)) return;
          seen.add(key);

          // Détection salaire (optionnel)
          const salaryText = container.find("[class*=salary i], [class*=salaire i]").first().text().trim();
          const parsed = salaryText ? parsePrice(salaryText) : null;

          result.jobs.push({
            title,
            salaryMinLocal: parsed?.value,
            salaryMaxLocal: parsed?.value,
            currency: parsed?.currency,
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
