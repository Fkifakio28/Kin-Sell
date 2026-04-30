/**
 * Fetcher "linkedin-jobs" — STUB volontaire
 *
 * LinkedIn bloque agressivement le scraping (CAPTCHA, bannissement IP, TOS).
 * Nous ne grattons PAS LinkedIn. Ce fetcher renvoie `ok: true, jobs: []` et
 * marque la source comme "manuel" — les offres LinkedIn doivent être
 * analysées par Gemini (E6) via l'API Google Search Grounding, ou ignorées.
 *
 * Cette entrée reste dans le catalogue pour information/affichage dans
 * l'UI (lien sortant vers la recherche LinkedIn côté client).
 */

import { emptyResult, type Fetcher, type FetchResult, type MarketSourceRow } from "./base.js";

export const linkedinJobsFetcher: Fetcher = {
  parser: "linkedin-jobs",

  async crawl(_source: MarketSourceRow): Promise<FetchResult> {
    const result = emptyResult();
    // Pas d'appel réseau. Source traitée via Gemini fallback (cf. E6).
    result.errors.push("LinkedIn scraping disabled by policy — handled via Gemini fallback");
    return result;
  },
};
