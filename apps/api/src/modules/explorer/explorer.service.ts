import { prisma } from "../../shared/db/prisma.js";

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
    city: shop.city ?? "Kinshasa",
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
      verificationStatus: true,
    },
  });

  return profiles.map((profile) => ({
    id: profile.id,
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    city: profile.city ?? "Kinshasa",
    badge: profile.verificationStatus === "VERIFIED" ? "Vérifié" : "Membre",
  }));
};
