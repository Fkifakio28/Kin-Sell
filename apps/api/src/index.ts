import cors from "cors";
import compression from "compression";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import path from "node:path";
import pinoHttpModule from "pino-http";
const pinoHttp = (pinoHttpModule as any).default || pinoHttpModule;
import { env } from "./config/env.js";
import { logger } from "./shared/logger.js";
import { prisma } from "./shared/db/prisma.js";
import { canTrade, Role } from "./types/roles.js";
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import businessAccountsRoutes from "./modules/businesses/business-accounts.routes.js";
import listingsRoutes from "./modules/listings/listings.routes.js";
import explorerRoutes from "./modules/explorer/explorer.routes.js";
import accountRoutes from "./modules/account/account.routes.js";
import billingRoutes from "./modules/billing/billing.routes.js";
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
import sokinLiveRoutes from "./modules/sokin/sokin-live.routes.js";
import sokinStoriesRoutes from "./modules/sokin/sokin-stories.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import marketIntelligenceRoutes from "./modules/market-intelligence/market-intelligence.routes.js";
import sokinTrendsRoutes from "./modules/sokin-trends/sokin-trends.routes.js";
import contactsRoutes from "./modules/contacts/contacts.routes.js";
import mobileMoneyRoutes from "./modules/mobile-money/mobile-money.routes.js";
import geoRoutes from "./modules/geo/geo.routes.js";
import reviewsRoutes from "./modules/reviews/reviews.routes.js";
import { startAdScheduler } from "./modules/ads/ads.service.js";
import { setupSocketServer } from "./modules/messaging/socket.js";
import { errorHandler } from "./shared/errors/error-handler.js";
import { startAiAutonomyScheduler } from "./modules/analytics/ai-autonomy.service.js";
import { seedDefaultAgents } from "./modules/analytics/ai-admin.service.js";

const app = express();
const httpServer = createServer(app);

// ── Production-ready middleware ──
if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req: any) => req.url === "/health" } }) as any);
app.use(express.json({ limit: "20mb" }));
app.use(cors({ origin: env.CORS_ORIGIN }));

// Serve uploaded files statically
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "kinsell-api", db: "connected", uptime: Math.floor(process.uptime()) });
  } catch {
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
app.use("/sokin/lives", sokinLiveRoutes);
app.use("/sokin/stories", sokinStoriesRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/market", marketIntelligenceRoutes);
app.use("/sokin-trends", sokinTrendsRoutes);
app.use("/contacts", contactsRoutes);
app.use("/mobile-money", mobileMoneyRoutes);
app.use("/geo", geoRoutes);
app.use("/reviews", reviewsRoutes);

app.use(errorHandler);

// Setup Socket.IO with WebRTC signaling
setupSocketServer(httpServer, env.CORS_ORIGIN);

httpServer.listen(env.API_PORT, async () => {
  logger.info("Kin-Sell API lancee sur le port " + env.API_PORT);
  startAdScheduler();
  await seedDefaultAgents();
  startAiAutonomyScheduler();
  logger.info("[IA] Agents initialisés + Scheduler autonome démarré");
});

// ── Graceful shutdown ──
const shutdown = async (signal: string) => {
  logger.info(`${signal} reçu — arrêt gracieux...`);
  httpServer.close(async () => {
    await prisma.$disconnect();
    logger.info("Serveur arrêté proprement.");
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => { process.exit(1); }, 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
