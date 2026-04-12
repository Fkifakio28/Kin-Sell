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

/* ── FCM Token registration (Android native) ── */
export async function registerFcmToken(userId: string, token: string, platform = "android") {
  return prisma.fcmToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform, updatedAt: new Date() },
  });
}

export async function unregisterFcmToken(token: string) {
  return prisma.fcmToken.deleteMany({ where: { token } });
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

      const results = await Promise.allSettled(
        fcmTokens.map(async (t) => {
          const ok = await sendFcmToToken(t.token, {
            title: payload.title,
            body: payload.body,
            data: dataStrings,
          });
          // Token invalide → nettoyage
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
