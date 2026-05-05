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

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21.805 12.23c0-.79-.064-1.364-.202-1.96H12.24v3.702h5.496c-.11.92-.706 2.306-2.03 3.237l-.019.124 2.96 2.247.205.02c1.88-1.704 2.953-4.214 2.953-7.37Z" fill="#4285F4" />
    <path d="M12.24 21.75c2.693 0 4.95-.867 6.6-2.35l-3.146-2.39c-.843.574-1.975.976-3.454.976-2.637 0-4.876-1.703-5.671-4.057l-.12.01-3.078 2.333-.041.113c1.64 3.184 5.02 5.365 8.91 5.365Z" fill="#34A853" />
    <path d="M6.57 13.93a5.85 5.85 0 0 1-.332-1.93c0-.674.12-1.327.322-1.93l-.006-.129-3.118-2.37-.102.047A9.61 9.61 0 0 0 2.32 12c0 1.532.377 2.979 1.046 4.257l3.204-2.327Z" fill="#FBBC05" />
    <path d="M12.24 6.015c1.864 0 3.123.79 3.842 1.45l2.803-2.672C17.17 3.26 14.933 2.25 12.24 2.25c-3.89 0-7.27 2.18-8.91 5.365l3.226 2.451c.804-2.354 3.044-4.05 5.681-4.05Z" fill="#EA4335" />
  </svg>
);

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.53-3.23 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
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

          <div className="auth-socials">
            <button type="button" className="auth-social-button auth-social-button--google" onClick={() => onSocialClick("google")}>
              <GoogleIcon />
              <span>{t("auth.socialGoogle")}</span>
            </button>
            <button type="button" className="auth-social-button auth-social-button--apple" onClick={() => onSocialClick("apple")}>
              <AppleIcon />
              <span>{t("auth.socialApple")}</span>
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