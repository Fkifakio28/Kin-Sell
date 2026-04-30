/**
 * Préférence son pour les vidéos So-Kin (feed + viewer).
 * Persistée dans localStorage + broadcast à tous les composants montés
 * via un CustomEvent window pour un toggle global instantané.
 */

const STORAGE_KEY = "ks-sokin-sound-enabled";
const EVENT = "ks:sokin-sound-changed";

/** Par défaut : son activé (l'utilisateur veut entendre les vidéos). */
export function getSokinSoundPref(): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true; // défaut : ON
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

export function setSokinSoundPref(enabled: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0"); } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { enabled } }));
  } catch { /* ignore */ }
}

/** Hook React qui retourne [enabled, toggle]. */
import { useCallback, useEffect, useState } from "react";

export function useSokinSound(): [boolean, () => void, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => getSokinSoundPref());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { enabled?: boolean } | undefined;
      if (typeof detail?.enabled === "boolean") setEnabled(detail.enabled);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const toggle = useCallback(() => {
    const next = !getSokinSoundPref();
    setSokinSoundPref(next);
  }, []);

  const set = useCallback((v: boolean) => setSokinSoundPref(v), []);

  return [enabled, toggle, set];
}
