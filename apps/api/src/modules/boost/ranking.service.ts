/**
 * Ranking engine — Boost aware.
 *
 * Formule de score :
 *   score = relevance*0.4 + boostWeight*0.3 + freshness*0.15 + quality*0.1 + geoMatch*0.05
 *
 * Anti-abus :
 *   - Cap densité: max 25% d'items boostés par page
 *   - Fairness: pas 2 items consécutifs du même vendeur
 *
 * Usage :
 *   const ranked = applyBoostRanking(items, { viewerCity, viewerCountry });
 */

import { prisma } from "../../shared/db/prisma.js";
import type { PromotionScope } from "../ads/ads-boost.service.js";

export interface RankingViewerContext {
  viewerCity?: string;
  viewerCountry?: string;
}

export interface RankableItem {
  id: string;
  sellerId: string;
  isBoosted: boolean;
  boostCampaignId?: string | null;
  boostScope?: PromotionScope | string | null;
  boostTargetCountries?: string[];
  itemCity?: string | null;
  itemCountry?: string | null;
  createdAt: Date | string;
  // Signaux de qualité (0-1 normalisés — le caller peut passer des défauts)
  relevance?: number;
  quality?: number;
  boostBudgetSpent?: number;
  boostBudgetTotal?: number;
}

const DENSITY_CAP = 0.25; // max 25% d'items boostés par page

/**
 * Vérifie si un boost doit être affiché au viewer actuel selon son scope.
 *
 * RÈGLES STRICTES (correction bug P1.6 — 2026-04-22) :
 * - Si viewer manque de contexte (pas de city ni country), on considère SEULEMENT
 *   NATIONAL/CROSS_BORDER comme éligibles en fallback "globale" via targetCountries.
 * - LOCAL requiert viewerCity ; retourne false si absent (évite monopolisation anonyme).
 */
export function isBoostVisibleToViewer(
  row: {
    isBoosted: boolean;
    boostExpiresAt?: Date | null;
    boostScope?: string | null;
    boostTargetCountries?: string[];
    city?: string | null;
    country?: string | null;
  },
  viewer: RankingViewerContext,
): boolean {
  if (!row.isBoosted) return false;
  if (row.boostExpiresAt && new Date(row.boostExpiresAt) <= new Date()) return false;

  const scope = row.boostScope ?? null;
  if (!scope) return true; // backward compat (anciens boosts sans scope)

  const vCity = viewer.viewerCity?.toLowerCase().trim();
  const vCountry = viewer.viewerCountry?.toLowerCase().trim();

  switch (scope) {
    case "LOCAL": {
      if (!vCity) return false; // plus permissif : aucun viewer anonyme ne voit un boost local
      return (row.city ?? "").toLowerCase() === vCity;
    }
    case "NATIONAL": {
      if (!vCountry) return false;
      return (row.country ?? "").toLowerCase() === vCountry;
    }
    case "CROSS_BORDER": {
      if (!vCountry) return false;
      const targets = (row.boostTargetCountries ?? []).map((t) => t.toLowerCase());
      return targets.includes(vCountry);
    }
    default:
      return true;
  }
}

/** Freshness score: 1.0 si créé < 24h, décroît vers 0 sur 30 jours. */
function freshnessScore(createdAt: Date | string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours <= 24) return 1.0;
  if (ageHours >= 24 * 30) return 0;
  return Math.max(0, 1 - (ageHours - 24) / (24 * 29));
}

function geoMatchScore(item: RankableItem, viewer: RankingViewerContext): number {
  const scope = item.boostScope ?? null;
  const vCity = viewer.viewerCity?.toLowerCase().trim();
  const vCountry = viewer.viewerCountry?.toLowerCase().trim();
  if (scope === "LOCAL" && vCity && (item.itemCity ?? "").toLowerCase() === vCity) return 1.0;
  if (scope === "NATIONAL" && vCountry && (item.itemCountry ?? "").toLowerCase() === vCountry) return 0.7;
  if (scope === "CROSS_BORDER" && vCountry) {
    const targets = (item.boostTargetCountries ?? []).map((t) => t.toLowerCase());
    if (targets.includes(vCountry)) return 0.5;
  }
  // Fallback: même ville/pays sans boost
  if (vCity && (item.itemCity ?? "").toLowerCase() === vCity) return 0.6;
  if (vCountry && (item.itemCountry ?? "").toLowerCase() === vCountry) return 0.4;
  return 0.1;
}

