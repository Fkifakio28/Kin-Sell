/**
 * IA ADS Kin-Sell — Boost & Mise en avant automatique
 *
 * Règles :
 * 1. Publication unique → proposer un boost de l'article
 * 2. Import en masse ≥ 5 articles → proposer une mise en avant du profil/boutique
 * 3. Les articles boostés/sponsorisés sont clairement identifiés (badge)
 * 4. Séparation visuelle dans la recherche et le feed
 */

import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logger.js";
import { promoteListingBoost, promoteHighlight as promoHighlight } from "./ia-messenger-promo.service.js";
import { assertAddonAccess } from "../../shared/billing/subscription-guard.js";
import { AddonCode } from "@prisma/client";

// ─────────────────────────────────────────────
// Promotion Scope & Pricing
// ─────────────────────────────────────────────

export type PromotionScope = "LOCAL" | "NATIONAL" | "CROSS_BORDER";

export const SCOPE_PRICING_MULTIPLIER: Record<PromotionScope, number> = {
  LOCAL: 1.0,
  NATIONAL: 2.5,
  CROSS_BORDER: 5.0,
};

export interface UserGeoBase {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
}

/** Resolve seller's geographic base from profile */
export async function resolveUserGeo(userId: string): Promise<UserGeoBase> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { city: true, region: true, country: true, countryCode: true },
  });
  return {
    city: profile?.city ?? null,
    region: profile?.region ?? null,
    country: profile?.country ?? null,
    countryCode: profile?.countryCode ?? null,
  };
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface BoostProposal {
  type: "SINGLE_BOOST";
  listingId: string;
  listingTitle: string;
  message: string;
  benefits: string[];
  suggestedDurationDays: number;
  estimatedExtraViews: { min: number; max: number };
}

export interface HighlightProposal {
  type: "PROFILE_HIGHLIGHT" | "SHOP_HIGHLIGHT";
  targetId: string;
  targetName: string;
  message: string;
  benefits: string[];
  articleCount: number;
  suggestedDurationDays: number;
}

export interface AdsBoostStatus {
  listingId: string;
  isBoosted: boolean;
  boostExpiresAt: string | null;
  boostScope: PromotionScope;
  boostTargetCountries: string[];
  pricingMultiplier: number;
}

// ─────────────────────────────────────────────
// Boost Proposal — après publication unique
// ─────────────────────────────────────────────

export async function getBoostProposal(
  userId: string,
  listingId: string
): Promise<BoostProposal> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      category: true,
      city: true,
      priceUsdCents: true,
      ownerUserId: true,
      isBoosted: true,
    },
  });

  if (!listing) throw new HttpError(404, "Article introuvable");
  if (listing.ownerUserId !== userId) throw new HttpError(403, "Non autorisé");

  if (listing.isBoosted) {
    return {
      type: "SINGLE_BOOST",
      listingId: listing.id,
      listingTitle: listing.title,
      message: `Votre article « ${listing.title} » est déjà boosté ! Il apparaît en priorité dans les résultats de recherche.`,
      benefits: [],
      suggestedDurationDays: 0,
      estimatedExtraViews: { min: 0, max: 0 },
    };
  }

  // Analyser la concurrence dans la même catégorie/ville
  const competitorCount = await prisma.listing.count({
    where: {
      category: listing.category,
      city: listing.city,
      status: "ACTIVE",
      isPublished: true,
      id: { not: listing.id },
    },
  });

  const durationDays = competitorCount > 20 ? 14 : competitorCount > 10 ? 7 : 3;
  const baseViews = competitorCount > 10 ? 150 : 80;

  return {
    type: "SINGLE_BOOST",
    listingId: listing.id,
    listingTitle: listing.title,
    message: `🚀 Boostez « ${listing.title} » pour qu'il apparaisse en tête des résultats de recherche à ${listing.city} ! ${competitorCount} articles similaires sont en compétition dans la catégorie ${listing.category}.`,
    benefits: [
      "Apparition prioritaire dans les résultats de recherche",
      "Badge « Sponsorisé » visible — crédibilité renforcée",
      "Position haute dans le feed Explorer",
      `Visibilité accrue face à ${competitorCount} concurrent(s)`,
    ],
    suggestedDurationDays: durationDays,
    estimatedExtraViews: {
      min: baseViews,
      max: Math.round(baseViews * 2.5),
    },
  };
}

// ─────────────────────────────────────────────
// Highlight Proposal — après import bulk ≥ 5
// ─────────────────────────────────────────────

