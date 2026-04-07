import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { isAcceptedImageInput } from "../../shared/utils/media-storage.js";
import * as businessService from "./business-accounts.service.js";

const createSchema = z.object({
  legalName: z.string().min(2).max(150),
  publicName: z.string().min(2).max(150),
  description: z.string().max(800).optional(),
  city: z.string().min(2).max(80).optional(),
  country: z.string().max(80).optional(),
  countryCode: z.string().length(2).optional(),
});

const locationVisibilitySchema = z.enum([
  "EXACT_PUBLIC", "DISTRICT_PUBLIC", "CITY_PUBLIC",
  "REGION_PUBLIC", "COUNTRY_PUBLIC", "EXACT_PRIVATE",
]);

const updateSchema = z.object({
  legalName: z.string().min(2).max(150).optional(),
  publicName: z.string().min(2).max(150).optional(),
  description: z.string().max(800).optional(),
  city: z.string().min(2).max(80).optional(),
  country: z.string().max(80).optional(),
  countryCode: z.string().length(2).optional(),
  region: z.string().max(120).optional(),
  district: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  address: z.string().max(200).optional(),
  formattedAddress: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  placeId: z.string().max(300).optional(),
  locationVisibility: locationVisibilitySchema.optional(),
  serviceRadiusKm: z.number().int().min(1).max(500).nullable().optional(),
  deliveryZones: z.array(z.string().max(120)).max(20).optional(),
  coverImage: z.string().refine(isAcceptedImageInput, "Image invalide").optional(),
  logo: z.string().refine(isAcceptedImageInput, "Image invalide").optional(),
  publicDescription: z.string().max(800).optional(),
  active: z.boolean().optional(),
  highlights: z.array(z.object({
    id: z.string().max(50),
    icon: z.string().max(10),
    name: z.string().max(100),
    description: z.string().max(300),
  })).max(10).optional(),
  shopPhotos: z.array(z.string().refine(isAcceptedImageInput, "Image invalide")).max(8).optional(),
  contactPhone: z.string().max(30).optional().nullable(),
  contactEmail: z.string().email().max(150).optional().nullable(),
});

const router = Router();

router.post(
  "/",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = createSchema.parse(request.body);
    const result = await businessService.createBusinessAccount(request.auth!.userId, payload);

    // ── AI Trigger: boutique créée → IA Analytics (fire-and-forget) ──
    import("../analytics/ai-trigger.service.js")
      .then((t) => t.onShopCreated(request.auth!.userId, result.id))
      .catch(() => {});

    response.status(201).json(result);
  })
);

router.get(
  "/me",
  requireAuth,
  requireRoles(Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await businessService.getMyBusinessAccount(request.auth!.userId);
    response.json(result);
  })
);

router.patch(
  "/me",
  requireAuth,
  requireRoles(Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = updateSchema.parse(request.body);
    const result = await businessService.updateMyBusinessAccount(request.auth!.userId, payload);
    response.json(result);
  })
);

router.get(
  "/:slug",
  asyncHandler(async (request, response) => {
    const result = await businessService.getPublicBusinessPage(request.params.slug);
    response.json(result);
  })
);

// ── Follow / Unfollow ──
router.post(
  "/:id/follow",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await businessService.followBusiness(request.auth!.userId, request.params.id);
    response.json(result);
  })
);

router.delete(
  "/:id/follow",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await businessService.unfollowBusiness(request.auth!.userId, request.params.id);
    response.json(result);
  })
);

router.get(
  "/:id/follow",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await businessService.isFollowing(request.auth!.userId, request.params.id);
    response.json(result);
  })
);

router.get(
  "/:id/followers-count",
  asyncHandler(async (request, response) => {
    const result = await businessService.getFollowersCount(request.params.id);
    response.json(result);
  })
);

export default router;
