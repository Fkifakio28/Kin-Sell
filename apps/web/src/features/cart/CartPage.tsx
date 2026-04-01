import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { orders, negotiations, billing, orderAi, type CartSummary, type NegotiationSummary, type BillingPlanSummary, type CheckoutAdvice, ApiError } from "../../lib/api-client";
import { NegotiationRespondPopup } from "../negotiations/NegotiationRespondPopup";
import { NegotiatePopup } from "../negotiations/NegotiatePopup";
import { BundleNegotiatePopup, type BundleListingItem } from "../negotiations/BundleNegotiatePopup";
import { useLockedCategories, isCategoryLocked } from "../../hooks/useLockedCategories";
import "./cart.css";

export function CartPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const { t, formatMoneyFromUsdCents } = useLocaleCurrency();
  const lockedCats = useLockedCategories();
  const navigate = useNavigate();

  const [cart, setCart] = useState<CartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [checkoutNotes, setCheckoutNotes] = useState("");
  const [negotiatePopup, setNegotiatePopup] = useState(false);
  const [respondNegId, setRespondNegId] = useState<string | null>(null);
  const [respondNeg, setRespondNeg] = useState<NegotiationSummary | null>(null);
  const [cancellingNeg, setCancellingNeg] = useState<string | null>(null);
  const [bundleTarget, setBundleTarget] = useState<{ sellerId: string; sellerName: string; listings: BundleListingItem[] } | null>(null);
  const [negotiateItem, setNegotiateItem] = useState<{ id: string; title: string; imageUrl: string | null; type: string; priceUsdCents: number; ownerDisplayName: string } | null>(null);
  const [activePlan, setActivePlan] = useState<BillingPlanSummary | null>(null);
  const [checkoutAdviceData, setCheckoutAdviceData] = useState<CheckoutAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    deliveryAddress: "",
    serviceMaintenanceAddress: "",
    serviceExecutionAddress: "",
    paymentMethod: "MPESA" as "CARD" | "PAYPAL" | "MPESA" | "ORANGE_MONEY" | "CASH_ON_DELIVERY",
    additionalNote: ""
  });

  /* ── Show negotiate popup if redirected from public profile ── */
  useEffect(() => {
    if (sessionStorage.getItem('ks-negotiate') === '1') {
      sessionStorage.removeItem('ks-negotiate');
      setNegotiatePopup(true);
    }
  }, []);

  /* ── Fetch cart ── */
  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const data = await orders.buyerCart();
        if (!cancelled) setCart(data);
      } catch {
        if (!cancelled) setCart(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [isLoggedIn, authLoading]);

  /* ── Fetch billing plan ── */
  useEffect(() => {
    if (!isLoggedIn || authLoading) return;
    let cancelled = false;
    billing.myPlan().then((p) => { if (!cancelled) setActivePlan(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isLoggedIn, authLoading]);

  /* ── IA Commande: fetch checkout advice when plan allows ── */
  const aiCommandeOn = useMemo(() => localStorage.getItem('ks-ai-commande') !== 'off', []);
  const hasIaOrder = useMemo(() => {
    if (!aiCommandeOn || !activePlan) return false;
    const planIncludes = ["AUTO", "PRO_VENDOR", "SCALE"].includes(activePlan.planCode);
    const addonActive = activePlan.addOns?.some((a) => a.code === "IA_ORDER" && a.status === "ACTIVE");
    return planIncludes || addonActive;
  }, [activePlan, aiCommandeOn]);

  useEffect(() => {
    if (!hasIaOrder || !cart?.id) return;
    let cancelled = false;
    setAdviceLoading(true);
    orderAi.checkoutAdvice(cart.id)
      .then((data) => { if (!cancelled) setCheckoutAdviceData(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAdviceLoading(false); });
    return () => { cancelled = true; };
  }, [hasIaOrder, cart?.id]);

  /* ── Handlers ── */
  const handleQuantity = useCallback(async (itemId: string, next: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (next < 1) {
        const updated = await orders.removeCartItem(itemId);
        setCart(updated);
      } else {
        const updated = await orders.updateCartItem(itemId, { quantity: next });
        setCart(updated);
      }
    } catch (err) {
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? "Erreur quantité.") : "Erreur quantité.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const handlePriceSave = useCallback(async (itemId: string) => {
    const raw = draftPrices[itemId];
    if (raw === undefined || busy) return;
    const cents = Math.round(Number(raw));
    if (Number.isNaN(cents) || cents < 0) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await orders.updateCartItem(itemId, { unitPriceUsdCents: cents });
      setCart(updated);
      setDraftPrices((p) => { const copy = { ...p }; delete copy[itemId]; return copy; });
    } catch (err) {
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? "Erreur prix.") : "Erreur prix.");
    } finally {
      setBusy(false);
    }
  }, [busy, draftPrices]);

  const handleRemove = useCallback(async (itemId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await orders.removeCartItem(itemId);
      setCart(updated);
    } catch (err) {
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? "Erreur suppression.") : "Erreur suppression.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const handleCheckout = useCallback(async (notes?: string) => {
    if (checkoutBusy || !cart || cart.items.length === 0) return;
    setCheckoutBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const payloadNotes = [notes, checkoutNotes.trim()].filter(Boolean).join(" | ");
      const result = await orders.checkoutBuyerCart(payloadNotes ? { notes: payloadNotes } : undefined);
      setSuccess(result.message || "Commande validée !");
      setCart(null);
      setCheckoutNotes("");
      setCheckoutModalOpen(false);
      setCheckoutForm({
        deliveryAddress: "",
        serviceMaintenanceAddress: "",
        serviceExecutionAddress: "",
        paymentMethod: "MPESA",
        additionalNote: ""
      });
    } catch (err) {
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? "Erreur validation.") : "Erreur validation.");
    } finally {
      setCheckoutBusy(false);
    }
  }, [checkoutBusy, cart, checkoutNotes]);

  const handleOpenCheckoutModal = useCallback(() => {
    if (!cart || cart.items.length === 0) return;
    const ready = cart.items.filter((item) => item.itemState !== "MARCHANDAGE");
    if (ready.length === 0) {
      setError("Tous les articles sont en marchandage. Attendez la résolution ou annulez les négociations.");
      return;
    }
    setCheckoutModalOpen(true);
  }, [cart]);

  const handleSubmitCheckoutModal = useCallback(async () => {
    if (!cart || cart.items.length === 0) return;
    const ready = cart.items.filter((item) => item.itemState !== "MARCHANDAGE");
    const hasProductReady = ready.some((item) => item.listing.type === "PRODUIT");
    const hasServiceReady = ready.some((item) => item.listing.type === "SERVICE");

    if (hasProductReady && !checkoutForm.deliveryAddress.trim()) {
      setError("Adresse de livraison requise pour les produits.");
      return;
    }
    if (hasServiceReady && !checkoutForm.serviceMaintenanceAddress.trim()) {
      setError("Adresse d'entretien requise pour les services.");
      return;
    }
    if (hasServiceReady && !checkoutForm.serviceExecutionAddress.trim()) {
      setError("Adresse de prestation requise pour les services.");
      return;
    }

    const notesPayload = [
      "CHECKOUT_CONTEXT_V1",
      `payment=${checkoutForm.paymentMethod}`,
      `deliveryAddress=${checkoutForm.deliveryAddress.trim() || '-'}`,
      `serviceMaintenanceAddress=${checkoutForm.serviceMaintenanceAddress.trim() || '-'}`,
      `serviceExecutionAddress=${checkoutForm.serviceExecutionAddress.trim() || '-'}`,
      `buyerNote=${checkoutForm.additionalNote.trim() || '-'}`,
    ].join(" | ");

    await handleCheckout(notesPayload);
  }, [cart, checkoutForm, handleCheckout]);

  const handleViewNegotiation = useCallback(async (negotiationId: string) => {
    try {
      const neg = await negotiations.detail(negotiationId);
      setRespondNeg(neg);
    } catch {
      setError("Impossible de charger la négociation.");
    }
  }, []);

  const handleCancelNegotiation = useCallback(async (negotiationId: string) => {
    if (cancellingNeg) return;
    setCancellingNeg(negotiationId);
    setError(null);
    try {
      await negotiations.cancel(negotiationId);
      // Refresh cart
      const data = await orders.buyerCart();
      setCart(data);
    } catch (err) {
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? "Erreur annulation.") : "Erreur annulation.");
    } finally {
      setCancellingNeg(null);
    }
  }, [cancellingNeg]);

  const handleNegotiationUpdated = useCallback(async (_updated: NegotiationSummary) => {
    setRespondNeg(null);
    // Refresh cart to reflect updated negotiation state
    try {
      const data = await orders.buyerCart();
      setCart(data);
    } catch { /* ignore */ }
  }, []);

  const handleBundleSuccess = useCallback(async () => {
    setBundleTarget(null);
    try {
      const data = await orders.buyerCart();
      setCart(data);
      setNegotiatePopup(true);
    } catch { /* ignore */ }
  }, []);

  const handleSingleNegSuccess = useCallback(async () => {
    setNegotiateItem(null);
    try {
      const data = await orders.buyerCart();
      setCart(data);
      setNegotiatePopup(true);
    } catch { /* ignore */ }
  }, []);

  // Check items breakdown: COMMANDE vs MARCHANDAGE
  const hasNegotiatingItems = cart?.items.some((item) => item.itemState === "MARCHANDAGE") ?? false;
  const readyItemsCount = cart?.items.filter((item) => item.itemState !== "MARCHANDAGE").length ?? 0;
  const negotiatingItemsCount = cart?.items.filter((item) => item.itemState === "MARCHANDAGE").length ?? 0;
  const allNegotiating = readyItemsCount === 0 && negotiatingItemsCount > 0;
  const readyItems = cart?.items.filter((item) => item.itemState !== "MARCHANDAGE") ?? [];
  const hasProductItems = readyItems.some((item) => item.listing.type === "PRODUIT");
  const hasServiceItems = readyItems.some((item) => item.listing.type === "SERVICE");
    const items = cart?.items ?? [];
    const isEmpty = items.length === 0;

    /* ── Group items by seller ── */
    const sellerGroups = useMemo(() => {
      const map = new Map<string, { sellerId: string; sellerName: string; businessSlug: string | null; items: typeof items }>();
      for (const item of items) {
        const key = item.listing.owner.userId;
        if (!map.has(key)) {
          map.set(key, {
            sellerId: key,
            sellerName: item.listing.owner.businessPublicName || item.listing.owner.displayName,
            businessSlug: item.listing.owner.businessSlug,
            items: [],
          });
        }
        map.get(key)!.items.push(item);
      }
      return Array.from(map.values());
    }, [items]);

  /* ── Render: not logged in ── */
  if (!authLoading && !isLoggedIn) {
    return (
      <section className="cart-shell animate-fade-in">
        <header className="cart-hero glass-container">
          <p className="cart-eyebrow">Kin-Sell Panier</p>
          <h1>🛒 Mon panier</h1>
          <p>Connectez-vous pour accéder à votre panier.</p>
          <div className="cart-actions-row">
            <Link to="/login" className="cart-btn cart-btn--primary">Connexion</Link>
            <Link to="/register" className="cart-btn cart-btn--secondary">Créer un compte</Link>
          </div>
        </header>
      </section>
    );
  }

  /* ── Render: loading ── */
  if (loading || authLoading) {
    return (
      <section className="cart-shell animate-fade-in">
        <header className="cart-hero glass-container">
          <p className="cart-eyebrow">Kin-Sell Panier</p>
          <h1>🛒 Mon panier</h1>
        </header>
        <div className="cart-loading glass-container">
          <span className="cart-spinner" />
          <span>Chargement du panier...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="cart-shell animate-fade-in">
      {/* ── Hero header ── */}
      <header className="cart-hero glass-container">
        <p className="cart-eyebrow">Kin-Sell Panier</p>
        <h1>🛒 {t("cart.title")}</h1>
        {!isEmpty && (
          <div className="cart-summary-row">
            <span className="cart-badge">{cart!.itemsCount} article{cart!.itemsCount > 1 ? "s" : ""}</span>
            <span className="cart-badge cart-badge--total">{t("cart.total")}: {formatMoneyFromUsdCents(cart!.subtotalUsdCents)}</span>
          </div>
        )}
        {error && <div className="cart-feedback cart-feedback--error">{error}</div>}
        {success && <div className="cart-feedback cart-feedback--ok">{success}</div>}
      </header>

      {/* ── Empty state ── */}
      {isEmpty && !success && (
        <div className="cart-empty glass-container">
          <span className="cart-empty-icon">🛒</span>
          <h2>{t("cart.empty")}</h2>
          <p>{t("cart.emptyDesc")}</p>
          <div className="cart-actions-row">
            <Link to="/explorer" className="cart-btn cart-btn--primary">{t("cart.emptyCta")}</Link>
            <Link to="/sokin" className="cart-btn cart-btn--secondary">{t("cart.discoverSokin")}</Link>
          </div>
        </div>
      )}

      {/* ── Success post-checkout ── */}
      {success && (
        <div className="cart-empty glass-container">
          <span className="cart-empty-icon">✅</span>
          <h2>{t("cart.orderValidated")}</h2>
          <p>{success}</p>
          <div className="cart-actions-row">
            <button type="button" className="cart-btn cart-btn--primary" onClick={() => { sessionStorage.setItem("ud-section", "purchases"); navigate("/account"); }}>{t("cart.viewOrders")}</button>
            <Link to="/explorer" className="cart-btn cart-btn--secondary">{t("cart.continue")}</Link>
          </div>
        </div>
      )}

      {/* ── Cart items grid ── */}
      {!isEmpty && (
        <div className="cart-items-wrap">
          <div className="cart-grid">
            {sellerGroups.map((group) => (
              <div key={group.sellerId} className="cart-seller-group">
                <div className="cart-seller-header">
                  <div className="cart-seller-info">
                    <span className="cart-seller-icon">🏪</span>
                    {group.businessSlug ? (
                      <Link to={`/business/${group.businessSlug}`} className="cart-seller-link">{group.sellerName}</Link>
                    ) : (
                      <span className="cart-seller-name">{group.sellerName}</span>
                    )}
                    <span className="cart-seller-count">{group.items.length} article{group.items.length > 1 ? "s" : ""}</span>
                  </div>
                  {group.items.length >= 2 && group.items.some((i) => i.listing.isNegotiable !== false && !isCategoryLocked(lockedCats, i.listing.category)) && (
                    <button type="button" className="cart-bundle-neg-btn" onClick={() => {
                      setBundleTarget({
                        sellerId: group.sellerId,
                        sellerName: group.sellerName,
                        listings: group.items.map((i) => ({
                          id: i.listingId,
                          title: i.listing.title,
                          imageUrl: i.listing.imageUrl,
                          type: i.listing.type,
                          priceUsdCents: i.unitPriceUsdCents,
                        })),
                      });
                    }}>
                      {t("cart.bundleNegotiate")}
                    </button>
                  )}
                </div>
                {group.items.map((item) => (
              <article key={item.id} className={`cart-item glass-card ${item.itemState === "MARCHANDAGE" ? "cart-item--negotiating" : ""}`}>
                <div className="cart-item-visual">
                  {item.listing.imageUrl ? (
                    <img src={item.listing.imageUrl} alt={item.listing.title} className="cart-item-img" />
                  ) : (
                    <div className="cart-item-placeholder">
                      {item.listing.type === "SERVICE" ? "🛠" : "📦"}
                    </div>
                  )}
                </div>

                <div className="cart-item-body">
                  <div className="cart-item-top">
                    <h3 className="cart-item-title">{item.listing.title}</h3>
                    <span className="cart-item-type-badge">{item.listing.type === "SERVICE" ? t("common.service") : t("common.product")}</span>
                    <span className={`cart-item-state-badge ${item.itemState === "MARCHANDAGE" ? "cart-item-state-badge--nego" : "cart-item-state-badge--order"}`}>
                      {item.itemState === "MARCHANDAGE" ? t("cart.stateNegotiating") : t("cart.stateOrder")}
                    </span>
                  </div>

                  <p className="cart-item-meta">
                    {item.listing.category} · {item.listing.city}
                  </p>

                  <p className="cart-item-seller">
                    {t("common.seller")}:{" "}
                    {item.listing.owner.businessSlug ? (
                      <Link to={`/business/${item.listing.owner.businessSlug}`} className="cart-item-seller-link">
                        {item.listing.owner.businessPublicName || item.listing.owner.displayName}
                      </Link>
                    ) : (
                      <span>{item.listing.owner.displayName}</span>
                    )}
                  </p>

                  <div className="cart-item-pricing">
                    {/* Prix original barré si négociation active ou acceptée */}
                    {item.negotiationId && item.originalPriceUsdCents !== item.unitPriceUsdCents && (
                      <span className="cart-item-original-price">
                        {formatMoneyFromUsdCents(item.originalPriceUsdCents)}
                      </span>
                    )}
                    <span className="cart-item-unit">
                      {t("cart.unitPrice")}: {formatMoneyFromUsdCents(item.unitPriceUsdCents)}
                    </span>
                    <span className="cart-item-line-total">
                      {formatMoneyFromUsdCents(item.lineTotalUsdCents)}
                    </span>
                  </div>

                  {/* Negotiation status info */}
                  {item.negotiationId && item.negotiationStatus && (
                    <div className={`cart-item-neg-status cart-item-neg-status--${item.negotiationStatus.toLowerCase()}`}>
                      {item.negotiationStatus === "PENDING" && t("negotiation.status.pending")}
                      {item.negotiationStatus === "COUNTERED" && t("negotiation.status.countered")}
                      {item.negotiationStatus === "ACCEPTED" && t("negotiation.status.accepted")}
                      {item.negotiationStatus === "REFUSED" && t("negotiation.status.refused")}
                      {item.negotiationStatus === "EXPIRED" && t("negotiation.status.expired")}
                    </div>
                  )}

                  <div className="cart-item-controls">
                    <div className="cart-qty-group">
                      <button type="button" className="cart-qty-btn" disabled={busy} onClick={() => void handleQuantity(item.id, item.quantity - 1)} aria-label="Réduire quantité">−</button>
                      <span className="cart-qty-value">{item.quantity}</span>
                      <button type="button" className="cart-qty-btn" disabled={busy} onClick={() => void handleQuantity(item.id, item.quantity + 1)} aria-label="Augmenter quantité">+</button>
                    </div>

                    {/* Price edit only for non-negotiating items */}
                    {!item.negotiationId && (
                      <div className="cart-price-group">
                        <input
                          className="cart-price-input"
                          type="number"
                          min={0}
                          placeholder="Prix (cents)"
                          value={draftPrices[item.id] ?? String(item.unitPriceUsdCents)}
                          onChange={(e) => setDraftPrices((p) => ({ ...p, [item.id]: e.target.value }))}
                        />
                        <button type="button" className="cart-price-save" disabled={busy || draftPrices[item.id] === undefined} onClick={() => void handlePriceSave(item.id)} title="Appliquer le prix">
                          💲
                        </button>
                      </div>
                    )}

                    {/* Start single-item negotiation */}
                    {!item.negotiationId && item.listing.isNegotiable !== false && !isCategoryLocked(lockedCats, item.listing.category) && (
                      <button
                        type="button"
                        className="cart-neg-start-btn"
                        onClick={() => setNegotiateItem({
                          id: item.listingId,
                          title: item.listing.title,
                          imageUrl: item.listing.imageUrl,
                          type: item.listing.type,
                          priceUsdCents: item.unitPriceUsdCents,
                          ownerDisplayName: item.listing.owner.businessPublicName || item.listing.owner.displayName,
                        })}
                        title={t("cart.negotiateItem")}
                      >
                        {t("cart.negotiateBtn")}
                      </button>
                    )}

                    {/* Negotiation actions */}
                    {item.negotiationId && item.negotiationStatus === "COUNTERED" && (
                      <button type="button" className="cart-neg-action-btn" onClick={() => void handleViewNegotiation(item.negotiationId!)} title={t("negotiation.respond")}>
                        {t("cart.respondBtn")}
                      </button>
                    )}
                    {item.negotiationId && (item.negotiationStatus === "PENDING" || item.negotiationStatus === "COUNTERED") && (
                      <button
                        type="button"
                        className="cart-neg-cancel-btn"
                        disabled={cancellingNeg === item.negotiationId}
                        onClick={() => void handleCancelNegotiation(item.negotiationId!)}
                        title="Annuler la négociation"
                      >
                        {cancellingNeg === item.negotiationId ? "..." : "✕ Annuler négo"}
                      </button>
                    )}

                    <button type="button" className="cart-remove-btn" disabled={busy} onClick={() => void handleRemove(item.id)} title="Retirer du panier">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                </div>
              </article>
            ))}
              </div>
            ))}
          </div>

          {/* ── Checkout section ── */}
          <div className="cart-checkout glass-container">
            <div className="cart-checkout-summary">
              <div className="cart-checkout-row">
                <span>Articles</span>
                <span>{cart!.itemsCount}</span>
              </div>
              {hasNegotiatingItems && (
                <>
                  <div className="cart-checkout-row cart-checkout-row--ready">
                    <span>📦 Prêts à commander</span>
                    <span>{readyItemsCount}</span>
                  </div>
                  <div className="cart-checkout-row cart-checkout-row--nego">
                    <span>🤝 En marchandage</span>
                    <span>{negotiatingItemsCount}</span>
                  </div>
                </>
              )}
              <div className="cart-checkout-row">
                <span>Devise</span>
                <span>{cart!.currency}</span>
              </div>
              <div className="cart-checkout-row cart-checkout-row--total">
                <span>Total</span>
                <span>{formatMoneyFromUsdCents(cart!.subtotalUsdCents)}</span>
              </div>
            </div>

            {hasNegotiatingItems && !allNegotiating && (
              <div className="cart-partial-info glass-container">
                <span>💡</span>
                <div>
                  <strong>Checkout partiel disponible</strong>
                  <p>Vous pouvez valider les {readyItemsCount} article{readyItemsCount > 1 ? "s" : ""} prêts maintenant. Les {negotiatingItemsCount} article{negotiatingItemsCount > 1 ? "s" : ""} en marchandage resteront dans votre panier.</p>
                </div>
              </div>
            )}

            {allNegotiating && (
              <div className="cart-nego-warning glass-container">
                <span>🤝</span>
                <div>
                  <strong>Tous les articles en négociation</strong>
                  <p>Attendez la résolution des négociations ou annulez-les pour pouvoir commander.</p>
                </div>
              </div>
            )}

            {/* ── IA Commande – Conseil checkout ── */}
            {hasIaOrder && (adviceLoading || checkoutAdviceData) && (
              <div className="cart-ai-panel glass-container">
                <div className="cart-ai-header">
                  <span className="cart-ai-icon">🤖</span>
                  <span className="cart-ai-title">IA Commande</span>
                  {adviceLoading && <span className="cart-ai-loading">Analyse…</span>}
                </div>
                {checkoutAdviceData && (
                  <div className="cart-ai-body">
                    {checkoutAdviceData.bundles.length > 0 && (
                      <div className="cart-ai-section">
                        <strong>📦 Offres groupées</strong>
                        {checkoutAdviceData.bundles.map((b, i) => (
                          <div key={i} className="cart-ai-bundle">
                            <span>{b.title}</span>
                            <span className="cart-ai-bundle-save">-{b.discount}% ({formatMoneyFromUsdCents(b.savingsCents)} économisés)</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {checkoutAdviceData.urgency?.active && (
                      <div className="cart-ai-urgency">⚡ {checkoutAdviceData.urgency.message}</div>
                    )}
                    {checkoutAdviceData.shippingEstimate && (
                      <div className="cart-ai-section">
                        <strong>🚚 Livraison estimée</strong>
                        <p>{checkoutAdviceData.shippingEstimate.minDays}–{checkoutAdviceData.shippingEstimate.maxDays} jours vers {checkoutAdviceData.shippingEstimate.city}</p>
                      </div>
                    )}
                    {checkoutAdviceData.tips.length > 0 && (
                      <div className="cart-ai-section">
                        <strong>💡 Conseils</strong>
                        <ul className="cart-ai-tips">
                          {checkoutAdviceData.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <textarea
              className="cart-checkout-notes"
              placeholder="Notes pour le vendeur (optionnel)..."
              rows={3}
              value={checkoutNotes}
              onChange={(e) => setCheckoutNotes(e.target.value)}
              maxLength={500}
            />

            <button type="button" className="cart-checkout-btn" disabled={checkoutBusy || busy || allNegotiating} onClick={() => void handleOpenCheckoutModal()}>
              {checkoutBusy ? "Validation en cours..." : allNegotiating ? "🤝 Négociations en cours..." : hasNegotiatingItems ? `✅ Commander ${readyItemsCount} article${readyItemsCount > 1 ? "s" : ""}` : "✅ Valider la commande"}
            </button>

            <p className="cart-checkout-info">
              La commande sera envoyée aux vendeurs concernés. Vous pourrez suivre l'état depuis votre{" "}
              <Link to="/account" onClick={() => sessionStorage.setItem("ud-section", "purchases")}>espace d'achat</Link>.
            </p>
          </div>
        </div>
      )}

      {/* ── Continue shopping ── */}
      {!isEmpty && (
        <div className="cart-footer glass-container">
          <Link to="/explorer" className="cart-btn cart-btn--secondary">← Continuer mes achats</Link>
        </div>
      )}

      {/* ── Negotiate info popup ── */}
      {negotiatePopup && (
        <div className="cart-negotiate-overlay" onClick={() => setNegotiatePopup(false)}>
          <div className="cart-negotiate-popup glass-container" onClick={(e) => e.stopPropagation()}>
            <span className="cart-negotiate-icon">🤝</span>
            <h2>Négociation envoyée !</h2>
            <p>Votre proposition de prix a été envoyée au vendeur.<br/>L'article est maintenant en état <strong>MARCHANDAGE</strong> dans votre panier. Le vendeur a <strong>48h</strong> pour répondre.</p>
            <button type="button" className="cart-btn cart-btn--primary" onClick={() => setNegotiatePopup(false)}>Compris !</button>
          </div>
        </div>
      )}

      {/* ── Negotiation respond popup ── */}
      {respondNeg && (
        <NegotiationRespondPopup
          negotiation={respondNeg}
          onClose={() => setRespondNeg(null)}
          onUpdated={handleNegotiationUpdated}
          showAi={localStorage.getItem('ks-ai-advice') !== 'off'}
        />
      )}

      {/* ── Single-item negotiate popup ── */}
      {negotiateItem && (
        <NegotiatePopup
          listing={negotiateItem}
          onClose={() => setNegotiateItem(null)}
          onSuccess={handleSingleNegSuccess}
        />
      )}

      {/* ── Bundle negotiate popup ── */}
      {bundleTarget && (
        <BundleNegotiatePopup
          sellerDisplayName={bundleTarget.sellerName}
          listings={bundleTarget.listings}
          onClose={() => setBundleTarget(null)}
          onSuccess={handleBundleSuccess}
        />
      )}

      {checkoutModalOpen && (
        <div className="cart-checkout-modal-overlay" onClick={() => setCheckoutModalOpen(false)}>
          <div className="cart-checkout-modal glass-container" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmer la commande</h3>
            {hasNegotiatingItems && !allNegotiating && (
              <p className="cart-checkout-modal-partial">
                📦 Seuls les <strong>{readyItemsCount} article{readyItemsCount > 1 ? "s" : ""} prêts</strong> seront commandés. Les {negotiatingItemsCount} en marchandage resteront dans le panier.
              </p>
            )}
            <p>Ajoutez les informations de livraison/prestation et le mode de paiement.</p>

            {hasProductItems && (
              <label className="cart-checkout-modal-field">
                <span>Adresse de livraison (produits)</span>
                <textarea rows={2} value={checkoutForm.deliveryAddress} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, deliveryAddress: e.target.value }))} />
              </label>
            )}

            {hasServiceItems && (
              <>
                <label className="cart-checkout-modal-field">
                  <span>Adresse d'entretien (services)</span>
                  <textarea rows={2} value={checkoutForm.serviceMaintenanceAddress} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, serviceMaintenanceAddress: e.target.value }))} />
                </label>
                <label className="cart-checkout-modal-field">
                  <span>Adresse de prestation (services)</span>
                  <textarea rows={2} value={checkoutForm.serviceExecutionAddress} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, serviceExecutionAddress: e.target.value }))} />
                </label>
              </>
            )}

            <label className="cart-checkout-modal-field">
              <span>Mode de paiement</span>
              <select value={checkoutForm.paymentMethod} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, paymentMethod: e.target.value as "CARD" | "PAYPAL" | "MPESA" | "ORANGE_MONEY" | "CASH_ON_DELIVERY" }))}>
                <option value="CARD">Carte bancaire</option>
                <option value="PAYPAL">PayPal</option>
                <option value="MPESA">M-Pesa</option>
                <option value="ORANGE_MONEY">Orange Money</option>
                <option value="CASH_ON_DELIVERY">Paiement à la livraison</option>
              </select>
            </label>

            <label className="cart-checkout-modal-field">
              <span>Note complémentaire</span>
              <textarea rows={2} value={checkoutForm.additionalNote} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, additionalNote: e.target.value }))} />
            </label>

            <div className="cart-checkout-modal-actions">
              <button type="button" className="cart-btn cart-btn--secondary" onClick={() => setCheckoutModalOpen(false)} disabled={checkoutBusy}>Annuler</button>
              <button type="button" className="cart-btn cart-btn--primary" onClick={() => void handleSubmitCheckoutModal()} disabled={checkoutBusy}>
                {checkoutBusy ? "Validation..." : "✅ Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
