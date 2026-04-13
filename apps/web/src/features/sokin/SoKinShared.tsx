/**
 * So-Kin Shared Components — MediaViewer & CommentsDrawer
 *
 * Extraits pour être réutilisés dans SoKinPage et HomePage.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolveMediaUrl,
  type SoKinApiFeedPost,
  type SoKinApiComment,
} from '../../lib/api-client';
import type { MediaItem } from './AnnounceCard';

/* ─────────────────────────────────────────────────────── */
/* ICÔNES                                                   */
/* ─────────────────────────────────────────────────────── */

export function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────── */
/* MEDIA VIEWER — slider multi-média (swipe + flèches)     */
/* ─────────────────────────────────────────────────────── */

export type ViewerState = { items: MediaItem[]; index: number };

export function MediaViewer({ items, startIndex, onClose }: { items: MediaItem[]; startIndex: number; onClose: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const item = items[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;
  const multi = items.length > 1;

  const goPrev = useCallback(() => setCurrentIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setCurrentIndex((i) => Math.min(items.length - 1, i + 1)), [items.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, goPrev, goNext]);

  /* ── Android back button: ferme le viewer au lieu de naviguer ── */
  useEffect(() => {
    window.history.pushState({ skViewer: true }, '');
    const onPopState = () => { onClose(); };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // Si on démonte sans popstate (fermeture par ✕ ou overlay), retirer l'entrée
      if (window.history.state?.skViewer) window.history.back();
    };
  }, [onClose]);

  /* ── Touch / swipe (horizontal pour navigation, vertical pour fermer) ── */
  const touchStartY = useRef(0);
  const touchDeltaY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchDeltaX.current = 0;
    touchDeltaY.current = 0;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
    touchDeltaY.current = e.touches[0].clientY - touchStartY.current;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const threshold = 50;
    // Swipe vertical vers le bas → fermer le viewer
    if (touchDeltaY.current > 100 && Math.abs(touchDeltaY.current) > Math.abs(touchDeltaX.current)) {
      onClose();
      return;
    }
    if (touchDeltaX.current < -threshold) goNext();
    else if (touchDeltaX.current > threshold) goPrev();
    touchDeltaX.current = 0;
    touchDeltaY.current = 0;
  }, [goNext, goPrev, onClose]);

  const renderMedia = (mi: MediaItem) => {
    if (mi.type === 'video') {
      return (
        <video
          src={resolveMediaUrl(mi.url)}
          controls
          autoPlay
          playsInline
          className="sk-viewer-media"
        />
      );
    }
    if (mi.type === 'audio') {
      return (
        <audio
          src={resolveMediaUrl(mi.url)}
          controls
          autoPlay
          className="sk-viewer-audio"
        />
      );
    }
    return <img src={resolveMediaUrl(mi.url)} alt="" className="sk-viewer-media" />;
  };

  return (
    <div
      className="sk-viewer-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Média en plein écran"
    >
      <button type="button" className="sk-viewer-close" onClick={onClose} aria-label="Fermer le media">✕</button>

      {/* Counter */}
      {multi && <span className="sk-viewer-counter">{currentIndex + 1} / {items.length}</span>}

      {/* Arrows */}
      {multi && hasPrev && (
        <button type="button" className="sk-viewer-arrow sk-viewer-arrow--left" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Précédent">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      )}
      {multi && hasNext && (
        <button type="button" className="sk-viewer-arrow sk-viewer-arrow--right" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Suivant">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      )}

      {/* Media content */}
      <div
        ref={containerRef}
        className="sk-viewer-content"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {renderMedia(item)}
      </div>

      {/* Dots */}
      {multi && (
        <div className="sk-viewer-dots" onClick={(e) => e.stopPropagation()}>
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`sk-viewer-dot${i === currentIndex ? ' sk-viewer-dot--active' : ''}`}
              onClick={() => setCurrentIndex(i)}
              aria-label={`Média ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */
/* COMMENTS DRAWER — tiroir mobile plein écran             */
/* ─────────────────────────────────────────────────────── */

export type MissingPublicProfile = {
  avatarUrl: string | null;
  displayName: string;
  identifier: string;
};

export type CommentProfileState = {
  status: 'idle' | 'loading' | 'success' | 'not-available' | 'error';
  profile: MissingPublicProfile | null;
  message: string | null;
};

export function CommentsDrawer({
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
