/**
 * Security Service — Kin-Sell
 *
 * Event logging, fraud signals, restrictions management,
 * spam detection indicators, and progressive sanctions.
 */

import { RestrictionType, SanctionLevel } from "../../shared/db/prisma-enums.js";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { applyDelta, TrustEvents, recalculate } from "./trust-score.service.js";

/* ═══════════════════════════════════
   SECURITY EVENT LOGGING
   ═══════════════════════════════════ */

export async function logSecurityEvent(params: {
  userId?: string;
  eventType: string;
  ipAddress?: string;
  userAgent?: string;
  deviceId?: string;
  riskLevel?: number;
  metadata?: Record<string, unknown>;
}) {
  return prisma.securityEvent.create({
    data: {
      userId: params.userId,
      eventType: params.eventType,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      deviceId: params.deviceId,
      riskLevel: params.riskLevel ?? 0,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/* ═══════════════════════════════════
   FRAUD SIGNALS
   ═══════════════════════════════════ */

export async function createFraudSignal(params: {
  userId: string;
  signalType: string;
  severity?: number;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const signal = await prisma.fraudSignal.create({
    data: {
      userId: params.userId,
      signalType: params.signalType,
      severity: params.severity ?? 1,
      description: params.description,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  // Impact trust score
  await applyDelta(
    params.userId,
    TrustEvents.FRAUD_SIGNAL.delta * (params.severity ?? 1),
    `${TrustEvents.FRAUD_SIGNAL.reason}: ${params.signalType}`,
    TrustEvents.FRAUD_SIGNAL.source,
    { signalId: signal.id },
  );

  return signal;
}

export async function resolveFraudSignal(signalId: string, resolvedBy: string) {
  return prisma.fraudSignal.update({
    where: { id: signalId },
    data: { resolved: true, resolvedBy, resolvedAt: new Date() },
  });
}

/* ═══════════════════════════════════
   RESTRICTIONS
   ═══════════════════════════════════ */

export async function applyRestriction(params: {
  userId: string;
  restrictionType: RestrictionType;
  reason: string;
  sanctionLevel?: SanctionLevel;
  appliedBy?: string;
  durationHours?: number;
}) {
  // Check if same restriction already active
  const existing = await prisma.userRestriction.findFirst({
    where: { userId: params.userId, restrictionType: params.restrictionType, isActive: true },
  });
  if (existing) return existing;

  const expiresAt = params.durationHours
    ? new Date(Date.now() + params.durationHours * 3600_000)
    : undefined;

  const restriction = await prisma.userRestriction.create({
    data: {
      userId: params.userId,
      restrictionType: params.restrictionType,
      reason: params.reason,
      sanctionLevel: params.sanctionLevel ?? "RESTRICTION",
      appliedBy: params.appliedBy,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: params.appliedBy,
      action: "RESTRICTION_APPLIED",
      entityType: "USER",
      entityId: params.userId,
      metadata: { type: params.restrictionType, reason: params.reason, sanctionLevel: params.sanctionLevel },
    },
  });

  return restriction;
}

export async function liftRestriction(restrictionId: string) {
  return prisma.userRestriction.update({
    where: { id: restrictionId },
    data: { isActive: false, liftedAt: new Date() },
  });
}

export async function getUserActiveRestrictions(userId: string) {
  // Also clean up expired restrictions
  await prisma.userRestriction.updateMany({
    where: { userId, isActive: true, expiresAt: { lt: new Date() } },
    data: { isActive: false, liftedAt: new Date() },
  });

  return prisma.userRestriction.findMany({
    where: { userId, isActive: true },
  });
}

export async function hasRestriction(userId: string, type: RestrictionType): Promise<boolean> {
  const restrictions = await getUserActiveRestrictions(userId);
  return restrictions.some(r => r.restrictionType === type);
}

/* ═══════════════════════════════════
   PROGRESSIVE SANCTIONS
   ═══════════════════════════════════ */

export async function applySanction(params: {
  userId: string;
  level: SanctionLevel;
  reason: string;
  appliedBy?: string;
  durationHours?: number;
}) {
  switch (params.level) {
    case "WARNING": {
      await prisma.auditLog.create({
        data: {
          actorUserId: params.appliedBy,
          action: "SANCTION_WARNING",
          entityType: "USER",
          entityId: params.userId,
          metadata: { reason: params.reason },
        },
      });
      break;
    }

    case "RESTRICTION": {
      await applyRestriction({
        userId: params.userId,
        restrictionType: "LISTING_LIMIT",
        reason: params.reason,
        sanctionLevel: "RESTRICTION",
        appliedBy: params.appliedBy,
        durationHours: params.durationHours ?? 72,
      });
      await applyRestriction({
        userId: params.userId,
        restrictionType: "MESSAGE_LIMIT",
        reason: params.reason,
        sanctionLevel: "RESTRICTION",
        appliedBy: params.appliedBy,
        durationHours: params.durationHours ?? 72,
      });
      break;
    }

    case "FUNCTION_BLOCK": {
      await applyRestriction({
        userId: params.userId,
        restrictionType: "NEGOTIATION_BLOCK",
        reason: params.reason,
        sanctionLevel: "FUNCTION_BLOCK",
        appliedBy: params.appliedBy,
        durationHours: params.durationHours ?? 168,
      });
      await applyRestriction({
        userId: params.userId,
        restrictionType: "VISIBILITY_REDUCED",
        reason: params.reason,
        sanctionLevel: "FUNCTION_BLOCK",
        appliedBy: params.appliedBy,
        durationHours: params.durationHours ?? 168,
      });
      break;
    }

    case "SUSPENSION": {
      await prisma.user.update({
        where: { id: params.userId },
        data: { accountStatus: "SUSPENDED" },
      });
      await applyRestriction({
        userId: params.userId,
        restrictionType: "FULL_READONLY",
        reason: params.reason,
        sanctionLevel: "SUSPENSION",
        appliedBy: params.appliedBy,
        durationHours: params.durationHours,
      });
      break;
    }

    case "BAN": {
      await prisma.user.update({
        where: { id: params.userId },
        data: { accountStatus: "SUSPENDED" },
      });
      await applyRestriction({
        userId: params.userId,
        restrictionType: "FULL_READONLY",
        reason: `BAN: ${params.reason}`,
        sanctionLevel: "BAN",
        appliedBy: params.appliedBy,
        // No expiry for ban
      });
      break;
    }
  }

  await logSecurityEvent({
    userId: params.userId,
    eventType: `SANCTION_${params.level}`,
    riskLevel: params.level === "BAN" ? 10 : params.level === "SUSPENSION" ? 8 : 5,
    metadata: { reason: params.reason, appliedBy: params.appliedBy },
  });
}

/* ═══════════════════════════════════
   SPAM DETECTION HELPERS
   ═══════════════════════════════════ */

/**
 * Count recent actions of a type within a window.
 * Used by rate-limit middleware and detection logic.
 */
export async function countRecentEvents(
  userId: string,
  eventType: string,
  windowMinutes: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  return prisma.securityEvent.count({
    where: { userId, eventType, createdAt: { gte: since } },
  });
}

/**
 * Detect if a message looks like spam (links, phone numbers, repeated text).
 */
export function isSpamContent(text: string): boolean {
  if (!text) return false;
  // URL patterns (very early in conversation context)
  const urlCount = (text.match(/https?:\/\/|www\./gi) ?? []).length;
  if (urlCount >= 3) return true;
  // Phone number patterns
  const phoneCount = (text.match(/(\+?\d[\d\s\-]{8,})/g) ?? []).length;
  if (phoneCount >= 2) return true;
  // Repeated words
  const words = text.toLowerCase().split(/\s+/);
  if (words.length > 5) {
    const unique = new Set(words);
    if (unique.size / words.length < 0.3) return true;
  }
  return false;
}

/**
 * Detect suspicious listing patterns.
 */
export function isSuspiciousListing(params: {
  title: string;
  priceUsdCents: number;
  description?: string;
}): { suspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Price is zero or suspiciously low
  if (params.priceUsdCents <= 0) reasons.push("Prix nul ou négatif");
  if (params.priceUsdCents > 0 && params.priceUsdCents < 50) reasons.push("Prix suspicieusement bas (<0.50$)");

  // Extremely high price
  if (params.priceUsdCents > 10_000_000) reasons.push("Prix extrêmement élevé (>100k$)");

  // Title is all caps
  if (params.title === params.title.toUpperCase() && params.title.length > 10) reasons.push("Titre tout en majuscules");

  // Keyword stuffing in title
  const words = params.title.split(/\s+/);
  if (words.length > 15) reasons.push("Bourrage de mots-clés dans le titre");

  // Spam content in description
  if (params.description && isSpamContent(params.description)) reasons.push("Description spam");

  return { suspicious: reasons.length > 0, reasons };
}

/* ═══════════════════════════════════
   MULTI-ACCOUNT DETECTION
   ═══════════════════════════════════ */

export async function checkMultiAccount(ipAddress: string, windowHours: number = 24): Promise<{
  suspicious: boolean;
  accountCount: number;
}> {
  const since = new Date(Date.now() - windowHours * 3600_000);
  const registrations = await prisma.securityEvent.findMany({
    where: {
      eventType: "AUTH_REGISTER",
      ipAddress,
      createdAt: { gte: since },
    },
    select: { userId: true },
  });

  const uniqueUsers = new Set(registrations.map(r => r.userId).filter(Boolean));
  return {
    suspicious: uniqueUsers.size >= 3,
    accountCount: uniqueUsers.size,
  };
}

/* ═══════════════════════════════════
   ADMIN QUERIES
   ═══════════════════════════════════ */

export async function getSecurityDashboard() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600_000);
  const last7d = new Date(now.getTime() - 7 * 24 * 3600_000);

  const [
    events24h,
    events7d,
    activeRestrictions,
    unresolvedFraud,
    lowTrustUsers,
    suspendedUsers,
    recentHighRisk,
  ] = await Promise.all([
    prisma.securityEvent.count({ where: { createdAt: { gte: last24h } } }),
    prisma.securityEvent.count({ where: { createdAt: { gte: last7d } } }),
    prisma.userRestriction.count({ where: { isActive: true } }),
    prisma.fraudSignal.count({ where: { resolved: false } }),
    prisma.user.count({ where: { trustScore: { lt: 40 } } }),
    prisma.user.count({ where: { accountStatus: "SUSPENDED" } }),
    prisma.securityEvent.findMany({
      where: { riskLevel: { gte: 5 }, createdAt: { gte: last24h } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { id: true, email: true, profile: { select: { displayName: true } } } } },
    }),
  ]);

  return {
    events24h,
    events7d,
    activeRestrictions,
    unresolvedFraud,
    lowTrustUsers,
    suspendedUsers,
    recentHighRisk,
  };
}

export async function getSecurityEvents(params: {
  page?: number;
  limit?: number;
  eventType?: string;
  userId?: string;
  riskLevel?: number;
}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 30;
  const where: Record<string, unknown> = {};
  if (params.eventType) where.eventType = params.eventType;
  if (params.userId) where.userId = params.userId;
  if (params.riskLevel) where.riskLevel = { gte: params.riskLevel };

  const [events, total] = await Promise.all([
    prisma.securityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, email: true, profile: { select: { displayName: true } } } } },
    }),
    prisma.securityEvent.count({ where }),
  ]);

  return { events, total };
}

export async function getFraudSignals(params: {
  page?: number;
  limit?: number;
  resolved?: boolean;
}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 30;
  const where: Record<string, unknown> = {};
  if (params.resolved !== undefined) where.resolved = params.resolved;

  const [signals, total] = await Promise.all([
    prisma.fraudSignal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, email: true, profile: { select: { displayName: true } } } } },
    }),
    prisma.fraudSignal.count({ where }),
  ]);

  return { signals, total };
}

export async function getUserTrustHistory(userId: string, limit = 50) {
  return prisma.trustScoreEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getAllRestrictions(params: {
  page?: number;
  limit?: number;
  isActive?: boolean;
}) {
  const page = params.page ?? 1;
  const limit = params.limit ?? 30;
  const where: Record<string, unknown> = {};
  if (params.isActive !== undefined) where.isActive = params.isActive;

  const [restrictions, total] = await Promise.all([
    prisma.userRestriction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, email: true, profile: { select: { displayName: true } } } } },
    }),
    prisma.userRestriction.count({ where }),
  ]);

  return { restrictions, total };
}
