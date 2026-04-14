import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../../shared/auth/auth-middleware.js';
import { Role } from '../../types/roles.js';
import { prisma } from '../../shared/db/prisma.js';
import { AddonCode, AddonStatus } from '../../shared/db/prisma-enums.js';
import { HttpError } from '../../shared/errors/http-error.js';
import * as adsService from './ads.service.js';
import {
  getBoostProposal,
  getHighlightProposal,
  activateBoost,
  activateHighlight,
  SCOPE_PRICING_MULTIPLIER,
  type PromotionScope,
} from './ads-boost.service.js';
import { rateLimit, RateLimits } from '../../shared/middleware/rate-limit.middleware.js';
import { scrapeGuard } from '../../shared/middleware/scrape-guard.middleware.js';
import { runOrchestration } from './kinsell-internal-ads-orchestrator.js';
import { getRegionalMarketContext } from './regional-market-context.service.js';
import {
  generateAdCopyFromPrompt,
  acquireGenLock,
  releaseGenLock,
  getDailyAiGenCount,
  isAiQuotaAvailable,
} from './internal-ad-copy-generator.service.js';
import { env } from '../../config/env.js';

const router = Router();

// ── Public: random active banner for a given page (geo-filtered) ────────────
router.get('/banner',
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_AD_BANNER),
  asyncHandler(async (req, res) => {
  const page = (req.query.page as string) || 'home';
  const viewerCity = (req.query.city as string) || undefined;
  const viewerCountry = (req.query.country as string) || undefined;
  const ad = await adsService.getActiveBannerForPage(page, viewerCity, viewerCountry);
  res.json({ ad: ad ?? null });
}));

// ── Public: record impression (rate-limited) ────────────────────────────────
router.post('/:id/impression', rateLimit(RateLimits.AD_TRACKING), asyncHandler(async (req, res) => {
  await adsService.recordImpression(req.params.id);
  res.json({ ok: true });
}));

// ── Public: record click (rate-limited) ──────────────────────────────────────
router.post('/:id/click', rateLimit(RateLimits.AD_TRACKING), asyncHandler(async (req, res) => {
  await adsService.recordClick(req.params.id);
  res.json({ ok: true });
}));

// ── IA ADS: Boost proposal (single article) ─────────────────────────────────
router.get('/boost-proposal', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const listingId = req.query.listingId as string;
  if (!listingId) { res.status(400).json({ error: 'listingId requis' }); return; }
  const proposal = await getBoostProposal(req.auth!.userId, listingId);
  res.json({ proposal });
}));

// ── IA ADS: Highlight proposal (bulk import ≥ 5) ────────────────────────────
router.get('/highlight-proposal', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const count = parseInt(req.query.count as string) || 0;
  if (count < 5) { res.status(400).json({ error: 'Au moins 5 articles requis pour la mise en avant' }); return; }
  const proposal = await getHighlightProposal(req.auth!.userId, count);
  res.json({ proposal });
}));

