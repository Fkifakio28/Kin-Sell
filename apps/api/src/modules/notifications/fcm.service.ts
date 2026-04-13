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

  const notifType = payload.data?.type ?? "default";
  const channelId = resolveChannelId(notifType);
  const isCall = notifType === "call";

  try {
    // ── APPELS : data-only message ──
    // Un message FCM avec un champ `notification` est intercepté par Firebase
    // quand l'app est en background/tuée : Android affiche sa propre notification
    // basique et onMessageReceived() n'est JAMAIS appelé.
    // → Résultat : pas de fullScreenIntent, pas de wakeScreen, pas de vibration.
    // En envoyant data-only, onMessageReceived() est TOUJOURS appelé,
    // même quand l'app est tuée, permettant le full-screen intent.
    if (isCall) {
      await admin.messaging().send({
        token,
        data: {
          title: payload.title,
          body: payload.body,
          channelId,
          ...(payload.data ?? {}),
        },
        android: {
          priority: "high",
          ttl: 30000,
        },
        apns: {
          payload: {
            aps: {
              alert: { title: payload.title, body: payload.body },
              sound: "ringtone.caf",
              badge: 1,
              "mutable-content": 1,
              "content-available": 1,
            },
          },
          headers: {
            "apns-priority": "10",
            "apns-push-type": "alert",
          },
        },
      });
      return true;
    }

    // ── Autres notifications : notification + data (affichage système) ──
    await admin.messaging().send({
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        title: payload.title,
        body: payload.body,
        channelId,
        ...(payload.data ?? {}),
      },
      android: {
        priority: "high",
        ttl: 86400000,
        notification: {
          channelId,
          icon: "ic_notification",
          color: "#6F58FF",
          tag: payload.data?.tag ?? undefined,
          visibility: "public" as const,
          sound: "default",
          priority: "high" as const,
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: payload.title, body: payload.body },
            sound: "default",
            badge: 1,
            "mutable-content": 1,
            "content-available": 1,
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

function resolveChannelId(type: string): string {
  switch (type) {
    case "message": return "kin-sell-messages";
    case "call": return "kin-sell-calls";
    case "order":
    case "negotiation":
    case "stock": return "kin-sell-orders";
    case "like":
    case "publication":
    case "sokin": return "kin-sell-social";
    default: return "kin-sell-default";
  }
}
