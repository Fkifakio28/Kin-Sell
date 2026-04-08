import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import {
  users as usersApi,
  orders,
  listings as listingsApi,
  reviews as reviewsApi,
  resolveMediaUrl,
  type ReviewItem,
} from '../../lib/api-client';
import { useHoverPopup, ArticleHoverPopup, type ArticleHoverData } from '../../components/HoverPopup';
import { useScrollRestore } from '../../utils/useScrollRestore';
import { NegotiatePopup } from '../negotiations/NegotiatePopup';
import { useLockedCategories, isCategoryLocked } from '../../hooks/useLockedCategories';
import { useSocket } from '../../hooks/useSocket';
import { SeoMeta } from '../../components/SeoMeta';
import './public-profile.css';

/* ═══════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════ */

type ApiListing = {
  id: string;
  type: 'PRODUIT' | 'SERVICE';
  title: string;
  category: string;
  city: string | null;
  imageUrl: string | null;
  priceUsdCents: number;
  isNegotiable?: boolean;
  promoActive?: boolean;
  promoPriceUsdCents?: number | null;
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

type CatalogItem = {
  id: string;
  type: 'PRODUIT' | 'SERVICE';
  title: string;
  priceLabel: string;
  priceUsdCents: number;
  imageUrl: string;
  isNegotiable?: boolean;
  category?: string;
  promoActive?: boolean;
  promoPriceUsdCents?: number | null;
  originalPriceLabel?: string;
};

type ProfileData = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  kinId: string;
  city: string;
  country: string;
  bio: string;
  domain: string;
  qualification: string;
  experience: string;
  workHours: string;
  isVerified: boolean;
  verificationStatus: string;
  rating: number;
  reviewCount: number;
  listings: CatalogItem[];
};

const PAGE_SIZE = 8;
const REPORT_REASONS = ['Contenu inapproprié', 'Arnaque / fraude suspectée', 'Faux profil', 'Harcèlement', 'Autre'];

/* ═══════════════════════════════════════════════════
   STAR RATING
   ═══════════════════════════════════════════════════ */