// ── IA ADS: Activate boost on a single listing ──────────────────────────────
// SÉCURITÉ : exige l'add-on BOOST_VISIBILITY actif ou rôle SUPER_ADMIN
// RATE LIMIT : max 50 boosts actifs par utilisateur
router.post('/boost', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { listingId, durationDays, scope, targetCountries } = req.body as {
    listingId: string;
    durationDays?: number;
    scope?: PromotionScope;
    targetCountries?: string[];
  };
  if (!listingId) { res.status(400).json({ error: 'listingId requis' }); return; }

  const boostScope: PromotionScope = (['LOCAL', 'NATIONAL', 'CROSS_BORDER'].includes(scope ?? '') ? scope! : 'LOCAL');

  // Super admins peuvent toujours activer un boost
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    const now = new Date();
    const hasBoostAddon = await prisma.subscriptionAddon.findFirst({
      where: {
        addonCode: AddonCode.BOOST_VISIBILITY,
        status: AddonStatus.ACTIVE,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        subscription: {
          status: 'ACTIVE',
          AND: [
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            { OR: [{ userId: req.auth!.userId }, { business: { ownerUserId: req.auth!.userId } }] },
          ],
        }
      }
    });
    if (!hasBoostAddon) {
      throw new HttpError(403, 'Add-on Boost Visibilité requis. Souscrivez via la page Forfaits.');
    }

    // Rate limit: max 50 boosts actifs par user
    const activeBoosts = await prisma.listing.count({
      where: {
        ownerUserId: req.auth!.userId,
        isBoosted: true,
        boostExpiresAt: { gt: new Date() },
      },
    });
    if (activeBoosts >= 50) {
      throw new HttpError(429, 'Limite atteinte : 50 boosts actifs maximum.');
    }
  }

  const result = await activateBoost(
    req.auth!.userId,
    listingId,
    durationDays || 7,
    boostScope,
    targetCountries ?? [],
  );

  // Journaliser
  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: 'ADS_BOOST_ACTIVATED',
      entityType: 'Listing',
      entityId: listingId,
      metadata: {
        durationDays: durationDays || 7,
        scope: boostScope,
        pricingMultiplier: result.pricingMultiplier,
        targetCountries: targetCountries ?? [],
      },
    },
  });

  res.json(result);
}));

// ── IA ADS: Activate highlight (boost all user listings) ─────────────────────
// SÉCURITÉ : exige l'add-on BOOST_VISIBILITY actif ou rôle SUPER_ADMIN
// RATE LIMIT : max 5 highlights actifs par utilisateur
router.post('/highlight', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { durationDays, businessId, scope, targetCountries } = req.body as {
    durationDays?: number;
    businessId?: string;
    scope?: PromotionScope;
    targetCountries?: string[];
  };

  const hlScope: PromotionScope = (['LOCAL', 'NATIONAL', 'CROSS_BORDER'].includes(scope ?? '') ? scope! : 'LOCAL');

  // Super admins peuvent toujours activer une mise en avant
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    const now = new Date();
    const hasBoostAddon = await prisma.subscriptionAddon.findFirst({
      where: {
        addonCode: AddonCode.BOOST_VISIBILITY,
        status: AddonStatus.ACTIVE,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        subscription: {
          status: 'ACTIVE',
          AND: [
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            { OR: [{ userId: req.auth!.userId }, { business: { ownerUserId: req.auth!.userId } }] },
          ],
        }
      }
    });
    if (!hasBoostAddon) {
      throw new HttpError(403, 'Add-on Boost Visibilité requis. Souscrivez via la page Forfaits.');
    }

    // Rate limit: max 200 articles boostés par highlight par user
    const boostedByHighlight = await prisma.listing.count({
      where: {
        ownerUserId: req.auth!.userId,
        isBoosted: true,
        boostExpiresAt: { gt: new Date() },
      },
    });
    if (boostedByHighlight >= 200) {
      throw new HttpError(429, 'Limite atteinte : 200 articles en boost maximum.');
    }
  }

  const result = await activateHighlight(
    req.auth!.userId,
    durationDays || 7,
    businessId,
    hlScope,
    targetCountries ?? [],
  );

  // Journaliser
  await prisma.auditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: 'ADS_HIGHLIGHT_ACTIVATED',
      entityType: 'User',
      entityId: req.auth!.userId,
      metadata: {
        durationDays: durationDays || 7,
        businessId: businessId || null,
        scope: hlScope,
        pricingMultiplier: result.pricingMultiplier,
        targetCountries: targetCountries ?? [],
      },
    },
  });

  res.json(result);
}));

// ── Admin: Force orchestrator run ────────────────────────────────────────────
router.post('/orchestrator/run', requireAuth, requireRoles(Role.SUPER_ADMIN), asyncHandler(async (_req, res) => {
  // Orchestrator itself handles mutex + quota internally
  const result = await runOrchestration();
  const dailyCount = await getDailyAiGenCount();
  res.json({ ...result, quota: { used: dailyCount, max: env.MAX_AI_ADS_PER_DAY } });
}));

