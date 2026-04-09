/**
 * So-Kin Page — v4 Mobile First
 *
 * Structure:
 * - Flux vertical d'annonces (style Facebook orienté annonces)
 * - Carte avec en-tête (auteur + contact), corps (texte + collage médias), pied (réponses)
 * - Collage médias Facebook-style : 1 à 5 médias, max 2 vidéos
 * - Viewer simple au clic sur un média (pas de galerie complexe)
 * - Tiroir de réponses inline sous chaque carte
 * - Layout adaptatif mobile/tablette/desktop
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useMarketPreference } from '../../app/providers/MarketPreferenceProvider';
import { prepareMediaUrl } from '../../utils/media-upload';
import { getDashboardPath } from '../../utils/role-routing';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSocket } from '../../hooks/useSocket';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import {
  sokin as sokinApi,
  messaging,
  users as usersApi,
  listings as listingsApi,
  explorer as explorerApi,
  geo as geoApi,
  orders as ordersApi,
  resolveMediaUrl,
  type SoKinApiFeedPost,
  type SoKinApiComment,
  type SoKinApiPost,
  type SoKinPostType,
  type SoKinReactionType,
  type SoKinContentTab,
} from '../../lib/api-client';
import { ApiError } from '../../lib/api-core';
import { AdBanner } from '../../components/AdBanner';
import { SeoMeta } from '../../components/SeoMeta';
import { buildSoKinFeedItems } from './ad-cadence';
import './sokin.css';

/* ─────────────────────────────────────────────────────── */
/* TYPES LOCAUX                                             */
/* ─────────────────────────────────────────────────────── */

type MediaItem = { url: string; type: 'image' | 'video' };

/** Référence minimale d'une annonce So-Kin transmise à la messagerie */
type SoKinPostRef = {
  id: string;
  text: string;
  mediaUrl: string | null;
  authorName: string;
  authorId: string;
  authorHandle: string;
};

type SoKinPublishPayload = {
  text: string;
  mediaFiles: File[];
  postType: SoKinPostType;
  subject?: string;
  location?: string;
  tags?: string[];
  hashtags?: string[];
  scheduledAt?: string;
};

/** Types visuels qui exigent au moins 1 média */
const MEDIA_REQUIRED_TYPES: SoKinPostType[] = ['SHOWCASE', 'SELLING', 'PROMO'];

/** Métadonnées UX par type de publication */
const POST_TYPE_META: Record<SoKinPostType, { label: string; icon: string; placeholder: string }> = {
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

type HeaderNotification = {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: string;
  time: string;
};

const DESKTOP_INFO_ITEMS = [
  { title: 'À propos', href: '/about' },
  { title: 'Conditions', href: '/terms' },
  { title: 'Guide', href: '/guide' },
  { title: 'Comment ça marche', href: '/how-it-works' },
  { title: 'Confidentialité', href: '/privacy' },
  { title: 'Mentions légales', href: '/legal' },
  { title: 'Blog', href: '/blog' },
  { title: 'FAQ', href: '/faq' },
  { title: 'Contact', href: '/contact' },
] as const;

const CREATE_DRAFT_STORAGE_KEY = 'ks-sokin-create-draft-v1';
const OVERLAY_VISIBILITY_LOCK_MS = 180;

type SoKinCreateDraft = {
  text?: string;
  postType?: SoKinPostType;
  subject?: string;
  location?: string;
  tags?: string[];
  hashtags?: string[];
  scheduledAt?: string;
};

type SoKinEditorDraftState = {
  location: string;
  selectedTags: string[];
  selectedArticles: string[];
  scheduledAt: string;
};

function readSoKinCreateDraft(): SoKinCreateDraft {
  try {
    const raw = localStorage.getItem(CREATE_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SoKinCreateDraft;
    const validTypes: SoKinPostType[] = ['SHOWCASE', 'DISCUSSION', 'QUESTION', 'SELLING', 'PROMO', 'SEARCH', 'UPDATE', 'REVIEW', 'TREND'];
    return {
      text: typeof parsed.text === 'string' ? parsed.text.slice(0, 500) : '',
      postType: typeof parsed.postType === 'string' && validTypes.includes(parsed.postType as SoKinPostType) ? parsed.postType as SoKinPostType : undefined,
      subject: typeof parsed.subject === 'string' ? parsed.subject.slice(0, 120) : '',
      location: typeof parsed.location === 'string' ? parsed.location.slice(0, 120) : '',
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((v): v is string => typeof v === 'string').slice(0, 20) : [],
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.filter((v): v is string => typeof v === 'string').slice(0, 20) : [],
      scheduledAt: typeof parsed.scheduledAt === 'string' ? parsed.scheduledAt : '',
    };
  } catch {
    return {};
  }
}

/* ─────────────────────────────────────────────────────── */
/* HELPERS                                                  */
/* ─────────────────────────────────────────────────────── */

/** Onglets de feed */
type FeedTab = 'pour-toi' | 'local' | 'ventes';

const FEED_TABS: { key: FeedTab; label: string; icon: string }[] = [
  { key: 'pour-toi', label: 'Pour toi',  icon: '✨' },
  { key: 'local',    label: 'Local',     icon: '📍' },
  { key: 'ventes',   label: 'Ventes',    icon: '🏷️' },
];

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

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(url);
}

/** Prépare jusqu'à 5 médias avec max 2 vidéos */
function categorizeMedia(urls: string[]): MediaItem[] {
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

/* ─────────────────────────────────────────────────────── */
/* ICÔNES SVG INLINE                                        */
/* ─────────────────────────────────────────────────────── */

function IconMessage() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
    </svg>
  );
}

