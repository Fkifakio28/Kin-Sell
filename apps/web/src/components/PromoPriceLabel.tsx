import type { FC } from 'react';
import { getUrgencyLabel } from '../shared/promo/promo-engine';

type PromoPriceLabelProps = {
  priceUsdCents: number;
  promoActive?: boolean;
  promoPriceUsdCents?: number | null;
  promoExpiresAt?: string | null;
  formatPrice: (cents: number) => string;
  className?: string;
  showSavings?: boolean;
  showTimer?: boolean;
};

export const PromoPriceLabel: FC<PromoPriceLabelProps> = ({
  priceUsdCents, promoActive, promoPriceUsdCents, promoExpiresAt,
  formatPrice, className, showSavings, showTimer,
}) => {
  if (promoActive && promoPriceUsdCents != null) {
    const savingPct = priceUsdCents > 0
      ? Math.round(((priceUsdCents - promoPriceUsdCents) / priceUsdCents) * 100)
      : 0;
    const urgency = showTimer ? getUrgencyLabel(promoExpiresAt ?? null) : null;

    return (
      <div className={`ks-promo-price ${className ?? ''}`}>
        <p className="ks-promo-price-line">
          <s className="promo-price-original">{formatPrice(priceUsdCents)}</s>{' '}
          <span className="promo-price-effective">{formatPrice(promoPriceUsdCents)}</span>{' '}
          <span className="promo-price-badge">PROMO</span>
          {showSavings && savingPct > 0 && (
            <span className="promo-saving-pct">-{savingPct}%</span>
          )}
        </p>
        {urgency && <span className="promo-urgency-label">{urgency}</span>}
      </div>
    );
  }
  return <p className={className}>{formatPrice(priceUsdCents)}</p>;
};
