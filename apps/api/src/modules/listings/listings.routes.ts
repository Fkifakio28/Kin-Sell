import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../../shared/auth/auth-middleware.js";
import { Role } from "../../types/roles.js";
import { asyncHandler } from "../../shared/utils/async-handler.js";
import { rateLimit, RateLimits } from "../../shared/middleware/rate-limit.middleware.js";
import { requireNoRestriction } from "../../shared/middleware/trust-guard.middleware.js";
import * as listingsService from "./listings.service.js";
import { getOrCreateDMConversation, sendMessage } from "../messaging/messaging.service.js";

const listingTypeSchema = z.enum(["PRODUIT", "SERVICE"]);
const listingStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED", "DELETED"]);

const createSchema = z.object({
  type: listingTypeSchema,
  title: z.string().min(2).max(140),
  description: z.string().max(1200).optional(),
  category: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  imageUrl: z.string().optional(),
  mediaUrls: z.array(z.string()).optional(),
  priceUsdCents: z.number().int().min(0).optional(),
  stockQuantity: z.number().int().min(0).nullable().optional(),
  serviceDurationMin: z.number().int().min(1).nullable().optional(),
  serviceLocation: z.string().max(40).nullable().optional(),
  isNegotiable: z.boolean().optional(),
});

const updateSchema = z.object({
  title: z.string().min(2).max(140).optional(),
  description: z.string().max(1200).optional(),
  category: z.string().min(2).max(80).optional(),
  city: z.string().min(2).max(80).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  imageUrl: z.string().optional(),
  mediaUrls: z.array(z.string()).optional(),
  priceUsdCents: z.number().int().min(0).optional(),
  stockQuantity: z.number().int().min(0).nullable().optional(),
  serviceDurationMin: z.number().int().min(1).nullable().optional(),
  serviceLocation: z.string().max(40).nullable().optional(),
  isNegotiable: z.boolean().optional(),
});

const searchSchema = z.object({
  q: z.string().min(1).max(140).optional(),
  type: listingTypeSchema.optional(),
  city: z.string().min(2).max(80).optional(),
  country: z.string().min(2).max(80).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(100).optional(),
  limit: z.coerce.number().min(1).max(100).default(24)
});

const myListingsSchema = z.object({
  status: listingStatusSchema.optional(),
  type: listingTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const router = Router();

/* ── Public search ── */
router.get(
  "/search",
  asyncHandler(async (request, response) => {
    const payload = searchSchema.parse(request.query);
    const result = await listingsService.searchListings(payload);
    response.json(result);
  })
);

/* ── Public: latest listings (products / services) ── */
router.get(
  "/latest",
  asyncHandler(async (request, response) => {
    const payload = z.object({
      type: listingTypeSchema.optional(),
      city: z.string().min(2).max(80).optional(),
      country: z.string().min(2).max(80).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(12),
    }).parse(request.query);
    const result = await listingsService.latestListings(payload);
    response.json(result);
  })
);

/* ── Owner: my listings ── */
router.get(
  "/mine",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = myListingsSchema.parse(request.query);
    const result = await listingsService.myListings(request.auth!.userId, payload);
    response.json(result);
  })
);

/* ── Owner: my listing stats ── */
router.get(
  "/mine/stats",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await listingsService.myListingsStats(request.auth!.userId);
    response.json(result);
  })
);

/* ── Owner: get single listing detail ── */
router.get(
  "/mine/:id",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const result = await listingsService.getMyListing(request.auth!.userId, request.params.id);
    response.json(result);
  })
);

/* ── Create listing ── */
router.post(
  "/",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  requireNoRestriction("LISTING_LIMIT"),
  rateLimit(RateLimits.LISTING_CREATE),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = createSchema.parse(request.body);

    // ── ContentGuard: modération IA avant publication ──
    const { analyzeContent } = await import("../sokin/content-guard.service.js");
    const textToAnalyze = [payload.title, payload.description].filter(Boolean).join(" ");
    const guard = await analyzeContent(request.auth!.userId, textToAnalyze, "listing");
    if (guard.verdict === "BLOCK") {
      response.status(422).json({
        error: guard.warningMessage ?? "Publication refusée par le système de modération.",
        triggers: guard.triggers,
        score: guard.score,
      });
      return;
    }

    const result = await listingsService.createListing(request.auth!.userId, payload);

    if (guard.verdict === "WARN") {
      response.status(201).json({ ...result, _contentWarning: guard.warningMessage });
    } else {
      response.status(201).json(result);
    }
  })
);

