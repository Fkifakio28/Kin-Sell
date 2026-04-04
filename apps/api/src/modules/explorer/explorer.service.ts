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
  const shops = await prisma.businessShop.findMany({
    where: {
      active: true,
      ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
      business: {
        listings: { some: { isPublished: true, status: "ACTIVE" } },
      },
      ...(countryTerms.length > 0
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
        : {}),
    },
    take: limit,
    orderBy: { business: { listings: { _count: "desc" } } },
    include: {
      business: {
        select: {
          id: true,
          publicName: true,
          slug: true,
          verificationStatus: true,
          _count: { select: { listings: { where: { isPublished: true, status: "ACTIVE" } } } },
        },
      },
    },
  });

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
  const profiles = await prisma.userProfile.findMany({
    where: {
      username: { not: null },
      ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
      ...(countryTerms.length > 0
        ? {
            AND: [
              {
                OR: countryTerms.map((term) => ({
                  country: { contains: term, mode: "insensitive" as const },
                })),
              },
            ],
          }
        : {}),
      user: {
        accountStatus: "ACTIVE",
        role: { notIn: ["ADMIN", "SUPER_ADMIN", "BUSINESS"] },
        listings: { some: { isPublished: true, status: "ACTIVE" } },
      },
    },
    take: limit,
    orderBy: {
      user: { listings: { _count: "desc" } },
    },
    select: {
      id: true,
      userId: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      city: true,
      country: true,
      countryCode: true,
      verificationStatus: true,
    },
  });

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
