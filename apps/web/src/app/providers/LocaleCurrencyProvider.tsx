import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMarketPreference } from "./MarketPreferenceProvider";

export type AppLanguage = "fr" | "en" | "ln" | "ar";
export type AppCurrency = "CDF" | "USD" | "EUR" | "XAF" | "AOA" | "XOF" | "GNF" | "MAD";

type LocaleCurrencyContextValue = {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  currency: AppCurrency;
  setCurrency: (currency: AppCurrency) => void;
  currencySymbol: string;
  currencyUsesDecimals: boolean;
  t: (key: string, fallback?: string) => string;
  formatMoneyFromUsdCents: (usdCents: number) => string;
  formatDate: (isoDate: string | Date) => string;
  formatPriceLabelFromUsdCents: (usdCents: number) => string;
  convertFromUsdCents: (usdCents: number) => number;
  convertToUsdCents: (amount: number) => number;
};

/* ── Taux de conversion par défaut (fallback si API indisponible) ── */
import { DEFAULT_CURRENCY_RATES } from "../../shared/constants/currencies";
import { SK_LANGUAGE, SK_CURRENCY, SK_CURRENCY_RATES, SK_CURRENCY_RATES_TS } from "../../shared/constants/storage-keys";
const DEFAULT_RATES = DEFAULT_CURRENCY_RATES;

const STORAGE_LANGUAGE = SK_LANGUAGE;
const STORAGE_CURRENCY = SK_CURRENCY;
const STORAGE_RATES = SK_CURRENCY_RATES;
const STORAGE_RATES_TS = SK_CURRENCY_RATES_TS;
const RATES_TTL_MS = 60 * 60 * 1000; // 1h

import { fr as frDict } from "../i18n/fr";

/* ── Lazy-loaded dictionaries (code-split by Vite) ── */
const dictCache: Partial<Record<AppLanguage, Record<string, string>>> = { fr: frDict };

async function loadDict(lang: AppLanguage): Promise<Record<string, string>> {
  if (dictCache[lang]) return dictCache[lang]!;
  let dict: Record<string, string>;
  switch (lang) {
    case "en": dict = (await import("../i18n/en")).en; break;
    case "ln": dict = (await import("../i18n/ln")).ln; break;
    case "ar": dict = (await import("../i18n/ar")).ar; break;
    default: dict = frDict;
  }
  dictCache[lang] = dict;
  return dict;
}

const LocaleCurrencyContext = createContext<LocaleCurrencyContextValue | null>(null);

function readInitialLanguage(): AppLanguage {
  const value = localStorage.getItem(STORAGE_LANGUAGE);
  if (value === "fr" || value === "en" || value === "ln" || value === "ar") return value;
  if (value === "cd") return "ln";
  return "fr";
}

function readInitialCurrency(): AppCurrency {
  const value = localStorage.getItem(STORAGE_CURRENCY);
  if (value === "CDF" || value === "USD" || value === "EUR" || value === "XAF" || value === "AOA" || value === "XOF" || value === "GNF" || value === "MAD") return value;
  if (value === "fc") return "CDF";
  if (value === "usd") return "USD";
  if (value === "eur") return "EUR";
  if (value === "xaf") return "XAF";
  if (value === "aoa") return "AOA";
  if (value === "xof") return "XOF";
  if (value === "gnf") return "GNF";
  if (value === "mad") return "MAD";
  return "CDF";
}

