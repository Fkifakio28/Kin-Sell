import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { hashPassword, verifyPassword } from "../../shared/auth/password.js";
import * as messagingService from "../messaging/messaging.service.js";

// ── Admin Level → Default Permissions mapping ──
const LEVEL_PERMISSIONS: Record<string, string[]> = {
  LEVEL_1: [
    "DASHBOARD","USERS","BLOG","TRANSACTIONS","REPORTS","FEED","DONATIONS",
    "ADS","ADVERTISEMENTS","SECURITY","ANTIFRAUD","SECURITY_AI","AI_MANAGEMENT",
    "RANKINGS","ADMINS","CURRENCY","AUDIT","SETTINGS","MESSAGING","LISTINGS","NEGOTIATION_RULES",
  ],
  LEVEL_2: [
    "DASHBOARD","USERS","BLOG","TRANSACTIONS","REPORTS","FEED","DONATIONS",
    "ADS","ADVERTISEMENTS","SECURITY","ANTIFRAUD","AI_MANAGEMENT",
    "RANKINGS","CURRENCY","AUDIT","MESSAGING","LISTINGS","NEGOTIATION_RULES",
  ],
  LEVEL_3: [
    "DASHBOARD","USERS","BLOG","TRANSACTIONS","REPORTS","FEED","DONATIONS",
    "ADS","ADVERTISEMENTS","RANKINGS","MESSAGING","LISTINGS",
  ],
  LEVEL_4: [
    "DASHBOARD","USERS","BLOG","REPORTS","FEED","MESSAGING",
  ],
  LEVEL_5: [
    "DASHBOARD",
  ],
};

export const getDefaultPermissionsForLevel = (level: string): string[] =>
  LEVEL_PERMISSIONS[level] ?? LEVEL_PERMISSIONS.LEVEL_5;

// ════════════════════════════════════════════
// 1. DASHBOARD — Stats globales
// ════════════════════════════════════════════

export const getDashboardStats = async () => {
  const [
    totalUsers,
    totalBusinesses,
    totalAdmins,
    totalListings,
    totalOrders,
    pendingOrders,
    completedOrders,
    canceledOrders,
    totalReports,
    pendingReports,
    activeUsers,
    suspendedUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "BUSINESS" } }),
    prisma.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } }),
    prisma.listing.count(),
    prisma.order.count(),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "DELIVERED" } }),
    prisma.order.count({ where: { status: "CANCELED" } }),
    prisma.report.count(),
    prisma.report.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { accountStatus: "ACTIVE" } }),
    prisma.user.count({ where: { accountStatus: "SUSPENDED" } }),
  ]);

  const orderAgg = await prisma.order.aggregate({
    _sum: { totalUsdCents: true },
    where: { status: { not: "CANCELED" } },
  });

  const completedAgg = await prisma.order.aggregate({
    _sum: { totalUsdCents: true },
    where: { status: "DELIVERED" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOrders = await prisma.order.aggregate({
    _sum: { totalUsdCents: true },
    where: { createdAt: { gte: today }, status: { not: "CANCELED" } },
  });

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthOrders = await prisma.order.aggregate({
    _sum: { totalUsdCents: true },
    where: { createdAt: { gte: monthStart }, status: { not: "CANCELED" } },
  });

  return {
    totalUsers,
    totalBusinesses,
    totalAdmins,
    activeUsers,
    suspendedUsers,
    totalListings,
    totalOrders,
    pendingOrders,
    completedOrders,
    canceledOrders,
    totalReports,
    pendingReports,
    totalRevenueUsdCents: orderAgg._sum.totalUsdCents ?? 0,
    completedRevenueUsdCents: completedAgg._sum.totalUsdCents ?? 0,
    todayRevenueUsdCents: todayOrders._sum.totalUsdCents ?? 0,
    monthRevenueUsdCents: monthOrders._sum.totalUsdCents ?? 0,
  };
};

// ════════════════════════════════════════════
// 2. UTILISATEURS
// ════════════════════════════════════════════

export type AdminUserListParams = {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  country?: string;
};

export const listUsers = async (params: AdminUserListParams) => {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (params.role && params.role !== "ALL") {
    where.role = params.role;
  }
  if (params.status && params.status !== "ALL") {
    where.accountStatus = params.status;
  }
  if (params.search) {
    const s = params.search;
    where.OR = [
      { email: { contains: s, mode: "insensitive" } },
      { profile: { displayName: { contains: s, mode: "insensitive" } } },
      { profile: { username: { contains: s, mode: "insensitive" } } },
      { id: { contains: s } },
    ];
  }
  if (params.country && params.country !== "ALL") {
    where.profile = { ...(where.profile as any), country: { equals: params.country, mode: "insensitive" } };
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where: where as any }),
    prisma.user.findMany({
      where: where as any,
      include: { profile: true, businesses: { select: { id: true, publicName: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.ceil(total / limit),
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      phone: u.phone,
      role: u.role,
      accountStatus: u.accountStatus,
      deletionRequestedAt: u.deletionRequestedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      displayName: u.profile?.displayName ?? "—",
      username: u.profile?.username ?? null,
      avatarUrl: u.profile?.avatarUrl ?? null,
      city: u.profile?.city ?? null,
      country: u.profile?.country ?? null,
      businesses: u.businesses,
    })),
  };
};

export const getUserDetail = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      businesses: { include: { shop: true } },
      adminProfile: true,
      _count: {
        select: {
          buyerOrders: true,
          sellerOrders: true,
          listings: true,
          reportsFiled: true,
          reportsReceived: true,
        },
      },
    },
  });
  if (!user) throw new HttpError(404, "Utilisateur introuvable");

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    accountStatus: user.accountStatus,
    deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    profileCompleted: user.profileCompleted,
    createdAt: user.createdAt.toISOString(),
    profile: user.profile
      ? {
          displayName: user.profile.displayName,
          username: user.profile.username,
          avatarUrl: user.profile.avatarUrl,
          birthDate: user.profile.birthDate?.toISOString() ?? null,
          city: user.profile.city,
          country: user.profile.country,
          addressLine1: user.profile.addressLine1,
          verificationStatus: user.profile.verificationStatus,
        }
      : null,
    businesses: user.businesses.map((b) => ({
      id: b.id,
      publicName: b.publicName,
      slug: b.slug,
      description: b.description,
    })),
    adminProfile: user.adminProfile
      ? { level: user.adminProfile.level, permissions: user.adminProfile.permissions }
      : null,
    counts: user._count,
  };
};

