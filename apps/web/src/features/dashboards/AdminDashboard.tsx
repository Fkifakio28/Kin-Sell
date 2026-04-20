import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { getDashboardPath } from '../../utils/role-routing';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { API_BASE } from '../../lib/api-client';
import {
  admin,
  invalidateCache,
  resolveMediaUrl,
  request,
  type AdminStats,
  type AdminUser,
  type AdminUserDetail,
  type AdminTransaction,
  type AdminReport,
  type AdminBlogPost,
  type AdminBlogPostDetail,
  type BlogAnalytics,
  type AdminAdOffer,
  type AdminAuditLog,
  type AdminMember,
  type AdminRanking,
  type AdminAiAgent,
  type AiAgentDetail,
  type AiManagementStats,
  type AiLogEntry,
  type AdminCurrencyRate,
  type AdminMe,
  type SecurityDashboard,
  type SecurityEvent,
  type FraudSignal,
  type UserRestriction,
  type MessageGuardDashboard,
  type MessageGuardLogEntry,
  type AdminFeedPost,
  type AdminFeedStats,
  type AdminDonation,
  type AdminDonationSummary,
  type AdminAdvertisement,
  type AdminListingItem,
  type CategoryNegotiationRule,
  type AdminAppeal,
  type AdminAiRecommendationStats,
  type AdminSubscriptionItem,
  type AdminSubscriptionKpi,
  type AdminSubscriptionDetail,
  type AdminAiTrialItem,
  type AdminBillingOrderItem,
  type IaSource,
  type IaTargetUser,
} from '../../lib/api-client';
import AdminVerificationPanel from './AdminVerificationPanel';
import AdminAnalyticsPanel from './AdminAnalyticsPanel';
import AdminIncentivesPanel from './AdminIncentivesPanel';
import { DashboardMessaging } from './DashboardMessaging';
import TutorialOverlay, { useTutorial, TutorialRelaunchBtn } from '../../components/TutorialOverlay';
import { adminDashboardSteps } from '../../components/tutorial-steps';
import './dashboard.css';
import './admin-dashboard.css';

/* ──────── Types ──────── */
type AdminSection =
  | 'dashboard' | 'users' | 'blog' | 'transactions'
  | 'reports' | 'feed' | 'donations' | 'ads' | 'advertisements' | 'listings' | 'negotiation-rules'
  | 'security' | 'antifraud' | 'security-ai' | 'ai-management'
  | 'rankings' | 'admins' | 'currency' | 'audit'
  | 'settings' | 'messaging' | 'appeals' | 'subscriptions' | 'verification' | 'incentives'
  | 'ia-analytique' | 'ia-marchande' | 'ia-commande' | 'ia-ads' | 'ia-message'
  | 'app-version';

type ModalType =
  | null | 'user-detail' | 'user-role' | 'user-message' | 'user-suspend'
  | 'user-create' | 'report-detail' | 'blog-edit' | 'ad-edit'
  | 'admin-edit' | 'admin-create' | 'currency-edit' | 'feed-moderate' | 'advertisement-edit'
  | 'blog-preview' | 'ai-detail';

const ALL_PERMISSIONS = [
  'DASHBOARD', 'USERS', 'BLOG', 'TRANSACTIONS', 'REPORTS', 'FEED',
  'DONATIONS', 'ADS', 'ADVERTISEMENTS', 'LISTINGS', 'NEGOTIATION_RULES',
  'SECURITY', 'ANTIFRAUD', 'SECURITY_AI',
  'AI_MANAGEMENT', 'RANKINGS', 'ADMINS', 'CURRENCY', 'AUDIT',
  'SETTINGS', 'MESSAGING', 'SUBSCRIPTIONS', 'VERIFICATION',
];

const LEVEL_DEFAULT_PERMS: Record<string, string[]> = {
  LEVEL_1: [...ALL_PERMISSIONS],
  LEVEL_2: ['DASHBOARD','USERS','BLOG','TRANSACTIONS','REPORTS','FEED','DONATIONS','ADS','ADVERTISEMENTS','SECURITY','ANTIFRAUD','AI_MANAGEMENT','RANKINGS','CURRENCY','AUDIT','MESSAGING','LISTINGS','NEGOTIATION_RULES'],
  LEVEL_3: ['DASHBOARD','USERS','BLOG','TRANSACTIONS','REPORTS','FEED','DONATIONS','ADS','ADVERTISEMENTS','RANKINGS','MESSAGING','LISTINGS'],
  LEVEL_4: ['DASHBOARD','USERS','BLOG','REPORTS','FEED','MESSAGING'],
  LEVEL_5: ['DASHBOARD'],
};

const SECTION_DEFS: Array<{
  key: AdminSection;
  label: string;
  icon: string;
  permission: string;
  group?: string;
}> = [
  { key: 'dashboard',     label: 'Dashboard',          icon: '📊', permission: 'DASHBOARD',     group: 'Général' },
  { key: 'users',         label: 'Utilisateurs',       icon: '👥', permission: 'USERS',         group: 'Général' },
  { key: 'blog',          label: 'Annonces Blog IA',   icon: '📰', permission: 'BLOG',          group: 'Général' },
  { key: 'transactions',  label: 'Transactions',       icon: '💳', permission: 'TRANSACTIONS',  group: 'Général' },
  { key: 'reports',       label: 'Signalements',       icon: '🚨', permission: 'REPORTS',       group: 'Général' },
  { key: 'feed',          label: "Fil d'actualité",    icon: '📢', permission: 'FEED',          group: 'Contenu' },
  { key: 'donations',     label: 'Dons & Montants',    icon: '🎁', permission: 'DONATIONS',     group: 'Contenu' },
  { key: 'ads',           label: 'ADS Kin-Sell',       icon: '📣', permission: 'ADS',           group: 'Contenu' },
  { key: 'advertisements',label: 'Publicités Clients', icon: '📋', permission: 'ADVERTISEMENTS',group: 'Contenu' },
  { key: 'listings',      label: 'Gestion Articles',   icon: '🧩', permission: 'LISTINGS',      group: 'Contenu' },
  { key: 'negotiation-rules', label: 'Règles Négociation', icon: '🤝', permission: 'NEGOTIATION_RULES', group: 'Contenu' },
  { key: 'security',      label: 'Sécurité & Arnaque', icon: '🛡️', permission: 'SECURITY',      group: 'Sécurité' },
  { key: 'antifraud',     label: 'Anti-Fraude',        icon: '🤖', permission: 'ANTIFRAUD',     group: 'Sécurité' },
  { key: 'security-ai',   label: 'Sécurité IA',        icon: '🔐', permission: 'SECURITY_AI',   group: 'Sécurité' },
  { key: 'ai-management', label: 'Gestion des IA',     icon: '🧠', permission: 'AI_MANAGEMENT', group: 'Sécurité' },
  { key: 'rankings',      label: 'Classement',         icon: '🏆', permission: 'RANKINGS',      group: 'Outils' },
  { key: 'admins',        label: 'Administrateurs',    icon: '🔑', permission: 'ADMINS',        group: 'Outils' },
  { key: 'currency',      label: 'Devis',              icon: '💱', permission: 'CURRENCY',      group: 'Outils' },
  { key: 'audit',         label: "Journal d'audit",    icon: '📋', permission: 'AUDIT',         group: 'Outils' },
  { key: 'appeals',       label: 'Appels',             icon: '📩', permission: 'USERS',         group: 'Général' },
  { key: 'app-version',   label: 'App Mobile',         icon: '📱', permission: 'SETTINGS',      group: 'Système' },
  { key: 'settings',      label: 'Paramètres',         icon: '⚙️', permission: 'SETTINGS',      group: 'Système' },
  { key: 'messaging',     label: 'Messagerie',         icon: '💬', permission: 'MESSAGING',     group: 'Système' },
  { key: 'subscriptions',  label: 'Abonnements & IA',   icon: '💳', permission: 'SUBSCRIPTIONS', group: 'Outils' },
  { key: 'verification',   label: 'Vérifications',      icon: '✅', permission: 'VERIFICATION',  group: 'Outils' },
  { key: 'incentives',      label: 'Coupons & Incentives', icon: '🎟️', permission: 'SUBSCRIPTIONS', group: 'Outils' },

  // Intelligence Artificielle
  { key: 'ia-analytique',  label: 'Kin-Sell Analytique', icon: '📈', permission: 'AI_MANAGEMENT', group: 'Intelligence Artificielle' },
  { key: 'ia-marchande',   label: 'IA Marchande',       icon: '🏷️', permission: 'AI_MANAGEMENT', group: 'Intelligence Artificielle' },
  { key: 'ia-commande',    label: 'IA de Commande',     icon: '🤖', permission: 'AI_MANAGEMENT', group: 'Intelligence Artificielle' },
  { key: 'ia-ads',         label: 'IA ADS',             icon: '📣', permission: 'ADS',           group: 'Intelligence Artificielle' },
  { key: 'ia-message',     label: 'IA Message',         icon: '📨', permission: 'AI_MANAGEMENT', group: 'Intelligence Artificielle' },
];

