/**
 * IA Ads — Placement & Diffusion Intelligence
 *
 * Cerveau de diffusion : décide quoi afficher, à qui, où, quand.
 * Appelé par les composants frontend pour récupérer la pub optimale.
 */
import { prisma } from '../../shared/db/prisma.js';

// ── Types ──────────────────────────────────────────────

export interface AdSlotRequest {
  pageKey: string;
  componentKey: string;
  userId?: string;
  userRole?: string; // USER, BUSINESS
  userPlanCode?: string;
  listingCount?: number;
  orderCount?: number;
}

export interface AdSlotResponse {
  campaignId: string;
  creativeId: string;
  title: string;
  contentText: string;
  subtitle: string | null;
  mediaType: string;
  mediaUrl: string | null;
  ctaLabel: string;
  ctaTarget: string;
  adType: string;
  tone: string;
  priority: number;
}

// ── Récupérer la pub optimale pour un slot ──────────────

export async function getAdForSlot(req: AdSlotRequest): Promise<AdSlotResponse | null> {
  const now = new Date();

  // Find active placements for this page+component
  const placements = await prisma.aiAdPlacement.findMany({
    where: {
      pageKey: req.pageKey,
      componentKey: req.componentKey,
      active: true,
      campaign: {
        active: true,
        OR: [
          { startsAt: null },
          { startsAt: { lte: now } },
        ],
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
    },
    include: {
      campaign: {
        include: {
          creative: true,
        },
      },
    },
    orderBy: { priority: 'desc' },
  });

  if (placements.length === 0) return null;

  // Filter by audience role
  const eligible = placements.filter((p) => {
    const camp = p.campaign;
    const role = camp.audienceRole;
    if (role === 'ALL') return true;
    if (role === 'USER' && req.userRole === 'USER') return true;
    if (role === 'BUSINESS' && req.userRole === 'BUSINESS') return true;
    return false;
  });

  if (eligible.length === 0) return null;

  // Filter by audience conditions (plan code, listing count, etc.)
  const matched = eligible.filter((p) => {
    const conditions = p.campaign.audienceConditions as Record<string, unknown> | null;
    if (!conditions) return true;

    if (conditions.planCodes && Array.isArray(conditions.planCodes)) {
      if (req.userPlanCode && !(conditions.planCodes as string[]).includes(req.userPlanCode)) return false;
    }
    if (conditions.minListings && typeof conditions.minListings === 'number') {
      if ((req.listingCount ?? 0) < conditions.minListings) return false;
    }
    if (conditions.minOrders && typeof conditions.minOrders === 'number') {
      if ((req.orderCount ?? 0) < conditions.minOrders) return false;
    }
    return true;
  });

  if (matched.length === 0) return null;

  // Score-based selection: priority + recency + random factor
  const scored = matched.map((p) => ({
    placement: p,
    score: (p.campaign.priority * 10) + (p.priority * 5) + Math.random() * 3,
  }));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0].placement;
  const creative = best.campaign.creative;

  return {
    campaignId: best.campaign.id,
    creativeId: creative.id,
    title: creative.title,
    contentText: creative.contentText,
    subtitle: creative.subtitle,
    mediaType: creative.mediaType,
    mediaUrl: creative.mediaUrl,
    ctaLabel: creative.ctaLabel,
    ctaTarget: creative.ctaTarget,
    adType: creative.adType,
    tone: creative.tone,
    priority: best.campaign.priority,
  };
}

// ── Récupérer plusieurs pubs pour une page ──────────────

export async function getAdsForPage(pageKey: string, userRole?: string, limit = 3): Promise<AdSlotResponse[]> {
  const now = new Date();

  const placements = await prisma.aiAdPlacement.findMany({
    where: {
      pageKey,
      active: true,
      campaign: {
        active: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        ...(userRole && userRole !== 'ALL' ? { audienceRole: { in: [userRole, 'ALL'] } } : {}),
      },
    },
    include: {
      campaign: { include: { creative: true } },
    },
    orderBy: { priority: 'desc' },
    take: limit * 2,
  });

  // Deduplicate by campaign
  const seen = new Set<string>();
  const results: AdSlotResponse[] = [];
  for (const p of placements) {
    if (seen.has(p.campaign.id)) continue;
    seen.add(p.campaign.id);
    const c = p.campaign.creative;
    results.push({
      campaignId: p.campaign.id,
      creativeId: c.id,
      title: c.title,
      contentText: c.contentText,
      subtitle: c.subtitle,
      mediaType: c.mediaType,
      mediaUrl: c.mediaUrl,
      ctaLabel: c.ctaLabel,
      ctaTarget: c.ctaTarget,
      adType: c.adType,
      tone: c.tone,
      priority: p.campaign.priority,
    });
    if (results.length >= limit) break;
  }

  return results;
}

