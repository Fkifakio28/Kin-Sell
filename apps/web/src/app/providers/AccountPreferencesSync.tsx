import { useEffect, useRef } from "react";
import { useAuth } from "./AuthProvider";
import { useLocaleCurrency, type AppLanguage, type AppCurrency } from "./LocaleCurrencyProvider";
import { useMarketPreference } from "./MarketPreferenceProvider";
import { auth as authApi } from "../../lib/api-client";
import type { MarketCountryCode } from "../config/market";

const VALID_LANG: AppLanguage[] = ["fr", "en", "ln", "ar"];
const VALID_CURRENCY: AppCurrency[] = ["CDF", "USD", "EUR", "XAF", "AOA", "XOF", "GNF", "MAD"];
const VALID_COUNTRY: MarketCountryCode[] = ["GLOBAL", "CD", "GA", "CG", "AO", "CI", "GN", "SN", "MA"];

/**
 * Synchronise les préférences serveur (UserPreference) avec les providers locaux.
 *
 * Comportement :
 *  - À la connexion : applique les préférences serveur (langue si localeManual=true,
 *    pays si marketScope est défini, devise si présente).
 *  - Quand l'utilisateur connecté change de langue → PATCH { locale, localeManual: true }.
 *  - Quand l'utilisateur connecté change de pays/scope → PATCH { marketScope, countryCode }.
 *  - Quand l'utilisateur change de devise → PATCH { currency }.
 *  - À la déconnexion : aucune action (les choix locaux restent jusqu'à la prochaine connexion).
 */
export function AccountPreferencesSync() {
  const { user, isLoading } = useAuth();
  const { language, setLanguage, currency, setCurrency } = useLocaleCurrency();
  const { selectedCountry, setSelectedCountry, isGlobalScope } = useMarketPreference();

  // ── 1) HYDRATATION : compte → providers (une seule fois par session connectée) ──
  const hydratedForUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      hydratedForUserRef.current = null;
      return;
    }
    if (hydratedForUserRef.current === user.id) return;
    hydratedForUserRef.current = user.id;

    const prefs = user.preferences ?? null;
    if (!prefs) return;

    // Langue : on applique seulement si localeManual=true (sinon on garde la détection navigateur)
    if (prefs.localeManual && prefs.locale && (VALID_LANG as string[]).includes(prefs.locale)) {
      if (prefs.locale !== language) setLanguage(prefs.locale as AppLanguage);
    }

    // Devise
    if (prefs.currency && (VALID_CURRENCY as string[]).includes(prefs.currency)) {
      if (prefs.currency !== currency) setCurrency(prefs.currency as AppCurrency);
    }

    // Pays / scope
    const targetCountry: MarketCountryCode =
      prefs.marketScope === "COUNTRY" && prefs.countryCode &&
      (VALID_COUNTRY as string[]).includes(prefs.countryCode)
        ? (prefs.countryCode as MarketCountryCode)
        : "GLOBAL";
    if (targetCountry !== selectedCountry) {
      setSelectedCountry(targetCountry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isLoading]);

  // ── 2) PUSH : changements locaux → serveur (uniquement si connecté + après hydratation) ──
  const lastSentRef = useRef<{ locale?: string; currency?: string; country?: string }>({});

  // Langue
  useEffect(() => {
    if (!user || hydratedForUserRef.current !== user.id) return;
    if (lastSentRef.current.locale === language) return;
    if (user.preferences?.localeManual && user.preferences?.locale === language) {
      lastSentRef.current.locale = language;
      return;
    }
    lastSentRef.current.locale = language;
    authApi.updatePreferences({ locale: language, localeManual: true }).catch(() => {
      /* silencieux : l'utilisateur garde son choix local */
    });
  }, [language, user]);

  // Devise
  useEffect(() => {
    if (!user || hydratedForUserRef.current !== user.id) return;
    if (lastSentRef.current.currency === currency) return;
    if (user.preferences?.currency === currency) {
      lastSentRef.current.currency = currency;
      return;
    }
    lastSentRef.current.currency = currency;
    authApi.updatePreferences({ currency }).catch(() => { /* silencieux */ });
  }, [currency, user]);

  // Pays / scope
  useEffect(() => {
    if (!user || hydratedForUserRef.current !== user.id) return;
    const key = `${isGlobalScope ? "GLOBAL" : selectedCountry}`;
    if (lastSentRef.current.country === key) return;

    const serverScope = user.preferences?.marketScope;
    const serverCode = user.preferences?.countryCode;
    if (
      (isGlobalScope && serverScope === "KIN_SELL") ||
      (!isGlobalScope && serverScope === "COUNTRY" && serverCode === selectedCountry)
    ) {
      lastSentRef.current.country = key;
      return;
    }

    lastSentRef.current.country = key;
    authApi
      .updatePreferences(
        isGlobalScope
          ? { marketScope: "KIN_SELL", countryCode: null }
          : { marketScope: "COUNTRY", countryCode: selectedCountry as any }
      )
      .catch(() => { /* silencieux */ });
  }, [selectedCountry, isGlobalScope, user]);

  return null;
}
