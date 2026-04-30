import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider";
import { useSocketContext } from "./SocketProvider";
import { playRingtone, stopRingtone } from "../../utils/call-sound-manager";
import { playMessageSound as playMsgSound } from "../../utils/call-sound-manager";
import { clearAllNotifications, clearCallNotification, closeCallNotification } from "../../utils/call-notification";
import {
  getNotificationPermission,
  isPushSupported,
  isNativeApp,
  isSubscribedToPush,
  initNativePush,
  listenForPendingFcmToken,
  onServiceWorkerMessage,
  registerServiceWorker,
  subscribeToPush,
  unregisterActiveFcmToken,
} from "../../utils/push-notifications";
import { SK_PUSH_BANNER_DISMISSED } from "../../shared/constants/storage-keys";
import { startBackgroundService, stopBackgroundService, setNativeLoggedIn } from "../../utils/background-service";
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
  callId?: string;
  expiresAt?: number;
  conversationId?: string;
  callerId?: string;
  callType?: "audio" | "video";
  orderId?: string;
  negotiationId?: string;
  postId?: string;
  listingId?: string;
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
      return data.conversationId ? `/messaging?convId=${data.conversationId}` : "/messaging";
    case "call": {
      // Étape 3 : sans callId+expiresAt valides on retourne une URL plate
      // qui ne déclenche aucune injection d'appel (MessagingPage refuse).
      const now = Date.now();
      if (!data.callId || typeof data.expiresAt !== "number" || data.expiresAt <= now) {
        return "/messaging";
      }
      const p = new URLSearchParams({
        incomingConvId: data.conversationId ?? "",
        incomingCallerId: data.callerId ?? "",
        incomingCallType: data.callType ?? "audio",
        callId: data.callId,
        expiresAt: String(data.expiresAt),
      });
      return `/messaging?${p.toString()}`;
    }
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
  const [pushEnabled, setPushEnabled] = useState(false);
  const [showPushBanner, setShowPushBanner] = useState(false);

  /* ── Foreground service (Android) — comme WhatsApp ── */
  useEffect(() => {
    if (isLoggedIn) {
      // A17 audit : flag persistent pour BootReceiver
      void setNativeLoggedIn(true);
      void startBackgroundService();
    } else {
      // Logout : désenregistrer le token FCM avant d'arrêter le service
      void setNativeLoggedIn(false);
      void unregisterActiveFcmToken().finally(() => {
        void stopBackgroundService();
      });
    }
  }, [isLoggedIn]);

  /* ── Missed notifications (persisted) ── */
  const MISSED_KEY = "ks-missed-notifs";
  const MAX_MISSED = 50;
  const MISSED_TTL = 24 * 60 * 60 * 1000; // 24 h

  const [missedNotifications, setMissedNotifications] = useState<MissedNotification[]>(() => {
    try {
      const raw = localStorage.getItem(MISSED_KEY);
      if (!raw) return [];
      const now = Date.now();
      return (JSON.parse(raw) as MissedNotification[]).filter((n) => now - n.timestamp < MISSED_TTL).slice(0, MAX_MISSED);
    } catch { return []; }
  });

  const missedCount = missedNotifications.length;

  // P1.6 #2 : flag pour éviter les écritures qui viennent d'arriver par
  // storage event (sinon boucle infinie write → event → setState → write).
  const missedFromStorageRef = useRef(false);

  // Persist whenever missedNotifications changes
  useEffect(() => {
    if (missedFromStorageRef.current) {
      missedFromStorageRef.current = false;
      return;
    }
    try { localStorage.setItem(MISSED_KEY, JSON.stringify(missedNotifications)); } catch {}
  }, [missedNotifications]);

  // P1.6 #2 : synchronisation cross-tab de la cloche via storage event.
  // Quand un autre onglet écrit dans localStorage, on merge côté courant.
  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== MISSED_KEY || !ev.newValue) return;
      try {
        const incoming = JSON.parse(ev.newValue) as MissedNotification[];
        if (!Array.isArray(incoming)) return;
        const now = Date.now();
        const valid = incoming.filter((n) => n && typeof n.id === "string" && now - n.timestamp < MISSED_TTL).slice(0, MAX_MISSED);
        missedFromStorageRef.current = true;
        setMissedNotifications(valid);
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
  const { socketRef, isConnected } = useSocketContext();

  useEffect(() => {
    messagingActiveRef.current = messagingActive;
  }, [messagingActive]);


  /* ── Push notifications setup ── */
  // P2 #22 : garde anti-double-invocation. En React StrictMode (dev) ou Fast
  // Refresh, l'effet peut s'exécuter deux fois rapidement. initNativePush()
  // enregistre des listeners Capacitor — un double call créerait des doublons
  // de notifications. pushInitRef = true pendant l'exécution.
  const pushInitRef = useRef(false);
  useEffect(() => {
    if (!isLoggedIn) {
      setPushEnabled(false);
      setShowPushBanner(false);
      return;
    }
    if (pushInitRef.current) return;
    pushInitRef.current = true;

    let canceled = false;
    let nativeCleanup: (() => void) | null = null;
    let tokenCleanup: (() => void) | null = null;

    const initPush = async () => {
      // ── Native Android (FCM via Capacitor) ──
      if (isNativeApp()) {
        tokenCleanup = listenForPendingFcmToken();
        nativeCleanup = await initNativePush((data) => {
          // Foreground notification received → show in-app toast
          const kind = resolveNotificationKind(data as PushPayloadData);
          const icon = resolveNotificationIcon(kind);
          const targetUrl = resolveNotificationTarget(data as PushPayloadData);
          const toast: MessageToast = {
            id: `fcm-${Date.now()}`,
            kind,
            title: (data as Record<string, string>).title ?? "Kin-Sell",
            content: (data as Record<string, string>).body ?? "",
            icon,
            targetUrl,
            timestamp: Date.now(),
          };
          setToasts((prev) => [...prev, toast]);
          pushMissed({ kind, title: toast.title, content: toast.content, icon, targetUrl }, toast.id);
        });
        if (!canceled && nativeCleanup) setPushEnabled(true);
        return;
      }

      // ── Web Push (VAPID) ──
      if (!isPushSupported()) {
        setPushEnabled(false);
        setShowPushBanner(false);
        return;
      }

      await registerServiceWorker();
      const permission = getNotificationPermission();
      if (permission === "granted") {
        const subscribed = await isSubscribedToPush();
        if (!subscribed) {
          await subscribeToPush();
        }
        if (!canceled) setPushEnabled(true);
      } else {
        if (!canceled) setPushEnabled(false);
      }

      if (!canceled) {
        if (permission === "default") {
          // P1.6 #3 : re-invite automatique après 14 jours si l'utilisateur
          // a cliqué "Plus tard". 2e chance élégante sans être spammy.
          let dismissed = false;
          try {
            const raw = localStorage.getItem(SK_PUSH_BANNER_DISMISSED);
            if (raw) {
              const dismissedAt = Date.parse(raw);
              const REINVITE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
              if (!Number.isNaN(dismissedAt) && Date.now() - dismissedAt < REINVITE_AFTER_MS) {
                dismissed = true;
              }
            }
          } catch { /* ignore */ }
          setShowPushBanner(!dismissed);
        } else {
          setShowPushBanner(false);
        }
      }
    };

    void initPush();
    return () => {
      canceled = true;
      nativeCleanup?.();
      tokenCleanup?.();
      pushInitRef.current = false;
    };
  }, [isLoggedIn, pushMissed]);

  /* ── Message toasts ── */
  const [toasts, setToasts] = useState<MessageToast[]>([]);

  /* ── Incoming call overlay (intercepted when NOT on /messaging) ── */
  const [incomingCall, setIncomingCall] = useState<{
    conversationId: string;
    callerId: string;
    callerName: string;
    callType: "audio" | "video";
    callId?: string;
    expiresAt?: number;
  } | null>(null);
  const incomingCallRef = useRef(incomingCall);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);
  const incomingCallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Track which calls were accepted so we can detect missed calls */
  const acceptedCallsRef = useRef<Set<string>>(new Set());

  // P0 #7 : cleanup global au unmount du provider — évite les fuites de timers/
  // intervals si le provider est remonté (ex. logout/login, hot-reload).
  useEffect(() => {
    return () => {
      if (incomingCallTimerRef.current) {
        clearTimeout(incomingCallTimerRef.current);
        incomingCallTimerRef.current = null;
      }
      if (vibrationIntervalRef.current) {
        clearInterval(vibrationIntervalRef.current);
        vibrationIntervalRef.current = null;
      }
      try { if ("vibrate" in navigator) navigator.vibrate(0); } catch {}
      try { stopRingtone(); } catch {}
    };
  }, []);

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

  const maybeShowSystemNotification = useCallback(async (toast: MessageToast, data?: PushPayloadData) => {
    if (!isPushSupported()) return;
    if (document.visibilityState === "visible") return;
    if (getNotificationPermission() !== "granted") return;
    const reg = await registerServiceWorker();
    if (!reg) return;
    const payloadData = { ...(data ?? {}), url: toast.targetUrl };
    try {
      await reg.showNotification(toast.title, {
        body: toast.content,
        icon: "/apple-touch-icon.png",
        badge: "/favicon-32.png",
        tag: toast.id,
        data: payloadData,
      });
    } catch {}
  }, []);

  const presentIncomingCall = useCallback((data: { conversationId: string; callerId: string; callType: "audio" | "video"; callId?: string; expiresAt?: number }) => {
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

    // Jouer la sonnerie d'appel entrant (sauf si MessagingPage gère les sons via useCallSounds)
    if (!messagingActiveRef.current) {
      void playRingtone("incoming");
    }

    incomingCallTimerRef.current = setTimeout(() => {
      setIncomingCall(null);
      stopRingtone();
      if (vibrationIntervalRef.current) { clearInterval(vibrationIntervalRef.current); vibrationIntervalRef.current = null; }
      if ("vibrate" in navigator) navigator.vibrate(0);
    }, 30_000);
  }, []);

  const requestPushPermission = useCallback(async () => {
    if (!isPushSupported()) return false;
    const ok = await subscribeToPush();
    setPushEnabled(ok);
    if (ok) {
      setShowPushBanner(false);
      try { localStorage.removeItem(SK_PUSH_BANNER_DISMISSED); } catch {}
    }
    return ok;
  }, []);

  const dismissPushBanner = useCallback(() => {
    setShowPushBanner(false);
    try { localStorage.setItem(SK_PUSH_BANNER_DISMISSED, new Date().toISOString()); } catch {}
  }, []);

  /* ── Notification sound for messages ── */
  const playMessageSound = useCallback(() => {
    playMsgSound();
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  const acceptGlobalCall = useCallback((preferredCallType?: "audio" | "video") => {
    if (!incomingCall) return;
    if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);
    stopRingtone();
    if (vibrationIntervalRef.current) { clearInterval(vibrationIntervalRef.current); vibrationIntervalRef.current = null; }
    if ("vibrate" in navigator) navigator.vibrate(0);
    const { conversationId, callerId, callType, callId, expiresAt } = incomingCall;
    const resolvedCallType = preferredCallType ?? callType;
    setIncomingCall(null);
    // Étape 4 — ferme la push SW + notif Android au moment de l'accept local.
    if (callId) void closeCallNotification(callId);
    if (window.location.pathname.startsWith("/messaging")) {
      window.dispatchEvent(new CustomEvent("ks:incoming-call-accept", { detail: { ...incomingCall, callType: resolvedCallType } }));
      return;
    }
    // Étape 3 : on propage callId+expiresAt pour que MessagingPage puisse
    // valider l'appel auprès du serveur avant l'auto-accept.
    const params = new URLSearchParams({
      callAction: "accept",
      convId: conversationId,
      callerId,
      callType: resolvedCallType,
    });
    if (callId) params.set("callId", callId);
    if (typeof expiresAt === "number") params.set("expiresAt", String(expiresAt));
    navigateInApp(`/messaging?${params.toString()}`);
  }, [incomingCall, navigateInApp]);

  const rejectGlobalCall = useCallback(() => {
    if (!incomingCall) return;
    if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);
    stopRingtone();
    if (vibrationIntervalRef.current) { clearInterval(vibrationIntervalRef.current); vibrationIntervalRef.current = null; }
    if ("vibrate" in navigator) navigator.vibrate(0);
    socketRef.current?.emit("call:reject", {
      callId: incomingCall.callId,
      conversationId: incomingCall.conversationId,
      callerId: incomingCall.callerId,
    });
    // Étape 4 — cleanup actif local.
    if (incomingCall.callId) void closeCallNotification(incomingCall.callId);
    window.dispatchEvent(new CustomEvent("ks:incoming-call-reject", { detail: incomingCall }));
    setIncomingCall(null);
  }, [incomingCall]);

  /* ── Native reject from Android notification button ── */
  useEffect(() => {
    const handler = (event: Event) => {
      if (incomingCallTimerRef.current) clearTimeout(incomingCallTimerRef.current);
      stopRingtone();
      if (vibrationIntervalRef.current) { clearInterval(vibrationIntervalRef.current); vibrationIntervalRef.current = null; }
      if ("vibrate" in navigator) navigator.vibrate(0);
      // Étape 3 : récupère callId/expiresAt natifs si fournis par MainActivity.
      const detail = (event as CustomEvent<{
        conversationId?: string;
        callerId?: string;
        callId?: string;
        expiresAt?: number;
      }>).detail ?? {};
      const nativeCallId = typeof detail.callId === "string" ? detail.callId : "";
      const nativeExpires = typeof detail.expiresAt === "number" ? detail.expiresAt : 0;
      const nativeStillValid = nativeCallId.length > 0 && nativeExpires > Date.now();
      if (incomingCallRef.current) {
        socketRef.current?.emit("call:reject", {
          callId: incomingCallRef.current.callId,
          conversationId: incomingCallRef.current.conversationId,
          callerId: incomingCallRef.current.callerId,
        });
      } else if (nativeStillValid && detail.conversationId && detail.callerId) {
        // App n'a pas d'incomingCall en mémoire (cold start). On émet un
        // call:reject serveur uniquement si on a un callId valide propagé
        // par Android. Sinon on se contente du dispatch UI ci-dessous.
        socketRef.current?.emit("call:reject", {
          callId: nativeCallId,
          conversationId: detail.conversationId,
          callerId: detail.callerId,
        });
      }
      // Étape 4 — cleanup actif sur la notif SW si callId fourni.
      const cleanupId = incomingCallRef.current?.callId ?? (nativeStillValid ? nativeCallId : "");
      if (cleanupId) void closeCallNotification(cleanupId);
      setIncomingCall(null);
    };
    window.addEventListener("ks:native-call-reject", handler);
    return () => window.removeEventListener("ks:native-call-reject", handler);
  }, []);

  /* ── Dédup global : évite les doublons entre socket event + push SW ── */
  // Clé composite stockée pendant 10s pour filtrer les notifs reçues par les
  // deux canaux à la fois (socket + service worker push).
  // Partagée entre onglets via BroadcastChannel + fallback localStorage
  // (P1.5 A : Safari iOS < 16 n'a pas BroadcastChannel).
  const seenKeysRef = useRef<Map<string, number>>(new Map());
  const bcRef = useRef<BroadcastChannel | null>(null);
  const LS_DEDUP_KEY = "ks-notif-dedup-last";

  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel("ks-notif-dedup");
      bcRef.current = bc;
      bc.onmessage = (ev) => {
        const k = ev?.data?.key;
        if (typeof k === "string") seenKeysRef.current.set(k, Date.now());
      };
    }
    // Fallback cross-tab (Safari iOS, Firefox privé, etc.) : écouter les
    // événements storage qui se déclenchent dans les AUTRES onglets.
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== LS_DEDUP_KEY || !ev.newValue) return;
      try {
        const parsed = JSON.parse(ev.newValue) as { key: string; ts: number };
        if (parsed && typeof parsed.key === "string") {
          seenKeysRef.current.set(parsed.key, parsed.ts || Date.now());
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      try { bcRef.current?.close(); } catch { /* ignore */ }
      bcRef.current = null;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const isDuplicate = useCallback((key: string) => {
    const now = Date.now();
    const prev = seenKeysRef.current.get(key);
    // Purge les clés expirées (> 10s) pour éviter la fuite mémoire
    if (seenKeysRef.current.size > 200) {
      for (const [k, t] of seenKeysRef.current) {
        if (now - t > 10_000) seenKeysRef.current.delete(k);
      }
    }
    if (prev && now - prev < 10_000) return true;
    seenKeysRef.current.set(key, now);
    // Canal 1 : BroadcastChannel (instantané, navigateurs modernes)
    try { bcRef.current?.postMessage({ key, ts: now }); } catch { /* ignore */ }
    // Canal 2 : localStorage (fallback Safari iOS) — storage event ne se
    // déclenche QUE dans les autres onglets, donc pas de boucle.
    try { localStorage.setItem(LS_DEDUP_KEY, JSON.stringify({ key, ts: now })); } catch { /* ignore */ }
    return false;
  }, []);

  /* ── Audio unlock : certains navigateurs bloquent new Audio().play()
     tant que l'utilisateur n'a pas interagi. On "prime" le pipeline audio
     au premier geste utilisateur (click, touch, keydown) pour que toute
     notif ultérieure joue son son instantanément. ── */
  const audioUnlockedRef = useRef(false);
  useEffect(() => {
    if (audioUnlockedRef.current) return;
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;
      try {
        const a = new Audio("/assets/sounds/ui/kinsell_message.wav");
        a.volume = 0;
        const p = a.play();
        if (p && typeof p.then === "function") {
          p.then(() => { try { a.pause(); a.currentTime = 0; } catch {} }).catch(() => {});
        }
      } catch { /* ignore */ }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  /* ── Service Worker push messages (background/outside browser) ── */
  useEffect(() => {
    if (!isLoggedIn || !isPushSupported()) return;
    return onServiceWorkerMessage((msg) => {
      if (msg?.type === "navigate" && typeof msg.targetUrl === "string") {
        navigateInApp(msg.targetUrl);
        return;
      }
      if (msg?.type !== "push") return;
      const payload = (msg.payload ?? {}) as {
        title?: string;
        body?: string;
        tag?: string;
        data?: PushPayloadData;
      };
      const data = (payload.data ?? {}) as PushPayloadData;
      const kind = resolveNotificationKind(data);
      const icon = resolveNotificationIcon(kind);
      const targetUrl = resolveNotificationTarget({ ...data, url: data.url });

      // Dédup croisée socket/push via clé métier
      const dedupKey =
        data.conversationId ? `msg-${data.conversationId}-${payload.title}-${payload.body}` :
        data.orderId ? `order-${data.orderId}-${data.type}` :
        data.negotiationId ? `nego-${data.negotiationId}-${data.type}` :
        data.postId ? `sokin-${data.postId}` :
        payload.tag ? `tag-${payload.tag}` :
        `push-${Date.now()}`;
      if (isDuplicate(dedupKey)) return;

      const toast: MessageToast = {
        id: `push-${payload.tag ?? Date.now()}`,
        kind,
        title: payload.title ?? "Notification",
        content: payload.body ?? "",
        icon,
        targetUrl,
        timestamp: Date.now(),
      };
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl }, payload.tag ? `push-${payload.tag}` : undefined);
      if (document.visibilityState === "visible" && !(kind === "message" && messagingActiveRef.current)) {
        // 🔊 Son + vibration immédiats — comme pour les events socket, pour
        // que chaque notif (message/commande/marchandage/like/…) se manifeste
        // "au tic au tac" quand elle arrive via le canal SW.
        try { playMessageSound(); } catch { /* ignore */ }
        try {
          if ("vibrate" in navigator && kind !== "message") {
            // Les messages ont déjà un son court ; on vibre sur les autres
            // types pour renforcer la spontanéité.
            navigator.vibrate([150, 60, 150]);
          }
        } catch { /* ignore */ }
        setToasts((p) => [toast, ...p].slice(0, 4));
        setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      }
    });
  }, [isLoggedIn, navigateInApp, pushMissed, isDuplicate, playMessageSound]);
  /* ── Socket event listeners ── */
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !isLoggedIn || !isConnected) return;

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

      // Dédup socket ↔ push SW : si on a déjà traité ce message via push SW,
      // on skip pour éviter le double toast.
      if (isDuplicate(`msg-${(msg as any).conversationId}-${msg.id}`)) return;

      playMessageSound();
      try { if ("vibrate" in navigator) navigator.vibrate([100, 40, 100]); } catch { /* ignore */ }

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
        targetUrl: (msg as any).conversationId ? `/messaging?convId=${(msg as any).conversationId}` : "/messaging",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
      void maybeShowSystemNotification(toast, { type: "message", conversationId: (msg as any).conversationId, url: toast.targetUrl });
    };

    const handleIncomingCall = (data: { callId: string; conversationId: string; callerId: string; callType: "audio" | "video"; expiresAt: number }) => {
      // If the user is already on the messaging page, useAudioCallState handles the call directly.
      // Only show the overlay + push notification when NOT in messaging.
      if (messagingActiveRef.current) return;
      presentIncomingCall(data);
      // URL enrichie de callId + expiresAt — l'étape 3 s'en servira pour
      // valider la fraîcheur côté client/SW avant de réinjecter un appel.
      const targetUrl = `/messaging?incomingConvId=${encodeURIComponent(data.conversationId)}`
        + `&incomingCallerId=${encodeURIComponent(data.callerId)}`
        + `&incomingCallType=${encodeURIComponent(data.callType)}`
        + `&callId=${encodeURIComponent(data.callId)}`
        + `&expiresAt=${data.expiresAt}`;
      // Push a "pending" incoming call notification (will become missed if not accepted)
      pushMissed(
        { kind: "message", title: "📞 Appel entrant", content: data.callType === "video" ? "Appel vidéo" : "Appel audio", icon: "📞", targetUrl },
        `call-incoming-${data.callId}`,
      );
      void maybeShowSystemNotification(
        {
          id: `call-${data.callId}`,
          kind: "message",
          title: "Appel entrant",
          content: data.callType === "video" ? "Appel video" : "Appel audio",
          icon: "📞",
          targetUrl,
          timestamp: Date.now(),
        },
        { type: "call", callId: data.callId, conversationId: data.conversationId, callerId: data.callerId, callType: data.callType, expiresAt: data.expiresAt },
      );
    };

    /* ── Clear incoming call overlay when caller cancels, call is accepted, or rejected ── */
    const clearIncomingCallFor = (data: { conversationId: string }) => {
      setIncomingCall((prev) => {
        if (!prev || prev.conversationId !== data.conversationId) return prev;
        if (incomingCallTimerRef.current) { clearTimeout(incomingCallTimerRef.current); incomingCallTimerRef.current = null; }
        stopRingtone();
        if (vibrationIntervalRef.current) { clearInterval(vibrationIntervalRef.current); vibrationIntervalRef.current = null; }
        if ("vibrate" in navigator) navigator.vibrate(0);
        return null;
      });
      // Retirer la notification Android d'appel entrant (ID 9999)
      void clearCallNotification();
    };

    const handleCallEnded = (data: { callId: string; conversationId: string; enderId?: string }) => {
      clearIncomingCallFor(data);
      // Étape 4 — nettoyage actif : ferme la push SW taggée + notif Android.
      void closeCallNotification(data.callId);
      // If we never accepted this call, convert the incoming notif to "missed"
      const callKey = `call-incoming-${data.callId}`;
      if (!acceptedCallsRef.current.has(data.callId)) {
        // Remove the "incoming" entry and replace with "missed"
        setMissedNotifications((prev) => prev.filter((n) => n.id !== callKey));
        pushMissed(
          { kind: "message", title: "📞 Appel manqué", content: "Vous avez manqué un appel", icon: "📞", targetUrl: "/messaging" },
          `call-missed-${data.callId}`,
        );
      } else {
        // Call was answered, remove the incoming entry
        setMissedNotifications((prev) => prev.filter((n) => n.id !== callKey));
        acceptedCallsRef.current.delete(data.callId);
      }
    };
    const handleCallAccepted = (data: { callId: string; conversationId: string }) => {
      clearIncomingCallFor(data);
      void closeCallNotification(data.callId);
      acceptedCallsRef.current.add(data.callId);
      // Remove the "incoming" entry since call is active
      const callKey = `call-incoming-${data.callId}`;
      setMissedNotifications((prev) => prev.filter((n) => !n.id.startsWith(callKey)));
    };
    const handleCallRejected = (data: { callId: string; conversationId: string; rejecterId?: string }) => {
      clearIncomingCallFor(data);
      void closeCallNotification(data.callId);
      // Rejected by the other party — remove the incoming call notification
      const callKey = `call-incoming-${data.callId}`;
      setMissedNotifications((prev) => prev.filter((n) => n.id !== callKey));
    };

    const handleCallNoAnswer = (data: { callId: string; conversationId: string }) => {
      clearIncomingCallFor(data);
      void closeCallNotification(data.callId);
      // Remove incoming notif, push missed
      setMissedNotifications((prev) => prev.filter((n) => !n.id.startsWith(`call-incoming-${data.callId}`)));
      pushMissed(
        { kind: "message", title: "📞 Appel manqué", content: "Pas de réponse", icon: "📞", targetUrl: "/messaging" },
        `call-missed-${data.callId}`,
      );
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
        targetUrl: "/account?section=purchases",
        timestamp: Date.now(),
      };
      setToasts((p) => [toast, ...p].slice(0, 4));
      setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 6000);
      pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
      void maybeShowSystemNotification(toast, { type: "order", orderId: data.orderId, url: toast.targetUrl });
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
      void maybeShowSystemNotification(toast, { type: "order", orderId: data.orderId, url: toast.targetUrl });
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
      void maybeShowSystemNotification(toast, { type: "order", orderId: data.orderId, url: toast.targetUrl });
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
      void maybeShowSystemNotification(toast, { type: "negotiation", negotiationId: data.negotiationId, url: toast.targetUrl });
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
      void maybeShowSystemNotification(toast, { type: "negotiation", negotiationId: data.negotiationId, url: toast.targetUrl });
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
      void maybeShowSystemNotification(toast, { type: "sokin", postId: data.postId, url: toast.targetUrl });
    };

    const handleStockExhausted = (data: { listings: Array<{ id: string; title: string }>; orderId: string }) => {
      for (const listing of data.listings) {
        const toast: MessageToast = {
          id: `stock-exhausted-${listing.id}-${Date.now()}`,
          kind: "system",
          title: "⚠️ Stock épuisé",
          content: `Votre article "${listing.title}" est en rupture de stock`,
          icon: "⚠️",
          targetUrl: "/account?section=articles",
          timestamp: Date.now(),
        };
        setToasts((p) => [toast, ...p].slice(0, 4));
        setTimeout(() => setToasts((p) => p.filter((t) => t.id !== toast.id)), 8000);
        pushMissed({ kind: toast.kind, title: toast.title, content: toast.content, icon: toast.icon, targetUrl: toast.targetUrl });
        void maybeShowSystemNotification(toast, { type: "stock", listingId: listing.id, url: toast.targetUrl });
        playMessageSound();
      }
    };

    socket.on("message:new", handleNewMessage);
    socket.on("call:incoming", handleIncomingCall);
    socket.on("call:ended", handleCallEnded);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("call:rejected", handleCallRejected);
    socket.on("call:no-answer", handleCallNoAnswer);
    socket.on("order:created", handleOrderCreated);
    socket.on("order:status-updated", handleOrderStatusUpdated);
    socket.on("order:delivery-confirmed", handleDeliveryConfirmed);
    socket.on("negotiation:updated", handleNegotiationUpdated);
    socket.on("negotiation:expired", handleNegotiationExpired);
    socket.on("sokin:post-created", handleSokinPostCreated);
    socket.on("listing:stock-exhausted", handleStockExhausted);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("call:incoming", handleIncomingCall);
      socket.off("call:ended", handleCallEnded);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("call:rejected", handleCallRejected);
      socket.off("call:no-answer", handleCallNoAnswer);
      socket.off("order:created", handleOrderCreated);
      socket.off("order:status-updated", handleOrderStatusUpdated);
      socket.off("order:delivery-confirmed", handleDeliveryConfirmed);
      socket.off("negotiation:updated", handleNegotiationUpdated);
      socket.off("negotiation:expired", handleNegotiationExpired);
      socket.off("sokin:post-created", handleSokinPostCreated);
      socket.off("listing:stock-exhausted", handleStockExhausted);
    };
  }, [isLoggedIn, isConnected, user?.id, playMessageSound, presentIncomingCall, pushMissed, maybeShowSystemNotification, isDuplicate]);

  /* ── Native bridge: incoming call from Java SharedPreferences (app was killed) ── */
  useEffect(() => {
    if (!isLoggedIn) return;
    const handleNativeCall = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        conversationId: string;
        callerId: string;
        callType: string;
        callerName?: string;
        callId?: string;
        expiresAt?: number;
      };
      if (!detail?.conversationId || !detail?.callerId) return;
      // Étape 3 : sans callId+expiresAt non expiré, on ne sonne pas. La
      // validation serveur effective sera faite en aval par MessagingPage,
      // mais on coupe court ici pour les vieilles notifs natives qui ne
      // portent pas ces champs.
      if (!detail.callId) return;
      if (typeof detail.expiresAt !== "number" || detail.expiresAt <= Date.now()) return;
      presentIncomingCall({
        conversationId: detail.conversationId,
        callerId: detail.callerId,
        callType: (detail.callType === "video" ? "video" : "audio") as "audio" | "video",
        callId: detail.callId,
        expiresAt: detail.expiresAt,
      });
    };
    window.addEventListener("ks:native-incoming-call", handleNativeCall);
    return () => window.removeEventListener("ks:native-incoming-call", handleNativeCall);
  }, [isLoggedIn, presentIncomingCall]);

  /* ── Reconnect catch-up: notify pages to refetch data on socket reconnection or app resume ── */
  useEffect(() => {
    if (!isLoggedIn) return;
    const handleReconnect = () => {
      window.dispatchEvent(new CustomEvent("ks:data-stale", { detail: { reason: "socket-reconnected" } }));
      // P1.5 F : alias sémantique explicite pour les pages qui veulent
      // écouter uniquement les resync liés aux notifs/listes temps réel.
      window.dispatchEvent(new CustomEvent("ks:notif-resync", { detail: { reason: "socket-reconnected" } }));
    };
    const handleResume = () => {
      window.dispatchEvent(new CustomEvent("ks:data-stale", { detail: { reason: "app-resumed" } }));
      window.dispatchEvent(new CustomEvent("ks:notif-resync", { detail: { reason: "app-resumed" } }));
    };
    window.addEventListener("ks:socket-reconnected", handleReconnect);
    window.addEventListener("ks:app-resumed", handleResume);
    return () => {
      window.removeEventListener("ks:socket-reconnected", handleReconnect);
      window.removeEventListener("ks:app-resumed", handleResume);
    };
  }, [isLoggedIn]);

  /* ── Nettoyer les notifications Android quand l'app revient au premier plan ── */
  useEffect(() => {
    if (!isNativeApp()) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void clearAllNotifications();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  /* ── Indicateur "reconnexion…" : affich\u00e9 si socket HS > 3s quand logg\u00e9 ── */
  const [showReconnecting, setShowReconnecting] = useState(false);
  const [canForceReconnect, setCanForceReconnect] = useState(false);
  useEffect(() => {
    if (!isLoggedIn) { setShowReconnecting(false); setCanForceReconnect(false); return; }
    if (isConnected) { setShowReconnecting(false); setCanForceReconnect(false); return; }
    const t1 = setTimeout(() => setShowReconnecting(true), 3000);
    const t2 = setTimeout(() => setCanForceReconnect(true), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isLoggedIn, isConnected]);

  const forceReconnect = useCallback(() => {
    const s = socketRef.current;
    if (!s) return;
    try { s.disconnect(); } catch { /* ignore */ }
    setTimeout(() => { try { s.connect(); } catch { /* ignore */ } }, 150);
    setCanForceReconnect(false);
  }, [socketRef]);

  /* ── Auto-healing de la souscription push : re-register si elle a disparu ── */
  // Certains navigateurs invalident silencieusement la subscription apr\u00e8s un
  // nettoyage de donn\u00e9es ou un long d\u00e9sengagement. On v\u00e9rifie \u00e0 chaque
  // retour d'onglet + au login que la sub existe toujours, sinon on re-souscrit.
  useEffect(() => {
    if (!isLoggedIn || !isPushSupported()) return;
    let cancelled = false;
    const check = async () => {
      if (cancelled) return;
      if (getNotificationPermission() !== "granted") return;
      const subscribed = await isSubscribedToPush();
      if (subscribed) return;
      // P1.5 B : retry avec backoff exponentiel si la re-souscription echoue
      // (serveur down au boot, 2G flaky, VAPID key temporairement indispo).
      console.warn("[Push] Subscription disparue - re-souscription avec retry");
      const delays = [1000, 2000, 5000, 10000, 20000];
      for (let i = 0; i < delays.length; i++) {
        if (cancelled) return;
        try {
          const ok = await subscribeToPush();
          if (ok) { console.info(`[Push] Re-souscrit apres tentative ${i + 1}`); return; }
        } catch (err) { console.warn("[Push] subscribeToPush echec:", err); }
        await new Promise((r) => setTimeout(r, delays[i]));
      }
      console.error("[Push] Impossible de re-souscrire apres 5 tentatives");
    };
    void check();
    const handler = () => { if (document.visibilityState === "visible") void check(); };
    const onReconnect = () => { void check(); };
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("ks:socket-reconnected", onReconnect);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("ks:socket-reconnected", onReconnect);
    };
  }, [isLoggedIn]);

  /* ── Badge dans le titre de l'onglet : "(3) Kin-Sell — …"
     Effet psychologique fort : quand l'utilisateur est sur un autre onglet,
     il voit imm\u00e9diatement le compteur monter. Se r\u00e9initialise au focus. ── */
  const originalTitleRef = useRef<string>(typeof document !== "undefined" ? document.title : "Kin-Sell");
  useEffect(() => {
    if (typeof document === "undefined") return;
    const captureTitle = () => {
      const current = document.title.replace(/^\(\d+\+?\)\s*/, "");
      originalTitleRef.current = current;
    };
    const apply = () => {
      const hidden = document.visibilityState === "hidden";
      const base = originalTitleRef.current;
      if (hidden && missedCount > 0) {
        document.title = `(${missedCount > 99 ? "99+" : missedCount}) ${base}`;
      } else {
        document.title = base;
      }
    };
    if (document.visibilityState === "visible") captureTitle();
    apply();
    const onVis = () => { if (document.visibilityState === "visible") captureTitle(); apply(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.title = originalTitleRef.current;
    };
  }, [missedCount]);

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
    () => ({ messagingActive, setMessagingActive, pushEnabled, requestPushPermission, missedNotifications, missedCount, markSeen, markAllSeen }),
    [messagingActive, pushEnabled, requestPushPermission, missedNotifications, missedCount, markSeen, markAllSeen],
  );

  return (
    <GlobalNotifContext.Provider value={ctxValue}>
      {children}
      {showReconnecting &&
        createPortal(
          <div className="gn-reconnecting" role="status" aria-live="polite">
            <span className="gn-reconnecting-dot" /> Reconnexion…
            {canForceReconnect && (
              <button
                type="button"
                className="gn-reconnecting-btn"
                onClick={forceReconnect}
                aria-label="Forcer la reconnexion"
              >
                Réessayer
              </button>
            )}
          </div>,
          document.body,
        )}
      {showPushBanner &&
        createPortal(
          <div className="gn-push-banner" role="dialog" aria-live="polite">
            <div className="gn-push-banner-icon">🔔</div>
            <div className="gn-push-banner-text">
              <strong>Activez les notifications</strong>
              <p>Recevez les messages, commandes et marchandages même quand l&apos;app est en arrière-plan.</p>
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



