import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import '../../styles/design-tokens.css';
import './explorer.css';
import { PRODUCT_CATEGORIES, SERVICE_CATEGORIES } from './explorer-data';
import type { ExplorerArticlePreview } from './explorer-data';
import { slugToCategoryInfo, normalizeCategoryToId } from '../../shared/constants/category-registry';
import { explorer as explorerApi, orders as ordersApi, listings as listingsApi, resolveMediaUrl, type ExplorerShopApi, type ExplorerProfileApi, type PromotionSummary } from '../../lib/api-client';
import { useHoverPopup, ArticleHoverPopup, ProfileHoverPopup, type ArticleHoverData, type ProfileHoverData } from '../../components/HoverPopup';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useMarketPreference } from '../../app/providers/MarketPreferenceProvider';
import { useDataSaver, dsLimit, dsInterval } from '../../app/providers/DataSaverProvider';
import { NegotiatePopup } from '../negotiations/NegotiatePopup';
import { getUrgencyLabel } from '../../shared/promo/promo-engine';
import { useLockedCategories, isCategoryLocked } from '../../hooks/useLockedCategories';
import { AdBanner } from '../../components/AdBanner';
import { BundlePromoCard } from '../../components/BundlePromoCard';
import MapView from '../../components/MapView';
import { SeoMeta } from '../../components/SeoMeta';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { useIsMobile } from '../../hooks/useIsMobile';
import { getDashboardPath } from '../../utils/role-routing';
import { ExplorerPageDesktop } from './ExplorerPageDesktop';
import { RegionLanguageCurrencySelector } from '../../components/RegionLanguageCurrencySelector';
import NotificationCenter from '../../components/NotificationCenter';
import { useGlobalNotification } from '../../app/providers/GlobalNotificationProvider';
import TutorialOverlay, { useTutorial, TutorialRelaunchBtn } from '../../components/TutorialOverlay';
import { explorerMobileSteps } from '../../components/tutorial-steps';
import { LongPressPopup, useLongPress, type LongPressArticle } from '../../components/LongPressPopup';

const PREVIEW_PAGE_SIZE = 4;
const MODAL_PAGE_SIZE = 8;

/* ─── Drawer ─── */

