/* ═══════════════════════════════════════════════════════════
   Push Notification Manager — DISABLED
   Service Worker & PWA completely removed.
   All functions are no-ops to preserve existing imports.
   ═══════════════════════════════════════════════════════════ */

/** Push is no longer supported (SW removed) */
export function isPushSupported(): boolean {
  return false;
}

/** Always returns "denied" since SW is removed */
export function getNotificationPermission(): NotificationPermission {
  return "denied";
}

/** No-op: SW registration removed */
export async function registerServiceWorker(): Promise<null> {
  return null;
}

/** No-op: push subscription removed */
export async function subscribeToPush(): Promise<boolean> {
  return false;
}

/** No-op */
export async function unsubscribeFromPush(): Promise<boolean> {
  return true;
}

/** Always false */
export async function isSubscribedToPush(): Promise<boolean> {
  return false;
}

/** No-op: returns cleanup function that does nothing */
export function onServiceWorkerMessage(_callback: (data: { type: string; data?: unknown; targetUrl?: string; payload?: unknown }) => void): () => void {
  return () => {};
}
