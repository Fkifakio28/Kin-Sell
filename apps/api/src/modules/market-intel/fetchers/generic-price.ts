/**
 * Fetcher générique "generic-price"
 *
 * Stratégie minimaliste : visite l'URL de base, extrait tout élément dont le
 * texte matche un motif de prix et un titre associé (h1/h2/h3/h4 ou lien
 * parent). Dédupé par (titre, prix).
 *
 * Utilisé comme fallback pour les marketplaces sans parser dédié. Précision
 * médiocre — à privilégier seulement pour enrichissement.
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

const PRICE_SELECTORS = [
  "[itemprop=price]",
  "[data-price]",
  ".product-price",
  "[class*=product-price i]",
  "article [class*=price i]",
  "li [class*=price i]",
  ".card [class*=price i]",
];

// Mots-clés éliminant un faux titre (menu de navigation, footer, etc.).
const NOISE_TITLE = /\b(connexion|compte|panier|menu|contact|newsletter|livraison|promo|soldes?|promotions?|cookies?|faq|conditions|mentions|politique|accueil|home|categories|boutique|shop|page|filtrer|trier)\b/i;

export const genericPriceFetcher: Fetcher = {
  parser: "generic-price",

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

      for (const sel of PRICE_SELECTORS) {
        $(sel).each((_, el) => {
          const priceText = $(el).text().trim() || $(el).attr("data-price") || "";
          const parsed = parsePrice(priceText);
          if (!parsed) return;

          // Remonte au container pour trouver un titre. Si aucun container
          // "article/li/product/card" trouvé → on abandonne (c'est un prix
          // isolé dans nav/footer/widget — bruit garanti).
          const container = $(el).closest("article, .product, li, .card, [data-product], [class*=item i]").first();
          if (container.length === 0) return;

          const titleEl = container.find("h1, h2, h3, h4, a[title]").first();
          const title = (titleEl.attr("title") ?? titleEl.text().trim()) || "";
          // Titre de produit plausible : >= 8 chars, pas du bruit de navigation.
          if (!title || title.length < 8 || title.length > 200) return;
          if (NOISE_TITLE.test(title)) return;

          // Prix absurdes filtrés dès la source (complément aux bornes agg).
          if (parsed.value <= 0 || parsed.value > 1_000_000_000_000) return;

          const link = container.find("a[href]").first().attr("href") ?? source.baseUrl;
          const absLink = link.startsWith("http") ? link : source.baseUrl.replace(/\/$/, "") + link;

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
      }
    } catch (err: any) {
      result.ok = false;
      result.errors.push(`Parse error: ${err?.message ?? String(err)}`);
    }

    return result;
  },
};

function inferCurrency(countryCode: string): string {
  const map: Record<string, string> = {
    MA: "MAD",
    CI: "XOF",
    SN: "XOF",
    CD: "CDF",
    GA: "XAF",
    CG: "XAF",
    GN: "GNF",
    AO: "AOA",
  };
  return map[countryCode] ?? "EUR";
}
