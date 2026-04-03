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
  type AppCurrency,
  type AppLanguage,
} from "../../app/providers/LocaleCurrencyProvider";
import { useMarketPreference } from "../../app/providers/MarketPreferenceProvider";
import { getDashboardPath } from "../../utils/role-routing";
import {
  listings as listingsApi,
  sokin as sokinApi,
  type PublicListing,
  type SoKinApiFeedPost,
  type SoKinReactionType,
} from "../../lib/api-client";
import { NegotiatePopup } from "../negotiations/NegotiatePopup";
import { AdBanner } from "../../components/AdBanner";
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
    { icon: "\uD83D\uDC64", labelKey: "home.sokinProfiles", href: "/sokin/profiles" },
    { icon: "\uD83C\uDFEC", labelKey: "home.sokinMarket", href: "/sokin/market" },
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

const LANGUAGE_OPTIONS: Array<{ code: AppLanguage; label: string }> = [
  { code: "fr", label: "Francais" },
  { code: "en", label: "English" },
  { code: "ln", label: "Lingala" },
];

const CURRENCY_OPTIONS: Array<{ code: AppCurrency; label: string }> = [
  { code: "CDF", label: "CDF (FC)" },
  { code: "USD", label: "USD ($)" },
  { code: "EUR", label: "EUR (\u20AC)" },
  { code: "XAF", label: "XAF (FCFA)" },
  { code: "XOF", label: "XOF (CFA)" },
  { code: "AOA", label: "AOA (Kz)" },
  { code: "MAD", label: "MAD (DH)" },
];

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
  const { language, setLanguage, currency, setCurrency } = useLocaleCurrency();
  const {
    countries,
    detectedCountry,
    selectedCountry,
    effectiveCountry,
    selectionMode,
    setSelectionMode,
    setSelectedCountry,
    getCountryConfig,
  } = useMarketPreference();
  const displayName =
    user?.profile?.displayName || user?.profile?.username || null;
  const activeCountry = getCountryConfig(effectiveCountry);

  const handleLogout = async () => {
    await logout();
    onClose();
    void navigate("/");
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
          <label className="hm-drawer-pref-label" htmlFor="hm-country-mode">
            {t("home.marketMode")}
          </label>
          <select
            id="hm-country-mode"
            className="hm-drawer-pref-select"
            value={selectionMode}
            onChange={(e) =>
              setSelectionMode(
                e.target.value === "manual" ? "manual" : "auto",
              )
            }
          >
            <option value="auto">{t("home.marketModeAuto")}</option>
            <option value="manual">{t("home.marketModeManual")}</option>
          </select>

          <label
            className="hm-drawer-pref-label"
            htmlFor="hm-country-select"
          >
            {t("home.marketCountry")}
          </label>
          <select
            id="hm-country-select"
            className="hm-drawer-pref-select"
            value={
              selectionMode === "manual" ? selectedCountry : effectiveCountry
            }
            onChange={(e) =>
              setSelectedCountry(e.target.value as typeof selectedCountry)
            }
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
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

          <label
            className="hm-drawer-pref-label"
            htmlFor="hm-language-select"
          >
            {t("footer.language")}
          </label>
          <select
            id="hm-language-select"
            className="hm-drawer-pref-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as AppLanguage)}
          >
            {LANGUAGE_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>

          <label
            className="hm-drawer-pref-label"
            htmlFor="hm-currency-select"
          >
            {t("footer.currency")}
          </label>
          <select
            id="hm-currency-select"
            className="hm-drawer-pref-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as AppCurrency)}
          >
            {CURRENCY_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </select>
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
          placeholder={t("home.searchPlaceholder")}
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
}: {
  formatMoney: (c: number) => string;
  formatLabel: (c: number) => string;
  cityHint?: string;
  countryHint?: string;
  t: (k: string) => string;
}) {
  const [items, setItems] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const results = await listingsApi.latest({ limit: 12 });
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
        {"\uD83D\uDD25 " + t("home.suggestedArticles")}
      </h2>
      <div className="hm-hscroll">
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <div key={i} className="hm-card-skeleton hm-card-skeleton--small" />
            ))
          : items.map((item) => (
              <Link
                key={item.id}
                to={
                  item.owner.username
                    ? "/user/" + item.owner.username + "#listing-" + item.id
                    : "/explorer"
                }
                className="hm-suggestion-card"
              >
                <div className="hm-suggestion-img">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} loading="lazy" />
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
              </Link>
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
  lockedCats,
}: {
  formatMoney: (c: number) => string;
  formatLabel: (c: number) => string;
  t: (k: string) => string;
  onNegotiate: (l: PublicListing) => void;
  lockedCats: string[];
}) {
  const [activeTab, setActiveTab] = useState<"PRODUIT" | "SERVICE">("PRODUIT");
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const results = await listingsApi.latest({
          type: activeTab,
          limit: 10,
        });
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
  }, [activeTab]);

  return (
    <section
      className="hm-section hm-listings"
      aria-label={t("home.recentListings")}
    >
      <div className="hm-section-row">
        <h2 className="hm-section-title">
          {"\uD83C\uDFEA " + t("home.recentListings")}
        </h2>
        <Link
          to={
            "/explorer?type=" +
            (activeTab === "PRODUIT" ? "produits" : "services")
          }
          className="hm-see-all"
        >
          {t("home.viewAll")}
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
              formatMoney={formatMoney}
              formatLabel={formatLabel}
              t={t}
              locked={isCategoryLocked(lockedCats, l.category ?? "")}
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
  return (
    <Link
      to={
        listing.owner.username
          ? "/user/" + listing.owner.username + "#listing-" + listing.id
          : "/explorer"
      }
      className="hm-market-card"
    >
      <div className="hm-market-card-img">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt={listing.title} loading="lazy" />
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
    </Link>
  );
}

