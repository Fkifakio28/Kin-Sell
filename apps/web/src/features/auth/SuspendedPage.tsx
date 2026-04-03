import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth as authApi } from "../../lib/api-client";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";

type Step = "info" | "appeal" | "appeal-sent";

export function SuspendedPage() {
  const { user, logout } = useAuth();
  const { t } = useLocaleCurrency();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("info");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitAppeal = async () => {
    if (message.trim().length < 10) {
      setError(t('auth.appealMinChars'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authApi.submitAppeal(message.trim());
      setStep("appeal-sent");
    } catch {
      setError(t('auth.appealError'));
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
            <h1 className="ks-suspended-title">{t('auth.suspendedTitle')}</h1>
            <p className="ks-suspended-body">{t('auth.suspendedBody')}</p>
            {user?.suspensionReason && (
              <div className="ks-suspended-reason">
                <span className="ks-suspended-reason-label">{t('auth.suspensionReason')}</span>
                <span className="ks-suspended-reason-text">{user.suspensionReason}</span>
              </div>
            )}
            <p className="ks-suspended-help">{t('auth.suspendedHelp')}</p>
            <div className="ks-suspended-actions">
              <button
                type="button"
                className="ks-btn ks-btn--primary"
                onClick={() => setStep("appeal")}
              >
                ✉️ {t('auth.submitAppeal')}
              </button>
              <button
                type="button"
                className="ks-btn ks-btn--ghost"
                onClick={handleLogout}
              >
                {t('auth.backToLogin')}
              </button>
            </div>
          </>
        )}

        {step === "appeal" && (
          <>
            <h1 className="ks-suspended-title">{t('auth.appealTitle')}</h1>
            <p className="ks-suspended-body">{t('auth.appealBody')}</p>
            <textarea
              className="ks-suspended-textarea"
              placeholder={t('auth.appealPlaceholder')}
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
                {busy ? t('auth.appealSending') : t('auth.appealSend')}
              </button>
              <button
                type="button"
                className="ks-btn ks-btn--ghost"
                onClick={() => setStep("info")}
                disabled={busy}
              >
                ← {t('common.back')}
              </button>
            </div>
          </>
        )}

        {step === "appeal-sent" && (
          <>
            <div className="ks-suspended-icon" style={{ fontSize: 48 }}>✅</div>
            <h1 className="ks-suspended-title">{t('auth.appealSentTitle')}</h1>
            <p className="ks-suspended-body">{t('auth.appealSentBody')}</p>
            <div className="ks-suspended-actions">
              <button
                type="button"
                className="ks-btn ks-btn--ghost"
                onClick={handleLogout}
              >
                {t('auth.backToLogin')}
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
        @media (max-width: 480px) {
          .ks-suspended-page { padding: 16px; }
          .ks-suspended-card { padding: 24px 16px; }
          .ks-suspended-icon { font-size: 40px; }
          .ks-suspended-title { font-size: 1.3rem; }
          .ks-suspended-body { font-size: 0.88rem; }
        }
      `}</style>
    </div>
  );
}
