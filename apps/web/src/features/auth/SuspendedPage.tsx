import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth as authApi } from "../../lib/api-client";
import { useAuth } from "../../app/providers/AuthProvider";

type Step = "info" | "appeal" | "appeal-sent";

export function SuspendedPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("info");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitAppeal = async () => {
    if (message.trim().length < 10) {
      setError("Merci d'expliquer votre situation (minimum 10 caractères).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.submitAppeal(message.trim());
      setStep("appeal-sent");
    } catch {
      setError("Une erreur est survenue. Réessayez dans quelques instants.");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="ks-suspended-page">
      <div className="ks-suspended-card glass-card">
        <div className="ks-suspended-icon">🚫</div>

        {step === "info" && (
          <>
            <h1 className="ks-suspended-title">Compte suspendu</h1>
            <p className="ks-suspended-body">
              Votre compte Kin-Sell a été suspendu et vous ne pouvez plus accéder aux services.
            </p>
            {user?.suspensionReason && (
              <div className="ks-suspended-reason">
                <span className="ks-suspended-reason-label">Motif de suspension :</span>
                <span className="ks-suspended-reason-text">{user.suspensionReason}</span>
              </div>
            )}
            <p className="ks-suspended-help">
              Si vous estimez que cette suspension est injustifiée, vous pouvez soumettre un appel.
              Notre équipe examinera votre demande dans les meilleurs délais.
            </p>
            <div className="ks-suspended-actions">
              <button
                type="button"
                className="ks-btn ks-btn--primary"
                onClick={() => setStep("appeal")}
              >
                ✉️ Faire appel
              </button>
              <button
                type="button"
                className="ks-btn ks-btn--ghost"
                onClick={handleLogout}
              >
                ← Retour à la connexion
              </button>
            </div>
          </>
        )}

        {step === "appeal" && (
          <>
            <h1 className="ks-suspended-title">Soumettre un appel</h1>
            <p className="ks-suspended-body">
              Expliquez pourquoi vous pensez que votre compte a été suspendu par erreur.
              Soyez précis et factuel.
            </p>
            <textarea
              className="ks-suspended-textarea"
              placeholder="Décrivez votre situation en détail…"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              maxLength={2000}
            />
            <div className="ks-suspended-char-count">{message.length} / 2000</div>
            {error && <div className="ks-suspended-error">{error}</div>}
            <div className="ks-suspended-actions">
              <button
                type="button"
                className="ks-btn ks-btn--primary"
                onClick={handleSubmitAppeal}
                disabled={busy}
              >
                {busy ? "Envoi…" : "Envoyer l'appel"}
              </button>
              <button
                type="button"
                className="ks-btn ks-btn--ghost"
                onClick={() => setStep("info")}
                disabled={busy}
              >
                ← Retour
              </button>
            </div>
          </>
        )}

        {step === "appeal-sent" && (
          <>
            <div className="ks-suspended-icon" style={{ fontSize: 48 }}>✅</div>
            <h1 className="ks-suspended-title">Appel soumis</h1>
            <p className="ks-suspended-body">
              Votre appel a bien été transmis à notre équipe de modération.
              Vous serez notifié dès qu'une décision sera prise.
            </p>
            <div className="ks-suspended-actions">
              <button
                type="button"
                className="ks-btn ks-btn--ghost"
                onClick={handleLogout}
              >
                ← Retour à la connexion
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .ks-suspended-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .ks-suspended-card {
          width: 100%;
          max-width: 520px;
          padding: 40px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
          border-radius: 20px;
        }
        .ks-suspended-icon {
          font-size: 56px;
          line-height: 1;
        }
        .ks-suspended-title {
          font-size: 1.6rem;
          font-weight: 700;
          color: var(--color-text-primary);
          margin: 0;
        }
        .ks-suspended-body {
          font-size: 0.95rem;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 0;
        }
        .ks-suspended-reason {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 12px;
          padding: 12px 16px;
          width: 100%;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ks-suspended-reason-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: #ef4444;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .ks-suspended-reason-text {
          font-size: 0.9rem;
          color: var(--color-text-primary);
        }
        .ks-suspended-help {
          font-size: 0.875rem;
          color: var(--color-text-muted, var(--color-text-secondary));
          line-height: 1.6;
          margin: 0;
        }
        .ks-suspended-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        .ks-btn {
          width: 100%;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: opacity 0.2s, transform 0.1s;
        }
        .ks-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .ks-btn--primary {
          background: var(--color-primary, #6f58ff);
          color: #fff;
        }
        .ks-btn--primary:not(:disabled):hover { opacity: 0.88; }
        .ks-btn--ghost {
          background: transparent;
          color: var(--color-text-secondary);
          border: 1px solid var(--color-border, rgba(255,255,255,0.15));
        }
        .ks-btn--ghost:hover { background: rgba(255,255,255,0.07); }
        .ks-suspended-textarea {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          background: rgba(255,255,255,0.07);
          border: 1px solid var(--color-border, rgba(255,255,255,0.15));
          color: var(--color-text-primary);
          font-size: 0.9rem;
          line-height: 1.5;
          resize: vertical;
          box-sizing: border-box;
        }
        .ks-suspended-textarea:focus {
          outline: none;
          border-color: var(--color-primary, #6f58ff);
        }
        .ks-suspended-char-count {
          font-size: 0.75rem;
          color: var(--color-text-secondary);
          align-self: flex-end;
          margin-top: -8px;
        }
        .ks-suspended-error {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 0.875rem;
          color: #ef4444;
          width: 100%;
          text-align: left;
        }
      `}</style>
    </div>
  );
}
