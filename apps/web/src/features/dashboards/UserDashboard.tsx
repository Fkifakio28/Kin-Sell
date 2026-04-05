import { type FormEvent, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { getDashboardPath } from '../../utils/role-routing';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { DashboardMessaging } from './DashboardMessaging';
import {
  ApiError,
  auth as authApi,
  billing,
  listings as listingsApi,
  messaging,
  negotiations as negotiationsApi,
  orders,
  analyticsAi,
  aiRecommendations,
  aiTrials,
  type AiRecommendation,
  type AiTrial,
  type BillingPlanSummary,
  type BasicInsights,
  type DeepInsights,
  type BundleItemSummary,
  type CartSummary,
  type ListingStatus,
  type MyListing,
  type MyListingsStats,
  type NegotiationSummary,
  type NegotiationStatus,
  type OrderSummary,
  type OrderStatus,
  users as usersApi,
  reviews as reviewsApi,
  resolveMediaUrl
} from '../../lib/api-client';
import type { BulkImportItemInput, BulkImportResult, DbPreviewConfig } from '../../lib/services/listings.service';
import { NegotiationRespondPopup } from '../negotiations/NegotiationRespondPopup';
import { compressAndEncodeMedia } from '../../utils/media-compress';
import { prepareMediaUrls } from '../../utils/media-upload';
import { AdBanner } from '../../components/AdBanner';
import { SmartAdSlot } from '../../components/SmartAdSlot';
import { OrderValidationQrModal } from '../../components/OrderValidationQrModal';
import LocationPicker from '../../components/LocationPicker';
import VisibilitySelector from '../../components/VisibilitySelector';
import type { StructuredLocation, LocationVisibility } from '../../lib/api-client';
import { extractValidationCodeFromQrPayload } from '../../utils/order-validation';
import { useSocket } from '../../hooks/useSocket';
import { LISTING_PRODUCT_CATEGORIES, LISTING_SERVICE_CATEGORIES } from '../../shared/constants/categories';
import { USD_TO_CDF_RATE } from '../../shared/constants/currencies';
import { SK_AI_ADVICE, SK_AI_AUTO_NEGO, SK_AI_COMMANDE } from '../../shared/constants/storage-keys';
import {
  DashboardSecurityBlock,
  DashboardAccountDeletion,
  DashboardAiSettings,
  DashboardAnalyticsInsights,
  DashboardContactsSection,
  DashboardVerificationSection,
} from './sections';
import './dashboard.css';

const PRODUCT_CATEGORIES = LISTING_PRODUCT_CATEGORIES;
const SERVICE_CATEGORIES = LISTING_SERVICE_CATEGORIES;

type HubSection =
  | 'overview'
  | 'articles'
  | 'sales'
  | 'purchases'
  | 'messages'
  | 'contacts'
  | 'sokin'
  | 'my-profile-page'
  | 'public-profile'
  | 'verification'
  | 'analytics'
  | 'kinsell'
  | 'settings';

type PublicListing = {
  id: string;
  type: string;
  title: string;
  category: string;
  city: string;
  imageUrl: string | null;
  createdAt: string;
};

type PublicProfilePreview = {
  username: string | null;
  displayName: string;
  city: string | null;
  country: string | null;
  bio: string | null;
  domain: string | null;
  qualification: string | null;
  experience: string | null;
  workHours: string | null;
  listings: PublicListing[];
};

type SettingsForm = {
  avatarUrl: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  birthDate: string;
  country: string;
  countryCode: string;
  city: string;
  region: string;
  district: string;
  address1: string;
  address2: string;
  address3: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string;
  locationVisibility: LocationVisibility;
  onlineStatusVisible: boolean;
};

const SECTION_DEFS: Array<{ key: HubSection; labelKey: string; icon: string }> = [
  { key: 'overview', labelKey: 'user.overview', icon: '⊞' },
  { key: 'articles', labelKey: 'user.articles', icon: '🧩' },
  { key: 'sales', labelKey: 'user.sellSpace', icon: '📦' },
  { key: 'purchases', labelKey: 'user.buySpace', icon: '🛍️' },
  { key: 'messages', labelKey: 'user.messaging', icon: '💬' },
  { key: 'contacts', labelKey: 'user.myContacts', icon: '🤝' },
  { key: 'sokin', labelKey: 'sokin.home', icon: '✦' },
  { key: 'my-profile-page', labelKey: 'user.myProfile', icon: '🪪' },
  { key: 'public-profile', labelKey: 'user.publicProfile', icon: '👤' },
  { key: 'verification', labelKey: 'user.verification', icon: '✅' },
  { key: 'analytics', labelKey: 'user.analytics', icon: '📊' },
  { key: 'kinsell', labelKey: 'Kin-Sell', icon: '🧠' },
  { key: 'settings', labelKey: 'user.settings', icon: '⚙' },
];

const ROLE_LABEL_KEY: Record<string, string> = { BUSINESS: 'user.business', USER: 'user.userRole' };

function splitDisplayName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

const MISSING_FIELD_KEYS: Array<{ check: (u: NonNullable<ReturnType<typeof useAuth>['user']>) => boolean; key: string }> = [
  { check: (u) => !u.profile.username, key: 'user.publicAlias' },
  { check: (u) => !u.email && !u.phone, key: 'user.emailOrPhone' },
  { check: (u) => !u.profile.city, key: 'user.city' },
  { check: (u) => !u.profile.country, key: 'user.country' },
  { check: (u) => !u.profile.birthDate, key: 'user.birthDate' },
  { check: (u) => !u.profile.addressLine1, key: 'user.mainAddress' },
];

function toDateInput(value: string | null) {
  if (!value) {
    return '';
  }
  return value.slice(0, 10);
}

const STATUS_LABEL_KEY: Record<string, string> = {
  PENDING: 'order.status.pending',
  CONFIRMED: 'order.status.confirmed',
  PROCESSING: 'order.status.processing',
  SHIPPED: 'order.status.shipped',
  DELIVERED: 'order.status.delivered',
  CANCELED: 'order.status.canceled',
};

function statusClass(status: OrderStatus) {
  switch (status) {
    case 'DELIVERED':
      return 'ud-status-badge ud-status-badge--success';
    case 'CANCELED':
      return 'ud-status-badge ud-status-badge--danger';
    case 'SHIPPED':
    case 'PROCESSING':
      return 'ud-status-badge ud-status-badge--warning';
    default:
      return 'ud-status-badge';
  }
}

function nextSellerStatuses(status: OrderStatus): OrderStatus[] {
  switch (status) {
    case 'PENDING':
      return ['CONFIRMED', 'CANCELED'];
    case 'CONFIRMED':
      return ['PROCESSING', 'CANCELED'];
    case 'PROCESSING':
      return ['SHIPPED', 'CANCELED'];
    default:
      return [];
  }
}

export function UserDashboard() {
  const navigate = useNavigate();
  const { t, formatMoneyFromUsdCents, formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const { user, isLoading, isLoggedIn, logout, refreshUser } = useAuth();
  const { on, off } = useSocket();
  const money = (usdCents: number) => formatMoneyFromUsdCents(usdCents);
  const statusLabel = (status: string) => t(STATUS_LABEL_KEY[status] ?? status);
  const missing = user ? MISSING_FIELD_KEYS.filter(f => f.check(user)).map(f => t(f.key)) : [];

  const [activeSection, setActiveSection] = useState<HubSection>(() => {
    const stored = sessionStorage.getItem('ud-section');
    if (stored) {
      sessionStorage.removeItem('ud-section');
      if (stored === 'negotiations') {
        return 'purchases';
      }
      return stored as HubSection;
    }
    return 'overview';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sessionsCount, setSessionsCount] = useState<number | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  useEffect(() => {
    if (activeSection === 'messages') {
      navigate('/messaging', { replace: true });
    }
  }, [activeSection, navigate]);

  // ── TOTP 2FA state ──
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetupUri, setTotpSetupUri] = useState<string | null>(null);
  const [totpSetupSecret, setTotpSetupSecret] = useState<string | null>(null);
  const [totpSetupCode, setTotpSetupCode] = useState('');
  const [totpDisablePassword, setTotpDisablePassword] = useState('');
  const [totpStep, setTotpStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpMessage, setTotpMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState<string | null>(null);
  // ── Email verification state ──
  const [emailVerifStep, setEmailVerifStep] = useState<'idle' | 'sent' | 'done'>('idle');
  const [emailVerifId, setEmailVerifId] = useState('');
  const [emailVerifCode, setEmailVerifCode] = useState('');
  const [emailVerifBusy, setEmailVerifBusy] = useState(false);
  const [emailVerifMsg, setEmailVerifMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [emailVerifDevCode, setEmailVerifDevCode] = useState<string | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfilePreview | null>(null);
  const [loadingPublicProfile, setLoadingPublicProfile] = useState(false);
  const [activePlan, setActivePlan] = useState<BillingPlanSummary | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [basicInsights, setBasicInsights] = useState<BasicInsights | null>(null);
  const [deepInsights, setDeepInsights] = useState<DeepInsights | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // ── Kin-Sell tab state ──
  const [ksRecommendations, setKsRecommendations] = useState<AiRecommendation[]>([]);
  const [ksTrials, setKsTrials] = useState<AiTrial[]>([]);
  const [ksLoading, setKsLoading] = useState(false);
  // ── AI preferences (localStorage-persisted) ──
  const [aiAdviceEnabled, setAiAdviceEnabled] = useState(() => localStorage.getItem(SK_AI_ADVICE) !== 'off');
  const [aiAutoNegoEnabled, setAiAutoNegoEnabled] = useState(() => localStorage.getItem(SK_AI_AUTO_NEGO) === 'on');
  const [aiCommandeEnabled, setAiCommandeEnabled] = useState(() => localStorage.getItem(SK_AI_COMMANDE) !== 'off');
  const [savingSettings, setSavingSettings] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  // Suppression de compte
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'reason' | 'done'>('idle');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadingCommerce, setLoadingCommerce] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    deliveryAddress: '',
    serviceMaintenanceAddress: '',
    serviceExecutionAddress: '',
    paymentMethod: 'MPESA' as 'CARD' | 'PAYPAL' | 'MPESA' | 'ORANGE_MONEY' | 'CASH_ON_DELIVERY',
    additionalNote: ''
  });
  const [orderStatusBusyId, setOrderStatusBusyId] = useState<string | null>(null);
  const [validationCodeBusyId, setValidationCodeBusyId] = useState<string | null>(null);
  const [sellerValidationQr, setSellerValidationQr] = useState<{ orderId: string; code: string } | null>(null);
  const [buyerConfirmOrderId, setBuyerConfirmOrderId] = useState<string | null>(null);
  const [buyerConfirmCode, setBuyerConfirmCode] = useState('');
  const [buyerConfirmBusy, setBuyerConfirmBusy] = useState(false);
  const [buyerConfirmMode, setBuyerConfirmMode] = useState<'manual' | 'scan'>('manual');
  const [buyerConfirmScanMessage, setBuyerConfirmScanMessage] = useState<string | null>(null);
  const [buyerConfirmScanError, setBuyerConfirmScanError] = useState<string | null>(null);
  const [sellerHistoryPage, setSellerHistoryPage] = useState(1);
  const [buyerHistoryPage, setBuyerHistoryPage] = useState(1);
  const [sellerHistoryTotalPages, setSellerHistoryTotalPages] = useState(1);
  const [buyerHistoryTotalPages, setBuyerHistoryTotalPages] = useState(1);
  const [buyerCart, setBuyerCart] = useState<CartSummary | null>(null);
  const [sellerInProgress, setSellerInProgress] = useState<OrderSummary[]>([]);
  const [sellerRecent, setSellerRecent] = useState<OrderSummary[]>([]);
  const [sellerHistory, setSellerHistory] = useState<OrderSummary[]>([]);
  const [buyerInProgress, setBuyerInProgress] = useState<OrderSummary[]>([]);
  const [buyerRecent, setBuyerRecent] = useState<OrderSummary[]>([]);
  const [buyerHistory, setBuyerHistory] = useState<OrderSummary[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderSummary | null>(null);
  const [draftItemPrices, setDraftItemPrices] = useState<Record<string, string>>({});
  const [salesFilter, setSalesFilter] = useState<OrderStatus | ''>('');
  const [purchasesFilter, setPurchasesFilter] = useState<OrderStatus | ''>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ── Review / rating state ──
  const [reviewModalOrder, setReviewModalOrder] = useState<{ orderId: string } | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewedOrders, setReviewedOrders] = useState<Set<string>>(new Set());

  // ── Negotiations state ──
  const [negFilter, setNegFilter] = useState<NegotiationStatus | ''>('');
  const [negList, setNegList] = useState<NegotiationSummary[]>([]);
  const [negTotal, setNegTotal] = useState(0);
  const [negPage, setNegPage] = useState(1);
  const [negLoading, setNegLoading] = useState(false);
  const [respondNeg, setRespondNeg] = useState<NegotiationSummary | null>(null);
  const [cancelNegBusyId, setCancelNegBusyId] = useState<string | null>(null);
  const [expandedBundles, setExpandedBundles] = useState<Record<string, BundleItemSummary[]>>({});
  const [bundleLoading, setBundleLoading] = useState<string | null>(null);

  const [settingsForm, setSettingsForm] = useState<SettingsForm>({
    avatarUrl: '',
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    phone: '',
    birthDate: '',
    country: '',
    countryCode: '',
    city: '',
    region: '',
    district: '',
    address1: '',
    address2: '',
    address3: '',
    formattedAddress: '',
    latitude: null,
    longitude: null,
    placeId: '',
    locationVisibility: 'CITY_PUBLIC',
    onlineStatusVisible: true,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  /* ── Articles state ── */
  const [myArticles, setMyArticles] = useState<MyListing[]>([]);
  const [articlesStats, setArticlesStats] = useState<MyListingsStats | null>(null);
  const [articlesPage, setArticlesPage] = useState(1);
  const [articlesTotalPages, setArticlesTotalPages] = useState(1);
  const [articlesFilter, setArticlesFilter] = useState<ListingStatus | ''>('');
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [articleBusy, setArticleBusy] = useState<string | null>(null);
  const [editingArticle, setEditingArticle] = useState<MyListing | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [articleForm, setArticleForm] = useState({
    type: 'PRODUIT' as 'PRODUIT' | 'SERVICE',
    title: '',
    description: '',
    category: '',
    city: '',
    country: '',
    countryCode: '',
    region: '',
    district: '',
    formattedAddress: '',
    latitude: '-4.325',
    longitude: '15.322',
    placeId: '',
    locationVisibility: 'CITY_PUBLIC' as LocationVisibility,
    serviceRadiusKm: '',
    imageUrl: '',
    priceUsdCents: '0',
    stockQuantity: '',
    serviceDurationMin: '',
    serviceLocation: '' as '' | 'DOMICILE' | 'SUR_PLACE',
  });
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);
  const [publishStep, setPublishStep] = useState<1 | 2 | 3>(1);
  const [noCategoryMatch, setNoCategoryMatch] = useState(false);
  const [showSoKinCatPopup, setShowSoKinCatPopup] = useState(false);
  const [priceCdf, setPriceCdf] = useState('');
  const [publishError, setPublishError] = useState<string | null>(null);

  /* ── Bulk import state ── */
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkTab, setBulkTab] = useState<'file' | 'db'>('file');
  const [bulkParsedRows, setBulkParsedRows] = useState<Record<string, string>[]>([]);
  const [bulkColumns, setBulkColumns] = useState<string[]>([]);
  const [bulkMapping, setBulkMapping] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkFileType, setBulkFileType] = useState<string>('');
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const [bulkDbForm, setBulkDbForm] = useState({ host: '', port: '3306', user: '', password: '', database: '', table: '' });

  // ── Contacts state ──
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<Array<{ id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null; city: string | null } }>>([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [contactFilter, setContactFilter] = useState<'all' | 'online' | 'favorites'>('all');


  // ── Public profile editing state ──
  const [ppEditingField, setPpEditingField] = useState<string | null>(null);
  const [ppBio, setPpBio] = useState('');
  const [ppDomain, setPpDomain] = useState('');
  const [ppQualification, setPpQualification] = useState('');
  const [ppExperience, setPpExperience] = useState('');
  const [ppWorkHours, setPpWorkHours] = useState('');
  const [ppDisplayName, setPpDisplayName] = useState('');
  const [ppCity, setPpCity] = useState('');
  const [ppCountry, setPpCountry] = useState('');
  const [ppLocationVisibility, setPpLocationVisibility] = useState<LocationVisibility>('CITY_PUBLIC');
  const [ppShowAddress, setPpShowAddress] = useState(true);
  const [ppShowListings, setPpShowListings] = useState(true);
  const [ppShowStats, setPpShowStats] = useState(true);
  const [ppSaving, setPpSaving] = useState(false);
  const [ppSaveMsg, setPpSaveMsg] = useState<string | null>(null);
  const [ppLoaded, setPpLoaded] = useState(false);

  useEffect(() => {
    if (!isLoggedIn || !user) {
      return;
    }

    const display = splitDisplayName(user.profile.displayName || '');

    setSettingsForm((prev) => ({
      ...prev,
      avatarUrl: user.profile.avatarUrl ?? '',
      firstName: display.firstName,
      lastName: display.lastName,
      username: user.profile.username ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
      birthDate: toDateInput(user.profile.birthDate),
      country: user.profile.country ?? '',
      city: user.profile.city ?? '',
      address1: user.profile.addressLine1 ?? '',
      onlineStatusVisible: user.preferences?.onlineStatusVisible ?? true,
    }));
  }, [isLoggedIn, user]);

  useEffect(() => {
    if (!isLoggedIn || !user) {
      return;
    }

    let cancelled = false;

    const loadSessions = async () => {
      setLoadingSessions(true);
      try {
        const data = await authApi.sessions();
        if (!cancelled) {
          setSessionsCount(data.sessions.length);
        }
      } catch {
        if (!cancelled) {
          setSessionsCount(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingSessions(false);
        }
      }
    };

    const loadPlan = async () => {
      setLoadingPlan(true);
      try {
        const data = await billing.myPlan();
        if (!cancelled) {
          setActivePlan(data);
        }
      } catch {
        if (!cancelled) {
          setActivePlan(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingPlan(false);
        }
      }
    };

    const loadTotpStatus = async () => {
      try {
        const data = await authApi.totpStatus();
        if (!cancelled) setTotpEnabled(data.totpEnabled);
      } catch { /* skip */ }
    };

    void Promise.all([loadSessions(), loadPlan(), loadTotpStatus()]);

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user]);

  /* ── Kin-Sell Analytique: fetch insights when analytics tab is opened ── */
  const hasAnalytics = useMemo(() => {
    if (!activePlan) return false;
    return activePlan.analyticsTier !== 'NONE';
  }, [activePlan]);

  const hasPremiumAnalytics = useMemo(() => {
    return activePlan?.analyticsTier === 'PREMIUM';
  }, [activePlan]);

  /* ── AI plan gating ── */
  const hasIaMarchandPlan = useMemo(() => {
    if (!activePlan) return false;
    const planIncludes = ['AUTO', 'PRO_VENDOR', 'SCALE', 'BUSINESS'].includes(activePlan.planCode);
    const addonActive = activePlan.addOns?.some((a) => a.code === 'IA_MERCHANT' && a.status === 'ACTIVE');
    return planIncludes || addonActive;
  }, [activePlan]);

  const hasIaOrderPlan = useMemo(() => {
    if (!activePlan) return false;
    const planIncludes = ['AUTO', 'PRO_VENDOR', 'SCALE'].includes(activePlan.planCode);
    const addonActive = activePlan.addOns?.some((a) => a.code === 'IA_ORDER' && a.status === 'ACTIVE');
    return planIncludes || addonActive;
  }, [activePlan]);

  /* showAi for NegotiationRespondPopup: free hints always, paid advice when toggled on */
  const showNegAi = aiAdviceEnabled;
  /* auto-negotiate only when plan allows + user toggled on */
  const autoNegoActive = hasIaMarchandPlan && aiAutoNegoEnabled;

  useEffect(() => {
    if (activeSection !== 'analytics' || !hasAnalytics || basicInsights) return;
    let cancelled = false;
    setAnalyticsLoading(true);

    const load = async () => {
      try {
        const basic = await analyticsAi.basic();
        if (!cancelled) setBasicInsights(basic);
        if (hasPremiumAnalytics) {
          const deep = await analyticsAi.deep();
          if (!cancelled) setDeepInsights(deep);
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setAnalyticsLoading(false); }
    };

    void load();
    return () => { cancelled = true; };
  }, [activeSection, hasAnalytics, hasPremiumAnalytics, basicInsights]);

  // ── Kin-Sell tab: load recommendations + trials ──
  useEffect(() => {
    if (activeSection !== 'kinsell') return;
    let cancelled = false;
    setKsLoading(true);
    const load = async () => {
      try {
        const [recs, trials] = await Promise.all([
          aiRecommendations.getActive(),
          aiTrials.getMyTrials(),
        ]);
        if (!cancelled) {
          setKsRecommendations(recs);
          setKsTrials(trials);
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setKsLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [activeSection]);

  useEffect(() => {
    if (!isLoggedIn || !user?.profile.username) {
      setPublicProfile(null);
      return;
    }

    let cancelled = false;

    const loadPublicPreview = async () => {
      setLoadingPublicProfile(true);
      try {
        const data = await usersApi.publicProfile(user.profile.username!);
        const payload = data as {
          username?: string | null;
          displayName?: string;
          city?: string | null;
          country?: string | null;
          bio?: string | null;
          domain?: string | null;
          qualification?: string | null;
          experience?: string | null;
          workHours?: string | null;
          listings?: Array<{
            id?: string;
            type?: string;
            title?: string;
            category?: string;
            city?: string;
            imageUrl?: string | null;
            createdAt?: string;
          }>;
        };

        if (!cancelled) {
          setPublicProfile({
            username: payload.username ?? user.profile.username,
            displayName: payload.displayName ?? user.profile.displayName,
            city: payload.city ?? user.profile.city,
            country: payload.country ?? user.profile.country,
            bio: payload.bio ?? null,
            domain: payload.domain ?? null,
            qualification: payload.qualification ?? null,
            experience: payload.experience ?? null,
            workHours: payload.workHours ?? null,
            listings: (payload.listings ?? []).map((item) => ({
              id: item.id ?? '',
              type: item.type ?? '',
              title: item.title ?? 'Article',
              category: item.category ?? 'N/A',
              city: item.city ?? 'N/A',
              imageUrl: item.imageUrl ?? null,
              createdAt: item.createdAt ?? new Date().toISOString()
            }))
          });
          // Initialize edit fields from loaded profile
          if (!ppLoaded) {
            setPpDisplayName(payload.displayName ?? user.profile.displayName ?? '');
            setPpCity(payload.city ?? user.profile.city ?? '');
            setPpCountry(payload.country ?? user.profile.country ?? '');
            setPpBio(payload.bio ?? '');
            setPpDomain(payload.domain ?? '');
            setPpQualification(payload.qualification ?? '');
            setPpExperience(payload.experience ?? '');
            setPpWorkHours(payload.workHours ?? '');
            setPpLoaded(true);
          }
        }
      } catch {
        if (!cancelled) {
          setPublicProfile(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingPublicProfile(false);
        }
      }
    };

    void loadPublicPreview();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user?.profile.username, user?.profile.displayName, user?.profile.city, user?.profile.country]);

  const loadCommerce = async (_sellerPage: number, _buyerPage: number) => {
    setLoadingCommerce(true);
    try {
      // 3 appels au lieu de 7 — filtrage inProgress côté client
      const [cartData, sellerData, buyerData] = await Promise.all([
        orders.buyerCart(),
        orders.sellerOrders({ page: 1, limit: 50 }),
        orders.buyerOrders({ page: 1, limit: 50 })
      ]);

      const ACTIVE: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'];

      setBuyerCart(cartData);
      setSellerInProgress(sellerData.orders.filter((o) => ACTIVE.includes(o.status)));
      setSellerRecent(sellerData.orders.slice(0, 3));
      setSellerHistory(sellerData.orders);
      setSellerHistoryTotalPages(sellerData.totalPages);
      setBuyerInProgress(buyerData.orders.filter((o) => ACTIVE.includes(o.status)));
      setBuyerRecent(buyerData.orders.slice(0, 3));
      setBuyerHistory(buyerData.orders);
      setBuyerHistoryTotalPages(buyerData.totalPages);
      setDraftItemPrices(
        Object.fromEntries((cartData.items ?? []).map((item) => [item.id, String(item.unitPriceUsdCents)]))
      );
    } catch {
      setBuyerCart(null);
      setSellerInProgress([]);
      setSellerRecent([]);
      setSellerHistory([]);
      setBuyerInProgress([]);
      setBuyerRecent([]);
      setBuyerHistory([]);
      setErrorMessage(t('user.loadOrdersError'));
    } finally {
      setLoadingCommerce(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn || !user) {
      return;
    }
    void loadCommerce(sellerHistoryPage, buyerHistoryPage);
  }, [isLoggedIn, user, sellerHistoryPage, buyerHistoryPage]);

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
      if (payload.buyerUserId !== user.id && payload.sellerUserId !== user.id) return;

      if (payload.status === 'DELIVERED' && sellerValidationQr?.orderId === payload.orderId) {
        setSellerValidationQr(null);
      }

      if (payload.status === 'DELIVERED' && buyerConfirmOrderId === payload.orderId) {
        setBuyerConfirmOrderId(null);
        setBuyerConfirmCode('');
        setBuyerConfirmMode('manual');
        setBuyerConfirmScanMessage(null);
        setBuyerConfirmScanError(null);
        if (payload.sourceUserId !== user.id) {
          setSuccessMessage(t('success.deliveryConfirmed'));
        }
      }

      void loadCommerce(sellerHistoryPage, buyerHistoryPage);

      if (selectedOrder?.id === payload.orderId) {
        void orders.detail(payload.orderId).then((detail) => setSelectedOrder(detail)).catch(() => {});
      }
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
  }, [
    isLoggedIn,
    user,
    on,
    off,
    sellerValidationQr?.orderId,
    buyerConfirmOrderId,
    selectedOrder?.id,
    sellerHistoryPage,
    buyerHistoryPage,
    t,
  ]);

  /* ── Negotiations loader ── */
  const loadNegotiations = useCallback(async (page: number, role: 'buyer' | 'seller', status: NegotiationStatus | '') => {
    setNegLoading(true);
    try {
      const params: { page: number; limit: number; status?: NegotiationStatus } = { page, limit: 20 };
      if (status) params.status = status as NegotiationStatus;
      const data = role === 'seller'
        ? await negotiationsApi.sellerList(params)
        : await negotiationsApi.buyerList(params);
      setNegList(data.negotiations);
      setNegTotal(data.total);
    } catch {
      setNegList([]);
    } finally {
      setNegLoading(false);
    }
  }, []);

  const toggleBundleExpand = useCallback(async (bundleId: string) => {
    if (expandedBundles[bundleId]) {
      setExpandedBundles((prev) => { const next = { ...prev }; delete next[bundleId]; return next; });
      return;
    }
    setBundleLoading(bundleId);
    try {
      const data = await negotiationsApi.bundleDetails(bundleId);
      setExpandedBundles((prev) => ({ ...prev, [bundleId]: data.items }));
    } catch { /* ignore */ }
    finally { setBundleLoading(null); }
  }, [expandedBundles]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }
    if (activeSection === 'sales') {
      void loadNegotiations(negPage, 'seller', negFilter);
      return;
    }
    if (activeSection === 'purchases') {
      void loadNegotiations(negPage, 'buyer', negFilter);
    }
  }, [activeSection, negPage, negFilter, isLoggedIn, loadNegotiations]);

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
    }) => {
      if (payload.buyerUserId !== user.id && payload.sellerUserId !== user.id) return;

      if (respondNeg?.id === payload.negotiationId && payload.sourceUserId !== user.id) {
        setRespondNeg(null);
      }

      const role: 'buyer' | 'seller' = activeSection === 'sales' ? 'seller' : 'buyer';
      void Promise.all([
        loadNegotiations(negPage, role, negFilter),
        loadCommerce(sellerHistoryPage, buyerHistoryPage),
      ]);
    };

    on('negotiation:updated', handleNegotiationUpdated);
    return () => {
      off('negotiation:updated', handleNegotiationUpdated);
    };
  }, [
    isLoggedIn,
    user,
    on,
    off,
    activeSection,
    negPage,
    negFilter,
    sellerHistoryPage,
    buyerHistoryPage,
    respondNeg?.id,
    loadNegotiations,
  ]);

  const handleCancelNegotiation = async (negotiationId: string) => {
    if (cancelNegBusyId) {
      return;
    }
    setCancelNegBusyId(negotiationId);
    setErrorMessage(null);
    try {
      await negotiationsApi.cancel(negotiationId);
      const role = activeSection === 'sales' ? 'seller' : 'buyer';
      await Promise.all([
        loadNegotiations(negPage, role, negFilter),
        loadCommerce(sellerHistoryPage, buyerHistoryPage)
      ]);
    } catch {
      setErrorMessage(t('user.cancelNegError'));
    } finally {
      setCancelNegBusyId(null);
    }
  };

  /* ── Articles loader ── */
  const refreshArticles = useCallback(async (page: number, statusFilter: ListingStatus | '') => {
    setLoadingArticles(true);
    try {
      const params: Record<string, string | number | undefined> = { page, limit: 12 };
      if (statusFilter) params.status = statusFilter;
      const [listData, statsData] = await Promise.all([
        listingsApi.mine(params as { status?: ListingStatus; page?: number; limit?: number }),
        listingsApi.mineStats(),
      ]);
      setMyArticles(listData.listings);
      setArticlesTotalPages(listData.totalPages);
      setArticlesStats(statsData);
    } catch {
      setMyArticles([]);
      setArticlesStats(null);
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    void refreshArticles(articlesPage, articlesFilter);
  }, [isLoggedIn, user, articlesPage, articlesFilter, refreshArticles]);

  /* ── Articles handlers ── */
  const resetArticleForm = () => {
    setArticleForm({
      type: 'PRODUIT', title: '', description: '', category: '', city: '',
      country: '', countryCode: '', region: '', district: '', formattedAddress: '', placeId: '',
      locationVisibility: 'CITY_PUBLIC', serviceRadiusKm: '',
      latitude: '-4.325', longitude: '15.322', imageUrl: '', priceUsdCents: '0', stockQuantity: '',
      serviceDurationMin: '', serviceLocation: '',
    });
    setEditingArticle(null);
    setShowCreateForm(false);
    setUploadFiles([]);
    setUploadPreviews((prev) => { prev.forEach(u => URL.revokeObjectURL(u)); return []; });
    setPublishStep(1);
    setNoCategoryMatch(false);
    setShowSoKinCatPopup(false);
    setPriceCdf('');
    setPublishError(null);
  };

  /* ── Bulk import helpers ── */
  const BULK_TARGET_FIELDS = [
    { key: '', label: '— ignorer —' },
    { key: 'title', label: 'Titre' },
    { key: 'description', label: 'Description' },
    { key: 'category', label: 'Catégorie' },
    { key: 'city', label: 'Ville' },
    { key: 'type', label: 'Type (PRODUIT/SERVICE)' },
    { key: 'price', label: 'Prix (USD cents)' },
    { key: 'stock', label: 'Stock' },
    { key: 'imageUrl', label: 'URL image' },
  ];

  const parseCSV = (text: string): { columns: string[]; rows: Record<string, string>[] } => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { columns: [], rows: [] };
    const sep = lines[0].includes(';') ? ';' : ',';
    const columns = lines[0].split(sep).map(c => c.replace(/^"|"$/g, '').trim());
    const rows = lines.slice(1, 51).map(line => {
      const vals = line.split(sep).map(v => v.replace(/^"|"$/g, '').trim());
      const row: Record<string, string> = {};
      columns.forEach((col, i) => { row[col] = vals[i] ?? ''; });
      return row;
    });
    return { columns, rows };
  };

  const parseJSONFile = (text: string): { columns: string[]; rows: Record<string, string>[] } => {
    const data = JSON.parse(text);
    const arr: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : Array.isArray(data.data) ? data.data
      : Array.isArray(data.items) ? data.items
      : Array.isArray(data.products) ? data.products
      : Array.isArray(data.articles) ? data.articles
      : [];
    const sliced = arr.slice(0, 50);
    if (sliced.length === 0) return { columns: [], rows: [] };
    const columns = Object.keys(sliced[0]);
    const rows = sliced.map(item => {
      const row: Record<string, string> = {};
      columns.forEach(col => { row[col] = String(item[col] ?? ''); });
      return row;
    });
    return { columns, rows };
  };

  const parseXML = (text: string): { columns: string[]; rows: Record<string, string>[] } => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'application/xml');
    const root = doc.documentElement;
    if (!root || root.querySelector('parsererror')) return { columns: [], rows: [] };
    const items = Array.from(root.children).slice(0, 50);
    if (items.length === 0) return { columns: [], rows: [] };
    const columns = Array.from(new Set(items.flatMap(el => Array.from(el.children).map(c => c.tagName))));
    const rows = items.map(el => {
      const row: Record<string, string> = {};
      columns.forEach(col => { row[col] = el.querySelector(col)?.textContent?.trim() ?? ''; });
      return row;
    });
    return { columns, rows };
  };

  const autoDetectMapping = (cols: string[]): Record<string, string> => {
    const m: Record<string, string> = {};
    const find = (patterns: string[]) => cols.find(c => patterns.some(p => c.toLowerCase().includes(p)));
    const titleCol = find(['title', 'titre', 'nom', 'name', 'produit', 'article']);
    if (titleCol) m[titleCol] = 'title';
    const descCol = find(['description', 'desc', 'détail', 'detail', 'contenu']);
    if (descCol) m[descCol] = 'description';
    const catCol = find(['categor', 'catégorie', 'type_prod', 'rayon']);
    if (catCol) m[catCol] = 'category';
    const cityCol = find(['city', 'ville', 'localité', 'location']);
    if (cityCol) m[cityCol] = 'city';
    const typeCol = find(['type', 'kind']);
    if (typeCol && typeCol !== titleCol && typeCol !== catCol) m[typeCol] = 'type';
    const priceCol = find(['price', 'prix', 'cout', 'coût', 'amount', 'montant']);
    if (priceCol) m[priceCol] = 'price';
    const stockCol = find(['stock', 'quantité', 'quantity', 'qty']);
    if (stockCol) m[stockCol] = 'stock';
    const imgCol = find(['image', 'img', 'photo', 'imageurl', 'image_url', 'media']);
    if (imgCol) m[imgCol] = 'imageUrl';
    return m;
  };

  const handleBulkFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBulkError(null); setBulkResult(null); setBulkParsedRows([]); setBulkColumns([]);
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['csv', 'json', 'xml'].includes(ext)) {
      setBulkError('Format non supporté. Utilisez CSV, JSON ou XML.');
      return;
    }
    setBulkFileType(ext);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = ext === 'csv' ? parseCSV(text) : ext === 'json' ? parseJSONFile(text) : parseXML(text);
        if (parsed.rows.length === 0) { setBulkError('Aucune donnée trouvée dans le fichier.'); return; }
        setBulkColumns(parsed.columns);
        setBulkParsedRows(parsed.rows);
        setBulkMapping(autoDetectMapping(parsed.columns));
      } catch (err) {
        setBulkError('Erreur de lecture du fichier : ' + (err instanceof Error ? err.message : 'format invalide'));
      }
    };
    reader.readAsText(file);
  };

  const handleBulkDbPreview = async () => {
    setBulkError(null); setBulkResult(null); setBulkParsedRows([]); setBulkColumns([]); setBulkBusy(true);
    try {
      const config: DbPreviewConfig = {
        host: bulkDbForm.host, port: Number(bulkDbForm.port) || 3306,
        user: bulkDbForm.user, password: bulkDbForm.password,
        database: bulkDbForm.database, table: bulkDbForm.table,
      };
      const preview = await listingsApi.dbPreview(config);
      if (preview.rows.length === 0) { setBulkError('La table est vide.'); setBulkBusy(false); return; }
      const cols = preview.columns;
      const rows = preview.rows.map(r => {
        const row: Record<string, string> = {};
        cols.forEach(c => { row[c] = String(r[c] ?? ''); });
        return row;
      });
      setBulkColumns(cols);
      setBulkParsedRows(rows);
      setBulkMapping(autoDetectMapping(cols));
    } catch (err) {
      setBulkError(err instanceof ApiError ? (err.data as any)?.error ?? err.message : err instanceof Error ? err.message : 'Erreur de connexion');
    } finally { setBulkBusy(false); }
  };

  const handleBulkConfirm = async () => {
    setBulkError(null); setBulkResult(null); setBulkBusy(true);
    try {
      // Build reverse mapping: targetField → sourceColumn
      const reverseMap: Record<string, string> = {};
      for (const [srcCol, targetField] of Object.entries(bulkMapping)) {
        if (targetField) reverseMap[targetField] = srcCol;
      }
      if (!reverseMap['title']) { setBulkError("Vous devez mapper au moins le champ « Titre »."); setBulkBusy(false); return; }

      const items: BulkImportItemInput[] = bulkParsedRows.map(row => {
        const rawType = reverseMap['type'] ? row[reverseMap['type']]?.toUpperCase() : '';
        const type = (rawType === 'SERVICE' ? 'SERVICE' : 'PRODUIT') as 'PRODUIT' | 'SERVICE';
        const rawPrice = reverseMap['price'] ? Number(row[reverseMap['price']]) : 0;
        return {
          type,
          title: (reverseMap['title'] ? row[reverseMap['title']] : '') ?? '',
          description: reverseMap['description'] ? row[reverseMap['description']] || undefined : undefined,
          category: (reverseMap['category'] ? row[reverseMap['category']] : '') || 'Non classé',
          city: (reverseMap['city'] ? row[reverseMap['city']] : '') || settingsForm.city || 'Kinshasa',
          latitude: -4.325,
          longitude: 15.322,
          imageUrl: reverseMap['imageUrl'] ? row[reverseMap['imageUrl']] || undefined : undefined,
          priceUsdCents: isNaN(rawPrice) ? 0 : Math.round(Math.abs(rawPrice)),
          stockQuantity: type === 'PRODUIT' && reverseMap['stock'] ? (Number(row[reverseMap['stock']]) || null) : null,
        };
      });

      const result = await listingsApi.bulkImport(items);
      setBulkResult(result);
      if (result.created > 0) {
        setSuccessMessage(`${result.created} article(s) importé(s) avec succès !`);
        await refreshArticles(1, articlesFilter);
        setArticlesPage(1);
      }
    } catch (err) {
      setBulkError(err instanceof ApiError ? (err.data as any)?.error ?? err.message : err instanceof Error ? err.message : 'Erreur lors de l\'import');
    } finally { setBulkBusy(false); }
  };

  const resetBulkImport = () => {
    setShowBulkImport(false); setBulkTab('file'); setBulkParsedRows([]); setBulkColumns([]);
    setBulkMapping({}); setBulkBusy(false); setBulkResult(null); setBulkError(null);
    setBulkFileType(''); setBulkDbForm({ host: '', port: '3306', user: '', password: '', database: '', table: '' });
    if (bulkFileRef.current) bulkFileRef.current.value = '';
  };

  const handleArticleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setPublishError(null);
    setArticleBusy('create');
    try {
      // Compression + encodage base64 directement dans le payload
      let mediaUrls: string[] = [];
      if (uploadFiles.length > 0) {
        mediaUrls = await prepareMediaUrls(uploadFiles);
      }
      await listingsApi.create({
        type: articleForm.type,
        title: articleForm.title.trim(),
        description: articleForm.description.trim() || undefined,
        category: articleForm.category.trim() || t('user.uncategorized'),
        city: articleForm.city.trim(),
        country: articleForm.country.trim() || undefined,
        countryCode: articleForm.countryCode || undefined,
        region: articleForm.region.trim() || undefined,
        district: articleForm.district.trim() || undefined,
        formattedAddress: articleForm.formattedAddress.trim() || undefined,
        latitude: Number(articleForm.latitude),
        longitude: Number(articleForm.longitude),
        placeId: articleForm.placeId || undefined,
        locationVisibility: articleForm.locationVisibility,
        serviceRadiusKm: articleForm.serviceRadiusKm ? Number(articleForm.serviceRadiusKm) : undefined,
        imageUrl: mediaUrls[0] || undefined,
        mediaUrls,
        priceUsdCents: Number(articleForm.priceUsdCents) || 0,
        stockQuantity: articleForm.stockQuantity !== '' ? Number(articleForm.stockQuantity) : null,
        serviceDurationMin: articleForm.type === 'SERVICE' && articleForm.serviceDurationMin !== '' ? Number(articleForm.serviceDurationMin) : null,
        serviceLocation: articleForm.type === 'SERVICE' && articleForm.serviceLocation !== '' ? articleForm.serviceLocation : null,
      });
      setSuccessMessage(t('user.articleCreated'));
      resetArticleForm();
      await refreshArticles(1, articlesFilter);
      setArticlesPage(1);
    } catch (err) {
      let msg = t('error.createListing');
      if (err instanceof ApiError) {
        if (typeof err.data === 'object' && err.data) {
          const d = err.data as { error?: string; details?: Array<{ path: string; message: string }> };
          if (d.details?.length) {
            msg = d.details.map(det => `${det.path}: ${det.message}`).join(' · ');
          } else if (d.error) {
            msg = d.error;
          } else {
            msg = `${t('user.serverError')} (${err.status})`;
          }
        } else {
          msg = err.message || `${t('user.serverError')} (${err.status})`;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setPublishError(msg);
    } finally {
      setArticleBusy(null);
    }
  };

  const handleArticleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingArticle) return;
    setErrorMessage(null);
    setArticleBusy(editingArticle.id);
    try {
      // Compression + encodage base64 directement dans le payload
      let mediaUrls: string[] | undefined;
      if (uploadFiles.length > 0) {
        mediaUrls = await prepareMediaUrls(uploadFiles);
      }
      await listingsApi.update(editingArticle.id, {
        title: articleForm.title.trim(),
        description: articleForm.description.trim() || undefined,
        category: articleForm.category.trim() || t('user.uncategorized'),
        city: articleForm.city.trim(),
        latitude: Number(articleForm.latitude),
        longitude: Number(articleForm.longitude),
        imageUrl: mediaUrls?.[0] || articleForm.imageUrl.trim() || undefined,
        ...(mediaUrls && { mediaUrls }),
        priceUsdCents: Number(articleForm.priceUsdCents) || 0,
        stockQuantity: articleForm.stockQuantity !== '' ? Number(articleForm.stockQuantity) : null,
        serviceDurationMin: articleForm.type === 'SERVICE' && articleForm.serviceDurationMin !== '' ? Number(articleForm.serviceDurationMin) : null,
        serviceLocation: articleForm.type === 'SERVICE' && articleForm.serviceLocation !== '' ? articleForm.serviceLocation : null,
      });
      setSuccessMessage(t('user.modified'));
      resetArticleForm();
      await refreshArticles(articlesPage, articlesFilter);
    } catch (err) {
      let msg = t('user.modifyError');
      if (err instanceof ApiError) {
        if (typeof err.data === 'object' && err.data) {
          const d = err.data as { error?: string; details?: Array<{ path: string; message: string }> };
          if (d.details?.length) {
            msg = d.details.map(det => `${det.path}: ${det.message}`).join(' · ');
          } else if (d.error) {
            msg = d.error;
          } else {
            msg = `${t('user.serverError')} (${err.status})`;
          }
        } else {
          msg = err.message || `${t('user.serverError')} (${err.status})`;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setPublishError(msg);
    } finally {
      setArticleBusy(null);
    }
  };

  const handleArticleStatusChange = async (id: string, status: ListingStatus) => {
    setArticleBusy(id);
    setErrorMessage(null);
    try {
      await listingsApi.changeStatus(id, status);
      setSuccessMessage(`Article ${status === 'ACTIVE' ? t('user.statusActivated') : status === 'INACTIVE' ? t('user.statusDeactivated') : status === 'ARCHIVED' ? t('user.statusArchived') : t('user.statusDeleted')}.`);
      await refreshArticles(articlesPage, articlesFilter);
    } catch {
      setErrorMessage(t('error.statusChange'));
    } finally {
      setArticleBusy(null);
    }
  };

  const handleStockUpdate = async (id: string, stock: string) => {
    setArticleBusy(id);
    try {
      await listingsApi.updateStock(id, stock !== '' ? Number(stock) : null);
      await refreshArticles(articlesPage, articlesFilter);
    } catch {
      setErrorMessage(t('error.stockUpdate'));
    } finally {
      setArticleBusy(null);
    }
  };

  const openEditForm = (article: MyListing) => {
    setEditingArticle(article);
    setShowCreateForm(true);
    setPublishStep(1);
    setUploadFiles([]);
    setUploadPreviews([]);
    setArticleForm({
      type: article.type as 'PRODUIT' | 'SERVICE',
      title: article.title,
      description: article.description ?? '',
      category: article.category,
      city: article.city,
      country: (article as any).country ?? '',
      countryCode: (article as any).countryCode ?? '',
      region: (article as any).region ?? '',
      district: (article as any).district ?? '',
      formattedAddress: (article as any).formattedAddress ?? '',
      placeId: (article as any).placeId ?? '',
      locationVisibility: (article as any).locationVisibility ?? 'CITY_PUBLIC',
      serviceRadiusKm: (article as any).serviceRadiusKm?.toString() ?? '',
      latitude: String(article.latitude),
      longitude: String(article.longitude),
      imageUrl: article.imageUrl ?? '',
      priceUsdCents: String(article.priceUsdCents),
      stockQuantity: article.stockQuantity !== null ? String(article.stockQuantity) : '',
      serviceDurationMin: article.serviceDurationMin !== null ? String(article.serviceDurationMin) : '',
      serviceLocation: (article.serviceLocation as '' | 'DOMICILE' | 'SUR_PLACE') ?? '',
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const images = selected.filter(f => f.type.startsWith('image/'));
    const videos = selected.filter(f => f.type.startsWith('video/'));
    const existingImages = uploadFiles.filter(f => f.type.startsWith('image/'));
    const existingVideos = uploadFiles.filter(f => f.type.startsWith('video/'));

    if (existingImages.length + images.length > 5) {
      setPublishError(t('user.maxPhotosError'));
      return;
    }
    if (existingVideos.length + videos.length > 1) {
      setPublishError(t('user.maxVideoError'));
      return;
    }

    const MAX_VID = 50 * 1024 * 1024;
    for (const f of videos) {
      if (f.size > MAX_VID) {
        setPublishError(`${t('user.videoTooBigError')} (${f.name})`);
        return;
      }
    }

    setPublishError(null);
    const newFiles = [...uploadFiles, ...selected];
    setUploadFiles(newFiles);
    const newPreviews = selected.map(f => URL.createObjectURL(f));
    setUploadPreviews(prev => [...prev, ...newPreviews]);
    e.target.value = '';
  };

  const removeUploadFile = (index: number) => {
    URL.revokeObjectURL(uploadPreviews[index]);
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
    setUploadPreviews(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (!buyerConfirmOrderId || buyerConfirmMode !== 'scan') {
      return;
    }

    let scanner: any = null;
    let cancelled = false;

    setBuyerConfirmScanError(null);
    setBuyerConfirmScanMessage(null);

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) {
          return;
        }

        scanner = new Html5Qrcode('ks-order-validation-reader', { verbose: false });
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
          (decodedText: string) => {
            const scannedCode = extractValidationCodeFromQrPayload(decodedText, buyerConfirmOrderId);
            if (!scannedCode) {
              setBuyerConfirmScanError(t('user.validationQrInvalid'));
              return;
            }

            setBuyerConfirmCode(scannedCode);
            setBuyerConfirmMode('manual');
            setBuyerConfirmScanMessage(t('user.validationScanDetected'));
            setBuyerConfirmScanError(null);
          },
          () => {}
        );

        if (!cancelled) {
          setBuyerConfirmScanMessage(t('user.validationScanReady'));
        }
      } catch {
        if (!cancelled) {
          setBuyerConfirmScanError(t('user.validationScanError'));
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      if (scanner) {
        void scanner.stop().catch(() => {}).finally(() => {
          scanner?.clear();
        });
      }
    };
  }, [buyerConfirmMode, buyerConfirmOrderId, t]);

  if (isLoading) {
    return (
      <div className="ud-shell">
        <main className="ud-main">
          <div className="ud-page-header">
            <div>
              <h1 className="ud-page-title">{t('user.privateSpace')}</h1>
              <p className="ud-page-sub">{t('user.loadingHub')}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!isLoggedIn || !user) {
    return <Navigate to="/login" replace />;
  }

  // ── Rediriger les autres rôles vers leur espace dédié ──
  if (user.role !== 'USER') {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  const displayName = user.profile.displayName || user.profile.username || user.email || 'Utilisateur Kin-Sell';
  const pseudo = user.profile.username ? `@${user.profile.username}` : '@profil-incomplet';
  const shortId = `#KS-${user.id.slice(0, 6).toUpperCase()}`;
  const listings = publicProfile?.listings ?? [];

  const alerts: string[] = [];
  if (!user.profileCompleted) alerts.push(t('user.profileIncomplete'));
  if (!user.emailVerified) alerts.push(t('user.emailNotVerified'));
  if (!user.phoneVerified) alerts.push(t('user.phoneNotVerified'));

  const overviewMetrics = [
    { label: t('user.publicProfile'), value: user.profileCompleted ? t('user.profileComplete') : t('user.profileNotComplete') },
    { label: t('user.publishedArticles'), value: listings.length },
    { label: t('user.activeSessions'), value: loadingSessions ? t('common.loading') : (sessionsCount ?? '—') },
    { label: t('user.plans'), value: loadingPlan ? t('common.loading') : (activePlan?.planName ?? 'FREE') },
    { label: t('user.type'), value: t(ROLE_LABEL_KEY[user.role] ?? 'user.userRole') },
  ];

  const handleLogout = async () => {
    if (logoutBusy) {
      return;
    }

    setLogoutBusy(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setLogoutBusy(false);
    }
  };

  const handleRefresh = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await refreshUser();
      const [sessionData, planData] = await Promise.all([authApi.sessions(), billing.myPlan()]);
      setSessionsCount(sessionData.sessions.length);
      setActivePlan(planData);
      await loadCommerce(sellerHistoryPage, buyerHistoryPage);
      setSuccessMessage(t('user.dataRefreshed'));
    } catch {
      setErrorMessage(t('user.dataRefreshError'));
    }
  };

  // ── TOTP handlers ──
  const handleTotpSetup = async () => {
    setTotpBusy(true);
    setTotpMessage(null);
    try {
      const res = await authApi.totpSetup();
      const QRCode = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(res.uri, { width: 200, margin: 1, color: { dark: '#ffffff', light: '#0d0720' } });
      setTotpQrDataUrl(dataUrl);
      setTotpSetupUri(res.uri);
      setTotpSetupSecret(res.secret);
      setTotpStep('setup');
    } catch (err) {
      setTotpMessage({ type: 'err', text: err instanceof Error ? err.message : t('user.totpSetupError') });
    } finally {
      setTotpBusy(false);
    }
  };

  const handleTotpEnable = async () => {
    if (totpSetupCode.length !== 6) { setTotpMessage({ type: 'err', text: t('user.totpCodeHint') }); return; }
    setTotpBusy(true);
    setTotpMessage(null);
    try {
      await authApi.totpEnable(totpSetupCode);
      setTotpEnabled(true);
      setTotpStep('idle');
      setTotpSetupUri(null);
      setTotpSetupSecret(null);
      setTotpQrDataUrl(null);
      setTotpSetupCode('');
      setTotpMessage({ type: 'ok', text: `✅ ${t('user.totpEnabledMsg')}` });
    } catch (err) {
      setTotpMessage({ type: 'err', text: err instanceof Error ? err.message : 'Code invalide.' });
    } finally {
      setTotpBusy(false);
    }
  };

  const handleTotpDisable = async () => {
    if (!totpDisablePassword) { setTotpMessage({ type: 'err', text: 'Mot de passe requis.' }); return; }
    setTotpBusy(true);
    setTotpMessage(null);
    try {
      await authApi.totpDisable(totpDisablePassword);
      setTotpEnabled(false);
      setTotpStep('idle');
      setTotpDisablePassword('');
      setTotpMessage({ type: 'ok', text: `🔓 ${t('user.totpDisabledMsg')}` });
    } catch (err) {
      setTotpMessage({ type: 'err', text: err instanceof Error ? err.message : 'Mot de passe incorrect.' });
    } finally {
      setTotpBusy(false);
    }
  };

  // ── Email verification handlers ──
  const handleSendEmailVerification = async () => {
    if (!user?.email) { setEmailVerifMsg({ type: 'err', text: 'Aucun email sur ce compte.' }); return; }
    setEmailVerifBusy(true);
    setEmailVerifMsg(null);
    try {
      const res = await authApi.requestEmailVerification(user.email);
      setEmailVerifId(res.verificationId);
      setEmailVerifStep('sent');
      if (res.previewCode) setEmailVerifDevCode(res.previewCode);
      setEmailVerifMsg({ type: 'ok', text: 'Code envoyé ! Vérifiez votre boîte mail.' });
    } catch (err) {
      setEmailVerifMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erreur lors de l\'envoi.' });
    } finally {
      setEmailVerifBusy(false);
    }
  };

  const handleConfirmEmailVerification = async () => {
    if (emailVerifCode.length !== 6) { setEmailVerifMsg({ type: 'err', text: 'Le code doit contenir 6 chiffres.' }); return; }
    setEmailVerifBusy(true);
    setEmailVerifMsg(null);
    try {
      await authApi.confirmEmailVerification({ verificationId: emailVerifId, code: emailVerifCode });
      setEmailVerifStep('done');
      setEmailVerifMsg({ type: 'ok', text: '✅ Email vérifié avec succès !' });
      await refreshUser();
    } catch (err) {
      setEmailVerifMsg({ type: 'err', text: err instanceof Error ? err.message : 'Code invalide.' });
    } finally {
      setEmailVerifBusy(false);
    }
  };

  const handleSaveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setSavingSettings(true);

    const display = [settingsForm.firstName.trim(), settingsForm.lastName.trim()].filter(Boolean).join(' ');

    try {
      let finalAvatarUrl = settingsForm.avatarUrl.trim() || undefined;
      if (avatarFile) {
        const encoded = await compressAndEncodeMedia([avatarFile]);
        if (encoded[0]) {
          finalAvatarUrl = encoded[0];
        }
      }

      await authApi.completeProfile({
        avatarUrl: finalAvatarUrl,
        displayName: display || undefined,
        username: settingsForm.username.trim() || undefined,
        email: settingsForm.email.trim() || undefined,
        phone: settingsForm.phone.trim() || undefined,
        birthDate: settingsForm.birthDate || undefined,
        country: settingsForm.country.trim() || undefined,
        countryCode: settingsForm.countryCode || undefined,
        city: settingsForm.city.trim() || undefined,
        region: settingsForm.region.trim() || undefined,
        district: settingsForm.district.trim() || undefined,
        addressLine1: settingsForm.address1.trim() || undefined,
        formattedAddress: settingsForm.formattedAddress.trim() || undefined,
        latitude: settingsForm.latitude ?? undefined,
        longitude: settingsForm.longitude ?? undefined,
        placeId: settingsForm.placeId || undefined,
        locationVisibility: settingsForm.locationVisibility,
        onlineStatusVisible: settingsForm.onlineStatusVisible,
      });
      await refreshUser();
      setAvatarFile(null);
      if (avatarPreview) { URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); }
      setSuccessMessage(t('user.settingsSaved'));
    } catch (error) {
      if (error instanceof ApiError && error.data && typeof error.data === 'object' && 'error' in error.data) {
        const message = (error.data as { error?: string }).error;
        setErrorMessage(message ?? t('user.settingsSaveError'));
      } else {
        setErrorMessage(t('user.settingsSaveError'));
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCartQuantity = async (itemId: string, nextQuantity: number) => {
    if (nextQuantity < 1) {
      return;
    }

    setCartBusy(true);
    setErrorMessage(null);
    try {
      const cart = await orders.updateCartItem(itemId, { quantity: nextQuantity });
      setBuyerCart(cart);
      setDraftItemPrices((prev) => ({
        ...prev,
        [itemId]: String(cart.items.find((item) => item.id === itemId)?.unitPriceUsdCents ?? 0)
      }));
    } catch {
      setErrorMessage(t('user.cartUpdateError'));
    } finally {
      setCartBusy(false);
    }
  };

  const handleCartPriceSave = async (itemId: string) => {
    const raw = draftItemPrices[itemId] ?? '0';
    const parsed = Number.parseInt(raw, 10);
    const unitPriceUsdCents = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

    setCartBusy(true);
    setErrorMessage(null);
    try {
      const cart = await orders.updateCartItem(itemId, { unitPriceUsdCents });
      setBuyerCart(cart);
      setDraftItemPrices((prev) => ({ ...prev, [itemId]: String(unitPriceUsdCents) }));
    } catch {
      setErrorMessage(t('user.priceSaveError'));
    } finally {
      setCartBusy(false);
    }
  };

  const handleCartRemove = async (itemId: string) => {
    setCartBusy(true);
    setErrorMessage(null);
    try {
      const cart = await orders.removeCartItem(itemId);
      setBuyerCart(cart);
      setDraftItemPrices((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch {
      setErrorMessage(t('user.cartRemoveError'));
    } finally {
      setCartBusy(false);
    }
  };

  const handleCheckout = async (notes?: string) => {
    setCheckoutBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await orders.checkoutBuyerCart(notes ? { notes } : undefined);
      setSuccessMessage(`${result.orders.length} ${t('user.ordersCreated')}`);
      setCheckoutModalOpen(false);
      setCheckoutForm({
        deliveryAddress: '',
        serviceMaintenanceAddress: '',
        serviceExecutionAddress: '',
        paymentMethod: 'MPESA',
        additionalNote: ''
      });
      await loadCommerce(sellerHistoryPage, buyerHistoryPage);
    } catch (error) {
      if (error instanceof ApiError && error.data && typeof error.data === 'object' && 'error' in error.data) {
        const message = (error.data as { error?: string }).error;
        setErrorMessage(message ?? t('user.checkoutError'));
      } else {
        setErrorMessage(t('user.checkoutError'));
      }
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleOpenCheckoutModal = () => {
    if (!buyerCart || buyerCart.items.length === 0) {
      return;
    }
    const hasNegotiatingItems = buyerCart.items.some((item) => item.itemState === 'MARCHANDAGE');
    if (hasNegotiatingItems) {
      setErrorMessage(t('user.negValidationError'));
      return;
    }
    setCheckoutModalOpen(true);
  };

  const handleSubmitCheckoutModal = async () => {
    if (!buyerCart || buyerCart.items.length === 0) {
      return;
    }

    const hasProductItems = buyerCart.items.some((item) => item.listing.type === 'PRODUIT');
    const hasServiceItems = buyerCart.items.some((item) => item.listing.type === 'SERVICE');

    if (hasProductItems && !checkoutForm.deliveryAddress.trim()) {
      setErrorMessage(t('user.deliveryAddrRequired'));
      return;
    }
    if (hasServiceItems && !checkoutForm.serviceMaintenanceAddress.trim()) {
      setErrorMessage(t('user.maintenanceAddrRequired'));
      return;
    }
    if (hasServiceItems && !checkoutForm.serviceExecutionAddress.trim()) {
      setErrorMessage(t('user.executionAddrRequired'));
      return;
    }

    const notesPayload = [
      'CHECKOUT_CONTEXT_V1',
      `payment=${checkoutForm.paymentMethod}`,
      `deliveryAddress=${checkoutForm.deliveryAddress.trim() || '-'}`,
      `serviceMaintenanceAddress=${checkoutForm.serviceMaintenanceAddress.trim() || '-'}`,
      `serviceExecutionAddress=${checkoutForm.serviceExecutionAddress.trim() || '-'}`,
      `buyerNote=${checkoutForm.additionalNote.trim() || '-'}`,
    ].join(' | ');

    await handleCheckout(notesPayload);
  };

  const handleSubmitOrderReview = async () => {
    if (!reviewModalOrder || reviewBusy) return;
    setReviewBusy(true);
    setErrorMessage(null);
    try {
      await reviewsApi.createForOrder({
        orderId: reviewModalOrder.orderId,
        rating: reviewRating,
        text: reviewText.trim() || undefined,
      });
      setReviewedOrders(prev => new Set(prev).add(reviewModalOrder.orderId));
      setSuccessMessage('✓ Merci pour votre avis !');
      setReviewModalOrder(null);
      setReviewRating(5);
      setReviewText('');
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.message : 'Erreur lors de l\'envoi de l\'avis.');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleOrderDetail = async (orderId: string) => {
    setErrorMessage(null);
    try {
      const detail = await orders.detail(orderId);
      setSelectedOrder(detail);
    } catch {
      setErrorMessage(t('user.orderDetailError'));
    }
  };

  const handleSellerStatus = async (orderId: string, status: OrderStatus) => {
    setOrderStatusBusyId(orderId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await orders.updateSellerOrderStatus(orderId, { status });
      setSuccessMessage(`${t('user.statusOrderUpdated')}: ${statusLabel(status)}.`);
      await loadCommerce(sellerHistoryPage, buyerHistoryPage);
      if (selectedOrder?.id === orderId) {
        const detail = await orders.detail(orderId);
        setSelectedOrder(detail);
      }
    } catch (error) {
      if (error instanceof ApiError && error.data && typeof error.data === 'object' && 'error' in error.data) {
        const message = (error.data as { error?: string }).error;
        setErrorMessage(message ?? t('user.statusChangeError'));
      } else {
        setErrorMessage(t('user.statusChangeError'));
      }
    } finally {
      setOrderStatusBusyId(null);
    }
  };

  const handleRevealCode = async (orderId: string) => {
    setValidationCodeBusyId(orderId);
    setErrorMessage(null);
    try {
      const data = await orders.getValidationCode(orderId);
      setSellerValidationQr({ orderId, code: data.validationCode });
    } catch {
      setErrorMessage(t('user.validationCodeError'));
    } finally {
      setValidationCodeBusyId(null);
    }
  };

  const handleBuyerConfirm = async () => {
    if (!buyerConfirmOrderId || !buyerConfirmCode.trim()) return;
    setBuyerConfirmBusy(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await orders.buyerConfirmDelivery(buyerConfirmOrderId, { code: buyerConfirmCode.trim() });
      setSuccessMessage(t('success.deliveryConfirmed'));
      setBuyerConfirmOrderId(null);
      setBuyerConfirmCode('');
      setBuyerConfirmMode('manual');
      setBuyerConfirmScanMessage(null);
      setBuyerConfirmScanError(null);
      await loadCommerce(sellerHistoryPage, buyerHistoryPage);
    } catch (error) {
      if (error instanceof ApiError && error.data && typeof error.data === 'object' && 'error' in error.data) {
        const message = (error.data as { error?: string }).error;
        setErrorMessage(message ?? t('user.invalidCode'));
      } else {
        setErrorMessage(t('user.invalidCode'));
      }
    } finally {
      setBuyerConfirmBusy(false);
    }
  };

  /* ── Computed: all seller / buyer orders + filtered ── */
  const allSellerOrders = [...sellerInProgress, ...sellerRecent, ...sellerHistory]
    .filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i);
  const allBuyerOrders = [...buyerInProgress, ...buyerRecent, ...buyerHistory]
    .filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i);

  const filteredSellerOrders = salesFilter
    ? allSellerOrders.filter((o) => o.status === salesFilter)
    : allSellerOrders;
  const filteredBuyerOrders = purchasesFilter
    ? allBuyerOrders.filter((o) => o.status === purchasesFilter)
    : allBuyerOrders;

  const sellerStats = {
    total: allSellerOrders.length,
    inProgress: sellerInProgress.length,
    delivered: allSellerOrders.filter((o) => o.status === 'DELIVERED').length,
    canceled: allSellerOrders.filter((o) => o.status === 'CANCELED').length,
  };
  const buyerStats = {
    total: allBuyerOrders.length,
    inProgress: buyerInProgress.length,
    delivered: allBuyerOrders.filter((o) => o.status === 'DELIVERED').length,
    canceled: allBuyerOrders.filter((o) => o.status === 'CANCELED').length,
  };
  const hasNegotiatingItems = buyerCart?.items.some((item) => item.itemState === 'MARCHANDAGE') ?? false;
  const hasProductItems = buyerCart?.items.some((item) => item.listing.type === 'PRODUIT') ?? false;
  const hasServiceItems = buyerCart?.items.some((item) => item.listing.type === 'SERVICE') ?? false;

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch {
      setErrorMessage("Impossible d'activer le plein ecran sur cet appareil.");
    }
  };

  return (
    <div className={`ud-shell${sidebarCollapsed ? ' ud-sidebar-collapsed' : ''}`}>
      {/* ── Mobile Header ── */}
      <header className="dash-mobile-header">
        <button className="dash-mob-hamburger" onClick={() => setMobileSidebarOpen(o => !o)} aria-label="Menu">☰</button>
        <Link to="/" className="dash-mob-logo">
          <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span>Kin-Sell</span>
        </Link>
        <button className="dash-mob-search" onClick={() => void handleToggleFullscreen()} aria-label="Plein ecran">⛶</button>
      </header>

      {/* ── Overlay mobile ── */}
      {mobileSidebarOpen && <div className="dash-mob-overlay" onClick={() => setMobileSidebarOpen(false)} />}

      <aside className={`ud-sidebar${mobileSidebarOpen ? ' ud-sidebar-open' : ''}`}>
        <button
          type="button"
          className="ud-collapse-btn"
          onClick={() => setSidebarCollapsed((value) => !value)}
          aria-label={sidebarCollapsed ? t('user.openMenu') : t('user.closeMenu')}
        >
          {sidebarCollapsed ? '▶' : '◀'}
        </button>

        <div className="ud-profile-card ud-profile-card--enhanced">
          <div className="ud-avatar ud-avatar--lg">
            {user.profile.avatarUrl
              ? <img src={resolveMediaUrl(user.profile.avatarUrl)} alt={displayName} />
              : <span className="ud-avatar-initials">{displayName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
            }
            <span className="ud-presence ud-presence--online" />
          </div>

          {!sidebarCollapsed && (
            <div className="ud-profile-info">
              <strong className="ud-profile-name">{displayName}</strong>
              <span className="ud-profile-pseudo">{pseudo}</span>
              <span className="ud-profile-role-chip">{t(ROLE_LABEL_KEY[user.role] ?? 'user.userRole')}</span>
            </div>
          )}
        </div>

        <nav className="ud-nav" aria-label="Menu utilisateur privé">
          {SECTION_DEFS.filter((s) => s.key !== 'analytics' || hasAnalytics).map((section) => (
            section.key === 'my-profile-page' ? (
              <Link
                key={section.key}
                to={user?.profile.username ? `/user/${user.profile.username}` : '/account'}
                className="ud-nav-item"
                onClick={() => setMobileSidebarOpen(false)}
              >
                <span className="ud-nav-icon">{section.icon}</span>
                {!sidebarCollapsed && <span className="ud-nav-label">{t(section.labelKey)}</span>}
              </Link>
            ) : (
              <button
                key={section.key}
                type="button"
                className={`ud-nav-item${activeSection === section.key ? ' ud-nav-item--active' : ''}`}
                onClick={() => {
                  if (section.key === 'messages') {
                    navigate('/messaging');
                    return;
                  }
                  setActiveSection(section.key);
                  setMobileSidebarOpen(false);
                }}
              >
                <span className="ud-nav-icon">{section.icon}</span>
                {!sidebarCollapsed && <span className="ud-nav-label">{t(section.labelKey)}</span>}
              </button>
            )
          ))}
        </nav>

        {!sidebarCollapsed && (
          <Link to="/forfaits" className="ud-premium-cta">
            <span className="ud-premium-badge">Upgrade to premium ✦</span>
            <p>{t('user.upgradePromo')}</p>
            <span className="ud-premium-btn">{t('user.viewPlans')}</span>
          </Link>
        )}

        <div className="ud-drawer-logout">
          <button type="button" className="ud-drawer-logout-btn" onClick={() => void handleLogout()}>
            {logoutBusy ? '⏳' : '🚪'} {t('common.logout')}
          </button>
        </div>
      </aside>

      <main className="ud-main" id="ud-main-content">
        <div className="ud-page-header ud-page-header--v2">
          <div>
            <h1 className="ud-page-title">{t(SECTION_DEFS.find((section) => section.key === activeSection)?.labelKey ?? 'user.privateSpace')}</h1>
            <p className="ud-page-sub">
              {activeSection === 'overview'
                ? t('user.greeting').replace('{name}', displayName.split(' ')[0])
                : t('user.manageHub')}
            </p>
          </div>

          <div className="ud-page-header-actions">
            <button type="button" className="ud-quick-btn ud-quick-btn--icon" title={t('user.refresh')} onClick={() => void handleRefresh()}>🔄</button>
            <button type="button" className="ud-quick-btn ud-quick-btn--icon" title={t('user.messaging')} onClick={() => navigate('/messaging')}>💬</button>
            <button type="button" className="ud-quick-btn ud-quick-btn--icon ud-quick-btn--danger" title={t('common.logout')} onClick={() => void handleLogout()}>
              {logoutBusy ? '⏳' : '🚪'}
            </button>
          </div>
        </div>

        {errorMessage ? <div className="ud-ov-feedback ud-ov-feedback--error">{errorMessage}</div> : null}
        {successMessage ? <div className="ud-ov-feedback ud-ov-feedback--ok">{successMessage}</div> : null}

        {activeSection === 'overview' && (
          <div className="ud-section animate-fade-in">
            {/* ── Stats row: 4 KPIs ── */}
            <div className="ud-ov-kpi-row">
              <article className="ud-ov-kpi ud-ov-kpi--blue">
                <span className="ud-ov-kpi-icon">🧩</span>
                <div className="ud-ov-kpi-body">
                  <span className="ud-ov-kpi-label">{t('user.publishedArticles')}</span>
                  <strong className="ud-ov-kpi-value">{listings.length}</strong>
                </div>
              </article>
              <article className="ud-ov-kpi ud-ov-kpi--green">
                <span className="ud-ov-kpi-icon">📦</span>
                <div className="ud-ov-kpi-body">
                  <span className="ud-ov-kpi-label">{t('user.sales')}</span>
                  <strong className="ud-ov-kpi-value">{allSellerOrders.length}</strong>
                </div>
              </article>
              <article className="ud-ov-kpi ud-ov-kpi--amber">
                <span className="ud-ov-kpi-icon">🛍️</span>
                <div className="ud-ov-kpi-body">
                  <span className="ud-ov-kpi-label">{t('user.purchases')}</span>
                  <strong className="ud-ov-kpi-value">{allBuyerOrders.length}</strong>
                </div>
              </article>
              <article className="ud-ov-kpi ud-ov-kpi--violet">
                <span className="ud-ov-kpi-icon">🛒</span>
                <div className="ud-ov-kpi-body">
                  <span className="ud-ov-kpi-label">{t('user.cart')}</span>
                  <strong className="ud-ov-kpi-value">{buyerCart?.items.length ?? 0}</strong>
                </div>
              </article>
            </div>

            {/* Bannière Kin-Sell */}
            <AdBanner page="account" forceKinSell />
            <SmartAdSlot pageKey="dashboard_user" componentKey="banner_top" variant="banner" />

            {/* ── Main grid: 2 colonnes ── */}
            <div className="ud-ov-grid">

              {/* ═══ LEFT: Mon compte (carte style bancaire) ═══ */}
              <section className="ud-ov-card ud-ov-card--account">
                <h3 className="ud-ov-card-title">{t('user.myAccount')}</h3>
                <div className="ud-ov-account-chip">
                  <div className="ud-ov-chip-top">
                    <span className="ud-ov-chip-brand">Kin-Sell</span>
                    <span className="ud-ov-chip-plan">{loadingPlan ? '...' : (activePlan?.planName ?? 'FREE')}</span>
                  </div>
                  <div className="ud-ov-chip-number">
                    <span>KS</span>
                    <span>••••</span>
                    <span>••••</span>
                    <span>{user.id.slice(0, 4).toUpperCase()}</span>
                  </div>
                  <div className="ud-ov-chip-bottom">
                    <div>
                      <span className="ud-ov-chip-lbl">{t('user.holder')}</span>
                      <span className="ud-ov-chip-val">{displayName}</span>
                    </div>
                    <div>
                      <span className="ud-ov-chip-lbl">ID</span>
                      <span className="ud-ov-chip-val">{shortId}</span>
                    </div>
                  </div>
                </div>

                <div className="ud-ov-account-metrics">
                  <div className="ud-ov-metric-row">
                    <span className="ud-ov-metric-label">{t('user.salesInProgress')}</span>
                    <strong className="ud-ov-metric-val">{sellerStats.inProgress}</strong>
                  </div>
                  <div className="ud-ov-metric-row">
                    <span className="ud-ov-metric-label">{t('user.purchasesInProgress')}</span>
                    <strong className="ud-ov-metric-val">{buyerStats.inProgress}</strong>
                  </div>
                  <div className="ud-ov-metric-row">
                    <span className="ud-ov-metric-label">{t('user.deliveredTotal')}</span>
                    <strong className="ud-ov-metric-val ud-ov-metric-val--green">{sellerStats.delivered + buyerStats.delivered}</strong>
                  </div>
                </div>

                <div className="ud-ov-account-bar">
                  <div className="ud-ov-account-bar-track">
                    <div className="ud-ov-account-bar-fill" style={{ width: `${Math.min(100, ((sellerStats.delivered + buyerStats.delivered) / Math.max(1, allSellerOrders.length + allBuyerOrders.length)) * 100)}%` }} />
                  </div>
                  <span className="ud-ov-account-bar-label">{t('user.completionRate')} {Math.round(((sellerStats.delivered + buyerStats.delivered) / Math.max(1, allSellerOrders.length + allBuyerOrders.length)) * 100)}%</span>
                </div>

                <div className="ud-ov-account-footer">
                  <div className="ud-ov-sessions-pill">
                    <span className="ud-ov-sessions-dot" />
                    {loadingSessions ? '...' : `${sessionsCount ?? 0} session${(sessionsCount ?? 0) > 1 ? 's' : ''}`}
                  </div>
                  {user.profileCompleted
                    ? <span className="ud-ov-profile-badge ud-ov-profile-badge--ok">{t('user.profileCompleteLabel')}</span>
                    : <span className="ud-ov-profile-badge ud-ov-profile-badge--warn">{t('user.profileIncompleteLabel')}</span>
                  }
                </div>
              </section>

              {/* ═══ RIGHT: Activité (progress bars style budget) ═══ */}
              <section className="ud-ov-card ud-ov-card--activity">
                <div className="ud-ov-activity-header">
                  <div>
                    <strong className="ud-ov-activity-total">{allSellerOrders.length + allBuyerOrders.length}</strong>
                    <span className="ud-ov-activity-sub">{t('user.transactions')}</span>
                  </div>
                  <span className="ud-ov-activity-badge">📊 {t('user.summary')}</span>
                </div>

                <div className="ud-ov-progress-list">
                  <div className="ud-ov-progress-item">
                    <div className="ud-ov-progress-head">
                      <span className="ud-ov-progress-dot ud-ov-progress-dot--green" />
                      <span className="ud-ov-progress-name">{t('user.delivered')}</span>
                      <strong className="ud-ov-progress-pct">{allSellerOrders.length + allBuyerOrders.length > 0 ? Math.round(((sellerStats.delivered + buyerStats.delivered) / (allSellerOrders.length + allBuyerOrders.length)) * 100) : 0}%</strong>
                    </div>
                    <div className="ud-ov-progress-bar">
                      <div className="ud-ov-progress-fill ud-ov-progress-fill--green" style={{ width: `${allSellerOrders.length + allBuyerOrders.length > 0 ? ((sellerStats.delivered + buyerStats.delivered) / (allSellerOrders.length + allBuyerOrders.length)) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <div className="ud-ov-progress-item">
                    <div className="ud-ov-progress-head">
                      <span className="ud-ov-progress-dot ud-ov-progress-dot--amber" />
                      <span className="ud-ov-progress-name">{t('user.inProgress')}</span>
                      <strong className="ud-ov-progress-pct">{allSellerOrders.length + allBuyerOrders.length > 0 ? Math.round(((sellerStats.inProgress + buyerStats.inProgress) / (allSellerOrders.length + allBuyerOrders.length)) * 100) : 0}%</strong>
                    </div>
                    <div className="ud-ov-progress-bar">
                      <div className="ud-ov-progress-fill ud-ov-progress-fill--amber" style={{ width: `${allSellerOrders.length + allBuyerOrders.length > 0 ? ((sellerStats.inProgress + buyerStats.inProgress) / (allSellerOrders.length + allBuyerOrders.length)) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <div className="ud-ov-progress-item">
                    <div className="ud-ov-progress-head">
                      <span className="ud-ov-progress-dot ud-ov-progress-dot--red" />
                      <span className="ud-ov-progress-name">{t('user.canceled')}</span>
                      <strong className="ud-ov-progress-pct">{allSellerOrders.length + allBuyerOrders.length > 0 ? Math.round(((sellerStats.canceled + buyerStats.canceled) / (allSellerOrders.length + allBuyerOrders.length)) * 100) : 0}%</strong>
                    </div>
                    <div className="ud-ov-progress-bar">
                      <div className="ud-ov-progress-fill ud-ov-progress-fill--red" style={{ width: `${allSellerOrders.length + allBuyerOrders.length > 0 ? ((sellerStats.canceled + buyerStats.canceled) / (allSellerOrders.length + allBuyerOrders.length)) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              </section>

              {/* ═══ BOTTOM-LEFT: Historique transactions ═══ */}
              <section className="ud-ov-card ud-ov-card--history">
                <div className="ud-ov-card-head-row">
                  <h3 className="ud-ov-card-title">{t('user.transHistory')}</h3>
                  <button type="button" className="ud-ov-see-all" onClick={() => setActiveSection('sales')}>{t('user.seeAll')}</button>
                </div>
                <div className="ud-ov-table-wrap">
                  <table className="ud-ov-table">
                    <thead>
                      <tr>
                        <th>{t('user.recipient')}</th>
                        <th>{t('user.type')}</th>
                        <th>{t('user.date')}</th>
                        <th>{t('user.amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...sellerRecent.map(o => ({ ...o, _role: 'sale' as const })), ...buyerRecent.map(o => ({ ...o, _role: 'purchase' as const }))]
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .slice(0, 5)
                        .map((order) => (
                          <tr key={order.id} onClick={() => void handleOrderDetail(order.id)} style={{ cursor: 'pointer' }}>
                            <td>
                              <div className="ud-ov-txn-who">
                                <span className="ud-ov-txn-avatar">{order._role === 'sale' ? '📦' : '🛍️'}</span>
                                <span>#{order.id.slice(0, 8).toUpperCase()}</span>
                              </div>
                            </td>
                            <td><span className="ud-ov-txn-type-chip">{order._role === 'sale' ? t('user.saleLabel') : t('user.purchaseLabel')}</span></td>
                            <td className="ud-ov-txn-date">{new Date(order.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                            <td className={`ud-ov-txn-amount ${order._role === 'sale' ? 'ud-ov-txn-amount--pos' : 'ud-ov-txn-amount--neg'}`}>
                              {order._role === 'sale' ? '+' : '-'}{money(order.totalUsdCents)}
                            </td>
                          </tr>
                        ))}
                      {sellerRecent.length === 0 && buyerRecent.length === 0 && (
                        <tr><td colSpan={4} className="ud-ov-table-empty">{t('user.noRecentTx')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ═══ BOTTOM-RIGHT: Actions rapides ═══ */}
              <section className="ud-ov-card ud-ov-card--actions">
                <h3 className="ud-ov-card-title">{t('user.quickActions')}</h3>
                <div className="ud-ov-quick-grid">
                  <button type="button" className="ud-ov-quick-tile" onClick={() => { resetArticleForm(); if (settingsForm.city) setArticleForm(p => ({ ...p, city: settingsForm.city })); setShowCreateForm(true); setActiveSection('articles'); }}>
                    <span className="ud-ov-quick-icon">📝</span>
                    <span>{t('user.publish')}</span>
                  </button>
                  <button type="button" className="ud-ov-quick-tile" onClick={() => navigate('/messaging')}>
                    <span className="ud-ov-quick-icon">💬</span>
                    <span>{t('user.messaging')}</span>
                  </button>
                  <button type="button" className="ud-ov-quick-tile" onClick={() => setActiveSection('purchases')}>
                    <span className="ud-ov-quick-icon">🛒</span>
                    <span>{t('user.cart')}</span>
                  </button>
                  <Link to="/explorer" className="ud-ov-quick-tile">
                    <span className="ud-ov-quick-icon">🔍</span>
                    <span>{t('user.explore')}</span>
                  </Link>
                  <Link to="/forfaits" className="ud-ov-quick-tile">
                    <span className="ud-ov-quick-icon">⚡</span>
                    <span>{t('user.plans')}</span>
                  </Link>
                  <button type="button" className="ud-ov-quick-tile" onClick={() => setActiveSection('settings')}>
                    <span className="ud-ov-quick-icon">⚙</span>
                    <span>{t('user.settings')}</span>
                  </button>
                </div>

                {alerts.length > 0 && (
                  <div className="ud-ov-alerts">
                    <h4 className="ud-ov-alerts-title">⚠ {t('user.accountAlerts')}</h4>
                    {alerts.map((alert) => (
                      <div key={alert} className="ud-ov-alert-item">
                        <span>{alert}</span>
                        <button type="button" className="ud-ov-alert-fix" onClick={() => setActiveSection('settings')}>{t('user.fix')}</button>
                      </div>
                    ))}
                  </div>
                )}

                {!user.profileCompleted && missing.length > 0 && (
                  <div className="ud-ov-completion">
                    <div className="ud-ov-completion-head">
                      <span>{t('user.profileCompletion')}</span>
                      <strong>{Math.round(((10 - missing.length) / 10) * 100)}%</strong>
                    </div>
                    <div className="ud-ov-progress-bar">
                      <div className="ud-ov-progress-fill ud-ov-progress-fill--violet" style={{ width: `${Math.round(((10 - missing.length) / 10) * 100)}%` }} />
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {activeSection === 'articles' && (
          <div className="ud-section animate-fade-in">
            {/* ── Header: titre + stats compacts + bouton publier ── */}
            <div className="ud-art-topbar">
              <div className="ud-art-topbar-left">
                <h2 className="ud-art-topbar-title">{t('user.myArticles')}</h2>
                <div className="ud-art-stats-inline">
                  <span className="ud-art-stat-chip ud-art-stat-chip--active">{articlesStats?.active ?? 0} {t('user.activeCount')}</span>
                  <span className="ud-art-stat-chip">{articlesStats?.inactive ?? 0} {t('user.inactiveCount')}</span>
                  <span className="ud-art-stat-chip">{articlesStats?.archived ?? 0} {t('user.archivedCount')}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="ud-art-publish-btn" style={{ background: 'rgba(111,88,255,.15)', color: 'var(--color-primary)' }} onClick={() => { resetBulkImport(); setShowBulkImport(true); }}>
                  <span className="ud-art-publish-icon">📥</span>
                  Importer
                </button>
                <button type="button" className="ud-art-publish-btn" onClick={() => {
                  resetArticleForm();
                  if (settingsForm.city) setArticleForm(p => ({ ...p, city: settingsForm.city }));
                  setShowCreateForm(true);
                }}>
                  <span className="ud-art-publish-icon">+</span>
                  {t('user.publishBtn')}
                </button>
              </div>
            </div>

            {/* ── Modal import en masse ── */}
            {showBulkImport && (
              <div className="ud-section glass-card" style={{ marginBottom: 24, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>📥 Import en masse (max 50 articles)</h3>
                  <button type="button" onClick={resetBulkImport} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,.1)' }}>
                  {(['file', 'db'] as const).map(tab => (
                    <button key={tab} type="button" onClick={() => { setBulkTab(tab); setBulkParsedRows([]); setBulkColumns([]); setBulkMapping({}); setBulkError(null); setBulkResult(null); }}
                      style={{ flex: 1, padding: '10px 16px', background: bulkTab === tab ? 'rgba(111,88,255,.15)' : 'transparent', color: bulkTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)', border: 'none', borderBottom: bulkTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                      {tab === 'file' ? '📄 Fichier (CSV / JSON / XML)' : '🔗 Base de données MySQL'}
                    </button>
                  ))}
                </div>

                {/* ── Tab Fichier ── */}
                {bulkTab === 'file' && (
                  <div>
                    <div style={{ border: '2px dashed rgba(111,88,255,.3)', borderRadius: 12, padding: 24, textAlign: 'center', marginBottom: 16, cursor: 'pointer' }}
                      onClick={() => bulkFileRef.current?.click()}>
                      <input ref={bulkFileRef} type="file" accept=".csv,.json,.xml" onChange={handleBulkFileLoad} style={{ display: 'none' }} />
                      <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
                        {bulkParsedRows.length > 0
                          ? `✅ ${bulkParsedRows.length} ligne(s) détectée(s) — ${bulkFileType.toUpperCase()}`
                          : 'Cliquez pour sélectionner un fichier CSV, JSON ou XML'}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Tab Base de données ── */}
                {bulkTab === 'db' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, marginBottom: 8 }}>
                      <input placeholder="Hôte (ex: db.example.com)" value={bulkDbForm.host} onChange={e => setBulkDbForm(p => ({ ...p, host: e.target.value }))} className="ud-form-input" />
                      <input placeholder="Port" value={bulkDbForm.port} onChange={e => setBulkDbForm(p => ({ ...p, port: e.target.value }))} className="ud-form-input" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <input placeholder="Utilisateur" value={bulkDbForm.user} onChange={e => setBulkDbForm(p => ({ ...p, user: e.target.value }))} className="ud-form-input" />
                      <input placeholder="Mot de passe" type="password" value={bulkDbForm.password} onChange={e => setBulkDbForm(p => ({ ...p, password: e.target.value }))} className="ud-form-input" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      <input placeholder="Base de données" value={bulkDbForm.database} onChange={e => setBulkDbForm(p => ({ ...p, database: e.target.value }))} className="ud-form-input" />
                      <input placeholder="Nom de la table" value={bulkDbForm.table} onChange={e => setBulkDbForm(p => ({ ...p, table: e.target.value }))} className="ud-form-input" />
                    </div>
                    <button type="button" disabled={bulkBusy || !bulkDbForm.host || !bulkDbForm.database || !bulkDbForm.table} onClick={() => void handleBulkDbPreview()}
                      className="ud-art-publish-btn" style={{ width: '100%', marginBottom: 12 }}>
                      {bulkBusy ? '⏳ Connexion…' : '🔍 Aperçu des données'}
                    </button>
                  </div>
                )}

                {/* ── Erreur ── */}
                {bulkError && (
                  <div style={{ background: 'rgba(255,60,60,.12)', border: '1px solid rgba(255,60,60,.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#ff6b6b' }}>
                    ❌ {bulkError}
                  </div>
                )}

                {/* ── Résultat d'import ── */}
                {bulkResult && (
                  <div style={{ background: bulkResult.created > 0 ? 'rgba(60,255,100,.1)' : 'rgba(255,200,60,.1)', border: `1px solid ${bulkResult.created > 0 ? 'rgba(60,255,100,.3)' : 'rgba(255,200,60,.3)'}`, borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      ✅ {bulkResult.created}/{bulkResult.total} article(s) créé(s)
                    </p>
                    {bulkResult.errors.length > 0 && (
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#ff9f43' }}>
                        {bulkResult.errors.slice(0, 10).map((e, i) => (
                          <li key={i}>Ligne {e.index + 1} : {e.error}</li>
                        ))}
                        {bulkResult.errors.length > 10 && <li>… et {bulkResult.errors.length - 10} autres erreurs</li>}
                      </ul>
                    )}
                  </div>
                )}

                {/* ── Preview + Mapping ── */}
                {bulkParsedRows.length > 0 && !bulkResult && (
                  <div>
                    <h4 style={{ fontSize: 14, margin: '0 0 8px', color: 'var(--color-text-secondary)' }}>
                      Mapping des colonnes ({bulkParsedRows.length} ligne{bulkParsedRows.length > 1 ? 's' : ''})
                    </h4>
                    <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr>
                            {bulkColumns.map(col => (
                              <th key={col} style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,.1)', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                <div style={{ marginBottom: 4, fontWeight: 600, color: 'var(--color-text)' }}>{col}</div>
                                <select value={bulkMapping[col] ?? ''} onChange={e => setBulkMapping(p => ({ ...p, [col]: e.target.value }))}
                                  style={{ width: '100%', padding: '4px 6px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, color: 'var(--color-text)', fontSize: 11 }}>
                                  {BULK_TARGET_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                                </select>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bulkParsedRows.slice(0, 5).map((row, ri) => (
                            <tr key={ri}>
                              {bulkColumns.map(col => (
                                <td key={col} style={{ padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,.05)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)', fontSize: 11 }}>
                                  {row[col]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {bulkParsedRows.length > 5 && (
                      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                        … et {bulkParsedRows.length - 5} autre(s) ligne(s)
                      </p>
                    )}
                    <button type="button" disabled={bulkBusy || !Object.values(bulkMapping).includes('title')} onClick={() => void handleBulkConfirm()}
                      className="ud-art-publish-btn" style={{ width: '100%' }}>
                      {bulkBusy ? '⏳ Import en cours…' : `📥 Importer ${bulkParsedRows.length} article(s)`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Filtres articles ── */}
            <div className="ud-art-filters">
              {(['', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`ud-art-filter-btn${articlesFilter === f ? ' active' : ''}`}
                  onClick={() => { setArticlesFilter(f as ListingStatus | ''); setArticlesPage(1); }}
                >
                  {f === '' ? t('user.filterAll') : f === 'ACTIVE' ? t('user.filterActive') : f === 'INACTIVE' ? t('user.filterInactive') : t('user.filterArchived')}
                </button>
              ))}
            </div>

            {/* ── Grille d'articles (cards, slidable) ── */}
            {loadingArticles ? (
              <div className="ud-art-loading">
                <span className="ud-art-loading-spinner" />
                <span>{t('common.loading')}</span>
              </div>
            ) : myArticles.length === 0 ? (
              <div className="ud-art-empty">
                <span className="ud-art-empty-icon">📭</span>
                <p>{t('user.noArticles')}</p>
                <p>{t('user.firstPublishHint')}</p>
              </div>
            ) : (
              <div className="ud-art-slider-wrap">
                <div className="ud-art-grid">
                  {myArticles.map((article) => (
                    <article key={article.id} className={`ud-art-card${article.status === 'INACTIVE' ? ' ud-art-card--dim' : ''}`}>
                      <div className="ud-art-card-visual">
                        {article.imageUrl ? (
                          <img src={resolveMediaUrl(article.imageUrl)} alt={article.title} className="ud-art-card-img" loading="lazy" />
                        ) : (
                          <div className="ud-art-card-placeholder">
                            <span>{article.type === 'SERVICE' ? '🛠️' : '📦'}</span>
                          </div>
                        )}
                        <span className={`ud-art-card-badge${article.status === 'ACTIVE' ? ' ud-art-card-badge--active' : article.status === 'INACTIVE' ? ' ud-art-card-badge--inactive' : ' ud-art-card-badge--archived'}`}>
                          {article.status === 'ACTIVE' ? '🟢' : article.status === 'INACTIVE' ? '⏸' : '📦'}
                        </span>
                      </div>
                      <div className="ud-art-card-body">
                        <h4 className="ud-art-card-title">{article.title}</h4>
                        <p className="ud-art-card-meta">{article.category} · {article.city}</p>
                        <p className="ud-art-card-price">
                          {formatPriceLabelFromUsdCents(article.priceUsdCents)}
                        </p>
                        {article.type === 'PRODUIT' && (
                          <p className="ud-art-card-stock">
                            {t('user.stockLabel')}: {article.stockQuantity !== null ? article.stockQuantity : '∞'}
                          </p>
                        )}
                      </div>
                      <div className="ud-art-card-actions">
                        <button type="button" className="ud-art-action ud-art-action--edit" title={t('user.editAction')} disabled={articleBusy !== null} onClick={() => openEditForm(article)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        {article.status === 'ACTIVE' && (
                          <button type="button" className="ud-art-action ud-art-action--toggle" title={t('user.deactivateAction')} disabled={articleBusy !== null} onClick={() => void handleArticleStatusChange(article.id, 'INACTIVE')}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg></button>
                        )}
                        {article.status === 'INACTIVE' && (
                          <button type="button" className="ud-art-action ud-art-action--toggle" title={t('user.activateAction')} disabled={articleBusy !== null} onClick={() => void handleArticleStatusChange(article.id, 'ACTIVE')}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></button>
                        )}
                        {(article.status === 'ACTIVE' || article.status === 'INACTIVE') && (
                          <button type="button" className="ud-art-action ud-art-action--archive" title={t('user.archiveAction')} disabled={articleBusy !== null} onClick={() => void handleArticleStatusChange(article.id, 'ARCHIVED')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg></button>
                        )}
                        {article.status !== 'DELETED' && (
                          <button type="button" className="ud-art-action ud-art-action--delete" title={t('user.deleteAction')} disabled={articleBusy !== null} onClick={() => void handleArticleStatusChange(article.id, 'DELETED')}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {/* ── Pagination ── */}
            {articlesTotalPages > 1 && (
              <div className="ud-art-pagination">
                <button type="button" className="ud-art-page-btn" disabled={articlesPage <= 1} onClick={() => setArticlesPage((v) => Math.max(1, v - 1))}>←</button>
                <span className="ud-art-page-num">{articlesPage} / {articlesTotalPages}</span>
                <button type="button" className="ud-art-page-btn" disabled={articlesPage >= articlesTotalPages} onClick={() => setArticlesPage((v) => v + 1)}>→</button>
              </div>
            )}

            {/* ── Encarts promo (3 colonnes) ── */}
            <div className="ud-art-promos">
              <Link to="/forfaits" className="ud-art-promo-card ud-art-promo-card--ia">
                <span className="ud-art-promo-icon">🤖</span>
                <strong>{t('user.promoIa')}</strong>
                <span className="ud-art-promo-desc">{t('user.promoIaDesc')}</span>
              </Link>
              <Link to="/forfaits" className="ud-art-promo-card ud-art-promo-card--boost">
                <span className="ud-art-promo-icon">⚡</span>
                <strong>{t('user.promoBoost')}</strong>
                <span className="ud-art-promo-desc">{t('user.promoBoostDesc')}</span>
              </Link>
              <Link to="/forfaits" className="ud-art-promo-card ud-art-promo-card--medium">
                <span className="ud-art-promo-icon">📢</span>
                <strong>{t('user.promoMedium')}</strong>
                <span className="ud-art-promo-desc">{t('user.promoMediumDesc')}</span>
              </Link>
            </div>
          </div>
        )}

        {activeSection === 'sales' && (
          <div className="ud-section animate-fade-in">
            {/* ── Topbar vente ── */}
            <div className="ud-ord-topbar">
              <div className="ud-ord-topbar-left">
                <h2 className="ud-ord-topbar-title">{t('user.sellSpace')}</h2>
                <div className="ud-ord-stats-inline">
                  <span className="ud-ord-stat-chip">{sellerStats.total} {sellerStats.total > 1 ? t('user.ordersLabel') : t('user.orderLabel')}</span>
                  <span className="ud-ord-stat-chip ud-ord-stat-chip--progress">{sellerStats.inProgress} {t('user.enCours')}</span>
                  <span className="ud-ord-stat-chip ud-ord-stat-chip--success">{sellerStats.delivered} {sellerStats.delivered > 1 ? t('user.livreesLabel') : t('user.livreeLabel')}</span>
                  <span className="ud-ord-stat-chip ud-ord-stat-chip--danger">{sellerStats.canceled} {sellerStats.canceled > 1 ? t('user.annuleesLabel') : t('user.annuleeLabel')}</span>
                </div>
              </div>
              <span className="ud-ord-plan-badge">
                📦 {loadingPlan ? '...' : (activePlan?.planName ?? 'FREE')}
              </span>
            </div>

            {/* ── Bloc marchandages reçus ── */}
            <div className="ud-commerce-panel">
              <div className="ud-commerce-panel-head">
                <h3 className="ud-commerce-panel-title">🤝 {t('user.negReceived')}</h3>
                <span className="ud-ord-stat-chip">{negTotal} total</span>
                <select
                  className="ud-neg-filter-select"
                  value={negFilter}
                  onChange={(e) => { setNegFilter(e.target.value as NegotiationStatus | ''); setNegPage(1); }}
                >
                  <option value="">{t('user.negAllStatuses')}</option>
                  <option value="PENDING">⏳ {t('order.status.pending')}</option>
                  <option value="COUNTERED">🔄 {t('negotiation.counter')}</option>
                  <option value="ACCEPTED">✅ {t('order.status.confirmed')}</option>
                  <option value="REFUSED">❌ {t('negotiation.refuse')}</option>
                  <option value="EXPIRED">⏰ {t('negotiation.status.expired')}</option>
                </select>
              </div>

              {negLoading && <div className="ud-loading"><span className="ud-spinner" /><span>{t('user.negLoading')}</span></div>}
              {!negLoading && negList.length === 0 && (
                <div className="ud-neg-empty">
                  <span style={{ fontSize: '2rem' }}>🤝</span>
                  <p>{t('user.negNoneReceived')}</p>
                </div>
              )}
              {!negLoading && negList.length > 0 && (
                <div className="ud-neg-grid">
                  {negList.map((neg) => {
                    const lastOffer = neg.offers[neg.offers.length - 1];
                    const canRespond = (neg.status === 'PENDING' || neg.status === 'COUNTERED') && lastOffer && lastOffer.fromUserId !== neg.sellerUserId;
                    return (
                      <div key={neg.id} className={`ud-neg-card glass-card ud-neg-card--${neg.status.toLowerCase()}`}>
                        <div className="ud-neg-card-header">
                          {neg.listing?.imageUrl ? (
                            <img src={resolveMediaUrl(neg.listing.imageUrl)} alt={neg.listing.title} className="ud-neg-img" />
                          ) : (
                            <div className="ud-neg-img-placeholder">{neg.listing?.type === 'SERVICE' ? '🛠' : '📦'}</div>
                          )}
                          <div className="ud-neg-card-info">
                            <h4 className="ud-neg-card-title">{neg.listing?.title ?? 'Article'}</h4>
                            <p className="ud-neg-card-meta">{t('user.buyerLabel')} : {neg.buyer.displayName}</p>
                            <div className="ud-neg-badges-row">
                            {neg.bundleId && <span className="ud-neg-type-badge ud-neg-type-badge--bundle">📦 {t('user.lotLabel')}</span>}
                            <span className={`ud-neg-type-badge ud-neg-type-badge--${neg.type.toLowerCase()}`}>
                              {neg.type === 'SIMPLE' && `🤝 ${t('user.negSimple')}`}
                              {neg.type === 'QUANTITY' && `📦 ${t('user.negQuantity')}`}
                              {neg.type === 'GROUPED' && `👥 ${t('user.negGrouped')}${neg.groupId ? ` (${neg.groupCurrentBuyers ?? 1}/${neg.minBuyers ?? 2})` : ''}`}
                            </span>
                            <span className={`ud-neg-status-badge ud-neg-status-badge--${neg.status.toLowerCase()}`}>
                              {neg.status === 'PENDING' && `⏳ ${t('user.negStatusPending')}`}
                              {neg.status === 'COUNTERED' && `🔄 ${t('user.negStatusCountered')}`}
                              {neg.status === 'ACCEPTED' && `✅ ${t('user.negStatusAccepted')}`}
                              {neg.status === 'REFUSED' && `❌ ${t('user.negStatusRefused')}`}
                              {neg.status === 'EXPIRED' && `⏰ ${t('user.negStatusExpired')}`}
                            </span>
                            </div>
                          </div>
                        </div>
                        <div className="ud-neg-card-prices">
                          <div className="ud-neg-price-row">
                            <span>{t('user.catalogPrice')}</span>
                            <span className="ud-neg-price-original">{(neg.originalPriceUsdCents / 100).toFixed(2)} $</span>
                          </div>
                          <div className="ud-neg-price-row">
                            <span>{t('user.quantityLabel')}</span>
                            <span className="ud-neg-price-current">x{neg.quantity}</span>
                          </div>
                          {lastOffer && (
                            <div className="ud-neg-price-row">
                              <span>{t('user.proposedPrice')}</span>
                              <span className="ud-neg-price-current">{(lastOffer.priceUsdCents / 100).toFixed(2)} $</span>
                            </div>
                          )}
                        </div>
                        {neg.bundleId && (
                          <div className="ud-neg-bundle-section">
                            <button type="button" className="ud-neg-bundle-toggle" onClick={() => toggleBundleExpand(neg.bundleId!)}>
                              {bundleLoading === neg.bundleId ? `⏳ ${t('user.bundleLoading')}` : expandedBundles[neg.bundleId] ? `▼ ${t('user.bundleHideLabel')}` : `▶ ${t('user.bundleShowLabel')}`}
                            </button>
                            {expandedBundles[neg.bundleId] && (
                              <div className="ud-neg-bundle-items">
                                {expandedBundles[neg.bundleId].map((bi) => (
                                  <div key={bi.listingId} className="ud-neg-bundle-item">
                                    {bi.listing?.imageUrl ? (
                                      <img src={resolveMediaUrl(bi.listing.imageUrl)} alt={bi.listing.title} className="ud-neg-bundle-item-img" />
                                    ) : (
                                      <div className="ud-neg-bundle-item-img-ph">{bi.listing?.type === 'SERVICE' ? '🛠' : '📦'}</div>
                                    )}
                                    <div className="ud-neg-bundle-item-info">
                                      <span className="ud-neg-bundle-item-title">{bi.listing?.title ?? 'Article'}</span>
                                      <span className="ud-neg-bundle-item-detail">x{bi.quantity} — {((bi.listing?.priceUsdCents ?? 0) / 100).toFixed(2)} $</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {canRespond && (
                          <button type="button" className="ud-neg-respond-btn" onClick={() => setRespondNeg(neg)}>
                            🤝 {t('user.acceptCounterRefuse')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Bloc commandes vendeur ── */}
            <div className="ud-commerce-panel">
              <div className="ud-commerce-panel-head">
                <h3 className="ud-commerce-panel-title">📦 {t('user.sellerOrders')}</h3>
              </div>
              <div className="ud-ord-filters">
                {(['' , 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELED'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`ud-ord-filter-btn${salesFilter === f ? ' active' : ''}`}
                    onClick={() => setSalesFilter(f as OrderStatus | '')}
                  >
                    {f === '' ? t('user.filterAll') : f === 'PENDING' ? t('user.filterPending') : f === 'CONFIRMED' ? t('user.filterConfirmed') : f === 'PROCESSING' ? t('user.filterProcessing') : f === 'SHIPPED' ? t('user.filterShipped') : f === 'DELIVERED' ? t('user.filterDelivered') : t('user.filterCanceled')}
                  </button>
                ))}
              </div>

              {loadingCommerce ? (
                <div className="ud-ord-loading">
                  <span className="ud-ord-loading-spinner" />
                  <span>{t('user.loadingOrders')}</span>
                </div>
              ) : filteredSellerOrders.length === 0 ? (
                <div className="ud-ord-empty">
                  <span className="ud-ord-empty-icon">📭</span>
                  <p>{t('user.noSellerOrders')}{salesFilter ? ` ${t('user.withStatus')} "${statusLabel(salesFilter)}"` : ''}.</p>
                </div>
              ) : (
                <div className="ud-ord-grid">
                  {filteredSellerOrders.map((order) => (
                    <article key={order.id} className="ud-ord-card">
                      <div className="ud-ord-card-header">
                        <span className="ud-ord-card-id">#{order.id.slice(0, 8).toUpperCase()}</span>
                        <span className={statusClass(order.status)}>{statusLabel(order.status)}</span>
                      </div>
                      <div className="ud-ord-card-body">
                        <p className="ud-ord-card-amount">{money(order.totalUsdCents)}</p>
                        <p className="ud-ord-card-meta">{order.itemsCount} {order.itemsCount > 1 ? t('user.articlesLabel') : t('user.articleLabel')} · {new Date(order.createdAt).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <div className="ud-ord-card-actions">
                        <button type="button" className="ud-ord-action ud-ord-action--detail" title={t('user.orderDetailLabel')} onClick={() => void handleOrderDetail(order.id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        </button>
                        {nextSellerStatuses(order.status).map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={`ud-ord-action${status === 'CANCELED' ? ' ud-ord-action--danger' : ' ud-ord-action--confirm'}`}
                            title={statusLabel(status)}
                            disabled={orderStatusBusyId !== null}
                            onClick={() => void handleSellerStatus(order.id, status)}
                          >
                            {orderStatusBusyId === order.id ? '...' : statusLabel(status)}
                          </button>
                        ))}
                        {(order.status === 'PROCESSING' || order.status === 'SHIPPED') && (
                          <button
                            type="button"
                            className="ud-ord-action ud-ord-action--code"
                            title={t('user.showValidationQr')}
                            disabled={validationCodeBusyId === order.id}
                            onClick={() => void handleRevealCode(order.id)}
                          >
                            {validationCodeBusyId === order.id ? '...' : '🔑 QR / Code'}
                          </button>
                        )}
                        {order.status === 'DELIVERED' && !reviewedOrders.has(order.id) && (
                          <button
                            type="button"
                            className="ud-ord-action ud-ord-action--confirm"
                            title="Laisser un avis"
                            onClick={() => { setReviewModalOrder({ orderId: order.id }); setReviewRating(5); setReviewText(''); }}
                          >
                            ⭐ Avis
                          </button>
                        )}
                        {order.status === 'DELIVERED' && reviewedOrders.has(order.id) && (
                          <span style={{ fontSize: '.75rem', color: 'var(--color-primary)', padding: '4px 8px' }}>✓ Avis envoyé</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {/* ── Détail commande sélectionnée ── */}
              {selectedOrder && (
                <section className="ud-ord-detail">
                  <div className="ud-ord-detail-head">
                    <h3>Détail — #{selectedOrder.id.slice(0, 8).toUpperCase()}</h3>
                    <span className={statusClass(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</span>
                    <span className="ud-ord-detail-total">{money(selectedOrder.totalUsdCents)}</span>
                  </div>
                  <ul className="ud-ord-detail-items">
                    {selectedOrder.items.map((item) => (
                      <li key={item.id} className="ud-ord-detail-item">
                        <span className="ud-ord-detail-icon">{item.listingType === 'SERVICE' ? '🛠' : '📦'}</span>
                        <div className="ud-ord-detail-info">
                          <strong>{item.title}</strong>
                          <span>{item.category} · {item.city} · x{item.quantity}</span>
                        </div>
                        <span className="ud-ord-detail-price">{money(item.lineTotalUsdCents)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* ── Encarts promo (3 colonnes) ── */}
            <div className="ud-ord-promos">
              <Link to="/forfaits" className="ud-art-promo-card ud-art-promo-card--ia">
                <span className="ud-art-promo-icon">🤖</span>
                <strong>{t('user.promoIa')}</strong>
                <span className="ud-art-promo-desc">{t('user.promoIaDesc')}</span>
              </Link>
              <Link to="/forfaits" className="ud-art-promo-card ud-art-promo-card--boost">
                <span className="ud-art-promo-icon">⚡</span>
                <strong>{t('user.promoBoost')}</strong>
                <span className="ud-art-promo-desc">{t('user.promoBoostDesc')}</span>
              </Link>
              <Link to="/forfaits" className="ud-art-promo-card ud-art-promo-card--medium">
                <span className="ud-art-promo-icon">📊</span>
                <strong>{t('user.promoUpgrade')}</strong>
                <span className="ud-art-promo-desc">{t('user.promoUpgradeDesc')}</span>
              </Link>
            </div>
          </div>
        )}

        {activeSection === 'purchases' && (
          <div className="ud-section animate-fade-in">
            {/* ── Topbar achat ── */}
            <div className="ud-ord-topbar">
              <div className="ud-ord-topbar-left">
                <h2 className="ud-ord-topbar-title">{t('user.buySpace')}</h2>
                <div className="ud-ord-stats-inline">
                  <span className="ud-ord-stat-chip">{buyerStats.total} {buyerStats.total > 1 ? t('user.ordersLabel') : t('user.orderLabel')}</span>
                  <span className="ud-ord-stat-chip ud-ord-stat-chip--progress">{buyerStats.inProgress} {t('user.enCours')}</span>
                  <span className="ud-ord-stat-chip ud-ord-stat-chip--success">{buyerStats.delivered} {buyerStats.delivered > 1 ? t('user.livreesLabel') : t('user.livreeLabel')}</span>
                </div>
              </div>
              {buyerCart && buyerCart.items.length > 0 && (
                <span className="ud-ord-plan-badge ud-ord-plan-badge--cart">
                  🛒 {t('user.cartBadge')}: {money(buyerCart.subtotalUsdCents)}
                </span>
              )}
            </div>

            {/* ── Bloc marchandages envoyés ── */}
            <div className="ud-commerce-panel">
              <div className="ud-commerce-panel-head">
                <h3 className="ud-commerce-panel-title">🤝 {t('user.negSent')}</h3>
                <span className="ud-ord-stat-chip">{negTotal} total</span>
                <select
                  className="ud-neg-filter-select"
                  value={negFilter}
                  onChange={(e) => { setNegFilter(e.target.value as NegotiationStatus | ''); setNegPage(1); }}
                >
                  <option value="">{t('user.negAllStatuses')}</option>
                  <option value="PENDING">⏳ {t('order.status.pending')}</option>
                  <option value="COUNTERED">🔄 {t('negotiation.counter')}</option>
                  <option value="ACCEPTED">✅ {t('order.status.confirmed')}</option>
                  <option value="REFUSED">❌ {t('negotiation.refuse')}</option>
                  <option value="EXPIRED">⏰ {t('negotiation.status.expired')}</option>
                </select>
              </div>

              {negLoading && <div className="ud-loading"><span className="ud-spinner" /><span>{t('user.negLoading')}</span></div>}
              {!negLoading && negList.length === 0 && (
                <div className="ud-neg-empty">
                  <span style={{ fontSize: '2rem' }}>🤝</span>
                  <p>{t('user.negNoneSent')}</p>
                </div>
              )}
              {!negLoading && negList.length > 0 && (
                <div className="ud-neg-grid">
                  {negList.map((neg) => {
                    const lastOffer = neg.offers[neg.offers.length - 1];
                    const canRespond = neg.status === 'COUNTERED' && lastOffer && lastOffer.fromUserId !== neg.buyerUserId;
                    const canCancel = neg.status === 'PENDING' || neg.status === 'COUNTERED';
                    return (
                      <div key={neg.id} className={`ud-neg-card glass-card ud-neg-card--${neg.status.toLowerCase()}`}>
                        <div className="ud-neg-card-header">
                          {neg.listing?.imageUrl ? (
                            <img src={resolveMediaUrl(neg.listing.imageUrl)} alt={neg.listing.title} className="ud-neg-img" loading="lazy" />
                          ) : (
                            <div className="ud-neg-img-placeholder">{neg.listing?.type === 'SERVICE' ? '🛠' : '📦'}</div>
                          )}
                          <div className="ud-neg-card-info">
                            <h4 className="ud-neg-card-title">{neg.listing?.title ?? 'Article'}</h4>
                            <p className="ud-neg-card-meta">{t('user.sellerLabel')} : {neg.seller.displayName}</p>
                            <div className="ud-neg-badges-row">
                            {neg.bundleId && <span className="ud-neg-type-badge ud-neg-type-badge--bundle">📦 {t('user.lotLabel')}</span>}
                            <span className={`ud-neg-type-badge ud-neg-type-badge--${neg.type.toLowerCase()}`}>
                              {neg.type === 'SIMPLE' && `🤝 ${t('user.negSimple')}`}
                              {neg.type === 'QUANTITY' && `📦 ${t('user.negQuantity')}`}
                              {neg.type === 'GROUPED' && `👥 ${t('user.negGrouped')}${neg.groupId ? ` (${neg.groupCurrentBuyers ?? 1}/${neg.minBuyers ?? 2})` : ''}`}
                            </span>
                            <span className={`ud-neg-status-badge ud-neg-status-badge--${neg.status.toLowerCase()}`}>
                              {neg.status === 'PENDING' && `⏳ ${t('user.negStatusPending')}`}
                              {neg.status === 'COUNTERED' && `🔄 ${t('user.negStatusCounteredReceived')}`}
                              {neg.status === 'ACCEPTED' && `✅ ${t('user.negStatusAccepted')}`}
                              {neg.status === 'REFUSED' && `❌ ${t('user.negStatusRefused')}`}
                              {neg.status === 'EXPIRED' && `⏰ ${t('user.negStatusExpired')}`}
                            </span>
                            </div>
                          </div>
                        </div>
                        <div className="ud-neg-card-prices">
                          <div className="ud-neg-price-row">
                            <span>{t('user.catalogPrice')}</span>
                            <span className="ud-neg-price-original">{(neg.originalPriceUsdCents / 100).toFixed(2)} $</span>
                          </div>
                          <div className="ud-neg-price-row">
                            <span>{t('user.quantityLabel')}</span>
                            <span className="ud-neg-price-current">x{neg.quantity}</span>
                          </div>
                          {lastOffer && (
                            <div className="ud-neg-price-row">
                              <span>{t('user.lastOffer')}</span>
                              <span className="ud-neg-price-current">{(lastOffer.priceUsdCents / 100).toFixed(2)} $</span>
                            </div>
                          )}
                        </div>
                        {neg.bundleId && (
                          <div className="ud-neg-bundle-section">
                            <button type="button" className="ud-neg-bundle-toggle" onClick={() => toggleBundleExpand(neg.bundleId!)}>
                              {bundleLoading === neg.bundleId ? `⏳ ${t('user.bundleLoading')}` : expandedBundles[neg.bundleId] ? `▼ ${t('user.bundleHideLabel')}` : `▶ ${t('user.bundleShowLabel')}`}
                            </button>
                            {expandedBundles[neg.bundleId] && (
                              <div className="ud-neg-bundle-items">
                                {expandedBundles[neg.bundleId].map((bi) => (
                                  <div key={bi.listingId} className="ud-neg-bundle-item">
                                    {bi.listing?.imageUrl ? (
                                      <img src={resolveMediaUrl(bi.listing.imageUrl)} alt={bi.listing.title} className="ud-neg-bundle-item-img" />
                                    ) : (
                                      <div className="ud-neg-bundle-item-img-ph">{bi.listing?.type === 'SERVICE' ? '🛠' : '📦'}</div>
                                    )}
                                    <div className="ud-neg-bundle-item-info">
                                      <span className="ud-neg-bundle-item-title">{bi.listing?.title ?? 'Article'}</span>
                                      <span className="ud-neg-bundle-item-detail">x{bi.quantity} — {((bi.listing?.priceUsdCents ?? 0) / 100).toFixed(2)} $</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="ud-neg-inline-actions">
                          {canRespond && (
                            <button type="button" className="ud-neg-respond-btn" onClick={() => setRespondNeg(neg)}>
                              🤝 {t('user.respondBtn')}
                            </button>
                          )}
                          {canCancel && (
                            <button
                              type="button"
                              className="ud-neg-cancel-btn"
                              disabled={cancelNegBusyId === neg.id}
                              onClick={() => void handleCancelNegotiation(neg.id)}
                            >
                              {cancelNegBusyId === neg.id ? '...' : `✕ ${t('user.cancelNegBtn')}`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Bloc panier ── */}
            <div className="ud-commerce-panel">
              <div className="ud-commerce-panel-head">
                <h3 className="ud-commerce-panel-title">🛒 {t('cart.title')}</h3>
              </div>
              {loadingCommerce ? (
                <div className="ud-ord-loading">
                  <span className="ud-ord-loading-spinner" />
                  <span>{t('user.loadingCart')}</span>
                </div>
              ) : buyerCart && buyerCart.items.length > 0 ? (
                <>
                  <div className="ud-ord-cart-grid">
                    {buyerCart.items.map((item) => (
                      <article key={item.id} className="ud-ord-card ud-ord-card--cart">
                        <div className="ud-ord-card-header">
                          <span className="ud-ord-card-id">{item.listing.type === 'SERVICE' ? '🛠' : '📦'} {item.listing.title}</span>
                          <span className={statusClass(item.itemState === 'MARCHANDAGE' ? 'PENDING' : 'CONFIRMED')}>
                            {item.itemState === 'MARCHANDAGE' ? `🤝 ${t('user.marchandage')}` : `📦 ${t('user.commandeLabel')}`}
                          </span>
                        </div>
                        <div className="ud-ord-card-body">
                          <p className="ud-ord-card-meta">{item.listing.category} · {item.listing.city}</p>
                          <p className="ud-ord-card-meta">{t('user.vendeurLabel')}: {item.listing.owner.displayName}</p>
                          <p className="ud-ord-card-amount">{money(item.lineTotalUsdCents)}</p>
                        </div>
                        <div className="ud-ord-card-actions ud-ord-card-actions--cart">
                          <button type="button" className="ud-ord-action ud-ord-action--confirm" disabled={cartBusy} onClick={() => void handleCartQuantity(item.id, item.quantity - 1)}>−</button>
                          <span className="ud-ord-cart-qty">{item.quantity}</span>
                          <button type="button" className="ud-ord-action ud-ord-action--confirm" disabled={cartBusy} onClick={() => void handleCartQuantity(item.id, item.quantity + 1)}>+</button>
                          {!item.negotiationId && (
                            <>
                              <input
                                className="ud-ord-cart-price-input"
                                type="number"
                                min={0}
                                value={draftItemPrices[item.id] ?? String(item.unitPriceUsdCents)}
                                onChange={(event) => setDraftItemPrices((prev) => ({ ...prev, [item.id]: event.target.value }))}
                              />
                              <button type="button" className="ud-ord-action ud-ord-action--confirm" disabled={cartBusy} onClick={() => void handleCartPriceSave(item.id)}>💲</button>
                            </>
                          )}
                          <button type="button" className="ud-ord-action ud-ord-action--danger" disabled={cartBusy} onClick={() => void handleCartRemove(item.id)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {hasNegotiatingItems && (
                    <div className="ud-neg-empty" style={{ marginTop: '10px' }}>
                      <span style={{ fontSize: '1.4rem' }}>🤝</span>
                      <p>{t('user.negItemsHint')}</p>
                    </div>
                  )}
                  <div className="ud-ord-cart-footer">
                    <span className="ud-ord-cart-total">Total: {money(buyerCart.subtotalUsdCents)}</span>
                    <button type="button" className="ud-art-publish-btn" disabled={checkoutBusy || cartBusy || hasNegotiatingItems} onClick={handleOpenCheckoutModal}>
                      {checkoutBusy ? t('user.validating') : hasNegotiatingItems ? t('negotiation.inProgress') : t('user.validateOrder')}
                    </button>
                  </div>
                </>
              ) : !loadingCommerce ? (
                <div className="ud-neg-empty">
                  <span style={{ fontSize: '2rem' }}>🛒</span>
                  <p>{t('user.cartEmptyExplorer')} <Link to="/explorer">{t('user.promoExplorer')}</Link>.</p>
                </div>
              ) : null}
            </div>

            {/* ── Bloc commandes acheteur ── */}
            <div className="ud-commerce-panel">
              <div className="ud-commerce-panel-head">
                <h3 className="ud-commerce-panel-title">📦 {t('user.buyerOrders')}</h3>
              </div>
              <div className="ud-ord-filters">
                {(['' , 'PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELED'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`ud-ord-filter-btn${purchasesFilter === f ? ' active' : ''}`}
                    onClick={() => setPurchasesFilter(f as OrderStatus | '')}
                  >
                    {f === '' ? `🗂 ${t('user.filterAll')}` : f === 'PENDING' ? `⏳ ${t('user.filterPending')}` : f === 'CONFIRMED' ? `✅ ${t('user.filterConfirmed')}` : f === 'PROCESSING' ? `🔧 ${t('user.filterProcessing')}` : f === 'SHIPPED' ? `🚚 ${t('user.filterShipped')}` : f === 'DELIVERED' ? `✔ ${t('user.filterDelivered')}` : `❌ ${t('user.filterCanceled')}`}
                  </button>
                ))}
              </div>

              {loadingCommerce ? null : filteredBuyerOrders.length === 0 ? (
                <div className="ud-ord-empty">
                  <span className="ud-ord-empty-icon">📭</span>
                  <p>{t('user.noOrdersBuyerMsg')}{purchasesFilter ? ` ${t('user.withStatus')} "${statusLabel(purchasesFilter)}"` : ''}.</p>
                </div>
              ) : (
                <div className="ud-ord-grid">
                  {filteredBuyerOrders.map((order) => (
                    <article key={order.id} className="ud-ord-card">
                      <div className="ud-ord-card-header">
                        <span className="ud-ord-card-id">#{order.id.slice(0, 8).toUpperCase()}</span>
                        <span className={statusClass(order.status)}>{statusLabel(order.status)}</span>
                      </div>
                      <div className="ud-ord-card-body">
                        <p className="ud-ord-card-amount">{money(order.totalUsdCents)}</p>
                        <p className="ud-ord-card-meta">{order.itemsCount} {order.itemsCount > 1 ? t('user.articlesLabel') : t('user.articleLabel')} · {new Date(order.createdAt).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <div className="ud-ord-card-actions">
                        <button type="button" className="ud-ord-action ud-ord-action--detail" title={t('user.orderDetailLabel')} onClick={() => void handleOrderDetail(order.id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                        </button>
                        {(order.status === 'PROCESSING' || order.status === 'SHIPPED') && (
                          <button
                            type="button"
                            className="ud-ord-action ud-ord-action--confirm"
                            title={t('user.confirmReceptionTooltip')}
                            onClick={() => {
                              setBuyerConfirmOrderId(order.id);
                              setBuyerConfirmCode('');
                              setBuyerConfirmMode('manual');
                              setBuyerConfirmScanMessage(null);
                              setBuyerConfirmScanError(null);
                            }}
                          >
                            📬 {t('user.confirmReceptionShort')}
                          </button>
                        )}
                        {order.status === 'DELIVERED' && !reviewedOrders.has(order.id) && (
                          <button
                            type="button"
                            className="ud-ord-action ud-ord-action--confirm"
                            title="Laisser un avis"
                            onClick={() => { setReviewModalOrder({ orderId: order.id }); setReviewRating(5); setReviewText(''); }}
                          >
                            ⭐ Avis
                          </button>
                        )}
                        {order.status === 'DELIVERED' && reviewedOrders.has(order.id) && (
                          <span style={{ fontSize: '.75rem', color: 'var(--color-primary)', padding: '4px 8px' }}>✓ Avis envoyé</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {/* ── Détail commande sélectionnée ── */}
              {selectedOrder && (
                <section className="ud-ord-detail">
                  <div className="ud-ord-detail-head">
                    <h3>Détail — #{selectedOrder.id.slice(0, 8).toUpperCase()}</h3>
                    <span className={statusClass(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</span>
                    <span className="ud-ord-detail-total">{money(selectedOrder.totalUsdCents)}</span>
                  </div>
                  <ul className="ud-ord-detail-items">
                    {selectedOrder.items.map((item) => (
                      <li key={item.id} className="ud-ord-detail-item">
                        <span className="ud-ord-detail-icon">{item.listingType === 'SERVICE' ? '🛠' : '📦'}</span>
                        <div className="ud-ord-detail-info">
                          <strong>{item.title}</strong>
                          <span>{item.category} · {item.city} · x{item.quantity}</span>
                        </div>
                        <span className="ud-ord-detail-price">{money(item.lineTotalUsdCents)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            {/* ── Encarts promo ── */}
            <div className="ud-ord-promos">
              <Link to="/explorer" className="ud-art-promo-card ud-art-promo-card--ia">
                <span className="ud-art-promo-icon">🔍</span>
                <strong>{t('user.promoExplorer')}</strong>
                <span className="ud-art-promo-desc">{t('user.promoExplorerDesc')}</span>
              </Link>
              <Link to="/forfaits" className="ud-art-promo-card ud-art-promo-card--boost">
                <span className="ud-art-promo-icon">⚡</span>
                <strong>{t('user.promoBoostBuy')}</strong>
                <span className="ud-art-promo-desc">{t('user.promoBoostBuyDesc')}</span>
              </Link>
              <Link to="/sokin" className="ud-art-promo-card ud-art-promo-card--medium">
                <span className="ud-art-promo-icon">✦</span>
                <strong>{t('user.promoSokin')}</strong>
                <span className="ud-art-promo-desc">{t('user.promoSokinDesc')}</span>
              </Link>
            </div>
          </div>
        )}

        {/* ── Respond popup ── */}
        {respondNeg && (
          <NegotiationRespondPopup
            negotiation={respondNeg}
            onClose={() => setRespondNeg(null)}
            showAi={showNegAi}
            onUpdated={async () => {
              setRespondNeg(null);
              const role = activeSection === 'sales' ? 'seller' : 'buyer';
              await Promise.all([
                loadNegotiations(negPage, role, negFilter),
                loadCommerce(sellerHistoryPage, buyerHistoryPage)
              ]);
            }}
          />
        )}

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

        {/* ── Review / rating modal ── */}
        {reviewModalOrder && (
          <div className="ud-checkout-modal-overlay" onClick={() => setReviewModalOrder(null)}>
            <div className="ud-checkout-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <h3>⭐ Laisser un avis</h3>
              <p className="ud-checkout-modal-help">Commande #{reviewModalOrder.orderId.slice(0, 8).toUpperCase()}</p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '12px 0' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setReviewRating(n)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.6rem',
                      opacity: reviewRating >= n ? 1 : 0.3,
                      transform: reviewRating >= n ? 'scale(1.15)' : 'scale(1)',
                      transition: 'all .15s ease',
                    }}
                  >⭐</button>
                ))}
              </div>
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Votre commentaire (optionnel)…"
                maxLength={500}
                rows={3}
                style={{ width: '100%', borderRadius: 8, padding: 10, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--glass-border-color)', resize: 'vertical' }}
              />
              <div className="ud-checkout-modal-actions" style={{ marginTop: 12 }}>
                <button type="button" onClick={() => setReviewModalOrder(null)}>Annuler</button>
                <button
                  type="button"
                  className="ud-art-publish-btn"
                  disabled={reviewBusy || reviewRating < 1}
                  onClick={() => void handleSubmitOrderReview()}
                >
                  {reviewBusy ? '⏳ Envoi…' : '✓ Publier mon avis'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Buyer confirm delivery popup ── */}
        {buyerConfirmOrderId && (
          <div className="ud-checkout-modal-overlay" onClick={() => {
            setBuyerConfirmOrderId(null);
            setBuyerConfirmCode('');
            setBuyerConfirmMode('manual');
            setBuyerConfirmScanMessage(null);
            setBuyerConfirmScanError(null);
          }}>
            <div className="ud-checkout-modal" onClick={(e) => e.stopPropagation()}>
              <h3>📬 {t('user.buyerConfirmTitle')}</h3>
              <p className="ud-checkout-modal-help">{t('user.buyerConfirmHelp2')}</p>
              <div className="ud-validation-mode-switch">
                <button
                  type="button"
                  className={`ud-validation-mode-btn${buyerConfirmMode === 'manual' ? ' ud-validation-mode-btn--active' : ''}`}
                  onClick={() => {
                    setBuyerConfirmMode('manual');
                    setBuyerConfirmScanError(null);
                  }}
                >
                  {t('user.validationManualTab')}
                </button>
                <button
                  type="button"
                  className={`ud-validation-mode-btn${buyerConfirmMode === 'scan' ? ' ud-validation-mode-btn--active' : ''}`}
                  onClick={() => {
                    setBuyerConfirmMode('scan');
                    setBuyerConfirmScanMessage(null);
                    setBuyerConfirmScanError(null);
                  }}
                >
                  {t('user.validationScanTab')}
                </button>
              </div>
              {buyerConfirmMode === 'scan' && (
                <div className="ud-validation-scan-panel">
                  <p className="ud-checkout-modal-help">{t('user.validationQrScanHint')}</p>
                  <div id="ks-order-validation-reader" className="ud-validation-scanner" />
                  {buyerConfirmScanMessage && <p className="ud-validation-scan-message">{buyerConfirmScanMessage}</p>}
                  {buyerConfirmScanError && <p className="ud-validation-scan-error">{buyerConfirmScanError}</p>}
                </div>
              )}
              <label className="ud-checkout-modal-field">
                <span>{t('user.validationCodeLabel')}</span>
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
                <p className="ud-validation-scan-message">{buyerConfirmScanMessage}</p>
              )}
              {buyerConfirmScanError && buyerConfirmMode === 'manual' && (
                <p className="ud-validation-scan-error">{buyerConfirmScanError}</p>
              )}
              <div className="ud-checkout-modal-actions">
                <button type="button" onClick={() => {
                  setBuyerConfirmOrderId(null);
                  setBuyerConfirmCode('');
                  setBuyerConfirmMode('manual');
                  setBuyerConfirmScanMessage(null);
                  setBuyerConfirmScanError(null);
                }}>{t('common.cancel')}</button>
                <button
                  type="button"
                  className="ud-art-publish-btn"
                  disabled={buyerConfirmBusy || !buyerConfirmCode.trim()}
                  onClick={() => void handleBuyerConfirm()}
                >
                  {buyerConfirmBusy ? t('user.validationLabel') : `✅ ${t('user.confirmReception')}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {checkoutModalOpen && (
          <div className="ud-checkout-modal-overlay" onClick={() => setCheckoutModalOpen(false)}>
            <div className="ud-checkout-modal" onClick={(e) => e.stopPropagation()}>
              <h3>{t('user.confirmCheckoutBtn')}</h3>
              <p className="ud-checkout-modal-help">{t('user.checkoutHelpText')}</p>

              {hasProductItems && (
                <label className="ud-checkout-modal-field">
                  <span>{t('user.deliveryAddrLabel2')}</span>
                  <textarea
                    rows={2}
                    value={checkoutForm.deliveryAddress}
                    onChange={(e) => setCheckoutForm((prev) => ({ ...prev, deliveryAddress: e.target.value }))}
                    placeholder={t('user.deliveryPlaceholder')}
                  />
                </label>
              )}

              {hasServiceItems && (
                <>
                  <label className="ud-checkout-modal-field">
                    <span>{t('user.maintenanceAddrLabel2')}</span>
                    <textarea
                      rows={2}
                      value={checkoutForm.serviceMaintenanceAddress}
                      onChange={(e) => setCheckoutForm((prev) => ({ ...prev, serviceMaintenanceAddress: e.target.value }))}
                      placeholder={t('user.maintenancePlaceholder')}
                    />
                  </label>
                  <label className="ud-checkout-modal-field">
                    <span>{t('user.executionAddrLabel2')}</span>
                    <textarea
                      rows={2}
                      value={checkoutForm.serviceExecutionAddress}
                      onChange={(e) => setCheckoutForm((prev) => ({ ...prev, serviceExecutionAddress: e.target.value }))}
                      placeholder={t('user.executionPlaceholder')}
                    />
                  </label>
                </>
              )}

              <label className="ud-checkout-modal-field">
                <span>{t('user.paymentLabel')}</span>
                <select
                  value={checkoutForm.paymentMethod}
                  onChange={(e) => setCheckoutForm((prev) => ({ ...prev, paymentMethod: e.target.value as 'CARD' | 'PAYPAL' | 'MPESA' | 'ORANGE_MONEY' | 'CASH_ON_DELIVERY' }))}
                >
                  <option value="CARD">{t('user.paymentCard')}</option>
                  <option value="PAYPAL">{t('user.paymentPaypal')}</option>
                  <option value="MPESA">{t('user.paymentMpesa')}</option>
                  <option value="ORANGE_MONEY">{t('user.paymentOrange')}</option>
                  <option value="CASH_ON_DELIVERY">{t('user.paymentCash')}</option>
                </select>
              </label>

              <label className="ud-checkout-modal-field">
                <span>{t('user.noteLabel')}</span>
                <textarea
                  rows={2}
                  value={checkoutForm.additionalNote}
                  onChange={(e) => setCheckoutForm((prev) => ({ ...prev, additionalNote: e.target.value }))}
                  placeholder={t('user.notePlaceholder')}
                />
              </label>

              <div className="ud-checkout-modal-actions">
                <button type="button" className="ud-quick-btn" onClick={() => setCheckoutModalOpen(false)} disabled={checkoutBusy}>{t('common.cancel')}</button>
                <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => void handleSubmitCheckoutModal()} disabled={checkoutBusy}>
                  {checkoutBusy ? t('user.validationLabel') : `✅ ${t('user.confirmCheckoutBtn')}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'messages' && (
          <div className="ud-section animate-fade-in">
            <div className="ud-messaging-stage">
              <DashboardMessaging />
            </div>
          </div>
        )}

        {activeSection === 'contacts' && (
          <DashboardContactsSection t={t} userId={user?.id ?? ''} />
        )}
        {activeSection === 'sokin' && (
          <div className="ud-section animate-fade-in">
            <section className="ud-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">✦ {t('user.sokinTitle')}</h2>
                <Link to="/sokin" className="ud-panel-see-all">{t('user.sokinOpenLink')}</Link>
              </div>
              <p className="ud-placeholder-text" style={{ margin: '8px 0 0', fontSize: '0.84rem' }}>
                {t('user.sokinDesc')}
              </p>
            </section>

            {/* Stats rapides */}
            <div className="ud-stats-row">
              <article className="ud-stat-card">
                <span className="ud-stat-icon">📢</span>
                <div><strong className="ud-stat-val">{articlesStats?.active ?? 0}</strong><span className="ud-stat-label">{t('user.sokinActiveLabel')}</span></div>
              </article>
              <article className="ud-stat-card">
                <span className="ud-stat-icon">📦</span>
                <div><strong className="ud-stat-val">{myArticles.filter(a => a.type === 'PRODUIT').length}</strong><span className="ud-stat-label">{t('user.sokinProducts')}</span></div>
              </article>
              <article className="ud-stat-card">
                <span className="ud-stat-icon">🛠️</span>
                <div><strong className="ud-stat-val">{myArticles.filter(a => a.type === 'SERVICE').length}</strong><span className="ud-stat-label">{t('user.sokinServices')}</span></div>
              </article>
              <article className="ud-stat-card">
                <span className="ud-stat-icon">💰</span>
                <div><strong className="ud-stat-val">{myArticles.length}</strong><span className="ud-stat-label">{t('user.sokinTotalPublished')}</span></div>
              </article>
            </div>

            {/* Actions rapides */}
            <section className="ud-glass-panel">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => setActiveSection('articles')}>
                  ➕ {t('user.sokinPublishBtn')}
                </button>
                <Link to="/sokin" className="ud-quick-btn">✦ {t('user.sokinFeedBtn')}</Link>
                <Link to="/explorer" className="ud-quick-btn">🔍 {t('user.promoExplorer')}</Link>
              </div>
            </section>

            {/* Liste des annonces avec engagement */}
            <section className="ud-glass-panel">
              <h3 className="ud-panel-title" style={{ fontSize: '1rem', marginBottom: 16 }}>{t('user.sokinAnnouncements')}</h3>
              {myArticles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 12 }}>✦</span>
                  <p className="ud-placeholder-text">{t('user.sokinNoAnnounce')}</p>
                  <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={() => setActiveSection('articles')}>
                    🧩 {t('user.sokinFirstPublish')}
                  </button>
                </div>
              ) : (
                <div className="ud-sokin-list">
                  {myArticles.map((article) => (
                    <article key={article.id} className="ud-sokin-card">
                      <div className="ud-sokin-card-visual">
                        {article.imageUrl ? (
                          <img src={resolveMediaUrl(article.imageUrl)} alt={article.title} className="ud-sokin-card-img" />
                        ) : (
                          <div className="ud-sokin-card-placeholder">{article.type === 'SERVICE' ? '🛠️' : '📦'}</div>
                        )}
                      </div>
                      <div className="ud-sokin-card-body">
                        <h4 className="ud-sokin-card-title">{article.title}</h4>
                        <p className="ud-sokin-card-meta">{article.category} · {article.city}</p>
                        <p className="ud-sokin-card-price">
                          {formatPriceLabelFromUsdCents(article.priceUsdCents)}
                        </p>
                      </div>
                      <div className="ud-sokin-card-engagement">
                        <span className={`ud-badge${article.status === 'ACTIVE' ? ' ud-badge--done' : ''}`} style={{ fontSize: '0.7rem' }}>
                          {article.status === 'ACTIVE' ? 'Active' : article.status === 'INACTIVE' ? 'Inactive' : article.status}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Encarts promo */}
            <div className="ud-ord-promos">
              <Link to="/sokin" className="ud-art-promo-card ud-art-promo-card--medium">
                <span className="ud-art-promo-icon">✦</span>
                <strong>{t('user.sokinFeedPromo')}</strong>
                <span className="ud-art-promo-desc">{t('user.sokinFeedPromoDesc')}</span>
              </Link>
              <Link to="/explorer" className="ud-art-promo-card ud-art-promo-card--ia">
                <span className="ud-art-promo-icon">🔍</span>
                <strong>{t('user.promoExplorer')}</strong>
                <span className="ud-art-promo-desc">{t('user.sokinExplorerPromoDesc')}</span>
              </Link>
              <Link to="/forfaits" className="ud-art-promo-card ud-art-promo-card--boost">
                <span className="ud-art-promo-icon">⚡</span>
                <strong>{t('user.sokinBoostPromo')}</strong>
                <span className="ud-art-promo-desc">{t('user.sokinBoostPromoDesc')}</span>
              </Link>
            </div>
          </div>
        )}

        {activeSection === 'public-profile' && (
          <div className="ud-section animate-fade-in">
            {loadingPublicProfile ? (
              <section className="ud-glass-panel" style={{ textAlign: 'center', padding: '48px 24px' }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: 12 }}>⏳</span>
                <p className="ud-placeholder-text">{t('user.ppLoading')}</p>
              </section>
            ) : (
            <>
            {/* ── En-tête avec lien + sauvegarde ── */}
            <section className="ud-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">🎨 {t('user.ppTitle')}</h2>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {ppSaveMsg && <span style={{ fontSize: '0.82rem', color: ppSaveMsg.startsWith('✅') ? 'var(--color-success, #4caf50)' : 'var(--color-error, #f44)' }}>{ppSaveMsg}</span>}
                  <button
                    type="button"
                    className="ud-quick-btn ud-quick-btn--primary"
                    disabled={ppSaving}
                    onClick={async () => {
                      setPpSaving(true);
                      setPpSaveMsg(null);
                      try {
                        await usersApi.updateMe({
                          displayName: ppDisplayName || undefined,
                          city: ppCity || undefined,
                          country: ppCountry || undefined,
                          bio: ppBio || undefined,
                          domain: ppDomain || undefined,
                          qualification: ppQualification || undefined,
                          experience: ppExperience || undefined,
                          workHours: ppWorkHours || undefined,
                          locationVisibility: ppLocationVisibility || undefined,
                        });
                        setPpSaveMsg(`✅ ${t('user.ppSaved')}`);
                        setTimeout(() => setPpSaveMsg(null), 3000);
                      } catch {
                        setPpSaveMsg(`❌ ${t('user.ppSaveError')}`);
                        setTimeout(() => setPpSaveMsg(null), 4000);
                      } finally {
                        setPpSaving(false);
                      }
                    }}
                  >
                    {ppSaving ? `⏳ ${t('user.ppSaving')}` : `💾 ${t('user.ppSaveBtn')}`}
                  </button>
                  {user.profile.username ? (
                    <a href={`/user/${encodeURIComponent(user.profile.username)}`} className="ud-quick-btn" target="_blank" rel="noopener noreferrer">{t('user.ppViewResult')}</a>
                  ) : null}
                </div>
              </div>
              <p className="ud-placeholder-text" style={{ margin: '8px 0 0', fontSize: '0.84rem' }}>
                {t('user.ppDesc')}
              </p>
            </section>

            {/* ── Layout 2 colonnes: Éditeur + Aperçu ── */}
            <div className="ud-pp-layout">
              {/* ── Col gauche: Tous les champs éditables ── */}
              <div className="ud-pp-editor">
                {/* ── Photo & Identité ── */}
                <section className="ud-glass-panel ud-pp-section">
                  <div className="ud-pp-section-head">
                    <span className="ud-pp-section-icon">📸</span>
                    <h3 className="ud-pp-section-title">{t('user.ppPhotoTitle')}</h3>
                  </div>
                  <div className="ud-pp-identity-card">
                    <div className="ud-pp-avatar-wrap" onClick={() => setActiveSection('settings')} title={t('user.ppEditPhotoHint')}>
                      {user.profile.avatarUrl ? (
                        <img src={resolveMediaUrl(user.profile.avatarUrl)} alt={displayName} className="ud-pp-avatar-img" />
                      ) : (
                        <span className="ud-pp-avatar-placeholder">{displayName.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                      )}
                      <span className="ud-pp-avatar-edit">✏️</span>
                    </div>
                    <div className="ud-pp-identity-info" style={{ flex: 1 }}>
                      <div className="ud-pp-field-group">
                        <label className="ud-pp-field-label">{t('user.ppDisplayNameLabel')}</label>
                        <input
                          type="text"
                          className="ud-input"
                          value={ppDisplayName}
                          onChange={(e) => setPpDisplayName(e.target.value)}
                          placeholder={t('user.ppDisplayNamePlaceholder')}
                        />
                      </div>
                      <span className="ud-pp-username-line">{user.profile.username ? `@${user.profile.username}` : `— ${t('user.ppAddPseudo')}`}</span>
                    </div>
                  </div>
                </section>

                {/* ── Localisation ── */}
                <section className="ud-glass-panel ud-pp-section">
                  <div className="ud-pp-section-head">
                    <span className="ud-pp-section-icon">📍</span>
                    <h3 className="ud-pp-section-title">{t('user.ppLocationTitle')}</h3>
                  </div>
                  <div className="ud-pp-field-row" style={{ flexDirection: 'column', gap: 10 }}>
                    <div className="ud-pp-field-group" style={{ width: '100%' }}>
                      <label className="ud-pp-field-label">{t('user.ppCityLabel')}</label>
                      <LocationPicker
                        value={ppCity ? { lat: 0, lng: 0, address: ppCity } : undefined}
                        onChange={({ city, address }) => { setPpCity(city || address); }}
                        onStructuredChange={(loc) => {
                          setPpCity(loc.city || loc.formattedAddress);
                          setPpCountry(loc.country || '');
                        }}
                        placeholder="Ex: Kinshasa, Gombe"
                      />
                    </div>
                    <div className="ud-pp-field-row">
                      <div className="ud-pp-field-group" style={{ flex: 1 }}>
                        <label className="ud-pp-field-label">{t('user.ppCityLabel')}</label>
                        <input type="text" className="ud-input" value={ppCity} readOnly style={{ opacity: 0.6 }} />
                      </div>
                      <div className="ud-pp-field-group" style={{ flex: 1 }}>
                        <label className="ud-pp-field-label">{t('user.ppCountryLabel')}</label>
                        <input type="text" className="ud-input" value={ppCountry} readOnly style={{ opacity: 0.6 }} />
                      </div>
                    </div>
                    <VisibilitySelector
                      value={ppLocationVisibility}
                      onChange={(v) => setPpLocationVisibility(v)}
                      hideExact
                    />
                  </div>
                </section>

                {/* ── Bio / Description ── */}
                <section className="ud-glass-panel ud-pp-section">
                  <div className="ud-pp-section-head">
                    <span className="ud-pp-section-icon">💬</span>
                    <h3 className="ud-pp-section-title">{t('user.ppBioTitle')}</h3>
                  </div>
                  <textarea
                    className="ud-input ud-pp-bio-textarea"
                    value={ppBio}
                    onChange={(e) => setPpBio(e.target.value)}
                    placeholder={t('user.ppBioPlaceholder')}
                    rows={3}
                  />
                  <span className="ud-pp-char-count">{ppBio.length}/500</span>
                </section>

                {/* ── Informations professionnelles ── */}
                <section className="ud-glass-panel ud-pp-section">
                  <div className="ud-pp-section-head">
                    <span className="ud-pp-section-icon">💼</span>
                    <h3 className="ud-pp-section-title">{t('user.ppProInfoTitle')}</h3>
                  </div>
                  <div className="ud-pp-field-grid">
                    <div className="ud-pp-field-group">
                      <label className="ud-pp-field-label">{t('user.ppDomainLabel')}</label>
                      <input type="text" className="ud-input" value={ppDomain} onChange={(e) => setPpDomain(e.target.value)} placeholder="Ex: Tech, Mode, Services business..." />
                    </div>
                    <div className="ud-pp-field-group">
                      <label className="ud-pp-field-label">{t('user.ppQualifLabel')}</label>
                      <input type="text" className="ud-input" value={ppQualification} onChange={(e) => setPpQualification(e.target.value)} placeholder="Ex: Sourcing digital & relation client" />
                    </div>
                    <div className="ud-pp-field-group">
                      <label className="ud-pp-field-label">{t('user.ppExpLabel')}</label>
                      <input type="text" className="ud-input" value={ppExperience} onChange={(e) => setPpExperience(e.target.value)} placeholder="Ex: 6 ans" />
                    </div>
                    <div className="ud-pp-field-group">
                      <label className="ud-pp-field-label">{t('user.ppWorkHoursLabel')}</label>
                      <input type="text" className="ud-input" value={ppWorkHours} onChange={(e) => setPpWorkHours(e.target.value)} placeholder="Ex: 08h00 - 20h00" />
                    </div>
                  </div>
                </section>

                {/* ── Sections visibles (toggles) ── */}
                <section className="ud-glass-panel ud-pp-section">
                  <div className="ud-pp-section-head">
                    <span className="ud-pp-section-icon">👁️</span>
                    <h3 className="ud-pp-section-title">{t('user.ppVisibleTitle')}</h3>
                  </div>
                  <div className="ud-pp-toggles">
                    <label className="ud-pp-toggle-row">
                      <span>📊 {t('user.ppToggleStats')}</span>
                      <label className="ud-pp-toggle">
                        <input type="checkbox" checked={ppShowStats} onChange={(e) => setPpShowStats(e.target.checked)} />
                        <span className="ud-pp-toggle-slider" />
                      </label>
                    </label>
                    <label className="ud-pp-toggle-row">
                      <span>📍 {t('user.ppToggleAddress')}</span>
                      <label className="ud-pp-toggle">
                        <input type="checkbox" checked={ppShowAddress} onChange={(e) => setPpShowAddress(e.target.checked)} />
                        <span className="ud-pp-toggle-slider" />
                      </label>
                    </label>
                    <label className="ud-pp-toggle-row">
                      <span>🧩 {t('user.ppToggleListings')}</span>
                      <label className="ud-pp-toggle">
                        <input type="checkbox" checked={ppShowListings} onChange={(e) => setPpShowListings(e.target.checked)} />
                        <span className="ud-pp-toggle-slider" />
                      </label>
                    </label>
                  </div>
                </section>
              </div>

              {/* ── Col droite: Aperçu live ── */}
              <div className="ud-pp-preview">
                <div className="ud-pp-preview-header">
                  <span className="ud-pp-preview-badge">👁️ {t('user.ppPreviewBadge')}</span>
                </div>
                <div className="ud-pp-preview-card">
                  {/* Hero mini */}
                  <div className="ud-pp-prev-hero">
                    <div className="ud-pp-prev-avatar">
                      {user.profile.avatarUrl ? (
                        <img src={resolveMediaUrl(user.profile.avatarUrl)} alt="" />
                      ) : (
                        <span>{(ppDisplayName || displayName).split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                      )}
                      <span className="ud-pp-prev-status" />
                    </div>
                    <div className="ud-pp-prev-info">
                      <strong className="ud-pp-prev-name">{ppDisplayName || displayName}</strong>
                      <span className="ud-pp-prev-username">{user.profile.username ? `@${user.profile.username}` : ''}</span>
                      <span className="ud-pp-prev-domain">{ppDomain || t('user.ppDomainDefault')}</span>
                      <div className="ud-pp-prev-pills">
                        <span className="ud-pp-prev-pill">📍 {ppCity || 'Ville'}</span>
                      </div>
                    </div>
                  </div>
                  {/* Stats mini */}
                  {ppShowStats && (
                    <div className="ud-pp-prev-stats">
                      <div className="ud-pp-prev-stat"><strong>{publicProfile?.listings.length ?? 0}</strong><span>{t('user.ppPreviewArticles')}</span></div>
                      <div className="ud-pp-prev-stat"><strong>0</strong><span>{t('user.ppPreviewVentes')}</span></div>
                      <div className="ud-pp-prev-stat"><strong>—</strong><span>{t('user.ppPreviewAvis')}</span></div>
                    </div>
                  )}
                  {/* Bio mini */}
                  {ppBio && <p className="ud-pp-prev-bio">{ppBio}</p>}
                  {/* Facts */}
                  <div className="ud-pp-prev-facts">
                    {ppDomain && <span className="ud-pp-prev-fact-pill">{t('user.ppFactDomain')}: {ppDomain}</span>}
                    {ppQualification && <span className="ud-pp-prev-fact-pill">{t('user.ppFactQualif')}: {ppQualification}</span>}
                    {ppExperience && <span className="ud-pp-prev-fact-pill">{t('user.ppFactExp')}: {ppExperience}</span>}
                    {ppWorkHours && <span className="ud-pp-prev-fact-pill">{t('user.ppFactHoraire')}: {ppWorkHours}</span>}
                  </div>
                  {/* Listings mini */}
                  {ppShowListings && publicProfile && publicProfile.listings.length > 0 && (
                    <div className="ud-pp-prev-listings">
                      <span className="ud-pp-prev-listings-label">📦 {publicProfile.listings.length} {t('user.ppPreviewArticlesVitrine')}</span>
                      <div className="ud-pp-prev-listings-thumbs">
                        {publicProfile.listings.slice(0, 4).map((listing) => (
                          <div key={listing.id} className="ud-pp-prev-thumb">
                            {listing.imageUrl ? <img src={resolveMediaUrl(listing.imageUrl)} alt="" /> : <span>{listing.type === 'SERVICE' ? '🛠️' : '📦'}</span>}
                          </div>
                        ))}
                        {publicProfile.listings.length > 4 && <div className="ud-pp-prev-thumb ud-pp-prev-thumb-more">+{publicProfile.listings.length - 4}</div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="ud-page-header-actions" style={{ marginTop: 12 }}>
              <button type="button" className="ud-quick-btn" onClick={() => setActiveSection('settings')}>⚙ {t('user.ppProfileSettings')}</button>
              <button type="button" className="ud-quick-btn" onClick={() => setActiveSection('articles')}>🧩 {t('user.ppManageArticles')}</button>
            </div>
            </>
            )}
          </div>
        )}

        {activeSection === 'settings' && (
          <div className="ud-section animate-fade-in">
            {/* ── En-tête ── */}
            <section className="ud-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">⚙️ {t('user.settingsTitle')}</h2>
              </div>
              <p className="ud-placeholder-text" style={{ margin: '8px 0 0', fontSize: '0.84rem' }}>
                {t('user.settingsDesc')}
              </p>
            </section>

            <form onSubmit={handleSaveSettings}>
              {/* ── Section: Photo & Identité ── */}
              <section className="ud-glass-panel ud-settings-section">
                <div className="ud-settings-section-head">
                  <span className="ud-settings-section-icon">📸</span>
                  <h3 className="ud-settings-section-title">{t('user.settingsPhotoTitle')}</h3>
                </div>
                <div className="ud-settings-row">
                  <div className="ud-settings-avatar-area">
                    <div className="ud-pp-avatar-wrap" style={{ width: 64, height: 64 }}>
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="avatar" className="ud-pp-avatar-img" />
                      ) : settingsForm.avatarUrl ? (
                        <img src={resolveMediaUrl(settingsForm.avatarUrl)} alt="avatar" className="ud-pp-avatar-img" />
                      ) : (
                        <span className="ud-pp-avatar-placeholder">{displayName.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
                      )}
                    </div>
                    <label className="ud-avatar-upload-btn">
                      📷 {t('user.settingsImportPhoto')}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 10 * 1024 * 1024) {
                            setErrorMessage(t('user.settingsPhotoMaxSize'));
                            return;
                          }
                          if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                          setAvatarFile(file);
                          setAvatarPreview(URL.createObjectURL(file));
                          setSettingsForm((prev) => ({ ...prev, avatarUrl: '' }));
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {avatarPreview ? (
                      <button type="button" className="ud-avatar-remove-btn" onClick={() => {
                        URL.revokeObjectURL(avatarPreview);
                        setAvatarFile(null);
                        setAvatarPreview(null);
                      }}>✕</button>
                    ) : null}
                  </div>
                </div>
                <div className="ud-settings-fields">
                  <label className="ud-settings-field">
                    <span className="ud-settings-field-label">{t('user.settingsFirstName')}</span>
                    <input className="ud-input" value={settingsForm.firstName} onChange={(e) => setSettingsForm((prev) => ({ ...prev, firstName: e.target.value }))} />
                  </label>
                  <label className="ud-settings-field">
                    <span className="ud-settings-field-label">{t('user.settingsLastName')}</span>
                    <input className="ud-input" value={settingsForm.lastName} onChange={(e) => setSettingsForm((prev) => ({ ...prev, lastName: e.target.value }))} />
                  </label>
                  <label className="ud-settings-field">
                    <span className="ud-settings-field-label">{t('user.settingsPseudo')}</span>
                    <input className="ud-input" value={settingsForm.username} onChange={(e) => setSettingsForm((prev) => ({ ...prev, username: e.target.value }))} placeholder={t('user.settingsPseudoPlaceholder')}/>
                  </label>
                </div>
              </section>

              {/* ── Section: Coordonnées ── */}
              <section className="ud-glass-panel ud-settings-section">
                <div className="ud-settings-section-head">
                  <span className="ud-settings-section-icon">📧</span>
                  <h3 className="ud-settings-section-title">{t('user.settingsCoordsTitle')}</h3>
                </div>
                <div className="ud-settings-fields">
                  <label className="ud-settings-field">
                    <span className="ud-settings-field-label">{t('user.settingsEmail')}</span>
                    <input className="ud-input" type="email" value={settingsForm.email} onChange={(e) => setSettingsForm((prev) => ({ ...prev, email: e.target.value }))} />
                  </label>
                  <label className="ud-settings-field">
                    <span className="ud-settings-field-label">{t('user.settingsPhone')}</span>
                    <input className="ud-input" value={settingsForm.phone} onChange={(e) => setSettingsForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="+243..." />
                  </label>
                  <label className="ud-settings-field">
                    <span className="ud-settings-field-label">{t('user.settingsBirthDate')}</span>
                    <input className="ud-input" type="date" value={settingsForm.birthDate} onChange={(e) => setSettingsForm((prev) => ({ ...prev, birthDate: e.target.value }))} />
                  </label>
                </div>
              </section>

              {/* ── Section: Localisation & Adresse ── */}
              <section className="ud-glass-panel ud-settings-section">
                <div className="ud-settings-section-head">
                  <span className="ud-settings-section-icon">📍</span>
                  <h3 className="ud-settings-section-title">{t('user.settingsLocTitle')}</h3>
                </div>
                <div className="ud-settings-fields">
                  <label className="ud-settings-field ud-settings-field--wide">
                    <span className="ud-settings-field-label">{t('user.settingsAddress')}</span>
                    <LocationPicker
                      value={settingsForm.latitude != null ? { lat: settingsForm.latitude, lng: settingsForm.longitude!, address: settingsForm.formattedAddress || settingsForm.city } : undefined}
                      onChange={({ address, city, lat, lng }) => {
                        setSettingsForm((prev) => ({ ...prev, city: city || address, latitude: lat, longitude: lng }));
                      }}
                      onStructuredChange={(loc) => {
                        setSettingsForm((prev) => ({
                          ...prev,
                          city: loc.city || prev.city,
                          country: loc.country || prev.country,
                          countryCode: loc.countryCode || prev.countryCode,
                          region: loc.region || '',
                          district: loc.district || '',
                          formattedAddress: loc.formattedAddress,
                          latitude: loc.latitude,
                          longitude: loc.longitude,
                          placeId: loc.placeId || '',
                          address1: loc.formattedAddress,
                        }));
                      }}
                      placeholder={t('user.settingsAddressPlaceholder')}
                    />
                  </label>
                  <label className="ud-settings-field">
                    <span className="ud-settings-field-label">{t('user.settingsCountry')}</span>
                    <input className="ud-input" value={settingsForm.country} readOnly style={{ opacity: 0.6 }} />
                  </label>
                  <label className="ud-settings-field">
                    <span className="ud-settings-field-label">{t('user.settingsCity')}</span>
                    <input className="ud-input" value={settingsForm.city} readOnly style={{ opacity: 0.6 }} />
                  </label>
                  <div className="ud-settings-field ud-settings-field--wide" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <VisibilitySelector
                      value={settingsForm.locationVisibility}
                      onChange={(v) => setSettingsForm((prev) => ({ ...prev, locationVisibility: v }))}
                      hideExact
                    />
                  </div>
                </div>
              </section>

              <section className="ud-glass-panel ud-settings-section">
                <div className="ud-settings-section-head">
                  <span className="ud-settings-section-icon">👁️</span>
                  <h3 className="ud-settings-section-title">Confidentialité messagerie</h3>
                </div>
                <label className="ud-pp-toggle-row" style={{ marginTop: 6 }}>
                  <span>Afficher mon statut en ligne aux autres utilisateurs</span>
                  <label className="ud-pp-toggle">
                    <input
                      type="checkbox"
                      checked={settingsForm.onlineStatusVisible}
                      onChange={(e) => setSettingsForm((prev) => ({ ...prev, onlineStatusVisible: e.target.checked }))}
                    />
                    <span className="ud-pp-toggle-slider" />
                  </label>
                </label>
                <p className="ud-placeholder-text" style={{ marginTop: 8, fontSize: '0.82rem' }}>
                  Si désactivé, les autres ne verront plus "en ligne" sur tes conversations.
                </p>
              </section>

              <div className="ud-page-header-actions" style={{ marginTop: 12 }}>
                <button type="submit" className="ud-quick-btn ud-quick-btn--primary" disabled={savingSettings}>
                  {savingSettings ? `⏳ ${t('user.settingsSaving')}` : `💾 ${t('user.settingsSaveBtn')}`}
                </button>
              </div>
            </form>

            {/* ── Section: Sécurité ── */}
            <section className="ud-glass-panel ud-settings-section">
              <div className="ud-settings-section-head">
                <span className="ud-settings-section-icon">🔒</span>
                <h3 className="ud-settings-section-title">{t('user.settingsSecurityTitle')}</h3>
              </div>
              <div className="ud-settings-security-grid">
                <DashboardSecurityBlock user={user} t={t} />
              </div>
            </section>

            {/* ── Zone sensible ── */}
            <DashboardAccountDeletion t={t} />

            {/* ── Section: Gestion IA ── */}
            <DashboardAiSettings
              t={t}
              storageKeys={{ advice: SK_AI_ADVICE, autoNego: SK_AI_AUTO_NEGO, commande: SK_AI_COMMANDE }}
              hasIaMarchandPlan={hasIaMarchandPlan}
              hasIaOrderPlan={hasIaOrderPlan}
              autoNegoActive={autoNegoActive}
            />

            {missing.length > 0 ? (
              <section className="ud-glass-panel ud-settings-section">
                <div className="ud-settings-section-head">
                  <span className="ud-settings-section-icon">📋</span>
                  <h3 className="ud-settings-section-title">{t('user.settingsMissingTitle')}</h3>
                </div>
                <div className="ud-settings-missing-list">
                  {missing.map((field) => (
                    <span key={field} className="ud-settings-missing-chip">⚠ {field}</span>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}

        {/* ═══════════════  VERIFICATION BADGE  ═══════════════ */}
        {activeSection === 'verification' && (
          <DashboardVerificationSection t={t} userId={user.id} accountType="USER" />
        )}

        {/* ═══════════════  KIN-SELL ANALYTIQUE  ═══════════════ */}
        {activeSection === 'analytics' && hasAnalytics && (
          <div className="ud-section animate-fade-in">
            <DashboardAnalyticsInsights
              t={t}
              basicInsights={basicInsights}
              deepInsights={deepInsights}
              analyticsLoading={analyticsLoading}
              hasAnalytics={hasAnalytics}
              hasPremiumAnalytics={hasPremiumAnalytics}
              formatMoney={formatMoneyFromUsdCents}
            />
          </div>
        )}

        {/* ═══════════════  ONGLET KIN-SELL  ═══════════════ */}
        {activeSection === 'kinsell' && (
          <div className="ud-section animate-fade-in">
            <section className="ud-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">🧠 Kin-Sell</h2>
              </div>

              {/* Forfait actif */}
              <div style={{ background: 'rgba(111,88,255,0.06)', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid rgba(111,88,255,0.12)' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 15, color: 'var(--color-text-primary, #fff)' }}>📋 Mon forfait</h3>
                {loadingPlan ? (
                  <p style={{ color: 'var(--color-text-secondary, #aaa)', fontSize: 13 }}>Chargement…</p>
                ) : activePlan ? (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 22, fontWeight: 700, color: '#6f58ff' }}>{activePlan.planName}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary, #aaa)', marginLeft: 8 }}>
                        {activePlan.status === 'ACTIVE' ? '✅ Actif' : activePlan.status}
                      </span>
                    </div>
                    {activePlan.priceUsdCents > 0 && (
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary, #aaa)' }}>
                        {(activePlan.priceUsdCents / 100).toFixed(2)}$/mois
                      </span>
                    )}
                    <Link to="/pricing" style={{ fontSize: 12, color: '#6f58ff', fontWeight: 600, textDecoration: 'none' }}>
                      {activePlan.planCode === 'FREE' || activePlan.planCode === 'STARTER' ? '🚀 Passer à un forfait supérieur' : '⚙ Gérer mon forfait'}
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
                    { name: 'IA Marchande', icon: '🤝', desc: 'Aide à la négociation', active: true, locked: false },
                    { name: 'IA Ads', icon: '📢', desc: 'Boost articles & boutique', active: aiAdviceEnabled, locked: false },
                    { name: 'Kin-Sell Analytique', icon: '📊', desc: 'Analyses marché & conseils', active: hasAnalytics, locked: !hasAnalytics },
                    { name: 'IA Commande', icon: '📦', desc: 'Automatisation des ventes', active: aiCommandeEnabled && (activePlan?.features?.includes('IA_ORDER') ?? false), locked: !(activePlan?.features?.includes('IA_ORDER') ?? false) },
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

              {/* Essais IA */}
              {ksTrials.filter(t => t.status === 'PROPOSED' || t.status === 'ACTIVE').length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--color-text-primary, #fff)' }}>🎁 Essais gratuits</h3>
                  {ksTrials.filter(t => t.status === 'PROPOSED' || t.status === 'ACTIVE').map((trial) => (
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
                ) : ksRecommendations.length === 0 ? (
                  <p style={{ color: 'var(--color-text-secondary, #aaa)', fontSize: 13, fontStyle: 'italic' }}>Aucune recommandation en cours. Continuez à vendre pour recevoir des suggestions.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                                    navigate(rec.actionType === 'VIEW_ANALYTICS' ? '/dashboard?tab=analytics' : '/pricing');
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
                            {rec.engineKey === 'ads' ? '📢 Ads' : rec.engineKey === 'analytics' ? '📊 Analytique' : rec.engineKey === 'order' ? '📦 Commande' : '🤖 IA'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CTA Forfaits */}
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <Link to="/pricing" style={{
                  display: 'inline-block', padding: '10px 24px', borderRadius: 10,
                  background: 'linear-gradient(135deg, #6f58ff, #9b7aff)', color: '#fff',
                  fontWeight: 600, fontSize: 14, textDecoration: 'none',
                  boxShadow: '0 4px 16px rgba(111,88,255,0.3)',
                }}>
                  🚀 Voir tous les forfaits
                </Link>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ═══════════════════════════════════════════════════════
          MODALE PUBLICATION / MODIFICATION ARTICLE
          ═══════════════════════════════════════════════════════ */}
      {showCreateForm && (
        <div className="ud-publish-backdrop" onClick={(e) => { if (e.target === e.currentTarget) resetArticleForm(); }}>
          <div className="ud-publish-modal">
            <div className="ud-publish-header">
              <h2 className="ud-publish-title">
                {editingArticle ? `✏️ ${t('publish.editPrefix')} ${editingArticle.title}` : `📝 ${t('publish.publishArticle')}`}
              </h2>
              <button type="button" className="ud-publish-close" onClick={resetArticleForm} aria-label={t('user.cancelLabel')}>✕</button>
            </div>

            {/* ── Progress Steps ── */}
            <div className="ud-publish-steps">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`ud-publish-step${publishStep >= s ? ' active' : ''}${publishStep === s ? ' current' : ''}`}>
                  <span className="ud-publish-step-num">{s}</span>
                  <span className="ud-publish-step-label">{s === 1 ? t('publish.stepTypeInfo') : s === 2 ? t('publish.stepDetailsPrice') : t('publish.stepPhotosValidation')}</span>
                </div>
              ))}
            </div>

            {publishError && (
              <div className="ud-publish-error">
                <span>⚠️</span> {publishError}
              </div>
            )}

            <form onSubmit={editingArticle ? handleArticleUpdate : handleArticleCreate} className="ud-publish-form">
              {/* ── STEP 1: Type & infos de base ── */}
              {publishStep === 1 && (
                <div className="ud-publish-step-content">
                  <div className="ud-publish-type-chooser">
                    <button
                      type="button"
                      className={`ud-publish-type-btn${articleForm.type === 'PRODUIT' ? ' active' : ''}`}
                      onClick={() => setArticleForm(p => ({ ...p, type: 'PRODUIT' }))}
                    >
                      <span className="ud-publish-type-icon">📦</span>
                      <span className="ud-publish-type-label">{t('publish.typeProductLabel')}</span>
                      <span className="ud-publish-type-desc">{t('publish.productDesc')}</span>
                    </button>
                    <button
                      type="button"
                      className={`ud-publish-type-btn${articleForm.type === 'SERVICE' ? ' active' : ''}`}
                      onClick={() => setArticleForm(p => ({ ...p, type: 'SERVICE' }))}
                    >
                      <span className="ud-publish-type-icon">🛠️</span>
                      <span className="ud-publish-type-label">{t('publish.typeServiceLabel')}</span>
                      <span className="ud-publish-type-desc">{t('publish.serviceDesc')}</span>
                    </button>
                  </div>

                  <label className="ud-publish-field">
                    <span className="ud-publish-field-label">{t('publish.articleTitle')} *</span>
                    <input
                      className="ud-input"
                      required
                      minLength={2}
                      maxLength={140}
                      placeholder={articleForm.type === 'PRODUIT' ? 'Ex: iPhone 14 Pro 256GB neuf sous scellé' : 'Ex: Coiffure à domicile - tresses et nattes'}
                      value={articleForm.title}
                      onChange={(e) => setArticleForm(p => ({ ...p, title: e.target.value }))}
                    />
                  </label>

                  <label className="ud-publish-field">
                    <span className="ud-publish-field-label">{t('publish.category')} *</span>
                    <select
                      className="ud-input"
                      required={!noCategoryMatch}
                      disabled={noCategoryMatch}
                      value={articleForm.category}
                      onChange={(e) => setArticleForm(p => ({ ...p, category: e.target.value }))}
                    >
                      <option value="">{t('publish.chooseCategory')}</option>
                      {(articleForm.type === 'PRODUIT' ? PRODUCT_CATEGORIES : SERVICE_CATEGORIES).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </label>

                  <label className="ud-publish-nocat-check">
                    <input
                      type="checkbox"
                      checked={noCategoryMatch}
                      onChange={(e) => {
                        setNoCategoryMatch(e.target.checked);
                        if (e.target.checked) {
                          setArticleForm(p => ({ ...p, category: '' }));
                          setShowSoKinCatPopup(true);
                        } else {
                          setShowSoKinCatPopup(false);
                        }
                      }}
                    />
                    <span>{t('publish.noCategory')}</span>
                  </label>

                  {showSoKinCatPopup && (
                    <div className="ud-publish-sokin-popup">
                      <p className="ud-publish-sokin-popup-text">
                        {t('publish.noCatSokinHint')}
                      </p>
                      <Link
                        to={`/sokin?prefill=${encodeURIComponent(articleForm.title || t('publish.articleTitle'))}`}
                        className="ud-quick-btn ud-quick-btn--primary ud-publish-sokin-link"
                      >
                        📢 {t('publish.publishSokin')}
                      </Link>
                    </div>
                  )}

                  <label className="ud-publish-field">
                    <span className="ud-publish-field-label">{t('publish.description')}</span>
                    <textarea
                      className="ud-input"
                      rows={4}
                      maxLength={1200}
                      placeholder={t('publish.description')}
                      value={articleForm.description}
                      onChange={(e) => setArticleForm(p => ({ ...p, description: e.target.value }))}
                    />
                    <span className="ud-publish-field-hint">{articleForm.description.length}/1200 {t('publish.charsCount')}</span>
                  </label>

                  <div className="ud-publish-nav">
                    <span />
                    <button
                      type="button"
                      className="ud-quick-btn ud-quick-btn--primary"
                      onClick={() => {
                        if (!articleForm.title.trim()) {
                          setPublishError(t('publish.articTitleRequired'));
                          return;
                        }
                        if (!articleForm.category.trim() && !noCategoryMatch) {
                          setPublishError(t('publish.categoryOrCheck'));
                          return;
                        }
                        setPublishError(null);
                        setPublishStep(2);
                      }}
                    >
                      {t('publish.next')} →
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 2: Prix, localisation, détails service ── */}
              {publishStep === 2 && (
                <div className="ud-publish-step-content">
                  <label className="ud-publish-field">
                    <span className="ud-publish-field-label">{t('publish.priceLabel')} *</span>
                    <div className="ud-publish-price-wrap">
                      <span className="ud-publish-price-symbol">FC</span>
                      <input
                        className="ud-input"
                        type="number"
                        min={0}
                        step="1"
                        placeholder="0"
                        value={priceCdf}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setPriceCdf(raw);
                          const cdf = parseInt(raw, 10) || 0;
                          const usdCents = Math.round((cdf / USD_TO_CDF_RATE) * 100);
                          setArticleForm(p => ({ ...p, priceUsdCents: String(usdCents) }));
                        }}
                      />
                    </div>
                    {priceCdf && parseInt(priceCdf, 10) > 0 && (
                      <span className="ud-publish-field-hint">≈ {((parseInt(priceCdf, 10) || 0) / USD_TO_CDF_RATE).toFixed(2)} $ USD</span>
                    )}
                    <span className="ud-publish-field-hint">{t('publish.priceFreeHint')}</span>
                  </label>

                  <div className="ud-publish-row">
                    <label className="ud-publish-field">
                      <span className="ud-publish-field-label">{t('publish.city')} *</span>
                      <LocationPicker
                        value={{ lat: Number(articleForm.latitude), lng: Number(articleForm.longitude), address: articleForm.city }}
                        onChange={({ address, city, lat, lng }) => {
                          setArticleForm(p => ({
                            ...p,
                            city: city || address,
                            latitude: String(lat),
                            longitude: String(lng),
                          }));
                        }}
                        onStructuredChange={(loc) => {
                          setArticleForm(p => ({
                            ...p,
                            city: loc.city || loc.formattedAddress,
                            country: loc.country || '',
                            countryCode: loc.countryCode || '',
                            region: loc.region || '',
                            district: loc.district || '',
                            formattedAddress: loc.formattedAddress,
                            latitude: String(loc.latitude),
                            longitude: String(loc.longitude),
                            placeId: loc.placeId || '',
                          }));
                        }}
                        placeholder="Ex: Kinshasa, Gombe"
                      />
                      {articleForm.type === 'SERVICE' && (
                        <div style={{ marginTop: 8 }}>
                          <label className="ud-publish-field-label" style={{ fontSize: 12 }}>Rayon d'intervention (km)</label>
                          <input
                            className="ud-input"
                            type="number"
                            min={1}
                            max={500}
                            value={articleForm.serviceRadiusKm}
                            onChange={(e) => setArticleForm(p => ({ ...p, serviceRadiusKm: e.target.value }))}
                            placeholder="Ex: 25"
                            style={{ maxWidth: 130 }}
                          />
                        </div>
                      )}
                      <div style={{ marginTop: 8 }}>
                        <VisibilitySelector
                          value={articleForm.locationVisibility}
                          onChange={(v) => setArticleForm(p => ({ ...p, locationVisibility: v }))}
                          hideExact
                        />
                      </div>
                      {settingsForm.city && articleForm.city !== settingsForm.city && (
                        <button
                          type="button"
                          className="ud-publish-prefill-chip"
                          onClick={() => setArticleForm(p => ({ ...p, city: settingsForm.city }))}
                        >
                          📍 {t('publish.useMyAddr')} : {settingsForm.city}
                        </button>
                      )}
                    </label>

                    {articleForm.type === 'PRODUIT' && (
                      <label className="ud-publish-field">
                        <span className="ud-publish-field-label">{t('publish.stock')}</span>
                        <input
                          className="ud-input"
                          type="number"
                          min={0}
                          placeholder="∞ (illimité)"
                          value={articleForm.stockQuantity}
                          onChange={(e) => setArticleForm(p => ({ ...p, stockQuantity: e.target.value }))}
                        />
                      </label>
                    )}
                  </div>

                  {/* ── Champs spécifiques SERVICE ── */}
                  {articleForm.type === 'SERVICE' && (
                    <div className="ud-publish-service-fields">
                      <div className="ud-publish-service-divider">
                        <span>🛠️ {t('publish.serviceDetailsDiv')}</span>
                      </div>

                      <label className="ud-publish-field">
                        <span className="ud-publish-field-label">{t('publish.serviceDuration')}</span>
                        <input
                          className="ud-input"
                          type="number"
                          min={1}
                          placeholder="Ex: 60 pour 1h, 120 pour 2h"
                          value={articleForm.serviceDurationMin}
                          onChange={(e) => setArticleForm(p => ({ ...p, serviceDurationMin: e.target.value }))}
                        />
                        {articleForm.serviceDurationMin && Number(articleForm.serviceDurationMin) > 0 && (
                          <span className="ud-publish-field-hint">
                            ≈ {Number(articleForm.serviceDurationMin) >= 60
                              ? `${Math.floor(Number(articleForm.serviceDurationMin) / 60)}h${Number(articleForm.serviceDurationMin) % 60 > 0 ? `${Number(articleForm.serviceDurationMin) % 60}min` : ''}`
                              : `${articleForm.serviceDurationMin} min`}
                          </span>
                        )}
                      </label>

                      <label className="ud-publish-field">
                        <span className="ud-publish-field-label">{t('publish.serviceLocation')} *</span>
                        <div className="ud-publish-location-chooser">
                          <button
                            type="button"
                            className={`ud-publish-loc-btn${articleForm.serviceLocation === 'SUR_PLACE' ? ' active' : ''}`}
                            onClick={() => setArticleForm(p => ({ ...p, serviceLocation: 'SUR_PLACE' }))}
                          >
                            <span>🏪</span>
                            <span>{t('publish.atMyPlace')}</span>
                            <span className="ud-publish-loc-hint">{t('publish.myPlaceHint')}</span>
                          </button>
                          <button
                            type="button"
                            className={`ud-publish-loc-btn${articleForm.serviceLocation === 'DOMICILE' ? ' active' : ''}`}
                            onClick={() => setArticleForm(p => ({ ...p, serviceLocation: 'DOMICILE' }))}
                          >
                            <span>🏠</span>
                            <span>{t('publish.atHome')}</span>
                            <span className="ud-publish-loc-hint">{t('publish.homeHint')}</span>
                          </button>
                        </div>
                      </label>
                    </div>
                  )}

                  <div className="ud-publish-nav">
                    <button type="button" className="ud-quick-btn" onClick={() => setPublishStep(1)}>← {t('publish.back')}</button>
                    <button
                      type="button"
                      className="ud-quick-btn ud-quick-btn--primary"
                      onClick={() => {
                        if (!articleForm.city.trim()) {
                          setPublishError(t('publish.cityRequired'));
                          return;
                        }
                        setPublishError(null);
                        setPublishStep(3);
                      }}
                    >
                      {t('publish.next')} →
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Photos / vidéo + validation ── */}
              {publishStep === 3 && (
                <div className="ud-publish-step-content">
                  <div className="ud-publish-media-zone">
                    <p className="ud-publish-field-label">📷 {t('publish.mediaTitle')}</p>
                    <p className="ud-publish-field-hint" style={{ marginBottom: '0.75rem' }}>
                      {t('publish.mediaHint')}
                    </p>

                    <div className="ud-publish-media-grid">
                      {uploadPreviews.map((url, i) => {
                        const file = uploadFiles[i];
                        const isVideo = file?.type.startsWith('video/');
                        return (
                          <div key={url} className="ud-publish-media-thumb">
                            {isVideo ? (
                              <video src={url} className="ud-publish-media-img" muted />
                            ) : (
                              <img src={url} alt={`Media ${i + 1}`} className="ud-publish-media-img" />
                            )}
                            <button type="button" className="ud-publish-media-remove" onClick={() => removeUploadFile(i)}>✕</button>
                            {isVideo && <span className="ud-publish-media-badge">🎬 {t('user.videoBadge')}</span>}
                          </div>
                        );
                      })}

                      {uploadFiles.length < 6 && (
                        <label className="ud-publish-media-add">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                            multiple
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                          />
                          <span className="ud-publish-media-add-icon">+</span>
                          <span className="ud-publish-media-add-label">{t('publish.add')}</span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* ── Récapitulatif ── */}
                  <div className="ud-publish-summary">
                    <h3 className="ud-publish-summary-title">{t('publish.summary')}</h3>
                    <div className="ud-publish-summary-grid">
                      <span>{t('publish.summaryType')}</span><strong>{articleForm.type === 'PRODUIT' ? `📦 ${t('publish.typeProductLabel')}` : `🛠️ ${t('publish.typeServiceLabel')}`}</strong>
                      <span>{t('publish.summaryTitre')}</span><strong>{articleForm.title || '–'}</strong>
                      <span>{t('publish.summaryCat')}</span><strong>{articleForm.category || '–'}</strong>
                      <span>{t('publish.summaryPrix')}</span><strong>{priceCdf && parseInt(priceCdf, 10) > 0 ? `${new Intl.NumberFormat('fr-CD').format(parseInt(priceCdf, 10))} FC` : t('publish.summaryPrixLibre')}</strong>
                      <span>{t('publish.summaryVille')}</span><strong>{articleForm.city || '–'}</strong>
                      {articleForm.type === 'PRODUIT' && articleForm.stockQuantity && (
                        <><span>{t('publish.summaryStock')}</span><strong>{articleForm.stockQuantity}</strong></>
                      )}
                      {articleForm.type === 'SERVICE' && articleForm.serviceDurationMin && (
                        <><span>{t('publish.summaryDuration')}</span><strong>{articleForm.serviceDurationMin} min</strong></>
                      )}
                      {articleForm.type === 'SERVICE' && articleForm.serviceLocation && (
                        <><span>{t('publish.summaryLieu')}</span><strong>{articleForm.serviceLocation === 'DOMICILE' ? t('publish.atHome') : t('publish.atMyPlace')}</strong></>
                      )}
                      <span>{t('publish.summaryMedia')}</span><strong>{uploadFiles.length} {t('publish.summaryFichiers')}</strong>
                    </div>
                  </div>

                  <div className="ud-publish-nav">
                    <button type="button" className="ud-quick-btn" onClick={() => setPublishStep(2)}>← {t('publish.back')}</button>
                    <button type="submit" className="ud-quick-btn ud-quick-btn--primary ud-publish-submit" disabled={articleBusy !== null}>
                      {articleBusy ? `⏳ ${t('publish.publishing')}` : editingArticle ? `💾 ${t('publish.saveChanges')}` : `🚀 ${t('publish.submitArticle')}`}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
