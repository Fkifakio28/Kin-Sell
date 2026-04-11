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
  users as usersApi,
  businesses as businessesApi,
  resolveMediaUrl,
  ApiError,
  type PublicListing,
  type SoKinApiFeedPost,
  type SoKinApiComment,
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
import { SoKinToastProvider } from "../../components/feedback/SoKinToast";
import { AnnounceCard, type MediaItem } from "../sokin/AnnounceCard";
import { MediaViewer, CommentsDrawer, type CommentProfileState, type MissingPublicProfile } from "../sokin/SoKinShared";
import "../sokin/sokin.css";
import { InlineSearchResults } from "../../components/InlineSearchResults";
import { BundlePromoCard } from "../../components/BundlePromoCard";
import { type PromotionSummary } from "../../lib/api-client";
import NotificationCenter from "../../components/NotificationCenter";
import { useGlobalNotification } from "../../app/providers/GlobalNotificationProvider";
import TutorialOverlay, { useTutorial, TutorialRelaunchBtn } from "../../components/TutorialOverlay";
import { homeMobileSteps } from "../../components/tutorial-steps";
import "./home-mobile.css";

/* ────────────── Static data ────────────── */

const DRAWER_LINKS = {
  explorer: [
    { icon: "\uD83D\uDECD\uFE0F", labelKey: "common.products", href: "/explorer?type=produits" },
    { icon: "\uD83D\uDD27", labelKey: "common.services", href: "/explorer?type=services" },
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

function getUserDrawerLinks(role: string | undefined | null): { icon: string; labelKey: string; href: string }[] {
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    return [{ icon: "\u2699\uFE0F", labelKey: "home.drawerAdminPanel", href: "/admin/dashboard" }];
  }
  return [];
}

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

  /* ── Public page link for "Ma page Kin-Sell" ── */
  const [businessSlug, setBusinessSlug] = useState<string | null>(null);
  useEffect(() => {
    if (user?.role === "BUSINESS") {
      businessesApi.me().then((b) => setBusinessSlug(b.slug)).catch(() => {});
    }
  }, [user?.role]);

  const myPageLink = (() => {
    if (!user) return null;
    if (user.role === "BUSINESS") {
      return businessSlug ? `/business/${businessSlug}` : null;
    }
    if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return null;
    return user.profile?.username ? `/user/${user.profile.username}` : null;
  })();

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
                  ? getDashboardPath(user?.role) + "?section=articles&action=publish"
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
            <div className="hm-drawer-section">
              <p className="hm-drawer-section-title">{t("home.drawerUserSection")}</p>
              {myPageLink ? (
                <Link to={myPageLink} className="hm-drawer-link" onClick={onClose}>
                  {user?.role === "BUSINESS" ? "\uD83C\uDFE2" : "\uD83D\uDCCB"} {t("home.drawerMyPage")}
                </Link>
              ) : (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") ? (
                <span className="hm-drawer-link hm-drawer-link--disabled">
                  {"\uD83D\uDCCB"} {t("home.drawerMyPage")}
                </span>
              ) : null}
              {getUserDrawerLinks(user?.role).map((l) => (
                <Link key={l.href} to={l.href} className="hm-drawer-link" onClick={onClose}>
                  {l.icon} {t(l.labelKey)}
                </Link>
              ))}
            </div>
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
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);
  if (!open) return null;

  return (
    <div className="hm-search-overlay">
      <form className="hm-search-form" onSubmit={(e) => e.preventDefault()}>
        <input
          ref={inputRef}
          type="search"
          className="hm-search-input"
          placeholder="Rechercher sur Kin-Sell (annonces, articles, profils, boutiques...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("common.search")}
        />
        <button
          type="button"
          className="hm-search-cancel"
          onClick={() => { setQ(""); onClose(); }}
          aria-label={t("common.close")}
        >
          &times;
        </button>
      </form>
      <InlineSearchResults query={q} onNavigate={() => { setQ(""); onClose(); }} t={t} />
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
                  {item.promoActive && item.promoPriceUsdCents != null
                    ? <><s className="ks-price-old">{formatMoney(item.priceUsdCents)}</s> {formatMoney(item.promoPriceUsdCents)}</>
                    : item.priceUsdCents === 0
                    ? formatLabel(0)
                    : formatMoney(item.priceUsdCents)}
                </p>
              </button>
            ))}
      </div>
    </section>
  );
}

