/**
 * HomePageMobile — Expérience mobile Kin-Sell v2
 *
 * Redesign complet : true app-like experience.
 * Rendu uniquement sur ≤ 768px via HomeEntry.tsx
 *
 * Architecture :
 *   MobileHeader   — sticky, hamburger + logo + refresh + recherche
 *   SideDrawer     — menu latéral complet + auth actions
 *   SuggestionsRow — scroll horizontal "Stories" style
 *   SoKinFeed      — feed vertical social
 *   BottomNav      — 5 boutons : Home / Panier / + / Notifs / Compte
 *   CreateMenu     — bottom sheet du bouton +
 *   AccountPopup   — popup contextuelle du bouton Compte
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { getDashboardPath } from "../../utils/role-routing";
import {
  listings as listingsApi,
  orders as ordersApi,
  sokin as sokinApi,
  type PublicListing,
  type SoKinApiFeedPost,
} from "../../lib/api-client";
import { NegotiatePopup } from "../negotiations/NegotiatePopup";
import { useLockedCategories, isCategoryLocked } from "../../hooks/useLockedCategories";
import { usePwaInstall } from "../../hooks/usePwaInstall";
import "./home-mobile.css";

// ─────────────────────────────────────────────────────────────
// Static data
// ─────────────────────────────────────────────────────────────

const DRAWER_LINKS = {
  explorer: [
    { label: "🛍️ Produits", href: "/explorer?type=produits" },
    { label: "🔧 Services", href: "/explorer?type=services" },
  ],
  user: [
    { label: "🏪 Mon espace de vente", href: "__DASHBOARD__?section=sell" },
    { label: "🛒 Mon espace d'achat", href: "__DASHBOARD__?section=buy" },
  ],
  public: [
    { label: "📢 SoKin — Posts", href: "/sokin" },
    { label: "👤 SoKin — Profils", href: "/sokin/profiles" },
    { label: "🏬 SoKin — Market", href: "/sokin/market" },
  ],
  info: [
    { label: "ℹ️ À propos", href: "/about" },
    { label: "❓ FAQ", href: "/faq" },
    { label: "📖 Guide vendeur", href: "/guide" },
    { label: "📞 Contact", href: "/contact" },
    { label: "🔒 Confidentialité", href: "/privacy" },
    { label: "⚖️ Conditions d'utilisation", href: "/terms" },
  ],
};

const QUICK_CATS = [
  { emoji: "🍔", labelKey: "home.cat.food",       href: "/explorer?type=produits&category=nourriture" },
  { emoji: "📱", labelKey: "home.cat.phones",     href: "/explorer?type=produits&category=telephones" },
  { emoji: "👕", labelKey: "home.cat.fashion",    href: "/explorer?type=produits&category=mode" },
  { emoji: "💻", labelKey: "home.cat.computers",  href: "/explorer?type=produits&category=high-tech" },
  { emoji: "🏠", labelKey: "home.cat.realEstate", href: "/explorer?type=produits&category=immobilier" },
  { emoji: "🚕", labelKey: "home.svc.drivers",    href: "/explorer?type=services&category=chauffeurs" },
  { emoji: "💄", labelKey: "home.cat.beauty",     href: "/explorer?type=produits&category=beaute" },
  { emoji: "⚽", labelKey: "home.cat.sports",     href: "/explorer?type=produits&category=sports" },
  { emoji: "🔧", labelKey: "home.svc.repairer",   href: "/explorer?type=services&category=reparateur" },
  { emoji: "📚", labelKey: "home.cat.books",      href: "/explorer?type=produits&category=livres" },
  { emoji: "🎮", labelKey: "home.cat.gaming",     href: "/explorer?type=produits&category=jeux" },
  { emoji: "👶", labelKey: "home.cat.baby",       href: "/explorer?type=produits&category=bebe" },
];

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

// ── Side Drawer ───────────────────────────────────────────────
function SideDrawer({
  open,
  onClose,
  t,
  isLoggedIn,
  user,
  logout,
}: {
  open: boolean;
  onClose: () => void;
  t: (k: string) => string;
  isLoggedIn: boolean;
  user: import("../../lib/api-client").AccountUser | null;
  logout: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const displayName = user?.profile?.displayName || user?.profile?.username || null;

  const handleLogout = async () => {
    await logout();
    onClose();
    void navigate("/");
  };

  return (
    <>
      {open && (
        <div
          className="ksm-drawer-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`ksm-drawer${open ? " ksm-drawer--open" : ""}`}
        aria-label="Menu principal"
        aria-hidden={!open}
      >
        {/* Header drawer */}
        <div className="ksm-drawer-header">
          {isLoggedIn && user ? (
            <div className="ksm-drawer-profile">
              <div className="ksm-drawer-avatar">
                {user.profile.avatarUrl ? (
                  <img src={user.profile.avatarUrl} alt={displayName ?? "Avatar"} className="ksm-drawer-avatar-img" />
                ) : (
                  <span className="ksm-drawer-avatar-initial">
                    {(displayName ?? "K").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="ksm-drawer-profile-info">
                <p className="ksm-drawer-profile-name">{displayName ?? "Utilisateur"}</p>
                <span className="ksm-drawer-profile-badge">
                  {user.role === "BUSINESS" ? "🏢 Business" : user.role === "ADMIN" ? "⚡ Admin" : "👤 Utilisateur"}
                </span>
              </div>
            </div>
          ) : (
            <div className="ksm-drawer-profile">
              <div className="ksm-drawer-avatar">
                <span className="ksm-drawer-avatar-initial">?</span>
              </div>
              <div className="ksm-drawer-profile-info">
                <p className="ksm-drawer-profile-name">Visiteur</p>
                <span className="ksm-drawer-profile-badge">Non connecté</span>
              </div>
            </div>
          )}
          <button
            className="ksm-drawer-close"
            onClick={onClose}
            aria-label="Fermer le menu"
          >
            ✕
          </button>
        </div>

        {/* CTA publier */}
        <div className="ksm-drawer-cta">
          <button
            className="ksm-drawer-publish-btn"
            onClick={() => {
              onClose();
              void navigate(isLoggedIn ? `${getDashboardPath(user?.role)}?section=sell` : "/login");
            }}
          >
            📝 Publier un article
          </button>
        </div>

        {/* Sections */}
        <nav className="ksm-drawer-nav" aria-label="Navigation principale">
          <DrawerSection title="Explorer" links={DRAWER_LINKS.explorer} onClose={onClose} />
          {isLoggedIn && <DrawerSection title="Espace utilisateur" links={DRAWER_LINKS.user.map(l => ({ ...l, href: l.href.replace('__DASHBOARD__', getDashboardPath(user?.role)) }))} onClose={onClose} />}
          <DrawerSection title="Espace public" links={DRAWER_LINKS.public} onClose={onClose} />
          <DrawerSection title="Liens utiles" links={DRAWER_LINKS.info} onClose={onClose} />
        </nav>

        {/* Bottom auth actions */}
        <div className="ksm-drawer-footer">
          {isLoggedIn ? (
            <button className="ksm-drawer-logout-btn" onClick={handleLogout}>
              🚪 Déconnexion
            </button>
          ) : (
            <div className="ksm-drawer-auth-btns">
              <Link to="/login" className="ksm-drawer-login-btn" onClick={onClose}>
                🔑 Se connecter
              </Link>
              <Link to="/register" className="ksm-drawer-register-btn" onClick={onClose}>
                ✨ Créer un compte
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function DrawerSection({
  title,
  links,
  onClose,
}: {
  title: string;
  links: { label: string; href: string }[];
  onClose: () => void;
}) {
  return (
    <div className="ksm-drawer-section">
      <p className="ksm-drawer-section-title">{title}</p>
      {links.map((l) => (
        <Link
          key={l.href}
          to={l.href}
          className="ksm-drawer-link"
          onClick={onClose}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}

// ── Compact Header ─────────────────────────────────────────────
function MobileHeader({
  onMenuOpen,
  onRefresh,
  onSearchToggle,
  isFullscreen,
  onFullscreenToggle,
}: {
  onMenuOpen: () => void;
  onRefresh: () => void;
  onSearchToggle: () => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
}) {
  return (
    <header className="ksm-header-v2" role="banner">
      <button className="ksm-hv2-btn" onClick={onMenuOpen} aria-label="Ouvrir le menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <Link to="/" className="ksm-hv2-logo" aria-label="Kin-Sell — Accueil">
        <img
          src="/assets/kin-sell/logo.png"
          alt="Kin-Sell"
          className="ksm-hv2-logo-img"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <span className="ksm-hv2-logo-text">Kin-Sell</span>
      </Link>

      <div className="ksm-hv2-actions">
        <button className="ksm-hv2-btn" onClick={onRefresh} aria-label="Actualiser">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <button className="ksm-hv2-btn" onClick={onSearchToggle} aria-label="Rechercher">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </button>
        <button className="ksm-hv2-btn" onClick={onFullscreenToggle} aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}>
          {isFullscreen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}

// ── Search overlay ─────────────────────────────────────────────
function SearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    onClose();
    void navigate(`/explorer?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="ksm-search-overlay">
      <form className="ksm-search-overlay-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="search"
          className="ksm-search-overlay-input"
          placeholder="Rechercher un produit, service…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Recherche"
        />
        <button type="submit" className="ksm-search-overlay-btn" aria-label="Lancer la recherche">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </button>
        <button type="button" className="ksm-search-overlay-cancel" onClick={onClose} aria-label="Annuler">
          ✕
        </button>
      </form>
    </div>
  );
}

// ── Suggestions Row (Stories-style) ────────────────────────────
function SuggestionsRow({
  formatMoney,
  formatLabel,
}: {
  formatMoney: (c: number) => string;
  formatLabel: (c: number) => string;
}) {
  const [items, setItems] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const results = await listingsApi.latest({ limit: 12 });
        if (!cancelled) setItems(results);
      } catch { if (!cancelled) setItems([]); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section className="ksm-suggestions" aria-label="Articles suggérés">
      <h2 className="ksm-section-title">🔥 Articles pour vous</h2>
      <div className="ksm-suggestions-scroll">
        {loading
          ? [1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="ksm-suggestion-skeleton" aria-hidden="true" />
            ))
          : items.map((item) => (
              <Link
                key={item.id}
                to={`/listing/${item.id}`}
                className="ksm-suggestion-card"
                aria-label={item.title}
              >
                <div className="ksm-suggestion-img-wrap">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="ksm-suggestion-img"
                      loading="lazy"
                    />
                  ) : (
                    <div className="ksm-suggestion-img-placeholder" aria-hidden="true">
                      {item.type === "SERVICE" ? "🛠️" : "📦"}
                    </div>
                  )}
                </div>
                <p className="ksm-suggestion-title">{item.title}</p>
                <p className="ksm-suggestion-price">
                  {item.priceUsdCents === 0 ? formatLabel(0) : formatMoney(item.priceUsdCents)}
                </p>
              </Link>
            ))}
      </div>
    </section>
  );
}

// ── SoKin Feed (vertical) ──────────────────────────────────────
function SoKinFeedSection() {
  const [posts, setPosts] = useState<SoKinApiFeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await sokinApi.publicFeed(6);
        if (!cancelled) setPosts(res.posts);
      } catch { if (!cancelled) setPosts([]); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="ksm-sokin-feed" aria-label="SoKin — Fil d'actualité">
      <div className="ksm-sokin-feed-header">
        <h2 className="ksm-section-title">📢 SoKin — Annonces</h2>
        <Link to="/sokin" className="ksm-feed-see-all">Tout voir →</Link>
      </div>

      <div className="ksm-feed-list">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="ksm-feed-post-skeleton" aria-hidden="true" />
          ))
        ) : posts.length === 0 ? (
          <article className="ksm-feed-post">
            <div className="ksm-feed-post-header">
              <div className="ksm-feed-avatar" aria-hidden="true">
                <span className="ksm-feed-avatar-initial">K</span>
              </div>
              <div className="ksm-feed-post-meta">
                <p className="ksm-feed-post-author">So-Kin</p>
                <p className="ksm-feed-post-city">Kin-Sell Network</p>
              </div>
            </div>
            <p className="ksm-feed-post-text">
              Aucune annonce So-Kin pour le moment. Publiez la première annonce pour lancer le fil.
            </p>
            <div className="ksm-feed-post-stats">
              <span>❤️ 0</span>
              <span>💬 0</span>
              <span>↗️ 0</span>
            </div>
            <Link to="/sokin" className="ksm-feed-see-all" style={{ alignSelf: "flex-start" }}>
              Publier sur So-Kin →
            </Link>
          </article>
        ) : (
          posts.map((post) => {
              const profile = post.author?.profile;
              const name = profile?.displayName ?? "Utilisateur";
              const city = profile?.city;
              const initial = name.charAt(0).toUpperCase();

              return (
                <article key={post.id} className="ksm-feed-post">
                  <div className="ksm-feed-post-header">
                    <div className="ksm-feed-avatar">
                      {profile?.avatarUrl ? (
                        <img src={profile.avatarUrl} alt={name} className="ksm-feed-avatar-img" />
                      ) : (
                        <span className="ksm-feed-avatar-initial">{initial}</span>
                      )}
                    </div>
                    <div className="ksm-feed-post-meta">
                      <p className="ksm-feed-post-author">{name}</p>
                      {city && <p className="ksm-feed-post-city">📍 {city}</p>}
                    </div>
                  </div>

                  {post.text && (
                    <p className="ksm-feed-post-text">{post.text}</p>
                  )}

                  {post.mediaUrls && post.mediaUrls.length > 0 && (
                    <div className="ksm-feed-post-media">
                      {post.mediaUrls.slice(0, 3).map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Media ${idx + 1}`}
                          className="ksm-feed-media-img"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}

                  <div className="ksm-feed-post-stats">
                    <span>❤️ {post.likes}</span>
                    <span>💬 {post.comments}</span>
                    <span>↗️ {post.shares}</span>
                  </div>
                </article>
              );
            })
        )}
      </div>

      <div className="ksm-sokin-links">
        <Link to="/sokin/profiles" className="ksm-feed-see-all">Profils So-Kin</Link>
        <Link to="/sokin/market" className="ksm-feed-see-all">Market So-Kin</Link>
      </div>
    </section>
  );
}

// ── Listing Card (grid 2-col) ─────────────────────────────────
function MobileListingCard({
  listing,
  onNegotiate,
  formatMoney,
  formatLabel,
  t,
  locked,
}: {
  listing: PublicListing;
  onNegotiate: (l: PublicListing) => void;
  formatMoney: (c: number) => string;
  formatLabel: (c: number) => string;
  t: (k: string) => string;
  locked: boolean;
}) {
  const isFree = listing.priceUsdCents === 0;
  const isNeg = listing.isNegotiable;

  return (
    <Link to={`/listing/${listing.id}`} className="ksm-card" aria-label={listing.title}>
      <div className="ksm-card-img-wrap">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt={listing.title} className="ksm-card-img" loading="lazy" />
        ) : (
          <div className="ksm-card-img-placeholder" aria-hidden="true">
            {listing.type === "SERVICE" ? "🛠️" : "📦"}
          </div>
        )}
        {isNeg && !locked && (
          <span className="ksm-card-neg-badge">{t("common.negotiate")}</span>
        )}
        <span className={`ksm-card-type${listing.type === "SERVICE" ? " ksm-card-type--svc" : ""}`}>
          {listing.type === "SERVICE" ? t("common.service") : t("common.product")}
        </span>
      </div>
      <div className="ksm-card-body">
        <p className="ksm-card-title">{listing.title}</p>
        <p className="ksm-card-price">
          {isFree ? formatLabel(0) : formatMoney(listing.priceUsdCents)}
        </p>
        {isNeg && !locked && (
          <button
            className="ksm-card-neg-btn"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNegotiate(listing); }}
            aria-label={`${t("common.negotiate")} ${listing.title}`}
          >
            {t("common.negotiate")}
          </button>
        )}
      </div>
    </Link>
  );
}

