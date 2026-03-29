/**
 * usePwaInstall — Système PWA premium Kin-Sell
 *
 * Logique :
 * 1. Détection de plateforme : ios | android | chromium-desktop | other
 * 2. Capture de beforeinstallprompt
 * 3. Engagement tracking : 5 min réels + 3 interactions minimum
 * 4. Cooldown intelligent : 3j (1er refus) → 7j → 30j
 * 5. Bannière affichée uniquement si engagement atteint + cooldown passé
 * 6. Analytics via événements custom (consommés par IA Analytique)
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export type Platform = "ios" | "android" | "chromium-desktop" | "other";
export type InstallState =
  | "unavailable"       // Navigateur ne supporte pas
  | "ios"               // Safari iOS — instructions manuelles nécessaires
  | "prompt"            // beforeinstallprompt disponible (Chrome/Edge/Android)
  | "installed"         // App déjà installée ou mode standalone
  | "dismissed";        // Utilisateur a refusé (en attente cooldown)

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const KEYS = {
  installed:      "ks-pwa-installed",
  dismissCount:   "ks-pwa-dismiss-count",
  cooldownUntil:  "ks-pwa-cooldown-until",
} as const;

/** 
 * Délai d'inactivité avant d'afficher la bannière.
 * On attend que l'utilisateur soit idle depuis 10 secondes.
 */
const IDLE_DELAY_MS = 10_000;

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function getStorage<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return JSON.parse(v) as T;
  } catch { return fallback; }
}

function setStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

function getCooldownMs(dismissCount: number): number {
  if (dismissCount <= 1) return 3 * 86_400_000;   // 3 jours
  if (dismissCount === 2) return 7 * 86_400_000;  // 7 jours
  return 30 * 86_400_000;                          // 30 jours
}

function detectPlatform(): { platform: Platform; isStandalone: boolean } {
  const ua = navigator.userAgent;
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);

  const isIOS = /iphone|ipad|ipod/i.test(ua) && !("MSStream" in window);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isChromium = /chrome|chromium/i.test(ua);

  if (isIOS && isSafari) return { platform: "ios", isStandalone };
  if (isAndroid && isChromium) return { platform: "android", isStandalone };
  if (!isAndroid && isChromium) return { platform: "chromium-desktop", isStandalone };
  return { platform: "other", isStandalone };
}

/** Émet un événement analytics custom — consommable par IA Analytique */
function emitAnalytics(name: string, detail?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent("ks-pwa-analytics", { detail: { event: name, ts: Date.now(), ...detail } }));
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export interface PwaInstallControls {
  /** État d'installation courant */
  installState: InstallState;
  /** Plateforme détectée */
  platform: Platform;
  /** true = engagement atteint + cooldown passé + app installable → afficher la bannière */
  canShow: boolean;
  /** Lancer la prompt d'installation native (Chrome/Edge/Android) */
  triggerInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  /** Rejeter la bannière (dismissed = refus réel, closed = fermeture neutre) */
  dismissBanner: (action?: "dismissed" | "closed") => void;
  /** Une mise à jour du service worker est disponible */
  updateAvailable: boolean;
  /** Appliquer la mise à jour SW + reload */
  applyUpdate: () => void;
}

