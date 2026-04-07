import { prisma } from "../../shared/db/prisma.js";
import { resolveCountryTerms } from "../../shared/geo/country-aliases.js";
import { getDefaultCity } from "../../config/platform.js";

export const getExplorerStats = async () => {
  const [distinctCategories, publicProfiles, onlineShops] = await Promise.all([
    prisma.listing.findMany({
      where: { isPublished: true },
      select: { category: true },
      distinct: ["category"]
    }),
    prisma.userProfile.count(),
    prisma.businessShop.count({ where: { active: true } })
  ]);

  return {
    categories: distinctCategories.length,
    publicProfiles,
    onlineShops
  };
};

export const getExplorerAds = async (_city?: string, _country?: string) => {
  // Les campagnes publicitaires sont gérées via la base de données (modèle Advertisement).
  // Aucune donnée de test hardcodée — retourne vide tant qu'aucune campagne n'est active.
  return { campaigns: [] as Record<string, unknown>[] };
};

export const getFeaturedShops = async (limit = 4, city?: string, country?: string) => {
  const countryTerms = resolveCountryTerms(country);

  const baseWhere = { active: true };

  const countryWhere = countryTerms.length > 0
    ? {
        AND: [
          {
            business: {
              owner: {
                profile: {
                  is: {
                    OR: countryTerms.map((term) => ({
                      country: { contains: term, mode: "insensitive" as const },
                    })),
                  },
                },
              },
            },
          },
        ],
      }
    : {};

  const includeOpts = {
    business: {
      select: {
        id: true,
        publicName: true,
        slug: true,
        verificationStatus: true,
        _count: { select: { listings: { where: { isPublished: true, status: "ACTIVE" as const } } } },
      },
    },
  } as const;

  // Essai 1: avec filtre ville + pays
  let shops = await prisma.businessShop.findMany({
    where: { ...baseWhere, ...countryWhere, ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}) },
    take: limit,
    orderBy: { business: { listings: { _count: "desc" } } },
    include: includeOpts,
  });

  // Fallback: sans filtre ville, mais garde le pays
  if (shops.length === 0 && city) {
    shops = await prisma.businessShop.findMany({
      where: { ...baseWhere, ...countryWhere },
      take: limit,
      orderBy: { business: { listings: { _count: "desc" } } },
      include: includeOpts,
    });
  }

  return shops.map((shop) => ({
    id: shop.id,
    businessId: shop.business.id,
    name: shop.business.publicName,
    slug: shop.business.slug,
    badge: shop.business.verificationStatus === "VERIFIED" ? "Vérifié" : "Standard",
    city: shop.city ?? getDefaultCity(shop.countryCode),
    coverImage: shop.coverImage ?? null,
    logo: shop.logo ?? null,
    publicDescription: shop.publicDescription ?? null,
    active: shop.active,
  }));
};

export const getFeaturedProfiles = async (limit = 4, city?: string, country?: string) => {
  const countryTerms = resolveCountryTerms(country);

  const baseWhere = {
    username: { not: null },
    user: {
      accountStatus: "ACTIVE" as const,
      role: { notIn: ["ADMIN", "SUPER_ADMIN"] as Array<"ADMIN" | "SUPER_ADMIN"> },
    },
  };

  const countryWhere = countryTerms.length > 0
    ? {
        AND: [
          {
            OR: countryTerms.map((term) => ({
              country: { contains: term, mode: "insensitive" as const },
            })),
          },
        ],
      }
    : {};

  const selectFields = {
    id: true,
    userId: true,
    username: true,
    displayName: true,
    avatarUrl: true,
    city: true,
    country: true,
    countryCode: true,
    verificationStatus: true,
  } as const;

  // Essai 1: avec filtre ville + pays
  let profiles = await prisma.userProfile.findMany({
    where: { ...baseWhere, ...countryWhere, ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}) },
    take: limit,
    orderBy: { user: { listings: { _count: "desc" } } },
    select: selectFields,
  });

  // Fallback: sans filtre ville, mais garde le pays
  if (profiles.length === 0 && city) {
    profiles = await prisma.userProfile.findMany({
      where: { ...baseWhere, ...countryWhere },
      take: limit,
      orderBy: { user: { listings: { _count: "desc" } } },
      select: selectFields,
    });
  }

  return profiles.map((profile) => ({
    id: profile.id,
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    city: profile.city ?? getDefaultCity(profile.countryCode),
    badge: profile.verificationStatus === "VERIFIED" ? "Vérifié" : "Membre",
  }));
};
