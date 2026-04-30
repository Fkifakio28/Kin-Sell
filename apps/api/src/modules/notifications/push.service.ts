import webpush from "web-push";
import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import { isFcmConfigured, sendFcmToToken } from "./fcm.service.js";

/* ── VAPID setup ── */
let vapidConfigured = false;

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  logger.info("[Push] VAPID configuré");
} else {
  logger.warn("[Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquantes — push notifications désactivées");
}

/* ── Subscribe ── */
export async function subscribePush(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string,
) {
  return prisma.pushSubscription.upsert({
    where: { userId_endpoint: { userId, endpoint: subscription.endpoint } },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent ?? null,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent ?? null,
      updatedAt: new Date(),
    },
  });
}

/* ── Unsubscribe ── */
export async function unsubscribePush(userId: string, endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/* ── Unsubscribe all for a user ── */
export async function unsubscribeAllPush(userId: string) {
  return prisma.pushSubscription.deleteMany({ where: { userId } });
}

/* ── FCM Token registration (Android & iOS native) ── */
export async function registerFcmToken(userId: string, token: string, platform = "android") {
  // A1 audit : cap à 10 tokens actifs par utilisateur. Si l'upsert va créer
  // un nouveau token, supprime d'abord les plus vieux au-delà de 9.
  const existing = await prisma.fcmToken.findUnique({ where: { token } });
  if (!existing) {
    const userTokens = await prisma.fcmToken.findMany({
      where: { userId },
      orderBy: { updatedAt: "asc" },
      select: { id: true },
    });
    if (userTokens.length >= 10) {
      const toDelete = userTokens.slice(0, userTokens.length - 9).map((t) => t.id);
      await prisma.fcmToken.deleteMany({ where: { id: { in: toDelete } } });
    }
  }
  return prisma.fcmToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform, updatedAt: new Date() },
  });
}

export async function unregisterFcmToken(token: string) {
  return prisma.fcmToken.deleteMany({ where: { token } });
}

/* A8 audit : unregister ALL tokens pour un utilisateur (logout sûr) */
export async function unregisterAllFcmTokens(userId: string): Promise<number> {
  const result = await prisma.fcmToken.deleteMany({ where: { userId } });
  return result.count;
}

/* ── Purge FCM tokens inactifs (> 7 jours sans mise à jour) ──
 * Évite d'envoyer des notifications à des tokens morts qui coûtent des
 * quotas FCM et retourne des erreurs (battery/quota).
 */
export async function purgeStaleFcmTokens(maxAgeDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  const result = await prisma.fcmToken.deleteMany({
    where: { updatedAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    logger.info({ purged: result.count, maxAgeDays }, "[FCM] Tokens inactifs purgés");
  }
  return result.count;
}

let fcmPurgeInterval: ReturnType<typeof setInterval> | null = null;
export function startFcmTokenPurgeScheduler(intervalHours = 6): void {
  if (fcmPurgeInterval) return;
  const run = () => { void purgeStaleFcmTokens().catch((err) => logger.warn({ err }, "[FCM] Purge échouée")); };
  // premier run après 5 min (ne pas bloquer le boot)
  setTimeout(run, 5 * 60 * 1000);
  fcmPurgeInterval = setInterval(run, intervalHours * 60 * 60 * 1000);
}

/* ── Send push to a specific user (with retry on transient errors) ── */
async function trySendNotification(
  sub: { endpoint: string; p256dh: string; auth: string; id: string },
  payloadStr: string,
  attempt = 1,
): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payloadStr,
    );
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    // 404 or 410 = subscription expired / unsubscribed → cleanup
    if (statusCode === 404 || statusCode === 410) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      return;
    }
    // 429 / 5xx = transient → retry up to 2 times with exponential backoff
    if (attempt < 3 && (statusCode === 429 || (statusCode && statusCode >= 500))) {
      const delay = attempt * 500; // 500ms, 1000ms
      await new Promise((r) => setTimeout(r, delay));
      return trySendNotification(sub, payloadStr, attempt + 1);
    }
    throw err;
  }
}

export async function sendPushToUser(
  userId: string,
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
    actions?: Array<{ action: string; title: string; icon?: string }>;
  },
) {
  // ── Web Push (VAPID) ──
  if (vapidConfigured) {
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length > 0) {
      const payloadStr = JSON.stringify(payload);
      const results = await Promise.allSettled(
        subscriptions.map((sub) => trySendNotification(sub, payloadStr)),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        logger.warn({ userId, failed, total: subscriptions.length }, "[Push] Web Push échouées");
      }
    }
  }

  // ── FCM (Android native) ──
  if (isFcmConfigured()) {
    const fcmTokens = await prisma.fcmToken.findMany({ where: { userId } });
    if (fcmTokens.length > 0) {
      const dataStrings: Record<string, string> = {};
      if (payload.data) {
        for (const [k, v] of Object.entries(payload.data)) {
          dataStrings[k] = String(v);
        }
      }
      if (payload.tag) dataStrings.tag = payload.tag;

      // A16 audit : FCM limite stricte à 4KB pour le payload total.
      // On tronque le body si nécessaire pour éviter un rejet total.
      const estimatedSize = JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: dataStrings,
      }).length;
      let safeBody = payload.body;
      if (estimatedSize > 3800) {
        const excess = estimatedSize - 3800;
        safeBody = payload.body.slice(0, Math.max(20, payload.body.length - excess - 3)) + "…";
        logger.warn({ userId, estimatedSize }, "[FCM] Payload trop gros, body tronqué");
      }

      const results = await Promise.allSettled(
        fcmTokens.map(async (t) => {
          const ok = await sendFcmToToken(t.token, {
            title: payload.title,
            body: safeBody,
            data: dataStrings,
          });
          // Token invalide → nettoyage immédiat (A11 audit)
          if (!ok) {
            await prisma.fcmToken.delete({ where: { id: t.id } }).catch(() => {});
          }
        }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        logger.warn({ userId, failed, total: fcmTokens.length }, "[Push] FCM échouées");
      }
    }
  }
}

/* ── Send push to multiple users (batched to avoid throttling) ── */
export async function sendPushToUsers(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
    actions?: Array<{ action: string; title: string; icon?: string }>;
  },
) {
  const BATCH_SIZE = 50;
  const BATCH_DELAY_MS = 50;
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(batch.map((uid) => sendPushToUser(uid, payload)));
    if (i + BATCH_SIZE < userIds.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
}

/* ── VAPID public key (for frontend) ── */
export function getVapidPublicKey(): string | null {
  return env.VAPID_PUBLIC_KEY ?? null;
}
