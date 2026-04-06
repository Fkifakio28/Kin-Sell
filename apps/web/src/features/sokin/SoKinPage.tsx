/**
 * So-Kin Page — v4 Mobile First
 *
 * Structure:
 * - Flux vertical d'annonces (style Facebook orienté annonces)
 * - Carte avec en-tête (auteur + contact), corps (texte + collage médias), pied (réponses)
 * - Collage médias Facebook-style : 1 à 5 médias, max 2 vidéos
 * - Viewer simple au clic sur un média (pas de galerie complexe)
 * - Tiroir de réponses inline sous chaque carte
 * - Mobile uniquement — desktop redirige vers accueil
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLocaleCurrency } from '../../app/providers/LocaleCurrencyProvider';
import { useMarketPreference } from '../../app/providers/MarketPreferenceProvider';
import { prepareMediaUrl } from '../../utils/media-upload';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useSocket } from '../../hooks/useSocket';
import { sokin as sokinApi, messaging, users as usersApi, resolveMediaUrl, type SoKinApiFeedPost, type SoKinApiComment } from '../../lib/api-client';
import { ApiError } from '../../lib/api-core';
import { AdBanner } from '../../components/AdBanner';
import { SeoMeta } from '../../components/SeoMeta';
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

function IconReply() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setShowEmoji(false);
  }, [open]);

  const title = post ? `${post.comments ?? 0} réponse${(post.comments ?? 0) > 1 ? 's' : ''}` : 'Commentaires';

  return (
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
          comments.map((comment) => {
            const name = comment.author.profile?.displayName ?? 'Utilisateur';
            const idLabel = comment.author.profile?.username ? `@${comment.author.profile.username.replace('@', '')}` : comment.author.id;
            const avatar = comment.author.profile?.avatarUrl;
            return (
              <article key={comment.id} className="sk-comment-item" onClick={() => onPrepareReply(comment)}>
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
                  <p className="sk-comment-content">{comment.content}</p>
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
              {cleanHandle && (
                <span className="sk-card-author-handle">@{cleanHandle}</span>
              )}
              {authorCity && <span className="sk-card-author-city"> · {authorCity}</span>}
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
            <IconMessage />
          )}
        </button>
      </header>

      {/* ── Corps : texte ── */}
      {post.text && (
        <p className="sk-card-text">{post.text}</p>
      )}

      {/* ── Corps : collage médias ── */}
      {mediaItems.length > 0 && (
        <MediaCollage items={mediaItems} onItemClick={onMediaClick} />
      )}

      {/* ── Pied de page ── */}
      <footer className="sk-card-footer">
        <button
          type="button"
          className="sk-card-reply-btn"
          onClick={onOpenComments}
          aria-expanded={isCommentsOpen}
        >
          <IconReply />
          <span>
            {replyCount > 0
              ? `${replyCount} réponse${replyCount > 1 ? 's' : ''}`
              : 'Répondre'}
          </span>
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
  isLoggedIn,
  onCreatePost,
}: {
  avatarUrl: string;
  displayName: string;
  isLoggedIn: boolean;
  onCreatePost: () => void;
}) {
  const navigate = useNavigate();

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
          onClick={() => {
            if (!isLoggedIn) navigate('/login');
            else onCreatePost();
          }}
        >
          {isLoggedIn
            ? `Publiez une annonce, ${displayName}…`
            : 'Connectez-vous pour publier…'}
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
}) {
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
  posts.forEach((post, idx) => {
    items.push(
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
    if ((idx + 1) % 4 === 0) {
      items.push(
        <AdBanner key={`ad-${idx}`} page="sokin" variant="slim" hideWhenEmpty />
      );
    }
  });

  return (
    <section className="sk-feed" aria-label="Fil d'annonces So-Kin">
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

/* ─────────────────────────────────────────────────────── */
/* CREATE SCREEN — création d'annonce mobile plein écran   */
/* ─────────────────────────────────────────────────────── */

function CreateAnnounceScreen({
  onClose,
  onPublish,
  isPublishing,
  publishError,
}: {
  onClose: () => void;
  onPublish: (data: {
    text: string;
    mediaFiles: File[];
  }) => void;
  isPublishing: boolean;
  publishError?: string | null;
}) {
  const [text, setText] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const fileRef = useRef<HTMLInputElement>(null);

  const canPreview = text.trim().length > 0 || mediaFiles.length > 0;
  const canPublish = text.trim().length > 0 && mediaFiles.length >= 1;
  const imageCount = mediaFiles.filter((f) => !f.type.startsWith('video/')).length;
  const videoCount = mediaFiles.filter((f) => f.type.startsWith('video/')).length;

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
    setMode('preview');
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
    onPublish({ text, mediaFiles });
  };

  return (
    <section className="sk-create-screen" role="dialog" aria-modal="true" aria-label="Créer une annonce">
      <header className="sk-create-screen-head">
        <button type="button" className="sk-btn sk-btn--outline" onClick={onClose} disabled={isPublishing}>Retour</button>
        <strong>Nouvelle annonce</strong>
        <button
          type="button"
          className="sk-btn sk-btn--sm"
          onClick={() => setMode((prev) => (prev === 'edit' ? 'preview' : 'edit'))}
          disabled={!canPreview || isPublishing}
        >
          {mode === 'edit' ? 'Prévisualiser' : 'Modifier'}
        </button>
      </header>

      <div className="sk-create-screen-body">
        {(publishError || localError) && (
          <div className="sk-modal-error" role="alert">
            ⚠️ {publishError ?? localError}
          </div>
        )}

        {mode === 'edit' ? (
          <>
            <textarea
              className="sk-modal-textarea"
              placeholder="Décrivez votre annonce (produit, prix, état, livraison...)"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setLocalError(null);
              }}
              rows={6}
              maxLength={500}
              autoFocus
            />
            <span className="sk-modal-char-count">{text.length}/500</span>

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
              <button
                type="button"
                className="sk-btn sk-btn--sm"
                onClick={() => fileRef.current?.click()}
                disabled={mediaFiles.length >= 5 || isPublishing}
              >
                🖼️ Ajouter médias ({mediaFiles.length}/5)
              </button>
              <span className="sk-modal-media-hint">Jusqu'à 5 médias, dont 2 vidéos max</span>
              <span className="sk-media-counter" aria-live="polite">
                {imageCount} image{imageCount > 1 ? 's' : ''} / {videoCount} vidéo{videoCount > 1 ? 's' : ''}
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
        ) : (
          <article className="sk-create-preview-card" aria-label="Prévisualisation annonce">
            <h3 className="sk-create-preview-title">Aperçu avant publication</h3>
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
          </article>
        )}
      </div>

      <footer className="sk-create-screen-foot">
        {mode === 'preview' ? (
          <button type="button" className="sk-btn sk-btn--outline" onClick={() => setMode('edit')} disabled={isPublishing}>Retour édition</button>
        ) : (
          <button type="button" className="sk-btn sk-btn--outline" onClick={openPreview} disabled={!canPreview || isPublishing}>Prévisualiser</button>
        )}
        <button type="button" className="sk-btn sk-btn--primary" onClick={submit} disabled={!canPublish || isPublishing}>
          {isPublishing ? '⏳ Publication…' : 'Publier l’annonce'}
        </button>
      </footer>
    </section>
  );
}

