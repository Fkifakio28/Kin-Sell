import { Capacitor, registerPlugin } from "@capacitor/core";

interface CallNotificationPlugin {
  showOngoing(options: {
    callerName: string;
    conversationId: string;
    remoteUserId: string;
  }): Promise<void>;
  hideOngoing(): Promise<void>;
  clearAllNotifications(): Promise<void>;
  clearCallNotification(): Promise<void>;
}

const CallNotification = registerPlugin<CallNotificationPlugin>("CallNotification");

const isNative = Capacitor.isNativePlatform();

/** Show persistent "call in progress" notification (Android only) */
export async function showOngoingCallNotification(
  callerName: string,
  conversationId: string,
  remoteUserId: string,
): Promise<void> {
  if (!isNative) return;
  await CallNotification.showOngoing({ callerName, conversationId, remoteUserId });
}

/** Hide the ongoing call notification */
export async function hideOngoingCallNotification(): Promise<void> {
  if (!isNative) return;
  await CallNotification.hideOngoing();
}

/** Clear all delivered notifications except ongoing call */
export async function clearAllNotifications(): Promise<void> {
  if (!isNative) return;
  await CallNotification.clearAllNotifications();
}

/** Clear the incoming call notification (ID 9999) */
export async function clearCallNotification(): Promise<void> {
  if (!isNative) return;
  await CallNotification.clearCallNotification();
}

/**
 * Étape 4 — cleanup actif côté Web : ferme toutes les notifications
 * Service Worker taggées `call-${callId}` (push reçu en background).
 *
 * Idempotent et silencieux : si le navigateur ne supporte pas
 * `getNotifications`, ou que le SW n'est pas prêt, no-op.
 *
 * Combine deux canaux :
 * 1. Direct via `registration.getNotifications({ tag })` quand disponible.
 * 2. postMessage `{ type: "close-call-notification", callId }` au SW pour
 *    qu'il ferme aussi les notifs créées par lui-même (cas où la page
 *    n'a pas la même instance de registration que le SW actif).
 */
export async function closeCallNotification(callId: string): Promise<void> {
  if (!callId) return;
  // Canal natif (Android) — supprime la notification 9999 si présente.
  if (isNative) {
    try { await CallNotification.clearCallNotification(); } catch { /* ignore */ }
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const tag = `call-${callId}`;
    if (typeof reg.getNotifications === "function") {
      const notifs = await reg.getNotifications({ tag });
      for (const n of notifs) {
        try { n.close(); } catch { /* ignore */ }
      }
    }
    // Demande au SW de purger aussi de son côté (notifs persistantes hors page).
    try {
      reg.active?.postMessage({ type: "close-call-notification", callId });
    } catch { /* ignore */ }
  } catch { /* ignore */ }
}
