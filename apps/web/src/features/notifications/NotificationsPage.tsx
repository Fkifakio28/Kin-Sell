/**
 * Page /notifications — historique complet des notifications persistées.
 * Filtres par catégorie, marquer lu/archiver/supprimer, pagination.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBdNotifications } from "../../hooks/useBdNotifications";
import type { BdNotification, BdNotificationCategory } from "../../lib/services/notifications-bd";
import "./notifications-page.css";

const FILTERS: { key: "ALL" | BdNotificationCategory; label: string; icon: string }[] = [
  { key: "ALL", label: "Tout", icon: "🔔" },
  { key: "ORDER", label: "Commandes", icon: "📦" },
  { key: "NEGOTIATION", label: "Marchandages", icon: "💬" },
  { key: "PAYMENT", label: "Paiements", icon: "💳" },
  { key: "MESSAGE", label: "Messages", icon: "✉️" },
  { key: "SOCIAL", label: "Social", icon: "❤️" },
  { key: "SYSTEM", label: "Système", icon: "⚙️" },
  { key: "PROMO", label: "Promos", icon: "🎁" },
];

function timeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `il y a ${Math.floor(diff / 86400)}j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"ALL" | BdNotificationCategory>("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const {
    items,
    unreadCount,
    hasMore,
    loading,
    error,
    markRead,
    markAllRead,
    archive,
    remove,
    loadMore,
    refresh,
  } = useBdNotifications({
    pageSize: 30,
    category: filter === "ALL" ? undefined : filter,
    unreadOnly,
  });

  const handleClick = async (n: BdNotification) => {
    if (!n.readAt) await markRead(n.id);
    if (n.url) navigate(n.url);
  };

  return (
    <div className="np-wrapper">
      <div className="np-container">
        <header className="np-header glass-container">
          <div>
            <h1 className="np-title">🔔 Notifications</h1>
            <p className="np-subtitle">
              {unreadCount > 0
                ? `${unreadCount} non ${unreadCount > 1 ? "lues" : "lue"}`
                : "Aucune notification non lue"}
            </p>
          </div>
          <div className="np-actions">
            <button
              type="button"
              className="np-btn np-btn-secondary"
              onClick={() => void refresh()}
              disabled={loading}
            >
              ↻ Actualiser
            </button>
            <button
              type="button"
              className="np-btn"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
            >
              Tout marquer lu
            </button>
            <button
              type="button"
              className="np-btn np-btn-secondary"
              onClick={() => navigate("/account?section=settings")}
            >
              ⚙️ Préférences
            </button>
          </div>
        </header>

        <div className="np-controls glass-container">
          <div className="np-filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`np-filter${filter === f.key ? " np-filter--active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                <span>{f.icon}</span> {f.label}
              </button>
            ))}
          </div>
          <label className="np-toggle">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            <span>Non lues uniquement</span>
          </label>
        </div>

        {error && <div className="np-error">⚠️ {error}</div>}

        <div className="np-list">
          {loading && items.length === 0 ? (
            <div className="np-empty">⏳ Chargement…</div>
          ) : items.length === 0 ? (
            <div className="np-empty">
              <span className="np-empty-icon">🔔</span>
              <p>Aucune notification</p>
              <small>Les nouvelles notifications apparaîtront ici en temps réel.</small>
            </div>
          ) : (
            items.map((n) => (
              <article
                key={n.id}
                className={`np-item${!n.readAt ? " np-item--unread" : ""}`}
                onClick={() => void handleClick(n)}
              >
                <div className="np-item-icon">{n.icon ?? "🔔"}</div>
                <div className="np-item-body">
                  <header className="np-item-head">
                    <h3 className="np-item-title">{n.title}</h3>
                    <span className="np-item-time">{timeAgo(n.createdAt)}</span>
                  </header>
                  <p className="np-item-body-text">{n.body}</p>
                  <span className={`np-item-cat np-item-cat--${n.category.toLowerCase()}`}>
                    {n.category}
                  </span>
                </div>
                <div className="np-item-actions" onClick={(e) => e.stopPropagation()}>
                  {!n.readAt && (
                    <button
                      type="button"
                      className="np-icon-btn"
                      onClick={() => void markRead(n.id)}
                      title="Marquer lu"
                    >
                      ✓
                    </button>
                  )}
                  <button
                    type="button"
                    className="np-icon-btn"
                    onClick={() => void archive(n.id)}
                    title="Archiver"
                  >
                    📥
                  </button>
                  <button
                    type="button"
                    className="np-icon-btn np-icon-btn--danger"
                    onClick={() => void remove(n.id)}
                    title="Supprimer"
                  >
                    🗑
                  </button>
                </div>
              </article>
            ))
          )}

          {hasMore && (
            <button
              type="button"
              className="np-load-more"
              onClick={() => void loadMore()}
              disabled={loading}
            >
              {loading ? "Chargement…" : "Charger plus"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