function roleBadgeClass(role: string) {
  if (role === 'SUPER_ADMIN') return 'ad-badge ad-badge--super-admin';
  if (role === 'ADMIN') return 'ad-badge ad-badge--admin';
  if (role === 'BUSINESS') return 'ad-badge ad-badge--business';
  return 'ad-badge ad-badge--user';
}
function statusBadgeClass(status: string) {
  if (status === 'ACTIVE' || status === 'DELIVERED' || status === 'RESOLVED') return 'ad-badge ad-badge--active';
  if (status === 'SUSPENDED' || status === 'CANCELED') return 'ad-badge ad-badge--danger';
  if (status === 'PENDING_DELETION') return 'ad-badge ad-badge--warning';
  if (status === 'PENDING' || status === 'IN_PROGRESS') return 'ad-badge ad-badge--pending';
  return 'ad-badge';
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isLoading, isLoggedIn, logout } = useAuth();
  const { t, formatMoneyFromUsdCents, formatDate } = useLocaleCurrency();
  const money = useCallback((usdCents: number) => formatMoneyFromUsdCents(usdCents), [formatMoneyFromUsdCents]);
  const tutorial = useTutorial('admin-dashboard');
  const moneyCdf = useCallback((usdCents: number) => formatMoneyFromUsdCents(usdCents), [formatMoneyFromUsdCents]);
  const fmtDate = useCallback((iso: string) => formatDate(iso), [formatDate]);

  const [adminMe, setAdminMe] = useState<AdminMe | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSection>(() => {
    if (typeof window !== 'undefined') {
      const urlSection = new URLSearchParams(window.location.search).get('section');
      if (urlSection === 'messages') return 'messaging';
      if (urlSection && SECTION_DEFS.some(s => s.key === urlSection)) return urlSection as AdminSection;
    }
    const stored = sessionStorage.getItem('ud-section');
    if (stored) {
      sessionStorage.removeItem('ud-section');
      if (stored === 'messages') return 'messaging';
      return stored as AdminSection;
    }
    return 'dashboard';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (activeSection === 'messaging') {
      navigate('/messaging', { replace: true });
    }
  }, [activeSection, navigate]);

  // Dashboard
  const [stats, setStats] = useState<AdminStats | null>(null);

  // Users
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState('ALL');
  const [usersStatusFilter, setUsersStatusFilter] = useState('ALL');
  const [usersCountryFilter, setUsersCountryFilter] = useState('ALL');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  // User modals
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [modalUserId, setModalUserId] = useState<string | null>(null);
  const [modalRole, setModalRole] = useState('USER');
  const [suspendDuration, setSuspendDuration] = useState(24);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendPassword, setSuspendPassword] = useState('');
  const [messageText, setMessageText] = useState('');
  const [createUserForm, setCreateUserForm] = useState({ email: '', password: '', displayName: '', role: 'USER' });

  // Blog
  const [blogPosts, setBlogPosts] = useState<AdminBlogPost[]>([]);
  const [blogTotal, setBlogTotal] = useState(0);
  const [blogPage, setBlogPage] = useState(1);
  const [blogStatusFilter, setBlogStatusFilter] = useState('ALL');
  const [blogCategoryFilter, setBlogCategoryFilter] = useState('ALL');
  const [blogSearch, setBlogSearch] = useState('');
  const [blogSortBy, setBlogSortBy] = useState('created');
  const [blogAnalytics, setBlogAnalytics] = useState<BlogAnalytics | null>(null);
  const [blogForm, setBlogForm] = useState({
    title: '', content: '', excerpt: '', coverImage: '', mediaUrl: '', mediaType: '',
    gifUrl: '', category: 'general', tags: '' as string, language: 'fr',
    metaTitle: '', metaDescription: '', status: 'DRAFT',
  });
  const [editingBlogId, setEditingBlogId] = useState<string | null>(null);
  const [blogPreview, setBlogPreview] = useState<AdminBlogPostDetail | null>(null);
  const [blogUploadBusy, setBlogUploadBusy] = useState(false);

  // Transactions
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPage, setTxPage] = useState(1);
  const [txStatusFilter, setTxStatusFilter] = useState('ALL');
  const [txSummary, setTxSummary] = useState<{
    totalRevenueUsdCents: number; completedCount: number; completedUsdCents: number;
    pendingCount: number; pendingUsdCents: number; canceledCount: number; canceledUsdCents: number;
  } | null>(null);

  // Reports
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsStatusFilter, setReportsStatusFilter] = useState('ALL');
  const [selectedReport, setSelectedReport] = useState<AdminReport | null>(null);
  const [reportResolution, setReportResolution] = useState('');

  // Ads
  const [adOffers, setAdOffers] = useState<AdminAdOffer[]>([]);
  const [adForm, setAdForm] = useState({ name: '', description: '', priceUsdCents: 0, durationDays: 30, features: '' });
  const [editingAdId, setEditingAdId] = useState<string | null>(null);

  // AI Management
  const [aiAgents, setAiAgents] = useState<AdminAiAgent[]>([]);
  const [aiStats, setAiStats] = useState<AiManagementStats | null>(null);
  const [aiSelectedAgent, setAiSelectedAgent] = useState<AiAgentDetail | null>(null);
  const [aiStatusFilter, setAiStatusFilter] = useState('');
  const [aiDomainFilter, setAiDomainFilter] = useState('');
  const [aiTypeFilter, setAiTypeFilter] = useState('');
  const [aiDetailTab, setAiDetailTab] = useState<'mission' | 'zones' | 'users' | 'data' | 'performance' | 'logs' | 'plans'>('mission');
  const [aiLogsPage, setAiLogsPage] = useState(1);
  const [aiLogs, setAiLogs] = useState<AiLogEntry[]>([]);
  const [aiLogsTotal, setAiLogsTotal] = useState(0);

  // MessageGuard AI
  const [mgDashboard, setMgDashboard] = useState<MessageGuardDashboard | null>(null);
  const [mgLogs, setMgLogs] = useState<MessageGuardLogEntry[]>([]);
  const [mgLogsTotal, setMgLogsTotal] = useState(0);
  const [mgLogsPage, setMgLogsPage] = useState(1);
  const [mgVerdictFilter, setMgVerdictFilter] = useState<'all' | 'WARNED' | 'BLOCKED'>('all');
  const [mgEnabled, setMgEnabled] = useState(true);
  const [mgSeverity, setMgSeverity] = useState(3);

  // Rankings
  const [rankings, setRankings] = useState<AdminRanking[]>([]);
  const [rankPeriod, setRankPeriod] = useState<'all' | 'month'>('all');
  const [rankType, setRankType] = useState<'all' | 'user' | 'business'>('all');

  // Admins
  const [adminsList, setAdminsList] = useState<AdminMember[]>([]);
  const [editingAdmin, setEditingAdmin] = useState<AdminMember | null>(null);
  const [adminLevel, setAdminLevel] = useState('LEVEL_5');
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);

  // Admin Create
  const [createAdminForm, setCreateAdminForm] = useState({ email: '', password: '', displayName: '', level: 'LEVEL_5' });
  const [createAdminPermissions, setCreateAdminPermissions] = useState<string[]>(LEVEL_DEFAULT_PERMS['LEVEL_5'] ?? ['DASHBOARD']);

  // Appeals
  const [appealsList, setAppealsList] = useState<AdminAppeal[]>([]);
  const [appealsTotal, setAppealsTotal] = useState(0);
  const [appealsPage, setAppealsPage] = useState(1);

  // Subscriptions & AI Trials
  const [subStats, setSubStats] = useState<AdminAiRecommendationStats | null>(null);
  const [subKpi, setSubKpi] = useState<AdminSubscriptionKpi | null>(null);
  const [subList, setSubList] = useState<AdminSubscriptionItem[]>([]);
  const [subTotal, setSubTotal] = useState(0);
  const [subPage, setSubPage] = useState(1);
  const [trialList, setTrialList] = useState<AdminAiTrialItem[]>([]);
  const [trialTotal, setTrialTotal] = useState(0);
  const [trialPage, setTrialPage] = useState(1);
  const [subSubTab, setSubSubTab] = useState<'kpi' | 'subs' | 'trials' | 'orders' | 'activate'>('kpi');
  const [activateForm, setActivateForm] = useState({ userId: '', planCode: 'BOOST', durationDays: 30, reason: '', exempt: false });
  const [activateMsg, setActivateMsg] = useState<string | null>(null);
  const [activateUserSearch, setActivateUserSearch] = useState('');
  const [activateUserResults, setActivateUserResults] = useState<AdminUser[]>([]);
  const [activateUserLoading, setActivateUserLoading] = useState(false);
  const [activateSelectedUser, setActivateSelectedUser] = useState<AdminUser | null>(null);
  // Subscription filters
  const [subFilterEmail, setSubFilterEmail] = useState('');
  const [subFilterStatus, setSubFilterStatus] = useState('ALL');
  const [subFilterScope, setSubFilterScope] = useState('ALL');
  const [subFilterPlan, setSubFilterPlan] = useState('ALL');
  const [subFilterSource, setSubFilterSource] = useState('ALL');
  // Subscription detail
  const [subDetail, setSubDetail] = useState<AdminSubscriptionDetail | null>(null);
  const [subDetailLoading, setSubDetailLoading] = useState(false);
  const [subActionBusy, setSubActionBusy] = useState<string | null>(null);

  // Billing orders admin
  const [orderList, setOrderList] = useState<AdminBillingOrderItem[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderActionBusy, setOrderActionBusy] = useState<string | null>(null);
  const [orderActionMsg, setOrderActionMsg] = useState<string | null>(null);
  const [orderReasonInput, setOrderReasonInput] = useState('');

  // Currency
  const [currencyRates, setCurrencyRates] = useState<AdminCurrencyRate[]>([]);
  const [currencyForm, setCurrencyForm] = useState({ fromCurrency: 'USD', toCurrency: 'CDF', rate: 2850 });

  // Audit
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);

  // Settings
  const [siteSettings, setSiteSettings] = useState<Record<string, string>>({});

  // App Version
  const [appVersionInfo, setAppVersionInfo] = useState<{ version: string | null; build: number | null; apkUrl: string | null; forceUpdate: boolean; releaseNotes: string | null } | null>(null);
  const [appVersionForm, setAppVersionForm] = useState({ version: '', build: 1, apkUrl: '', forceUpdate: false, releaseNotes: '' });
  const [appVersionSaving, setAppVersionSaving] = useState(false);
  const [appVersionMsg, setAppVersionMsg] = useState<string | null>(null);

  // Feed (So-Kin)
  const [feedPosts, setFeedPosts] = useState<AdminFeedPost[]>([]);
  const [feedTotal, setFeedTotal] = useState(0);
  const [feedPage, setFeedPage] = useState(1);
  const [feedStatusFilter, setFeedStatusFilter] = useState('ALL');
  const [feedSearch, setFeedSearch] = useState('');
  const [feedStats, setFeedStats] = useState<AdminFeedStats | null>(null);
  const [feedModerateId, setFeedModerateId] = useState<string | null>(null);
  const [feedModerateAction, setFeedModerateAction] = useState<string>('HIDDEN');
  const [feedModerateNote, setFeedModerateNote] = useState('');

  // Donations
  const [donationsList, setDonationsList] = useState<AdminDonation[]>([]);
  const [donationsTotal, setDonationsTotal] = useState(0);
  const [donationsPage, setDonationsPage] = useState(1);
  const [donationsStatusFilter, setDonationsStatusFilter] = useState('ALL');
  const [donationsTypeFilter, setDonationsTypeFilter] = useState('ALL');
  const [donationsSummary, setDonationsSummary] = useState<AdminDonationSummary | null>(null);

  // Advertisements clients
  const [advList, setAdvList] = useState<AdminAdvertisement[]>([]);
  const [advTotal, setAdvTotal] = useState(0);
  const [advPage, setAdvPage] = useState(1);
  const [advStatusFilter, setAdvStatusFilter] = useState('ALL');
  const [advTypeFilter, setAdvTypeFilter] = useState('ALL');
  const [advSearch, setAdvSearch] = useState('');
  const [editingAdvId, setEditingAdvId] = useState<string | null>(null);

  // Listings (Admin)
  const [adminListings, setAdminListings] = useState<AdminListingItem[]>([]);
  const [adminListingsTotal, setAdminListingsTotal] = useState(0);
  const [adminListingsPage, setAdminListingsPage] = useState(1);
  const [adminListingsStatusFilter, setAdminListingsStatusFilter] = useState('ALL');
  const [adminListingsTypeFilter, setAdminListingsTypeFilter] = useState('ALL');
  const [adminListingsSearch, setAdminListingsSearch] = useState('');
  // Category Negotiation Rules
  const [negoRules, setNegoRules] = useState<CategoryNegotiationRule[]>([]);
  const [negoRulesBusy, setNegoRulesBusy] = useState(false);
  const [advForm, setAdvForm] = useState({
    title: '', description: '', imageUrl: '', linkUrl: '/', ctaText: 'D\u00e9couvrir',
    type: 'USER', targetPages: [] as string[], startDate: '', endDate: '',
    paymentRef: '', amountPaidCents: 0, priority: 0,
    advertiserEmail: '', advertiserName: '',
  });

  // Security
  const [secDashboard, setSecDashboard] = useState<SecurityDashboard | null>(null);
  const [secEvents, setSecEvents] = useState<SecurityEvent[]>([]);
  const [secEventsTotal, setSecEventsTotal] = useState(0);
  const [secEventsPage, setSecEventsPage] = useState(1);
  const [fraudSignals, setFraudSignals] = useState<FraudSignal[]>([]);
  const [fraudTotal, setFraudTotal] = useState(0);
  const [fraudPage, setFraudPage] = useState(1);
  const [fraudFilter, setFraudFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [restrictions, setRestrictions] = useState<UserRestriction[]>([]);
  const [restrictionsTotal, setRestrictionsTotal] = useState(0);
  const [restrictionsPage, setRestrictionsPage] = useState(1);
  const [restrictionsFilter, setRestrictionsFilter] = useState<'all' | 'active' | 'lifted'>('active');
  const [trustLookupId, setTrustLookupId] = useState('');
  const [trustLookupResult, setTrustLookupResult] = useState<{ score: number; level: string; history: Array<{ id: string; delta: number; reason: string; source: string; newScore: number; newLevel: string; createdAt: string }> } | null>(null);
  const [trustAdjustDelta, setTrustAdjustDelta] = useState(0);
  const [trustAdjustReason, setTrustAdjustReason] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Permissions check ──
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const myPermissions = useMemo(() => {
    if (isSuperAdmin) return ALL_PERMISSIONS;
    return adminMe?.permissions ?? ['DASHBOARD'];
  }, [isSuperAdmin, adminMe]);

  const hasPermission = useCallback((p: string) => isSuperAdmin || myPermissions.includes(p), [isSuperAdmin, myPermissions]);
  const visibleSections = useMemo(() => SECTION_DEFS.filter(s => hasPermission(s.permission)), [hasPermission]);

  // ── Initial load ──
  useEffect(() => {
    if (!isLoggedIn || !user) return;
    admin.me().then(setAdminMe).catch(() => {});
  }, [isLoggedIn, user]);

  // ── Section data loading ──
  const loadSectionData = useCallback(async () => {
    setError(null);
    try {
      switch (activeSection) {
        case 'dashboard': {
          const s = await admin.stats();
          setStats(s);
          break;
        }
        case 'users': {
          const res = await admin.users({ page: usersPage, limit: 20, search: usersSearch || undefined, role: usersRoleFilter !== 'ALL' ? usersRoleFilter : undefined, status: usersStatusFilter !== 'ALL' ? usersStatusFilter : undefined, country: usersCountryFilter !== 'ALL' ? usersCountryFilter : undefined });
          setUsersList(res.users);
          setUsersTotal(res.total);
          break;
        }
        case 'blog': {
          const [res, analytics] = await Promise.all([
            admin.blogPosts({
              page: blogPage, limit: 20,
              status: blogStatusFilter !== 'ALL' ? blogStatusFilter : undefined,
              category: blogCategoryFilter !== 'ALL' ? blogCategoryFilter : undefined,
              search: blogSearch || undefined,
              sortBy: blogSortBy !== 'created' ? blogSortBy : undefined,
            }),
            admin.blogAnalytics().catch(() => null),
          ]);
          setBlogPosts(res.posts);
          setBlogTotal(res.total);
          setBlogAnalytics(analytics);
          break;
        }
        case 'transactions': {
          const res = await admin.transactions({ page: txPage, limit: 20, status: txStatusFilter !== 'ALL' ? txStatusFilter : undefined });
          setTransactions(res.orders);
          setTxTotal(res.total);
          setTxSummary(res.summary);
          break;
        }
        case 'reports': {
          const res = await admin.reports({ page: reportsPage, limit: 20, status: reportsStatusFilter !== 'ALL' ? reportsStatusFilter : undefined });
          setReports(res.reports);
          setReportsTotal(res.total);
          break;
        }
        case 'ads': {
          const res = await admin.adOffers();
          setAdOffers(res);
          break;
        }
        case 'feed': {
          const [postsRes, statsRes] = await Promise.all([
            admin.feedPosts({ page: feedPage, limit: 20, status: feedStatusFilter !== 'ALL' ? feedStatusFilter : undefined, search: feedSearch || undefined }),
            admin.feedStats(),
          ]);
          setFeedPosts(postsRes.posts);
          setFeedTotal(postsRes.total);
          setFeedStats(statsRes);
          break;
        }
        case 'donations': {
          const res = await admin.donations({ page: donationsPage, limit: 20, status: donationsStatusFilter !== 'ALL' ? donationsStatusFilter : undefined, type: donationsTypeFilter !== 'ALL' ? donationsTypeFilter : undefined });
          setDonationsList(res.donations);
          setDonationsTotal(res.total);
          setDonationsSummary(res.summary);
          break;
        }
        case 'advertisements': {
          const res = await admin.advertisements({ page: advPage, limit: 20, status: advStatusFilter !== 'ALL' ? advStatusFilter : undefined, type: advTypeFilter !== 'ALL' ? advTypeFilter : undefined, search: advSearch || undefined });
          setAdvList(res.ads);
          setAdvTotal(res.total);
          break;
        }
        case 'listings': {
          const res = await admin.listings({ page: adminListingsPage, limit: 20, status: adminListingsStatusFilter !== 'ALL' ? adminListingsStatusFilter : undefined, type: adminListingsTypeFilter !== 'ALL' ? adminListingsTypeFilter : undefined, q: adminListingsSearch || undefined });
          setAdminListings(res.listings);
          setAdminListingsTotal(res.total);
          break;
        }
        case 'negotiation-rules': {
          const rules = await admin.negotiationRules();
          setNegoRules(rules);
          break;
        }
        case 'ai-management': {
          const [agents, stats] = await Promise.all([
            admin.aiAgents({ status: aiStatusFilter || undefined, domain: aiDomainFilter || undefined, type: aiTypeFilter || undefined }),
            admin.aiAgentStats(),
          ]);
          setAiAgents(agents);
          setAiStats(stats);
          // Also load MessageGuard dashboard
          try {
            const mgd = await admin.messageGuardDashboard();
            setMgDashboard(mgd);
            setMgEnabled(mgd.enabled);
            setMgSeverity(mgd.severity);
            const mgl = await admin.messageGuardLogs({ page: mgLogsPage, limit: 20, verdict: mgVerdictFilter !== 'all' ? mgVerdictFilter : undefined });
            setMgLogs(mgl.logs);
            setMgLogsTotal(mgl.total);
          } catch { /* ignore if new */ }
          break;
        }
        case 'rankings': {
          const res = await admin.rankings({ period: rankPeriod, type: rankType });
          setRankings(res);
          break;
        }
        case 'admins': {
          const res = await admin.admins();
          setAdminsList(res);
          break;
        }
        case 'appeals': {
          const res = await admin.appeals({ page: appealsPage, limit: 20 });
          setAppealsList(res.appeals);
          setAppealsTotal(res.total);
          break;
        }
        case 'currency': {
          const res = await admin.currencyRates();
          setCurrencyRates(res);
          break;
        }
        case 'audit': {
          const res = await admin.auditLogs({ page: auditPage, limit: 30 });
          setAuditLogs(res.logs);
          setAuditTotal(res.total);
          break;
        }
        case 'settings': {
          const res = await admin.siteSettings();
          setSiteSettings(res);
          break;
        }
        case 'app-version': {
          const av = await request<{ version: string | null; build: number | null; apkUrl: string | null; forceUpdate: boolean; releaseNotes: string | null }>('/app-version/android');
          setAppVersionInfo(av);
          if (av.version) {
            setAppVersionForm({ version: av.version ?? '', build: av.build ?? 1, apkUrl: av.apkUrl ?? '', forceUpdate: av.forceUpdate, releaseNotes: av.releaseNotes ?? '' });
          }
          break;
        }
        case 'security': {
          const dash = await admin.securityDashboard();
          setSecDashboard(dash);
          const ev = await admin.securityEvents({ page: secEventsPage, limit: 20 });
          setSecEvents(ev.events);
          setSecEventsTotal(ev.total);
          break;
        }
        case 'antifraud': {
          const resolved = fraudFilter === 'resolved' ? 'true' : fraudFilter === 'open' ? 'false' : undefined;
          const res = await admin.fraudSignals({ page: fraudPage, limit: 20, resolved });
          setFraudSignals(res.signals);
          setFraudTotal(res.total);
          break;
        }
        case 'security-ai': {
          const isActive = restrictionsFilter === 'active' ? 'true' : restrictionsFilter === 'lifted' ? 'false' : undefined;
          const res = await admin.restrictions({ page: restrictionsPage, limit: 20, isActive });
          setRestrictions(res.restrictions);
          setRestrictionsTotal(res.total);
          break;
        }
        case 'subscriptions': {
          const [kpi, stats, subs, trials, orders] = await Promise.all([
            admin.subscriptionKpi(),
            admin.aiRecommendationStats(),
            admin.subscriptions({
              page: subPage,
              limit: 20,
              status: subFilterStatus !== 'ALL' ? subFilterStatus : undefined,
              scope: subFilterScope !== 'ALL' ? subFilterScope : undefined,
              planCode: subFilterPlan !== 'ALL' ? subFilterPlan : undefined,
              source: subFilterSource !== 'ALL' ? subFilterSource : undefined,
              email: subFilterEmail || undefined,
            }),
            admin.aiTrials({ page: trialPage, limit: 20 }),
            admin.billingOrders({ page: orderPage, limit: 20, status: orderStatusFilter !== 'ALL' ? orderStatusFilter : undefined }),
          ]);
          setSubKpi(kpi);
          setSubStats(stats);
          setSubList(subs.subscriptions ?? []);
          setSubTotal(subs.total ?? 0);
          setTrialList(trials.trials ?? []);
          setTrialTotal(trials.total ?? 0);
          setOrderList(orders.items ?? []);
          setOrderTotal(orders.total ?? 0);
          break;
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement');
    }
  }, [activeSection, usersPage, usersSearch, usersRoleFilter, usersStatusFilter, usersCountryFilter, blogPage, blogStatusFilter, blogCategoryFilter, blogSearch, blogSortBy, txPage, txStatusFilter, reportsPage, reportsStatusFilter, rankPeriod, rankType, auditPage, secEventsPage, fraudPage, fraudFilter, restrictionsPage, restrictionsFilter, mgLogsPage, mgVerdictFilter, aiStatusFilter, aiDomainFilter, aiTypeFilter, feedPage, feedStatusFilter, feedSearch, donationsPage, donationsStatusFilter, donationsTypeFilter, advPage, advStatusFilter, advTypeFilter, advSearch, adminListingsPage, adminListingsStatusFilter, adminListingsTypeFilter, adminListingsSearch, appealsPage, subPage, trialPage, orderPage, orderStatusFilter, subFilterEmail, subFilterStatus, subFilterScope, subFilterPlan, subFilterSource]);

  useEffect(() => { if (isLoggedIn) loadSectionData(); }, [loadSectionData, isLoggedIn]);

  // ── User search for activate tab ──
  useEffect(() => {
    if (!activateUserSearch || activateUserSearch.length < 2) { setActivateUserResults([]); return; }
    const timer = setTimeout(async () => {
      setActivateUserLoading(true);
      try {
        const res = await admin.users({ search: activateUserSearch, limit: 10 });
        setActivateUserResults(res.users);
      } catch { setActivateUserResults([]); }
      setActivateUserLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [activateUserSearch]);

  // ── Auth guard ──
  if (isLoading) return <div className="ad-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Chargement…</p></div>;
  if (!isLoggedIn || !user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') return <Navigate to={getDashboardPath(user.role)} replace />;

  const displayName = user.profile?.displayName ?? 'Admin';

  // ── Handlers ──
  const openUserDetail = async (userId: string) => {
    try {
      const detail = await admin.userDetail(userId);
      setSelectedUser(detail);
      setModal('user-detail');
    } catch { setError('Erreur chargement détail utilisateur'); }
  };

  const openUserRole = (userId: string, currentRole: string) => {
    setModalUserId(userId);
    setModalRole(currentRole);
    setModal('user-role');
  };

  const handleChangeRole = async () => {
    if (!modalUserId) return;
    setBusy(true);
    try {
      await admin.changeUserRole(modalUserId, modalRole);
      setModal(null);
      invalidateCache('/admin/users');
      loadSectionData();
      setSuccess('Rôle modifié');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const openSuspend = (userId: string) => {
    setModalUserId(userId);
    setSuspendDuration(24);
    setSuspendReason('');
    setSuspendPassword('');
    setModal('user-suspend');
  };

  const handleSuspend = async () => {
    if (!modalUserId) return;
    setBusy(true);
    try {
      await admin.suspendUser(modalUserId, { durationHours: suspendDuration, reason: suspendReason, adminPassword: suspendPassword });
      setModal(null);
      invalidateCache('/admin/users');
      loadSectionData();
      setSuccess('Compte suspendu');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleUnsuspend = async (userId: string) => {
    setBusy(true);
    try {
      await admin.unsuspendUser(userId);
      invalidateCache('/admin/users');
      loadSectionData();
      setSuccess('Compte réactivé');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleCreateUser = async () => {
    setBusy(true);
    try {
      await admin.createUser(createUserForm);
      setModal(null);
      setCreateUserForm({ email: '', password: '', displayName: '', role: 'USER' });
      invalidateCache('/admin/users');
      loadSectionData();
      setSuccess('Utilisateur créé');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const resetBlogForm = () => {
    setBlogForm({
      title: '', content: '', excerpt: '', coverImage: '', mediaUrl: '', mediaType: '',
      gifUrl: '', category: 'general', tags: '', language: 'fr',
      metaTitle: '', metaDescription: '', status: 'DRAFT',
    });
    setEditingBlogId(null);
  };

  const handleEditBlog = async (postId: string) => {
    try {
      const detail = await admin.blogPost(postId);
      setBlogForm({
        title: detail.title,
        content: detail.content,
        excerpt: detail.excerpt ?? '',
        coverImage: detail.coverImage ?? '',
        mediaUrl: detail.mediaUrl ?? '',
        mediaType: detail.mediaType ?? '',
        gifUrl: detail.gifUrl ?? '',
        category: detail.category,
        tags: detail.tags.join(', '),
        language: detail.language,
        metaTitle: detail.metaTitle ?? '',
        metaDescription: detail.metaDescription ?? '',
        status: detail.status,
      });
      setEditingBlogId(postId);
      setModal('blog-edit');
    } catch (e: any) { setError(e?.message); }
  };

  const handlePreviewBlog = async (postId: string) => {
    try {
      const detail = await admin.blogPost(postId);
      setBlogPreview(detail);
      setModal('blog-preview');
    } catch (e: any) { setError(e?.message); }
  };

  const handleCreateBlog = async () => {
    setBusy(true);
    try {
      const payload = {
        ...blogForm,
        tags: blogForm.tags ? blogForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };
      if (editingBlogId) {
        await admin.updateBlogPost(editingBlogId, payload);
      } else {
        await admin.createBlogPost(payload);
      }
      setModal(null);
      resetBlogForm();
      invalidateCache('/admin/blog');
      loadSectionData();
      setSuccess(editingBlogId ? 'Article modifié' : 'Article créé');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleGenerateBlogAnnouncements = async () => {
    if (!isSuperAdmin) {
      setError('Action réservée au super admin');
      return;
    }
    if (!confirm('Générer automatiquement 15 annonces publiées pour le blog ?')) return;
    setBusy(true);
    try {
      const result = await admin.generateBlogAnnouncements({ count: 15 });
      invalidateCache('/admin/blog');
      await loadSectionData();
      setSuccess(`${result.created} annonces générées (${result.source})`);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de générer les annonces');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadBlogMedia = async (file: File, field: 'coverImage' | 'mediaUrl' | 'gifUrl') => {
    setBlogUploadBusy(true);
    try {
      const formData = new FormData();
      formData.append('files', file);
      const res = await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload échoué');
      const json = await res.json();
      const url = json.urls?.[0] ?? '';
      if (url) {
        setBlogForm(f => ({
          ...f,
          [field]: url,
          ...(field === 'mediaUrl' && file.type.startsWith('video') ? { mediaType: 'video' } : {}),
          ...(field === 'mediaUrl' && file.type.startsWith('image') ? { mediaType: 'image' } : {}),
        }));
        setSuccess('Média uploadé');
      }
    } catch (e: any) { setError(e?.message); } finally { setBlogUploadBusy(false); }
  };

  const handleDeleteBlog = async (id: string) => {
    if (!confirm('Supprimer définitivement cet article ?')) return;
    setBusy(true);
    try {
      await admin.deleteBlogPost(id);
      invalidateCache('/admin/blog');
      loadSectionData();
      setSuccess('Article supprimé');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleResolveReport = async () => {
    if (!selectedReport) return;
    setBusy(true);
    try {
      await admin.resolveReport(selectedReport.id, reportResolution);
      setModal(null);
      setSelectedReport(null);
      invalidateCache('/admin/reports');
      loadSectionData();
      setSuccess('Signalement résolu');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleSaveAd = async () => {
    setBusy(true);
    try {
      if (editingAdId) {
        await admin.updateAdOffer(editingAdId, { ...adForm, features: adForm.features.split(',').map(f => f.trim()).filter(Boolean) });
      } else {
        await admin.createAdOffer({ ...adForm, features: adForm.features.split(',').map(f => f.trim()).filter(Boolean) });
      }
      setModal(null);
      setEditingAdId(null);
      setAdForm({ name: '', description: '', priceUsdCents: 0, durationDays: 30, features: '' });
      invalidateCache('/admin/ads');
      loadSectionData();
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleSaveAdminProfile = async () => {
    if (!editingAdmin) return;
    setBusy(true);
    try {
      await admin.updateAdminProfile(editingAdmin.id, { level: adminLevel, permissions: adminPermissions });
      setModal(null);
      setEditingAdmin(null);
      invalidateCache('/admin/admins');
      loadSectionData();
      setSuccess('Profil admin mis à jour');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleDemoteAdmin = async (userId: string) => {
    setBusy(true);
    try {
      await admin.demoteAdmin(userId);
      invalidateCache('/admin/admins');
      loadSectionData();
      setSuccess('Admin rétrogradé');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleCreateAdmin = async () => {
    if (!createAdminForm.email || !createAdminForm.password || !createAdminForm.displayName) return;
    setBusy(true);
    try {
      await admin.createAdmin({
        ...createAdminForm,
        permissions: createAdminPermissions,
      });
      setModal(null);
      setCreateAdminForm({ email: '', password: '', displayName: '', level: 'LEVEL_5' });
      setCreateAdminPermissions(LEVEL_DEFAULT_PERMS['LEVEL_5'] ?? ['DASHBOARD']);
      invalidateCache('/admin/admins');
      loadSectionData();
      setSuccess('Compte admin créé avec succès');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleSaveCurrency = async () => {
    setBusy(true);
    try {
      await admin.upsertCurrencyRate(currencyForm);
      setModal(null);
      invalidateCache('/admin/currency');
      loadSectionData();
      setSuccess('Taux mis à jour');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleSendAdminMessage = async () => {
    if (!modalUserId || !messageText.trim()) return;
    setBusy(true);
    try {
      await admin.sendAdminMessage(modalUserId, messageText.trim());
      setModal(null);
      setMessageText('');
      navigate('/messaging');
      setSuccess('Message envoyé. La conversation est disponible dans l’onglet Messagerie.');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const openFeedModeration = (postId: string, currentStatus: string) => {
    setFeedModerateId(postId);
    setFeedModerateAction(currentStatus === 'ACTIVE' ? 'HIDDEN' : 'ACTIVE');
    setFeedModerateNote('');
    setModal('feed-moderate');
  };

  const handleModerateFeed = async () => {
    if (!feedModerateId) return;
    setBusy(true);
    try {
      await admin.moderateFeedPost(feedModerateId, feedModerateAction, feedModerateNote || undefined);
      setModal(null);
      setFeedModerateId(null);
      setFeedModerateNote('');
      invalidateCache('/admin/feed');
      loadSectionData();
      setSuccess('Publication mise à jour');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleDonationStatus = async (id: string, status: 'COMPLETED' | 'REFUNDED' | 'FAILED') => {
    setBusy(true);
    try {
      await admin.updateDonationStatus(id, status);
      invalidateCache('/admin/donations');
      loadSectionData();
      setSuccess('Statut du paiement mis à jour');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleAdvCreate = async () => {
    setBusy(true);
    try {
      if (editingAdvId) {
        await admin.updateAdvertisement(editingAdvId, { ...advForm });
        setSuccess('Publicité mise à jour');
      } else {
        await admin.createAdvertisement({ ...advForm });
        setSuccess('Publicité créée');
      }
      invalidateCache('/admin/advertisements');
      setModal(null);
      setEditingAdvId(null);
      setAdvForm({ title: '', description: '', imageUrl: '', linkUrl: '/', ctaText: 'Découvrir', type: 'USER', targetPages: [], startDate: '', endDate: '', paymentRef: '', amountPaidCents: 0, priority: 0, advertiserEmail: '', advertiserName: '' });
      loadSectionData();
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleAdvPatchStatus = async (id: string, status: string, cancelNote?: string) => {
    setBusy(true);
    try {
      await admin.patchAdvertisementStatus(id, { status, cancelNote });
      invalidateCache('/admin/advertisements');
      setSuccess('Statut modifié');
      loadSectionData();
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleAdvDelete = async (id: string) => {
    if (!confirm('Supprimer définitivement cette publicité ?')) return;
    setBusy(true);
    try {
      await admin.deleteAdvertisement(id);
      invalidateCache('/admin/advertisements');
      setSuccess('Publicité supprimée');
      loadSectionData();
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleSettingsSync = async () => {
    setBusy(true);
    try {
      invalidateCache('/admin/settings');
      invalidateCache('/admin/stats');
      await Promise.all([admin.me().then(setAdminMe), loadSectionData()]);
      setSuccess('Synchronisation terminée');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleApiRefresh = async () => {
    setBusy(true);
    try {
      await loadSectionData();
      setSuccess('Données administrateur rechargées');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const handleRunCleanup = async () => {
    setBusy(true);
    try {
      const result = await admin.runCleanup();
      await loadSectionData();
      setSuccess(result.actions.join(' • '));
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === usersList.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(usersList.map(u => u.id)));
    }
  };

  const toggleSelectUser = (id: string) => {
    const next = new Set(selectedUsers);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedUsers(next);
  };

  // Clear success after delay
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); }
  }, [success]);

  /* ══════════════════════════════════════
     RENDER SECTIONS
     ══════════════════════════════════════ */

  const renderDashboard = () => {
    if (!stats) return <div className="ad-empty"><div className="ad-empty-icon">⏳</div><p className="ad-empty-msg">Chargement des statistiques…</p><button className="ad-btn ad-btn--primary" style={{marginTop:12}} onClick={loadSectionData}>↻ Réessayer</button></div>;
    return (
      <>
        <div className="ad-stats-grid">
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Utilisateurs</span><span className="ad-stat-icon">👥</span></div>
            <div className="ad-stat-value">{stats.totalUsers.toLocaleString()}</div>
            <div className="ad-stat-sub">{stats.activeUsers} actifs · {stats.suspendedUsers} suspendus</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Entreprises</span><span className="ad-stat-icon">🏢</span></div>
            <div className="ad-stat-value">{stats.totalBusinesses.toLocaleString()}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Administrateurs</span><span className="ad-stat-icon">🔑</span></div>
            <div className="ad-stat-value">{stats.totalAdmins}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Annonces</span><span className="ad-stat-icon">🧩</span></div>
            <div className="ad-stat-value">{stats.totalListings.toLocaleString()}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Transactions</span><span className="ad-stat-icon">💳</span></div>
            <div className="ad-stat-value">{stats.totalOrders.toLocaleString()}</div>
            <div className="ad-stat-sub">{stats.completedOrders} terminées · {stats.pendingOrders} en attente · {stats.canceledOrders} annulées</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Revenu total</span><span className="ad-stat-icon">💰</span></div>
            <div className="ad-stat-value ad-stat-value--accent">{money(stats.totalRevenueUsdCents)}</div>
            <div className="ad-stat-sub">{moneyCdf(stats.totalRevenueUsdCents)}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Revenu du mois</span><span className="ad-stat-icon">📅</span></div>
            <div className="ad-stat-value ad-stat-value--green">{money(stats.monthRevenueUsdCents)}</div>
            <div className="ad-stat-sub">{moneyCdf(stats.monthRevenueUsdCents)}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Revenu du jour</span><span className="ad-stat-icon">📈</span></div>
            <div className="ad-stat-value ad-stat-value--green">{money(stats.todayRevenueUsdCents)}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Signalements</span><span className="ad-stat-icon">🚨</span></div>
            <div className="ad-stat-value ad-stat-value--red">{stats.totalReports}</div>
            <div className="ad-stat-sub">{stats.pendingReports} en attente</div>
          </div>
        </div>
      </>
    );
  };

  const renderUsers = () => (
    <>
      <div className="ad-search-bar">
        <input className="ad-search-input" placeholder="Rechercher par nom, email, pseudo, ID…" value={usersSearch} onChange={e => { setUsersSearch(e.target.value); setUsersPage(1); }} />
        <select className="ad-select" value={usersRoleFilter} onChange={e => { setUsersRoleFilter(e.target.value); setUsersPage(1); }}>
          <option value="ALL">Tous les rôles</option>
          <option value="USER">Utilisateurs</option>
          <option value="BUSINESS">Entreprises</option>
          <option value="ADMIN">Admins</option>
          <option value="SUPER_ADMIN">Super Admin</option>
        </select>
        <select className="ad-select" value={usersStatusFilter} onChange={e => { setUsersStatusFilter(e.target.value); setUsersPage(1); }}>
          <option value="ALL">Tous les statuts</option>
          <option value="ACTIVE">Actif</option>
          <option value="SUSPENDED">Suspendu</option>
          <option value="PENDING_DELETION">En instance de suppression</option>
        </select>
        <select className="ad-select" value={usersCountryFilter} onChange={e => { setUsersCountryFilter(e.target.value); setUsersPage(1); }}>
          <option value="ALL">🌍 Tous les pays</option>
          <option value="RDC">🇨🇩 RD Congo</option>
          <option value="Congo">🇨🇬 Congo-Brazza</option>
          <option value="Cameroun">🇨🇲 Cameroun</option>
          <option value="Côte d'Ivoire">🇨🇮 Côte d'Ivoire</option>
          <option value="Sénégal">🇸🇳 Sénégal</option>
          <option value="France">🇫🇷 France</option>
          <option value="Belgique">🇧🇪 Belgique</option>
          <option value="Canada">🇨🇦 Canada</option>
        </select>
        <button className="ad-btn ad-btn--primary" onClick={() => { setCreateUserForm({ email: '', password: '', displayName: '', role: 'USER' }); setModal('user-create'); }}>+ Créer</button>
      </div>

      <div className="ad-panel">
        <div className="ad-panel-head">
          <h3 className="ad-panel-title">{usersTotal} utilisateur{usersTotal > 1 ? 's' : ''}{usersCountryFilter !== 'ALL' ? ` — ${usersCountryFilter}` : ''}</h3>
          {selectedUsers.size > 0 && <span className="ad-badge">{selectedUsers.size} sélectionné{selectedUsers.size > 1 ? 's' : ''}</span>}
        </div>
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <th><input type="checkbox" className="ad-checkbox" checked={selectedUsers.size === usersList.length && usersList.length > 0} onChange={toggleSelectAll} /></th>
                <th>Utilisateur</th>
                <th>Pays</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Inscrit le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map(u => (
                <tr key={u.id}>
                  <td><input type="checkbox" className="ad-checkbox" checked={selectedUsers.has(u.id)} onChange={() => toggleSelectUser(u.id)} /></td>
                  <td>
                    <div className="ad-table-user">
                      <div className="ad-table-avatar">
                        {u.avatarUrl ? <img src={resolveMediaUrl(u.avatarUrl)} alt="" /> : initials(u.displayName)}
                      </div>
                      <div>
                        <div className="ad-table-username">{u.displayName}</div>
                        <div className="ad-table-email">{u.email ?? u.phone ?? u.id.slice(0, 8)}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style={{ fontSize: 11, color: 'var(--ad-text-2)', whiteSpace: 'nowrap' }}>{u.country ? `${u.country}${u.city ? `, ${u.city}` : ''}` : '—'}</span></td>
                  <td><span className={roleBadgeClass(u.role)}>{u.role}</span></td>
                  <td><span className={statusBadgeClass(u.accountStatus)}>{u.accountStatus === 'ACTIVE' ? 'Actif' : u.accountStatus === 'SUSPENDED' ? 'Suspendu' : u.accountStatus === 'PENDING_DELETION' ? 'Suppression en cours' : u.accountStatus}</span></td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="ad-btn ad-btn--sm" onClick={() => openUserDetail(u.id)} title="Détails">👁</button>
                      <button className="ad-btn ad-btn--sm" onClick={() => openUserRole(u.id, u.role)} title="Rôle">🔄</button>
                      <button className="ad-btn ad-btn--sm" onClick={() => { setModalUserId(u.id); setMessageText(''); setModal('user-message'); }} title="Message">✉️</button>
                      {u.accountStatus === 'ACTIVE'
                        ? <button className="ad-btn ad-btn--sm ad-btn--danger" onClick={() => openSuspend(u.id)} title="Suspendre">🚫</button>
                        : <button className="ad-btn ad-btn--sm" onClick={() => handleUnsuspend(u.id)} title="Réactiver">✅</button>
                      }
                    </div>
                  </td>
                </tr>
              ))}
              {usersList.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucun utilisateur trouvé</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {usersTotal > 20 && (
          <div className="ad-pagination">
            <button className="ad-page-btn" disabled={usersPage <= 1} onClick={() => setUsersPage(p => p - 1)}>←</button>
            <span style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Page {usersPage} / {Math.ceil(usersTotal / 20)}</span>
            <button className="ad-page-btn" disabled={usersPage >= Math.ceil(usersTotal / 20)} onClick={() => setUsersPage(p => p + 1)}>→</button>
          </div>
        )}
      </div>
    </>
  );

  const renderBlog = () => (
    <>
      {/* Analytics cards */}
      {blogAnalytics && (
        <div className="ad-stats-grid">
          <div className="ad-stat-card"><div className="ad-stat-card-head"><span className="ad-stat-label">Total articles</span><span className="ad-stat-icon">📰</span></div><div className="ad-stat-value">{blogAnalytics.totalPosts}</div></div>
          <div className="ad-stat-card"><div className="ad-stat-card-head"><span className="ad-stat-label">Publiés</span><span className="ad-stat-icon">🟢</span></div><div className="ad-stat-value ad-stat-value--green">{blogAnalytics.published}</div></div>
          <div className="ad-stat-card"><div className="ad-stat-card-head"><span className="ad-stat-label">Brouillons</span><span className="ad-stat-icon">📝</span></div><div className="ad-stat-value ad-stat-value--amber">{blogAnalytics.drafts}</div></div>
          <div className="ad-stat-card"><div className="ad-stat-card-head"><span className="ad-stat-label">Vues totales</span><span className="ad-stat-icon">👁️</span></div><div className="ad-stat-value ad-stat-value--accent">{blogAnalytics.totalViews.toLocaleString()}</div></div>
        </div>
      )}

      {/* Top articles */}
      {blogAnalytics && blogAnalytics.topPosts.length > 0 && (
        <div className="ad-panel" style={{ marginBottom: 16 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ad-text-2)', marginBottom: 10 }}>🔥 Articles les plus lus</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {blogAnalytics.topPosts.map((tp, i) => (
              <div key={tp.id} style={{ padding: '6px 12px', background: 'rgba(111,88,255,0.08)', borderRadius: 8, fontSize: 12, color: 'var(--ad-text-2)' }}>
                #{i + 1} {tp.title.slice(0, 40)}{tp.title.length > 40 ? '…' : ''} — <strong>{tp.views}</strong> vues
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ad-panel-head">
        <h3 className="ad-panel-title">Kin-Sell Blog — {blogTotal} article{blogTotal > 1 ? 's' : ''}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isSuperAdmin && (
            <button className="ad-btn" onClick={handleGenerateBlogAnnouncements} disabled={busy}>✨ Générer 15 annonces IA</button>
          )}
          <button className="ad-btn ad-btn--primary" onClick={() => { resetBlogForm(); setModal('blog-edit'); }}>+ Nouvel article</button>
        </div>
      </div>

      {/* Filters */}
      <div className="ad-panel" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px', marginBottom: 12 }}>
        <select className="ad-select" style={{ width: 'auto' }} value={blogStatusFilter} onChange={e => { setBlogStatusFilter(e.target.value); setBlogPage(1); }}>
          <option value="ALL">Tous statuts</option>
          <option value="PUBLISHED">Publié</option>
          <option value="DRAFT">Brouillon</option>
          <option value="ARCHIVED">Archivé</option>
        </select>
        <select className="ad-select" style={{ width: 'auto' }} value={blogCategoryFilter} onChange={e => { setBlogCategoryFilter(e.target.value); setBlogPage(1); }}>
          <option value="ALL">Toutes catégories</option>
          <option value="general">Général</option>
          <option value="actualites">Actualités</option>
          <option value="conseils">Conseils</option>
          <option value="technologie">Technologie</option>
          <option value="business">Business</option>
          <option value="tutoriel">Tutoriel</option>
          <option value="annonce">Annonce</option>
        </select>
        <select className="ad-select" style={{ width: 'auto' }} value={blogSortBy} onChange={e => setBlogSortBy(e.target.value)}>
          <option value="created">Plus récents</option>
          <option value="published">Derniers publiés</option>
          <option value="views">Plus vus</option>
        </select>
        <input className="ad-input" style={{ width: 180 }} placeholder="🔍 Rechercher…" value={blogSearch} onChange={e => setBlogSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setBlogPage(1); loadSectionData(); } }} />
      </div>

      <div className="ad-panel">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th style={{ width: 50 }}>Image</th><th>Titre</th><th>Catégorie</th><th>Statut</th><th>Auteur</th><th>Vues</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {blogPosts.map(p => (
                <tr key={p.id}>
                  <td>
                    {p.coverImage ? (
                      <img src={resolveMediaUrl(p.coverImage)} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 8, background: 'rgba(111,88,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📰</div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--ad-text-1)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    {p.tags.length > 0 && <div style={{ fontSize: 10, color: 'var(--ad-text-3)', marginTop: 2 }}>{p.tags.map(t => `#${t}`).join(' ')}</div>}
                  </td>
                  <td><span className="ad-badge" style={{ textTransform: 'capitalize' }}>{p.category}</span></td>
                  <td><span className={statusBadgeClass(p.status)}>{p.status === 'PUBLISHED' ? 'Publié' : p.status === 'ARCHIVED' ? 'Archivé' : 'Brouillon'}</span></td>
                  <td style={{ fontSize: 12 }}>{p.author}</td>
                  <td><span style={{ fontSize: 12, color: 'var(--ad-text-2)' }}>👁️ {p.views}</span></td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(p.publishedAt ?? p.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="ad-btn ad-btn--sm" title="Aperçu" onClick={() => handlePreviewBlog(p.id)}>👁️</button>
                      <button className="ad-btn ad-btn--sm" title="Modifier" onClick={() => handleEditBlog(p.id)}>✏️</button>
                      <button className="ad-btn ad-btn--sm" title={p.status === 'PUBLISHED' ? 'Archiver' : 'Publier'} onClick={() => admin.updateBlogPost(p.id, { status: p.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED' }).then(() => { invalidateCache('/admin/blog'); loadSectionData(); })}>{p.status === 'PUBLISHED' ? '📦' : '🚀'}</button>
                      <button className="ad-btn ad-btn--sm ad-btn--danger" title="Supprimer" onClick={() => handleDeleteBlog(p.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {blogPosts.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucun article</td></tr>}
            </tbody>
          </table>
        </div>
        {blogTotal > 20 && (
          <div className="ad-pagination" style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
            <button className="ad-btn ad-btn--sm" disabled={blogPage <= 1} onClick={() => setBlogPage(p => p - 1)}>← Précédent</button>
            <span style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Page {blogPage} / {Math.ceil(blogTotal / 20)}</span>
            <button className="ad-btn ad-btn--sm" disabled={blogPage >= Math.ceil(blogTotal / 20)} onClick={() => setBlogPage(p => p + 1)}>Suivant →</button>
          </div>
        )}
      </div>
    </>
  );

  const renderTransactions = () => (
    <>
      {txSummary && (
        <div className="ad-stats-grid">
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Total transité</span><span className="ad-stat-icon">💰</span></div>
            <div className="ad-stat-value ad-stat-value--accent">{money(txSummary.totalRevenueUsdCents)}</div>
            <div className="ad-stat-sub">{moneyCdf(txSummary.totalRevenueUsdCents)}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Complétées</span><span className="ad-stat-icon">✅</span></div>
            <div className="ad-stat-value ad-stat-value--green">{txSummary.completedCount}</div>
            <div className="ad-stat-sub">{money(txSummary.completedUsdCents)}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">En attente</span><span className="ad-stat-icon">⏳</span></div>
            <div className="ad-stat-value ad-stat-value--amber">{txSummary.pendingCount}</div>
            <div className="ad-stat-sub">{money(txSummary.pendingUsdCents)}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-card-head"><span className="ad-stat-label">Annulées</span><span className="ad-stat-icon">❌</span></div>
            <div className="ad-stat-value ad-stat-value--red">{txSummary.canceledCount}</div>
            <div className="ad-stat-sub">{money(txSummary.canceledUsdCents)}</div>
          </div>
        </div>
      )}
      <div className="ad-search-bar">
        <select className="ad-select" value={txStatusFilter} onChange={e => { setTxStatusFilter(e.target.value); setTxPage(1); }}>
          <option value="ALL">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="CONFIRMED">Confirmée</option>
          <option value="PROCESSING">En cours</option>
          <option value="SHIPPED">Expédiée</option>
          <option value="DELIVERED">Livrée</option>
          <option value="CANCELED">Annulée</option>
        </select>
      </div>
      <div className="ad-panel">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>ID</th><th>Acheteur</th><th>Vendeur</th><th>Montant</th><th>Articles</th><th>Statut</th><th>Date</th></tr></thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{t.id.slice(0, 8)}</td>
                  <td>{t.buyer.displayName}</td>
                  <td>{t.seller.displayName}</td>
                  <td style={{ fontWeight: 600 }}>{money(t.totalUsdCents)}</td>
                  <td>{t.itemsCount}</td>
                  <td><span className={statusBadgeClass(t.status)}>{t.status}</span></td>
                  <td>{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
              {transactions.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucune transaction</td></tr>}
            </tbody>
          </table>
        </div>
        {txTotal > 20 && (
          <div className="ad-pagination">
            <button className="ad-page-btn" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>←</button>
            <span style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Page {txPage} / {Math.ceil(txTotal / 20)}</span>
            <button className="ad-page-btn" disabled={txPage >= Math.ceil(txTotal / 20)} onClick={() => setTxPage(p => p + 1)}>→</button>
          </div>
        )}
      </div>
    </>
  );

  const renderReports = () => (
    <>
      <div className="ad-search-bar">
        <select className="ad-select" value={reportsStatusFilter} onChange={e => { setReportsStatusFilter(e.target.value); setReportsPage(1); }}>
          <option value="ALL">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="RESOLVED">Résolus</option>
        </select>
      </div>
      <div className="ad-panel">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Accusateur</th><th>Signalé</th><th>Motif</th><th>Statut</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td>{r.reporter.displayName}</td>
                  <td>{r.reported.displayName}</td>
                  <td>{r.reason}</td>
                  <td><span className={statusBadgeClass(r.status)}>{r.status === 'PENDING' ? 'En attente' : r.status === 'IN_PROGRESS' ? 'En cours' : 'Résolu'}</span></td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td>
                    {r.status !== 'RESOLVED' && (
                      <button className="ad-btn ad-btn--sm ad-btn--primary" onClick={() => { setSelectedReport(r); setReportResolution(''); setModal('report-detail'); }}>Traiter</button>
                    )}
                  </td>
                </tr>
              ))}
              {reports.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucun signalement</td></tr>}
            </tbody>
          </table>
        </div>
        {reportsTotal > 20 && (
          <div className="ad-pagination">
            <button className="ad-page-btn" disabled={reportsPage <= 1} onClick={() => setReportsPage(p => p - 1)}>←</button>
            <span style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Page {reportsPage} / {Math.ceil(reportsTotal / 20)}</span>
            <button className="ad-page-btn" disabled={reportsPage >= Math.ceil(reportsTotal / 20)} onClick={() => setReportsPage(p => p + 1)}>→</button>
          </div>
        )}
      </div>
    </>
  );

  const renderFeed = () => (
    <>
      <div className="ad-stats-grid">
        <div className="ad-stat-card"><div className="ad-stat-value">{feedStats?.total ?? 0}</div><div className="ad-stat-label">Posts</div></div>
        <div className="ad-stat-card"><div className="ad-stat-value">{feedStats?.active ?? 0}</div><div className="ad-stat-label">Actifs</div></div>
        <div className="ad-stat-card"><div className="ad-stat-value">{feedStats?.flagged ?? 0}</div><div className="ad-stat-label">Signalés</div></div>
        <div className="ad-stat-card"><div className="ad-stat-value">{feedStats?.hidden ?? 0}</div><div className="ad-stat-label">Masqués</div></div>
      </div>
      <div className="ad-panel-head">
        <h3 className="ad-panel-title">Fil d'actualité So-Kin — {feedTotal} publication{feedTotal > 1 ? 's' : ''}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="ad-input" style={{ width: 220 }} placeholder="Rechercher dans les posts..." value={feedSearch} onChange={(e) => setFeedSearch(e.target.value)} />
          <select className="ad-select" value={feedStatusFilter} onChange={(e) => setFeedStatusFilter(e.target.value)}>
            <option value="ALL">Tous</option>
            <option value="ACTIVE">Actifs</option>
            <option value="FLAGGED">Signalés</option>
            <option value="HIDDEN">Masqués</option>
            <option value="DELETED">Supprimés</option>
          </select>
        </div>
      </div>
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Auteur</th>
              <th>Publication</th>
              <th>Stats</th>
              <th>Statut</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {feedPosts.map((post) => (
              <tr key={post.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="ad-avatar">{initials(post.authorName)}</div>
                    <div>
                      <div>{post.authorName}</div>
                      <div style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>{post.authorId}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ maxWidth: 420 }}>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{post.text}</div>
                    <div style={{ fontSize: 12, color: 'var(--ad-text-3)', marginTop: 6 }}>
                      {post.mediaUrls.length} média · visibilité {post.visibility} {post.sponsored ? '· sponsorisé' : ''}
                    </div>
                  </div>
                </td>
                <td>{post.likes} j'aime · {post.comments} commentaires · {post.shares} partages</td>
                <td><span className={statusBadgeClass(post.status)}>{post.status}</span></td>
                <td>{fmtDate(post.createdAt)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="ad-btn ad-btn--sm" onClick={() => openFeedModeration(post.id, post.status)}>
                      {post.status === 'ACTIVE' ? '🙈 Masquer' : '🟢 Réactiver'}
                    </button>
                    <button className="ad-btn ad-btn--sm" onClick={() => { setFeedModerateId(post.id); setFeedModerateAction('FLAGGED'); setFeedModerateNote(post.moderationNote ?? ''); setModal('feed-moderate'); }}>
                      🚩 Signaler
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {feedPosts.length === 0 && (
        <div className="ad-empty">
          <div className="ad-empty-icon">📢</div>
          <p className="ad-empty-msg">Aucune publication So-Kin trouvée pour ce filtre.</p>
        </div>
      )}
      <div className="ad-pagination">
        <button className="ad-btn" disabled={feedPage <= 1} onClick={() => setFeedPage((p) => Math.max(1, p - 1))}>Précédent</button>
        <span>Page {feedPage}</span>
        <button className="ad-btn" disabled={feedPosts.length < 20} onClick={() => setFeedPage((p) => p + 1)}>Suivant</button>
      </div>
    </>
  );

  const renderDonations = () => (
    <>
      <div className="ad-stats-grid">
        <div className="ad-stat-card"><div className="ad-stat-value">{money(donationsSummary?.totalRevenueUsdCents ?? 0)}</div><div className="ad-stat-label">Volume total</div></div>
        <div className="ad-stat-card"><div className="ad-stat-value">{money(donationsSummary?.completedRevenueUsdCents ?? 0)}</div><div className="ad-stat-label">Montant confirmé</div></div>
        <div className="ad-stat-card"><div className="ad-stat-value">{donationsSummary?.pendingCount ?? 0}</div><div className="ad-stat-label">En attente</div></div>
      </div>
      <div className="ad-panel-head">
        <h3 className="ad-panel-title">Dons & Montants des publicités — {donationsTotal} entrée{donationsTotal > 1 ? 's' : ''}</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="ad-select" value={donationsStatusFilter} onChange={(e) => setDonationsStatusFilter(e.target.value)}>
            <option value="ALL">Tous statuts</option>
            <option value="PENDING">En attente</option>
            <option value="COMPLETED">Complétés</option>
            <option value="REFUNDED">Remboursés</option>
            <option value="FAILED">Échoués</option>
          </select>
          <select className="ad-select" value={donationsTypeFilter} onChange={(e) => setDonationsTypeFilter(e.target.value)}>
            <option value="ALL">Tous types</option>
            <option value="AD_PURCHASE">Achat pub</option>
            <option value="DONATION">Don</option>
            <option value="BOOST">Boost</option>
          </select>
        </div>
      </div>
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Type</th>
              <th>Montant</th>
              <th>Description</th>
              <th>Offre</th>
              <th>Statut</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {donationsList.map((donation) => (
              <tr key={donation.id}>
                <td>{donation.userName}</td>
                <td>{donation.type}</td>
                <td>{money(donation.amountUsdCents)}</td>
                <td>{donation.description ?? '—'}</td>
                <td>{donation.adOfferName ?? '—'}</td>
                <td><span className={statusBadgeClass(donation.status)}>{donation.status}</span></td>
                <td>{fmtDate(donation.createdAt)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {donation.status === 'PENDING' && <button className="ad-btn ad-btn--sm" onClick={() => handleDonationStatus(donation.id, 'COMPLETED')}>✅ Confirmer</button>}
                    {donation.status !== 'REFUNDED' && <button className="ad-btn ad-btn--sm" onClick={() => handleDonationStatus(donation.id, 'REFUNDED')}>↩️ Rembourser</button>}
                    {donation.status !== 'FAILED' && <button className="ad-btn ad-btn--sm" onClick={() => handleDonationStatus(donation.id, 'FAILED')}>❌ Échec</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {donationsList.length === 0 && (
        <div className="ad-empty">
          <div className="ad-empty-icon">🎁</div>
          <p className="ad-empty-msg">Aucun paiement ou don enregistré pour le moment.</p>
        </div>
      )}
      <div className="ad-pagination">
        <button className="ad-btn" disabled={donationsPage <= 1} onClick={() => setDonationsPage((p) => Math.max(1, p - 1))}>Précédent</button>
        <span>Page {donationsPage}</span>
        <button className="ad-btn" disabled={donationsList.length < 20} onClick={() => setDonationsPage((p) => p + 1)}>Suivant</button>
      </div>
    </>
  );

  const renderAds = () => (
    <>
      <div className="ad-panel-head">
        <h3 className="ad-panel-title">Offres publicitaires — {adOffers.length} offre{adOffers.length > 1 ? 's' : ''}</h3>
        <button className="ad-btn ad-btn--primary" onClick={() => { setAdForm({ name: '', description: '', priceUsdCents: 0, durationDays: 30, features: '' }); setEditingAdId(null); setModal('ad-edit'); }}>+ Nouvelle offre</button>
      </div>
      <div className="ad-panel">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Nom</th><th>Prix</th><th>Durée</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {adOffers.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600, color: 'var(--ad-text-1)' }}>{a.name}</td>
                  <td>{money(a.priceUsdCents)}</td>
                  <td>{a.durationDays} jours</td>
                  <td><span className={statusBadgeClass(a.status)}>{a.status === 'ACTIVE' ? 'Actif' : a.status === 'ARCHIVED' ? 'Archivé' : 'Inactif'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="ad-btn ad-btn--sm" onClick={() => { setAdForm({ name: a.name, description: a.description ?? '', priceUsdCents: a.priceUsdCents, durationDays: a.durationDays, features: a.features.join(', ') }); setEditingAdId(a.id); setModal('ad-edit'); }}>✏️</button>
                      <button className="ad-btn ad-btn--sm" onClick={() => admin.updateAdOffer(a.id, { status: a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }).then(() => { invalidateCache('/admin/ads'); loadSectionData(); })}>{a.status === 'ACTIVE' ? '⏸' : '▶'}</button>
                      <button className="ad-btn ad-btn--sm ad-btn--danger" onClick={() => admin.deleteAdOffer(a.id).then(() => { invalidateCache('/admin/ads'); loadSectionData(); })}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {adOffers.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucune offre</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderSecurityDashboard = () => (
    <>
      <div className="ad-panel-head"><h3 className="ad-panel-title">🛡️ Sécurité & Arnaque</h3></div>
      {secDashboard ? (
        <>
          <div className="ad-stats-grid">
            <div className="ad-stat-card">
              <div className="ad-stat-icon">📊</div>
              <div className="ad-stat-value">{secDashboard.events24h}</div>
              <div className="ad-stat-label">Événements 24h</div>
            </div>
            <div className="ad-stat-card">
              <div className="ad-stat-icon">📈</div>
              <div className="ad-stat-value">{secDashboard.events7d}</div>
              <div className="ad-stat-label">Événements 7j</div>
            </div>
            <div className="ad-stat-card">
              <div className="ad-stat-icon">🚫</div>
              <div className="ad-stat-value">{secDashboard.activeRestrictions}</div>
              <div className="ad-stat-label">Restrictions actives</div>
            </div>
            <div className="ad-stat-card">
              <div className="ad-stat-icon">⚠️</div>
              <div className="ad-stat-value">{secDashboard.unresolvedFraud}</div>
              <div className="ad-stat-label">Fraudes non résolues</div>
            </div>
            <div className="ad-stat-card">
              <div className="ad-stat-icon">🔻</div>
              <div className="ad-stat-value">{secDashboard.lowTrustUsers}</div>
              <div className="ad-stat-label">Utilisateurs à risque</div>
            </div>
            <div className="ad-stat-card">
              <div className="ad-stat-icon">⛔</div>
              <div className="ad-stat-value">{secDashboard.suspendedUsers}</div>
              <div className="ad-stat-label">Comptes suspendus</div>
            </div>
          </div>

          {secDashboard.recentHighRisk.length > 0 && (
            <div className="ad-panel" style={{ marginTop: 16 }}>
              <div className="ad-panel-head"><h3 className="ad-panel-title">🔴 Événements haute gravité (24h)</h3></div>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>Type</th><th>Utilisateur</th><th>Risque</th><th>Date</th></tr></thead>
                  <tbody>
                    {secDashboard.recentHighRisk.map(ev => (
                      <tr key={ev.id}>
                        <td style={{ fontWeight: 600 }}>{ev.eventType}</td>
                        <td>{ev.user?.profile?.displayName ?? ev.user?.email ?? ev.userId ?? '—'}</td>
                        <td><span className={`ad-badge ${ev.riskLevel >= 8 ? 'ad-badge--danger' : ev.riskLevel >= 5 ? 'ad-badge--warning' : ''}`}>{ev.riskLevel}/10</span></td>
                        <td style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>{fmtDate(ev.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="ad-panel"><div className="ad-empty"><div className="ad-empty-icon">⏳</div><p className="ad-empty-msg">Chargement du dashboard sécurité…</p></div></div>
      )}

      <div className="ad-panel" style={{ marginTop: 16 }}>
        <div className="ad-panel-head"><h3 className="ad-panel-title">📋 Derniers événements — {secEventsTotal}</h3></div>
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Type</th><th>Utilisateur</th><th>IP</th><th>Risque</th><th>Date</th></tr></thead>
            <tbody>
              {secEvents.map(ev => (
                <tr key={ev.id}>
                  <td style={{ fontWeight: 600, fontSize: 12 }}>{ev.eventType}</td>
                  <td style={{ fontSize: 12 }}>{ev.user?.profile?.displayName ?? ev.user?.email ?? ev.userId ?? 'Système'}</td>
                  <td style={{ fontSize: 11, color: 'var(--ad-text-3)', fontFamily: 'monospace' }}>{ev.ipAddress ?? '—'}</td>
                  <td><span className={`ad-badge ${ev.riskLevel >= 5 ? 'ad-badge--danger' : ev.riskLevel >= 3 ? 'ad-badge--warning' : 'ad-badge--active'}`}>{ev.riskLevel}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>{fmtDate(ev.createdAt)}</td>
                </tr>
              ))}
              {secEvents.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucun événement</td></tr>}
            </tbody>
          </table>
        </div>
        {secEventsTotal > 20 && (
          <div className="ad-pagination">
            <button className="ad-page-btn" disabled={secEventsPage <= 1} onClick={() => setSecEventsPage(p => p - 1)}>←</button>
            <span style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Page {secEventsPage} / {Math.ceil(secEventsTotal / 20)}</span>
            <button className="ad-page-btn" disabled={secEventsPage >= Math.ceil(secEventsTotal / 20)} onClick={() => setSecEventsPage(p => p + 1)}>→</button>
          </div>
        )}
      </div>
    </>
  );

  const handleResolveFraud = async (id: string) => {
    setBusy(true);
    try {
      await admin.resolveFraudSignal(id);
      invalidateCache('/admin/security');
      loadSectionData();
      setSuccess('Signal de fraude résolu');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const renderAntiFraud = () => (
    <>
      <div className="ad-panel-head">
        <h3 className="ad-panel-title">🤖 Anti-Fraude — {fraudTotal} signal{fraudTotal > 1 ? 'aux' : ''}</h3>
      </div>
      <div className="ad-tabs" style={{ marginBottom: 12 }}>
        <button className={`ad-tab ${fraudFilter === 'open' ? 'ad-tab--active' : ''}`} onClick={() => { setFraudFilter('open'); setFraudPage(1); }}>Non résolus</button>
        <button className={`ad-tab ${fraudFilter === 'resolved' ? 'ad-tab--active' : ''}`} onClick={() => { setFraudFilter('resolved'); setFraudPage(1); }}>Résolus</button>
        <button className={`ad-tab ${fraudFilter === 'all' ? 'ad-tab--active' : ''}`} onClick={() => { setFraudFilter('all'); setFraudPage(1); }}>Tous</button>
      </div>
      <div className="ad-panel">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Type</th><th>Utilisateur</th><th>Sévérité</th><th>Description</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {fraudSignals.map(fs => (
                <tr key={fs.id}>
                  <td style={{ fontWeight: 600, fontSize: 12 }}>{fs.signalType}</td>
                  <td style={{ fontSize: 12 }}>{fs.user?.profile?.displayName ?? fs.user?.email ?? fs.userId}</td>
                  <td><span className={`ad-badge ${fs.severity >= 3 ? 'ad-badge--danger' : fs.severity >= 2 ? 'ad-badge--warning' : ''}`}>{fs.severity}</span></td>
                  <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fs.description ?? '—'}</td>
                  <td>{fs.resolved ? <span className="ad-badge ad-badge--active">Résolu</span> : <span className="ad-badge ad-badge--danger">Ouvert</span>}</td>
                  <td style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>{fmtDate(fs.createdAt)}</td>
                  <td>
                    {!fs.resolved && (
                      <button className="ad-btn ad-btn--sm ad-btn--primary" disabled={busy} onClick={() => handleResolveFraud(fs.id)}>✓ Résoudre</button>
                    )}
                  </td>
                </tr>
              ))}
              {fraudSignals.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucun signal de fraude</td></tr>}
            </tbody>
          </table>
        </div>
        {fraudTotal > 20 && (
          <div className="ad-pagination">
            <button className="ad-page-btn" disabled={fraudPage <= 1} onClick={() => setFraudPage(p => p - 1)}>←</button>
            <span style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Page {fraudPage} / {Math.ceil(fraudTotal / 20)}</span>
            <button className="ad-page-btn" disabled={fraudPage >= Math.ceil(fraudTotal / 20)} onClick={() => setFraudPage(p => p + 1)}>→</button>
          </div>
        )}
      </div>

      {/* Trust Score Lookup */}
      <div className="ad-panel" style={{ marginTop: 16 }}>
        <div className="ad-panel-head"><h3 className="ad-panel-title">🔍 Rechercher Trust Score</h3></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 0' }}>
          <input className="ad-input" placeholder="ID utilisateur" value={trustLookupId} onChange={e => setTrustLookupId(e.target.value)} style={{ flex: 1 }} />
          <button className="ad-btn ad-btn--primary" disabled={!trustLookupId.trim()} onClick={async () => {
            try {
              const res = await admin.userTrust(trustLookupId.trim());
              setTrustLookupResult(res.current ? { score: res.current.trustScore, level: res.current.trustLevel, history: res.history } : null);
            } catch (e: any) { setError(e?.message); }
          }}>Rechercher</button>
        </div>
        {trustLookupResult && (
          <div style={{ padding: '0 0 12px' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: trustLookupResult.score >= 60 ? 'var(--color-success)' : trustLookupResult.score >= 40 ? 'var(--ad-text-1)' : '#ff6b6b' }}>
                {trustLookupResult.score}/100
              </div>
              <span className={`ad-badge ${trustLookupResult.level === 'PREMIUM' ? 'ad-badge--active' : trustLookupResult.level === 'VERIFIED' ? 'ad-badge--active' : trustLookupResult.level === 'NEW' ? 'ad-badge--danger' : ''}`}>
                {trustLookupResult.level}
              </span>
            </div>

            {/* Adjust trust */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input className="ad-input" type="number" placeholder="Delta" value={trustAdjustDelta} onChange={e => setTrustAdjustDelta(Number(e.target.value))} style={{ width: 80 }} />
              <input className="ad-input" placeholder="Raison" value={trustAdjustReason} onChange={e => setTrustAdjustReason(e.target.value)} style={{ flex: 1 }} />
              <button className="ad-btn ad-btn--sm" disabled={!trustAdjustReason.trim() || busy} onClick={async () => {
                setBusy(true);
                try {
                  const r = await admin.adjustTrust(trustLookupId.trim(), trustAdjustDelta, trustAdjustReason);
                  setTrustLookupResult(prev => prev ? { ...prev, score: r.score, level: r.level } : prev);
                  setSuccess(`Trust score ajusté: ${r.score}`);
                  setTrustAdjustDelta(0); setTrustAdjustReason('');
                } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
              }}>Ajuster</button>
              <button className="ad-btn ad-btn--sm" disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                  const r = await admin.recalculateTrust(trustLookupId.trim());
                  setTrustLookupResult(prev => prev ? { ...prev, score: r.score, level: r.level } : prev);
                  setSuccess(`Recalculé: ${r.score}`);
                } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
              }}>♻️ Recalculer</button>
            </div>

            {/* History */}
            {trustLookupResult.history.length > 0 && (
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>Delta</th><th>Raison</th><th>Source</th><th>Score</th><th>Niveau</th><th>Date</th></tr></thead>
                  <tbody>
                    {trustLookupResult.history.slice(0, 15).map(h => (
                      <tr key={h.id}>
                        <td style={{ fontWeight: 700, color: h.delta >= 0 ? 'var(--color-success)' : '#ff6b6b' }}>{h.delta >= 0 ? '+' : ''}{h.delta}</td>
                        <td style={{ fontSize: 12 }}>{h.reason}</td>
                        <td style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{h.source}</td>
                        <td>{h.newScore}</td>
                        <td><span className="ad-badge">{h.newLevel}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>{fmtDate(h.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const handleLiftRestriction = async (id: string) => {
    setBusy(true);
    try {
      await admin.liftRestriction(id);
      invalidateCache('/admin/security');
      loadSectionData();
      setSuccess('Restriction levée');
    } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
  };

  const renderSecurityAI = () => (
    <>
      <div className="ad-panel-head">
        <h3 className="ad-panel-title">🔐 Restrictions & Sanctions — {restrictionsTotal}</h3>
      </div>
      <div className="ad-tabs" style={{ marginBottom: 12 }}>
        <button className={`ad-tab ${restrictionsFilter === 'active' ? 'ad-tab--active' : ''}`} onClick={() => { setRestrictionsFilter('active'); setRestrictionsPage(1); }}>Actives</button>
        <button className={`ad-tab ${restrictionsFilter === 'lifted' ? 'ad-tab--active' : ''}`} onClick={() => { setRestrictionsFilter('lifted'); setRestrictionsPage(1); }}>Levées</button>
        <button className={`ad-tab ${restrictionsFilter === 'all' ? 'ad-tab--active' : ''}`} onClick={() => { setRestrictionsFilter('all'); setRestrictionsPage(1); }}>Toutes</button>
      </div>
      <div className="ad-panel">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Utilisateur</th><th>Type</th><th>Raison</th><th>Sanction</th><th>Expire</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {restrictions.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 12 }}>{r.user?.profile?.displayName ?? r.user?.email ?? r.userId}</td>
                  <td><span className="ad-badge">{r.restrictionType.replace(/_/g, ' ')}</span></td>
                  <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</td>
                  <td><span className={`ad-badge ${r.sanctionLevel === 'BAN' ? 'ad-badge--danger' : r.sanctionLevel === 'SUSPENSION' ? 'ad-badge--danger' : r.sanctionLevel === 'FUNCTION_BLOCK' ? 'ad-badge--warning' : ''}`}>{r.sanctionLevel}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{r.expiresAt ? fmtDate(r.expiresAt) : 'Permanent'}</td>
                  <td>{r.isActive ? <span className="ad-badge ad-badge--danger">Active</span> : <span className="ad-badge ad-badge--active">Levée</span>}</td>
                  <td>
                    {r.isActive && (
                      <button className="ad-btn ad-btn--sm" disabled={busy} onClick={() => handleLiftRestriction(r.id)}>🔓 Lever</button>
                    )}
                  </td>
                </tr>
              ))}
              {restrictions.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucune restriction</td></tr>}
            </tbody>
          </table>
        </div>
        {restrictionsTotal > 20 && (
          <div className="ad-pagination">
            <button className="ad-page-btn" disabled={restrictionsPage <= 1} onClick={() => setRestrictionsPage(p => p - 1)}>←</button>
            <span style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Page {restrictionsPage} / {Math.ceil(restrictionsTotal / 20)}</span>
            <button className="ad-page-btn" disabled={restrictionsPage >= Math.ceil(restrictionsTotal / 20)} onClick={() => setRestrictionsPage(p => p + 1)}>→</button>
          </div>
        )}
      </div>
    </>
  );

  const handleOpenAiDetail = async (agentId: string) => {
    try {
      const detail = await admin.aiAgentDetail(agentId);
      setAiSelectedAgent(detail);
      setAiDetailTab('mission');
      setModal('ai-detail');
    } catch (e: any) { setError(e?.message); }
  };

  const handleToggleAiStatus = async (agent: AdminAiAgent) => {
    if (!isSuperAdmin) return;
    const newStatus = agent.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await admin.updateAiAgent(agent.id, { status: newStatus, enabled: newStatus === 'ACTIVE' });
      invalidateCache('/admin/ai');
      loadSectionData();
    } catch (e: any) { setError(e?.message); }
  };

  const handleLoadAiLogs = async (agentId: string, page = 1) => {
    try {
      const res = await admin.aiAgentLogs(agentId, { page, limit: 20 });
      setAiLogs(res.logs);
      setAiLogsTotal(res.total);
      setAiLogsPage(res.page);
    } catch { /* ignore */ }
  };

  const aiStatusColor = (s: string) => {
    switch (s) {
      case 'ACTIVE': return 'var(--ad-success, #4caf50)';
      case 'INACTIVE': return 'var(--ad-text-3, #888)';
      case 'PAUSED': return '#ff9800';
      case 'MAINTENANCE': return '#2196f3';
      case 'ERROR': return 'var(--ad-danger, #e53935)';
      default: return 'var(--ad-text-3)';
    }
  };
  const aiStatusLabel = (s: string) => {
    switch (s) {
      case 'ACTIVE': return '🟢 Active';
      case 'INACTIVE': return '⚫ Inactive';
      case 'PAUSED': return '⏸️ Pause';
      case 'MAINTENANCE': return '🔧 Maintenance';
      case 'ERROR': return '🔴 Erreur';
      default: return s;
    }
  };

  const renderAiManagement = () => (
    <>
      {/* ═══ HEADER + GLOBAL STATUS ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--ad-text-1)' }}>🤖 Gestion des IA</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ad-text-3)' }}>Pilotage, suivi et contrôle des intelligences artificielles de Kin-Sell</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {aiStats && (
            <span style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              background: aiStats.systemStatus === 'active' ? 'rgba(76,175,80,0.15)' : aiStats.systemStatus === 'degraded' ? 'rgba(255,152,0,0.15)' : 'rgba(229,57,53,0.15)',
              color: aiStats.systemStatus === 'active' ? '#4caf50' : aiStats.systemStatus === 'degraded' ? '#ff9800' : '#e53935',
            }}>
              {aiStats.systemStatus === 'active' ? '🟢 Système IA opérationnel' : aiStats.systemStatus === 'degraded' ? '🟡 Partiellement dégradé' : '🔴 Hors service'}
            </span>
          )}
          <button className="ad-btn ad-btn--sm" onClick={() => loadSectionData()}>🔄 Refresh</button>
        </div>
      </div>

      {/* ═══ STATS CARDS ═══ */}
      {aiStats && (
        <div className="ad-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 20 }}>
          <div className="ad-stat-card">
            <div className="ad-stat-label">Total IA</div>
            <div className="ad-stat-value">{aiStats.total}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">🟢 Actives</div>
            <div className="ad-stat-value" style={{ color: '#4caf50' }}>{aiStats.active}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">⚫ Inactives</div>
            <div className="ad-stat-value">{aiStats.inactive}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">🔧 Maintenance</div>
            <div className="ad-stat-value" style={{ color: '#2196f3' }}>{aiStats.maintenance}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">🔴 Erreurs</div>
            <div className="ad-stat-value" style={{ color: '#e53935' }}>{aiStats.errors}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">💼 Liées forfaits</div>
            <div className="ad-stat-value">{aiStats.linkedToPlans}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">👥 Comptes IA</div>
            <div className="ad-stat-value">{aiStats.accountsUsingAi}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">📊 Usage (7j)</div>
            <div className="ad-stat-value">{aiStats.weekUsage}</div>
          </div>
        </div>
      )}

      {/* ═══ FILTERS ═══ */}
      <div className="ad-panel" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '10px 16px' }}>
        <select className="ad-select" value={aiStatusFilter} onChange={e => setAiStatusFilter(e.target.value)} style={{ minWidth: 130 }}>
          <option value="">Tous les statuts</option>
          <option value="ACTIVE">🟢 Active</option>
          <option value="INACTIVE">⚫ Inactive</option>
          <option value="PAUSED">⏸️ Pause</option>
          <option value="MAINTENANCE">🔧 Maintenance</option>
          <option value="ERROR">🔴 Erreur</option>
        </select>
        <select className="ad-select" value={aiDomainFilter} onChange={e => setAiDomainFilter(e.target.value)} style={{ minWidth: 130 }}>
          <option value="">Tous les domaines</option>
          <option value="messaging">Messagerie</option>
          <option value="pricing">Tarification</option>
          <option value="listings">Annonces</option>
          <option value="content">Contenu</option>
          <option value="negotiations">Négociations</option>
          <option value="orders">Commandes</option>
          <option value="advertising">Publicité</option>
          <option value="analytics">Analytics</option>
          <option value="system">Système</option>
        </select>
        <select className="ad-select" value={aiTypeFilter} onChange={e => setAiTypeFilter(e.target.value)} style={{ minWidth: 130 }}>
          <option value="">Tous les types</option>
          <option value="moderation">Modération</option>
          <option value="pricing">Tarification</option>
          <option value="quality">Qualité</option>
          <option value="negotiation">Négociation</option>
          <option value="ordering">Commandes</option>
          <option value="advertising">Publicité</option>
          <option value="analytics">Analytics</option>
          <option value="orchestration">Orchestration</option>
        </select>
      </div>

      {/* ═══ AI AGENTS GRID ═══ */}
      {aiAgents.length === 0 ? (
        <div className="ad-panel" style={{ marginTop: 16 }}>
          <div className="ad-empty"><div className="ad-empty-icon">🧠</div><p className="ad-empty-msg">Aucune IA trouvée avec ces filtres.</p></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16, marginTop: 16 }}>
          {aiAgents.map(a => {
            const cfg = a.config as Record<string, unknown> | null;
            return (
              <div key={a.id} className="ad-panel" style={{ padding: 16, position: 'relative', borderLeft: `3px solid ${aiStatusColor(a.status)}` }}>
                {/* Header */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{a.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h4 style={{ margin: 0, fontSize: 15, color: 'var(--ad-text-1)' }}>{a.name}</h4>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(111,88,255,0.1)', color: 'var(--color-accent, #6f58ff)' }}>v{a.version}</span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--ad-text-3)', lineHeight: 1.4 }}>{a.description?.substring(0, 100)}{(a.description?.length ?? 0) > 100 ? '…' : ''}</p>
                  </div>
                </div>

                {/* Meta row */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(111,88,255,0.08)', color: 'var(--ad-text-2)' }}>{a.domain}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(111,88,255,0.08)', color: 'var(--ad-text-2)', textTransform: 'capitalize' }}>{a.type}</span>
                  <span className="ad-badge">{a.level.replace('LEVEL_', 'Niv ')}</span>
                  {!!cfg?.requiredPlan && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,152,0,0.1)', color: '#ff9800' }}>💼 {String(cfg.requiredPlan)}</span>}
                </div>

                {/* Status + actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: aiStatusColor(a.status) }}>{aiStatusLabel(a.status)}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="ad-btn ad-btn--sm" onClick={() => handleOpenAiDetail(a.id)} title="Détails">🔎 Détails</button>
                    {isSuperAdmin && (
                      <button
                        className={`ad-btn ad-btn--sm ${a.status === 'ACTIVE' ? '' : 'ad-btn--primary'}`}
                        onClick={() => handleToggleAiStatus(a)}
                        title={a.status === 'ACTIVE' ? 'Désactiver' : 'Activer'}
                      >
                        {a.status === 'ACTIVE' ? '⏸️' : '▶️'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Last activity */}
                {a.lastActiveAt && <div style={{ marginTop: 8, fontSize: 10, color: 'var(--ad-text-3)' }}>Dernière activité : {fmtDate(a.lastActiveAt)}</div>}
                {a.lastError && <div style={{ marginTop: 4, fontSize: 10, color: '#e53935' }}>⚠ {a.lastError}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ MessageGuard AI Dashboard ═══ */}
      <div className="ad-panel-head" style={{ marginTop: 24 }}><h3 className="ad-panel-title">🛡️ IA MessageGuard — Contrôle Messagerie</h3></div>

      {/* Contrôles On/Off + Sévérité */}
      <div className="ad-panel" style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600 }}>Statut :</span>
          <div
            className={`ad-toggle ${mgEnabled ? 'ad-toggle--on' : ''}`}
            onClick={() => {
              if (!isSuperAdmin) return;
              const newVal = !mgEnabled;
              setMgEnabled(newVal);
              admin.updateMessageGuardConfig('message_guard_enabled', newVal).then(() => loadSectionData());
            }}
          />
          <span style={{ fontSize: 13, color: mgEnabled ? 'var(--ad-success)' : 'var(--ad-danger, #e53935)' }}>
            {mgEnabled ? 'Activée' : 'Désactivée'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600 }}>Sévérité :</span>
          {isSuperAdmin ? (
            <select
              className="ad-select"
              value={mgSeverity}
              onChange={e => {
                const val = Number(e.target.value);
                setMgSeverity(val);
                admin.updateMessageGuardConfig('message_guard_severity', val).then(() => loadSectionData());
              }}
              style={{ padding: '4px 8px', fontSize: 12 }}
            >
              <option value={1}>1 — Très permissif</option>
              <option value={2}>2 — Permissif</option>
              <option value={3}>3 — Normal</option>
              <option value={4}>4 — Strict</option>
              <option value={5}>5 — Très strict</option>
            </select>
          ) : (
            <span className="ad-badge">{mgSeverity}/5</span>
          )}
        </div>
      </div>

      {/* Stats */}
      {mgDashboard && (
        <div className="ad-stats-grid" style={{ marginTop: 12 }}>
          <div className="ad-stat-card">
            <div className="ad-stat-label">Analysés (24h)</div>
            <div className="ad-stat-value">{mgDashboard.stats.last24h.total}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">Avertis (24h)</div>
            <div className="ad-stat-value" style={{ color: '#ff9800' }}>{mgDashboard.stats.last24h.warned}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">Bloqués (24h)</div>
            <div className="ad-stat-value" style={{ color: 'var(--ad-danger, #e53935)' }}>{mgDashboard.stats.last24h.blocked}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">Analysés (7j)</div>
            <div className="ad-stat-value">{mgDashboard.stats.last7d.total}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">Avertis (7j)</div>
            <div className="ad-stat-value" style={{ color: '#ff9800' }}>{mgDashboard.stats.last7d.warned}</div>
          </div>
          <div className="ad-stat-card">
            <div className="ad-stat-label">Bloqués (7j)</div>
            <div className="ad-stat-value" style={{ color: 'var(--ad-danger, #e53935)' }}>{mgDashboard.stats.last7d.blocked}</div>
          </div>
        </div>
      )}

      {/* Top Violateurs */}
      {mgDashboard && mgDashboard.topViolators.length > 0 && (
        <div className="ad-panel" style={{ marginTop: 12 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>🔥 Top 10 Contrevenants (7 jours)</h4>
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead><tr><th>Utilisateur</th><th>Violations</th></tr></thead>
              <tbody>
                {mgDashboard.topViolators.map(v => (
                  <tr key={v.userId}>
                    <td style={{ fontWeight: 600 }}>{v.displayName} {v.username ? `(@${v.username})` : ''}</td>
                    <td><span className="ad-badge ad-badge--danger">{v.count}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Journal des Détections */}
      <div className="ad-panel" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 14 }}>📋 Journal MessageGuard</h4>
          <div className="ad-tabs" style={{ marginBottom: 0 }}>
            <button className={`ad-tab ${mgVerdictFilter === 'all' ? 'ad-tab--active' : ''}`} onClick={() => { setMgVerdictFilter('all'); setMgLogsPage(1); }}>Tous</button>
            <button className={`ad-tab ${mgVerdictFilter === 'WARNED' ? 'ad-tab--active' : ''}`} onClick={() => { setMgVerdictFilter('WARNED'); setMgLogsPage(1); }}>Avertis</button>
            <button className={`ad-tab ${mgVerdictFilter === 'BLOCKED' ? 'ad-tab--active' : ''}`} onClick={() => { setMgVerdictFilter('BLOCKED'); setMgLogsPage(1); }}>Bloqués</button>
          </div>
        </div>

        {mgLogs.length === 0 ? (
          <div className="ad-empty"><div className="ad-empty-icon">✅</div><p className="ad-empty-msg">Aucune détection enregistrée.</p></div>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead><tr><th>Date</th><th>Utilisateur</th><th>Verdict</th><th>Score</th><th>Catégories</th><th>Extrait</th></tr></thead>
              <tbody>
                {mgLogs.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(l.createdAt)}</td>
                    <td style={{ fontWeight: 600 }}>{l.userName}{l.username ? ` (@${l.username})` : ''}</td>
                    <td>
                      <span className={`ad-badge ${l.verdict === 'BLOCKED' ? 'ad-badge--danger' : l.verdict === 'WARNED' ? 'ad-badge--warning' : ''}`}>
                        {l.verdict === 'BLOCKED' ? '🚫 Bloqué' : l.verdict === 'WARNED' ? '⚠️ Averti' : '✅ OK'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{l.riskScore}</td>
                    <td style={{ fontSize: 11 }}>{l.categories.join(', ')}</td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.messagePreview ?? l.messageContent?.substring(0, 80) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mgLogsTotal > 20 && (
          <div className="ad-pagination">
            <button className="ad-btn ad-btn--sm" disabled={mgLogsPage <= 1} onClick={() => setMgLogsPage(p => p - 1)}>← Précédent</button>
            <span>Page {mgLogsPage} / {Math.ceil(mgLogsTotal / 20)}</span>
            <button className="ad-btn ad-btn--sm" disabled={mgLogsPage >= Math.ceil(mgLogsTotal / 20)} onClick={() => setMgLogsPage(p => p + 1)}>Suivant →</button>
          </div>
        )}
      </div>
    </>
  );

  const renderRankings = () => (
    <>
      <div className="ad-tabs">
        <button className={`ad-tab ${rankPeriod === 'all' ? 'ad-tab--active' : ''}`} onClick={() => setRankPeriod('all')}>Global</button>
        <button className={`ad-tab ${rankPeriod === 'month' ? 'ad-tab--active' : ''}`} onClick={() => setRankPeriod('month')}>Ce mois</button>
        <span style={{ width: 20 }} />
        <button className={`ad-tab ${rankType === 'all' ? 'ad-tab--active' : ''}`} onClick={() => setRankType('all')}>Tous</button>
        <button className={`ad-tab ${rankType === 'user' ? 'ad-tab--active' : ''}`} onClick={() => setRankType('user')}>Utilisateurs</button>
        <button className={`ad-tab ${rankType === 'business' ? 'ad-tab--active' : ''}`} onClick={() => setRankType('business')}>Entreprises</button>
      </div>
      <div className="ad-panel">
        <div className="ad-ranking-list">
          {rankings.map(r => (
            <div className="ad-ranking-item" key={r.userId}>
              <div className={`ad-ranking-pos ${r.rank === 1 ? 'ad-ranking-pos--gold' : r.rank === 2 ? 'ad-ranking-pos--silver' : r.rank === 3 ? 'ad-ranking-pos--bronze' : ''}`}>{r.rank}</div>
              <div className="ad-ranking-user">
                <div className="ad-table-avatar">{r.avatarUrl ? <img src={resolveMediaUrl(r.avatarUrl)} alt="" /> : initials(r.displayName)}</div>
                <div>
                  <div className="ad-ranking-name">{r.displayName}</div>
                  <span className={roleBadgeClass(r.role)} style={{ fontSize: 10 }}>{r.role}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="ad-ranking-stats">{money(r.totalRevenueUsdCents)}</div>
                <div className="ad-ranking-orders">{r.orderCount} commande{r.orderCount > 1 ? 's' : ''}</div>
              </div>
            </div>
          ))}
          {rankings.length === 0 && <div className="ad-empty"><div className="ad-empty-icon">🏆</div><p className="ad-empty-msg">Aucun classement disponible</p></div>}
        </div>
      </div>
    </>
  );

  const renderAdmins = () => (
    <>
      <div className="ad-panel-head">
        <h3 className="ad-panel-title">Administrateurs — {adminsList.length}</h3>
        {isSuperAdmin && (
          <button className="ad-btn ad-btn--primary" onClick={() => {
            setCreateAdminForm({ email: '', password: '', displayName: '', level: 'LEVEL_5' });
            setCreateAdminPermissions(LEVEL_DEFAULT_PERMS['LEVEL_5'] ?? ['DASHBOARD']);
            setModal('admin-create');
          }}>+ Créer un admin</button>
        )}
      </div>
      <div className="ad-panel">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>Admin</th><th>Rôle</th><th>Niveau</th><th>Permissions</th><th>Actions</th></tr></thead>
            <tbody>
              {adminsList.map(a => (
                <tr key={a.id}>
                  <td>
                    <div className="ad-table-user">
                      <div className="ad-table-avatar">{a.avatarUrl ? <img src={resolveMediaUrl(a.avatarUrl)} alt="" /> : initials(a.displayName)}</div>
                      <div>
                        <div className="ad-table-username">{a.displayName}</div>
                        <div className="ad-table-email">{a.email ?? a.id.slice(0, 8)}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={roleBadgeClass(a.role)}>{a.role}</span></td>
                  <td><span className="ad-badge">{a.level ?? '—'}</span></td>
                  <td style={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.permissions.join(', ') || '—'}</td>
                  <td>
                    {a.role !== 'SUPER_ADMIN' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="ad-btn ad-btn--sm" onClick={() => { setEditingAdmin(a); setAdminLevel(a.level ?? 'LEVEL_5'); setAdminPermissions(a.permissions ?? []); setModal('admin-edit'); }}>✏️</button>
                        <button className="ad-btn ad-btn--sm ad-btn--danger" onClick={() => handleDemoteAdmin(a.id)}>⬇️</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {adminsList.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucun administrateur trouvé</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderAppeals = () => (
    <>
      <div className="ad-panel-head">
        <h3 className="ad-panel-title">Appels de suspension — {appealsTotal}</h3>
      </div>
      <div className="ad-panel">
        {appealsList.length === 0 ? (
          <div className="ad-empty"><div className="ad-empty-icon">📩</div><p className="ad-empty-msg">Aucun appel de suspension</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {appealsList.map(a => (
              <div key={a.id} style={{ padding: 16, background: 'var(--ad-card-bg, rgba(255,255,255,0.05))', borderRadius: 12, border: '1px solid var(--ad-border, rgba(255,255,255,0.08))' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <div className="ad-table-avatar">{a.avatarUrl ? <img src={resolveMediaUrl(a.avatarUrl)} alt="" /> : initials(a.displayName)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ad-text-1)' }}>{a.displayName}</div>
                    <div style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>{a.email}</div>
                  </div>
                  <span className={`ad-badge ${a.accountStatus === 'SUSPENDED' ? 'ad-badge--danger' : 'ad-badge--success'}`}>{a.accountStatus}</span>
                  <span style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{new Date(a.submittedAt).toLocaleString('fr-FR')}</span>
                </div>
                <div style={{ padding: 12, background: 'rgba(111,88,255,0.06)', borderRadius: 8, color: 'var(--ad-text-2)', fontSize: 13, lineHeight: 1.5 }}>
                  {a.message}
                </div>
                {a.accountStatus === 'SUSPENDED' && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <button className="ad-btn ad-btn--sm ad-btn--primary" onClick={async () => {
                      setBusy(true);
                      try {
                        await admin.unsuspendUser(a.userId);
                        invalidateCache('/admin/appeals');
                        loadSectionData();
                        setSuccess('Utilisateur réactivé');
                      } catch (e: any) { setError(e?.message); } finally { setBusy(false); }
                    }} disabled={busy}>✅ Lever la suspension</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {appealsTotal > 20 && (
          <div className="ad-pagination" style={{ marginTop: 16 }}>
            <button className="ad-btn ad-btn--sm" disabled={appealsPage <= 1} onClick={() => setAppealsPage(p => p - 1)}>← Précédent</button>
            <span style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Page {appealsPage} / {Math.ceil(appealsTotal / 20)}</span>
            <button className="ad-btn ad-btn--sm" disabled={appealsPage >= Math.ceil(appealsTotal / 20)} onClick={() => setAppealsPage(p => p + 1)}>Suivant →</button>
          </div>
        )}
      </div>
    </>
  );

  const renderCurrency = () => (
    <>
      <div className="ad-panel-head">
        <h3 className="ad-panel-title">Taux de change</h3>
        <button className="ad-btn ad-btn--primary" onClick={() => { setCurrencyForm({ fromCurrency: 'USD', toCurrency: 'CDF', rate: 2850 }); setModal('currency-edit'); }}>+ Ajouter / Modifier</button>
      </div>
      <div className="ad-panel">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>De</th><th>Vers</th><th>Taux</th><th>Manuel</th><th>Actions</th></tr></thead>
            <tbody>
              {currencyRates.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.fromCurrency}</td>
                  <td style={{ fontWeight: 600 }}>{r.toCurrency}</td>
                  <td>{r.rate.toLocaleString()}</td>
                  <td>{r.isManual ? <span className="ad-badge ad-badge--warning">Manuel</span> : <span className="ad-badge ad-badge--active">Auto</span>}</td>
                  <td>
                    <button className="ad-btn ad-btn--sm" onClick={() => { setCurrencyForm({ fromCurrency: r.fromCurrency, toCurrency: r.toCurrency, rate: r.rate }); setModal('currency-edit'); }}>✏️</button>
                  </td>
                </tr>
              ))}
              {currencyRates.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--ad-text-3)' }}>Aucun taux configuré</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderAudit = () => (
    <>
      <div className="ad-panel-head"><h3 className="ad-panel-title">Journal d'audit — {auditTotal} entrée{auditTotal > 1 ? 's' : ''}</h3></div>
      <div className="ad-panel">
        {auditLogs.map(l => (
          <div className="ad-audit-item" key={l.id}>
            <div className="ad-audit-dot" />
            <div className="ad-audit-content">
              <div className="ad-audit-action">{l.action} — {l.entityType}{l.entityId ? ` (${l.entityId.slice(0, 8)})` : ''}</div>
              <div className="ad-audit-meta">
                {l.actor ? l.actor.displayName : 'Système'} · {fmtDate(l.createdAt)}
              </div>
            </div>
          </div>
        ))}
        {auditLogs.length === 0 && <div className="ad-empty"><div className="ad-empty-icon">📋</div><p className="ad-empty-msg">Aucune entrée</p></div>}
        {auditTotal > 30 && (
          <div className="ad-pagination">
            <button className="ad-page-btn" disabled={auditPage <= 1} onClick={() => setAuditPage(p => p - 1)}>←</button>
            <span style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Page {auditPage} / {Math.ceil(auditTotal / 30)}</span>
            <button className="ad-page-btn" disabled={auditPage >= Math.ceil(auditTotal / 30)} onClick={() => setAuditPage(p => p + 1)}>→</button>
          </div>
        )}
      </div>
    </>
  );

  /* ── App Version (Mobile) ── */
  const handleAppVersionSave = async () => {
    setAppVersionSaving(true);
    setAppVersionMsg(null);
    try {
      await request('/app-version/android', { method: 'PUT', body: JSON.stringify(appVersionForm), headers: { 'Content-Type': 'application/json' } });
      const av = await request<{ version: string | null; build: number | null; apkUrl: string | null; forceUpdate: boolean; releaseNotes: string | null }>('/app-version/android');
      setAppVersionInfo(av);
      setAppVersionMsg('✅ Version mise à jour avec succès');
    } catch (e: any) {
      setAppVersionMsg('❌ ' + (e.message ?? 'Erreur'));
    } finally {
      setAppVersionSaving(false);
    }
  };

  const renderAppVersion = () => (
    <div className="ad-section-panel">
      <div className="ad-section-head">
        <h2 className="ad-section-title">📱 App Mobile — Version Android</h2>
      </div>

      {/* Current version info */}
      <div className="ad-settings-grid">
        <div className="ad-settings-box">
          <h3 className="ad-settings-box-title">📊 Version actuelle configurée</h3>
          {appVersionInfo ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`ad-status-dot ${appVersionInfo.version ? 'ad-status-dot--green' : 'ad-status-dot--amber'}`} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {appVersionInfo.version ? `v${appVersionInfo.version} (build ${appVersionInfo.build})` : 'Non configurée'}
                </span>
              </div>
              {appVersionInfo.apkUrl && (
                <div style={{ fontSize: 12, color: 'var(--ad-text-2)' }}>
                  APK : <a href={appVersionInfo.apkUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--ad-accent)' }}>{appVersionInfo.apkUrl.slice(0, 60)}…</a>
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>
                Mise à jour obligatoire : {appVersionInfo.forceUpdate ? '🔴 Oui' : '🟢 Non'}
              </div>
              {appVersionInfo.releaseNotes && (
                <div style={{ fontSize: 12, color: 'var(--ad-text-3)', whiteSpace: 'pre-wrap' }}>
                  📝 {appVersionInfo.releaseNotes}
                </div>
              )}
              <button
                className="ad-btn"
                style={{ marginTop: 8, width: 'fit-content' }}
                onClick={() => loadSectionData()}
                disabled={busy}
              >
                🔄 Vérifier le statut
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ad-text-3)' }}>Chargement…</div>
          )}
        </div>

        <div className="ad-settings-box">
          <h3 className="ad-settings-box-title">✏️ Configurer la version</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--ad-text-2)' }}>
              Version (ex: 1.2.0)
              <input
                className="ad-search"
                style={{ display: 'block', marginTop: 4, width: '100%' }}
                value={appVersionForm.version}
                onChange={e => setAppVersionForm(f => ({ ...f, version: e.target.value }))}
                placeholder="1.0.0"
              />
            </label>
            <label style={{ fontSize: 12, color: 'var(--ad-text-2)' }}>
              Build number
              <input
                className="ad-search"
                type="number"
                style={{ display: 'block', marginTop: 4, width: '100%' }}
                value={appVersionForm.build}
                onChange={e => setAppVersionForm(f => ({ ...f, build: Number(e.target.value) }))}
                min={1}
              />
            </label>
            <label style={{ fontSize: 12, color: 'var(--ad-text-2)' }}>
              Lien APK
              <input
                className="ad-search"
                style={{ display: 'block', marginTop: 4, width: '100%' }}
                value={appVersionForm.apkUrl}
                onChange={e => setAppVersionForm(f => ({ ...f, apkUrl: e.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label style={{ fontSize: 12, color: 'var(--ad-text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={appVersionForm.forceUpdate}
                onChange={e => setAppVersionForm(f => ({ ...f, forceUpdate: e.target.checked }))}
              />
              Mise à jour obligatoire (bloquante)
            </label>
            <label style={{ fontSize: 12, color: 'var(--ad-text-2)' }}>
              Notes de version
              <textarea
                className="ad-search"
                style={{ display: 'block', marginTop: 4, width: '100%', minHeight: 60, resize: 'vertical' }}
                value={appVersionForm.releaseNotes}
                onChange={e => setAppVersionForm(f => ({ ...f, releaseNotes: e.target.value }))}
                placeholder="Nouveautés de cette version…"
              />
            </label>
            <button
              className="ad-btn ad-btn--primary"
              onClick={handleAppVersionSave}
              disabled={appVersionSaving || !appVersionForm.version || !appVersionForm.apkUrl}
              style={{ width: 'fit-content' }}
            >
              {appVersionSaving ? '⏳ Sauvegarde…' : '💾 Sauvegarder'}
            </button>
            {appVersionMsg && (
              <div style={{ fontSize: 13, marginTop: 4 }}>{appVersionMsg}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="ad-settings-grid">
      {isSuperAdmin && (
        <div className="ad-settings-box">
          <h3 className="ad-settings-box-title">🔧 Maintenance</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="ad-btn" onClick={() => admin.updateSiteSetting('maintenance_mode', siteSettings.maintenance_mode === 'true' ? 'false' : 'true').then(() => { invalidateCache('/admin/settings'); loadSectionData(); })}>
              {siteSettings.maintenance_mode === 'true' ? '🟢 Désactiver maintenance' : '🔴 Activer maintenance'}
            </button>
            <button className="ad-btn" onClick={handleSettingsSync} disabled={busy}>🔄 Synchronisation</button>
            <button className="ad-btn" onClick={handleApiRefresh} disabled={busy}>⚡ Tester l'API</button>
            <button className="ad-btn" onClick={handleRunCleanup} disabled={busy}>🚀 Optimiser le site</button>
          </div>
        </div>
      )}
      {isSuperAdmin && (
        <div className="ad-settings-box">
          <h3 className="ad-settings-box-title">📊 État du site</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`ad-status-dot ${siteSettings.maintenance_mode === 'true' ? 'ad-status-dot--amber' : 'ad-status-dot--green'}`} />
              <span style={{ fontSize: 13 }}>{siteSettings.maintenance_mode === 'true' ? 'En maintenance' : 'Actif'}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Mémoire, trafic et connectés — données en temps réel à venir</div>
          </div>
        </div>
      )}
      <div className="ad-settings-box">
        <h3 className="ad-settings-box-title">👤 Mon compte</h3>
        <p style={{ fontSize: 13, color: 'var(--ad-text-2)', margin: 0 }}>
          {displayName} · {user.email}<br />
          Rôle: {user.role}
          {adminMe && <><br />Niveau: {adminMe.level}</>}
        </p>
        {!isSuperAdmin && (
          <button className="ad-btn ad-btn--danger" style={{ marginTop: 12 }}>Demander la suppression</button>
        )}
      </div>
    </div>
  );

  const renderMessaging = () => <DashboardMessaging />;

  const ADV_PAGES = ['home','explorer','sokin','account','admin'];
  const ADV_STATUSES = ['ALL','PENDING','ACTIVE','INACTIVE','ARCHIVED','CANCELLED'];
  const ADV_TYPES = ['ALL','KIN_SELL','USER','BUSINESS'];

  const renderAdvertisements = () => (
    <div className="ad-section-panel">
      <div className="ad-section-head">
        <h2 className="ad-section-title">Publicités Clients</h2>
        <button className="ad-btn ad-btn--primary" onClick={() => { setEditingAdvId(null); setAdvForm({ title: '', description: '', imageUrl: '', linkUrl: '/', ctaText: 'Découvrir', type: 'USER', targetPages: [], startDate: '', endDate: '', paymentRef: '', amountPaidCents: 0, priority: 0, advertiserEmail: '', advertiserName: '' }); setModal('advertisement-edit'); }}>
          + Nouvelle publicité
        </button>
      </div>

      {/* Filters */}
      <div className="ad-filters-row">
        <input className="ad-search" placeholder="Rechercher..." value={advSearch} onChange={e => setAdvSearch(e.target.value)} />
        <select className="ad-select" value={advStatusFilter} onChange={e => setAdvStatusFilter(e.target.value)}>
          {ADV_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="ad-select" value={advTypeFilter} onChange={e => setAdvTypeFilter(e.target.value)}>
          {ADV_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="ad-btn ad-btn--sm" onClick={() => { setAdvPage(1); loadSectionData(); }}>🔍 Filtrer</button>
      </div>

      {/* Table */}
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead>
            <tr>
              <th>Titre</th><th>Type</th><th>Statut</th><th>Pages cibles</th>
              <th>Annonceur</th><th>Paiement</th><th>Dates</th><th>Stats</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {advList.length === 0
              ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, opacity: 0.5 }}>Aucune publicité client trouvée</td></tr>
              : advList.map(adv => (
                <tr key={adv.id}>
                  <td>
                    <strong>{adv.title}</strong>
                    {adv.description && <div style={{ fontSize: 11, opacity: 0.7 }}>{adv.description.slice(0, 60)}{adv.description.length > 60 ? '…' : ''}</div>}
                  </td>
                  <td><span className="ad-badge">{adv.type}</span></td>
                  <td>
                    <span className={`ad-badge ${adv.status === 'ACTIVE' ? 'ad-badge--active' : adv.status === 'CANCELLED' || adv.status === 'ARCHIVED' ? 'ad-badge--danger' : 'ad-badge--pending'}`}>
                      {adv.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 11 }}>{adv.targetPages.join(', ') || 'toutes'}</td>
                  <td style={{ fontSize: 12 }}>
                    {adv.advertiserName && <div>{adv.advertiserName}</div>}
                    {adv.advertiserEmail && <div style={{ opacity: 0.7 }}>{adv.advertiserEmail}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {adv.paymentRef ? <div>{money(adv.amountPaidCents)}</div> : <span style={{ opacity: 0.4 }}>—</span>}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {adv.startDate && <div>Début: {fmtDate(adv.startDate)}</div>}
                    {adv.endDate && <div>Fin: {fmtDate(adv.endDate)}</div>}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    <div>👁 {adv.impressions}</div>
                    <div>🖱 {adv.clicks}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button className="ad-btn ad-btn--sm" title="Modifier" onClick={() => {
                        setEditingAdvId(adv.id);
                        setAdvForm({ title: adv.title, description: adv.description ?? '', imageUrl: adv.imageUrl ?? '', linkUrl: adv.linkUrl, ctaText: adv.ctaText, type: adv.type, targetPages: adv.targetPages, startDate: adv.startDate ? adv.startDate.slice(0,10) : '', endDate: adv.endDate ? adv.endDate.slice(0,10) : '', paymentRef: adv.paymentRef ?? '', amountPaidCents: adv.amountPaidCents, priority: adv.priority, advertiserEmail: adv.advertiserEmail ?? '', advertiserName: adv.advertiserName ?? '' });
                        setModal('advertisement-edit');
                      }}>✏️</button>
                      {adv.status === 'ACTIVE'
                        ? <button className="ad-btn ad-btn--sm" title="Désactiver" onClick={() => handleAdvPatchStatus(adv.id, 'INACTIVE')}>⏸</button>
                        : adv.status === 'PENDING' || adv.status === 'INACTIVE'
                          ? <button className="ad-btn ad-btn--sm" title="Activer" onClick={() => handleAdvPatchStatus(adv.id, 'ACTIVE')}>▶</button>
                          : null
                      }
                      {adv.status !== 'ARCHIVED' && adv.status !== 'CANCELLED' &&
                        <button className="ad-btn ad-btn--sm ad-btn--danger" title="Archiver" onClick={() => handleAdvPatchStatus(adv.id, 'ARCHIVED')}>📦</button>
                      }
                      {adv.status === 'ACTIVE' &&
                        <button className="ad-btn ad-btn--sm ad-btn--danger" title="Annuler" onClick={() => { const note = prompt('Raison de l\'annulation:'); if (note) handleAdvPatchStatus(adv.id, 'CANCELLED', note); }}>🚫</button>
                      }
                      <button className="ad-btn ad-btn--sm ad-btn--danger" title="Supprimer" onClick={() => handleAdvDelete(adv.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {advTotal > 20 && (
        <div className="ad-pagination">
          <button className="ad-btn ad-btn--sm" onClick={() => setAdvPage(p => Math.max(1, p - 1))} disabled={advPage <= 1}>‹ Préc.</button>
          <span>Page {advPage} / {Math.ceil(advTotal / 20)}</span>
          <button className="ad-btn ad-btn--sm" onClick={() => setAdvPage(p => p + 1)} disabled={advPage >= Math.ceil(advTotal / 20)}>Suiv. ›</button>
        </div>
      )}
    </div>
  );

  /* ── Listings admin ── */
  const renderListings = () => {
    const totalPages = Math.max(1, Math.ceil(adminListingsTotal / 20));
    const handleToggleNeg = async (id: string, current: boolean) => {
      setBusy(true);
      try {
        await admin.toggleListingNegotiable(id, !current);
        setAdminListings(prev => prev.map(l => l.id === id ? { ...l, isNegotiable: !current } : l));
        setSuccess(`Négociation ${!current ? 'activée' : 'désactivée'}`);
      } catch { setError('Erreur lors de la modification'); }
      finally { setBusy(false); }
    };
    const handleStatusChange = async (id: string, status: string) => {
      setBusy(true);
      try {
        await admin.changeListingStatus(id, status);
        loadSectionData();
        setSuccess(`Statut changé → ${status}`);
      } catch { setError('Erreur lors du changement de statut'); }
      finally { setBusy(false); }
    };
    return (
      <div className="ad-section">
        <div className="ad-section-header">
          <h2>Gestion des Articles ({adminListingsTotal})</h2>
        </div>
        <div className="ad-filters">
          <input className="ad-input" placeholder="Rechercher..." value={adminListingsSearch} onChange={(e) => { setAdminListingsSearch(e.target.value); setAdminListingsPage(1); }} />
          <select className="ad-select" value={adminListingsStatusFilter} onChange={(e) => { setAdminListingsStatusFilter(e.target.value); setAdminListingsPage(1); }}>
            <option value="ALL">Tous statuts</option>
            <option value="ACTIVE">Actif</option>
            <option value="INACTIVE">Inactif</option>
            <option value="ARCHIVED">Archivé</option>
            <option value="DELETED">Supprimé</option>
          </select>
          <select className="ad-select" value={adminListingsTypeFilter} onChange={(e) => { setAdminListingsTypeFilter(e.target.value); setAdminListingsPage(1); }}>
            <option value="ALL">Tous types</option>
            <option value="PRODUIT">Produits</option>
            <option value="SERVICE">Services</option>
          </select>
        </div>
        <table className="ad-table">
          <thead>
            <tr>
              <th>Article</th>
              <th>Type</th>
              <th>Catégorie</th>
              <th>Ville</th>
              <th>Prix</th>
              <th>Propriétaire</th>
              <th>Statut</th>
              <th>Négociable</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {adminListings.map((l) => (
              <tr key={l.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {l.imageUrl ? <img src={resolveMediaUrl(l.imageUrl)} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} /> : <span style={{ fontSize: 20 }}>{l.type === 'SERVICE' ? '🛠' : '📦'}</span>}
                    <span style={{ fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</span>
                  </div>
                </td>
                <td><span className={l.type === 'SERVICE' ? 'ad-badge ad-badge--pending' : 'ad-badge ad-badge--active'}>{l.type}</span></td>
                <td>{l.category}</td>
                <td>{l.city}</td>
                <td>{money(l.priceUsdCents)}</td>
                <td>
                  <span>{l.ownerDisplayName}</span>
                  {l.businessName && <span className="ad-badge ad-badge--business" style={{ marginLeft: 4, fontSize: 10 }}>{l.businessName}</span>}
                  <span className={roleBadgeClass(l.ownerRole)} style={{ marginLeft: 4, fontSize: 10 }}>{l.ownerRole}</span>
                </td>
                <td><span className={statusBadgeClass(l.status)}>{l.status}</span></td>
                <td>
                  <button
                    type="button"
                    className={`ad-badge ${l.isNegotiable ? 'ad-badge--active' : 'ad-badge--danger'}`}
                    style={{ cursor: 'pointer', border: 'none', padding: '4px 10px' }}
                    onClick={() => void handleToggleNeg(l.id, l.isNegotiable)}
                    disabled={busy}
                    title={l.isNegotiable ? 'Cliquer pour désactiver la négociation' : 'Cliquer pour activer la négociation'}
                  >
                    {l.isNegotiable ? '🤝 Oui' : '🚫 Non'}
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {l.status === 'ACTIVE' && <button type="button" className="ad-btn ad-btn--sm ad-btn--warning" onClick={() => void handleStatusChange(l.id, 'INACTIVE')}>Désactiver</button>}
                    {l.status === 'INACTIVE' && <button type="button" className="ad-btn ad-btn--sm ad-btn--primary" onClick={() => void handleStatusChange(l.id, 'ACTIVE')}>Activer</button>}
                    {l.status !== 'DELETED' && <button type="button" className="ad-btn ad-btn--sm ad-btn--danger" onClick={() => void handleStatusChange(l.id, 'DELETED')}>Supprimer</button>}
                  </div>
                </td>
              </tr>
            ))}
            {adminListings.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, opacity: 0.6 }}>Aucun article trouvé</td></tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="ad-pagination">
            <button type="button" className="ad-btn ad-btn--sm" disabled={adminListingsPage <= 1} onClick={() => setAdminListingsPage(p => p - 1)}>← Précédent</button>
            <span>Page {adminListingsPage} / {totalPages}</span>
            <button type="button" className="ad-btn ad-btn--sm" disabled={adminListingsPage >= totalPages} onClick={() => setAdminListingsPage(p => p + 1)}>Suivant →</button>
          </div>
        )}
      </div>
    );
  };

  /* ── Negotiation Rules ── */
  const renderNegotiationRules = () => {
    const handleToggle = async (category: string, currentLocked: boolean) => {
      setNegoRulesBusy(true);
      try {
        await admin.toggleCategoryNegotiation(category, !currentLocked);
        setNegoRules(prev => prev.map(r => r.category === category ? { ...r, negotiationLocked: !currentLocked } : r));
        setSuccess(`Négociation ${!currentLocked ? 'verrouillée' : 'déverrouillée'} pour « ${category} »`);
      } catch { setError(t('error.modificationFailed')); }
      finally { setNegoRulesBusy(false); }
    };
    const locked = negoRules.filter(r => r.negotiationLocked);
    const unlocked = negoRules.filter(r => !r.negotiationLocked);
    return (
      <div className="ad-section">
        <div className="ad-section-header">
          <h2>{t('admin.negotiationRulesTitle')}</h2>
        </div>
        <p style={{ opacity: 0.7, marginBottom: 'var(--space-md)' }}>
          {t('admin.negotiationRulesDesc')}{' '}
          {t('admin.negotiationRulesInfo')}
        </p>
        <div className="ad-stats-grid" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="ad-stat-card"><div className="ad-stat-value">{negoRules.length}</div><div className="ad-stat-label">{t('admin.categories')}</div></div>
          <div className="ad-stat-card"><div className="ad-stat-value ad-stat-value--green">{unlocked.length}</div><div className="ad-stat-label">{t('admin.openCategories')}</div></div>
          <div className="ad-stat-card"><div className="ad-stat-value ad-stat-value--accent">{locked.length}</div><div className="ad-stat-label">{t('admin.lockedCategories')}</div></div>
        </div>
        {negoRules.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 24, opacity: 0.6 }}>{t('admin.noCategories')}</p>
        ) : (
          <table className="ad-table">
            <thead>
              <tr>
                <th>{t('admin.category')}</th>
                <th>{t('admin.currentStatus')}</th>
                <th>{t('admin.lastUpdated')}</th>
                <th>{t('admin.action')}</th>
              </tr>
            </thead>
            <tbody>
              {negoRules.map(r => (
                <tr key={r.category}>
                  <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{r.category}</td>
                  <td>
                    <span className={`ad-badge ${r.negotiationLocked ? 'ad-badge--danger' : 'ad-badge--active'}`}>
                      {r.negotiationLocked ? t('admin.locked') : t('admin.unlocked')}
                    </span>
                  </td>
                  <td>{r.updatedAt ? fmtDate(r.updatedAt) : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className={`ad-btn ad-btn--sm ${r.negotiationLocked ? 'ad-btn--primary' : 'ad-btn--danger'}`}
                      disabled={negoRulesBusy}
                      onClick={() => void handleToggle(r.category, r.negotiationLocked)}
                    >
                      {r.negotiationLocked ? t('admin.unlock') : t('admin.lock')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  /* ══════════════════════════════════════
     SUBSCRIPTIONS & AI — Admin Center
     ══════════════════════════════════════ */

  // ── Export helpers ──
  const generateSubsCsv = (rows: AdminSubscriptionItem[]) => {
    const header = 'Compte,Email,Rôle,Business,Plan,Source,Statut,Prix USD,Début,Fin,Cycle,Mis à jour\n';
    return header + rows.map(s => [
      s.user?.displayName ?? '—', s.user?.email ?? '—', s.user?.role ?? '—',
      s.business?.publicName ?? '—', s.planCode, s.source ?? '—', s.status,
      (s.priceUsdCents / 100).toFixed(2), s.startsAt?.slice(0, 10) ?? '—',
      s.endsAt?.slice(0, 10) ?? '—', s.billingCycle ?? '—', s.updatedAt?.slice(0, 10) ?? '—',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  };

  const generateSubsXml = (rows: AdminSubscriptionItem[]) => {
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<subscriptions exported="' + new Date().toISOString() + '" count="' + rows.length + '">\n';
    for (const s of rows) {
      xml += '  <subscription id="' + esc(s.id) + '">\n';
      xml += '    <account>' + esc(s.user?.displayName ?? '—') + '</account>\n';
      xml += '    <email>' + esc(s.user?.email ?? '—') + '</email>\n';
      xml += '    <role>' + esc(s.user?.role ?? '—') + '</role>\n';
      xml += '    <business>' + esc(s.business?.publicName ?? '') + '</business>\n';
      xml += '    <scope>' + esc(s.scope ?? '—') + '</scope>\n';
      xml += '    <plan>' + esc(s.planCode) + '</plan>\n';
      xml += '    <source>' + esc(s.source ?? '—') + '</source>\n';
      xml += '    <status>' + esc(s.status) + '</status>\n';
      xml += '    <priceUsd>' + (s.priceUsdCents / 100).toFixed(2) + '</priceUsd>\n';
      xml += '    <billingCycle>' + esc(s.billingCycle ?? '—') + '</billingCycle>\n';
      xml += '    <startsAt>' + esc(s.startsAt?.slice(0, 10) ?? '') + '</startsAt>\n';
      xml += '    <endsAt>' + esc(s.endsAt?.slice(0, 10) ?? '') + '</endsAt>\n';
      xml += '    <updatedAt>' + esc(s.updatedAt?.slice(0, 10) ?? '') + '</updatedAt>\n';
      if (s.addons && s.addons.length > 0) {
        xml += '    <addons>\n';
        for (const a of s.addons) xml += '      <addon code="' + esc(a.addonCode) + '" status="' + esc(a.status) + '" price="' + (a.priceUsdCents / 100).toFixed(2) + '" />\n';
        xml += '    </addons>\n';
      }
      xml += '  </subscription>\n';
    }
    xml += '</subscriptions>';
    return xml;
  };

  const generateDetailXml = (d: AdminSubscriptionDetail) => {
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const s = d.subscription;
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<subscriptionDetail exported="' + new Date().toISOString() + '">\n';
    xml += '  <subscription id="' + esc(s.id) + '">\n';
    xml += '    <plan>' + esc(s.planCode) + '</plan>\n';
    xml += '    <scope>' + esc(s.scope) + '</scope>\n';
    xml += '    <status>' + esc(s.status) + '</status>\n';
    xml += '    <source>' + esc(s.source) + '</source>\n';
    xml += '    <priceUsd>' + (s.priceUsdCents / 100).toFixed(2) + '</priceUsd>\n';
    xml += '    <billingCycle>' + esc(s.billingCycle) + '</billingCycle>\n';
    xml += '    <autoRenew>' + s.autoRenew + '</autoRenew>\n';
    xml += '    <startsAt>' + esc(s.startsAt.slice(0, 10)) + '</startsAt>\n';
    xml += '    <endsAt>' + esc(s.endsAt?.slice(0, 10) ?? '') + '</endsAt>\n';
    xml += '    <createdAt>' + esc(s.createdAt.slice(0, 10)) + '</createdAt>\n';
    xml += '    <updatedAt>' + esc(s.updatedAt.slice(0, 10)) + '</updatedAt>\n';
    if (s.metadata) xml += '    <metadata>' + esc(JSON.stringify(s.metadata)) + '</metadata>\n';
    xml += '  </subscription>\n';
    if (d.user) {
      xml += '  <user id="' + esc(d.user.id) + '">\n';
      xml += '    <email>' + esc(d.user.email) + '</email>\n';
      xml += '    <role>' + esc(d.user.role) + '</role>\n';
      xml += '    <status>' + esc(d.user.status) + '</status>\n';
      xml += '    <displayName>' + esc(d.user.profile?.displayName ?? '—') + '</displayName>\n';
      xml += '  </user>\n';
    }
    if (d.business) {
      xml += '  <business id="' + esc(d.business.id) + '">\n';
      xml += '    <publicName>' + esc(d.business.publicName) + '</publicName>\n';
      xml += '    <legalName>' + esc(d.business.legalName ?? '') + '</legalName>\n';
      xml += '    <slug>' + esc(d.business.slug) + '</slug>\n';
      xml += '  </business>\n';
    }
    if (d.addons.length > 0) {
      xml += '  <addons>\n';
      for (const a of d.addons) xml += '    <addon code="' + esc(a.addonCode) + '" status="' + esc(a.status) + '" price="' + (a.priceUsdCents / 100).toFixed(2) + '" start="' + esc(a.startsAt.slice(0, 10)) + '" end="' + esc(a.endsAt?.slice(0, 10) ?? '') + '" />\n';
      xml += '  </addons>\n';
    }
    if (d.auditLogs.length > 0) {
      xml += '  <auditTrail>\n';
      for (const log of d.auditLogs) xml += '    <entry action="' + esc(log.action) + '" date="' + esc(log.createdAt.slice(0, 19)) + '" actor="' + esc(log.actorUserId) + '">' + esc(JSON.stringify(log.metadata ?? {})) + '</entry>\n';
      xml += '  </auditTrail>\n';
    }
    if (d.paymentOrders.length > 0) {
      xml += '  <paymentOrders>\n';
      for (const po of d.paymentOrders) xml += '    <order id="' + esc(po.id) + '" plan="' + esc(po.planCode) + '" amount="' + (po.amountUsdCents / 100).toFixed(2) + '" method="' + esc(po.method) + '" status="' + esc(po.status) + '" ref="' + esc(po.transferReference) + '" date="' + esc(po.createdAt.slice(0, 10)) + '" />\n';
      xml += '  </paymentOrders>\n';
    }
    xml += '</subscriptionDetail>';
    return xml;
  };

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const printDetailAsPdf = () => {
    const el = document.getElementById('sub-detail-print');
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const safeHtml = el.cloneNode(true) as HTMLElement;
    safeHtml.querySelectorAll('script,iframe,object,embed,form').forEach(n => n.remove());
    win.document.write('<html><head><title>Détail abonnement — Kin-Sell Admin</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#0F172A;font-size:13px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #CBD5E1}th{background:#F8FAFC;font-weight:600;font-size:11px;text-transform:uppercase;color:#475569}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600}.badge-green{background:#D1FAE5;color:#065F46}.badge-red{background:#FEE2E2;color:#991B1B}.badge-amber{background:#FEF3C7;color:#92400E}.badge-cyan{background:#CFFAFE;color:#155E75}h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;margin:20px 0 8px;color:#0EA5E9;border-bottom:1px solid #CBD5E1;padding-bottom:4px}.meta{color:#475569;font-size:11px}</style></head><body>');
    win.document.write(safeHtml.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.onload = () => { win.print(); };
  };

  const renderSubscriptions = () => {
    // Admin palette
    const C = {
      bg: '#F8FAFC', card: '#FFFFFF', text: '#0F172A', textSec: '#475569',
      border: '#CBD5E1', accent: '#0EA5E9', success: '#10B981', warn: '#F59E0B', danger: '#EF4444',
    };

    const sourceBadge = (src: string) => {
      if (src === 'admin') return { bg: '#FEF3C7', color: '#92400E', label: 'Manuel' };
      return { bg: '#CFFAFE', color: '#155E75', label: 'PayPal' };
    };
    const statusBadge = (st: string) => {
      if (st === 'ACTIVE') return { bg: '#D1FAE5', color: '#065F46' };
      if (st === 'EXPIRED') return { bg: '#FEE2E2', color: '#991B1B' };
      if (st === 'CANCELED') return { bg: '#FEE2E2', color: '#991B1B' };
      return { bg: '#F1F5F9', color: '#475569' };
    };
    const orderStatusBadge = (st: string) => {
      if (st === 'PAID' || st === 'VALIDATED') return { bg: '#D1FAE5', color: '#065F46' };
      if (st === 'FAILED') return { bg: '#FEE2E2', color: '#991B1B' };
      if (st === 'PENDING' || st === 'USER_CONFIRMED') return { bg: '#FEF3C7', color: '#92400E' };
      if (st === 'CANCELED' || st === 'EXPIRED') return { bg: '#FEE2E2', color: '#991B1B' };
      return { bg: '#F1F5F9', color: '#475569' };
    };

    const handleActivate = async () => {
      if (!activateForm.userId || !activateForm.reason) return;
      setActivateMsg(null);
      try {
        await admin.activatePlan(activateForm);
        setActivateMsg('✅ Forfait activé avec succès');
        setActivateForm({ userId: '', planCode: 'BOOST', durationDays: 30, reason: '', exempt: false });
        setActivateSelectedUser(null);
        setActivateUserSearch('');
        loadSectionData();
      } catch (e: any) {
        setActivateMsg('❌ ' + (e?.message || 'Erreur'));
      }
    };

    const handleRevoke = async (subId: string) => {
      const reason = prompt('Raison de la révocation :');
      if (!reason) return;
      setSubActionBusy(subId);
      try {
        await admin.revokeSubscription({ subscriptionId: subId, reason });
        loadSectionData();
      } catch (e: any) {
        alert('Erreur: ' + (e?.message || 'Erreur'));
      } finally {
        setSubActionBusy(null);
      }
    };

    const openDetail = async (id: string) => {
      setSubDetailLoading(true);
      try {
        const detail = await admin.subscriptionDetail(id);
        setSubDetail(detail);
      } catch (e: any) {
        alert('Erreur: ' + (e?.message || 'Erreur'));
      } finally {
        setSubDetailLoading(false);
      }
    };

    const inputStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 12, outline: 'none' };
    const selectStyle: React.CSSProperties = { ...inputStyle, minWidth: 100 };
    const tabStyle = (active: boolean): React.CSSProperties => ({
      padding: '7px 16px', fontSize: 12, fontWeight: 600, border: `1px solid ${active ? C.accent : C.border}`,
      borderRadius: 6, background: active ? C.accent : C.card, color: active ? '#FFF' : C.textSec,
      cursor: 'pointer', transition: 'all 160ms ease',
    });

    // ── Detail modal ──
    if (subDetail) {
      const s = subDetail.subscription;
      const sb = statusBadge(s.status);
      const src = sourceBadge(s.source);
      const meta = s.metadata as Record<string, unknown> | null;
      return (
        <div className="ad-section animate-fade-in" style={{ background: C.bg, borderRadius: 12, padding: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.card, borderRadius: '12px 12px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setSubDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: C.textSec }}>← Retour</button>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>Détail abonnement</h2>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={printDetailAsPdf}
                style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.accent, cursor: 'pointer' }}>
                📄 PDF
              </button>
              <button onClick={() => downloadFile(generateDetailXml(subDetail), `subscription-${s.id.slice(0, 8)}.xml`, 'application/xml')}
                style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.accent, cursor: 'pointer' }}>
                📋 XML
              </button>
            </div>
          </div>

          <div id="sub-detail-print" style={{ padding: 20 }}>
            <h1 style={{ fontSize: 16, color: C.text, margin: '0 0 4px' }}>Abonnement {s.planCode} — {subDetail.user?.profile?.displayName ?? subDetail.user?.email ?? '—'}</h1>
            <p className="meta" style={{ color: C.textSec, fontSize: 11, margin: '0 0 16px' }}>ID: {s.id} · Créé le {new Date(s.createdAt).toLocaleDateString('fr-FR')}</p>

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Plan', val: s.planCode },
                { label: 'Scope', val: s.scope },
                { label: 'Statut', val: s.status, badge: sb },
                { label: 'Source', val: src.label, badge: src },
                { label: 'Prix', val: s.priceUsdCents > 0 ? `${(s.priceUsdCents / 100).toFixed(2)} $` : 'Gratuit' },
                { label: 'Cycle', val: s.billingCycle },
                { label: 'Auto-renew', val: s.autoRenew ? 'Oui' : 'Non' },
                { label: 'Début', val: new Date(s.startsAt).toLocaleDateString('fr-FR') },
                { label: 'Fin', val: s.endsAt ? new Date(s.endsAt).toLocaleDateString('fr-FR') : '—' },
                { label: 'Mis à jour', val: new Date(s.updatedAt).toLocaleDateString('fr-FR') },
              ].map(item => (
                <div key={item.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, color: C.textSec, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                  {'badge' in item && item.badge ? (
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, background: item.badge.bg, color: item.badge.color }}>{item.val}</span>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.val}</div>
                  )}
                </div>
              ))}
            </div>

            {/* User / Business */}
            {subDetail.user && (
              <>
                <h2 style={{ fontSize: 13, color: C.accent, margin: '20px 0 8px', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>Utilisateur</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {[
                    { l: 'Email', v: subDetail.user.email },
                    { l: 'Rôle', v: subDetail.user.role },
                    { l: 'Statut compte', v: subDetail.user.status },
                    { l: 'Nom', v: subDetail.user.profile?.displayName ?? '—' },
                    { l: 'Username', v: subDetail.user.profile?.username ?? '—' },
                  ].map(f => (
                    <div key={f.l} style={{ fontSize: 12, color: C.text }}><span style={{ color: C.textSec }}>{f.l}:</span> <strong>{f.v}</strong></div>
                  ))}
                </div>
              </>
            )}
            {subDetail.business && (
              <>
                <h2 style={{ fontSize: 13, color: C.accent, margin: '20px 0 8px', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>Business</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {[
                    { l: 'Nom public', v: subDetail.business.publicName },
                    { l: 'Nom légal', v: subDetail.business.legalName ?? '—' },
                    { l: 'Slug', v: subDetail.business.slug },
                  ].map(f => (
                    <div key={f.l} style={{ fontSize: 12, color: C.text }}><span style={{ color: C.textSec }}>{f.l}:</span> <strong>{f.v}</strong></div>
                  ))}
                </div>
              </>
            )}

            {/* Add-ons (features IA) */}
            {subDetail.addons.length > 0 && (
              <>
                <h2 style={{ fontSize: 13, color: C.accent, margin: '20px 0 8px', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>Features IA débloquées</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: C.bg }}><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Code</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Statut</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Prix</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Début</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Fin</th></tr></thead>
                  <tbody>
                    {subDetail.addons.map((a, i) => {
                      const asb = statusBadge(a.status);
                      return (
                        <tr key={i}><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{a.addonCode}</td><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: asb.bg, color: asb.color }}>{a.status}</span></td><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}>{(a.priceUsdCents / 100).toFixed(2)} $</td><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}>{new Date(a.startsAt).toLocaleDateString('fr-FR')}</td><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}>{a.endsAt ? new Date(a.endsAt).toLocaleDateString('fr-FR') : '—'}</td></tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {/* Metadata (admin activation info) */}
            {meta && (meta as any).adminActivated && (
              <>
                <h2 style={{ fontSize: 13, color: C.warn, margin: '20px 0 8px', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>Activation manuelle</h2>
                <div style={{ fontSize: 12, color: C.text, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  <div><span style={{ color: C.textSec }}>Raison:</span> <strong>{(meta as any).reason ?? '—'}</strong></div>
                  <div><span style={{ color: C.textSec }}>Exempté:</span> <strong>{(meta as any).exempt ? 'Oui' : 'Non'}</strong></div>
                  <div><span style={{ color: C.textSec }}>Activé par:</span> <strong>{String((meta as any).activatedBy ?? '—').slice(0, 12)}</strong></div>
                  <div><span style={{ color: C.textSec }}>Date:</span> <strong>{(meta as any).activatedAt ? new Date((meta as any).activatedAt).toLocaleDateString('fr-FR') : '—'}</strong></div>
                </div>
              </>
            )}

            {/* Payment orders */}
            {subDetail.paymentOrders.length > 0 && (
              <>
                <h2 style={{ fontSize: 13, color: C.accent, margin: '20px 0 8px', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>Historique des paiements</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: C.bg }}><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Plan</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Montant</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Méthode</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Statut</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Référence</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Date</th></tr></thead>
                  <tbody>
                    {subDetail.paymentOrders.map(po => {
                      const posb = orderStatusBadge(po.status);
                      return (
                        <tr key={po.id}><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{po.planCode}</td><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}>{(po.amountUsdCents / 100).toFixed(2)} $</td><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}>{po.method}</td><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: posb.bg, color: posb.color }}>{po.status}</span></td><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontFamily: 'monospace', fontSize: 10 }}>{po.transferReference}</td><td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}>{new Date(po.createdAt).toLocaleDateString('fr-FR')}</td></tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {/* Audit trail */}
            {subDetail.auditLogs.length > 0 && (
              <>
                <h2 style={{ fontSize: 13, color: C.accent, margin: '20px 0 8px', borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>Journal d'audit</h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: C.bg }}><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Action</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Date</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Acteur</th><th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textSec }}>Détails</th></tr></thead>
                  <tbody>
                    {subDetail.auditLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontWeight: 600, color: C.accent }}>{log.action}</td>
                        <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}` }}>{new Date(log.createdAt).toLocaleString('fr-FR')}</td>
                        <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontFamily: 'monospace', fontSize: 10 }}>{log.actorUserId.slice(0, 12)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 10, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{JSON.stringify(log.metadata ?? {})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          {/* Actions footer */}
          {s.status === 'ACTIVE' && (
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
              <button onClick={() => handleRevoke(s.id)} disabled={subActionBusy === s.id}
                style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: C.danger, color: '#FFF', cursor: 'pointer', opacity: subActionBusy === s.id ? 0.5 : 1 }}>
                {subActionBusy === s.id ? '…' : '🚫 Révoquer cet abonnement'}
              </button>
            </div>
          )}
        </div>
      );
    }

    // ── Main subscriptions view ──
    return (
      <div className="ad-section animate-fade-in" style={{ background: C.bg, borderRadius: 12, padding: 0 }}>
        {/* Title */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: C.card, borderRadius: '12px 12px 0 0' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>💳 Abonnements & IA — Centre d'administration</h2>
        </div>

        {/* KPI Bandeau */}
        {subKpi && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            {[
              { label: 'Actifs', val: subKpi.active, color: C.success },
              { label: 'Expirés', val: subKpi.expired, color: C.danger },
              { label: 'Annulés', val: subKpi.canceled, color: '#888' },
              { label: 'Activations admin', val: subKpi.adminActivated, color: C.warn },
              { label: 'Essais IA', val: subKpi.trials, color: C.accent },
              { label: 'Essais actifs', val: subKpi.trialsActive, color: C.success },
              { label: 'Total', val: subKpi.total, color: C.text },
            ].map(k => (
              <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.val}</div>
                <div style={{ fontSize: 10, color: C.textSec, marginTop: 2, fontWeight: 600, textTransform: 'uppercase' }}>{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Sub tabs */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 20px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
          {([
            { k: 'kpi' as const, l: '📊 Vue KPI' },
            { k: 'subs' as const, l: '💳 Abonnements' },
            { k: 'orders' as const, l: '📦 Commandes' },
            { k: 'trials' as const, l: '🧪 Essais IA' },
            { k: 'activate' as const, l: '🔑 Activer manuellement' },
          ]).map(st => (
            <button key={st.k} onClick={() => setSubSubTab(st.k)} style={tabStyle(subSubTab === st.k)}>{st.l}</button>
          ))}
        </div>

        <div style={{ padding: 20 }}>

        {/* ── KPI Dashboard ── */}
        {subSubTab === 'kpi' && (
          <div>
            {subKpi && subKpi.planDistribution && (
              <>
                <h3 style={{ fontSize: 13, color: C.text, fontWeight: 700, marginBottom: 10 }}>Répartition par plan</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                  {Object.entries(subKpi.planDistribution).map(([plan, count]) => (
                    <div key={plan} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 14px', textAlign: 'center', minWidth: 90 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{count}</div>
                      <div style={{ fontSize: 10, color: C.textSec, fontWeight: 600 }}>{plan}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {subStats && (
              <>
                <h3 style={{ fontSize: 13, color: C.text, fontWeight: 700, marginBottom: 10 }}>Recommandations IA</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total', val: subStats.total },
                    { label: 'Actives', val: subStats.active },
                    { label: 'Cliquées', val: subStats.clicked },
                    { label: 'Acceptées', val: subStats.accepted },
                    { label: 'Ignorées', val: subStats.dismissed },
                  ].map(s => (
                    <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{s.val}</div>
                      <div style={{ fontSize: 10, color: C.textSec, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <h4 style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>Par moteur IA</h4>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {Object.entries(subStats.byEngine ?? {}).map(([k, v]) => (
                    <span key={k} style={{ padding: '3px 10px', borderRadius: 4, background: '#CFFAFE', color: '#155E75', fontSize: 11, fontWeight: 600 }}>{k}: {v as number}</span>
                  ))}
                </div>

                <h4 style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>Essais IA</h4>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(subStats.trials ?? {}).map(([k, v]) => (
                    <span key={k} style={{ padding: '3px 10px', borderRadius: 4, background: '#D1FAE5', color: '#065F46', fontSize: 11, fontWeight: 600 }}>{k}: {v as number}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Subscriptions table ── */}
        {subSubTab === 'subs' && (
          <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder="Filtrer par email…" value={subFilterEmail} onChange={e => setSubFilterEmail(e.target.value)} style={inputStyle} />
              <select value={subFilterStatus} onChange={e => { setSubFilterStatus(e.target.value); setSubPage(1); }} style={selectStyle}>
                <option value="ALL">Tous statuts</option>
                <option value="ACTIVE">Actif</option>
                <option value="EXPIRED">Expiré</option>
                <option value="CANCELED">Annulé</option>
              </select>
              <select value={subFilterScope} onChange={e => { setSubFilterScope(e.target.value); setSubPage(1); }} style={selectStyle}>
                <option value="ALL">Tous scopes</option>
                <option value="USER">User</option>
                <option value="BUSINESS">Business</option>
              </select>
              <select value={subFilterPlan} onChange={e => { setSubFilterPlan(e.target.value); setSubPage(1); }} style={selectStyle}>
                <option value="ALL">Tous plans</option>
                {['FREE', 'BOOST', 'AUTO', 'PRO_VENDOR', 'STARTER', 'BUSINESS', 'SCALE'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={subFilterSource} onChange={e => { setSubFilterSource(e.target.value); setSubPage(1); }} style={selectStyle}>
                <option value="ALL">Toutes sources</option>
                <option value="paypal">PayPal</option>
                <option value="admin">Admin (manuel)</option>
              </select>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: C.textSec, fontWeight: 600 }}>{subTotal} résultat{subTotal > 1 ? 's' : ''}</span>
            </div>

            {/* Export buttons */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button onClick={() => downloadFile(generateSubsCsv(subList), 'subscriptions.csv', 'text/csv')}
                style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.accent, cursor: 'pointer' }}>
                📄 Export PDF/CSV
              </button>
              <button onClick={() => downloadFile(generateSubsXml(subList), 'subscriptions.xml', 'application/xml')}
                style={{ padding: '5px 12px', fontSize: 11, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.accent, cursor: 'pointer' }}>
                📋 Export XML
              </button>
            </div>

            {subList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: C.textSec, fontSize: 13 }}>Aucun abonnement trouvé avec ces filtres.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: C.card }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {['Compte', 'Email', 'Rôle', 'Business', 'Plan', 'Features IA', 'Source', 'Statut', 'Début', 'Fin', 'Mis à jour', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `2px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subList.map(s => {
                    const sb2 = statusBadge(s.status);
                    const src2 = sourceBadge(s.source ?? 'paypal');
                    return (
                      <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: C.text }}>{s.user?.displayName ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: C.textSec, fontSize: 11 }}>{s.user?.email ?? '—'}</td>
                        <td style={{ padding: '8px 10px' }}><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#F1F5F9', color: C.textSec }}>{s.user?.role ?? s.scope}</span></td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: C.accent }}>{s.business?.publicName ?? '—'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: C.accent }}>{s.planCode}</td>
                        <td style={{ padding: '8px 10px', fontSize: 10 }}>{s.addons && s.addons.length > 0 ? s.addons.map(a => a.addonCode).join(', ') : '—'}</td>
                        <td style={{ padding: '8px 10px' }}><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: src2.bg, color: src2.color }}>{src2.label}</span></td>
                        <td style={{ padding: '8px 10px' }}><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: sb2.bg, color: sb2.color }}>{s.status}</span></td>
                        <td style={{ padding: '8px 10px', fontSize: 11 }}>{new Date(s.startsAt).toLocaleDateString('fr-FR')}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11 }}>{s.endsAt ? new Date(s.endsAt).toLocaleDateString('fr-FR') : '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11 }}>{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('fr-FR') : '—'}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                            <button onClick={() => openDetail(s.id)} disabled={subDetailLoading}
                              style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 4, background: C.card, color: C.accent, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              🔍 Détail
                            </button>
                            {s.status === 'ACTIVE' && (
                              <button onClick={() => handleRevoke(s.id)} disabled={subActionBusy === s.id}
                                style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, border: 'none', borderRadius: 4, background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', opacity: subActionBusy === s.id ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                                {subActionBusy === s.id ? '…' : '🚫 Révoquer'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
            {subTotal > 20 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
                <button disabled={subPage <= 1} onClick={() => setSubPage(p => p - 1)} style={{ ...tabStyle(false), opacity: subPage <= 1 ? 0.4 : 1 }}>◀</button>
                <span style={{ fontSize: 12, color: C.textSec, alignSelf: 'center', fontWeight: 600 }}>Page {subPage} / {Math.ceil(subTotal / 20)}</span>
                <button disabled={subList.length < 20} onClick={() => setSubPage(p => p + 1)} style={{ ...tabStyle(false), opacity: subList.length < 20 ? 0.4 : 1 }}>▶</button>
              </div>
            )}
          </div>
        )}

        {/* ── Trials ── */}
        {subSubTab === 'trials' && (
          <div>
            {trialList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: C.textSec, fontSize: 13 }}>Aucun essai IA enregistré.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: C.card }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {['Utilisateur', 'Email', 'Forfait', 'Moteur', 'Statut', 'Raison', 'Dates'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `2px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trialList.map(t => {
                    const tsb = t.status === 'ACTIVE' ? { bg: '#D1FAE5', color: '#065F46' } : t.status === 'PROPOSED' ? { bg: '#FEF3C7', color: '#92400E' } : { bg: '#F1F5F9', color: '#475569' };
                    return (
                      <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: C.text }}>{t.user?.displayName || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: C.textSec }}>{t.user?.email || '—'}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: C.accent }}>{t.planCode}</td>
                        <td style={{ padding: '8px 10px', fontSize: 11 }}>{t.sourceEngine}</td>
                        <td style={{ padding: '8px 10px' }}><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: tsb.bg, color: tsb.color }}>{t.status}</span></td>
                        <td style={{ padding: '8px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{t.reason}</td>
                        <td style={{ padding: '8px 10px', fontSize: 10 }}>
                          {t.startsAt ? new Date(t.startsAt).toLocaleDateString('fr-FR') : '—'}
                          {t.endsAt ? ` → ${new Date(t.endsAt).toLocaleDateString('fr-FR')}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {trialTotal > 20 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
                <button disabled={trialPage <= 1} onClick={() => setTrialPage(p => p - 1)} style={{ ...tabStyle(false), opacity: trialPage <= 1 ? 0.4 : 1 }}>◀</button>
                <span style={{ fontSize: 12, color: C.textSec, alignSelf: 'center', fontWeight: 600 }}>Page {trialPage}</span>
                <button disabled={trialList.length < 20} onClick={() => setTrialPage(p => p + 1)} style={{ ...tabStyle(false), opacity: trialList.length < 20 ? 0.4 : 1 }}>▶</button>
              </div>
            )}
          </div>
        )}

        {/* ── Orders ── */}
        {subSubTab === 'orders' && (
          <div>
            {orderActionMsg && (
              <div style={{ padding: '8px 14px', borderRadius: 6, marginBottom: 12, fontSize: 12,
                background: orderActionMsg.startsWith('✅') ? '#D1FAE5' : '#FEE2E2',
                color: orderActionMsg.startsWith('✅') ? '#065F46' : '#991B1B', border: `1px solid ${orderActionMsg.startsWith('✅') ? '#10B981' : '#EF4444'}20`,
              }}>{orderActionMsg}</div>
            )}

            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>Filtrer :</span>
              {['ALL', 'PENDING', 'USER_CONFIRMED', 'PAID', 'FAILED', 'CANCELED', 'EXPIRED'].map(s => (
                <button key={s} onClick={() => { setOrderStatusFilter(s); setOrderPage(1); }} style={tabStyle(orderStatusFilter === s)}>{s === 'ALL' ? 'Tous' : s}</button>
              ))}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: C.textSec, fontWeight: 600 }}>{orderTotal} commande{orderTotal > 1 ? 's' : ''}</span>
            </div>

            {orderList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: C.textSec, fontSize: 13 }}>Aucune commande trouvée.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: C.card }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {['Utilisateur', 'Forfait', 'Montant', 'Méthode', 'Statut', 'Référence', 'Date', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `2px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderList.map(o => {
                    const userName = o.user?.profile?.displayName || o.user?.email || o.userId || '—';
                    const bizName = o.business?.publicName;
                    const canActivate = ['PENDING', 'USER_CONFIRMED'].includes(o.status);
                    const canFail = ['PENDING', 'USER_CONFIRMED'].includes(o.status);
                    const osb = orderStatusBadge(o.status);
                    return (
                      <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ fontWeight: 600, color: C.text }}>{userName}</span>
                          {bizName && <><br/><span style={{ fontSize: 10, color: C.accent }}>🏢 {bizName}</span></>}
                          <br/><span style={{ fontSize: 9, color: C.textSec }}>{o.targetScope}</span>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: C.accent }}>{o.planCode}</td>
                        <td style={{ padding: '8px 10px' }}>{(o.amountUsdCents / 100).toFixed(2)} $</td>
                        <td style={{ padding: '8px 10px', fontSize: 10 }}>{o.method}</td>
                        <td style={{ padding: '8px 10px' }}><span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: osb.bg, color: osb.color }}>{o.status}</span></td>
                        <td style={{ padding: '8px 10px', fontSize: 10, fontFamily: 'monospace' }}>{o.transferReference}</td>
                        <td style={{ padding: '8px 10px', fontSize: 10 }}>{new Date(o.createdAt).toLocaleDateString('fr-FR')}</td>
                        <td style={{ padding: '8px 10px' }}>
                          {(canActivate || canFail) && (
                            <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                              {canActivate && (
                                <button disabled={orderActionBusy !== null}
                                  onClick={async () => {
                                    const reason = prompt('Raison de l\'activation (optionnel) :') ?? '';
                                    setOrderActionBusy(o.id); setOrderActionMsg(null);
                                    try { await admin.billingValidateOrder({ orderId: o.id, reason }); setOrderActionMsg(`✅ Forfait ${o.planCode} activé pour ${userName}`); loadSectionData(); } catch (e: any) { setOrderActionMsg('❌ ' + (e?.message || 'Erreur')); } finally { setOrderActionBusy(null); }
                                  }}
                                  style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, border: 'none', borderRadius: 4, background: '#D1FAE5', color: '#065F46', cursor: 'pointer', opacity: orderActionBusy === o.id ? 0.5 : 1 }}>
                                  {orderActionBusy === o.id ? '…' : '✅ Activer'}
                                </button>
                              )}
                              {canFail && (
                                <button disabled={orderActionBusy !== null}
                                  onClick={async () => {
                                    const reason = prompt('Raison du refus :'); if (!reason) return;
                                    setOrderActionBusy(o.id); setOrderActionMsg(null);
                                    try { await admin.billingFailOrder({ orderId: o.id, reason }); setOrderActionMsg(`✅ Commande ${o.transferReference} refusée`); loadSectionData(); } catch (e: any) { setOrderActionMsg('❌ ' + (e?.message || 'Erreur')); } finally { setOrderActionBusy(null); }
                                  }}
                                  style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, border: 'none', borderRadius: 4, background: '#FEE2E2', color: '#991B1B', cursor: 'pointer', opacity: orderActionBusy === o.id ? 0.5 : 1 }}>
                                  ❌ Refuser
                                </button>
                              )}
                            </div>
                          )}
                          {(o.status === 'PAID' || o.status === 'VALIDATED') && <span style={{ fontSize: 10, color: C.success }}>✅ Activé{o.validatedAt ? ` le ${new Date(o.validatedAt).toLocaleDateString('fr-FR')}` : ''}</span>}
                          {o.status === 'FAILED' && o.depositorNote && <span style={{ fontSize: 9, color: C.textSec, display: 'block', marginTop: 2 }}>{o.depositorNote}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
            {orderTotal > 20 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
                <button disabled={orderPage <= 1} onClick={() => setOrderPage(p => p - 1)} style={{ ...tabStyle(false), opacity: orderPage <= 1 ? 0.4 : 1 }}>◀</button>
                <span style={{ fontSize: 12, color: C.textSec, alignSelf: 'center', fontWeight: 600 }}>Page {orderPage} / {Math.ceil(orderTotal / 20)}</span>
                <button disabled={orderList.length < 20} onClick={() => setOrderPage(p => p + 1)} style={{ ...tabStyle(false), opacity: orderList.length < 20 ? 0.4 : 1 }}>▶</button>
              </div>
            )}
          </div>
        )}

        {/* ── Manual activate ── */}
        {subSubTab === 'activate' && (
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ fontSize: 14, color: C.text, fontWeight: 700, marginBottom: 12 }}>🔑 Activer un forfait manuellement</h3>

            {/* User search picker */}
            <div style={{ marginBottom: 14, position: 'relative' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4, display: 'block' }}>👤 Sélectionner un utilisateur</label>
              {activateSelectedUser ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#F0FDF4', border: `1px solid ${C.success}`, borderRadius: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(111,88,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#6f58ff', overflow: 'hidden' }}>
                    {activateSelectedUser.avatarUrl ? <img src={resolveMediaUrl(activateSelectedUser.avatarUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (activateSelectedUser.displayName?.slice(0, 2).toUpperCase() ?? '?')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{activateSelectedUser.displayName}</div>
                    <div style={{ fontSize: 11, color: C.textSec }}>{activateSelectedUser.email ?? activateSelectedUser.phone ?? activateSelectedUser.id.slice(0, 8)} — {activateSelectedUser.role}{activateSelectedUser.country ? ` — ${activateSelectedUser.country}` : ''}</div>
                  </div>
                  <button onClick={() => { setActivateSelectedUser(null); setActivateForm(f => ({ ...f, userId: '' })); setActivateUserSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: C.danger }}>✕</button>
                </div>
              ) : (
                <>
                  <input placeholder="🔍 Rechercher par nom, email ou ID…" value={activateUserSearch} onChange={e => setActivateUserSearch(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                  {activateUserLoading && <div style={{ fontSize: 11, color: C.textSec, marginTop: 4 }}>Recherche…</div>}
                  {activateUserResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 240, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                      {activateUserResults.map(u => (
                        <div key={u.id} onClick={() => { setActivateSelectedUser(u); setActivateForm(f => ({ ...f, userId: u.id })); setActivateUserSearch(''); setActivateUserResults([]); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, transition: 'background 120ms' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#F1F5F9')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(111,88,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#6f58ff', overflow: 'hidden', flexShrink: 0 }}>
                            {u.avatarUrl ? <img src={resolveMediaUrl(u.avatarUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (u.displayName?.slice(0, 2).toUpperCase() ?? '?')}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName}</div>
                            <div style={{ fontSize: 10, color: C.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email ?? u.phone ?? u.id.slice(0, 8)} · {u.role}{u.country ? ` · ${u.country}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {activateUserSearch.length >= 2 && !activateUserLoading && activateUserResults.length === 0 && (
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 4 }}>Aucun utilisateur trouvé</div>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={activateForm.planCode} onChange={e => setActivateForm(f => ({ ...f, planCode: e.target.value }))} style={selectStyle}>
                {['FREE', 'BOOST', 'AUTO', 'PRO_VENDOR', 'STARTER', 'BUSINESS', 'SCALE'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="number" placeholder="Durée (jours)" value={activateForm.durationDays} onChange={e => setActivateForm(f => ({ ...f, durationDays: Number(e.target.value) }))} style={inputStyle} />
              <input placeholder="Raison de l'activation" value={activateForm.reason} onChange={e => setActivateForm(f => ({ ...f, reason: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.textSec }}>
                <input type="checkbox" checked={activateForm.exempt} onChange={e => setActivateForm(f => ({ ...f, exempt: e.target.checked }))} />
                Exempter du paiement (gratuit)
              </label>
              <button onClick={handleActivate} disabled={!activateForm.userId || !activateForm.reason}
                style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700, border: 'none', borderRadius: 8, background: C.accent, color: '#FFF', cursor: 'pointer', opacity: (!activateForm.userId || !activateForm.reason) ? 0.4 : 1, transition: 'all 160ms ease' }}>
                Activer le forfait
              </button>
              {activateMsg && <p style={{ fontSize: 12, color: activateMsg.startsWith('✅') ? C.success : C.danger, margin: '4px 0 0' }}>{activateMsg}</p>}
            </div>
          </div>
        )}

        </div>
      </div>
    );
  };

  // ═══════════════════════════  VERIFICATION ADMIN  ═══════════════════════════

  const renderVerification = () => <AdminVerificationPanel />;

  // ═══════════════════════════  INCENTIVES ADMIN  ═══════════════════════════

  const renderIncentives = () => <AdminIncentivesPanel />;

  // ═══════════════════════════════════════════════
  // IA TABS — 5 sections Intelligence Artificielle
  // ═══════════════════════════════════════════════

  const [iaData, setIaData] = useState<Record<string, unknown> | null>(null);
  const [iaLoading, setIaLoading] = useState(false);

  // IA Marchande — sources
  const [iaMarchandeSources, setIaMarchandeSources] = useState<IaSource[]>([]);
  const [iaMarchandeSrcForm, setIaMarchandeSrcForm] = useState({ type: 'URL' as 'URL' | 'FILE', name: '', url: '', fileType: '', notes: '' });
  const [iaMarchandeSrcMsg, setIaMarchandeSrcMsg] = useState<string | null>(null);

  // IA Commande — toggle
  const [iaCommandeToggling, setIaCommandeToggling] = useState<string | null>(null);

  // IA Ads — create form
  const [iaAdsForm, setIaAdsForm] = useState({ title: '', description: '', imageUrl: '', linkUrl: '', ctaText: '', targetPages: [] as string[], priority: 5 });
  const [iaAdsFormOpen, setIaAdsFormOpen] = useState(false);
  const [iaAdsMsg, setIaAdsMsg] = useState<string | null>(null);

  // IA Message — send promo form
  const [iaMsgFormOpen, setIaMsgFormOpen] = useState(false);
  const [iaMsgForm, setIaMsgForm] = useState({ channel: 'EMAIL' as 'EMAIL' | 'PUSH' | 'INTERNAL', subject: '', body: '', reason: 'PROMO_MANUAL' });
  const [iaMsgTargetSearch, setIaMsgTargetSearch] = useState('');
  const [iaMsgTargetUsers, setIaMsgTargetUsers] = useState<IaTargetUser[]>([]);
  const [iaMsgSelected, setIaMsgSelected] = useState<string[]>([]);
  const [iaMsgSending, setIaMsgSending] = useState(false);
  const [iaMsgResult, setIaMsgResult] = useState<string | null>(null);

  // IA Message — filters & sorting
  const [iaMsgFilterChannel, setIaMsgFilterChannel] = useState<'all' | 'EMAIL' | 'PUSH' | 'INTERNAL'>('all');
  const [iaMsgFilterReason, setIaMsgFilterReason] = useState<'all' | string>('all');
  const [iaMsgFilterStatus, setIaMsgFilterStatus] = useState<'all' | 'delivered' | 'failed'>('all');
  const [iaMsgSortBy, setIaMsgSortBy] = useState<'date-desc' | 'date-asc' | 'channel' | 'reason'>('date-desc');

  const isMsgSelected = (id: string) => iaMsgSelected.includes(id);
  const isMsgSendDisabled = () => iaMsgSending || !iaMsgForm.subject || !iaMsgForm.body || iaMsgSelected.length === 0;

  const loadIaData = useCallback(async (endpoint: string) => {
    setIaLoading(true);
    setIaData(null);
    try {
      const res = await fetch(`${API_BASE}/admin/ia/${endpoint}`, {
        credentials: 'include',
      });
      if (res.ok) setIaData(await res.json());
    } catch { /* ignore */ }
    setIaLoading(false);
  }, []);

  useEffect(() => {
    if (activeSection === 'ia-analytique') loadIaData('analytique');
    else if (activeSection === 'ia-marchande') {
      loadIaData('marchande');
      admin.iaSources('marchande').then(r => setIaMarchandeSources(r.sources)).catch(() => {});
    }
    else if (activeSection === 'ia-commande') loadIaData('commande');
    else if (activeSection === 'ia-ads') loadIaData('ads');
    else if (activeSection === 'ia-message') loadIaData('messages');
  }, [activeSection, loadIaData]);

  const renderIaAnalytique = () => <AdminAnalyticsPanel />;

  const renderIaMarchande = () => {
    const d = iaData as any;
    return (
      <div className="ad-content-block">
        <h2 className="ad-content-title">🏷️ IA Marchande</h2>
        <p className="ad-content-subtitle" style={{ color: 'var(--ad-text-3)', marginBottom: 16 }}>Informations en temps réel sur chaque marchandise ajoutée — conseils intelligents.</p>
        {iaLoading ? <p className="ad-content-subtitle">Analyse du marché en cours…</p> : !d ? <p className="ad-content-subtitle">Aucune donnée</p> : (
          <>
            {/* Prix globaux */}
            <div className="ad-stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#6f58ff' }}>{d.priceStats?.total ?? 0}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Articles actifs</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#4ecdc4' }}>{money(d.priceStats?.avg ?? 0)}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Prix moyen</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#ff6b6b' }}>{money(d.priceStats?.min ?? 0)}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Prix min</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#ffd93d' }}>{money(d.priceStats?.max ?? 0)}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Prix max</div>
              </div>
            </div>

            {/* Catégories par type */}
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>📊 Répartition par catégorie</h3>
            <div className="ad-table-wrap" style={{ marginBottom: 20 }}>
              <table className="ad-table">
                <thead><tr><th>Catégorie</th><th>Type</th><th>Nombre</th><th>Prix moyen</th></tr></thead>
                <tbody>
                  {(d.categoryBreakdown ?? []).map((c: any, i: number) => (
                    <tr key={i}>
                      <td>{c.category}</td>
                      <td><span className={`ad-badge ${c.type === 'PRODUIT' ? 'ad-badge--active' : 'ad-badge--pending'}`}>{c.type}</span></td>
                      <td>{c.count}</td>
                      <td>{money(c.avgPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Articles récents (temps réel) */}
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>⚡ Articles ajoutés récemment (24h)</h3>
            <div className="ad-table-wrap" style={{ marginBottom: 24 }}>
              <table className="ad-table">
                <thead><tr><th>Article</th><th>Catégorie</th><th>Ville</th><th>Prix</th><th>Vendeur</th><th>Heure</th></tr></thead>
                <tbody>
                  {(d.recentListings ?? []).map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</td>
                      <td>{l.category}</td>
                      <td>{l.city ?? '—'}</td>
                      <td>{money(l.priceUsdCents)}</td>
                      <td>{l.sellerName}</td>
                      <td style={{ fontSize: 11 }}>{new Date(l.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                  {(d.recentListings ?? []).length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ad-text-3)' }}>Aucun article ajouté dans les dernières 24h</td></tr>}
                </tbody>
              </table>
            </div>

            {/* ═══ Sources & Enrichissement ═══ */}
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>🔗 Sources de données & Enrichissement</h3>
            <div className="glass-card" style={{ padding: 16, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ad-text-1)', marginBottom: 10 }}>➕ Ajouter une source</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <select value={iaMarchandeSrcForm.type} onChange={e => setIaMarchandeSrcForm(f => ({ ...f, type: e.target.value as 'URL' | 'FILE' }))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}>
                  <option value="URL">🔗 Lien URL</option>
                  <option value="FILE">📄 Fichier</option>
                </select>
                <input placeholder="Nom" value={iaMarchandeSrcForm.name} onChange={e => setIaMarchandeSrcForm(f => ({ ...f, name: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)', flex: 1, minWidth: 120 }} />
                {iaMarchandeSrcForm.type === 'URL' ? (
                  <input placeholder="https://..." value={iaMarchandeSrcForm.url} onChange={e => setIaMarchandeSrcForm(f => ({ ...f, url: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)', flex: 1, minWidth: 180 }} />
                ) : (
                  <select value={iaMarchandeSrcForm.fileType} onChange={e => setIaMarchandeSrcForm(f => ({ ...f, fileType: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}>
                    <option value="">Type</option>
                    <option value="XML">XML</option>
                    <option value="PDF">PDF</option>
                    <option value="DOCX">Word</option>
                    <option value="CSV">CSV</option>
                  </select>
                )}
                <input placeholder="Notes" value={iaMarchandeSrcForm.notes} onChange={e => setIaMarchandeSrcForm(f => ({ ...f, notes: e.target.value }))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)', minWidth: 100 }} />
                <button disabled={!iaMarchandeSrcForm.name || (iaMarchandeSrcForm.type === 'URL' && !iaMarchandeSrcForm.url)} onClick={async () => {
                  setIaMarchandeSrcMsg(null);
                  try {
                    await admin.iaAddSource({ domain: 'marchande', ...iaMarchandeSrcForm });
                    setIaMarchandeSrcMsg('✅ Source ajoutée');
                    setIaMarchandeSrcForm({ type: 'URL', name: '', url: '', fileType: '', notes: '' });
                    admin.iaSources('marchande').then(r => setIaMarchandeSources(r.sources)).catch(() => {});
                  } catch { setIaMarchandeSrcMsg('❌ Erreur'); }
                }} className="ad-btn ad-btn--accent" style={{ fontSize: 12, padding: '6px 14px', opacity: (!iaMarchandeSrcForm.name || (iaMarchandeSrcForm.type === 'URL' && !iaMarchandeSrcForm.url)) ? 0.4 : 1 }}>
                  Ajouter
                </button>
              </div>
              {iaMarchandeSrcMsg && <p style={{ fontSize: 12, color: iaMarchandeSrcMsg.startsWith('✅') ? 'var(--ad-green)' : 'var(--ad-red)', marginTop: 6 }}>{iaMarchandeSrcMsg}</p>}
            </div>
            {iaMarchandeSources.length > 0 && (
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>Type</th><th>Nom</th><th>URL / Fichier</th><th>Notes</th><th>Ajouté le</th><th>Action</th></tr></thead>
                  <tbody>
                    {iaMarchandeSources.map(s => (
                      <tr key={s.id}>
                        <td><span className={`ad-badge ${s.type === 'URL' ? 'ad-badge--active' : 'ad-badge--pending'}`}>{s.type === 'URL' ? '🔗 URL' : `📄 ${s.fileType || 'Fichier'}`}</span></td>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{s.notes || '—'}</td>
                        <td style={{ fontSize: 11 }}>{new Date(s.addedAt).toLocaleDateString('fr-FR')}</td>
                        <td>
                          <button onClick={async () => { await admin.iaDeleteSource(s.id); admin.iaSources('marchande').then(r => setIaMarchandeSources(r.sources)).catch(() => {}); }} style={{ background: 'none', border: '1px solid var(--ad-red)', color: 'var(--ad-red)', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {iaMarchandeSources.length === 0 && (
              <p style={{ color: 'var(--ad-text-3)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>Aucune source externe. Ajoutez des liens URL, fichiers XML, PDF ou Word pour enrichir l&apos;IA Marchande.</p>
            )}
          </>
        )}
      </div>
    );
  };

  const renderIaCommande = () => {
    const d = iaData as any;
    return (
      <div className="ad-content-block">
        <h2 className="ad-content-title">🤖 IA de Commande</h2>
        <p className="ad-content-subtitle" style={{ color: 'var(--ad-text-3)', marginBottom: 16 }}>Suivi des boutiques en automatique, ventes IA et personnes gérées. Activez ou désactivez l&apos;auto-shop par utilisateur.</p>
        {iaLoading ? <p className="ad-content-subtitle">Chargement…</p> : !d ? <p className="ad-content-subtitle">Aucune donnée</p> : (
          <>
            {/* Stats */}
            <div className="ad-stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="ad-stat-card glass-card" style={{ padding: 16, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#6f58ff' }}>{d.stats?.autoActions7d ?? 0}</div>
                <div style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Actions auto (7j)</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 16, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#4ecdc4' }}>{d.stats?.autoActions30d ?? 0}</div>
                <div style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Actions auto (30j)</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 16, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#ffd93d' }}>{d.stats?.autoValidations ?? 0}</div>
                <div style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Validations auto</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 16, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: d.agentStatus?.enabled ? '#4ecdc4' : '#ff6b6b' }}>{d.agentStatus?.enabled ? 'ACTIF' : 'INACTIF'}</div>
                <div style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>Statut agent</div>
              </div>
            </div>

            {/* Utilisateurs gérés avec toggle */}
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>👥 Personnes / Boutiques gérées — Auto-Shop</h3>
            <div className="ad-table-wrap" style={{ marginBottom: 20 }}>
              <table className="ad-table">
                <thead><tr><th>Nom</th><th>Boutique</th><th>Statut Auto-Shop</th><th>Action</th></tr></thead>
                <tbody>
                  {(d.managedUsers ?? []).map((u: any) => {
                    const isEnabled = u.autoShopEnabled !== false;
                    const toggling = iaCommandeToggling === u.id;
                    return (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.business ?? '—'}</td>
                        <td>
                          <span className={`ad-badge ${isEnabled ? 'ad-badge--active' : 'ad-badge--danger'}`}>
                            {isEnabled ? '✅ Activé' : '🚫 Désactivé'}
                          </span>
                        </td>
                        <td>
                          <button disabled={toggling} onClick={async () => {
                            const reason = isEnabled ? 'Désactivé par l\'admin' : 'Réactivé par l\'admin';
                            setIaCommandeToggling(u.id);
                            try {
                              await admin.iaCommandeToggleUser({ userId: u.id, enabled: !isEnabled, reason });
                              await loadIaData('commande');
                            } catch { /* ignore */ }
                            setIaCommandeToggling(null);
                          }} className={`ad-btn ${isEnabled ? 'ad-btn--danger' : 'ad-btn--accent'}`} style={{ fontSize: 11, padding: '4px 12px' }}>
                            {toggling ? '⏳' : isEnabled ? '🚫 Désactiver' : '✅ Réactiver'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {(d.managedUsers ?? []).length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ad-text-3)' }}>Aucune personne gérée en automatique</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Journal d'actions récentes */}
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>📋 Journal d&apos;actions récentes</h3>
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead><tr><th>Action</th><th>Décision</th><th>Statut</th><th>Date</th></tr></thead>
                <tbody>
                  {(d.recentLogs ?? []).map((l: any) => (
                    <tr key={l.id}>
                      <td><span className="ad-badge">{l.actionType}</span></td>
                      <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.decision}</td>
                      <td><span className={`ad-badge ${l.success ? 'ad-badge--active' : 'ad-badge--danger'}`}>{l.success ? '✓' : '✗'}</span></td>
                      <td style={{ fontSize: 11 }}>{fmtDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderIaAds = () => {
    const d = iaData as any;
    const AD_PAGES = ['home', 'explorer', 'sokin', 'user-dashboard', 'admin-dashboard', 'listing-detail'];
    return (
      <div className="ad-content-block">
        <h2 className="ad-content-title">📣 IA ADS</h2>
        <p className="ad-content-subtitle" style={{ color: 'var(--ad-text-3)', marginBottom: 16 }}>
          Gestion intelligente des publicités Kin-Sell. Visualisez les pubs générées par l&apos;IA et créez manuellement vos propres publicités.
        </p>
        {iaLoading ? <p className="ad-content-subtitle">Chargement des données publicitaires…</p> : !d ? <p className="ad-content-subtitle">Aucune donnée</p> : (
          <>
            {/* Stats globales */}
            <div className="ad-stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#6f58ff' }}>{d.stats?.activeAds ?? 0}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Pubs actives</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#4ecdc4' }}>{d.stats?.activeBoosts ?? 0}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Boosts actifs</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#ffd93d' }}>{d.stats?.impressions?.last24h ?? 0}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Impressions (24h)</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#ff6b6b' }}>{d.stats?.clicks?.last24h ?? 0}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Clics (24h)</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#6f58ff' }}>{d.stats?.ctr24h ?? '0.00'}%</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>CTR (24h)</div>
              </div>
            </div>

            {/* ═══ Créer une publicité manuelle ═══ */}
            <div style={{ marginBottom: 20 }}>
              <button onClick={() => setIaAdsFormOpen(!iaAdsFormOpen)} className="ad-btn ad-btn--accent" style={{ fontSize: 13, padding: '8px 20px', marginBottom: iaAdsFormOpen ? 12 : 0 }}>
                {iaAdsFormOpen ? '✕ Fermer' : '➕ Créer une publicité'}
              </button>
              {iaAdsFormOpen && (
                <div className="glass-card" style={{ padding: 16, borderRadius: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ad-text-1)', marginBottom: 12 }}>📝 Nouvelle publicité Kin-Sell</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <input placeholder="Titre *" value={iaAdsForm.title} onChange={e => setIaAdsForm(f => ({ ...f, title: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }} />
                    <input placeholder="Lien URL (CTA)" value={iaAdsForm.linkUrl} onChange={e => setIaAdsForm(f => ({ ...f, linkUrl: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }} />
                  </div>
                  <textarea placeholder="Description" value={iaAdsForm.description} onChange={e => setIaAdsForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)', resize: 'vertical', marginBottom: 10 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <input placeholder="URL image" value={iaAdsForm.imageUrl} onChange={e => setIaAdsForm(f => ({ ...f, imageUrl: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }} />
                    <input placeholder="Texte CTA (ex: Découvrir)" value={iaAdsForm.ctaText} onChange={e => setIaAdsForm(f => ({ ...f, ctaText: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }} />
                    <input type="number" placeholder="Priorité (1-10)" value={iaAdsForm.priority} onChange={e => setIaAdsForm(f => ({ ...f, priority: Number(e.target.value) }))} min={1} max={10} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--ad-text-2)', marginBottom: 6 }}>📍 Pages cibles :</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {AD_PAGES.map(p => (
                        <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ad-text-1)', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, background: iaAdsForm.targetPages.includes(p) ? 'rgba(111,88,255,0.2)' : 'transparent', border: `1px solid ${iaAdsForm.targetPages.includes(p) ? '#6f58ff' : 'var(--ad-border)'}` }}>
                          <input type="checkbox" checked={iaAdsForm.targetPages.includes(p)} onChange={() => setIaAdsForm(f => ({ ...f, targetPages: f.targetPages.includes(p) ? f.targetPages.filter(x => x !== p) : [...f.targetPages, p] }))} style={{ accentColor: '#6f58ff' }} />
                          {p}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button disabled={!iaAdsForm.title} onClick={async () => {
                      setIaAdsMsg(null);
                      try {
                        await admin.iaAdsCreate(iaAdsForm);
                        setIaAdsMsg('✅ Publicité créée avec succès');
                        setIaAdsForm({ title: '', description: '', imageUrl: '', linkUrl: '', ctaText: '', targetPages: [], priority: 5 });
                        setIaAdsFormOpen(false);
                        await loadIaData('ads');
                      } catch { setIaAdsMsg('❌ Erreur lors de la création'); }
                    }} className="ad-btn ad-btn--accent" style={{ fontSize: 12, padding: '8px 18px', opacity: !iaAdsForm.title ? 0.4 : 1 }}>
                      🚀 Publier la publicité
                    </button>
                    {iaAdsMsg && <span style={{ fontSize: 12, color: iaAdsMsg.startsWith('✅') ? 'var(--ad-green)' : 'var(--ad-red)' }}>{iaAdsMsg}</span>}
                  </div>
                  {/* Aperçu */}
                  {iaAdsForm.title && (
                    <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: 'rgba(111,88,255,0.08)', border: '1px solid rgba(111,88,255,0.2)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ad-text-3)', marginBottom: 6 }}>👁 Aperçu</div>
                      {iaAdsForm.imageUrl && <img src={iaAdsForm.imageUrl} alt="" style={{ maxWidth: 300, maxHeight: 120, borderRadius: 8, marginBottom: 8, objectFit: 'cover' }} />}
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ad-text-1)' }}>{iaAdsForm.title}</div>
                      {iaAdsForm.description && <div style={{ fontSize: 12, color: 'var(--ad-text-2)', marginTop: 4 }}>{iaAdsForm.description}</div>}
                      {iaAdsForm.ctaText && <span style={{ display: 'inline-block', marginTop: 6, padding: '4px 14px', borderRadius: 6, background: '#6f58ff', color: '#fff', fontSize: 12, fontWeight: 600 }}>{iaAdsForm.ctaText}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Emplacements publicitaires */}
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>📍 Emplacements publicitaires ({(d.placements ?? []).length})</h3>
            <div className="ad-table-wrap" style={{ marginBottom: 20 }}>
              <table className="ad-table">
                <thead><tr><th>Emplacement</th><th>Page</th><th>Type</th><th>Scope</th><th>Impr./jour est.</th><th>Contenu accepté</th></tr></thead>
                <tbody>
                  {(d.placements ?? []).map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ fontSize: 12 }}>{p.description}</td>
                      <td><span className="ad-badge">{p.page}</span></td>
                      <td>{p.type}</td>
                      <td><span className={`ad-badge ${p.scope === 'PUBLIC' ? 'ad-badge--active' : 'ad-badge--pending'}`}>{p.scope}</span></td>
                      <td style={{ textAlign: 'center' }}>{p.avgImpressionsPerDay}</td>
                      <td style={{ fontSize: 10 }}>{p.supportedContent.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top pubs */}
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>🏆 Top publicités actives</h3>
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead><tr><th>Titre</th><th>Page</th><th>Impressions</th><th>Clics</th><th>CTR</th></tr></thead>
                <tbody>
                  {(d.topAds ?? []).map((a: any) => (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td><span className="ad-badge">{a.page}</span></td>
                      <td>{a.impressions}</td>
                      <td>{a.clicks}</td>
                      <td>{a.ctr}%</td>
                    </tr>
                  ))}
                  {(d.topAds ?? []).length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ad-text-3)' }}>Aucune publicité active</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderIaMessage = () => {
    const d = iaData as any;
    return (
      <div className="ad-content-block">
        <h2 className="ad-content-title">📨 IA Message</h2>
        <p className="ad-content-subtitle" style={{ color: 'var(--ad-text-3)', marginBottom: 16 }}>Messages promotionnels envoyés par l&apos;IA Messenger — emails via ADS@Kin-sell.com et notifications push. Envoyez manuellement des promos ciblées.</p>
        {iaLoading ? <p className="ad-content-subtitle">Chargement…</p> : !d ? <p className="ad-content-subtitle">Aucune donnée</p> : (
          <>
            {/* Stats campagne */}
            <div className="ad-stats-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#6f58ff' }}>{d.totalSent ?? 0}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Messages envoyés (30j)</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#4ecdc4' }}>{d.totalDelivered ?? 0}</div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Délivrés</div>
              </div>
              <div className="ad-stat-card glass-card" style={{ padding: 14, borderRadius: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: d.totalSent ? '#ffd93d' : 'var(--ad-text-3)' }}>
                  {d.totalSent ? ((d.totalDelivered / d.totalSent) * 100).toFixed(0) : 0}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Taux de livraison</div>
              </div>
            </div>

            {/* Par canal */}
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>📊 Par canal</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {(d.byChannel ?? []).map((c: any) => (
                <div key={c.channel} className="glass-card" style={{ padding: '10px 18px', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{c.count}</div>
                  <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{c.channel === 'EMAIL' ? '📧 Email' : c.channel === 'PUSH' ? '🔔 Push' : '💬 Interne'}</div>
                </div>
              ))}
            </div>

            {/* Par raison */}
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>🎯 Par raison d&apos;envoi</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {(d.byReason ?? []).map((r: any) => (
                <div key={r.reason} className="glass-card" style={{ padding: '10px 18px', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{r.count}</div>
                  <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{r.reason.replace(/_/g, ' ')}</div>
                </div>
              ))}
              {(d.byReason ?? []).length === 0 && <p style={{ color: 'var(--ad-text-3)', fontSize: 13 }}>Aucune campagne envoyée</p>}
            </div>

            {/* ═══ Envoyer un message promo ═══ */}
            <div style={{ marginBottom: 20 }}>
              <button onClick={() => { setIaMsgFormOpen(!iaMsgFormOpen); setIaMsgResult(null); }} className="ad-btn ad-btn--accent" style={{ fontSize: 13, padding: '8px 20px', marginBottom: iaMsgFormOpen ? 12 : 0 }}>
                {iaMsgFormOpen ? '✕ Fermer' : '📨 Envoyer un message promotionnel'}
              </button>
              {iaMsgFormOpen && (
                <div className="glass-card" style={{ padding: 16, borderRadius: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ad-text-1)', marginBottom: 12 }}>📝 Nouveau message promotionnel</div>

                  {/* Canal + Raison */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <select value={iaMsgForm.channel} onChange={e => setIaMsgForm(f => ({ ...f, channel: e.target.value as 'EMAIL' | 'PUSH' | 'INTERNAL' }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}>
                      <option value="EMAIL">📧 Email</option>
                      <option value="PUSH">🔔 Notification Push</option>
                      <option value="INTERNAL">💬 Message Interne</option>
                    </select>
                    <select value={iaMsgForm.reason} onChange={e => setIaMsgForm(f => ({ ...f, reason: e.target.value }))} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}>
                      <option value="PROMO_MANUAL">📣 Promo manuelle</option>
                      <option value="NEW_FEATURE">🆕 Nouvelle fonctionnalité</option>
                      <option value="ENGAGEMENT">💬 Engagement</option>
                      <option value="ANNOUNCEMENT">📢 Annonce</option>
                    </select>
                  </div>

                  {/* Sujet */}
                  <input placeholder="Sujet du message *" value={iaMsgForm.subject} onChange={e => setIaMsgForm(f => ({ ...f, subject: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)', marginBottom: 10 }} />

                  {/* Corps */}
                  <textarea placeholder="Contenu du message *" value={iaMsgForm.body} onChange={e => setIaMsgForm(f => ({ ...f, body: e.target.value }))} rows={4} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)', resize: 'vertical', marginBottom: 12 }} />

                  {/* Sélection des destinataires */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ad-text-1)', marginBottom: 8 }}>🎯 Destinataires ({iaMsgSelected.length} sélectionnés)</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input placeholder="Rechercher un utilisateur…" value={iaMsgTargetSearch} onChange={e => {
                      setIaMsgTargetSearch(e.target.value);
                      if (e.target.value.length >= 2) {
                        admin.iaMessageTargetUsers({ search: e.target.value, limit: 15 }).then(r => setIaMsgTargetUsers(r.users)).catch(() => {});
                      } else { setIaMsgTargetUsers([]); }
                    }} style={{ flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }} />
                    {iaMsgSelected.length > 0 && (
                      <button onClick={() => setIaMsgSelected([])} style={{ background: 'none', border: '1px solid var(--ad-red)', color: 'var(--ad-red)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>Tout désélectionner</button>
                    )}
                  </div>
                  {iaMsgTargetUsers.length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--ad-border)', borderRadius: 8, marginBottom: 10 }}>
                      {iaMsgTargetUsers.map(u => {
                        const sel = isMsgSelected(u.id);
                        return (
                          <div key={u.id} onClick={() => setIaMsgSelected(prev => sel ? prev.filter(x => x !== u.id) : [...prev, u.id])} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', background: sel ? 'rgba(111,88,255,0.12)' : 'transparent', borderBottom: '1px solid var(--ad-border)' }}>
                            <input type="checkbox" checked={sel} readOnly style={{ accentColor: '#6f58ff' }} />
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ad-text-1)' }}>{u.displayName}</div>
                              <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{u.email} · {u.role}{u.city ? ` · ${u.city}` : ''}{u.country ? ` (${u.country})` : ''}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button disabled={isMsgSendDisabled()} onClick={async () => {
                      setIaMsgSending(true);
                      setIaMsgResult(null);
                      try {
                        await admin.iaMessageSend({ recipientIds: iaMsgSelected, channel: iaMsgForm.channel, subject: iaMsgForm.subject, body: iaMsgForm.body, reason: iaMsgForm.reason });
                        setIaMsgResult(`✅ Message envoyé à ${iaMsgSelected.length} destinataire(s)`);
                        setIaMsgForm({ channel: 'EMAIL', subject: '', body: '', reason: 'PROMO_MANUAL' });
                        setIaMsgSelected([]);
                        setIaMsgTargetUsers([]);
                        setIaMsgTargetSearch('');
                        await loadIaData('messages');
                      } catch { setIaMsgResult('❌ Erreur lors de l\'envoi'); }
                      setIaMsgSending(false);
                    }} className="ad-btn ad-btn--accent" style={{ fontSize: 12, padding: '8px 18px', opacity: isMsgSendDisabled() ? 0.4 : 1 }}>
                      {iaMsgSending ? '⏳ Envoi…' : '🚀 Envoyer'}
                    </button>
                    {iaMsgResult && <span style={{ fontSize: 12, color: iaMsgResult.startsWith('✅') ? 'var(--ad-green)' : 'var(--ad-red)' }}>{iaMsgResult}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* Messages récents */}
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>📋 Messages récents</h3>
            
            {/* Filtres & Tri */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ad-text-3)', display: 'block', marginBottom: 4 }}>Canal</label>
                <select value={iaMsgFilterChannel} onChange={e => setIaMsgFilterChannel(e.target.value as any)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}>
                  <option value="all">📌 Tous les canaux</option>
                  <option value="EMAIL">📧 Email</option>
                  <option value="PUSH">🔔 Push</option>
                  <option value="INTERNAL">💬 Interne</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ad-text-3)', display: 'block', marginBottom: 4 }}>Raison d&apos;envoi</label>
                <select value={iaMsgFilterReason} onChange={e => setIaMsgFilterReason(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}>
                  <option value="all">🎯 Toutes les raisons</option>
                  {(() => {
                    const reasons = new Set<string>();
                    (d.recentMessages ?? []).forEach((m: any) => {
                      if (typeof m.reason === 'string') reasons.add(m.reason);
                    });
                    return Array.from(reasons).map((r: string) => (
                      <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                    ));
                  })()}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ad-text-3)', display: 'block', marginBottom: 4 }}>Statut</label>
                <select value={iaMsgFilterStatus} onChange={e => setIaMsgFilterStatus(e.target.value as any)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}>
                  <option value="all">✓ Tous les statuts</option>
                  <option value="delivered">✓ Délivrés</option>
                  <option value="failed">✗ Échoués</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--ad-text-3)', display: 'block', marginBottom: 4 }}>Tri</label>
                <select value={iaMsgSortBy} onChange={e => setIaMsgSortBy(e.target.value as any)} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--ad-border)', fontSize: 12, color: 'var(--ad-text-1)', background: 'var(--ad-surface)' }}>
                  <option value="date-desc">📅 Plus récent en premier</option>
                  <option value="date-asc">📅 Plus ancien en premier</option>
                  <option value="channel">📊 Par canal</option>
                  <option value="reason">🎯 Par raison</option>
                </select>
              </div>
            </div>

            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead><tr><th>Canal</th><th>Destinataire</th><th>Sujet</th><th>Raison</th><th>Code Promo</th><th>Statut</th><th>Date</th></tr></thead>
                <tbody>
                  {(() => {
                    let filtered = (d.recentMessages ?? []) as any[];
                    
                    // Apply filters
                    if (iaMsgFilterChannel !== 'all') {
                      filtered = filtered.filter(m => m.channel === iaMsgFilterChannel);
                    }
                    if (iaMsgFilterReason !== 'all') {
                      filtered = filtered.filter(m => m.reason === iaMsgFilterReason);
                    }
                    if (iaMsgFilterStatus !== 'all') {
                      filtered = filtered.filter(m => m.delivered === (iaMsgFilterStatus === 'delivered'));
                    }
                    
                    // Apply sorting
                    if (iaMsgSortBy === 'date-asc') {
                      filtered = [...filtered].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
                    } else if (iaMsgSortBy === 'channel') {
                      filtered = [...filtered].sort((a, b) => a.channel.localeCompare(b.channel));
                    } else if (iaMsgSortBy === 'reason') {
                      filtered = [...filtered].sort((a, b) => a.reason.localeCompare(b.reason));
                    } else {
                      filtered = [...filtered].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
                    }
                    
                    return filtered.map((m: any) => (
                      <tr key={m.id}>
                        <td><span className={`ad-badge ${m.channel === 'EMAIL' ? 'ad-badge--pending' : m.channel === 'PUSH' ? 'ad-badge--active' : 'ad-badge--info'}`}>{m.channel}</span></td>
                        <td><div style={{ fontSize: 12 }}>{m.recipientName}</div><div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{m.recipientEmail}</div></td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</td>
                        <td style={{ fontSize: 11 }}>{m.reason.replace(/_/g, ' ')}</td>
                        <td><code style={{ fontSize: 11, background: 'rgba(111,88,255,0.1)', padding: '2px 6px', borderRadius: 4, color: '#6f58ff' }}>{m.promoCode ? m.promoCode : '—'}</code></td>
                        <td><span className={`ad-badge ${m.delivered ? 'ad-badge--active' : 'ad-badge--danger'}`}>{m.delivered ? '✓ Délivré' : '✗ Échoué'}</span></td>
                        <td style={{ fontSize: 11 }}>{new Date(m.sentAt).toLocaleDateString('fr-FR')} {new Date(m.sentAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ));
                  })()}
                  {(() => {
                    let filtered = (d.recentMessages ?? []) as any[];
                    if (iaMsgFilterChannel !== 'all') filtered = filtered.filter(m => m.channel === iaMsgFilterChannel);
                    if (iaMsgFilterReason !== 'all') filtered = filtered.filter(m => m.reason === iaMsgFilterReason);
                    if (iaMsgFilterStatus !== 'all') filtered = filtered.filter(m => m.delivered === (iaMsgFilterStatus === 'delivered'));
                    return filtered.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--ad-text-3)' }}>Aucun message ne correspond aux filtres</td></tr> : null;
                  })()}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard': return renderDashboard();
      case 'users': return renderUsers();
      case 'blog': return renderBlog();
      case 'transactions': return renderTransactions();
      case 'reports': return renderReports();
      case 'feed': return renderFeed();
      case 'donations': return renderDonations();
      case 'ads': return renderAds();
      case 'advertisements': return renderAdvertisements();
      case 'listings': return renderListings();
      case 'negotiation-rules': return renderNegotiationRules();
      case 'security': return renderSecurityDashboard();
      case 'antifraud': return renderAntiFraud();
      case 'security-ai': return renderSecurityAI();
      case 'ai-management': return renderAiManagement();
      case 'rankings': return renderRankings();
      case 'admins': return renderAdmins();
      case 'appeals': return renderAppeals();
      case 'currency': return renderCurrency();
      case 'audit': return renderAudit();
      case 'settings': return renderSettings();
      case 'app-version': return renderAppVersion();
      case 'messaging': return renderMessaging();
      case 'subscriptions': return renderSubscriptions();
      case 'verification': return renderVerification();
      case 'incentives': return renderIncentives();
      case 'ia-analytique': return renderIaAnalytique();
      case 'ia-marchande': return renderIaMarchande();
      case 'ia-commande': return renderIaCommande();
      case 'ia-ads': return renderIaAds();
      case 'ia-message': return renderIaMessage();
      default: return null;
    }
  };

  /* ══════════════════════════════════════
     MODALS
     ══════════════════════════════════════ */

  const renderModal = () => {
    if (!modal) return null;

    return (
      <div className="ad-modal-overlay" onClick={() => setModal(null)}>
        <div className="ad-modal" onClick={e => e.stopPropagation()}>
          {/* User Detail */}
          {modal === 'user-detail' && selectedUser && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Détails utilisateur</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div className="ad-table-avatar" style={{ width: 56, height: 56, fontSize: 18 }}>
                    {selectedUser.profile?.avatarUrl ? <img src={resolveMediaUrl(selectedUser.profile.avatarUrl)} alt="" /> : initials(selectedUser.profile?.displayName ?? '?')}
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedUser.profile?.displayName}</div>
                    <div style={{ fontSize: 12, color: 'var(--ad-text-3)' }}>@{selectedUser.profile?.username ?? '—'} · ID: {selectedUser.id.slice(0, 10)}</div>
                  </div>
                </div>
                <div className="ad-user-detail-grid">
                  <div className="ad-user-detail-item"><span className="ad-user-detail-label">Email</span><span className="ad-user-detail-value">{selectedUser.email ?? '—'}</span></div>
                  <div className="ad-user-detail-item"><span className="ad-user-detail-label">Téléphone</span><span className="ad-user-detail-value">{selectedUser.phone ?? '—'}</span></div>
                  <div className="ad-user-detail-item"><span className="ad-user-detail-label">Rôle</span><span className={roleBadgeClass(selectedUser.role)}>{selectedUser.role}</span></div>
                  <div className="ad-user-detail-item"><span className="ad-user-detail-label">Statut</span><span className={statusBadgeClass(selectedUser.accountStatus)}>{selectedUser.accountStatus === 'ACTIVE' ? 'Actif' : selectedUser.accountStatus === 'SUSPENDED' ? 'Suspendu' : selectedUser.accountStatus === 'PENDING_DELETION' ? 'Suppression en cours' : selectedUser.accountStatus}</span></div>
                  {selectedUser.accountStatus === 'PENDING_DELETION' && selectedUser.deletionRequestedAt && (
                    <div className="ad-user-detail-item"><span className="ad-user-detail-label">Suppression demandée le</span><span className="ad-user-detail-value">{fmtDate(selectedUser.deletionRequestedAt)}</span></div>
                  )}
                  <div className="ad-user-detail-item"><span className="ad-user-detail-label">Ville</span><span className="ad-user-detail-value">{selectedUser.profile?.city ?? '—'}</span></div>
                  <div className="ad-user-detail-item"><span className="ad-user-detail-label">Pays</span><span className="ad-user-detail-value">{selectedUser.profile?.country ?? '—'}</span></div>
                  <div className="ad-user-detail-item"><span className="ad-user-detail-label">Inscrit le</span><span className="ad-user-detail-value">{fmtDate(selectedUser.createdAt)}</span></div>
                  <div className="ad-user-detail-item"><span className="ad-user-detail-label">Vérification</span><span className="ad-user-detail-value">{selectedUser.profile?.verificationStatus}</span></div>
                </div>
                <div style={{ borderTop: '1px solid var(--ad-border)', paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center' }}>
                  <div><div style={{ fontSize: 20, fontWeight: 700 }}>{selectedUser.counts.buyerOrders}</div><div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Achats</div></div>
                  <div><div style={{ fontSize: 20, fontWeight: 700 }}>{selectedUser.counts.sellerOrders}</div><div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Ventes</div></div>
                  <div><div style={{ fontSize: 20, fontWeight: 700 }}>{selectedUser.counts.listings}</div><div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>Annonces</div></div>
                </div>
                {selectedUser.businesses.length > 0 && (
                  <div>
                    <div className="ad-label" style={{ marginBottom: 6 }}>Entreprises</div>
                    {selectedUser.businesses.map(b => (
                      <div key={b.id} className="ad-badge ad-badge--business" style={{ marginRight: 6 }}>{b.publicName}</div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Change Role */}
          {modal === 'user-role' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Changer le rôle</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field">
                  <label className="ad-label">Nouveau rôle</label>
                  <select className="ad-select" value={modalRole} onChange={e => setModalRole(e.target.value)}>
                    <option value="USER">Utilisateur</option>
                    <option value="BUSINESS">Entreprise</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Annuler</button>
                <button className="ad-btn ad-btn--primary" onClick={handleChangeRole} disabled={busy}>{busy ? '…' : 'Confirmer'}</button>
              </div>
            </>
          )}

          {/* Suspend */}
          {modal === 'user-suspend' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Suspendre le compte</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field">
                  <label className="ad-label">Durée de suspension</label>
                  <select className="ad-select" value={suspendDuration} onChange={e => setSuspendDuration(Number(e.target.value))}>
                    <option value={24}>24 heures</option>
                    <option value={168}>7 jours</option>
                    <option value={720}>30 jours</option>
                    <option value={8760}>1 an</option>
                  </select>
                </div>
                <div className="ad-field">
                  <label className="ad-label">Motif</label>
                  <textarea className="ad-textarea" value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Raison de la suspension…" />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Votre mot de passe (confirmation)</label>
                  <input className="ad-input" type="password" value={suspendPassword} onChange={e => setSuspendPassword(e.target.value)} placeholder="Mot de passe admin" />
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Annuler</button>
                <button className="ad-btn ad-btn--danger" onClick={handleSuspend} disabled={busy || !suspendReason || !suspendPassword}>{busy ? '…' : 'Suspendre'}</button>
              </div>
            </>
          )}

          {/* Send message */}
          {modal === 'user-message' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Envoyer un message</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field">
                  <label className="ad-label">Message court</label>
                  <textarea className="ad-textarea" value={messageText} onChange={e => setMessageText(e.target.value)} placeholder="Votre message…" />
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Annuler</button>
                <button className="ad-btn ad-btn--primary" disabled={!messageText.trim() || busy} onClick={handleSendAdminMessage}>{busy ? '…' : 'Envoyer'}</button>
              </div>
            </>
          )}

          {/* Feed moderation */}
          {modal === 'feed-moderate' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Modérer une publication So-Kin</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field">
                  <label className="ad-label">Action</label>
                  <select className="ad-select" value={feedModerateAction} onChange={e => setFeedModerateAction(e.target.value)}>
                    <option value="ACTIVE">Réactiver</option>
                    <option value="FLAGGED">Signaler</option>
                    <option value="HIDDEN">Masquer</option>
                    <option value="DELETED">Supprimer</option>
                  </select>
                </div>
                <div className="ad-field">
                  <label className="ad-label">Note de modération</label>
                  <textarea className="ad-textarea" value={feedModerateNote} onChange={e => setFeedModerateNote(e.target.value)} placeholder="Motif ou commentaire interne..." />
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Annuler</button>
                <button className="ad-btn ad-btn--primary" onClick={handleModerateFeed} disabled={busy}>{busy ? '…' : 'Valider'}</button>
              </div>
            </>
          )}

          {/* Create user */}
          {modal === 'user-create' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Créer un utilisateur</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field">
                  <label className="ad-label">Nom complet</label>
                  <input className="ad-input" value={createUserForm.displayName} onChange={e => setCreateUserForm(f => ({ ...f, displayName: e.target.value }))} />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Email</label>
                  <input className="ad-input" type="email" value={createUserForm.email} onChange={e => setCreateUserForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Mot de passe</label>
                  <input className="ad-input" type="password" value={createUserForm.password} onChange={e => setCreateUserForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Rôle</label>
                  <select className="ad-select" value={createUserForm.role} onChange={e => setCreateUserForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="USER">Utilisateur</option>
                    <option value="BUSINESS">Entreprise</option>
                  </select>
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Annuler</button>
                <button className="ad-btn ad-btn--primary" onClick={handleCreateUser} disabled={busy}>{busy ? '…' : 'Créer'}</button>
              </div>
            </>
          )}

          {/* Report Detail */}
          {modal === 'report-detail' && selectedReport && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Traiter le signalement</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-report-parties">
                  <div className="ad-report-party">
                    <span className="ad-report-party-label ad-report-party-label--reporter">Accusateur</span>
                    <div className="ad-table-avatar" style={{ width: 48, height: 48, fontSize: 16 }}>
                      {selectedReport.reporter.avatarUrl ? <img src={resolveMediaUrl(selectedReport.reporter.avatarUrl)} alt="" /> : initials(selectedReport.reporter.displayName)}
                    </div>
                    <div className="ad-report-party-name">{selectedReport.reporter.displayName}</div>
                    <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{selectedReport.reporter.email}</div>
                    <div className="ad-report-party-actions">
                      <button className="ad-btn ad-btn--sm" title="Contact local">💬</button>
                      {selectedReport.reporter.phone && <a className="ad-btn ad-btn--sm" href={`tel:${selectedReport.reporter.phone}`} title="Appeler">📞</a>}
                    </div>
                  </div>
                  <div className="ad-report-party">
                    <span className="ad-report-party-label ad-report-party-label--reported">Accusé</span>
                    <div className="ad-table-avatar" style={{ width: 48, height: 48, fontSize: 16 }}>
                      {selectedReport.reported.avatarUrl ? <img src={resolveMediaUrl(selectedReport.reported.avatarUrl)} alt="" /> : initials(selectedReport.reported.displayName)}
                    </div>
                    <div className="ad-report-party-name">{selectedReport.reported.displayName}</div>
                    <div style={{ fontSize: 11, color: 'var(--ad-text-3)' }}>{selectedReport.reported.email}</div>
                    <div className="ad-report-party-actions">
                      <button className="ad-btn ad-btn--sm" title="Contact local">💬</button>
                      {selectedReport.reported.phone && <a className="ad-btn ad-btn--sm" href={`tel:${selectedReport.reported.phone}`} title="Appeler">📞</a>}
                    </div>
                  </div>
                </div>
                <div style={{ padding: 16, background: 'rgba(18, 11, 43, 0.3)', borderRadius: 'var(--ad-radius-sm)', border: '1px solid var(--ad-border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--ad-text-3)', marginBottom: 4 }}>Raison: <strong style={{ color: 'var(--ad-text-1)' }}>{selectedReport.reason}</strong></div>
                  <div style={{ fontSize: 12, color: 'var(--ad-text-3)', marginBottom: 8 }}>Date: {fmtDate(selectedReport.createdAt)}</div>
                  {selectedReport.message && <div style={{ fontSize: 13, color: 'var(--ad-text-2)' }}>{selectedReport.message}</div>}
                </div>
                <div className="ad-field">
                  <label className="ad-label">Résolution / Conclusion de l'enquête</label>
                  <textarea className="ad-textarea" value={reportResolution} onChange={e => setReportResolution(e.target.value)} placeholder="Décrivez la résolution…" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ad-btn ad-btn--danger ad-btn--sm" onClick={() => openSuspend(selectedReport.reported.id)}>Suspendre l'accusé</button>
                  <button className="ad-btn ad-btn--danger ad-btn--sm" onClick={() => openSuspend(selectedReport.reporter.id)}>Suspendre l'accusateur</button>
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Fermer</button>
                <button className="ad-btn ad-btn--primary" onClick={handleResolveReport} disabled={busy || !reportResolution.trim()}>{busy ? '…' : 'Finaliser — Résolu'}</button>
              </div>
            </>
          )}

          {/* Blog Edit */}
          {modal === 'blog-edit' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">{editingBlogId ? 'Modifier l\'article' : 'Nouvel article'}</h2>
                <button className="ad-modal-close" onClick={() => { setModal(null); resetBlogForm(); }}>✕</button>
              </div>
              <div className="ad-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {/* Title */}
                <div className="ad-field">
                  <label className="ad-label">Titre *</label>
                  <input className="ad-input" value={blogForm.title} onChange={e => setBlogForm(f => ({ ...f, title: e.target.value }))} placeholder="Titre de l'article" />
                </div>

                {/* Excerpt */}
                <div className="ad-field">
                  <label className="ad-label">Extrait / Description courte</label>
                  <input className="ad-input" value={blogForm.excerpt} onChange={e => setBlogForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="Résumé court pour les cartes" />
                </div>

                {/* Content */}
                <div className="ad-field">
                  <label className="ad-label">Contenu *</label>
                  <textarea className="ad-textarea" style={{ minHeight: 200, fontFamily: 'inherit', lineHeight: 1.6 }} value={blogForm.content} onChange={e => setBlogForm(f => ({ ...f, content: e.target.value }))} placeholder="Écrivez votre article ici (supporte le formatage basique)" />
                </div>

                {/* Category + Language row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="ad-field">
                    <label className="ad-label">Catégorie</label>
                    <select className="ad-select" value={blogForm.category} onChange={e => setBlogForm(f => ({ ...f, category: e.target.value }))}>
                      <option value="general">Général</option>
                      <option value="actualites">Actualités</option>
                      <option value="conseils">Conseils</option>
                      <option value="technologie">Technologie</option>
                      <option value="business">Business</option>
                      <option value="tutoriel">Tutoriel</option>
                      <option value="annonce">Annonce</option>
                    </select>
                  </div>
                  <div className="ad-field">
                    <label className="ad-label">Langue</label>
                    <select className="ad-select" value={blogForm.language} onChange={e => setBlogForm(f => ({ ...f, language: e.target.value }))}>
                      <option value="fr">Français</option>
                      <option value="ln">Lingala</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>

                {/* Tags */}
                <div className="ad-field">
                  <label className="ad-label">Tags (séparés par des virgules)</label>
                  <input className="ad-input" value={blogForm.tags} onChange={e => setBlogForm(f => ({ ...f, tags: e.target.value }))} placeholder="kin-sell, e-commerce, kinshasa" />
                </div>

                {/* Cover Image */}
                <div className="ad-field">
                  <label className="ad-label">🖼️ Image de couverture</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input className="ad-input" style={{ flex: 1 }} value={blogForm.coverImage} onChange={e => setBlogForm(f => ({ ...f, coverImage: e.target.value }))} placeholder="URL de l'image ou upload →" />
                    <label className="ad-btn ad-btn--sm" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {blogUploadBusy ? '…' : '📤 Upload'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadBlogMedia(f, 'coverImage'); }} />
                    </label>
                  </div>
                  {blogForm.coverImage && (
                    <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                      <img src={resolveMediaUrl(blogForm.coverImage)} alt="" style={{ maxHeight: 120, borderRadius: 8, objectFit: 'cover' }} />
                      <button type="button" style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: '#fff', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }} onClick={() => setBlogForm(f => ({ ...f, coverImage: '' }))}>✕</button>
                    </div>
                  )}
                </div>

                {/* GIF */}
                <div className="ad-field">
                  <label className="ad-label">🎞️ GIF (optionnel)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input className="ad-input" style={{ flex: 1 }} value={blogForm.gifUrl} onChange={e => setBlogForm(f => ({ ...f, gifUrl: e.target.value }))} placeholder="URL du GIF ou upload →" />
                    <label className="ad-btn ad-btn--sm" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {blogUploadBusy ? '…' : '📤 Upload'}
                      <input type="file" accept="image/gif" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadBlogMedia(f, 'gifUrl'); }} />
                    </label>
                  </div>
                  {blogForm.gifUrl && (
                    <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                      <img src={resolveMediaUrl(blogForm.gifUrl)} alt="" style={{ maxHeight: 100, borderRadius: 8 }} />
                      <button type="button" style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: '#fff', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }} onClick={() => setBlogForm(f => ({ ...f, gifUrl: '' }))}>✕</button>
                    </div>
                  )}
                </div>

                {/* Video */}
                <div className="ad-field">
                  <label className="ad-label">🎬 Vidéo (optionnel)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input className="ad-input" style={{ flex: 1 }} value={blogForm.mediaUrl} onChange={e => setBlogForm(f => ({ ...f, mediaUrl: e.target.value, mediaType: 'video' }))} placeholder="URL de la vidéo ou upload →" />
                    <label className="ad-btn ad-btn--sm" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {blogUploadBusy ? '…' : '📤 Upload'}
                      <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadBlogMedia(f, 'mediaUrl'); }} />
                    </label>
                  </div>
                  {blogForm.mediaUrl && (
                    <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                      <video src={resolveMediaUrl(blogForm.mediaUrl)} style={{ maxHeight: 120, borderRadius: 8 }} controls />
                      <button type="button" style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: '#fff', width: 22, height: 22, cursor: 'pointer', fontSize: 12 }} onClick={() => setBlogForm(f => ({ ...f, mediaUrl: '', mediaType: '' }))}>✕</button>
                    </div>
                  )}
                </div>

                {/* SEO */}
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ad-text-2)', marginBottom: 8 }}>🔍 SEO Meta (optionnel)</summary>
                  <div className="ad-field">
                    <label className="ad-label">Meta Title</label>
                    <input className="ad-input" value={blogForm.metaTitle} onChange={e => setBlogForm(f => ({ ...f, metaTitle: e.target.value }))} placeholder="Titre SEO (si différent du titre)" />
                  </div>
                  <div className="ad-field">
                    <label className="ad-label">Meta Description</label>
                    <textarea className="ad-textarea" style={{ minHeight: 60 }} value={blogForm.metaDescription} onChange={e => setBlogForm(f => ({ ...f, metaDescription: e.target.value }))} placeholder="Description pour les moteurs de recherche" />
                  </div>
                </details>

                {/* Status */}
                <div className="ad-field" style={{ marginTop: 8 }}>
                  <label className="ad-label">Statut</label>
                  <select className="ad-select" value={blogForm.status} onChange={e => setBlogForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="DRAFT">📝 Brouillon</option>
                    <option value="PUBLISHED">🟢 Publié</option>
                    <option value="ARCHIVED">📦 Archivé</option>
                  </select>
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => { setModal(null); resetBlogForm(); }}>Annuler</button>
                <button className="ad-btn ad-btn--primary" onClick={handleCreateBlog} disabled={busy || !blogForm.title || !blogForm.content}>{busy ? '…' : (editingBlogId ? 'Enregistrer' : 'Créer l\'article')}</button>
              </div>
            </>
          )}

          {/* AI Detail Modal */}
          {modal === 'ai-detail' && aiSelectedAgent && (() => {
            const ag = aiSelectedAgent;
            const cfg = ag.config as Record<string, unknown> | null;
            const zones = (cfg?.zones as string[]) ?? [];
            const targets = (cfg?.targets as string[]) ?? [];
            const uiEntryPoints = (cfg?.uiEntryPoints as string[]) ?? [];
            const outputs = (cfg?.outputs as string[]) ?? [];
            const subFunctions = (cfg?.subFunctions as string[]) ?? [];
            const premiumOptions = (cfg?.premiumOptions as string[]) ?? [];
            const dataUsed = cfg?.dataUsed as { read?: string[]; generated?: string[]; suggested?: string[]; actionable?: string[] } | undefined;
            return (
              <>
                <div className="ad-modal-head">
                  <h2 className="ad-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 28 }}>{ag.icon}</span>
                    {ag.name}
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(111,88,255,0.1)', color: 'var(--color-accent, #6f58ff)' }}>v{ag.version}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: aiStatusColor(ag.status), marginLeft: 8 }}>{aiStatusLabel(ag.status)}</span>
                  </h2>
                  <button className="ad-modal-close" onClick={() => { setModal(null); setAiSelectedAgent(null); }}>✕</button>
                </div>
                <div className="ad-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                  {/* Meta header */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    <span className="ad-badge">{ag.domain}</span>
                    <span className="ad-badge" style={{ textTransform: 'capitalize' }}>{ag.type}</span>
                    <span className="ad-badge">{ag.level.replace('LEVEL_', 'Niveau ')}</span>
                    {!!cfg?.requiredPlan && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(255,152,0,0.12)', color: '#ff9800', fontWeight: 600 }}>💼 Forfait min : {String(cfg.requiredPlan)}</span>}
                    {!!cfg?.interventionType && <span className="ad-badge">{cfg.interventionType === 'visible' ? '👁 Visible' : cfg.interventionType === 'hidden' ? '🔒 Backend' : '🔄 Hybride'}</span>}
                  </div>
                  <p style={{ color: 'var(--ad-text-2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>{ag.description}</p>

                  {/* ═══ Stats cards ═══ */}
                  <div className="ad-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', marginBottom: 20 }}>
                    <div className="ad-stat-card"><div className="ad-stat-label">Total</div><div className="ad-stat-value">{ag.stats.totalUsage}</div></div>
                    <div className="ad-stat-card"><div className="ad-stat-label">Aujourd&apos;hui</div><div className="ad-stat-value">{ag.stats.todayUsage}</div></div>
                    <div className="ad-stat-card"><div className="ad-stat-label">7 jours</div><div className="ad-stat-value">{ag.stats.weekUsage}</div></div>
                    <div className="ad-stat-card"><div className="ad-stat-label">30 jours</div><div className="ad-stat-value">{ag.stats.monthUsage}</div></div>
                    <div className="ad-stat-card"><div className="ad-stat-label">✅ Succès</div><div className="ad-stat-value" style={{ color: '#4caf50' }}>{ag.stats.successRate}%</div></div>
                    <div className="ad-stat-card"><div className="ad-stat-label">❌ Erreurs</div><div className="ad-stat-value" style={{ color: '#e53935' }}>{ag.stats.errorRate}%</div></div>
                  </div>

                  {/* ═══ TABS ═══ */}
                  <div className="ad-tabs" style={{ marginBottom: 16 }}>
                    {(['mission', 'zones', 'users', 'data', 'performance', 'logs', 'plans'] as const).map(t => (
                      <button key={t} className={`ad-tab ${aiDetailTab === t ? 'ad-tab--active' : ''}`} onClick={() => {
                        setAiDetailTab(t);
                        if (t === 'logs') handleLoadAiLogs(ag.id);
                      }}>
                        {t === 'mission' && '🎯 Mission'}
                        {t === 'zones' && '📍 Zones'}
                        {t === 'users' && '👥 Comptes'}
                        {t === 'data' && '📊 Données'}
                        {t === 'performance' && '⚡ Performance'}
                        {t === 'logs' && '📋 Logs'}
                        {t === 'plans' && '💼 Forfaits'}
                      </button>
                    ))}
                  </div>

                  {/* TAB: Mission */}
                  {aiDetailTab === 'mission' && (
                    <div>
                      {!!cfg?.mission && (
                        <div className="ad-panel" style={{ marginBottom: 12, padding: 14 }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ad-text-1)' }}>🎯 Mission principale</h4>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--ad-text-2)', lineHeight: 1.6 }}>{String(cfg.mission)}</p>
                        </div>
                      )}
                      {!!cfg?.doesNot && (
                        <div className="ad-panel" style={{ marginBottom: 12, padding: 14, borderLeft: '3px solid #ff9800' }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#ff9800' }}>🚫 Ce que cette IA ne fait PAS</h4>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--ad-text-2)', lineHeight: 1.6 }}>{String(cfg.doesNot)}</p>
                        </div>
                      )}
                      {ag.action && (
                        <div className="ad-panel" style={{ padding: 14 }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ad-text-1)' }}>⚙️ Action principale</h4>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--ad-text-2)' }}>{ag.action}</p>
                        </div>
                      )}
                      {subFunctions.length > 0 && (
                        <div className="ad-panel" style={{ marginTop: 12, padding: 14 }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ad-text-1)' }}>🔧 Sous-fonctions</h4>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {subFunctions.map(sf => <span key={sf} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: 'rgba(111,88,255,0.08)', color: 'var(--ad-text-2)' }}>{sf}</span>)}
                          </div>
                        </div>
                      )}
                      {outputs.length > 0 && (
                        <div className="ad-panel" style={{ marginTop: 12, padding: 14 }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ad-text-1)' }}>📤 Résultats / Impact</h4>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {outputs.map(o => <span key={o} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: 'rgba(76,175,80,0.08)', color: '#4caf50' }}>{o}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB: Zones */}
                  {aiDetailTab === 'zones' && (
                    <div>
                      <div className="ad-panel" style={{ padding: 14, marginBottom: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>📍 Pages / Modules</h4>
                        {zones.length > 0 ? (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {zones.map(z => <span key={z} className="ad-badge" style={{ textTransform: 'capitalize' }}>{z.replace(/-/g, ' ')}</span>)}
                          </div>
                        ) : <p style={{ color: 'var(--ad-text-3)', fontSize: 13 }}>Aucune zone définie</p>}
                      </div>
                      <div className="ad-panel" style={{ padding: 14, marginBottom: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>🖱️ Points d&apos;entrée UI</h4>
                        {uiEntryPoints.length > 0 ? (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {uiEntryPoints.map(u => <span key={u} className="ad-badge" style={{ textTransform: 'capitalize' }}>{u.replace(/-/g, ' ')}</span>)}
                          </div>
                        ) : <p style={{ color: 'var(--ad-text-3)', fontSize: 13 }}>Aucun point d&apos;entrée défini</p>}
                      </div>
                      <div className="ad-panel" style={{ padding: 14 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>🔮 Type d&apos;intervention</h4>
                        <span className="ad-badge" style={{ fontSize: 13 }}>
                          {cfg?.interventionType === 'visible' ? '👁 Visible (interface utilisateur)' : cfg?.interventionType === 'hidden' ? '🔒 Cachée (backend uniquement)' : '🔄 Hybride (visible + backend)'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* TAB: Comptes / Users */}
                  {aiDetailTab === 'users' && (
                    <div>
                      <div className="ad-panel" style={{ padding: 14, marginBottom: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>🎯 Cibles / Rôles</h4>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {targets.map(t => <span key={t} className="ad-badge">{t === 'USER' ? '👤 Utilisateurs' : t === 'BUSINESS' ? '🏢 Entreprises' : t === 'ADMIN' ? '🔑 Admins' : t}</span>)}
                        </div>
                      </div>
                      {ag.topUsers.length > 0 && (
                        <div className="ad-panel" style={{ padding: 14 }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>🏆 Top utilisateurs</h4>
                          <div className="ad-table-wrap">
                            <table className="ad-table">
                              <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Utilisations</th></tr></thead>
                              <tbody>
                                {ag.topUsers.map(u => (
                                  <tr key={u.userId}>
                                    <td style={{ fontWeight: 600 }}>{u.displayName}</td>
                                    <td><span className="ad-badge">{u.role}</span></td>
                                    <td><span className="ad-badge ad-badge--primary">{u.usageCount}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {ag.topUsers.length === 0 && (
                        <div className="ad-panel" style={{ padding: 14 }}>
                          <p style={{ color: 'var(--ad-text-3)', fontSize: 13, textAlign: 'center' }}>Aucun utilisateur enregistré pour cette IA.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB: Données utilisées */}
                  {aiDetailTab === 'data' && (
                    <div>
                      {dataUsed && (
                        <>
                          {dataUsed.read && dataUsed.read.length > 0 && (
                            <div className="ad-panel" style={{ padding: 14, marginBottom: 12, borderLeft: '3px solid #2196f3' }}>
                              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#2196f3' }}>📖 Données lues</h4>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {dataUsed.read.map(d => <span key={d} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: 'rgba(33,150,243,0.08)', color: '#2196f3' }}>{d}</span>)}
                              </div>
                            </div>
                          )}
                          {dataUsed.generated && dataUsed.generated.length > 0 && (
                            <div className="ad-panel" style={{ padding: 14, marginBottom: 12, borderLeft: '3px solid #4caf50' }}>
                              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#4caf50' }}>🔄 Données générées</h4>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {dataUsed.generated.map(d => <span key={d} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: 'rgba(76,175,80,0.08)', color: '#4caf50' }}>{d}</span>)}
                              </div>
                            </div>
                          )}
                          {dataUsed.suggested && dataUsed.suggested.length > 0 && (
                            <div className="ad-panel" style={{ padding: 14, marginBottom: 12, borderLeft: '3px solid #ff9800' }}>
                              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#ff9800' }}>💡 Données suggérées</h4>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {dataUsed.suggested.map(d => <span key={d} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: 'rgba(255,152,0,0.08)', color: '#ff9800' }}>{d}</span>)}
                              </div>
                            </div>
                          )}
                          {dataUsed.actionable && dataUsed.actionable.length > 0 && (
                            <div className="ad-panel" style={{ padding: 14, borderLeft: '3px solid #e53935' }}>
                              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#e53935' }}>⚡ Actions déclenchables</h4>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {dataUsed.actionable.map(d => <span key={d} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: 'rgba(229,57,53,0.08)', color: '#e53935' }}>{d}</span>)}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {!dataUsed && (
                        <div className="ad-panel" style={{ padding: 14 }}>
                          <p style={{ color: 'var(--ad-text-3)', fontSize: 13 }}>Aucune donnée configurée pour cette IA.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB: Performance */}
                  {aiDetailTab === 'performance' && (
                    <div>
                      <div className="ad-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', marginBottom: 16 }}>
                        <div className="ad-stat-card"><div className="ad-stat-label">Utilisations totales</div><div className="ad-stat-value">{ag.stats.totalUsage}</div></div>
                        <div className="ad-stat-card"><div className="ad-stat-label">Aujourd&apos;hui</div><div className="ad-stat-value">{ag.stats.todayUsage}</div></div>
                        <div className="ad-stat-card"><div className="ad-stat-label">Cette semaine</div><div className="ad-stat-value">{ag.stats.weekUsage}</div></div>
                        <div className="ad-stat-card"><div className="ad-stat-label">Ce mois</div><div className="ad-stat-value">{ag.stats.monthUsage}</div></div>
                      </div>
                      <div className="ad-panel" style={{ padding: 14, marginBottom: 12 }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>📊 Taux de succès / erreur</h4>
                        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span>Succès</span><span style={{ fontWeight: 700, color: '#4caf50' }}>{ag.stats.successRate}%</span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }}>
                              <div style={{ height: '100%', borderRadius: 4, background: '#4caf50', width: `${ag.stats.successRate}%`, transition: 'width 0.5s' }} />
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span>Erreurs</span><span style={{ fontWeight: 700, color: '#e53935' }}>{ag.stats.errorRate}%</span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)' }}>
                              <div style={{ height: '100%', borderRadius: 4, background: '#e53935', width: `${ag.stats.errorRate}%`, transition: 'width 0.5s' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                      {ag.lastError && (
                        <div className="ad-panel" style={{ padding: 14, borderLeft: '3px solid #e53935' }}>
                          <h4 style={{ margin: '0 0 6px', fontSize: 14, color: '#e53935' }}>⚠ Dernière erreur</h4>
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--ad-text-2)' }}>{ag.lastError}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB: Logs */}
                  {aiDetailTab === 'logs' && (
                    <div>
                      {aiLogs.length === 0 ? (
                        <div className="ad-panel" style={{ padding: 14 }}>
                          <p style={{ color: 'var(--ad-text-3)', fontSize: 13, textAlign: 'center' }}>Aucun log enregistré pour cette IA.</p>
                        </div>
                      ) : (
                        <>
                          <div className="ad-table-wrap">
                            <table className="ad-table">
                              <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Décision</th><th>Statut</th></tr></thead>
                              <tbody>
                                {aiLogs.map(l => (
                                  <tr key={l.id}>
                                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(l.createdAt)}</td>
                                    <td style={{ fontWeight: 600, fontSize: 12 }}>{l.targetUserName ?? '—'}</td>
                                    <td><span className="ad-badge" style={{ fontSize: 10 }}>{l.actionType}</span></td>
                                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.decision}</td>
                                    <td>{l.success ? <span style={{ color: '#4caf50' }}>✅</span> : <span style={{ color: '#e53935' }}>❌</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {aiLogsTotal > 20 && (
                            <div className="ad-pagination" style={{ marginTop: 8 }}>
                              <button className="ad-btn ad-btn--sm" disabled={aiLogsPage <= 1} onClick={() => handleLoadAiLogs(ag.id, aiLogsPage - 1)}>← Précédent</button>
                              <span style={{ fontSize: 12 }}>Page {aiLogsPage} / {Math.ceil(aiLogsTotal / 20)}</span>
                              <button className="ad-btn ad-btn--sm" disabled={aiLogsPage >= Math.ceil(aiLogsTotal / 20)} onClick={() => handleLoadAiLogs(ag.id, aiLogsPage + 1)}>Suivant →</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* TAB: Forfaits */}
                  {aiDetailTab === 'plans' && (
                    <div>
                      <div className="ad-panel" style={{ padding: 14, marginBottom: 12 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>💼 Forfait minimum requis</h4>
                        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-accent, #6f58ff)' }}>{cfg?.requiredPlan ? String(cfg.requiredPlan) : 'FREE (accès libre)'}</span>
                      </div>
                      {premiumOptions.length > 0 && (
                        <div className="ad-panel" style={{ padding: 14, marginBottom: 12 }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>⭐ Options premium</h4>
                          {premiumOptions.map(opt => (
                            <div key={opt} style={{ padding: '8px 12px', marginBottom: 6, borderRadius: 8, background: 'rgba(255,152,0,0.06)', fontSize: 13, color: 'var(--ad-text-2)' }}>
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="ad-panel" style={{ padding: 14 }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>🔐 Accès</h4>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--ad-text-2)' }}>
                          {(!cfg?.requiredPlan || cfg.requiredPlan === 'FREE') ? '✅ Accès libre — disponible pour tous les utilisateurs' : `🔒 Accès restreint — nécessite le forfait ${String(cfg.requiredPlan)} ou supérieur`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="ad-modal-footer">
                  <button className="ad-btn" onClick={() => { setModal(null); setAiSelectedAgent(null); }}>Fermer</button>
                  {isSuperAdmin && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {ag.status !== 'MAINTENANCE' && (
                        <button className="ad-btn" onClick={async () => {
                          await admin.updateAiAgent(ag.id, { status: 'MAINTENANCE' });
                          invalidateCache('/admin/ai');
                          setModal(null); setAiSelectedAgent(null);
                          loadSectionData();
                        }}>🔧 Maintenance</button>
                      )}
                      <button
                        className={`ad-btn ${ag.status === 'ACTIVE' ? '' : 'ad-btn--primary'}`}
                        onClick={async () => {
                          await admin.updateAiAgent(ag.id, { status: ag.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
                          invalidateCache('/admin/ai');
                          setModal(null); setAiSelectedAgent(null);
                          loadSectionData();
                        }}
                      >
                        {ag.status === 'ACTIVE' ? '⏸️ Désactiver' : '▶️ Activer'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Blog Preview */}
          {modal === 'blog-preview' && blogPreview && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">👁️ Aperçu — {blogPreview.title}</h2>
                <button className="ad-modal-close" onClick={() => { setModal(null); setBlogPreview(null); }}>✕</button>
              </div>
              <div className="ad-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {blogPreview.coverImage && (
                  <img src={resolveMediaUrl(blogPreview.coverImage)} alt="" style={{ width: '100%', maxHeight: 250, objectFit: 'cover', borderRadius: 12, marginBottom: 16 }} />
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span className={statusBadgeClass(blogPreview.status)}>{blogPreview.status}</span>
                  <span className="ad-badge" style={{ textTransform: 'capitalize' }}>{blogPreview.category}</span>
                  <span className="ad-badge">🌍 {blogPreview.language.toUpperCase()}</span>
                  <span className="ad-badge">👁️ {blogPreview.views} vues</span>
                </div>
                {blogPreview.tags.length > 0 && (
                  <div style={{ marginBottom: 12, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {blogPreview.tags.map(t => <span key={t} style={{ padding: '2px 8px', background: 'rgba(111,88,255,0.1)', borderRadius: 12, fontSize: 11, color: 'var(--ad-text-2)' }}>#{t}</span>)}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--ad-text-3)', marginBottom: 12 }}>
                  ✍️ {blogPreview.author} · {fmtDate(blogPreview.publishedAt ?? blogPreview.createdAt)} · Modifié {fmtDate(blogPreview.updatedAt)}
                </div>
                {blogPreview.excerpt && <p style={{ fontStyle: 'italic', color: 'var(--ad-text-2)', marginBottom: 16, padding: 12, background: 'rgba(111,88,255,0.04)', borderRadius: 8 }}>{blogPreview.excerpt}</p>}
                <div style={{ color: 'var(--ad-text-1)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{blogPreview.content}</div>
                {blogPreview.gifUrl && <img src={resolveMediaUrl(blogPreview.gifUrl)} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginTop: 16 }} />}
                {blogPreview.mediaUrl && blogPreview.mediaType === 'video' && <video src={resolveMediaUrl(blogPreview.mediaUrl)} controls style={{ maxWidth: '100%', borderRadius: 8, marginTop: 16 }} />}
                {blogPreview.metaTitle && <div style={{ marginTop: 16, padding: 10, background: 'rgba(111,88,255,0.04)', borderRadius: 8, fontSize: 11, color: 'var(--ad-text-3)' }}>🔍 SEO: <strong>{blogPreview.metaTitle}</strong> — {blogPreview.metaDescription ?? 'Pas de meta description'}</div>}
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => { setModal(null); setBlogPreview(null); }}>Fermer</button>
                <button className="ad-btn ad-btn--primary" onClick={() => { setModal(null); setBlogPreview(null); handleEditBlog(blogPreview.id); }}>✏️ Modifier</button>
              </div>
            </>
          )}

          {/* Ad edit */}
          {modal === 'ad-edit' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">{editingAdId ? 'Modifier l\'offre' : 'Nouvelle offre'}</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field"><label className="ad-label">Nom</label><input className="ad-input" value={adForm.name} onChange={e => setAdForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="ad-field"><label className="ad-label">Description</label><textarea className="ad-textarea" value={adForm.description} onChange={e => setAdForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div className="ad-field"><label className="ad-label">Prix (cents USD)</label><input className="ad-input" type="number" value={adForm.priceUsdCents} onChange={e => setAdForm(f => ({ ...f, priceUsdCents: Number(e.target.value) }))} /></div>
                <div className="ad-field"><label className="ad-label">Durée (jours)</label><input className="ad-input" type="number" value={adForm.durationDays} onChange={e => setAdForm(f => ({ ...f, durationDays: Number(e.target.value) }))} /></div>
                <div className="ad-field"><label className="ad-label">Fonctionnalités (séparées par virgule)</label><input className="ad-input" value={adForm.features} onChange={e => setAdForm(f => ({ ...f, features: e.target.value }))} /></div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Annuler</button>
                <button className="ad-btn ad-btn--primary" onClick={handleSaveAd} disabled={busy || !adForm.name}>{busy ? '…' : 'Sauvegarder'}</button>
              </div>
            </>
          )}

          {/* Admin edit */}
          {modal === 'admin-edit' && editingAdmin && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Modifier admin: {editingAdmin.displayName}</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field">
                  <label className="ad-label">Niveau d'accréditation</label>
                  <select className="ad-select" value={adminLevel} onChange={e => { setAdminLevel(e.target.value); setAdminPermissions(LEVEL_DEFAULT_PERMS[e.target.value] ?? ['DASHBOARD']); }}>
                    <option value="LEVEL_1">Niveau 1 — Chef Admin</option>
                    <option value="LEVEL_2">Niveau 2 — Admin Sécurité</option>
                    <option value="LEVEL_3">Niveau 3 — Admin Opérationnel</option>
                    <option value="LEVEL_4">Niveau 4 — Modérateur</option>
                    <option value="LEVEL_5">Niveau 5 — Observateur</option>
                  </select>
                </div>
                <div className="ad-field">
                  <label className="ad-label">Permissions</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {ALL_PERMISSIONS.map(p => (
                      <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" className="ad-checkbox" checked={adminPermissions.includes(p)} onChange={e => {
                          if (e.target.checked) setAdminPermissions(prev => [...prev, p]);
                          else setAdminPermissions(prev => prev.filter(x => x !== p));
                        }} />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Annuler</button>
                <button className="ad-btn ad-btn--primary" onClick={handleSaveAdminProfile} disabled={busy}>{busy ? '…' : 'Sauvegarder'}</button>
              </div>
            </>
          )}

          {/* Admin create */}
          {modal === 'admin-create' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Créer un compte admin</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field">
                  <label className="ad-label">Email</label>
                  <input className="ad-input" type="email" value={createAdminForm.email} onChange={e => setCreateAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="admin@example.com" />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Mot de passe</label>
                  <input className="ad-input" type="password" value={createAdminForm.password} onChange={e => setCreateAdminForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 caractères" />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Nom d'affichage</label>
                  <input className="ad-input" value={createAdminForm.displayName} onChange={e => setCreateAdminForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Prénom Nom" />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Niveau d'accréditation</label>
                  <select className="ad-select" value={createAdminForm.level} onChange={e => { setCreateAdminForm(f => ({ ...f, level: e.target.value })); setCreateAdminPermissions(LEVEL_DEFAULT_PERMS[e.target.value] ?? ['DASHBOARD']); }}>
                    <option value="LEVEL_1">Niveau 1 — Chef Admin</option>
                    <option value="LEVEL_2">Niveau 2 — Admin Sécurité</option>
                    <option value="LEVEL_3">Niveau 3 — Admin Opérationnel</option>
                    <option value="LEVEL_4">Niveau 4 — Modérateur</option>
                    <option value="LEVEL_5">Niveau 5 — Observateur</option>
                  </select>
                </div>
                <div className="ad-field">
                  <label className="ad-label">Permissions</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {ALL_PERMISSIONS.map(p => (
                      <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" className="ad-checkbox" checked={createAdminPermissions.includes(p)} onChange={e => {
                          if (e.target.checked) setCreateAdminPermissions(prev => [...prev, p]);
                          else setCreateAdminPermissions(prev => prev.filter(x => x !== p));
                        }} />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Annuler</button>
                <button className="ad-btn ad-btn--primary" onClick={handleCreateAdmin} disabled={busy || !createAdminForm.email || !createAdminForm.password || !createAdminForm.displayName}>{busy ? '…' : 'Créer'}</button>
              </div>
            </>
          )}

          {/* Currency edit */}
          {modal === 'currency-edit' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">Taux de change</h2>
                <button className="ad-modal-close" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field"><label className="ad-label">Devise source</label><input className="ad-input" value={currencyForm.fromCurrency} onChange={e => setCurrencyForm(f => ({ ...f, fromCurrency: e.target.value.toUpperCase() }))} /></div>
                <div className="ad-field"><label className="ad-label">Devise cible</label><input className="ad-input" value={currencyForm.toCurrency} onChange={e => setCurrencyForm(f => ({ ...f, toCurrency: e.target.value.toUpperCase() }))} /></div>
                <div className="ad-field"><label className="ad-label">Taux</label><input className="ad-input" type="number" step="0.01" value={currencyForm.rate} onChange={e => setCurrencyForm(f => ({ ...f, rate: Number(e.target.value) }))} /></div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => setModal(null)}>Annuler</button>
                <button className="ad-btn ad-btn--primary" onClick={handleSaveCurrency} disabled={busy}>{busy ? '…' : 'Appliquer'}</button>
              </div>
            </>
          )}

          {modal === 'feed-moderate' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">{feedModerateAction === 'DELETED' ? '🗑️ Supprimer la publication' : '🙈 Masquer la publication'}</h2>
                <button className="ad-modal-close" onClick={() => { setModal(null); setFeedModerateId(null); }}>✕</button>
              </div>
              <div className="ad-modal-body">
                <div className="ad-field">
                  <label className="ad-label">Note de modération (optionnel)</label>
                  <textarea className="ad-textarea" value={feedModerateNote} onChange={e => setFeedModerateNote(e.target.value)} placeholder="Raison de la modération…" />
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => { setModal(null); setFeedModerateId(null); }}>Annuler</button>
                <button className="ad-btn ad-btn--danger" disabled={busy} onClick={handleModerateFeed}>{busy ? '…' : 'Confirmer'}</button>
              </div>
            </>
          )}

          {modal === 'advertisement-edit' && (
            <>
              <div className="ad-modal-head">
                <h2 className="ad-modal-title">{editingAdvId ? '✏️ Modifier la publicité' : '➕ Nouvelle publicité client'}</h2>
                <button className="ad-modal-close" onClick={() => { setModal(null); setEditingAdvId(null); }}>✕</button>
              </div>
              <div className="ad-modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="ad-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="ad-label">Titre *</label>
                  <input className="ad-input" value={advForm.title} onChange={e => setAdvForm(f => ({ ...f, title: e.target.value }))} placeholder="Titre de la publicité" required />
                </div>
                <div className="ad-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="ad-label">Description</label>
                  <textarea className="ad-textarea" rows={2} value={advForm.description} onChange={e => setAdvForm(f => ({ ...f, description: e.target.value }))} placeholder="Description courte" />
                </div>
                <div className="ad-field">
                  <label className="ad-label">URL de l'image</label>
                  <input className="ad-input" value={advForm.imageUrl} onChange={e => setAdvForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Lien destination *</label>
                  <input className="ad-input" value={advForm.linkUrl} onChange={e => setAdvForm(f => ({ ...f, linkUrl: e.target.value }))} placeholder="/" required />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Texte bouton CTA</label>
                  <input className="ad-input" value={advForm.ctaText} onChange={e => setAdvForm(f => ({ ...f, ctaText: e.target.value }))} placeholder="Découvrir" />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Type</label>
                  <select className="ad-select" value={advForm.type} onChange={e => setAdvForm(f => ({ ...f, type: e.target.value }))}>
                    {['USER','BUSINESS','KIN_SELL'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="ad-field">
                  <label className="ad-label">Pages cibles (séparées par virgule)</label>
                  <input className="ad-input" value={advForm.targetPages.join(',')} onChange={e => setAdvForm(f => ({ ...f, targetPages: e.target.value.split(',').map(p => p.trim()).filter(Boolean) }))} placeholder="home,explorer,sokin" />
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Disponibles: {['home','explorer','sokin','account','admin'].join(', ')}</div>
                </div>
                <div className="ad-field">
                  <label className="ad-label">Priorité (0 = normale)</label>
                  <input className="ad-input" type="number" value={advForm.priority} onChange={e => setAdvForm(f => ({ ...f, priority: Number(e.target.value) }))} />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Date de début</label>
                  <input className="ad-input" type="date" value={advForm.startDate} onChange={e => setAdvForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Date de fin</label>
                  <input className="ad-input" type="date" value={advForm.endDate} onChange={e => setAdvForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Référence paiement</label>
                  <input className="ad-input" value={advForm.paymentRef} onChange={e => setAdvForm(f => ({ ...f, paymentRef: e.target.value }))} placeholder="REF-PAYPAL-XXX" />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Montant payé (cents USD)</label>
                  <input className="ad-input" type="number" value={advForm.amountPaidCents} onChange={e => setAdvForm(f => ({ ...f, amountPaidCents: Number(e.target.value) }))} />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Nom annonceur</label>
                  <input className="ad-input" value={advForm.advertiserName} onChange={e => setAdvForm(f => ({ ...f, advertiserName: e.target.value }))} placeholder="Nom complet" />
                </div>
                <div className="ad-field">
                  <label className="ad-label">Email annonceur</label>
                  <input className="ad-input" type="email" value={advForm.advertiserEmail} onChange={e => setAdvForm(f => ({ ...f, advertiserEmail: e.target.value }))} placeholder="email@exemple.com" />
                </div>
              </div>
              <div className="ad-modal-footer">
                <button className="ad-btn" onClick={() => { setModal(null); setEditingAdvId(null); }}>Annuler</button>
                <button className="ad-btn ad-btn--primary" disabled={busy || !advForm.title} onClick={handleAdvCreate}>{busy ? '…' : editingAdvId ? 'Enregistrer' : 'Créer'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  /* ══════════════════════════════════════
     MAIN RENDER
     ══════════════════════════════════════ */

  const sectionTitle = SECTION_DEFS.find(s => s.key === activeSection)?.label ?? '';

  // Group sections by group
  const groupedSections = useMemo(() => {
    const groups: Record<string, typeof visibleSections> = {};
    visibleSections.forEach(s => {
      const g = s.group ?? 'Autre';
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });
    return groups;
  }, [visibleSections]);

  return (
    <div className={`ad-shell ${sidebarCollapsed ? 'ad-sidebar-collapsed' : ''}`}>
      {/* ── Mobile Header ── */}
      <header className="dash-mobile-header">
        <button className="dash-mob-hamburger" onClick={() => setMobileSidebarOpen(o => !o)} aria-label="Menu">☰</button>
        <Link to="/" className="dash-mob-logo">
          <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span>Kin-Sell</span>
        </Link>
        <button className="dash-mob-search" aria-label="Rechercher">🔍</button>
      </header>

      {/* ── Overlay mobile ── */}
      {mobileSidebarOpen && <div className="dash-mob-overlay" onClick={() => setMobileSidebarOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`ad-sidebar ${mobileSidebarOpen ? 'ad-sidebar-open' : ''}`}>
        <button className="ad-collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          {sidebarCollapsed ? '→' : '←'}
        </button>

        <div className="ad-profile-card">
          <div className="ad-avatar">
            {user.profile?.avatarUrl ? <img src={resolveMediaUrl(user.profile.avatarUrl)} alt="" /> : <span className="ad-avatar-initials">{initials(displayName)}</span>}
          </div>
          {!sidebarCollapsed && (
            <div className="ad-profile-info">
              <span className="ad-profile-name">{displayName}</span>
              <span className="ad-profile-role">{user.role === 'SUPER_ADMIN' ? '⭐ Super Admin' : `Admin`}</span>
              {adminMe && <span className="ad-profile-level">{adminMe.level === 'LEVEL_0' ? 'Intouchable' : adminMe.level.replace('LEVEL_', 'Niveau ')}</span>}
            </div>
          )}
        </div>

        <nav className="ad-nav">
          {Object.entries(groupedSections).map(([group, sections]) => (
            <div key={group}>
              {!sidebarCollapsed && <div className="ad-nav-section-label">{group}</div>}
              {sections.map(s => (
                <button
                  key={s.key}
                  className={`ad-nav-item ${activeSection === s.key ? 'ad-nav-item--active' : ''}`}
                  onClick={() => {
                    if (s.key === 'messaging') {
                      navigate('/messaging');
                      return;
                    }
                    setActiveSection(s.key);
                    setMobileSidebarOpen(false);
                  }}
                  title={s.label}
                >
                  <span className="ad-nav-icon">{s.icon}</span>
                  {!sidebarCollapsed && <span className="ad-nav-label">{s.label}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Drawer logout — always visible in mobile drawer */}
        <div className="ud-drawer-logout" style={{ padding: '12px 16px', marginTop: 'auto' }}>
          <button className="ud-drawer-logout-btn" onClick={() => { logout(); navigate('/login'); }}>
            🚪 Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="ad-main">
        <div className="ad-topbar">
          <div>
            <h1>{sectionTitle}</h1>
            <p className="ad-topbar-sub">Espace administration Kin-Sell</p>
          </div>
        </div>

        {error && <div className="ad-badge ad-badge--danger" style={{ padding: '10px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>⚠ {error} <button className="ad-btn ad-btn--primary" style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: 12 }} onClick={() => { setError(null); loadSectionData(); }}>↻ Réessayer</button></div>}
        {success && <div className="ad-badge ad-badge--success" style={{ padding: '10px 16px', fontSize: 13 }}>✅ {success}</div>}

        {renderSection()}
      </main>

      {renderModal()}

      <TutorialOverlay pageKey="admin-dashboard" steps={adminDashboardSteps} open={tutorial.isOpen} onClose={tutorial.close} />
      {!tutorial.isOpen && <TutorialRelaunchBtn reset={tutorial.reset} start={tutorial.start} />}
    </div>
  );
}
