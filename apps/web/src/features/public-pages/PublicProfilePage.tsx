import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { orders, listings as listingsApi, reviews as reviewsApi, type ReviewItem } from '../../lib/api-client';
import { useHoverPopup, ArticleHoverPopup, type ArticleHoverData } from '../../components/HoverPopup';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { NegotiatePopup } from '../negotiations/NegotiatePopup';
import { useLockedCategories, isCategoryLocked } from '../../hooks/useLockedCategories';
import './public-pages.css';
import { SeoMeta } from '../../components/SeoMeta';

type PublicProfilePageProps = {
  username: string;
};

type ApiListing = {
  id: string;
  type: 'PRODUIT' | 'SERVICE';
  title: string;
  category: string;
  city: string | null;
  imageUrl: string | null;
  priceUsdCents: number;
  createdAt: string;
};

type ApiReview = {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  rating: number;
  text: string | null;
  createdAt: string;
};

type ApiPublicProfile = {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  domain: string | null;
  qualification: string | null;
  experience: string | null;
  workHours: string | null;
  verificationStatus: string;
  accountType: string;
  averageRating?: number;
  reviewCount?: number;
  reviews?: ApiReview[];
  listings: ApiListing[];
};

type PublicProfileMeta = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  kinId: string;
  city: string;
  rating: string;
  isVerified: boolean;
  qualification?: string;
  experience?: string;
  workHours?: string;
  domain: string;
  responseTime: string;
  salesCount: number;
  servicesDone: number;
  bio: string;
  status: 'En ligne' | 'Hors ligne';
  products: PublicCatalogItem[];
  services: PublicCatalogItem[];
  adSlots: PublicAdSlot[];
};

type PublicCatalogItem = {
  id: string;
  title: string;
  priceLabel: string;
  priceUsdCents: number;
  imageUrl: string;
  promoLabel?: string;
  isNegotiable?: boolean;
  category?: string;
};

type PublicAdSlot = {
  id: string;
  title: string;
  description: string;
};

const PAGE_SIZE = 5;

const DEFAULT_META: PublicProfileMeta = {
  username: 'unknown',
  displayName: 'Utilisateur Kin-Sell',
  avatarUrl: null,
  kinId: '#KS-…',
  city: '',
  rating: '—',
  isVerified: false,
  domain: '',
  responseTime: '—',
  salesCount: 0,
  servicesDone: 0,
  bio: '',
  status: 'Hors ligne',
  products: [],
  services: [],
  adSlots: [],
};

