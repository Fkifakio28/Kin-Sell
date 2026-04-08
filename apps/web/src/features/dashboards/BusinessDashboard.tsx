import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { getDashboardPath } from '../../utils/role-routing';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { compressAndEncodeMedia } from '../../utils/media-compress';
import { prepareMediaUrls } from '../../utils/media-upload';
import { DashboardMessaging } from './DashboardMessaging';
import {
  ApiError, auth as authApi, businesses, listings, orders, billing, messaging, sokin, reviews as reviewsApi, invalidateCache, analyticsAi, aiRecommendations, aiTrials, resolveMediaUrl,
  type BusinessAccount, type MyListing, type MyListingsStats, type ListingStatus,
  type OrderSummary, type BillingPlanSummary, type OrderStatus,
  type SoKinApiPost, type BasicInsights, type DeepInsights,
  type AiRecommendation, type AiTrial, type ReviewItem,
} from '../../lib/api-client';
import { OrderValidationQrModal } from '../../components/OrderValidationQrModal';
import { useSocket } from '../../hooks/useSocket';
import LocationPicker from '../../components/LocationPicker';
import VisibilitySelector from '../../components/VisibilitySelector';
import type { StructuredLocation, LocationVisibility } from '../../lib/api-client';
import { LISTING_PRODUCT_CATEGORIES, LISTING_SERVICE_CATEGORIES } from '../../shared/constants/categories';
import './dashboard.css';

type BizSection =
  | 'dashboard' | 'boutique' | 'produits' | 'services'
  | 'commandes' | 'messages' | 'contacts'
  | 'analytics' | 'verification'
  | 'kinsell' | 'parametres';

type AbonnementTier = 'based' | 'medium' | 'premium';

/* ─── Helpers devise ───────────────────────────────────────── */
import { USD_TO_CDF_RATE, DEFAULT_CURRENCY_RATES } from '../../shared/constants/currencies';
import { SK_BIZ_AI_ADVICE, SK_BIZ_AI_AUTO_NEGO, SK_BIZ_AI_COMMANDE } from '../../shared/constants/storage-keys';
import { DashboardSecurityBlock, DashboardVerificationSection } from './sections';
import { AdsBoostPopup } from '../../components/AdsBoostPopup';
import { PromoCreator } from '../../components/PromoCreator';
import { PromoBulkBar } from '../../components/PromoBulkBar';
import { PromoPriceLabel } from '../../components/PromoPriceLabel';
import { useListingSelection } from '../../hooks/useListingSelection';
const USD_TO_CDF = USD_TO_CDF_RATE;
const CURRENCY_SYMBOLS: Record<string, string> = { CDF: 'FC', USD: '$', EUR: '€', XAF: 'XAF', AOA: 'Kz', XOF: 'XOF', GNF: 'GNF', MAD: 'MAD' };
const getCurrencyRate = (c: string) => c === 'USD' ? 1 : (DEFAULT_CURRENCY_RATES[c] ?? DEFAULT_CURRENCY_RATES.CDF);

function deriveTier(planCode?: string | null): AbonnementTier {
  if (!planCode) return 'based';
  const c = planCode.toUpperCase();
  if (c.includes('PREMIUM')) return 'premium';
  if (c.includes('MEDIUM')) return 'medium';
  return 'based';
}

const ORDER_STATUS_MAP: Record<string, { labelKey: string; cls: string }> = {
  PENDING:    { labelKey: 'biz.statusPending',     cls: 'ud-badge' },
  CONFIRMED:  { labelKey: 'biz.statusConfirmed',   cls: 'ud-badge ud-badge--active' },
  PROCESSING: { labelKey: 'biz.statusProcessing',  cls: 'ud-badge ud-badge--active' },
  SHIPPED:    { labelKey: 'biz.statusShipped',      cls: 'ud-badge ud-badge--active' },
  DELIVERED:  { labelKey: 'biz.statusDelivered',    cls: 'ud-badge ud-badge--done' },
  CANCELED:   { labelKey: 'biz.statusCanceled',     cls: 'ud-badge ud-badge--cancel' },
};

const TIER_LABELS: Record<AbonnementTier, { label: string; cls: string }> = {
  based:   { label: 'Kin-sell Based',   cls: 'bz-tier bz-tier--based' },
  medium:  { label: 'Kin-sell Medium',  cls: 'bz-tier bz-tier--medium' },
  premium: { label: 'Kin-sell Premium', cls: 'bz-tier bz-tier--premium' },
};

const INITIAL_BUSINESS_FORM = {
  legalName: '',
  publicName: '',
  description: '',
  city: 'Kinshasa',
};

