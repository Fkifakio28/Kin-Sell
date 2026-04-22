import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import path from "node:path";
import pinoHttpModule from "pino-http";
const pinoHttp = (pinoHttpModule as any).default || pinoHttpModule;
import { env } from "./config/env.js";
import { logger, genRequestId } from "./shared/logger.js";
import { prisma } from "./shared/db/prisma.js";
import { canTrade, Role } from "./types/roles.js";
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import businessAccountsRoutes from "./modules/businesses/business-accounts.routes.js";
import listingsRoutes from "./modules/listings/listings.routes.js";
import explorerRoutes from "./modules/explorer/explorer.routes.js";
import accountRoutes from "./modules/account/account.routes.js";
import billingRoutes from "./modules/billing/billing.routes.js";
import incentiveRoutes from "./modules/incentives/incentive.routes.js";
import ordersRoutes from "./modules/orders/orders.routes.js";
import negotiationsRoutes from "./modules/negotiations/negotiations.routes.js";
import uploadsRoutes from "./modules/uploads/uploads.routes.js";
import messagingRoutes from "./modules/messaging/messaging.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import adminRoutes from "./modules/admin/admin.routes.js";
import securityRoutes from "./modules/security/security.routes.js";
import adsRoutes from "./modules/ads/ads.routes.js";
import blogRoutes from "./modules/blog/blog.routes.js";
import sokinRoutes from "./modules/sokin/sokin.routes.js";
import sokinTrendsRoutes from "./modules/sokin-trends/sokin-trends.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import marketIntelligenceRoutes from "./modules/market-intelligence/market-intelligence.routes.js";
import contactsRoutes from "./modules/contacts/contacts.routes.js";
import mobileMoneyRoutes from "./modules/mobile-money/mobile-money.routes.js";
import geoRoutes from "./modules/geo/geo.routes.js";
import reviewsRoutes from "./modules/reviews/reviews.routes.js";
import verificationRoutes from "./modules/verification/verification.routes.js";
import vitrinesRoutes from "./modules/vitrines/vitrines.routes.js";
import appVersionRoutes from "./modules/app-version/app-version.routes.js";
import knowledgeBaseRoutes from "./modules/knowledge-base/knowledge-base.routes.js";
import knowledgeAiRoutes from "./modules/knowledge-ai/knowledge-ai.routes.js";
import externalIntelRoutes from "./modules/external-intel/external-intel.routes.js";
import { startMidnightScheduler, stopMidnightScheduler } from "./modules/external-intel/midnight-scheduler.service.js";
import { startVerificationScheduler } from "./modules/verification/verification.service.js";
import { startAdScheduler } from "./modules/ads/ads.service.js";
import { setupSocketServer } from "./modules/messaging/socket.js";
import { errorHandler } from "./shared/errors/error-handler.js";
import { seedDefaultAgents } from "./modules/analytics/ai-admin.service.js";
import { getRedis, disconnectRedis } from "./shared/db/redis.js";
import { batchCreateWeeklySnapshots } from "./modules/analytics/ai-memory.service.js";
import { startAdOrchestrator } from "./modules/ads/kinsell-internal-ads-orchestrator.js";
import { runSubscriptionExpiryCheck, clearSubscriptionCache } from "./shared/billing/subscription-guard.js";
import { startScoringScheduler } from "./modules/sokin/sokin-scoring.service.js";
import { startAiAutonomyScheduler } from "./modules/analytics/ai-autonomy.service.js";
import { expireBoosts, notifyBoostExpiringSoon } from "./modules/ads/ads-boost.service.js";
import { startMessengerScheduler, stopMessengerScheduler } from "./modules/ads/messenger-scheduler.service.js";

const app = express();
const httpServer = createServer(app);

// ── Production-ready middleware ──
if (env.NODE_ENV === "production") {
  // Cloudflare -> Nginx -> API (2 hops) to preserve the real client IP.
  app.set("trust proxy", 2);
}
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  contentSecurityPolicy: false, // CSP handled by nginx/frontend
}));
app.use(compression());
app.use(pinoHttp({ logger, genReqId: genRequestId, autoLogging: { ignore: (req: any) => req.url === "/health" } }) as any);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Parse comma-separated CORS origins into array for proper matching
const corsOrigins = env.CORS_ORIGIN.includes(",")
  ? env.CORS_ORIGIN.split(",").map((s) => s.trim())
  : env.CORS_ORIGIN;
app.use(cors({ origin: corsOrigins, credentials: true }));

