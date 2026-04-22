import { useEffect } from "react";

/**
 * setInterval qui se met en pause quand `document.hidden` est vrai (onglet/app
 * en arrière-plan). Évite les réveils CPU/réseau inutiles et économise la
 * batterie sur mobile.
 *
 * - Lance immédiatement au mount si visible.
 * - Rappelle `fn` à chaque `delayMs` tant que la page est visible.
 * - Au retour en foreground, relance un cycle immédiatement.
 */
export function useVisibleInterval(fn: () => void, delayMs: number): void {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval != null) return;
      interval = setInterval(() => {
        try { fn(); } catch { /* ignore */ }
      }, delayMs);
    };

    const stop = () => {
      if (interval != null) {
        clearInterval(interval);
        interval = null;
      }
    };

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        stop();
      } else {
        // Au retour en foreground, rappeler une fois puis relancer
        try { fn(); } catch { /* ignore */ }
        start();
      }
    };

    // Initial : seulement si visible
    if (typeof document === "undefined" || !document.hidden) start();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
    // On relance l'effet quand delayMs change ; fn est stable via useCallback chez l'appelant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs]);
}
