/**
 * pricingLinks — Utilitaire de deep-linking vers la page tarifs Kin-Sell.
 *
 * Centralise la construction d'URLs contextuelles pour toutes les
 * recommandations commerciales (KsReco, SmartUpsell, Advisors…).
 *
 * Schéma URL :
 *   /forfaits?tab=users|business|addons&highlight=CODE&section=SECTION
 *
 * Exemples :
 *   /forfaits?tab=users&highlight=BOOST
 *   /forfaits?tab=business&highlight=SCALE
 *   /forfaits?tab=addons&highlight=ADS_PACK
 *   /forfaits?tab=addons&section=analytics
 */

/* ═══════════════════════════════════════════ TYPES ═══════ */

export type PricingTab = "users" | "business" | "addons";

/** Codes de plans connus */
const USER_PLAN_CODES = ["FREE", "BOOST", "AUTO", "PRO_VENDOR"] as const;
const BUSINESS_PLAN_CODES = ["STARTER", "BUSINESS", "SCALE"] as const;
const ADDON_CODES = [
  "IA_MERCHANT",
  "IA_ORDER",
  "BOOST_VISIBILITY",
  "ADS_PACK",
  "ADS_PREMIUM",
] as const;

type UserPlan = (typeof USER_PLAN_CODES)[number];
type BusinessPlan = (typeof BUSINESS_PLAN_CODES)[number];
type AddonCode = (typeof ADDON_CODES)[number];
type PlanCode = UserPlan | BusinessPlan | AddonCode;

/* ═══════════════════════════════════════════ HELPERS ═══════ */

/** Déduit le tab cible depuis un code plan/addon */
export function tabForCode(code: string): PricingTab {
  const upper = code.toUpperCase();
  if ((USER_PLAN_CODES as readonly string[]).includes(upper)) return "users";
  if ((BUSINESS_PLAN_CODES as readonly string[]).includes(upper)) return "business";
  if ((ADDON_CODES as readonly string[]).includes(upper)) return "addons";
  // Fallback analytics
  if (upper === "ANALYTICS" || upper === "ANALYTICS_MEDIUM" || upper === "ANALYTICS_PREMIUM")
    return "addons";
  return "users";
}

/* ═══════════════════════════════════════════ BUILDERS ═══════ */

export interface PricingLinkOptions {
  /** Code du plan ou addon à highlight (ex: "BOOST", "ADS_PACK") */
  highlight?: string;
  /** Section spéciale à cibler (ex: "analytics", "comparison") */
  section?: string;
  /** Forcer un tab spécifique (sinon auto-détecté) */
  tab?: PricingTab;
}

/**
 * Construit une URL deep-link vers /forfaits.
 *
 * @example
 * buildPricingUrl({ highlight: "BOOST" })
 * // → "/forfaits?tab=users&highlight=BOOST"
 *
 * buildPricingUrl({ highlight: "ADS_PACK" })
 * // → "/forfaits?tab=addons&highlight=ADS_PACK"
 *
 * buildPricingUrl({ section: "analytics" })
 * // → "/forfaits?tab=addons&section=analytics"
 */
export function buildPricingUrl(options: PricingLinkOptions = {}): string {
  const params = new URLSearchParams();

  const tab = options.tab ?? (options.highlight ? tabForCode(options.highlight) : undefined);
  if (tab) params.set("tab", tab);
  if (options.highlight) params.set("highlight", options.highlight.toUpperCase());
  if (options.section) params.set("section", options.section);

  const qs = params.toString();
  return qs ? `/forfaits?${qs}` : "/forfaits";
}

/* ═══════════════════════════════════════════ MAPPINGS ═══════ */

/**
 * Mapping productType/productCode → deep-link contextualisé.
 * Utilisé par les helpers du moteur de recommandation.
 */
export function ctaTargetForProduct(
  productType: string,
  productCode?: string,
): string {
  switch (productType) {
    case "BOOST":
      return buildPricingUrl({ highlight: productCode || "BOOST" });
    case "ADS_PACK":
      return buildPricingUrl({ highlight: "ADS_PACK" });
    case "ADS_PREMIUM":
      return buildPricingUrl({ highlight: "ADS_PREMIUM" });
    case "PLAN":
      return buildPricingUrl({ highlight: productCode || "BOOST" });
    case "ADDON":
      return buildPricingUrl({
        highlight: productCode || "IA_MERCHANT",
        tab: "addons",
      });
    case "ANALYTICS":
      return buildPricingUrl({ section: "analytics", tab: "addons" });
    default:
      return "/forfaits";
  }
}

/**
 * Mapping triggerType (pricing nudge) → deep-link.
 */
export function ctaTargetForNudge(
  triggerType: string,
  suggestedPlan?: string,
  isBusiness?: boolean,
): string {
  if (suggestedPlan) {
    return buildPricingUrl({ highlight: suggestedPlan });
  }
  switch (triggerType) {
    case "HIGH_MESSAGING":
      return buildPricingUrl({ highlight: "IA_MERCHANT", tab: "addons" });
    case "NEEDS_ANALYTICS":
      return buildPricingUrl({ section: "analytics", tab: "addons" });
    default:
      return buildPricingUrl({
        highlight: isBusiness ? "BUSINESS" : "BOOST",
      });
  }
}

/* ═══════════════════════════════════════════ URL PARSER ═══════ */

export interface ParsedPricingParams {
  tab?: PricingTab;
  highlight?: string;
  section?: string;
  coupon?: string;
  plan?: string;
}

/**
 * Parse les query params de l'URL courante (ou d'un search string).
 */
export function parsePricingParams(
  search: string = window.location.search,
): ParsedPricingParams {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const highlight = params.get("highlight");
  const section = params.get("section");
  const coupon = params.get("coupon");
  const plan = params.get("plan");

  return {
    tab: tab === "users" || tab === "business" || tab === "addons" ? tab : undefined,
    highlight: highlight?.toUpperCase() || undefined,
    section: section || undefined,
    coupon: coupon?.trim() || undefined,
    plan: plan?.toUpperCase().trim() || undefined,
  };
}

/**
 * Nettoie les params de deep-link de l'URL (sans recharger la page).
 * Préserve les params de paiement PayPal (orderId, paid, cancelled).
 */
export function cleanPricingParams() {
  const params = new URLSearchParams(window.location.search);
  params.delete("tab");
  params.delete("highlight");
  params.delete("section");
  params.delete("coupon");
  params.delete("plan");
  const remaining = params.toString();
  const cleanUrl = remaining
    ? `${window.location.pathname}?${remaining}`
    : window.location.pathname;
  window.history.replaceState({}, "", cleanUrl);
}

/**
 * Ajoute une classe glow temporaire sur un élément, puis scroll vers lui.
 */
export function highlightElement(elementId: string, durationMs = 3000) {
  // Petit délai pour laisser le DOM se mettre à jour après changement de tab
  requestAnimationFrame(() => {
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("pricing-highlight-glow");
      setTimeout(() => el.classList.remove("pricing-highlight-glow"), durationMs);
    }, 150);
  });
}
