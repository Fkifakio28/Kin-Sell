import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { businesses as businessesApi, reviews as reviewsApi, resolveMediaUrl, type ReviewItem } from '../../lib/api-client';
import './public-pages.css';
import { SeoMeta } from '../../components/SeoMeta';

type BusinessShopPageProps = {
  slug: string;
};

// ─── Types API ────────────────────────────────────────────
type PublicListing = {
  id: string;
  type: 'PRODUIT' | 'SERVICE';
  title: string;
  description?: string | null;
  category: string;
  city: string;
  priceUsdCents: number;
  imageUrl?: string | null;
  mediaUrls: string[];
};

type PublicBusiness = {
  id: string;
  ownerUserId: string;
  publicName: string;
  slug: string;
  verificationStatus: string;
  subscriptionStatus: string;
  shop: {
    logo?: string | null;
    coverImage?: string | null;
    publicDescription?: string | null;
    city?: string | null;
    active: boolean;
  } | null;
  listings: PublicListing[];
  _count: { sellerOrders: number };
};

type Quality = { id: string; icon: string; name: string; description: string };
type Review  = { id: string; author: string; score: number; text: string; date: string; verified: boolean };
type Report  = { id: string; author: string; reason: string; detail: string; date: string };

// ─── Helpers ──────────────────────────────────────────────
const fmtUsd = (cents: number): string => {
  if (cents === 0) return 'Prix sur demande';
  const val = cents / 100;
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const FALLBACK_HERO = '';

const REPORT_REASONS = [
  'Contenu inapproprié',
  'Arnaque / fraude suspectée',
  'Produits contrefaits',
  'Faux avis',
  'Harcèlement',
  'Autre',
];

export function BusinessShopPage({ slug }: BusinessShopPageProps) {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [shopPhotoIdx, setShopPhotoIdx] = useState(0);
  // ─── Follow
  const [isFollowingState, setIsFollowingState] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  // ─── Popup avis
  const [showReviewPopup, setShowReviewPopup] = useState(false);
  const [reviewDraft, setReviewDraft] = useState({ score: 5, text: '' });
  const [reviewMsg, setReviewMsg] = useState('');
  // ─── Popup signalement
  const [showReportPopup, setShowReportPopup] = useState(false);
  const [reportDraft, setReportDraft] = useState({ author: '', reason: REPORT_REASONS[0], detail: '' });
  const [reportMsg, setReportMsg] = useState('');

  // ─── Fetch vraies données ────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);
    setBusiness(null);
    setHeroIndex(0);
    businessesApi.getBySlug(slug)
      .then(data => { setBusiness(data as unknown as PublicBusiness); setLoading(false); })
      .catch(() => { setError('Boutique introuvable ou non disponible.'); setLoading(false); });
  }, [slug]);

  // ─── Follow state ────────────────────────────────────────
  useEffect(() => {
    if (!business) return;
    businessesApi.followersCount(business.id)
      .then(r => setFollowersCount(r.followersCount))
      .catch(() => {});
    if (isLoggedIn) {
      businessesApi.isFollowing(business.id)
        .then(r => setIsFollowingState(r.following))
        .catch(() => {});
    }
  }, [business, isLoggedIn]);

  const handleFollow = useCallback(async () => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (!business || followBusy) return;
    setFollowBusy(true);
    try {
      const res = isFollowingState
        ? await businessesApi.unfollow(business.id)
        : await businessesApi.follow(business.id);
      setIsFollowingState(res.following);
      setFollowersCount(res.followersCount);
    } catch { /* ignore */ }
    setFollowBusy(false);
  }, [isLoggedIn, business, followBusy, isFollowingState, navigate]);

  const handleShare = useCallback(async () => {
    if (!business) return;
    const shareData = {
      title: `${business.publicName} — Kin-Sell`,
      text: `Découvrez la boutique ${business.publicName} sur Kin-Sell`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Lien copié dans le presse-papier !');
      }
    } catch { /* user cancelled */ }
  }, [business]);

  // ─── Scroll to hash ───────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.getElementById(hash.replace('#', ''));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [slug]);

  // ─── Images pour le carousel ─────────────────────────────
  const heroImages = useMemo(() => {
    if (!business) return [];
    const imgs: string[] = [];
    if (business.shop?.coverImage) imgs.push(resolveMediaUrl(business.shop.coverImage));
    for (const l of business.listings) {
      if (l.imageUrl && !imgs.includes(resolveMediaUrl(l.imageUrl))) imgs.push(resolveMediaUrl(l.imageUrl));
      for (const u of l.mediaUrls) {
        const resolved = resolveMediaUrl(u);
        if (!imgs.includes(resolved)) imgs.push(resolved);
      }
      if (imgs.length >= 5) break;
    }
    return imgs;
  }, [business]);

  // ─── Auto-avance carousel ─────────────────────────────────
  useEffect(() => {
    if (heroImages.length <= 1) return;
    const timer = setInterval(() => setHeroIndex(i => (i + 1) % heroImages.length), 4500);
    return () => clearInterval(timer);
  }, [heroImages.length]);

  // ─── Charger points forts depuis localStorage (vide si rien mis) ──
  const qualities: Quality[] = useMemo(() => {
    if (!business) return [];
    try {
      const stored = localStorage.getItem(`ks-qualities-${business.id}`);
      if (stored) { const parsed = JSON.parse(stored); if (Array.isArray(parsed) && parsed.length > 0) return parsed; }
    } catch { /* ignore */ }
    return [];
  }, [business]);

  const shopPhotos: string[] = useMemo(() => {
    if (!business) return [];
    try {
      const stored = localStorage.getItem(`ks-shop-photos-${business.id}`);
      if (stored) { const parsed = JSON.parse(stored); if (Array.isArray(parsed)) return parsed; }
    } catch { /* ignore */ }
    return [];
  }, [business]);

  // ─── Avis clients depuis API ───────────────────────────────
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  useEffect(() => {
    if (!business) return;
    reviewsApi.forUser(business.ownerUserId)
      .then(r => {
        setReviews(r.reviews.map(rv => ({
          id: rv.id,
          author: rv.authorName,
          score: rv.rating,
          text: rv.text ?? '',
          date: new Date(rv.createdAt).toLocaleDateString('fr-FR'),
          verified: rv.verified,
        })));
      })
      .catch(() => setReviews([]));
  }, [business]);

  const avgScore = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;
  }, [reviews]);

  const handleSubmitReview = useCallback(async () => {
    if (!isLoggedIn) { navigate('/login'); return; }
    if (!business || reviewDraft.score < 1 || reviewBusy) return;
    setReviewBusy(true);
    try {
      await reviewsApi.create({
        targetId: business.ownerUserId,
        rating: reviewDraft.score,
        text: reviewDraft.text.trim() || undefined,
      });
      // Reload reviews from server
      const fresh = await reviewsApi.forUser(business.ownerUserId);
      setReviews(fresh.reviews.map(rv => ({
        id: rv.id,
        author: rv.authorName,
        score: rv.rating,
        text: rv.text ?? '',
        date: new Date(rv.createdAt).toLocaleDateString('fr-FR'),
        verified: rv.verified,
      })));
      setReviewDraft({ score: 5, text: '' });
      setReviewMsg('✓ Merci pour votre avis !');
      setTimeout(() => { setShowReviewPopup(false); setReviewMsg(''); }, 1500);
    } catch {
      setReviewMsg('❌ Erreur, réessayez.');
      setTimeout(() => setReviewMsg(''), 3000);
    } finally {
      setReviewBusy(false);
    }
  }, [business, reviewDraft, isLoggedIn, navigate, reviewBusy]);

  const handleSubmitReport = useCallback(async () => {
    if (!business || !reportDraft.author.trim() || !reportDraft.detail.trim()) return;
    const newReport: Report = {
      id: `rp-${Date.now()}`,
      author: reportDraft.author.trim(),
      reason: reportDraft.reason,
      detail: reportDraft.detail.trim(),
      date: new Date().toISOString(),
    };
    try {
      const apiBaseUrl = (import.meta.env as Record<string, string | undefined>).VITE_API_URL ?? '/api';
      const token = localStorage.getItem('ks-auth-token');
      await fetch(`${apiBaseUrl}/users/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reportedUserId: business.id, reason: newReport.reason, message: newReport.detail }),
      });
    } catch { /* ignore */ }
    setReportDraft({ author: '', reason: REPORT_REASONS[0], detail: '' });
    setReportMsg('✓ Signalement envoyé, merci.');
    setTimeout(() => { setShowReportPopup(false); setReportMsg(''); }, 1500);
  }, [business, reportDraft]);

  // ─── Auto-avance photos boutique ──────────────────────────
  useEffect(() => {
    if (shopPhotos.length <= 1) return;
    const timer = setInterval(() => setShopPhotoIdx(i => (i + 1) % shopPhotos.length), 3500);
    return () => clearInterval(timer);
  }, [shopPhotos.length]);

  // ─── États de chargement ──────────────────────────────────
  if (loading) return (
    <section className="public-page-shell business-lux-shell animate-fade-in">
      <div className="biz-state-center">
        <div className="biz-spinner" />
        <p>Chargement de la boutique...</p>
      </div>
    </section>
  );

  if (error || !business) return (
    <section className="public-page-shell business-lux-shell animate-fade-in">
      <div className="biz-state-center">
        <h2>Boutique introuvable</h2>
        <p>{error ?? 'Cette boutique n\'existe pas ou n\'est plus disponible.'}</p>
        <a href="/explorer" className="business-lux-cta primary" style={{ marginTop: '1rem', display: 'inline-block' }}>Explorer les boutiques →</a>
      </div>
    </section>
  );

  const shop = business.shop;
  const productListings = business.listings.filter(l => l.type === 'PRODUIT');
  const serviceListings  = business.listings.filter(l => l.type === 'SERVICE');
  const hasProducts      = productListings.length > 0;
  const hasServices      = serviceListings.length > 0;
  const showcaseCount    = business.listings.length;
  const salesCount       = business._count.sellerOrders;
  const city             = shop?.city ?? 'Kinshasa';
  const publicDesc       = shop?.publicDescription ?? '';
  const isVerified       = business.verificationStatus === 'VERIFIED' || business.verificationStatus === 'ADMIN_LOCKED_VERIFIED';
  const isAIEligible     = business.verificationStatus === 'AI_ELIGIBLE';
  const isPartial        = business.verificationStatus === 'PARTIALLY_VERIFIED';
  const isPremium        = business.subscriptionStatus !== 'FREE';
  const tierLabel        = isVerified ? 'Vérifié Kin-Sell ✅' : isAIEligible ? 'Crédibilité IA 🤖' : isPartial ? 'Profil actif ◐' : isPremium ? 'Premium' : 'Standard';
  const tierTitle        = isVerified ? 'Compte vérifié par Kin-Sell' : isAIEligible ? 'Ce compte présente une activité fiable selon notre analyse automatique' : isPartial ? 'Profil actif sur la plateforme' : '';
  const activePromo      = productListings.find(l => l.priceUsdCents > 0);
  const isOnline         = shop?.active !== false;

  return (
    <section className="public-page-shell business-lux-shell animate-fade-in">
      {business && (
        <SeoMeta
          title={`${business.publicName} — Boutique sur Kin-Sell`}
          description={`Visitez la boutique ${business.publicName} sur Kin-Sell. ${business.shop?.publicDescription ?? `Produits et services disponibles à ${business.shop?.city ?? 'Kinshasa'}.`}`}
          canonical={`https://kin-sell.com/business/${slug}`}
          ogImage={business.shop?.logo ?? undefined}
        />
      )}

      {/* ═══ HERO + CAROUSEL ═════════════════════════════════ */}
      <header className="business-lux-hero">
        <div className="business-lux-hero-media">
          {heroImages.length > 0 ? heroImages.map((src, i) => (
            <img
              key={src + i}
              src={src}
              alt={business.publicName}
              className={`biz-hero-slide${i === heroIndex ? ' biz-hero-slide--active' : ''}`}
            />
          )) : (
            <div className="biz-hero-slide biz-hero-slide--active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--glass-bg)', color: 'var(--color-text-secondary)', fontSize: '3rem' }}>
              {business.publicName.slice(0, 2).toUpperCase()}
            </div>
          )}
          {heroImages.length > 1 && (
            <div className="biz-carousel-dots">
              {heroImages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Image ${i + 1}`}
                  className={`biz-carousel-dot${i === heroIndex ? ' biz-carousel-dot--active' : ''}`}
                  onClick={() => setHeroIndex(i)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="business-lux-hero-overlay">
          {/* Logo */}
          <div className="business-lux-logo-card" aria-hidden="true">
            {shop?.logo
              ? <img src={resolveMediaUrl(shop.logo)} alt={business.publicName} className="biz-hero-logo-img" />
              : <div className="business-lux-logo">{business.publicName.slice(0, 2).toUpperCase()}</div>
            }
          </div>

          {/* Identité centrale */}
          <div className="business-lux-identity-center">
            <div className="business-lux-title-row">
              <h1 className="public-title">{business.publicName}</h1>
              <span className="business-lux-verified" title={tierTitle}>{tierLabel}</span>
            </div>
            <p className="business-lux-domain">{publicDesc || ''}</p>
            <div className="business-lux-meta-row">
              <span>📍 {city}</span>
              <span>|</span>
              <span>⭐ {reviews.length > 0 ? avgScore.toFixed(1) : '—'}</span>
              <span>|</span>
              <span>{showcaseCount > 0 ? `${showcaseCount} articles` : 'Aucun article'}</span>
            </div>
            <div className="business-lux-meta-row strong">
              <span>{productListings.length} produits</span>
              <span>|</span>
              <span>{salesCount} ventes</span>
            </div>
            <div className="business-lux-cta-row">
              <button type="button" className="business-lux-cta primary" onClick={handleFollow} disabled={followBusy}>
                {isFollowingState ? '✓ Suivi' : 'Suivre'}{followersCount > 0 ? ` (${followersCount})` : ''}
              </button>
              <a href={`/messages?contact=${encodeURIComponent(business.publicName)}`} className="business-lux-cta">Contacter</a>
              <button type="button" className="business-lux-cta" onClick={handleShare}>Partager</button>
            </div>
          </div>

          {/* Colonne latérale stats */}
          <div className="business-lux-side-info">
            <span className={`business-lux-status${isOnline ? ' online' : ''}`}>
              {isOnline ? '● En ligne' : '● Hors ligne'}
            </span>
            <div className="business-lux-side-stats">
              <span>Articles en vitrine</span>
              <strong>{showcaseCount}</strong>
            </div>
            <div className="business-lux-side-stats">
              <span>Ventes totales</span>
              <strong>{salesCount}</strong>
            </div>
            <div className="business-lux-side-stats">
              <span>Services proposés</span>
              <strong>{serviceListings.length}</strong>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ PROMO ═══════════════════════════════════════════ */}
      {activePromo && (
        <section className="business-lux-promo" aria-label="Offre du moment">
          <p>Offre spéciale</p>
          <h2>{activePromo.title}</h2>
          <a href={`#${activePromo.id}`}>Voir la promotion — {fmtUsd(activePromo.priceUsdCents)}</a>
        </section>
      )}

      {/* ═══ PRODUITS (pleine largeur, si publiés) ═══════════ */}
      {hasProducts && (
        <section className="public-section" aria-label="Produits">
          <div className="public-section-head">
            <h2>🏆 Produits</h2>
          </div>
          <div className="business-lux-products-grid compact">
            {productListings.map(listing => (
              <article key={listing.id} id={listing.id} className="business-lux-product-card">
                <div className="business-lux-product-media">
                  {listing.imageUrl ?? listing.mediaUrls[0]
                    ? <img src={resolveMediaUrl((listing.imageUrl ?? listing.mediaUrls[0])!)} alt={listing.title} />
                    : <div className="biz-product-no-img">📦</div>
                  }
                </div>
                <h3 className="public-listing-title">{listing.title}</h3>
                <p className="public-listing-price biz-price-usd">{fmtUsd(listing.priceUsdCents)}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ═══ SERVICES (pleine largeur, si publiés) ═══════════ */}
      {hasServices && (
        <section className="public-section" aria-label="Services">
          <div className="public-section-head">
            <h2>🛠️ Services</h2>
          </div>
          <div className="business-lux-services-grid">
            {serviceListings.map(svc => (
              <article key={svc.id} className="business-lux-service-card horizontal">
                <span className="business-lux-service-icon" aria-hidden="true">🛠️</span>
                <div className="business-lux-service-copy">
                  <h3>{svc.title}</h3>
                  <p>{svc.description ?? svc.category}</p>
                  <strong className="biz-price-usd">{fmtUsd(svc.priceUsdCents)}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ═══ Espace pub si aucun article ═════════════════════ */}
      {!hasProducts && !hasServices && (
        <section className="public-section" aria-label="Espace publicité">
          <article className="business-lux-promo-card">
            <span>Publicité</span>
            <h3>Boostez vos ventes avec un placement premium sur Kin-Sell</h3>
            <p>Votre offre apparaîtra ici une fois des articles publiés.</p>
          </article>
        </section>
      )}

      {/* ═══ POINTS FORTS ════════════════════════════════════ */}
      {qualities.length > 0 && (
        <section className="public-section" aria-label="Points forts">
          <div className="public-section-head">
            <h2>✨ Points forts</h2>
          </div>
          <div className="business-lux-services-grid">
            {qualities.map(q => (
              <article key={q.id} className="business-lux-service-card horizontal">
                <span className="business-lux-service-icon" aria-hidden="true">{q.icon}</span>
                <div className="business-lux-service-copy">
                  <h3>{q.name}</h3>
                  <p>{q.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ═══ AVIS ════════════════════════════════════════════ */}
      <section className="public-section" aria-label="Avis clients">
        <div className="public-section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <h2>⭐ Avis Clients {reviews.length > 0 && <span style={{ fontWeight: 400, fontSize: '.85em', color: 'var(--color-text-secondary)' }}>({reviews.length} avis · {avgScore.toFixed(1)}/5)</span>}</h2>
          <button type="button" className="business-lux-cta primary" style={{ fontSize: '.85rem', padding: '6px 16px' }} onClick={() => { if (!isLoggedIn) { navigate('/login'); return; } setShowReviewPopup(true); }}>✍️ Laisser un avis</button>
        </div>
        {reviews.length > 0 ? (
          <div className="business-lux-reviews-grid">
            {reviews.map(review => (
              <article key={review.id} className="business-lux-review-card">
                <div className="business-lux-review-top">
                  <div className="biz-review-avatar">{review.author.slice(0, 1)}</div>
                  <div>
                    <strong>{review.author}</strong>
                    {review.verified && <span style={{ fontSize: '.72rem', color: 'var(--color-primary)', fontWeight: 600, marginLeft: 4 }}>✓ Vérifié</span>}
                    <span>{'⭐'.repeat(Math.round(review.score))} {review.score.toFixed(1)}</span>
                  </div>
                  <small style={{ marginLeft: 'auto', color: 'var(--color-text-secondary)', fontSize: '.78rem' }}>{review.date}</small>
                </div>
                <p>{review.text}</p>
              </article>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 'var(--space-lg) 0', color: 'var(--color-text-secondary)' }}>
            <p>Aucun avis pour le moment.</p>
            <button type="button" className="business-lux-cta primary" style={{ marginTop: '12px' }} onClick={() => { if (!isLoggedIn) { navigate('/login'); return; } setShowReviewPopup(true); }}>Soyez le premier à laisser un avis</button>
          </div>
        )}
      </section>

      {/* ═══ BOUTON SIGNALEMENT FLOTTANT ═════════════════════ */}
      <div className="biz-report-float">
        <button type="button" className="biz-report-float-btn" onClick={() => setShowReportPopup(true)} title="Signaler cette boutique">🚩</button>
      </div>

      {/* ═══ POPUP — LAISSER UN AVIS ═════════════════════════ */}
      {showReviewPopup && (
        <div className="biz-popup-overlay" onClick={() => { setShowReviewPopup(false); setReviewMsg(''); }}>
          <div className="biz-popup glass-container" onClick={e => e.stopPropagation()}>
            <div className="biz-popup-head">
              <strong>✍️ Laisser un avis</strong>
              <button type="button" className="biz-popup-close" onClick={() => { setShowReviewPopup(false); setReviewMsg(''); }}>✕</button>
            </div>
            {reviewMsg ? (
              <p className="biz-popup-success">{reviewMsg}</p>
            ) : (
              <div className="biz-popup-body">
                <label className="biz-popup-field">
                  <span>Note</span>
                  <div className="biz-popup-stars">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" className={`biz-popup-star${reviewDraft.score >= n ? ' active' : ''}`} onClick={() => setReviewDraft(d => ({ ...d, score: n }))}>⭐</button>
                    ))}
                  </div>
                </label>
                <label className="biz-popup-field">
                  <span>Votre avis (optionnel)</span>
                  <textarea rows={3} maxLength={500} placeholder="Partagez votre expérience..." value={reviewDraft.text} onChange={e => setReviewDraft(d => ({ ...d, text: e.target.value }))} />
                </label>
                <button type="button" className="business-lux-cta primary" style={{ width: '100%', marginTop: '8px' }} disabled={reviewDraft.score < 1 || reviewBusy} onClick={handleSubmitReview}>{reviewBusy ? '⏳ Envoi…' : 'Publier mon avis'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ POPUP — SIGNALEMENT ═════════════════════════════ */}
      {showReportPopup && (
        <div className="biz-popup-overlay" onClick={() => { setShowReportPopup(false); setReportMsg(''); }}>
          <div className="biz-popup glass-container" onClick={e => e.stopPropagation()}>
            <div className="biz-popup-head">
              <strong>🚩 Signaler cette boutique</strong>
              <button type="button" className="biz-popup-close" onClick={() => { setShowReportPopup(false); setReportMsg(''); }}>✕</button>
            </div>
            {reportMsg ? (
              <p className="biz-popup-success">{reportMsg}</p>
            ) : (
              <div className="biz-popup-body">
                <label className="biz-popup-field">
                  <span>Votre nom</span>
                  <input type="text" maxLength={60} placeholder="Ex: Jean P." value={reportDraft.author} onChange={e => setReportDraft(d => ({ ...d, author: e.target.value }))} />
                </label>
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
                <button type="button" className="business-lux-cta primary" style={{ width: '100%', marginTop: '8px' }} disabled={!reportDraft.author.trim() || !reportDraft.detail.trim()} onClick={handleSubmitReport}>Envoyer le signalement</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ CONTACT + LOCALISATION + PHOTOS BOUTIQUE ════════ */}
      <section className="public-section" aria-label="Contact et localisation">
        <div className="public-section-head">
          <h2>📍 Contact & Localisation</h2>
        </div>

        <div className="business-lux-contact-location">
          <article className="business-lux-contact-card">
            <p>Contact</p>
            <h3>Contact via Kin-Sell</h3>
            <a href={`/messages?contact=${encodeURIComponent(business.publicName)}`}>Ouvrir la conversation</a>
          </article>
          <article className="business-lux-contact-card">
            <p>Localisation</p>
            <h3>{city}</h3>
            <span>{city}, RDC</span>
          </article>
        </div>

        {/* ── Carte (placeholder) ── */}
        <div className="biz-map-placeholder">
          <div className="biz-map-inner">
            <span className="biz-map-pin">📍</span>
            <p>{business.publicName} — {city}, RDC</p>
            <small>Carte interactive bientôt disponible</small>
          </div>
        </div>

        {/* ── Photos boutique physique défilantes ── */}
        {shopPhotos.length > 0 && (
          <div className="biz-shop-gallery">
            <h3 className="biz-shop-gallery-title">📸 Notre boutique</h3>
            <div className="biz-shop-gallery-carousel">
              {shopPhotos.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`Boutique ${business.publicName} — photo ${i + 1}`}
                  className={`biz-shop-gallery-img${i === shopPhotoIdx ? ' biz-shop-gallery-img--active' : ''}`}
                />
              ))}
              {shopPhotos.length > 1 && (
                <div className="biz-carousel-dots" style={{ bottom: '12px' }}>
                  {shopPhotos.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Photo ${i + 1}`}
                      className={`biz-carousel-dot${i === shopPhotoIdx ? ' biz-carousel-dot--active' : ''}`}
                      onClick={() => setShopPhotoIdx(i)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

    </section>
  );
}