function ExDrawer({ open, onClose, t, isLoggedIn, user, logout }: {
  open: boolean; onClose: () => void; t: (k: string) => string;
  isLoggedIn: boolean; user: { role?: string } | null; logout: () => void;
}) {
  const nav = useNavigate();
  if (!open) return null;

  const handleLogout = () => { logout(); onClose(); void nav('/login'); };

  const links = [
    { icon: '🏠', label: 'Accueil', href: '/' },
    { icon: '🔍', label: 'Explorer', href: '/explorer' },
    { icon: '📢', label: 'So-Kin', href: '/sokin' },
    { icon: '🛒', label: 'Panier', href: '/cart' },
    { icon: '💰', label: 'Forfaits', href: '/forfaits' },
    { icon: '📖', label: 'Blog', href: '/blog' },
    { icon: '❓', label: 'FAQ', href: '/faq' },
    { icon: 'ℹ️', label: 'À propos', href: '/about' },
    { icon: '📞', label: 'Contact', href: '/contact' },
  ];

  return (
    <>
      <div className="ex-drawer-overlay" onClick={onClose} />
      <aside className="ex-drawer">
        <div className="ex-drawer-header">
          <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" className="ex-drawer-logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span className="ex-drawer-brand">Kin-Sell</span>
          <button className="ex-drawer-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <nav className="ex-drawer-nav">
          {links.map((l) => (
            <Link key={l.href} to={l.href} className="ex-drawer-link" onClick={onClose}>{l.icon} {l.label}</Link>
          ))}
          {isLoggedIn && (
            <Link to={getDashboardPath(user?.role)} className="ex-drawer-link" onClick={onClose}>👤 Mon compte</Link>
          )}
        </nav>
        <RegionLanguageCurrencySelector />
        <div className="ex-drawer-footer">
          {isLoggedIn ? (
            <button className="ex-drawer-logout" onClick={handleLogout}>🚪 {t('common.logout')}</button>
          ) : (
            <div className="ex-drawer-auth">
              <Link to="/login" className="ex-drawer-auth-btn" onClick={onClose}>🔑 Connexion</Link>
              <Link to="/register" className="ex-drawer-auth-btn ex-drawer-auth-btn--accent" onClick={onClose}>✨ Inscription</Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/* ─── Top Bar ─── */

function ExTopBar({ visible, onMenuOpen, onSearchToggle }: {
  visible: boolean; onMenuOpen: () => void; onSearchToggle: () => void;
}) {
  return (
    <header className={`ex-topbar${visible ? '' : ' ex-topbar--hidden'}`} role="banner">
      <button className="ex-topbar-btn" onClick={onMenuOpen} aria-label="Menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <Link to="/" className="ex-topbar-logo" aria-label="Kin-Sell — Accueil">
        <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" className="ex-topbar-logo-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <span className="ex-topbar-logo-text">Kin-Sell</span>
      </Link>
      <button className="ex-topbar-btn" onClick={onSearchToggle} aria-label="Rechercher">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </button>
    </header>
  );
}

/* ─── Search Overlay ─── */

function ExSearchOverlay({ open, onClose, value, onChange }: {
  open: boolean; onClose: () => void; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  if (!open) return null;

  return (
    <div className="ex-search-overlay">
      <div className="ex-search-bar">
        <svg className="ex-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input ref={inputRef} type="search" className="ex-search-input" placeholder="Article, service, vendeur…" value={value} onChange={onChange} />
        <button type="button" className="ex-search-close" onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

/* ─── Create Menu ─── */

function ExCreateMenu({ open, onClose, isLoggedIn }: {
  open: boolean; onClose: () => void; isLoggedIn: boolean;
}) {
  const nav = useNavigate();
  const { user } = useAuth();
  if (!open) return null;
  const go = (path: string) => { onClose(); void nav(isLoggedIn ? path : '/login'); };

  return (
    <>
      <div className="ex-create-overlay" onClick={onClose} />
      <div className="ex-create-menu">
        <div className="ex-create-handle" />
        <p className="ex-create-title">Publier ou ajouter</p>
        <button className="ex-create-item" onClick={() => go('/sokin')}>📢 Publier sur SoKin</button>
        <button className="ex-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=articles&action=publish`)}>🛍️ Ajouter un produit</button>
        <button className="ex-create-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=articles&action=publish`)}>🔧 Ajouter un service</button>
      </div>
    </>
  );
}

/* ─── Bottom Nav ─── */

function ExBottomNav({ visible, createOpen, onToggleCreate }: {
  visible: boolean; createOpen: boolean; onToggleCreate: () => void;
}) {
  const { user } = useAuth();
  const dashPath = getDashboardPath(user?.role);
  const { missedCount } = useGlobalNotification();
  const [ncOpen, setNcOpen] = useState(false);

  return (
    <nav className={`ex-bnav${visible ? '' : ' ex-bnav--hidden'}`} aria-label="Navigation principale">
      <Link to="/" className="ex-bnav-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        <span>Accueil</span>
      </Link>
      <Link to="/cart" className="ex-bnav-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span>Panier</span>
      </Link>
      <button className={`ex-bnav-fab${createOpen ? ' ex-bnav-fab--open' : ''}`} onClick={onToggleCreate} aria-label="Créer" aria-expanded={createOpen}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button className="ex-bnav-item" style={{ position: 'relative' }} onClick={() => setNcOpen(true)} aria-label="Notifications">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {missedCount > 0 && <span className="nc-badge">{missedCount}</span>}
        <span>Notifs</span>
      </button>
      <Link to={dashPath} className="ex-bnav-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Compte</span>
      </Link>
      <NotificationCenter open={ncOpen} onClose={() => setNcOpen(false)} />
    </nav>
  );
}

/* ─── Pager ─── */

function ExPager({ pageCount, current, onChange }: {
  pageCount: number; current: number; onChange: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  const maxVis = 5;
  let start = Math.max(0, current - Math.floor(maxVis / 2));
  const end = Math.min(pageCount, start + maxVis);
  if (end - start < maxVis) start = Math.max(0, end - maxVis);

  return (
    <div className="ex-pager">
      <button className="ex-pager-btn" disabled={current === 0} onClick={() => onChange(Math.max(0, current - 1))}>‹</button>
      <div className="ex-pager-pages">
        {start > 0 && <><button className="ex-pager-btn" onClick={() => onChange(0)}>1</button>{start > 1 && <span className="ex-pager-dots">…</span>}</>}
        {Array.from({ length: end - start }, (_, i) => {
          const p = start + i;
          return <button key={p} className={`ex-pager-btn${p === current ? ' ex-pager-btn--active' : ''}`} onClick={() => onChange(p)}>{p + 1}</button>;
        })}
        {end < pageCount && <>{end < pageCount - 1 && <span className="ex-pager-dots">…</span>}<button className="ex-pager-btn" onClick={() => onChange(pageCount - 1)}>{pageCount}</button></>}
      </div>
      <button className="ex-pager-btn" disabled={current === pageCount - 1} onClick={() => onChange(Math.min(pageCount - 1, current + 1))}>›</button>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════ */

export function ExplorerPage() {
  const isMobileOrTablet = useIsMobile(1023);
  if (!isMobileOrTablet) return <ExplorerPageDesktop />;
  return <ExplorerPageMobile />;
}

/* ─── Article card with long-press for mobile ─── */

function ExArticleCardWithLongPress({
  article, articleHover, lockedCats, exCardBusy, exCardFb,
  onNav, onContact, onCart, onNegotiate, onLongPress,
}: {
  article: ExplorerArticlePreview;
  articleHover: ReturnType<typeof useHoverPopup<ArticleHoverData>>;
  lockedCats: string[];
  exCardBusy: string | null;
  exCardFb: { id: string; msg: string } | null;
  onNav: (path: string) => void;
  onContact: (a: ExplorerArticlePreview, e: React.MouseEvent) => void;
  onCart: (id: string, e: React.MouseEvent) => Promise<void>;
  onNegotiate: (a: ExplorerArticlePreview, e: React.MouseEvent) => void;
  onLongPress: (a: ExplorerArticlePreview) => void;
}) {
  const lp = useLongPress(() => onLongPress(article));

  return (
    <article className="ex-article-card" id={article.id}
      {...lp}
      onMouseEnter={(e) => articleHover.handleMouseEnter({ title: article.title, description: `Annonce: ${article.title}`, price: article.priceLabel, sellerName: article.publisherName }, e)}
      onMouseLeave={articleHover.handleMouseLeave}
    >
      <div className="ex-article-img">
        <img src={article.coverImage} alt={article.title} loading="lazy" />
        {article.isBoosted && <span className="ks-sponsored-badge">⚡ Sponsorisé</span>}
        {article.promoLabel && <span className="ex-article-badge ks-promo-badge">{article.promoLabel}</span>}
      </div>
      <div className="ex-article-body">
        <h4 className="ex-article-title">{article.title}</h4>
        {article.originalPriceLabel ? (
          <p className="ex-article-price"><s className="ks-price-old">{article.originalPriceLabel}</s> {article.priceLabel}</p>
        ) : (
          <p className="ex-article-price">{article.priceLabel}</p>
        )}
        {article.promoExpiresAt && (() => { const u = getUrgencyLabel(article.promoExpiresAt); return u ? <span className="promo-urgency-label">⏰ {u}</span> : null; })()}
        <p className="ex-article-publisher"><a href={article.publisherLink} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNav(article.publisherLink); }} style={{ color: 'inherit', textDecoration: 'none' }}>{article.publisherName}</a></p>
        <div className="ex-article-actions">
          <button type="button" className="ex-article-act" onClick={() => onNav(article.targetPath)}>Voir</button>
          <button type="button" className="ex-article-act" title="Contacter" onClick={(e) => void onContact(article, e)}>💬</button>
          <button type="button" className="ex-article-act" title="Panier" disabled={exCardBusy === article.id} onClick={(e) => void onCart(article.id, e)}>🛒</button>
          {article.isNegotiable !== false && !isCategoryLocked(lockedCats, article.category) && <button type="button" className="ex-article-act" title="Négocier" onClick={(e) => onNegotiate(article, e)}>🤝</button>}
        </div>
        {exCardFb?.id === article.id && <span className="ex-article-fb">{exCardFb.msg}</span>}
      </div>
    </article>
  );
}

function ExplorerPageMobile() {
  /* Mobile + Tablette → layout actuel inchangé */
  const { t, formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const { lowBandwidth } = useDataSaver();
  const lockedCats = useLockedCategories();
  const tutorial = useTutorial('explorer-mobile');
  const defaultCity = getCountryConfig(effectiveCountry).defaultCity;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlType = searchParams.get('type');
  const urlCategory = searchParams.get('category');
  const urlQuery = searchParams.get('q') || searchParams.get('query') || searchParams.get('search') || '';

  /* ── Shell state ── */
  const scrollDir = useScrollDirection();
  const barsVisible = scrollDir === 'up';
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  /* ── Content state ── */
  const [isProducts, setIsProducts] = useState(() => {
    if (urlType === 'services') return false;
    if (urlCategory && slugToCategoryInfo(urlCategory)?.type === 'service') return false;
    return true;
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(() => {
    if (urlCategory) { const info = slugToCategoryInfo(urlCategory); if (info) return info.id; }
    return null;
  });
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [previewPage, setPreviewPage] = useState(0);
  const [modalPage, setModalPage] = useState(0);
  const [isAllArticlesOpen, setIsAllArticlesOpen] = useState(false);
  const [stats, setStats] = useState({ categories: 0, publicProfiles: 0, onlineShops: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingArticles, setIsLoadingArticles] = useState(true);
  const [liveArticles, setLiveArticles] = useState<ExplorerArticlePreview[]>([]);
  const [shops, setShops] = useState<ExplorerShopApi[]>([]);
  const [profiles, setProfiles] = useState<ExplorerProfileApi[]>([]);
  const [activeBundles, setActiveBundles] = useState<PromotionSummary[]>([]);
  const [bundleCartBusy, setBundleCartBusy] = useState<string | null>(null);
  const [bundleCartFb, setBundleCartFb] = useState<{ id: string; msg: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({ isDown: false, startX: 0, scrollLeft: 0 });
  const articleHover = useHoverPopup<ArticleHoverData>();
  const profileHover = useHoverPopup<ProfileHoverData>();
  const nav = useNavigate();
  const { isLoggedIn, user, logout } = useAuth();
  const [negotiateArticle, setNegotiateArticle] = useState<ExplorerArticlePreview | null>(null);
  const [exCardBusy, setExCardBusy] = useState<string | null>(null);
  const [exCardFb, setExCardFb] = useState<{ id: string; msg: string } | null>(null);
  const [exCardQty, setExCardQty] = useState<Record<string, number>>({});
  const [isMapView, setIsMapView] = useState(false);
  const [longPressArticle, setLongPressArticle] = useState<ExplorerArticlePreview | null>(null);
  const getExQty = (id: string) => exCardQty[id] ?? 1;
  const changeExQty = (id: string, delta: number, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setExCardQty((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) })); };
  useScrollRestore();

  /* ── Derived ── */
  const categories = isProducts ? PRODUCT_CATEGORIES : SERVICE_CATEGORIES;
  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return liveArticles.filter((a) => {
      if (isProducts ? a.kind !== 'product' : a.kind !== 'service') return false;
      if (selectedCategoryId && a.category !== selectedCategoryId) return false;
      if (!q) return true;
      return [a.title, a.publisherName, a.priceLabel].join(' ').toLowerCase().includes(q);
    });
  }, [isProducts, searchQuery, liveArticles, selectedCategoryId]);

  const previewPageCount = Math.max(1, Math.ceil(filteredArticles.length / PREVIEW_PAGE_SIZE));
  const modalPageCount = Math.max(1, Math.ceil(filteredArticles.length / MODAL_PAGE_SIZE));
  const previewArticles = filteredArticles.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE);
  const modalArticles = filteredArticles.slice(modalPage * MODAL_PAGE_SIZE, (modalPage + 1) * MODAL_PAGE_SIZE);

  /* ── Handlers ── */
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => { setSearchQuery(e.target.value); setPreviewPage(0); setModalPage(0); };
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const handleExCardCart = async (articleId: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn) { nav('/login'); return; }
    if (isAdmin) { setExCardFb({ id: articleId, msg: '🔒 Les administrateurs ne peuvent pas effectuer de transactions.' }); setTimeout(() => setExCardFb(null), 3000); return; }
    const article = liveArticles.find(a => a.id === articleId);
    if (article?.ownerId && user && article.ownerId === user.id) { setExCardFb({ id: articleId, msg: '⚠️ Vous ne pouvez pas acheter vos propres articles.' }); setTimeout(() => setExCardFb(null), 3000); return; }
    if (exCardBusy) return;
    setExCardBusy(articleId);
    try {
      const qty = getExQty(articleId);
      await ordersApi.addCartItem({ listingId: articleId, quantity: qty });
      setExCardFb({ id: articleId, msg: `✓ ${qty > 1 ? qty + '× ' : ''}Ajouté au panier` });
      setExCardQty((prev) => { const next = { ...prev }; delete next[articleId]; return next; });
    } catch { setExCardFb({ id: articleId, msg: '✗ Erreur' }); } finally { setExCardBusy(null); setTimeout(() => setExCardFb(null), 2000); }
  };

  const handleExCardNegotiate = (article: ExplorerArticlePreview, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn) { nav('/login'); return; }
    if (isAdmin) { setExCardFb({ id: article.id, msg: '🔒 Les administrateurs ne peuvent pas négocier.' }); setTimeout(() => setExCardFb(null), 3000); return; }
    setNegotiateArticle(article);
  };

  const handleExCardContact = async (article: ExplorerArticlePreview, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn) { nav('/login'); return; }
    if (article.ownerId && user && article.ownerId === user.id) return;
    try { const r = await listingsApi.contactSeller(article.id); nav(`/messaging/${r.conversationId}`); } catch { nav('/messaging'); }
  };

  /* ── Bundle handlers ── */
  const handleExBundleCart = async (bundle: PromotionSummary, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!isLoggedIn) { nav('/login'); return; }
    if (isAdmin) { setBundleCartFb({ id: bundle.id, msg: '🔒 Les administrateurs ne peuvent pas effectuer de transactions.' }); setTimeout(() => setBundleCartFb(null), 3000); return; }
    if (bundleCartBusy) return;
    setBundleCartBusy(bundle.id);
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
      setBundleCartFb({ id: bundle.id, msg: `✓ ${bundle.items.length} articles ajoutés au panier` });
    } catch { setBundleCartFb({ id: bundle.id, msg: '✗ Erreur' }); }
    finally { setBundleCartBusy(null); setTimeout(() => setBundleCartFb(null), 3000); }
  };

  const handleSwitchToggle = (products: boolean) => { setIsProducts(products); setSelectedCategoryId(null); setPreviewPage(0); setModalPage(0); };
  const handleCategoryClick = (id: string) => { setSelectedCategoryId((p) => p === id ? null : id); setPreviewPage(0); setModalPage(0); };

  const handleCategoryMouseDown = (e: React.MouseEvent<HTMLDivElement>) => { const c = scrollRef.current; if (!c) return; dragStateRef.current = { isDown: true, startX: e.pageX - c.offsetLeft, scrollLeft: c.scrollLeft }; };
  const handleCategoryMouseMove = (e: React.MouseEvent<HTMLDivElement>) => { const c = scrollRef.current; if (!c || !dragStateRef.current.isDown) return; e.preventDefault(); const x = e.pageX - c.offsetLeft; c.scrollLeft = dragStateRef.current.scrollLeft - (x - dragStateRef.current.startX) * 1.1; };
  const stopCategoryDragging = () => { dragStateRef.current.isDown = false; };

  /* ── Effects ── */
  useEffect(() => {
    const ctrl = new AbortController();
    const loadStats = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL ?? '/api';
        const res = await fetch(`${apiBase}/explorer/stats`, { signal: ctrl.signal });
        if (res.ok) setStats(await res.json() as typeof stats);
      } catch { /* silencieux */ } finally { if (!ctrl.signal.aborted) setIsLoadingStats(false); }
    };
    const loadShops = async () => { try { setShops(await explorerApi.shops({ limit: 4, city: defaultCity, country: effectiveCountry })); } catch { /* */ } };
    const loadProfiles = async () => { try { setProfiles(await explorerApi.profiles({ limit: 4, city: defaultCity, country: effectiveCountry })); } catch { /* */ } };
    loadStats(); loadShops(); loadProfiles();
    listingsApi.getActiveBundles(6).then(setActiveBundles).catch(() => {});
    return () => { ctrl.abort(); };
  }, [defaultCity, effectiveCountry]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      const next = new URLSearchParams(searchParams);
      next.delete('query');
      next.delete('search');
      if (searchQuery.trim()) { next.set('q', searchQuery.trim()); } else { next.delete('q'); }
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingArticles(true);
      try {
        const q = debouncedQuery.trim() || undefined;
        // Mode économie : limite réduite à 8 par type (au lieu de 24)
        const limit = dsLimit(24, 8, lowBandwidth);
        const [pRes, sRes] = await Promise.all([
          listingsApi.search({ type: 'PRODUIT', q, country: effectiveCountry, city: defaultCity, limit }),
          listingsApi.search({ type: 'SERVICE', q, country: effectiveCountry, city: defaultCity, limit }),
        ]);
        const map = (item: (typeof pRes.results)[number]): ExplorerArticlePreview => ({
          id: item.id, title: item.title, priceLabel: formatPriceLabelFromUsdCents(item.promoActive && item.promoPriceUsdCents != null ? item.promoPriceUsdCents : item.priceUsdCents), priceUsdCents: item.priceUsdCents,
          kind: item.type === 'PRODUIT' ? 'product' : 'service', category: normalizeCategoryToId(item.category),
          publisherName: item.owner.displayName, publisherType: 'personne',
          publisherLink: item.owner.username ? `/user/${item.owner.username}` : '#',
          targetPath: item.owner.username ? `/user/${item.owner.username}#${item.id}` : '#',
          coverImage: resolveMediaUrl(item.imageUrl) || '/assets/kin-sell/black-man-standing-cafe-with-shopping-bags.jpg',
          media: [], ownerId: item.owner.userId, isNegotiable: item.isNegotiable !== false,
          isBoosted: !!(item as any).isBoosted,
          promoLabel: item.promoActive && item.promoPriceUsdCents != null ? formatPriceLabelFromUsdCents(item.promoPriceUsdCents) : undefined,
          originalPriceLabel: item.promoActive && item.promoPriceUsdCents != null ? formatPriceLabelFromUsdCents(item.priceUsdCents) : undefined,
          promoExpiresAt: item.promoActive ? (item as any).promoExpiresAt ?? null : null,
          latitude: item.latitude ?? undefined, longitude: item.longitude ?? undefined,
        });
        if (!cancelled) setLiveArticles([...(pRes.results ?? []).map(map), ...(sRes.results ?? []).map(map)]);
      } catch { if (!cancelled) setLiveArticles([]); } finally { if (!cancelled) setIsLoadingArticles(false); }
    };
    void load();
    // Mode économie : rafraîchissement toutes 180s au lieu de 60s,
    // et suspension complète quand l'onglet est en arrière-plan.
    const intervalMs = dsInterval(60_000, 180_000, lowBandwidth);
    const poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    }, intervalMs);
    return () => { cancelled = true; clearInterval(poll); };
  }, [formatPriceLabelFromUsdCents, debouncedQuery, effectiveCountry, defaultCity, lowBandwidth]);

  /* ── Render ── */
  return (
    <div className="ex-root">
      <SeoMeta title="Explorer — Boutiques et services en Afrique" description="Parcourez les boutiques, produits et services disponibles en Afrique." canonical="https://kin-sell.com/explorer" />

      <ExDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} t={t} isLoggedIn={isLoggedIn} user={user} logout={logout} />
      <ExSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} value={searchQuery} onChange={handleSearch} />
      <ExTopBar visible={barsVisible} onMenuOpen={() => setDrawerOpen(true)} onSearchToggle={() => setSearchOpen(true)} />

      <main className={`ex-content${barsVisible ? '' : ' ex-content--expanded'}`}>
        {/* ── Stats ── */}
        <div className="ex-stats">
          <span className="ex-stat-chip">📂 {isLoadingStats ? '…' : stats.categories} catégories</span>
          <span className="ex-stat-chip">👥 {isLoadingStats ? '…' : stats.publicProfiles} profils</span>
          <span className="ex-stat-chip">🏪 {isLoadingStats ? '…' : stats.onlineShops} boutiques</span>
        </div>

        {/* ── Toggle Produits / Services ── */}
        <div className="ex-toggle">
          <button className={`ex-toggle-btn${isProducts ? ' ex-toggle-btn--active' : ''}`} onClick={() => handleSwitchToggle(true)}>🛍️ Produits</button>
          <button className={`ex-toggle-btn${!isProducts ? ' ex-toggle-btn--active' : ''}`} onClick={() => handleSwitchToggle(false)}>💼 Services</button>
        </div>

        {/* ── Categories horizontal scroll ── */}
        <div className="ex-cats-scroll" ref={scrollRef} onMouseDown={handleCategoryMouseDown} onMouseMove={handleCategoryMouseMove} onMouseUp={stopCategoryDragging} onMouseLeave={stopCategoryDragging}>
          <div className="ex-cats-row">
            {categories.map((cat, i) => (
              <button key={cat.id} className={`ex-cat${selectedCategoryId === cat.id ? ' ex-cat--active' : ''}`} style={{ '--i': i } as React.CSSProperties} onClick={() => handleCategoryClick(cat.id)}>
                <span className="ex-cat-icon">{cat.icon}</span>
                <span className="ex-cat-label">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <AdBanner page="explorer" variant="slim" hideWhenEmpty />

        {/* ── Articles ── */}
        <section className="ex-section">
          <div className="ex-section-head">
            <h2 className="ex-section-title">🧩 Articles disponibles</h2>
          </div>

          {isLoadingArticles ? (
            <p className="ex-empty">Chargement des articles…</p>
          ) : filteredArticles.length === 0 ? (
            <p className="ex-empty">{liveArticles.length === 0 ? 'Aucun article publié pour le moment.' : selectedCategoryId ? 'Aucun article dans cette catégorie.' : 'Aucun résultat pour cette recherche.'}</p>
          ) : (
            <>
              <div className="ex-articles-grid">
                {previewArticles.map((article) => (
                  <ExArticleCardWithLongPress
                    key={article.id}
                    article={article}
                    articleHover={articleHover}
                    lockedCats={lockedCats}
                    exCardBusy={exCardBusy}
                    exCardFb={exCardFb}
                    onNav={nav}
                    onContact={handleExCardContact}
                    onCart={handleExCardCart}
                    onNegotiate={handleExCardNegotiate}
                    onLongPress={setLongPressArticle}
                  />
                ))}
              </div>
              <button className="ex-show-all" onClick={() => setIsAllArticlesOpen(true)}>Tout voir</button>
              <ExPager pageCount={previewPageCount} current={previewPage} onChange={setPreviewPage} />
            </>
          )}
        </section>

        {/* ── Bundles promo ── */}
        {activeBundles.length > 0 && (
          <section className="ex-section">
            <div className="ex-section-head">
              <h2 className="ex-section-title">📦 Offres lots promo</h2>
            </div>
            <div className="ex-bundles-grid">
              {activeBundles.map((b) => (
                <div key={b.id} className="ex-bundle-wrap">
                  <BundlePromoCard
                    promo={{ ...b, promoType: 'BUNDLE' as const, status: 'ACTIVE' as const } as any}
                    resolveMediaUrl={resolveMediaUrl}
                    onViewItem={(lid) => nav(`/explorer?q=${lid}`)}
                    owner={b.ownerUser?.profile}
                  />
                  <div className="ex-bundle-actions">
                    <button type="button" className="ex-article-act" title="Panier" disabled={bundleCartBusy === b.id} onClick={(e) => void handleExBundleCart(b, e)}>🛒 Ajouter au panier</button>
                  </div>
                  {bundleCartFb?.id === b.id && <span className="ex-article-fb">{bundleCartFb.msg}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Shops ── */}
        <section className="ex-section">
          <div className="ex-section-head">
            <h2 className="ex-section-title">🏪 Boutiques populaires</h2>
            <Link to="/explorer/shops-online" className="ex-section-link">Voir toutes →</Link>
          </div>
          <div className="ex-shops-grid">
            {shops.length > 0 ? shops.map((shop) => (
              <Link key={shop.id} to={`/business/${shop.slug}`} className="ex-shop-card"
                onMouseEnter={(e) => profileHover.handleMouseEnter({ avatarUrl: resolveMediaUrl(shop.coverImage || shop.logo), name: shop.name, username: shop.slug, kinId: null, publicPageUrl: `/business/${shop.slug}` }, e)}
                onMouseLeave={profileHover.handleMouseLeave}
              >
                <div className="ex-shop-cover">
                  {shop.coverImage ? <img src={resolveMediaUrl(shop.coverImage)} alt={shop.name} loading="lazy" /> : <div className="ex-shop-cover-ph">🏪</div>}
                  <span className="ex-shop-badge">{shop.badge}</span>
                </div>
                <div className="ex-shop-body">
                  <h4 className="ex-shop-name">{shop.name}</h4>
                  <p className="ex-shop-city">📍 {shop.city}</p>
                  <span className="ex-shop-status">En ligne</span>
                </div>
              </Link>
            )) : <p className="ex-empty">Aucune boutique disponible pour le moment.</p>}
          </div>
        </section>

        {/* ── Profiles ── */}
        <section className="ex-section">
          <div className="ex-section-head">
            <h2 className="ex-section-title">👥 Vendeurs en vedette</h2>
            <Link to="/explorer/public-profiles" className="ex-section-link">Voir tous →</Link>
          </div>
          <div className="ex-profiles-grid">
            {profiles.length > 0 ? profiles.map((profile) => (
              <Link key={profile.id} to={profile.username ? `/user/${profile.username}` : '#'} className="ex-profile-card"
                onMouseEnter={(e) => profileHover.handleMouseEnter({ avatarUrl: resolveMediaUrl(profile.avatarUrl), name: profile.displayName, username: profile.username, kinId: null, publicPageUrl: profile.username ? `/user/${profile.username}` : null }, e)}
                onMouseLeave={profileHover.handleMouseLeave}
              >
                <div className="ex-profile-avatar">
                  {profile.avatarUrl ? <img src={resolveMediaUrl(profile.avatarUrl)} alt={profile.displayName} /> : <span className="ex-profile-avatar-ph">👤</span>}
                  <span className="ex-profile-badge">{profile.badge}</span>
                </div>
                <h4 className="ex-profile-name">{profile.displayName}</h4>
                <p className="ex-profile-city">📍 {profile.city}</p>
              </Link>
            )) : <p className="ex-empty">Aucun profil public disponible pour le moment.</p>}
          </div>
        </section>
      </main>

      <ExCreateMenu open={createOpen} onClose={() => setCreateOpen(false)} isLoggedIn={isLoggedIn} />
      <ExBottomNav visible={barsVisible} createOpen={createOpen} onToggleCreate={() => setCreateOpen(p => !p)} />

      {/* ── Modal tous les articles ── */}
      {isAllArticlesOpen && (
        <div className="ex-modal-backdrop" role="dialog" aria-modal="true" aria-label="Tous les articles">
          <div className="ex-modal-panel">
            <div className="ex-modal-head">
              <h3>Tous les articles</h3>
              <button className="ex-modal-close" onClick={() => setIsAllArticlesOpen(false)}>✕</button>
            </div>
            <div className="ex-articles-grid">
              {modalArticles.map((article) => (
                <article key={`m-${article.id}`} className="ex-article-card"
                  onMouseEnter={(e) => articleHover.handleMouseEnter({ title: article.title, description: `Annonce: ${article.title}`, price: article.priceLabel, sellerName: article.publisherName }, e)}
                  onMouseLeave={articleHover.handleMouseLeave}
                >
                  <div className="ex-article-img">
                    <img src={article.coverImage} alt={article.title} loading="lazy" />
                    {article.promoLabel && <span className="ex-article-badge ks-promo-badge">{article.promoLabel}</span>}
                  </div>
                  <div className="ex-article-body">
                    <h4 className="ex-article-title">{article.title}</h4>
                    {article.originalPriceLabel ? (
                      <p className="ex-article-price"><s className="ks-price-old">{article.originalPriceLabel}</s> {article.priceLabel}</p>
                    ) : (
                      <p className="ex-article-price">{article.priceLabel}</p>
                    )}
                    {article.promoExpiresAt && (() => { const u = getUrgencyLabel(article.promoExpiresAt); return u ? <span className="promo-urgency-label">⏰ {u}</span> : null; })()}
                    <p className="ex-article-publisher">{article.publisherName}</p>
                    <div className="ex-article-actions">
                      <button type="button" className="ex-article-act" onClick={() => nav(article.targetPath)}>Voir</button>
                      <button type="button" className="ex-article-act" title="Contacter" onClick={(e) => void handleExCardContact(article, e)}>💬</button>
                      <span className="ex-qty-sel">
                        <button type="button" className="ex-qty-btn" onClick={(e) => changeExQty(article.id, -1, e)} disabled={getExQty(article.id) <= 1}>−</button>
                        <span className="ex-qty-val">{getExQty(article.id)}</span>
                        <button type="button" className="ex-qty-btn" onClick={(e) => changeExQty(article.id, 1, e)}>+</button>
                      </span>
                      <button type="button" className="ex-article-act" title="Panier" disabled={exCardBusy === article.id} onClick={(e) => void handleExCardCart(article.id, e)}>🛒</button>
                      {article.isNegotiable !== false && !isCategoryLocked(lockedCats, article.category) && <button type="button" className="ex-article-act" title="Négocier" onClick={(e) => handleExCardNegotiate(article, e)}>🤝</button>}
                    </div>
                    {exCardFb?.id === article.id && <span className="ex-article-fb">{exCardFb.msg}</span>}
                  </div>
                </article>
              ))}
            </div>
            <ExPager pageCount={modalPageCount} current={modalPage} onChange={setModalPage} />
          </div>
        </div>
      )}

      <ArticleHoverPopup popup={articleHover.popup} />
      <ProfileHoverPopup popup={profileHover.popup} />

      {longPressArticle && (
        <LongPressPopup
          article={{
            id: longPressArticle.id,
            title: longPressArticle.title,
            description: null,
            imageUrl: longPressArticle.coverImage,
            priceLabel: longPressArticle.priceLabel,
            originalPriceLabel: longPressArticle.originalPriceLabel,
            sellerName: longPressArticle.publisherName,
            type: longPressArticle.kind === 'product' ? 'PRODUIT' : 'SERVICE',
            isNegotiable: longPressArticle.isNegotiable !== false && !isCategoryLocked(lockedCats, longPressArticle.category),
          }}
          onClose={() => setLongPressArticle(null)}
          onNegotiate={() => {
            const a = longPressArticle;
            setLongPressArticle(null);
            setNegotiateArticle(a);
          }}
          onAddToCart={() => {
            const a = longPressArticle;
            setLongPressArticle(null);
            void handleExCardCart(a.id, { preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent);
          }}
          t={t}
        />
      )}

      {negotiateArticle && (
        <NegotiatePopup
          listing={{ id: negotiateArticle.id, title: negotiateArticle.title, imageUrl: negotiateArticle.coverImage, type: negotiateArticle.kind === 'product' ? 'PRODUIT' : 'SERVICE', priceUsdCents: negotiateArticle.priceUsdCents, ownerDisplayName: negotiateArticle.publisherName }}
          onClose={() => setNegotiateArticle(null)}
          onSuccess={() => { setNegotiateArticle(null); nav('/cart'); }}
        />
      )}

      <TutorialOverlay pageKey="explorer-mobile" steps={explorerMobileSteps} open={tutorial.isOpen} onClose={tutorial.close} />
      {!tutorial.isOpen && <TutorialRelaunchBtn reset={tutorial.reset} start={tutorial.start} />}
    </div>
  );
}
