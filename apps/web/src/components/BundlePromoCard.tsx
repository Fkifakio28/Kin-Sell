/**
 * BundlePromoCard — Carte premium pour promotion lot/bundle
 * Affiche le lot avec prix barré, économie, timer, et tous les articles inclus
 */
import { type FC, useState, useEffect } from 'react';
import { useLocaleCurrency } from '../app/providers/LocaleCurrencyProvider';
import {
  type PromotionRecord,
  getEffectiveBundlePrice,
  getOriginalBundlePrice,
  getBundleSavings,
  getBundleLabel,
  getBundleSlogan,
  getUrgencyLabel,
  getTimeRemaining,
  getPromoStatus,
} from '../shared/promo/promo-engine';
import './bundle-promo-card.css';

type BundleItem = {
  listingId: string;
  originalPriceUsdCents: number;
  promoPriceUsdCents: number | null;
  quantity: number;
  listing?: {
    id: string;
    title: string;
    imageUrl: string | null;
    priceUsdCents: number;
    city?: string;
    mediaUrls?: string[];
  };
};

type BundlePromoCardProps = {
  promo: Omit<PromotionRecord, 'items'> & { items: BundleItem[] };
  resolveMediaUrl: (url: string) => string;
  onViewItem?: (listingId: string) => void;
  owner?: {
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
  };
};

export const BundlePromoCard: FC<BundlePromoCardProps> = ({ promo, resolveMediaUrl, onViewItem, owner }) => {
  const { formatPriceLabelFromUsdCents } = useLocaleCurrency();
  const [now, setNow] = useState(() => new Date());

  // Update timer every minute
  useEffect(() => {
    const remaining = getTimeRemaining(promo.expiresAt);
    if (remaining == null || remaining <= 0) return;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [promo.expiresAt]);

  const status = getPromoStatus(promo as PromotionRecord, now);
  if (status !== 'ACTIVE') return null;

  const effective = getEffectiveBundlePrice(promo as PromotionRecord, now);
  const original = getOriginalBundlePrice(promo as PromotionRecord);
  const savings = getBundleSavings(promo as PromotionRecord, now);
  const label = getBundleLabel(promo as PromotionRecord);
  const slogan = getBundleSlogan(promo as PromotionRecord);
  const urgency = getUrgencyLabel(promo.expiresAt);

  // Get up to 3 preview images
  const previewImages = promo.items
    .slice(0, 3)
    .map((item) => item.listing?.imageUrl)
    .filter(Boolean) as string[];

  return (
    <div className="bundle-card">
      {/* ── Ribbon ── */}
      <div className="bundle-ribbon">
        <span className="bundle-ribbon-text">{label}</span>
        {savings.percent > 0 && (
          <span className="bundle-ribbon-badge">-{savings.percent}%</span>
        )}
      </div>

      {/* ── Image stack ── */}
      <div className="bundle-images">
        {previewImages.length > 0 ? (
          previewImages.map((url, i) => (
            <div key={i} className="bundle-img-slot" style={{ zIndex: 10 - i, transform: `translateX(${i * -12}px) rotate(${(i - 1) * 3}deg)` }}>
              <img src={resolveMediaUrl(url)} alt="" loading="lazy" />
            </div>
          ))
        ) : (
          <div className="bundle-img-slot bundle-img-placeholder">📦</div>
        )}
        <span className="bundle-item-count">{promo.items.length} articles</span>
      </div>

      {/* ── Info ── */}
      <div className="bundle-info">
        {promo.title && <h4 className="bundle-title">{promo.title}</h4>}
        <p className="bundle-slogan">{slogan}</p>

        {/* ── Pricing ── */}
        <div className="bundle-pricing">
          <s className="bundle-price-original">{formatPriceLabelFromUsdCents(original)}</s>
          <span className="bundle-price-effective">{formatPriceLabelFromUsdCents(effective)}</span>
          {savings.amount > 0 && (
            <span className="bundle-save-label">
              Économisez {formatPriceLabelFromUsdCents(savings.amount)}
            </span>
          )}
        </div>

        {/* ── Timer ── */}
        {urgency && (
          <div className="bundle-timer">
            <span className="bundle-timer-icon">⏰</span>
            <span className="bundle-timer-text">{urgency}</span>
          </div>
        )}

        {/* ── Owner ── */}
        {owner && (
          <div className="bundle-owner">
            {owner.avatarUrl ? (
              <img src={resolveMediaUrl(owner.avatarUrl)} alt="" className="bundle-owner-avatar" />
            ) : (
              <span className="bundle-owner-avatar bundle-owner-avatar--placeholder">
                {owner.displayName.charAt(0)}
              </span>
            )}
            <span className="bundle-owner-name">{owner.displayName}</span>
          </div>
        )}
      </div>

      {/* ── Items list ── */}
      <div className="bundle-items">
        {promo.items.map((item) => (
          <button
            key={item.listingId}
            className="bundle-item-row"
            type="button"
            onClick={() => onViewItem?.(item.listingId)}
          >
            <div className="bundle-item-thumb">
              {item.listing?.imageUrl ? (
                <img src={resolveMediaUrl(item.listing.imageUrl)} alt="" loading="lazy" />
              ) : (
                <span>📦</span>
              )}
            </div>
            <div className="bundle-item-info">
              <span className="bundle-item-name">{item.listing?.title ?? 'Article'}</span>
              {item.quantity > 1 && <span className="bundle-item-qty">×{item.quantity}</span>}
            </div>
            <span className="bundle-item-price">{formatPriceLabelFromUsdCents(item.originalPriceUsdCents)}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