export async function getHighlightProposal(
  userId: string,
  importedCount: number
): Promise<HighlightProposal> {
  if (importedCount < 5) {
    throw new HttpError(400, "La mise en avant nécessite au moins 5 articles importés");
  }

  // Vérifier si l'utilisateur a un business account
  const business = await (prisma as any).businessAccount.findFirst({
    where: {
      OR: [
        { ownerUserId: userId },
        { members: { some: { userId, role: { in: ["OWNER", "ADMIN"] } } } },
      ],
    },
    select: { id: true, shopName: true, slug: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      profile: {
        select: { displayName: true, username: true },
      },
    },
  });

  if (business) {
    return {
      type: "SHOP_HIGHLIGHT",
      targetId: business.id,
      targetName: business.shopName || "Votre boutique",
      message: `🏪 Vous venez d'importer ${importedCount} articles ! Mettez en avant votre boutique « ${business.shopName || "Votre boutique"} » pour que tous vos produits soient plus visibles. Les acheteurs verront votre boutique en priorité dans Explorer et le Marché.`,
      benefits: [
        "Boutique mise en avant dans Explorer → Boutiques en ligne",
        "Badge « Boutique mise en avant » sur tous vos articles",
        "Position prioritaire dans les résultats de recherche",
        "Visibilité accrue sur le marché public So-Kin",
        `${importedCount} articles bénéficient automatiquement du boost`,
      ],
      articleCount: importedCount,
      suggestedDurationDays: importedCount >= 20 ? 30 : importedCount >= 10 ? 14 : 7,
    };
  }

  // Utilisateur sans business → mise en avant du profil public
  const displayName = user?.profile?.displayName || "Votre profil";
  return {
    type: "PROFILE_HIGHLIGHT",
    targetId: userId,
    targetName: displayName,
    message: `👤 Vous venez d'importer ${importedCount} articles ! Mettez en avant votre profil « ${displayName} » pour gagner en visibilité. Les acheteurs verront votre profil en priorité dans les profils publics.`,
    benefits: [
      "Profil mis en avant dans Explorer → Profils publics",
      "Badge « Profil mis en avant » visible par les acheteurs",
      "Vos articles remontent dans les résultats de recherche",
      `${importedCount} articles bénéficient automatiquement de la visibilité`,
    ],
    articleCount: importedCount,
    suggestedDurationDays: importedCount >= 20 ? 30 : importedCount >= 10 ? 14 : 7,
  };
}

// ─────────────────────────────────────────────
// Activer le boost d'un article
// ─────────────────────────────────────────────

export async function activateBoost(
  userId: string,
  listingId: string,
  durationDays: number,
  scope: PromotionScope = "LOCAL",
  targetCountries: string[] = [],
): Promise<AdsBoostStatus> {
  // Garde-fou dur : vérifier l'addon BOOST_VISIBILITY avant toute mutation
  await assertAddonAccess(userId, AddonCode.BOOST_VISIBILITY);

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, ownerUserId: true },
  });

  if (!listing) throw new HttpError(404, "Article introuvable");
  if (listing.ownerUserId !== userId) throw new HttpError(403, "Non autorisé");

  // Validate CROSS_BORDER has target countries
  if (scope === "CROSS_BORDER" && targetCountries.length === 0) {
    throw new HttpError(400, "Le boost inter-pays nécessite au moins un pays cible.");
  }

  const multiplier = SCOPE_PRICING_MULTIPLIER[scope] ?? 1.0;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.min(durationDays, 90));

  await prisma.listing.update({
    where: { id: listingId },
    data: {
      isBoosted: true,
      boostExpiresAt: expiresAt,
      boostScope: scope as any,
      boostTargetCountries: scope === "CROSS_BORDER" ? targetCountries : [],
    },
  });

  // Déclencher la promotion via IA Messenger (non-bloquant)
  promoteListingBoost(listingId).catch((err) =>
    logger.error({ err, listingId }, "[IA ADS] Erreur promo boost")
  );

  return {
    listingId,
    isBoosted: true,
    boostExpiresAt: expiresAt.toISOString(),
    boostScope: scope,
    boostTargetCountries: scope === "CROSS_BORDER" ? targetCountries : [],
    pricingMultiplier: multiplier,
  };
}

// ─────────────────────────────────────────────
// Activer la mise en avant d'un profil/boutique
// → boost tous les articles de l'utilisateur
// ─────────────────────────────────────────────

