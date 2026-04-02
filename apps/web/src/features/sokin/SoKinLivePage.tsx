import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useIsMobile } from '../../hooks/useIsMobile';
import { listings as listingsApi, sokinLive, type MyListing, type SoKinLiveData, type SoKinLiveChatMsg } from '../../lib/api-client';
import './sokin-live.css';

/* ═══════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════ */

type LiveView = 'browse' | 'watch' | 'create';
type LiveVisibility = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'CLIENTS';

const LIVE_CATEGORY_PREFIX = '__live_category__:';
const LIVE_VISIBILITY_PREFIX = '__live_visibility__:';

function buildLiveTags(baseTags: string[], category: string, visibility: LiveVisibility) {
  return [
    ...baseTags.filter((tag) => !tag.startsWith(LIVE_CATEGORY_PREFIX) && !tag.startsWith(LIVE_VISIBILITY_PREFIX)),
    `${LIVE_CATEGORY_PREFIX}${category}`,
    `${LIVE_VISIBILITY_PREFIX}${visibility}`,
  ];
}

function extractLiveCategory(tags: string[], defaultLabel: string): string {
  return tags.find((tag) => tag.startsWith(LIVE_CATEGORY_PREFIX))?.slice(LIVE_CATEGORY_PREFIX.length) ?? defaultLabel;
}

function extractLiveVisibility(tags: string[]): LiveVisibility {
  return (tags.find((tag) => tag.startsWith(LIVE_VISIBILITY_PREFIX))?.slice(LIVE_VISIBILITY_PREFIX.length) as LiveVisibility | undefined) ?? 'PUBLIC';
}

