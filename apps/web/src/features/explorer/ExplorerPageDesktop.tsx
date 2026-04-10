import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../../styles/design-tokens.css';
import './explorer-desktop.css';
import {
  PRODUCT_CATEGORIES,
  SERVICE_CATEGORIES,
} from './explorer-data';
import type { ExplorerArticlePreview } from './explorer-data';
import { slugToCategoryInfo, normalizeCategoryToId } from '../../shared/constants/category-registry';
import { getUrgencyLabel } from '../../shared/promo/promo-engine';
import { explorer as explorerApi, orders as ordersApi, listings as listingsApi, resolveMediaUrl, type ExplorerShopApi, type ExplorerProfileApi } from '../../lib/api-client';
import { useHoverPopup, ArticleHoverPopup, ProfileHoverPopup, type ArticleHoverData, type ProfileHoverData } from '../../components/HoverPopup';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useMarketPreference } from '../../app/providers/MarketPreferenceProvider';
import { NegotiatePopup } from '../negotiations/NegotiatePopup';
import { useLockedCategories, isCategoryLocked } from '../../hooks/useLockedCategories';
import { AdBanner } from '../../components/AdBanner';
import MapView from '../../components/MapView';
import { SeoMeta } from '../../components/SeoMeta';
import { Header } from '../../components/Header';

const PREVIEW_PAGE_SIZE = 4;
const MODAL_PAGE_SIZE = 8;

