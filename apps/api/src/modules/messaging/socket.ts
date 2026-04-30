import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { verifyAccessToken } from "../../shared/auth/jwt.js";
import * as messagingService from "./messaging.service.js";
import * as callLogService from "./call-log.service.js";
import {
  activeCalls,
  activeCallTimers,
  CALL_TIMEOUT_MS,
  validateAccept,
  validateReject,
  validateEnd,
  terminateCall,
  sweepOrphanCalls,
  type ActiveCallEntry,
} from "./call-state.js";
import { sendPushToUser, sendPushToUsers } from "../notifications/push.service.js";
import { prisma } from "../../shared/db/prisma.js";
import { logger } from "../../shared/logger.js";

/** userId → Set<socketId> (one user can have multiple tabs) */
const onlineUsers = new Map<string, Set<string>>();
/** userId → true si le statut en ligne est visible aux autres */
const onlineVisibility = new Map<string, boolean>();
/** userId → sockets réellement au premier plan (app active / onglet visible) */
const foregroundSockets = new Map<string, Set<string>>();

/** userId → { count, resetAt } for socket message rate limiting */
const socketMessageRates = new Map<string, { count: number; resetAt: number }>();
const SOCKET_MSG_MAX = 40; // max 40 messages par fenêtre
const SOCKET_MSG_WINDOW_MS = 60_000; // fenêtre de 60 secondes

/** userId → last typing event timestamp (throttle typing indicators) */
const typingRates = new Map<string, number>();
// A12 audit : 3s (au lieu de 2s) → 20 events/min max par user
const TYPING_MIN_INTERVAL_MS = 3_000;
/** conversationId → Set<userId> of active typers (stop broadcasting after 5) */
const activeTypersByConv = new Map<string, Set<string>>();
const MAX_ACTIVE_TYPERS_PER_CONV = 5;

/** userId → last call:initiate timestamp (rate limit: 1 per 5s) */
const callInitiateRates = new Map<string, number>();
const CALL_INITIATE_COOLDOWN_MS = 5_000;

// ── Periodic sweep des appels orphelins (sans timer, expirés) ──
// Ne dégrade JAMAIS un appel accepté/terminé en NO_ANSWER.
setInterval(() => {
  const purgedCallIds = sweepOrphanCalls();
  for (const callId of purgedCallIds) {
    void callLogService.updateCallLogStatus(callId, "NO_ANSWER", { endedAt: new Date() }).catch(() => {});
  }
}, 60_000);

/** Create a SYSTEM message in the conversation to log a call event */
async function createCallEventMessage(
  io: SocketIOServer,
  conversationId: string,
  senderId: string,
  callType: string,
  status: string,
  durationSeconds?: number | null,
) {
  try {
    const msg = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        type: "SYSTEM",
        content: JSON.stringify({ source: "call", callType, status, durationSeconds: durationSeconds ?? null }),
      },
      include: {
        sender: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } },
        replyTo: { select: { id: true, content: true, type: true, sender: { select: { profile: { select: { displayName: true } } } } } },
        readReceipts: { select: { userId: true, readAt: true } },
      },
    });
    io.to(`conv:${conversationId}`).emit("message:new", { message: msg });
  } catch (e) {
    logger.error({ err: e }, "[CallEvent] Failed to create call event message");
  }
}

/** userId → pending offline timeout (grace period for mobile/background transitions) */
const pendingOfflineTimers = new Map<string, ReturnType<typeof setTimeout>>();
const OFFLINE_GRACE_MS = 120_000;
let ioInstance: SocketIOServer | null = null;

function setSocketForeground(userId: string, socketId: string, isForeground: boolean) {
  const sockets = foregroundSockets.get(userId) ?? new Set<string>();
  if (isForeground) {
    sockets.add(socketId);
    foregroundSockets.set(userId, sockets);
    return;
  }

  sockets.delete(socketId);
  if (sockets.size === 0) {
    foregroundSockets.delete(userId);
  } else {
    foregroundSockets.set(userId, sockets);
  }
}

function hasForegroundPresence(userId: string): boolean {
  return (foregroundSockets.get(userId)?.size ?? 0) > 0;
}

