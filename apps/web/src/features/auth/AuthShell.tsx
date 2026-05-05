import type { ReactNode } from "react";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import "./auth.css";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  dividerText?: string;
  role?: "user" | "business";
  onRoleChange?: (role: "user" | "business") => void;
  socialMessage: string | null;
  onSocialClick: (provider: "google" | "apple") => void;
  children: ReactNode;
};

// Icônes Google/Apple supprimées : auth simple email + mot de passe.

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  dividerText: _dividerText,
  role,
  onRoleChange,
  socialMessage,
  onSocialClick: _onSocialClick,
  children,
}: AuthShellProps) {
  const { t } = useLocaleCurrency();
  return (
    <div className="auth-page">
      <section className="auth-visual-panel">
        <div className="auth-visual-media" />
        <div className="auth-visual-overlay" />
        <div className="auth-visual-copy">
          <span className="auth-eyebrow">{t("auth.shellVision")}</span>
          <h1 className="auth-visual-title">{t("auth.shellTitle")}</h1>
          <p className="auth-visual-text">
            {t("auth.shellText")}
          </p>
          <div className="auth-visual-stats">
            <div className="auth-stat glass-card">
              <strong>{t("auth.shellStat1Title")}</strong>
              <span>{t("auth.shellStat1Desc")}</span>
            </div>
            <div className="auth-stat glass-card">
              <strong>{t("auth.shellStat2Title")}</strong>
              <span>{t("auth.shellStat2Desc")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card glass-container">
          <div className="auth-card-glow" aria-hidden="true" />
          <a href="/" className="auth-brand" aria-label={t("auth.backToHome")}>
            <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" className="auth-brand-logo" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div>
              <span className="auth-brand-name">Kin-Sell</span>
              <span className="auth-brand-tag">{t("auth.shellBrandTag")}</span>
            </div>
          </a>

          <div className="auth-copy">
            <span className="auth-form-eyebrow">{eyebrow}</span>
            <h2 className="auth-title">{title}</h2>
            <p className="auth-subtitle">{subtitle}</p>
          </div>

          <div className="auth-role-switch" role="radiogroup" aria-label={t("auth.roleAriaLabel")} style={role == null ? { display: "none" } : undefined}>
            <span className="auth-role-label">{t("auth.roleLabel")}</span>
            <div className="auth-role-buttons">
              <button
                type="button"
                className={`auth-role-button${role === "user" ? " auth-role-button--active" : ""}`}
                onClick={() => onRoleChange?.("user")}
                aria-pressed={role === "user"}
              >
                {t("auth.roleUser")}
              </button>
              <button
                type="button"
                className={`auth-role-button${role === "business" ? " auth-role-button--active" : ""}`}
                onClick={() => onRoleChange?.("business")}
                aria-pressed={role === "business"}
              >
                {t("auth.roleBusiness")}
              </button>
            </div>
          </div>

          {/* Social login (Google/Apple/Facebook) désactivé : auth simple email + mot de passe.
              Boutons masqués volontairement — props onSocialClick / dividerText conservés
              pour compatibilité avec LoginPage/RegisterPage. */}

          {socialMessage ? <div className="auth-inline-note">{socialMessage}</div> : null}

          {children}

          <div className="auth-trust glass-card">
            <span className="auth-trust-dot" aria-hidden="true" />
            <span>{t("auth.shellSecure")}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
