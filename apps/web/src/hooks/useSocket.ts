import { useCallback } from "react";
import { useSocketContext } from "../app/providers/SocketProvider";
import type { ChatMessage } from "../lib/api-client";

type SocketEvents = {
  "message:new": (data: { message: ChatMessage }) => void;
  "message:edited": (data: { message: ChatMessage }) => void;
  "message:deleted": (data: { messageId: string; conversationId: string }) => void;
  "typing:start": (data: { conversationId: string; userId: string }) => void;
  "typing:stop": (data: { conversationId: string; userId: string }) => void;
  "conversation:read": (data: { conversationId: string; userId: string }) => void;
  "presence:snapshot": (data: { userIds: string[] }) => void;
  "user:online": (data: { userId: string }) => void;
  "user:offline": (data: { userId: string }) => void;
  "call:incoming": (data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => void;
  "call:accepted": (data: { conversationId: string; accepterId: string }) => void;
  "call:rejected": (data: { conversationId: string; rejecterId: string }) => void;
  "call:ended": (data: { conversationId: string; enderId: string }) => void;
  "order:created": (data: {
    type: "ORDER_CREATED";
    orderId: string;
    buyerUserId: string;
    sellerUserId: string;
    itemsCount: number;
    totalUsdCents: number;
    fromNegotiation?: boolean;
    negotiationId?: string;
    createdAt: string;
  }) => void;
  "order:status-updated": (data: {
    type: "ORDER_STATUS_UPDATED";
    orderId: string;
    status: string;
    buyerUserId: string;
    sellerUserId: string;
    sourceUserId: string;
    updatedAt: string;
  }) => void;
  "order:delivery-confirmed": (data: {
    type: "ORDER_CONFIRMATION_COMPLETED";
    orderId: string;
    status: "DELIVERED" | string;
    buyerUserId: string;
    sellerUserId: string;
    sourceUserId: string;
    updatedAt: string;
  }) => void;
  "negotiation:updated": (data: {
    type: "NEGOTIATION_UPDATED";
    action: "CREATED" | "RESPONDED" | "CANCELED" | "JOINED" | "BUNDLE_CREATED";
    negotiationId: string;
    buyerUserId: string;
    sellerUserId: string;
    sourceUserId: string;
    updatedAt: string;
  }) => void;
  "negotiation:expired": (data: {
    type: "NEGOTIATION_EXPIRED";
    negotiationId: string;
    buyerUserId: string;
    sellerUserId: string;
    expiredAt: string;
  }) => void;
  "sokin:post-created": (data: {
    type: "SOKIN_POST_CREATED";
    postId: string;
    authorId: string;
    createdAt: string;
    sourceUserId: string;
  }) => void;
  "webrtc:offer": (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => void;

  /* ── Live streaming events ── */
  "live:viewer-joined": (data: { liveId: string; userId: string; displayName: string; avatarUrl: string | null; viewerCount: number }) => void;
  "live:viewer-left": (data: { liveId: string; userId: string; viewerCount: number }) => void;
  "live:chat:new": (data: { id: string; liveId: string; userId: string; text: string; isGift: boolean; giftType: string | null; isPinned: boolean; createdAt: string; user: { profile: { displayName: string; avatarUrl: string | null } } }) => void;
  "live:liked": (data: { liveId: string; userId: string; likesCount: number }) => void;
  "live:started": (data: { liveId: string; hostId: string }) => void;
  "live:ended": (data: { liveId: string; hostId: string }) => void;
  "live:webrtc:offer": (data: { liveId: string; hostId: string; sdp: RTCSessionDescriptionInit }) => void;
  "live:webrtc:answer": (data: { liveId: string; viewerId: string; sdp: RTCSessionDescriptionInit }) => void;
  "live:webrtc:ice-candidate": (data: { liveId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => void;
};

/**
 * Shared socket hook — uses the singleton from SocketProvider.
 * No duplicate connections: all components share this single socket.
 */
export function useSocket() {
  const { socketRef, isConnected, emit: rawEmit, on: rawOn, off: rawOff } = useSocketContext();

  const emit = useCallback(
    (event: string, data?: unknown, callback?: (res: unknown) => void) => {
      rawEmit(event, data, callback);
    },
    [rawEmit],
  );

  const on = useCallback(
    <K extends keyof SocketEvents>(event: K, handler: SocketEvents[K]) => {
      rawOn(event as string, handler as (...args: unknown[]) => void);
    },
    [rawOn],
  );

  const off = useCallback(
    <K extends keyof SocketEvents>(event: K, handler: SocketEvents[K]) => {
      rawOff(event as string, handler as (...args: unknown[]) => void);
    },
    [rawOff],
  );

  return { socket: socketRef, emit, on, off, isConnected };
}
