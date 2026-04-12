/**
 * AnnounceCard — Composant partagé de carte So-Kin
 *
 * Utilisé dans SoKinPage ET HomePage pour un rendu identique.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  sokin as sokinApi,
  resolveMediaUrl,
  type SoKinApiFeedPost,
  type SoKinPostType,
  type SoKinReactionType,
  type SoKinReportReason,
} from '../../lib/api-client';
import { API_BASE } from '../../lib/api-core';
import { useSoKinToast } from '../../components/feedback/SoKinToast';
import { observePostView, trackSoKinEvent } from '../../lib/services/sokin-tracking.service';
import { resolveBackgroundCss } from './sokin-backgrounds';
import type { PostInsight, PostInsightCard, BoostPostStats } from '../../lib/services/sokin-analytics.service';

let activeVideoEl: HTMLVideoElement | null = null;
let visibilityListenerAttached = false;

function safePlayVideo(video: HTMLVideoElement): void {
  try {
    // Pré-charger avant de jouer
    if (video.preload !== 'auto') video.preload = 'auto';
    const maybePromise = video.play();
    if (maybePromise && typeof (maybePromise as Promise<void>).catch === 'function') {
      (maybePromise as Promise<void>).catch(() => undefined);
    }
    // Ajouter la classe playing pour masquer l'icône play
    video.closest('.sk-media-item--video')?.classList.add('sk-video-playing');
  } catch {
    // ignore autoplay errors
  }
}

function pauseVideo(video: HTMLVideoElement): void {
  try {
    video.pause();
    video.closest('.sk-media-item--video')?.classList.remove('sk-video-playing');
  } catch {
    // ignore pause errors
  }
}

function ensureVideoVisibilityListener(): void {
  if (visibilityListenerAttached || typeof document === 'undefined') return;
  visibilityListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !activeVideoEl) return;
    pauseVideo(activeVideoEl);
    activeVideoEl = null;
  });
}

/* ─────────────────────────────────────────────────────── */
/* TYPES                                                    */
/* ─────────────────────────────────────────────────────── */

export type MediaItem = { url: string; type: 'image' | 'video' | 'audio' };

/* ─────────────────────────────────────────────────────── */
/* CONSTANTS                                                */
/* ─────────────────────────────────────────────────────── */

export const POST_TYPE_META: Record<SoKinPostType, { label: string; icon: string; placeholder: string }> = {
  SHOWCASE:   { label: 'Showcase',   icon: '📸', placeholder: 'Partagez un moment, une découverte…' },
  DISCUSSION: { label: 'Discussion', icon: '💬', placeholder: 'Lancez un sujet, échangez avec la communauté…' },
  QUESTION:   { label: 'Question',   icon: '❓', placeholder: 'Posez votre question à la communauté…' },
  SELLING:    { label: 'Vente',      icon: '🛍️', placeholder: 'Décrivez ce que vous vendez…' },
  PROMO:      { label: 'Promo',      icon: '🏷️', placeholder: 'Partagez votre offre ou promotion…' },
  SEARCH:     { label: 'Recherche',  icon: '🔎', placeholder: 'Décrivez ce que vous recherchez…' },
  UPDATE:     { label: 'Actualité',  icon: '🔄', placeholder: 'Quoi de neuf ?…' },
  REVIEW:     { label: 'Avis',       icon: '📝', placeholder: 'Partagez votre avis sur un produit ou service…' },
  TREND:      { label: 'Tendance',   icon: '🔥', placeholder: "Qu'est-ce qui buzze à Kinshasa ?…" },
};

export const COMMERCIAL_TYPES = ['SELLING', 'PROMO', 'SHOWCASE'] as const;

export const REPORT_REASONS: { value: SoKinReportReason; label: string; icon: string }[] = [
  { value: 'SPAM', label: 'Spam', icon: '🚫' },
  { value: 'HARASSMENT', label: 'Harcèlement', icon: '😤' },
  { value: 'HATE_SPEECH', label: 'Discours haineux', icon: '🗯️' },
  { value: 'VIOLENCE', label: 'Violence', icon: '⚠️' },
  { value: 'NUDITY', label: 'Nudité', icon: '🔞' },
  { value: 'SCAM', label: 'Arnaque', icon: '💸' },
  { value: 'MISINFORMATION', label: 'Désinformation', icon: '📰' },
  { value: 'OTHER', label: 'Autre', icon: '❓' },
];

/* ─────────────────────────────────────────────────────── */
/* HELPERS                                                  */
/* ─────────────────────────────────────────────────────── */

export function relTime(iso: string, t: (k: string) => string): string {
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

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(url);
}

export function isAudioUrl(url: string): boolean {
  return /\.(mp3)(\?.*)?$/i.test(url);
}

export function categorizeMedia(urls: string[]): MediaItem[] {
  const limited = (urls ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 5);
  let videoCount = 0;
  const items: MediaItem[] = [];

  for (const url of limited) {
    if (isVideoUrl(url)) {
      if (videoCount >= 2) {
        continue;
      }
      videoCount++;
      items.push({ url, type: 'video' });
      continue;
    }

    if (isAudioUrl(url)) {
      items.push({ url, type: 'audio' });
      continue;
    }

    items.push({ url, type: 'image' });
  }

  return items;
}

const tagTargetCache = new Map<string, string>();

