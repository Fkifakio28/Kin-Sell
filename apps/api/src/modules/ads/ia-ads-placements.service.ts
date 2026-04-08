/**
 * IA ADS Placements — Registre intelligent de tous les emplacements publicitaires Kin-Sell
 *
 * L'IA ADS connaît chaque emplacement sur le site, sait quel type de contenu y placer
 * et distribue intelligemment les boosts, mises en avant et pubs Kin-Sell.
 *
 * Deux catégories :
 * - Espaces PUBLICS : pubs payées par les clients (boosts, highlights, bannières clients)
 * - Espaces PRIVÉS : pubs internes Kin-Sell (uniquement pour les utilisateurs connectés)
 */

import { prisma } from "../../shared/db/prisma.js";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AdPlacementType = "BANNER" | "CARD_BOOST" | "FEED_INTERLEAVE" | "SIDEBAR" | "POPUP";
export type AdScope = "PUBLIC" | "PRIVATE";

export interface AdPlacement {
  id: string;
  page: string;
  location: string;
  type: AdPlacementType;
  scope: AdScope;
  variant: string;
  description: string;
  avgImpressionsPerDay: number;
  supportedContent: ("LISTING_BOOST" | "SHOP_HIGHLIGHT" | "PROFILE_HIGHLIGHT" | "CLIENT_AD" | "KINSELL_PROMO")[];
}

/**
 * Registre statique de tous les emplacements publicitaires sur Kin-Sell.
 * L'IA ADS utilise ce registre pour distribuer le contenu.
 */
export const AD_PLACEMENTS: AdPlacement[] = [
  // ── Espaces PUBLICS (visibles par tous) ──────────────────
  {
    id: "home-banner",
    page: "home",
    location: "Section principale après le hero",
    type: "BANNER",
    scope: "PUBLIC",
    variant: "horizontal",
    description: "Bannière horizontale sur la page d'accueil, visible par tous les visiteurs",
    avgImpressionsPerDay: 800,
    supportedContent: ["CLIENT_AD", "LISTING_BOOST", "SHOP_HIGHLIGHT", "KINSELL_PROMO"],
  },
  {
    id: "home-mobile-banner",
    page: "home-mobile",
    location: "Bannière slim mobile page d'accueil",
    type: "BANNER",
    scope: "PUBLIC",
    variant: "slim",
    description: "Bannière compacte sur la version mobile de la page d'accueil",
    avgImpressionsPerDay: 600,
    supportedContent: ["CLIENT_AD", "LISTING_BOOST", "KINSELL_PROMO"],
  },
  {
    id: "explorer-banner",
    page: "explorer",
    location: "Section articles — Explorer mobile",
    type: "BANNER",
    scope: "PUBLIC",
    variant: "slim",
    description: "Bannière slim insérée dans l'Explorer mobile entre catégories et articles",
    avgImpressionsPerDay: 650,
    supportedContent: ["CLIENT_AD", "LISTING_BOOST", "SHOP_HIGHLIGHT", "KINSELL_PROMO"],
  },
  {
    id: "explorer-desktop-banner",
    page: "explorer",
    location: "Section articles — Explorer desktop",
    type: "BANNER",
    scope: "PUBLIC",
    variant: "horizontal",
    description: "Bannière horizontale sur l'Explorer desktop, entre catégories et la grille articles",
    avgImpressionsPerDay: 650,
    supportedContent: ["CLIENT_AD", "LISTING_BOOST", "SHOP_HIGHLIGHT", "PROFILE_HIGHLIGHT", "KINSELL_PROMO"],
  },
  {
    id: "explorer-card-boost",
    page: "explorer",
    location: "Grille d'articles — badge sponsorisé + tri prioritaire",
    type: "CARD_BOOST",
    scope: "PUBLIC",
    variant: "badge",
    description: "Articles boostés affichés en premier dans les résultats de recherche avec badge ⚡ Sponsorisé",
    avgImpressionsPerDay: 500,
    supportedContent: ["LISTING_BOOST"],
  },
  {
    id: "sokin-banner",
    page: "sokin",
    location: "Fil So-Kin — bannière horizontale",
    type: "BANNER",
    scope: "PUBLIC",
    variant: "horizontal",
    description: "Bannière publiée dans le fil d'actualité So-Kin",
    avgImpressionsPerDay: 1200,
    supportedContent: ["CLIENT_AD", "LISTING_BOOST", "SHOP_HIGHLIGHT", "PROFILE_HIGHLIGHT", "KINSELL_PROMO"],
  },
  {
    id: "sokin-feed-interleave",
    page: "sokin",
    location: "Fil So-Kin — toutes les 4 publications",
    type: "FEED_INTERLEAVE",
    scope: "PUBLIC",
    variant: "card",
    description: "Pub carte interposée tous les 4 posts dans le fil So-Kin (cadence adaptative)",
    avgImpressionsPerDay: 900,
    supportedContent: ["CLIENT_AD", "LISTING_BOOST", "SHOP_HIGHLIGHT", "KINSELL_PROMO"],
  },

  // ── Espaces PRIVÉS (utilisateurs connectés uniquement) ───
  {
    id: "user-dashboard-banner",
    page: "account",
    location: "Tableau de bord utilisateur",
    type: "BANNER",
    scope: "PRIVATE",
    variant: "horizontal",
    description: "Bannière dans l'espace privé utilisateur — pubs Kin-Sell uniquement",
    avgImpressionsPerDay: 200,
    supportedContent: ["KINSELL_PROMO"],
  },
  {
    id: "admin-dashboard-banner",
    page: "admin",
    location: "Tableau de bord admin",
    type: "BANNER",
    scope: "PRIVATE",
    variant: "horizontal",
    description: "Bannière dans l'espace admin — pubs Kin-Sell uniquement",
    avgImpressionsPerDay: 50,
    supportedContent: ["KINSELL_PROMO"],
  },
];

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────

