import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./AuthProvider";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/* ── Context shape (same API as old useSocket hook) ── */
type SocketContextValue = {
  socketRef: React.RefObject<Socket | null>;
  isConnected: boolean;
  emit: (event: string, data?: unknown, callback?: (res: unknown) => void) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
};

const SocketContext = createContext<SocketContextValue | null>(null);

/* ── Provider — single WebSocket connection for the entire app ── */
export function SocketProvider({ children }: { children: ReactNode }) {
  const { isLoggedIn } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  /* ── Connect / disconnect based on auth ── */
  useEffect(() => {
    if (!isLoggedIn) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    // httpOnly cookies are sent automatically with the WebSocket handshake
    const socket = io(API_BASE, {
      path: "/ws",
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.15,
      // Send cookies for httpOnly auth (withCredentials is runtime-supported)
      ...(({ withCredentials: true }) as any),
    });

    socketRef.current = socket;
    let wasConnectedBefore = false;
    socket.on("connect", () => {
      const isReconnect = wasConnectedBefore;
      wasConnectedBefore = true;
      setIsConnected(true);
      if (isReconnect) {
        window.dispatchEvent(new CustomEvent("ks:socket-reconnected"));
      }
    });
    socket.on("disconnect", () => setIsConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [isLoggedIn]);

  /* ── Visibility-based socket pause (économie batterie mobile) ── */
  useEffect(() => {
    const handleVisibility = () => {
      const s = socketRef.current;
      if (!s) return;
      if (document.visibilityState === "hidden") {
        (s as any).__visPauseTimer = setTimeout(() => {
          if (document.visibilityState === "hidden") s.disconnect();
        }, 60_000);
      } else {
        clearTimeout((s as any).__visPauseTimer);
        if (s.disconnected) s.connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLoggedIn]);

  /* ── Reconnexion réseau (offline → online) ── */
  useEffect(() => {
    const handleOnline = () => {
      const s = socketRef.current;
      if (s && s.disconnected) s.connect();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isLoggedIn]);

  /* ── Disconnect propre sur fermeture d'onglet ── */
  useEffect(() => {
    const handler = () => { socketRef.current?.disconnect(); };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
    };
  }, []);

  /* ── Stable helpers ── */
  const emit = useCallback(
    (event: string, data?: unknown, callback?: (res: unknown) => void) => {
      socketRef.current?.emit(event, data, callback);
    },
    [],
  );

  const on = useCallback(
    (event: string, handler: (...args: any[]) => void) => {
      socketRef.current?.on(event, handler);
    },
    [],
  );

  const off = useCallback(
    (event: string, handler: (...args: any[]) => void) => {
      socketRef.current?.off(event, handler);
    },
    [],
  );

  const value = useMemo<SocketContextValue>(
    () => ({ socketRef, isConnected, emit, on, off }),
    [isConnected, emit, on, off],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocketContext() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocketContext must be used within SocketProvider");
  return ctx;
}
