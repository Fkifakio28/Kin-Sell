import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "./AuthShell";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { ApiError } from "../../lib/api-client";

type ProfileType = "user" | "business";

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
  const { register, isLoggedIn, isLoading, user } = useAuth();
  const { t } = useLocaleCurrency();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileType, setProfileType] = useState<ProfileType>(() => {
    return (localStorage.getItem(rememberedRoleKey) as ProfileType | null) ?? "user";
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [socialMessage, setSocialMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSocialClick = (provider: "google" | "facebook" | "apple") => {
    const labels = {
      google: "Google",
      facebook: "Facebook",
      apple: "Apple / iCloud",
    } as const;

    setErrorMessage(null);
    setSocialMessage(t("auth.socialRegisterReady").replace("{provider}", labels[provider]));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSocialMessage(null);

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
      const nextUser = await register(email.trim().toLowerCase(), password, displayName.trim(), profileType === "business" ? "BUSINESS" : "USER");
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
            <input
              id="register-password"
              type="password"
              className="auth-input"
              placeholder={t("auth.passwordHint")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="auth-field-group">
            <label htmlFor="register-confirm-password" className="auth-label">{t("auth.confirmLabel")}</label>
            <input
              id="register-confirm-password"
              type="password"
              className="auth-input"
              placeholder={t("auth.confirmPlaceholder")}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
        </div>

        {errorMessage ? <div className="auth-error">{errorMessage}</div> : null}

        <button type="submit" className="auth-submit-button" disabled={isSubmitting || isLoading}>
          {isSubmitting ? t("auth.creating") : t("auth.createAccount")}
        </button>

        <div className="auth-actions-row">
          <a href="/login" className="auth-secondary-link">{t("auth.alreadyHaveAccount")}</a>
          <a href="/explorer" className="auth-secondary-link auth-secondary-link--muted">{t("auth.continueVisitor")}</a>
        </div>
      </form>
    </AuthShell>
  );
}