import { useState } from "react";
import { useLocaleCurrency } from "../app/providers/LocaleCurrencyProvider";
import "./cookie-consent.css";

const COOKIE_CONSENT_KEY = "ks-cookie-consent";

export function CookieConsent() {
  const { t } = useLocaleCurrency();
  const [visible, setVisible] = useState(() => !localStorage.getItem(COOKIE_CONSENT_KEY));
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!visible) return null;

  const handleAck = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({ status: "ack", ts: Date.now() }));
    setVisible(false);
  };

  return (
    <div className="cookie-consent" role="dialog" aria-label={t("cookie.title")}>
      <div className="cookie-consent-card glass-card">
        <div className="cookie-consent-icon" aria-hidden="true">🍪</div>
        <div className="cookie-consent-content">
          <h3 className="cookie-consent-title">{t("cookie.title")}</h3>
          <p className="cookie-consent-text">{t("cookie.text")}</p>

          {detailsOpen && (
            <div className="cookie-consent-details">
              <ul className="cookie-consent-detail-list">
                <li>{t("cookie.detail1")}</li>
                <li>{t("cookie.detail2")}</li>
                <li>{t("cookie.detail3")}</li>
              </ul>
              <p className="cookie-consent-links">
                <a href="/terms" className="cookie-consent-link">{t("cookie.termsLink")}</a>
                <span className="cookie-consent-separator">•</span>
                <a href="/privacy" className="cookie-consent-link">{t("cookie.privacyLink")}</a>
              </p>
            </div>
          )}
        </div>

        <div className="cookie-actions">
          <button type="button" className="cookie-btn-ghost" onClick={() => setDetailsOpen(!detailsOpen)}>
            {detailsOpen ? t("cookie.hideDetails") : t("cookie.showDetails")}
          </button>
          <button type="button" className="cookie-btn-primary" onClick={handleAck}>
            {t("cookie.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
