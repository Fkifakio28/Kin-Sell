/**
 * FloatingCallBadge — Badge flottant style WhatsApp pour appel minimisé.
 *
 * Affiché quand l'utilisateur appuie sur "retour" pendant un appel actif.
 * Cliquable pour revenir à l'écran d'appel complet.
 */
import type { FC } from "react";
import "./floating-call-badge.css";

interface FloatingCallBadgeProps {
  contactName: string;
  durationSeconds: number;
  status: string;
  onRestore: () => void;
}

function formatDuration(s: number): string {
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const FloatingCallBadge: FC<FloatingCallBadgeProps> = ({
  contactName,
  durationSeconds,
  status,
  onRestore,
}) => {
  const isConnected = status === "connected";

  return (
    <button
      className="fcb-badge"
      onClick={onRestore}
      type="button"
      aria-label="Revenir à l'appel"
    >
      <span className="fcb-pulse" />
      <span className="fcb-icon">📞</span>
      <span className="fcb-info">
        <span className="fcb-name">{contactName}</span>
        <span className="fcb-timer">
          {isConnected ? formatDuration(durationSeconds) : "Connexion…"}
        </span>
      </span>
      <span className="fcb-arrow">›</span>
    </button>
  );
};
