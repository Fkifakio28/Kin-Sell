/**
 * Bloc IA Settings partagé — 3 toggles : Conseils / Auto-Nego / Commande
 * Utilisé dans UserDashboard et BusinessDashboard avec des storage keys différentes.
 */
import { useState } from "react";
import { Link } from "react-router-dom";

interface AiSettingsProps {
  t: (key: string) => string;
  /** Storage keys for persisting toggle states */
  storageKeys: {
    advice: string;
    autoNego: string;
    commande: string;
  };
  /** Feature gate booleans */
  hasIaMarchandPlan: boolean;
  hasIaOrderPlan: boolean;
  autoNegoActive?: boolean;
}

export function DashboardAiSettings({
  t,
  storageKeys,
  hasIaMarchandPlan,
  hasIaOrderPlan,
  autoNegoActive = false,
}: AiSettingsProps) {
  const [aiAdviceEnabled, setAiAdviceEnabled] = useState(() => localStorage.getItem(storageKeys.advice) !== "off");
  const [aiAutoNegoEnabled, setAiAutoNegoEnabled] = useState(() => localStorage.getItem(storageKeys.autoNego) === "on");
  const [aiCommandeEnabled, setAiCommandeEnabled] = useState(() => localStorage.getItem(storageKeys.commande) !== "off");

  return (
    <section className="ud-glass-panel ud-settings-section">
      <div className="ud-settings-section-head">
        <span className="ud-settings-section-icon">🤖</span>
        <h3 className="ud-settings-section-title">{t("user.settingsAiTitle")}</h3>
      </div>
      <p className="ud-placeholder-text" style={{ margin: "0 0 12px", fontSize: "0.82rem" }}>
        {t("user.settingsAiDesc")}
      </p>

      <div className="ud-ai-toggles">
        {/* ── Conseils IA (gratuit) ── */}
        <div className="ud-ai-toggle-row">
          <div className="ud-ai-toggle-info">
            <strong>💡 {t("user.aiAdviceLabel")}</strong>
            <span className="ud-ai-toggle-hint">{t("user.aiAdviceHint")}</span>
          </div>
          <button
            type="button"
            className={`ud-ai-switch${aiAdviceEnabled ? " ud-ai-switch--on" : ""}`}
            onClick={() => {
              const next = !aiAdviceEnabled;
              setAiAdviceEnabled(next);
              localStorage.setItem(storageKeys.advice, next ? "on" : "off");
            }}
            aria-pressed={aiAdviceEnabled}
          >
            <span className="ud-ai-switch-thumb" />
          </button>
        </div>

        {/* ── Marchandage automatique (payant) ── */}
        <div className={`ud-ai-toggle-row${!hasIaMarchandPlan ? " ud-ai-toggle-row--locked" : ""}`}>
          <div className="ud-ai-toggle-info">
            <strong>🤝 {t("user.aiAutoNegoLabel")}</strong>
            <span className="ud-ai-toggle-hint">
              {hasIaMarchandPlan ? t("user.aiAutoNegoHint") : t("user.aiAutoNegoLocked")}
            </span>
          </div>
          {hasIaMarchandPlan ? (
            <button
              type="button"
              className={`ud-ai-switch${aiAutoNegoEnabled ? " ud-ai-switch--on" : ""}`}
              onClick={() => {
                const next = !aiAutoNegoEnabled;
                setAiAutoNegoEnabled(next);
                localStorage.setItem(storageKeys.autoNego, next ? "on" : "off");
              }}
              aria-pressed={aiAutoNegoEnabled}
            >
              <span className="ud-ai-switch-thumb" />
            </button>
          ) : (
            <Link to="/forfaits" className="ud-ai-upgrade-link">★ {t("user.aiUpgrade")}</Link>
          )}
        </div>

        {/* ── IA Commande (payant) ── */}
        <div className={`ud-ai-toggle-row${!hasIaOrderPlan ? " ud-ai-toggle-row--locked" : ""}`}>
          <div className="ud-ai-toggle-info">
            <strong>📦 {t("user.aiCommandeLabel")}</strong>
            <span className="ud-ai-toggle-hint">
              {hasIaOrderPlan ? t("user.aiCommandeHint") : t("user.aiCommandeLocked")}
            </span>
          </div>
          {hasIaOrderPlan ? (
            <button
              type="button"
              className={`ud-ai-switch${aiCommandeEnabled ? " ud-ai-switch--on" : ""}`}
              onClick={() => {
                const next = !aiCommandeEnabled;
                setAiCommandeEnabled(next);
                localStorage.setItem(storageKeys.commande, next ? "on" : "off");
              }}
              aria-pressed={aiCommandeEnabled}
            >
              <span className="ud-ai-switch-thumb" />
            </button>
          ) : (
            <Link to="/forfaits" className="ud-ai-upgrade-link">★ {t("user.aiUpgrade")}</Link>
          )}
        </div>
      </div>

      {autoNegoActive && (
        <div className="ud-ai-auto-status">
          <span className="ud-ai-auto-dot" />
          <span>{t("user.aiAutoNegoActive")}</span>
        </div>
      )}
    </section>
  );
}
