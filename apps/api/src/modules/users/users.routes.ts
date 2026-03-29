import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import * as usersService from "./users.service.js";

const updateMeSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  avatarUrl: z.string().url().optional(),
  city: z.string().min(2).max(80).optional(),
  country: z.string().min(2).max(80).optional(),
  bio: z.string().max(500).optional(),
  domain: z.string().max(100).optional(),
  qualification: z.string().max(150).optional(),
  experience: z.string().max(80).optional(),
  workHours: z.string().max(80).optional()
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

router.get("/public/:username", asyncHandler(async (request, response) => {
  const result = await usersService.getPublicProfileByUsername(request.params.username);
  response.json(result);
}));

router.get("/:id/public", asyncHandler(async (request, response) => {
  const result = await usersService.getPublicProfile(request.params.id);
  response.json(result);
}));

export default router;
