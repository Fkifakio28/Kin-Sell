import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveMediaUrl } from "../lib/api-core";
import { listings as listingsApi } from "../lib/api-client";
import "./long-press-popup.css";

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

export interface LongPressArticle {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  /** Optionnel : liste compl\u00e8te des m\u00e9dias (images + vid\u00e9os).
   * Si non fourni, le popup fait un lazy fetch via listings.publicDetail(id). */
  mediaUrls?: string[] | null;
  priceLabel: string;
  originalPriceLabel?: string;
  sellerName: string;
  type: string;
  isNegotiable: boolean;
}

/* ──────────────────────────────────────────────
   Hook — long-press detection (500 ms)
   ────────────────────────────────────────────── */

export function useLongPress(
  onLongPress: () => void,
  onTap?: () => void,
  { delay = 500, moveThreshold = 8 }: { delay?: number; moveThreshold?: number } = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const movedRef = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const startTime = useRef<number>(0);

  const start = (e: React.TouchEvent) => {
    firedRef.current = false;
    movedRef.current = false;
    const touch = e.touches[0];
    startPos.current = { x: touch.clientX, y: touch.clientY };
    startTime.current = Date.now();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  };

  const move = (e: React.TouchEvent) => {
    if (!startPos.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startPos.current.x);
    const dy = Math.abs(touch.clientY - startPos.current.y);
    if (dx > moveThreshold || dy > moveThreshold) {
      movedRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const end = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Ne déclenche onTap que si pas de long-press ET pas de swipe/drag détecté
    // + durée raisonnable (évite tap fantôme après scroll lent)
    const duration = Date.now() - startTime.current;
    if (!firedRef.current && !movedRef.current && duration < 500 && onTap) {
      onTap();
    }
    startPos.current = null;
  };

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    movedRef.current = true; // annule le tap si le touch est cancel (scroll pris par le navigateur)
  };

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onTouchCancel: cancel,
  };
}

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)(\?|$)/i;
function isVideoUrl(url: string): boolean {
  return VIDEO_EXT.test(url);
}

/* ──────────────────────────────────────────────
   Popup Component
   ────────────────────────────────────────────── */

export function LongPressPopup({
  article,
  onClose,
  onNegotiate,
  onAddToCart,
  t,
}: {
  article: LongPressArticle;
  onClose: () => void;
  onNegotiate: () => void;
  onAddToCart: () => void;
  t: (k: string) => string;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);

  /* ── Medias : prop initiale ou lazy-fetch ── */
  const [medias, setMedias] = useState<string[]>(() => {
    if (article.mediaUrls && article.mediaUrls.length > 0) return article.mediaUrls;
    return article.imageUrl ? [article.imageUrl] : [];
  });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Si on n'a qu'une seule image (ou aucune), tenter un lazy fetch pour
    // r\u00e9cup\u00e9rer la liste compl\u00e8te des m\u00e9dias (images + vid\u00e9os).
    if (article.mediaUrls && article.mediaUrls.length > 1) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await listingsApi.publicDetail(article.id);
        if (cancelled) return;
        const list = res?.listing?.mediaUrls ?? [];
        if (list.length > 0) {
          setMedias(list);
          setIndex(0);
        }
      } catch { /* ignore : on garde l'image unique */ }
    })();
    return () => { cancelled = true; };
  }, [article.id, article.mediaUrls]);

  /* ── Close on Escape ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(medias.length - 1, i + 1));
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, medias.length]);

  /* ── Prevent body scroll ── */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* ── Swipe horizontal sur le carrousel ── */
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const onSwipeStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    swipeRef.current = { x: t0.clientX, y: t0.clientY };
  };
  const onSwipeEnd = (e: React.TouchEvent) => {
    const start = swipeRef.current;
    if (!start) return;
    const t0 = e.changedTouches[0];
    const dx = t0.clientX - start.x;
    const dy = t0.clientY - start.y;
    swipeRef.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) setIndex((i) => Math.min(medias.length - 1, i + 1));
      else setIndex((i) => Math.max(0, i - 1));
    }
  };

  const hasMedias = medias.length > 0;
  const current = hasMedias ? medias[index] : null;
  const isVideo = current ? isVideoUrl(current) : false;

  return createPortal(
    <div
      className="lp-popup-backdrop"
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={article.title}
    >
      <div className="lp-popup-card">
        {/* Close */}
        <button className="lp-popup-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>

        {/* Carrousel m\u00e9dia */}
        {hasMedias && current && (
          <div
            className="lp-popup-media"
            onTouchStart={onSwipeStart}
            onTouchEnd={onSwipeEnd}
          >
            {isVideo ? (
              <video
                key={current}
                src={resolveMediaUrl(current)}
                className="lp-popup-media-el"
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                key={current}
                src={resolveMediaUrl(current)}
                alt={article.title}
                className="lp-popup-media-el"
                loading="lazy"
              />
            )}

            {medias.length > 1 && (
              <>
                <button
                  className="lp-popup-nav lp-popup-nav--prev"
                  onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)); }}
                  disabled={index === 0}
                  aria-label="Pr\u00e9c\u00e9dent"
                >
                  ‹
                </button>
                <button
                  className="lp-popup-nav lp-popup-nav--next"
                  onClick={(e) => { e.stopPropagation(); setIndex((i) => Math.min(medias.length - 1, i + 1)); }}
                  disabled={index === medias.length - 1}
                  aria-label="Suivant"
                >
                  ›
                </button>
                <div className="lp-popup-dots" aria-hidden>
                  {medias.map((_, i) => (
                    <span
                      key={i}
                      className={"lp-popup-dot" + (i === index ? " lp-popup-dot--active" : "")}
                      onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                    />
                  ))}
                </div>
                <div className="lp-popup-counter">{index + 1} / {medias.length}</div>
              </>
            )}
          </div>
        )}

        {/* Body */}
        <div className="lp-popup-body">
          <h3 className="lp-popup-title">{article.title}</h3>

          <div className="lp-popup-price-row">
            {article.originalPriceLabel ? (
              <>
                <s className="lp-popup-price-old">{article.originalPriceLabel}</s>
                <span className="lp-popup-price">{article.priceLabel}</span>
              </>
            ) : (
              <span className="lp-popup-price">{article.priceLabel}</span>
            )}
          </div>

          <span className="lp-popup-seller">🏷️ {article.sellerName}</span>
          <span className="lp-popup-type">
            {article.type === "SERVICE" ? "🔧 " + t("common.service") : "📦 " + t("common.product")}
          </span>

          {article.description ? (
            <p className="lp-popup-desc">{article.description}</p>
          ) : (
            <p className="lp-popup-desc lp-popup-desc--empty">
              {t("longPress.noDescription")}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="lp-popup-actions">
          <button className="lp-popup-btn lp-popup-btn--cart" onClick={onAddToCart}>
            🛒 {t("longPress.addToCart")}
          </button>
          {article.isNegotiable && (
            <button className="lp-popup-btn lp-popup-btn--negotiate" onClick={onNegotiate}>
              🤝 {t("longPress.negotiate")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
