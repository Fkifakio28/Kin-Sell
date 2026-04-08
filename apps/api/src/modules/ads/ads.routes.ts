import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { requireAuth, requireRoles, type AuthenticatedRequest } from '../../shared/auth/auth-middleware.js';
import { Role } from '../../types/roles.js';
import { prisma } from '../../shared/db/prisma.js';
import { AddonCode, AddonStatus } from '@prisma/client';
import { HttpError } from '../../shared/errors/http-error.js';
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
// SÉCURITÉ : exige l'add-on BOOST_VISIBILITY actif ou rôle SUPER_ADMIN
router.post('/boost', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { listingId, durationDays } = req.body as { listingId: string; durationDays?: number };
  if (!listingId) { res.status(400).json({ error: 'listingId requis' }); return; }

  // Super admins peuvent toujours activer un boost
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    const hasBoostAddon = await prisma.subscriptionAddon.findFirst({
      where: {
        addonCode: AddonCode.BOOST_VISIBILITY,
        status: AddonStatus.ACTIVE,
        subscription: {
          status: 'ACTIVE',
          userId: req.auth!.userId
        }
      }
    });
    if (!hasBoostAddon) {
      throw new HttpError(403, 'Add-on Boost Visibilité requis. Souscrivez via la page Forfaits.');
    }
  }

  const result = await activateBoost(req.auth!.userId, listingId, durationDays || 7);
  res.json(result);
}));

// ── IA ADS: Activate highlight (boost all user listings) ─────────────────────
// SÉCURITÉ : exige l'add-on BOOST_VISIBILITY actif ou rôle SUPER_ADMIN
router.post('/highlight', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { durationDays, businessId } = req.body as { durationDays?: number; businessId?: string };

  // Super admins peuvent toujours activer une mise en avant
  if (req.auth!.role !== Role.SUPER_ADMIN) {
    const hasBoostAddon = await prisma.subscriptionAddon.findFirst({
      where: {
        addonCode: AddonCode.BOOST_VISIBILITY,
        status: AddonStatus.ACTIVE,
        subscription: {
          status: 'ACTIVE',
          userId: req.auth!.userId
        }
      }
    });
    if (!hasBoostAddon) {
      throw new HttpError(403, 'Add-on Boost Visibilité requis. Souscrivez via la page Forfaits.');
    }
  }

  const result = await activateHighlight(req.auth!.userId, durationDays || 7, businessId);
  res.json(result);
}));

export default router;
