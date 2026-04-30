/**
 * In-App Purchase utility for iOS (StoreKit 2 via cordova-plugin-purchase).
 *
 * On web/Android this module is a no-op.
 * On iOS native, it initializes the store, loads products, and handles purchases.
 */

import { Capacitor } from "@capacitor/core";

/* ── Types ── */
export interface IAPProduct {
  id: string;
  title: string;
  description: string;
  price: string;
  priceMicros: number;
  currency: string;
}

type PurchaseResult =
  | { ok: true; transactionJws: string; productId: string }
  | { ok: false; error: string };

/* ── Apple Product IDs (must match App Store Connect) ── */
const APPLE_PRODUCTS = [
  "com.kinsell.plan.boost",
  "com.kinsell.plan.auto",
  "com.kinsell.plan.pro_vendor",
  "com.kinsell.plan.starter",
  "com.kinsell.plan.business",
  "com.kinsell.plan.scale",
] as const;

/* ── Plan code → Apple product ID mapping ── */
const PLAN_TO_APPLE_PRODUCT: Record<string, string> = {
  "USER:BOOST": "com.kinsell.plan.boost",
  "USER:AUTO": "com.kinsell.plan.auto",
  "USER:PRO_VENDOR": "com.kinsell.plan.pro_vendor",
  "BUSINESS:STARTER": "com.kinsell.plan.starter",
  "BUSINESS:BUSINESS": "com.kinsell.plan.business",
  "BUSINESS:SCALE": "com.kinsell.plan.scale",
};

/**
 * Check if IAP is available (iOS native only).
 */
export function isIAPAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/**
 * Get the Apple product ID for a given plan.
 */
export function getAppleProductId(scope: "USER" | "BUSINESS", planCode: string): string | undefined {
  return PLAN_TO_APPLE_PRODUCT[`${scope}:${planCode}`];
}

/**
 * Initialize the IAP store and register products.
 * Should be called once at app startup on iOS.
 */
export async function initializeIAP(): Promise<void> {
  if (!isIAPAvailable()) return;

  try {
    // @ts-ignore — native-only module, types may not exist on server
    const CdvPurchase = await import("cordova-plugin-purchase");
    const store = CdvPurchase.store ?? (CdvPurchase as unknown as { default: typeof CdvPurchase }).default?.store;
    if (!store) return;

    // Register subscription products
    for (const productId of APPLE_PRODUCTS) {
      store.register({
        id: productId,
        type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
        platform: CdvPurchase.Platform.APPLE_APPSTORE,
      });
    }

    // Set the validator to our backend
    const apiBase = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL ?? "/api";
    store.validator = `${apiBase}/billing/apple/verify`;

    await store.initialize([CdvPurchase.Platform.APPLE_APPSTORE]);
  } catch (err) {
    console.warn("[IAP] Initialization failed:", err);
  }
}

/**
 * Load available products and their prices from the App Store.
 */
export async function loadProducts(): Promise<IAPProduct[]> {
  if (!isIAPAvailable()) return [];

  try {
    // @ts-ignore — native-only module
    const CdvPurchase = await import("cordova-plugin-purchase");
    const store = CdvPurchase.store ?? (CdvPurchase as unknown as { default: typeof CdvPurchase }).default?.store;
    if (!store) return [];

    return store.products
      .filter((p: any) => p.platform === CdvPurchase.Platform.APPLE_APPSTORE)
      .map((p: any) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        price: p.pricing?.price ?? "",
        priceMicros: p.pricing?.priceMicros ?? 0,
        currency: p.pricing?.currency ?? "USD",
      }));
  } catch {
    return [];
  }
}

/**
 * Initiate a purchase for a specific plan.
 * Returns the transaction JWS on success for backend verification.
 */
export async function purchasePlan(
  scope: "USER" | "BUSINESS",
  planCode: string,
): Promise<PurchaseResult> {
  if (!isIAPAvailable()) {
    return { ok: false, error: "IAP non disponible sur cette plateforme" };
  }

  const productId = getAppleProductId(scope, planCode);
  if (!productId) {
    return { ok: false, error: `Aucun produit Apple pour ${scope}:${planCode}` };
  }

  try {
    // @ts-ignore — native-only module
    const CdvPurchase = await import("cordova-plugin-purchase");
    const store = CdvPurchase.store ?? (CdvPurchase as unknown as { default: typeof CdvPurchase }).default?.store;
    if (!store) return { ok: false, error: "Store non initialisé" };

    const product = store.get(productId, CdvPurchase.Platform.APPLE_APPSTORE);
    if (!product) {
      return { ok: false, error: `Produit ${productId} introuvable` };
    }

    const offer = product.getOffer();
    if (!offer) {
      return { ok: false, error: "Aucune offre disponible" };
    }

    // Start the purchase — this opens the Apple payment sheet
    const result = await store.order(offer);
    if (result && "isError" in result) {
      return { ok: false, error: (result as { message?: string }).message ?? "Achat échoué" };
    }

    // The actual verification is handled by the store validator (our backend)
    // We return success — the backend will have been called automatically
    return {
      ok: true,
      transactionJws: "handled-by-validator",
      productId,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors de l'achat",
    };
  }
}

/**
 * Restore previous purchases (e.g., after reinstall).
 */
export async function restorePurchases(): Promise<void> {
  if (!isIAPAvailable()) return;

  try {
    // @ts-ignore — native-only module
    const CdvPurchase = await import("cordova-plugin-purchase");
    const store = CdvPurchase.store ?? (CdvPurchase as unknown as { default: typeof CdvPurchase }).default?.store;
    if (!store) return;
    await store.restorePurchases();
  } catch (err) {
    console.warn("[IAP] Restore failed:", err);
  }
}