export function ExplorerPageDesktop() {
  const { t, formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const lockedCats = useLockedCategories();
  const defaultCity = getCountryConfig(effectiveCountry).defaultCity;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlType = searchParams.get('type');
  const urlCategory = searchParams.get('category');
  const urlQuery = searchParams.get('query');

  const [isProducts, setIsProducts] = useState(() => {
    if (urlType === 'services') return false;
    if (urlCategory && slugToCategoryInfo(urlCategory)?.type === 'service') return false;
    return true;
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(() => {
    if (urlCategory) { const info = slugToCategoryInfo(urlCategory); if (info) return info.id; }
    return null;
  });
  const [searchQuery, setSearchQuery] = useState(urlQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [previewPage, setPreviewPage] = useState(0);
  const [modalPage, setModalPage] = useState(0);
  const [isAllArticlesOpen, setIsAllArticlesOpen] = useState(false);
  const [stats, setStats] = useState({
    categories: 0,
    publicProfiles: 0,
    onlineShops: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingArticles, setIsLoadingArticles] = useState(true);
  const [liveArticles, setLiveArticles] = useState<ExplorerArticlePreview[]>([]);
  const [shops, setShops] = useState<ExplorerShopApi[]>([]);
  const [profiles, setProfiles] = useState<ExplorerProfileApi[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({ isDown: false, startX: 0, scrollLeft: 0 });
  const articleHover = useHoverPopup<ArticleHoverData>();
  const profileHover = useHoverPopup<ProfileHoverData>();
  const nav = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const [negotiateArticle, setNegotiateArticle] = useState<ExplorerArticlePreview | null>(null);
  const [exCardBusy, setExCardBusy] = useState<string | null>(null);
  const [exCardFb, setExCardFb] = useState<{ id: string; msg: string } | null>(null);
  const [exCardQty, setExCardQty] = useState<Record<string, number>>({});
  const [isMapView, setIsMapView] = useState(false);
  const getExQty = (id: string) => exCardQty[id] ?? 1;
  const changeExQty = (id: string, delta: number, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setExCardQty((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) })); };
  useScrollRestore();

  const categories = isProducts ? PRODUCT_CATEGORIES : SERVICE_CATEGORIES;
  const allArticles = liveArticles;
  const filteredArticles = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return allArticles.filter((article) => {
      const matchesKind = isProducts ? article.kind === 'product' : article.kind === 'service';
      if (!matchesKind) return false;

      if (selectedCategoryId && article.category !== selectedCategoryId) return false;

      if (!normalizedQuery) return true;

      return [article.title, article.publisherName, article.priceLabel]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [isProducts, searchQuery, allArticles, selectedCategoryId]);

  const previewPageCount = Math.max(1, Math.ceil(filteredArticles.length / PREVIEW_PAGE_SIZE));
  const modalPageCount = Math.max(1, Math.ceil(filteredArticles.length / MODAL_PAGE_SIZE));
  const previewArticles = filteredArticles.slice(
    previewPage * PREVIEW_PAGE_SIZE,
    (previewPage + 1) * PREVIEW_PAGE_SIZE
  );
  const modalArticles = filteredArticles.slice(
    modalPage * MODAL_PAGE_SIZE,
    (modalPage + 1) * MODAL_PAGE_SIZE
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPreviewPage(0);
    setModalPage(0);
  };

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const handleExCardCart = async (articleId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { nav('/login'); return; }
    if (isAdmin) { setExCardFb({ id: articleId, msg: '­🚫 Les administrateurs ne peuvent pas effectuer de transactions.' }); setTimeout(() => setExCardFb(null), 3000); return; }
    // Anti-self-purchase
    const article = liveArticles.find(a => a.id === articleId);
    if (article?.ownerId && user && article.ownerId === user.id) {
      setExCardFb({ id: articleId, msg: '⚠️ Vous ne pouvez pas acheter vos propres articles.' });
      setTimeout(() => setExCardFb(null), 3000);
      return;
    }
    if (exCardBusy) return;
    setExCardBusy(articleId);
    try {
      const qty = getExQty(articleId);
      await ordersApi.addCartItem({ listingId: articleId, quantity: qty });
      setExCardFb({ id: articleId, msg: `✔ ${qty > 1 ? qty + 'ù ' : ''}Ajouté au panier` });
      setExCardQty((prev) => { const next = { ...prev }; delete next[articleId]; return next; });
    } catch {
      setExCardFb({ id: articleId, msg: '✗ Erreur' });
    } finally {
      setExCardBusy(null);
      setTimeout(() => setExCardFb(null), 2000);
    }
  };

  const handleExCardNegotiate = (article: ExplorerArticlePreview, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { nav('/login'); return; }
    if (isAdmin) { setExCardFb({ id: article.id, msg: '­🚫 Les administrateurs ne peuvent pas négocier.' }); setTimeout(() => setExCardFb(null), 3000); return; }
    setNegotiateArticle(article);
  };

  const handleExCardContact = async (article: ExplorerArticlePreview, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoggedIn) { nav('/login'); return; }
    if (article.ownerId && user && article.ownerId === user.id) return;
    try {
      const result = await listingsApi.contactSeller(article.id);
      nav(`/messaging/${result.conversationId}`);
    } catch {
      nav(`/messaging`);
    }
  };

  const handleSwitchToggle = () => {
    setIsProducts((prev) => !prev);
    setSelectedCategoryId(null);
    setPreviewPage(0);
    setModalPage(0);
  };

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategoryId((prev) => prev === categoryId ? null : categoryId);
    setPreviewPage(0);
    setModalPage(0);
  };

  const handleCategoryMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    dragStateRef.current.isDown = true;
    dragStateRef.current.startX = event.pageX - container.offsetLeft;
    dragStateRef.current.scrollLeft = container.scrollLeft;
  };

  const handleCategoryMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container || !dragStateRef.current.isDown) {
      return;
    }

    event.preventDefault();
    const x = event.pageX - container.offsetLeft;
    const walk = (x - dragStateRef.current.startX) * 1.1;
    container.scrollLeft = dragStateRef.current.scrollLeft - walk;
  };

  const stopCategoryDragging = () => {
    dragStateRef.current.isDown = false;
  };

  const buildArticleDescription = (title: string) => `Annonce: ${title}`;

  const buildShopDescription = (badge: string) => `Boutique ${badge.toLowerCase()} active sur Kin-Sell.`;

  const buildProfileDescription = (domain: string) => `Spécialité: ${domain}`;

  const renderPager = (
    pageCount: number,
    currentPage: number,
    onChange: (page: number) => void
  ) => {
    if (pageCount <= 1) {
      return null;
    }

    const maxVisible = 5;
    let startPage = Math.max(0, currentPage - Math.floor(maxVisible / 2));
    const endPage = Math.min(pageCount, startPage + maxVisible);
    if (endPage - startPage < maxVisible) {
      startPage = Math.max(0, endPage - maxVisible);
    }

    return (
      <div className="explorer-pager">
        <button
          type="button"
          className="explorer-pager-btn explorer-pager-btn--nav"
          disabled={currentPage === 0}
          onClick={() => onChange(Math.max(0, currentPage - 1))}
          aria-label="Page précédente"
        >
          ← Préc
        </button>

        <div className="explorer-pager-pages">
          {startPage > 0 && (
            <>
              <button type="button" className="explorer-pager-btn" onClick={() => onChange(0)}>1</button>
              {startPage > 1 && <span className="explorer-pager-ellipsis">…</span>}
            </>
          )}
          {Array.from({ length: endPage - startPage }, (_, i) => {
            const page = startPage + i;
            return (
              <button
                key={`page-${page}`}
                type="button"
                className={`explorer-pager-btn${page === currentPage ? ' explorer-pager-btn--active' : ''}`}
                onClick={() => onChange(page)}
              >
                {page + 1}
              </button>
            );
          })}
          {endPage < pageCount && (
            <>
              {endPage < pageCount - 1 && <span className="explorer-pager-ellipsis">…</span>}
              <button type="button" className="explorer-pager-btn" onClick={() => onChange(pageCount - 1)}>{pageCount}</button>
            </>
          )}
        </div>

        <button
          type="button"
          className="explorer-pager-btn explorer-pager-btn--nav"
          disabled={currentPage === pageCount - 1}
          onClick={() => onChange(Math.min(pageCount - 1, currentPage + 1))}
          aria-label="Page suivante"
        >
          Suiv ►
        </button>
      </div>
    );
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadStats = async () => {
      try {
        const apiBaseUrl = import.meta.env.VITE_API_URL ?? '/api';
        const response = await fetch(`${apiBaseUrl}/explorer/stats`, { signal: controller.signal });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          categories: number;
          publicProfiles: number;
          onlineShops: number;
        };

        setStats(payload);
      } catch {
        // API indisponible — conserver les valeurs à 0
      } finally {
        if (!controller.signal.aborted) setIsLoadingStats(false);
      }
    };

    const loadShops = async () => {
      try {
        const data = await explorerApi.shops({ limit: 4, city: defaultCity, country: effectiveCountry });
        setShops(data);
      } catch {
        // silencieux
      }
    };

    const loadProfiles = async () => {
      try {
        const data = await explorerApi.profiles({ limit: 4, city: defaultCity, country: effectiveCountry });
        setProfiles(data);
      } catch {
        // silencieux
      }
    };

    loadStats();
    loadShops();
    loadProfiles();

    return () => {
      controller.abort();
    };
  }, [defaultCity, effectiveCountry]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;

    const loadArticles = async () => {
      setIsLoadingArticles(true);
      try {
        const normalizedQuery = debouncedQuery.trim();
        const [productsRes, servicesRes] = await Promise.all([
          listingsApi.search({
            type: 'PRODUIT',
            q: normalizedQuery || undefined,
            country: effectiveCountry,
            city: defaultCity,
            limit: 24,
          }),
          listingsApi.search({
            type: 'SERVICE',
            q: normalizedQuery || undefined,
            country: effectiveCountry,
            city: defaultCity,
            limit: 24,
          }),
        ]);

        const mapToPreview = (item: (typeof productsRes.results)[number]): ExplorerArticlePreview => ({
          id: item.id,
          title: item.title,
          priceLabel: formatPriceLabelFromUsdCents(item.promoActive && item.promoPriceUsdCents != null ? item.promoPriceUsdCents : item.priceUsdCents),
          priceUsdCents: item.priceUsdCents,
          kind: item.type === 'PRODUIT' ? 'product' : 'service',
          category: normalizeCategoryToId(item.category),
          publisherName: item.owner.displayName,
          publisherType: 'personne',
          publisherLink: item.owner.username ? `/user/${item.owner.username}` : '#',
          targetPath: item.owner.username ? `/user/${item.owner.username}#${item.id}` : '#',
          coverImage: resolveMediaUrl(item.imageUrl) || '/assets/kin-sell/black-man-standing-cafe-with-shopping-bags.jpg',
          media: [],
          ownerId: item.owner.userId,
          isNegotiable: item.isNegotiable !== false,
          isBoosted: !!(item as any).isBoosted,
          promoLabel: item.promoActive && item.promoPriceUsdCents != null ? formatPriceLabelFromUsdCents(item.promoPriceUsdCents) : undefined,
          originalPriceLabel: item.promoActive && item.promoPriceUsdCents != null ? formatPriceLabelFromUsdCents(item.priceUsdCents) : undefined,
          promoExpiresAt: item.promoActive ? (item as any).promoExpiresAt ?? null : null,
          latitude: item.latitude ?? undefined,
          longitude: item.longitude ?? undefined,
        });

        const products: ExplorerArticlePreview[] = productsRes.results.map(mapToPreview);
        const services: ExplorerArticlePreview[] = servicesRes.results.map(mapToPreview);

        const combined = [...products, ...services];
        if (!cancelled) setLiveArticles(combined);
      } catch {
        // API indisponible — afficher état vide
        if (!cancelled) setLiveArticles([]);
      } finally {
        if (!cancelled) setIsLoadingArticles(false);
      }
    };

    void loadArticles();

    // Auto-refresh results every 60s
    const poll = setInterval(() => { void loadArticles(); }, 60_000);

    return () => { cancelled = true; clearInterval(poll); };
  }, [formatPriceLabelFromUsdCents, debouncedQuery, effectiveCountry, defaultCity]);

  return (
    <>
    <Header />
    <div className="explorer-shell">
      <SeoMeta
        title="Explorer — Boutiques et services à Kinshasa"
        description="Parcourez les boutiques, produits et services disponibles à Kinshasa et partout en RDC. Recherchez par catégorie, prix et localité."
        canonical="https://kin-sell.com/explorer"
      />
      {/* ═══════════════════════════════════════════════
          HERO SECTION
          ═══════════════════════════════════════════════ */}
      <section className="explorer-hero">
        <div className="explorer-hero-inner">
          {/* Hero Image (Left) */}
          <div className="explorer-hero-image">
            <img
              src="/assets/kin-sell/black-man-standing-cafe-with-shopping-bags.jpg"
              alt="Vendeur Kin-Sell présentant des sacs de shopping"
              className="explorer-hero-photo"
            />
          </div>

          {/* Hero Content (Right) */}
          <div className="explorer-hero-content">
            <div className="explorer-hero-label">Catalogue</div>

            <h1 className="explorer-hero-title">Trouvez la bonne catégorie en quelques secondes.</h1>

            <p className="explorer-hero-subtitle">
              Explorez toutes les catégories Kin-Sell, comparez les offres et ouvrez chaque page
              dédiée pour consulter les vendeurs disponibles sur Kin-Sell.
            </p>

            <div className="explorer-hero-search-wrap">
              <div className="explorer-search-bar explorer-search-bar--hero">
                <div className="explorer-search-icon">🔍</div>
                <input
                  type="text"
                  className="explorer-search-input explorer-search-input--hero"
                  placeholder="Rechercher une catégorie, un article/service ou un utilisateur"
                  value={searchQuery}
                  onChange={handleSearch}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="explorer-hero-stats">
              <div className="explorer-stat">
                <div className="explorer-stat-number">{isLoadingStats ? '…' : stats.categories}</div>
                <div className="explorer-stat-label">Catégories</div>
              </div>
              <div className="explorer-stat">
                <div className="explorer-stat-number">{isLoadingStats ? '…' : stats.publicProfiles.toLocaleString('fr-FR')}</div>
                <div className="explorer-stat-label">Profils publics</div>
              </div>
              <div className="explorer-stat">
                <div className="explorer-stat-number">{isLoadingStats ? '…' : stats.onlineShops}</div>
                <div className="explorer-stat-label">Boutiques en ligne</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          MAIN LAYOUT: TABS + CONTENT
          ═══════════════════════════════════════════════ */}
      <div className="explorer-main">
        <div className="explorer-layout">
          {/* LEFT: CONTROL */}
          <div>
            <div className="explorer-switch-wrap">
              <span className="explorer-switch-label">{isProducts ? 'Produits' : 'Services'}</span>
              <div
                className={`explorer-switch-toggle${isProducts ? '' : ' active'}`}
                onClick={handleSwitchToggle}
                role="switch"
                aria-checked={!isProducts}
                title="Basculer entre Produits et Services"
              />
            </div>

            {/* AD SIDEBAR - supprimé */}
          </div>

          {/* RIGHT: CATEGORIES CONTENT */}
          <div className="explorer-content">
            {/* Header */}
            <div className="explorer-header">
              <h2 className="explorer-header-title">
                {isProducts ? '🛍️ Produits' : '💼 Services'} ({categories.length})
              </h2>
            </div>

            {/* Horizontal Scrollable Categories */}
            <div
              className="explorer-categories-scroll"
              ref={scrollRef}
              onMouseDown={handleCategoryMouseDown}
              onMouseMove={handleCategoryMouseMove}
              onMouseUp={stopCategoryDragging}
              onMouseLeave={stopCategoryDragging}
            >
              <div className="explorer-categories-grid">
                {categories.map((category, index) => (
                  <div
                    key={category.id}
                    className={`explorer-category${selectedCategoryId === category.id ? ' explorer-category--selected' : ''}`}
                    style={{ '--index': index } as React.CSSProperties}
                    onClick={() => handleCategoryClick(category.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCategoryClick(category.id); }}
                  >
                    <div className="explorer-category-icon">{category.icon}</div>
                    <div className="explorer-category-meta">
                      <div className="explorer-category-name">{category.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bannière publicitaire */}
        <AdBanner page="explorer" />

        {/* ═══════════════════════════════════════════════
            ARTICLES PREVIEW SECTION
            ═══════════════════════════════════════════════ */}
        <div className="explorer-shops-section">
          <div className="explorer-section-header">
            <h3 className="explorer-section-title">🧩 Articles disponibles</h3>
          </div>

          <div className="explorer-articles-box">
            {isLoadingArticles ? (
              <p className="explorer-empty-msg">Chargement des articles…</p>
            ) : filteredArticles.length === 0 ? (
              <p className="explorer-empty-msg">
                {liveArticles.length === 0
                  ? 'Aucun article publié pour le moment. Soyez le premier à publier une annonce !'
                  : selectedCategoryId
                  ? `Aucun article dans cette catégorie pour le moment.`
                  : 'Aucun résultat pour cette recherche.'}
              </p>
            ) : (
              <>
                <div className="explorer-articles-grid explorer-articles-grid--four">
                  {previewArticles.map((article) => (
                    <article key={article.id} className="explorer-article-card" id={article.id}
                  onMouseEnter={(e) => articleHover.handleMouseEnter({ title: article.title, description: buildArticleDescription(article.title), price: article.priceLabel, sellerName: article.publisherName }, e)}
                  onMouseLeave={articleHover.handleMouseLeave}
                >
                  <div className="explorer-article-cover-wrap">
                    <img className="explorer-article-cover" src={article.coverImage} alt={article.title} />
                    {article.isBoosted && <span className="ks-sponsored-badge">⚡ Sponsorisé</span>}
                    {article.promoLabel ? <span className="explorer-article-badge ks-promo-badge">{article.promoLabel}</span> : null}
                    <div className="explorer-hover-details" aria-hidden="true">
                      <strong>{article.title}</strong>
                      <span>{buildArticleDescription(article.title)}</span>
                      <span>Publieur: {article.publisherName}</span>
                      <span>Prix: {article.priceLabel}</span>
                    </div>
                  </div>

                  <div className="explorer-article-body">
                    <h4 className="explorer-article-title">{article.title}</h4>
                    {article.originalPriceLabel ? (
                      <p className="explorer-article-price"><s className="ks-price-old">{article.originalPriceLabel}</s> {article.priceLabel}</p>
                    ) : (
                      <p className="explorer-article-price">{article.priceLabel}</p>
                    )}
                    {article.promoExpiresAt && (() => { const u = getUrgencyLabel(article.promoExpiresAt); return u ? <span className="promo-urgency-label">⏰ {u}</span> : null; })()}
                    <p className="explorer-article-publisher"><a href={article.publisherLink} onClick={(e) => { e.preventDefault(); e.stopPropagation(); nav(article.publisherLink); }} style={{ color: 'inherit', textDecoration: 'none' }}>{article.publisherName}</a></p>
                    <div className="explorer-article-actions-row">
                      <button type="button" className="explorer-article-action-btn" onClick={() => nav(article.targetPath)}>Voir plus</button>
                      <button type="button" className="explorer-article-action-btn" title="Contacter" onClick={(e) => void handleExCardContact(article, e)}>💬</button>
                      <button type="button" className="explorer-article-action-btn" title={t("common.addToCart")} disabled={exCardBusy === article.id} onClick={(e) => void handleExCardCart(article.id, e)}>🛒</button>
                      {article.isNegotiable !== false && !isCategoryLocked(lockedCats, article.category) && <button type="button" className="explorer-article-action-btn" title={t("common.negotiate")} onClick={(e) => handleExCardNegotiate(article, e)}>🤝</button>}
                    </div>
                    {exCardFb?.id === article.id && <span className="explorer-article-feedback">{exCardFb.msg}</span>}
                  </div>
                </article>
              ))}
            </div>

            <button type="button" className="explorer-show-all-btn" onClick={() => setIsAllArticlesOpen(true)}>
              Tout voir
            </button>
            {renderPager(previewPageCount, previewPage, setPreviewPage)}
              </>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            FEATURED SHOPS SECTION
            ═══════════════════════════════════════════════ */}
        <div className="explorer-shops-section">
          <div className="explorer-section-header">
            <h3 className="explorer-section-title">🏪 Boutiques populaires</h3>
            <a href="/explorer/shops-online" className="explorer-section-link">Voir toutes →</a>
          </div>

          <div className="explorer-shops-grid">
            {shops.length > 0 ? shops.map((shop) => (
              <a key={shop.id} className="explorer-shop-card explorer-shop-card--rich" href={`/business/${shop.slug}`}
                onMouseEnter={(e) => profileHover.handleMouseEnter({ avatarUrl: resolveMediaUrl(shop.coverImage || shop.logo), name: shop.name, username: shop.slug, kinId: null, publicPageUrl: `/business/${shop.slug}` }, e)}
                onMouseLeave={profileHover.handleMouseLeave}
              >
                <div className="explorer-shop-header">
                  {shop.coverImage ? (
                    <img className="explorer-shop-cover" src={resolveMediaUrl(shop.coverImage)} alt={shop.name} loading="lazy" />
                  ) : (
                    <div className="explorer-shop-cover explorer-shop-cover--placeholder">🏪</div>
                  )}
                  <div className="explorer-shop-badge">{shop.badge}</div>
                  <div className="explorer-hover-details" aria-hidden="true">
                    <strong>{shop.name}</strong>
                    <span>{buildShopDescription(shop.badge)}</span>
                    <span>Localisation: {shop.city}</span>
                  </div>
                </div>
                <div className="explorer-shop-name-row">
                  <div className="explorer-shop-name">{shop.name}</div>
                  <span className="explorer-shop-status">En ligne</span>
                </div>
                <div className="explorer-shop-city">{shop.city}</div>
              </a>
            )) : (
              <p className="explorer-empty-msg">Aucune boutique disponible pour le moment.</p>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════

            PUBLIC PROFILES SECTION (Creative addition)
            ═══════════════════════════════════════════════ */}
        <div className="explorer-shops-section">
          <div className="explorer-section-header">
            <h3 className="explorer-section-title">👥 Vendeurs en vedette</h3>
            <a href="/explorer/public-profiles" className="explorer-section-link">Voir tous →</a>
          </div>

          <div className="explorer-shops-grid">
            {profiles.length > 0 ? profiles.map((profile) => (
              <a key={profile.id} className="explorer-shop-card explorer-shop-card--rich" href={profile.username ? `/user/${profile.username}` : '#'}
                onMouseEnter={(e) => profileHover.handleMouseEnter({ avatarUrl: resolveMediaUrl(profile.avatarUrl), name: profile.displayName, username: profile.username, kinId: null, publicPageUrl: profile.username ? `/user/${profile.username}` : null }, e)}
                onMouseLeave={profileHover.handleMouseLeave}
              >
                <div className="explorer-shop-header">
                  {profile.avatarUrl ? (
                    <img className="explorer-shop-cover" src={resolveMediaUrl(profile.avatarUrl)} alt={profile.displayName} loading="lazy" />
                  ) : (
                    <div className="explorer-shop-cover explorer-shop-cover--placeholder">👤</div>
                  )}
                  <div className="explorer-shop-badge">{profile.badge}</div>
                  <div className="explorer-hover-details" aria-hidden="true">
                    <strong>{profile.displayName}</strong>
                    <span>Localisation: {profile.city}</span>
                  </div>
                </div>
                <div className="explorer-shop-name-row">
                  <div className="explorer-shop-name">{profile.displayName}</div>
                </div>
                <div className="explorer-shop-city">{profile.city}</div>
              </a>
            )) : (
              <p className="explorer-empty-msg">Aucun profil public disponible pour le moment.</p>
            )}
          </div>
        </div>


      </div>

      {isAllArticlesOpen ? (
        <div className="explorer-modal-backdrop" role="dialog" aria-modal="true" aria-label="Tous les articles">
          <div className="explorer-modal-panel">
            <div className="explorer-modal-head">
              <h3>Tous les articles</h3>
              <button type="button" className="explorer-modal-close" onClick={() => setIsAllArticlesOpen(false)}>
                ✕
              </button>
            </div>
            <div className="explorer-articles-grid explorer-articles-grid--four">
              {modalArticles.map((article) => (
                <article key={`modal-${article.id}`} className="explorer-article-card"
                  onMouseEnter={(e) => articleHover.handleMouseEnter({ title: article.title, description: buildArticleDescription(article.title), price: article.priceLabel, sellerName: article.publisherName }, e)}
                  onMouseLeave={articleHover.handleMouseLeave}
                >
                  <div className="explorer-article-cover-wrap">
                    <img className="explorer-article-cover" src={article.coverImage} alt={article.title} loading="lazy" />
                    {article.promoLabel ? <span className="explorer-article-badge ks-promo-badge">{article.promoLabel}</span> : null}
                    <div className="explorer-hover-details" aria-hidden="true">
                      <strong>{article.title}</strong>
                      <span>{buildArticleDescription(article.title)}</span>
                      <span>Publieur: {article.publisherName}</span>
                      <span>Prix: {article.priceLabel}</span>
                    </div>
                  </div>
                  <div className="explorer-article-body">
                    <h4 className="explorer-article-title">{article.title}</h4>
                    {article.originalPriceLabel ? (
                      <p className="explorer-article-price"><s className="ks-price-old">{article.originalPriceLabel}</s> {article.priceLabel}</p>
                    ) : (
                      <p className="explorer-article-price">{article.priceLabel}</p>
                    )}
                    {article.promoExpiresAt && (() => { const u = getUrgencyLabel(article.promoExpiresAt); return u ? <span className="promo-urgency-label">⏰ {u}</span> : null; })()}
                    <p className="explorer-article-publisher"><a href={article.publisherLink} onClick={(e) => { e.preventDefault(); e.stopPropagation(); nav(article.publisherLink); }} style={{ color: 'inherit', textDecoration: 'none' }}>{article.publisherName}</a></p>
                    <div className="explorer-article-actions-row">
                      <button type="button" className="explorer-article-action-btn" onClick={() => nav(article.targetPath)}>Voir plus</button>
                      <button type="button" className="explorer-article-action-btn" title="Contacter" onClick={(e) => void handleExCardContact(article, e)}>💬</button>
                      <span className="explorer-qty-selector">
                        <button type="button" className="explorer-qty-btn" onClick={(e) => changeExQty(article.id, -1, e)} disabled={getExQty(article.id) <= 1}>−</button>
                        <span className="explorer-qty-value">{getExQty(article.id)}</span>
                        <button type="button" className="explorer-qty-btn" onClick={(e) => changeExQty(article.id, 1, e)}>+</button>
                      </span>
                      <button type="button" className="explorer-article-action-btn" title={t("common.addToCart")} disabled={exCardBusy === article.id} onClick={(e) => void handleExCardCart(article.id, e)}>🛒</button>
                      {article.isNegotiable !== false && !isCategoryLocked(lockedCats, article.category) && <button type="button" className="explorer-article-action-btn" title={t("common.negotiate")} onClick={(e) => handleExCardNegotiate(article, e)}>🤝</button>}
                    </div>
                    {exCardFb?.id === article.id && <span className="explorer-article-feedback">{exCardFb.msg}</span>}
                  </div>
                </article>
              ))}
            </div>
            {renderPager(modalPageCount, modalPage, setModalPage)}
          </div>
        </div>
      ) : null}

      <ArticleHoverPopup popup={articleHover.popup} />
      <ProfileHoverPopup popup={profileHover.popup} />

      {negotiateArticle ? (
        <NegotiatePopup
          listing={{
            id: negotiateArticle.id,
            title: negotiateArticle.title,
            imageUrl: negotiateArticle.coverImage,
            type: negotiateArticle.kind === 'product' ? 'PRODUIT' : 'SERVICE',
            priceUsdCents: negotiateArticle.priceUsdCents,
            ownerDisplayName: negotiateArticle.publisherName,
          }}
          onClose={() => setNegotiateArticle(null)}
          onSuccess={() => {
            setNegotiateArticle(null);
            nav('/cart');
          }}
        />
      ) : null}
    </div>
    </>
  );
}
