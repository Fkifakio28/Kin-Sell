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
  location?: string;
  tags?: string[];
  hashtags?: string[];
  scheduledAt?: string;
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
    return {
      text: typeof parsed.text === 'string' ? parsed.text.slice(0, 500) : '',
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
  onClose,
  onDraftChange,
  onSubmit,
  onPrepareReply,
  onOpenProfile,
  onCloseProfileState,
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
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onPrepareReply: (comment: SoKinApiComment) => void;
  onOpenProfile: (comment: SoKinApiComment) => void;
  onCloseProfileState: () => void;
}) {
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const orderedComments = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setShowEmoji(false);
  }, [open]);

  const title = post ? `${post.comments ?? 0} réponse${(post.comments ?? 0) > 1 ? 's' : ''}` : 'Commentaires';

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

      <section className="sk-comments-list" aria-label="Liste des commentaires">
        {loading ? (
          <p className="sk-comments-empty">Chargement des commentaires…</p>
        ) : comments.length === 0 ? (
          <p className="sk-comments-empty">Aucun commentaire pour le moment.</p>
        ) : (
          orderedComments.map((comment) => {
            const name = comment.author.profile?.displayName ?? 'Utilisateur';
            const idLabel = comment.author.profile?.username ? `@${comment.author.profile.username.replace('@', '')}` : comment.author.id;
            const avatar = comment.author.profile?.avatarUrl;
            return (
              <article key={comment.id} className="sk-comment-item">
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
/* ANNOUNCE CARD — carte principale de chaque annonce     */
/* ─────────────────────────────────────────────────────── */

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

  const profile = post.author.profile;
  const authorName = profile?.displayName ?? 'Utilisateur';
  const authorHandle = profile?.username ?? post.author.id;
  const authorAvatar = profile?.avatarUrl;
  const authorCity = profile?.city;
  const cleanHandle = authorHandle?.replace('@', '') ?? '';

  const mediaItems = categorizeMedia(post.mediaUrls ?? []);
  const replyCount = post.comments ?? 0;

  return (
    <article className="sk-card">
      {/* ── En-tête ── */}
      <header className="sk-card-header">
        {/* Gauche : photo + nom + identifiant */}
        <button
          type="button"
          className="sk-card-author"
          onClick={() => navigate(`/user/${cleanHandle}`)}
          aria-label={`Voir le profil de ${authorName}`}
        >
          <div className="sk-card-avatar-wrap">
            {authorAvatar ? (
              <img
                src={resolveMediaUrl(authorAvatar)}
                alt={authorName}
                className="sk-card-avatar"
              />
            ) : (
              <span className="sk-card-avatar-empty" aria-hidden="true">
                {authorName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="sk-card-author-info">
            <strong className="sk-card-author-name">{authorName}</strong>
            <span className="sk-card-author-meta">
              <span className="sk-card-author-handle">ID: {cleanHandle || post.author.id}</span>
              <span className="sk-card-author-time"> · {relTime(post.createdAt, t)}</span>
            </span>
          </div>
        </button>

        {/* Droite : bouton contacter */}
        <button
          type="button"
          className="sk-card-contact-btn"
          onClick={onContact}
          disabled={isContacting}
          aria-busy={isContacting}
          title="Contacter l'auteur"
          aria-label="Contacter l'auteur"
        >
          {isContacting ? (
            <span style={{ fontSize: 12, lineHeight: 1 }}>⏳</span>
          ) : (
            <>
              <IconMessage />
              <span>Contacter</span>
            </>
          )}
        </button>
      </header>

      {/* ── Corps : collage médias ── */}
      {mediaItems.length > 0 ? (
        <>
          <MediaCollage items={mediaItems} onItemClick={onMediaClick} />
          {post.text && <p className="sk-card-text sk-card-text--after-media">{post.text}</p>}
        </>
      ) : (
        <div className="sk-card-text-only" style={{ background: `linear-gradient(135deg, #000, ${['#1c133b', '#2b1649', '#321f58', '#161616'][post.id.charCodeAt(0) % 4]})` }}>
          {post.text && <p className="sk-card-text sk-card-text--centered">{post.text}</p>}
        </div>
      )}

      {/* ── Pied de page ── */}
      <footer className="sk-card-footer">
        <button
          type="button"
          className="sk-card-replies-link"
          onClick={onOpenComments}
          aria-expanded={isCommentsOpen}
        >
          {replyCount} réponse{replyCount > 1 ? 's' : ''}
        </button>
      </footer>
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
          {`Publiez une annonce, ${displayName}…`}
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

  const canPreview = text.trim().length > 0 || mediaFiles.length > 0;
  const canPublish = text.trim().length > 0 && mediaFiles.length >= 1;

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
      setLocalError('Texte + au moins 1 média requis pour publier.');
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
      location: location.trim() || undefined,
      tags: selectedTags.map((v) => v.replace(/^@/, '')),
      hashtags: selectedArticles.map((v) => v.replace(/^#/, '')),
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    });
  };

  return (
    <section className="sk-desktop-studio" aria-label="Studio So-Kin">
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
        <p className="sk-studio-question">Quoi de neuf !</p>

        <textarea
          className="sk-modal-textarea sk-modal-textarea--studio"
          placeholder="Écrire votre annonce..."
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
              <strong>Prévisualisation</strong>
              <button type="button" className="sk-btn sk-btn--primary" onClick={submit} disabled={isPublishing || !canPublish}>
                {isPublishing ? 'Publication…' : 'Publier'}
              </button>
            </header>
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
}) {
  const initialDraft = useMemo(() => readSoKinCreateDraft(), []);
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

  const canPreview = text.trim().length > 0 || mediaFiles.length > 0;
  const canPublish = text.trim().length > 0 && mediaFiles.length >= 1;
  const imageCount = mediaFiles.filter((f) => !f.type.startsWith('video/')).length;
  const videoCount = mediaFiles.filter((f) => f.type.startsWith('video/')).length;
  const hasUnsavedInput =
    text.trim().length > 0 ||
    mediaFiles.length > 0 ||
    location.trim().length > 0 ||
    selectedTags.length > 0 ||
    selectedArticles.length > 0 ||
    scheduledAt.trim().length > 0;
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
    if (files.length < 1) return 'Ajoutez au moins 1 média à votre annonce.';
    if (files.length > 5) return 'Maximum 5 médias par annonce.';
    const videoCount = files.filter((f) => f.type.startsWith('video/')).length;
    if (videoCount > 2) return 'Maximum 2 vidéos par annonce.';
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
        scheduledAt.trim().length > 0;
      if (!hasAnyDraft) {
        localStorage.removeItem(CREATE_DRAFT_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        CREATE_DRAFT_STORAGE_KEY,
        JSON.stringify({
          text,
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
  }, [text, location, selectedTags, selectedArticles, scheduledAt]);

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
    if (!text.trim()) {
      setLocalError('Le texte de l’annonce est obligatoire.');
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

    // La planification est transmise au backend sans simulation locale de succès.
    onPublish({
      text,
      mediaFiles,
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
            <article className="sk-studio-card" aria-label="Zone de création d'annonce">
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
              <p className="sk-studio-question">Quoi de neuf ?</p>

              <div className="sk-studio-text-wrap">
                <textarea
                  ref={textareaRef}
                  className="sk-modal-textarea sk-modal-textarea--studio"
                  placeholder="Écrire une annonce claire et utile…"
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
              <span className="sk-modal-media-hint">Médias: {mediaFiles.length}/5</span>
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
            <h3 className="sk-create-preview-title">Annonce prête à publier</h3>
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

  // Viewer (géré au niveau page : un seul à la fois)
  const [viewerItem, setViewerItem] = useState<MediaItem | null>(null);
  // Commentaires
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, SoKinApiComment[]>>({});
  const [loadingCommentsPostId, setLoadingCommentsPostId] = useState<string | null>(null);
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyToComment, setReplyToComment] = useState<SoKinApiComment | null>(null);
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
  const loadFeed = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;
      if (!reset && !hasMore) return;
      loadingRef.current = true;
      try {
        const limit = 20;
        const currentOffset = reset ? 0 : offsetRef.current;
        const data = await sokinApi.publicFeed({
          limit,
          offset: currentOffset,
        });
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
    [hasMore]
  );

  const loadMyPublishedPosts = useCallback(async () => {
    if (!isLoggedIn) {
      setMyPublishedPosts([]);
      return;
    }
    setLoadingMyPublishedPosts(true);
    try {
      const data = await sokinApi.myPosts();
      setMyPublishedPosts((data.posts ?? []).filter((p) => p.status === 'ACTIVE'));
    } catch {
      setMyPublishedPosts([]);
    } finally {
      setLoadingMyPublishedPosts(false);
    }
  }, [isLoggedIn]);

  // Chargement initial
  useEffect(() => {
    void loadFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const loadComments = useCallback(async (postId: string) => {
    setLoadingCommentsPostId(postId);
    try {
      const data = await sokinApi.postComments(postId, { limit: 100 });
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
    clearCommentsComposer();
    void loadComments(postId);
  }, [clearCommentsComposer, loadComments]);

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

  const handleEditPublishedPost = useCallback((postId: string) => {
    try {
      sessionStorage.setItem('ud-section', 'articles');
      sessionStorage.setItem('ud-edit-sokin-post-id', postId);
    } catch {
      // no-op
    }
    navigate(dashboardPath || '/account');
  }, [dashboardPath, navigate]);

  const handlePublish = async (data: SoKinPublishPayload) => {
    if (isPublishing || !isLoggedIn) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      if (!data.text.trim()) {
        throw new Error('Le texte de l’annonce est obligatoire.');
      }

      const mediaUrls = await Promise.all(
        data.mediaFiles.map((f) => prepareMediaUrl(f))
      );

      const created = await sokinApi.createPost({
        text: data.text,
        mediaUrls,
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
                <span className="sk-topbar-sub">Annonces</span>
              </div>
              <div className="sk-topbar-end" aria-hidden="true" />
            </header>

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
            aria-label="Gérer mes annonces"
            onClick={() => { if (!isLoggedIn) { navigate('/login'); return; } void loadMyPublishedPosts(); setShowMobileManage(true); }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>

          {/* ── Mobile: Manage Posts Drawer ── */}
          {showMobileManage && (
            <div className="sk-mobile-manage-overlay" onClick={() => setShowMobileManage(false)}>
              <aside className="sk-mobile-manage-drawer" onClick={(e) => e.stopPropagation()}>
                <header className="sk-mobile-manage-header">
                  <h3>📋 Mes annonces</h3>
                  <button type="button" onClick={() => setShowMobileManage(false)} className="sk-mobile-manage-close">✕</button>
                </header>
                <div className="sk-mobile-manage-body">
                  {loadingMyPublishedPosts ? (
                    <p className="sk-mobile-manage-empty">Chargement…</p>
                  ) : myPublishedPosts.length === 0 ? (
                    <p className="sk-mobile-manage-empty">Aucune annonce publiée.</p>
                  ) : (
                    myPublishedPosts.map((post) => (
                      <article key={post.id} className="sk-mobile-manage-item">
                        <button type="button" className="sk-mobile-manage-main" onClick={() => { setShowMobileManage(false); void handleOpenPublishedPost(post.id); }}>
                          <strong>{post.text?.slice(0, 50) || 'Annonce sans texte'}</strong>
                          <span>{new Date(post.createdAt).toLocaleDateString('fr-FR')}</span>
                        </button>
                        <div className="sk-mobile-manage-actions">
                          <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--edit" onClick={() => { setShowMobileManage(false); handleEditPublishedPost(post.id); }}>✏️ Modifier</button>
                          <button type="button" className="sk-mobile-manage-btn sk-mobile-manage-btn--delete" onClick={() => void handleDeletePublishedPost(post.id)} disabled={deletingPostId === post.id}>
                            {deletingPostId === post.id ? '⏳' : '🗑️ Supprimer'}
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
                <footer className="sk-mobile-manage-footer">
                  <button type="button" className="sk-mobile-manage-new" onClick={() => { setShowMobileManage(false); handleOpenCreate(); }}>+ Nouvelle annonce</button>
                </footer>
              </aside>
            </div>
          )}
        </>
      ) : (
        <div className="sk-desktop-shell">
          <header className="sk-desktop-topbar" aria-label="Barre supérieure So-Kin">
            <div className="sk-desktop-logo-bubbles" aria-label="So-Kin">
              {['S', 'O', '-', 'K', 'I', 'N'].map((letter, idx) => (
                <span key={letter + idx} className="sk-desktop-logo-bubble" style={{ animationDelay: `${idx * 0.08}s` }}>{letter}</span>
              ))}
            </div>

            <div className="sk-desktop-global-search">
              <input
                type="search"
                value={desktopSearch}
                onChange={(e) => setDesktopSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDesktopSearch();
                }}
                placeholder="Rechercher sur Kin-Sell: annonces, utilisateurs, boutiques, articles..."
                aria-label="Recherche globale Kin-Sell"
              />
            </div>

            <div className="sk-desktop-topbar-actions">
              <button type="button" className="sk-desktop-head-icon" onClick={() => setDesktopHelpOpen(true)} aria-label="Aide">?</button>
              <button type="button" className="sk-desktop-head-icon sk-desktop-head-icon--notif" onClick={() => setDesktopNotifOpen((prev) => !prev)} aria-label="Notifications">
                🔔
                {desktopNotifications.length > 0 && <span className="sk-desktop-notif-badge">{desktopNotifications.length}</span>}
              </button>
              <button type="button" className="sk-desktop-head-account" onClick={() => setDesktopAccountOpen(true)} aria-label="Compte">👤</button>
            </div>

            {desktopNotifOpen && (
              <div className="sk-desktop-notif-panel" role="menu">
                <header>
                  <strong>Notifications</strong>
                  <span>{desktopNotifications.length}</span>
                </header>
                {desktopNotifications.length === 0 ? (
                  <p className="sk-desktop-user-meta">Aucune notification manquée.</p>
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

          <div className="sk-desktop-grid">
            <aside className="sk-desktop-left" aria-label="Navigation So-Kin desktop">
              <nav className="sk-desktop-nav">
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/')}>🏠 Accueil</button>
                <button type="button" className="sk-desktop-nav-item sk-desktop-nav-item--active" onClick={() => navigate('/sokin')}>📱 Accueil So-Kin</button>
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/explorer/public-profiles')}>👥 Utilisateurs publics</button>
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/explorer/shops-online')}>🏪 Marché public</button>
                <button type="button" className="sk-desktop-nav-item" onClick={() => navigate('/explorer')}>Accéder à Explorer</button>
              </nav>
              <AdBanner page="sokin" variant="slim" hideWhenEmpty />
              <AdBanner page="sokin" variant="slim" hideWhenEmpty />
            </aside>

            <main className="sk-desktop-center" aria-label="Contenu principal So-Kin desktop">
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

              <section className="sk-desktop-announces-block" aria-label="Bloc principal des annonces">
                <header className="sk-desktop-announces-head">
                  <h3>Annonces</h3>
                  <div className="sk-desktop-announces-head-empty" aria-hidden="true" />
                </header>

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
              </section>
            </main>

            <aside className="sk-desktop-right" aria-label="Actions et contenu utilisateur">
              <section className="sk-desktop-panel sk-desktop-commercial" aria-label="Bloc commercial Kin-Sell">
                <span className="sk-desktop-commercial-icon">📦</span>
                <p className="sk-desktop-commercial-brand">✦ Kin-Sell</p>
                <p className="sk-desktop-commercial-line">Publiez vos articles</p>
                <p className="sk-desktop-commercial-line">En 3 étapes simples. Photos, prix, description. Votre vitrine en 5 min.</p>
                <button type="button" className="sk-desktop-primary" onClick={openAccountArticles}>publier maintenant</button>
              </section>

              <section className="sk-desktop-panel" aria-label="Liste des annonces publiées">
                <h3>Mes annonces publiées</h3>

                {loadingMyPublishedPosts ? (
                  <p className="sk-desktop-user-meta">Chargement…</p>
                ) : myPublishedPosts.length === 0 ? (
                  <p className="sk-desktop-user-meta">Aucune annonce publiée.</p>
                ) : (
                  <div className="sk-desktop-published-list">
                    {myPublishedPosts.slice(0, 8).map((post) => (
                      <article key={post.id} className="sk-desktop-published-item">
                        <button
                          type="button"
                          className="sk-desktop-published-main"
                          onClick={() => void handleOpenPublishedPost(post.id)}
                          title="Voir l'annonce"
                        >
                          <strong>{post.text?.slice(0, 46) || 'Annonce sans texte'}</strong>
                          <span>ID: {post.id.slice(0, 8)} · {new Date(post.createdAt).toLocaleDateString('fr-FR')}</span>
                        </button>
                        <div className="sk-desktop-published-actions">
                          <button type="button" className="sk-desktop-outline" onClick={() => handleEditPublishedPost(post.id)}>Modifier</button>
                          <button
                            type="button"
                            className="sk-desktop-outline sk-desktop-outline--danger"
                            onClick={() => void handleDeletePublishedPost(post.id)}
                            disabled={deletingPostId === post.id}
                          >
                            {deletingPostId === post.id ? 'Suppression…' : 'Supprimer'}
                          </button>
                        </div>
                      </article>
                    ))}
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
        onClose={handleCloseComments}
        onDraftChange={setCommentDraft}
        onSubmit={handleSubmitComment}
        onPrepareReply={handlePrepareReply}
        onOpenProfile={handleOpenCommentProfile}
        onCloseProfileState={() => setCommentProfileState({ status: 'idle', profile: null, message: null })}
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
