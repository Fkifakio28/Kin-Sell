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
type CallState = {
  type: "audio" | "video";
  conversationId: string;
  remoteUserId: string;
  direction: "incoming" | "outgoing";
  status: "ringing" | "connected" | "ended";
};

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

  /* ── Call state ── */
  const [callState, setCallState] = useState<CallState | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Message toasts ── */
  const [toasts, setToasts] = useState<MessageToast[]>([]);

  /* ── Push notification state ── */
  const [pushEnabled, setPushEnabled] = useState(false);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const pushSubscribedRef = useRef(false);

  /* ── Register SW + auto-subscribe to push on login ── */
  useEffect(() => {
    if (!isLoggedIn || !isPushSupported()) return;
    if (pushSubscribedRef.current) return;
    pushSubscribedRef.current = true;

    void registerServiceWorker();

    // Auto-subscribe if permission already granted
    if (Notification.permission === "granted") {
      void subscribeToPush().then((ok) => setPushEnabled(ok));
    } else if (Notification.permission === "default") {
      // Show banner after a short delay
      const timer = setTimeout(() => setShowPushBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn]);

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

  /* ── Ringtone (only when NOT handled by DashboardMessaging) ── */
  useEffect(() => {
    if (messagingActiveRef.current) return;
    const isRinging = callState?.status === "ringing";
    if (!isRinging) {
      if (ringtoneIntervalRef.current) {
        clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
      }
      return;
    }
    const playTone = () => {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(ctx.destination);
        osc.frequency.value = callState?.direction === "incoming" ? 440 : 480;
        g.gain.setValueAtTime(0.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
        setTimeout(() => ctx.close(), 700);
      } catch {}
    };
    playTone();
    ringtoneIntervalRef.current = setInterval(playTone, 2000);
    return () => {
      if (ringtoneIntervalRef.current) clearInterval(ringtoneIntervalRef.current);
    };
  }, [callState?.status, callState?.direction]);

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

  /* ── WebRTC helpers ── */
  const emitSocket = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const cleanupCall = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  const createPeerConnection = useCallback(
    (remoteUserId: string) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      });
      pc.onicecandidate = (e) => {
        if (e.candidate) emitSocket("webrtc:ice-candidate", { targetUserId: remoteUserId, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        remoteStreamRef.current = e.streams[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      };
      peerConnectionRef.current = pc;
      return pc;
    },
    [emitSocket],
  );

  const acceptCall = useCallback(async () => {
    if (!callState) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callState.type === "video" });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPeerConnection(callState.remoteUserId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      emitSocket("call:accept", { conversationId: callState.conversationId, callerId: callState.remoteUserId });
      setCallState((p) => (p ? { ...p, status: "connected" } : null));
    } catch {
      alert("Impossible d'accéder au micro/caméra.");
    }
  }, [callState, createPeerConnection, emitSocket]);

  const rejectCall = useCallback(() => {
    if (!callState) return;
    emitSocket("call:reject", { conversationId: callState.conversationId, callerId: callState.remoteUserId });
    cleanupCall();
    setCallState(null);
  }, [callState, emitSocket, cleanupCall]);

  const endCall = useCallback(() => {
    if (!callState) return;
    emitSocket("call:end", { conversationId: callState.conversationId, targetUserId: callState.remoteUserId });
    cleanupCall();
    setCallState(null);
  }, [callState, emitSocket, cleanupCall]);

  const dismissToast = useCallback((id: string) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  /* ── Socket event listeners ── */
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !isLoggedIn) return;

    const handleIncoming = (data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => {
      if (messagingActiveRef.current) return;
      setCallState({
        type: data.callType,
        conversationId: data.conversationId,
        remoteUserId: data.callerId,
        direction: "incoming",
        status: "ringing",
      });
    };

    const handleAccepted = async (data: { conversationId: string; accepterId: string }) => {
      if (messagingActiveRef.current) return;
      setCallState((p) => (p ? { ...p, status: "connected" } : null));
      if (peerConnectionRef.current) {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        emitSocket("webrtc:offer", { targetUserId: data.accepterId, sdp: offer });
      }
    };

    const handleRejected = () => {
      if (messagingActiveRef.current) return;
      cleanupCall();
      setCallState(null);
    };

    const handleEnded = () => {
      if (messagingActiveRef.current) return;
      cleanupCall();
      setCallState(null);
    };

    const handleOffer = async (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => {
      if (messagingActiveRef.current) return;
      if (!peerConnectionRef.current) return;
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const ans = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(ans);
      emitSocket("webrtc:answer", { targetUserId: data.callerId, sdp: ans });
    };

    const handleAnswer = async (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => {
      if (messagingActiveRef.current) return;
      if (peerConnectionRef.current)
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
    };

    const handleIce = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (messagingActiveRef.current) return;
      if (peerConnectionRef.current)
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    };

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

    socket.on("call:incoming", handleIncoming);
    socket.on("call:accepted", handleAccepted);
    socket.on("call:rejected", handleRejected);
    socket.on("call:ended", handleEnded);
    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIce);
    socket.on("message:new", handleNewMessage);

    return () => {
      socket.off("call:incoming", handleIncoming);
      socket.off("call:accepted", handleAccepted);
      socket.off("call:rejected", handleRejected);
      socket.off("call:ended", handleEnded);
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIce);
      socket.off("message:new", handleNewMessage);
    };
  }, [isLoggedIn, emitSocket, user?.id, cleanupCall, playMessageSound]);

  /* ── Context value ── */
  const ctxValue = useMemo(
    () => ({ messagingActive, setMessagingActive, pushEnabled, requestPushPermission }),
    [messagingActive, pushEnabled, requestPushPermission],
  );

  return (
    <GlobalNotifContext.Provider value={ctxValue}>
      {children}

      {/* ── Call overlay (portal — visible on every page) ── */}
      {!messagingActive &&
        callState &&
        createPortal(
          <div className="gn-call-overlay">
            {callState.status === "ringing" && callState.direction === "incoming" && (
              <div className="gn-call-dialog">
                <div className="gn-ringtone-pulse">
                  <span className="gn-ringtone-dot" />
                  <span className="gn-ringtone-dot" />
                  <span className="gn-ringtone-dot" />
                </div>
                <p className="gn-call-label">
                  📞 Appel {callState.type === "video" ? "vidéo" : "audio"} entrant
                </p>
                <div className="gn-call-actions">
                  <button className="gn-call-btn gn-call-btn--accept" onClick={() => void acceptCall()}>
                    Accepter
                  </button>
                  <button className="gn-call-btn gn-call-btn--reject" onClick={rejectCall}>
                    Refuser
                  </button>
                </div>
              </div>
            )}
            {(callState.status === "connected" ||
              (callState.status === "ringing" && callState.direction === "outgoing")) && (
              <div className="gn-call-dialog">
                {callState.status === "ringing" && (
                  <div className="gn-ringtone-pulse">
                    <span className="gn-ringtone-dot" />
                    <span className="gn-ringtone-dot" />
                    <span className="gn-ringtone-dot" />
                  </div>
                )}
                {callState.type === "video" && (
                  <div className="gn-call-videos">
                    <video ref={remoteVideoRef} autoPlay playsInline className="gn-call-video-remote" />
                    <video ref={localVideoRef} autoPlay playsInline muted className="gn-call-video-local" />
                  </div>
                )}
                <p className="gn-call-label">
                  {callState.status === "ringing"
                    ? "Appel en cours..."
                    : `Appel ${callState.type === "video" ? "vidéo" : "audio"} connecté`}
                </p>
                <button className="gn-call-btn gn-call-btn--reject" onClick={endCall}>
                  Raccrocher
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}

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
