import React, { createContext, useContext, useMemo, useState } from "react";
import {
  getMarketCountry,
  MARKET_COUNTRIES,
  type MarketCountryCode,
  type MarketCountryConfig,
} from "../config/market";
import { invalidateCache } from "../../lib/api-client";

type MarketSelectionMode = "auto" | "manual";

type MarketPreferenceContextValue = {
  countries: MarketCountryConfig[];
  detectedCountry: MarketCountryCode;
  selectedCountry: MarketCountryCode;
  effectiveCountry: MarketCountryCode;
  selectionMode: MarketSelectionMode;
  setSelectedCountry: (country: MarketCountryCode) => void;
  setSelectionMode: (mode: MarketSelectionMode) => void;
  getCountryConfig: (country?: MarketCountryCode) => MarketCountryConfig;
};

const STORAGE_COUNTRY = "ks-market-country";
const STORAGE_SELECTION_MODE = "ks-market-selection-mode";

const MarketPreferenceContext = createContext<MarketPreferenceContextValue | null>(null);

function isMarketCountryCode(value: string): value is MarketCountryCode {
  return ["CD", "GA", "CG", "AO", "CI", "GN", "SN", "MA"].includes(value);
}

function detectCountryFromBrowser(): MarketCountryCode {
  const fromLang = [navigator.language, ...navigator.languages]
    .filter(Boolean)
    .map((lang) => lang.toUpperCase().split("-").slice(-1)[0])
    .find((code) => code && isMarketCountryCode(code));

  if (fromLang && isMarketCountryCode(fromLang)) {
    return fromLang;
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz.includes("Brazzaville")) return "CG";
  if (tz.includes("Libreville")) return "GA";
  if (tz.includes("Luanda")) return "AO";
  if (tz.includes("Abidjan")) return "CI";
  if (tz.includes("Conakry")) return "GN";
  if (tz.includes("Dakar")) return "SN";
  if (tz.includes("Casablanca")) return "MA";

  return "CD";
}

function readSelectionMode(): MarketSelectionMode {
  const value = localStorage.getItem(STORAGE_SELECTION_MODE);
  return value === "manual" ? "manual" : "auto";
}

function readSelectedCountry(fallback: MarketCountryCode): MarketCountryCode {
  const value = (localStorage.getItem(STORAGE_COUNTRY) ?? "").toUpperCase();
  return isMarketCountryCode(value) ? value : fallback;
}

export function MarketPreferenceProvider({ children }: { children: React.ReactNode }) {
  const detectedCountry = useMemo(() => detectCountryFromBrowser(), []);
  const [selectionMode, setSelectionModeState] = useState<MarketSelectionMode>(() => readSelectionMode());
  const [selectedCountry, setSelectedCountryState] = useState<MarketCountryCode>(() => readSelectedCountry(detectedCountry));

  const value = useMemo<MarketPreferenceContextValue>(() => {
    const setSelectionMode = (mode: MarketSelectionMode) => {
      setSelectionModeState(mode);
      localStorage.setItem(STORAGE_SELECTION_MODE, mode);
    };

    const setSelectedCountry = (country: MarketCountryCode) => {
      if (selectedCountry !== country) {
        // Invalider le cache concerné par les changements de pays
        invalidateCache("/explorer");
        invalidateCache("/listings");
        invalidateCache("/sokin");
      }
      setSelectedCountryState(country);
      localStorage.setItem(STORAGE_COUNTRY, country);
      localStorage.setItem(STORAGE_SELECTION_MODE, "manual");
      setSelectionModeState("manual");
    };

    const effectiveCountry = selectionMode === "manual" ? selectedCountry : detectedCountry;

    return {
      countries: MARKET_COUNTRIES,
      detectedCountry,
      selectedCountry,
      effectiveCountry,
      selectionMode,
      setSelectedCountry,
      setSelectionMode,
      getCountryConfig: (country?: MarketCountryCode) => getMarketCountry(country ?? effectiveCountry),
    };
  }, [detectedCountry, selectedCountry, selectionMode]);

  return <MarketPreferenceContext.Provider value={value}>{children}</MarketPreferenceContext.Provider>;
}

export function useMarketPreference() {
  const context = useContext(MarketPreferenceContext);
  if (!context) {
    throw new Error("useMarketPreference must be used inside MarketPreferenceProvider");
  }
  return context;
}
