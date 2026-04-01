import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import {
  createLive,
  startLive,
  endLive,
  getLiveById,
  getActiveLives,
  joinLive,
  leaveLive,
  requestJoinAsGuest,
  sendLiveChatMessage,
  getLiveChatMessages,
  likeLive,
} from "./sokin-live.service.js";

const createLiveSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  aspect: z.enum(["LANDSCAPE", "PORTRAIT"]),
  tags: z.array(z.string()).max(10).optional(),
  city: z.string().max(100).optional(),
});

const chatMessageSchema = z.object({
  text: z.string().min(1).max(300),
  isGift: z.boolean().optional(),
  giftType: z.string().max(50).optional(),
});

const router = Router();

/* ── Routes publiques ── */

// Lister les lives actifs
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const raw = req.query.limit;
    const limit = Math.min(parseInt(typeof raw === "string" ? raw : "20", 10) || 20, 50);
    const lives = await getActiveLives(limit);
    res.json({ lives });
  })
);

// Voir un live spécifique
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const live = await getLiveById(req.params.id);
    if (!live) {
      res.status(404).json({ error: "Live introuvable" });
      return;
    }
    res.json(live);
  })
);

// Récupérer le chat d'un live
router.get(
  "/:id/chat",
  asyncHandler(async (req, res) => {
    const raw = req.query.limit;
    const limit = Math.min(parseInt(typeof raw === "string" ? raw : "100", 10) || 100, 200);
    const messages = await getLiveChatMessages(req.params.id, limit);
    res.json({ messages });
  })
);

/* ── Routes authentifiées ── */

// Créer un live
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = createLiveSchema.parse(req.body);
    const live = await createLive(req.auth!.userId, data);
    res.status(201).json(live);
  })
);

// Démarrer le live (host only)
router.patch(
  "/:id/start",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const live = await startLive(req.params.id, req.auth!.userId);
    res.json(live);
  })
);

// Terminer le live (host only)
router.patch(
  "/:id/end",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const live = await endLive(req.params.id, req.auth!.userId);
    res.json(live);
  })
);

// Rejoindre un live (spectateur)
router.post(
  "/:id/join",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const participant = await joinLive(req.params.id, req.auth!.userId);
    res.json(participant);
  })
);

// Quitter un live
router.post(
  "/:id/leave",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await leaveLive(req.params.id, req.auth!.userId);
    res.json({ success: true });
  })
);

// Demander à participer (monter sur le live)
router.post(
  "/:id/request-guest",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const participant = await requestJoinAsGuest(req.params.id, req.auth!.userId);
    res.json(participant);
  })
);

// Envoyer un message dans le chat
router.post(
  "/:id/chat",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { text, isGift, giftType } = chatMessageSchema.parse(req.body);
    const message = await sendLiveChatMessage(req.params.id, req.auth!.userId, text, isGift, giftType);
    res.status(201).json(message);
  })
);

// Liker un live
router.post(
  "/:id/like",
  requireAuth,
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const live = await likeLive(_req.params.id);
    res.json({ likesCount: live.likesCount });
  })
);

export default router;
