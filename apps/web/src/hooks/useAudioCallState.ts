/**
 * useAudioCallState — Machine d'état stricte pour appels audio Kin-Sell V2
 *
 * États : idle → outgoing_ringing | incoming_ringing → connecting → connected → ended
 *         idle → offline
 *         outgoing_ringing → cancelled | declined | unanswered
 *         incoming_ringing → cancelled (caller hung up)
 *
 * Intègre : Socket events, WebRTC, timer, mute/speaker, cleanup.
 * Ce hook est le SEUL point de gestion de l'état d'appel audio.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "./useSocket";
import { getRtcConfig, AUDIO_CONSTRAINTS, AUDIO_BITRATE, applyCodecPreferences, ICE_RESTART_DELAYS, ICE_MAX_ATTEMPTS } from "../utils/webrtc-config";
import { setEarpiece, setSpeaker, resetAudioRoute } from "../utils/audio-route";
import { showOngoingCallNotification, hideOngoingCallNotification } from "../utils/call-notification";
import { useCallSounds } from "./useCallSounds";
import { useWakeLock } from "./useWakeLock";

// ── Types ────────────────────────────────────────────────────────────────────

export type AudioCallStatus =
  | "idle"
  | "outgoing_ringing"
  | "incoming_ringing"
  | "connecting"
  | "connected"
  | "ended"
  | "cancelled"
  | "declined"
  | "unanswered"
  | "offline";

export type CallDirection = "incoming" | "outgoing";

export type ActiveCall = {
  status: AudioCallStatus;
  conversationId: string;
  remoteUserId: string;
  direction: CallDirection;
};

export type CallResult = {
  status: AudioCallStatus;
  direction: CallDirection;
  durationSeconds: number;
} | null;

const TERMINAL_STATES: Set<AudioCallStatus> = new Set([
  "ended", "cancelled", "declined", "unanswered", "offline",
]);

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAudioCallState() {
  // ── Public state ──
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [callResult, setCallResult] = useState<CallResult>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

  // ── Refs ──
  const callRef = useRef<ActiveCall | null>(null);
  const durationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const iceRestartAttemptRef = useRef(0);

  // Keep callRef in sync
  useEffect(() => { callRef.current = call; }, [call]);

  const { emit, on, off, isConnected: socketConnected } = useSocket();

  // ── Sons d'appel (réagit automatiquement aux transitions) ──
  useCallSounds(call?.status ?? null, call?.direction ?? null);

  // ── Wake lock : maintient l'écran allumé pendant un appel actif ──
  // En mode écouteur, le capteur de proximité natif (AudioRoutePlugin)
  // éteint l'écran quand le téléphone est contre l'oreille.
  // En mode haut-parleur, le wake lock Web garde l'écran allumé.
  const isInActiveCall = call != null && !TERMINAL_STATES.has(call.status);
  useWakeLock(isInActiveCall && isSpeakerOn);

  // ── Notification Android "Appel en cours" ──────────────────────────────────
  useEffect(() => {
    if (call?.status === "connected") {
      void showOngoingCallNotification("Appel en cours", call.conversationId, call.remoteUserId);
    } else if (!call || TERMINAL_STATES.has(call.status)) {
      void hideOngoingCallNotification();
    }
  }, [call?.status]);

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Transition to a new status (if call is active) */
  const transition = useCallback((status: AudioCallStatus) => {
    setCall((prev) => {
      if (!prev) return null;
      return { ...prev, status };
    });
  }, []);

  /** Stop and clear duration timer */
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  /** Start duration timer (only when connected) */
  const startTimer = useCallback(() => {
    stopTimer();
    durationRef.current = 0;
    setDurationSeconds(0);
    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setDurationSeconds(durationRef.current);
    }, 1000);
  }, [stopTimer]);

  /** Full cleanup — release all resources */
  const cleanup = useCallback(() => {
    stopTimer();
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
    iceRestartAttemptRef.current = 0;
    setIsMuted(false);
    setIsSpeakerOn(false);
    void resetAudioRoute();
  }, [stopTimer]);

  /** End call with a terminal status and record result */
  const finishCall = useCallback((terminalStatus: AudioCallStatus) => {
    const prev = callRef.current;
    if (prev) {
      const dur = prev.status === "connected" ? durationRef.current : 0;
      setCallResult({ status: terminalStatus, direction: prev.direction, durationSeconds: dur });
    }
    cleanup();
    setCall((prev) => prev ? { ...prev, status: terminalStatus } : null);
  }, [cleanup]);

  // ── WebRTC helpers ─────────────────────────────────────────────────────────

  /** Create RTCPeerConnection with ICE relay and reconnection */
  const createPC = useCallback((remoteUserId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(getRtcConfig());

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        emit("webrtc:ice-candidate", { targetUserId: remoteUserId, candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      remoteStreamRef.current = e.streams[0];
      // Create or reuse a hidden audio element for playback
      if (!remoteAudioRef.current) {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.setAttribute("playsinline", "");
        audio.style.display = "none";
        document.body.appendChild(audio);
        remoteAudioRef.current = audio;
      }
      remoteAudioRef.current.srcObject = e.streams[0];
      void remoteAudioRef.current.play().catch(() => {});
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        iceRestartAttemptRef.current = 0;
        // Transition to connected if we were in connecting
        if (callRef.current?.status === "connecting") {
          transition("connected");
          startTimer();
        }
      }

      const attemptRestart = () => {
        if (iceRestartAttemptRef.current >= ICE_MAX_ATTEMPTS) {
          finishCall("ended");
          return;
        }
        const delay = ICE_RESTART_DELAYS[Math.min(iceRestartAttemptRef.current, ICE_RESTART_DELAYS.length - 1)];
        setTimeout(() => {
          if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") return;
          iceRestartAttemptRef.current++;
          pc.restartIce();
          pc.createOffer({ iceRestart: true }).then(async (offer) => {
            await pc.setLocalDescription(offer);
            emit("webrtc:offer", { targetUserId: remoteUserId, sdp: offer });
          }).catch(() => {});
        }, delay);
      };

      if (state === "disconnected" || state === "failed") attemptRestart();
    };

    pcRef.current = pc;
    return pc;
  }, [emit, transition, startTimer, finishCall]);

  /** Get audio-only media stream */
  const getAudioStream = useCallback(async (): Promise<MediaStream> => {
    return navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
  }, []);

  /** Optimize audio sender bitrate */
  const optimizeAudioSender = useCallback(async (pc: RTCPeerConnection) => {
    applyCodecPreferences(pc);
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== "audio") continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = AUDIO_BITRATE;
        await sender.setParameters(params);
      } catch { /* browser may not support */ }
    }
  }, []);

  // ── Public actions ─────────────────────────────────────────────────────────

  /** Start an outgoing audio call */
  const startCall = useCallback(async (conversationId: string, remoteUserId: string) => {
    if (callRef.current) return; // already in a call

    try {
      const stream = await getAudioStream();
      localStreamRef.current = stream;

      const pc = createPC(remoteUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await optimizeAudioSender(pc);

      setCall({
        status: "outgoing_ringing",
        conversationId,
        remoteUserId,
        direction: "outgoing",
      });

      // Default: earpiece mode for audio calls
      void setEarpiece();
      setIsSpeakerOn(false);

      emit("call:initiate", { conversationId, targetUserId: remoteUserId, callType: "audio" });
    } catch {
      cleanup();
    }
  }, [createPC, getAudioStream, optimizeAudioSender, emit, cleanup]);

  /** Accept an incoming audio call */
  const acceptCall = useCallback(async () => {
    const c = callRef.current;
    if (!c || c.status !== "incoming_ringing") return;

    try {
      const stream = await getAudioStream();
      localStreamRef.current = stream;

      const pc = createPC(c.remoteUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await optimizeAudioSender(pc);

      // Move to connecting while waiting for WebRTC negotiation
      transition("connecting");

      // Default: earpiece mode
      void setEarpiece();
      setIsSpeakerOn(false);

      emit("call:accept", { conversationId: c.conversationId, callerId: c.remoteUserId });
    } catch {
      finishCall("ended");
    }
  }, [createPC, getAudioStream, optimizeAudioSender, emit, transition, finishCall]);

  /** Hang up — behavior depends on current state */
  const hangup = useCallback(() => {
    const c = callRef.current;
    if (!c) return;

    const { status, conversationId, remoteUserId, direction } = c;

    // Determine terminal status based on context
    if (status === "outgoing_ringing") {
      // Caller hangs up before answer → CANCELLED
      emit("call:end", { conversationId, targetUserId: remoteUserId });
      finishCall("cancelled");
    } else if (status === "incoming_ringing") {
      // Receiver explicitly rejects → DECLINED
      emit("call:reject", { conversationId, callerId: remoteUserId });
      finishCall("declined");
    } else if (status === "connected" || status === "connecting") {
      // Active call ended normally → ENDED
      emit("call:end", { conversationId, targetUserId: remoteUserId });
      finishCall("ended");
    } else {
      // Any other state — just cleanup
      emit("call:end", { conversationId, targetUserId: remoteUserId });
      finishCall("ended");
    }
  }, [emit, finishCall]);

  /** Toggle microphone mute */
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  /** Toggle speaker / earpiece */
  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => {
      const next = !prev;
      if (next) {
        void setSpeaker();
      } else {
        void setEarpiece();
      }
      return next;
    });
  }, []);

  /** Inject an incoming call externally (URL params / global notification) */
  const injectIncomingCall = useCallback((conversationId: string, remoteUserId: string) => {
    if (callRef.current) return; // already in a call
    setCall({
      status: "incoming_ringing",
      conversationId,
      remoteUserId,
      direction: "incoming",
    });
  }, []);

  // ── Socket event handlers ──────────────────────────────────────────────────

  useEffect(() => {
    /** Someone is calling us */
    const handleIncoming = (data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => {
      // Only handle audio calls in this hook. If already in a call, ignore.
      if (callRef.current) return;
      if (data.callType !== "audio") return;

      setCall({
        status: "incoming_ringing",
        conversationId: data.conversationId,
        remoteUserId: data.callerId,
        direction: "incoming",
      });
    };

    /** Our outgoing call was accepted */
    const handleAccepted = async (data: { conversationId: string; accepterId: string }) => {
      const c = callRef.current;
      if (!c || c.direction !== "outgoing") return;

      // Move to connecting, then send WebRTC offer
      transition("connecting");

      if (pcRef.current) {
        try {
          const offer = await pcRef.current.createOffer();
          await pcRef.current.setLocalDescription(offer);
          emit("webrtc:offer", { targetUserId: data.accepterId, sdp: offer });
        } catch {
          finishCall("ended");
        }
      }
    };

    /** Our outgoing call was rejected */
    const handleRejected = () => {
      const c = callRef.current;
      if (!c) return;
      finishCall("declined");
    };

    /** The other side ended the call */
    const handleEnded = () => {
      const c = callRef.current;
      if (!c) return;

      if (c.status === "connected") {
        finishCall("ended");
      } else if (c.status === "outgoing_ringing" || c.status === "connecting") {
        // Other side ended before we connected
        finishCall("ended");
      } else if (c.status === "incoming_ringing") {
        // Caller cancelled while we were ringing
        finishCall("cancelled");
      } else {
        finishCall("ended");
      }
    };

    /** No answer timeout (server-side 30s) */
    const handleNoAnswer = () => {
      const c = callRef.current;
      if (!c) return;
      finishCall("unanswered");
    };

    /** WebRTC offer received (we are the answerer) */
    const handleOffer = async (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        emit("webrtc:answer", { targetUserId: data.callerId, sdp: answer });
      } catch { /* negotiation error — ICE restart will handle */ }
    };

    /** WebRTC answer received (we are the caller) */
    const handleAnswer = async (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } catch { /* ignore */ }
    };

    /** ICE candidate received */
    const handleIce = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch { /* ignore */ }
    };

    on("call:incoming", handleIncoming);
    on("call:accepted", handleAccepted as any);
    on("call:rejected", handleRejected as any);
    on("call:ended", handleEnded as any);
    on("call:no-answer", handleNoAnswer as any);
    on("webrtc:offer", handleOffer as any);
    on("webrtc:answer", handleAnswer as any);
    on("webrtc:ice-candidate", handleIce as any);

    return () => {
      off("call:incoming", handleIncoming);
      off("call:accepted", handleAccepted as any);
      off("call:rejected", handleRejected as any);
      off("call:ended", handleEnded as any);
      off("call:no-answer", handleNoAnswer as any);
      off("webrtc:offer", handleOffer as any);
      off("webrtc:answer", handleAnswer as any);
      off("webrtc:ice-candidate", handleIce as any);
    };
  }, [on, off, emit, transition, finishCall]);

  // ── Cleanup on unmount / tab close ─────────────────────────────────────────

  useEffect(() => {
    const handler = () => {
      const c = callRef.current;
      if (c && (c.status === "connected" || c.status === "outgoing_ringing" || c.status === "incoming_ringing" || c.status === "connecting")) {
        emit("call:end", { conversationId: c.conversationId, targetUserId: c.remoteUserId });
        cleanup();
      }
    };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
    };
  }, [emit, cleanup]);

  // ── Native hangup from notification button ─────────────────────────────────
  useEffect(() => {
    const handler = () => {
      const c = callRef.current;
      if (c && (c.status === "connected" || c.status === "connecting")) {
        emit("call:end", { conversationId: c.conversationId, targetUserId: c.remoteUserId });
        finishCall("ended");
      }
    };
    window.addEventListener("ks:native-call-hangup", handler);
    return () => window.removeEventListener("ks:native-call-hangup", handler);
  }, [emit, finishCall]);

  // ── Auto-clear result after 4s ─────────────────────────────────────────────

  useEffect(() => {
    if (!callResult) return;
    const t = setTimeout(() => setCallResult(null), 4000);
    return () => clearTimeout(t);
  }, [callResult]);

  // ── Auto-reset call to null after terminal state + delay ───────────────────

  useEffect(() => {
    if (call && TERMINAL_STATES.has(call.status)) {
      const t = setTimeout(() => setCall(null), 3500);
      return () => clearTimeout(t);
    }
  }, [call?.status]);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    /** Active call state (null = idle) */
    call,
    /** Result of the last call (auto-clears after 4s) */
    callResult,
    /** Duration in seconds (only meaningful during connected state) */
    durationSeconds,
    /** Mic muted */
    isMuted,
    /** Speaker on */
    isSpeakerOn,
    /** Start an outgoing audio call */
    startCall,
    /** Accept incoming call */
    acceptCall,
    /** Hang up / cancel / reject */
    hangup,
    /** Toggle mic */
    toggleMute,
    /** Toggle speaker */
    toggleSpeaker,
    /** Inject an incoming call state externally (e.g. from URL params) */
    injectIncomingCall,
  };
}
