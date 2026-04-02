import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./AuthProvider";
import { getToken } from "../../lib/api-client";
import { isPushSupported, subscribeToPush, onServiceWorkerMessage, registerServiceWorker } from "../../utils/push-notifications";
import "../../styles/global-notifications.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const PUSH_BANNER_DISMISSED_AT_KEY = "kinsell.push.banner.dismissedAt";
const PUSH_BANNER_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

  /* ── Incoming call overlay (intercepted when NOT on /messaging) ── */
  const [incomingCall, setIncomingCall] = useState<{
    conversationId: string;
    callerId: string;
    callerName: string;
    callType: "audio" | "video";
  } | null>(null);
  const incomingCallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (!ok) pushSubscribedRef.current = false;
      });
      setShowPushBanner(false);
    } else if (Notification.permission === "default") {
      const dismissedAtRaw = localStorage.getItem(PUSH_BANNER_DISMISSED_AT_KEY);
      const dismissedAt = dismissedAtRaw ? Number(dismissedAtRaw) : 0;
      const canShowBanner = !dismissedAt || Number.isNaN(dismissedAt) || Date.now() - dismissedAt > PUSH_BANNER_DISMISS_TTL_MS;
      if (!canShowBanner) return;

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
    if (ok) {
      localStorage.removeItem(PUSH_BANNER_DISMISSED_AT_KEY);
    }
    return ok;
  }, []);

  const dismissPushBanner = useCallback(() => {
    setShowPushBanner(false);
    localStorage.setItem(PUSH_BANNER_DISMISSED_AT_KEY, String(Date.now()));
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

  const acceptGlobalCall = useCallback(() => {
    if (!incomingCall) return;
    if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);
    const { conversationId, callerId, callType } = incomingCall;
    setIncomingCall(null);
    window.location.href = `/messaging?incomingConvId=${conversationId}&incomingCallerId=${callerId}&incomingCallType=${callType}`;
  }, [incomingCall]);

  const rejectGlobalCall = useCallback(() => {
    if (!incomingCall) return;
    if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);
    socketRef.current?.emit("call:reject", {
      conversationId: incomingCall.conversationId,
      callerId: incomingCall.callerId,
    });
    setIncomingCall(null);
  }, [incomingCall]);

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

    const handleIncomingCall = (data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => {
      // Let MessagingPage handle it if already on that page
      if (window.location.pathname.startsWith("/messaging")) return;

      if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);

      void fetch(`${API_BASE}/users/${data.callerId}/public`)
        .then((r) => r.json())
        .then((u: { displayName?: string }) => {
          setIncomingCall({ ...data, callerName: u?.displayName ?? "Quelqu'un" });
        })
        .catch(() => setIncomingCall({ ...data, callerName: "Quelqu'un" }));

      if ("vibrate" in navigator) navigator.vibrate([400, 200, 400, 200, 400]);

      incomingCallTimerRef.current = setTimeout(() => setIncomingCall(null), 45_000);
    };

    socket.on("message:new", handleNewMessage);
    socket.on("call:incoming", handleIncomingCall);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("call:incoming", handleIncomingCall);
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

      {/* ── Incoming call overlay (any page except /messaging) ── */}
      {incomingCall &&
        createPortal(
          <div className="gn-call-overlay">
            <div className="gn-call-dialog">
              <div className="gn-ringtone-pulse">
                <div className="gn-ringtone-dot" />
                <div className="gn-ringtone-dot" />
                <div className="gn-ringtone-dot" />
              </div>
              <p className="gn-call-label">
                {incomingCall.callType === "video" ? "📹 " : "📞 "}
                <strong>{incomingCall.callerName}</strong> vous appelle
              </p>
              <div className="gn-call-actions">
                <button className="gn-call-btn gn-call-btn--accept" onClick={acceptGlobalCall}>
                  Répondre
                </button>
                <button className="gn-call-btn gn-call-btn--reject" onClick={rejectGlobalCall}>
                  Refuser
                </button>
              </div>
            </div>
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