export const changeUserRole = async (userId: string, newRole: string) => {
  const valid = ["USER", "BUSINESS", "ADMIN"];
  if (!valid.includes(newRole)) throw new HttpError(400, "Rôle invalide");

  const user = await prisma.user.update({
    where: { id: userId },
    data: { role: newRole as any },
    include: { profile: true },
  });

  // If promoted to ADMIN, create admin profile if not exists
  if (newRole === "ADMIN") {
    await prisma.adminProfile.upsert({
      where: { userId },
      create: { userId, level: "LEVEL_5", permissions: getDefaultPermissionsForLevel("LEVEL_5") as any },
      update: {},
    });
  }

  // Revoke all active sessions so the user must re-login with the new role in the JWT
  await prisma.userSession.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  return { id: user.id, role: user.role };
};

export const suspendUser = async (
  userId: string,
  durationHours: number,
  reason: string,
  adminPassword: string,
  adminUserId: string
) => {
  // Verify admin password
  const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
  if (!admin?.passwordHash) throw new HttpError(400, "Mot de passe admin introuvable");
  const valid = await verifyPassword(adminPassword, admin.passwordHash);
  if (!valid) throw new HttpError(403, "Mot de passe incorrect");

  // Calculate suspension expiry (0 = permanent)
  const suspensionExpiresAt = durationHours > 0
    ? new Date(Date.now() + durationHours * 3600_000)
    : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      accountStatus: "SUSPENDED",
      suspensionReason: reason,
      suspensionExpiresAt,
    },
  });

  // Revoke ALL active sessions so the user is immediately blocked
  await prisma.userSession.updateMany({
    where: { userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

  // Log in audit
  await prisma.auditLog.create({
    data: {
      actorUserId: adminUserId,
      action: "SUSPEND_USER",
      entityType: "User",
      entityId: userId,
      metadata: { durationHours, reason, suspensionExpiresAt: suspensionExpiresAt?.toISOString() ?? "permanent" },
    },
  });

  return { success: true };
};

export const unsuspendUser = async (userId: string) => {
  await prisma.user.update({
    where: { id: userId },
    data: { accountStatus: "ACTIVE", suspensionReason: null, suspensionExpiresAt: null },
  });
  return { success: true };
};

export const createUser = async (data: {
  email: string;
  password: string;
  displayName: string;
  role: string;
}) => {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new HttpError(409, "Un compte avec cet email existe déjà");

  const hash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash: hash,
      role: (data.role as any) ?? "USER",
      profile: {
        create: { displayName: data.displayName },
      },
    },
    include: { profile: true },
  });

  return { id: user.id, email: user.email, role: user.role, displayName: user.profile?.displayName };
};

// ════════════════════════════════════════════
// 3. BLOG
// ════════════════════════════════════════════

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) + "-" + Date.now().toString(36);
}

export const listBlogPosts = async (params: {
  page?: number; limit?: number; status?: string;
  category?: string; search?: string; language?: string;
  sortBy?: string;
}) => {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 50);
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};
  if (params.status && params.status !== "ALL") where.status = params.status;
  if (params.category && params.category !== "ALL") where.category = params.category;
  if (params.language && params.language !== "ALL") where.language = params.language;
  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: "insensitive" } },
      { excerpt: { contains: params.search, mode: "insensitive" } },
    ];
  }

  const orderBy: Record<string, string> =
    params.sortBy === "views" ? { views: "desc" }
    : params.sortBy === "published" ? { publishedAt: "desc" }
    : { createdAt: "desc" };

  const [total, posts] = await Promise.all([
    prisma.blogPost.count({ where: where as any }),
    prisma.blogPost.findMany({
      where: where as any,
      include: { author: { include: { profile: true } } },
      orderBy: orderBy as any,
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      coverImage: p.coverImage,
      mediaUrl: p.mediaUrl,
      mediaType: p.mediaType,
      gifUrl: p.gifUrl,
      category: p.category,
      tags: p.tags,
      language: p.language,
      views: p.views,
      status: p.status,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      author: p.author.profile?.displayName ?? "Admin",
      authorId: p.authorId,
    })),
  };
};

export const getBlogPost = async (postId: string) => {
  const p = await prisma.blogPost.findUnique({
    where: { id: postId },
    include: { author: { include: { profile: true } } },
  });
  if (!p) throw new HttpError(404, "Article introuvable");
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    content: p.content,
    excerpt: p.excerpt,
    coverImage: p.coverImage,
    mediaUrl: p.mediaUrl,
    mediaType: p.mediaType,
    gifUrl: p.gifUrl,
    category: p.category,
    tags: p.tags,
    language: p.language,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    views: p.views,
    status: p.status,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    author: p.author.profile?.displayName ?? "Admin",
    authorId: p.authorId,
  };
};

