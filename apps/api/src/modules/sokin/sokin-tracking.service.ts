/**
 * So-Kin Tracking Service — Événements analytiques minimalistes
 *
 * V1 pragmatique : batch insert fire-and-forget, dédup vues via Redis,
 * incrémentation viewCount sur SoKinPost.
 *
 * Événements trackés :
 * - VIEW           : post visible ≥50% pendant 1s (IntersectionObserver côté client)
 * - COMMENT_OPEN   : ouverture du tiroir commentaires
 * - PROFILE_CLICK  : clic vers le profil de l'auteur
 * - LISTING_CLICK  : clic vers l'article lié
 * - CONTACT_CLICK  : clic sur le bouton contacter / DM
 * - DM_OPEN        : ouverture conversation depuis un post
 */

import { prisma } from "../../shared/db/prisma.js";
import { getRedis } from "../../shared/db/redis.js";
import { logger } from "../../shared/logger.js";

// ── Types ──

export const VALID_EVENTS = [
  "VIEW",
  "COMMENT_OPEN",
  "PROFILE_CLICK",
  "LISTING_CLICK",
  "CONTACT_CLICK",
  "DM_OPEN",
] as const;

export type SoKinEventType = (typeof VALID_EVENTS)[number];

export interface TrackEventInput {
  event: SoKinEventType;
  postId: string;
  authorId: string;
  viewerId?: string | null;
  postType?: string | null;
  city?: string | null;
  country?: string | null;
  source?: string | null;
  meta?: Record<string, unknown> | null;
}

// ── Dédup vues via Redis (1 vue / viewer+post / 30 min) ──

const VIEW_DEDUP_TTL = 1800; // 30 minutes

async function isViewDuplicate(postId: string, viewerKey: string): Promise<boolean> {
  try {
    const redis = getRedis();
    if (!redis) return false;
    const key = `sk:view:${postId}:${viewerKey}`;
    const exists = await redis.get(key);
    if (exists) return true;
    await redis.set(key, "1", "EX", VIEW_DEDUP_TTL);
    return false;
  } catch {
    return false; // si Redis down, on accepte la vue
  }
}

// ── Tracking principal ──

/**
 * Enregistre un lot d'événements So-Kin.
 * Fire-and-forget : les erreurs sont loguées mais pas remontées.
 * Pour les VIEW, déduplique via Redis et incrémente viewCount.
 */
export async function trackEvents(events: TrackEventInput[], ip?: string): Promise<{ tracked: number }> {
  if (events.length === 0) return { tracked: 0 };

  const toInsert: TrackEventInput[] = [];
  const viewPostIds: string[] = [];

  for (const ev of events) {
    // Validation basique
    if (!VALID_EVENTS.includes(ev.event as SoKinEventType)) continue;
    if (!ev.postId || !ev.authorId) continue;

    if (ev.event === "VIEW") {
      const viewerKey = ev.viewerId || ip || "anon";
      const isDup = await isViewDuplicate(ev.postId, viewerKey);
      if (isDup) continue;
      viewPostIds.push(ev.postId);
    }

    toInsert.push(ev);
  }

  if (toInsert.length === 0) return { tracked: 0 };

  try {
    // Batch insert événements
    await (prisma as any).soKinEvent.createMany({
      data: toInsert.map((ev) => ({
        event: ev.event,
        postId: ev.postId,
        authorId: ev.authorId,
        viewerId: ev.viewerId ?? null,
        postType: ev.postType ?? null,
        city: ev.city ?? null,
        country: ev.country ?? null,
        source: ev.source ?? null,
        meta: ev.meta ?? undefined,
      })),
      skipDuplicates: true,
    });

    // Incrémenter viewCount pour les vues dédupliquées
    if (viewPostIds.length > 0) {
      const uniquePostIds = [...new Set(viewPostIds)];
      // Batch update en parallèle (max 20 pour éviter surcharge)
      await Promise.all(
        uniquePostIds.slice(0, 20).map((postId) =>
          (prisma as any).soKinPost.update({
            where: { id: postId },
            data: { views: { increment: 1 } },
          }).catch(() => { /* post supprimé entre-temps */ })
        )
      );
    }
  } catch (err) {
    logger.error(`[sokin-tracking] batch insert failed: ${err}`);
  }

  return { tracked: toInsert.length };
}

// ── Agrégats pour insights ──

/**
 * Comptage de vues d'un post (depuis la table événements, avec fallback viewCount).
 */
export async function getPostViewCount(postId: string): Promise<number> {
  const post = await (prisma as any).soKinPost.findUnique({
    where: { id: postId },
    select: { views: true },
  });
  return (post as any)?.views ?? 0;
}

/**
 * Stats résumées pour un auteur (7 derniers jours).
 */
export async function getAuthorTrackingStats(authorId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const grouped: any[] = await (prisma as any).soKinEvent.groupBy({
    by: ["event"],
    where: { authorId, createdAt: { gte: since } },
    _count: { id: true },
  });

  const stats: Record<string, number> = {};
  for (const g of grouped) {
    stats[g.event] = g._count.id;
  }

  return {
    views: stats["VIEW"] ?? 0,
    commentOpens: stats["COMMENT_OPEN"] ?? 0,
    profileClicks: stats["PROFILE_CLICK"] ?? 0,
    listingClicks: stats["LISTING_CLICK"] ?? 0,
    contactClicks: stats["CONTACT_CLICK"] ?? 0,
    dmOpens: stats["DM_OPEN"] ?? 0,
    period: "7d",
  };
}

/**
 * Top sources de trafic pour un auteur (7 derniers jours).
 */
export async function getAuthorSourceBreakdown(authorId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const grouped: any[] = await (prisma as any).soKinEvent.groupBy({
    by: ["source"],
    where: { authorId, event: "VIEW", createdAt: { gte: since } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  return grouped.map((g) => ({
    source: g.source ?? "direct",
    views: g._count.id,
  }));
}
