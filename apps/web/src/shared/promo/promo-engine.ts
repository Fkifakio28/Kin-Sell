/**
 * promo-engine.ts — Frontend mirror of the backend promo logic
 * Source unique de vérité côté client pour les prix, savings, timers, labels.
 */

// ── Types ──

export type PromoStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "EXPIRED" | "CANCELLED";
export type PromoType = "ITEM" | "BUNDLE";

export interface ItemPromoInfo {
  promoActive?: boolean;
  promoPriceUsdCents?: number | null;
  promoExpiresAt?: string | null;
  priceUsdCents: number;
}

export interface PromotionRecord {
  id: string;
  promoType: PromoType;
  status: PromoStatus;
  startsAt: string;
  expiresAt: string | null;
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

export function resolvePromoStatus(stored: PromoStatus, startsAt: string, expiresAt: string | null, now = new Date()): PromoStatus {
  if (stored === "CANCELLED" || stored === "PAUSED" || stored === "DRAFT") return stored;
  const start = new Date(startsAt);
  const end = expiresAt ? new Date(expiresAt) : null;
  if (end && now >= end) return "EXPIRED";
  if (now < start) return "SCHEDULED";
  return "ACTIVE";
}

export function isPromoActive(stored: PromoStatus, startsAt: string, expiresAt: string | null, now = new Date()): boolean {
  return resolvePromoStatus(stored, startsAt, expiresAt, now) === "ACTIVE";
}

export function getPromoStatus(promo: PromotionRecord, now = new Date()): PromoStatus {
  return resolvePromoStatus(promo.status, promo.startsAt, promo.expiresAt, now);
}

// ── Item Price Helpers ──

export function getEffectiveItemPrice(item: ItemPromoInfo, now = new Date()): number {
  if (item.promoActive && item.promoPriceUsdCents != null) {
    if (item.promoExpiresAt) {
      const expiresAt = new Date(item.promoExpiresAt);
      if (now >= expiresAt) return item.priceUsdCents;
    }
    return item.promoPriceUsdCents;
  }
  return item.priceUsdCents;
}

export function getOriginalItemPrice(item: { priceUsdCents: number }): number {
  return item.priceUsdCents;
}

// ── Bundle Price Helpers ──

export function getEffectiveBundlePrice(promo: PromotionRecord, now = new Date()): number {
  const status = getPromoStatus(promo, now);
  if (status === "ACTIVE" && promo.bundlePriceUsdCents != null) {
    return promo.bundlePriceUsdCents;
  }
  return getOriginalBundlePrice(promo);
}

export function getOriginalBundlePrice(promo: PromotionRecord): number {
  if (promo.bundleOriginalUsdCents != null) return promo.bundleOriginalUsdCents;
  return promo.items.reduce((sum, item) => sum + item.originalPriceUsdCents * item.quantity, 0);
}

// ── Savings Helpers ──

export function getSavingsAmount(originalCents: number, effectiveCents: number): number {
  return Math.max(0, originalCents - effectiveCents);
}

export function getSavingsPercent(originalCents: number, effectiveCents: number): number {
  if (originalCents <= 0) return 0;
  return Math.round(((originalCents - effectiveCents) / originalCents) * 100);
}

export function getItemSavings(item: ItemPromoInfo, now = new Date()): { amount: number; percent: number } {
  const effective = getEffectiveItemPrice(item, now);
  const original = getOriginalItemPrice(item);
  return { amount: getSavingsAmount(original, effective), percent: getSavingsPercent(original, effective) };
}

export function getBundleSavings(promo: PromotionRecord, now = new Date()): { amount: number; percent: number } {
  const effective = getEffectiveBundlePrice(promo, now);
  const original = getOriginalBundlePrice(promo);
  return { amount: getSavingsAmount(original, effective), percent: getSavingsPercent(original, effective) };
}

// ── Timer / Urgency Helpers ──

export function getTimeRemaining(expiresAt: string | null, now = new Date()): number | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt);
  const remaining = end.getTime() - now.getTime();
  return remaining > 0 ? remaining : 0;
}

export function getUrgencyLabel(expiresAt: string | null, now = new Date()): string | null {
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

export function getScheduleLabel(startsAt: string, now = new Date()): string | null {
  const start = new Date(startsAt);
  if (now >= start) return null;
  const hours = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hours < 24) return "Commence aujourd'hui";
  if (hours < 48) return "Commence demain";
  const dateStr = start.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `Disponible le ${dateStr}`;
}

// ── Marketing Labels ──

export function getBundleLabel(promo: PromotionRecord): string {
  if (promo.promoLabel) return promo.promoLabel;
  if (promo.title) return promo.title;
  const itemCount = promo.items.length;
  if (itemCount === 2) return "Offre Duo";
  if (itemCount === 3) return "Pack Trio";
  return "Pack Promo";
}

export function getBundleSlogan(promo: PromotionRecord): string {
  const savings = getBundleSavings(promo);
  if (savings.percent >= 30) return "Économie exceptionnelle !";
  if (savings.percent >= 15) return "Achetez ensemble, payez moins";
  return "Offre groupée avantageuse";
}
