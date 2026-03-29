import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type { MessageType, Role } from "@prisma/client";
import { analyzeMessage } from "../message-guard/message-guard.service.js";

/* ── Conversations ── */

export async function getOrCreateDMConversation(userIdA: string, userIdB: string) {
  if (userIdA === userIdB) throw new HttpError(400, "Impossible de démarrer une conversation avec soi-même.");

  // Find existing DM between these two users
  const existing = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { participants: { some: { userId: userIdA } } },
        { participants: { some: { userId: userIdB } } },
      ],
    },
    include: {
      participants: { include: { user: { select: { id: true, role: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { id: true, profile: { select: { displayName: true } } } } } },
    },
  });

  if (existing) return { ...existing, messages: existing.messages ?? [], unreadCount: 0 };

  // Verify both users exist
  const users = await prisma.user.findMany({ where: { id: { in: [userIdA, userIdB] } } });
  if (users.length !== 2) throw new HttpError(404, "Utilisateur introuvable.");

  const conv = await prisma.conversation.create({
    data: {
      isGroup: false,
      participants: {
        create: [{ userId: userIdA }, { userId: userIdB }],
      },
    },
    include: {
      participants: { include: { user: { select: { id: true, role: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { id: true, profile: { select: { displayName: true } } } } } },
    },
  });
  return { ...conv, unreadCount: 0 };
}

export async function createGroupConversation(creatorId: string, memberIds: string[], groupName: string) {
  const allIds = [...new Set([creatorId, ...memberIds])];
  if (allIds.length < 2) throw new HttpError(400, "Un groupe doit contenir au moins 2 membres.");

  const users = await prisma.user.findMany({ where: { id: { in: allIds } } });
  if (users.length !== allIds.length) throw new HttpError(404, "Certains utilisateurs introuvables.");

  const conv = await prisma.conversation.create({
    data: {
      isGroup: true,
      groupName,
      participants: {
        create: allIds.map((uid) => ({ userId: uid, isAdmin: uid === creatorId })),
      },
    },
    include: {
      participants: { include: { user: { select: { id: true, role: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { id: true, profile: { select: { displayName: true } } } } } },
    },
  });
  return { ...conv, unreadCount: 0 };
}

export async function getUserConversations(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: {
        include: { user: { select: { id: true, role: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { id: true, profile: { select: { displayName: true } } } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Compute unread counts
  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const participant = conv.participants.find((p) => p.userId === userId);
      const lastReadAt = participant?.lastReadAt ?? new Date(0);
      const unreadCount = await prisma.message.count({
        where: { conversationId: conv.id, createdAt: { gt: lastReadAt }, senderId: { not: userId } },
      });
      return { ...conv, unreadCount };
    })
  );

  return enriched;
}

/* ── Messages ── */

export async function getMessages(conversationId: string, userId: string, cursor?: string, limit = 50) {
  // Verify participant
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) throw new HttpError(403, "Vous ne faites pas partie de cette conversation.");

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      sender: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } },
      replyTo: {
        select: { id: true, content: true, type: true, sender: { select: { profile: { select: { displayName: true } } } } },
      },
      readReceipts: { select: { userId: true, readAt: true } },
    },
  });

  return messages.reverse(); // chronological order
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  data: { content?: string; type?: MessageType; mediaUrl?: string; fileName?: string; replyToId?: string }
) {
  // Verify participant
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: senderId } },
  });
  if (!participant) throw new HttpError(403, "Vous ne faites pas partie de cette conversation.");

  // Block non-admin from sending messages in DMs with admins
  const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { role: true } });
  const isAdminSender = sender?.role === "ADMIN" || sender?.role === "SUPER_ADMIN";
  if (!isAdminSender) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isGroup: true, participants: { select: { userId: true, user: { select: { role: true } } } } },
    });
    if (conv && !conv.isGroup) {
      const otherParticipant = conv.participants.find((p) => p.userId !== senderId);
      if (otherParticipant && (otherParticipant.user.role === "ADMIN" || otherParticipant.user.role === "SUPER_ADMIN")) {
        throw new HttpError(403, "Vous ne pouvez pas répondre aux messages d'un administrateur.");
      }
    }
  }

  // ═══ Message Guard AI — analyse avant envoi ═══
  if (data.content && data.type !== "SYSTEM") {
    const guardResult = await analyzeMessage(senderId, conversationId, data.content);
    if (!guardResult.allowed) {
      throw new HttpError(403, guardResult.warningMessage ?? "🔒 Message bloqué par le système de sécurité Kin-Sell.");
    }
    // Si averti, on laisse passer mais le warning sera retourné au client
    if (guardResult.verdict === "WARNED" && guardResult.warningMessage) {
      // On attache le warning dans les metadata du message (le frontend l'affichera)
      (data as any)._guardWarning = guardResult.warningMessage;
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      type: data.type ?? "TEXT",
      content: data.content ?? null,
      mediaUrl: data.mediaUrl ?? null,
      fileName: data.fileName ?? null,
      replyToId: data.replyToId ?? null,
    },
    include: {
      sender: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } },
      replyTo: {
        select: { id: true, content: true, type: true, sender: { select: { profile: { select: { displayName: true } } } } },
      },
      readReceipts: { select: { userId: true, readAt: true } },
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  // Attacher le warning MessageGuard si présent
  const guardWarning = (data as any)._guardWarning;
  if (guardWarning) {
    return { ...message, _guardWarning: guardWarning };
  }

  return message;
}

export async function editMessage(messageId: string, userId: string, newContent: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw new HttpError(404, "Message introuvable.");
  if (message.senderId !== userId) throw new HttpError(403, "Vous ne pouvez modifier que vos propres messages.");
  if (message.type !== "TEXT") throw new HttpError(400, "Seuls les messages texte peuvent être modifiés.");

  return prisma.message.update({
    where: { id: messageId },
    data: { content: newContent, isEdited: true },
    include: {
      sender: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } },
      readReceipts: { select: { userId: true, readAt: true } },
    },
  });
}

export async function deleteMessage(messageId: string, userId: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw new HttpError(404, "Message introuvable.");
  if (message.senderId !== userId) throw new HttpError(403, "Vous ne pouvez supprimer que vos propres messages.");

  return prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true, content: null, mediaUrl: null },
  });
}

export async function markConversationRead(conversationId: string, userId: string) {
  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });

  // Create read receipts for unread messages
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (participant) {
    const unreadMessages = await prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readReceipts: { none: { userId } },
      },
      select: { id: true },
    });

    if (unreadMessages.length > 0) {
      await prisma.messageReadReceipt.createMany({
        data: unreadMessages.map((m) => ({ messageId: m.id, userId })),
        skipDuplicates: true,
      });
    }
  }
}

export async function searchUsers(query: string, currentUserId: string, limit = 20) {
  return prisma.user.findMany({
    where: {
      id: { not: currentUserId },
      accountStatus: "ACTIVE",
      OR: [
        { profile: { displayName: { contains: query, mode: "insensitive" } } },
        { profile: { username: { contains: query, mode: "insensitive" } } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      profile: { select: { displayName: true, avatarUrl: true, username: true, city: true } },
    },
    take: limit,
  });
}

export async function getConversationParticipantIds(conversationId: string): Promise<string[]> {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return participants.map((p) => p.userId);
}
