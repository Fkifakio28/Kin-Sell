import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { Role } from "../../types/roles.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { prisma } from "../../shared/db/prisma.js";
import * as adminService from "./admin.service.js";
import * as messageGuardService from "../message-guard/message-guard.service.js";
import * as adsService from "../ads/ads.service.js";
import aiAdminRoutes from "../analytics/ai-admin.routes.js";
import adminJobAnalyticsRoutes from "../job-analytics/admin-job-analytics.routes.js";
import * as iaAdsPlacements from "../ads/ia-ads-placements.service.js";
import * as iaMessengerPromo from "../ads/ia-messenger-promo.service.js";
import * as messengerScheduler from "../ads/messenger-scheduler.service.js";
import * as marketIntelligence from "../market-intelligence/market-intelligence.service.js";
import * as billingService from "../billing/billing.service.js";
import * as aiTrigger from "../analytics/ai-trigger.service.js";
import { getFusedIntelligence } from "../external-intel/external-intelligence-fusion.service.js";
import { getCategoryDemandAnalysis } from "../analytics/analytics-external-intelligence.service.js";
import { logger } from "../../shared/logger.js";

const router = Router();

// All admin routes require ADMIN or SUPER_ADMIN
router.use(requireAuth, requireRoles(Role.ADMIN, Role.SUPER_ADMIN));

// ── Permission check middleware ──
async function checkPermission(req: AuthenticatedRequest, permission: string) {
  if (req.auth!.role === Role.SUPER_ADMIN) return; // Super admin bypasses all
  const profile = await prisma.adminProfile.findUnique({ where: { userId: req.auth!.userId } });
  if (!profile || !profile.permissions.includes(permission as any)) {
    throw new HttpError(403, `Permission requise: ${permission}`);
  }
}

async function getActorLevel(req: AuthenticatedRequest): Promise<string> {
  if (req.auth!.role === Role.SUPER_ADMIN) return "LEVEL_0";
  const profile = await prisma.adminProfile.findUnique({ where: { userId: req.auth!.userId } });
  return profile?.level ?? "LEVEL_5";
}

// ════════════════════════════════════════════
// 1. DASHBOARD
// ════════════════════════════════════════════

router.get("/stats", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "DASHBOARD");
  const stats = await adminService.getDashboardStats();
  res.json(stats);
}));

// ════════════════════════════════════════════
// 2. USERS
// ════════════════════════════════════════════

const userSearchSchema = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  search: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
  country: z.string().optional(),
});

router.get("/users", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "USERS");
  const params = userSearchSchema.parse(req.query);
  const result = await adminService.listUsers(params);
  res.json(result);
}));

router.get("/users/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "USERS");
  const result = await adminService.getUserDetail(req.params.id);
  res.json(result);
}));

router.patch("/users/:id/role", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "USERS");
  const { role } = z.object({ role: z.string() }).parse(req.body);
  const result = await adminService.changeUserRole(req.params.id, role);
  res.json(result);
}));

router.post("/users/:id/suspend", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "USERS");
  const body = z.object({
    durationHours: z.number(),
    reason: z.string().min(3),
    adminPassword: z.string().min(1),
  }).parse(req.body);

  const result = await adminService.suspendUser(
    req.params.id,
    body.durationHours,
    body.reason,
    body.adminPassword,
    req.auth!.userId
  );
  res.json(result);
}));

router.post("/users/:id/unsuspend", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "USERS");
  const result = await adminService.unsuspendUser(req.params.id);
  res.json(result);
}));

router.post("/users/create", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "USERS");
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    displayName: z.string().min(2),
    role: z.string().optional(),
  }).parse(req.body);
  const result = await adminService.createUser({ ...body, role: body.role ?? "USER" });
  res.json(result);
}));

// ════════════════════════════════════════════
// 3. BLOG
// ════════════════════════════════════════════

router.get("/blog", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "BLOG");
  const params = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    status: z.string().optional(),
    category: z.string().optional(),
    search: z.string().optional(),
    language: z.string().optional(),
    sortBy: z.string().optional(),
  }).parse(req.query);
  const result = await adminService.listBlogPosts(params);
  res.json(result);
}));

router.get("/blog/analytics", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "BLOG");
  const result = await adminService.getBlogAnalytics();
  res.json(result);
}));

router.get("/blog/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "BLOG");
  const result = await adminService.getBlogPost(req.params.id);
  res.json(result);
}));

router.post("/blog", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "BLOG");
  const body = z.object({
    title: z.string().min(2),
    content: z.string().min(10),
    excerpt: z.string().optional(),
    coverImage: z.string().optional(),
    mediaUrl: z.string().optional(),
    mediaType: z.string().optional(),
    gifUrl: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    language: z.string().optional(),
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    status: z.string().optional(),
  }).parse(req.body);
  const result = await adminService.createBlogPost(req.auth!.userId, body);
  res.json(result);
}));

router.post("/blog/generate-announcements", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "BLOG");
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    throw new HttpError(403, "Operation reservee au super admin");
  }
  const body = z.object({ count: z.number().int().min(1).max(30).optional() }).parse(req.body ?? {});
  const result = await adminService.generateBlogAnnouncementsFromGemini(req.auth!.userId, body.count ?? 15);
  res.json(result);
}));

router.patch("/blog/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "BLOG");
  const body = z.object({
    title: z.string().min(2).optional(),
    content: z.string().min(10).optional(),
    excerpt: z.string().nullable().optional(),
    coverImage: z.string().nullable().optional(),
    mediaUrl: z.string().nullable().optional(),
    mediaType: z.string().nullable().optional(),
    gifUrl: z.string().nullable().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    language: z.string().optional(),
    metaTitle: z.string().nullable().optional(),
    metaDescription: z.string().nullable().optional(),
    status: z.string().optional(),
  }).parse(req.body);
  const result = await adminService.updateBlogPost(req.params.id, body);
  res.json(result);
}));

router.delete("/blog/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "BLOG");
  const result = await adminService.deleteBlogPost(req.params.id);
  res.json(result);
}));

// ════════════════════════════════════════════
// 4. TRANSACTIONS
// ════════════════════════════════════════════

router.get("/transactions", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "TRANSACTIONS");
  const params = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
    search: z.string().optional(),
  }).parse(req.query);
  const result = await adminService.listTransactions(params);
  res.json(result);
}));

// ════════════════════════════════════════════
// 5. REPORTS / SIGNALEMENTS
// ════════════════════════════════════════════

router.get("/reports", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "REPORTS");
  const params = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    status: z.string().optional(),
  }).parse(req.query);
  const result = await adminService.listReports(params);
  res.json(result);
}));

router.post("/reports/:id/resolve", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "REPORTS");
  const { resolution } = z.object({ resolution: z.string().min(5) }).parse(req.body);
  const result = await adminService.resolveReport(req.params.id, req.auth!.userId, resolution);
  res.json(result);
}));

// ════════════════════════════════════════════
// 8. ADS
// ════════════════════════════════════════════

router.get("/ads", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADS");
  const result = await adminService.listAdOffers();
  res.json(result);
}));

router.post("/ads", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADS");
  const body = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    priceUsdCents: z.number(),
    durationDays: z.number(),
    features: z.array(z.string()).optional(),
  }).parse(req.body);
  const result = await adminService.createAdOffer(body);
  res.json(result);
}));

router.patch("/ads/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADS");
  const result = await adminService.updateAdOffer(req.params.id, req.body);
  res.json(result);
}));

router.delete("/ads/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADS");
  await adminService.deleteAdOffer(req.params.id);
  res.json({ success: true });
}));

