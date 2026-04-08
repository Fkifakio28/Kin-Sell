/**
 * IA Messenger Promo — Service de messages promotionnels automatiques
 *
 * Travaille avec l'IA ADS pour envoyer des messages promotionnels ciblés :
 * - Emails via ADS@Kin-sell.com (alias de contact@Kin-sell.com)
 * - Notifications push
 * - Messages internes
 *
 * Les cibles sont déterminées par Kin-Sell Analytique (segments, catégories, villes)
 */

import { prisma } from "../../shared/db/prisma.js";
import { sendMail } from "../../shared/email/mailer.js";
import { sendPushToUser } from "../notifications/push.service.js";
import { logger } from "../../shared/logger.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PromoChannel = "EMAIL" | "PUSH" | "INTERNAL";
export type PromoReason = "BOOST_PROMO" | "HIGHLIGHT_PROMO" | "SUBSCRIPTION_PROMO" | "NEW_FEATURE" | "TRENDING" | "SEASONAL";

export interface PromoMessage {
  id: string;
  channel: PromoChannel;
  recipientId: string;
  recipientEmail?: string;
  recipientName?: string;
  subject: string;
  body: string;
  reason: PromoReason;
  targetItem?: string; // listing/shop/profile ID being promoted
  sentAt: Date;
  delivered: boolean;
  opened?: boolean;
}

export interface PromoLog {
  id: string;
  channel: PromoChannel;
  reason: PromoReason;
  recipientUserId: string;
  recipientEmail: string | null;
  recipientName: string;
  subject: string;
  bodyPreview: string;
  targetItemId: string | null;
  targetItemTitle: string | null;
  delivered: boolean;
  sentAt: Date;
}

export interface PromoCampaignStats {
  totalSent: number;
  totalDelivered: number;
  byChannel: { channel: PromoChannel; count: number }[];
  byReason: { reason: PromoReason; count: number }[];
  recentMessages: PromoLog[];
}

// ─────────────────────────────────────────────
// Envoi de messages promotionnels
// ─────────────────────────────────────────────

/**
 * Envoie un email promotionnel via ADS@Kin-sell.com
 */
export async function sendPromoEmail(
  recipientId: string,
  subject: string,
  htmlBody: string,
  reason: PromoReason,
  targetItemId?: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { email: true, profile: { select: { displayName: true } } },
  });
  if (!user?.email) return false;

  const delivered = await sendMail({
    to: user.email,
    subject: `[Kin-Sell] ${subject}`,
    html: wrapInKinSellTemplate(subject, htmlBody),
  });

  // Log the promo
  await prisma.aiAutonomyLog.create({
    data: {
      agentName: "IA_MESSENGER",
      actionType: "PROMO_EMAIL",
      targetUserId: recipientId,
      decision: `Email: ${subject}`,
      reasoning: `Raison: ${reason}${targetItemId ? ` | Cible: ${targetItemId}` : ""}`,
      success: delivered,
    },
  });

  logger.info({ recipientId, subject, reason, delivered }, "[IA Messenger] Email promo envoyé");
  return delivered;
}

/**
 * Envoie une notification push promotionnelle
 */
export async function sendPromoPush(
  recipientId: string,
  title: string,
  body: string,
  reason: PromoReason,
  targetItemId?: string,
): Promise<boolean> {
  try {
    await sendPushToUser(recipientId, {
      title: `🎯 ${title}`,
      body,
      tag: `promo-${reason.toLowerCase()}`,
      data: { type: "PROMO", reason, targetItemId },
    });

    await prisma.aiAutonomyLog.create({
      data: {
        agentName: "IA_MESSENGER",
        actionType: "PROMO_PUSH",
        targetUserId: recipientId,
        decision: `Push: ${title}`,
        reasoning: `Raison: ${reason}${targetItemId ? ` | Cible: ${targetItemId}` : ""}`,
        success: true,
      },
    });

    return true;
  } catch (err) {
    logger.error({ err, recipientId }, "[IA Messenger] Erreur push promo");
    return false;
  }
}

/**
 * Envoie une promotion pour un article boosté aux acheteurs ciblés
 * Ciblage basé sur : même catégorie + même ville
 */
export async function promoteListingBoost(listingId: string): Promise<number> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      category: true,
      city: true,
      priceUsdCents: true,
      ownerUserId: true,
    },
  });
  if (!listing) return 0;

  // Trouver les acheteurs potentiels qui ont commandé dans la même catégorie
  const potentialBuyers = await prisma.user.findMany({
    where: {
      id: { not: listing.ownerUserId },
      accountStatus: "ACTIVE",
      email: { not: null },
      buyerOrders: {
        some: {
          items: {
            some: {
              category: listing.category,
            },
          },
        },
      },
    },
    select: {
      id: true,
      email: true,
      profile: { select: { displayName: true, city: true } },
    },
    take: 50,
  });

  let sent = 0;
  for (const buyer of potentialBuyers) {
    const sent1 = await sendPromoPush(
      buyer.id,
      `Nouveau dans ${listing.category}`,
      `"${listing.title}" est maintenant disponible${listing.city ? ` à ${listing.city}` : ""} ! Découvrez cette offre sponsorisée.`,
      "BOOST_PROMO",
      listingId,
    );
    if (sent1) sent++;
  }

  logger.info({ listingId, sent, total: potentialBuyers.length }, "[IA Messenger] Promo boost listing envoyée");
  return sent;
}