/** Tous les emplacements connus */
export function getAllPlacements(): AdPlacement[] {
  return AD_PLACEMENTS;
}

/** Emplacements par scope (PUBLIC = pubs clients, PRIVATE = pubs Kin-Sell) */
export function getPlacementsByScope(scope: AdScope): AdPlacement[] {
  return AD_PLACEMENTS.filter((p) => p.scope === scope);
}

/** Emplacements qui supportent un type de contenu donné */
export function getPlacementsForContent(
  contentType: AdPlacement["supportedContent"][number],
): AdPlacement[] {
  return AD_PLACEMENTS.filter((p) => p.supportedContent.includes(contentType));
}

/** Résumé pour le dashboard admin IA ADS */
export async function getIaAdsDashboard() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalAds,
    activeAds,
    pendingAds,
    totalBoosts,
    activeBoosts,
    impressions24h,
    clicks24h,
    impressions7d,
    clicks7d,
    topAds,
  ] = await Promise.all([
    prisma.advertisement.count(),
    prisma.advertisement.count({ where: { status: "ACTIVE" } }),
    prisma.advertisement.count({ where: { status: "PENDING" } }),
    prisma.listing.count({ where: { isBoosted: true } }),
    prisma.listing.count({
      where: {
        isBoosted: true,
        OR: [{ boostExpiresAt: null }, { boostExpiresAt: { gt: now } }],
      },
    }),
    prisma.advertisement.aggregate({
      _sum: { impressions: true },
      where: { updatedAt: { gte: last24h } },
    }),
    prisma.advertisement.aggregate({
      _sum: { clicks: true },
      where: { updatedAt: { gte: last24h } },
    }),
    prisma.advertisement.aggregate({
      _sum: { impressions: true },
      where: { updatedAt: { gte: last7d } },
    }),
    prisma.advertisement.aggregate({
      _sum: { clicks: true },
      where: { updatedAt: { gte: last7d } },
    }),
    prisma.advertisement.findMany({
      where: { status: "ACTIVE" },
      orderBy: { impressions: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        targetPages: true,
        impressions: true,
        clicks: true,
        status: true,
        startDate: true,
        endDate: true,
        type: true,
      },
    }),
  ]);

  return {
    placements: AD_PLACEMENTS,
    stats: {
      totalAds,
      activeAds,
      pendingAds,
      totalBoosts,
      activeBoosts,
      impressions: {
        last24h: impressions24h._sum.impressions ?? 0,
        last7d: impressions7d._sum.impressions ?? 0,
      },
      clicks: {
        last24h: clicks24h._sum.clicks ?? 0,
        last7d: clicks7d._sum.clicks ?? 0,
      },
      ctr24h:
        (impressions24h._sum.impressions ?? 0) > 0
          ? (((clicks24h._sum.clicks ?? 0) / (impressions24h._sum.impressions ?? 1)) * 100).toFixed(2)
          : "0.00",
      ctr7d:
        (impressions7d._sum.impressions ?? 0) > 0
          ? (((clicks7d._sum.clicks ?? 0) / (impressions7d._sum.impressions ?? 1)) * 100).toFixed(2)
          : "0.00",
    },
    topAds: topAds.map((ad) => ({
      ...ad,
      page: ad.targetPages?.[0] ?? 'N/A',
      ctr: ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : "0.00",
    })),
  };
}

/** Recommandation intelligente d'emplacement pour un boost/pub client */
export function recommendPlacements(
  contentType: AdPlacement["supportedContent"][number],
  budget: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM",
): AdPlacement[] {
  const eligible = getPlacementsForContent(contentType);

  // Tri par impressions estimées (du plus au moins visible)
  const sorted = [...eligible].sort((a, b) => b.avgImpressionsPerDay - a.avgImpressionsPerDay);

  // Selon le budget, on recommande plus ou moins d'emplacements
  const count = budget === "LOW" ? 1 : budget === "MEDIUM" ? 3 : sorted.length;
  return sorted.slice(0, count);
}
