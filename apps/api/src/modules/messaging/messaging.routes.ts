import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { requireNoRestriction } from "../../shared/middleware/trust-guard.middleware.js";
import { spamGuard } from "../../shared/middleware/spam-guard.middleware.js";
import * as messagingService from "./messaging.service.js";
import * as callLogService from "./call-log.service.js";
import { resolveCallStateForUser } from "./call-state.js";

const router = Router();

/* ── GET /messaging/conversations ── */
router.get(
  "/conversations",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    const conversations = await messagingService.getUserConversations(userId);
    res.json({ conversations });
  })
);

/* ── POST /messaging/conversations/dm ── */
const dmSchema = z.object({ targetUserId: z.string().min(1) });

router.post(
  "/conversations/dm",
  requireAuth,
  rateLimit(RateLimits.LOGIN),
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    const { targetUserId } = dmSchema.parse(req.body);
    const conversation = await messagingService.getOrCreateDMConversation(userId, targetUserId);
    res.json({ conversation });
  })
);

/* ── POST /messaging/conversations/group ── */
const groupSchema = z.object({
  memberIds: z.array(z.string().min(1)).min(1),
  groupName: z.string().min(1).max(100),
});

router.post(
  "/conversations/group",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    const { memberIds, groupName } = groupSchema.parse(req.body);
    const conversation = await messagingService.createGroupConversation(userId, memberIds, groupName);
    res.json({ conversation });
  })
);

/* ── GET /messaging/conversations/:id/messages ── */
router.get(
  "/conversations/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    const conversationId = req.params.id;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = typeof req.query.limit === "string" ? Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50)) : 50;
    const messages = await messagingService.getMessages(conversationId, userId, cursor, limit);
    res.json({ messages });
  })
);

/* ── POST /messaging/conversations/:id/messages ── */
const sendSchema = z.object({
  content: z.string().max(5000).optional(),
  type: z.enum(["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE"]).optional(),
  mediaUrl: z.string().optional(),
  fileName: z.string().max(255).optional(),
  replyToId: z.string().optional(),
});

router.post(
  "/conversations/:id/messages",
  requireAuth,
  requireNoRestriction("MESSAGE_LIMIT"),
  rateLimit(RateLimits.MESSAGE),
  spamGuard("MESSAGE"),
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    const conversationId = req.params.id;
    const data = sendSchema.parse(req.body);
    const message = await messagingService.sendMessage(conversationId, userId, data);
    const guardWarning = (message as any)._guardWarning;
    res.status(201).json({ message, ...(guardWarning ? { guardWarning } : {}) });
  })
);

/* ── PATCH /messaging/messages/:id ── */
const editSchema = z.object({ content: z.string().min(1).max(5000) });

router.patch(
  "/messages/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    const { content } = editSchema.parse(req.body);
    const message = await messagingService.editMessage(req.params.id, userId, content);
    res.json({ message });
  })
);

/* ── DELETE /messaging/messages/:id ── */
router.delete(
  "/messages/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    await messagingService.deleteMessage(req.params.id, userId);
    res.json({ ok: true });
  })
);

/* ── POST /messaging/conversations/:id/read ── */
router.post(
  "/conversations/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    await messagingService.markConversationRead(req.params.id, userId);
    res.json({ ok: true });
  })
);

/* ── GET /messaging/users/search?q= ── */
router.get(
  "/users/search",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2) { res.json({ users: [] }); return; }
    const users = await messagingService.searchUsers(q, userId);
    res.json({ users });
  })
);

/* ── GET /messaging/call-logs ── */
router.get(
  "/call-logs",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const logs = await callLogService.getUserCallLogs(userId, cursor);
    res.json({ callLogs: logs });
  })
);

/* ── GET /messaging/calls/:callId/state ──
 * Étape 3 : permet aux clients (web, push, native) de valider qu'un appel
 * référencé par une notif/URL/FCM est bien actif côté serveur avant
 * d'afficher la sonnerie. Réservé aux participants. */
router.get(
  "/calls/:callId/state",
  requireAuth,
  rateLimit(RateLimits.CALL_STATE),
  asyncHandler(async (req, res) => {
    const { userId } = (req as AuthenticatedRequest).auth!;
    const callId = String(req.params.callId || "");
    // Lookup persisté chargé seulement si l'entry mémoire est absente —
    // résolu après pour rester pur, mais pratique d'avoir tout en amont.
    const log = callId && callId.length <= 64 ? await callLogService.getCallLogById(callId) : null;
    const result = resolveCallStateForUser(callId, userId, log);
    switch (result.kind) {
      case "invalid":
        res.status(400).json({ error: "callId_invalid" });
        return;
      case "forbidden":
        res.status(403).json({ error: "not_participant" });
        return;
      case "not_found":
        res.status(404).json({ error: "call_not_found", isActive: false, now: result.now });
        return;
      case "live":
      case "log":
        res.json({ ...result.payload, now: result.now });
        return;
    }
  })
);

export default router;
