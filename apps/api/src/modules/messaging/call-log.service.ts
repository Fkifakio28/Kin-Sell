import { prisma } from "../../shared/db/prisma.js";
import type { CallType, CallStatus } from "@prisma/client";

export async function createCallLog(data: {
  conversationId: string;
  callerUserId: string;
  receiverUserId: string;
  callType: CallType;
}) {
  return prisma.callLog.create({
    data: {
      conversationId: data.conversationId,
      callerUserId: data.callerUserId,
      receiverUserId: data.receiverUserId,
      callType: data.callType,
      status: "MISSED",
    },
  });
}

export async function updateCallLogStatus(
  id: string,
  status: CallStatus,
  extra?: { answeredAt?: Date; endedAt?: Date; durationSeconds?: number },
) {
  return prisma.callLog.update({
    where: { id },
    data: { status, ...extra },
  });
}

export async function getUserCallLogs(userId: string, cursor?: string, limit = 40) {
  const logs = await prisma.callLog.findMany({
    where: {
      OR: [{ callerUserId: userId }, { receiverUserId: userId }],
    },
    orderBy: { startedAt: "desc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      caller: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } },
      receiver: { select: { id: true, profile: { select: { displayName: true, avatarUrl: true, username: true } } } },
    },
  });
  return logs;
}
