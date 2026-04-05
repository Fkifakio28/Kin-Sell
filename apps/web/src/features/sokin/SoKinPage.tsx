import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useMarketPreference } from '../../app/providers/MarketPreferenceProvider';
import { getDashboardPath } from '../../utils/role-routing';
import { prepareMediaUrl, prepareMediaUrls } from '../../utils/media-upload';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSocket } from '../../hooks/useSocket';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import {
  sokin as sokinApi,
  type SoKinApiFeedPost,
  type SoKinStory,
  type SoKinReactionType,
} from '../../lib/api-client';
import { AdBanner } from '../../components/AdBanner';
import { SmartAdSlot } from '../../components/SmartAdSlot';
import { SeoMeta } from '../../components/SeoMeta';
import { SoKinPageDesktop } from './SoKinPageDesktop';
import './sokin.css';

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */

function relTime(iso: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return t('msg.justNow');
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const WAVE_BG_COLORS = [
  '#241752', '#6f58ff', '#490c80', '#1a0e3a',
  '#ff4444', '#ff8c00', '#00b894', '#0984e3',
  '#e84393', '#fdcb6e',
];

const MAX_SCHEDULE_DAYS = 30;

/* ═══════════════════════════════════════════════════
   SOKIN TOP BAR (mobile)
   ═══════════════════════════════════════════════════ */

function SoKinTopBar({ t }: { t: (k: string) => string }) {
  const nav = useNavigate();
  return (
    <header className="sk-topbar" role="banner">
      <button className="sk-topbar-btn" type="button" onClick={() => nav(-1)} aria-label="Retour">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
      </button>
      <button className="sk-topbar-logo" type="button" onClick={() => nav('/')} aria-label="Accueil Kin-Sell">
        <img src="/assets/kin-sell/logo.png" alt="Kin-Sell" className="sk-topbar-logo-img" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <span className="sk-topbar-logo-text">So-Kin</span>
      </button>
      <button className="sk-topbar-btn" type="button" onClick={() => nav('/explorer')} aria-label={t('common.search')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
      </button>
    </header>
  );
}

/* ═══════════════════════════════════════════════════
   CREATE ZONE
   ═══════════════════════════════════════════════════ */

function CreateZone({
  avatarUrl,
  displayName,
  isLoggedIn,
  onWave,
  onCreer,
}: {
  avatarUrl: string;
  displayName: string;
  isLoggedIn: boolean;
  onWave: () => void;
  onCreer: () => void;
}) {
  const nav = useNavigate();
  return (
    <section className="sk-create" aria-label="Zone de création">
      <div className="sk-create-row">
        <div className="sk-create-author">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="sk-create-avatar" />
          ) : (
            <span className="sk-create-avatar sk-create-avatar--placeholder">👤</span>
          )}
          <span className="sk-create-name">{displayName}</span>
        </div>
        <div className="sk-create-actions">
          <button className="sk-btn sk-btn--wave" type="button" onClick={() => isLoggedIn ? onWave() : nav('/login')}>
            ⚡ Wave
          </button>
          <button className="sk-btn sk-btn--creer" type="button" onClick={() => isLoggedIn ? onCreer() : nav('/login')}>
            ✏️ Créer
          </button>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   WAVE STRIP (horizontal stories)
   ═══════════════════════════════════════════════════ */

function WaveStrip({
  stories,
  t,
  onOpen,
}: {
  stories: SoKinStory[];
  t: (k: string) => string;
  onOpen: (idx: number) => void;
}) {
  if (stories.length === 0) return null;
  return (
    <section className="sk-waves" aria-label="Waves">
      <div className="sk-waves-scroll">
        {stories.slice(0, 20).map((s, i) => {
          const name = s.author.profile?.displayName ?? 'User';
          const hasMedia = Boolean(s.mediaUrl);
          return (
            <button
              key={s.id}
              type="button"
              className={`sk-wave-card${s.viewedByMe ? ' sk-wave-card--seen' : ''}`}
              onClick={() => onOpen(i)}
            >
              <div
                className="sk-wave-card-bg"
                style={hasMedia
                  ? { backgroundImage: `linear-gradient(180deg, rgba(10,8,24,0.05), rgba(10,8,24,0.86)), url(${s.mediaUrl})` }
                  : { background: s.bgColor ?? 'linear-gradient(145deg, rgba(111,88,255,0.85), rgba(36,23,82,0.96))' }
                }
              >
                <span className="sk-wave-card-label">Wave</span>
                <span className="sk-wave-card-time">{relTime(s.createdAt, t)}</span>
                <div className="sk-wave-card-author">
                  {s.author.profile?.avatarUrl
                    ? <img src={s.author.profile.avatarUrl} alt={name} className="sk-wave-card-av" />
                    : <span className="sk-wave-card-av">👤</span>
                  }
                  <strong>{name.length > 12 ? name.slice(0, 12) + '…' : name}</strong>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   POST CARD (Reddit-style)
   ═══════════════════════════════════════════════════ */

function PostCard({
  post,
  t,
  isLoggedIn,
  onReact,
  onShare,
}: {
  post: SoKinApiFeedPost;
  t: (k: string) => string;
  isLoggedIn: boolean;
  onReact: (postId: string, type: SoKinReactionType) => void;
  onShare: (postId: string) => void;
}) {
  const nav = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const lastTapRef = useRef(0);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liked, setLiked] = useState(post.myReaction === 'LIKE');
  const [doubleTapAnim, setDoubleTapAnim] = useState(false);

  const authorName = post.author.profile?.displayName ?? 'Utilisateur';
  const authorHandle = post.author.profile?.username ? `@${post.author.profile.username}` : '';
  const authorAvatar = post.author.profile?.avatarUrl ?? '';
  const authorCity = post.author.profile?.city ?? 'Kinshasa';
  const hasVideo = post.mediaUrls.some((u) => /\.(mp4|webm|mov)/i.test(u));
  const hasImage = post.mediaUrls.length > 0 && !hasVideo;

  // Autoplay video when visible
  useEffect(() => {
    const vid = videoRef.current;
    const card = cardRef.current;
    if (!vid || !card) return;
    const obs = new IntersectionObserver(
      ([e]) => { e.isIntersecting ? vid.play().catch(() => {}) : vid.pause(); },
      { threshold: 0.6 },
    );
    obs.observe(card);
    return () => obs.disconnect();
  }, []);

  // Double-tap to like
  const handleBodyTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (isLoggedIn) {
        onReact(post.id, 'LIKE');
        setLiked(true);
        setDoubleTapAnim(true);
        setTimeout(() => setDoubleTapAnim(false), 600);
      }
    }
    lastTapRef.current = now;
  };

  // Long-press speed up
  const handleTouchStart = () => {
    longPressRef.current = setTimeout(() => {
      if (videoRef.current) videoRef.current.playbackRate = 2;
    }, 500);
  };
  const handleTouchEnd = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    if (videoRef.current) videoRef.current.playbackRate = 1;
  };

  // Tap to pause/play
  const handleVideoTap = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.paused ? vid.play().catch(() => {}) : vid.pause();
  };

  const reactionEmoji = post.myReaction === 'LOVE' ? '❤️' : post.myReaction === 'HAHA' ? '😂' : post.myReaction === 'WOW' ? '😮' : post.myReaction === 'SAD' ? '😢' : post.myReaction === 'ANGRY' ? '😡' : '👍';

  return (
    <article ref={cardRef} className="sk-post" id={`sk-post-${post.id}`}>
      {/* ── Header ── */}
      <header className="sk-post-head">
        <div className="sk-post-author" onClick={() => authorHandle && nav(`/user/${authorHandle.replace('@', '')}`)}>
          {authorAvatar
            ? <img src={authorAvatar} alt={authorName} className="sk-post-avatar" />
            : <span className="sk-post-avatar sk-post-avatar--fallback">{authorName.charAt(0)}</span>
          }
          <div className="sk-post-author-info">
            <strong>{authorName}</strong>
            <span>{authorCity} · {relTime(post.createdAt, t)}</span>
          </div>
        </div>
        <div className="sk-post-head-actions">
          <button type="button" className="sk-post-action-btn" onClick={() => nav(`/messages?contact=${encodeURIComponent(authorHandle)}`)} title="Contacter">📱</button>
          <button type="button" className="sk-post-action-btn" title="Favori">⭐</button>
          <button type="button" className="sk-post-action-btn" title="Signaler">⚠️</button>
        </div>
      </header>

      {/* ── Body ── */}
      <div
        className="sk-post-body"
        onClick={handleBodyTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {post.text && <p className="sk-post-text">{post.text}</p>}

        {hasVideo && (
          <div className="sk-post-media" onClick={handleVideoTap}>
            <video
              ref={videoRef}
              src={post.mediaUrls.find((u) => /\.(mp4|webm|mov)/i.test(u))}
              loop
              muted
              playsInline
              preload="metadata"
              className="sk-post-video"
            />
          </div>
        )}

        {hasImage && !hasVideo && (
          <div className="sk-post-media">
            {post.mediaUrls.length === 1 ? (
              <img src={post.mediaUrls[0]} alt="" className="sk-post-image" />
            ) : (
              <div className="sk-post-gallery">
                {post.mediaUrls.map((url, i) => (
                  <img key={i} src={url} alt="" className="sk-post-gallery-img" />
                ))}
              </div>
            )}
          </div>
        )}

        {doubleTapAnim && <span className="sk-post-heart-anim">❤️</span>}
      </div>

      {/* ── Footer ── */}
      <footer className="sk-post-foot">
        <div className="sk-post-reactions">
          <button
            type="button"
            className={`sk-post-react-btn${post.myReaction ? ' sk-post-react-btn--active' : ''}`}
            onClick={() => onReact(post.id, post.myReaction ?? 'LIKE')}
          >
            {reactionEmoji} {post.likes > 0 && post.likes}
          </button>
          <button
            type="button"
            className="sk-post-react-btn"
            onClick={() => onReact(post.id, 'SAD')}
            title="Je n'aime pas"
          >
            👎
          </button>
        </div>
        <button type="button" className="sk-post-foot-btn" title="Écrire">
          💬 {post.comments > 0 && post.comments}
        </button>
        <button
          type="button"
          className="sk-post-foot-btn"
          onClick={() => onShare(post.id)}
          title="Partager"
        >
          🔁 {post.shares > 0 && post.shares}
        </button>
      </footer>
    </article>
  );
}

/* ═══════════════════════════════════════════════════
   POST FEED (infinite scroll, ads every 4)
   ═══════════════════════════════════════════════════ */

function PostFeed({
  posts,
  hasMore,
  loading,
  sentinelRef,
  t,
  isLoggedIn,
  onReact,
  onShare,
}: {
  posts: SoKinApiFeedPost[];
  hasMore: boolean;
  loading: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  t: (k: string) => string;
  isLoggedIn: boolean;
  onReact: (postId: string, type: SoKinReactionType) => void;
  onShare: (postId: string) => void;
}) {
  const items: React.ReactNode[] = [];
  posts.forEach((post, idx) => {
    items.push(
      <PostCard key={post.id} post={post} t={t} isLoggedIn={isLoggedIn} onReact={onReact} onShare={onShare} />,
    );
    if ((idx + 1) % 4 === 0) {
      items.push(<AdBanner key={`ad-${idx}`} page="sokin" variant="slim" hideWhenEmpty />);
    }
    if ((idx + 1) % 6 === 0) {
      items.push(<SmartAdSlot key={`ia-ad-${idx}`} pageKey="sokin" componentKey="feed_inline" variant="inline" />);
    }
  });

  return (
    <section className="sk-feed" aria-label="Fil d'annonces">
      <h2 className="sk-feed-title">📢 Annonces</h2>
      {loading && posts.length === 0 ? (
        <div className="sk-feed-loading">
          {[1, 2].map((i) => <div key={i} className="sk-skeleton" />)}
        </div>
      ) : posts.length === 0 ? (
        <div className="sk-feed-empty">
          <p>{t('sokin.noPostYet')}</p>
        </div>
      ) : (
        items
      )}
      {hasMore && <div ref={sentinelRef as React.RefObject<HTMLDivElement>} className="sk-sentinel" />}
    </section>
  );
}

/* ═══════════════════════════════════════════════════
   CREATOR BOTTOM SHEET (Wave / Créer)
   ═══════════════════════════════════════════════════ */

function CreatorSheet({
  mode,
  isPublishing,
  publishError,
  onClose,
  onPublish,
  t,
}: {
  mode: 'wave' | 'post';
  isPublishing: boolean;
  publishError?: string | null;
  onClose: () => void;
  onPublish: (data: {
    text: string;
    mediaFiles: File[];
    location: string;
    tags: string[];
    hashtags: string[];
    bgColor: string;
    scheduledAt: string;
  }) => void;
  t: (k: string) => string;
}) {
  const [text, setText] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [location, setLocation] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [hashInput, setHashInput] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [bgColor, setBgColor] = useState('#241752');
  const [scheduleDate, setScheduleDate] = useState('');
  const [step, setStep] = useState<'content' | 'edit'>('content');
  const fileRef = useRef<HTMLInputElement>(null);

  const isTextOnly = mediaFiles.length === 0;

  const addTag = () => {
    const v = tagInput.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setTagInput('');
  };

  const addHashtag = () => {
    const v = hashInput.trim().replace('#', '');
    if (v && !hashtags.includes(v)) setHashtags([...hashtags, v]);
    setHashInput('');
  };

  const handleSubmit = () => {
    if (!text.trim() && mediaFiles.length === 0) return;
    onPublish({ text, mediaFiles, location, tags, hashtags, bgColor, scheduledAt: scheduleDate });
  };

  return (
    <div className="sk-sheet-overlay sk-sheet-overlay--fullscreen" onClick={onClose}>
      <div className="sk-sheet sk-sheet--fullscreen" onClick={(e) => e.stopPropagation()}>
        <div className="sk-sheet-head">
          <h3>{mode === 'wave' ? '⚡ Nouvelle Wave (24h)' : '✏️ Nouvelle Publication'}</h3>
          <button type="button" className="sk-sheet-close" onClick={onClose}>✕</button>
        </div>

        {step === 'content' ? (
          <div className="sk-sheet-body">
            {publishError && (
              <div className="sk-sheet-error">
                ⚠️ {publishError}
              </div>
            )}
            <textarea
              className="sk-sheet-input"
              placeholder={mode === 'wave' ? 'Quoi de neuf ? (disparaît en 24h)' : 'Écrivez votre publication…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={mode === 'wave' ? 180 : 500}
            />
            <span className="sk-sheet-char-count">{text.length}/{mode === 'wave' ? 180 : 500}</span>

            {/* Media picker */}
            <div className="sk-sheet-media-row">
              <button type="button" className="sk-btn sk-btn--sm" onClick={() => fileRef.current?.click()}>
                📷 Photo/Vidéo
              </button>
              {mediaFiles.length > 0 && (
                <span className="sk-sheet-media-count">{mediaFiles.length} fichier(s)</span>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,video/*,.gif"
                hidden
                onChange={(e) => {
                  if (e.target.files) setMediaFiles([...mediaFiles, ...Array.from(e.target.files)]);
                }}
              />
            </div>

            {/* Bg color for text-only waves */}
            {mode === 'wave' && isTextOnly && (
              <div className="sk-sheet-colors">
                <span className="sk-sheet-label">Fond :</span>
                {WAVE_BG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`sk-color-dot${bgColor === c ? ' sk-color-dot--active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setBgColor(c)}
                  />
                ))}
              </div>
            )}

            <div className="sk-sheet-actions-row">
              <button type="button" className="sk-btn sk-btn--outline" onClick={() => setStep('edit')}>
                📍 Éditer détails
              </button>
              <button
                type="button"
                className="sk-btn sk-btn--primary"
                onClick={handleSubmit}
                disabled={isPublishing || (!text.trim() && mediaFiles.length === 0)}
              >
                {isPublishing ? '⏳' : '🚀'} {mode === 'wave' ? 'Publier Wave' : 'Publier'}
              </button>
            </div>
          </div>
        ) : (
          <div className="sk-sheet-body">
            <label className="sk-sheet-label">📍 Localisation</label>
            <input
              type="text"
              className="sk-sheet-field"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Gombe, Kinshasa"
            />

            <label className="sk-sheet-label">🏷️ Tags</label>
            <div className="sk-sheet-tag-row">
              <input
                type="text"
                className="sk-sheet-field sk-sheet-field--flex"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Ajouter un tag"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              />
              <button type="button" className="sk-btn sk-btn--sm" onClick={addTag}>+</button>
            </div>
            {tags.length > 0 && (
              <div className="sk-sheet-chips">
                {tags.map((tg) => (
                  <span key={tg} className="sk-chip">
                    {tg} <button type="button" onClick={() => setTags(tags.filter((x) => x !== tg))}>✕</button>
                  </span>
                ))}
              </div>
            )}

            <label className="sk-sheet-label"># Hashtags</label>
            <div className="sk-sheet-tag-row">
              <input
                type="text"
                className="sk-sheet-field sk-sheet-field--flex"
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                placeholder="Sans le #"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHashtag(); } }}
              />
              <button type="button" className="sk-btn sk-btn--sm" onClick={addHashtag}>+</button>
            </div>
            {hashtags.length > 0 && (
              <div className="sk-sheet-chips">
                {hashtags.map((h) => (
                  <span key={h} className="sk-chip">
                    #{h} <button type="button" onClick={() => setHashtags(hashtags.filter((x) => x !== h))}>✕</button>
                  </span>
                ))}
              </div>
            )}

            <label className="sk-sheet-label">📅 Programmer (max {MAX_SCHEDULE_DAYS}j)</label>
            <input
              type="datetime-local"
              className="sk-sheet-field"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              max={new Date(Date.now() + MAX_SCHEDULE_DAYS * 86400_000).toISOString().slice(0, 16)}
            />

            <div className="sk-sheet-actions-row">
              <button type="button" className="sk-btn sk-btn--outline" onClick={() => setStep('content')}>
                ← Retour
              </button>
              <button
                type="button"
                className="sk-btn sk-btn--primary"
                onClick={handleSubmit}
                disabled={isPublishing || (!text.trim() && mediaFiles.length === 0)}
              >
                {isPublishing ? '⏳' : '🚀'} {scheduleDate ? 'Programmer' : mode === 'wave' ? 'Publier Wave' : 'Publier'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   STORY VIEWER (fullscreen)
   ═══════════════════════════════════════════════════ */

function StoryViewer({
  stories,
  startIndex,
  t,
  onClose,
  isLoggedIn,
}: {
  stories: SoKinStory[];
  startIndex: number;
  t: (k: string) => string;
  onClose: () => void;
  isLoggedIn: boolean;
}) {
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const story = stories[index];
  if (!story) return null;

  const name = story.author.profile?.displayName ?? 'Utilisateur';

  // Auto-advance for non-video
  useEffect(() => {
    if (story.mediaType === 'VIDEO' || paused) return;
    const timer = setTimeout(() => {
      if (index < stories.length - 1) setIndex(index + 1);
      else onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [index, paused, story.mediaType, stories.length, onClose]);

  // Mark as viewed
  useEffect(() => {
    if (isLoggedIn && !story.viewedByMe) {
      void sokinApi.viewStory(story.id).catch(() => {});
    }
  }, [story.id, story.viewedByMe, isLoggedIn]);

  return (
    <div className="sk-story-overlay" onClick={onClose}>
      <div
        className="sk-story-viewer"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={(e) => {
          setPaused(true);
          const t = e.changedTouches[0];
          touchRef.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          setPaused(false);
          const start = touchRef.current;
          const t = e.changedTouches[0];
          if (!start) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (dy > 90) { onClose(); return; }
          if (dx > 80) setIndex((n) => Math.max(0, n - 1));
          if (dx < -80) setIndex((n) => Math.min(stories.length - 1, n + 1));
        }}
        style={story.mediaType === 'TEXT' ? { background: story.bgColor ?? '#241752' } : undefined}
      >
        {/* Progress bars */}
        <div className="sk-story-progress">
          {stories.map((s, i) => (
            <span key={s.id} className={`sk-story-bar${i === index ? ' active' : ''}${i < index ? ' done' : ''}`} />
          ))}
        </div>

        {/* Header */}
        <div className="sk-story-head">
          <div className="sk-story-author">
            {story.author.profile?.avatarUrl
              ? <img src={story.author.profile.avatarUrl} alt={name} />
              : <span>👤</span>
            }
            <div>
              <strong>{name}</strong>
              <span>{relTime(story.createdAt, t)} · {story.viewCount} vues</span>
            </div>
          </div>
          <button type="button" className="sk-story-close" onClick={onClose}>✕</button>
        </div>

        {/* Stage */}
        <div className="sk-story-stage">
          {story.mediaType !== 'TEXT' && story.mediaUrl ? (
            story.mediaType === 'VIDEO'
              ? <video src={story.mediaUrl} controls autoPlay playsInline />
              : <img src={story.mediaUrl} alt="Wave" />
          ) : (
            <div className="sk-story-text-stage">
              <p>{story.caption ?? ''}</p>
            </div>
          )}
        </div>

        {story.mediaType !== 'TEXT' && story.caption && (
          <p className="sk-story-caption">{story.caption}</p>
        )}

        {/* Nav hotspots */}
        <button type="button" className="sk-story-hot sk-story-hot--prev" disabled={index <= 0} onClick={() => setIndex((n) => Math.max(0, n - 1))} aria-label="Précédente" />
        <button type="button" className="sk-story-hot sk-story-hot--next" disabled={index >= stories.length - 1} onClick={() => setIndex((n) => Math.min(stories.length - 1, n + 1))} aria-label="Suivante" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   BOTTOM NAV (So-Kin variant: Live au centre)
   ═══════════════════════════════════════════════════ */

function SoKinBottomNav({
  hidden,
  notifCount,
  t,
}: {
  hidden: boolean;
  notifCount: number;
  t: (k: string) => string;
}) {
  const nav = useNavigate();
  const { user } = useAuth();
  const dashPath = getDashboardPath(user?.role);

  return (
    <nav className={`sk-bottomnav${hidden ? ' sk-bottomnav--hidden' : ''}`} aria-label="Navigation So-Kin">
      <button className="sk-bnav-item" type="button" onClick={() => nav('/')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>
        <span>Accueil</span>
      </button>

      <button className="sk-bnav-item" type="button" onClick={() => nav('/cart')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
        <span>{t('nav.cart')}</span>
      </button>

      {/* Centre: LIVE button */}
      <button className="sk-bnav-live" type="button" onClick={() => nav('/sokin/live')} aria-label="So-Kin Live">
        <span className="sk-bnav-live-dot" />
        <span className="sk-bnav-live-text">Live</span>
      </button>

      <button className="sk-bnav-item" type="button" onClick={() => { sessionStorage.setItem('ud-section', 'notifications'); nav(dashPath); }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {notifCount > 0 && <span className="sk-bnav-badge">{notifCount}</span>}
        <span>{t('nav.notifications')}</span>
      </button>

      <button className="sk-bnav-item" type="button" onClick={() => nav(dashPath)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        <span>Compte</span>
      </button>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN: SoKinPage
   ═══════════════════════════════════════════════════ */

export function SoKinPage() {
  const isMobileOrTablet = useIsMobile(1023);
  if (!isMobileOrTablet) return <SoKinPageDesktop />;
  return <SoKinPageMobile />;
}

function SoKinPageMobile() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const { t } = useLocaleCurrency();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const defaultCity = getCountryConfig(effectiveCountry).defaultCity;
  const { on, off } = useSocket();
  const isMobile = useIsMobile();
  const scrollDir = useScrollDirection();

  // ── State ──
  const [posts, setPosts] = useState<SoKinApiFeedPost[]>([]);
  const [stories, setStories] = useState<SoKinStory[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [notifCount, setNotifCount] = useState(0);

  // Creator state
  const [creatorMode, setCreatorMode] = useState<'wave' | 'post' | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Story viewer
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);

  // ── Data loading ──
  const loadFeed = useCallback(
    async (reset = false) => {
      if (loadingRef.current && !reset) return;
      loadingRef.current = true;
      try {
        const res = await sokinApi.publicFeed({ limit: 12, city: defaultCity, country: effectiveCountry });
        if (reset) {
          setPosts(res.posts);
        } else {
          setPosts((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            return [...prev, ...res.posts.filter((p) => !ids.has(p.id))];
          });
        }
        if (res.posts.length < 12) setHasMore(false);
      } catch { /* */ }
      finally { setLoadingFeed(false); loadingRef.current = false; }
    },
    [defaultCity, effectiveCountry],
  );

  const loadStories = useCallback(async () => {
    try {
      const data = await sokinApi.stories();
      setStories(data.stories);
    } catch { setStories([]); }
  }, []);

  useEffect(() => { setLoadingFeed(true); void loadFeed(true); }, [loadFeed]);
  useEffect(() => {
    void loadStories();
    const timer = setInterval(loadStories, 45_000);
    return () => clearInterval(timer);
  }, [loadStories]);

  // Socket listeners
  useEffect(() => {
    const handlePost = (payload: { sourceUserId?: string }) => {
      // Skip own posts — already added to local state via handlePublish
      if (payload?.sourceUserId === user?.id) return;
      void loadFeed(true);
    };
    const handleStory = (payload: { sourceUserId?: string }) => {
      if (payload?.sourceUserId === user?.id) return;
      void loadStories();
    };
    const handleShare = (p: { postId: string; shares: number }) => {
      setPosts((prev) => prev.map((post) => post.id === p.postId ? { ...post, shares: p.shares } : post));
    };
    const handleReacted = (payload: { postId: string; type: string; sourceUserId: string }) => {
      if (payload.sourceUserId === user?.id) return;
      setPosts((prev) => prev.map((p) => {
        if (p.id !== payload.postId) return p;
        const counts = { ...p.reactionCounts } as Record<string, number>;
        counts[payload.type] = (counts[payload.type] ?? 0) + 1;
        return { ...p, reactionCounts: counts as typeof p.reactionCounts, likes: p.likes + 1 };
      }));
    };
    const handleUnreacted = (payload: { postId: string; sourceUserId: string }) => {
      if (payload.sourceUserId === user?.id) return;
      setPosts((prev) => prev.map((p) => {
        if (p.id !== payload.postId) return p;
        return { ...p, likes: Math.max(0, p.likes - 1) };
      }));
    };
    on('sokin:post-created', handlePost);
    on('sokin:story-created', handleStory);
    on('sokin:post-shared', handleShare);
    on('sokin:post-reacted', handleReacted);
    on('sokin:post-unreacted', handleUnreacted);
    return () => { off('sokin:post-created', handlePost); off('sokin:story-created', handleStory); off('sokin:post-shared', handleShare); off('sokin:post-reacted', handleReacted); off('sokin:post-unreacted', handleUnreacted); };
  }, [on, off, loadFeed, loadStories, user?.id]);

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && !loadingRef.current) void loadFeed(); },
      { rootMargin: '200px' },
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadFeed]);



  // ── Handlers ──
  const handleReaction = async (postId: string, type: SoKinReactionType) => {
    if (!isLoggedIn) return;
    const post = posts.find((p) => p.id === postId);
    try {
      if (post?.myReaction === type) {
        await sokinApi.unreactToPost(postId);
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, myReaction: null, likes: Math.max(0, p.likes - 1) } : p));
      } else {
        await sokinApi.reactToPost(postId, type);
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, myReaction: type, likes: p.likes + (p.myReaction ? 0 : 1) } : p));
      }
    } catch { /* */ }
  };

  const handleShare = async (postId: string) => {
    if (!isLoggedIn) return;
    const shareUrl = `${window.location.origin}/sokin?post=${encodeURIComponent(postId)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'So-Kin', url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      const res = await sokinApi.sharePost(postId);
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, shares: res.shares } : p));
    } catch { /* */ }
  };

  const handlePublish = async (data: {
    text: string;
    mediaFiles: File[];
    location: string;
    tags: string[];
    hashtags: string[];
    bgColor: string;
    scheduledAt: string;
  }) => {
    if (isPublishing || !isLoggedIn) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const scheduledAtIso = data.scheduledAt ? new Date(data.scheduledAt).toISOString() : undefined;

      if (creatorMode === 'wave') {
        // Create as story (Wave = 24h)
        const mediaUrl = data.mediaFiles.length > 0 ? await prepareMediaUrl(data.mediaFiles[0]) : undefined;
        const mediaType = data.mediaFiles.length > 0
          ? (data.mediaFiles[0].type.startsWith('video/') ? 'VIDEO' : 'IMAGE')
          : 'TEXT';
        const created = await sokinApi.createStory({
          mediaUrl,
          mediaType,
          caption: data.text || undefined,
          bgColor: mediaType === 'TEXT' ? data.bgColor : undefined,
          scheduledAt: scheduledAtIso,
        });
        setStories((prev) => [created, ...prev]);
      } else {
        // Create as post (permanent)
        const mediaUrls = data.mediaFiles.length > 0 ? await prepareMediaUrls(data.mediaFiles) : undefined;
        const newPost = await sokinApi.createPost({
          text: data.text,
          mediaUrls,
          location: data.location || undefined,
          tags: data.tags.length > 0 ? data.tags : undefined,
          hashtags: data.hashtags.length > 0 ? data.hashtags : undefined,
          scheduledAt: scheduledAtIso,
        });
        // Add to feed immediately (only if not scheduled)
        if (!scheduledAtIso) {
          setPosts((prev) => [{
            ...newPost,
            author: {
              id: newPost.authorId,
              profile: {
                username: user?.profile.username ?? null,
                displayName: user?.profile.displayName ?? 'Moi',
                avatarUrl: user?.profile.avatarUrl ?? null,
                city: user?.profile.city ?? null,
              },
            },
            reactionCounts: {},
            myReaction: null,
          }, ...prev]);
        }
      }
      setCreatorMode(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Échec de la publication. Veuillez réessayer.';
      setPublishError(msg);
    } finally { setIsPublishing(false); }
  };

  const openStoryViewer = async (index: number) => {
    setStoryViewerIndex(index);
    setStoryViewerOpen(true);
  };

  const currentName = user?.profile.displayName ?? 'Vous';
  const currentAvatar = user?.profile.avatarUrl ?? '';

  return (
    <>
      <SeoMeta
        title="So-Kin — Le réseau social de Kinshasa"
        description="Partagez vos actualités, suivez vos contacts et découvrez les lives et tendances sur So-Kin, le réseau social de Kin-Sell."
        canonical="https://kin-sell.com/sokin"
      />

      <div className="sk-page">
        <SoKinTopBar t={t} />

        <CreateZone
          avatarUrl={currentAvatar}
          displayName={currentName}
          isLoggedIn={isLoggedIn}
          onWave={() => setCreatorMode('wave')}
          onCreer={() => setCreatorMode('post')}
        />

        <WaveStrip stories={stories} t={t} onOpen={openStoryViewer} />

        <PostFeed
          posts={posts}
          hasMore={hasMore}
          loading={loadingFeed}
          sentinelRef={sentinelRef}
          t={t}
          isLoggedIn={isLoggedIn}
          onReact={handleReaction}
          onShare={handleShare}
        />

        <div className="sk-bottom-spacer" aria-hidden="true" />

        {isMobile && (
          <SoKinBottomNav hidden={scrollDir === 'down'} notifCount={notifCount} t={t} />
        )}
      </div>

      {/* Creator bottom sheet */}
      {creatorMode && (
        <CreatorSheet
          mode={creatorMode}
          isPublishing={isPublishing}
          publishError={publishError}
          onClose={() => { setCreatorMode(null); setPublishError(null); }}
          onPublish={handlePublish}
          t={t}
        />
      )}

      {/* Story viewer */}
      {storyViewerOpen && (
        <StoryViewer
          stories={stories}
          startIndex={storyViewerIndex}
          t={t}
          onClose={() => setStoryViewerOpen(false)}
          isLoggedIn={isLoggedIn}
        />
      )}
    </>
  );
}
