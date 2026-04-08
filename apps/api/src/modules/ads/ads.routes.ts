import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { requireAuth, type AuthenticatedRequest } from '../../shared/auth/auth-middleware.js';
import * as adsService from './ads.service.js';
import {
  getBoostProposal,
  getHighlightProposal,
  activateBoost,
  activateHighlight,
} from './ads-boost.service.js';

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
router.post('/boost', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { listingId, durationDays } = req.body as { listingId: string; durationDays?: number };
  if (!listingId) { res.status(400).json({ error: 'listingId requis' }); return; }
  const result = await activateBoost(req.auth!.userId, listingId, durationDays || 7);
  res.json(result);
}));

// ── IA ADS: Activate highlight (boost all user listings) ─────────────────────
router.post('/highlight', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { durationDays, businessId } = req.body as { durationDays?: number; businessId?: string };
  const result = await activateHighlight(req.auth!.userId, durationDays || 7, businessId);
  res.json(result);
}));

export default router;
