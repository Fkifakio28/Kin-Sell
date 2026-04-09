import { prisma } from '../../shared/db/prisma.js';
import { expireBoosts } from './ads-boost.service.js';

const VALID_PAGES = ['home', 'explorer', 'sokin', 'sokin-market', 'sokin-profiles'];

// ── Public: random active banner for a page (geo-filtered) ──────────────────
export const getActiveBannerForPage = async (
  page: string,
  viewerCity?: string,
  viewerCountry?: string,
): Promise<unknown | null> => {
  try {
    const now = new Date();
    const validPage = VALID_PAGES.includes(page) ? page : 'home';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ads = await (prisma as any).advertisement.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { targetPages: { has: validPage } },
          { targetPages: { has: 'all' } },
        ],
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
      orderBy: [{ priority: 'desc' }, { impressions: 'asc' }],
      take: 50,
    });
    if (!ads || ads.length === 0) return null;

    // Geographic filtering: only show ads that match the viewer's location
    const filtered = ads.filter((ad: any) => {
      const scope = ad.promotionScope ?? 'LOCAL';

      // No base location set → show to everyone (backward compat)
      if (!ad.baseCountry && !ad.baseCity) return true;

      switch (scope) {
        case 'LOCAL':
          // Must match viewer's city (case-insensitive)
          if (!viewerCity) return false;
          return ad.baseCity?.toLowerCase() === viewerCity.toLowerCase();
        case 'NATIONAL':
          // Must match viewer's country
          if (!viewerCountry) return false;
          return ad.baseCountry?.toLowerCase() === viewerCountry.toLowerCase();
        case 'CROSS_BORDER':
          // Must be in target countries list
          if (!viewerCountry) return false;
          const targets = (ad.targetCountries ?? []) as string[];
          return targets.some(
            (t: string) => t.toLowerCase() === viewerCountry.toLowerCase()
          );
        default:
          return true;
      }
    });
    if (filtered.length === 0) return null;

    return filtered[Math.floor(Math.random() * Math.min(filtered.length, 10))];
  } catch {
    return null; // Graceful fallback before migration
  }
};

// ── Tracking ─────────────────────────────────────────────────────────────────
export const recordImpression = async (id: string): Promise<void> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).advertisement.update({
      where: { id },
      data: { impressions: { increment: 1 } },
    });
  } catch { /* ignore */ }
};

export const recordClick = async (id: string): Promise<void> => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).advertisement.update({
      where: { id },
      data: { clicks: { increment: 1 } },
    });
  } catch { /* ignore */ }
};

// ── Admin: CRUD ───────────────────────────────────────────────────────────────
export const adminListAds = async (params: {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  search?: string;
}) => {
  const { page = 1, limit = 20, status, type, search } = params;
  try {
    const where: Record<string, unknown> = {};
    if (status && status !== 'ALL') where.status = status;
    if (type && type !== 'ALL') where.type = type;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { advertiserName: { contains: search, mode: 'insensitive' } },
        { advertiserEmail: { contains: search, mode: 'insensitive' } },
      ];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const [total, advertisements] = await Promise.all([
      db.advertisement.count({ where }),
      db.advertisement.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
          business: { select: { id: true, publicName: true, slug: true } },
        },
      }),
    ]);
    return { total, page, pages: Math.ceil(total / limit), ads: advertisements };
  } catch {
    return { total: 0, page, pages: 0, ads: [] };
  }
};

export const adminCreateAd = async (data: {
  title: string;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  ctaText?: string;
  type?: string;
  targetPages?: string[];
  startDate?: string;
  endDate?: string;
  paymentRef?: string;
  amountPaidCents?: number;
  priority?: number;
  advertiserEmail?: string;
  advertiserName?: string;
  promotionScope?: string;
  baseCountry?: string;
  baseRegion?: string;
  baseCity?: string;
  targetCountries?: string[];
  targetRegions?: string[];
  pricingMultiplier?: number;
  userId?: string;
  businessId?: string;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any).advertisement.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      imageUrl: data.imageUrl ?? null,
      linkUrl: data.linkUrl ?? '/',
      ctaText: data.ctaText ?? 'Découvrir',
      type: data.type ?? 'USER',
      status: 'PENDING',
      targetPages: data.targetPages ?? [],
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      paymentRef: data.paymentRef ?? null,
      amountPaidCents: data.amountPaidCents ?? 0,
      priority: data.priority ?? 0,
      advertiserEmail: data.advertiserEmail ?? null,
      advertiserName: data.advertiserName ?? null,
      promotionScope: data.promotionScope ?? 'LOCAL',
      baseCountry: data.baseCountry ?? null,
      baseRegion: data.baseRegion ?? null,
      baseCity: data.baseCity ?? null,
      targetCountries: data.targetCountries ?? [],
      targetRegions: data.targetRegions ?? [],
      pricingMultiplier: data.pricingMultiplier ?? 1.0,
      userId: data.userId ?? null,
      businessId: data.businessId ?? null,
    },
  });
};

export const adminUpdateAd = async (id: string, data: Record<string, unknown>) => {
  const update = { ...data };
  if (typeof data.startDate === 'string') (update as Record<string, unknown>).startDate = new Date(data.startDate as string);
  if (typeof data.endDate === 'string') (update as Record<string, unknown>).endDate = new Date(data.endDate as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any).advertisement.update({ where: { id }, data: update });
};

export const adminPatchStatus = async (
  id: string,
  status: string,
  cancelNote?: string,
  cancelledBy?: string,
) => {
  const data: Record<string, unknown> = { status };
  if (status === 'CANCELLED') {
    data.cancelledAt = new Date();
    if (cancelNote) data.cancelNote = cancelNote;
    if (cancelledBy) data.cancelledBy = cancelledBy;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any).advertisement.update({ where: { id }, data });
};

export const adminDeleteAd = async (id: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).advertisement.delete({ where: { id } });
};

// ── Auto-scheduler: activate / deactivate ads based on dates ─────────────────
export const startAdScheduler = (): void => {
  const run = async (): Promise<void> => {
    const now = new Date();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = prisma as any;
      // Activate PENDING ads with payment + startDate reached
      await db.advertisement.updateMany({
        where: {
          status: 'PENDING',
          paymentRef: { not: null },
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        data: { status: 'ACTIVE' },
      });
      // Deactivate ACTIVE ads past endDate
      await db.advertisement.updateMany({
        where: { status: 'ACTIVE', endDate: { lt: now } },
        data: { status: 'INACTIVE' },
      });
      // Expire boosts past their expiration date
      await expireBoosts();
    } catch { /* Silent until migration runs */ }
  };

  void run(); // immediate run on startup
  setInterval(() => { void run(); }, 5 * 60 * 1000); // every 5 min
};
