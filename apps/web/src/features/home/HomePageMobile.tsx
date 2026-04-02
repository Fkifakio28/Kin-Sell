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

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency, type AppCurrency, type AppLanguage } from "../../app/providers/LocaleCurrencyProvider";
import { useMarketPreference } from "../../app/providers/MarketPreferenceProvider";
import { getDashboardPath } from "../../utils/role-routing";
import {
  listings as listingsApi,
  orders as ordersApi,
  sokin as sokinApi,
  type PublicListing,
  type SoKinApiFeedPost,
} from "../../lib/api-client";
import { NegotiatePopup } from "../negotiations/NegotiatePopup";
import { AdBanner } from "../../components/AdBanner";
import { useLockedCategories, isCategoryLocked } from "../../hooks/useLockedCategories";
import { usePwaInstall } from "../../hooks/usePwaInstall";
import { useSocket } from "../../hooks/useSocket";
import "./home-mobile.css";

// ─────────────────────────────────────────────────────────────
// Swipe helper — detect horizontal swipe on an element
// ─────────────────────────────────────────────────────────────
function useSwipe(ref: React.RefObject<HTMLElement | null>, onSwipeLeft?: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0 && onSwipeLeft) onSwipeLeft();
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => { el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchend", onTouchEnd); };
  }, [ref, onSwipeLeft]);
}

// ─────────────────────────────────────────────────────────────
// Static data
// ─────────────────────────────────────────────────────────────

