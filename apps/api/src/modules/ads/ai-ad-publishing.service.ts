/**
 * IA Ads — Publishing & Campaign Service
 *
 * Gère les campagnes publicitaires : création, activation, planification, statut.
 * Fait le lien entre les créations (Studio Ads) et les placements.
 */
import { prisma } from '../../shared/db/prisma.js';

// ── Types ──────────────────────────────────────────────

export interface CreateCampaignInput {
  creativeId: string;
  campaignName: string;
  objective: string; // CONVERSION, UPSELL, AWARENESS, TRIAL, RETENTION
  audienceRole?: string;
  audienceConditions?: Record<string, unknown>;
  startsAt?: string;
  endsAt?: string;
  frequencyCap?: number;
  priority?: number;
  budgetType?: string;
  placements: { pageKey: string; componentKey: string; priority?: number }[];
  userId?: string;
  businessId?: string;
}

// ── Créer une campagne avec placements ────────────────

export async function createCampaign(input: CreateCampaignInput) {
  const campaign = await prisma.aiAdCampaign.create({
    data: {
      creativeId: input.creativeId,
      campaignName: input.campaignName,
      objective: input.objective,
      audienceRole: input.audienceRole || 'ALL',
      audienceConditions: (input.audienceConditions as any) || undefined,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      frequencyCap: input.frequencyCap ?? 3,
      priority: input.priority ?? 0,
      budgetType: input.budgetType || 'INTERNAL',
      userId: input.userId || null,
      businessId: input.businessId || null,
      active: false,
      placements: {
        create: input.placements.map((p) => ({
          pageKey: p.pageKey,
          componentKey: p.componentKey,
          priority: p.priority ?? 0,
        })),
      },
    },
    include: { placements: true, creative: true },
  });

  return campaign;
}

// ── Publier une créa directement (one-shot pour les auto-gen) ──

export async function publishCreativeAsCampaign(creativeId: string, opts?: {
  placements?: { pageKey: string; componentKey: string }[];
  priority?: number;
  frequencyCap?: number;
  startsAt?: string;
  endsAt?: string;
}) {
  const creative = await prisma.aiAdCreative.findUnique({ where: { id: creativeId } });
  if (!creative) throw new Error('Creative not found');

  // Default placements based on adType
  const defaultPlacements = getDefaultPlacements(creative.adType, creative.audienceType);
  const placements = opts?.placements || defaultPlacements;

  // Update creative status
  await prisma.aiAdCreative.update({ where: { id: creativeId }, data: { status: 'PUBLISHED' } });

  // Create campaign
  const campaign = await createCampaign({
    creativeId,
    campaignName: `Auto: ${creative.title}`,
    objective: mapAdTypeToObjective(creative.adType),
    audienceRole: creative.audienceType,
    frequencyCap: opts?.frequencyCap ?? 3,
    priority: opts?.priority ?? 0,
    startsAt: opts?.startsAt,
    endsAt: opts?.endsAt,
    placements,
  });

  // Activate immediately
  await prisma.aiAdCampaign.update({ where: { id: campaign.id }, data: { active: true } });

  return campaign;
}

function mapAdTypeToObjective(adType: string): string {
  switch (adType) {
    case 'BOOST_ARTICLE':
    case 'BOOST_SHOP': return 'AWARENESS';
    case 'FORFAIT':
    case 'UPGRADE': return 'UPSELL';
    case 'IA_PROMO':
    case 'AUTO_VENTE': return 'CONVERSION';
    case 'ESSAI': return 'TRIAL';
    default: return 'AWARENESS';
  }
}

