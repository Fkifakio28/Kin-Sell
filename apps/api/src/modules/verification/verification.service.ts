import { prisma } from "../../shared/db/prisma.js";
import { VerificationStatus } from "../../shared/db/prisma-enums.js";
import type { Prisma } from "@prisma/client";
import { logger } from "../../shared/logger.js";
import { sendPushToUser } from "../notifications/push.service.js";

// ══════════════════════════════════════════════
// VERIFICATION BADGE SERVICE
// ══════════════════════════════════════════════

// ─── Types ───────────────────────────────────

interface CredibilityMetrics {
  completedOrders: number;
  avgRating: number;
  reviewCount: number;
  avgResponseTimeMinutes: number;
  avgTransactionDays: number;
  disputeCount: number;
  reportCount: number;
  accountAgeDays: number;
  profileComplete: boolean;
  listingsCount: number;
  activityScore: number; // 0-100 based on regularity
}

interface AIResult {
  score: number;
  recommendation: string;
  eligible: boolean;
  metrics: CredibilityMetrics;
}

// ─── AI CREDIBILITY CRITERIA ──────────────────

const AI_THRESHOLDS = {
  minCompletedOrders: 28,
  minAvgRating: 3.5,
  minReviewCount: 5,
  maxAvgResponseMinutes: 120, // 2h
  maxAvgTransactionDays: 7,
  maxDisputeCount: 2,
  maxReportCount: 3,
  minAccountAgeDays: 30,
  minActivityScore: 40,
  aiEligibleScore: 60,     // Score pour AI_ELIGIBLE
  verifiedScore: 80,        // Score pour VERIFIED recommandé
};

// ─── USER REQUESTS ────────────────────────────

export async function requestVerification(userId: string, accountType: "USER" | "BUSINESS", businessId?: string) {
  // Check for existing pending/active request
  const existing = await prisma.verificationRequest.findFirst({
    where: {
      ...(accountType === "USER" ? { userId } : { businessId }),
      status: { in: ["PENDING", "VERIFIED", "AI_ELIGIBLE", "PARTIALLY_VERIFIED", "ADMIN_LOCKED_VERIFIED"] },
    },
  });

  if (existing) {
    if (["VERIFIED", "AI_ELIGIBLE", "ADMIN_LOCKED_VERIFIED"].includes(existing.status)) {
      throw new Error("Votre compte est déjà vérifié ou éligible.");
    }
    if (existing.status === "PENDING") {
      throw new Error("Une demande de vérification est déjà en cours.");
    }
  }

  const request = await prisma.verificationRequest.create({
    data: {
      userId: accountType === "USER" ? userId : null,
      businessId: accountType === "BUSINESS" ? businessId : null,
      source: "USER_REQUEST",
      status: "PENDING",
      history: {
        create: {
          action: "REQUESTED",
          fromStatus: "UNVERIFIED",
          toStatus: "PENDING",
          source: "USER_REQUEST",
          performedBy: userId,
          reason: "Demande de vérification soumise par l'utilisateur",
        },
      },
    },
    include: { history: true },
  });

  return request;
}

export async function getMyVerificationStatus(userId: string) {
  const [userProfile, businesses] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { userId },
      select: { verificationStatus: true },
    }),
    prisma.businessAccount.findMany({
      where: { ownerUserId: userId },
      select: { id: true, publicName: true, verificationStatus: true },
    }),
  ]);

  const latestRequest = await prisma.verificationRequest.findFirst({
    where: { OR: [{ userId }, { businessId: { in: businesses.map((b) => b.id) } }] },
    orderBy: { createdAt: "desc" },
    include: { history: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return {
    userStatus: userProfile?.verificationStatus ?? "UNVERIFIED",
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.publicName,
      status: b.verificationStatus,
    })),
    latestRequest,
  };
}

