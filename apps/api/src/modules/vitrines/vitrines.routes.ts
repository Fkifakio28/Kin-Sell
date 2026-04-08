import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import * as vitrinesService from "./vitrines.service.js";

const createSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
  mediaUrl: z.string().min(1),
});

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  mediaUrl: z.string().min(1).optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)),
});

const router = Router();

// GET /vitrines/user/:userId — vitrines publiques d'un utilisateur
router.get(
  "/user/:userId",
  asyncHandler(async (req, res) => {
    const result = await vitrinesService.getVitrinesForUser(req.params.userId);
    res.json(result);
  })
);

// GET /vitrines/me — mes vitrines (auth)
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await vitrinesService.getVitrinesForUser(req.auth!.userId);
    res.json(result);
  })
);

// POST /vitrines — créer une vitrine (auth)
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = createSchema.parse(req.body);
    const result = await vitrinesService.createVitrine(req.auth!.userId, body);
    res.status(201).json(result);
  })
);

// PATCH /vitrines/:id — modifier une vitrine (auth)
router.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = updateSchema.parse(req.body);
    const result = await vitrinesService.updateVitrine(req.auth!.userId, req.params.id, body);
    res.json(result);
  })
);

// DELETE /vitrines/:id — supprimer une vitrine (auth)
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await vitrinesService.deleteVitrine(req.auth!.userId, req.params.id);
    res.json(result);
  })
);

// PUT /vitrines/reorder — réordonner les vitrines (auth)
router.put(
  "/reorder",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = reorderSchema.parse(req.body);
    const result = await vitrinesService.reorderVitrines(req.auth!.userId, body.orderedIds);
    res.json(result);
  })
);

export default router;