// ── Public: Regional market context for a category ──────────────────────────
router.get('/market-context',
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_FEED),
  asyncHandler(async (req, res) => {
  const category = (req.query.category as string) || '';
  const city = (req.query.city as string) || 'Kinshasa';
  if (!category) { res.status(400).json({ error: 'category requis' }); return; }
  const context = await getRegionalMarketContext(category, city);
  res.json(context);
}));

// ── Public: Pricing multipliers per scope ─────────────────────────────────────
router.get('/pricing',
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_FEED),
  asyncHandler(async (_req, res) => {
  res.json({
    scopes: [
      { scope: 'LOCAL', label: 'Ville uniquement', multiplier: SCOPE_PRICING_MULTIPLIER.LOCAL },
      { scope: 'NATIONAL', label: 'Pays entier', multiplier: SCOPE_PRICING_MULTIPLIER.NATIONAL },
      { scope: 'CROSS_BORDER', label: 'Inter-pays (ciblé)', multiplier: SCOPE_PRICING_MULTIPLIER.CROSS_BORDER },
    ],
  });
}));

// ── Admin: Generate ad from free-text prompt ──────────────────────────────────
router.post('/generate-admin', requireAuth, requireRoles(Role.SUPER_ADMIN), asyncHandler(async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || prompt.length < 10 || prompt.length > 500) {
    res.status(400).json({ error: 'prompt requis (10-500 caractères)' });
    return;
  }

  // Check quota
  const quotaOk = await isAiQuotaAvailable();
  const dailyCount = await getDailyAiGenCount();
  if (!quotaOk) {
    res.status(429).json({
      error: 'Limite journalière IA atteinte',
      dailyCount,
      maxDaily: env.MAX_AI_ADS_PER_DAY,
    });
    return;
  }

  // Acquire mutex
  const locked = await acquireGenLock();
  if (!locked) {
    res.status(409).json({ error: 'Une génération est déjà en cours, réessayez dans quelques secondes' });
    return;
  }

  try {
    const result = await generateAdCopyFromPrompt(prompt);

    // Store as advertisement in DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const now = new Date();
    const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days for admin ads

    const ad = await db.advertisement.create({
      data: {
        title: result.copy.title,
        description: result.copy.description,
        ctaText: result.copy.ctaText,
        linkUrl: `/explorer?category=${encodeURIComponent(result.copy.category)}`,
        type: 'KIN_SELL',
        status: 'ACTIVE',
        targetPages: [result.copy.targetPage, 'home'],
        priority: 8,
        startDate: now,
        endDate,
        advertiserName: 'Kin-Sell Admin',
        advertiserEmail: (req as AuthenticatedRequest).auth!.userId ?? 'admin@kin-sell.com',
        amountPaidCents: 0,
        paymentRef: 'ADMIN_GENERATED',
        promotionScope: 'LOCAL',
        baseCity: 'Kinshasa',
        baseCountry: 'République démocratique du Congo',
        pricingMultiplier: 1.0,
      },
    });

    const newCount = await getDailyAiGenCount();

    res.json({
      ad: {
        id: ad.id,
        title: result.copy.title,
        description: result.copy.description,
        ctaText: result.copy.ctaText,
        targetPage: result.copy.targetPage,
        category: result.copy.category,
        tone: result.copy.tone,
      },
      score: result.score,
      generatedAt: result.generatedAt,
      quota: { used: newCount, max: env.MAX_AI_ADS_PER_DAY },
    });
  } finally {
    await releaseGenLock();
  }
}));

// ── Admin: AI quota status ───────────────────────────────────────────────────
router.get('/ai-quota', requireAuth, requireRoles(Role.SUPER_ADMIN), asyncHandler(async (_req, res) => {
  const dailyCount = await getDailyAiGenCount();
  res.json({
    used: dailyCount,
    max: env.MAX_AI_ADS_PER_DAY,
    remaining: Math.max(0, env.MAX_AI_ADS_PER_DAY - dailyCount),
    mode: env.AI_MODE,
    openaiEnabled: env.ENABLE_OPENAI,
    geminiEnabled: env.ENABLE_GEMINI,
  });
}));

export default router;


