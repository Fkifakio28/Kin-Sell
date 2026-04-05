import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { requireAuth, type AuthenticatedRequest } from '../../shared/auth/auth-middleware.js';
import * as adsService from './ads.service.js';

const router = Router();

// ── Public: random active banner for a given page ────────────────────────────
router.get('/banner', asyncHandler(async (req, res) => {
  const page = (req.query.page as string) || 'home';
  const ad = await adsService.getActiveBannerForPage(page);
  res.json({ ad: ad ?? null });
}));

// ── Public: record impression ────────────────────────────────────────────────
router.post('/:id/impression', asyncHandler(async (req, res) => {
  await adsService.recordImpression(req.params.id);
  res.json({ ok: true });
}));

// ── Public: record click ─────────────────────────────────────────────────────
router.post('/:id/click', asyncHandler(async (req, res) => {
  await adsService.recordClick(req.params.id);
  res.json({ ok: true });
}));

// ── IA ADS — Conseil ciblage avant création d'une pub ────────────────────────
router.get('/ai/targeting-advice', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { listingId } = z.object({ listingId: z.string().optional() }).parse(req.query);
  const { getAdTargetingAdvice } = await import('./ad-advisor.service.js');
  const advice = await getAdTargetingAdvice(req.auth!.userId, listingId);
  res.json(advice);
}));

// ── IA ADS — Performance insights pour une pub existante ─────────────────────
router.get('/ai/performance/:adId', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { getAdPerformanceInsights } = await import('./ad-advisor.service.js');
  const insights = await getAdPerformanceInsights(req.params.adId, req.auth!.userId);
  res.json(insights);
}));

// ══════════════════════════════════════════════════════════════════════════════
// IA ADS — Placement intelligent (public, appelé par le frontend)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/ai-slot', asyncHandler(async (req, res) => {
  const { pageKey, componentKey, userRole, userPlanCode } = req.query as Record<string, string>;
  if (!pageKey || !componentKey) { res.json({ ad: null }); return; }
  const { getAdForSlot } = await import('./ai-ad-placement.service.js');
  const ad = await getAdForSlot({ pageKey, componentKey, userRole, userPlanCode });
  res.json({ ad });
}));

router.get('/ai-page', asyncHandler(async (req, res) => {
  const { pageKey, userRole } = req.query as Record<string, string>;
  if (!pageKey) { res.json({ ads: [] }); return; }
  const { getAdsForPage } = await import('./ai-ad-placement.service.js');
  const ads = await getAdsForPage(pageKey, userRole, 5);
  res.json({ ads });
}));

router.post('/ai-campaign/:id/impression', asyncHandler(async (req, res) => {
  const { recordCampaignImpression } = await import('./ai-ad-placement.service.js');
  await recordCampaignImpression(req.params.id);
  res.json({ ok: true });
}));

router.post('/ai-campaign/:id/click', asyncHandler(async (req, res) => {
  const { recordCampaignClick } = await import('./ai-ad-placement.service.js');
  await recordCampaignClick(req.params.id);
  res.json({ ok: true });
}));

router.post('/ai-campaign/:id/dismiss', asyncHandler(async (req, res) => {
  const { recordCampaignDismissal } = await import('./ai-ad-placement.service.js');
  await recordCampaignDismissal(req.params.id);
  res.json({ ok: true });
}));

router.post('/ai-campaign/:id/convert', requireAuth, asyncHandler(async (req, res) => {
  const { type } = z.object({ type: z.enum(['subscription', 'trial', 'generic']) }).parse(req.body);
  const { recordCampaignConversion } = await import('./ai-ad-placement.service.js');
  await recordCampaignConversion(req.params.id, type);
  res.json({ ok: true });
}));

export default router;
