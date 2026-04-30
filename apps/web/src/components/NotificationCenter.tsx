import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useGlobalNotification } from "../app/providers/GlobalNotificationProvider";
import { useBdNotifications } from "../hooks/useBdNotifications";
import type { BdNotification, BdNotificationCategory } from "../lib/services/notifications-bd";
import "./notification-center.css";

/* ── Helpers ── */
function timeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}

const FILTERS: { key: "ALL" | BdNotificationCategory; label: string; icon: string }[] = [
  { key: "ALL", label: "Tout", icon: "🔔" },
  { key: "ORDER", label: "Commandes", icon: "📦" },
  { key: "NEGOTIATION", label: "Marchandages", icon: "💬" },
  { key: "PAYMENT", label: "Paiements", icon: "💳" },
  { key: "MESSAGE", label: "Messages", icon: "✉️" },
  { key: "SYSTEM", label: "Système", icon: "⚙️" },
];

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const navigate = useNavigate();
  const { missedNotifications: liveCalls, markSeen: markLiveSeen } = useGlobalNotification();
  const [filter, setFilter] = useState<"ALL" | BdNotificationCategory>("ALL");

  const { items, unreadCount, hasMore, loading, markRead, markAllRead, archive, loadMore } =
    useBdNotifications({
      pageSize: 25,
      category: filter === "ALL" ? undefined : filter,
      enabled: open,
    });

  // Appels live encore en mémoire (non persistés car éphémères)
  const liveItems = liveCalls.filter((n) => n.id.startsWith("call-"));

  if (!open) return null;

  const handleItemClick = async (n: BdNotification) => {
    if (!n.readAt) await markRead(n.id);
    onClose();
    if (n.url) navigate(n.url);
  };

  return createPortal(
    <>
      <div className="nc-overlay" onClick={onClose} />
      <div className="nc-panel" role="dialog" aria-label="Notifications">
        <div className="nc-header">
          <div>
            <h2 className="nc-title">Notifications</h2>
            {unreadCount > 0 && (
              <span className="nc-subtitle">
                {unreadCount} non {unreadCount > 1 ? "lues" : "lue"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {unreadCount > 0 && (
              <button className="nc-mark-all" onClick={() => void markAllRead()}>
                Tout lu
              </button>
            )}
            <button
              className="nc-mark-all"
              onClick={() => {
                onClose();
                navigate("/notifications");
              }}
              title="Voir toutes les notifications"
            >
              Tout voir
            </button>
            <button className="nc-close" onClick={onClose} aria-label="Fermer">
              ✕
            </button>
          </div>
        </div>

        {/* Filtres par catégorie */}
        <div className="nc-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`nc-filter${filter === f.key ? " nc-filter--active" : ""}`}
              onClick={() => setFilter(f.key)}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>

        <div className="nc-list">
          {filter === "ALL" &&
            liveItems.map((n) => (
              <div
                key={n.id}
                className="nc-item nc-item--unread"
                onClick={() => {
                  markLiveSeen(n.id);
                  onClose();
                  navigate(n.targetUrl);
                }}
              >
                <div className="nc-item-icon">{n.icon}</div>
                <div className="nc-item-body">
                  <p className="nc-item-title">{n.title}</p>
                  <p className="nc-item-content">{n.content}</p>
                </div>
                <span className="nc-item-time">{timeAgo(new Date(n.timestamp).toISOString())}</span>
              </div>
            ))}

          {loading && items.length === 0 ? (
            <div className="nc-empty">
              <span className="nc-empty-icon">⏳</span>
              <span className="nc-empty-text">Chargement…</span>
            </div>
          ) : items.length === 0 && liveItems.length === 0 ? (
            <div className="nc-empty">
              <span className="nc-empty-icon">🔔</span>
              <span className="nc-empty-text">Aucune notification</span>
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={`nc-item${!n.readAt ? " nc-item--unread" : ""}`}
                onClick={() => void handleItemClick(n)}
              >
                <div className="nc-item-icon">{n.icon ?? "🔔"}</div>
                <div className="nc-item-body">
                  <p className="nc-item-title">{n.title}</p>
                  <p className="nc-item-content">{n.body}</p>
                </div>
                <div className="nc-item-side">
                  <span className="nc-item-time">{timeAgo(n.createdAt)}</span>
                  <button
                    type="button"
                    className="nc-item-archive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void archive(n.id);
                    }}
                    aria-label="Archiver"
                    title="Archiver"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}

          {hasMore && (
            <button
              type="button"
              className="nc-load-more"
              onClick={() => void loadMore()}
              disabled={loading}
            >
              {loading ? "Chargement…" : "Charger plus"}
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
