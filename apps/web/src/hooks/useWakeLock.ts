import { useEffect, useRef } from "react";

/**
 * Maintient l'écran allumé tant que `active` est true.
 * Utile pour les appels, live streams, etc.
 * Relâche automatiquement au démontage ou quand active passe à false.
 */
export function useWakeLock(active: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      return;
    }

    let cancelled = false;

    const requestLock = async () => {
      if (!("wakeLock" in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener("release", () => {
          if (wakeLockRef.current === lock) wakeLockRef.current = null;
        });
      } catch {
        // Wake Lock denied (e.g. low battery)
      }
    };

    void requestLock();

    // Re-acquire on visibility change (browsers release wake lock when tab is hidden)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current && !cancelled) {
        void requestLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [active]);
}
