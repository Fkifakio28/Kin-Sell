/**
 * WelcomeOnboarding — Popup glassmorphism post-login (première connexion).
 *
 * 4 choix :
 *   1. Acheter → message explicatif, reste sur Home
 *   2. Vendre (Produit) → redirige /account?section=articles&action=publish&type=PRODUIT
 *   3. Proposer un service → redirige /account?section=articles&action=publish&type=SERVICE
 *   4. Visiter → ferme le popup + lance le tutoriel interactif
 *
 * Ne s'affiche qu'une seule fois (localStorage).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { SK_WELCOME_ONBOARDING_DONE } from "../../shared/constants/storage-keys";
import "./welcome-onboarding.css";

type Step = "choices" | "buy-info";

export function WelcomeOnboarding({ onClose, onStartTutorial }: { onClose: () => void; onStartTutorial?: () => void }) {
  const { t } = useLocaleCurrency();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("choices");

  const finish = () => {
    localStorage.setItem(SK_WELCOME_ONBOARDING_DONE, Date.now().toString());
    onClose();
  };

  const handleBuy = () => setStep("buy-info");

  const handleSell = () => {
    finish();
    navigate("/account?section=articles&action=publish&type=PRODUIT");
  };

  const handleService = () => {
    finish();
    navigate("/account?section=articles&action=publish&type=SERVICE");
  };

  const handleVisit = () => {
    finish();
    onStartTutorial?.();
  };

  const handleBuyOk = () => finish();

  if (step === "buy-info") {
    return (
      <div className="wo-overlay" role="dialog" aria-modal="true">
        <div className="wo-card">
          <button className="wo-close-btn" onClick={finish} aria-label="Fermer" type="button">✕</button>
          <div className="wo-icon">🛒</div>
          <h2 className="wo-title">{t("onboarding.buyInfoTitle")}</h2>
          <p className="wo-desc">{t("onboarding.buyInfoDesc")}</p>
          <button className="wo-btn wo-btn--primary" onClick={handleBuyOk}>
            {t("onboarding.understood")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wo-overlay" role="dialog" aria-modal="true">
      <div className="wo-card">
        <button className="wo-close-btn" onClick={finish} aria-label="Fermer" type="button">✕</button>
        <div className="wo-icon">👋</div>
        <h2 className="wo-title">{t("onboarding.welcomeTitle")}</h2>
        <p className="wo-subtitle">{t("onboarding.welcomeSubtitle")}</p>

        <div className="wo-choices">
          <button className="wo-choice" onClick={handleBuy}>
            <span className="wo-choice-icon">🛍️</span>
            <span className="wo-choice-label">{t("onboarding.wantBuy")}</span>
          </button>
          <button className="wo-choice" onClick={handleSell}>
            <span className="wo-choice-icon">📦</span>
            <span className="wo-choice-label">{t("onboarding.wantSell")}</span>
          </button>
          <button className="wo-choice" onClick={handleService}>
            <span className="wo-choice-icon">🔧</span>
            <span className="wo-choice-label">{t("onboarding.wantService")}</span>
          </button>
          <button className="wo-choice wo-choice--visit" onClick={handleVisit}>
            <span className="wo-choice-icon">🎓</span>
            <span className="wo-choice-label">{t("onboarding.wantVisit")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
