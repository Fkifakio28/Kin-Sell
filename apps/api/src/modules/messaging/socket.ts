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

/** userId → { count, resetAt } for socket message rate limiting */
const socketMessageRates = new Map<string, { count: number; resetAt: number }>();
const SOCKET_MSG_MAX = 40; // max 40 messages par fenêtre
const SOCKET_MSG_WINDOW_MS = 60_000; // fenêtre de 60 secondes

/** userId → last typing event timestamp (throttle typing indicators) */
const typingRates = new Map<string, number>();
const TYPING_MIN_INTERVAL_MS = 2_000; // max 1 typing event par 2s

/** conversationId → active call log ID (tracks in-progress calls) */
const activeCallLogs = new Map<string, string>();
/** userId → pending offline timeout (grace period for mobile/background transitions) */
const pendingOfflineTimers = new Map<string, ReturnType<typeof setTimeout>>();
const OFFLINE_GRACE_MS = 120_000;
let ioInstance: SocketIOServer | null = null;

export function setupSocketServer(httpServer: HttpServer, corsOrigin: string) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    path: "/ws",
    transports: ["websocket", "polling"],
    pingInterval: 25000,   // heartbeat toutes les 25s (détecte déconnexion mobile)
    pingTimeout: 20000,    // 20s sans pong = déconnecté
  });
  ioInstance = io;

  /* ── Auth middleware ── */
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
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

    /* ── Join user-specific room (for targeted order/negotiation/notification events) ── */
    void socket.join(`user:${userId}`);

    /* ── Join conversation rooms ── */
    void messagingService.getUserConversations(userId).then((conversations: { id: string }[]) => {
      for (const conv of conversations) {
        void socket.join(`conv:${conv.id}`);
      }
    });

    /* ── Typing indicators (rate-limited) ── */
    socket.on("typing:start", (data: { conversationId: string }) => {
      const now = Date.now();
      const last = typingRates.get(userId) ?? 0;
      if (now - last < TYPING_MIN_INTERVAL_MS) return;
      typingRates.set(userId, now);
      socket.to(`conv:${data.conversationId}`).emit("typing:start", { conversationId: data.conversationId, userId });
    });

    socket.on("typing:stop", (data: { conversationId: string }) => {
      socket.to(`conv:${data.conversationId}`).emit("typing:stop", { conversationId: data.conversationId, userId });
    });

    /* ── Send message via socket ── */
    socket.on("message:send", async (data: { conversationId: string; content?: string; type?: string; mediaUrl?: string; fileName?: string; replyToId?: string }, callback?: (res: unknown) => void) => {
      try {
        // ── Validation des entrées ──
        if (!data || typeof data.conversationId !== "string" || data.conversationId.length < 10 || data.conversationId.length > 50) {
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
              if (s) void s.join(`conv:${data.conversationId}`);
            }
          }
        }

        // Broadcast to all participants in the conversation
        io.to(`conv:${data.conversationId}`).emit("message:new", { message });

        // Push notification only to truly offline recipients (not connected via socket)
        const offlineRecipients = participantIds.filter((pid) => pid !== userId && (onlineUsers.get(pid)?.size ?? 0) === 0);
        if (offlineRecipients.length > 0) {
          const senderProfile = await prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } });
          const senderName = senderProfile?.displayName ?? "Quelqu'un";
          const bodyText = message.type === "TEXT" ? (message.content?.slice(0, 100) ?? "Nouveau message") : message.type === "IMAGE" ? "📷 Photo" : message.type === "AUDIO" ? "🎵 Audio" : message.type === "VIDEO" ? "🎬 Vidéo" : "📎 Fichier";
          void sendPushToUsers(offlineRecipients, {
            title: senderName,
            body: bodyText,
            tag: `msg-${data.conversationId}`,
            data: {
              type: "message",
              conversationId: data.conversationId,
              senderId: userId,
              url: "/messaging",
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

    socket.on("call:initiate", (data: { conversationId: string; targetUserId: string; callType: "audio" | "video" }) => {
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
        void sendPushToUser(data.targetUserId, {
            title: senderName,
            body: `Appel ${data.callType === "video" ? "vidéo" : "audio"} entrant sur Kin-Sell`,
            tag: `call-${data.conversationId}`,
          data: {
            type: "call",
            conversationId: data.conversationId,
            callerId: userId,
            callType: data.callType,
            url: `/messaging?incomingConvId=${data.conversationId}&incomingCallerId=${userId}&incomingCallType=${data.callType}`,
          },
          actions: [
            { action: "accept", title: "Accepter" },
            { action: "reject", title: "Refuser" },
          ],
        });
      })();
    });

    socket.on("call:accept", (data: { conversationId: string; callerId: string }) => {
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

    socket.on("call:reject", (data: { conversationId: string; callerId: string }) => {
      const callerSockets = onlineUsers.get(data.callerId);
      if (callerSockets) {
        for (const sid of callerSockets) {
          io.to(sid).emit("call:rejected", { conversationId: data.conversationId, rejecterId: userId });
        }
      }

      // Update call log → REJECTED
      const logId = activeCallLogs.get(data.conversationId);
      if (logId) {
        void callLogService.updateCallLogStatus(logId, "REJECTED", { endedAt: new Date() }).catch((e) => console.error("[CallLog] reject error", e));
        activeCallLogs.delete(data.conversationId);
      }
    });

    socket.on("call:end", (data: { conversationId: string; targetUserId: string }) => {
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

      // Update call log → set endedAt + compute duration (idempotent)
      const logId = activeCallLogs.get(data.conversationId);
      if (logId) {
        activeCallLogs.delete(data.conversationId);
        void (async () => {
          try {
            await prisma.$transaction(async (tx) => {
              const existing = await tx.callLog.findUnique({ where: { id: logId }, select: { answeredAt: true } });
              const endedAt = new Date();
              const durationSeconds = existing?.answeredAt ? Math.round((endedAt.getTime() - existing.answeredAt.getTime()) / 1000) : undefined;
              await callLogService.updateCallLogStatus(logId, existing?.answeredAt ? "ANSWERED" : "MISSED", { endedAt, durationSeconds });
            });
          } catch (e) { logger.error({ err: e, logId }, "[CallLog] end error"); }
        })();
      }
    });

    /* WebRTC SDP & ICE relay — with input validation */
    const MAX_SDP_SIZE = 10_000; // ~10KB max for SDP

    socket.on("webrtc:offer", (data: { targetUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!data?.sdp || !data.targetUserId || JSON.stringify(data.sdp).length > MAX_SDP_SIZE) return;
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("webrtc:offer", { callerId: userId, sdp: data.sdp });
        }
      }
    });

    socket.on("webrtc:answer", (data: { targetUserId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!data?.sdp || !data.targetUserId || JSON.stringify(data.sdp).length > MAX_SDP_SIZE) return;
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("webrtc:answer", { answererId: userId, sdp: data.sdp });
        }
      }
    });

    // ICE candidate deduplication per target user
    const sentIceCandidates = new Set<string>();
    socket.on("webrtc:ice-candidate", (data: { targetUserId: string; candidate: RTCIceCandidateInit }) => {
      if (!data?.candidate || !data.targetUserId) return;
      // Deduplicate based on candidate string
      const dedupKey = `${data.targetUserId}:${data.candidate.candidate ?? ""}`;
      if (sentIceCandidates.has(dedupKey)) return;
      sentIceCandidates.add(dedupKey);
      // Cap dedup set size to prevent memory leak
      if (sentIceCandidates.size > 200) sentIceCandidates.clear();

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
            onlineUsers.delete(userId);
            onlineVisibility.delete(userId);
            pendingOfflineTimers.delete(userId);

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

