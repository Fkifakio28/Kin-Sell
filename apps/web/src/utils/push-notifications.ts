/* ═══════════════════════════════════════════════════════════
   Push Notification Manager — Frontend
   Registers Service Worker + subscribes to Web Push
   ═══════════════════════════════════════════════════════════ */

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("kin-sell.token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

/** Check if push notifications are supported */
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Get current notification permission */
export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

/** Register the service worker */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    void registration.update();
    return registration;
  } catch (err) {
    console.warn("[Push] SW registration failed:", err);
    return null;
  }
}

/** Fetch VAPID public key from backend */
async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/notifications/vapid-public-key`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey ?? null;
  } catch {
    return null;
  }
}

/** Convert a base64 VAPID key to Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Request permission + subscribe to push + register with backend */
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  // Register SW
  const registration = await registerServiceWorker();
  if (!registration) return false;

  // Wait for SW to be ready
  await navigator.serviceWorker.ready;

  // Get VAPID public key
  const vapidKey = await fetchVapidPublicKey();
  if (!vapidKey) {
    console.warn("[Push] No VAPID key available from server");
    return false;
  }

  try {
    const persistSubscription = async (sub: PushSubscription) => {
      return fetch(`${API_BASE}/notifications/push/subscribe`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });
    };

    // Check existing subscription
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
    }

    // Send subscription to backend
    let res = await persistSubscription(subscription);

    // Recover from stale/broken client subscription by forcing renewal once
    if (!res.ok) {
      await subscription.unsubscribe().catch(() => {});
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      res = await persistSubscription(subscription);
    }

    return res.ok;
  } catch (err) {
    console.warn("[Push] Subscription failed:", err);
    return false;
  }
}

/** Unsubscribe from push notifications */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;

    // Unsubscribe locally
    await subscription.unsubscribe();

    // Remove from backend
    await fetch(`${API_BASE}/notifications/push/unsubscribe`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    return true;
  } catch {
    return false;
  }
}

/** Check if currently subscribed */
export async function isSubscribedToPush(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

/** Listen for messages from the service worker */
export function onServiceWorkerMessage(callback: (data: { type: string; data?: unknown; targetUrl?: string }) => void): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data && event.data.type) {
      callback(event.data);
    }
  };
  navigator.serviceWorker?.addEventListener("message", handler);
  return () => navigator.serviceWorker?.removeEventListener("message", handler);
}