export function BusinessDashboard() {
  const navigate = useNavigate();
  const { user, isLoading, isLoggedIn, refreshUser, logout } = useAuth();
  const { t, formatMoneyFromUsdCents, formatPriceLabelFromUsdCents, currency } = useLocaleCurrency();
  const { on, off } = useSocket();
  const [activeSection, setActiveSection] = useState<BizSection>(() => {
    const stored = sessionStorage.getItem('ud-section');
    if (stored) {
      sessionStorage.removeItem('ud-section');
      return stored as BizSection;
    }
    return 'dashboard';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const scrollDir = useScrollDirection();
  const barsHidden = scrollDir === 'down' && !mobileSidebarOpen;
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [business, setBusiness] = useState<BusinessAccount | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [form, setForm] = useState(INITIAL_BUSINESS_FORM);

  useEffect(() => {
    if (activeSection === 'messages') {
      navigate('/messaging', { replace: true });
    }
  }, [activeSection, navigate]);

  // ─── Données réelles ─────────────────────────────────────
  const [sellerOrders, setSellerOrders] = useState<OrderSummary[]>([]);
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [listingStats, setListingStats] = useState<MyListingsStats | null>(null);
  const [myPlan, setMyPlan] = useState<BillingPlanSummary | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [bizBasicInsights, setBizBasicInsights] = useState<BasicInsights | null>(null);
  const [bizDeepInsights, setBizDeepInsights] = useState<DeepInsights | null>(null);
  const [bizAnalyticsLoading, setBizAnalyticsLoading] = useState(false);
  // ── AI preferences (localStorage-persisted) ──
  const [bizAiAdviceEnabled, setBizAiAdviceEnabled] = useState(() => localStorage.getItem(SK_BIZ_AI_ADVICE) !== 'off');
  const [bizAiAutoNegoEnabled, setBizAiAutoNegoEnabled] = useState(() => localStorage.getItem(SK_BIZ_AI_AUTO_NEGO) === 'on');
  const [bizAiCommandeEnabled, setBizAiCommandeEnabled] = useState(() => localStorage.getItem(SK_BIZ_AI_COMMANDE) !== 'off');
  const [ksRecommendations, setKsRecommendations] = useState<AiRecommendation[]>([]);
  const [ksTrials, setKsTrials] = useState<AiTrial[]>([]);
  const [ksLoading, setKsLoading] = useState(false);
  const [validationCodeBusyId, setValidationCodeBusyId] = useState<string | null>(null);
  const [sellerValidationQr, setSellerValidationQr] = useState<{ orderId: string; code: string } | null>(null);
  const [orderStatusBusyId, setOrderStatusBusyId] = useState<string | null>(null);
  const [bizOrderFilter, setBizOrderFilter] = useState<OrderStatus | ''>('');
  const [selectedBizOrder, setSelectedBizOrder] = useState<OrderSummary | null>(null);

  // ─── Boutique ────────────────────────────────────────────
  const [shopSaving, setShopSaving] = useState(false);
  const [shopMsg, setShopMsg] = useState<string | null>(null);
  const [shopForm, setShopForm] = useState({ publicName: '', publicDescription: '', city: '', address: '', logo: '', coverImage: '' });

  // ─── Import produits/services ────────────────────────────
  const [importOpen, setImportOpen] = useState<'produit' | 'service' | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // ─── ADS Boost popup ─────────────────────────────────────
  const [boostPopupListingId, setBoostPopupListingId] = useState<string | null>(null);
  const [boostPopupBulkCount, setBoostPopupBulkCount] = useState<number | null>(null);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);

  // ─── Paramètres ──────────────────────────────────────────
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [showPw, setShowPw] = useState<{ cur: boolean; new: boolean; confirm: boolean }>({ cur: false, new: false, confirm: false });
  const [settingsForm, setSettingsForm] = useState({
    legalName: '', publicName: '', description: '', city: '',
    avatar: '', address: '',
    shopPhoto1: '', shopPhoto2: '', shopPhoto3: '',
    country: '', countryCode: '', region: '', district: '', postalCode: '', formattedAddress: '',
    latitude: null as number | null, longitude: null as number | null, placeId: '',
    locationVisibility: 'DISTRICT_PUBLIC' as LocationVisibility, serviceRadiusKm: '', deliveryZones: '',
    email: '', phone: '', currentPassword: '', newPassword: '', confirmPassword: '',
  });
  const [settingsAvatarFile, setSettingsAvatarFile] = useState<File | null>(null);
  const [settingsAvatarPreview, setSettingsAvatarPreview] = useState<string | null>(null);
  // Suppression de compte
  const [bzDeleteStep, setBzDeleteStep] = useState<'idle' | 'confirm' | 'reason' | 'done'>('idle');
  const [bzDeleteReason, setBzDeleteReason] = useState('');
  const [bzDeleteBusy, setBzDeleteBusy] = useState(false);
  const [bzDeleteError, setBzDeleteError] = useState<string | null>(null);

  // ── Sécurité: TOTP 2FA ──
  const [bzTotpEnabled, setBzTotpEnabled] = useState(false);
  const [bzTotpSetupUri, setBzTotpSetupUri] = useState<string | null>(null);
  const [bzTotpSetupSecret, setBzTotpSetupSecret] = useState<string | null>(null);
  const [bzTotpSetupCode, setBzTotpSetupCode] = useState('');
  const [bzTotpDisablePassword, setBzTotpDisablePassword] = useState('');
  const [bzTotpStep, setBzTotpStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [bzTotpBusy, setBzTotpBusy] = useState(false);
  const [bzTotpMessage, setBzTotpMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [bzTotpQrDataUrl, setBzTotpQrDataUrl] = useState<string | null>(null);
  const [bzSessionsCount, setBzSessionsCount] = useState<number | null>(null);
  // ── Email verification ──
  const [bzEmailVerifStep, setBzEmailVerifStep] = useState<'idle' | 'sent' | 'done'>('idle');
  const [bzEmailVerifId, setBzEmailVerifId] = useState('');
  const [bzEmailVerifCode, setBzEmailVerifCode] = useState('');
  const [bzEmailVerifBusy, setBzEmailVerifBusy] = useState(false);
  const [bzEmailVerifMsg, setBzEmailVerifMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ─── Page publique ───────────────────────────────────────
  const [pageSaving, setPageSaving] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [pageForm, setPageForm] = useState({ publicName: '', publicDescription: '', city: '', address: '', logo: '', coverImage: '', country: '', countryCode: '', region: '', district: '', formattedAddress: '', latitude: null as number | null, longitude: null as number | null, placeId: '', locationVisibility: 'DISTRICT_PUBLIC' as LocationVisibility, contactPhone: '', contactEmail: '' });

  // ─── Points forts (stockés en localStorage) ──────────────
  type Quality = { id: string; icon: string; name: string; description: string };
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [qualityDraft, setQualityDraft] = useState({ icon: '⭐', name: '', description: '' });

  // ─── Photos boutique physique (localStorage) ─────────────
  const [shopPhotos, setShopPhotos] = useState<string[]>([]);

  // ─── Créer / Modifier listing ────────────────────────────
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<'produit' | 'service' | null>(null);
  const [createForm, setCreateForm] = useState({ title: '', category: '', city: 'Kinshasa', priceCdf: '', stock: '', description: '', isNegotiable: true, latitude: -4.3216965, longitude: 15.3124553, country: 'RDC', countryCode: 'CD', region: '', district: '', formattedAddress: '', placeId: '', locationVisibility: 'CITY_PUBLIC' as LocationVisibility, serviceRadiusKm: '' });
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState(1);
  const [createUploadFiles, setCreateUploadFiles] = useState<File[]>([]);
  const [createUploadPreviews, setCreateUploadPreviews] = useState<string[]>([]);

  // ─── Produits/Services: filtres, pagination, actions ─────
  const [prodFilter, setProdFilter] = useState<ListingStatus | ''>('');
  const [prodPage, setProdPage] = useState(1);
  const [svcFilter, setSvcFilter] = useState<ListingStatus | ''>('');
  const [svcPage, setSvcPage] = useState(1);
  const [bzArticleBusy, setBzArticleBusy] = useState<string | null>(null);
  const [bzActionMsg, setBzActionMsg] = useState<string | null>(null);
  const BZ_PAGE_LIMIT = 12;

  // ─── Sélection produits + promotions ──────────────────────
  const { selectedIds: selectedProdIds, toggle: toggleProdSelection, selectAll: selectAllProd, deselectAll: deselectAllProd, promoItems: promoProduits, openPromo: openProdPromo, closePromo: closeProdPromo } = useListingSelection();
  const [prodViewMode, setProdViewMode] = useState<'grid' | 'list'>(() => (localStorage.getItem('ks-bz-prod-view') as 'grid' | 'list') || 'grid');

  // ─── Sélection services + promotions ─────────────────────
  const { selectedIds: selectedSvcIds, toggle: toggleSvcSelection, selectAll: selectAllSvc, deselectAll: deselectAllSvc, promoItems: promoServices, openPromo: openSvcPromo, closePromo: closeSvcPromo } = useListingSelection();
  const [svcViewMode, setSvcViewMode] = useState<'grid' | 'list'>(() => (localStorage.getItem('ks-bz-svc-view') as 'grid' | 'list') || 'grid');

  // ─── Contacts ────────────────────────────────────────────
  const [contactFilter, setContactFilter] = useState<'all' | 'online' | 'favorites'>('all');
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<Array<{ id: string; profile: { displayName: string; username: string | null; avatarUrl: string | null; city: string | null } }>>([]);
  const [contactSearching, setContactSearching] = useState(false);

  // ─── Avis (Reviews) ──────────────────────────────────────
  // Les avis sont générés par les acheteurs après livraison. Cette section affiche
  // ─── Reviews (Avis) ───────────────────────────────────
  const [bizReviews, setBizReviews] = useState<ReviewItem[]>([]);
  const [bizReviewsAvg, setBizReviewsAvg] = useState(0);
  const [bizReviewsLoading, setBizReviewsLoading] = useState(false);

  // ─── So-Kin ──────────────────────────────────────────────
  const [sokinPosts, setSokinPosts] = useState<SoKinApiPost[]>([]);
  const [sokinDraft, setSokinDraft] = useState({ content: '', imageUrl: '' });
  const [sokinPublishing, setSokinPublishing] = useState(false);

  // ─── Helper : lire un fichier local → data URL base64 ───
  const readFileAndSet = async (file: File, setter: (dataUrl: string) => void) => {
    if (file.size > 15 * 1024 * 1024) {
      alert(t('biz.fileTooLarge'));
      return;
    }

    try {
      const [encoded] = await compressAndEncodeMedia([file]);
      if (encoded) setter(encoded);
    } catch {
      alert(t('biz.saveError'));
    }
  };

  const navItems: { key: BizSection; labelKey: string; icon: string }[] = [
    { key: 'dashboard',    labelKey: 'biz.navDashboard',   icon: '⊞' },
    { key: 'boutique',     labelKey: 'biz.navBoutique',    icon: '🏪' },
    { key: 'produits',     labelKey: 'biz.navProduits',    icon: '📦' },
    { key: 'services',     labelKey: 'biz.navServices',    icon: '🛠️' },
    { key: 'commandes',    labelKey: 'biz.navCommandes',   icon: '🛒' },
    { key: 'messages',     labelKey: 'biz.navMessages',    icon: '💬' },
    { key: 'contacts',     labelKey: 'biz.navContacts',    icon: '🤝' },
    { key: 'analytics',    labelKey: 'biz.navAnalytics',   icon: '📊' },
    { key: 'verification', labelKey: 'biz.navVerification', icon: '✅' },
    { key: 'kinsell',      labelKey: 'Kin-Sell',            icon: '🧠' },
    { key: 'parametres',   labelKey: 'biz.navParametres',  icon: '⚙' },
  ];

  // ─── Charger le business account ─────────────────────────
  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn) { navigate('/login'); return; }
    if (user?.role !== 'BUSINESS' && user?.role !== 'USER') {
      navigate(getDashboardPath(user?.role), { replace: true });
      return;
    }
    let cancelled = false;
    const loadBusiness = async () => {
      setBusinessLoading(true);
      setBusinessError(null);
      try {
        const data = await businesses.me();
        if (!cancelled) setBusiness(data);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
          setBusiness(null);
        } else {
          setBusinessError(t('biz.loadError'));
        }
      } finally {
        if (!cancelled) setBusinessLoading(false);
      }
    };
    void loadBusiness();
    return () => { cancelled = true; };
  }, [isLoading, isLoggedIn, navigate, user?.role]);

  // ─── Charger données secondaires quand business prêt ─────
  useEffect(() => {
    if (!business) return;
    let cancelled = false;
    const load = async () => {
      setDataLoading(true);
      setBizReviewsLoading(true);
      try {
        const [ordersRes, listingsRes, statsRes, planRes, sokinRes, reviewsRes] = await Promise.allSettled([
          orders.sellerOrders({ limit: 50 }),
          listings.mine({ limit: 50 }),
          listings.mineStats(),
          billing.myPlan(),
          sokin.myPosts(),
          reviewsApi.forUser(business.ownerUserId),
        ]);
        if (cancelled) return;
        if (ordersRes.status === 'fulfilled') setSellerOrders(ordersRes.value.orders);
        if (listingsRes.status === 'fulfilled') setMyListings(listingsRes.value.listings);
        if (statsRes.status === 'fulfilled') setListingStats(statsRes.value);
        if (planRes.status === 'fulfilled') setMyPlan(planRes.value);
        if (sokinRes.status === 'fulfilled') setSokinPosts(sokinRes.value.posts);
        if (reviewsRes.status === 'fulfilled') {
          setBizReviews(reviewsRes.value.reviews);
          setBizReviewsAvg(reviewsRes.value.averageRating);
        }
      } finally {
        if (!cancelled) { setDataLoading(false); setBizReviewsLoading(false); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [business]);

  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const handleOrderEvent = (payload: {
      type: 'ORDER_STATUS_UPDATED' | 'ORDER_CONFIRMATION_COMPLETED';
      orderId: string;
      status: string;
      buyerUserId: string;
      sellerUserId: string;
      sourceUserId: string;
      updatedAt: string;
    }) => {
      if (payload.sellerUserId !== user.id && payload.buyerUserId !== user.id) return;

      if (payload.status === 'DELIVERED' && sellerValidationQr?.orderId === payload.orderId) {
        setSellerValidationQr(null);
      }

      invalidateCache('/orders/');
      void orders.sellerOrders({ limit: 50 }).then((res) => setSellerOrders(res.orders)).catch(() => {});
    };

    const handleOrderStatusUpdated = (payload: {
      type: 'ORDER_STATUS_UPDATED';
      orderId: string;
      status: string;
      buyerUserId: string;
      sellerUserId: string;
      sourceUserId: string;
      updatedAt: string;
    }) => handleOrderEvent(payload);

    const handleDeliveryConfirmed = (payload: {
      type: 'ORDER_CONFIRMATION_COMPLETED';
      orderId: string;
      status: string;
      buyerUserId: string;
      sellerUserId: string;
      sourceUserId: string;
      updatedAt: string;
    }) => handleOrderEvent(payload);

    on('order:status-updated', handleOrderStatusUpdated);
    on('order:delivery-confirmed', handleDeliveryConfirmed);

    return () => {
      off('order:status-updated', handleOrderStatusUpdated);
      off('order:delivery-confirmed', handleDeliveryConfirmed);
    };
  }, [isLoggedIn, user, on, off, sellerValidationQr?.orderId]);

  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const handlePostCreated = (payload: {
      type: 'SOKIN_POST_CREATED';
      postId: string;
      authorId: string;
      createdAt: string;
      sourceUserId: string;
    }) => {
      if (payload.authorId !== user.id || payload.sourceUserId === user.id) return;
      void sokin.myPosts().then((res) => setSokinPosts(res.posts)).catch(() => {});
    };

    on('sokin:post-created', handlePostCreated);

    return () => {
      off('sokin:post-created', handlePostCreated);
    };
  }, [isLoggedIn, user, on, off]);

  /* ── Kin-Sell Analytique: fetch AI insights for business ── */
  const bizHasAnalytics = useMemo(() => {
    if (!myPlan) return false;
    return myPlan.analyticsTier !== 'NONE';
  }, [myPlan]);

  const bizHasPremium = useMemo(() => {
    return myPlan?.analyticsTier === 'PREMIUM';
  }, [myPlan]);

  useEffect(() => {
    if (activeSection !== 'analytics' || !bizHasAnalytics || bizBasicInsights) return;
    let cancelled = false;
    setBizAnalyticsLoading(true);

    const load = async () => {
      try {
        const basic = await analyticsAi.basic();
        if (!cancelled) setBizBasicInsights(basic);
        if (bizHasPremium) {
          const deep = await analyticsAi.deep();
          if (!cancelled) setBizDeepInsights(deep);
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setBizAnalyticsLoading(false); }
    };

    void load();
    return () => { cancelled = true; };
  }, [activeSection, bizHasAnalytics, bizHasPremium, bizBasicInsights]);

  // ── Kin-Sell tab data ──
  useEffect(() => {
    if (activeSection !== 'kinsell') return;
    let cancelled = false;
    setKsLoading(true);
    Promise.all([aiRecommendations.getActive(), aiTrials.getMyTrials()])
      .then(([recs, trials]) => {
        if (!cancelled) { setKsRecommendations(recs); setKsTrials(trials); }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setKsLoading(false); });
    return () => { cancelled = true; };
  }, [activeSection]);

  /* ── AI plan gating for business ── */
  const bizHasIaMarchandPlan = useMemo(() => {
    if (!myPlan) return false;
    const planIncludes = ['BUSINESS', 'SCALE'].includes(myPlan.planCode);
    const addonActive = myPlan.addOns?.some((a) => a.code === 'IA_MERCHANT' && a.status === 'ACTIVE');
    return planIncludes || addonActive;
  }, [myPlan]);

  const bizHasIaOrderPlan = useMemo(() => {
    if (!myPlan) return false;
    const planIncludes = ['SCALE'].includes(myPlan.planCode);
    const addonActive = myPlan.addOns?.some((a) => a.code === 'IA_ORDER' && a.status === 'ACTIVE');
    return planIncludes || addonActive;
  }, [myPlan]);

  const bizAutoNegoActive = bizHasIaMarchandPlan && bizAiAutoNegoEnabled;

  // ─── Pré-remplir formulaires quand business change ───────
  useEffect(() => {
    if (!business) return;
    setShopForm({
      publicName: business.publicName ?? '',
      publicDescription: business.shop?.publicDescription ?? '',
      city: business.shop?.city ?? '',
      address: business.shop?.address ?? '',
      logo: business.shop?.logo ?? '',
      coverImage: business.shop?.coverImage ?? '',
    });
    setSettingsForm({
      legalName: business.legalName ?? '',
      publicName: business.publicName ?? '',
      description: business.description ?? '',
      city: business.shop?.city ?? '',
      avatar: business.shop?.logo ?? '',
      address: business.shop?.address ?? '',
      shopPhoto1: '',
      shopPhoto2: '',
      shopPhoto3: '',
      country: (business.shop as any)?.country ?? '',
      countryCode: (business.shop as any)?.countryCode ?? '',
      region: (business.shop as any)?.region ?? '',
      district: (business.shop as any)?.district ?? '',
      postalCode: (business.shop as any)?.postalCode ?? '',
      formattedAddress: (business.shop as any)?.formattedAddress ?? '',
      latitude: (business.shop as any)?.latitude ?? null,
      longitude: (business.shop as any)?.longitude ?? null,
      placeId: (business.shop as any)?.placeId ?? '',
      locationVisibility: (business.shop as any)?.locationVisibility ?? 'DISTRICT_PUBLIC',
      serviceRadiusKm: (business.shop as any)?.serviceRadiusKm?.toString() ?? '',
      deliveryZones: (business.shop as any)?.deliveryZones?.join(', ') ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
    setPageForm({
      publicName: business.publicName ?? '',
      publicDescription: business.shop?.publicDescription ?? '',
      city: business.shop?.city ?? '',
      address: business.shop?.address ?? '',
      logo: business.shop?.logo ?? '',
      coverImage: business.shop?.coverImage ?? '',
      country: (business.shop as any)?.country ?? '',
      countryCode: (business.shop as any)?.countryCode ?? '',
      region: (business.shop as any)?.region ?? '',
      district: (business.shop as any)?.district ?? '',
      formattedAddress: (business.shop as any)?.formattedAddress ?? '',
      latitude: (business.shop as any)?.latitude ?? null,
      longitude: (business.shop as any)?.longitude ?? null,
      placeId: (business.shop as any)?.placeId ?? '',
      locationVisibility: (business.shop as any)?.locationVisibility ?? 'DISTRICT_PUBLIC',
      contactPhone: (business.shop as any)?.contactPhone ?? '',
      contactEmail: (business.shop as any)?.contactEmail ?? '',
    });
    // ── Charger points forts & photos boutique depuis la DB ──
    const shopAny = business.shop as any;
    if (Array.isArray(shopAny?.highlights) && shopAny.highlights.length > 0) {
      setQualities(shopAny.highlights);
    }
    if (Array.isArray(shopAny?.shopPhotos) && shopAny.shopPhotos.length > 0) {
      setShopPhotos(shopAny.shopPhotos);
    }
  }, [business]);

  // ─── KPIs calculés ───────────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const delivered = sellerOrders.filter(o => o.status === 'DELIVERED');
    const thisMonth = delivered.filter(o => new Date(o.createdAt) >= monthStart);
    const active = sellerOrders.filter(o => ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(o.status));
    const totalUsdCents = delivered.reduce((s, o) => s + o.totalUsdCents, 0);
    const monthUsdCents = thisMonth.reduce((s, o) => s + o.totalUsdCents, 0);
    const avgUsdCents = delivered.length > 0 ? Math.round(totalUsdCents / delivered.length) : 0;
    return { totalUsdCents, monthUsdCents, activeCount: active.length, avgUsdCents };
  }, [sellerOrders]);

  // ─── Clients uniques dérivés des commandes ───────────────
  const clientsData = useMemo(() => {
    const map = new Map<string, { name: string; commandes: number; totalUsdCents: number }>();
    for (const o of sellerOrders) {
      const prev = map.get(o.buyer.userId) ?? { name: o.buyer.displayName, commandes: 0, totalUsdCents: 0 };
      map.set(o.buyer.userId, { name: prev.name, commandes: prev.commandes + 1, totalUsdCents: prev.totalUsdCents + o.totalUsdCents });
    }
    return Array.from(map.values()).sort((a, b) => b.totalUsdCents - a.totalUsdCents);
  }, [sellerOrders]);

  const tier = TIER_LABELS[deriveTier(myPlan?.planCode)];
  const businessName = business?.publicName ?? '';
  const businessLogo = business?.shop?.logo ?? null;
  const businessVerified = Boolean(business?.shop?.active);
  const businessSlug = business?.slug ?? '';

  // ── Produits / Services : stats, filtrage, pagination ──
  const allProduits = myListings.filter(l => l.type === 'PRODUIT');
  const allServices = myListings.filter(l => l.type === 'SERVICE');
  const prodStats = {
    active: allProduits.filter(l => l.status === 'ACTIVE').length,
    inactive: allProduits.filter(l => l.status === 'INACTIVE').length,
    archived: allProduits.filter(l => l.status === 'ARCHIVED').length,
  };
  const svcStats = {
    active: allServices.filter(l => l.status === 'ACTIVE').length,
    inactive: allServices.filter(l => l.status === 'INACTIVE').length,
    archived: allServices.filter(l => l.status === 'ARCHIVED').length,
  };
  const filteredProduits = prodFilter ? allProduits.filter(l => l.status === prodFilter) : allProduits;
  const prodTotalPages = Math.max(1, Math.ceil(filteredProduits.length / BZ_PAGE_LIMIT));
  const pagedProduits = filteredProduits.slice((prodPage - 1) * BZ_PAGE_LIMIT, prodPage * BZ_PAGE_LIMIT);
  const filteredServices = svcFilter ? allServices.filter(l => l.status === svcFilter) : allServices;
  const svcTotalPages = Math.max(1, Math.ceil(filteredServices.length / BZ_PAGE_LIMIT));
  const pagedServices = filteredServices.slice((svcPage - 1) * BZ_PAGE_LIMIT, svcPage * BZ_PAGE_LIMIT);

  // ── Alias legacy (dashboard overview) ──
  const produits = allProduits;
  const services = allServices;

  // ── Handlers articles business ──
  const handleBzStatusChange = async (id: string, status: ListingStatus) => {
    if (status === 'DELETED' && !window.confirm('Êtes-vous sûr de vouloir supprimer cet article ? Cette action est irréversible.')) return;
    if (status === 'ARCHIVED' && !window.confirm('Archiver cet article ?')) return;
    setBzArticleBusy(id);
    setBzActionMsg(null);
    try {
      await listings.changeStatus(id, status);
      invalidateCache('/listings/mine');
      const [lRes, sRes] = await Promise.allSettled([listings.mine({ limit: 50 }), listings.mineStats()]);
      if (lRes.status === 'fulfilled') setMyListings(lRes.value.listings);
      if (sRes.status === 'fulfilled') setListingStats(sRes.value);
      const label = status === 'ACTIVE' ? 'activé' : status === 'INACTIVE' ? 'désactivé' : status === 'ARCHIVED' ? 'archivé' : 'supprimé';
      setBzActionMsg(`✓ Article ${label} avec succès`);
    } catch (err) {
      const msg = err instanceof ApiError
        ? `Erreur ${err.status}: ${String((err.data as Record<string, unknown>)?.error ?? 'Échec de la modification')}`
        : 'Erreur réseau, réessayez';
      setBzActionMsg(`❌ ${msg}`);
    }
    finally { setBzArticleBusy(null); }
  };

  const handleBzEdit = (article: MyListing) => {
    const type = article.type === 'SERVICE' ? 'service' : 'produit';
    setEditingArticleId(article.id);
    setCreateMode(type);
    setCreateStep(1);
    setCreateUploadFiles([]);
    setCreateUploadPreviews(p => { p.forEach(u => URL.revokeObjectURL(u)); return []; });
    setCreateMsg(null);
    setBzActionMsg(null);
    setCreateForm({
      title: article.title,
      category: article.category,
      city: article.city,
      priceCdf: String(Math.round(article.priceUsdCents / 100 * getCurrencyRate(currency))),
      stock: article.stockQuantity !== null ? String(article.stockQuantity) : '',
      description: article.description ?? '',
      isNegotiable: article.isNegotiable,
      latitude: article.latitude,
      longitude: article.longitude,
      country: (article as any).country ?? 'RDC',
      countryCode: (article as any).countryCode ?? 'CD',
      region: (article as any).region ?? '',
      district: (article as any).district ?? '',
      formattedAddress: (article as any).formattedAddress ?? '',
      placeId: (article as any).placeId ?? '',
      locationVisibility: (article as any).locationVisibility ?? 'CITY_PUBLIC',
      serviceRadiusKm: (article as any).serviceRadiusKm?.toString() ?? '',
    });
    setActiveSection(type === 'service' ? 'services' : 'produits');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  // ─── Upload fichiers listing ──────────────────────────────
  const handleCreateFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const images = selected.filter(f => f.type.startsWith('image/'));
    const videos = selected.filter(f => f.type.startsWith('video/'));
    const existingImages = createUploadFiles.filter(f => f.type.startsWith('image/'));
    const existingVideos = createUploadFiles.filter(f => f.type.startsWith('video/'));
    if (existingImages.length + images.length > 5) { setCreateMsg('Maximum 5 photos'); return; }
    if (existingVideos.length + videos.length > 1) { setCreateMsg('Maximum 1 vidéo'); return; }
    for (const f of videos) { if (f.size > 50 * 1024 * 1024) { setCreateMsg(`Vidéo trop lourde (${f.name})`); return; } }
    setCreateMsg(null);
    setCreateUploadFiles(prev => [...prev, ...selected]);
    setCreateUploadPreviews(prev => [...prev, ...selected.map(f => URL.createObjectURL(f))]);
    e.target.value = '';
  };
  const removeCreateFile = (index: number) => {
    URL.revokeObjectURL(createUploadPreviews[index]);
    setCreateUploadFiles(prev => prev.filter((_, i) => i !== index));
    setCreateUploadPreviews(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Créer un listing ────────────────────────────────────
  const handleCreateListing = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (createBusy || !createMode) return;
    setCreateBusy(true);
    setCreateMsg(null);
    try {
      const priceLocal = parseFloat(createForm.priceCdf.replace(/\s/g, '')) || 0;
      const rate = getCurrencyRate(currency);
      const priceUsdCents = Math.round((priceLocal / rate) * 100);
      let mediaUrls: string[] = [];
      if (createUploadFiles.length > 0) {
        mediaUrls = await prepareMediaUrls(createUploadFiles);
      }
      const payload = {
        type: createMode === 'produit' ? 'PRODUIT' : 'SERVICE',
        title: createForm.title.trim(),
        category: createForm.category.trim(),
        city: createForm.city.trim() || 'Kinshasa',
        priceUsdCents,
        stockQuantity: createMode === 'produit' && createForm.stock ? parseInt(createForm.stock) : null,
        description: createForm.description.trim() || null,
        latitude: createForm.latitude,
        longitude: createForm.longitude,
        isNegotiable: createForm.isNegotiable,
        country: createForm.country || undefined,
        countryCode: createForm.countryCode || undefined,
        region: createForm.region || undefined,
        district: createForm.district || undefined,
        formattedAddress: createForm.formattedAddress || undefined,
        placeId: createForm.placeId || undefined,
        locationVisibility: createForm.locationVisibility || undefined,
        serviceRadiusKm: createForm.serviceRadiusKm ? parseInt(createForm.serviceRadiusKm) : undefined,
        imageUrl: mediaUrls[0] || undefined,
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      };
      if (editingArticleId) {
        await listings.update(editingArticleId, payload);
      } else {
        const createdListing = await listings.create(payload as any);
        if (createdListing?.id) setBoostPopupListingId(createdListing.id);
      }
      invalidateCache('/listings/mine');
      setCreateMsg(editingArticleId ? '✓ Article modifié avec succès' : t('biz.listingSuccess'));
      setEditingArticleId(null);
      setCreateForm({ title: '', category: '', city: 'Kinshasa', priceCdf: '', stock: '', description: '', isNegotiable: true, latitude: -4.3216965, longitude: 15.3124553, country: 'RDC', countryCode: 'CD', region: '', district: '', formattedAddress: '', placeId: '', locationVisibility: 'CITY_PUBLIC', serviceRadiusKm: '' });
      setCreateMode(null);
      setCreateStep(1);
      createUploadPreviews.forEach(u => URL.revokeObjectURL(u));
      setCreateUploadFiles([]);
      setCreateUploadPreviews([]);
      const [lRes, sRes] = await Promise.allSettled([listings.mine({ limit: 50 }), listings.mineStats()]);
      if (lRes.status === 'fulfilled') setMyListings(lRes.value.listings);
      if (sRes.status === 'fulfilled') setListingStats(sRes.value);
    } catch (err) {
      const msg = err instanceof ApiError
        ? `Erreur ${err.status}: ${String((err.data as Record<string, unknown>)?.error ?? t('biz.listingError'))}`
        : t('biz.listingError');
      setCreateMsg(msg);
    } finally {
      setCreateBusy(false);
    }
  };

  // ─── Import fichier (CSV / JSON / XML) ──────────────────
  const handleImportFile = async (file: File, type: 'PRODUIT' | 'SERVICE') => {
    setImportBusy(true);
    setImportMsg(null);
    setImportProgress(null);
    try {
      const text = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase();
      type RawRow = { title?: string; titre?: string; category?: string; categorie?: string; price?: string | number; prix?: string | number; priceCdf?: string | number; stock?: string | number; description?: string; city?: string; ville?: string };
      let rows: RawRow[] = [];

      if (ext === 'json') {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.items ?? parsed.products ?? parsed.services ?? [];
      } else if (ext === 'csv') {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) throw new Error('CSV vide ou sans en-tête');
        const headers = lines[0].split(/[;,\t]/).map(h => h.trim().toLowerCase().replace(/"/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(/[;,\t]/).map(v => v.trim().replace(/^"|"$/g, ''));
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
          rows.push(row as unknown as RawRow);
        }
      } else if (ext === 'xml') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');
        const items = doc.querySelectorAll('item, product, service, listing, row, record');
        items.forEach(el => {
          const get = (tags: string[]) => { for (const t of tags) { const n = el.querySelector(t); if (n?.textContent) return n.textContent.trim(); } return ''; };
          rows.push({
            title: get(['title', 'titre', 'name', 'nom']),
            category: get(['category', 'categorie']),
            price: get(['price', 'prix', 'priceCdf']),
            stock: get(['stock', 'quantity', 'quantite']),
            description: get(['description', 'desc']),
            city: get(['city', 'ville']),
          });
        });
      } else {
        throw new Error('Format non supporté. Utilisez .csv, .json ou .xml');
      }

      if (!rows.length) throw new Error('Aucune donnée trouvée dans le fichier');

      const validCategories = type === 'PRODUIT' ? LISTING_PRODUCT_CATEGORIES : LISTING_SERVICE_CATEGORIES;
      let created = 0;
      let errors = 0;
      setImportProgress({ done: 0, total: rows.length });

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const title = (r.title || r.titre || '').toString().trim();
        if (!title) { errors++; setImportProgress({ done: i + 1, total: rows.length }); continue; }
        let cat = (r.category || r.categorie || '').toString().trim();
        if (!(validCategories as readonly string[]).includes(cat)) cat = validCategories[validCategories.length - 1];
        const priceCdf = parseFloat(String(r.priceCdf || r.price || r.prix || '0').replace(/\s/g, '')) || 0;
        const priceUsdCents = Math.round((priceCdf / USD_TO_CDF) * 100);
        const stock = parseInt(String(r.stock || '0')) || null;
        const desc = (r.description || '').toString().trim() || null;
        const city = (r.city || r.ville || 'Kinshasa').toString().trim();
        try {
          await listings.create({ type, title, category: cat, city, priceUsdCents, stockQuantity: type === 'PRODUIT' ? stock : null, description: desc });
          created++;
        } catch { errors++; }
        setImportProgress({ done: i + 1, total: rows.length });
      }

      invalidateCache('/listings/mine');
      const [lRes, sRes] = await Promise.allSettled([listings.mine({ limit: 50 }), listings.mineStats()]);
      if (lRes.status === 'fulfilled') setMyListings(lRes.value.listings);
      if (sRes.status === 'fulfilled') setListingStats(sRes.value);
      setImportMsg(`✓ ${created} importé(s)${errors ? `, ${errors} erreur(s)` : ''}`);
      if (created >= 5) setBoostPopupBulkCount(created);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally {
      setImportBusy(false);
    }
  };

  // ─── Mise à jour boutique ────────────────────────────────
  const handleSaveBoutique = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (shopSaving) return;
    setShopSaving(true);
    setShopMsg(null);
    try {
      const updated = await businesses.updateMe({
        publicName: shopForm.publicName.trim() || undefined,
        publicDescription: shopForm.publicDescription.trim() || undefined,
        city: shopForm.city.trim() || undefined,
        address: shopForm.address.trim() || undefined,
        logo: shopForm.logo.trim() || undefined,
        coverImage: shopForm.coverImage.trim() || undefined,
        highlights: qualities,
        shopPhotos: shopPhotos,
      });
      setBusiness(updated);
      setShopMsg(t('biz.boutiqueSaved'));
    } catch {
      setShopMsg(t('biz.saveError'));
    } finally {
      setShopSaving(false);
    }
  };

  // ─── Paramètres entreprise ───────────────────────────────
  const handleSaveSettings = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (settingsSaving) return;
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      // Upload avatar if new file selected
      let avatarUrl = settingsForm.avatar;
      if (settingsAvatarFile) {
        const encoded = await compressAndEncodeMedia([settingsAvatarFile]);
        avatarUrl = encoded[0] ?? avatarUrl;
      }
      // Update business info
      const updated = await businesses.updateMe({
        legalName: settingsForm.legalName.trim() || undefined,
        publicName: settingsForm.publicName.trim() || undefined,
        description: settingsForm.description.trim() || undefined,
        city: settingsForm.city.trim() || undefined,
        address: settingsForm.address.trim() || undefined,
        logo: avatarUrl.trim() || undefined,
        country: settingsForm.country.trim() || undefined,
        countryCode: settingsForm.countryCode.trim() || undefined,
        region: settingsForm.region.trim() || undefined,
        district: settingsForm.district.trim() || undefined,
        postalCode: settingsForm.postalCode.trim() || undefined,
        formattedAddress: settingsForm.formattedAddress.trim() || undefined,
        latitude: settingsForm.latitude ?? undefined,
        longitude: settingsForm.longitude ?? undefined,
        placeId: settingsForm.placeId.trim() || undefined,
        locationVisibility: settingsForm.locationVisibility || undefined,
        serviceRadiusKm: settingsForm.serviceRadiusKm ? parseInt(settingsForm.serviceRadiusKm) : undefined,
        deliveryZones: settingsForm.deliveryZones ? settingsForm.deliveryZones.split(',').map(z => z.trim()).filter(Boolean) : undefined,
      });
      setBusiness(updated);
      // Update user profile (email, phone, avatar)
      const profilePayload: Record<string, unknown> = {};
      if (avatarUrl && avatarUrl !== user?.profile?.avatarUrl) profilePayload.avatarUrl = avatarUrl;
      if (settingsForm.email.trim() && settingsForm.email.trim() !== user?.email) profilePayload.email = settingsForm.email.trim();
      if (settingsForm.phone.trim() && settingsForm.phone.trim() !== user?.phone) profilePayload.phone = settingsForm.phone.trim();
      if (Object.keys(profilePayload).length > 0) {
        await authApi.completeProfile(profilePayload as any);
      }
      // Change password if both fields filled
      if (settingsForm.currentPassword && settingsForm.newPassword) {
        if (settingsForm.newPassword !== settingsForm.confirmPassword) {
          setSettingsMsg('Les mots de passe ne correspondent pas.'); setSettingsSaving(false); return;
        }
        if (settingsForm.newPassword.length < 8) {
          setSettingsMsg('Le mot de passe doit contenir au moins 8 caractères.'); setSettingsSaving(false); return;
        }
        await authApi.changePassword(settingsForm.currentPassword, settingsForm.newPassword);
      }
      // Clean up avatar preview
      if (settingsAvatarPreview) URL.revokeObjectURL(settingsAvatarPreview);
      setSettingsAvatarFile(null);
      setSettingsAvatarPreview(null);
      setSettingsForm(f => ({ ...f, avatar: avatarUrl, currentPassword: '', newPassword: '', confirmPassword: '' }));
      await refreshUser();
      setSettingsMsg(t('biz.settingsSaved'));
    } catch {
      setSettingsMsg(t('biz.saveError'));
    } finally {
      setSettingsSaving(false);
    }
  };

  // ── Sécurité: TOTP handlers ──
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    const loadSecData = async () => {
      try {
        const [totpRes, sessRes] = await Promise.all([authApi.totpStatus(), authApi.sessions()]);
        if (!cancelled) {
          setBzTotpEnabled(totpRes.totpEnabled);
          setBzSessionsCount(sessRes.sessions.length);
        }
      } catch { /* skip */ }
    };
    void loadSecData();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const handleBzTotpSetup = async () => {
    setBzTotpBusy(true); setBzTotpMessage(null);
    try {
      const res = await authApi.totpSetup();
      const QRCode = await import('qrcode');
      const dataUrl = await QRCode.toDataURL(res.uri, { width: 200, margin: 1, color: { dark: '#ffffff', light: '#0d0720' } });
      setBzTotpQrDataUrl(dataUrl);
      setBzTotpSetupUri(res.uri);
      setBzTotpSetupSecret(res.secret);
      setBzTotpStep('setup');
    } catch (err) {
      setBzTotpMessage({ type: 'err', text: err instanceof Error ? err.message : 'Erreur configuration 2FA.' });
    } finally { setBzTotpBusy(false); }
  };

  const handleBzTotpEnable = async () => {
    if (bzTotpSetupCode.length !== 6) { setBzTotpMessage({ type: 'err', text: 'Code 6 chiffres requis.' }); return; }
    setBzTotpBusy(true); setBzTotpMessage(null);
    try {
      await authApi.totpEnable(bzTotpSetupCode);
      setBzTotpEnabled(true); setBzTotpStep('idle');
      setBzTotpSetupUri(null); setBzTotpSetupSecret(null); setBzTotpQrDataUrl(null); setBzTotpSetupCode('');
      setBzTotpMessage({ type: 'ok', text: '✅ 2FA activé avec succès !' });
    } catch (err) {
      setBzTotpMessage({ type: 'err', text: err instanceof Error ? err.message : 'Code invalide.' });
    } finally { setBzTotpBusy(false); }
  };

  const handleBzTotpDisable = async () => {
    if (!bzTotpDisablePassword) { setBzTotpMessage({ type: 'err', text: 'Mot de passe requis.' }); return; }
    setBzTotpBusy(true); setBzTotpMessage(null);
    try {
      await authApi.totpDisable(bzTotpDisablePassword);
      setBzTotpEnabled(false); setBzTotpStep('idle'); setBzTotpDisablePassword('');
      setBzTotpMessage({ type: 'ok', text: '🔓 2FA désactivé.' });
    } catch (err) {
      setBzTotpMessage({ type: 'err', text: err instanceof Error ? err.message : 'Mot de passe incorrect.' });
    } finally { setBzTotpBusy(false); }
  };

  const handleBzSendEmailVerification = async () => {
    if (!user?.email) { setBzEmailVerifMsg({ type: 'err', text: 'Aucun email sur ce compte.' }); return; }
    setBzEmailVerifBusy(true); setBzEmailVerifMsg(null);
    try {
      const res = await authApi.requestEmailVerification(user.email);
      setBzEmailVerifId(res.verificationId);
      setBzEmailVerifStep('sent');
      setBzEmailVerifMsg({ type: 'ok', text: 'Code envoyé ! Vérifiez votre boîte mail.' });
    } catch (err) {
      setBzEmailVerifMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erreur.' });
    } finally { setBzEmailVerifBusy(false); }
  };

  const handleBzConfirmEmailVerification = async () => {
    if (bzEmailVerifCode.length !== 6) { setBzEmailVerifMsg({ type: 'err', text: 'Code 6 chiffres requis.' }); return; }
    setBzEmailVerifBusy(true); setBzEmailVerifMsg(null);
    try {
      await authApi.confirmEmailVerification({ verificationId: bzEmailVerifId, code: bzEmailVerifCode });
      setBzEmailVerifStep('done');
      setBzEmailVerifMsg({ type: 'ok', text: '✅ Email vérifié !' });
      await refreshUser();
    } catch (err) {
      setBzEmailVerifMsg({ type: 'err', text: err instanceof Error ? err.message : 'Code invalide.' });
    } finally { setBzEmailVerifBusy(false); }
  };

  // ─── Page publique ───────────────────────────────────────
  const handleSavePage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pageSaving) return;
    setPageSaving(true);
    setPageMsg(null);
    try {
      const updated = await businesses.updateMe({
        publicName: pageForm.publicName.trim() || undefined,
        publicDescription: pageForm.publicDescription.trim() || undefined,
        city: pageForm.city.trim() || undefined,
        address: pageForm.address.trim() || undefined,
        logo: pageForm.logo.trim() || undefined,
        coverImage: pageForm.coverImage.trim() || undefined,
        country: pageForm.country.trim() || undefined,
        countryCode: pageForm.countryCode.trim() || undefined,
        region: pageForm.region.trim() || undefined,
        district: pageForm.district.trim() || undefined,
        formattedAddress: pageForm.formattedAddress.trim() || undefined,
        latitude: pageForm.latitude ?? undefined,
        longitude: pageForm.longitude ?? undefined,
        placeId: pageForm.placeId.trim() || undefined,
        locationVisibility: pageForm.locationVisibility || undefined,
        contactPhone: pageForm.contactPhone.trim() || null,
        contactEmail: pageForm.contactEmail.trim() || null,
        highlights: qualities,
        shopPhotos: shopPhotos,
      });
      setBusiness(updated);
      setPageMsg(t('biz.pageSaved'));
    } catch {
      setPageMsg(t('biz.saveError'));
    } finally {
      setPageSaving(false);
    }
  };

  // ─── Points forts : ajouter / supprimer ──────────────────
  const saveQualities = (next: Quality[]) => {
    setQualities(next);
  };
  const handleAddQuality = () => {
    if (!qualityDraft.name.trim()) return;
    const item: Quality = { id: `q-${Date.now()}`, icon: qualityDraft.icon, name: qualityDraft.name.trim(), description: qualityDraft.description.trim() };
    saveQualities([...qualities, item]);
    setQualityDraft({ icon: '⭐', name: '', description: '' });
  };
  const handleRemoveQuality = (id: string) => saveQualities(qualities.filter(q => q.id !== id));

  // ─── Photos boutique physique : ajouter / supprimer ──────
  const saveShopPhotos = (next: string[]) => {
    setShopPhotos(next);
  };
  const handleAddShopPhoto = (file: File) => {
    if (shopPhotos.length >= 3) { alert('Maximum 3 médias'); return; }
    const isVideo = file.type.startsWith('video/');
    if (isVideo && shopPhotos.some(u => u.startsWith('data:video/'))) { alert('Maximum 1 vidéo'); return; }
    if (isVideo && file.size > 50 * 1024 * 1024) { alert('Vidéo trop lourde (max 50 Mo)'); return; }
    readFileAndSet(file, url => saveShopPhotos([...shopPhotos, url]));
  };
  const handleRemoveShopPhoto = (idx: number) => saveShopPhotos(shopPhotos.filter((_, i) => i !== idx));

  // ─── Mise à jour statut commande ─────────────────────────
  const handleOrderStatus = async (orderId: string, status: OrderStatus) => {
    setOrderStatusBusyId(orderId);
    try {
      await orders.updateSellerOrderStatus(orderId, { status });
      invalidateCache('/orders/');
      const res = await orders.sellerOrders({ limit: 50 });
      setSellerOrders(res.orders);
      if (selectedBizOrder?.id === orderId) {
        const detail = await orders.detail(orderId);
        setSelectedBizOrder(detail);
      }
    } catch { /* ignore */ }
    finally { setOrderStatusBusyId(null); }
  };

  const handleRevealCode = async (orderId: string) => {
    setValidationCodeBusyId(orderId);
    try {
      const data = await orders.getValidationCode(orderId);
      setSellerValidationQr({ orderId, code: data.validationCode });
    } catch { /* ignore */ }
    finally { setValidationCodeBusyId(null); }
  };

  // ─── So-Kin : publier / supprimer ───────────────────────
  const handlePublishSokin = async () => {
    if (!sokinDraft.content.trim() || sokinPublishing) return;
    setSokinPublishing(true);
    try {
      const mediaUrls = sokinDraft.imageUrl ? [sokinDraft.imageUrl] : [];
      const post = await sokin.createPost({ text: sokinDraft.content.trim(), mediaUrls });
      setSokinPosts(prev => [post, ...prev]);
      setSokinDraft({ content: '', imageUrl: '' });
    } catch {
      // erreur silencieuse — conserver le brouillon
    } finally {
      setSokinPublishing(false);
    }
  };
  const handleDeleteSokin = async (id: string) => {
    try {
      await sokin.deletePost(id);
      setSokinPosts(prev => prev.filter(p => p.id !== id));
    } catch { /* ignore */ }
  };
  const handleArchiveSokin = async (id: string) => {
    try {
      const updated = await sokin.archivePost(id);
      setSokinPosts(prev => prev.map(p => p.id === id ? updated : p));
    } catch { /* ignore */ }
  };

  // ─── Contact search ─────────────────────────────────────
  const handleContactSearch = async () => {
    if (contactSearchQuery.trim().length < 2 || contactSearching) return;
    setContactSearching(true);
    try {
      const res = await messaging.searchUsers(contactSearchQuery.trim());
      setContactSearchResults(res.users.filter((u: { id: string }) => u.id !== user?.id));
    } catch { setContactSearchResults([]); }
    finally { setContactSearching(false); }
  };

  const handleStartConversation = async (targetUserId: string) => {
    try {
      await messaging.createDM(targetUserId);
      setContactSearchOpen(false);
      setContactSearchQuery('');
      setContactSearchResults([]);
      navigate('/messaging');
    } catch { /* ignore */ }
  };

  const handleCreateBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitBusy) return;
    setSubmitBusy(true);
    setSubmitError(null);
    try {
      const created = await businesses.create({
        legalName: form.legalName.trim(),
        publicName: form.publicName.trim(),
        description: form.description.trim() || undefined,
        city: form.city.trim(),
      });
      setBusiness(created);
      await refreshUser();
    } catch (error) {
      if (error instanceof ApiError) {
        setSubmitError(t('biz.createError').replace('{status}', String(error.status)));
      } else {
        setSubmitError(t('biz.createErrorGeneric'));
      }
    } finally {
      setSubmitBusy(false);
    }
  };

  if (isLoading || businessLoading) {
    return (
      <div className="ud-shell bz-shell bz-setup-shell">
        <section className="ud-glass-panel bz-glass-panel bz-setup-panel">
          <span className="ud-placeholder-icon">🏪</span>
          <h1 className="ud-placeholder-title">{t('biz.loading')}</h1>
          <p className="ud-placeholder-text">{t('biz.loadingDesc')}</p>
        </section>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  if (businessError) {
    return (
      <div className="ud-shell bz-shell bz-setup-shell">
        <section className="ud-glass-panel bz-glass-panel bz-setup-panel">
          <span className="ud-placeholder-icon">⚠</span>
          <h1 className="ud-placeholder-title">{t('biz.unavailable')}</h1>
          <p className="ud-placeholder-text">{businessError}</p>
        </section>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="ud-shell bz-shell bz-setup-shell">
        <section className="ud-glass-panel bz-glass-panel bz-setup-panel">
          <span className="ud-placeholder-icon">🏪</span>
          <h1 className="ud-placeholder-title">{t('biz.createTitle')}</h1>
          <p className="ud-placeholder-text">
            {t('biz.createDesc')}
          </p>

          <form className="bz-setup-form" onSubmit={handleCreateBusiness}>
            <div className="bz-setup-grid">
              <label className="bz-setup-field">
                <span>{t('biz.legalName')}</span>
                <input
                  type="text"
                  value={form.legalName}
                  onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))}
                  placeholder={t('biz.legalNamePh')}
                  minLength={2}
                  maxLength={150}
                  required
                />
              </label>

              <label className="bz-setup-field">
                <span>{t('biz.publicName')}</span>
                <input
                  type="text"
                  value={form.publicName}
                  onChange={(event) => setForm((current) => ({ ...current, publicName: event.target.value }))}
                  placeholder={t('biz.publicNamePh')}
                  minLength={2}
                  maxLength={150}
                  required
                />
              </label>

              <label className="bz-setup-field">
                <span>{t('biz.city')}</span>
                <LocationPicker
                  value={{ lat: 0, lng: 0, address: form.city }}
                  onChange={({ address, city }) => setForm((current) => ({ ...current, city: city || address }))}
                  placeholder={t('biz.cityPh')}
                />
              </label>

              <label className="bz-setup-field bz-setup-field--full">
                <span>{t('biz.description')}</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder={t('biz.descPh')}
                  maxLength={800}
                  rows={5}
                />
              </label>
            </div>

            {submitError ? <p className="bz-setup-error">{submitError}</p> : null}

            <div className="bz-setup-actions">
              <button type="submit" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" disabled={submitBusy}>
                {submitBusy ? t('biz.creating') : t('biz.createBtn')}
              </button>
              <button type="button" className="ud-quick-btn" onClick={() => navigate(getDashboardPath(user?.role))}>
                {t('biz.backToAccount')}
              </button>
            </div>
          </form>

          <p className="bz-setup-note">
            {t('biz.createNote')}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={`ud-shell bz-shell${sidebarCollapsed ? ' ud-sidebar-collapsed' : ''}`}>
      {/* ─── MOBILE HEADER (scroll-hide) ─────────────────── */}
      <header className={`dash-mobile-header${barsHidden ? ' dash-bars-hidden' : ''}`}>
        <button className="dash-mob-hamburger" onClick={() => setMobileSidebarOpen(o => !o)} aria-label="Menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <Link to="/" className="dash-mob-logo dash-mob-logo--shimmer" aria-label="Kin-Sell — Accueil">
          <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span>Kin-Sell</span>
        </Link>
        <button className="dash-mob-search" onClick={() => setMobileSearchOpen(o => !o)} aria-label="Rechercher">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
      </header>

      {/* ─── MOBILE SEARCH BAR ───────────────────────────── */}
      {mobileSearchOpen && (
        <div className="dash-mob-search-bar">
          <form onSubmit={e => { e.preventDefault(); if (mobileSearchQuery.trim()) { navigate(`/explorer?q=${encodeURIComponent(mobileSearchQuery.trim())}`); setMobileSearchOpen(false); } }}>
            <input
              type="search"
              className="dash-mob-search-input"
              placeholder={t('common.searchPlaceholder') || 'Rechercher sur Kin-Sell…'}
              value={mobileSearchQuery}
              onChange={e => setMobileSearchQuery(e.target.value)}
              autoFocus
            />
            <button type="button" className="dash-mob-search-close" onClick={() => { setMobileSearchOpen(false); setMobileSearchQuery(''); }}>✕</button>
          </form>
        </div>
      )}

      {/* ─── OVERLAY MOBILE ──────────────────────────────── */}
      {mobileSidebarOpen && <div className="dash-mob-overlay" onClick={() => setMobileSidebarOpen(false)} />}

      {/* ─── SIDEBAR / DRAWER ────────────────────────────── */}
      <aside className={`ud-sidebar bz-sidebar${mobileSidebarOpen ? ' ud-sidebar-open' : ''}`}>
        <button
          type="button"
          className="ud-collapse-btn"
          onClick={() => setSidebarCollapsed(v => !v)}
          aria-label={sidebarCollapsed ? t('biz.openMenu') : t('biz.closeMenu')}
        >
          {sidebarCollapsed ? '▶' : '◀'}
        </button>

        {/* Profil entreprise */}
        <div className="ud-profile-card bz-profile-card">
          <div className="ud-avatar bz-logo-avatar">
            {user?.profile?.avatarUrl
              ? <img src={user.profile.avatarUrl} alt={user.profile.displayName} />
              : businessLogo
                ? <img src={businessLogo} alt={businessName} />
                : <span className="ud-avatar-initials">{(user?.profile?.displayName ?? businessName).slice(0, 2).toUpperCase()}</span>
            }
            {businessVerified && <span className="bz-verified-badge" title={t('biz.shopActiveTitle')}>✓</span>}
          </div>
          {!sidebarCollapsed && (
            <div className="ud-profile-info">
              <strong className="ud-profile-name">{user?.profile?.displayName ?? businessName}</strong>
              <span className="bz-drawer-biz-name">{businessName}</span>
              <span className={tier.cls}>{tier.label}</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="ud-nav" aria-label={t('biz.navMenu')}>
          {navItems.map(item => (
            <button
              key={item.key}
              type="button"
              className={`ud-nav-item${activeSection === item.key ? ' ud-nav-item--active' : ''}`}
              onClick={() => {
                if (item.key === 'messages') {
                  navigate('/messaging');
                  return;
                }
                setActiveSection(item.key);
                setMobileSidebarOpen(false);
              }}
            >
              <span className="ud-nav-icon">{item.icon}</span>
              {!sidebarCollapsed && <span className="ud-nav-label">{t(item.labelKey)}</span>}
            </button>
          ))}
        </nav>

        {/* CTA Upgrade */}
        {!sidebarCollapsed && deriveTier(myPlan?.planCode) !== 'premium' && (
          <div className="ud-premium-cta bz-upgrade-cta">
            <span className="ud-premium-badge bz-upgrade-badge">{t('biz.premiumTag')}</span>
            <p>{t('biz.premiumDesc')}</p>
            <a href="/forfaits" className="ud-premium-btn bz-upgrade-btn">{t('biz.upgradeBtn')}</a>
          </div>
        )}

        <div className="ud-drawer-logout">
          <button type="button" className="ud-drawer-logout-btn" onClick={() => { logout(); navigate('/login'); }}>
            🚪 {t('common.logout')}
          </button>
        </div>
      </aside>

      {/* ─── CONTENU PRINCIPAL ───────────────────────────── */}
      <main className="ud-main" id="bz-main-content">

        {/* Header page */}
        <div className="ud-page-header bz-page-header">
          <div>
            <h1 className="ud-page-title">
              {t(navItems.find(n => n.key === activeSection)?.labelKey ?? 'biz.navDashboard')}
            </h1>
            <p className="ud-page-sub">{t('biz.cockpit')} — {businessName} · /business/{businessSlug}</p>
          </div>
          <div className="ud-page-header-actions">
            <button type="button" className="ud-quick-btn" onClick={() => {
              if (activeSection === 'produits' && allProduits.length > 0) { openProdPromo(allProduits); }
              else if (activeSection === 'services' && allServices.length > 0) { openSvcPromo(allServices); }
              else { setActiveSection('produits'); }
            }}>
              {t('biz.launchPromo')}
            </button>
            <button type="button" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" onClick={() => { setActiveSection('produits'); setCreateMode('produit'); setCreateStep(1); setEditingArticleId(null); }}>
              {t('biz.addProduct')}
            </button>
          </div>
        </div>

        {/* ── DASHBOARD ── */}
        {activeSection === 'dashboard' && (
          <div className="ud-section animate-fade-in">

            {/* Cartes KPI */}
            <div className="ud-stats-row">
              <article className="ud-stat-card ud-stat-card--green bz-stat-card">
                <span className="ud-stat-icon">💰</span>
                <div>
                  <p className="ud-stat-label">{t('biz.revenue')}</p>
                  <strong className="ud-stat-value">{formatMoneyFromUsdCents(kpis.totalUsdCents)}</strong>
                </div>
              </article>
              <article className="ud-stat-card ud-stat-card--blue bz-stat-card">
                <span className="ud-stat-icon">📈</span>
                <div>
                  <p className="ud-stat-label">{t('biz.monthlySales')}</p>
                  <strong className="ud-stat-value">{formatMoneyFromUsdCents(kpis.monthUsdCents)}</strong>
                </div>
              </article>
              <article className="ud-stat-card ud-stat-card--amber bz-stat-card">
                <span className="ud-stat-icon">🛒</span>
                <div>
                  <p className="ud-stat-label">{t('biz.activeOrders')}</p>
                  <strong className="ud-stat-value">{kpis.activeCount}</strong>
                </div>
              </article>
              <article className="ud-stat-card ud-stat-card--gold bz-stat-card">
                <span className="ud-stat-icon">🧾</span>
                <div>
                  <p className="ud-stat-label">{t('biz.avgCart')}</p>
                  <strong className="ud-stat-value">{formatMoneyFromUsdCents(kpis.avgUsdCents)}</strong>
                </div>
              </article>
            </div>

            {/* Grille principale */}
            <div className="ud-grid-main bz-grid-main">

              {/* Commandes récentes */}
              <section className="ud-glass-panel bz-glass-panel ud-panel--transactions">
                <div className="ud-panel-head">
                  <h2 className="ud-panel-title">{t('biz.recentOrders')}</h2>
                  <button type="button" className="ud-panel-see-all" onClick={() => setActiveSection('commandes')}>{t('biz.seeAll')}</button>
                </div>
                {sellerOrders.length === 0 ? (
                  <p className="ud-placeholder-text" style={{ padding: 'var(--space-md)' }}>
                    {dataLoading ? t('biz.loadingData') : t('biz.noOrders')}
                  </p>
                ) : (
                  <table className="ud-table">
                    <thead>
                      <tr><th>{t('biz.thId')}</th><th>{t('biz.thClient')}</th><th>{t('biz.thArticles')}</th><th>{t('biz.thAmount')}</th><th>{t('biz.thStatus')}</th></tr>
                    </thead>
                    <tbody>
                      {sellerOrders.slice(0, 4).map(o => {
                        const s = ORDER_STATUS_MAP[o.status] ?? { labelKey: o.status, cls: 'ud-badge' };
                        return (
                          <tr key={o.id}>
                            <td className="ud-table-id">#{o.id.slice(0, 8).toUpperCase()}</td>
                            <td>{o.buyer.displayName}</td>
                            <td>{o.itemsCount} {t('biz.art')}</td>
                            <td>{formatMoneyFromUsdCents(o.totalUsdCents)}</td>
                            <td><span className={s.cls}>{t(s.labelKey)}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>

              {/* Analytics résumé */}
              <section className="ud-glass-panel bz-glass-panel ud-panel--avis">
                <h2 className="ud-panel-title">{t('biz.analytics')}</h2>
                <div className="bz-analytics-mini">
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.activeListings')}</span>
                    <strong className="bz-analytics-val">{listingStats?.active ?? '—'}</strong>
                  </div>
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.totalListings')}</span>
                    <strong className="bz-analytics-val">{listingStats?.total ?? '—'}</strong>
                  </div>
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.ordersReceived')}</span>
                    <strong className="bz-analytics-val">{sellerOrders.length}</strong>
                  </div>
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.uniqueClients')}</span>
                    <strong className="bz-analytics-val">{clientsData.length}</strong>
                  </div>
                </div>
                <div className="bz-ai-reco">
                  <span className="bz-ai-tag">{t('biz.activePlan')}</span>
                  <p>{myPlan ? `${myPlan.planName} — ${myPlan.status === 'ACTIVE' ? t('biz.active') : myPlan.status}` : t('biz.noPlan')}</p>
                </div>
              </section>

              {/* Top produits */}
              <section className="ud-glass-panel bz-glass-panel ud-panel--messages">
                <div className="ud-panel-head">
                  <h2 className="ud-panel-title">{t('biz.myProducts')}</h2>
                  <button type="button" className="ud-panel-see-all" onClick={() => setActiveSection('produits')}>{t('biz.manage')}</button>
                </div>
                {produits.length === 0 ? (
                  <p className="ud-placeholder-text" style={{ padding: 'var(--space-md)' }}>
                    {dataLoading ? t('biz.loadingData') : t('biz.noProducts')}
                  </p>
                ) : (
                  <ul className="bz-product-list">
                    {produits.slice(0, 5).map(p => (
                      <li key={p.id} className="bz-product-item">
                        <div className="bz-product-icon">📦</div>
                        <div className="bz-product-info">
                          <strong>{p.title}</strong>
                          <span>{formatMoneyFromUsdCents(p.priceUsdCents)} · {p.category}</span>
                        </div>
                        <span className={`bz-stock-badge${(p.stockQuantity ?? 99) <= 5 ? ' bz-stock-badge--low' : ''}`}>
                          {p.stockQuantity != null ? `${p.stockQuantity} ${t('biz.inStock')}` : '∞'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Actions rapides */}
              <section className="ud-glass-panel bz-glass-panel ud-panel--actions">
                <h2 className="ud-panel-title">{t('biz.quickActions')}</h2>
                <div className="ud-actions-grid">
                  <button type="button" className="ud-action-tile bz-action-tile" onClick={() => { setActiveSection('produits'); setCreateMode('produit'); setCreateStep(1); }}>
                    <span className="ud-action-icon">📦</span>
                    <span>{t('biz.addProductAction')}</span>
                  </button>
                  <button type="button" className="ud-action-tile bz-action-tile" onClick={() => { setActiveSection('services'); setCreateMode('service'); setCreateStep(1); }}>
                    <span className="ud-action-icon">🛠️</span>
                    <span>{t('biz.addServiceAction')}</span>
                  </button>
                  <button type="button" className="ud-action-tile bz-action-tile" onClick={() => setActiveSection('commandes')}>
                    <span className="ud-action-icon">🛒</span>
                    <span>{t('biz.seeOrders')}</span>
                  </button>
                  <button type="button" className="ud-action-tile bz-action-tile" onClick={() => setActiveSection('contacts')}>
                    <span className="ud-action-icon">🤝</span>
                    <span>{t('biz.contactsTitle')}</span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ── BOUTIQUE ── */}
        {activeSection === 'boutique' && (
          <div className="ud-section animate-fade-in">

            {/* ── Ligne 2 : Lien page publique ── */}
            <div className="bz-public-preview-bar">
              <div>
                <strong>Page publique :</strong>{' '}
                <span className="ud-page-sub">{window.location.origin}/business/{businessSlug}</span>
              </div>
              <button type="button" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" onClick={() => window.open(`/business/${businessSlug}`, '_blank', 'noopener,noreferrer')}>
                🔍 Aperçu en direct →
              </button>
            </div>

            {/* ── Ligne 3 : Récapitulatif ── */}
            <section className="ud-glass-panel bz-glass-panel bz-bout-recap">
              <div className="bz-bout-recap-left">
                <div className="bz-bout-recap-logo">
                  {(pageForm.logo || businessLogo)
                    ? <img src={pageForm.logo || businessLogo || undefined} alt={pageForm.publicName || businessName} />
                    : <span className="ud-avatar-initials bz-public-id-initials">{businessName.slice(0, 2).toUpperCase()}</span>
                  }
                </div>
                <div className="bz-bout-recap-info">
                  <strong className="bz-public-id-name">{pageForm.publicName || businessName}</strong>
                  <span className={tier.cls}>{tier.label}</span>
                  <span className="ud-page-sub">📍 {pageForm.city || business?.shop?.city || 'Kinshasa'}{pageForm.country ? `, ${pageForm.country}` : ''}</span>
                  <p className="bz-bout-recap-bio">{pageForm.publicDescription || business?.shop?.publicDescription || t('biz.noDesc')}</p>
                  <span className="ud-badge ud-badge--done" style={{ width: 'fit-content' }}>
                    {businessVerified ? '✓ Boutique active' : '⏳ Boutique en attente'}
                  </span>
                </div>
              </div>
              {(pageForm.coverImage || business?.shop?.coverImage) && (
                <div className="bz-bout-recap-cover">
                  <span className="bz-bout-recap-cover-label">Couverture</span>
                  <img src={pageForm.coverImage || business?.shop?.coverImage || ''} alt="Couverture" />
                </div>
              )}
            </section>

            {/* ── Ligne 4 : Modifier la page publique ── */}
            <form className="bz-setup-form" onSubmit={handleSavePage}>
              <section className="ud-glass-panel bz-glass-panel">
                <h2 className="ud-panel-title">Modifier la page publique</h2>

                {/* Logo cliquable avec badge de suppression */}
                <div className="bz-bout-edit-logo-wrap">
                  {pageForm.logo ? (
                    <div className="bz-bout-edit-logo-preview">
                      <label className="bz-bout-edit-logo-img-wrap">
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) readFileAndSet(f, url => setPageForm(p => ({ ...p, logo: url }))); e.target.value = ''; }} style={{ display: 'none' }} />
                        <img src={pageForm.logo} alt="Logo" className="bz-bout-edit-logo-img" />
                      </label>
                      <button type="button" className="bz-bout-edit-logo-remove" onClick={() => setPageForm(f => ({ ...f, logo: '' }))} title="Supprimer le logo">✕</button>
                      <span className="bz-bout-edit-logo-label">Logo / Photo de profil boutique</span>
                    </div>
                  ) : (
                    <label className="bz-bout-edit-logo-empty">
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) readFileAndSet(f, url => setPageForm(p => ({ ...p, logo: url }))); e.target.value = ''; }} style={{ display: 'none' }} />
                      <span className="bz-photo-drop-icon">🖼️</span>
                      <span className="bz-photo-drop-text">Logo / Photo de profil</span>
                    </label>
                  )}
                </div>

                {/* Ligne 1 du box : Nom public + Ville */}
                <div className="bz-setup-grid">
                  <label className="bz-setup-field">
                    <span>Nom public affiché *</span>
                    <input type="text" value={pageForm.publicName} onChange={e => setPageForm(f => ({ ...f, publicName: e.target.value }))} maxLength={150} placeholder="City Market" />
                  </label>
                  <label className="bz-setup-field">
                    <span>Ville *</span>
                    <LocationPicker
                      value={pageForm.latitude && pageForm.longitude ? { lat: pageForm.latitude, lng: pageForm.longitude, address: pageForm.city || pageForm.formattedAddress } : undefined}
                      onChange={({ address, city }) => setPageForm(f => ({ ...f, city: city || address }))}
                      onStructuredChange={(loc) => setPageForm(f => ({ ...f, city: loc.city || loc.formattedAddress, address: loc.formattedAddress || f.address, country: loc.country || '', countryCode: loc.countryCode || '', region: loc.region || '', district: loc.district || '', formattedAddress: loc.formattedAddress || '', latitude: loc.latitude, longitude: loc.longitude, placeId: loc.placeId || '' }))}
                      placeholder="Kinshasa"
                    />
                    {pageForm.latitude && pageForm.longitude && (
                      <small className="ud-page-sub" style={{ marginTop: 4 }}>📌 {pageForm.latitude.toFixed(6)}, {pageForm.longitude.toFixed(6)}</small>
                    )}
                  </label>
                </div>

                {/* Ligne 2 du box : Adresse physique + Visibilité */}
                <div className="bz-setup-grid" style={{ marginTop: 14 }}>
                  <label className="bz-setup-field">
                    <span>Adresse physique</span>
                    <input type="text" value={pageForm.address} readOnly style={{ opacity: 0.6 }} placeholder="Résolu automatiquement depuis la ville" />
                  </label>
                  <div className="bz-setup-field">
                    <span>🔒 Visibilité</span>
                    <VisibilitySelector value={pageForm.locationVisibility} onChange={(v: LocationVisibility) => setPageForm(f => ({ ...f, locationVisibility: v }))} />
                  </div>
                </div>

                {/* Ligne 3 du box : Photo de couverture */}
                <div style={{ marginTop: 14 }}>
                  <span className="bz-setup-field-label-text">Photo de couverture</span>
                  {pageForm.coverImage ? (
                    <div className="bz-bout-cover-preview">
                      <label className="bz-bout-cover-img-wrap">
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) readFileAndSet(f, url => setPageForm(p => ({ ...p, coverImage: url }))); e.target.value = ''; }} style={{ display: 'none' }} />
                        <img src={pageForm.coverImage} alt="Couverture" className="bz-bout-cover-img" />
                      </label>
                      <button type="button" className="bz-bout-edit-logo-remove" onClick={() => setPageForm(f => ({ ...f, coverImage: '' }))} title="Supprimer la couverture">✕</button>
                    </div>
                  ) : (
                    <label className="bz-photo-drop-zone" style={{ marginTop: 6 }}>
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) readFileAndSet(f, url => setPageForm(p => ({ ...p, coverImage: url }))); e.target.value = ''; }} />
                      <span className="bz-photo-drop-icon">🌆</span>
                      <span className="bz-photo-drop-text">Importer une couverture</span>
                      <small className="bz-photo-drop-hint">JPEG, PNG, WebP · max 2 Mo</small>
                    </label>
                  )}
                </div>
              </section>

              {/* ── Ligne 5 : Description ── */}
              <section className="ud-glass-panel bz-glass-panel">
                <label className="bz-setup-field bz-setup-field--full">
                  <span>Description visible par les clients</span>
                  <textarea value={pageForm.publicDescription} onChange={e => setPageForm(f => ({ ...f, publicDescription: e.target.value }))} maxLength={800} rows={5} placeholder="Décrivez votre boutique, vos produits phares, vos horaires..." />
                  <small className="ud-page-sub">{pageForm.publicDescription.length}/800 caractères</small>
                </label>
              </section>

              {/* ── Ligne 6 : Contact ── */}
              <div className="bz-bout-contact-row">
                <section className="ud-glass-panel bz-glass-panel bz-bout-contact-box">
                  <label className="bz-setup-field">
                    <span>📞 Téléphone de contact</span>
                    <input type="tel" value={pageForm.contactPhone} onChange={e => setPageForm(f => ({ ...f, contactPhone: e.target.value }))} maxLength={30} placeholder="+212 6XX XXX XXX" />
                  </label>
                </section>
                <section className="ud-glass-panel bz-glass-panel bz-bout-contact-box">
                  <label className="bz-setup-field">
                    <span>✉️ Email de contact</span>
                    <input type="email" value={pageForm.contactEmail} onChange={e => setPageForm(f => ({ ...f, contactEmail: e.target.value }))} maxLength={150} placeholder="contact@mon-entreprise.com" />
                  </label>
                </section>
              </div>

              {/* ── Ligne 7 : Points forts ── */}
              <section className="ud-glass-panel bz-glass-panel">
                <h2 className="ud-panel-title">✨ Points forts</h2>
                <p className="ud-page-sub" style={{ marginBottom: 'var(--space-md)' }}>Ces atouts apparaissent sur votre page publique pour rassurer les clients.</p>

                {qualities.length > 0 && (
                  <div className="bz-qualities-list">
                    {qualities.map(q => (
                      <div key={q.id} className="bz-quality-row">
                        <span className="bz-quality-icon">{q.icon}</span>
                        <div className="bz-quality-info">
                          <strong>{q.name}</strong>
                          <span className="ud-page-sub">{q.description}</span>
                        </div>
                        <button type="button" className="bz-photo-remove-btn" onClick={() => handleRemoveQuality(q.id)} title="Supprimer">✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bz-quality-add-form">
                  <div className="bz-quality-add-row">
                    <select value={qualityDraft.icon} onChange={e => setQualityDraft(d => ({ ...d, icon: e.target.value }))} className="bz-quality-icon-select">
                      {['⭐', '🔒', '📈', '🚀', '💎', '🤝', '⚡', '🎯', '✅', '🏆', '💬', '📍'].map(ic => <option key={ic} value={ic}>{ic}</option>)}
                    </select>
                    <input type="text" placeholder="Nom du point fort" value={qualityDraft.name} onChange={e => setQualityDraft(d => ({ ...d, name: e.target.value }))} maxLength={60} />
                  </div>
                  <input type="text" placeholder="Description courte (optionnel)" value={qualityDraft.description} onChange={e => setQualityDraft(d => ({ ...d, description: e.target.value }))} maxLength={200} style={{ width: '100%' }} />
                  <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={handleAddQuality} disabled={!qualityDraft.name.trim()}>
                    + Ajouter un point fort
                  </button>
                </div>
              </section>

              {/* ── Ligne 8 : Photos & vidéo de la boutique ── */}
              <section className="ud-glass-panel bz-glass-panel">
                <h2 className="ud-panel-title">📸 Images et vidéo de la boutique</h2>
                <p className="ud-page-sub" style={{ marginBottom: 'var(--space-md)' }}>Médias représentant votre espace physique, visibles en bas de votre page publique (max 3). Au moins 3 photos ou au moins 1 vidéo (ex : 3 photos, 1 vidéo, 2 photos + 1 vidéo).</p>

                {shopPhotos.length > 0 && (
                  <div className="bz-shop-photos-grid">
                    {shopPhotos.map((url, idx) => {
                      const isVideo = url.startsWith('data:video/');
                      return (
                        <div key={idx} className="bz-shop-photo-item">
                          {isVideo ? <video src={url} controls muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={url} alt={`Boutique ${idx + 1}`} />}
                          <button type="button" className="bz-photo-remove-btn bz-shop-photo-remove" onClick={() => handleRemoveShopPhoto(idx)}>✕</button>
                          {isVideo && <span className="bz-bout-media-badge">🎬</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {shopPhotos.length < 3 && (
                  <label className="bz-photo-drop-zone" style={{ marginTop: 'var(--space-sm)' }}>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple onChange={e => { const files = e.target.files; if (files) Array.from(files).forEach(f => handleAddShopPhoto(f)); e.target.value = ''; }} />
                    <span className="bz-photo-drop-icon">📷</span>
                    <span className="bz-photo-drop-text">Ajouter une photo ou vidéo de votre boutique</span>
                    <small className="bz-photo-drop-hint">JPEG, PNG, WebP, MP4, WebM · {shopPhotos.length}/3</small>
                  </label>
                )}
              </section>

              {/* ── Ligne 9 : Boutons centré ── */}
              {pageMsg && <p className={`bz-setup-${pageMsg.startsWith('✓') ? 'note' : 'error'}`} style={{ textAlign: 'center' }}>{pageMsg}</p>}
              <div className="bz-bout-footer-actions">
                <button type="submit" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" disabled={pageSaving}>
                  {pageSaving ? '⏳ Enregistrement...' : '✓ Enregistrer & publier'}
                </button>
                <button type="button" className="ud-quick-btn" onClick={() => window.open(`/business/${businessSlug}`, '_blank', 'noopener,noreferrer')}>
                  🔍 Voir la page
                </button>
              </div>
            </form>

          </div>
        )}

        {/* ── PRODUITS ── */}
        {activeSection === 'produits' && (
          <div className="ud-section animate-fade-in">
            {/* ── Topbar ── */}
            <div className="bz-art-topbar">
              <div className="bz-art-topbar-left">
                <h2 className="bz-art-topbar-title">📦 {t('biz.myProducts')}</h2>
                <div className="bz-art-stats-inline">
                  <span className="bz-art-stat-chip bz-art-stat-chip--active">{prodStats.active} actifs</span>
                  <span className="bz-art-stat-chip">{prodStats.inactive} inactifs</span>
                  <span className="bz-art-stat-chip">{prodStats.archived} archivés</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="bz-art-publish-btn" style={{ background: 'rgba(214,170,80,.15)', color: '#d6aa50' }} onClick={() => { setImportOpen(importOpen === 'produit' ? null : 'produit'); setImportMsg(null); setImportProgress(null); }}>
                  <span className="bz-art-publish-icon">📥</span>
                  {importOpen === 'produit' ? '✕ Fermer' : 'Importer'}
                </button>
                <button type="button" className="bz-art-publish-btn" onClick={() => { setCreateMode(createMode === 'produit' ? null : 'produit'); setCreateStep(1); setCreateUploadFiles([]); setCreateUploadPreviews(p => { p.forEach(u => URL.revokeObjectURL(u)); return []; }); setCreateMsg(null); setEditingArticleId(null); }}>
                  <span className="bz-art-publish-icon">+</span>
                  {createMode === 'produit' ? t('biz.cancelBtn') : t('biz.newProduct')}
                </button>
              </div>
            </div>

            {/* ── Import zone ── */}
            {importOpen === 'produit' && (
              <div className="bz-import-zone" style={{ marginBottom: 'var(--space-lg)' }}>
                <h3 style={{ margin: '0 0 var(--space-sm)' }}>📥 Importer des produits en masse</h3>
                <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 var(--space-md)' }}>
                  Formats acceptés : <strong>.csv</strong>, <strong>.json</strong>, <strong>.xml</strong><br />
                  Colonnes attendues : titre, categorie, prix (CDF), stock, description, ville
                </p>
                <label className="bz-photo-drop-zone bz-import-drop">
                  <input type="file" accept=".csv,.json,.xml" disabled={importBusy} onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f, 'PRODUIT'); e.target.value = ''; }} />
                  <span className="bz-photo-drop-icon">📄</span>
                  <span className="bz-photo-drop-text">{importBusy ? 'Import en cours…' : 'Glissez ou cliquez pour choisir un fichier'}</span>
                </label>
                {importProgress && (
                  <div style={{ marginTop: 'var(--space-sm)' }}>
                    <div className="bz-import-progress-bar"><div className="bz-import-progress-fill" style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }} /></div>
                    <small>{importProgress.done} / {importProgress.total}</small>
                  </div>
                )}
                {importMsg && <p className={`bz-setup-${importMsg.startsWith('✓') ? 'note' : 'error'}`} style={{ marginTop: 'var(--space-sm)' }}>{importMsg}</p>}
              </div>
            )}

            {/* ── Formulaire création produit ── */}
            {createMode === 'produit' && (
              <form className="bz-setup-form ud-publish-modal" style={{ marginBottom: 'var(--space-lg)' }} onSubmit={handleCreateListing}>
                {createStep === 1 && (
                  <div className="ud-publish-step-content">
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.titleLabel')} *</span>
                      <input className="ud-input" type="text" required minLength={2} maxLength={140} value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: iPhone 14 Pro 256GB neuf sous scellé" />
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.categoryLabel')} *</span>
                      <select className="ud-input" required value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}>
                        <option value="">Choisir une catégorie</option>
                        {LISTING_PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.descriptionLabel')}</span>
                      <textarea className="ud-input" rows={4} maxLength={1200} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Description détaillée du produit..." />
                      <span className="ud-publish-field-hint">{createForm.description.length}/1200 caractères</span>
                    </label>
                    <div className="ud-publish-nav">
                      <span />
                      <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => { if (!createForm.title.trim()) { setCreateMsg('Le titre est requis'); return; } if (!createForm.category) { setCreateMsg('La catégorie est requise'); return; } setCreateMsg(null); setCreateStep(2); }}>Suivant →</button>
                    </div>
                  </div>
                )}
                {createStep === 2 && (
                  <div className="ud-publish-step-content">
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.priceCdf')} ({currency}) *</span>
                      <div className="ud-publish-price-wrap">
                        <span className="ud-publish-price-symbol">{CURRENCY_SYMBOLS[currency] || currency}</span>
                        <input className="ud-input" type="number" required min={0} value={createForm.priceCdf} onChange={e => setCreateForm(f => ({ ...f, priceCdf: e.target.value }))} placeholder="0" />
                      </div>
                      {createForm.priceCdf && parseInt(createForm.priceCdf) > 0 && (
                        <span className="ud-publish-field-hint">≈ {(parseInt(createForm.priceCdf) / getCurrencyRate(currency)).toFixed(2)} $ USD</span>
                      )}
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.cityLabel')} *</span>
                      <LocationPicker value={{ lat: createForm.latitude, lng: createForm.longitude, address: createForm.city }} onChange={({ address, city, lat, lng }) => setCreateForm(f => ({ ...f, city: city || address, latitude: lat, longitude: lng }))} onStructuredChange={(loc) => setCreateForm(f => ({ ...f, city: loc.city || loc.formattedAddress, latitude: loc.latitude ?? f.latitude, longitude: loc.longitude ?? f.longitude, country: loc.country || f.country, countryCode: loc.countryCode || f.countryCode, region: loc.region || '', district: loc.district || '', formattedAddress: loc.formattedAddress || '', placeId: loc.placeId || '' }))} placeholder="Kinshasa" />
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.stockLabel')}</span>
                      <input className="ud-input" type="number" min={0} value={createForm.stock} onChange={e => setCreateForm(f => ({ ...f, stock: e.target.value }))} placeholder="∞ (illimité)" />
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">🔒 Visibilité</span>
                      <VisibilitySelector value={createForm.locationVisibility} onChange={(v: LocationVisibility) => setCreateForm(f => ({ ...f, locationVisibility: v }))} />
                    </label>
                    <label className="ud-publish-field" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={createForm.isNegotiable} onChange={e => setCreateForm(f => ({ ...f, isNegotiable: e.target.checked }))} />
                      <span>{t('negotiation.allowPrice')}</span>
                    </label>
                    <div className="ud-publish-nav">
                      <button type="button" className="ud-quick-btn" onClick={() => setCreateStep(1)}>← Retour</button>
                      <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => setCreateStep(3)}>Suivant →</button>
                    </div>
                  </div>
                )}
                {createStep === 3 && (
                  <div className="ud-publish-step-content">
                    <div className="ud-publish-media-zone">
                      <p className="ud-publish-field-label">📷 Photos & Vidéo</p>
                      <p className="ud-publish-field-hint" style={{ marginBottom: '0.75rem' }}>Max 5 photos + 1 vidéo (50 Mo max)</p>
                      <div className="ud-publish-media-grid">
                        {createUploadPreviews.map((url, i) => {
                          const file = createUploadFiles[i];
                          const isVideo = file?.type.startsWith('video/');
                          return (
                            <div key={url} className="ud-publish-media-thumb">
                              {isVideo ? <video src={url} className="ud-publish-media-img" muted /> : <img src={url} alt={`Media ${i + 1}`} className="ud-publish-media-img" />}
                              <button type="button" className="ud-publish-media-remove" onClick={() => removeCreateFile(i)}>✕</button>
                              {isVideo && <span className="ud-publish-media-badge">🎬 Vidéo</span>}
                            </div>
                          );
                        })}
                        {createUploadFiles.length < 6 && (
                          <label className="ud-publish-media-add">
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple onChange={handleCreateFileSelect} style={{ display: 'none' }} />
                            <span className="ud-publish-media-add-icon">+</span>
                            <span className="ud-publish-media-add-label">Ajouter</span>
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="ud-publish-summary">
                      <h3 className="ud-publish-summary-title">Récapitulatif</h3>
                      <div className="ud-publish-summary-grid">
                        <span>Type</span><strong>📦 Produit</strong>
                        <span>Titre</span><strong>{createForm.title || '–'}</strong>
                        <span>Catégorie</span><strong>{createForm.category || '–'}</strong>
                        <span>Prix</span><strong>{createForm.priceCdf && parseInt(createForm.priceCdf) > 0 ? `${new Intl.NumberFormat('fr-CD').format(parseInt(createForm.priceCdf))} ${CURRENCY_SYMBOLS[currency] || currency}` : 'Prix libre'}</strong>
                        <span>Ville</span><strong>{createForm.city || '–'}</strong>
                        {createForm.stock && <><span>Stock</span><strong>{createForm.stock}</strong></>}
                        <span>Médias</span><strong>{createUploadFiles.length} fichier(s)</strong>
                      </div>
                    </div>
                    {createMsg && <p className={`bz-setup-${createMsg.startsWith('✓') ? 'note' : 'error'}`}>{createMsg}</p>}
                    <div className="ud-publish-nav">
                      <button type="button" className="ud-quick-btn" onClick={() => setCreateStep(2)}>← Retour</button>
                      <button type="submit" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" disabled={createBusy}>
                        {createBusy ? '⏳ Publication...' : editingArticleId ? '✏️ Modifier le produit' : '🚀 Publier le produit'}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}

            {/* ── Notification actions ── */}
            {bzActionMsg && (
              <p className={`bz-setup-${bzActionMsg.startsWith('✓') ? 'note' : 'error'}`} style={{ marginBottom: 'var(--space-md)' }}>{bzActionMsg}</p>
            )}

            {/* ── Filtres ── */}
            <div className="bz-art-filters">
              <label className="ud-art-select-all" title="Tout sélectionner">
                <input type="checkbox" checked={pagedProduits.length > 0 && selectedProdIds.size === pagedProduits.length} onChange={(e) => { if (e.target.checked) selectAllProd(pagedProduits); else deselectAllProd(); }} />
                <span className="ud-art-select-all-check" />
              </label>
              {(['', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const).map((f) => (
                <button key={f} type="button" className={`bz-art-filter-btn${prodFilter === f ? ' active' : ''}`} onClick={() => { setProdFilter(f as ListingStatus | ''); setProdPage(1); deselectAllProd(); }}>
                  {f === '' ? '🗂 Tous' : f === 'ACTIVE' ? '🟢 Actifs' : f === 'INACTIVE' ? '⏸ Inactifs' : '📦 Archivés'}
                </button>
              ))}
              <div className="ud-art-view-toggle">
                <button type="button" className={`ud-art-view-btn${prodViewMode === 'grid' ? ' active' : ''}`} title="Vue grille" onClick={() => { setProdViewMode('grid'); localStorage.setItem('ks-bz-prod-view', 'grid'); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
                </button>
                <button type="button" className={`ud-art-view-btn${prodViewMode === 'list' ? ' active' : ''}`} title="Vue liste" onClick={() => { setProdViewMode('list'); localStorage.setItem('ks-bz-prod-view', 'list'); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="3" rx="1"/><rect x="3" y="10.5" width="18" height="3" rx="1"/><rect x="3" y="17" width="18" height="3" rx="1"/></svg>
                </button>
              </div>
            </div>

            {/* ── Grille / Liste cards ── */}
            {dataLoading ? (
              <div className="bz-art-loading"><span className="bz-art-loading-spinner" /><span>Chargement…</span></div>
            ) : pagedProduits.length === 0 ? (
              <div className="bz-art-empty">
                <span className="bz-art-empty-icon">📦</span>
                <p>{prodFilter ? 'Aucun produit avec ce statut.' : t('biz.noProductsEmpty')}</p>
              </div>
            ) : prodViewMode === 'list' ? (
              <div className="ud-art-list">
                <div className="ud-art-list-header">
                  <span className="ud-art-list-col ud-art-list-col--chk"></span>
                  <span className="ud-art-list-col ud-art-list-col--img"></span>
                  <span className="ud-art-list-col ud-art-list-col--title">Produit</span>
                  <span className="ud-art-list-col ud-art-list-col--price">Prix</span>
                  <span className="ud-art-list-col ud-art-list-col--status">Statut</span>
                  <span className="ud-art-list-col ud-art-list-col--actions">Actions</span>
                </div>
                {pagedProduits.map((p) => (
                  <div key={p.id} className={`ud-art-list-row${p.status === 'INACTIVE' ? ' ud-art-list-row--dim' : ''}${selectedProdIds.has(p.id) ? ' ud-art-list-row--selected' : ''}`}>
                    <label className="ud-art-list-col ud-art-list-col--chk" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedProdIds.has(p.id)} onChange={() => toggleProdSelection(p.id)} />
                      <span className="ud-art-chk" />
                    </label>
                    <div className="ud-art-list-col ud-art-list-col--img">
                      {p.imageUrl ? (
                        <img src={resolveMediaUrl(p.imageUrl)} alt={p.title} className="ud-art-list-thumb" loading="lazy" />
                      ) : (
                        <div className="ud-art-list-thumb-placeholder">📦</div>
                      )}
                    </div>
                    <div className="ud-art-list-col ud-art-list-col--title">
                      <span className="ud-art-list-name">{p.title}</span>
                      <span className="ud-art-list-meta">{p.category} · {p.city}{p.stockQuantity !== null ? ` · Stock: ${p.stockQuantity}` : ''}</span>
                    </div>
                    <span className="ud-art-list-col ud-art-list-col--price ud-art-list-price">
                      <PromoPriceLabel priceUsdCents={p.priceUsdCents} promoActive={p.promoActive} promoPriceUsdCents={p.promoPriceUsdCents} formatPrice={formatPriceLabelFromUsdCents} />
                    </span>
                    <span className="ud-art-list-col ud-art-list-col--status">
                      <span className={`ud-art-list-status${p.status === 'ACTIVE' ? ' ud-art-list-status--active' : p.status === 'INACTIVE' ? ' ud-art-list-status--inactive' : ' ud-art-list-status--archived'}`}>
                        {p.status === 'ACTIVE' ? '🟢 Actif' : p.status === 'INACTIVE' ? '⏸ Inactif' : '📦 Archivé'}
                      </span>
                    </span>
                    <div className="ud-art-list-col ud-art-list-col--actions">
                      <button type="button" className="bz-art-action bz-art-action--edit" title="Modifier" disabled={bzArticleBusy !== null} onClick={() => handleBzEdit(p)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                      {p.status === 'ACTIVE' && (
                        <button type="button" className="bz-art-action bz-art-action--toggle" title="Désactiver" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(p.id, 'INACTIVE')}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg></button>
                      )}
                      {p.status === 'INACTIVE' && (
                        <button type="button" className="bz-art-action bz-art-action--toggle" title="Activer" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(p.id, 'ACTIVE')}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
                      )}
                      {(p.status === 'ACTIVE' || p.status === 'INACTIVE') && (
                        <button type="button" className="bz-art-action bz-art-action--archive" title="Archiver" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(p.id, 'ARCHIVED')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>
                      )}
                      {p.status !== 'DELETED' && (
                        <button type="button" className="bz-art-action bz-art-action--delete" title="Supprimer" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(p.id, 'DELETED')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bz-art-grid">
                {pagedProduits.map((p) => (
                  <article key={p.id} className={`bz-art-card${p.status === 'INACTIVE' ? ' bz-art-card--dim' : ''}${selectedProdIds.has(p.id) ? ' ud-art-card--selected' : ''}`}>
                    <div className="bz-art-card-visual">
                      <label className="ud-art-card-chk" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedProdIds.has(p.id)} onChange={() => toggleProdSelection(p.id)} />
                        <span className="ud-art-chk" />
                      </label>
                      {p.imageUrl ? (
                        <img src={resolveMediaUrl(p.imageUrl)} alt={p.title} className="bz-art-card-img" loading="lazy" />
                      ) : (
                        <div className="bz-art-card-placeholder"><span>📦</span></div>
                      )}
                      <span className={`bz-art-card-badge${p.status === 'ACTIVE' ? ' bz-art-card-badge--active' : p.status === 'INACTIVE' ? ' bz-art-card-badge--inactive' : ' bz-art-card-badge--archived'}`}>
                        {p.status === 'ACTIVE' ? '🟢' : p.status === 'INACTIVE' ? '⏸' : '📦'}
                      </span>
                    </div>
                    <div className="bz-art-card-body">
                      <h4 className="bz-art-card-title">{p.title}</h4>
                      <p className="bz-art-card-meta">{p.category} · {p.city}</p>
                      <PromoPriceLabel priceUsdCents={p.priceUsdCents} promoActive={p.promoActive} promoPriceUsdCents={p.promoPriceUsdCents} formatPrice={formatPriceLabelFromUsdCents} className="bz-art-card-price" />
                      <p className="bz-art-card-stock">Stock: {p.stockQuantity !== null ? p.stockQuantity : '∞'}</p>
                    </div>
                    <div className="bz-art-card-actions">
                      <button type="button" className="bz-art-action bz-art-action--edit" title="Modifier" disabled={bzArticleBusy !== null} onClick={() => handleBzEdit(p)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                      {p.status === 'ACTIVE' && (
                        <button type="button" className="bz-art-action bz-art-action--toggle" title="Désactiver" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(p.id, 'INACTIVE')}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg></button>
                      )}
                      {p.status === 'INACTIVE' && (
                        <button type="button" className="bz-art-action bz-art-action--toggle" title="Activer" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(p.id, 'ACTIVE')}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
                      )}
                      {(p.status === 'ACTIVE' || p.status === 'INACTIVE') && (
                        <button type="button" className="bz-art-action bz-art-action--archive" title="Archiver" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(p.id, 'ARCHIVED')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>
                      )}
                      {p.status !== 'DELETED' && (
                        <button type="button" className="bz-art-action bz-art-action--delete" title="Supprimer" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(p.id, 'DELETED')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* ── Barre d'actions groupées produits ── */}
            <PromoBulkBar count={selectedProdIds.size} label="produit" onDeselect={deselectAllProd} onPromo={() => openProdPromo(allProduits)} />

            {/* ── Pagination ── */}
            {prodTotalPages > 1 && (
              <div className="bz-art-pagination">
                <button type="button" className="bz-art-page-btn" disabled={prodPage <= 1} onClick={() => setProdPage(v => Math.max(1, v - 1))}>←</button>
                <span className="bz-art-page-num">{prodPage} / {prodTotalPages}</span>
                <button type="button" className="bz-art-page-btn" disabled={prodPage >= prodTotalPages} onClick={() => setProdPage(v => v + 1)}>→</button>
              </div>
            )}
          </div>
        )}

        {/* ── SERVICES ── */}
        {activeSection === 'services' && (
          <div className="ud-section animate-fade-in">
            {/* ── Topbar ── */}
            <div className="bz-art-topbar">
              <div className="bz-art-topbar-left">
                <h2 className="bz-art-topbar-title">🛠️ {t('biz.myServices')}</h2>
                <div className="bz-art-stats-inline">
                  <span className="bz-art-stat-chip bz-art-stat-chip--active">{svcStats.active} actifs</span>
                  <span className="bz-art-stat-chip">{svcStats.inactive} inactifs</span>
                  <span className="bz-art-stat-chip">{svcStats.archived} archivés</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="bz-art-publish-btn" style={{ background: 'rgba(214,170,80,.15)', color: '#d6aa50' }} onClick={() => { setImportOpen(importOpen === 'service' ? null : 'service'); setImportMsg(null); setImportProgress(null); }}>
                  <span className="bz-art-publish-icon">📥</span>
                  {importOpen === 'service' ? '✕ Fermer' : 'Importer'}
                </button>
                <button type="button" className="bz-art-publish-btn" onClick={() => { setCreateMode(createMode === 'service' ? null : 'service'); setCreateStep(1); setCreateUploadFiles([]); setCreateUploadPreviews(p => { p.forEach(u => URL.revokeObjectURL(u)); return []; }); setCreateMsg(null); setEditingArticleId(null); }}>
                  <span className="bz-art-publish-icon">+</span>
                  {createMode === 'service' ? t('biz.cancelBtn') : t('biz.newService')}
                </button>
              </div>
            </div>

            {/* ── Import zone ── */}
            {importOpen === 'service' && (
              <div className="bz-import-zone" style={{ marginBottom: 'var(--space-lg)' }}>
                <h3 style={{ margin: '0 0 var(--space-sm)' }}>📥 Importer des services en masse</h3>
                <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '0 0 var(--space-md)' }}>
                  Formats acceptés : <strong>.csv</strong>, <strong>.json</strong>, <strong>.xml</strong><br />
                  Colonnes attendues : titre, categorie, prix (CDF), description, ville
                </p>
                <label className="bz-photo-drop-zone bz-import-drop">
                  <input type="file" accept=".csv,.json,.xml" disabled={importBusy} onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f, 'SERVICE'); e.target.value = ''; }} />
                  <span className="bz-photo-drop-icon">📄</span>
                  <span className="bz-photo-drop-text">{importBusy ? 'Import en cours…' : 'Glissez ou cliquez pour choisir un fichier'}</span>
                </label>
                {importProgress && (
                  <div style={{ marginTop: 'var(--space-sm)' }}>
                    <div className="bz-import-progress-bar"><div className="bz-import-progress-fill" style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }} /></div>
                    <small>{importProgress.done} / {importProgress.total}</small>
                  </div>
                )}
                {importMsg && <p className={`bz-setup-${importMsg.startsWith('✓') ? 'note' : 'error'}`} style={{ marginTop: 'var(--space-sm)' }}>{importMsg}</p>}
              </div>
            )}

            {/* ── Formulaire création service ── */}
            {createMode === 'service' && (
              <form className="bz-setup-form ud-publish-modal" style={{ marginBottom: 'var(--space-lg)' }} onSubmit={handleCreateListing}>
                {createStep === 1 && (
                  <div className="ud-publish-step-content">
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.titleLabel')} *</span>
                      <input className="ud-input" type="text" required minLength={2} maxLength={140} value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Réparation smartphones toutes marques" />
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.categoryLabel')} *</span>
                      <select className="ud-input" required value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}>
                        <option value="">Choisir une catégorie</option>
                        {LISTING_SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.descriptionLabel')}</span>
                      <textarea className="ud-input" rows={4} maxLength={1200} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Description détaillée du service..." />
                      <span className="ud-publish-field-hint">{createForm.description.length}/1200 caractères</span>
                    </label>
                    <div className="ud-publish-nav">
                      <span />
                      <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => { if (!createForm.title.trim()) { setCreateMsg('Le titre est requis'); return; } if (!createForm.category) { setCreateMsg('La catégorie est requise'); return; } setCreateMsg(null); setCreateStep(2); }}>Suivant →</button>
                    </div>
                  </div>
                )}
                {createStep === 2 && (
                  <div className="ud-publish-step-content">
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.rateCdf')} ({currency}) *</span>
                      <div className="ud-publish-price-wrap">
                        <span className="ud-publish-price-symbol">{CURRENCY_SYMBOLS[currency] || currency}</span>
                        <input className="ud-input" type="number" required min={0} value={createForm.priceCdf} onChange={e => setCreateForm(f => ({ ...f, priceCdf: e.target.value }))} placeholder="0" />
                      </div>
                      {createForm.priceCdf && parseInt(createForm.priceCdf) > 0 && (
                        <span className="ud-publish-field-hint">≈ {(parseInt(createForm.priceCdf) / getCurrencyRate(currency)).toFixed(2)} $ USD</span>
                      )}
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('biz.cityLabel')} *</span>
                      <LocationPicker value={{ lat: createForm.latitude, lng: createForm.longitude, address: createForm.city }} onChange={({ address, city, lat, lng }) => setCreateForm(f => ({ ...f, city: city || address, latitude: lat, longitude: lng }))} onStructuredChange={(loc) => setCreateForm(f => ({ ...f, city: loc.city || loc.formattedAddress, latitude: loc.latitude ?? f.latitude, longitude: loc.longitude ?? f.longitude, country: loc.country || f.country, countryCode: loc.countryCode || f.countryCode, region: loc.region || '', district: loc.district || '', formattedAddress: loc.formattedAddress || '', placeId: loc.placeId || '' }))} placeholder="Kinshasa" />
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">📍 Rayon d'intervention (km)</span>
                      <input className="ud-input" type="number" min={0} max={500} value={createForm.serviceRadiusKm} onChange={e => setCreateForm(f => ({ ...f, serviceRadiusKm: e.target.value }))} placeholder="Ex: 25" />
                    </label>
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">🔒 Visibilité</span>
                      <VisibilitySelector value={createForm.locationVisibility} onChange={(v: LocationVisibility) => setCreateForm(f => ({ ...f, locationVisibility: v }))} />
                    </label>
                    <label className="ud-publish-field" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={createForm.isNegotiable} onChange={e => setCreateForm(f => ({ ...f, isNegotiable: e.target.checked }))} />
                      <span>{t('negotiation.allowPrice')}</span>
                    </label>
                    <div className="ud-publish-nav">
                      <button type="button" className="ud-quick-btn" onClick={() => setCreateStep(1)}>← Retour</button>
                      <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => setCreateStep(3)}>Suivant →</button>
                    </div>
                  </div>
                )}
                {createStep === 3 && (
                  <div className="ud-publish-step-content">
                    <div className="ud-publish-media-zone">
                      <p className="ud-publish-field-label">📷 Photos & Vidéo</p>
                      <p className="ud-publish-field-hint" style={{ marginBottom: '0.75rem' }}>Max 5 photos + 1 vidéo (50 Mo max)</p>
                      <div className="ud-publish-media-grid">
                        {createUploadPreviews.map((url, i) => {
                          const file = createUploadFiles[i];
                          const isVideo = file?.type.startsWith('video/');
                          return (
                            <div key={url} className="ud-publish-media-thumb">
                              {isVideo ? <video src={url} className="ud-publish-media-img" muted /> : <img src={url} alt={`Media ${i + 1}`} className="ud-publish-media-img" />}
                              <button type="button" className="ud-publish-media-remove" onClick={() => removeCreateFile(i)}>✕</button>
                              {isVideo && <span className="ud-publish-media-badge">🎬 Vidéo</span>}
                            </div>
                          );
                        })}
                        {createUploadFiles.length < 6 && (
                          <label className="ud-publish-media-add">
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple onChange={handleCreateFileSelect} style={{ display: 'none' }} />
                            <span className="ud-publish-media-add-icon">+</span>
                            <span className="ud-publish-media-add-label">Ajouter</span>
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="ud-publish-summary">
                      <h3 className="ud-publish-summary-title">Récapitulatif</h3>
                      <div className="ud-publish-summary-grid">
                        <span>Type</span><strong>🛠️ Service</strong>
                        <span>Titre</span><strong>{createForm.title || '–'}</strong>
                        <span>Catégorie</span><strong>{createForm.category || '–'}</strong>
                        <span>Tarif</span><strong>{createForm.priceCdf && parseInt(createForm.priceCdf) > 0 ? `${new Intl.NumberFormat('fr-CD').format(parseInt(createForm.priceCdf))} ${CURRENCY_SYMBOLS[currency] || currency}` : 'Tarif libre'}</strong>
                        <span>Ville</span><strong>{createForm.city || '–'}</strong>
                        {createForm.serviceRadiusKm && <><span>Rayon</span><strong>{createForm.serviceRadiusKm} km</strong></>}
                        <span>Médias</span><strong>{createUploadFiles.length} fichier(s)</strong>
                      </div>
                    </div>
                    {createMsg && <p className={`bz-setup-${createMsg.startsWith('✓') ? 'note' : 'error'}`}>{createMsg}</p>}
                    <div className="ud-publish-nav">
                      <button type="button" className="ud-quick-btn" onClick={() => setCreateStep(2)}>← Retour</button>
                      <button type="submit" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" disabled={createBusy}>
                        {createBusy ? '⏳ Publication...' : editingArticleId ? '✏️ Modifier le service' : '🚀 Publier le service'}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}

            {/* ── Notification actions ── */}
            {bzActionMsg && (
              <p className={`bz-setup-${bzActionMsg.startsWith('✓') ? 'note' : 'error'}`} style={{ marginBottom: 'var(--space-md)' }}>{bzActionMsg}</p>
            )}

            {/* ── Filtres ── */}
            <div className="bz-art-filters">
              <label className="ud-art-select-all" title="Tout sélectionner">
                <input type="checkbox" checked={pagedServices.length > 0 && selectedSvcIds.size === pagedServices.length} onChange={(e) => { if (e.target.checked) selectAllSvc(pagedServices); else deselectAllSvc(); }} />
                <span className="ud-art-select-all-check" />
              </label>
              {(['', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const).map((f) => (
                <button key={f} type="button" className={`bz-art-filter-btn${svcFilter === f ? ' active' : ''}`} onClick={() => { setSvcFilter(f as ListingStatus | ''); setSvcPage(1); deselectAllSvc(); }}>
                  {f === '' ? '🗂 Tous' : f === 'ACTIVE' ? '🟢 Actifs' : f === 'INACTIVE' ? '⏸ Inactifs' : '📦 Archivés'}
                </button>
              ))}
              <div className="ud-art-view-toggle">
                <button type="button" className={`ud-art-view-btn${svcViewMode === 'grid' ? ' active' : ''}`} title="Vue grille" onClick={() => { setSvcViewMode('grid'); localStorage.setItem('ks-bz-svc-view', 'grid'); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
                </button>
                <button type="button" className={`ud-art-view-btn${svcViewMode === 'list' ? ' active' : ''}`} title="Vue liste" onClick={() => { setSvcViewMode('list'); localStorage.setItem('ks-bz-svc-view', 'list'); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="4" width="18" height="3" rx="1"/><rect x="3" y="10.5" width="18" height="3" rx="1"/><rect x="3" y="17" width="18" height="3" rx="1"/></svg>
                </button>
              </div>
            </div>

            {/* ── Grille / Liste cards ── */}
            {dataLoading ? (
              <div className="bz-art-loading"><span className="bz-art-loading-spinner" /><span>Chargement…</span></div>
            ) : pagedServices.length === 0 ? (
              <div className="bz-art-empty">
                <span className="bz-art-empty-icon">🛠️</span>
                <p>{svcFilter ? 'Aucun service avec ce statut.' : t('biz.noServicesEmpty')}</p>
              </div>
            ) : svcViewMode === 'list' ? (
              <div className="ud-art-list">
                <div className="ud-art-list-header">
                  <span className="ud-art-list-col ud-art-list-col--chk"></span>
                  <span className="ud-art-list-col ud-art-list-col--img"></span>
                  <span className="ud-art-list-col ud-art-list-col--title">Service</span>
                  <span className="ud-art-list-col ud-art-list-col--price">Prix</span>
                  <span className="ud-art-list-col ud-art-list-col--status">Statut</span>
                  <span className="ud-art-list-col ud-art-list-col--actions">Actions</span>
                </div>
                {pagedServices.map((s) => (
                  <div key={s.id} className={`ud-art-list-row${s.status === 'INACTIVE' ? ' ud-art-list-row--dim' : ''}${selectedSvcIds.has(s.id) ? ' ud-art-list-row--selected' : ''}`}>
                    <label className="ud-art-list-col ud-art-list-col--chk" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedSvcIds.has(s.id)} onChange={() => toggleSvcSelection(s.id)} />
                      <span className="ud-art-chk" />
                    </label>
                    <div className="ud-art-list-col ud-art-list-col--img">
                      {s.imageUrl ? (
                        <img src={resolveMediaUrl(s.imageUrl)} alt={s.title} className="ud-art-list-thumb" loading="lazy" />
                      ) : (
                        <div className="ud-art-list-thumb-placeholder">🛠️</div>
                      )}
                    </div>
                    <div className="ud-art-list-col ud-art-list-col--title">
                      <span className="ud-art-list-name">{s.title}</span>
                      <span className="ud-art-list-meta">{s.category} · {s.city}</span>
                    </div>
                    <span className="ud-art-list-col ud-art-list-col--price ud-art-list-price">
                      <PromoPriceLabel priceUsdCents={s.priceUsdCents} promoActive={s.promoActive} promoPriceUsdCents={s.promoPriceUsdCents} formatPrice={formatPriceLabelFromUsdCents} />
                    </span>
                    <span className="ud-art-list-col ud-art-list-col--status">
                      <span className={`ud-art-list-status${s.status === 'ACTIVE' ? ' ud-art-list-status--active' : s.status === 'INACTIVE' ? ' ud-art-list-status--inactive' : ' ud-art-list-status--archived'}`}>
                        {s.status === 'ACTIVE' ? '🟢 Actif' : s.status === 'INACTIVE' ? '⏸ Inactif' : '📦 Archivé'}
                      </span>
                    </span>
                    <div className="ud-art-list-col ud-art-list-col--actions">
                      <button type="button" className="bz-art-action bz-art-action--edit" title="Modifier" disabled={bzArticleBusy !== null} onClick={() => handleBzEdit(s)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                      {s.status === 'ACTIVE' && (
                        <button type="button" className="bz-art-action bz-art-action--toggle" title="Désactiver" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(s.id, 'INACTIVE')}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg></button>
                      )}
                      {s.status === 'INACTIVE' && (
                        <button type="button" className="bz-art-action bz-art-action--toggle" title="Activer" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(s.id, 'ACTIVE')}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
                      )}
                      {(s.status === 'ACTIVE' || s.status === 'INACTIVE') && (
                        <button type="button" className="bz-art-action bz-art-action--archive" title="Archiver" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(s.id, 'ARCHIVED')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>
                      )}
                      {s.status !== 'DELETED' && (
                        <button type="button" className="bz-art-action bz-art-action--delete" title="Supprimer" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(s.id, 'DELETED')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bz-art-grid">
                {pagedServices.map((s) => (
                  <article key={s.id} className={`bz-art-card${s.status === 'INACTIVE' ? ' bz-art-card--dim' : ''}${selectedSvcIds.has(s.id) ? ' ud-art-card--selected' : ''}`}>
                    <div className="bz-art-card-visual">
                      <label className="ud-art-card-chk" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedSvcIds.has(s.id)} onChange={() => toggleSvcSelection(s.id)} />
                        <span className="ud-art-chk" />
                      </label>
                      {s.imageUrl ? (
                        <img src={resolveMediaUrl(s.imageUrl)} alt={s.title} className="bz-art-card-img" loading="lazy" />
                      ) : (
                        <div className="bz-art-card-placeholder"><span>🛠️</span></div>
                      )}
                      <span className={`bz-art-card-badge${s.status === 'ACTIVE' ? ' bz-art-card-badge--active' : s.status === 'INACTIVE' ? ' bz-art-card-badge--inactive' : ' bz-art-card-badge--archived'}`}>
                        {s.status === 'ACTIVE' ? '🟢' : s.status === 'INACTIVE' ? '⏸' : '📦'}
                      </span>
                    </div>
                    <div className="bz-art-card-body">
                      <h4 className="bz-art-card-title">{s.title}</h4>
                      <p className="bz-art-card-meta">{s.category} · {s.city}</p>
                      <PromoPriceLabel priceUsdCents={s.priceUsdCents} promoActive={s.promoActive} promoPriceUsdCents={s.promoPriceUsdCents} formatPrice={formatPriceLabelFromUsdCents} className="bz-art-card-price" />
                    </div>
                    <div className="bz-art-card-actions">
                      <button type="button" className="bz-art-action bz-art-action--edit" title="Modifier" disabled={bzArticleBusy !== null} onClick={() => handleBzEdit(s)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                      {s.status === 'ACTIVE' && (
                        <button type="button" className="bz-art-action bz-art-action--toggle" title="Désactiver" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(s.id, 'INACTIVE')}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg></button>
                      )}
                      {s.status === 'INACTIVE' && (
                        <button type="button" className="bz-art-action bz-art-action--toggle" title="Activer" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(s.id, 'ACTIVE')}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
                      )}
                      {(s.status === 'ACTIVE' || s.status === 'INACTIVE') && (
                        <button type="button" className="bz-art-action bz-art-action--archive" title="Archiver" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(s.id, 'ARCHIVED')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>
                      )}
                      {s.status !== 'DELETED' && (
                        <button type="button" className="bz-art-action bz-art-action--delete" title="Supprimer" disabled={bzArticleBusy !== null} onClick={() => void handleBzStatusChange(s.id, 'DELETED')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* ── Barre d'actions groupées services ── */}
            <PromoBulkBar count={selectedSvcIds.size} label="service" onDeselect={deselectAllSvc} onPromo={() => openSvcPromo(allServices)} />

            {/* ── Pagination ── */}
            {svcTotalPages > 1 && (
              <div className="bz-art-pagination">
                <button type="button" className="bz-art-page-btn" disabled={svcPage <= 1} onClick={() => setSvcPage(v => Math.max(1, v - 1))}>←</button>
                <span className="bz-art-page-num">{svcPage} / {svcTotalPages}</span>
                <button type="button" className="bz-art-page-btn" disabled={svcPage >= svcTotalPages} onClick={() => setSvcPage(v => v + 1)}>→</button>
              </div>
            )}
          </div>
        )}

        {/* ── COMMANDES ── */}
        {activeSection === 'commandes' && (() => {
          const bizStatusLabel = (s: string) => {
            const map: Record<string, string> = { PENDING: '⏳ En attente', CONFIRMED: '✅ Confirmée', PROCESSING: '⚙️ En préparation', SHIPPED: '🚚 Expédiée', DELIVERED: '📬 Livrée', CANCELED: '❌ Annulée' };
            return map[s] ?? s;
          };
          const bizNextStatuses = (s: string): OrderStatus[] => {
            switch (s) {
              case 'PENDING': return ['CONFIRMED', 'CANCELED'];
              case 'CONFIRMED': return ['PROCESSING', 'CANCELED'];
              case 'PROCESSING': return ['SHIPPED', 'CANCELED'];
              default: return [];
            }
          };
          const filteredBizOrders = bizOrderFilter ? sellerOrders.filter(o => o.status === bizOrderFilter) : sellerOrders;
          const bizStats = {
            total: sellerOrders.length,
            inProgress: sellerOrders.filter(o => ['PENDING','CONFIRMED','PROCESSING','SHIPPED'].includes(o.status)).length,
            delivered: sellerOrders.filter(o => o.status === 'DELIVERED').length,
            canceled: sellerOrders.filter(o => o.status === 'CANCELED').length,
          };
          return (
          <div className="ud-section animate-fade-in">

            {/* ── Topbar commandes ── */}
            <div className="ud-ord-topbar">
              <div className="ud-ord-topbar-left">
                <h2 className="ud-ord-topbar-title">🛒 Gestion des commandes</h2>
                <div className="ud-ord-stats-inline">
                  <span className="ud-ord-stat-chip">{bizStats.total} {bizStats.total > 1 ? 'commandes' : 'commande'}</span>
                  <span className="ud-ord-stat-chip ud-ord-stat-chip--progress">{bizStats.inProgress} en cours</span>
                  <span className="ud-ord-stat-chip ud-ord-stat-chip--success">{bizStats.delivered} {bizStats.delivered > 1 ? 'livrées' : 'livrée'}</span>
                  <span className="ud-ord-stat-chip ud-ord-stat-chip--danger">{bizStats.canceled} {bizStats.canceled > 1 ? 'annulées' : 'annulée'}</span>
                </div>
              </div>
            </div>

            {/* ── Panel commandes ── */}
            <div className="ud-commerce-panel">
              <div className="ud-commerce-panel-head">
                <h3 className="ud-commerce-panel-title">📦 Commandes reçues</h3>
                <span className="ud-ord-stat-chip">{filteredBizOrders.length} total</span>
                <select className="ud-neg-filter-select" value={bizOrderFilter} onChange={e => setBizOrderFilter(e.target.value as OrderStatus | '')}>
                  <option value="">Tous les statuts</option>
                  <option value="PENDING">⏳ En attente</option>
                  <option value="CONFIRMED">✅ Confirmée</option>
                  <option value="PROCESSING">⚙️ En préparation</option>
                  <option value="SHIPPED">🚚 Expédiée</option>
                  <option value="DELIVERED">📬 Livrée</option>
                  <option value="CANCELED">❌ Annulée</option>
                </select>
              </div>

              {dataLoading && <div className="ud-loading"><span className="ud-spinner" /><span>Chargement…</span></div>}

              {!dataLoading && filteredBizOrders.length === 0 && (
                <div className="ud-neg-empty">
                  <span style={{ fontSize: '2rem' }}>📭</span>
                  <p>Aucune commande{bizOrderFilter ? ` avec le statut "${bizStatusLabel(bizOrderFilter)}"` : ' reçue pour le moment'}.</p>
                </div>
              )}

              {!dataLoading && filteredBizOrders.length > 0 && (
                <div className="ud-neg-grid">
                  {filteredBizOrders.map(order => {
                    const firstItem = order.items[0];
                    return (
                      <div key={order.id} className={`ud-neg-card glass-card ud-neg-card--${order.status.toLowerCase()}`}>

                        {/* Header: image + info client */}
                        <div className="ud-neg-card-header">
                          {firstItem?.imageUrl ? (
                            <img src={resolveMediaUrl(firstItem.imageUrl)} alt={firstItem.title} className="ud-neg-img" />
                          ) : (
                            <div className="ud-neg-img-placeholder">{firstItem?.listingType === 'SERVICE' ? '🛠' : '📦'}</div>
                          )}
                          <div className="ud-neg-card-info">
                            <h4 className="ud-neg-card-title">#{order.id.slice(0, 8).toUpperCase()}</h4>
                            <p className="ud-neg-card-meta">Client : {order.buyer.displayName}</p>
                            <div className="ud-neg-badges-row">
                              <span className={`ud-neg-status-badge ud-neg-status-badge--${order.status.toLowerCase()}`}>
                                {bizStatusLabel(order.status)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Articles de la commande */}
                        <div className="ud-sord-items">
                          {order.items.map(item => (
                            <div key={item.id} className="ud-sord-item">
                              {item.imageUrl ? (
                                <img src={resolveMediaUrl(item.imageUrl)} alt={item.title} className="ud-sord-item-img" />
                              ) : (
                                <div className="ud-sord-item-img-ph">{item.listingType === 'SERVICE' ? '🛠' : '📦'}</div>
                              )}
                              <div className="ud-sord-item-info">
                                <span className="ud-sord-item-title">{item.title}</span>
                                <span className="ud-sord-item-detail">x{item.quantity} — {formatMoneyFromUsdCents(item.lineTotalUsdCents)}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Résumé prix */}
                        <div className="ud-neg-card-prices">
                          <div className="ud-neg-price-row">
                            <span>Total</span>
                            <span className="ud-neg-price-current">{formatMoneyFromUsdCents(order.totalUsdCents)}</span>
                          </div>
                          <div className="ud-neg-price-row">
                            <span>Articles</span>
                            <span className="ud-neg-price-original">{order.itemsCount} {order.itemsCount > 1 ? 'articles' : 'article'}</span>
                          </div>
                          <div className="ud-neg-price-row">
                            <span>Date</span>
                            <span className="ud-neg-price-original">{new Date(order.createdAt).toLocaleDateString('fr-FR')}</span>
                          </div>
                        </div>

                        {/* Actions vendeur */}
                        <div className="ud-sord-actions">
                          <button type="button" className="ud-neg-respond-btn" onClick={() => { orders.detail(order.id).then(d => setSelectedBizOrder(d)).catch(() => {}); }}>
                            ℹ️ Détails
                          </button>

                          {bizNextStatuses(order.status).map(status => (
                            <button
                              key={status}
                              type="button"
                              className={`ud-neg-respond-btn${status === 'CANCELED' ? ' ud-sord-action--danger' : ''}`}
                              disabled={orderStatusBusyId !== null}
                              onClick={() => void handleOrderStatus(order.id, status)}
                            >
                              {orderStatusBusyId === order.id ? '…' : bizStatusLabel(status)}
                            </button>
                          ))}

                          {(order.status === 'PROCESSING' || order.status === 'SHIPPED') && (
                            <button
                              type="button"
                              className="ud-neg-respond-btn"
                              disabled={validationCodeBusyId === order.id}
                              onClick={() => void handleRevealCode(order.id)}
                            >
                              {validationCodeBusyId === order.id ? '…' : '🔑 QR / Code'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Détail commande sélectionnée */}
              {selectedBizOrder && (
                <section className="ud-ord-detail">
                  <div className="ud-ord-detail-head">
                    <h3>Détail — #{selectedBizOrder.id.slice(0, 8).toUpperCase()}</h3>
                    <span className={`ud-neg-status-badge ud-neg-status-badge--${selectedBizOrder.status.toLowerCase()}`}>{bizStatusLabel(selectedBizOrder.status)}</span>
                    <span className="ud-ord-detail-total">{formatMoneyFromUsdCents(selectedBizOrder.totalUsdCents)}</span>
                    <button type="button" className="ud-neg-respond-btn" style={{ marginLeft: 'auto' }} onClick={() => setSelectedBizOrder(null)}>✕ Fermer</button>
                  </div>
                  <ul className="ud-ord-detail-items">
                    {selectedBizOrder.items.map(item => (
                      <li key={item.id} className="ud-ord-detail-item">
                        {item.imageUrl ? (
                          <img src={resolveMediaUrl(item.imageUrl)} alt={item.title} className="ud-sord-item-img" style={{ width: 36, height: 36, borderRadius: 8 }} />
                        ) : (
                          <span className="ud-ord-detail-icon">{item.listingType === 'SERVICE' ? '🛠' : '📦'}</span>
                        )}
                        <div className="ud-ord-detail-info">
                          <strong>{item.title}</strong>
                          <span>{item.category} · {item.city} · x{item.quantity}</span>
                        </div>
                        <span className="ud-ord-detail-price">{formatMoneyFromUsdCents(item.lineTotalUsdCents)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {sellerValidationQr && (
              <OrderValidationQrModal
                orderId={sellerValidationQr.orderId}
                code={sellerValidationQr.code}
                title={t('user.validationQrTitle')}
                helpText={t('user.validationQrHelp')}
                closeLabel={t('common.close')}
                onClose={() => setSellerValidationQr(null)}
              />
            )}
          </div>
          );
        })()}

        {/* ── MESSAGERIE ── */}
        {activeSection === 'messages' && (
          <div className="ud-section animate-fade-in">
            <div style={{ height: 'calc(100vh - 100px)', borderRadius: 'var(--ud-radius)', overflow: 'hidden' }}>
              <DashboardMessaging />
            </div>
          </div>
        )}

        {/* ── CONTACTS & AVIS ── */}
        {activeSection === 'contacts' && (
          <div className="ud-section animate-fade-in">
            <section className="ud-glass-panel bz-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">🤝 {t('biz.contactsTitle')}</h2>
                <button type="button" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" onClick={() => { setContactSearchOpen(true); setContactSearchQuery(''); setContactSearchResults([]); }}>
                  ➕ {t('biz.addContact')}
                </button>
              </div>
              <div className="ud-contacts-toolbar">
                <div className="ud-contacts-filters">
                  {(['all', 'online', 'favorites'] as const).map((f) => (
                    <button key={f} type="button" className={`ud-filter-chip${contactFilter === f ? ' ud-filter-chip--active' : ''}`} onClick={() => setContactFilter(f)}>
                      {f === 'all' ? t('biz.filterAll') : f === 'online' ? t('biz.filterOnline') : t('biz.filterFavorites')}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Liste clients existants */}
            {clientsData.length > 0 ? (
              <div className="bz-contacts-grid">
                {clientsData.map((c, i) => (
                  <article key={i} className="ud-glass-panel bz-glass-panel bz-contact-card">
                    <div className="bz-contact-avatar">
                      <span className="ud-avatar-initials">{c.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="bz-contact-info">
                      <strong>{c.name}</strong>
                      <span className="ud-page-sub">{c.commandes} {t('biz.orders')} · {formatMoneyFromUsdCents(c.totalUsdCents)}</span>
                    </div>
                    <div className="bz-contact-actions">
                      <button type="button" className="ud-quick-btn" onClick={() => navigate('/messaging')} title={t('biz.sendMessage')}>💬</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="ud-glass-panel bz-glass-panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <span style={{ fontSize: '3rem', display: 'block', marginBottom: 12 }}>🤝</span>
                <h3 style={{ margin: '0 0 8px' }}>{t('biz.noContactsTitle')}</h3>
                <p className="ud-placeholder-text" style={{ margin: '0 0 20px' }}>
                  {t('biz.noContactsDesc')}
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" onClick={() => { setContactSearchOpen(true); setContactSearchQuery(''); setContactSearchResults([]); }}>
                    ➕ {t('biz.addContact')}
                  </button>
                  <button type="button" className="ud-quick-btn" onClick={() => navigate('/messaging')}>💬 {t('biz.messaging')}</button>
                </div>
              </section>
            )}

            {/* Popup recherche contact */}
            {contactSearchOpen && (
              <div className="ud-publish-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setContactSearchOpen(false); }}>
                <div className="ud-contact-search-modal">
                  <div className="ud-publish-header">
                    <h2 className="ud-publish-title">🔍 {t('biz.searchContact')}</h2>
                    <button type="button" className="ud-publish-close" onClick={() => setContactSearchOpen(false)} aria-label={t('common.close')}>✕</button>
                  </div>
                  <p className="ud-contact-search-hint">{t('biz.searchContactHint')}</p>
                  <div className="ud-contact-search-bar">
                    <input
                      className="ud-input"
                      placeholder={t('biz.searchContactPh')}
                      value={contactSearchQuery}
                      onChange={(e) => setContactSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleContactSearch(); }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="ud-quick-btn ud-quick-btn--primary"
                      disabled={contactSearching || contactSearchQuery.trim().length < 2}
                      onClick={() => void handleContactSearch()}
                    >
                      {contactSearching ? '...' : t('biz.searchBtn')}
                    </button>
                  </div>
                  <div className="ud-contact-search-results">
                    {contactSearching && <p style={{ textAlign: 'center', color: 'var(--ud-text-2)', padding: '20px 0' }}>{t('biz.searching')}</p>}
                    {!contactSearching && contactSearchResults.length === 0 && contactSearchQuery.length >= 2 && (
                      <p style={{ textAlign: 'center', color: 'var(--ud-text-2)', padding: '20px 0' }}>{t('biz.noResults')}</p>
                    )}
                    {contactSearchResults.map((result) => (
                      <div key={result.id} className="ud-contact-search-item">
                        <div className="ud-contact-search-avatar">
                          {result.profile.avatarUrl ? (
                            <img src={result.profile.avatarUrl} alt={result.profile.displayName} />
                          ) : (
                            <span className="ud-contact-search-initials">{result.profile.displayName.split(' ').map((p: string) => p[0]).join('').slice(0, 2)}</span>
                          )}
                        </div>
                        <div className="ud-contact-search-info">
                          <strong>{result.profile.displayName}</strong>
                          <span className="ud-contact-search-meta">
                            {result.profile.username ? `@${result.profile.username}` : ''}{result.profile.city ? ` · ${result.profile.city}` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="ud-quick-btn ud-quick-btn--primary"
                          onClick={() => handleStartConversation(result.id)}
                        >
                          💬 {t('biz.messageBtn')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── AVIS (intégré) ── */}
            <div className="ud-stats-row" style={{ marginTop: 'var(--space-lg)' }}>
              <article className="ud-stat-card ud-stat-card--gold bz-stat-card">
                <span className="ud-stat-icon">⭐</span>
                <div><p className="ud-stat-label">{t('biz.reviewsReceived')}</p><strong className="ud-stat-value">{bizReviews.length}</strong></div>
              </article>
              <article className="ud-stat-card ud-stat-card--green bz-stat-card">
                <span className="ud-stat-icon">👍</span>
                <div><p className="ud-stat-label">{t('biz.reviewsPositive')}</p><strong className="ud-stat-value">{bizReviews.filter(r => r.rating >= 4).length}</strong></div>
              </article>
              <article className="ud-stat-card ud-stat-card--amber bz-stat-card">
                <span className="ud-stat-icon">📊</span>
                <div><p className="ud-stat-label">{t('biz.reviewsAvg')}</p><strong className="ud-stat-value">{bizReviewsAvg ? bizReviewsAvg.toFixed(1) : '—'}</strong></div>
              </article>
              <article className="ud-stat-card ud-stat-card--blue bz-stat-card">
                <span className="ud-stat-icon">✅</span>
                <div><p className="ud-stat-label">{t('biz.reviewsVerified')}</p><strong className="ud-stat-value">{bizReviews.filter(r => r.verified).length}</strong></div>
              </article>
            </div>

            <section className="ud-glass-panel bz-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">⭐ {t('biz.allReviews')}</h2>
                <button
                  type="button"
                  className="ud-quick-btn ud-quick-btn--primary bz-cta-gold"
                  onClick={() => navigate('/messaging')}
                >
                  💬 {t('biz.contactClients')}
                </button>
              </div>
              {bizReviewsLoading ? (
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <span style={{ fontSize: '1.5rem' }}>⏳</span>
                  <p className="ud-placeholder-text">{t('biz.loading')}</p>
                </div>
              ) : bizReviews.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                  <span style={{ fontSize: '3rem', display: 'block', marginBottom: 12 }}>⭐</span>
                  <h3 style={{ margin: '0 0 8px' }}>{t('biz.noReviewsTitle')}</h3>
                  <p className="ud-placeholder-text">{t('biz.noReviewsDesc')}</p>
                </div>
              ) : (
                <div className="bz-reviews-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {bizReviews.map(review => (
                    <article key={review.id} className="ud-glass-panel" style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {review.authorAvatar ? (
                            <img src={review.authorAvatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(111,88,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>👤</span>
                          )}
                          <strong style={{ fontSize: '0.88rem' }}>{review.authorName}</strong>
                          {review.verified && <span style={{ fontSize: '0.7rem', color: '#7ef5c4' }}>✅ vérifié</span>}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--ud-text-2)' }}>{new Date(review.createdAt).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <div style={{ marginBottom: 4 }}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <span key={i} style={{ color: i < review.rating ? '#f5c542' : 'rgba(255,255,255,0.15)', fontSize: '1rem' }}>★</span>
                        ))}
                      </div>
                      {review.text && <p style={{ fontSize: '0.84rem', color: 'var(--ud-text-2)', margin: 0 }}>{review.text}</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── VERIFICATION ── */}
        {activeSection === 'verification' && business && (
          <DashboardVerificationSection t={t} userId={user!.id} businessId={business.id} accountType="BUSINESS" />
        )}

        {/* ── ANALYTICS ── */}
        {activeSection === 'analytics' && (
          <div className="ud-section animate-fade-in">
            <section className="ud-glass-panel bz-glass-panel">
              <h2 className="ud-panel-title">Analytics</h2>
              <div className="ud-stats-row" style={{ marginBottom: 'var(--space-lg)' }}>
                <article className="ud-stat-card ud-stat-card--green bz-stat-card">
                  <span className="ud-stat-icon">📦</span>
                  <div><p className="ud-stat-label">{t('biz.activeListings')}</p><strong className="ud-stat-value">{listingStats?.active ?? '—'}</strong></div>
                </article>
                <article className="ud-stat-card ud-stat-card--blue bz-stat-card">
                  <span className="ud-stat-icon">🛒</span>
                  <div><p className="ud-stat-label">{t('biz.totalOrders')}</p><strong className="ud-stat-value">{sellerOrders.length}</strong></div>
                </article>
                <article className="ud-stat-card ud-stat-card--amber bz-stat-card">
                  <span className="ud-stat-icon">✅</span>
                  <div><p className="ud-stat-label">{t('biz.deliveredOrders')}</p><strong className="ud-stat-value">{sellerOrders.filter(o => o.status === 'DELIVERED').length}</strong></div>
                </article>
                <article className="ud-stat-card ud-stat-card--gold bz-stat-card">
                  <span className="ud-stat-icon">👥</span>
                  <div><p className="ud-stat-label">{t('biz.uniqueClients')}</p><strong className="ud-stat-value">{clientsData.length}</strong></div>
                </article>
              </div>
              <div className="ud-glass-panel bz-glass-panel" style={{ padding: 'var(--space-md)' }}>
                <div className="bz-analytics-mini">
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.totalRevenue')}</span>
                    <strong className="bz-analytics-val">{formatMoneyFromUsdCents(kpis.totalUsdCents)}</strong>
                  </div>
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.salesThisMonth')}</span>
                    <strong className="bz-analytics-val">{formatMoneyFromUsdCents(kpis.monthUsdCents)}</strong>
                  </div>
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.avgCart')}</span>
                    <strong className="bz-analytics-val">{formatMoneyFromUsdCents(kpis.avgUsdCents)}</strong>
                  </div>
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.productsPublished')}</span>
                    <strong className="bz-analytics-val">{produits.length}</strong>
                  </div>
                </div>

                {/* ─ Kin-Sell Ads Strategic Banner ─ */}
                {produits.length > 0 && (
                  <div className="bz-ks-banner" style={{ marginTop: 'var(--space-lg)' }}>
                    <div className="bz-ks-banner-inner">
                      <span className="bz-ks-banner-tag">✱ {t('biz.boostTag')}</span>
                      <div>
                        <strong className="bz-ks-banner-title">{t('biz.boostTitle')}</strong>
                        <p className="bz-ks-banner-desc">{t('biz.boostDesc')}</p>
                      </div>
                      <button
                        type="button"
                        className="ud-quick-btn ud-quick-btn--primary bz-cta-gold"
                        style={{ whiteSpace: 'nowrap' }}
                        onClick={() => setActiveSection('kinsell')}
                      >
                        ⚡ {t('biz.launchCampaign')}
                      </button>
                    </div>
                  </div>
                )}

                {deriveTier(myPlan?.planCode) === 'based' && (
                  <div className="bz-ai-reco">
                    <span className="bz-ai-tag">★ {t('biz.upgradeTag')}</span>
                    <p>{t('biz.upgradeDesc')}</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── IA Analytique – Insights ── */}
            {bizHasAnalytics && (bizAnalyticsLoading || bizBasicInsights) && (
              <section className="ud-glass-panel bz-glass-panel">
                <div className="ud-panel-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 className="ud-panel-title">🤖 Kin-Sell Analytique</h2>
                  {bizAnalyticsLoading && <span className="ud-analytics-loading">Analyse…</span>}
                </div>

                {bizBasicInsights && (
                  <div className="ud-analytics-grid">
                    <div className="ud-analytics-card glass-container">
                      <h3 className="ud-analytics-card-title">{t('user.analyticsSummary')}</h3>
                      <div className="ud-analytics-stats">
                        <div className="ud-analytics-stat">
                          <span className="ud-analytics-stat-value">{bizBasicInsights.activitySummary.listings}</span>
                          <span className="ud-analytics-stat-label">Articles</span>
                        </div>
                        <div className="ud-analytics-stat">
                          <span className="ud-analytics-stat-value">{bizBasicInsights.activitySummary.negotiations}</span>
                          <span className="ud-analytics-stat-label">Négociations</span>
                        </div>
                        <div className="ud-analytics-stat">
                          <span className="ud-analytics-stat-value">{bizBasicInsights.activitySummary.orders}</span>
                          <span className="ud-analytics-stat-label">Commandes</span>
                        </div>
                        <div className="ud-analytics-stat">
                          <span className="ud-analytics-stat-value">{formatMoneyFromUsdCents(bizBasicInsights.activitySummary.revenueCents)}</span>
                          <span className="ud-analytics-stat-label">Revenus</span>
                        </div>
                      </div>
                    </div>

                    <div className="ud-analytics-card glass-container">
                      <h3 className="ud-analytics-card-title">{t('user.analyticsMarket')}</h3>
                      <div className="ud-analytics-market">
                        <span className={`ud-analytics-market-badge ud-analytics-market-badge--${bizBasicInsights.marketPosition.position.toLowerCase().replace('_', '-')}`}>
                          {bizBasicInsights.marketPosition.position === 'BELOW_MARKET' ? '📉 Sous le marché' :
                           bizBasicInsights.marketPosition.position === 'ON_MARKET' ? '📊 Au marché' : '📈 Au-dessus du marché'}
                        </span>
                        <p>Prix moyen : {formatMoneyFromUsdCents(bizBasicInsights.marketPosition.avgPriceCents)}</p>
                        <p>Médiane : {formatMoneyFromUsdCents(bizBasicInsights.marketPosition.medianCents)}</p>
                      </div>
                    </div>

                    {bizBasicInsights.trendingCategories.length > 0 && (
                      <div className="ud-analytics-card glass-container">
                        <h3 className="ud-analytics-card-title">{t('user.analyticsTrending')}</h3>
                        <div className="ud-analytics-trending">
                          {bizBasicInsights.trendingCategories.map((cat, i) => (
                            <div key={i} className="ud-analytics-trending-item">
                              <span>{cat.category}</span>
                              <span className="ud-analytics-trending-count">{cat.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {bizBasicInsights.recommendations.length > 0 && (
                      <div className="ud-analytics-card ud-analytics-card--wide glass-container">
                        <h3 className="ud-analytics-card-title">🤖 {t('user.analyticsRecommendations')}</h3>
                        <ul className="ud-analytics-reco-list">
                          {bizBasicInsights.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}

                    {bizDeepInsights && (
                      <>
                        <div className="ud-analytics-card glass-container">
                          <h3 className="ud-analytics-card-title">{t('user.analyticsFunnel')}</h3>
                          <div className="ud-analytics-funnel">
                            <div className="ud-analytics-funnel-step">
                              <span className="ud-analytics-funnel-label">Vues</span>
                              <span className="ud-analytics-funnel-value">{bizDeepInsights.funnel.views}</span>
                            </div>
                            <span className="ud-analytics-funnel-arrow">→</span>
                            <div className="ud-analytics-funnel-step">
                              <span className="ud-analytics-funnel-label">Négociations</span>
                              <span className="ud-analytics-funnel-value">{bizDeepInsights.funnel.negotiations}</span>
                            </div>
                            <span className="ud-analytics-funnel-arrow">→</span>
                            <div className="ud-analytics-funnel-step">
                              <span className="ud-analytics-funnel-label">Commandes</span>
                              <span className="ud-analytics-funnel-value">{bizDeepInsights.funnel.orders}</span>
                            </div>
                            <span className="ud-analytics-funnel-rate">{(bizDeepInsights.funnel.conversionRate * 100).toFixed(1)}% conversion</span>
                          </div>
                        </div>

                        {bizDeepInsights.audienceSegments.length > 0 && (
                          <div className="ud-analytics-card glass-container">
                            <h3 className="ud-analytics-card-title">{t('user.analyticsAudience')}</h3>
                            <div className="ud-analytics-audience">
                              {bizDeepInsights.audienceSegments.map((seg, i) => (
                                <div key={i} className="ud-analytics-audience-seg">
                                  <span>{seg.label}</span>
                                  <div className="ud-analytics-audience-bar">
                                    <div className="ud-analytics-audience-fill" style={{ width: `${seg.percent}%` }} />
                                  </div>
                                  <span className="ud-analytics-audience-pct">{seg.percent}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="ud-analytics-card glass-container">
                          <h3 className="ud-analytics-card-title">{t('user.analyticsVelocity')}</h3>
                          <p style={{ margin: '4px 0', fontSize: 13 }}>Jours moyens pour vendre : <strong>{bizDeepInsights.velocityMetrics.avgDaysToSell}</strong></p>
                          {bizDeepInsights.velocityMetrics.fastestCategory && (
                            <p style={{ margin: '4px 0', fontSize: 13 }}>Catégorie la plus rapide : <strong>{bizDeepInsights.velocityMetrics.fastestCategory}</strong></p>
                          )}
                        </div>

                        <div className="ud-analytics-card glass-container">
                          <h3 className="ud-analytics-card-title">{t('user.analyticsPredictions')}</h3>
                          <div className="ud-analytics-predictions">
                            <div className="ud-analytics-pred-item">
                              <span>Risque de churn</span>
                              <span className={`ud-analytics-pred-score ud-analytics-pred-score--${bizDeepInsights.predictiveScores.churnRisk > 0.6 ? 'high' : bizDeepInsights.predictiveScores.churnRisk > 0.3 ? 'medium' : 'low'}`}>
                                {(bizDeepInsights.predictiveScores.churnRisk * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="ud-analytics-pred-item">
                              <span>Potentiel de croissance</span>
                              <span className="ud-analytics-pred-score ud-analytics-pred-score--growth">
                                {(bizDeepInsights.predictiveScores.growthPotential * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ─ Recommandations Kin-Sell Analytique ─ */}
            <section className="ud-glass-panel bz-glass-panel" style={{ marginTop: 16 }}>
              <h2 className="ud-panel-title">💡 Recommandations Analytique</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                <div style={{
                  background: 'linear-gradient(135deg, rgba(0,200,150,0.08), rgba(111,88,255,0.04))',
                  border: '1px solid rgba(0,200,150,0.2)',
                  borderRadius: 10, padding: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #fff)' }}>
                        📊 {produits.length > 0 ? 'Optimisez vos prix avec l\'intelligence marché' : 'Analysez le marché avant de publier'}
                      </span>
                      <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.5 }}>
                        {produits.length > 0
                          ? `Kin-Sell Analytique compare vos ${produits.length} produit${produits.length > 1 ? 's' : ''} aux prix du marché à Kinshasa. Découvrez si vos prix sont compétitifs et recevez des suggestions d'ajustement pour augmenter vos ventes.`
                          : 'Kin-Sell Analytique vous montre les tendances du marché, les catégories les plus demandées et les fourchettes de prix idéales avant même de publier.'}
                      </p>
                      <button
                        onClick={() => bizHasAnalytics ? undefined : navigate('/pricing')}
                        style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: 'linear-gradient(135deg, #00c896, #00e6ac)', color: '#fff', cursor: 'pointer' }}
                      >
                        {bizHasAnalytics ? '✅ Inclus dans votre forfait' : '📈 Débloquer Analytique'}
                      </button>
                    </div>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,200,150,0.15)', color: '#00c896', whiteSpace: 'nowrap', marginLeft: 8 }}>📊 Analytique</span>
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, rgba(255,165,0,0.06), rgba(111,88,255,0.04))',
                  border: '1px solid rgba(255,165,0,0.2)',
                  borderRadius: 10, padding: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #fff)' }}>
                        🎯 Identifiez vos produits les plus performants
                      </span>
                      <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.5 }}>
                        Quels produits génèrent le plus de vues, de négociations et de ventes ? L'analytique avancée vous révèle votre entonnoir de conversion complet et prédit votre potentiel de croissance.
                      </p>
                      <button
                        onClick={() => bizHasAnalytics ? undefined : navigate('/pricing')}
                        style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: bizHasAnalytics ? 'rgba(76,175,80,0.15)' : 'linear-gradient(135deg, #ff8c00, #ffa500)', color: bizHasAnalytics ? '#4caf50' : '#fff', cursor: bizHasAnalytics ? 'default' : 'pointer' }}
                      >
                        {bizHasAnalytics ? '✅ Données ci-dessus' : '🔓 Voir les forfaits'}
                      </button>
                    </div>
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,165,0,0.15)', color: '#ffa500', whiteSpace: 'nowrap', marginLeft: 8 }}>🎯 Performance</span>
                  </div>
                </div>

                {!bizHasAnalytics && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(111,88,255,0.12), rgba(155,122,255,0.06))',
                    border: '1px solid rgba(111,88,255,0.25)',
                    borderRadius: 10, padding: 14,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #fff)' }}>
                          🏆 Les boutiques avec Analytique vendent 3x plus
                        </span>
                        <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.5 }}>
                          Passez à un forfait Business ou Scale pour accéder à toutes les analyses : prédictions IA, audience, vélocité des ventes, risque de churn et recommandations personnalisées en temps réel.
                        </p>
                        <button
                          onClick={() => navigate('/pricing')}
                          style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, background: 'linear-gradient(135deg, #6f58ff, #9b7aff)', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(111,88,255,0.3)' }}
                        >
                          🚀 Débloquer tout — forfaits Business
                        </button>
                      </div>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(111,88,255,0.15)', color: '#9b7aff', whiteSpace: 'nowrap', marginLeft: 8 }}>💎 Premium</span>
                    </div>
                  </div>
                )}

              </div>
            </section>
          </div>
        )}
        {activeSection === 'parametres' && (
          <div className="ud-section animate-fade-in">

            {/* Identité & Coordonnées */}
            <section className="ud-glass-panel bz-glass-panel">
              <h2 className="ud-panel-title">{t('biz.settingsTitle')}</h2>
              <form className="bz-setup-form" onSubmit={handleSaveSettings}>

                {/* Photo de profil */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 90, height: 90, borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(111,88,255,0.3)', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {settingsAvatarPreview ? (
                      <img src={settingsAvatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : settingsForm.avatar ? (
                      <img src={resolveMediaUrl(settingsForm.avatar)} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-secondary, #aaa)' }}>{(settingsForm.publicName || settingsForm.legalName || 'B').slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label className="ud-quick-btn" style={{ cursor: 'pointer', fontSize: '0.82rem' }}>
                      📷 {settingsForm.avatar || settingsAvatarPreview ? 'Modifier' : 'Ajouter'} la photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 10 * 1024 * 1024) { setSettingsMsg('Photo trop lourde (max 10 Mo)'); return; }
                          if (settingsAvatarPreview) URL.revokeObjectURL(settingsAvatarPreview);
                          setSettingsAvatarFile(file);
                          setSettingsAvatarPreview(URL.createObjectURL(file));
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {(settingsForm.avatar || settingsAvatarPreview) && (
                      <button type="button" className="ud-quick-btn" style={{ fontSize: '0.82rem', color: 'var(--color-error, #ff6b6b)' }} onClick={() => {
                        if (settingsAvatarPreview) URL.revokeObjectURL(settingsAvatarPreview);
                        setSettingsAvatarFile(null);
                        setSettingsAvatarPreview(null);
                        setSettingsForm(f => ({ ...f, avatar: '' }));
                      }}>
                        🗑️ Supprimer
                      </button>
                    )}
                  </div>
                </div>

                <div className="bz-setup-grid">
                  <label className="bz-setup-field">
                    <span>{t('biz.legalNameFull')}</span>
                    <input type="text" value={settingsForm.legalName} onChange={e => setSettingsForm(f => ({ ...f, legalName: e.target.value }))} minLength={2} maxLength={150} placeholder={t('biz.legalNamePh')} />
                  </label>
                  <label className="bz-setup-field">
                    <span>{t('biz.publicNameShop')}</span>
                    <input type="text" value={settingsForm.publicName} onChange={e => setSettingsForm(f => ({ ...f, publicName: e.target.value }))} minLength={2} maxLength={150} />
                  </label>
                  <label className="bz-setup-field">
                    <span>📧 Email</span>
                    <input type="email" value={settingsForm.email} onChange={e => setSettingsForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemple.com" />
                  </label>
                  <label className="bz-setup-field">
                    <span>📱 Téléphone</span>
                    <input type="tel" value={settingsForm.phone} onChange={e => setSettingsForm(f => ({ ...f, phone: e.target.value }))} placeholder="+243 ..." />
                  </label>
                  <label className="bz-setup-field">
                    <span>🔑 Mot de passe actuel</span>
                    <div className="bz-pw-input-wrap">
                      <input type={showPw.cur ? 'text' : 'password'} value={settingsForm.currentPassword} onChange={e => setSettingsForm(f => ({ ...f, currentPassword: e.target.value }))} placeholder="••••••••" autoComplete="current-password" />
                      <button type="button" className="bz-pw-toggle" onClick={() => setShowPw(s => ({ ...s, cur: !s.cur }))} tabIndex={-1} aria-label={showPw.cur ? 'Masquer' : 'Afficher'}>{showPw.cur ? '🙈' : '👁️'}</button>
                    </div>
                  </label>
                  <div className="bz-setup-field">
                    <span>🔑 Nouveau mot de passe</span>
                    <div className="bz-pw-input-wrap">
                      <input type={showPw.new ? 'text' : 'password'} value={settingsForm.newPassword} onChange={e => setSettingsForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="Min. 8 caractères" autoComplete="new-password" />
                      <button type="button" className="bz-pw-toggle" onClick={() => setShowPw(s => ({ ...s, new: !s.new }))} tabIndex={-1} aria-label={showPw.new ? 'Masquer' : 'Afficher'}>{showPw.new ? '🙈' : '👁️'}</button>
                    </div>
                    {settingsForm.newPassword && (() => {
                      const pw = settingsForm.newPassword;
                      const hasUpper = /[A-Z]/.test(pw);
                      const hasLower = /[a-z]/.test(pw);
                      const hasDigit = /\d/.test(pw);
                      const hasSymbol = /[^A-Za-z0-9]/.test(pw);
                      const rulesOk = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
                      const strength = pw.length < 8 ? 0 : pw.length >= 10 && rulesOk === 4 ? 3 : rulesOk >= 3 ? 2 : 1;
                      const labels = ['Faible', 'Faible', 'Fort', 'Parfait'] as const;
                      const colors = ['var(--color-error, #ff6b6b)', 'var(--color-error, #ff6b6b)', '#ff9800', '#4caf50'] as const;
                      return (
                        <div className="bz-pw-strength">
                          <div className="bz-pw-strength-bar">
                            <div className="bz-pw-strength-fill" style={{ width: `${(strength / 3) * 100}%`, background: colors[strength] }} />
                          </div>
                          <span className="bz-pw-strength-label" style={{ color: colors[strength] }}>{labels[strength]}</span>
                          <div className="bz-pw-rules">
                            <span className={hasUpper ? 'bz-pw-rule--ok' : 'bz-pw-rule--no'}>ABC majuscule</span>
                            <span className={hasLower ? 'bz-pw-rule--ok' : 'bz-pw-rule--no'}>abc minuscule</span>
                            <span className={hasDigit ? 'bz-pw-rule--ok' : 'bz-pw-rule--no'}>123 chiffre</span>
                            <span className={hasSymbol ? 'bz-pw-rule--ok' : 'bz-pw-rule--no'}>@#$ symbole</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="bz-setup-field">
                    <span>🔑 Confirmer le nouveau mot de passe</span>
                    <div className="bz-pw-input-wrap">
                      <input type={showPw.confirm ? 'text' : 'password'} value={settingsForm.confirmPassword} onChange={e => setSettingsForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="••••••••" autoComplete="new-password" />
                      <button type="button" className="bz-pw-toggle" onClick={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))} tabIndex={-1} aria-label={showPw.confirm ? 'Masquer' : 'Afficher'}>{showPw.confirm ? '🙈' : '👁️'}</button>
                    </div>
                    {settingsForm.confirmPassword && (
                      <span className={`bz-pw-match ${settingsForm.confirmPassword === settingsForm.newPassword ? 'bz-pw-match--ok' : 'bz-pw-match--no'}`}>
                        {settingsForm.confirmPassword === settingsForm.newPassword ? '✓ OK' : '✗ Ne correspond pas'}
                      </span>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary, #aaa)', margin: '8px 0 0' }}>
                  Laissez les champs mot de passe vides si vous ne souhaitez pas le changer.
                </p>

                {settingsMsg && <p className={`bz-setup-${settingsMsg.startsWith('✓') ? 'note' : 'error'}`}>{settingsMsg}</p>}
                <div className="bz-setup-actions" style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
                  <button type="submit" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" disabled={settingsSaving}>
                    {settingsSaving ? t('biz.saving') : t('biz.saveSettings')}
                  </button>
                  <button type="button" className="ud-quick-btn" onClick={() => setActiveSection('boutique')}>
                    🏪 {t('biz.editShopBtn')} →
                  </button>
                </div>
              </form>
            </section>

            {/* ── Section: Sécurité du compte ── */}
            <section className="ud-glass-panel bz-glass-panel">
              <div className="ud-settings-section-head">
                <span className="ud-settings-section-icon">🔒</span>
                <h3 className="ud-settings-section-title">Sécurité du compte</h3>
              </div>
              <div className="ud-settings-security-grid">
                {user && <DashboardSecurityBlock user={user} t={t} />}
              </div>
            </section>

            {/* ── Zone sensible ── */}
            <section className="ud-glass-panel bz-glass-panel ud-settings-danger">
              <h2 className="ud-panel-title" style={{ color: 'var(--color-error, #ff6b6b)' }}>⚠️ {t('biz.dangerZone')}</h2>

              {bzDeleteStep === 'idle' && (
                <>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
                    {t('biz.deleteWarning')}
                  </p>
                  <button
                    type="button"
                    className="ud-quick-btn ud-settings-delete-btn"
                    onClick={() => setBzDeleteStep('confirm')}
                  >
                    🗑️ {t('biz.deleteBtn')}
                  </button>
                </>
              )}

              {bzDeleteStep === 'confirm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>{t('biz.deleteConfirmTitle')}</p>
                  <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    {t('biz.deleteConfirmDesc')}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="ud-quick-btn ud-settings-delete-btn" onClick={() => setBzDeleteStep('reason')}>
                      {t('biz.deleteYes')}
                    </button>
                    <button type="button" className="ud-quick-btn" onClick={() => setBzDeleteStep('idle')}>
                      {t('biz.deleteCancel')}
                    </button>
                  </div>
                </div>
              )}

              {bzDeleteStep === 'reason' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    {t('biz.deleteReasonPrompt')}
                  </p>
                  <textarea
                    className="bz-setup-field"
                    style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--glass-border, rgba(255,255,255,0.15))', color: 'var(--color-text-primary)', resize: 'vertical' }}
                    placeholder={t('biz.deleteReasonPh')}
                    value={bzDeleteReason}
                    onChange={e => setBzDeleteReason(e.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                  {bzDeleteError && (
                    <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--color-error, #ff6b6b)' }}>{bzDeleteError}</p>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="ud-quick-btn ud-settings-delete-btn"
                      disabled={bzDeleteBusy}
                      onClick={async () => {
                        setBzDeleteBusy(true);
                        setBzDeleteError(null);
                        try {
                          await authApi.requestDeletion(bzDeleteReason.trim() || 'Non précisé');
                          setBzDeleteStep('done');
                        } catch {
                          setBzDeleteError(t('biz.deleteError'));
                        } finally {
                          setBzDeleteBusy(false);
                        }
                      }}
                    >
                      {bzDeleteBusy ? '...' : t('biz.deleteConfirm')}
                    </button>
                    <button
                      type="button"
                      className="ud-quick-btn"
                      disabled={bzDeleteBusy}
                      onClick={() => { setBzDeleteStep('idle'); setBzDeleteReason(''); setBzDeleteError(null); }}
                    >
                      {t('biz.deleteCancel')}
                    </button>
                  </div>
                </div>
              )}

              {bzDeleteStep === 'done' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>✅ {t('biz.deleteDoneTitle')}</p>
                  <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                    {t('biz.deleteDoneDesc')}
                  </p>
                </div>
              )}
            </section>

          </div>
        )}

        {/* ═══════════════  ONGLET KIN-SELL (BUSINESS)  ═══════════════ */}
        {activeSection === 'kinsell' && (
          <div className="ud-section animate-fade-in">
            <section className="ud-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">🧠 Kin-Sell</h2>
              </div>

              {/* Forfait actif */}
              <div style={{ background: 'rgba(111,88,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid rgba(111,88,255,0.12)' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 15, color: 'var(--color-text-primary, #fff)' }}>📋 Forfait Business</h3>
                {myPlan ? (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 22, fontWeight: 700, color: '#6f58ff' }}>{myPlan.planName}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #aaa)', marginLeft: 8 }}>
                        {myPlan.status === 'ACTIVE' ? '✅ Actif' : myPlan.status}
                      </span>
                    </div>
                    {myPlan.priceUsdCents > 0 && (
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #aaa)' }}>
                        {(myPlan.priceUsdCents / 100).toFixed(2)}$/mois
                      </span>
                    )}
                    <Link to="/pricing" style={{ fontSize: 12, color: '#6f58ff', fontWeight: 600, textDecoration: 'none' }}>
                      {myPlan.planCode === 'STARTER' ? '🚀 Passer à Business/Scale' : '⚙ Gérer mon forfait'}
                    </Link>
                  </div>
                ) : (
                  <p style={{ color: 'var(--color-text-secondary, #aaa)', fontSize: 13 }}>
                    Aucun forfait actif. <Link to="/pricing" style={{ color: '#6f58ff' }}>Voir les forfaits</Link>
                  </p>
                )}
              </div>

              {/* IA disponibles */}
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--color-text-primary, #fff)' }}>🤖 IA disponibles</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {[
                    { name: 'IA Marchande', icon: '🤝', desc: 'Négociation automatisée', active: bizAiAutoNegoEnabled, locked: !bizHasIaMarchandPlan },
                    { name: 'IA Ads', icon: '📢', desc: 'Boost articles & boutique', active: bizAiAdviceEnabled, locked: false },
                    { name: 'Kin-Sell Analytique', icon: '📊', desc: 'Analyses marché avancées', active: bizHasAnalytics, locked: !bizHasAnalytics },
                    { name: 'IA Commande', icon: '📦', desc: 'Automatisation des ventes', active: bizAiCommandeEnabled, locked: !bizHasIaOrderPlan },
                  ].map((ia) => (
                    <div key={ia.name} style={{
                      background: ia.locked ? 'rgba(255,255,255,0.02)' : 'rgba(111,88,255,0.05)',
                      border: `1px solid ${ia.locked ? 'rgba(255,255,255,0.06)' : 'rgba(111,88,255,0.15)'}`,
                      borderRadius: 10, padding: '12px 14px', opacity: ia.locked ? 0.6 : 1,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #fff)' }}>{ia.icon} {ia.name}</span>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: ia.active && !ia.locked ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.06)', color: ia.active && !ia.locked ? '#4caf50' : '#888' }}>
                          {ia.locked ? '🔒 Forfait requis' : ia.active ? '✅ Active' : '⏸ Inactive'}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary, #aaa)' }}>{ia.desc}</p>
                      {ia.locked && (
                        <Link to="/pricing" style={{ fontSize: 11, color: '#6f58ff', marginTop: 4, display: 'inline-block' }}>Débloquer →</Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ─ Offres Publicité Kin-Sell Ads ─ */}
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--color-text-primary, #fff)' }}>📢 Publicité Kin-Sell</h3>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-secondary, #aaa)' }}>
                  Boostez la visibilité de votre boutique et vos articles avec les espaces publicitaires Kin-Sell.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  <div style={{ background: 'rgba(111,88,255,0.04)', border: '1px solid rgba(111,88,255,0.12)', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>🌱</span>
                      <strong style={{ fontSize: 14, color: 'var(--color-text-primary, #fff)' }}>Starter</strong>
                      <span style={{ fontSize: 11, color: '#6f58ff', marginLeft: 'auto' }}>$2/sem.</span>
                    </div>
                    <ul style={{ margin: '0 0 10px', padding: '0 0 0 16px', fontSize: 11, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.8 }}>
                      <li>{t('biz.starterFeat1')}</li>
                      <li>{t('biz.starterFeat2')}</li>
                      <li>{t('biz.starterFeat3')}</li>
                    </ul>
                    <button type="button" onClick={() => navigate('/pricing')} style={{ width: '100%', padding: '6px 0', fontSize: 11, fontWeight: 600, border: '1px solid rgba(111,88,255,0.2)', borderRadius: 6, background: 'transparent', color: '#6f58ff', cursor: 'pointer' }}>
                      Activer →
                    </button>
                  </div>
                  <div style={{ background: 'linear-gradient(135deg, rgba(111,88,255,0.08), rgba(155,122,255,0.04))', border: '1px solid rgba(111,88,255,0.2)', borderRadius: 10, padding: 14, position: 'relative' }}>
                    <span style={{ position: 'absolute', top: -8, right: 12, fontSize: 9, padding: '2px 8px', borderRadius: 6, background: 'linear-gradient(135deg, #6f58ff, #9b7aff)', color: '#fff', fontWeight: 600 }}>⭐ Populaire</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>🚀</span>
                      <strong style={{ fontSize: 14, color: 'var(--color-text-primary, #fff)' }}>Pro</strong>
                      <span style={{ fontSize: 11, color: '#6f58ff', marginLeft: 'auto' }}>$5/sem.</span>
                    </div>
                    <ul style={{ margin: '0 0 10px', padding: '0 0 0 16px', fontSize: 11, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.8 }}>
                      <li>{t('biz.proFeat1')}</li>
                      <li>{t('biz.proFeat2')}</li>
                      <li>{t('biz.proFeat3')}</li>
                      <li>{t('biz.proFeat4')}</li>
                    </ul>
                    <button type="button" onClick={() => navigate('/pricing')} style={{ width: '100%', padding: '6px 0', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: 'linear-gradient(135deg, #6f58ff, #9b7aff)', color: '#fff', cursor: 'pointer' }}>
                      Activer →
                    </button>
                  </div>
                  <div style={{ background: 'rgba(255,215,0,0.04)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ fontSize: 18 }}>👑</span>
                      <strong style={{ fontSize: 14, color: 'var(--color-text-primary, #fff)' }}>Gold</strong>
                      <span style={{ fontSize: 11, color: '#ffd700', marginLeft: 'auto' }}>$14/mois</span>
                    </div>
                    <ul style={{ margin: '0 0 10px', padding: '0 0 0 16px', fontSize: 11, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.8 }}>
                      <li>{t('biz.goldFeat1')}</li>
                      <li>{t('biz.goldFeat2')}</li>
                      <li>{t('biz.goldFeat3')}</li>
                      <li>{t('biz.goldFeat4')}</li>
                      <li>{t('biz.goldFeat5')}</li>
                    </ul>
                    <button type="button" onClick={() => navigate('/pricing')} style={{ width: '100%', padding: '6px 0', fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,215,0,0.2)', borderRadius: 6, background: 'transparent', color: '#ffd700', cursor: 'pointer' }}>
                      Contacter →
                    </button>
                  </div>
                </div>
              </div>

              {/* Essais IA */}
              {ksTrials.filter(tr => tr.status === 'PROPOSED' || tr.status === 'ACTIVE').length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--color-text-primary, #fff)' }}>🎁 Essais gratuits</h3>
                  {ksTrials.filter(tr => tr.status === 'PROPOSED' || tr.status === 'ACTIVE').map((trial) => (
                    <div key={trial.id} style={{
                      background: trial.status === 'ACTIVE' ? 'rgba(76,175,80,0.08)' : 'rgba(255,152,0,0.08)',
                      border: `1px solid ${trial.status === 'ACTIVE' ? 'rgba(76,175,80,0.2)' : 'rgba(255,152,0,0.2)'}`,
                      borderRadius: 10, padding: 14, marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary, #fff)' }}>
                            Forfait {trial.planCode} — {trial.status === 'ACTIVE' ? '✅ En cours' : '⏳ Proposé'}
                          </span>
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary, #aaa)' }}>{trial.reason}</p>
                          {trial.endsAt && trial.status === 'ACTIVE' && (
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#ff9800' }}>
                              Expire le {new Date(trial.endsAt).toLocaleDateString('fr-FR')}
                            </p>
                          )}
                        </div>
                        {trial.status === 'PROPOSED' && (
                          <button
                            onClick={async () => {
                              try {
                                await aiTrials.activate(trial.id);
                                const [recs, trials] = await Promise.all([aiRecommendations.getActive(), aiTrials.getMyTrials()]);
                                setKsRecommendations(recs);
                                setKsTrials(trials);
                              } catch { /* silent */ }
                            }}
                            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: 'linear-gradient(135deg, #6f58ff, #9b7aff)', color: '#fff', cursor: 'pointer' }}
                          >
                            Activer l'essai
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommandations IA actives */}
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--color-text-primary, #fff)' }}>💡 Recommandations</h3>
                {ksLoading ? (
                  <p style={{ color: 'var(--color-text-secondary, #aaa)', fontSize: 13 }}>Chargement…</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                    {/* Backend AI recommendations */}
                    {ksRecommendations.map((rec) => (
                      <div key={rec.id} style={{
                        background: 'rgba(111,88,255,0.04)',
                        border: '1px solid rgba(111,88,255,0.1)',
                        borderRadius: 10, padding: 14,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #fff)' }}>{rec.title}</span>
                            <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{rec.message}</p>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={async () => {
                                  try {
                                    await aiRecommendations.accept(rec.id);
                                    if (rec.actionType === 'ACTIVATE_TRIAL' && rec.actionTarget) {
                                      await aiTrials.activate(rec.actionTarget);
                                    }
                                    if (rec.actionType === 'VIEW_ANALYTICS') { setActiveSection('analytics'); } else { navigate('/pricing'); }
                                  } catch { /* silent */ }
                                }}
                                style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: 'linear-gradient(135deg, #6f58ff, #9b7aff)', color: '#fff', cursor: 'pointer' }}
                              >
                                {rec.actionType === 'BOOST_ARTICLE' ? 'Booster' : rec.actionType === 'ACTIVATE_TRIAL' ? 'Activer l\'essai' : rec.actionType === 'VIEW_ANALYTICS' ? 'Voir mes analyses' : 'Voir les forfaits'}
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await aiRecommendations.dismiss(rec.id);
                                    setKsRecommendations(prev => prev.filter(r => r.id !== rec.id));
                                  } catch { /* silent */ }
                                }}
                                style={{ padding: '6px 12px', fontSize: 11, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
                              >
                                Ignorer
                              </button>
                            </div>
                          </div>
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(111,88,255,0.1)', color: '#6f58ff', whiteSpace: 'nowrap', marginLeft: 8 }}>
                            {rec.engineKey === 'ads' ? '📢 Ads' : rec.engineKey === 'analytics' ? '📊 Analytique' : rec.engineKey === 'order' ? '📦 Commande' : rec.engineKey === 'negotiation' ? '🤝 Marchand' : '🧠 IA'}
                          </span>
                        </div>
                      </div>
                    ))}

                    {/* Smart IA ADS recommendation */}
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(111,88,255,0.08), rgba(255,165,0,0.06))',
                      border: '1px solid rgba(255,165,0,0.2)',
                      borderRadius: 10, padding: 14,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #fff)' }}>
                            {produits.length > 0
                              ? '⚡ Boostez vos produits dans les espaces publicitaires Kin-Sell'
                              : '⚡ Ajoutez des produits et boostez votre boutique'}
                          </span>
                          <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.5 }}>
                            {produits.length > 0
                              ? `Vous avez ${produits.length} produit${produits.length > 1 ? 's' : ''}. L'IA ADS peut les placer dans 9 espaces publicitaires sur Kin-Sell (Explorer, So-Kin, bannières) pour multiplier vos vues et attirer plus de clients.`
                              : 'Ajoutez vos premiers produits et l\'IA ADS les mettra en avant dans l\'Explorer, So-Kin et les bannières Kin-Sell pour un maximum de visibilité.'}
                          </p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => { if (produits.length > 0) { setActiveSection('produits'); } else { setActiveSection('produits'); setCreateMode('produit'); setCreateStep(1); setEditingArticleId(null); } }}
                              style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: 'linear-gradient(135deg, #ff8c00, #ffa500)', color: '#fff', cursor: 'pointer' }}
                            >
                              {produits.length > 0 ? '🚀 Booster mes produits' : '📦 Ajouter un produit'}
                            </button>
                          </div>
                        </div>
                        <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,165,0,0.15)', color: '#ffa500', whiteSpace: 'nowrap', marginLeft: 8 }}>
                          📢 IA ADS
                        </span>
                      </div>
                    </div>

                    {/* Kin-Sell Analytique teaser */}
                    {!bizHasAnalytics && (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(111,88,255,0.08), rgba(0,200,150,0.06))',
                        border: '1px solid rgba(0,200,150,0.2)',
                        borderRadius: 10, padding: 14,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #fff)' }}>
                              📊 Analysez votre marché avec Kin-Sell Analytique
                            </span>
                            <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.5 }}>
                              Accédez aux prix moyens par catégorie, produits tendance à Kinshasa, analyse de vos concurrents et prédictions de ventes. Les boutiques abonnées augmentent leurs ventes de 3x en moyenne.
                            </p>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => navigate('/pricing')}
                                style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 6, background: 'linear-gradient(135deg, #00c896, #00e6ac)', color: '#fff', cursor: 'pointer' }}
                              >
                                📈 Débloquer Analytique
                              </button>
                            </div>
                          </div>
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,200,150,0.15)', color: '#00c896', whiteSpace: 'nowrap', marginLeft: 8 }}>
                            📊 Analytique
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Upgrade CTA for Starter plan */}
                    {myPlan && myPlan.planCode === 'STARTER' && (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(111,88,255,0.12), rgba(155,122,255,0.08))',
                        border: '1px solid rgba(111,88,255,0.25)',
                        borderRadius: 10, padding: 14,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary, #fff)' }}>
                              🏆 Passez au forfait Business ou Scale
                            </span>
                            <p style={{ margin: '4px 0 8px', fontSize: 12, color: 'var(--color-text-secondary, #aaa)', lineHeight: 1.5 }}>
                              Avec le forfait Starter, vous manquez : IA Marchande, IA Commande, Analytique avancée, négociation automatisée et support prioritaire. Passez à Business pour débloquer tout le potentiel de votre boutique !
                            </p>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => navigate('/pricing')}
                                style={{ padding: '6px 14px', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 6, background: 'linear-gradient(135deg, #6f58ff, #9b7aff)', color: '#fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(111,88,255,0.3)' }}
                              >
                                🚀 Voir les forfaits Business
                              </button>
                            </div>
                          </div>
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(111,88,255,0.15)', color: '#9b7aff', whiteSpace: 'nowrap', marginLeft: 8 }}>
                            💎 Upgrade
                          </span>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>

              {/* CTA */}
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <Link to="/pricing" style={{
                  display: 'inline-block', padding: '10px 24px', borderRadius: 10,
                  background: 'linear-gradient(135deg, #6f58ff, #9b7aff)', color: '#fff',
                  fontWeight: 600, fontSize: 14, textDecoration: 'none',
                  boxShadow: '0 4px 16px rgba(111,88,255,0.3)',
                }}>
                  🚀 Voir tous les forfaits Business
                </Link>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ─── MOBILE FAB (scroll-hide) ───────────────────── */}
      <nav className={`bz-mobile-fab${barsHidden ? ' bz-mobile-fab--hidden' : ''}`} aria-label="Navigation mobile">
        <button type="button" className={`bz-fab-item${activeSection === 'produits' ? ' bz-fab-item--active' : ''}`} onClick={() => setActiveSection('produits')}>
          <span className="bz-fab-icon">📦</span>
          <span className="bz-fab-label">Produits</span>
        </button>
        <button type="button" className={`bz-fab-item${activeSection === 'services' ? ' bz-fab-item--active' : ''}`} onClick={() => setActiveSection('services')}>
          <span className="bz-fab-icon">🛠️</span>
          <span className="bz-fab-label">Services</span>
        </button>
        <button type="button" className="bz-fab-item" onClick={() => navigate('/')}>
          <span className="bz-fab-icon bz-fab-icon--home">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <span className="bz-fab-label">Accueil</span>
        </button>
        <button type="button" className={`bz-fab-item${activeSection === 'messages' ? ' bz-fab-item--active' : ''}`} onClick={() => navigate('/messaging')}>
          <span className="bz-fab-icon">💬</span>
          <span className="bz-fab-label">Messagerie</span>
        </button>
        <button type="button" className={`bz-fab-item${activeSection === 'commandes' ? ' bz-fab-item--active' : ''}`} onClick={() => setActiveSection('commandes')}>
          <span className="bz-fab-icon">🛒</span>
          <span className="bz-fab-label">Commandes</span>
        </button>
      </nav>

      {/* ─── LOGOUT CONFIRM POPUP ────────────────────────── */}
      {logoutConfirmOpen && (
        <div className="bz-logout-overlay" onClick={() => setLogoutConfirmOpen(false)}>
          <div className="bz-logout-popup glass-container" onClick={e => e.stopPropagation()}>
            <p className="bz-logout-text">{t('common.logoutConfirm') || 'Voulez-vous vraiment vous déconnecter ?'}</p>
            <div className="bz-logout-actions">
              <button type="button" className="bz-logout-btn bz-logout-btn--cancel" onClick={() => setLogoutConfirmOpen(false)}>
                {t('common.cancel') || 'Annuler'}
              </button>
              <button type="button" className="bz-logout-btn bz-logout-btn--confirm" onClick={() => { logout(); navigate('/login'); }}>
                {t('common.logout') || 'Déconnexion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PromoCreator Services ─── */}
      {promoServices && promoServices.length > 0 && (
        <PromoCreator
          articles={promoServices}
          resolveMediaUrl={resolveMediaUrl}
          onClose={closeSvcPromo}
          onPublished={() => {
            closeSvcPromo();
            invalidateCache('/listings/mine');
            listings.mine({ limit: 50 }).then(r => setMyListings(r.listings)).catch(() => {});
          }}
          onBoost={() => {
            setBoostPopupBulkCount(promoServices.length);
            closeSvcPromo();
          }}
        />
      )}

      {/* ─── PromoCreator Produits ─── */}
      {promoProduits && promoProduits.length > 0 && (
        <PromoCreator
          articles={promoProduits}
          resolveMediaUrl={resolveMediaUrl}
          onClose={closeProdPromo}
          onPublished={() => {
            closeProdPromo();
            invalidateCache('/listings/mine');
            listings.mine({ limit: 50 }).then(r => setMyListings(r.listings)).catch(() => {});
          }}
          onBoost={() => {
            setBoostPopupBulkCount(promoProduits.length);
            closeProdPromo();
          }}
        />
      )}

      {/* ─── ADS Boost / Highlight popup ─── */}
      {(boostPopupListingId || boostPopupBulkCount) && (
        <AdsBoostPopup
          listingId={boostPopupListingId ?? undefined}
          bulkImportedCount={boostPopupBulkCount ?? undefined}
          businessId={business?.id}
          onClose={() => { setBoostPopupListingId(null); setBoostPopupBulkCount(null); }}
        />
      )}
    </div>
  );
}
