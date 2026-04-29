import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import * as pushService from "./push.service.js";
import * as notifService from "./notification.service.js";
import { isFcmConfigured } from "./fcm.service.js";
import { prisma } from "../../shared/db/prisma.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";

const router = Router();

/* GET /notifications/vapid-public-key */
router.get(
  "/vapid-public-key",
  asyncHandler(async (_req, res) => {
    const key = pushService.getVapidPublicKey();
    res.json({ publicKey: key });
  }),
);

/* GET /notifications/diagnostic — État complet pour l'espace privé */
router.get(
  "/diagnostic",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentification requise" });
      return;
    }

    const [webSubs, fcmTokens] = await Promise.all([
      prisma.pushSubscription.count({ where: { userId } }),
      prisma.fcmToken.count({ where: { userId } }),
    ]);

    res.json({
      server: {
        vapidConfigured: !!pushService.getVapidPublicKey(),
        fcmConfigured: isFcmConfigured(),
      },
      user: {
        webSubscriptions: webSubs,
        fcmTokens,
      },
    });
  }),
);

/* POST /notifications/test — Envoyer une notification de test à l'utilisateur */
router.post(
  "/test",
  requireAuth,
  rateLimit(RateLimits.FCM_REGISTER),
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentification requise" });
      return;
    }

    const [webSubs, fcmTokens] = await Promise.all([
      prisma.pushSubscription.count({ where: { userId } }),
      prisma.fcmToken.count({ where: { userId } }),
    ]);

    if (webSubs === 0 && fcmTokens === 0) {
      res.status(400).json({
        ok: false,
        error: "Aucun appareil n'est enregistré. Activez d'abord les notifications sur ce device.",
      });
      return;
    }

    await pushService.sendPushToUser(userId, {
      title: "Kin-Sell • Test",
      body: "Si vous voyez cette notification, tout fonctionne ✅",
      tag: `test-${Date.now()}`,
      data: { type: "system", url: "/account?section=settings" },
    });

    res.json({
      ok: true,
      sent: { webSubscriptions: webSubs, fcmTokens },
    });
  }),
);

/* POST /notifications/push/subscribe */
router.post(
  "/push/subscribe",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentification requise" });
      return;
    }

    const { subscription, userAgent } = req.body as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
      userAgent?: string;
    };

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ error: "Subscription invalide" });
      return;
    }

    await pushService.subscribePush(userId, subscription, userAgent);
    res.json({ ok: true });
  }),
);

/* POST /notifications/push/unsubscribe */
router.post(
  "/push/unsubscribe",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentification requise" });
      return;
    }

    const { endpoint } = req.body as { endpoint?: string };

    if (endpoint) {
      await pushService.unsubscribePush(userId, endpoint);
    } else {
      await pushService.unsubscribeAllPush(userId);
    }
    res.json({ ok: true });
  }),
);

/* POST /notifications/fcm/register — Register a FCM token (Android native) */
router.post(
  "/fcm/register",
  requireAuth,
  rateLimit(RateLimits.FCM_REGISTER),
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentification requise" });
      return;
    }

    const { token, platform } = req.body as { token?: string; platform?: string };
    if (!token || typeof token !== "string" || token.length < 20 || token.length > 4096) {
      res.status(400).json({ error: "Token FCM invalide" });
      return;
    }

    await pushService.registerFcmToken(userId, token, platform ?? "android");
    res.json({ ok: true });
  }),
);

/* POST /notifications/fcm/unregister — Unregister a FCM token */
router.post(
  "/fcm/unregister",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentification requise" });
      return;
    }

    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ error: "Token requis" });
      return;
    }

    await pushService.unregisterFcmToken(token);
    res.json({ ok: true });
  }),
);

/* POST /notifications/fcm/unregister-all — Unregister all FCM tokens (logout) — A8 audit */
router.post(
  "/fcm/unregister-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentification requise" });
      return;
    }
    const count = await pushService.unregisterAllFcmTokens(userId);
    res.json({ ok: true, count });
  }),
);