function formatHistoryDate(iso: string | null, locale: string, fallback: string): string {
  if (!iso) return fallback;
  return new Date(iso).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function isHlsSource(url: string): boolean {
  return /\.m3u8(?:$|[?#])/i.test(url);
}

/* ═══════════════════════════════════════════════════
   FORMAT OVERLAY MODAL — choix 16:9 / 9:16
   ═══════════════════════════════════════════════════ */

function StartLiveModal({
  onClose,
  onStart,
  listings,
  defaultCity,
  loadingListings,
}: {
  onClose: () => void;
  onStart: (data: { title: string; description: string; aspect: 'LANDSCAPE' | 'PORTRAIT'; city: string; category: string; visibility: LiveVisibility; featuredListingId?: string; thumbnailUrl?: string; tags: string[] }) => void;
  listings: MyListing[];
  defaultCity: string;
  loadingListings: boolean;
}) {
  const { t, formatMoneyFromUsdCents } = useLocaleCurrency();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [aspect, setAspect] = useState<'LANDSCAPE' | 'PORTRAIT'>('PORTRAIT');
  const [city, setCity] = useState(defaultCity);
  const [category, setCategory] = useState('Shopping live');
  const [visibility, setVisibility] = useState<LiveVisibility>('PUBLIC');
  const [selectedListingId, setSelectedListingId] = useState('');
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const selectedListing = listings.find((listing) => listing.id === selectedListingId) ?? null;

  useEffect(() => {
    let cancelled = false;

    const requestMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (previewRef.current) {
          previewRef.current.srcObject = stream;
        }
        setMediaReady(true);
        setMediaError(null);
      } catch {
        setMediaReady(false);
        setMediaError(t('live.mediaAccessError'));
      }
    };

    void requestMedia();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return (
    <div className="sklive-modal-overlay" onClick={onClose}>
      <div className="sklive-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sklive-modal-close" onClick={onClose}>✕</button>
        <h2 className="sklive-modal-title">🔴 {t('live.startLive')}</h2>

        <div className="sklive-form-group">
          <label>{t('live.titleLabel')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('live.titlePlaceholder')}
            maxLength={120}
            className="sklive-input"
          />
        </div>

        <div className="sklive-form-group">
          <label>{t('live.descLabel')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('live.descPlaceholder')}
            maxLength={500}
            rows={3}
            className="sklive-input"
          />
        </div>

        <div className="sklive-form-group">
          <label>{t('live.videoFormat')}</label>
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
              <span className="sklive-aspect-desc">{t('live.portrait')}</span>
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
              <span className="sklive-aspect-desc">{t('live.landscape')}</span>
            </button>
          </div>
        </div>

        <div className="sklive-form-group">
          <label>{t('live.cityLabel')}</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t('live.cityPlaceholder')}
            className="sklive-input"
          />
        </div>

        <div className="sklive-form-grid">
          <div className="sklive-form-group">
            <label>{t('live.categoryLabel')}</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('live.categoryPlaceholder')}
              className="sklive-input"
            />
          </div>

          <div className="sklive-form-group">
            <label>{t('live.visibilityLabel')}</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as LiveVisibility)} className="sklive-input">
              <option value="PUBLIC">{t('live.visPublic')}</option>
              <option value="FOLLOWERS">{t('live.visFollowers')}</option>
              <option value="PRIVATE">{t('live.visPrivate')}</option>
              <option value="CLIENTS">{t('live.visClients')}</option>
            </select>
          </div>
        </div>

        <div className="sklive-form-group">
          <label>{t('live.pinnedProduct')}</label>
          <select value={selectedListingId} onChange={(e) => setSelectedListingId(e.target.value)} className="sklive-input">
            <option value="">{t('live.noProductSelected')}</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>{listing.title} · {formatMoneyFromUsdCents(listing.priceUsdCents)}</option>
            ))}
          </select>
          {loadingListings ? <p className="sklive-field-help">{t('live.loadingProducts')}</p> : null}
        </div>

        <div className="sklive-live-plan-card">
          <div>
            <span className="sklive-plan-label">Thumbnail auto</span>
            <strong>{selectedListing?.title ?? 'Aperçu caméra'}</strong>
            <p>{selectedListing ? t('live.thumbFromProduct').replace('{title}', selectedListing.title) : t('live.thumbFromCamera')}</p>
          </div>
          {selectedListing?.imageUrl ? <img src={selectedListing.imageUrl} alt={selectedListing.title} className="sklive-plan-thumb" /> : <div className="sklive-plan-thumb ph">📺</div>}
        </div>

        <div className="sklive-form-group">
          <label>{t('live.cameraPreview')}</label>
          <div className="sklive-camera-preview">
            {mediaReady ? (
              <video ref={previewRef} autoPlay muted playsInline className="sklive-camera-preview-video" />
            ) : (
              <div className="sklive-camera-preview-empty">
                <span>📷</span>
                <p>{mediaError ?? t('live.mediaAccessPending')}</p>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="sklive-start-btn"
          disabled={!title.trim() || !mediaReady}
          onClick={() => onStart({
            title: title.trim(),
            description: description.trim(),
            aspect,
            city: city.trim(),
            category: category.trim() || t('live.defaultCategory'),
            visibility,
            featuredListingId: selectedListing?.id,
            thumbnailUrl: selectedListing?.imageUrl ?? undefined,
            tags: buildLiveTags([], category.trim() || t('live.defaultCategory'), visibility),
          })}
        >
          🔴 {t('live.launchLive')}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LIVE CARD — carte d'un live dans la grille
   ═══════════════════════════════════════════════════ */

function LiveCard({ live, onClick }: { live: SoKinLiveData; onClick: () => void }) {
  const { t, language } = useLocaleCurrency();
  const locale = language === 'en' ? 'en-US' : language === 'ln' ? 'fr-CD' : 'fr-FR';
  const hostProfile = live.host?.profile;
  const liveCategory = extractLiveCategory(live.tags, t('live.defaultCategory'));
  const badgeConfig =
    live.status === 'LIVE'
      ? { className: 'live', label: '🔴 LIVE' }
      : live.status === 'WAITING'
        ? { className: 'waiting', label: `⏳ ${t('live.waiting')}` }
        : live.status === 'ENDED'
          ? { className: 'ended', label: `⬛ ${t('live.ended')}` }
          : { className: 'ended', label: `🚫 ${t('live.canceled')}` };
  const viewersLabel = live.status === 'ENDED' || live.status === 'CANCELED'
    ? `👁️ Pic ${live.peakViewers}`
    : `👁️ ${live.viewerCount}`;
  const secondaryLabel = live.status === 'ENDED' || live.status === 'CANCELED'
    ? formatHistoryDate(live.endedAt ?? live.createdAt, locale, t('live.dateUnavailable'))
    : live.city
      ? `📍 ${live.city}`
      : null;

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
          <span className={`sklive-badge ${badgeConfig.className}`}>{badgeConfig.label}</span>
          <span className="sklive-badge viewers">{viewersLabel}</span>
        </div>
        <div className="sklive-card-overlay-meta">
          <span className="sklive-card-chip">{liveCategory}</span>
          {live.featuredListing ? <span className="sklive-card-chip commerce">🛒 {live.featuredListing.type === 'SERVICE' ? t('live.typeService') : t('live.typeProduct')}</span> : null}
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
            <span className="sklive-card-hostname">{hostProfile?.displayName ?? t('live.unknownUser')}</span>
            {secondaryLabel && <span className="sklive-card-city">{secondaryLabel}</span>}
          </div>
        </div>

        <div className="sklive-card-stats">
          <span>❤️ {live.likesCount}</span>
          {(live.status === 'ENDED' || live.status === 'CANCELED') && <span>💬 {t('live.archive')}</span>}
          <span className="sklive-card-tag">{extractLiveVisibility(live.tags)}</span>
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
  const { isLoggedIn, user } = useAuth();
  const [chatMessages, setChatMessages] = useState<SoKinLiveChatMsg[]>([]);
  const { t, formatMoneyFromUsdCents, language } = useLocaleCurrency();
  const locale = language === "en" ? "en-US" : language === "ln" ? "fr-CD" : "fr-FR";
  const [chatInput, setChatInput] = useState('');
  const [liveData, setLiveData] = useState(live);
  const [localLikes, setLocalLikes] = useState(live.likesCount);
  const [localViewers, setLocalViewers] = useState(live.viewerCount);
  const [liveStatus, setLiveStatus] = useState(live.status);
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const [hasReacted, setHasReacted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [hostListings, setHostListings] = useState<Array<{ id: string; title: string; priceUsdCents: number; city: string; imageUrl: string | null; type: 'PRODUIT' | 'SERVICE' }>>([]);
  const [showListingPicker, setShowListingPicker] = useState(false);
  const [listingBusy, setListingBusy] = useState(false);
  const [promoGoal, setPromoGoal] = useState<{ label: string; value: string } | null>(null);
  const heartIdRef = useRef(0);
  const lastTapRef = useRef(0);
  const surfaceTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollInFlightRef = useRef(false);
  const hostPreviewRef = useRef<HTMLVideoElement>(null);
  const hostPreviewStreamRef = useRef<MediaStream | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement>(null);
  const playbackHlsRef = useRef<Hls | null>(null);
  const isMobile = useIsMobile();
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const playbackUrl = liveData.replayUrl?.trim() || null;
  const canPlayPublicStream = Boolean(playbackUrl) && liveStatus !== 'WAITING' && liveStatus !== 'CANCELED';

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

  useEffect(() => {
    setLiveData(live);
    setLocalLikes(live.likesCount);
    setLocalViewers(live.viewerCount);
    setLiveStatus(live.status);
    setHasReacted(false);
    setSoundEnabled(false);
    setLiveNotice(null);
  }, [live]);

  useEffect(() => {
    if (!isHost || canPlayPublicStream || liveStatus === 'ENDED') return;
    let cancelled = false;

    const requestHostPreview = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        hostPreviewStreamRef.current = stream;
        if (hostPreviewRef.current) {
          hostPreviewRef.current.srcObject = stream;
        }
      } catch {
        // Le placeholder reste visible si l'autorisation echoue.
      }
    };

    void requestHostPreview();

    return () => {
      cancelled = true;
      hostPreviewStreamRef.current?.getTracks().forEach((track) => track.stop());
      hostPreviewStreamRef.current = null;
    };
  }, [canPlayPublicStream, isHost, liveStatus]);

  useEffect(() => {
    const video = playbackVideoRef.current;
    if (!video || !playbackUrl || !canPlayPublicStream) {
      playbackHlsRef.current?.destroy();
      playbackHlsRef.current = null;
      return;
    }

    let cancelled = false;
    setLiveNotice(null);
    video.muted = !soundEnabled;
    video.volume = soundEnabled ? 1 : 0;

    const tryPlay = async () => {
      try {
        await video.play();
      } catch {
        if (!cancelled && soundEnabled) {
          setLiveNotice('Touchez Audio pour activer le son du live sur cet appareil.');
        }
      }
    };

    if (isHlsSource(playbackUrl)) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playbackUrl;
        video.load();
        void tryPlay();
      } else if (Hls.isSupported()) {
        playbackHlsRef.current?.destroy();
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        playbackHlsRef.current = hls;
        hls.loadSource(playbackUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void tryPlay();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!cancelled && data.fatal) {
            setLiveNotice(t('live.streamReadError'));
          }
        });
      } else {
        setLiveNotice(t('live.browserUnsupportedStream'));
      }
    } else {
      playbackHlsRef.current?.destroy();
      playbackHlsRef.current = null;
      video.src = playbackUrl;
      video.load();
      void tryPlay();
    }

    return () => {
      cancelled = true;
      playbackHlsRef.current?.destroy();
      playbackHlsRef.current = null;
    };
  }, [canPlayPublicStream, playbackUrl, soundEnabled]);

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
    let cancelled = false;
    const poll = setInterval(async () => {
      if (statusPollInFlightRef.current) return;
      statusPollInFlightRef.current = true;
      try {
        const updated = await sokinLive.get(live.id);
        if (cancelled) return;
        setLiveData(updated);
        setLocalViewers(updated.viewerCount);
        setLocalLikes(updated.likesCount);
        // Stabilisation: ne jamais revenir de LIVE vers WAITING
        // (évite les effets visuels de coupure/redémarrage)
        setLiveStatus((prev) => {
          if (prev === 'LIVE' && updated.status === 'WAITING') return prev;
          return updated.status;
        });
      } catch { /* ignore */ }
      finally {
        statusPollInFlightRef.current = false;
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
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

  const spawnHeart = useCallback(() => {
    const id = ++heartIdRef.current;
    const x = Math.random() * 60 + 20;
    setHearts((prev) => [...prev, { id, x }]);
    setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== id)), 1500);
  }, []);

  const handleLike = useCallback(async () => {
    if (!isLoggedIn) return;
    setHasReacted(true);
    setLocalLikes((n) => n + 1);
    spawnHeart();
    try {
      const result = await sokinLive.like(live.id);
      setLocalLikes((current) => Math.max(current, result.likesCount));
    } catch {
      setLocalLikes((current) => Math.max(0, current - 1));
    }
  }, [isLoggedIn, live.id, spawnHeart]);

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

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev);
    setLiveNotice(null);
  }, []);

  const handleShareLive = useCallback(async () => {
    const shareUrl = `${window.location.origin}/sokin/live?watch=${encodeURIComponent(live.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: liveData.title,
          text: `${liveData.host?.profile?.displayName ?? 'Un créateur'} est en live sur Kin-Sell`,
          url: shareUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setLiveNotice(t('live.shareLinkCopied'));
    } catch {
      setLiveNotice(t('live.shareError'));
    }
  }, [live.id, liveData.host?.profile?.displayName, liveData.title, t]);

  const handleVideoSurfaceTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 260) {
      void handleLike();
    }
    lastTapRef.current = now;
  }, [handleLike]);

  const isPortrait = liveData.aspect === 'PORTRAIT';
  // Sur mobile, adapter le layout à l'orientation réelle de l'appareil
  const layoutOrientation = isMobile ? deviceOrientation : (isPortrait ? 'portrait' : 'landscape');
  const hostProfile = liveData.host?.profile;
  const creatorHandle = hostProfile?.username ? `@${hostProfile.username}` : '@kin-sell-live';
  const liveDescription = liveData.description?.trim() || (liveData.city ? `En direct depuis ${liveData.city}` : 'Live Kin-Sell');
  const canReact = isLoggedIn && liveStatus === 'LIVE';
  const canShowComposer = isLoggedIn && liveStatus === 'LIVE';
  const canShowJoinAsGuest = !isHost && liveStatus === 'LIVE';
  const hostOwnsLive = liveData.hostId === user?.id;
  const liveCategory = extractLiveCategory(liveData.tags, t('live.defaultCategory'));
  const liveVisibility = extractLiveVisibility(liveData.tags);

  useEffect(() => {
    if (localViewers >= 100) {
      setPromoGoal({ label: 'Objectif audience atteint', value: `${localViewers} viewers` });
      return;
    }
    if (liveData.featuredListing) {
      setPromoGoal({ label: 'Produit mis en avant', value: liveData.featuredListing.title });
      return;
    }
    setPromoGoal({ label: 'Objectif du live', value: `${Math.max(100 - localViewers, 1)} viewers restants` });
  }, [liveData.featuredListing, localViewers]);

  useEffect(() => {
    if (!isHost) return;
    let cancelled = false;
    const loadListings = async () => {
      try {
        const data = await sokinLive.myListings(live.id);
        if (!cancelled) setHostListings(data.listings);
      } catch {
        if (!cancelled) setHostListings([]);
      }
    };
    void loadListings();
    return () => { cancelled = true; };
  }, [isHost, live.id]);

  const handlePinListing = useCallback(async (listingId: string | null) => {
    if (!hostOwnsLive || listingBusy) return;
    setListingBusy(true);
    try {
      const updated = await sokinLive.setFeaturedListing(live.id, listingId);
      setLiveData(updated);
      setShowListingPicker(false);
    } catch {
      setLiveNotice(t('live.pinListingError'));
    } finally {
      setListingBusy(false);
    }
  }, [hostOwnsLive, listingBusy, live.id]);

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
            {liveData.city && <span className="sklive-viewer-city">📍 {liveData.city}</span>}
          </div>
        </div>

        <div className="sklive-viewer-meta">
          {liveStatus === 'LIVE' && <span className="sklive-badge live">🔴 LIVE</span>}
          {liveStatus === 'WAITING' && <span className="sklive-badge waiting">⏳ {t('live.waiting')}</span>}
          {liveStatus === 'ENDED' && <span className="sklive-badge ended">⬛ {t('live.ended')}</span>}
          <span className="sklive-viewer-count">👁️ {localViewers}</span>
        </div>
      </div>

      {/* Video area */}
      <div className={`sklive-viewer-video${isPortrait ? ' portrait' : ' landscape'}`}>
        <div
          className="sklive-video-placeholder"
          onDoubleClick={() => void handleLike()}
          onClick={handleVideoSurfaceTap}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            surfaceTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(e) => {
            const start = surfaceTouchStartRef.current;
            const touch = e.changedTouches[0];
            if (!start) return;
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (dy > 100) {
              onBack();
            } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
              handleVideoSurfaceTap();
            }
            surfaceTouchStartRef.current = null;
          }}
        >
          {canPlayPublicStream && (
            <video
              ref={playbackVideoRef}
              className="sklive-playback-video"
              playsInline
              autoPlay
              muted={!soundEnabled}
              poster={liveData.thumbnailUrl ?? undefined}
            />
          )}
          {!canPlayPublicStream && isHost && liveStatus !== 'ENDED' && (
            <video ref={hostPreviewRef} autoPlay muted playsInline className="sklive-host-preview-video" />
          )}
          {!canPlayPublicStream && !isHost && liveData.thumbnailUrl && (
            <img src={liveData.thumbnailUrl} alt={liveData.title} className="sklive-fallback-poster" />
          )}
          <div className="sklive-video-shade" />

          <div className="sklive-video-topbar">
            <div className="sklive-video-host-badge">
              <span className="sklive-video-host-name">{hostProfile?.displayName ?? 'Live'}</span>
              <span className="sklive-video-host-handle">{creatorHandle}</span>
            </div>
            <div className="sklive-video-meta-pill">
              <span>👁️ {localViewers}</span>
              <span>❤️ {localLikes}</span>
              <span>{liveCategory}</span>
              {hostOwnsLive && <span>Toi</span>}
            </div>
          </div>

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
              <p className="sklive-live-title">{liveData.title}</p>
              {!playbackUrl && (
                <p className="sklive-live-title sklive-live-warning">
                  Flux public non configuré: les spectateurs voient l’habillage du live, mais pas encore l’image ni le son.
                </p>
              )}
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
              <p>👁️ {liveData.peakViewers} spectateurs au pic · ❤️ {localLikes} likes</p>
              <button type="button" className="sklive-back-btn-large" onClick={onBack}>Retour aux lives</button>
            </div>
          )}

          {liveNotice && <div className="sklive-live-notice">{liveNotice}</div>}

          {liveStatus === 'LIVE' && (
            <div className="sklive-side-actions">
              <button
                type="button"
                className={`sklive-action-btn like${hasReacted ? ' reacted' : ''}`}
                onClick={handleLike}
                title={hostOwnsLive ? 'Réagir à ton live' : 'Réagir'}
                disabled={!canReact}
              >
                <span className="sklive-action-icon">❤️</span>
                <span>{localLikes}</span>
                <small>Réagir</small>
              </button>

              {canPlayPublicStream && (
                <button type="button" className="sklive-action-btn sound" onClick={handleToggleSound} title={soundEnabled ? 'Couper le son' : 'Activer le son'}>
                  <span className="sklive-action-icon">{soundEnabled ? '🔊' : '🔇'}</span>
                  <span>{soundEnabled ? 'Son' : 'Muet'}</span>
                  <small>Audio</small>
                </button>
              )}

              {canShowJoinAsGuest && (
                <button type="button" className="sklive-action-btn participate" onClick={handleJoinAsGuest}>
                  <span className="sklive-action-icon">🎤</span>
                  <span>Participer</span>
                  <small>Invité</small>
                </button>
              )}

              <button type="button" className="sklive-action-btn share" title="Partager" onClick={handleShareLive}>
                <span className="sklive-action-icon">🔗</span>
                <span>Partager</span>
                <small>Lien</small>
              </button>
            </div>
          )}

          <div className="sklive-live-bottom">
            {liveData.featuredListing && liveStatus === 'LIVE' && (
              <a href={`/listing/${liveData.featuredListing.id}`} className="sklive-featured-product" target="_blank" rel="noreferrer">
                {liveData.featuredListing.imageUrl ? <img src={liveData.featuredListing.imageUrl} alt={liveData.featuredListing.title} /> : <span className="sklive-featured-placeholder">🛍️</span>}
                <div>
                  <strong>{liveData.featuredListing.title}</strong>
                  <span>{formatMoneyFromUsdCents(liveData.featuredListing.priceUsdCents)} • {liveData.featuredListing.city}</span>
                </div>
                <em>Acheter maintenant</em>
              </a>
            )}

            <div className="sklive-commerce-strip">
              <span className="sklive-commerce-pill">Visibilité: {liveVisibility}</span>
              {promoGoal ? <span className="sklive-commerce-pill strong">{promoGoal.label}: {promoGoal.value}</span> : null}
            </div>

            <div className="sklive-live-copy">
              <p className="sklive-live-copy-handle">{creatorHandle}</p>
              <p className="sklive-live-copy-title">{liveData.title}</p>
              <p className="sklive-live-copy-description">{liveDescription}</p>
              {liveData.tags.length > 0 && (
                <div className="sklive-live-tags">
                  {liveData.tags.filter((tag) => !tag.startsWith(LIVE_CATEGORY_PREFIX) && !tag.startsWith(LIVE_VISIBILITY_PREFIX)).slice(0, 3).map((tag) => (
                    <span key={tag} className="sklive-live-tag">#{tag}</span>
                  ))}
                  <span className="sklive-live-tag sklive-live-tag--meta">{liveCategory}</span>
                </div>
              )}
            </div>

            {hostOwnsLive && liveStatus === 'LIVE' && (
              <div className="sklive-host-pin-wrap">
                <button type="button" className="sklive-host-pin-btn" onClick={() => setShowListingPicker((v) => !v)}>
                  {liveData.featuredListing ? '📌 Modifier le produit épinglé' : '📌 Épingler un produit'}
                </button>
                {showListingPicker && (
                  <div className="sklive-host-pin-list">
                    <button type="button" disabled={listingBusy} onClick={() => void handlePinListing(null)}>Retirer le produit épinglé</button>
                    {hostListings.map((item) => (
                      <button key={item.id} type="button" disabled={listingBusy} onClick={() => void handlePinListing(item.id)}>
                      {item.title} — {formatMoneyFromUsdCents(item.priceUsdCents)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

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

              {canShowComposer && (
                <div className="sklive-chat-input-wrap">
                  <input
                    type="text"
                    className="sklive-chat-input"
                    placeholder="Écris comme sur TikTok Live..."
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
        </div>

        <div className="sklive-hearts-container">
          {hearts.map((h) => (
            <span key={h.id} className="sklive-floating-heart" style={{ left: `${h.x}%` }}>❤️</span>
          ))}
        </div>
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
  const [historyLives, setHistoryLives] = useState<SoKinLiveData[]>([]);
  const [selectedLive, setSelectedLive] = useState<SoKinLiveData | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [myListings, setMyListings] = useState<MyListing[]>([]);
  const [loadingMyListings, setLoadingMyListings] = useState(false);

  // Swipe detection for mobile
  const touchStartRef = useRef<number | null>(null);

  // Check if we need to auto-open create modal (from mobile FAB)
  useEffect(() => {
    if (searchParams.get('create') === '1' && isLoggedIn) {
      setShowCreateModal(true);
    }
  }, [searchParams, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      setMyListings([]);
      return;
    }
    let cancelled = false;
    const loadMyListings = async () => {
      setLoadingMyListings(true);
      try {
        const data = await listingsApi.mine({ status: 'ACTIVE', page: 1, limit: 30 });
        if (!cancelled) setMyListings(data.listings ?? []);
      } catch {
        if (!cancelled) setMyListings([]);
      } finally {
        if (!cancelled) setLoadingMyListings(false);
      }
    };
    void loadMyListings();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  // Load active lives
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [activeData, historyData] = await Promise.all([
          sokinLive.list(30),
          sokinLive.history(18),
        ]);
        if (!cancelled) {
          setLives(activeData.lives);
          setHistoryLives(historyData.lives);
        }
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

  const handleCreateLive = async (data: { title: string; description: string; aspect: 'LANDSCAPE' | 'PORTRAIT'; city: string; category: string; visibility: LiveVisibility; featuredListingId?: string; thumbnailUrl?: string; tags: string[] }) => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const live = await sokinLive.create({
        title: data.title,
        description: data.description || undefined,
        aspect: data.aspect,
        city: data.city || undefined,
        tags: data.tags,
        thumbnailUrl: data.thumbnailUrl,
        featuredListingId: data.featuredListingId,
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
  const sortedLives = useMemo(() => {
    const userCity = user?.profile.city?.toLowerCase().trim() ?? '';
    return [...lives].sort((left, right) => {
      const score = (live: SoKinLiveData) => {
        let value = 0;
        if (live.status === 'LIVE') value += 1000;
        value += live.viewerCount * 8;
        value += live.likesCount * 2;
        if (live.featuredListing) value += 60;
        if (userCity && live.city?.toLowerCase().trim() === userCity) value += 120;
        return value;
      };
      return score(right) - score(left);
    });
  }, [lives, user?.profile.city]);

  const liveLives = sortedLives.filter((l) => l.status === 'LIVE');
  const waitingLives = sortedLives.filter((l) => l.status === 'WAITING');
  const featuredNowLives = liveLives.slice(0, 8);
  const replayLives = historyLives.slice(0, 6);
  const heroStats = {
    liveCount: liveLives.length,
    replayCount: replayLives.length,
    viewers: liveLives.reduce((sum, live) => sum + live.viewerCount, 0),
  };

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

      <section className="sklive-hero">
        <div className="sklive-hero-copy">
          <span className="sklive-hero-kicker">LIVE NOW</span>
          <h2>Le live commerce So-Kin met d’abord les diffusions qui convertissent: populaires, proches et déjà reliées à un produit.</h2>
          <p>Cette refonte prépare le terrain pour la future couche média, tout en renforçant déjà la vente directe et la découverte en direct.</p>
          <div className="sklive-hero-metrics">
            <div><strong>{heroStats.liveCount}</strong><span>en direct</span></div>
            <div><strong>{heroStats.viewers}</strong><span>viewers actifs</span></div>
            <div><strong>{heroStats.replayCount}</strong><span>replays récents</span></div>
          </div>
        </div>
        <div className="sklive-live-now-rail" aria-label="Lives en direct prioritaires">
          {featuredNowLives.length > 0 ? featuredNowLives.map((live) => (
            <button key={live.id} type="button" className="sklive-now-card" onClick={() => void handleOpenLive(live)}>
              <span className="sklive-now-ring">
                {live.host?.profile?.avatarUrl ? <img src={live.host.profile.avatarUrl} alt={live.host.profile.displayName} /> : <span>👤</span>}
              </span>
              <strong>{live.host?.profile?.displayName ?? 'Live'}</strong>
              <span>👁️ {live.viewerCount}</span>
              {live.featuredListing ? <em>🛒 {live.featuredListing.title}</em> : <em>{extractLiveCategory(live.tags, t('live.defaultCategory'))}</em>}
            </button>
          )) : (
            <div className="sklive-now-empty">{t('live.noLiveNow')}</div>
          )}
        </div>
      </section>

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

      {replayLives.length > 0 && (
        <section className="sklive-section">
          <h2 className="sklive-section-title">
            <span className="sklive-section-dot history" />
            Replays récents
            <span className="sklive-section-count">{replayLives.length}</span>
          </h2>
          <div className="sklive-grid">
            {replayLives.map((live) => (
              <LiveCard key={live.id} live={live} onClick={() => void handleOpenLive(live)} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {lives.length === 0 && historyLives.length === 0 && (
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
          listings={myListings}
          defaultCity={user?.profile.city ?? ''}
          loadingListings={loadingMyListings}
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
