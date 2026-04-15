import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { orders, negotiations, billing, orderAi, resolveMediaUrl, type CartSummary, type NegotiationSummary, type NegotiationStatus, type BillingPlanSummary, type CheckoutAdvice, type OrderSummary, type OrderStatus, ApiError } from "../../lib/api-client";
import { useSocket } from "../../hooks/useSocket";
import { useRealtimeSync } from "../../hooks/useRealtimeSync";
import { NegotiationRespondPopup } from "../negotiations/NegotiationRespondPopup";
import { NegotiatePopup } from "../negotiations/NegotiatePopup";
import { BundleNegotiatePopup, type BundleListingItem } from "../negotiations/BundleNegotiatePopup";
import { useLockedCategories, isCategoryLocked } from "../../hooks/useLockedCategories";
import LocationPicker from "../../components/LocationPicker";
import type { StructuredLocation } from "../../lib/api-client";
import { extractValidationCodeFromQrPayload } from "../../utils/order-validation";
import { SK_AI_ADVICE, SK_AI_COMMANDE } from "../../shared/constants/storage-keys";
import { useFeatureGate } from "../../shared/hooks/useFeatureGate";
import TutorialOverlay, { useTutorial, TutorialRelaunchBtn } from '../../components/TutorialOverlay';
import { cartSteps, cartEmptySteps } from '../../components/tutorial-steps';
import "./cart.css";

