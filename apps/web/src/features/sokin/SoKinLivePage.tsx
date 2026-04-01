import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useIsMobile } from '../../hooks/useIsMobile';
import { sokinLive, type SoKinLiveData, type SoKinLiveChatMsg } from '../../lib/api-client';
import './sokin-live.css';

/* ═══════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════ */

type LiveView = 'browse' | 'watch' | 'create';

/* ═══════════════════════════════════════════════════
   FORMAT OVERLAY MODAL — choix 16:9 / 9:16
   ═══════════════════════════════════════════════════ */

function StartLiveModal({ onClose, onStart }: { onClose: () => void; onStart: (data: { title: string; description: string; aspect: 'LANDSCAPE' | 'PORTRAIT'; city: string }) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aspect, setAspect] = useState<'LANDSCAPE' | 'PORTRAIT'>('PORTRAIT');
  const [city, setCity] = useState('');

  return (
    <div className="sklive-modal-overlay" onClick={onClose}>
      <div className="sklive-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sklive-modal-close" onClick={onClose}>✕</button>
        <h2 className="sklive-modal-title">🔴 Démarrer un Live</h2>

        <div className="sklive-form-group">
          <label>Titre du live *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Vente flash téléphones !"
            maxLength={120}
            className="sklive-input"
          />
        </div>

        <div className="sklive-form-group">
          <label>Description (optionnelle)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Décrivez votre live..."
            maxLength={500}
            rows={3}
            className="sklive-input"
          />
        </div>

        <div className="sklive-form-group">
          <label>Format vidéo</label>
          <div className="sklive-aspect-picker">
            <button
              type="button"
              className={`sklive-aspect-btn${aspect === 'PORTRAIT' ? ' active' : ''}`}
              onClick={() => setAspect('PORTRAIT')}
            >
              <div className="sklive-aspect-preview portrait">
                <svg width="24" height="40" viewBox="0 0 24 40" fill="none">
                  <rect x="1" y="1" width="22" height="38" rx="3" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="6" r="2" fill="currentColor" />
                </svg>
              </div>
              <span className="sklive-aspect-label">9:16</span>
              <span className="sklive-aspect-desc">Portrait</span>
            </button>

            <button
              type="button"
              className={`sklive-aspect-btn${aspect === 'LANDSCAPE' ? ' active' : ''}`}
              onClick={() => setAspect('LANDSCAPE')}
            >
              <div className="sklive-aspect-preview landscape">
                <svg width="40" height="24" viewBox="0 0 40 24" fill="none">
                  <rect x="1" y="1" width="38" height="22" rx="3" stroke="currentColor" strokeWidth="2" />
                  <circle cx="6" cy="12" r="2" fill="currentColor" />
                </svg>
              </div>
              <span className="sklive-aspect-label">16:9</span>
              <span className="sklive-aspect-desc">Paysage</span>
            </button>
          </div>
        </div>

        <div className="sklive-form-group">
          <label>Ville</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Ex: Kinshasa"
            className="sklive-input"
          />
        </div>

        <button
          type="button"
          className="sklive-start-btn"
          disabled={!title.trim()}
          onClick={() => onStart({ title: title.trim(), description: description.trim(), aspect, city: city.trim() })}
        >
          🔴 Lancer le Live
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LIVE CARD — carte d'un live dans la grille
   ═══════════════════════════════════════════════════ */

function LiveCard({ live, onClick }: { live: SoKinLiveData; onClick: () => void }) {
  const isLive = live.status === 'LIVE';
  const hostProfile = live.host?.profile;

  return (
    <button type="button" className="sklive-card" onClick={onClick}>
      <div className={`sklive-card-thumb${live.aspect === 'PORTRAIT' ? ' portrait' : ' landscape'}`}>
        {live.thumbnailUrl ? (
          <img src={live.thumbnailUrl} alt={live.title} className="sklive-card-img" />
        ) : (
          <div className="sklive-card-placeholder">
            <span className="sklive-card-placeholder-icon">📹</span>
          </div>
        )}
        <div className="sklive-card-badges">
          {isLive ? (
            <span className="sklive-badge live">🔴 LIVE</span>
          ) : (
            <span className="sklive-badge waiting">⏳ En attente</span>
          )}
          <span className="sklive-badge viewers">👁️ {live.viewerCount}</span>
        </div>
      </div>

      <div className="sklive-card-info">
        <div className="sklive-card-host">
          {hostProfile?.avatarUrl ? (
            <img src={hostProfile.avatarUrl} alt={hostProfile.displayName} className="sklive-card-avatar" />
          ) : (
            <div className="sklive-card-avatar-placeholder">👤</div>
          )}
          <div className="sklive-card-host-text">
            <span className="sklive-card-title">{live.title}</span>
            <span className="sklive-card-hostname">{hostProfile?.displayName ?? 'Utilisateur'}</span>
            {live.city && <span className="sklive-card-city">📍 {live.city}</span>}
          </div>
        </div>

        <div className="sklive-card-stats">
          <span>❤️ {live.likesCount}</span>
          {live.tags.length > 0 && <span className="sklive-card-tag">#{live.tags[0]}</span>}
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════
   LIVE VIEWER — page de visionnage d'un live
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
  const { isLoggedIn } = useAuth();
  const [chatMessages, setChatMessages] = useState<SoKinLiveChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [localLikes, setLocalLikes] = useState(live.likesCount);
  const [localViewers, setLocalViewers] = useState(live.viewerCount);
  const [liveStatus, setLiveStatus] = useState(live.status);
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const heartIdRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMobile = useIsMobile();
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // Détecter l'orientation de l'appareil pour adapter le layout automatiquement
  useEffect(() => {
    const updateOrientation = () => {
      if (screen.orientation) {
        setDeviceOrientation(screen.orientation.type.startsWith('landscape') ? 'landscape' : 'portrait');
      } else {
        setDeviceOrientation(window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
      }
    };
    updateOrientation();

    if (screen.orientation) {
      screen.orientation.addEventListener('change', updateOrientation);
    }
    window.addEventListener('resize', updateOrientation);
    return () => {
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', updateOrientation);
      }
      window.removeEventListener('resize', updateOrientation);
    };
  }, []);

  // Rejoindre le live au montage
  useEffect(() => {
    if (isLoggedIn && !isHost) {
      sokinLive.join(live.id).catch(() => {});
    }
    return () => {
      if (isLoggedIn && !isHost) {
        sokinLive.leave(live.id).catch(() => {});
      }
    };
  }, [isLoggedIn, isHost, live.id]);

  // Polling du chat
  useEffect(() => {
    const fetchChat = async () => {
      try {
        const data = await sokinLive.chat(live.id, 80);
        setChatMessages(data.messages.reverse());
      } catch { /* ignore */ }
    };
    void fetchChat();
    chatPollRef.current = setInterval(fetchChat, 3000);
    return () => { if (chatPollRef.current) clearInterval(chatPollRef.current); };
  }, [live.id]);

  // Polling du live status
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const updated = await sokinLive.get(live.id);
        setLocalViewers(updated.viewerCount);
        setLocalLikes(updated.likesCount);
        setLiveStatus(updated.status);
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [live.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !isLoggedIn) return;
    setChatInput('');
    try {
      const msg = await sokinLive.sendChat(live.id, { text });
      setChatMessages((prev) => [...prev, msg]);
    } catch { /* ignore */ }
  }, [chatInput, isLoggedIn, live.id]);

  const handleLike = useCallback(async () => {
    if (!isLoggedIn) return;
    setLocalLikes((n) => n + 1);
    // Floating heart animation
    const id = ++heartIdRef.current;
    const x = Math.random() * 60 + 20;
    setHearts((prev) => [...prev, { id, x }]);
    setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== id)), 1500);
    try {
      await sokinLive.like(live.id);
    } catch { /* ignore */ }
  }, [isLoggedIn, live.id]);

  const handleEndLive = useCallback(async () => {
    try {
      await sokinLive.end(live.id);
      setLiveStatus('ENDED');
    } catch { /* ignore */ }
  }, [live.id]);

  const handleStartLive = useCallback(async () => {
    try {
      await sokinLive.start(live.id);
      setLiveStatus('LIVE');
    } catch { /* ignore */ }
  }, [live.id]);

  const handleJoinAsGuest = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      await sokinLive.requestGuest(live.id);
    } catch { /* ignore */ }
  }, [isLoggedIn, live.id]);

  const isPortrait = live.aspect === 'PORTRAIT';
  // Sur mobile, adapter le layout à l'orientation réelle de l'appareil
  const layoutOrientation = isMobile ? deviceOrientation : (isPortrait ? 'portrait' : 'landscape');
  const hostProfile = live.host?.profile;

  return (
    <div className={`sklive-viewer ${layoutOrientation}${isMobile ? ' mobile' : ''}${isMobile && deviceOrientation === 'landscape' ? ' device-landscape' : ''}`}>
      {/* Header bar */}
      <div className="sklive-viewer-header">
        <button type="button" className="sklive-back-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
        </button>

        <div className="sklive-viewer-host-info">
          {hostProfile?.avatarUrl ? (
            <img src={hostProfile.avatarUrl} alt="" className="sklive-viewer-avatar" />
          ) : (
            <div className="sklive-viewer-avatar-ph">👤</div>
          )}
          <div>
            <span className="sklive-viewer-hostname">{hostProfile?.displayName ?? 'Live'}</span>
            {live.city && <span className="sklive-viewer-city">📍 {live.city}</span>}
          </div>
        </div>

        <div className="sklive-viewer-meta">
          {liveStatus === 'LIVE' && <span className="sklive-badge live">🔴 LIVE</span>}
          {liveStatus === 'WAITING' && <span className="sklive-badge waiting">⏳ En attente</span>}
          {liveStatus === 'ENDED' && <span className="sklive-badge ended">⬛ Terminé</span>}
          <span className="sklive-viewer-count">👁️ {localViewers}</span>
        </div>
      </div>

      {/* Video area */}
      <div className={`sklive-viewer-video${isPortrait ? ' portrait' : ' landscape'}`}>
        <div className="sklive-video-placeholder">
          {liveStatus === 'WAITING' && (
            <div className="sklive-waiting-screen">
              <div className="sklive-waiting-pulse" />
              <span>⏳ Le live va bientôt commencer...</span>
              {isHost && (
                <button type="button" className="sklive-start-broadcast-btn" onClick={handleStartLive}>
                  🔴 Démarrer la diffusion
                </button>
              )}
            </div>
          )}
          {liveStatus === 'LIVE' && (
            <div className="sklive-live-screen">
              <div className="sklive-live-indicator">
                <span className="sklive-live-dot" />
                <span>EN DIRECT</span>
              </div>
              <p className="sklive-live-title">{live.title}</p>
              {isHost && (
                <button type="button" className="sklive-end-broadcast-btn" onClick={handleEndLive}>
                  ⬛ Terminer le live
                </button>
              )}
            </div>
          )}
          {liveStatus === 'ENDED' && (
            <div className="sklive-ended-screen">
              <span>📺 Ce live est terminé</span>
              <p>👁️ {live.peakViewers} spectateurs au pic · ❤️ {localLikes} likes</p>
              <button type="button" className="sklive-back-btn-large" onClick={onBack}>Retour aux lives</button>
            </div>
          )}
        </div>

        {/* Floating hearts */}
        <div className="sklive-hearts-container">
          {hearts.map((h) => (
            <span key={h.id} className="sklive-floating-heart" style={{ left: `${h.x}%` }}>❤️</span>
          ))}
        </div>
      </div>

      {/* Actions & Participate button */}
      <div className="sklive-viewer-actions">
        <button type="button" className="sklive-action-btn like" onClick={handleLike} title="J'aime">
          ❤️ <span>{localLikes}</span>
        </button>

        {!isHost && liveStatus === 'LIVE' && (
          <button type="button" className="sklive-participate-btn" onClick={handleJoinAsGuest}>
            🎤 Participer
          </button>
        )}

        <button type="button" className="sklive-action-btn share" title="Partager">
          🔗
        </button>
      </div>

      {/* Chat */}
      <div className="sklive-chat">
        <div className="sklive-chat-messages">
          {chatMessages.map((msg) => (
            <div key={msg.id} className={`sklive-chat-msg${msg.isGift ? ' gift' : ''}${msg.isPinned ? ' pinned' : ''}`}>
              <span className="sklive-chat-author">{msg.user?.profile?.displayName ?? 'Anonyme'}</span>
              {msg.isGift && <span className="sklive-chat-gift-icon">🎁</span>}
              <span className="sklive-chat-text">{msg.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {isLoggedIn && liveStatus === 'LIVE' && (
          <div className="sklive-chat-input-wrap">
            <input
              type="text"
              className="sklive-chat-input"
              placeholder="Envoyer un message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSendChat(); }}
              maxLength={300}
            />
            <button type="button" className="sklive-chat-send" onClick={() => void handleSendChat()}>
              ➤
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PAGE PRINCIPALE — SoKinLivePage
   ═══════════════════════════════════════════════════ */

export function SoKinLivePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoggedIn, user } = useAuth();
  const { t } = useLocaleCurrency();
  const isMobile = useIsMobile();

  const [view, setView] = useState<LiveView>('browse');
  const [lives, setLives] = useState<SoKinLiveData[]>([]);
  const [selectedLive, setSelectedLive] = useState<SoKinLiveData | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Swipe detection for mobile
  const touchStartRef = useRef<number | null>(null);

  // Check if we need to auto-open create modal (from mobile FAB)
  useEffect(() => {
    if (searchParams.get('create') === '1' && isLoggedIn) {
      setShowCreateModal(true);
    }
  }, [searchParams, isLoggedIn]);

  // Load active lives
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await sokinLive.list(30);
        if (!cancelled) setLives(data.lives);
      } catch { /* ignore */ }
    };
    void load();
    const interval = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Mobile swipe: swipe right to go back to So-Kin
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartRef.current;
    if (diff > 100 && view === 'browse') {
      navigate('/sokin');
    }
    touchStartRef.current = null;
  };

  const handleCreateLive = async (data: { title: string; description: string; aspect: 'LANDSCAPE' | 'PORTRAIT'; city: string }) => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const live = await sokinLive.create({
        title: data.title,
        description: data.description || undefined,
        aspect: data.aspect,
        city: data.city || undefined,
      });
      setShowCreateModal(false);
      setSelectedLive(live);
      setView('watch');
    } catch { /* ignore */ } finally {
      setIsCreating(false);
    }
  };

  const handleOpenLive = async (live: SoKinLiveData) => {
    try {
      const full = await sokinLive.get(live.id);
      setSelectedLive(full);
      setView('watch');
    } catch {
      setSelectedLive(live);
      setView('watch');
    }
  };

  // If watching a live
  if (view === 'watch' && selectedLive) {
    return (
      <LiveViewer
        live={selectedLive}
        onBack={() => { setView('browse'); setSelectedLive(null); }}
        isHost={selectedLive.hostId === user?.id}
      />
    );
  }

  // Browse view
  const liveLives = lives.filter((l) => l.status === 'LIVE');
  const waitingLives = lives.filter((l) => l.status === 'WAITING');

  return (
    <div
      className={`sklive-page${isMobile ? ' mobile' : ''}`}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      {/* Header */}
      <header className="sklive-header">
        <button type="button" className="sklive-back-btn" onClick={() => navigate('/sokin')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
        </button>

        <div className="sklive-header-title">
          <span className="sklive-header-icon">🔴</span>
          <h1>So-Kin <strong>Live</strong></h1>
        </div>

        {isLoggedIn && (
          <button
            type="button"
            className="sklive-go-live-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <span className="sklive-go-live-dot" />
            Go Live
          </button>
        )}
      </header>

      {/* Swipe hint on mobile */}
      {isMobile && (
        <p className="sklive-swipe-hint">← Swipe pour retourner à So-Kin</p>
      )}

      {/* Lives en cours */}
      {liveLives.length > 0 && (
        <section className="sklive-section">
          <h2 className="sklive-section-title">
            <span className="sklive-section-dot live" />
            En direct maintenant
            <span className="sklive-section-count">{liveLives.length}</span>
          </h2>
          <div className="sklive-grid">
            {liveLives.map((live) => (
              <LiveCard key={live.id} live={live} onClick={() => void handleOpenLive(live)} />
            ))}
          </div>
        </section>
      )}

      {/* Lives en attente */}
      {waitingLives.length > 0 && (
        <section className="sklive-section">
          <h2 className="sklive-section-title">
            <span className="sklive-section-dot waiting" />
            Prochains lives
            <span className="sklive-section-count">{waitingLives.length}</span>
          </h2>
          <div className="sklive-grid">
            {waitingLives.map((live) => (
              <LiveCard key={live.id} live={live} onClick={() => void handleOpenLive(live)} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {lives.length === 0 && (
        <div className="sklive-empty">
          <span className="sklive-empty-icon">📹</span>
          <p>Aucun live en cours</p>
          <p className="sklive-empty-sub">Sois le premier à lancer un live !</p>
          {isLoggedIn && (
            <button type="button" className="sklive-go-live-btn large" onClick={() => setShowCreateModal(true)}>
              <span className="sklive-go-live-dot" />
              Go Live
            </button>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <StartLiveModal
          onClose={() => setShowCreateModal(false)}
          onStart={handleCreateLive}
        />
      )}

      {/* Mobile bottom nav */}
      {isMobile && (
        <>
          <div className="sklive-bottom-spacer" />
          <nav className="sklive-mobile-nav">
            <button type="button" className="sklive-mnav-item" onClick={() => navigate('/sokin')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
              <span>So-Kin</span>
            </button>
            <button type="button" className="sklive-mnav-item active">
              <span style={{ fontSize: '20px' }}>🔴</span>
              <span>Lives</span>
            </button>
            <button
              type="button"
              className="sklive-mnav-fab"
              onClick={() => isLoggedIn ? setShowCreateModal(true) : navigate('/login')}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <button type="button" className="sklive-mnav-item" onClick={() => navigate('/explorer')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <span>Explorer</span>
            </button>
            <button type="button" className="sklive-mnav-item" onClick={() => navigate('/account')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              <span>Compte</span>
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