export function LocaleCurrencyProvider({ children }: { children: React.ReactNode }) {
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const [language, setLanguageState] = useState<AppLanguage>(() => readInitialLanguage());
  const [currency, setCurrencyState] = useState<AppCurrency>(() => readInitialCurrency());
  const [activeDict, setActiveDict] = useState<Record<string, string>>(frDict);
  const [rates, setRates] = useState<Record<string, number>>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_RATES);
      const ts = Number(localStorage.getItem(STORAGE_RATES_TS) ?? "0");
      if (cached && Date.now() - ts < RATES_TTL_MS) return JSON.parse(cached);
    } catch { /* ignore */ }
    return DEFAULT_RATES;
  });
  const fetchedRef = useRef(false);

  // Load the correct dictionary when language changes (lazy for non-FR)
  useEffect(() => {
    loadDict(language).then(setActiveDict);
  }, [language]);

  // Apply lang/dir on the document for full-page translation consistency
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  // Fetch taux dynamiques depuis l'API au montage
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "/api";
    fetch(`${API_BASE}/market/rates`, { cache: "no-cache" })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { rates?: Record<string, number> } | null) => {
        if (data?.rates) {
          setRates(data.rates);
          localStorage.setItem(STORAGE_RATES, JSON.stringify(data.rates));
          localStorage.setItem(STORAGE_RATES_TS, String(Date.now()));
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  useEffect(() => {
    const hasLanguage = Boolean(localStorage.getItem(STORAGE_LANGUAGE));
    const hasCurrency = Boolean(localStorage.getItem(STORAGE_CURRENCY));
    if (hasLanguage && hasCurrency) return;

    const country = getCountryConfig(effectiveCountry);
    if (!hasLanguage) {
      const suggestedLanguage: AppLanguage =
        country.defaultContentLanguage === "en" ? "en"
        : country.defaultContentLanguage === "ln" ? "ln"
        : country.defaultContentLanguage === "ar" ? "ar"
        : "fr";
      setLanguageState(suggestedLanguage);
      localStorage.setItem(STORAGE_LANGUAGE, suggestedLanguage);
    }

    if (!hasCurrency) {
      const dc = country.defaultCurrency;
      const suggestedCurrency: AppCurrency =
        (dc === "USD" || dc === "EUR" || dc === "CDF" || dc === "XAF" ||
         dc === "AOA" || dc === "XOF" || dc === "GNF" || dc === "MAD")
          ? dc : "CDF";
      setCurrencyState(suggestedCurrency);
      localStorage.setItem(STORAGE_CURRENCY, suggestedCurrency);
    }
  }, [effectiveCountry, getCountryConfig]);

  const value = useMemo<LocaleCurrencyContextValue>(() => {
    const t = (key: string, fallback?: string) => activeDict[key] ?? frDict[key] ?? fallback ?? key;

    const setLanguage = (lang: AppLanguage) => {
      setLanguageState(lang);
      localStorage.setItem(STORAGE_LANGUAGE, lang);
    };

    const setCurrency = (nextCurrency: AppCurrency) => {
      setCurrencyState(nextCurrency);
      localStorage.setItem(STORAGE_CURRENCY, nextCurrency);
    };

    const getRate = (code: string): number => rates[code] ?? DEFAULT_RATES[code] ?? 1;
    const currencyUsesDecimals = currency === "USD" || currency === "EUR" || currency === "MAD";
    const currencySymbolMap: Record<AppCurrency, string> = {
      CDF: "FC",
      USD: "$",
      EUR: "€",
      XAF: "XAF",
      AOA: "Kz",
      XOF: "XOF",
      GNF: "GNF",
      MAD: "MAD",
    };
    const currencySymbol = currencySymbolMap[currency] ?? currency;

    const formatMoneyFromUsdCents = (usdCents: number): string => {
      const usd = usdCents / 100;
      const locale = language === "ar" ? "ar-MA" : language === "fr" || language === "ln" ? "fr-FR" : "en-US";

      if (currency === "USD") {
        return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(usd);
      }

      // Devises avec centimes (EUR, MAD)
      if (currency === "EUR" || currency === "MAD") {
        return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(usd * getRate(currency));
      }

      // Devises sans centimes (CDF, XAF, AOA, XOF, GNF)
      if (currency === "CDF" || currency === "XAF" || currency === "AOA" || currency === "XOF" || currency === "GNF") {
        const converted = Math.round(usd * getRate(currency));
        // CDF : affichage spécial "FC"
        if (currency === "CDF") {
          return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(converted)} FC`;
        }
        return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(converted);
      }

      // Fallback CDF
      return `${new Intl.NumberFormat("fr-CD", { maximumFractionDigits: 0 }).format(Math.round(usd * getRate("CDF")))} FC`;
    };

    const formatDate = (isoDate: string | Date) => {
      const date = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
      const loc = language === "en" ? "en-US" : language === "ar" ? "ar-MA" : language === "ln" ? "fr-CD" : "fr-FR";
      return new Intl.DateTimeFormat(loc, { day: "2-digit", month: "short", year: "numeric" }).format(date);
    };

    const formatPriceLabelFromUsdCents = (usdCents: number) => {
      if (usdCents <= 0) return t("common.freePrice");
      return formatMoneyFromUsdCents(usdCents);
    };

    const convertFromUsdCents = (usdCents: number): number => {
      const usd = usdCents / 100;
      if (currency === "USD") return usd;
      return usd * getRate(currency);
    };

    const convertToUsdCents = (amount: number): number => {
      if (!Number.isFinite(amount)) return 0;
      if (currency === "USD") return Math.round(amount * 100);
      const rate = getRate(currency);
      if (!rate) return Math.round(amount * 100);
      return Math.round((amount / rate) * 100);
    };

    return {
      language, setLanguage, currency, setCurrency,
      currencySymbol, currencyUsesDecimals,
      t, formatMoneyFromUsdCents, formatDate, formatPriceLabelFromUsdCents,
      convertFromUsdCents, convertToUsdCents,
    };
  }, [currency, language, rates, activeDict]);

  return <LocaleCurrencyContext.Provider value={value}>{children}</LocaleCurrencyContext.Provider>;
}

export function useLocaleCurrency() {
  const ctx = useContext(LocaleCurrencyContext);
  if (!ctx) {
    throw new Error("useLocaleCurrency must be used inside LocaleCurrencyProvider");
  }
  return ctx;
}
