import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { verifyAccessToken } from "../../shared/auth/jwt.js";
import * as messagingService from "./messaging.service.js";
import * as callLogService from "./call-log.service.js";
import { sendPushToUser, sendPushToUsers } from "../notifications/push.service.js";
import { prisma } from "../../shared/db/prisma.js";

/** userId → Set<socketId> (one user can have multiple tabs) */
const onlineUsers = new Map<string, Set<string>>();
/** userId → true si le statut en ligne est visible aux autres */
const onlineVisibility = new Map<string, boolean>();

/** conversationId → active call log ID (tracks in-progress calls) */
const activeCallLogs = new Map<string, string>();

export function setupSocketServer(httpServer: HttpServer, corsOrigin: string) {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    path: "/ws",
    transports: ["websocket", "polling"],
  });

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
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId)!.add(socket.id);

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

      if (isVisible) {
        io.emit("user:online", { userId });
      }
    })();

    /* ── Join conversation rooms ── */
    void messagingService.getUserConversations(userId).then((conversations: { id: string }[]) => {
      for (const conv of conversations) {
        void socket.join(`conv:${conv.id}`);
      }
    });

    /* ── Typing indicators ── */
    socket.on("typing:start", (data: { conversationId: string }) => {
      socket.to(`conv:${data.conversationId}`).emit("typing:start", { conversationId: data.conversationId, userId });
    });

    socket.on("typing:stop", (data: { conversationId: string }) => {
      socket.to(`conv:${data.conversationId}`).emit("typing:stop", { conversationId: data.conversationId, userId });
    });

    /* ── Send message via socket ── */
    socket.on("message:send", async (data: { conversationId: string; content?: string; type?: string; mediaUrl?: string; fileName?: string; replyToId?: string }, callback?: (res: unknown) => void) => {
      try {
        const message = await messagingService.sendMessage(data.conversationId, userId, {
          content: data.content,
          type: (data.type ?? "TEXT") as "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | "FILE",
          mediaUrl: data.mediaUrl,
          fileName: data.fileName,
          replyToId: data.replyToId,
        });

        // Broadcast to all participants in the conversation
        io.to(`conv:${data.conversationId}`).emit("message:new", { message });

        // Make sure all participants are in the room
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

        // Push notification to all recipients (offline detection can be stale on mobile)
        const recipients = participantIds.filter((pid) => pid !== userId);
        if (recipients.length > 0) {
          const senderProfile = await prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } });
          const senderName = senderProfile?.displayName ?? "Quelqu'un";
          const bodyText = message.type === "TEXT" ? (message.content?.slice(0, 100) ?? "Nouveau message") : message.type === "IMAGE" ? "📷 Photo" : message.type === "AUDIO" ? "🎵 Audio" : message.type === "VIDEO" ? "🎬 Vidéo" : "📎 Fichier";
          void sendPushToUsers(recipients, {
            title: senderName,
            body: bodyText,
            tag: `msg-${data.conversationId}`,
            data: { type: "message", conversationId: data.conversationId, senderId: userId },
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
          title: `📞 Appel ${data.callType === "video" ? "vidéo" : "audio"}`,
          body: `${senderName} vous appelle`,
          tag: "call",
          data: { type: "call", conversationId: data.conversationId, callerId: userId, callType: data.callType },
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
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("call:ended", { conversationId: data.conversationId, enderId: userId });
        }
      }

      // Update call log → set endedAt + compute duration
      const logId = activeCallLogs.get(data.conversationId);
      if (logId) {
        void (async () => {
          try {
            const existing = await prisma.callLog.findUnique({ where: { id: logId }, select: { answeredAt: true } });
            const endedAt = new Date();
            const durationSeconds = existing?.answeredAt ? Math.round((endedAt.getTime() - existing.answeredAt.getTime()) / 1000) : undefined;
            await callLogService.updateCallLogStatus(logId, existing?.answeredAt ? "ANSWERED" : "MISSED", { endedAt, durationSeconds });
          } catch (e) { console.error("[CallLog] end error", e); }
          activeCallLogs.delete(data.conversationId);
        })();
      }
    });

    /* WebRTC SDP & ICE relay */
    socket.on("webrtc:offer", (data: { targetUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("webrtc:offer", { callerId: userId, sdp: data.sdp });
        }
      }
    });

    socket.on("webrtc:answer", (data: { targetUserId: string; sdp: RTCSessionDescriptionInit }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("webrtc:answer", { answererId: userId, sdp: data.sdp });
        }
      }
    });

    socket.on("webrtc:ice-candidate", (data: { targetUserId: string; candidate: RTCIceCandidateInit }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit("webrtc:ice-candidate", { fromUserId: userId, candidate: data.candidate });
        }
      }
    });

    /* ── Disconnect ── */
    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          const wasVisible = onlineVisibility.get(userId) ?? true;
          onlineUsers.delete(userId);
          onlineVisibility.delete(userId);
          const lastSeenAt = new Date();
          // Persist lastSeenAt (respect privacy: only if status was visible)
          void prisma.userProfile.updateMany({
            where: { userId },
            data: { lastSeenAt },
          }).catch(() => {});
          if (wasVisible) {
            io.emit("user:offline", { userId, lastSeenAt: lastSeenAt.toISOString() });
          }
        }
      }
    });
  });

  return io;
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys()).filter((id) => onlineVisibility.get(id) ?? true);
}
