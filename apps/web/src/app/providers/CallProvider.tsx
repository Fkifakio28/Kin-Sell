/**
 * CallProvider — Contexte global pour les appels audio Kin-Sell V2
 *
 * Rend l'état d'appel persistant à travers toute l'application :
 * - Le WebRTC survit à la navigation entre pages
 * - Le FloatingCallBadge s'affiche globalement quand l'appel est minimisé
 * - Un seul appel à la fois est autorisé (startCall bloqué si déjà en appel)
 * - beforeunload prévient l'utilisateur avant de fermer l'onglet
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAudioCallState, type ActiveCall, type CallResult, type AudioCallStatus } from "../../hooks/useAudioCallState";
import type { AudioRoute } from "../../utils/audio-route";
import { FloatingCallBadge } from "../../components/FloatingCallBadge";

/* ── Context shape ── */

interface CallContextValue {
  call: ActiveCall | null;
  callResult: CallResult;
  durationSeconds: number;
  isMuted: boolean;
  isSpeakerOn: boolean;
  audioRoute: AudioRoute;
  availableAudioRoutes: AudioRoute[];
  callMinimized: boolean;
  startCall: (conversationId: string, remoteUserId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  setRoute: (route: AudioRoute) => Promise<void>;
  injectIncomingCall: (
    conversationId: string,
    remoteUserId: string,
    extras?: { callId?: string; expiresAt?: number },
  ) => void;
  minimizeCall: () => void;
  restoreCall: () => void;
  /** Register the contact display name for the floating badge */
  setCallContactName: (name: string) => void;
}

const CallContext = createContext<CallContextValue | null>(null);

/* ── Provider ── */

const TERMINAL_STATES: Set<AudioCallStatus> = new Set([
  "ended", "cancelled", "declined", "unanswered", "offline",
]);

export const CallProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const audioState = useAudioCallState();
  const [callMinimized, setCallMinimized] = useState(false);
  const contactNameRef = useRef("Appel en cours");
  const [contactName, setContactNameState] = useState("Appel en cours");
  const navigate = useNavigate();
  const location = useLocation();

  // Reset contact name when call ends
  useEffect(() => {
    if (!audioState.call || TERMINAL_STATES.has(audioState.call.status)) {
      setCallMinimized(false);
      contactNameRef.current = "Appel en cours";
      setContactNameState("Appel en cours");
    }
  }, [audioState.call?.status]);

  const setCallContactName = useCallback((name: string) => {
    contactNameRef.current = name;
    setContactNameState(name);
  }, []);

  const minimizeCall = useCallback(() => setCallMinimized(true), []);
  const restoreCall = useCallback(() => {
    setCallMinimized(false);
    // Navigate to messaging if not already there
    const path = location.pathname;
    if (!path.startsWith("/messaging") && !path.startsWith("/account")) {
      const convId = audioState.call?.conversationId;
      if (convId) {
        navigate(`/messaging/${convId}`);
      } else {
        navigate("/messaging");
      }
    }
  }, [location.pathname, navigate, audioState.call?.conversationId]);

  // beforeunload — warn user before closing tab during active call
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (audioState.call && !TERMINAL_STATES.has(audioState.call.status)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [audioState.call?.status]);

  // Auto-minimize when navigating away from messaging during active call
  useEffect(() => {
    const path = location.pathname;
    const inMessaging = path.startsWith("/messaging") || path.startsWith("/account");
    if (!inMessaging && audioState.call && !TERMINAL_STATES.has(audioState.call.status)) {
      setCallMinimized(true);
    }
  }, [location.pathname, audioState.call?.status]);

  const value: CallContextValue = {
    call: audioState.call,
    callResult: audioState.callResult,
    durationSeconds: audioState.durationSeconds,
    isMuted: audioState.isMuted,
    isSpeakerOn: audioState.isSpeakerOn,
    audioRoute: audioState.audioRoute,
    availableAudioRoutes: audioState.availableAudioRoutes,
    callMinimized,
    startCall: audioState.startCall,
    acceptCall: audioState.acceptCall,
    hangup: audioState.hangup,
    toggleMute: audioState.toggleMute,
    toggleSpeaker: audioState.toggleSpeaker,
    setRoute: audioState.setRoute,
    injectIncomingCall: audioState.injectIncomingCall,
    minimizeCall,
    restoreCall,
    setCallContactName,
  };

  return (
    <CallContext.Provider value={value}>
      {children}

      {/* Global floating badge when call is minimized */}
      {callMinimized && audioState.call && !TERMINAL_STATES.has(audioState.call.status) && (
        <FloatingCallBadge
          contactName={contactName}
          durationSeconds={audioState.durationSeconds}
          status={audioState.call.status}
          onRestore={restoreCall}
        />
      )}
    </CallContext.Provider>
  );
};

/* ── Hook ── */

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within <CallProvider>");
  return ctx;
}