export function setupSocketServer(httpServer: HttpServer, corsOrigin: string) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    path: "/ws",
    transports: ["websocket", "polling"],
    // A9 audit : pingInterval 15s / pingTimeout 10s → détection plus rapide
    // des déconnexions en 2G Kinshasa (avant : 25s/20s, trop lent).
    pingInterval: 15000,
    pingTimeout: 10000,
  });
  ioInstance = io;

  /* ── Auth middleware ── */
  io.use((socket, next) => {
    // Try auth.token first (mobile/legacy), then httpOnly cookie
    let token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)kin_access=([^;]+)/);
        if (match) token = match[1];
      }
    }
    if (!token) return next(new Error("Authentification requise"));
    try {
      const payload = verifyAccessToken(token);
      (socket.data as { userId: string }).userId = payload.sub;
      next();
    } catch {
      next(new Error("Token invalide"));
    }
  });

  io.on("connection", (socket) => {
    const userId: string = (socket.data as { userId: string }).userId;

    /* ── Track online status ── */
    const wasOffline = !onlineUsers.has(userId) || (onlineUsers.get(userId)?.size ?? 0) === 0;
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());

    // ── Limite max 5 connexions simultanées par utilisateur ──
    const userSockets = onlineUsers.get(userId)!;
    if (userSockets.size >= 5) {
      // Déconnecter la plus ancienne socket pour laisser la place
      const oldest = userSockets.values().next().value;
      if (oldest) { ioInstance?.sockets.sockets.get(oldest)?.disconnect(true); userSockets.delete(oldest); }
    }
    userSockets.add(socket.id);
    setSocketForeground(userId, socket.id, true);

    const pendingOffline = pendingOfflineTimers.get(userId);
    if (pendingOffline) {
      clearTimeout(pendingOffline);
      pendingOfflineTimers.delete(userId);
    }

    void (async () => {
      const pref = await prisma.userPreference.findUnique({
        where: { userId },
        select: { onlineStatusVisible: true },
      }).catch(() => null);

      const isVisible = pref?.onlineStatusVisible ?? true;
      onlineVisibility.set(userId, isVisible);

      socket.emit("presence:snapshot", {
        userIds: Array.from(onlineUsers.keys()).filter((id) => id !== userId && (onlineVisibility.get(id) ?? true)),
      });

      if (isVisible && wasOffline) {
        io.emit("user:online", { userId });
      }
    })();

    socket.on("app:state", (data: { state?: string; visibility?: string }) => {
      const isForeground = data?.state !== "background" && data?.visibility !== "hidden";
      setSocketForeground(userId, socket.id, isForeground);
    });

    /* ── Join user-specific room (for targeted order/negotiation/notification events) ── */
    void socket.join(`user:${userId}`);

    /* ── Join conversation rooms (await to ensure rooms are ready before receiving messages) ── */
    void (async () => {
      try {
        const conversations: { id: string }[] = await messagingService.getUserConversations(userId);
        for (const conv of conversations) {
          await socket.join(`conv:${conv.id}`);
        }
      } catch { /* ignore join errors */ }
    })();

    /* ── Typing indicators (rate-limited) ── */
    socket.on("typing:start", (data: { conversationId: string }) => {
      // A7 audit : regex validation
      if (!data?.conversationId || !/^[A-Za-z0-9_-]{10,50}$/.test(data.conversationId)) return;
      const now = Date.now();
      const last = typingRates.get(userId) ?? 0;
      if (now - last < TYPING_MIN_INTERVAL_MS) return;
      typingRates.set(userId, now);
      // A12 audit : limiter le nombre de typers actifs par conv à 5 simultanés
      let typers = activeTypersByConv.get(data.conversationId);
      if (!typers) {
        typers = new Set<string>();
        activeTypersByConv.set(data.conversationId, typers);
      }
      if (!typers.has(userId) && typers.size >= MAX_ACTIVE_TYPERS_PER_CONV) return;
      typers.add(userId);
      socket.to(`conv:${data.conversationId}`).emit("typing:start", { conversationId: data.conversationId, userId });
    });

    socket.on("typing:stop", (data: { conversationId: string }) => {
      if (!data?.conversationId || !/^[A-Za-z0-9_-]{10,50}$/.test(data.conversationId)) return;
      const typers = activeTypersByConv.get(data.conversationId);
      if (typers) {
        typers.delete(userId);
        if (typers.size === 0) activeTypersByConv.delete(data.conversationId);
      }
      socket.to(`conv:${data.conversationId}`).emit("typing:stop", { conversationId: data.conversationId, userId });
    });

    /* ── Send message via socket ── */
    socket.on("message:send", async (data: { conversationId: string; content?: string; type?: string; mediaUrl?: string; fileName?: string; replyToId?: string }, callback?: (res: unknown) => void) => {
      try {
        // ── Validation des entrées (A7 audit : regex strict) ──
        if (!data || typeof data.conversationId !== "string" || !/^[A-Za-z0-9_-]{10,50}$/.test(data.conversationId)) {
          if (callback) callback({ ok: false, error: "conversationId invalide" }); return;
        }
        if (data.content !== undefined && (typeof data.content !== "string" || data.content.length > 5000)) {
          if (callback) callback({ ok: false, error: "Contenu invalide (max 5000 caractères)" }); return;
        }
        if (data.type && !["TEXT", "IMAGE", "AUDIO", "VIDEO", "FILE"].includes(data.type)) {
          if (callback) callback({ ok: false, error: "Type de message invalide" }); return;
        }

        // ── Rate limit: max SOCKET_MSG_MAX messages per window ──
        const now = Date.now();
        let rate = socketMessageRates.get(userId);
        if (!rate || now > rate.resetAt) {
          rate = { count: 0, resetAt: now + SOCKET_MSG_WINDOW_MS };
          socketMessageRates.set(userId, rate);
        }
        rate.count++;
        if (rate.count > SOCKET_MSG_MAX) {
          if (callback) callback({ ok: false, error: "Trop de messages envoyés. Réessayez dans un instant." });
          return;
        }

        const message = await messagingService.sendMessage(data.conversationId, userId, {
          content: data.content,
          type: (data.type ?? "TEXT") as "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "FILE",
          mediaUrl: data.mediaUrl,
          fileName: data.fileName,
          replyToId: data.replyToId,
        });

        // Make sure all participants are in the room BEFORE broadcast
        // (critical for first message in a new conversation)
        const participantIds = await messagingService.getConversationParticipantIds(data.conversationId);
        for (const pid of participantIds) {
          const sockets = onlineUsers.get(pid);
          if (sockets) {
            for (const sid of sockets) {
              const s = io.sockets.sockets.get(sid);
              if (s) await s.join(`conv:${data.conversationId}`);
            }
          }
        }

        // Broadcast to all participants in the conversation
        io.to(`conv:${data.conversationId}`).emit("message:new", { message });

        // Push notification only to truly offline recipients (not connected via socket)
        const pushRecipients = participantIds.filter((pid) => pid !== userId && !hasForegroundPresence(pid));
        if (pushRecipients.length > 0) {
          const senderProfile = await prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } });
          const senderName = senderProfile?.displayName ?? "Quelqu'un";
          const bodyText = message.type === "TEXT"
            ? `${senderName} : ${(message.content?.slice(0, 100) ?? "Nouveau message")} 💬`
            : message.type === "IMAGE" ? `${senderName} a envoyé 📸`
            : message.type === "AUDIO" ? `${senderName} a envoyé 🎵`
            : message.type === "VIDEO" ? `${senderName} a envoyé 🎬`
            : `${senderName} a envoyé 📎`;
          void sendPushToUsers(pushRecipients, {
            title: senderName,
            body: bodyText,
            tag: `msg-${data.conversationId}`,
            data: {
              type: "message",
              conversationId: data.conversationId,
              senderId: userId,
              senderName,
              messageType: message.type,
              url: `/messaging?convId=${data.conversationId}`,
            },
          });
        }

        const guardWarning = (message as any)?._guardWarning;
        if (callback) callback({ ok: true, message, ...(guardWarning ? { guardWarning } : {}) });
      } catch (error) {
        const isGuardBlock = error instanceof Error && error.message.startsWith("🔒");
        if (callback) callback({ ok: false, error: error instanceof Error ? error.message : "Erreur envoi", guardBlock: isGuardBlock });
      }
    });

    /* ── Edit message ── */
    socket.on("message:edit", async (data: { messageId: string; content: string }, callback?: (res: unknown) => void) => {
      try {
        const message = await messagingService.editMessage(data.messageId, userId, data.content);
        io.to(`conv:${message.conversationId}`).emit("message:edited", { message });
        if (callback) callback({ ok: true, message });
      } catch (error) {
        if (callback) callback({ ok: false, error: error instanceof Error ? error.message : "Erreur modification" });
      }
    });

    /* ── Delete message ── */
    socket.on("message:delete", async (data: { messageId: string; conversationId: string }, callback?: (res: unknown) => void) => {
      try {
        await messagingService.deleteMessage(data.messageId, userId);
        io.to(`conv:${data.conversationId}`).emit("message:deleted", { messageId: data.messageId, conversationId: data.conversationId });
        if (callback) callback({ ok: true });
      } catch (error) {
        if (callback) callback({ ok: false, error: error instanceof Error ? error.message : "Erreur suppression" });
      }
    });

    /* ── Mark read ── */
    socket.on("conversation:read", async (data: { conversationId: string }) => {
      try {
        await messagingService.markConversationRead(data.conversationId, userId);

        // Garantir que TOUS les sockets participants sont dans la room avant d'émettre.
        // Sans cela, si l'expéditeur (A) s'est reconnecté après l'envoi et n'a pas
        // eu le temps de re-joindre la room, il ne recevra pas conversation:read et
        // son UI restera bloquée sur "envoyé" jusqu'à un refresh manuel.
        const participantIds = await messagingService.getConversationParticipantIds(data.conversationId);
        for (const pid of participantIds) {
          const sockets = onlineUsers.get(pid);
          if (sockets) {
            for (const sid of sockets) {
              const s = io.sockets.sockets.get(sid);
              if (s) await s.join(`conv:${data.conversationId}`);
            }
          }
        }

        // Émission dans la room conv:<id> (exclut l'émetteur courant)
        socket.to(`conv:${data.conversationId}`).emit("conversation:read", { conversationId: data.conversationId, userId });

        // Redondance P0 : émettre aussi dans user:<id> pour chaque autre participant.
        // Couvre le cas où un socket n'est pas encore dans conv:<id> (reconnexion,
        // nouveau device, etc.). Double émission = risque de dédup à gérer côté client
        // (handleConvRead est idempotent, donc ok).
        for (const pid of participantIds) {
          if (pid === userId) continue;
          io.to(`user:${pid}`).emit("conversation:read", { conversationId: data.conversationId, userId });
        }
      } catch { /* ignore */ }
    });

    /* ═══════════════════════════════════════
       WebRTC Signaling
       ═══════════════════════════════════════ */

    socket.on("call:initiate", async (data: { conversationId: string; targetUserId: string; callType: "audio" | "video" }) => {
      // Rate limit: max 1 call initiate per 5s per user
      const now = Date.now();
      const lastCall = callInitiateRates.get(userId);
      if (lastCall && now - lastCall < CALL_INITIATE_COOLDOWN_MS) return;
      callInitiateRates.set(userId, now);

      // Validate caller is a participant of the conversation
      try {
        const membership = await prisma.conversationParticipant.findFirst({
          where: { conversationId: data.conversationId, userId },
        });
        if (!membership) return;
      } catch { return; }

      // Persist call log FIRST — son id devient le callId partagé bout-en-bout.
      let callId: string;
      let entry: ActiveCallEntry;
      try {
        const log = await callLogService.createCallLog({
          conversationId: data.conversationId,
          callerUserId: userId,
          receiverUserId: data.targetUserId,
          callType: data.callType === "video" ? "VIDEO" : "AUDIO",
        });
        callId = log.id;
        const expiresAt = Date.now() + CALL_TIMEOUT_MS;
        entry = {
          callId,
          conversationId: data.conversationId,
          callerUserId: userId,
          receiverUserId: data.targetUserId,
          callType: data.callType === "video" ? "VIDEO" : "AUDIO",
          startedAt: Date.now(),
          expiresAt,
          accepted: false,
          ended: false,
        };
        activeCalls.set(callId, entry);
      } catch (e) { logger.error({ err: e }, "[CallLog] create error"); return; }

      // Ack au caller : il reçoit son callId + expiresAt pour les emits suivants.
      const callerSockets = onlineUsers.get(userId);
      if (callerSockets) {
        for (const sid of callerSockets) {
          io.to(sid).emit("call:initiated", {
            callId,
            conversationId: data.conversationId,
            targetUserId: data.targetUserId,
            callType: data.callType,
            expiresAt: entry.expiresAt,
          });
        }
      }

      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("call:incoming", {
            callId,
            conversationId: data.conversationId,
            callerId: userId,
            callType: data.callType,
            expiresAt: entry.expiresAt,
          });
        }
      }

      // Push notification (étape 3 traitera expiresAt côté SW/APK)
      void (async () => {
        const senderProfile = await prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } });
        const senderName = senderProfile?.displayName ?? "Quelqu'un";
        const callLabel = data.callType === "video" ? "📹 Appel vidéo" : "📞 Appel audio";
        // Tag indexé par callId pour permettre à l'étape 3 de purger
        // précisément la notif d'un appel donné (vs collision conv).
        const tag = `call-${callId}`;
        const incomingUrl = `/messaging?incomingConvId=${encodeURIComponent(data.conversationId)}`
          + `&incomingCallerId=${encodeURIComponent(userId)}`
          + `&incomingCallType=${encodeURIComponent(data.callType)}`
          + `&callId=${encodeURIComponent(callId)}`
          + `&expiresAt=${entry.expiresAt}`;
        void sendPushToUser(data.targetUserId, {
            title: `Kin-Sell • ${callLabel}`,
            body: `${senderName} vous appelle…`,
            tag,
          data: {
            type: "call",
            callId,
            conversationId: data.conversationId,
            callerId: userId,
            callerName: senderName,
            callType: data.callType,
            expiresAt: entry.expiresAt,
            url: incomingUrl,
          },
          actions: [
            { action: "accept", title: "Accepter" },
            { action: "reject", title: "Refuser" },
          ],
        });
      })();

      // ── 30s server-side timeout → NO_ANSWER (indexé par callId) ──
      const existing = activeCallTimers.get(callId);
      if (existing) clearTimeout(existing);
      activeCallTimers.set(callId, setTimeout(() => {
        activeCallTimers.delete(callId);
        const current = activeCalls.get(callId);
        // Race guard : si l'appel a été accepté ou terminé entre-temps, on ne fait rien.
        if (!current || current.accepted || current.ended) return;
        current.ended = true;
        activeCalls.delete(callId);
        // Notify both parties — payload typé avec callId.
        const callerS = onlineUsers.get(current.callerUserId);
        if (callerS) { for (const sid of callerS) io.to(sid).emit("call:no-answer", { callId, conversationId: current.conversationId }); }
        const receiverS = onlineUsers.get(current.receiverUserId);
        if (receiverS) { for (const sid of receiverS) io.to(sid).emit("call:no-answer", { callId, conversationId: current.conversationId }); }
        void callLogService.updateCallLogStatus(callId, "NO_ANSWER", { endedAt: new Date() })
          .then((log) => createCallEventMessage(io, current.conversationId, log.callerUserId, log.callType, "NO_ANSWER"))
          .catch((e) => logger.error({ err: e }, "[CallLog] no-answer error"));
      }, CALL_TIMEOUT_MS));
    });

    socket.on("call:accept", async (data: { callId?: string; conversationId?: string; callerId?: string }) => {
      const v = validateAccept(data?.callId, userId);
      if (!v.ok) {
        logger.warn({ userId, reason: v.reason, callId: data?.callId }, "[Call] accept rejected");
        return;
      }
      const entry = v.entry;
      const callId = entry.callId;

      // Cancel no-answer timer + flag accepted
      const timer = activeCallTimers.get(callId);
      if (timer) { clearTimeout(timer); activeCallTimers.delete(callId); }
      entry.accepted = true;

      const callerSockets2 = onlineUsers.get(entry.callerUserId);
      if (callerSockets2) {
        for (const sid of callerSockets2) {
          io.to(sid).emit("call:accepted", {
            callId,
            conversationId: entry.conversationId,
            accepterId: userId,
          });
        }
      }

      // Update call log → ANSWERED
      void callLogService.updateCallLogStatus(callId, "ANSWERED", { answeredAt: new Date() })
        .catch((e) => logger.error({ err: e, callId }, "[CallLog] accept error"));
    });

    socket.on("call:reject", async (data: { callId?: string; conversationId?: string; callerId?: string }) => {
      const v = validateReject(data?.callId, userId);
      if (!v.ok) {
        logger.warn({ userId, reason: v.reason, callId: data?.callId }, "[Call] reject rejected");
        return;
      }
      const entry = v.entry;
      const callId = entry.callId;

      terminateCall(callId);

      const callerSockets3 = onlineUsers.get(entry.callerUserId);
      if (callerSockets3) {
        for (const sid of callerSockets3) {
          io.to(sid).emit("call:rejected", {
            callId,
            conversationId: entry.conversationId,
            rejecterId: userId,
          });
        }
      }
      // Redondance : cible aussi la room user:<callerId>.
      io.to(`user:${entry.callerUserId}`).emit("call:rejected", {
        callId,
        conversationId: entry.conversationId,
        rejecterId: userId,
      });

      // Update call log → REJECTED + system message
      void callLogService.updateCallLogStatus(callId, "REJECTED", { endedAt: new Date() })
        .then((log) => createCallEventMessage(io, entry.conversationId, log.callerUserId, log.callType, "REJECTED"))
        .catch((e) => logger.error({ err: e, callId }, "[CallLog] reject error"));
    });

    socket.on("call:end", async (data: { callId?: string; conversationId?: string; targetUserId?: string }) => {
      const v = validateEnd(data?.callId, userId);
      if (!v.ok) {
        logger.warn({ userId, reason: v.reason, callId: data?.callId }, "[Call] end rejected");
        return;
      }
      const entry = v.entry;
      const callId = entry.callId;
      const wasAccepted = entry.accepted;
      const otherUserId = entry.callerUserId === userId ? entry.receiverUserId : entry.callerUserId;

      terminateCall(callId);

      // Émettre call:ended à l'autre partie (sockets directs + room user).
      const otherSockets = onlineUsers.get(otherUserId);
      if (otherSockets) {
        for (const sid of otherSockets) {
          io.to(sid).emit("call:ended", { callId, conversationId: entry.conversationId, enderId: userId });
        }
      }
      io.to(`user:${otherUserId}`).emit("call:ended", { callId, conversationId: entry.conversationId, enderId: userId });

      // Aussi aux autres tabs de l'émetteur (sauf socket source).
      const selfSockets = onlineUsers.get(userId);
      if (selfSockets) {
        for (const sid of selfSockets) {
          if (sid !== socket.id) {
            io.to(sid).emit("call:ended", { callId, conversationId: entry.conversationId, enderId: userId });
          }
        }
      }

      // Update call log : ANSWERED si déjà accepté, sinon CANCELLED.
      void (async () => {
        try {
          const existingLog = await prisma.callLog.findUnique({ where: { id: callId }, select: { answeredAt: true, callType: true, callerUserId: true } });
          const endedAt = new Date();
          const durationSeconds = existingLog?.answeredAt
            ? Math.round((endedAt.getTime() - existingLog.answeredAt.getTime()) / 1000)
            : undefined;
          const status = wasAccepted || existingLog?.answeredAt ? "ANSWERED" : "CANCELLED";
          await callLogService.updateCallLogStatus(callId, status, { endedAt, durationSeconds });
          await createCallEventMessage(io, entry.conversationId, existingLog?.callerUserId ?? userId, existingLog?.callType ?? "AUDIO", status, durationSeconds);
        } catch (e) { logger.error({ err: e, callId }, "[CallLog] end error"); }
      })();
    });

    /* WebRTC SDP & ICE relay — with input validation */
    const MAX_SDP_SIZE = 5_000; // A10 audit : 5KB max (était 10KB — RFC 4566 typical)
    const CONV_ID_REGEX = /^[A-Za-z0-9_-]{10,50}$/; // A7 audit

    /** A10 audit : validation stricte SDP contre DoS */
    const isValidSdp = (sdp: unknown): sdp is { type: "offer" | "answer"; sdp: string } => {
      if (!sdp || typeof sdp !== "object") return false;
      const s = sdp as { type?: unknown; sdp?: unknown };
      if (s.type !== "offer" && s.type !== "answer") return false;
      if (typeof s.sdp !== "string" || s.sdp.length === 0) return false;
      // SDP doit commencer par "v=" (version line RFC 4566)
      if (!s.sdp.startsWith("v=")) return false;
      if (JSON.stringify(sdp).length > MAX_SDP_SIZE) return false;
      return true;
    };

    /** A10 audit : validation ICE candidate format */
    const isValidIceCandidate = (c: unknown): c is RTCIceCandidateInit => {
      if (!c || typeof c !== "object") return false;
      const cand = c as { candidate?: unknown };
      if (typeof cand.candidate !== "string") return false;
      // Soit chaîne vide (end-of-candidates) soit préfixe "candidate:"
      if (cand.candidate.length > 0 && !cand.candidate.startsWith("candidate:")) return false;
      if (cand.candidate.length > 500) return false;
      return true;
    };

    socket.on("webrtc:offer", (data: { targetUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!data?.targetUserId || typeof data.targetUserId !== "string" || data.targetUserId.length > 64) return;
      if (!isValidSdp(data.sdp)) return;
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("webrtc:offer", { callerId: userId, sdp: data.sdp });
        }
      }
    });

    socket.on("webrtc:answer", (data: { targetUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!data?.targetUserId || typeof data.targetUserId !== "string" || data.targetUserId.length > 64) return;
      if (!isValidSdp(data.sdp)) return;
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("webrtc:answer", { answererId: userId, sdp: data.sdp });
        }
      }
    });

    // A2 audit : ICE candidate deduplication par peer (Map<targetUserId, Set<string>>)
    // Cap 100 candidats par peer, max 50 peers.
    const sentIceCandidatesByPeer = new Map<string, Set<string>>();
    const MAX_CANDIDATES_PER_PEER = 100;
    const MAX_PEERS = 50;

    socket.on("webrtc:ice-candidate", (data: { targetUserId: string; candidate: RTCIceCandidateInit }) => {
      if (!data?.targetUserId || typeof data.targetUserId !== "string" || data.targetUserId.length > 64) return;
      if (!isValidIceCandidate(data.candidate)) return;

      let peerSet = sentIceCandidatesByPeer.get(data.targetUserId);
      if (!peerSet) {
        if (sentIceCandidatesByPeer.size >= MAX_PEERS) {
          // Evict oldest peer (first in map)
          const firstKey = sentIceCandidatesByPeer.keys().next().value;
          if (firstKey) sentIceCandidatesByPeer.delete(firstKey);
        }
        peerSet = new Set<string>();
        sentIceCandidatesByPeer.set(data.targetUserId, peerSet);
      }
      const key = data.candidate.candidate ?? "";
      if (peerSet.has(key)) return;
      peerSet.add(key);
      if (peerSet.size > MAX_CANDIDATES_PER_PEER) {
        // Reset ce peer (signaling frais)
        peerSet.clear();
        peerSet.add(key);
      }

      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("webrtc:ice-candidate", { fromUserId: userId, candidate: data.candidate });
        }
      }
    });

    /* ── Live WebRTC signaling (1-to-many broadcast) ── */

    socket.on("live:webrtc:offer", (data: { liveId: string; targetUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!data?.sdp || !data.targetUserId || !data.liveId || JSON.stringify(data.sdp).length > MAX_SDP_SIZE) return;
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("live:webrtc:offer", { liveId: data.liveId, hostId: userId, sdp: data.sdp });
        }
      }
    });

    socket.on("live:webrtc:answer", (data: { liveId: string; targetUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!data?.sdp || !data.targetUserId || !data.liveId || JSON.stringify(data.sdp).length > MAX_SDP_SIZE) return;
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("live:webrtc:answer", { liveId: data.liveId, viewerId: userId, sdp: data.sdp });
        }
      }
    });

    socket.on("live:webrtc:ice-candidate", (data: { liveId: string; targetUserId: string; candidate: RTCIceCandidateInit }) => {
      if (!data?.candidate || !data.targetUserId || !data.liveId) return;
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("live:webrtc:ice-candidate", { liveId: data.liveId, fromUserId: userId, candidate: data.candidate });
        }
      }
    });

    /* ── Disconnect ── */
    socket.on("disconnect", () => {
      setSocketForeground(userId, socket.id, false);

      // Clean up any active calls where this user is involved.
      // Itère sur activeCalls (pas activeCallTimers) : un appel accepté n'a
      // plus de timer mais reste dans activeCalls.
      for (const [callId, entry] of Array.from(activeCalls.entries())) {
        if (entry.callerUserId !== userId && entry.receiverUserId !== userId) continue;
        // User still connected via another tab → laisser l'appel intact.
        const remaining = onlineUsers.get(userId);
        if (remaining && remaining.size > 0) continue;

        const timer = activeCallTimers.get(callId);
        if (timer) { clearTimeout(timer); activeCallTimers.delete(callId); }
        const wasAccepted = entry.accepted;
        entry.ended = true;
        activeCalls.delete(callId);

        // Notifier explicitement l'AUTRE partie que l'appel se termine
        // à cause d'une déconnexion (sans ce signal, l'autre côté
        // resterait bloqué en "sonnerie" ou "connecté" jusqu'au timeout
        // ICE natif ~2 min).
        const otherUserId = entry.callerUserId === userId ? entry.receiverUserId : entry.callerUserId;
        io.to(`user:${otherUserId}`).emit("call:ended", {
          callId,
          conversationId: entry.conversationId,
          enderId: userId,
          reason: "disconnected",
        });

        void prisma.callLog.findUnique({ where: { id: callId }, select: { callerUserId: true, callType: true, answeredAt: true } }).then((log) => {
          if (!log) return;
          const status = log.answeredAt || wasAccepted ? "ANSWERED" : "CANCELLED";
          const endedAt = new Date();
          const durationSeconds = log.answeredAt ? Math.round((endedAt.getTime() - log.answeredAt.getTime()) / 1000) : undefined;
          void callLogService.updateCallLogStatus(callId, status, { endedAt, durationSeconds })
            .then(() => createCallEventMessage(io, entry.conversationId, log.callerUserId, log.callType, status, durationSeconds))
            .catch((e) => logger.error({ err: e, callId }, "[CallLog] disconnect cleanup error"));
        }).catch(() => {});
      }

      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          const timer = setTimeout(() => {
            const hasReconnected = (onlineUsers.get(userId)?.size ?? 0) > 0;
            if (hasReconnected) {
              pendingOfflineTimers.delete(userId);
              return;
            }

            const wasVisible = onlineVisibility.get(userId) ?? true;
                        foregroundSockets.delete(userId);
            onlineUsers.delete(userId);
            onlineVisibility.delete(userId);
            pendingOfflineTimers.delete(userId);
            // Clean up per-user rate limit Maps to prevent memory leaks
            socketMessageRates.delete(userId);
            typingRates.delete(userId);
            callInitiateRates.delete(userId);

            const lastSeenAt = new Date();
            void prisma.userProfile.updateMany({
              where: { userId },
              data: { lastSeenAt },
            }).catch(() => {});

            if (wasVisible) {
              io.emit("user:offline", { userId, lastSeenAt: lastSeenAt.toISOString() });
            }
          }, OFFLINE_GRACE_MS);

          // B9 audit : purge défensive d'un éventuel timer précédent
          // (reconnects successifs rapides) avant d'enregistrer le nouveau.
          const existing = pendingOfflineTimers.get(userId);
          if (existing) clearTimeout(existing);
          pendingOfflineTimers.set(userId, timer);
        }
      }
    });
  });

  return io;
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys()).filter((id) => onlineVisibility.get(id) ?? true);
}

export function isUserOnline(userId: string): boolean {
  return (onlineUsers.get(userId)?.size ?? 0) > 0;
}

export function emitToUser<TPayload>(userId: string, event: string, payload: TPayload) {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

export function emitToUsers<TPayload>(userIds: string[], event: string, payload: TPayload) {
  if (!ioInstance) return;
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  for (const uid of uniqueUserIds) {
    ioInstance.to(`user:${uid}`).emit(event, payload);
  }
}

export function emitToAll<TPayload>(event: string, payload: TPayload) {
  if (!ioInstance) return;
  ioInstance.emit(event, payload);
}

export function emitToLiveRoom<TPayload>(liveId: string, event: string, payload: TPayload) {
  if (!ioInstance || !liveId) return;
  ioInstance.to(`live:${liveId}`).emit(event, payload);
}