export async function getMyCredibilityScore(userId: string) {
  const metrics = await computeCredibilityMetrics(userId, "USER");
  const result = evaluateAI(metrics);
  return { score: result.score, metrics: result.metrics, recommendation: result.recommendation, eligible: result.eligible };
}

export async function getBusinessCredibilityScore(businessId: string) {
  const metrics = await computeCredibilityMetrics(businessId, "BUSINESS");
  const result = evaluateAI(metrics);
  return { score: result.score, metrics: result.metrics, recommendation: result.recommendation, eligible: result.eligible };
}

// ─── ADMIN OPERATIONS ─────────────────────────

export async function getVerificationRequests(filters: {
  status?: VerificationStatus;
  page?: number;
  limit?: number;
  email?: string;
  source?: string;
  accountType?: "USER" | "BUSINESS";
  minTrustScore?: number;
  maxTrustScore?: number;
  dateFrom?: string;
  dateTo?: string;
}) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const where: Prisma.VerificationRequestWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.source) where.source = filters.source as any;
  if (filters.accountType === "USER") where.userId = { not: null };
  if (filters.accountType === "BUSINESS") where.businessId = { not: null };
  if (filters.email) where.user = { email: { contains: filters.email, mode: "insensitive" } };
  if (filters.minTrustScore != null || filters.maxTrustScore != null) {
    where.user = { ...((where.user as any) ?? {}), trustScore: { gte: filters.minTrustScore ?? 0, lte: filters.maxTrustScore ?? 100 } };
  }
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) (where.createdAt as any).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.createdAt as any).lte = new Date(filters.dateTo + "T23:59:59Z");
  }

  const [requests, total] = await Promise.all([
    prisma.verificationRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, email: true, phone: true, trustScore: true, profile: { select: { displayName: true, verificationStatus: true } } } },
        business: { select: { id: true, publicName: true, verificationStatus: true } },
        resolver: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        history: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    }),
    prisma.verificationRequest.count({ where }),
  ]);

  return { requests, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getVerificationDetail(requestId: string) {
  const request = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    include: {
      user: {
        select: {
          id: true, email: true, phone: true, trustScore: true, trustLevel: true, createdAt: true,
          profile: { select: { displayName: true, avatarUrl: true, verificationStatus: true } },
        },
      },
      business: { select: { id: true, publicName: true, verificationStatus: true, createdAt: true } },
      resolver: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
      history: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!request) throw new Error("Demande de vérification introuvable.");

  // Compute fresh AI metrics
  const targetId = request.userId ?? request.businessId!;
  const accountType = request.userId ? "USER" : "BUSINESS";
  const metrics = await computeCredibilityMetrics(targetId, accountType);
  const aiResult = evaluateAI(metrics);

  return { ...request, freshAiScore: aiResult.score, freshMetrics: aiResult.metrics, freshRecommendation: aiResult.recommendation };
}

export async function adminApproveVerification(requestId: string, adminId: string, note?: string) {
  return adminAction(requestId, adminId, "VERIFIED", "APPROVED", note);
}

export async function adminRejectVerification(requestId: string, adminId: string, note?: string) {
  return adminAction(requestId, adminId, "REJECTED", "REJECTED", note);
}

export async function adminRevokeVerification(requestId: string, adminId: string, note?: string) {
  return adminAction(requestId, adminId, "REVOKED", "REVOKED", note);
}

export async function adminLockVerified(requestId: string, adminId: string, note?: string) {
  return adminAction(requestId, adminId, "ADMIN_LOCKED_VERIFIED", "ADMIN_LOCKED", note);
}

export async function adminLockRevoked(requestId: string, adminId: string, note?: string) {
  return adminAction(requestId, adminId, "ADMIN_LOCKED_REVOKED", "ADMIN_LOCKED", note);
}

export async function adminReactivate(requestId: string, adminId: string, note?: string) {
  return adminAction(requestId, adminId, "VERIFIED", "REACTIVATED", note);
}

async function adminAction(
  requestId: string,
  adminId: string,
  newStatus: VerificationStatus,
  action: string,
  note?: string
) {
  const request = await prisma.verificationRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new Error("Demande de vérification introuvable.");

  const isLocking = newStatus === "ADMIN_LOCKED_VERIFIED" || newStatus === "ADMIN_LOCKED_REVOKED";

  const updated = await prisma.$transaction(async (tx) => {
    const updatedRequest = await tx.verificationRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        adminLocked: isLocking || request.adminLocked,
        adminNote: note,
        resolvedBy: adminId,
        resolvedAt: new Date(),
      },
    });

    await tx.verificationHistory.create({
      data: {
        requestId,
        action,
        fromStatus: request.status,
        toStatus: newStatus,
        source: "ADMIN_MANUAL",
        performedBy: adminId,
        reason: note,
      },
    });

    // Sync status to UserProfile or BusinessAccount
    if (request.userId) {
      await tx.userProfile.updateMany({
        where: { userId: request.userId },
        data: { verificationStatus: newStatus },
      });
    }
    if (request.businessId) {
      await tx.businessAccount.update({
        where: { id: request.businessId },
        data: { verificationStatus: newStatus },
      });
    }

    return updatedRequest;
  });

  // Notifier l'utilisateur du changement de statut
  const notifyUserId = request.userId;
  if (notifyUserId) {
    const verificationNotifs: Record<string, { title: string; body: string }> = {
      VERIFIED: { title: "Kin-Sell • Compte vérifié ✅", body: "Félicitations ! Votre compte a été vérifié." },
      REJECTED: { title: "Kin-Sell • Vérification refusée ❌", body: "Votre demande de vérification a été refusée." },
      REVOKED: { title: "Kin-Sell • Badge révoqué ⚠️", body: "Votre badge de vérification a été révoqué." },
      AI_ELIGIBLE: { title: "Kin-Sell • Éligible 🔍", body: "Vous êtes éligible au badge vérifié !" },
      ADMIN_LOCKED_VERIFIED: { title: "Kin-Sell • Compte vérifié 🔒", body: "Votre vérification a été verrouillée par un administrateur." },
      ADMIN_LOCKED_REVOKED: { title: "Kin-Sell • Badge révoqué 🔒", body: "Votre badge a été révoqué et verrouillé." },
    };
    const notif = verificationNotifs[newStatus];
    if (notif) {
      sendPushToUser(notifyUserId, {
        title: notif.title,
        body: notif.body,
        tag: `verification-${requestId}`,
        data: { type: "default", url: "/account" },
      }).catch(() => {});
    }
  }

  return updated;
}

