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

export default router;