export function usePwaInstall(): PwaInstallControls {
  const [installState, setInstallState] = useState<InstallState>("unavailable");
  const [platform, setPlatform] = useState<Platform>("other");
  const [canShow, setCanShow] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [engagementMet, setEngagementMet] = useState(false);

  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const lastInteractionTime = useRef(0);
  const engagementTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Détection plateforme + capture de l'event ──
  useEffect(() => {
    const { platform: plt, isStandalone } = detectPlatform();
    setPlatform(plt);

    // App déjà installée (mode standalone OU flag localStorage)
    if (isStandalone || getStorage<boolean>(KEYS.installed, false)) {
      setInstallState("installed");
      setCanShow(false);
      return;
    }

    if (plt === "ios") {
      setInstallState("ios");
      // Pas de cooldown check pour iOS — on vérifie dans canShow
      return;
    }

    // Cooldown actif ?
    const cooldownUntil = getStorage<number>(KEYS.cooldownUntil, 0);
    if (Date.now() < cooldownUntil) {
      setInstallState("dismissed");
      return;
    }

    // Écoute beforeinstallprompt (Chrome / Edge / Android)
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setInstallState("prompt");
      emitAnalytics("pwa_prompt_captured", { platform: plt });
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Appinstalled → nettoyer
    const installedHandler = () => {
      setInstallState("installed");
      setCanShow(false);
      setStorage(KEYS.installed, true);
      emitAnalytics("pwa_install_completed");
    };
    window.addEventListener("appinstalled", installedHandler);

    // SW update detection
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        });
      }).catch(() => { /* noop */ });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  // ── Détection d'inactivité (idle 10 secondes) ──
  useEffect(() => {
    // Inutile si app déjà installée ou cooldown actif
    if (getStorage<boolean>(KEYS.installed, false)) return;
    const cooldownUntil = getStorage<number>(KEYS.cooldownUntil, 0);
    if (Date.now() < cooldownUntil) return;

    // Lance / relance le timer d'inactivité à chaque interaction
    const resetIdleTimer = () => {
      if (engagementTimer.current) clearTimeout(engagementTimer.current);
      lastInteractionTime.current = Date.now();
      engagementTimer.current = setTimeout(() => {
        setEngagementMet(true);
      }, IDLE_DELAY_MS);
    };

    // Démarre le timer dès le montage (la page vient de s'ouvrir)
    resetIdleTimer();

    // Les événements qui témoignent d'une activité → reset le timer
    const events: (keyof WindowEventMap)[] = [
      "mousemove", "mousedown", "click",
      "touchstart", "touchmove",
      "keydown", "scroll", "wheel",
    ];
    events.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));

    return () => {
      if (engagementTimer.current) clearTimeout(engagementTimer.current);
      events.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── canShow : idle atteint + installState valide + cooldown OK ──
  useEffect(() => {
    if (!engagementMet) return;
    if (installState !== "prompt" && installState !== "ios") return;

    // Double-vérification cooldown pour iOS
    const cooldownUntil = getStorage<number>(KEYS.cooldownUntil, 0);
    if (Date.now() < cooldownUntil) return;

    setCanShow(true);
    emitAnalytics("pwa_banner_shown", { platform, installState });
  }, [engagementMet, installState, platform]);

  // ── Force-show via événement custom (ex: clic logo accueil) ──
  useEffect(() => {
    const handler = () => {
      if (installState === "prompt" || installState === "ios") {
        setCanShow(true);
        emitAnalytics("pwa_banner_force_shown", { platform, installState });
      }
    };
    window.addEventListener("ks-pwa-force-show", handler);
    return () => window.removeEventListener("ks-pwa-force-show", handler);
  }, [installState, platform]);

  // ── triggerInstall ──
  const triggerInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt.current) return "unavailable";
    emitAnalytics("pwa_install_clicked", { platform });
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    deferredPrompt.current = null;
    if (outcome === "accepted") {
      setInstallState("installed");
      setStorage(KEYS.installed, true);
      setCanShow(false);
      emitAnalytics("pwa_install_accepted");
    } else {
      emitAnalytics("pwa_install_dismissed_native");
    }
    return outcome;
  }, [platform]);

  // ── dismissBanner ──
  const dismissBanner = useCallback((action: "dismissed" | "closed" = "dismissed") => {
    const count = getStorage<number>(KEYS.dismissCount, 0) + 1;
    setStorage(KEYS.dismissCount, count);
    // Fermeture neutre = cooldown plus court (1/3)
    const cooldownMs = action === "dismissed" ? getCooldownMs(count) : Math.floor(getCooldownMs(count) / 3);
    setStorage(KEYS.cooldownUntil, Date.now() + cooldownMs);
    setCanShow(false);
    setEngagementMet(false);
    emitAnalytics("pwa_banner_dismissed", { action, dismissCount: count });
  }, []);

  // ── applyUpdate ──
  const applyUpdate = useCallback(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
        window.location.reload();
      }).catch(() => { /* noop */ });
    }
  }, []);

  return { installState, platform, canShow, triggerInstall, dismissBanner, updateAvailable, applyUpdate };
}