export const createBlogPost = async (authorId: string, data: {
  title: string;
  content: string;
  excerpt?: string;
  coverImage?: string;
  mediaUrl?: string;
  mediaType?: string;
  gifUrl?: string;
  category?: string;
  tags?: string[];
  language?: string;
  metaTitle?: string;
  metaDescription?: string;
  status?: string;
}) => {
  const slug = generateSlug(data.title);
  const post = await prisma.blogPost.create({
    data: {
      authorId,
      title: data.title,
      slug,
      content: data.content,
      excerpt: data.excerpt,
      coverImage: data.coverImage,
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType,
      gifUrl: data.gifUrl,
      category: data.category ?? "general",
      tags: data.tags ?? [],
      language: data.language ?? "fr",
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      status: (data.status as any) ?? "DRAFT",
      publishedAt: data.status === "PUBLISHED" ? new Date() : undefined,
    },
  });
  return post;
};

export const updateBlogPost = async (postId: string, data: {
  title?: string;
  content?: string;
  excerpt?: string | null;
  coverImage?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  gifUrl?: string | null;
  category?: string;
  tags?: string[];
  language?: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  status?: string;
}) => {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.excerpt !== undefined) updateData.excerpt = data.excerpt;
  if (data.coverImage !== undefined) updateData.coverImage = data.coverImage || null;
  if (data.mediaUrl !== undefined) updateData.mediaUrl = data.mediaUrl || null;
  if (data.mediaType !== undefined) updateData.mediaType = data.mediaType || null;
  if (data.gifUrl !== undefined) updateData.gifUrl = data.gifUrl || null;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.language !== undefined) updateData.language = data.language;
  if (data.metaTitle !== undefined) updateData.metaTitle = data.metaTitle || null;
  if (data.metaDescription !== undefined) updateData.metaDescription = data.metaDescription || null;
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === "PUBLISHED") {
      // Only set publishedAt if not already set
      const existing = await prisma.blogPost.findUnique({ where: { id: postId }, select: { publishedAt: true } });
      if (!existing?.publishedAt) updateData.publishedAt = new Date();
    }
  }

  const post = await prisma.blogPost.update({
    where: { id: postId },
    data: updateData as any,
  });
  return post;
};

export const deleteBlogPost = async (postId: string) => {
  await prisma.blogPost.delete({ where: { id: postId } });
  return { success: true };
};

export const incrementBlogViews = async (postId: string) => {
  await prisma.blogPost.update({
    where: { id: postId },
    data: { views: { increment: 1 } },
  });
};

export const getBlogAnalytics = async () => {
  const [totalPosts, published, drafts, totalViews, topPosts] = await Promise.all([
    prisma.blogPost.count(),
    prisma.blogPost.count({ where: { status: "PUBLISHED" } }),
    prisma.blogPost.count({ where: { status: "DRAFT" } }),
    prisma.blogPost.aggregate({ _sum: { views: true } }),
    prisma.blogPost.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { views: "desc" },
      take: 5,
      select: { id: true, title: true, slug: true, views: true, publishedAt: true },
    }),
  ]);
  const categories = await prisma.blogPost.groupBy({
    by: ["category"],
    _count: { id: true },
  });
  return {
    totalPosts,
    published,
    drafts,
    archived: totalPosts - published - drafts,
    totalViews: totalViews._sum.views ?? 0,
    topPosts,
    categories: categories.map(c => ({ category: c.category, count: c._count.id })),
  };
};

// ════════════════════════════════════════════
// 4. TRANSACTIONS
// ════════════════════════════════════════════

export const listTransactions = async (params: {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  search?: string;
}) => {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};

  if (params.status && params.status !== "ALL") where.status = params.status;

  const [total, orders, agg, completedAgg, pendingAgg, canceledAgg] = await Promise.all([
    prisma.order.count({ where: where as any }),
    prisma.order.findMany({
      where: where as any,
      include: {
        buyer: { include: { profile: true } },
        seller: { include: { profile: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.aggregate({ _sum: { totalUsdCents: true }, where: { status: { not: "CANCELED" } } }),
    prisma.order.aggregate({ _sum: { totalUsdCents: true }, _count: true, where: { status: "DELIVERED" } }),
    prisma.order.aggregate({ _sum: { totalUsdCents: true }, _count: true, where: { status: "PENDING" } }),
    prisma.order.aggregate({ _sum: { totalUsdCents: true }, _count: true, where: { status: "CANCELED" } }),
  ]);

  return {
    total,
    page,
    totalPages: Math.ceil(total / limit),
    summary: {
      totalRevenueUsdCents: agg._sum.totalUsdCents ?? 0,
      completedCount: completedAgg._count ?? 0,
      completedUsdCents: completedAgg._sum.totalUsdCents ?? 0,
      pendingCount: pendingAgg._count ?? 0,
      pendingUsdCents: pendingAgg._sum.totalUsdCents ?? 0,
      canceledCount: canceledAgg._count ?? 0,
      canceledUsdCents: canceledAgg._sum.totalUsdCents ?? 0,
    },
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalUsdCents: o.totalUsdCents,
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
      buyer: { id: o.buyer.id, displayName: o.buyer.profile?.displayName ?? "—" },
      seller: { id: o.seller.id, displayName: o.seller.profile?.displayName ?? "—" },
      itemsCount: o.items.length,
      items: o.items.map((i) => ({
        title: i.title,
        type: i.listingType,
        quantity: i.quantity,
        unitPriceUsdCents: i.unitPriceUsdCents,
      })),
    })),
  };
};

// ════════════════════════════════════════════
// 5. SIGNALEMENTS
// ════════════════════════════════════════════

export const listReports = async (params: { page?: number; limit?: number; status?: string }) => {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 50);
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};
  if (params.status && params.status !== "ALL") where.status = params.status;

  const [total, reports] = await Promise.all([
    prisma.report.count({ where: where as any }),
    prisma.report.findMany({
      where: where as any,
      include: {
        reporter: { include: { profile: true } },
        reported: { include: { profile: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.ceil(total / limit),
    reports: reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      message: r.message,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      reporter: {
        id: r.reporter.id,
        displayName: r.reporter.profile?.displayName ?? "—",
        username: r.reporter.profile?.username,
        avatarUrl: r.reporter.profile?.avatarUrl,
        email: r.reporter.email,
        phone: r.reporter.phone,
      },
      reported: {
        id: r.reported.id,
        displayName: r.reported.profile?.displayName ?? "—",
        username: r.reported.profile?.username,
        avatarUrl: r.reported.profile?.avatarUrl,
        email: r.reported.email,
        phone: r.reported.phone,
      },
    })),
  };
};

export const resolveReport = async (reportId: string, adminUserId: string, resolution: string) => {
  const report = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: "RESOLVED",
      resolvedBy: adminUserId,
      resolvedAt: new Date(),
      resolution,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: adminUserId,
      action: "RESOLVE_REPORT",
      entityType: "Report",
      entityId: reportId,
      metadata: { resolution },
    },
  });

  return report;
};

