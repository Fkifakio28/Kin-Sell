/**
 * promo-engine.ts — Source unique de vérité pour toute la logique promotions Kin-Sell
 *
 * Règles de priorité:
 * - Prix effectif article = promo individuelle active > prix de base
 * - Prix effectif lot = promo bundle active > somme prix individuels
 * - Jamais appliquer le prix promo du lot à chaque article
 * - Jamais recalculer le lot à partir des promos individuelles
 */

// ── Types ──

export type PromoStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "EXPIRED" | "CANCELLED";
export type PromoType = "ITEM" | "BUNDLE";

export interface PromoTimeBounds {
  startsAt: Date | string;
  expiresAt: Date | string | null;
}

export interface ItemPromoInfo {
  promoActive: boolean;
  promoPriceUsdCents: number | null;
  promoExpiresAt: Date | string | null;
  priceUsdCents: number;
}

export interface PromotionRecord {
  id: string;
  promoType: PromoType;
  status: PromoStatus;
  startsAt: Date | string;
  expiresAt: Date | string | null;
  bundlePriceUsdCents: number | null;
  bundleOriginalUsdCents: number | null;
  title: string | null;
  promoLabel: string | null;
  items: PromotionItemRecord[];
}

export interface PromotionItemRecord {
  listingId: string;
  originalPriceUsdCents: number;
  promoPriceUsdCents: number | null;
  quantity: number;
}

// ── Status Resolution ──

/**
 * Resolve the real-time status of a promotion based on its stored status and time bounds.
 * SCHEDULED → ACTIVE when startsAt is reached
 * ACTIVE → EXPIRED when expiresAt is passed
 */
export function resolvePromoStatus(stored: PromoStatus, bounds: PromoTimeBounds, now = new Date()): PromoStatus {
  if (stored === "CANCELLED" || stored === "PAUSED" || stored === "DRAFT") return stored;

  const startsAt = new Date(bounds.startsAt);
  const expiresAt = bounds.expiresAt ? new Date(bounds.expiresAt) : null;

  if (expiresAt && now >= expiresAt) return "EXPIRED";
  if (now < startsAt) return "SCHEDULED";
  return "ACTIVE";
}

/** Is the promotion currently active right now? */
export function isPromoActive(stored: PromoStatus, bounds: PromoTimeBounds, now = new Date()): boolean {
  return resolvePromoStatus(stored, bounds, now) === "ACTIVE";
}

/** Get the resolved status for a Promotion record */
export function getPromoStatus(promo: PromotionRecord, now = new Date()): PromoStatus {
  return resolvePromoStatus(promo.status, { startsAt: promo.startsAt, expiresAt: promo.expiresAt }, now);
}

// ── Item Price Helpers ──

/**
 * Get the effective price of an individual item.
 * Priority: active individual promo > base price
 */
export function getEffectiveItemPrice(item: ItemPromoInfo, now = new Date()): number {
  if (item.promoActive && item.promoPriceUsdCents != null) {
    // Check expiry if available
    if (item.promoExpiresAt) {
      const expiresAt = new Date(item.promoExpiresAt);
      if (now >= expiresAt) return item.priceUsdCents; // expired
    }
    return item.promoPriceUsdCents;
  }
  return item.priceUsdCents;
}

/** Get the original (base) price of an item, ignoring any promo */
export function getOriginalItemPrice(item: { priceUsdCents: number }): number {
  return item.priceUsdCents;
}

// ── Bundle Price Helpers ──

/**
 * Get the effective price of a bundle.
 * Priority: active bundle promo price > sum of individual base prices
 */
export function getEffectiveBundlePrice(promo: PromotionRecord, now = new Date()): number {
  const status = getPromoStatus(promo, now);
  if (status === "ACTIVE" && promo.bundlePriceUsdCents != null) {
    return promo.bundlePriceUsdCents;
  }
  return getOriginalBundlePrice(promo);
}

/**
 * Get the original (non-promo) price of a bundle = sum of individual item base prices × quantities
 */
export function getOriginalBundlePrice(promo: PromotionRecord): number {
  if (promo.bundleOriginalUsdCents != null) return promo.bundleOriginalUsdCents;
  return promo.items.reduce((sum, item) => sum + item.originalPriceUsdCents * item.quantity, 0);
}

// ── Savings Helpers ──

/** Absolute savings amount in USD cents */
export function getSavingsAmount(originalCents: number, effectiveCents: number): number {
  return Math.max(0, originalCents - effectiveCents);
}