function IconHeart({ filled }: { filled?: boolean }) {
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

function IconComment() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconRepost() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function IconBookmark({ filled }: { filled?: boolean }) {
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

function IconMoreHoriz() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────── */
/* MEDIA VIEWER — popup simple (1 média à la fois)         */
/* ─────────────────────────────────────────────────────── */

function MediaViewer({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="sk-viewer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Média en plein écran"
    >
      <button
        type="button"
        className="sk-viewer-close"
        onClick={onClose}
        aria-label="Fermer le media"
      >
        ✕
      </button>
      <div className="sk-viewer-content" onClick={(e) => e.stopPropagation()}>
        {item.type === 'video' ? (
          <video
            src={resolveMediaUrl(item.url)}
            controls
            autoPlay
            playsInline
            className="sk-viewer-media"
          />
        ) : (
          <img
            src={resolveMediaUrl(item.url)}
            alt=""
            className="sk-viewer-media"
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* MEDIA COLLAGE — grille Facebook (1-5 médias)            */
/* ─────────────────────────────────────────────────────── */

function MediaCollage({
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
/* COMMENTS DRAWER — tiroir mobile plein écran             */
/* ─────────────────────────────────────────────────────── */

type MissingPublicProfile = {
  avatarUrl: string | null;
  displayName: string;
  identifier: string;
};

type CommentProfileState = {
  status: 'idle' | 'loading' | 'success' | 'not-available' | 'error';
  profile: MissingPublicProfile | null;
  message: string | null;
};

function CommentsDrawer({
  post,
  open,
  isLoggedIn,
  comments,
  loading,
  draft,
  submitting,
  replyTo,
  profileState,
  sort,
  onClose,
  onDraftChange,
  onSubmit,
  onPrepareReply,
  onOpenProfile,
  onCloseProfileState,
  onSortChange,
}: {
  post: SoKinApiFeedPost | null;
  open: boolean;
  isLoggedIn: boolean;
  comments: SoKinApiComment[];
  loading: boolean;
  draft: string;
  submitting: boolean;
  replyTo: SoKinApiComment | null;
  profileState: CommentProfileState;
  sort: 'recent' | 'relevant';
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onPrepareReply: (comment: SoKinApiComment) => void;
  onOpenProfile: (comment: SoKinApiComment) => void;
  onCloseProfileState: () => void;
  onSortChange: (sort: 'recent' | 'relevant') => void;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setShowEmoji(false);
  }, [open]);

  const title = post ? `${post.comments ?? 0} réponse${(post.comments ?? 0) > 1 ? 's' : ''}` : 'Commentaires';

  /* Helper: rendre un commentaire (racine ou réponse) */
  const renderComment = (comment: SoKinApiComment, isReply = false) => {
    const name = comment.author.profile?.displayName ?? 'Utilisateur';
    const idLabel = comment.author.profile?.username ? `@${comment.author.profile.username.replace('@', '')}` : comment.author.id;
    const avatar = comment.author.profile?.avatarUrl;
    return (
      <article key={comment.id} className={`sk-comment-item${isReply ? ' sk-comment-item--reply' : ''}`}>
        <div className="sk-comment-avatar-wrap">
          {avatar ? (
            <img src={resolveMediaUrl(avatar)} alt={name} className="sk-comment-avatar" />
          ) : (
            <span className="sk-comment-avatar sk-comment-avatar--empty" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="sk-comment-main">
          <strong className="sk-comment-name">{name}</strong>
          <button
            type="button"
            className="sk-comment-id"
            disabled={profileState.status === 'loading'}
            onClick={(e) => {
              e.stopPropagation();
              onOpenProfile(comment);
            }}
          >
            {idLabel}
          </button>
          <p
            className="sk-comment-content sk-comment-content--clickable"
            onClick={() => onPrepareReply(comment)}
            title="Répondre à ce commentaire"
          >
            {comment.content}
          </p>
        </div>
      </article>
    );
  };

  return (
    <>
      <div
        className={`sk-comments-backdrop${open ? ' sk-comments-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside className={`sk-comments-drawer${open ? ' sk-comments-drawer--open' : ''}`} aria-hidden={!open}>
      <header className="sk-comments-head">
        <strong className="sk-comments-title">{title}</strong>
        <button type="button" className="sk-comments-close" onClick={onClose} aria-label="Fermer les commentaires">-</button>
      </header>

      {/* Onglets de tri */}
      <nav className="sk-comments-sort" aria-label="Tri des commentaires">
        <button
          type="button"
          className={`sk-comments-sort-btn${sort === 'recent' ? ' sk-comments-sort-btn--active' : ''}`}
          onClick={() => onSortChange('recent')}
        >Récents</button>
        <button
          type="button"
          className={`sk-comments-sort-btn${sort === 'relevant' ? ' sk-comments-sort-btn--active' : ''}`}
          onClick={() => onSortChange('relevant')}
        >Pertinents</button>
      </nav>

      <section className="sk-comments-list" aria-label="Liste des commentaires">
        {loading ? (
          <p className="sk-comments-empty">Chargement des commentaires…</p>
        ) : comments.length === 0 ? (
          <p className="sk-comments-empty">Aucun commentaire pour le moment.</p>
        ) : (
          comments.map((comment) => {
            const totalReplies = comment._count?.replies ?? 0;
            const shownReplies = comment.replies ?? [];
            return (
              <div key={comment.id} className="sk-comment-thread">
                {renderComment(comment)}
                {shownReplies.length > 0 && (
                  <div className="sk-comment-replies">
                    {shownReplies.map((reply) => renderComment(reply, true))}
                    {totalReplies > shownReplies.length && (
                      <button
                        type="button"
                        className="sk-comment-more-replies"
                        onClick={() => onPrepareReply(comment)}
                      >
                        Voir {totalReplies - shownReplies.length} autre{totalReplies - shownReplies.length > 1 ? 's' : ''} réponse{totalReplies - shownReplies.length > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {profileState.status !== 'idle' && profileState.status !== 'success' && profileState.profile && (
        <section className="sk-missing-profile" aria-label="Profil public non disponible">
          <div className="sk-missing-profile-box">
            {profileState.profile.avatarUrl ? (
              <img src={resolveMediaUrl(profileState.profile.avatarUrl)} alt={profileState.profile.displayName} className="sk-missing-profile-avatar" />
            ) : (
              <span className="sk-missing-profile-avatar sk-missing-profile-avatar--empty" aria-hidden="true">{profileState.profile.displayName.charAt(0).toUpperCase()}</span>
            )}
            <strong className="sk-missing-profile-name">{profileState.profile.displayName}</strong>
            <span className="sk-missing-profile-id">{profileState.profile.identifier}</span>
            <p className="sk-missing-profile-msg">
              {profileState.message}
            </p>
            {profileState.status === 'loading' ? (
              <button type="button" className="sk-btn sk-btn--outline" disabled>Chargement…</button>
            ) : (
              <button type="button" className="sk-btn sk-btn--outline" onClick={onCloseProfileState}>Retour</button>
            )}
          </div>
        </section>
      )}

      <footer className="sk-comments-compose">
        {replyTo && (
          <p className="sk-comments-reply-to">Réponse à {replyTo.author.profile?.displayName ?? 'Utilisateur'}</p>
        )}
        {showEmoji && (
          <div className="sk-comments-emoji-row">
            {['😀', '👍', '🔥', '👏', '❤️', '🙏'].map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="sk-comments-emoji-btn"
                onClick={() => onDraftChange(`${draft}${emoji}`)}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="sk-comments-compose-row">
          <button type="button" className="sk-comments-emoji-toggle" onClick={() => setShowEmoji((prev) => !prev)} aria-label="Ajouter un emoji">😊</button>
          <input
            ref={inputRef}
            type="text"
            className="sk-comments-input"
            placeholder={isLoggedIn ? 'Écrire un commentaire…' : 'Connectez-vous pour commenter'}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit();
            }}
            maxLength={500}
            disabled={!isLoggedIn || submitting}
          />
          <button type="button" className="sk-comments-send" onClick={onSubmit} disabled={submitting || !draft.trim() || !isLoggedIn} aria-label="Publier le commentaire">
            <IconSend />
          </button>
        </div>
      </footer>
      </aside>
    </>
  );
}

/* ─────────────────────────────────────────────────────── */
/* POST CARD — carte sociale enrichie                      */
/* ─────────────────────────────────────────────────────── */

/** Types commerciaux : bloc CTA commerce affiché */
const COMMERCIAL_TYPES = ['SELLING', 'PROMO', 'SHOWCASE'] as const;

function AnnounceCard({
  post,
  t,
  isLoggedIn,
  onMediaClick,
  isCommentsOpen,
  onOpenComments,
  onContact,
  isContacting,
}: {
  post: SoKinApiFeedPost;
  t: (k: string) => string;
  isLoggedIn: boolean;
  onMediaClick: (item: MediaItem) => void;
  isCommentsOpen: boolean;
  onOpenComments: () => void;
  onContact: () => void;
  isContacting: boolean;
}) {
  const navigate = useNavigate();
  const [myReaction, setMyReaction] = useState<SoKinReactionType | null>(null);
  const [likeCount, setLikeCount] = useState(post.likes ?? 0);
  const [saved, setSaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reacting, setReacting] = useState(false);

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
    // Optimistic update
    const wasLiked = myReaction !== null;
    setMyReaction(wasLiked ? null : 'LIKE');
    setLikeCount((c) => wasLiked ? Math.max(0, c - 1) : c + 1);
    try {
      await sokinApi.react(post.id, 'LIKE');
    } catch {
      // Rollback
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
    } catch {
      setSaved(wasSaved);
    }
  }, [isLoggedIn, saved, post.id]);

  return (
    <article className={`sk-card${isCommercialType ? ' sk-card--commercial' : ''}`}>

      {/* ═══ 1. HEADER : avatar + nom + handle + temps + menu ═══ */}
      <header className="sk-card-header">
        <button
          type="button"
          className="sk-card-author"
          onClick={() => navigate(`/user/${cleanHandle}`)}
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
              {postType !== 'SHOWCASE' && (
                <span className="sk-card-type-pill">
                  <span>{ptMeta.icon}</span>
                  <span>{ptMeta.label}</span>
                </span>
              )}
            </div>
            <span className="sk-card-author-meta">
              <span className="sk-card-author-handle">@{cleanHandle || post.author.id}</span>
              {postLocation && <span className="sk-card-author-loc"> · 📍 {postLocation}</span>}
              <span className="sk-card-author-time"> · {relTime(post.createdAt, t)}</span>
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
              <button type="button" role="menuitem" onClick={() => { onContact(); setMenuOpen(false); }}>
                <IconMessage /> Contacter
              </button>
              <button type="button" role="menuitem" onClick={() => { handleSave(); setMenuOpen(false); }}>
                <IconBookmark filled={saved} /> {saved ? 'Retiré des favoris' : 'Sauvegarder'}
              </button>
              <button type="button" role="menuitem" onClick={() => {
                if (isLoggedIn) {
                  sokinApi.report(post.id, { reason: 'SPAM' }).catch(() => {});
                }
                setMenuOpen(false);
              }}>
                🚩 Signaler
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ═══ 2. SUJET (si défini) ═══ */}
      {postSubject && (
        <div className="sk-card-subject-bar">
          <h3 className="sk-card-subject">{postSubject}</h3>
        </div>
      )}

      {/* ═══ 3. TEXTE ═══ */}
      {post.text ? (
        mediaItems.length > 0
          ? <p className="sk-card-text">{post.text}</p>
          : (
            <div className="sk-card-text-only" style={{ background: `linear-gradient(135deg, #000, ${['#1c133b', '#2b1649', '#321f58', '#161616'][post.id.charCodeAt(0) % 4]})` }}>
              <p className="sk-card-text sk-card-text--centered">{post.text}</p>
            </div>
          )
      ) : null}

      {/* ═══ 4. MÉDIAS ═══ */}
      {mediaItems.length > 0 && (
        <MediaCollage items={mediaItems} onItemClick={onMediaClick} />
      )}

      {/* ═══ 5. HASHTAGS + TAGS ═══ */}
      {((postHashtags && postHashtags.length > 0) || (postTags && postTags.length > 0)) && (
        <div className="sk-card-tags">
          {postHashtags?.map((h) => (
            <span key={h} className="sk-card-hashtag">#{h}</span>
          ))}
          {postTags?.map((tag) => (
            <span key={tag} className="sk-card-tag">@{tag}</span>
          ))}
        </div>
      )}

      {/* ═══ 6. COMPTEURS SOCIAUX ═══ */}
      <div className="sk-card-counters">
        {likeCount > 0 && (
          <span className="sk-card-counter">
            <span className="sk-card-counter-dot sk-card-counter-dot--like" />
            {likeCount}
          </span>
        )}
        {replyCount > 0 && (
          <button type="button" className="sk-card-counter sk-card-counter--link" onClick={onOpenComments}>
            {replyCount} commentaire{replyCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* ═══ 7. BARRE SOCIALE — actions principales ═══ */}
      <div className="sk-card-social-bar">
        <button
          type="button"
          className={`sk-social-btn sk-social-btn--like${liked ? ' sk-social-btn--active' : ''}`}
          onClick={handleLike}
          aria-label={liked ? 'Ne plus aimer' : 'Aimer'}
          aria-pressed={liked}
        >
          <span className="sk-social-icon"><IconHeart filled={liked} /></span>
          <span>J'aime</span>
        </button>

        <button
          type="button"
          className={`sk-social-btn sk-social-btn--comment${isCommentsOpen ? ' sk-social-btn--active' : ''}`}
          onClick={onOpenComments}
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

      {/* ═══ 8. BLOC COMMERCE (conditionnel) ═══ */}
      {isCommercialType && (
        <div className="sk-card-commerce">
          <button
            type="button"
            className="sk-card-cta-btn"
            onClick={onContact}
            disabled={isContacting}
            aria-busy={isContacting}
          >
            {isContacting ? (
              <span>⏳</span>
            ) : (
              <>
                <IconMessage />
                <span>
                  {postType === 'SELLING' ? 'Contacter le vendeur' :
                   postType === 'PROMO' ? 'Profiter de l\u2019offre' :
                   'En savoir plus'}
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </article>
  );
}

/* ─────────────────────────────────────────────────────── */
/* COMPOSE ZONE — déclencheur de publication               */
/* ─────────────────────────────────────────────────────── */

function ComposeZone({
  avatarUrl,
  displayName,
  onCreatePost,
}: {
  avatarUrl: string;
  displayName: string;
  onCreatePost: () => void;
}) {
  return (
    <section className="sk-compose">
      <div className="sk-compose-inner">
        {avatarUrl ? (
          <img
            src={resolveMediaUrl(avatarUrl)}
            alt={displayName}
            className="sk-compose-avatar"
          />
        ) : (
          <span className="sk-compose-avatar sk-compose-avatar--empty" aria-hidden="true">
            {(displayName.charAt(0) || '?').toUpperCase()}
          </span>
        )}
        <button
          type="button"
          className="sk-compose-trigger"
          onClick={onCreatePost}
        >
          {`Quoi de neuf, ${displayName} ?`}
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────── */
/* SKELETONS — placeholders de chargement                  */
/* ─────────────────────────────────────────────────────── */

function FeedSkeletons() {
  return (
    <div className="sk-feed sk-feed--loading" aria-busy="true" aria-label="Chargement…">
      {[1, 2, 3].map((i) => (
        <div key={i} className="sk-card-skeleton">
          <div className="sk-skeleton-header">
            <div className="sk-skeleton-avatar" />
            <div className="sk-skeleton-lines">
              <div className="sk-skeleton-line sk-skeleton-line--name" />
              <div className="sk-skeleton-line sk-skeleton-line--meta" />
            </div>
          </div>
          <div className="sk-skeleton-media" />
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* ANNOUNCES FEED — fil infini                             */
/* ─────────────────────────────────────────────────────── */

function AnnouncesFeed({
  posts,
  hasMore,
  loading,
  sentinelRef,
  t,
  isLoggedIn,
  openCommentsPostId,
  onOpenComments,
  onMediaClick,
  onContact,
  contactingPostId,
  immersiveDesktop = false,
}: {
  posts: SoKinApiFeedPost[];
  hasMore: boolean;
  loading: boolean;
  sentinelRef: React.RefObject<HTMLDivElement>;
  t: (k: string) => string;
  isLoggedIn: boolean;
  openCommentsPostId: string | null;
  onOpenComments: (postId: string) => void;
  onMediaClick: (item: MediaItem) => void;
  onContact: (post: SoKinApiFeedPost) => void;
  contactingPostId: string | null;
  immersiveDesktop?: boolean;
}) {
  const feedItems = useMemo(() => buildSoKinFeedItems(posts, 4), [posts]);
  const [resolvedAdsBySlot, setResolvedAdsBySlot] = useState<Record<string, string | null>>({});

  const getPreviousAdId = useCallback((sequence: number) => {
    if (sequence <= 1) return null;
    return resolvedAdsBySlot[`sokin-slot-${sequence - 1}`] ?? null;
  }, [resolvedAdsBySlot]);

  if (loading && posts.length === 0) {
    return <FeedSkeletons />;
  }

  if (posts.length === 0) {
    return (
      <div className="sk-feed">
        <div className="sk-feed-empty">
          <p>
            📭 Pas encore d'annonces.
            <br />
            Soyez le premier à publier !
          </p>
        </div>
      </div>
    );
  }

  const items: React.ReactNode[] = [];
  feedItems.forEach((entry) => {
    if (entry.type === 'post') {
      const post = entry.post;
      const card = (
        <AnnounceCard
          key={post.id}
          post={post}
          t={t}
          isLoggedIn={isLoggedIn}
          onMediaClick={onMediaClick}
          isCommentsOpen={openCommentsPostId === post.id}
          onOpenComments={() => onOpenComments(post.id)}
          onContact={() => onContact(post)}
          isContacting={contactingPostId === post.id}
        />
      );

      items.push(
        immersiveDesktop ? (
          <div key={`slide-${post.id}`} className="sk-feed-slide">
            {card}
          </div>
        ) : (
          card
        )
      );
      return;
    }

    const previousAdId = getPreviousAdId(entry.slot.sequence) ?? undefined;
    items.push(
      <AdBanner
        key={entry.slot.slotKey}
        page="sokin"
        variant="slim"
        hideWhenEmpty
        slotKey={entry.slot.slotKey}
        excludeAdId={previousAdId}
        onAdResolved={(adId) => {
          setResolvedAdsBySlot((prev) => {
            if (prev[entry.slot.slotKey] === adId) return prev;
            return { ...prev, [entry.slot.slotKey]: adId };
          });
        }}
        className={immersiveDesktop ? 'sk-feed-inline-ad sk-feed-inline-ad--immersive' : 'sk-feed-inline-ad'}
      />
    );
  });

  return (
    <section className={`sk-feed${immersiveDesktop ? ' sk-feed--immersive' : ''}`} aria-label="Fil d'annonces So-Kin">
      {items}
      {hasMore && (
        <div ref={sentinelRef} className="sk-sentinel" aria-hidden="true" />
      )}
      {!hasMore && posts.length >= 10 && (
        <p className="sk-feed-end">Vous avez tout vu 🎉</p>
      )}
    </section>
  );
}

function DesktopStudioComposer({
  avatarUrl,
  displayName,
  userIdentifier,
  cityLabel,
  country,
  isPublishing,
  publishError,
  onPublish,
}: {
  avatarUrl: string;
  displayName: string;
  userIdentifier: string;
  cityLabel: string;
  country: string;
  isPublishing: boolean;
  publishError: string | null;
  onPublish: (data: SoKinPublishPayload) => void;
}) {
  const [postType, setPostType] = useState<SoKinPostType>('SHOWCASE');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [location, setLocation] = useState('');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ok' | 'denied' | 'error'>('idle');

  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ key: string; label: string; handle: string; avatarUrl: string | null }>>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const [articleInput, setArticleInput] = useState('');
  const [articleSuggestions, setArticleSuggestions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedArticles, setSelectedArticles] = useState<string[]>([]);

  const [scheduledAt, setScheduledAt] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  const mediaRequired = MEDIA_REQUIRED_TYPES.includes(postType);
  const typeMeta = POST_TYPE_META[postType];
  const canPreview = text.trim().length > 0 || mediaFiles.length > 0;
  const hasText = text.trim().length > 0;
  const hasMedia = mediaFiles.length > 0;
  const canPublish = (hasText || hasMedia) && (!mediaRequired || hasMedia);

  useEffect(() => {
    const urls = mediaFiles.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [mediaFiles]);

  useEffect(() => {
    let cancelled = false;
    if (tagInput.trim().length < 2) {
      setTagSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const q = tagInput.trim().toLowerCase();
        const [profiles, shops] = await Promise.all([
          explorerApi.profiles({ limit: 50, city: cityLabel, country }).catch(() => []),
          explorerApi.shops({ limit: 50, city: cityLabel, country }).catch(() => []),
        ]);
        if (cancelled) return;

        const profileItems = profiles
          .filter((p) => `${p.displayName} ${p.username ?? ''}`.toLowerCase().includes(q))
          .slice(0, 5)
          .map((p) => ({
            key: `u-${p.userId}`,
            label: p.displayName,
            handle: `@${(p.username ?? p.displayName).replace(/^@/, '').replace(/\s+/g, '_')}`,
            avatarUrl: p.avatarUrl,
          }));

        const shopItems = shops
          .filter((s) => `${s.name} ${s.slug}`.toLowerCase().includes(q))
          .slice(0, 5)
          .map((s) => ({
            key: `b-${s.businessId}`,
            label: s.name,
            handle: `@${s.slug.replace(/^@/, '')}`,
            avatarUrl: s.logo ?? s.coverImage,
          }));

        setTagSuggestions([...profileItems, ...shopItems].slice(0, 8));
      } catch {
        if (!cancelled) setTagSuggestions([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tagInput, cityLabel, country]);

  useEffect(() => {
    let cancelled = false;
    if (articleInput.trim().length < 2) {
      setArticleSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const result = await listingsApi.search({ q: articleInput.trim(), city: cityLabel, country, limit: 8 });
        if (cancelled) return;
        const next = result.results.slice(0, 8).map((item) => ({
          id: item.id,
          label: `#${item.title.replace(/\s+/g, '_').slice(0, 40)}`,
        }));
        setArticleSuggestions(next);
      } catch {
        if (!cancelled) setArticleSuggestions([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [articleInput, cityLabel, country]);

  const addFiles = (fileList: FileList) => {
    setLocalError(null);
    const current = [...mediaFiles];
    let videoCount = current.filter((f) => f.type.startsWith('video/')).length;
    const toAdd: File[] = [];

    for (const f of Array.from(fileList)) {
      if (current.length + toAdd.length >= 5) break;
      if (f.type.startsWith('video/') && videoCount >= 2) continue;
      if (f.type.startsWith('video/')) videoCount += 1;
      toAdd.push(f);
    }

    if (toAdd.length === 0) {
      setLocalError('Ajout refusé: maximum 5 médias dont 2 vidéos.');
      return;
    }

    setMediaFiles([...current, ...toAdd]);
  };

  const resolveLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocalError('Géolocalisation indisponible sur cet appareil.');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const reversed = await geoApi.reverse(position.coords.latitude, position.coords.longitude);
          setLocation(reversed.city ? `${reversed.city}, ${reversed.country ?? 'RDC'}` : reversed.formattedAddress);
          setLocationStatus('ok');
        } catch {
          setLocation(`${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`);
          setLocationStatus('ok');
        }
      },
      () => {
        setLocationStatus('denied');
        setLocalError('Permission localisation refusée. Vous pouvez saisir la localisation manuellement.');
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  };

  const addTag = (handleRaw?: string) => {
    const handle = (handleRaw ?? tagInput).trim();
    if (!handle) return;
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;
    setSelectedTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setTagInput('');
    setTagSuggestions([]);
  };

  const addArticle = (valueRaw?: string) => {
    const raw = (valueRaw ?? articleInput).trim();
    if (!raw) return;
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    setSelectedArticles((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setArticleInput('');
    setArticleSuggestions([]);
  };

  const validateDesktopSchedule = (value: string): string | null => {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Date de programmation invalide.';
    const max = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (dt > max) return 'Programmation invalide: maximum 30 jours.';
    if (dt < new Date()) return 'La date de programmation est déjà passée.';
    return null;
  };

  const confirmDesktopEditor = () => {
    const err = validateDesktopSchedule(scheduledAt);
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    setIsEditorOpen(false);
  };

  const submit = () => {
    setLocalError(null);
    if (!canPublish) {
      if (mediaRequired && mediaFiles.length < 1) {
        setLocalError('Ce type de publication nécessite au moins 1 média.');
      } else {
        setLocalError('Ajoutez du texte ou au moins 1 média.');
      }
      return;
    }
    const schedErr = validateDesktopSchedule(scheduledAt);
    if (schedErr) {
      setLocalError(schedErr);
      if (!isEditorOpen) setIsEditorOpen(true);
      return;
    }

    onPublish({
      text,
      mediaFiles,
      postType,
      subject: subject.trim() || undefined,
      location: location.trim() || undefined,
      tags: selectedTags.map((v) => v.replace(/^@/, '')),
      hashtags: selectedArticles.map((v) => v.replace(/^#/, '')),
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  };

  return (
    <section className="sk-desktop-studio glass-container" aria-label="Studio So-Kin">
      <header className="sk-desktop-studio-head">
        <div>
          <strong>Studio So-Kin</strong>
          <span>Créer</span>
        </div>
        <p>Un seul flux pour publier un post et visualiser le rendu avant diffusion.</p>
      </header>

      {(publishError || localError) && <div className="sk-modal-error" role="alert">⚠️ {publishError ?? localError}</div>}

      <article className="sk-studio-card">
        <header className="sk-studio-profile">
          {avatarUrl ? (
            <img src={resolveMediaUrl(avatarUrl)} alt={displayName} className="sk-studio-avatar" />
          ) : (
            <span className="sk-studio-avatar sk-studio-avatar--empty" aria-hidden="true">{(displayName.charAt(0) || '?').toUpperCase()}</span>
          )}
          <div className="sk-studio-profile-meta">
            <strong>{displayName}</strong>
            <span>{userIdentifier}</span>
          </div>
        </header>

        <p className="sk-studio-context">Feed public ({cityLabel})</p>

        {/* ── Sélecteur de type (desktop) ── */}
        <div className="sk-type-selector" role="radiogroup" aria-label="Type de publication">
          {(Object.keys(POST_TYPE_META) as SoKinPostType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={`sk-type-chip${postType === type ? ' sk-type-chip--active' : ''}`}
              onClick={() => setPostType(type)}
              role="radio"
              aria-checked={postType === type}
            >
              <span className="sk-type-chip-icon">{POST_TYPE_META[type].icon}</span>
              <span className="sk-type-chip-label">{POST_TYPE_META[type].label}</span>
            </button>
          ))}
        </div>

        {/* ── Sujet optionnel ── */}
        {(['QUESTION', 'REVIEW', 'TREND', 'SEARCH'] as SoKinPostType[]).includes(postType) && (
          <input
            type="text"
            className="sk-modal-input sk-subject-input"
            placeholder="Sujet (optionnel)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
          />
        )}

        <p className="sk-studio-question">{typeMeta.icon} {typeMeta.label}</p>

        <textarea
          className="sk-modal-textarea sk-modal-textarea--studio"
          placeholder={typeMeta.placeholder}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          rows={7}
        />

        <div className="sk-studio-actions">
          <button type="button" className="sk-btn sk-btn--outline" onClick={() => fileRef.current?.click()} disabled={isPublishing || mediaFiles.length >= 5}>🖼️</button>
          <button type="button" className="sk-btn sk-btn--outline" onClick={() => setIsEditorOpen((v) => !v)}>{isEditorOpen ? '← Retour' : 'Éditer'}</button>
          <button type="button" className="sk-btn sk-btn--primary" onClick={() => setShowPreview(true)} disabled={!canPreview || isPublishing}>Envoyer</button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*"
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
            }}
          />
        </div>

        {mediaFiles.length > 0 && (
          <div className="sk-modal-previews">
            {mediaFiles.map((f, i) => (
              <div key={i} className="sk-modal-preview-item">
                {f.type.startsWith('video/') ? (
                  <video src={previewUrls[i]} className="sk-modal-preview-thumb" muted playsInline />
                ) : (
                  <img src={previewUrls[i]} alt="" className="sk-modal-preview-thumb" />
                )}
              </div>
            ))}
          </div>
        )}

        {isEditorOpen && (
          <section className="sk-desktop-editor-panel" aria-label="Édition enrichie">
            <label className="sk-modal-label" htmlFor="sk-location">📍 Localisation</label>
            <div className="sk-modal-tags-input-row">
              <input
                id="sk-location"
                className="sk-modal-input"
                placeholder="Gombe, Kinshasa"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <button type="button" className="sk-btn sk-btn--sm" onClick={resolveLocation} disabled={locationStatus === 'loading'}>
                {locationStatus === 'loading' ? '📍…' : '📍'}
              </button>
            </div>

            <label className="sk-modal-label" htmlFor="sk-tags">🏷️ Tags</label>
            <div className="sk-modal-tags-input-row">
              <input
                id="sk-tags"
                className="sk-modal-input"
                placeholder="Ajouter un tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />
              <button type="button" className="sk-btn sk-btn--sm" onClick={() => addTag()}>+</button>
            </div>
            {tagSuggestions.length > 0 && (
              <div className="sk-modal-suggestions">
                {tagSuggestions.map((item) => (
                  <button key={item.key} type="button" className="sk-modal-suggestion-item" onClick={() => addTag(item.handle)}>
                    {item.avatarUrl ? <img src={resolveMediaUrl(item.avatarUrl)} className="sk-modal-suggestion-avatar" alt="" /> : <span className="sk-modal-suggestion-avatar">👤</span>}
                    <span className="sk-modal-suggestion-text">
                      <strong>{item.label}</strong>
                      <span className="sk-modal-suggestion-handle">{item.handle}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedTags.length > 0 && (
              <div className="sk-modal-tags-list">
                {selectedTags.map((tag) => (
                  <span key={tag} className="sk-modal-tag">{tag}
                    <button type="button" className="sk-modal-tag-remove" onClick={() => setSelectedTags((prev) => prev.filter((v) => v !== tag))}>✕</button>
                  </span>
                ))}
              </div>
            )}

            <label className="sk-modal-label" htmlFor="sk-articles"># Articles</label>
            <div className="sk-modal-tags-input-row">
              <input
                id="sk-articles"
                className="sk-modal-input"
                placeholder="#Ajouter un article"
                value={articleInput}
                onChange={(e) => setArticleInput(e.target.value)}
              />
              <button type="button" className="sk-btn sk-btn--sm" onClick={() => addArticle()}>+</button>
            </div>
            {articleSuggestions.length > 0 && (
              <div className="sk-modal-suggestions">
                {articleSuggestions.map((item) => (
                  <button key={item.id} type="button" className="sk-modal-suggestion-item" onClick={() => addArticle(item.label)}>
                    <span className="sk-modal-suggestion-text"><strong>{item.label}</strong></span>
                  </button>
                ))}
              </div>
            )}
            {selectedArticles.length > 0 && (
              <div className="sk-modal-tags-list">
                {selectedArticles.map((tag) => (
                  <span key={tag} className="sk-modal-tag">{tag}
                    <button type="button" className="sk-modal-tag-remove" onClick={() => setSelectedArticles((prev) => prev.filter((v) => v !== tag))}>✕</button>
                  </span>
                ))}
              </div>
            )}

            <label className="sk-modal-label" htmlFor="sk-schedule">📅 Programmer (max 30j)</label>
            <input
              id="sk-schedule"
              type="datetime-local"
              className="sk-modal-input"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />

            <div className="sk-desktop-editor-actions">
              <button type="button" className="sk-btn sk-btn--outline" onClick={() => { setLocalError(null); setIsEditorOpen(false); }} disabled={isPublishing}>Annuler</button>
              <button type="button" className="sk-btn sk-btn--primary" onClick={confirmDesktopEditor} disabled={isPublishing}>Confirmer ✔</button>
            </div>
          </section>
        )}
      </article>

      {showPreview && (
        <div className="sk-desktop-preview-overlay" onClick={() => setShowPreview(false)}>
          <div className="sk-desktop-preview-modal" onClick={(e) => e.stopPropagation()}>
            <header className="sk-desktop-preview-head">
              <strong>{typeMeta.icon} {typeMeta.label} — Prévisualisation</strong>
              <button type="button" className="sk-btn sk-btn--primary" onClick={submit} disabled={isPublishing || !canPublish}>
                {isPublishing ? 'Publication…' : 'Publier'}
              </button>
            </header>
            {subject.trim() && <p className="sk-create-preview-subject"><strong>{subject}</strong></p>}
            <p className="sk-create-preview-text">{text || 'Aucun texte saisi.'}</p>
            {previewUrls.length > 0 ? (
              <div className="sk-modal-previews">
                {previewUrls.map((url, i) => (
                  <div key={i} className="sk-modal-preview-item">
                    {mediaFiles[i]?.type.startsWith('video/') ? (
                      <video src={url} className="sk-modal-preview-thumb" muted playsInline controls={false} />
                    ) : (
                      <img src={url} alt="" className="sk-modal-preview-thumb" />
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="sk-preview-metadata">
              {location && <span className="sk-preview-meta-item">📍 {location}</span>}
              {selectedTags.map((v) => <span key={v} className="sk-preview-meta-item">{v}</span>)}
              {selectedArticles.map((v) => <span key={v} className="sk-preview-meta-item">{v}</span>)}
              {scheduledAt && <span className="sk-preview-meta-item">📅 {new Date(scheduledAt).toLocaleString('fr-FR')}</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────── */
/* CREATE SCREEN — création d'annonce mobile plein écran   */
/* ─────────────────────────────────────────────────────── */

function CreateAnnounceScreen({
  onClose,
  onPublish,
  isPublishing,
  publishError,
  avatarUrl,
  displayName,
  userIdentifier,
  cityLabel,
  country,
  initialPostType = 'SHOWCASE',
}: {
  onClose: () => void;
  onPublish: (data: SoKinPublishPayload) => void;
  isPublishing: boolean;
  publishError?: string | null;
  avatarUrl: string;
  displayName: string;
  userIdentifier: string;
  cityLabel: string;
  country: string;
  initialPostType?: SoKinPostType;
}) {
  const initialDraft = useMemo(() => readSoKinCreateDraft(), []);
  const [postType, setPostType] = useState<SoKinPostType>(initialDraft.postType ?? initialPostType);
  const [subject, setSubject] = useState(initialDraft.subject ?? '');
  const [text, setText] = useState(initialDraft.text ?? '');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'editor' | 'preview'>('edit');
  const [showRestoreInfo, setShowRestoreInfo] = useState(() => text.trim().length > 0);
  const [location, setLocation] = useState(initialDraft.location ?? '');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ok' | 'denied' | 'error'>('idle');

  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<Array<{ key: string; label: string; handle: string; avatarUrl: string | null }>>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>((initialDraft.tags ?? []).map((v) => (v.startsWith('@') ? v : `@${v}`)));
  const [isSearchingTags, setIsSearchingTags] = useState(false);
  const [tagSearchNonce, setTagSearchNonce] = useState(0);

  const [articleInput, setArticleInput] = useState('');
  const [articleSuggestions, setArticleSuggestions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedArticles, setSelectedArticles] = useState<string[]>((initialDraft.hashtags ?? []).map((v) => (v.startsWith('#') ? v : `#${v}`)));
  const [isSearchingArticles, setIsSearchingArticles] = useState(false);
  const [articleSearchNonce, setArticleSearchNonce] = useState(0);

  const [scheduledAt, setScheduledAt] = useState(initialDraft.scheduledAt ?? '');
  const [editorDraft, setEditorDraft] = useState<SoKinEditorDraftState | null>(null);
  const [editorBaseline, setEditorBaseline] = useState<SoKinEditorDraftState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mediaRequired = MEDIA_REQUIRED_TYPES.includes(postType);
  const typeMeta = POST_TYPE_META[postType];
  const canPreview = text.trim().length > 0 || mediaFiles.length > 0;
  const hasText = text.trim().length > 0;
  const hasMedia = mediaFiles.length > 0;
  const canPublish = (hasText || hasMedia) && (!mediaRequired || hasMedia);
  const imageCount = mediaFiles.filter((f) => !f.type.startsWith('video/')).length;
  const videoCount = mediaFiles.filter((f) => f.type.startsWith('video/')).length;
  const hasUnsavedInput =
    text.trim().length > 0 ||
    mediaFiles.length > 0 ||
    location.trim().length > 0 ||
    selectedTags.length > 0 ||
    selectedArticles.length > 0 ||
    scheduledAt.trim().length > 0 ||
    subject.trim().length > 0;
  const maxScheduleLocal = useMemo(() => {
    const target = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const offset = target.getTimezoneOffset() * 60_000;
    return new Date(target.getTime() - offset).toISOString().slice(0, 16);
  }, []);
  const minScheduleLocal = useMemo(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  }, []);

  const validateSchedule = useCallback((raw: string): string | null => {
    if (!raw) return null;
    const dt = new Date(raw);
    const now = new Date();
    const max = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(dt.getTime())) return 'Date de programmation invalide.';
    if (dt < now) return 'La date de programmation doit être dans le futur.';
    if (dt > max) return 'Programmation invalide: maximum 30 jours dans le futur.';
    return null;
  }, []);

  const validateMediaSelection = (files: File[]) => {
    if (mediaRequired && files.length < 1) return 'Ajoutez au moins 1 média pour ce type de publication.';
    if (files.length > 5) return 'Maximum 5 médias par publication.';
    const vc = files.filter((f) => f.type.startsWith('video/')).length;
    if (vc > 2) return 'Maximum 2 vidéos par publication.';
    return null;
  };

  // Gère les object URLs pour les aperçus (nettoyage pour éviter les fuites mémoire)
  useEffect(() => {
    const urls = mediaFiles.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [mediaFiles]);

  // Bloque le scroll du body
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Autosave minimal du brouillon local (texte)
  useEffect(() => {
    try {
      const hasAnyDraft =
        text.trim().length > 0 ||
        location.trim().length > 0 ||
        selectedTags.length > 0 ||
        selectedArticles.length > 0 ||
        scheduledAt.trim().length > 0 ||
        subject.trim().length > 0;
      if (!hasAnyDraft) {
        localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        CREATE_DRAFT_STORAGE_KEY,
        JSON.stringify({
          text,
          postType,
          subject,
          location,
          tags: selectedTags.map((v) => v.replace(/^@/, '')),
          hashtags: selectedArticles.map((v) => v.replace(/^#/, '')),
          scheduledAt,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // Ignorer les erreurs storage (quota / private mode)
    }
  }, [text, postType, subject, location, selectedTags, selectedArticles, scheduledAt]);

  useEffect(() => {
    let cancelled = false;
    const query = tagInput.trim().toLowerCase();
    if (query.length < 2 && tagSearchNonce === 0) {
      setTagSuggestions([]);
      setIsSearchingTags(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingTags(true);
      try {
        const [profiles, shops] = await Promise.all([
          explorerApi.profiles({ limit: 50, city: cityLabel, country }).catch(() => []),
          explorerApi.shops({ limit: 50, city: cityLabel, country }).catch(() => []),
        ]);
        if (cancelled) return;

        const profileItems = profiles
          .filter((p) => {
            if (!query) return true;
            return `${p.displayName} ${p.username ?? ''}`.toLowerCase().includes(query);
          })
          .slice(0, 5)
          .map((p) => ({
            key: `u-${p.userId}`,
            label: p.displayName,
            handle: `@${(p.username ?? p.displayName).replace(/^@/, '').replace(/\s+/g, '_')}`,
            avatarUrl: p.avatarUrl,
          }));

        const shopItems = shops
          .filter((s) => {
            if (!query) return true;
            return `${s.name} ${s.slug}`.toLowerCase().includes(query);
          })
          .slice(0, 5)
          .map((s) => ({
            key: `b-${s.businessId}`,
            label: s.name,
            handle: `@${s.slug.replace(/^@/, '')}`,
            avatarUrl: s.logo ?? s.coverImage,
          }));

        setTagSuggestions([...profileItems, ...shopItems].slice(0, 8));
      } catch {
        if (!cancelled) setTagSuggestions([]);
      } finally {
        if (!cancelled) setIsSearchingTags(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tagInput, cityLabel, country, tagSearchNonce]);

  useEffect(() => {
    let cancelled = false;
    const query = articleInput.trim();
    if (query.length < 2 && articleSearchNonce === 0) {
      setArticleSuggestions([]);
      setIsSearchingArticles(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingArticles(true);
      try {
        const result = await listingsApi.search({ q: query || undefined, city: cityLabel, country, limit: 8 });
        if (cancelled) return;
        const next = result.results.slice(0, 8).map((item) => ({
          id: item.id,
          label: `#${item.title.replace(/\s+/g, '_').slice(0, 40)}`,
        }));
        setArticleSuggestions(next);
      } catch {
        if (!cancelled) setArticleSuggestions([]);
      } finally {
        if (!cancelled) setIsSearchingArticles(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [articleInput, cityLabel, country, articleSearchNonce]);

  // Garde-fou abandon navigateur quand le draft est en cours
  useEffect(() => {
    if (!hasUnsavedInput) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedInput]);

  const requestClose = useCallback(() => {
    if (isPublishing) return;
    if (hasUnsavedInput) {
      const confirmed = window.confirm('Vous avez un brouillon en cours. Quitter sans publier ?');
      if (!confirmed) return;
    }
    onClose();
  }, [hasUnsavedInput, isPublishing, onClose]);

  const addFiles = (fileList: FileList) => {
    setLocalError(null);
    const current = [...mediaFiles];
    let videoCount = current.filter((f) => f.type.startsWith('video/')).length;
    const toAdd: File[] = [];
    let droppedVideos = 0;
    let droppedOverflow = 0;

    for (const f of Array.from(fileList)) {
      if (current.length + toAdd.length >= 5) {
        droppedOverflow++;
        continue;
      }
      if (f.type.startsWith('video/') && videoCount >= 2) {
        droppedVideos++;
        continue;
      }
      if (f.type.startsWith('video/')) videoCount++;
      toAdd.push(f);
    }

    if (toAdd.length > 0) {
      setMediaFiles([...current, ...toAdd]);
    }

    if (droppedVideos > 0) {
      setLocalError('Maximum 2 vidéos par annonce.');
      return;
    }

    if (droppedOverflow > 0) {
      setLocalError('Maximum 5 médias par annonce.');
    }
  };

  const removeFile = (idx: number) => {
    setLocalError(null);
    setMediaFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const openPreview = () => {
    setLocalError(null);
    if (!canPreview) {
      setLocalError('Ajoutez un texte ou un média pour prévisualiser.');
      return;
    }
    const mediaError = validateMediaSelection(mediaFiles);
    if (mediaError) {
      setLocalError(mediaError);
      return;
    }
    const scheduleError = validateSchedule(scheduledAt);
    if (scheduleError) {
      setLocalError(scheduleError);
      return;
    }
    setMode('preview');
  };

  const openEditor = useCallback(() => {
    const snapshot: SoKinEditorDraftState = {
      location,
      selectedTags,
      selectedArticles,
      scheduledAt,
    };
    setEditorBaseline(snapshot);
    setEditorDraft(snapshot);
    setTagInput('');
    setTagSuggestions([]);
    setArticleInput('');
    setArticleSuggestions([]);
    setLocationStatus('idle');
    setMode('editor');
  }, [location, scheduledAt, selectedArticles, selectedTags]);

  const hasEditorChanges = useCallback(() => {
    if (!editorDraft || !editorBaseline) return false;
    return (
      editorDraft.location !== editorBaseline.location ||
      editorDraft.scheduledAt !== editorBaseline.scheduledAt ||
      editorDraft.selectedTags.join('||') !== editorBaseline.selectedTags.join('||') ||
      editorDraft.selectedArticles.join('||') !== editorBaseline.selectedArticles.join('||')
    );
  }, [editorBaseline, editorDraft]);

  const cancelEditor = useCallback(() => {
    if (isPublishing) return;
    if (hasEditorChanges()) {
      const confirmed = window.confirm('Voulez-vous abandonner les modifications ?');
      if (!confirmed) return;
    }
    setEditorDraft(null);
    setEditorBaseline(null);
    setTagInput('');
    setTagSuggestions([]);
    setArticleInput('');
    setArticleSuggestions([]);
    setLocationStatus('idle');
    setMode('edit');
  }, [hasEditorChanges, isPublishing]);

  const confirmEditor = useCallback(() => {
    if (isPublishing || !editorDraft) return;
    const scheduleError = validateSchedule(editorDraft.scheduledAt);
    if (scheduleError) {
      setLocalError(scheduleError);
      return;
    }
    setLocation(editorDraft.location);
    setSelectedTags(editorDraft.selectedTags);
    setSelectedArticles(editorDraft.selectedArticles);
    setScheduledAt(editorDraft.scheduledAt);
    setEditorDraft(null);
    setEditorBaseline(null);
    setTagInput('');
    setTagSuggestions([]);
    setArticleInput('');
    setArticleSuggestions([]);
    setLocationStatus('idle');
    setMode('edit');
  }, [editorDraft, isPublishing, validateSchedule]);

  const resolveLocation = () => {
    setLocalError(null);
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setLocalError('Géolocalisation indisponible sur cet appareil.');
      return;
    }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const reversed = await geoApi.reverse(position.coords.latitude, position.coords.longitude);
          const resolved = reversed.city ? `${reversed.city}, ${reversed.country ?? 'RDC'}` : reversed.formattedAddress;
          setEditorDraft((prev) => (prev ? { ...prev, location: resolved } : prev));
          setLocationStatus('ok');
        } catch {
          const fallback = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
          setEditorDraft((prev) => (prev ? { ...prev, location: fallback } : prev));
          setLocationStatus('ok');
        }
      },
      () => {
        setLocationStatus('denied');
        setLocalError('Permission localisation refusée. Vous pouvez saisir la localisation manuellement.');
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  };

  const addTag = (handleRaw: string) => {
    const handle = handleRaw.trim();
    if (!handle) return;
    const normalized = handle.startsWith('@') ? handle : `@${handle}`;
    setEditorDraft((prev) => {
      if (!prev) return prev;
      return prev.selectedTags.includes(normalized)
        ? prev
        : { ...prev, selectedTags: [...prev.selectedTags, normalized] };
    });
    setTagInput('');
    setTagSuggestions([]);
    setTagSearchNonce(0);
  };

  const addArticle = (item: { id: string; label: string }) => {
    const normalized = item.label.trim();
    if (!normalized || !normalized.startsWith('#')) return;
    setEditorDraft((prev) => {
      if (!prev) return prev;
      return prev.selectedArticles.includes(normalized)
        ? prev
        : { ...prev, selectedArticles: [...prev.selectedArticles, normalized] };
    });
    setArticleInput('');
    setArticleSuggestions([]);
    setArticleSearchNonce(0);
  };

  const submit = () => {
    setLocalError(null);
    if (!text.trim() && mediaFiles.length === 0) {
      setLocalError('Ajoutez du texte ou au moins 1 média.');
      setMode('edit');
      return;
    }
    const mediaError = validateMediaSelection(mediaFiles);
    if (mediaError) {
      setLocalError(mediaError);
      setMode('edit');
      return;
    }
    const scheduleError = validateSchedule(scheduledAt);
    if (scheduleError) {
      setLocalError(scheduleError);
      setMode('editor');
      return;
    }

    onPublish({
      text,
      mediaFiles,
      postType,
      subject: subject.trim() || undefined,
      location: location.trim() || undefined,
      tags: selectedTags.map((v) => v.replace(/^@/, '')),
      hashtags: selectedArticles.map((v) => v.replace(/^#/, '')),
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  };

  return (
    <section className="sk-create-screen" role="dialog" aria-modal="true" aria-label="Créer une annonce">
      <header className="sk-create-screen-head">
        {mode === 'edit' ? (
          <>
            <button type="button" className="sk-btn sk-btn--outline" onClick={requestClose} disabled={isPublishing}>Retour</button>
            <div className="sk-studio-head-title">
              <strong>Studio So-Kin</strong>
              <span>Créer</span>
            </div>
            <div className="sk-studio-head-spacer" aria-hidden="true" />
          </>
        ) : mode === 'editor' ? (
          <>
            <button type="button" className="sk-btn sk-btn--outline" onClick={cancelEditor} disabled={isPublishing}>← Annuler</button>
            <strong>Édition mobile</strong>
            <button type="button" className="sk-btn sk-btn--primary" onClick={confirmEditor} disabled={isPublishing}>Confirmer ✔</button>
          </>
        ) : (
          <>
            <button type="button" className="sk-btn sk-btn--outline" onClick={openEditor} disabled={isPublishing}>Éditer</button>
            <strong>Prévisualisation</strong>
            <button type="button" className="sk-btn sk-btn--primary" onClick={submit} disabled={!canPublish || isPublishing}>
              {isPublishing ? 'Publication…' : 'Publier'}
            </button>
          </>
        )}
      </header>

      <div className="sk-create-screen-body">
        {showRestoreInfo && (
          <div className="sk-modal-info" role="status">
            Brouillon restauré automatiquement.
            <button
              type="button"
              className="sk-modal-info-dismiss"
              onClick={() => setShowRestoreInfo(false)}
              aria-label="Masquer l'information"
            >
              ✕
            </button>
          </div>
        )}

        {(publishError || localError) && (
          <div className="sk-modal-error" role="alert">
            ⚠️ {publishError ?? localError}
          </div>
        )}

        {mode === 'edit' ? (
          <>
            <article className="sk-studio-card" aria-label="Zone de création de publication">
              <header className="sk-studio-profile">
                {avatarUrl ? (
                  <img src={resolveMediaUrl(avatarUrl)} alt={displayName} className="sk-studio-avatar" />
                ) : (
                  <span className="sk-studio-avatar sk-studio-avatar--empty" aria-hidden="true">{(displayName.charAt(0) || '?').toUpperCase()}</span>
                )}
                <div className="sk-studio-profile-meta">
                  <strong>{displayName}</strong>
                  <span>{userIdentifier}</span>
                </div>
              </header>

              <p className="sk-studio-context">Feed public {cityLabel}</p>

              {/* ── Sélecteur de type ── */}
              <div className="sk-type-selector" role="radiogroup" aria-label="Type de publication">
                {(Object.keys(POST_TYPE_META) as SoKinPostType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`sk-type-chip${postType === type ? ' sk-type-chip--active' : ''}`}
                    onClick={() => setPostType(type)}
                    role="radio"
                    aria-checked={postType === type}
                  >
                    <span className="sk-type-chip-icon">{POST_TYPE_META[type].icon}</span>
                    <span className="sk-type-chip-label">{POST_TYPE_META[type].label}</span>
                  </button>
                ))}
              </div>

              {/* ── Sujet optionnel ── */}
              {(['QUESTION', 'REVIEW', 'TREND', 'SEARCH'] as SoKinPostType[]).includes(postType) && (
                <input
                  type="text"
                  className="sk-modal-input sk-subject-input"
                  placeholder="Sujet (optionnel)"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                />
              )}

              <p className="sk-studio-question">{typeMeta.icon} {typeMeta.label}</p>

              <div className="sk-studio-text-wrap">
                <textarea
                  ref={textareaRef}
                  className="sk-modal-textarea sk-modal-textarea--studio"
                  placeholder={typeMeta.placeholder}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setLocalError(null);
                  }}
                  rows={7}
                  maxLength={500}
                  autoFocus
                />
                <button
                  type="button"
                  className="sk-studio-media-btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={mediaFiles.length >= 5 || isPublishing}
                  aria-label="Ajouter un média"
                  title="Ajouter un média"
                >
                  🖼️
                </button>
              </div>

              <span className="sk-modal-char-count">{text.length}/500</span>

              <div className="sk-studio-actions">
                <button
                  type="button"
                  className="sk-btn sk-btn--outline"
                  onClick={openEditor}
                  disabled={isPublishing}
                >
                  Éditer
                </button>
                <button
                  type="button"
                  className="sk-btn sk-btn--primary"
                  onClick={openPreview}
                  disabled={!canPreview || isPublishing}
                >
                  Envoyer
                </button>
              </div>
            </article>

            {mediaFiles.length > 0 && (
              <div className="sk-modal-previews">
                {mediaFiles.map((f, i) => (
                  <div key={i} className="sk-modal-preview-item">
                    {f.type.startsWith('video/') ? (
                      <video src={previewUrls[i]} className="sk-modal-preview-thumb" muted playsInline />
                    ) : (
                      <img src={previewUrls[i]} alt="" className="sk-modal-preview-thumb" />
                    )}
                    <button
                      type="button"
                      className="sk-modal-preview-remove"
                      onClick={() => removeFile(i)}
                      aria-label="Supprimer ce média"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="sk-modal-media-row">
              <span className="sk-modal-media-hint">Médias: {mediaFiles.length}/5 {mediaRequired ? '(obligatoire)' : '(optionnel)'}</span>
              <span className="sk-modal-media-hint">Jusqu'à 5 médias, dont 2 vidéos max</span>
              <span className="sk-media-counter" aria-live="polite">
                {imageCount} image{imageCount > 1 ? 's' : ''} / {videoCount} vidéo{videoCount > 1 ? 's' : ''}
              </span>
              <span className="sk-media-counter" aria-live="polite">
                Détails: {selectedTags.length + selectedArticles.length + (location ? 1 : 0) + (scheduledAt ? 1 : 0)}
              </span>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,video/*"
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                }}
              />
            </div>
          </>
        ) : mode === 'editor' ? (
          <article className="sk-mobile-editor-panel" aria-label="Édition enrichie mobile">
            <section className="sk-modal-section">
              <label className="sk-modal-label" htmlFor="sk-mobile-location">📍 Localisation</label>
              <div className="sk-modal-tags-input-row">
                <input
                  id="sk-mobile-location"
                  className="sk-modal-input"
                  placeholder="Gombe, Kinshasa"
                  value={editorDraft?.location ?? ''}
                  onChange={(e) => setEditorDraft((prev) => (prev ? { ...prev, location: e.target.value } : prev))}
                />
                <button type="button" className="sk-btn sk-btn--sm" onClick={resolveLocation} disabled={locationStatus === 'loading'}>
                  {locationStatus === 'loading' ? '📍…' : '📍'}
                </button>
              </div>
              {locationStatus === 'ok' && <p className="sk-modal-hint">Localisation mise à jour.</p>}
              {locationStatus === 'denied' && <p className="sk-modal-hint">Permission refusée: saisissez la zone manuellement.</p>}
              {locationStatus === 'error' && <p className="sk-modal-hint">Localisation indisponible sur cet appareil.</p>}
            </section>

            <section className="sk-modal-section">
              <label className="sk-modal-label" htmlFor="sk-mobile-tags">🏷️ Tags</label>
              <div className="sk-modal-tags-input-row">
                <input
                  id="sk-mobile-tags"
                  className="sk-modal-input"
                  placeholder="Ajouter un tag"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setTagSearchNonce(0);
                  }}
                />
                <button
                  type="button"
                  className="sk-btn sk-btn--sm"
                  onClick={() => setTagSearchNonce((v) => v + 1)}
                >
                  +
                </button>
              </div>
              {isSearchingTags && <p className="sk-modal-searching">Recherche des profils Kin-Sell…</p>}
              {tagSuggestions.length > 0 && (
                <div className="sk-modal-suggestions">
                  {tagSuggestions.map((item) => (
                    <button key={item.key} type="button" className="sk-modal-suggestion-item" onClick={() => addTag(item.handle)}>
                      {item.avatarUrl ? <img src={resolveMediaUrl(item.avatarUrl)} className="sk-modal-suggestion-avatar" alt="" /> : <span className="sk-modal-suggestion-avatar">👤</span>}
                      <span className="sk-modal-suggestion-text">
                        <strong>{item.label}</strong>
                        <span className="sk-modal-suggestion-handle">{item.handle}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {(editorDraft?.selectedTags.length ?? 0) > 0 && (
                <div className="sk-modal-tags-list">
                  {(editorDraft?.selectedTags ?? []).map((tag) => (
                    <span key={tag} className="sk-modal-tag">{tag}
                      <button
                        type="button"
                        className="sk-modal-tag-remove"
                        onClick={() => setEditorDraft((prev) => (prev ? { ...prev, selectedTags: prev.selectedTags.filter((v) => v !== tag) } : prev))}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="sk-modal-section">
              <label className="sk-modal-label" htmlFor="sk-mobile-articles"># Articles</label>
              <div className="sk-modal-tags-input-row">
                <input
                  id="sk-mobile-articles"
                  className="sk-modal-input"
                  placeholder="#Ajouter un article"
                  value={articleInput}
                  onChange={(e) => {
                    setArticleInput(e.target.value);
                    setArticleSearchNonce(0);
                  }}
                />
                <button
                  type="button"
                  className="sk-btn sk-btn--sm"
                  onClick={() => setArticleSearchNonce((v) => v + 1)}
                >
                  +
                </button>
              </div>
              {isSearchingArticles && <p className="sk-modal-searching">Recherche des articles…</p>}
              {articleSuggestions.length > 0 && (
                <div className="sk-modal-suggestions">
                  {articleSuggestions.map((item) => (
                    <button key={item.id} type="button" className="sk-modal-suggestion-item" onClick={() => addArticle(item)}>
                      <span className="sk-modal-suggestion-text"><strong>{item.label}</strong></span>
                    </button>
                  ))}
                </div>
              )}
              {(editorDraft?.selectedArticles.length ?? 0) > 0 && (
                <div className="sk-modal-tags-list">
                  {(editorDraft?.selectedArticles ?? []).map((tag) => (
                    <span key={tag} className="sk-modal-tag">{tag}
                      <button
                        type="button"
                        className="sk-modal-tag-remove"
                        onClick={() => setEditorDraft((prev) => (prev ? { ...prev, selectedArticles: prev.selectedArticles.filter((v) => v !== tag) } : prev))}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="sk-modal-section">
              <label className="sk-modal-label" htmlFor="sk-mobile-schedule">📅 Programmer (max 30j)</label>
              <input
                id="sk-mobile-schedule"
                type="datetime-local"
                className="sk-modal-input"
                value={editorDraft?.scheduledAt ?? ''}
                min={minScheduleLocal}
                max={maxScheduleLocal}
                onChange={(e) => {
                  setEditorDraft((prev) => (prev ? { ...prev, scheduledAt: e.target.value } : prev));
                  const nextError = validateSchedule(e.target.value);
                  setLocalError(nextError);
                }}
              />
              <p className="sk-modal-hint">Format: jj/mm/aaaa --:--, limite 30 jours.</p>
              {editorDraft?.scheduledAt && !validateSchedule(editorDraft.scheduledAt) && (
                <p className="sk-modal-hint">Sélection: {new Date(editorDraft.scheduledAt).toLocaleString('fr-FR')}</p>
              )}
            </section>

            <div className="sk-mobile-editor-actions">
              <button
                type="button"
                className="sk-btn sk-btn--outline"
                onClick={cancelEditor}
                disabled={isPublishing}
              >
                Annuler
              </button>
              <button
                type="button"
                className="sk-btn sk-btn--primary"
                onClick={confirmEditor}
                disabled={isPublishing}
              >
                Confirmer ✔
              </button>
            </div>
          </article>
        ) : (
          <article className="sk-create-preview-card" aria-label="Prévisualisation annonce">
            <header className="sk-studio-profile">
              {avatarUrl ? (
                <img src={resolveMediaUrl(avatarUrl)} alt={displayName} className="sk-studio-avatar" />
              ) : (
                <span className="sk-studio-avatar sk-studio-avatar--empty" aria-hidden="true">{(displayName.charAt(0) || '?').toUpperCase()}</span>
              )}
              <div className="sk-studio-profile-meta">
                <strong>{displayName}</strong>
                <span>{userIdentifier}</span>
              </div>
            </header>
            <h3 className="sk-create-preview-title">{typeMeta.icon} {typeMeta.label} — Publication prête</h3>
            {subject.trim() && <p className="sk-create-preview-subject"><strong>{subject}</strong></p>}
            <p className="sk-create-preview-text">{text.trim() || 'Aucun texte saisi.'}</p>
            {mediaFiles.length > 0 ? (
              <div className="sk-modal-previews">
                {mediaFiles.map((f, i) => (
                  <div key={i} className="sk-modal-preview-item">
                    {f.type.startsWith('video/') ? (
                      <video src={previewUrls[i]} className="sk-modal-preview-thumb" muted playsInline controls={false} />
                    ) : (
                      <img src={previewUrls[i]} alt="" className="sk-modal-preview-thumb" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="sk-modal-media-hint">Aucun média ajouté.</p>
            )}
            <div className="sk-preview-metadata">
              {location && <span className="sk-preview-meta-item">📍 {location}</span>}
              {selectedTags.map((v) => <span key={v} className="sk-preview-meta-item">{v}</span>)}
              {selectedArticles.map((v) => <span key={v} className="sk-preview-meta-item">{v}</span>)}
              {scheduledAt && <span className="sk-preview-meta-item">📅 {new Date(scheduledAt).toLocaleString('fr-FR')}</span>}
            </div>

            <div className="sk-preview-actions">
              <button type="button" className="sk-btn sk-btn--outline" onClick={openEditor} disabled={isPublishing}>Éditer</button>
              <button type="button" className="sk-btn sk-btn--primary" onClick={submit} disabled={!canPublish || isPublishing}>
                {isPublishing ? '⏳ Publication…' : '🚀 Publier'}
              </button>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────── */
/* MAIN: So-Kin Page                                        */
/* ─────────────────────────────────────────────────────── */

export function SoKinPage() {
  const navigate = useNavigate();
  const { isLoggedIn, user, logout } = useAuth();
  const { t } = useLocaleCurrency();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const { on, off } = useSocket();
  const isMobile = useIsMobile(1023);

  // ── State — TOUS les hooks avant tout return conditionnel ──
  const scrollDir = useScrollDirection();

  const [posts, setPosts] = useState<SoKinApiFeedPost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [showCreateScreen, setShowCreateScreen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [overlayUiLock, setOverlayUiLock] = useState(false);
  const [myPublishedPosts, setMyPublishedPosts] = useState<SoKinApiPost[]>([]);
  const [loadingMyPublishedPosts, setLoadingMyPublishedPosts] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [togglingPostId, setTogglingPostId] = useState<string | null>(null);
  const [contentTab, setContentTab] = useState<SoKinContentTab>('all');
  const [postCounts, setPostCounts] = useState<Record<string, number>>({ ACTIVE: 0, HIDDEN: 0, ARCHIVED: 0, DELETED: 0 });
  const [archivingPostId, setArchivingPostId] = useState<string | null>(null);
  const [feedTab, setFeedTab] = useState<FeedTab>('pour-toi');

  // Viewer (géré au niveau page : un seul à la fois)
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null);
  // Commentaires
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, SoKinApiComment[]>>({});
  const [loadingCommentsPostId, setLoadingCommentsPostId] = useState<string | null>(null);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyToComment, setReplyToComment] = useState<SoKinApiComment | null>(null);
  const [commentSort, setCommentSort] = useState<'recent' | 'relevant'>('recent');
  const [commentProfileState, setCommentProfileState] = useState<CommentProfileState>({
    status: 'idle',
    profile: null,
    message: null,
  });
  // Ouverture messagerie depuis une annonce
  const [contactingPostId, setContactingPostId] = useState<string | null>(null);
  const [desktopSearch, setDesktopSearch] = useState('');
  const [desktopHelpOpen, setDesktopHelpOpen] = useState(false);
  const [desktopNotifOpen, setDesktopNotifOpen] = useState(false);
  const [desktopAccountOpen, setDesktopAccountOpen] = useState(false);
  const [desktopNotifications, setDesktopNotifications] = useState<HeaderNotification[]>([]);

  const city = user?.profile?.city ?? getCountryConfig(effectiveCountry).defaultCity;
  const country = effectiveCountry;
  const avatarUrl = user?.profile?.avatarUrl ?? '';
  const displayName = user?.profile?.displayName ?? 'Utilisateur';
  const dashboardPath = getDashboardPath(user?.role);

  // ── Chargement du fil ──
  const VENTES_TYPES = ['SELLING', 'PROMO', 'SHOWCASE'];
  const loadFeed = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;
      if (!reset && !hasMore) return;
      loadingRef.current = true;
      try {
        const limit = 20;
        const currentOffset = reset ? 0 : offsetRef.current;
        const feedParams: { limit: number; offset: number; city?: string; types?: string[] } = { limit, offset: currentOffset };
        if (feedTab === 'local') feedParams.city = city;
        if (feedTab === 'ventes') feedParams.types = VENTES_TYPES;
        const data = await sokinApi.publicFeed(feedParams);
        const incoming = data.posts;
        if (reset) {
          setPosts(incoming);
          offsetRef.current = incoming.length;
          setLoadingFeed(false);
        } else {
          setPosts((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            const fresh = incoming.filter((p) => !ids.has(p.id));
            offsetRef.current += fresh.length;
            return [...prev, ...fresh];
          });
        }
        setHasMore(incoming.length >= limit);
      } catch {
        setHasMore(false);
        if (reset) setLoadingFeed(false);
      } finally {
        loadingRef.current = false;
      }
    },
    [hasMore, feedTab, city]
  );

  const loadMyPublishedPosts = useCallback(async (tab?: SoKinContentTab) => {
    if (!isLoggedIn) {
      setMyPublishedPosts([]);
      return;
    }
    setLoadingMyPublishedPosts(true);
    try {
      const filterTab = tab ?? contentTab;
      const [postsData, countsData] = await Promise.all([
        sokinApi.myPosts({ status: filterTab === 'all' ? undefined : filterTab }),
        sokinApi.myCounts().catch(() => ({ counts: {} })),
      ]);
      const posts = postsData.posts ?? [];
      // Si onglet 'all', on exclut DELETED pour ne pas polluer la vue par défaut
      setMyPublishedPosts(filterTab === 'all' ? posts.filter((p) => p.status !== 'DELETED') : posts);
      setPostCounts({
        ACTIVE: 0, HIDDEN: 0, ARCHIVED: 0, DELETED: 0,
        ...countsData.counts,
      });
    } catch {
      setMyPublishedPosts([]);
    } finally {
      setLoadingMyPublishedPosts(false);
    }
  }, [isLoggedIn, contentTab]);

  // Chargement initial
  useEffect(() => {
    void loadFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rechargement quand l'onglet feed change
  useEffect(() => {
    setPosts([]);
    offsetRef.current = 0;
    setHasMore(true);
    setLoadingFeed(true);
    void loadFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedTab]);

  useEffect(() => {
    void loadMyPublishedPosts();
  }, [loadMyPublishedPosts]);

  useEffect(() => {
    if (!isLoggedIn) {
      setDesktopNotifications([]);
      return;
    }
    let cancelled = false;
    const loadDesktopNotifications = async () => {
      try {
        const [buyerData, sellerData] = await Promise.all([
          ordersApi.buyerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
          ordersApi.sellerOrders({ limit: 5, inProgressOnly: true }).catch(() => null),
        ]);
        if (cancelled) return;

        const notifs: HeaderNotification[] = [];
        if (buyerData) {
          for (const o of buyerData.orders) {
            const statusLabel = o.status === 'SHIPPED' ? 'Expédiée' : o.status === 'CONFIRMED' ? 'Confirmée' : 'En cours';
            notifs.push({
              id: `buy-${o.id}`,
              label: `Commande ${statusLabel}`,
              detail: `#${o.id.slice(0, 8).toUpperCase()} • ${o.itemsCount} article${o.itemsCount > 1 ? 's' : ''}`,
              href: getDashboardPath(user?.role),
              icon: '📦',
              time: new Date(o.createdAt).toLocaleDateString('fr-FR'),
            });
          }
        }
        if (sellerData) {
          for (const o of sellerData.orders) {
            notifs.push({
              id: `sell-${o.id}`,
              label: 'Nouvelle commande reçue',
              detail: `#${o.id.slice(0, 8).toUpperCase()} • ${o.buyer.displayName}`,
              href: getDashboardPath(user?.role),
              icon: '🛒',
              time: new Date(o.createdAt).toLocaleDateString('fr-FR'),
            });
          }
        }
        setDesktopNotifications(notifs);
      } catch {
        if (!cancelled) setDesktopNotifications([]);
      }
    };
    void loadDesktopNotifications();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, user?.role]);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDesktopHelpOpen(false);
      setDesktopNotifOpen(false);
      setDesktopAccountOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  const handleDesktopSearch = useCallback(() => {
    const q = desktopSearch.trim();
    if (!q) {
      navigate('/explorer');
      return;
    }
    navigate(`/explorer?q=${encodeURIComponent(q)}`);
  }, [desktopSearch, navigate]);

  const handleDesktopLogout = useCallback(async () => {
    await logout();
    setDesktopAccountOpen(false);
    navigate('/login');
  }, [logout, navigate]);

  // Scroll infini
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !loadingRef.current) void loadFeed();
      },
      { rootMargin: '300px' }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadFeed]);

  // Socket : nouveaux posts en temps réel
  useEffect(() => {
    const handleNewPost = (payload: { sourceUserId?: string }) => {
      if (payload?.sourceUserId === user?.id) return;
      void loadFeed(true);
    };
    on('sokin:post-created', handleNewPost);
    return () => off('sokin:post-created', handleNewPost);
  }, [user?.id, on, off, loadFeed]);

  // ── Handlers ──
  const loadComments = useCallback(async (postId: string, sort: 'recent' | 'relevant' = 'recent') => {
    setLoadingCommentsPostId(postId);
    try {
      const data = await sokinApi.postComments(postId, { limit: 100, sort });
      setCommentsByPost((prev) => ({ ...prev, [postId]: data.comments ?? [] }));
    } catch {
      setCommentsByPost((prev) => ({ ...prev, [postId]: [] }));
    } finally {
      setLoadingCommentsPostId((prev) => (prev === postId ? null : prev));
    }
  }, []);

  const clearCommentsComposer = useCallback(() => {
    setReplyToComment(null);
    setCommentProfileState({ status: 'idle', profile: null, message: null });
    setCommentDraft('');
  }, []);

  const handleOpenComments = useCallback((postId: string) => {
    setOpenCommentsPostId(postId);
    setCommentSort('recent');
    clearCommentsComposer();
    void loadComments(postId, 'recent');
  }, [clearCommentsComposer, loadComments]);

  const handleCommentSortChange = useCallback((newSort: 'recent' | 'relevant') => {
    setCommentSort(newSort);
    if (openCommentsPostId) {
      void loadComments(openCommentsPostId, newSort);
    }
  }, [openCommentsPostId, loadComments]);

  const handleCloseComments = useCallback(() => {
    setOpenCommentsPostId(null);
    clearCommentsComposer();
  }, [clearCommentsComposer]);

  const handlePrepareReply = useCallback((comment: SoKinApiComment) => {
    const targetName = comment.author.profile?.displayName ?? 'Utilisateur';
    const mention = `@${targetName}`;
    setReplyToComment(comment);
    setCommentDraft((prev) => {
      const trimmed = prev.trim();
      if (trimmed.startsWith(mention)) return prev;
      if (!trimmed) return `${mention} `;
      return `${mention} ${trimmed}`;
    });
  }, []);

  const handleOpenCommentProfile = useCallback(async (comment: SoKinApiComment) => {
    const profilePreview: MissingPublicProfile = {
      avatarUrl: comment.author.profile?.avatarUrl ?? null,
      displayName: comment.author.profile?.displayName ?? 'Utilisateur',
      identifier: comment.author.profile?.username ? `@${comment.author.profile.username.replace('@', '')}` : comment.author.id,
    };

    const normalizeUsername = (value?: string | null) => (value ?? '').replace('@', '').trim();
    const getErrorStatus = (error: unknown) => {
      if (error instanceof ApiError) return error.status;
      return undefined;
    };

    const openResolvedProfile = (username: string) => {
      setCommentProfileState({ status: 'success', profile: profilePreview, message: null });
      navigate(`/user/${username}`);
    };

    setCommentProfileState({
      status: 'loading',
      profile: profilePreview,
      message: 'Chargement du profil public…',
    });

    const directUsername = normalizeUsername(comment.author.profile?.username);

    if (directUsername) {
      try {
        await usersApi.publicProfile(directUsername);
        openResolvedProfile(directUsername);
        return;
      } catch (error) {
        const status = getErrorStatus(error);
        if (status !== 404) {
          setCommentProfileState({
            status: 'error',
            profile: profilePreview,
            message: 'Erreur technique: impossible d’ouvrir le profil public pour le moment.',
          });
          return;
        }
      }
    }

    try {
      const payload = (await usersApi.publicProfileById(comment.author.id)) as { username?: string | null };
      const resolved = normalizeUsername(payload?.username);
      if (resolved) {
        openResolvedProfile(resolved);
        return;
      }

      setCommentProfileState({
        status: 'not-available',
        profile: profilePreview,
        message: 'L\'utilisateur ou l\'entreprise n\'a pas de profil public ou de boutique en ligne.',
      });
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 404) {
        setCommentProfileState({
          status: 'not-available',
          profile: profilePreview,
          message: 'L\'utilisateur ou l\'entreprise n\'a pas de profil public ou de boutique en ligne.',
        });
        return;
      }

      setCommentProfileState({
        status: 'error',
        profile: profilePreview,
        message: 'Erreur technique: impossible d’ouvrir le profil public pour le moment.',
      });
    }
  }, [navigate]);

  const handleSubmitComment = useCallback(async () => {
    if (!openCommentsPostId) return;
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    const content = commentDraft.trim();
    if (!content) return;

    setSubmittingCommentPostId(openCommentsPostId);
    try {
      const payload = await sokinApi.createComment(openCommentsPostId, {
        content,
        parentCommentId: replyToComment?.id,
      });
      const created = payload.comment;

      setCommentsByPost((prev) => ({
        ...prev,
        [openCommentsPostId]: [created, ...(prev[openCommentsPostId] ?? [])],
      }));
      setPosts((prev) => prev.map((p) => p.id === openCommentsPostId ? { ...p, comments: (p.comments ?? 0) + 1 } : p));
      setCommentDraft('');
      setReplyToComment(null);
    } catch {
      // no-op UI: conserver le draft pour permettre la ré-émission
    } finally {
      setSubmittingCommentPostId((prev) => (prev === openCommentsPostId ? null : prev));
    }
  }, [openCommentsPostId, isLoggedIn, navigate, commentDraft, replyToComment]);

  const handleContact = useCallback(async (post: SoKinApiFeedPost) => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    if (!user?.id || post.author.id === user.id) return;
    if (contactingPostId) return;

    setContactingPostId(post.id);
    try {
      const { conversation } = await messaging.createDM(post.author.id);
      const mainMedia = post.mediaUrls?.[0] ? resolveMediaUrl(post.mediaUrls[0]) : null;
      const textPreview = (post.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const postRef: SoKinPostRef = {
        id: post.id,
        text: textPreview,
        mediaUrl: mainMedia,
        authorName: post.author.profile?.displayName ?? 'Utilisateur',
        authorId: post.author.id,
        authorHandle: post.author.profile?.username ?? post.author.id,
      };
      navigate(`/messaging/${conversation.id}`, { state: { sokinPost: postRef } });
    } catch {
      navigate('/messaging');
    } finally {
      setContactingPostId(null);
    }
  }, [isLoggedIn, user?.id, contactingPostId, navigate]);

  const handleOpenCreate = useCallback(() => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    setShowCreateScreen(true);
  }, [isLoggedIn, navigate]);

  const handleCloseCreate = useCallback(() => {
    setShowCreateScreen(false);
  }, []);

  const openAccountArticles = useCallback(() => {
    try {
      sessionStorage.setItem('ud-section', 'articles');
    } catch {
      // no-op
    }
    navigate(dashboardPath || '/account');
  }, [dashboardPath, navigate]);

  const handleOpenPublishedPost = useCallback(async (postId: string) => {
    try {
      const found = posts.find((item) => item.id === postId);
      if (found) {
        setPosts((prev) => [found, ...prev.filter((item) => item.id !== found.id)]);
        return;
      }
      const payload = await sokinApi.publicPost(postId);
      if (payload?.post) {
        setPosts((prev) => [payload.post, ...prev.filter((item) => item.id !== payload.post.id)]);
      }
    } catch {
      openAccountArticles();
    }
  }, [posts, openAccountArticles]);

  const handleDeletePublishedPost = useCallback(async (postId: string) => {
    if (deletingPostId) return;
    const confirmed = window.confirm('Supprimer cette annonce publiée ?');
    if (!confirmed) return;
    setDeletingPostId(postId);
    try {
      await sokinApi.deletePost(postId);
      setMyPublishedPosts((prev) => prev.filter((item) => item.id !== postId));
      setPosts((prev) => prev.filter((item) => item.id !== postId));
    } finally {
      setDeletingPostId(null);
    }
  }, [deletingPostId]);

  const handleTogglePublishedPost = useCallback(async (postId: string) => {
    if (togglingPostId) return;
    setTogglingPostId(postId);
    try {
      const data = await sokinApi.togglePost(postId);
      const updated = data.post;
      setMyPublishedPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: updated.status } : p)));
      if (updated.status === 'HIDDEN') {
        setPosts((prev) => prev.filter((item) => item.id !== postId));
      }
    } catch {
      // no-op
    } finally {
      setTogglingPostId(null);
    }
  }, [togglingPostId]);

  const handleEditPublishedPost = useCallback((postId: string) => {
    try {
      sessionStorage.setItem('ud-section', 'articles');
      sessionStorage.setItem('ud-edit-sokin-post-id', postId);
    } catch {
      // no-op
    }
    navigate(dashboardPath || '/account');
  }, [dashboardPath, navigate]);

  const handleArchivePublishedPost = useCallback(async (postId: string) => {
    if (archivingPostId) return;
    setArchivingPostId(postId);
    try {
      const updated = await sokinApi.archivePost(postId);
      setMyPublishedPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: updated.status } : p)));
      if (updated.status === 'ARCHIVED') {
        setPosts((prev) => prev.filter((item) => item.id !== postId));
      }
      setPostCounts((prev) => {
        const next = { ...prev };
        if (updated.status === 'ARCHIVED') {
          next.ACTIVE = Math.max(0, (next.ACTIVE ?? 0) - 1);
          next.ARCHIVED = (next.ARCHIVED ?? 0) + 1;
        } else {
          next.ARCHIVED = Math.max(0, (next.ARCHIVED ?? 0) - 1);
          next.ACTIVE = (next.ACTIVE ?? 0) + 1;
        }
        return next;
      });
    } catch {
      // no-op
    } finally {
      setArchivingPostId(null);
    }
  }, [archivingPostId]);

  const handleContentTabChange = useCallback((tab: SoKinContentTab) => {
    setContentTab(tab);
    void loadMyPublishedPosts(tab);
  }, [loadMyPublishedPosts]);

  const handlePublish = async (data: SoKinPublishPayload) => {
    if (isPublishing || !isLoggedIn) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      if (!data.text.trim()) {
        throw new Error('Le texte de la publication est obligatoire.');
      }

      const mediaUrls = await Promise.all(
        data.mediaFiles.map((f) => prepareMediaUrl(f))
      );

      const created = await sokinApi.createPost({
        text: data.text,
        mediaUrls,
        postType: data.postType,
        subject: data.subject,
        location: data.location,
        tags: data.tags,
        hashtags: data.hashtags,
        scheduledAt: data.scheduledAt,
      });

      if (!created?.id) {
        throw new Error('Publication non confirmée par le serveur.');
      }

      try {
        localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore storage failures
      }

      setShowCreateScreen(false);

      try {
        const full = await sokinApi.publicPost(created.id);
        setPosts((prev) => [full.post, ...prev.filter((item) => item.id !== full.post.id)]);
      } catch {
        void loadFeed(true);
      }
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : 'Erreur lors de la publication'
      );
    } finally {
      setIsPublishing(false);
    }
  };

  // Anti-flicker overlays: petit verrou de visibilité après transitions d'ouverture/fermeture
  useEffect(() => {
    setOverlayUiLock(true);
    const timer = window.setTimeout(() => setOverlayUiLock(false), OVERLAY_VISIBILITY_LOCK_MS);
    return () => window.clearTimeout(timer);
  }, [showCreateScreen, openCommentsPostId, viewerItem]);

  // ── Mobile: retour physique ferme les commentaires au lieu de quitter la page ──
  useEffect(() => {
    if (!openCommentsPostId) return;
    const onPopState = (e: PopStateEvent) => {
      e.preventDefault();
      handleCloseComments();
    };
    window.history.pushState({ skComments: true }, '');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [openCommentsPostId, handleCloseComments]);

  // ── Mobile manage posts drawer ──
  const [showMobileManage, setShowMobileManage] = useState(false);

  // ── Visibility des barres (top bar + FAB) ──
  const hasActiveOverlay = showCreateScreen || Boolean(openCommentsPostId) || Boolean(viewerItem) || showMobileManage;
  const fabVisible = !showCreateScreen && !openCommentsPostId && !viewerItem && !showMobileManage && (overlayUiLock || scrollDir === 'up');
  const barsVisible =
    hasActiveOverlay ||
    overlayUiLock ||
    scrollDir === 'up';

  return (
    <>
      <SeoMeta
        title="So-Kin — Annonces Kin-Sell"
        description="Publiez et découvrez des annonces à Kinshasa et en RDC."
        canonical="https://kin-sell.com/sokin"
      />

      {isMobile ? (
        <>
          <div className={`sk-page${barsVisible ? '' : ' sk-page--expanded'}`}>
            {/* ── Barre supérieure ── */}
            <header className={`sk-topbar${barsVisible ? '' : ' sk-topbar--hidden'}`}>
              <button
                type="button"
                className="sk-topbar-back"
                onClick={() => navigate('/')}
                aria-label="Retour à l'accueil"
              >
                <IconBack />
              </button>
              <div className="sk-topbar-center">
                <span className="sk-topbar-title">So-Kin</span>
                <span className="sk-topbar-sub">{FEED_TABS.find((ft) => ft.key === feedTab)?.label ?? 'Feed'}</span>
              </div>
              <div className="sk-topbar-end" aria-hidden="true" />
            </header>

            {/* ── Onglets de feed ── */}
            <nav className="sk-feed-tabs" aria-label="Onglets du fil">
              {FEED_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`sk-feed-tab${feedTab === tab.key ? ' sk-feed-tab--active' : ''}`}
                  onClick={() => setFeedTab(tab.key)}
                >
                  <span className="sk-feed-tab-icon">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>

            <ComposeZone
              avatarUrl={avatarUrl}
              displayName={displayName}
              onCreatePost={handleOpenCreate}
            />

            <AnnouncesFeed
              posts={posts}
              hasMore={hasMore}
              loading={loadingFeed}
              sentinelRef={sentinelRef}
              t={t}
              isLoggedIn={isLoggedIn}
              openCommentsPostId={openCommentsPostId}
              onOpenComments={handleOpenComments}
              onMediaClick={(item) => setViewerItem(item)}
              onContact={handleContact}
              contactingPostId={contactingPostId}
            />
          </div>

          <button
            type="button"
            className={`sk-floating-create${fabVisible ? '' : ' sk-floating-create--hidden'}`}
            aria-label="Mon contenu"
            onClick={async () => { if (!isLoggedIn) { navigate('/login'); return; } setShowMobileManage(true); await loadMyPublishedPosts(); }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>

          {/* ── Mobile: Mon contenu Drawer ── */}
          {showMobileManage && (
            <div className="sk-mobile-manage-overlay" onClick={() => setShowMobileManage(false)}>
              <aside className="sk-mobile-manage-drawer" onClick={(e) => e.stopPropagation()}>
                <header className="sk-mobile-manage-header">
                  <h3>📋 Mon contenu</h3>
                  <button type="button" onClick={() => setShowMobileManage(false)} className="sk-mobile-manage-close">✕</button>
                </header>

                {/* Onglets de filtre */}
                <nav className="sk-content-tabs" aria-label="Filtrer par statut">
                  {([
                    ['all', 'Tout', postCounts.ACTIVE + postCounts.HIDDEN + postCounts.ARCHIVED],
                    ['ACTIVE', 'Publiés', postCounts.ACTIVE],
                    ['HIDDEN', 'Masqués', postCounts.HIDDEN],
                    ['ARCHIVED', 'Archivés', postCounts.ARCHIVED],
                    ['DELETED', 'Supprimés', postCounts.DELETED],
                  ] as [SoKinContentTab, string, number][]).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      className={`sk-content-tab${contentTab === key ? ' sk-content-tab--active' : ''}`}
                      onClick={() => handleContentTabChange(key)}
                    >
                      {label} <span className="sk-content-tab-count">{count}</span>
                    </button>
                  ))}
                </nav>

                <div className="sk-mobile-manage-body">
                  {loadingMyPublishedPosts ? (
                    <p className="sk-mobile-manage-empty">Chargement…</p>
                  ) : myPublishedPosts.length === 0 ? (
                    <p className="sk-mobile-manage-empty">Aucune publication dans cette catégorie.</p>
                  ) : (
                    myPublishedPosts.map((post) => {
                      const statusConfig: Record<string, { icon: string; label: string; cls: string }> = {
                        ACTIVE: { icon: '🟢', label: 'Publié', cls: 'sk-mobile-manage-status--active' },
                        HIDDEN: { icon: '🟡', label: 'Masqué', cls: 'sk-mobile-manage-status--hidden' },
                        ARCHIVED: { icon: '📦', label: 'Archivé', cls: 'sk-mobile-manage-status--archived' },
                        DELETED: { icon: '🗑️', label: 'Supprimé', cls: 'sk-mobile-manage-status--deleted' },
                      };
                      const sc = statusConfig[post.status] ?? statusConfig.ACTIVE;
                      return (
                        <article key={post.id} className={`sk-mobile-manage-item${post.status !== 'ACTIVE' ? ` sk-mobile-manage-item--${post.status.toLowerCase()}` : ''}`}>
                          <button type="button" className="sk-mobile-manage-main" onClick={() => { setShowMobileManage(false); void handleOpenPublishedPost(post.id); }}>
                            <strong>{post.text?.slice(0, 50) || 'Publication sans texte'}</strong>
                            <span>{new Date(post.createdAt).toLocaleDateString('fr-FR')}</span>
                            <span className={`sk-mobile-manage-status ${sc.cls}`}>{sc.icon} {sc.label}</span>
                          </button>
                          {/* Mini stats */}
                          <div className="sk-mobile-manage-stats">
                            <span title="Likes">❤️ {post.likes ?? 0}</span>
                            <span title="Commentaires">💬 {post.comments ?? 0}</span>
                            <span title="Partages">🔄 {post.shares ?? 0}</span>
                          </div>
                          {post.status !== 'DELETED' && (
                            <div className="sk-mobile-manage-actions">
                              {post.status !== 'ARCHIVED' && (
                                <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--toggle" onClick={() => void handleTogglePublishedPost(post.id)} disabled={togglingPostId === post.id}>
                                  {togglingPostId === post.id ? '⏳' : post.status === 'ACTIVE' ? '⏸️ Masquer' : '▶️ Publier'}
                                </button>
                              )}
                              <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--archive" onClick={() => void handleArchivePublishedPost(post.id)} disabled={archivingPostId === post.id}>
                                {archivingPostId === post.id ? '⏳' : post.status === 'ARCHIVED' ? '📤 Désarchiver' : '📦 Archiver'}
                              </button>
                              <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--edit" onClick={() => { setShowMobileManage(false); handleEditPublishedPost(post.id); }}>✏️ Modifier</button>
                              <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--delete" onClick={() => void handleDeletePublishedPost(post.id)} disabled={deletingPostId === post.id}>
                                {deletingPostId === post.id ? '⏳' : '🗑️ Supprimer'}
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>
                <footer className="sk-mobile-manage-footer">
                  <button type="button" className="sk-mobile-manage-new" onClick={() => { setShowMobileManage(false); handleOpenCreate(); }}>+ Nouvelle publication</button>
                </footer>
              </aside>
            </div>
          )}
        </>
      ) : (
        <div className="sk-desktop-shell">
          {/* ═══════ TOPBAR ═══════ */}
          <header className="sk-desktop-topbar" aria-label="Barre supérieure So-Kin">
            {/* Logo So-Kin — bubbles premium */}
            <button type="button" className="sk-desktop-logo-bubbles glass-container" onClick={() => navigate('/sokin')} aria-label="Aller à So-Kin">
              <span className="sk-desktop-logo-shine" aria-hidden="true" />
              {['S', 'o', '-', 'K', 'i', 'n'].map((letter, idx) => (
                <span key={letter + idx} className="sk-desktop-logo-bubble glass-card" style={{ animationDelay: `${idx * 140}ms` }}>{letter}</span>
              ))}
            </button>

            {/* Search */}
            <div className="sk-desktop-global-search glass-container">
              <span className="sk-desktop-search-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input
                type="search"
                value={desktopSearch}
                onChange={(e) => setDesktopSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDesktopSearch();
                }}
                placeholder="Rechercher sur Kin-Sell…"
                aria-label="Recherche globale Kin-Sell"
              />
            </div>

            {/* Actions */}
            <div className="sk-desktop-topbar-actions glass-container">
              <button type="button" className="sk-desktop-head-icon ks-help-btn" onClick={() => setDesktopHelpOpen(true)} aria-label="Aide">
                <span>?</span>
              </button>
              <button type="button" className="sk-desktop-head-icon sk-desktop-head-icon--notif" onClick={() => setDesktopNotifOpen((prev) => !prev)} aria-label="Notifications">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {desktopNotifications.length > 0 && <span className="sk-desktop-notif-badge">{desktopNotifications.length}</span>}
              </button>
              <button type="button" className="sk-desktop-head-icon" onClick={() => setDesktopAccountOpen(true)} aria-label="Compte">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            </div>

            {/* Notifications dropdown */}
            {desktopNotifOpen && (
              <div className="sk-desktop-notif-panel glass-container" role="menu">
                <header>
                  <strong>Notifications</strong>
                  <span>{desktopNotifications.length}</span>
                </header>
                {desktopNotifications.length === 0 ? (
                  <p className="sk-desktop-user-meta" style={{ padding: '16px', textAlign: 'center' }}>Aucune notification.</p>
                ) : (
                  <div className="sk-desktop-notif-list">
                    {desktopNotifications.map((item) => (
                      <button key={item.id} type="button" className="sk-desktop-notif-item" onClick={() => {
                        setDesktopNotifOpen(false);
                        navigate(item.href);
                      }}>
                        <span>{item.icon}</span>
                        <div>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </header>

          {/* ═══════ 3-COLUMN GRID ═══════ */}
          <div className="sk-desktop-grid">
            {/* ── LEFT SIDEBAR ── */}
            <aside className="sk-desktop-left" aria-label="Navigation So-Kin">
              <nav className="sk-desktop-nav glass-container">
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/')}>🏠 Accueil</button>
                <button type="button" className="sk-desktop-nav-item sk-desktop-nav-item--active" onClick={() => navigate('/sokin')}>📱 So-Kin</button>
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/explorer')}>🔍 Explorer</button>
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/explorer/public-profiles')}>👥 Profils</button>
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/explorer/shops-online')}>🏪 Marché</button>
                {isLoggedIn && (
                  <>
                    <hr className="sk-desktop-nav-sep" />
                    <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/messaging')}>💬 Messages</button>
                    <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/notifications')}>🔔 Notifications</button>
                    <button type="button" className="sk-desktop-nav-item" onClick={() => navigate(dashboardPath)}>👤 Mon profil</button>
                  </>
                )}
              </nav>
            </aside>

            {/* ── CENTER ── */}
            <main className="sk-desktop-center" aria-label="Contenu principal So-Kin">
              {/* Onglets de feed desktop */}
              <nav className="sk-feed-tabs sk-feed-tabs--desktop" aria-label="Onglets du fil">
                {FEED_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`sk-feed-tab${feedTab === tab.key ? ' sk-feed-tab--active' : ''}`}
                    onClick={() => setFeedTab(tab.key)}
                  >
                    <span className="sk-feed-tab-icon">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>

              <DesktopStudioComposer
                avatarUrl={avatarUrl}
                displayName={displayName}
                userIdentifier={user?.profile?.username ? `@${user.profile.username.replace('@', '')}` : `ID ${user?.id?.slice(0, 8) ?? 'invité'}`}
                cityLabel={city}
                country={country}
                isPublishing={isPublishing}
                publishError={publishError}
                onPublish={handlePublish}
              />

              <AnnouncesFeed
                posts={posts}
                hasMore={hasMore}
                loading={loadingFeed}
                sentinelRef={sentinelRef}
                t={t}
                isLoggedIn={isLoggedIn}
                openCommentsPostId={openCommentsPostId}
                onOpenComments={handleOpenComments}
                onMediaClick={(item) => setViewerItem(item)}
                onContact={handleContact}
                contactingPostId={contactingPostId}
                immersiveDesktop
              />
            </main>

            {/* ── RIGHT SIDEBAR ── */}
            <aside className="sk-desktop-right" aria-label="Actions et contenu utilisateur">
              {/* ── Tendances ── */}
              <section className="sk-desktop-panel sk-desktop-trends glass-container" aria-label="Tendances locales">
                <h3>🔥 Tendances à {city}</h3>
                <ul className="sk-desktop-trend-list">
                  <li className="sk-desktop-trend-item"><span className="sk-desktop-trend-tag">#Kinshasa</span><span className="sk-desktop-trend-meta">Populaire</span></li>
                  <li className="sk-desktop-trend-item"><span className="sk-desktop-trend-tag">#Ventes</span><span className="sk-desktop-trend-meta">Commerce</span></li>
                  <li className="sk-desktop-trend-item"><span className="sk-desktop-trend-tag">#SoKin</span><span className="sk-desktop-trend-meta">Réseau</span></li>
                </ul>
              </section>

              {/* ── Bloc commercial (discret) ── */}
              <section className="sk-desktop-panel sk-desktop-commercial sk-desktop-commercial--discreet glass-container" aria-label="Bloc commercial Kin-Sell">
                <p className="sk-desktop-commercial-line">📦 Publiez vos articles en 3 étapes simples.</p>
                <button type="button" className="sk-desktop-outline" onClick={openAccountArticles}>Publier maintenant</button>
              </section>

              <section className="sk-desktop-panel glass-container" aria-label="Mon contenu">
                <h3>Mon contenu</h3>

                {/* Onglets desktop */}
                <nav className="sk-content-tabs sk-content-tabs--desktop" aria-label="Filtrer par statut">
                  {([
                    ['all', 'Tout', postCounts.ACTIVE + postCounts.HIDDEN + postCounts.ARCHIVED],
                    ['ACTIVE', 'Publiés', postCounts.ACTIVE],
                    ['HIDDEN', 'Masqués', postCounts.HIDDEN],
                    ['ARCHIVED', 'Archivés', postCounts.ARCHIVED],
                  ] as [SoKinContentTab, string, number][]).map(([key, label, count]) => (
                    <button
                      key={key}
                      type="button"
                      className={`sk-content-tab${contentTab === key ? ' sk-content-tab--active' : ''}`}
                      onClick={() => handleContentTabChange(key)}
                    >
                      {label} <span className="sk-content-tab-count">{count}</span>
                    </button>
                  ))}
                </nav>

                {loadingMyPublishedPosts ? (
                  <p className="sk-desktop-user-meta">Chargement…</p>
                ) : myPublishedPosts.length === 0 ? (
                  <p className="sk-desktop-user-meta">Aucune publication dans cette catégorie.</p>
                ) : (
                  <div className="sk-desktop-published-list">
                    {myPublishedPosts.slice(0, 8).map((post) => {
                      const statusConfig: Record<string, { icon: string; label: string }> = {
                        ACTIVE: { icon: '🟢', label: 'Publié' },
                        HIDDEN: { icon: '🟡', label: 'Masqué' },
                        ARCHIVED: { icon: '📦', label: 'Archivé' },
                        DELETED: { icon: '🗑️', label: 'Supprimé' },
                      };
                      const sc = statusConfig[post.status] ?? statusConfig.ACTIVE;
                      return (
                        <article key={post.id} className="sk-desktop-published-item">
                          <button
                            type="button"
                            className="sk-desktop-published-main"
                            onClick={() => void handleOpenPublishedPost(post.id)}
                            title="Voir la publication"
                          >
                            <strong>{post.text?.slice(0, 46) || 'Publication sans texte'}</strong>
                            <span className="sk-desktop-published-meta">
                              {sc.icon} {sc.label} · {new Date(post.createdAt).toLocaleDateString('fr-FR')}
                            </span>
                            <span className="sk-desktop-published-stats">❤️ {post.likes ?? 0} · 💬 {post.comments ?? 0} · 🔄 {post.shares ?? 0}</span>
                          </button>
                          {post.status !== 'DELETED' && (
                            <div className="sk-desktop-published-actions">
                              {post.status !== 'ARCHIVED' && (
                                <button type="button" className="sk-desktop-outline" onClick={() => void handleTogglePublishedPost(post.id)} disabled={togglingPostId === post.id}>
                                  {togglingPostId === post.id ? '…' : post.status === 'ACTIVE' ? 'Masquer' : 'Publier'}
                                </button>
                              )}
                              <button type="button" className="sk-desktop-outline" onClick={() => void handleArchivePublishedPost(post.id)} disabled={archivingPostId === post.id}>
                                {archivingPostId === post.id ? '…' : post.status === 'ARCHIVED' ? 'Désarchiver' : 'Archiver'}
                              </button>
                              <button type="button" className="sk-desktop-outline" onClick={() => handleEditPublishedPost(post.id)}>Modifier</button>
                              <button
                                type="button"
                                className="sk-desktop-outline sk-desktop-outline--danger"
                                onClick={() => void handleDeletePublishedPost(post.id)}
                                disabled={deletingPostId === post.id}
                              >
                                {deletingPostId === post.id ? '…' : 'Supprimer'}
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}

                <button type="button" className="sk-desktop-outline" onClick={openAccountArticles}>Gérer dans Articles</button>
              </section>
            </aside>
          </div>

          {desktopHelpOpen && (
            <div className="sk-desktop-help-overlay" onClick={() => setDesktopHelpOpen(false)}>
              <div className="sk-desktop-help-popup" onClick={(e) => e.stopPropagation()}>
                <header>
                  <strong>Kin-Sell</strong>
                  <button type="button" onClick={() => setDesktopHelpOpen(false)}>✕</button>
                </header>
                <nav>
                  {DESKTOP_INFO_ITEMS.map((item) => (
                    <button key={item.href} type="button" onClick={() => {
                      setDesktopHelpOpen(false);
                      navigate(item.href);
                    }}>{item.title}</button>
                  ))}
                </nav>
              </div>
            </div>
          )}

          {desktopAccountOpen && (
            <div className="sk-desktop-account-overlay" onClick={() => setDesktopAccountOpen(false)}>
              <div className="sk-desktop-account-popup" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => {
                  setDesktopAccountOpen(false);
                  navigate(getDashboardPath(user?.role));
                }}>Compte</button>
                <button type="button" onClick={() => {
                  setDesktopAccountOpen(false);
                  navigate('/messaging');
                }}>Messagerie</button>
                <button type="button" onClick={() => void handleDesktopLogout()}>Déconnexion</button>
              </div>
            </div>
          )}
        </div>
      )}

      <CommentsDrawer
        post={posts.find((p) => p.id === openCommentsPostId) ?? null}
        open={Boolean(openCommentsPostId)}
        isLoggedIn={isLoggedIn}
        comments={openCommentsPostId ? (commentsByPost[openCommentsPostId] ?? []) : []}
        loading={loadingCommentsPostId === openCommentsPostId}
        draft={commentDraft}
        submitting={submittingCommentPostId === openCommentsPostId}
        replyTo={replyToComment}
        profileState={commentProfileState}
        sort={commentSort}
        onClose={handleCloseComments}
        onDraftChange={setCommentDraft}
        onSubmit={handleSubmitComment}
        onPrepareReply={handlePrepareReply}
        onOpenProfile={handleOpenCommentProfile}
        onCloseProfileState={() => setCommentProfileState({ status: 'idle', profile: null, message: null })}
        onSortChange={handleCommentSortChange}
      />

      {showCreateScreen && (
        <CreateAnnounceScreen
          onClose={handleCloseCreate}
          onPublish={handlePublish}
          isPublishing={isPublishing}
          publishError={publishError}
          avatarUrl={avatarUrl}
          displayName={displayName}
          userIdentifier={user?.profile?.username ? `@${user.profile.username.replace('@', '')}` : `ID ${user?.id?.slice(0, 8) ?? 'invité'}`}
          cityLabel={city}
          country={country}
        />
      )}

      {viewerItem && (
        <MediaViewer item={viewerItem} onClose={() => setViewerItem(null)} />
      )}
    </>
  );
}
