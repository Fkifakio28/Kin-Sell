import { Role } from "../../types/roles.js";
import { prisma } from "../../shared/db/prisma.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { normalizeImageInput, normalizeImageInputs } from "../../shared/utils/media-storage.js";
import { sendPushToUser } from "../notifications/push.service.js";

type CreateBusinessInput = {
  legalName: string;
  publicName: string;
  description?: string;
  city?: string;
};

type UpdateBusinessInput = {
  legalName?: string;
  publicName?: string;
  description?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  district?: string;
  postalCode?: string;
  address?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  locationVisibility?: string;
  serviceRadiusKm?: number | null;
  deliveryZones?: string[];
  coverImage?: string;
  logo?: string;
  publicDescription?: string;
  active?: boolean;
  highlights?: { id: string; icon: string; name: string; description: string }[];
  shopPhotos?: string[];
  contactPhone?: string | null;
  contactEmail?: string | null;
};

const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
};

const ensureUniqueSlug = async (baseSlug: string, ignoreBusinessId?: string): Promise<string> => {
  let candidate = baseSlug || "business";
  let index = 1;

  while (true) {
    const exists = await prisma.businessAccount.findUnique({ where: { slug: candidate } });
    if (!exists || exists.id === ignoreBusinessId) {
      return candidate;
    }
    index += 1;
    candidate = `${baseSlug}-${index}`;
  }
};

export const createBusinessAccount = async (ownerUserId: string, payload: CreateBusinessInput) => {
  const owner = await prisma.user.findUnique({ where: { id: ownerUserId } });
  if (!owner) {
    throw new HttpError(404, "Utilisateur introuvable");
  }

  if (owner.role === Role.ADMIN || owner.role === Role.SUPER_ADMIN) {
    throw new HttpError(403, "Ce role ne peut pas creer de boutique");
  }

  const existing = await prisma.businessAccount.findFirst({ where: { ownerUserId } });
  if (existing) {
    throw new HttpError(409, "Un compte entreprise existe deja pour cet utilisateur");
  }

  const slug = await ensureUniqueSlug(slugify(payload.publicName));

  const business = await prisma.$transaction(async (tx) => {
    const created = await tx.businessAccount.create({
      data: {
        ownerUserId,
        legalName: payload.legalName,
        publicName: payload.publicName,
        description: payload.description,
        slug,
        shop: {
          create: {
            city: payload.city,
            publicDescription: payload.description
          }
        }
      },
      include: { shop: true }
    });

    if (owner.role !== Role.BUSINESS) {
      await tx.user.update({
        where: { id: ownerUserId },
        data: { role: Role.BUSINESS }
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: ownerUserId,
        action: "BUSINESS_CREATE",
        entityType: "BUSINESS_ACCOUNT",
        entityId: created.id,
        metadata: { slug: created.slug }
      }
    });

    return created;
  });

  return business;
};

export const getMyBusinessAccount = async (ownerUserId: string) => {
  const business = await prisma.businessAccount.findFirst({
    where: { ownerUserId },
    include: { shop: true }
  });

  if (!business) {
    throw new HttpError(404, "Compte entreprise introuvable");
  }

  return business;
};

