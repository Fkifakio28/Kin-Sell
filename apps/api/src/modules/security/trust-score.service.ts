/**
 * Trust Score Service — Kin-Sell
 *
 * Score 0-100 (base 50).
 * TrustLevel: NEW (<40), STANDARD (40-59), VERIFIED (60-79), PREMIUM (80+)
 *
 * Calcul incrémental via deltas + recalcul complet périodique.
 */

import { Prisma, TrustLevel } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";

/* ── Constants ── */
const TRUST_MIN = 0;
const TRUST_MAX = 100;
const TRUST_BASE = 50;

/* ── Score → Level mapping ── */
export function computeLevel(score: number): TrustLevel {
  if (score >= 80) return "PREMIUM";
  if (score >= 60) return "VERIFIED";
  if (score >= 40) return "STANDARD";
  return "NEW";
}

function clamp(n: number): number {
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, n));
}

/* ── Apply a delta to a user's trust score ── */
export async function applyDelta(
  userId: string,
  delta: number,
  reason: string,
  source: string,
  metadata?: Record<string, unknown>,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustScore: true },
  });
  if (!user) return null;

  const newScore = clamp(user.trustScore + delta);
  const newLevel = computeLevel(newScore);

  const [updated] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { trustScore: newScore, trustLevel: newLevel },
    }),
    prisma.trustScoreEvent.create({
      data: {
        userId,
        delta,
        reason,
        source,
        newScore,
        newLevel,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    }),
  ]);

  // Auto-restrictions based on score thresholds
  if (newScore < 20 && user.trustScore >= 20) {
    await autoRestrict(userId, "trustScore < 20 — compte à risque élevé");
  }

  return { score: updated.trustScore, level: updated.trustLevel };
}

/* ── Full recalculation from scratch ── */
export async function recalculate(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: { select: { verificationStatus: true, displayName: true, avatarUrl: true, city: true } },
      buyerOrders: { where: { status: "DELIVERED" }, select: { id: true } },
      sellerOrders: { where: { status: "DELIVERED" }, select: { id: true } },
      reportsReceived: { where: { status: { not: "RESOLVED" } }, select: { id: true } },
    },
  });
  if (!user) return null;

  let score = TRUST_BASE;

  // Email verified: +10
  if (user.emailVerified) score += 10;
  // Phone verified: +10
  if (user.phoneVerified) score += 10;

  // Profile completeness: +10
  const p = user.profile;
  if (p && p.displayName && p.avatarUrl && p.city) score += 10;
  if (p?.verificationStatus === "VERIFIED") score += 5;

  // Successful orders (buyer): +2 per order (max +10)
  score += Math.min(10, user.buyerOrders.length * 2);
  // Successful orders (seller): +2 per order (max +10)
  score += Math.min(10, user.sellerOrders.length * 2);

  // Account age: +5 if > 30 days
  const ageDays = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 30) score += 5;

  // Pending reports against user: -10 per report (max -30)
  score -= Math.min(30, user.reportsReceived.length * 10);

  // Fraud signals not resolved
  const fraudCount = await prisma.fraudSignal.count({
    where: { userId, resolved: false },
  });
  score -= Math.min(30, fraudCount * 15);

  // Active restrictions count
  const restrictionCount = await prisma.userRestriction.count({
    where: { userId, isActive: true },
  });
  score -= restrictionCount * 5;

  score = clamp(score);
  const level = computeLevel(score);

  await prisma.user.update({
    where: { id: userId },
    data: { trustScore: score, trustLevel: level },
  });

  return { score, level };
}

/* ── Auto-restrict on very low score ── */
async function autoRestrict(userId: string, reason: string) {
  const existing = await prisma.userRestriction.findFirst({
    where: { userId, restrictionType: "FULL_READONLY", isActive: true },
  });
  if (existing) return;

  await prisma.userRestriction.create({
    data: {
      userId,
      restrictionType: "FULL_READONLY",
      reason,
      sanctionLevel: "RESTRICTION",
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: null,
      action: "AUTO_RESTRICTION",
      entityType: "USER",
      entityId: userId,
      metadata: { reason },
    },
  });
}

/* ── Known trust events ── */
export const TrustEvents = {
  EMAIL_VERIFIED:        { delta: +10, reason: "Email vérifié", source: "verification" },
  PHONE_VERIFIED:        { delta: +10, reason: "Téléphone vérifié", source: "verification" },
  PROFILE_COMPLETED:     { delta: +10, reason: "Profil complété", source: "profile" },
  ORDER_COMPLETED_BUYER: { delta: +2,  reason: "Commande terminée (acheteur)", source: "order" },
  ORDER_COMPLETED_SELLER:{ delta: +2,  reason: "Commande terminée (vendeur)", source: "order" },
  POSITIVE_REVIEW:       { delta: +3,  reason: "Avis positif reçu", source: "review" },
  REPORT_RECEIVED:       { delta: -10, reason: "Signalement reçu", source: "report" },
  REPORT_CONFIRMED:      { delta: -20, reason: "Signalement confirmé", source: "moderation" },
  SPAM_DETECTED:         { delta: -10, reason: "Spam détecté", source: "antiSpam" },
  FRAUD_SIGNAL:          { delta: -15, reason: "Signal de fraude", source: "antiFraud" },
  ABUSE_NEGOTIATION:     { delta: -10, reason: "Abus marchandage", source: "negotiation" },
  SUSPICIOUS_CANCEL:     { delta: -5,  reason: "Annulation suspecte", source: "order" },
  ACCOUNT_AGE_30D:       { delta: +5,  reason: "Ancienneté > 30 jours", source: "system" },
} as const;