/* ── Star rating helper ── */
function StarRating({ value, onChange, size = 24 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="pp-star-row" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          role={onChange ? 'button' : undefined}
          tabIndex={onChange ? 0 : undefined}
          className={`pp-star ${(hover || value) >= s ? 'pp-star--filled' : ''}`}
          onMouseEnter={() => onChange && setHover(s)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange?.(s)}
          onKeyDown={(e) => e.key === 'Enter' && onChange?.(s)}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function PublicProfilePage({ username }: PublicProfilePageProps) {
  const { t, formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const lockedCats = useLockedCategories();
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();
  useScrollRestore();

  const [profileMeta, setProfileMeta] = useState<PublicProfileMeta>({ ...DEFAULT_META });
  const [profileOwnerId, setProfileOwnerId] = useState<string | null>(null);
  const [productsPage, setProductsPage] = useState(0);
  const [servicesPage, setServicesPage] = useState(0);
  const [cartBusy, setCartBusy] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<{ id: string; message: string } | null>(null);
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const getPubQty = (id: string) => cartQty[id] ?? 1;
  const changePubQty = (id: string, delta: number) => {
    setCartQty((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) }));
  };
  const articleHover = useHoverPopup<ArticleHoverData>();
  const [negotiateListing, setNegotiateListing] = useState<PublicCatalogItem | null>(null);

  // ── Reviews state ──
  const [allReviews, setAllReviews] = useState<ReviewItem[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);

  // ── Report state ──
  const REPORT_REASONS = ['Contenu inapproprié', 'Arnaque / fraude suspectée', 'Faux profil', 'Harcèlement', 'Autre'];
  const [showReportPopup, setShowReportPopup] = useState(false);
  const [reportDraft, setReportDraft] = useState({ reason: 'Contenu inapproprié', detail: '' });
  const [reportMsg, setReportMsg] = useState('');

  const handleSubmitReport = async () => {
    if (!profileOwnerId || !reportDraft.detail.trim()) return;
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL ?? '/api';
      const token = localStorage.getItem('ks-auth-token');
      await fetch(`${apiBaseUrl}/users/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reportedUserId: profileOwnerId, reason: reportDraft.reason, message: reportDraft.detail }),
      });
    } catch { /* ignore */ }
    setReportDraft({ reason: REPORT_REASONS[0], detail: '' });
    setReportMsg('✓ Signalement envoyé, merci.');
    setTimeout(() => { setShowReportPopup(false); setReportMsg(''); }, 1500);
  };

  const isOwnProfile = Boolean(user && profileOwnerId && user.id === profileOwnerId);

  const productPagesCount = Math.max(1, Math.ceil(profileMeta.products.length / PAGE_SIZE));
  const servicePagesCount = Math.max(1, Math.ceil(profileMeta.services.length / PAGE_SIZE));

  const visibleProducts = useMemo(
    () => profileMeta.products.slice(productsPage * PAGE_SIZE, (productsPage + 1) * PAGE_SIZE),
    [productsPage, profileMeta.products]
  );

  const visibleServices = useMemo(
    () => profileMeta.services.slice(servicesPage * PAGE_SIZE, (servicesPage + 1) * PAGE_SIZE),
    [servicesPage, profileMeta.services]
  );

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const handleAddToCart = async (listingId: string) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (isAdmin) {
      setCartFeedback({ id: listingId, message: '🔒 Les administrateurs ne peuvent pas effectuer de transactions.' });
      setTimeout(() => setCartFeedback((prev) => (prev?.id === listingId ? null : prev)), 3000);
      return;
    }
    if (isOwnProfile) {
      setCartFeedback({ id: listingId, message: '⚠️ Vous ne pouvez pas acheter vos propres articles.' });
      setTimeout(() => setCartFeedback((prev) => (prev?.id === listingId ? null : prev)), 3000);
      return;
    }
    if (cartBusy) return;
    setCartBusy(listingId);
    setCartFeedback(null);
    try {
      const qty = getPubQty(listingId);
      await orders.addCartItem({ listingId, quantity: qty });
      setCartFeedback({ id: listingId, message: `✅ ${qty > 1 ? qty + '× ' : ''}Ajouté au panier !` });
      setCartQty((prev) => { const next = { ...prev }; delete next[listingId]; return next; });
      setTimeout(() => setCartFeedback((prev) => (prev?.id === listingId ? null : prev)), 2500);
    } catch {
      setCartFeedback({ id: listingId, message: '❌ Erreur, réessayez.' });
      setTimeout(() => setCartFeedback((prev) => (prev?.id === listingId ? null : prev)), 3000);
    } finally {
      setCartBusy(null);
    }
  };

  const handleNegotiate = (item: PublicCatalogItem) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (isAdmin) {
      setCartFeedback({ id: item.id, message: '🔒 Les administrateurs ne peuvent pas négocier.' });
      setTimeout(() => setCartFeedback((prev) => (prev?.id === item.id ? null : prev)), 3000);
      return;
    }
    setNegotiateListing(item);
  };

  const handleContactSeller = async (listingId?: string) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (!profileOwnerId) return;
    try {
      if (listingId) {
        const result = await listingsApi.contactSeller(listingId);
        navigate(`/messaging/${result.conversationId}`);
      } else {
        navigate(`/messaging?newDm=${profileOwnerId}`);
      }
    } catch {
      navigate('/messaging');
    }
  };

  const handleSubmitReview = async () => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (!profileOwnerId || reviewRating < 1) return;
    setReviewBusy(true);
    setReviewMsg(null);
    try {
      await reviewsApi.create({ targetId: profileOwnerId, rating: reviewRating, text: reviewText || undefined });
      setReviewMsg('✅ Avis envoyé !');
      setReviewRating(0);
      setReviewText('');
      // Reload reviews
      const fresh = await reviewsApi.forUser(profileOwnerId);
      setAllReviews(fresh.reviews);
      setProfileMeta((prev) => ({ ...prev, rating: fresh.averageRating > 0 ? fresh.averageRating.toFixed(1) : '—' }));
      setTimeout(() => { setReviewMsg(null); setShowReviewForm(false); }, 1500);
    } catch {
      setReviewMsg('❌ Erreur, réessayez.');
      setTimeout(() => setReviewMsg(null), 3000);
    } finally {
      setReviewBusy(false);
    }
  };

  /* ── Load profile from API ── */
  useEffect(() => {
    const controller = new AbortController();

    const loadProfile = async () => {
      try {
        const apiBaseUrl = import.meta.env.VITE_API_URL ?? '/api';
        const response = await fetch(`${apiBaseUrl}/users/public/${encodeURIComponent(username)}`, {
          signal: controller.signal,
        });

        if (!response.ok) return;

        const payload = (await response.json()) as ApiPublicProfile;
        setProfileOwnerId(payload.id);

        const mapListing = (l: ApiListing): PublicCatalogItem => ({
          id: l.id,
          title: l.title,
          priceLabel: formatPriceLabelFromUsdCents(l.priceUsdCents),
          priceUsdCents: l.priceUsdCents,
          imageUrl: l.imageUrl ?? '',
          category: l.category,
        });

        const products = payload.listings.filter((l) => l.type === 'PRODUIT').map(mapListing);
        const services = payload.listings.filter((l) => l.type === 'SERVICE').map(mapListing);

        const ratingStr = payload.averageRating && payload.averageRating > 0
          ? payload.averageRating.toFixed(1)
          : '—';

        setProfileMeta((prev) => ({
          ...prev,
          username: payload.username ?? username,
          displayName: payload.displayName,
          avatarUrl: payload.avatarUrl,
          kinId: `#KS-${payload.id.slice(-6).toUpperCase()}`,
          city: payload.city ?? '',
          rating: ratingStr,
          isVerified: payload.verificationStatus === 'VERIFIED',
          bio: payload.bio ?? '',
          domain: payload.domain ?? '',
          qualification: payload.qualification ?? prev.qualification,
          experience: payload.experience ?? prev.experience,
          workHours: payload.workHours ?? prev.workHours,
          products,
          services,
        }));
        setProductsPage(0);
        setServicesPage(0);

        // Set reviews from API
        if (payload.reviews) {
          setAllReviews(payload.reviews.map((r) => ({
            ...r,
            createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(r.createdAt).toISOString(),
          })));
        }
      } catch {
        // Fallback silencieux
      }
    };

    loadProfile();
    return () => controller.abort();
  }, [username]);

  /* ── Scroll-to-listing ── */
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const targetId = hash.replace('#', '');
    const element = document.getElementById(targetId);
    if (element) {
      requestAnimationFrame(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('public-listing-highlight');
        setTimeout(() => element.classList.remove('public-listing-highlight'), 2500);
      });
    }
  }, [username, profileMeta.products.length, profileMeta.services.length]);

  const renderPager = (pageCount: number, currentPage: number, onChange: (page: number) => void) => {
    if (pageCount <= 1) return null;
    return (
      <div className="public-catalog-pager" aria-label="Pagination articles">
        <button type="button" className="public-pager-arrow" onClick={() => onChange(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>←</button>
        <div className="public-pager-indexes">
          {Array.from({ length: pageCount }, (_, index) => (
            <button key={`pager-${index}`} type="button" className={`public-pager-index${index === currentPage ? ' active' : ''}`} onClick={() => onChange(index)}>
              [{index + 1}]
            </button>
          ))}
        </div>
        <button type="button" className="public-pager-arrow" onClick={() => onChange(Math.min(pageCount - 1, currentPage + 1))} disabled={currentPage === pageCount - 1}>→</button>
      </div>
    );
  };

  const visibleReviews = allReviews.slice(0, 3);

  return (
    <section className="public-page-shell animate-fade-in">
      <SeoMeta
        title={`${profileMeta.displayName} — Vendeur sur Kin-Sell`}
        description={`Découvrez le profil de ${profileMeta.displayName} sur Kin-Sell. Parcourez ses produits et services disponibles à Kinshasa.`}
        canonical={`https://kin-sell.com/user/${username}`}
        ogImage={profileMeta.avatarUrl ?? undefined}
      />
      {/* ── Banner + Avatar Hero ── */}
      <div className="public-hero-banner">
        <div className="public-hero-backdrop" />
        <div className="public-hero-inner">
          <div className="public-avatar-frame">
            {profileMeta.avatarUrl ? (
              <img
                src={profileMeta.avatarUrl}
                alt={profileMeta.displayName}
              />
            ) : (
              <div className="public-avatar-placeholder">{profileMeta.displayName.charAt(0).toUpperCase()}</div>
            )}
            <span className={`public-status-dot ${profileMeta.status === 'En ligne' ? 'online' : ''}`} />
          </div>

          <div className="public-hero-info">
            <div className="public-hero-name-row">
              <h1 className="public-title">{profileMeta.displayName}</h1>
              {profileMeta.isVerified ? <span className="public-verified-badge" title="Profil vérifié">✔</span> : null}
              <span className="public-kinid-chip">{profileMeta.kinId}</span>
            </div>
            <p className="public-hero-domain">{profileMeta.domain}</p>
            <div className="public-meta-row">
              <span className="public-pill">📍 {profileMeta.city}</span>
              <button
                type="button"
                className="public-pill public-pill--clickable"
                onClick={() => {
                  if (!isLoggedIn) { navigate('/login'); return; }
                  if (isOwnProfile) return;
                  setShowReviewForm(true);
                }}
                title="Laisser un avis"
              >
                ⭐ {profileMeta.rating} ({allReviews.length})
              </button>
              <span className="public-pill">{profileMeta.status === 'En ligne' ? '🟢' : '⚪'} {profileMeta.status}</span>
            </div>
          </div>

          <div className="public-hero-actions">
            <button type="button" className="public-contact-btn" onClick={() => handleContactSeller()}>
              💬 Écrire
            </button>
            <button type="button" className="public-connect-btn" onClick={() => navigate(`/messaging?newDm=${profileOwnerId}&requestContact=1`)}>
              🤝 Ajouter
            </button>
            <button type="button" className="public-favorite-btn">♡ Favori</button>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <section className="public-quick-stats" aria-label="Informations rapides">
        <article className="public-stat-card">
          <strong>{profileMeta.salesCount}</strong>
          <span>Ventes</span>
        </article>
        <article className="public-stat-card">
          <strong>{profileMeta.servicesDone}</strong>
          <span>Services réalisés</span>
        </article>
        <article className="public-stat-card">
          <strong>{profileMeta.responseTime}</strong>
          <span>Temps de réponse</span>
        </article>
        <article className="public-stat-card">
          <strong>⭐ {profileMeta.rating}</strong>
          <span>Note globale</span>
        </article>
      </section>

      {/* ── Bio + facts ── */}
      <div className="public-bio-section">
        <p className="public-bio">{profileMeta.bio}</p>
        <div className="public-profile-facts">
          <span className="public-pill accent">Domaine: {profileMeta.domain}</span>
          {profileMeta.qualification ? <span className="public-pill">Qualification: {profileMeta.qualification}</span> : null}
          {profileMeta.experience ? <span className="public-pill">Expérience: {profileMeta.experience}</span> : null}
          {profileMeta.workHours ? <span className="public-pill">Horaire: {profileMeta.workHours}</span> : null}
        </div>
      </div>

      {/* ── Qualifications & Expérience highlight ── */}
      {(profileMeta.qualification || profileMeta.experience) ? (
        <section className="public-highlights-section">
          <h2 className="public-highlights-title">🏅 Compétences & Expérience</h2>
          <div className="public-highlights-grid">
            {profileMeta.qualification ? (
              <div className="public-highlight-card">
                <span className="public-highlight-icon">🎓</span>
                <div>
                  <strong>Qualification</strong>
                  <p>{profileMeta.qualification}</p>
                </div>
              </div>
            ) : null}
            {profileMeta.experience ? (
              <div className="public-highlight-card">
                <span className="public-highlight-icon">💼</span>
                <div>
                  <strong>Expérience</strong>
                  <p>{profileMeta.experience}</p>
                </div>
              </div>
            ) : null}
            {profileMeta.workHours ? (
              <div className="public-highlight-card">
                <span className="public-highlight-icon">🕐</span>
                <div>
                  <strong>Horaires</strong>
                  <p>{profileMeta.workHours}</p>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {profileMeta.adSlots[0] ? (
        <section className="public-ad-banner" aria-label="Espace publicitaire profil">
          <strong>{profileMeta.adSlots[0].title}</strong>
          <span>{profileMeta.adSlots[0].description}</span>
        </section>
      ) : null}

      {profileMeta.products.length > 0 ? (
        <section className="public-section" aria-label="Produits proposés">
          <div className="public-section-head">
            <h2>📦 Produits</h2>
            <span className="public-section-count">{profileMeta.products.length} article{profileMeta.products.length > 1 ? 's' : ''}</span>
          </div>

          <div className="public-catalog-box">
            <div className="public-catalog-grid five-up">
              {visibleProducts.map((article) => (
                <article key={article.id} id={`listing-${article.id}`} className="public-listing-card public-catalog-card"
                  onMouseEnter={(e) => articleHover.handleMouseEnter({ title: article.title, description: null, price: article.priceLabel, sellerName: profileMeta.displayName }, e)}
                  onMouseLeave={articleHover.handleMouseLeave}
                >
                  <div className="public-card-media-wrap">
                    {article.imageUrl ? (
                      <img className="public-card-image" src={article.imageUrl} alt={article.title} />
                    ) : (
                      <div className="public-card-image public-card-no-img">📦</div>
                    )}
                    <button type="button" className="public-card-fav" aria-label="Ajouter aux favoris">♡</button>
                    {article.promoLabel ? <span className="public-card-badge">{article.promoLabel}</span> : null}
                  </div>
                  <h3 className="public-listing-title">{article.title}</h3>
                  <p className="public-listing-price">{article.priceLabel}</p>
                  <div className="public-card-actions">
                    <span className="public-qty-selector">
                      <button type="button" className="public-qty-btn" onClick={() => changePubQty(article.id, -1)} disabled={getPubQty(article.id) <= 1}>−</button>
                      <span className="public-qty-value">{getPubQty(article.id)}</span>
                      <button type="button" className="public-qty-btn" onClick={() => changePubQty(article.id, 1)}>+</button>
                    </span>
                    <button type="button" className="public-card-btn primary icon-only" title={t("common.addToCart")} aria-label={t("common.addToCart")} disabled={cartBusy === article.id} onClick={() => void handleAddToCart(article.id)}>🛒</button>
                    {article.isNegotiable !== false && !isCategoryLocked(lockedCats, article.category) && <button type="button" className="public-card-btn secondary icon-only" title={t("common.negotiate")} aria-label={t("common.negotiate")} onClick={() => handleNegotiate(article)}>🤝</button>}
                    <button type="button" className="public-card-btn secondary icon-only" title="Contacter le vendeur" aria-label="Contacter le vendeur" onClick={() => void handleContactSeller(article.id)}>💬</button>
                  </div>
                  {cartFeedback?.id === article.id ? <span className="public-card-feedback">{cartFeedback.message}</span> : null}
                </article>
              ))}
            </div>
            {renderPager(productPagesCount, productsPage, setProductsPage)}
          </div>
        </section>
      ) : null}

      {profileMeta.adSlots[1] ? (
        <section className="public-ad-banner subtle" aria-label="Espace publicitaire secondaire">
          <strong>{profileMeta.adSlots[1].title}</strong>
          <span>{profileMeta.adSlots[1].description}</span>
        </section>
      ) : null}

      {profileMeta.services.length > 0 ? (
        <section className="public-section" aria-label="Services proposés">
          <div className="public-section-head">
            <h2>🛠️ Services</h2>
            <span className="public-section-count">{profileMeta.services.length} service{profileMeta.services.length > 1 ? 's' : ''}</span>
          </div>

          <div className="public-catalog-box">
            <div className="public-catalog-grid five-up">
              {visibleServices.map((service) => (
                <article key={service.id} id={`listing-${service.id}`} className="public-listing-card public-catalog-card"
                  onMouseEnter={(e) => articleHover.handleMouseEnter({ title: service.title, description: null, price: service.priceLabel, sellerName: profileMeta.displayName }, e)}
                  onMouseLeave={articleHover.handleMouseLeave}
                >
                  <div className="public-card-media-wrap">
                    {service.imageUrl ? (
                      <img className="public-card-image" src={service.imageUrl} alt={service.title} />
                    ) : (
                      <div className="public-card-image public-card-no-img">🛠️</div>
                    )}
                    <button type="button" className="public-card-fav" aria-label="Ajouter aux favoris">♡</button>
                    {service.promoLabel ? <span className="public-card-badge">{service.promoLabel}</span> : null}
                  </div>
                  <h3 className="public-listing-title">{service.title}</h3>
                  <p className="public-listing-price">{service.priceLabel}</p>
                  <div className="public-card-actions">
                    <span className="public-qty-selector">
                      <button type="button" className="public-qty-btn" onClick={() => changePubQty(service.id, -1)} disabled={getPubQty(service.id) <= 1}>−</button>
                      <span className="public-qty-value">{getPubQty(service.id)}</span>
                      <button type="button" className="public-qty-btn" onClick={() => changePubQty(service.id, 1)}>+</button>
                    </span>
                    <button type="button" className="public-card-btn primary icon-only" title={t("common.addToCart")} aria-label={t("common.addToCart")} disabled={cartBusy === service.id} onClick={() => void handleAddToCart(service.id)}>🛒</button>
                    {service.isNegotiable !== false && !isCategoryLocked(lockedCats, service.category) && <button type="button" className="public-card-btn secondary icon-only" title={t("common.negotiate")} aria-label={t("common.negotiate")} onClick={() => handleNegotiate(service)}>🤝</button>}
                    <button type="button" className="public-card-btn secondary icon-only" title="Contacter le vendeur" aria-label="Contacter le vendeur" onClick={() => void handleContactSeller(service.id)}>💬</button>
                  </div>
                  {cartFeedback?.id === service.id ? <span className="public-card-feedback">{cartFeedback.message}</span> : null}
                </article>
              ))}
            </div>
            {renderPager(servicePagesCount, servicesPage, setServicesPage)}
          </div>
        </section>
      ) : null}

      {profileMeta.products.length === 0 && profileMeta.services.length === 0 ? (
        <div className="public-empty">Aucun article publié pour ce profil pour le moment.</div>
      ) : null}

      {/* ── Avis clients ── */}
      <section className="public-section" aria-label="Avis clients">
        <div className="public-section-head">
          <h2>⭐ Avis ({allReviews.length})</h2>
          {!isOwnProfile && (
            <button
              type="button"
              className="public-connect-btn"
              onClick={() => {
                if (!isLoggedIn) { navigate('/login'); return; }
                setShowReviewForm(true);
              }}
            >
              ✏️ Laisser un avis
            </button>
          )}
        </div>

        {visibleReviews.length > 0 ? (
          <div className="public-reviews-grid">
            {visibleReviews.map((review) => (
              <article key={review.id} className="public-review-card">
                <div className="public-review-top">
                  <strong>{review.authorName}</strong>
                  <span><StarRating value={review.rating} size={16} /></span>
                </div>
                {review.text ? <p>{review.text}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="public-empty">Aucun avis pour le moment. Soyez le premier !</div>
        )}

        {allReviews.length > 3 ? (
          <button type="button" className="public-connect-btn pp-show-all-btn" onClick={() => setShowAllReviews(true)}>
            Voir tous les avis ({allReviews.length})
          </button>
        ) : null}
      </section>

      {/* ── Popup : tous les avis ── */}
      {showAllReviews ? (
        <div className="pp-popup-overlay" onClick={() => setShowAllReviews(false)}>
          <div className="pp-popup" onClick={(e) => e.stopPropagation()}>
            <div className="pp-popup-head">
              <h2>⭐ Tous les avis ({allReviews.length})</h2>
              <button type="button" className="pp-popup-close" onClick={() => setShowAllReviews(false)}>✕</button>
            </div>
            <div className="pp-popup-body">
              {allReviews.map((review) => (
                <article key={review.id} className="public-review-card">
                  <div className="public-review-top">
                    <strong>{review.authorName}</strong>
                    <span><StarRating value={review.rating} size={16} /></span>
                  </div>
                  {review.text ? <p>{review.text}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Popup : laisser un avis ── */}
      {showReviewForm ? (
        <div className="pp-popup-overlay" onClick={() => setShowReviewForm(false)}>
          <div className="pp-popup pp-popup--sm" onClick={(e) => e.stopPropagation()}>
            <div className="pp-popup-head">
              <h2>✏️ Laisser un avis</h2>
              <button type="button" className="pp-popup-close" onClick={() => setShowReviewForm(false)}>✕</button>
            </div>
            <div className="pp-popup-body pp-review-form">
              <label>Note</label>
              <StarRating value={reviewRating} onChange={setReviewRating} size={32} />
              <label>Commentaire (optionnel)</label>
              <textarea
                className="pp-review-textarea"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Partagez votre expérience…"
                rows={3}
                maxLength={500}
              />
              <span className="pp-char-count">{reviewText.length}/500</span>
              {reviewMsg ? <span className="pp-review-msg">{reviewMsg}</span> : null}
              <button type="button" className="public-contact-btn" disabled={reviewRating < 1 || reviewBusy} onClick={handleSubmitReview}>
                {reviewBusy ? '⏳ Envoi…' : '📤 Envoyer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ArticleHoverPopup popup={articleHover.popup} />

      {/* ═══ BOUTON SIGNALEMENT FLOTTANT ═════════════════════ */}
      {!isOwnProfile && (
        <div className="biz-report-float">
          <button type="button" className="biz-report-float-btn" onClick={() => { if (!isLoggedIn) { navigate('/login'); return; } setShowReportPopup(true); }} title="Signaler ce profil">🚩</button>
        </div>
      )}

      {/* ═══ POPUP — SIGNALEMENT ═════════════════════════════ */}
      {showReportPopup && (
        <div className="biz-popup-overlay" onClick={() => { setShowReportPopup(false); setReportMsg(''); }}>
          <div className="biz-popup glass-container" onClick={e => e.stopPropagation()}>
            <div className="biz-popup-head">
              <strong>🚩 Signaler ce profil</strong>
              <button type="button" className="biz-popup-close" onClick={() => { setShowReportPopup(false); setReportMsg(''); }}>✕</button>
            </div>
            {reportMsg ? (
              <p className="biz-popup-success">{reportMsg}</p>
            ) : (
              <div className="biz-popup-body">
                <label className="biz-popup-field">
                  <span>Raison du signalement</span>
                  <select value={reportDraft.reason} onChange={e => setReportDraft(d => ({ ...d, reason: e.target.value }))}>
                    {REPORT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="biz-popup-field">
                  <span>Détails</span>
                  <textarea rows={3} maxLength={500} placeholder="Décrivez le problème..." value={reportDraft.detail} onChange={e => setReportDraft(d => ({ ...d, detail: e.target.value }))} />
                </label>
                <button type="button" className="business-lux-cta primary" style={{ width: '100%', marginTop: '8px' }} disabled={!reportDraft.detail.trim()} onClick={() => void handleSubmitReport()}>Envoyer le signalement</button>
              </div>
            )}
          </div>
        </div>
      )}

      {negotiateListing ? (
        <NegotiatePopup
          listing={{
            id: negotiateListing.id,
            title: negotiateListing.title,
            imageUrl: negotiateListing.imageUrl,
            type: 'PRODUIT',
            priceUsdCents: negotiateListing.priceUsdCents,
            ownerDisplayName: profileMeta.displayName,
          }}
          onClose={() => setNegotiateListing(null)}
          onSuccess={() => {
            setNegotiateListing(null);
            navigate('/cart');
          }}
        />
      ) : null}
    </section>
  );
}
