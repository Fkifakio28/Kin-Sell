/**
 * useUnityAds — Hook React pour Unity Ads
 *
 * Initialise Unity Ads automatiquement sur mobile natif.
 * Expose showInterstitial() et showRewarded() avec état de disponibilité.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  initUnityAds,
  showInterstitial as svcShowInterstitial,
  showRewarded as svcShowRewarded,
  isAdReady,
  isUnityAdsAvailable,
  type UnityAdShowResult,
} from "../lib/services/unity-ads.service";

interface UseUnityAdsReturn {
  /** true si Unity Ads est supporté (plateforme native) */
  available: boolean;
  /** true si le SDK est initialisé */
  initialized: boolean;
  /** true si un interstitiel est prêt */
  interstitialReady: boolean;
  /** true si une rewarded est prête */
  rewardedReady: boolean;
  /** Affiche un interstitiel. Retourne le résultat ou null. */
  showInterstitial: () => Promise<UnityAdShowResult | null>;
  /** Affiche une rewarded. Retourne le résultat ou null. */
  showRewarded: () => Promise<UnityAdShowResult | null>;
  /** Rafraîchir l'état de disponibilité des pubs */
  refreshReady: () => Promise<void>;
}

/**
 * @param testMode — Activer le mode test Unity (pas de vraies pubs)
 */
export function useUnityAds(testMode = false): UseUnityAdsReturn {
  const [initialized, setInitialized] = useState(false);
  const [interstitialReady, setInterstitialReady] = useState(false);
  const [rewardedReady, setRewardedReady] = useState(false);
  const initCalled = useRef(false);

  // Init une seule fois
  useEffect(() => {
    if (!isUnityAdsAvailable || initCalled.current) return;
    initCalled.current = true;

    initUnityAds(testMode).then((ok) => {
      setInitialized(ok);
      if (ok) {
        // Attendre un peu que les pubs se chargent après init
        setTimeout(() => {
          isAdReady("interstitial").then(setInterstitialReady);
          isAdReady("rewarded").then(setRewardedReady);
        }, 3000);
      }
    });
  }, [testMode]);

  const refreshReady = useCallback(async () => {
    if (!initialized) return;
    const [i, r] = await Promise.all([
      isAdReady("interstitial"),
      isAdReady("rewarded"),
    ]);
    setInterstitialReady(i);
    setRewardedReady(r);
  }, [initialized]);

  const showInterstitial = useCallback(async () => {
    const result = await svcShowInterstitial();
    // Après affichage, rafraîchir l'état (auto-reload côté natif)
    setTimeout(() => refreshReady(), 2000);
    return result;
  }, [refreshReady]);

  const showRewarded = useCallback(async () => {
    const result = await svcShowRewarded();
    setTimeout(() => refreshReady(), 2000);
    return result;
  }, [refreshReady]);

  return {
    available: isUnityAdsAvailable,
    initialized,
    interstitialReady,
    rewardedReady,
    showInterstitial,
    showRewarded,
    refreshReady,
  };
}