function StarRating({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="up-stars" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          role={onChange ? 'button' : undefined}
          tabIndex={onChange ? 0 : undefined}
          className={`up-star${(hover || value) >= s ? ' up-star--filled' : ''}${onChange ? ' up-star--clickable' : ''}`}
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

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export function PublicProfilePage({ username }: { username: string }) {
  const { t, formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const lockedCats = useLockedCategories();
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();
  const { on, off } = useSocket();
  useScrollRestore();

  /* ── Profile state ── */
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  /* ── Articles filter ── */
  type FilterType = 'all' | 'PRODUIT' | 'SERVICE';
  const [filter, setFilter] = useState<FilterType>('all');
  const [page, setPage] = useState(0);

  /* ── Cart ── */
  const [cartBusy, setCartBusy] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<{ id: string; msg: string } | null>(null);
  const [cartQty, setCartQty] = useState<Record<string, number>>({});
  const articleHover = useHoverPopup<ArticleHoverData>();
  const [negotiateItem, setNegotiateItem] = useState<CatalogItem | null>(null);

  /* ── Reviews ── */
  const [allReviews, setAllReviews] = useState<ReviewItem[]>([]);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMsg, setReviewMsg] = useState('');

  /* ── Report ── */
  const [showReport, setShowReport] = useState(false);
  const [reportDraft, setReportDraft] = useState({ reason: REPORT_REASONS[0], detail: '' });
  const [reportMsg, setReportMsg] = useState('');

  const isOwnProfile = Boolean(user && profile && user.id === profile.id);
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  /* ── Load profile ── */
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const payload = (await usersApi.publicProfile(username)) as ApiPublicProfile;

        const mapItem = (l: ApiListing): CatalogItem => ({
          id: l.id,
          type: l.type,
          title: l.title,
          priceLabel: formatPriceLabelFromUsdCents(l.promoActive && l.promoPriceUsdCents != null ? l.promoPriceUsdCents : l.priceUsdCents),
          priceUsdCents: l.priceUsdCents,
          imageUrl: l.imageUrl ?? '',
          isNegotiable: l.isNegotiable,
          category: l.category,
          promoActive: l.promoActive,
          promoPriceUsdCents: l.promoPriceUsdCents,
          originalPriceLabel: l.promoActive && l.promoPriceUsdCents != null ? formatPriceLabelFromUsdCents(l.priceUsdCents) : undefined,
        });

        setProfile({
          id: payload.id,
          username: payload.username ?? username,
          displayName: payload.displayName,
          avatarUrl: payload.avatarUrl,
          kinId: `#KS-${payload.id.slice(-6).toUpperCase()}`,
          city: payload.city ?? '',
          country: payload.country ?? '',
          bio: payload.bio ?? '',
          domain: payload.domain ?? '',
          qualification: payload.qualification ?? '',
          experience: payload.experience ?? '',
          workHours: payload.workHours ?? '',
          isVerified: payload.verificationStatus === 'VERIFIED' || payload.verificationStatus === 'ADMIN_LOCKED_VERIFIED',
          verificationStatus: payload.verificationStatus ?? 'UNVERIFIED',
          rating: payload.averageRating ?? 0,
          reviewCount: payload.reviewCount ?? 0,
          listings: payload.listings.map(mapItem),
        });

        if (payload.reviews) {
          setAllReviews(payload.reviews.map((r: any) => ({
            id: r.id,
            authorId: r.authorId ?? '',
            authorName: r.authorName ?? 'Anonyme',
            authorAvatar: r.authorAvatar ?? null,
            rating: r.rating,
            text: r.text ?? null,
            verified: r.verified ?? false,
            orderId: r.orderId ?? null,
            createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(r.createdAt).toISOString(),
          })));
        }
      } catch {
        setNotFound(true);
      }
    })();
    return () => controller.abort();
  }, [username, formatPriceLabelFromUsdCents]);

  /* ── Presence via WebSocket ── */
  useEffect(() => {
    if (!profile?.id) return;
    const targetId = profile.id;

    const handleSnapshot = (data: { userIds: string[] }) => {
      setIsOnline(data.userIds.includes(targetId));
    };
    const handleOnline = (data: { userId: string }) => {
      if (data.userId === targetId) setIsOnline(true);
    };
    const handleOffline = (data: { userId: string }) => {
      if (data.userId === targetId) setIsOnline(false);
    };

    on('presence:snapshot', handleSnapshot);
    on('user:online', handleOnline);
    on('user:offline', handleOffline);

    return () => {
      off('presence:snapshot', handleSnapshot);
      off('user:online', handleOnline);
      off('user:offline', handleOffline);
    };
  }, [profile?.id, on, off]);

  /* ── Scroll-to-listing ── */
  useEffect(() => {
    const hash = window.location.hash?.replace('#', '');
    if (!hash || !profile) return;
    const el = document.getElementById(hash);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('up-card--highlight');
        setTimeout(() => el.classList.remove('up-card--highlight'), 2500);
      });
    }
  }, [profile]);

  /* ── Filtered + paginated articles ── */
  const filtered = useMemo(() => {
    if (!profile) return [];
    if (filter === 'all') return profile.listings;
    return profile.listings.filter((l) => l.type === filter);
  }, [profile, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleItems = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page],
  );

  /* ── Handlers ── */
  const getQty = (id: string) => cartQty[id] ?? 1;
  const changeQty = (id: string, d: number) =>
    setCartQty((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + d) }));

  const feedbackTimeout = useCallback((id: string, msg: string, ms = 2500) => {
    setCartFeedback({ id, msg });
    setTimeout(() => setCartFeedback((p) => (p?.id === id ? null : p)), ms);
  }, []);

  const handleAddToCart = async (id: string) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (isAdmin) { feedbackTimeout(id, '🔒 Admin — transactions non autorisées.'); return; }
    if (isOwnProfile) { feedbackTimeout(id, '⚠️ Vous ne pouvez pas acheter vos propres articles.'); return; }
    if (cartBusy) return;
    setCartBusy(id);
    setCartFeedback(null);
    try {
      const qty = getQty(id);
      await orders.addCartItem({ listingId: id, quantity: qty });
      feedbackTimeout(id, `✅ ${qty > 1 ? qty + '× ' : ''}Ajouté au panier !`);
      setCartQty((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } catch {
      feedbackTimeout(id, '❌ Erreur, réessayez.', 3000);
    } finally {
      setCartBusy(null);
    }
  };

  const handleContact = async (listingId?: string) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (!profile) return;
    try {
      if (listingId) {
        const res = await listingsApi.contactSeller(listingId);
        navigate(`/messaging/${res.conversationId}`);
      } else {
        navigate(`/messaging?newDm=${profile.id}`);
      }
    } catch {
      navigate('/messaging');
    }
  };

  const handleNegotiate = (item: CatalogItem) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (isAdmin) { feedbackTimeout(item.id, '🔒 Admin — négociations non autorisées.'); return; }
    setNegotiateItem(item);
  };

  const handleSubmitReview = async () => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (!profile || reviewRating < 1) return;
    setReviewBusy(true);
    setReviewMsg('');
    try {
      await reviewsApi.create({ targetId: profile.id, rating: reviewRating, text: reviewText || undefined });
      setReviewMsg('✅ Avis envoyé !');
      setReviewRating(0);
      setReviewText('');
      const fresh = await reviewsApi.forUser(profile.id);
      setAllReviews(fresh.reviews);
      setProfile((p) => p ? { ...p, rating: fresh.averageRating, reviewCount: fresh.totalCount } : p);
      setTimeout(() => { setReviewMsg(''); setShowReviewForm(false); }, 1500);
    } catch {
      setReviewMsg('❌ Erreur, réessayez.');
      setTimeout(() => setReviewMsg(''), 3000);
    } finally {
      setReviewBusy(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!profile || !reportDraft.detail.trim()) return;
    try {
      await usersApi.report({ reportedUserId: profile.id, reason: reportDraft.reason, message: reportDraft.detail });
    } catch { /* ignore */ }
    setReportDraft({ reason: REPORT_REASONS[0], detail: '' });
    setReportMsg('✓ Signalement envoyé, merci.');
    setTimeout(() => { setShowReport(false); setReportMsg(''); }, 1500);
  };

  /* ── 404 ── */
  if (notFound) {
    return (
      <div className="up-page">
        <div className="up-empty" style={{ paddingTop: 60 }}>
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>😕</p>
          <p>Ce profil n'existe pas ou a été supprimé.</p>
          <button type="button" className="up-action-btn up-action-btn--primary" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  /* ── Loading ── */
  if (!profile) {
    return (
      <div className="up-page">
        <div className="up-empty" style={{ paddingTop: 60 }}>Chargement du profil…</div>
      </div>
    );
  }

  const initial = profile.displayName.charAt(0).toUpperCase();
  const ratingStr = profile.rating > 0 ? profile.rating.toFixed(1) : '—';
  const locationParts = [profile.city, profile.country].filter(Boolean).join(', ');
  const visibleReviews = allReviews.slice(0, 3);
  const prodCount = profile.listings.filter((l) => l.type === 'PRODUIT').length;
  const servCount = profile.listings.filter((l) => l.type === 'SERVICE').length;

  return (
    <div className="up-page">
      <SeoMeta
        title={`${profile.displayName} — Vendeur sur Kin-Sell`}
        description={`Découvrez le profil de ${profile.displayName} sur Kin-Sell. Parcourez ses produits et services à Kinshasa.`}
        canonical={`https://kin-sell.com/user/${username}`}
        ogImage={profile.avatarUrl ?? undefined}
      />

      {/* ══════ BLOC 1 — HERO ══════ */}
      <header className="up-hero">
        <div className="up-hero-inner">
          {/* Avatar */}
          <div className="up-avatar">
            {profile.avatarUrl
              ? <img src={resolveMediaUrl(profile.avatarUrl)} alt={profile.displayName} className="up-avatar-img" />
              : <div className="up-avatar-ph">{initial}</div>}
            <span className={`up-status-dot${isOnline ? ' up-status-dot--online' : ''}`} title={isOnline ? 'En ligne' : 'Hors ligne'} />
          </div>

          {/* Identity */}
          <div className="up-identity">
            <div className="up-name-row">
              <h1 className="up-name">{profile.displayName}</h1>
              {profile.isVerified && <span className="up-verified" title="Compte vérifié par Kin-Sell" style={{ color: '#5cb85c' }}>✅</span>}
              {profile.verificationStatus === 'AI_ELIGIBLE' && <span className="up-verified" title="Ce compte présente une activité fiable selon notre analyse automatique" style={{ color: '#6f58ff' }}>🤖</span>}
              {profile.verificationStatus === 'PARTIALLY_VERIFIED' && <span className="up-verified" title="Profil actif sur la plateforme" style={{ color: '#5bc0de' }}>◐</span>}
              <span className="up-kinid">{profile.kinId}</span>
            </div>
            {profile.domain && <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>{profile.domain}</p>}
            <div className="up-meta">
              {locationParts && <span className="up-pill">📍 {locationParts}</span>}
              <button
                type="button"
                className="up-pill up-pill--rating"
                onClick={() => { if (!isLoggedIn) { navigate('/login'); return; } if (!isOwnProfile) setShowReviewForm(true); }}
                title={isOwnProfile ? 'Votre profil' : 'Laisser un avis'}
              >
                ⭐ {ratingStr} ({allReviews.length})
              </button>
              <span className="up-pill">{isOnline ? '🟢 En ligne' : '⚪ Hors ligne'}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="up-actions">
            <button type="button" className="up-action-btn up-action-btn--primary" onClick={() => handleContact()} disabled={isOwnProfile}>
              💬 Écrire
            </button>
            <button type="button" className="up-action-btn up-action-btn--secondary" onClick={() => {
              if (!isLoggedIn) { navigate('/login'); return; }
              navigate(`/messaging?newDm=${profile.id}&requestContact=1`);
            }} disabled={isOwnProfile}>
              🤝 Ajouter
            </button>
          </div>
        </div>
      </header>

      {/* ══════ BLOC 2 — STATS ══════ */}
      <section className="up-stats" aria-label="Statistiques">
        <article className="up-stat">
          <strong>—</strong>
          <span>Ventes</span>
        </article>
        <article className="up-stat">
          <strong>—</strong>
          <span>Services réalisés</span>
        </article>
        <article className="up-stat">
          <strong>—</strong>
          <span>Temps de réponse</span>
        </article>
        <article className="up-stat">
          <strong>⭐ {ratingStr}</strong>
          <span>Note globale</span>
        </article>
      </section>

      {/* ══════ BLOC 3 — BIO ══════ */}
      {(profile.bio || profile.domain || profile.qualification || profile.experience || profile.workHours) && (
        <section className="up-bio-section">
          <div className="up-bio-card">
            <h2 className="up-bio-title">À propos</h2>
            {profile.bio && <p className="up-bio-text">{profile.bio}</p>}
            <div className="up-bio-facts">
              {profile.domain && <span className="up-fact">🏷️ {profile.domain}</span>}
              {profile.qualification && <span className="up-fact">🎓 {profile.qualification}</span>}
              {profile.experience && <span className="up-fact">💼 {profile.experience}</span>}
              {profile.workHours && <span className="up-fact">🕐 {profile.workHours}</span>}
            </div>
          </div>
        </section>
      )}

      {/* ══════ BLOC 4 — ARTICLES ══════ */}
      <section className="up-section" aria-label="Articles publiés">
        <div className="up-section-head">
          <h2>📦 Articles</h2>
          <span className="up-section-count">{profile.listings.length} article{profile.listings.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Filter tabs */}
        <div className="up-filter-tabs">
          <button type="button" className={`up-filter-tab${filter === 'all' ? ' up-filter-tab--active' : ''}`} onClick={() => { setFilter('all'); setPage(0); }}>
            Tous ({profile.listings.length})
          </button>
          <button type="button" className={`up-filter-tab${filter === 'PRODUIT' ? ' up-filter-tab--active' : ''}`} onClick={() => { setFilter('PRODUIT'); setPage(0); }}>
            Produits ({prodCount})
          </button>
          <button type="button" className={`up-filter-tab${filter === 'SERVICE' ? ' up-filter-tab--active' : ''}`} onClick={() => { setFilter('SERVICE'); setPage(0); }}>
            Services ({servCount})
          </button>
        </div>

        {visibleItems.length > 0 ? (
          <>
            <div className="up-grid">
              {visibleItems.map((item) => (
                <article
                  key={item.id}
                  id={`listing-${item.id}`}
                  className="up-card"
                  onMouseEnter={(e) => articleHover.handleMouseEnter({ title: item.title, description: null, price: item.priceLabel, sellerName: profile.displayName }, e)}
                  onMouseLeave={articleHover.handleMouseLeave}
                >
                  <div className="up-card-img-wrap">
                    {item.imageUrl
                      ? <img className="up-card-img" src={resolveMediaUrl(item.imageUrl)} alt={item.title} />
                      : <div className="up-card-noimg">{item.type === 'PRODUIT' ? '📦' : '🛠️'}</div>}
                    <span className="up-card-type-badge">{item.type === 'PRODUIT' ? 'Produit' : 'Service'}</span>
                  </div>
                  <div className="up-card-body">
                    <h3 className="up-card-title">{item.title}</h3>
                    {item.originalPriceLabel ? (
                      <p className="up-card-price"><s style={{opacity:0.5,fontSize:'0.85em',marginRight:4}}>{item.originalPriceLabel}</s> {item.priceLabel}</p>
                    ) : (
                      <p className="up-card-price">{item.priceLabel}</p>
                    )}
                    <div className="up-card-actions">
                      <span className="up-card-qty">
                        <button type="button" onClick={() => changeQty(item.id, -1)} disabled={getQty(item.id) <= 1}>−</button>
                        <span>{getQty(item.id)}</span>
                        <button type="button" onClick={() => changeQty(item.id, 1)}>+</button>
                      </span>
                      <button type="button" className="up-card-btn up-card-btn--cart" title={t('common.addToCart')} disabled={cartBusy === item.id} onClick={() => void handleAddToCart(item.id)}>🛒</button>
                      {item.isNegotiable !== false && !isCategoryLocked(lockedCats, item.category) && (
                        <button type="button" className="up-card-btn up-card-btn--negotiate" title={t('common.negotiate')} onClick={() => handleNegotiate(item)}>🤝</button>
                      )}
                      <button type="button" className="up-card-btn up-card-btn--contact" title="Contacter" onClick={() => void handleContact(item.id)}>💬</button>
                    </div>
                    {cartFeedback?.id === item.id && <div className="up-card-feedback">{cartFeedback.msg}</div>}
                  </div>
                </article>
              ))}
            </div>
            {/* Pager */}
            {pageCount > 1 && (
              <div className="up-pager">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>←</button>
                {Array.from({ length: pageCount }, (_, i) => (
                  <button key={i} type="button" className={i === page ? 'active' : ''} onClick={() => setPage(i)}>{i + 1}</button>
                ))}
                <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page === pageCount - 1}>→</button>
              </div>
            )}
          </>
        ) : (
          <div className="up-empty">
            {profile.listings.length === 0 ? 'Aucun article publié pour le moment.' : 'Aucun résultat pour ce filtre.'}
          </div>
        )}
      </section>

      {/* ══════ BLOC 5 — AVIS ══════ */}
      <section className="up-section" aria-label="Avis clients">
        <div className="up-section-head">
          <h2>⭐ Avis ({allReviews.length})</h2>
          {!isOwnProfile && (
            <button type="button" className="up-show-more-btn" onClick={() => { if (!isLoggedIn) { navigate('/login'); return; } setShowReviewForm(true); }}>
              ✏️ Laisser un avis
            </button>
          )}
        </div>

        {visibleReviews.length > 0 ? (
          <div className="up-reviews-grid">
            {visibleReviews.map((r) => (
              <article key={r.id} className="up-review">
                <div className="up-review-top">
                  <span className="up-review-author">{r.authorName}</span>
                  {r.verified && <span style={{ fontSize: '.75rem', color: 'var(--color-primary)', fontWeight: 600, marginLeft: 6 }}>✓ Vérifié</span>}
                  <StarRating value={r.rating} size={14} />
                </div>
                {r.text && <p>{r.text}</p>}
              </article>
            ))}
          </div>
        ) : (
          <div className="up-empty">Aucun avis pour le moment. Soyez le premier !</div>
        )}

        {allReviews.length > 3 && (
          <button type="button" className="up-show-more-btn" onClick={() => setShowAllReviews(true)}>
            Voir tous les avis ({allReviews.length})
          </button>
        )}
      </section>

      {/* ══════ DRAWER — Tous les avis ══════ */}
      {showAllReviews && (
        <div className="up-overlay" onClick={() => setShowAllReviews(false)}>
          <div className="up-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="up-drawer-head">
              <h2>⭐ Tous les avis ({allReviews.length})</h2>
              <button type="button" className="up-drawer-close" onClick={() => setShowAllReviews(false)}>✕</button>
            </div>
            <div className="up-drawer-body">
              {allReviews.map((r) => (
                <article key={r.id} className="up-review" style={{ marginBottom: 10 }}>
                  <div className="up-review-top">
                    <span className="up-review-author">{r.authorName}</span>
                    {r.verified && <span style={{ fontSize: '.75rem', color: 'var(--color-primary)', fontWeight: 600, marginLeft: 6 }}>✓ Vérifié</span>}
                    <StarRating value={r.rating} size={14} />
                  </div>
                  {r.text && <p>{r.text}</p>}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════ DRAWER — Laisser un avis ══════ */}
      {showReviewForm && (
        <div className="up-overlay" onClick={() => setShowReviewForm(false)}>
          <div className="up-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="up-drawer-head">
              <h2>✏️ Laisser un avis</h2>
              <button type="button" className="up-drawer-close" onClick={() => setShowReviewForm(false)}>✕</button>
            </div>
            <div className="up-drawer-body">
              <label className="up-form-label">Note</label>
              <StarRating value={reviewRating} onChange={setReviewRating} size={30} />
              <label className="up-form-label" style={{ marginTop: 14 }}>Commentaire (optionnel)</label>
              <textarea
                className="up-form-textarea"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Partagez votre expérience…"
                rows={3}
                maxLength={500}
              />
              <span className="up-form-charcount">{reviewText.length}/500</span>
              {reviewMsg && <span className="up-form-msg">{reviewMsg}</span>}
              <button type="button" className="up-form-submit" disabled={reviewRating < 1 || reviewBusy} onClick={handleSubmitReview}>
                {reviewBusy ? '⏳ Envoi…' : '📤 Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ DRAWER — Signalement ══════ */}
      {showReport && (
        <div className="up-overlay" onClick={() => { setShowReport(false); setReportMsg(''); }}>
          <div className="up-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="up-drawer-head">
              <h2>🚩 Signaler ce profil</h2>
              <button type="button" className="up-drawer-close" onClick={() => { setShowReport(false); setReportMsg(''); }}>✕</button>
            </div>
            <div className="up-drawer-body">
              {reportMsg ? (
                <p className="up-form-msg">{reportMsg}</p>
              ) : (
                <>
                  <label className="up-form-label">Raison</label>
                  <select className="up-report-select" value={reportDraft.reason} onChange={(e) => setReportDraft((d) => ({ ...d, reason: e.target.value }))}>
                    {REPORT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <label className="up-form-label">Détails</label>
                  <textarea
                    className="up-form-textarea"
                    rows={3}
                    maxLength={500}
                    placeholder="Décrivez le problème…"
                    value={reportDraft.detail}
                    onChange={(e) => setReportDraft((d) => ({ ...d, detail: e.target.value }))}
                  />
                  <button type="button" className="up-form-submit" disabled={!reportDraft.detail.trim()} onClick={() => void handleSubmitReport()}>
                    Envoyer le signalement
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════ Hover Popup ══════ */}
      <ArticleHoverPopup popup={articleHover.popup} />

      {/* ══════ Report Float ══════ */}
      {!isOwnProfile && (
        <div className="up-report-float">
          <button type="button" className="up-report-btn" onClick={() => { if (!isLoggedIn) { navigate('/login'); return; } setShowReport(true); }} title="Signaler ce profil">
            🚩
          </button>
        </div>
      )}

      {/* ══════ Negotiate ══════ */}
      {negotiateItem && (
        <NegotiatePopup
          listing={{
            id: negotiateItem.id,
            title: negotiateItem.title,
            imageUrl: negotiateItem.imageUrl,
            type: negotiateItem.type,
            priceUsdCents: negotiateItem.priceUsdCents,
            ownerDisplayName: profile.displayName,
          }}
          onClose={() => setNegotiateItem(null)}
          onSuccess={() => { setNegotiateItem(null); navigate('/cart'); }}
        />
      )}
    </div>
  );
}
