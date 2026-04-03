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

type NotificationKind = "message" | "order" | "negotiation" | "like" | "publication" | "system";

type PushPayloadData = {
  type?: string;
  url?: string;
  conversationId?: string;
  callerId?: string;
  callType?: "audio" | "video";
  orderId?: string;
  negotiationId?: string;
  postId?: string;
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
  kind: NotificationKind;
  title: string;
  content: string;
  icon: string;
  targetUrl: string;
  timestamp: number;
};

function resolveNotificationTarget(data: PushPayloadData): string {
  switch (data.type) {
    case "message":
      return "/messaging";
    case "call":
      return `/messaging?incomingConvId=${data.conversationId ?? ""}&incomingCallerId=${data.callerId ?? ""}&incomingCallType=${data.callType ?? "audio"}`;
    case "order":
      return "/account?tab=commandes";
    case "negotiation":
      return "/account?tab=commandes";
    case "like":
    case "publication":
      return "/sokin";
    default:
      return data.url || "/";
  }
}

function resolveNotificationKind(data: PushPayloadData): NotificationKind {
  if (data.type === "message" || data.type === "order" || data.type === "negotiation" || data.type === "like" || data.type === "publication") {
    return data.type;
  }
  return "system";
}

function resolveNotificationIcon(kind: NotificationKind): string {
  switch (kind) {
    case "message":
      return "💬";
    case "order":
      return "📦";
    case "negotiation":
      return "🤝";
    case "like":
      return "❤️";
    case "publication":
      return "🌍";
    default:
      return "🔔";
  }
}

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

  const navigateInApp = useCallback((targetUrl: string) => {
    if (!targetUrl) return;
    if (/^https?:\/\//i.test(targetUrl)) {
      window.location.href = targetUrl;
      return;
    }
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === targetUrl) return;
    window.history.pushState({}, "", targetUrl);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

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

  const presentIncomingCall = useCallback((data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => {
    if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);

    const showIncomingCall = (callerName: string) => {
      setIncomingCall((prev) => {
        if (prev?.conversationId === data.conversationId && prev?.callerId === data.callerId) {
          return prev;
        }
        return { ...data, callerName };
      });
    };

    void fetch(`${API_BASE}/users/${data.callerId}/public`)
      .then((r) => r.json())
      .then((u: { displayName?: string }) => {
        showIncomingCall(u?.displayName ?? "Quelqu'un");
      })
      .catch(() => showIncomingCall("Quelqu'un"));

    if ("vibrate" in navigator) navigator.vibrate([400, 200, 400, 200, 400]);

    incomingCallTimerRef.current = setTimeout(() => setIncomingCall(null), 45_000);
  }, []);

  /* ── Listen for SW messages (notification clicks) ── */
  useEffect(() => {
    if (!isLoggedIn) return;
    return onServiceWorkerMessage((msg) => {
      const swMsg = msg as { type: string; data?: PushPayloadData; targetUrl?: string; payload?: { title?: string; body?: string; data?: PushPayloadData } };
      if (msg.type === "NOTIFICATION_CLICK" && msg.targetUrl) {
        navigateInApp(msg.targetUrl as string);
        return;
      }
      if (swMsg.type === "CALL_DISMISSED" && swMsg.data?.conversationId) {
        setIncomingCall((prev) => (prev?.conversationId === swMsg.data?.conversationId ? null : prev));
        return;
      }
      if (swMsg.type === "PUSH_RECEIVED" && swMsg.payload?.data?.type) {
        if (swMsg.payload.data.type === "message") {
          return;
        }
        if (swMsg.payload.data.type === "call" && swMsg.payload.data.conversationId && swMsg.payload.data.callerId) {
          presentIncomingCall({
            conversationId: swMsg.payload.data.conversationId,
            callerId: swMsg.payload.data.callerId,
            callType: swMsg.payload.data.callType === "video" ? "video" : "audio",
          });
          return;
        }
        const kind = resolveNotificationKind(swMsg.payload.data);
        const toast: MessageToast = {
          id: `${swMsg.payload.data.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind,
          title: swMsg.payload.title || "Kin-Sell",
          content: swMsg.payload.body || "Nouvelle notification",
          icon: resolveNotificationIcon(kind),
          targetUrl: resolveNotificationTarget(swMsg.payload.data),
          timestamp: Date.now(),
        };
        setToasts((prev) => [toast, ...prev].slice(0, 4));
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 6000);
      }
    });
  }, [isLoggedIn, navigateInApp, presentIncomingCall]);

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

  const acceptGlobalCall = useCallback((preferredCallType?: "audio" | "video") => {
    if (!incomingCall) return;
    if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);
    const { conversationId, callerId, callType } = incomingCall;
    const resolvedCallType = preferredCallType ?? callType;
    setIncomingCall(null);
    if (window.location.pathname.startsWith("/messaging")) {
      window.dispatchEvent(new CustomEvent("ks:incoming-call-accept", { detail: { ...incomingCall, callType: resolvedCallType } }));
      return;
    }
    navigateInApp(`/messaging?callAction=accept&convId=${conversationId}&callerId=${callerId}&callType=${resolvedCallType}`);
  }, [incomingCall, navigateInApp]);

  const rejectGlobalCall = useCallback(() => {
    if (!incomingCall) return;
    if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);
    socketRef.current?.emit("call:reject", {
      conversationId: incomingCall.conversationId,
      callerId: incomingCall.callerId,
    });
    window.dispatchEvent(new CustomEvent("ks:incoming-call-reject", { detail: incomingCall }));
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
        kind: "message",
        title: msg.sender?.profile?.displayName ?? "Nouveau message",
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
        icon: "💬",
        targetUrl: "/messaging",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
    };

    const handleIncomingCall = (data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => {
      presentIncomingCall(data);
    };

    const handleOrderCreated = (data: { type: string; orderId: string; buyerUserId: string; sellerUserId: string; itemsCount?: number; fromNegotiation?: boolean; createdAt: string }) => {
      if (data.buyerUserId === user?.id && !data.fromNegotiation) return; // buyer already knows from checkout
      const isSeller = data.sellerUserId === user?.id;
      const toast: MessageToast = {
        id: `order-created-${data.orderId}-${Date.now()}`,
        kind: "order",
        title: isSeller ? "🛒 Nouvelle commande !" : "✅ Commande créée",
        content: isSeller
          ? `Nouvelle commande de ${data.itemsCount ?? 1} article(s)`
          : data.fromNegotiation ? "Commande créée suite au marchandage accepté" : "Votre commande a été créée",
        icon: "📦",
        targetUrl: "/account?tab=commandes",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      playMessageSound();
    };

    const handleOrderStatusUpdated = (data: { orderId: string; status: string; sourceUserId: string }) => {
      if (data.sourceUserId === user?.id) return;
      const statusLabels: Record<string, string> = { CONFIRMED: "confirmée", PROCESSING: "en traitement", SHIPPED: "expédiée", CANCELED: "annulée" };
      const label = statusLabels[data.status] ?? data.status;
      const toast: MessageToast = {
        id: `order-status-${data.orderId}-${Date.now()}`,
        kind: "order",
        title: `📦 Commande ${label}`,
        content: `Commande #${data.orderId.slice(-6)} — ${label}`,
        icon: "📦",
        targetUrl: "/account?tab=commandes",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      playMessageSound();
    };

    const handleDeliveryConfirmed = (data: { orderId: string; sourceUserId: string }) => {
      if (data.sourceUserId === user?.id) return;
      const toast: MessageToast = {
        id: `order-delivered-${data.orderId}-${Date.now()}`,
        kind: "order",
        title: "✅ Livraison confirmée",
        content: `Commande #${data.orderId.slice(-6)} validée par l'acheteur`,
        icon: "📦",
        targetUrl: "/account?tab=commandes",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      playMessageSound();
    };

    const handleNegotiationUpdated = (data: { action: string; negotiationId: string; sourceUserId: string }) => {
      if (data.sourceUserId === user?.id) return;
      const actionLabels: Record<string, string> = { CREATED: "Nouvelle offre", RESPONDED: "Réponse reçue", CANCELED: "Annulée", JOINED: "Nouveau membre", BUNDLE_CREATED: "Offre lot" };
      const label = actionLabels[data.action] ?? data.action;
      const toast: MessageToast = {
        id: `nego-${data.negotiationId}-${Date.now()}`,
        kind: "negotiation",
        title: "🤝 " + label,
        content: `Marchandage #${data.negotiationId.slice(-6)} — ${label}`,
        icon: "🤝",
        targetUrl: "/account?tab=commandes",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      playMessageSound();
    };

    const handleNegotiationExpired = (data: { negotiationId: string }) => {
      const toast: MessageToast = {
        id: `nego-expired-${data.negotiationId}-${Date.now()}`,
        kind: "negotiation",
        title: "⏰ Marchandage expiré",
        content: `Marchandage #${data.negotiationId.slice(-6)} a expiré`,
        icon: "🤝",
        targetUrl: "/account?tab=commandes",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
    };

    socket.on("message:new", handleNewMessage);
    socket.on("call:incoming", handleIncomingCall);
    socket.on("order:created", handleOrderCreated);
    socket.on("order:status-updated", handleOrderStatusUpdated);
    socket.on("order:delivery-confirmed", handleDeliveryConfirmed);
    socket.on("negotiation:updated", handleNegotiationUpdated);
    socket.on("negotiation:expired", handleNegotiationExpired);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("call:incoming", handleIncomingCall);
      socket.off("order:created", handleOrderCreated);
      socket.off("order:status-updated", handleOrderStatusUpdated);
      socket.off("order:delivery-confirmed", handleDeliveryConfirmed);
      socket.off("negotiation:updated", handleNegotiationUpdated);
      socket.off("negotiation:expired", handleNegotiationExpired);
    };
  }, [isLoggedIn, user?.id, playMessageSound, presentIncomingCall]);

  useEffect(() => {
    return () => {
      if (incomingCallTimerRef.current) {
        clearTimeout(incomingCallTimerRef.current);
      }
    };
  }, []);

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
              <div
                key={toast.id}
                className={`gn-toast gn-toast--${toast.kind}`}
                onClick={() => {
                  navigateInApp(toast.targetUrl);
                  dismissToast(toast.id);
                }}
              >
                <div className="gn-toast-icon">{toast.icon}</div>
                <div className="gn-toast-body">
                  <span className="gn-toast-kind">{toast.kind === "message" ? "Message" : toast.kind === "order" ? "Commande" : toast.kind === "negotiation" ? "Marchandage" : toast.kind === "like" ? "So-Kin" : toast.kind === "publication" ? "Publication" : "Notification"}</span>
                  <strong className="gn-toast-sender">{toast.title}</strong>
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

      {/* ── Incoming call full-screen, mobile-first ── */}
      {incomingCall &&
        createPortal(
          <div className="gn-call-overlay">
            <div className="gn-call-screen">
              <div className="gn-call-screen-top">
                <p className="gn-toast-kind">Appel entrant</p>
                <p className="gn-call-label">
                  {incomingCall.callType === "video" ? "📹 Appel vidéo" : "📞 Appel audio"}
                </p>
              </div>

              <div className="gn-ringtone-pulse" aria-hidden="true">
                <div className="gn-ringtone-dot" />
                <div className="gn-ringtone-dot" />
                <div className="gn-ringtone-dot" />
              </div>

              <div className="gn-call-caller-block">
                <div className="gn-call-caller-avatar">{incomingCall.callerName.slice(0, 1).toUpperCase()}</div>
                <strong className="gn-call-caller-name">{incomingCall.callerName}</strong>
                <span className="gn-call-caller-subtitle">Kin-Sell</span>
              </div>

              <div className="gn-call-actions">
                <button className="gn-call-btn gn-call-btn--reject" onClick={rejectGlobalCall}>
                  Refuser
                </button>

                <button className="gn-call-btn gn-call-btn--accept" onClick={() => acceptGlobalCall(incomingCall.callType)}>
                  Répondre
                </button>

                {incomingCall.callType === "video" ? (
                  <button className="gn-call-btn gn-call-btn--audio" onClick={() => acceptGlobalCall("audio")}>
                    Audio seulement
                  </button>
                ) : null}
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
