import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { isAcceptedImageInput } from "../../shared/utils/media-storage.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { scrapeGuard } from "../../shared/middleware/scrape-guard.middleware.js";
import * as usersService from "./users.service.js";

const updateMeSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  avatarUrl: z.string().refine(isAcceptedImageInput, "Image invalide").optional(),
  city: z.string().min(2).max(80).optional(),
  country: z.string().min(2).max(80).optional(),
  countryCode: z.string().length(2).optional(),
  region: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
  formattedAddress: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  placeId: z.string().max(300).optional(),
  locationVisibility: z.enum([
    "EXACT_PUBLIC", "DISTRICT_PUBLIC", "CITY_PUBLIC",
    "REGION_PUBLIC", "COUNTRY_PUBLIC", "EXACT_PRIVATE",
  ]).optional(),
  bio: z.string().max(500).optional(),
  domain: z.string().max(100).optional(),
  qualification: z.string().max(150).optional(),
  experience: z.string().max(80).optional(),
  workHours: z.string().max(80).optional()
});

const reportSchema = z.object({
  reportedUserId: z.string().min(1),
  reason: z.string().min(2).max(200),
  message: z.string().max(500).optional(),
});

const router = Router();

router.get("/me", requireAuth, asyncHandler(async (request: AuthenticatedRequest, response) => {
  const result = await usersService.getMe(request.auth!.userId);
  response.json(result);
}));

router.patch("/me", requireAuth, asyncHandler(async (request: AuthenticatedRequest, response) => {
  const payload = updateMeSchema.parse(request.body);
  const result = await usersService.updateMe(request.auth!.userId, payload);
  response.json(result);
}));

router.get("/public/:username", scrapeGuard(), rateLimit(RateLimits.PUBLIC_SEARCH), asyncHandler(async (request, response) => {
  const result = await usersService.getPublicProfileByUsername(request.params.username);
  response.json(result);
}));

router.get("/:id/public", scrapeGuard(), rateLimit(RateLimits.PUBLIC_SEARCH), asyncHandler(async (request, response) => {
  const result = await usersService.getPublicProfile(request.params.id);
  response.json(result);
}));

router.post("/report", requireAuth, asyncHandler(async (request: AuthenticatedRequest, response) => {
  const payload = reportSchema.parse(request.body);
  const result = await usersService.createReport(request.auth!.userId, payload);
  response.status(201).json(result);
}));

export default router;