/** Savings as a percentage (0-100) */
export function getSavingsPercent(originalCents: number, effectiveCents: number): number {
  if (originalCents <= 0) return 0;
  return Math.round(((originalCents - effectiveCents) / originalCents) * 100);
}

/** Get savings for an individual item promo */
export function getItemSavings(item: ItemPromoInfo, now = new Date()): { amount: number; percent: number } {
  const effective = getEffectiveItemPrice(item, now);
  const original = getOriginalItemPrice(item);
  return {
    amount: getSavingsAmount(original, effective),
    percent: getSavingsPercent(original, effective),
  };
}

/** Get savings for a bundle promo */
export function getBundleSavings(promo: PromotionRecord, now = new Date()): { amount: number; percent: number } {
  const effective = getEffectiveBundlePrice(promo, now);
  const original = getOriginalBundlePrice(promo);
  return {
    amount: getSavingsAmount(original, effective),
    percent: getSavingsPercent(original, effective),
  };
}

// ── Timer / Urgency Helpers ──

/** Time remaining in milliseconds (null if no expiry) */
export function getTimeRemaining(expiresAt: Date | string | null, now = new Date()): number | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt);
  const remaining = end.getTime() - now.getTime();
  return remaining > 0 ? remaining : 0;
}

/** Human-readable urgency label */
export function getUrgencyLabel(expiresAt: Date | string | null, now = new Date()): string | null {
  const remaining = getTimeRemaining(expiresAt, now);
  if (remaining == null || remaining <= 0) return null;
  const hours = remaining / (1000 * 60 * 60);
  if (hours < 1) return `Plus que ${Math.ceil(remaining / (1000 * 60))} min`;
  if (hours < 6) return `Plus que ${Math.ceil(hours)}h`;
  if (hours < 24) return "Se termine aujourd'hui";
  if (hours < 48) return "Se termine demain";
  const days = Math.ceil(hours / 24);
  if (days <= 7) return `Plus que ${days} jours`;
  return null;
}

/** When does a scheduled promo start? */
export function getScheduleLabel(startsAt: Date | string, now = new Date()): string | null {
  const start = new Date(startsAt);
  if (now >= start) return null;
  const hours = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hours < 24) return "Commence aujourd'hui";
  if (hours < 48) return "Commence demain";
  const dateStr = start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `Disponible le ${dateStr}`;
}

// ── Cart / Checkout Helpers ──

/**
 * Resolve the price to use when adding an item to the cart.
 * Uses the effective individual price (promo or base).
 * If the item belongs to a bundle being purchased, use the bundle price logic instead.
 */
export function getCartItemPrice(item: ItemPromoInfo, now = new Date()): number {
  return getEffectiveItemPrice(item, now);
}

/**
 * Compute effective prices for all items in a bundle, for display purposes.
 * Returns each item's current individual effective price (including their own individual promos).
 * The bundle price is separate and does NOT affect individual item prices.
 */
export function getBundleItemsEffectivePrices(
  items: Array<{ listing: ItemPromoInfo; quantity: number }>,
  now = new Date()
): Array<{ effectivePrice: number; originalPrice: number; quantity: number; hasIndividualPromo: boolean }> {
  return items.map((item) => ({
    effectivePrice: getEffectiveItemPrice(item.listing, now),
    originalPrice: getOriginalItemPrice(item.listing),
    quantity: item.quantity,
    hasIndividualPromo: item.listing.promoActive && item.listing.promoPriceUsdCents != null,
  }));
}

// ── Marketing Labels ──

const BUNDLE_LABELS = [
  "Offre Duo",
  "Pack Promo",
  "Bundle Deal",
  "Prix spécial lot",
  "Pack Avantage",
];

const BUNDLE_SLOGANS = [
  "Achetez ensemble, payez moins",
  "Pack avantage",
  "Économisez sur l'ensemble",
  "Offre groupée exclusive",
];

/** Get a label for a bundle promo (uses custom label or generates one) */
export function getBundleLabel(promo: PromotionRecord): string {
  if (promo.promoLabel) return promo.promoLabel;
  if (promo.title) return promo.title;
  const itemCount = promo.items.length;
  if (itemCount === 2) return "Offre Duo";
  if (itemCount === 3) return "Pack Trio";
  return "Pack Promo";
}

/** Get a marketing slogan for a bundle */
export function getBundleSlogan(promo: PromotionRecord): string {
  const savings = getBundleSavings(promo);
  if (savings.percent >= 30) return "Économie exceptionnelle !";
  if (savings.percent >= 15) return "Achetez ensemble, payez moins";
  return "Offre groupée avantageuse";
}
