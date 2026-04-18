import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "./AuthProvider";
import { refreshSession } from "../../lib/api-core";

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

  const emitAppState = useCallback((state: "active" | "background", visibility?: "visible" | "hidden") => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit("app:state", {
      state,
      visibility: visibility ?? (typeof document !== "undefined" && document.visibilityState === "hidden" ? "hidden" : "visible"),
      platform: Capacitor.getPlatform(),
    });
  }, []);

  /* ── Connect / disconnect based on auth ── */
  useEffect(() => {
    if (!isLoggedIn) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    // httpOnly cookies are sent automatically with the WebSocket handshake
    // Adapter le WebSocket au type de connexion (économie de data en Afrique)
    const conn = (navigator as any).connection;
    const isSlow = conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g';

    const socket = io(API_BASE, {
      path: "/ws",
      reconnection: true,
      reconnectionAttempts: isSlow ? 10 : 50,
      reconnectionDelay: isSlow ? 3000 : 1000,
      reconnectionDelayMax: isSlow ? 60000 : 30000,
      randomizationFactor: 0.3,
      timeout: 30000,
      reconnectionDelay: isSlow ? 3000 : 1000,
      reconnectionDelayMax: isSlow ? 60000 : 30000,
      randomizationFactor: 0.3,
      timeout: 30000,
      ...(({ withCredentials: true }) as any),
    });

    socketRef.current = socket;
    let wasConnectedBefore = false;
    socket.on("connect", () => {
      const isReconnect = wasConnectedBefore;
      wasConnectedBefore = true;
      setIsConnected(true);
      emitAppState("active");
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
  }, [isLoggedIn, emitAppState]);


  /* ── Reconnexion réseau (offline → online) ── */
  useEffect(() => {
    const handleOnline = () => {
      const s = socketRef.current;
      if (s && s.disconnected) s.connect();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [isLoggedIn]);

  /* ── Disconnect propre sur fermeture d'onglet (web seulement) ── */
  useEffect(() => {
    // Sur native, ne PAS déconnecter sur pagehide — le socket passe en grace period serveur
    if (Capacitor.isNativePlatform()) return;
    const handler = () => { socketRef.current?.disconnect(); };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
    };
  }, []);

  /* ── Web visibility → signaler foreground/background au serveur ── */
  useEffect(() => {
    const handleVisibility = () => {
      if (Capacitor.isNativePlatform()) return;
      emitAppState(document.visibilityState === "hidden" ? "background" : "active");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [emitAppState]);

  /* ── Capacitor appStateChange : reconnexion au retour du background ── */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      const s = socketRef.current;
      if (!s) return;
      if (!isActive) {
        emitAppState("background", "hidden");
        return;
      }
      if (isActive) {
        // App revenue au premier plan → rafraîchir le token AVANT de reconnecter
        // L'accès token (15min TTL) a probablement expiré pendant le background
        void refreshSession().then(() => {
          if (s.disconnected) {
            s.connect();
          } else {
            emitAppState("active", "visible");
          }
          // Dispatcher ks:app-resumed APRÈS un court délai pour que le socket ait le temps
          // de se connecter et que les listeners de call:incoming soient actifs
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("ks:app-resumed"));
          }, 500);
        }).catch(() => {
          // Token refresh a échoué — tenter quand même la reconnexion socket
          // (le serveur refusera peut-être, mais au moins on essaie)
          if (s.disconnected) s.connect();
          else emitAppState("active", "visible");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("ks:app-resumed"));
          }, 500);
        });
      }
    });
    return () => { listener.then(l => l.remove()); };
  }, [isLoggedIn, emitAppState]);

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

