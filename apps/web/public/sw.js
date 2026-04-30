/* Service Worker — Push Notifications + Runtime Caching (Phase 3) */
const SW_VERSION = "v9-2026-04-30-callcleanup";
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
      // Étape 3 : sans callId+expiresAt valides on retombe sur /messaging
      // pour ne déclencher aucune injection d'appel zombie.
      const now = Date.now();
      const callId = data.callId;
      const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : Number(data.expiresAt);
      if (!callId || !Number.isFinite(expiresAt) || expiresAt <= now) {
        return "/messaging";
      }
      const conv = data.conversationId || "";
      const caller = data.callerId || "";
      const callType = data.callType || "audio";
      const params = new URLSearchParams({
        incomingConvId: conv,
        incomingCallerId: caller,
        incomingCallType: callType,
        callId: String(callId),
        expiresAt: String(expiresAt),
      });
      return `/messaging?${params.toString()}`;
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
    // P0 #10 : chaque étape protégée individuellement. Si cache.add échoue
    // (offline.html 404 au déploiement), on continue quand même pour ne pas
    // bloquer l'installation du SW et laisser l'ancien tourner.
    try {
      const cache = await caches.open(CACHE_PAGES);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
    } catch (err) { console.warn("[sw] offline cache failed:", err); }
    try { await self.skipWaiting(); } catch (err) { console.warn("[sw] skipWaiting failed:", err); }
  })().catch((err) => { console.error("[sw] install fatal:", err); }));
});

self.addEventListener("activate", (event) => {
  // Purge les caches obsolètes mais conserve ceux de la version courante
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => {
        if (KNOWN_CACHES.includes(key)) return Promise.resolve();
        return caches.delete(key).catch(() => {});
      }));
    } catch (err) { console.warn("[sw] cache purge failed:", err); }
    try { await self.clients.claim(); } catch (err) { console.warn("[sw] clients.claim failed:", err); }
  })().catch((err) => { console.error("[sw] activate fatal:", err); }));
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
  // P1 #18 : tenter d'abord le header "sw-cached-at" qu'on injecte nous-mêmes
  // au moment du cache.put. Si absent, fallback sur "date" (serveur) puis
  // sur un headers de la réponse clonée. Si tout échoue, considérer comme
  // expiré (force refetch) plutôt que garder indéfiniment.
  const cachedAt = response.headers.get("sw-cached-at");
  if (cachedAt) {
    const parsed = parseInt(cachedAt, 10);
    if (!Number.isNaN(parsed)) {
      return (Date.now() - parsed) / 1000 > maxAgeSeconds;
    }
  }
  const dateHeader = response.headers.get("date");
  if (dateHeader) {
    const parsed = Date.parse(dateHeader);
    if (!Number.isNaN(parsed)) {
      return (Date.now() - parsed) / 1000 > maxAgeSeconds;
    }
  }
  // Pas de date utilisable → considérer expiré pour forcer revalidation
  return true;
}

