import { ListingStatus, PromotionStatus, PromotionDiffusion, PromotionType } from "../../shared/db/prisma-enums.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { Role } from "../../types/roles.js";
import { normalizeImageInput, normalizeImageInputs } from "../../shared/utils/media-storage.js";
import { resolveCountryCode, resolveCountryTerms, getSameRegionCountries } from "../../shared/geo/country-aliases.js";
import { resolvePromoStatus } from "../../shared/promo/promo-engine.js";
import { applyBoostRanking, hydrateBoostCampaigns } from "../boost/ranking.service.js";

/** Optimized include for listing search — only fields needed for cards */
const listingSearchInclude = {
  ownerUser: {
    select: {
      id: true,
      profile: { select: { displayName: true, username: true, avatarUrl: true } },
    },
  },
  business: { select: { id: true, publicName: true, slug: true } },
} as const;

export type ListingType = "PRODUIT" | "SERVICE";

export type CreateListingInput = {
  type: ListingType;
  title: string;
  description?: string;
  category: string;
  city: string;
  country?: string;
  countryCode?: string;
  region?: string;
  district?: string;
  formattedAddress?: string;
  latitude: number;
  longitude: number;
  placeId?: string;
  locationVisibility?: string;
  serviceRadiusKm?: number;
  imageUrl?: string;
  mediaUrls?: string[];
  priceUsdCents?: number;
  stockQuantity?: number | null;
  serviceDurationMin?: number | null;
  serviceLocation?: string | null;
  isNegotiable?: boolean;
  variants?: { sizes?: string[]; colors?: { name: string; hex: string }[] } | null;
};

export type UpdateListingInput = {
  title?: string;
  description?: string;
  category?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  district?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  locationVisibility?: string;
  serviceRadiusKm?: number | null;
  imageUrl?: string;
  mediaUrls?: string[];
  priceUsdCents?: number;
  stockQuantity?: number | null;
  serviceDurationMin?: number | null;
  serviceLocation?: string | null;
  isNegotiable?: boolean;
  variants?: { sizes?: string[]; colors?: { name: string; hex: string }[] } | null;
};

export type SearchListingsInput = {
  q?: string;
  type?: ListingType;
  city?: string;
  country?: string;
  /** Code ISO pays (filtre direct sur Listing.countryCode). */
  countryCode?: string;
  /** Mode de découverte : local_first (défaut), local_only, all. */
  discoveryMode?: "local_first" | "local_only" | "all";
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  limit: number;
};

type GeoPoint = {
  lat: number;
  lng: number;
};

const DEFAULT_RADIUS_KM = 25;

const toRad = (value: number) => (value * Math.PI) / 180;

/**
 * Check if a boosted listing should display as boosted for the current viewer.
 * Rules (strict — correction bug P1.6) :
 * - LOCAL: only if viewer's city matches the listing's city (false si viewer anonyme)
 * - NATIONAL: only if viewer's country matches the listing's country (false si viewer anonyme)
 * - CROSS_BORDER: only if viewer's country is in boostTargetCountries
 * - null/undefined scope → backward compat: always boosted if active
 */
function isBoostVisibleToViewer(
  row: { isBoosted: boolean; boostExpiresAt: Date | null; boostScope?: string | null; boostTargetCountries?: string[]; city: string; country?: string | null },
  viewerCity?: string,
  viewerCountry?: string,
): boolean {
  if (!row.isBoosted) return false;
  if (row.boostExpiresAt && row.boostExpiresAt <= new Date()) return false;

  const scope = row.boostScope ?? null;
  // No scope set → backward compat: always visible as boosted
  if (!scope) return true;

  const vCity = viewerCity?.toLowerCase().trim();
  const vCountry = viewerCountry?.toLowerCase().trim();

  switch (scope) {
    case "LOCAL":
      if (!vCity) return false; // strict: viewer anonyme ne voit pas les boosts locaux
      return row.city.toLowerCase() === vCity;
    case "NATIONAL":
      if (!vCountry) return false;
      return (row.country ?? "").toLowerCase() === vCountry;
    case "CROSS_BORDER": {
      if (!vCountry) return false;
      const targets = row.boostTargetCountries ?? [];
      return targets.some((t) => t.toLowerCase() === vCountry);
    }
    default:
      return true;
  }
}

const getDistanceKm = (from: GeoPoint, to: GeoPoint) => {
  const earthRadiusKm = 6371;
  const deltaLat = toRad(to.lat - from.lat);
  const deltaLng = toRad(to.lng - from.lng);
  const base =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const arc = 2 * Math.atan2(Math.sqrt(base), Math.sqrt(1 - base));

  return earthRadiusKm * arc;
};

