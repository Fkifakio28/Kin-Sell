/**
 * Kin-Sell API Client — Core Infrastructure
 * Token management, request pipeline, error handling.
 * Domain services import from this module.
 */
import { SK_ACCESS_TOKEN, SK_REFRESH_TOKEN, SK_SESSION_ID } from "../shared/constants/storage-keys";

export const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

/**
 * Résout une URL média relative (/uploads/...) en URL absolue pointant vers l'API.
 * Les URLs déjà absolues (http/https/data:) sont retournées telles quelles.
 */
function joinWithApiBase(path: string): string {
  const base = API_BASE.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base.startsWith("http://") || base.startsWith("https://")) {
    const parsedBase = new URL(base);
    const basePath = parsedBase.pathname.replace(/\/+$/, "");
    let finalPath = normalizedPath;

    // Legacy media URLs are often stored as /api/uploads/...
    // If API_BASE already points to api subdomain root (without /api),
    // we must drop that prefix to reach the real backend static route /uploads.
    if (finalPath.startsWith("/api/uploads/") && basePath !== "/api") {
      finalPath = finalPath.slice(4);
    }

    // When API_BASE itself ends with /api, avoid duplicating /api.
    if (basePath === "/api" && finalPath.startsWith("/api/")) {
      finalPath = finalPath.slice(4);
    }

    return `${parsedBase.origin}${basePath}${finalPath}`;
  }

  if (base === "/api" && normalizedPath.startsWith("/api/")) return normalizedPath;
  return `${base}${normalizedPath}`;
}

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("/uploads/") || url.startsWith("/api/uploads/")) return joinWithApiBase(url);
  return url;
}

const ACCESS_TOKEN_KEY = SK_ACCESS_TOKEN;
const REFRESH_TOKEN_KEY = SK_REFRESH_TOKEN;
const SESSION_ID_KEY = SK_SESSION_ID;

/** Invalide le cache pour un préfixe de chemin donné */
export function invalidateCache(pathPrefix: string): void {
  void pathPrefix;
}

/** Invalide le cache pour plusieurs préfixes d'un coup */
export function invalidateCaches(...prefixes: string[]): void {
  for (const p of prefixes) invalidateCache(p);
}

/** Vide tout le cache (ex: à la déconnexion) */
export function clearCache(): void {
  // Cache applicatif supprimé: le cache HTTP/serveur reste la source unique.
}

/**
 * Mutation helper : exécute un POST/PATCH/PUT/DELETE puis invalide les caches concernés.
 * Évite d'oublier l'invalidation dans chaque service.
 */
export async function mutate<T>(
  path: string,
  opts: RequestOptions,
  invalidatePrefixes: string[],
): Promise<T> {
  const result = await request<T>(path, opts);
  for (const prefix of invalidatePrefixes) invalidateCache(prefix);
  return result;
}

// ── Token Management ─────────────────────────────────────────────────────────
// With httpOnly cookies, tokens are managed server-side.
// These functions are kept for backward-compatibility (migration cleanup)
// and will read/clear the legacy localStorage values.

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
  suspensionExpiresAt?: string | null;
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
  /** AbortSignal pour annuler la requête (ex: cleanup useEffect) */
  signal?: AbortSignal;
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

/**
 * Refresh the access token using the httpOnly refresh cookie.
 * Exported so SocketProvider can force a refresh before reconnecting.
 */
export async function refreshSession(): Promise<boolean> {
  return refreshAccessToken();
}

