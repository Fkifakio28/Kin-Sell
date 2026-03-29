import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { orders } from '../../lib/api-client';
import { useHoverPopup, ArticleHoverPopup, type ArticleHoverData } from '../../components/HoverPopup';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { NegotiatePopup } from '../negotiations/NegotiatePopup';
import { useLockedCategories, isCategoryLocked } from '../../hooks/useLockedCategories';
import './public-pages.css';

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
  listings: ApiListing[];
};

type PublicProfileMeta = {
  username: string;
  displayName: string;
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

const PROFILE_META_BY_USERNAME: Record<string, PublicProfileMeta> = {
  kendal: {
    username: 'kendal',
    displayName: 'Kendal',
    kinId: '#KS-A54011',
    city: 'Kinshasa, Gombe',
    rating: '4.9',
    isVerified: true,
    qualification: 'Sourcing digital & relation client',
    experience: '6 ans',
    workHours: '08h00 - 20h00',
    domain: 'Tech premium, sourcing et immobilier',
    responseTime: '~ 6 min',
    salesCount: 192,
    servicesDone: 88,
    bio: 'Je propose des produits verifies, un accompagnement serieux et une execution rapide sur Kin-Sell.',
    status: 'En ligne',
    products: [
      { id: 'listing-ks-2302', title: 'Appartement 2 chambres a Gombe', priceLabel: '1 200 $ / mois', priceUsdCents: 120000, imageUrl: '/assets/kin-sell/black-man-standing-cafe-with-shopping-bags.jpg', promoLabel: 'Choix premium' },
      { id: 'kendal-prod-2', title: 'MacBook Pro M2 16 pouces', priceLabel: '2 450 $', priceUsdCents: 245000, imageUrl: '/assets/kin-sell/woman-using-computer-credit-card.jpg' },
      { id: 'kendal-prod-3', title: 'iPhone 14 Pro scelle', priceLabel: '1 180 $', priceUsdCents: 118000, imageUrl: '/assets/kin-sell/influencer-doing-shopping-haul.jpg', promoLabel: 'Promo' },
      { id: 'kendal-prod-4', title: 'Pack bureau executif smart', priceLabel: '760 $', priceUsdCents: 76000, imageUrl: '/assets/kin-sell/stockroom-supervisor-discussing-order-delivery-details-with-remote-customer-using-landline-phone-warehouse-storage-room-employee-analyzing-merchandise-checklist-computer-storehouse.jpg' },
      { id: 'kendal-prod-5', title: 'Camera securite 4K', priceLabel: '290 $', priceUsdCents: 29000, imageUrl: '/assets/kin-sell/blackfriday-celebration-marketing.jpg' },
      { id: 'kendal-prod-6', title: 'AirPods Pro 2', priceLabel: '220 $', priceUsdCents: 22000, imageUrl: '/assets/kin-sell/black-man-standing-cafe-with-shopping-bags.jpg' },
      { id: 'kendal-prod-7', title: 'Smart TV OLED 55 pouces', priceLabel: '980 $', priceUsdCents: 98000, imageUrl: '/assets/kin-sell/woman-using-computer-credit-card.jpg' },
    ],
    services: [
      { id: 'kendal-svc-1', title: 'Negociation IA assistee', priceLabel: 'A partir de 15 $', priceUsdCents: 1500, imageUrl: '/assets/kin-sell/stockroom-supervisor-discussing-order-delivery-details-with-remote-customer-using-landline-phone-warehouse-storage-room-employee-analyzing-merchandise-checklist-computer-storehouse.jpg' },
      { id: 'kendal-svc-2', title: 'Recherche produit sur mesure', priceLabel: 'A partir de 20 $', priceUsdCents: 2000, imageUrl: '/assets/kin-sell/influencer-doing-shopping-haul.jpg' },
      { id: 'kendal-svc-3', title: 'Verification vendeur', priceLabel: 'A partir de 12 $', priceUsdCents: 1200, imageUrl: '/assets/kin-sell/blackfriday-celebration-marketing.jpg' },
      { id: 'kendal-svc-4', title: 'Suivi livraison prioritaire', priceLabel: 'Sur devis', priceUsdCents: 0, imageUrl: '/assets/kin-sell/black-man-standing-cafe-with-shopping-bags.jpg' },
      { id: 'kendal-svc-5', title: 'Accompagnement visite bien', priceLabel: 'A partir de 45 $', priceUsdCents: 4500, imageUrl: '/assets/kin-sell/woman-using-computer-credit-card.jpg' },
      { id: 'kendal-svc-6', title: 'Pack achat entreprise', priceLabel: 'Sur devis', priceUsdCents: 0, imageUrl: '/assets/kin-sell/stockroom-supervisor-discussing-order-delivery-details-with-remote-customer-using-landline-phone-warehouse-storage-room-employee-analyzing-merchandise-checklist-computer-storehouse.jpg' },
    ],
    adSlots: [
      { id: 'pub-1', title: 'Espace pub premium', description: 'Mets ta marque devant les acheteurs actifs de Kin-Sell.' },
      { id: 'pub-2', title: 'Boost ton reach', description: 'Campagne sponsorisee visible sur Explorer et profils publics.' },
    ],
  },
  mado: {
    username: 'mado',
    displayName: 'Mado',
    kinId: '#KS-A39027',
    city: 'Kinshasa, Limete',
    rating: '4.7',
    isVerified: false,
    domain: 'Mode et personal shopping',
    responseTime: '~ 20 min',
    salesCount: 73,
    servicesDone: 41,
    bio: 'Je t aide a trouver les bonnes pieces, les bons prix et les bons vendeurs.',
    status: 'Hors ligne',
    products: [],
    services: [
      { id: 'mado-svc-1', title: 'Conseil style', priceLabel: 'A partir de 18 $', priceUsdCents: 1800, imageUrl: '/assets/kin-sell/influencer-doing-shopping-haul.jpg' },
    ],
    adSlots: [
      { id: 'pub-3', title: 'Annonce ciblee', description: 'Positionne ton service devant les bons clients.' },
    ],
  },
  aline: {
    username: 'aline',
    displayName: 'Aline',
    kinId: '#KS-A66390',
    city: 'Kinshasa, Ngaliema',
    rating: '4.8',
    isVerified: true,
    domain: 'Services business et execution',
    responseTime: '~ 8 min',
    salesCount: 136,
    servicesDone: 54,
    bio: 'Accompagnement professionnel pour achat, vente et execution de services en ligne.',
    status: 'En ligne',
    products: [],
    services: [
      { id: 'aline-svc-1', title: 'Execution rapide', priceLabel: 'Sur devis', priceUsdCents: 0, imageUrl: '/assets/kin-sell/woman-using-computer-credit-card.jpg' },
    ],
    adSlots: [
      { id: 'pub-4', title: 'Pack visibilite', description: 'Pubie ton offre dans les espaces premium Kin-Sell.' },
    ],
  },
};

const DEFAULT_META: PublicProfileMeta = {
  username: 'unknown',
  displayName: 'Utilisateur Kin-Sell',
  kinId: '#KS-A00000',
  city: 'Kinshasa',
  rating: '4.8',
  isVerified: false,
  domain: 'Commerce',
  responseTime: '~ 15 min',
  salesCount: 0,
  servicesDone: 0,
  bio: 'Profil public Kin-Sell en cours de personnalisation.',
  status: 'Hors ligne',
  products: [],
  services: [],
  adSlots: [],
};

const REVIEWS = [
  { id: 'rev-1', author: 'Nina K.', note: '5.0', text: 'Rapide, clair, super pro. Transaction clean.' },
  { id: 'rev-2', author: 'Patrick M.', note: '4.8', text: 'Excellent suivi. J ai commande en confiance.' },
  { id: 'rev-3', author: 'Ruth B.', note: '4.9', text: 'Bonne communication et tres bon resultat.' },
];

export function PublicProfilePage({ username }: PublicProfilePageProps) {
  const { t, formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const lockedCats = useLockedCategories();
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();
  useScrollRestore();
  const [profileMeta, setProfileMeta] = useState<PublicProfileMeta>(
    PROFILE_META_BY_USERNAME[username.toLowerCase()] ?? DEFAULT_META
  );
  const [profileOwnerId, setProfileOwnerId] = useState<string | null>(null);
  const [productsPage, setProductsPage] = useState(0);
  const [servicesPage, setServicesPage] = useState(0);
  const [cartBusy, setCartBusy] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<{ id: string; message: string } | null>(null);
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const getPubQty = (id: string) => cartQty[id] ?? 1;
  const changePubQty = (id: string, delta: number) => { setCartQty((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) })); };
  const articleHover = useHoverPopup<ArticleHoverData>();
  const [negotiateListing, setNegotiateListing] = useState<PublicCatalogItem | null>(null);

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
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
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
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    if (isAdmin) {
      setCartFeedback({ id: item.id, message: '🔒 Les administrateurs ne peuvent pas négocier.' });
      setTimeout(() => setCartFeedback((prev) => (prev?.id === item.id ? null : prev)), 3000);
      return;
    }
    setNegotiateListing(item);
  };

  useEffect(() => {
    const controller = new AbortController();

    const loadProfile = async () => {
      try {
        const apiBaseUrl = import.meta.env.VITE_API_URL ?? '/api';
        const response = await fetch(`${apiBaseUrl}/users/public/${encodeURIComponent(username)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as ApiPublicProfile;
        setProfileOwnerId(payload.id);

        const mapListing = (l: ApiListing): PublicCatalogItem => ({
          id: l.id,
          title: l.title,
          priceLabel: formatPriceLabelFromUsdCents(l.priceUsdCents),
          priceUsdCents: l.priceUsdCents,
          imageUrl: l.imageUrl ?? '/assets/kin-sell/black-man-standing-cafe-with-shopping-bags.jpg',
          category: l.category,
        });

        const products = payload.listings.filter(l => l.type === 'PRODUIT').map(mapListing);
        const services = payload.listings.filter(l => l.type === 'SERVICE').map(mapListing);

        setProfileMeta((prev) => ({
          ...prev,
          username: payload.username ?? username,
          displayName: payload.displayName,
          city: payload.city ?? prev.city,
          isVerified: payload.verificationStatus === 'VERIFIED',
          bio: payload.bio ?? prev.bio,
          domain: payload.domain ?? prev.domain,
          qualification: payload.qualification ?? prev.qualification,
          experience: payload.experience ?? prev.experience,
          workHours: payload.workHours ?? prev.workHours,
          products,
          services,
        }));
        setProductsPage(0);
        setServicesPage(0);
      } catch {
        // Fallback silencieux - les données statiques restent affichées
      }
    };

    loadProfile();

    return () => controller.abort();
  }, [username]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) {
      return;
    }

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
    if (pageCount <= 1) {
      return null;
    }

    return (
      <div className="public-catalog-pager" aria-label="Pagination articles">
        <button
          type="button"
          className="public-pager-arrow"
          onClick={() => onChange(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
        >
          ←
        </button>

        <div className="public-pager-indexes">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={`pager-${index}`}
              type="button"
              className={`public-pager-index${index === currentPage ? ' active' : ''}`}
              onClick={() => onChange(index)}
            >
              [{index + 1}]
            </button>
          ))}
        </div>

        <button
          type="button"
          className="public-pager-arrow"
          onClick={() => onChange(Math.min(pageCount - 1, currentPage + 1))}
          disabled={currentPage === pageCount - 1}
        >
          →
        </button>
      </div>
    );
  };

  return (
    <section className="public-page-shell animate-fade-in">
      {/* ── Banner + Avatar Hero ── */}
      <div className="public-hero-banner">
        <div className="public-hero-backdrop" />
        <div className="public-hero-inner">
          <div className="public-avatar-frame">
            <img
              src="/assets/kin-sell/black-man-standing-cafe-with-shopping-bags.jpg"
              alt="Profil public Kin-Sell"
            />
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
              <span className="public-pill">⭐ {profileMeta.rating}</span>
              <span className="public-pill">{profileMeta.status === 'En ligne' ? '🟢' : '⚪'} {profileMeta.status}</span>
            </div>
          </div>

          <div className="public-hero-actions">
            <button type="button" className="public-contact-btn" onClick={() => navigate(`/messages?contact=${encodeURIComponent(`@${username}`)}`)}>
              💬 Écrire
            </button>
            <button type="button" className="public-connect-btn" onClick={() => navigate(`/messages?contact=${encodeURIComponent(`@${username}`)}&requestContact=1`)}>
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
                    <img className="public-card-image" src={article.imageUrl} alt={article.title} />
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
                    <img className="public-card-image" src={service.imageUrl} alt={service.title} />
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

      <section className="public-section" aria-label="Avis clients">
        <div className="public-section-head">
          <h2>⭐ Avis</h2>
        </div>

        <div className="public-reviews-grid">
          {REVIEWS.map((review) => (
            <article key={review.id} className="public-review-card">
              <div className="public-review-top">
                <strong>{review.author}</strong>
                <span>⭐ {review.note}</span>
              </div>
              <p>{review.text}</p>
            </article>
          ))}
        </div>
      </section>

      <ArticleHoverPopup popup={articleHover.popup} />

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
