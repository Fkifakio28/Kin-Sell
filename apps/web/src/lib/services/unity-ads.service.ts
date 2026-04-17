/**
 * Unity Ads — Service Capacitor bridge (Android / iOS futur)
 *
 * Sur web (navigateur), toutes les méthodes sont des no-op silencieux.
 * Sur mobile natif, elles appellent le plugin UnityAdsPlugin.java.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

// ── Types plugin natif ──────────────────────────────────────

interface UnityAdsNativePlugin {
  initialize(opts?: { testMode?: boolean }): Promise<{ status: string }>;
  loadInterstitial(): Promise<{ status: string }>;
  loadRewarded(): Promise<{ status: string }>;
  showInterstitial(): Promise<UnityAdShowResult>;
  showRewarded(): Promise<UnityAdShowResult>;
  isReady(opts?: { placementId?: string }): Promise<{
    ready: boolean;
    initialized: boolean;
    placementId: string;
  }>;
}

export interface UnityAdShowResult {
  placementId: string;
  state: string;
  completed: boolean;
  skipped: boolean;
}

// ── Plugin registration ─────────────────────────────────────

const isNative = Capacitor.isNativePlatform();

const UnityAds = isNative
  ? registerPlugin<UnityAdsNativePlugin>("UnityAdsPlugin")
  : null;

// ── Public API ──────────────────────────────────────────────

/**
 * Initialise Unity Ads. No-op sur web.
 * Appeler une seule fois au démarrage de l'app (ex: App.tsx).
 */
export async function initUnityAds(testMode = false): Promise<boolean> {
  if (!UnityAds) return false;
  try {
    await UnityAds.initialize({ testMode });
    return true;
  } catch (e) {
    console.warn("[UnityAds] Init failed:", e);
    return false;
  }
}

/**
 * Affiche un interstitiel plein écran.
 * Retourne le résultat (completed/skipped) ou null si pas dispo.
 */
export async function showInterstitial(): Promise<UnityAdShowResult | null> {
  if (!UnityAds) return null;
  try {
    return await UnityAds.showInterstitial();
  } catch (e) {
    console.warn("[UnityAds] showInterstitial failed:", e);
    return null;
  }
}

/**
 * Affiche une pub rewarded (l'utilisateur choisit de la regarder).
 * Retourne le résultat (completed = récompense gagnée) ou null.
 */
export async function showRewarded(): Promise<UnityAdShowResult | null> {
  if (!UnityAds) return null;
  try {
    return await UnityAds.showRewarded();
  } catch (e) {
    console.warn("[UnityAds] showRewarded failed:", e);
    return null;
  }
}

/**
 * Vérifie si une pub est prête à être affichée.
 */
export async function isAdReady(
  placement: "interstitial" | "rewarded" = "interstitial"
): Promise<boolean> {
  if (!UnityAds) return false;
  try {
    const placementId =
      placement === "rewarded" ? "Rewarded_Android" : "Interstitial_Android";
    const res = await UnityAds.isReady({ placementId });
    return res.ready;
  } catch {
    return false;
  }
}

/** Recharge manuellement un interstitiel. */
export async function loadInterstitial(): Promise<void> {
  if (!UnityAds) return;
  try { await UnityAds.loadInterstitial(); } catch { /* silent */ }
}

/** Recharge manuellement une rewarded. */
export async function loadRewarded(): Promise<void> {
  if (!UnityAds) return;
  try { await UnityAds.loadRewarded(); } catch { /* silent */ }
}

/** Indique si on est sur plateforme native (Unity Ads disponible). */
export const isUnityAdsAvailable = isNative;
