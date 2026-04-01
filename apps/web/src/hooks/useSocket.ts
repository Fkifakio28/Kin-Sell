import { useEffect, useRef, useCallback, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getToken, type ChatMessage } from "../lib/api-client";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

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
  "webrtc:offer": (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:answer": (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => void;
  "webrtc:ice-candidate": (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => void;
};

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(...args: unknown[]) => void>>>(new Map());

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io(API_BASE, {
      path: "/ws",
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, []);

  const emit = useCallback(
    (event: string, data?: unknown, callback?: (res: unknown) => void) => {
      socketRef.current?.emit(event, data, callback);
    },
    []
  );

  const on = useCallback(
    <K extends keyof SocketEvents>(event: K, handler: SocketEvents[K]) => {
      socketRef.current?.on(event as string, handler as (...args: unknown[]) => void);
      if (!listenersRef.current.has(event)) listenersRef.current.set(event, new Set());
      listenersRef.current.get(event)!.add(handler as (...args: unknown[]) => void);
    },
    []
  );

  const off = useCallback(
    <K extends keyof SocketEvents>(event: K, handler: SocketEvents[K]) => {
      socketRef.current?.off(event as string, handler as (...args: unknown[]) => void);
      listenersRef.current.get(event)?.delete(handler as (...args: unknown[]) => void);
    },
    []
  );

  return { socket: socketRef, emit, on, off, isConnected };
}
