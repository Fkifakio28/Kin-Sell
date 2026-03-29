import { useState } from "react";
import { usePWA } from "../utils/usePWA";

/**
 * Bouton / bannière d'installation de l'app Kin-Sell.
 * - Chrome / Edge / Android  → déclenche l'invite native
 * - iOS Safari               → affiche les instructions (Partager → Sur l'écran d'accueil)
 * - Déjà installée / autre   → rien
 *
 * Peut être rendu dans le Header ou en bannière flottante.
 */
export function InstallPrompt() {
  const { installState, triggerInstall, updateAvailable, applyUpdate } = usePWA();
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  // ── Mise à jour disponible (bandeau) ──
  if (updateAvailable) {
    return (
      <div className="pwa-update-banner" role="alert">
        <span>🔄 Nouvelle version disponible</span>
        <button className="pwa-update-btn" onClick={applyUpdate}>Mettre à jour</button>
        <button className="pwa-update-dismiss" onClick={() => setHidden(true)} aria-label="Fermer">✕</button>
      </div>
    );
  }

  // ── Chrome / Edge / Android ──
  if (installState === "prompt") {
    return (
      <button
        className="pwa-install-btn"
        onClick={async () => {
          await triggerInstall();
          setHidden(true);
        }}
        title="Installer Kin-Sell sur votre appareil"
      >
        <span className="pwa-install-icon">⬇︎</span>
        <span className="pwa-install-label">Installer l'app</span>
      </button>
    );
  }

  // ── iOS Safari ──
  if (installState === "ios") {
    return (
      <>
        <button
          className="pwa-install-btn"
          onClick={() => setShowIosHelp(h => !h)}
          title="Ajouter Kin-Sell à l'écran d'accueil"
        >
          <span className="pwa-install-icon">⬇︎</span>
          <span className="pwa-install-label">Installer l'app</span>
        </button>

        {showIosHelp && (
          <div className="pwa-ios-popup glass-card" role="dialog" aria-label="Instructions iOS">
            <button
              className="pwa-ios-close"
              onClick={() => { setShowIosHelp(false); setHidden(true); }}
              aria-label="Fermer"
            >✕</button>
            <p className="pwa-ios-title">📲 Ajouter à l'écran d'accueil</p>
            <ol className="pwa-ios-steps">
              <li>Appuyez sur le bouton <strong>Partager</strong> <span aria-hidden="true">⎙</span> en bas de Safari</li>
              <li>Faites défiler et appuyez sur <strong>« Sur l'écran d'accueil »</strong></li>
              <li>Confirmez avec <strong>Ajouter</strong></li>
            </ol>
            <p className="pwa-ios-hint">Kin-Sell s'ouvrira comme une application, sans barre d'adresse.</p>
          </div>
        )}
      </>
    );
  }

  return null;
}
