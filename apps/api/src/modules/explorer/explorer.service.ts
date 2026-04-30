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

  // Round counts to prevent exact enumeration
  const roundCount = (n: number) => {
    if (n <= 10) return n;
    if (n <= 100) return Math.floor(n / 5) * 5;
    return Math.floor(n / 10) * 10;
  };

  return {
    categories: distinctCategories.length,
    publicProfiles: roundCount(publicProfiles),
    onlineShops: roundCount(onlineShops)
  };
};

export const getExplorerAds = async (_city?: string, _country?: string) => {
  // Les campagnes publicitaires sont gérées via la base de données (modèle Advertisement).
  // Aucune donnée de test hardcodée — retourne vide tant qu'aucune campagne n'est active.
  return { campaigns: [] as Record<string, unknown>[] };
};

export const getFeaturedShops = async (limit = 4, city?: string, country?: string, popularOnly = false) => {
  const isGlobal = country?.toUpperCase() === "GLOBAL";
  const countryTerms = isGlobal ? [] : resolveCountryTerms(country);
  const cityFilter = isGlobal ? undefined : city;

  // Règle Kin-Sell : une boutique n'apparaît comme "vendeuse" qu'à partir d'au moins 1 annonce publiée active.
  // Et n'est "populaire" qu'à partir d'au moins 1 vente non annulée.
  const sellerWhere = {
    business: {
      listings: {
        some: { isPublished: true, status: "ACTIVE" as const },
      },
      ...(popularOnly
        ? { sellerOrders: { some: { status: { not: "CANCELED" as const } } } }
        : {}),
    },
  };

  const baseWhere = { active: true, ...sellerWhere };

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
        _count: {
          select: {
            listings: { where: { isPublished: true, status: "ACTIVE" as const } },
            sellerOrders: { where: { status: { not: "CANCELED" as const } } },
          },
        },
      },
    },
  } as const;

  const orderBy = popularOnly
    ? { business: { sellerOrders: { _count: "desc" as const } } }
    : { business: { listings: { _count: "desc" as const } } };

  // Essai 1: avec filtre ville + pays
  let shops = await prisma.businessShop.findMany({
    where: { ...baseWhere, ...countryWhere, ...(cityFilter ? { city: { contains: cityFilter, mode: "insensitive" as const } } : {}) },
    take: limit,
    orderBy,
    include: includeOpts,
  });

  // Fallback: sans filtre ville, mais garde le pays
  if (shops.length === 0 && cityFilter) {
    shops = await prisma.businessShop.findMany({
      where: { ...baseWhere, ...countryWhere },
      take: limit,
      orderBy,
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

export const getFeaturedProfiles = async (limit = 4, city?: string, country?: string, popularOnly = false) => {
  const isGlobal = country?.toUpperCase() === "GLOBAL";
  const countryTerms = isGlobal ? [] : resolveCountryTerms(country);
  const cityFilter = isGlobal ? undefined : city;

  // Règle Kin-Sell : un utilisateur n'est considéré "vendeur" qu'à partir d'au moins 1 annonce publiée active.
  // Et n'est "vendeur populaire" qu'à partir d'au moins 1 vente non annulée.
  const baseWhere = {
    username: { not: null },
    user: {
      accountStatus: "ACTIVE" as const,
      role: { notIn: ["ADMIN", "SUPER_ADMIN"] as Array<"ADMIN" | "SUPER_ADMIN"> },
      listings: {
        some: { isPublished: true, status: "ACTIVE" as const },
      },
      ...(popularOnly
        ? { sellerOrders: { some: { status: { not: "CANCELED" as const } } } }
        : {}),
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

  const orderByProfiles = popularOnly
    ? { user: { sellerOrders: { _count: "desc" as const } } }
    : { user: { listings: { _count: "desc" as const } } };

  // Essai 1: avec filtre ville + pays
  let profiles = await prisma.userProfile.findMany({
    where: { ...baseWhere, ...countryWhere, ...(cityFilter ? { city: { contains: cityFilter, mode: "insensitive" as const } } : {}) },
    take: limit,
    orderBy: orderByProfiles,
    select: selectFields,
  });

  // Fallback: sans filtre ville, mais garde le pays
  if (profiles.length === 0 && cityFilter) {
    profiles = await prisma.userProfile.findMany({
      where: { ...baseWhere, ...countryWhere },
      take: limit,
      orderBy: orderByProfiles,
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
