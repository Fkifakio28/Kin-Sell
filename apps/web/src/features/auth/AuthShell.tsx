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
  onSocialClick: (provider: "google" | "facebook") => void;
  children: ReactNode;
};

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21.805 12.23c0-.79-.064-1.364-.202-1.96H12.24v3.702h5.496c-.11.92-.706 2.306-2.03 3.237l-.019.124 2.96 2.247.205.02c1.88-1.704 2.953-4.214 2.953-7.37Z" fill="#4285F4" />
    <path d="M12.24 21.75c2.693 0 4.95-.867 6.6-2.35l-3.146-2.39c-.843.574-1.975.976-3.454.976-2.637 0-4.876-1.703-5.671-4.057l-.12.01-3.078 2.333-.041.113c1.64 3.184 5.02 5.365 8.91 5.365Z" fill="#34A853" />
    <path d="M6.57 13.93a5.85 5.85 0 0 1-.332-1.93c0-.674.12-1.327.322-1.93l-.006-.129-3.118-2.37-.102.047A9.61 9.61 0 0 0 2.32 12c0 1.532.377 2.979 1.046 4.257l3.204-2.327Z" fill="#FBBC05" />
    <path d="M12.24 6.015c1.864 0 3.123.79 3.842 1.45l2.803-2.672C17.17 3.26 14.933 2.25 12.24 2.25c-3.89 0-7.27 2.18-8.91 5.365l3.226 2.451c.804-2.354 3.044-4.05 5.681-4.05Z" fill="#EA4335" />
  </svg>
);

const FacebookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.026 4.388 11.022 10.125 11.927v-8.437H7.078v-3.49h3.047V9.412c0-3.029 1.792-4.702 4.533-4.702 1.313 0 2.686.236 2.686.236v2.973H15.83c-1.491 0-1.956.931-1.956 1.887v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.095 24 18.099 24 12.073Z" fill="#1877F2" />
    <path d="M16.671 15.563l.532-3.49h-3.328V9.806c0-.956.465-1.887 1.956-1.887h1.513V4.946s-1.373-.236-2.686-.236c-2.74 0-4.533 1.673-4.533 4.702v2.661H7.078v3.49h3.047V24a12.2 12.2 0 0 0 3.75 0v-8.437h2.796Z" fill="#fff" />
  </svg>
);

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  dividerText,
  role,
  onRoleChange,
  socialMessage,
  onSocialClick,
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
            <img src="/assets/kin-sell/logo-kinsell.png" alt="Kin-Sell" className="auth-brand-logo" />
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

          <div className="auth-socials">
            <button type="button" className="auth-social-button auth-social-button--google" onClick={() => onSocialClick("google")}>
              <GoogleIcon />
              <span>{t("auth.socialGoogle")}</span>
            </button>
            <button type="button" className="auth-social-button auth-social-button--facebook" onClick={() => onSocialClick("facebook")}>
              <FacebookIcon />
              <span>{t("auth.socialFacebook")}</span>
            </button>
          </div>

          {socialMessage ? <div className="auth-inline-note">{socialMessage}</div> : null}

          <div className="auth-divider" aria-hidden="true">
            <span>{dividerText}</span>
          </div>

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