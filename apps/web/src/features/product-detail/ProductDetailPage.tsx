import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import {
  listings as listingsApi,
  orders as ordersApi,
  reviews as reviewsApi,
  resolveMediaUrl,
  type PublicListingDetail,
  type ReviewItem,
  ApiError,
} from "../../lib/api-client";
import { NegotiatePopup } from "../negotiations/NegotiatePopup";
import { SeoMeta } from "../../components/SeoMeta";
import { useLockedCategories, isCategoryLocked } from "../../hooks/useLockedCategories";
import "./product-detail.css";

/* ═══════════════════════════════════════════════════════════
   VARIANTES (taille / couleur)
   Uniquement pour les PRODUITS — affichées si déclarées par le vendeur
   à la publication. Les services n'ont pas de variantes.
   ═══════════════════════════════════════════════════════════ */
type ProductVariants = {
  sizes?: string[];
  colors?: { name: string; hex: string }[];
};

function getVariantsForListing(l: PublicListingDetail | null): ProductVariants | null {
  if (!l) return null;
  if (l.type !== "PRODUIT") return null;
  const v = l.variants;
  if (!v) return null;
  const hasSizes = Array.isArray(v.sizes) && v.sizes.length > 0;
  const hasColors = Array.isArray(v.colors) && v.colors.length > 0;
  if (!hasSizes && !hasColors) return null;
  return {
    sizes: hasSizes ? v.sizes : undefined,
    colors: hasColors ? v.colors : undefined,
  };
}

/* ═══════════════════════════════════════════════════════════
   COMPOSANT PRINCIPAL
   ═══════════════════════════════════════════════════════════ */
