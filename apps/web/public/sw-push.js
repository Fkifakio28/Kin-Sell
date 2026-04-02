/* ═══════════════════════════════════════════════════════════
   Kin-Sell — Push Notifications (importé par le SW Workbox)
   ═══════════════════════════════════════════════════════════ */
// @ts-nocheck

/* ── Push event ── */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: "Kin-Sell", body: event.data.text() }; }

  const { title = "Kin-Sell", body = "", icon, badge, tag, data, actions } = payload;

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: icon || "/assets/kin-sell/pwa-192.png",
    badge: badge || "/assets/kin-sell/badge-72.png",
    tag: tag || "kin-sell-notification",
    data: data || {},
    actions: actions || [],
    vibrate: [200, 100, 200],
    requireInteraction: tag === "call",
    silent: false,
  }));
});

/* ── Notification click ── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = "/";

  switch (data.type) {
    case "message":     targetUrl = "/messaging"; break;
    case "call":        targetUrl = "/messaging"; break;
    case "order":       targetUrl = "/account?tab=commandes"; break;
    case "negotiation": targetUrl = "/account?tab=commandes"; break;
    case "like":
    case "publication": targetUrl = "/account?tab=sokin"; break;
    default:            targetUrl = data.url || "/";
  }

  if (event.action === "accept") {
    targetUrl = "/messaging?callAction=accept&callId=" + (data.callId || "");
  } else if (event.action === "reject") {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          client.postMessage({ type: "NOTIFICATION_CLICK", data, targetUrl });
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

/* ── Notification close ── */
self.addEventListener("notificationclose", (event) => {
  const data = event.notification.data || {};
  if (data.type === "call") {
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: "CALL_DISMISSED", data });
      }
    });
  }
});