const DRAWER_LINKS = {
  explorer: [
    { icon: "🛍️", labelKey: "common.products", href: "/explorer?type=produits" },
    { icon: "🔧", labelKey: "common.services", href: "/explorer?type=services" },
  ],
  user: [
    { icon: "🏪", labelKey: "home.drawerSellSpace", href: "__DASHBOARD__?section=sell" },
    { icon: "🛒", labelKey: "home.drawerBuySpace", href: "__DASHBOARD__?section=buy" },
  ],
  public: [
    { icon: "📢", labelKey: "home.sokinFeed", href: "/sokin" },
    { icon: "👤", labelKey: "home.sokinProfiles", href: "/sokin/profiles" },
    { icon: "🏬", labelKey: "home.sokinMarket", href: "/sokin/market" },
  ],
  info: [
    { icon: "ℹ️", labelKey: "home.aboutUs", href: "/about" },
    { icon: "❓", labelKey: "home.faq", href: "/faq" },
    { icon: "📖", labelKey: "nav.guide", href: "/guide" },
    { icon: "📞", labelKey: "home.contact", href: "/contact" },
    { icon: "🔒", labelKey: "nav.privacy", href: "/privacy" },
    { icon: "⚖️", labelKey: "home.terms", href: "/terms" },
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

const LANGUAGE_OPTIONS: Array<{ code: AppLanguage; label: string }> = [
  { code: "fr", label: "Francais" },
  { code: "en", label: "English" },
  { code: "ln", label: "Lingala" },
];

const CURRENCY_OPTIONS: Array<{ code: AppCurrency; label: string }> = [
  { code: "CDF", label: "CDF (FC)" },
  { code: "USD", label: "USD ($)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "XAF", label: "XAF (FCFA)" },
  { code: "XOF", label: "XOF (CFA)" },
  { code: "AOA", label: "AOA (Kz)" },
  { code: "MAD", label: "MAD (DH)" },
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
  const displayName = user?.profile?.displayName || user?.profile?.username || null;
  const activeCountry = getCountryConfig(effectiveCountry);

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
        aria-label={t('nav.ariaMain')}
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
                  {user.role === "BUSINESS" ? `🏢 ${t('home.businessRole')}` : user.role === "ADMIN" ? `⚡ ${t('home.svc.admin')}` : `👤 ${t('home.userRole')}`}
                </span>
              </div>
            </div>
          ) : (
            <div className="ksm-drawer-profile">
              <div className="ksm-drawer-avatar">
                <span className="ksm-drawer-avatar-initial">?</span>
              </div>
              <div className="ksm-drawer-profile-info">
                <p className="ksm-drawer-profile-name">{t('home.visitor')}</p>
                <span className="ksm-drawer-profile-badge">{t('home.visitorMode')}</span>
              </div>
            </div>
          )}
          <button
            className="ksm-drawer-close"
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
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
            📝 {t('publish.publishArticle')}
          </button>
        </div>

        <div className="ksm-drawer-market-prefs">
          <p className="ksm-drawer-section-title">{t('home.drawerMarketPrefs')}</p>
          <label className="ksm-drawer-pref-label" htmlFor="ksm-country-mode">{t('home.marketMode')}</label>
          <select
            id="ksm-country-mode"
            className="ksm-drawer-pref-select"
            value={selectionMode}
            onChange={(e) => setSelectionMode(e.target.value === 'manual' ? 'manual' : 'auto')}
          >
            <option value="auto">{t('home.marketModeAuto')}</option>
            <option value="manual">{t('home.marketModeManual')}</option>
          </select>

          <label className="ksm-drawer-pref-label" htmlFor="ksm-country-select">{t('home.marketCountry')}</label>
          <select
            id="ksm-country-select"
            className="ksm-drawer-pref-select"
            value={selectionMode === 'manual' ? selectedCountry : effectiveCountry}
            onChange={(e) => setSelectedCountry(e.target.value as typeof selectedCountry)}
          >
            {countries.map((country) => (
              <option key={country.code} value={country.code}>{country.name}</option>
            ))}
          </select>

          <p className="ksm-drawer-pref-hint">
            {t('home.marketDetected').replace('{country}', getCountryConfig(detectedCountry).name)}
          </p>
          <p className="ksm-drawer-pref-hint">
            {t('home.marketActive').replace('{country}', activeCountry.name).replace('{region}', activeCountry.region)}
          </p>

          <label className="ksm-drawer-pref-label" htmlFor="ksm-language-select">{t('footer.language')}</label>
          <select
            id="ksm-language-select"
            className="ksm-drawer-pref-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as AppLanguage)}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>

          <label className="ksm-drawer-pref-label" htmlFor="ksm-currency-select">{t('footer.currency')}</label>
          <select
            id="ksm-currency-select"
            className="ksm-drawer-pref-select"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as AppCurrency)}
          >
            {CURRENCY_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </div>

        {/* Sections */}
        <nav className="ksm-drawer-nav" aria-label={t('nav.ariaMain')}>
          <DrawerSection title={t('home.drawerExploreSection')} links={DRAWER_LINKS.explorer} onClose={onClose} t={t} />
          {isLoggedIn && <DrawerSection title={t('home.drawerUserSection')} links={DRAWER_LINKS.user.map(l => ({ ...l, href: l.href.replace('__DASHBOARD__', getDashboardPath(user?.role)) }))} onClose={onClose} t={t} />}
          <DrawerSection title={t('home.drawerPublicSection')} links={DRAWER_LINKS.public} onClose={onClose} t={t} />
          <DrawerSection title={t('home.drawerInfoSection')} links={DRAWER_LINKS.info} onClose={onClose} t={t} />
        </nav>

        {/* Bottom auth actions */}
        <div className="ksm-drawer-footer">
          <div className="ksm-drawer-socials" aria-label={t('footer.social')}>
            <a href="https://web.facebook.com/profile.php?id=61576537875599" className="ksm-drawer-social-btn" aria-label="Facebook" title="Facebook" target="_blank" rel="noopener noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
            <a href="https://www.instagram.com/kin.sell/" className="ksm-drawer-social-btn" aria-label="Instagram" title="Instagram" target="_blank" rel="noopener noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
            <a href="https://x.com/Kinsell_marketP" className="ksm-drawer-social-btn" aria-label="X (Twitter)" title="X" target="_blank" rel="noopener noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://www.linkedin.com/in/kin-sell-marketplace/" className="ksm-drawer-social-btn" aria-label="LinkedIn" title="LinkedIn" target="_blank" rel="noopener noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
            <a href="https://www.tiktok.com/@kinsell1" className="ksm-drawer-social-btn" aria-label="TikTok" title="TikTok" target="_blank" rel="noopener noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.82a8.18 8.18 0 0 0 4.79 1.53V6.88a4.85 4.85 0 0 1-1.02-.19z"/></svg>
            </a>
            <a href="https://www.reddit.com/user/Kin-sell/" className="ksm-drawer-social-btn" aria-label="Reddit" title="Reddit" target="_blank" rel="noopener noreferrer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.2 15.1c.1.1.1.2 0 .3-.6.6-1.3.9-2.2.9-.9 0-1.7-.3-2.2-.9-.1-.1-.1-.2 0-.3.1-.1.2-.1.3 0 .4.5 1.1.8 1.9.8s1.5-.3 1.9-.8c.1-.1.2-.1.3 0zM10.8 13.1c0-.5-.4-.9-.9-.9s-.9.4-.9.9.4.9.9.9.9-.4.9-.9zm4.2-.9c-.5 0-.9.4-.9.9s.4.9.9.9.9-.4.9-.9-.4-.9-.9-.9zm5 1c0-1.2-.7-2.3-1.8-3 .1-.2.1-.5.1-.7 0-.8-.6-1.4-1.4-1.4-.6 0-1.1.3-1.3.8-1-.7-2.2-1.1-3.5-1.2l.6-2.6 1.8.4c.1.6.7 1.1 1.3 1.1.8 0 1.4-.6 1.4-1.4S17.7 3.8 16.9 3.8c-.6 0-1.2.4-1.3 1l-2-.4c-.1 0-.2.1-.2.2l-.6 2.8c-1.3 0-2.6.4-3.6 1.2-.3-.4-.7-.6-1.2-.6-.8 0-1.4.6-1.4 1.4 0 .2 0 .4.1.6-1.1.7-1.8 1.8-1.8 3 0 2.2 2.6 4 5.8 4s5.8-1.8 5.8-4zm-10.9 7.7c-4.3 0-7.8-3.5-7.8-7.8S4.8 5.3 9.1 5.3s7.8 3.5 7.8 7.8-3.5 7.8-7.8 7.8z"/></svg>
            </a>
          </div>

          {isLoggedIn ? (
            <button className="ksm-drawer-logout-btn" onClick={handleLogout}>
              🚪 {t('common.logout')}
            </button>
          ) : (
            <div className="ksm-drawer-auth-btns">
              <Link to="/login" className="ksm-drawer-login-btn" onClick={onClose}>
                🔑 {t('auth.loginBtn')}
              </Link>
              <Link to="/register" className="ksm-drawer-register-btn" onClick={onClose}>
                ✨ {t('common.signup')}
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
    <div className="ksm-drawer-section">
      <p className="ksm-drawer-section-title">{title}</p>
      {links.map((l) => (
        <Link
          key={l.href}
          to={l.href}
          className="ksm-drawer-link"
          onClick={onClose}
        >
          {l.icon} {t(l.labelKey)}
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
  t,
}: {
  onMenuOpen: () => void;
  onRefresh: () => void;
  onSearchToggle: () => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  t: (k: string) => string;
}) {
  return (
    <header className="ksm-header-v2" role="banner">
      <button className="ksm-hv2-btn" onClick={onMenuOpen} aria-label={t('nav.openMenu')}>
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
        <button className="ksm-hv2-btn" onClick={onRefresh} aria-label={t('user.refresh')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <button className="ksm-hv2-btn" onClick={onSearchToggle} aria-label={t('common.search')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </button>
        <button className="ksm-hv2-btn" onClick={onFullscreenToggle} aria-label={t(isFullscreen ? 'home.fullscreenExit' : 'home.fullscreenEnter')}>
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
    void navigate(`/explorer?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="ksm-search-overlay">
      <form className="ksm-search-overlay-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="search"
          className="ksm-search-overlay-input"
          placeholder={t('home.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('common.search')}
        />
        <button type="submit" className="ksm-search-overlay-btn" aria-label={t('common.search')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </button>
        <button type="button" className="ksm-search-overlay-cancel" onClick={onClose} aria-label={t('common.close')}>
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
    const load = async () => {
      try {
        const results = await listingsApi.latest({ limit: 12 });
        if (!cancelled) setItems(results);
      } catch { if (!cancelled) setItems([]); }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [cityHint, countryHint]);

  if (!loading && items.length === 0) return null;

  return (
    <section className="ksm-suggestions" aria-label={t('home.suggestedArticles')}>
      <h2 className="ksm-section-title">🔥 {t('home.suggestedArticles')}</h2>
      <div className="ksm-suggestions-scroll">
        {loading
          ? [1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="ksm-suggestion-skeleton" aria-hidden="true" />
            ))
          : items.map((item) => (
              <Link
                key={item.id}
                to={item.owner.username ? `/user/${item.owner.username}#listing-${item.id}` : `/explorer`}
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
function SoKinFeedSection({ t, cityHint, countryHint }: { t: (k: string) => string; cityHint: string; countryHint: string }) {
  const [posts, setPosts] = useState<SoKinApiFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const { on, off } = useSocket();

  const loadFeed = useCallback(async () => {
    try {
      const res = await sokinApi.publicFeed({ limit: 12, city: cityHint, country: countryHint });
      setPosts(res.posts);
    } catch {
      setPosts([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await sokinApi.publicFeed({ limit: 12, city: cityHint, country: countryHint });
        if (!cancelled) setPosts(res.posts);
      } catch {
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [cityHint, countryHint, loadFeed]);

  useEffect(() => {
    const handlePostCreated = () => {
      void loadFeed();
    };

    const handlePostShared = (payload: {
      type: 'SOKIN_POST_SHARED';
      postId: string;
      shares: number;
      sourceUserId: string;
      updatedAt: string;
    }) => {
      setPosts((prev) => prev.map((post) => (post.id === payload.postId ? { ...post, shares: payload.shares } : post)));
    };

    on('sokin:post-created', handlePostCreated);
    on('sokin:post-shared', handlePostShared);

    return () => {
      off('sokin:post-created', handlePostCreated);
      off('sokin:post-shared', handlePostShared);
    };
  }, [on, off, loadFeed]);

  // Insert ad slots every 4 posts
  const renderPostsWithAds = (items: SoKinApiFeedPost[]) => {
    const elements: React.ReactNode[] = [];
    items.forEach((post, idx) => {
      const profile = post.author?.profile;
      const name = profile?.displayName ?? t('home.defaultUser');
      const city = profile?.city;
      const initial = name.charAt(0).toUpperCase();

      elements.push(
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
              {post.mediaUrls.slice(0, 3).map((url, i) => (
                <img key={i} src={url} alt={`Media ${i + 1}`} className="ksm-feed-media-img" loading="lazy" />
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

      // Ad slot every 4 posts (after 4th, 8th, etc.)
      if ((idx + 1) % 4 === 0) {
        elements.push(
          <AdBanner key={`ad-${idx}`} page="home" variant="slim" hideWhenEmpty />
        );
      }
    });
    return elements;
  };

  return (
    <section className="ksm-sokin-feed" aria-label={t('home.sokinFeed')}>
      <div className="ksm-sokin-feed-header">
        <h2 className="ksm-section-title">📢 {t('home.sokinFeed')}</h2>
        <Link to="/sokin" className="ksm-feed-see-all">{t('home.viewAll')}</Link>
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
                <p className="ksm-feed-post-city">{t('home.networkLabel')}</p>
              </div>
            </div>
            <p className="ksm-feed-post-text">
              {t('home.noSokinPosts')}
            </p>
            <div className="ksm-feed-post-stats">
              <span>❤️ 0</span>
              <span>💬 0</span>
              <span>↗️ 0</span>
            </div>
            <Link to="/sokin" className="ksm-feed-see-all" style={{ alignSelf: "flex-start" }}>
              {t('home.publishOnSokin')} →
            </Link>
          </article>
        ) : (
          renderPostsWithAds(posts)
        )}
      </div>

      <div className="ksm-sokin-links">
        <Link to="/sokin/profiles" className="ksm-feed-see-all">{t('home.sokinProfiles')}</Link>
        <Link to="/sokin/market" className="ksm-feed-see-all">{t('home.sokinMarket')}</Link>
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
    <Link to={listing.owner.username ? `/user/${listing.owner.username}#listing-${listing.id}` : `/explorer`} className="ksm-card" aria-label={listing.title}>
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
      <div className="ksm-account-popup" role="dialog" aria-label={t('nav.accountAria')}>
        {isLoggedIn ? (
          <>
            <button
              className="ksm-account-popup-item"
              onClick={() => { onClose(); void navigate(getDashboardPath(user?.role)); }}
            >
              👤 {t('common.myAccount')}
            </button>
            <button
              className="ksm-account-popup-item"
              onClick={() => {
                onClose();
                sessionStorage.setItem("ud-section", "messages");
                void navigate(getDashboardPath(user?.role));
              }}
            >
              💬 {t('common.messages')}
            </button>
            <div className="ksm-account-popup-divider" />
            <button className="ksm-account-popup-item ksm-account-popup-item--danger" onClick={handleLogout}>
              🚪 {t('common.logout')}
            </button>
          </>
        ) : (
          <>
            <button className="ksm-account-popup-item" onClick={() => { onClose(); void navigate("/login"); }}>
              🔑 {t('common.login')}
            </button>
            <div className="ksm-account-popup-divider" />
            <button className="ksm-account-popup-item" onClick={() => { onClose(); void navigate("/register"); }}>
              ✨ {t('common.signup')}
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
  t,
}: {
  open: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
  t: (k: string) => string;
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
      <div className="ksm-create-menu" role="dialog" aria-label={t('home.createAction')}>
        <div className="ksm-create-menu-handle" aria-hidden="true" />
        <p className="ksm-create-menu-title">{t('home.createMenuTitle')}</p>
        <button className="ksm-create-item" onClick={() => go("/sokin")}>
          <span className="ksm-create-item-icon" aria-hidden="true">📢</span>
          <span>{t('home.publishOnSokin')}</span>
        </button>
        <button className="ksm-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=sell&create=produit`)}>
          <span className="ksm-create-item-icon" aria-hidden="true">🛍️</span>
          <span>{t('biz.addProductAction')}</span>
        </button>
        <button className="ksm-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=sell&create=service`)}>
          <span className="ksm-create-item-icon" aria-hidden="true">🔧</span>
          <span>{t('biz.addServiceAction')}</span>
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
    <nav className="ksm-bottom-nav-v2" aria-label={t('nav.ariaMain')}>
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
        <span>{t('home.cartLabel')}</span>
      </Link>

      {/* + FAB center */}
      <button
        className={`ksm-bnav2-fab${activePopup === "create" ? " ksm-bnav2-fab--active" : ""}`}
        onClick={() => onToggle("create")}
        aria-label={t('home.createAction')}
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
        aria-label={t('home.notifications')}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {notificationsCount > 0 && <span className="ksm-bnav2-badge">{notificationsCount}</span>}
        <span>{t('home.notifications')}</span>
      </button>

      {/* Compte */}
      <button
        className={`ksm-bnav2-item${activePopup === "account" ? " ksm-bnav2-item--active" : ""}`}
        onClick={() => onToggle("account")}
        aria-label={t('home.account')}
        aria-expanded={activePopup === "account"}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>{t('home.account')}</span>
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
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const defaultCity = getCountryConfig(effectiveCountry).defaultCity;
  const { on, off } = useSocket();
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

  const reloadCounts = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const [cart, buyerData, sellerData] = await Promise.all([
        ordersApi.buyerCart().catch(() => null),
        ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
        ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
      ]);
      setCartItemsCount(cart?.itemsCount ?? 0);
      setNotificationsCount((buyerData?.orders.length ?? 0) + (sellerData?.orders.length ?? 0));
    } catch {
      setCartItemsCount(0);
      setNotificationsCount(0);
    }
  }, [isLoggedIn]);

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

  useEffect(() => {
    const handleOrderChanged = () => {
      void reloadCounts();
    };

    const handleNegotiationChanged = () => {
      void reloadCounts();
    };

    on('order:status-updated', handleOrderChanged);
    on('order:delivery-confirmed', handleOrderChanged);
    on('negotiation:updated', handleNegotiationChanged);

    return () => {
      off('order:status-updated', handleOrderChanged);
      off('order:delivery-confirmed', handleOrderChanged);
      off('negotiation:updated', handleNegotiationChanged);
    };
  }, [on, off, reloadCounts]);

  const handleTogglePopup = (p: "account" | "create") => {
    setActivePopup((prev) => (prev === p ? null : p));
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  // iOS install hint
  const showIosHint = platform === "ios";

  // Swipe left → SoKin Live
  const rootRef = useRef<HTMLDivElement>(null);
  useSwipe(rootRef, () => void navigate("/sokin/live"));

  return (
    <div className="ksm-root-v2" ref={rootRef}>

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
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} t={t} />

      {/* ── COMPACT HEADER ── */}
      <MobileHeader
        onMenuOpen={() => setDrawerOpen(true)}
        onRefresh={handleRefresh}
        onSearchToggle={() => setSearchOpen(true)}
        isFullscreen={isFullscreen}
        onFullscreenToggle={toggleFullscreen}
        t={t}
      />

      {/* ── IOS INSTALL HINT ── */}
      {showIosHint && (
        <div className="ksm-ios-hint" role="status">
          📲 {t('home.iosInstallHint')}
        </div>
      )}

      {/* ── SUGGESTIONS (Stories) ── */}
      <SuggestionsRow
        formatMoney={formatMoneyFromUsdCents}
        formatLabel={formatPriceLabelFromUsdCents}
        cityHint={defaultCity}
        countryHint={effectiveCountry}
        t={t}
      />

      {/* ── CATALOGUE RÉCENT ── */}
      <section className="ksm-listings-section" aria-label={t('home.recentListings')}>
        <div className="ksm-section-header">
          <h2 className="ksm-section-title">🏪 {t('home.recentListings')}</h2>
          <Link
            to={`/explorer?type=${activeTab === "PRODUIT" ? "produits" : "services"}`}
            className="ksm-feed-see-all"
          >
            {t('home.viewAll')}
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
          <div className="ksm-listings-scroll">
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
      <SoKinFeedSection t={t} cityHint={defaultCity} countryHint={effectiveCountry} />

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
        t={t}
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

