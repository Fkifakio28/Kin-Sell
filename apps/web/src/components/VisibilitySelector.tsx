/**
 * VisibilitySelector — Choix du niveau de visibilité de la localisation.
 *
 * Usage:
 *   <VisibilitySelector
 *     value="CITY_PUBLIC"
 *     onChange={(v) => setVisibility(v)}
 *   />
 */

import type { LocationVisibility } from "../lib/api-client";

const OPTIONS: Array<{ value: LocationVisibility; label: string; desc: string }> = [
  { value: "EXACT_PRIVATE",  label: "🔒 Privé total",      desc: "Rien n'est affiché publiquement" },
  { value: "COUNTRY_PUBLIC", label: "🌍 Pays",              desc: "Seul votre pays est visible" },
  { value: "REGION_PUBLIC",  label: "📍 Région",            desc: "Votre région/province est visible" },
  { value: "CITY_PUBLIC",    label: "🏙️ Ville",            desc: "Votre ville est visible (recommandé)" },
  { value: "DISTRICT_PUBLIC",label: "📌 Quartier/Commune",  desc: "Votre quartier/commune est visible" },
  { value: "EXACT_PUBLIC",   label: "📍 Adresse exacte",    desc: "Votre adresse complète est visible" },
];

type Props = {
  value: LocationVisibility;
  onChange: (value: LocationVisibility) => void;
  /** Masquer les options les plus ouvertes pour les particuliers */
  hideExact?: boolean;
};

export default function VisibilitySelector({ value, onChange, hideExact }: Props) {
  const filteredOptions = hideExact
    ? OPTIONS.filter((o) => o.value !== "EXACT_PUBLIC")
    : OPTIONS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ color: "var(--color-text-secondary, #aaa)", fontSize: 13, fontWeight: 500 }}>
        Visibilité de votre localisation
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as LocationVisibility)}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
          background: "var(--glass-bg, rgba(255,255,255,0.04))",
          color: "var(--color-text, #fff)",
          fontSize: 14,
          appearance: "none",
          cursor: "pointer",
        }}
      >
        {filteredOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label} — {opt.desc}
          </option>
        ))}
      </select>
    </div>
  );
}
