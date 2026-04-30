/**
 * AudioCallScreen — Écran d'appel audio isolé Kin-Sell V2
 *
 * Structure : 4 zones verticales
 * 1. Topbar — bouton retour seul
 * 2. Identité — nom + avatar
 * 3. Statut — texte d'état OU chronomètre
 * 4. Actions — muet / haut-parleur / raccrocher (ou accepter/refuser)
 *
 * Aucun bouton supplémentaire. Aucune improvisation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import "./audio-call-screen.css";
import { resolveMediaUrl } from "../../lib/api-core";
import type { AudioCallStatus } from "../../hooks/useAudioCallState";
import {
  ArrowLeftIcon,
  MicIcon,
  MicOffIcon,
  Volume2Icon,
  SmartphoneIcon,
  BluetoothIcon,
  HeadphonesIcon,
  PhoneIcon,
  PhoneOffIcon,
} from "./call-icons";

// ── Status → display text mapping ──
const STATUS_TEXT: Record<AudioCallStatus, string> = {
  idle: "",
  outgoing_ringing: "Appel...",
  incoming_ringing: "Appel entrant...",
  connecting: "Connexion...",
  connected: "Appel en cours",
  ended: "Appel terminé",
  cancelled: "Appel annulé",
  declined: "Appel refusé",
  unanswered: "Aucune réponse",
  offline: "Utilisateur hors ligne",
};

// Terminal states — no actions allowed, auto-dismiss
const TERMINAL_STATES: Set<AudioCallStatus> = new Set([
  "ended", "cancelled", "declined", "unanswered", "offline",
]);

type AudioCallScreenProps = {
  /** Current call status */
  status: AudioCallStatus;
  /** Contact display name */
  contactName: string;
  /** Contact avatar URL (optional) */
  contactAvatarUrl?: string | null;
  /** Call direction */
  direction: "incoming" | "outgoing";
  /** Whether mic is muted */
  isMuted: boolean;
  /** Whether speaker is on (compat) */
  isSpeakerOn: boolean;
  /** Route audio active — étape 5 */
  audioRoute?: "earpiece" | "speaker" | "bluetooth" | "wired";
  /** Routes disponibles côté natif — étape 5 */
  availableAudioRoutes?: Array<"earpiece" | "speaker" | "bluetooth" | "wired">;
  /** Forcer une route audio — étape 5 */
  onSetRoute?: (route: "earpiece" | "speaker" | "bluetooth" | "wired") => void;
  /** Call duration in seconds (only during connected) */
  durationSeconds: number;
  /** Toggle mute */
  onToggleMute: () => void;
  /** Toggle speaker */
  onToggleSpeaker: () => void;
  /** End/cancel/reject call */
  onHangup: () => void;
  /** Accept incoming call */
  onAccept?: () => void;
  /** Go back / close screen */
  onBack: () => void;
};

