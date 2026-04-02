/* ═══════════════════════════════════════════════════════════
   Kin-Sell — Push Notifications (importé par le SW Workbox)
   ═══════════════════════════════════════════════════════════ */
// @ts-nocheck

function toAbsoluteUrl(path) {
  return new URL(path || "/", self.location.origin).href;
}

/* ── Push event ── */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: "Kin-Sell", body: event.data.text() }; }

  const { title = "Kin-Sell", body = "", icon, badge, tag, data, actions } = payload;
  const payloadData = data || {};
  const payloadType = payloadData.type || "system";

  const notificationOptions = {
    body,
    icon: icon || "/assets/kin-sell/pwa-192.png",
    badge: badge || "/assets/kin-sell/badge-72.png",
    tag: tag || `kin-sell-${payloadType}`,
    data: payloadData,
    actions: actions || [],
    vibrate: payloadType === "call" ? [320, 120, 320, 120, 320] : [200, 100, 200],
    requireInteraction: payloadType === "call",
    renotify: payloadType === "call",
    silent: false,
  };

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visibleClients = clients.filter((client) => client.visibilityState === "visible");

    for (const client of visibleClients) {
      client.postMessage({ type: "PUSH_RECEIVED", payload: { title, body, data: payloadData } });
    }

    if (visibleClients.length > 0) {
      return;
    }

    await self.registration.showNotification(title, notificationOptions);
  })());
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
    case "publication": targetUrl = "/sokin"; break;
    default:            targetUrl = data.url || "/";
  }

  if (event.action === "accept") {
    targetUrl = "/messaging?callAction=accept&convId=" + (data.conversationId || "") + "&callerId=" + (data.callerId || "") + "&callType=" + (data.callType || "audio");
  } else if (event.action === "reject") {
    return;
  }

  const absoluteTargetUrl = toAbsoluteUrl(targetUrl);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (client.url && client.url.startsWith(self.location.origin)) {
          if ("navigate" in client) {
            await client.navigate(absoluteTargetUrl);
          }
          await client.focus();
          client.postMessage({ type: "NOTIFICATION_CLICK", data, targetUrl: absoluteTargetUrl });
          return undefined;
        }
      }
      return self.clients.openWindow(absoluteTargetUrl);
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