export async function activateHighlight(
  userId: string,
  durationDays: number,
  businessId?: string,
  scope: PromotionScope = "LOCAL",
  targetCountries: string[] = [],
): Promise<{ boostedCount: number; expiresAt: string; boostScope: PromotionScope; pricingMultiplier: number }> {
  // Garde-fou dur : vérifier l'addon BOOST_VISIBILITY avant toute mutation
  await assertAddonAccess(userId, AddonCode.BOOST_VISIBILITY);

  if (scope === "CROSS_BORDER" && targetCountries.length === 0) {
    throw new HttpError(400, "La mise en avant inter-pays nécessite au moins un pays cible.");
  }

  const multiplier = SCOPE_PRICING_MULTIPLIER[scope] ?? 1.0;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Math.min(durationDays, 90));

  const whereClause: Record<string, unknown> = {
    ownerUserId: userId,
    status: "ACTIVE",
    isPublished: true,
  };
  if (businessId) {
    whereClause.businessId = businessId;
  }

  const result = await prisma.listing.updateMany({
    where: whereClause,
    data: {
      isBoosted: true,
      boostExpiresAt: expiresAt,
      boostScope: scope as any,
      boostTargetCountries: scope === "CROSS_BORDER" ? targetCountries : [],
    },
  });

  // Déclencher la promotion via IA Messenger (non-bloquant)
  const hlType = businessId ? "SHOP" : "PROFILE";
  promoHighlight(userId, hlType).catch((err) =>
    logger.error({ err, userId }, "[IA ADS] Erreur promo highlight")
  );

  return {
    boostedCount: result.count,
    expiresAt: expiresAt.toISOString(),
    boostScope: scope,
    pricingMultiplier: multiplier,
  };
}

// ─────────────────────────────────────────────
// Expiration automatique des boosts
// ─────────────────────────────────────────────

export async function expireBoosts(): Promise<number> {
  // 1. Trouver les listings qui expirent AVANT de les mettre à jour (pour notifier les owners)
  const expiring = await prisma.listing.findMany({
    where: {
      isBoosted: true,
      boostExpiresAt: { lte: new Date() },
    },
    select: { id: true, title: true, ownerUserId: true },
  });

  if (expiring.length === 0) return 0;

  // 2. Désactiver les boosts
  const result = await prisma.listing.updateMany({
    where: {
      id: { in: expiring.map((l) => l.id) },
    },
    data: {
      isBoosted: false,
      boostExpiresAt: null,
    },
  });

  // 3. Notifier chaque propriétaire (push + socket, non-bloquant)
  const { sendPushToUser } = await import("../notifications/push.service.js");
  const uniqueOwners = new Map<string, string[]>();
  for (const l of expiring) {
    const titles = uniqueOwners.get(l.ownerUserId) ?? [];
    titles.push(l.title);
    uniqueOwners.set(l.ownerUserId, titles);
  }

  for (const [userId, titles] of uniqueOwners) {
    const count = titles.length;
    const label = count === 1
      ? `Le boost de « ${titles[0]} » a expiré`
      : `${count} boosts ont expiré`;

    sendPushToUser(userId, {
      title: "⏰ Boost expiré",
      body: `${label}. Reboostez pour rester visible !`,
      tag: `boost-expired-${Date.now()}`,
      data: { type: "boost_expired", url: "/account?section=listings" },
    }).catch(() => {});
  }

  if (result.count > 0) {
    logger.info(`[Boost] ${result.count} boost(s) expiré(s) — ${uniqueOwners.size} propriétaire(s) notifié(s)`);
  }

  return result.count;
}

// ─────────────────────────────────────────────
// Notifications pré-expiration (3h avant)
// ─────────────────────────────────────────────

export async function notifyBoostExpiringSoon(): Promise<number> {
  const now = new Date();
  const in3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  // Fenêtre = expire dans les 3 prochaines heures mais pas encore expiré
  // On utilise un tag unique par listing pour éviter les doublons
  const expiringSoon = await prisma.listing.findMany({
    where: {
      isBoosted: true,
      boostExpiresAt: {
        gt: now,
        lte: in3h,
      },
    },
    select: { id: true, title: true, ownerUserId: true, boostExpiresAt: true },
  });

  if (expiringSoon.length === 0) return 0;

  const { sendPushToUser } = await import("../notifications/push.service.js");

  for (const listing of expiringSoon) {
    const remaining = listing.boostExpiresAt
      ? Math.max(0, Math.round((listing.boostExpiresAt.getTime() - now.getTime()) / 60_000))
      : 0;
    const timeLabel = remaining >= 60
      ? `${Math.round(remaining / 60)}h`
      : `${remaining} min`;

    sendPushToUser(listing.ownerUserId, {
      title: "⚡ Boost bientôt terminé",
      body: `« ${listing.title} » expire dans ${timeLabel}. Reboostez maintenant !`,
      tag: `boost-warning-${listing.id}`,
      data: { type: "boost_expiring", url: "/account?section=listings", listingId: listing.id },
    }).catch(() => {});
  }

  logger.info(`[Boost] ${expiringSoon.length} pré-notification(s) envoyée(s)`);
  return expiringSoon.length;
}
