import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveMediaUrl } from '../lib/api-core';
import './hover-popup.css';

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

export interface ArticleHoverData {
  title: string;
  description?: string | null;
  price: string;
  sellerName: string;
}

export interface ProfileHoverData {
  avatarUrl?: string | null;
  name: string;
  username?: string | null;
  kinId?: string | null;
  publicPageUrl?: string | null;
}

interface PopupState<T> {
  data: T;
  x: number;
  y: number;
}

/* ──────────────────────────────────────────────
   Hook — shared timer + position logic
   ────────────────────────────────────────────── */

export function useHoverPopup<T>(delay = 3000) {
  const [popup, setPopup] = useState<PopupState<T> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(
    (data: T, e: React.MouseEvent) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      timerRef.current = setTimeout(() => {
        setPopup({
          data,
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
      }, delay);
    },
    [delay],
  );

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setPopup(null);
  }, []);

  return { popup, handleMouseEnter, handleMouseLeave } as const;
}

/* ──────────────────────────────────────────────
   Article Hover Popup
   ────────────────────────────────────────────── */

export function ArticleHoverPopup({ popup }: { popup: PopupState<ArticleHoverData> | null }) {
  if (!popup) return null;

  const style: React.CSSProperties = {
    left: popup.x,
    top: popup.y,
  };

  return createPortal(
    <div className="ks-hover-popup ks-hover-popup--article" style={style}>
      <strong className="ks-hover-popup-title">{popup.data.title}</strong>
      {popup.data.description ? (
        <p className="ks-hover-popup-desc">{popup.data.description}</p>
      ) : null}
      <span className="ks-hover-popup-price">{popup.data.price}</span>
      <span className="ks-hover-popup-seller">🏷️ {popup.data.sellerName}</span>
    </div>,
    document.body,
  );
}

/* ──────────────────────────────────────────────
   Profile Hover Popup
   ────────────────────────────────────────────── */

export function ProfileHoverPopup({ popup }: { popup: PopupState<ProfileHoverData> | null }) {
  if (!popup) return null;

  const style: React.CSSProperties = {
    left: popup.x,
    top: popup.y,
  };

  return createPortal(
    <div className="ks-hover-popup ks-hover-popup--profile" style={style}>
      <div className="ks-hover-popup-avatar-row">
        {popup.data.avatarUrl ? (
          <img className="ks-hover-popup-avatar" src={resolveMediaUrl(popup.data.avatarUrl)} alt={popup.data.name} />
        ) : (
          <span className="ks-hover-popup-avatar ks-hover-popup-avatar--placeholder">👤</span>
        )}
        <div className="ks-hover-popup-identity">
          <strong className="ks-hover-popup-name">{popup.data.name}</strong>
          {popup.data.username ? (
            <span className="ks-hover-popup-pseudo">@{popup.data.username}</span>
          ) : null}
          {popup.data.kinId ? (
            <span className="ks-hover-popup-kinid">{popup.data.kinId}</span>
          ) : null}
        </div>
      </div>
      {popup.data.publicPageUrl ? (
        <a className="ks-hover-popup-link" href={popup.data.publicPageUrl}>
          Voir la page publique →
        </a>
      ) : (
        <span className="ks-hover-popup-nopublic">L'utilisateur n'a pas de page publique</span>
      )}
    </div>,
    document.body,
  );
}