// ════════════════════════════════════════════
// 8. ADS — Offres publicitaires
// ════════════════════════════════════════════

export const listAdOffers = async () => {
  return prisma.adOffer.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
};

export const createAdOffer = async (data: {
  name: string;
  description?: string;
  priceUsdCents: number;
  durationDays: number;
  features?: string[];
}) => {
  return prisma.adOffer.create({ data: data as any });
};

export const updateAdOffer = async (id: string, data: Record<string, unknown>) => {
  return prisma.adOffer.update({ where: { id }, data: data as any });
};

export const deleteAdOffer = async (id: string) => {
  await prisma.adOffer.delete({ where: { id } });
  return { success: true };
};

// ════════════════════════════════════════════
// 12. GESTION DES IA — Centre de pilotage complet
// ════════════════════════════════════════════

export const listAiAgents = async (filters?: { status?: string; domain?: string; type?: string }) => {
  const where: Record<string, unknown> = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.domain) where.domain = filters.domain;
  if (filters?.type) where.type = filters.type;
  return prisma.aiAgent.findMany({ where: where as any, orderBy: { createdAt: "asc" } });
};

export const getAiAgentDetail = async (id: string) => {
  const agent = await prisma.aiAgent.findUnique({ where: { id } });
  if (!agent) throw new HttpError(404, "Agent IA introuvable");

  // Stats from AiAutonomyLog
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 30);

  const [totalUsage, todayUsage, weekUsage, monthUsage, successCount, errorCount, recentLogs, topUsers] = await Promise.all([
    prisma.aiAutonomyLog.count({ where: { agentName: agent.slug } }),
    prisma.aiAutonomyLog.count({ where: { agentName: agent.slug, createdAt: { gte: todayStart } } }),
    prisma.aiAutonomyLog.count({ where: { agentName: agent.slug, createdAt: { gte: weekStart } } }),
    prisma.aiAutonomyLog.count({ where: { agentName: agent.slug, createdAt: { gte: monthStart } } }),
    prisma.aiAutonomyLog.count({ where: { agentName: agent.slug, success: true } }),
    prisma.aiAutonomyLog.count({ where: { agentName: agent.slug, success: false } }),
    prisma.aiAutonomyLog.findMany({
      where: { agentName: agent.slug },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { targetUser: { select: { id: true, role: true, profile: { select: { displayName: true, username: true } } } } },
    }),
    prisma.aiAutonomyLog.groupBy({
      by: ["targetUserId"],
      where: { agentName: agent.slug, targetUserId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
  ]);

  // Resolve top user names
  const topUserIds = topUsers.filter(u => u.targetUserId).map(u => u.targetUserId!);
  const topUserProfiles = topUserIds.length > 0 ? await prisma.user.findMany({
    where: { id: { in: topUserIds } },
    select: { id: true, role: true, profile: { select: { displayName: true, username: true } } },
  }) : [];
  const userMap = new Map(topUserProfiles.map(u => [u.id, u]));

  return {
    ...agent,
    stats: {
      totalUsage,
      todayUsage,
      weekUsage,
      monthUsage,
      successRate: totalUsage > 0 ? Math.round((successCount / totalUsage) * 100) : 100,
      errorRate: totalUsage > 0 ? Math.round((errorCount / totalUsage) * 100) : 0,
    },
    recentLogs: recentLogs.map(l => ({
      id: l.id,
      actionType: l.actionType,
      targetUserId: l.targetUserId,
      targetUserName: l.targetUser?.profile?.displayName ?? null,
      targetUserRole: l.targetUser?.role ?? null,
      decision: l.decision,
      reasoning: l.reasoning,
      success: l.success,
      metadata: l.metadata,
      createdAt: l.createdAt,
    })),
    topUsers: topUsers.map(u => ({
      userId: u.targetUserId,
      displayName: userMap.get(u.targetUserId!)?.profile?.displayName ?? "Inconnu",
      role: userMap.get(u.targetUserId!)?.role ?? "USER",
      usageCount: u._count.id,
    })),
  };
};

export const getAiManagementStats = async () => {
  const agents = await prisma.aiAgent.findMany();
  const totalLogs = await prisma.aiAutonomyLog.count();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekLogs = await prisma.aiAutonomyLog.count({ where: { createdAt: { gte: weekStart } } });

  // Count unique users who have AI logs
  const uniqueUsers = await prisma.aiAutonomyLog.groupBy({ by: ["targetUserId"], where: { targetUserId: { not: null } } });

  const total = agents.length;
  const active = agents.filter(a => a.status === "ACTIVE" && a.enabled).length;
  const inactive = agents.filter(a => a.status === "INACTIVE" || !a.enabled).length;
  const maintenance = agents.filter(a => a.status === "MAINTENANCE").length;
  const paused = agents.filter(a => a.status === "PAUSED").length;
  const errors = agents.filter(a => a.status === "ERROR").length;
  const linkedToPlans = agents.filter(a => {
    const cfg = a.config as Record<string, unknown> | null;
    return cfg?.requiredPlan && cfg.requiredPlan !== "FREE";
  }).length;

  // Global system status
  let systemStatus: "active" | "degraded" | "offline" = "active";
  if (errors > 0 || maintenance > 0) systemStatus = "degraded";
  if (active === 0) systemStatus = "offline";

  return {
    total, active, inactive, maintenance, paused, errors,
    linkedToPlans,
    accountsUsingAi: uniqueUsers.length,
    totalUsage: totalLogs,
    weekUsage: weekLogs,
    systemStatus,
  };
};

export const getAiAgentLogs = async (agentSlug: string, params?: { page?: number; limit?: number; success?: boolean; actionType?: string }) => {
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const where: Record<string, unknown> = { agentName: agentSlug };
  if (params?.success !== undefined) where.success = params.success;
  if (params?.actionType) where.actionType = params.actionType;

  const [logs, total] = await Promise.all([
    prisma.aiAutonomyLog.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { targetUser: { select: { id: true, role: true, profile: { select: { displayName: true, username: true } } } } },
    }),
    prisma.aiAutonomyLog.count({ where: where as any }),
  ]);

  return {
    logs: logs.map(l => ({
      id: l.id,
      actionType: l.actionType,
      targetUserId: l.targetUserId,
      targetUserName: l.targetUser?.profile?.displayName ?? null,
      targetUserRole: l.targetUser?.role ?? null,
      decision: l.decision,
      reasoning: l.reasoning,
      success: l.success,
      metadata: l.metadata,
      createdAt: l.createdAt,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};

export const updateAiAgent = async (id: string, data: {
  enabled?: boolean;
  level?: string;
  status?: string;
  name?: string;
  description?: string;
  icon?: string;
  version?: string;
  config?: Record<string, unknown>;
}) => {
  const updateData: Record<string, unknown> = {};
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  if (data.level !== undefined) updateData.level = data.level;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.icon !== undefined) updateData.icon = data.icon;
  if (data.version !== undefined) updateData.version = data.version;
  if (data.config !== undefined) {
    // Merge with existing config
    const existing = await prisma.aiAgent.findUnique({ where: { id }, select: { config: true } });
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {};
    updateData.config = { ...existingConfig, ...data.config };
  }
  // Sync enabled / status
  if (data.status === "ACTIVE" && data.enabled === undefined) updateData.enabled = true;
  if (data.status === "INACTIVE" && data.enabled === undefined) updateData.enabled = false;
  if (data.enabled === false && data.status === undefined) updateData.status = "INACTIVE";
  if (data.enabled === true && data.status === undefined) updateData.status = "ACTIVE";

  return prisma.aiAgent.update({ where: { id }, data: updateData as any });
};

// ════════════════════════════════════════════
// 13. CLASSEMENT — Rankings
// ════════════════════════════════════════════

export const getRankings = async (period: "month" | "all" = "all", type: "all" | "user" | "business" = "all") => {
  const where: Record<string, unknown> = { status: "DELIVERED" };
  if (period === "month") {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    where.createdAt = { gte: monthStart };
  }

  // Top sellers by revenue
  const topSellers = await prisma.order.groupBy({
    by: ["sellerUserId"],
    where: where as any,
    _sum: { totalUsdCents: true },
    _count: { id: true },
    orderBy: { _sum: { totalUsdCents: "desc" } },
    take: 20,
  });

  const sellerIds = topSellers.map((s) => s.sellerUserId);
  const sellers = await prisma.user.findMany({
    where: { id: { in: sellerIds } },
    include: { profile: true },
  });

  const sellerMap = new Map(sellers.map((s) => [s.id, s]));

  return topSellers
    .filter((s) => {
      const user = sellerMap.get(s.sellerUserId);
      if (!user) return false;
      if (type === "user") return user.role === "USER";
      if (type === "business") return user.role === "BUSINESS";
      return true;
    })
    .map((s, i) => {
      const user = sellerMap.get(s.sellerUserId)!;
      return {
        rank: i + 1,
        userId: s.sellerUserId,
        displayName: user.profile?.displayName ?? "—",
        avatarUrl: user.profile?.avatarUrl ?? null,
        role: user.role,
        totalRevenueUsdCents: s._sum.totalUsdCents ?? 0,
        orderCount: s._count.id,
      };
    });
};

// ════════════════════════════════════════════
// 14. ADMINISTRATEURS
// ════════════════════════════════════════════

export const listAdmins = async () => {
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    include: { profile: true, adminProfile: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return admins.map((a) => ({
    id: a.id,
    email: a.email,
    role: a.role,
    accountStatus: a.accountStatus,
    createdAt: a.createdAt.toISOString(),
    displayName: a.profile?.displayName ?? "—",
    avatarUrl: a.profile?.avatarUrl ?? null,
    level: a.adminProfile?.level ?? null,
    permissions: a.adminProfile?.permissions ?? [],
  }));
};

export const updateAdminProfile = async (
  userId: string,
  data: { level?: string; permissions?: string[] },
  actorLevel: string
) => {
  // Accreditation rule: cannot affect higher level admins
  const target = await prisma.adminProfile.findUnique({ where: { userId } });
  if (target) {
    const levelNum = (l: string) => parseInt(l.replace("LEVEL_", ""), 10);
    if (levelNum(target.level) < levelNum(actorLevel)) {
      throw new HttpError(403, "Vous ne pouvez pas modifier un admin de niveau supérieur");
    }
  }

  const profile = await prisma.adminProfile.upsert({
    where: { userId },
    create: {
      userId,
      level: (data.level as any) ?? "LEVEL_5",
      permissions: (data.permissions as any) ?? getDefaultPermissionsForLevel(data.level ?? "LEVEL_5"),
    },
    update: {
      level: data.level ? (data.level as any) : undefined,
      permissions: data.permissions
        ? (data.permissions as any)
        : data.level
          ? (getDefaultPermissionsForLevel(data.level) as any)
          : undefined,
    },
  });

  return profile;
};

export const demoteAdmin = async (userId: string) => {
  await prisma.adminProfile.deleteMany({ where: { userId } });
  await prisma.user.update({ where: { id: userId }, data: { role: "USER" } });
  return { success: true };
};

// ════════════════════════════════════════════
// 15. DEVIS — Taux de change
// ════════════════════════════════════════════

export const listCurrencyRates = async () => {
  return prisma.currencyRate.findMany({ orderBy: { fromCurrency: "asc" }, take: 200 });
};

export const upsertCurrencyRate = async (data: {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  updatedBy: string;
}) => {
  return prisma.currencyRate.upsert({
    where: { fromCurrency_toCurrency: { fromCurrency: data.fromCurrency, toCurrency: data.toCurrency } },
    create: { fromCurrency: data.fromCurrency, toCurrency: data.toCurrency, rate: data.rate, isManual: true, updatedBy: data.updatedBy },
    update: { rate: data.rate, isManual: true, updatedBy: data.updatedBy },
  });
};

// ════════════════════════════════════════════
// 16. JOURNAL D'AUDIT
// ════════════════════════════════════════════

export const listAuditLogs = async (params: { page?: number; limit?: number; actorId?: string }) => {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 30, 100);
  const skip = (page - 1) * limit;
  const where: Record<string, unknown> = {};
  if (params.actorId) where.actorUserId = params.actorId;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where: where as any }),
    prisma.auditLog.findMany({
      where: where as any,
      include: { actor: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.ceil(total / limit),
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      metadata: l.metadata,
      createdAt: l.createdAt.toISOString(),
      actor: l.actor
        ? { id: l.actor.id, displayName: l.actor.profile?.displayName ?? "—" }
        : null,
    })),
  };
};

