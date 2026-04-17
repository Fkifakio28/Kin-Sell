import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { AuthShell } from "./AuthShell";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { ApiError, auth as authApi } from "../../lib/api-client";
import { TurnstileWidget } from "../../components/TurnstileWidget";

type ProfileType = "user" | "business";
type RegisterTab = "email" | "telephone";

const rememberedRoleKey = "kin-sell.auth.role";

function getErrorMessage(error: unknown, t: (k: string) => string): string {
  if (error instanceof ApiError && error.data && typeof error.data === "object" && "error" in error.data) {
    const message = (error.data as { error?: unknown }).error;
    if (typeof message === "string") return message;
  }
  if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
    return t("auth.serverError");
  }
  if (error instanceof ApiError) return t("auth.httpError").replace("{status}", String(error.status));
  if (error instanceof Error) return error.message;
  return t("auth.registerGenericError");
}

function getRedirectPath(role: string): string {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "/admin/dashboard";
  return role === "BUSINESS" ? "/business/dashboard" : "/account";
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, isLoggedIn, isLoading, user, refreshUser } = useAuth();
  const { t } = useLocaleCurrency();
  const [tab, setTab] = useState<RegisterTab>("email");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileType, setProfileType] = useState<ProfileType>(() => {
    return (localStorage.getItem(rememberedRoleKey) as ProfileType | null) ?? "user";
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socialMessage, setSocialMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cfToken, setCfToken] = useState("");

  // Terms acceptance
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Phone registration state
  const [phone, setPhone] = useState("");
  const [phoneDisplayName, setPhoneDisplayName] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerificationId, setOtpVerificationId] = useState("");
  const [otpResendAt, setOtpResendAt] = useState(0);
  const [otpCountdown, setOtpCountdown] = useState(0);

  const handleTurnstileToken = useCallback((token: string) => setCfToken(token), []);

  useEffect(() => {
    if (!isLoading && isLoggedIn && user) {
      navigate(getRedirectPath(user.role), { replace: true });
    }
  }, [isLoading, isLoggedIn, navigate, user]);

  const helperText = useMemo(() => {
    return profileType === "business"
      ? t("auth.registerHelperBusiness")
      : t("auth.registerHelperUser");
  }, [profileType, t]);

  useEffect(() => {
    if (otpResendAt <= 0) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((otpResendAt - Date.now()) / 1000));
      setOtpCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [otpResendAt]);

  const handleSocialClick = async (provider: "google" | "facebook" | "apple") => {
    setErrorMessage(null);
    if (provider === "google" || provider === "apple") {
      const apiBase = import.meta.env.VITE_API_URL ?? "/api";
      const authUrl = `${apiBase}/auth/${provider}${Capacitor.isNativePlatform() ? "?source=app" : ""}`;
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: authUrl });
      } else {
        window.location.href = authUrl;
      }
      return;
    }
    setSocialMessage(t("auth.socialRegisterReady").replace("{provider}", "Facebook"));
  };

  const handleSendOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (!phone.trim()) { setErrorMessage(t("auth.phoneRequired")); return; }
    if (!phoneDisplayName.trim()) { setErrorMessage("Nom d'affichage requis."); return; }
    if (!acceptedTerms) { setErrorMessage(t("auth.termsCheckbox.required")); return; }
    setIsSubmitting(true);
    try {
      const res = await authApi.requestOtp({ phone: phone.trim() });
      setOtpVerificationId(res.verificationId);
      setOtpSent(true);
      setOtpResendAt(Date.now() + res.resendAfterSeconds * 1000);
      if (res.previewCode) setSocialMessage(`[DEV] Code OTP : ${res.previewCode}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (otpCode.length !== 6) { setErrorMessage(t("auth.code6digits")); return; }
    setIsSubmitting(true);
    try {
      const result = await authApi.verifyOtp({
        verificationId: otpVerificationId,
        code: otpCode,
        phone: phone.trim(),
        displayName: phoneDisplayName.trim(),
        accountType: profileType === "business" ? "BUSINESS" : "USER",
      });
      localStorage.setItem(rememberedRoleKey, profileType);
      await refreshUser();
      navigate(getRedirectPath(result.user.role), { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    setErrorMessage(null);
    setSocialMessage(null);
    try {
      const res = await authApi.requestOtp({ phone: phone.trim() });
      setOtpVerificationId(res.verificationId);
      setOtpResendAt(Date.now() + res.resendAfterSeconds * 1000);
      if (res.previewCode) setSocialMessage(`[DEV] Code : ${res.previewCode}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t));
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSocialMessage(null);

    if (!acceptedTerms) {
      setErrorMessage(t("auth.termsCheckbox.required"));
      return;
    }

    if (password.length < 8) {
      setErrorMessage(t("auth.passwordMinError"));
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(t("auth.passwordMismatch"));
      return;
    }

    setIsSubmitting(true);

    try {
      const nextUser = await register(email.trim().toLowerCase(), password, displayName.trim(), profileType === "business" ? "BUSINESS" : "USER", cfToken);
      localStorage.setItem(rememberedRoleKey, profileType);
      navigate(getRedirectPath(nextUser.role), { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow={t("auth.registerEyebrow")}
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      dividerText={t("auth.registerDivider")}
      role={profileType}
      onRoleChange={setProfileType}
      socialMessage={socialMessage}
      onSocialClick={handleSocialClick}
    >
      <div className="auth-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "email"}
          className={`auth-tab${tab === "email" ? " auth-tab--active" : ""}`}
          onClick={() => { setTab("email"); setErrorMessage(null); setOtpSent(false); setOtpCode(""); }}>
          {t("auth.tabEmail")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "telephone"}
          className={`auth-tab${tab === "telephone" ? " auth-tab--active" : ""}`}
          onClick={() => { setTab("telephone"); setErrorMessage(null); }}>
          {t("auth.tabPhone")}
        </button>
      </div>

      {tab === "email" && (
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-helper-text">{helperText}</div>

          <div className="auth-field-group">
            <label htmlFor="register-display-name" className="auth-label">{t("auth.displayNameLabel")}</label>
            <input
              id="register-display-name"
              type="text"
              className="auth-input"
              placeholder={t("auth.displayNamePlaceholder")}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="auth-field-group">
            <label htmlFor="register-email" className="auth-label">{t("auth.emailLabel")}</label>
            <input
              id="register-email"
              type="email"
              className="auth-input"
              placeholder={t("auth.emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field-grid">
            <div className="auth-field-group">
              <label htmlFor="register-password" className="auth-label">{t("auth.passwordLabel")}</label>
              <div className="auth-input-group">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  className="auth-input auth-input--with-toggle"
                  placeholder={t("auth.passwordHint")}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                      <circle cx="12" cy="12" r="3" />
                      <line x1="4" y1="20" x2="20" y2="4" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="auth-field-group">
              <label htmlFor="register-confirm-password" className="auth-label">{t("auth.confirmLabel")}</label>
              <div className="auth-input-group">
                <input
                  id="register-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  className="auth-input auth-input--with-toggle"
                  placeholder={t("auth.confirmPlaceholder")}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-input-toggle"
                  aria-label={showConfirmPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                >
                  {showConfirmPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                      <circle cx="12" cy="12" r="3" />
                      <line x1="4" y1="20" x2="20" y2="4" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

          <label className="auth-checkbox-label" htmlFor="register-terms">
            <input
              type="checkbox"
              id="register-terms"
              className="auth-checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
            />
            <span className="auth-checkbox-text">
              {t("auth.termsCheckbox.prefix")}{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="auth-checkbox-link">{t("auth.termsCheckbox.termsLink")}</a>
              {" "}{t("auth.termsCheckbox.and")}{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="auth-checkbox-link">{t("auth.termsCheckbox.privacyLink")}</a>.
            </span>
          </label>

          <TurnstileWidget onToken={handleTurnstileToken} />

          <button type="submit" className="auth-submit-button" disabled={isSubmitting || isLoading || !acceptedTerms || !cfToken}>
            {isSubmitting ? t("auth.creating") : t("auth.createAccount")}
          </button>

          <div className="auth-actions-row">
            <a href="/login" className="auth-secondary-link">{t("auth.alreadyHaveAccount")}</a>
            <a href="/explorer" className="auth-secondary-link auth-secondary-link--muted">{t("auth.continueVisitor")}</a>
          </div>
        </form>
      )}

      {tab === "telephone" && !otpSent && (
        <form className="auth-form" onSubmit={handleSendOtp}>
          <div className="auth-helper-text">
            Créez votre compte avec votre numéro de téléphone. Un code SMS sera envoyé pour vérification.
          </div>

          <div className="auth-field-group">
            <label htmlFor="register-phone-name" className="auth-label">{t("auth.displayNameLabel")}</label>
            <input
              id="register-phone-name"
              type="text"
              className="auth-input"
              placeholder={t("auth.displayNamePlaceholder")}
              value={phoneDisplayName}
              onChange={(e) => setPhoneDisplayName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="auth-field-group">
            <label htmlFor="register-phone" className="auth-label">{t("auth.phoneLabel")}</label>
            <input
              id="register-phone"
              type="tel"
              className="auth-input"
              placeholder="+243 8XX XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />
          </div>

          {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

          <label className="auth-checkbox-label" htmlFor="register-terms-phone">
            <input
              type="checkbox"
              id="register-terms-phone"
              className="auth-checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
            />
            <span className="auth-checkbox-text">
              {t("auth.termsCheckbox.prefix")}{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="auth-checkbox-link">{t("auth.termsCheckbox.termsLink")}</a>
              {" "}{t("auth.termsCheckbox.and")}{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="auth-checkbox-link">{t("auth.termsCheckbox.privacyLink")}</a>.
            </span>
          </label>

          <button type="submit" className="auth-submit-button" disabled={isSubmitting || !acceptedTerms}>
            {isSubmitting ? t("auth.sendingOtp") : t("auth.receiveCode")}
          </button>

          <div className="auth-actions-row">
            <a href="/login" className="auth-secondary-link">{t("auth.alreadyHaveAccount")}</a>
            <a href="/explorer" className="auth-secondary-link auth-secondary-link--muted">{t("auth.continueVisitor")}</a>
          </div>
        </form>
      )}

      {tab === "telephone" && otpSent && (
        <form className="auth-form" onSubmit={handleVerifyOtp}>
          <div className="auth-helper-text">
            {t("auth.codeSentTo")} <strong>{phone}</strong>. {t("auth.checkSms")}
          </div>

          <div className="auth-field-group">
            <label htmlFor="register-otp" className="auth-label">{t("auth.otpLabel")}</label>
            <input
              id="register-otp"
              type="text"
              inputMode="numeric"
              className="auth-input auth-input--otp"
              placeholder="000000"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              required
            />
          </div>

          {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

          <button type="submit" className="auth-submit-button" disabled={isSubmitting || otpCode.length !== 6}>
            {isSubmitting ? t("auth.verifying") : t("auth.confirmCode")}
          </button>

          <div className="auth-row auth-row--between" style={{ marginTop: 8 }}>
            <button type="button" className="auth-link-button"
              onClick={() => { setOtpSent(false); setOtpCode(""); setErrorMessage(null); }}>
              {t("auth.changeNumber")}
            </button>
            <button type="button" className="auth-link-button" disabled={otpCountdown > 0} onClick={handleResendOtp}>
              {otpCountdown > 0 ? `${t("auth.resendIn")} (${otpCountdown}s)` : t("auth.resendCode")}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
