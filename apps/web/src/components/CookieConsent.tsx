import { useState } from "react";
import { Link } from "react-router-dom";
import { SK_COOKIE_CONSENT } from "../shared/constants/storage-keys";
import "./cookie-consent.css";

const STORAGE_KEY = SK_COOKIE_CONSENT;

export function CookieConsent() {
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(STORAGE_KEY)
  );

  if (!visible) return null;

  function handleChoice(choice: "accepted" | "rejected") {
    localStorage.setItem(STORAGE_KEY, choice);
    setVisible(false);
  }

  return (
    <div className="cookie-consent-overlay" role="dialog" aria-label="Consentement cookies">
      <div className="cookie-consent-banner">
        <p className="cookie-consent-text">
          Ce site utilise des cookies pour améliorer votre expérience, analyser
          le trafic et personnaliser le contenu. En cliquant sur « Accepter »,
          vous consentez à l'utilisation de tous les cookies.{" "}
          <span className="cookie-consent-links">
            <Link to="/privacy">Politique de confidentialité</Link>
            {" · "}
            <Link to="/terms">Conditions d'utilisation</Link>
            {" · "}
            <Link to="/legal">Mentions légales</Link>
          </span>
        </p>
        <div className="cookie-consent-actions">
          <button
            className="cookie-consent-accept"
            onClick={() => handleChoice("accepted")}
          >
            Accepter
          </button>
          <button
            className="cookie-consent-reject"
            onClick={() => handleChoice("rejected")}
          >
            Refuser
          </button>
        </div>
      </div>
    </div>
  );
}
