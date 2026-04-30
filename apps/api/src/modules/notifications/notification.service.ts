import type { NotificationCategory, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";
import { sendMail } from "../../shared/email/mailer.js";
import { emitToUser } from "../messaging/socket.js";
import { sendPushToUser } from "./push.service.js";

/**
 * Service unifié de notifications Kin-Sell.
 *
 * Un seul appel `notify()` dispatche une notification sur tous les canaux
 * activés pour l'utilisateur :
 *   - Persistance en BD (table Notification)
 *   - Socket.io (temps réel in-app)
 *   - Web Push + FCM (mobile / desktop notifications natives)
 *   - Email (transactionnel via Nodemailer / Hostinger SMTP)
 *
 * Chaque catégorie respecte les préférences granulaires de l'utilisateur
 * (UserPreference.notify<Category><Channel>).
 */

export type NotificationChannel = "inapp" | "push" | "email";

export interface NotifyInput {
  userId: string;
  category: NotificationCategory;
  type: string; // ex: "order.created", "negotiation.counter"
  title: string;
  body: string;
  data?: Record<string, unknown>;
  url?: string;
  icon?: string;
  /**
   * Email à utiliser pour le canal email (override). Sinon récupéré depuis User.email.
   */
  emailTo?: string;
  /**
   * Sujet d'email (par défaut : `[Kin-Sell] {title}`).
   */
  emailSubject?: string;
  /**
   * HTML d'email (si non fourni, un template par défaut est utilisé).
   */
  emailHtml?: string;
  /**
   * Forcer l'activation/désactivation de canaux indépendamment des préférences.
   * Ex: `force: { email: true }` pour les emails de sécurité critiques.
   */
  force?: Partial<Record<NotificationChannel, boolean>>;
  /**
   * Ne pas envoyer sur ces canaux (override).
   */
  skip?: Partial<Record<NotificationChannel, boolean>>;
}

interface ChannelDecision {
  inapp: boolean;
  push: boolean;
  email: boolean;
}

/**
 * Détermine quels canaux activer pour cette notification en fonction des
 * préférences utilisateur granulaires.
 */
function resolveChannels(
  prefs: {
    pushEnabled: boolean;
    notifyOrderEmail: boolean; notifyOrderPush: boolean; notifyOrderInApp: boolean;
    notifyNegotiationEmail: boolean; notifyNegotiationPush: boolean; notifyNegotiationInApp: boolean;
    notifyPaymentEmail: boolean; notifyPaymentPush: boolean; notifyPaymentInApp: boolean;
    notifyMessageEmail: boolean; notifyMessagePush: boolean; notifyMessageInApp: boolean;
    notifySocialEmail: boolean; notifySocialPush: boolean; notifySocialInApp: boolean;
    notifySystemEmail: boolean; notifySystemPush: boolean; notifySystemInApp: boolean;
  } | null,
  category: NotificationCategory,
): ChannelDecision {
  // Défauts si aucune préférence enregistrée → tout activer sauf email message/social
  if (!prefs) {
    const isQuietEmail = category === "MESSAGE" || category === "SOCIAL" || category === "PROMO";
    return { inapp: true, push: true, email: !isQuietEmail };
  }

  switch (category) {
    case "ORDER":
      return { inapp: prefs.notifyOrderInApp, push: prefs.pushEnabled && prefs.notifyOrderPush, email: prefs.notifyOrderEmail };
    case "NEGOTIATION":
      return { inapp: prefs.notifyNegotiationInApp, push: prefs.pushEnabled && prefs.notifyNegotiationPush, email: prefs.notifyNegotiationEmail };
    case "PAYMENT":
      return { inapp: prefs.notifyPaymentInApp, push: prefs.pushEnabled && prefs.notifyPaymentPush, email: prefs.notifyPaymentEmail };
    case "MESSAGE":
      return { inapp: prefs.notifyMessageInApp, push: prefs.pushEnabled && prefs.notifyMessagePush, email: prefs.notifyMessageEmail };
    case "SOCIAL":
      return { inapp: prefs.notifySocialInApp, push: prefs.pushEnabled && prefs.notifySocialPush, email: prefs.notifySocialEmail };
    case "SYSTEM":
      return { inapp: prefs.notifySystemInApp, push: prefs.pushEnabled && prefs.notifySystemPush, email: prefs.notifySystemEmail };
    case "AI":
    case "PROMO":
    default:
      return { inapp: true, push: prefs.pushEnabled, email: false };
  }
}

/**
 * Template HTML par défaut (glassmorphism Kin-Sell) pour les emails de
 * notifications. Les templates spécifiques (commande, négo, paiement) seront
 * ajoutés à l'étape 2.
 */
function buildDefaultEmailHtml(opts: { title: string; body: string; url?: string; ctaLabel?: string }): string {
  const cta = opts.url
    ? `<a href="${opts.url}" style="display:inline-block;background:#6f58ff;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;font-weight:600;">${opts.ctaLabel ?? "Voir sur Kin-Sell"}</a>`
    : "";
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#120b2b;color:#fff;border-radius:12px;">
      <h2 style="color:#6f58ff;margin:0 0 16px;">Kin-Sell</h2>
      <h3 style="margin:0 0 12px;color:#fff;">${opts.title}</h3>
      <p style="line-height:1.6;color:#cfc8e8;">${opts.body}</p>
      ${cta}
      <hr style="border:none;border-top:1px solid #2a1f4a;margin:20px 0;">
      <p style="font-size:12px;color:#8a82a8;">Vous pouvez gérer vos préférences de notification dans votre compte Kin-Sell.</p>
    </div>
  `;
}

/**
 * Cœur du système : crée la notification en BD puis dispatche sur les canaux.
 * Tous les envois sont best-effort (les erreurs sont loggées mais non rethrows
 * sauf si tout échoue — l'appelant ne doit pas bloquer un flux métier critique
 * sur l'envoi d'une notif).
 */
export async function notify(input: NotifyInput): Promise<{ id: string }> {
  const {
    userId,
    category,
    type,
    title,
    body,
    data,
    url,
    icon,
    emailTo,
    emailSubject,
    emailHtml,
    force,
    skip,
  } = input;

  // 1) Charger l'utilisateur + préférences pour décider des canaux
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      preferences: {
        select: {
          pushEnabled: true,
          notifyOrderEmail: true, notifyOrderPush: true, notifyOrderInApp: true,
          notifyNegotiationEmail: true, notifyNegotiationPush: true, notifyNegotiationInApp: true,
          notifyPaymentEmail: true, notifyPaymentPush: true, notifyPaymentInApp: true,
          notifyMessageEmail: true, notifyMessagePush: true, notifyMessageInApp: true,
          notifySocialEmail: true, notifySocialPush: true, notifySocialInApp: true,
          notifySystemEmail: true, notifySystemPush: true, notifySystemInApp: true,
        },
      },
    },
  });

  if (!user) {
    logger.warn({ userId, type }, "[Notify] Utilisateur introuvable, notification ignorée");
    throw new Error(`Notify: user ${userId} not found`);
  }

  const decision = resolveChannels(user.preferences ?? null, category);
  if (force) {
    if (force.inapp !== undefined) decision.inapp = force.inapp;
    if (force.push !== undefined) decision.push = force.push;
    if (force.email !== undefined) decision.email = force.email;
  }
  if (skip) {
    if (skip.inapp) decision.inapp = false;
    if (skip.push) decision.push = false;
    if (skip.email) decision.email = false;
  }

  // 2) Persistance en BD (toujours, sauf si in-app explicitement skip)
  const created = await prisma.notification.create({
    data: {
      userId,
      category,
      type,
      title,
      body,
      data: (data ?? null) as Prisma.InputJsonValue | undefined,
      url: url ?? null,
      icon: icon ?? null,
    },
    select: { id: true, createdAt: true },
  });

  // 3) Dispatch in-app (Socket.io temps réel)
  if (decision.inapp) {
    try {
      emitToUser(userId, "notification:new", {
        id: created.id,
        category,
        type,
        title,
        body,
        data: data ?? null,
        url: url ?? null,
        icon: icon ?? null,
        createdAt: created.createdAt,
      });
    } catch (err) {
      logger.warn({ err, userId, type }, "[Notify] Socket emit échoué");
    }
  }

  // 4) Dispatch push (Web Push + FCM)
  let pushSent = false;
  if (decision.push) {
    try {
      await sendPushToUser(userId, {
        title,
        body,
        icon,
        tag: type,
        data: { type, category, url: url ?? "", ...(data ?? {}) },
      });
      pushSent = true;
    } catch (err) {
      logger.warn({ err, userId, type }, "[Notify] Push échoué");
    }
  }

  // 5) Dispatch email
  let emailSent = false;
  const targetEmail = emailTo ?? user.email ?? null;
  if (decision.email && targetEmail) {
    try {
      const html = emailHtml ?? buildDefaultEmailHtml({ title, body, url });
      const ok = await sendMail({
        to: targetEmail,
        subject: emailSubject ?? `[Kin-Sell] ${title}`,
        html,
        text: `${title}\n\n${body}${url ? `\n\n${url}` : ""}`,
      });
      emailSent = !!ok;
    } catch (err) {
      logger.warn({ err, userId, type }, "[Notify] Email échoué");
    }
  }

  // 6) Mettre à jour les flags d'envoi (best-effort)
  if (pushSent || emailSent) {
    prisma.notification
      .update({
        where: { id: created.id },
        data: { pushSent, emailSent },
      })
      .catch((err) => logger.warn({ err }, "[Notify] Update flags échoué"));
  }

  return { id: created.id };
}

/* ── Helpers de lecture / gestion ─────────────────────────────────────── */

export async function listNotifications(opts: {
  userId: string;
  cursor?: string;
  limit?: number;
  category?: NotificationCategory;
  unreadOnly?: boolean;
  includeArchived?: boolean;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const where: Prisma.NotificationWhereInput = {
    userId: opts.userId,
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.unreadOnly ? { readAt: null } : {}),
    ...(opts.includeArchived ? {} : { archivedAt: null }),
  };
  const items = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
  });
  const hasMore = items.length > limit;
  return {
    items: items.slice(0, limit),
    nextCursor: hasMore ? items[limit - 1]?.id ?? null : null,
  };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null, archivedAt: null },
  });
}

export async function markAsRead(userId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function archiveNotification(userId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, userId, archivedAt: null },
    data: { archivedAt: new Date(), readAt: new Date() },
  });
}

export async function deleteNotification(userId: string, id: string) {
  return prisma.notification.deleteMany({ where: { id, userId } });
}