// Helper : cloner une réponse en ajoutant sw-cached-at pour tracking de fraîcheur
async function putWithTimestamp(cache, request, response) {
  try {
    const body = await response.clone().arrayBuffer();
    const headers = new Headers(response.headers);
    headers.set("sw-cached-at", String(Date.now()));
    const stamped = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    await cache.put(request, stamped);
  } catch { /* ignore */ }
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
      putWithTimestamp(cache, request, fresh).then(() => trimCache(CACHE_IMAGES, IMAGE_MAX_ENTRIES)).catch(() => {});
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
      putWithTimestamp(cache, request, res).then(() => trimCache(CACHE_API, API_MAX_ENTRIES)).catch(() => {});
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

// API_BASE fourni par le client via postMessage pour que le SW puisse appeler
// les endpoints backend (ex: re-subscribe apr\u00e8s pushsubscriptionchange).
let SW_API_BASE = self.location.origin;
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "set-api-base" && typeof data.apiBase === "string") {
    SW_API_BASE = data.apiBase.replace(/\/+$/, "");
    return;
  }
  // Étape 4 — cleanup actif des notifications d'appel.
  // La page envoie ce message quand l'appel est accepté/rejeté/terminé/no-answer
  // pour fermer la notification SW correspondante (tag `call-${callId}`).
  if (data && data.type === "close-call-notification" && typeof data.callId === "string" && data.callId) {
    const tag = "call-" + data.callId;
    event.waitUntil(
      self.registration.getNotifications({ tag })
        .then((list) => {
          for (const n of list) {
            try { n.close(); } catch (e) { /* ignore */ }
          }
        })
        .catch(() => {})
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const data = (payload && payload.data) ? payload.data : {};

  // ── Étape 3 : filtre strict pour les push d'appel ──
  // Sans callId/expiresAt valides, on drop silencieusement la notif :
  // les vieux push résiduels ne peuvent plus réveiller un faux appel.
  if (data.type === "call") {
    const now = Date.now();
    const expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : Number(data.expiresAt);
    if (!data.callId || !Number.isFinite(expiresAt) || expiresAt <= now) {
      return; // drop : pas de notification, pas de postMessage clients.
    }
  }

  const targetUrl = resolveTarget(data);

  // Fallback body par type pour garantir l'affichage + le déclenchement du
  // son système (certains navigateurs restent silencieux si body est vide).
  const fallbackBodyByType = {
    message: "Nouveau message 💬",
    call: "Appel entrant 📞",
    order: "Nouvelle activité sur votre commande",
    negotiation: "Nouvelle offre reçue",
    like: "Nouveau like sur votre publication",
    publication: "Nouvelle publication",
    sokin: "Nouvelle activité So-Kin",
    promo: "Nouvelle promotion 🎁",
    COUPON: "Nouveau coupon 🎟️",
    default: "Vous avez une nouvelle notification Kin-Sell",
  };
  const resolvedBody =
    (payload.body && String(payload.body).trim()) ||
    fallbackBodyByType[data.type] ||
    fallbackBodyByType.default;
  const resolvedTitle = (payload.title && String(payload.title).trim()) || "Kin-Sell";
  // Tag stable par type/conversation → renotify déclenche le son à chaque push.
  // Étape 3 : tag d'appel = call-${callId} pour permettre la suppression
  // ciblée d'une notif quand l'appel se termine côté serveur.
  const resolvedTag =
    payload.tag ||
    (data.type === "call" && data.callId ? `call-${data.callId}` : null) ||
    (data.type === "message" && data.conversationId ? `msg-${data.conversationId}` : null) ||
    `ks-${data.type || "default"}-${Date.now()}`;

  const options = {
    body: resolvedBody,
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
    tag: resolvedTag,
    renotify: true,
    silent: false,
    requireInteraction: data.type === "call",
    vibrate: data.type === "call"
      ? [500, 200, 500, 200, 500, 200, 500]
      : [300, 120, 300, 120, 300],
    timestamp: Date.now(),
    data: {
      ...(data || {}),
      url: targetUrl,
    },
    actions: Array.isArray(payload.actions) ? payload.actions : [],
  };

  event.waitUntil(
    (async () => {
      // Détecte un client visible & focus. Si un onglet Kin-Sell est au
      // premier plan, on laisse l'UI in-app (toast + son) gérer la notif
      // pour éviter un doublon avec la notification système de l'OS.
      // Exception : les appels entrants ("call") affichent toujours la
      // notif système car elle sert d'ancrage pour les actions accepter/rejeter.
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const hasFocusedVisibleClient = clientsList.some(
        (c) => c.focused === true && c.visibilityState === "visible",
      );
      const isCall = data.type === "call";

      if (!hasFocusedVisibleClient || isCall) {
        try {
          await self.registration.showNotification(resolvedTitle, options);
        } catch (err) { console.warn("[sw] showNotification failed:", err); }
      }

      // Toujours postMessage à tous les clients pour que l'UI in-app
      // puisse afficher son toast + jouer le son + vibrer.
      for (const client of clientsList) {
        try { client.postMessage({ type: "push", payload }); } catch { /* ignore */ }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification?.data?.url || "/";
  event.notification.close();
  // Étape 3 : si l'URL embarque expiresAt et qu'il est dépassé, on n'ouvre
  // rien (la sonnerie côté UI serait de toute façon bloquée par le filtre
  // côté MessagingPage, mais on évite l'ouverture de fenêtre inutile).
  try {
    const u = new URL(url, self.location.origin);
    const exp = u.searchParams.get("expiresAt");
    if (exp) {
      const ts = Number(exp);
      if (Number.isFinite(ts) && ts <= Date.now()) return;
    }
  } catch { /* ignore parse errors */ }
  event.waitUntil(
    (async () => {
      // P1.5 D : scorer les clients pour focus le plus pertinent
      //  - +3 si déjà sur la bonne route (messagerie, commandes, sokin...)
      //  - +2 si focused
      //  - +1 si visible
      // Sinon on navigue l'onglet best-scored vers l'URL cible.
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (clientList.length === 0) {
        await self.clients.openWindow(url);
        return;
      }
      const targetPath = (() => { try { return new URL(url, self.location.origin).pathname; } catch { return url; } })();
      let best = null;
      let bestScore = -1;
      for (const c of clientList) {
        let score = 0;
        try {
          const cPath = new URL(c.url).pathname;
          if (targetPath && cPath.startsWith(targetPath.split("?")[0])) score += 3;
        } catch { /* ignore */ }
        if (c.focused === true) score += 2;
        if (c.visibilityState === "visible") score += 1;
        if (score > bestScore) { best = c; bestScore = score; }
      }
      if (best && "focus" in best) {
        try { best.postMessage({ type: "navigate", targetUrl: url }); } catch { /* ignore */ }
        try { await best.focus(); } catch { /* ignore */ }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

/* ── Auto-recovery : si le navigateur invalide/renouvelle silencieusement
 * la subscription VAPID (nettoyage stockage, rotation cl\u00e9, etc.), on
 * re-souscrit imm\u00e9diatement avec la m\u00eame cl\u00e9 publique et on renvoie
 * la nouvelle au serveur pour que les push futurs continuent d'arriver. ── */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription;
        const applicationServerKey = oldSub?.options?.applicationServerKey;
        if (!applicationServerKey) return;
        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        // Notifier le serveur (les clients peuvent \u00eatre ferm\u00e9s, on fetch direct)
        try {
          await fetch(`${SW_API_BASE}/notifications/push/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ subscription: newSub.toJSON() }),
          });
        } catch (e) { console.warn("[sw] push re-subscribe POST failed:", e); }
        // Notifier les clients ouverts pour qu'ils rafra\u00eechissent leur \u00e9tat
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of clients) {
          try { c.postMessage({ type: "push-subscription-renewed" }); } catch {}
        }
      } catch (err) { console.warn("[sw] pushsubscriptionchange recovery failed:", err); }
    })(),
  );
});
