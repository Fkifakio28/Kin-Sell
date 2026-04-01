// En dev : "/api" est proxifié par Vite vers localhost:4000 (voir vite.config.ts)
// En prod : définir la variable d'environnement VITE_API_URL=https://api.kin-sell.com
const API_BASE = import.meta.env.VITE_API_URL ?? "/api";
const ACCESS_TOKEN_KEY = "kin-sell.token";
const REFRESH_TOKEN_KEY = "kin-sell.refresh-token";
const SESSION_ID_KEY = "kin-sell.session-id";

// ── In-memory GET cache ──────────────────────────────────────────────────────
type CacheEntry = { data: unknown; expiresAt: number };
const _memCache = new Map<string, CacheEntry>();

function _cacheKey(url: string): string {
  // Sépare le cache par utilisateur (8 derniers chars du token)
  const tok = localStorage.getItem(ACCESS_TOKEN_KEY);
  return `${tok ? tok.slice(-10) : "anon"}:${url}`;
}

function _cacheTtl(path: string): number {
  if (path.startsWith("/explorer") || path.startsWith("/listings")) return 60_000;
  if (path.startsWith("/orders") || path.startsWith("/negotiations")) return 20_000;
  if (path.startsWith("/account/me")) return 60_000;
  return 30_000;
}

function _cacheGet<T>(key: string): T | null {
  const entry = _memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _memCache.delete(key); return null; }
  return entry.data as T;
}

function _cacheSet(key: string, data: unknown, ttl: number): void {
  _memCache.set(key, { data, expiresAt: Date.now() + ttl });
  // Nettoyage si trop d'entrées
  if (_memCache.size > 120) {
    const now = Date.now();
    for (const [k, v] of _memCache.entries()) {
      if (v.expiresAt < now) _memCache.delete(k);
      if (_memCache.size <= 80) break;
    }
  }
}

/** Invalide le cache pour un préfixe de chemin donné */
export function invalidateCache(pathPrefix: string): void {
  for (const k of _memCache.keys()) {
    if (k.includes(pathPrefix)) _memCache.delete(k);
  }
}

/** Vide tout le cache (ex: à la déconnexion) */
export function clearCache(): void {
  _memCache.clear();
}
// ────────────────────────────────────────────────────────────────────────────

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string | number | undefined>;
};

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

function setSessionId(sessionId: string): void {
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

function clearToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(SESSION_ID_KEY);
}

export type AccountUser = {
  id: string;
  email: string | null;
  phone: string | null;
  role: string;
  accountStatus: string;
  suspensionReason?: string | null;
  deletionRequestedAt?: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  profileCompleted: boolean;
  profile: {
    username: string | null;
    displayName: string;
    avatarUrl: string | null;
    birthDate: string | null;
    city: string | null;
    country: string | null;
    addressLine1: string | null;
  };
  preferences?: {
    onlineStatusVisible?: boolean;
  };
};

