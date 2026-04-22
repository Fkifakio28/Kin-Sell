import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import * as pushService from "./push.service.js";
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

export default router;
