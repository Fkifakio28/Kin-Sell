/**
 * BaseFetcher — Framework commun des fetchers market-intel.
 *
 * Fournit :
 *  - fetch HTTP avec User-Agent identifiable, timeout, retry exponentiel
 *  - respect du délai entre requêtes pour un même host (rate-limit naïf)
 *  - parsing HTML via Cheerio (lazy-loaded pour éviter coût au boot)
 *  - normalisation des prix (extraction nombre + devise)
 *
 * Contrats :
 *  - Chaque fetcher expose un `parser: string` (ex "jumia", "news-rss")
 *    qui matche `MarketSource.parser`.
 *  - Méthode `crawl(source)` → FetchResult (produits + prix détectés).
 *  - Méthode `crawlJobs(source)` optionnelle pour sources d'emploi.
 */

import { env } from "../../../config/env.js";
import { logger } from "../../../shared/logger.js";

export type MarketSourceRow = {
  id: string;
  name: string;
  baseUrl: string;
  type: string;
  countryCode: string;
  parser: string;
  language: string;
  trusted: boolean;
};

export type PriceObservation = {
  productSlug?: string; // slug canonique si reconnu
  title: string;
  priceLocal: number; // entier (cents de la devise locale — OU unité entière selon devise sans cents)
  currency: string;
  url: string;
  city?: string;
  sourceId: string;
  collectedAt: Date;
};

export type JobObservation = {
  jobSlug?: string;
  title: string;
  salaryMinLocal?: number;
  salaryMaxLocal?: number;
  currency?: string;
  city?: string;
  url: string;
  sourceId: string;
  collectedAt: Date;
};

export type FetchResult = {
  ok: boolean;
  prices: PriceObservation[];
  jobs: JobObservation[];
  errors: string[];
};

export interface Fetcher {
  parser: string;
  crawl(source: MarketSourceRow, options?: CrawlOptions): Promise<FetchResult>;
}

export type CrawlOptions = {
  /** Chemins/requêtes spécifiques à crawler. Si absent, le fetcher utilise son heuristique. */
  paths?: string[];
  /** Limite max de pages à visiter par appel. */
  maxPages?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limiting naïf par host
// ─────────────────────────────────────────────────────────────────────────────
const lastHit = new Map<string, number>();

async function respectRateLimit(host: string): Promise<void> {
  const delay = env.MARKET_INTEL_FETCH_DELAY_MS;
  const last = lastHit.get(host) ?? 0;
  const now = Date.now();
  const wait = last + delay - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastHit.set(host, Date.now());
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function httpGet(url: string, opts: { accept?: string } = {}): Promise<{
  ok: boolean;
  status: number;
  text: string;
  contentType: string;
}> {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  let attempt = 0;
  const maxAttempts = env.MARKET_INTEL_FETCH_RETRIES + 1;
  let lastError: Error | null = null;

  while (attempt < maxAttempts) {
    attempt++;
    await respectRateLimit(host);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), env.MARKET_INTEL_FETCH_TIMEOUT_MS);

      const res = await fetch(url, {
        headers: {
          "User-Agent": env.MARKET_INTEL_USER_AGENT,
          Accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr,en;q=0.8,pt;q=0.6,ar;q=0.4",
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);

      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        // 429/5xx → retry ; 4xx autre → stop
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`HTTP ${res.status}`);
          await new Promise((r) => setTimeout(r, 800 * attempt));
          continue;
        }
        return { ok: false, status: res.status, text: "", contentType };
      }

      const text = await res.text();
      return { ok: true, status: res.status, text, contentType };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }

  logger.warn({ url, err: lastError?.message }, "[market-intel] httpGet failed");
  return { ok: false, status: 0, text: "", contentType: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prix : extraction / normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrait un prix numérique depuis une chaîne "25 000 FCFA", "1 234,50 MAD", "R$ 12.990,00", etc.
 * Retourne la valeur entière dans l'unité "monnaie brute" (pas de cents automatique).
 */
export function parsePrice(raw: string): { value: number; currency?: string } | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();

  // Détection devise
  const currencyMap: Array<[RegExp, string]> = [
    [/MAD|درهم|dh\b/i, "MAD"],
    [/FCFA|XOF|F\.?\s*CFA/i, "XOF"], // XOF/XAF identiques au scrape, côté code on trust countryCode
    [/XAF/i, "XAF"],
    [/CDF|FC\b|Fr\.?\s*Congolais/i, "CDF"],
    [/GNF|FG\b|Guinée.*francs?/i, "GNF"],
    [/AOA|Kz|Kwanza/i, "AOA"],
    [/EUR|€/i, "EUR"],
    [/USD|\$\b/i, "USD"],
  ];
  let currency: string | undefined;
  for (const [re, code] of currencyMap) {
    if (re.test(cleaned)) {
      currency = code;
      break;
    }
  }

  // Extraction du nombre (formats européens et US)
  const numMatch = cleaned.match(/[\d][\d .,]*\d|\d/);
  if (!numMatch) return null;
  const numStr = numMatch[0];

  let normalized: number;
  // Heuristique : si contient ',' puis '.' en queue c'est format US (1,234.56)
  // si contient ' ' ou '.' comme séparateur millier puis ',' décimales c'est FR
  if (/,\d{2}$/.test(numStr) && /[ .]/.test(numStr)) {
    // FR: "1 234,56" ou "1.234,56"
    normalized = Number.parseFloat(numStr.replace(/[ .]/g, "").replace(",", "."));
  } else if (/\.\d{2}$/.test(numStr) && /,/.test(numStr)) {
    // US: "1,234.56"
    normalized = Number.parseFloat(numStr.replace(/,/g, ""));
  } else {
    // Entier ou décimal simple
    normalized = Number.parseFloat(numStr.replace(/[ ,]/g, "").replace(/\.(?=\d{3}\b)/g, ""));
  }

  if (!Number.isFinite(normalized) || normalized <= 0) return null;

  return { value: Math.round(normalized), currency };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cheerio (dynamic import pour ne pas alourdir le boot)
// ─────────────────────────────────────────────────────────────────────────────

export async function loadCheerio(html: string): Promise<import("cheerio").CheerioAPI> {
  const cheerio = await import("cheerio");
  return cheerio.load(html);
}

// ─────────────────────────────────────────────────────────────────────────────
// FetchResult helpers
// ─────────────────────────────────────────────────────────────────────────────

export function emptyResult(): FetchResult {
  return { ok: true, prices: [], jobs: [], errors: [] };
}
