/**
 * HomePageMobile — Refonte complète mobile/tablette Kin-Sell v2
 *
 * Structure :
 *   TopBar (rétractable) — hamburger | logo | loupe
 *   SideDrawer           — inchangé
 *   Content :
 *     Bloc 1 : Articles pour vous (scroll horizontal, cartes marketplace)
 *     Bloc 2 : Articles publiés Produit/Service (scroll horizontal, cartes)
 *     Bloc 3 : Fil So-Kin (vertical infini, style lettre social)
 *   FAB (rétractable)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import {
  useLocaleCurrency,
} from "../../app/providers/LocaleCurrencyProvider";
import { useMarketPreference } from "../../app/providers/MarketPreferenceProvider";
import { getDashboardPath } from "../../utils/role-routing";
import {
  listings as listingsApi,
  sokin as sokinApi,
  orders as ordersApi,
  messaging,
  resolveMediaUrl,
  type PublicListing,
  type SoKinApiFeedPost,
  type CartSummary,
} from "../../lib/api-client";
import { NegotiatePopup } from "../negotiations/NegotiatePopup";
import { AdBanner } from "../../components/AdBanner";
import { RegionLanguageCurrencySelector } from "../../components/RegionLanguageCurrencySelector";
import {
  useLockedCategories,
  isCategoryLocked,
} from "../../hooks/useLockedCategories";
import { useSocket } from "../../hooks/useSocket";
import "./home-mobile.css";

/* ────────────── Static data ────────────── */

const DRAWER_LINKS = {
  explorer: [
    { icon: "\uD83D\uDECD\uFE0F", labelKey: "common.products", href: "/explorer?type=produits" },
    { icon: "\uD83D\uDD27", labelKey: "common.services", href: "/explorer?type=services" },
  ],
  user: [
    { icon: "\uD83C\uDFEA", labelKey: "home.drawerSellSpace", href: "__DASHBOARD__?section=sell" },
    { icon: "\uD83D\uDED2", labelKey: "home.drawerBuySpace", href: "__DASHBOARD__?section=buy" },
  ],
  public: [
    { icon: "\uD83D\uDCE2", labelKey: "home.sokinFeed", href: "/sokin" },
    { icon: "\uD83D\uDC64", labelKey: "home.sokinProfiles", href: "/explorer/public-profiles" },
    { icon: "\uD83C\uDFEC", labelKey: "home.sokinMarket", href: "/explorer/shops-online" },
  ],
  info: [
    { icon: "\u2139\uFE0F", labelKey: "home.aboutUs", href: "/about" },
    { icon: "\u2753", labelKey: "home.faq", href: "/faq" },
    { icon: "\uD83D\uDCD6", labelKey: "nav.guide", href: "/guide" },
    { icon: "\uD83D\uDCDE", labelKey: "home.contact", href: "/contact" },
    { icon: "\uD83D\uDD12", labelKey: "nav.privacy", href: "/privacy" },
    { icon: "\u2696\uFE0F", labelKey: "home.terms", href: "/terms" },
  ],
};

/* ────────────── Hook: scroll direction ────────────── */

function useScrollDirection() {
  const [barsVisible, setBarsVisible] = useState(true);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (delta > 8 && y > 60) setBarsVisible(false);
        else if (delta < -8) setBarsVisible(true);
        lastY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return barsVisible;
}

