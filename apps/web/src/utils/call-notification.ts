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
