import {
  useEffect, useState, useRef, useCallback, useMemo, type CSSProperties, type FormEvent, type TouchEvent as ReactTouchEvent,
} from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../app/providers/AuthProvider";
import {
  messaging,
  type ConversationSummary,
  type ChatMessage,
  type MessageUser,
} from "../../lib/api-client";
import { useSocket } from "../../hooks/useSocket";
import { useLocaleCurrency } from "../../app/providers/LocaleCurrencyProvider";
import { createOptimizedAudioRecorder, createUploadFile, prepareMediaUrl } from "../../utils/media-upload";
import { useGlobalNotification } from "../../app/providers/GlobalNotificationProvider";
import { getDashboardPath } from "../../utils/role-routing";
import "./messaging.css";

/* ═══════════════════════════════════════════
   Kin-Sell Messaging — Refonte mobile-first
   Prefix: mg-*
   ═══════════════════════════════════════════ */

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

/* ── Time helpers ── */
function timeLabel(dateStr: string, t: (k: string) => string, locale: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return t("msg.justNow");
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return t("msg.yesterday");
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

function fullTime(dateStr: string, locale: string) {
  return new Date(dateStr).toLocaleString(locale, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ── Conversation helpers ── */
function getConversationName(conv: ConversationSummary, myId: string, t: (k: string) => string) {
  if (conv.isGroup) return conv.groupName ?? t("msg.group");
  const other = conv.participants.find((p) => p.userId !== myId);
  return other?.user.profile.displayName ?? t("msg.user");
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

function formatLastSeen(iso: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t("msg.seenJustNow");
  if (mins < 60) return t("msg.seenMinutes").replace("{count}", String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("msg.seenHours").replace("{count}", String(hrs));
  const days = Math.floor(hrs / 24);
  if (days === 1) return t("msg.seenYesterday");
  return t("msg.seenDays").replace("{count}", String(days));
}

/** Check if a message is within the 30-minute edit window */
function canEditMessage(msg: ChatMessage): boolean {
  return Date.now() - new Date(msg.createdAt).getTime() < 30 * 60 * 1000;
}

/* ═══ Audio Player ═══ */
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
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => { audio.removeEventListener("timeupdate", onTime); audio.removeEventListener("loadedmetadata", onMeta); audio.removeEventListener("ended", onEnd); };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause(); else void audio.play();
    setPlaying(!playing);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };

  return (
    <div className={`mg-audio-player${playing ? " mg-audio-player--playing" : ""}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button className="mg-audio-play-btn" onClick={toggle} type="button">
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        )}
      </button>
      <div className="mg-audio-track">
        <div className="mg-audio-progress-bg" onClick={seek}>
          <div className="mg-audio-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="mg-audio-time">{formatAudioTime(currentTime)} / {formatAudioTime(duration || 0)}</span>
      </div>
    </div>
  );
}

/* ═══ Drawer (list view) ═══ */
function MgDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  if (!open) return null;

  const go = (path: string) => { onClose(); void navigate(path); };

  return (
    <>
      <div className="mg-drawer-backdrop" onClick={onClose} />
      <aside className="mg-drawer">
        <div className="mg-drawer-header">
          <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" className="mg-drawer-logo" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span className="mg-drawer-brand">Kin-Sell</span>
          <button className="mg-drawer-close" onClick={onClose}>✕</button>
        </div>
        <nav className="mg-drawer-nav">
          <button className="mg-drawer-item" onClick={() => go("/")}>🏠 Accueil</button>
          <button className="mg-drawer-item" onClick={() => go("/explorer")}>🔍 Explorer</button>
          <button className="mg-drawer-item" onClick={() => go("/sokin")}>📢 SoKin</button>
          <button className="mg-drawer-item" onClick={() => go("/sokin/live")}>🔴 SoKin Live</button>
          <button className="mg-drawer-item" onClick={() => go("/forfaits")}>💎 Forfaits</button>
          {isLoggedIn && (
            <>
              <div className="mg-drawer-sep" />
              <button className="mg-drawer-item" onClick={() => go(getDashboardPath(user?.role))}>📊 Tableau de bord</button>
              <button className="mg-drawer-item" onClick={() => go("/cart")}>🛒 Panier</button>
            </>
          )}
        </nav>
        {!isLoggedIn && (
          <div className="mg-drawer-auth">
            <Link to="/login" className="mg-drawer-auth-btn" onClick={onClose}>🔑 Connexion</Link>
            <Link to="/register" className="mg-drawer-auth-btn mg-drawer-auth-btn--accent" onClick={onClose}>✨ Inscription</Link>
          </div>
        )}
      </aside>
    </>
  );
}

/* ═══ TopBar (list view only) ═══ */
function MgTopBar({ onMenuOpen, onSearchToggle }: {
  onMenuOpen: () => void; onSearchToggle: () => void;
}) {
  return (
    <header className="mg-topbar">
      <button className="mg-topbar-btn" onClick={onMenuOpen} aria-label="Menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <Link to="/" className="mg-topbar-logo" aria-label="Kin-Sell — Accueil">
        <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" className="mg-topbar-logo-img" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <span className="mg-topbar-logo-text">Kin-Sell</span>
      </Link>
      <button className="mg-topbar-btn" onClick={onSearchToggle} aria-label="Rechercher">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </button>
    </header>
  );
}

/* ═══ Main Component ═══ */
export function MessagingPage() {
  const { user, isLoading, isLoggedIn } = useAuth();
  const { t, language } = useLocaleCurrency();
  const { emit, on, off, isConnected } = useSocket();
  const { setMessagingActive } = useGlobalNotification();
  const navigate = useNavigate();
  const { conversationId: urlConvId } = useParams<{ conversationId?: string }>();
  const locale = language === "en" ? "en-US" : language === "ln" ? "fr-CD" : "fr-FR";

  /* ── Core state ── */
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConv, setActiveConv] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);

  /* ── Search ── */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; profile: { displayName: string; avatarUrl: string | null; username: string | null; city: string | null } }>>([]);
  const [showSearch, setShowSearch] = useState(false);

  /* ── UI state ── */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: ChatMessage } | null>(null);
  const [convContextMenu, setConvContextMenu] = useState<{ x: number; y: number; convId: string } | null>(null);
  const [profileUser, setProfileUser] = useState<{ displayName: string; avatarUrl: string | null; username: string | null; userId: string } | null>(null);

  /* ── Conversation management ── */
  const [archivedConvIds, setArchivedConvIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [pinnedConvIds, setPinnedConvIds] = useState<Set<string>>(new Set());
  const [mutedConvIds, setMutedConvIds] = useState<Set<string>>(new Set());
  const [blockedConvIds, setBlockedConvIds] = useState<Set<string>>(new Set());

  /* ── Presence ── */
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(new Map());
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [lastSeenMap, setLastSeenMap] = useState<Map<string, string>>(new Map());

  /* ── Recording ── */
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  /* ── Forward & Select ── */
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());

  /* ── Call state ── */
  const [callState, setCallState] = useState<null | { type: "audio" | "video"; conversationId: string; remoteUserId: string; direction: "incoming" | "outgoing"; status: "ringing" | "connected" | "ended" }>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isEarMode, setIsEarMode] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<"unknown" | "good" | "fair" | "poor">("unknown");
  const [qualityMode, setQualityMode] = useState<"auto" | "hd" | "balanced" | "data-saver">("auto");
  const [appliedVideoProfile, setAppliedVideoProfile] = useState<"hd" | "balanced" | "data-saver">("hd");
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
  const callQualityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localFacingModeRef = useRef<"user" | "environment">("user");
  const qualityPoorStreakRef = useRef(0);
  const qualityGoodStreakRef = useRef(0);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iceRestartAttemptRef = useRef(0);

  /* ── MessageGuard ── */
  const [guardAlert, setGuardAlert] = useState<{ type: "warn" | "block"; message: string } | null>(null);
  const guardAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Keyboard offset ── */
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const lastKeyboardOffsetRef = useRef(0);

  /* ── Refs ── */
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Long-press touch ── */
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressMsgRef = useRef<ChatMessage | null>(null);

  /* ── Incoming call refs ── */
  const pendingCallConvIdRef = useRef<string | null>(null);
  const pendingAutoAcceptRef = useRef(false);

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

  /* ════════════════════════════════════════
     Effects
     ════════════════════════════════════════ */

  // Messaging active flag
  useEffect(() => {
    setMessagingActive(true);
    return () => setMessagingActive(false);
  }, [setMessagingActive]);

  /* ── Ringtone ── */
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
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = callState?.direction === "incoming" ? 440 : 480;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
        setTimeout(() => ctx.close(), 700);
      } catch { /* audio policy */ }
    };
    playTone();
    ringtoneIntervalRef.current = setInterval(playTone, 2000);
    return () => { if (ringtoneIntervalRef.current) clearInterval(ringtoneIntervalRef.current); };
  }, [callState?.status, callState?.direction]);

  /* ── Vibration on incoming ringing ── */
  useEffect(() => {
    const isIncomingRinging = callState?.status === "ringing" && callState.direction === "incoming";
    if (!isIncomingRinging) {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(0);
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([240, 140, 240]);
      const id = setInterval(() => navigator.vibrate([240, 140, 240]), 2500);
      return () => { clearInterval(id); navigator.vibrate(0); };
    }
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
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callState?.status]);

  /* ── Attach media streams ── */
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

  /* ── Handle incoming call from URL params ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incomingConvId = params.get("incomingConvId");
    const incomingCallerId = params.get("incomingCallerId");
    const incomingCallType = params.get("incomingCallType") as "audio" | "video" | null;
    const callAction = params.get("callAction");
    const convId = params.get("convId");
    const callerId = params.get("callerId");
    const callType = params.get("callType") as "audio" | "video" | null;

    if (incomingConvId && incomingCallerId) {
      pendingCallConvIdRef.current = incomingConvId;
      pendingAutoAcceptRef.current = false;
      setCallState({ type: incomingCallType === "video" ? "video" : "audio", conversationId: incomingConvId, remoteUserId: incomingCallerId, direction: "incoming", status: "ringing" });
      window.history.replaceState(null, "", "/messaging");
    } else if (callAction === "accept" && convId && callerId) {
      pendingCallConvIdRef.current = convId;
      pendingAutoAcceptRef.current = true;
      setCallState({ type: callType === "video" ? "video" : "audio", conversationId: convId, remoteUserId: callerId, direction: "incoming", status: "ringing" });
      window.history.replaceState(null, "", "/messaging");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Load conversations ── */
  useEffect(() => {
    if (!isLoggedIn) return;
    setLoadingConvs(true);
    messaging.conversations()
      .then((data) => setConversations(data.conversations))
      .catch(() => {})
      .finally(() => setLoadingConvs(false));
  }, [isLoggedIn]);

  /* ── Auto-select conversation from URL or pending call ── */
  useEffect(() => {
    if (!conversations.length) return;
    // Pending call
    if (pendingCallConvIdRef.current) {
      const conv = conversations.find((c) => c.id === pendingCallConvIdRef.current);
      if (conv) { setActiveConv(conv); pendingCallConvIdRef.current = null; }
    }
    // URL param
    if (urlConvId && !activeConv) {
      const conv = conversations.find((c) => c.id === urlConvId);
      if (conv) setActiveConv(conv);
    }
  }, [conversations, urlConvId, activeConv]);

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

  /* ════════════════════════════════════════
     Socket events
     ════════════════════════════════════════ */

  useEffect(() => {
    const handleNewMessage = (data: { message: ChatMessage }) => {
      const msg = data.message as ChatMessage;
      setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === msg.conversationId ? { ...c, messages: [msg], updatedAt: msg.createdAt, unreadCount: c.id === activeConv?.id ? c.unreadCount : (c.unreadCount ?? 0) + 1 } : c
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
      if (msg.conversationId === activeConv?.id && msg.senderId !== myId) {
        void messaging.markRead(msg.conversationId);
        emit("conversation:read", { conversationId: msg.conversationId });
      }
    };
    const handleEditedMessage = (data: { message: ChatMessage }) => {
      setMessages((prev) => prev.map((m) => m.id === data.message.id ? data.message : m));
    };
    const handleDeletedMessage = (data: { messageId: string }) => {
      setMessages((prev) => prev.map((m) => m.id === data.messageId ? { ...m, isDeleted: true, content: null, mediaUrl: null } : m));
    };
    const handleTypingStart = (data: { conversationId: string; userId: string }) => {
      setTypingUsers((prev) => { const next = new Map(prev); if (!next.has(data.conversationId)) next.set(data.conversationId, new Set()); next.get(data.conversationId)!.add(data.userId); return next; });
    };
    const handleTypingStop = (data: { conversationId: string; userId: string }) => {
      setTypingUsers((prev) => { const next = new Map(prev); next.get(data.conversationId)?.delete(data.userId); return next; });
    };
    const handleOnline = (data: { userId: string }) => setOnlineUserIds((prev) => new Set(prev).add(data.userId));
    const handlePresenceSnapshot = (data: { userIds: string[] }) => setOnlineUserIds(new Set(data.userIds));
    const handleOffline = (data: { userId: string; lastSeenAt?: string }) => {
      setOnlineUserIds((prev) => { const n = new Set(prev); n.delete(data.userId); return n; });
      if (data.lastSeenAt) setLastSeenMap((prev) => new Map(prev).set(data.userId, data.lastSeenAt!));
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

  /* ════════════════════════════════════════
     WebRTC call socket events
     ════════════════════════════════════════ */

  useEffect(() => {
    const handleIncomingCall = (data: { conversationId: string; callerId: string; callType: "audio" | "video" }) => {
      setCallState({ type: data.callType, conversationId: data.conversationId, remoteUserId: data.callerId, direction: "incoming", status: "ringing" });
    };
    const handleCallAccepted = async (data: { conversationId: string; accepterId: string }) => {
      setCallState((prev) => prev ? { ...prev, status: "connected" } : null);
      if (peerConnectionRef.current) {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        emit("webrtc:offer", { targetUserId: data.accepterId, sdp: offer });
      }
    };
    const handleCallRejected = () => { cleanupCall(); setCallState(null); };
    const handleCallEnded = () => { cleanupCall(); setCallState(null); };
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
    on("call:accepted", handleCallAccepted as any);
    on("call:rejected", handleCallRejected as any);
    on("call:ended", handleCallEnded as any);
    on("webrtc:offer", handleOffer as any);
    on("webrtc:answer", handleAnswer as any);
    on("webrtc:ice-candidate", handleIceCandidate as any);
    return () => {
      off("call:incoming", handleIncomingCall);
      off("call:accepted", handleCallAccepted as any);
      off("call:rejected", handleCallRejected as any);
      off("call:ended", handleCallEnded as any);
      off("webrtc:offer", handleOffer as any);
      off("webrtc:answer", handleAnswer as any);
      off("webrtc:ice-candidate", handleIceCandidate as any);
    };
  }, [on, off, emit]);

  /* ════════════════════════════════════════
     WebRTC helpers
     ════════════════════════════════════════ */

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

    // ICE candidate relay
    pc.onicecandidate = (event) => {
      if (event.candidate) emit("webrtc:ice-candidate", { targetUserId: remoteUserId, candidate: event.candidate.toJSON() });
    };

    // Remote track received
    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0];
      if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = event.streams[0]; void remoteVideoRef.current.play().catch(() => {}); }
      if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = event.streams[0]; remoteAudioRef.current.muted = !isSpeakerOn; void remoteAudioRef.current.play().catch(() => {}); }
    };

    // ── ICE reconnection automatique ──
    // Si la connexion ICE se dégrade (disconnected/failed), tenter un ICE restart
    // au lieu de couper l'appel. Max 3 tentatives.
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        iceRestartAttemptRef.current = 0; // reset compteur si OK
      }
      if (state === "disconnected") {
        // Attendre 2s avant de tenter un restart (le réseau peut revenir seul)
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected" && iceRestartAttemptRef.current < 3) {
            iceRestartAttemptRef.current++;
            pc.restartIce();
            // Renégocier avec iceRestart
            pc.createOffer({ iceRestart: true }).then(async (offer) => {
              await pc.setLocalDescription(offer);
              emit("webrtc:offer", { targetUserId: remoteUserId, sdp: offer });
            }).catch(() => {});
          }
        }, 2000);
      }
      if (state === "failed") {
        if (iceRestartAttemptRef.current < 3) {
          iceRestartAttemptRef.current++;
          pc.restartIce();
          pc.createOffer({ iceRestart: true }).then(async (offer) => {
            await pc.setLocalDescription(offer);
            emit("webrtc:offer", { targetUserId: remoteUserId, sdp: offer });
          }).catch(() => {});
        }
        // Après 3 tentatives, la qualité monitor basculera en "poor"
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [emit, isSpeakerOn]);

  const cleanupCall = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    if (callQualityTimerRef.current) { clearInterval(callQualityTimerRef.current); callQualityTimerRef.current = null; }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    setIsMuted(false); setIsCameraOff(false); setIsSpeakerOn(true); setIsEarMode(false);
    setConnectionQuality("unknown");
    qualityPoorStreakRef.current = 0; qualityGoodStreakRef.current = 0;
    iceRestartAttemptRef.current = 0;
  }, []);

  const applyVideoProfile = useCallback(async (profile: "hd" | "balanced" | "data-saver") => {
    const pc = peerConnectionRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const constraintsByProfile = { hd: { width: 1280, height: 720, frameRate: 30 }, balanced: { width: 960, height: 540, frameRate: 24 }, "data-saver": { width: 640, height: 360, frameRate: 15 } } as const;
    const bitrateByProfile = { hd: 1_800_000, balanced: 900_000, "data-saver": 450_000 } as const;
    try { const c = constraintsByProfile[profile]; await track.applyConstraints({ width: { ideal: c.width, max: c.width }, height: { ideal: c.height, max: c.height }, frameRate: { ideal: c.frameRate, max: c.frameRate } }); } catch { /* device constraints */ }
    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
    if (sender) {
      try { const params = sender.getParameters(); const current = params.encodings?.[0] ?? {}; params.encodings = [{ ...current, maxBitrate: bitrateByProfile[profile], maxFramerate: constraintsByProfile[profile].frameRate, scaleResolutionDownBy: profile === "hd" ? 1 : profile === "balanced" ? 1.2 : 1.6 }]; await sender.setParameters(params); } catch { /* browser compat */ }
    }
    setAppliedVideoProfile(profile);
  }, []);

  const startQualityMonitor = useCallback((pc: RTCPeerConnection) => {
    if (callQualityTimerRef.current) { clearInterval(callQualityTimerRef.current); callQualityTimerRef.current = null; }
    const sample = async () => {
      try {
        const stats = await pc.getStats();
        let fps = 0, packetsLost = 0, packetsRecv = 0, rtt = 0;
        stats.forEach((report) => {
          if (report.type === "inbound-rtp" && (report as any).kind === "video") { fps = Number((report as any).framesPerSecond ?? fps); packetsLost = Number((report as any).packetsLost ?? packetsLost); packetsRecv = Number((report as any).packetsReceived ?? packetsRecv); }
          if (report.type === "candidate-pair" && (report as any).state === "succeeded") { rtt = Number((report as any).currentRoundTripTime ?? rtt); }
        });
        const total = packetsLost + packetsRecv;
        const loss = total > 0 ? packetsLost / total : 0;
        if (loss > 0.12 || fps < 12 || rtt > 0.8) { qualityPoorStreakRef.current += 1; qualityGoodStreakRef.current = 0; setConnectionQuality("poor"); }
        else if (loss > 0.05 || fps < 20 || rtt > 0.35) { qualityPoorStreakRef.current = Math.max(0, qualityPoorStreakRef.current - 1); qualityGoodStreakRef.current = 0; setConnectionQuality("fair"); }
        else { qualityGoodStreakRef.current += 1; qualityPoorStreakRef.current = Math.max(0, qualityPoorStreakRef.current - 1); setConnectionQuality("good"); }
      } catch { setConnectionQuality("unknown"); }
    };
    void sample();
    callQualityTimerRef.current = setInterval(() => void sample(), 3000);
  }, []);

  const getCallMedia = useCallback(async (callType: "audio" | "video", facingMode: "user" | "environment" = "user") => {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 },
      video: callType === "video" ? { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 30 }, facingMode } : false,
    });
  }, []);

  const optimizePeerSenders = useCallback(async (pc: RTCPeerConnection) => {
    await Promise.all(pc.getSenders().map(async (sender) => {
      try {
        const params = sender.getParameters();
        // balanced = compromis idéal entre framerate et résolution selon le réseau
        params.degradationPreference = "balanced";
        if (sender.track?.kind === "video") {
          params.encodings = [{
            ...(params.encodings?.[0] ?? {}),
            maxBitrate: 1_500_000,
            maxFramerate: 30,
            scaleResolutionDownBy: 1,
          }];
        }
        if (sender.track?.kind === "audio") {
          params.encodings = [{
            ...(params.encodings?.[0] ?? {}),
            maxBitrate: 64_000,
          }];
        }
        await sender.setParameters(params);
      } catch { /* */ }
    }));
  }, []);

  /* ── Auto quality adjustment ── */
  useEffect(() => {
    if (!callState || callState.type !== "video" || callState.status !== "connected" || !peerConnectionRef.current) return;
    const target: "hd" | "balanced" | "data-saver" = qualityMode === "auto" ? (connectionQuality === "poor" ? "data-saver" : connectionQuality === "fair" ? "balanced" : "hd") : qualityMode;
    if (target === appliedVideoProfile) return;
    void applyVideoProfile(target);
  }, [callState?.status, callState?.type, connectionQuality, qualityMode, appliedVideoProfile, applyVideoProfile]);

  const cycleQualityMode = useCallback(() => {
    setQualityMode((prev) => prev === "auto" ? "hd" : prev === "hd" ? "balanced" : prev === "balanced" ? "data-saver" : "auto");
  }, []);

  const toggleMute = useCallback(() => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
  }, []);

  const toggleCamera = useCallback(() => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsCameraOff(!t.enabled); }
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => {
      const next = !prev;
      if (remoteAudioRef.current) remoteAudioRef.current.muted = !next;
      if (remoteVideoRef.current) remoteVideoRef.current.muted = !next;
      return next;
    });
  }, []);

  const switchCamera = useCallback(async () => {
    if (!callState || callState.type !== "video" || !localStreamRef.current || !peerConnectionRef.current) return;
    const currentTrack = localStreamRef.current.getVideoTracks()[0];
    if (!currentTrack) return;
    setIsSwitchingCamera(true);
    const target: "user" | "environment" = localFacingModeRef.current === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 30 }, facingMode: target }, audio: false });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
      localStreamRef.current.removeTrack(currentTrack); currentTrack.stop(); localStreamRef.current.addTrack(newTrack);
      if (localVideoRef.current) { localVideoRef.current.srcObject = localStreamRef.current; void localVideoRef.current.play().catch(() => {}); }
      localFacingModeRef.current = target;
    } catch { alert(t("msg.cameraSwitchError")); }
    finally { setIsSwitchingCamera(false); }
  }, [callState, t]);

  const startCall = useCallback(async (callType: "audio" | "video") => {
    if (!activeConv || activeConv.isGroup) return;
    const remoteUserId = getOtherUserId(activeConv, myId);
    if (!remoteUserId) return;
    try {
      localFacingModeRef.current = "user";
      const stream = await getCallMedia(callType, "user");
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPeerConnection(remoteUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await optimizePeerSenders(pc);
      await applyVideoProfile("hd");
      startQualityMonitor(pc);
      setCallState({ type: callType, conversationId: activeConv.id, remoteUserId, direction: "outgoing", status: "ringing" });
      emit("call:initiate", { conversationId: activeConv.id, targetUserId: remoteUserId, callType });
    } catch { alert(t("msg.callMediaAccessError")); }
  }, [activeConv, myId, createPeerConnection, emit, optimizePeerSenders, getCallMedia, startQualityMonitor, applyVideoProfile, t]);

  const acceptCall = useCallback(async (preferredType?: "audio" | "video") => {
    if (!callState) return;
    const acceptedType = preferredType ?? callState.type;
    try {
      localFacingModeRef.current = "user";
      const stream = await getCallMedia(acceptedType, "user");
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPeerConnection(callState.remoteUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await optimizePeerSenders(pc);
      await applyVideoProfile("hd");
      startQualityMonitor(pc);
      emit("call:accept", { conversationId: callState.conversationId, callerId: callState.remoteUserId });
      setCallState((prev) => prev ? { ...prev, type: acceptedType, status: "connected" } : null);
    } catch { alert(t("msg.callMediaAccessError")); }
  }, [callState, createPeerConnection, emit, optimizePeerSenders, getCallMedia, startQualityMonitor, applyVideoProfile, t]);

  const rejectCall = useCallback(() => {
    if (!callState) return;
    emit("call:reject", { conversationId: callState.conversationId, callerId: callState.remoteUserId });
    cleanupCall(); setCallState(null);
  }, [callState, emit, cleanupCall]);

  const endCall = useCallback(() => {
    if (!callState) return;
    emit("call:end", { conversationId: callState.conversationId, targetUserId: callState.remoteUserId });
    cleanupCall(); setCallState(null);
  }, [callState, emit, cleanupCall]);

  /* ── Global call accept/reject events ── */
  useEffect(() => {
    const handleGlobalAccept = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string; callType?: "audio" | "video" }>).detail;
      if (!callState || callState.status !== "ringing" || callState.direction !== "incoming") return;
      if (detail?.conversationId && detail.conversationId !== callState.conversationId) return;
      void acceptCall(detail?.callType);
    };
    const handleGlobalReject = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (!callState) return;
      if (detail?.conversationId && detail.conversationId !== callState.conversationId) return;
      rejectCall();
    };
    window.addEventListener("ks:incoming-call-accept", handleGlobalAccept as EventListener);
    window.addEventListener("ks:incoming-call-reject", handleGlobalReject as EventListener);
    return () => { window.removeEventListener("ks:incoming-call-accept", handleGlobalAccept as EventListener); window.removeEventListener("ks:incoming-call-reject", handleGlobalReject as EventListener); };
  }, [acceptCall, rejectCall, callState]);

  useEffect(() => {
    if (!pendingAutoAcceptRef.current || !callState || callState.status !== "ringing" || callState.direction !== "incoming" || !activeConv || activeConv.id !== callState.conversationId) return;
    pendingAutoAcceptRef.current = false;
    void acceptCall();
  }, [acceptCall, activeConv, callState]);

  /* ════════════════════════════════════════
     Actions / Callbacks
     ════════════════════════════════════════ */

  const handleTyping = useCallback(() => {
    if (!activeConv) return;
    emit("typing:start", { conversationId: activeConv.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emit("typing:stop", { conversationId: activeConv.id }), 2000);
  }, [activeConv, emit]);

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
      setEditingMsg(null); setDraft(""); return;
    }
    emit("message:send", { conversationId: activeConv.id, content: text, type: "TEXT", replyToId: replyTo?.id }, (res: any) => {
      if (res && !res.ok) { showGuardAlert("block", res.error || "🔒 Message bloqué par le système de sécurité."); setDraft(text); return; }
      if (res?.guardWarning) showGuardAlert("warn", res.guardWarning);
    });
    setDraft(""); setReplyTo(null);
    emit("typing:stop", { conversationId: activeConv.id });
  }, [activeConv, draft, replyTo, editingMsg, emit, showGuardAlert]);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !activeConv) return;
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      const isAudio = file.type.startsWith("audio/");
      const isVideo = file.type.startsWith("video/");
      const mediaUrl = await prepareMediaUrl(file);
      emit("message:send", { conversationId: activeConv.id, type: isImage ? "IMAGE" : isAudio ? "AUDIO" : isVideo ? "VIDEO" : "FILE", mediaUrl, fileName: file.name, replyToId: replyTo?.id }, (res: any) => {
        if (res && !res.ok) { showGuardAlert("block", res.error || "🔒 Fichier bloqué."); return; }
        if (res?.guardWarning) showGuardAlert("warn", res.guardWarning);
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
      ctx.lineWidth = 2; ctx.strokeStyle = "#ef4444"; ctx.beginPath();
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
    };
    draw();
  }, []);

  const startRecordingAudio = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = createOptimizedAudioRecorder(stream);
      audioChunksRef.current = [];
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
          emit("message:send", { conversationId: activeConv.id, type: "AUDIO", mediaUrl, fileName: "audio-message.webm" }, (res: any) => {
            if (res && !res.ok) { showGuardAlert("block", res.error || "🔒 Audio bloqué."); return; }
            if (res?.guardWarning) showGuardAlert("warn", res.guardWarning);
          });
        })();
        stream.getTracks().forEach((t) => t.stop());
        actx.close();
      };
      recorder.start();
      setMediaRecorder(recorder); setRecordingAudio(true); setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
      setTimeout(() => drawWaveform(), 50);
    } catch { alert(t("msg.micAccessError")); }
  }, [activeConv, emit, drawWaveform, t, showGuardAlert]);

  const stopRecordingAudio = useCallback(() => {
    mediaRecorder?.stop();
    setMediaRecorder(null); setRecordingAudio(false);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
  }, [mediaRecorder]);

  const cancelRecordingAudio = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = () => { mediaRecorder.stream.getTracks().forEach((t) => t.stop()); audioContextRef.current?.close(); };
      mediaRecorder.stop();
    }
    setMediaRecorder(null); setRecordingAudio(false);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
  }, [mediaRecorder]);

  const insertEmoji = useCallback((emoji: string) => setDraft((prev) => prev + emoji), []);

  const handleForward = useCallback((targetConvId: string) => {
    if (!forwardMsg) return;
    const content = forwardMsg.content ? `↪ Transféré:\n${forwardMsg.content}` : null;
    emit("message:send", { conversationId: targetConvId, content: content ?? `↪ Transféré: [${forwardMsg.type}]`, type: "TEXT", ...(forwardMsg.mediaUrl ? { mediaUrl: forwardMsg.mediaUrl, type: forwardMsg.type, fileName: forwardMsg.fileName } : {}) }, (res: any) => {
      if (res && !res.ok) { showGuardAlert("block", res.error || "Transfert impossible."); return; }
      showGuardAlert("warn", "Message transféré."); setForwardMsg(null);
    });
  }, [forwardMsg, emit, showGuardAlert]);

  const toggleSelectMsg = useCallback((msgId: string) => {
    setSelectedMsgIds((prev) => { const n = new Set(prev); if (n.has(msgId)) n.delete(msgId); else n.add(msgId); return n; });
  }, []);

  const deleteSelectedMessages = useCallback(() => {
    if (!activeConv) return;
    selectedMsgIds.forEach((id) => emit("message:delete", { messageId: id, conversationId: activeConv.id }));
    setSelectedMsgIds(new Set()); setSelectMode(false);
  }, [selectedMsgIds, activeConv, emit]);

  const copySelectedMessages = useCallback(() => {
    const selected = messages.filter((m) => selectedMsgIds.has(m.id)).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    void navigator.clipboard.writeText(selected.map((m) => `${m.sender.profile.displayName}: ${m.content ?? `[${m.type}]`}`).join("\n"));
    setSelectedMsgIds(new Set()); setSelectMode(false);
  }, [selectedMsgIds, messages]);

  /* ── Search users ── */
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const timeout = setTimeout(() => {
      messaging.searchUsers(searchQuery).then((data) => setSearchResults(data.users)).catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const startDMConversation = useCallback(async (targetUserId: string) => {
    try {
      const { conversation } = await messaging.createDM(targetUserId);
      setConversations((prev) => prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev]);
      setActiveConv(conversation);
      setShowSearch(false); setSearchQuery("");
    } catch { /* ignore */ }
  }, []);

  /* ── Context menu close ── */
  useEffect(() => {
    const close = () => { setContextMenu(null); setConvContextMenu(null); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  /* ── Keyboard offset ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      if (!window.matchMedia("(max-width: 768px)").matches) { setKeyboardOffset(0); return; }
      const next = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
      if (Math.abs(next - lastKeyboardOffsetRef.current) < 4) return;
      lastKeyboardOffsetRef.current = next;
      setKeyboardOffset(next);
      if (next > 0) window.scrollTo(0, 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => { viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); window.removeEventListener("orientationchange", update); };
  }, []);

  /* ── Long-press touch handler for messages ── */
  const handleTouchStart = useCallback((msg: ChatMessage, e: ReactTouchEvent) => {
    if (selectMode || msg.isDeleted) return;
    longPressMsgRef.current = msg;
    const touch = e.touches[0];
    longPressTimerRef.current = setTimeout(() => {
      if (longPressMsgRef.current) {
        setContextMenu({ x: touch.clientX, y: touch.clientY, message: longPressMsgRef.current });
      }
    }, 500);
  }, [selectMode]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    longPressMsgRef.current = null;
  }, []);

  /* ── Invite candidates for call ── */
  const inviteCandidates = useMemo(() => {
    const unique = new Map<string, { userId: string; displayName: string; avatarUrl: string | null; username: string | null }>();
    conversations.forEach((conv) => {
      if (conv.isGroup) return;
      const other = getOtherParticipant(conv, myId);
      if (!other || (callState && other.userId === callState.remoteUserId)) return;
      if (!unique.has(other.userId)) unique.set(other.userId, { userId: other.userId, displayName: other.user.profile.displayName, avatarUrl: other.user.profile.avatarUrl, username: other.user.profile.username ?? null });
    });
    const q = inviteQuery.trim().toLowerCase();
    const vals = Array.from(unique.values());
    return q ? vals.filter((u) => u.displayName.toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q)) : vals;
  }, [conversations, myId, callState, inviteQuery]);

  const invitePersonToCall = useCallback(async (targetUserId: string, displayName: string) => {
    if (!callState || !user) return;
    try {
      const { conversation } = await messaging.createDM(targetUserId);
      setConversations((prev) => prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev]);
      emit("message:send", { conversationId: conversation.id, type: "TEXT", content: `📞 ${user.profile.displayName} vous invite à rejoindre un appel ${callState.type === "video" ? "vidéo" : "audio"} sur Kin-Sell. Ouvrez la messagerie pour rejoindre la conversation.` }, () => {});
      showGuardAlert("warn", t("msg.inviteSent").replace("{name}", displayName));
      setShowAddPeople(false); setInviteQuery("");
    } catch { showGuardAlert("block", t("msg.inviteFailed")); }
  }, [callState, user, emit, showGuardAlert, t]);

  /* ── Open conversation ── */
  const openConversation = useCallback((conv: ConversationSummary) => {
    setActiveConv(conv);
    // Reset conversation-specific state
    setSelectMode(false); setSelectedMsgIds(new Set());
    setReplyTo(null); setEditingMsg(null); setDraft(""); setShowEmoji(false);
  }, []);

  /* ── Back to list ── */
  const backToList = useCallback(() => {
    setActiveConv(null);
    setSelectMode(false); setSelectedMsgIds(new Set());
    setReplyTo(null); setEditingMsg(null); setDraft(""); setShowEmoji(false);
  }, []);

  /* ════════════════════════════════════════
     Guards
     ════════════════════════════════════════ */

  if (isLoading) return <div className="mg-loading">{t("common.loading")}</div>;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const typingInConv = activeConv ? typingUsers.get(activeConv.id) : undefined;
  const typingNames = typingInConv
    ? Array.from(typingInConv).filter((uid) => uid !== myId).map((uid) => {
        const p = activeConv?.participants.find((pp) => pp.userId === uid);
        return p?.user.profile.displayName ?? "Quelqu'un";
      }) : [];

  /* ════════════════════════════════════════
     RENDER
     ════════════════════════════════════════ */

  return (
    <div className="mg-shell" style={{ "--mg-kb-offset": `${keyboardOffset}px` } as CSSProperties}>

      {/* ══ Call overlay ══ */}
      {callState && (callState.status === "connected" || (callState.status === "ringing" && callState.direction === "outgoing")) && (
        <div className={`mg-call-overlay${isEarMode ? " mg-call-overlay--ear" : ""}`}>
          <div className="mg-call-screen">
            <audio ref={remoteAudioRef} autoPlay playsInline />
            <div className="mg-call-avatar">
              {(() => {
                const conv = conversations.find((c) => c.id === callState.conversationId);
                const avatar = conv ? getConversationAvatar(conv, myId) : null;
                const name = conv ? getConversationName(conv, myId, t) : "Appel";
                return avatar ? <img src={avatar} alt="" /> : <span>{initials(name)}</span>;
              })()}
            </div>
            <p className="mg-call-name">{(() => { const conv = conversations.find((c) => c.id === callState.conversationId); return conv ? getConversationName(conv, myId, t) : t("msg.user"); })()}</p>
            {callState.status === "ringing" && <p className="mg-call-status">{t("msg.callInProgress")}</p>}
            {callState.status === "connected" && (
              <>
                <p className="mg-call-timer">{Math.floor(callDuration / 60).toString().padStart(2, "0")}:{(callDuration % 60).toString().padStart(2, "0")}</p>
                <span className={`mg-call-quality mg-call-quality--${connectionQuality}`}>
                  {connectionQuality === "good" ? "Bonne" : connectionQuality === "fair" ? "Moyenne" : connectionQuality === "poor" ? "Faible" : "..."}
                </span>
                {callState.type === "video" && (
                  <button type="button" className="mg-call-quality-btn" onClick={cycleQualityMode}>
                    Mode: {qualityMode === "auto" ? "Auto" : qualityMode === "hd" ? "HD" : qualityMode === "balanced" ? "Équilibré" : "Éco"}
                  </button>
                )}
              </>
            )}
            {callState.type === "video" && (
              <div className="mg-call-videos">
                <video ref={remoteVideoRef} autoPlay playsInline className="mg-call-video-remote" />
                <video ref={localVideoRef} autoPlay playsInline muted className="mg-call-video-local" style={isCameraOff ? { display: "none" } : undefined} />
                {isCameraOff && <div className="mg-call-camera-off">{t("msg.cameraOff")}</div>}
              </div>
            )}
            <div className="mg-call-controls">
              <button className={`mg-call-ctrl${isMuted ? " mg-call-ctrl--active" : ""}`} onClick={toggleMute}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{isMuted ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.48-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></> : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></>}</svg>
                <span className="mg-call-ctrl-label">{isMuted ? "Muet" : "Micro"}</span>
              </button>
              <button className={`mg-call-ctrl${!isSpeakerOn ? " mg-call-ctrl--active" : ""}`} onClick={toggleSpeaker}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{isSpeakerOn ? <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></> : <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>}</svg>
                <span className="mg-call-ctrl-label">HP</span>
              </button>
              {callState.type === "audio" && (
                <button className={`mg-call-ctrl${isEarMode ? " mg-call-ctrl--active" : ""}`} onClick={() => setIsEarMode((p) => !p)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9a6 6 0 0 1 12 0c0 7-3 9-6 9s-6-2-6-9z"/><path d="M12 22v-4"/></svg>
                  <span className="mg-call-ctrl-label">Oreille</span>
                </button>
              )}
              {callState.type === "video" && (
                <>
                  <button className={`mg-call-ctrl${isCameraOff ? " mg-call-ctrl--active" : ""}`} onClick={toggleCamera}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{isCameraOff ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m4.5 0h8c1.1 0 2 .9 2 2v3.5M16 16l5 3V8"/></> : <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></>}</svg>
                    <span className="mg-call-ctrl-label">Caméra</span>
                  </button>
                  <button className="mg-call-ctrl" onClick={() => void switchCamera()} disabled={isSwitchingCamera}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"/><path d="M1 14l5.36 4.36A9 9 0 0 0 20.49 15"/></svg>
                    <span className="mg-call-ctrl-label">{isSwitchingCamera ? "..." : "Flip"}</span>
                  </button>
                </>
              )}
              <button className="mg-call-ctrl" onClick={() => setShowAddPeople(true)}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>
                <span className="mg-call-ctrl-label">Ajouter</span>
              </button>
              <button className="mg-call-ctrl mg-call-ctrl--hangup" onClick={endCall}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <span className="mg-call-ctrl-label">Fin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Profile modal ══ */}
      {profileUser && (
        <div className="mg-profile-overlay" onClick={() => setProfileUser(null)}>
          <div className="mg-profile-card" onClick={(e) => e.stopPropagation()}>
            <button className="mg-profile-close" onClick={() => setProfileUser(null)}>✕</button>
            <div className="mg-profile-avatar">
              {profileUser.avatarUrl ? <img src={profileUser.avatarUrl} alt="" /> : initials(profileUser.displayName)}
            </div>
            <p className="mg-profile-name">{profileUser.displayName}</p>
            {profileUser.username && <p className="mg-profile-username">@{profileUser.username}</p>}
            <p className="mg-profile-id">ID: {profileUser.userId.slice(0, 12)}</p>
            <button className="mg-profile-action" onClick={() => setProfileUser(null)}>Envoyer un message</button>
          </div>
        </div>
      )}

      {/* ══ Forward modal ══ */}
      {forwardMsg && (
        <div className="mg-modal-overlay" onClick={() => setForwardMsg(null)}>
          <div className="mg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mg-modal-header">
              <h3>{t("msg.forwardTo")}</h3>
              <button className="mg-modal-close" onClick={() => setForwardMsg(null)}>✕</button>
            </div>
            <div className="mg-modal-preview">
              <span className="mg-modal-preview-label">Message :</span>
              <span className="mg-modal-preview-text">{forwardMsg.type !== "TEXT" ? `📎 ${forwardMsg.type}` : forwardMsg.content?.slice(0, 80)}</span>
            </div>
            <div className="mg-modal-list">
              {conversations.filter((c) => c.id !== activeConv?.id).map((conv) => (
                <button key={conv.id} className="mg-modal-item" onClick={() => handleForward(conv.id)}>
                  <div className="mg-avatar mg-avatar--sm">{getConversationAvatar(conv, myId) ? <img src={getConversationAvatar(conv, myId)!} alt="" /> : initials(getConversationName(conv, myId, t))}</div>
                  <span>{getConversationName(conv, myId, t)}</span>
                </button>
              ))}
              {conversations.filter((c) => c.id !== activeConv?.id).length === 0 && <p className="mg-empty-sm">{t("msg.noOtherConversation")}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ══ Add people modal (call) ══ */}
      {showAddPeople && callState && (
        <div className="mg-modal-overlay" onClick={() => setShowAddPeople(false)}>
          <div className="mg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mg-modal-header">
              <h3>{t("msg.addPeople")}</h3>
              <button className="mg-modal-close" onClick={() => setShowAddPeople(false)}>✕</button>
            </div>
            <div className="mg-modal-search">
              <input className="mg-search-input" placeholder={t("msg.searchContact")} value={inviteQuery} onChange={(e) => setInviteQuery(e.target.value)} />
            </div>
            <div className="mg-modal-list">
              {inviteCandidates.map((c) => (
                <button key={c.userId} className="mg-modal-item" onClick={() => void invitePersonToCall(c.userId, c.displayName)}>
                  <div className="mg-avatar mg-avatar--sm">{c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : initials(c.displayName)}</div>
                  <span>{c.displayName}</span>
                </button>
              ))}
              {inviteCandidates.length === 0 && <p className="mg-empty-sm">{t("msg.noAvailableContact")}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
           VIEW: Conversation List
         ══════════════════════════════════════ */}
      <div className={`mg-list-view${activeConv ? " mg-list-view--hidden" : ""}`}>

        {/* TopBar */}
        <MgTopBar
          onMenuOpen={() => setDrawerOpen(true)}
          onSearchToggle={() => setShowSearch(!showSearch)}
        />

        {/* Drawer */}
        <MgDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        {/* List header */}
        <div className="mg-list-header">
          <h1 className="mg-list-title">{t("msg.messages")}</h1>
          <div className="mg-list-header-actions">
            <button className={`mg-icon-btn${showArchived ? " mg-icon-btn--active" : ""}`} onClick={() => setShowArchived(!showArchived)} title={t("msg.archives")}>
              {archivedConvIds.size > 0 && !showArchived && <span className="mg-badge-dot" />}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            </button>
            <button className="mg-icon-btn" onClick={() => setShowSearch(!showSearch)} title={t("msg.newConversation")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            {isConnected && <span className="mg-status-dot" title={t("msg.connected")} />}
          </div>
        </div>

        {/* Search panel */}
        {showSearch && (
          <div className="mg-search-panel">
            <input
              className="mg-search-input"
              placeholder={t("msg.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <div className="mg-search-results">
              {searchResults.map((u) => (
                <button key={u.id} className="mg-search-result" onClick={() => void startDMConversation(u.id)}>
                  <div className="mg-avatar mg-avatar--sm">{u.profile.avatarUrl ? <img src={u.profile.avatarUrl} alt="" /> : initials(u.profile.displayName)}</div>
                  <div className="mg-search-info">
                    <strong>{u.profile.displayName}</strong>
                    <span>{u.profile.username ? `@${u.profile.username}` : ""}{u.profile.city ? ` · ${u.profile.city}` : ""}</span>
                  </div>
                </button>
              ))}
              {searchQuery.length >= 2 && searchResults.length === 0 && <p className="mg-empty-sm">{t("msg.noResults")}</p>}
            </div>
          </div>
        )}

        {/* Conversation list */}
        <div className="mg-conv-list">
          {loadingConvs ? (
            <div className="mg-loading-sm">{t("common.loading")}</div>
          ) : conversations.filter((c) => (showArchived ? archivedConvIds.has(c.id) : !archivedConvIds.has(c.id))).length === 0 ? (
            <div className="mg-empty">
              <p>{showArchived ? t("msg.noArchivedConversations") : t("msg.noConversation")}</p>
              <p>{showArchived ? t("msg.archivedHint") : t("msg.startConversationHint")}</p>
            </div>
          ) : (
            conversations
              .filter((c) => (showArchived ? archivedConvIds.has(c.id) : !archivedConvIds.has(c.id)))
              .sort((a, b) => {
                const aP = pinnedConvIds.has(a.id) ? 0 : 1;
                const bP = pinnedConvIds.has(b.id) ? 0 : 1;
                if (aP !== bP) return aP - bP;
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
              })
              .map((conv) => {
                const name = getConversationName(conv, myId, t);
                const avatar = getConversationAvatar(conv, myId);
                const lastMsg = conv.messages?.[0];
                const otherUserId = getOtherUserId(conv, myId);
                const isOnline = otherUserId ? onlineUserIds.has(otherUserId) : false;
                const isPinned = pinnedConvIds.has(conv.id);
                const isMutedConv = mutedConvIds.has(conv.id);

                return (
                  <button
                    key={conv.id}
                    className={`mg-conv-item${isPinned ? " mg-conv-item--pinned" : ""}`}
                    onClick={() => openConversation(conv)}
                    onContextMenu={(e) => { e.preventDefault(); setConvContextMenu({ x: e.clientX, y: e.clientY, convId: conv.id }); }}
                  >
                    <div className="mg-avatar">
                      {avatar ? <img src={avatar} alt="" /> : initials(name)}
                      {isOnline && <span className="mg-online-badge" />}
                    </div>
                    <div className="mg-conv-info">
                      <div className="mg-conv-top">
                        <span className="mg-conv-name">
                          {isPinned && <span className="mg-pin-icon">📌</span>}
                          {name}
                        </span>
                        {lastMsg && <span className="mg-conv-time">{timeLabel(lastMsg.createdAt, t, locale)}</span>}
                      </div>
                      <div className="mg-conv-bottom">
                        <span className="mg-conv-preview">
                          {isMutedConv && "🔇 "}
                          {lastMsg
                            ? lastMsg.isDeleted ? t("msg.deletedMessage")
                            : lastMsg.type === "IMAGE" ? `📷 ${t("msg.photo")}`
                            : lastMsg.type === "AUDIO" ? `🎵 ${t("msg.audio")}`
                            : lastMsg.type === "VIDEO" ? `🎬 ${t("msg.video")}`
                            : lastMsg.type === "FILE" ? `📎 ${t("msg.file")}`
                            : (lastMsg.senderId === myId ? `${t("msg.you")}: ` : "") + (lastMsg.content?.slice(0, 45) ?? "")
                            : t("msg.newConversationLabel")}
                        </span>
                        {conv.unreadCount > 0 && !isMutedConv && <span className="mg-unread">{conv.unreadCount}</span>}
                      </div>
                    </div>
                  </button>
                );
              })
          )}
        </div>

        {/* Conversation context menu */}
        {convContextMenu && (
          <div className="mg-context-menu" style={{ top: convContextMenu.y, left: convContextMenu.x }}>
            <button onClick={() => {
              const id = convContextMenu.convId;
              if (pinnedConvIds.size >= 5 && !pinnedConvIds.has(id)) { alert(t("msg.pinMax")); }
              else { setPinnedConvIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
              setConvContextMenu(null);
            }}>{pinnedConvIds.has(convContextMenu.convId) ? t("msg.unpin") : t("msg.pin")}</button>
            <button onClick={() => {
              setArchivedConvIds((prev) => { const n = new Set(prev); const id = convContextMenu.convId; if (n.has(id)) n.delete(id); else n.add(id); return n; });
              if (activeConv?.id === convContextMenu.convId) setActiveConv(null);
              setConvContextMenu(null);
            }}>{archivedConvIds.has(convContextMenu.convId) ? "📦 Désarchiver" : "📦 Archiver"}</button>
            <button onClick={() => { setMutedConvIds((prev) => { const n = new Set(prev); const id = convContextMenu.convId; if (n.has(id)) n.delete(id); else n.add(id); return n; }); setConvContextMenu(null); }}>
              {mutedConvIds.has(convContextMenu.convId) ? "🔔 Réactiver" : "🔇 Sourdine"}
            </button>
            <div className="mg-context-divider" />
            <button onClick={() => { setBlockedConvIds((prev) => { const n = new Set(prev); const id = convContextMenu.convId; if (n.has(id)) n.delete(id); else n.add(id); return n; }); setConvContextMenu(null); }}>
              {blockedConvIds.has(convContextMenu.convId) ? "🟢 Débloquer" : "🚫 Bloquer"}
            </button>
            <button className="mg-ctx-danger" onClick={() => {
              if (confirm("Supprimer cette conversation ?")) {
                setConversations((prev) => prev.filter((c) => c.id !== convContextMenu.convId));
                if (activeConv?.id === convContextMenu.convId) setActiveConv(null);
              }
              setConvContextMenu(null);
            }}>🗑 {t("common.delete")}</button>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════
           VIEW: Conversation (fullscreen)
         ══════════════════════════════════════ */}
      {activeConv && (
        <div className="mg-conv-view">

          {/* ── Conversation Header ── */}
          <header className="mg-conv-header">
            <button className="mg-conv-back" onClick={backToList}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="mg-avatar mg-avatar--sm" onClick={() => {
              if (!activeConv.isGroup) {
                const other = getOtherParticipant(activeConv, myId);
                if (other) setProfileUser({ displayName: other.user.profile.displayName, avatarUrl: other.user.profile.avatarUrl, username: other.user.profile.username ?? null, userId: other.userId });
              }
            }}>
              {getConversationAvatar(activeConv, myId)
                ? <img src={getConversationAvatar(activeConv, myId)!} alt="" />
                : initials(getConversationName(activeConv, myId, t))}
              {!activeConv.isGroup && getOtherUserId(activeConv, myId) && onlineUserIds.has(getOtherUserId(activeConv, myId)!) && <span className="mg-online-badge" />}
            </div>
            <div className="mg-conv-header-info">
              <strong>{getConversationName(activeConv, myId, t)}</strong>
              <span className="mg-conv-header-status">
                {typingNames.length > 0
                  ? `${typingNames.join(", ")} ${t("msg.typing")}`
                  : !activeConv.isGroup && getOtherUserId(activeConv, myId) && onlineUserIds.has(getOtherUserId(activeConv, myId)!)
                  ? t("msg.online")
                  : !activeConv.isGroup && (() => {
                      const otherId = getOtherUserId(activeConv, myId);
                      return otherId && lastSeenMap.has(otherId) ? formatLastSeen(lastSeenMap.get(otherId)!, t) : "";
                    })()}
              </span>
            </div>
            <div className="mg-conv-header-actions">
              {!activeConv.isGroup && (
                <>
                  <button className="mg-icon-btn" onClick={() => void startCall("audio")} title={t("msg.audioCall")}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </button>
                  <button className="mg-icon-btn" onClick={() => void startCall("video")} title={t("msg.videoCall")}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  </button>
                </>
              )}
              <button className={`mg-icon-btn${selectMode ? " mg-icon-btn--active" : ""}`} onClick={() => { setSelectMode((p) => !p); if (selectMode) setSelectedMsgIds(new Set()); }} title={selectMode ? t("msg.exitSelection") : t("msg.selectMessages")}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </button>
            </div>
          </header>

          {/* ── Message Body ── */}
          <div className="mg-messages">
            {loadingMsgs ? (
              <div className="mg-loading-sm">{t("msg.loadingMessages")}</div>
            ) : messages.length === 0 ? (
              <div className="mg-empty">
                <p>{t("msg.noMessages")}</p>
                <p>{t("msg.sendFirstMessage")}</p>
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
                    className={`mg-bubble-wrap${isMine ? " mg-bubble-wrap--mine" : ""}${isSelected ? " mg-bubble-wrap--selected" : ""}`}
                    onContextMenu={(e) => { e.preventDefault(); if (!selectMode) setContextMenu({ x: e.clientX, y: e.clientY, message: msg }); }}
                    onTouchStart={(e) => handleTouchStart(msg, e)}
                    onTouchEnd={handleTouchEnd}
                    onTouchMove={handleTouchEnd}
                    onClick={selectMode && !msg.isDeleted ? () => toggleSelectMsg(msg.id) : undefined}
                  >
                    {selectMode && !msg.isDeleted && (
                      <span className={`mg-select-check${isSelected ? " mg-select-check--on" : ""}`}>{isSelected ? "✓" : ""}</span>
                    )}
                    {showSender && <span className="mg-bubble-sender">{msg.sender.profile.displayName}</span>}
                    <div className={`mg-bubble${isMine ? " mg-bubble--mine" : ""}${msg.isDeleted ? " mg-bubble--deleted" : ""}`}>
                      {msg.replyTo && !msg.isDeleted && (
                        <div className="mg-reply-preview">
                          <strong>{msg.replyTo.sender.profile.displayName}</strong>
                          <span>{msg.replyTo.type !== "TEXT" ? `📎 ${msg.replyTo.type}` : msg.replyTo.content?.slice(0, 60)}</span>
                        </div>
                      )}
                      {msg.isDeleted ? (
                        <p className="mg-deleted-text">🚫 {t("msg.deletedMessage")}</p>
                      ) : msg.type === "IMAGE" && msg.mediaUrl ? (
                        <img src={msg.mediaUrl} alt="Image" className="mg-media-img" onClick={() => window.open(msg.mediaUrl!, "_blank")} />
                      ) : msg.type === "AUDIO" && msg.mediaUrl ? (
                        <AudioPlayer src={msg.mediaUrl} />
                      ) : msg.type === "VIDEO" && msg.mediaUrl ? (
                        <video controls src={msg.mediaUrl} className="mg-media-video" />
                      ) : msg.type === "FILE" && msg.mediaUrl ? (
                        <a href={msg.mediaUrl} download={msg.fileName ?? "file"} className="mg-file-link">📎 {msg.fileName ?? t("msg.file")}</a>
                      ) : (
                        <p className="mg-text">{msg.content}</p>
                      )}
                      <div className="mg-meta">
                        <span className="mg-time">{new Date(msg.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</span>
                        {msg.isEdited && <span className="mg-edited">{t("msg.edited")}</span>}
                        {isMine && (
                          <span className={`mg-read${readByOthers.length > 0 ? " mg-read--done" : ""}`}>
                            {readByOthers.length > 0 ? "✓✓" : "✓"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hover actions (desktop) */}
                    {!msg.isDeleted && !selectMode && (
                      <div className="mg-bubble-actions">
                        {!isAdminDM && <button className="mg-bubble-act" title={t("msg.reply")} onClick={() => setReplyTo(msg)}>↩</button>}
                        <button className="mg-bubble-act" title={t("msg.forward")} onClick={() => setForwardMsg(msg)}>↗</button>
                        {isMine && msg.type === "TEXT" && canEditMessage(msg) && (
                          <button className="mg-bubble-act" title="Modifier" onClick={() => { setEditingMsg(msg); setDraft(msg.content ?? ""); }}>✏️</button>
                        )}
                        {isMine && (
                          <button className="mg-bubble-act" title="Supprimer" onClick={() => emit("message:delete", { messageId: msg.id, conversationId: activeConv.id })}>🗑</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Context menu (long-press / right-click) ── */}
          {contextMenu && (
            <div className="mg-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
              {!isAdminDM && <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null); }}>↩️ {t("msg.reply")}</button>}
              <button onClick={() => { setForwardMsg(contextMenu.message); setContextMenu(null); }}>↗️ {t("msg.forward")}</button>
              {contextMenu.message.content && (
                <button onClick={() => { void navigator.clipboard.writeText(contextMenu.message.content ?? ""); setContextMenu(null); }}>📋 Copier</button>
              )}
              {contextMenu.message.senderId === myId && contextMenu.message.type === "TEXT" && canEditMessage(contextMenu.message) && (
                <button onClick={() => { setEditingMsg(contextMenu.message); setDraft(contextMenu.message.content ?? ""); setContextMenu(null); }}>✏️ Modifier</button>
              )}
              <button onClick={() => { setSelectMode(true); setSelectedMsgIds(new Set([contextMenu.message.id])); setContextMenu(null); }}>☑️ {t("msg.select")}</button>
              <button onClick={() => {
                const info = `${t("msg.from")}: ${contextMenu.message.sender.profile.displayName}\n${t("msg.date")}: ${fullTime(contextMenu.message.createdAt, locale)}\n${t("msg.type")}: ${contextMenu.message.type}${contextMenu.message.isEdited ? `\n(${t("msg.edited")})` : ""}`;
                alert(info); setContextMenu(null);
              }}>ℹ️ {t("msg.messageInfo")}</button>
              <div className="mg-context-divider" />
              {contextMenu.message.senderId === myId && (
                <button className="mg-ctx-danger" onClick={() => { emit("message:delete", { messageId: contextMenu.message.id, conversationId: activeConv.id }); setContextMenu(null); }}>🗑 Supprimer</button>
              )}
            </div>
          )}

          {/* ── Reply / Edit bar ── */}
          {!isAdminDM && (replyTo || editingMsg) && (
            <div className="mg-reply-bar">
              <div className="mg-reply-bar-content">
                <strong>{editingMsg ? "Modification" : `↩ ${replyTo!.sender.profile.displayName}`}</strong>
                <span>{editingMsg ? editingMsg.content?.slice(0, 60) : replyTo!.type !== "TEXT" ? `📎 ${replyTo!.type}` : replyTo!.content?.slice(0, 60)}</span>
              </div>
              <button className="mg-reply-bar-close" onClick={() => { setReplyTo(null); setEditingMsg(null); setDraft(""); }}>✕</button>
            </div>
          )}

          {/* ── Waveform recording bar ── */}
          {!isAdminDM && recordingAudio && (
            <div className="mg-waveform-bar">
              <span className="mg-waveform-timer">{formatAudioTime(recordingTime)}</span>
              <canvas ref={waveformCanvasRef} className="mg-waveform-canvas" height={36} />
              <button className="mg-waveform-cancel" type="button" onClick={cancelRecordingAudio}>✕</button>
              <button className="mg-waveform-send" type="button" onClick={stopRecordingAudio}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            </div>
          )}

          {/* ── Admin DM notice ── */}
          {isAdminDM && (
            <div className="mg-admin-notice">
              <span>🔒</span> Ce message provient d'un administrateur. Vous ne pouvez pas répondre.
            </div>
          )}

          {/* ── Guard alert ── */}
          {guardAlert && (
            <div className={`mg-guard-alert mg-guard-alert--${guardAlert.type}`} onClick={() => setGuardAlert(null)}>
              <span>{guardAlert.type === "block" ? "🚫" : "⚠️"}</span>
              <span className="mg-guard-text">{guardAlert.message}</span>
              <button type="button" className="mg-guard-close" onClick={() => setGuardAlert(null)}>✕</button>
            </div>
          )}

          {/* ── Multi-select bar ── */}
          {selectMode && (
            <div className="mg-select-bar">
              <span className="mg-select-count">{selectedMsgIds.size} sélectionné{selectedMsgIds.size > 1 ? "s" : ""}</span>
              <div className="mg-select-actions">
                <button className="mg-select-btn" onClick={copySelectedMessages} disabled={selectedMsgIds.size === 0}>📋</button>
                <button className="mg-select-btn" onClick={() => { if (selectedMsgIds.size === 1) { const m = messages.find((m) => selectedMsgIds.has(m.id)); if (m) setForwardMsg(m); } setSelectMode(false); setSelectedMsgIds(new Set()); }} disabled={selectedMsgIds.size !== 1}>↗</button>
                <button className="mg-select-btn mg-select-btn--danger" onClick={deleteSelectedMessages} disabled={selectedMsgIds.size === 0}>🗑</button>
                <button className="mg-select-btn" onClick={() => { setSelectMode(false); setSelectedMsgIds(new Set()); }}>✕</button>
              </div>
            </div>
          )}

          {/* ── Composer ── */}
          {!isAdminDM && !recordingAudio && (
            <form className="mg-composer" onSubmit={handleSend}>
              <button type="button" className="mg-icon-btn" onClick={() => fileInputRef.current?.click()} title="Fichier">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
              <input ref={fileInputRef} type="file" hidden accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.zip" multiple onChange={(e) => void handleFileSelect(e.target.files)} />

              <button type="button" className="mg-icon-btn" onClick={() => setShowEmoji(!showEmoji)} title="Emoji">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </button>

              {showEmoji && (
                <div className="mg-emoji-picker">
                  <div className="mg-emoji-header">
                    {EMOJI_CATEGORIES.map((cat, i) => (
                      <button key={i} type="button" className={`mg-emoji-tab${emojiCat === i ? " active" : ""}`} onClick={() => setEmojiCat(i)}>{cat.icon}</button>
                    ))}
                  </div>
                  <div className="mg-emoji-grid">
                    {EMOJI_CATEGORIES[emojiCat].emojis.map((em, i) => (
                      <button key={i} type="button" className="mg-emoji-btn" onClick={() => { insertEmoji(em); setShowEmoji(false); }}>{em}</button>
                    ))}
                  </div>
                </div>
              )}

              <input
                className="mg-text-input"
                placeholder={editingMsg ? "Modifier le message..." : "Écrire un message..."}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); handleTyping(); }}
                autoFocus
              />

              {draft.trim() ? (
                <button type="submit" className="mg-send-btn" title="Envoyer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                </button>
              ) : (
                <button type="button" className="mg-icon-btn mg-mic-btn" onClick={() => void startRecordingAudio()} title="Message vocal">
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
        </div>
      )}
    </div>
  );
}