// ════════════════════════════════════════════
// 12. IA MANAGEMENT — Centre de pilotage complet
// ════════════════════════════════════════════

router.get("/ai-agents", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const { status, domain, type } = z.object({
    status: z.string().optional(),
    domain: z.string().optional(),
    type: z.string().optional(),
  }).parse(req.query);
  const result = await adminService.listAiAgents({ status, domain, type });
  res.json(result);
}));

router.get("/ai-agents/stats", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const result = await adminService.getAiManagementStats();
  res.json(result);
}));

router.get("/ai-agents/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const result = await adminService.getAiAgentDetail(req.params.id);
  res.json(result);
}));

router.get("/ai-agents/:id/logs", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  // Get slug from the agent first
  const agent = await adminService.getAiAgentDetail(req.params.id);
  const { page, limit, success, actionType } = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    success: z.enum(["true", "false"]).optional().transform(v => v === undefined ? undefined : v === "true"),
    actionType: z.string().optional(),
  }).parse(req.query);
  const result = await adminService.getAiAgentLogs(agent.slug, { page, limit, success, actionType });
  res.json(result);
}));

router.patch("/ai-agents/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    throw new HttpError(403, "Seul le Super Admin peut gérer les IA");
  }
  const body = z.object({
    enabled: z.boolean().optional(),
    level: z.string().optional(),
    status: z.string().optional(),
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    version: z.string().optional(),
    config: z.record(z.unknown()).optional(),
  }).parse(req.body);
  const result = await adminService.updateAiAgent(req.params.id, body);
  res.json(result);
}));

// ── AI Admin Control Panel (sous-routes avancées) ──
router.use("/ai-control", aiAdminRoutes);

// ── Job Analytics Admin (Chantier J5) — override manuel + refresh manuel + métriques ──
router.use("/analytics/jobs", adminJobAnalyticsRoutes);

// ════════════════════════════════════════════
// 13. RANKINGS
// ════════════════════════════════════════════

router.get("/rankings", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "RANKINGS");
  const { period, type } = z.object({
    period: z.enum(["month", "all"]).optional(),
    type: z.enum(["all", "user", "business"]).optional(),
  }).parse(req.query);
  const result = await adminService.getRankings(period ?? "all", type ?? "all");
  res.json(result);
}));

// ════════════════════════════════════════════
// 14. ADMIN MANAGEMENT
// ════════════════════════════════════════════

router.get("/admins", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADMINS");
  const result = await adminService.listAdmins();
  res.json(result);
}));

router.post("/admins/create", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADMINS");
  // Only SUPER_ADMIN can create admins
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    throw new HttpError(403, "Seul le Super Admin peut créer des comptes admin");
  }
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    displayName: z.string().min(2),
    level: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  }).parse(req.body);
  const result = await adminService.createAdmin(body);

  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "CREATE_ADMIN",
      entityType: "User",
      entityId: result.id,
      metadata: { email: body.email, level: body.level ?? "LEVEL_5" },
    },
  });

  res.json(result);
}));

router.patch("/admins/:id/profile", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADMINS");
  const body = z.object({
    level: z.string().optional(),
    permissions: z.array(z.string()).optional(),
  }).parse(req.body);
  const actorLevel = await getActorLevel(req);
  const result = await adminService.updateAdminProfile(req.params.id, body, actorLevel);
  res.json(result);
}));

router.post("/admins/:id/demote", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADMINS");
  const actorLevel = await getActorLevel(req);
  const target = await prisma.adminProfile.findUnique({ where: { userId: req.params.id } });
  if (target) {
    const levelNum = (l: string) => parseInt(l.replace("LEVEL_", ""), 10);
    if (levelNum(target.level) < levelNum(actorLevel)) {
      throw new HttpError(403, "Vous ne pouvez pas rétrograder un admin de niveau supérieur");
    }
  }
  const result = await adminService.demoteAdmin(req.params.id);

  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "DEMOTE_ADMIN",
      entityType: "User",
      entityId: req.params.id,
    },
  });

  res.json(result);
}));

router.get("/admins/level-permissions/:level", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADMINS");
  const perms = adminService.getDefaultPermissionsForLevel(req.params.level);
  res.json({ level: req.params.level, permissions: perms });
}));

// ════════════════════════════════════════════
// 14b. APPELS DE SUSPENSION
// ════════════════════════════════════════════

router.get("/appeals", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "USERS");
  const params = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }).parse(req.query);
  const result = await adminService.listAppeals(params);
  res.json(result);
}));

// ════════════════════════════════════════════
// 15. CURRENCY RATES
// ════════════════════════════════════════════

router.get("/currency-rates", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "CURRENCY");
  const result = await adminService.listCurrencyRates();
  res.json(result);
}));

router.put("/currency-rates", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "CURRENCY");
  const body = z.object({
    fromCurrency: z.string().min(2).max(5),
    toCurrency: z.string().min(2).max(5),
    rate: z.number().positive(),
  }).parse(req.body);
  const result = await adminService.upsertCurrencyRate({ ...body, updatedBy: req.auth!.userId });
  res.json(result);
}));

// ════════════════════════════════════════════
// 16. AUDIT LOG
// ════════════════════════════════════════════

router.get("/audit-logs", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AUDIT");
  const params = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    actorId: z.string().optional(),
  }).parse(req.query);
  const result = await adminService.listAuditLogs(params);
  res.json(result);
}));

// ════════════════════════════════════════════
// 17. SETTINGS
// ════════════════════════════════════════════

router.get("/settings", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SETTINGS");
  const result = await adminService.getSiteSettings();
  res.json(result);
}));

router.put("/settings/:key", asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    throw new HttpError(403, "Seul le Super Admin peut modifier les paramètres du site");
  }
  const { value } = z.object({ value: z.string() }).parse(req.body);
  const result = await adminService.updateSiteSetting(req.params.key, value);

  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "UPDATE_SETTING",
      entityType: "SiteSetting",
      entityId: req.params.key,
      metadata: { value },
    },
  });

  res.json(result);
}));

// ════════════════════════════════════════════
// ADMIN PROFILE (self)
// ════════════════════════════════════════════

router.get("/me", asyncHandler(async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { profile: true, adminProfile: true },
  });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");

  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.profile?.displayName ?? "Admin",
    avatarUrl: user.profile?.avatarUrl ?? null,
    level: user.adminProfile?.level ?? (user.role === "SUPER_ADMIN" ? "LEVEL_0" : "LEVEL_5"),
    permissions: user.adminProfile?.permissions ?? (user.role === "SUPER_ADMIN" ? ["ALL"] : ["DASHBOARD"]),
  });
}));

// ════════════════════════════════════════════
// MESSAGE GUARD AI — Contrôle IA messagerie
// ════════════════════════════════════════════

/* Dashboard MessageGuard */
router.get("/message-guard/dashboard", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const dashboard = await messageGuardService.getGuardDashboard();
  res.json(dashboard);
}));

/* Logs MessageGuard (paginés + filtres) */
router.get("/message-guard/logs", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const params = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    verdict: z.string().optional(),
    userId: z.string().optional(),
    category: z.string().optional(),
  }).parse(req.query);
  const result = await messageGuardService.getGuardLogs(params);
  res.json(result);
}));

/* Config MessageGuard */
router.get("/message-guard/config", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const config = await messageGuardService.getGuardConfig();
  res.json(config);
}));

/* Mettre à jour la config MessageGuard (SUPER_ADMIN only) */
router.patch("/message-guard/config", asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    throw new HttpError(403, "Seul le Super Admin peut configurer l'IA MessageGuard");
  }
  const body = z.object({
    key: z.string().min(1),
    value: z.any(),
  }).parse(req.body);
  const config = await messageGuardService.updateGuardConfig(body.key, body.value, req.auth!.userId);
  res.json(config);
}));

