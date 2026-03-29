import { useEffect, useState } from "react";

// L'événement "beforeinstallprompt" est disponible sur Chrome/Edge/Android.
// Safari iOS ne le supporte pas — on affiche un message d'instruction à la place.

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

type InstallState =
  | "unavailable"    // Navigateur ne supporte pas (Firefox, etc.)
  | "ios"            // Safari iOS — instructions manuelles
  | "prompt"         // L'invite d'installation est disponible (Chrome/Edge)
  | "installed"      // L'app est déjà installée (standalone / display-mode)
  | "dismissed";     // L'utilisateur a refusé

export function usePWA() {
  const [installState, setInstallState] = useState<InstallState>("unavailable");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // ── Déjà installée ? ──
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);

    if (isStandalone) {
      setInstallState("installed");
      return;
    }

    // ── iOS Safari ──
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !("MSStream" in window);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    if (isIOS && isSafari) {
      setInstallState("ios");
      return;
    }

    // ── Chrome / Edge / Android ──
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setInstallState("prompt");
    };
    window.addEventListener("beforeinstallprompt", handler);

    // ── SW update disponible ──
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        });
      });
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstallState(outcome === "accepted" ? "installed" : "dismissed");
    return outcome;
  };

  const applyUpdate = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.waiting?.postMessage({ type: "SKIP_WAITING" });
        window.location.reload();
      });
    }
  };

  return { installState, triggerInstall, updateAvailable, applyUpdate };
}