/* ─────────────────────────────────────────────────────── */
/* MAIN: So-Kin Page                                        */
/* ─────────────────────────────────────────────────────── */

export function SoKinPage() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const { t } = useLocaleCurrency();
  const { effectiveCountry, getCountryConfig } = useMarketPreference();
  const { on, off } = useSocket();
  const isMobile = useIsMobile(1023);

  // ── State — TOUS les hooks avant tout return conditionnel ──
  const [posts, setPosts] = useState<SoKinApiFeedPost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [showCreateScreen, setShowCreateScreen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

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

  const city = user?.profile?.city ?? getCountryConfig(effectiveCountry).defaultCity;
  const country = effectiveCountry;
  const avatarUrl = user?.profile?.avatarUrl ?? '';
  const displayName = user?.profile?.displayName ?? 'Utilisateur';

  // ── Redirect desktop (effect, pas de hook conditionnel) ──
  useEffect(() => {
    if (!isMobile) navigate('/', { replace: true });
  }, [isMobile, navigate]);

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
          city,
          country,
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
    [hasMore, city, country]
  );

  // Chargement initial
  useEffect(() => {
    void loadFeed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, country]);

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

  const handleOpenComments = useCallback((postId: string) => {
    setOpenCommentsPostId(postId);
    setReplyToComment(null);
    setCommentProfileState({ status: 'idle', profile: null, message: null });
    setCommentDraft('');
    void loadComments(postId);
  }, [loadComments]);

  const handleCloseComments = useCallback(() => {
    setOpenCommentsPostId(null);
    setReplyToComment(null);
    setCommentProfileState({ status: 'idle', profile: null, message: null });
    setCommentDraft('');
  }, []);

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
      const postRef: SoKinPostRef = {
        id: post.id,
        text: (post.text ?? '').slice(0, 120),
        mediaUrl: post.mediaUrls?.[0] ?? null,
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

  const handlePublish = async (data: { text: string; mediaFiles: File[] }) => {
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
      });

      if (!created?.id) {
        throw new Error('Publication non confirmée par le serveur.');
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

  // Desktop : rien à rendre (la redirection est dans l'effect ci-dessus)
  if (!isMobile) return null;

  return (
    <>
      <SeoMeta
        title="So-Kin — Annonces Kin-Sell"
        description="Publiez et découvrez des annonces à Kinshasa et en RDC."
        canonical="https://kin-sell.com/sokin"
      />

      <div className="sk-page">
        {/* ── Barre supérieure ── */}
        <header className="sk-topbar">
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
          {/* Espace symétrique droit (à utiliser pour filter/search futur) */}
          <div className="sk-topbar-end" aria-hidden="true" />
        </header>

        {/* ── Zone composer ── */}
        <ComposeZone
          avatarUrl={avatarUrl}
          displayName={displayName}
          isLoggedIn={isLoggedIn}
          onCreatePost={() => setShowCreateScreen(true)}
        />

        {/* ── Fil d'annonces ── */}
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

      {/* ── Modal publication ── */}
      {showCreateScreen && (
        <CreateAnnounceScreen
          onClose={() => setShowCreateScreen(false)}
          onPublish={handlePublish}
          isPublishing={isPublishing}
          publishError={publishError}
        />
      )}

      {/* ── Viewer média simple ── */}
      {viewerItem && (
        <MediaViewer item={viewerItem} onClose={() => setViewerItem(null)} />
      )}
    </>
  );
}