export const updateMyBusinessAccount = async (ownerUserId: string, payload: UpdateBusinessInput) => {
  const current = await prisma.businessAccount.findFirst({ where: { ownerUserId } });
  if (!current) {
    throw new HttpError(404, "Compte entreprise introuvable");
  }

  const [coverImage, logo, shopPhotos] = await Promise.all([
    normalizeImageInput(payload.coverImage, { folder: "business" }),
    normalizeImageInput(payload.logo, { folder: "business" }),
    normalizeImageInputs(payload.shopPhotos, { folder: "business" }),
  ]);

  const nextSlug = payload.publicName
    ? await ensureUniqueSlug(slugify(payload.publicName), current.id)
    : current.slug;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.businessAccount.update({
      where: { id: current.id },
      data: {
        legalName: payload.legalName,
        publicName: payload.publicName,
        description: payload.description,
        slug: nextSlug
      },
    });

    await tx.businessShop.update({
      where: { businessId: current.id },
      data: {
        city: payload.city,
        country: payload.country,
        countryCode: payload.countryCode as any,
        region: payload.region,
        district: payload.district,
        postalCode: payload.postalCode,
        address: payload.address,
        formattedAddress: payload.formattedAddress,
        latitude: payload.latitude,
        longitude: payload.longitude,
        placeId: payload.placeId,
        locationVisibility: payload.locationVisibility as any,
        serviceRadiusKm: payload.serviceRadiusKm,
        deliveryZones: payload.deliveryZones,
        coverImage,
        logo,
        publicDescription: payload.publicDescription,
        active: payload.active,
        highlights: payload.highlights !== undefined ? payload.highlights : undefined,
        shopPhotos: shopPhotos !== undefined ? shopPhotos : undefined,
        contactPhone: payload.contactPhone !== undefined ? payload.contactPhone : undefined,
        contactEmail: payload.contactEmail !== undefined ? payload.contactEmail : undefined,
      }
    });

    await tx.auditLog.create({
      data: {
        actorUserId: ownerUserId,
        action: "BUSINESS_UPDATE",
        entityType: "BUSINESS_ACCOUNT",
        entityId: current.id
      }
    });
  });

  // Re-fetch to return fresh data (including updated shop fields)
  const fresh = await prisma.businessAccount.findFirst({
    where: { ownerUserId },
    include: { shop: true },
  });

  return fresh!;
};

export const getPublicBusinessPage = async (slug: string, limit = 20, offset = 0) => {
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const safeOffset = Math.max(0, offset);

  const business = await prisma.businessAccount.findUnique({
    where: { slug },
    include: {
      shop: true,
      listings: {
        where: { isPublished: true, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: safeLimit,
        skip: safeOffset,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          category: true,
          city: true,
          priceUsdCents: true,
          imageUrl: true,
          mediaUrls: true,
          createdAt: true,
          promoActive: true,
          promoPriceUsdCents: true,
          promoExpiresAt: true,
        },
      },
      _count: {
        select: { sellerOrders: true, listings: { where: { isPublished: true, status: "ACTIVE" } } },
      },
    },
  });

  if (!business) {
    throw new HttpError(404, "Boutique introuvable");
  }

  return business;
};

/* ── Follow / Unfollow ────────────────────────────────────── */

export const followBusiness = async (userId: string, businessId: string) => {
  const business = await prisma.businessAccount.findUnique({ where: { id: businessId } });
  if (!business) throw new HttpError(404, "Boutique introuvable");

  await prisma.businessFollow.upsert({
    where: { userId_businessId: { userId, businessId } },
    create: { userId, businessId },
    update: {},
  });

  const count = await prisma.businessFollow.count({ where: { businessId } });

  // Notifier le propriétaire de la boutique
  if (business.ownerUserId && business.ownerUserId !== userId) {
    const follower = await prisma.userProfile.findUnique({ where: { userId }, select: { displayName: true } });
    const name = follower?.displayName ?? "Quelqu'un";
    sendPushToUser(business.ownerUserId, {
      title: "Kin-Sell • Nouveau follower 👤",
      body: `${name} suit maintenant votre boutique`,
      tag: `follow-${businessId}`,
      data: { type: "sokin", businessId, url: "/account?tab=business" },
    }).catch(() => {});
  }

  return { following: true, followersCount: count };
};

export const unfollowBusiness = async (userId: string, businessId: string) => {
  await prisma.businessFollow.deleteMany({ where: { userId, businessId } });
  const count = await prisma.businessFollow.count({ where: { businessId } });
  return { following: false, followersCount: count };
};

export const isFollowing = async (userId: string, businessId: string) => {
  const row = await prisma.businessFollow.findUnique({
    where: { userId_businessId: { userId, businessId } },
  });
  return { following: Boolean(row) };
};

export const getFollowersCount = async (businessId: string) => {
  const count = await prisma.businessFollow.count({ where: { businessId } });
  return { followersCount: count };
};