async function resolvePublicTagTarget(handleRaw: string): Promise<string> {
  const handle = handleRaw.replace(/^@/, '').trim();
  if (!handle) return '/';
  const cached = tagTargetCache.get(handle);
  if (cached) return cached;

  try {
    const encoded = encodeURIComponent(handle);
    const userByUsername = await fetch(`${API_BASE}/users/public/${encoded}`, { credentials: 'include' });
    if (userByUsername.ok) {
      const path = `/user/${handle}`;
      tagTargetCache.set(handle, path);
      return path;
    }
    const userById = await fetch(`${API_BASE}/users/${encoded}/public`, { credentials: 'include' });
    if (userById.ok) {
      const path = `/user/${handle}`;
      tagTargetCache.set(handle, path);
      return path;
    }
    const businessBySlug = await fetch(`${API_BASE}/business-accounts/${encoded}`, { credentials: 'include' });
    if (businessBySlug.ok) {
      const path = `/business/${handle}`;
      tagTargetCache.set(handle, path);
      return path;
    }
  } catch {
    // ignore and fallback below
  }

  const fallback = `/user/${handle}`;
  tagTargetCache.set(handle, fallback);
  return fallback;
}

/**
 * Parse le texte d'un post et transforme les @mentions et #hashtags en éléments cliquables.
 */
function renderPostText(
  text: string,
  onMention: (handle: string) => void,
  onHashtag: (tag: string) => void,
): React.ReactNode[] {
  const parts = text.split(/(@[\w.]+|#[\w\u00C0-\u024F]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      const handle = part.slice(1);
      return (
        <button
          key={i}
          type="button"
          className="sk-inline-mention"
          onClick={(e) => { e.stopPropagation(); onMention(handle); }}
        >
          {part}
        </button>
      );
    }
    if (part.startsWith('#') && part.length > 1) {
      const tag = part.slice(1);
      return (
        <button
          key={i}
          type="button"
          className="sk-inline-hashtag"
          onClick={(e) => { e.stopPropagation(); onHashtag(tag); }}
        >
          {part}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/* ─────────────────────────────────────────────────────── */
/* ICÔNES SVG INLINE                                        */
/* ─────────────────────────────────────────────────────── */

export function IconMessage() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconHeart({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#ff4d6a" stroke="#ff4d6a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function IconComment() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconRepost() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function IconBookmark({ filled }: { filled?: boolean }) {
  return filled ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconMoreHoriz() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────── */
/* VIDEO ITEM — boucle, vitesse ×1.5, double-tap ±10s      */
/* ─────────────────────────────────────────────────────── */

function VideoItem({
  item,
  index,
  isAutoPlay,
  onVideoRef,
  onVideoToggle,
  updateSingleLayout,
}: {
  item: MediaItem;
  index: number;
  isAutoPlay: boolean;
  onVideoRef?: (el: HTMLVideoElement | null, item: MediaItem, index: number) => void;
  onVideoToggle?: (videoEl: HTMLVideoElement, item: MediaItem) => void;
  updateSingleLayout: (w: number, h: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right' }>();
  const holdTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isSpeedingRef = useRef(false);
  const downXRef = useRef(0);
  const speedRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    onVideoRef?.(el, item, index);
  }, [onVideoRef, item, index]);

  const getSide = useCallback((clientX: number, el: HTMLElement): 'left' | 'right' => {
    const rect = el.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? 'left' : 'right';
  }, []);

  const showSkip = useCallback((text: string, side: 'left' | 'right') => {
    const el = skipRef.current;
    if (!el) return;
    el.textContent = text;
    el.dataset.side = side;
    el.classList.remove('sk-skip-active');
    void el.offsetWidth; // force reflow for re-trigger
    el.classList.add('sk-skip-active');
  }, []);

  const releaseSpeed = useCallback(() => {
    if (!isSpeedingRef.current) return;
    isSpeedingRef.current = false;
    const v = videoRef.current;
    if (v) v.playbackRate = 1.0;
    speedRef.current?.classList.remove('sk-speed-active');
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    downXRef.current = e.clientX;
    const video = videoRef.current;
    if (!video || video.paused) return;
    holdTimerRef.current = setTimeout(() => {
      isSpeedingRef.current = true;
      video.playbackRate = 1.5;
      speedRef.current?.classList.add('sk-speed-active');
    }, 300);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = undefined; }
    const video = videoRef.current;
    if (!video) return;

    if (isSpeedingRef.current) { releaseSpeed(); return; }

    const side = getSide(downXRef.current, e.currentTarget);
    const now = Date.now();
    const last = lastTapRef.current;

    if (last && now - last.time < 300 && last.side === side) {
      lastTapRef.current = undefined;
      if (tapTimerRef.current) { clearTimeout(tapTimerRef.current); tapTimerRef.current = undefined; }
      if (side === 'left') {
        video.currentTime = Math.max(0, video.currentTime - 10);
        showSkip('-10s', 'left');
      } else {
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
        showSkip('+10s', 'right');
      }
      return;
    }

    lastTapRef.current = { time: now, side };
    tapTimerRef.current = setTimeout(() => {
      lastTapRef.current = undefined;
      tapTimerRef.current = undefined;
      if (onVideoToggle) onVideoToggle(video, item);
    }, 300);
  }, [getSide, releaseSpeed, onVideoToggle, item, showSkip]);

  const handleProgressSeek = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
  }, []);

  return (
    <>
      <video
        src={resolveMediaUrl(item.url)}
        ref={setVideoRef}
        loop
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          const fill = v.parentElement?.querySelector('.sk-video-progress') as HTMLElement | null;
          if (fill && v.duration) fill.style.width = `${(v.currentTime / v.duration) * 100}%`;
        }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          updateSingleLayout(v.videoWidth, v.videoHeight);
        }}
        data-autoplay={isAutoPlay ? 'true' : undefined}
        playsInline
        preload="none"
        disablePictureInPicture
        tabIndex={-1}
      />
      <div
        className="sk-video-gesture-overlay"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); releaseSpeed(); }}
        onPointerLeave={() => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); releaseSpeed(); }}
        onClick={(e) => e.stopPropagation()}
      />
      <div ref={speedRef} className="sk-speed-indicator">▶▶ 1.5×</div>
      <div ref={skipRef} className="sk-skip-indicator" />
      <span className="sk-media-play-icon" aria-hidden="true">&#9654;</span>
      <div className="sk-video-progress-bar" onPointerDown={handleProgressSeek} onClick={(e) => e.stopPropagation()}>
        <div className="sk-video-progress" style={{ width: 0 }} />
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────── */
/* MEDIA COLLAGE                                            */
/* ─────────────────────────────────────────────────────── */

