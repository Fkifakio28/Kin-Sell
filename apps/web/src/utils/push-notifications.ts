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
  try {
    const res = await fetch(`${API_BASE}/notifications/vapid-public-key`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey?: string | null };
    return data?.publicKey ?? null;
  } catch {
    return null;
  }
}

async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const payload = {
    subscription: subscription.toJSON(),
    userAgent: isBrowser() ? navigator.userAgent : undefined,
  };
  await fetch(`${API_BASE}/notifications/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  }).catch(() => {});
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
  await fetch(`${API_BASE}/notifications/fcm/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token, platform }),
  }).catch(() => {});
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
    if (token) void sendFcmTokenToServer(token);
  };
  window.addEventListener("ks:fcm-token", handler);
  return () => window.removeEventListener("ks:fcm-token", handler);
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

    await PushNotifications.register();

    const regListener = await PushNotifications.addListener("registration", (token: any) => {
      void sendFcmTokenToServer(token.value);
    });

    const regErrorListener = await PushNotifications.addListener("registrationError", (err: any) => {
      console.warn("[FCM] Registration error:", err);
    });

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
        // User tapped the notification (app was in background)
        const data = action.notification.data as Record<string, string> | undefined;
        if (data?.url) {
          window.location.href = data.url;
        } else if (data?.type === "message") {
          window.location.href = "/messaging";
        } else if (data?.type === "order") {
          window.location.href = "/account?tab=commandes";
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
