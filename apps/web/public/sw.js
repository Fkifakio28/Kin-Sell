/* ═══════════════════════════════════════════════════════════
   Kin-Sell — Service Worker for Push Notifications
   ═══════════════════════════════════════════════════════════ */

// @ts-nocheck — Service workers run in a different global scope

const SW_VERSION = "1.0.0";

/* ── Push event — shown even when app is closed ── */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Kin-Sell", body: event.data.text() };
  }

  const { title = "Kin-Sell", body = "", icon, badge, tag, data, actions } = payload;

  const options = {
    body,
    icon: icon || "/assets/kin-sell/logo-192.png",
    badge: badge || "/assets/kin-sell/badge-72.png",
    tag: tag || "kin-sell-notification",
    data: data || {},
    actions: actions || [],
    vibrate: [200, 100, 200],
    requireInteraction: tag === "call",
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click — open or focus the app ── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = "/";

  // Route based on notification type
  switch (data.type) {
    case "message":
      targetUrl = "/dashboard?tab=messages";
      break;
    case "call":
      targetUrl = "/dashboard?tab=messages";
      break;
    case "order":
      targetUrl = "/dashboard?tab=commandes";
      break;
    case "negotiation":
      targetUrl = "/dashboard?tab=commandes";
      break;
    case "like":
    case "publication":
      targetUrl = "/dashboard?tab=sokin";
      break;
    default:
      targetUrl = data.url || "/";
  }

  // Handle action buttons (for calls)
  if (event.action === "accept") {
    targetUrl = "/dashboard?tab=messages&callAction=accept&callId=" + (data.callId || "");
  } else if (event.action === "reject") {
    // Just close the notification
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Try to focus an existing window
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: "NOTIFICATION_CLICK", data, targetUrl });
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(targetUrl);
    })
  );
});

/* ── Notification close ── */
self.addEventListener("notificationclose", (event) => {
  const data = event.notification.data || {};
  if (data.type === "call") {
    // Inform the app that the call notification was dismissed
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "CALL_DISMISSED", data });
      }
    });
  }
});

/* ── Activate — claim clients immediately ── */
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* ── Install — skip waiting ── */
self.addEventListener("install", () => {
  self.skipWaiting();
});
