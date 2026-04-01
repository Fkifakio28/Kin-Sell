import { useEffect, useState, useRef, useCallback, useMemo, type CSSProperties, type FormEvent } from "react";
import { useAuth } from "../../app/providers/AuthProvider";
import { Navigate } from "react-router-dom";
import {
  messaging,
  type ConversationSummary,
  type ChatMessage,
  type MessageUser,
} from "../../lib/api-client";
import { useSocket } from "../../hooks/useSocket";
import { createOptimizedAudioRecorder, createUploadFile, prepareMediaUrl } from "../../utils/media-upload";
import "./messaging.css";

/* ── Emoji data ── */
const EMOJI_CATEGORIES: { icon: string; emojis: string[] }[] = [
  { icon: "😀", emojis: ["😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","🥰","😘","😗","😙","😚","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫","😴","🤤","😛","😜","😝","🤑","🤗","🤭","🤫","🤥","😬","🤒","🤕","🤢","🤮","🤧","😇","🥳","🥺","🤠","🤡","🥱","🥴","😈","👿","👹","👺","💀","👻","👽","🤖","💩","😺","😸","😹","😻","😼","😽","🙀","😿","😾"] },
  { icon: "👋", emojis: ["👋","🤚","🖐","✋","🖖","👌","🤌","🤏","✌","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍","💅","🤳","💪","🦵","🦶","👂","👃","🧠","👀","👁","👅","👄","💋","👶","👧","🧒","👦","👩","🧑","👨","👩‍🦱","🧑‍🦱","👱‍♀","👱","👩‍🦳","🧓","👴","👵"] },
  { icon: "❤️", emojis: ["❤","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣","💕","💞","💓","💗","💖","💘","💝","💟","♥","💌","💒","💍","💎","💐","🌹","🥀","🌺","🌷","🌸","💮","🏵","🌻","🌼","🌱","🌿","☘","🍀","🍃","🍂","🍁","🌾","🌵","🌴","🌳","🌲"] },
  { icon: "🐶", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷","🐢","🐍","🦎","🦂","🦀","🦞","🦐","🦑","🐙","🦈","🐬","🐳","🐋","🐊","🐆","🐅","🐃","🐂","🐄","🦌","🐪","🐫","🦙","🦒","🐘"] },
  { icon: "🍕", emojis: ["🍕","🍔","🍟","🌭","🥪","🌮","🌯","🫔","🥙","🧆","🥚","🍳","🥘","🍲","🫕","🥣","🥗","🍿","🧈","🧂","🥫","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍢","🍣","🍤","🍥","🥮","🍡","🥟","🥠","🥡","🦀","🦞","🦐","🦑","🦪","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬","🍭","🍮","🍯","🍼","🥛","☕","🫖","🍵","🍶","🍾","🍷","🍸","🍹","🍺","🍻","🥂","🥃"] },
  { icon: "⚽", emojis: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸","🥌","🎿","⛷","🏂","🪂","🏋","🤼","🤸","🤺","⛹","🏊","🚣","🧗","🚵","🚴","🏆","🥇","🥈","🥉","🎖","🏅","🎗","🎪","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🪘","🎷","🎺","🪗","🎸","🪕","🎻"] },
  { icon: "🚗", emojis: ["🚗","🚕","🚙","🚌","🚎","🏎","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍","🛵","🚲","🛴","🛹","🛼","🚏","🛣","🛤","🛞","⛽","🚨","🚥","🚦","🛑","🚧","⚓","⛵","🛶","🚤","🛳","⛴","🛥","🚢","✈","🛩","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰","🚀","🛸","🌍","🌎","🌏","🌐","🗺","🧭","🏔","⛰","🌋","🗻","🏕","🏖","🏜","🏝","🏞","🏟","🏛","🏗","🧱","🪨","🪵","🛖","🏘","🏚","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🛕","🕍","⛩","🕋","⛲","⛺"] },
];

/* ── Helpers ── */
function timeLabel(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "À l'instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function fullTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}

function getConversationName(conv: ConversationSummary, myId: string) {
  if (conv.isGroup) return conv.groupName ?? "Groupe";
  const other = conv.participants.find((p) => p.userId !== myId);
  return other?.user.profile.displayName ?? "Utilisateur";
}

function getConversationAvatar(conv: ConversationSummary, myId: string) {
  if (conv.isGroup) return conv.groupAvatar;
  const other = conv.participants.find((p) => p.userId !== myId);
  return other?.user.profile.avatarUrl ?? null;
}

function getOtherUserId(conv: ConversationSummary, myId: string) {
  const other = conv.participants.find((p) => p.userId !== myId);
  return other?.userId ?? null;
}

function getOtherParticipant(conv: ConversationSummary, myId: string) {
  return conv.participants.find((p) => p.userId !== myId) ?? null;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatAudioTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "vu à l'instant";
  if (mins < 60) return `vu il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `vu il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "vu hier";
  return `vu il y a ${days}j`;
}

/* ── Custom Audio Player Component ── */
function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => { setCurrentTime(audio.currentTime); setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0); };
    const onMeta = () => { setDuration(audio.duration); };
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => { audio.removeEventListener("timeupdate", onTime); audio.removeEventListener("loadedmetadata", onMeta); audio.removeEventListener("ended", onEnd); };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { void audio.play(); }
    setPlaying(!playing);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  };

  return (
    <div className={`msg-audio-player${playing ? " msg-audio-player--playing" : ""}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button className="msg-audio-play-btn" onClick={toggle} type="button">
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        )}
      </button>
      <div className="msg-audio-track">
        <div className="msg-audio-progress-bg" onClick={seek}>
          <div className="msg-audio-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="msg-audio-time">{formatAudioTime(currentTime)} / {formatAudioTime(duration || 0)}</span>
      </div>
    </div>
  );
}

/* ── Component ── */
export function MessagingPage() {
  const { user, isLoading, isLoggedIn } = useAuth();
  const { emit, on, off, isConnected } = useSocket();

  /* ── State ── */
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConv, setActiveConv] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null; city: string | null } }>>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [lastSeenMap, setLastSeenMap] = useState<Map<string, string>>(new Map());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  /* ── New UX states ── */
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [archivedConvIds, setArchivedConvIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [pinnedConvIds, setPinnedConvIds] = useState<Set<string>>(new Set());
  const [mutedConvIds, setMutedConvIds] = useState<Set<string>>(new Set());
  const [blockedConvIds, setBlockedConvIds] = useState<Set<string>>(new Set());
  const [convContextMenu, setConvContextMenu] = useState<{ x: number; y: number; convId: string } | null>(null);
  const [profileUser, setProfileUser] = useState<{ displayName: string; avatarUrl: string | null; username: string | null; userId: string } | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Call state ── */
  const [callState, setCallState] = useState<null | { type: "audio" | "video"; conversationId: string; remoteUserId: string; direction: "incoming" | "outgoing"; status: "ringing" | "connected" | "ended" }>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── MessageGuard feedback ── */
  const [guardAlert, setGuardAlert] = useState<{ type: "warn" | "block"; message: string } | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const guardAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myId = user?.id ?? "";
  const myRole = user?.role ?? "";

  // In a DM with admin, non-admin users cannot reply
  const isAdminDM = useMemo(() => {
    if (!activeConv || activeConv.isGroup) return false;
    if (myRole === "ADMIN" || myRole === "SUPER_ADMIN") return false;
    return activeConv.participants.some(
      (p) => p.userId !== myId && (p.user.role === "ADMIN" || p.user.role === "SUPER_ADMIN")
    );
  }, [activeConv, myId, myRole]);

  /* ── Ringtone effect (plays during ringing state) ── */
  useEffect(() => {
    const isRinging = callState?.status === "ringing";
    if (!isRinging) {
      if (ringtoneIntervalRef.current) { clearInterval(ringtoneIntervalRef.current); ringtoneIntervalRef.current = null; }
      return;
    }
    const playTone = () => {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = callState?.direction === "incoming" ? 440 : 480;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
        setTimeout(() => ctx.close(), 700);
      } catch { /* ignore audio policy */ }
    };
    playTone();
    ringtoneIntervalRef.current = setInterval(playTone, 2000);
    return () => { if (ringtoneIntervalRef.current) clearInterval(ringtoneIntervalRef.current); };
  }, [callState?.status, callState?.direction]);

  /* ── Load conversations ── */
  useEffect(() => {
    if (!isLoggedIn) return;
    setLoadingConvs(true);
    messaging.conversations()
      .then((data) => setConversations(data.conversations))
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, [isLoggedIn]);

  /* ── Load messages when active conversation changes ── */
  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    setLoadingMsgs(true);
    messaging.messages(activeConv.id)
      .then((data) => {
        setMessages(data.messages);
        void messaging.markRead(activeConv.id);
        emit("conversation:read", { conversationId: activeConv.id });
      })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [activeConv?.id, emit]);

  /* ── Scroll to bottom ── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Socket events ── */
  useEffect(() => {
    const handleNewMessage = (data: { message: ChatMessage }) => {
      const msg = data.message as ChatMessage;
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Update conversation list
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversationId ? { ...c, messages: [msg], updatedAt: msg.createdAt, unreadCount: c.id === activeConv?.id ? c.unreadCount : (c.unreadCount ?? 0) + 1 } : c
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
      // Auto mark read if in active conv
      if (msg.conversationId === activeConv?.id && msg.senderId !== myId) {
        void messaging.markRead(msg.conversationId);
        emit("conversation:read", { conversationId: msg.conversationId });
      }
    };

    const handleEditedMessage = (data: { message: ChatMessage }) => {
      const msg = data.message as ChatMessage;
      setMessages((prev) => prev.map((m) => m.id === msg.id ? msg : m));
    };

    const handleDeletedMessage = (data: { messageId: string }) => {
      setMessages((prev) => prev.map((m) => m.id === data.messageId ? { ...m, isDeleted: true, content: null, mediaUrl: null } : m));
    };

    const handleTypingStart = (data: { conversationId: string; userId: string }) => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (!next.has(data.conversationId)) next.set(data.conversationId, new Set());
        next.get(data.conversationId)!.add(data.userId);
        return next;
      });
    };

    const handleTypingStop = (data: { conversationId: string; userId: string }) => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.get(data.conversationId)?.delete(data.userId);
        return next;
      });
    };

    const handleOnline = (data: { userId: string }) => {
      setOnlineUserIds((prev) => new Set(prev).add(data.userId));
    };

    const handlePresenceSnapshot = (data: { userIds: string[] }) => {
      setOnlineUserIds(new Set(data.userIds));
    };

    const handleOffline = (data: { userId: string; lastSeenAt?: string }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        next.delete(data.userId);
        return next;
      });
      if (data.lastSeenAt) {
        setLastSeenMap((prev) => new Map(prev).set(data.userId, data.lastSeenAt!));
      }
    };

    const handleConvRead = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId === activeConv?.id) {
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            readReceipts: m.senderId === myId && !m.readReceipts.some((r) => r.userId === data.userId)
              ? [...m.readReceipts, { userId: data.userId, readAt: new Date().toISOString() }]
              : m.readReceipts,
          }))
        );
      }
    };

    on("message:new", handleNewMessage);
    on("message:edited", handleEditedMessage);
    on("message:deleted", handleDeletedMessage);
    on("typing:start", handleTypingStart);
    on("typing:stop", handleTypingStop);
    on("presence:snapshot", handlePresenceSnapshot);
    on("user:online", handleOnline);
    on("user:offline", handleOffline);
    on("conversation:read", handleConvRead);

    return () => {
      off("message:new", handleNewMessage);
      off("message:edited", handleEditedMessage);
      off("message:deleted", handleDeletedMessage);
      off("typing:start", handleTypingStart);
      off("typing:stop", handleTypingStop);
      off("presence:snapshot", handlePresenceSnapshot);
      off("user:online", handleOnline);
      off("user:offline", handleOffline);
      off("conversation:read", handleConvRead);
    };
  }, [on, off, activeConv?.id, myId, emit]);

  /* ── WebRTC call socket events ── */
  useEffect(() => {
    const handleIncomingCall = (data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => {
      setCallState({ type: data.callType, conversationId: data.conversationId, remoteUserId: data.callerId, direction: "incoming", status: "ringing" });
    };

    const handleCallAccepted = async (data: { conversationId: string; accepterId: string }) => {
      setCallState((prev) => prev ? { ...prev, status: "connected" } : null);
      // Create and send offer
      if (peerConnectionRef.current) {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        emit("webrtc:offer", { targetUserId: data.accepterId, sdp: offer });
      }
    };

    const handleCallRejected = () => {
      cleanupCall();
      setCallState(null);
    };

    const handleCallEnded = () => {
      cleanupCall();
      setCallState(null);
    };

    const handleOffer = async (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!peerConnectionRef.current) return;
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      emit("webrtc:answer", { targetUserId: data.callerId, sdp: answer });
    };

    const handleAnswer = async (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!peerConnectionRef.current) return;
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
    };

    const handleIceCandidate = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      if (!peerConnectionRef.current) return;
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    };

    on("call:incoming", handleIncomingCall);
    on("call:accepted", handleCallAccepted as (data: { conversationId: string; accepterId: string }) => void);
    on("call:rejected", handleCallRejected as (data: { conversationId: string; rejecterId: string }) => void);
    on("call:ended", handleCallEnded as (data: { conversationId: string; enderId: string }) => void);
    on("webrtc:offer", handleOffer as (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => void);
    on("webrtc:answer", handleAnswer as (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => void);
    on("webrtc:ice-candidate", handleIceCandidate as (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => void);

    return () => {
      off("call:incoming", handleIncomingCall);
      off("call:accepted", handleCallAccepted as (data: { conversationId: string; accepterId: string }) => void);
      off("call:rejected", handleCallRejected as (data: { conversationId: string; rejecterId: string }) => void);
      off("call:ended", handleCallEnded as (data: { conversationId: string; enderId: string }) => void);
      off("webrtc:offer", handleOffer as (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => void);
      off("webrtc:answer", handleAnswer as (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => void);
      off("webrtc:ice-candidate", handleIceCandidate as (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => void);
    };
  }, [on, off, emit]);

  /* ── WebRTC helpers ── */
  const createPeerConnection = useCallback((remoteUserId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        emit("webrtc:ice-candidate", { targetUserId: remoteUserId, candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [emit]);

  const cleanupCall = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  const startCall = useCallback(async (callType: "audio" | "video") => {
    if (!activeConv || activeConv.isGroup) return;
    const remoteUserId = getOtherUserId(activeConv, myId);
    if (!remoteUserId) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === "video",
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(remoteUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      setCallState({ type: callType, conversationId: activeConv.id, remoteUserId, direction: "outgoing", status: "ringing" });
      emit("call:initiate", { conversationId: activeConv.id, targetUserId: remoteUserId, callType });
    } catch {
      alert("Impossible d'accéder au micro/caméra.");
    }
  }, [activeConv, myId, createPeerConnection, emit]);

  const acceptCall = useCallback(async () => {
    if (!callState) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callState.type === "video",
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(callState.remoteUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      emit("call:accept", { conversationId: callState.conversationId, callerId: callState.remoteUserId });
      setCallState((prev) => prev ? { ...prev, status: "connected" } : null);
    } catch {
      alert("Impossible d'accéder au micro/caméra.");
    }
  }, [callState, createPeerConnection, emit]);

  const rejectCall = useCallback(() => {
    if (!callState) return;
    emit("call:reject", { conversationId: callState.conversationId, callerId: callState.remoteUserId });
    cleanupCall();
    setCallState(null);
  }, [callState, emit, cleanupCall]);

  const endCall = useCallback(() => {
    if (!callState) return;
    emit("call:end", { conversationId: callState.conversationId, targetUserId: callState.remoteUserId });
    cleanupCall();
    setCallState(null);
  }, [callState, emit, cleanupCall]);

  /* ── Typing indicator ── */
  const handleTyping = useCallback(() => {
    if (!activeConv) return;
    emit("typing:start", { conversationId: activeConv.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emit("typing:stop", { conversationId: activeConv.id });
    }, 2000);
  }, [activeConv, emit]);

  /* ── Send ── */
  const showGuardAlert = useCallback((type: "warn" | "block", message: string) => {
    if (guardAlertTimerRef.current) clearTimeout(guardAlertTimerRef.current);
    setGuardAlert({ type, message });
    guardAlertTimerRef.current = setTimeout(() => setGuardAlert(null), type === "block" ? 8000 : 5000);
  }, []);

  const handleSend = useCallback((e?: FormEvent) => {
    e?.preventDefault();
    if (!activeConv) return;

    const text = draft.trim();
    if (!text && !editingMsg) return;

    if (editingMsg) {
      emit("message:edit", { messageId: editingMsg.id, content: text }, () => {});
      setEditingMsg(null);
      setDraft("");
      return;
    }

    emit("message:send", {
      conversationId: activeConv.id,
      content: text,
      type: "TEXT",
      replyToId: replyTo?.id,
    }, (res: any) => {
      if (res && !res.ok) {
        showGuardAlert("block", res.error || "🔒 Message bloqué par le système de sécurité.");
        setDraft(text); // restore draft so user can edit
        return;
      }
      if (res?.guardWarning) {
        showGuardAlert("warn", res.guardWarning);
      }
    });

    setDraft("");
    setReplyTo(null);
    emit("typing:stop", { conversationId: activeConv.id });
  }, [activeConv, draft, replyTo, editingMsg, emit, showGuardAlert]);

  /* ── Send media (image/file) ── */
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeConv) return;

    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      const isAudio = file.type.startsWith("audio/");
      const isVideo = file.type.startsWith("video/");

      const mediaUrl = await prepareMediaUrl(file);

      emit("message:send", {
        conversationId: activeConv.id,
        type: isImage ? "IMAGE" : isAudio ? "AUDIO" : isVideo ? "VIDEO" : "FILE",
        mediaUrl,
        fileName: file.name,
        replyToId: replyTo?.id,
      }, (res: any) => {
        if (res && !res.ok) {
          showGuardAlert("block", res.error || "🔒 Fichier bloqué par le système de sécurité.");
          return;
        }
        if (res?.guardWarning) {
          showGuardAlert("warn", res.guardWarning);
        }
      });
    }

    setReplyTo(null);
  }, [activeConv, replyTo, emit, showGuardAlert]);

  /* ── Audio recording with waveform ── */
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ef4444";
      ctx.beginPath();
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
  }, []);

  const startRecordingAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = createOptimizedAudioRecorder(stream);
      audioChunksRef.current = [];

      // Set up waveform analyser
      const actx = new AudioContext();
      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = actx;
      analyserRef.current = analyser;

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        void (async () => {
          if (!activeConv) return;
          const mediaUrl = await prepareMediaUrl(createUploadFile(blob, "audio-message.webm", "audio/webm"));
          emit("message:send", {
            conversationId: activeConv.id,
            type: "AUDIO",
            mediaUrl,
            fileName: "audio-message.webm",
          }, (res: any) => {
            if (res && !res.ok) {
              showGuardAlert("block", res.error || "🔒 Audio bloqué par le système de sécurité.");
              return;
            }
            if (res?.guardWarning) {
              showGuardAlert("warn", res.guardWarning);
            }
          });
        })();
        stream.getTracks().forEach((t) => t.stop());
        actx.close();
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecordingAudio(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
      // Start waveform drawing after canvas is mounted
      setTimeout(() => drawWaveform(), 50);
    } catch {
      alert("Impossible d'accéder au micro.");
    }
  }, [activeConv, emit, drawWaveform]);

  const stopRecordingAudio = useCallback(() => {
    mediaRecorder?.stop();
    setMediaRecorder(null);
    setRecordingAudio(false);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
  }, [mediaRecorder]);

  const cancelRecordingAudio = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = () => {
        // do nothing - cancelled
        const stream = mediaRecorder.stream;
        stream.getTracks().forEach((t) => t.stop());
        audioContextRef.current?.close();
      };
      mediaRecorder.stop();
    }
    setMediaRecorder(null);
    setRecordingAudio(false);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
  }, [mediaRecorder]);

  /* ── Emoji insert ── */
  const insertEmoji = useCallback((emoji: string) => {
    setDraft((prev) => prev + emoji);
  }, []);

  /* ── Search users ── */
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timeout = setTimeout(() => {
      messaging.searchUsers(searchQuery)
        .then((data) => setSearchResults(data.users))
        .catch((err) => { console.error("[messaging] search error:", err); setSearchResults([]); });
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const startDMConversation = useCallback(async (targetUserId: string) => {
    try {
      const { conversation } = await messaging.createDM(targetUserId);
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversation.id);
        return exists ? prev : [conversation, ...prev];
      });
      setActiveConv(conversation);
      setShowSearch(false);
      setSearchQuery("");
      setShowSidebar(false);
    } catch { /* ignore */ }
  }, []);

  /* ── Context menu close ── */
  useEffect(() => {
    const close = () => { setContextMenu(null); setConvContextMenu(null); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardOffset = () => {
      if (!window.matchMedia("(max-width: 768px)").matches) {
        setKeyboardOffset(0);
        return;
      }

      const nextOffset = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      setKeyboardOffset(nextOffset);
      if (nextOffset > 0) {
        messagesEndRef.current?.scrollIntoView({ block: "end" });
      }
    };

    updateKeyboardOffset();
    viewport.addEventListener("resize", updateKeyboardOffset);
    viewport.addEventListener("scroll", updateKeyboardOffset);
    window.addEventListener("orientationchange", updateKeyboardOffset);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardOffset);
      viewport.removeEventListener("scroll", updateKeyboardOffset);
      window.removeEventListener("orientationchange", updateKeyboardOffset);
    };
  }, []);

  /* ── Guards ── */
  if (isLoading) return <div className="msg-loading">Chargement...</div>;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const typingInConv = activeConv ? typingUsers.get(activeConv.id) : undefined;
  const typingNames = typingInConv
    ? Array.from(typingInConv)
        .filter((uid) => uid !== myId)
        .map((uid) => {
          const p = activeConv?.participants.find((pp) => pp.userId === uid);
          return p?.user.profile.displayName ?? "Quelqu'un";
        })
    : [];

  return (
    <div
      className="msg-shell"
      style={{ "--ks-kb-offset": `${keyboardOffset}px` } as CSSProperties}
    >
      {/* ══ Incoming call overlay ══ */}
      {callState && callState.status === "ringing" && callState.direction === "incoming" && (
        <div className="msg-call-overlay">
          <div className="msg-call-dialog">
            <div className="msg-ringtone-pulse">
              <span className="msg-ringtone-dot" />
              <span className="msg-ringtone-dot" />
              <span className="msg-ringtone-dot" />
            </div>
            <p className="msg-call-label">📞 Appel {callState.type === "video" ? "vidéo" : "audio"} entrant</p>
            <div className="msg-call-actions">
              <button className="msg-call-btn msg-call-btn--accept" onClick={() => void acceptCall()}>Accepter</button>
              <button className="msg-call-btn msg-call-btn--reject" onClick={rejectCall}>Refuser</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Active/outgoing call overlay ══ */}
      {callState && (callState.status === "connected" || (callState.status === "ringing" && callState.direction === "outgoing")) && (
        <div className="msg-call-overlay msg-call-overlay--active">
          <div className="msg-call-dialog msg-call-dialog--active">
            {callState.status === "ringing" && (
              <div className="msg-ringtone-pulse">
                <span className="msg-ringtone-dot" />
                <span className="msg-ringtone-dot" />
                <span className="msg-ringtone-dot" />
              </div>
            )}
            {callState.type === "video" && (
              <div className="msg-call-videos">
                <video ref={remoteVideoRef} autoPlay playsInline className="msg-call-video-remote" />
                <video ref={localVideoRef} autoPlay playsInline muted className="msg-call-video-local" />
              </div>
            )}
            <p className="msg-call-label">
              {callState.status === "ringing" ? "Appel en cours..." : `Appel ${callState.type} connecté`}
            </p>
            <button className="msg-call-btn msg-call-btn--reject" onClick={endCall}>Raccrocher</button>
          </div>
        </div>
      )}

      {/* ══ Profile modal ══ */}
      {profileUser && (
        <div className="msg-profile-overlay" onClick={() => setProfileUser(null)}>
          <div className="msg-profile-card" onClick={(e) => e.stopPropagation()}>
            <button className="msg-profile-close" onClick={() => setProfileUser(null)}>✕</button>
            <div className="msg-profile-avatar">
              {profileUser.avatarUrl ? <img src={profileUser.avatarUrl} alt="" /> : initials(profileUser.displayName)}
            </div>
            <p className="msg-profile-name">{profileUser.displayName}</p>
            {profileUser.username && <p className="msg-profile-username">@{profileUser.username}</p>}
            <p className="msg-profile-id">ID Kin-Sell: {profileUser.userId.slice(0, 12)}</p>
            <div className="msg-profile-actions">
              <button className="msg-profile-action-btn msg-profile-action-btn--primary" onClick={() => setProfileUser(null)}>Envoyer un message</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Sidebar ══ */}
      <aside className={`msg-sidebar${showSidebar ? "" : " msg-sidebar--hidden"}`}>
        <div className="msg-sidebar-header">
          <h2>Messages</h2>
          <div className="msg-sidebar-actions">
            <button className={`msg-icon-btn${showArchived ? " msg-icon-btn--active" : ""}`} title={showArchived ? "Retour aux conversations" : "Archives"} onClick={() => setShowArchived(!showArchived)}>
              {archivedConvIds.size > 0 && !showArchived && <span className="msg-archive-dot" />}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            </button>
            <button className="msg-icon-btn" title="Nouvelle conversation" onClick={() => setShowSearch(!showSearch)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          {isConnected && <span className="msg-online-dot" title="Connecté" />}
        </div>

        {/* Search */}
        {showSearch && (
          <div className="msg-search-panel">
            <input
              className="msg-search-input"
              placeholder="Rechercher un utilisateur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <div className="msg-search-results">
              {searchResults.map((u) => (
                <button key={u.id} className="msg-search-result" onClick={() => void startDMConversation(u.id)}>
                  <div className="msg-avatar msg-avatar--sm">{u.profile.avatarUrl ? <img src={u.profile.avatarUrl} alt="" /> : initials(u.profile.displayName)}</div>
                  <div className="msg-search-info">
                    <strong>{u.profile.displayName}</strong>
                    <span>{u.profile.username ? `@${u.profile.username}` : ""}{u.profile.city ? ` · ${u.profile.city}` : ""}</span>
                  </div>
                </button>
              ))}
              {searchQuery.length >= 2 && searchResults.length === 0 && <p className="msg-empty-sm">Aucun résultat</p>}
            </div>
          </div>
        )}

        {/* Conversation list */}
        <div className="msg-conv-list">
          {loadingConvs ? (
            <div className="msg-loading-sm">Chargement...</div>
          ) : conversations.filter((c) => showArchived ? archivedConvIds.has(c.id) : !archivedConvIds.has(c.id)).length === 0 ? (
            <div className="msg-empty">
              <p>{showArchived ? "Aucune conversation archivée" : "Aucune conversation"}</p>
              <p>{showArchived ? "Les conversations archivées apparaîtront ici" : "Recherchez un utilisateur pour démarrer"}</p>
            </div>
          ) : (
            conversations
              .filter((c) => showArchived ? archivedConvIds.has(c.id) : !archivedConvIds.has(c.id))
              .sort((a, b) => {
                const aP = pinnedConvIds.has(a.id) ? 0 : 1;
                const bP = pinnedConvIds.has(b.id) ? 0 : 1;
                if (aP !== bP) return aP - bP;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
              })
              .map((conv) => {
              const name = getConversationName(conv, myId);
              const avatar = getConversationAvatar(conv, myId);
              const lastMsg = conv.messages?.[0];
              const otherUserId = getOtherUserId(conv, myId);
              const isOnline = otherUserId ? onlineUserIds.has(otherUserId) : false;
              const isPinned = pinnedConvIds.has(conv.id);
              const isMuted = mutedConvIds.has(conv.id);

              return (
                <button
                  key={conv.id}
                  className={`msg-conv-item${activeConv?.id === conv.id ? " active" : ""}${isPinned ? " msg-conv-item--pinned" : ""}`}
                  onClick={() => { setActiveConv(conv); setShowSidebar(false); }}
                  onContextMenu={(e) => { e.preventDefault(); setConvContextMenu({ x: e.clientX, y: e.clientY, convId: conv.id }); }}
                >
                  <div className="msg-avatar">
                    {avatar ? <img src={avatar} alt="" /> : initials(name)}
                    {isOnline && <span className="msg-online-badge" />}
                  </div>
                  <div className="msg-conv-info">
                    <div className="msg-conv-top">
                      <span className="msg-conv-name">
                        {isPinned && <span className="msg-pin-icon" title="Épinglée">📌</span>}
                        {name}
                      </span>
                      {lastMsg && <span className="msg-conv-time">{timeLabel(lastMsg.createdAt)}</span>}
                    </div>
                    <div className="msg-conv-bottom">
                      <span className="msg-conv-preview">
                        {isMuted && "🔇 "}
                        {lastMsg
                          ? lastMsg.isDeleted ? "Message supprimé"
                          : lastMsg.type === "IMAGE" ? "📷 Photo"
                          : lastMsg.type === "AUDIO" ? "🎵 Audio"
                          : lastMsg.type === "VIDEO" ? "🎬 Vidéo"
                          : lastMsg.type === "FILE" ? "📎 Fichier"
                          : (lastMsg.senderId === myId ? "Vous: " : "") + (lastMsg.content?.slice(0, 45) ?? "")
                          : "Nouvelle conversation"}
                      </span>
                      {conv.unreadCount > 0 && !isMuted && <span className="msg-unread-badge">{conv.unreadCount}</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Conversation context menu */}
        {convContextMenu && (
          <div className="msg-context-menu" style={{ top: convContextMenu.y, left: convContextMenu.x }}>
            <button onClick={() => {
              const id = convContextMenu.convId;
              if (pinnedConvIds.size >= 5 && !pinnedConvIds.has(id)) { alert("Maximum 5 conversations épinglées."); }
              else { setPinnedConvIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
              setConvContextMenu(null);
            }}>{pinnedConvIds.has(convContextMenu.convId) ? "📌 Désépingler" : "📌 Épingler"}</button>
            <button onClick={() => {
              setArchivedConvIds((prev) => { const n = new Set(prev); const id = convContextMenu.convId; if (n.has(id)) n.delete(id); else n.add(id); return n; });
              if (activeConv?.id === convContextMenu.convId) setActiveConv(null);
              setConvContextMenu(null);
            }}>{archivedConvIds.has(convContextMenu.convId) ? "📦 Désarchiver" : "📦 Archiver"}</button>
            <button onClick={() => {
              setMutedConvIds((prev) => { const n = new Set(prev); const id = convContextMenu.convId; if (n.has(id)) n.delete(id); else n.add(id); return n; });
              setConvContextMenu(null);
            }}>{mutedConvIds.has(convContextMenu.convId) ? "🔔 Réactiver les sons" : "🔇 Mettre en sourdine"}</button>
            <div className="msg-context-menu-divider" />
            <button onClick={() => {
              setBlockedConvIds((prev) => { const n = new Set(prev); const id = convContextMenu.convId; if (n.has(id)) n.delete(id); else n.add(id); return n; });
              setConvContextMenu(null);
            }}>{blockedConvIds.has(convContextMenu.convId) ? "🟢 Débloquer" : "🚫 Bloquer"}</button>
            <button className="msg-ctx-danger" onClick={() => {
              if (confirm("Supprimer cette conversation ?")) {
                setConversations((prev) => prev.filter((c) => c.id !== convContextMenu.convId));
                if (activeConv?.id === convContextMenu.convId) setActiveConv(null);
              }
              setConvContextMenu(null);
            }}>🗑 Supprimer</button>
          </div>
        )}
      </aside>

      {/* ══ Chat panel ══ */}
      <main className={`msg-chat${!activeConv ? " msg-chat--empty" : ""}`}>
        {!activeConv ? (
          <div className="msg-chat-placeholder">
            <span className="msg-chat-placeholder-icon">💬</span>
            <h3>Kin-Sell Messagerie</h3>
            <p>Sélectionnez une conversation ou recherchez un utilisateur</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="msg-chat-header">
              <button className="msg-back-btn" onClick={() => setShowSidebar(true)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <div className="msg-avatar msg-avatar--sm" onClick={() => {
                if (!activeConv.isGroup) {
                  const other = getOtherParticipant(activeConv, myId);
                  if (other) setProfileUser({ displayName: other.user.profile.displayName, avatarUrl: other.user.profile.avatarUrl, username: other.user.profile.username ?? null, userId: other.userId });
                }
              }}>
                {getConversationAvatar(activeConv, myId)
                  ? <img src={getConversationAvatar(activeConv, myId)!} alt="" />
                  : initials(getConversationName(activeConv, myId))}
                {!activeConv.isGroup && getOtherUserId(activeConv, myId) && onlineUserIds.has(getOtherUserId(activeConv, myId)!) && <span className="msg-online-badge" />}
              </div>
              <div className="msg-chat-header-info">
                <strong>{getConversationName(activeConv, myId)}</strong>
                <span>
                  {typingNames.length > 0
                    ? `${typingNames.join(", ")} écrit${typingNames.length > 1 ? "ent" : ""}...`
                    : !activeConv.isGroup && getOtherUserId(activeConv, myId) && onlineUserIds.has(getOtherUserId(activeConv, myId)!)
                    ? "En ligne"
                    : !activeConv.isGroup && (() => {
                        const otherId = getOtherUserId(activeConv, myId);
                        return otherId && lastSeenMap.has(otherId) ? formatLastSeen(lastSeenMap.get(otherId)!) : "";
                      })()
                  }
                </span>
              </div>
              <div className="msg-chat-header-actions">
                {!activeConv.isGroup && (
                  <>
                    <button className="msg-icon-btn" title="Appel audio" onClick={() => void startCall("audio")}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </button>
                    <button className="msg-icon-btn" title="Appel vidéo" onClick={() => void startCall("video")}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div className="msg-messages">
              {loadingMsgs ? (
                <div className="msg-loading-sm">Chargement des messages...</div>
              ) : messages.length === 0 ? (
                <div className="msg-empty">
                  <p>Aucun message</p>
                  <p>Envoyez le premier message !</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMine = msg.senderId === myId;
                  const showSender = activeConv.isGroup && !isMine && (idx === 0 || messages[idx - 1].senderId !== msg.senderId);
                  const readByOthers = msg.readReceipts.filter((r) => r.userId !== myId);

                  return (
                    <div
                      key={msg.id}
                      className={`msg-bubble-wrap${isMine ? " msg-bubble-wrap--mine" : ""}`}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, message: msg }); }}
                    >
                      {showSender && <span className="msg-bubble-sender">{msg.sender.profile.displayName}</span>}
                      <div className={`msg-bubble${isMine ? " msg-bubble--mine" : ""}${msg.isDeleted ? " msg-bubble--deleted" : ""}`}>
                        {/* Reply preview */}
                        {msg.replyTo && !msg.isDeleted && (
                          <div className="msg-reply-preview">
                            <strong>{msg.replyTo.sender.profile.displayName}</strong>
                            <span>{msg.replyTo.type !== "TEXT" ? `📎 ${msg.replyTo.type}` : msg.replyTo.content?.slice(0, 60)}</span>
                          </div>
                        )}

                        {msg.isDeleted ? (
                          <p className="msg-deleted-text">🚫 Message supprimé</p>
                        ) : msg.type === "IMAGE" && msg.mediaUrl ? (
                          <img src={msg.mediaUrl} alt="Image" className="msg-media-img" onClick={() => window.open(msg.mediaUrl!, "_blank")} />
                        ) : msg.type === "AUDIO" && msg.mediaUrl ? (
                          <AudioPlayer src={msg.mediaUrl} />
                        ) : msg.type === "VIDEO" && msg.mediaUrl ? (
                          <video controls src={msg.mediaUrl} className="msg-media-video" />
                        ) : msg.type === "FILE" && msg.mediaUrl ? (
                          <a href={msg.mediaUrl} download={msg.fileName ?? "file"} className="msg-file-link">
                            📎 {msg.fileName ?? "Fichier"}
                          </a>
                        ) : (
                          <p className="msg-text">{msg.content}</p>
                        )}

                        <div className="msg-meta">
                          <span className="msg-time">{new Date(msg.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                          {msg.isEdited && <span className="msg-edited">modifié</span>}
                          {isMine && (
                            <span
                              className={`msg-read-status${readByOthers.length > 0 ? " msg-read-status--read" : ""}`}
                              title={readByOthers.length > 0 ? "Lu" : "Envoyé"}
                            >
                              {readByOthers.length > 0 ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick actions on hover */}
                      {!msg.isDeleted && (
                        <div className="msg-bubble-actions">
                          {!isAdminDM && <button className="msg-bubble-action" title="Répondre" onClick={() => setReplyTo(msg)}>↩</button>}
                          {isMine && msg.type === "TEXT" && (
                            <button className="msg-bubble-action" title="Modifier" onClick={() => { setEditingMsg(msg); setDraft(msg.content ?? ""); }}>✏️</button>
                          )}
                          {isMine && (
                            <button className="msg-bubble-action" title="Supprimer" onClick={() => emit("message:delete", { messageId: msg.id, conversationId: activeConv.id })}>🗑</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Context menu (WhatsApp-style) */}
            {contextMenu && (
              <div className="msg-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                {!isAdminDM && <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null); }}>↩️ Répondre</button>}
                {contextMenu.message.content && (
                  <button onClick={() => { void navigator.clipboard.writeText(contextMenu.message.content ?? ""); setContextMenu(null); }}>📋 Copier le texte</button>
                )}
                {contextMenu.message.senderId === myId && contextMenu.message.type === "TEXT" && (
                  <button onClick={() => { setEditingMsg(contextMenu.message); setDraft(contextMenu.message.content ?? ""); setContextMenu(null); }}>✏️ Modifier</button>
                )}
                <button onClick={() => {
                  const info = `De: ${contextMenu.message.sender.profile.displayName}\nDate: ${fullTime(contextMenu.message.createdAt)}\nType: ${contextMenu.message.type}${contextMenu.message.isEdited ? "\n(modifié)" : ""}`;
                  alert(info);
                  setContextMenu(null);
                }}>ℹ️ Infos du message</button>
                <div className="msg-context-menu-divider" />
                {contextMenu.message.senderId === myId && (
                  <button className="msg-ctx-danger" onClick={() => { emit("message:delete", { messageId: contextMenu.message.id, conversationId: activeConv.id }); setContextMenu(null); }}>🗑 Supprimer</button>
                )}
              </div>
            )}

            {/* Reply/edit bar */}
            {!isAdminDM && (replyTo || editingMsg) && (
              <div className="msg-reply-bar">
                <div className="msg-reply-bar-content">
                  <strong>{editingMsg ? "Modification" : `↩ ${replyTo!.sender.profile.displayName}`}</strong>
                  <span>{editingMsg ? editingMsg.content?.slice(0, 60) : replyTo!.type !== "TEXT" ? `📎 ${replyTo!.type}` : replyTo!.content?.slice(0, 60)}</span>
                </div>
                <button className="msg-reply-bar-close" onClick={() => { setReplyTo(null); setEditingMsg(null); setDraft(""); }}>✕</button>
              </div>
            )}

            {/* Waveform recording bar */}
            {!isAdminDM && recordingAudio && (
              <div className="msg-waveform-bar">
                <span className="msg-waveform-timer">{formatAudioTime(recordingTime)}</span>
                <canvas ref={waveformCanvasRef} className="msg-waveform-canvas" width={400} height={36} />
                <button className="msg-waveform-cancel" title="Annuler" type="button" onClick={cancelRecordingAudio}>✕</button>
                <button className="msg-waveform-stop" title="Envoyer" type="button" onClick={stopRecordingAudio}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              </div>
            )}

            {/* Admin DM notice — non-admin users cannot reply */}
            {isAdminDM && (
              <div className="msg-admin-notice">
                <span>🔒</span> Ce message provient d'un administrateur. Vous ne pouvez pas répondre.
              </div>
            )}

            {/* MessageGuard alert */}
            {guardAlert && (
              <div className={`msg-guard-alert msg-guard-alert--${guardAlert.type}`} onClick={() => setGuardAlert(null)}>
                <span className="msg-guard-alert-icon">{guardAlert.type === "block" ? "🚫" : "⚠️"}</span>
                <span className="msg-guard-alert-text">{guardAlert.message}</span>
                <button type="button" className="msg-guard-alert-close" onClick={() => setGuardAlert(null)}>✕</button>
              </div>
            )}

            {/* Input bar */}
            {!isAdminDM && !recordingAudio && (
              <form className="msg-input-bar" onSubmit={handleSend}>
                <button type="button" className="msg-icon-btn" title="Fichier" onClick={() => fileInputRef.current?.click()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <input ref={fileInputRef} type="file" hidden accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.zip" multiple onChange={(e) => void handleFileSelect(e.target.files)} />

                {/* Emoji button */}
                <button type="button" className="msg-icon-btn" title="Emoji" onClick={() => setShowEmoji(!showEmoji)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>

                {/* Emoji picker */}
                {showEmoji && (
                  <div className="msg-emoji-picker">
                    <div className="msg-emoji-header">
                      {EMOJI_CATEGORIES.map((cat, i) => (
                        <button key={i} type="button" className={`msg-emoji-cat-btn${emojiCat === i ? " active" : ""}`} onClick={() => setEmojiCat(i)}>{cat.icon}</button>
                      ))}
                    </div>
                    <div className="msg-emoji-grid">
                      {EMOJI_CATEGORIES[emojiCat].emojis.map((em, i) => (
                        <button key={i} type="button" className="msg-emoji-btn" onClick={() => { insertEmoji(em); setShowEmoji(false); }}>{em}</button>
                      ))}
                    </div>
                  </div>
                )}

                <input
                  className="msg-text-input"
                  placeholder={editingMsg ? "Modifier le message..." : "Écrire un message..."}
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); handleTyping(); }}
                  autoFocus
                />

                {draft.trim() ? (
                  <button type="submit" className="msg-send-btn" title="Envoyer">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="msg-icon-btn"
                    title="Message vocal"
                    onClick={() => void startRecordingAudio()}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  </button>
                )}
              </form>
            )}
          </>
        )}
      </main>

      {/* ── FAB mobile: nouvelle conversation ── */}
      <button
        className="msg-mobile-fab"
        onClick={() => { setShowSidebar(true); setShowSearch(true); }}
        aria-label="Nouvelle conversation"
        title="Nouvelle conversation"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
      </button>
    </div>
  );
}
