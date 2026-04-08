import type { FC } from 'react';

type PromoPriceLabelProps = {
  priceUsdCents: number;
  promoActive?: boolean;
  promoPriceUsdCents?: number | null;
  formatPrice: (cents: number) => string;
  className?: string;
};

export const PromoPriceLabel: FC<PromoPriceLabelProps> = ({ priceUsdCents, promoActive, promoPriceUsdCents, formatPrice, className }) => {
  if (promoActive && promoPriceUsdCents != null) {
    return (
      <p className={className}>
        <s className="promo-price-original">{formatPrice(priceUsdCents)}</s>{' '}
        {formatPrice(promoPriceUsdCents)}{' '}
        <span className="promo-price-badge">PROMO</span>
      </p>
    );
  }
  return <p className={className}>{formatPrice(priceUsdCents)}</p>;
};
