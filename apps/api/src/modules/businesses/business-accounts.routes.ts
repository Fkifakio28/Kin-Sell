import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import * as businessService from "./business-accounts.service.js";

const createSchema = z.object({
  legalName: z.string().min(2).max(150),
  publicName: z.string().min(2).max(150),
  description: z.string().max(800).optional(),
  city: z.string().min(2).max(80).optional()
});

const updateSchema = z.object({
  legalName: z.string().min(2).max(150).optional(),
  publicName: z.string().min(2).max(150).optional(),
  description: z.string().max(800).optional(),
  city: z.string().min(2).max(80).optional(),
  address: z.string().max(200).optional(),
  coverImage: z.string().url().optional(),
  logo: z.string().url().optional(),
  publicDescription: z.string().max(800).optional(),
  active: z.boolean().optional()
});

const router = Router();

router.post(
  "/",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = createSchema.parse(request.body);
    const result = await businessService.createBusinessAccount(request.auth!.userId, payload);
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

export default router;
