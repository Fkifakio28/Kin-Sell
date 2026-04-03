/* ═══════════════════════════════════════════════════════════
   Kin-Sell — Push Notifications (importé par le SW Workbox)
   ═══════════════════════════════════════════════════════════ */
// @ts-nocheck

function toAbsoluteUrl(path) {
  return new URL(path || "/", self.location.origin).href;
}

function samePath(a, b) {
  try {
    const left = new URL(a, self.location.origin);
    const right = new URL(b, self.location.origin);
    return `${left.pathname}${left.search}` === `${right.pathname}${right.search}`;
  } catch {
    return a === b;
  }
}

function resolveTargetPath(data) {
  switch (data?.type) {
    case "message":
      return "/messaging";
    case "call":
      return "/messaging";
    case "order":
      return "/account?tab=commandes";
    case "negotiation":
      return "/account?tab=commandes";
    case "like":
    case "publication":
      return "/sokin";
    default:
      return data?.url || "/";
  }
}

/* ── Push deduplication cache ── */
const _pushDedup = new Map(); // hash → timestamp
const PUSH_DEDUP_TTL = 2000; // 2s window

function hashPush(data) {
  return `${data?.type || "x"}-${data?.orderId || data?.negotiationId || data?.conversationId || data?.postId || ""}`;
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

  // Deduplication — drop duplicate pushes within 2s window
  const h = hashPush(payloadData);
  const now = Date.now();
  if (_pushDedup.has(h) && now - _pushDedup.get(h) < PUSH_DEDUP_TTL) return;
  _pushDedup.set(h, now);
  // Cleanup old entries
  if (_pushDedup.size > 50) {
    for (const [k, ts] of _pushDedup) { if (now - ts > PUSH_DEDUP_TTL * 3) _pushDedup.delete(k); }
  }

  const targetPath = payloadData.url || resolveTargetPath(payloadData);
  const dataWithUrl = { ...payloadData, url: targetPath };

  const notificationOptions = {
    body,
    icon: icon || "/assets/kin-sell/pwa-192.png",
    badge: badge || "/assets/kin-sell/badge-72.png",
    tag: tag || `kin-sell-${payloadType}`,
    data: dataWithUrl,
    actions: actions || [],
    vibrate: payloadType === "call" ? [320, 120, 320, 120, 320] : [200, 100, 200],
    requireInteraction: payloadType === "call",
    renotify: payloadType === "call",
    silent: false,
  };

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visibleClients = clients.filter((c) => c.visibilityState === "visible");

    if (visibleClients.length > 0) {
      // Parallel postMessage to all visible tabs
      visibleClients.forEach((c) => {
        c.postMessage({ type: "PUSH_RECEIVED", payload: { title, body, data: dataWithUrl } });
      });
      return;
    }

    await self.registration.showNotification(title, notificationOptions);
  })());
});

/* ── Notification click ── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = data.url || resolveTargetPath(data);

  if (event.action === "accept") {
    targetUrl = "/messaging?callAction=accept&convId=" + (data.conversationId || "") + "&callerId=" + (data.callerId || "") + "&callType=" + (data.callType || "audio");
  } else if (event.action === "reject") {
    return;
  }

  const absoluteTargetUrl = toAbsoluteUrl(targetUrl);

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const sameOrigin = clients.filter((client) => client.url && client.url.startsWith(self.location.origin));
    const orderedClients = [
      ...sameOrigin.filter((client) => client.visibilityState === "visible"),
      ...sameOrigin.filter((client) => client.visibilityState !== "visible"),
    ];

    for (const client of orderedClients) {
      try {
        if (!client.url || !client.url.startsWith(self.location.origin)) continue;

        const focused = await client.focus();
        if (focused && "navigate" in focused && !samePath(focused.url, absoluteTargetUrl)) {
          await focused.navigate(absoluteTargetUrl);
        }

        focused?.postMessage({ type: "NOTIFICATION_CLICK", data, targetUrl: absoluteTargetUrl });
        return;
      } catch {
        // Keep iterating other clients and fallback to openWindow if needed.
      }
    }

    try {
      const opened = await self.clients.openWindow(absoluteTargetUrl);
      if (opened) {
        await opened.focus();
        opened.postMessage({ type: "NOTIFICATION_CLICK", data, targetUrl: absoluteTargetUrl });
      }
      return;
    } catch {
      // Final fallback: open app root if direct deep-link opening is rejected.
      const openedRoot = await self.clients.openWindow(toAbsoluteUrl("/"));
      if (openedRoot) {
        await openedRoot.focus();
        openedRoot.postMessage({ type: "NOTIFICATION_CLICK", data, targetUrl: absoluteTargetUrl });
      }
    }
  })());
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
