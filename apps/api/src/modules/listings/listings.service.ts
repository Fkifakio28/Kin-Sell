import { ListingStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { Role } from "../../types/roles.js";
import { normalizeImageInput, normalizeImageInputs } from "../../shared/utils/media-storage.js";
import { resolveCountryCode, resolveCountryTerms, getSameRegionCountries } from "../../shared/geo/country-aliases.js";

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

  const rows = await prisma.listing.findMany({
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
    results: enriched
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

  const rows = await prisma.listing.findMany({
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

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    category: row.category,
    city: row.city,
    imageUrl: row.imageUrl,
    priceUsdCents: row.priceUsdCents,
    isNegotiable: row.isNegotiable,
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
};
