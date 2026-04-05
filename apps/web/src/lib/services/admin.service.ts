import { request } from "../api-core";

// ══════════════════════════════════════════════
// SECURITY TYPES
// ══════════════════════════════════════════════

export type SecurityDashboard = {
  events24h: number;
  events7d: number;
  activeRestrictions: number;
  unresolvedFraud: number;
  lowTrustUsers: number;
  suspendedUsers: number;
  recentHighRisk: SecurityEvent[];
};

export type SecurityEvent = {
  id: string;
  userId: string | null;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  riskLevel: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user?: { id: string; email: string | null; profile?: { displayName: string | null } | null } | null;
};

export type FraudSignal = {
  id: string;
  userId: string;
  signalType: string;
  severity: number;
  description: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  user?: { id: string; email: string | null; profile?: { displayName: string | null } | null } | null;
};

export type UserRestriction = {
  id: string;
  userId: string;
  restrictionType: string;
  reason: string;
  sanctionLevel: string;
  isActive: boolean;
  appliedBy: string | null;
  expiresAt: string | null;
  liftedAt: string | null;
  createdAt: string;
  user?: { id: string; email: string | null; profile?: { displayName: string | null } | null } | null;
};

export type TrustScoreEvent = {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  source: string;
  newScore: number;
  newLevel: string;
  createdAt: string;
};

export type UserTrustInfo = {
  current: { trustScore: number; trustLevel: string } | null;
  history: TrustScoreEvent[];
};

// ══════════════════════════════════════════════
// ADMIN TYPES
// ══════════════════════════════════════════════

export type AdminStats = {
  totalUsers: number;
  totalBusinesses: number;
  totalAdmins: number;
  activeUsers: number;
  suspendedUsers: number;
  totalListings: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  canceledOrders: number;
  totalReports: number;
  pendingReports: number;
  totalRevenueUsdCents: number;
  completedRevenueUsdCents: number;
  todayRevenueUsdCents: number;
  monthRevenueUsdCents: number;
};

export type AdminUser = {
  id: string;
  email: string | null;
  phone: string | null;
  role: string;
  accountStatus: string;
  deletionRequestedAt?: string | null;
  createdAt: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  businesses: Array<{ id: string; publicName: string; slug: string }>;
};

export type AdminUserDetail = AdminUser & {
  emailVerified: boolean;
  phoneVerified: boolean;
  profileCompleted: boolean;
  profile: {
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
    birthDate: string | null;
    city: string | null;
    country: string | null;
    addressLine1: string | null;
    verificationStatus: string;
  } | null;
  adminProfile: { level: string; permissions: string[] } | null;
  counts: {
    buyerOrders: number;
    sellerOrders: number;
    listings: number;
    reportsFiled: number;
    reportsReceived: number;
  };
};

export type AdminTransaction = {
  id: string;
  status: string;
  totalUsdCents: number;
  currency: string;
  createdAt: string;
  buyer: { id: string; displayName: string };
  seller: { id: string; displayName: string };
  itemsCount: number;
  items: Array<{ title: string; type: string; quantity: number; unitPriceUsdCents: number }>;
};

export type AdminReport = {
  id: string;
  reason: string;
  message: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; displayName: string; username: string | null; avatarUrl: string | null; email: string | null; phone: string | null };
  reported: { id: string; displayName: string; username: string | null; avatarUrl: string | null; email: string | null; phone: string | null };
};

export type AdminBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  gifUrl: string | null;
  category: string;
  tags: string[];
  language: string;
  views: number;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  author: string;
  authorId: string;
};

export type AdminBlogPostDetail = AdminBlogPost & {
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
};

export type BlogAnalytics = {
  totalPosts: number;
  published: number;
  drafts: number;
  archived: number;
  totalViews: number;
  topPosts: Array<{ id: string; title: string; slug: string; views: number; publishedAt: string | null }>;
  categories: Array<{ category: string; count: number }>;
};

export type AdminAdOffer = {
  id: string;
  name: string;
  description: string | null;
  priceUsdCents: number;
  durationDays: number;
  features: string[];
  status: string;
  createdAt: string;
};

export type AdminAuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; displayName: string } | null;
};

export type AdminMember = {
  id: string;
  email: string | null;
  role: string;
  accountStatus: string;
  createdAt: string;
  displayName: string;
  avatarUrl: string | null;
  level: string | null;
  permissions: string[];
};

export type AdminRanking = {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  totalRevenueUsdCents: number;
  orderCount: number;
};