/* ────────────── Side Drawer ────────────── */

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
  const {
    detectedCountry,
    effectiveCountry,
    getCountryConfig,
  } = useMarketPreference();
  const displayName =
    user?.profile?.displayName || user?.profile?.username || null;
  const activeCountry = getCountryConfig(effectiveCountry);

  const handleLogout = async () => {
    await logout();
    onClose();
    void navigate("/login");
  };

  const drawerCls = "hm-drawer" + (open ? " hm-drawer--open" : "");

  return (
    <>
      {open && (
        <div
          className="hm-drawer-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={drawerCls}
        aria-label={t("nav.ariaMain")}
        aria-hidden={!open}
      >
        <div className="hm-drawer-header">
          {isLoggedIn && user ? (
            <div className="hm-drawer-profile">
              <div className="hm-drawer-avatar">
                {user.profile.avatarUrl ? (
                  <img
                    src={user.profile.avatarUrl}
                    alt={displayName ?? "Avatar"}
                    className="hm-drawer-avatar-img"
                  />
                ) : (
                  <span className="hm-drawer-avatar-initial">
                    {(displayName ?? "K").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="hm-drawer-profile-info">
                <p className="hm-drawer-profile-name">
                  {displayName ?? "Utilisateur"}
                </p>
                <span className="hm-drawer-profile-badge">
                  {user.role === "BUSINESS"
                    ? "\uD83C\uDFE2 " + t("home.businessRole")
                    : user.role === "SUPER_ADMIN"
                      ? "⭐ Super Admin"
                      : user.role === "ADMIN"
                        ? "\u26A1 " + t("home.svc.admin")
                        : "\uD83D\uDC64 " + t("home.userRole")}
                </span>
              </div>
            </div>
          ) : (
            <div className="hm-drawer-profile">
              <div className="hm-drawer-avatar">
                <span className="hm-drawer-avatar-initial">?</span>
              </div>
              <div className="hm-drawer-profile-info">
                <p className="hm-drawer-profile-name">{t("home.visitor")}</p>
                <span className="hm-drawer-profile-badge">
                  {t("home.visitorMode")}
                </span>
              </div>
            </div>
          )}
          <button
            className="hm-drawer-close"
            onClick={onClose}
            aria-label={t("nav.closeMenu")}
          >
            &times;
          </button>
        </div>

        <div className="hm-drawer-cta">
          <button
            className="hm-drawer-publish-btn"
            onClick={() => {
              onClose();
              void navigate(
                isLoggedIn
                  ? getDashboardPath(user?.role) + "?section=sell"
                  : "/login",
              );
            }}
          >
            {"\uD83D\uDCDD " + t("publish.publishArticle")}
          </button>
        </div>

        <div className="hm-drawer-market-prefs">
          <p className="hm-drawer-section-title">
            {t("home.drawerMarketPrefs")}
          </p>
          <RegionLanguageCurrencySelector />
          <p className="hm-drawer-pref-hint">
            {t("home.marketDetected").replace(
              "{country}",
              getCountryConfig(detectedCountry).name,
            )}
          </p>
          <p className="hm-drawer-pref-hint">
            {t("home.marketActive")
              .replace("{country}", activeCountry.name)
              .replace("{region}", activeCountry.region)}
          </p>
        </div>

        <nav className="hm-drawer-nav" aria-label={t("nav.ariaMain")}>
          <DrawerSection
            title={t("home.drawerExploreSection")}
            links={DRAWER_LINKS.explorer}
            onClose={onClose}
            t={t}
          />
          {isLoggedIn && (
            <DrawerSection
              title={t("home.drawerUserSection")}
              links={DRAWER_LINKS.user.map((l) => ({
                ...l,
                href: l.href.replace(
                  "__DASHBOARD__",
                  getDashboardPath(user?.role),
                ),
              }))}
              onClose={onClose}
              t={t}
            />
          )}
          <DrawerSection
            title={t("home.drawerPublicSection")}
            links={DRAWER_LINKS.public}
            onClose={onClose}
            t={t}
          />
          <DrawerSection
            title={t("home.drawerInfoSection")}
            links={DRAWER_LINKS.info}
            onClose={onClose}
            t={t}
          />
        </nav>

        <div className="hm-drawer-footer">
          <div className="hm-drawer-socials">
            <a
              href="https://web.facebook.com/profile.php?id=61576537875599"
              className="hm-drawer-social-btn"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
            </a>
            <a
              href="https://www.instagram.com/kin.sell/"
              className="hm-drawer-social-btn"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>
            <a
              href="https://x.com/Kinsell_marketP"
              className="hm-drawer-social-btn"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://www.tiktok.com/@kinsell1"
              className="hm-drawer-social-btn"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.82a8.18 8.18 0 0 0 4.79 1.53V6.88a4.85 4.85 0 0 1-1.02-.19z" />
              </svg>
            </a>
          </div>
          {isLoggedIn ? (
            <button className="hm-drawer-logout-btn" onClick={handleLogout}>
              {"\uD83D\uDEAA " + t("common.logout")}
            </button>
          ) : (
            <div className="hm-drawer-auth-btns">
              <Link
                to="/login"
                className="hm-drawer-login-btn"
                onClick={onClose}
              >
                {"\uD83D\uDD11 " + t("auth.loginBtn")}
              </Link>
              <Link
                to="/register"
                className="hm-drawer-register-btn"
                onClick={onClose}
              >
                {"\u2728 " + t("common.signup")}
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
  t,
}: {
  title: string;
  links: { icon: string; labelKey: string; href: string }[];
  onClose: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="hm-drawer-section">
      <p className="hm-drawer-section-title">{title}</p>
      {links.map((l) => (
        <Link key={l.href} to={l.href} className="hm-drawer-link" onClick={onClose}>
          {l.icon} {t(l.labelKey)}
        </Link>
      ))}
    </div>
  );
}

/* ────────────── Top Bar ────────────── */

function TopBar({
  visible,
  onMenuOpen,
  onSearchToggle,
  t,
}: {
  visible: boolean;
  onMenuOpen: () => void;
  onSearchToggle: () => void;
  t: (k: string) => string;
}) {
  const cls = "hm-topbar" + (visible ? "" : " hm-topbar--hidden");
  return (
    <header className={cls} role="banner">
      <button
        className="hm-topbar-btn"
        onClick={onMenuOpen}
        aria-label={t("nav.openMenu")}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <Link to="/" className="hm-topbar-logo" aria-label="Kin-Sell">
        <span className="hm-topbar-logo-shimmer" aria-hidden="true" />
        <img
          src="/assets/kin-sell/logo.png"
          alt="Kin-Sell"
          className="hm-topbar-logo-img"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="hm-topbar-logo-text">Kin-Sell</span>
      </Link>
      <button
        className="hm-topbar-btn"
        onClick={onSearchToggle}
        aria-label={t("common.search")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>
    </header>
  );
}

/* ────────────── Search Overlay ────────────── */

function SearchOverlay({
  open,
  onClose,
  t,
}: {
  open: boolean;
  onClose: () => void;
  t: (k: string) => string;
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
    void navigate("/explorer?q=" + encodeURIComponent(q.trim()));
  };

  return (
    <div className="hm-search-overlay">
      <form className="hm-search-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="search"
          className="hm-search-input"
          placeholder="Rechercher sur Kin-Sell (annonces, articles, profils, boutiques...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("common.search")}
        />
        <button type="submit" className="hm-search-btn" aria-label={t("common.search")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>
        <button
          type="button"
          className="hm-search-cancel"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          &times;
        </button>
      </form>
    </div>
  );
}

/* ────────────── Bloc 1: Articles pour vous ────────────── */

function SuggestionsSection({
  formatMoney,
  formatLabel,
  cityHint,
  countryHint,
  t,
  onArticleTap,
  cartBusyId,
}: {
  formatMoney: (c: number) => string;
  formatLabel: (c: number) => string;
  cityHint?: string;
  countryHint?: string;
  t: (k: string) => string;
  onArticleTap: (listing: PublicListing) => void;
  cartBusyId: string | null;
}) {
  const [items, setItems] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let results = await listingsApi.latest({ limit: 12, city: cityHint, country: countryHint });
        // Fallback: country only
        if (results.length === 0 && countryHint) {
          results = await listingsApi.latest({ limit: 12, country: countryHint });
        }
        // Fallback: no geo filter
        if (results.length === 0) {
          results = await listingsApi.latest({ limit: 12 });
        }
        if (!cancelled) setItems(results);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cityHint, countryHint]);

  if (!loading && items.length === 0) return null;

  return (
    <section
      className="hm-section hm-suggestions"
      aria-label={t("home.suggestedArticles")}
    >
      <h2 className="hm-section-title">
        🔥 Articles pour vous
      </h2>
      <div className="hm-hscroll">
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <div key={i} className="hm-card-skeleton hm-card-skeleton--small" />
            ))
          : items.map((item) => (
              <button
                key={item.id}
                className="hm-suggestion-card"
                onClick={() => onArticleTap(item)}
                disabled={cartBusyId === item.id}
              >
                <div className="hm-suggestion-img">
                  {item.imageUrl ? (
                    <img src={resolveMediaUrl(item.imageUrl)} alt={item.title} loading="lazy" />
                  ) : (
                    <span className="hm-suggestion-placeholder">
                      {item.type === "SERVICE" ? "\uD83D\uDEE0\uFE0F" : "\uD83D\uDCE6"}
                    </span>
                  )}
                </div>
                <p className="hm-suggestion-title">{item.title}</p>
                <p className="hm-suggestion-price">
                  {item.priceUsdCents === 0
                    ? formatLabel(0)
                    : formatMoney(item.priceUsdCents)}
                </p>
              </button>
            ))}
      </div>
    </section>
  );
}

/* ────────────── Bloc 2: Articles publiés ────────────── */

function ListingsSection({
  formatMoney,
  formatLabel,
  t,
  onNegotiate,
  onArticleTap,
  cartBusyId,
  lockedCats,
  cityHint,
  countryHint,
}: {
  formatMoney: (c: number) => string;
  formatLabel: (c: number) => string;
  t: (k: string) => string;
  onNegotiate: (l: PublicListing) => void;
  onArticleTap: (listing: PublicListing) => void;
  cartBusyId: string | null;
  lockedCats: string[];
  cityHint?: string;
  countryHint?: string;
}) {
  const [activeTab, setActiveTab] = useState<"PRODUIT" | "SERVICE">("PRODUIT");
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // Try with city + country
        let results = await listingsApi.latest({
          type: activeTab,
          limit: 10,
          city: cityHint,
          country: countryHint,
        });
        // Fallback: country only (no city)
        if (results.length === 0 && countryHint) {
          results = await listingsApi.latest({ type: activeTab, limit: 10, country: countryHint });
        }
        // Fallback: no geo filter
        if (results.length === 0) {
          results = await listingsApi.latest({ type: activeTab, limit: 10 });
        }
        if (!cancelled) setListings(results);
      } catch {
        if (!cancelled) setListings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, cityHint, countryHint]);

  return (
    <section
      className="hm-section hm-listings"
      aria-label={t("home.recentListings")}
    >
      <div className="hm-section-row">
        <h2 className="hm-section-title">🏪 Annonces récentes</h2>
        <Link
          to={
            "/explorer?type=" +
            (activeTab === "PRODUIT" ? "produits" : "services")
          }
          className="hm-see-all"
        >
          Voir tout →
        </Link>
      </div>

      <div className="hm-tabs">
        <button
          className={
            "hm-tab" + (activeTab === "PRODUIT" ? " hm-tab--active" : "")
          }
          onClick={() => setActiveTab("PRODUIT")}
        >
          {t("common.products")}
        </button>
        <button
          className={
            "hm-tab" + (activeTab === "SERVICE" ? " hm-tab--active" : "")
          }
          onClick={() => setActiveTab("SERVICE")}
        >
          {t("common.services")}
        </button>
      </div>

      {loading ? (
        <div className="hm-hscroll">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="hm-card-skeleton" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <p className="hm-empty">{t("common.noResults")}</p>
      ) : (
        <div className="hm-hscroll">
          {listings.map((l) => (
            <MarketCard
              key={l.id}
              listing={l}
              onNegotiate={onNegotiate}
              onArticleTap={onArticleTap}
              formatMoney={formatMoney}
              formatLabel={formatLabel}
              t={t}
              locked={isCategoryLocked(lockedCats, l.category ?? "")}
              busy={cartBusyId === l.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MarketCard({
  listing,
  onNegotiate,
  onArticleTap,
  formatMoney,
  formatLabel,
  t,
  locked,
  busy,
}: {
  listing: PublicListing;
  onNegotiate: (l: PublicListing) => void;
  onArticleTap: (listing: PublicListing) => void;
  formatMoney: (c: number) => string;
  formatLabel: (c: number) => string;
  t: (k: string) => string;
  locked: boolean;
  busy: boolean;
}) {
  return (
    <article
      className="hm-market-card"
      role="button"
      tabIndex={0}
      onClick={() => onArticleTap(listing)}
      onKeyDown={(e) => {
        if (busy) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onArticleTap(listing);
        }
      }}
      aria-disabled={busy}
    >
      <div className="hm-market-card-img">
        {listing.imageUrl ? (
          <img src={resolveMediaUrl(listing.imageUrl)} alt={listing.title} loading="lazy" />
        ) : (
          <span className="hm-market-card-placeholder">
            {listing.type === "SERVICE" ? "\uD83D\uDEE0\uFE0F" : "\uD83D\uDCE6"}
          </span>
        )}
        {listing.isNegotiable && !locked && (
          <span className="hm-badge hm-badge--neg">{t("common.negotiate")}</span>
        )}
        <span
          className={
            "hm-badge hm-badge--type" +
            (listing.type === "SERVICE" ? " hm-badge--svc" : "")
          }
        >
          {listing.type === "SERVICE"
            ? t("common.service")
            : t("common.product")}
        </span>
      </div>
      <div className="hm-market-card-body">
        <p className="hm-market-card-title">{listing.title}</p>
        <p className="hm-market-card-price">
          {listing.priceUsdCents === 0
            ? formatLabel(0)
            : formatMoney(listing.priceUsdCents)}
        </p>
        {listing.isNegotiable && !locked && (
          <button
            className="hm-market-card-neg"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onNegotiate(listing);
            }}
          >
            {t("common.negotiate")}
          </button>
        )}
      </div>
    </article>
  );
}

/* ────────────── Bloc 3: Fil So-Kin (vertical, lettre) ────────────── */

function SoKinFeed({
  t,
  cityHint,
  countryHint,
  onNegotiate,
  onArticleTap,
  cartBusyId,
  lockedCats,
  formatMoney,
  formatLabel,
}: {
  t: (k: string) => string;
  cityHint: string;
  countryHint: string;
  onNegotiate: (l: PublicListing) => void;
  onArticleTap: (listing: PublicListing) => void;
  cartBusyId: string | null;
  lockedCats: string[];
  formatMoney: (c: number) => string;
  formatLabel: (c: number) => string;
}) {
  const [posts, setPosts] = useState<SoKinApiFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const { on, off } = useSocket();
  const { isLoggedIn } = useAuth();
  const [reinjectedTab, setReinjectedTab] = useState<"PRODUIT" | "SERVICE">("PRODUIT");
  const [reinjectedListings, setReinjectedListings] = useState<PublicListing[]>([]);
  const [reinjectedLoading, setReinjectedLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const navigate = useNavigate();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const loadFeed = useCallback(
    async (reset = false) => {
      if (loadingRef.current && !reset) return;
      loadingRef.current = true;
      try {
        const limit = 12;
        const currentOffset = reset ? 0 : offsetRef.current;
        const res = await sokinApi.publicFeed({
          limit,
          offset: currentOffset,
          city: cityHint,
          country: countryHint,
        });
        if (reset) {
          setPosts(res.posts);
          offsetRef.current = res.posts.length;
          setHasMore(res.posts.length >= limit);
        } else {
          setPosts((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            const fresh = res.posts.filter((p) => !ids.has(p.id));
            offsetRef.current += fresh.length;
            return [
              ...prev,
              ...fresh,
            ];
          });
          setHasMore(res.posts.length >= limit);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [cityHint, countryHint],
  );

  useEffect(() => {
    setLoading(true);
    void loadFeed(true);
  }, [loadFeed]);

  useEffect(() => {
    const handleCreated = () => {
      void loadFeed(true);
    };
    on("sokin:post-created", handleCreated);
    return () => {
      off("sokin:post-created", handleCreated);
    };
  }, [on, off, loadFeed]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current) {
          void loadFeed();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadFeed]);

  useEffect(() => {
    if (posts.length < 10) {
      setReinjectedListings([]);
      return;
    }
    let cancelled = false;
    setReinjectedLoading(true);
    (async () => {
      try {
        let results = await listingsApi.latest({ type: reinjectedTab, limit: 10, city: cityHint, country: countryHint });
        if (results.length === 0 && countryHint) {
          results = await listingsApi.latest({ type: reinjectedTab, limit: 10, country: countryHint });
        }
        if (results.length === 0) {
          results = await listingsApi.latest({ type: reinjectedTab, limit: 10 });
        }
        if (!cancelled) setReinjectedListings(results);
      } catch {
        if (!cancelled) setReinjectedListings([]);
      } finally {
        if (!cancelled) setReinjectedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [posts.length, reinjectedTab, cityHint, countryHint]);

  const handleSwipeStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleSwipeEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    if (dx < -72 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      void navigate("/sokin");
    }
  };

  const openInSoKin = (postId: string) => {
    try {
      sessionStorage.setItem("ks-home-open-comments-post-id", postId);
    } catch {
      // no-op
    }
    void navigate("/sokin");
  };

  const renderReinjectedListings = () => {
    if (posts.length < 10) return null;
    if (reinjectedLoading) return null;
    if (reinjectedListings.length === 0) return null;

    return (
      <section className="hm-section hm-listings hm-listings--reinjected" aria-label="Annonces récentes">
        <div className="hm-section-row">
          <h2 className="hm-section-title">🏪 Annonces récentes</h2>
          <Link to={`/explorer?type=${reinjectedTab === "PRODUIT" ? "produits" : "services"}`} className="hm-see-all">Voir tout →</Link>
        </div>

        <div className="hm-tabs">
          <button className={"hm-tab" + (reinjectedTab === "PRODUIT" ? " hm-tab--active" : "")} onClick={() => setReinjectedTab("PRODUIT")}>Produits</button>
          <button className={"hm-tab" + (reinjectedTab === "SERVICE" ? " hm-tab--active" : "")} onClick={() => setReinjectedTab("SERVICE")}>Services</button>
        </div>

        <div className="hm-hscroll">
          {reinjectedListings.map((l) => (
            <MarketCard
              key={`reinjected-${l.id}`}
              listing={l}
              onNegotiate={onNegotiate}
              onArticleTap={onArticleTap}
              formatMoney={formatMoney}
              formatLabel={formatLabel}
              t={t}
              locked={isCategoryLocked(lockedCats, l.category ?? "")}
              busy={cartBusyId === l.id}
            />
          ))}
        </div>
      </section>
    );
  };

  const renderItems = () => {
    const elements: React.ReactNode[] = [];
    posts.forEach((post, idx) => {
      elements.push(
        <SoKinPostCard
          key={post.id}
          post={post}
          t={t}
          onOpenComments={() => openInSoKin(post.id)}
        />,
      );
      if (idx === 9) {
        const block = renderReinjectedListings();
        if (block) elements.push(<div key="reinjected-listings">{block}</div>);
      }
      if ((idx + 1) % 4 === 0) {
        elements.push(
          <AdBanner key={"ad-" + idx} page="home" variant="slim" hideWhenEmpty />,
        );
      }
    });
    return elements;
  };

  return (
    <section className="hm-section hm-sokin" aria-label={t("home.sokinFeed")}>
      <div className="hm-section-row">
        <h2 className="hm-section-title">{"\uD83D\uDCE2 So-Kin"}</h2>
        <Link to="/sokin" className="hm-see-all">
          Voir tout →
        </Link>
      </div>

      <div className="hm-sokin-feed" onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
        {loading && posts.length === 0 ? (
          [1, 2, 3].map((i) => <div key={i} className="hm-letter-skeleton" />)
        ) : posts.length === 0 ? (
          <div className="hm-letter">
            <div className="hm-letter-head">
              <div className="hm-letter-avatar">
                <span>K</span>
              </div>
              <div className="hm-letter-author">
                <p className="hm-letter-name">So-Kin</p>
                <p className="hm-letter-city">{t("home.networkLabel")}</p>
              </div>
            </div>
            <div className="hm-letter-body">
              <p>{t("home.noSokinPosts")}</p>
            </div>
            <Link to="/sokin" className="hm-see-all">
              {t("home.publishOnSokin") + " \u2192"}
            </Link>
          </div>
        ) : (
          renderItems()
        )}
        {hasMore && <div ref={sentinelRef} className="hm-sentinel" />}
      </div>
    </section>
  );
}

/* ────────────── So-Kin Post Card (lettre) ────────────── */

function SoKinPostCard({
  post,
  t,
  onOpenComments,
}: {
  post: SoKinApiFeedPost;
  t: (k: string) => string;
  onOpenComments: () => void;
}) {
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();
  const profile = post.author?.profile;
  const name = profile?.displayName ?? t("home.defaultUser");
  const handle = (profile?.username ?? post.author.id).replace("@", "");
  const city = profile?.city;
  const initial = name.charAt(0).toUpperCase();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const tapTimeout = useRef<ReturnType<typeof setTimeout>>();

  const isVideo = (url: string) => /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);

  const handleContact = async () => {
    if (!isLoggedIn) {
      void navigate("/login");
      return;
    }
    if (!user?.id || post.author.id === user.id) return;
    try {
      const { conversation } = await messaging.createDM(post.author.id);
      void navigate(`/messaging/${conversation.id}`);
    } catch {
      void navigate("/messaging");
    }
  };

  const handleMediaTap = () => {
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = undefined;
    } else {
      tapTimeout.current = setTimeout(() => {
        tapTimeout.current = undefined;
        if (videoRef.current) {
          if (videoRef.current.paused) {
            videoRef.current.play();
            setPaused(false);
          } else {
            videoRef.current.pause();
            setPaused(true);
          }
        }
      }, 250);
    }
  };

  return (
    <article className="hm-letter">
      {/* En-tete */}
      <div className="hm-letter-head">
        <Link
          to={profile?.username ? "/user/" + profile.username : "/sokin"}
          className="hm-letter-avatar"
        >
          {profile?.avatarUrl ? (
            <img src={resolveMediaUrl(profile.avatarUrl)} alt={name} />
          ) : (
            <span>{initial}</span>
          )}
        </Link>
        <div className="hm-letter-author">
          <p className="hm-letter-name">{name}</p>
          <p className="hm-letter-city">ID: {handle}</p>
          {city && <p className="hm-letter-city">{"\uD83D\uDCCD " + city}</p>}
        </div>
        <div className="hm-letter-actions-top">
          <button
            className="hm-letter-icon-btn"
            aria-label={t("home.contact")}
            onClick={() => void handleContact()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Corps */}
      <div className="hm-letter-body" onClick={handleMediaTap}>
        {post.text && <p className="hm-letter-text">{post.text}</p>}
        {post.mediaUrls && post.mediaUrls.length > 0 && (
          <div className="hm-letter-media">
            {post.mediaUrls.map((url, i) => {
              if (isVideo(url)) {
                return (
                  <div key={i} className="hm-letter-video-wrap">
                    <video
                      ref={videoRef}
                      src={resolveMediaUrl(url)}
                      className="hm-letter-video"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                    {paused && (
                      <div className="hm-letter-video-paused">
                        &#x25B6;
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <img
                  key={i}
                  src={resolveMediaUrl(url)}
                  alt={"Media " + (i + 1)}
                  className="hm-letter-img"
                  loading="lazy"
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Pied */}
      <div className="hm-letter-foot">
        <div className="hm-letter-foot-left">
          <button className="hm-letter-react-btn" onClick={onOpenComments}>
            💬 {post.comments ?? 0} réponses
          </button>
        </div>
        <div className="hm-letter-foot-right">
          <Link
            to="/sokin"
            className="hm-letter-react-btn"
            aria-label={t("home.writeOnSokin")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ────────────── Bottom Nav ────────────── */

function BottomNav({
  visible,
  isLoggedIn,
  cartItemsCount,
  t,
}: {
  visible: boolean;
  isLoggedIn: boolean;
  cartItemsCount: number;
  t: (k: string) => string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = window.location.pathname;

  const go = (path: string) => {
    setMenuOpen(false);
    void navigate(isLoggedIn ? path : "/login");
  };

  const navCls = "hm-bottomnav" + (visible ? "" : " hm-bottomnav--hidden");

  return (
    <>
      <nav className={navCls} aria-label="Navigation principale">
        {/* Home */}
        <Link to="/" className={`hm-bnav-item${location === "/" ? " hm-bnav-item--active" : ""}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span className="hm-bnav-label">{t("nav.home")}</span>
        </Link>

        {/* Panier */}
        <Link to="/cart" className={`hm-bnav-item${location === "/cart" ? " hm-bnav-item--active" : ""}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          {cartItemsCount > 0 && <span className="hm-bnav-cart-badge">{cartItemsCount}</span>}
          <span className="hm-bnav-label">{t("nav.cart")}</span>
        </Link>

        {/* (+) Publier — Centre */}
        <button
          className={`hm-bnav-create${menuOpen ? " hm-bnav-create--open" : ""}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={t("home.createAction")}
          aria-expanded={menuOpen}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Notifications */}
        <Link
          to={isLoggedIn ? getDashboardPath(user?.role) + "?section=notifications" : "/login"}
          className="hm-bnav-item"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="hm-bnav-label">{t("nav.notifications")}</span>
        </Link>

        {/* Compte */}
        <Link
          to={isLoggedIn ? getDashboardPath(user?.role) : "/login"}
          className="hm-bnav-item"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span className="hm-bnav-label">{t("nav.account")}</span>
        </Link>
      </nav>

      {/* Bottom sheet menu du (+) */}
      {menuOpen && (
        <>
          <div
            className="hm-fab-overlay"
            onClick={() => setMenuOpen(false)}
          />
          <div className="hm-fab-menu">
            <div className="hm-fab-menu-handle" />
            <p className="hm-fab-menu-title">{t("home.createMenuTitle")}</p>
            <button
              className="hm-fab-menu-item"
              onClick={() => go("/sokin")}
            >
              <span>{"\uD83D\uDCE2"}</span>
              <span>{t("home.publishOnSokin")}</span>
            </button>
            <button
              className="hm-fab-menu-item"
              onClick={() =>
                go(
                  getDashboardPath(user?.role) +
                    "?section=sell&create=produit",
                )
              }
            >
              <span>{"\uD83D\uDECD\uFE0F"}</span>
              <span>{t("biz.addProductAction")}</span>
            </button>
            <button
              className="hm-fab-menu-item"
              onClick={() =>
                go(
                  getDashboardPath(user?.role) +
                    "?section=sell&create=service",
                )
              }
            >
              <span>{"\uD83D\uDD27"}</span>
              <span>{t("biz.addServiceAction")}</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}

/* ────────────── Main Component ────────────── */

export function HomePageMobile() {
  const { t, formatMoneyFromUsdCents, formatPriceLabelFromUsdCents } =
    useLocaleCurrency();
  const { isLoggedIn, user, logout } = useAuth();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const defaultCity = getCountryConfig(effectiveCountry).defaultCity;
  const lockedCats = useLockedCategories();
  const barsVisibleRaw = useScrollDirection();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [negotiateListing, setNegotiateListing] =
    useState<PublicListing | null>(null);
  const [buyerCart, setBuyerCart] = useState<CartSummary | null>(null);
  const [cartBusyId, setCartBusyId] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<string | null>(null);
  const navigate = useNavigate();

  const barsVisible =
    barsVisibleRaw || drawerOpen || searchOpen || Boolean(negotiateListing);
  const cartItemsCount = buyerCart?.itemsCount ?? 0;

  useEffect(() => {
    if (!isLoggedIn) {
      setBuyerCart(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cart = await ordersApi.buyerCart();
        if (!cancelled) setBuyerCart(cart);
      } catch {
        if (!cancelled) setBuyerCart(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const handleArticleTap = useCallback(
    async (listing: PublicListing) => {
      if (!isLoggedIn) {
        void navigate("/login");
        return;
      }
      if (isAdmin) {
        setCartFeedback(`🔒 ${t("home.adminNoTransact")}`);
        window.setTimeout(() => setCartFeedback(null), 2200);
        return;
      }
      if (user?.id && listing.owner.userId === user.id) {
        setCartFeedback(`⚠️ ${t("home.cannotBuyOwn")}`);
        window.setTimeout(() => setCartFeedback(null), 2200);
        return;
      }
      if (cartBusyId) return;

      setCartBusyId(listing.id);
      try {
        const summary = await ordersApi.addCartItem({ listingId: listing.id, quantity: 1 });
        const freshCart = await ordersApi.buyerCart().catch(() => summary);
        setBuyerCart(freshCart);
        setCartFeedback(`✓ ${t("home.addedToCart")}`);
      } catch {
        setCartFeedback(`✗ ${t("home.errorGeneric")}`);
      } finally {
        setCartBusyId(null);
        window.setTimeout(() => setCartFeedback(null), 1800);
      }
    },
    [cartBusyId, isAdmin, isLoggedIn, navigate, t, user?.id],
  );

  const contentCls =
    "hm-content" + (barsVisible ? "" : " hm-content--expanded");

  return (
    <div className="hm-root">
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        t={t}
        isLoggedIn={isLoggedIn}
        user={user}
        logout={logout}
      />
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        t={t}
      />
      <TopBar
        visible={barsVisible}
        onMenuOpen={() => setDrawerOpen(true)}
        onSearchToggle={() => setSearchOpen(true)}
        t={t}
      />

      <main className={contentCls}>
        <SuggestionsSection
          formatMoney={formatMoneyFromUsdCents}
          formatLabel={formatPriceLabelFromUsdCents}
          cityHint={defaultCity}
          countryHint={effectiveCountry}
          t={t}
          onArticleTap={handleArticleTap}
          cartBusyId={cartBusyId}
        />
        <ListingsSection
          formatMoney={formatMoneyFromUsdCents}
          formatLabel={formatPriceLabelFromUsdCents}
          t={t}
          onNegotiate={setNegotiateListing}
          onArticleTap={handleArticleTap}
          cartBusyId={cartBusyId}
          lockedCats={lockedCats}
          cityHint={defaultCity}
          countryHint={effectiveCountry}
        />
        <SoKinFeed
          t={t}
          cityHint={defaultCity}
          countryHint={effectiveCountry}
          onNegotiate={setNegotiateListing}
          onArticleTap={handleArticleTap}
          cartBusyId={cartBusyId}
          lockedCats={lockedCats}
          formatMoney={formatMoneyFromUsdCents}
          formatLabel={formatPriceLabelFromUsdCents}
        />
      </main>

      <BottomNav visible={barsVisible} isLoggedIn={isLoggedIn} cartItemsCount={cartItemsCount} t={t} />

      {cartFeedback && <div className="hm-cart-feedback" role="status" aria-live="polite">{cartFeedback}</div>}

      {negotiateListing && (
        <NegotiatePopup
          listing={{
            ...negotiateListing,
            ownerDisplayName: negotiateListing.owner.displayName,
          }}
          onClose={() => setNegotiateListing(null)}
          onSuccess={() => setNegotiateListing(null)}
        />
      )}
    </div>
  );
}
