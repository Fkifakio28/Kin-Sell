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
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("/uploads/")) return `${API_BASE}${url}`;
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
    try {
      // httpOnly cookie carries the refresh token automatically
      const res = await fetch(`${API_BASE}/account/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        clearAuthSession();
        return false;
      }

      // Server sets new httpOnly cookies; clear any legacy localStorage tokens
      clearAuthSession();
      return true;
    } catch {
      return false;
    }
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
      // If hidden for more than 10 minutes, refresh immediately
      if (hiddenDuration > 10 * 60 * 1000) {
        void refreshAccessToken().then((ok) => {
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

  const reqHeaders: Record<string, string> = { ...headers };
  // httpOnly cookies carry auth automatically — no Authorization header needed
  if (body) reqHeaders["Content-Type"] = "application/json";

  const fetchWork = (async (): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: reqHeaders,
        credentials: "include",
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
    } catch (err) {
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

    return result;
  })();

  return await fetchWork;
}

// ── Health ──
export const health = () => request<{ status: string }>("/health");