export type AdminAiAgent = {
  id: string;
  name: string;
  slug: string;
  domain: string;
  type: string;
  description: string | null;
  action: string | null;
  icon: string;
  version: string;
  status: string;
  level: string;
  enabled: boolean;
  config: AiAgentConfig | null;
  lastActiveAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiAgentConfig = {
  mission?: string;
  doesNot?: string;
  zones?: string[];
  targets?: string[];
  uiEntryPoints?: string[];
  interventionType?: string;
  requiredPlan?: string;
  premiumOptions?: string[];
  dataUsed?: { read?: string[]; generated?: string[]; suggested?: string[]; actionable?: string[] };
  outputs?: string[];
  subFunctions?: string[];
  [key: string]: unknown;
};

export type AiAgentDetail = AdminAiAgent & {
  stats: {
    totalUsage: number;
    todayUsage: number;
    weekUsage: number;
    monthUsage: number;
    successRate: number;
    errorRate: number;
  };
  recentLogs: AiLogEntry[];
  topUsers: { userId: string; displayName: string; role: string; usageCount: number }[];
};

export type AiLogEntry = {
  id: string;
  actionType: string;
  targetUserId: string | null;
  targetUserName: string | null;
  targetUserRole: string | null;
  decision: string;
  reasoning: string | null;
  success: boolean;
  metadata: unknown;
  createdAt: string;
};

export type AiManagementStats = {
  total: number;
  active: number;
  inactive: number;
  maintenance: number;
  paused: number;
  errors: number;
  linkedToPlans: number;
  accountsUsingAi: number;
  totalUsage: number;
  weekUsage: number;
  systemStatus: 'active' | 'degraded' | 'offline';
};

export type AdminCurrencyRate = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  isManual: boolean;
  updatedBy: string | null;
};

export type AdminMe = {
  id: string;
  email: string | null;
  role: string;
  displayName: string;
  avatarUrl: string | null;
  level: string;
  permissions: string[];
};

export type AdminAppeal = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  accountStatus: string;
  message: string;
  submittedAt: string;
  createdAt: string;
};

/* ── MessageGuard AI Types ── */
export type MessageGuardLogEntry = {
  id: string;
  userId: string;
  userName: string;
  username: string | null;
  conversationId: string;
  verdict: "ALLOWED" | "WARNED" | "BLOCKED";
  riskScore: number;
  categories: string[];
  detections: any;
  engineResults: any;
  warningShown: string | null;
  messageContent: string | null;
  messagePreview?: string | null;
  createdAt: string;
};

export type MessageGuardDashboard = {
  enabled: boolean;
  severity: number;
  stats: {
    last24h: { total: number; warned: number; blocked: number };
    last7d: { total: number; warned: number; blocked: number };
  };
  topViolators: Array<{ userId: string; count: number; displayName: string; username: string | null }>;
  recentLogs: MessageGuardLogEntry[];
};

export type MessageGuardLogsResponse = {
  logs: MessageGuardLogEntry[];
  total: number;
  page: number;
  totalPages: number;
};

export type MessageGuardConfigResponse = {
  enabled: boolean;
  severity: number;
  [key: string]: any;
};

// ── Feed (So-Kin) Admin ──
export type AdminFeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  text: string;
  visibility: string;
  mediaUrls: string[];
  likes: number;
  comments: number;
  shares: number;
  sponsored: boolean;
  status: string;
  moderatedBy: string | null;
  moderationNote: string | null;
  createdAt: string;
};

export type AdminFeedStats = {
  total: number;
  active: number;
  flagged: number;
  hidden: number;
  deleted: number;
};

// ── Donations ──
export type AdminDonation = {
  id: string;
  userId: string;
  userName: string;
  type: string;
  amountUsdCents: number;
  description: string | null;
  adOfferName: string | null;
  status: string;
  createdAt: string;
};

export type AdminDonationSummary = {
  totalRevenueUsdCents: number;
  completedRevenueUsdCents: number;
  pendingCount: number;
};

// ── Advertisements Admin ──
export type AdminAdvertisement = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string;
  ctaText: string;
  type: string;
  status: string;
  targetPages: string[];
  startDate: string | null;
  endDate: string | null;
  paymentRef: string | null;
  amountPaidCents: number;
  impressions: number;
  clicks: number;
  priority: number;
  cancelledAt: string | null;
  cancelNote: string | null;
  advertiserEmail: string | null;
  advertiserName: string | null;
  userId: string | null;
  businessId: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; displayName: string | null; email: string | null };
  business?: { id: string; businessName: string; email: string | null };
};

