import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "../app/providers/AuthProvider";
import { useLocaleCurrency } from "../app/providers/LocaleCurrencyProvider";
import { getDashboardPath } from "../utils/role-routing";
import { orders as ordersApi, resolveMediaUrl } from "../lib/api-client";
import { RegionLanguageCurrencySelector } from "./RegionLanguageCurrencySelector";

const INFO_ITEMS = [
  { titleKey: "nav.about", href: "/about" },
  { titleKey: "nav.terms", href: "/terms" },
  { titleKey: "nav.guide", href: "/guide" },
  { titleKey: "nav.howItWorks", href: "/how-it-works" },
  { titleKey: "nav.privacy", href: "/privacy" },
  { titleKey: "nav.legal", href: "/legal" },
  { titleKey: "nav.blog", href: "/blog" },
  { titleKey: "nav.faq", href: "/faq" },
  { titleKey: "nav.contact", href: "/contact" },
];

type Notification = {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: string;
  time: string;
};

function getAccountLabel(user: { role: string; profile: { username: string | null; displayName: string }; email: string | null }) {
  return user.profile.username || user.profile.displayName || user.email || "Compte";
}

function getAccountInitial(user: { profile: { username: string | null; displayName: string }; email: string | null }) {
  const source = user.profile.displayName || user.profile.username || user.email || "K";
  return source.trim().charAt(0).toUpperCase();
}

