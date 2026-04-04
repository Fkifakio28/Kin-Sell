/**
 * Kin-Sell API Client — Core Infrastructure
 * Cache, token management, request pipeline, error handling.
 * Domain services import from this module.
 */
import { SK_ACCESS_TOKEN, SK_REFRESH_TOKEN, SK_SESSION_ID } from "../shared/constants/storage-keys";

export const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

/**
 * Résout une URL média relative (/uploads/...) en URL absolue pointant vers l'API.
 * Les URLs déjà absolues (http/https/data:) sont retournées telles quelles.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("/uploads/")) return `${API_BASE}${url}`;
  return url;
}

const ACCESS_TOKEN_KEY = SK_ACCESS_TOKEN;
const REFRESH_TOKEN_KEY = SK_REFRESH_TOKEN;
const SESSION_ID_KEY = SK_SESSION_ID;

// ── In-memory GET cache ──────────────────────────────────────────────────────
type CacheEntry = { data: unknown; expiresAt: number };
const _memCache = new Map<string, CacheEntry>();
const _pendingGets = new Map<string, Promise<unknown>>();

function _cacheKey(url: string): string {
  const tok = localStorage.getItem(ACCESS_TOKEN_KEY);
  return `${tok ? tok.slice(-10) : "anon"}:${url}`;
}

function _cacheTtl(path: string): number {
  if (path.startsWith("/explorer")) return 120_000;   // 2 min — données publiques stables
  if (path.startsWith("/listings")) return 90_000;     // 90s — listings changent modérément
  if (path.startsWith("/orders") || path.startsWith("/negotiations")) return 20_000;
  if (path.startsWith("/account/me")) return 60_000;
  if (path.startsWith("/billing")) return 120_000;     // Plans changent rarement
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
  if (_memCache.size > 150) {
    const now = Date.now();
    for (const [k, v] of _memCache.entries()) {
      if (v.expiresAt < now) _memCache.delete(k);
    }
    if (_memCache.size > 100) {
      const sorted = [..._memCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      for (let i = 0; i < sorted.length - 80; i++) _memCache.delete(sorted[i][0]);
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

// ── Background Sync: queue failed mutating requests for retry ──────────────
async function queueForBackgroundSync(url: string, method: string, headers: Record<string, string>, body: unknown): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg?.active) return;

  reg.active.postMessage({
    type: "QUEUE_REQUEST",
    url,
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if ("sync" in reg) {
    await (reg as any).sync.register("kin-sell-background-sync").catch(() => {});
  }
}

// ── Token Management ─────────────────────────────────────────────────────────
export function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function setSessionId(sessionId: string): void {
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

export function clearToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(SESSION_ID_KEY);
}

// ── Core Types ───────────────────────────────────────────────────────────────
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

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string | number | undefined>;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Refresh Logic ────────────────────────────────────────────────────────────
let _refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    const res = await fetch(`${API_BASE}/account/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    });

    if (!res.ok) {
      clearAuthSession();
      return false;
    }

    const data = (await res.json()) as { accessToken: string; refreshToken: string; sessionId: string };
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    setSessionId(data.sessionId);
    return true;
  })();

  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

// ── Proactive Token Refresh ──────────────────────────────────────────────────
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

function getTokenExpMs(): number | null {
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch { /* malformed token */ }
  return null;
}

export function scheduleTokenRefresh(onSessionLost?: () => void): () => void {
  clearScheduledRefresh();

  const schedule = () => {
    const expMs = getTokenExpMs();
    if (!expMs) return;
    // Refresh at 75% of TTL (e.g. 11 min 15 s for a 15 min token)
    const now = Date.now();
    const ttl = expMs - now;
    if (ttl <= 0) {
      // Already expired — attempt immediate refresh
      void refreshAccessToken().then((ok) => {
        if (ok) schedule();
        else onSessionLost?.();
      });
      return;
    }
    const delay = Math.max(ttl * 0.75, 10_000); // at least 10 s
    _refreshTimer = setTimeout(async () => {
      const ok = await refreshAccessToken();
      if (ok) {
        schedule(); // re-schedule for next cycle
      } else {
        onSessionLost?.();
      }
    }, delay);
  };

  schedule();

  // Also refresh when tab becomes visible after being hidden
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      const expMs = getTokenExpMs();
      if (expMs && expMs - Date.now() < 60_000) {
        // Less than 1 min remaining — refresh now
        void refreshAccessToken().then((ok) => {
          if (ok) schedule();
          else onSessionLost?.();
        });
      } else {
        schedule();
      }
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    clearScheduledRefresh();
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

export function clearScheduledRefresh(): void {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer);
    _refreshTimer = null;
  }
}

// ── Core Request ─────────────────────────────────────────────────────────────
export async function request<T>(path: string, opts: RequestOptions = {}, allowRefresh = true): Promise<T> {
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
    if (_pendingGets.has(ck)) return (await _pendingGets.get(ck)) as T;
  }

  const token = getToken();
  const reqHeaders: Record<string, string> = { ...headers };
  if (token) reqHeaders["Authorization"] = `Bearer ${token}`;
  if (body) reqHeaders["Content-Type"] = "application/json";

  const cacheKey = method === "GET" ? _cacheKey(url) : null;
  const fetchWork = (async (): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: reqHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (method !== "GET" && !navigator.onLine) {
        void queueForBackgroundSync(url, method, reqHeaders, body);
      }
      throw err;
    }

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

    if (method === "GET") {
      _cacheSet(_cacheKey(url), result, _cacheTtl(path));
    }

    return result;
  })();

  if (cacheKey) _pendingGets.set(cacheKey, fetchWork);
  try {
    return await fetchWork;
  } finally {
    if (cacheKey) _pendingGets.delete(cacheKey);
  }
}

// ── Health ──
export const health = () => request<{ status: string }>("/health");