// ─── AI CREDIBILITY ENGINE ────────────────────

export async function runAICredibilityCheck() {
  // Fetch all users/businesses with PENDING or UNVERIFIED that are NOT admin-locked
  const pendingRequests = await prisma.verificationRequest.findMany({
    where: {
      status: { in: ["PENDING", "UNVERIFIED"] },
      adminLocked: false,
    },
  });

  const results: { requestId: string; score: number; newStatus: string }[] = [];

  for (const request of pendingRequests) {
    const targetId = request.userId ?? request.businessId!;
    const accountType = request.userId ? "USER" : "BUSINESS";
    const metrics = await computeCredibilityMetrics(targetId, accountType as "USER" | "BUSINESS");
    const aiResult = evaluateAI(metrics);

    let newStatus: VerificationStatus | null = null;
    if (aiResult.score >= AI_THRESHOLDS.verifiedScore) {
      newStatus = "AI_ELIGIBLE";
    } else if (aiResult.score >= AI_THRESHOLDS.aiEligibleScore) {
      newStatus = "PARTIALLY_VERIFIED";
    }

    if (newStatus && newStatus !== request.status) {
      await prisma.$transaction(async (tx) => {
        await tx.verificationRequest.update({
          where: { id: request.id },
          data: {
            status: newStatus!,
            aiScore: aiResult.score,
            aiRecommendation: aiResult.recommendation,
            aiEvaluatedAt: new Date(),
            metricsSnapshot: aiResult.metrics as any,
          },
        });

        await tx.verificationHistory.create({
          data: {
            requestId: request.id,
            action: newStatus === "AI_ELIGIBLE" ? "AI_ELIGIBLE" : "AI_PARTIAL",
            fromStatus: request.status,
            toStatus: newStatus!,
            source: "AI_AUTO",
            performedBy: "SYSTEM",
            reason: aiResult.recommendation,
            metadata: aiResult.metrics as any,
          },
        });

        // Sync status to profile
        if (request.userId) {
          await tx.userProfile.updateMany({
            where: { userId: request.userId },
            data: { verificationStatus: newStatus! },
          });
        }
        if (request.businessId) {
          await tx.businessAccount.update({
            where: { id: request.businessId },
            data: { verificationStatus: newStatus! },
          });
        }
      });

      results.push({ requestId: request.id, score: aiResult.score, newStatus });
    }
  }

  return { processed: pendingRequests.length, updated: results.length, results };
}

