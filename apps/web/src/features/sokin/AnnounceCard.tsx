/**
 * AnnounceCard — Composant partagé de carte So-Kin
 *
 * Utilisé dans SoKinPage ET HomePage pour un rendu identique.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { PostInsight, PostInsightCard } from '../../lib/services/sokin-analytics.service';

/* ─────────────────────────────────────────────────────── */
/* TYPES                                                    */
/* ─────────────────────────────────────────────────────── */

export type MediaItem = { url: string; type: 'image' | 'video' };

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
/* MEDIA COLLAGE                                            */
/* ─────────────────────────────────────────────────────── */

export function MediaCollage({
  items,
  onItemClick,
}: {
  items: MediaItem[];
  onItemClick: (item: MediaItem) => void;
}) {
  const count = items.length;
  if (count === 0) return null;

  return (
    <div
      className={`sk-media-grid sk-media-grid--${count}`}
      role="group"
      aria-label="Médias de l'annonce"
    >
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className="sk-media-item"
          onClick={() => onItemClick(item)}
          aria-label={item.type === 'video' ? 'Voir la vidéo' : "Voir l'image"}
        >
          {item.type === 'video' ? (
            <>
              <video
                src={resolveMediaUrl(item.url)}
                muted
                playsInline
                preload="none"
                tabIndex={-1}
              />
              <span className="sk-media-play-icon" aria-hidden="true">▶</span>
            </>
          ) : (
            <img
              src={resolveMediaUrl(item.url)}
              alt=""
              loading="lazy"
            />
          )}
        </button>
      ))}
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
}: AnnounceCardProps) {
  const navigate = useNavigate();
  const cardRef = useRef<HTMLElement>(null);
  const cardToast = useSoKinToast();
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

  const profile = post.author.profile;
  const authorName = profile?.displayName ?? 'Utilisateur';
  const authorHandle = profile?.username ?? post.author.id;
  const authorAvatar = profile?.avatarUrl;
  const cleanHandle = authorHandle?.replace('@', '') ?? '';

  const mediaItems = categorizeMedia(post.mediaUrls ?? []);
  const replyCount = post.comments ?? 0;
  const postType = ((post as any).postType ?? 'SHOWCASE') as SoKinPostType;
  const ptMeta = POST_TYPE_META[postType] ?? POST_TYPE_META.SHOWCASE;
  const postSubject = (post as any).subject as string | null | undefined;
  const isCommercialType = (COMMERCIAL_TYPES as readonly string[]).includes(postType);
  const postTags = (post as any).tags as string[] | undefined;
  const postHashtags = (post as any).hashtags as string[] | undefined;
  const postLocation = (post as any).location as string | undefined;
  const liked = myReaction !== null;

  const handleLike = useCallback(async () => {
    if (!isLoggedIn || reacting) return;
    setReacting(true);
    const wasLiked = myReaction !== null;
    setMyReaction(wasLiked ? null : 'LIKE');
    setLikeCount((c) => wasLiked ? Math.max(0, c - 1) : c + 1);
    try {
      await sokinApi.react(post.id, 'LIKE');
    } catch {
      setMyReaction(wasLiked ? 'LIKE' : null);
      setLikeCount((c) => wasLiked ? c + 1 : Math.max(0, c - 1));
    } finally {
      setReacting(false);
    }
  }, [isLoggedIn, reacting, myReaction, post.id]);

  const handleSave = useCallback(async () => {
    if (!isLoggedIn) return;
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      await sokinApi.bookmark(post.id);
      cardToast.success(wasSaved ? 'Retiré des favoris' : 'Ajouté aux favoris');
    } catch {
      setSaved(wasSaved);
    }
  }, [isLoggedIn, saved, post.id, cardToast]);

  const handleMentionClick = useCallback((rawHandle: string) => {
    void resolvePublicTagTarget(rawHandle).then((path) => navigate(path));
  }, [navigate]);

  const handleHashtagClick = useCallback((tag: string) => {
    navigate(`/sokin?tag=${encodeURIComponent(tag)}`);
  }, [navigate]);

  return (
    <article ref={cardRef} className={`sk-card${isCommercialType ? ' sk-card--commercial' : ''}${localStatus === 'HIDDEN' ? ' sk-card--hidden' : ''}`}>

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
        <MediaCollage items={mediaItems} onItemClick={onMediaClick} />
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
                      {(postInsight as PostInsight).boostSuggested && (
                        <button type="button" className="sk-insight-boost-cta">
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
          className={`sk-social-btn sk-social-btn--like${liked ? ' sk-social-btn--active' : ''}`}
          onClick={handleLike}
          aria-label={liked ? 'Ne plus aimer' : 'Aimer'}
          aria-pressed={liked}
        >
          <span className="sk-social-icon"><IconHeart filled={liked} /></span>
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
          className={`sk-social-btn sk-social-btn--save${saved ? ' sk-social-btn--active' : ''}`}
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
