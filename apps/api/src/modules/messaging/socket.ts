import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { verifyAccessToken } from "../../shared/auth/jwt.js";
import * as messagingService from "./messaging.service.js";
import * as callLogService from "./call-log.service.js";
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

/** conversationId → active call log ID (tracks in-progress calls) */
const activeCallLogs = new Map<string, string>();
/** conversationId → server-side 30s no-answer timer */
const activeCallTimers = new Map<string, ReturnType<typeof setTimeout>>();
const CALL_TIMEOUT_MS = 30_000;

/** userId → last call:initiate timestamp (rate limit: 1 per 5s) */
const callInitiateRates = new Map<string, number>();
const CALL_INITIATE_COOLDOWN_MS = 5_000;

/** Tracks calls accepted before the 30s timer fires (race condition guard) */
const acceptedCalls = new Set<string>();

// ── Periodic cleanup of stale activeCallLogs (safety net) ──
setInterval(() => {
  for (const [convId, logId] of activeCallLogs.entries()) {
    if (!activeCallTimers.has(convId)) {
      activeCallLogs.delete(convId);
      void callLogService.updateCallLogStatus(logId, "NO_ANSWER", { endedAt: new Date() }).catch(() => {});
    }
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
        socket.to(`conv:${data.conversationId}`).emit("conversation:read", { conversationId: data.conversationId, userId });
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

      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("call:incoming", {
            conversationId: data.conversationId,
            callerId: userId,
            callType: data.callType,
          });
        }
      }

      // Persist call log (default MISSED — updated on accept/reject/end)
      void (async () => {
        try {
          const log = await callLogService.createCallLog({
            conversationId: data.conversationId,
            callerUserId: userId,
            receiverUserId: data.targetUserId,
            callType: data.callType === "video" ? "VIDEO" : "AUDIO",
          });
          activeCallLogs.set(data.conversationId, log.id);
        } catch (e) { console.error("[CallLog] create error", e); }
      })();

      // Push notification for call (send even when socket presence is stale)
      void (async () => {
        const senderProfile = await prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } });
        const senderName = senderProfile?.displayName ?? "Quelqu'un";
        const callLabel = data.callType === "video" ? "📹 Appel vidéo" : "📞 Appel audio";
        void sendPushToUser(data.targetUserId, {
            title: `Kin-Sell • ${callLabel}`,
            body: `${senderName} vous appelle…`,
            tag: `call-${data.conversationId}`,
          data: {
            type: "call",
            conversationId: data.conversationId,
            callerId: userId,
            callerName: senderName,
            callType: data.callType,
            url: `/messaging?incomingConvId=${data.conversationId}&incomingCallerId=${userId}&incomingCallType=${data.callType}`,
          },
          actions: [
            { action: "accept", title: "Accepter" },
            { action: "reject", title: "Refuser" },
          ],
        });
      })();

      // ── 30s server-side timeout → NO_ANSWER ──
      if (activeCallTimers.has(data.conversationId)) clearTimeout(activeCallTimers.get(data.conversationId)!);
      activeCallTimers.set(data.conversationId, setTimeout(() => {
        activeCallTimers.delete(data.conversationId);
        // Race guard: if call was accepted just before timeout fired, skip no-answer
        if (acceptedCalls.has(data.conversationId)) { acceptedCalls.delete(data.conversationId); return; }
        // Notify both parties
        const callerSockets = onlineUsers.get(userId);
        if (callerSockets) { for (const sid of callerSockets) io.to(sid).emit("call:no-answer", { conversationId: data.conversationId }); }
        const receiverSockets = onlineUsers.get(data.targetUserId);
        if (receiverSockets) { for (const sid of receiverSockets) io.to(sid).emit("call:no-answer", { conversationId: data.conversationId }); }
        // Update call log → NO_ANSWER + system message
        const logId = activeCallLogs.get(data.conversationId);
        if (logId) {
          activeCallLogs.delete(data.conversationId);
          void callLogService.updateCallLogStatus(logId, "NO_ANSWER", { endedAt: new Date() })
            .then((log) => createCallEventMessage(io, data.conversationId, log.callerUserId, log.callType, "NO_ANSWER"))
            .catch((e) => console.error("[CallLog] no-answer error", e));
        }
      }, CALL_TIMEOUT_MS));
    });

    socket.on("call:accept", async (data: { conversationId: string; callerId: string }) => {
      // Validate participant
      try {
        const m = await prisma.conversationParticipant.findFirst({ where: { conversationId: data.conversationId, userId } });
        if (!m) return;
      } catch { return; }

      // Cancel no-answer timer
      const timer = activeCallTimers.get(data.conversationId);
      if (timer) { clearTimeout(timer); activeCallTimers.delete(data.conversationId); }
      // Mark as accepted to guard against race with 30s timeout
      acceptedCalls.add(data.conversationId);
      // Clean up after 60s (no need to keep forever)
      setTimeout(() => acceptedCalls.delete(data.conversationId), 60_000);

      const callerSockets = onlineUsers.get(data.callerId);
      if (callerSockets) {
        for (const sid of callerSockets) {
          io.to(sid).emit("call:accepted", { conversationId: data.conversationId, accepterId: userId });
        }
      }

      // Update call log → ANSWERED
      const logId = activeCallLogs.get(data.conversationId);
      if (logId) {
        void callLogService.updateCallLogStatus(logId, "ANSWERED", { answeredAt: new Date() }).catch((e) => console.error("[CallLog] accept error", e));
      }
    });

    socket.on("call:reject", async (data: { conversationId: string; callerId: string }) => {
      // Validate participant
      try {
        const m = await prisma.conversationParticipant.findFirst({ where: { conversationId: data.conversationId, userId } });
        if (!m) return;
      } catch { return; }

      // Cancel no-answer timer
      const timer = activeCallTimers.get(data.conversationId);
      if (timer) { clearTimeout(timer); activeCallTimers.delete(data.conversationId); }

      const callerSockets = onlineUsers.get(data.callerId);
      if (callerSockets) {
        for (const sid of callerSockets) {
          io.to(sid).emit("call:rejected", { conversationId: data.conversationId, rejecterId: userId });
        }
      }

      // Update call log → REJECTED + system message
      const logId = activeCallLogs.get(data.conversationId);
      if (logId) {
        void callLogService.updateCallLogStatus(logId, "REJECTED", { endedAt: new Date() })
          .then((log) => createCallEventMessage(io, data.conversationId, log.callerUserId, log.callType, "REJECTED"))
          .catch((e) => console.error("[CallLog] reject error", e));
        activeCallLogs.delete(data.conversationId);
      }
    });

    socket.on("call:end", async (data: { conversationId: string; targetUserId: string }) => {
      // Validate participant
      try {
        const m = await prisma.conversationParticipant.findFirst({ where: { conversationId: data.conversationId, userId } });
        if (!m) return;
      } catch { return; }

      // Cancel no-answer timer
      const noAnswerTimer = activeCallTimers.get(data.conversationId);
      if (noAnswerTimer) { clearTimeout(noAnswerTimer); activeCallTimers.delete(data.conversationId); }

      // Always emit call:ended to the other side — even if call log already processed
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("call:ended", { conversationId: data.conversationId, enderId: userId });
        }
      }

      // Also emit to ALL sockets of the CALLER (other tabs) so they also clean up
      const callerSockets = onlineUsers.get(userId);
      if (callerSockets) {
        for (const sid of callerSockets) {
          if (sid !== socket.id) { // skip the socket that initiated the end
            io.to(sid).emit("call:ended", { conversationId: data.conversationId, enderId: userId });
          }
        }
      }

      // Update call log → set endedAt + compute duration + system message
      const logId = activeCallLogs.get(data.conversationId);
      if (logId) {
        activeCallLogs.delete(data.conversationId);
        void (async () => {
          try {
            const existing = await prisma.callLog.findUnique({ where: { id: logId }, select: { answeredAt: true, callType: true, callerUserId: true } });
            const endedAt = new Date();
            const durationSeconds = existing?.answeredAt ? Math.round((endedAt.getTime() - existing.answeredAt.getTime()) / 1000) : undefined;
            // ANSWERED = appel connecté puis terminé
            // CANCELLED = appelant a raccroché AVANT que le receveur ne décroche
            const status = existing?.answeredAt ? "ANSWERED" : "CANCELLED";
            await callLogService.updateCallLogStatus(logId, status, { endedAt, durationSeconds });
            await createCallEventMessage(io, data.conversationId, existing?.callerUserId ?? userId, existing?.callType ?? "AUDIO", status, durationSeconds);
          } catch (e) { logger.error({ err: e, logId }, "[CallLog] end error"); }
        })();
      }
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

      // Clean up any active call timers where this user is involved
      for (const [convId, timer] of activeCallTimers.entries()) {
        // If the disconnecting user has an active call log for this conversation, clean up
        const logId = activeCallLogs.get(convId);
        if (logId) {
          // Check asynchronously if user was part of this call
          void prisma.callLog.findUnique({ where: { id: logId }, select: { callerUserId: true, receiverUserId: true, callType: true, answeredAt: true } }).then((log) => {
            if (!log) return;
            if (log.callerUserId !== userId && log.receiverUserId !== userId) return;
            // User was in this call — check if they still have other sockets
            const remaining = onlineUsers.get(userId);
            if (remaining && remaining.size > 0) return; // still connected via another tab
            clearTimeout(timer);
            activeCallTimers.delete(convId);
            activeCallLogs.delete(convId);
            // Determine correct status: ANSWERED if call was connected, CANCELLED if still ringing
            const status = log.answeredAt ? "ANSWERED" : "CANCELLED";
            const endedAt = new Date();
            const durationSeconds = log.answeredAt ? Math.round((endedAt.getTime() - log.answeredAt.getTime()) / 1000) : undefined;
            void callLogService.updateCallLogStatus(logId, status, { endedAt, durationSeconds })
              .then(() => createCallEventMessage(io, convId, log.callerUserId, log.callType, status, durationSeconds))
              .catch((e) => console.error("[CallLog] disconnect cleanup error", e));
          }).catch(() => {});
        }
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