/* ════════════════════════════════════════════════════════════════════
 * Centre de notifications persistant (BD)
 * ════════════════════════════════════════════════════════════════════ */

const NOTIF_CATEGORIES = ["ORDER", "NEGOTIATION", "PAYMENT", "MESSAGE", "SOCIAL", "SYSTEM", "AI", "PROMO"] as const;

const listNotifsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  category: z.enum(NOTIF_CATEGORIES).optional(),
  unreadOnly: z.coerce.boolean().optional(),
  includeArchived: z.coerce.boolean().optional(),
});

/* GET /notifications — Liste paginée des notifications de l'utilisateur */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const params = listNotifsSchema.parse(req.query);
    const data = await notifService.listNotifications({
      userId,
      cursor: params.cursor,
      limit: params.limit,
      category: params.category,
      unreadOnly: params.unreadOnly,
      includeArchived: params.includeArchived,
    });
    res.json(data);
  }),
);

/* GET /notifications/unread-count — Nombre de notifications non lues */
router.get(
  "/unread-count",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const count = await notifService.getUnreadCount(userId);
    res.json({ count });
  }),
);

/* PATCH /notifications/:id/read — Marquer comme lu */
router.patch(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    await notifService.markAsRead(userId, req.params.id);
    res.json({ ok: true });
  }),
);

/* POST /notifications/read-all — Tout marquer comme lu */
router.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const result = await notifService.markAllAsRead(userId);
    res.json({ ok: true, count: result.count });
  }),
);

/* POST /notifications/:id/archive — Archiver */
router.post(
  "/:id/archive",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    await notifService.archiveNotification(userId, req.params.id);
    res.json({ ok: true });
  }),
);

/* DELETE /notifications/:id — Supprimer définitivement */
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    await notifService.deleteNotification(userId, req.params.id);
    res.json({ ok: true });
  }),
);

/* ════════════════════════════════════════════════════════════════════
 * Préférences granulaires de notifications
 * ════════════════════════════════════════════════════════════════════ */

const PREF_FIELDS = [
  "pushEnabled",
  "marketingEmails",
  "notifyOrderEmail", "notifyOrderPush", "notifyOrderInApp",
  "notifyNegotiationEmail", "notifyNegotiationPush", "notifyNegotiationInApp",
  "notifyPaymentEmail", "notifyPaymentPush", "notifyPaymentInApp",
  "notifyMessageEmail", "notifyMessagePush", "notifyMessageInApp",
  "notifySocialEmail", "notifySocialPush", "notifySocialInApp",
  "notifySystemEmail", "notifySystemPush", "notifySystemInApp",
] as const;

const prefsUpdateSchema = z.object(
  Object.fromEntries(PREF_FIELDS.map((f) => [f, z.boolean().optional()])) as Record<typeof PREF_FIELDS[number], z.ZodOptional<z.ZodBoolean>>,
);

const PREFS_SELECT = Object.fromEntries(PREF_FIELDS.map((f) => [f, true])) as Record<typeof PREF_FIELDS[number], true>;

/* GET /notifications/preferences — Lire les préférences */
router.get(
  "/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    let prefs = await prisma.userPreference.findUnique({
      where: { userId },
      select: PREFS_SELECT,
    });
    if (!prefs) {
      // Créer des préférences par défaut si l'utilisateur n'en a pas
      const created = await prisma.userPreference.create({
        data: { userId },
        select: PREFS_SELECT,
      });
      prefs = created;
    }
    res.json(prefs);
  }),
);

/* PUT /notifications/preferences — Mettre à jour les préférences */
router.put(
  "/preferences",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthenticatedRequest).auth!.userId;
    const data = prefsUpdateSchema.parse(req.body ?? {});
    const updated = await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
      select: PREFS_SELECT,
    });
    res.json(updated);
  }),
);

export default router;
