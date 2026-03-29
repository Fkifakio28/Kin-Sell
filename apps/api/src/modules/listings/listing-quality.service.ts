/**
 * ListingQuality — IA d'évaluation qualité des annonces
 *
 * Attribue un score de qualité (0-100) à une annonce en analysant
 * la complétude et la richesse de ses informations.
 *
 * Utilisé pour guider les vendeurs vers de meilleures annonces.
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";

export interface QualityFactor {
  key: string;
  label: string;
  points: number;
  earned: number;
  tip: string | null;
}

export interface ListingQualityReport {
  listingId: string;
  score: number;         // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: QualityFactor[];
  suggestions: string[];
}

const RULES: Array<{
  key: string;
  label: string;
  points: number;
  check: (l: Record<string, any>) => boolean;
  tip: string;
}> = [
  {
    key: "title_length",
    label: "Titre descriptif (≥ 20 caractères)",
    points: 15,
    check: (l) => typeof l.title === "string" && l.title.length >= 20,
    tip: "Un titre plus long et descriptif aide les acheteurs à trouver votre annonce.",
  },
  {
    key: "has_description",
    label: "Description présente",
    points: 20,
    check: (l) => typeof l.description === "string" && l.description.length >= 30,
    tip: "Ajoutez une description d'au moins 30 caractères pour mieux vendre votre produit.",
  },
  {
    key: "rich_description",
    label: "Description riche (≥ 100 caractères)",
    points: 10,
    check: (l) => typeof l.description === "string" && l.description.length >= 100,
    tip: "Une description détaillée (100+ caractères) augmente la confiance des acheteurs.",
  },
  {
    key: "has_image",
    label: "Image principale présente",
    points: 20,
    check: (l) => typeof l.imageUrl === "string" && l.imageUrl.length > 0,
    tip: "Les annonces avec photo reçoivent 3× plus de vues. Ajoutez une image.",
  },
  {
    key: "has_multiple_images",
    label: "Plusieurs medias (≥ 2)",
    points: 10,
    check: (l) => Array.isArray(l.mediaUrls) && l.mediaUrls.length >= 2,
    tip: "Ajoutez plusieurs photos pour montrer votre produit sous différents angles.",
  },
  {
    key: "has_price",
    label: "Prix défini",
    points: 15,
    check: (l) => typeof l.priceUsdCents === "number" && l.priceUsdCents > 0,
    tip: "Fixez un prix clair pour maximiser les contacts.",
  },
  {
    key: "has_city",
    label: "Ville renseignée",
    points: 5,
    check: (l) => typeof l.city === "string" && l.city.length > 0,
    tip: "Indiquez la ville pour attirer les acheteurs locaux.",
  },
  {
    key: "has_coordinates",
    label: "Localisation GPS",
    points: 5,
    check: (l) => typeof l.latitude === "number" && typeof l.longitude === "number",
    tip: "La localisation GPS améliore votre visibilité sur la carte.",
  },
];

function gradeFromScore(score: number): ListingQualityReport["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

export async function getListingQuality(listingId: string): Promise<ListingQualityReport> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      description: true,
      imageUrl: true,
      mediaUrls: true,
      priceUsdCents: true,
      city: true,
      latitude: true,
      longitude: true,
      category: true,
    },
  });

  if (!listing) {
    throw new HttpError(404, "Annonce introuvable");
  }

  const l = listing as Record<string, any>;
  const totalPoints = RULES.reduce((s, r) => s + r.points, 0);

  let earnedTotal = 0;
  const factors: QualityFactor[] = [];
  const suggestions: string[] = [];

  for (const rule of RULES) {
    const passed = rule.check(l);
    const earned = passed ? rule.points : 0;
    earnedTotal += earned;
    factors.push({
      key: rule.key,
      label: rule.label,
      points: rule.points,
      earned,
      tip: passed ? null : rule.tip,
    });
    if (!passed) {
      suggestions.push(rule.tip);
    }
  }

  const score = Math.round((earnedTotal / totalPoints) * 100);

  return {
    listingId,
    score,
    grade: gradeFromScore(score),
    factors,
    suggestions,
  };
}