// ════════════════════════════════════════════
// FEED — So-Kin Posts (modération)
// ════════════════════════════════════════════

router.get("/feed", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "FEED");
  const params = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
  }).parse(req.query);
  const result = await adminService.listFeedPosts(params);
  res.json(result);
}));

router.get("/feed/stats", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "FEED");
  const stats = await adminService.getFeedStats();
  res.json(stats);
}));

router.patch("/feed/:id/moderate", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "FEED");
  const body = z.object({
    action: z.enum(["ACTIVE", "FLAGGED", "HIDDEN", "DELETED"]),
    note: z.string().optional(),
  }).parse(req.body);
  const result = await adminService.moderateFeedPost(req.params.id, req.auth!.userId, body.action, body.note);
  res.json(result);
}));

// ════════════════════════════════════════════
// DONATIONS & ACHATS PUB
// ════════════════════════════════════════════

router.get("/donations", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "DONATIONS");
  const params = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    status: z.string().optional(),
    type: z.string().optional(),
  }).parse(req.query);
  const result = await adminService.listDonations(params);
  res.json(result);
}));

router.patch("/donations/:id/status", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "DONATIONS");
  const body = z.object({
    status: z.enum(["COMPLETED", "REFUNDED", "FAILED"]),
  }).parse(req.body);
  const result = await adminService.updateDonationStatus(req.params.id, req.auth!.userId, body.status);
  res.json(result);
}));

// ════════════════════════════════════════════
// ADMIN SEND MESSAGE (DM)
// ════════════════════════════════════════════

router.post("/send-message", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "MESSAGING");
  const body = z.object({
    targetUserId: z.string().min(1),
    content: z.string().min(1).max(2000),
  }).parse(req.body);
  const result = await adminService.adminSendMessage(req.auth!.userId, body.targetUserId, body.content);
  res.json(result);
}));

// ════════════════════════════════════════════
// CLEANUP / OPTIMISATION
// ════════════════════════════════════════════

router.post("/cleanup", asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    throw new HttpError(403, "Seul le Super Admin peut lancer l'optimisation");
  }
  const result = await adminService.runCleanup();
  res.json(result);
}));

// ── Routes publicités clients ──────────────────────────────────
router.get("/advertisements", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADVERTISEMENTS");
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const data = await adsService.adminListAds({ page, limit, status, type, search });
  res.json(data);
}));

router.post("/advertisements", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADVERTISEMENTS");
  const ad = await adsService.adminCreateAd(req.body);
  res.status(201).json(ad);
}));

router.patch("/advertisements/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADVERTISEMENTS");
  const ad = await adsService.adminUpdateAd(req.params.id, req.body);
  res.json(ad);
}));

router.patch("/advertisements/:id/status", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADVERTISEMENTS");
  const { status, cancelNote } = req.body;
  const cancelledBy = req.auth?.userId;
  const ad = await adsService.adminPatchStatus(req.params.id, status, cancelNote, cancelledBy);
  res.json(ad);
}));

router.delete("/advertisements/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADVERTISEMENTS");
  await adsService.adminDeleteAd(req.params.id);
  res.json({ ok: true });
}));

// ════════════════════════════════════════════
// LISTINGS — Gestion des articles (admin)
// ════════════════════════════════════════════

router.get("/listings", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "LISTINGS");
  const { status, type, page, limit, q } = req.query as Record<string, string | undefined>;
  const result = await adminService.adminListListings({
    status: status as string | undefined,
    type: type as string | undefined,
    q,
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
  });
  res.json(result);
}));

router.patch("/listings/:id/negotiable", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "LISTINGS");
  const { isNegotiable } = z.object({ isNegotiable: z.boolean() }).parse(req.body);
  const result = await adminService.adminToggleListingNegotiable(req.params.id, isNegotiable, req.auth!.userId);
  res.json(result);
}));

router.patch("/listings/:id/status", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "LISTINGS");
  const { status } = z.object({ status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED", "DELETED"]) }).parse(req.body);
  const result = await adminService.adminChangeListingStatus(req.params.id, status, req.auth!.userId);
  res.json(result);
}));

// ── Category Negotiation Rules ──

router.get("/negotiation-rules", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "NEGOTIATION_RULES");
  const rules = await adminService.getCategoryNegotiationRules();
  res.json(rules);
}));

router.post("/negotiation-rules/toggle", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "NEGOTIATION_RULES");
  const { category, locked } = z.object({ category: z.string().min(1), locked: z.boolean() }).parse(req.body);
  const rule = await adminService.toggleCategoryNegotiation(category, locked, req.auth!.userId);
  res.json(rule);
}));

router.get("/negotiation-rules/locked-categories", asyncHandler(async (req: AuthenticatedRequest, res) => {
  // Pas de permission admin requise — endpoint public pour enforcement frontend
  const locked = await adminService.getLockedCategories();
  res.json(locked);
}));

// ══════════════════════════════════════════════
// AI RECOMMENDATIONS & TRIALS — Admin stats
// ══════════════════════════════════════════════

router.get("/ai-recommendations/stats", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");
  const raw = await aiTrigger.getRecommendationStats();
  // Flatten to match frontend AdminAiRecommendationStats shape
  const recs = raw.recommendations;
  res.json({
    total: recs.total,
    active: recs.active,
    clicked: recs.clicked,
    accepted: recs.accepted,
    dismissed: recs.dismissed,
    byEngine: Object.fromEntries(recs.byEngine.map((e: any) => [e.engine, e.count])),
    byTrigger: Object.fromEntries(recs.byTrigger.map((t: any) => [t.trigger, t.count])),
    trials: {
      total: raw.trials.total,
      ...Object.fromEntries(raw.trials.byStatus.map((s: any) => [s.status.toLowerCase(), s.count])),
    },
  });
}));

// ── Admin manual plan activation ──
const adminActivateSchema = z.object({
  userId: z.string().min(1),
  planCode: z.string().min(1),
  durationDays: z.number().int().min(1).max(365).default(30),
  reason: z.string().min(1).max(500),
  exempt: z.boolean().default(false),
});

router.post("/subscriptions/activate", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "BILLING");
  const payload = adminActivateSchema.parse(req.body);
  const result = await billingService.adminActivatePlan({
    ...payload,
    activatedBy: req.auth!.userId,
  });
  if (!result) throw new HttpError(404, "Utilisateur introuvable.");

  // Journaliser l'activation manuelle
  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "BILLING_ADMIN_ACTIVATE",
      entityType: "Subscription",
      entityId: payload.userId,
      metadata: {
        planCode: payload.planCode,
        durationDays: payload.durationDays,
        reason: payload.reason,
        exempt: payload.exempt,
      },
    },
  });

  res.json(result);
}));