// Auto-create requests for users who may be eligible but haven't requested (proactive scan)
export async function scanAndCreateEligibleRequests() {
  // Find users with enough orders who don't have a pending request
  const eligibleUsers = await prisma.user.findMany({
    where: {
      trustScore: { gte: 50 },
      profile: { verificationStatus: "UNVERIFIED" },
      verificationRequests: { none: { status: { in: ["PENDING", "AI_ELIGIBLE", "PARTIALLY_VERIFIED", "VERIFIED", "ADMIN_LOCKED_VERIFIED"] } } },
    },
    select: { id: true },
    take: 100,
  });

  let created = 0;
  for (const user of eligibleUsers) {
    const metrics = await computeCredibilityMetrics(user.id, "USER");
    const aiResult = evaluateAI(metrics);

    if (aiResult.eligible) {
      await prisma.verificationRequest.create({
        data: {
          userId: user.id,
          source: "AI_AUTO",
          status: aiResult.score >= AI_THRESHOLDS.verifiedScore ? "AI_ELIGIBLE" : "PARTIALLY_VERIFIED",
          aiScore: aiResult.score,
          aiRecommendation: aiResult.recommendation,
          aiEvaluatedAt: new Date(),
          metricsSnapshot: aiResult.metrics as any,
          history: {
            create: {
              action: "AI_ELIGIBLE",
              fromStatus: "UNVERIFIED",
              toStatus: aiResult.score >= AI_THRESHOLDS.verifiedScore ? "AI_ELIGIBLE" : "PARTIALLY_VERIFIED",
              source: "AI_AUTO",
              performedBy: "SYSTEM",
              reason: aiResult.recommendation,
              metadata: aiResult.metrics as any,
            },
          },
        },
      });
      created++;
    }
  }

  return { scanned: eligibleUsers.length, created };
}

// ─── METRICS COMPUTATION ──────────────────────

async function computeCredibilityMetrics(targetId: string, accountType: "USER" | "BUSINESS"): Promise<CredibilityMetrics> {
  if (accountType === "USER") {
    return computeUserMetrics(targetId);
  }
  return computeBusinessMetrics(targetId);
}

