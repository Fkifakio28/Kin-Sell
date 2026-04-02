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
import { useGlobalNotification } from "../../app/providers/GlobalNotificationProvider";
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
  const { setMessagingActive } = useGlobalNotification();

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

  /* ── Forward & Multi-select states ── */
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Call state ── */
  const [callState, setCallState] = useState<null | { type: "audio" | "video"; conversationId: string; remoteUserId: string; direction: "incoming" | "outgoing"; status: "ringing" | "connected" | "ended" }>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyboardOffsetRef = useRef(0);

  /* ── MessageGuard feedback ── */
  const [guardAlert, setGuardAlert] = useState<{ type: "warn" | "block"; message: string } | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const guardAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myId = user?.id ?? "";
  const myRole = user?.role ?? "";

  useEffect(() => {
    setMessagingActive(true);
    return () => setMessagingActive(false);
  }, [setMessagingActive]);

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

  /* ── Call duration timer ── */
  useEffect(() => {
    if (callState?.status === "connected") {
      setCallDuration(0);
      callTimerRef.current = setInterval(() => setCallDuration((t) => t + 1), 1000);
    } else {
      if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; } };
  }, [callState?.status]);

  /* ── Ensure media streams are attached once video/audio nodes are mounted ── */
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.muted = true;
      void localVideoRef.current.play().catch(() => {});
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.muted = !isSpeakerOn;
      void remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.muted = !isSpeakerOn;
      void remoteAudioRef.current.play().catch(() => {});
    }
  }, [callState?.status, callState?.type, isSpeakerOn]);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length, activeConv?.id]);

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
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
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
        void remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.muted = !isSpeakerOn;
        void remoteAudioRef.current.play().catch(() => {});
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [emit, isSpeakerOn]);

  const cleanupCall = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setIsMuted(false);
    setIsCameraOff(false);
    setIsSpeakerOn(true);
  }, []);

  const toggleMute = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOff(!videoTrack.enabled);
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => {
      const next = !prev;
      if (remoteAudioRef.current) remoteAudioRef.current.muted = !next;
      if (remoteVideoRef.current) remoteVideoRef.current.muted = !next;
      return next;
    });
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

  /* ── Forward message to another conversation ── */
  const handleForward = useCallback((targetConvId: string) => {
    if (!forwardMsg) return;
    const content = forwardMsg.content ? `↪ Transféré:\n${forwardMsg.content}` : null;
    emit("message:send", {
      conversationId: targetConvId,
      content: content ?? `↪ Transféré: [${forwardMsg.type}]`,
      type: "TEXT",
      ...(forwardMsg.mediaUrl ? { mediaUrl: forwardMsg.mediaUrl, type: forwardMsg.type, fileName: forwardMsg.fileName } : {}),
    }, (res: any) => {
      if (res && !res.ok) {
        showGuardAlert("block", res.error || "Transfert impossible.");
        return;
      }
      showGuardAlert("warn", "Message transféré.");
      setForwardMsg(null);
    });
  }, [forwardMsg, emit, showGuardAlert]);

  /* ── Multi-select actions ── */
  const toggleSelectMsg = useCallback((msgId: string) => {
    setSelectedMsgIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      return next;
    });
  }, []);

  const deleteSelectedMessages = useCallback(() => {
    if (!activeConv) return;
    selectedMsgIds.forEach((id) => emit("message:delete", { messageId: id, conversationId: activeConv.id }));
    setSelectedMsgIds(new Set());
    setSelectMode(false);
  }, [selectedMsgIds, activeConv, emit]);

  const copySelectedMessages = useCallback(() => {
    const selectedMsgs = messages.filter((m) => selectedMsgIds.has(m.id)).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const text = selectedMsgs.map((m) => `${m.sender.profile.displayName}: ${m.content ?? `[${m.type}]`}`).join("\n");
    void navigator.clipboard.writeText(text);
    setSelectedMsgIds(new Set());
    setSelectMode(false);
  }, [selectedMsgIds, messages]);

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
      if (Math.abs(nextOffset - lastKeyboardOffsetRef.current) < 4) return;
      lastKeyboardOffsetRef.current = nextOffset;
      setKeyboardOffset(nextOffset);
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

  const inviteCandidates = useMemo(() => {
    const unique = new Map<string, { userId: string; displayName: string; avatarUrl: string | null; username: string | null }>();
    conversations.forEach((conv) => {
      if (conv.isGroup) return;
      const other = getOtherParticipant(conv, myId);
      if (!other) return;
      if (callState && other.userId === callState.remoteUserId) return;
      if (!unique.has(other.userId)) {
        unique.set(other.userId, {
          userId: other.userId,
          displayName: other.user.profile.displayName,
          avatarUrl: other.user.profile.avatarUrl,
          username: other.user.profile.username ?? null,
        });
      }
    });

    const q = inviteQuery.trim().toLowerCase();
    const values = Array.from(unique.values());
    if (!q) return values;
    return values.filter((u) =>
      u.displayName.toLowerCase().includes(q) ||
      (u.username ?? "").toLowerCase().includes(q),
    );
  }, [conversations, myId, callState, inviteQuery]);

  const invitePersonToCall = useCallback(async (targetUserId: string, displayName: string) => {
    if (!callState || !user) return;
    try {
      const { conversation } = await messaging.createDM(targetUserId);
      setConversations((prev) => (prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev]));
      emit(
        "message:send",
        {
          conversationId: conversation.id,
          type: "TEXT",
          content: `📞 ${user.profile.displayName} vous invite à rejoindre un appel ${callState.type === "video" ? "vidéo" : "audio"} sur Kin-Sell. Ouvrez la messagerie pour rejoindre la conversation.`,
        },
        () => {},
      );
      showGuardAlert("warn", `Invitation envoyée à ${displayName}.`);
      setShowAddPeople(false);
      setInviteQuery("");
    } catch {
      showGuardAlert("block", "Impossible d'envoyer l'invitation.");
    }
  }, [callState, user, emit, showGuardAlert]);

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
            <div className="msg-call-caller-avatar">
              {(() => {
                const conv = conversations.find((c) => c.id === callState.conversationId);
                const avatar = conv ? getConversationAvatar(conv, myId) : null;
                const name = conv ? getConversationName(conv, myId) : "Appel";
                return avatar ? <img src={avatar} alt="" /> : <span>{initials(name)}</span>;
              })()}
            </div>
            <p className="msg-call-caller-name">
              {(() => {
                const conv = conversations.find((c) => c.id === callState.conversationId);
                return conv ? getConversationName(conv, myId) : "Utilisateur";
              })()}
            </p>
            <p className="msg-call-label">Appel {callState.type === "video" ? "vidéo" : "audio"} entrant</p>
            <div className="msg-call-actions">
              <button className="msg-call-btn-round msg-call-btn--accept" onClick={() => void acceptCall()} title="Accepter">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </button>
              <button className="msg-call-btn-round msg-call-btn--reject" onClick={rejectCall} title="Refuser">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Active/outgoing call overlay ══ */}
      {callState && (callState.status === "connected" || (callState.status === "ringing" && callState.direction === "outgoing")) && (
        <div className="msg-call-overlay msg-call-overlay--active">
          <div className="msg-call-dialog msg-call-dialog--active">
            <audio ref={remoteAudioRef} autoPlay playsInline />
            {/* Remote caller info */}
            <div className="msg-call-caller-avatar">
              {(() => {
                const conv = conversations.find((c) => c.id === callState.conversationId);
                const avatar = conv ? getConversationAvatar(conv, myId) : null;
                const name = conv ? getConversationName(conv, myId) : "Appel";
                return avatar ? <img src={avatar} alt="" /> : <span>{initials(name)}</span>;
              })()}
            </div>
            <p className="msg-call-caller-name">
              {(() => {
                const conv = conversations.find((c) => c.id === callState.conversationId);
                return conv ? getConversationName(conv, myId) : "Utilisateur";
              })()}
            </p>

            {callState.status === "ringing" && (
              <p className="msg-call-status-text">Appel en cours...</p>
            )}
            {callState.status === "connected" && (
              <p className="msg-call-timer">{Math.floor(callDuration / 60).toString().padStart(2, "0")}:{(callDuration % 60).toString().padStart(2, "0")}</p>
            )}

            {callState.type === "video" && (
              <div className="msg-call-videos">
                <video ref={remoteVideoRef} autoPlay playsInline className="msg-call-video-remote" />
                <video ref={localVideoRef} autoPlay playsInline muted className="msg-call-video-local" style={isCameraOff ? { display: "none" } : undefined} />
                {isCameraOff && <div className="msg-call-camera-off-label">Caméra désactivée</div>}
              </div>
            )}

            {/* Call controls */}
            <div className="msg-call-controls">
              <button className={`msg-call-ctrl-btn${isMuted ? " msg-call-ctrl-btn--active" : ""}`} onClick={toggleMute} title={isMuted ? "Activer le micro" : "Couper le micro"}>
                {isMuted ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.48-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                )}
                <span className="msg-call-ctrl-label">{isMuted ? "Muet" : "Micro"}</span>
              </button>

              <button className={`msg-call-ctrl-btn${!isSpeakerOn ? " msg-call-ctrl-btn--active" : ""}`} onClick={toggleSpeaker} title={isSpeakerOn ? "Haut-parleur OFF" : "Haut-parleur ON"}>
                {isSpeakerOn ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                )}
                <span className="msg-call-ctrl-label">HP</span>
              </button>

              {callState.type === "video" && (
                <button className={`msg-call-ctrl-btn${isCameraOff ? " msg-call-ctrl-btn--active" : ""}`} onClick={toggleCamera} title={isCameraOff ? "Activer caméra" : "Couper caméra"}>
                  {isCameraOff ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m4.5 0h8c1.1 0 2 .9 2 2v3.5M16 16l5 3V8"/></svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  )}
                  <span className="msg-call-ctrl-label">Caméra</span>
                </button>
              )}

              <button className="msg-call-ctrl-btn" onClick={() => setShowAddPeople(true)} title="Ajouter une personne">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>
                <span className="msg-call-ctrl-label">Ajouter</span>
              </button>

              <button className="msg-call-ctrl-btn msg-call-ctrl-btn--hangup" onClick={endCall} title="Raccrocher">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span className="msg-call-ctrl-label">Fin</span>
              </button>
            </div>
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
                <button
                  className={`msg-icon-btn${selectMode ? " msg-icon-btn--active" : ""}`}
                  title={selectMode ? "Quitter la sélection" : "Sélectionner plusieurs messages"}
                  onClick={() => {
                    setSelectMode((prev) => !prev);
                    if (selectMode) setSelectedMsgIds(new Set());
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                </button>
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
                  const isSelected = selectedMsgIds.has(msg.id);

                  return (
                    <div
                      key={msg.id}
                      className={`msg-bubble-wrap${isMine ? " msg-bubble-wrap--mine" : ""}${isSelected ? " msg-bubble-wrap--selected" : ""}`}
                      onContextMenu={(e) => { e.preventDefault(); if (!selectMode) setContextMenu({ x: e.clientX, y: e.clientY, message: msg }); }}
                      onClick={selectMode && !msg.isDeleted ? () => toggleSelectMsg(msg.id) : undefined}
                    >
                      {selectMode && !msg.isDeleted && (
                        <span className={`msg-select-check${isSelected ? " msg-select-check--on" : ""}`}>
                          {isSelected ? "✓" : ""}
                        </span>
                      )}
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
                      {!msg.isDeleted && !selectMode && (
                        <div className="msg-bubble-actions">
                          {!isAdminDM && <button className="msg-bubble-action" title="Répondre" onClick={() => setReplyTo(msg)}>↩</button>}
                          <button className="msg-bubble-action" title="Transférer" onClick={() => setForwardMsg(msg)}>↗</button>
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
                <button onClick={() => { setForwardMsg(contextMenu.message); setContextMenu(null); }}>↗️ Transférer</button>
                {contextMenu.message.content && (
                  <button onClick={() => { void navigator.clipboard.writeText(contextMenu.message.content ?? ""); setContextMenu(null); }}>📋 Copier le texte</button>
                )}
                {contextMenu.message.senderId === myId && contextMenu.message.type === "TEXT" && (
                  <button onClick={() => { setEditingMsg(contextMenu.message); setDraft(contextMenu.message.content ?? ""); setContextMenu(null); }}>✏️ Modifier</button>
                )}
                <button onClick={() => { setSelectMode(true); setSelectedMsgIds(new Set([contextMenu.message.id])); setContextMenu(null); }}>☑️ Sélectionner</button>
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
                <canvas ref={waveformCanvasRef} className="msg-waveform-canvas" height={36} />
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

            {/* Multi-select action bar */}
            {selectMode && (
              <div className="msg-select-bar">
                <span className="msg-select-count">{selectedMsgIds.size} sélectionné{selectedMsgIds.size > 1 ? "s" : ""}</span>
                <div className="msg-select-actions">
                  <button className="msg-select-action-btn" title="Copier" onClick={copySelectedMessages} disabled={selectedMsgIds.size === 0}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copier</span>
                  </button>
                  <button className="msg-select-action-btn" title="Transférer" onClick={() => { if (selectedMsgIds.size === 1) { const msg = messages.find((m) => selectedMsgIds.has(m.id)); if (msg) setForwardMsg(msg); } setSelectMode(false); setSelectedMsgIds(new Set()); }} disabled={selectedMsgIds.size !== 1}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
                    <span>Transférer</span>
                  </button>
                  <button className="msg-select-action-btn msg-select-action-btn--danger" title="Supprimer" onClick={deleteSelectedMessages} disabled={selectedMsgIds.size === 0}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    <span>Supprimer</span>
                  </button>
                  <button className="msg-select-action-btn" onClick={() => { setSelectMode(false); setSelectedMsgIds(new Set()); }}>
                    ✕ <span>Annuler</span>
                  </button>
                </div>
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
      {/* ══ Forward conversation picker modal ══ */}
      {forwardMsg && (
        <div className="msg-forward-overlay" onClick={() => setForwardMsg(null)}>
          <div className="msg-forward-modal" onClick={(e) => e.stopPropagation()}>
            <div className="msg-forward-header">
              <h3>Transférer à...</h3>
              <button className="msg-forward-close" onClick={() => setForwardMsg(null)}>✕</button>
            </div>
            <div className="msg-forward-preview">
              <span className="msg-forward-preview-label">Message :</span>
              <span className="msg-forward-preview-text">
                {forwardMsg.type !== "TEXT" ? `📎 ${forwardMsg.type}` : forwardMsg.content?.slice(0, 80)}
              </span>
            </div>
            <div className="msg-forward-list">
              {conversations.filter((c) => c.id !== activeConv?.id).map((conv) => (
                <button key={conv.id} className="msg-forward-item" onClick={() => handleForward(conv.id)}>
                  <div className="msg-avatar msg-avatar--sm">
                    {getConversationAvatar(conv, myId) ? <img src={getConversationAvatar(conv, myId)!} alt="" /> : initials(getConversationName(conv, myId))}
                  </div>
                  <span>{getConversationName(conv, myId)}</span>
                </button>
              ))}
              {conversations.filter((c) => c.id !== activeConv?.id).length === 0 && (
                <p className="msg-empty-sm">Aucune autre conversation</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Add participant modal (invite flow) ══ */}
      {showAddPeople && callState && (
        <div className="msg-forward-overlay" onClick={() => setShowAddPeople(false)}>
          <div className="msg-forward-modal" onClick={(e) => e.stopPropagation()}>
            <div className="msg-forward-header">
              <h3>Ajouter des personnes</h3>
              <button className="msg-forward-close" onClick={() => setShowAddPeople(false)}>✕</button>
            </div>
            <div className="msg-forward-preview">
              <span className="msg-forward-preview-label">Type d'appel :</span>
              <span className="msg-forward-preview-text">Appel {callState.type === "video" ? "vidéo" : "audio"} en cours</span>
            </div>
            <div className="msg-search-panel msg-search-panel--inline">
              <input
                className="msg-search-input"
                placeholder="Rechercher un contact..."
                value={inviteQuery}
                onChange={(e) => setInviteQuery(e.target.value)}
              />
            </div>
            <div className="msg-forward-list">
              {inviteCandidates.map((candidate) => (
                <button
                  key={candidate.userId}
                  className="msg-forward-item"
                  onClick={() => void invitePersonToCall(candidate.userId, candidate.displayName)}
                >
                  <div className="msg-avatar msg-avatar--sm">
                    {candidate.avatarUrl ? <img src={candidate.avatarUrl} alt="" /> : initials(candidate.displayName)}
                  </div>
                  <span>{candidate.displayName}</span>
                </button>
              ))}
              {inviteCandidates.length === 0 && <p className="msg-empty-sm">Aucun contact disponible</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
