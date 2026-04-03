import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthShell } from "./AuthShell";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { auth as authApi, ApiError } from "../../lib/api-client";

type Step = "email" | "code" | "newPassword" | "done";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.data && typeof error.data === "object" && "error" in error.data) {
    const message = (error.data as { error?: unknown }).error;
    if (typeof message === "string") return message;
  }
  if (error instanceof Error) return error.message;
  return "Une erreur est survenue.";
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { t } = useLocaleCurrency();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const handleRoleChange = useCallback(() => {}, []);
  const handleSocialClick = useCallback(() => {}, []);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email.trim()) { setErrorMessage("Veuillez entrer votre email."); return; }
    setIsSubmitting(true);
    try {
      const res = await authApi.requestPasswordReset(email.trim().toLowerCase());
      if (res.verificationId) setVerificationId(res.verificationId);
      if (res.previewCode) setDevCode(res.previewCode);
      setStep("code");
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (code.length !== 6) { setErrorMessage("Le code doit contenir 6 chiffres."); return; }
    setStep("newPassword");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (newPassword.length < 8) { setErrorMessage("Le mot de passe doit contenir au moins 8 caractères."); return; }
    if (newPassword !== confirmPassword) { setErrorMessage("Les mots de passe ne correspondent pas."); return; }
    setIsSubmitting(true);
    try {
      await authApi.confirmPasswordReset({ verificationId, code, newPassword });
      setStep("done");
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Récupération"
      title="Mot de passe oublié"
      subtitle="Réinitialisez votre mot de passe via votre email"
      role="user"
      onRoleChange={handleRoleChange}
      socialMessage={devCode ? `[DEV] Code : ${devCode}` : null}
      onSocialClick={handleSocialClick}
    >
      {step === "email" && (
        <form className="auth-form" onSubmit={handleRequestReset}>
          <div className="auth-helper-text">
            Entrez l'adresse email associée à votre compte. Nous vous enverrons un code de vérification.
          </div>
          <div className="auth-field-group">
            <label htmlFor="reset-email" className="auth-label">Email</label>
            <input
              id="reset-email"
              type="email"
              className="auth-input"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          {errorMessage && <div className="auth-error">{errorMessage}</div>}
          <button type="submit" className="auth-submit-button" disabled={isSubmitting}>
            {isSubmitting ? "Envoi..." : "Envoyer le code"}
          </button>
          <div className="auth-actions-row">
            <a href="/login" className="auth-secondary-link">← Retour à la connexion</a>
          </div>
        </form>
      )}

      {step === "code" && (
        <form className="auth-form" onSubmit={handleVerifyCode}>
          <div className="auth-helper-text">
            Un code à 6 chiffres a été envoyé à <strong>{email}</strong>. Vérifiez votre boîte mail (et les spams).
          </div>
          <div className="auth-field-group">
            <label htmlFor="reset-code" className="auth-label">Code de vérification</label>
            <input
              id="reset-code"
              type="text"
              inputMode="numeric"
              className="auth-input auth-input--otp"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              required
            />
          </div>
          {errorMessage && <div className="auth-error">{errorMessage}</div>}
          <button type="submit" className="auth-submit-button" disabled={code.length !== 6}>
            Vérifier le code
          </button>
          <button type="button" className="auth-link-button" style={{ marginTop: 8 }}
            onClick={() => { setStep("email"); setCode(""); setErrorMessage(null); }}>
            ← Changer d'email
          </button>
        </form>
      )}

      {step === "newPassword" && (
        <form className="auth-form" onSubmit={handleResetPassword}>
          <div className="auth-helper-text">
            Choisissez un nouveau mot de passe sécurisé (minimum 8 caractères).
          </div>
          <div className="auth-field-group">
            <label htmlFor="new-password" className="auth-label">Nouveau mot de passe</label>
            <input
              id="new-password"
              type="password"
              className="auth-input"
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <div className="auth-field-group">
            <label htmlFor="confirm-new-password" className="auth-label">Confirmer</label>
            <input
              id="confirm-new-password"
              type="password"
              className="auth-input"
              placeholder="Répétez le mot de passe"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          {errorMessage && <div className="auth-error">{errorMessage}</div>}
          <button type="submit" className="auth-submit-button" disabled={isSubmitting}>
            {isSubmitting ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="auth-form" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 8px" }}>
            Mot de passe réinitialisé !
          </p>
          <p style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", margin: "0 0 20px" }}>
            Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
          </p>
          <button type="button" className="auth-submit-button" onClick={() => navigate("/login", { replace: true })}>
            Se connecter
          </button>
        </div>
      )}
    </AuthShell>
  );
}