export const Header = React.memo(function Header() {
  const { isLoggedIn, user, logout, isLoading } = useAuth();
  const { t, language, setLanguage, currency, setCurrency } = useLocaleCurrency();
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [cartItemsCount, setCartItemsCount] = useState(0);
  const accountRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Le popup compte est rendu via createPortal dans body — vérifier aussi si le clic est dedans
      const accountPopup = document.querySelector('.ks-account-popup');
      if (accountRef.current && !accountRef.current.contains(target) && (!accountPopup || !accountPopup.contains(target))) {
        setAccountOpen(false);
      }
      // Idem pour notif dropdown (rendu via portal)
      const notifDropdown = document.querySelector('.ks-notif-dropdown');
      if (notifRef.current && !notifRef.current.contains(target) && (!notifDropdown || !notifDropdown.contains(target))) {
        setNotifOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setMobileOpen(false);
        setInfoOpen(false);
        setNotifOpen(false);
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 768) setMobileOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const notifLastFetchRef = useRef<number>(0);
  const NOTIF_MIN_INTERVAL = 2 * 60 * 1000; // 2 minutes entre fetches

  useEffect(() => {
    if (!isLoggedIn) {
      setNotifications([]);
      setCartItemsCount(0);
      notifLastFetchRef.current = 0;
      return;
    }
    if (Date.now() - notifLastFetchRef.current < NOTIF_MIN_INTERVAL) return;
    notifLastFetchRef.current = Date.now();
    let cancelled = false;
    const load = async () => {
      const notifs: Notification[] = [];
      try {
        const [buyerData, sellerData, cartData] = await Promise.all([
          ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
          ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
          ordersApi.buyerCart().catch(() => null),
        ]);
        if (cancelled) return;
        setCartItemsCount(cartData?.itemsCount ?? 0);
        if (buyerData) {
          for (const o of buyerData.orders) {
            const statusLabel = o.status === 'SHIPPED' ? t('nav.shipped') : o.status === 'CONFIRMED' ? t('nav.confirmed') : t('nav.inProgress');
            notifs.push({ id: `buy-${o.id}`, label: `${t('nav.orderStatus')} ${statusLabel}`, detail: `#${o.id.slice(0, 8).toUpperCase()} — ${o.itemsCount} ${o.itemsCount > 1 ? t('nav.articles') : t('nav.article')}`, href: getDashboardPath(user?.role), icon: '📦', time: new Date(o.createdAt).toLocaleDateString('fr-FR') });
          }
        }
        if (sellerData) {
          for (const o of sellerData.orders) {
            notifs.push({ id: `sell-${o.id}`, label: t('nav.newOrderReceived'), detail: `#${o.id.slice(0, 8).toUpperCase()} de ${o.buyer.displayName}`, href: getDashboardPath(user?.role), icon: '🛒', time: new Date(o.createdAt).toLocaleDateString('fr-FR') });
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setNotifications(notifs);
    };
    void load();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  useEffect(() => {
    setAccountOpen(false);
    setMobileOpen(false);
    setInfoOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  const accountLabel = useMemo(() => {
    if (!user) return t("nav.visitor");
    const roleText = user.role === "SUPER_ADMIN" ? "⭐ Super Admin" : user.role === "ADMIN" ? "⚡ Admin" : user.role === "BUSINESS" ? t("nav.business") : t("nav.userRole");
    return `${getAccountLabel(user)} | ${roleText}`;
  }, [user, t]);

  const handleAccountTrigger = () => setAccountOpen((prev) => !prev);

  const handleLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await logout();
      setAccountOpen(false);
      setMobileOpen(false);
      navigate("/login");
    } finally {
      setLogoutBusy(false);
    }
  };

  return (
    <>
      <header className="ks-header">
        <div className="ks-header-inner">
          <Link to="/" className="ks-header-logo" aria-label={t('nav.logoAria')}>
            <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" className="ks-logo-img" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span className="ks-logo-text">Kin-Sell</span>
          </Link>

          <nav className="ks-nav" aria-label={t('nav.ariaMain')}>
            <Link to="/" className={`ks-nav-link${location.pathname === "/" ? " active" : ""}`}>{t('nav.home')}</Link>
            <Link to="/explorer" className={`ks-nav-link${location.pathname === "/explorer" ? " active" : ""}`}>{t('nav.explorer')}</Link>
            <Link to="/forfaits" className={`ks-nav-link${location.pathname === "/forfaits" || location.pathname === "/plans" ? " active" : ""}`}>{t('nav.plans')}</Link>
            <Link to="/sokin" className={`ks-nav-link${location.pathname === "/sokin" ? " active" : ""}`}>{t('nav.sokin')}</Link>
            <Link to="/contact" className={`ks-nav-link${location.pathname === "/contact" ? " active" : ""}`}>{t('nav.contact')}</Link>
          </nav>

          <div className="ks-header-actions">
            <button type="button" className="ks-help-btn" aria-label={t('nav.helpAria')} title={t('nav.helpAria')} onClick={() => setInfoOpen(true)}>
              <span>?</span>
            </button>

            {isLoggedIn ? (
              <>
                <div className="ks-notif-wrap" ref={notifRef}>
                  <button className="ks-icon-btn ks-icon-btn--notif" aria-label={t('nav.notifAria')} title={t('nav.notifAria')} type="button" onClick={() => setNotifOpen((prev) => !prev)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {notifications.length > 0 && <span className="ks-notif-badge">{notifications.length}</span>}
                  </button>
                  {notifOpen && (
                    <div className="ks-notif-dropdown" role="menu">
                      <div className="ks-notif-dropdown-head">
                        <strong>Notifications</strong>
                        <span className="ks-notif-dropdown-count">{notifications.length}</span>
                      </div>
                      {notifications.length > 0 ? (
                        <div className="ks-notif-dropdown-list">
                          {notifications.map((n) => (
                            <div key={n.id} className="ks-notif-dropdown-item" role="menuitem">
                              <span className="ks-notif-dropdown-icon">{n.icon}</span>
                              <div className="ks-notif-dropdown-text">
                                <span className="ks-notif-dropdown-label">{n.label}</span>
                                <span className="ks-notif-dropdown-detail">{n.detail}</span>
                              </div>
                              <span className="ks-notif-dropdown-time">{n.time}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="ks-notif-dropdown-empty">{t('nav.noNotif')}</p>
                      )}
                      <div className="ks-notif-dropdown-footer">
                        <Link to="/cart" className="ks-notif-dropdown-footer-link" onClick={() => { setNotifOpen(false); }}>
                          {t('nav.viewAllOrders')}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <Link to="/messaging" className="ks-icon-btn" aria-label={t('nav.msgAria')} title={t('nav.msgAria')}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </Link>

                <Link to="/cart" className="ks-icon-btn" aria-label={t('nav.cartAria')} title={t('nav.cartAria')}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                  </svg>
                  {cartItemsCount > 0 && <span className="ks-notif-badge">{cartItemsCount}</span>}
                </Link>
              </>
            ) : null}

            <div className="ks-account-wrap" ref={accountRef}>
              <button className="ks-icon-btn ks-account-btn" aria-label={t('nav.accountAria')} title={accountLabel} onClick={handleAccountTrigger} type="button" aria-expanded={accountOpen}>
                {isLoggedIn && user?.profile.avatarUrl ? (
                  <img src={resolveMediaUrl(user.profile.avatarUrl)} alt={accountLabel} className="ks-avatar" />
                ) : isLoggedIn && user ? (
                  <span className="ks-avatar-initial">{getAccountInitial(user)}</span>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </button>
            </div>

            <button className={`ks-burger${mobileOpen ? " open" : ""}`} aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')} aria-expanded={mobileOpen} onClick={() => setMobileOpen((v) => !v)} type="button">
              <span /><span /><span />
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <nav className="ks-mobile-nav" aria-label={t('nav.ariaMobile')}>
            <Link to="/" className="ks-mobile-link" onClick={() => setMobileOpen(false)}>{t('nav.home')}</Link>
            <Link to="/explorer" className="ks-mobile-link" onClick={() => setMobileOpen(false)}>{t('nav.explorer')}</Link>
            <Link to="/forfaits" className="ks-mobile-link" onClick={() => setMobileOpen(false)}>{t('nav.plans')}</Link>
            <Link to="/sokin" className="ks-mobile-link" onClick={() => setMobileOpen(false)}>{t('nav.sokin')}</Link>
            <Link to="/contact" className="ks-mobile-link" onClick={() => setMobileOpen(false)}>{t('nav.contact')}</Link>
            {!Capacitor.isNativePlatform() && import.meta.env.VITE_ANDROID_APK_URL && (
              <a href={import.meta.env.VITE_ANDROID_APK_URL} className="ks-mobile-link ks-mobile-download" target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6,verticalAlign:"middle"}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Télécharger l'APK Android</a>
            )}
            <div className="ks-mobile-divider" />
            <RegionLanguageCurrencySelector className="ks-mobile-rlc" />
            <div className="ks-mobile-divider" />
            {isLoggedIn ? (
              <>
                <Link to={getDashboardPath(user?.role)} className="ks-mobile-link" onClick={() => setMobileOpen(false)}>{t('common.myAccount')}</Link>
                <Link to="/messaging" className="ks-mobile-link" onClick={() => { setMobileOpen(false); }}>{t('common.messages')}</Link>
                <Link to="/cart" className="ks-mobile-link" onClick={() => setMobileOpen(false)}>{t('nav.cartAria')}</Link>
                <button className="ks-mobile-link ks-mobile-logout" type="button" onClick={() => void handleLogout()}>{t('common.logout')}</button>
              </>
            ) : (
              <>
                <Link to="/login" className="ks-mobile-link ks-mobile-login" onClick={() => setMobileOpen(false)}>{t('common.login')}</Link>
                <Link to="/register" className="ks-mobile-link ks-mobile-login" onClick={() => setMobileOpen(false)}>{t('common.signup')}</Link>
              </>
            )}
          </nav>
        ) : null}
      </header>

      {accountOpen && createPortal(
        <>
          <div className="ks-account-overlay" onClick={() => setAccountOpen(false)} />
          <div
            className="ks-account-popup"
            style={(() => {
              const rect = accountRef.current?.getBoundingClientRect();
              return rect
                ? { top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) }
                : { top: 72, right: 16 };
            })()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ks-account-popup-head">
              <strong>{t('nav.account')}</strong>
              <p>{isLoading ? t('nav.loading') : accountLabel}</p>
              <button type="button" className="ks-account-popup-close" onClick={() => setAccountOpen(false)}>✕</button>
            </div>
            <nav className="ks-account-popup-links">
              {isLoggedIn ? (
                <>
                  <Link to="/forfaits" className="ks-account-popup-link" onClick={() => setAccountOpen(false)}>💎 {t('nav.plans')}</Link>
                  <Link to={getDashboardPath(user?.role)} className="ks-account-popup-link" onClick={() => setAccountOpen(false)}>👤 {t('common.myAccount')}</Link>
                  <Link to="/messaging" className="ks-account-popup-link" onClick={() => { setAccountOpen(false); }}>💬 {t('common.messages')}</Link>
                  <Link to="/cart" className="ks-account-popup-link" onClick={() => setAccountOpen(false)}>🛒 {t('nav.cartAria')}</Link>
                  <div className="ks-account-popup-locale">
                    <span className="ks-account-popup-locale-label">🌐</span>
                    <select
                      className="ks-account-popup-select"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as import('../app/providers/LocaleCurrencyProvider').AppLanguage)}
                      aria-label={t('footer.language')}
                    >
                      <option value="fr">Français</option>
                      <option value="en">English</option>
                      <option value="ln">Lingála</option>
                    </select>
                  </div>
                  <div className="ks-account-popup-locale">
                    <span className="ks-account-popup-locale-label">💱</span>
                    <select
                      className="ks-account-popup-select"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as import('../app/providers/LocaleCurrencyProvider').AppCurrency)}
                      aria-label={t('footer.currency')}
                    >
                      <option value="CDF">CDF — Franc Congolais</option>
                      <option value="USD">USD — Dollar</option>
                      <option value="EUR">EUR — Euro</option>
                    </select>
                  </div>
                  <button className="ks-account-popup-link ks-account-popup-logout" type="button" onClick={() => void handleLogout()} disabled={logoutBusy}>
                    {logoutBusy ? t('nav.logoutBusy') : `🚪 ${t('common.logout')}`}
                  </button>
                </>
              ) : (
                <>
                  <Link to="/forfaits" className="ks-account-popup-link" onClick={() => setAccountOpen(false)}>💎 {t('nav.plans')}</Link>
                  <Link to="/login" className="ks-account-popup-link" onClick={() => setAccountOpen(false)}>🔑 {t('common.login')}</Link>
                  <Link to="/register" className="ks-account-popup-link" onClick={() => setAccountOpen(false)}>✨ {t('common.signup')}</Link>
                </>
              )}
            </nav>
          </div>
        </>,
        document.body
      )}

      {notifOpen ? createPortal(
        <div className="ks-notif-overlay" aria-label={t('nav.closeNotif')} onClick={() => setNotifOpen(false)} role="button" tabIndex={-1} />,
        document.body
      ) : null}

      {infoOpen && createPortal(
        <div className="ks-info-overlay" onClick={() => setInfoOpen(false)}>
          <div className="ks-info-popup" onClick={(e) => e.stopPropagation()}>
            <div className="ks-info-popup-head">
              <strong>Kin-Sell</strong>
              <p>{t('nav.quickNav')}</p>
              <button type="button" className="ks-info-popup-close" onClick={() => setInfoOpen(false)}>✕</button>
            </div>
            <nav className="ks-info-popup-links">
              {INFO_ITEMS.map((item) => (
                <Link key={item.href} to={item.href} className="ks-info-popup-link" onClick={() => setInfoOpen(false)}>{t(item.titleKey)}</Link>
              ))}
            </nav>
          </div>
        </div>,
        document.body
      )}
    </>
  );
});
