import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useGlobalNotification, type MissedNotification } from "../app/providers/GlobalNotificationProvider";
import "./notification-center.css";

/* ── Helpers ── */
function timeAgo(ts: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const { missedNotifications, missedCount, markSeen, markAllSeen } = useGlobalNotification();
  const navigate = useNavigate();

  if (!open) return null;

  const handleItemClick = (n: MissedNotification) => {
    markSeen(n.id);
    onClose();
    navigate(n.targetUrl);
  };

  const handleMarkAll = () => {
    markAllSeen();
  };

  return createPortal(
    <>
      <div className="nc-overlay" onClick={onClose} />
      <div className="nc-panel" role="dialog" aria-label="Notifications">
        <div className="nc-header">
          <h2 className="nc-title">Notifications</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {missedCount > 0 && (
              <button className="nc-mark-all" onClick={handleMarkAll}>
                Tout marquer lu
              </button>
            )}
            <button className="nc-close" onClick={onClose} aria-label="Fermer">✕</button>
          </div>
        </div>

        <div className="nc-list">
          {missedNotifications.length === 0 ? (
            <div className="nc-empty">
              <span className="nc-empty-icon">🔔</span>
              <span className="nc-empty-text">Aucune notification</span>
            </div>
          ) : (
            missedNotifications.map((n) => (
              <div key={n.id} className="nc-item" onClick={() => handleItemClick(n)}>
                <div className="nc-item-icon">{n.icon}</div>
                <div className="nc-item-body">
                  <p className="nc-item-title">{n.title}</p>
                  <p className="nc-item-content">{n.content}</p>
                </div>
                <span className="nc-item-time">{timeAgo(n.timestamp)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
