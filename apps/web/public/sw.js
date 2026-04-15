/* Service Worker for Push Notifications */
const DEFAULT_ICON = "/apple-touch-icon.png";
const DEFAULT_BADGE = "/favicon-32.png";
const STATIC_CACHE_NAME = "kin-sell-static-v1";

function resolveTarget(data) {
  if (!data || typeof data !== "object") return "/";
  if (typeof data.url === "string" && data.url.length > 0) return data.url;
  switch (data.type) {
    case "message":
      return "/messaging";
    case "call": {
      const conv = data.conversationId || "";
      const caller = data.callerId || "";
      const callType = data.callType || "audio";
      return `/messaging?incomingConvId=${conv}&incomingCallerId=${caller}&incomingCallType=${callType}`;
    }
    case "order":
    case "negotiation":
      return "/account?tab=commandes";
    case "like":
    case "publication":
    case "sokin":
      return "/sokin";
    default:
      return "/";
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("kin-sell-static-") && key !== STATIC_CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // On laisse les endpoints dynamiques hors cache SW pour éviter les données périmées.
  if (url.pathname.startsWith("/api")) return;

  const isStaticAsset = /\.(?:js|css|png|jpe?g|webp|avif|svg|ico|woff2?|ttf|map)$/i.test(url.pathname)
    || url.pathname.startsWith("/assets/")
    || url.pathname === "/"
    || url.pathname.endsWith(".html");

  if (!isStaticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) {
      void fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          void cache.put(req, networkResponse.clone());
        }
      }).catch(() => undefined);
      return cached;
    }

    try {
      const networkResponse = await fetch(req);
      if (networkResponse && networkResponse.ok) {
        await cache.put(req, networkResponse.clone());
      }
      return networkResponse;
    } catch {
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const data = (payload && payload.data) ? payload.data : {};
  const targetUrl = resolveTarget(data);

  const options = {
    body: payload.body || "",
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag: payload.tag,
    renotify: true,
    requireInteraction: data.type === "call",
    vibrate: data.type === "call"
      ? [500, 200, 500, 200, 500, 200, 500]
      : [250, 100, 250],
    data: {
      ...(data || {}),
      url: targetUrl,
    },
    actions: Array.isArray(payload.actions) ? payload.actions : [],
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title || "Kin-Sell", options);
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        client.postMessage({ type: "push", payload });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification?.data?.url || "/";
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "navigate", targetUrl: url });
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