/**
 * Envoie une promotion pour une boutique/profil mis en avant
 */
export async function promoteHighlight(
  userId: string,
  type: "SHOP" | "PROFILE",
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      profile: { select: { displayName: true, city: true } },
      listings: {
        where: { status: "ACTIVE" },
        select: { category: true },
        take: 10,
      },
    },
  });
  if (!user) return 0;

  const categories = [...new Set(user.listings.map((l) => l.category))];

  // Cibler les acheteurs dans les mêmes catégories
  const potentialBuyers = await prisma.user.findMany({
    where: {
      id: { not: userId },
      accountStatus: "ACTIVE",
      buyerOrders: {
        some: {
          items: {
            some: {
              category: { in: categories },
            },
          },
        },
      },
    },
    select: { id: true },
    take: 100,
  });

  let sent = 0;
  const name = user.profile?.displayName ?? "Un vendeur";
  for (const buyer of potentialBuyers) {
    const ok = await sendPromoPush(
      buyer.id,
      type === "SHOP" ? "Boutique mise en avant" : "Profil mis en avant",
      `${name} a mis en avant ${type === "SHOP" ? "sa boutique" : "son profil"} ! Découvrez ses offres dans ${categories.slice(0, 3).join(", ")}.`,
      "HIGHLIGHT_PROMO",
      userId,
    );
    if (ok) sent++;
  }

  return sent;
}

/**
 * Récupérer les stats des campagnes promotionnelles pour le dashboard admin
 */
export async function getPromoCampaignStats(): Promise<PromoCampaignStats> {
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const logs = await prisma.aiAutonomyLog.findMany({
    where: {
      agentName: "IA_MESSENGER",
      actionType: { startsWith: "PROMO_" },
      createdAt: { gte: last30d },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      actionType: true,
      targetUserId: true,
      decision: true,
      reasoning: true,
      success: true,
      createdAt: true,
    },
  });

  const totalSent = logs.length;
  const totalDelivered = logs.filter((l) => l.success).length;

  // Count by channel
  const emailCount = logs.filter((l) => l.actionType === "PROMO_EMAIL").length;
  const pushCount = logs.filter((l) => l.actionType === "PROMO_PUSH").length;
  const internalCount = logs.filter((l) => l.actionType === "PROMO_INTERNAL").length;

  // Count by reason  
  const reasonCounts = new Map<string, number>();
  for (const log of logs) {
    const match = log.reasoning?.match(/Raison: (\w+)/);
    if (match) {
      reasonCounts.set(match[1], (reasonCounts.get(match[1]) ?? 0) + 1);
    }
  }

  // Build recent messages with user names
  const userIds = [...new Set(logs.slice(0, 50).map((l) => l.targetUserId).filter(Boolean))] as string[];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, profile: { select: { displayName: true } } },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const recentMessages: PromoLog[] = logs.slice(0, 50).map((l) => {
    const user = l.targetUserId ? userMap.get(l.targetUserId) : null;
    const reasonMatch = l.reasoning?.match(/Raison: (\w+)/);
    const targetMatch = l.reasoning?.match(/Cible: (\S+)/);
    return {
      id: l.id,
      channel: (l.actionType === "PROMO_EMAIL" ? "EMAIL" : l.actionType === "PROMO_PUSH" ? "PUSH" : "INTERNAL") as PromoChannel,
      reason: (reasonMatch?.[1] ?? "BOOST_PROMO") as PromoReason,
      recipientUserId: l.targetUserId ?? "",
      recipientEmail: user?.email ?? null,
      recipientName: user?.profile?.displayName ?? "Inconnu",
      subject: l.decision?.replace(/^(Email|Push): /, "") ?? "",
      bodyPreview: l.reasoning ?? "",
      targetItemId: targetMatch?.[1] ?? null,
      targetItemTitle: null,
      delivered: l.success,
      sentAt: l.createdAt,
    };
  });

  return {
    totalSent,
    totalDelivered,
    byChannel: [
      { channel: "EMAIL", count: emailCount },
      { channel: "PUSH", count: pushCount },
      { channel: "INTERNAL", count: internalCount },
    ],
    byReason: [...reasonCounts.entries()].map(([reason, count]) => ({
      reason: reason as PromoReason,
      count,
    })),
    recentMessages,
  };
}

// ─────────────────────────────────────────────
// Template email Kin-Sell
// ─────────────────────────────────────────────

function wrapInKinSellTemplate(title: string, body: string): string {
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;padding:0;background:#120b2b;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#6f58ff 0%,#3d2a9c 100%);padding:20px 24px;">
        <h1 style="color:#fff;font-size:20px;margin:0;">Kin-Sell</h1>
        <p style="color:rgba(255,255,255,0.7);font-size:12px;margin:4px 0 0;">Marketplace · Kinshasa</p>
      </div>
      <div style="padding:24px;color:#e0d8ff;">
        <h2 style="color:#fff;font-size:18px;margin:0 0 16px;">${title}</h2>
        ${body}
      </div>
      <div style="border-top:1px solid rgba(111,88,255,0.2);padding:16px 24px;text-align:center;">
        <p style="font-size:11px;color:#666;margin:0;">
          Envoyé par l'IA ADS Kin-Sell · ADS@Kin-sell.com<br/>
          <a href="https://kin-sell.com" style="color:#6f58ff;text-decoration:none;">kin-sell.com</a>
        </p>
      </div>
    </div>
  `;
}