// ════════════════════════════════════════════
// 17. PARAMÈTRES — Site Settings
// ════════════════════════════════════════════

export const getSiteSettings = async () => {
  const settings = await prisma.siteSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return map;
};

export const updateSiteSetting = async (key: string, value: string) => {
  return prisma.siteSetting.upsert({
    where: { key },
    create: { key, value, updatedAt: new Date() },
    update: { value },
  });
};

// ════════════════════════════════════════════
// 18. FEED — So-Kin Posts (modération)
// ════════════════════════════════════════════

export const listFeedPosts = async (params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) => {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (params.status && params.status !== "ALL") {
    where.status = params.status;
  }
  if (params.search) {
    where.text = { contains: params.search, mode: "insensitive" };
  }

  const [posts, total] = await Promise.all([
    prisma.soKinPost.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            email: true,
            role: true,
            profile: { select: { displayName: true, avatarUrl: true, username: true } },
          },
        },
      },
    }),
    prisma.soKinPost.count({ where }),
  ]);

  return {
    posts: posts.map((p) => ({
      id: p.id,
      authorId: p.authorId,
      authorName: p.author.profile?.displayName ?? p.author.email ?? "—",
      authorAvatar: p.author.profile?.avatarUrl,
      text: p.text,
      visibility: p.visibility,
      mediaUrls: p.mediaUrls,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      sponsored: p.sponsored,
      status: p.status,
      moderatedBy: p.moderatedBy,
      moderationNote: p.moderationNote,
      createdAt: p.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
};

export const moderateFeedPost = async (
  postId: string,
  adminUserId: string,
  action: "ACTIVE" | "FLAGGED" | "HIDDEN" | "DELETED",
  note?: string
) => {
  const post = await prisma.soKinPost.findUnique({ where: { id: postId } });
  if (!post) throw new HttpError(404, "Publication introuvable.");

  return prisma.soKinPost.update({
    where: { id: postId },
    data: {
      status: action,
      moderatedBy: adminUserId,
      moderatedAt: new Date(),
      moderationNote: note ?? null,
    },
  });
};

export const getFeedStats = async () => {
  const [total, active, flagged, hidden, deleted] = await Promise.all([
    prisma.soKinPost.count(),
    prisma.soKinPost.count({ where: { status: "ACTIVE" } }),
    prisma.soKinPost.count({ where: { status: "FLAGGED" } }),
    prisma.soKinPost.count({ where: { status: "HIDDEN" } }),
    prisma.soKinPost.count({ where: { status: "DELETED" } }),
  ]);
  return { total, active, flagged, hidden, deleted };
};

// ════════════════════════════════════════════
// 19. DONATIONS & ACHATS PUB
// ════════════════════════════════════════════

export const listDonations = async (params: {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
}) => {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (params.status && params.status !== "ALL") where.status = params.status;
  if (params.type && params.type !== "ALL") where.type = params.type;

  const [donations, total] = await Promise.all([
    prisma.adDonation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        adOffer: { select: { id: true, name: true } },
      },
    }),
    prisma.adDonation.count({ where }),
  ]);

  // Summary aggregates
  const [totalRevenue, completedRevenue, pendingCount] = await Promise.all([
    prisma.adDonation.aggregate({ _sum: { amountUsdCents: true } }),
    prisma.adDonation.aggregate({ _sum: { amountUsdCents: true }, where: { status: "COMPLETED" } }),
    prisma.adDonation.count({ where: { status: "PENDING" } }),
  ]);

  return {
    donations: donations.map((d) => ({
      id: d.id,
      userId: d.userId,
      userName: d.user.profile?.displayName ?? d.user.email ?? "—",
      type: d.type,
      amountUsdCents: d.amountUsdCents,
      description: d.description,
      adOfferName: d.adOffer?.name ?? null,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
    summary: {
      totalRevenueUsdCents: totalRevenue._sum.amountUsdCents ?? 0,
      completedRevenueUsdCents: completedRevenue._sum.amountUsdCents ?? 0,
      pendingCount,
    },
  };
};

export const updateDonationStatus = async (
  donationId: string,
  adminUserId: string,
  status: "COMPLETED" | "REFUNDED" | "FAILED"
) => {
  const donation = await prisma.adDonation.findUnique({ where: { id: donationId } });
  if (!donation) throw new HttpError(404, "Donation introuvable.");

  return prisma.adDonation.update({
    where: { id: donationId },
    data: {
      status,
      processedBy: adminUserId,
      processedAt: new Date(),
    },
  });
};

// ════════════════════════════════════════════
// 20. ADMIN SEND MESSAGE (DM)
// ════════════════════════════════════════════

export const adminSendMessage = async (adminUserId: string, targetUserId: string, content: string) => {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new HttpError(404, "Utilisateur introuvable.");

  // Get or create DM conversation — find one where both are participants and it has exactly 2 members
  const existing = await prisma.conversation.findMany({
    where: {
      isGroup: false,
      participants: { some: { userId: adminUserId } },
    },
    include: { participants: true },
  });

  let conversation = existing.find(
    (c) => c.participants.length === 2 && c.participants.some((p) => p.userId === targetUserId)
  ) ?? null;

  if (!conversation) {
    const participantCreates = adminUserId === targetUserId
      ? [{ userId: adminUserId }]
      : [{ userId: adminUserId }, { userId: targetUserId }];

    conversation = await prisma.conversation.create({
      data: {
        isGroup: false,
        participants: { create: participantCreates },
      },
      include: { participants: true },
    });
  }

  // Send the message
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: adminUserId,
      content,
      type: "TEXT",
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

  return { conversationId: conversation.id, messageId: message.id };
};

// ════════════════════════════════════════════
// 21. CLEANUP / OPTIMISATION
// ════════════════════════════════════════════

export const runCleanup = async () => {
  const now = new Date();
  const results: string[] = [];

  // 1. Expired MessageGuard fragments
  const fragResult = await prisma.messageGuardFragment.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  results.push(`${fragResult.count} fragments MessageGuard expirés supprimés`);

  // 2. Expired sessions
  const sessResult = await prisma.userSession.deleteMany({
    where: { status: "EXPIRED" },
  });
  results.push(`${sessResult.count} sessions expirées supprimées`);

  // 3. Expired verification codes
  const codeResult = await prisma.verificationCode.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  results.push(`${codeResult.count} codes de vérification expirés supprimés`);

  // 4. Expired restrictions
  const restrResult = await prisma.userRestriction.updateMany({
    where: { isActive: true, expiresAt: { lt: now } },
    data: { isActive: false },
  });
  results.push(`${restrResult.count} restrictions expirées levées`);

  return { actions: results, timestamp: now.toISOString() };
};

// ════════════════════════════════════════════
// LISTINGS — Gestion des articles (admin)
// ════════════════════════════════════════════

export const adminListListings = async (params: {
  status?: string;
  type?: string;
  q?: string;
  page: number;
  limit: number;
}) => {
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.type) where.type = params.type;
  if (params.q) {
    where.OR = [
      { title: { contains: params.q, mode: "insensitive" } },
      { category: { contains: params.q, mode: "insensitive" } },
      { city: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      include: {
        ownerUser: { include: { profile: true } },
        business: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
  ]);

  return {
    total,
    page: params.page,
    totalPages: Math.max(1, Math.ceil(total / params.limit)),
    listings: rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      title: r.title,
      category: r.category,
      city: r.city,
      imageUrl: r.imageUrl,
      priceUsdCents: r.priceUsdCents,
      isPublished: r.isPublished,
      isNegotiable: r.isNegotiable,
      createdAt: r.createdAt,
      ownerDisplayName: r.ownerUser.profile?.displayName ?? "Utilisateur",
      ownerRole: r.ownerUser.role,
      businessName: r.business?.publicName ?? null,
    })),
  };
};

export const adminToggleListingNegotiable = async (listingId: string, isNegotiable: boolean, adminUserId: string) => {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new HttpError(404, "Article introuvable");

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { isNegotiable },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: adminUserId,
      action: isNegotiable ? "ADMIN_LISTING_ENABLE_NEGOTIATE" : "ADMIN_LISTING_DISABLE_NEGOTIATE",
      entityType: "LISTING",
      entityId: listingId,
    },
  });

  return updated;
};