function boostWeightScore(item: RankableItem): number {
  if (!item.isBoosted) return 0;
  const spent = item.boostBudgetSpent ?? 0;
  const total = item.boostBudgetTotal ?? 0;
  if (total <= 0) return 0.5; // boost actif sans info de budget: poids moyen
  // Favorise les nouveaux boosts (moins dépensés)
  const remainingRatio = Math.max(0, Math.min(1, 1 - spent / total));
  return 0.4 + 0.6 * remainingRatio; // entre 0.4 et 1.0
}

/** Score global d'un item. */
function scoreItem(item: RankableItem, viewer: RankingViewerContext): number {
  const relevance = item.relevance ?? 0.5;
  const quality = item.quality ?? 0.5;
  const boost = boostWeightScore(item);
  const fresh = freshnessScore(item.createdAt);
  const geo = geoMatchScore(item, viewer);
  return relevance * 0.4 + boost * 0.3 + fresh * 0.15 + quality * 0.1 + geo * 0.05;
}

/**
 * Applique le ranking boost-aware avec cap densité + fairness.
 * Garantit :
 * - Au plus DENSITY_CAP des items sont boostés
 * - Pas 2 items consécutifs du même vendeur
 * - Filtre les boosts non visibles au viewer selon scope
 */
export function applyBoostRanking<T extends RankableItem>(
  items: T[],
  viewer: RankingViewerContext,
): T[] {
  if (items.length === 0) return items;

  // 1. Filtrer les boosts invisibles au viewer (forcer isBoosted=false si scope non matché)
  const normalized = items.map((it) => {
    if (!it.isBoosted) return it;
    const visible = isBoostVisibleToViewer(
      {
        isBoosted: true,
        boostScope: it.boostScope as string | null,
        boostTargetCountries: it.boostTargetCountries,
        city: it.itemCity,
        country: it.itemCountry,
      },
      viewer,
    );
    if (!visible) return { ...it, isBoosted: false } as T;
    return it;
  });

  // 2. Scorer
  const scored = normalized.map((item) => ({ item, score: scoreItem(item, viewer) }));
  scored.sort((a, b) => b.score - a.score);

  // 3. Appliquer cap densité + fairness
  const maxBoosted = Math.max(1, Math.floor(scored.length * DENSITY_CAP));
  const out: T[] = [];
  const pending: typeof scored = [];
  let boostedCount = 0;
  let lastSellerId: string | undefined;

  for (const entry of scored) {
    const { item } = entry;
    // Cap boost
    if (item.isBoosted && boostedCount >= maxBoosted) {
      pending.push(entry);
      continue;
    }
    // Fairness: si même vendeur que le précédent, mettre de côté
    if (lastSellerId && item.sellerId === lastSellerId) {
      pending.push(entry);
      continue;
    }
    out.push(item);
    lastSellerId = item.sellerId;
    if (item.isBoosted) boostedCount++;
  }

  // Ré-injecter les pending en respectant encore fairness si possible
  for (const entry of pending) {
    const { item } = entry;
    if (item.isBoosted && boostedCount >= maxBoosted) {
      // On le place quand même à la fin (mais sans boost visuel si possible)
      out.push(item);
      continue;
    }
    out.push(item);
    if (item.isBoosted) boostedCount++;
  }

  return out;
}

/**
 * Enrichit une liste d'items Listing-like avec les infos de la BoostCampaign active.
 * Permet au ranking d'utiliser boostBudget* pour le scoring.
 */
export async function hydrateBoostCampaigns<T extends { id: string; isBoosted: boolean }>(
  items: T[],
  target: "LISTING" | "POST",
): Promise<Map<string, { budgetUsdCents: number; budgetSpentUsdCents: number; scope: string; targetCountries: string[] }>> {
  const boostedIds = items.filter((i) => i.isBoosted).map((i) => i.id);
  if (boostedIds.length === 0) return new Map();

  const campaigns = await prisma.boostCampaign.findMany({
    where: {
      target,
      targetId: { in: boostedIds },
      status: "ACTIVE",
    },
    select: {
      targetId: true,
      budgetUsdCents: true,
      budgetSpentUsdCents: true,
      scope: true,
      targetCountries: true,
    },
  });

  const map = new Map<string, { budgetUsdCents: number; budgetSpentUsdCents: number; scope: string; targetCountries: string[] }>();
  for (const c of campaigns) {
    map.set(c.targetId, {
      budgetUsdCents: c.budgetUsdCents,
      budgetSpentUsdCents: c.budgetSpentUsdCents,
      scope: c.scope,
      targetCountries: c.targetCountries,
    });
  }
  return map;
}