// ── Account Popup ──────────────────────────────────────────────
function AccountPopup({
  open,
  onClose,
  isLoggedIn,
  t,
  logout,
}: {
  open: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
  t: (k: string) => string;
  logout: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!open) return null;

  const handleLogout = async () => {
    await logout();
    onClose();
    void navigate("/");
  };

  return (
    <>
      <div className="ksm-popup-overlay" onClick={onClose} aria-hidden="true" />
      <div className="ksm-account-popup" role="dialog" aria-label="Menu compte">
        {isLoggedIn ? (
          <>
            <button
              className="ksm-account-popup-item"
              onClick={() => { onClose(); void navigate(getDashboardPath(user?.role)); }}
            >
              👤 Mon compte
            </button>
            <button
              className="ksm-account-popup-item"
              onClick={() => {
                onClose();
                sessionStorage.setItem("ud-section", "messages");
                void navigate(getDashboardPath(user?.role));
              }}
            >
              💬 Messagerie
            </button>
            <div className="ksm-account-popup-divider" />
            <button className="ksm-account-popup-item ksm-account-popup-item--danger" onClick={handleLogout}>
              🚪 Déconnexion
            </button>
          </>
        ) : (
          <>
            <button className="ksm-account-popup-item" onClick={() => { onClose(); void navigate("/login"); }}>
              🔑 Connexion
            </button>
            <div className="ksm-account-popup-divider" />
            <button className="ksm-account-popup-item" onClick={() => { onClose(); void navigate("/register"); }}>
              ✨ Créer un compte
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ── Create Menu (bottom sheet) ─────────────────────────────────
function CreateMenu({
  open,
  onClose,
  isLoggedIn,
}: {
  open: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  if (!open) return null;

  const go = (path: string) => {
    onClose();
    void navigate(isLoggedIn ? path : "/login");
  };

  return (
    <>
      <div className="ksm-popup-overlay" onClick={onClose} aria-hidden="true" />
      <div className="ksm-create-menu" role="dialog" aria-label="Créer du contenu">
        <div className="ksm-create-menu-handle" aria-hidden="true" />
        <p className="ksm-create-menu-title">Publier ou ajouter</p>
        <button className="ksm-create-item" onClick={() => go("/sokin")}>
          <span className="ksm-create-item-icon" aria-hidden="true">📢</span>
          <span>Publier sur SoKin</span>
        </button>
        <button className="ksm-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=sell&create=produit`)}>
          <span className="ksm-create-item-icon" aria-hidden="true">🛍️</span>
          <span>Ajouter un produit</span>
        </button>
        <button className="ksm-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=sell&create=service`)}>
          <span className="ksm-create-item-icon" aria-hidden="true">🔧</span>
          <span>Ajouter un service</span>
        </button>
      </div>
    </>
  );
}

// ── Bottom Navigation v2 ───────────────────────────────────────
function BottomNav({
  activePopup,
  onToggle,
  t,
  cartItemsCount,
  notificationsCount,
}: {
  activePopup: "account" | "create" | null;
  onToggle: (p: "account" | "create") => void;
  t: (k: string) => string;
  cartItemsCount: number;
  notificationsCount: number;
}) {
  const { user } = useAuth();
  return (
    <nav className="ksm-bottom-nav-v2" aria-label="Navigation principale">
      {/* Home */}
      <Link to="/" className="ksm-bnav2-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
        <span>{t("nav.home")}</span>
      </Link>

      {/* Panier */}
      <Link to="/cart" className="ksm-bnav2-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
        {cartItemsCount > 0 && <span className="ksm-bnav2-badge">{cartItemsCount}</span>}
        <span>Panier</span>
      </Link>

      {/* + FAB center */}
      <button
        className={`ksm-bnav2-fab${activePopup === "create" ? " ksm-bnav2-fab--active" : ""}`}
        onClick={() => onToggle("create")}
        aria-label="Créer"
        aria-expanded={activePopup === "create"}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Notifications */}
      <button
        className="ksm-bnav2-item"
        onClick={() => {
          sessionStorage.setItem("ud-section", "notifications");
          window.location.href = getDashboardPath(user?.role);
        }}
        aria-label="Notifications"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {notificationsCount > 0 && <span className="ksm-bnav2-badge">{notificationsCount}</span>}
        <span>Notifs</span>
      </button>

      {/* Compte */}
      <button
        className={`ksm-bnav2-item${activePopup === "account" ? " ksm-bnav2-item--active" : ""}`}
        onClick={() => onToggle("account")}
        aria-label="Compte"
        aria-expanded={activePopup === "account"}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>Compte</span>
      </button>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────────────────────

export function HomePageMobile() {
  const { t, formatMoneyFromUsdCents, formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const { isLoggedIn, user, logout } = useAuth();
  const navigate = useNavigate();
  const lockedCats = useLockedCategories();
  const { platform } = usePwaInstall();

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activePopup, setActivePopup] = useState<"account" | "create" | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cartItemsCount, setCartItemsCount] = useState(0);
  const [notificationsCount, setNotificationsCount] = useState(0);

  // Fullscreen toggle
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // Listings state
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"PRODUIT" | "SERVICE">("PRODUIT");
  const [negotiateListing, setNegotiateListing] = useState<PublicListing | null>(null);

  // Catalogue listings
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const results = await listingsApi.latest({ type: activeTab, limit: 10 });
        if (!cancelled) setListings(results);
      } catch { if (!cancelled) setListings([]); }
      finally { if (!cancelled) setIsLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeTab, refreshKey]);

  useEffect(() => {
    if (!isLoggedIn) {
      setCartItemsCount(0);
      setNotificationsCount(0);
      return;
    }

    let cancelled = false;
    const loadCounts = async () => {
      try {
        const [cart, buyerData, sellerData] = await Promise.all([
          ordersApi.buyerCart().catch(() => null),
          ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
          ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
        ]);
        if (cancelled) return;
        setCartItemsCount(cart?.itemsCount ?? 0);
        setNotificationsCount((buyerData?.orders.length ?? 0) + (sellerData?.orders.length ?? 0));
      } catch {
        if (cancelled) return;
        setCartItemsCount(0);
        setNotificationsCount(0);
      }
    };

    void loadCounts();
    return () => { cancelled = true; };
  }, [isLoggedIn, refreshKey]);

  const handleTogglePopup = (p: "account" | "create") => {
    setActivePopup((prev) => (prev === p ? null : p));
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  // iOS install hint
  const showIosHint = platform === "ios";

  return (
    <div className="ksm-root-v2">

      {/* ── SIDE DRAWER ── */}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        t={t}
        isLoggedIn={isLoggedIn}
        user={user}
        logout={logout}
      />

      {/* ── SEARCH OVERLAY ── */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* ── COMPACT HEADER ── */}
      <MobileHeader
        onMenuOpen={() => setDrawerOpen(true)}
        onRefresh={handleRefresh}
        onSearchToggle={() => setSearchOpen(true)}
        isFullscreen={isFullscreen}
        onFullscreenToggle={toggleFullscreen}
      />

      {/* ── IOS INSTALL HINT ── */}
      {showIosHint && (
        <div className="ksm-ios-hint" role="status">
          📲 Installez l'app : appuyez sur <strong>Partager</strong> puis "Sur l'écran d'accueil"
        </div>
      )}

      {/* ── SUGGESTIONS (Stories) ── */}
      <SuggestionsRow
        formatMoney={formatMoneyFromUsdCents}
        formatLabel={formatPriceLabelFromUsdCents}
      />

      {/* ── CATALOGUE RÉCENT ── */}
      <section className="ksm-listings-section" aria-label="Annonces récentes">
        <div className="ksm-section-header">
          <h2 className="ksm-section-title">🏪 Annonces récentes</h2>
          <Link
            to={`/explorer?type=${activeTab === "PRODUIT" ? "produits" : "services"}`}
            className="ksm-feed-see-all"
          >
            Tout voir →
          </Link>
        </div>

        <div className="ksm-tabs">
          <button
            className={`ksm-tab${activeTab === "PRODUIT" ? " ksm-tab--active" : ""}`}
            onClick={() => setActiveTab("PRODUIT")}
          >
            {t("common.products")}
          </button>
          <button
            className={`ksm-tab${activeTab === "SERVICE" ? " ksm-tab--active" : ""}`}
            onClick={() => setActiveTab("SERVICE")}
          >
            {t("common.services")}
          </button>
        </div>

        {isLoading ? (
          <div className="ksm-listings-loading" role="status" aria-live="polite">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="ksm-card-skeleton" aria-hidden="true" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <p className="ksm-listings-empty">{t("common.noResults")}</p>
        ) : (
          <div className="ksm-listings-grid">
            {listings.map((l) => (
              <MobileListingCard
                key={l.id}
                listing={l}
                onNegotiate={setNegotiateListing}
                formatMoney={formatMoneyFromUsdCents}
                formatLabel={formatPriceLabelFromUsdCents}
                t={t}
                locked={isCategoryLocked(lockedCats, l.category ?? "")}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── SOKIN FEED ── */}
      <SoKinFeedSection />

      {/* ── CTA PREMIUM ── */}
      <section className="ksm-cta-section" aria-label="Plans premium">
        <div className="ksm-cta-card glass-card">
          <p className="ksm-cta-emoji" aria-hidden="true">💎</p>
          <p className="ksm-cta-title">{t("home.premiumTitle") || "Vendez plus avec Kin-Sell Premium"}</p>
          <p className="ksm-cta-sub">{t("home.premiumSub") || "Boostez vos annonces, accédez à l'IA et gérez votre boutique"}</p>
          <Link to="/forfaits" className="ksm-cta-btn">{t("nav.plans")}</Link>
        </div>
      </section>

      {/* Spacer bottom nav */}
      <div className="ksm-bottom-spacer" aria-hidden="true" />

      {/* ── BOTTOM NAV v2 ── */}
      <BottomNav
        activePopup={activePopup}
        onToggle={handleTogglePopup}
        t={t}
        cartItemsCount={cartItemsCount}
        notificationsCount={notificationsCount}
      />

      {/* ── ACCOUNT POPUP ── */}
      <AccountPopup
        open={activePopup === "account"}
        onClose={() => setActivePopup(null)}
        isLoggedIn={isLoggedIn}
        t={t}
        logout={logout}
      />

      {/* ── CREATE MENU ── */}
      <CreateMenu
        open={activePopup === "create"}
        onClose={() => setActivePopup(null)}
        isLoggedIn={isLoggedIn}
      />

      {/* ── NEGOTIATE POPUP ── */}
      {negotiateListing && (
        <NegotiatePopup
          listing={{ ...negotiateListing, ownerDisplayName: negotiateListing.owner.displayName }}
          onClose={() => setNegotiateListing(null)}
          onSuccess={() => setNegotiateListing(null)}
        />
      )}
    </div>
  );
}

