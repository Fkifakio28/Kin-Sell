import { Router, Request, Response } from "express";
import { requireAuth } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import {
  getCities,
  getMarketStats,
  getPriceRecommendation,
  refreshMarketStatsFromListings,
} from "./market-intelligence.service.js";
import { getAllRatesFromUsd, getCurrencyRate, invalidateCurrencyCache } from "../../shared/market/currency.service.js";

const router = Router();

// GET /market/cities?countryCode=CD
router.get(
  "/cities",
  asyncHandler(async (req: Request, res: Response) => {
    const countryCode = req.query.countryCode as string | undefined;
    const cities = await getCities(countryCode);
    res.json(cities);
  })
);

// GET /market/stats/:cityId?category=Alimentation
router.get(
  "/stats/:cityId",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { cityId } = req.params;
    const category = req.query.category as string | undefined;
    const stats = await getMarketStats(cityId, category);
    res.json(stats);
  })
);

// POST /market/price-recommendation
router.post(
  "/price-recommendation",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { category, city, priceUsdCents } = req.body;
    if (!category || !city || priceUsdCents == null) {
      res.status(400).json({ error: "category, city et priceUsdCents requis." });
      return;
    }
    const recommendation = await getPriceRecommendation(category, city, priceUsdCents);
    res.json(recommendation);
  })
);

// POST /market/refresh/:cityName  — recalcule les stats depuis les listings réels
router.post(
  "/refresh/:cityName",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const results = await refreshMarketStatsFromListings(req.params.cityName);
    res.json({ refreshed: results.length, stats: results });
  })
);

// ══════════════════════════════════════════════
// Currency Rates — Conversion de devises
// ══════════════════════════════════════════════

// GET /market/rates — tous les taux depuis USD (public, pas besoin d'auth)
router.get(
  "/rates",
  asyncHandler(async (_req: Request, res: Response) => {
    const rates = await getAllRatesFromUsd();
    res.setHeader("Cache-Control", "public, max-age=3600"); // Cache HTTP 1h
    res.json({ base: "USD", rates });
  })
);

// GET /market/rates/:from/:to — taux entre deux devises
router.get(
  "/rates/:from/:to",
  asyncHandler(async (req: Request, res: Response) => {
    const { from, to } = req.params;
    const rate = await getCurrencyRate(from.toUpperCase(), to.toUpperCase());
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({ from: from.toUpperCase(), to: to.toUpperCase(), rate });
  })
);

// POST /market/rates/invalidate — force le rafraîchissement du cache (admin)
router.post(
  "/rates/invalidate",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    invalidateCurrencyCache();
    res.json({ ok: true, message: "Cache des taux de change invalidé." });
  })
);

export default router;
