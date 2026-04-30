import { useState } from "react";
import "./variant-editor.css";

export type ProductVariantsValue = {
  sizes?: string[];
  colors?: { name: string; hex: string }[];
} | null;

type Props = {
  value: ProductVariantsValue;
  onChange: (v: ProductVariantsValue) => void;
  /** Ignoré : ce composant est masqué côté parent pour les services. */
  disabled?: boolean;
};

const QUICK_SIZE_PRESETS: Record<string, string[]> = {
  Vêtements: ["XS", "S", "M", "L", "XL", "XXL"],
  Chaussures: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"],
  Numérique: ["64 Go", "128 Go", "256 Go", "512 Go", "1 To"],
};

const QUICK_COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "Noir", hex: "#0c0a1e" },
  { name: "Blanc", hex: "#f5f5f5" },
  { name: "Gris", hex: "#888a99" },
  { name: "Rouge", hex: "#d64545" },
  { name: "Bleu", hex: "#2e66ff" },
  { name: "Vert", hex: "#42d4a4" },
  { name: "Jaune", hex: "#ffd233" },
  { name: "Rose", hex: "#ff7a90" },
  { name: "Violet", hex: "#6f58ff" },
  { name: "Marron", hex: "#6a4b2a" },
  { name: "Or", hex: "#d4af37" },
  { name: "Argent", hex: "#c4c4d1" },
];

/**
 * Éditeur de variantes (tailles + couleurs) pour un produit.
 * Placer ce composant UNIQUEMENT quand type === "PRODUIT".
 */
export function VariantsEditor({ value, onChange }: Props) {
  const sizes = value?.sizes ?? [];
  const colors = value?.colors ?? [];
  const [sizeInput, setSizeInput] = useState("");
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#6f58ff");

  const update = (next: Partial<NonNullable<ProductVariantsValue>>) => {
    const merged = { sizes, colors, ...next };
    const hasAny = (merged.sizes?.length ?? 0) > 0 || (merged.colors?.length ?? 0) > 0;
    onChange(hasAny ? merged : null);
  };

  const addSize = (s: string) => {
    const v = s.trim();
    if (!v || sizes.includes(v) || sizes.length >= 30) return;
    update({ sizes: [...sizes, v] });
  };
  const removeSize = (s: string) => update({ sizes: sizes.filter((x) => x !== s) });

  const addColor = (c: { name: string; hex: string }) => {
    if (!c.name || !c.hex) return;
    if (colors.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) return;
    if (colors.length >= 30) return;
    update({ colors: [...colors, c] });
  };
  const removeColor = (name: string) => update({ colors: colors.filter((c) => c.name !== name) });

  return (
    <div className="ve-wrap">
      <div className="ve-intro">
        <span className="ve-intro-icon">🎨</span>
        <div>
          <div className="ve-intro-title">Variantes (facultatif)</div>
          <div className="ve-intro-hint">
            Déclarez les tailles et/ou couleurs disponibles. Les acheteurs pourront les sélectionner sur la page produit.
          </div>
        </div>
      </div>

      {/* ── TAILLES ── */}
      <div className="ve-block">
        <label className="ve-label">👕 Tailles disponibles</label>
        <div className="ve-chips-row">
          {sizes.map((s) => (
            <span key={s} className="ve-chip ve-chip--size">
              {s}
              <button type="button" className="ve-chip-x" onClick={() => removeSize(s)} aria-label={`Retirer ${s}`}>×</button>
            </span>
          ))}
          {sizes.length === 0 && <span className="ve-empty">Aucune taille ajoutée</span>}
        </div>
        <div className="ve-inline-form">
          <input
            type="text"
            className="ve-input"
            placeholder="Ex: M, 42, 128 Go…"
            value={sizeInput}
            onChange={(e) => setSizeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSize(sizeInput); setSizeInput(""); } }}
            maxLength={20}
          />
          <button type="button" className="ve-btn ve-btn--add" onClick={() => { addSize(sizeInput); setSizeInput(""); }}>
            + Ajouter
          </button>
        </div>
        <div className="ve-presets">
          <span className="ve-presets-label">Vite :</span>
          {Object.entries(QUICK_SIZE_PRESETS).map(([name, list]) => (
            <button
              key={name}
              type="button"
              className="ve-preset-btn"
              onClick={() => {
                const merged = [...sizes];
                for (const s of list) if (!merged.includes(s)) merged.push(s);
                update({ sizes: merged.slice(0, 30) });
              }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* ── COULEURS ── */}
      <div className="ve-block">
        <label className="ve-label">🎨 Couleurs disponibles</label>
        <div className="ve-chips-row">
          {colors.map((c) => (
            <span key={c.name} className="ve-chip ve-chip--color">
              <span className="ve-color-dot" style={{ background: c.hex }} aria-hidden="true" />
              {c.name}
              <button type="button" className="ve-chip-x" onClick={() => removeColor(c.name)} aria-label={`Retirer ${c.name}`}>×</button>
            </span>
          ))}
          {colors.length === 0 && <span className="ve-empty">Aucune couleur ajoutée</span>}
        </div>
        <div className="ve-inline-form">
          <input
            type="text"
            className="ve-input"
            placeholder="Nom (ex: Bleu marine)"
            value={colorName}
            onChange={(e) => setColorName(e.target.value)}
            maxLength={30}
          />
          <input
            type="color"
            className="ve-color-picker"
            value={colorHex}
            onChange={(e) => setColorHex(e.target.value)}
            aria-label="Choisir une couleur"
          />
          <button
            type="button"
            className="ve-btn ve-btn--add"
            onClick={() => {
              const name = colorName.trim();
              if (!name) return;
              addColor({ name, hex: colorHex });
              setColorName("");
            }}
          >
            + Ajouter
          </button>
        </div>
        <div className="ve-presets">
          <span className="ve-presets-label">Couleurs rapides :</span>
          {QUICK_COLOR_PRESETS.map((c) => (
            <button
              key={c.name}
              type="button"
              className="ve-color-preset"
              onClick={() => addColor(c)}
              title={c.name}
              style={{ background: c.hex }}
              aria-label={`Ajouter ${c.name}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
