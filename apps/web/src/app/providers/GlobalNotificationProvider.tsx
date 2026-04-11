import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider";
import { useSocketContext } from "./SocketProvider";
import { playCallSound, stopCallSound, refreshCallSoundIfNeeded } from "../../utils/call-sound";
import "../../styles/global-notifications.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/* ── Context ── */
export type MissedNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  content: string;
  icon: string;
  targetUrl: string;
  timestamp: number;
};

type GlobalNotifContextValue = {
  messagingActive: boolean;
  setMessagingActive: (v: boolean) => void;
  pushEnabled: boolean;
  requestPushPermission: () => Promise<boolean>;
  missedNotifications: MissedNotification[];
  missedCount: number;
  markSeen: (id: string) => void;
  markAllSeen: () => void;
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
  missedNotifications: [],
  missedCount: 0,
  markSeen: () => {},
  markAllSeen: () => {},
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
    case "sokin":
      return "/sokin";
    default:
      return data.url || "/";
  }
}

function resolveNotificationKind(data: PushPayloadData): NotificationKind {
  if (data.type === "message" || data.type === "order" || data.type === "negotiation" || data.type === "like" || data.type === "publication") {
    return data.type;
  }
  if (data.type === "sokin") return "publication";
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

  /* ── Missed notifications (persisted) ── */
  const MISSED_KEY = "ks-missed-notifs";
  const MAX_MISSED = 50;

  const [missedNotifications, setMissedNotifications] = useState<MissedNotification[]>(() => {
    try {
      const raw = localStorage.getItem(MISSED_KEY);
      return raw ? (JSON.parse(raw) as MissedNotification[]).slice(0, MAX_MISSED) : [];
    } catch { return []; }
  });

  const missedCount = missedNotifications.length;

  // Persist whenever missedNotifications changes
  useEffect(() => {
    try { localStorage.setItem(MISSED_KEY, JSON.stringify(missedNotifications)); } catch {}
  }, [missedNotifications]);

  const pushMissed = useCallback((notif: Omit<MissedNotification, "id" | "timestamp">, dedupeKey?: string) => {
    const id = dedupeKey ?? `${notif.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setMissedNotifications((prev) => {
      if (prev.some((n) => n.id === id)) return prev;
      return [{ ...notif, id, timestamp: Date.now() }, ...prev].slice(0, MAX_MISSED);
    });
  }, []);

  const markSeen = useCallback((id: string) => {
    setMissedNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const markAllSeen = useCallback(() => {
    setMissedNotifications([]);
  }, []);

  /* ── Shared socket from SocketProvider (NO duplicate connection) ── */
  const { socketRef } = useSocketContext();

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
  const vibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    if ("vibrate" in navigator) {
      // Vibration en boucle (simule une vraie sonnerie téléphone)
      navigator.vibrate([400, 200, 400, 200, 400]);
      if (vibrationIntervalRef.current) clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = setInterval(() => {
        if ("vibrate" in navigator) navigator.vibrate([400, 200, 400, 200, 400]);
      }, 2500);
    }

    // Jouer la sonnerie d'appel entrant (WAV selon connectivité réelle)
    void playCallSound("incoming");

    incomingCallTimerRef.current = setTimeout(() => {
      setIncomingCall(null);
      stopCallSound();
      if (vibrationIntervalRef.current) { clearInterval(vibrationIntervalRef.current); vibrationIntervalRef.current = null; }
      if ("vibrate" in navigator) navigator.vibrate(0);
    }, 45_000);
  }, []);

  const requestPushPermission = useCallback(async () => {
    return false;
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
    stopCallSound();
    if (vibrationIntervalRef.current) { clearInterval(vibrationIntervalRef.current); vibrationIntervalRef.current = null; }
    if ("vibrate" in navigator) navigator.vibrate(0);
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
    stopCallSound();
    if (vibrationIntervalRef.current) { clearInterval(vibrationIntervalRef.current); vibrationIntervalRef.current = null; }
    if ("vibrate" in navigator) navigator.vibrate(0);
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
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
    };

    const handleIncomingCall = (data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => {
      presentIncomingCall(data);
    };

    /* ── Clear incoming call overlay when caller cancels, call is accepted, or rejected ── */
    const clearIncomingCallFor = (data: { conversationId: string }) => {
      setIncomingCall((prev) => {
        if (!prev || prev.conversationId !== data.conversationId) return prev;
        if (incomingCallTimerRef.current) { clearTimeout(incomingCallTimerRef.current); incomingCallTimerRef.current = null; }
        stopCallSound();
        if (vibrationIntervalRef.current) { clearInterval(vibrationIntervalRef.current); vibrationIntervalRef.current = null; }
        if ("vibrate" in navigator) navigator.vibrate(0);
        return null;
      });
    };

    const handleCallEnded = (data: { conversationId: string }) => clearIncomingCallFor(data);
    const handleCallAccepted = (data: { conversationId: string }) => clearIncomingCallFor(data);
    const handleCallRejected = (data: { conversationId: string }) => clearIncomingCallFor(data);

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
        targetUrl: "/account?section=purchases",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
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
        targetUrl: "/account?section=purchases",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
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
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
      playMessageSound();
    };

    const handleNegotiationUpdated = (data: { action: string; negotiationId: string; sourceUserId: string; respondAction?: string; respondedByDisplayName?: string; listingTitle?: string; counterPriceUsdCents?: number | null }) => {
      if (data.sourceUserId === user?.id) return;
      const who = data.respondedByDisplayName ?? "Quelqu'un";
      const article = data.listingTitle ? ` pour « ${data.listingTitle} »` : "";
      let label: string;
      let icon = "🤝";
      if (data.action === "RESPONDED" && data.respondAction) {
        switch (data.respondAction) {
          case "ACCEPT":
            label = `${who} a accepté votre offre${article} ✅`;
            icon = "✅";
            break;
          case "REFUSE":
            label = `${who} a refusé votre offre${article}`;
            icon = "❌";
            break;
          case "COUNTER":
            label = `${who} a fait une contre-offre${article} 🔄`;
            icon = "🔄";
            break;
          default:
            label = "Réponse reçue";
        }
      } else {
        const actionLabels: Record<string, string> = { CREATED: "Nouvelle offre", RESPONDED: "Réponse reçue", CANCELED: "Annulée", JOINED: "Nouveau membre", BUNDLE_CREATED: "Offre lot" };
        label = actionLabels[data.action] ?? data.action;
      }
      const toast: MessageToast = {
        id: `nego-${data.negotiationId}-${Date.now()}`,
        kind: "negotiation",
        title: icon + " " + label,
        content: `Marchandage #${data.negotiationId.slice(-6)} — ${label}`,
        icon,
        targetUrl: "/account?tab=commandes",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
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
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
    };

    const handleSokinPostCreated = (data: { postId: string; authorId: string; sourceUserId: string }) => {
      if (data.sourceUserId === user?.id) return;
      const toast: MessageToast = {
        id: `sokin-post-${data.postId}-${Date.now()}`,
        kind: "publication",
        title: "🌍 Nouvelle publication",
        content: "Un utilisateur a publié sur So-Kin",
        icon: "🌍",
        targetUrl: "/sokin",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
    };

    socket.on("message:new", handleNewMessage);
    socket.on("call:incoming", handleIncomingCall);
    socket.on("call:ended", handleCallEnded);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("call:rejected", handleCallRejected);
    socket.on("order:created", handleOrderCreated);
    socket.on("order:status-updated", handleOrderStatusUpdated);
    socket.on("order:delivery-confirmed", handleDeliveryConfirmed);
    socket.on("negotiation:updated", handleNegotiationUpdated);
    socket.on("negotiation:expired", handleNegotiationExpired);
    socket.on("sokin:post-created", handleSokinPostCreated);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("call:incoming", handleIncomingCall);
      socket.off("call:ended", handleCallEnded);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("call:rejected", handleCallRejected);
      socket.off("order:created", handleOrderCreated);
      socket.off("order:status-updated", handleOrderStatusUpdated);
      socket.off("order:delivery-confirmed", handleDeliveryConfirmed);
      socket.off("negotiation:updated", handleNegotiationUpdated);
      socket.off("negotiation:expired", handleNegotiationExpired);
      socket.off("sokin:post-created", handleSokinPostCreated);
    };
  }, [isLoggedIn, user?.id, playMessageSound, presentIncomingCall]);

  /* ── Reconnect catch-up: notify pages to refetch data on socket reconnection ── */
  useEffect(() => {
    if (!isLoggedIn) return;
    const handleReconnect = () => {
      window.dispatchEvent(new CustomEvent("ks:data-stale", { detail: { reason: "socket-reconnected" } }));
    };
    window.addEventListener("ks:socket-reconnected", handleReconnect);
    return () => window.removeEventListener("ks:socket-reconnected", handleReconnect);
  }, [isLoggedIn]);

  useEffect(() => {
    return () => {
      if (incomingCallTimerRef.current) {
        clearTimeout(incomingCallTimerRef.current);
      }
      if (vibrationIntervalRef.current) {
        clearInterval(vibrationIntervalRef.current);
      }
    };
  }, []);

  /* ── Context value ── */
  const ctxValue = useMemo(
    () => ({ messagingActive, setMessagingActive, pushEnabled: false, requestPushPermission, missedNotifications, missedCount, markSeen, markAllSeen }),
    [messagingActive, requestPushPermission, missedNotifications, missedCount, markSeen, markAllSeen],
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
    </GlobalNotifContext.Provider>
  );
}
