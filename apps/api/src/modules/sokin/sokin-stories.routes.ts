import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { createStory, deleteStory, getFeedStories, viewStory } from "./sokin-stories.service.js";
import { emitToAll } from "../messaging/socket.js";

const createStorySchema = z.object({
  mediaUrl: z.string().optional(),
  mediaType: z.enum(["IMAGE", "VIDEO", "TEXT"]).optional(),
  caption: z.string().max(180).optional(),
  bgColor: z.string().max(30).optional(),
});

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    let viewerUserId: string | undefined;
    if (token) {
      try {
        const { verifyAccessToken } = await import("../../shared/auth/jwt.js");
        const payload = verifyAccessToken(token);
        viewerUserId = payload.sub;
      } catch {
        // Ignore invalid token for public feed.
      }
    }
    const stories = await getFeedStories(viewerUserId);
    res.json({ stories });
  })
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const data = createStorySchema.parse(req.body);
    const story = await createStory(req.auth!.userId, data);
    emitToAll("sokin:story-created", {
      type: "SOKIN_STORY_CREATED",
      storyId: story.id,
      authorId: story.authorId,
      createdAt: story.createdAt.toISOString(),
      sourceUserId: req.auth!.userId,
    });
    res.status(201).json(story);
  })
);

router.post(
  "/:id/view",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await viewStory(req.params.id, req.auth!.userId);
    res.json(result);
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await deleteStory(req.params.id, req.auth!.userId);
    res.json(result);
  })
);

export default router;
