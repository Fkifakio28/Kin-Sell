import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { getDashboardPath } from '../../utils/role-routing';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { DashboardMessaging } from './DashboardMessaging';
import {
  ApiError, auth as authApi, businesses, listings, orders, billing, messaging, sokin, invalidateCache, analyticsAi,
  type BusinessAccount, type MyListing, type MyListingsStats,
  type OrderSummary, type BillingPlanSummary, type OrderStatus,
  type SoKinApiPost, type BasicInsights, type DeepInsights,
} from '../../lib/api-client';
import { OrderValidationQrModal } from '../../components/OrderValidationQrModal';
import LocationPicker from '../../components/LocationPicker';
import './dashboard.css';

type BizSection =
  | 'dashboard' | 'boutique' | 'produits' | 'services'
  | 'commandes' | 'clients' | 'messages' | 'contacts'
  | 'avis' | 'sokin' | 'analytics'
  | 'publicite' | 'parametres';

type AbonnementTier = 'based' | 'medium' | 'premium';

/* ─── Helpers devise ───────────────────────────────────────── */
const USD_TO_CDF = 2850;
const toCdf = (usdCents: number) => Math.round((usdCents / 100) * USD_TO_CDF);
const fmtK = (cdf: number) =>
  cdf >= 1_000_000
    ? `${(cdf / 1_000_000).toFixed(1)} M CDF`
    : `${Math.round(cdf / 1_000)} K CDF`;

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
  const { t } = useLocaleCurrency();
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
  const [business, setBusiness] = useState<BusinessAccount | null>(null);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [form, setForm] = useState(INITIAL_BUSINESS_FORM);

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
  const [bizAiAdviceEnabled, setBizAiAdviceEnabled] = useState(() => localStorage.getItem('ks-biz-ai-advice') !== 'off');
  const [bizAiAutoNegoEnabled, setBizAiAutoNegoEnabled] = useState(() => localStorage.getItem('ks-biz-ai-auto-nego') === 'on');
  const [bizAiCommandeEnabled, setBizAiCommandeEnabled] = useState(() => localStorage.getItem('ks-biz-ai-commande') !== 'off');
  const [validationCodeBusyId, setValidationCodeBusyId] = useState<string | null>(null);
  const [sellerValidationQr, setSellerValidationQr] = useState<{ orderId: string; code: string } | null>(null);

  // ─── Boutique ────────────────────────────────────────────
  const [shopSaving, setShopSaving] = useState(false);
  const [shopMsg, setShopMsg] = useState<string | null>(null);
  const [shopForm, setShopForm] = useState({ publicName: '', publicDescription: '', city: '', logo: '', coverImage: '' });

  // ─── Paramètres ──────────────────────────────────────────
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    legalName: '', publicName: '', description: '', city: '',
    avatar: '', address: '',
    shopPhoto1: '', shopPhoto2: '', shopPhoto3: '',
  });
  // Suppression de compte
  const [bzDeleteStep, setBzDeleteStep] = useState<'idle' | 'confirm' | 'reason' | 'done'>('idle');
  const [bzDeleteReason, setBzDeleteReason] = useState('');
  const [bzDeleteBusy, setBzDeleteBusy] = useState(false);
  const [bzDeleteError, setBzDeleteError] = useState<string | null>(null);

  // ─── Page publique ───────────────────────────────────────
  const [pageSaving, setPageSaving] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [pageForm, setPageForm] = useState({ publicName: '', publicDescription: '', city: '', address: '', logo: '', coverImage: '' });

  // ─── Points forts (stockés en localStorage) ──────────────
  type Quality = { id: string; icon: string; name: string; description: string };
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [qualityDraft, setQualityDraft] = useState({ icon: '⭐', name: '', description: '' });

  // ─── Photos boutique physique (localStorage) ─────────────
  const [shopPhotos, setShopPhotos] = useState<string[]>([]);

  // ─── Créer listing ───────────────────────────────────────
  const [createMode, setCreateMode] = useState<'produit' | 'service' | null>(null);
  const [createForm, setCreateForm] = useState({ title: '', category: '', city: 'Kinshasa', priceCdf: '', stock: '', description: '', isNegotiable: true, latitude: -4.3216965, longitude: 15.3124553 });
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // ─── Contacts ────────────────────────────────────────────
  const [contactFilter, setContactFilter] = useState<'all' | 'online' | 'favorites'>('all');
  const [contactSearchOpen, setContactSearchOpen] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<Array<{ id: string; profile: { displayName: string; username: string | null; avatarUrl: string | null; city: string | null } }>>([]);
  const [contactSearching, setContactSearching] = useState(false);

  // ─── Avis (Reviews) ──────────────────────────────────────
  // Les avis sont générés par les acheteurs après livraison. Cette section affiche
  // les avis existants (fonctionnalité système de reviews à implémenter côté back).
  // Pour l'instant : état vide — aucune donnée fictive.

  // ─── So-Kin ──────────────────────────────────────────────
  const [sokinPosts, setSokinPosts] = useState<SoKinApiPost[]>([]);
  const [sokinDraft, setSokinDraft] = useState({ content: '', imageUrl: '' });
  const [sokinPublishing, setSokinPublishing] = useState(false);

  // ─── Helper : lire un fichier local → data URL base64 ───
  const readFileAndSet = (file: File, setter: (dataUrl: string) => void) => {
    if (file.size > 5 * 1024 * 1024) {
      alert(t('biz.fileTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = e => { if (e.target?.result) setter(e.target.result as string); };
    reader.readAsDataURL(file);
  };

  const navItems: { key: BizSection; labelKey: string; icon: string }[] = [
    { key: 'dashboard',    labelKey: 'biz.navDashboard',   icon: '⊞' },
    { key: 'boutique',     labelKey: 'biz.navBoutique',    icon: '🏪' },
    { key: 'produits',     labelKey: 'biz.navProduits',    icon: '📦' },
    { key: 'services',     labelKey: 'biz.navServices',    icon: '🛠️' },
    { key: 'commandes',    labelKey: 'biz.navCommandes',   icon: '🛒' },
    { key: 'clients',      labelKey: 'biz.navClients',     icon: '👥' },
    { key: 'messages',     labelKey: 'biz.navMessages',    icon: '💬' },
    { key: 'contacts',     labelKey: 'biz.navContacts',    icon: '🤝' },
    { key: 'avis',         labelKey: 'biz.navAvis',        icon: '⭐' },
    { key: 'sokin',        labelKey: 'biz.navSokin',       icon: '✦' },
    { key: 'analytics',    labelKey: 'biz.navAnalytics',   icon: '📊' },
    { key: 'publicite',    labelKey: 'biz.navPublicite',   icon: '🎯' },
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
      try {
        const [ordersRes, listingsRes, statsRes, planRes, sokinRes] = await Promise.allSettled([
          orders.sellerOrders({ limit: 50 }),
          listings.mine({ limit: 50 }),
          listings.mineStats(),
          billing.myPlan(),
          sokin.myPosts(),
        ]);
        if (cancelled) return;
        if (ordersRes.status === 'fulfilled') setSellerOrders(ordersRes.value.orders);
        if (listingsRes.status === 'fulfilled') setMyListings(listingsRes.value.listings);
        if (statsRes.status === 'fulfilled') setListingStats(statsRes.value);
        if (planRes.status === 'fulfilled') setMyPlan(planRes.value);
        if (sokinRes.status === 'fulfilled') setSokinPosts(sokinRes.value.posts);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [business]);

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
    });
    setPageForm({
      publicName: business.publicName ?? '',
      publicDescription: business.shop?.publicDescription ?? '',
      city: business.shop?.city ?? '',
      address: business.shop?.address ?? '',
      logo: business.shop?.logo ?? '',
      coverImage: business.shop?.coverImage ?? '',
    });
    // ── Charger points forts & photos boutique depuis localStorage ──
    try {
      const storedQ = localStorage.getItem(`ks-qualities-${business.id}`);
      if (storedQ) setQualities(JSON.parse(storedQ));
      const storedP = localStorage.getItem(`ks-shop-photos-${business.id}`);
      if (storedP) setShopPhotos(JSON.parse(storedP));
    } catch { /* ignore corrupt data */ }
  }, [business]);

  // ─── KPIs calculés ───────────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const delivered = sellerOrders.filter(o => o.status === 'DELIVERED');
    const thisMonth = delivered.filter(o => new Date(o.createdAt) >= monthStart);
    const active = sellerOrders.filter(o => ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(o.status));
    const totalCdf = delivered.reduce((s, o) => s + toCdf(o.totalUsdCents), 0);
    const monthCdf = thisMonth.reduce((s, o) => s + toCdf(o.totalUsdCents), 0);
    const avg = delivered.length > 0 ? Math.round(totalCdf / delivered.length) : 0;
    return { totalCdf, monthCdf, activeCount: active.length, avgCdf: avg };
  }, [sellerOrders]);

  // ─── Clients uniques dérivés des commandes ───────────────
  const clientsData = useMemo(() => {
    const map = new Map<string, { name: string; commandes: number; totalCdf: number }>();
    for (const o of sellerOrders) {
      const prev = map.get(o.buyer.userId) ?? { name: o.buyer.displayName, commandes: 0, totalCdf: 0 };
      map.set(o.buyer.userId, { name: prev.name, commandes: prev.commandes + 1, totalCdf: prev.totalCdf + toCdf(o.totalUsdCents) });
    }
    return Array.from(map.values()).sort((a, b) => b.totalCdf - a.totalCdf);
  }, [sellerOrders]);

  const tier = TIER_LABELS[deriveTier(myPlan?.planCode)];
  const businessName = business?.publicName ?? '';
  const businessLogo = business?.shop?.logo ?? null;
  const businessVerified = Boolean(business?.shop?.active);
  const businessSlug = business?.slug ?? '';
  const produits = myListings.filter(l => l.type === 'PRODUIT');
  const services = myListings.filter(l => l.type === 'SERVICE');

  // ─── Créer un listing ────────────────────────────────────
  const handleCreateListing = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (createBusy || !createMode) return;
    setCreateBusy(true);
    setCreateMsg(null);
    try {
      const priceCdf = parseFloat(createForm.priceCdf.replace(/\s/g, '')) || 0;
      const priceUsdCents = Math.round((priceCdf / USD_TO_CDF) * 100);
      await listings.create({
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
      });
      invalidateCache('/listings/mine');
      setCreateMsg(t('biz.listingSuccess'));
      setCreateForm({ title: '', category: '', city: 'Kinshasa', priceCdf: '', stock: '', description: '', isNegotiable: true, latitude: -4.3216965, longitude: 15.3124553 });
      setCreateMode(null);
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
        logo: shopForm.logo.trim() || undefined,
        coverImage: shopForm.coverImage.trim() || undefined,
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
      const updated = await businesses.updateMe({
        legalName: settingsForm.legalName.trim() || undefined,
        publicName: settingsForm.publicName.trim() || undefined,
        description: settingsForm.description.trim() || undefined,
        city: settingsForm.city.trim() || undefined,
        address: settingsForm.address.trim() || undefined,
        logo: settingsForm.avatar.trim() || undefined,
      });
      setBusiness(updated);
      await refreshUser();
      setSettingsMsg(t('biz.settingsSaved'));
    } catch {
      setSettingsMsg(t('biz.saveError'));
    } finally {
      setSettingsSaving(false);
    }
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
    if (business) localStorage.setItem(`ks-qualities-${business.id}`, JSON.stringify(next));
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
    if (business) localStorage.setItem(`ks-shop-photos-${business.id}`, JSON.stringify(next));
  };
  const handleAddShopPhoto = (file: File) => {
    if (shopPhotos.length >= 8) { alert(t('biz.maxPhotos')); return; }
    readFileAndSet(file, url => saveShopPhotos([...shopPhotos, url]));
  };
  const handleRemoveShopPhoto = (idx: number) => saveShopPhotos(shopPhotos.filter((_, i) => i !== idx));

  // ─── Mise à jour statut commande ─────────────────────────
  const handleOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await orders.updateSellerOrderStatus(orderId, { status });
      invalidateCache('/orders/');
      const res = await orders.sellerOrders({ limit: 50 });
      setSellerOrders(res.orders);
    } catch { /* ignore */ }
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
      setActiveSection('messages');
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
                <input
                  type="text"
                  value={form.city}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                  placeholder={t('biz.cityPh')}
                  minLength={2}
                  maxLength={80}
                  required
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
      {/* ─── MOBILE HEADER ───────────────────────────────── */}
      <header className="dash-mobile-header">
        <button className="dash-mob-hamburger" onClick={() => setMobileSidebarOpen(o => !o)} aria-label="Menu">☰</button>
        <Link to="/" className="dash-mob-logo">
          <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span>Kin-Sell</span>
        </Link>
        <button className="dash-mob-search" aria-label="Rechercher">🔍</button>
      </header>

      {/* ─── OVERLAY MOBILE ──────────────────────────────── */}
      {mobileSidebarOpen && <div className="dash-mob-overlay" onClick={() => setMobileSidebarOpen(false)} />}

      {/* ─── SIDEBAR ─────────────────────────────────────── */}
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
            {businessLogo
              ? <img src={businessLogo} alt={businessName} />
              : <span className="ud-avatar-initials">{businessName.slice(0, 2).toUpperCase()}</span>
            }
            {businessVerified && <span className="bz-verified-badge" title={t('biz.shopActiveTitle')}>✓</span>}
          </div>
          {!sidebarCollapsed && (
            <div className="ud-profile-info">
              <strong className="ud-profile-name">{businessName}</strong>
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
              onClick={() => { setActiveSection(item.key); setMobileSidebarOpen(false); }}
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
          <button type="button" className="ud-drawer-logout-btn" onClick={() => { logout(); navigate('/'); }}>
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
            <button type="button" className="ud-quick-btn" onClick={() => setActiveSection('publicite')}>
              {t('biz.launchPromo')}
            </button>
            <button type="button" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" onClick={() => { setActiveSection('produits'); setCreateMode('produit'); }}>
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
                  <strong className="ud-stat-value">{fmtK(kpis.totalCdf)}</strong>
                </div>
              </article>
              <article className="ud-stat-card ud-stat-card--blue bz-stat-card">
                <span className="ud-stat-icon">📈</span>
                <div>
                  <p className="ud-stat-label">{t('biz.monthlySales')}</p>
                  <strong className="ud-stat-value">{fmtK(kpis.monthCdf)}</strong>
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
                  <strong className="ud-stat-value">{fmtK(kpis.avgCdf)}</strong>
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
                            <td>{fmtK(toCdf(o.totalUsdCents))}</td>
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
                          <span>{fmtK(toCdf(p.priceUsdCents))} · {p.category}</span>
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
                  <button type="button" className="ud-action-tile bz-action-tile" onClick={() => { setActiveSection('produits'); setCreateMode('produit'); }}>
                    <span className="ud-action-icon">📦</span>
                    <span>{t('biz.addProductAction')}</span>
                  </button>
                  <button type="button" className="ud-action-tile bz-action-tile" onClick={() => { setActiveSection('services'); setCreateMode('service'); }}>
                    <span className="ud-action-icon">🛠️</span>
                    <span>{t('biz.addServiceAction')}</span>
                  </button>
                  <button type="button" className="ud-action-tile bz-action-tile" onClick={() => navigate('/sokin')}>
                    <span className="ud-action-icon">✦</span>
                    <span>{t('biz.publishSokin')}</span>
                  </button>
                  <button type="button" className="ud-action-tile bz-action-tile" onClick={() => setActiveSection('clients')}>
                    <span className="ud-action-icon">👥</span>
                    <span>{t('biz.seeClients')}</span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ── BOUTIQUE ── */}
        {activeSection === 'boutique' && (
          <div className="ud-section animate-fade-in">

            {/* ─ Barre d'aperçu ─ */}
            <div className="bz-public-preview-bar">
              <div>
                <strong>{t('biz.publicPage')} :</strong>{' '}
                <span className="ud-page-sub">{window.location.origin}/business/{businessSlug}</span>
              </div>
              <button
                type="button"
                className="ud-quick-btn ud-quick-btn--primary bz-cta-gold"
                onClick={() => window.open(`/business/${businessSlug}`, '_blank', 'noopener,noreferrer')}
              >
                🔍 {t('biz.livePreview')} →
              </button>
            </div>

            {/* ─ Carte identité publique live ─ */}
            <section className="ud-glass-panel bz-glass-panel bz-public-id-card">
              <div className="bz-public-id-logo">
                {(pageForm.logo || businessLogo)
                  ? <img src={pageForm.logo || businessLogo || undefined} alt={businessName} />
                  : <span className="ud-avatar-initials bz-public-id-initials">{businessName.slice(0, 2).toUpperCase()}</span>
                }
              </div>
              <div className="bz-public-id-info">
                <strong className="bz-public-id-name">{pageForm.publicName || businessName}</strong>
                <span className={tier.cls}>{tier.label}</span>
                <span className="ud-page-sub">📍 {pageForm.city || business?.shop?.city || 'Kinshasa'}</span>
                <span className="ud-page-sub biz-boutique-desc">{pageForm.publicDescription || business?.shop?.publicDescription || t('biz.noDesc')}</span>
                <span className="ud-badge ud-badge--done" style={{ width: 'fit-content', marginTop: 'var(--space-xs)' }}>
                  {businessVerified ? t('biz.shopActive') : t('biz.shopPending')}
                </span>
              </div>
              {(pageForm.coverImage || business?.shop?.coverImage) && (
                <div className="biz-boutique-cover">
                  <img src={pageForm.coverImage || business?.shop?.coverImage || ''} alt={t('biz.coverAlt')} />
                </div>
              )}
            </section>

            {/* ─ Formulaire d'édition ─ */}
            <section className="ud-glass-panel bz-glass-panel">
              <h2 className="ud-panel-title">{t('biz.editPublicPage')}</h2>
              <form className="bz-setup-form" onSubmit={handleSavePage}>
                <div className="bz-setup-grid">
                  <label className="bz-setup-field">
                    <span>{t('biz.publicNameLabel')} *</span>
                    <input type="text" value={pageForm.publicName} onChange={e => setPageForm(f => ({ ...f, publicName: e.target.value }))} maxLength={150} placeholder={t('biz.publicNamePh')} />
                  </label>
                  <label className="bz-setup-field">
                    <span>{t('biz.cityLabel')}</span>
                    <input type="text" value={pageForm.city} onChange={e => setPageForm(f => ({ ...f, city: e.target.value }))} placeholder="Kinshasa" maxLength={80} />
                  </label>
                  <label className="bz-setup-field">
                    <span>{t('biz.addressLabel')}</span>
                    <input type="text" value={pageForm.address} onChange={e => setPageForm(f => ({ ...f, address: e.target.value }))} placeholder={t('biz.addressPh')} maxLength={200} />
                  </label>
                  <div className="bz-setup-field">
                    <span>{t('biz.logoLabel')}</span>
                    {pageForm.logo ? (
                      <div className="bz-photo-preview">
                        <img src={pageForm.logo} alt="Logo" className="bz-photo-preview-img bz-photo-preview-img--circle" onError={e => { (e.target as HTMLImageElement).src = ''; }} />
                        <div className="bz-photo-preview-actions">
                          <label className="bz-photo-replace-btn">
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) readFileAndSet(f, url => setPageForm(p => ({ ...p, logo: url }))); e.target.value = ''; }} />
                            🔄 {t('biz.replace')}
                          </label>
                          <button type="button" className="bz-photo-remove-btn" onClick={() => setPageForm(f => ({ ...f, logo: '' }))}>✕ {t('biz.remove')}</button>
                        </div>
                      </div>
                    ) : (
                      <label className="bz-photo-drop-zone">
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) readFileAndSet(f, url => setPageForm(p => ({ ...p, logo: url }))); e.target.value = ''; }} />
                        <span className="bz-photo-drop-icon">🖼️</span>
                        <span className="bz-photo-drop-text">{t('biz.importLogo')}</span>
                        <small className="bz-photo-drop-hint">{t('biz.photoHint')}</small>
                      </label>
                    )}
                  </div>
                  <div className="bz-setup-field">
                    <span>{t('biz.coverLabel')}</span>
                    {pageForm.coverImage ? (
                      <div className="bz-photo-preview">
                        <img src={pageForm.coverImage} alt={t('biz.coverAlt')} className="bz-photo-preview-img" onError={e => { (e.target as HTMLImageElement).src = ''; }} />
                        <div className="bz-photo-preview-actions">
                          <label className="bz-photo-replace-btn">
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) readFileAndSet(f, url => setPageForm(p => ({ ...p, coverImage: url }))); e.target.value = ''; }} />
                            🔄 {t('biz.replace')}
                          </label>
                          <button type="button" className="bz-photo-remove-btn" onClick={() => setPageForm(f => ({ ...f, coverImage: '' }))}>✕ {t('biz.remove')}</button>
                        </div>
                      </div>
                    ) : (
                      <label className="bz-photo-drop-zone">
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) readFileAndSet(f, url => setPageForm(p => ({ ...p, coverImage: url }))); e.target.value = ''; }} />
                        <span className="bz-photo-drop-icon">🌆</span>
                        <span className="bz-photo-drop-text">{t('biz.importCover')}</span>
                        <small className="bz-photo-drop-hint">{t('biz.photoHint')}</small>
                      </label>
                    )}
                  </div>
                  <label className="bz-setup-field bz-setup-field--full">
                    <span>{t('biz.publicDescLabel')}</span>
                    <textarea value={pageForm.publicDescription} onChange={e => setPageForm(f => ({ ...f, publicDescription: e.target.value }))} maxLength={800} rows={5} placeholder={t('biz.publicDescPh')} />
                  </label>
                </div>
                {pageMsg && <p className={`bz-setup-${pageMsg.startsWith('✓') ? 'note' : 'error'}`}>{pageMsg}</p>}
                <div className="bz-setup-actions">
                  <button type="submit" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" disabled={pageSaving}>
                    {pageSaving ? t('biz.saving') : t('biz.saveAndPublish')}
                  </button>
                  <button
                    type="button"
                    className="ud-quick-btn"
                    onClick={() => window.open(`/business/${businessSlug}`, '_blank', 'noopener,noreferrer')}
                  >
                    🔍 {t('biz.viewPage')}
                  </button>
                </div>
              </form>
            </section>

            {/* ─ Points forts ─ */}
            <section className="ud-glass-panel bz-glass-panel">
              <h2 className="ud-panel-title">✨ {t('biz.highlights')}</h2>
              <p className="ud-page-sub" style={{ marginBottom: 'var(--space-md)' }}>{t('biz.highlightsDesc')}</p>

              {qualities.length > 0 && (
                <div className="bz-qualities-list">
                  {qualities.map(q => (
                    <div key={q.id} className="bz-quality-row">
                      <span className="bz-quality-icon">{q.icon}</span>
                      <div className="bz-quality-info">
                        <strong>{q.name}</strong>
                        <span className="ud-page-sub">{q.description}</span>
                      </div>
                      <button type="button" className="bz-photo-remove-btn" onClick={() => handleRemoveQuality(q.id)} title={t('biz.deleteBtn')}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="bz-quality-add-form">
                <div className="bz-quality-add-row">
                  <select value={qualityDraft.icon} onChange={e => setQualityDraft(d => ({ ...d, icon: e.target.value }))} className="bz-quality-icon-select">
                    {['⭐', '🔒', '📈', '🚀', '💎', '🤝', '⚡', '🎯', '✅', '🏆', '💬', '📍'].map(ic => <option key={ic} value={ic}>{ic}</option>)}
                  </select>
                  <input type="text" placeholder={t('biz.highlightNamePh')} value={qualityDraft.name} onChange={e => setQualityDraft(d => ({ ...d, name: e.target.value }))} maxLength={60} />
                </div>
                <input type="text" placeholder={t('biz.highlightDescPh')} value={qualityDraft.description} onChange={e => setQualityDraft(d => ({ ...d, description: e.target.value }))} maxLength={200} style={{ width: '100%' }} />
                <button type="button" className="ud-quick-btn ud-quick-btn--primary" onClick={handleAddQuality} disabled={!qualityDraft.name.trim()}>
                  + {t('biz.addHighlight')}
                </button>
              </div>
            </section>

            {/* ─ Photos boutique physique ─ */}
            <section className="ud-glass-panel bz-glass-panel">
              <h2 className="ud-panel-title">📸 {t('biz.shopPhotos')}</h2>
              <p className="ud-page-sub" style={{ marginBottom: 'var(--space-md)' }}>{t('biz.shopPhotosDesc')}</p>

              {shopPhotos.length > 0 && (
                <div className="bz-shop-photos-grid">
                  {shopPhotos.map((url, idx) => (
                    <div key={idx} className="bz-shop-photo-item">
                      <img src={url} alt={`Boutique photo ${idx + 1}`} />
                      <button type="button" className="bz-photo-remove-btn bz-shop-photo-remove" onClick={() => handleRemoveShopPhoto(idx)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {shopPhotos.length < 8 && (
                <label className="bz-photo-drop-zone" style={{ marginTop: 'var(--space-sm)' }}>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const f = e.target.files?.[0]; if (f) handleAddShopPhoto(f); e.target.value = ''; }} />
                  <span className="bz-photo-drop-icon">📷</span>
                  <span className="bz-photo-drop-text">{t('biz.addShopPhoto')}</span>
                  <small className="bz-photo-drop-hint">{t('biz.photoHint')} · {shopPhotos.length}/8</small>
                </label>
              )}
            </section>

          </div>
        )}

        {/* ── PRODUITS ── */}
        {activeSection === 'produits' && (
          <div className="ud-section animate-fade-in">
            <section className="ud-glass-panel bz-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">{t('biz.myProducts')} ({produits.length})</h2>
                <button type="button" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" onClick={() => setCreateMode(createMode === 'produit' ? null : 'produit')}>
                  {createMode === 'produit' ? t('biz.cancelBtn') : t('biz.newProduct')}
                </button>
              </div>
              {createMode === 'produit' && (
                <form className="bz-setup-form" style={{ marginBottom: 'var(--space-lg)' }} onSubmit={handleCreateListing}>
                  <div className="bz-setup-grid">
                    <label className="bz-setup-field"><span>{t('biz.titleLabel')} *</span><input type="text" required minLength={2} maxLength={200} value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder={t('biz.titleProductPh')} /></label>
                    <label className="bz-setup-field"><span>{t('biz.categoryLabel')} *</span><input type="text" required value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))} placeholder={t('biz.categoryPh')} /></label>
                    <label className="bz-setup-field"><span>{t('biz.cityLabel')} *</span><LocationPicker value={{ lat: createForm.latitude, lng: createForm.longitude, address: createForm.city }} onChange={({ address, city, lat, lng }) => setCreateForm(f => ({ ...f, city: city || address, latitude: lat, longitude: lng }))} placeholder="Kinshasa" /></label>
                    <label className="bz-setup-field"><span>{t('biz.priceCdf')} *</span><input type="number" required min={0} value={createForm.priceCdf} onChange={e => setCreateForm(f => ({ ...f, priceCdf: e.target.value }))} placeholder={t('biz.pricePh')} /></label>
                    <label className="bz-setup-field"><span>{t('biz.stockLabel')}</span><input type="number" min={0} value={createForm.stock} onChange={e => setCreateForm(f => ({ ...f, stock: e.target.value }))} placeholder={t('biz.stockPh')} /></label>
                    <label className="bz-setup-field bz-setup-field--full"><span>{t('biz.descriptionLabel')}</span><textarea rows={3} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder={t('biz.descProductPh')} /></label>
                    <label className="bz-setup-field" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={createForm.isNegotiable} onChange={e => setCreateForm(f => ({ ...f, isNegotiable: e.target.checked }))} /><span>{t('negotiation.allowPrice')}</span></label>
                  </div>
                  {createMsg && <p className={`bz-setup-${createMsg.startsWith('✓') ? 'note' : 'error'}`}>{createMsg}</p>}
                  <div className="bz-setup-actions">
                    <button type="submit" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" disabled={createBusy}>
                      {createBusy ? t('biz.publishing') : t('biz.publishProduct')}
                    </button>
                  </div>
                </form>
              )}
              {produits.length === 0 ? (
                <p className="ud-placeholder-text" style={{ padding: 'var(--space-lg)' }}>
                  {dataLoading ? t('biz.loadingData') : t('biz.noProductsEmpty')}
                </p>
              ) : (
                <table className="ud-table">
                  <thead>
                    <tr><th>{t('biz.thProduct')}</th><th>{t('biz.thCategory')}</th><th>{t('biz.thPrice')}</th><th>{t('biz.thStock')}</th><th>{t('biz.thNegotiable')}</th><th>{t('biz.thStatus')}</th></tr>
                  </thead>
                  <tbody>
                    {produits.map(p => (
                      <tr key={p.id}>
                        <td>{p.title}</td>
                        <td>{p.category}</td>
                        <td>{fmtK(toCdf(p.priceUsdCents))}</td>
                        <td><span className={`bz-stock-badge${(p.stockQuantity ?? 99) <= 5 ? ' bz-stock-badge--low' : ''}`}>{p.stockQuantity != null ? p.stockQuantity : '∞'}</span></td>
                        <td><button type="button" className={`ud-badge ${p.isNegotiable !== false ? 'ud-badge--done' : ''}`} style={{ cursor: 'pointer', border: 'none' }} onClick={() => { listings.update(p.id, { isNegotiable: p.isNegotiable === false }).then(() => { invalidateCache('/listings/mine'); listings.mine({ limit: 50 }).then(r => setMyListings(r.listings)); }); }}>{p.isNegotiable !== false ? t('negotiation.yes') : t('negotiation.no')}</button></td>
                        <td><span className={p.isPublished ? 'ud-badge ud-badge--done' : 'ud-badge'}>{p.isPublished ? t('biz.published') : t('biz.draft')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}

        {/* ── SERVICES ── */}
        {activeSection === 'services' && (
          <div className="ud-section animate-fade-in">
            <section className="ud-glass-panel bz-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">{t('biz.myServices')} ({services.length})</h2>
                <button type="button" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" onClick={() => setCreateMode(createMode === 'service' ? null : 'service')}>
                  {createMode === 'service' ? t('biz.cancelBtn') : t('biz.newService')}
                </button>
              </div>
              {createMode === 'service' && (
                <form className="bz-setup-form" style={{ marginBottom: 'var(--space-lg)' }} onSubmit={handleCreateListing}>
                  <div className="bz-setup-grid">
                    <label className="bz-setup-field"><span>{t('biz.titleLabel')} *</span><input type="text" required minLength={2} maxLength={200} value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder={t('biz.titleServicePh')} /></label>
                    <label className="bz-setup-field"><span>{t('biz.categoryLabel')} *</span><input type="text" required value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))} placeholder={t('biz.categoryServicePh')} /></label>
                    <label className="bz-setup-field"><span>{t('biz.cityLabel')} *</span><LocationPicker value={{ lat: createForm.latitude, lng: createForm.longitude, address: createForm.city }} onChange={({ address, city, lat, lng }) => setCreateForm(f => ({ ...f, city: city || address, latitude: lat, longitude: lng }))} placeholder="Kinshasa" /></label>
                    <label className="bz-setup-field"><span>{t('biz.rateCdf')} *</span><input type="number" required min={0} value={createForm.priceCdf} onChange={e => setCreateForm(f => ({ ...f, priceCdf: e.target.value }))} placeholder={t('biz.ratePh')} /></label>
                    <label className="bz-setup-field bz-setup-field--full"><span>{t('biz.descriptionLabel')}</span><textarea rows={3} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder={t('biz.descServicePh')} /></label>
                    <label className="bz-setup-field" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={createForm.isNegotiable} onChange={e => setCreateForm(f => ({ ...f, isNegotiable: e.target.checked }))} /><span>{t('negotiation.allowPrice')}</span></label>
                  </div>
                  {createMsg && <p className={`bz-setup-${createMsg.startsWith('✓') ? 'note' : 'error'}`}>{createMsg}</p>}
                  <div className="bz-setup-actions">
                    <button type="submit" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" disabled={createBusy}>
                      {createBusy ? t('biz.publishing') : t('biz.publishService')}
                    </button>
                  </div>
                </form>
              )}
              {services.length === 0 ? (
                <p className="ud-placeholder-text" style={{ padding: 'var(--space-lg)' }}>
                  {dataLoading ? t('biz.loadingData') : t('biz.noServicesEmpty')}
                </p>
              ) : (
                <table className="ud-table">
                  <thead>
                    <tr><th>{t('biz.thService')}</th><th>{t('biz.thCategory')}</th><th>{t('biz.thRate')}</th><th>{t('biz.thCity')}</th><th>{t('biz.thNegotiable')}</th><th>{t('biz.thStatus')}</th></tr>
                  </thead>
                  <tbody>
                    {services.map(s => (
                      <tr key={s.id}>
                        <td>{s.title}</td>
                        <td>{s.category}</td>
                        <td>{fmtK(toCdf(s.priceUsdCents))}</td>
                        <td>{s.city}</td>
                        <td><button type="button" className={`ud-badge ${s.isNegotiable !== false ? 'ud-badge--done' : ''}`} style={{ cursor: 'pointer', border: 'none' }} onClick={() => { listings.update(s.id, { isNegotiable: s.isNegotiable === false }).then(() => { invalidateCache('/listings/mine'); listings.mine({ limit: 50 }).then(r => setMyListings(r.listings)); }); }}>{s.isNegotiable !== false ? t('negotiation.yes') : t('negotiation.no')}</button></td>
                        <td><span className={s.isPublished ? 'ud-badge ud-badge--done' : 'ud-badge'}>{s.isPublished ? t('biz.published') : t('biz.draft')}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}

        {/* ── COMMANDES ── */}
        {activeSection === 'commandes' && (
          <div className="ud-section animate-fade-in">
            <section className="ud-glass-panel bz-glass-panel">
              <h2 className="ud-panel-title">{t('biz.allOrders')} ({sellerOrders.length})</h2>
              {sellerOrders.length === 0 ? (
                <p className="ud-placeholder-text" style={{ padding: 'var(--space-lg)' }}>
                  {dataLoading ? t('biz.loadingData') : t('biz.noOrdersReceived')}
                </p>
              ) : (
                <table className="ud-table">
                  <thead>
                    <tr><th>{t('biz.thId')}</th><th>{t('biz.thClient')}</th><th>{t('biz.thDate')}</th><th>{t('biz.thAmount')}</th><th>{t('biz.thStatus')}</th><th>{t('biz.thAction')}</th></tr>
                  </thead>
                  <tbody>
                    {sellerOrders.map(o => {
                      const s = ORDER_STATUS_MAP[o.status] ?? { labelKey: o.status, cls: 'ud-badge' };
                      return (
                        <tr key={o.id}>
                          <td className="ud-table-id">#{o.id.slice(0, 8).toUpperCase()}</td>
                          <td>{o.buyer.displayName}</td>
                          <td>{new Date(o.createdAt).toLocaleDateString('fr-FR')}</td>
                          <td>{fmtK(toCdf(o.totalUsdCents))}</td>
                          <td><span className={s.cls}>{t(s.labelKey)}</span></td>
                          <td>
                            <div className="ud-table-action-stack">
                              {o.status === 'PENDING' && (
                                <button type="button" className="ud-table-action" onClick={() => void handleOrderStatus(o.id, 'CONFIRMED')}>{t('biz.confirmOrder')} →</button>
                              )}
                              {o.status === 'CONFIRMED' && (
                                <button type="button" className="ud-table-action" onClick={() => void handleOrderStatus(o.id, 'SHIPPED')}>{t('biz.shipOrder')} →</button>
                              )}
                              {(o.status === 'PROCESSING' || o.status === 'SHIPPED') && (
                                <button
                                  type="button"
                                  className="ud-table-action ud-table-action--code"
                                  disabled={validationCodeBusyId === o.id}
                                  onClick={() => void handleRevealCode(o.id)}
                                >
                                  {validationCodeBusyId === o.id ? '...' : '🔑 QR / Code'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

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
        )}

        {/* ── CLIENTS ── */}
        {activeSection === 'clients' && (
          <div className="ud-section animate-fade-in">
            <section className="ud-glass-panel bz-glass-panel">
              <h2 className="ud-panel-title">{t('biz.clientsTitle')}</h2>
              <div className="ud-stats-row" style={{ marginBottom: 'var(--space-lg)' }}>
                <article className="ud-stat-card ud-stat-card--blue">
                  <span className="ud-stat-icon">👥</span>
                  <div><p className="ud-stat-label">{t('biz.totalClients')}</p><strong className="ud-stat-value">{clientsData.length}</strong></div>
                </article>
                <article className="ud-stat-card ud-stat-card--green">
                  <span className="ud-stat-icon">⭐</span>
                  <div><p className="ud-stat-label">{t('biz.loyalClients')}</p><strong className="ud-stat-value">{clientsData.filter(c => c.commandes >= 3).length}</strong></div>
                </article>
              </div>
              {clientsData.length === 0 ? (
                <p className="ud-placeholder-text" style={{ padding: 'var(--space-md)' }}>
                  {dataLoading ? t('biz.loadingData') : t('biz.noClients')}
                </p>
              ) : (
                <table className="ud-table">
                  <thead>
                    <tr><th>{t('biz.thClient')}</th><th>{t('biz.thOrders')}</th><th>{t('biz.thTotalSpent')}</th><th>{t('biz.thLoyal')}</th></tr>
                  </thead>
                  <tbody>
                    {clientsData.map((c, i) => (
                      <tr key={i}>
                        <td>{c.name}</td>
                        <td>{c.commandes}</td>
                        <td>{fmtK(c.totalCdf)}</td>
                        <td>{c.commandes >= 3 ? <span className="ud-badge ud-badge--done">{t('biz.yes')}</span> : <span className="ud-badge">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}

        {/* ── MESSAGERIE ── */}
        {activeSection === 'messages' && (
          <div className="ud-section animate-fade-in">
            <div style={{ height: 'calc(100vh - 100px)', borderRadius: 'var(--ud-radius)', overflow: 'hidden' }}>
              <DashboardMessaging />
            </div>
          </div>
        )}

        {/* ── CONTACTS ── */}
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
                      <span className="ud-page-sub">{c.commandes} {t('biz.orders')} · {fmtK(c.totalCdf)}</span>
                    </div>
                    <div className="bz-contact-actions">
                      <button type="button" className="ud-quick-btn" onClick={() => setActiveSection('messages')} title={t('biz.sendMessage')}>💬</button>
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
                  <button type="button" className="ud-quick-btn" onClick={() => setActiveSection('messages')}>💬 {t('biz.messaging')}</button>
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
          </div>
        )}

        {/* ── GESTION DES AVIS ── */}
        {activeSection === 'avis' && (
          <div className="ud-section animate-fade-in">
            {/* Stats avis */}
            <div className="ud-stats-row">
              <article className="ud-stat-card ud-stat-card--gold bz-stat-card">
                <span className="ud-stat-icon">⭐</span>
                <div><p className="ud-stat-label">{t('biz.reviewsReceived')}</p><strong className="ud-stat-value">0</strong></div>
              </article>
              <article className="ud-stat-card ud-stat-card--green bz-stat-card">
                <span className="ud-stat-icon">👍</span>
                <div><p className="ud-stat-label">{t('biz.reviewsPositive')}</p><strong className="ud-stat-value">0</strong></div>
              </article>
              <article className="ud-stat-card ud-stat-card--amber bz-stat-card">
                <span className="ud-stat-icon">📝</span>
                <div><p className="ud-stat-label">{t('biz.reviewsPending')}</p><strong className="ud-stat-value">0</strong></div>
              </article>
              <article className="ud-stat-card ud-stat-card--blue bz-stat-card">
                <span className="ud-stat-icon">💬</span>
                <div><p className="ud-stat-label">{t('biz.reviewsReplied')}</p><strong className="ud-stat-value">0</strong></div>
              </article>
            </div>

            {/* Tous les avis */}
            <section className="ud-glass-panel bz-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">⭐ {t('biz.allReviews')}</h2>
                <button
                  type="button"
                  className="ud-quick-btn ud-quick-btn--primary bz-cta-gold"
                  onClick={() => setActiveSection('messages')}
                >
                  💬 {t('biz.contactClients')}
                </button>
              </div>
              <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <span style={{ fontSize: '3rem', display: 'block', marginBottom: 12 }}>⭐</span>
                <h3 style={{ margin: '0 0 8px' }}>{t('biz.noReviewsTitle')}</h3>
                <p className="ud-placeholder-text">
                  {t('biz.noReviewsDesc')}
                </p>
              </div>
            </section>
          </div>
        )}

        {/* ── SO-KIN ── */}
        {activeSection === 'sokin' && (
          <div className="ud-section animate-fade-in">
            {/* En-tête */}
            <section className="ud-glass-panel bz-glass-panel">
              <div className="ud-panel-head">
                <h2 className="ud-panel-title">✦ {t('biz.sokinTitle')}</h2>
                <Link to="/sokin" className="ud-panel-see-all">{t('biz.openSokin')} ↗</Link>
              </div>
              <p className="ud-page-sub">{t('biz.sokinDesc')}</p>
            </section>

            {/* Stats */}
            <div className="ud-stats-row">
              <article className="ud-stat-card ud-stat-card--gold bz-stat-card">
                <span className="ud-stat-icon">📢</span>
                <div><p className="ud-stat-label">{t('biz.publications')}</p><strong className="ud-stat-value">{sokinPosts.filter(p => p.status === 'ACTIVE').length}</strong></div>
              </article>
              <article className="ud-stat-card ud-stat-card--green bz-stat-card">
                <span className="ud-stat-icon">👍</span>
                <div><p className="ud-stat-label">{t('biz.totalLikes')}</p><strong className="ud-stat-value">{sokinPosts.reduce((s, p) => s + p.likes, 0)}</strong></div>
              </article>
              <article className="ud-stat-card ud-stat-card--amber bz-stat-card">
                <span className="ud-stat-icon">💬</span>
                <div><p className="ud-stat-label">{t('biz.commentsLabel')}</p><strong className="ud-stat-value">{sokinPosts.reduce((s, p) => s + p.comments, 0)}</strong></div>
              </article>
              <article className="ud-stat-card ud-stat-card--blue bz-stat-card">
                <span className="ud-stat-icon">🔁</span>
                <div><p className="ud-stat-label">{t('biz.sharesLabel')}</p><strong className="ud-stat-value">{sokinPosts.reduce((s, p) => s + p.shares, 0)}</strong></div>
              </article>
            </div>

            {/* Formulaire de publication */}
            <section className="ud-glass-panel bz-glass-panel">
              <h3 className="ud-panel-title" style={{ fontSize: '1rem', marginBottom: 12 }}>📝 {t('biz.newPost')}</h3>
              <textarea
                className="bz-sokin-compose"
                placeholder={t('biz.sokinComposePh')}
                value={sokinDraft.content}
                onChange={(e) => setSokinDraft(d => ({ ...d, content: e.target.value }))}
                rows={3}
                maxLength={500}
              />
              <div className="bz-sokin-compose-actions">
                <label className="ud-quick-btn" style={{ cursor: 'pointer' }}>
                  🖼️ {t('biz.imageBtn')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) readFileAndSet(f, url => setSokinDraft(d => ({ ...d, imageUrl: url })));
                    e.target.value = '';
                  }} />
                </label>
                {sokinDraft.imageUrl && (
                  <span className="ud-page-sub" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ✓ {t('biz.imageAdded')}
                    <button type="button" style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', marginLeft: 8 }} onClick={() => setSokinDraft(d => ({ ...d, imageUrl: '' }))}>✕</button>
                  </span>
                )}
                <button
                  type="button"
                  className="ud-quick-btn ud-quick-btn--primary bz-cta-gold"
                  disabled={sokinPublishing || !sokinDraft.content.trim()}
                  onClick={handlePublishSokin}
                >
                  {sokinPublishing ? t('biz.publishing') : t('biz.publishSokinBtn')}
                </button>
              </div>
            </section>

            {/* Liste des publications */}
            <section className="ud-glass-panel bz-glass-panel">
              <h3 className="ud-panel-title" style={{ fontSize: '1rem', marginBottom: 16 }}>{t('biz.yourPosts')}</h3>
              {sokinPosts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 12 }}>✦</span>
                  <p className="ud-placeholder-text">{t('biz.noPostsDesc')}</p>
                </div>
              ) : (
                <div className="bz-sokin-list">
                  {sokinPosts.map(post => (
                    <article key={post.id} className={`bz-sokin-post${post.status === 'HIDDEN' ? ' bz-sokin-post--archived' : ''}`}>
                      <div className="bz-sokin-post-body">
                        {post.mediaUrls.length > 0 && <img src={post.mediaUrls[0]} alt="" className="bz-sokin-post-img" />}
                        <div className="bz-sokin-post-content">
                          <p>{post.text}</p>
                          <span className="ud-page-sub">{new Date(post.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <div className="bz-sokin-post-footer">
                        <span className="bz-sokin-metric">👍 {post.likes}</span>
                        <span className="bz-sokin-metric">💬 {post.comments}</span>
                        <span className="bz-sokin-metric">🔁 {post.shares}</span>
                        <span className={`ud-badge${post.status === 'ACTIVE' ? ' ud-badge--done' : ''}`}>{post.status === 'ACTIVE' ? t('biz.statusActive') : t('biz.statusHidden')}</span>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                          <button type="button" className="ud-quick-btn" onClick={() => handleArchiveSokin(post.id)} title={post.status === 'HIDDEN' ? t('biz.reactivate') : t('biz.hide')}>
                            {post.status === 'HIDDEN' ? '♻️' : '📥'}
                          </button>
                          <button type="button" className="ud-quick-btn" style={{ color: '#ff6b6b' }} onClick={() => handleDeleteSokin(post.id)} title={t('biz.deleteBtn')}>
                            🗑
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
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
                    <strong className="bz-analytics-val">{fmtK(kpis.totalCdf)}</strong>
                  </div>
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.salesThisMonth')}</span>
                    <strong className="bz-analytics-val">{fmtK(kpis.monthCdf)}</strong>
                  </div>
                  <div className="bz-analytics-item">
                    <span className="bz-analytics-label">{t('biz.avgCart')}</span>
                    <strong className="bz-analytics-val">{fmtK(kpis.avgCdf)}</strong>
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
                        onClick={() => setActiveSection('publicite')}
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
                          <span className="ud-analytics-stat-value">{fmtK(toCdf(bizBasicInsights.activitySummary.revenueCents))}</span>
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
                        <p>Prix moyen : {fmtK(toCdf(bizBasicInsights.marketPosition.avgPriceCents))}</p>
                        <p>Médiane : {fmtK(toCdf(bizBasicInsights.marketPosition.medianCents))}</p>
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
          </div>
        )}

        {/* ── PUBLICITE ── */}
        {activeSection === 'publicite' && (
          <div className="ud-section animate-fade-in">

            {/* ─ Kin-Sell Banner stratégique ─ */}
            <div className="bz-ks-banner">
              <div className="bz-ks-banner-inner">
                <span className="bz-ks-banner-tag">✦ {t('biz.adsTag')}</span>
                <div>
                  <strong className="bz-ks-banner-title">{t('biz.adsTitle')}</strong>
                  <p className="bz-ks-banner-desc">{t('biz.adsDesc')}</p>
                </div>
                <a href="/forfaits" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" style={{ whiteSpace: 'nowrap' }}>
                  ★ {t('biz.seeBoost')}
                </a>
              </div>
            </div>

            {/* ─ Offres Kin-Sell Ads ─ */}
            <section className="ud-glass-panel bz-glass-panel">
              <h2 className="ud-panel-title">📢 {t('biz.adsOffers')}</h2>
              <p className="ud-page-sub" style={{ marginBottom: 'var(--space-lg)' }}>
                {t('biz.adsOffersDesc')}
              </p>
              <div className="bz-ad-packages">
                <div className="bz-ad-pack bz-ad-pack--starter">
                  <div className="bz-ad-pack-header">
                    <span className="bz-ad-pack-icon">🌱</span>
                    <strong>Starter</strong>
                    <span className="bz-ad-pack-price">$2 / sem.</span>
                  </div>
                  <ul className="bz-ad-pack-features">
                    <li>✓ {t('biz.starterFeat1')}</li>
                    <li>✓ {t('biz.starterFeat2')}</li>
                    <li>✓ {t('biz.starterFeat3')}</li>
                  </ul>
                  <button type="button" className="ud-quick-btn" onClick={() => navigate('/forfaits')}>{t('biz.activateBtn')} →</button>
                </div>
                <div className="bz-ad-pack bz-ad-pack--pro">
                  <div className="bz-ad-pack-tag">⭐ {t('biz.popular')}</div>
                  <div className="bz-ad-pack-header">
                    <span className="bz-ad-pack-icon">🚀</span>
                    <strong>Pro</strong>
                    <span className="bz-ad-pack-price">$5 / sem.</span>
                  </div>
                  <ul className="bz-ad-pack-features">
                    <li>✓ {t('biz.proFeat1')}</li>
                    <li>✓ {t('biz.proFeat2')}</li>
                    <li>✓ {t('biz.proFeat3')}</li>
                    <li>✓ {t('biz.proFeat4')}</li>
                  </ul>
                  <button type="button" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" onClick={() => navigate('/forfaits')}>{t('biz.activateBtn')} →</button>
                </div>
                <div className="bz-ad-pack bz-ad-pack--gold">
                  <div className="bz-ad-pack-header">
                    <span className="bz-ad-pack-icon">👑</span>
                    <strong>Gold</strong>
                    <span className="bz-ad-pack-price">$14 / mois</span>
                  </div>
                  <ul className="bz-ad-pack-features">
                    <li>✓ {t('biz.goldFeat1')}</li>
                    <li>✓ {t('biz.goldFeat2')}</li>
                    <li>✓ {t('biz.goldFeat3')}</li>
                    <li>✓ {t('biz.goldFeat4')}</li>
                    <li>✓ {t('biz.goldFeat5')}</li>
                  </ul>
                  <button type="button" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" onClick={() => navigate('/forfaits')}>{t('biz.contactBtn')} →</button>
                </div>
              </div>
            </section>

          </div>
        )}

        {/* ── PARAMÈTRES ── */}
        {activeSection === 'parametres' && (
          <div className="ud-section animate-fade-in">

            {/* Identité légale */}
            <section className="ud-glass-panel bz-glass-panel">
              <h2 className="ud-panel-title">{t('biz.settingsTitle')}</h2>
              <form className="bz-setup-form" onSubmit={handleSaveSettings}>
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
                    <span>{t('biz.cityLabel')}</span>
                    <input type="text" value={settingsForm.city} onChange={e => setSettingsForm(f => ({ ...f, city: e.target.value }))} maxLength={80} placeholder="Kinshasa" />
                  </label>
                  <label className="bz-setup-field">
                    <span>{t('biz.addressShop')}</span>
                    <input type="text" value={settingsForm.address} onChange={e => setSettingsForm(f => ({ ...f, address: e.target.value }))} maxLength={200} placeholder={t('biz.addressPh')} />
                  </label>
                  <label className="bz-setup-field bz-setup-field--full">
                    <span>{t('biz.internalDesc')}</span>
                    <textarea value={settingsForm.description} onChange={e => setSettingsForm(f => ({ ...f, description: e.target.value }))} maxLength={800} rows={4} placeholder={t('biz.internalDescPh')} />
                  </label>
                </div>

                {settingsMsg && <p className={`bz-setup-${settingsMsg.startsWith('✓') ? 'note' : 'error'}`}>{settingsMsg}</p>}
                <div className="bz-setup-actions">
                  <button type="submit" className="ud-quick-btn ud-quick-btn--primary bz-cta-gold" disabled={settingsSaving}>
                    {settingsSaving ? t('biz.saving') : t('biz.saveSettings')}
                  </button>
                  <button type="button" className="ud-quick-btn" onClick={() => setActiveSection('boutique')}>
                    🏪 {t('biz.editShopBtn')} →
                  </button>
                </div>
              </form>
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

            {/* ── Section: Gestion IA ── */}
            <section className="ud-glass-panel ud-settings-section">
              <div className="ud-settings-section-head">
                <span className="ud-settings-section-icon">🤖</span>
                <h3 className="ud-settings-section-title">{t('user.settingsAiTitle')}</h3>
              </div>
              <p className="ud-placeholder-text" style={{ margin: '0 0 12px', fontSize: '0.82rem' }}>
                {t('user.settingsAiDesc')}
              </p>

              <div className="ud-ai-toggles">
                {/* ── Conseils IA ── */}
                <div className="ud-ai-toggle-row">
                  <div className="ud-ai-toggle-info">
                    <strong>💡 {t('user.aiAdviceLabel')}</strong>
                    <span className="ud-ai-toggle-hint">{t('user.aiAdviceHint')}</span>
                  </div>
                  <button
                    type="button"
                    className={`ud-ai-switch${bizAiAdviceEnabled ? ' ud-ai-switch--on' : ''}`}
                    onClick={() => {
                      const next = !bizAiAdviceEnabled;
                      setBizAiAdviceEnabled(next);
                      localStorage.setItem('ks-biz-ai-advice', next ? 'on' : 'off');
                    }}
                    aria-pressed={bizAiAdviceEnabled}
                  >
                    <span className="ud-ai-switch-thumb" />
                  </button>
                </div>

                {/* ── Marchandage automatique ── */}
                <div className={`ud-ai-toggle-row${!bizHasIaMarchandPlan ? ' ud-ai-toggle-row--locked' : ''}`}>
                  <div className="ud-ai-toggle-info">
                    <strong>🤝 {t('user.aiAutoNegoLabel')}</strong>
                    <span className="ud-ai-toggle-hint">
                      {bizHasIaMarchandPlan ? t('user.aiAutoNegoHint') : t('user.aiAutoNegoLocked')}
                    </span>
                  </div>
                  {bizHasIaMarchandPlan ? (
                    <button
                      type="button"
                      className={`ud-ai-switch${bizAiAutoNegoEnabled ? ' ud-ai-switch--on' : ''}`}
                      onClick={() => {
                        const next = !bizAiAutoNegoEnabled;
                        setBizAiAutoNegoEnabled(next);
                        localStorage.setItem('ks-biz-ai-auto-nego', next ? 'on' : 'off');
                      }}
                      aria-pressed={bizAiAutoNegoEnabled}
                    >
                      <span className="ud-ai-switch-thumb" />
                    </button>
                  ) : (
                    <Link to="/forfaits" className="ud-ai-upgrade-link">★ {t('user.aiUpgrade')}</Link>
                  )}
                </div>

                {/* ── IA Commande ── */}
                <div className={`ud-ai-toggle-row${!bizHasIaOrderPlan ? ' ud-ai-toggle-row--locked' : ''}`}>
                  <div className="ud-ai-toggle-info">
                    <strong>📦 {t('user.aiCommandeLabel')}</strong>
                    <span className="ud-ai-toggle-hint">
                      {bizHasIaOrderPlan ? t('user.aiCommandeHint') : t('user.aiCommandeLocked')}
                    </span>
                  </div>
                  {bizHasIaOrderPlan ? (
                    <button
                      type="button"
                      className={`ud-ai-switch${bizAiCommandeEnabled ? ' ud-ai-switch--on' : ''}`}
                      onClick={() => {
                        const next = !bizAiCommandeEnabled;
                        setBizAiCommandeEnabled(next);
                        localStorage.setItem('ks-biz-ai-commande', next ? 'on' : 'off');
                      }}
                      aria-pressed={bizAiCommandeEnabled}
                    >
                      <span className="ud-ai-switch-thumb" />
                    </button>
                  ) : (
                    <Link to="/forfaits" className="ud-ai-upgrade-link">★ {t('user.aiUpgrade')}</Link>
                  )}
                </div>
              </div>

              {bizAutoNegoActive && (
                <div className="ud-ai-auto-status">
                  <span className="ud-ai-auto-dot" />
                  <span>{t('user.aiAutoNegoActive')}</span>
                </div>
              )}
            </section>

          </div>
        )}

      </main>
    </div>
  );
}
