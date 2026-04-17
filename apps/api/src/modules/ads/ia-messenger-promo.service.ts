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

  // Tenter d'attacher un coupon (gate 1/10)
  const coupon = await maybeAttachCoupon(recipientId, reason);
  const bodyWithCoupon = coupon ? htmlBody + coupon.html : htmlBody;

  const delivered = await sendMail({
    to: user.email,
    subject: `[Kin-Sell] ${subject}`,
    html: wrapInKinSellTemplate(subject, bodyWithCoupon),
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
    // Tenter d'attacher un coupon code dans le push
    const coupon = await maybeAttachCoupon(buyer.id, "BOOST_PROMO");
    const couponSuffix = coupon ? ` 🎁 Code: ${coupon.code}` : "";

    const sent1 = await sendPromoPush(
      buyer.id,
      `Nouveau dans ${listing.category}`,
      `"${listing.title}" est maintenant disponible${listing.city ? ` à ${listing.city}` : ""} ! Découvrez cette offre sponsorisée.${couponSuffix}`,
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

/**
 * Génère un coupon personnalisé pour un destinataire de promo.
 * Gate 1/10 : seuls ~10 % des destinataires reçoivent un coupon.
 * Retourne le code coupon + HTML à insérer, ou null.
 */
async function maybeAttachCoupon(
  recipientId: string,
  reason: PromoReason,
): Promise<{ code: string; html: string } | null> {
  // Gate 1/10
  if (Math.random() > 0.10) return null;

  try {
    const { selectIncentiveForUser } = await import("../incentives/incentive.service.js");

    // selectIncentiveForUser applique déjà la policy gate + quota + crée le coupon
    const selection = await selectIncentiveForUser(recipientId);
    if (!selection) return null;

    const html = `
      <div style="background:rgba(111,88,255,0.15);border:1px solid rgba(111,88,255,0.3);border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
        <p style="color:#6f58ff;font-size:14px;margin:0 0 8px;">🎁 Code promo exclusif</p>
        <p style="color:#fff;font-size:22px;font-weight:bold;margin:0;letter-spacing:2px;">${selection.couponCode}</p>
        <p style="color:rgba(255,255,255,0.6);font-size:12px;margin:8px 0 0;">
          -${selection.discountPercent}% · Expire le ${selection.expiresAt.toLocaleDateString("fr-FR")}
        </p>
      </div>`;

    logger.info({ recipientId, code: selection.couponCode, discountPercent: selection.discountPercent, reason }, "[IA Messenger] Coupon attaché à promo");
    return { code: selection.couponCode, html };
  } catch (err) {
    logger.warn({ err, recipientId, reason }, "[IA Messenger] Erreur génération coupon promo");
    return null;
  }
}

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

// ─────────────────────────────────────────────
// Dedicated incentive notification templates
// ─────────────────────────────────────────────

/**
 * Envoie une notification coupon incentive distribué.
 * Idempotent : vérifie qu'aucun log identique n'existe.
 */
export async function sendCouponIncentiveMessage(
  recipientId: string,
  couponCode: string,
  discountPercent: number,
  expiresAt: Date,
  trigger: string,
): Promise<boolean> {
  // Idempotency : pas de double message pour le même coupon
  const existing = await prisma.aiAutonomyLog.findFirst({
    where: {
      agentName: "IA_MESSENGER",
      actionType: "INCENTIVE_COUPON",
      targetUserId: recipientId,
      decision: { contains: couponCode },
    },
  });
  if (existing) return false;

  const htmlBody = `
    <p>Bonne nouvelle ! Vous avez reçu un code promo exclusif Kin-Sell.</p>
    <div style="background:rgba(111,88,255,0.15);border:1px solid rgba(111,88,255,0.3);border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
      <p style="color:#6f58ff;font-size:14px;margin:0 0 8px;">🎁 Votre code promo</p>
      <p style="color:#fff;font-size:24px;font-weight:bold;margin:0;letter-spacing:2px;">${couponCode}</p>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:8px 0 0;">
        -${discountPercent}% · Expire le ${expiresAt.toLocaleDateString("fr-FR")}
      </p>
    </div>
    <p>Utilisez-le sur la page <a href="https://kin-sell.com/forfaits" style="color:#6f58ff;">Forfaits</a> au moment du paiement.</p>`;

  const emailSent = await sendPromoEmail(
    recipientId,
    `🎁 Code promo -${discountPercent}% pour vous !`,
    htmlBody,
    "BOOST_PROMO" as PromoReason,
  );

  // Fallback push si email échoue
  if (!emailSent) {
    await sendPromoPush(
      recipientId,
      `Code promo -${discountPercent}%`,
      `Utilisez ${couponCode} pour obtenir -${discountPercent}% sur Kin-Sell ! Expire le ${expiresAt.toLocaleDateString("fr-FR")}`,
      "BOOST_PROMO" as PromoReason,
    );
  }

  await prisma.aiAutonomyLog.create({
    data: {
      agentName: "IA_MESSENGER",
      actionType: "INCENTIVE_COUPON",
      targetUserId: recipientId,
      decision: `Coupon: ${couponCode} | -${discountPercent}%`,
      reasoning: `Trigger: ${trigger} | Expire: ${expiresAt.toISOString()}`,
      success: true,
    },
  });

  logger.info({ recipientId, couponCode, discountPercent, trigger }, "[IA Messenger] Coupon incentive message envoyé");
  return true;
}

/**
 * Envoie une notification grant CPC/CPI/CPA émis.
 * Idempotent par grantId.
 */
export async function sendGrowthGrantMessage(
  recipientId: string,
  grantId: string,
  grantKind: string,
  discountPercent: number | null,
  trigger: string,
): Promise<boolean> {
  const existing = await prisma.aiAutonomyLog.findFirst({
    where: {
      agentName: "IA_MESSENGER",
      actionType: "INCENTIVE_GRANT",
      targetUserId: recipientId,
      decision: { contains: grantId },
    },
  });
  if (existing) return false;

  const kindLabel = grantKind === "CPC" ? "Clic" : grantKind === "CPI" ? "Installation" : "Action";
  const discountLabel = discountPercent ? `-${discountPercent}%` : "Avantage";

  const htmlBody = `
    <p>Félicitations ! Votre activité sur Kin-Sell vous a permis d'obtenir un avantage.</p>
    <div style="background:rgba(111,88,255,0.15);border:1px solid rgba(111,88,255,0.3);border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
      <p style="color:#6f58ff;font-size:14px;margin:0 0 8px;">🚀 Avantage ${kindLabel}</p>
      <p style="color:#fff;font-size:20px;font-weight:bold;margin:0;">${discountLabel}</p>
      <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:8px 0 0;">
        Complétez les étapes pour convertir cet avantage en code promo.
      </p>
    </div>
    <p>Continuez à utiliser Kin-Sell pour débloquer plus d'avantages !</p>`;

  const emailSent = await sendPromoEmail(
    recipientId,
    `🚀 Avantage ${kindLabel} débloqué !`,
    htmlBody,
    "BOOST_PROMO" as PromoReason,
  );

  if (!emailSent) {
    await sendPromoPush(
      recipientId,
      `Avantage ${kindLabel} débloqué`,
      `Vous avez débloqué un avantage ${discountLabel} sur Kin-Sell ! Complétez les étapes pour le convertir.`,
      "BOOST_PROMO" as PromoReason,
    );
  }

  await prisma.aiAutonomyLog.create({
    data: {
      agentName: "IA_MESSENGER",
      actionType: "INCENTIVE_GRANT",
      targetUserId: recipientId,
      decision: `Grant: ${grantId} | ${grantKind} | ${discountLabel}`,
      reasoning: `Trigger: ${trigger}`,
      success: true,
    },
  });

  logger.info({ recipientId, grantId, grantKind, discountPercent, trigger }, "[IA Messenger] Growth grant message envoyé");
  return true;
}

/**
 * Envoie une notification quand un grant est converti en coupon.
 * Idempotent par grantId.
 */
export async function sendGrantConvertedToCouponMessage(
  recipientId: string,
  grantId: string,
  couponCode: string,
  discountPercent: number,
  expiresAt: Date,
): Promise<boolean> {
  const existing = await prisma.aiAutonomyLog.findFirst({
    where: {
      agentName: "IA_MESSENGER",
      actionType: "GRANT_CONVERTED",
      targetUserId: recipientId,
      decision: { contains: grantId },
    },
  });
  if (existing) return false;

  const htmlBody = `
    <p>Votre avantage a été converti en code promo !</p>
    <div style="background:rgba(111,88,255,0.15);border:1px solid rgba(111,88,255,0.3);border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
      <p style="color:#6f58ff;font-size:14px;margin:0 0 8px;">🎉 Code promo généré</p>
      <p style="color:#fff;font-size:24px;font-weight:bold;margin:0;letter-spacing:2px;">${couponCode}</p>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:8px 0 0;">
        -${discountPercent}% · Expire le ${expiresAt.toLocaleDateString("fr-FR")}
      </p>
    </div>
    <p>Rendez-vous sur <a href="https://kin-sell.com/forfaits" style="color:#6f58ff;">Forfaits</a> pour l'utiliser.</p>`;

  const emailSent = await sendPromoEmail(
    recipientId,
    `🎉 Votre avantage converti en code -${discountPercent}% !`,
    htmlBody,
    "BOOST_PROMO" as PromoReason,
  );

  if (!emailSent) {
    await sendPromoPush(
      recipientId,
      `Code promo -${discountPercent}% généré`,
      `Votre avantage est devenu le code ${couponCode} (-${discountPercent}%) ! Expire le ${expiresAt.toLocaleDateString("fr-FR")}`,
      "BOOST_PROMO" as PromoReason,
    );
  }

  await prisma.aiAutonomyLog.create({
    data: {
      agentName: "IA_MESSENGER",
      actionType: "GRANT_CONVERTED",
      targetUserId: recipientId,
      decision: `Grant→Coupon: ${grantId} → ${couponCode} | -${discountPercent}%`,
      reasoning: `Expire: ${expiresAt.toISOString()}`,
      success: true,
    },
  });

  logger.info({ recipientId, grantId, couponCode, discountPercent }, "[IA Messenger] Grant→Coupon message envoyé");
  return true;
}
