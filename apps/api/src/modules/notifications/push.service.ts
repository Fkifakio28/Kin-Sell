import webpush from "web-push";
import { prisma } from "../../shared/db/prisma.js";
import { env } from "../../config/env.js";

/* ── VAPID setup ── */
let vapidConfigured = false;

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  console.log("[Push] VAPID configuré");
} else {
  console.warn("[Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquantes — push notifications désactivées");
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

/* ── Send push to a specific user ── */
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
  if (!vapidConfigured) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const payloadStr = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr,
        );
      } catch (err: unknown) {
        // 404 or 410 = subscription expired / unsubscribed
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
        throw err;
      }
    }),
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[Push] ${failed}/${subscriptions.length} notifications échouées pour userId=${userId}`);
  }
}

/* ── Send push to multiple users ── */
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
  await Promise.allSettled(userIds.map((uid) => sendPushToUser(uid, payload)));
}

/* ── VAPID public key (for frontend) ── */
export function getVapidPublicKey(): string | null {
  return env.VAPID_PUBLIC_KEY ?? null;
}
