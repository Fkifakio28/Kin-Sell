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
import { isFrequencyCapped } from "./messenger-scheduler.service.js";
import { getMarketContextForUser, formatSnapshotForPrompt } from "../market-intel/context.js";

/**
 * Retourne un "teaser" marché court injecté dans les messages promo.
 * Priorité au pays du destinataire (profil) + catégorie fournie.
 * Renvoie { text, html } ou null si aucune donnée Analytique+ exploitable.
 * Non bloquant : catch silencieux.
 */
async function getMarketTeaserForUser(
  userId: string,
  opts?: { categoryId?: string; includeArbitrage?: boolean },
): Promise<{ text: string; html: string } | null> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { country: true } } },
    });
    const country = row?.profile?.country ?? null;
    if (!country) return null;
    const snap = await getMarketContextForUser({
      country,
      categoryId: opts?.categoryId,
      includeArbitrage: opts?.includeArbitrage ?? false,
    });
    if (!snap.productInsight && snap.topTrends.length === 0) return null;
    const text = formatSnapshotForPrompt(snap);
    const html = `
      <div style="background:rgba(111,88,255,0.08);border:1px solid rgba(111,88,255,0.2);border-radius:8px;padding:12px 14px;margin:12px 0;">
        <p style="margin:0 0 6px;color:#6f58ff;font-size:12px;font-weight:600;">🌍 Tendance marché ${country}</p>
        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;line-height:1.55;">${text}</p>
        <p style="margin:8px 0 0;font-size:11px;"><a href="https://kin-sell.com/market-intel" style="color:#6f58ff;">Voir Kin-Sell Analytique+</a></p>
      </div>`;
    return { text, html };
  } catch {
    return null;
  }
}

/** Check idempotency via aiAutonomyLog — returns true if already sent */
async function hasAlreadySent(actionType: string, targetUserId: string, identifier: string): Promise<boolean> {
  const existing = await prisma.aiAutonomyLog.findFirst({
    where: {
      agentName: "IA_MESSENGER",
      actionType,
      targetUserId,
      decision: { contains: identifier },
    },
  });
  return !!existing;
}