// ── Admin list all subscriptions (enhanced) ──
router.get("/subscriptions", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const status = req.query.status as string | undefined;
  const scope = req.query.scope as string | undefined;
  const email = req.query.email as string | undefined;
  const planCode = req.query.planCode as string | undefined;
  const source = req.query.source as string | undefined; // "paypal" | "admin" | "all"
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") where.status = status;
  if (scope && scope !== "ALL") where.scope = scope;
  if (planCode && planCode !== "ALL") where.planCode = planCode;
  if (source === "admin") where.metadata = { path: ["adminActivated"], equals: true };
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    where.createdAt = dateFilter;
  }

  // Email filter requires a join condition
  const userFilter = email ? { user: { email: { contains: email, mode: "insensitive" as const } } } : {};

  const finalWhere = { ...where, ...userFilter };

  const [items, total] = await Promise.all([
    prisma.subscription.findMany({
      where: finalWhere,
      include: {
        user: { select: { id: true, email: true, role: true, profile: { select: { displayName: true } } } },
        business: { select: { id: true, publicName: true, slug: true } },
        addons: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.subscription.count({ where: finalWhere }),
  ]);

  // Normalize response shape for frontend
  const subscriptions = items.map((s) => ({
    id: s.id,
    userId: s.userId,
    businessId: s.businessId,
    scope: s.scope,
    planCode: s.planCode,
    status: s.status,
    billingCycle: s.billingCycle,
    priceUsdCents: s.priceUsdCents,
    autoRenew: s.autoRenew,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt?.toISOString() ?? null,
    metadata: s.metadata,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    source: (s.metadata as any)?.adminActivated ? "admin" : "paypal",
    user: s.user ? {
      displayName: s.user.profile?.displayName ?? s.user.email ?? "—",
      email: s.user.email,
      role: s.user.role,
    } : null,
    business: s.business ? { publicName: s.business.publicName, slug: s.business.slug } : null,
    addons: s.addons.map((a) => ({
      addonCode: a.addonCode,
      status: a.status,
      priceUsdCents: a.priceUsdCents,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt?.toISOString() ?? null,
    })),
  }));

  res.json({ subscriptions, total, page, limit });
}));

// ── Admin subscription KPIs ──
router.get("/subscriptions/kpi", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");

  const [active, expired, canceled, allSubs] = await Promise.all([
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "EXPIRED" } }),
    prisma.subscription.count({ where: { status: "CANCELED" } }),
    prisma.subscription.findMany({
      select: { metadata: true, status: true, planCode: true },
    }),
  ]);

  const adminActivated = allSubs.filter((s) => (s.metadata as any)?.adminActivated === true).length;
  const trials = await prisma.aiTrial.count();
  const trialsActive = await prisma.aiTrial.count({ where: { status: "ACTIVE" } });

  // Plan distribution
  const planCounts: Record<string, number> = {};
  for (const s of allSubs) {
    planCounts[s.planCode] = (planCounts[s.planCode] || 0) + 1;
  }

  res.json({
    active,
    expired,
    canceled,
    total: allSubs.length,
    adminActivated,
    trials,
    trialsActive,
    planDistribution: planCounts,
  });
}));

// ── Admin subscription detail (with audit trail) ──
router.get("/subscriptions/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");

  const sub = await prisma.subscription.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, email: true, role: true, accountStatus: true, profile: { select: { displayName: true, username: true } } } },
      business: { select: { id: true, publicName: true, slug: true, legalName: true } },
      addons: true,
    },
  });
  if (!sub) throw new HttpError(404, "Abonnement introuvable");

  // Audit trail — last 50 entries related to this subscription or its user
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Subscription", entityId: sub.id },
        { entityType: "Subscription", entityId: sub.userId ?? undefined },
        { action: { in: ["BILLING_ADMIN_ACTIVATE", "BILLING_VALIDATE_ORDER", "BILLING_FAIL_ORDER", "BILLING_SIMULATE_PLAN_CHANGE"] }, entityId: sub.userId ?? sub.businessId ?? undefined },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      metadata: true,
      createdAt: true,
      actorUserId: true,
    },
  });

  // Related payment orders
  const paymentOrders = await prisma.paymentOrder.findMany({
    where: sub.userId ? { userId: sub.userId } : { businessId: sub.businessId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      planCode: true,
      amountUsdCents: true,
      method: true,
      status: true,
      transferReference: true,
      createdAt: true,
      validatedAt: true,
    },
  });

  res.json({
    subscription: {
      id: sub.id,
      userId: sub.userId,
      businessId: sub.businessId,
      scope: sub.scope,
      planCode: sub.planCode,
      status: sub.status,
      billingCycle: sub.billingCycle,
      priceUsdCents: sub.priceUsdCents,
      autoRenew: sub.autoRenew,
      startsAt: sub.startsAt.toISOString(),
      endsAt: sub.endsAt?.toISOString() ?? null,
      metadata: sub.metadata,
      createdAt: sub.createdAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString(),
      source: (sub.metadata as any)?.adminActivated ? "admin" : "paypal",
    },
    user: sub.user ? { ...sub.user, status: sub.user.accountStatus } : null,
    business: sub.business,
    addons: sub.addons.map((a) => ({
      addonCode: a.addonCode,
      status: a.status,
      priceUsdCents: a.priceUsdCents,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt?.toISOString() ?? null,
    })),
    auditLogs,
    paymentOrders,
  });
}));

// ── Admin revoke subscription ──
router.post("/subscriptions/revoke", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");
  const { subscriptionId, reason } = z.object({
    subscriptionId: z.string().min(1),
    reason: z.string().min(1).max(500),
  }).parse(req.body);

  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new HttpError(404, "Abonnement introuvable");
  if (sub.status !== "ACTIVE") throw new HttpError(400, "Seul un abonnement actif peut être révoqué");

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: "CANCELED", autoRenew: false },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "BILLING_ADMIN_REVOKE",
      entityType: "Subscription",
      entityId: subscriptionId,
      metadata: { reason, planCode: sub.planCode, scope: sub.scope },
    },
  });

  res.json({ message: "Abonnement révoqué", subscriptionId, status: "CANCELED" });
}));

// ── Admin list all trials ──
router.get("/ai-trials", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const status = req.query.status as string | undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.aiTrial.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, role: true, profile: { select: { displayName: true } } } },
        business: { select: { id: true, publicName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.aiTrial.count({ where }),
  ]);

  res.json({ items, total, page, limit });
}));

// ── Admin activate trial (validate PENDING_ADMIN → ACTIVE) ──
router.post("/ai-trials/:id/activate", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "BILLING");
  const result = await aiTrigger.adminActivateTrial(req.auth!.userId, req.params.id);
  if (!result) throw new HttpError(404, "Essai introuvable ou statut invalide.");

  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "BILLING_ADMIN_TRIAL_ACTIVATE",
      entityType: "AiTrial",
      entityId: req.params.id,
      metadata: { trialId: req.params.id },
    },
  });

  res.json(result);
}));

// ════════════════════════════════════════════
// IA TABS — Dashboard Admin
// ════════════════════════════════════════════

