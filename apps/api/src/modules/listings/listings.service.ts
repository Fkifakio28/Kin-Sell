import { ListingStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { Role } from "../../types/roles.js";
import { normalizeImageInput, normalizeImageInputs } from "../../shared/utils/media-storage.js";

export type ListingType = "PRODUIT" | "SERVICE";

export type CreateListingInput = {
  type: ListingType;
  title: string;
  description?: string;
  category: string;
  city: string;
  latitude: number;
  longitude: number;
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
  latitude?: number;
  longitude?: number;
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
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  limit: number;
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  CD: ["CD", "RDC", "RD Congo", "DRC", "Democratic Republic of the Congo"],
  GA: ["GA", "Gabon"],
  CG: ["CG", "Congo", "Congo-Brazzaville", "Republic of the Congo"],
  AO: ["AO", "Angola"],
  CI: ["CI", "Cote d'Ivoire", "Cote d Ivoire", "Ivory Coast"],
  GQ: ["GQ", "Guinee equatoriale", "Equatorial Guinea"],
  SN: ["SN", "Senegal"],
  MA: ["MA", "Maroc", "Morocco"],
};

function resolveCountryTerms(country?: string): string[] {
  if (!country) return [];
  const normalized = country.trim().toUpperCase();
  const aliases = COUNTRY_ALIASES[normalized] ?? [country.trim()];
  return aliases.filter((term) => term.trim().length > 0);
}

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

  const listing = await prisma.$transaction(async (tx) => {
    const created = await tx.listing.create({
      data: {
        type: payload.type,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        city: payload.city,
        latitude: payload.latitude,
        longitude: payload.longitude,
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

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(payload.title !== undefined && { title: payload.title }),
      ...(payload.description !== undefined && { description: payload.description }),
      ...(payload.category !== undefined && { category: payload.category }),
      ...(payload.city !== undefined && { city: payload.city }),
      ...(payload.latitude !== undefined && { latitude: payload.latitude }),
      ...(payload.longitude !== undefined && { longitude: payload.longitude }),
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
  const countryTerms = resolveCountryTerms(input.country);
  const andClauses: Record<string, unknown>[] = [];

  if (countryTerms.length > 0) {
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
      city: input.city,
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
      OR: input.q
        ? [
            { title: { contains: input.q, mode: "insensitive" } },
            { category: { contains: input.q, mode: "insensitive" } },
            { city: { contains: input.q, mode: "insensitive" } }
          ]
        : undefined
    },
    include: {
      ownerUser: {
        include: {
          profile: true
        }
      },
      business: true
    },
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

  return {
    location: byCoordinates
      ? {
          latitude: input.latitude,
          longitude: input.longitude,
          radiusKm
        }
      : null,
    total: enriched.length,
    results: enriched
  };
};

/* ── Latest published listings (public, no auth) ── */
export const latestListings = async (input: { type?: ListingType; city?: string; country?: string; limit: number }) => {
  const countryTerms = resolveCountryTerms(input.country);
  const andClauses: Record<string, unknown>[] = [];

  if (countryTerms.length > 0) {
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
      city: input.city,
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
