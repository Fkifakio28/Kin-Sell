import React from "react";
import { Link } from "react-router-dom";
import { useLocaleCurrency, type AppCurrency, type AppLanguage } from "../app/providers/LocaleCurrencyProvider";
import { useTheme } from "../app/providers/ThemeProvider";

const LANGUAGES: { code: AppLanguage; flag: string; label: string }[] = [
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "ln", flag: "🇨🇩", label: "Lingala" },
];

const CURRENCIES: { code: AppCurrency; symbol: string; label: string }[] = [
  { code: "CDF", symbol: "FC", label: "Franc Congolais" },
  { code: "USD", symbol: "$", label: "Dollar US" },
  { code: "EUR", symbol: "€", label: "Euro" },
];

const USEFUL_LINKS = [
  { labelKey: "nav.about",        href: "/about" },
  { labelKey: "nav.plans", href: "/forfaits" },
  { labelKey: "nav.terms", href: "/terms" },
  { labelKey: "nav.guide", href: "/guide" },
  { labelKey: "nav.howItWorks",      href: "/how-it-works" },
  { labelKey: "nav.privacy",  href: "/privacy" },
  { labelKey: "nav.faq",                    href: "/faq" },
  { labelKey: "nav.contact",                href: "/contact" },
];

export function Footer() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, currency, setCurrency, t } = useLocaleCurrency();

  return (
    <footer className="ks-footer">
      <div className="ks-footer-inner">

        {/* ── Colonne gauche : réseaux sociaux ── */}
        <div className="ks-footer-col ks-footer-col--left">
          <p className="ks-footer-title">{t("footer.social")}</p>

          <div className="ks-social-row">
            <a href="https://web.facebook.com/profile.php?id=61576537875599" className="ks-social-btn" aria-label="Facebook" title="Facebook" target="_blank" rel="noopener noreferrer">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
            <a href="https://www.instagram.com/kin.sell/" className="ks-social-btn" aria-label="Instagram" title="Instagram" target="_blank" rel="noopener noreferrer">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
            <a href="https://x.com/Kinsell_marketP" className="ks-social-btn" aria-label="X (Twitter)" title="X" target="_blank" rel="noopener noreferrer">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://www.linkedin.com/in/kin-sell-marketplace/" className="ks-social-btn" aria-label="LinkedIn" title="LinkedIn" target="_blank" rel="noopener noreferrer">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
            <a href="https://www.tiktok.com/@kinsell1" className="ks-social-btn" aria-label="TikTok" title="TikTok" target="_blank" rel="noopener noreferrer">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.82a8.18 8.18 0 0 0 4.79 1.53V6.88a4.85 4.85 0 0 1-1.02-.19z"/></svg>
            </a>
            <a href="https://www.reddit.com/user/Kin-sell/" className="ks-social-btn" aria-label="Reddit" title="Reddit" target="_blank" rel="noopener noreferrer">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.385 4.859-7.181 4.859-3.796 0-7.182-2.165-7.182-4.859a3.5 3.5 0 0 1 .476-1.565c-.543-.375-.923-.998-.923-1.71 0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.53l.847-4.061c.057-.274.243-.485.513-.545l3.8-.822c.151.649.848 1.17 1.693 1.17.955 0 1.74-.75 1.74-1.682 0-.932-.75-1.682-1.74-1.682-.722 0-1.333.468-1.605 1.123l-3.776.837c-.751.042-1.45.379-1.98.999-.565-.143-1.14-.213-1.723-.213-2.773 0-5.141 1.56-5.141 3.501 0 1.634.858 3.034 2.147 3.85-.13.584-.204 1.194-.204 1.829 0 3.7 3.385 6.734 7.181 6.734 3.797 0 7.182-3.034 7.182-6.734 0-.646-.075-1.279-.211-1.881 1.331-.81 2.201-2.204 2.201-3.857 0-.968-.786-1.754-1.754-1.754-.279 0-.548.057-.802.156-.071-.106-.147-.203-.237-.284.074-.171.167-.341.273-.496a1.75 1.75 0 0 0 .12-1.671c-.194-.577-.651-.986-1.218-.986-.532 0-.99.29-1.23.743-.243.421-.37.981-.37 1.571 0 .947.316 1.831.899 2.546-1.348-1.006-3.106-1.625-5.036-1.625-1.932 0-3.69.622-5.037 1.625.582-.715.898-1.599.898-2.546 0-.59-.127-1.15-.37-1.571-.24-.453-.698-.743-1.23-.743-.567 0-1.024.409-1.218.986a1.75 1.75 0 0 0 .12 1.671c.106.155.199.325.273.496-.09.081-.166.178-.237.284-.254-.099-.523-.156-.802-.156z"/></svg>
            </a>
          </div>

          {/* Logo */}
          <div className="ks-footer-logo-wrap">
            <img
              src="/assets/kin-sell/Logo%20Kin-Sell.png"
              alt="Kin-Sell"
              className="ks-footer-logo"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <span className="ks-footer-brand">Kin-Sell</span>
          </div>

          {/* Barre de langue */}
          <div className="ks-selector-row" role="group" aria-label={t("footer.language")}>
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                className={`ks-selector-btn${language === l.code ? " active" : ""}`}
                onClick={() => setLanguage(l.code)}
                title={l.label}
                aria-pressed={language === l.code}
              >
                {l.flag}
              </button>
            ))}
          </div>

          {/* Barre de devise */}
          <div className="ks-selector-row" role="group" aria-label={t("footer.currency")}>
            {CURRENCIES.map(c => (
              <button
                key={c.code}
                className={`ks-selector-btn${currency === c.code ? " active" : ""}`}
                onClick={() => setCurrency(c.code)}
                title={c.label}
                aria-pressed={currency === c.code}
              >
                {c.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* ── Colonne centre : coordonnées ── */}
        <div className="ks-footer-col ks-footer-col--center">
          <p className="ks-footer-title">{t("footer.contacts")}</p>

          <ul className="ks-contact-list">
            <li className="ks-contact-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <a href="mailto:contact@kin-sel.com">contact@kin-sel.com</a>
            </li>
            <li className="ks-contact-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.58 4.92 2 2 0 0 1 3.54 2.72h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 10.2a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>+243 000 000 000</span>
            </li>
            <li className="ks-contact-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>Kinshasa, RDC</span>
            </li>
          </ul>

          {/* Toggle thème — caché temporairement, à revoir plus tard */}
          {/* <button className="ks-theme-toggle" onClick={toggleTheme} aria-label={t("footer.themeAria")}>
            {theme === "dark" ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                {t("footer.themeLight")}
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                {t("footer.themeDark")}
              </>
            )}
          </button> */}
        </div>

        {/* ── Colonne droite : liens utiles ── */}
        <div className="ks-footer-col ks-footer-col--right">
          <p className="ks-footer-title">{t("footer.links")}</p>
          <ul className="ks-footer-links">
            {USEFUL_LINKS.map(link => (
              <li key={link.href}>
                <Link to={link.href} className="ks-footer-link">{t(link.labelKey)}</Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bas de footer */}
      <div className="ks-footer-bottom">
        <span>© {new Date().getFullYear()} Kin-Sell. {t("footer.rights")}</span>
      </div>
    </footer>
  );
}