export function MediaCollage({
  items,
  onItemClick,
  onVideoToggle,
  onVideoRef,
  autoPlayVideoIndex,
}: {
  items: MediaItem[];
  onItemClick: (item: MediaItem) => void;
  onVideoToggle?: (videoEl: HTMLVideoElement, item: MediaItem) => void;
  onVideoRef?: (videoEl: HTMLVideoElement | null, item: MediaItem, index: number) => void;
  autoPlayVideoIndex?: number;
}) {
  const count = items.length;
  // Store the real aspect ratio of the media for a pixel-perfect container
  const [singleAspectRatio, setSingleAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    setSingleAspectRatio(null);
  }, [items]);

  const updateSingleLayout = useCallback((width: number, height: number) => {
    if (count !== 1 || width <= 0 || height <= 0) return;
    setSingleAspectRatio(width / height);
  }, [count]);

  if (count === 0) return null;

  // Clamp ratio for safety: min 9/16 (0.5625), max 16/9 (1.78)
  const clampedRatio = singleAspectRatio
    ? Math.max(0.5625, Math.min(1.78, singleAspectRatio))
    : null;

  // Determine max-height based on orientation
  const singleMaxHeight = clampedRatio
    ? clampedRatio < 0.92 ? '80vh' : clampedRatio > 1.08 ? '56vh' : '70vh'
    : undefined;

  return (
    <div
      className={`sk-media-grid sk-media-grid--${count}${count === 1 ? ' sk-media-grid--single' : ''}`}
      style={count === 1 && clampedRatio ? { aspectRatio: `${clampedRatio}`, maxHeight: singleMaxHeight } : undefined}
      role="group"
      aria-label="Médias de l'annonce"
    >
      {items.map((item, i) => {
        const isAutoPlay = i === autoPlayVideoIndex;
        return (
          <button
            key={i}
            type="button"
            className={`sk-media-item${item.type === 'video' ? ' sk-media-item--video' : ''}${item.type === 'audio' ? ' sk-media-item--audio' : ''}`}
            onClick={() => {
              if (item.type === 'video') return;
              onItemClick(item);
            }}
            aria-label={item.type === 'video' ? 'Voir la vidéo' : item.type === 'audio' ? "Écouter l'audio" : "Voir l'image"}
          >
            {item.type === 'video' ? (
              <VideoItem
                item={item}
                index={i}
                isAutoPlay={isAutoPlay}
                onVideoRef={onVideoRef}
                onVideoToggle={onVideoToggle}
                updateSingleLayout={updateSingleLayout}
              />
            ) : item.type === 'audio' ? (
              <audio
                src={resolveMediaUrl(item.url)}
                controls
                preload="metadata"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                src={resolveMediaUrl(item.url)}
                alt=""
                loading="lazy"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  updateSingleLayout(img.naturalWidth, img.naturalHeight);
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* ANNOUNCE CARD — composant principal                      */
/* ─────────────────────────────────────────────────────── */

export type AnnounceCardProps = {
  post: SoKinApiFeedPost;
  t: (k: string) => string;
  isLoggedIn: boolean;
  onMediaClick: (item: MediaItem) => void;
  isCommentsOpen: boolean;
  onOpenComments: () => void;
  onContact: () => void;
  isContacting: boolean;
  postInsight?: PostInsight | PostInsightCard | null;
  onLoadInsight?: () => void;
  isAuthor?: boolean;
  feedSource?: string;
  onRepost?: (post: SoKinApiFeedPost) => void;
  onToggle?: (postId: string) => void;
  initialReaction?: SoKinReactionType | null;
  initialSaved?: boolean;
  onScoring?: (postId: string) => void;
  boostStats?: BoostPostStats | null;
  onBoost?: (postId: string) => void;
};

export function AnnounceCard({
  post,
  t,
  isLoggedIn,
  onMediaClick,
  isCommentsOpen,
  onOpenComments,
  onContact,
  isContacting,
  postInsight,
  onLoadInsight,
  isAuthor,
  feedSource,
  onRepost,
  onToggle,
  initialReaction,
  initialSaved,
  onScoring,
  boostStats,
  onBoost,
}: AnnounceCardProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLElement>(null);
  const cardToast = useSoKinToast();
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const userPausedRef = useRef(false);
  const [mainVideoEl, setMainVideoEl] = useState<HTMLVideoElement | null>(null);
  const [myReaction, setMyReaction] = useState<SoKinReactionType | null>(initialReaction ?? null);
  const [likeCount, setLikeCount] = useState(post.likes ?? 0);
  const [saved, setSaved] = useState(initialSaved ?? false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [insightExpanded, setInsightExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSending, setReportSending] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [localStatus, setLocalStatus] = useState(post.status);

  // ── Tracking : observer les vues de post ──
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    return observePostView(el, {
      postId: post.id,
      authorId: post.authorId,
      postType: post.postType,
      city: (post as any).location ?? undefined,
      source: feedSource,
    });
  }, [post.id, post.authorId, post.postType, feedSource]);
  useEffect(() => {
    ensureVideoVisibilityListener();
  }, []);

  const trackEv = useCallback((event: Parameters<typeof trackSoKinEvent>[0]['event'], meta?: Record<string, unknown>) => {
    trackSoKinEvent({
      event,
      postId: post.id,
      authorId: post.authorId,
      postType: post.postType,
      city: (post as any).location ?? undefined,
      source: feedSource,
      meta,
    });
  }, [post.id, post.authorId, post.postType, feedSource]);

  const handleVideoToggle = useCallback((videoEl: HTMLVideoElement) => {
    if (!videoEl) return;
    if (videoEl.paused) {
      userPausedRef.current = false;
      if (mainVideoRef.current !== videoEl) {
        mainVideoRef.current = videoEl;
        setMainVideoEl(videoEl);
      }
      if (activeVideoEl && activeVideoEl !== videoEl) {
        pauseVideo(activeVideoEl);
      }
      activeVideoEl = videoEl;
      safePlayVideo(videoEl);
      return;
    }
    userPausedRef.current = true;
    pauseVideo(videoEl);
    if (activeVideoEl === videoEl) {
      activeVideoEl = null;
    }
  }, []);

  const profile = post.author.profile;
  const authorName = profile?.displayName ?? 'Utilisateur';
  const authorHandle = profile?.username ?? post.author.id;
  const authorAvatar = profile?.avatarUrl;
  const cleanHandle = authorHandle?.replace('@', '') ?? '';

  const mediaItems = categorizeMedia(post.mediaUrls ?? []);
  const firstVideoIndex = mediaItems.findIndex((item) => item.type === 'video');
  const fallbackAudioTitle = useMemo(() => {
    if (post.text?.trim()) return '';
    const audioItem = mediaItems.find((item) => item.type === 'audio');
    if (!audioItem) return '';
    const cleanUrl = audioItem.url.split('?')[0].split('#')[0];
    const fileName = cleanUrl.split('/').pop() ?? '';
    if (!fileName) return '';
    try {
      return decodeURIComponent(fileName)
        .replace(/\.mp3$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/[@#]+/g, ' ')
        .trim();
    } catch {
      return fileName.replace(/\.mp3$/i, '').replace(/[-_]+/g, ' ').replace(/[@#]+/g, ' ').trim();
    }
  }, [mediaItems, post.text]);

  useEffect(() => {
    if (firstVideoIndex < 0) {
      if (mainVideoEl && activeVideoEl === mainVideoEl) {
        pauseVideo(mainVideoEl);
        activeVideoEl = null;
      }
      return;
    }

    const cardEl = cardRef.current;
    const videoEl = mainVideoEl;
    if (!cardEl || !videoEl) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target !== cardEl) return;

        if (entry.isIntersecting) {
          // Pré-charger les métadonnées dès que la card entre dans le viewport
          if (videoEl.preload === 'none') videoEl.preload = 'metadata';

          if (entry.intersectionRatio >= 0.5) {
            // Autoplay quand ≥50% visible
            if (!userPausedRef.current) {
              if (activeVideoEl && activeVideoEl !== videoEl) {
                pauseVideo(activeVideoEl);
              }
              activeVideoEl = videoEl;
              safePlayVideo(videoEl);
            }
          }
        } else {
          if (activeVideoEl === videoEl) {
            pauseVideo(videoEl);
            activeVideoEl = null;
          } else {
            pauseVideo(videoEl);
          }
          userPausedRef.current = false;
        }
      });
    }, { threshold: [0, 0.25, 0.5], rootMargin: '200px 0px' });

    observer.observe(cardEl);

    return () => {
      observer.disconnect();
      if (activeVideoEl === videoEl) {
        pauseVideo(videoEl);
        activeVideoEl = null;
      }
    };
  }, [post.id, firstVideoIndex, mainVideoEl]);
  const replyCount = post.comments ?? 0;
  const postType = ((post as any).postType ?? 'SHOWCASE') as SoKinPostType;
  const ptMeta = POST_TYPE_META[postType] ?? POST_TYPE_META.SHOWCASE;
  const postSubject = (post as any).subject as string | null | undefined;
  const isCommercialType = (COMMERCIAL_TYPES as readonly string[]).includes(postType);
  const postTags = (post as any).tags as string[] | undefined;
  const postHashtags = (post as any).hashtags as string[] | undefined;
  const postLocation = (post as any).location as string | undefined;
  const liked = myReaction !== null;
  const [likeBurst, setLikeBurst] = useState(false);
  const [saveBurst, setSaveBurst] = useState(false);

  const handleLike = useCallback(async () => {
    if (!isLoggedIn || reacting) return;
    setReacting(true);
    const wasLiked = myReaction !== null;
    setMyReaction(wasLiked ? null : 'LIKE');
    setLikeCount((c) => wasLiked ? Math.max(0, c - 1) : c + 1);
    if (!wasLiked) { setLikeBurst(true); setTimeout(() => setLikeBurst(false), 600); }
    try {
      await sokinApi.react(post.id, 'LIKE');
      if (wasLiked) cardToast.info('Like retiré');
    } catch {
      setMyReaction(wasLiked ? 'LIKE' : null);
      setLikeCount((c) => wasLiked ? c + 1 : Math.max(0, c - 1));
      cardToast.error('Erreur réseau — réessayez');
    } finally {
      setReacting(false);
    }
  }, [isLoggedIn, reacting, myReaction, post.id, cardToast]);

  const handleSave = useCallback(async () => {
    if (!isLoggedIn) return;
    const wasSaved = saved;
    setSaved(!wasSaved);
    if (!wasSaved) { setSaveBurst(true); setTimeout(() => setSaveBurst(false), 500); }
    try {
      await sokinApi.bookmark(post.id);
      cardToast.success(wasSaved ? 'Retiré des favoris' : 'Ajouté aux favoris ✨');
    } catch {
      setSaved(wasSaved);
      cardToast.error('Erreur réseau — réessayez');
    }
  }, [isLoggedIn, saved, post.id, cardToast]);

  const handleMentionClick = useCallback((rawHandle: string) => {
    void resolvePublicTagTarget(rawHandle).then((path) => navigate(path));
  }, [navigate]);

  const handleHashtagClick = useCallback((tag: string) => {
    navigate(`/sokin?tag=${encodeURIComponent(tag)}`);
  }, [navigate]);

  return (
    <article ref={cardRef} id={`sk-post-${post.id}`} className={`sk-card${isCommercialType ? ' sk-card--commercial' : ''}${localStatus === 'HIDDEN' ? ' sk-card--hidden' : ''}`}>

      {/* ═══ BANDEAU MASQUÉ — visible seulement pour l'auteur ═══ */}
      {isAuthor && localStatus === 'HIDDEN' && (
        <div className="sk-card-hidden-banner">
          🟡 Publication masquée — seul vous pouvez la voir
        </div>
      )}

      {/* ═══ L1. HEADER : avatar + nom + handle + temps + badge + menu ═══ */}
      <header className="sk-card-header">
        <button
          type="button"
          className="sk-card-author"
          onClick={() => { trackEv('PROFILE_CLICK'); handleMentionClick(cleanHandle); }}
          aria-label={`Voir le profil de ${authorName}`}
        >
          <div className="sk-card-avatar-wrap">
            {authorAvatar ? (
              <img src={resolveMediaUrl(authorAvatar)} alt={authorName} className="sk-card-avatar" />
            ) : (
              <span className="sk-card-avatar-empty" aria-hidden="true">
                {authorName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="sk-card-author-info">
            <div className="sk-card-author-line">
              <strong className="sk-card-author-name">{authorName}</strong>
              <span className="sk-card-type-pill">
                <span>{ptMeta.icon}</span>
                <span>{ptMeta.label}</span>
              </span>
              {post.sponsored && <span className="sk-card-sponsored">🚀 Sponsorisé</span>}
            </div>
            <span className="sk-card-author-meta">
              <span className="sk-card-author-handle">@{cleanHandle || post.author.id}</span>
              <span className="sk-card-author-time"> · {relTime(post.createdAt, t)}</span>
              {postLocation && <span className="sk-card-author-loc"> · 📍 {postLocation}</span>}
            </span>
          </div>
        </button>

        {/* Menu contextuel ··· */}
        <div className="sk-card-menu-wrap">
          <button
            type="button"
            className="sk-card-menu-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Plus d'options"
          >
            <IconMoreHoriz />
          </button>
          {menuOpen && (
            <div className="sk-card-menu-dropdown" role="menu">
              {isCommercialType && (
                <button type="button" role="menuitem" onClick={() => { trackEv('CONTACT_CLICK'); onContact(); setMenuOpen(false); }}>
                  <IconMessage /> Contacter
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => { handleSave(); setMenuOpen(false); }}>
                <IconBookmark filled={saved} /> {saved ? 'Retiré des favoris' : 'Sauvegarder'}
              </button>
              {isAuthor && onToggle && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={toggling}
                  onClick={async () => {
                    setMenuOpen(false);
                    setToggling(true);
                    const wasActive = localStatus === 'ACTIVE';
                    setLocalStatus(wasActive ? 'HIDDEN' : 'ACTIVE');
                    try {
                      onToggle(post.id);
                    } catch {
                      setLocalStatus(wasActive ? 'ACTIVE' : 'HIDDEN');
                    } finally {
                      setToggling(false);
                    }
                  }}
                >
                  {toggling ? '⏳' : localStatus === 'ACTIVE' ? '⏸️ Masquer' : '▶️ Réafficher'}
                </button>
              )}
              {isAuthor && onScoring && (
                <button type="button" role="menuitem" onClick={() => {
                  setMenuOpen(false);
                  onScoring(post.id);
                }}>
                  📊 Scoring détaillé
                </button>
              )}
              {!isAuthor && (
                <button type="button" role="menuitem" onClick={() => {
                  setMenuOpen(false);
                  if (!isLoggedIn) return;
                  setReportOpen(true);
                }}>
                  🚩 Signaler
                </button>
              )}
            </div>
          )}

          {/* ── Modal signalement ── */}
          {reportOpen && (
            <div className="sk-report-overlay" onClick={() => { if (!reportSending) setReportOpen(false); }} role="dialog" aria-modal="true" aria-label="Signaler la publication">
              <div className="sk-report-modal glass-container" onClick={(e) => e.stopPropagation()}>
                {reportDone ? (
                  <div className="sk-report-done">
                    <span className="sk-report-done-icon">✅</span>
                    <p>Merci pour votre signalement.</p>
                    <p className="sk-report-done-sub">Notre équipe examinera cette publication.</p>
                    <button type="button" className="sk-report-done-btn" onClick={() => { setReportOpen(false); setReportDone(false); }}>Fermer</button>
                  </div>
                ) : (
                  <>
                    <div className="sk-report-header">
                      <h3>🚩 Signaler la publication</h3>
                      <button type="button" className="sk-report-close" onClick={() => setReportOpen(false)} aria-label="Fermer">✕</button>
                    </div>
                    <p className="sk-report-subtitle">Pourquoi signalez-vous ce contenu ?</p>
                    <div className="sk-report-reasons">
                      {REPORT_REASONS.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          className="sk-report-reason-btn"
                          disabled={reportSending}
                          onClick={async () => {
                            setReportSending(true);
                            try {
                              await sokinApi.report(post.id, { reason: r.value });
                              setReportDone(true);
                              cardToast.success('Signalement envoyé');
                            } catch (err: any) {
                              const msg = err?.message ?? '';
                              if (msg.includes('409') || msg.includes('déjà')) {
                                setReportDone(true);
                              }
                            } finally {
                              setReportSending(false);
                            }
                          }}
                        >
                          <span>{r.icon}</span>
                          <span>{r.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ═══ BOOST STATS — mini-compteurs pour l'auteur ═══ */}
      {post.sponsored && isAuthor && boostStats && (
        <div className="sk-boost-stats-bar">
          <div className="sk-boost-stat">
            <span className="sk-boost-stat-icon">👁</span>
            <span className="sk-boost-stat-val">{boostStats.views}</span>
            <span className="sk-boost-stat-lbl">vues</span>
          </div>
          <div className="sk-boost-stat">
            <span className="sk-boost-stat-icon">👤</span>
            <span className="sk-boost-stat-val">{boostStats.profileClicks}</span>
            <span className="sk-boost-stat-lbl">profil</span>
          </div>
          <div className="sk-boost-stat">
            <span className="sk-boost-stat-icon">📨</span>
            <span className="sk-boost-stat-val">{boostStats.contactClicks + boostStats.dmOpens}</span>
            <span className="sk-boost-stat-lbl">contacts</span>
          </div>
        </div>
      )}

      {/* ═══ REPOST ATTRIBUTION — affiche l'auteur original ═══ */}
      {(post as any).repostOf && (
        <div className="sk-repost-attr">
          <span className="sk-repost-attr-icon">🔄</span>
          <span className="sk-repost-attr-text">
            Reposté de <strong>{(post as any).repostOf.author?.profile?.displayName ?? 'Utilisateur'}</strong>
          </span>
        </div>
      )}

      {/* ═══ L2. CONTENU : sujet + texte + hashtags + tags ═══ */}
      {postSubject && (
        <div className="sk-card-subject-bar">
          <h3 className="sk-card-subject">{postSubject}</h3>
        </div>
      )}

      {post.text ? (
        mediaItems.length > 0
          ? <p className="sk-card-text">{renderPostText(post.text, handleMentionClick, handleHashtagClick)}</p>
          : (
            <div className="sk-card-text-only" style={{ background: resolveBackgroundCss((post as any).backgroundStyle) }}>
              <p className="sk-card-text sk-card-text--centered">{renderPostText(post.text, handleMentionClick, handleHashtagClick)}</p>
            </div>
          )
      ) : fallbackAudioTitle ? (
        <p className="sk-card-text">{fallbackAudioTitle}</p>
      ) : null}

      {((postHashtags && postHashtags.length > 0) || (postTags && postTags.length > 0)) && (
        <div className="sk-card-tags">
          {postHashtags?.map((h) => (
            <button key={h} type="button" className="sk-card-hashtag" onClick={() => handleHashtagClick(h)}>
              #{h}
            </button>
          ))}
          {postTags?.map((tag) => (
            <button key={tag} type="button" className="sk-card-tag" onClick={() => handleMentionClick(tag)}>
              @{tag}
            </button>
          ))}
        </div>
      )}

      {/* ═══ L3. MÉDIAS ═══ */}
      {mediaItems.length > 0 && (
        <MediaCollage
          items={mediaItems}
          onItemClick={onMediaClick}
          onVideoToggle={handleVideoToggle}
          onVideoRef={(el, _item, index) => {
            if (index !== firstVideoIndex) return;
            if (mainVideoRef.current !== el) {
              mainVideoRef.current = el;
              setMainVideoEl(el);
            }
          }}
          autoPlayVideoIndex={firstVideoIndex >= 0 ? firstVideoIndex : undefined}
        />
      )}

      {/* ═══ ORIGINAL POST EMBARQUÉ (si repost) ═══ */}
      {(post as any).repostOf && (() => {
        const orig = (post as any).repostOf as SoKinApiFeedPost;
        const origProfile = orig.author?.profile;
        const origName = origProfile?.displayName ?? 'Utilisateur';
        const origHandle = origProfile?.username?.replace(/^@/, '') ?? orig.author?.id?.slice(0, 8) ?? '';
        const origMediaItems = categorizeMedia(orig.mediaUrls ?? []);

        return (
          <div className="sk-repost-embed">
            <div className="sk-repost-embed-header">
              {origProfile?.avatarUrl ? (
                <img src={resolveMediaUrl(origProfile.avatarUrl)} alt={origName} className="sk-repost-embed-avatar" />
              ) : (
                <span className="sk-repost-embed-avatar-empty">{origName.charAt(0).toUpperCase()}</span>
              )}
              <div>
                <strong>{origName}</strong>
                <span className="sk-repost-embed-handle"> @{origHandle}</span>
                <span className="sk-repost-embed-time"> · {relTime(orig.createdAt, t)}</span>
              </div>
            </div>
            {orig.text && <p className="sk-repost-embed-text">{renderPostText(orig.text.length > 200 ? orig.text.slice(0, 200) + '…' : orig.text, handleMentionClick, handleHashtagClick)}</p>}
            {origMediaItems.length > 0 && (
              <div className="sk-repost-embed-media">
                {origMediaItems[0].type === 'image' ? (
                  <img src={resolveMediaUrl(origMediaItems[0].url)} alt="" className="sk-repost-embed-img" loading="lazy" />
                ) : origMediaItems[0].type === 'audio' ? (
                  <audio src={resolveMediaUrl(origMediaItems[0].url)} controls className="sk-repost-embed-img" />
                ) : (
                  <video src={resolveMediaUrl(origMediaItems[0].url)} className="sk-repost-embed-img" muted playsInline />
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══ L4. COMPTEURS + BARRE SOCIALE ═══ */}
      <div className="sk-card-counters">
        {likeCount > 0 && (
          <span className="sk-card-counter">
            <span className="sk-card-counter-dot sk-card-counter-dot--like" />
            {likeCount} {likeCount > 1 ? 'j\u2019aime' : 'j\u2019aime'}
          </span>
        )}
        {replyCount > 0 && (
          <button type="button" className="sk-card-counter sk-card-counter--link" onClick={onOpenComments}>
            {replyCount} commentaire{replyCount > 1 ? 's' : ''}
          </button>
        )}
        {(post.shares ?? 0) > 0 && (
          <span className="sk-card-counter">
            {post.shares} repost{(post.shares ?? 0) > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ═══ INSIGHTS AUTEUR — enrichi, visible seulement pour l'auteur ═══ */}
      {isAuthor && (
        <div className="sk-card-insights">
          {postInsight ? (() => {
            const isCard = 'potential' in postInsight;
            const score = isCard ? (postInsight as PostInsightCard).potential.score : (postInsight as PostInsight).potentialScore;
            const level = score >= 60 ? 'high' : score >= 30 ? 'mid' : 'low';
            const statusLabel = score >= 60 ? '✓ Bon' : score >= 30 ? '⚡ Moyen' : '↗ À améliorer';
            const views = isCard ? (postInsight as PostInsightCard).reach.views : (postInsight as PostInsight).views;
            return (
            <>
              <button
                type="button"
                className="sk-card-insights-toggle"
                onClick={() => setInsightExpanded(!insightExpanded)}
                aria-expanded={insightExpanded}
              >
                <span className="sk-insight-score" data-score={level}>
                  {score}
                </span>
                <span className="sk-insight-status" data-status={level}>
                  {isCard ? (postInsight as PostInsightCard).potential.label || statusLabel : statusLabel}
                </span>
                <span className="sk-insight-views">👁️ {views}</span>
                <span className="sk-insight-arrow">{insightExpanded ? '\u25B2' : '\u25BC'}</span>
              </button>
              {insightExpanded && (
                <div className="sk-card-insights-detail">
                  {isCard ? (() => {
                    const c = postInsight as PostInsightCard;
                    return (
                      <>
                        <div className="sk-insight-metrics">
                          <div className="sk-insight-metric">
                            <span className="sk-insight-metric-label">Portée</span>
                            <span className="sk-insight-metric-value">{c.reach.views.toLocaleString()}</span>
                          </div>
                          <div className="sk-insight-metric">
                            <span className="sk-insight-metric-label">Engagement</span>
                            <span className="sk-insight-metric-value">{c.engagement.rate}%</span>
                          </div>
                          <div className="sk-insight-metric">
                            <span className="sk-insight-metric-label">Potentiel</span>
                            <span className="sk-insight-metric-value">{c.potential.level}</span>
                          </div>
                        </div>
                        <div className="sk-insight-bar-wrap">
                          <div
                            className="sk-insight-bar"
                            data-score={level}
                            style={{ width: `${Math.min(c.potential.score, 100)}%` }}
                          />
                        </div>
                        <div className="sk-insight-breakdown">
                          <div className="sk-insight-breakdown-row">
                            <span>💬 Commentaires</span>
                            <span>{c.comments.total}</span>
                          </div>
                          <div className="sk-insight-breakdown-row">
                            <span>🔁 Reposts</span>
                            <span>{c.reposts.total}</span>
                          </div>
                          <div className="sk-insight-breakdown-row">
                            <span>🔖 Sauvegardes</span>
                            <span>{c.saves.total}</span>
                          </div>
                          <div className="sk-insight-breakdown-row">
                            <span>❤️ Likes</span>
                            <span>{c.engagement.likes}</span>
                          </div>
                        </div>
                        {(c.localInterest || c.clicks || c.dmOpens) && (
                          <div className="sk-insight-premium">
                            <span className="sk-insight-premium-badge">⭐ Premium</span>
                            {c.localInterest && (
                              <div className="sk-insight-breakdown-row">
                                <span>📍 {c.localInterest.city}</span>
                                <span>{c.localInterest.viewsFromCity} vues</span>
                              </div>
                            )}
                            {c.clicks && (
                              <div className="sk-insight-breakdown-row">
                                <span>🔗 Clics</span>
                                <span>{c.clicks.listings + c.clicks.profiles + c.clicks.contacts}</span>
                              </div>
                            )}
                            {c.dmOpens && (
                              <div className="sk-insight-breakdown-row">
                                <span>✉️ DM ouverts</span>
                                <span>{c.dmOpens.total}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="sk-insight-suggestion">
                          <strong>{c.suggestion.title}</strong>
                          <p>{c.suggestion.message}</p>
                        </div>
                      </>
                    );
                  })() : (
                    <>
                      <div className="sk-insight-metrics">
                        <div className="sk-insight-metric">
                          <span className="sk-insight-metric-label">Portée</span>
                          <span className="sk-insight-metric-value">{(postInsight as PostInsight).views.toLocaleString()}</span>
                        </div>
                        <div className="sk-insight-metric">
                          <span className="sk-insight-metric-label">Engagement</span>
                          <span className="sk-insight-metric-value">{(postInsight as PostInsight).engagementRate}%</span>
                        </div>
                        <div className="sk-insight-metric">
                          <span className="sk-insight-metric-label">Potentiel</span>
                          <span className="sk-insight-metric-value">{(postInsight as PostInsight).potentialScore}/100</span>
                        </div>
                      </div>
                      <div className="sk-insight-bar-wrap">
                        <div
                          className="sk-insight-bar"
                          data-score={level}
                          style={{ width: `${Math.min((postInsight as PostInsight).potentialScore, 100)}%` }}
                        />
                      </div>
                      {(postInsight as PostInsight).tip && (
                        <p className="sk-insight-tip">💡 {(postInsight as PostInsight).tip}</p>
                      )}
                      {(postInsight as PostInsight).boostSuggested && onBoost && (
                        <button type="button" className="sk-insight-boost-cta" onClick={() => onBoost(post.id)}>
                          🚀 Booster ce post
                        </button>
                      )}
                    </>
                  )}
                  {onScoring && (
                    <button type="button" className="sk-insight-scoring-cta" onClick={() => onScoring(post.id)}>
                      📊 Voir le scoring détaillé
                    </button>
                  )}
                </div>
              )}
            </>
            );
          })() : (
            <button
              type="button"
              className="sk-card-insights-toggle sk-card-insights-toggle--load"
              onClick={onLoadInsight}
            >
              <span className="sk-insight-label">📊 Voir les insights</span>
            </button>
          )}
        </div>
      )}

      <div className="sk-card-social-bar">
        <button
          type="button"
          className={`sk-social-btn sk-social-btn--like${liked ? ' sk-social-btn--active' : ''}${likeBurst ? ' sk-social-btn--burst' : ''}`}
          onClick={handleLike}
          aria-label={liked ? 'Ne plus aimer' : 'Aimer'}
          aria-pressed={liked}
        >
          <span className="sk-social-icon"><IconHeart filled={liked} /></span>
          {likeBurst && <span className="sk-burst-particles" aria-hidden="true"><span /><span /><span /><span /><span /><span /></span>}
          <span>J\u2019aime</span>
        </button>

        <button
          type="button"
          className={`sk-social-btn sk-social-btn--comment${isCommentsOpen ? ' sk-social-btn--active' : ''}`}
          onClick={() => { trackEv('COMMENT_OPEN'); onOpenComments(); }}
          aria-label="Commenter"
          aria-expanded={isCommentsOpen}
        >
          <span className="sk-social-icon"><IconComment /></span>
          <span>Commenter</span>
        </button>

        <button
          type="button"
          className="sk-social-btn sk-social-btn--repost"
          aria-label="Reposter"
          onClick={() => onRepost?.(post)}
        >
          <span className="sk-social-icon"><IconRepost /></span>
          <span>Reposter</span>
        </button>

        <button
          type="button"
          className={`sk-social-btn sk-social-btn--save${saved ? ' sk-social-btn--active' : ''}${saveBurst ? ' sk-social-btn--burst' : ''}`}
          onClick={handleSave}
          aria-label={saved ? 'Retirer des favoris' : 'Sauvegarder'}
          aria-pressed={saved}
        >
          <span className="sk-social-icon"><IconBookmark filled={saved} /></span>
          <span>Sauver</span>
        </button>
      </div>

      {/* ═══ L5. BLOC COMMERCE — discret, conditionnel ═══ */}
      {isCommercialType && (
        <div className="sk-card-commerce">
          <div className="sk-card-commerce-inner">
            <button
              type="button"
              className="sk-card-commerce-action"
              onClick={() => { trackEv('CONTACT_CLICK'); onContact(); }}
              disabled={isContacting}
              aria-busy={isContacting}
            >
              {isContacting ? '⏳' : postType === 'SELLING' ? '💬 Intéressé(e)' : postType === 'PROMO' ? '🏷️ Voir l\u2019offre' : '📋 En savoir plus'}
            </button>
            <button
              type="button"
              className="sk-card-commerce-action"
              onClick={() => handleMentionClick(cleanHandle)}
            >
              👤 Profil vendeur
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

















