/* Service Worker — Push Notifications + Runtime Caching (Phase 3) */
const SW_VERSION = "v3-2026-04-22";
const CACHE_STATIC = `ks-static-${SW_VERSION}`;
const CACHE_IMAGES = `ks-images-${SW_VERSION}`;
const CACHE_PAGES = `ks-pages-${SW_VERSION}`;
const CACHE_API = `ks-api-${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";
const KNOWN_CACHES = [CACHE_STATIC, CACHE_IMAGES, CACHE_PAGES, CACHE_API];

const DEFAULT_ICON = "/apple-touch-icon.png";
const DEFAULT_BADGE = "/favicon-32.png";

// Politiques cache (en secondes)
const IMAGE_MAX_AGE = 30 * 24 * 60 * 60; // 30 jours
const IMAGE_MAX_ENTRIES = 120;
const PUBLIC_API_MAX_AGE = 5 * 60; // 5 min (SWR)
const API_MAX_ENTRIES = 40;

// Préfixes API publics (safe à mettre en cache SWR)
const PUBLIC_API_PREFIXES = ["/api/explorer", "/api/listings", "/api/blog", "/api/geo", "/api/public"];
// Préfixes API strictement privés (jamais cachés)
const PRIVATE_API_PREFIXES = [
  "/api/auth", "/api/me", "/api/orders", "/api/cart", "/api/checkout", "/api/messages",
  "/api/conversations", "/api/notifications", "/api/sessions", "/api/admin", "/api/boost",
  "/api/payments", "/api/wallet", "/api/ia", "/api/ai", "/api/jobs", "/api/skills",
];

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
    case "PROMO":
    case "promo":
    case "COUPON":
    case "coupon": {
      // Coupon prêt à l'emploi : deep-link direct /forfaits avec pré-remplissage
      if (typeof data.couponCode === "string" && data.couponCode.length > 0) {
        const params = new URLSearchParams();
        params.set("coupon", data.couponCode);
        if (typeof data.planCode === "string" && data.planCode.length > 0) {
          params.set("plan", data.planCode);
        }
        return `/forfaits?${params.toString()}`;
      }
      // Grant à convertir → panneau "Mes avantages IA"
      return "/account?section=incentives";
    }
    case "GRANT":
    case "grant":
      return "/account?section=incentives";
    default:
      return "/";
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_PAGES);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
    } catch { /* ignore */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  // Purge les caches obsolètes mais conserve ceux de la version courante
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (KNOWN_CACHES.includes(key)) return Promise.resolve();
      return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

/* ── Helpers runtime caching ───────────────────────────────── */

function isCacheableResponse(response) {
  if (!response) return false;
  // N'accepte que les succès (0 = opaque → on ne cache pas pour éviter pollution)
  if (response.status !== 200) return false;
  if (response.type === "opaque" || response.type === "opaqueredirect") return false;
  return true;
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map((req) => cache.delete(req)));
  } catch { /* ignore */ }
}

function isExpired(response, maxAgeSeconds) {
  if (!response) return true;
  const dateHeader = response.headers.get("date");
  if (!dateHeader) return false;
  const parsed = Date.parse(dateHeader);
  if (Number.isNaN(parsed)) return false;
  return (Date.now() - parsed) / 1000 > maxAgeSeconds;
}

// NetworkFirst pour les navigations HTML → offline fallback
async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    if (isCacheableResponse(fresh)) {
      const cache = await caches.open(CACHE_PAGES);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cache = await caches.open(CACHE_PAGES);
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

// CacheFirst avec expiration pour images (/assets, /uploads, /media)
async function handleImage(request) {
  const cache = await caches.open(CACHE_IMAGES);
  const cached = await cache.match(request);
  if (cached && !isExpired(cached, IMAGE_MAX_AGE)) return cached;
  try {
    const fresh = await fetch(request);
    if (isCacheableResponse(fresh)) {
      cache.put(request, fresh.clone()).then(() => trimCache(CACHE_IMAGES, IMAGE_MAX_ENTRIES)).catch(() => {});
    }
    return fresh;
  } catch {
    if (cached) return cached;
    return Response.error();
  }
}

// StaleWhileRevalidate pour static assets (JS/CSS hashés de Vite)
async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (isCacheableResponse(res)) cache.put(request, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (cached) { network.catch(() => {}); return cached; }
  const fresh = await network;
  if (fresh) return fresh;
  return Response.error();
}

// StaleWhileRevalidate (TTL court) pour APIs publiques idempotentes
async function handlePublicApi(request) {
  const cache = await caches.open(CACHE_API);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (isCacheableResponse(res)) {
      cache.put(request, res.clone()).then(() => trimCache(CACHE_API, API_MAX_ENTRIES)).catch(() => {});
    }
    return res;
  }).catch(() => null);
  if (cached && !isExpired(cached, PUBLIC_API_MAX_AGE)) {
    network.catch(() => {});
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  if (cached) return cached;
  return Response.error();
}

function pathStartsWithAny(pathname, prefixes) {
  for (const p of prefixes) { if (pathname.startsWith(p)) return true; }
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return; // pas de cross-origin
  if (url.pathname.startsWith("/sw.js")) return;
  if (url.pathname.startsWith("/api/auth") && url.pathname.includes("push")) return;

  // Navigations HTML
  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req));
    return;
  }

  const dest = req.destination;

  // Images : /assets /uploads /media et destinations image
  if (dest === "image" || url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/media/")) {
    event.respondWith(handleImage(req));
    return;
  }

  // Static assets hashés de Vite
  if (url.pathname.startsWith("/assets/") || dest === "style" || dest === "script" || dest === "font") {
    event.respondWith(handleStaticAsset(req));
    return;
  }

  // APIs
  if (url.pathname.startsWith("/api/")) {
    if (pathStartsWithAny(url.pathname, PRIVATE_API_PREFIXES)) return; // bypass total
    if (pathStartsWithAny(url.pathname, PUBLIC_API_PREFIXES)) {
      event.respondWith(handlePublicApi(req));
      return;
    }
    return; // autres APIs : passthrough
  }
});

// PAS d'interception hors GET — Nginx couvre le reste.

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
