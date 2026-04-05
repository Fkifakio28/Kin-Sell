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
// 12. IA MANAGEMENT (SUPER_ADMIN only for toggle)
// ════════════════════════════════════════════

router.get("/ai-agents", asyncHandler(async (req: AuthenticatedRequest, res) => {
  await checkPermission(req, "AI_MANAGEMENT");
  const result = await adminService.listAiAgents();
  res.json(result);
}));

router.patch("/ai-agents/:id", asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    throw new HttpError(403, "Seul le Super Admin peut gérer les IA");
  }
  const body = z.object({
    enabled: z.boolean().optional(),
    level: z.string().optional(),
  }).parse(req.body);
  const result = await adminService.updateAiAgent(req.params.id, body);
  res.json(result);
}));

// ── AI Admin Control Panel (sous-routes avancées) ──
router.use("/ai-control", aiAdminRoutes);

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

export default router;
