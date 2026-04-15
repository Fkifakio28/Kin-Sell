import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { AuthShell } from "./AuthShell";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { ApiError, auth as authApi } from "../../lib/api-client";
import { TurnstileWidget } from "../../components/TurnstileWidget";

type LoginTab = "identifiant" | "telephone";
type LoginStep = "credentials" | "totp" | "otp";

const rememberedIdentifierKey = "kin-sell.auth.identifier";

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
  return t("auth.genericError");
}

function getRedirectPath(role: string): string {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return "/admin/dashboard";
  if (role === "BUSINESS") return "/business/dashboard";
  return "/";
}

export function LoginPage() {
  const navigate = useNavigate();
  const { isLoggedIn, isLoading, user, login, refreshUser } = useAuth();
  const { t } = useLocaleCurrency();

  // Onglet actif
  const [tab, setTab] = useState<LoginTab>("identifiant");
  const [step, setStep] = useState<LoginStep>("credentials");

  // Identifiants classiques
  const [identifier, setIdentifier] = useState(() => localStorage.getItem(rememberedIdentifierKey) ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(Boolean(localStorage.getItem(rememberedIdentifierKey)));

  // OTP Téléphone
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerificationId, setOtpVerificationId] = useState("");
  const [otpResendAt, setOtpResendAt] = useState(0);
  const [otpCountdown, setOtpCountdown] = useState(0);

  // TOTP 2FA step
  const [totpChallenge, setTotpChallenge] = useState("");
  const [totpCode, setTotpCode] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socialMessage, setSocialMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cfToken, setCfToken] = useState("");

  const handleTurnstileToken = useCallback((token: string) => setCfToken(token), []);

  const totpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && isLoggedIn && user) {
      navigate(getRedirectPath(user.role), { replace: true });
    }
  }, [isLoading, isLoggedIn, navigate, user]);

  // Countdown OTP resend
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

  // Focus auto sur le champ TOTP quand on arrive sur cette étape
  useEffect(() => {
    if (step === "totp") {
      setTimeout(() => totpInputRef.current?.focus(), 100);
    }
  }, [step]);

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
    setSocialMessage(t("auth.socialReady").replace("{provider}", "Facebook"));
  };

  // �"?�"? Connexion email/identifiant �"?�"?
  const handleSubmitIdentifiant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSocialMessage(null);

    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      setErrorMessage(t("auth.identifierRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const nextUser = await login(normalizedIdentifier.toLowerCase(), password, cfToken);
      if (rememberMe) {
        localStorage.setItem(rememberedIdentifierKey, normalizedIdentifier);
      } else {
        localStorage.removeItem(rememberedIdentifierKey);
      }
      navigate(getRedirectPath(nextUser.role), { replace: true });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "TOTP_REQUIRED") {
        setTotpChallenge((error as Error & { challengeToken: string }).challengeToken);
        setStep("totp");
        setIsSubmitting(false);
        return;
      }
      setErrorMessage(getErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  // �"?�"? Vérification code TOTP �"?�"?
  const handleTotpVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (totpCode.length !== 6 || !/^\d+$/.test(totpCode)) {
      setErrorMessage(t("auth.code6digits"));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await authApi.totpChallenge(totpChallenge, totpCode);
      await refreshUser();
      navigate(getRedirectPath(result.user.role), { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  // �"?�"? Envoi OTP téléphone �"?�"?
  const handleSendOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (!phone.trim()) {
      setErrorMessage(t("auth.phoneRequired"));
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await authApi.requestOtp({ phone: phone.trim() });
      setOtpVerificationId(res.verificationId);
      setOtpSent(true);
      setOtpResendAt(Date.now() + res.resendAfterSeconds * 1000);
      if (res.previewCode) {
        setSocialMessage(`[DEV] Code OTP : ${res.previewCode}`);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  // �"?�"? Vérification OTP téléphone �"?�"?
  const handleVerifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (otpCode.length !== 6) {
      setErrorMessage(t("auth.code6digits"));
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await authApi.verifyOtp({
        verificationId: otpVerificationId,
        code: otpCode,
        phone: phone.trim(),
      });
      await refreshUser();
      navigate(getRedirectPath(result.user.role), { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  // �"?�"? Renvoyer OTP �"?�"?
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

  // �"?�"? Step TOTP �"?�"?
  if (step === "totp") {
    return (
      <AuthShell
        eyebrow={t("auth.totpEyebrow")}
        title={t("auth.totpTitle")}
        subtitle={t("auth.totpSubtitle")}
        socialMessage={null}
        onSocialClick={handleSocialClick}
      >
        <form className="auth-form" onSubmit={handleTotpVerify}>
          <div className="auth-field-group">
            <label htmlFor="totp-code" className="auth-label">{t("auth.totpLabel")}</label>
            <input
              id="totp-code"
              ref={totpInputRef}
              type="text"
              inputMode="numeric"
              className="auth-input auth-input--otp"
              placeholder="000000"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              required
            />
          </div>

          {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

          <button type="submit" className="auth-submit-button" disabled={isSubmitting || totpCode.length !== 6}>
            {isSubmitting ? t("auth.verifying") : t("common.confirm")}
          </button>

          <button
            type="button"
            className="auth-link-button"
            style={{ marginTop: 8 }}
            onClick={() => { setStep("credentials"); setTotpCode(""); setErrorMessage(null); }}
          >
            {t("auth.backToLogin")}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow={t("auth.loginEyebrow")}
      title={t("auth.loginTitle")}
      subtitle={t("auth.loginSubtitle")}
      dividerText={t("auth.loginDivider")}
      socialMessage={socialMessage}
      onSocialClick={handleSocialClick}
    >
      {/* Onglets Email / Téléphone */}
      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "identifiant"}
          className={`auth-tab${tab === "identifiant" ? " auth-tab--active" : ""}`}
          onClick={() => { setTab("identifiant"); setErrorMessage(null); setOtpSent(false); setOtpCode(""); }}
        >
          {t("auth.tabEmail")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "telephone"}
          className={`auth-tab${tab === "telephone" ? " auth-tab--active" : ""}`}
          onClick={() => { setTab("telephone"); setErrorMessage(null); }}
        >
          {t("auth.tabPhone")}
        </button>
      </div>

      {/* �"?�"? Onglet Email/Identifiant �"?�"? */}
      {tab === "identifiant" && (
        <form className="auth-form" onSubmit={handleSubmitIdentifiant}>
          <div className="auth-field-group">
            <label htmlFor="login-identifier" className="auth-label">{t("auth.identifierLabel")}</label>
            <input
              id="login-identifier"
              type="text"
              className="auth-input"
              placeholder={t("auth.identifierPlaceholder")}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="auth-field-group">
            <label htmlFor="login-password" className="auth-label">{t("auth.passwordLabel")}</label>
            <div className="auth-input-group">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                className="auth-input auth-input--with-toggle"
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
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

          <div className="auth-row auth-row--between">
            <label className="auth-checkbox">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>{t("auth.rememberMe")}</span>
            </label>
            <a href="/forgot-password" className="auth-link-button">
              {t("auth.forgotPassword")}
            </a>
          </div>

          {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

          <TurnstileWidget onToken={handleTurnstileToken} />

          <button type="submit" className="auth-submit-button" disabled={isSubmitting || isLoading}>
            {isSubmitting ? t("auth.loggingIn") : t("auth.loginBtn")}
          </button>

          <div className="auth-actions-row">
            <a href="/register" className="auth-secondary-link">{t("common.signup")}</a>
            <a href="/explorer" className="auth-secondary-link auth-secondary-link--muted">{t("auth.continueVisitor")}</a>
          </div>
        </form>
      )}

      {/* �"?�"? Onglet Téléphone (OTP) �"?�"? */}
      {tab === "telephone" && !otpSent && (
        <form className="auth-form" onSubmit={handleSendOtp}>
          <div className="auth-helper-text">{t("auth.otpHelper")}</div>

          <div className="auth-field-group">
            <label htmlFor="login-phone" className="auth-label">{t("auth.phoneLabel")}</label>
            <input
              id="login-phone"
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

          <button type="submit" className="auth-submit-button" disabled={isSubmitting}>
            {isSubmitting ? t("auth.sendingOtp") : t("auth.receiveCode")}
          </button>

          <div className="auth-actions-row">
            <a href="/register" className="auth-secondary-link">{t("common.signup")}</a>
          </div>
        </form>
      )}

      {tab === "telephone" && otpSent && (
        <form className="auth-form" onSubmit={handleVerifyOtp}>
          <div className="auth-helper-text">
            {t("auth.codeSentTo")} <strong>{phone}</strong>. {t("auth.checkSms")}
          </div>

          <div className="auth-field-group">
            <label htmlFor="login-otp" className="auth-label">{t("auth.otpLabel")}</label>
            <input
              id="login-otp"
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
            <button
              type="button"
              className="auth-link-button"
              onClick={() => { setOtpSent(false); setOtpCode(""); setErrorMessage(null); }}
            >
              {t("auth.changeNumber")}
            </button>
            <button
              type="button"
              className="auth-link-button"
              disabled={otpCountdown > 0}
              onClick={handleResendOtp}
            >
              {otpCountdown > 0 ? `${t("auth.resendIn")} (${otpCountdown}s)` : t("auth.resendCode")}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
