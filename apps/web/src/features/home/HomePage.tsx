import React, { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { getDashboardPath } from "../../utils/role-routing";
import { listings as listingsApi, orders as ordersApi, explorer as explorerApi, sokin as sokinApi, blog as blogApi, type PublicListing, type CartSummary, type OrderSummary, type ExplorerShopApi, type ExplorerProfileApi, type SoKinApiFeedPost, type PublicBlogPost } from "../../lib/api-client";
import { useHoverPopup, ArticleHoverPopup, type ArticleHoverData } from "../../components/HoverPopup";
import { useScrollRestore } from "../../utils/useScrollRestore";
import { NegotiatePopup } from "../negotiations/NegotiatePopup";
import { useLockedCategories, isCategoryLocked } from "../../hooks/useLockedCategories";
import { AdBanner } from "../../components/AdBanner";
import "./home.css";

/* ════════════════════════════════════════
   DATA
   ════════════════════════════════════════ */

const LETTERS = ["K", "I", "N", "-", "S", "E", "L", "L"];

const INFO_ITEMS = [
  { titleKey: "home.aboutUs", href: "/about" },
  { titleKey: "home.terms", href: "/terms" },
  { titleKey: "home.usageTips", href: "/guide" },
  { titleKey: "home.howItWorks", href: "/how-it-works" },
  { titleKey: "home.dataProcessing", href: "/privacy" },
  { titleKey: "home.legalNotice", href: "/legal" },
  { titleKey: "home.blog", href: "/blog" },
  { titleKey: "home.faq", href: "/faq" },
  { titleKey: "home.contact", href: "/contact" },
];

const PRODUCT_CATEGORIES = [
  { nameKey: "home.cat.food", code: "🍔", href: "/explorer?type=produits&category=nourriture" },
  { nameKey: "home.cat.phones", code: "📱", href: "/explorer?type=produits&category=telephones" },
  { nameKey: "home.cat.computers", code: "💻", href: "/explorer?type=produits&category=high-tech" },
  { nameKey: "home.cat.gaming", code: "🎮", href: "/explorer?type=produits&category=jeux" },
  { nameKey: "home.cat.pharmacy", code: "💊", href: "/explorer?type=produits&category=pharmacie" },
  { nameKey: "home.cat.fashion", code: "👕", href: "/explorer?type=produits&category=mode" },
  { nameKey: "home.cat.pets", code: "🐾", href: "/explorer?type=produits&category=animalerie" },
  { nameKey: "home.cat.home", code: "🛋️", href: "/explorer?type=produits&category=maison" },
  { nameKey: "home.cat.appliances", code: "⚙️", href: "/explorer?type=produits&category=electromenager" },
  { nameKey: "home.cat.electronics", code: "🔌", href: "/explorer?type=produits&category=high-tech" },
  { nameKey: "home.cat.beauty", code: "💄", href: "/explorer?type=produits&category=beaute" },
  { nameKey: "home.cat.baby", code: "👶", href: "/explorer?type=produits&category=bebe" },
  { nameKey: "home.cat.sports", code: "⚽", href: "/explorer?type=produits&category=sports" },
  { nameKey: "home.cat.books", code: "📚", href: "/explorer?type=produits&category=livres" },
  { nameKey: "home.cat.diy", code: "🔨", href: "/explorer?type=produits&category=bricolage" },
  { nameKey: "home.cat.gifts", code: "🎁", href: "/explorer?type=produits&category=cadeaux" },
  { nameKey: "home.cat.office", code: "📎", href: "/explorer?type=produits&category=bureau" },
  { nameKey: "home.cat.autoMoto", code: "🏍️", href: "/explorer?type=produits&category=voitures" },
  { nameKey: "home.cat.health", code: "🏥", href: "/explorer?type=produits&category=sante" },
  { nameKey: "home.cat.carRental", code: "🚗", href: "/explorer?type=produits&category=location" },
  { nameKey: "home.cat.realEstate", code: "🏠", href: "/explorer?type=produits&category=immobilier" },
  { nameKey: "home.cat.misc", code: "📦", href: "/explorer?type=produits&category=divers" },
];

const SERVICE_CATEGORIES = [
  { nameKey: "home.svc.drivers", code: "🚕", href: "/explorer?type=services&category=chauffeurs" },
  { nameKey: "home.svc.nannies", code: "👶", href: "/explorer?type=services&category=nounous" },
  { nameKey: "home.svc.teachers", code: "👨‍🏫", href: "/explorer?type=services&category=professeurs" },
  { nameKey: "home.svc.nurses", code: "⚕️", href: "/explorer?type=services&category=infirmieres" },
  { nameKey: "home.svc.cleaning", code: "🧹", href: "/explorer?type=services&category=menage" },
  { nameKey: "home.svc.cooking", code: "👨‍🍳", href: "/explorer?type=services&category=cuisine" },
  { nameKey: "home.svc.security", code: "👮", href: "/explorer?type=services&category=gardiennage" },
  { nameKey: "home.svc.housekeeper", code: "👩‍🍳", href: "/explorer?type=services&category=bonne" },
  { nameKey: "home.svc.developer", code: "👨‍💻", href: "/explorer?type=services&category=developpeur" },
  { nameKey: "home.svc.designer", code: "🎨", href: "/explorer?type=services&category=designer" },
  { nameKey: "home.svc.photographer", code: "📷", href: "/explorer?type=services&category=photographe" },
  { nameKey: "home.svc.plumber", code: "🔧", href: "/explorer?type=services&category=plombier" },
  { nameKey: "home.svc.electrician", code: "⚡", href: "/explorer?type=services&category=electricien" },
  { nameKey: "home.svc.mason", code: "🏗️", href: "/explorer?type=services&category=macon" },
  { nameKey: "home.svc.repairer", code: "🔧", href: "/explorer?type=services&category=reparateur" },
  { nameKey: "home.svc.consultant", code: "👔", href: "/explorer?type=services&category=consultant" },
  { nameKey: "home.svc.marketing", code: "📊", href: "/explorer?type=services&category=marketing" },
  { nameKey: "home.svc.sportCoach", code: "💪", href: "/explorer?type=services&category=coach" },
  { nameKey: "home.svc.hairdressing", code: "💇", href: "/explorer?type=services&category=coiffure" },
  { nameKey: "home.svc.sewing", code: "✂️", href: "/explorer?type=services&category=couture" },
  { nameKey: "home.svc.events", code: "🎉", href: "/explorer?type=services&category=evenementiel" },
  { nameKey: "home.svc.accounting", code: "💹", href: "/explorer?type=services&category=comptabilite" },
  { nameKey: "home.svc.admin", code: "📋", href: "/explorer?type=services&category=admin" },
  { nameKey: "home.svc.delivery", code: "🚚", href: "/explorer?type=services&category=livraison" },
  { nameKey: "home.svc.gardening", code: "🌱", href: "/explorer?type=services&category=jardinage" },
  { nameKey: "home.svc.decoration", code: "🏠", href: "/explorer?type=services&category=decoration" },
];

const TIPS_KEYS = [
  "home.tip1", "home.tip2", "home.tip3", "home.tip4",
  "home.tip5", "home.tip6", "home.tip7", "home.tip8",
];



/* ════════════════════════════════════════
   COMPONENT
   ════════════════════════════════════════ */

export function HomePage() {
  const { t, formatMoneyFromUsdCents, formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const lockedCats = useLockedCategories();
  const [searchQuery, setSearchQuery] = useState("");
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sokinIndex, setSokinIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [shopIndex, setShopIndex] = useState(0);
  const [sellerIndex, setSellerIndex] = useState(0);
  const [accountMenuPos, setAccountMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [liveProducts, setLiveProducts] = useState<PublicListing[]>([]);
  const [liveServices, setLiveServices] = useState<PublicListing[]>([]);
  const [isLoadingArticles, setIsLoadingArticles] = useState(true);
  const [trendingShops, setTrendingShops] = useState<ExplorerShopApi[]>([]);
  const [trendingProfiles, setTrendingProfiles] = useState<ExplorerProfileApi[]>([]);
  const [sokinFeed, setSokinFeed] = useState<SoKinApiFeedPost[]>([]);
  const [blogPosts, setBlogPosts] = useState<PublicBlogPost[]>([]);
  const [buyerCart, setBuyerCart] = useState<CartSummary | null>(null);
  const [notificationsCount, setNotificationsCount] = useState(0);
  const [sellerStats, setSellerStats] = useState<{ total: number; delivered: number; inProgress: number; revenue: number }>({ total: 0, delivered: 0, inProgress: 0, revenue: 0 });
  const [lastBuyerOrder, setLastBuyerOrder] = useState<OrderSummary | null>(null);
  const sokinTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  void sokinTimer; // kept for compatibility
  const { isLoggedIn, user, logout } = useAuth();
  const navigate = useNavigate();
  const articleHover = useHoverPopup<ArticleHoverData>();
  const [negotiateListing, setNegotiateListing] = useState<PublicListing | null>(null);
  const [cardCartBusy, setCardCartBusy] = useState<string | null>(null);
  const [cardCartFeedback, setCardCartFeedback] = useState<{ id: string; msg: string } | null>(null);
  const [cardQty, setCardQty] = useState<Record<string, number>>({});
  const getQty = (id: string) => cardQty[id] ?? 1;
  const changeQty = (id: string, delta: number, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setCardQty((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) })); };
  useScrollRestore();

  // ── Fullscreen toggle ──
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

  // Load real listings from API
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingArticles(true);
      try {
        const [products, services] = await Promise.all([
          listingsApi.latest({ type: 'PRODUIT', limit: 8 }),
          listingsApi.latest({ type: 'SERVICE', limit: 8 }),
        ]);
        if (!cancelled) {
          setLiveProducts(products);
          setLiveServices(services);
        }
      } catch { /* API indisponible — afficher état vide */ }
      finally { if (!cancelled) setIsLoadingArticles(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // Load sidebar data: trending shops, profiles, So-Kin feed
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [shopsData, profilesData, feedData, blogData] = await Promise.all([
          explorerApi.shops(3),
          explorerApi.profiles(3),
          sokinApi.publicFeed(4),
          blogApi.publicPosts({ limit: 3 }),
        ]);
        if (!cancelled) {
          setTrendingShops(shopsData);
          setTrendingProfiles(profilesData);
          setSokinFeed(feedData.posts);
          setBlogPosts(blogData.posts);
          setSokinIndex(0);
        }
      } catch { /* API indisponible */ }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  // Load cart, seller stats, last buyer order
  useEffect(() => {
    if (!isLoggedIn) {
      setBuyerCart(null);
      setNotificationsCount(0);
      setSellerStats({ total: 0, delivered: 0, inProgress: 0, revenue: 0 });
      setLastBuyerOrder(null);
      return;
    }
    let cancelled = false;
    const loadDash = async () => {
      try {
        const [cart, sellerData, buyerData, buyerNotifs, sellerNotifs] = await Promise.all([
          ordersApi.buyerCart().catch(() => null),
          ordersApi.sellerOrders({ limit: 50 }).catch(() => null),
          ordersApi.buyerOrders({ limit: 1 }).catch(() => null),
          ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
          ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
        ]);
        if (cancelled) return;
        if (cart) setBuyerCart(cart);
        setNotificationsCount((buyerNotifs?.orders.length ?? 0) + (sellerNotifs?.orders.length ?? 0));
        if (sellerData) {
          const all = sellerData.orders;
          setSellerStats({
            total: sellerData.total,
            delivered: all.filter((o) => o.status === 'DELIVERED').length,
            inProgress: all.filter((o) => ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(o.status)).length,
            revenue: all.filter((o) => o.status === 'DELIVERED').reduce((s, o) => s + o.totalUsdCents, 0),
          });
        }
        if (buyerData && buyerData.orders.length > 0) setLastBuyerOrder(buyerData.orders[0]);
      } catch { /* ignore */ }
    };
    void loadDash();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const money = (cents: number) => formatMoneyFromUsdCents(cents);

  /* ── Article card actions ── */
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const handleCardAddToCart = async (listingId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { navigate('/login'); return; }
    if (isAdmin) { setCardCartFeedback({ id: listingId, msg: `🔒 ${t('home.adminNoTransact')}` }); setTimeout(() => setCardCartFeedback(null), 3000); return; }
    // Anti-self-purchase : trouver l'article dans les listes réelles
    const listing = [...liveProducts, ...liveServices].find(l => l.id === listingId);
    if (listing && user && listing.owner.userId === user.id) {
      setCardCartFeedback({ id: listingId, msg: `⚠️ ${t('home.cannotBuyOwn')}` });
      setTimeout(() => setCardCartFeedback(null), 3000);
      return;
    }
    if (cardCartBusy) return;
    setCardCartBusy(listingId);
    try {
      const qty = getQty(listingId);
      await ordersApi.addCartItem({ listingId, quantity: qty });
      setCardCartFeedback({ id: listingId, msg: `✓ ${qty > 1 ? qty + '× ' : ''}${t('home.addedToCart')}` });
      setCardQty((prev) => { const next = { ...prev }; delete next[listingId]; return next; });
    } catch {
      setCardCartFeedback({ id: listingId, msg: `✗ ${t('home.errorGeneric')}` });
    } finally {
      setCardCartBusy(null);
      setTimeout(() => setCardCartFeedback(null), 2000);
    }
  };

  const handleCardNegotiate = (listing: PublicListing, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { navigate('/login'); return; }
    if (isAdmin) { setCardCartFeedback({ id: listing.id, msg: `🔒 ${t('home.adminNoNegotiate')}` }); setTimeout(() => setCardCartFeedback(null), 3000); return; }
    setNegotiateListing(listing);
  };

  const navigateToArticle = (p: PublicListing) => {
    if (p.owner.username) {
      navigate(`/user/${p.owner.username}#listing-${p.id}`);
    } else {
      navigate('/explorer?type=produits');
    }
  };

  const userName = user?.profile.displayName || user?.profile.username || user?.email || t("home.visitor");
  const userCode = user
    ? `${user.role === "BUSINESS" ? t("home.businessRole") : t("home.userRole")} · ${user.id.slice(0, 8)}`
    : t("home.visitorMode");

  // Scroll reveal
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("is-visible"); });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".h-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // So-Kin auto-rotate
  useEffect(() => {
    if (sokinFeed.length === 0) return;
    const timer = setInterval(() => {
      setSokinIndex((prev) => (prev + 1) % sokinFeed.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [sokinFeed.length]);

  // Close popups on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setIsInfoOpen(false); setIsAccountOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = searchQuery.trim();
    window.location.href = q ? `/explorer?query=${encodeURIComponent(q)}` : "/explorer";
  };

  const currentTip = t(TIPS_KEYS[tipIndex]);

  // Safe indices pour les widgets rotatifs de la sidebar
  const safeShopIdx = trendingShops.length > 0 ? shopIndex % trendingShops.length : 0;
  const safeSellerIdx = trendingProfiles.length > 0 ? sellerIndex % trendingProfiles.length : 0;
  const safeKinIdx = sokinFeed.length > 0 ? sokinIndex % sokinFeed.length : 0;
  const currentSokinPost = sokinFeed.length > 0 ? sokinFeed[safeKinIdx] : null;

  return (
    <div className="h-shell">
      {/* ═══════ TOP BAR ═══════ */}
      <header className="h-topbar">
        {/* Enseigne KIN-SELL */}
        <div className="h-enseigne glass-container" role="button" onClick={() => navigate('/')} aria-label={t('home.homeAria')} style={{ cursor: 'pointer' }}>
          <span className="h-enseigne-shine" aria-hidden="true" />
          {LETTERS.map((letter, i) => (
            <span key={`${letter}-${i}`} className="h-letter glass-card" style={{ animationDelay: `${i * 140}ms` }}>
              {letter}
            </span>
          ))}
        </div>

        {/* Search */}
        <form className="h-search glass-container" onSubmit={handleSearch}>
          <span className="h-search-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('home.searchPlaceholder')}
            className="h-search-input"
          />
          <button type="button" className="h-action-btn h-fullscreen-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"} title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}>
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            )}
          </button>
        </form>

        {/* Actions */}
        <div className="h-actions glass-container">
          <button type="button" className="h-action-btn ks-help-btn" onClick={() => setIsInfoOpen(true)} aria-label={t('home.info')} title={t('home.info')}>
            <span>?</span>
          </button>
          {isLoggedIn && (
            <>
              <button type="button" className="h-action-btn h-action-btn--notif" aria-label={t('home.notifications')} title={t('home.notifications')} onClick={() => { sessionStorage.setItem('ud-section', 'overview'); navigate(getDashboardPath(user?.role)); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {notificationsCount > 0 && <span className="h-notif-badge">{notificationsCount}</span>}
              </button>
              <button type="button" className="h-action-btn" aria-label={t('home.messaging')} title={t('home.messaging')} onClick={() => { sessionStorage.setItem('ud-section', 'messages'); navigate(getDashboardPath(user?.role)); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </button>
              <button type="button" className="h-action-btn h-action-btn--cart" aria-label={t('home.cartLabel')} title={t('home.cartLabel')} onClick={() => navigate('/cart')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                {buyerCart && buyerCart.itemsCount > 0 && <span className="h-cart-count">{buyerCart.itemsCount}</span>}
              </button>
            </>
          )}
          <div
            role="button"
            onClick={() => {
              navigate('/');
              window.dispatchEvent(new CustomEvent("ks-pwa-force-show"));
            }}
            className="h-logo-round"
            aria-label={t('home.homeAria')}
            title={t('home.homeAria')}
            style={{ cursor: 'pointer' }}
          >
            <img src="/assets/kin-sell/Logo%20Kin-Sell.png" alt="Kin-Sell" />
          </div>
        </div>
      </header>

      {/* ═══════ MAIN 3-COLUMN ═══════ */}
      <main className="h-main">
        {/* ── LEFT SIDEBAR ── */}
        <aside className="h-sidebar h-reveal">
          {/* Account block */}
          <div
            className="h-account glass-container"
            role="button"
            tabIndex={0}
            onClick={(event) => {
              const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
              setAccountMenuPos({ top: rect.bottom + 10, left: rect.left, width: rect.width });
              setIsAccountOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
                setAccountMenuPos({ top: rect.bottom + 10, left: rect.left, width: rect.width });
                setIsAccountOpen(true);
              }
            }}
          >
            <div className="h-avatar">
              {user?.profile.avatarUrl ? (
                <img src={user.profile.avatarUrl} alt={userName} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : null}
              <span className="h-avatar-fallback">{userName.charAt(0).toUpperCase()}</span>
            </div>
            <div className="h-account-info">
              <strong>{userName}</strong>
              <span className="h-user-code">{userCode}</span>
            </div>
          </div>

          {/* Categories Produits */}
          <nav className="h-cat-box glass-container">
            <p className="h-cat-title">{t('home.productCategories')}</p>
            <div className="h-cat-list">
              {PRODUCT_CATEGORIES.map((c) => (
                <button type="button" key={c.code} onClick={() => navigate(c.href)} className="h-cat-item">
                  <span className="h-cat-code">{c.code}</span>
                  <span>{t(c.nameKey)}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* Link services & produits */}
          <button type="button" onClick={() => navigate('/explorer')} className="h-link-services glass-container">
            {t('home.servicesAndProducts')}
          </button>

          {/* Categories Services */}
          <nav className="h-cat-box glass-container">
            <p className="h-cat-title">{t('home.serviceCategories')}</p>
            <div className="h-cat-list">
              {SERVICE_CATEGORIES.map((c) => (
                <button type="button" key={c.code} onClick={() => navigate(c.href)} className="h-cat-item">
                  <span className="h-cat-code">{c.code}</span>
                  <span>{t(c.nameKey)}</span>
                </button>
              ))}
            </div>
          </nav>


          {/* Boutiques en vogue — données réelles */}
          <div className="h-trending glass-container">
            <p className="h-cat-title">{t('home.trendingShops')}</p>
            {trendingShops.length === 0 ? (
              <p className="h-trending-empty">{t('home.noShops')}</p>
            ) : (
              <>
                <div role="button" onClick={() => navigate(`/business/${trendingShops[safeShopIdx].slug}`)} className="h-trending-card glass-card" style={{ cursor: 'pointer' }}>
                  <div className="h-trending-avatar">{trendingShops[safeShopIdx].name.charAt(0).toUpperCase()}</div>
                  <div className="h-trending-info">
                    <strong>{trendingShops[safeShopIdx].name}</strong>
                    <span className="h-tag">{trendingShops[safeShopIdx].badge}</span>
                    <span className="h-tag">{trendingShops[safeShopIdx].city}</span>
                  </div>
                </div>
                <div className="h-trending-dots">
                  {trendingShops.map((_, i) => (
                    <button key={i} type="button" className={`h-sokin-dot${i === safeShopIdx ? " active" : ""}`} onClick={() => setShopIndex(i)} aria-label={`${t('home.trendingShops')} ${i + 1}`} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Vendeurs populaires — données réelles */}
          <div className="h-trending glass-container">
            <p className="h-cat-title">{t('home.popularSellers')}</p>
            {trendingProfiles.length === 0 ? (
              <p className="h-trending-empty">{t('home.noProfiles')}</p>
            ) : (
              <>
                <div role="button" onClick={() => navigate(trendingProfiles[safeSellerIdx].username ? `/user/${trendingProfiles[safeSellerIdx].username}` : '/sokin/profiles')} className="h-trending-card glass-card" style={{ cursor: 'pointer' }}>
                  <div className="h-trending-avatar">
                    {trendingProfiles[safeSellerIdx].avatarUrl
                      ? <img src={trendingProfiles[safeSellerIdx].avatarUrl!} alt={trendingProfiles[safeSellerIdx].displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : trendingProfiles[safeSellerIdx].displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="h-trending-info">
                    <strong>{trendingProfiles[safeSellerIdx].displayName}</strong>
                    <span className="h-tag">{trendingProfiles[safeSellerIdx].badge}</span>
                    <span className="h-tag">{trendingProfiles[safeSellerIdx].city}</span>
                  </div>
                </div>
                <div className="h-trending-dots">
                  {trendingProfiles.map((_, i) => (
                    <button key={i} type="button" className={`h-sokin-dot${i === safeSellerIdx ? " active" : ""}`} onClick={() => setSellerIndex(i)} aria-label={`${t('home.popularSellers')} ${i + 1}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* ── CENTER CONTENT ── */}
        <div className="h-center">
          {/* Dashboard row: Panier | Stats | Commande */}
          <div className="h-dash-row h-reveal">
            <div role="button" onClick={() => navigate('/cart')} className="h-dash-card glass-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              <div className="h-dash-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              </div>
              <p className="h-dash-label">{t('home.cartLabel')}</p>
              <p className="h-dash-value">{buyerCart ? buyerCart.itemsCount : 0}</p>
              <p className="h-dash-note">{buyerCart && buyerCart.itemsCount > 0 ? `${buyerCart.itemsCount} ${t('home.itemsInCart')}` : t('home.emptyCart')}</p>
              <p className="h-dash-amount">{buyerCart ? money(buyerCart.subtotalUsdCents) : '0,00 $'}</p>
            </div>

            <div role="button" onClick={() => { sessionStorage.setItem('ud-section', 'sales'); navigate(getDashboardPath(user?.role)); }} className="h-dash-card glass-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              <div className="h-dash-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
              </div>
              <p className="h-dash-label">{t('home.salesStats')}</p>
              <p className="h-dash-value">{sellerStats.total}</p>
              <p className="h-dash-note">{sellerStats.inProgress} {t('home.inProgress')} · {sellerStats.delivered} {t('home.deliveredLabel')}</p>
              <p className="h-dash-amount">{money(sellerStats.revenue)} {t('home.revenue')}</p>
            </div>

            <div role="button" onClick={() => { sessionStorage.setItem('ud-section', 'purchases'); navigate(getDashboardPath(user?.role)); }} className="h-dash-card glass-card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
              <div className="h-dash-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <p className="h-dash-label">{t('home.lastOrder')}</p>
              {lastBuyerOrder ? (
                <>
                  <p className="h-dash-value">{money(lastBuyerOrder.totalUsdCents)}</p>
                  <p className="h-dash-note">#{lastBuyerOrder.id.slice(0, 8).toUpperCase()} · {lastBuyerOrder.status === 'DELIVERED' ? t('home.statusDelivered') : lastBuyerOrder.status === 'CANCELED' ? t('home.statusCanceled') : t('home.statusInProgress')}</p>
                </>
              ) : (
                <p className="h-dash-note">{t('home.noOrders')}</p>
              )}
            </div>
          </div>

          {/* Bannière publicitaire */}
          <AdBanner page="home" />

          {/* Articles Produits — 4×2 grid, scrollable inside glass */}
          <section className="h-articles h-reveal glass-container">
            <div className="h-articles-head">
              <p className="h-section-title">{t('home.productsForSale')}</p>
              <button type="button" onClick={() => navigate('/explorer?type=produits')} className="h-articles-link">{t('home.viewAll')}</button>
            </div>
          <div className="h-articles-scroll">
              {isLoadingArticles ? (
                <p className="h-articles-empty">{t('home.loadingProducts')}</p>
              ) : liveProducts.length === 0 ? (
                <p className="h-articles-empty">{t('home.noProducts')}</p>
              ) : (
              <div className="h-articles-grid">
                {liveProducts.map((p) => (
                  <div key={p.id} className="h-article-card glass-card" role="button" tabIndex={0}
                    onClick={() => navigateToArticle(p)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigateToArticle(p); }}
                    onMouseEnter={(e) => articleHover.handleMouseEnter({ title: p.title, description: p.description, price: formatPriceLabelFromUsdCents(p.priceUsdCents), sellerName: p.owner.displayName || t("common.seller") }, e)}
                    onMouseLeave={articleHover.handleMouseLeave}
                  >
                    <div className="h-article-thumb" style={p.imageUrl ? { backgroundImage: `url(${p.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                      <span className="h-article-cat">{p.category}</span>
                    </div>
                    <div className="h-article-body">
                      <strong className="h-article-title">{p.title}</strong>
                      <span className="h-article-price">{formatPriceLabelFromUsdCents(p.priceUsdCents)}</span>
                      {p.owner.displayName && (
                        <span className="h-article-seller">
                          {p.owner.avatarUrl ? <img src={p.owner.avatarUrl} alt="" className="h-article-seller-avatar" /> : <span className="h-article-seller-dot" />}
                          {p.owner.displayName}
                        </span>
                      )}
                      <div className="h-article-actions">
                        <span className="h-qty-selector">
                          <button type="button" className="h-qty-btn" onClick={(e) => changeQty(p.id, -1, e)} disabled={getQty(p.id) <= 1}>−</button>
                          <span className="h-qty-value">{getQty(p.id)}</span>
                          <button type="button" className="h-qty-btn" onClick={(e) => changeQty(p.id, 1, e)}>+</button>
                        </span>
                        <button type="button" className="h-article-action-btn" title={t("common.addToCart")} disabled={cardCartBusy === p.id} onClick={(e) => void handleCardAddToCart(p.id, e)}>🛒</button>
                        {p.isNegotiable !== false && !isCategoryLocked(lockedCats, p.category) && <button type="button" className="h-article-action-btn" title={t("common.negotiate")} onClick={(e) => handleCardNegotiate(p, e)}>🤝</button>}
                      </div>
                      {cardCartFeedback?.id === p.id && <span className="h-article-feedback">{cardCartFeedback.msg}</span>}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          </section>

          {/* Articles Services — 4×2 grid, scrollable inside glass */}
          <section className="h-articles h-reveal glass-container">
            <div className="h-articles-head">
              <p className="h-section-title">{t('home.servicesForSale')}</p>
              <button type="button" onClick={() => navigate('/explorer?type=services')} className="h-articles-link">{t('home.viewAll')}</button>
            </div>
          <div className="h-articles-scroll">
              {isLoadingArticles ? (
                <p className="h-articles-empty">{t('home.loadingServices')}</p>
              ) : liveServices.length === 0 ? (
                <p className="h-articles-empty">{t('home.noServices')}</p>
              ) : (
              <div className="h-articles-grid">
                {liveServices.map((s) => (
                  <div key={s.id} className="h-article-card h-article-card--svc glass-card" role="button" tabIndex={0}
                    onClick={() => { if (s.owner.username) navigate(`/user/${s.owner.username}#listing-${s.id}`); else navigate('/explorer?type=services'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { if (s.owner.username) navigate(`/user/${s.owner.username}#listing-${s.id}`); else navigate('/explorer?type=services'); } }}
                    onMouseEnter={(e) => articleHover.handleMouseEnter({ title: s.title, description: s.description, price: formatPriceLabelFromUsdCents(s.priceUsdCents), sellerName: s.owner.displayName || t("common.seller") }, e)}
                    onMouseLeave={articleHover.handleMouseLeave}
                  >
                    <div className="h-article-thumb h-article-thumb--svc" style={s.imageUrl ? { backgroundImage: `url(${s.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                      <span className="h-article-cat">{s.category}</span>
                    </div>
                    <div className="h-article-body">
                      <strong className="h-article-title">{s.title}</strong>
                      <span className="h-article-price">{formatPriceLabelFromUsdCents(s.priceUsdCents)}</span>
                      {s.owner.displayName && (
                        <span className="h-article-seller">
                          {s.owner.avatarUrl ? <img src={s.owner.avatarUrl} alt="" className="h-article-seller-avatar" /> : <span className="h-article-seller-dot" />}
                          {s.owner.displayName}
                        </span>
                      )}
                      <div className="h-article-actions">
                        <span className="h-qty-selector">
                          <button type="button" className="h-qty-btn" onClick={(e) => changeQty(s.id, -1, e)} disabled={getQty(s.id) <= 1}>−</button>
                          <span className="h-qty-value">{getQty(s.id)}</span>
                          <button type="button" className="h-qty-btn" onClick={(e) => changeQty(s.id, 1, e)}>+</button>
                        </span>
                        <button type="button" className="h-article-action-btn" title={t("common.addToCart")} disabled={cardCartBusy === s.id} onClick={(e) => void handleCardAddToCart(s.id, e)}>🛒</button>
                        {s.isNegotiable !== false && !isCategoryLocked(lockedCats, s.category) && <button type="button" className="h-article-action-btn" title={t("common.negotiate")} onClick={(e) => handleCardNegotiate(s, e)}>🤝</button>}
                      </div>
                      {cardCartFeedback?.id === s.id && <span className="h-article-feedback">{cardCartFeedback.msg}</span>}
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          </section>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <aside className="h-right h-reveal">
          <div className="h-sokin-box glass-container">
            <p className="h-sokin-title">So-Kin</p>
            <p className="h-sokin-subtitle">{t('home.sokinFeed')}</p>

            {currentSokinPost === null ? (
              <div className="h-sokin-card glass-card">
                <p className="h-sokin-text" style={{ opacity: 0.6 }}>{t('home.noSokinPosts')}</p>
              </div>
            ) : (
              <div className="h-sokin-card glass-card" key={safeKinIdx}>
                <p className="h-sokin-author">{currentSokinPost.author.profile?.displayName ?? t('home.defaultUser')}</p>
                <p className="h-sokin-text">{currentSokinPost.text}</p>
                <div className="h-sokin-meta">
                  <span className="h-sokin-like">👍 {currentSokinPost.likes}</span>
                  <span className="h-sokin-replies">💬 {currentSokinPost.comments}</span>
                </div>
              </div>
            )}

            {sokinFeed.length > 1 && (
              <div className="h-sokin-dots">
                {sokinFeed.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`h-sokin-dot${i === safeKinIdx ? " active" : ""}`}
                    onClick={() => setSokinIndex(i)}
                    aria-label={`${t('home.sokinFeed')} ${i + 1}`}
                  />
                ))}
              </div>
            )}

            <button type="button" onClick={() => navigate('/sokin')} className="glass-button primary h-sokin-cta">{t('home.viewMoreSokin')}</button>
          </div>

          {/* Liens So-Kin */}
          <div className="h-sokin-links">
            <button type="button" onClick={() => navigate('/sokin/profiles')} className="glass-button secondary h-sokin-cta">{t('home.sokinProfiles')}</button>
            <button type="button" onClick={() => navigate('/sokin/market')} className="glass-button secondary h-sokin-cta">{t('home.sokinMarket')}</button>
          </div>

          {/* Conseils d'utilisation */}
          <div className="h-tips-box glass-container">
            <p className="h-sokin-title">{t('home.usageTips')}</p>
            <p className="h-tip-text">{currentTip}</p>
            <div className="h-sokin-dots">
              {TIPS_KEYS.map((_, i) => (
                <button key={i} type="button" className={`h-sokin-dot${i === tipIndex ? " active" : ""}`} onClick={() => setTipIndex(i)} aria-label={`${t('home.usageTips')} ${i + 1}`} />
              ))}
            </div>
          </div>

          {/* Kin-Sell Blog */}
          <div className="h-blog-box glass-container">
            <p className="h-sokin-title">{t('home.blog')}</p>
            <p className="h-blog-note">{t('home.blogNote')}</p>
            <div className="h-blog-list">
              {blogPosts.length === 0 ? (
                <div className="h-blog-card glass-card">
                  <span className="h-blog-card-title">Kin-Sell continue d'évoluer</span>
                  <span className="h-blog-card-excerpt">Les prochains articles publiés via l'espace admin apparaîtront ici.</span>
                </div>
              ) : blogPosts.map((post) => (
                <button key={post.id} type="button" className="h-blog-card glass-card" onClick={() => navigate('/blog')}>
                  <span className="h-blog-card-meta">{post.author} · {new Date(post.publishedAt ?? post.createdAt).toLocaleDateString('fr-FR')}</span>
                  <span className="h-blog-card-title">{post.title}</span>
                  <span className="h-blog-card-excerpt">{post.excerpt ?? `${post.content.slice(0, 110)}…`}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => navigate('/blog')} className="glass-button secondary h-sokin-cta">{t('home.readBlog')}</button>
          </div>

        </aside>
      </main>

      {/* ═══════ INFO POPUP ═══════ */}
      {isInfoOpen && (
        <div className="h-popup-overlay" onClick={() => setIsInfoOpen(false)}>
          <div className="h-popup glass-container" onClick={(e) => e.stopPropagation()}>
            <div className="h-popup-head">
              <strong>Kin-Sell</strong>
              <p>{t('home.quickNav')}</p>
              <button type="button" className="h-popup-close" onClick={() => setIsInfoOpen(false)}>✕</button>
            </div>
            <nav className="h-popup-links">
              {INFO_ITEMS.map((item) => (
                <button type="button" key={item.href} onClick={() => { navigate(item.href); setIsInfoOpen(false); }} className="h-popup-link">{t(item.titleKey)}</button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* ═══════ ACCOUNT POPUP ═══════ */}
      {isAccountOpen && (
        <div className="h-popup-overlay" onClick={() => setIsAccountOpen(false)}>
          <div
            className="h-popup h-popup--sm h-popup--account glass-container"
            style={accountMenuPos ? { top: accountMenuPos.top, left: accountMenuPos.left, width: Math.max(260, accountMenuPos.width) } : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-popup-head">
              <strong>{t('home.account')}</strong>
              <button type="button" className="h-popup-close" onClick={() => setIsAccountOpen(false)}>✕</button>
            </div>
            {isLoggedIn ? (
              <nav className="h-popup-links">
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); navigate(getDashboardPath(user?.role)); }}>{t('home.myAccount')}</button>
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); sessionStorage.setItem('ud-section', 'messages'); navigate(getDashboardPath(user?.role)); }}>{t('home.messaging')}</button>
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); navigate('/cart'); }}>{t('home.cartLabel')}</button>
                <button
                  type="button"
                  className="h-popup-link h-popup-link--btn"
                  onClick={() => {
                    void logout();
                    setIsAccountOpen(false);
                  }}
                >
                  {t('home.disconnect')}
                </button>
              </nav>
            ) : (
              <nav className="h-popup-links">
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); navigate('/login'); }}>{t('home.login')}</button>
                <button type="button" className="h-popup-link h-popup-link--btn" onClick={() => { setIsAccountOpen(false); navigate('/register'); }}>{t('home.createAccount')}</button>
              </nav>
            )}
          </div>
        </div>
      )}

      <ArticleHoverPopup popup={articleHover.popup} />

      {negotiateListing ? (
        <NegotiatePopup
          listing={{
            id: negotiateListing.id,
            title: negotiateListing.title,
            imageUrl: negotiateListing.imageUrl,
            type: negotiateListing.type,
            priceUsdCents: negotiateListing.priceUsdCents,
            ownerDisplayName: negotiateListing.owner.displayName,
          }}
          onClose={() => setNegotiateListing(null)}
          onSuccess={() => {
            setNegotiateListing(null);
            navigate('/cart');
          }}
        />
      ) : null}
    </div>
  );
}