export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  const { t, formatMoneyFromUsdCents } = useLocaleCurrency();
  const locked = useLockedCategories();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [similar, setSimilar] = useState<PublicListingDetail[]>([]);
  const [activeMedia, setActiveMedia] = useState(0);
  const [qty, setQty] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [busyCart, setBusyCart] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<string | null>(null);
  const [showNegotiate, setShowNegotiate] = useState(false);
  const [expandedDesc, setExpandedDesc] = useState(false);

  // Reviews vendeur
  const [reviewsList, setReviewsList] = useState<ReviewItem[]>([]);
  const [reviewsAvg, setReviewsAvg] = useState<number>(0);
  const [reviewsTotal, setReviewsTotal] = useState<number>(0);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newRating, setNewRating] = useState(5);
  const [newReviewText, setNewReviewText] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);

  /* ── Fetch listing detail ── */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listingsApi.publicDetail(id)
      .then((data) => {
        if (cancelled) return;
        setListing(data.listing);
        setSimilar(data.similar || []);
        setActiveMedia(0);
        setQty(1);
        // tracking view fire-and-forget
        listingsApi.trackView(id).catch(() => {});
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("Article introuvable ou retiré de la vente.");
        } else {
          setError("Impossible de charger cet article. Vérifiez votre connexion.");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  /* ── Fetch reviews vendeur ── */
  useEffect(() => {
    if (!listing?.owner.userId) return;
    let cancelled = false;
    reviewsApi.forUser(listing.owner.userId)
      .then((data) => {
        if (cancelled) return;
        setReviewsList(data.reviews || []);
        setReviewsAvg(data.averageRating || 0);
        setReviewsTotal(data.totalCount || 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [listing?.owner.userId]);

  /* ── Scroll top when listing changes ── */
  const pageTopRef = useRef<HTMLDivElement>(null);
  useEffect(() => { pageTopRef.current?.scrollIntoView({ behavior: "auto", block: "start" }); }, [id]);

  /* ── Media URLs ── */
  const mediaList = useMemo(() => {
    if (!listing) return [] as string[];
    const list: string[] = [];
    if (listing.imageUrl) list.push(resolveMediaUrl(listing.imageUrl));
    for (const m of listing.mediaUrls || []) {
      if (!m) continue;
      const abs = resolveMediaUrl(m);
      if (!list.includes(abs)) list.push(abs);
    }
    return list;
  }, [listing]);

  /* ── Prix effectif ── */
  const priceInfo = useMemo(() => {
    if (!listing) return null;
    const hasPromo = !!listing.promoActive && typeof listing.promoPriceUsdCents === "number" && (listing.promoPriceUsdCents as number) > 0 && (listing.promoPriceUsdCents as number) < listing.priceUsdCents;
    const current = hasPromo ? (listing.promoPriceUsdCents as number) : listing.priceUsdCents;
    const pct = hasPromo ? Math.round(((listing.priceUsdCents - current) / Math.max(1, listing.priceUsdCents)) * 100) : 0;
    return { hasPromo, current, original: listing.priceUsdCents, pct };
  }, [listing]);

  const variants = useMemo(() => getVariantsForListing(listing), [listing]);
  const isOwn = !!(user?.id && listing?.owner.userId === user.id);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const catLocked = useMemo(() => (listing ? isCategoryLocked(locked, listing.category) : false), [listing, locked]);
  const canNegotiate = !!listing && listing.isNegotiable !== false && !catLocked && !isOwn && !isAdmin;

  /* ── Ajouter au panier ── */
  const handleAddToCart = useCallback(async () => {
    if (!listing) return;
    if (!isLoggedIn) { navigate("/login"); return; }
    if (isAdmin) { setCartFeedback("🔒 Les admins ne peuvent pas effectuer de transactions."); return; }
    if (isOwn) { setCartFeedback("⚠️ Vous ne pouvez pas acheter votre propre article."); return; }
    if (variants?.sizes && variants.sizes.length > 0 && !selectedSize) {
      setCartFeedback("👕 Choisissez une taille avant d'ajouter au panier.");
      window.setTimeout(() => setCartFeedback(null), 2400);
      return;
    }
    if (variants?.colors && variants.colors.length > 0 && !selectedColor) {
      setCartFeedback("🎨 Choisissez une couleur avant d'ajouter au panier.");
      window.setTimeout(() => setCartFeedback(null), 2400);
      return;
    }
    setBusyCart(true);
    try {
      await ordersApi.addCartItem({ listingId: listing.id, quantity: qty });
      setCartFeedback(`✅ Ajouté au panier (${qty})`);
      window.setTimeout(() => setCartFeedback(null), 2400);
    } catch (err) {
      setCartFeedback(err instanceof ApiError ? `❌ ${err.message}` : "❌ Erreur lors de l'ajout au panier");
      window.setTimeout(() => setCartFeedback(null), 2800);
    } finally {
      setBusyCart(false);
    }
  }, [listing, isLoggedIn, isAdmin, isOwn, qty, navigate, variants, selectedSize, selectedColor]);

  /* ── Soumettre un avis ── */
  const handleSubmitReview = useCallback(async () => {
    if (!listing) return;
    if (!isLoggedIn) { navigate("/login"); return; }
    if (isOwn) { setReviewFeedback("Vous ne pouvez pas évaluer votre propre boutique."); return; }
    if (newRating < 1 || newRating > 5) { setReviewFeedback("Note invalide."); return; }
    setReviewBusy(true);
    setReviewFeedback(null);
    try {
      await reviewsApi.create({ targetId: listing.owner.userId, rating: newRating, text: newReviewText.trim() || undefined });
      const fresh = await reviewsApi.forUser(listing.owner.userId);
      setReviewsList(fresh.reviews || []);
      setReviewsAvg(fresh.averageRating || 0);
      setReviewsTotal(fresh.totalCount || 0);
      setShowReviewForm(false);
      setNewReviewText("");
      setNewRating(5);
      setReviewFeedback("✅ Merci pour votre avis !");
      window.setTimeout(() => setReviewFeedback(null), 2500);
    } catch (err) {
      setReviewFeedback(err instanceof ApiError ? `❌ ${err.message}` : "❌ Erreur lors de l'envoi de l'avis");
    } finally {
      setReviewBusy(false);
    }
  }, [listing, isLoggedIn, isOwn, newRating, newReviewText, navigate]);

  /* ── RENDER: LOADING / ERROR ── */
  if (loading) {
    return (
      <div className="pd-page pd-page--loading">
        <div className="pd-skeleton pd-skeleton-media" />
        <div className="pd-skeleton pd-skeleton-info">
          <div className="pd-skel-line pd-skel-line-lg" />
          <div className="pd-skel-line pd-skel-line-md" />
          <div className="pd-skel-line pd-skel-line-sm" />
          <div className="pd-skel-line pd-skel-line-md" />
        </div>
      </div>
    );
  }
  if (error || !listing || !priceInfo) {
    return (
      <div className="pd-page pd-page--error">
        <div className="glass-card pd-error-card">
          <span className="pd-error-icon" aria-hidden="true">⚠️</span>
          <h2>{error ?? "Article indisponible"}</h2>
          <p>Cet article n'est peut-être plus en vente. Explorez d'autres offres sur Kin-Sell.</p>
          <div className="pd-error-actions">
            <button className="glass-button glass-button--primary" onClick={() => navigate("/explorer")}>Parcourir l'Explorer</button>
            <button className="glass-button glass-button--secondary" onClick={() => navigate("/")}>Retour accueil</button>
          </div>
        </div>
      </div>
    );
  }

  const mainMediaUrl = mediaList[activeMedia] || "/placeholder-product.jpg";

  return (
    <div className="pd-page" ref={pageTopRef}>
      <SeoMeta
        title={`${listing.title} · Kin-Sell`}
        description={listing.description?.slice(0, 160) ?? `${listing.title} disponible sur Kin-Sell — ${listing.category} à ${listing.city}.`}
        ogImage={mainMediaUrl}
      />

      {/* ── Breadcrumb ── */}
      <nav className="pd-breadcrumb" aria-label="Fil d'ariane">
        <button type="button" onClick={() => navigate("/")} className="pd-crumb">Accueil</button>
        <span className="pd-crumb-sep">›</span>
        <button type="button" onClick={() => navigate("/explorer")} className="pd-crumb">Explorer</button>
        <span className="pd-crumb-sep">›</span>
        <span className="pd-crumb pd-crumb--current">{listing.category}</span>
      </nav>

      <div className="pd-layout">
        {/* ═══════════ COLONNE GAUCHE : MÉDIAS ═══════════ */}
        <section className="pd-media-section">
          <div className="pd-media-main glass-card">
            {priceInfo.hasPromo && (
              <span className="pd-promo-badge">−{priceInfo.pct}%</span>
            )}
            {listing.type === "SERVICE" && (
              <span className="pd-type-badge pd-type-badge--service">Service</span>
            )}
            <img
              key={mainMediaUrl}
              src={mainMediaUrl}
              alt={listing.title}
              className="pd-media-img"
              loading="eager"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder-product.jpg"; }}
            />
            {mediaList.length > 1 && (
              <>
                <button type="button" className="pd-media-nav pd-media-nav--prev" aria-label="Précédent"
                  onClick={() => setActiveMedia((i) => (i - 1 + mediaList.length) % mediaList.length)}>‹</button>
                <button type="button" className="pd-media-nav pd-media-nav--next" aria-label="Suivant"
                  onClick={() => setActiveMedia((i) => (i + 1) % mediaList.length)}>›</button>
              </>
            )}
          </div>
          {mediaList.length > 1 && (
            <div className="pd-media-thumbs">
              {mediaList.map((url, idx) => (
                <button
                  key={url + idx}
                  type="button"
                  className={`pd-thumb ${activeMedia === idx ? "is-active" : ""}`}
                  onClick={() => setActiveMedia(idx)}
                  aria-label={`Image ${idx + 1}`}
                >
                  <img src={url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ═══════════ COLONNE DROITE : INFOS ═══════════ */}
        <section className="pd-info-section">
          <div className="glass-card pd-info-card">
            <div className="pd-info-meta">
              <span className="pd-category">{listing.category}</span>
              <span className="pd-sep">·</span>
              <span className="pd-city">📍 {listing.city}{listing.country ? `, ${listing.country}` : ""}</span>
              {typeof listing.viewCount === "number" && listing.viewCount > 0 && (
                <>
                  <span className="pd-sep">·</span>
                  <span className="pd-views">👁 {listing.viewCount} vues</span>
                </>
              )}
            </div>

            <h1 className="pd-title">{listing.title}</h1>

            {/* Étoiles vendeur */}
            <div className="pd-rating-row">
              <StarRating value={reviewsAvg} size="md" />
              <span className="pd-rating-text">
                {reviewsAvg > 0 ? reviewsAvg.toFixed(1) : "—"}
                <span className="pd-rating-count">({reviewsTotal} avis vendeur)</span>
              </span>
              <button type="button" className="pd-rating-link" onClick={() => {
                document.getElementById("pd-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}>Voir les avis</button>
            </div>

            {/* Prix */}
            <div className="pd-price-block">
              <div className="pd-price-current">{formatMoneyFromUsdCents(priceInfo.current)}</div>
              {priceInfo.hasPromo && (
                <div className="pd-price-original">
                  <s>{formatMoneyFromUsdCents(priceInfo.original)}</s>
                  <span className="pd-price-save">Économie : {formatMoneyFromUsdCents(priceInfo.original - priceInfo.current)}</span>
                </div>
              )}
              {listing.promoExpiresAt && priceInfo.hasPromo && (
                <div className="pd-promo-timer">⏰ Promo se termine le {new Date(listing.promoExpiresAt).toLocaleDateString("fr-FR")}</div>
              )}
              {listing.isNegotiable !== false && !catLocked && (
                <div className="pd-negotiable-chip">🤝 Prix négociable</div>
              )}
            </div>

            {/* Variantes */}
            {variants?.colors && variants.colors.length > 0 && (
              <div className="pd-variant-block">
                <div className="pd-variant-label">
                  Couleur : <strong>{selectedColor ?? "Choisissez"}</strong>
                </div>
                <div className="pd-variant-colors">
                  {variants.colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className={`pd-color-chip ${selectedColor === c.name ? "is-active" : ""}`}
                      style={{ background: c.hex }}
                      title={c.name}
                      aria-label={c.name}
                      onClick={() => setSelectedColor(c.name)}
                    >
                      {selectedColor === c.name && <span className="pd-color-check">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {variants?.sizes && variants.sizes.length > 0 && (
              <div className="pd-variant-block">
                <div className="pd-variant-label">Taille : <strong>{selectedSize ?? "Choisissez"}</strong></div>
                <div className="pd-variant-sizes">
                  {variants.sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`pd-size-chip ${selectedSize === s ? "is-active" : ""}`}
                      onClick={() => setSelectedSize(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Qté */}
            <div className="pd-qty-row">
              <span className="pd-qty-label">Quantité :</span>
              <div className="pd-qty-control">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Moins">−</button>
                <span>{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Plus">+</button>
              </div>
              {typeof listing.stockQuantity === "number" && listing.stockQuantity > 0 && (
                <span className={`pd-stock ${listing.stockQuantity <= 5 ? "pd-stock--low" : ""}`}>
                  {listing.stockQuantity <= 5 ? `⚠️ Plus que ${listing.stockQuantity} en stock !` : `✅ En stock (${listing.stockQuantity})`}
                </span>
              )}
            </div>

            {/* CTAs */}
            <div className="pd-cta-row">
              <button
                type="button"
                className="pd-cta pd-cta--cart"
                onClick={handleAddToCart}
                disabled={busyCart || isOwn || isAdmin}
              >
                <span className="pd-cta-icon">🛒</span>
                <span>{busyCart ? "Ajout..." : "Ajouter au panier"}</span>
              </button>
              <button
                type="button"
                className="pd-cta pd-cta--negotiate"
                onClick={() => setShowNegotiate(true)}
                disabled={!canNegotiate}
                title={!canNegotiate ? (isOwn ? "Votre propre article" : catLocked ? "Catégorie non négociable" : "Article non négociable") : undefined}
              >
                <span className="pd-cta-icon">🤝</span>
                <span>Marchander</span>
              </button>
            </div>
            {cartFeedback && <div className="pd-feedback">{cartFeedback}</div>}
          </div>

          {/* Carte vendeur */}
          <div className="glass-card pd-seller-card">
            <div className="pd-seller-avatar">
              {listing.owner.avatarUrl
                ? <img src={resolveMediaUrl(listing.owner.avatarUrl)} alt={listing.owner.displayName} />
                : <span>{listing.owner.displayName.charAt(0).toUpperCase()}</span>}
            </div>
            <div className="pd-seller-info">
              <div className="pd-seller-label">Vendu par</div>
              <div className="pd-seller-name">{listing.business?.publicName || listing.owner.displayName}</div>
              <div className="pd-seller-meta">
                <StarRating value={reviewsAvg} size="sm" />
                <span>{reviewsAvg > 0 ? `${reviewsAvg.toFixed(1)}/5` : "Nouveau"}</span>
                <span>·</span>
                <span>{reviewsTotal} avis</span>
              </div>
            </div>
            <div className="pd-seller-actions">
              {listing.owner.username && (
                <button type="button" className="glass-button glass-button--secondary pd-btn-sm"
                  onClick={() => navigate(`/user/${listing.owner.username}`)}>Profil</button>
              )}
              {listing.business?.slug && (
                <button type="button" className="glass-button glass-button--secondary pd-btn-sm"
                  onClick={() => navigate(`/business/${listing.business?.slug}`)}>Boutique</button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ═══════════ SECTION DESCRIPTION ═══════════ */}
      <section className="pd-section glass-card">
        <h2 className="pd-section-title">📝 Description & caractéristiques</h2>
        {listing.description ? (
          <div className={`pd-description ${expandedDesc ? "is-expanded" : ""}`}>
            <p>{listing.description}</p>
            {listing.description.length > 350 && (
              <button type="button" className="pd-desc-toggle" onClick={() => setExpandedDesc((v) => !v)}>
                {expandedDesc ? "Voir moins ▲" : "Voir plus ▼"}
              </button>
            )}
          </div>
        ) : (
          <p className="pd-description pd-description--empty">Aucune description fournie par le vendeur.</p>
        )}

        <div className="pd-specs">
          <div className="pd-spec"><span>Catégorie</span><strong>{listing.category}</strong></div>
          <div className="pd-spec"><span>Type</span><strong>{listing.type}</strong></div>
          <div className="pd-spec"><span>Localisation</span><strong>{listing.city}{listing.country ? `, ${listing.country}` : ""}</strong></div>
          <div className="pd-spec"><span>Négociable</span><strong>{listing.isNegotiable !== false && !catLocked ? "Oui" : "Non"}</strong></div>
          {typeof listing.stockQuantity === "number" && (
            <div className="pd-spec"><span>Stock</span><strong>{listing.stockQuantity}</strong></div>
          )}
          {listing.serviceDurationMin && (
            <div className="pd-spec"><span>Durée service</span><strong>{listing.serviceDurationMin} min</strong></div>
          )}
          <div className="pd-spec"><span>Publié le</span><strong>{new Date(listing.createdAt).toLocaleDateString("fr-FR")}</strong></div>
        </div>
      </section>

      {/* ═══════════ SECTION IA MARCHAND ═══════════ */}
      {canNegotiate && listing && (
        <AiMerchantInsight listing={listing} onOpenNegotiate={() => setShowNegotiate(true)} />
      )}

      {/* ═══════════ SECTION AVIS ═══════════ */}
      <section id="pd-reviews" className="pd-section glass-card">
        <div className="pd-section-header">
          <h2 className="pd-section-title">⭐ Avis clients sur le vendeur</h2>
          {reviewsTotal > 0 && (
            <div className="pd-reviews-summary">
              <span className="pd-reviews-avg">{reviewsAvg.toFixed(1)}</span>
              <StarRating value={reviewsAvg} size="md" />
              <span>({reviewsTotal})</span>
            </div>
          )}
        </div>

        {!isOwn && !isAdmin && isLoggedIn && (
          <button type="button" className="glass-button glass-button--primary pd-add-review-btn"
            onClick={() => setShowReviewForm((v) => !v)}>
            {showReviewForm ? "Annuler" : "✍️ Laisser un avis"}
          </button>
        )}

        {showReviewForm && (
          <div className="pd-review-form">
            <div className="pd-review-stars-input">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={`pd-star-btn ${n <= newRating ? "is-active" : ""}`}
                  onClick={() => setNewRating(n)} aria-label={`${n} étoile${n > 1 ? "s" : ""}`}>★</button>
              ))}
            </div>
            <textarea
              className="pd-review-textarea"
              value={newReviewText}
              onChange={(e) => setNewReviewText(e.target.value)}
              placeholder="Partagez votre expérience avec ce vendeur (facultatif)"
              rows={3}
              maxLength={500}
            />
            <button type="button" className="glass-button glass-button--primary" disabled={reviewBusy}
              onClick={handleSubmitReview}>
              {reviewBusy ? "Envoi..." : "Publier mon avis"}
            </button>
            {reviewFeedback && <div className="pd-feedback">{reviewFeedback}</div>}
          </div>
        )}

        {reviewsList.length === 0 ? (
          <div className="pd-empty">
            <span className="pd-empty-icon">💬</span>
            <p>Aucun avis pour le moment. Soyez le premier à partager votre expérience !</p>
          </div>
        ) : (
          <div className="pd-reviews-list">
            {reviewsList.slice(0, 6).map((r) => (
              <article key={r.id} className="pd-review">
                <div className="pd-review-head">
                  <div className="pd-review-avatar">
                    {r.authorAvatar
                      ? <img src={resolveMediaUrl(r.authorAvatar)} alt={r.authorName} />
                      : <span>{r.authorName.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div className="pd-review-meta">
                    <div className="pd-review-author">{r.authorName}{r.verified && <span className="pd-verified-badge" title="Achat vérifié">✓</span>}</div>
                    <div className="pd-review-date-row">
                      <StarRating value={r.rating} size="sm" />
                      <span className="pd-review-date">{new Date(r.createdAt).toLocaleDateString("fr-FR")}</span>
                    </div>
                  </div>
                </div>
                {r.text && <p className="pd-review-text">{r.text}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ═══════════ PRODUITS SIMILAIRES ═══════════ */}
      {similar.length > 0 && (
        <section className="pd-section glass-card">
          <h2 className="pd-section-title">🔁 Produits similaires</h2>
          <div className="pd-similar-grid">
            {similar.slice(0, 8).map((s) => {
              const sPrice = s.promoActive && s.promoPriceUsdCents ? s.promoPriceUsdCents : s.priceUsdCents;
              return (
                <button key={s.id} type="button" className="pd-similar-card" onClick={() => navigate(`/listing/${s.id}`)}>
                  <div className="pd-similar-img-wrap">
                    <img src={s.imageUrl ? resolveMediaUrl(s.imageUrl) : "/placeholder-product.jpg"} alt={s.title} loading="lazy" />
                  </div>
                  <div className="pd-similar-title">{s.title}</div>
                  <div className="pd-similar-price">{formatMoneyFromUsdCents(sPrice)}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══════════ CTA STICKY BOTTOM (MOBILE) ═══════════ */}
      <div className="pd-sticky-cta">
        <div className="pd-sticky-price">
          <div className="pd-sticky-price-now">{formatMoneyFromUsdCents(priceInfo.current)}</div>
          {priceInfo.hasPromo && <div className="pd-sticky-price-old"><s>{formatMoneyFromUsdCents(priceInfo.original)}</s></div>}
        </div>
        <button type="button" className="pd-sticky-btn pd-sticky-btn--cart"
          onClick={handleAddToCart} disabled={busyCart || isOwn || isAdmin}>
          🛒 Panier
        </button>
        <button type="button" className="pd-sticky-btn pd-sticky-btn--nego"
          onClick={() => setShowNegotiate(true)} disabled={!canNegotiate}>
          🤝 Marchander
        </button>
      </div>

      {/* ═══════════ POPUP NÉGOCIATION ═══════════ */}
      {showNegotiate && listing && (
        <NegotiatePopup
          listing={{
            id: listing.id,
            title: listing.title,
            imageUrl: listing.imageUrl,
            type: listing.type,
            priceUsdCents: priceInfo.current,
            ownerDisplayName: listing.business?.publicName || listing.owner.displayName,
          }}
          onClose={() => setShowNegotiate(false)}
          onSuccess={() => {
            setShowNegotiate(false);
            navigate("/messaging");
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SOUS-COMPOSANT : Étoiles
   ═══════════════════════════════════════════════════════════ */
function StarRating({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={`pd-stars pd-stars--${size}`} aria-label={`${value.toFixed(1)} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        if (rounded >= n) return <span key={n} className="pd-star pd-star--full">★</span>;
        if (rounded >= n - 0.5) return <span key={n} className="pd-star pd-star--half">★</span>;
        return <span key={n} className="pd-star pd-star--empty">★</span>;
      })}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   SOUS-COMPOSANT : IA Marchand Insight
   ═══════════════════════════════════════════════════════════ */
function AiMerchantInsight({ listing, onOpenNegotiate }: { listing: PublicListingDetail; onOpenNegotiate: () => void }) {
  const { formatMoneyFromUsdCents } = useLocaleCurrency();
  const [hint, setHint] = useState<import("../../lib/services/ai.service").BuyerNegotiationHint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    import("../../lib/api-client").then(({ negotiationAi }) => {
      negotiationAi.buyerHint(listing.id)
        .then((data) => { if (!cancelled) setHint(data); })
        .catch(() => { if (!cancelled) setHint(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [listing.id]);

  if (loading) {
    return (
      <section className="pd-section pd-ai-section glass-card">
        <div className="pd-ai-loading">🤖 L'IA Marchand analyse le marché…</div>
      </section>
    );
  }
  if (!hint) return null;

  const ctxLabel =
    hint.marketContext === "COMPETITIVE" ? "Marché compétitif" :
    hint.marketContext === "FLEXIBLE" ? "Prix flexibles" : "Prix fermes";
  const ctxColor =
    hint.marketContext === "FLEXIBLE" ? "#42d4a4" :
    hint.marketContext === "COMPETITIVE" ? "#ffb547" : "#ff7a90";

  return (
    <section className="pd-section pd-ai-section glass-card">
      <div className="pd-ai-head">
        <div className="pd-ai-icon">🤖</div>
        <div>
          <h2 className="pd-ai-title">IA Marchand — Recommandation personnalisée</h2>
          <div className="pd-ai-context" style={{ color: ctxColor }}>● {ctxLabel}</div>
        </div>
      </div>

      <div className="pd-ai-grid">
        <div className="pd-ai-stat">
          <div className="pd-ai-stat-label">Prix suggéré</div>
          <div className="pd-ai-stat-value pd-ai-stat-value--accent">{formatMoneyFromUsdCents(hint.suggestedOfferUsdCents)}</div>
          <div className="pd-ai-stat-sub">Prix annoncé : {formatMoneyFromUsdCents(hint.originalPriceUsdCents)}</div>
        </div>
        <div className="pd-ai-stat">
          <div className="pd-ai-stat-label">Taux de succès</div>
          <div className="pd-ai-stat-value">{Math.round(Math.min(100, Math.max(0, hint.successRate)))}%</div>
          <div className="pd-ai-gauge">
            <div className="pd-ai-gauge-fill" style={{ width: `${Math.min(100, Math.max(0, hint.successRate))}%` }} />
          </div>
        </div>
        <div className="pd-ai-stat">
          <div className="pd-ai-stat-label">Prix plancher réaliste</div>
          <div className="pd-ai-stat-value pd-ai-stat-value--muted">{formatMoneyFromUsdCents(hint.minRealisticOfferUsdCents)}</div>
          <div className="pd-ai-stat-sub">Sous ce prix, offre peu probable</div>
        </div>
      </div>

      {hint.insight && <div className="pd-ai-insight">💡 {hint.insight}</div>}
      {hint.messageSuggestion && (
        <div className="pd-ai-suggestion">
          <div className="pd-ai-suggestion-label">Message suggéré :</div>
          <blockquote>« {hint.messageSuggestion} »</blockquote>
        </div>
      )}

      <button type="button" className="glass-button glass-button--primary pd-ai-cta" onClick={onOpenNegotiate}>
        🤝 Marchander au prix suggéré
      </button>
    </section>
  );
}
