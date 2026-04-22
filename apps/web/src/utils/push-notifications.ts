import { API_BASE } from "../lib/api-core";
import { Capacitor } from "@capacitor/core";
// @ts-ignore — native-only module, types may not exist on server
import { PushNotifications } from "@capacitor/push-notifications";

const SW_URL = "/sw.js";

/* ── Helpers ── */
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function fetchVapidPublicKey(): Promise<string | null> {
  // P3 #29 : cache local TTL 24h — la clé VAPID change rarement, éviter
  // un round-trip réseau à chaque subscribeToPush().
  try {
    const raw = localStorage.getItem("ks_vapid_cache");
    if (raw) {
      const parsed = JSON.parse(raw) as { key: string; ts: number };
      if (parsed.key && typeof parsed.ts === "number" && Date.now() - parsed.ts < 24 * 60 * 60 * 1000) {
        return parsed.key;
      }
    }
  } catch { /* ignore */ }
  try {
    const res = await fetch(`${API_BASE}/notifications/vapid-public-key`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey?: string | null };
    const key = data?.publicKey ?? null;
    if (key) {
      try { localStorage.setItem("ks_vapid_cache", JSON.stringify({ key, ts: Date.now() })); } catch { /* ignore */ }
    }
    return key;
  } catch {
    return null;
  }
}

async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const payload = {
    subscription: subscription.toJSON(),
    userAgent: isBrowser() ? navigator.userAgent : undefined,
  };
  // B5 audit : log l'erreur plutôt que silence complet pour diagnostiquer
  // les échecs d'enregistrement push en production.
  try {
    const res = await fetch(`${API_BASE}/notifications/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn("[Push] Subscribe failed:", res.status, res.statusText);
    }
  } catch (e) {
    console.warn("[Push] Subscribe network error:", e);
  }
}

async function sendUnsubscribeToServer(endpoint: string | null): Promise<void> {
  await fetch(`${API_BASE}/notifications/push/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(endpoint ? { endpoint } : {}),
  }).catch(() => {});
}

