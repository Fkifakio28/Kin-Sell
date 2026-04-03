import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import { useSocket } from '../../hooks/useSocket';
import {
  sokinLive,
  listings as listingsApi,
  type SoKinLiveData,
  type SoKinLiveChatMsg,
  type MyListing,
} from '../../lib/api-client';
import { getDashboardPath } from '../../utils/role-routing';
import Hls from 'hls.js';
import './sokin-live.css';

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */

function isHls(url: string) {
  return /\.m3u8(?:$|[?#])/i.test(url);
}

const TAG_OPTIONS = [
  { key: 'article', label: '📰 Article', value: 'article' },
  { key: 'produit', label: '🛍️ Produit', value: 'produit' },
  { key: 'boutique', label: '🏪 Boutique', value: 'boutique' },
  { key: 'profil', label: '👤 Profil public', value: 'profil-public' },
] as const;

/* ═══════════════════════════════════════════════════
   LIVE CREATOR — plein écran, caméra frontale
   ═══════════════════════════════════════════════════ */

function LiveCreator({
  onCancel,
  onStart,
}: {
  onCancel: () => void;
  onStart: (data: { title: string; description: string; tags: string[]; city: string }) => void;
}) {
  const { t } = useLocaleCurrency();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: camera preview, Step 2: details
  const [step, setStep] = useState<1 | 2>(1);
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setReady(true);
      } catch {
        if (!cancelled) setError(t('live.mediaAccessError'));
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [t]);

  const toggleTag = (val: string) => {
    setSelectedTags((prev) => prev.includes(val) ? prev.filter((t) => t !== val) : [...prev, val]);
  };

  const handleStart = () => {
    onStart({
      title: description.trim().slice(0, 60) || 'Live Kin-Sell',
      description: description.trim(),
      tags: selectedTags,
      city: '',
    });
  };

  return (
    <div className="lv-creator">
      {/* Camera preview */}
      <video
        ref={videoRef}
        className="lv-creator-camera"
        autoPlay
        muted
        playsInline
      />

      {!ready && !error && (
        <div className="lv-creator-loading">
          <div className="lv-creator-spinner" />
          <p>Activation caméra…</p>
        </div>
      )}
      {error && (
        <div className="lv-creator-loading">
          <p>📷 {error}</p>
          <button type="button" className="lv-creator-cancel-btn" onClick={onCancel}>Retour</button>
        </div>
      )}

      {ready && step === 1 && (
        <div className="lv-creator-overlay">
          <div className="lv-creator-top-right">
            <button type="button" className="lv-creator-start-btn" onClick={() => setStep(2)}>
              Suivant →
            </button>
            <button type="button" className="lv-creator-cancel-link" onClick={onCancel}>
              Annuler
            </button>
          </div>
          <div className="lv-creator-hint">
            <p>Préparez votre cadrage</p>
          </div>
        </div>
      )}

      {ready && step === 2 && (
        <div className="lv-creator-overlay lv-creator-overlay--details">
          <div className="lv-creator-top-right">
            <button
              type="button"
              className="lv-creator-start-btn"
              onClick={handleStart}
              disabled={!description.trim()}
            >
              🔴 Démarrer
            </button>
            <button type="button" className="lv-creator-cancel-link" onClick={() => setStep(1)}>
              Annuler
            </button>
          </div>

          <div className="lv-creator-details">
            <textarea
              className="lv-creator-desc"
              placeholder="Description de votre live…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={3}
            />

            <div className="lv-creator-tags">
              <p className="lv-creator-tags-label">Tags :</p>
              <div className="lv-creator-tags-list">
                {TAG_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className={`lv-creator-tag${selectedTags.includes(opt.value) ? ' lv-creator-tag--active' : ''}`}
                    onClick={() => toggleTag(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LIVE VIEWER — spectateur plein écran
   ═══════════════════════════════════════════════════ */

function LiveViewer({
  live,
  onBack,
  isHost,
}: {
  live: SoKinLiveData;
  onBack: () => void;
  isHost: boolean;
}) {
  const { isLoggedIn, user } = useAuth();
  const { t, formatMoneyFromUsdCents } = useLocaleCurrency();
  const { on, off } = useSocket();

  const [liveData, setLiveData] = useState(live);
  const [status, setStatus] = useState(live.status);
  const [viewers, setViewers] = useState(live.viewerCount);
  const [likes, setLikes] = useState(live.likesCount);
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const heartId = useRef(0);
  const [sound, setSound] = useState(false);
  const [showSupport, setShowSupport] = useState(false);

  // Chat
  const [messages, setMessages] = useState<SoKinLiveChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Video refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const hostStreamRef = useRef<MediaStream | null>(null);

  const playbackUrl = liveData.replayUrl?.trim() || null;
  const canPlay = Boolean(playbackUrl) && status !== 'WAITING' && status !== 'CANCELED';
  const hostProfile = liveData.host?.profile;
  const hostOwns = liveData.hostId === user?.id;

  // Join/leave
  useEffect(() => {
    if (isLoggedIn && !isHost) sokinLive.join(live.id).catch(() => {});
    return () => { if (isLoggedIn && !isHost) sokinLive.leave(live.id).catch(() => {}); };
  }, [isLoggedIn, isHost, live.id]);

  // Polling status
  useEffect(() => {
    let c = false;
    const poll = setInterval(async () => {
      try {
        const u = await sokinLive.get(live.id);
        if (c) return;
        setLiveData(u);
        setViewers(u.viewerCount);
        setLikes(u.likesCount);
        setStatus((prev) => prev === 'LIVE' && u.status === 'WAITING' ? prev : u.status);
      } catch { /* */ }
    }, 5000);
    return () => { c = true; clearInterval(poll); };
  }, [live.id]);

  // Polling chat
  useEffect(() => {
    const fetch = async () => {
      try {
        const d = await sokinLive.chat(live.id, 80);
        setMessages(d.messages.reverse());
      } catch { /* */ }
    };
    void fetch();
    const int = setInterval(fetch, 3000);
    return () => clearInterval(int);
  }, [live.id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Host camera preview (when no stream URL)
  useEffect(() => {
    if (!isHost || canPlay || status === 'ENDED') return;
    let c = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
        if (c) { stream.getTracks().forEach((t) => t.stop()); return; }
        hostStreamRef.current = stream;
        if (hostVideoRef.current) hostVideoRef.current.srcObject = stream;
      } catch { /* */ }
    })();
    return () => { c = true; hostStreamRef.current?.getTracks().forEach((t) => t.stop()); hostStreamRef.current = null; };
  }, [canPlay, isHost, status]);

  // Video playback (HLS or direct)
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !playbackUrl || !canPlay) { hlsRef.current?.destroy(); hlsRef.current = null; return; }

    vid.muted = !sound;
    vid.volume = sound ? 1 : 0;
    const tryPlay = async () => { try { await vid.play(); } catch { /* */ } };

    if (isHls(playbackUrl)) {
      if (vid.canPlayType('application/vnd.apple.mpegurl')) {
        vid.src = playbackUrl; vid.load(); void tryPlay();
      } else if (Hls.isSupported()) {
        hlsRef.current?.destroy();
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.loadSource(playbackUrl); hls.attachMedia(vid);
        hls.on(Hls.Events.MANIFEST_PARSED, () => void tryPlay());
      }
    } else {
      hlsRef.current?.destroy(); hlsRef.current = null;
      vid.src = playbackUrl; vid.load(); void tryPlay();
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [canPlay, playbackUrl, sound]);

  // Hearts
  const spawnHeart = useCallback(() => {
    const id = ++heartId.current;
    const x = Math.random() * 60 + 20;
    setHearts((p) => [...p, { id, x }]);
    setTimeout(() => setHearts((p) => p.filter((h) => h.id !== id)), 1500);
  }, []);

  const handleLike = useCallback(async () => {
    if (!isLoggedIn) return;
    setLikes((n) => n + 1);
    spawnHeart();
    try {
      const r = await sokinLive.like(live.id);
      setLikes((c) => Math.max(c, r.likesCount));
    } catch { setLikes((c) => Math.max(0, c - 1)); }
  }, [isLoggedIn, live.id, spawnHeart]);

  const handleSendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !isLoggedIn) return;
    const fullText = replyTo ? `@${replyTo} ${text}` : text;
    setChatInput('');
    setReplyTo(null);
    try {
      const msg = await sokinLive.sendChat(live.id, { text: fullText });
      setMessages((p) => [...p, msg]);
    } catch { /* */ }
  }, [chatInput, isLoggedIn, live.id, replyTo]);

  const handleEnd = useCallback(async () => {
    try { await sokinLive.end(live.id); setStatus('ENDED'); } catch { /* */ }
  }, [live.id]);

  const handleStart = useCallback(async () => {
    try { await sokinLive.start(live.id); setStatus('LIVE'); } catch { /* */ }
  }, [live.id]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/sokin/live?watch=${encodeURIComponent(live.id)}`;
    try {
      if (navigator.share) { await navigator.share({ title: liveData.title, url }); return; }
      await navigator.clipboard.writeText(url);
    } catch { /* */ }
  }, [live.id, liveData.title]);

  // Double-tap to like
  const lastTap = useRef(0);
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 260) void handleLike();
    lastTap.current = now;
  }, [handleLike]);

  return (
    <div className="lv-viewer">
      {/* Video surface */}
      <div className="lv-viewer-surface" onClick={handleTap}>
        {canPlay && (
          <video ref={videoRef} className="lv-viewer-video" playsInline autoPlay muted={!sound} poster={liveData.thumbnailUrl ?? undefined} />
        )}
        {!canPlay && isHost && status !== 'ENDED' && (
          <video ref={hostVideoRef} className="lv-viewer-video" autoPlay muted playsInline />
        )}
        {!canPlay && !isHost && liveData.thumbnailUrl && (
          <img src={liveData.thumbnailUrl} alt={liveData.title} className="lv-viewer-poster" />
        )}
        <div className="lv-viewer-shade" />
      </div>

      {/* Top-left: host info */}
      <div className="lv-viewer-top-left">
        <div className="lv-viewer-host">
          {hostProfile?.avatarUrl
            ? <img src={hostProfile.avatarUrl} alt="" className="lv-viewer-host-avatar" />
            : <div className="lv-viewer-host-avatar lv-viewer-host-avatar--ph">👤</div>}
          <div>
            <p className="lv-viewer-host-name">{hostProfile?.displayName ?? 'Live'}</p>
            <p className="lv-viewer-host-meta">
              {status === 'LIVE' && <span className="lv-live-badge">🔴 LIVE</span>}
              {status === 'WAITING' && <span className="lv-waiting-badge">⏳ En attente</span>}
              <span>👁️ {viewers}</span>
              <span>❤️ {likes}</span>
            </p>
          </div>
        </div>

        {/* Host controls */}
        {isHost && status === 'LIVE' && (
          <div className="lv-viewer-host-controls">
            <button type="button" className="lv-ctrl-btn" onClick={handleEnd}>⏹ Arrêter</button>
          </div>
        )}
        {isHost && status === 'WAITING' && (
          <div className="lv-viewer-host-controls">
            <button type="button" className="lv-ctrl-btn lv-ctrl-btn--start" onClick={handleStart}>🔴 Démarrer</button>
          </div>
        )}
      </div>

      {/* Top-right: share (+ host edit tags) */}
      <div className="lv-viewer-top-right">
        <button type="button" className="lv-icon-btn" onClick={handleShare} aria-label="Partager">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
        </button>
      </div>

      {/* Floating hearts */}
      <div className="lv-hearts">
        {hearts.map((h) => (
          <span key={h.id} className="lv-heart" style={{ left: `${h.x}%` }}>❤️</span>
        ))}
      </div>

      {/* Bottom-left: description + messages */}
      <div className="lv-viewer-bottom-left">
        <div className="lv-chat-messages">
          {/* Description as first message */}
          {liveData.description && (
            <div className="lv-chat-msg lv-chat-msg--desc">
              <span className="lv-chat-author">{hostProfile?.displayName ?? 'Live'}</span>
              <span className="lv-chat-text">{liveData.description}</span>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`lv-chat-msg${msg.isGift ? ' lv-chat-msg--gift' : ''}`}
              onClick={() => {
                const author = msg.user?.profile?.displayName;
                if (author) setReplyTo(author);
              }}
            >
              <span className="lv-chat-author">{msg.user?.profile?.displayName ?? 'Anonyme'}</span>
              {msg.isGift && <span className="lv-chat-gift">🎁</span>}
              <span className="lv-chat-text">{msg.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Chat input */}
        {isLoggedIn && status === 'LIVE' && (
          <div className="lv-chat-input-wrap">
            {replyTo && (
              <div className="lv-chat-reply">
                <span>↩ @{replyTo}</span>
                <button type="button" onClick={() => setReplyTo(null)}>✕</button>
              </div>
            )}
            <div className="lv-chat-input-row">
              <input
                type="text"
                className="lv-chat-input"
                placeholder="Écrire un message…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSendChat(); }}
                maxLength={300}
              />
              <button type="button" className="lv-chat-send" onClick={() => void handleSendChat()}>➤</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom-right: support button (spectator only) */}
      {!isHost && isLoggedIn && status === 'LIVE' && (
        <div className="lv-viewer-bottom-right">
          <button type="button" className="lv-support-btn" onClick={() => setShowSupport(true)}>
            💰 Soutenir
          </button>
        </div>
      )}

      {/* Ended overlay */}
      {status === 'ENDED' && (
        <div className="lv-ended-overlay">
          <p className="lv-ended-icon">📺</p>
          <p className="lv-ended-text">Ce live est terminé</p>
          <p className="lv-ended-stats">👁️ {liveData.peakViewers} spectateurs au pic · ❤️ {likes} likes</p>
          <button type="button" className="lv-ended-back" onClick={onBack}>Retour aux lives</button>
        </div>
      )}

      {/* Support sheet */}
      {showSupport && (
        <>
          <div className="lv-sheet-backdrop" onClick={() => setShowSupport(false)} />
          <div className="lv-support-sheet">
            <div className="lv-sheet-handle" />
            <p className="lv-sheet-title">💰 Soutenir {hostProfile?.displayName ?? 'le créateur'}</p>
            <div className="lv-support-options">
              <button type="button" className="lv-support-opt">
                <span className="lv-support-opt-icon">🅿</span>
                <span>PayPal</span>
              </button>
              <button type="button" className="lv-support-opt">
                <span className="lv-support-opt-icon">📱</span>
                <span>M-Pesa</span>
              </button>
              <button type="button" className="lv-support-opt">
                <span className="lv-support-opt-icon">🟠</span>
                <span>Orange Money</span>
              </button>
            </div>
            <button type="button" className="lv-support-close" onClick={() => setShowSupport(false)}>Fermer</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LIVE SCREEN — un live fullscreen dans le feed
   ═══════════════════════════════════════════════════ */

function LiveScreen({ live, onOpen }: { live: SoKinLiveData; onOpen: () => void }) {
  const p = live.host?.profile;
  return (
    <div className="lv-screen" onClick={onOpen}>
      <div className="lv-screen-bg">
        {live.thumbnailUrl
          ? <img src={live.thumbnailUrl} alt={live.title} className="lv-screen-bg-img" />
          : <div className="lv-screen-bg-placeholder">📹</div>}
        <div className="lv-screen-shade" />
      </div>

      <div className="lv-screen-content">
        <div className="lv-screen-top">
          <span className="lv-live-badge">🔴 LIVE</span>
          <span className="lv-screen-viewers">👁️ {live.viewerCount}</span>
        </div>

        <div className="lv-screen-bottom">
          <div className="lv-screen-host">
            {p?.avatarUrl
              ? <img src={p.avatarUrl} alt={p.displayName} className="lv-screen-avatar" />
              : <div className="lv-screen-avatar lv-screen-avatar--ph">{(p?.displayName ?? 'L').charAt(0)}</div>}
            <div>
              <p className="lv-screen-host-name">{p?.displayName ?? 'Live'}</p>
              {live.city && <p className="lv-screen-city">📍 {live.city}</p>}
            </div>
          </div>
          <p className="lv-screen-title">{live.title}</p>
          {live.description && <p className="lv-screen-desc">{live.description}</p>}
          {live.featuredListing && (
            <div className="lv-screen-product">
              🛍️ {live.featuredListing.title}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LIVE FEED — swipe vertical TikTok-like
   ═══════════════════════════════════════════════════ */

function LiveFeed({
  lives,
  onOpen,
}: {
  lives: SoKinLiveData[];
  onOpen: (live: SoKinLiveData) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (lives.length === 0) {
    return (
      <div className="lv-feed-empty">
        <span>📹</span>
        <p>Aucun live en cours</p>
        <p className="lv-feed-empty-sub">Soyez le premier à lancer un live !</p>
      </div>
    );
  }

  return (
    <div className="lv-feed" ref={containerRef}>
      {lives.map((live) => (
        <LiveScreen key={live.id} live={live} onOpen={() => onOpen(live)} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   FAB — floating action button (même pattern Home/Explorer)
   ═══════════════════════════════════════════════════ */

function LiveFAB({ visible }: { visible: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();

  const go = (path: string) => {
    setMenuOpen(false);
    void navigate(isLoggedIn ? path : '/login');
  };

  return (
    <>
      <button
        type="button"
        className={`lv-fab${visible ? '' : ' lv-fab--hidden'}${menuOpen ? ' lv-fab--open' : ''}`}
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Créer"
        aria-expanded={menuOpen}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      {menuOpen && (
        <>
          <div className="lv-fab-overlay" onClick={() => setMenuOpen(false)} />
          <div className="lv-fab-menu">
            <div className="lv-fab-menu-handle" />
            <p className="lv-fab-menu-title">Publier ou ajouter</p>
            <button className="lv-fab-menu-item" onClick={() => go('/sokin')}>📢 Publier sur SoKin</button>
            <button className="lv-fab-menu-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=sell&create=produit`)}>🛍️ Ajouter un produit</button>
            <button className="lv-fab-menu-item" onClick={() => go(`${getDashboardPath(user?.role)}?section=sell&create=service`)}>🔧 Ajouter un service</button>
          </div>
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN: SoKinLivePage
   ═══════════════════════════════════════════════════ */

export function SoKinLivePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoggedIn, user } = useAuth();
  const { t } = useLocaleCurrency();
  const scrollDir = useScrollDirection();
  const barsVisible = scrollDir === 'up';

  type View = 'browse' | 'watch' | 'create';
  const [view, setView] = useState<View>('browse');
  const [lives, setLives] = useState<SoKinLiveData[]>([]);
  const [selectedLive, setSelectedLive] = useState<SoKinLiveData | null>(null);
  const [isCreatingLive, setIsCreatingLive] = useState(false);

  // Auto-open from URL ?watch=xxx or ?create=1
  useEffect(() => {
    const watchId = searchParams.get('watch');
    if (watchId) {
      sokinLive.get(watchId).then((l) => { setSelectedLive(l); setView('watch'); }).catch(() => {});
    }
    if (searchParams.get('create') === '1' && isLoggedIn) {
      setView('create');
    }
  }, [searchParams, isLoggedIn]);

  // Load active lives
  useEffect(() => {
    let c = false;
    const load = async () => {
      try {
        const d = await sokinLive.list(50);
        if (!c) setLives(d.lives);
      } catch { /* */ }
    };
    void load();
    const int = setInterval(load, 10000);
    return () => { c = true; clearInterval(int); };
  }, []);

  // Sort lives by relevance
  const sortedLives = useMemo(() => {
    const city = user?.profile?.city?.toLowerCase().trim() ?? '';
    return [...lives].sort((a, b) => {
      const score = (l: SoKinLiveData) => {
        let v = 0;
        if (l.status === 'LIVE') v += 1000;
        v += l.viewerCount * 8 + l.likesCount * 2;
        if (l.featuredListing) v += 60;
        if (city && l.city?.toLowerCase().trim() === city) v += 120;
        return v;
      };
      return score(b) - score(a);
    });
  }, [lives, user?.profile?.city]);

  const activeLives = sortedLives.filter((l) => l.status === 'LIVE' || l.status === 'WAITING');
  const liveNowAvatars = sortedLives.filter((l) => l.status === 'LIVE').slice(0, 12);

  // Handle create
  const handleCreateLive = async (data: { title: string; description: string; tags: string[]; city: string }) => {
    if (isCreatingLive) return;
    setIsCreatingLive(true);
    try {
      const live = await sokinLive.create({
        title: data.title,
        description: data.description || undefined,
        aspect: 'PORTRAIT',
        tags: data.tags,
        city: data.city || undefined,
      });
      setSelectedLive(live);
      setView('watch');
    } catch { /* */ }
    finally { setIsCreatingLive(false); }
  };

  const handleOpenLive = async (live: SoKinLiveData) => {
    try {
      const full = await sokinLive.get(live.id);
      setSelectedLive(full);
    } catch {
      setSelectedLive(live);
    }
    setView('watch');
  };

  // --- VIEW: Create ---
  if (view === 'create') {
    return (
      <LiveCreator
        onCancel={() => setView('browse')}
        onStart={handleCreateLive}
      />
    );
  }

  // --- VIEW: Watch ---
  if (view === 'watch' && selectedLive) {
    return (
      <LiveViewer
        live={selectedLive}
        onBack={() => { setView('browse'); setSelectedLive(null); }}
        isHost={selectedLive.hostId === user?.id}
      />
    );
  }

  // --- VIEW: Browse ---
  const currentAvatar = user?.profile?.avatarUrl ?? '';
  const currentInitial = (user?.profile?.displayName ?? 'K').charAt(0).toUpperCase();

  return (
    <div className="lv-page">
      {/* Bloc 1: Title */}
      <div className={`lv-title-section${barsVisible ? '' : ' lv-title-section--hidden'}`}>
        <h1 className="lv-title">🔴 So-Kin Live</h1>
      </div>

      {/* Bloc 2: Start + suggestions */}
      <div className={`lv-start-section${barsVisible ? '' : ' lv-start-section--hidden'}`}>
        {/* Left: user avatar + create button */}
        <div className="lv-start-user">
          <div className="lv-start-avatar-wrap">
            {currentAvatar
              ? <img src={currentAvatar} alt="" className="lv-start-avatar" />
              : <div className="lv-start-avatar lv-start-avatar--ph">{currentInitial}</div>}
            <button
              type="button"
              className="lv-start-plus"
              onClick={() => isLoggedIn ? setView('create') : navigate('/login')}
              aria-label="Lancer un live"
            >
              +
            </button>
          </div>
        </div>

        {/* Center-right: live avatars strip */}
        <div className="lv-live-strip">
          {liveNowAvatars.length > 0 ? (
            liveNowAvatars.map((l) => {
              const p = l.host?.profile;
              return (
                <button key={l.id} type="button" className="lv-live-avatar-btn" onClick={() => void handleOpenLive(l)}>
                  <div className="lv-live-ring">
                    {p?.avatarUrl
                      ? <img src={p.avatarUrl} alt={p.displayName} className="lv-live-ring-img" />
                      : <span className="lv-live-ring-ph">{(p?.displayName ?? 'L').charAt(0)}</span>}
                  </div>
                  <span className="lv-live-avatar-name">{p?.displayName ?? 'Live'}</span>
                </button>
              );
            })
          ) : (
            <p className="lv-live-strip-empty">Aucun live en direct</p>
          )}
        </div>
      </div>

      {/* Bloc 3: Feed */}
      <div className={`lv-feed-section${barsVisible ? '' : ' lv-feed-section--fullscreen'}`}>
        <LiveFeed lives={activeLives} onOpen={(l) => void handleOpenLive(l)} />
      </div>

      {/* FAB */}
      <LiveFAB visible={barsVisible} />
    </div>
  );
}
