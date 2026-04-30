import { useDataSaver, type DataSaverPreference } from "../app/providers/DataSaverProvider";

/**
 * Toggle compact du mode économie de données.
 * S'utilise dans les écrans de paramètres (ou dans un menu).
 *
 * 3 états explicites :
 *   - auto : suit la détection réseau (saveData / 2G)
 *   - on   : forcé ON
 *   - off  : forcé OFF
 *
 * Le choix est persisté via le provider (localStorage).
 */
export function DataSaverToggle() {
  const { userPreference, setUserPreference, autoDetected, lowBandwidth } = useDataSaver();

  const options: Array<{ value: DataSaverPreference; label: string; hint: string }> = [
    { value: "auto", label: "Auto", hint: autoDetected ? "réseau lent détecté" : "réseau correct" },
    { value: "on",   label: "Activé",  hint: "priorise la vitesse sur mauvais réseau" },
    { value: "off",  label: "Désactivé", hint: "qualité maximale" },
  ];

  return (
    <div className="ks-data-saver">
      <div className="ks-data-saver__head">
        <div>
          <div className="ks-data-saver__title">Mode économie de données</div>
          <div className="ks-data-saver__sub">
            {lowBandwidth
              ? "Actif — listes réduites, rafraîchissements espacés."
              : "Inactif — qualité/volume normaux."}
          </div>
        </div>
      </div>
      <div className="ks-data-saver__row" role="radiogroup" aria-label="Mode économie de données">
        {options.map((o) => {
          const active = userPreference === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              className={`ks-data-saver__opt${active ? " is-active" : ""}`}
              onClick={() => setUserPreference(o.value)}
            >
              <span className="ks-data-saver__opt-label">{o.label}</span>
              <span className="ks-data-saver__opt-hint">{o.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