// ── Kin-Sell Analytique (enrichi) ──
router.get("/ia/analytique", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers, newUsers24h, newUsers7d,
    totalListings, activeListings, newListings24h,
    totalOrders, orders7d, revenue7d, revenue30d,
    totalBusinesses,
    trendingCategories,
    topCities,
    avgPrice,
    boostedListings,
    deliveredOrders30d,
    marketCities,
    categoryPrices,
    topSellers,
    recentOrders,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: last24h } } }),
    prisma.user.count({ where: { createdAt: { gte: last7d } } }),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.listing.count({ where: { createdAt: { gte: last24h } } }),
    prisma.order.count(),
    prisma.order.count({ where: { createdAt: { gte: last7d } } }),
    prisma.order.aggregate({ _sum: { totalUsdCents: true }, where: { createdAt: { gte: last7d }, status: "DELIVERED" } }),
    prisma.order.aggregate({ _sum: { totalUsdCents: true }, where: { createdAt: { gte: last30d }, status: "DELIVERED" } }),
    prisma.businessAccount.count(),
    prisma.listing.groupBy({ by: ["category"], where: { createdAt: { gte: last30d }, status: "ACTIVE" }, _count: true, orderBy: { _count: { id: "desc" } }, take: 10 }),
    prisma.listing.groupBy({ by: ["city"], where: { status: "ACTIVE", city: { not: "" } }, _count: true, orderBy: { _count: { id: "desc" } }, take: 10 }),
    prisma.listing.aggregate({ where: { status: "ACTIVE" }, _avg: { priceUsdCents: true } }),
    prisma.listing.count({ where: { status: "ACTIVE", isBoosted: true } }),
    prisma.order.count({ where: { createdAt: { gte: last30d }, status: "DELIVERED" } }),
    prisma.marketCity.findMany({ where: { isActive: true }, select: { id: true, city: true, countryCode: true }, orderBy: { city: "asc" } }),
    prisma.listing.groupBy({ by: ["category"], where: { status: "ACTIVE" }, _avg: { priceUsdCents: true }, _min: { priceUsdCents: true }, _max: { priceUsdCents: true }, _count: true, orderBy: { _count: { id: "desc" } }, take: 20 }),
    prisma.order.groupBy({ by: ["sellerUserId"], where: { createdAt: { gte: last30d }, status: "DELIVERED" }, _count: true, _sum: { totalUsdCents: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    prisma.order.findMany({ where: { createdAt: { gte: last7d } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, totalUsdCents: true, currency: true, deliveryCity: true, createdAt: true, items: { select: { category: true, quantity: true } } } }),
  ]);

  // Fetch seller display names for top sellers
  const sellerIds = topSellers.map(s => s.sellerUserId);
  const sellerProfiles = sellerIds.length ? await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    select: { id: true, profile: { select: { displayName: true } } },
  }) : [];
  const sellerNameMap = new Map(sellerProfiles.map(u => [u.id, u.profile?.displayName ?? "Inconnu"]));

  res.json({
    users: { total: totalUsers, new24h: newUsers24h, new7d: newUsers7d },
    listings: { total: totalListings, active: activeListings, new24h: newListings24h, boosted: boostedListings, avgPriceUsdCents: Math.round(avgPrice._avg.priceUsdCents ?? 0) },
    orders: { total: totalOrders, last7d: orders7d, delivered30d: deliveredOrders30d, revenue7dCents: revenue7d._sum.totalUsdCents ?? 0, revenue30dCents: revenue30d._sum.totalUsdCents ?? 0 },
    businesses: totalBusinesses,
    trendingCategories: trendingCategories.map(c => ({ category: c.category, count: c._count })),
    topCities: topCities.map(c => ({ city: c.city, count: c._count })),
    marketCities,
    categoryPrices: categoryPrices.map(c => ({
      category: c.category,
      count: c._count,
      avgPrice: Math.round(c._avg.priceUsdCents ?? 0),
      minPrice: c._min.priceUsdCents ?? 0,
      maxPrice: c._max.priceUsdCents ?? 0,
    })),
    topSellers: topSellers.map(s => ({
      sellerId: s.sellerUserId,
      sellerName: sellerNameMap.get(s.sellerUserId) ?? "Inconnu",
      orderCount: s._count,
      revenueUsdCents: s._sum.totalUsdCents ?? 0,
    })),
    recentOrders: recentOrders.map(o => ({
      id: o.id, status: o.status, totalUsdCents: o.totalUsdCents, currency: o.currency,
      city: o.deliveryCity, createdAt: o.createdAt,
      categories: [...new Set(o.items.map(i => i.category))],
    })),
  });
}));

// ── Market Intelligence Admin ──
router.get("/ia/market-intelligence", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const { city, category, period } = req.query;
  const now = new Date();
  const periodDays = period === "90d" ? 90 : period === "30d" ? 30 : period === "7d" ? 7 : 30;
  const since = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

  const where: any = { status: "ACTIVE" };
  if (city && typeof city === "string") where.city = { equals: city, mode: "insensitive" };
  if (category && typeof category === "string") where.category = { equals: category, mode: "insensitive" };

  const [
    priceAnalysis,
    categoryDistribution,
    cityDistribution,
    trendData,
    competitionData,
    supplyDemand,
  ] = await Promise.all([
    prisma.listing.aggregate({ where, _avg: { priceUsdCents: true }, _min: { priceUsdCents: true }, _max: { priceUsdCents: true }, _count: true }),
    prisma.listing.groupBy({ by: ["category"], where, _count: true, _avg: { priceUsdCents: true }, orderBy: { _count: { id: "desc" } }, take: 15 }),
    prisma.listing.groupBy({ by: ["city"], where: { ...where, city: { not: "" } }, _count: true, _avg: { priceUsdCents: true }, orderBy: { _count: { id: "desc" } }, take: 10 }),
    prisma.listing.groupBy({ by: ["category"], where: { ...where, createdAt: { gte: since } }, _count: true, orderBy: { _count: { id: "desc" } }, take: 10 }),
    prisma.listing.groupBy({ by: ["category"], where, _count: true, orderBy: { _count: { id: "desc" } } }).then(cats => {
      const total = cats.reduce((s, c) => s + c._count, 0);
      return cats.slice(0, 10).map(c => ({ category: c.category, count: c._count, share: total > 0 ? Math.round((c._count / total) * 100) : 0 }));
    }),
    prisma.marketStats.findMany({
      where: category ? { category: { equals: category as string, mode: "insensitive" } } : {},
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { category: true, avgPriceUsdCents: true, demandScore: true, supplyScore: true, trendDirection: true, sampleSize: true, marketCity: { select: { city: true, countryCode: true } } },
    }),
  ]);

  // Opportunity scoring heuristic
  const opportunities = supplyDemand
    .filter(sd => sd.demandScore > 60 && sd.supplyScore < 40)
    .map(sd => ({
      category: sd.category,
      city: sd.marketCity.city,
      demandScore: sd.demandScore,
      supplyScore: sd.supplyScore,
      opportunityScore: Math.round((sd.demandScore - sd.supplyScore) * 0.8 + sd.demandScore * 0.2),
      avgPrice: sd.avgPriceUsdCents,
      trend: sd.trendDirection,
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 10);

  // ── External Intelligence enrichment (best-effort) ──
  let externalEnrichment: {
    topCategoryForecasts: Array<{ category: string; demandForecast7d: string; pricingAdjustPercent: number; triggers: string[]; confidence: number }>;
    sourceAttribution: string[];
  } = { topCategoryForecasts: [], sourceAttribution: [] };

  try {
    const topCats = categoryDistribution.slice(0, 5).map(c => c.category);
    const targetCity = (city && typeof city === "string") ? city : "Kinshasa";
    const fusionResults = await Promise.allSettled(
      topCats.map(cat => getFusedIntelligence(cat, "CD", targetCity))
    );
    const allSources = new Set<string>();
    for (let i = 0; i < fusionResults.length; i++) {
      const r = fusionResults[i];
      if (r.status === "fulfilled" && r.value.confidence > 10) {
        const f = r.value;
        externalEnrichment.topCategoryForecasts.push({
          category: topCats[i],
          demandForecast7d: f.demandForecast7d,
          pricingAdjustPercent: f.pricingAdjustmentPercent,
          triggers: f.activeTriggers.filter(t => t.severity > 40).map(t => t.explanation),
          confidence: f.confidence,
        });
        f.sourceAttribution.forEach(s => allSources.add(s));
      }
    }
    externalEnrichment.sourceAttribution = [...allSources];
  } catch (err) {
    logger.warn({ err }, "[MarketIntel] External enrichment failed (non-blocking)");
  }

  res.json({
    summary: {
      totalListings: priceAnalysis._count,
      avgPrice: Math.round(priceAnalysis._avg.priceUsdCents ?? 0),
      minPrice: priceAnalysis._min.priceUsdCents ?? 0,
      maxPrice: priceAnalysis._max.priceUsdCents ?? 0,
      period: `${periodDays}d`,
    },
    categoryDistribution: categoryDistribution.map(c => ({ category: c.category, count: c._count, avgPrice: Math.round(c._avg.priceUsdCents ?? 0) })),
    cityDistribution: cityDistribution.map(c => ({ city: c.city, count: c._count, avgPrice: Math.round(c._avg.priceUsdCents ?? 0) })),
    trends: trendData.map(t => ({ category: t.category, newListings: t._count })),
    competition: competitionData,
    supplyDemand: supplyDemand.map(sd => ({ category: sd.category, city: sd.marketCity.city, demandScore: sd.demandScore, supplyScore: sd.supplyScore, trend: sd.trendDirection, avgPrice: sd.avgPriceUsdCents, sampleSize: sd.sampleSize })),
    opportunities,
    externalIntelligence: {
      available: externalEnrichment.topCategoryForecasts.length > 0,
      forecasts: externalEnrichment.topCategoryForecasts,
      sourceAttribution: externalEnrichment.sourceAttribution,
    },
  });
}));