export function isPushSupported(): boolean {
  return isBrowser()
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!isBrowser() || !("Notification" in window)) return "denied";
  return Notification.permission;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch {
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await registerServiceWorker();
  if (!reg) return false;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const publicKey = await fetchVapidPublicKey();
    if (!publicKey) return false;
    const appServerKey = urlBase64ToUint8Array(publicKey);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey.buffer as ArrayBuffer,
    });
  }

  if (sub) {
    await sendSubscriptionToServer(sub);
    return true;
  }

  return false;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return true;
    await sendUnsubscribeToServer(sub.endpoint ?? null);
    await sub.unsubscribe().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export function onServiceWorkerMessage(
  callback: (data: { type: string; data?: unknown; targetUrl?: string; payload?: unknown }) => void,
): () => void {
  if (!isPushSupported()) return () => {};
  const handler = (event: MessageEvent) => {
    if (!event?.data) return;
    callback(event.data as { type: string; data?: unknown; targetUrl?: string; payload?: unknown });
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}

/* ══════════════════════════════════════════════════
   Native Capacitor Push (FCM / APNs) — Android & iOS
   ══════════════════════════════════════════════════ */

async function sendFcmTokenToServer(token: string): Promise<void> {
  const platform = Capacitor.getPlatform(); // "android" | "ios"
  // A15 audit : throttle retry à 1h pour éviter le flood si le serveur est
  // durablement indisponible. On ne renvoie pas le même token en boucle.
  try {
    const lastAttemptRaw = localStorage.getItem("ks_pending_fcm_last_attempt");
    const lastToken = localStorage.getItem("ks_pending_fcm_token");
    if (lastAttemptRaw && lastToken === token) {
      const lastAttempt = parseInt(lastAttemptRaw, 10);
      if (!Number.isNaN(lastAttempt) && Date.now() - lastAttempt < 60 * 60 * 1000) {
        console.log("[FCM] Token retry throttled (< 1h since last attempt)");
        return;
      }
    }
  } catch { /* ignore */ }
  try {
    const res = await fetch(`${API_BASE}/notifications/fcm/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token, platform }),
    });
    if (res.ok) {
      console.log("[FCM] Token registered on server");
      // Clear pending token on success
      try {
        localStorage.removeItem("ks_pending_fcm_token");
        localStorage.removeItem("ks_pending_fcm_last_attempt");
      } catch { /* ignore */ }
      // Mémoriser le token actif pour pouvoir le désenregistrer au logout
      try { localStorage.setItem("ks_active_fcm_token", token); } catch { /* ignore */ }
    } else {
      console.warn("[FCM] Server rejected token registration:", res.status);
      // Save for retry on next launch
      try {
        localStorage.setItem("ks_pending_fcm_token", token);
        localStorage.setItem("ks_pending_fcm_last_attempt", String(Date.now()));
      } catch { /* ignore */ }
    }
  } catch (err) {
    console.warn("[FCM] Failed to send token to server:", err);
    // Save for retry on next launch
    try {
      localStorage.setItem("ks_pending_fcm_token", token);
      localStorage.setItem("ks_pending_fcm_last_attempt", String(Date.now()));
    } catch { /* ignore */ }
  }
}

/** Supprime le token FCM actif du serveur (à appeler au logout). */
export async function unregisterActiveFcmToken(): Promise<void> {
  let token: string | null = null;
  try { token = localStorage.getItem("ks_active_fcm_token"); } catch { /* ignore */ }
  // A8 audit : appeler TOUJOURS /fcm/unregister-all côté serveur au logout
  // pour supprimer tous les tokens de cet utilisateur (défense en profondeur
  // si un token précédent est resté enregistré côté serveur sans l'être
  // dans le localStorage de ce device).
  try {
    await fetch(`${API_BASE}/notifications/fcm/unregister-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch { /* ignore */ }
  // Aussi appeler /fcm/unregister avec le token précis si connu (pour backward-compat)
  if (token) {
    try {
      await fetch(`${API_BASE}/notifications/fcm/unregister`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
    } catch { /* ignore */ }
  }
  try { localStorage.removeItem("ks_active_fcm_token"); } catch { /* ignore */ }
  try { localStorage.removeItem("ks_pending_fcm_token"); } catch { /* ignore */ }
}

/**
 * Listen for pending FCM tokens flushed from native (SharedPreferences).
 * When KinSellMessagingService.onNewToken() fires in background, the token
 * is saved and pushed to JS via ks:fcm-token when MainActivity resumes.
 */
export function listenForPendingFcmToken(): () => void {
  if (!isNativeApp()) return () => {};
  const handler = (e: Event) => {
    const token = (e as CustomEvent<{ token: string }>).detail?.token;
    if (token) {
      console.log("[FCM] Received pending token from native side");
      void sendFcmTokenToServer(token);
    }
  };
  window.addEventListener("ks:fcm-token", handler);

  // Also retry any previously failed token registration
  try {
    const pendingToken = localStorage.getItem("ks_pending_fcm_token");
    if (pendingToken) {
      console.log("[FCM] Retrying previously failed token registration");
      void sendFcmTokenToServer(pendingToken);
    }
  } catch {}

  // P1 #17 : retry aussi au retour du réseau / reconnexion socket. Si le
  // serveur était down au premier enregistrement, on ne peut pas compter
  // uniquement sur le prochain onNewToken (qui est rare).
  const retryPending = () => {
    try {
      const pending = localStorage.getItem("ks_pending_fcm_token");
      if (pending) {
        console.log("[FCM] Retry pending token after socket/network event");
        void sendFcmTokenToServer(pending);
      }
    } catch {}
  };
  window.addEventListener("ks:socket-reconnected", retryPending);
  window.addEventListener("online", retryPending);

  return () => {
    window.removeEventListener("ks:fcm-token", handler);
    window.removeEventListener("ks:socket-reconnected", retryPending);
    window.removeEventListener("online", retryPending);
  };
}

/**
 * Initialize native push notifications (FCM via Capacitor).
 * Returns a cleanup function to remove listeners.
 */
export async function initNativePush(
  onNotification?: (data: Record<string, string>) => void,
): Promise<(() => void) | null> {
  if (!isNativeApp()) return null;

  try {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === "prompt") {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== "granted") return null;

    // IMPORTANT: attach listeners BEFORE register() to avoid race condition
    const regListener = await PushNotifications.addListener("registration", (token: any) => {
      console.log("[FCM] Token received, sending to server...");
      void sendFcmTokenToServer(token.value);
    });

    const regErrorListener = await PushNotifications.addListener("registrationError", (err: any) => {
      console.warn("[FCM] Registration error:", err);
    });

    await PushNotifications.register();

    const receivedListener = await PushNotifications.addListener(
      "pushNotificationReceived",
      (notification: any) => {
        // Notification received while app is in foreground
        if (onNotification && notification.data) {
          onNotification(notification.data as Record<string, string>);
        }
      },
    );

    const actionListener = await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: any) => {
        // User tapped the notification — navigate via SPA (no page reload)
        const data = action.notification.data as Record<string, string> | undefined;
        let targetUrl = data?.url || "";
        if (!targetUrl) {
          if (data?.type === "message") targetUrl = "/messaging";
          else if (data?.type === "order" || data?.type === "negotiation") targetUrl = "/account?tab=commandes";
          else if (data?.type === "sokin" || data?.type === "publication") targetUrl = "/sokin";
          else if (data?.type === "PROMO" || data?.type === "promo" || data?.type === "COUPON" || data?.type === "coupon") {
            if (data?.couponCode) {
              const params = new URLSearchParams();
              params.set("coupon", data.couponCode);
              if (data?.planCode) params.set("plan", data.planCode);
              targetUrl = `/forfaits?${params.toString()}`;
            } else {
              targetUrl = "/account?section=incentives";
            }
          }
          else if (data?.type === "GRANT" || data?.type === "grant") targetUrl = "/account?section=incentives";
        }
        if (targetUrl) {
          const current = `${window.location.pathname}${window.location.search}`;
          if (current !== targetUrl) {
            window.history.pushState({}, "", targetUrl);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }
        }
      },
    );

    return () => {
      void regListener.remove();
      void regErrorListener.remove();
      void receivedListener.remove();
      void actionListener.remove();
    };
  } catch {
    return null;
  }
}

export { isNativeApp };