/** Log incentive messaging action */
async function logIncentiveAction(actionType: string, targetUserId: string, decision: string, reasoning: string): Promise<void> {
  await prisma.aiAutonomyLog.create({
    data: {
      agentName: "IA_MESSENGER",
      actionType,
      targetUserId,
      decision,
      reasoning,
      success: true,
    },
  });
}

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
  promoCode: string | null;
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
 *
 * Note (Chantier D2) : ne rattache plus de coupon "à la volée".
 * L'attribution de coupons passe désormais uniquement par le moteur
 * d'incitations (selectIncentiveForUser) avec sa propre gate probabiliste,
 * évitant ainsi le double-gate et les doubles coupons dans les emails
 * déjà porteurs d'un code (sendCouponIncentiveMessage, sendGrantConvertedToCouponMessage).
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
  extraData?: Record<string, unknown>,
): Promise<boolean> {
  try {
    await sendPushToUser(recipientId, {
      title: `🎯 ${title}`,
      body,
      tag: `promo-${reason.toLowerCase()}`,
      data: { type: "PROMO", reason, targetItemId, ...(extraData ?? {}) },
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
 * Envoie un message promotionnel interne (via messagerie système)
 */
export async function sendPromoInternal(
  recipientId: string,
  subject: string,
  body: string,
  reason: PromoReason,
  targetItemId?: string,
): Promise<boolean> {
  try {
    // Chercher ou créer une conversation "système" avec l'utilisateur
    const SYSTEM_USER_ID = "kin-sell-system";
    
    let systemConv = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        participants: {
          every: {
            userId: { in: [recipientId, SYSTEM_USER_ID] },
          },
        },
      },
    });

    if (!systemConv) {
      systemConv = await prisma.conversation.create({
        data: {
          isGroup: false,
          participants: {
            create: [
              { userId: recipientId },
              { userId: SYSTEM_USER_ID },
            ],
          },
        },
      });
    }

    // Créer le message interne (pas de coupon auto-attaché — Chantier D2)
    const message = await prisma.message.create({
      data: {
        conversationId: systemConv.id,
        senderId: SYSTEM_USER_ID,
        type: "TEXT",
        content: `📢 **${subject}**\n\n${body}`,
      },
    });

    // Log the promo
    await prisma.aiAutonomyLog.create({
      data: {
        agentName: "IA_MESSENGER",
        actionType: "PROMO_INTERNAL",
        targetUserId: recipientId,
        decision: `Internal: ${subject}`,
        reasoning: `Raison: ${reason}${targetItemId ? ` | Cible: ${targetItemId}` : ""}`,
        success: true,
      },
    });

    logger.info({ recipientId, subject, reason, messageId: message.id }, "[IA Messenger] Message interne envoyé");
    return true;
  } catch (err) {
    logger.error({ err, recipientId }, "[IA Messenger] Erreur message interne");
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
    // Contexte marché Analytique+ (pays du destinataire)
    const teaser = await getMarketTeaserForUser(buyer.id, {
      categoryId: listing.category,
      includeArbitrage: false,
    });
    const bodyTail = teaser ? ` — ${teaser.text}` : "";
    // Pas de coupon auto-attaché (Chantier D2 — gate unique via selectIncentiveForUser)
    const sent1 = await sendPromoPush(
      buyer.id,
      `Nouveau dans ${listing.category}`,
      `"${listing.title}" est maintenant disponible${listing.city ? ` à ${listing.city}` : ""} !${bodyTail}`,
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
    const codeMatch = l.reasoning?.match(/Code: ([\w-]+)/);
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
      promoCode: codeMatch?.[1] ?? null,
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

// Note (Chantier D2) : la fonction maybeAttachCoupon a été supprimée.
// Les coupons sont attribués via selectIncentiveForUser (gate unique)
// et notifiés via sendCouponIncentiveMessage. sendPromoEmail est neutre.

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
  if (await hasAlreadySent("INCENTIVE_COUPON", recipientId, couponCode)) return false;
  // Frequency capping
  if (await isFrequencyCapped(recipientId)) return false;

  const htmlBody = `
    <p>Bonne nouvelle ! Vous avez reçu un code promo exclusif Kin-Sell.</p>
    <div style="background:rgba(111,88,255,0.15);border:1px solid rgba(111,88,255,0.3);border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
      <p style="color:#6f58ff;font-size:14px;margin:0 0 8px;">🎁 Votre code promo</p>
      <p style="color:#fff;font-size:24px;font-weight:bold;margin:0;letter-spacing:2px;">${couponCode}</p>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:8px 0 0;">
        -${discountPercent}% · Expire le ${expiresAt.toLocaleDateString("fr-FR")}
      </p>
    </div>
    <p>Utilisez-le sur la page <a href="https://kin-sell.com/forfaits?coupon=${encodeURIComponent(couponCode)}" style="color:#6f58ff;">Forfaits</a> au moment du paiement (le code sera pré-rempli automatiquement).</p>`;

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
      undefined,
      { promoType: "COUPON", couponCode, discountPercent },
    );
  }

  await logIncentiveAction(
    "INCENTIVE_COUPON", recipientId,
    `Coupon: ${couponCode} | -${discountPercent}%`,
    `Trigger: ${trigger} | Expire: ${expiresAt.toISOString()}`,
  );

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
  if (await hasAlreadySent("INCENTIVE_GRANT", recipientId, grantId)) return false;
  if (await isFrequencyCapped(recipientId)) return false;

  const kindLabel = grantKind === "CPC" ? "Clic" : grantKind === "CPI" ? "Installation" : "Action";
  const discountLabel = discountPercent ? `-${discountPercent}%` : "Avantage";

  // Teaser marché Analytique+ — donne du sens à l'avantage
  const teaser = await getMarketTeaserForUser(recipientId);

  const htmlBody = `
    <p>Félicitations ! Votre activité sur Kin-Sell vous a permis d'obtenir un avantage.</p>
    <div style="background:rgba(111,88,255,0.15);border:1px solid rgba(111,88,255,0.3);border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
      <p style="color:#6f58ff;font-size:14px;margin:0 0 8px;">🚀 Avantage ${kindLabel}</p>
      <p style="color:#fff;font-size:20px;font-weight:bold;margin:0;">${discountLabel}</p>
      <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:8px 0 0;">
        Conversion en code promo: ouvrez Kin-Sell → Mon compte → Mes avantages IA → cliquez "Convertir".
      </p>
    </div>
    ${teaser?.html ?? ""}
    <div style="background:rgba(255,255,255,0.04);border:1px dashed rgba(255,255,255,0.2);border-radius:8px;padding:12px 14px;margin:12px 0;">
      <p style="margin:0 0 8px;color:#fff;font-size:13px;"><strong>Étapes claires :</strong></p>
      <p style="margin:0;color:rgba(255,255,255,0.8);font-size:12px;line-height:1.6;">
        1) Ouvrez l'app Kin-Sell<br/>
        2) Allez dans Mon compte → Mes avantages IA<br/>
        3) Sélectionnez cet avantage puis cliquez "Convertir"<br/>
        4) Copiez votre code promo généré<br/>
        5) Utilisez-le sur la page Forfaits au paiement
      </p>
    </div>
    <p>Récapitulatif rapide : <a href="https://kin-sell.com/account?section=incentives" style="color:#6f58ff;">ouvrir Mes avantages IA</a></p>`;

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
      `Avantage ${discountLabel} débloqué. Ouvrez Mon compte > Mes avantages IA > Convertir pour générer votre code promo, puis utilisez-le sur Forfaits.`,
      "BOOST_PROMO" as PromoReason,
      undefined,
      { promoType: "GRANT", grantId, grantKind, discountPercent },
    );
  }

  await logIncentiveAction(
    "INCENTIVE_GRANT", recipientId,
    `Grant: ${grantId} | ${grantKind} | ${discountLabel}`,
    `Trigger: ${trigger}`,
  );

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
  if (await hasAlreadySent("GRANT_CONVERTED", recipientId, grantId)) return false;
  if (await isFrequencyCapped(recipientId)) return false;

  const teaser = await getMarketTeaserForUser(recipientId);

  const htmlBody = `
    <p>Votre avantage a été converti en code promo !</p>
    <div style="background:rgba(111,88,255,0.15);border:1px solid rgba(111,88,255,0.3);border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
      <p style="color:#6f58ff;font-size:14px;margin:0 0 8px;">🎉 Code promo généré</p>
      <p style="color:#fff;font-size:24px;font-weight:bold;margin:0;letter-spacing:2px;">${couponCode}</p>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:8px 0 0;">
        -${discountPercent}% · Expire le ${expiresAt.toLocaleDateString("fr-FR")}
      </p>
    </div>
    ${teaser?.html ?? ""}
    <p>Rendez-vous sur <a href="https://kin-sell.com/forfaits?coupon=${encodeURIComponent(couponCode)}" style="color:#6f58ff;">Forfaits</a> pour l'utiliser (le code sera pré-rempli).</p>`;

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
      undefined,
      { promoType: "COUPON", couponCode, discountPercent, grantId },
    );
  }

  await logIncentiveAction(
    "GRANT_CONVERTED", recipientId,
    `Grant→Coupon: ${grantId} → ${couponCode} | -${discountPercent}%`,
    `Expire: ${expiresAt.toISOString()}`,
  );

  logger.info({ recipientId, grantId, couponCode, discountPercent }, "[IA Messenger] Grant→Coupon message envoyé");
  return true;
}
