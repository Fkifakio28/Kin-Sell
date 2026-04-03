import { useLocaleCurrency, type AppCurrency, type AppLanguage } from "../app/providers/LocaleCurrencyProvider";
import { useMarketPreference } from "../app/providers/MarketPreferenceProvider";

const LANGUAGES: { code: AppLanguage; label: string }[] = [
  { code: "fr", label: "🇫🇷 Français" },
  { code: "en", label: "🇬🇧 English" },
  { code: "ln", label: "🇨🇩 Lingála" },
  { code: "ar", label: "🇲🇦 العربية" },
];

const CURRENCIES: { code: AppCurrency; label: string }[] = [
  { code: "CDF", label: "FC — Franc Congolais" },
  { code: "USD", label: "$ — Dollar US" },
  { code: "EUR", label: "€ — Euro" },
  { code: "XAF", label: "XAF — Franc CFA (CEMAC)" },
  { code: "AOA", label: "AOA — Kwanza" },
  { code: "XOF", label: "XOF — Franc CFA (UEMOA)" },
  { code: "GNF", label: "GNF — Franc Guinéen" },
  { code: "MAD", label: "MAD — Dirham" },
];

export function RegionLanguageCurrencySelector({ className }: { className?: string }) {
  const { language, setLanguage, currency, setCurrency, t } = useLocaleCurrency();
  const { countries, selectedCountry, effectiveCountry, selectionMode, setSelectedCountry, setSelectionMode } = useMarketPreference();

  return (
    <div className={`ks-rlc-selector${className ? ` ${className}` : ""}`}>
      {/* Pays */}
      <div className="ks-rlc-group">
        <label className="ks-rlc-label">🌍 {t("footer.country") || "Pays"}</label>
        <select
          className="ks-rlc-select"
          value={selectionMode === "manual" ? selectedCountry : effectiveCountry}
          onChange={(e) => {
            setSelectionMode("manual");
            setSelectedCountry(e.target.value as typeof selectedCountry);
          }}
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Langue */}
      <div className="ks-rlc-group">
        <label className="ks-rlc-label">🌐 {t("footer.language")}</label>
        <select
          className="ks-rlc-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value as AppLanguage)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Devise */}
      <div className="ks-rlc-group">
        <label className="ks-rlc-label">💱 {t("footer.currency")}</label>
        <select
          className="ks-rlc-select"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as AppCurrency)}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