export function CartPage() {
  const { isLoggedIn, isLoading: authLoading, user } = useAuth();
  const { t, formatMoneyFromUsdCents } = useLocaleCurrency();
  const lockedCats = useLockedCategories();
  const navigate = useNavigate();
  const { on, off } = useSocket();

  const [cart, setCart] = useState<CartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [aiCommandeCollapsed, setAiCommandeCollapsed] = useState(false);
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
  const [negContextMsg, setNegContextMsg] = useState<Record<string, string>>({});
  const [negPriceFlash, setNegPriceFlash] = useState<Record<string, boolean>>({});
  const [activePlan, setActivePlan] = useState<BillingPlanSummary | null>(null);
  const [checkoutAdviceData, setCheckoutAdviceData] = useState<CheckoutAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    deliveryAddress: "",
    serviceMaintenanceAddress: "",
    serviceExecutionAddress: "",
    paymentMethod: "CASH_ON_DELIVERY" as "PAYPAL" | "CASH_ON_DELIVERY",
    additionalNote: "",
    deliveryCity: "",
    deliveryCountry: "",
    deliveryLatitude: null as number | null,
    deliveryLongitude: null as number | null,
    deliveryPlaceId: "",
    deliveryFormattedAddress: "",
  });

  /* ── Buyer order history ── */
  const [buyerOrders, setBuyerOrders] = useState<OrderSummary[]>([]);
  const [buyerOrdersFilter, setBuyerOrdersFilter] = useState<OrderStatus | "">("");
  const [buyerOrdersLoading, setBuyerOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null);

  /* ── Buyer negotiation history ── */
  const [buyerNegos, setBuyerNegos] = useState<NegotiationSummary[]>([]);
  const [buyerNegosFilter, setBuyerNegosFilter] = useState<NegotiationStatus | "">("");
  const [buyerNegosLoading, setBuyerNegosLoading] = useState(false);
  const [selectedNego, setSelectedNego] = useState<NegotiationSummary | null>(null);
  const [historyTab, setHistoryTab] = useState<"orders" | "negotiations">("orders");

  /* ── Checkout celebration ── */
  const [checkoutDone, setCheckoutDone] = useState(false);
  const [checkoutDoneMsg, setCheckoutDoneMsg] = useState("");
  const [checkoutStep, setCheckoutStep] = useState(0); // 0=form, 1=confirming, 2=done

  /* ── Buyer delivery confirmation state ── */
  const [buyerConfirmOrderId, setBuyerConfirmOrderId] = useState<string | null>(null);
  const [buyerConfirmCode, setBuyerConfirmCode] = useState("");
  const [buyerConfirmBusy, setBuyerConfirmBusy] = useState(false);
  const [buyerConfirmMode, setBuyerConfirmMode] = useState<"manual" | "scan">("manual");
  const [buyerConfirmScanError, setBuyerConfirmScanError] = useState<string | null>(null);
  const [buyerConfirmScanMessage, setBuyerConfirmScanMessage] = useState<string | null>(null);

  /* ── QR scanner for buyer delivery confirmation ── */
  useEffect(() => {
    if (!buyerConfirmOrderId || buyerConfirmMode !== 'scan') return;

    let scanner: any = null;
    let cancelled = false;

    setBuyerConfirmScanError(null);
    setBuyerConfirmScanMessage(null);

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        scanner = new Html5Qrcode('ks-cart-validation-reader', { verbose: false });
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
          (decodedText: string) => {
            const scannedCode = extractValidationCodeFromQrPayload(decodedText, buyerConfirmOrderId);
            if (!scannedCode) {
              setBuyerConfirmScanError(t('cart.invalidCode'));
              return;
            }
            setBuyerConfirmCode(scannedCode);
            setBuyerConfirmMode('manual');
            setBuyerConfirmScanMessage('Code détecté !');
            setBuyerConfirmScanError(null);
          },
          () => {}
        );

        if (!cancelled) {
          setBuyerConfirmScanMessage('Scanner prêt — présentez le QR code');
        }
      } catch {
        if (!cancelled) {
          setBuyerConfirmScanError('Impossible d\'accéder à la caméra');
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      if (scanner) {
        void scanner.stop().catch(() => {}).finally(() => { scanner?.clear(); });
      }
    };
  }, [buyerConfirmMode, buyerConfirmOrderId, t]);

  const reloadCart = useCallback(async () => {
    try {
      const data = await orders.buyerCart();
      setCart(data);
      setError(null);
    } catch (err) {
      setCart(null);
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? t('cart.loadingCart')) : t('cart.loadingCart'));
    }
  }, [t]);

  /* ── Show negotiate popup if redirected from public profile ── */
  useEffect(() => {
    if (sessionStorage.getItem('ks-negotiate') === '1') {
      sessionStorage.removeItem('ks-negotiate');
      setNegotiatePopup(true);
    }
  }, []);

  /* ── Fetch cart ── */
  const loadCart = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const data = await orders.buyerCart();
      setCart(data);
      setError(null);
    } catch (err) {
      setCart(null);
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? t('cart.loadingCart')) : t('cart.loadingCart'));
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, t]);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) { setLoading(false); return; }
    void loadCart();
  }, [isLoggedIn, authLoading, loadCart]);

  /* ── Realtime: cart/order socket events → refetch; fallback polling 120s ── */
  useRealtimeSync({
    channels: ["cart", "orders"],
    onInvalidate: useCallback(() => { void loadCart(); }, [loadCart]),
    onReconnect: useCallback(() => { void loadCart(); }, [loadCart]),
    onVisibilityResync: useCallback(() => { void loadCart(); }, [loadCart]),
    visibilityThresholdMs: 10_000,
    enabled: isLoggedIn,
  });

  // Fallback polling réduit : 120s au lieu de 30s (socket couvre le temps réel)
  useEffect(() => {
    if (!isLoggedIn) return;
    const poll = setInterval(() => { void loadCart(); }, 120_000);
    return () => clearInterval(poll);
  }, [isLoggedIn, loadCart]);

  /* ── Fetch buyer orders ── */
  const loadBuyerOrders = useCallback(async () => {
    if (!isLoggedIn) return;
    setBuyerOrdersLoading(true);
    try {
      const data = await orders.buyerOrders({ limit: 50 });
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const ordersList = Array.isArray(data.orders) ? data.orders : [];
      setBuyerOrders(ordersList.filter((o) => new Date(o.createdAt).getTime() >= thirtyDaysAgo));
    } catch {
      setBuyerOrders([]);
    } finally {
      setBuyerOrdersLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadBuyerOrders();
  }, [loadBuyerOrders]);

  /* ── Fetch buyer negotiations ── */
  const loadBuyerNegos = useCallback(async () => {
    if (!isLoggedIn) return;
    setBuyerNegosLoading(true);
    try {
      const data = await negotiations.buyerList({ limit: 50 });
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
      const negosList = Array.isArray(data.negotiations) ? data.negotiations : [];
      setBuyerNegos(negosList.filter((n) => new Date(n.createdAt).getTime() >= sixtyDaysAgo));
    } catch {
      setBuyerNegos([]);
    } finally {
      setBuyerNegosLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void loadBuyerNegos();
  }, [loadBuyerNegos]);

  const filteredBuyerNegos = useMemo(() => {
    if (!buyerNegosFilter) return buyerNegos;
    return buyerNegos.filter((n) => n.status === buyerNegosFilter);
  }, [buyerNegos, buyerNegosFilter]);

  const NEGO_STATUS_LABEL: Record<string, string> = {
    PENDING: "⏳ En attente",
    COUNTERED: "🔄 Contre-offre",
    ACCEPTED: "✅ Accepté",
    REFUSED: "❌ Refusé",
    EXPIRED: "⏰ Expiré",
  };
  const NEGO_ACTIVE_STATUSES: NegotiationStatus[] = ["PENDING", "COUNTERED"];

  const activeNegos = useMemo(
    () => buyerNegos.filter((n) => NEGO_ACTIVE_STATUSES.includes(n.status)),
    [buyerNegos]
  );
  const resolvedNegos = useMemo(() => {
    const base = buyerNegos.filter((n) => !NEGO_ACTIVE_STATUSES.includes(n.status));
    if (!buyerNegosFilter) return base;
    return base.filter((n) => n.status === buyerNegosFilter);
  }, [buyerNegos, buyerNegosFilter]);

  const filteredBuyerOrders = useMemo(() => {
    if (!buyerOrdersFilter) return buyerOrders;
    return buyerOrders.filter((o) => o.status === buyerOrdersFilter);
  }, [buyerOrders, buyerOrdersFilter]);

  /* ── Séparer commandes actives (dans le panier) vs historique (terminées) ── */
  const ACTIVE_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"];
  const HISTORY_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELED"];

  const activeOrders = useMemo(
    () => buyerOrders.filter((o) => ACTIVE_STATUSES.includes(o.status)),
    [buyerOrders]
  );
  const historyOrders = useMemo(() => {
    const base = buyerOrders.filter((o) => HISTORY_STATUSES.includes(o.status));
    if (!buyerOrdersFilter) return base;
    return base.filter((o) => o.status === buyerOrdersFilter);
  }, [buyerOrders, buyerOrdersFilter]);

  const STATUS_LABEL_KEY: Record<string, string> = {
    PENDING: 'order.status.pending',
    CONFIRMED: 'order.status.confirmed',
    PROCESSING: 'order.status.processing',
    SHIPPED: 'order.status.shipped',
    DELIVERED: 'order.status.delivered',
    CANCELED: 'order.status.canceled',
  };

  const statusLabel = (status: string) => t(STATUS_LABEL_KEY[status] ?? status);

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'DELIVERED': return 'cart-status-badge cart-status-badge--success';
      case 'CANCELED': return 'cart-status-badge cart-status-badge--danger';
      case 'SHIPPED': case 'PROCESSING': return 'cart-status-badge cart-status-badge--warning';
      default: return 'cart-status-badge';
    }
  };

  const negoBadgeClass = (status: string) => {
    switch (status) {
      case 'ACCEPTED': return 'cart-status-badge cart-status-badge--success';
      case 'REFUSED': return 'cart-status-badge cart-status-badge--danger';
      case 'EXPIRED': return 'cart-status-badge cart-status-badge--danger';
      case 'COUNTERED': return 'cart-status-badge cart-status-badge--info';
      default: return 'cart-status-badge cart-status-badge--warning';
    }
  };

  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const handleNegotiationUpdated = (payload: {
      type: 'NEGOTIATION_UPDATED';
      action: 'CREATED' | 'RESPONDED' | 'CANCELED' | 'JOINED' | 'BUNDLE_CREATED';
      negotiationId: string;
      buyerUserId: string;
      sellerUserId: string;
      sourceUserId: string;
      updatedAt: string;
      respondAction?: 'ACCEPT' | 'REFUSE' | 'COUNTER';
      respondedByDisplayName?: string | null;
    }) => {
      if (payload.buyerUserId !== user.id && payload.sellerUserId !== user.id) return;
      if (respondNeg?.id === payload.negotiationId && payload.sourceUserId !== user.id) {
        setRespondNeg(null);
      }
      // Context messages for refusal/counter/accept
      if (payload.action === 'RESPONDED' && payload.respondAction && payload.sourceUserId !== user.id) {
        const who = payload.respondedByDisplayName ?? 'L\'autre partie';
        const isBuyer = user.id === payload.buyerUserId;
        let msg = '';
        if (payload.respondAction === 'REFUSE') {
          msg = isBuyer
            ? `${who} a refusé votre offre, l'article est en attente de validation dans le panier`
            : `${who} a refusé votre offre et mis fin au marchandage, vous pouvez soit valider la commande soit vider le panier`;
        } else if (payload.respondAction === 'COUNTER') {
          msg = `${who} a proposé un nouveau prix 🔄`;
          setNegPriceFlash((p) => ({ ...p, [payload.negotiationId]: true }));
          setTimeout(() => setNegPriceFlash((p) => ({ ...p, [payload.negotiationId]: false })), 3000);
        } else if (payload.respondAction === 'ACCEPT') {
          msg = `${who} a accepté votre offre ✅ Commande créée automatiquement`;
        }
        if (msg) {
          setNegContextMsg((p) => ({ ...p, [payload.negotiationId]: msg }));
          setTimeout(() => setNegContextMsg((p) => { const n = { ...p }; delete n[payload.negotiationId]; return n; }), 12000);
        }
      }
      void reloadCart();
      void loadBuyerNegos();
    };

    on('negotiation:updated', handleNegotiationUpdated);
    return () => {
      off('negotiation:updated', handleNegotiationUpdated);
    };
  }, [isLoggedIn, user, on, off, reloadCart, loadBuyerNegos, respondNeg?.id]);

  /* ── Fetch billing plan ── */
  useEffect(() => {
    if (!isLoggedIn || authLoading) return;
    let cancelled = false;
    billing.myPlan().then((p) => { if (!cancelled) setActivePlan(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isLoggedIn, authLoading]);

  /* ── IA Commande: fetch checkout advice when plan allows ── */
  const aiCommandeOn = useMemo(() => localStorage.getItem(SK_AI_COMMANDE) !== 'off', []);
  const { hasIaOrder } = useFeatureGate(activePlan);
  const iaOrderActive = aiCommandeOn && hasIaOrder;

  useEffect(() => {
    if (!iaOrderActive || !cart?.id) return;
    let cancelled = false;
    setAdviceLoading(true);
    orderAi.checkoutAdvice(cart.id)
      .then((data) => { if (!cancelled) setCheckoutAdviceData(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAdviceLoading(false); });
    return () => { cancelled = true; };
  }, [iaOrderActive, cart?.id]);

  /* ── Handlers ── */
  const handleQuantity = useCallback(async (itemId: string, next: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Optimistic update — instant UI feedback
    const prevCart = cart;
    if (next < 1) {
      setCart((c) => c ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c);
    } else {
      setCart((c) => c ? { ...c, items: c.items.map((i) => i.id === itemId ? { ...i, quantity: next } : i) } : c);
    }
    try {
      if (next < 1) {
        const updated = await orders.removeCartItem(itemId);
        setCart(updated);
      } else {
        const updated = await orders.updateCartItem(itemId, { quantity: next });
        setCart(updated);
      }
    } catch (err) {
      setCart(prevCart); // rollback on error
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? t('cart.qtyError')) : t('cart.qtyError'));
    } finally {
      setBusy(false);
    }
  }, [busy, cart]);

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

  const handleCheckout = useCallback(async (notes?: string, deliveryData?: { deliveryAddress?: string; deliveryCity?: string; deliveryCountry?: string; deliveryLatitude?: number; deliveryLongitude?: number; deliveryPlaceId?: string; deliveryFormattedAddress?: string }) => {
    if (checkoutBusy || !cart || cart.items.length === 0) return;
    setCheckoutBusy(true);
    setError(null);
    setSuccess(null);
    try {
      setCheckoutStep(1);
      const payloadNotes = [notes, checkoutNotes.trim()].filter(Boolean).join(" | ");
      const result = await orders.checkoutBuyerCart({
        ...(payloadNotes ? { notes: payloadNotes } : {}),
        ...deliveryData,
      });
      setCheckoutStep(2);
      const msg = result.message || t('cart.orderSuccess');
      setCheckoutDoneMsg(msg);
      setSuccess(msg);
      setCart(null);
      setCheckoutNotes("");
      setCheckoutForm({
        deliveryAddress: "",
        serviceMaintenanceAddress: "",
        serviceExecutionAddress: "",
        paymentMethod: "CASH_ON_DELIVERY",
        additionalNote: "",
        deliveryCity: "",
        deliveryCountry: "",
        deliveryLatitude: null,
        deliveryLongitude: null,
        deliveryPlaceId: "",
        deliveryFormattedAddress: "",
      });
      setCheckoutModalOpen(false);
      setCheckoutDone(true);
      // Redirect to purchases tab after 3.5s
      setTimeout(() => { setCheckoutDone(false); navigate("/account?section=purchases"); }, 3500);
    } catch (err) {
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? t('cart.checkoutError')) : t('cart.checkoutError'));
    } finally {
      setCheckoutBusy(false);
    }
  }, [checkoutBusy, cart, checkoutNotes]);

  const handleOpenCheckoutModal = useCallback(() => {
    if (!cart || cart.items.length === 0) return;
    const ready = cart.items.filter((item) => item.itemState !== "MARCHANDAGE");
    if (ready.length === 0) {
      setError(t('cart.allInNegotiation'));
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

    await handleCheckout(notesPayload, {
      deliveryAddress: checkoutForm.deliveryAddress.trim() || undefined,
      deliveryCity: checkoutForm.deliveryCity.trim() || undefined,
      deliveryCountry: checkoutForm.deliveryCountry.trim() || undefined,
      deliveryLatitude: checkoutForm.deliveryLatitude ?? undefined,
      deliveryLongitude: checkoutForm.deliveryLongitude ?? undefined,
      deliveryPlaceId: checkoutForm.deliveryPlaceId.trim() || undefined,
      deliveryFormattedAddress: checkoutForm.deliveryFormattedAddress.trim() || undefined,
    });
  }, [cart, checkoutForm, handleCheckout]);

  const handleViewNegotiation = useCallback(async (negotiationId: string) => {
    try {
      const neg = await negotiations.detail(negotiationId);
      setRespondNeg(neg);
    } catch {
      setError(t('cart.loadNegError'));
    }
  }, []);

  const handleCancelNegotiation = useCallback(async (negotiationId: string) => {
    if (cancellingNeg) return;
    setCancellingNeg(negotiationId);
    setError(null);
    try {
      await negotiations.cancel(negotiationId);
      await reloadCart();
    } catch (err) {
      setError(err instanceof ApiError ? ((err.data as { error?: string })?.error ?? t('cart.cancelError')) : t('cart.cancelError'));
    } finally {
      setCancellingNeg(null);
    }
  }, [cancellingNeg]);

  const handleNegotiationUpdated = useCallback(async (updated: NegotiationSummary) => {
    setRespondNeg(null);
    await reloadCart();
    // Si la négo a été acceptée, recharger aussi les commandes
    if (updated.status === 'ACCEPTED') {
      void loadBuyerOrders();
      setSuccess(t('cart.negoAcceptedOrderCreated'));
    }
  }, [reloadCart, loadBuyerOrders, t]);

  const handleBundleSuccess = useCallback(async () => {
    setBundleTarget(null);
    await reloadCart();
    setNegotiatePopup(true);
  }, [reloadCart]);

  const handleSingleNegSuccess = useCallback(async () => {
    setNegotiateItem(null);
    await reloadCart();
    setNegotiatePopup(true);
  }, [reloadCart]);

  /* ── Buyer confirm delivery ── */
  const handleBuyerConfirm = useCallback(async () => {
    if (!buyerConfirmOrderId || !buyerConfirmCode.trim()) return;
    setBuyerConfirmBusy(true);
    setError(null);
    try {
      await orders.buyerConfirmDelivery(buyerConfirmOrderId, { code: buyerConfirmCode.trim() });
      setSuccess(t('cart.deliveryConfirmed'));
      setBuyerConfirmOrderId(null);
      setBuyerConfirmCode("");
      setBuyerConfirmMode("manual");
      setBuyerConfirmScanError(null);
      void loadBuyerOrders();
    } catch (err) {
      const msg = err instanceof ApiError
        ? ((err.data as { error?: string })?.error ?? t('cart.invalidCode'))
        : t('cart.invalidCode');
      setError(msg);
    } finally {
      setBuyerConfirmBusy(false);
    }
  }, [buyerConfirmOrderId, buyerConfirmCode, loadBuyerOrders, t]);

  const closeBuyerConfirmModal = useCallback(() => {
    setBuyerConfirmOrderId(null);
    setBuyerConfirmCode("");
    setBuyerConfirmMode("manual");
    setBuyerConfirmScanError(null);
    setBuyerConfirmScanMessage(null);
  }, []);

  // Check items breakdown: COMMANDE vs MARCHANDAGE
  const cartItems = cart?.items ?? [];
  const hasNegotiatingItems = cartItems.some((item) => item.itemState === "MARCHANDAGE");
  const tutorial = useTutorial('cart');
  const readyItemsCount = cartItems.filter((item) => item.itemState !== "MARCHANDAGE").length;
  const negotiatingItemsCount = cartItems.filter((item) => item.itemState === "MARCHANDAGE").length;
  const allNegotiating = readyItemsCount === 0 && negotiatingItemsCount > 0;
  const readyItems = cartItems.filter((item) => item.itemState !== "MARCHANDAGE");
  const hasProductItems = readyItems.some((item) => item.listing.type === "PRODUIT");
  const hasServiceItems = readyItems.some((item) => item.listing.type === "SERVICE");
    const items = cartItems;
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
          <p className="cart-eyebrow">{t('cart.eyebrow')}</p>
          <h1>🛒 {t('cart.title')}</h1>
          <p>{t('common.loginRequired')}</p>
          <div className="cart-actions-row">
            <Link to="/login" className="cart-btn cart-btn--primary">{t('auth.login')}</Link>
            <Link to="/register" className="cart-btn cart-btn--secondary">{t('auth.register')}</Link>
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
          <span>{t('cart.loadingCart')}</span>
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
            <button type="button" className="cart-btn cart-btn--primary" onClick={() => navigate("/cart")}>{t("cart.viewOrders")}</button>
            <Link to="/explorer" className="cart-btn cart-btn--secondary">{t("cart.continue")}</Link>
          </div>
        </div>
      )}

      {/* ── Active buyer orders (PENDING → SHIPPED) — affiché EN HAUT pour visibilité mobile ── */}
      {isLoggedIn && activeOrders.length > 0 && (
        <div className="cart-history cart-active-orders glass-container">
          <div className="cart-history-head">
            <h3 className="cart-history-title">📦 {t('cart.activeOrdersTitle')}</h3>
            <span className="cart-history-hint">{activeOrders.length} {t('cart.inProgress')}</span>
          </div>
          <div className="cart-history-list">
            {activeOrders.map((order) => (
              <div
                key={order.id}
                className="cart-history-card glass-card"
                onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                style={{ cursor: 'pointer' }}
              >
                <div className="cart-history-card-head">
                  <span className="cart-history-card-id">#{order.id.slice(0, 8).toUpperCase()}</span>
                  <span className={statusBadgeClass(order.status)}>{statusLabel(order.status)}</span>
                </div>
                <div className="cart-history-card-body">
                  <span className="cart-history-card-amount">{formatMoneyFromUsdCents(order.totalUsdCents)}</span>
                  <span className="cart-history-card-meta">
                    {order.itemsCount} article{order.itemsCount > 1 ? 's' : ''} · {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                  </span>
                  {order.autoExpireAt && (
                    <span className="ud-ord-expire-deadline" style={{ display: 'block', marginTop: '4px' }}>⏳ Expire le {new Date(order.autoExpireAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
                  )}
                </div>
                <div className="cart-history-card-actions" onClick={(e) => e.stopPropagation()}>
                  {(order.status === 'PROCESSING' || order.status === 'SHIPPED') && (
                    <button
                      type="button"
                      className="cart-btn cart-btn--primary"
                      style={{ fontSize: '.8rem', padding: '6px 12px' }}
                      onClick={() => {
                        setBuyerConfirmOrderId(order.id);
                        setBuyerConfirmCode("");
                        setBuyerConfirmMode("manual");
                        setBuyerConfirmScanError(null);
                      }}
                    >
                      📬 {t('cart.confirmReception')}
                    </button>
                  )}
                </div>

                {selectedOrder?.id === order.id && (
                  <div className="cart-history-card-detail">
                    {(order.items ?? []).map((item) => (
                      <div key={item.id} className="cart-history-item">
                        {item.imageUrl ? (
                          <img src={resolveMediaUrl(item.imageUrl)} alt={item.title} className="cart-history-item-img" />
                        ) : (
                          <span className="cart-history-item-ph">{item.listingType === 'SERVICE' ? '🛠' : '📦'}</span>
                        )}
                        <div className="cart-history-item-info">
                          <strong>{item.title}</strong>
                          <span>{item.category} · x{item.quantity}</span>
                        </div>
                        <span className="cart-history-item-price">{formatMoneyFromUsdCents(item.lineTotalUsdCents)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
                    <img src={resolveMediaUrl(item.listing.imageUrl)} alt={item.listing.title} className="cart-item-img" />
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

                  {/* Deadline 24h après refus de négociation */}
                  {item.negotiationStatus === "REFUSED" && (item as any).refusalDeadline && (
                    <div className="cart-item-refusal-deadline">
                      <span>⏰</span>
                      <span>Commandez au prix original avant : <strong>{new Date((item as any).refusalDeadline).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</strong></span>
                    </div>
                  )}

                  {/* Animated new price on counter */}
                  {item.negotiationId && negPriceFlash[item.negotiationId] && (
                    <div className="cart-neg-price-flash">
                      Nouveau prix : <strong>{formatMoneyFromUsdCents(item.unitPriceUsdCents)}</strong>
                    </div>
                  )}

                  {/* Context message after negotiation response */}
                  {item.negotiationId && negContextMsg[item.negotiationId] && (
                    <div className={`cart-neg-context-msg cart-neg-context-msg--${item.negotiationStatus?.toLowerCase() ?? 'info'}`}>
                      {negContextMsg[item.negotiationId]}
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

            {/* ── IA Commande – Conseil checkout (collapsible + animated) ── */}
            {iaOrderActive && (adviceLoading || checkoutAdviceData) && (
              <div className={`cart-ai-panel glass-container${checkoutAdviceData && !adviceLoading ? ' cart-ai-panel--ready' : ''}${adviceLoading ? ' cart-ai-panel--loading' : ''}`}>
                <button type="button" className="cart-ai-header" onClick={() => setAiCommandeCollapsed(!aiCommandeCollapsed)}>
                  <span className="cart-ai-icon">🤖</span>
                  <span className="cart-ai-title">IA Commande</span>
                  {adviceLoading && <span className="cart-ai-loading-dots"><span /><span /><span /></span>}
                  {checkoutAdviceData && !adviceLoading && aiCommandeCollapsed && <span className="cart-ai-dot" />}
                  <span className="cart-ai-arrow">{aiCommandeCollapsed ? '▲' : '▼'}</span>
                </button>
                {!aiCommandeCollapsed && checkoutAdviceData && (
                  <div className="cart-ai-body cart-ai-body--animated">
                    {(checkoutAdviceData.bundleSuggestions ?? []).length > 0 && (
                      <div className="cart-ai-section">
                        <strong>📦 Suggestions</strong>
                        {(checkoutAdviceData.bundleSuggestions ?? []).map((b, i) => (
                          <div key={i} className="cart-ai-bundle">
                            <span>{b.title}</span>
                            <span className="cart-ai-bundle-save">{formatMoneyFromUsdCents(b.priceUsdCents)} — {b.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {checkoutAdviceData.discountTrigger?.message && (
                      <div className={`cart-ai-urgency${checkoutAdviceData.discountTrigger.available ? ' cart-ai-urgency--pulse' : ''}`}>
                        💰 {checkoutAdviceData.discountTrigger.message}
                      </div>
                    )}
                    {(checkoutAdviceData.urgencySignals ?? []).length > 0 && (
                      <div className="cart-ai-section">
                        {(checkoutAdviceData.urgencySignals ?? []).map((s, i) => (
                          <div key={i} className="cart-ai-urgency cart-ai-urgency--pulse">⚡ {s.message}</div>
                        ))}
                      </div>
                    )}
                    {checkoutAdviceData.estimatedDeliveryHours && (
                      <div className="cart-ai-section">
                        <strong>🚚 Livraison estimée</strong>
                        <p>{Math.round(checkoutAdviceData.estimatedDeliveryHours.min / 24)}–{Math.round(checkoutAdviceData.estimatedDeliveryHours.max / 24)} jours</p>
                      </div>
                    )}
                    {checkoutAdviceData.paymentOptimization && (
                      <div className="cart-ai-section">
                        <strong>💡 Conseil</strong>
                        <p>{checkoutAdviceData.paymentOptimization}</p>
                      </div>
                    )}
                  </div>
                )}
                {!aiCommandeCollapsed && adviceLoading && (
                  <div className="cart-ai-body">
                    <div className="cart-ai-skeleton"><div className="cart-ai-skeleton-line" style={{ width: '75%' }} /><div className="cart-ai-skeleton-line" style={{ width: '55%' }} /><div className="cart-ai-skeleton-line" style={{ width: '85%' }} /></div>
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

            <button type="button" className={`cart-checkout-btn${checkoutBusy ? ' cart-checkout-btn--busy' : ''}${!allNegotiating && readyItemsCount > 0 ? ' cart-checkout-btn--ready' : ''}`} disabled={checkoutBusy || busy || allNegotiating} onClick={() => void handleOpenCheckoutModal()}>
              {checkoutBusy ? (
                <span className="cart-checkout-btn-sending">
                  <span className="cart-checkout-btn-dots"><span /><span /><span /></span> Validation…
                </span>
              ) : allNegotiating ? "🤝 Négociations en cours..." : hasNegotiatingItems ? `✅ Commander ${readyItemsCount} article${readyItemsCount > 1 ? "s" : ""}` : "✅ Valider la commande"}
            </button>

            <p className="cart-checkout-info">
              La commande sera envoyée aux vendeurs concernés. Vous pourrez suivre l'état depuis votre{" "}
              <Link to="/cart">panier</Link>.
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

      {/* ── Historique complet: onglets Commandes + Marchandages ── */}
      {isLoggedIn && (
        <div className="cart-history glass-container">
          <div className="cart-history-head">
            <div className="cart-history-tabs">
              <button
                type="button"
                className={`cart-history-tab ${historyTab === 'orders' ? 'cart-history-tab--active' : ''}`}
                onClick={() => setHistoryTab('orders')}
              >
                📋 Commandes
              </button>
              <button
                type="button"
                className={`cart-history-tab ${historyTab === 'negotiations' ? 'cart-history-tab--active' : ''}`}
                onClick={() => setHistoryTab('negotiations')}
              >
                🤝 Marchandages {activeNegos.length > 0 && <span className="cart-history-tab-badge">{activeNegos.length}</span>}
              </button>
            </div>

            {historyTab === 'orders' && (
              <select
                className="cart-history-filter"
                value={buyerOrdersFilter}
                onChange={(e) => setBuyerOrdersFilter(e.target.value as OrderStatus | "")}
              >
                <option value="">Tous les statuts</option>
                <option value="DELIVERED">📬 Livrée</option>
                <option value="CANCELED">❌ Annulée</option>
              </select>
            )}
            {historyTab === 'negotiations' && (
              <select
                className="cart-history-filter"
                value={buyerNegosFilter}
                onChange={(e) => setBuyerNegosFilter(e.target.value as NegotiationStatus | "")}
              >
                <option value="">Tous les statuts</option>
                <option value="ACCEPTED">✅ Accepté</option>
                <option value="REFUSED">❌ Refusé</option>
                <option value="EXPIRED">⏰ Expiré</option>
                <option value="COUNTERED">🔄 Contre-offre</option>
                <option value="PENDING">⏳ En attente</option>
              </select>
            )}
          </div>

          {/* ── Onglet Commandes ── */}
          {historyTab === 'orders' && (
            <>
              {buyerOrdersLoading ? (
                <div className="cart-history-loading">
                  <span className="cart-spinner" />
                  <span>Chargement…</span>
                </div>
              ) : historyOrders.length === 0 ? (
                <div className="cart-history-empty">
                  <span style={{ fontSize: '1.8rem' }}>📭</span>
                  <p>Aucune commande terminée récente</p>
                </div>
              ) : (
                <div className="cart-history-list">
                  {historyOrders.map((order) => (
                    <div
                      key={order.id}
                      className="cart-history-card glass-card"
                      onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="cart-history-card-head">
                        <span className="cart-history-card-id">#{order.id.slice(0, 8).toUpperCase()}</span>
                        <span className={statusBadgeClass(order.status)}>{statusLabel(order.status)}</span>
                      </div>
                      <div className="cart-history-card-body">
                        <span className="cart-history-card-amount">{formatMoneyFromUsdCents(order.totalUsdCents)}</span>
                        <span className="cart-history-card-meta">
                          {order.itemsCount} article{order.itemsCount > 1 ? 's' : ''} · {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                      {order.seller && (
                        <div className="cart-history-card-seller">
                          Vendeur : {order.seller.businessPublicName ?? order.seller.displayName}
                        </div>
                      )}
                      {order.notes && (
                        <div className="cart-history-card-notes">{order.notes}</div>
                      )}

                      {selectedOrder?.id === order.id && (
                        <div className="cart-history-card-detail">
                          {(order.items ?? []).map((item) => (
                            <div key={item.id} className="cart-history-item">
                              {item.imageUrl ? (
                                <img src={resolveMediaUrl(item.imageUrl)} alt={item.title} className="cart-history-item-img" />
                              ) : (
                                <span className="cart-history-item-ph">{item.listingType === 'SERVICE' ? '🛠' : '📦'}</span>
                              )}
                              <div className="cart-history-item-info">
                                <strong>{item.title}</strong>
                                <span>{item.category} · x{item.quantity}</span>
                              </div>
                              <span className="cart-history-item-price">{formatMoneyFromUsdCents(item.lineTotalUsdCents)}</span>
                            </div>
                          ))}
                          <div className="cart-history-card-dates">
                            <span>Créée : {new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            {order.autoExpireAt && <span className="ud-ord-expire-deadline">⏳ Expire le {new Date(order.autoExpireAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
                            {order.deliveredAt && <span>Livrée : {new Date(order.deliveredAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                            {order.canceledAt && <span>Annulée : {new Date(order.canceledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Onglet Marchandages ── */}
          {historyTab === 'negotiations' && (
            <>
              {buyerNegosLoading ? (
                <div className="cart-history-loading">
                  <span className="cart-spinner" />
                  <span>Chargement…</span>
                </div>
              ) : filteredBuyerNegos.length === 0 ? (
                <div className="cart-history-empty">
                  <span style={{ fontSize: '1.8rem' }}>🤝</span>
                  <p>Aucun marchandage trouvé</p>
                </div>
              ) : (
                <div className="cart-history-list">
                  {filteredBuyerNegos.map((nego) => {
                    const offers = Array.isArray(nego.offers) ? nego.offers : [];
                    const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;
                    const isActive = NEGO_ACTIVE_STATUSES.includes(nego.status);
                    return (
                      <div
                        key={nego.id}
                        className={`cart-history-card glass-card ${isActive ? 'cart-history-card--active-nego' : ''}`}
                        onClick={() => setSelectedNego(selectedNego?.id === nego.id ? null : nego)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="cart-history-card-head">
                          <span className="cart-history-card-id">#{nego.id.slice(0, 8).toUpperCase()}</span>
                          <span className={negoBadgeClass(nego.status)}>{NEGO_STATUS_LABEL[nego.status] ?? nego.status}</span>
                        </div>
                        <div className="cart-history-card-body">
                          <div className="cart-nego-prices">
                            <span className="cart-nego-original">{formatMoneyFromUsdCents(nego.originalPriceUsdCents)}</span>
                            <span className="cart-nego-arrow">→</span>
                            <span className="cart-nego-final">
                              {nego.finalPriceUsdCents != null
                                ? formatMoneyFromUsdCents(nego.finalPriceUsdCents)
                                : lastOffer
                                  ? formatMoneyFromUsdCents(lastOffer.priceUsdCents)
                                  : '—'}
                            </span>
                          </div>
                          <span className="cart-history-card-meta">
                            x{nego.quantity} · {new Date(nego.createdAt).toLocaleDateString('fr-FR')}
                          </span>
                        </div>

                        {/* Listing info */}
                        {nego.listing && (
                          <div className="cart-nego-listing">
                            {nego.listing.imageUrl ? (
                              <img src={resolveMediaUrl(nego.listing.imageUrl)} alt={nego.listing.title} className="cart-nego-listing-img" />
                            ) : (
                              <span className="cart-nego-listing-ph">{nego.listing.type === 'SERVICE' ? '🛠' : '📦'}</span>
                            )}
                            <span className="cart-nego-listing-title">{nego.listing.title}</span>
                          </div>
                        )}

                        {/* Seller & next action */}
                        <div className="cart-nego-meta-row">
                          <span>Vendeur : {nego.seller.displayName}</span>
                          {isActive && nego.status === 'COUNTERED' && (
                            <span className="cart-nego-next-action">→ Répondre à la contre-offre</span>
                          )}
                          {isActive && nego.status === 'PENDING' && (
                            <span className="cart-nego-next-action">→ En attente de réponse du vendeur</span>
                          )}
                        </div>

                        {/* Expanded detail: offers timeline */}
                        {selectedNego?.id === nego.id && (
                          <div className="cart-history-card-detail">
                            <div className="cart-nego-timeline">
                              {offers.length === 0 ? (
                                <div className="cart-nego-timeline-item cart-nego-timeline--event">
                                  <div className="cart-nego-timeline-dot" />
                                  <div className="cart-nego-timeline-content">
                                    <span className="cart-nego-timeline-date">Historique des offres indisponible pour ce marchandage.</span>
                                  </div>
                                </div>
                              ) : offers.map((offer, idx) => (
                                <div key={offer.id ?? `${nego.id}-${idx}`} className={`cart-nego-timeline-item ${offer.fromUserId === nego.buyerUserId ? 'cart-nego-timeline--buyer' : 'cart-nego-timeline--seller'}`}>
                                  <div className="cart-nego-timeline-dot" />
                                  <div className="cart-nego-timeline-content">
                                    <div className="cart-nego-timeline-head">
                                      <strong>{offer.fromDisplayName}</strong>
                                      <span>{formatMoneyFromUsdCents(offer.priceUsdCents)}</span>
                                    </div>
                                    {offer.message && <p className="cart-nego-timeline-msg">« {offer.message} »</p>}
                                    <span className="cart-nego-timeline-date">
                                      {new Date(offer.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                      {idx === 0 && ' · Marchandage créé'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {/* Final resolution event */}
                              {nego.resolvedAt && (
                                <div className={`cart-nego-timeline-item cart-nego-timeline--event cart-nego-timeline--${nego.status.toLowerCase()}`}>
                                  <div className="cart-nego-timeline-dot" />
                                  <div className="cart-nego-timeline-content">
                                    <strong>{NEGO_STATUS_LABEL[nego.status]}</strong>
                                    <span className="cart-nego-timeline-date">
                                      {new Date(nego.resolvedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {/* Expiry info for active */}
                              {isActive && (
                                <div className="cart-nego-timeline-item cart-nego-timeline--event">
                                  <div className="cart-nego-timeline-dot" />
                                  <div className="cart-nego-timeline-content">
                                    <span className="cart-nego-timeline-date">
                                      Expire : {new Date(nego.expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Action buttons for active negotiations */}
                            {isActive && nego.status === 'COUNTERED' && (
                              <div className="cart-nego-actions" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="cart-neg-action-btn"
                                  onClick={() => void handleViewNegotiation(nego.id)}
                                >
                                  🔄 Répondre
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
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
          showAi={localStorage.getItem(SK_AI_ADVICE) !== 'off'}
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
                <span>📍 Adresse de livraison (produits)</span>
                <LocationPicker
                  onChange={({ address, city }) => setCheckoutForm((prev) => ({ ...prev, deliveryAddress: address, deliveryCity: city || '' }))}
                  onStructuredChange={(loc) => setCheckoutForm((prev) => ({
                    ...prev,
                    deliveryAddress: loc.formattedAddress || prev.deliveryAddress,
                    deliveryCity: loc.city || '',
                    deliveryCountry: loc.country || '',
                    deliveryLatitude: loc.latitude,
                    deliveryLongitude: loc.longitude,
                    deliveryPlaceId: loc.placeId || '',
                    deliveryFormattedAddress: loc.formattedAddress || '',
                  }))}
                  placeholder="Ex: Avenue Lumumba N°12, Gombe"
                />
              </label>
            )}

            {hasServiceItems && (
              <>
                <label className="cart-checkout-modal-field">
                  <span>📍 Adresse d'entretien (services)</span>
                  <LocationPicker
                    onChange={({ address }) => setCheckoutForm((prev) => ({ ...prev, serviceMaintenanceAddress: address }))}
                    placeholder="Adresse d'entretien"
                  />
                </label>
                <label className="cart-checkout-modal-field">
                  <span>📍 Adresse de prestation (services)</span>
                  <LocationPicker
                    onChange={({ address }) => setCheckoutForm((prev) => ({ ...prev, serviceExecutionAddress: address }))}
                    placeholder="Adresse de prestation"
                  />
                </label>
              </>
            )}

            <label className="cart-checkout-modal-field">
              <span>Mode de paiement</span>
              <select value={checkoutForm.paymentMethod} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, paymentMethod: e.target.value as "PAYPAL" | "CASH_ON_DELIVERY" }))}>
                <option value="CASH_ON_DELIVERY">💵 Paiement à la livraison</option>
                <option value="PAYPAL" disabled>PayPal — en cours de configuration</option>
              </select>
              <span style={{ fontSize: '.78rem', opacity: 0.55, marginTop: 4 }}>D'autres moyens de paiement seront bientôt disponibles.</span>
            </label>

            <label className="cart-checkout-modal-field">
              <span>Note complémentaire</span>
              <textarea rows={2} value={checkoutForm.additionalNote} onChange={(e) => setCheckoutForm((prev) => ({ ...prev, additionalNote: e.target.value }))} />
            </label>

            <div className="cart-checkout-modal-actions">
              <button type="button" className="cart-btn cart-btn--secondary" onClick={() => { setCheckoutModalOpen(false); setCheckoutStep(0); }} disabled={checkoutBusy}>Annuler</button>
              <button type="button" className={`cart-btn cart-btn--primary${checkoutBusy ? ' cart-btn--confirming' : ''}`} onClick={() => void handleSubmitCheckoutModal()} disabled={checkoutBusy}>
                {checkoutBusy ? (
                  <span className="cart-checkout-btn-sending">
                    <span className="cart-checkout-btn-dots"><span /><span /><span /></span> Validation…
                  </span>
                ) : "✅ Confirmer"}
              </button>
            </div>

            {/* Checkout steps progress */}
            {checkoutBusy && (
              <div className="cart-checkout-steps">
                <div className={`cart-checkout-step ${checkoutStep >= 1 ? 'cart-checkout-step--active' : ''}`}>
                  <span className="cart-checkout-step-dot" />
                  <span>Vérification…</span>
                </div>
                <div className={`cart-checkout-step ${checkoutStep >= 2 ? 'cart-checkout-step--active' : ''}`}>
                  <span className="cart-checkout-step-dot" />
                  <span>Commande créée</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Checkout celebration overlay ── */}
      {checkoutDone && (
        <div className="cart-checkout-celebrate-overlay">
          <div className="cart-checkout-celebrate glass-container">
            <div className="cart-celebrate-confetti">🎊</div>
            <div className="cart-celebrate-icon">✅</div>
            <h2 className="cart-celebrate-title">Commande validée !</h2>
            <p className="cart-celebrate-sub">{checkoutDoneMsg}</p>
            <div className="cart-celebrate-badges">
              <span className="cart-celebrate-badge">📦 En route</span>
              <span className="cart-celebrate-badge">🔔 Suivi actif</span>
            </div>
            <p className="cart-celebrate-hint">Redirection vers vos achats…</p>
            <div className="cart-celebrate-progress">
              <div className="cart-celebrate-progress-bar" />
            </div>
          </div>
        </div>
      )}

      {/* ── Buyer delivery confirmation modal ── */}
      {buyerConfirmOrderId && (
        <div className="cart-checkout-modal-overlay" onClick={closeBuyerConfirmModal}>
          <div className="cart-checkout-modal glass-container" onClick={(e) => e.stopPropagation()}>
            <h3>📬 {t('cart.confirmDeliveryTitle')}</h3>
            <p style={{ opacity: 0.7, fontSize: '.9rem' }}>{t('cart.confirmDeliveryHelp')}</p>
            <p style={{ fontSize: '.85rem', textAlign: 'center', opacity: 0.5 }}>
              {t('cart.orderRef')}: <strong>#{buyerConfirmOrderId.slice(0, 8).toUpperCase()}</strong>
            </p>

            {/* Mode switch: Manuel / Scanner */}
            <div className="cart-validation-mode-switch">
              <button
                type="button"
                className={`cart-validation-mode-btn${buyerConfirmMode === 'manual' ? ' cart-validation-mode-btn--active' : ''}`}
                onClick={() => { setBuyerConfirmMode('manual'); setBuyerConfirmScanError(null); }}
              >
                ⌨️ Code manuel
              </button>
              <button
                type="button"
                className={`cart-validation-mode-btn${buyerConfirmMode === 'scan' ? ' cart-validation-mode-btn--active' : ''}`}
                onClick={() => { setBuyerConfirmMode('scan'); setBuyerConfirmScanMessage(null); setBuyerConfirmScanError(null); }}
              >
                📷 Scanner QR
              </button>
            </div>

            {/* QR Scanner panel */}
            {buyerConfirmMode === 'scan' && (
              <div className="cart-validation-scan-panel">
                <p style={{ opacity: 0.7, fontSize: '.85rem', textAlign: 'center' }}>Présentez le QR code du vendeur devant la caméra</p>
                <div id="ks-cart-validation-reader" className="cart-validation-scanner" />
                {buyerConfirmScanMessage && <p className="cart-validation-scan-msg cart-validation-scan-msg--ok">{buyerConfirmScanMessage}</p>}
                {buyerConfirmScanError && <p className="cart-validation-scan-msg cart-validation-scan-msg--err">{buyerConfirmScanError}</p>}
              </div>
            )}

            <label className="cart-checkout-modal-field">
              <span>{t('cart.validationCodeLabel')}</span>
              <input
                type="text"
                value={buyerConfirmCode}
                onChange={(e) => setBuyerConfirmCode(e.target.value.toUpperCase())}
                placeholder="Ex: A1B2C3"
                maxLength={12}
                autoFocus
                style={{ fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '0.15em', textAlign: 'center' }}
              />
            </label>

            {buyerConfirmScanMessage && buyerConfirmMode === 'manual' && (
              <div className="cart-feedback cart-feedback--ok">{buyerConfirmScanMessage}</div>
            )}
            {buyerConfirmScanError && (
              <div className="cart-feedback cart-feedback--error">{buyerConfirmScanError}</div>
            )}

            <div className="cart-checkout-modal-actions">
              <button type="button" className="cart-btn cart-btn--secondary" onClick={closeBuyerConfirmModal}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="cart-btn cart-btn--primary"
                disabled={buyerConfirmBusy || !buyerConfirmCode.trim()}
                onClick={() => void handleBuyerConfirm()}
              >
                {buyerConfirmBusy ? "..." : `✅ ${t('cart.confirmReception')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tutoriel interactif ── */}
      <TutorialOverlay
        pageKey="cart"
        steps={isEmpty ? cartEmptySteps : cartSteps}
        open={tutorial.isOpen}
        onClose={tutorial.close}
      />
      {!tutorial.isOpen && <TutorialRelaunchBtn reset={tutorial.reset} start={tutorial.start} />}
    </section>
  );
}