// ── Enregistrer impression ──────────────────────────────

export async function recordCampaignImpression(campaignId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.aiAdPerformance.upsert({
    where: { campaignId_date: { campaignId, date: today } },
    update: { impressions: { increment: 1 } },
    create: { campaignId, date: today, impressions: 1 },
  });
}

// ── Enregistrer clic ──────────────────────────────────

export async function recordCampaignClick(campaignId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.aiAdPerformance.upsert({
    where: { campaignId_date: { campaignId, date: today } },
    update: { clicks: { increment: 1 } },
    create: { campaignId, date: today, clicks: 1 },
  });
}

// ── Enregistrer dismissal ─────────────────────────────

export async function recordCampaignDismissal(campaignId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.aiAdPerformance.upsert({
    where: { campaignId_date: { campaignId, date: today } },
    update: { dismissals: { increment: 1 } },
    create: { campaignId, date: today, dismissals: 1 },
  });
}

// ── Enregistrer conversion ────────────────────────────

export async function recordCampaignConversion(campaignId: string, type: 'subscription' | 'trial' | 'generic') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const update: Record<string, unknown> = { conversions: { increment: 1 } };
  if (type === 'subscription') update.subscriptionsGenerated = { increment: 1 };
  if (type === 'trial') update.trialsActivated = { increment: 1 };

  await prisma.aiAdPerformance.upsert({
    where: { campaignId_date: { campaignId, date: today } },
    update,
    create: { campaignId, date: today, conversions: 1, ...(type === 'subscription' ? { subscriptionsGenerated: 1 } : {}), ...(type === 'trial' ? { trialsActivated: 1 } : {}) },
  });
}

// ── Performance par campagne ──────────────────────────

export async function getCampaignPerformance(campaignId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const metrics = await prisma.aiAdPerformance.findMany({
    where: { campaignId, date: { gte: since } },
    orderBy: { date: 'asc' },
  });

  const totals = metrics.reduce(
    (acc, m) => ({
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
      conversions: acc.conversions + m.conversions,
      dismissals: acc.dismissals + m.dismissals,
      subscriptions: acc.subscriptions + m.subscriptionsGenerated,
      trials: acc.trials + m.trialsActivated,
      revenue: acc.revenue + m.revenue,
    }),
    { impressions: 0, clicks: 0, conversions: 0, dismissals: 0, subscriptions: 0, trials: 0, revenue: 0 },
  );

  return {
    totals,
    ctr: totals.impressions > 0 ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0,
    daily: metrics,
  };
}

// ── Top campagnes par CTR ────────────────────────────

export async function getTopCampaigns(limit = 10) {
  const campaigns = await prisma.aiAdCampaign.findMany({
    where: { active: true },
    include: {
      creative: { select: { title: true, adType: true } },
      metrics: {
        orderBy: { date: 'desc' },
        take: 30,
      },
    },
    take: 50,
  });

  const ranked = campaigns.map((c) => {
    const totals = c.metrics.reduce(
      (acc, m) => ({ imp: acc.imp + m.impressions, clk: acc.clk + m.clicks, conv: acc.conv + m.conversions }),
      { imp: 0, clk: 0, conv: 0 },
    );
    return {
      id: c.id,
      name: c.campaignName,
      creative: c.creative.title,
      adType: c.creative.adType,
      impressions: totals.imp,
      clicks: totals.clk,
      conversions: totals.conv,
      ctr: totals.imp > 0 ? Number(((totals.clk / totals.imp) * 100).toFixed(2)) : 0,
    };
  });

  ranked.sort((a, b) => b.ctr - a.ctr);
  return ranked.slice(0, limit);
}
