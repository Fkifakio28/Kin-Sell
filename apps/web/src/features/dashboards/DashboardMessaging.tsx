import { useEffect, useState, useRef, useCallback, type CSSProperties, type FormEvent } from "react";
import { useAuth } from "../../app/providers/AuthProvider";
import {
  messaging,
  type ConversationSummary,
  type ChatMessage,
  type CallLogEntry,
} from "../../lib/api-client";
import { useSocket } from "../../hooks/useSocket";
import { createOptimizedAudioRecorder, createUploadFile, prepareMediaUrl } from "../../utils/media-upload";
import { useGlobalNotification } from "../../app/providers/GlobalNotificationProvider";
import "./dashboard-messaging.css";

/* ── Emoji data ── */
const EMOJI_CATEGORIES: { icon: string; emojis: string[] }[] = [
  { icon: "😀", emojis: ["😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","🥰","😘","😗","😙","😚","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫","😴","🤤","😛","😜","😝","🤑","🤗","🤭","🤫","🤥","😬","🤒","🤕","🤢","🤮","🤧","😇","🥳","🥺","🤠","🤡","🥱","🥴","😈","👿","👹","👺","💀","👻","👽","🤖","💩","😺","😸","😹","😻","😼","😽","🙀","😿","😾"] },
  { icon: "👋", emojis: ["👋","🤚","🖐","✋","🖖","👌","🤌","🤏","✌","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍","💅","🤳","💪","🦵","🦶","👂","👃","🧠","👀","👁","👅","👄","💋","👶","👧","🧒","👦","👩","🧑","👨"] },
  { icon: "❤️", emojis: ["❤","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣","💕","💞","💓","💗","💖","💘","💝","💟","♥","💌","💒","💍","💎","💐","🌹","🥀","🌺","🌷","🌸","💮","🏵","🌻","🌼"] },
  { icon: "🐶", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝"] },
  { icon: "🍕", emojis: ["🍕","🍔","🍟","🌭","🥪","🌮","🌯","🥙","🧆","🥚","🍳","🥘","🍲","🥣","🥗","🍿","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍣","🍤","🍦","🍧","🍨","🍩","🍪","🎂","🍰"] },
  { icon: "⚽", emojis: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🏒","🏑","🥍","🏏","🥅","⛳","🏹","🎣","🥊","🥋","🎽","🛹","🏆","🥇","🥈","🥉","🎖","🏅","🎨","🎬","🎤","🎧"] },
  { icon: "🚗", emojis: ["🚗","🚕","🚙","🚌","🚎","🏎","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍","🛵","🚲","🛴","✈","🛩","🚀","🛸","🌍","🌎","🌏","🏔","⛰","🌋","🏖","🏜","🏝","🏠","🏢","🏰"] },
];

/* ── Sticker packs ── */
const STICKER_PACKS: { name: string; stickers: string[] }[] = [
  { name: "Salutations", stickers: ["👋","🤝","🙌","🫡","🫶","✌️","🤟","🖖","👊","🫰","💪","🙏","🤗","😎","🥳","🎉","🎊","💫","⭐","🌟"] },
  { name: "Réactions", stickers: ["😂","🤣","😍","🥰","😮","😱","🤯","😤","😭","🥺","😡","🤮","💀","🔥","💯","❤️‍🔥","👀","🫣","🤡","💅"] },
  { name: "Commerce", stickers: ["💰","💵","💳","🛒","📦","🏪","🤑","📈","📉","🏷️","🎁","🛍️","✅","❌","⏳","🚚","📱","💻","🏠","🔑"] },
  { name: "Kinshasa", stickers: ["🇨🇩","🌍","🏙️","🌴","☀️","🌙","🎵","🥁","💃","🕺","🍗","🥖","🚕","⚽","🏆","🙌","💎","👑","🦁","🌺"] },
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

/* ── Custom Audio Player ── */
function DmAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => { setCurrentTime(audio.currentTime); setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0); };
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => { audio.removeEventListener("timeupdate", onTime); audio.removeEventListener("loadedmetadata", onMeta); audio.removeEventListener("ended", onEnd); };
  }, []);

  const toggle = () => { const a = audioRef.current; if (!a) return; if (playing) a.pause(); else void a.play(); setPlaying(!playing); };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { const a = audioRef.current; if (!a?.duration) return; const r = e.currentTarget.getBoundingClientRect(); a.currentTime = ((e.clientX - r.left) / r.width) * a.duration; };

  return (
    <div className="dm-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button className="dm-audio-play-btn" onClick={toggle} type="button">
        {playing ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
      </button>
      <div className="dm-audio-track">
        <div className="dm-audio-progress-bg" onClick={seek}><div className="dm-audio-progress-fill" style={{ width: `${progress}%` }} /></div>
        <span className="dm-audio-time">{formatAudioTime(currentTime)} / {formatAudioTime(duration || 0)}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export function DashboardMessaging() {
  const { user, isLoggedIn } = useAuth();
  const { emit, on, off, isConnected } = useSocket();
  const { setMessagingActive } = useGlobalNotification();

  /* ── Signal global provider that messaging is active ── */
  useEffect(() => {
    setMessagingActive(true);
    return () => setMessagingActive(false);
  }, [setMessagingActive]);

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [pickerTab, setPickerTab] = useState<"emoji" | "gif" | "sticker">("emoji");
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<Array<{ id: string; url: string; preview: string }>>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [stickerPack, setStickerPack] = useState(0);
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

  const [callState, setCallState] = useState<null | { type: "audio" | "video"; conversationId: string; remoteUserId: string; direction: "incoming" | "outgoing"; status: "ringing" | "connected" | "ended" }>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const iceRestartAttemptRef = useRef(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myId = user?.id ?? "";

  /* ── Call log (Journal des appels) ── */
  const [sidebarTab, setSidebarTab] = useState<"messages" | "journal">("messages");
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
  const [loadingCallLogs, setLoadingCallLogs] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    if (sidebarTab !== "journal" || !isLoggedIn) return;
    setLoadingCallLogs(true);
    messaging.callLogs().then((r) => setCallLogs(r.callLogs)).catch(() => {}).finally(() => setLoadingCallLogs(false));
  }, [sidebarTab, isLoggedIn]);

  /* ── Ringtone ── */
  useEffect(() => {
    const isRinging = callState?.status === "ringing";
    if (!isRinging) { if (ringtoneIntervalRef.current) { clearInterval(ringtoneIntervalRef.current); ringtoneIntervalRef.current = null; } return; }
    const playTone = () => { try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const g = ctx.createGain(); osc.connect(g); g.connect(ctx.destination); osc.frequency.value = callState?.direction === "incoming" ? 440 : 480; g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6); setTimeout(() => ctx.close(), 700); } catch {} };
    playTone();
    ringtoneIntervalRef.current = setInterval(playTone, 2000);
    return () => { if (ringtoneIntervalRef.current) clearInterval(ringtoneIntervalRef.current); };
  }, [callState?.status, callState?.direction]);

  /* ── Load conversations ── */
  useEffect(() => {
    if (!isLoggedIn) return;
    setLoadingConvs(true);
    messaging.conversations().then((d) => setConversations(d.conversations)).catch(() => {}).finally(() => setLoadingConvs(false));
  }, [isLoggedIn]);

  /* ── Load messages ── */
  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    setLoadingMsgs(true);
    messaging.messages(activeConv.id).then((d) => { setMessages(d.messages); void messaging.markRead(activeConv.id); emit("conversation:read", { conversationId: activeConv.id }); }).catch(() => {}).finally(() => setLoadingMsgs(false));
  }, [activeConv?.id, emit]);

  /* ── Scroll ── */
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  /* ── Socket events ── */
  useEffect(() => {
    const handleNew = (data: { message: ChatMessage }) => {
      const msg = data.message;
      setMessages((p) => p.some((m) => m.id === msg.id) ? p : [...p, msg]);
      setConversations((p) => p.map((c) => c.id === msg.conversationId ? { ...c, messages: [msg], updatedAt: msg.createdAt, unreadCount: c.id === activeConv?.id ? c.unreadCount : (c.unreadCount ?? 0) + 1 } : c).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
      if (msg.conversationId === activeConv?.id && msg.senderId !== myId) { void messaging.markRead(msg.conversationId); emit("conversation:read", { conversationId: msg.conversationId }); }
    };
    const handleEdited = (data: { message: ChatMessage }) => { setMessages((p) => p.map((m) => m.id === data.message.id ? data.message : m)); };
    const handleDeleted = (data: { messageId: string }) => { setMessages((p) => p.map((m) => m.id === data.messageId ? { ...m, isDeleted: true, content: null, mediaUrl: null } : m)); };
    const handleTypingStart = (data: { conversationId: string; userId: string }) => { setTypingUsers((p) => { const n = new Map(p); if (!n.has(data.conversationId)) n.set(data.conversationId, new Set()); n.get(data.conversationId)!.add(data.userId); return n; }); };
    const handleTypingStop = (data: { conversationId: string; userId: string }) => { setTypingUsers((p) => { const n = new Map(p); n.get(data.conversationId)?.delete(data.userId); return n; }); };
    const handlePresenceSnapshot = (data: { userIds: string[] }) => { setOnlineUserIds(new Set(data.userIds)); };
    const handleOnline = (data: { userId: string }) => { setOnlineUserIds((p) => new Set(p).add(data.userId)); };
    const handleOffline = (data: { userId: string }) => { setOnlineUserIds((p) => { const n = new Set(p); n.delete(data.userId); return n; }); };
    const handleRead = (data: { conversationId: string; userId: string }) => { if (data.conversationId === activeConv?.id) { setMessages((p) => p.map((m) => ({ ...m, readReceipts: m.senderId === myId && !m.readReceipts.some((r) => r.userId === data.userId) ? [...m.readReceipts, { userId: data.userId, readAt: new Date().toISOString() }] : m.readReceipts }))); } };

    on("message:new", handleNew); on("message:edited", handleEdited); on("message:deleted", handleDeleted);
    on("typing:start", handleTypingStart); on("typing:stop", handleTypingStop);
    on("presence:snapshot", handlePresenceSnapshot); on("user:online", handleOnline); on("user:offline", handleOffline); on("conversation:read", handleRead);
    return () => { off("message:new", handleNew); off("message:edited", handleEdited); off("message:deleted", handleDeleted); off("typing:start", handleTypingStart); off("typing:stop", handleTypingStop); off("presence:snapshot", handlePresenceSnapshot); off("user:online", handleOnline); off("user:offline", handleOffline); off("conversation:read", handleRead); };
  }, [on, off, activeConv?.id, myId, emit]);

  /* ── WebRTC call events ── */
  useEffect(() => {
    const handleIncoming = (data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => { setCallState({ type: data.callType, conversationId: data.conversationId, remoteUserId: data.callerId, direction: "incoming", status: "ringing" }); };
    const handleAccepted = async (data: { conversationId: string; accepterId: string }) => { setCallState((p) => p ? { ...p, status: "connected" } : null); if (peerConnectionRef.current) { const offer = await peerConnectionRef.current.createOffer(); await peerConnectionRef.current.setLocalDescription(offer); emit("webrtc:offer", { targetUserId: data.accepterId, sdp: offer }); } };
    const handleRejected = () => { cleanupCall(); setCallState(null); };
    const handleEnded = () => { cleanupCall(); setCallState(null); };
    const handleOffer = async (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => { if (!peerConnectionRef.current) return; await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp)); const ans = await peerConnectionRef.current.createAnswer(); await peerConnectionRef.current.setLocalDescription(ans); emit("webrtc:answer", { targetUserId: data.callerId, sdp: ans }); };
    const handleAnswer = async (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => { if (peerConnectionRef.current) await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp)); };
    const handleIce = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => { if (peerConnectionRef.current) await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)); };

    on("call:incoming", handleIncoming);
    on("call:accepted", handleAccepted as (data: { conversationId: string; accepterId: string }) => void);
    on("call:rejected", handleRejected as (data: { conversationId: string; rejecterId: string }) => void);
    on("call:ended", handleEnded as (data: { conversationId: string; enderId: string }) => void);
    on("webrtc:offer", handleOffer as (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => void);
    on("webrtc:answer", handleAnswer as (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => void);
    on("webrtc:ice-candidate", handleIce as (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => void);
    return () => {
      off("call:incoming", handleIncoming);
      off("call:accepted", handleAccepted as (data: { conversationId: string; accepterId: string }) => void);
      off("call:rejected", handleRejected as (data: { conversationId: string; rejecterId: string }) => void);
      off("call:ended", handleEnded as (data: { conversationId: string; enderId: string }) => void);
      off("webrtc:offer", handleOffer as (data: { callerId: string; sdp: RTCSessionDescriptionInit }) => void);
      off("webrtc:answer", handleAnswer as (data: { answererId: string; sdp: RTCSessionDescriptionInit }) => void);
      off("webrtc:ice-candidate", handleIce as (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => void);
    };
  }, [on, off, emit]);

  /* ── WebRTC helpers ── */
  const createPeerConnection = useCallback((remoteUserId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "turn:a.relay.metered.ca:80", username: "e7e6b1bdc41c6b2127249e04", credential: "kfMI+J8bFHMn7gMj" },
        { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: "e7e6b1bdc41c6b2127249e04", credential: "kfMI+J8bFHMn7gMj" },
        { urls: "turn:a.relay.metered.ca:443", username: "e7e6b1bdc41c6b2127249e04", credential: "kfMI+J8bFHMn7gMj" },
        { urls: "turns:a.relay.metered.ca:443?transport=tcp", username: "e7e6b1bdc41c6b2127249e04", credential: "kfMI+J8bFHMn7gMj" },
      ],
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 4,
    });
    pc.onicecandidate = (e) => { if (e.candidate) emit("webrtc:ice-candidate", { targetUserId: remoteUserId, candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      remoteStreamRef.current = e.streams[0];
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
        void remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        void remoteAudioRef.current.play().catch(() => {});
      }
    };
    // ── ICE reconnection automatique avec backoff exponentiel ──
    const ICE_RESTART_DELAYS = [500, 1000, 2000, 3000, 5000];
    const ICE_MAX_ATTEMPTS = 5;
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        iceRestartAttemptRef.current = 0;
      }
      const attemptRestart = () => {
        if (iceRestartAttemptRef.current >= ICE_MAX_ATTEMPTS) return;
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
      if (state === "disconnected") attemptRestart();
      if (state === "failed") attemptRestart();
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
    iceRestartAttemptRef.current = 0;
  }, []);

  const getCallMedia = useCallback(async (callType: "audio" | "video") => {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 },
      video: callType === "video" ? { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" } : false,
    });
  }, []);

  const optimizePeerSenders = useCallback(async (pc: RTCPeerConnection) => {
    await Promise.all(pc.getSenders().map(async (sender) => {
      try {
        const params = sender.getParameters();
        params.degradationPreference = "balanced";
        if (sender.track?.kind === "video") {
          params.encodings = [{ ...(params.encodings?.[0] ?? {}), maxBitrate: 1_500_000, maxFramerate: 30, scaleResolutionDownBy: 1 }];
        }
        if (sender.track?.kind === "audio") {
          params.encodings = [{ ...(params.encodings?.[0] ?? {}), maxBitrate: 64_000 }];
        }
        await sender.setParameters(params);
      } catch { /* */ }
    }));
  }, []);

  const startCall = useCallback(async (callType: "audio" | "video") => {
    if (!activeConv || activeConv.isGroup) return;
    const rid = getOtherUserId(activeConv, myId);
    if (!rid) return;
    try {
      const stream = await getCallMedia(callType);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPeerConnection(rid);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await optimizePeerSenders(pc);
      setCallState({ type: callType, conversationId: activeConv.id, remoteUserId: rid, direction: "outgoing", status: "ringing" });
      emit("call:initiate", { conversationId: activeConv.id, targetUserId: rid, callType });
    } catch { alert("Impossible d'accéder au micro/caméra."); }
  }, [activeConv, myId, createPeerConnection, emit, getCallMedia, optimizePeerSenders]);

  const acceptCall = useCallback(async (preferredType?: "audio" | "video") => {
    if (!callState) return;
    const acceptedType = preferredType ?? callState.type;
    try {
      const stream = await getCallMedia(acceptedType);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPeerConnection(callState.remoteUserId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await optimizePeerSenders(pc);
      emit("call:accept", { conversationId: callState.conversationId, callerId: callState.remoteUserId });
      setCallState((p) => p ? { ...p, type: acceptedType, status: "connected" } : null);
    } catch { alert("Impossible d'accéder au micro/caméra."); }
  }, [callState, createPeerConnection, emit, getCallMedia, optimizePeerSenders]);

  const rejectCall = useCallback(() => { if (!callState) return; emit("call:reject", { conversationId: callState.conversationId, callerId: callState.remoteUserId }); cleanupCall(); setCallState(null); }, [callState, emit, cleanupCall]);
  const endCall = useCallback(() => { if (!callState) return; emit("call:end", { conversationId: callState.conversationId, targetUserId: callState.remoteUserId }); cleanupCall(); setCallState(null); }, [callState, emit, cleanupCall]);

  /* ── Typing ── */
  const handleTyping = useCallback(() => {
    if (!activeConv) return;
    emit("typing:start", { conversationId: activeConv.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emit("typing:stop", { conversationId: activeConv.id }), 2000);
  }, [activeConv, emit]);

  /* ── Send ── */
  const handleSend = useCallback((e?: FormEvent) => {
    e?.preventDefault();
    if (!activeConv) return;
    const text = draft.trim();
    if (!text && !editingMsg) return;
    if (editingMsg) { emit("message:edit", { messageId: editingMsg.id, content: text }, () => {}); setEditingMsg(null); setDraft(""); return; }
    emit("message:send", { conversationId: activeConv.id, content: text, type: "TEXT", replyToId: replyTo?.id }, () => {});
    setDraft(""); setReplyTo(null); emit("typing:stop", { conversationId: activeConv.id });
  }, [activeConv, draft, replyTo, editingMsg, emit]);

  /* ── File ── */
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeConv) return;
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      const isAudio = file.type.startsWith("audio/");
      const isVideo = file.type.startsWith("video/");
      const mediaUrl = await prepareMediaUrl(file);
      emit("message:send", { conversationId: activeConv.id, type: isImage ? "IMAGE" : isAudio ? "AUDIO" : isVideo ? "VIDEO" : "FILE", mediaUrl, fileName: file.name, replyToId: replyTo?.id }, () => {});
    }
    setReplyTo(null);
  }, [activeConv, replyTo, emit]);

  /* ── Waveform ── */
  const drawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current; const an = analyserRef.current;
    if (!canvas || !an) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const buf = an.frequencyBinCount; const data = new Uint8Array(buf);
    const draw = () => { animFrameRef.current = requestAnimationFrame(draw); an.getByteTimeDomainData(data); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.lineWidth = 2; ctx.strokeStyle = "#F87171"; ctx.beginPath(); const sw = canvas.width / buf; let x = 0; for (let i = 0; i < buf; i++) { const v = data[i] / 128; const y = (v * canvas.height) / 2; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); x += sw; } ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke(); };
    draw();
  }, []);

  const startRecordingAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = createOptimizedAudioRecorder(stream); audioChunksRef.current = [];
      const actx = new AudioContext(); const src = actx.createMediaStreamSource(stream); const an = actx.createAnalyser(); an.fftSize = 2048; src.connect(an);
      audioContextRef.current = actx; analyserRef.current = an;
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.onstop = () => { const blob = new Blob(audioChunksRef.current, { type: "audio/webm" }); void (async () => { if (!activeConv) return; const mediaUrl = await prepareMediaUrl(createUploadFile(blob, "audio-message.webm", "audio/webm")); emit("message:send", { conversationId: activeConv.id, type: "AUDIO", mediaUrl, fileName: "audio-message.webm" }, () => {}); })(); stream.getTracks().forEach((t) => t.stop()); actx.close(); };
      rec.start(); setMediaRecorder(rec); setRecordingAudio(true); setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
      setTimeout(() => drawWaveform(), 50);
    } catch { alert("Impossible d'accéder au micro."); }
  }, [activeConv, emit, drawWaveform]);

  const stopRecordingAudio = useCallback(() => { mediaRecorder?.stop(); setMediaRecorder(null); setRecordingAudio(false); if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; } cancelAnimationFrame(animFrameRef.current); analyserRef.current = null; }, [mediaRecorder]);

  const cancelRecordingAudio = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") { mediaRecorder.ondataavailable = null; mediaRecorder.onstop = () => { mediaRecorder.stream.getTracks().forEach((t) => t.stop()); audioContextRef.current?.close(); }; mediaRecorder.stop(); }
    setMediaRecorder(null); setRecordingAudio(false); if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; } cancelAnimationFrame(animFrameRef.current); analyserRef.current = null;
  }, [mediaRecorder]);

  const insertEmoji = useCallback((emoji: string) => setDraft((p) => p + emoji), []);

  const sendGif = useCallback((gifUrl: string) => {
    if (!activeConv) return;
    emit("message:send", { conversationId: activeConv.id, type: "IMAGE", mediaUrl: gifUrl, fileName: "gif", replyToId: replyTo?.id }, () => {});
    setReplyTo(null); setShowEmoji(false);
  }, [activeConv, replyTo, emit]);

  const sendSticker = useCallback((sticker: string) => {
    if (!activeConv) return;
    emit("message:send", { conversationId: activeConv.id, content: sticker, type: "TEXT", replyToId: replyTo?.id }, () => {});
    setReplyTo(null); setShowEmoji(false);
  }, [activeConv, replyTo, emit]);

  /* ── GIF search (Tenor) ── */
  useEffect(() => {
    if (pickerTab !== "gif" || gifQuery.length < 2) { setGifResults([]); return; }
    setGifLoading(true);
    const t = setTimeout(async () => {
      try {
        const key = "AIzaSyBxfaT9GsIdFh7wVVRmBJjJr1nEzHKqxXU";
        const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(gifQuery)}&key=${key}&client_key=kinsell&limit=20&media_filter=tinygif,gif`);
        const data = await res.json() as { results?: Array<{ id: string; media_formats: { gif: { url: string }; tinygif: { url: string } } }> };
        setGifResults((data.results ?? []).map(r => ({ id: r.id, url: r.media_formats.gif.url, preview: r.media_formats.tinygif.url })));
      } catch { setGifResults([]); }
      finally { setGifLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [gifQuery, pickerTab]);

  /* ── Search users ── */
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => { messaging.searchUsers(searchQuery).then((d) => setSearchResults(d.users)).catch(() => setSearchResults([])); }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const startDMConversation = useCallback(async (targetUserId: string) => {
    try { const { conversation } = await messaging.createDM(targetUserId); setConversations((p) => p.some((c) => c.id === conversation.id) ? p : [conversation, ...p]); setActiveConv(conversation); setShowSearch(false); setSearchQuery(""); setShowSidebar(false); } catch {}
  }, []);

  /* ── Context menu close ── */
  useEffect(() => { const close = () => { setContextMenu(null); setConvContextMenu(null); }; window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, []);

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
  if (!isLoggedIn) return <div className="dm-empty" style={{ padding: 40 }}><p>Connectez-vous pour accéder à la messagerie</p></div>;

  const typingInConv = activeConv ? typingUsers.get(activeConv.id) : undefined;
  const typingNames = typingInConv ? Array.from(typingInConv).filter((uid) => uid !== myId).map((uid) => { const p = activeConv?.participants.find((pp) => pp.userId === uid); return p?.user.profile.displayName ?? "Quelqu'un"; }) : [];

  return (
    <div
      className="dm-shell"
      style={{ "--ks-kb-offset": `${keyboardOffset}px` } as CSSProperties}
    >
      {/* Call overlays */}
      {callState && callState.status === "ringing" && callState.direction === "incoming" && (
        <div className="dm-call-overlay">
          <div className="dm-call-screen dm-call-screen--incoming">
            <div className="dm-ringtone-pulse"><span className="dm-ringtone-dot" /><span className="dm-ringtone-dot" /><span className="dm-ringtone-dot" /></div>
            <div className="dm-call-caller-avatar dm-call-caller-avatar--lg">
              {(() => {
                const conv = conversations.find((c) => c.id === callState.conversationId);
                const avatar = conv ? getConversationAvatar(conv, myId) : null;
                const name = conv ? getConversationName(conv, myId) : "Appel";
                return avatar ? <img src={avatar} alt="" /> : <span>{initials(name)}</span>;
              })()}
            </div>
            <p className="dm-call-label dm-call-label--title">
              {(() => {
                const conv = conversations.find((c) => c.id === callState.conversationId);
                return conv ? getConversationName(conv, myId) : "Utilisateur";
              })()}
            </p>
            <p className="dm-call-label">📞 Appel {callState.type === "video" ? "vidéo" : "audio"} entrant</p>
            <div className="dm-call-actions">
              <button className="dm-call-btn dm-call-btn--reject" onClick={rejectCall}>Refuser</button>
              <button className="dm-call-btn dm-call-btn--accept" onClick={() => void acceptCall(callState.type)}>Accepter</button>
              {callState.type === "video" && (
                <button className="dm-call-btn dm-call-btn--audio" onClick={() => void acceptCall("audio")}>Audio seulement</button>
              )}
            </div>
          </div>
        </div>
      )}
      {callState && (callState.status === "connected" || (callState.status === "ringing" && callState.direction === "outgoing")) && (
        <div className="dm-call-overlay">
          <div className="dm-call-screen dm-call-screen--active">
            <audio ref={remoteAudioRef} autoPlay playsInline />
            {callState.status === "ringing" && <div className="dm-ringtone-pulse"><span className="dm-ringtone-dot" /><span className="dm-ringtone-dot" /><span className="dm-ringtone-dot" /></div>}
            {callState.type === "video" && <div className="dm-call-videos"><video ref={remoteVideoRef} autoPlay playsInline className="dm-call-video-remote" /><video ref={localVideoRef} autoPlay playsInline muted className="dm-call-video-local" /></div>}
            <p className="dm-call-label">{callState.status === "ringing" ? "Appel en cours..." : `Appel ${callState.type} connecté`}</p>
            <button className="dm-call-btn dm-call-btn--reject" onClick={endCall}>Raccrocher</button>
          </div>
        </div>
      )}

      {/* Profile modal */}
      {profileUser && (
        <div className="dm-profile-overlay" onClick={() => setProfileUser(null)}>
          <div className="dm-profile-card" onClick={(e) => e.stopPropagation()}>
            <button className="dm-profile-close" onClick={() => setProfileUser(null)}>✕</button>
            <div className="dm-profile-avatar-lg">{profileUser.avatarUrl ? <img src={profileUser.avatarUrl} alt="" /> : initials(profileUser.displayName)}</div>
            <p className="dm-profile-name">{profileUser.displayName}</p>
            {profileUser.username && <p className="dm-profile-username">@{profileUser.username}</p>}
            <p className="dm-profile-id">ID: {profileUser.userId.slice(0, 12)}</p>
            <div className="dm-profile-actions"><button className="dm-profile-action-btn dm-profile-action-btn--primary" onClick={() => setProfileUser(null)}>Message</button></div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`dm-sidebar${showSidebar ? "" : " dm-sidebar--hidden"}`}>
        <div className="dm-sidebar-header">
          <div className="dm-sidebar-tabs">
            <button className={`dm-sidebar-tab${sidebarTab === "messages" ? " active" : ""}`} onClick={() => setSidebarTab("messages")}>Messages</button>
            <button className={`dm-sidebar-tab${sidebarTab === "journal" ? " active" : ""}`} onClick={() => setSidebarTab("journal")}>📞 Journal</button>
          </div>
          <div className="dm-sidebar-actions">
            <button className={`dm-icon-btn${showArchived ? " dm-icon-btn--active" : ""}`} title={showArchived ? "Retour" : "Archives"} onClick={() => setShowArchived(!showArchived)}>
              {archivedConvIds.size > 0 && !showArchived && <span className="dm-archive-dot" />}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            </button>
            <button className="dm-icon-btn" title="Nouvelle conversation" onClick={() => setShowSearch(!showSearch)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
          {isConnected && <span className="dm-online-dot" title="Connecté" />}
        </div>

        {sidebarTab === "messages" && showSearch && (
          <div className="dm-search-panel">
            <input className="dm-search-input" placeholder="Rechercher..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
            <div className="dm-search-results">
              {searchResults.map((u) => (
                <button key={u.id} className="dm-search-result" onClick={() => void startDMConversation(u.id)}>
                  <div className="dm-avatar dm-avatar--sm">{u.profile.avatarUrl ? <img src={u.profile.avatarUrl} alt="" /> : initials(u.profile.displayName)}</div>
                  <div className="dm-search-info"><strong>{u.profile.displayName}</strong><span>{u.profile.username ? `@${u.profile.username}` : ""}{u.profile.city ? ` · ${u.profile.city}` : ""}</span></div>
                </button>
              ))}
              {searchQuery.length >= 2 && searchResults.length === 0 && <p className="dm-empty-sm">Aucun résultat</p>}
            </div>
          </div>
        )}

        {sidebarTab === "messages" && (
        <div className="dm-conv-list">
          {loadingConvs ? <div className="dm-loading-sm">Chargement...</div>
          : conversations.filter((c) => showArchived ? archivedConvIds.has(c.id) : !archivedConvIds.has(c.id)).length === 0
          ? <div className="dm-empty"><p>{showArchived ? "Aucune archive" : "Aucune conversation"}</p><p>{showArchived ? "" : "Recherchez un utilisateur"}</p></div>
          : conversations.filter((c) => showArchived ? archivedConvIds.has(c.id) : !archivedConvIds.has(c.id))
              .sort((a, b) => { const ap = pinnedConvIds.has(a.id) ? 0 : 1; const bp = pinnedConvIds.has(b.id) ? 0 : 1; if (ap !== bp) return ap - bp; return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(); })
              .map((conv) => {
                const name = getConversationName(conv, myId);
                const avatar = getConversationAvatar(conv, myId);
                const lastMsg = conv.messages?.[0];
                const otherUid = getOtherUserId(conv, myId);
                const isOnline = otherUid ? onlineUserIds.has(otherUid) : false;
                const isPinned = pinnedConvIds.has(conv.id);
                const isMuted = mutedConvIds.has(conv.id);
                return (
                  <button key={conv.id} className={`dm-conv-item${activeConv?.id === conv.id ? " active" : ""}${isPinned ? " dm-conv-item--pinned" : ""}`}
                    onClick={() => { setActiveConv(conv); setShowSidebar(false); }}
                    onContextMenu={(e) => { e.preventDefault(); setConvContextMenu({ x: e.clientX, y: e.clientY, convId: conv.id }); }}>
                    <div className="dm-avatar">{avatar ? <img src={avatar} alt="" /> : initials(name)}{isOnline && <span className="dm-online-badge" />}</div>
                    <div className="dm-conv-info">
                      <div className="dm-conv-top">
                        <span className="dm-conv-name">{isPinned && <span className="dm-pin-icon">📌</span>}{name}</span>
                        {lastMsg && <span className="dm-conv-time">{timeLabel(lastMsg.createdAt)}</span>}
                      </div>
                      <div className="dm-conv-bottom">
                        <span className="dm-conv-preview">{isMuted && "🔇 "}{lastMsg ? lastMsg.isDeleted ? "Supprimé" : lastMsg.type === "IMAGE" ? "📷" : lastMsg.type === "AUDIO" ? "🎵" : lastMsg.type === "VIDEO" ? "🎬" : lastMsg.type === "FILE" ? "📎" : (lastMsg.senderId === myId ? "Vous: " : "") + (lastMsg.content?.slice(0, 35) ?? "") : "Nouveau"}</span>
                        {conv.unreadCount > 0 && !isMuted && <span className="dm-unread-badge">{conv.unreadCount}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
        </div>
        )}

        {sidebarTab === "journal" && (
          <div className="dm-call-log-list">
            {loadingCallLogs ? <div className="dm-loading-sm">Chargement...</div>
            : callLogs.length === 0 ? <div className="dm-empty"><p>Aucun appel</p><p>Votre historique apparaîtra ici</p></div>
            : callLogs.map((log) => {
                const isCaller = log.callerUserId === myId;
                const other = isCaller ? log.receiver : log.caller;
                const isMissed = log.status === "MISSED" || log.status === "NO_ANSWER";
                const isRejected = log.status === "REJECTED";
                const statusIcon = isMissed ? "❌" : isRejected ? "↩️" : "✅";
                const directionIcon = isCaller ? "↗️" : "↙️";
                const typeIcon = log.callType === "VIDEO" ? "📹" : "📞";
                const durationLabel = log.durationSeconds != null && log.durationSeconds > 0
                  ? log.durationSeconds >= 3600
                    ? `${Math.floor(log.durationSeconds / 3600)}h ${Math.floor((log.durationSeconds % 3600) / 60)}m`
                    : log.durationSeconds >= 60
                      ? `${Math.floor(log.durationSeconds / 60)}m ${log.durationSeconds % 60}s`
                      : `${log.durationSeconds}s`
                  : null;
                return (
                  <div key={log.id} className={`dm-call-log-item${isMissed ? " dm-call-log-item--missed" : isRejected ? " dm-call-log-item--rejected" : ""}`}>
                    <div className="dm-avatar dm-avatar--sm">
                      {other.profile.avatarUrl ? <img src={other.profile.avatarUrl} alt="" /> : initials(other.profile.displayName)}
                    </div>
                    <div className="dm-call-log-info">
                      <div className="dm-call-log-top">
                        <span className="dm-call-log-name">{other.profile.displayName}</span>
                        <span className="dm-call-log-time">{timeLabel(log.startedAt)}</span>
                      </div>
                      <div className="dm-call-log-bottom">
                        <span className="dm-call-log-meta">{directionIcon} {typeIcon} {statusIcon} {isCaller ? "Sortant" : "Entrant"}</span>
                        {durationLabel && <span className="dm-call-log-duration">⏱ {durationLabel}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {convContextMenu && (
          <div className="dm-context-menu" style={{ top: convContextMenu.y, left: convContextMenu.x }}>
            <button onClick={() => { const id = convContextMenu.convId; if (pinnedConvIds.size >= 5 && !pinnedConvIds.has(id)) alert("Max 5 épinglées."); else setPinnedConvIds((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); setConvContextMenu(null); }}>{pinnedConvIds.has(convContextMenu.convId) ? "📌 Désépingler" : "📌 Épingler"}</button>
            <button onClick={() => { setArchivedConvIds((p) => { const n = new Set(p); const id = convContextMenu.convId; if (n.has(id)) n.delete(id); else n.add(id); return n; }); if (activeConv?.id === convContextMenu.convId) setActiveConv(null); setConvContextMenu(null); }}>{archivedConvIds.has(convContextMenu.convId) ? "📦 Désarchiver" : "📦 Archiver"}</button>
            <button onClick={() => { setMutedConvIds((p) => { const n = new Set(p); const id = convContextMenu.convId; if (n.has(id)) n.delete(id); else n.add(id); return n; }); setConvContextMenu(null); }}>{mutedConvIds.has(convContextMenu.convId) ? "🔔 Sons" : "🔇 Sourdine"}</button>
            <div className="dm-context-menu-divider" />
            <button onClick={() => { setBlockedConvIds((p) => { const n = new Set(p); const id = convContextMenu.convId; if (n.has(id)) n.delete(id); else n.add(id); return n; }); setConvContextMenu(null); }}>{blockedConvIds.has(convContextMenu.convId) ? "🟢 Débloquer" : "🚫 Bloquer"}</button>
            <button className="dm-ctx-danger" onClick={() => { if (confirm("Supprimer ?")) { setConversations((p) => p.filter((c) => c.id !== convContextMenu.convId)); if (activeConv?.id === convContextMenu.convId) setActiveConv(null); } setConvContextMenu(null); }}>🗑 Supprimer</button>
          </div>
        )}
      </aside>

      {/* Chat panel */}
      <main className={`dm-chat${!activeConv ? " dm-chat--empty" : ""}`}>
        {!activeConv ? (
          <div className="dm-chat-placeholder">
            <span className="dm-chat-placeholder-icon">💬</span>
            <h3>Messagerie</h3>
            <p>Sélectionnez une conversation</p>
          </div>
        ) : (
          <>
            <div className="dm-chat-header">
              <button className="dm-back-btn" onClick={() => setShowSidebar(true)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
              <div className="dm-avatar dm-avatar--sm" onClick={() => { if (!activeConv.isGroup) { const o = getOtherParticipant(activeConv, myId); if (o) setProfileUser({ displayName: o.user.profile.displayName, avatarUrl: o.user.profile.avatarUrl, username: o.user.profile.username ?? null, userId: o.userId }); } }}>
                {getConversationAvatar(activeConv, myId) ? <img src={getConversationAvatar(activeConv, myId)!} alt="" /> : initials(getConversationName(activeConv, myId))}
                {!activeConv.isGroup && getOtherUserId(activeConv, myId) && onlineUserIds.has(getOtherUserId(activeConv, myId)!) && <span className="dm-online-badge" />}
              </div>
              <div className="dm-chat-header-info">
                <strong>{getConversationName(activeConv, myId)}</strong>
                <span>{typingNames.length > 0 ? `${typingNames.join(", ")} écrit...` : !activeConv.isGroup && getOtherUserId(activeConv, myId) && onlineUserIds.has(getOtherUserId(activeConv, myId)!) ? "En ligne" : ""}</span>
              </div>
              <div className="dm-chat-header-actions">
                {!activeConv.isGroup && (
                  <>
                    <button className="dm-icon-btn" title="Appel audio" onClick={() => void startCall("audio")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>
                    <button className="dm-icon-btn" title="Appel vidéo" onClick={() => void startCall("video")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg></button>
                  </>
                )}
              </div>
            </div>

            <div className="dm-messages">
              {loadingMsgs ? <div className="dm-loading-sm">Chargement...</div>
              : messages.length === 0 ? <div className="dm-empty"><p>Aucun message</p><p>Envoyez le premier !</p></div>
              : messages.map((msg, idx) => {
                  const isMine = msg.senderId === myId;
                  const showSender = activeConv.isGroup && !isMine && (idx === 0 || messages[idx - 1].senderId !== msg.senderId);
                  const readByOthers = msg.readReceipts.filter((r) => r.userId !== myId);
                  return (
                    <div key={msg.id} className={`dm-bubble-wrap${isMine ? " dm-bubble-wrap--mine" : ""}`}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, message: msg }); }}>
                      {showSender && <span className="dm-bubble-sender">{msg.sender.profile.displayName}</span>}
                      <div className={`dm-bubble${isMine ? " dm-bubble--mine" : ""}${msg.isDeleted ? " dm-bubble--deleted" : ""}`}>
                        {msg.replyTo && !msg.isDeleted && <div className="dm-reply-preview"><strong>{msg.replyTo.sender.profile.displayName}</strong><span>{msg.replyTo.type !== "TEXT" ? `📎 ${msg.replyTo.type}` : msg.replyTo.content?.slice(0, 50)}</span></div>}
                        {msg.isDeleted ? <p className="dm-deleted-text">🚫 Supprimé</p>
                        : msg.type === "IMAGE" && msg.mediaUrl ? <img src={msg.mediaUrl} alt="" className="dm-media-img" onClick={() => window.open(msg.mediaUrl!, "_blank")} />
                        : msg.type === "AUDIO" && msg.mediaUrl ? <DmAudioPlayer src={msg.mediaUrl} />
                        : msg.type === "VIDEO" && msg.mediaUrl ? <video controls src={msg.mediaUrl} className="dm-media-video" />
                        : msg.type === "FILE" && msg.mediaUrl ? <a href={msg.mediaUrl} download={msg.fileName ?? "file"} className="dm-file-link">📎 {msg.fileName ?? "Fichier"}</a>
                        : <p className="dm-text">{msg.content}</p>}
                        <div className="dm-meta">
                          <span className="dm-time">{new Date(msg.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                          {msg.isEdited && <span className="dm-edited">modifié</span>}
                          {isMine && <span className="dm-read-status">{readByOthers.length > 0 ? "✓✓" : "✓"}</span>}
                        </div>
                      </div>
                      {!msg.isDeleted && (
                        <div className="dm-bubble-actions">
                          <button className="dm-bubble-action" title="Répondre" onClick={() => setReplyTo(msg)}>↩</button>
                          {isMine && msg.type === "TEXT" && <button className="dm-bubble-action" title="Modifier" onClick={() => { setEditingMsg(msg); setDraft(msg.content ?? ""); }}>✏️</button>}
                          {isMine && <button className="dm-bubble-action" title="Supprimer" onClick={() => emit("message:delete", { messageId: msg.id, conversationId: activeConv.id })}>🗑</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              <div ref={messagesEndRef} />
            </div>

            {contextMenu && (
              <div className="dm-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
                <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null); }}>↩️ Répondre</button>
                {contextMenu.message.content && <button onClick={() => { void navigator.clipboard.writeText(contextMenu.message.content ?? ""); setContextMenu(null); }}>📋 Copier</button>}
                {contextMenu.message.senderId === myId && contextMenu.message.type === "TEXT" && <button onClick={() => { setEditingMsg(contextMenu.message); setDraft(contextMenu.message.content ?? ""); setContextMenu(null); }}>✏️ Modifier</button>}
                <button onClick={() => { alert(`De: ${contextMenu.message.sender.profile.displayName}\n${fullTime(contextMenu.message.createdAt)}\nType: ${contextMenu.message.type}`); setContextMenu(null); }}>ℹ️ Infos</button>
                <div className="dm-context-menu-divider" />
                {contextMenu.message.senderId === myId && <button className="dm-ctx-danger" onClick={() => { emit("message:delete", { messageId: contextMenu.message.id, conversationId: activeConv.id }); setContextMenu(null); }}>🗑 Supprimer</button>}
              </div>
            )}

            {(replyTo || editingMsg) && (
              <div className="dm-reply-bar">
                <div className="dm-reply-bar-content">
                  <strong>{editingMsg ? "Modification" : `↩ ${replyTo!.sender.profile.displayName}`}</strong>
                  <span>{editingMsg ? editingMsg.content?.slice(0, 50) : replyTo!.type !== "TEXT" ? `📎 ${replyTo!.type}` : replyTo!.content?.slice(0, 50)}</span>
                </div>
                <button className="dm-reply-bar-close" onClick={() => { setReplyTo(null); setEditingMsg(null); setDraft(""); }}>✕</button>
              </div>
            )}

            {recordingAudio && (
              <div className="dm-waveform-bar">
                <span className="dm-waveform-timer">{formatAudioTime(recordingTime)}</span>
                <canvas ref={waveformCanvasRef} className="dm-waveform-canvas" width={350} height={30} />
                <button className="dm-waveform-cancel" type="button" onClick={cancelRecordingAudio}>✕</button>
                <button className="dm-waveform-stop" type="button" onClick={stopRecordingAudio}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
              </div>
            )}

            {!recordingAudio && (
              <form className="dm-input-bar" onSubmit={handleSend}>
                <button type="button" className="dm-icon-btn" title="Fichier" onClick={() => fileInputRef.current?.click()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <input ref={fileInputRef} type="file" hidden accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.zip" multiple onChange={(e) => void handleFileSelect(e.target.files)} />
                <button type="button" className="dm-icon-btn" title="Emoji / GIF / Stickers" onClick={() => setShowEmoji(!showEmoji)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                {showEmoji && (
                  <div className="dm-emoji-picker">
                    <div className="dm-picker-tabs">
                      <button type="button" className={`dm-picker-tab${pickerTab === "emoji" ? " active" : ""}`} onClick={() => setPickerTab("emoji")}>😀 Emoji</button>
                      <button type="button" className={`dm-picker-tab${pickerTab === "gif" ? " active" : ""}`} onClick={() => setPickerTab("gif")}>GIF</button>
                      <button type="button" className={`dm-picker-tab${pickerTab === "sticker" ? " active" : ""}`} onClick={() => setPickerTab("sticker")}>🩹 Sticker</button>
                    </div>
                    {pickerTab === "emoji" && (
                      <>
                        <div className="dm-emoji-header">{EMOJI_CATEGORIES.map((cat, i) => <button key={i} type="button" className={`dm-emoji-cat-btn${emojiCat === i ? " active" : ""}`} onClick={() => setEmojiCat(i)}>{cat.icon}</button>)}</div>
                        <div className="dm-emoji-grid">{EMOJI_CATEGORIES[emojiCat].emojis.map((em, i) => <button key={i} type="button" className="dm-emoji-btn" onClick={() => { insertEmoji(em); setShowEmoji(false); }}>{em}</button>)}</div>
                      </>
                    )}
                    {pickerTab === "gif" && (
                      <div className="dm-gif-panel">
                        <input className="dm-gif-search" placeholder="Rechercher un GIF..." value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} autoFocus />
                        <div className="dm-gif-grid">
                          {gifLoading && <p className="dm-empty-sm">Recherche...</p>}
                          {!gifLoading && gifQuery.length >= 2 && gifResults.length === 0 && <p className="dm-empty-sm">Aucun GIF trouvé</p>}
                          {gifResults.map((g) => <button key={g.id} type="button" className="dm-gif-item" onClick={() => sendGif(g.url)}><img src={g.preview} alt="GIF" loading="lazy" /></button>)}
                        </div>
                      </div>
                    )}
                    {pickerTab === "sticker" && (
                      <div className="dm-sticker-panel">
                        <div className="dm-emoji-header">{STICKER_PACKS.map((pack, i) => <button key={i} type="button" className={`dm-emoji-cat-btn${stickerPack === i ? " active" : ""}`} onClick={() => setStickerPack(i)}>{pack.name}</button>)}</div>
                        <div className="dm-sticker-grid">{STICKER_PACKS[stickerPack].stickers.map((st, i) => <button key={i} type="button" className="dm-sticker-btn" onClick={() => sendSticker(st)}>{st}</button>)}</div>
                      </div>
                    )}
                  </div>
                )}
                <input className="dm-text-input" placeholder={editingMsg ? "Modifier..." : "Message..."} value={draft} onChange={(e) => { setDraft(e.target.value); handleTyping(); }} autoFocus />
                {draft.trim() ? (
                  <button type="submit" className="dm-send-btn" title="Envoyer"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
                ) : (
                  <button type="button" className="dm-icon-btn" title="Vocal" onClick={() => void startRecordingAudio()}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  </button>
                )}
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