export const createListing = async (userId: string, payload: CreateListingInput) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new HttpError(404, "Utilisateur introuvable");
  }

  if (user.role !== Role.USER && user.role !== Role.BUSINESS) {
    throw new HttpError(403, "Ce role ne peut pas publier de produit ou service");
  }

  let businessId: string | undefined;
  if (user.role === Role.BUSINESS) {
    const business = await prisma.businessAccount.findFirst({ where: { ownerUserId: userId } });
    if (!business) {
      throw new HttpError(400, "Aucun compte entreprise trouve pour cet utilisateur");
    }
    businessId = business.id;
  }

  const [imageUrl, mediaUrls] = await Promise.all([
    normalizeImageInput(payload.imageUrl, { folder: "listings" }),
    normalizeImageInputs(payload.mediaUrls, { folder: "listings" }),
  ]);

  // ── Résolution du countryCode ──
  const resolvedCountryCode = payload.countryCode?.toUpperCase()
    ?? resolveCountryCode(payload.country)
    ?? undefined;

  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.listing.create({
      data: {
        type: payload.type,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        city: payload.city,
        country: payload.country,
        countryCode: resolvedCountryCode as any,
        region: payload.region,
        district: payload.district,
        formattedAddress: payload.formattedAddress,
        latitude: payload.latitude,
        longitude: payload.longitude,
        placeId: payload.placeId,
        locationVisibility: (payload.locationVisibility as any) ?? undefined,
        serviceRadiusKm: payload.serviceRadiusKm,
        imageUrl,
        mediaUrls: mediaUrls ?? [],
        priceUsdCents: payload.priceUsdCents ?? 0,
        stockQuantity: payload.stockQuantity ?? null,
        serviceDurationMin: payload.serviceDurationMin ?? null,
        serviceLocation: payload.serviceLocation ?? null,
        isNegotiable: user.role === Role.USER ? true : (payload.isNegotiable ?? true),
        variants: (payload.type === "PRODUIT" ? (payload.variants ?? null) : null) as any,
        ownerUserId: userId,
        businessId
      }
    });

    await tx.auditLog.create({
      data: {
        actorUserId: userId,
        action: "LISTING_CREATE",
        entityType: "LISTING",
        entityId: created.id,
        metadata: {
          type: created.type,
          city: created.city,
          latitude: created.latitude,
          longitude: created.longitude
        }
      }
    });

    return created;
  });

  return listing;
};

/* ── My listings (owner dashboard) ── */
export const myListings = async (
  userId: string,
  filters: { status?: ListingStatus; type?: ListingType; page: number; limit: number }
) => {
  const where: Record<string, unknown> = { ownerUserId: userId };
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  // Exclude soft-deleted by default unless explicitly asked
  if (!filters.status) {
    where.status = { not: ListingStatus.DELETED };
  }

  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    total,
    page: filters.page,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    listings: rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      title: row.title,
      description: row.description,
      category: row.category,
      city: row.city,
      latitude: row.latitude,
      longitude: row.longitude,
      imageUrl: row.imageUrl,
      mediaUrls: row.mediaUrls,
      priceUsdCents: row.priceUsdCents,
      stockQuantity: row.stockQuantity,
      serviceDurationMin: row.serviceDurationMin,
      serviceLocation: row.serviceLocation,
      isPublished: row.isPublished,
      isNegotiable: row.isNegotiable,
      isBoosted: row.isBoosted,
      promoActive: row.promoActive,
      promoPriceUsdCents: row.promoPriceUsdCents,
      promoExpiresAt: row.promoExpiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  };
};

/* ── Get single listing (owner) ── */
export const getMyListing = async (userId: string, listingId: string) => {
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, ownerUserId: userId },
  });
  if (!listing) throw new HttpError(404, "Article introuvable");
  return listing;
};

