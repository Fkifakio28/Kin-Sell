import admin from "firebase-admin";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";

let fcmConfigured = false;

if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        // The private key is stored as a single line with \n literals in .env
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    fcmConfigured = true;
    logger.info("[FCM] Firebase Admin configuré");
  } catch (err) {
    logger.warn({ err }, "[FCM] Impossible d'initialiser Firebase Admin");
  }
} else {
  logger.warn("[FCM] FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY manquantes — FCM désactivé");
}

export function isFcmConfigured(): boolean {
  return fcmConfigured;
}

export async function sendFcmToToken(
  token: string,
  payload: {
    title: string;
    body: string;
    data?: Record<string, string>;
  },
): Promise<boolean> {
  if (!fcmConfigured) return false;

  try {
    await admin.messaging().send({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "kin-sell-default",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: payload.title, body: payload.body },
            sound: "default",
            badge: 1,
            "mutable-content": 1,
          },
        },
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert",
        },
      },
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    // Token expired or unregistered — caller should clean up
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      return false;
    }
    logger.warn({ err, token: token.slice(0, 20) + "..." }, "[FCM] Envoi échoué");
    return false;
  }
}