// ── CSRF Origin guard — bloque les requêtes mutantes cross-origin non légitimes ──
const allowedOrigins = new Set(
  Array.isArray(corsOrigins) ? corsOrigins : [corsOrigins]
);
app.use((req, res, next) => {
  // Seules les méthodes mutantes sont vérifiées (GET/HEAD/OPTIONS sont safe)
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  // Exclure les webhooks tiers (Mobile Money, PayPal IPN) — ils ont leur propre auth
  if (req.path.startsWith("/mobile-money/webhook") || req.path.startsWith("/billing/ipn")) {
    return next();
  }

  const origin = req.get("Origin");
  const referer = req.get("Referer");
  const source = origin || (referer ? new URL(referer).origin : undefined);

  // Si pas d'origin (ex: appels serveur-à-serveur, mobile natif sans Origin), 
  // on laisse passer — l'auth cookie nécessite sameSite=none + secure donc seul un
  // navigateur enverrait les cookies, et un navigateur inclut toujours Origin sur cross-origin.
  if (!source) return next();

  if (!allowedOrigins.has(source)) {
    logger.warn({ origin: source, path: req.path, method: req.method }, "CSRF: origin rejeté");
    res.status(403).json({ error: "Origin non autorisé" });
    return;
  }
  next();
});

// ── Serve uploaded files statically (AVANT scrapeGuard pour éviter les 429 sur images) ──
const uploadAllowedOrigins = String(env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const isAllowedUploadSource = (source: string, allowedOrigins: string[]): boolean => {
  try {
    const parsed = new URL(source);
    return allowedOrigins.includes(parsed.origin);
  } catch {
    return allowedOrigins.some((origin) => source.startsWith(origin));
  }
};
app.use("/uploads", (req, res, next) => {
  // Protect only public media reads; upload POST/PATCH/DELETE keep auth flow unchanged.
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  if (env.NODE_ENV !== "production") { next(); return; }

  const ref = req.get("origin") || req.get("referer") || "";
  const ua = req.get("user-agent") || "";
  const host = req.get("x-forwarded-host") || req.get("host");
  const selfOrigins = host ? [`https://${host}`, `http://${host}`] : [];
  const allowed = [...uploadAllowedOrigins, ...selfOrigins];

  // Allow native app and no-referrer fetches (common with privacy browsers/Cloudflare fetches).
  const isNativeApp = /KinSellApp/i.test(ua);
  const hasExplicitSource = ref.trim().length > 0;
  const isAllowed = isNativeApp || !hasExplicitSource || isAllowedUploadSource(ref, allowed);
  if (!isAllowed) {
    logger.warn({
      path: req.path,
      method: req.method,
      source: ref,
      host,
      cfRay: req.get("cf-ray"),
      cfConnectingIp: req.get("cf-connecting-ip"),
    }, "Uploads blocked by origin guard");
    res.status(403).end();
    return;
  }

  // Long cache + streaming-friendly headers for images/video/audio delivery.
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Accept-Ranges", "bytes");
  res.set("Vary", "Origin");
  next();
});
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

// ── Global scrape guard (block bots/scrapers on all routes) ──
import { scrapeGuard } from "./shared/middleware/scrape-guard.middleware.js";
app.use(scrapeGuard());

// ── Cache-Control headers pour réponses API ──
app.use((req, res, next) => {
  if (req.method === "GET") {
    // Endpoints publics (explorer, listings, blog) : cache navigateur 5 min
    if (/^\/(explorer|listings|blog|geo)/.test(req.path)) {
      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    }
    // Données session (account, orders, etc.) : JAMAIS cacher — empêche fuite cross-user via proxy
    else if (/^\/(account|orders|negotiations|messaging|notifications|billing|incentive)/.test(req.path)) {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.set("Vary", "Cookie, Authorization");
    }
    // Autres GET : cache court
    else {
      res.set("Cache-Control", "public, max-age=120");
    }
  } else {
    res.set("Cache-Control", "no-store");
  }
  next();
});

// ── ETag middleware — utilise l'ETag natif Express (CRC32, rapide) ──
// Désactivé sur endpoints privés pour éviter fuite cross-user via proxy
app.use((_req, res, next) => {
  const isPrivate = /^\/(account|orders|negotiations|messaging|notifications|billing|incentive)/.test(_req.path);
  if (isPrivate) {
    // Désactiver ETag sur données privées
    res.set("ETag", "");
    res.removeHeader("ETag");
  }
  next();
});
// Activer l'ETag natif Express (weak, CRC32 — pas de double sérialisation)
app.set("etag", "weak");

let _healthCache: { data: unknown; expiresAt: number } | null = null;

app.get("/health", async (_req, res) => {
  const now = Date.now();
  if (_healthCache && now < _healthCache.expiresAt) {
    res.set("Cache-Control", "public, max-age=30");
    return res.json(_healthCache.data);
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisOk = !!getRedis();
    _healthCache = { data: { status: "ok", service: "kinsell-api", db: "connected", redis: redisOk ? "connected" : "fallback-memory", uptime: Math.floor(process.uptime()) }, expiresAt: now + 30_000 };
    res.set("Cache-Control", "public, max-age=30");
    res.json(_healthCache.data);
  } catch {
    _healthCache = null;
    res.status(503).json({ status: "degraded", service: "kinsell-api", db: "unreachable" });
  }
});

app.get("/roles", (_req, res) => {
  const roles = Object.values(Role).map((role) => ({
    role,
    canTrade: canTrade(role)
  }));

  res.json({ roles });
});

app.use("/auth", authRoutes);
app.use("/account", accountRoutes);
app.use("/users", usersRoutes);
app.use("/business-accounts", businessAccountsRoutes);
app.use("/listings", listingsRoutes);
app.use("/explorer", explorerRoutes);
app.use("/billing", billingRoutes);
app.use("/incentives", incentiveRoutes);
app.use("/orders", ordersRoutes);
app.use("/negotiations", negotiationsRoutes);
app.use("/uploads", uploadsRoutes);
app.use("/messaging", messagingRoutes);
app.use("/notifications", notificationsRoutes);
app.use("/admin", adminRoutes);
app.use("/admin/security", securityRoutes);
app.use("/ads", adsRoutes);
app.use("/blog", blogRoutes);
app.use("/sokin", sokinRoutes);
app.use("/sokin/trends", sokinTrendsRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/market", marketIntelligenceRoutes);
app.use("/contacts", contactsRoutes);
app.use("/mobile-money", mobileMoneyRoutes);
app.use("/geo", geoRoutes);
app.use("/reviews", reviewsRoutes);
app.use("/verification", verificationRoutes);
app.use("/vitrines", vitrinesRoutes);
app.use("/app-version", appVersionRoutes);
app.use("/knowledge-base", knowledgeBaseRoutes);
app.use("/knowledge-ai", knowledgeAiRoutes);
app.use("/market/external", externalIntelRoutes);

// ── Client-side error reporting endpoint ──
const _errorRateLimit = new Map<string, number>();
app.post("/errors", (req, res) => {
  const { type, message, stack, url, timestamp } = req.body || {};
  if (!type || !message) {
    res.status(400).json({ error: "type and message required" });
    return;
  }
  // Rate limit: 10 reports per IP per minute
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const count = _errorRateLimit.get(ip) ?? 0;
  if (count > 10) {
    res.status(429).end();
    return;
  }
  _errorRateLimit.set(ip, count + 1);
  setTimeout(() => {
    const c = _errorRateLimit.get(ip);
    if (c !== undefined) _errorRateLimit.set(ip, Math.max(0, c - 1));
  }, 60_000);

  const sanitize = (v: unknown, max: number) => String(v ?? "").replace(/[\x00-\x1f]/g, "").slice(0, max);

  logger.warn({
    clientError: true,
    errorType: sanitize(type, 80),
    errorMessage: sanitize(message, 500),
    errorStack: sanitize(stack, 1000),
    errorUrl: sanitize(url, 300),
    errorTimestamp: timestamp,
    ip,
    ua: req.headers["user-agent"],
  }, `[Client Error] ${sanitize(type, 80)}: ${sanitize(message, 200)}`);

  res.status(204).end();
});

app.use(errorHandler);

// Setup Socket.IO with WebRTC signaling
setupSocketServer(httpServer, env.CORS_ORIGIN);

httpServer.listen(env.API_PORT, async () => {
  logger.info("Kin-Sell API lancee sur le port " + env.API_PORT);
  // Warm up Redis connection
  getRedis();
  startAdScheduler();
  startScoringScheduler();
  await seedDefaultAgents();
  startVerificationScheduler();
  // Weekly snapshots scheduler: every Sunday at 02:00 (check every hour)
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const scheduleWeeklySnapshots = () => {
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
    nextSunday.setHours(2, 0, 0, 0);
    if (nextSunday <= now) nextSunday.setDate(nextSunday.getDate() + 7);
    const delay = nextSunday.getTime() - now.getTime();
    setTimeout(() => {
      void batchCreateWeeklySnapshots().catch(() => {});
      setInterval(() => { void batchCreateWeeklySnapshots().catch(() => {}); }, WEEK_MS);
    }, delay);
    logger.info(`[Analytics] Weekly snapshots scheduled in ${Math.round(delay / 3600_000)}h`);
  };
  scheduleWeeklySnapshots();
  // Start autonomous IA Ads orchestrator (Gemini + ChatGPT)
  startAdOrchestrator();
  // ── Subscription expiry scheduler (every 30 min) ──
  // F18 fix: ensures subscriptions & addons with past endsAt get expired
  const runExpiry = async () => {
    try {
      clearSubscriptionCache();
      const r = await runSubscriptionExpiryCheck();
      if (r.expiredSubscriptions || r.expiredAddons) {
        logger.info(`[Billing] Expired ${r.expiredSubscriptions} subs, ${r.expiredAddons} addons`);
      }
    } catch (err) {
      logger.error(err, "[Billing] Subscription expiry check failed");
    }
  };
  // First run after 60s, then every 30min
  setTimeout(() => { void runExpiry(); }, 60_000);
  setInterval(() => { void runExpiry(); }, 30 * 60 * 1000);
  logger.info("[Billing] Subscription expiry scheduler started (every 30min)");
  // ── IA Autonomie Scheduler ──
  startAiAutonomyScheduler();
  logger.info("[IA] Agents initialisés — scheduler autonome activé");

  // ── Promo Scheduler: activate scheduled + expire ended (every 5 min) ──
  const runPromoScheduler = async () => {
    try {
      const { activateScheduledPromos, expireEndedPromos } = await import("./modules/listings/listings.service.js");
      const [activated, expired] = await Promise.all([
        activateScheduledPromos(),
        expireEndedPromos(),
      ]);
      if (activated.activated > 0 || expired.expired > 0) {
        logger.info(`[Promo] Scheduler: ${activated.activated} activées, ${expired.expired} expirées`);
      }
    } catch (err: unknown) {
      logger.error(`[Promo] Scheduler error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  setTimeout(() => { void runPromoScheduler(); }, 30_000);
  setInterval(() => { void runPromoScheduler(); }, 5 * 60 * 1000);
  logger.info("[Promo] Scheduler démarré (toutes les 5 min)");

  // ── Boost expiration scheduler (every 10 min) ──
  const runBoostScheduler = async () => {
    try {
      const expired = await expireBoosts();
      const warned = await notifyBoostExpiringSoon();
      if (expired > 0 || warned > 0) {
        logger.info(`[Boost] Scheduler: ${expired} expiré(s), ${warned} pré-notif(s)`);
      }
    } catch (err) {
      logger.error(err, "[Boost] Scheduler error");
    }
  };
  setTimeout(() => { void runBoostScheduler(); }, 45_000);
  setInterval(() => { void runBoostScheduler(); }, 10 * 60 * 1000);
  logger.info("[Boost] Expiration scheduler démarré (toutes les 10 min)");

  // ── Incentive Scheduler: expire coupons/grants (every hour) + rebalance 100% (daily) ──
  const runIncentiveExpiration = async () => {
    try {
      const { runExpirationJob } = await import("./modules/incentives/incentive.service.js");
      const result = await runExpirationJob();
      if (result.expiredCoupons > 0 || result.expiredGrants > 0) {
        logger.info(`[Incentive] Expiration: ${result.expiredCoupons} coupons, ${result.expiredGrants} grants expirés`);
      }
    } catch (err) {
      logger.error(err, "[Incentive] Expiration job error");
    }
  };
  const runIncentiveRebalance = async () => {
    try {
      const { runRebalance100Job } = await import("./modules/incentives/incentive.service.js");
      const result = await runRebalance100Job();
      if (result.generated > 0) {
        logger.info(`[Incentive] Rebalance: ${result.generated} coupons 100% créés`);
      }
    } catch (err) {
      logger.error(err, "[Incentive] Rebalance job error");
    }
  };
  setTimeout(() => { void runIncentiveExpiration(); }, 60_000);
  setInterval(() => { void runIncentiveExpiration(); }, 60 * 60 * 1000); // every hour
  setTimeout(() => { void runIncentiveRebalance(); }, 120_000);
  setInterval(() => { void runIncentiveRebalance(); }, 24 * 60 * 60 * 1000); // daily
  logger.info("[Incentive] Schedulers démarrés (expiration: 1h, rebalance: 24h)");

  // ── Messenger Scheduler (campagnes autonomes: 2h / 24h) ──
  startMessengerScheduler();

  // ── Midnight Scheduler (External Intel + KB refresh) ──
  startMidnightScheduler();
});

// ── Graceful shutdown ──
const shutdown = async (signal: string) => {
  logger.info(`${signal} reçu — arrêt gracieux...`);
  stopMidnightScheduler();
  stopMessengerScheduler();
  httpServer.close(async () => {
    await disconnectRedis();
    await prisma.$disconnect();
    logger.info("Serveur arrêté proprement.");
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => { process.exit(1); }, 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