/* ── Set promo on one or more listings (ITEM promo) ── */
export const setPromo = async (
  userId: string,
  listingIds: string[],
  promoPriceUsdCents: number,
  activate: boolean,
  options?: { title?: string; promoLabel?: string; diffusion?: PromotionDiffusion; startsAt?: string; expiresAt?: string }
) => {
  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, ownerUserId: userId },
    select: { id: true, priceUsdCents: true, status: true, businessId: true },
  });
  if (listings.length === 0) throw new HttpError(404, "Aucun article trouvé");
  const foundIds = listings.map((l) => l.id);

  if (activate) {
    for (const listing of listings) {
      if (promoPriceUsdCents >= listing.priceUsdCents) {
        throw new HttpError(400, `Le prix promo doit être inférieur au prix original pour "${listing.id}"`);
      }
    }

    // ── Conflict detection: reject if any listing already has an active/scheduled ITEM promo ──
    const existingPromoItems = await prisma.promotionItem.findMany({
      where: {
        listingId: { in: foundIds },
        promotion: {
          promoType: PromotionType.ITEM,
          status: { in: [PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED] },
        },
      },
      select: { listingId: true, promotion: { select: { id: true, status: true } } },
    });
    if (existingPromoItems.length > 0) {
      const conflictIds = [...new Set(existingPromoItems.map((pi) => pi.listingId))];
      throw new HttpError(
        409,
        `Conflit : ${conflictIds.length} article(s) ont déjà une promo ITEM active/programmée. Annulez-la d'abord.`
      );
    }

    const startsAt = options?.startsAt ? new Date(options.startsAt) : new Date();
    const expiresAt = options?.expiresAt ? new Date(options.expiresAt) : null;
    const isScheduled = startsAt > new Date();
    const status = isScheduled ? PromotionStatus.SCHEDULED : PromotionStatus.ACTIVE;

    const promotion = await prisma.$transaction(async (tx) => {
      const promo = await tx.promotion.create({
        data: {
          ownerUserId: userId,
          businessId: listings[0].businessId ?? undefined,
          promoType: PromotionType.ITEM,
          title: options?.title ?? null,
          promoLabel: options?.promoLabel ?? null,
          status,
          diffusion: options?.diffusion ?? PromotionDiffusion.SIMPLE,
          startsAt,
          expiresAt,
          items: {
            create: listings.map((l) => ({
              listingId: l.id,
              originalPriceUsdCents: l.priceUsdCents,
              promoPriceUsdCents,
            })),
          },
        },
      });

      if (!isScheduled) {
        await tx.listing.updateMany({
          where: { id: { in: foundIds } },
          data: {
            promoActive: true,
            promoPriceUsdCents,
            promoExpiresAt: expiresAt,
            promotionId: promo.id,
          },
        });
      }

      return promo;
    });

    return { updated: foundIds.length, listingIds: foundIds, promoActive: !isScheduled, promotionId: promotion.id, status };
  } else {
    await prisma.$transaction(async (tx) => {
      const promoItems = await tx.promotionItem.findMany({
        where: { listingId: { in: foundIds } },
        select: { promotionId: true },
      });
      const promoIds = [...new Set(promoItems.map((pi) => pi.promotionId))];
      if (promoIds.length > 0) {
        await tx.promotion.updateMany({
          where: { id: { in: promoIds }, status: { in: [PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED] } },
          data: { status: PromotionStatus.CANCELLED },
        });
      }

      await tx.listing.updateMany({
        where: { id: { in: foundIds } },
        data: {
          promoActive: false,
          promoPriceUsdCents: null,
          promoExpiresAt: null,
          promotionId: null,
        },
      });
    });

    return { updated: foundIds.length, listingIds: foundIds, promoActive: false, promotionId: null, status: "CANCELLED" };
  }
};

/* ── Set BUNDLE promo (lot) ── */
export const setBundlePromo = async (
  userId: string,
  listingIds: string[],
  bundlePriceUsdCents: number,
  options?: {
    title?: string;
    promoLabel?: string;
    diffusion?: PromotionDiffusion;
    startsAt?: string;
    expiresAt?: string;
    quantities?: Record<string, number>;
  }
) => {
  if (listingIds.length < 2) throw new HttpError(400, "Un lot doit contenir au moins 2 articles");

  const listings = await prisma.listing.findMany({
    where: { id: { in: listingIds }, ownerUserId: userId },
    select: { id: true, priceUsdCents: true, status: true, businessId: true },
  });
  if (listings.length < 2) throw new HttpError(404, "Pas assez d'articles trouvés");

  const bundleOriginal = listings.reduce((sum, l) => {
    const qty = options?.quantities?.[l.id] ?? 1;
    return sum + l.priceUsdCents * qty;
  }, 0);

  if (bundlePriceUsdCents >= bundleOriginal) {
    throw new HttpError(400, "Le prix du lot promo doit être inférieur au total normal");
  }

  // ── Conflict detection: reject if these exact listings already form an active/scheduled BUNDLE promo ──
  const foundIds = listings.map((l) => l.id);
  const existingBundlePromos = await prisma.promotion.findMany({
    where: {
      promoType: PromotionType.BUNDLE,
      status: { in: [PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED] },
      items: { some: { listingId: { in: foundIds } } },
    },
    select: { id: true },
  });
  if (existingBundlePromos.length > 0) {
    throw new HttpError(
      409,
      `Conflit : un ou plusieurs articles font déjà partie d'un lot promo actif/programmé. Annulez-le d'abord.`
    );
  }

  const startsAt = options?.startsAt ? new Date(options.startsAt) : new Date();
  const expiresAt = options?.expiresAt ? new Date(options.expiresAt) : null;
  const isScheduled = startsAt > new Date();
  const status = isScheduled ? PromotionStatus.SCHEDULED : PromotionStatus.ACTIVE;

  const promotion = await prisma.$transaction(async (tx) => {
    const promo = await tx.promotion.create({
      data: {
        ownerUserId: userId,
        businessId: listings[0].businessId ?? undefined,
        promoType: PromotionType.BUNDLE,
        title: options?.title ?? null,
        promoLabel: options?.promoLabel ?? null,
        status,
        diffusion: options?.diffusion ?? PromotionDiffusion.SIMPLE,
        startsAt,
        expiresAt,
        bundlePriceUsdCents,
        bundleOriginalUsdCents: bundleOriginal,
        items: {
          create: listings.map((l) => ({
            listingId: l.id,
            originalPriceUsdCents: l.priceUsdCents,
            promoPriceUsdCents: null,
            quantity: options?.quantities?.[l.id] ?? 1,
          })),
        },
      },
    });
    return promo;
  });

  return {
    promotionId: promotion.id,
    promoType: "BUNDLE" as const,
    bundlePriceUsdCents,
    bundleOriginalUsdCents: bundleOriginal,
    itemCount: listings.length,
    status,
  };
};