function getDefaultPlacements(adType: string, audienceType: string): { pageKey: string; componentKey: string }[] {
  const base: { pageKey: string; componentKey: string }[] = [];

  // Always add home
  base.push({ pageKey: 'home', componentKey: 'banner_top' });

  switch (adType) {
    case 'BOOST_ARTICLE':
      base.push({ pageKey: 'dashboard_user', componentKey: 'inline_card' });
      base.push({ pageKey: 'kinsell', componentKey: 'contextual' });
      break;
    case 'BOOST_SHOP':
      base.push({ pageKey: 'dashboard_business', componentKey: 'inline_card' });
      base.push({ pageKey: 'explorer', componentKey: 'banner_bottom' });
      break;
    case 'FORFAIT':
    case 'UPGRADE':
      base.push({ pageKey: 'pricing', componentKey: 'banner_top' });
      base.push({ pageKey: 'kinsell', componentKey: 'inline_card' });
      if (audienceType !== 'USER') base.push({ pageKey: 'dashboard_business', componentKey: 'contextual' });
      break;
    case 'IA_PROMO':
    case 'AUTO_VENTE':
      base.push({ pageKey: 'kinsell', componentKey: 'inline_card' });
      base.push({ pageKey: 'pricing', componentKey: 'contextual' });
      break;
    case 'ESSAI':
      base.push({ pageKey: 'kinsell', componentKey: 'smart_popup' });
      base.push({ pageKey: 'dashboard_user', componentKey: 'contextual' });
      break;
    default:
      base.push({ pageKey: 'explorer', componentKey: 'sidebar' });
  }

  return base;
}

// ── CRUD Campagnes ──────────────────────────────────────

export async function listCampaigns(params: {
  page?: number;
  limit?: number;
  active?: boolean;
  objective?: string;
}) {
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 50);
  const where: Record<string, unknown> = {};
  if (params.active !== undefined) where.active = params.active;
  if (params.objective) where.objective = params.objective;

  const [items, total] = await Promise.all([
    prisma.aiAdCampaign.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        creative: { select: { id: true, title: true, adType: true, mediaType: true, ctaLabel: true, status: true } },
        placements: true,
        _count: { select: { metrics: true } },
      },
    }),
    prisma.aiAdCampaign.count({ where }),
  ]);

  return { campaigns: items, total, page, totalPages: Math.ceil(total / limit) };
}

export async function toggleCampaign(id: string, active: boolean) {
  return prisma.aiAdCampaign.update({ where: { id }, data: { active } });
}

export async function updateCampaign(id: string, data: Partial<CreateCampaignInput>) {
  const update: Record<string, unknown> = {};
  if (data.campaignName !== undefined) update.campaignName = data.campaignName;
  if (data.objective !== undefined) update.objective = data.objective;
  if (data.audienceRole !== undefined) update.audienceRole = data.audienceRole;
  if (data.audienceConditions !== undefined) update.audienceConditions = data.audienceConditions;
  if (data.startsAt !== undefined) update.startsAt = data.startsAt ? new Date(data.startsAt) : null;
  if (data.endsAt !== undefined) update.endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (data.frequencyCap !== undefined) update.frequencyCap = data.frequencyCap;
  if (data.priority !== undefined) update.priority = data.priority;

  return prisma.aiAdCampaign.update({ where: { id }, data: update });
}

export async function deleteCampaign(id: string) {
  return prisma.aiAdCampaign.delete({ where: { id } });
}

// ── Stats globales campagnes ──────────────────────────

export async function getCampaignStats() {
  const [totalCampaigns, activeCampaigns, totalCreatives, readyCreatives, publishedCreatives] = await Promise.all([
    prisma.aiAdCampaign.count(),
    prisma.aiAdCampaign.count({ where: { active: true } }),
    prisma.aiAdCreative.count(),
    prisma.aiAdCreative.count({ where: { status: 'READY' } }),
    prisma.aiAdCreative.count({ where: { status: 'PUBLISHED' } }),
  ]);

  // Aggregate performance
  const perf = await prisma.aiAdPerformance.aggregate({
    _sum: { impressions: true, clicks: true, conversions: true, subscriptionsGenerated: true, trialsActivated: true, dismissals: true, revenue: true },
  });

  const totalImpressions = perf._sum.impressions || 0;
  const totalClicks = perf._sum.clicks || 0;

  return {
    campaigns: { total: totalCampaigns, active: activeCampaigns },
    creatives: { total: totalCreatives, ready: readyCreatives, published: publishedCreatives },
    performance: {
      impressions: totalImpressions,
      clicks: totalClicks,
      ctr: totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0,
      conversions: perf._sum.conversions || 0,
      subscriptions: perf._sum.subscriptionsGenerated || 0,
      trials: perf._sum.trialsActivated || 0,
      dismissals: perf._sum.dismissals || 0,
      revenue: perf._sum.revenue || 0,
    },
  };
}