/* ── Update listing ── */
router.patch(
  "/:id",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const payload = updateSchema.parse(request.body);

    // ── ContentGuard: modération IA sur les champs texte modifiés ──
    const textParts = [payload.title, payload.description].filter(Boolean);
    if (textParts.length > 0) {
      const { analyzeContent } = await import("../sokin/content-guard.service.js");
      const guard = await analyzeContent(request.auth!.userId, textParts.join(" "), "listing");
      if (guard.verdict === "BLOCK") {
        response.status(422).json({
          error: guard.warningMessage ?? "Modification refusée par le système de modération.",
          triggers: guard.triggers,
          score: guard.score,
        });
        return;
      }

      const result = await listingsService.updateListing(request.auth!.userId, request.params.id, payload);
      if (guard.verdict === "WARN") {
        response.json({ ...result, _contentWarning: guard.warningMessage });
      } else {
        response.json(result);
      }
      return;
    }

    const result = await listingsService.updateListing(request.auth!.userId, request.params.id, payload);
    response.json(result);
  })
);

/* ── Change status (activate / deactivate / archive / delete) ── */
router.patch(
  "/:id/status",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { status } = z.object({ status: listingStatusSchema }).parse(request.body);
    const result = await listingsService.changeListingStatus(request.auth!.userId, request.params.id, status);
    response.json(result);
  })
);

/* ── Update stock ── */
router.patch(
  "/:id/stock",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { stockQuantity } = z.object({ stockQuantity: z.number().int().min(0).nullable() }).parse(request.body);
    const result = await listingsService.updateStock(request.auth!.userId, request.params.id, stockQuantity);
    response.json(result);
  })
);

/* ── IA: Conseil de prix pour une annonce ── */
router.get(
  "/:id/price-advice",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { getPriceAdvice } = await import("./price-advisor.service.js");
    const advice = await getPriceAdvice(request.params.id);
    response.json(advice);
  })
);

/* ── IA: Rapport qualité d'une annonce ── */
router.get(
  "/:id/quality",
  requireAuth,
  requireRoles(Role.USER, Role.BUSINESS),
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { getListingQuality } = await import("./listing-quality.service.js");
    const report = await getListingQuality(request.params.id);
    response.json(report);
  })
);

// ── Locked categories (public — no auth required) ──
router.get("/locked-categories", asyncHandler(async (_req, res) => {
  const { prisma } = await import("../../shared/db/prisma.js");
  const rules = await prisma.categoryNegotiationRule.findMany({
    where: { negotiationLocked: true },
    select: { category: true },
  });
  res.json(rules.map((r: { category: string }) => r.category));
}));

/* ── Contact vendeur depuis un listing (crée un DM + message initial) ── */
router.post(
  "/:id/contact",
  requireAuth,
  asyncHandler(async (request: AuthenticatedRequest, response) => {
    const { prisma } = await import("../../shared/db/prisma.js");
    const listing = await prisma.listing.findUnique({
      where: { id: request.params.id },
      select: { id: true, title: true, ownerUserId: true, priceUsdCents: true },
    });
    if (!listing) {
      response.status(404).json({ error: "Annonce introuvable" });
      return;
    }
    if (listing.ownerUserId === request.auth!.userId) {
      response.status(400).json({ error: "Vous ne pouvez pas vous contacter vous-même" });
      return;
    }

    // Créer ou récupérer la conversation DM
    const conversation = await getOrCreateDMConversation(request.auth!.userId, listing.ownerUserId);

    // Envoyer un message initial automatique avec le contexte du listing
    const initialMessage = `📦 Bonjour ! Je suis intéressé(e) par votre annonce "${listing.title}" (${(listing.priceUsdCents / 100).toFixed(2)} $).`;
    await sendMessage(conversation.id, request.auth!.userId, {
      content: initialMessage,
      type: "TEXT" as any,
    });

    response.json({
      conversationId: conversation.id,
      listingId: listing.id,
      sellerUserId: listing.ownerUserId,
      message: "Conversation créée. Vous pouvez discuter avec le vendeur.",
    });
  })
);

export default router;