/* ── Cancel a promotion (ITEM or BUNDLE) ── */
export const cancelPromotion = async (userId: string, promotionId: string) => {
  const promo = await prisma.promotion.findFirst({
    where: { id: promotionId, ownerUserId: userId },
    include: { items: { select: { listingId: true } } },
  });
  if (!promo) throw new HttpError(404, "Promotion introuvable");
  if (promo.status === "CANCELLED" || promo.status === "EXPIRED") {
    throw new HttpError(400, "Cette promotion est déjà terminée");
  }

  await prisma.$transaction(async (tx) => {
    await tx.promotion.update({
      where: { id: promotionId },
      data: { status: PromotionStatus.CANCELLED },
    });

    if (promo.promoType === "ITEM") {
      const listingIds = promo.items.map((i) => i.listingId);
      await tx.listing.updateMany({
        where: { id: { in: listingIds }, promotionId },
        data: {
          promoActive: false,
          promoPriceUsdCents: null,
          promoExpiresAt: null,
          promotionId: null,
        },
      });
    }
  });

  return { cancelled: true, promotionId };
};

/* ── Activate scheduled promotions (cron-callable) ── */
export const activateScheduledPromos = async () => {
  const now = new Date();
  const scheduled = await prisma.promotion.findMany({
    where: { status: PromotionStatus.SCHEDULED, startsAt: { lte: now } },
    include: { items: { select: { listingId: true, promoPriceUsdCents: true } } },
  });

  if (scheduled.length === 0) return { activated: 0 };

  let activated = 0;
  // Batch : une seule transaction pour toutes les promos
  await prisma.$transaction(async (tx) => {
    for (const promo of scheduled) {
      await tx.promotion.update({
        where: { id: promo.id },
        data: { status: PromotionStatus.ACTIVE },
      });

      if (promo.promoType === "ITEM" && promo.items.length > 0) {
        // Batch update par promo
        for (const item of promo.items) {
          if (item.promoPriceUsdCents != null) {
            await tx.listing.update({
              where: { id: item.listingId },
              data: {
                promoActive: true,
                promoPriceUsdCents: item.promoPriceUsdCents,
                promoExpiresAt: promo.expiresAt,
                promotionId: promo.id,
              },
            });
          }
        }
      }
      activated++;
    }
  });
  return { activated };
};

/* ── Expire ended promotions (cron-callable) ── */
export const expireEndedPromos = async () => {
  const now = new Date();
  const expired = await prisma.promotion.findMany({
    where: {
      status: { in: [PromotionStatus.ACTIVE, PromotionStatus.SCHEDULED] },
      expiresAt: { lte: now },
    },
    include: { items: { select: { listingId: true } } },
  });

  if (expired.length === 0) return { expired: 0 };

  let expiredCount = 0;
  // Batch : une seule transaction pour toutes les expirations
  await prisma.$transaction(async (tx) => {
    const allPromoIds = expired.map((p) => p.id);
    await tx.promotion.updateMany({
      where: { id: { in: allPromoIds } },
      data: { status: PromotionStatus.EXPIRED },
    });

    for (const promo of expired) {
      if (promo.promoType === "ITEM") {
        const listingIds = promo.items.map((i) => i.listingId);
        if (listingIds.length > 0) {
          await tx.listing.updateMany({
            where: { id: { in: listingIds }, promotionId: promo.id },
            data: {
              promoActive: false,
              promoPriceUsdCents: null,
              promoExpiresAt: null,
              promotionId: null,
            },
          });
        }
      }
      expiredCount++;
    }
  });
  return { expired: expiredCount };
};