async function computeUserMetrics(userId: string): Promise<CredibilityMetrics> {
  const [
    user,
    profile,
    completedBuyerOrders,
    completedSellerOrders,
    reviewsReceived,
    disputes,
    reports,
    listings,
    recentActivity,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, profileCompleted: true } }),
    prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true, avatarUrl: true, bio: true, city: true } }),
    prisma.order.count({ where: { buyerUserId: userId, status: "DELIVERED" } }),
    prisma.order.count({ where: { sellerUserId: userId, status: "DELIVERED" } }),
    prisma.userReview.findMany({
      where: { targetId: userId },
      select: { rating: true },
    }),
    prisma.order.count({ where: { OR: [{ buyerUserId: userId }, { sellerUserId: userId }], status: "CANCELED" } }),
    prisma.report.count({ where: { reportedUserId: userId, status: "RESOLVED" } }),
    prisma.listing.count({ where: { ownerUserId: userId, status: "ACTIVE" } }),
    prisma.order.count({
      where: {
        OR: [{ buyerUserId: userId }, { sellerUserId: userId }],
        updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const completedOrders = completedBuyerOrders + completedSellerOrders;
  const avgRating = reviewsReceived.length > 0
    ? reviewsReceived.reduce((sum, r) => sum + r.rating, 0) / reviewsReceived.length
    : 0;
  const accountAgeDays = user ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const profileComplete = !!(profile?.displayName && profile?.avatarUrl && profile?.bio && profile?.city);
  const activityScore = Math.min(100, recentActivity * 10);

  return {
    completedOrders,
    avgRating: Math.round(avgRating * 100) / 100,
    reviewCount: reviewsReceived.length,
    avgResponseTimeMinutes: 60, // TODO: compute from messaging data when available
    avgTransactionDays: 3,      // TODO: compute from order timestamps
    disputeCount: disputes,
    reportCount: reports,
    accountAgeDays,
    profileComplete,
    listingsCount: listings,
    activityScore,
  };
}

async function computeBusinessMetrics(businessId: string): Promise<CredibilityMetrics> {
  const [
    business,
    completedOrders,
    reviewsForListings,
    disputes,
    reports,
    listings,
    recentOrders,
  ] = await Promise.all([
    prisma.businessAccount.findUnique({ where: { id: businessId }, select: { createdAt: true, ownerUserId: true } }),
    prisma.order.count({ where: { sellerBusinessId: businessId, status: "DELIVERED" } }),
    prisma.userReview.findMany({
      where: { order: { sellerBusinessId: businessId } },
      select: { rating: true },
    }),
    prisma.order.count({ where: { sellerBusinessId: businessId, status: "CANCELED" } }),
    prisma.report.count({ where: { reported: { businesses: { some: { id: businessId } } }, status: "RESOLVED" } }),
    prisma.listing.count({ where: { businessId, status: "ACTIVE" } }),
    prisma.order.count({
      where: {
        sellerBusinessId: businessId,
        updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const avgRating = reviewsForListings.length > 0
    ? reviewsForListings.reduce((sum, r) => sum + r.rating, 0) / reviewsForListings.length
    : 0;
  const accountAgeDays = business ? Math.floor((Date.now() - business.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const activityScore = Math.min(100, recentOrders * 10);

  return {
    completedOrders,
    avgRating: Math.round(avgRating * 100) / 100,
    reviewCount: reviewsForListings.length,
    avgResponseTimeMinutes: 60,
    avgTransactionDays: 3,
    disputeCount: disputes,
    reportCount: reports,
    accountAgeDays,
    profileComplete: true, // Business profiles are always "complete" if they exist
    listingsCount: listings,
    activityScore,
  };
}

function evaluateAI(metrics: CredibilityMetrics): AIResult {
  let score = 0;
  const maxScore = 100;

  // Orders (30 pts)
  score += Math.min(30, (metrics.completedOrders / AI_THRESHOLDS.minCompletedOrders) * 30);

  // Rating (20 pts)
  if (metrics.reviewCount >= AI_THRESHOLDS.minReviewCount) {
    score += Math.min(20, (metrics.avgRating / 5) * 20);
  }

  // Account age (10 pts)
  score += Math.min(10, (metrics.accountAgeDays / AI_THRESHOLDS.minAccountAgeDays) * 10);

  // Activity (10 pts)
  score += (metrics.activityScore / 100) * 10;

  // Profile completeness (5 pts)
  if (metrics.profileComplete) score += 5;

  // Listings (5 pts)
  score += Math.min(5, metrics.listingsCount);

  // Penalties
  if (metrics.disputeCount > AI_THRESHOLDS.maxDisputeCount) {
    score -= (metrics.disputeCount - AI_THRESHOLDS.maxDisputeCount) * 5;
  }
  if (metrics.reportCount > AI_THRESHOLDS.maxReportCount) {
    score -= (metrics.reportCount - AI_THRESHOLDS.maxReportCount) * 8;
  }

  // Response time bonus (10 pts)
  if (metrics.avgResponseTimeMinutes <= AI_THRESHOLDS.maxAvgResponseMinutes) {
    score += 10;
  } else {
    score += Math.max(0, 10 - (metrics.avgResponseTimeMinutes - AI_THRESHOLDS.maxAvgResponseMinutes) / 60);
  }

  // Transaction speed bonus (10 pts)
  if (metrics.avgTransactionDays <= AI_THRESHOLDS.maxAvgTransactionDays) {
    score += 10;
  }

  score = Math.max(0, Math.min(maxScore, Math.round(score)));

  let recommendation: string;
  if (score >= AI_THRESHOLDS.verifiedScore) {
    recommendation = "Profil fortement recommandé pour la vérification. Activité et réputation excellentes.";
  } else if (score >= AI_THRESHOLDS.aiEligibleScore) {
    recommendation = "Profil partiellement éligible. Bonne activité mais certains critères peuvent être améliorés.";
  } else {
    recommendation = "Profil pas encore éligible. Continuez à compléter des transactions et maintenir une bonne réputation.";
  }

  return {
    score,
    recommendation,
    eligible: score >= AI_THRESHOLDS.aiEligibleScore,
    metrics,
  };
}

// ─── SCHEDULER ────────────────────────────────

export function startVerificationScheduler() {
  // Run AI credibility check every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  const run = async () => {
    try {
      const checkResult = await runAICredibilityCheck();
      const scanResult = await scanAndCreateEligibleRequests();
      logger.info(
        `[Verification] AI scan: ${checkResult.processed} checked, ${checkResult.updated} updated; ${scanResult.created} new eligible`
      );
    } catch (err) {
      logger.error(err, "[Verification] AI scheduler error");
    }
  };

  // Initial run after 2 minutes
  setTimeout(() => { void run(); }, 2 * 60 * 1000);
  setInterval(() => { void run(); }, SIX_HOURS);
}

// ─── VERIFICATION KPI ─────────────────────────

export async function getVerificationKpi() {
  const allCounts = await prisma.verificationRequest.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  const countMap: Record<string, number> = {};
  for (const c of allCounts) countMap[c.status] = c._count.id;

  const sourceCounts = await prisma.verificationRequest.groupBy({
    by: ["source"],
    _count: { id: true },
  });
  const sourceMap: Record<string, number> = {};
  for (const s of sourceCounts) sourceMap[s.source] = s._count.id;

  const highRisk = await prisma.verificationRequest.count({
    where: { aiScore: { lt: 40 }, status: { notIn: ["REJECTED", "REVOKED", "ADMIN_LOCKED_REVOKED"] } },
  });

  const total = Object.values(countMap).reduce((a, b) => a + b, 0);

  return {
    pending: countMap["PENDING"] ?? 0,
    verified: (countMap["VERIFIED"] ?? 0) + (countMap["ADMIN_LOCKED_VERIFIED"] ?? 0),
    verifiedAi: countMap["AI_ELIGIBLE"] ?? 0,
    partiallyVerified: countMap["PARTIALLY_VERIFIED"] ?? 0,
    rejected: countMap["REJECTED"] ?? 0,
    revoked: (countMap["REVOKED"] ?? 0) + (countMap["ADMIN_LOCKED_REVOKED"] ?? 0),
    highRisk,
    total,
    byStatus: countMap,
    bySource: sourceMap,
  };
}