type AccountAuthResponse = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: AccountUser;
};

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  const res = await fetch(`${API_BASE}/account/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });

  if (!res.ok) {
    clearAuthSession();
    return false;
  }

  const data = (await res.json()) as AccountAuthResponse;
  setToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  setSessionId(data.sessionId);
  return true;
}

async function request<T>(path: string, opts: RequestOptions = {}, allowRefresh = true): Promise<T> {
  const { method = "GET", body, headers = {}, params } = opts;

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.append(k, String(v));
    }
    const str = qs.toString();
    if (str) url += `?${str}`;
  }

  // ── Lecture cache pour GET ──
  if (method === "GET") {
    const ck = _cacheKey(url);
    const cached = _cacheGet<T>(ck);
    if (cached !== null) return cached;
  }

  const token = getToken();
  const reqHeaders: Record<string, string> = { ...headers };
  if (token) reqHeaders["Authorization"] = `Bearer ${token}`;
  if (body) reqHeaders["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401 && allowRefresh && path !== "/account/refresh") {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return request<T>(path, opts, false);
      }
    }

    let data: unknown;
    try { data = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, `API ${res.status}`, data);
  }

  if (res.status === 204) return undefined as T;
  const result = await res.json() as T;

  // ── Mise en cache des GET ──
  if (method === "GET") {
    _cacheSet(_cacheKey(url), result, _cacheTtl(path));
  }

  return result;
}

// ── Auth ──
export type AuthResponse = {
  token: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: AccountUser;
};

function persistAuth(data: AccountAuthResponse): AuthResponse {
  setToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  setSessionId(data.sessionId);

  return {
    token: data.accessToken,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    sessionId: data.sessionId,
    user: data.user
  };
}

export const auth = {
  register: async (body: { email: string; password: string; displayName: string; role?: string; cfTurnstileToken?: string }) => {
    const data = await request<AccountAuthResponse>("/account/entry", {
      method: "POST",
      body: {
        method: "email",
        email: body.email,
        password: body.password,
        displayName: body.displayName,
        accountType: body.role === "BUSINESS" ? "BUSINESS" : "USER",
        cfTurnstileToken: body.cfTurnstileToken,
      }
    });
    return persistAuth(data);
  },

  login: async (body: { email: string; password: string; cfTurnstileToken?: string }) => {
    const raw = await request<AccountAuthResponse | { totpRequired: true; challengeToken: string }>("/account/entry", {
      method: "POST",
      body: {
        method: "email",
        email: body.email,
        password: body.password,
        cfTurnstileToken: body.cfTurnstileToken,
      }
    });
    // Si TOTP challengé → on ne persiste pas de session, on renvoie le challenge
    if ("totpRequired" in raw && raw.totpRequired) {
      return raw as { totpRequired: true; challengeToken: string };
    }
    return persistAuth(raw as AccountAuthResponse);
  },

  logout: async () => {
    try {
      await request<void>("/account/logout", { method: "POST" }, false);
    } finally {
      clearAuthSession();
    }
  },

  refresh: async () => {
    const ok = await refreshAccessToken();
    if (!ok) {
      throw new ApiError(401, "Session expiree");
    }
  },

  me: () => request<AccountUser>("/account/me"),
  completeProfile: (body: {
    username?: string;
    birthDate?: string;
    country?: string;
    city?: string;
    addressLine1?: string;
    avatarUrl?: string;
    displayName?: string;
    onlineStatusVisible?: boolean;
    accountType?: "USER" | "BUSINESS";
    email?: string;
    phone?: string;
  }) => request<AccountUser>("/account/profile/complete", { method: "PATCH", body }),
  sessions: () => request<{ sessions: Array<{
    id: string;
    deviceId?: string;
    userAgent?: string;
    ipAddress?: string;
    lastSeenAt: string;
    createdAt: string;
    isCurrent: boolean;
  }> }>("/account/sessions"),
  requestOtp: (body: { phone: string; purpose?: "SIGN_IN" | "VERIFY_PHONE" }) =>
    request<{ verificationId: string; expiresAt: string; resendAfterSeconds: number; previewCode?: string }>("/account/otp/request", { method: "POST", body }),
  verifyOtp: (body: {
    verificationId: string;
    code: string;
    phone?: string;
    displayName?: string;
    accountType?: "USER" | "BUSINESS";
    deviceId?: string;
  }) => request<AccountAuthResponse>("/account/otp/verify", { method: "POST", body }).then(persistAuth),

  // ── TOTP 2FA ──
  totpStatus: () => request<{ totpEnabled: boolean }>("/account/2fa/totp/status"),
  totpSetup: () => request<{ secret: string; uri: string }>("/account/2fa/totp/setup", { method: "POST" }),
  totpEnable: (code: string) => request<{ success: boolean }>("/account/2fa/totp/enable", { method: "POST", body: { code } }),
  totpDisable: (password: string) => request<{ success: boolean }>("/account/2fa/totp", { method: "DELETE", body: { password } }),
  totpChallenge: (challengeToken: string, code: string) =>
    request<AccountAuthResponse>("/account/2fa/totp/challenge", { method: "POST", body: { challengeToken, code } }).then(persistAuth),

  requestDeletion: (reason: string) =>
    request<{ ok: boolean; scheduledDeletionAt: string }>("/account/deletion-request", { method: "POST", body: { reason } }),

  submitAppeal: (message: string) =>
    request<{ ok: boolean }>("/account/appeal", { method: "POST", body: { message } }),
};

// ── Users ──
export type UpdateProfilePayload = {
  displayName?: string;
  avatarUrl?: string;
  city?: string;
  country?: string;
  bio?: string;
  domain?: string;
  qualification?: string;
  experience?: string;
  workHours?: string;
};

export const users = {
  me: () => request<unknown>("/users/me"),
  updateMe: (body: UpdateProfilePayload) =>
    request<unknown>("/users/me", { method: "PATCH", body }),
  publicProfile: (username: string) => request<unknown>(`/users/public/${encodeURIComponent(username)}`),
  publicProfileById: (id: string) => request<unknown>(`/users/${encodeURIComponent(id)}/public`),
};

// ── Reviews ──
export type ReviewItem = {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  rating: number;
  text: string | null;
  createdAt: string;
};

export const reviews = {
  forUser: (userId: string) =>
    request<{ reviews: ReviewItem[]; averageRating: number; totalCount: number }>(
      `/reviews/${encodeURIComponent(userId)}`
    ),
  create: (body: { targetId: string; rating: number; text?: string }) =>
    request<unknown>("/reviews", { method: "POST", body }),
};

// ── Business Accounts ──
export type BusinessAccount = {
  id: string;
  ownerUserId: string;
  legalName: string;
  publicName: string;
  description: string | null;
  slug: string;
  createdAt: string;
  updatedAt: string;
  shop: {
    id: string;
    businessId: string;
    city: string | null;
    address: string | null;
    coverImage: string | null;
    logo: string | null;
    publicDescription: string | null;
    active: boolean;
  } | null;
};

export const businesses = {
  create: (body: { legalName: string; publicName: string; description?: string; city: string }) =>
    request<BusinessAccount>("/business-accounts", { method: "POST", body }),
  me: () => request<BusinessAccount>("/business-accounts/me"),
  updateMe: (body: Record<string, unknown>) =>
    request<BusinessAccount>("/business-accounts/me", { method: "PATCH", body }),
};

// ── Listings ──
export type SearchParams = {
  q?: string; type?: string; city?: string;
  latitude?: number; longitude?: number; radiusKm?: number; limit?: number;
};

export type ListingStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED" | "DELETED";

export type MyListing = {
  id: string;
  type: string;
  status: ListingStatus;
  title: string;
  description: string | null;
  category: string;
  city: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  mediaUrls: string[];
  priceUsdCents: number;
  stockQuantity: number | null;
  serviceDurationMin: number | null;
  serviceLocation: string | null;
  isPublished: boolean;
  isNegotiable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MyListingsResponse = {
  total: number;
  page: number;
  totalPages: number;
  listings: MyListing[];
};

export type MyListingsStats = {
  active: number;
  inactive: number;
  archived: number;
  deleted: number;
  total: number;
};

export type PublicListing = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  category: string;
  city: string;
  imageUrl: string | null;
  priceUsdCents: number;
  isNegotiable: boolean;
  createdAt: string;
  owner: {
    userId: string;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
  };
};

export const listings = {
  search: (params: SearchParams) =>
    request<unknown>("/listings/search", { params: params as Record<string, string | number | undefined> }),
  create: (body: Record<string, unknown>) =>
    request<MyListing>("/listings", { method: "POST", body }),
  latest: (params?: { type?: string; limit?: number }) =>
    request<PublicListing[]>("/listings/latest", { params: params as Record<string, string | number | undefined> }),
  mine: (params?: { status?: ListingStatus; type?: string; page?: number; limit?: number }) =>
    request<MyListingsResponse>("/listings/mine", { params: params as Record<string, string | number | undefined> }),
  mineStats: () =>
    request<MyListingsStats>("/listings/mine/stats"),
  mineDetail: (id: string) =>
    request<MyListing>(`/listings/mine/${encodeURIComponent(id)}`),
  update: (id: string, body: Record<string, unknown>) =>
    request<MyListing>(`/listings/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  changeStatus: (id: string, status: ListingStatus) =>
    request<MyListing>(`/listings/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),
  updateStock: (id: string, stockQuantity: number | null) =>
    request<MyListing>(`/listings/${encodeURIComponent(id)}/stock`, { method: "PATCH", body: { stockQuantity } }),
  lockedCategories: () =>
    request<string[]>("/listings/locked-categories"),
  contactSeller: (listingId: string) =>
    request<{ conversationId: string; listingId: string; sellerUserId: string; message: string }>(
      `/listings/${encodeURIComponent(listingId)}/contact`, { method: "POST" }
    ),
};

// ── Uploads ──
export const uploads = {
  uploadFiles: async (files: File[]): Promise<string[]> => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }
    const token = getToken();
    const baseUrl = API_BASE;
    const res = await fetch(`${baseUrl}/uploads`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = typeof data === 'object' && data && 'error' in data ? (data as { error: string }).error : `Erreur upload (${res.status})`;
      throw new ApiError(res.status, msg, data);
    }
    const data = (await res.json()) as { urls: string[] };
    return data.urls;
  },
};

// ── Explorer ──
export type ExplorerShopApi = {
  id: string;
  businessId: string;
  name: string;
  slug: string;
  badge: string;
  city: string;
  coverImage: string | null;
  logo: string | null;
  publicDescription: string | null;
  active: boolean;
};

export type ExplorerProfileApi = {
  id: string;
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  city: string;
  badge: string;
};

export const explorer = {
  stats: () => request<{ categories: number; publicProfiles: number; onlineShops: number }>("/explorer/stats"),
  ads: (params?: { city?: string; country?: string }) =>
    request<unknown>("/explorer/ads", { params }),
  shops: (limit = 4) => request<ExplorerShopApi[]>(`/explorer/shops?limit=${limit}`),
  profiles: (limit = 4) => request<ExplorerProfileApi[]>(`/explorer/profiles?limit=${limit}`),
};

export type OrderStatus = "PENDING" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELED";

export type NegotiationStatus = "PENDING" | "ACCEPTED" | "REFUSED" | "EXPIRED" | "COUNTERED";

export type CartSummary = {
  id: string;
  status: "OPEN" | "CHECKED_OUT" | "ABANDONED";
  currency: string;
  subtotalUsdCents: number;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    listingId: string;
    quantity: number;
    unitPriceUsdCents: number;
    lineTotalUsdCents: number;
    negotiationId: string | null;
    negotiationStatus: NegotiationStatus | null;
    originalPriceUsdCents: number;
    itemState: "COMMANDE" | "MARCHANDAGE";
    listing: {
      id: string;
      type: string;
      title: string;
      category: string;
      city: string;
      imageUrl: string | null;
      isNegotiable?: boolean;
      owner: {
        userId: string;
        displayName: string;
        businessId: string | null;
        businessPublicName: string | null;
        businessSlug: string | null;
      };
    };
  }>;
};

export type OrderSummary = {
  id: string;
  status: OrderStatus;
  currency: string;
  totalUsdCents: number;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  buyer: {
    userId: string;
    displayName: string;
    username: string | null;
  };
  seller: {
    userId: string;
    displayName: string;
    username: string | null;
    businessId: string | null;
    businessPublicName: string | null;
    businessSlug: string | null;
  };
  itemsCount: number;
  items: Array<{
    id: string;
    listingId: string | null;
    listingType: string;
    title: string;
    category: string;
    city: string;
    quantity: number;
    unitPriceUsdCents: number;
    lineTotalUsdCents: number;
  }>;
};

export const orders = {
  buyerCart: () => request<CartSummary>("/orders/buyer/cart"),
  addCartItem: async (body: { listingId: string; quantity?: number; unitPriceUsdCents?: number }) => {
    const result = await request<CartSummary>("/orders/buyer/cart/items", { method: "POST", body });
    invalidateCache("/orders/buyer/cart");
    return result;
  },
  updateCartItem: async (itemId: string, body: { quantity?: number; unitPriceUsdCents?: number }) => {
    const result = await request<CartSummary>(`/orders/buyer/cart/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body });
    invalidateCache("/orders/buyer/cart");
    return result;
  },
  removeCartItem: async (itemId: string) => {
    const result = await request<CartSummary>(`/orders/buyer/cart/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
    invalidateCache("/orders/buyer/cart");
    return result;
  },
  checkoutBuyerCart: async (body?: { notes?: string }) => {
    const result = await request<{ message: string; orders: OrderSummary[] }>("/orders/buyer/checkout", { method: "POST", body });
    invalidateCache("/orders/");
    return result;
  },
  buyerOrders: (params?: { page?: number; limit?: number; status?: OrderStatus; inProgressOnly?: boolean }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; orders: OrderSummary[] }>("/orders/buyer/orders", {
      params: params
        ? {
            page: params.page,
            limit: params.limit,
            status: params.status,
            inProgressOnly: params.inProgressOnly === undefined ? undefined : (params.inProgressOnly ? "true" : "false")
          }
        : undefined
    }),
  sellerOrders: (params?: { page?: number; limit?: number; status?: OrderStatus; inProgressOnly?: boolean }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; orders: OrderSummary[] }>("/orders/seller/orders", {
      params: params
        ? {
            page: params.page,
            limit: params.limit,
            status: params.status,
            inProgressOnly: params.inProgressOnly === undefined ? undefined : (params.inProgressOnly ? "true" : "false")
          }
        : undefined
    }),
  detail: (orderId: string) => request<OrderSummary>(`/orders/${encodeURIComponent(orderId)}`),
  updateSellerOrderStatus: async (orderId: string, body: { status: OrderStatus }) => {
    const result = await request<OrderSummary>(`/orders/${encodeURIComponent(orderId)}/status`, { method: "PATCH", body });
    invalidateCache("/orders/");
    return result;
  },
  getValidationCode: (orderId: string) =>
    request<{ validationCode: string }>(`/orders/${encodeURIComponent(orderId)}/validation-code`),
  buyerConfirmDelivery: async (orderId: string, body: { code: string }) => {
    const result = await request<OrderSummary>(`/orders/${encodeURIComponent(orderId)}/buyer-confirm`, { method: "POST", body });
    invalidateCache("/orders/");
    return result;
  }
};

// ── Billing ──
export type BillingPlanSummary = {
  id: string | null;
  scope: "USER" | "BUSINESS";
  planCode: string;
  planName: string;
  analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
  priceUsdCents: number;
  status: "ACTIVE" | "CANCELED" | "EXPIRED";
  billingCycle: "MONTHLY" | "ONE_TIME";
  startsAt: string | null;
  endsAt: string | null;
  features: string[];
  addOns: Array<{
    code: string;
    status: string;
    priceUsdCents: number;
    startsAt: string;
    endsAt: string | null;
  }>;
};

export const billing = {
  catalog: () => request<{
    userPlans: Array<{
      code: string;
      name: string;
      scope: "USER" | "BUSINESS";
      monthlyPriceUsdCents: number;
      features: string[];
      analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
    }>;
    businessPlans: Array<{
      code: string;
      name: string;
      scope: "USER" | "BUSINESS";
      monthlyPriceUsdCents: number;
      features: string[];
      analyticsTier: "NONE" | "MEDIUM" | "PREMIUM";
    }>;
    addOns: Array<{
      code: "IA_MERCHANT" | "IA_ORDER" | "BOOST_VISIBILITY" | "ADS_PACK" | "ADS_PREMIUM";
      name: string;
      priceLabel: string;
      scope: "ALL" | "USER" | "BUSINESS";
      details: string[];
    }>;
    analyticsRule: string;
  }>("/billing/catalog"),
  myPlan: () => request<BillingPlanSummary>("/billing/my-plan"),
  createBankTransferCheckout: (body: { planCode: string; billingCycle?: "MONTHLY" | "ONE_TIME" }) =>
    request<{
      orderId: string;
      status: string;
      planCode: string;
      amountUsdCents: number;
      currency: string;
      transferReference: string;
      beneficiary: {
        iban: string;
        bic: string;
        rib?: string | null;
      };
      expiresAt: string;
      instructions: string[];
    }>("/billing/checkout/bank-transfer", { method: "POST", body }),
  createPaypalCheckout: (body: { planCode: string; billingCycle?: "MONTHLY" | "ONE_TIME" }) =>
    request<{
      orderId: string;
      status: string;
      planCode: string;
      amountUsdCents: number;
      currency: string;
      transferReference: string;
      paymentUrl: string;
      expiresAt: string;
      instructions: string[];
    }>("/billing/checkout/paypal", { method: "POST", body }),
  createMobileMoneyCheckout: (body: {
    planCode: string;
    billingCycle?: "MONTHLY" | "ONE_TIME";
    provider: "ORANGE_MONEY" | "MPESA";
    phoneNumber: string;
    amountCDF: number;
  }) =>
    request<{
      paymentOrder: { orderId: string; planCode: string; amountUsdCents: number };
      mobileMoney: { paymentId: string; provider: string; status: string; redirectUrl?: string; message?: string };
    }>("/billing/checkout/mobile-money", { method: "POST", body }),
  paymentOrders: () => request<{ orders: Array<{
    id: string;
    planCode: string;
    amountUsdCents: number;
    currency: string;
    status: string;
    transferReference: string;
    createdAt: string;
    expiresAt: string;
    depositorNote?: string | null;
    proofUrl?: string | null;
  }> }>("/billing/payment-orders"),
  confirmDeposit: (body: { orderId: string; depositorNote?: string; proofUrl?: string }) =>
    request<{ orderId: string; status: string; message: string }>("/billing/payment-orders/confirm-deposit", { method: "POST", body }),
  capturePaypalCheckout: (body: { orderId: string }) =>
    request<{ plan: BillingPlanSummary; message: string }>("/billing/paypal/capture", { method: "POST", body }),
  activateOrder: (body: { orderId: string }) =>
    request<{ plan: BillingPlanSummary; message: string }>("/billing/payment-orders/activate", { method: "POST", body }),
  changePlan: (body: { planCode: string; billingCycle?: "MONTHLY" | "ONE_TIME" }) =>
    request<BillingPlanSummary>("/billing/subscription/simulate-change", { method: "POST", body }),
  toggleAddon: (body: { addonCode: "IA_MERCHANT" | "IA_ORDER" | "BOOST_VISIBILITY" | "ADS_PACK" | "ADS_PREMIUM"; action: "ENABLE" | "DISABLE"; monthlyPriceUsdCents?: number }) =>
    request<BillingPlanSummary>("/billing/addons/simulate", { method: "POST", body })
};

// ── Health ──
export const health = () => request<{ status: string }>("/health");

// ── Messaging ──

export type MessageUser = {
  id: string;
  role?: string;
  profile: { displayName: string; avatarUrl: string | null; username: string | null };
};

export type ConversationParticipant = {
  id: string;
  conversationId: string;
  userId: string;
  lastReadAt: string;
  isAdmin: boolean;
  muted: boolean;
  user: MessageUser;
};

export type MessageReplyTo = {
  id: string;
  content: string | null;
  type: string;
  sender: { profile: { displayName: string } };
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "FILE" | "SYSTEM";
  content: string | null;
  mediaUrl: string | null;
  fileName: string | null;
  replyToId: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  sender: MessageUser;
  replyTo: MessageReplyTo | null;
  readReceipts: Array<{ userId: string; readAt: string }>;
};

export type ConversationSummary = {
  id: string;
  isGroup: boolean;
  groupName: string | null;
  groupAvatar: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ConversationParticipant[];
  messages: ChatMessage[];
  unreadCount: number;
};

export const messaging = {
  conversations: () =>
    request<{ conversations: ConversationSummary[] }>("/messaging/conversations"),

  createDM: (targetUserId: string) =>
    request<{ conversation: ConversationSummary }>("/messaging/conversations/dm", { method: "POST", body: { targetUserId } }),

  createGroup: (memberIds: string[], groupName: string) =>
    request<{ conversation: ConversationSummary }>("/messaging/conversations/group", { method: "POST", body: { memberIds, groupName } }),

  messages: (conversationId: string, cursor?: string) =>
    request<{ messages: ChatMessage[] }>(`/messaging/conversations/${conversationId}/messages`, { params: { cursor, limit: 50 } }),

  sendMessage: (conversationId: string, body: { content?: string; type?: string; mediaUrl?: string; fileName?: string; replyToId?: string }) =>
    request<{ message: ChatMessage }>(`/messaging/conversations/${conversationId}/messages`, { method: "POST", body }),

  editMessage: (messageId: string, content: string) =>
    request<{ message: ChatMessage }>(`/messaging/messages/${messageId}`, { method: "PATCH", body: { content } }),

  deleteMessage: (messageId: string) =>
    request<{ ok: boolean }>(`/messaging/messages/${messageId}`, { method: "DELETE" }),

  markRead: (conversationId: string) =>
    request<{ ok: boolean }>(`/messaging/conversations/${conversationId}/read`, { method: "POST" }),

  searchUsers: (q: string) =>
    request<{ users: Array<{ id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null; city: string | null } }> }>("/messaging/users/search", { params: { q } }),

  callLogs: (cursor?: string) =>
    request<{ callLogs: CallLogEntry[] }>("/messaging/call-logs", { params: cursor ? { cursor } : {} }),
};

export type CallLogEntry = {
  id: string;
  conversationId: string;
  callerUserId: string;
  receiverUserId: string;
  callType: "AUDIO" | "VIDEO";
  status: "MISSED" | "ANSWERED" | "REJECTED" | "NO_ANSWER";
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  caller: { id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null } };
  receiver: { id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null } };
};

// ── Negotiations ──

export type NegotiationOfferSummary = {
  id: string;
  fromUserId: string;
  priceUsdCents: number;
  quantity: number;
  message: string | null;
  createdAt: string;
  fromDisplayName: string;
};

export type NegotiationSummary = {
  id: string;
  buyerUserId: string;
  sellerUserId: string;
  listingId: string;
  type: "SIMPLE" | "QUANTITY" | "GROUPED";
  status: NegotiationStatus;
  originalPriceUsdCents: number;
  finalPriceUsdCents: number | null;
  quantity: number;
  groupId: string | null;
  minBuyers: number | null;
  groupCurrentBuyers: number | null;
  bundleId: string | null;
  expiresAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  listing: {
    id: string;
    type: string;
    title: string;
    category: string;
    city: string;
    imageUrl: string | null;
    priceUsdCents: number;
  } | null;
  buyer: { userId: string; displayName: string };
  seller: { userId: string; displayName: string };
  offers: NegotiationOfferSummary[];
};

export type GroupNegotiationSummary = {
  groupId: string;
  listingId: string;
  listing: {
    id: string;
    type: string;
    title: string;
    category: string;
    city: string;
    imageUrl: string | null;
    priceUsdCents: number;
  } | null;
  minBuyers: number;
  currentBuyers: number;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
};

export type GroupDetailSummary = {
  groupId: string;
  listingId: string;
  minBuyers: number;
  currentBuyers: number;
  expiresAt: string;
  status: NegotiationStatus;
  participants: NegotiationSummary[];
};

export type BundleItemSummary = {
  listingId: string;
  quantity: number;
  listing: {
    id: string;
    type: string;
    title: string;
    category: string;
    city: string;
    imageUrl: string | null;
    priceUsdCents: number;
  } | null;
};

export type BundleNegotiationResult = NegotiationSummary & {
  bundle: {
    id: string;
    totalOriginalUsdCents: number;
    items: BundleItemSummary[];
  };
};

export type BundleDetailSummary = {
  id: string;
  totalOriginalUsdCents: number;
  createdAt: string;
  creator: string;
  seller: string;
  items: BundleItemSummary[];
  negotiations: NegotiationSummary[];
};

export const negotiations = {
  create: async (body: { listingId: string; proposedPriceUsdCents: number; quantity?: number; message?: string; type?: "SIMPLE" | "QUANTITY" | "GROUPED"; minBuyers?: number }) => {
    const result = await request<NegotiationSummary>("/negotiations", { method: "POST", body });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  buyerList: (params?: { page?: number; limit?: number; status?: NegotiationStatus }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; negotiations: NegotiationSummary[] }>("/negotiations/buyer", { params }),

  sellerList: (params?: { page?: number; limit?: number; status?: NegotiationStatus }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; negotiations: NegotiationSummary[] }>("/negotiations/seller", { params }),

  detail: (negotiationId: string) =>
    request<NegotiationSummary>(`/negotiations/${encodeURIComponent(negotiationId)}`),

  respond: async (negotiationId: string, body: { action: "ACCEPT" | "REFUSE" | "COUNTER"; counterPriceUsdCents?: number; message?: string }) => {
    const result = await request<NegotiationSummary>(`/negotiations/${encodeURIComponent(negotiationId)}/respond`, { method: "POST", body });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  cancel: async (negotiationId: string) => {
    const result = await request<NegotiationSummary>(`/negotiations/${encodeURIComponent(negotiationId)}`, { method: "DELETE" });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  listOpenGroups: (params?: { listingId?: string; page?: number; limit?: number }) =>
    request<{ page: number; limit: number; total: number; totalPages: number; groups: GroupNegotiationSummary[] }>("/negotiations/groups", { params }),

  groupDetails: (groupId: string) =>
    request<GroupDetailSummary>(`/negotiations/groups/${encodeURIComponent(groupId)}`),

  joinGroup: async (groupId: string, body: { proposedPriceUsdCents: number; quantity?: number; message?: string }) => {
    const result = await request<NegotiationSummary>(`/negotiations/groups/${encodeURIComponent(groupId)}/join`, { method: "POST", body });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  createBundle: async (body: { items: { listingId: string; quantity: number }[]; proposedTotalUsdCents: number; message?: string; type?: "SIMPLE" | "QUANTITY" | "GROUPED"; minBuyers?: number }) => {
    const result = await request<BundleNegotiationResult>("/negotiations/bundle", { method: "POST", body });
    invalidateCache("/negotiations/");
    invalidateCache("/orders/buyer/cart");
    return result;
  },

  bundleDetails: (bundleId: string) =>
    request<BundleDetailSummary>(`/negotiations/bundle/${encodeURIComponent(bundleId)}`),
};

export { getToken, setToken, clearToken, getRefreshToken, setRefreshToken, setSessionId, clearAuthSession, ApiError };

// ══════════════════════════════════════════════
// SECURITY ADMIN TYPES
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
// ADMIN API
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
  excerpt: string | null;
  coverImage: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  author: string;
};

export type PublicBlogPost = {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  coverImage: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  publishedAt: string | null;
  createdAt: string;
  author: string;
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
  domain: string;
  description: string | null;
  action: string | null;
  level: string;
  enabled: boolean;
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

// ── Feed (So-Kin) ──
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

// ── Advertisements (bannières publicitaires) ──
export type AdvertisementItem = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string;
  ctaText: string;
  type: string;
  status: string;
  targetPages: string[];
  impressions: number;
  clicks: number;
  priority: number;
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

export const adsApi = {
  getBanner: (page: string) =>
    request<{ ad: AdvertisementItem | null }>(`/ads/banner?page=${encodeURIComponent(page)}`),
  recordImpression: (id: string) =>
    request<{ ok: boolean }>(`/ads/${encodeURIComponent(id)}/impression`, { method: 'POST' }),
  recordClick: (id: string) =>
    request<{ ok: boolean }>(`/ads/${encodeURIComponent(id)}/click`, { method: 'POST' }),
};

// ── So-Kin ──
export type SoKinApiPost = {
  id: string;
  authorId: string;
  text: string;
  mediaUrls: string[];
  likes: number;
  comments: number;
  shares: number;
  status: 'ACTIVE' | 'HIDDEN' | 'FLAGGED' | 'DELETED';
  createdAt: string;
  updatedAt: string;
};

export type SoKinReactionType = 'LIKE' | 'LOVE' | 'HAHA' | 'WOW' | 'SAD' | 'ANGRY';

export type SoKinApiFeedPost = SoKinApiPost & {
  author: {
    id: string;
    profile: {
      username: string | null;
      displayName: string;
      avatarUrl: string | null;
      city: string | null;
    } | null;
  };
  reactionCounts: Partial<Record<SoKinReactionType, number>>;
  myReaction: SoKinReactionType | null;
};

export type SoKinPublicUser = {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  domain: string | null;
  qualification: string | null;
  verificationStatus: string;
};

export type SoKinStory = {
  id: string;
  authorId: string;
  author: {
    id: string;
    profile: {
      username: string | null;
      displayName: string;
      avatarUrl: string | null;
    } | null;
  };
  mediaUrl: string | null;
  mediaType: 'IMAGE' | 'VIDEO' | 'TEXT';
  caption: string | null;
  bgColor: string | null;
  viewCount: number;
  viewedByMe: boolean;
  expiresAt: string;
  createdAt: string;
};

export const sokin = {
  myPosts: () =>
    request<{ posts: SoKinApiPost[] }>('/sokin/posts/mine'),
  createPost: (body: { text: string; mediaUrls?: string[]; location?: string; tags?: string[]; hashtags?: string[] }) =>
    request<SoKinApiPost>('/sokin/posts', { method: 'POST', body }),
  archivePost: (id: string) =>
    request<SoKinApiPost>(`/sokin/posts/${encodeURIComponent(id)}/archive`, { method: 'PATCH' }),
  deletePost: (id: string) =>
    request<{ success: boolean }>(`/sokin/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  publicFeed: (limit?: number) =>
    request<{ posts: SoKinApiFeedPost[] }>('/sokin/posts', {
      params: limit ? { limit } : undefined,
    }),
  publicUsers: (params?: { city?: string; search?: string }) =>
    request<{ users: SoKinPublicUser[] }>('/sokin/users', {
      params: params as Record<string, string | undefined>,
    }),
  reactToPost: (id: string, type: SoKinReactionType) =>
    request<{ ok: boolean; type: string }>(`/sokin/posts/${encodeURIComponent(id)}/react`, { method: 'POST', body: { type } }),
  unreactToPost: (id: string) =>
    request<{ ok: boolean }>(`/sokin/posts/${encodeURIComponent(id)}/react`, { method: 'DELETE' }),
  stories: () =>
    request<{ stories: SoKinStory[] }>('/sokin/stories'),
  createStory: (body: { mediaUrl?: string; mediaType?: 'IMAGE' | 'VIDEO' | 'TEXT'; caption?: string; bgColor?: string }) =>
    request<SoKinStory>('/sokin/stories', { method: 'POST', body }),
  viewStory: (id: string) =>
    request<{ ok: boolean }>(`/sokin/stories/${encodeURIComponent(id)}/view`, { method: 'POST' }),
  deleteStory: (id: string) =>
    request<{ ok: boolean }>(`/sokin/stories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ── So-Kin Live ──

export type SoKinLiveProfile = {
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  city?: string | null;
};

export type SoKinLiveData = {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  replayUrl?: string | null;
  aspect: 'LANDSCAPE' | 'PORTRAIT';
  status: 'WAITING' | 'LIVE' | 'ENDED' | 'CANCELED';
  viewerCount: number;
  peakViewers: number;
  likesCount: number;
  giftsCount: number;
  featuredListingId?: string | null;
  featuredListing?: {
    id: string;
    title: string;
    priceUsdCents: number;
    city: string;
    imageUrl: string | null;
    type: 'PRODUIT' | 'SERVICE';
  } | null;
  tags: string[];
  city: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  host: { id?: string; profile: SoKinLiveProfile | null };
  participants?: {
    id: string;
    userId: string;
    role: string;
    user: { id?: string; profile: SoKinLiveProfile | null };
  }[];
};

export type SoKinLiveChatMsg = {
  id: string;
  liveId: string;
  userId: string;
  text: string;
  isGift: boolean;
  giftType: string | null;
  isPinned: boolean;
  createdAt: string;
  user: { id?: string; profile: SoKinLiveProfile | null };
};

export const sokinLive = {
  list: (limit?: number) =>
    request<{ lives: SoKinLiveData[] }>('/sokin/lives', {
      params: limit ? { limit } : undefined,
    }),
  history: (limit?: number) =>
    request<{ lives: SoKinLiveData[] }>('/sokin/lives/history', {
      params: limit ? { limit } : undefined,
    }),
  get: (id: string) =>
    request<SoKinLiveData>(`/sokin/lives/${encodeURIComponent(id)}`),
  create: (body: { title: string; description?: string; aspect: 'LANDSCAPE' | 'PORTRAIT'; tags?: string[]; city?: string }) =>
    request<SoKinLiveData>('/sokin/lives', { method: 'POST', body }),
  start: (id: string) =>
    request<SoKinLiveData>(`/sokin/lives/${encodeURIComponent(id)}/start`, { method: 'PATCH' }),
  end: (id: string) =>
    request<SoKinLiveData>(`/sokin/lives/${encodeURIComponent(id)}/end`, { method: 'PATCH' }),
  join: (id: string) =>
    request<{ id: string }>(`/sokin/lives/${encodeURIComponent(id)}/join`, { method: 'POST' }),
  leave: (id: string) =>
    request<{ success: boolean }>(`/sokin/lives/${encodeURIComponent(id)}/leave`, { method: 'POST' }),
  requestGuest: (id: string) =>
    request<{ id: string; role: string }>(`/sokin/lives/${encodeURIComponent(id)}/request-guest`, { method: 'POST' }),
  chat: (id: string, limit?: number) =>
    request<{ messages: SoKinLiveChatMsg[] }>(`/sokin/lives/${encodeURIComponent(id)}/chat`, {
      params: limit ? { limit } : undefined,
    }),
  sendChat: (id: string, body: { text: string; isGift?: boolean; giftType?: string }) =>
    request<SoKinLiveChatMsg>(`/sokin/lives/${encodeURIComponent(id)}/chat`, { method: 'POST', body }),
  like: (id: string) =>
    request<{ likesCount: number }>(`/sokin/lives/${encodeURIComponent(id)}/like`, { method: 'POST' }),
  myListings: (id: string) =>
    request<{ listings: Array<{ id: string; title: string; priceUsdCents: number; city: string; imageUrl: string | null; type: 'PRODUIT' | 'SERVICE' }> }>(`/sokin/lives/${encodeURIComponent(id)}/my-listings`),
  setFeaturedListing: (id: string, listingId: string | null) =>
    request<SoKinLiveData>(`/sokin/lives/${encodeURIComponent(id)}/featured-listing`, { method: 'PATCH', body: { listingId } }),
};

export const blog = {
  publicPosts: (params?: { page?: number; limit?: number }) =>
    request<{ total: number; page: number; totalPages: number; posts: PublicBlogPost[] }>("/blog", {
      params: params as Record<string, string | number | undefined>,
    }),
};

// ── Géolocalisation ──
export type PlacePrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type GeocodingResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city: string | null;
  country: string | null;
};

export const geo = {
  autocomplete: (input: string, sessionToken?: string) =>
    request<{ predictions: PlacePrediction[] }>("/geo/autocomplete", {
      params: { input, ...(sessionToken ? { sessionToken } : {}) },
    }),
  placeDetails: (placeId: string, sessionToken?: string) =>
    request<GeocodingResult>(`/geo/place/${encodeURIComponent(placeId)}`, {
      params: sessionToken ? { sessionToken } : undefined,
    }),
  geocode: (address: string) =>
    request<GeocodingResult>("/geo/geocode", { params: { address } }),
  reverse: (lat: number, lng: number) =>
    request<GeocodingResult>("/geo/reverse", { params: { lat, lng } }),
};

// ── IA Marchand (Negotiation AI) ──

export type BuyerNegotiationHint = {
  suggestedPrice: number;
  successRate: number;
  marketContext: { avgPriceCents: number; medianPriceCents: number; totalListings: number };
  messageSuggestion: string;
};

export type SellerNegotiationAdvice = {
  recommendation: "ACCEPT" | "COUNTER" | "REFUSE";
  counterSuggestionUsdCents: number | null;
  marginImpact: {
    originalPriceUsdCents: number;
    proposedPriceUsdCents: number;
    discountPercent: number;
  };
  conversionProbability: number;
  buyerProfile: {
    trustLevel: "LOW" | "MEDIUM" | "HIGH";
    previousPurchases: number;
    isRepeatBuyer: boolean;
  };
  insight: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
};

export type AutoRespondRules = {
  enabled: boolean;
  minFloorPercent?: number;
  maxAutoDiscountPercent?: number;
  preferredCounterPercent?: number;
  prioritizeSpeed?: boolean;
  stockUrgencyBoost?: boolean;
};

export type AutoRespondDecision = {
  action: "ACCEPT" | "COUNTER" | "REFUSE";
  counterPrice?: number;
  reasoning: string;
};

export const negotiationAi = {
  buyerHint: (listingId: string, proposedPrice?: number) =>
    request<BuyerNegotiationHint>(`/negotiations/ai/hint/${encodeURIComponent(listingId)}`, {
      params: proposedPrice ? { proposedPrice } : undefined,
    }),
  sellerAdvice: (negotiationId: string) =>
    request<SellerNegotiationAdvice>(`/negotiations/${encodeURIComponent(negotiationId)}/ai-advice/seller`),
  autoRespond: (negotiationId: string, rules: AutoRespondRules) =>
    request<AutoRespondDecision>(`/negotiations/${encodeURIComponent(negotiationId)}/ai-auto-respond`, {
      method: "POST",
      body: rules,
    }),
};

// ── IA Commande (Order AI) ──

export type CheckoutAdvice = {
  bundles: Array<{ title: string; discount: number; savingsCents: number }>;
  urgency: { active: boolean; message: string } | null;
  shippingEstimate: { minDays: number; maxDays: number; city: string } | null;
  tips: string[];
};

export type AbandonmentRisk = {
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskScore: number;
  suggestions: string[];
  cartAge: string;
};

export const orderAi = {
  checkoutAdvice: (cartId: string) =>
    request<CheckoutAdvice>(`/orders/ai/checkout-advice/${encodeURIComponent(cartId)}`),
  abandonmentRisk: () =>
    request<AbandonmentRisk>("/orders/ai/abandonment-risk"),
};

// ── Kin-Sell Analytique ──

export type BasicInsights = {
  activitySummary: { listings: number; negotiations: number; orders: number; revenueCents: number };
  marketPosition: { avgPriceCents: number; medianCents: number; position: "BELOW_MARKET" | "ON_MARKET" | "ABOVE_MARKET" };
  trendingCategories: Array<{ category: string; count: number }>;
  bestPublicationHour: number | null;
  recommendations: string[];
};

export type DeepInsights = {
  funnel: { views: number; negotiations: number; orders: number; conversionRate: number };
  audienceSegments: Array<{ label: string; percent: number }>;
  velocityMetrics: { avgDaysToSell: number; fastestCategory: string | null };
  predictiveScores: { churnRisk: number; growthPotential: number };
};

export type DiagnosticReport = {
  overallScore: number;
  issues: Array<{ type: string; severity: "LOW" | "MEDIUM" | "HIGH"; agent: string; action: string; endpoint: string }>;
  prioritizedActions: string[];
  agentSummary: Array<{ agentName: string; status: string; reason: string }>;
};

export type MemoryReport = {
  currentMetrics: Record<string, number>;
  anomalies: Array<{ metric: string; change: number; severity: string }>;
  trends: Array<{ metric: string; direction: "UP" | "DOWN" | "STABLE"; delta: number }>;
  predictions: Array<{ metric: string; predicted: number; confidence: number }>;
  historicalComparison: { vsLastWeek: Record<string, number>; vsLastMonth: Record<string, number> };
};

export const analyticsAi = {
  basic: () => request<BasicInsights>("/analytics/ai/basic"),
  deep: () => request<DeepInsights>("/analytics/ai/deep"),
  diagnostic: () => request<DiagnosticReport>("/analytics/ai/diagnostic"),
  memory: () => request<MemoryReport>("/analytics/ai/memory"),
};

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
  blogPosts: (params?: { page?: number; limit?: number; status?: string }) =>
    request<{ total: number; page: number; totalPages: number; posts: AdminBlogPost[] }>("/admin/blog", { params: params as Record<string, string | number | undefined> }),
  createBlogPost: (body: { title: string; content: string; excerpt?: string; coverImage?: string; mediaUrl?: string; mediaType?: string; status?: string }) =>
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

  // AI Agents
  aiAgents: () => request<AdminAiAgent[]>("/admin/ai-agents"),
  updateAiAgent: (id: string, body: { enabled?: boolean; level?: string }) =>
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
};