/* ────────────── Bloc 3: Fil So-Kin (vertical, lettre) ────────────── */

function SoKinFeed({
  t,
  cityHint,
  countryHint,
}: {
  t: (k: string) => string;
  cityHint: string;
  countryHint: string;
}) {
  const [posts, setPosts] = useState<SoKinApiFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const { on, off } = useSocket();
  const { isLoggedIn } = useAuth();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);

  const loadFeed = useCallback(
    async (reset = false) => {
      if (loadingRef.current && !reset) return;
      loadingRef.current = true;
      try {
        const res = await sokinApi.publicFeed({
          limit: 12,
          city: cityHint,
          country: countryHint,
        });
        if (reset) {
          setPosts(res.posts);
        } else {
          setPosts((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            return [
              ...prev,
              ...res.posts.filter((p) => !ids.has(p.id)),
            ];
          });
        }
        if (res.posts.length < 12) setHasMore(false);
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
    const handleShared = (p: { postId: string; shares: number }) => {
      setPosts((prev) =>
        prev.map((post) =>
          post.id === p.postId ? { ...post, shares: p.shares } : post,
        ),
      );
    };
    on("sokin:post-created", handleCreated);
    on("sokin:post-shared", handleShared);
    return () => {
      off("sokin:post-created", handleCreated);
      off("sokin:post-shared", handleShared);
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

  const handleReact = async (postId: string, type: SoKinReactionType) => {
    if (!isLoggedIn) return;
    try {
      const post = posts.find((p) => p.id === postId);
      if (post?.myReaction === type) {
        await sokinApi.unreactToPost(postId);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, myReaction: null, likes: Math.max(0, p.likes - 1) }
              : p,
          ),
        );
      } else {
        await sokinApi.reactToPost(postId, type);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  myReaction: type,
                  likes: p.likes + (p.myReaction ? 0 : 1),
                }
              : p,
          ),
        );
      }
    } catch {
      /* ignore */
    }
  };

  const handleShare = async (postId: string) => {
    if (!isLoggedIn) return;
    try {
      const res = await sokinApi.sharePost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, shares: res.shares } : p,
        ),
      );
    } catch {
      /* ignore */
    }
  };

  const renderItems = () => {
    const elements: React.ReactNode[] = [];
    posts.forEach((post, idx) => {
      elements.push(
        <SoKinPostCard
          key={post.id}
          post={post}
          t={t}
          onReact={handleReact}
          onShare={handleShare}
          isLoggedIn={isLoggedIn}
        />,
      );
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
          {t("home.viewAll")}
        </Link>
      </div>

      <div className="hm-sokin-feed">
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
  onReact,
  onShare,
  isLoggedIn,
}: {
  post: SoKinApiFeedPost;
  t: (k: string) => string;
  onReact: (id: string, type: SoKinReactionType) => void;
  onShare: (id: string) => void;
  isLoggedIn: boolean;
}) {
  const profile = post.author?.profile;
  const name = profile?.displayName ?? t("home.defaultUser");
  const city = profile?.city;
  const initial = name.charAt(0).toUpperCase();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const tapTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [liked, setLiked] = useState(false);

  const isVideo = (url: string) => /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);

  const handleMediaTap = () => {
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = undefined;
      setLiked(true);
      setTimeout(() => setLiked(false), 600);
      onReact(post.id, "LIKE");
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
            <img src={profile.avatarUrl} alt={name} />
          ) : (
            <span>{initial}</span>
          )}
        </Link>
        <div className="hm-letter-author">
          <p className="hm-letter-name">{name}</p>
          {city && <p className="hm-letter-city">{"\uD83D\uDCCD " + city}</p>}
        </div>
        <div className="hm-letter-actions-top">
          <button
            className="hm-letter-icon-btn"
            aria-label={t("home.contact")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            className="hm-letter-icon-btn"
            aria-label="Favoris"
            onClick={() => onReact(post.id, "LOVE")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={post.myReaction === "LOVE" ? "var(--color-primary)" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
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
                      src={url}
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
                  src={url}
                  alt={"Media " + (i + 1)}
                  className="hm-letter-img"
                  loading="lazy"
                />
              );
            })}
            {liked && (
              <div className="hm-letter-like-burst">&#x2764;&#xFE0F;</div>
            )}
          </div>
        )}
      </div>

      {/* Pied */}
      <div className="hm-letter-foot">
        <div className="hm-letter-foot-left">
          <button
            className={
              "hm-letter-react-btn" +
              (post.myReaction === "LIKE" ? " hm-letter-react-btn--active" : "")
            }
            onClick={() => onReact(post.id, "LIKE")}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={post.myReaction === "LIKE" ? "var(--color-primary)" : "none"}
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
            <span>{post.likes}</span>
          </button>
          <button
            className="hm-letter-react-btn"
            onClick={() => onReact(post.id, "SAD")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M10 15V9a3 3 0 0 1 3-3l4 9V4H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"
                transform="rotate(180 12 12)"
              />
            </svg>
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
          <button
            className="hm-letter-react-btn"
            onClick={() => onShare(post.id)}
            aria-label={t("home.share")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {post.shares > 0 && <span>{post.shares}</span>}
          </button>
        </div>
      </div>
    </article>
  );
}

/* ────────────── Bottom Nav ────────────── */

function BottomNav({
  visible,
  isLoggedIn,
  t,
}: {
  visible: boolean;
  isLoggedIn: boolean;
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
  const barsVisible = useScrollDirection();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [negotiateListing, setNegotiateListing] =
    useState<PublicListing | null>(null);

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
        />
        <ListingsSection
          formatMoney={formatMoneyFromUsdCents}
          formatLabel={formatPriceLabelFromUsdCents}
          t={t}
          onNegotiate={setNegotiateListing}
          lockedCats={lockedCats}
        />
        <SoKinFeed
          t={t}
          cityHint={defaultCity}
          countryHint={effectiveCountry}
        />
      </main>

      <BottomNav visible={barsVisible} isLoggedIn={isLoggedIn} t={t} />

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
