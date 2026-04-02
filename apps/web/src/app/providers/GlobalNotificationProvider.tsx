import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./AuthProvider";
import { getToken } from "../../lib/api-client";
import { isPushSupported, subscribeToPush, onServiceWorkerMessage, registerServiceWorker } from "../../utils/push-notifications";
import "../../styles/global-notifications.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/* ── Context ── */
type GlobalNotifContextValue = {
  messagingActive: boolean;
  setMessagingActive: (v: boolean) => void;
  pushEnabled: boolean;
  requestPushPermission: () => Promise<boolean>;
};

const GlobalNotifContext = createContext<GlobalNotifContextValue>({
  messagingActive: false,
  setMessagingActive: () => {},
  pushEnabled: false,
  requestPushPermission: async () => false,
});

export function useGlobalNotification() {
  return useContext(GlobalNotifContext);
}

/* ── Types ── */
type MessageToast = {
  id: string;
  senderName: string;
  content: string;
  timestamp: number;
};

/* ── Provider ── */
export function GlobalNotificationProvider({ children }: { children: ReactNode }) {
  const { user, isLoggedIn } = useAuth();
  const [messagingActive, setMessagingActive] = useState(false);
  const messagingActiveRef = useRef(false);

  /* ── Socket (own connection, independent of DashboardMessaging) ── */
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }
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

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    messagingActiveRef.current = messagingActive;
  }, [messagingActive]);

  /* ── Message toasts ── */
  const [toasts, setToasts] = useState<MessageToast[]>([]);

  /* ── Push notification state ── */
  const [pushEnabled, setPushEnabled] = useState(false);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const pushSubscribedRef = useRef(false);

  /* ── Register SW + auto-subscribe to push on login ── */
  useEffect(() => {
    if (!isLoggedIn) {
      pushSubscribedRef.current = false;
      setPushEnabled(false);
      return;
    }
    if (!isLoggedIn || !isPushSupported()) return;
    if (pushSubscribedRef.current) return;
    pushSubscribedRef.current = true;

    void registerServiceWorker();

    // Auto-subscribe if permission already granted
    if (Notification.permission === "granted") {
      void subscribeToPush().then((ok) => {
        setPushEnabled(ok);
        if (!ok) {
          pushSubscribedRef.current = false;
          setShowPushBanner(true);
        }
      });
    } else if (Notification.permission === "default") {
      // Show banner after a short delay
      const timer = setTimeout(() => setShowPushBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!isPushSupported()) return;
    if (Notification.permission !== "granted") return;
    if (pushEnabled) return;

    const timer = setInterval(() => {
      void subscribeToPush().then((ok) => setPushEnabled(ok));
    }, 30000);

    return () => clearInterval(timer);
  }, [isLoggedIn, pushEnabled]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!isPushSupported()) return;

    const retrySubscribe = () => {
      if (Notification.permission !== "granted") return;
      if (pushEnabled) return;
      void subscribeToPush().then((ok) => setPushEnabled(ok));
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") retrySubscribe();
    };

    window.addEventListener("online", retrySubscribe);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", retrySubscribe);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isLoggedIn, pushEnabled]);

  /* ── Listen for SW messages (notification clicks) ── */
  useEffect(() => {
    if (!isLoggedIn) return;
    return onServiceWorkerMessage((msg) => {
      if (msg.type === "NOTIFICATION_CLICK" && msg.targetUrl) {
        window.location.href = msg.targetUrl as string;
      }
    });
  }, [isLoggedIn]);

  const requestPushPermission = useCallback(async () => {
    const ok = await subscribeToPush();
    setPushEnabled(ok);
    setShowPushBanner(false);
    return ok;
  }, []);

  const dismissPushBanner = useCallback(() => {
    setShowPushBanner(false);
  }, []);

  /* ── Notification sound for messages ── */
  const playMessageSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      setTimeout(() => ctx.close(), 400);
    } catch {}
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  /* ── Socket event listeners ── */
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !isLoggedIn) return;

    const handleNewMessage = (data: {
      message: {
        id: string;
        senderId: string;
        content: string | null;
        sender: { profile: { displayName: string } };
        type: string;
      };
    }) => {
      if (messagingActiveRef.current) return;
      const msg = data.message;
      if (msg.senderId === user?.id) return;

      playMessageSound();

      const toast: MessageToast = {
        id: msg.id + "-" + Date.now(),
        senderName: msg.sender?.profile?.displayName ?? "Nouveau message",
        content:
          msg.type === "TEXT"
            ? (msg.content?.slice(0, 80) ?? "")
            : msg.type === "IMAGE"
              ? "📷 Photo"
              : msg.type === "AUDIO"
                ? "🎵 Audio"
                : msg.type === "VIDEO"
                  ? "🎬 Vidéo"
                  : "📎 Fichier",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 5));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 5000);
    };

    socket.on("message:new", handleNewMessage);

    return () => {
      socket.off("message:new", handleNewMessage);
    };
  }, [isLoggedIn, user?.id, playMessageSound]);

  /* ── Context value ── */
  const ctxValue = useMemo(
    () => ({ messagingActive, setMessagingActive, pushEnabled, requestPushPermission }),
    [messagingActive, pushEnabled, requestPushPermission],
  );

  return (
    <GlobalNotifContext.Provider value={ctxValue}>
      {children}

      {/* ── Message toasts (portal) ── */}
      {toasts.length > 0 &&
        createPortal(
          <div className="gn-toast-container">
            {toasts.map((toast) => (
              <div key={toast.id} className="gn-toast" onClick={() => dismissToast(toast.id)}>
                <div className="gn-toast-icon">💬</div>
                <div className="gn-toast-body">
                  <strong className="gn-toast-sender">{toast.senderName}</strong>
                  <p className="gn-toast-content">{toast.content}</p>
                </div>
                <button
                  className="gn-toast-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissToast(toast.id);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}

      {/* ── Push permission banner (portal) ── */}
      {showPushBanner &&
        isLoggedIn &&
        createPortal(
          <div className="gn-push-banner">
            <div className="gn-push-banner-icon">🔔</div>
            <div className="gn-push-banner-text">
              <strong>Restez informé !</strong>
              <p>Activez les notifications pour recevoir les appels, messages et mises à jour même en dehors de l'appli.</p>
            </div>
            <div className="gn-push-banner-actions">
              <button className="gn-push-banner-btn gn-push-banner-btn--accept" onClick={() => void requestPushPermission()}>
                Activer
              </button>
              <button className="gn-push-banner-btn gn-push-banner-btn--dismiss" onClick={dismissPushBanner}>
                Plus tard
              </button>
            </div>
          </div>,
          document.body,
        )}
    </GlobalNotifContext.Provider>
  );
}
