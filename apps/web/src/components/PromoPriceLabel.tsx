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
        <s style={{ opacity: 0.5, fontSize: '0.85em', marginRight: 4 }}>{formatPrice(priceUsdCents)}</s>{' '}
        {formatPrice(promoPriceUsdCents)}{' '}
        <span style={{ fontSize: '0.7rem', color: '#ff9800', fontWeight: 700 }}>PROMO</span>
      </p>
    );
  }
  return <p className={className}>{formatPrice(priceUsdCents)}</p>;
};
