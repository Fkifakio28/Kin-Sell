import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { resolveMediaUrl } from "../lib/api-core";
import "./long-press-popup.css";

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

export interface LongPressArticle {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
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
  { delay = 500 }: { delay?: number } = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const start = (e: React.TouchEvent) => {
    firedRef.current = false;
    const touch = e.touches[0];
    startPos.current = { x: touch.clientX, y: touch.clientY };
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  };

  const move = (e: React.TouchEvent) => {
    if (!startPos.current || !timerRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - startPos.current.x);
    const dy = Math.abs(touch.clientY - startPos.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const end = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!firedRef.current && onTap) {
      onTap();
    }
    startPos.current = null;
  };

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
  };
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  /* Prevent body scroll while popup is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

        {/* Image */}
        {article.imageUrl && (
          <div className="lp-popup-img">
            <img src={resolveMediaUrl(article.imageUrl)} alt={article.title} />
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
