import { USD_TO_CDF_RATE } from "../shared/constants/currencies";

const formatNumber = (value: number) => new Intl.NumberFormat('fr-CD').format(value);

export const formatPriceLabelToCdf = (priceLabel: string) => {
  const normalizedLabel = priceLabel.trim();

  if (!normalizedLabel.includes('$')) {
    return normalizedLabel;
  }

  const match = normalizedLabel.match(/(\d[\d\s.,]*)\s*\$/);
  if (!match) {
    return normalizedLabel.replace(/\$/g, 'FC');
  }

  const numericValue = Number.parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
  if (Number.isNaN(numericValue)) {
    return normalizedLabel.replace(/\$/g, 'FC');
  }

  const convertedValue = Math.round(numericValue * USD_TO_CDF_RATE);
  return normalizedLabel.replace(match[0], `${formatNumber(convertedValue)} FC`);
};