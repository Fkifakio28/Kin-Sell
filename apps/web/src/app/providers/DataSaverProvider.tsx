import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * DataSaverProvider
 * ─────────────────
 * Expose un état global "mode économie de données" qui combine :
 *   1. le choix manuel de l'utilisateur (persistant en localStorage)
 *   2. la détection automatique via `navigator.connection` :
 *      - `saveData === true`          → utilisateur a activé l'option OS
 *      - `effectiveType` ∈ {2g,slow-2g} → connexion reconnue comme lente
 *
 * L'état exposé `lowBandwidth` est la disjonction logique des deux.
 * Les composants consomment simplement :
 *     const { lowBandwidth, userPreference, setUserPreference } = useDataSaver();
 *
 * Les helpers `dsLimit()` et `dsInterval()` permettent de calculer directement
 * des valeurs adaptées sans logique à recopier dans chaque composant.
 */

const STORAGE_KEY = "ks-data-saver";

export type DataSaverPreference = "auto" | "on" | "off";

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g" | string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

function getConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (navigator as any).connection as NetworkInformationLike | undefined;
}

function detectAutoLowBandwidth(): boolean {
  const conn = getConnection();
  if (!conn) return false;
  if (conn.saveData === true) return true;
  if (conn.effectiveType === "2g" || conn.effectiveType === "slow-2g") return true;
  return false;
}

function readPreference(): DataSaverPreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "on" || v === "off" || v === "auto") return v;
  } catch {
    /* SSR ou localStorage bloqué */
  }
  return "auto";
}

interface DataSaverContextValue {
  /** Décision finale (manuel OU auto) → utilisée par les composants. */
  lowBandwidth: boolean;
  /** Détection auto seule (info). */
  autoDetected: boolean;
  /** Préférence utilisateur persistée. */
  userPreference: DataSaverPreference;
  setUserPreference: (pref: DataSaverPreference) => void;
}

const DataSaverContext = createContext<DataSaverContextValue | null>(null);

export function DataSaverProvider({ children }: { children: ReactNode }) {
  const [userPreference, setUserPreferenceState] = useState<DataSaverPreference>(() => readPreference());
  const [autoDetected, setAutoDetected] = useState<boolean>(() => detectAutoLowBandwidth());

  // Surveille les changements de réseau (changement de cellule, activation saveData…)
  useEffect(() => {
    const conn = getConnection();
    if (!conn?.addEventListener) return;
    const handler = () => setAutoDetected(detectAutoLowBandwidth());
    conn.addEventListener("change", handler);
    return () => conn.removeEventListener?.("change", handler);
  }, []);

  const setUserPreference = (pref: DataSaverPreference) => {
    setUserPreferenceState(pref);
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* ignore */
    }
  };

  const lowBandwidth = userPreference === "on"
    ? true
    : userPreference === "off"
      ? false
      : autoDetected;

  const value = useMemo<DataSaverContextValue>(
    () => ({ lowBandwidth, autoDetected, userPreference, setUserPreference }),
    [lowBandwidth, autoDetected, userPreference],
  );

  return (
    <DataSaverContext.Provider value={value}>{children}</DataSaverContext.Provider>
  );
}

export function useDataSaver(): DataSaverContextValue {
  const ctx = useContext(DataSaverContext);
  if (!ctx) {
    // Fallback hors provider : mode normal (évite crash si non monté).
    return {
      lowBandwidth: false,
      autoDetected: false,
      userPreference: "auto",
      setUserPreference: () => {
        /* no-op */
      },
    };
  }
  return ctx;
}

/**
 * Helpers déterministes utilisés par les composants pour calibrer leurs
 * requêtes selon le mode. Gardez les valeurs ici pour centraliser la politique.
 */
export function dsLimit(normal: number, low: number, lowBandwidth: boolean): number {
  return lowBandwidth ? low : normal;
}

export function dsInterval(normalMs: number, lowMs: number, lowBandwidth: boolean): number {
  return lowBandwidth ? lowMs : normalMs;
}
