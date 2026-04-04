/**
 * Section Contacts partagée — liste contacts + popup recherche
 * Utilisé dans UserDashboard et BusinessDashboard.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { messaging } from "../../../lib/services/messaging.service";

interface ContactSearchResult {
  id: string;
  profile: {
    displayName: string;
    username?: string | null;
    city?: string | null;
    avatarUrl?: string | null;
  };
}

interface ContactsSectionProps {
  t: (key: string) => string;
  userId: string;
}

export function DashboardContactsSection({ t, userId }: ContactsSectionProps) {
  const navigate = useNavigate();
  const [contactFilter, setContactFilter] = useState<"all" | "online" | "favorites">("all");
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [contactSearchResults, setContactSearchResults] = useState<ContactSearchResult[]>([]);
  const [contactSearching, setContactSearching] = useState(false);

  async function doSearch() {
    if (contactSearchQuery.trim().length < 2) return;
    setContactSearching(true);
    try {
      const res = await messaging.searchUsers(contactSearchQuery.trim());
      setContactSearchResults(res.users.filter((u: ContactSearchResult) => u.id !== userId));
    } catch {
      setContactSearchResults([]);
    } finally {
      setContactSearching(false);
    }
  }

  return (
    <div className="ud-section animate-fade-in">
      <section className="ud-glass-panel">
        <div className="ud-panel-head">
          <h2 className="ud-panel-title">🤝 {t("user.contactTitle")}</h2>
          <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => { setContactSearchOpen(true); setContactSearchQuery(""); setContactSearchResults([]); }}>
            ➕ {t("user.contactAddBtn")}
          </button>
        </div>
        <div className="ud-contacts-toolbar">
          <div className="ud-contacts-filters">
            {(["all", "online", "favorites"] as const).map((f) => (
              <button key={f} type="button" className={`ud-filter-chip${contactFilter === f ? " ud-filter-chip--active" : ""}`} onClick={() => setContactFilter(f)}>
                {f === "all" ? t("user.contactAllLabel") : f === "online" ? t("user.contactOnlineLabel") : `⭐ ${t("user.contactFavLabel")}`}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="ud-contacts-grid">
        <section className="ud-glass-panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 24px" }}>
          <span style={{ fontSize: "3rem", display: "block", marginBottom: 12 }}>🤝</span>
          <h3 style={{ margin: "0 0 8px", color: "var(--ud-text-1)" }}>{t("user.contactEmptyTitle")}</h3>
          <p className="ud-placeholder-text" style={{ margin: "0 0 20px" }}>
            {t("user.contactEmptyDesc")}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => { setContactSearchOpen(true); setContactSearchQuery(""); setContactSearchResults([]); }}>
              ➕ {t("user.contactAddBtn")}
            </button>
            <button type="button" className="ud-quick-btn" onClick={() => navigate("/messaging")}>
              💬 {t("user.messagerie")}
            </button>
          </div>
        </section>
      </div>

      {/* ── Popup ajout de contact ── */}
      {contactSearchOpen && (
        <div className="ud-publish-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setContactSearchOpen(false); }}>
          <div className="ud-contact-search-modal">
            <div className="ud-publish-header">
              <h2 className="ud-publish-title">🔍 {t("user.contactSearchTitle")}</h2>
              <button type="button" className="ud-publish-close" onClick={() => setContactSearchOpen(false)} aria-label={t("common.close")}>✕</button>
            </div>
            <p className="ud-contact-search-hint">{t("user.contactSearchHint2")}</p>
            <div className="ud-contact-search-bar">
              <input
                className="ud-input"
                placeholder={t("user.contactSearchPlaceholder")}
                value={contactSearchQuery}
                onChange={(e) => setContactSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void doSearch(); }}
                autoFocus
              />
              <button
                type="button"
                className="ud-quick-btn ud-quick-btn--primary"
                disabled={contactSearching || contactSearchQuery.trim().length < 2}
                onClick={() => void doSearch()}
              >
                {contactSearching ? "..." : t("user.contactSearchBtn")}
              </button>
            </div>

            <div className="ud-contact-search-results">
              {contactSearching && <p style={{ textAlign: "center", color: "var(--ud-text-2)", padding: "20px 0" }}>{t("user.contactSearchInProgress")}</p>}
              {!contactSearching && contactSearchResults.length === 0 && contactSearchQuery.length >= 2 && (
                <p style={{ textAlign: "center", color: "var(--ud-text-2)", padding: "20px 0" }}>{t("user.contactNoResult")}</p>
              )}
              {contactSearchResults.map((result) => (
                <div key={result.id} className="ud-contact-search-item">
                  <div className="ud-contact-search-avatar">
                    {result.profile.avatarUrl ? (
                      <img src={result.profile.avatarUrl} alt={result.profile.displayName} />
                    ) : (
                      <span className="ud-contact-search-initials">{result.profile.displayName.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
                    )}
                  </div>
                  <div className="ud-contact-search-info">
                    <strong>{result.profile.displayName}</strong>
                    <span className="ud-contact-search-meta">
                      {result.profile.username ? `@${result.profile.username}` : ""}{result.profile.city ? ` · ${result.profile.city}` : ""}
                    </span>
                    <span className="ud-contact-search-id">ID: {result.id.slice(0, 8)}…</span>
                  </div>
                  <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => navigate("/messaging")}>
                    💬 {t("user.contactBtnMsg")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