/* ────────────── Bloc 1.5: Lots promo ────────────── */

function BundlesSection({
  formatMoney,
  t,
  cityHint,
  countryHint,
}: {
  formatMoney: (c: number) => string;
  t: (k: string) => string;
  cityHint?: string;
  countryHint?: string;
}) {
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();
  const [bundles, setBundles] = useState<PromotionSummary[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [fb, setFb] = useState<{ id: string; msg: string } | null>(null);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  useEffect(() => {
    listingsApi.getActiveBundles(4).then(setBundles).catch(() => {});
  }, []);

  const handleCart = async (bundle: PromotionSummary, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn) { navigate("/login"); return; }
    if (isAdmin) { setFb({ id: bundle.id, msg: "🔒 Admin" }); setTimeout(() => setFb(null), 3000); return; }
    if (busy) return;
    setBusy(bundle.id);
    try {
      const bundlePrice = bundle.bundlePriceUsdCents ?? 0;
      const totalOriginal = bundle.items.reduce((s, it) => s + it.originalPriceUsdCents * it.quantity, 0);
      let remaining = bundlePrice;
      for (let i = 0; i < bundle.items.length; i++) {
        const item = bundle.items[i];
        const isLast = i === bundle.items.length - 1;
        const itemShare = isLast ? remaining : Math.round(bundlePrice * (item.originalPriceUsdCents * item.quantity) / totalOriginal);
        remaining -= itemShare;
        await ordersApi.addCartItem({ listingId: item.listing.id, quantity: item.quantity, unitPriceUsdCents: Math.max(1, Math.round(itemShare / item.quantity)) });
      }
      setFb({ id: bundle.id, msg: `✓ ${bundle.items.length} articles ajoutés` });
    } catch { setFb({ id: bundle.id, msg: "✗ Erreur" }); }
    finally { setBusy(null); setTimeout(() => setFb(null), 3000); }
  };

  if (bundles.length === 0) return null;

  return (
    <section className="hm-section hm-bundles" aria-label="Lots promo">
      <h2 className="hm-section-title">📦 Lots promo</h2>
      <div className="hm-hscroll">
        {bundles.map((b) => (
          <div key={b.id} className="hm-bundle-card-wrap">
            <BundlePromoCard
              promo={{ ...b, promoType: "BUNDLE" as const, status: "ACTIVE" as const } as any}
              resolveMediaUrl={resolveMediaUrl}
              onViewItem={(lid) => navigate(`/explorer?q=${lid}`)}
              owner={b.ownerUser?.profile}
            />
            <button
              type="button"
              className="hm-bundle-cta"
              disabled={busy === b.id}
              onClick={(e) => void handleCart(b, e)}
            >
              🛒 Ajouter au panier
            </button>
            {fb?.id === b.id && <span className="hm-bundle-fb">{fb.msg}</span>}
          </div>
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
        {listing.promoActive && listing.promoPriceUsdCents != null && (
          <span className="hm-badge hm-badge--promo">{formatMoney(listing.promoPriceUsdCents)}</span>
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
          {listing.promoActive && listing.promoPriceUsdCents != null
            ? <><s className="ks-price-old">{formatMoney(listing.priceUsdCents)}</s> {formatMoney(listing.promoPriceUsdCents)}</>
            : listing.priceUsdCents === 0
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

/* ────────────── Bloc 3: Fil So-Kin (vertical, AnnounceCard) ────────────── */

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
  const { isLoggedIn, user } = useAuth();
  const [reinjectedTab, setReinjectedTab] = useState<"PRODUIT" | "SERVICE">("PRODUIT");
  const [reinjectedListings, setReinjectedListings] = useState<PublicListing[]>([]);
  const [reinjectedLoading, setReinjectedLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const navigate = useNavigate();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  /* ── So-Kin interaction state ── */
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null);
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, SoKinApiComment[]>>({});
  const [loadingCommentsPostId, setLoadingCommentsPostId] = useState<string | null>(null);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyToComment, setReplyToComment] = useState<SoKinApiComment | null>(null);
  const [commentSort, setCommentSort] = useState<'recent' | 'relevant'>('recent');
  const [commentProfileState, setCommentProfileState] = useState<CommentProfileState>({ status: 'idle', profile: null, message: null });
  const [contactingPostId, setContactingPostId] = useState<string | null>(null);

  /* ── So-Kin handlers ── */
  const clearCommentsComposer = useCallback(() => {
    setReplyToComment(null);
    setCommentProfileState({ status: 'idle', profile: null, message: null });
    setCommentDraft('');
  }, []);

  const loadComments = useCallback(async (postId: string, sort: 'recent' | 'relevant' = 'recent') => {
    setLoadingCommentsPostId(postId);
    try {
      const data = await sokinApi.postComments(postId, { limit: 100, sort });
      setCommentsByPost((prev) => ({ ...prev, [postId]: data.comments ?? [] }));
    } catch {
      setCommentsByPost((prev) => ({ ...prev, [postId]: [] }));
    } finally {
      setLoadingCommentsPostId((prev) => (prev === postId ? null : prev));
    }
  }, []);

  const handleOpenComments = useCallback((postId: string) => {
    setOpenCommentsPostId(postId);
    setCommentSort('recent');
    clearCommentsComposer();
    void loadComments(postId, 'recent');
  }, [clearCommentsComposer, loadComments]);

  const handleCloseComments = useCallback(() => {
    setOpenCommentsPostId(null);
    clearCommentsComposer();
  }, [clearCommentsComposer]);

  const handleCommentSortChange = useCallback((newSort: 'recent' | 'relevant') => {
    setCommentSort(newSort);
    if (openCommentsPostId) void loadComments(openCommentsPostId, newSort);
  }, [openCommentsPostId, loadComments]);

  const handlePrepareReply = useCallback((comment: SoKinApiComment) => {
    const targetName = comment.author.profile?.displayName ?? 'Utilisateur';
    const mention = `@${targetName}`;
    setReplyToComment(comment);
    setCommentDraft((prev) => {
      const trimmed = prev.trim();
      if (trimmed.startsWith(mention)) return prev;
      if (!trimmed) return `${mention} `;
      return `${mention} ${trimmed}`;
    });
  }, []);

  const handleOpenCommentProfile = useCallback(async (comment: SoKinApiComment) => {
    const profilePreview: MissingPublicProfile = {
      avatarUrl: comment.author.profile?.avatarUrl ?? null,
      displayName: comment.author.profile?.displayName ?? 'Utilisateur',
      identifier: comment.author.profile?.username ? `@${comment.author.profile.username.replace('@', '')}` : comment.author.id,
    };
    const normalizeUsername = (value?: string | null) => (value ?? '').replace('@', '').trim();
    const getErrorStatus = (error: unknown) => (error instanceof ApiError ? error.status : undefined);
    const openResolvedProfile = (username: string) => {
      setCommentProfileState({ status: 'success', profile: profilePreview, message: null });
      navigate(`/user/${username}`);
    };
    setCommentProfileState({ status: 'loading', profile: profilePreview, message: 'Chargement du profil public…' });
    const directUsername = normalizeUsername(comment.author.profile?.username);
    if (directUsername) {
      try { await usersApi.publicProfile(directUsername); openResolvedProfile(directUsername); return; }
      catch (error) { if (getErrorStatus(error) !== 404) { setCommentProfileState({ status: 'error', profile: profilePreview, message: 'Erreur technique: impossible d\'ouvrir le profil public pour le moment.' }); return; } }
    }
    try {
      const payload = (await usersApi.publicProfileById(comment.author.id)) as { username?: string | null };
      const resolved = normalizeUsername(payload?.username);
      if (resolved) { openResolvedProfile(resolved); return; }
      setCommentProfileState({ status: 'not-available', profile: profilePreview, message: 'L\'utilisateur ou l\'entreprise n\'a pas de profil public ou de boutique en ligne.' });
    } catch (error) {
      if (getErrorStatus(error) === 404) { setCommentProfileState({ status: 'not-available', profile: profilePreview, message: 'L\'utilisateur ou l\'entreprise n\'a pas de profil public ou de boutique en ligne.' }); return; }
      setCommentProfileState({ status: 'error', profile: profilePreview, message: 'Erreur technique: impossible d\'ouvrir le profil public pour le moment.' });
    }
  }, [navigate]);

  const handleSubmitComment = useCallback(async () => {
    if (!openCommentsPostId) return;
    if (!isLoggedIn) { navigate('/login'); return; }
    const content = commentDraft.trim();
    if (!content) return;
    setSubmittingCommentPostId(openCommentsPostId);
    try {
      const payload = await sokinApi.createComment(openCommentsPostId, { content, parentCommentId: replyToComment?.id });
      const created = payload.comment;
      setCommentsByPost((prev) => ({ ...prev, [openCommentsPostId]: [created, ...(prev[openCommentsPostId] ?? [])] }));
      setPosts((prev) => prev.map((p) => p.id === openCommentsPostId ? { ...p, comments: (p.comments ?? 0) + 1 } : p));
      setCommentDraft('');
      setReplyToComment(null);
    } catch { /* conserver le draft */ }
    finally { setSubmittingCommentPostId((prev) => (prev === openCommentsPostId ? null : prev)); }
  }, [openCommentsPostId, isLoggedIn, navigate, commentDraft, replyToComment]);

  const handleSokinContact = useCallback(async (post: SoKinApiFeedPost) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (!user?.id || post.author.id === user.id) return;
    if (contactingPostId) return;
    setContactingPostId(post.id);
    try {
      const { conversation } = await messaging.createDM(post.author.id);
      const mainMedia = post.mediaUrls?.[0] ? resolveMediaUrl(post.mediaUrls[0]) : null;
      const textPreview = (post.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      navigate(`/messaging/${conversation.id}`, {
        state: {
          sokinPost: {
            id: post.id, text: textPreview, mediaUrl: mainMedia,
            authorName: post.author.profile?.displayName ?? 'Utilisateur',
            authorId: post.author.id,
            authorHandle: post.author.profile?.username ?? post.author.id,
          },
        },
      });
    } catch { navigate('/messaging'); }
    finally { setContactingPostId(null); }
  }, [isLoggedIn, user?.id, contactingPostId, navigate]);

  /* ── Feed loading ── */
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
            return [...prev, ...fresh];
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
    [],
  );

  useEffect(() => {
    setLoading(true);
    void loadFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleCreated = () => { void loadFeed(true); };
    on("sokin:post-created", handleCreated);
    return () => { off("sokin:post-created", handleCreated); };
  }, [on, off, loadFeed]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current) void loadFeed();
      },
      { rootMargin: "200px" },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadFeed]);

  useEffect(() => {
    if (posts.length < 10) { setReinjectedListings([]); return; }
    let cancelled = false;
    setReinjectedLoading(true);
    (async () => {
      try {
        let results = await listingsApi.latest({ type: reinjectedTab, limit: 10, city: cityHint, country: countryHint });
        if (results.length === 0 && countryHint) results = await listingsApi.latest({ type: reinjectedTab, limit: 10, country: countryHint });
        if (results.length === 0) results = await listingsApi.latest({ type: reinjectedTab, limit: 10 });
        if (!cancelled) setReinjectedListings(results);
      } catch { if (!cancelled) setReinjectedListings([]); }
      finally { if (!cancelled) setReinjectedLoading(false); }
    })();
    return () => { cancelled = true; };
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
    if (dx < -72 && Math.abs(dx) > Math.abs(dy) * 1.25) void navigate("/sokin");
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
        <AnnounceCard
          key={post.id}
          post={post}
          t={t}
          isLoggedIn={isLoggedIn}
          onMediaClick={(item) => setViewerItem(item)}
          isCommentsOpen={openCommentsPostId === post.id}
          onOpenComments={() => handleOpenComments(post.id)}
          onContact={() => void handleSokinContact(post)}
          isContacting={contactingPostId === post.id}
          feedSource="home"
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
    <>
      <section className="hm-section hm-sokin" aria-label={t("home.sokinFeed")}>
        <div className="hm-section-row">
          <h2 className="hm-section-title">{"\uD83D\uDCE2 So-Kin"}</h2>
          <Link to="/sokin" className="hm-see-all">Voir tout →</Link>
        </div>

        <SoKinToastProvider>
          <div className="hm-sokin-feed" onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
            {loading && posts.length === 0 ? (
              [1, 2, 3].map((i) => <div key={i} className="hm-letter-skeleton" />)
            ) : posts.length === 0 ? (
              <div className="hm-letter">
                <div className="hm-letter-head">
                  <div className="hm-letter-avatar"><span>K</span></div>
                  <div className="hm-letter-author">
                    <p className="hm-letter-name">So-Kin</p>
                    <p className="hm-letter-city">{t("home.networkLabel")}</p>
                  </div>
                </div>
                <div className="hm-letter-body">
                  <p>{t("home.noSokinPosts")}</p>
                </div>
                <Link to="/sokin" className="hm-see-all">{t("home.publishOnSokin") + " \u2192"}</Link>
              </div>
            ) : (
              renderItems()
            )}
            {hasMore && <div ref={sentinelRef} className="hm-sentinel" />}
          </div>
        </SoKinToastProvider>
      </section>

      {/* So-Kin overlays */}
      {viewerItem && <MediaViewer item={viewerItem} onClose={() => setViewerItem(null)} />}
      <CommentsDrawer
        post={posts.find((p) => p.id === openCommentsPostId) ?? null}
        open={Boolean(openCommentsPostId)}
        isLoggedIn={isLoggedIn}
        comments={openCommentsPostId ? (commentsByPost[openCommentsPostId] ?? []) : []}
        loading={loadingCommentsPostId === openCommentsPostId}
        draft={commentDraft}
        submitting={submittingCommentPostId === openCommentsPostId}
        replyTo={replyToComment}
        profileState={commentProfileState}
        sort={commentSort}
        onClose={handleCloseComments}
        onDraftChange={setCommentDraft}
        onSubmit={handleSubmitComment}
        onPrepareReply={handlePrepareReply}
        onOpenProfile={handleOpenCommentProfile}
        onCloseProfileState={() => setCommentProfileState({ status: 'idle', profile: null, message: null })}
        onSortChange={handleCommentSortChange}
      />
    </>
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
  const [ncOpen, setNcOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { missedCount } = useGlobalNotification();
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
        <button
          className="hm-bnav-item"
          style={{ position: 'relative' }}
          onClick={() => { if (!isLoggedIn) { void navigate("/login"); } else { setNcOpen(true); } }}
          aria-label={t("nav.notifications")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {missedCount > 0 && <span className="nc-badge">{missedCount}</span>}
          <span className="hm-bnav-label">{t("nav.notifications")}</span>
        </button>
        <NotificationCenter open={ncOpen} onClose={() => setNcOpen(false)} />

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
                    "?section=articles&action=publish",
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
                    "?section=articles&action=publish",
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
  const tutorial = useTutorial("home-mobile");

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
        <BundlesSection
          formatMoney={formatMoneyFromUsdCents}
          t={t}
          cityHint={defaultCity}
          countryHint={effectiveCountry}
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

      <TutorialOverlay pageKey="home-mobile" steps={homeMobileSteps} open={tutorial.isOpen} onClose={tutorial.close} />
      {!tutorial.isOpen && <TutorialRelaunchBtn reset={tutorial.reset} start={tutorial.start} />}
    </div>
  );
}