async function refreshAccessToken(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    // Retry 2 fois avec backoff (réseau instable 2G/3G)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
      try {
        const res = await fetch(`${API_BASE}/account/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          clearAuthSession();
          return true;
        }
        // 401/403 = session vraiment expirée, pas la peine de retry
        if (res.status === 401 || res.status === 403) break;
        // 5xx = retry
        if (res.status >= 500) continue;
        break;
      } catch (err) {
        // Erreur réseau → retry
        if (attempt === 2) break;
      }
    }
    clearAuthSession();
    return false;
  })();

  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

// ── Proactive Token Refresh ──────────────────────────────────────────────────
// With httpOnly cookies, JS cannot read the JWT to compute TTL.
// We use a fixed 12-minute interval (75% of 15min access token TTL).
let _refreshTimer: ReturnType<typeof setTimeout> | null = null;
const PROACTIVE_REFRESH_MS = 12 * 60 * 1000; // 12 minutes

export function clearScheduledRefresh(): void {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer);
    _refreshTimer = null;
  }
}

export function scheduleTokenRefresh(onSessionLost?: () => void): () => void {
  clearScheduledRefresh();

  const schedule = () => {
    _refreshTimer = setTimeout(async () => {
      const ok = await refreshAccessToken();
      if (ok) {
        schedule(); // re-schedule for next cycle
      } else {
        onSessionLost?.();
      }
    }, PROACTIVE_REFRESH_MS);
  };

  schedule();

  // Also refresh when tab becomes visible after being hidden for a while
  let lastVisible = Date.now();
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      const hiddenDuration = Date.now() - lastVisible;
      // If hidden for more than 1 minute, refresh immediately.
      // On Android, the WebView is suspended in background — timers don't fire,
      // so the access token (15min TTL) may expire during any background session.
      if (hiddenDuration > 60_000) {
        // Retry up to 3 times with 2s delay before giving up (network can be flaky on wake)
        const retryRefresh = async (attempts: number): Promise<boolean> => {
          const ok = await refreshAccessToken();
          if (ok) return true;
          if (attempts > 1) {
            await new Promise((r) => setTimeout(r, 2000));
            return retryRefresh(attempts - 1);
          }
          return false;
        };
        void retryRefresh(3).then((ok) => {
          if (ok) schedule();
          else onSessionLost?.();
        });
      }
    } else {
      lastVisible = Date.now();
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    clearScheduledRefresh();
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

const TIMEOUT_MS = 30_000; // 30s — tolérant pour connexions 2G/3G Afrique
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

/** Retourne true si l'erreur est un problème réseau (retry possible) */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // Failed to fetch
  if (err instanceof DOMException && err.name === "AbortError") return true; // Timeout
  return false;
}

export async function request<T>(path: string, opts: RequestOptions = {}, allowRefresh = true): Promise<T> {
  const { method = "GET", body, headers = {}, params, signal } = opts;

  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.append(k, String(v));
    }
    const str = qs.toString();
    if (str) url += `?${str}`;
  }

  const reqHeaders: Record<string, string> = { ...headers };
  if (body) reqHeaders["Content-Type"] = "application/json";

  // Retry uniquement pour les GET et les erreurs réseau (pas les erreurs métier)
  const canRetry = method === "GET" || method === "HEAD";
  let lastError: unknown;

  for (let attempt = 0; attempt <= (canRetry ? MAX_RETRIES : 0); attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));

    try {
      const res = await fetch(url, {
        method,
        headers: reqHeaders,
        credentials: "include",
        body: body ? JSON.stringify(body) : undefined,
        cache: method === "GET" ? "default" : "no-store",
        signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        if (res.status === 401 && allowRefresh && path !== "/account/refresh") {
          const refreshed = await refreshAccessToken();
          if (refreshed) return request<T>(path, opts, false);
        }

        // Retry sur 5xx (serveur temporairement indisponible)
        if (canRetry && res.status >= 500 && attempt < MAX_RETRIES) {
          lastError = new ApiError(res.status, `API ${res.status}`);
          continue;
        }

        let data: unknown;
        try { data = await res.json(); } catch { /* ignore */ }
        throw new ApiError(res.status, `API ${res.status}`, data);
      }

      if (res.status === 204) return undefined as T;
      return await res.json() as T;
    } catch (err) {
      lastError = err;
      if (canRetry && isNetworkError(err) && attempt < MAX_RETRIES) continue;
      throw err;
    }
  }

  throw lastError;
}

// ── Health ──
export const health = () => request<{ status: string }>("/health");
