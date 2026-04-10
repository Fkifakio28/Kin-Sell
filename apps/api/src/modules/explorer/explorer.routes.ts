import { Router } from "express";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { scrapeGuard } from "../../shared/middleware/scrape-guard.middleware.js";
import * as explorerService from "./explorer.service.js";

const router = Router();

router.get(
  "/stats",
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_EXPLORE),
  asyncHandler(async (_request, response) => {
    const result = await explorerService.getExplorerStats();
    response.json(result);
  })
);

router.get(
  "/ads",
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_EXPLORE),
  asyncHandler(async (request, response) => {
    const city = typeof request.query.city === "string" ? request.query.city : undefined;
    const country = typeof request.query.country === "string" ? request.query.country : undefined;
    const result = await explorerService.getExplorerAds(city, country);
    response.json(result);
  })
);

router.get(
  "/shops",
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_EXPLORE),
  asyncHandler(async (request, response) => {
    const limit = typeof request.query.limit === "string" ? Math.min(Number(request.query.limit) || 4, 50) : 4;
    const city = typeof request.query.city === "string" ? request.query.city : undefined;
    const country = typeof request.query.country === "string" ? request.query.country : undefined;
    const result = await explorerService.getFeaturedShops(limit, city, country);
    response.json(result);
  })
);

router.get(
  "/profiles",
  scrapeGuard(),
  rateLimit(RateLimits.PUBLIC_EXPLORE),
  asyncHandler(async (request, response) => {
    const limit = typeof request.query.limit === "string" ? Math.min(Number(request.query.limit) || 4, 50) : 4;
    const city = typeof request.query.city === "string" ? request.query.city : undefined;
    const country = typeof request.query.country === "string" ? request.query.country : undefined;
    const result = await explorerService.getFeaturedProfiles(limit, city, country);
    response.json(result);
  })
);

export default router;