export type AdminListingItem = {
  id: string;
  type: string;
  status: string;
  title: string;
  category: string;
  city: string;
  imageUrl: string | null;
  priceUsdCents: number;
  isPublished: boolean;
  isNegotiable: boolean;
  createdAt: string;
  ownerDisplayName: string;
  ownerRole: string;
  businessName: string | null;
};

export type CategoryNegotiationRule = {
  category: string;
  negotiationLocked: boolean;
  ruleId: string | null;
  updatedAt: string | null;
};

// ══════════════════════════════════════════════
// ADMIN API
// ══════════════════════════════════════════════

export const admin = {
  me: () => request<AdminMe>("/admin/me"),
  stats: () => request<AdminStats>("/admin/stats"),

  // Users
  users: (params?: { page?: number; limit?: number; search?: string; role?: string; status?: string }) =>
    request<{ total: number; page: number; totalPages: number; users: AdminUser[] }>("/admin/users", { params: params as Record<string, string | number | undefined> }),
  userDetail: (id: string) => request<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`),
  changeUserRole: (id: string, role: string) =>
    request<{ id: string; role: string }>(`/admin/users/${encodeURIComponent(id)}/role`, { method: "PATCH", body: { role } }),
  suspendUser: (id: string, body: { durationHours: number; reason: string; adminPassword: string }) =>
    request<{ success: boolean }>(`/admin/users/${encodeURIComponent(id)}/suspend`, { method: "POST", body }),
  unsuspendUser: (id: string) =>
    request<{ success: boolean }>(`/admin/users/${encodeURIComponent(id)}/unsuspend`, { method: "POST" }),
  createUser: (body: { email: string; password: string; displayName: string; role?: string }) =>
    request<{ id: string; email: string | null; role: string; displayName: string | null }>("/admin/users/create", { method: "POST", body }),

  // Blog
  blogPosts: (params?: { page?: number; limit?: number; status?: string; category?: string; search?: string; language?: string; sortBy?: string }) =>
    request<{ total: number; page: number; totalPages: number; posts: AdminBlogPost[] }>("/admin/blog", { params: params as Record<string, string | number | undefined> }),
  blogPost: (id: string) =>
    request<AdminBlogPostDetail>(`/admin/blog/${encodeURIComponent(id)}`),
  blogAnalytics: () =>
    request<BlogAnalytics>("/admin/blog/analytics"),
  createBlogPost: (body: {
    title: string; content: string; excerpt?: string; coverImage?: string;
    mediaUrl?: string; mediaType?: string; gifUrl?: string; category?: string;
    tags?: string[]; language?: string; metaTitle?: string; metaDescription?: string; status?: string;
  }) =>
    request<AdminBlogPost>("/admin/blog", { method: "POST", body }),
  updateBlogPost: (id: string, body: Record<string, unknown>) =>
    request<AdminBlogPost>(`/admin/blog/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteBlogPost: (id: string) =>
    request<{ success: boolean }>(`/admin/blog/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Transactions
  transactions: (params?: { page?: number; limit?: number; status?: string; type?: string; search?: string }) =>
    request<{
      total: number; page: number; totalPages: number;
      summary: { totalRevenueUsdCents: number; completedCount: number; completedUsdCents: number; pendingCount: number; pendingUsdCents: number; canceledCount: number; canceledUsdCents: number };
      orders: AdminTransaction[];
    }>("/admin/transactions", { params: params as Record<string, string | number | undefined> }),

  // Reports
  reports: (params?: { page?: number; limit?: number; status?: string }) =>
    request<{ total: number; page: number; totalPages: number; reports: AdminReport[] }>("/admin/reports", { params: params as Record<string, string | number | undefined> }),
  resolveReport: (id: string, resolution: string) =>
    request<AdminReport>(`/admin/reports/${encodeURIComponent(id)}/resolve`, { method: "POST", body: { resolution } }),

  // Ads
  adOffers: () => request<AdminAdOffer[]>("/admin/ads"),
  createAdOffer: (body: { name: string; description?: string; priceUsdCents: number; durationDays: number; features?: string[] }) =>
    request<AdminAdOffer>("/admin/ads", { method: "POST", body }),
  updateAdOffer: (id: string, body: Record<string, unknown>) =>
    request<AdminAdOffer>(`/admin/ads/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deleteAdOffer: (id: string) =>
    request<{ success: boolean }>(`/admin/ads/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // AI Agents — Centre de pilotage
  aiAgents: (params?: { status?: string; domain?: string; type?: string }) =>
    request<AdminAiAgent[]>("/admin/ai-agents", { params: params as Record<string, string | number | undefined> }),
  aiAgentStats: () => request<AiManagementStats>("/admin/ai-agents/stats"),
  aiAgentDetail: (id: string) => request<AiAgentDetail>(`/admin/ai-agents/${encodeURIComponent(id)}`),
  aiAgentLogs: (id: string, params?: { page?: number; limit?: number; success?: string; actionType?: string }) =>
    request<{ logs: AiLogEntry[]; total: number; page: number; totalPages: number }>(
      `/admin/ai-agents/${encodeURIComponent(id)}/logs`,
      { params: params as Record<string, string | number | undefined> }
    ),
  updateAiAgent: (id: string, body: { enabled?: boolean; level?: string; status?: string; name?: string; description?: string; icon?: string; version?: string; config?: Record<string, unknown> }) =>
    request<AdminAiAgent>(`/admin/ai-agents/${encodeURIComponent(id)}`, { method: "PATCH", body }),

  // Rankings
  rankings: (params?: { period?: string; type?: string }) =>
    request<AdminRanking[]>("/admin/rankings", { params: params as Record<string, string | number | undefined> }),

  // Admins
  admins: () => request<AdminMember[]>("/admin/admins"),
  updateAdminProfile: (id: string, body: { level?: string; permissions?: string[] }) =>
    request<unknown>(`/admin/admins/${encodeURIComponent(id)}/profile`, { method: "PATCH", body }),
  demoteAdmin: (id: string) =>
    request<{ success: boolean }>(`/admin/admins/${encodeURIComponent(id)}/demote`, { method: "POST" }),

  // Currency
  currencyRates: () => request<AdminCurrencyRate[]>("/admin/currency-rates"),
  upsertCurrencyRate: (body: { fromCurrency: string; toCurrency: string; rate: number }) =>
    request<AdminCurrencyRate>("/admin/currency-rates", { method: "PUT", body }),

  // Audit
  auditLogs: (params?: { page?: number; limit?: number; actorId?: string }) =>
    request<{ total: number; page: number; totalPages: number; logs: AdminAuditLog[] }>("/admin/audit-logs", { params: params as Record<string, string | number | undefined> }),

  // Settings
  siteSettings: () => request<Record<string, string>>("/admin/settings"),
  updateSiteSetting: (key: string, value: string) =>
    request<unknown>(`/admin/settings/${encodeURIComponent(key)}`, { method: "PUT", body: { value } }),

  // Security
  securityDashboard: () => request<SecurityDashboard>("/admin/security/dashboard"),
  securityEvents: (params?: { page?: number; limit?: number; eventType?: string; userId?: string; riskLevel?: number }) =>
    request<{ events: SecurityEvent[]; total: number }>("/admin/security/events", { params: params as Record<string, string | number | undefined> }),
  fraudSignals: (params?: { page?: number; limit?: number; resolved?: string }) =>
    request<{ signals: FraudSignal[]; total: number }>("/admin/security/fraud-signals", { params: params as Record<string, string | number | undefined> }),
  resolveFraudSignal: (id: string) =>
    request<FraudSignal>(`/admin/security/fraud-signals/${encodeURIComponent(id)}/resolve`, { method: "PATCH" }),
  restrictions: (params?: { page?: number; limit?: number; isActive?: string }) =>
    request<{ restrictions: UserRestriction[]; total: number }>("/admin/security/restrictions", { params: params as Record<string, string | number | undefined> }),
  applyRestriction: (body: { userId: string; restrictionType: string; reason: string; sanctionLevel?: string; durationHours?: number }) =>
    request<UserRestriction>("/admin/security/restrictions", { method: "POST", body }),
  liftRestriction: (id: string) =>
    request<UserRestriction>(`/admin/security/restrictions/${encodeURIComponent(id)}/lift`, { method: "PATCH" }),
  userTrust: (userId: string) =>
    request<UserTrustInfo>(`/admin/security/users/${encodeURIComponent(userId)}/trust`),
  adjustTrust: (userId: string, delta: number, reason: string) =>
    request<{ score: number; level: string }>(`/admin/security/users/${encodeURIComponent(userId)}/trust/adjust`, { method: "POST", body: { delta, reason } }),
  recalculateTrust: (userId: string) =>
    request<{ score: number; level: string }>(`/admin/security/users/${encodeURIComponent(userId)}/trust/recalculate`, { method: "POST" }),
  applySanction: (body: { userId: string; level: string; reason: string; durationHours?: number }) =>
    request<{ ok: boolean }>("/admin/security/sanctions", { method: "POST", body }),
  userRestrictions: (userId: string) =>
    request<{ restrictions: UserRestriction[] }>(`/admin/security/users/${encodeURIComponent(userId)}/restrictions`),

  // ── MessageGuard AI ──
  messageGuardDashboard: () =>
    request<MessageGuardDashboard>("/admin/message-guard/dashboard"),
  messageGuardLogs: (params?: { page?: number; limit?: number; verdict?: string; userId?: string; category?: string }) =>
    request<MessageGuardLogsResponse>("/admin/message-guard/logs", { params: params as Record<string, string | number | undefined> }),
  messageGuardConfig: () =>
    request<MessageGuardConfigResponse>("/admin/message-guard/config"),
  updateMessageGuardConfig: (key: string, value: any) =>
    request<any>("/admin/message-guard/config", { method: "PATCH", body: { key, value } }),

  // Feed
  feedPosts: (params?: { page?: number; limit?: number; status?: string; search?: string }) =>
    request<{ posts: AdminFeedPost[]; total: number; page: number; pages: number }>("/admin/feed", { params: params as Record<string, string | number | undefined> }),
  feedStats: () =>
    request<AdminFeedStats>("/admin/feed/stats"),
  moderateFeedPost: (id: string, action: string, note?: string) =>
    request<any>(`/admin/feed/${encodeURIComponent(id)}/moderate`, { method: "PATCH", body: { action, note } }),

  // Donations
  donations: (params?: { page?: number; limit?: number; status?: string; type?: string }) =>
    request<{ donations: AdminDonation[]; total: number; page: number; pages: number; summary: AdminDonationSummary }>("/admin/donations", { params: params as Record<string, string | number | undefined> }),
  updateDonationStatus: (id: string, status: string) =>
    request<any>(`/admin/donations/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),

  // Admin messaging
  sendAdminMessage: (targetUserId: string, content: string) =>
    request<{ conversationId: string; messageId: string }>("/admin/send-message", { method: "POST", body: { targetUserId, content } }),

  // Cleanup
  runCleanup: () =>
    request<{ actions: string[]; timestamp: string }>("/admin/cleanup", { method: "POST" }),

  // Advertisements clients
  advertisements: (params?: { page?: number; limit?: number; status?: string; type?: string; search?: string }) =>
    request<{ ads: AdminAdvertisement[]; total: number; page: number; pages: number }>("/admin/advertisements", { params: params as Record<string, string | number | undefined> }),
  createAdvertisement: (body: Record<string, unknown>) =>
    request<AdminAdvertisement>("/admin/advertisements", { method: "POST", body }),
  updateAdvertisement: (id: string, body: Record<string, unknown>) =>
    request<AdminAdvertisement>(`/admin/advertisements/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  patchAdvertisementStatus: (id: string, body: { status: string; cancelNote?: string }) =>
    request<AdminAdvertisement>(`/admin/advertisements/${encodeURIComponent(id)}/status`, { method: "PATCH", body }),
  deleteAdvertisement: (id: string) =>
    request<{ ok: boolean }>(`/admin/advertisements/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Listings
  listings: (params?: { page?: number; limit?: number; status?: string; type?: string; q?: string }) =>
    request<{ total: number; page: number; totalPages: number; listings: AdminListingItem[] }>("/admin/listings", { params: params as Record<string, string | number | undefined> }),
  toggleListingNegotiable: (id: string, isNegotiable: boolean) =>
    request<unknown>(`/admin/listings/${encodeURIComponent(id)}/negotiable`, { method: "PATCH", body: { isNegotiable } }),
  changeListingStatus: (id: string, status: string) =>
    request<unknown>(`/admin/listings/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),

  // Category Negotiation Rules
  negotiationRules: () =>
    request<CategoryNegotiationRule[]>("/admin/negotiation-rules"),
  toggleCategoryNegotiation: (category: string, locked: boolean) =>
    request<unknown>("/admin/negotiation-rules/toggle", { method: "POST", body: { category, locked } }),

  // Appeals
  appeals: (params?: { page?: number; limit?: number }) =>
    request<{ total: number; page: number; totalPages: number; appeals: AdminAppeal[] }>("/admin/appeals", { params: params as Record<string, string | number | undefined> }),

  // Create admin
  createAdmin: (body: { email: string; password: string; displayName: string; level?: string; permissions?: string[] }) =>
    request<{ id: string; email: string; role: string; displayName: string; level: string; permissions: string[] }>("/admin/admins/create", { method: "POST", body }),
};
