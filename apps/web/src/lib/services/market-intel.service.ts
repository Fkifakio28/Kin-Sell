import { request } from "../api-core";

// ── Types ─────────────────────────────────────────────

export type MarketCountry = "MA" | "CI" | "SN" | "CD" | "GA" | "CG" | "GN" | "AO";

export const MARKET_COUNTRIES: { code: MarketCountry; label: string; flag: string; currency: string }[] = [
  { code: "MA", label: "Maroc",         flag: "🇲🇦", currency: "MAD" },
  { code: "CI", label: "Côte d'Ivoire", flag: "🇨🇮", currency: "XOF" },
  { code: "SN", label: "Sénégal",       flag: "🇸🇳", currency: "XOF" },
  { code: "CD", label: "RD Congo",      flag: "🇨🇩", currency: "CDF" },
  { code: "GA", label: "Gabon",         flag: "🇬🇦", currency: "XAF" },
  { code: "CG", label: "Congo",         flag: "🇨🇬", currency: "XAF" },
  { code: "GN", label: "Guinée",        flag: "🇬🇳", currency: "GNF" },
  { code: "AO", label: "Angola",        flag: "🇦🇴", currency: "AOA" },
];

export type MarketProductRow = {
  productSlug: string;
  productName: string;
  categoryId: string;
  brand: string | null;
  priceMinLocal: number;
  priceMaxLocal: number;
  priceMedianLocal: number;
  localCurrency: string;
  priceMedianEurCents: number;
  sampleSize: number;
  confidence: number;
  collectedAt: string;
};

export type MarketSalaryRow = {
  jobSlug: string;
  jobName: string;
  parentCategoryId: string;
  seniorityLevel: string;
  salaryMinLocal: number;
  salaryMaxLocal: number;
  salaryMedianLocal: number;
  localCurrency: string;
  salaryMedianEurCents: number;
  unit: string;
  sampleSize: number;
  confidence: number;
  collectedAt: string;
};

export type MarketTrendRow = {
  rank: number;
  score: number;
  deltaPct: number | null;
  season: string | null;
  computedAt: string;
  product: { slug: string; displayName: string; categoryId: string } | null;
  job: { slug: string; displayName: string; parentCategoryId: string } | null;
};

export type ArbitrageRow = {
  id: string;
  scope: "product" | "job";
  entityLabel: string;
  shortageCountry: MarketCountry;
  surplusCountry: MarketCountry;
  score: number;
  demandIndex: number;
  supplyIndex: number;
  priceDeltaEurCents: number | null;
  distanceKm: number | null;
  rationale: string;
  computedAt: string;
};

export type MarketIntelFeature = "MARKET_INTEL_BASIC" | "MARKET_INTEL_PREMIUM" | "ARBITRAGE_ENGINE";

export type MarketMeResponse = {
  features: MarketIntelFeature[];
  tier: "NONE" | "MEDIUM" | "PREMIUM";
  isAdmin: boolean;
  planCode: string | null;
};

export type MarketCoverage = {
  sourcesByCountry: Array<{ countryCode: string; type: string; _count: number }>;
  recentCrawls: Array<{ name: string; countryCode: string; type: string; lastCrawledAt: string | null; lastStatus: string | null; lastError: string | null }>;
  totals: { productCount: number; jobCount: number; priceCount: number; salaryCount: number; trendCount: number; arbCount: number };
  geminiQuota: { used: number; cap: number; date: string };
};

export type TriggerStep = "crawl" | "aggregate" | "trends" | "arbitrage";
export type TriggerCrawlType = "news" | "marketplace" | "classifieds" | "jobs" | "stats";

// ── API ───────────────────────────────────────────────

export const marketIntel = {
  me: () => request<MarketMeResponse>("/market/me"),

  products: (country: MarketCountry, opts?: { categoryId?: string; productSlug?: string; limit?: number }) => {
    const qs = new URLSearchParams({ country });
    if (opts?.categoryId) qs.set("categoryId", opts.categoryId);
    if (opts?.productSlug) qs.set("productSlug", opts.productSlug);
    if (opts?.limit) qs.set("limit", String(opts.limit));
    return request<{ country: MarketCountry; count: number; items: MarketProductRow[] }>(
      `/market/products?${qs.toString()}`,
    );
  },

  salaries: (country: MarketCountry, opts?: { parentCategoryId?: string; jobSlug?: string; limit?: number }) => {
    const qs = new URLSearchParams({ country });
    if (opts?.parentCategoryId) qs.set("parentCategoryId", opts.parentCategoryId);
    if (opts?.jobSlug) qs.set("jobSlug", opts.jobSlug);
    if (opts?.limit) qs.set("limit", String(opts.limit));
    return request<{ country: MarketCountry; count: number; items: MarketSalaryRow[] }>(
      `/market/salaries?${qs.toString()}`,
    );
  },

  trends: (country: MarketCountry, scope: "product" | "job" = "product", period: "weekly" | "monthly" = "weekly", limit = 50) => {
    const qs = new URLSearchParams({ country, scope, period, limit: String(limit) });
    return request<{ country: MarketCountry; scope: string; period: string; count: number; items: MarketTrendRow[] }>(
      `/market/trends?${qs.toString()}`,
    );
  },

  arbitrage: (opts?: { scope?: "product" | "job"; shortageCountry?: MarketCountry; surplusCountry?: MarketCountry; limit?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.scope) qs.set("scope", opts.scope);
    if (opts?.shortageCountry) qs.set("shortageCountry", opts.shortageCountry);
    if (opts?.surplusCountry) qs.set("surplusCountry", opts.surplusCountry);
    if (opts?.limit) qs.set("limit", String(opts.limit));
    const suffix = qs.toString();
    return request<{ count: number; items: ArbitrageRow[] }>(
      suffix ? `/market/arbitrage?${suffix}` : "/market/arbitrage",
    );
  },

  coverage: () => request<MarketCoverage>("/market/coverage"),

  trigger: (body: { steps: TriggerStep[]; crawlType?: TriggerCrawlType; crawlBatchSize?: number }) =>
    request<{ ok: boolean; report: Record<string, unknown> }>("/market/admin/trigger", {
      method: "POST",
      body,
    }),
};

// ── Formatters ────────────────────────────────────────

export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

export function formatLocalPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString("fr-FR")} ${currency}`;
  }
}

export function seasonLabel(season: string | null): string {
  switch (season) {
    case "ramadan": return "🌙 Ramadan";
    case "back-to-school": return "🎒 Rentrée";
    case "christmas": return "🎄 Fêtes";
    case "rainy-season": return "🌧️ Saison des pluies";
    case "dry-season": return "☀️ Saison sèche";
    default: return "";
  }
}