export const adminChangeListingStatus = async (listingId: string, status: string, adminUserId: string) => {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) throw new HttpError(404, "Article introuvable");

  const isPublished = status === "ACTIVE";
  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: status as any, isPublished },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: adminUserId,
      action: `ADMIN_LISTING_STATUS_${status}`,
      entityType: "LISTING",
      entityId: listingId,
    },
  });

  return updated;
};

// ════════════════════════════════════════════
// CATEGORY NEGOTIATION RULES
// ════════════════════════════════════════════

/** Retourne toutes les règles de négociation par catégorie + les catégories actives sans règle */
export const getCategoryNegotiationRules = async () => {
  const cats = await prisma.listing.findMany({
    where: { status: "ACTIVE", isPublished: true },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  const activeCategories = cats.map((c) => c.category);

  const rules = await prisma.categoryNegotiationRule.findMany({ orderBy: { category: "asc" } });
  const rulesMap = new Map(rules.map((r) => [r.category.toLowerCase(), r]));

  const merged = activeCategories.map((cat) => {
    const rule = rulesMap.get(cat.toLowerCase());
    return {
      category: cat,
      negotiationLocked: rule?.negotiationLocked ?? false,
      ruleId: rule?.id ?? null,
      updatedAt: rule?.updatedAt ?? null,
    };
  });

  for (const r of rules) {
    if (!activeCategories.some((c) => c.toLowerCase() === r.category.toLowerCase())) {
      merged.push({
        category: r.category,
        negotiationLocked: r.negotiationLocked,
        ruleId: r.id,
        updatedAt: r.updatedAt,
      });
    }
  }

  return merged.sort((a, b) => a.category.localeCompare(b.category));
};

/** Basculer le verrouillage de négociation pour une catégorie */
export const toggleCategoryNegotiation = async (
  category: string,
  locked: boolean,
  adminUserId: string,
) => {
  const cat = category.trim();
  if (!cat) throw new HttpError(400, "Catégorie requise");

  const rule = await prisma.categoryNegotiationRule.upsert({
    where: { category: cat.toLowerCase() },
    create: {
      category: cat.toLowerCase(),
      negotiationLocked: locked,
      updatedByUserId: adminUserId,
    },
    update: {
      negotiationLocked: locked,
      updatedByUserId: adminUserId,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: adminUserId,
      action: locked ? "CATEGORY_NEGOTIATION_LOCKED" : "CATEGORY_NEGOTIATION_UNLOCKED",
      entityType: "CATEGORY_RULE",
      entityId: rule.id,
      metadata: { category: cat },
    },
  });

  return rule;
};

/** Vérifie si la négociation est verrouillée pour une catégorie donnée */
export const isCategoryNegotiationLocked = async (category: string): Promise<boolean> => {
  const rule = await prisma.categoryNegotiationRule.findUnique({
    where: { category: category.toLowerCase() },
  });
  return rule?.negotiationLocked ?? false;
};

/** Retourne toutes les catégories verrouillées (pour le frontend) */
export const getLockedCategories = async (): Promise<string[]> => {
  const rules = await prisma.categoryNegotiationRule.findMany({
    where: { negotiationLocked: true },
    select: { category: true },
  });
  return rules.map((r) => r.category);
};

// ════════════════════════════════════════════
// APPELS DE SUSPENSION
// ════════════════════════════════════════════

export const listAppeals = async (params: { page?: number; limit?: number }) => {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const skip = (page - 1) * limit;

  const where = { action: "SUSPENSION_APPEAL_SUBMITTED" as any };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    appeals: logs.map((l) => ({
      id: l.id,
      userId: l.actorUserId,
      displayName: l.actor?.profile?.displayName ?? "—",
      email: l.actor?.email ?? "—",
      avatarUrl: l.actor?.profile?.avatarUrl ?? null,
      accountStatus: l.actor?.accountStatus ?? "UNKNOWN",
      message: (l.metadata as any)?.message ?? "",
      submittedAt: (l.metadata as any)?.submittedAt ?? l.createdAt.toISOString(),
      createdAt: l.createdAt.toISOString(),
    })),
  };
};

// ════════════════════════════════════════════
// CREATION ADMIN (avec profil)
// ════════════════════════════════════════════

export const createAdmin = async (data: {
  email: string;
  password: string;
  displayName: string;
  level?: string;
  permissions?: string[];
}) => {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new HttpError(409, "Un compte avec cet email existe déjà");

  const hash = await hashPassword(data.password);
  const level = data.level ?? "LEVEL_5";
  const permissions = data.permissions ?? getDefaultPermissionsForLevel(level);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash: hash,
      role: "ADMIN",
      profile: {
        create: { displayName: data.displayName },
      },
      adminProfile: {
        create: { level: level as any, permissions: permissions as any },
      },
    },
    include: { profile: true, adminProfile: true },
  });

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.profile?.displayName,
    level: user.adminProfile?.level,
    permissions: user.adminProfile?.permissions,
  };
};