/* ── Get promotions for a user ── */
export const getMyPromotions = async (userId: string) => {
  const promotions = await prisma.promotion.findMany({
    where: { ownerUserId: userId },
    include: {
      items: {
        include: {
          listing: {
            select: { id: true, title: true, imageUrl: true, priceUsdCents: true, promoActive: true, promoPriceUsdCents: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return promotions;
};

/* ── Get single promotion detail ── */
export const getPromotionDetail = async (userId: string, promotionId: string) => {
  const promo = await prisma.promotion.findFirst({
    where: { id: promotionId, ownerUserId: userId },
    include: {
      items: {
        include: {
          listing: {
            select: { id: true, title: true, imageUrl: true, priceUsdCents: true, promoActive: true, promoPriceUsdCents: true, mediaUrls: true },
          },
        },
      },
    },
  });
  if (!promo) throw new HttpError(404, "Promotion introuvable");
  return promo;
};

/* ── Get active bundle promos (public, for explorer/home) ── */
export const getActiveBundles = async (limit = 10) => {
  const bundles = await prisma.promotion.findMany({
    where: { promoType: PromotionType.BUNDLE, status: PromotionStatus.ACTIVE },
    include: {
      items: {
        include: {
          listing: {
            select: { id: true, title: true, imageUrl: true, priceUsdCents: true, mediaUrls: true, city: true, country: true },
          },
        },
      },
      ownerUser: {
        select: { id: true, profile: { select: { displayName: true, username: true, avatarUrl: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return bundles;
};

/* ── Update listing ── */
export const updateListing = async (userId: string, listingId: string, payload: UpdateListingInput) => {
  const existing = await prisma.listing.findFirst({
    where: { id: listingId, ownerUserId: userId },
  });
  if (!existing) throw new HttpError(404, "Article introuvable");
  if (existing.status === ListingStatus.DELETED) throw new HttpError(400, "Article supprimé, impossible de le modifier");

  const [imageUrl, mediaUrls] = await Promise.all([
    normalizeImageInput(payload.imageUrl, { folder: "listings" }),
    normalizeImageInputs(payload.mediaUrls, { folder: "listings" }),
  ]);

  // ── Résolution du countryCode si pays fourni ──
  const resolvedCountryCode = payload.countryCode?.toUpperCase()
    ?? resolveCountryCode(payload.country)
    ?? undefined;

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(payload.title !== undefined && { title: payload.title }),
      ...(payload.description !== undefined && { description: payload.description }),
      ...(payload.category !== undefined && { category: payload.category }),
      ...(payload.city !== undefined && { city: payload.city }),
      ...(payload.country !== undefined && { country: payload.country }),
      ...(resolvedCountryCode !== undefined && { countryCode: resolvedCountryCode as any }),
      ...(payload.region !== undefined && { region: payload.region }),
      ...(payload.district !== undefined && { district: payload.district }),
      ...(payload.formattedAddress !== undefined && { formattedAddress: payload.formattedAddress }),
      ...(payload.latitude !== undefined && { latitude: payload.latitude }),
      ...(payload.longitude !== undefined && { longitude: payload.longitude }),
      ...(payload.placeId !== undefined && { placeId: payload.placeId }),
      ...(payload.locationVisibility !== undefined && { locationVisibility: payload.locationVisibility as any }),
      ...(payload.serviceRadiusKm !== undefined && { serviceRadiusKm: payload.serviceRadiusKm }),
      ...(payload.imageUrl !== undefined && { imageUrl }),
      ...(payload.mediaUrls !== undefined && { mediaUrls }),
      ...(payload.priceUsdCents !== undefined && { priceUsdCents: payload.priceUsdCents }),
      ...(payload.stockQuantity !== undefined && { stockQuantity: payload.stockQuantity }),
      ...(payload.serviceDurationMin !== undefined && { serviceDurationMin: payload.serviceDurationMin }),
      ...(payload.serviceLocation !== undefined && { serviceLocation: payload.serviceLocation }),
      ...(payload.isNegotiable !== undefined && { isNegotiable: payload.isNegotiable }),
      ...(payload.variants !== undefined && { variants: existing.type === "PRODUIT" ? (payload.variants as any) : null }),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: "LISTING_UPDATE",
      entityType: "LISTING",
      entityId: listingId,
    },
  });

  return updated;
};

/* ── Change status (activate / deactivate / archive / soft-delete) ── */
export const changeListingStatus = async (
  userId: string,
  listingId: string,
  newStatus: ListingStatus
) => {
  const existing = await prisma.listing.findFirst({
    where: { id: listingId, ownerUserId: userId },
  });
  if (!existing) throw new HttpError(404, "Article introuvable");

  const isPublished = newStatus === ListingStatus.ACTIVE;

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: newStatus, isPublished },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: `LISTING_STATUS_${newStatus}`,
      entityType: "LISTING",
      entityId: listingId,
    },
  });

  return updated;
};

/* ── Update stock ── */
export const updateStock = async (
  userId: string,
  listingId: string,
  stockQuantity: number | null
) => {
  const existing = await prisma.listing.findFirst({
    where: { id: listingId, ownerUserId: userId },
  });
  if (!existing) throw new HttpError(404, "Article introuvable");

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { stockQuantity },
  });

  return updated;
};

/* ── Stats summary for owner dashboard ── */
export const myListingsStats = async (userId: string) => {
  const [active, inactive, archived, deleted] = await Promise.all([
    prisma.listing.count({ where: { ownerUserId: userId, status: ListingStatus.ACTIVE } }),
    prisma.listing.count({ where: { ownerUserId: userId, status: ListingStatus.INACTIVE } }),
    prisma.listing.count({ where: { ownerUserId: userId, status: ListingStatus.ARCHIVED } }),
    prisma.listing.count({ where: { ownerUserId: userId, status: ListingStatus.DELETED } }),
  ]);
  return { active, inactive, archived, deleted, total: active + inactive + archived + deleted };
};

export const searchListings = async (input: SearchListingsInput) => {
  const byCoordinates = typeof input.latitude === "number" && typeof input.longitude === "number";
  const radiusKm = input.radiusKm ?? DEFAULT_RADIUS_KM;
  const discoveryMode = input.discoveryMode ?? "local_first";

  // ── Résolution du code pays ──
  const resolvedCode = input.countryCode?.toUpperCase()
    ?? resolveCountryCode(input.country)
    ?? undefined;

  // ── Country-aware filtering (utilise Listing.countryCode si disponible) ──
  const countryTerms = resolveCountryTerms(input.country);
  const andClauses: Record<string, unknown>[] = [];

  if (resolvedCode && discoveryMode !== "all") {
    // Filtre direct sur Listing.countryCode (index performant)
    andClauses.push({ countryCode: resolvedCode });
  } else if (countryTerms.length > 0) {
    // Fallback legacy : filtre via profile.country (texte)
    andClauses.push({
      OR: countryTerms.map((term) => ({
        ownerUser: {
          profile: {
            is: {
              country: { contains: term, mode: "insensitive" as const },
            },
          },
        },
      })),
    });
  }

  // Essai 1: avec filtre ville
  let rows = await prisma.listing.findMany({
    where: {
      isPublished: true,
      type: input.type,
      ...(input.city ? { city: { contains: input.city, mode: "insensitive" as const } } : {}),
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
      OR: input.q
        ? [
            { title: { contains: input.q, mode: "insensitive" } },
            { category: { contains: input.q, mode: "insensitive" } },
            { city: { contains: input.q, mode: "insensitive" } }
          ]
        : undefined
    },
    include: listingSearchInclude,
    take: Math.max(1, Math.min(input.limit, 100)),
    orderBy: { createdAt: "desc" }
  });

  // Fallback: sans filtre ville si aucun résultat
  if (rows.length === 0 && input.city) {
    rows = await prisma.listing.findMany({
      where: {
        isPublished: true,
        type: input.type,
        ...(andClauses.length > 0 ? { AND: andClauses } : {}),
        OR: input.q
          ? [
              { title: { contains: input.q, mode: "insensitive" } },
              { category: { contains: input.q, mode: "insensitive" } },
              { city: { contains: input.q, mode: "insensitive" } }
            ]
          : undefined
      },
      include: listingSearchInclude,
      take: Math.max(1, Math.min(input.limit, 100)),
      orderBy: { createdAt: "desc" }
    });
  }

  const enriched = rows
    .map((row) => {
      const distanceKm = byCoordinates
        ? getDistanceKm(
            { lat: input.latitude!, lng: input.longitude! },
            { lat: row.latitude, lng: row.longitude }
          )
        : null;

      return {
        id: row.id,
        type: row.type,
        title: row.title,
        description: row.description,
        category: row.category,
        city: row.city,
        latitude: row.latitude,
        longitude: row.longitude,
        imageUrl: row.imageUrl,
        priceUsdCents: row.priceUsdCents,
        isNegotiable: row.isNegotiable,
        isBoosted: isBoostVisibleToViewer(row as any, input.city, input.country),
        promoActive: row.promoActive,
        promoPriceUsdCents: row.promoPriceUsdCents,
        promoExpiresAt: row.promoExpiresAt,
        createdAt: row.createdAt,
        distanceKm,
        owner: {
          userId: row.ownerUserId,
          displayName: row.ownerUser.profile?.displayName ?? "Utilisateur Kin-Sell",
          username: row.ownerUser.profile?.username ?? null,
          avatarUrl: row.ownerUser.profile?.avatarUrl ?? null,
          businessPublicName: row.business?.publicName ?? null
        }
      };
    })
    .filter((row) => (byCoordinates ? row.distanceKm !== null && row.distanceKm <= radiusKm : true));

  if (byCoordinates) {
    enriched.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }

  // ── Fallback local → régional → global (si local_first et peu de résultats) ──
  const MIN_RESULTS_THRESHOLD = 3;
  let fallbackLevel: "local" | "regional" | "global" = "local";

  if (discoveryMode === "local_first" && resolvedCode && enriched.length < MIN_RESULTS_THRESHOLD) {
    // Pas assez de résultats locaux — essayer la région
    const regionCodes = getSameRegionCountries(resolvedCode as any);
    if (regionCodes.length > 1) {
      const regionalRows = await prisma.listing.findMany({
        where: {
          isPublished: true,
          type: input.type,
          countryCode: { in: regionCodes, not: resolvedCode as any },
          ...(input.city ? { city: { contains: input.city, mode: "insensitive" as const } } : {}),
          OR: input.q
            ? [
                { title: { contains: input.q, mode: "insensitive" } },
                { category: { contains: input.q, mode: "insensitive" } },
              ]
            : undefined,
          scope: { in: ["REGIONAL", "INTERNATIONAL"] },
        },
        include: listingSearchInclude,
        take: Math.max(1, Math.min(input.limit - enriched.length, 50)),
        orderBy: { createdAt: "desc" },
      });

      for (const row of regionalRows) {
        enriched.push({
          id: row.id, type: row.type, title: row.title, description: row.description,
          category: row.category, city: row.city, latitude: row.latitude, longitude: row.longitude,
          imageUrl: row.imageUrl, priceUsdCents: row.priceUsdCents, isNegotiable: row.isNegotiable,
          isBoosted: isBoostVisibleToViewer(row as any, input.city, input.country),
          promoActive: row.promoActive,
          promoPriceUsdCents: row.promoPriceUsdCents,
          promoExpiresAt: row.promoExpiresAt,
          createdAt: row.createdAt, distanceKm: null,
          owner: {
            userId: row.ownerUserId,
            displayName: row.ownerUser.profile?.displayName ?? "Utilisateur Kin-Sell",
            username: row.ownerUser.profile?.username ?? null,
            avatarUrl: row.ownerUser.profile?.avatarUrl ?? null,
            businessPublicName: row.business?.publicName ?? null,
          },
        });
      }
      if (regionalRows.length > 0) fallbackLevel = "regional";
    }

    // Toujours pas assez — ouvrir au global (INTERNATIONAL scope uniquement)
    if (enriched.length < MIN_RESULTS_THRESHOLD) {
      const globalRows = await prisma.listing.findMany({
        where: {
          isPublished: true,
          type: input.type,
          scope: "INTERNATIONAL",
          ...(resolvedCode ? { countryCode: { not: resolvedCode as any } } : {}),
          OR: input.q
            ? [
                { title: { contains: input.q, mode: "insensitive" } },
                { category: { contains: input.q, mode: "insensitive" } },
              ]
            : undefined,
        },
        include: listingSearchInclude,
        take: Math.max(1, Math.min(input.limit - enriched.length, 30)),
        orderBy: { createdAt: "desc" },
      });

      for (const row of globalRows) {
        enriched.push({
          id: row.id, type: row.type, title: row.title, description: row.description,
          category: row.category, city: row.city, latitude: row.latitude, longitude: row.longitude,
          imageUrl: row.imageUrl, priceUsdCents: row.priceUsdCents, isNegotiable: row.isNegotiable,
          isBoosted: isBoostVisibleToViewer(row as any, input.city, input.country),
          promoActive: row.promoActive,
          promoPriceUsdCents: row.promoPriceUsdCents,
          promoExpiresAt: row.promoExpiresAt,
          createdAt: row.createdAt, distanceKm: null,
          owner: {
            userId: row.ownerUserId,
            displayName: row.ownerUser.profile?.displayName ?? "Utilisateur Kin-Sell",
            username: row.ownerUser.profile?.username ?? null,
            avatarUrl: row.ownerUser.profile?.avatarUrl ?? null,
            businessPublicName: row.business?.publicName ?? null,
          },
        });
      }
      if (globalRows.length > 0) fallbackLevel = "global";
    }
  }

  // Ranking unifié : score = relevance*0.4 + boost*0.3 + freshness*0.15 + quality*0.1 + geoMatch*0.05
  // + cap densité 25% + fairness (pas 2 vendeurs consécutifs)
  const campaignMap = await hydrateBoostCampaigns(
    enriched.filter((e) => e.isBoosted).map((e) => ({ id: e.id, isBoosted: true })),
    "LISTING",
  );
  const rankable = enriched.map((e) => {
    const camp = campaignMap.get(e.id);
    return {
      ...e,
      sellerId: e.owner.userId,
      boostScope: camp?.scope ?? null,
      boostTargetCountries: camp?.targetCountries ?? [],
      boostBudgetSpent: camp?.budgetSpentUsdCents ?? 0,
      boostBudgetTotal: camp?.budgetUsdCents ?? 0,
      itemCity: e.city,
      itemCountry: null,
    };
  });
  const ranked = applyBoostRanking(rankable as any, {
    viewerCity: input.city,
    viewerCountry: input.country,
  });
  const finalResults = ranked.map((r: any) => {
    const { sellerId, boostScope, boostTargetCountries, boostBudgetSpent, boostBudgetTotal, itemCity, itemCountry, ...rest } = r;
    return rest;
  });

  return {
    location: byCoordinates
      ? {
          latitude: input.latitude,
          longitude: input.longitude,
          radiusKm
        }
      : null,
    fallbackLevel,
    total: enriched.length,
    results: finalResults
  };
};

/* ── Public detail of a single listing (no auth, page produit) ── */
export const getPublicListingDetail = async (listingId: string) => {
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, isPublished: true, status: ListingStatus.ACTIVE },
    include: {
      ownerUser: { include: { profile: true } },
      business: true,
    },
  });
  if (!listing) throw new HttpError(404, "Article introuvable");

  // Similar listings (same category, exclude current) — up to 8
  const similar = await prisma.listing.findMany({
    where: {
      isPublished: true,
      status: ListingStatus.ACTIVE,
      category: listing.category,
      id: { not: listing.id },
    },
    include: { ownerUser: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const mapSimple = (row: typeof listing) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    category: row.category,
    city: row.city,
    country: row.country,
    imageUrl: row.imageUrl,
    mediaUrls: (row as any).mediaUrls ?? [],
    priceUsdCents: row.priceUsdCents,
    isNegotiable: row.isNegotiable,
    promoActive: row.promoActive,
    promoPriceUsdCents: row.promoPriceUsdCents,
    promoExpiresAt: row.promoExpiresAt,
    stockQuantity: row.stockQuantity,
    serviceDurationMin: row.serviceDurationMin,
    serviceLocation: row.serviceLocation,
    viewCount: row.viewCount,
    variants: (row as any).variants ?? null,
    createdAt: row.createdAt,
    owner: {
      userId: row.ownerUserId,
      displayName: row.ownerUser.profile?.displayName ?? "Utilisateur Kin-Sell",
      username: row.ownerUser.profile?.username ?? null,
      avatarUrl: row.ownerUser.profile?.avatarUrl ?? null,
      city: row.ownerUser.profile?.city ?? null,
      country: row.ownerUser.profile?.country ?? null,
    },
    business: row.business ? {
      id: row.business.id,
      slug: (row.business as any).slug ?? null,
      publicName: (row.business as any).publicName ?? null,
    } : null,
  });

  return {
    listing: mapSimple(listing),
    similar: similar.map((r) => mapSimple(r as typeof listing)),
  };
};

/* ── Latest published listings (public, no auth) ── */
export const latestListings = async (input: { type?: ListingType; city?: string; country?: string; countryCode?: string; limit: number }) => {
  const resolvedCode = input.countryCode?.toUpperCase() ?? resolveCountryCode(input.country) ?? undefined;
  const countryTerms = resolveCountryTerms(input.country);
  const andClauses: Record<string, unknown>[] = [];

  if (resolvedCode) {
    andClauses.push({ countryCode: resolvedCode });
  } else if (countryTerms.length > 0) {
    andClauses.push({
      OR: countryTerms.map((term) => ({
        ownerUser: {
          profile: {
            is: {
              country: { contains: term, mode: "insensitive" as const },
            },
          },
        },
      })),
    });
  }

  let rows = await prisma.listing.findMany({
    where: {
      isPublished: true,
      status: ListingStatus.ACTIVE,
      type: input.type,
      ...(input.city ? { city: { contains: input.city, mode: "insensitive" as const } } : {}),
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
    },
    include: {
      ownerUser: { include: { profile: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(input.limit, 50)),
  });

  // Fallback: sans filtre ville si aucun résultat
  if (rows.length === 0 && input.city) {
    rows = await prisma.listing.findMany({
      where: {
        isPublished: true,
        status: ListingStatus.ACTIVE,
        type: input.type,
        ...(andClauses.length > 0 ? { AND: andClauses } : {}),
      },
      include: {
        ownerUser: { include: { profile: true } },
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(input.limit, 50)),
    });
  }

  // Note: le filtre pays (andClauses) est toujours conservé

  const mapped = rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    category: row.category,
    city: row.city,
    imageUrl: row.imageUrl,
    priceUsdCents: row.priceUsdCents,
    isNegotiable: row.isNegotiable,
    isBoosted: isBoostVisibleToViewer(row as any, input.city, input.country),
    promoActive: row.promoActive,
    promoPriceUsdCents: row.promoPriceUsdCents,
    promoExpiresAt: row.promoExpiresAt,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.createdAt,
    owner: {
      userId: row.ownerUserId,
      displayName: row.ownerUser.profile?.displayName ?? "Utilisateur Kin-Sell",
      username: row.ownerUser.profile?.username ?? null,
      avatarUrl: row.ownerUser.profile?.avatarUrl ?? null,
    },
  }));

  // Boosted en tête
  mapped.sort((a, b) => (a.isBoosted === b.isBoosted ? 0 : a.isBoosted ? -1 : 1));
  return mapped;
};