// ── Case Study Studio : Generate from market data ──
router.post("/ia/case-study/generate", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const { category, city, period, tier } = req.body;
  if (!category || !city) {
    throw new HttpError(400, "category et city requis");
  }

  const periodDays = period === "90d" ? 90 : period === "30d" ? 30 : period === "7d" ? 7 : 30;
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const where: any = { status: "ACTIVE", category: { equals: category, mode: "insensitive" }, city: { equals: city, mode: "insensitive" } };

  const [priceData, listingsCount, newListings, ordersData, sellerCount, marketData] = await Promise.all([
    prisma.listing.aggregate({ where, _avg: { priceUsdCents: true }, _min: { priceUsdCents: true }, _max: { priceUsdCents: true }, _count: true }),
    prisma.listing.count({ where }),
    prisma.listing.count({ where: { ...where, createdAt: { gte: since } } }),
    prisma.order.aggregate({
      where: { status: "DELIVERED", createdAt: { gte: since }, items: { some: { category: { equals: category, mode: "insensitive" }, city: { equals: city, mode: "insensitive" } } } },
      _count: true, _sum: { totalUsdCents: true },
    }),
    prisma.listing.groupBy({ by: ["ownerUserId"], where }).then(r => r.length),
    prisma.marketStats.findFirst({
      where: { category: { equals: category, mode: "insensitive" }, marketCity: { city: { equals: city, mode: "insensitive" } } },
      orderBy: { updatedAt: "desc" },
      select: { demandScore: true, supplyScore: true, trendDirection: true, sampleSize: true, avgPriceUsdCents: true, medianPriceUsdCents: true },
    }),
  ]);

  const avgP = Math.round(priceData._avg.priceUsdCents ?? 0);
  const competitionLevel = sellerCount > 20 ? "Élevée" : sellerCount > 5 ? "Modérée" : "Faible";
  const opportunityScore = Math.round(((marketData?.demandScore ?? 50) - (marketData?.supplyScore ?? 50)) * 0.6 + (marketData?.demandScore ?? 50) * 0.4);

  // ── External Intelligence (best-effort) ──
  let externalIntel: {
    fusedOpportunityScore: number | null;
    demandForecast7d: string | null;
    demandForecast30d: string | null;
    pricingAdjustmentPercent: number | null;
    activeTriggers: Array<{ trigger: string; explanation: string; severity: number; recommendedAction: string }>;
    externalDemand: string | null;
    externalTrend: string | null;
    externalPriceRange: { minUsdCents: number; maxUsdCents: number } | null;
    seasonalNote: string | null;
    fusionExplanation: string | null;
    sourceAttribution: string[];
    confidence: number;
  } = {
    fusedOpportunityScore: null, demandForecast7d: null, demandForecast30d: null,
    pricingAdjustmentPercent: null, activeTriggers: [], externalDemand: null,
    externalTrend: null, externalPriceRange: null, seasonalNote: null,
    fusionExplanation: null, sourceAttribution: [], confidence: 0,
  };

  try {
    const [fusedResult, enrichedResult] = await Promise.allSettled([
      getFusedIntelligence(category, "CD", city),
      getCategoryDemandAnalysis(category, city),
    ]);

    if (fusedResult.status === "fulfilled" && fusedResult.value.confidence > 10) {
      const f = fusedResult.value;
      externalIntel.fusedOpportunityScore = f.opportunityScore;
      externalIntel.demandForecast7d = f.demandForecast7d;
      externalIntel.demandForecast30d = f.demandForecast30d;
      externalIntel.pricingAdjustmentPercent = f.pricingAdjustmentPercent;
      externalIntel.activeTriggers = f.activeTriggers.map(t => ({
        trigger: t.trigger, explanation: t.explanation,
        severity: t.severity, recommendedAction: t.recommendedAction,
      }));
      externalIntel.fusionExplanation = f.explanation;
      externalIntel.sourceAttribution = f.sourceAttribution;
      externalIntel.confidence = f.confidence;
    }

    if (enrichedResult.status === "fulfilled") {
      const e = enrichedResult.value.data;
      externalIntel.externalDemand = e.externalDemand !== "UNKNOWN" ? e.externalDemand : null;
      externalIntel.externalTrend = e.externalTrend !== "UNKNOWN" ? e.externalTrend : null;
      externalIntel.externalPriceRange = e.externalPriceRange;
      externalIntel.seasonalNote = e.seasonalNote;
    }
  } catch (err) {
    logger.warn({ err }, "[CaseStudy] External intelligence enrichment failed (non-blocking)");
  }

  // ── Build enriched recommendations (internal + external) ──
  const recommendations: string[] = [
    opportunityScore > 70 ? `Forte opportunité : la demande dépasse l'offre pour "${category}" à ${city}. Potentiel d'entrée.` : null,
    sellerCount < 5 ? `Marché peu concurrentiel (${sellerCount} vendeurs). Avantage premier arrivé.` : null,
    (marketData?.trendDirection ?? "STABLE") === "UP" ? `Tendance haussière : les prix montent. Moment favorable pour vendre.` : null,
    avgP > 0 ? `Prix recommandé: entre ${((avgP * 0.85) / 100).toFixed(2)} et ${((avgP * 1.15) / 100).toFixed(2)} USD pour rester compétitif.` : null,
    // External enrichments
    externalIntel.pricingAdjustmentPercent && Math.abs(externalIntel.pricingAdjustmentPercent) > 3
      ? `📊 Ajustement prix externe : ${externalIntel.pricingAdjustmentPercent > 0 ? "+" : ""}${externalIntel.pricingAdjustmentPercent.toFixed(1)}% recommandé par les signaux marché (${externalIntel.sourceAttribution.join(", ")}).`
      : null,
    externalIntel.demandForecast7d === "RISING"
      ? `📈 Prévision 7j : demande en hausse — moment optimal pour publier.`
      : externalIntel.demandForecast7d === "DECLINING"
      ? `📉 Prévision 7j : demande en baisse — considérez un prix compétitif.`
      : null,
    externalIntel.seasonalNote ? `🗓️ Saisonnalité : ${externalIntel.seasonalNote}` : null,
    ...externalIntel.activeTriggers.filter(t => t.severity > 50).map(t => `⚡ ${t.explanation} → ${t.recommendedAction}`),
  ].filter(Boolean) as string[];

  const study = {
    id: `cs-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    tier: tier ?? "basic",
    title: `Étude de Marché — ${category} à ${city}`,
    market: city,
    category,
    period: `${periodDays} jours`,
    executiveSummary: `Analyse du marché "${category}" à ${city} sur ${periodDays} jours. ${listingsCount} articles actifs, ${newListings} nouvelles publications. Prix moyen: ${(avgP / 100).toFixed(2)} USD. Concurrence: ${competitionLevel}.`
      + (externalIntel.externalDemand ? ` Demande externe: ${externalIntel.externalDemand}.` : "")
      + (externalIntel.fusedOpportunityScore != null ? ` Score opportunité fusionné: ${externalIntel.fusedOpportunityScore}/100.` : ""),
    marketData: {
      totalListings: listingsCount,
      newListings,
      avgPriceUsdCents: avgP,
      minPriceUsdCents: priceData._min.priceUsdCents ?? 0,
      maxPriceUsdCents: priceData._max.priceUsdCents ?? 0,
      medianPriceUsdCents: marketData?.medianPriceUsdCents ?? avgP,
      sellerCount,
      ordersDelivered: ordersData._count,
      revenueUsdCents: ordersData._sum.totalUsdCents ?? 0,
    },
    analysis: {
      competitionLevel,
      trendDirection: marketData?.trendDirection ?? "STABLE",
      demandScore: marketData?.demandScore ?? 50,
      supplyScore: marketData?.supplyScore ?? 50,
      opportunityScore,
    },
    externalIntelligence: {
      available: externalIntel.confidence > 0,
      confidence: externalIntel.confidence,
      fusedOpportunityScore: externalIntel.fusedOpportunityScore,
      demandForecast: {
        sevenDays: externalIntel.demandForecast7d,
        thirtyDays: externalIntel.demandForecast30d,
      },
      pricingAdjustmentPercent: externalIntel.pricingAdjustmentPercent,
      externalDemand: externalIntel.externalDemand,
      externalTrend: externalIntel.externalTrend,
      externalPriceRange: externalIntel.externalPriceRange,
      seasonalNote: externalIntel.seasonalNote,
      activeTriggers: externalIntel.activeTriggers,
      sourceAttribution: externalIntel.sourceAttribution,
      fusionExplanation: externalIntel.fusionExplanation,
    },
    recommendations,
    metadata: {
      market: city,
      city,
      category,
      dateRange: `${since.toISOString().split("T")[0]} — ${new Date().toISOString().split("T")[0]}`,
      avgPrice: (avgP / 100).toFixed(2),
      trendScore: marketData?.demandScore ?? 50,
      competitionLevel,
      opportunityScore,
    },
  };

  res.json(study);
}));

// ── Admin Export History (in-memory for now, extensible to DB) ──
const exportHistory: Array<{ id: string; type: string; title: string; tier: string; format: string; createdAt: string; size: string }> = [];

router.get("/ia/exports", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  res.json(exportHistory.slice(-50));
}));

router.post("/ia/exports", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const { type, title, tier, format, size } = req.body;
  const entry = { id: `exp-${Date.now()}`, type: type ?? "report", title: title ?? "Export", tier: tier ?? "basic", format: format ?? "CSV", createdAt: new Date().toISOString(), size: size ?? "—" };
  exportHistory.push(entry);
  res.json(entry);
}));

// ── IA Marchande ──
router.get("/ia/marchande", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [recentListings, priceStats, categoryBreakdown] = await Promise.all([
    prisma.listing.findMany({
      where: { createdAt: { gte: last24h } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, title: true, category: true, city: true,
        priceUsdCents: true, type: true, stockQuantity: true,
        createdAt: true, status: true,
        ownerUser: { select: { profile: { select: { displayName: true } } } },
      },
    }),
    prisma.listing.aggregate({
      where: { status: "ACTIVE" },
      _avg: { priceUsdCents: true },
      _min: { priceUsdCents: true },
      _max: { priceUsdCents: true },
      _count: { id: true },
    }),
    prisma.listing.groupBy({
      by: ["category", "type"],
      where: { status: "ACTIVE" },
      _count: { id: true },
      _avg: { priceUsdCents: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),
  ]);

  res.json({
    recentListings: recentListings.map(l => ({
      ...l,
      sellerName: l.ownerUser?.profile?.displayName ?? "Inconnu",
      ownerUser: undefined,
    })),
    priceStats: {
      avg: priceStats._avg.priceUsdCents ?? 0,
      min: priceStats._min.priceUsdCents ?? 0,
      max: priceStats._max.priceUsdCents ?? 0,
      total: priceStats._count.id,
    },
    categoryBreakdown: categoryBreakdown.map(c => ({
      category: c.category,
      type: c.type,
      count: c._count.id,
      avgPrice: Math.round(c._avg.priceUsdCents ?? 0),
    })),
  });
}));

// ── IA de Commande ──
router.get("/ia/commande", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    autoOrders7d, autoOrders30d,
    totalAutoOrders,
    autoRevenue,
    recentAutoLogs,
    autoShops,
  ] = await Promise.all([
    prisma.aiAutonomyLog.count({ where: { agentName: "IA_COMMANDE", createdAt: { gte: last7d }, success: true } }),
    prisma.aiAutonomyLog.count({ where: { agentName: "IA_COMMANDE", createdAt: { gte: last30d }, success: true } }),
    prisma.aiAutonomyLog.count({ where: { agentName: "IA_COMMANDE", success: true } }),
    prisma.aiAutonomyLog.count({ where: { agentName: "IA_COMMANDE", actionType: "AUTO_VALIDATE_ORDER", success: true } }),
    prisma.aiAutonomyLog.findMany({
      where: { agentName: "IA_COMMANDE" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, actionType: true, targetUserId: true,
        decision: true, reasoning: true, success: true, createdAt: true,
      },
    }),
    // Boutiques en mode automatique (by AI agent config)
    prisma.aiAgent.findFirst({
      where: { name: "IA_COMMANDE" },
      select: { enabled: true, config: true },
    }),
  ]);

  // Utilisateurs gérés par IA Commande
  const managedUserIds = [...new Set(recentAutoLogs.map(l => l.targetUserId).filter(Boolean))] as string[];
  const managedUsers = managedUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: managedUserIds } },
        select: {
          id: true,
          profile: { select: { displayName: true } },
          businesses: { select: { id: true, publicName: true } },
        },
      })
    : [];

  res.json({
    stats: {
      autoActions7d: autoOrders7d,
      autoActions30d: autoOrders30d,
      totalAutoActions: totalAutoOrders,
      autoValidations: autoRevenue,
    },
    agentStatus: autoShops ?? { enabled: false, config: {} },
    recentLogs: recentAutoLogs,
    managedUsers: managedUsers.map(u => ({
      id: u.id,
      name: u.profile?.displayName ?? "Inconnu",
      business: u.businesses[0]?.publicName ?? null,
    })),
  });
}));

// ── IA ADS ──
router.get("/ia/ads", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADS");
  const dashboard = await iaAdsPlacements.getIaAdsDashboard();
  res.json(dashboard);
}));

// ── IA Message ──
router.get("/ia/messages", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const [stats, schedulerStats] = await Promise.all([
    iaMessengerPromo.getPromoCampaignStats(),
    messengerScheduler.getMessengerSchedulerStats(),
  ]);
  res.json({ ...stats, scheduler: schedulerStats });
}));

// ═══════════════════════════════════════════
// IA ENRICHMENT — Sources & Knowledge Base
// ═══════════════════════════════════════════

// In-memory sources store (extensible to DB later)
const iaSources: Array<{
  id: string; domain: string; type: "URL" | "FILE"; name: string;
  url?: string; fileType?: string; addedAt: string; addedBy: string; notes?: string;
}> = [];

// List sources for a given domain
router.get("/ia/sources", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const domain = (req.query.domain as string) || "all";
  const filtered = domain === "all" ? iaSources : iaSources.filter(s => s.domain === domain);
  res.json({ sources: filtered, total: filtered.length });
}));

// Add a source (URL or file metadata)
router.post("/ia/sources", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const body = z.object({
    domain: z.string().min(1),
    type: z.enum(["URL", "FILE"]),
    name: z.string().min(1),
    url: z.string().optional(),
    fileType: z.string().optional(),
    notes: z.string().optional(),
  }).parse(req.body);
  const entry = {
    id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...body,
    addedAt: new Date().toISOString(),
    addedBy: req.auth!.userId,
  };
  iaSources.push(entry);
  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "IA_SOURCE_ADD",
      entityType: "IA_SOURCE",
      entityId: entry.id,
      metadata: { domain: body.domain, type: body.type, name: body.name },
    },
  });
  res.json(entry);
}));

// Delete a source
router.delete("/ia/sources/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const idx = iaSources.findIndex(s => s.id === req.params.id);
  if (idx === -1) throw new HttpError(404, "Source introuvable");
  const removed = iaSources.splice(idx, 1)[0];
  res.json({ ok: true, removed });
}));

// ── IA Commande: toggle auto-shop for a user ──
router.post("/ia/commande/toggle-user", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const { userId, enabled, reason } = z.object({
    userId: z.string().min(1),
    enabled: z.boolean(),
    reason: z.string().min(1),
  }).parse(req.body);

  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: enabled ? "IA_COMMANDE_ENABLE" : "IA_COMMANDE_DISABLE",
      entityType: "USER",
      entityId: userId,
      metadata: { reason },
    },
  });
  res.json({ ok: true, userId, enabled, reason });
}));

// ── IA ADS: create admin ad ──
router.post("/ia/ads/create", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "ADS");
  const body = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    linkUrl: z.string().default("/"),
    ctaText: z.string().optional(),
    targetPages: z.array(z.string()).default([]),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    priority: z.number().default(10),
  }).parse(req.body);

  const ad = await prisma.advertisement.create({
    data: {
      title: body.title,
      description: body.description ?? "",
      imageUrl: body.imageUrl,
      linkUrl: body.linkUrl,
      ctaText: body.ctaText ?? "Découvrir",
      type: "KIN_SELL",
      status: "ACTIVE",
      targetPages: body.targetPages,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      endDate: body.endDate ? new Date(body.endDate) : null,
      priority: body.priority,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "IA_ADS_CREATE",
      entityType: "Advertisement",
      entityId: ad.id,
      metadata: { title: ad.title, targetPages: body.targetPages },
    },
  });
  res.json(ad);
}));

// ── IA Message: send admin promo message ──
router.post("/ia/messages/send", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const body = z.object({
    recipientIds: z.array(z.string().min(1)).min(1),
    channel: z.enum(["EMAIL", "PUSH", "INTERNAL"]),
    subject: z.string().min(1),
    body: z.string().min(1),
    reason: z.string().default("NEW_FEATURE"),
  }).parse(req.body);

  let sent = 0;
  for (const uid of body.recipientIds) {
    if (body.channel === "EMAIL") {
      const ok = await iaMessengerPromo.sendPromoEmail(uid, body.subject, body.body, body.reason as any);
      if (ok) sent++;
    } else if (body.channel === "PUSH") {
      const ok = await iaMessengerPromo.sendPromoPush(uid, body.subject, body.body, body.reason as any);
      if (ok) sent++;
    } else if (body.channel === "INTERNAL") {
      const ok = await iaMessengerPromo.sendPromoInternal(uid, body.subject, body.body, body.reason as any);
      if (ok) sent++;
    }
  }

  res.json({ ok: true, sent, total: body.recipientIds.length });
}));

// ── IA Message: search users for targeting ──
router.get("/ia/messages/target-users", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const search = (req.query.search as string) || "";
  const role = (req.query.role as string) || "";
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const where: any = { accountStatus: "ACTIVE" };
  if (role && role !== "ALL") where.role = role;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { profile: { displayName: { contains: search, mode: "insensitive" } } },
    ];
  }
  const users = await prisma.user.findMany({
    where,
    select: { id: true, email: true, role: true, profile: { select: { displayName: true, city: true, country: true } } },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
  res.json({ users: users.map(u => ({ id: u.id, email: u.email, role: u.role, displayName: u.profile?.displayName ?? "—", city: u.profile?.city, country: u.profile?.country })) });
}));

// ══════════════════════════════════════════════
// BILLING — Gestion admin des commandes & activations
// ══════════════════════════════════════════════

// ── Admin: lister toutes les commandes (avec filtres) ──
router.get("/billing/orders", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const status = req.query.status as string | undefined;
  const method = req.query.method as string | undefined;

  const where: Record<string, unknown> = {};
  if (status && status !== "ALL") {
    where.status = status;
  }
  if (method && method !== "ALL") {
    where.method = method;
  }

  const [items, total] = await Promise.all([
    prisma.paymentOrder.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, role: true, profile: { select: { displayName: true } } } },
        business: { select: { id: true, publicName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.paymentOrder.count({ where }),
  ]);

  res.json({ items, total, page, limit });
}));

// ── Admin: valider une commande et activer le forfait ──
// Flux : commande PENDING/USER_CONFIRMED → PAID → Subscription ACTIVE
const adminValidateOrderSchema = z.object({
  orderId: z.string().min(8),
  reason: z.string().max(500).optional(),
});

router.post("/billing/validate-order", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");
  const payload = adminValidateOrderSchema.parse(req.body);
  const result = await billingService.adminValidateOrder({
    orderId: payload.orderId,
    adminUserId: req.auth!.userId,
  });

  // Journaliser l'action admin
  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "BILLING_VALIDATE_ORDER",
      entityType: "PaymentOrder",
      entityId: payload.orderId,
      metadata: {
        reason: payload.reason || "Validation manuelle admin",
        planCode: result.plan.planCode,
        scope: result.plan.scope,
      },
    },
  });

  res.json(result);
}));

// ── Admin: lister les commandes en attente de validation ──
router.get("/billing/pending-orders", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const status = req.query.status as string | undefined;

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  } else {
    where.status = { in: ["PENDING", "USER_CONFIRMED"] };
  }

  const [items, total] = await Promise.all([
    prisma.paymentOrder.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, role: true, profile: { select: { displayName: true } } } },
        business: { select: { id: true, publicName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.paymentOrder.count({ where }),
  ]);

  res.json({ items, total, page, limit });
}));

// ── Admin: marquer une commande comme échouée ──
const adminFailOrderSchema = z.object({
  orderId: z.string().min(8),
  reason: z.string().max(500).optional(),
});

router.post("/billing/fail-order", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "SUBSCRIPTIONS");
  const { orderId, reason } = adminFailOrderSchema.parse(req.body);
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Ordre introuvable");
  if (["PAID", "VALIDATED"].includes(order.status)) throw new HttpError(400, "Impossible : ordre déjà validé");

  await prisma.paymentOrder.update({
    where: { id: orderId },
    data: {
      status: "FAILED",
      depositorNote: reason ? `REFUSED: ${reason}` : order.depositorNote,
    },
  });

  // Journaliser le refus
  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "BILLING_FAIL_ORDER",
      entityType: "PaymentOrder",
      entityId: orderId,
      metadata: {
        reason: reason || "Refusé par admin",
        planCode: order.planCode,
        previousStatus: order.status,
      },
    },
  });

  res.json({ orderId, status: "FAILED", message: "Ordre marqué comme refusé" });
}));

export default router;
