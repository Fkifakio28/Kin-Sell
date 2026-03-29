/**
 * InstallBanner — Système PWA premium Kin-Sell
 *
 * Plateforme détectée automatiquement :
 * - Chrome / Edge / Desktop → toast bottom-right avec prompt natif
 * - Android Chrome           → bottom sheet slide-up
 * - iOS Safari               → bottom sheet + instructions Partager
 *
 * Affiché uniquement après 5 min d'engagement réel.
 * Géré par usePwaInstall (cooldown, analytics, état).
 */

import { useState } from "react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import "./install-banner.css";

// ─────────────────────────────────────────────────────────────
// Composant iOS — instructions pas-à-pas
// ─────────────────────────────────────────────────────────────

function IosInstructionsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="ks-pwa-overlay" role="dialog" aria-label="Instructions d'installation iOS" aria-modal="true">
      <div className="ks-pwa-ios-sheet glass-card">
        <button className="ks-pwa-close" onClick={onClose} aria-label="Fermer">✕</button>
        <div className="ks-pwa-ios-header">
          <span className="ks-pwa-ios-icon" aria-hidden="true">📲</span>
          <h2 className="ks-pwa-ios-title">Ajouter à l'écran d'accueil</h2>
          <p className="ks-pwa-ios-subtitle">Accédez à Kin-Sell comme une application native</p>
        </div>
        <ol className="ks-pwa-ios-steps">
          <li>
            <span className="ks-pwa-ios-step-num">1</span>
            <span>Appuyez sur le bouton <strong>Partager</strong> <span className="ks-pwa-ios-share-icon" aria-hidden="true">⎙</span> en bas de Safari</span>
          </li>
          <li>
            <span className="ks-pwa-ios-step-num">2</span>
            <span>Faites défiler et tapez <strong>« Sur l'écran d'accueil »</strong></span>
          </li>
          <li>
            <span className="ks-pwa-ios-step-num">3</span>
            <span>Confirmez avec <strong>Ajouter</strong> en haut à droite</span>
          </li>
        </ol>
        <p className="ks-pwa-ios-hint">
          Kin-Sell s'ouvrira comme une application — sans barre d'adresse, en plein écran.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bannière Desktop (bottom-right toast)
// ─────────────────────────────────────────────────────────────

function DesktopToast({
  onInstall,
  onDismiss,
}: {
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="ks-pwa-desktop-toast glass-card" role="complementary" aria-label="Installer Kin-Sell">
      <button className="ks-pwa-close" onClick={onDismiss} aria-label="Fermer">✕</button>
      <div className="ks-pwa-toast-logo">
        <img
          src="/assets/kin-sell/pwa-192.png"
          alt="Kin-Sell"
          className="ks-pwa-toast-img"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div className="ks-pwa-toast-pulse" aria-hidden="true" />
      </div>
      <div className="ks-pwa-toast-body">
        <p className="ks-pwa-toast-app">Kin-Sell</p>
        <p className="ks-pwa-toast-title">Installez l'application</p>
        <p className="ks-pwa-toast-sub">Accès rapide depuis votre bureau, comme une app native</p>
      </div>
      <div className="ks-pwa-toast-actions">
        <button className="ks-pwa-install-btn" onClick={onInstall}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Installer
        </button>
        <button className="ks-pwa-later-btn" onClick={onDismiss}>Plus tard</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom Sheet Mobile (Android + iOS)
// ─────────────────────────────────────────────────────────────

function MobileBottomSheet({
  platform,
  onInstall,
  onDismiss,
}: {
  platform: "android" | "ios";
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <div className="ks-pwa-sheet-backdrop" onClick={onDismiss} aria-hidden="true" />
      <div className="ks-pwa-sheet glass-card" role="dialog" aria-label="Installer Kin-Sell">
        <div className="ks-pwa-sheet-handle" aria-hidden="true" />
        <div className="ks-pwa-sheet-header">
          <img
            src="/assets/kin-sell/pwa-192.png"
            alt="Kin-Sell"
            className="ks-pwa-sheet-icon"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div>
            <p className="ks-pwa-sheet-app">Kin-Sell</p>
            <p className="ks-pwa-sheet-tag">marketplace premium • Kinshasa</p>
          </div>
        </div>
        <div className="ks-pwa-sheet-features">
          <div className="ks-pwa-sheet-feat"><span aria-hidden="true">⚡</span> Accès instantané</div>
          <div className="ks-pwa-sheet-feat"><span aria-hidden="true">🔔</span> Notifications</div>
          <div className="ks-pwa-sheet-feat"><span aria-hidden="true">📶</span> Hors ligne</div>
        </div>
        <div className="ks-pwa-sheet-cta">
          {platform === "android" ? (
            <button className="ks-pwa-install-btn ks-pwa-install-btn--full" onClick={onInstall}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Installer l'application
            </button>
          ) : (
            <button className="ks-pwa-install-btn ks-pwa-install-btn--full" onClick={onInstall}>
              <span aria-hidden="true">⎙</span> Voir comment installer
            </button>
          )}
          <button className="ks-pwa-later-btn" onClick={onDismiss}>Pas maintenant</button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Bannière de mise à jour SW
// ─────────────────────────────────────────────────────────────

function UpdateBanner({ onApply, onDismiss }: { onApply: () => void; onDismiss: () => void }) {
  return (
    <div className="ks-pwa-update-bar" role="alert">
      <span className="ks-pwa-update-ico" aria-hidden="true">🔄</span>
      <p className="ks-pwa-update-msg">Nouvelle version de Kin-Sell disponible</p>
      <button className="ks-pwa-update-btn" onClick={onApply}>Mettre à jour</button>
      <button className="ks-pwa-update-dismiss" onClick={onDismiss} aria-label="Fermer">✕</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

export function InstallBanner() {
  const { installState, platform, canShow, triggerInstall, dismissBanner, updateAvailable, applyUpdate } = usePwaInstall();
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // ── Mise à jour SW disponible ──
  if (updateAvailable && !updateDismissed) {
    return (
      <UpdateBanner
        onApply={applyUpdate}
        onDismiss={() => setUpdateDismissed(true)}
      />
    );
  }

  // ── Instructions iOS (lancées depuis le sheet) ──
  if (showIosSheet) {
    return (
      <IosInstructionsSheet
        onClose={() => {
          setShowIosSheet(false);
          dismissBanner("closed");
        }}
      />
    );
  }

  // ── Rien à afficher ──
  if (!canShow) return null;

  // ── Desktop Chromium → toast bottom-right ──
  if (platform === "chromium-desktop") {
    return (
      <DesktopToast
        onInstall={async () => { await triggerInstall(); }}
        onDismiss={() => dismissBanner("dismissed")}
      />
    );
  }

  // ── Android → bottom sheet ──
  if (platform === "android") {
    return (
      <MobileBottomSheet
        platform="android"
        onInstall={async () => { await triggerInstall(); }}
        onDismiss={() => dismissBanner("dismissed")}
      />
    );
  }

  // ── iOS → bottom sheet + bouton qui ouvre les instructions ──
  if (installState === "ios") {
    return (
      <MobileBottomSheet
        platform="ios"
        onInstall={() => setShowIosSheet(true)}
        onDismiss={() => dismissBanner("dismissed")}
      />
    );
  }

  return null;
}
