import { useEffect, useState } from "react";

/**
 * Page affichée par le Service Worker quand la navigation cible une page
 * non encore mise en cache et que l'appareil est hors ligne.
 * Aussi utilisable comme route /offline pour les tests.
 */
export function OfflinePage() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return (
    <div className="ks-offline-page">
      <div className="ks-offline-card glass-card">
        <div className="ks-offline-icon">{isOnline ? "🌐" : "📴"}</div>
        <h1 className="ks-offline-title">
          {isOnline ? "Page non disponible en cache" : "Vous êtes hors ligne"}
        </h1>
        <p className="ks-offline-body">
          {isOnline
            ? "Revenez sur la page précédente ou allez à l'accueil."
            : "Vérifiez votre connexion Internet. Les pages déjà visitées restent accessibles en mode hors ligne."}
        </p>
        <div className="ks-offline-actions">
          <button
            type="button"
            className="ks-offline-btn ks-offline-btn--primary"
            onClick={() => window.location.href = "/"}
          >
            🏠 Retour à l'accueil
          </button>
          {!isOnline && (
            <button
              type="button"
              className="ks-offline-btn ks-offline-btn--ghost"
              onClick={() => window.location.reload()}
            >
              ↺ Réessayer
            </button>
          )}
        </div>
      </div>

      <style>{`
        .ks-offline-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .ks-offline-card {
          width: 100%;
          max-width: 460px;
          padding: 40px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
          border-radius: 20px;
        }
        .ks-offline-icon { font-size: 56px; line-height: 1; }
        .ks-offline-title {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--color-text-primary);
          margin: 0;
        }
        .ks-offline-body {
          font-size: 0.9rem;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 0;
        }
        .ks-offline-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }
        .ks-offline-btn {
          width: 100%;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: opacity 0.2s;
        }
        .ks-offline-btn--primary {
          background: var(--color-primary, #6f58ff);
          color: #fff;
        }
        .ks-offline-btn--primary:hover { opacity: 0.88; }
        .ks-offline-btn--ghost {
          background: transparent;
          color: var(--color-text-secondary);
          border: 1px solid var(--color-border, rgba(255,255,255,0.15));
        }
        .ks-offline-btn--ghost:hover { background: rgba(255,255,255,0.07); }
      `}</style>
    </div>
  );
}
