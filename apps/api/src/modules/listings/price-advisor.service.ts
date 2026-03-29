/**
 * PriceAdvisor — IA de conseil en tarification
 *
 * Analyse les annonces similaires (même catégorie + même ville) pour fournir
 * une recommandation de prix basée sur les données du marché local.
 *
 * Pipeline : Fetch similar → Filter outliers → Compute stats → Generate suggestion
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

export interface PriceAdvice {
  listingId: string;
  category: string;
  city: string;
  sampleSize: number;
  marketMin: number;    // USD cents
  marketMax: number;    // USD cents
  marketMedian: number; // USD cents
  marketAverage: number; // USD cents
  suggestedMin: number; // USD cents
  suggestedMax: number; // USD cents
  confidence: "low" | "medium" | "high";
  tips: string[];
}

/**
 * Calcule la médiane d'un tableau de nombres trié.
 */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Retire les outliers via IQR (interquartile range).
 */
function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length / 4)];
  const q3 = sorted[Math.floor((3 * sorted.length) / 4)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return sorted.filter((v) => v >= lower && v <= upper);
}

/**
 * Retourne un conseil de tarification pour une annonce donnée.
 */
export async function getPriceAdvice(listingId: string): Promise<PriceAdvice> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, category: true, city: true, type: true, priceUsdCents: true },
  });

  if (!listing) {
    throw new HttpError(404, "Annonce introuvable");
  }

  // Cherche des annonces similaires (même catégorie ± même ville, statut ACTIVE)
  const similars = await prisma.listing.findMany({
    where: {
      id: { not: listingId },
      status: "ACTIVE",
      type: listing.type,
      category: listing.category,
      priceUsdCents: { gt: 0 },
    },
    select: { priceUsdCents: true, city: true },
    take: 200,
  });

  // Priorité aux annonces de la même ville
  const sameCity = similars.filter(
    (l) => l.city.toLowerCase().trim() === listing.city.toLowerCase().trim()
  );
  const pool = sameCity.length >= 5 ? sameCity : similars;

  const rawPrices = pool.map((l) => l.priceUsdCents!).filter(Boolean);
  const prices = removeOutliers(rawPrices).sort((a, b) => a - b);

  const sampleSize = prices.length;

  if (sampleSize === 0) {
    return {
      listingId,
      category: listing.category,
      city: listing.city,
      sampleSize: 0,
      marketMin: 0,
      marketMax: 0,
      marketMedian: 0,
      marketAverage: 0,
      suggestedMin: 0,
      suggestedMax: 0,
      confidence: "low",
      tips: [
        "Aucune donnée marché disponible pour cette catégorie.",
        "Fixez votre prix en fonction de votre coût de revient et de votre marge souhaitée.",
      ],
    };
  }

  const marketMin = prices[0];
  const marketMax = prices[prices.length - 1];
  const marketMedian = median(prices);
  const marketAverage = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length);

  // Suggestion: fourchette autour de la médiane (±15%)
  const suggestedMin = Math.round(marketMedian * 0.85);
  const suggestedMax = Math.round(marketMedian * 1.15);

  const confidence: PriceAdvice["confidence"] =
    sampleSize >= 20 ? "high" : sampleSize >= 8 ? "medium" : "low";

  const tips: string[] = [];

  if (sampleSize < 5) {
    tips.push("Peu de données disponibles — la recommandation est indicative.");
  }
  if (listing.priceUsdCents && listing.priceUsdCents > suggestedMax * 1.3) {
    tips.push("Votre prix actuel est significativement au-dessus du marché. Envisagez une baisse pour attirer plus d'acheteurs.");
  } else if (listing.priceUsdCents && listing.priceUsdCents < suggestedMin * 0.7) {
    tips.push("Votre prix est très bas par rapport au marché. Vous pouvez peut-être augmenter votre marge.");
  } else {
    tips.push("Votre prix est cohérent avec le marché local.");
  }
  tips.push(`Basé sur ${sampleSize} annonce${sampleSize > 1 ? "s" : ""} similaire${sampleSize > 1 ? "s" : ""} dans la catégorie "${listing.category}".`);

  return {
    listingId,
    category: listing.category,
    city: listing.city,
    sampleSize,
    marketMin,
    marketMax,
    marketMedian,
    marketAverage,
    suggestedMin,
    suggestedMax,
    confidence,
    tips,
  };
}