/** Format seconds to mm:ss or hh:mm:ss */
function formatDuration(s: number): string {
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  if (hrs > 0) return `${String(hrs).padStart(2, "0")}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/** Get first letter(s) for avatar fallback */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name[0] ?? "?").toUpperCase();
}

export default function AudioCallScreen({
  status,
  contactName,
  contactAvatarUrl,
  direction,
  isMuted,
  isSpeakerOn,
  audioRoute,
  availableAudioRoutes,
  onSetRoute,
  durationSeconds,
  onToggleMute,
  onToggleSpeaker,
  onHangup,
  onAccept,
  onBack,
}: AudioCallScreenProps) {
  const isTerminal = TERMINAL_STATES.has(status);
  const isRinging = status === "outgoing_ringing" || status === "incoming_ringing";
  const isConnected = status === "connected";
  const isIncoming = status === "incoming_ringing";

  // Étape 5 — popover de sélection de route audio (uniquement si BT ou casque filaire dispo).
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const btAvailable = !!availableAudioRoutes && availableAudioRoutes.includes("bluetooth");
  const wiredAvailable = !!availableAudioRoutes && availableAudioRoutes.includes("wired");
  const hasMultipleRoutes = btAvailable || wiredAvailable;
  // Ferme le menu si toutes les routes externes disparaissent pendant qu'il est ouvert (casque débranché).
  useEffect(() => {
    if (!hasMultipleRoutes && routeMenuOpen) setRouteMenuOpen(false);
  }, [hasMultipleRoutes, routeMenuOpen]);

  // Auto-dismiss after terminal state (3s)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isTerminal) {
      dismissTimerRef.current = setTimeout(() => onBack(), 3000);
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [isTerminal, onBack]);

  // Resolved avatar URL
  const avatarSrc = contactAvatarUrl ? resolveMediaUrl(contactAvatarUrl) : null;

  return (
    <div className="acs-overlay">
      {/* ── Background layers ── */}
      <div className="acs-bg">
        {avatarSrc && (
          <img
            className="acs-bg-photo"
            src={avatarSrc}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        )}
        <div className="acs-bg-gradient" />
      </div>

      {/* ── Main screen ── */}
      <div className="acs-screen">
        {/* Zone 1 — Topbar */}
        <div className="acs-topbar">
          <button
            className="acs-back-btn"
            onClick={onBack}
            aria-label="Retour"
            type="button"
          >
            <ArrowLeftIcon size={22} />
          </button>
        </div>

        {/* Zone 2 — Identity + Zone 3 — Status */}
        <div className="acs-identity">
          <h2 className="acs-contact-name">{contactName}</h2>

          <div className={`acs-avatar${isRinging ? " acs-avatar--ringing" : ""}`}>
            {avatarSrc ? (
              <img src={avatarSrc} alt={contactName} draggable={false} />
            ) : (
              getInitials(contactName)
            )}
          </div>

          {/* Zone 3 — Status / Timer */}
          <div className="acs-status">
            {isConnected && durationSeconds >= 0 ? (
              <p className="acs-timer">{formatDuration(durationSeconds)}</p>
            ) : (
              <p className="acs-status-text">{STATUS_TEXT[status]}</p>
            )}
          </div>
        </div>

        {/* Zone 4 — Actions */}
        {isIncoming ? (
          /* ── Incoming: Accept / Reject ── */
          <div className="acs-incoming-actions">
            <button
              className="acs-incoming-btn acs-incoming-btn--reject"
              onClick={onHangup}
              type="button"
              aria-label="Refuser l'appel"
            >
              <span className="acs-incoming-btn-circle"><PhoneOffIcon size={28} /></span>
              <span className="acs-incoming-btn-label">Refuser</span>
            </button>

            <button
              className="acs-incoming-btn acs-incoming-btn--accept"
              onClick={onAccept}
              type="button"
              aria-label="Accepter l'appel"
            >
              <span className="acs-incoming-btn-circle"><PhoneIcon size={28} /></span>
              <span className="acs-incoming-btn-label">Accepter</span>
            </button>
          </div>
        ) : !isTerminal ? (
          /* ── Active/outgoing: Mute / Speaker / Hangup ── */
          <div className="acs-actions">
            {/* 1. Muet */}
            <button
              className={`acs-action-btn${isMuted ? " acs-action-btn--active" : ""}`}
              onClick={onToggleMute}
              type="button"
              aria-label={isMuted ? "Réactiver le micro" : "Couper le micro"}
              disabled={!isConnected && status !== "outgoing_ringing" && status !== "connecting"}
            >
              {isMuted ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
            </button>

            {/* 2. Haut-parleur / Bluetooth / Casque (si dispo) */}
            {hasMultipleRoutes && onSetRoute ? (
              <div className="acs-route-wrap">
                <button
                  className={`acs-action-btn${audioRoute === "bluetooth" ? " acs-action-btn--bt-on" : audioRoute === "speaker" ? " acs-action-btn--speaker-on" : ""}`}
                  onClick={() => setRouteMenuOpen((v) => !v)}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={routeMenuOpen}
                  aria-label={
                    audioRoute === "bluetooth" ? "Sortie audio : Bluetooth"
                    : audioRoute === "wired" ? "Sortie audio : casque filaire"
                    : audioRoute === "speaker" ? "Sortie audio : haut-parleur"
                    : "Sortie audio : écouteur"
                  }
                  disabled={!isConnected && status !== "outgoing_ringing" && status !== "connecting"}
                >
                  {audioRoute === "bluetooth" ? <BluetoothIcon size={22} />
                    : audioRoute === "wired" ? <HeadphonesIcon size={22} />
                    : audioRoute === "speaker" ? <Volume2Icon size={22} />
                    : <SmartphoneIcon size={22} />}
                </button>
                {routeMenuOpen && (
                  <div role="menu" className="acs-route-menu">
                    {(["earpiece", "speaker", "wired", "bluetooth"] as const)
                      .filter((r) => r === "earpiece" || r === "speaker"
                        || (r === "wired" && wiredAvailable)
                        || (r === "bluetooth" && btAvailable))
                      .map((r) => (
                      <button
                        key={r}
                        role="menuitemradio"
                        aria-checked={audioRoute === r}
                        type="button"
                        onClick={() => {
                          onSetRoute(r);
                          setRouteMenuOpen(false);
                        }}
                        className={`acs-route-option${audioRoute === r ? " acs-route-option--active" : ""}`}
                      >
                        <span className="acs-route-option-icon" aria-hidden="true">
                          {r === "bluetooth" ? <BluetoothIcon size={18} />
                            : r === "wired" ? <HeadphonesIcon size={18} />
                            : r === "speaker" ? <Volume2Icon size={18} />
                            : <SmartphoneIcon size={18} />}
                        </span>
                        <span>
                          {r === "bluetooth" ? "Bluetooth"
                            : r === "wired" ? "Casque filaire"
                            : r === "speaker" ? "Haut-parleur"
                            : "Écouteur"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                className={`acs-action-btn${isSpeakerOn ? " acs-action-btn--speaker-on" : ""}`}
                onClick={onToggleSpeaker}
                type="button"
                aria-label={isSpeakerOn ? "Désactiver le haut-parleur" : "Activer le haut-parleur"}
                disabled={!isConnected && status !== "outgoing_ringing" && status !== "connecting"}
              >
                {isSpeakerOn ? <Volume2Icon size={22} /> : <SmartphoneIcon size={22} />}
              </button>
            )}

            {/* 3. Fin d'appel */}
            <button
              className="acs-hangup-btn"
              onClick={onHangup}
              type="button"
              aria-label="Terminer l'appel"
            >
              <PhoneOffIcon size={26} />
            </button>
          </div>
        ) : (
          /* ── Terminal: no actions, just spacing ── */
          <div className="acs-actions" style={{ visibility: "hidden" }}>
            <div style={{ width: 64, height: 64 }} />
          </div>
        )}
      </div>
    </div>
  );
}
