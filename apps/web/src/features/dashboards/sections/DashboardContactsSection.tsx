/**
 * Section Contacts — liste, ajout, favoris, suppression
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { messaging } from "../../../lib/services/messaging.service";
import { contacts as contactsApi, type UserContactData } from "../../../lib/services/contacts.service";
import { resolveMediaUrl } from "../../../lib/api-core";

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
  const [contactFilter, setContactFilter] = useState<"all" | "favorites">("all");
  const [myContacts, setMyContacts] = useState<UserContactData[]>([]);
  const [loading, setLoading] = useState(true);

  // Search modal
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [contactSearchResults, setContactSearchResults] = useState<ContactSearchResult[]>([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      const data = await contactsApi.list();
      setMyContacts(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadContacts(); }, [loadContacts]);

  // Already-added user IDs for quick lookup
  const addedUserIds = new Set(myContacts.map((c) => c.matchedUserId).filter(Boolean));

  const filteredContacts = contactFilter === "favorites"
    ? myContacts.filter((c) => c.isFavorite)
    : myContacts;

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

  async function handleAddContact(targetUserId: string) {
    setAddingId(targetUserId);
    try {
      await contactsApi.add(targetUserId);
      await loadContacts();
    } catch { /* ignore */ } finally {
      setAddingId(null);
    }
  }

  async function handleToggleFavorite(contact: UserContactData) {
    try {
      const updated = await contactsApi.toggleFavorite(contact.id, !contact.isFavorite);
      setMyContacts((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    } catch { /* ignore */ }
  }

  async function handleDelete(contactId: string) {
    try {
      await contactsApi.remove(contactId);
      setMyContacts((prev) => prev.filter((c) => c.id !== contactId));
      setDeleteConfirmId(null);
    } catch { /* ignore */ }
  }

  function initials(name: string) {
    return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
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
            <button type="button" className={`ud-filter-chip${contactFilter === "all" ? " ud-filter-chip--active" : ""}`} onClick={() => setContactFilter("all")}>
              {t("user.contactAllLabel")} ({myContacts.length})
            </button>
            <button type="button" className={`ud-filter-chip${contactFilter === "favorites" ? " ud-filter-chip--active" : ""}`} onClick={() => setContactFilter("favorites")}>
              ⭐ {t("user.contactFavLabel")} ({myContacts.filter((c) => c.isFavorite).length})
            </button>
          </div>
        </div>
      </section>

      {/* ── Loading ── */}
      {loading && (
        <section className="ud-glass-panel" style={{ textAlign: "center", padding: "40px 24px" }}>
          <span className="ud-spinner" /> Chargement…
        </section>
      )}

      {/* ── Empty state ── */}
      {!loading && filteredContacts.length === 0 && (
        <section className="ud-glass-panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 24px" }}>
          <span style={{ fontSize: "3rem", display: "block", marginBottom: 12 }}>{contactFilter === "favorites" ? "⭐" : "🤝"}</span>
          <h3 style={{ margin: "0 0 8px", color: "var(--ud-text-1)" }}>
            {contactFilter === "favorites" ? "Aucun favori" : t("user.contactEmptyTitle")}
          </h3>
          <p className="ud-placeholder-text" style={{ margin: "0 0 20px" }}>
            {contactFilter === "favorites"
              ? "Cliquez sur l'étoile ⭐ d'un contact pour l'ajouter en favori."
              : t("user.contactEmptyDesc")}
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
      )}

      {/* ── Contact cards ── */}
      {!loading && filteredContacts.length > 0 && (
        <div className="ud-contacts-grid">
          {filteredContacts.map((contact) => {
            const matched = contact.matchedUser;
            const name = matched?.profile.displayName ?? contact.contactName ?? "Contact";
            const avatar = matched?.profile.avatarUrl ? resolveMediaUrl(matched.profile.avatarUrl) : null;
            const city = matched?.profile.city ?? null;

            return (
              <div key={contact.id} className="ud-glass-panel ud-contact-card">
                <div className="ud-contact-card-top">
                  <div className="ud-contact-card-avatar">
                    {avatar ? <img src={avatar} alt={name} /> : <span>{initials(name)}</span>}
                  </div>
                  <button
                    type="button"
                    className={`ud-contact-fav-btn${contact.isFavorite ? " ud-contact-fav-btn--active" : ""}`}
                    onClick={() => void handleToggleFavorite(contact)}
                    title={contact.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                  >
                    {contact.isFavorite ? "⭐" : "☆"}
                  </button>
                </div>
                <strong className="ud-contact-card-name">{name}</strong>
                {city && <span className="ud-contact-card-city">📍 {city}</span>}
                <div className="ud-contact-card-actions">
                  {matched && (
                    <button type="button" className="ud-quick-btn ud-quick-btn--primary ud-quick-btn--sm" onClick={() => navigate("/messaging")}>
                      💬
                    </button>
                  )}
                  {deleteConfirmId === contact.id ? (
                    <>
                      <button type="button" className="ud-quick-btn ud-quick-btn--danger ud-quick-btn--sm" onClick={() => void handleDelete(contact.id)}>
                        Confirmer
                      </button>
                      <button type="button" className="ud-quick-btn ud-quick-btn--sm" onClick={() => setDeleteConfirmId(null)}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <button type="button" className="ud-quick-btn ud-quick-btn--sm" onClick={() => setDeleteConfirmId(contact.id)} title="Supprimer">
                      🗑
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Search / Add modal ── */}
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
              {contactSearchResults.map((result) => {
                const alreadyAdded = addedUserIds.has(result.id);
                return (
                  <div key={result.id} className="ud-contact-search-item">
                    <div className="ud-contact-search-avatar">
                      {result.profile.avatarUrl ? (
                        <img src={resolveMediaUrl(result.profile.avatarUrl)} alt={result.profile.displayName} />
                      ) : (
                        <span className="ud-contact-search-initials">{initials(result.profile.displayName)}</span>
                      )}
                    </div>
                    <div className="ud-contact-search-info">
                      <strong>{result.profile.displayName}</strong>
                      <span className="ud-contact-search-meta">
                        {result.profile.username ? `@${result.profile.username}` : ""}{result.profile.city ? ` · ${result.profile.city}` : ""}
                      </span>
                    </div>
                    {alreadyAdded ? (
                      <span className="ud-contact-added-badge">✅ Ajouté</span>
                    ) : (
                      <button
                        type="button"
                        className="ud-quick-btn ud-quick-btn--primary"
                        disabled={addingId === result.id}
                        onClick={() => void handleAddContact(result.id)}
                      >
                        {addingId === result.id ? "..." : "➕ Ajouter"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
