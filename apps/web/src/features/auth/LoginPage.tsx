import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { AuthShell } from "./AuthShell";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { ApiError, auth as authApi } from "../../lib/api-client";
import { TurnstileWidget } from "../../components/TurnstileWidget";

type ProfileType = "user" | "business";
type LoginTab = "identifiant" | "telephone";
type LoginStep = "credentials" | "totp" | "otp";

const rememberedRoleKey = "kin-sell.auth.role";
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
  return role === "BUSINESS" ? "/business/dashboard" : "/account";
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
  const [rememberMe, setRememberMe] = useState(Boolean(localStorage.getItem(rememberedIdentifierKey)));
  const [profileType, setProfileType] = useState<ProfileType>(() => {
    return (localStorage.getItem(rememberedRoleKey) as ProfileType | null) ?? "user";
  });

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

  const helperText = useMemo(() => {
    return profileType === "business"
      ? t("auth.helperBusiness")
      : t("auth.helperUser");
  }, [profileType, t]);

  const handleSocialClick = async (provider: "google" | "facebook") => {
    setErrorMessage(null);
    if (provider === "google") {
      const apiBase = import.meta.env.VITE_API_URL ?? "/api";
      const authUrl = `${apiBase}/auth/google${Capacitor.isNativePlatform() ? "?source=app" : ""}`;
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
      localStorage.setItem(rememberedRoleKey, profileType);
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
        accountType: profileType === "business" ? "BUSINESS" : "USER",
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
        role={profileType}
        onRoleChange={setProfileType}
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
      role={profileType}
      onRoleChange={setProfileType}
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
          <div className="auth-helper-text">{helperText}</div>

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
            <input
              id="login-password"
              type="password"
              className="auth-input"
              placeholder={t("auth.passwordPlaceholder")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="auth-row auth-row--between">
            <label className="auth-checkbox">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>{t("auth.rememberMe")}</span>
            </label>
            <button
              type="button"
              className="auth-link-button"
              onClick={() => { setSocialMessage(null); setErrorMessage(t("auth.forgotPasswordMsg")); }}
            >
              {t("auth.forgotPassword")}
            </button>
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
